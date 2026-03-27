// ── Shared constants and utilities for server-side modules ─────────
// Single source of truth — imported by _nl.js, _engine.js, and ask/[q].js.
// Frontend source of truth remains gql-engine.js (ESM).

// v1.0: disease-specific thresholds
const DISEASE_THRESHOLDS = {
  mrsa:       { theta: 5.0,  anchor: 'vancomycin monotherapy failure' },
  tb:         { theta: 0.50, anchor: 'INH monotherapy at cavity site' },
  meningitis: { theta: 0.50, anchor: 'ceftriaxone at peak inflammation' },
  hiv:        { theta: 1.0,  anchor: 'single-cell suppression' },
};

function getThresholdForDisease(disease) {
  return DISEASE_THRESHOLDS[disease]?.theta ?? 5.0;
}

// Default tissue when NL question doesn't specify one
const NL_DEFAULT_TISSUE = { mrsa:'bone', tb:'granuloma_lung', hiv:'cns', meningitis:'csf_inflamed' };

// Controlled vocabulary: drug names → universe codes
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

// Controlled vocabulary: disease/pathogen
const NL_DISEASES = {
  mrsa:'mrsa', staph:'mrsa', staphylococcus:'mrsa',
  tb:'tb', tuberculosis:'tb', mycobacterium:'tb',
  hiv:'hiv', aids:'hiv',
  meningitis:'meningitis', pneumococcal:'meningitis',
};

// Multi-word tissue phrases (checked before single words)
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
  caseum:'granuloma_necrotic', caseous:'granuloma_necrotic',
  cavity:'granuloma_cavity', cavitary:'granuloma_cavity',
  genital:'genital_tract',
  gut:'galt', galt:'galt', intestinal:'galt',
  blood:'planktonic', serum:'planktonic',
};

// ── Age / patient-context vocabulary ────────────────────────────────

const NL_AGE_GROUPS = {
  neonate:'neonate', neonatal:'neonate', newborn:'neonate',
  infant:'infant', baby:'infant',
  child:'pediatric', children:'pediatric', pediatric:'pediatric',
  kid:'pediatric', kids:'pediatric', paediatric:'pediatric',
  adult:'adult', adults:'adult',
  elderly:'geriatric', geriatric:'geriatric', older:'geriatric',
  senior:'geriatric', seniors:'geriatric',
};

// Age-group modifiers for the Davis Field Equation.
// auc_factor  — multiplier on AUC (clearance difference)
// r_csf_factor — multiplier on R_penetration for CSF/CNS tissues (inflammation)
// Sources: Nau et al. AAC 2010 (R_CSF pediatric inflation);
//          Kearns et al. NEJM 2003 (pediatric clearance);
//          Mangoni & Jackson, Br J Clin Pharmacol 2004 (geriatric PK).
const AGE_MODIFIERS = {
  neonate:   { auc_factor: 1.30, r_csf_factor: 1.5 },
  infant:    { auc_factor: 0.90, r_csf_factor: 1.3 },
  pediatric: { auc_factor: 0.85, r_csf_factor: 1.3 },
  adult:     { auc_factor: 1.00, r_csf_factor: 1.0 },
  geriatric: { auc_factor: 1.40, r_csf_factor: 0.7 },
};

const CSF_TISSUES = new Set(['csf_inflamed', 'csf_uninflamed', 'cns']);

// Human-readable barrier names
const K_NAMES = {
  k_admet: 'ADMET/absorption',
  k_barrier: 'tissue penetration barrier',
  k_biofilm: 'biofilm/phenotype resistance',
};

// ── Utility functions ──────────────────────────────────────────────

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

module.exports = {
  DISEASE_THRESHOLDS, getThresholdForDisease, NL_DEFAULT_TISSUE,
  NL_DRUGS, NL_DISEASES, NL_TISSUE_PHRASES, NL_TISSUES, K_NAMES,
  NL_AGE_GROUPS, AGE_MODIFIERS, CSF_TISSUES,
  describeConfidence, getDominantK,
};
