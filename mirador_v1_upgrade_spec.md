# MIRADOR API: v0.2 → v1.0 Upgrade Specification
## What Exists, What Changes, What Gets Added
### Bee Rosa Davis · Davis Geometric · 2026-03-27

---

## Current State (v0.2) — What Copilot Built

Working today, deployed on Vercel:

```
Question (English)
    ↓
translateNL() — regex intent + dictionary entity extraction
    ↓
generateGQL() — deterministic GQL assembly
    ↓
universeGQL() — WASM engine execution
    ↓
generateAnswer() — template-based English response
```

**What works:**
- 7 intents via regex waterfall (sub-millisecond, zero cost, offline)
- 34 drugs, 8 diseases, 20+ tissues in dictionary
- Client-side execution via WASM
- API routes: `/v1/ask`, `/v1/query`, `/v1/schema`, `/v1/health`
- Follow-up query generation
- Clarification flow for ambiguous questions
- Animated GQL typewriter in frontend

**What's missing from the full spec:**
- Disease-specific thresholds (currently flat 0.6, should be 5.0 for bone MRSA, 0.50 for meningitis, 1.0 for HIV)
- Full C = τ/K with series K decomposition (currently simplified equation)
- Confidence scores on every response
- Provenance (source citations) on every response
- DHOOM wire format between engine and composition layer
- Double Cover diagnostic (S + d² = 1)
- Sheaf completion (COMPLETE verb)
- Cascade analysis (PROPAGATE verb)
- Patient context (age, weight, CRP adjustment)
- Conversational sessions
- LLM fallback for questions regex can't parse
- Gauge-encrypted queries
- Async jobs for large PULLBACK queries
- Webhooks

---

## Architecture: v1.0

```
Question (English)
    ↓
┌─────────────────────────────────┐
│  LAYER 1: Intent + Entities     │
│  translateNL() [KEEP — regex]   │
│  Falls through to Claude API    │
│  only if regex returns          │
│  clarification_needed           │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  LAYER 2: GQL Generation        │
│  generateGQL() [UPGRADE]        │
│  Now emits full C = τ/K verbs   │
│  with CONTEXT, WITH clauses     │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  LAYER 3: GIGI Engine           │
│  Rust engine (29 crates)        │
│  Returns DHOOM wire format      │
│  Every result has confidence    │
│  + provenance + decomposition   │
└──────────────┬──────────────────┘
               ↓
┌─────────────────────────────────┐
│  LAYER 4: Answer Composition    │
│  generateAnswer() [UPGRADE]     │
│  Reads DHOOM, composes English  │
│  For complex questions: Claude  │
│  API with DHOOM in system prompt│
└──────────────┬──────────────────┘
               ↓
Response (English + DHOOM + GQL + follow-ups)
```

---

## Upgrade 1: Full C = τ/K Engine

### What changes

The WASM engine currently computes a simplified coherence.
Replace with the full Davis Field Equations:

```
C = τ / K

where:
  τ = log₁₀(AUC₂₄ / MIC)
  K = K_admet + K_barrier + K_phenotype + K_reservoir
  K_barrier = max(1/R - 1, -1)
```

### Disease-specific thresholds

```javascript
const THRESHOLDS = {
  mrsa:       { theta: 5.0,  anchor: "vancomycin monotherapy failure" },
  tb:         { theta: 0.50, anchor: "INH monotherapy at cavity site" },
  meningitis: { theta: 0.50, anchor: "ceftriaxone at peak inflammation" },
  hiv:        { theta: 1.0,  anchor: "single-cell suppression" }
};
```

### Input data upgrade

Current DEMO_DB has simplified drug entries. Replace with
the full validated data from `mirador_input_data.json`
(the file we built today — every AUC, MIC, R value, MBEC
with source citations, verified 55/55).

### Combination law

Current: not implemented in WASM.
Add: parallel-resistor combination (coupled and decoupled modes).

```
Coupled:   C_combo = Σ τᵢ gᵢ  where gᵢ = 1/Kᵢ
Decoupled: C_combo = (Σ τᵢ)(Σ gᵢ)
Synergy:   C_combo *= s (coupled) or s² (decoupled)
```

### Catalytic modification (HIV)

```
f'_s = f_s + Φ · f_r
C_total = f'_s × C_combo
```

### Implementation path

Option A: Upgrade the existing JS/WASM engine in
`gql-engine.js` with the full equations. Fast, stays
client-side.

Option B: Route `/v1/query` to the Rust engine on
`gigi-stream.fly.dev` for server-side computation,
keep JS engine as offline fallback.

**Recommendation: Option B.** The Rust engine already
has 290 tests across 29 crates. Don't reimplement in JS
what Rust already does. The JS engine becomes the
offline demo; the Rust engine becomes the production
computation layer.

---

## Upgrade 2: Confidence + Provenance on Every Response

### What changes

Every result object grows three fields:

```json
{
  "drug": "VAN",
  "C": 2.08,
  "confidence": 0.70,
  "provenance": [
    {"field": "R_bone", "value": 0.20, "source": "Graziani 1988"},
    {"field": "MIC", "value": 1.0, "source": "EUCAST v14.0"},
    {"field": "MBEC", "value": 512, "source": "Parra-Ruiz 2012"}
  ],
  "decomposition": {
    "K_admet": 0.50,
    "K_barrier": 1.63,
    "K_phenotype": 2.57,
    "K_reservoir": 1.07
  }
}
```

### Where confidence comes from

For the v1.0 launch, confidence is pre-computed from the
input data (how many independent sources report each
value, and how much they agree). Stored in the bundle at
insert time. Returned at query time at zero additional cost.

The `mirador_input_data.json` already has source citations.
Curvature κ = variance across sources at each base point.
Confidence = 1/(1+κ).

### Answer generation changes

`generateAnswer()` currently says:
> "VAN achieves C = 0.26 at bone, below θ = 5.0."

Upgrade to:
> "No. Vancomycin achieves C = 2.08 at the bone site, below
> the therapeutic threshold θ = 5.0 (confidence: 0.70,
> moderate — 4 source studies with some disagreement on bone
> penetration). The dominant barrier is biofilm resistance
> (K_phenotype = 2.57), followed by bone penetration
> (K_barrier = 1.63)."

Template:
```javascript
function generateAnswer(result, intent) {
  const drug = result.drug;
  const C = result.C.toFixed(2);
  const theta = result.threshold;
  const pass = result.C >= theta;
  const conf = describeConfidence(result.confidence);
  const dominant = getDominantK(result.decomposition);

  if (intent === 'single_drug_check') {
    return `${pass ? 'Yes' : 'No'}. ${drug} achieves C = ${C} `
      + `at ${result.tissue}, ${pass ? 'above' : 'below'} `
      + `θ = ${theta} (confidence: ${conf}). `
      + `Dominant barrier: ${dominant.name} `
      + `(${dominant.key} = ${dominant.value.toFixed(2)}).`;
  }
  // ... other intents
}
```

---

## Upgrade 3: DHOOM Wire Format

### What changes

The Rust engine returns DHOOM instead of JSON on the
internal wire between engine and composition layer.

Request header: `Accept: application/dhoom`
Response header: `Content-Type: application/dhoom`

### Why this matters

From the DHOOM coherence tests: 209/209 accuracy, 40-62%
fewer tokens than JSON. This means:

- Every `/v1/ask` call that uses Claude API for
  composition costs 40-62% fewer input tokens
- Response time drops (less data to parse)
- The system prompt includes the DHOOM schema (fiber
  header) once; every subsequent response is compact

### System prompt for Claude composition layer

```
You are the MIRADOR answer engine. You receive query
results in DHOOM format. DHOOM uses:
  @ = sequential index (base space compression)
  | = default value (zero section)
  : = deviation from default
  > = nested sub-bundle

Example DHOOM response:
drug|tissue|C|theta|pass|conf|K_admet|K_bar|K_phe|K_res
VAN|bone|2.08|5.0|N|0.70|0.50|1.63|2.57|1.07

Read this as: vancomycin at bone site has coherence 2.08,
threshold 5.0, does NOT pass, confidence 0.70, with K
decomposition showing phenotype (2.57) as dominant barrier.

Compose a natural language answer. Always include:
1. Direct yes/no
2. The C value and threshold comparison
3. Which K component dominates and why
4. Confidence level
5. Suggest follow-up queries

Never recommend treatment. Report what the geometry says.
```

### Fallback

If the client requests `Accept: application/json`, the
engine returns JSON. DHOOM is the default for
machine-to-machine (engine → composition layer).
JSON is the default for external API consumers.

---

## Upgrade 4: Double Cover Diagnostic

### New response field

Every query that spans multiple reservoirs (COVER ON
across tissues, HIV reservoir landscape, TB lesion types)
returns a `double_cover` object:

```json
{
  "double_cover": {
    "S": 0.78,
    "d_squared": 0.22,
    "geometry_dominated": ["bone_matrix", "soft_tissue"],
    "dynamics_dominated": ["intracellular_SCV"],
    "rank_inversion": false
  }
}
```

### Answer generation

When S < 1.0:
> "The geometric coverage is S = 0.78 (78% of reservoirs
> are geometry-dominated). At 22% of sites, non-geometric
> dynamics (kill kinetics, immune response) may override
> the penetration ranking. Trust the ranking at bone matrix
> and soft tissue. Interpret with caution at intracellular
> SCV sites."

### GQL verb

Already defined in gql-engine.js intent classification.
Map `cure_feasibility` intent to:

```
COVER ON mirador_universe
  WHERE disease = :disease
  EVALUATE coherence
  RANK BY coherence DESC
  WITH CONFIDENCE, PROVENANCE, DOUBLE_COVER
```

---

## Upgrade 5: LLM Fallback for Complex Questions

### What changes

The regex engine handles the controlled vocabulary
perfectly. Keep it as the primary path. Add Claude API
as a fallback ONLY when regex returns
`clarification_needed`.

```javascript
async function handleAsk(question) {
  // Stage 1: Try regex (free, instant, deterministic)
  const regexResult = translateNL(question);

  if (regexResult.status === 'ok') {
    // Regex handled it — execute directly
    return executeAndCompose(regexResult);
  }

  // Stage 2: Regex couldn't parse — ask Claude
  const llmResult = await claudeFallback(question);
  return executeAndCompose(llmResult);
}

async function claudeFallback(question) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: GQL_SYSTEM_PROMPT,  // GQL reference + entity lists
      messages: [{
        role: 'user',
        content: `Translate this clinical question to GQL.
          Return JSON: {"intent": "...", "entities": {...}, "generated_gql": "..."}
          Question: ${question}`
      }]
    })
  });

  const data = await response.json();
  return JSON.parse(data.content[0].text);
}
```

### Cost structure

- Regex path: $0 per query, <1ms
- Claude fallback: ~$0.003 per query, ~500ms
- Only triggered when regex fails (estimated <5% of queries)
- Blended cost: ~$0.00015 per query average

---

## Upgrade 6: Patient Context

### What changes

The `/v1/ask` endpoint accepts optional patient parameters:

```json
{
  "question": "Can vancomycin reach MRSA in bone?",
  "patient": {
    "age_years": 8,
    "weight_kg": 25,
    "crp_mg_L": 250,
    "chronicity": "chronic"
  }
}
```

### Patient adjustments (bone MRSA)

```javascript
function applyPatientContext(drug, patient) {
  // CRP-adjusted bone penetration
  const crpFactor = Math.min(
    1.0 + 0.006 * Math.max(patient.crp_mg_L - 100, 0),
    2.0
  );
  drug.R_eff = drug.R_bone * crpFactor;

  // Recompute K_barrier from adjusted R
  drug.K_barrier = Math.max(1.0 / drug.R_eff - 1.0, -1.0);

  // Chronicity adjusts biofilm (MBEC higher in chronic)
  if (patient.chronicity === 'chronic') {
    drug.MBEC_factor = 1.0;  // already at chronic values
  } else if (patient.chronicity === 'acute') {
    drug.MBEC_factor = 0.5;  // acute = lower biofilm burden
  }

  // Recompute K, C
  drug.K = drug.K_admet + drug.K_barrier
    + drug.K_phenotype * drug.MBEC_factor + drug.K_reservoir;
  drug.C = drug.tau / drug.K;

  return drug;
}
```

### GQL with CONTEXT

```
SECTION AT mirador_universe
  WHERE drug = 'VAN' AND tissue = 'bone'
  CONTEXT { age: 8, weight: 25, crp: 250, chronicity: 'chronic' }
  EVALUATE coherence
  WITH CONFIDENCE, DECOMPOSITION, PROVENANCE
```

The CONTEXT clause is passed to the engine, which applies
patient adjustments before computing C.

---

## Upgrade 7: Conversational Sessions

### What changes

Add session memory so follow-up questions work:

```json
// Turn 1
{ "question": "Can vancomycin reach MRSA in bone?", "session_id": "sess_abc" }

// Turn 2
{ "question": "What about adding rifampin?", "session_id": "sess_abc" }
// → Agent knows the context is bone MRSA + vancomycin
// → Generates: COMBINE ['VAN', 'RIF'] ON mirador_universe WHERE ...
```

### Implementation

Server-side session store (Redis or in-memory Map with
30-minute TTL):

```javascript
const sessions = new Map();

function getSessionContext(sessionId) {
  const sess = sessions.get(sessionId);
  if (!sess || Date.now() - sess.timestamp > 30 * 60 * 1000) {
    return null;  // expired
  }
  return sess;
}

function updateSession(sessionId, result) {
  sessions.set(sessionId, {
    disease: result.entities.diseases?.[0],
    tissue: result.entities.tissues?.[0],
    drugs: result.entities.drugs || [],
    last_gql: result.generated_gql,
    last_intent: result.intent,
    timestamp: Date.now()
  });
}
```

### Entity inheritance

When a follow-up question mentions "adding rifampin" but
doesn't mention the disease or tissue, the session fills
in the missing entities from the previous turn:

```javascript
function mergeWithSession(entities, session) {
  if (!entities.diseases.length && session.disease) {
    entities.diseases = [session.disease];
  }
  if (!entities.tissues.length && session.tissue) {
    entities.tissues = [session.tissue];
  }
  if (entities.drugs.length && session.drugs.length) {
    // "adding rifampin" → merge with previous drugs
    entities.drugs = [...new Set([
      ...session.drugs, ...entities.drugs
    ])];
  }
  return entities;
}
```

---

## Upgrade 8: Geometric Verdict Language

### What changes

Rename `verdict` field to `geometric_verdict` everywhere.
Add disclaimer field.

Current:
```json
{ "verdict": "fails_threshold" }
```

Upgraded:
```json
{
  "geometric_verdict": "below_threshold",
  "geometric_verdict_note": "Mathematical classification (C < θ). Not clinical guidance."
}
```

### Answer generation

Current:
> "VAN achieves C = 0.26 at bone, below θ = 5.0."

Upgraded:
> "Geometrically, vancomycin achieves C = 2.08 at the bone
> site, below the mathematical threshold θ = 5.0. This is a
> geometric penetration assessment, not a clinical
> recommendation."

---

## Upgrade 9: Sheaf Completion (COMPLETE verb)

### What changes

New GQL verb in the engine. When a drug-tissue pair has
no measured R value, the engine attempts sheaf completion
from neighboring sections.

```
COMPLETE ON mirador_universe
  WHERE tissue = 'bone'
    AND K_barrier IS NULL
  METHOD sheaf_extension
  MIN_CONFIDENCE 0.70
```

### NL mapping

New intent pattern in `classifyIntent()`:

```javascript
// Priority 8 (new, lowest)
{ regex: /\bpredict\b|\bguess\b|\bestimate\b|\bunmeasured\b/,
  intent: 'predict_unmeasured' }
```

Example: "Can you predict tedizolid's bone penetration?"
→ Intent: `predict_unmeasured`
→ GQL: `COMPLETE ON mirador_universe WHERE drug = 'TDZ' AND tissue = 'bone' METHOD sheaf_extension`

### Answer for completed values

> "No direct measurement exists for tedizolid bone
> penetration. Sheaf completion from 4 neighboring sections
> (linezolid R_bone, tedizolid logP model, tedizolid
> protein binding, linezolid CSF ratio) implies R_bone ≈ 0.52
> (confidence: 0.83). This is geometrically implied, not
> experimentally measured. Suggested validation: measure
> tedizolid in surgical bone samples."

Always includes `origin: 'sheaf_completed'` in the result.

---

## Upgrade 10: PROPAGATE (Cascade Analysis)

### What changes

New GQL verb. "If I measured X, what else becomes known?"

```
PROPAGATE ON mirador_universe
  ASSUMING drug = 'TDZ' AND tissue = 'bone' AND R = 0.52
  SHOW newly_determined
```

### NL mapping

```javascript
// "If I measured tedizolid in bone, what else would we learn?"
{ regex: /\bif\s+(?:I|we)\s+measured\b|\bwhat\s+else\b.*\blearn\b/,
  intent: 'cascade_analysis' }
```

### Answer

> "Measuring tedizolid bone penetration (R = 0.52) would
> cascade to 7 additional completions: tedizolid joint fluid
> (conf 0.91), tedizolid abscess (conf 0.87), tedizolid
> prosthetic (conf 0.84), oritavancin bone (conf 0.76)..."

---

## Implementation Priority

### Tier 1: Core equation + data (ship first)

1. Load `mirador_input_data.json` into WASM engine
2. Replace simplified equation with full C = τ/K
3. Add disease-specific thresholds
4. Add K decomposition to response
5. Add confidence (pre-computed from source count)
6. Add provenance (source citations from input data)

### Tier 2: Combination law + DHOOM

7. Implement coupled/decoupled combination in engine
8. Add synergy modifier
9. DHOOM response format on internal wire
10. Upgrade `generateAnswer()` templates

### Tier 3: Double Cover + patient context

11. Double Cover computation (S + d² = 1)
12. Patient context parsing + CRP/chronicity adjustment
13. CONTEXT clause in GQL
14. Geometric verdict language cleanup

### Tier 4: Intelligence layer

15. Claude API fallback for unrecognized questions
16. Session memory (Redis or in-memory Map)
17. Entity inheritance across turns
18. Conversational follow-ups

### Tier 5: Discovery engine

19. Sheaf completion (COMPLETE verb)
20. Cascade analysis (PROPAGATE verb)
21. New intent patterns for predict/cascade questions
22. Answer templates for completed values

### Future: Scale

23. Rust engine on Fly.io as primary compute
24. JS/WASM as offline fallback
25. ChEMBL PULLBACK (async jobs)
26. Gauge-encrypted queries
27. Webhook subscriptions
28. Custom DHOOM tokenizer experiments

---

## What Stays the Same

- **The regex NL layer stays.** It handles the controlled
  vocabulary perfectly. Sub-millisecond. Zero cost. Offline.
  Claude is fallback only.
- **The Vercel deployment stays.** Serverless, edge-cached,
  automatic scaling.
- **The frontend typewriter animation stays.** Users see
  the GQL being generated in real time.
- **The follow-up query system stays.** Pre-built GQL for
  obvious next questions.
- **The clarification flow stays.** When intent is ambiguous,
  show clickable options.

---

## What This Becomes

After week 5, the system is:

```
Doctor types: "Can vancomycin reach MRSA in my patient's
bone? She's 8 years old, 25 kg, CRP is 250, chronic."

→ Regex parses: single_drug_check + VAN + MRSA + bone
→ Patient context: {age: 8, weight: 25, crp: 250, chronic}
→ GQL: SECTION AT mirador_universe WHERE drug = 'VAN'
       AND tissue = 'bone' CONTEXT {crp: 250, chronicity: 'chronic'}
       WITH CONFIDENCE, DECOMPOSITION, PROVENANCE
→ Engine computes: C = 2.08, K = 5.78, dominant = K_phenotype
→ DHOOM: VAN|bone|2.08|5.0|N|0.70|0.50|1.63|2.57|1.07
→ Answer: "No. Vancomycin achieves C = 2.08 at the bone
   site (CRP-adjusted R = 0.38), below θ = 5.0. Dominant
   barrier: chronic biofilm (K = 2.57). Confidence: 0.70.
   Try: ceftaroline + rifampin (C = 16.4, crosses threshold
   at 3.3×)."
→ Follow-ups:
   [Try ceftaroline + rifampin]
   [Rank all drugs at bone]
   [Why does biofilm matter?]
```

Zero training. Zero Modal credits. Zero PPL.
Regex + Rust + DHOOM + Claude-as-voice.
Knowledge in the bundle. Language from the API.
The mouth is rented. The brain is owned.

---

*MIRADOR v1.0 · Davis Geometric · 2026*
*C = τ / K*
