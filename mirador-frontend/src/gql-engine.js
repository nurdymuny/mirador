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
