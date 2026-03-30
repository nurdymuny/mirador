// POST /v1/sheaf/gql — Server-side GQL proxy to GIGI (avoids browser CORS)
// Body: { query: "COVER ..." }
// Returns GIGI's JSON response directly

const GIGI_HOST = 'https://gigi-stream.fly.dev';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || query.length > 2000) {
    return res.status(400).json({ error: 'Missing or invalid query' });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const resp = await fetch(`${GIGI_HOST}/v1/gql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const data = await resp.json();
    return res.status(resp.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'GIGI unreachable', detail: err.message });
  }
};
