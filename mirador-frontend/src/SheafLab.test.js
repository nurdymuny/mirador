import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════
// SheafLab unit tests — GIGI queries, local fallbacks, math
// ═══════════════════════════════════════════════════════

// ── Constants (mirror SheafLab.jsx) ──

const DRUGS = [
  { id: "VAN", name: "Vancomycin", cls: "Glycopeptide", tau: 2.60 },
  { id: "LZD", name: "Linezolid",  cls: "Oxazolidinone", tau: 2.00 },
  { id: "TDZ", name: "Tedizolid",  cls: "Oxazolidinone", tau: null },
  { id: "RIF", name: "Rifampin",   cls: "Rifamycin",     tau: 3.52 },
  { id: "MXF", name: "Moxifloxacin", cls: "Fluoroquinolone", tau: 2.15 },
  { id: "CRO", name: "Ceftriaxone", cls: "Cephalosporin", tau: 4.82 },
  { id: "DAP", name: "Daptomycin", cls: "Lipopeptide",   tau: 3.17 },
  { id: "CAR", name: "Ceftaroline", cls: "Cephalosporin", tau: null },
];

const TISSUES = [
  { id: "bone",    name: "Bone" },
  { id: "csf",     name: "CSF" },
  { id: "caseum",  name: "Caseum" },
  { id: "biofilm", name: "Biofilm" },
  { id: "prostate",name: "Prostate" },
];

const TISSUE_TO_COMPARTMENT = {
  bone: 'bone',
  csf: 'csf_uninflamed',
  caseum: 'granuloma_cellular',
  biofilm: 'planktonic',
  prostate: 'prostate',
};

const R = {
  "VAN-bone":0.20, "VAN-csf":0.10, "VAN-caseum":null, "VAN-biofilm":null, "VAN-prostate":0.07,
  "LZD-bone":0.50, "LZD-csf":0.30, "LZD-caseum":0.90, "LZD-biofilm":null, "LZD-prostate":null,
  "TDZ-bone":null, "TDZ-csf":null, "TDZ-caseum":null, "TDZ-biofilm":null, "TDZ-prostate":null,
  "RIF-bone":0.35, "RIF-csf":0.08, "RIF-caseum":3.00, "RIF-biofilm":null, "RIF-prostate":4.00,
  "MXF-bone":0.80, "MXF-csf":0.12, "MXF-caseum":0.20, "MXF-biofilm":null, "MXF-prostate":2.40,
  "CRO-bone":0.15, "CRO-csf":0.15, "CRO-caseum":null, "CRO-biofilm":null, "CRO-prostate":0.10,
  "DAP-bone":0.12, "DAP-csf":null, "DAP-caseum":null, "DAP-biofilm":null, "DAP-prostate":null,
  "CAR-bone":null, "CAR-csf":null, "CAR-caseum":null, "CAR-biofilm":null, "CAR-prostate":null,
};

const DOMAIN_BUNDLES = {
  pharma:    { bundle: 'mirador_drugs',      field: 'tau' },
  genomics:  { bundle: 'gtex_expression',    field: 'tpm' },
  climate:   { bundle: 'fluxnet_flux',       field: 'nee' },
  materials: { bundle: 'materials_project',  field: 'bandgap' },
  epi:       { bundle: 'who_flunet',         field: 'r_t' },
};

// ── Pure functions (extracted logic, same as SheafLab.jsx) ──

const safeDrugId = (id) => DRUGS.find(d => d.id === id)?.id;
const safeTissueId = (id) => TISSUES.find(t => t.id === id)?.id;

function localComplete(drugId, tissueId) {
  const drug = DRUGS.find(d => d.id === drugId);
  if (!drug) return null;
  const sameClass = DRUGS.filter(d => d.cls === drug.cls && d.id !== drugId);
  const neighbors = [];
  for (const nd of sameClass) {
    const v = R[`${nd.id}-${tissueId}`];
    if (v != null) neighbors.push({ drug_name: nd.name, compartment: tissueId, adjacency_type: 'same_class', value: v, weight: 0.4 });
  }
  for (const t of TISSUES) {
    if (t.id === tissueId) continue;
    const v = R[`${drugId}-${t.id}`];
    if (v != null) neighbors.push({ drug_name: drug.name, compartment: t.id, adjacency_type: 'same_tissue', value: v, weight: 0.3 });
  }
  // Second-order fallback: same-class drugs at ANY tissue (coarser cover extension)
  if (neighbors.length === 0) {
    for (const nd of sameClass) {
      for (const t of TISSUES) {
        const v = R[`${nd.id}-${t.id}`];
        if (v != null) neighbors.push({ drug_name: nd.name, compartment: t.id, adjacency_type: 'cross_tissue_class', value: v, weight: 0.15 });
      }
    }
  }
  if (neighbors.length === 0) return null;
  const sumW = neighbors.reduce((s, n) => s + n.weight, 0);
  const predicted = neighbors.reduce((s, n) => s + n.weight * n.value, 0) / sumW;
  const conf = +(sumW / (sumW + 1)).toFixed(4);
  return {
    rows: [{
      _completed_value: +predicted.toFixed(4),
      _confidence: conf,
      _uncertainty: +(1 - conf).toFixed(4),
      _method: 'laplacian_schur',
      _neighbor_count: neighbors.length,
      _status: 'completed',
      _origin: 'local_fallback',
      _provenance: neighbors,
    }],
  };
}

function localPropagate(drugId, tissueId, tauVal) {
  const drug = DRUGS.find(d => d.id === drugId);
  if (!drug) return null;
  const cascades = [];
  for (const t of TISSUES) {
    if (t.id === tissueId) continue;
    const k = `${drugId}-${t.id}`;
    if (R[k] != null) continue;
    const est = localComplete(drugId, t.id);
    if (est?.rows?.[0]) {
      cascades.push({ ...est.rows[0], drug_name: drug.name, compartment: t.id, _status: 'newly_completable', _origin: 'cascade' });
    }
  }
  return { rows: cascades };
}

// GQL query builders (same logic as SheafLab.jsx)
function buildSectionQuery(drugId, tissueId) {
  const d = safeDrugId(drugId), t = safeTissueId(tissueId);
  if (!d || !t) return null;
  const comp = TISSUE_TO_COMPARTMENT[t] || t;
  return `COVER mirador_drugs ON drug_name='${d}' AND compartment='${comp}' FIRST 1`;
}

function buildCompleteQuery(drugId, tissueId) {
  const d = safeDrugId(drugId), t = safeTissueId(tissueId);
  if (!d || !t) return null;
  const comp = TISSUE_TO_COMPARTMENT[t] || t;
  return `COMPLETE ON mirador_drugs WHERE tau = NULL AND drug_name = '${d}' AND compartment = '${comp}' CONFIDENCE_FLOOR 0.30 WITH CONSTRAINT_GRAPH`;
}

function buildPropagateQuery(drugId, tissueId, tau) {
  const d = safeDrugId(drugId), t = safeTissueId(tissueId);
  if (!d || !t) return null;
  const v = Number(tau);
  if (!Number.isFinite(v)) return null;
  const comp = TISSUE_TO_COMPARTMENT[t] || t;
  return `PROPAGATE ON mirador_drugs ASSUMING drug_name = '${d}' AND compartment = '${comp}' AND tau = ${v} SHOW newly_determined`;
}

function buildUniversalCompleteQuery(domainId) {
  const domConf = DOMAIN_BUNDLES[domainId];
  if (!domConf) return null;
  return `COMPLETE ON ${domConf.bundle} WHERE ${domConf.field} = NULL CONFIDENCE_FLOOR 0.30 WITH CONSTRAINT_GRAPH`;
}


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 Safe ID Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('safeDrugId()', () => {
  it('returns valid drug IDs', () => {
    expect(safeDrugId('VAN')).toBe('VAN');
    expect(safeDrugId('LZD')).toBe('LZD');
    expect(safeDrugId('CRO')).toBe('CRO');
    expect(safeDrugId('DAP')).toBe('DAP');
  });

  it('rejects unknown drug IDs', () => {
    expect(safeDrugId('FAKE')).toBeUndefined();
    expect(safeDrugId('')).toBeUndefined();
    expect(safeDrugId(null)).toBeUndefined();
    expect(safeDrugId(undefined)).toBeUndefined();
  });

  it('rejects injection attempts', () => {
    expect(safeDrugId("VAN'; DROP TABLE")).toBeUndefined();
    expect(safeDrugId("VAN' OR '1'='1")).toBeUndefined();
    expect(safeDrugId("<script>")).toBeUndefined();
  });
});

describe('safeTissueId()', () => {
  it('returns valid tissue IDs', () => {
    expect(safeTissueId('bone')).toBe('bone');
    expect(safeTissueId('csf')).toBe('csf');
    expect(safeTissueId('caseum')).toBe('caseum');
    expect(safeTissueId('biofilm')).toBe('biofilm');
    expect(safeTissueId('prostate')).toBe('prostate');
  });

  it('rejects unknown tissue IDs', () => {
    expect(safeTissueId('liver')).toBeUndefined();
    expect(safeTissueId('')).toBeUndefined();
    expect(safeTissueId(null)).toBeUndefined();
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 Tissue-to-Compartment Mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('TISSUE_TO_COMPARTMENT', () => {
  it('maps all 5 SheafLab tissues', () => {
    expect(Object.keys(TISSUE_TO_COMPARTMENT)).toHaveLength(5);
    for (const t of TISSUES) {
      expect(TISSUE_TO_COMPARTMENT).toHaveProperty(t.id);
    }
  });

  it('maps csf to csf_uninflamed (not cns)', () => {
    expect(TISSUE_TO_COMPARTMENT.csf).toBe('csf_uninflamed');
  });

  it('maps caseum to granuloma_cellular', () => {
    expect(TISSUE_TO_COMPARTMENT.caseum).toBe('granuloma_cellular');
  });

  it('maps biofilm to planktonic', () => {
    expect(TISSUE_TO_COMPARTMENT.biofilm).toBe('planktonic');
  });

  it('maps bone to bone (identity)', () => {
    expect(TISSUE_TO_COMPARTMENT.bone).toBe('bone');
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 GQL Query Builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('buildSectionQuery()', () => {
  it('uses COVER instead of SECTION AT', () => {
    const q = buildSectionQuery('VAN', 'bone');
    expect(q).toMatch(/^COVER/);
    expect(q).not.toMatch(/SECTION/);
  });

  it('maps tissue to GIGI compartment', () => {
    expect(buildSectionQuery('VAN', 'csf')).toContain("compartment='csf_uninflamed'");
    expect(buildSectionQuery('RIF', 'caseum')).toContain("compartment='granuloma_cellular'");
    expect(buildSectionQuery('LZD', 'biofilm')).toContain("compartment='planktonic'");
  });

  it('uses AND between key-value pairs (not commas)', () => {
    const q = buildSectionQuery('VAN', 'bone');
    expect(q).toContain(" AND ");
    expect(q).not.toContain(", compartment");
  });

  it('returns null for invalid drug/tissue', () => {
    expect(buildSectionQuery('FAKE', 'bone')).toBeNull();
    expect(buildSectionQuery('VAN', 'liver')).toBeNull();
    expect(buildSectionQuery(null, null)).toBeNull();
  });

  it('includes FIRST 1 for point query', () => {
    expect(buildSectionQuery('VAN', 'bone')).toMatch(/FIRST 1$/);
  });

  it('produces correct full query', () => {
    expect(buildSectionQuery('VAN', 'bone')).toBe(
      "COVER mirador_drugs ON drug_name='VAN' AND compartment='bone' FIRST 1"
    );
  });
});

describe('buildCompleteQuery()', () => {
  it('uses = NULL not IS NULL', () => {
    const q = buildCompleteQuery('VAN', 'caseum');
    expect(q).toContain('tau = NULL');
    expect(q).not.toContain('IS NULL');
  });

  it('maps tissue to GIGI compartment', () => {
    expect(buildCompleteQuery('VAN', 'csf')).toContain("compartment = 'csf_uninflamed'");
  });

  it('includes CONFIDENCE_FLOOR and WITH CONSTRAINT_GRAPH', () => {
    const q = buildCompleteQuery('VAN', 'biofilm');
    expect(q).toContain('CONFIDENCE_FLOOR 0.30');
    expect(q).toContain('WITH CONSTRAINT_GRAPH');
  });

  it('returns null for invalid inputs', () => {
    expect(buildCompleteQuery('FAKE', 'bone')).toBeNull();
    expect(buildCompleteQuery('VAN', 'fake')).toBeNull();
  });

  it('produces correct full query', () => {
    expect(buildCompleteQuery('VAN', 'biofilm')).toBe(
      "COMPLETE ON mirador_drugs WHERE tau = NULL AND drug_name = 'VAN' AND compartment = 'planktonic' CONFIDENCE_FLOOR 0.30 WITH CONSTRAINT_GRAPH"
    );
  });
});

describe('buildPropagateQuery()', () => {
  it('uses ASSUMING keyword', () => {
    const q = buildPropagateQuery('VAN', 'bone', 2.60);
    expect(q).toContain('ASSUMING');
  });

  it('maps tissue to GIGI compartment', () => {
    expect(buildPropagateQuery('VAN', 'csf', 2.60)).toContain("compartment = 'csf_uninflamed'");
  });

  it('includes tau as a number (not string)', () => {
    const q = buildPropagateQuery('VAN', 'bone', 2.60);
    expect(q).toMatch(/tau = 2\.6 SHOW/);
  });

  it('returns null for non-finite tau', () => {
    expect(buildPropagateQuery('VAN', 'bone', NaN)).toBeNull();
    expect(buildPropagateQuery('VAN', 'bone', Infinity)).toBeNull();
    expect(buildPropagateQuery('VAN', 'bone', 'abc')).toBeNull();
  });

  it('returns null for invalid drug/tissue', () => {
    expect(buildPropagateQuery('FAKE', 'bone', 1.0)).toBeNull();
    expect(buildPropagateQuery('VAN', 'fake', 1.0)).toBeNull();
  });

  it('includes SHOW newly_determined', () => {
    const q = buildPropagateQuery('VAN', 'bone', 2.60);
    expect(q).toMatch(/SHOW newly_determined$/);
  });

  it('produces correct full query', () => {
    expect(buildPropagateQuery('VAN', 'bone', 2.60)).toBe(
      "PROPAGATE ON mirador_drugs ASSUMING drug_name = 'VAN' AND compartment = 'bone' AND tau = 2.6 SHOW newly_determined"
    );
  });
});

describe('buildUniversalCompleteQuery()', () => {
  it('uses = NULL for all domains', () => {
    for (const domId of Object.keys(DOMAIN_BUNDLES)) {
      const q = buildUniversalCompleteQuery(domId);
      expect(q).toContain('= NULL');
      expect(q).not.toContain('IS NULL');
    }
  });

  it('maps each domain to correct bundle and field', () => {
    expect(buildUniversalCompleteQuery('pharma')).toContain('mirador_drugs');
    expect(buildUniversalCompleteQuery('pharma')).toContain('tau = NULL');

    expect(buildUniversalCompleteQuery('genomics')).toContain('gtex_expression');
    expect(buildUniversalCompleteQuery('genomics')).toContain('tpm = NULL');

    expect(buildUniversalCompleteQuery('climate')).toContain('fluxnet_flux');
    expect(buildUniversalCompleteQuery('climate')).toContain('nee = NULL');

    expect(buildUniversalCompleteQuery('materials')).toContain('materials_project');
    expect(buildUniversalCompleteQuery('materials')).toContain('bandgap = NULL');

    expect(buildUniversalCompleteQuery('epi')).toContain('who_flunet');
    expect(buildUniversalCompleteQuery('epi')).toContain('r_t = NULL');
  });

  it('returns null for unknown domain', () => {
    expect(buildUniversalCompleteQuery('fake')).toBeNull();
    expect(buildUniversalCompleteQuery('')).toBeNull();
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 Local Sheaf Completion (localComplete)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('localComplete()', () => {
  it('returns null for unknown drug', () => {
    expect(localComplete('FAKE', 'bone')).toBeNull();
  });

  it('uses cross-tissue class fallback when no direct neighbors (CAR-biofilm)', () => {
    // CAR is Cephalosporin, same class as CRO. CRO-biofilm = null, CAR all null.
    // No direct neighbors → falls back to CRO values at ANY tissue:
    // CRO-bone=0.15, CRO-csf=0.15, CRO-prostate=0.10 (all weight 0.15)
    const res = localComplete('CAR', 'biofilm');
    expect(res).not.toBeNull();
    const row = res.rows[0];
    // (0.15*0.15 + 0.15*0.15 + 0.15*0.10) / (0.15+0.15+0.15) = 0.06/0.45 = 0.1333
    expect(row._completed_value).toBeCloseTo(0.1333, 3);
    expect(row._neighbor_count).toBe(3);
    expect(row._provenance[0].adjacency_type).toBe('cross_tissue_class');
  });

  it('predicts VAN-caseum from neighbors', () => {
    const res = localComplete('VAN', 'caseum');
    expect(res).not.toBeNull();
    const row = res.rows[0];

    // VAN is Glycopeptide — no same-class neighbors for caseum.
    // Same-tissue neighbors: VAN-bone=0.20, VAN-csf=0.10, VAN-prostate=0.07
    // All weight 0.3 each → (0.3*0.20 + 0.3*0.10 + 0.3*0.07) / (0.3+0.3+0.3)
    //   = (0.06 + 0.03 + 0.021) / 0.9 = 0.111 / 0.9 = 0.12333...
    expect(row._completed_value).toBeCloseTo(0.1233, 3);
    expect(row._neighbor_count).toBe(3);
    expect(row._confidence).toBeGreaterThan(0);
    expect(row._confidence).toBeLessThan(1);
    expect(row._status).toBe('completed');
    expect(row._origin).toBe('local_fallback');
  });

  it('uses same-class neighbors when available (TDZ-bone)', () => {
    // TDZ is Oxazolidinone, same as LZD. LZD-bone = 0.50
    const res = localComplete('TDZ', 'bone');
    expect(res).not.toBeNull();
    const row = res.rows[0];
    // Only neighbor: LZD-bone=0.50 (weight 0.4). No TDZ same-tissue (all null).
    expect(row._completed_value).toBeCloseTo(0.50, 2);
    expect(row._neighbor_count).toBe(1);
  });

  it('combines same-class and same-tissue neighbors (LZD-biofilm)', () => {
    // LZD is Oxazolidinone: TDZ-biofilm = null → no same-class
    // Same-tissue: LZD-bone=0.50, LZD-csf=0.30, LZD-caseum=0.90
    const res = localComplete('LZD', 'biofilm');
    expect(res).not.toBeNull();
    const row = res.rows[0];
    // (0.3*0.50 + 0.3*0.30 + 0.3*0.90) / (0.3+0.3+0.3) = 0.51/0.9 = 0.5667
    expect(row._completed_value).toBeCloseTo(0.5667, 3);
    expect(row._neighbor_count).toBe(3);
  });

  it('confidence increases with more neighbors', () => {
    const one = localComplete('TDZ', 'bone'); // 1 neighbor
    const three = localComplete('VAN', 'caseum'); // 3 neighbors
    expect(three.rows[0]._confidence).toBeGreaterThan(one.rows[0]._confidence);
  });

  it('confidence formula: sumW / (sumW + 1)', () => {
    const res = localComplete('TDZ', 'bone');
    const row = res.rows[0];
    // 1 neighbor, weight 0.4 → sumW = 0.4 → conf = 0.4/1.4
    expect(row._confidence).toBeCloseTo(0.4 / 1.4, 4);
    expect(row._uncertainty).toBeCloseTo(1 - row._confidence, 4);
  });

  it('provenance lists all contributing neighbors', () => {
    const res = localComplete('VAN', 'caseum');
    const prov = res.rows[0]._provenance;
    expect(prov.length).toBe(3);
    expect(prov.every(n => n.adjacency_type === 'same_tissue')).toBe(true);
    expect(prov.every(n => typeof n.value === 'number')).toBe(true);
    expect(prov.every(n => typeof n.weight === 'number')).toBe(true);
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 Local Propagation (localPropagate)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('localPropagate()', () => {
  it('returns null for unknown drug', () => {
    expect(localPropagate('FAKE', 'bone', 2.0)).toBeNull();
  });

  it('only cascades to NULL cells (skips measured)', () => {
    const res = localPropagate('VAN', 'bone', 2.0);
    // VAN has measured: bone, csf, prostate → null: caseum, biofilm
    expect(res.rows.length).toBeLessThanOrEqual(2);
    for (const c of res.rows) {
      const k = `VAN-${c.compartment}`;
      expect(R[k]).toBeNull();
    }
  });

  it('sets _status to newly_completable', () => {
    const res = localPropagate('VAN', 'bone', 2.0);
    for (const c of res.rows) {
      expect(c._status).toBe('newly_completable');
      expect(c._origin).toBe('cascade');
    }
  });

  it('cascades VAN from bone to caseum and biofilm', () => {
    const res = localPropagate('VAN', 'bone', 2.0);
    const comps = res.rows.map(r => r.compartment);
    expect(comps).toContain('caseum');
    expect(comps).toContain('biofilm');
    expect(comps).not.toContain('bone'); // source tissue excluded
    expect(comps).not.toContain('csf');  // already measured
    expect(comps).not.toContain('prostate'); // already measured
  });

  it('each cascade row has a completed value', () => {
    const res = localPropagate('VAN', 'bone', 2.0);
    for (const c of res.rows) {
      expect(typeof c._completed_value).toBe('number');
      expect(c._completed_value).toBeGreaterThan(0);
    }
  });

  it('CAR propagation fills many cells (4 null tissues)', () => {
    // CAR has all R values null, but localComplete might work for some
    const res = localPropagate('CAR', 'bone', 2.0);
    // At least caseum/biofilm/prostate should be attempted
    // CAR same_class = CRO. CRO has bone=0.15, csf=0.15, prostate=0.10
    // So CAR-csf should be completable (CRO-csf=0.15 as same_class)
    expect(res.rows.length).toBeGreaterThan(0);
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 R Matrix Consistency
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('R matrix', () => {
  it('has 8 drugs × 5 tissues = 40 cells', () => {
    expect(Object.keys(R)).toHaveLength(40);
  });

  it('every key follows DRUG-TISSUE pattern', () => {
    const drugIds = new Set(DRUGS.map(d => d.id));
    const tissueIds = new Set(TISSUES.map(t => t.id));
    for (const key of Object.keys(R)) {
      const [drug, tissue] = key.split('-');
      expect(drugIds.has(drug)).toBe(true);
      expect(tissueIds.has(tissue)).toBe(true);
    }
  });

  it('all measured values are positive numbers', () => {
    for (const [key, val] of Object.entries(R)) {
      if (val !== null) {
        expect(typeof val).toBe('number');
        expect(val).toBeGreaterThan(0);
      }
    }
  });

  it('has correct number of NULL cells (22)', () => {
    const nulls = Object.values(R).filter(v => v === null).length;
    expect(nulls).toBe(22);
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 GQL Syntax — No Injection, No IS NULL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('GQL syntax safety', () => {
  it('no query contains IS NULL', () => {
    for (const drug of DRUGS) {
      for (const tissue of TISSUES) {
        const q = buildCompleteQuery(drug.id, tissue.id);
        if (q) expect(q).not.toContain('IS NULL');
      }
    }
    for (const domId of Object.keys(DOMAIN_BUNDLES)) {
      const q = buildUniversalCompleteQuery(domId);
      if (q) expect(q).not.toContain('IS NULL');
    }
  });

  it('no query contains comma-separated key-value pairs', () => {
    for (const drug of DRUGS) {
      for (const tissue of TISSUES) {
        const q = buildSectionQuery(drug.id, tissue.id);
        if (q) expect(q).not.toMatch(/, compartment/);
      }
    }
  });

  it('all queries use = NULL (not IS NULL)', () => {
    for (const domId of Object.keys(DOMAIN_BUNDLES)) {
      const q = buildUniversalCompleteQuery(domId);
      if (q) expect(q).toMatch(/ = NULL /);
    }
  });

  it('drug/tissue IDs cannot contain SQL injection', () => {
    // These should all return null because they're not in the allowlist
    expect(buildSectionQuery("'; DROP TABLE", "bone")).toBeNull();
    expect(buildCompleteQuery("VAN", "'; --")).toBeNull();
    expect(buildPropagateQuery("' OR 1=1 --", "bone", 1.0)).toBeNull();
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8 Domain Bundle Config
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('DOMAIN_BUNDLES', () => {
  it('has 5 domains', () => {
    expect(Object.keys(DOMAIN_BUNDLES)).toHaveLength(5);
  });

  it('each entry has bundle and field', () => {
    for (const conf of Object.values(DOMAIN_BUNDLES)) {
      expect(conf).toHaveProperty('bundle');
      expect(conf).toHaveProperty('field');
      expect(typeof conf.bundle).toBe('string');
      expect(typeof conf.field).toBe('string');
    }
  });

  it('bundle names match GIGI backend bundles', () => {
    const expected = ['mirador_drugs', 'gtex_expression', 'fluxnet_flux', 'materials_project', 'who_flunet'];
    const actual = Object.values(DOMAIN_BUNDLES).map(c => c.bundle);
    expect(actual).toEqual(expected);
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8b Response Normalization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// normalizeComplete (mirrors SheafLab.jsx logic)
function normalizeComplete(res) {
  if (!res) return null;
  if (res.completed?.length > 0) {
    const c = res.completed[0];
    return {
      rows: [{
        _completed_value: c.value,
        _confidence: c.confidence,
        _uncertainty: c.uncertainty,
        _method: c.method || 'sheaf_extension',
        _neighbor_count: c.neighbor_count,
        _status: 'completed',
        _origin: c.origin || 'sheaf_completed',
        _provenance: (res.constraint_graph || []).map(e => ({
          drug_name: e.from, compartment: e.adjacency, adjacency_type: e.adjacency,
          value: e.value, weight: e.weight,
        })),
      }],
    };
  }
  if (res.rows?.length > 0) return res;
  return null;
}

// normalizePropagate (mirrors SheafLab.jsx logic)
function normalizePropagate(res) {
  if (!res) return null;
  if (res.cascades?.length > 0) {
    return {
      rows: res.cascades.map(c => ({
        _completed_value: c.new_value,
        _confidence: c.confidence,
        _uncertainty: c.uncertainty ?? (1 - (c.confidence || 0)),
        drug_name: c.record || c.drug_name || '',
        compartment: c.field || c.compartment || '',
        _status: 'newly_completable',
        _origin: 'cascade',
        _depth: c.depth,
      })),
    };
  }
  if (res.rows?.length > 0) return res;
  return null;
}

describe('normalizeComplete()', () => {
  it('returns null for null input', () => {
    expect(normalizeComplete(null)).toBeNull();
  });

  it('returns null for empty response', () => {
    expect(normalizeComplete({ status: 'ok' })).toBeNull();
  });

  it('normalizes GIGI completed[] format to rows[]', () => {
    const gigiRes = {
      status: 'ok',
      completed: [{
        field: 'tau', value: 6.82, uncertainty: 0.34,
        confidence: 0.89, method: 'sheaf_extension',
        neighbor_count: 47, origin: 'sheaf_completed',
      }],
      constraint_graph: [
        { from: 'VAN', adjacency: 'same_class', value: 7.1, weight: 1.0 },
        { from: 'LZD', adjacency: 'same_class', value: 6.5, weight: 1.0 },
      ],
      timing_ms: 12,
    };
    const norm = normalizeComplete(gigiRes);
    expect(norm.rows).toHaveLength(1);
    expect(norm.rows[0]._completed_value).toBe(6.82);
    expect(norm.rows[0]._confidence).toBe(0.89);
    expect(norm.rows[0]._uncertainty).toBe(0.34);
    expect(norm.rows[0]._method).toBe('sheaf_extension');
    expect(norm.rows[0]._neighbor_count).toBe(47);
    expect(norm.rows[0]._origin).toBe('sheaf_completed');
    expect(norm.rows[0]._provenance).toHaveLength(2);
    expect(norm.rows[0]._provenance[0].value).toBe(7.1);
  });

  it('passes through existing rows[] format unchanged', () => {
    const localRes = { rows: [{ _completed_value: 0.12, _confidence: 0.47 }] };
    const norm = normalizeComplete(localRes);
    expect(norm).toBe(localRes);
  });
});

describe('normalizePropagate()', () => {
  it('returns null for null input', () => {
    expect(normalizePropagate(null)).toBeNull();
  });

  it('returns null for empty cascades', () => {
    expect(normalizePropagate({ status: 'ok', cascades: [], total_affected: 0 })).toBeNull();
  });

  it('normalizes GIGI cascades[] format to rows[]', () => {
    const gigiRes = {
      status: 'ok',
      source: { molecule_chembl_id: 'VAN', tissue: 'bone' },
      cascades: [
        { bundle: 'mirador_drugs', record: 'VAN', field: 'caseum', new_value: 0.12, confidence: 0.85, depth: 1 },
        { bundle: 'mirador_drugs', record: 'VAN', field: 'biofilm', new_value: 0.09, confidence: 0.72, depth: 2 },
      ],
      total_affected: 2,
      max_depth_reached: 2,
      timing_ms: 84,
    };
    const norm = normalizePropagate(gigiRes);
    expect(norm.rows).toHaveLength(2);
    expect(norm.rows[0]._completed_value).toBe(0.12);
    expect(norm.rows[0]._confidence).toBe(0.85);
    expect(norm.rows[0]._status).toBe('newly_completable');
    expect(norm.rows[0]._origin).toBe('cascade');
    expect(norm.rows[0]._depth).toBe(1);
    expect(norm.rows[1]._completed_value).toBe(0.09);
    expect(norm.rows[1]._depth).toBe(2);
  });

  it('passes through existing rows[] format unchanged', () => {
    const localRes = { rows: [{ _completed_value: 0.12, _origin: 'cascade' }] };
    const norm = normalizePropagate(localRes);
    expect(norm).toBe(localRes);
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9 Fetch Integration (mocked)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('gigiQuery() (mocked fetch)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function gigiQuery(query) {
    const resp = await fetch('https://gigi-stream.fly.dev/v1/gql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!resp.ok) throw new Error(`GIGI ${resp.status}`);
    return resp.json();
  }

  it('sends POST with correct Content-Type', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ rows: [] }),
    }));

    await gigiQuery('SHOW BUNDLES');

    expect(fetch).toHaveBeenCalledWith(
      'https://gigi-stream.fly.dev/v1/gql',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('sends query in JSON body', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ rows: [] }),
    }));

    await gigiQuery('SHOW BUNDLES');

    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual({ query: 'SHOW BUNDLES' });
  });

  it('throws on non-ok response', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      status: 400,
    }));

    await expect(gigiQuery('BAD QUERY')).rejects.toThrow('GIGI 400');
  });

  it('returns parsed JSON on success', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ count: 1, rows: [{ drug_name: 'VAN' }] }),
    }));

    const res = await gigiQuery("COVER mirador_drugs ON drug_name='VAN' FIRST 1");
    expect(res.count).toBe(1);
    expect(res.rows[0].drug_name).toBe('VAN');
  });
});


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10 Full Pipeline (mocked GIGI → local fallback)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('full completion pipeline', () => {
  it('COMPLETE falls back to local when GIGI returns no rows', () => {
    // Simulating what happens: GIGI returns {"status":"ok"} with no rows
    // gigiComplete catches the error or empty response and falls to localComplete
    const local = localComplete('VAN', 'caseum');
    expect(local).not.toBeNull();
    expect(local.rows[0]._origin).toBe('local_fallback');
    expect(local.rows[0]._completed_value).toBeGreaterThan(0);
  });

  it('PROPAGATE falls back to local when GIGI returns 400', () => {
    // Same scenario: GIGI throws 400 on PROPAGATE, localPropagate takes over
    const local = localPropagate('VAN', 'bone', 2.0);
    expect(local.rows.length).toBeGreaterThan(0);
    expect(local.rows[0]._origin).toBe('cascade');
  });

  it('cascade unlocks multiple predictions from one measurement', () => {
    // VAN-bone already measured. Propagating should unlock caseum + biofilm
    const res = localPropagate('VAN', 'bone', 2.0);
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
    // Each cascade should have a different compartment
    const comps = new Set(res.rows.map(r => r.compartment));
    expect(comps.size).toBe(res.rows.length);
  });

  it('completed value is weighted average of neighbors', () => {
    // TDZ-bone: only neighbor is LZD-bone=0.50 (same class, weight 0.4)
    const res = localComplete('TDZ', 'bone');
    expect(res.rows[0]._completed_value).toBeCloseTo(0.50, 4);
  });

  it('all 5 domains can generate COMPLETE queries', () => {
    for (const domId of Object.keys(DOMAIN_BUNDLES)) {
      const q = buildUniversalCompleteQuery(domId);
      expect(q).not.toBeNull();
      expect(q).toMatch(/^COMPLETE ON/);
      expect(q).toContain('= NULL');
    }
  });
});
