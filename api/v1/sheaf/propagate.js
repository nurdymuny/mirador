// POST /v1/sheaf/propagate — Server-side sheaf propagation using GIGI data
// Determines which other cells become completable after hypothetical measurement
// Body: { drugId, tissueId, drugClass }

const GIGI_HOST = 'https://gigi-stream.fly.dev';
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1500, 3000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TISSUE_TO_COMPARTMENT = {
  bone: 'bone',
  csf: 'csf_uninflamed',
  caseum: 'granuloma_cellular',
  biofilm: 'planktonic',
  prostate: 'prostate',
};

const TISSUES = ['bone', 'csf', 'caseum', 'biofilm', 'prostate'];

async function gigiCover(query) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const resp = await fetch(`${GIGI_HOST}/v1/gql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (resp.status === 503 && attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.rows || [];
    } catch {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAYS[attempt]); continue; }
      return [];
    }
  }
  return [];
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { drugId, tissueId, drugClass } = req.body || {};
  if (!drugId || !tissueId || typeof drugId !== 'string' || typeof tissueId !== 'string') {
    return res.status(400).json({ error: 'Missing drugId or tissueId' });
  }
  if (drugId.length > 20 || tissueId.length > 30 || (drugClass && drugClass.length > 30)) {
    return res.status(400).json({ error: 'Invalid parameter length' });
  }

  const cls = drugClass ? drugClass.toLowerCase() : null;

  try {
    // Batch-fetch all data we need: same drug (all tissues) + same class (all tissues)
    const queries = [
      gigiCover(`COVER mirador_drugs ON drug_name='${drugId}' FIRST 100`),
    ];
    if (cls) {
      queries.push(gigiCover(`COVER mirador_drugs ON drug_class='${cls}' FIRST 200`));
    }
    const [allDrugRows, allClassRows = []] = await Promise.all(queries);

    // Find which compartments this drug already has data for
    const measuredComps = new Set(
      allDrugRows.filter(r => r.r_penetration != null).map(r => r.compartment)
    );

    const cascades = [];

    // For each tissue that's NOT the source and NOT already measured, try sheaf extension
    for (const tid of TISSUES) {
      if (tid === tissueId) continue;
      const comp = TISSUE_TO_COMPARTMENT[tid] || tid;
      if (measuredComps.has(comp)) continue;

      const neighbors = [];

      // Same drug at other compartments → weight 0.3
      for (const r of allDrugRows) {
        if (r.compartment !== comp && r.r_penetration != null) {
          neighbors.push({ value: r.r_penetration, weight: 0.3 });
        }
      }

      // Same class at this compartment → weight 0.4
      for (const r of allClassRows) {
        if (r.drug_name !== drugId && r.compartment === comp && r.r_penetration != null) {
          neighbors.push({ value: r.r_penetration, weight: 0.4 });
        }
      }

      if (neighbors.length === 0) continue;

      const sumW = neighbors.reduce((s, n) => s + n.weight, 0);
      const predicted = neighbors.reduce((s, n) => s + n.weight * n.value, 0) / sumW;
      const conf = +(sumW / (sumW + 1)).toFixed(4);

      cascades.push({
        drug_name: drugId,
        compartment: tid,
        new_value: +predicted.toFixed(4),
        confidence: conf,
        uncertainty: +(1 - conf).toFixed(4),
        depth: 1,
      });
    }

    return res.json({
      cascades,
      total_affected: cascades.length,
      source: `${drugId}@${tissueId}`,
    });
  } catch (err) {
    return res.status(502).json({ error: 'GIGI unreachable', detail: err.message });
  }
};
