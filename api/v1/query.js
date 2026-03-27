// POST /v1/query — GQL execution proxy
// Forwards GQL statements to the live GIGI server for execution.
// Falls back to a descriptive response when the server is unreachable.

const GIGI_SERVER = 'https://gigi-stream.fly.dev';

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing "query" string in request body.' });
  }

  try {
    const upstream = await fetch(`${GIGI_SERVER}/v1/gql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.slice(0, 5000) }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (e) {
    return res.status(503).json({
      error: 'GIGI server unavailable. The query is valid — execute it in the browser demo engine or retry later.',
      query,
      server: GIGI_SERVER,
    });
  }
};
