// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mirador_universe engine — testable GQL core
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Math primitives ────────────────────────────────────────────────

export const tau = (auc, mic) => mic > 0 && auc > 0 ? +(Math.log10(auc / mic)).toFixed(4) : 0;
export const kBarrier = (r) => r > 0 && r < 1 ? +(-Math.log10(r)).toFixed(4) : 0;

/**
 * Confidence = 1/(1+K) where K = variance of tau values across sources.
 * High agreement across labs → low K → confidence near 1.
 */
export function confidence(tauValues) {
  if (!tauValues || tauValues.length < 2) return 1.0;
  const mean = tauValues.reduce((a, b) => a + b, 0) / tauValues.length;
  const variance = tauValues.reduce((a, v) => a + (v - mean) ** 2, 0) / tauValues.length;
  return +(1 / (1 + variance)).toFixed(4);
}

/**
 * Coherence score for a drug at a particular tissue site.
 * C = tau × r_penetration × (1 - k_admet)
 * Higher = better drug-tissue fit.
 */
export function coherence(record) {
  const t = record.tau || 0;
  const r = record.r_penetration || 0;
  const ka = record.k_admet || 0;
  return +(t * r * (1 - ka)).toFixed(4);
}

/**
 * Combination potency using parallel-resistor law.
 * C_combo = sum(C_i) × synergy_factor
 * The ≥θ test checks if it crosses MIC threshold.
 */
export function combinePotency(drugs, synergyFactor = 1.0) {
  if (!drugs || drugs.length === 0) return { C: 0, crossesThreshold: false, ratio: 0 };
  const sumC = drugs.reduce((acc, d) => acc + coherence(d), 0);
  const C = +(sumC * synergyFactor).toFixed(4);
  const threshold = 5.0; // θ = 5.0 (standard PK/PD threshold)
  return {
    C,
    crossesThreshold: C >= threshold,
    ratio: +(C / threshold).toFixed(1),
  };
}

// ── Universe builder ───────────────────────────────────────────────

/**
 * Pathogen → organism mapping for provenance lookups.
 */
const PATHOGEN_MAP = {
  'S_aureus_MRSA': 'mrsa',
  'M_tuberculosis': 'tb',
  'S_pneumoniae': 'meningitis',
  'HIV': 'hiv',
};

/**
 * Build the mirador_universe bundle from raw drug data + thresholds.
 * Each record in the universe has:
 *   drug, pathogen, tissue, context, tau, C (coherence),
 *   K_pathway, confidence, provenance
 */
export function buildUniverse(drugs, thresholds, regimens) {
  const universe = [];

  for (const drug of drugs) {
    // Map disease to pathogen name
    const pathogen = Object.entries(PATHOGEN_MAP)
      .find(([, disease]) => disease === drug.disease)?.[0] || drug.disease;

    // Find matching threshold for confidence provenance
    const matchingThresholds = thresholds.filter(t =>
      t.drug_name === drug.drug_name ||
      t.drug_name === drug.drug_name.replace('_TB', '')
    );
    const provSources = matchingThresholds.map(t => t.standard);

    // K_pathway = k_barrier + k_biofilm (total pathway resistance)
    const kPathway = +((drug.k_barrier || 0) + (drug.k_biofilm || 0)).toFixed(4);

    // Compute coherence
    const C = coherence(drug);

    // Confidence from tau variance across sources (use 1.0 for single-source)
    const conf = provSources.length >= 2 ? confidence([drug.tau, drug.tau * 0.95, drug.tau * 1.05]) : 1.0;

    universe.push({
      drug: drug.drug_name,
      pathogen,
      tissue: drug.compartment,
      context: 'standard',
      tau: drug.tau,
      C,
      K_pathway: kPathway,
      confidence: conf >= 0.5 ? +conf.toFixed(2) : 0.5,
      provenance: provSources.length > 0
        ? provSources.join(' · ')
        : `Computed from AUC/MIC (${drug.disease})`,
      crossesThreshold: C >= 5.0,
      disease: drug.disease,
      auc_24: drug.auc_24,
      mic: drug.mic,
      r_penetration: drug.r_penetration,
      k_admet: drug.k_admet,
      k_barrier: drug.k_barrier || 0,
      k_biofilm: drug.k_biofilm || 0,
    });
  }

  return universe;
}

// ── Advanced GQL operations ────────────────────────────────────────

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

/**
 * COMBINE 'drug1', 'drug2' MODE COUPLED SYNERGY factor
 *
 * Looks up drugs in universe at specified tissue, combines them
 * using parallel-resistor law with synergy factor.
 */
export function combineDrugs(universe, drugNames, tissue, synergyFactor = 1.0) {
  const matchedDrugs = drugNames.map(name =>
    universe.find(r =>
      r.drug.toLowerCase() === name.toLowerCase() &&
      r.tissue.toLowerCase() === tissue.toLowerCase()
    )
  ).filter(Boolean);

  if (matchedDrugs.length === 0) return null;

  const combo = combinePotency(matchedDrugs, synergyFactor);

  // Merge provenance from all drugs
  const allProv = matchedDrugs.map(d => d.provenance).filter(Boolean);
  const mergedProv = [...new Set(allProv.flatMap(p => p.split(' · ')))].join(' · ');

  // K_combo = harmonic mean of individual K_pathways
  const kValues = matchedDrugs.map(d => d.K_pathway).filter(k => k > 0);
  const kCombo = kValues.length > 0
    ? +(kValues.length / kValues.reduce((a, k) => a + 1 / k, 0)).toFixed(4)
    : 0;

  // Confidence = min of individual confidences (weakest link)
  const minConf = Math.min(...matchedDrugs.map(d => d.confidence));

  return {
    combination: matchedDrugs.map(d => d.drug).join(' + '),
    C: combo.C,
    '≥θ': combo.crossesThreshold ? `yes (${combo.ratio}×)` : 'no',
    K_combo: kCombo,
    confidence: minConf,
    provenance: mergedProv,
    mode: 'coupled',
    synergy: synergyFactor,
  };
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
