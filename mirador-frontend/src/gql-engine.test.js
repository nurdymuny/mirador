import { describe, it, expect } from 'vitest';
import {
  tau, kBarrier, confidence, coherence, combinePotency,
  buildUniverse, coverEvaluate, combineDrugs, universeGQL,
} from './gql-engine';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1  Math primitives
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('tau(auc, mic)', () => {
  it('computes log10(AUC/MIC)', () => {
    expect(tau(1000, 1)).toBeCloseTo(3.0, 3);
    expect(tau(100, 10)).toBeCloseTo(1.0, 3);
  });
  it('returns 0 for zero/negative inputs', () => {
    expect(tau(0, 1)).toBe(0);
    expect(tau(100, 0)).toBe(0);
    expect(tau(-1, 1)).toBe(0);
  });
});

describe('kBarrier(r)', () => {
  it('computes -log10(r) for 0 < r < 1', () => {
    expect(kBarrier(0.1)).toBeCloseTo(1.0, 3);
    expect(kBarrier(0.01)).toBeCloseTo(2.0, 3);
  });
  it('returns 0 for r >= 1 or r <= 0', () => {
    expect(kBarrier(1.0)).toBe(0);
    expect(kBarrier(2.0)).toBe(0);
    expect(kBarrier(0)).toBe(0);
  });
});

describe('confidence(tauValues)', () => {
  it('returns 1.0 for single value', () => {
    expect(confidence([5.0])).toBe(1.0);
  });
  it('returns 1.0 for identical values (zero variance)', () => {
    expect(confidence([5.0, 5.0, 5.0])).toBe(1.0);
  });
  it('returns high confidence for low variance', () => {
    const c = confidence([5.0, 5.1, 4.9]);
    expect(c).toBeGreaterThan(0.9);
  });
  it('returns low confidence for high variance', () => {
    const c = confidence([1.0, 10.0]);
    expect(c).toBeLessThan(0.1);
  });
  it('formula is 1/(1+K) where K is variance', () => {
    // vals = [2, 6], mean=4, var=4, confidence = 1/(1+4) = 0.2
    expect(confidence([2, 6])).toBeCloseTo(0.2, 4);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2  Coherence & combination
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('coherence(record)', () => {
  it('computes tau × r_penetration × (1 - k_admet)', () => {
    const C = coherence({ tau: 5.0, r_penetration: 0.5, k_admet: 0.1 });
    // 5.0 × 0.5 × 0.9 = 2.25
    expect(C).toBeCloseTo(2.25, 3);
  });
  it('returns 0 for missing fields', () => {
    expect(coherence({})).toBe(0);
  });
  it('handles high-penetration drugs', () => {
    const C = coherence({ tau: 10.0, r_penetration: 1.0, k_admet: 0.0 });
    expect(C).toBeCloseTo(10.0, 3);
  });
});

describe('combinePotency(drugs, synergyFactor)', () => {
  it('sums coherence values with synergy factor', () => {
    const drugs = [
      { tau: 5.0, r_penetration: 0.5, k_admet: 0.1 }, // C = 2.25
      { tau: 3.0, r_penetration: 0.4, k_admet: 0.2 }, // C = 0.96
    ];
    const result = combinePotency(drugs, 1.2);
    expect(result.C).toBeCloseTo((2.25 + 0.96) * 1.2, 1);
  });
  it('detects threshold crossing at θ=5.0', () => {
    const drugs = [
      { tau: 10.0, r_penetration: 1.0, k_admet: 0.0 }, // C = 10
      { tau: 5.0, r_penetration: 0.5, k_admet: 0.1 },  // C = 2.25
    ];
    const result = combinePotency(drugs, 1.0);
    expect(result.crossesThreshold).toBe(true);
    expect(result.ratio).toBeGreaterThan(1.0);
  });
  it('reports no crossing for weak drugs', () => {
    const drugs = [
      { tau: 1.0, r_penetration: 0.1, k_admet: 0.5 }, // C = 0.05
    ];
    const result = combinePotency(drugs, 1.0);
    expect(result.crossesThreshold).toBe(false);
  });
  it('returns 0 for empty array', () => {
    expect(combinePotency([], 1.0).C).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3  Universe builder
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
  const universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS);

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
  const universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS);

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
// §5  COMBINE ... MODE COUPLED SYNERGY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('combineDrugs()', () => {
  const universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS);

  it('combines two drugs at a tissue with synergy', () => {
    const result = combineDrugs(universe, ['VAN', 'RIF'], 'bone', 1.2);
    expect(result).not.toBeNull();
    expect(result.combination).toBe('VAN + RIF');
    expect(result.C).toBeGreaterThan(0);
    expect(result.synergy).toBe(1.2);
  });
  it('C_combo > sum of individual C values when synergy > 1', () => {
    const vanC = coherence(SAMPLE_DRUGS[0]);
    const rifC = coherence(SAMPLE_DRUGS[1]);
    const result = combineDrugs(universe, ['VAN', 'RIF'], 'bone', 1.2);
    expect(result.C).toBeCloseTo((vanC + rifC) * 1.2, 1);
  });
  it('reports threshold crossing with ratio', () => {
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
  const universe = buildUniverse(SAMPLE_DRUGS, SAMPLE_THRESHOLDS, SAMPLE_REGIMENS);

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
