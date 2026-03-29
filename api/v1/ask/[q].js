// /v1/ask/:q — NL→GQL→Answer
// Supports:
//   GET  /v1/ask/Can+vancomycin+reach+MRSA+in+bone  (path param)
//   GET  /v1/ask?q=Can+vancomycin+reach+MRSA+in+bone (query param)
//   POST /v1/ask  { "question": "..." }               (body)

const { translateNL } = require('../_nl');
const { universeGQL, generateAnswer } = require('../_engine');
const { NL_DEFAULT_TISSUE, getThresholdForDisease } = require('../_shared');
const UNIVERSE = require('../_universe.json');

// GQL reference for LLM system prompt
const GQL_SYSTEM_PROMPT = `You are the MIRADOR GQL translator. Given a clinical pharmacology question, extract the intent and entities, then generate a GQL statement.

Valid intents: single_drug_check, drug_ranking, combination_query, failure_diagnosis, comparison, data_quality, cure_feasibility, predict_unmeasured, cascade_analysis.

Valid drugs: VAN, RIF, LZD, CRO, DAP, CAR, CLI, DTG, TFV, FTC, DRV, EFV, INH, PZA, EMB, MXF, BDQ, TDZ.
Valid diseases: mrsa, tb, hiv, meningitis.
Valid tissues: bone, planktonic, csf_inflamed, csf_uninflamed, cns, lymph_node, galt, genital_tract, bone_marrow, granuloma_lung, granuloma_cellular, granuloma_necrotic, granuloma_cavity.

GQL templates:
- DECOMPOSE mirador_universe ON drug = 'X' AND tissue = 'Y'
- COVER ON mirador_universe WHERE disease = 'X' AND tissue = 'Y' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE
- COMPARE ['X', 'Y'] ON mirador_universe WHERE tissue = 'Z'
- COVER ON mirador_universe WHERE ... COMBINE 'X', 'Y' MODE COUPLED SYNERGY 1.2 EVALUATE coherence WITH CONFIDENCE, PROVENANCE
- COMPLETE ON mirador_universe WHERE drug = 'X' AND tissue = 'Y' METHOD sheaf_extension
- PROPAGATE ON mirador_universe ASSUMING drug = 'X' AND tissue = 'Y' SHOW newly_determined

Return ONLY valid JSON: {"intent": "...", "entities": {"drugs": [...], "diseases": [...], "tissues": [...]}, "generated_gql": "..."}`;

async function llmFallback(question) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (anthropicKey) {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: GQL_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Translate this clinical question to GQL.\nQuestion: ${question}` }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const text = data.content?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { status: 'ok', ...parsed, source: 'claude' };
        }
      }
    } catch (_) { /* fall through to Gemini */ }
  }

  if (geminiKey) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: GQL_SYSTEM_PROMPT }] },
            contents: [{ parts: [{ text: `Translate this clinical question to GQL.\nQuestion: ${question}` }] }],
            generationConfig: { maxOutputTokens: 500, temperature: 0 },
          }),
          signal: AbortSignal.timeout(8000),
        }
      );
      if (resp.ok) {
        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { status: 'ok', ...parsed, source: 'gemini' };
        }
      }
    } catch (_) { /* no LLM available */ }
  }

  return null;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Extract question from path param, query param, or POST body
  let question;
  if (req.query.q) {
    question = decodeURIComponent(req.query.q.replace(/\+/g, ' '));
  } else if (req.method === 'POST' && req.body?.question) {
    question = req.body.question;
  }

  if (!question) {
    return res.status(400).json({ error: 'Missing question. Use /v1/ask/your+question+here or POST {"question":"..."}' });
  }

  // Stage 1: regex NL translation (free, instant)
  let t = translateNL(question.slice(0, 1000));

  // Stage 2: LLM fallback when regex can't parse
  if (t.status === 'clarification_needed' && (process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY)) {
    const llmResult = await llmFallback(question.slice(0, 1000));
    if (llmResult && llmResult.status === 'ok') {
      t = llmResult;
    }
  }

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
    const tissue = tissues[0];
    const allRows = [];
    const gqls = [];
    for (const dis of diseases) {
      const tis = tissue || NL_DEFAULT_TISSUE[dis];
      const gql = `COVER ON mirador_universe WHERE disease = '${dis}'${tis ? ` AND tissue = '${tis}'` : ''} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE`;
      gqls.push(gql);
      const res2 = universeGQL(gql, UNIVERSE);
      if (res2?.rows) {
        const thresh = getThresholdForDisease(dis);
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
