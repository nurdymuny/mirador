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

// ── v1.0 Disease-specific thresholds ───────────────────────────────

export const DISEASE_THRESHOLDS = {
  mrsa:       { theta: 5.0,  anchor: 'vancomycin monotherapy failure' },
  tb:         { theta: 0.50, anchor: 'INH monotherapy at cavity site' },
  meningitis: { theta: 0.50, anchor: 'ceftriaxone at peak inflammation' },
  hiv:        { theta: 1.0,  anchor: 'single-cell suppression' },
};

function getThresholdForDisease(disease) {
  return DISEASE_THRESHOLDS[disease]?.theta ?? 5.0;
}

// ── v1.0 Confidence + K helpers ───────────────────────────────────

const K_NAMES = {
  k_admet: 'ADMET/absorption',
  k_barrier: 'tissue penetration barrier',
  k_biofilm: 'biofilm/phenotype resistance',
};

export function describeConfidence(conf) {
  if (conf >= 0.85) return `high (${conf.toFixed(2)})`;
  if (conf >= 0.60) return `moderate (${conf.toFixed(2)})`;
  return `low (${conf.toFixed(2)})`;
}

export function getDominantK(decomposition) {
  const entries = [
    ['k_admet', decomposition.k_admet],
    ['k_barrier', decomposition.k_barrier],
    ['k_biofilm', decomposition.k_biofilm],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return { key: entries[0][0], value: entries[0][1], name: K_NAMES[entries[0][0]] || entries[0][0] };
}

// ── v1.0 DHOOM wire format ────────────────────────────────────────

export function toDHOOM(rows, fields) {
  const header = fields.join('|');
  const body = rows.map(r => fields.map(f => r[f] ?? '').join('|')).join('\n');
  return header + '\n' + body;
}

export function fromDHOOM(dhoom) {
  const lines = dhoom.trim().split('\n');
  if (lines.length < 2) return [];
  const fields = lines[0].split('|');
  return lines.slice(1).map(line => {
    const vals = line.split('|');
    const obj = {};
    fields.forEach((f, i) => { obj[f] = vals[i] ?? ''; });
    return obj;
  });
}

// ── v1.0 Patient context adjustment ──────────────────────────────

export function applyPatientContext(drug, patient) {
  const crpFactor = Math.min(
    1.0 + 0.006 * Math.max((patient.crp_mg_L || 0) - 100, 0),
    2.0
  );
  drug.R_eff = +(drug.R_bone * crpFactor).toFixed(6);
  drug.k_barrier = Math.max(1.0 / drug.R_eff - 1.0, -1.0);

  if (patient.chronicity === 'acute') {
    drug.MBEC_factor = 0.5;
  } else {
    drug.MBEC_factor = 1.0;
  }

  drug.K = +(drug.k_admet + drug.k_barrier + drug.k_biofilm * drug.MBEC_factor).toFixed(6);
  drug.C = drug.K > 0 ? +(drug.tau / drug.K).toFixed(6) : 0;
  return drug;
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

  // v1.0: disease-specific threshold
  const threshold = getThresholdForDisease(record.disease);

  return {
    drug: record.drug,
    tissue: record.tissue,
    disease: record.disease,
    tau: record.tau,
    C: record.C,
    confidence: record.confidence,
    decomposition: { k_admet, k_barrier, k_biofilm, K_total },
    dominant_barrier,
    geometric_verdict: record.C >= threshold ? 'above_threshold' : 'below_threshold',
    geometric_verdict_note: 'Mathematical classification (C vs θ). Not clinical guidance.',
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

  // COMPLETE ON mirador_universe WHERE drug = 'X' AND tissue = 'Y' METHOD sheaf_extension
  if ((m = q.match(/^COMPLETE\s+ON\s+mirador_universe\s+WHERE\s+(.+?)\s+METHOD\s+(\w+)/i))) {
    const filterStr = m[1];
    const method = m[2];
    const filters = {};
    const conditions = filterStr.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    }
    const drug = filters.drug;
    const tissue = filters.tissue;
    // Try exact match first; if missing, this is a sheaf completion scenario
    const record = universe.find(r =>
      r.drug.toLowerCase() === (drug || '').toLowerCase() &&
      (!tissue || r.tissue.toLowerCase() === tissue.toLowerCase())
    );
    if (record) {
      return {
        drug: record.drug, tissue: record.tissue, C: record.C,
        confidence: record.confidence, origin: 'sheaf_completed',
        method, note: 'Exact data exists. No completion needed.',
      };
    }
    // No exact match — return sheaf_completed placeholder with neighboring data
    const neighbors = universe
      .filter(r => r.drug.toLowerCase() === (drug || '').toLowerCase())
      .map(r => ({ tissue: r.tissue, C: r.C, confidence: r.confidence }));
    return {
      drug: drug || 'unknown', tissue: tissue || 'unknown',
      C: null, confidence: 0, origin: 'sheaf_completed',
      method, note: 'No direct measurement. Sheaf completion from neighboring sections.',
      neighbors,
    };
  }

  // PROPAGATE ON mirador_universe ASSUMING drug = 'X' AND tissue = 'Y' AND R = 0.20 SHOW newly_determined
  if ((m = q.match(/^PROPAGATE\s+ON\s+mirador_universe\s+ASSUMING\s+(.+?)\s+SHOW\s+(\w+)/i))) {
    const filterStr = m[1];
    const filters = {};
    const conditions = filterStr.split(/\s+AND\s+/i);
    for (const cond of conditions) {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'?([^']*)'?$/);
      if (cm) filters[cm[1]] = cm[2];
    }
    const drug = filters.drug;
    const tissue = filters.tissue;
    // Find same-drug records at other tissues to compute cascades
    const related = universe
      .filter(r => r.drug.toLowerCase() === (drug || '').toLowerCase() && r.tissue.toLowerCase() !== (tissue || '').toLowerCase())
      .map(r => ({ tissue: r.tissue, C: r.C, confidence: +(r.confidence * 0.85).toFixed(2) }));
    return {
      drug: drug || 'unknown', source_tissue: tissue || 'unknown',
      cascades: related,
      note: `Measuring ${drug} at ${tissue} would cascade to ${related.length} additional completion(s).`,
    };
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
  tedizolid:'TDZ',
  // abbreviations
  van:'VAN', rif:'RIF', lzd:'LZD', cro:'CRO', dap:'DAP',
  car:'CAR', cli:'CLI', dtg:'DTG', tfv:'TFV', ftc:'FTC',
  drv:'DRV', efv:'EFV', inh:'INH', pza:'PZA', emb:'EMB',
  mxf:'MXF', bdq:'BDQ', tdz:'TDZ',
};

// Controlled vocabulary: disease / pathogen
const NL_DISEASES = {
  mrsa:'mrsa', staph:'mrsa', staphylococcus:'mrsa', 'methicillin-resistant':'mrsa',
  tb:'tb', tuberculosis:'tb', mycobacterium:'tb',
  hiv:'hiv', 'hiv-1':'hiv', aids:'hiv',
  meningitis:'meningitis', meningococcal:'meningitis', pneumococcal:'meningitis',
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
  lung:'granuloma_lung', lungs:'granuloma_lung', pulmonary:'granuloma_lung', granuloma:'granuloma_lung',
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
  if (/\bif\s+(?:I|we)\s+measured\b|\bwhat\s+else\b.*\blearn\b/.test(l))
    return 'cascade_analysis';
  if (/\bpredict\b|\bguess\b|\bestimate\b|\bunmeasured\b/.test(l))
    return 'predict_unmeasured';
  if (/\bvs\.?\b|\bversus\b|\bcompare\b|\bbetter\s+than\b/.test(l))
    return 'comparison';
  if (/\bcombination\b|\bcombo\b|\bplus\b|\bcombine\b|\btogether\b|\bcombined\b|\badd(ing)?\s+\w/.test(l))
    return 'combination_query';
  if (/\bbest\b|\brank\b|\bwhich\s+drug|\btop\b|\bmost\s+(effective|potent)/.test(l) || /what\s+(kills|works|treats|reaches|penetrates)/.test(l))
    return 'drug_ranking';
  if (/\bcan\s+\w+\s+(reach|treat|work|penetrate)\b/.test(l) || /\bdoes\s+\w+\s+work/.test(l) || /\bhow\s+(well|much|effective)/.test(l))
    return 'single_drug_check';
  if (/\breliable\b|\bstudies\s+agree\b|\bconsistency\b|\bconfidence\b|\bagree\b|\bdata\s+quality\b|\bhow\s+reliable\b/.test(l))
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
  const words = lower.replace(/[?.,!;:'"()\u2018\u2019\u201C\u201D]/g, ' ').split(/\s+/);
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
    case 'predict_unmeasured': {
      const d = drugs[0];
      const t = tissue;
      if (d && t) return `COMPLETE ON mirador_universe WHERE drug = '${d}' AND tissue = '${t}' METHOD sheaf_extension`;
      if (d) return `COMPLETE ON mirador_universe WHERE drug = '${d}' METHOD sheaf_extension`;
      return null;
    }
    case 'cascade_analysis': {
      const d = drugs[0];
      const t = tissue;
      if (d && t) return `PROPAGATE ON mirador_universe ASSUMING drug = '${d}' AND tissue = '${t}' SHOW newly_determined`;
      return null;
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

  // v1.0: disease-specific threshold
  const disease = entities.diseases[0] || result.disease;
  const thresh = getThresholdForDisease(disease);
  let answer = '', verdict = '';

  if (intent === 'single_drug_check' || intent === 'failure_diagnosis') {
    const C = result.C, passes = C >= thresh;
    verdict = passes ? 'above_threshold' : 'below_threshold';
    const dom = getDominantK(result.decomposition);
    const conf = describeConfidence(result.confidence ?? 1.0);
    if (intent === 'failure_diagnosis') {
      answer = `${result.drug} achieves C = ${C.toFixed(2)} at ${result.tissue}, ${passes ? 'above' : 'below'} threshold θ = ${thresh} ` +
        `(confidence: ${conf}). ` +
        `The dominant barrier is ${dom.name} (${dom.key} = ${dom.value.toFixed(4)}). ` +
        `Full: k_admet=${result.decomposition.k_admet.toFixed(4)}, k_barrier=${result.decomposition.k_barrier.toFixed(4)}, k_biofilm=${result.decomposition.k_biofilm.toFixed(4)}.`;
    } else {
      answer = `${passes ? 'Yes' : 'No'}. ${result.drug} achieves C = ${C.toFixed(2)} at ${result.tissue}, ${passes ? 'above' : 'below'} θ = ${thresh} ` +
        `(confidence: ${conf}). ` +
        `Dominant barrier: ${dom.name} (${dom.key} = ${dom.value.toFixed(4)}).`;
    }
  } else if (intent === 'drug_ranking' || intent === 'cure_feasibility') {
    const rows = result.rows || [];
    const isMultiDisease = result.meta?.multi_disease;
    if (!rows.length) {
      verdict = 'no_data';
      answer = 'No drugs found matching the criteria.';
      // Multi-disease: suggest per-disease queries as follow-ups
      if (entities.diseases.length >= 2) {
        answer += ' This was a cross-disease query. Try each disease separately:';
      }
    } else if (isMultiDisease) {
      // Multi-disease merged results — group by disease for display
      const byDisease = {};
      for (const r of rows) {
        const d = r.disease || 'unknown';
        (byDisease[d] ??= []).push(r);
      }
      const passing = rows.filter(r => {
        const th = r.threshold || getThresholdForDisease(r.disease);
        return r.C >= th;
      });
      verdict = passing.length ? 'drugs_available' : 'no_drugs_pass';
      const parts = [];
      for (const [d, dRows] of Object.entries(byDisease)) {
        const th = getThresholdForDisease(d);
        const dPassing = dRows.filter(r => r.C >= th);
        parts.push(`${d.toUpperCase()} (θ=${th}): ${dRows.length} drug(s), ${dPassing.length} meet threshold`);
      }
      answer = `Cross-disease search: ${rows.length} total drug(s) found across ${Object.keys(byDisease).length} diseases. ${parts.join('. ')}. ` +
        `${passing.length}/${rows.length} meet their respective thresholds.`;
      if (rows.length > 0) answer += ' Ranking: ' + rows.map((r, i) => `${i + 1}. ${r.drug} [${(r.disease||'').toUpperCase()}] C=${r.C.toFixed(4)}`).join(', ') + '.';
    } else {
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
      answer = `${result.drug} at ${result.tissue}: C = ${result.C.toFixed(4)}, confidence = ${describeConfidence(result.confidence ?? 1.0)}.`;
    } else {
      answer = JSON.stringify(result).slice(0, 200);
    }
    verdict = 'data_quality';
  } else {
    answer = JSON.stringify(result).slice(0, 200); verdict = 'raw';
  }

  // Follow-up suggestions
  const follow_ups = [];
  const tissue = entities.tissues[0] || (disease ? NL_DEFAULT_TISSUE[disease] : null);

  // Multi-disease: always suggest per-disease queries
  if (entities.diseases.length >= 2) {
    for (const d of entities.diseases) {
      const t = tissue || NL_DEFAULT_TISSUE[d];
      follow_ups.push({ label: `${d.toUpperCase()} drugs${t ? ' at ' + t : ''}`,
        gql: `COVER ON mirador_universe WHERE disease = '${d}'${t ? ` AND tissue = '${t}'` : ''} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE` });
    }
  } else {
    if (intent !== 'drug_ranking' && disease) {
      follow_ups.push({ label: `Rank all ${disease.toUpperCase()} drugs${tissue ? ' at ' + tissue : ''}`,
        gql: `COVER ON mirador_universe WHERE disease = '${disease}'${tissue ? ` AND tissue = '${tissue}'` : ''} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE` });
    }
  }
  if (intent !== 'failure_diagnosis' && entities.drugs[0] && tissue) {
    follow_ups.push({ label: `Why does ${entities.drugs[0]} fail at ${tissue}?`,
      gql: `DECOMPOSE mirador_universe ON drug = '${entities.drugs[0]}' AND tissue = '${tissue}'` });
  }
  if (entities.drugs.length >= 2 && tissue && intent !== 'comparison') {
    follow_ups.push({ label: `Compare ${entities.drugs[0]} vs ${entities.drugs[1]}`,
      gql: `COMPARE ['${entities.drugs[0]}', '${entities.drugs[1]}'] ON mirador_universe WHERE tissue = '${tissue}'` });
  }

  return {
    status: 'ok', question, answer, verdict, generated_gql: gql, result, follow_ups,
    geometric_verdict_note: 'Mathematical classification (C vs θ). Not clinical guidance.',
  };
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

  // Multi-disease queries: run per-disease, merge results
  const { diseases, tissues } = t.entities;
  if (diseases.length >= 2 && (t.intent === 'drug_ranking' || t.intent === 'cure_feasibility')) {
    const tissue = tissues[0]; // shared tissue from question (e.g. CSF)
    const allRows = [];
    const gqls = [];
    for (const dis of diseases) {
      const tis = tissue || NL_DEFAULT_TISSUE[dis];
      const gql = `COVER ON mirador_universe WHERE disease = '${dis}'${tis ? ` AND tissue = '${tis}'` : ''} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE`;
      gqls.push(gql);
      const res = universeGQL(gql, universe);
      if (res?.rows) {
        const thresh = getThresholdForDisease(dis);
        for (const row of res.rows) allRows.push({ ...row, disease: dis, threshold: thresh });
      }
    }
    allRows.sort((a, b) => b.C - a.C);
    const mergedResult = { count: allRows.length, rows: allRows, meta: { source: 'mirador_universe', mode: 'evaluate_coherence', multi_disease: true } };
    const mergedGql = gqls.join('\n-- UNION --\n');
    return generateAnswer(question, t.intent, t.entities, mergedGql, mergedResult);
  }

  const result = universeGQL(t.generated_gql, universe);
  return generateAnswer(question, t.intent, t.entities, t.generated_gql, result);
}
