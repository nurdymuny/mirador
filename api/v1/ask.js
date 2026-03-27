// POST /v1/ask — Natural Language → GQL translation
// Accepts a plain-text clinical question, returns the generated GQL + entities.
// v1.0: Falls back to Claude/Gemini when regex returns clarification_needed.

const { translateNL } = require('./_nl');

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
  // Try Claude first, then Gemini
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

  return null; // No LLM key configured or both failed
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'GET or POST only' });
  }

  // GET /v1/ask?q=... for AI agents that can only fetch URLs
  // POST /v1/ask { question: "..." } for full-featured clients
  const question = req.method === 'GET'
    ? req.query?.q
    : req.body?.question;
  const patient = req.method === 'GET' ? undefined : req.body?.patient;

  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing question. GET: ?q=... or POST: {"question":"..."}' });
  }

  const q = question.slice(0, 1000);

  // Stage 1: Try regex (free, instant, deterministic)
  let result = translateNL(q);

  // Stage 2: If regex can't parse, try LLM fallback
  if (result.status === 'clarification_needed' && (process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY)) {
    const llmResult = await llmFallback(q);
    if (llmResult && llmResult.status === 'ok') {
      result = llmResult;
    }
  }

  result.engine = 'mirador_universe';
  result.version = '1.0';
  if (patient) result.patient = patient;
  result.note = 'Execute the generated_gql against the WASM engine or POST it to /v1/query on a live GIGI server.';

  return res.status(200).json(result);
};
