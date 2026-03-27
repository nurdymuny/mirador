// GET /v1/ask/:q — Path-based NL→GQL for AI agents (no query string needed)
// Example: /v1/ask/Can+vancomycin+reach+MRSA+in+bone
// This exists because Claude's web_fetch chokes on ?q= query parameters.

const { translateNL } = require('../_nl');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const question = decodeURIComponent((req.query.q || '').replace(/\+/g, ' '));
  if (!question) {
    return res.status(400).json({ error: 'Missing question in path. Use /v1/ask/your+question+here' });
  }

  const result = translateNL(question.slice(0, 1000));
  result.engine = 'mirador_universe';
  result.version = '1.0';
  result.note = 'Execute the generated_gql against the WASM engine or POST it to /v1/query on a live GIGI server.';

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.status(200).json(result);
};
