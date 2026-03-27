// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mirador_universe engine — WASM-backed GQL core
// Math lives in Rust (mirador-universe crate) → no formulas in JS.
// JS handles: data ops (filter/sort/project), GQL parsing, orchestration.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import init, {
  initSync,
  wasm_build_universe,
  wasm_combine_drugs,
} from './mirador_universe/mirador_universe_wasm.js';

/**
 * Async init — call from React useEffect or browser context.
 * @param {string} [wasmPath] URL to .wasm file (default: auto-detect via import.meta.url)
 */
export async function initEngine(wasmPath) {
  await init(wasmPath);
}

/**
 * Sync init — call from vitest/Node with a WASM buffer.
 * @param {BufferSource} wasmBuffer
 */
export function initEngineSync(wasmBuffer) {
  initSync({ module: wasmBuffer });
}

// ── WASM-backed: math computed in Rust ─────────────────────────────

/**
 * Build the mirador_universe via Rust/WASM.
 * All coherence, tau, K_pathway math happens in the Rust crate.
 */
export function buildUniverse(drugs, thresholds, regimens) {
  const json = wasm_build_universe(JSON.stringify({ drugs, thresholds, regimens }));
  return JSON.parse(json);
}

/**
 * Combine drugs via Rust/WASM (uses combinePotency formula from Rust).
 */
export function combineDrugs(universe, drugNames, tissue, synergyFactor = 1.0) {
  const json = wasm_combine_drugs(JSON.stringify({
    universe, drugs: drugNames, tissue, synergy_factor: synergyFactor,
  }));
  const result = JSON.parse(json);
  if (result.error) return null;
  return result;
}

// ── JS-only: data operations (no formulas) ────────────────────────

/**
 * COVER ... WHERE ... EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE
 *
 * Filters universe by pathogen + tissue + context, computes coherence,
 * ranks, and attaches confidence + provenance.
 */
export function coverEvaluate(universe, filters, options = {}) {
  let results = [...universe];

  // Apply filters
  for (const [key, value] of Object.entries(filters)) {
    results = results.filter(r => String(r[key]).toLowerCase() === String(value).toLowerCase());
  }

  // Rank by coherence descending (or custom field)
  const rankField = options.rankBy || 'C';
  const rankDir = options.rankDir || 'DESC';
  results.sort((a, b) => rankDir === 'DESC' ? b[rankField] - a[rankField] : a[rankField] - b[rankField]);

  // Attach ≥θ indicator
  results = results.map(r => ({
    drug: r.drug,
    C: r.C,
    '≥θ': r.crossesThreshold ? 'yes' : 'no',
    K_pathway: r.K_pathway,
    confidence: r.confidence,
    provenance: r.provenance,
  }));

  return results;
}

// ── DECOMPOSE — full impedance breakdown ───────────────────────────

/**
 * DECOMPOSE: returns the full impedance stack for a single drug at a tissue.
 * Used by AI agents to understand WHY a drug fails or succeeds at a site.
 */
export function decompose(universe, { drug, tissue }) {
  const record = universe.find(r =>
    r.drug.toLowerCase() === drug.toLowerCase() &&
    r.tissue.toLowerCase() === tissue.toLowerCase()
  );
  if (!record) return null;

  const k_admet = record.k_admet || 0;
  const k_barrier = record.k_barrier || 0;
  const k_biofilm = record.k_biofilm || 0;
  const K_total = +(k_admet + k_barrier + k_biofilm).toFixed(4);

  // Find dominant barrier
  const barriers = { k_admet, k_barrier, k_biofilm };
  const dominant_barrier = Object.entries(barriers).sort((a, b) => b[1] - a[1])[0][0];

  const threshold = 5.0;

  return {
    drug: record.drug,
    tissue: record.tissue,
    tau: record.tau,
    C: record.C,
    decomposition: { k_admet, k_barrier, k_biofilm, K_total },
    dominant_barrier,
    geometric_verdict: record.C >= threshold ? 'meets_threshold' : 'fails_threshold',
    threshold,
    raw: {
      auc_24: record.auc_24,
      mic: record.mic,
      r_penetration: record.r_penetration,
    },
  };
}

// ── COMPARE — head-to-head drug comparison ─────────────────────────

/**
 * compareDrugs: rank multiple drugs at the same tissue by coherence.
 * Returns a comparison object with winner, advantage, and per-barrier wins.
 */
export function compareDrugs(universe, drugNames, tissue) {
  if (!drugNames || drugNames.length === 0) return null;

  const matched = drugNames.map(name =>
    universe.find(r =>
      r.drug.toLowerCase() === name.toLowerCase() &&
      r.tissue.toLowerCase() === tissue.toLowerCase()
    )
  ).filter(Boolean);

  if (matched.length === 0) return null;

  // Build entries with full impedance info
  const entries = matched.map(r => ({
    drug: r.drug,
    C: r.C,
    tau: r.tau,
    k_admet: r.k_admet || 0,
    k_barrier: r.k_barrier || 0,
    k_biofilm: r.k_biofilm || 0,
  }));

  // Sort by C descending, assign rank
  entries.sort((a, b) => b.C - a.C);
  entries.forEach((e, i) => { e.rank = i + 1; });

  const winner = entries[0].drug;

  // Advantage description
  const advantage = entries.length >= 2
    ? `${(entries[0].C / entries[1].C).toFixed(2)}× higher coherence`
    : 'single drug';

  // Per-barrier wins: for each barrier, which drug leads
  const barrierKeys = ['tau', 'k_admet', 'k_barrier', 'k_biofilm'];
  const per_barrier_wins = {};
  for (const key of barrierKeys) {
    // For tau, higher is better; for k_* lower impedance is better
    const best = key === 'tau'
      ? entries.reduce((a, b) => a.tau >= b.tau ? a : b)
      : entries.reduce((a, b) => a[key] <= b[key] ? a : b);
    per_barrier_wins[key] = best.drug;
  }

  return { drugs: entries, winner, advantage, per_barrier_wins };
}

// ── BATCH — multi-query execution ──────────────────────────────────

/**
 * batchGQL: execute an array of {id, query} objects against an executor function.
 * Supports fail_strategy: 'continue' (default) or 'stop'.
 */
export function batchGQL(queries, executor, failStrategy = 'continue') {
  if (queries.length > 20) {
    return { status: 'error', message: 'Batch limited to 20 queries' };
  }

  const start = Date.now();
  const results = [];

  for (const q of queries) {
    const result = executor(q.query);
    if (result && result.error) {
      results.push({ id: q.id, status: 'error', error: result.error });
      if (failStrategy === 'stop') break;
    } else {
      results.push({ id: q.id, status: 'ok', data: result });
    }
  }

  return {
    status: 'ok',
    results,
    total_time_ms: Date.now() - start,
  };
}

// ── Extended demo GQL parser ───────────────────────────────────────

/**
 * Parse and execute advanced GQL queries against the universe.
 * Extends the basic demoGQL with EVALUATE, RANK BY, COMBINE, etc.
 */
export function universeGQL(query, universe) {
  const q = query.trim().replace(/;$/, '').trim();
  const up = q.toUpperCase();
  let m;

  // COVER ON mirador_universe WHERE pathogen = 'X' AND tissue = 'Y' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE
  if ((m = q.match(/^COVER\s+ON\s+mirador_universe\s+WHERE\s+(.+?)\s+EVALUATE\s+coherence\s+RANK\s+BY\s+coherence\s+(ASC|DESC)\s+WITH\s+CONFIDENCE\s*,\s*PROVENANCE$/i))) {
    const filterStr = m[1];
    const dir = m[2].toUpperCase();
    const filters = {};

    // Parse AND-separated conditions: field = 'value'
    const conditions = filterStr.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    }

    const results = coverEvaluate(universe, filters, { rankBy: 'C', rankDir: dir });
    return { count: results.length, rows: results, meta: { source: 'mirador_universe', mode: 'evaluate_coherence' } };
  }

  // COVER ON mirador_universe WHERE ... COMBINE 'drug1', 'drug2' MODE COUPLED SYNERGY <n> EVALUATE coherence WITH CONFIDENCE, PROVENANCE
  if ((m = q.match(/^COVER\s+ON\s+mirador_universe\s+WHERE\s+(.+?)\s+COMBINE\s+'([^']+)'\s*,\s*'([^']+)'\s+MODE\s+COUPLED\s+SYNERGY\s+([\d.]+)\s+EVALUATE\s+coherence\s+WITH\s+CONFIDENCE\s*,\s*PROVENANCE$/i))) {
    const filterStr = m[1];
    const drug1 = m[2], drug2 = m[3];
    const synergy = parseFloat(m[4]);

    const filters = {};
    const conditions = filterStr.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    }

    // Find tissue from filters
    const tissue = filters.tissue || filters.compartment || '';

    // Get the universe subset for this pathogen/tissue
    const filtered = universe.filter(r =>
      Object.entries(filters).every(([k, v]) =>
        String(r[k]).toLowerCase() === v.toLowerCase()
      )
    );

    const result = combineDrugs(filtered.length > 0 ? filtered : universe, [drug1, drug2], tissue, synergy);
    if (!result) return { error: `Could not find drugs '${drug1}' and '${drug2}' at tissue '${tissue}'` };
    return { count: 1, rows: [result], meta: { source: 'mirador_universe', mode: 'combination', synergy } };
  }

  // DECOMPOSE mirador_universe ON drug = 'X' AND tissue = 'Y'
  if ((m = q.match(/^DECOMPOSE\s+mirador_universe\s+ON\s+(.+)$/i))) {
    const filterStr = m[1];
    const filters = {};
    const conditions = filterStr.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    }
    const drug = filters.drug;
    const tissue = filters.tissue;
    if (!drug || !tissue) return { error: 'DECOMPOSE requires drug and tissue' };
    const result = decompose(universe, { drug, tissue });
    if (!result) return { error: `Drug '${drug}' not found at tissue '${tissue}'` };
    return result;
  }

  // COMPARE ['drug1', 'drug2'] ON mirador_universe WHERE tissue = 'Y'
  if ((m = q.match(/^COMPARE\s+\[([^\]]+)\]\s+ON\s+mirador_universe\s+WHERE\s+(.+)$/i))) {
    const drugListStr = m[1];
    const filterStr = m[2];
    // Parse drug names from ['VAN', 'RIF'] format
    const drugNames = drugListStr.match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
    // Parse tissue from WHERE clause
    const filters = {};
    const conditions = filterStr.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    }
    const tissue = filters.tissue || '';
    const result = compareDrugs(universe, drugNames, tissue);
    if (!result) return { error: `No matching drugs found at tissue '${tissue}'` };
    return result;
  }

  return null; // Not a universe query — fall through to base engine
}

// ── Natural Language → GQL (3-stage pipeline per spec §NL) ─────────

// Controlled vocabulary: drug natural language → universe drug code
const NL_DRUGS = {
  vancomycin:'VAN', vanco:'VAN',
  rifampin:'RIF', rifampicin:'RIF',
  linezolid:'LZD', ceftriaxone:'CRO', daptomycin:'DAP',
  ceftaroline:'CAR', clindamycin:'CLI', clinda:'CLI',
  dolutegravir:'DTG', tenofovir:'TFV', emtricitabine:'FTC',
  darunavir:'DRV', efavirenz:'EFV',
  isoniazid:'INH', pyrazinamide:'PZA', ethambutol:'EMB',
  moxifloxacin:'MXF', bedaquiline:'BDQ',
  // abbreviations
  van:'VAN', rif:'RIF', lzd:'LZD', cro:'CRO', dap:'DAP',
  car:'CAR', cli:'CLI', dtg:'DTG', tfv:'TFV', ftc:'FTC',
  drv:'DRV', efv:'EFV', inh:'INH', pza:'PZA', emb:'EMB',
  mxf:'MXF', bdq:'BDQ',
};

// Controlled vocabulary: disease / pathogen
const NL_DISEASES = {
  mrsa:'mrsa', staph:'mrsa', staphylococcus:'mrsa', 'methicillin-resistant':'mrsa',
  tb:'tb', tuberculosis:'tb', mycobacterium:'mrsa',
  hiv:'hiv', 'hiv-1':'hiv', aids:'hiv',
  meningitis:'meningitis', meningococcal:'meningitis',
};

// Multi-word tissue phrases (checked first)
const NL_TISSUE_PHRASES = [
  ['blood-brain barrier','cns'], ['blood brain barrier','cns'],
  ['cerebrospinal fluid','csf_inflamed'], ['central nervous system','cns'],
  ['bone marrow','bone_marrow'], ['lymph node','lymph_node'],
  ['genital tract','genital_tract'],
];

// Single-word tissue vocabulary
const NL_TISSUES = {
  bone:'bone', osseous:'bone', osteomyelitis:'bone',
  csf:'csf_inflamed', spinal:'csf_inflamed',
  cns:'cns', brain:'cns', bbb:'cns', 'blood-brain':'cns',
  lymph:'lymph_node',
  lung:'granuloma_lung', pulmonary:'granuloma_lung', granuloma:'granuloma_lung',
  caseum:'granuloma_necrotic', caseous:'granuloma_necrotic', necrotic:'granuloma_necrotic',
  cavity:'granuloma_cavity', cavitary:'granuloma_cavity',
  genital:'genital_tract',
  gut:'galt', galt:'galt', intestinal:'galt',
  blood:'planktonic', serum:'planktonic', planktonic:'planktonic',
};

// Default tissue when disease is known but tissue omitted
const NL_DEFAULT_TISSUE = {
  mrsa:'bone', tb:'granuloma_lung', hiv:'cns', meningitis:'csf_inflamed',
};

// ── Stage 1: Intent classification ─────────────────────────────────

function classifyIntent(q) {
  const l = q.toLowerCase();
  if (/why\s+(does|doesn'?t|isn'?t|can'?t|won'?t|did)\b/.test(l) || /why\s+fail/.test(l) || /why\s+not\s+work/.test(l))
    return 'failure_diagnosis';
  if (/\bvs\.?\b|\bversus\b|\bcompare\b|\bbetter\s+than\b/.test(l))
    return 'comparison';
  if (/\bcombination\b|\bcombo\b|\bplus\b|\bcombine\b|\badd(ing)?\s+\w/.test(l))
    return 'combination_query';
  if (/\bbest\b|\brank\b|\bwhich\s+drug|\btop\b|\bmost\s+(effective|potent)/.test(l) || /what\s+(kills|works|treats|reaches|penetrates)/.test(l))
    return 'drug_ranking';
  if (/\bcan\s+\w+\s+(reach|treat|work|penetrate)\b/.test(l) || /\bdoes\s+\w+\s+work/.test(l) || /\bhow\s+(well|much|effective)/.test(l))
    return 'single_drug_check';
  if (/\breliable\b|\bstudies\s+agree\b|\bconsistency\b|\bconfidence\b|\bagree\b/.test(l))
    return 'data_quality';
  if (/\bcure\b|\bcurable\b|\beradicate\b/.test(l))
    return 'cure_feasibility';
  return null; // resolved by fallback in nlToGql
}

// ── Stage 2: Entity extraction ─────────────────────────────────────

function extractEntities(q) {
  const lower = q.toLowerCase();
  const drugs = [], diseases = [], tissues = [];

  // Multi-word tissue phrases first
  for (const [phrase, mapped] of NL_TISSUE_PHRASES) {
    if (lower.includes(phrase) && !tissues.includes(mapped)) tissues.push(mapped);
  }

  // Single-word scans
  const words = lower.replace(/[?.,!;:'"()]/g, ' ').split(/\s+/);
  for (const w of words) {
    if (NL_DRUGS[w] && !drugs.includes(NL_DRUGS[w])) drugs.push(NL_DRUGS[w]);
    if (NL_DISEASES[w] && !diseases.includes(NL_DISEASES[w])) diseases.push(NL_DISEASES[w]);
    if (NL_TISSUES[w] && !tissues.includes(NL_TISSUES[w])) tissues.push(NL_TISSUES[w]);
  }

  return { drugs, diseases, tissues: [...new Set(tissues)] };
}

// ── Stage 3: GQL generation ────────────────────────────────────────

function generateGQL(intent, entities) {
  const { drugs, diseases, tissues } = entities;
  const disease = diseases[0];
  const tissue = tissues[0] || (disease ? NL_DEFAULT_TISSUE[disease] : null);

  switch (intent) {
    case 'single_drug_check':
    case 'failure_diagnosis': {
      if (!drugs[0] || !tissue) return null;
      return `DECOMPOSE mirador_universe ON drug = '${drugs[0]}' AND tissue = '${tissue}'`;
    }
    case 'drug_ranking':
    case 'cure_feasibility': {
      const w = [];
      if (disease) w.push(`disease = '${disease}'`);
      if (tissue) w.push(`tissue = '${tissue}'`);
      return w.length ? `COVER ON mirador_universe WHERE ${w.join(' AND ')} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE` : null;
    }
    case 'combination_query': {
      if (drugs.length < 2) return null;
      const w = [];
      if (disease) w.push(`disease = '${disease}'`);
      if (tissue) w.push(`tissue = '${tissue}'`);
      if (!w.length) return null;
      return `COVER ON mirador_universe WHERE ${w.join(' AND ')} COMBINE '${drugs[0]}', '${drugs[1]}' MODE COUPLED SYNERGY 1.2 EVALUATE coherence WITH CONFIDENCE, PROVENANCE`;
    }
    case 'comparison': {
      if (drugs.length < 2 || !tissue) return null;
      return `COMPARE [${drugs.map(d => `'${d}'`).join(', ')}] ON mirador_universe WHERE tissue = '${tissue}'`;
    }
    case 'data_quality': {
      if (drugs[0] && tissue) return `DECOMPOSE mirador_universe ON drug = '${drugs[0]}' AND tissue = '${tissue}'`;
      const w = [];
      if (disease) w.push(`disease = '${disease}'`);
      if (tissue) w.push(`tissue = '${tissue}'`);
      return w.length ? `COVER ON mirador_universe WHERE ${w.join(' AND ')} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE` : null;
    }
    default: return null;
  }
}

// ── Answer generation ──────────────────────────────────────────────

const K_LABELS = { k_admet:'ADMET/absorption', k_barrier:'tissue penetration', k_biofilm:'biofilm resistance' };

function generateAnswer(question, intent, entities, gql, result) {
  if (!result || result.error) {
    return { status:'error', question, answer: result?.error || 'Could not execute query.', generated_gql: gql };
  }

  const thresh = 5.0;
  let answer = '', verdict = '';

  if (intent === 'single_drug_check' || intent === 'failure_diagnosis') {
    const C = result.C, passes = C >= thresh;
    verdict = passes ? 'meets_threshold' : 'fails_threshold';
    const dom = result.dominant_barrier;
    const label = K_LABELS[dom] || dom;
    if (intent === 'failure_diagnosis') {
      answer = `${result.drug} achieves C = ${C.toFixed(2)} at ${result.tissue}, ${passes ? 'above' : 'below'} threshold θ = ${thresh}. ` +
        `The dominant impedance is ${label} (${dom} = ${result.decomposition[dom].toFixed(4)}). ` +
        `Full: k_admet=${result.decomposition.k_admet.toFixed(4)}, k_barrier=${result.decomposition.k_barrier.toFixed(4)}, k_biofilm=${result.decomposition.k_biofilm.toFixed(4)}.`;
    } else {
      answer = `${passes ? 'Yes' : 'No'}. ${result.drug} achieves C = ${C.toFixed(2)} at ${result.tissue}, ${passes ? 'above' : 'below'} θ = ${thresh}. ` +
        `Dominant barrier: ${label} (${dom} = ${result.decomposition[dom].toFixed(4)}).`;
    }
  } else if (intent === 'drug_ranking' || intent === 'cure_feasibility') {
    const rows = result.rows || [];
    if (!rows.length) { answer = 'No drugs found matching the criteria.'; verdict = 'no_data'; }
    else {
      const top = rows[0], passing = rows.filter(r => r['≥θ'] === 'yes');
      verdict = passing.length ? 'drugs_available' : 'no_drugs_pass';
      answer = `${rows.length} drug(s) found. Top: ${top.drug} (C = ${top.C.toFixed(4)}${top['≥θ'] === 'yes' ? ', meets threshold' : ', below threshold'}). ` +
        `${passing.length}/${rows.length} meet θ = ${thresh}.`;
      if (rows.length > 1) answer += ' Ranking: ' + rows.map((r, i) => `${i + 1}. ${r.drug} C=${r.C.toFixed(4)}`).join(', ') + '.';
    }
  } else if (intent === 'combination_query') {
    const combo = result.rows?.[0];
    if (combo) {
      const names = combo.drugs?.map(d => d.drug || d).join(' + ') || 'combo';
      answer = `Combination ${names}: K_combo = ${(combo.K_combo ?? 0).toFixed(4)}, synergy applied.`;
      verdict = 'combination_computed';
    } else { answer = 'Could not compute combination.'; verdict = 'error'; }
  } else if (intent === 'comparison') {
    answer = `Winner: ${result.winner} (${result.advantage}). ` +
      result.drugs.map(d => `${d.drug}: C=${d.C.toFixed(4)} #${d.rank}`).join('; ') + '.';
    verdict = 'comparison_done';
  } else if (intent === 'data_quality') {
    if (result.C !== undefined) {
      answer = `${result.drug} at ${result.tissue}: C = ${result.C.toFixed(4)}, confidence = ${result.confidence ?? 'N/A'}.`;
    } else {
      answer = JSON.stringify(result).slice(0, 200);
    }
    verdict = 'data_quality';
  } else {
    answer = JSON.stringify(result).slice(0, 200); verdict = 'raw';
  }

  // Follow-up suggestions
  const follow_ups = [];
  const disease = entities.diseases[0];
  const tissue = entities.tissues[0] || (disease ? NL_DEFAULT_TISSUE[disease] : null);
  if (intent !== 'drug_ranking' && disease) {
    follow_ups.push({ label: `Rank all ${disease.toUpperCase()} drugs${tissue ? ' at ' + tissue : ''}`,
      gql: `COVER ON mirador_universe WHERE disease = '${disease}'${tissue ? ` AND tissue = '${tissue}'` : ''} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE` });
  }
  if (intent !== 'failure_diagnosis' && entities.drugs[0] && tissue) {
    follow_ups.push({ label: `Why does ${entities.drugs[0]} fail at ${tissue}?`,
      gql: `DECOMPOSE mirador_universe ON drug = '${entities.drugs[0]}' AND tissue = '${tissue}'` });
  }
  if (entities.drugs.length >= 2 && tissue && intent !== 'comparison') {
    follow_ups.push({ label: `Compare ${entities.drugs[0]} vs ${entities.drugs[1]}`,
      gql: `COMPARE ['${entities.drugs[0]}', '${entities.drugs[1]}'] ON mirador_universe WHERE tissue = '${tissue}'` });
  }

  return { status: 'ok', question, answer, verdict, generated_gql: gql, result, follow_ups };
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Translate NL → GQL only (stages 1-3, no execution).
 * Usable server-side without WASM.
 */
export function translateNL(question) {
  if (!question) return { status: 'error', message: 'No question provided.' };

  const entities = extractEntities(question);
  let intent = classifyIntent(question);

  // Fallback intent from entities
  if (!intent) {
    if (entities.drugs.length >= 2) intent = 'comparison';
    else if (entities.drugs.length === 1 && (entities.tissues.length || entities.diseases.length)) intent = 'single_drug_check';
    else if (entities.diseases.length || entities.tissues.length) intent = 'drug_ranking';
  }

  if (!intent) {
    return {
      status: 'clarification_needed', question,
      message: "Which infection or drug are you asking about?",
      options: [
        { label: "Bone MRSA", gql: "COVER ON mirador_universe WHERE disease = 'mrsa' AND tissue = 'bone' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
        { label: "Pulmonary TB", gql: "COVER ON mirador_universe WHERE disease = 'tb' AND tissue = 'granuloma_lung' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
        { label: "HIV CNS", gql: "COVER ON mirador_universe WHERE disease = 'hiv' AND tissue = 'cns' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
        { label: "Meningitis", gql: "COVER ON mirador_universe WHERE disease = 'meningitis' AND tissue = 'csf_inflamed' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
      ],
    };
  }

  // Downgrade intent if insufficient entities
  if (intent === 'combination_query' && entities.drugs.length < 2) intent = 'drug_ranking';
  if (intent === 'comparison' && entities.drugs.length < 2) intent = entities.drugs.length === 1 ? 'single_drug_check' : 'drug_ranking';

  const gql = generateGQL(intent, entities);
  if (!gql) {
    return { status: 'clarification_needed', question, message: `Intent '${intent}' needs more context (drug, disease, or tissue).`, entities };
  }

  return { status: 'ok', question, intent, entities, generated_gql: gql };
}

/**
 * Full NL→GQL pipeline: translate + execute + answer.
 * Requires a pre-built universe (from buildUniverse()).
 */
export function nlToGql(question, universe) {
  if (!question || !universe) return { status: 'error', answer: 'Question and universe required.', generated_gql: null };

  const t = translateNL(question);
  if (t.status !== 'ok') return t;

  const result = universeGQL(t.generated_gql, universe);
  return generateAnswer(question, t.intent, t.entities, t.generated_gql, result);
}
