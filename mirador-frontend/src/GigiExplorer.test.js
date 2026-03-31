/**
 * GigiExplorer — TDD tests for live-server queries
 * ==================================================
 * Tests exercise the GIGI REST API to verify that data bundles
 * (ChEMBL, BindingDB, ClinTrials, PharmGKB) are queryable and return
 * expected shapes. Also validates the aggregate totals shown in the Explorer UI.
 *
 * Run:  npx vitest run src/GigiExplorer.test.js
 *
 * Note: INTEGRATE is not supported by the GIGI server (demo engine only).
 * Large bundle queries (1M+) may be slow — tests use FIRST limits.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const HOST = 'https://gigi-stream.fly.dev';
const LONG = 30_000; // 30s timeout for large bundle queries
const XLONG = 90_000; // 90s timeout for ChEMBL 5M+ scans
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000]; // exponential back-off

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Helper: execute GQL against the live GIGI server ──────────────
// Retries on 503 (WAL replay) and network errors with exponential back-off
async function gql(query, timeout = 15_000) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(`${HOST}/v1/gql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (resp.status === 503 && attempt < MAX_RETRIES) {
        clearTimeout(timer);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      return resp.json();
    } catch (err) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES && (err.name === 'AbortError' || err.cause?.code === 'ECONNREFUSED')) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      throw err;
    } finally { clearTimeout(timer); }
  }
}

// Health check with retry — waits for status: 'ok' (WAL replay → 'loading')
async function health() {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(`${HOST}/v1/health`);
      const data = await resp.json();
      if (data.status === 'ok') return data;
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAYS[attempt]); continue; }
      return data; // return whatever we got on last attempt
    } catch {
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAYS[attempt]); continue; }
      return { status: 'unreachable', bundles: 0, total_records: 0 };
    }
  }
}

// ── 1. Server health & aggregate totals ───────────────────────────

describe('Server health & totals', () => {
  let info;
  beforeAll(async () => { info = await health(); });

  it('server is up', () => {
    expect(info.status).toBe('ok');
  });

  it('has ≥ 16 bundles', () => {
    expect(info.bundles).toBeGreaterThanOrEqual(16);
  });

  it('has ≥ 9M total records', () => {
    expect(info.total_records).toBeGreaterThanOrEqual(9_000_000);
  });
});

// ── 2. SHOW BUNDLES returns all new bundles ───────────────────────

describe('SHOW BUNDLES', () => {
  let bundles;
  beforeAll(async () => {
    const res = await gql('SHOW BUNDLES');
    bundles = res.bundles ?? res.rows ?? res;
  });

  const EXPECTED_BUNDLES = [
    'bindingdb_binding',
    'clintrials_studies',
    'pgx_clinical',
    'pgx_variants',
    'pgx_drug_labels',
    'mirador_drugs',
    'mirador_thresholds',
    'mirador_regimens',
    'chembl_activities',
    'chembl_compounds',
    'chembl_assays',
    'chembl_drug_target',
    'chembl_targets',
  ];

  for (const name of EXPECTED_BUNDLES) {
    it(`contains bundle '${name}'`, () => {
      const found = bundles.find(b => b.name === name);
      expect(found).toBeDefined();
      expect(found.records).toBeGreaterThan(0);
    });
  }
});

// ── 3. BindingDB queries ──────────────────────────────────────────

describe('BindingDB preset queries', () => {
  it('DESCRIBE bindingdb_binding returns field metadata', async () => {
    const res = await gql('DESCRIBE bindingdb_binding');
    expect(res).toBeDefined();
    expect(res.record_count ?? res.records ?? res.fields).toBeDefined();
  }, LONG);

  it('browse first 25 BindingDB records', async () => {
    const res = await gql('COVER bindingdb_binding ALL FIRST 25', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(25);
    for (const row of res.rows) {
      expect(row.bindingdb_id).toBeDefined();
      expect(row.target_name).toBeTruthy();
      expect(row.tau).toBeDefined();
    }
  }, LONG);

  it('distinct potency classes exist', async () => {
    const res = await gql('COVER bindingdb_binding DISTINCT potency_class', LONG);
    expect(res.rows).toBeDefined();
    const classes = res.rows.map(r => r.potency_class);
    expect(classes.length).toBeGreaterThanOrEqual(2);
    // Must have at least potent + one other
    expect(classes).toContain('potent');
  }, LONG);

  it('distinct target organisms exist', async () => {
    const res = await gql('COVER bindingdb_binding DISTINCT target_source_org', LONG);
    expect(res.rows).toBeDefined();
    const orgs = res.rows.map(r => r.target_source_org);
    expect(orgs).toContain('Homo sapiens');
  }, LONG);
});

// ── 4. Clinical Trials queries ────────────────────────────────────

describe('ClinicalTrials preset queries', () => {
  it('DESCRIBE clintrials_studies returns metadata', async () => {
    const res = await gql('DESCRIBE clintrials_studies');
    expect(res).toBeDefined();
  }, LONG);

  it('interventional trials: ON study_type FIRST 10', async () => {
    const res = await gql("COVER clintrials_studies ON study_type = 'INTERVENTIONAL' FIRST 10", LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.study_type).toBe('INTERVENTIONAL');
      expect(row.nct_id).toMatch(/^NCT/);
    }
  }, LONG);

  it('Phase 3 trials: ON phase FIRST 10', async () => {
    const res = await gql("COVER clintrials_studies ON phase = 'PHASE3' FIRST 10", LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.phase).toBe('PHASE3');
    }
  }, LONG);

  it('completed trials: ON status FIRST 10', async () => {
    const res = await gql("COVER clintrials_studies ON status = 'COMPLETED' FIRST 10", LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.status).toBe('COMPLETED');
    }
  }, LONG);

  it('distinct study types', async () => {
    const res = await gql('COVER clintrials_studies DISTINCT study_type', LONG);
    expect(res.rows).toBeDefined();
    const types = res.rows.map(r => r.study_type);
    expect(types).toContain('INTERVENTIONAL');
  }, LONG);

  it('distinct phases', async () => {
    const res = await gql('COVER clintrials_studies DISTINCT phase', LONG);
    expect(res.rows).toBeDefined();
    const phases = res.rows.map(r => r.phase);
    // Must have at least a few phases
    expect(phases.length).toBeGreaterThanOrEqual(3);
  }, LONG);

  it('browse first 10 trials', async () => {
    const res = await gql('COVER clintrials_studies ALL FIRST 10', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(10);
    for (const row of res.rows) {
      expect(row.nct_id).toMatch(/^NCT/);
      expect(row.title).toBeTruthy();
    }
  }, LONG);
});

// ── 5. PharmGKB queries ───────────────────────────────────────────

describe('PharmGKB preset queries', () => {
  it('PGx variants for CYP2D6: FIRST 10', async () => {
    const res = await gql("COVER pgx_variants ON gene = 'CYP2D6' FIRST 10");
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.gene).toBe('CYP2D6');
    }
  });

  it('PGx variants for CYP2C19: FIRST 10', async () => {
    const res = await gql("COVER pgx_variants ON gene = 'CYP2C19' FIRST 10");
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
    for (const row of res.rows) {
      expect(row.gene).toBe('CYP2C19');
    }
  });

  it('distinct PGx genes', async () => {
    const res = await gql('COVER pgx_variants DISTINCT gene');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
    const genes = res.rows.map(r => r.gene);
    expect(genes).toContain('CYP2D6');
    expect(genes).toContain('CYP2C19');
  });

  it('PGx clinical annotations: FIRST 10', async () => {
    const res = await gql('COVER pgx_clinical ALL FIRST 10');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(10);
    for (const row of res.rows) {
      expect(row.annotation_id).toBeTruthy();
    }
  });

  it('drug labels: browse FIRST 10', async () => {
    const res = await gql('COVER pgx_drug_labels ALL FIRST 10');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(10);
    for (const row of res.rows) {
      expect(row.label_id).toBeTruthy();
      expect(row.source).toBeTruthy();
    }
  });

  it('distinct drug label sources', async () => {
    const res = await gql('COVER pgx_drug_labels DISTINCT source');
    expect(res.rows).toBeDefined();
    const sources = res.rows.map(r => r.source);
    expect(sources).toContain('FDA');
  });

  it('distinct testing levels', async () => {
    const res = await gql('COVER pgx_drug_labels DISTINCT testing_level');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 6. Cross-bundle aggregate totals (for UI display) ─────────────

describe('Aggregate totals for UI', () => {
  let bundles;
  beforeAll(async () => {
    const res = await gql('SHOW BUNDLES');
    bundles = res.bundles ?? res.rows ?? res;
  });

  it('bindingdb_binding has ≥ 500K records', () => {
    const bdb = bundles.find(b => b.name === 'bindingdb_binding');
    expect(bdb).toBeDefined();
    expect(bdb.records).toBeGreaterThanOrEqual(500_000);
  });

  it('clintrials_studies has ≥ 500K records', () => {
    const ct = bundles.find(b => b.name === 'clintrials_studies');
    expect(ct).toBeDefined();
    expect(ct.records).toBeGreaterThanOrEqual(500_000);
  });

  it('PharmGKB total (clinical + variants + labels) ≥ 14K', () => {
    const pgxC = bundles.find(b => b.name === 'pgx_clinical')?.records ?? 0;
    const pgxV = bundles.find(b => b.name === 'pgx_variants')?.records ?? 0;
    const pgxL = bundles.find(b => b.name === 'pgx_drug_labels')?.records ?? 0;
    expect(pgxC + pgxV + pgxL).toBeGreaterThanOrEqual(14_000);
  });

  it('total across all bundles ≥ 9M', () => {
    const total = bundles.reduce((sum, b) => sum + (b.records ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(9_000_000);
  });

  it('ChEMBL activities has ≥ 4M records', () => {
    const ca = bundles.find(b => b.name === 'chembl_activities');
    expect(ca).toBeDefined();
    expect(ca.records).toBeGreaterThanOrEqual(4_000_000);
  });

  it('ChEMBL compounds has ≥ 1M records', () => {
    const cc = bundles.find(b => b.name === 'chembl_compounds');
    expect(cc).toBeDefined();
    expect(cc.records).toBeGreaterThanOrEqual(1_000_000);
  });

  it('ChEMBL assays has ≥ 1M records', () => {
    const ca = bundles.find(b => b.name === 'chembl_assays');
    expect(ca).toBeDefined();
    expect(ca.records).toBeGreaterThanOrEqual(1_000_000);
  });

  it('ChEMBL drug_target has ≥ 500K records', () => {
    const dt = bundles.find(b => b.name === 'chembl_drug_target');
    expect(dt).toBeDefined();
    expect(dt.records).toBeGreaterThanOrEqual(500_000);
  });

  it('ChEMBL targets has ≥ 15K records', () => {
    const ct = bundles.find(b => b.name === 'chembl_targets');
    expect(ct).toBeDefined();
    expect(ct.records).toBeGreaterThanOrEqual(15_000);
  });
});

// ── 7. ChEMBL queries ────────────────────────────────────────────

describe('ChEMBL preset queries', () => {
  it('DESCRIBE chembl_activities returns metadata', async () => {
    const res = await gql('DESCRIBE chembl_activities', XLONG);
    expect(res).toBeDefined();
  }, XLONG);

  it('browse first 50 activities', async () => {
    const res = await gql('COVER chembl_activities ALL FIRST 50', XLONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, XLONG);

  it('browse first 50 compounds', async () => {
    const res = await gql('COVER chembl_compounds ALL FIRST 50', XLONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, XLONG);

  it('browse first 50 targets', async () => {
    const res = await gql('COVER chembl_targets ALL FIRST 50', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, LONG);

  it('browse first 50 assays', async () => {
    const res = await gql('COVER chembl_assays ALL FIRST 50', XLONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, XLONG);

  it('browse first 50 drug-target interactions', async () => {
    const res = await gql('COVER chembl_drug_target ALL FIRST 50', XLONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, XLONG);

  it('distinct target types', async () => {
    const res = await gql('COVER chembl_targets DISTINCT target_type', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
  }, LONG);
});

// ── 8. NL_GROUPS — every server-targeted preset query must return rows ─

describe('NL preset queries (server-targeted)', () => {

  // Group 1: CLINICAL QUESTIONS — one server query
  it('EUCAST/CLSI breakpoints → COVER mirador_thresholds ALL', async () => {
    const res = await gql('COVER mirador_thresholds ALL;');
    expect(res.rows.length).toBeGreaterThanOrEqual(100);
  });

  // Group 2: FOR EVERYONE — server queries
  it('MRSA regimens → COVER mirador_regimens ON disease', async () => {
    const res = await gql("COVER mirador_regimens ON disease = 'mrsa';");
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('efficacy > 0.9 → COVER mirador_regimens ON clinical_efficacy', async () => {
    const res = await gql('COVER mirador_regimens ON clinical_efficacy > 0.9;');
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('resistance library → COVER mirador_resistance ALL', async () => {
    const res = await gql('COVER mirador_resistance ALL;');
    expect(res.rows.length).toBeGreaterThan(0);
  });

  // Group 3: BINDINGDB — all server queries
  it('BindingDB potent hits FIRST 50', async () => {
    const res = await gql("COVER bindingdb_binding ON potency_class = 'potent' FIRST 50;", LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows.length).toBeLessThanOrEqual(50);
  }, LONG);

  it('BindingDB DISTINCT target_source_org', async () => {
    const res = await gql('COVER bindingdb_binding DISTINCT target_source_org;', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  }, LONG);

  it('BindingDB DISTINCT potency_class', async () => {
    const res = await gql('COVER bindingdb_binding DISTINCT potency_class;', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
  }, LONG);

  it('INTEGRATE mirador_drugs OVER compartment', async () => {
    const res = await gql('INTEGRATE mirador_drugs OVER compartment MEASURE avg(tau), count(*);');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  });

  // Group 3b: CHEMBL — all server queries
  it('ChEMBL activities FIRST 50', async () => {
    const res = await gql('COVER chembl_activities ALL FIRST 50;', XLONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, XLONG);

  it('ChEMBL targets FIRST 50', async () => {
    const res = await gql('COVER chembl_targets ALL FIRST 50;', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, LONG);

  it('ChEMBL drug-target FIRST 50', async () => {
    const res = await gql('COVER chembl_drug_target ALL FIRST 50;', XLONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, XLONG);

  it('ChEMBL compounds FIRST 50', async () => {
    const res = await gql('COVER chembl_compounds ALL FIRST 50;', XLONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBe(50);
  }, XLONG);

  // Group 4: CLINICAL TRIALS — all server queries
  it('ClinTrials Phase 3 FIRST 25', async () => {
    const res = await gql("COVER clintrials_studies ON phase = 'PHASE3' FIRST 25;", LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows.length).toBeLessThanOrEqual(25);
  }, LONG);

  it('ClinTrials Interventional FIRST 25', async () => {
    const res = await gql("COVER clintrials_studies ON study_type = 'INTERVENTIONAL' FIRST 25;", LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  }, LONG);

  it('ClinTrials DISTINCT phase', async () => {
    const res = await gql('COVER clintrials_studies DISTINCT phase;', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(3);
  }, LONG);

  it('ClinTrials DISTINCT study_type', async () => {
    const res = await gql('COVER clintrials_studies DISTINCT study_type;', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(2);
  }, LONG);

  // Group 5: PHARMACOGENOMICS — all server queries
  it('PGx DISTINCT gene', async () => {
    const res = await gql('COVER pgx_variants DISTINCT gene;');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
  });

  it('PGx CYP2D6 variants FIRST 25', async () => {
    const res = await gql("COVER pgx_variants ON gene = 'CYP2D6' FIRST 25;");
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('PGx drug labels FIRST 25', async () => {
    const res = await gql('COVER pgx_drug_labels ALL FIRST 25;');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('PGx clinical annotations FIRST 25', async () => {
    const res = await gql('COVER pgx_clinical ALL FIRST 25;');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  });

  // Group 6: PK / PHARMACOMETRICS — server queries
  it('INTEGRATE mirador_drugs OVER drug_class', async () => {
    const res = await gql('INTEGRATE mirador_drugs OVER drug_class MEASURE avg(k_admet), count(*);');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('FIC < 0.05 synergy → mirador_regimens', async () => {
    const res = await gql('COVER mirador_regimens ON fic_index < 0.05;');
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  });

  it('INTEGRATE bindingdb_binding OVER target_source_org', async () => {
    const res = await gql('INTEGRATE bindingdb_binding OVER target_source_org MEASURE avg(tau), count(*);', LONG);
    expect(res.rows).toBeDefined();
    expect(res.rows.length).toBeGreaterThan(0);
  }, LONG);
});

// ── 9. Sprint A: Topological & Thermodynamic endpoints ────────────

// REST GET helper with retry (same exponential backoff as gql())
async function restGet(path, timeout = 15_000) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const resp = await fetch(`${HOST}${path}`, {
        method: 'GET',
        signal: controller.signal,
      });
      if (resp.status === 503 && attempt < MAX_RETRIES) {
        clearTimeout(timer);
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      return resp.json();
    } catch (err) {
      clearTimeout(timer);
      if (attempt < MAX_RETRIES && (err.name === 'AbortError' || err.cause?.code === 'ECONNREFUSED')) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      throw err;
    } finally { clearTimeout(timer); }
  }
}

describe('Sprint A: Betti numbers (REST)', () => {
  it('GET /v1/bundles/bindingdb_binding/betti returns β₀ and β₁', async () => {
    const res = await restGet('/v1/bundles/bindingdb_binding/betti', LONG);
    expect(res.beta_0).toBeDefined();
    expect(res.beta_1).toBeDefined();
    expect(typeof res.beta_0).toBe('number');
    expect(typeof res.beta_1).toBe('number');
    expect(res.beta_0).toBeGreaterThanOrEqual(0); // connected components ≥ 0
    expect(res.beta_1).toBeGreaterThanOrEqual(0); // cycle rank ≥ 0
  }, LONG);

  it('GET /v1/bundles/clintrials_studies/betti returns β₀ and β₁', async () => {
    const res = await restGet('/v1/bundles/clintrials_studies/betti', LONG);
    expect(res.beta_0).toBeGreaterThanOrEqual(0);
    expect(res.beta_1).toBeGreaterThanOrEqual(0);
  }, LONG);
});

describe('Sprint A: Entropy (REST)', () => {
  it('GET /v1/bundles/bindingdb_binding/entropy returns S ≥ 0', async () => {
    const res = await restGet('/v1/bundles/bindingdb_binding/entropy', LONG);
    expect(res.entropy).toBeDefined();
    expect(typeof res.entropy).toBe('number');
    expect(res.entropy).toBeGreaterThanOrEqual(0);
  }, LONG);

  it('GET /v1/bundles/pgx_clinical/entropy returns S ≥ 0', async () => {
    const res = await restGet('/v1/bundles/pgx_clinical/entropy', LONG);
    expect(res.entropy).toBeGreaterThanOrEqual(0);
  }, LONG);
});

describe('Sprint A: Free energy (REST)', () => {
  it('GET /v1/bundles/bindingdb_binding/free-energy?tau=1.0 returns finite F', async () => {
    const res = await restGet('/v1/bundles/bindingdb_binding/free-energy?tau=1.0', LONG);
    expect(res.free_energy).toBeDefined();
    expect(typeof res.free_energy).toBe('number');
    expect(Number.isFinite(res.free_energy)).toBe(true);
  }, LONG);

  it('F(high τ) < F(low τ) — entropy dominates at high temperature', async () => {
    const lo = await restGet('/v1/bundles/bindingdb_binding/free-energy?tau=0.1', LONG);
    const hi = await restGet('/v1/bundles/bindingdb_binding/free-energy?tau=10.0', LONG);
    expect(Number.isFinite(lo.free_energy)).toBe(true);
    expect(Number.isFinite(hi.free_energy)).toBe(true);
    // Free energy should decrease (or stay equal) as temperature increases
    expect(hi.free_energy).toBeLessThanOrEqual(lo.free_energy);
  }, LONG);
});

describe('Sprint A: GQL equivalents', () => {
  it('BETTI bindingdb_binding via GQL', async () => {
    const res = await gql('BETTI bindingdb_binding');
    expect(res).toHaveProperty('value');
    expect(res.value).toBeGreaterThanOrEqual(0);
  }, LONG);

  it('ENTROPY bindingdb_binding via GQL', async () => {
    const res = await gql('ENTROPY bindingdb_binding');
    expect(res).toHaveProperty('value');
    expect(res.value).toBeGreaterThanOrEqual(0);
  }, LONG);

  it('FREEENERGY bindingdb_binding AT 1.0 via GQL', async () => {
    const res = await gql('FREEENERGY bindingdb_binding AT 1.0');
    expect(res).toHaveProperty('value');
    expect(typeof res.value).toBe('number');
    expect(Number.isFinite(res.value)).toBe(true);
  }, LONG);
});
