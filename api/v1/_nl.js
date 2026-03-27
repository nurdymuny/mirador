// ── NL→GQL translation (stages 1-3, no WASM needed) ───────────────
// Shared by /api/v1/ask and /api/v1/query serverless functions.
// Math stays in Rust/WASM — this module only does text → GQL string.

// v1.0: disease-specific thresholds
const DISEASE_THRESHOLDS = {
  mrsa:       { theta: 5.0,  anchor: 'vancomycin monotherapy failure' },
  tb:         { theta: 0.50, anchor: 'INH monotherapy at cavity site' },
  meningitis: { theta: 0.50, anchor: 'ceftriaxone at peak inflammation' },
  hiv:        { theta: 1.0,  anchor: 'single-cell suppression' },
};

const NL_DRUGS = {
  vancomycin:'VAN', vanco:'VAN', van:'VAN',
  rifampin:'RIF', rifampicin:'RIF', rif:'RIF',
  linezolid:'LZD', lzd:'LZD',
  ceftriaxone:'CRO', cro:'CRO',
  daptomycin:'DAP', dap:'DAP',
  ceftaroline:'CAR', car:'CAR',
  clindamycin:'CLI', cli:'CLI', clinda:'CLI',
  dolutegravir:'DTG', dtg:'DTG',
  tenofovir:'TFV', tfv:'TFV',
  emtricitabine:'FTC', ftc:'FTC',
  darunavir:'DRV', drv:'DRV',
  efavirenz:'EFV', efv:'EFV',
  isoniazid:'INH', inh:'INH',
  pyrazinamide:'PZA', pza:'PZA',
  ethambutol:'EMB', emb:'EMB',
  moxifloxacin:'MXF', mxf:'MXF',
  bedaquiline:'BDQ', bdq:'BDQ',
  tedizolid:'TDZ', tdz:'TDZ',
};

const NL_DISEASES = {
  mrsa:'mrsa', staph:'mrsa', staphylococcus:'mrsa',
  tb:'tb', tuberculosis:'tb', mycobacterium:'tb',
  hiv:'hiv', aids:'hiv',
  meningitis:'meningitis', pneumococcal:'meningitis',
};

const NL_TISSUE_PHRASES = [
  ['blood-brain barrier','cns'], ['blood brain barrier','cns'],
  ['cerebrospinal fluid','csf_inflamed'], ['central nervous system','cns'],
  ['bone marrow','bone_marrow'], ['lymph node','lymph_node'],
  ['genital tract','genital_tract'],
];

const NL_TISSUES = {
  bone:'bone', osseous:'bone', osteomyelitis:'bone',
  csf:'csf_inflamed', spinal:'csf_inflamed',
  cns:'cns', brain:'cns', bbb:'cns', 'blood-brain':'cns',
  lymph:'lymph_node',
  lung:'granuloma_lung', lungs:'granuloma_lung', pulmonary:'granuloma_lung', granuloma:'granuloma_lung',
  caseum:'granuloma_necrotic', caseous:'granuloma_necrotic',
  cavity:'granuloma_cavity', cavitary:'granuloma_cavity',
  genital:'genital_tract',
  gut:'galt', galt:'galt', intestinal:'galt',
  blood:'planktonic', serum:'planktonic',
};

const NL_DEFAULT_TISSUE = { mrsa:'bone', tb:'granuloma_lung', hiv:'cns', meningitis:'csf_inflamed' };

function classifyIntent(q) {
  const l = q.toLowerCase();
  if (/why\s+(does|doesn'?t|isn'?t|can'?t|won'?t|did)\b/.test(l) || /why\s+fail/.test(l)) return 'failure_diagnosis';
  if (/\bif\s+(?:I|we)\s+measured\b|\bwhat\s+else\b.*\blearn\b/.test(l)) return 'cascade_analysis';
  if (/\bpredict\b|\bguess\b|\bestimate\b|\bunmeasured\b/.test(l)) return 'predict_unmeasured';
  if (/\bvs\.?\b|\bversus\b|\bcompare\b|\bbetter\s+than\b/.test(l)) return 'comparison';
  if (/\bcombination\b|\bcombo\b|\bplus\b|\bcombine\b|\btogether\b/.test(l)) return 'combination_query';
  if (/\bbest\b|\brank\b|\bwhich\s+drug|\btop\b|\bmost\s+(effective|potent)/.test(l) || /what\s+(kills|works|treats|reaches)/.test(l)) return 'drug_ranking';
  if (/\bcan\s+\w+\s+(reach|treat|work|penetrate)\b/.test(l) || /\bdoes\s+\w+\s+work/.test(l) || /\bhow\s+(well|much|effective)/.test(l)) return 'single_drug_check';
  if (/\breliable\b|\bstudies\s+agree\b|\bconsistency\b|\bdata\s+quality\b/.test(l)) return 'data_quality';
  if (/\bcure\b|\bcurable\b|\beradicate\b/.test(l)) return 'cure_feasibility';
  return null;
}

function extractEntities(q) {
  const lower = q.toLowerCase();
  const drugs = [], diseases = [], tissues = [];
  for (const [phrase, mapped] of NL_TISSUE_PHRASES)
    if (lower.includes(phrase) && !tissues.includes(mapped)) tissues.push(mapped);
  const words = lower.replace(/[?.,!;:'"()\u2018\u2019\u201C\u201D]/g, ' ').split(/\s+/);
  for (const w of words) {
    if (NL_DRUGS[w] && !drugs.includes(NL_DRUGS[w])) drugs.push(NL_DRUGS[w]);
    if (NL_DISEASES[w] && !diseases.includes(NL_DISEASES[w])) diseases.push(NL_DISEASES[w]);
    if (NL_TISSUES[w] && !tissues.includes(NL_TISSUES[w])) tissues.push(NL_TISSUES[w]);
  }
  return { drugs, diseases, tissues: [...new Set(tissues)] };
}

function generateGQL(intent, entities) {
  const { drugs, diseases, tissues } = entities;
  const disease = diseases[0];
  const tissue = tissues[0] || (disease ? NL_DEFAULT_TISSUE[disease] : null);
  switch (intent) {
    case 'single_drug_check': case 'failure_diagnosis':
      if (!drugs[0] || !tissue) return null;
      return `DECOMPOSE mirador_universe ON drug = '${drugs[0]}' AND tissue = '${tissue}'`;
    case 'drug_ranking': case 'cure_feasibility': {
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
    case 'comparison':
      if (drugs.length < 2 || !tissue) return null;
      return `COMPARE [${drugs.map(d => `'${d}'`).join(', ')}] ON mirador_universe WHERE tissue = '${tissue}'`;
    case 'data_quality':
      if (drugs[0] && tissue) return `DECOMPOSE mirador_universe ON drug = '${drugs[0]}' AND tissue = '${tissue}'`;
      const w2 = [];
      if (disease) w2.push(`disease = '${disease}'`);
      if (tissue) w2.push(`tissue = '${tissue}'`);
      return w2.length ? `COVER ON mirador_universe WHERE ${w2.join(' AND ')} EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE` : null;
    case 'predict_unmeasured': {
      const d = drugs[0], t = tissue;
      if (d && t) return `COMPLETE ON mirador_universe WHERE drug = '${d}' AND tissue = '${t}' METHOD sheaf_extension`;
      if (d) return `COMPLETE ON mirador_universe WHERE drug = '${d}' METHOD sheaf_extension`;
      return null;
    }
    case 'cascade_analysis': {
      const d2 = drugs[0], t2 = tissue;
      if (d2 && t2) return `PROPAGATE ON mirador_universe ASSUMING drug = '${d2}' AND tissue = '${t2}' SHOW newly_determined`;
      return null;
    }
    default: return null;
  }
}

function translateNL(question) {
  if (!question) return { status: 'error', message: 'No question provided.' };
  const entities = extractEntities(question);
  let intent = classifyIntent(question);
  if (!intent) {
    if (entities.drugs.length >= 2) intent = 'comparison';
    else if (entities.drugs.length === 1 && (entities.tissues.length || entities.diseases.length)) intent = 'single_drug_check';
    else if (entities.diseases.length || entities.tissues.length) intent = 'drug_ranking';
  }
  if (!intent) {
    return {
      status: 'clarification_needed', question,
      message: 'Which infection or drug are you asking about?',
      options: [
        { label: 'Bone MRSA', gql: "COVER ON mirador_universe WHERE disease = 'mrsa' AND tissue = 'bone' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
        { label: 'Pulmonary TB', gql: "COVER ON mirador_universe WHERE disease = 'tb' AND tissue = 'granuloma_lung' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
        { label: 'HIV CNS', gql: "COVER ON mirador_universe WHERE disease = 'hiv' AND tissue = 'cns' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
        { label: 'Meningitis', gql: "COVER ON mirador_universe WHERE disease = 'meningitis' AND tissue = 'csf_inflamed' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE" },
      ],
    };
  }
  if (intent === 'combination_query' && entities.drugs.length < 2) intent = 'drug_ranking';
  if (intent === 'comparison' && entities.drugs.length < 2) intent = entities.drugs.length === 1 ? 'single_drug_check' : 'drug_ranking';
  const gql = generateGQL(intent, entities);
  if (!gql) return { status: 'clarification_needed', question, message: `Intent '${intent}' needs more context.`, entities };
  return { status: 'ok', question, intent, entities, generated_gql: gql };
}

module.exports = { translateNL, extractEntities, classifyIntent };
