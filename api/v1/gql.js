// POST /v1/gql — Authenticated, read-only proxy to the GIGI fiber-bundle engine.
//
// Why this exists: the public Explorer (GigiExplorer.jsx) needs to query the
// licensed live bundles (ChEMBL, BindingDB, ClinicalTrials, PharmGKB) which are
// NOT shipped in the in-browser seed. GIGI now requires an X-API-Key on /v1/gql.
// That key is write-capable, so it must never reach the browser. This function
// holds it server-side (process.env.GIGI_API_KEY) and forwards ONLY read queries.
//
// Body: { query: "COVER ..." }  → returns GIGI's JSON response verbatim.

const GIGI_HOST = (process.env.GIGI_URL || 'https://gigi-stream.fly.dev').trim();
const GIGI_API_KEY = (process.env.GIGI_API_KEY || '').trim();
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1500, 3000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Whitelist of read-only GQL verbs. Every statement in the query must begin with
// one of these, or the request is rejected — so the write-capable key can never
// run a mutation (INSERT/UPDATE/DELETE/CREATE/DROP/ALTER/SET/REDEFINE/...).
const READ_VERBS = new Set([
  'COVER', 'DESCRIBE', 'SHOW', 'SECTION', 'CURVATURE', 'SPECTRAL', 'CONSISTENCY',
  'INTEGRATE', 'EVALUATE', 'COMBINE', 'DECOMPOSE', 'COMPARE', 'EXPLAIN', 'ATLAS',
  'CAPACITY', 'CONFIDENCE', 'CORRELATE', 'PROJECT', 'PREDICT', 'SEGMENT',
  'GEODESIC', 'TRANSPORT', 'PULLBACK', 'WILSON', 'HEALTH',
]);

function isReadOnly(query) {
  const stmts = query.split(';').map((s) => s.trim()).filter(Boolean);
  if (stmts.length === 0) return false;
  for (const s of stmts) {
    const cleaned = s.replace(/^(?:--[^\n]*\n?)+/, '').trim(); // strip leading line comments
    const first = (cleaned.match(/^[A-Za-z_]+/) || [''])[0].toUpperCase();
    if (!READ_VERBS.has(first)) return false;
  }
  return true;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!GIGI_API_KEY) {
    return res.status(500).json({ error: 'GIGI_API_KEY is not configured on the server' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || query.length > 4000) {
    return res.status(400).json({ error: 'Missing or invalid query' });
  }
  if (!isReadOnly(query)) {
    return res.status(403).json({ error: 'Only read queries are permitted through this endpoint' });
  }

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
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
      const data = await resp.json();
      return res.status(resp.status).json(data);
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAYS[attempt]); continue; }
    }
  }
  return res.status(502).json({ error: 'GIGI unreachable', detail: lastErr?.message });
};
