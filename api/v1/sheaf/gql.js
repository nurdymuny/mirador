// POST /v1/sheaf/gql — Server-side GQL proxy to GIGI (avoids browser CORS)
// Body: { query: "COVER ..." }
// Returns GIGI's JSON response directly

const GIGI_HOST = 'https://gigi-stream.fly.dev';
const GIGI_API_KEY = (process.env.GIGI_API_KEY || '').trim();
const MAX_RETRIES = 2;
const RETRY_DELAYS = [1500, 3000];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || query.length > 2000) {
    return res.status(400).json({ error: 'Missing or invalid query' });
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
