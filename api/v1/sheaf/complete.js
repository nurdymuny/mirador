// POST /v1/sheaf/complete — Server-side sheaf completion using GIGI data
// Fetches neighbor data from GIGI via COVER, computes sheaf extension
// Body: { drugId, tissueId, drugClass }

const GIGI_HOST = 'https://gigi-stream.fly.dev';
const GIGI_API_KEY = (process.env.GIGI_API_KEY || '').trim();
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
        headers: { 'Content-Type': 'application/json', 'X-API-Key': GIGI_API_KEY },
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

  const comp = TISSUE_TO_COMPARTMENT[tissueId] || tissueId;
  const cls = drugClass ? drugClass.toLowerCase() : null;

  try {
    // Fetch neighbor data from GIGI in parallel
    const queries = [
      gigiCover(`COVER mirador_drugs ON drug_name='${drugId}' FIRST 50`),
    ];
    if (cls) {
      queries.push(
        gigiCover(`COVER mirador_drugs ON drug_class='${cls}' AND compartment='${comp}' FIRST 50`)
      );
    }
    const [sameDrugRows, sameClassRows = []] = await Promise.all(queries);

    const neighbors = [];

    // Same drug at other compartments → weight 0.3
    for (const r of sameDrugRows) {
      if (r.compartment !== comp && r.r_penetration != null) {
        neighbors.push({
          from: r.drug_name, adjacency: r.compartment,
          value: r.r_penetration, weight: 0.3,
        });
      }
    }

    // Same class at target compartment → weight 0.4
    for (const r of sameClassRows) {
      if (r.drug_name !== drugId && r.r_penetration != null) {
        neighbors.push({
          from: r.drug_name, adjacency: r.compartment,
          value: r.r_penetration, weight: 0.4,
        });
      }
    }

    // Second-order: same class at any compartment if no first-order neighbors
    if (neighbors.length === 0 && cls) {
      const crossRows = await gigiCover(
        `COVER mirador_drugs ON drug_class='${cls}' FIRST 100`
      );
      for (const r of crossRows) {
        if (r.drug_name !== drugId && r.r_penetration != null) {
          neighbors.push({
            from: r.drug_name, adjacency: r.compartment,
            value: r.r_penetration, weight: 0.15,
          });
        }
      }
    }

    if (neighbors.length === 0) {
      return res.json({ completed: [], _noData: true });
    }

    const sumW = neighbors.reduce((s, n) => s + n.weight, 0);
    const predicted = neighbors.reduce((s, n) => s + n.weight * n.value, 0) / sumW;
    const conf = +(sumW / (sumW + 1)).toFixed(4);

    return res.json({
      completed: [{
        value: +predicted.toFixed(4),
        confidence: conf,
        uncertainty: +(1 - conf).toFixed(4),
        method: 'laplacian_schur',
        neighbor_count: neighbors.length,
        origin: 'gigi_sheaf_extension',
      }],
      constraint_graph: neighbors,
    });
  } catch (err) {
    return res.status(502).json({ error: 'GIGI unreachable', detail: err.message });
  }
};
