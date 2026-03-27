// ── Server-side GQL execution engine (pure JS, no WASM) ────────────
// Ported from mirador-frontend/src/gql-engine.js.
// Operates on a pre-built universe JSON (api/v1/_universe.json).

const DISEASE_THRESHOLDS = {
  mrsa:       { theta: 5.0,  anchor: 'vancomycin monotherapy failure' },
  tb:         { theta: 0.50, anchor: 'INH monotherapy at cavity site' },
  meningitis: { theta: 0.50, anchor: 'ceftriaxone at peak inflammation' },
  hiv:        { theta: 1.0,  anchor: 'single-cell suppression' },
};

function getThresholdForDisease(disease) {
  return DISEASE_THRESHOLDS[disease]?.theta ?? 5.0;
}

const K_NAMES = {
  k_admet: 'ADMET/absorption',
  k_barrier: 'tissue penetration barrier',
  k_biofilm: 'biofilm/phenotype resistance',
};

function describeConfidence(conf) {
  if (conf >= 0.85) return `high (${conf.toFixed(2)})`;
  if (conf >= 0.60) return `moderate (${conf.toFixed(2)})`;
  return `low (${conf.toFixed(2)})`;
}

function getDominantK(decomposition) {
  const entries = [
    ['k_admet', decomposition.k_admet],
    ['k_barrier', decomposition.k_barrier],
    ['k_biofilm', decomposition.k_biofilm],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  return { key: entries[0][0], value: entries[0][1], name: K_NAMES[entries[0][0]] || entries[0][0] };
}

// ── Data operations ────────────────────────────────────────────────

function coverEvaluate(universe, filters, options = {}) {
  let results = [...universe];
  for (const [key, value] of Object.entries(filters)) {
    results = results.filter(r => String(r[key]).toLowerCase() === String(value).toLowerCase());
  }
  const rankField = options.rankBy || 'C';
  const rankDir = options.rankDir || 'DESC';
  results.sort((a, b) => rankDir === 'DESC' ? b[rankField] - a[rankField] : a[rankField] - b[rankField]);
  results = results.map(r => ({
    drug: r.drug, C: r.C,
    '≥θ': r.crossesThreshold ? 'yes' : 'no',
    K_pathway: r.K_pathway,
    confidence: r.confidence,
    provenance: r.provenance,
  }));
  return results;
}

function decompose(universe, { drug, tissue }) {
  const record = universe.find(r =>
    r.drug.toLowerCase() === drug.toLowerCase() &&
    r.tissue.toLowerCase() === tissue.toLowerCase()
  );
  if (!record) return null;
  const k_admet = record.k_admet || 0;
  const k_barrier = record.k_barrier || 0;
  const k_biofilm = record.k_biofilm || 0;
  const K_total = +(k_admet + k_barrier + k_biofilm).toFixed(4);
  const barriers = { k_admet, k_barrier, k_biofilm };
  const dominant_barrier = Object.entries(barriers).sort((a, b) => b[1] - a[1])[0][0];
  const threshold = getThresholdForDisease(record.disease);
  return {
    drug: record.drug, tissue: record.tissue, disease: record.disease,
    tau: record.tau, C: record.C, confidence: record.confidence,
    decomposition: { k_admet, k_barrier, k_biofilm, K_total },
    dominant_barrier,
    geometric_verdict: record.C >= threshold ? 'above_threshold' : 'below_threshold',
    geometric_verdict_note: 'Mathematical classification (C vs θ). Not clinical guidance.',
    threshold,
    raw: { auc_24: record.auc_24, mic: record.mic, r_penetration: record.r_penetration },
  };
}

function compareDrugs(universe, drugNames, tissue) {
  if (!drugNames || drugNames.length === 0) return null;
  const matched = drugNames.map(name =>
    universe.find(r =>
      r.drug.toLowerCase() === name.toLowerCase() &&
      r.tissue.toLowerCase() === tissue.toLowerCase()
    )
  ).filter(Boolean);
  if (matched.length === 0) return null;
  const entries = matched.map(r => ({
    drug: r.drug, C: r.C, tau: r.tau,
    k_admet: r.k_admet || 0, k_barrier: r.k_barrier || 0, k_biofilm: r.k_biofilm || 0,
  }));
  entries.sort((a, b) => b.C - a.C);
  entries.forEach((e, i) => { e.rank = i + 1; });
  const winner = entries[0].drug;
  const advantage = entries.length >= 2
    ? `${(entries[0].C / entries[1].C).toFixed(2)}× higher coherence`
    : 'single drug';
  const barrierKeys = ['tau', 'k_admet', 'k_barrier', 'k_biofilm'];
  const per_barrier_wins = {};
  for (const key of barrierKeys) {
    const best = key === 'tau'
      ? entries.reduce((a, b) => a.tau >= b.tau ? a : b)
      : entries.reduce((a, b) => a[key] <= b[key] ? a : b);
    per_barrier_wins[key] = best.drug;
  }
  return { drugs: entries, winner, advantage, per_barrier_wins };
}

// ── universeGQL — parse + execute GQL against pre-built universe ───

function universeGQL(query, universe) {
  const q = query.trim().replace(/;$/, '').trim();
  let m;

  // COVER ON mirador_universe WHERE ... EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE
  if ((m = q.match(/^COVER\s+ON\s+mirador_universe\s+WHERE\s+(.+?)\s+EVALUATE\s+coherence\s+RANK\s+BY\s+coherence\s+(ASC|DESC)\s+WITH\s+CONFIDENCE\s*,\s*PROVENANCE$/i))) {
    const filters = {};
    m[1].split(/\s+AND\s+/i).forEach(cond => {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    });
    const results = coverEvaluate(universe, filters, { rankBy: 'C', rankDir: m[2].toUpperCase() });
    return { count: results.length, rows: results, meta: { source: 'mirador_universe', mode: 'evaluate_coherence' } };
  }

  // DECOMPOSE mirador_universe ON drug = 'X' AND tissue = 'Y'
  if ((m = q.match(/^DECOMPOSE\s+mirador_universe\s+ON\s+(.+)$/i))) {
    const filters = {};
    m[1].split(/\s+AND\s+/i).forEach(cond => {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    });
    if (!filters.drug || !filters.tissue) return { error: 'DECOMPOSE requires drug and tissue' };
    const result = decompose(universe, { drug: filters.drug, tissue: filters.tissue });
    if (!result) return { error: `Drug '${filters.drug}' not found at tissue '${filters.tissue}'` };
    return result;
  }

  // COMPARE ['drug1', 'drug2'] ON mirador_universe WHERE tissue = 'Y'
  if ((m = q.match(/^COMPARE\s+\[([^\]]+)\]\s+ON\s+mirador_universe\s+WHERE\s+(.+)$/i))) {
    const drugNames = m[1].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
    const filters = {};
    m[2].split(/\s+AND\s+/i).forEach(cond => {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    });
    const tissue = filters.tissue || '';
    const result = compareDrugs(universe, drugNames, tissue);
    if (!result) return { error: `No matching drugs found at tissue '${tissue}'` };
    return result;
  }

  // COMPLETE ON mirador_universe WHERE ... METHOD sheaf_extension
  if ((m = q.match(/^COMPLETE\s+ON\s+mirador_universe\s+WHERE\s+(.+?)\s+METHOD\s+(\w+)/i))) {
    const filters = {};
    m[1].split(/\s+AND\s+/i).forEach(cond => {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    });
    const drug = filters.drug, tissue = filters.tissue;
    const record = universe.find(r =>
      r.drug.toLowerCase() === (drug || '').toLowerCase() &&
      (!tissue || r.tissue.toLowerCase() === tissue.toLowerCase())
    );
    if (record) {
      return { drug: record.drug, tissue: record.tissue, C: record.C, confidence: record.confidence, origin: 'sheaf_completed', method: m[2], note: 'Exact data exists. No completion needed.' };
    }
    const neighbors = universe
      .filter(r => r.drug.toLowerCase() === (drug || '').toLowerCase())
      .map(r => ({ tissue: r.tissue, C: r.C, confidence: r.confidence }));
    return { drug: drug || 'unknown', tissue: tissue || 'unknown', C: null, confidence: 0, origin: 'sheaf_completed', method: m[2], note: 'No direct measurement. Sheaf completion from neighboring sections.', neighbors };
  }

  // PROPAGATE ON mirador_universe ASSUMING ... SHOW newly_determined
  if ((m = q.match(/^PROPAGATE\s+ON\s+mirador_universe\s+ASSUMING\s+(.+?)\s+SHOW\s+(\w+)/i))) {
    const filters = {};
    m[1].split(/\s+AND\s+/i).forEach(cond => {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'?([^']*)'?$/);
      if (cm) filters[cm[1]] = cm[2];
    });
    const drug = filters.drug, tissue = filters.tissue;
    const related = universe
      .filter(r => r.drug.toLowerCase() === (drug || '').toLowerCase() && r.tissue.toLowerCase() !== (tissue || '').toLowerCase())
      .map(r => ({ tissue: r.tissue, C: r.C, confidence: +(r.confidence * 0.85).toFixed(2) }));
    return { drug: drug || 'unknown', source_tissue: tissue || 'unknown', cascades: related, note: `Measuring ${drug} at ${tissue} would cascade to ${related.length} additional completion(s).` };
  }

  // COVER ON mirador_universe WHERE ... COMBINE 'drug1', 'drug2' MODE COUPLED SYNERGY <n> ...
  if ((m = q.match(/^COVER\s+ON\s+mirador_universe\s+WHERE\s+(.+?)\s+COMBINE\s+'([^']+)'\s*,\s*'([^']+)'\s+MODE\s+COUPLED\s+SYNERGY\s+([\d.]+)/i))) {
    const filters = {};
    m[1].split(/\s+AND\s+/i).forEach(cond => {
      const cm = cond.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters[cm[1]] = cm[2];
    });
    const drug1 = m[2], drug2 = m[3], synergy = parseFloat(m[4]);
    const tissue = filters.tissue || '';
    // Server-side combination: compute from universe records directly
    const r1 = universe.find(r => r.drug.toLowerCase() === drug1.toLowerCase() && r.tissue.toLowerCase() === tissue.toLowerCase());
    const r2 = universe.find(r => r.drug.toLowerCase() === drug2.toLowerCase() && r.tissue.toLowerCase() === tissue.toLowerCase());
    if (!r1 || !r2) return { error: `Could not find drugs '${drug1}' and '${drug2}' at tissue '${tissue}'` };
    const K_combo = +((r1.K_pathway + r2.K_pathway) / 2 / synergy).toFixed(4);
    const tau_combo = +((r1.tau + r2.tau) / 2).toFixed(4);
    const C_combo = K_combo > 0 ? +(tau_combo / K_combo).toFixed(4) : 0;
    return {
      count: 1,
      rows: [{
        drugs: [{ drug: r1.drug, C: r1.C }, { drug: r2.drug, C: r2.C }],
        K_combo, tau_combo, C_combo, synergy_factor: synergy,
        tissue, disease: r1.disease,
      }],
      meta: { source: 'mirador_universe', mode: 'combination', synergy },
    };
  }

  return null;
}

// ── Default tissue for disease ─────────────────────────────────────
const NL_DEFAULT_TISSUE = {
  mrsa:'bone', tb:'granuloma_lung', hiv:'cns', meningitis:'csf_inflamed',
};

// ── generateAnswer — template English responses ────────────────────

function generateAnswer(question, intent, entities, gql, result) {
  if (!result || result.error) {
    return { status: 'error', question, answer: result?.error || 'Could not execute query.', generated_gql: gql };
  }

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
      answer = `Combination ${names}: K_combo = ${(combo.K_combo ?? 0).toFixed(4)}, C_combo = ${(combo.C_combo ?? 0).toFixed(4)}, synergy = ${combo.synergy_factor}.`;
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

  return {
    status: 'ok', question, answer, verdict, generated_gql: gql, result, follow_ups,
    geometric_verdict_note: 'Mathematical classification (C vs θ). Not clinical guidance.',
  };
}

module.exports = { universeGQL, generateAnswer };
