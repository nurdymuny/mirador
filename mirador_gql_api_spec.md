# MIRADOR GQL API Specification
## Geometric Query Language over HTTPS
### Version 0.2 · Davis Geometric · 2026-03-27

---

## Overview

The MIRADOR GQL API exposes the geometric pharmacokinetic warehouse
via HTTP. Every query is a GQL statement evaluated against GIGI
fiber bundles. Every response includes coherence, confidence, and
provenance. The API serves two classes of client:

- **Human frontends** (usemirador.sh React app)
- **Machine agents** (AI assistants, programmatic pipelines, partner integrations)

Both hit the same endpoint. Same data. Same math. Same confidence scores.

Base URL: `https://usemirador.sh/v1`

All endpoints require HTTPS. Plain HTTP connections are rejected with `301 → https://`.

---

## Authentication

```
POST /v1/query
Authorization: Bearer <api_key>
Content-Type: application/json
```

### Key tiers

| Tier | Rate limit | Access | Cost |
|---|---|---|---|
| `public` | 10 req/min | Read-only, pre-computed disease instances | Free |
| `research` | 100 req/min | Full read, custom combinations, export | Free (academic) |
| `clinical` | 1000 req/min | Full read/write, patient context, audit log | Licensed |
| `enterprise` | Unlimited | Full access, gauge-encrypted queries, SLA | Licensed |

API keys issued at `usemirador.sh/developers`.

### Key management

- Keys can be rotated at `usemirador.sh/developers/keys`
- Revoke compromised keys immediately via `DELETE /v1/keys/:key_id`
- Each key has an expiry (default 1 year, configurable)
- Rate limit headers returned on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### CORS policy

- `Access-Control-Allow-Origin: https://usemirador.sh` (production)
- Research/enterprise tiers may add custom origins via key settings
- Preflight `OPTIONS` requests are cached for 1 hour

### PHI & compliance (clinical tier)

- Patient context data (`CONTEXT` parameters) is processed in-memory only — never persisted to disk or logs
- Audit logs record: query type, timestamp, key ID, and response status — never patient parameters
- Data residency: US-East by default; EU available on enterprise tier
- HIPAA BAA required before clinical tier activation
- All patient context transmitted over TLS 1.3; keys encrypted at rest with AES-256

---

## Request Format

```json
{
  "query": "<GQL statement>",
  "params": {
    "key": "value"
  },
  "options": {
    "include_provenance": true,
    "include_confidence": true,
    "include_decomposition": true,
    "format": "json",
    "precision": 4
  }
}
```

### Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | GQL statement |
| `params` | object | no | Named parameters (prevents injection) |
| `options.include_provenance` | bool | no | Attach source citations (default: true) |
| `options.include_confidence` | bool | no | Attach curvature-based confidence (default: true) |
| `options.include_decomposition` | bool | no | Attach K layer breakdown (default: false) |
| `options.format` | string | no | `json` (default), `dhoom`, `csv` |
| `options.precision` | int | no | Decimal places for numeric values (default: 4) |
| `options.limit` | int | no | Max rows to return (default: 100, max: 10000) |
| `options.offset` | int | no | Skip N rows for pagination (default: 0) |
| `options.cursor` | string | no | Opaque cursor from previous response for keyset pagination |

---

## Response Format

```json
{
  "status": "ok",
  "query_time_ms": 0.5,
  "bundle": "mirador_universe",
  "pagination": {
    "total": 245,
    "limit": 100,
    "offset": 0,
    "next_cursor": "eyJrIjoiY2VmdGFyb2xpbmUiLCJvIjoxMDB9"
  },
  "results": [
    {
      "drug": "ceftaroline",
      "pathogen": "S_aureus_MRSA",
      "tissue": "bone",
      "context": "pediatric_chronic",
      "tau": 12.0,
      "K": 4.23,
      "C": 2.8369,
      "g": 0.2364,
      "above_threshold": false,
      "threshold": 5.0,
      "confidence": 0.91,
      "decomposition": {
        "K_admet": 0.67,
        "K_barrier": 0.75,
        "K_phenotype": 2.00,
        "K_reservoir": 0.81
      },
      "provenance": [
        {"field": "R_bone", "value": 0.30, "source": "Riccobene 2014", "doi": "10.1128/AAC.02312-14"},
        {"field": "MIC", "value": 0.5, "source": "EUCAST v14.0", "url": "https://eucast.org"},
        {"field": "MBEC", "value": 128, "source": "Barber 2015", "doi": "10.1093/jac/dku395"}
      ]
    }
  ],
  "double_cover": {
    "S": 0.78,
    "d_squared": 0.22,
    "interpretation": "mixed_regime",
    "geometry_dominated_sites": ["bone_matrix", "soft_tissue", "abscess"],
    "dynamics_dominated_sites": ["intracellular_SCV"]
  },
  "meta": {
    "engine": "GIGI v0.1",
    "equation": "C = τ/K",
    "patent": "US 64/012,328",
    "timestamp": "2026-03-27T19:45:00Z"
  }
}
```

### Error responses

```json
{
  "status": "error",
  "code": "INVALID_GQL",
  "message": "Unknown verb SELCT at position 0. Did you mean SECTION?",
  "suggestion": "SECTION AT mirador_universe WHERE drug = 'ceftaroline'"
}
```

| Code | HTTP | Meaning |
|---|---|---|
| `INVALID_GQL` | 400 | Syntax error in GQL statement |
| `UNKNOWN_BUNDLE` | 404 | Bundle name not found |
| `UNKNOWN_FIELD` | 400 | Field not in bundle fiber |
| `EMPTY_RESULT` | 200 | Query valid but no matching sections |
| `RATE_LIMITED` | 429 | Tier limit exceeded |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `FORBIDDEN` | 403 | Tier does not permit this query type |
| `GAUGE_REQUIRED` | 403 | Enterprise tier required for encrypted queries |
| `PARTIAL_RESULT` | 200 | Some entities matched, others not found (see `warnings`) |
| `QUERY_TIMEOUT` | 408 | Query exceeded 30s execution limit |
| `PAYLOAD_TOO_LARGE` | 413 | Query exceeds 8KB or COMBINE exceeds 20 drugs |
| `JOB_PENDING` | 202 | Async query queued, poll `/v1/jobs/:id` for result |

---

## GQL Verbs (API-Supported Subset)

### SECTION AT — Point query (O(1))

Retrieve coherence at a specific (drug, pathogen, tissue) coordinate.

```json
{
  "query": "SECTION AT mirador_universe WHERE drug = :drug AND pathogen = :pathogen AND tissue = :tissue",
  "params": {
    "drug": "vancomycin",
    "pathogen": "S_aureus_MRSA",
    "tissue": "bone"
  }
}
```

Response: single result object with τ, K, C, confidence, provenance.

---

### COVER ON — Range query (O(|r|))

Retrieve coherence across all drugs at a tissue site, or all tissues for a drug.

```json
{
  "query": "COVER ON mirador_universe WHERE pathogen = :pathogen AND tissue = :tissue EVALUATE coherence RANK BY coherence DESC WITH CONFIDENCE, PROVENANCE",
  "params": {
    "pathogen": "S_aureus_MRSA",
    "tissue": "bone"
  }
}
```

Response: array of results, ranked, with confidence and provenance per row.

---

### COVER ON (multi-tissue) — Reservoir landscape

All tissues for one drug-pathogen pair (the HIV reservoir landscape query).

```json
{
  "query": "COVER ON mirador_universe WHERE drug = :drug AND pathogen = :pathogen EVALUATE coherence RANK BY coherence DESC",
  "params": {
    "drug": "tenofovir",
    "pathogen": "HIV-1"
  }
}
```

Response: array of results (one per reservoir), plus `double_cover` object.

---

### COMBINE — Combination query

Compute parallel-resistor combination coherence for a multi-drug regimen.

```json
{
  "query": "COMBINE :drugs ON mirador_universe WHERE pathogen = :pathogen AND tissue = :tissue MODE COUPLED SYNERGY :synergy EVALUATE coherence WITH CONFIDENCE, PROVENANCE",
  "params": {
    "drugs": ["ceftaroline", "rifampin"],
    "pathogen": "S_aureus_MRSA",
    "tissue": "bone",
    "synergy": 1.2
  }
}
```

Response: combination result with τ_combo, K_combo, C_combo, per-drug conductance breakdown, and provenance chain.

---

### COMBINE MODE DECOUPLED — TB-style independent subpopulations

```json
{
  "query": "COMBINE :drugs ON mirador_universe WHERE pathogen = :pathogen AND tissue = :tissue MODE DECOUPLED EVALUATE coherence",
  "params": {
    "drugs": ["isoniazid", "rifampin", "pyrazinamide", "ethambutol"],
    "pathogen": "M_tuberculosis",
    "tissue": "caseous_granuloma"
  }
}
```

Response: decoupled product coherence with per-drug τ and g contributions.

---

### CATALYTIC — LRA + ART combination (HIV cure query)

```json
{
  "query": "CATALYTIC :lra ON mirador_universe WHERE pathogen = :pathogen CONDUCTIVE :art_drugs MODE COUPLED EVALUATE coherence WITH PHI_NEEDED, PHI_SURPLUS",
  "params": {
    "lra": "romidepsin",
    "pathogen": "HIV-1",
    "art_drugs": ["tenofovir", "emtricitabine", "dolutegravir"]
  }
}
```

Response: per-reservoir C_total, Φ_needed, Φ_surplus, clearance ordering, cure feasibility verdict.

---

### DOUBLE_COVER — Boundary diagnostic

```json
{
  "query": "DOUBLE_COVER ON mirador_universe WHERE pathogen = :pathogen USING :drugs",
  "params": {
    "pathogen": "M_tuberculosis",
    "drugs": ["isoniazid", "rifampin", "pyrazinamide", "ethambutol"]
  }
}
```

Response:
```json
{
  "S": 0.78,
  "d_squared": 0.22,
  "per_reservoir": [
    {"reservoir": "cellular_granuloma", "C": 12.4, "regime": "geometry_dominated"},
    {"reservoir": "caseous_core", "C": 3.1, "regime": "geometry_dominated"},
    {"reservoir": "cavity_caseum", "C": 0.8, "regime": "dynamics_dominated"}
  ],
  "rank_inversion_detected": true,
  "geometric_ranking": ["EMB", "INH", "PZA", "RIF"],
  "clinical_ranking": ["RIF", "INH", "PZA", "EMB"],
  "inversion_mechanism": "RIF kill kinetics (Circle 2)"
}
```

---

### CURVATURE — Data quality at a base point

```json
{
  "query": "CURVATURE AT mirador_universe WHERE drug = :drug AND pathogen = :pathogen AND tissue = :tissue",
  "params": {
    "drug": "vancomycin",
    "pathogen": "S_aureus_MRSA",
    "tissue": "bone"
  }
}
```

Response:
```json
{
  "kappa": 0.42,
  "confidence": 0.70,
  "source_count": 4,
  "source_agreement": "moderate",
  "sources": [
    {"source": "Graziani 1988", "R_bone": 0.10, "context": "uninflamed"},
    {"source": "Graziani 1988", "R_bone": 0.30, "context": "infected"},
    {"source": "Bue 2018", "R_bone": 0.20, "context": "porcine osteomyelitis"},
    {"source": "Landersdorfer 2009", "R_bone": 0.25, "context": "review aggregate"}
  ],
  "outliers": []
}
```

---

### CONSISTENCY — Contradiction detection (Čech H¹)

```json
{
  "query": "CONSISTENCY ON mirador_universe WHERE pathogen = :pathogen",
  "params": {
    "pathogen": "S_aureus_MRSA"
  }
}
```

Response:
```json
{
  "H1_dimension": 2,
  "contradictions": [
    {
      "drug": "vancomycin",
      "field": "R_bone",
      "source_a": {"value": 0.10, "source": "Graziani 1988 (uninflamed)"},
      "source_b": {"value": 0.37, "source": "Bue 2018 (infected, CRP>200)"},
      "resolution": "Context-dependent: inflammation status explains divergence"
    }
  ]
}
```

---

### OUTLIER — Anomaly detection

```json
{
  "query": "OUTLIER ON mirador_universe RANK BY curvature DESC FIRST 10"
}
```

Response: top 10 anomalous base points by curvature, with source data and explanation.

---

### PREDICT — Novel drug screening

Given a hypothetical drug's PK parameters, compute coherence at all sites.

```json
{
  "query": "PREDICT ON mirador_universe WITH tau = :tau AND R = :R AND pathogen = :pathogen",
  "params": {
    "tau": 2.8,
    "R": {"bone": 0.45, "csf": 0.08, "galt": 0.30},
    "pathogen": "S_aureus_MRSA"
  }
}
```

Response: computed C at each tissue, ranking against existing drugs, identification of which sites the novel drug would improve upon.

---

### PULLBACK — Cross-bundle join

Join MIRADOR coherence data against an external bundle (e.g., ChEMBL bioactivity, PK-DB parameters).

```json
{
  "query": "PULLBACK mirador_universe ALONG chembl_bundle ON compound_id EVALUATE coherence WHERE tissue = :tissue",
  "params": {
    "tissue": "bone"
  }
}
```

Response: every compound in ChEMBL that has matching MIC data, with computed coherence at the specified tissue. This is the query that turns 24M ChEMBL records into a ranked drug delivery table.

Requires `enterprise` tier.

---

## Patient Context Queries (clinical tier)

### SECTION AT with patient parameters

```json
{
  "query": "SECTION AT mirador_universe WHERE drug = :drug AND pathogen = :pathogen AND tissue = :tissue CONTEXT :patient",
  "params": {
    "drug": "vancomycin",
    "pathogen": "S_aureus_MRSA",
    "tissue": "bone",
    "patient": {
      "age_years": 8,
      "weight_kg": 25,
      "crp_mg_L": 250,
      "chronicity": "chronic",
      "egfr": 120,
      "p_drainage": 0.80,
      "p_debride": 0.70,
      "f_intracellular": 0.60
    }
  }
}
```

Response: patient-specific τ (allometrically adjusted AUC), patient-specific K (CRP-adjusted bone penetration, chronicity-weighted biofilm), patient-specific C. All audit-logged.

---

## Gauge-Encrypted Queries (enterprise tier)

Partners can submit encrypted fiber values and receive analytics without exposing raw data.

```json
{
  "query": "COVER ON partner_bundle WHERE tissue = :tissue EVALUATE coherence WITH CONFIDENCE",
  "params": {
    "tissue": "bone"
  },
  "options": {
    "gauge": {
      "mode": "encrypted",
      "key_id": "partner_gauge_2026Q1"
    }
  }
}
```

Response: coherence rankings and confidence scores computed on encrypted data. Curvature is gauge-invariant (K_encrypted = K_plain), so confidence and anomaly detection produce identical results. The partner's raw IC₅₀ and R values are never transmitted in cleartext.

---

## DHOOM Wire Format

Any response can be returned in DHOOM format for 50-84% compression:

```json
{
  "query": "COVER ON mirador_universe WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone' EVALUATE coherence RANK BY coherence DESC",
  "options": {
    "format": "dhoom"
  }
}
```

Response header: `Content-Type: application/dhoom`

The DHOOM response uses the fiber bundle serialization: schema declared once, sequential fields compressed, defaults elided, records encode only deviations. Ideal for bandwidth-constrained or high-volume pipelines.

---

## Webhooks (enterprise tier)

Subscribe to coherence changes when new source data is ingested:

```
POST /gql/subscribe
```

```json
{
  "event": "coherence_change",
  "filter": {
    "pathogen": "S_aureus_MRSA",
    "tissue": "bone",
    "threshold_delta": 0.5
  },
  "webhook_url": "https://partner.com/mirador-updates",
  "format": "json"
}
```

When new PK data is ingested that changes any drug's bone MRSA coherence by more than 0.5, the webhook fires with the old and new values, the source that triggered the change, and the updated confidence score.

---

## Natural Language Interface

### POST `/gql/v1/ask`

Submit a plain-text clinical or research question. An agent translates it to GQL, executes it, and returns both the answer and the generated query.

```json
{
  "question": "Can vancomycin reach MRSA in bone?",
  "context": {
    "patient": {
      "age_years": 8,
      "weight_kg": 25,
      "crp_mg_L": 250,
      "chronicity": "chronic"
    }
  }
}
```

Response:

```json
{
  "status": "ok",
  "question": "Can vancomycin reach MRSA in bone?",
  "answer": "No. Vancomycin achieves C = 2.08 at the bone site, below the therapeutic threshold θ = 5.0. The dominant barrier is bone penetration (K_barrier = 1.63), followed by biofilm resistance (K_phenotype = 2.57). Confidence: 0.70 (moderate — four source studies with some disagreement on R_bone values).",
  "verdict": "fails_threshold",
  "generated_gql": "SECTION AT mirador_universe WHERE drug = 'vancomycin' AND pathogen = 'S_aureus_MRSA' AND tissue = 'bone' CONTEXT {age_years: 8, weight_kg: 25, crp_mg_L: 250, chronicity: 'chronic'} EVALUATE coherence WITH CONFIDENCE, PROVENANCE, DECOMPOSITION",
  "result": {
    "drug": "vancomycin",
    "tau": 12.0,
    "K": 5.78,
    "C": 2.08,
    "threshold": 5.0,
    "above_threshold": false,
    "confidence": 0.70,
    "decomposition": {
      "K_admet": 0.50,
      "K_barrier": 1.63,
      "K_phenotype": 2.57,
      "K_reservoir": 1.07
    }
  },
  "follow_ups": [
    {"label": "What combination would work?", "gql": "COMBINE ['ceftaroline','rifampin'] ON mirador_universe WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone' MODE COUPLED SYNERGY 1.2"},
    {"label": "Which drug ranks highest here?", "gql": "COVER ON mirador_universe WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone' RANK BY coherence DESC"},
    {"label": "Why does it fail?", "gql": "CURVATURE AT mirador_universe WHERE drug = 'vancomycin' AND pathogen = 'S_aureus_MRSA' AND tissue = 'bone'"}
  ]
}
```

### How the translation works

The `/ask` endpoint runs a three-stage pipeline:

**Stage 1: Intent classification.** The question is classified into one of eight query intents:

| Intent | Trigger patterns | Maps to |
|---|---|---|
| `single_drug_check` | "can X reach Y in Z", "does X work for Y" | `SECTION AT` |
| `drug_ranking` | "which drug is best for", "rank drugs for" | `COVER ON ... RANK BY` |
| `combination_query` | "what combination", "X plus Y for" | `COMBINE` |
| `cure_feasibility` | "can we cure", "is X curable" | `CATALYTIC` + `DOUBLE_COVER` |
| `failure_diagnosis` | "why does X fail", "why isn't X working" | `SECTION AT` + `DECOMPOSITION` |
| `comparison` | "X vs Y for", "compare X and Y" | `COVER ON` with drug filter |
| `novel_screening` | "if a drug had R = 0.5", "hypothetical" | `PREDICT` |
| `data_quality` | "how reliable", "do studies agree" | `CURVATURE` or `CONSISTENCY` |

**Stage 2: Entity extraction.** Drug names, pathogen names, tissue sites, and patient parameters are extracted and mapped to GIGI bundle coordinates:

| Natural language | Mapped entity | Bundle coordinate |
|---|---|---|
| "vancomycin", "vanco" | vancomycin | `drug = 'vancomycin'` |
| "MRSA", "staph" | S. aureus MRSA | `pathogen = 'S_aureus_MRSA'` |
| "bone", "osteomyelitis" | bone tissue | `tissue = 'bone'` |
| "TB", "tuberculosis" | M. tuberculosis | `pathogen = 'M_tuberculosis'` |
| "meningitis", "CSF" | CSF compartment | `tissue = 'csf'` |
| "HIV", "latent reservoir" | HIV-1 | `pathogen = 'HIV-1'` |
| "8 year old, 25 kg" | pediatric context | `CONTEXT {age: 8, weight: 25}` |
| "chronic", "6 months" | chronicity | `chronicity = 'chronic'` |

Entity extraction uses a controlled vocabulary mapped to the GIGI ontology layer (RxNorm for drugs, NCBI Taxonomy for pathogens, UBERON for tissues). Ambiguous entities trigger a clarification response.

**Stage 3: GQL generation and execution.** The classified intent + extracted entities are assembled into a GQL statement, executed against the GIGI engine, and the raw result is passed through an answer generation layer that produces the natural language response.

### Answer generation rules

The answer always includes:

1. **A direct yes/no/maybe** to the question asked
2. **The number** (C value, with threshold comparison)
3. **The why** (which K component dominates)
4. **The confidence** (how much the sources agree)
5. **Follow-up queries** (pre-generated GQL for the obvious next questions)

The answer never includes:

- Treatment recommendations (MIRADOR is a computation framework, not a prescribing tool)
- Absolute concentrations (C is dimensionless; use PBPK for concentrations)
- Certainty beyond what the confidence score supports

### Example questions and generated GQL

**"Which drugs can reach TB in caseum?"**
```
COVER ON mirador_universe
  WHERE pathogen = 'M_tuberculosis'
    AND tissue = 'caseous_granuloma'
  EVALUATE coherence
  RANK BY coherence DESC
  WITH CONFIDENCE, PROVENANCE
```

**"What's the best combination for bone MRSA in a kid with CRP 250?"**
```
COMBINE ['ceftaroline','rifampin','linezolid','vancomycin','clindamycin','daptomycin']
  ON mirador_universe
  WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone'
  CONTEXT {age_years: 8, crp_mg_L: 250, chronicity: 'chronic'}
  MODE COUPLED
  EVALUATE coherence
  RANK BY coherence DESC
  FIRST 5
```

**"Is the HIV genital tract curable?"**
```
CATALYTIC 'romidepsin'
  ON mirador_universe
  WHERE pathogen = 'HIV-1' AND tissue = 'genital_tract'
  CONDUCTIVE ['tenofovir','emtricitabine','dolutegravir']
  MODE COUPLED
  EVALUATE coherence
  WITH PHI_NEEDED, PHI_SURPLUS
```

**"Why does vancomycin fail in bone despite good serum levels?"**
```
SECTION AT mirador_universe
  WHERE drug = 'vancomycin'
    AND pathogen = 'S_aureus_MRSA'
    AND tissue = 'bone'
  EVALUATE coherence
  WITH DECOMPOSITION, PROVENANCE
```
Answer: "Vancomycin's serum potency (τ = 12.0) is high, but the bone pathway impedance (K = 5.78) is dominated by two layers: bone penetration barrier (K_barrier = 1.63, from R_bone = 0.38 after CRP adjustment) and chronic biofilm resistance (K_phenotype = 2.57, MBEC/MIC = 512×). The drug reaches the blood. The geometry prevents it from reaching the bone."

**"Do studies agree on rifampin's bone penetration?"**
```
CURVATURE AT mirador_universe
  WHERE drug = 'rifampin'
    AND pathogen = 'S_aureus_MRSA'
    AND tissue = 'bone'
```

**"If I had a drug with R_bone = 0.6 and MIC = 0.5, would it beat ceftaroline?"**
```
PREDICT ON mirador_universe
  WITH tau = 2.8 AND R = {'bone': 0.6}
  AND pathogen = 'S_aureus_MRSA'
  COMPARE_TO 'ceftaroline'
```

### Clarification responses

When the question is ambiguous:

```json
{
  "status": "clarification_needed",
  "question": "Does rifampin work for infections?",
  "message": "Rifampin's coherence depends on the pathogen and tissue site. Which infection are you asking about?",
  "options": [
    {"label": "Bone MRSA (osteomyelitis)", "gql": "SECTION AT mirador_universe WHERE drug = 'rifampin' AND pathogen = 'S_aureus_MRSA' AND tissue = 'bone'"},
    {"label": "Pulmonary TB (granuloma)", "gql": "SECTION AT mirador_universe WHERE drug = 'rifampin' AND pathogen = 'M_tuberculosis' AND tissue = 'caseous_granuloma'"},
    {"label": "All available disease instances", "gql": "COVER ON mirador_universe WHERE drug = 'rifampin' EVALUATE coherence RANK BY coherence DESC"}
  ]
}
```

### Implementation: LLM agent with GQL tools

The natural language layer is implemented as an LLM agent (Claude or equivalent) with the GQL endpoint as a tool. The agent has:

1. **System prompt** containing the GQL reference (all verbs, all bundle schemas, all entity mappings)
2. **Tool access** to `POST /gql/v1/query` for executing generated GQL
3. **Guardrails**: never recommend treatment, always show confidence, always cite sources, always return the generated GQL so the user can learn the query language

The agent does NOT interpret the medical significance of results. It translates questions to queries, executes them, and reports what the geometry says. Clinical interpretation is the physician's responsibility.

### Conversational mode

The `/ask` endpoint supports multi-turn conversation via session IDs:

```json
{
  "question": "What about adding rifampin?",
  "session_id": "sess_abc123"
}
```

The agent remembers that the previous question was about vancomycin for bone MRSA and interprets "adding rifampin" as a combination query:

```
COMBINE ['vancomycin', 'rifampin']
  ON mirador_universe
  WHERE pathogen = 'S_aureus_MRSA' AND tissue = 'bone'
  MODE COUPLED
  EVALUATE coherence
```

Session context is stored server-side with 30-minute TTL.

---

## Batch Queries

### POST `/v1/batch`

Submit multiple GQL statements in a single HTTP request. Ideal for AI agents
that need to gather context from several bundles before reasoning.

```json
{
  "queries": [
    {"id": "q1", "query": "COVER mirador_drugs ON disease = 'mrsa' AND compartment = 'bone';"},
    {"id": "q2", "query": "COVER mirador_thresholds ON organism = 'S. aureus (MRSA)';"},
    {"id": "q3", "query": "INTEGRATE mirador_drugs OVER compartment MEASURE avg(tau), count(*);"}
  ],
  "options": {
    "include_provenance": true,
    "fail_strategy": "continue"
  }
}
```

Response:

```json
{
  "status": "ok",
  "results": [
    {"id": "q1", "status": "ok", "count": 6, "rows": [...]},
    {"id": "q2", "status": "ok", "count": 6, "rows": [...]},
    {"id": "q3", "status": "ok", "count": 12, "rows": [...]}
  ],
  "total_time_ms": 1.2
}
```

| Field | Type | Description |
|---|---|---|
| `queries` | array | Array of `{id, query}` objects (max 20 per batch) |
| `options.fail_strategy` | string | `"stop"` = abort on first error; `"continue"` = execute all, report per-query status |

Each query in the batch counts as one request toward the rate limit.

---

## DECOMPOSE — Impedance breakdown

### Why a machine needs this

An AI agent asking "why does vancomycin fail in bone?" needs the individual K layers,
not just the aggregate C. DECOMPOSE returns the full impedance stack.

```json
{
  "query": "DECOMPOSE mirador_drugs ON drug_name = 'VAN' AND compartment = 'bone'"
}
```

Response:

```json
{
  "drug": "VAN",
  "tissue": "bone",
  "tau": 2.602,
  "C": 0.2602,
  "threshold": 5.0,
  "geometric_verdict": "fails_threshold",
  "decomposition": {
    "k_admet": 0.50,
    "k_barrier": 0.699,
    "k_biofilm": 2.709,
    "K_total": 3.408
  },
  "dominant_barrier": "k_biofilm",
  "raw": {
    "auc_24": 400,
    "mic": 1.0,
    "r_penetration": 0.20
  },
  "provenance": "EUCAST v14.0 / CLSI M100"
}
```

---

## COMPARE — Head-to-head drug comparison

Compare two or more drugs at the same site. Returns side-by-side metrics
including which barriers each drug wins or loses on.

```json
{
  "query": "COMPARE ['VAN', 'RIF', 'DAP'] ON mirador_drugs WHERE compartment = 'bone'"
}
```

Response:

```json
{
  "drugs": [
    {"drug": "RIF", "C": 0.6781, "tau": 3.8751, "k_admet": 0.50, "k_barrier": 0.4559, "k_biofilm": 1.7959, "rank": 1},
    {"drug": "DAP", "C": 0.3000, "tau": 3.0000, "k_admet": 0.60, "k_barrier": 0.8239, "k_biofilm": 1.8062, "rank": 2},
    {"drug": "VAN", "C": 0.2602, "tau": 2.6020, "k_admet": 0.50, "k_barrier": 0.6990, "k_biofilm": 2.7090, "rank": 3}
  ],
  "winner": "RIF",
  "advantage": "2.61× higher coherence than VAN",
  "per_barrier_wins": {
    "tau": "RIF",
    "k_admet": "VAN",
    "k_barrier": "RIF",
    "k_biofilm": "RIF"
  }
}
```

---

## Async Jobs

Long-running queries (PULLBACK against ChEMBL, large INTEGRATE operations) return a job ID.

### `POST /v1/query` → 202 Accepted

```json
{
  "status": "accepted",
  "job_id": "job_abc123",
  "poll_url": "/v1/jobs/job_abc123",
  "estimated_seconds": 12
}
```

### `GET /v1/jobs/:id` — Poll job status

```json
{
  "job_id": "job_abc123",
  "status": "running",
  "progress": 0.45,
  "started_at": "2026-03-27T19:45:00Z"
}
```

When complete:

```json
{
  "job_id": "job_abc123",
  "status": "complete",
  "result": { ... },
  "completed_at": "2026-03-27T19:45:12Z"
}
```

### `DELETE /v1/jobs/:id` — Cancel a running job

Jobs expire after 1 hour. Results are cached for 15 minutes after completion.

---

## Webhook Security

All webhook payloads are signed with HMAC-SHA256:

```
X-Mirador-Signature: sha256=<hex_digest>
```

Verification:
```python
import hmac, hashlib
expected = hmac.new(webhook_secret.encode(), body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(expected, signature)
```

Webhook management:

| Endpoint | Method | Description |
|---|---|---|
| `POST /v1/webhooks` | POST | Create subscription |
| `GET /v1/webhooks` | GET | List active subscriptions |
| `DELETE /v1/webhooks/:id` | DELETE | Remove subscription |

---

## SDK (planned)

```python
# Python
from mirador import Client

m = Client(api_key="sk-...")
result = m.cover(
    pathogen="S_aureus_MRSA",
    tissue="bone",
    rank_by="coherence"
)
for drug in result.drugs:
    print(f"{drug.name}: C={drug.C:.2f} (conf={drug.confidence:.2f})")

combo = m.combine(
    drugs=["ceftaroline", "rifampin"],
    pathogen="S_aureus_MRSA",
    tissue="bone",
    mode="coupled",
    synergy=1.2
)
print(f"Combination: C={combo.C:.1f}")
```

```rust
// Rust
let client = MiradorClient::new("sk-...");
let results = client.cover()
    .pathogen("S_aureus_MRSA")
    .tissue("bone")
    .rank_by(Coherence)
    .execute()
    .await?;
```

```javascript
// JavaScript
const mirador = new Mirador({ apiKey: "sk-..." });
const results = await mirador.cover({
  pathogen: "S_aureus_MRSA",
  tissue: "bone",
  rankBy: "coherence"
});
```

---

## Rate Limits and Caching

All SECTION AT queries are O(1) and cached at the CDN edge.
COVER ON queries are cached per unique parameter set with 5-minute TTL.
COMBINE queries are computed fresh (combination depends on the specific drug set).
PULLBACK queries against large bundles (ChEMBL) are queued and return a job ID.

### Request limits

| Constraint | Value |
|---|---|
| Max query length | 8 KB |
| Max `FIRST` / `limit` | 10,000 rows |
| Default `limit` | 100 rows |
| Max drugs in `COMBINE` | 20 |
| Max queries in batch | 20 |
| Request timeout | 30 seconds (sync), unlimited (async job) |
| Max response payload | 10 MB |

---

## Versioning

API version is in the URL: `usemirador.sh/v1/`

Breaking changes increment the version. Non-breaking additions (new response fields, new verbs) do not.

### Deprecation policy

- Deprecated versions are announced 6 months before removal
- Deprecated endpoints return `Sunset` and `Deprecation` headers
- Minimum supported lifetime for any API version: 12 months after GA
- Migration guides published at `usemirador.sh/developers/migrations`

---

## Intellectual Property

The MIRADOR GQL API implements methods covered by US Provisional Patent Application No. 64/012,328 and related filings. Commercial use requires a license. Academic research use is permitted under the `research` tier.

The GQL language and GIGI database engine are covered by US Provisional Application No. 63/933,103 and 63/943,643.

Licensing inquiries: bee_davis@alumni.brown.edu

---

## Live Endpoints (v0.2)

| Endpoint | Method | Description |
|---|---|---|
| `/v1/query` | POST | Execute a GQL statement |
| `/v1/batch` | POST | Execute multiple GQL statements in one request |
| `/v1/ask` | POST | Natural language → GQL translation and execution |
| `/v1/schema` | GET | Return available bundles and their fiber schemas |
| `/v1/drugs` | GET | List all drugs in the warehouse |
| `/v1/diseases` | GET | List all disease instances |
| `/v1/health` | GET | Engine status and version |
| `/v1/docs` | GET | This specification (HTML) |
| `/v1/jobs/:id` | GET | Poll async job status |
| `/v1/jobs/:id` | DELETE | Cancel a running async job |
| `/v1/webhooks` | POST | Create webhook subscription |
| `/v1/webhooks` | GET | List webhook subscriptions |
| `/v1/webhooks/:id` | DELETE | Remove webhook subscription |
| `/v1/keys/:key_id` | DELETE | Revoke an API key |

---

*MIRADOR · GIGI · GQL · Davis Geometric · 2026*
*C = τ / K*
