// POST /v1/ask — Natural Language → GQL translation
// Accepts a plain-text clinical question, returns the generated GQL + entities.
// Execution requires the WASM engine (client-side or gigi-stream server).

const { translateNL } = require('./_nl');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { question, context } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing "question" string in request body.' });
  }

  const result = translateNL(question.slice(0, 1000));
  result.engine = 'mirador_universe';
  result.note = 'Execute the generated_gql against the WASM engine or POST it to /v1/query on a live GIGI server.';

  return res.status(200).json(result);
};
