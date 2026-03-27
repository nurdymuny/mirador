// GET /v1/ask/:q — Path-based NL→GQL→Answer for AI agents
// Example: /v1/ask/Can+vancomycin+reach+MRSA+in+bone
// Returns the GQL AND the executed result with a natural-language answer.

const { translateNL } = require('../_nl');
const { universeGQL, generateAnswer } = require('../_engine');
const UNIVERSE = require('../_universe.json');

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const question = decodeURIComponent((req.query.q || '').replace(/\+/g, ' '));
  if (!question) {
    return res.status(400).json({ error: 'Missing question in path. Use /v1/ask/your+question+here' });
  }

  const t = translateNL(question.slice(0, 1000));

  // If NL translation didn't produce a GQL, return as-is (clarification, error, etc.)
  if (t.status !== 'ok') {
    t.engine = 'mirador_universe';
    t.version = '1.0';
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json(t);
  }

  // Execute the GQL against the pre-built universe
  const result = universeGQL(t.generated_gql, UNIVERSE);
  const answer = generateAnswer(question, t.intent, t.entities, t.generated_gql, result);

  answer.engine = 'mirador_universe';
  answer.version = '1.0';

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.status(200).json(answer);
};
