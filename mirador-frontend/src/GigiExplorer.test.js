/**
 * GigiExplorer — TDD tests for new live-server queries
 * =====================================================
 * Tests exercise the GIGI REST API to verify that the new data bundles
 * (BindingDB, ClinTrials, PharmGKB) are queryable and return expected
 * shapes. Also validates the aggregate totals shown in the Explorer UI.
 *
 * Run:  npx vitest run src/GigiExplorer.test.js
 *
 * Note: INTEGRATE is not supported by the GIGI server (demo engine only).
 * Large bundle queries (1M+) may be slow — tests use FIRST limits.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const HOST = 'https://gigi-stream.fly.dev';
const LONG = 30_000; // 30s timeout for large bundle queries

// ── Helper: execute GQL against the live GIGI server ──────────────
async function gql(query, timeout = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const resp = await fetch(`${HOST}/v1/gql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
    return resp.json();
  } finally { clearTimeout(timer); }
}

async function health() {
  const resp = await fetch(`${HOST}/v1/health`);
  return resp.json();
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

  it('has ≥ 1.5M total records', () => {
    expect(info.total_records).toBeGreaterThanOrEqual(1_500_000);
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

  it('total across all bundles ≥ 1.5M', () => {
    const total = bundles.reduce((sum, b) => sum + (b.records ?? 0), 0);
    expect(total).toBeGreaterThanOrEqual(1_500_000);
  });
});
