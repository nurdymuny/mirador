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

  return null; // Not a universe query — fall through to base engine
}
