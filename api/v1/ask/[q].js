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

  // Multi-disease queries: run per-disease, merge results
  const { diseases, tissues } = t.entities;
  if (diseases.length >= 2 && (t.intent === 'drug_ranking' || t.intent === 'cure_feasibility')) {
    const NL_DEFAULT_TISSUE = { mrsa:'bone', tb:'granuloma_lung', hiv:'cns', meningitis:'csf_inflamed' };
    const THRESHOLDS = { mrsa:5.0, tb:0.50, hiv:1.0, meningitis:0.50 };
    const tissue = tissues[0];
    const allRows = [];
    const gqls = [];
    for (const dis of diseases) {
      const tis = tissue || NL_DEFAULT_TISSUE[dis];
      const gql = `COVER ON mirador_universe WHERE disease = '${dis}'${tis ? ` AND tissue = '${tis}'` : ''} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE`;
      gqls.push(gql);
      const res2 = universeGQL(gql, UNIVERSE);
      if (res2?.rows) {
        const thresh = THRESHOLDS[dis] ?? 5.0;
        for (const row of res2.rows) allRows.push({ ...row, disease: dis, threshold: thresh });
      }
    }
    allRows.sort((a, b) => b.C - a.C);
    const mergedResult = { count: allRows.length, rows: allRows, meta: { source: 'mirador_universe', mode: 'evaluate_coherence', multi_disease: true } };
    const mergedGql = gqls.join('\n-- UNION --\n');
    const answer = generateAnswer(question, t.intent, t.entities, mergedGql, mergedResult);
    answer.engine = 'mirador_universe';
    answer.version = '1.0';
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json(answer);
  }

  // Execute the GQL against the pre-built universe
  const result = universeGQL(t.generated_gql, UNIVERSE);
  const answer = generateAnswer(question, t.intent, t.entities, t.generated_gql, result);

  answer.engine = 'mirador_universe';
  answer.version = '1.0';

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  return res.status(200).json(answer);
};
