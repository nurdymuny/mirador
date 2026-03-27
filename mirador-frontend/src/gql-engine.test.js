import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import {
  initEngineSync,
  buildUniverse, coverEvaluate, combineDrugs, universeGQL,
  decompose, compareDrugs, batchGQL,
  translateNL, nlToGql,
  // v1.0 exports
  DISEASE_THRESHOLDS,
  describeConfidence,
  getDominantK,
  toDHOOM,
  fromDHOOM,
  applyPatientContext,
} from './gql-engine';

// ── WASM init (must run before any buildUniverse call) ─────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const wasmPath = resolve(__dirname, 'mirador_universe', 'mirador_universe_wasm_bg.wasm');

beforeAll(() => {
  const buf = readFileSync(wasmPath);
  initEngineSync(buf);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1-§2  Math primitives — tested in Rust (23 tests in mirador-universe)
//        No JS duplication. See: mirador_rs/crates/mirador-universe/src/engine.rs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3  Universe builder (WASM-backed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SAMPLE_DRUGS = [
  { compound_id: 300, drug_name: 'VAN', drug_class: 'antibiotic', disease: 'mrsa', compartment: 'bone', auc_24: 400, mic: 1.0, tau: 2.602, k_admet: 0.50, r_penetration: 0.20, k_barrier: 0.699, k_biofilm: 2.709 },
  { compound_id: 305, drug_name: 'RIF', drug_class: 'antibiotic', disease: 'mrsa', compartment: 'bone', auc_24: 60, mic: 0.008, tau: 3.8751, k_admet: 0.50, r_penetration: 0.35, k_barrier: 0.4559, k_biofilm: 1.7959 },
  { compound_id: 301, drug_name: 'CAR', drug_class: 'antibiotic', disease: 'mrsa', compartment: 'bone', auc_24: 180, mic: 1.0, tau: 2.2553, k_admet: 0.67, r_penetration: 0.30, k_barrier: 0.5229, k_biofilm: 2.1072 },
];

const SAMPLE_THRESHOLDS = [
  { drug_name: 'Vancomycin', organism: 'S. aureus (MRSA)', mic_s: 2.0, mic_r: 2.0, standard: 'EUCAST v14.0 / CLSI M100' },
  { drug_name: 'Ceftaroline', organism: 'S. aureus (MRSA)', mic_s: 1.0, mic_r: 2.0, standard: 'EUCAST v14.0 / CLSI M100' },
  { drug_name: 'Rifampin', organism: 'S. aureus (MRSA)', mic_s: 0.06, mic_r: 0.5, standard: 'EUCAST v14.0' },
];

const SAMPLE_REGIMENS = [
  { regimen_id: 'mrsa_pji', name: 'VAN + RIF', disease: 'mrsa', drugs: 'VAN,RIF', synergy_factor: 1.2 },
];

describe('buildUniverse()', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('produces one record per drug input', () => {
    expect(universe).toHaveLength(3);
  });
  it('each record has required fields', () => {
    const required = ['drug', 'pathogen', 'tissue', 'tau', 'C', 'K_pathway', 'confidence', 'provenance'];
    for (const r of universe) {
      for (const f of required) {
        expect(r).toHaveProperty(f);
      }
    }
  });
  it('maps disease to pathogen name', () => {
    expect(universe[0].pathogen).toBe('S_aureus_MRSA');
  });
  it('computes K_pathway = k_barrier + k_biofilm', () => {
    const van = universe.find(r => r.drug === 'VAN');
    expect(van.K_pathway).toBeCloseTo(0.699 + 2.709, 2);
  });
  it('computes coherence C for each drug', () => {
    const van = universe.find(r => r.drug === 'VAN');
    // C = tau × r_penetration × (1 - k_admet) = 2.602 × 0.20 × 0.50 = 0.2602
    expect(van.C).toBeCloseTo(2.602 * 0.20 * 0.50, 2);
  });
  it('includes provenance strings', () => {
    for (const r of universe) {
      expect(typeof r.provenance).toBe('string');
      expect(r.provenance.length).toBeGreaterThan(0);
    }
  });
  it('marks threshold crossing', () => {
    for (const r of universe) {
      expect(typeof r.crossesThreshold).toBe('boolean');
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4  COVER ... EVALUATE coherence RANK BY ... WITH CONFIDENCE, PROVENANCE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('coverEvaluate()', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('filters by pathogen', () => {
    const results = coverEvaluate(universe, { pathogen: 'S_aureus_MRSA' });
    expect(results).toHaveLength(3);
  });
  it('filters by pathogen AND tissue', () => {
    const results = coverEvaluate(universe, { pathogen: 'S_aureus_MRSA', tissue: 'bone' });
    expect(results).toHaveLength(3);
  });
  it('returns empty for non-matching filter', () => {
    const results = coverEvaluate(universe, { pathogen: 'nonexistent' });
    expect(results).toHaveLength(0);
  });
  it('ranks by coherence descending by default', () => {
    const results = coverEvaluate(universe, { pathogen: 'S_aureus_MRSA' });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].C).toBeGreaterThanOrEqual(results[i].C);
    }
  });
  it('each result has drug, C, ≥θ, K_pathway, confidence, provenance', () => {
    const results = coverEvaluate(universe, { pathogen: 'S_aureus_MRSA' });
    for (const r of results) {
      expect(r).toHaveProperty('drug');
      expect(r).toHaveProperty('C');
      expect(r).toHaveProperty('≥θ');
      expect(r).toHaveProperty('K_pathway');
      expect(r).toHaveProperty('confidence');
      expect(r).toHaveProperty('provenance');
    }
  });
  it('≥θ is "yes" or "no"', () => {
    const results = coverEvaluate(universe, { pathogen: 'S_aureus_MRSA' });
    for (const r of results) {
      expect(['yes', 'no']).toContain(r['≥θ']);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5  COMBINE ... MODE COUPLED SYNERGY (WASM-backed)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('combineDrugs()', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('combines two drugs at a tissue with synergy', () => {
    const result = combineDrugs(universe, ['VAN', 'RIF'], 'bone', 1.2);
    expect(result).not.toBeNull();
    expect(result.combination).toBe('VAN + RIF');
    expect(result.C).toBeGreaterThan(0);
    expect(result.synergy).toBe(1.2);
  });
  it('C_combo uses WASM combinePotency (sum(C_i) × synergy)', () => {
    const van = universe.find(r => r.drug === 'VAN');
    const rif = universe.find(r => r.drug === 'RIF');
    const result = combineDrugs(universe, ['VAN', 'RIF'], 'bone', 1.2);
    expect(result.C).toBeCloseTo((van.C + rif.C) * 1.2, 1);
  });
  it('reports threshold crossing', () => {
    const result = combineDrugs(universe, ['VAN', 'RIF'], 'bone', 1.2);
    expect(result['≥θ']).toMatch(/yes|no/);
  });
  it('merges provenance from both drugs', () => {
    const result = combineDrugs(universe, ['VAN', 'RIF'], 'bone', 1.2);
    expect(typeof result.provenance).toBe('string');
    expect(result.provenance.length).toBeGreaterThan(0);
  });
  it('computes K_combo as harmonic mean of pathways', () => {
    const result = combineDrugs(universe, ['VAN', 'RIF'], 'bone', 1.2);
    expect(result.K_combo).toBeGreaterThan(0);
  });
  it('returns null for missing drugs', () => {
    const result = combineDrugs(universe, ['NONEXISTENT'], 'bone', 1.0);
    expect(result).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6  universeGQL parser
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('universeGQL()', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('parses COVER ON mirador_universe WHERE ... EVALUATE coherence query', () => {
    const q = "COVER ON mirador_universe WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE;";
    const result = universeGQL(q, universe);
    expect(result).not.toBeNull();
    expect(result.count).toBe(3);
    expect(result.rows[0]).toHaveProperty('drug');
    expect(result.rows[0]).toHaveProperty('confidence');
    expect(result.rows[0]).toHaveProperty('provenance');
  });

  it('parses COMBINE query with synergy', () => {
    const q = "COVER ON mirador_universe WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone' COMBINE 'VAN', 'RIF' MODE COUPLED SYNERGY 1.2 EVALUATE coherence WITH CONFIDENCE, PROVENANCE;";
    const result = universeGQL(q, universe);
    expect(result).not.toBeNull();
    expect(result.count).toBe(1);
    expect(result.rows[0].combination).toBe('VAN + RIF');
    expect(result.rows[0].synergy).toBe(1.2);
  });

  it('returns null for non-universe queries', () => {
    const result = universeGQL("SHOW BUNDLES;", universe);
    expect(result).toBeNull();
  });

  it('returns error for drugs not found in COMBINE', () => {
    const q = "COVER ON mirador_universe WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone' COMBINE 'FAKE', 'NONE' MODE COUPLED SYNERGY 1.0 EVALUATE coherence WITH CONFIDENCE, PROVENANCE;";
    const result = universeGQL(q, universe);
    expect(result).toHaveProperty('error');
  });

  it('results are ranked by coherence descending', () => {
    const q = "COVER ON mirador_universe WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone' EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE;";
    const result = universeGQL(q, universe);
    for (let i = 1; i < result.rows.length; i++) {
      expect(result.rows[i - 1].C).toBeGreaterThanOrEqual(result.rows[i].C);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7  DECOMPOSE — impedance breakdown
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('decompose()', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('returns full impedance stack for a known drug+tissue', () => {
    const result = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(result).not.toBeNull();
    expect(result.drug).toBe('VAN');
    expect(result.tissue).toBe('bone');
    expect(result.tau).toBeCloseTo(2.602, 2);
    expect(result.C).toBeCloseTo(0.2602, 2);
  });

  it('includes decomposition with k_admet, k_barrier, k_biofilm', () => {
    const result = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(result.decomposition).toHaveProperty('k_admet');
    expect(result.decomposition).toHaveProperty('k_barrier');
    expect(result.decomposition).toHaveProperty('k_biofilm');
    expect(result.decomposition).toHaveProperty('K_total');
    expect(result.decomposition.K_total).toBeCloseTo(
      result.decomposition.k_admet + result.decomposition.k_barrier + result.decomposition.k_biofilm, 2
    );
  });

  it('identifies the dominant barrier', () => {
    const result = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(result.dominant_barrier).toBe('k_biofilm');
  });

  it('includes geometric_verdict (not clinical verdict)', () => {
    const result = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(result.geometric_verdict).toBe('below_threshold');
  });

  it('returns null for unknown drug', () => {
    const result = decompose(universe, { drug: 'FAKE', tissue: 'bone' });
    expect(result).toBeNull();
  });

  it('returns null for unknown tissue', () => {
    const result = decompose(universe, { drug: 'VAN', tissue: 'moon' });
    expect(result).toBeNull();
  });

  it('includes raw PK values', () => {
    const result = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(result.raw).toHaveProperty('auc_24');
    expect(result.raw).toHaveProperty('mic');
    expect(result.raw).toHaveProperty('r_penetration');
  });

  it('threshold is 5.0', () => {
    const result = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(result.threshold).toBe(5.0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8  COMPARE — head-to-head drug comparison
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('compareDrugs()', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('compares multiple drugs at same tissue', () => {
    const result = compareDrugs(universe, ['VAN', 'RIF', 'CAR'], 'bone');
    expect(result).not.toBeNull();
    expect(result.drugs).toHaveLength(3);
  });

  it('ranks by coherence descending', () => {
    const result = compareDrugs(universe, ['VAN', 'RIF', 'CAR'], 'bone');
    expect(result.drugs[0].rank).toBe(1);
    expect(result.drugs[1].rank).toBe(2);
    expect(result.drugs[2].rank).toBe(3);
    for (let i = 1; i < result.drugs.length; i++) {
      expect(result.drugs[i - 1].C).toBeGreaterThanOrEqual(result.drugs[i].C);
    }
  });

  it('identifies the winner', () => {
    const result = compareDrugs(universe, ['VAN', 'RIF'], 'bone');
    expect(result.winner).toBe('RIF');
  });

  it('computes advantage ratio', () => {
    const result = compareDrugs(universe, ['VAN', 'RIF'], 'bone');
    expect(result.advantage).toMatch(/higher coherence/);
  });

  it('reports per-barrier wins', () => {
    const result = compareDrugs(universe, ['VAN', 'RIF'], 'bone');
    expect(result.per_barrier_wins).toHaveProperty('tau');
    expect(result.per_barrier_wins).toHaveProperty('k_admet');
    expect(result.per_barrier_wins).toHaveProperty('k_barrier');
    expect(result.per_barrier_wins).toHaveProperty('k_biofilm');
  });

  it('returns null for empty drug list', () => {
    const result = compareDrugs(universe, [], 'bone');
    expect(result).toBeNull();
  });

  it('skips drugs not found at tissue', () => {
    const result = compareDrugs(universe, ['VAN', 'FAKE'], 'bone');
    expect(result.drugs).toHaveLength(1);
    expect(result.drugs[0].drug).toBe('VAN');
  });

  it('returns null when zero drugs match', () => {
    const result = compareDrugs(universe, ['FAKE1', 'FAKE2'], 'bone');
    expect(result).toBeNull();
  });

  it('each drug entry has C, tau, k_admet, k_barrier, k_biofilm, rank', () => {
    const result = compareDrugs(universe, ['VAN', 'RIF'], 'bone');
    const fields = ['drug', 'C', 'tau', 'k_admet', 'k_barrier', 'k_biofilm', 'rank'];
    for (const d of result.drugs) {
      for (const f of fields) {
        expect(d).toHaveProperty(f);
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9  BATCH — multi-query execution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('batchGQL()', () => {
  it('executes multiple queries and returns results array', () => {
    const queries = [
      { id: 'q1', query: 'SHOW BUNDLES;' },
      { id: 'q2', query: 'DESCRIBE mirador_drugs;' },
    ];
    const result = batchGQL(queries, q => {
      if (q.toUpperCase().includes('SHOW BUNDLES')) return { bundles: [{ name: 'test' }] };
      if (q.toUpperCase().includes('DESCRIBE')) return { record_count: 5 };
      return { error: 'unknown' };
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0].id).toBe('q1');
    expect(result.results[0].status).toBe('ok');
    expect(result.results[1].id).toBe('q2');
    expect(result.results[1].status).toBe('ok');
  });

  it('reports per-query errors with continue strategy', () => {
    const queries = [
      { id: 'q1', query: 'SHOW BUNDLES;' },
      { id: 'q2', query: 'INVALID QUERY;' },
      { id: 'q3', query: 'DESCRIBE mirador_drugs;' },
    ];
    const result = batchGQL(queries, q => {
      if (q.toUpperCase().includes('SHOW BUNDLES')) return { bundles: [] };
      if (q.toUpperCase().includes('DESCRIBE')) return { record_count: 5 };
      return { error: 'parse error' };
    }, 'continue');
    expect(result.results).toHaveLength(3);
    expect(result.results[0].status).toBe('ok');
    expect(result.results[1].status).toBe('error');
    expect(result.results[2].status).toBe('ok');
  });

  it('stops on first error with stop strategy', () => {
    const queries = [
      { id: 'q1', query: 'SHOW BUNDLES;' },
      { id: 'q2', query: 'INVALID;' },
      { id: 'q3', query: 'DESCRIBE mirador_drugs;' },
    ];
    const result = batchGQL(queries, q => {
      if (q.toUpperCase().includes('SHOW BUNDLES')) return { bundles: [] };
      return { error: 'fail' };
    }, 'stop');
    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('ok');
    expect(result.results[1].status).toBe('error');
  });

  it('returns total_time_ms', () => {
    const result = batchGQL([{ id: 'q1', query: 'SHOW BUNDLES;' }], () => ({ bundles: [] }));
    expect(result).toHaveProperty('total_time_ms');
    expect(typeof result.total_time_ms).toBe('number');
  });

  it('enforces max 20 queries', () => {
    const queries = Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, query: 'SHOW BUNDLES;' }));
    const result = batchGQL(queries, () => ({ bundles: [] }));
    expect(result.status).toBe('error');
    expect(result.message).toMatch(/20/);
  });

  it('handles empty batch', () => {
    const result = batchGQL([], () => ({}));
    expect(result.results).toHaveLength(0);
    expect(result.status).toBe('ok');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10  Multi-condition AND parser (edge cases)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('coverEvaluate() edge cases', () => {
  const MULTI_DRUGS = [
    { compound_id: 100, drug_name: 'DTG', drug_class: 'INSTI', disease: 'hiv', compartment: 'cns',
      auc_24: 126400, mic: 0.51, tau: 5.3945, k_admet: 0.05, r_penetration: 0.01, k_barrier: 2.0, k_biofilm: 0 },
    { compound_id: 101, drug_name: 'DTG', drug_class: 'INSTI', disease: 'hiv', compartment: 'galt',
      auc_24: 126400, mic: 0.51, tau: 5.3945, k_admet: 0.05, r_penetration: 0.35, k_barrier: 0.4559, k_biofilm: 0 },
    { compound_id: 300, drug_name: 'VAN', drug_class: 'antibiotic', disease: 'mrsa', compartment: 'bone',
      auc_24: 400, mic: 1.0, tau: 2.602, k_admet: 0.50, r_penetration: 0.20, k_barrier: 0.699, k_biofilm: 2.709 },
    { compound_id: 301, drug_name: 'VAN', drug_class: 'antibiotic', disease: 'mrsa', compartment: 'planktonic',
      auc_24: 400, mic: 1.0, tau: 2.602, k_admet: 0.50, r_penetration: 1.0, k_barrier: 0, k_biofilm: 2.709 },
  ];

  let universe;
  beforeAll(() => { universe = buildUniverse(MULTI_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('filters by disease AND compartment correctly', () => {
    const results = coverEvaluate(universe, { disease: 'hiv', tissue: 'cns' });
    expect(results).toHaveLength(1);
    expect(results[0].drug).toBe('DTG');
  });

  it('filters by disease only returns multiple compartments', () => {
    const results = coverEvaluate(universe, { disease: 'hiv' });
    expect(results).toHaveLength(2);
  });

  it('empty filter returns all records', () => {
    const results = coverEvaluate(universe, {});
    expect(results).toHaveLength(4);
  });

  it('case-insensitive filter matching', () => {
    const results = coverEvaluate(universe, { disease: 'HIV' });
    expect(results).toHaveLength(2);
  });

  it('ASC ranking reverses order', () => {
    const results = coverEvaluate(universe, { disease: 'hiv' }, { rankDir: 'ASC' });
    expect(results[0].C).toBeLessThanOrEqual(results[1].C);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §11  GQL parser — DECOMPOSE, COMPARE via text
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('universeGQL() — new verbs', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('parses DECOMPOSE query', () => {
    const q = "DECOMPOSE mirador_universe ON drug = 'VAN' AND tissue = 'bone';";
    const result = universeGQL(q, universe);
    expect(result).not.toBeNull();
    expect(result.drug).toBe('VAN');
    expect(result.decomposition).toHaveProperty('k_admet');
    expect(result.dominant_barrier).toBeTruthy();
  });

  it('DECOMPOSE returns error for unknown drug', () => {
    const q = "DECOMPOSE mirador_universe ON drug = 'NOPE' AND tissue = 'bone';";
    const result = universeGQL(q, universe);
    expect(result).toHaveProperty('error');
  });

  it('parses COMPARE query', () => {
    const q = "COMPARE ['VAN', 'RIF'] ON mirador_universe WHERE tissue = 'bone';";
    const result = universeGQL(q, universe);
    expect(result).not.toBeNull();
    expect(result.drugs).toHaveLength(2);
    expect(result.winner).toBeTruthy();
  });

  it('COMPARE with single drug still works', () => {
    const q = "COMPARE ['VAN'] ON mirador_universe WHERE tissue = 'bone';";
    const result = universeGQL(q, universe);
    expect(result).not.toBeNull();
    expect(result.drugs).toHaveLength(1);
  });

  it('COMPARE returns error when zero drugs match', () => {
    const q = "COMPARE ['NOPE'] ON mirador_universe WHERE tissue = 'bone';";
    const result = universeGQL(q, universe);
    expect(result).toHaveProperty('error');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9  Natural Language → GQL (3-stage pipeline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('translateNL() – Stage 1-3 (no execution)', () => {
  it('classifies single drug check intent', () => {
    const r = translateNL('Can vancomycin reach MRSA in bone?');
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('single_drug_check');
    expect(r.entities.drugs).toContain('VAN');
    expect(r.entities.diseases).toContain('mrsa');
    expect(r.entities.tissues).toContain('bone');
    expect(r.generated_gql).toMatch(/DECOMPOSE.*VAN.*bone/);
  });

  it('classifies drug ranking intent', () => {
    const r = translateNL('Which drug is best for MRSA in bone?');
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('drug_ranking');
    expect(r.generated_gql).toMatch(/COVER ON mirador_universe/);
    expect(r.generated_gql).toMatch(/RANK BY coherence DESC/);
  });

  it('classifies failure diagnosis intent', () => {
    const r = translateNL('Why does vancomycin fail in bone?');
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('failure_diagnosis');
    expect(r.generated_gql).toMatch(/DECOMPOSE.*VAN.*bone/);
  });

  it('classifies comparison intent', () => {
    const r = translateNL('Compare vancomycin vs rifampin at bone');
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('comparison');
    expect(r.generated_gql).toMatch(/COMPARE.*VAN.*RIF.*bone/);
  });

  it('classifies combination intent', () => {
    const r = translateNL('What combination of VAN plus RIF for MRSA?');
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('combination_query');
    expect(r.generated_gql).toMatch(/COMBINE.*VAN.*RIF/);
  });

  it('extracts multi-word tissue phrases', () => {
    const r = translateNL('Can DTG cross the blood-brain barrier for HIV?');
    expect(r.status).toBe('ok');
    expect(r.entities.tissues).toContain('cns');
  });

  it('defaults tissue from disease when tissue omitted', () => {
    const r = translateNL('Which drug is best for MRSA?');
    expect(r.status).toBe('ok');
    expect(r.generated_gql).toMatch(/tissue = 'bone'/);
  });

  it('returns clarification when question is vague', () => {
    const r = translateNL('Tell me about drugs');
    expect(r.status).toBe('clarification_needed');
    expect(r.options).toBeDefined();
    expect(r.options.length).toBeGreaterThan(0);
  });

  it('downgrades combination to ranking when < 2 drugs', () => {
    const r = translateNL('What combination for MRSA?');
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('drug_ranking');
  });

  it('returns error for empty question', () => {
    const r = translateNL('');
    expect(r.status).toBe('error');
  });

  it('handles drug abbreviations (3-letter codes)', () => {
    const r = translateNL('Does LZD work for MRSA in bone?');
    expect(r.entities.drugs).toContain('LZD');
  });

  it('maps full drug names case-insensitively', () => {
    const r = translateNL('does Daptomycin reach bone?');
    expect(r.entities.drugs).toContain('DAP');
  });
});

describe('nlToGql() – Full pipeline with execution', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('returns answer for single drug check', () => {
    const r = nlToGql('Can vancomycin reach MRSA in bone?', universe);
    expect(r.status).toBe('ok');
    expect(r.answer).toBeDefined();
    expect(r.answer.length).toBeGreaterThan(10);
    expect(r.verdict).toMatch(/threshold/);
    expect(r.generated_gql).toBeDefined();
  });

  it('returns ranking with drug list', () => {
    const r = nlToGql('Which drug is best for MRSA at bone?', universe);
    expect(r.status).toBe('ok');
    expect(r.answer).toMatch(/drug/i);
    expect(r.result.rows).toBeDefined();
    expect(r.result.rows.length).toBeGreaterThan(0);
  });

  it('returns failure diagnosis with impedance breakdown', () => {
    const r = nlToGql('Why does vancomycin fail in bone?', universe);
    expect(r.status).toBe('ok');
    expect(r.answer).toMatch(/k_/i);
    expect(r.verdict).toMatch(/threshold/);
  });

  it('returns comparison with winner', () => {
    const r = nlToGql('Compare VAN vs RIF in bone', universe);
    expect(r.status).toBe('ok');
    expect(r.answer).toMatch(/Winner/);
  });

  it('generates follow-up queries', () => {
    const r = nlToGql('Can vancomycin reach MRSA in bone?', universe);
    expect(r.follow_ups).toBeDefined();
    expect(r.follow_ups.length).toBeGreaterThan(0);
    for (const f of r.follow_ups) {
      expect(f.label).toBeDefined();
      expect(f.gql).toBeDefined();
    }
  });

  it('returns error for null universe', () => {
    const r = nlToGql('Can vancomycin reach bone?', null);
    expect(r.status).toBe('error');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — Tier 1: Disease-specific thresholds
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — DISEASE_THRESHOLDS', () => {
  it('exports disease-specific thresholds object', () => {
    expect(DISEASE_THRESHOLDS).toBeDefined();
    expect(DISEASE_THRESHOLDS.mrsa.theta).toBe(5.0);
    expect(DISEASE_THRESHOLDS.tb.theta).toBe(0.50);
    expect(DISEASE_THRESHOLDS.meningitis.theta).toBe(0.50);
    expect(DISEASE_THRESHOLDS.hiv.theta).toBe(1.0);
  });

  it('each threshold has an anchor description', () => {
    for (const [, val] of Object.entries(DISEASE_THRESHOLDS)) {
      expect(val.anchor).toBeDefined();
      expect(typeof val.anchor).toBe('string');
    }
  });
});

describe('v1.0 — decompose() with disease-specific threshold', () => {
  let universe;
  beforeAll(() => {
    // Use full DEMO_DB-style drugs with varied diseases
    const drugs = [
      { compound_id: 300, drug_name: 'VAN', drug_class: 'antibiotic', disease: 'mrsa', compartment: 'bone', auc_24: 400, mic: 1.0, tau: 2.602, k_admet: 0.50, r_penetration: 0.20, k_barrier: 0.699, k_biofilm: 2.709 },
      { compound_id: 200, drug_name: 'CRO', drug_class: 'antibiotic', disease: 'meningitis', compartment: 'csf_inflamed', auc_24: 1000, mic: 0.015, tau: 4.824, k_admet: 0.10, r_penetration: 0.15, k_barrier: 0.824, k_biofilm: 0 },
      { compound_id: 100, drug_name: 'DTG', drug_class: 'INSTI', disease: 'hiv', compartment: 'cns', auc_24: 126400, mic: 0.51, tau: 5.3945, k_admet: 0.05, r_penetration: 0.01, k_barrier: 2.0, k_biofilm: 0 },
    ];
    universe = buildUniverse(drugs, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS);
  });

  it('uses θ=5.0 for MRSA', () => {
    const r = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(r.threshold).toBe(5.0);
  });

  it('uses θ=0.50 for meningitis', () => {
    const r = decompose(universe, { drug: 'CRO', tissue: 'csf_inflamed' });
    expect(r.threshold).toBe(0.50);
  });

  it('uses θ=1.0 for HIV', () => {
    const r = decompose(universe, { drug: 'DTG', tissue: 'cns' });
    expect(r.threshold).toBe(1.0);
  });

  it('geometric_verdict uses disease-specific threshold', () => {
    const r = decompose(universe, { drug: 'CRO', tissue: 'csf_inflamed' });
    // CRO meningitis C should be compared against 0.50, not 5.0
    expect(r.geometric_verdict).toBeDefined();
    expect(r.threshold).toBe(0.50);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — Confidence + Provenance helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — describeConfidence()', () => {
  it('high confidence >= 0.85', () => {
    expect(describeConfidence(0.90)).toMatch(/high/i);
  });

  it('moderate confidence 0.60–0.84', () => {
    expect(describeConfidence(0.70)).toMatch(/moderate/i);
  });

  it('low confidence < 0.60', () => {
    expect(describeConfidence(0.40)).toMatch(/low/i);
  });
});

describe('v1.0 — getDominantK()', () => {
  it('identifies the largest K component', () => {
    const decomp = { k_admet: 0.5, k_barrier: 1.63, k_biofilm: 2.57 };
    const result = getDominantK(decomp);
    expect(result.key).toBe('k_biofilm');
    expect(result.value).toBeCloseTo(2.57);
    expect(result.name).toBeDefined();
  });

  it('returns meaningful name for k_barrier', () => {
    const decomp = { k_admet: 0.1, k_barrier: 3.0, k_biofilm: 0.5 };
    const result = getDominantK(decomp);
    expect(result.key).toBe('k_barrier');
    expect(result.name).toMatch(/penetration|barrier/i);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — Enhanced answer generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — nlToGql() enhanced answers', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('answer includes confidence description', () => {
    const r = nlToGql('Can vancomycin reach MRSA in bone?', universe);
    expect(r.answer).toMatch(/confidence/i);
  });

  it('answer includes dominant barrier explanation', () => {
    const r = nlToGql('Can vancomycin reach MRSA in bone?', universe);
    expect(r.answer).toMatch(/dominant|barrier/i);
  });

  it('answer uses geometric_verdict_note disclaimer', () => {
    const r = nlToGql('Can vancomycin reach MRSA in bone?', universe);
    expect(r.geometric_verdict_note).toBeDefined();
    expect(r.geometric_verdict_note).toMatch(/not.*clinical/i);
  });

  it('failure diagnosis includes full K breakdown', () => {
    const r = nlToGql('Why does vancomycin fail in bone?', universe);
    expect(r.answer).toMatch(/k_admet|k_barrier|k_biofilm/i);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — Tier 2: DHOOM wire format
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — DHOOM wire format', () => {
  it('toDHOOM() produces pipe-delimited string', () => {
    const data = [{ drug: 'VAN', tissue: 'bone', C: 2.08, theta: 5.0, pass: 'N', conf: 0.70 }];
    const dhoom = toDHOOM(data, ['drug', 'tissue', 'C', 'theta', 'pass', 'conf']);
    expect(typeof dhoom).toBe('string');
    expect(dhoom).toContain('|');
    expect(dhoom.split('\n')[0]).toBe('drug|tissue|C|theta|pass|conf');
    expect(dhoom.split('\n')[1]).toContain('VAN');
  });

  it('fromDHOOM() parses back to objects', () => {
    const dhoom = 'drug|tissue|C\nVAN|bone|2.08\nRIF|bone|0.68';
    const rows = fromDHOOM(dhoom);
    expect(rows).toHaveLength(2);
    expect(rows[0].drug).toBe('VAN');
    expect(rows[0].C).toBe('2.08');
  });

  it('round-trip: toDHOOM -> fromDHOOM preserves data', () => {
    const data = [
      { drug: 'VAN', C: 2.08, pass: 'N' },
      { drug: 'RIF', C: 0.68, pass: 'N' },
    ];
    const dhoom = toDHOOM(data, ['drug', 'C', 'pass']);
    const parsed = fromDHOOM(dhoom);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].drug).toBe('VAN');
    expect(parsed[1].drug).toBe('RIF');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — Tier 3: Patient context
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — applyPatientContext()', () => {
  it('adjusts R for high CRP (> 100)', () => {
    const drug = { R_bone: 0.20, k_barrier: 0.699, k_admet: 0.50, k_biofilm: 2.57, tau: 2.602 };
    const patient = { crp_mg_L: 250, chronicity: 'chronic' };
    const result = applyPatientContext({ ...drug }, patient);
    expect(result.R_eff).toBeGreaterThan(drug.R_bone);
    expect(result.R_eff).toBeLessThanOrEqual(drug.R_bone * 2.0);
  });

  it('caps CRP multiplier at 2.0', () => {
    const drug = { R_bone: 0.20, k_barrier: 0.699, k_admet: 0.50, k_biofilm: 2.57, tau: 2.602 };
    const patient = { crp_mg_L: 999, chronicity: 'chronic' };
    const result = applyPatientContext({ ...drug }, patient);
    expect(result.R_eff).toBeCloseTo(drug.R_bone * 2.0, 4);
  });

  it('acute chronicity halves MBEC penalty', () => {
    const drug = { R_bone: 0.20, k_barrier: 0.699, k_admet: 0.50, k_biofilm: 2.57, tau: 2.602 };
    const patient = { crp_mg_L: 100, chronicity: 'acute' };
    const result = applyPatientContext({ ...drug }, patient);
    expect(result.MBEC_factor).toBe(0.5);
  });

  it('chronic chronicity keeps full MBEC', () => {
    const drug = { R_bone: 0.20, k_barrier: 0.699, k_admet: 0.50, k_biofilm: 2.57, tau: 2.602 };
    const patient = { crp_mg_L: 100, chronicity: 'chronic' };
    const result = applyPatientContext({ ...drug }, patient);
    expect(result.MBEC_factor).toBe(1.0);
  });

  it('recomputes K and C from adjusted values', () => {
    const drug = { R_bone: 0.20, k_barrier: 0.699, k_admet: 0.50, k_biofilm: 2.57, tau: 2.602 };
    const patient = { crp_mg_L: 250, chronicity: 'chronic' };
    const result = applyPatientContext({ ...drug }, patient);
    expect(result.K).toBeDefined();
    expect(result.C).toBeDefined();
    expect(typeof result.K).toBe('number');
    expect(typeof result.C).toBe('number');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — Tier 5: New intents (COMPLETE, PROPAGATE)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — new intent patterns', () => {
  it('classifies predict_unmeasured intent', () => {
    const r = translateNL("Can you predict tedizolid's bone penetration?");
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('predict_unmeasured');
    expect(r.generated_gql).toMatch(/COMPLETE/);
  });

  it('classifies cascade_analysis intent', () => {
    const r = translateNL('If we measured tedizolid in bone, what else would we learn?');
    expect(r.status).toBe('ok');
    expect(r.intent).toBe('cascade_analysis');
    expect(r.generated_gql).toMatch(/PROPAGATE/);
  });

  it('generates COMPLETE GQL for predict questions', () => {
    const r = translateNL('Estimate linezolid at CSF');
    expect(r.status).toBe('ok');
    expect(r.generated_gql).toMatch(/COMPLETE ON mirador_universe/);
  });

  it('generates PROPAGATE GQL for cascade questions', () => {
    const r = translateNL('If I measured VAN at bone, what else would we learn?');
    expect(r.status).toBe('ok');
    expect(r.generated_gql).toMatch(/PROPAGATE ON mirador_universe/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — Geometric verdict language
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — geometric verdict language', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('decompose uses "below_threshold" / "above_threshold" language', () => {
    const r = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(r.geometric_verdict).toMatch(/below_threshold|above_threshold/);
  });

  it('decompose verdict_note says not clinical guidance', () => {
    const r = decompose(universe, { drug: 'VAN', tissue: 'bone' });
    expect(r.geometric_verdict_note).toBeDefined();
    expect(r.geometric_verdict_note).toMatch(/not.*clinical/i);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — GQL parser: COMPLETE + PROPAGATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — universeGQL() new verbs', () => {
  let universe;
  beforeAll(() => { universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS); });

  it('parses COMPLETE query', () => {
    const q = "COMPLETE ON mirador_universe WHERE drug = 'VAN' AND tissue = 'bone' METHOD sheaf_extension";
    const result = universeGQL(q, universe);
    expect(result).not.toBeNull();
    expect(result.origin).toBe('sheaf_completed');
  });

  it('parses PROPAGATE query', () => {
    const q = "PROPAGATE ON mirador_universe ASSUMING drug = 'VAN' AND tissue = 'bone' AND R = 0.20 SHOW newly_determined";
    const result = universeGQL(q, universe);
    expect(result).not.toBeNull();
    expect(result.cascades).toBeDefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// v1.0 UPGRADE TESTS — mycobacterium bug fix
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('v1.0 — bug fix: mycobacterium maps to tb', () => {
  it('mycobacterium → tb (not mrsa)', () => {
    const r = translateNL('Can INH treat mycobacterium infection?');
    expect(r.entities.diseases).toContain('tb');
    expect(r.entities.diseases).not.toContain('mrsa');
  });
});
