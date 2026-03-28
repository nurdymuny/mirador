# GIGI × MIRADOR Sheaf Completion Engine

## Full Specification — Native Rust Implementation with Cross-Bundle Propagation

**Status**: PROPOSED  
**Date**: 2026-03-28  
**Filed by**: Mirador team  
**Filed to**: Davis Geometric Engineering  
**Affects**: GIGI Rust engine, MIRADOR frontend, all 16 live bundles (11.1M records)  
**Governing Equation**: $C = \tau / K$  
**Prerequisite**: GIGI persistence upgrade (SHIPPED, commit `046e1fc`)

---

## 0. Motivation

Sheaf completion currently exists as a **JavaScript-only feature** operating on `mirador_universe` — a curated set of ~700 records. It cannot see any of the 11,099,940 records stored in GIGI's 16 bundles. This means:

- **COMPLETE** on vancomycin bone penetration uses 700 neighbors, not the 4.9M ChEMBL activity records that contain real binding affinity data for vancomycin against hundreds of targets
- **PROPAGATE** cascades across tissues within a single drug but cannot cascade across bundles (e.g., a ChEMBL activity → BindingDB binding → ClinTrials outcome chain)
- **CONSISTENCY** checking has no access to the massive evidential base that would surface contradictions in published literature

The upgrade moves sheaf completion into the GIGI Rust engine as a native operation on **any bundle**, with a cross-bundle federation layer that treats the entire 11M-record corpus as a single cellular sheaf.

---

## 1. Mathematical Foundations

### 1.1 Cellular Sheaves over the Data Graph

**Definition.** Let $G = (V, E)$ be a directed graph where:
- $V$ = set of records across all GIGI bundles
- $E$ = set of adjacency edges derived from declared adjacency relations

A **cellular sheaf** $\mathcal{F}$ on $G$ assigns:
- To each vertex $v \in V$, a **stalk** $\mathcal{F}(v) = \mathbb{R}^{d_v}$ (the measured or completable field values at record $v$)
- To each edge $e = (u, v) \in E$, a **restriction map** $\mathcal{F}_{v \leftarrow u} : \mathcal{F}(u) \to \mathcal{F}(v)$ (the linear map expressing how the value at $u$ constrains the value at $v$)

For pharmacological data, the stalks are scalar ($d_v = 1$) and the restriction maps encode the expected relationship between adjacent measurements.

### 1.2 The Sheaf Laplacian

Given a sheaf $\mathcal{F}$ on $G$, define the **coboundary operator**:

$$\delta : C^0(G, \mathcal{F}) \to C^1(G, \mathcal{F})$$

where $C^0$ is the space of 0-cochains (vertex assignments) and $C^1$ is the space of 1-cochains (edge assignments). For a global section $x \in C^0$:

$$(\delta x)(e = u \to v) = \mathcal{F}_{v \leftarrow u}(x_u) - x_v$$

The **sheaf Laplacian** is:

$$L_{\mathcal{F}} = \delta^* \delta = \sum_{e = (u,v) \in E} w_e \cdot \mathcal{F}_{v \leftarrow u}^T \mathcal{F}_{v \leftarrow u}$$

where $w_e$ is the edge weight from the adjacency declaration.

**Key property**: $L_{\mathcal{F}} x = 0$ if and only if $x$ is a **global section** — the data is perfectly sheaf-consistent across all adjacencies. The eigenvalues of $L_\mathcal{F}$ quantify the degree of inconsistency.

### 1.3 Sheaf Completion as Constrained Optimization

Given a partially observed global section $x$ where some vertices have measured values $x_v^{\text{obs}}$ and others are missing ($x_v = {?}$), **sheaf completion** solves:

$$\hat{x} = \arg\min_{x} \; x^T L_{\mathcal{F}} \, x \quad \text{subject to} \quad x_v = x_v^{\text{obs}} \; \forall v \in V_{\text{obs}}$$

This is a quadratic program with the solution given by the **Schur complement**. Partition $L_\mathcal{F}$ by observed ($o$) and missing ($m$) indices:

$$L_\mathcal{F} = \begin{pmatrix} L_{oo} & L_{om} \\ L_{mo} & L_{mm} \end{pmatrix}$$

Then:

$$\hat{x}_m = -L_{mm}^{-1} \, L_{mo} \, x_o^{\text{obs}}$$

This is the **minimum-energy extension** of the observed data to the missing vertices — the unique completion that minimizes sheaf inconsistency.

### 1.4 Confidence from the Sheaf Laplacian

The **confidence** of a completed value $\hat{x}_v$ is derived from the diagonal of $L_{mm}^{-1}$:

$$\sigma_v^2 = (L_{mm}^{-1})_{vv} \cdot s^2$$

where $s^2$ is the empirical variance of the residuals at observed vertices. The confidence score is:

$$\text{confidence}(v) = \frac{1}{1 + \sigma_v^2 / s^2}$$

This normalizes by the empirical variance of the observed data, **not** by the predicted value. The original JS implementation used $\text{CoV} = \sigma / |\hat{x}|$, which has a division-by-zero when $\hat{x}_v = 0$ — a geometrically meaningful case (drug achieves $C = 0$ at a tissue site). A completion of "this drug fails here" can be high-confidence; the old formula would incorrectly report confidence = 0 regardless of evidence strength.

The corrected formula has these properties:
- $\sigma_v \to 0$ (perfectly constrained by neighbors): $\text{confidence} \to 1$
- $\sigma_v = s$ (uncertainty equals population variance): $\text{confidence} = 0.5$
- $\sigma_v \gg s$ (poorly constrained): $\text{confidence} \to 0$
- No dependence on $|\hat{x}_v|$: works correctly for zero-valued completions

### 1.5 Cohomology and Contradiction Detection ($H^1$ Obstruction)

The first sheaf cohomology group $H^1(G, \mathcal{F}) = \ker(\delta_1) / \operatorname{im}(\delta_0)$ detects **contradictions** in the data that cannot be resolved by any consistent global section.

**Theorem (Davis).** If $H^1(G, \mathcal{F}) \neq 0$, then no global section $x$ satisfies all restriction maps simultaneously. The dimension $\dim H^1$ counts the number of independent contradictions.

In practice, we detect $H^1 \neq 0$ via the **robust median + MAD test** on the sheaf Laplacian residuals:

$$r_e = (\delta x)_e = \mathcal{F}_{v \leftarrow u}(x_u) - x_v$$

For each edge $e$, if $|r_e - \text{median}(r)| > H^1_{\text{threshold}} \cdot \text{MAD}(r)$, edge $e$ participates in a cohomological obstruction. The default threshold is $H^1_{\text{threshold}} = 3.0$ (robust to 50% contamination by Maronna's theorem).

### 1.6 Propagation as Sheaf Pushforward

**PROPAGATE** computes the **pushforward** of a hypothetical new measurement through the sheaf. Given a new observation $x_v^{\text{new}}$ at vertex $v$:

1. Add $v$ to $V_{\text{obs}}$
2. Re-solve the Schur complement system with the augmented observation set
3. The **cascade set** $\Delta = \{u \in V_m : |\hat{x}_u^{\text{new}} - \hat{x}_u^{\text{old}}| > \epsilon\}$ identifies all records whose completed values change

The **cascade confidence decay** follows the geodesic distance on the adjacency graph:

$$\text{confidence}_{\text{cascade}}(u) = \text{confidence}(u) \cdot \alpha^{d_G(v, u)}$$

where $d_G(v, u)$ is the shortest-path distance from the new measurement to vertex $u$, and $\alpha = 0.85$ is the per-hop decay factor. This generalizes the existing flat 0.85× discount to **multi-hop cascades** where $k$ hops yield $0.85^k$ confidence.

### 1.7 Integration with the Davis Field Equation

Sheaf completion produces completed values for $\tau$ (pharmacophore invariant) and $K$ (ADMET curvature) at unmeasured drug-tissue combinations. The Davis Field Equation applies to completed values as an **interval**, not a point estimate:

$$C_{\text{completed}} \in \left[ \frac{\hat{\tau}}{K + \sigma_K} \;,\; \frac{\hat{\tau}}{K - \sigma_K} \right] \quad \text{when } \sigma_K < K$$

where $\sigma_K$ is the completion uncertainty on $K$ from the sheaf Laplacian diagonal. When $\sigma_K \geq K$, the completion is flagged as **insufficient confidence** — the uncertainty is so large that the sign of effective curvature is ambiguous, and no meaningful coherence prediction can be made.

This formulation introduces **zero free parameters**. The interval IS the uncertainty. The Davis Field Equation framework has no tunable constants ($C = \tau / K$ is exact for measured data), and the completed extension preserves this property. The clinician sees the interval and decides their risk tolerance:

- **Narrow interval** (e.g., $C \in [10.8, 11.6]$): high-confidence prediction, safe to act on
- **Wide interval** (e.g., $C \in [2.1, 18.4]$): suggests which measurements would narrow it (see §3.5 SUGGEST_MEASUREMENT)
- **Insufficient confidence** ($\sigma_K \geq K$): explicitly reports "cannot determine" with the list of measurements that would resolve it

The interval is **automatically conservative**: the lower bound $\hat{\tau}/(K + \sigma_K)$ is always less than or equal to the point estimate $\hat{\tau}/K$, which is always less than or equal to the upper bound. A clinician choosing the lower bound gets a guaranteed-conservative prediction with no free parameters.

---

## 2. Adjacency Algebra

### 2.1 Adjacency Declaration Syntax

Adjacency relations are declared at bundle creation time or added subsequently:

```sql
ALTER BUNDLE chembl_activities
  ADD ADJACENCY ON target_chembl_id = target_chembl_id WEIGHT 1.0
  ADD ADJACENCY ON pchembl_value WITHIN 0.5 WEIGHT 0.8
  ADD ADJACENCY ON assay_type = assay_type WEIGHT 0.6;
```

Four adjacency types, each defining edges in the data graph:

| Type | Syntax | Edge condition | Restriction map |
|------|--------|----------------|-----------------|
| **Equality** | `ON field = field WEIGHT w` | $v_1.\text{field} = v_2.\text{field}$ | $\mathcal{F}_{v_2 \leftarrow v_1} = \text{Id}$ (identity) |
| **Metric** | `ON field WITHIN r WEIGHT w` | $|v_1.\text{field} - v_2.\text{field}| \leq r$ | $\mathcal{F}_{v_2 \leftarrow v_1} = \text{Id} \cdot \exp(-d^2/2r^2)$ |
| **Threshold** | `ON field ABOVE t WEIGHT w` | $v_1.\text{field} \geq t \wedge v_2.\text{field} \geq t$ | $\mathcal{F}_{v_2 \leftarrow v_1} = \text{Id}$ |
| **Transform** | `ON field_a TO field_b VIA fn WEIGHT w` | $v_1.\text{field\_a}$ and $v_2.\text{field\_b}$ both exist | $\mathcal{F}_{v_2 \leftarrow v_1} = f$ (user-defined) |

The **Transform** type is essential for cross-bundle federation where fields have different units or semantics. Built-in transform functions:

| Function | Definition | Use case |
|----------|------------|----------|
| `log10` | $f(x) = \log_{10}(x)$ | Ki_nM → pChEMBL: $\text{pChEMBL} = -\log_{10}(\text{Ki} \times 10^{-9})$ |
| `scale(a,b)` | $f(x) = a \cdot x + b$ | Unit conversion (nM → μM: `scale(0.001, 0)`) |
| `biofilm(lo,hi)` | $f(x) = x \cdot \beta, \; \beta \in [lo, hi]$ | Planktonic MIC → Biofilm MIC (β ∈ [100, 1000]) |
| `custom(expr)` | User-defined expression | Any domain-specific relationship |

Without Transform, cross-bundle federation is limited to fields that mean the same thing in both bundles — which is rarely true. pChEMBL in ChEMBL is $-\log_{10}(\text{activity in M})$; Ki_nM in BindingDB is a raw nanomolar value. The restriction map between them is `log10` plus unit conversion, not identity.

**Composite weight.** When multiple adjacency relations are declared, the total edge weight between two records is:

$$w(u, v) = \sum_{a \in \mathcal{A}} w_a \cdot \mathbb{1}[\text{adj}_a(u, v)]$$

where $\mathcal{A}$ is the set of declared adjacencies.

### 2.2 Cross-Bundle Adjacency (Federation)

The key innovation: adjacency relations can span bundles:

```sql
CREATE FEDERATION mirador_pharma 
  LINKING chembl_activities.molecule_chembl_id 
       = bindingdb_binding.ligand_name
  LINKING chembl_activities.target_chembl_id 
       = clintrials_studies.nct_number VIA target_trial_map
  WEIGHT 0.7;
```

Federation creates a **virtual bundle** that is the disjoint union of participating bundles, with cross-edges defined by the LINKING clauses. The sheaf Laplacian of the federation is:

$$L_{\text{fed}} = \begin{pmatrix} L_{\text{chembl}} & L_{\text{chembl} \leftrightarrow \text{bindingdb}} \\ L_{\text{bindingdb} \leftrightarrow \text{chembl}} & L_{\text{bindingdb}} \end{pmatrix}$$

This block structure means intra-bundle completion is fast (sparse), and cross-bundle evidence propagates through the off-diagonal blocks.

### 2.3 Adjacency Index Structure

Each adjacency declaration creates a **neighborhood index** in the Rust engine:

- **Equality adjacency**: `HashMap<FieldValue, Vec<RecordId>>` — $O(1)$ neighbor lookup
- **Metric adjacency**: `BKTree<RecordId>` or `KDTree<RecordId>` — $O(\log n)$ range query
- **Threshold adjacency**: `BTreeMap<f64, Vec<RecordId>>` — $O(\log n)$ range scan

The index is built lazily on first COMPLETE query and cached. For the 4.9M-record `chembl_activities` bundle, the equality index on `target_chembl_id` partitions into ~15K groups averaging ~320 records each — small enough for exact Schur complement solving.

---

## 3. GQL Verb Specification

### 3.1 COMPLETE

```sql
COMPLETE ON <bundle|federation>
  WHERE <filter_clause>
  [USING <evidence_bundles>]
  [FIELDS <completable_fields>]
  [METHOD <sheaf_extension|nearest_neighbor|kriging>]
  [MIN_NEIGHBORS <n>]
  [MAX_NEIGHBORS <n>]
  [CONFIDENCE_FLOOR <f>]
  [WITH CONSTRAINT_GRAPH]
```

**Semantics:**

1. **Filter** the target bundle to identify the query vertex $v$ (the record with missing values)
2. **Discover neighbors** via declared adjacency indices
3. **Build local sheaf** $\mathcal{F}$ on the neighborhood subgraph $G_v$
4. **Solve** $\hat{x}_m = -L_{mm}^{-1} L_{mo} x_o$ for the missing fields
5. **Compute confidence** from $L_{mm}^{-1}$ diagonal
6. **Return** completed values with provenance

**Methods:**

| Method | Description | Complexity |
|--------|-------------|------------|
| `sheaf_extension` | Full Sheaf Laplacian solve (default) | $O(n^3)$ where $n$ = neighbor count |
| `nearest_neighbor` | Weighted average of $k$ nearest neighbors | $O(k \log n)$ |
| `kriging` | Gaussian process regression on the adjacency metric | $O(n^3)$ with Cholesky |

**USING clause:** Pulls additional evidence from other bundles for cross-bundle completion:

```sql
COMPLETE ON mirador_universe 
  WHERE drug = 'VAN' AND tissue = 'bone'
  USING chembl_activities, bindingdb_binding
  METHOD sheaf_extension
```

This first queries the target bundle, then enriches the neighborhood with matching records from ChEMBL (by molecule name → `molecule_chembl_id`) and BindingDB (by ligand name), creating a cross-bundle sheaf before solving.

### 3.2 PROPAGATE

```sql
PROPAGATE ON <bundle|federation>
  ASSUMING <observation_clause>
  [DEPTH <max_hops>]
  [DECAY <alpha>]
  SHOW <newly_determined|all|changed>
```

**Semantics:**

1. **Parse** the hypothetical observation from ASSUMING clause
2. **Augment** the observed set $V_{\text{obs}}$ with the hypothetical
3. **Re-solve** the Schur complement
4. **Diff** old vs new completions to identify cascades
5. **Apply** confidence decay $\alpha^{d}$ per hop

**DEPTH** controls the maximum cascade distance (default: unlimited). **DECAY** overrides the default $\alpha = 0.85$.

**SHOW modes:**

| Mode | Description |
|------|-------------|
| `newly_determined` | Only vertices that flip from unknown to known |
| `all` | All completed vertices (including previously completed) |
| `changed` | All vertices whose completed value changed by $>\epsilon$ |

### 3.3 CONSISTENCY

```sql
CONSISTENCY <bundle|federation>
  [WHERE <filter_clause>]
  [H1_THRESHOLD <t>]
  [SHOW contradictions|summary|full]
```

**Semantics:**

1. **Build** the full sheaf $\mathcal{F}$ on the filtered subgraph
2. **Compute** the coboundary $\delta x$ for all observed values
3. **Detect** $H^1$ obstructions via robust median + MAD test
4. **Report** contradictory edges with their residuals, participating records, and estimated $\dim H^1$

**Output:**

```json
{
  "bundle": "chembl_activities",
  "records_checked": 142857,
  "edges_checked": 891204,
  "h1_dimension": 3,
  "contradictions": [
    {
      "record_a": {"id": "CHEMBL12345", "pchembl_value": 7.2, "source": "BindingDB"},
      "record_b": {"id": "CHEMBL67890", "pchembl_value": 4.1, "source": "ChEMBL"},
      "residual": 3.1,
      "adjacency": "target_chembl_id = CHEMBL_TARGET_220",
      "significance": "p < 0.001"
    }
  ],
  "note": "3 independent contradictions detected. H¹ ≠ 0 — data is not sheaf-consistent."
}
```

This is the **first sheaf-theoretic data quality engine** operating at multi-million-record scale on real pharmacological data. It can surface contradictions between ChEMBL, BindingDB, and clinical trial data that no existing tool can detect.

### 3.4 SUGGEST_ADJACENCY

```sql
SUGGEST_ADJACENCY ON <bundle|federation>
  [FIELDS <field1, field2, ...>]
  [SAMPLE_SIZE <n>]
  [CANDIDATES <k>]
  MINIMIZING h1
```

**Semantics:**

1. **Enumerate** candidate adjacency relations from the bundle's schema (or restrict to `FIELDS` if specified)
2. **Sample** $n$ records from the bundle (default: 10,000) for tractability
3. **For each candidate** adjacency, build the sampled adjacency graph and compute $\dim H^1$
4. **Rank** candidates by $\Delta H^1 = H^1_{\text{current}} - H^1_{\text{with\_candidate}}$
5. **Return** the top-$k$ candidates with their predicted $H^1$ reduction

**Output:**

```json
{
  "bundle": "chembl_activities",
  "current_h1": 847,
  "sample_size": 10000,
  "suggestions": [
    {
      "adjacency": "METRIC ON pchembl_value WITHIN 0.5 WEIGHT 0.8",
      "predicted_h1": 589,
      "delta": -258,
      "interpretation": "Similar potency values are consistent — connecting them reduces obstruction"
    },
    {
      "adjacency": "EQUALITY ON assay_type WEIGHT 0.6",
      "predicted_h1": 612,
      "delta": -235,
      "interpretation": "Same assay methodology produces consistent measurements"
    }
  ]
}
```

This is the **killer feature**: automated scientific discovery of data relationships. The sheaf tells you which field relationships reduce inconsistency. The operator reviews suggestions and accepts the ones that make domain sense — the geometry proposes, the scientist disposes.

### 3.5 SUGGEST_MEASUREMENT

```sql
SUGGEST_MEASUREMENT ON <bundle|federation>
  FOR <record_filter>
  [MAX_SUGGESTIONS <k>]
  MAXIMIZING confidence
```

**Semantics:**

1. **Identify** all undetermined completions (from §9.2 singular $L_{mm}$ handling)
2. **For each** undetermined direction, identify the set of records whose measurement would resolve it
3. **Rank** by expected confidence improvement: how many other completions improve if this one is measured
4. **Return** a prioritized measurement plan

This is the inverse of COMPLETE — instead of "what can I predict from what I know?", it answers "what should I measure to maximize what I can predict?"

---

## 4. Rust Architecture

### 4.1 New Crate: `gigi-sheaf`

```
gigi/
├── src/
│   ├── engine.rs           # existing
│   ├── sheaf/
│   │   ├── mod.rs           # re-exports
│   │   ├── adjacency.rs     # adjacency index types
│   │   ├── laplacian.rs     # sheaf Laplacian construction + solve
│   │   ├── complete.rs      # COMPLETE verb handler
│   │   ├── propagate.rs     # PROPAGATE verb handler
│   │   ├── consistency.rs   # CONSISTENCY verb (H¹ detection)
│   │   ├── federation.rs    # cross-bundle virtual graph
│   │   └── confidence.rs    # confidence scoring
│   └── ...
```

### 4.2 Core Data Structures

```rust
/// Adjacency relation declared on a bundle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AdjacencyType {
    /// Records connected if field values are equal.
    Equality {
        field: String,
        weight: f64,
    },
    /// Records connected if field values are within `radius`.
    Metric {
        field: String,
        radius: f64,
        weight: f64,
    },
    /// Records connected if both field values exceed `threshold`.
    Threshold {
        field: String,
        threshold: f64,
        weight: f64,
    },
}

/// Index for fast neighbor lookup on a specific adjacency.
pub enum AdjacencyIndex {
    Equality(HashMap<FieldValue, Vec<RecordId>>),
    Metric(KDTree),
    Threshold(BTreeMap<OrderedFloat<f64>, Vec<RecordId>>),
}

/// A neighborhood around a query vertex.
pub struct Neighborhood {
    /// The query vertex (may have missing fields).
    pub query: RecordId,
    /// Neighbor records with their composite edge weights.
    pub neighbors: Vec<(RecordId, f64)>,
    /// Adjacency edges for the Laplacian.
    pub edges: Vec<(RecordId, RecordId, f64)>,
}

/// Sparse sheaf Laplacian (only the neighborhood subgraph).
pub struct SheafLaplacian {
    /// Dimension: n_obs + n_missing
    pub n: usize,
    /// Partition index: first n_obs rows are observed, rest are missing.
    pub n_obs: usize,
    /// Dense matrix (neighborhoods are small, O(100s) — dense is faster).
    pub L: DMatrix<f64>,
}

/// Result of a COMPLETE operation.
#[derive(Debug, Serialize, Deserialize)]
pub struct CompletionResult {
    pub completed_fields: Vec<CompletedField>,
    pub confidence: f64,
    pub method: String,
    pub neighbor_count: usize,
    pub origin: String,             // "sheaf_completed"
    pub constraint_graph: Option<Vec<ConstraintEdge>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompletedField {
    pub field: String,
    pub value: f64,
    pub uncertainty: f64,           // σ_v from L_mm^{-1}
    pub confidence: f64,            // 1/(1 + CoV²)
}

/// Result of a PROPAGATE operation.
#[derive(Debug, Serialize, Deserialize)]
pub struct PropagationResult {
    pub source: RecordId,
    pub cascades: Vec<Cascade>,
    pub total_affected: usize,
    pub max_depth: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Cascade {
    pub record_id: RecordId,
    pub bundle: String,
    pub field: String,
    pub old_value: Option<f64>,
    pub new_value: f64,
    pub confidence: f64,
    pub depth: usize,               // hops from source
}

/// Result of a CONSISTENCY check.
#[derive(Debug, Serialize, Deserialize)]
pub struct ConsistencyResult {
    pub records_checked: usize,
    pub edges_checked: usize,
    pub h1_dimension: usize,
    pub contradictions: Vec<Contradiction>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Contradiction {
    pub record_a: RecordId,
    pub record_b: RecordId,
    pub field: String,
    pub value_a: f64,
    pub value_b: f64,
    pub residual: f64,
    pub adjacency: String,
    pub significance: f64,          // p-value from MAD test
}
```

### 4.3 Algorithm: COMPLETE

```
COMPLETE(bundle, query_vertex, adjacencies, method, options):
    
    1. DISCOVER neighbors via adjacency indices
       N ← ∅
       for each adj in adjacencies:
           N ← N ∪ adj.index.query(query_vertex, max_neighbors)
       
    2. PRUNE to [min_neighbors, max_neighbors] by composite weight
       sort N by w(query_vertex, n) descending
       N ← N[0..max_neighbors]
       if |N| < min_neighbors: return Error("insufficient evidence")
    
    3. BUILD local sheaf graph G_local
       V = {query_vertex} ∪ N
       E = {(u, v, w) : u, v ∈ V, w(u,v) > 0}
    
    4. CONSTRUCT Laplacian L_F
       for each edge (u, v, w) in E:
           L_F[u,u] += w
           L_F[v,v] += w
           L_F[u,v] -= w * F_{v←u}
           L_F[v,u] -= w * F_{u←v}
    
    5. PARTITION into observed / missing
       V_obs = {v ∈ V : v.field ≠ NULL}
       V_miss = V \ V_obs
       L_oo, L_om, L_mo, L_mm ← partition(L_F)
    
    6. SOLVE via Schur complement
       x_obs ← observed values
       x_miss ← -L_mm⁻¹ · L_mo · x_obs
       
       // For small neighborhoods (n < 500): dense Cholesky
       // For large neighborhoods: conjugate gradient with diagonal preconditioner
    
    7. CONFIDENCE from diagonal of L_mm⁻¹
       for each v ∈ V_miss:
           σ²_v = (L_mm⁻¹)_{vv} · s²
           CoV_v = σ_v / |x_miss[v]|
           confidence_v = 1 / (1 + CoV_v²)
    
    8. RETURN CompletionResult
```

### 4.4 Algorithm: PROPAGATE

```
PROPAGATE(bundle, hypothetical, depth, decay):
    
    1. BASELINE: solve COMPLETE without the hypothetical
       x_old ← current completed section
    
    2. AUGMENT: add hypothetical to observed set
       V_obs' ← V_obs ∪ {hypothetical.vertex}
       x_obs'[hypothetical.vertex] ← hypothetical.value
    
    3. RE-SOLVE: new Schur complement
       x_new ← COMPLETE with V_obs'
    
    4. DIFF: identify cascades
       for each v ∈ V_miss:
           if |x_new[v] - x_old[v]| > ε:
               d ← shortest_path(hypothetical.vertex, v)
               if d ≤ depth:
                   cascade ← Cascade {
                       old_value: x_old[v],
                       new_value: x_new[v],
                       confidence: confidence(v) × α^d,
                       depth: d
                   }
    
    5. RETURN sorted by depth ascending, then confidence descending
```

### 4.5 Algorithm: CONSISTENCY

```
CONSISTENCY(bundle, filter, h1_threshold):
    
    1. SELECT records matching filter
    2. BUILD full sheaf graph on selected records
    3. COMPUTE coboundary residuals
       for each edge (u, v, w):
           r_e = F_{v←u}(x_u) - x_v
    
    4. ROBUST statistics
       med ← median(|r|)
       MAD ← 1.4826 · median(|r - med|)
    
    5. FLAG contradictions
       contradictions ← ∅
       for each edge with |r_e - med| > h1_threshold × MAD:
           contradictions.push(edge, r_e, p-value)
    
    6. ESTIMATE dim H¹
       // Connected components of the contradiction subgraph
       dim_h1 ← count_components(contradiction_edges)
    
    7. RETURN ConsistencyResult
```

---

## 5. REST API Endpoints

### 5.1 COMPLETE

```
POST /v1/bundles/{name}/complete
Content-Type: application/json

{
  "where": {"target_chembl_id": "CHEMBL220", "standard_type": "IC50"},
  "fields": ["pchembl_value"],
  "using": ["bindingdb_binding"],
  "method": "sheaf_extension",
  "min_neighbors": 2,
  "max_neighbors": 200,
  "confidence_floor": 0.5,
  "constraint_graph": true
}
```

**Response:**

```json
{
  "status": "ok",
  "completed": [
    {
      "field": "pchembl_value",
      "value": 6.82,
      "uncertainty": 0.34,
      "confidence": 0.89,
      "method": "sheaf_extension",
      "neighbor_count": 47,
      "origin": "sheaf_completed"
    }
  ],
  "constraint_graph": [
    {"from": "CHEMBL123", "adjacency": "target_chembl_id", "value": 7.1, "weight": 1.0},
    {"from": "CHEMBL456", "adjacency": "target_chembl_id", "value": 6.5, "weight": 1.0},
    {"from": "BDB_789",   "adjacency": "cross:ligand_name", "value": 6.9, "weight": 0.7}
  ],
  "timing_ms": 12
}
```

### 5.2 PROPAGATE

```
POST /v1/bundles/{name}/propagate
Content-Type: application/json

{
  "assuming": {"molecule_chembl_id": "CHEMBL25", "pchembl_value": 7.5, "tissue": "bone"},
  "depth": 5,
  "decay": 0.85,
  "show": "newly_determined"
}
```

**Response:**

```json
{
  "status": "ok",
  "source": {"molecule_chembl_id": "CHEMBL25", "tissue": "bone"},
  "cascades": [
    {"bundle": "chembl_activities", "record": "CHEMBL_ACT_991", "field": "pchembl_value", "new_value": 7.1, "confidence": 0.85, "depth": 1},
    {"bundle": "bindingdb_binding", "record": "BDB_2201", "field": "ki_nm", "new_value": 45.2, "confidence": 0.72, "depth": 2},
    {"bundle": "clintrials_studies", "record": "NCT04112381", "field": "outcome_expected", "new_value": 0.78, "confidence": 0.61, "depth": 3}
  ],
  "total_affected": 3,
  "max_depth_reached": 3,
  "timing_ms": 84
}
```

### 5.3 CONSISTENCY

```
POST /v1/bundles/{name}/consistency
Content-Type: application/json

{
  "where": {"target_chembl_id": "CHEMBL220"},
  "h1_threshold": 3.0,
  "show": "contradictions"
}
```

**Response:**

```json
{
  "status": "ok",
  "records_checked": 3421,
  "edges_checked": 28903,
  "h1_dimension": 2,
  "contradictions": [
    {
      "record_a": {"id": "CHEMBL_ACT_12345", "pchembl_value": 8.1, "assay_type": "B"},
      "record_b": {"id": "CHEMBL_ACT_67890", "pchembl_value": 4.9, "assay_type": "F"},
      "field": "pchembl_value",
      "residual": 3.2,
      "adjacency": "target_chembl_id = CHEMBL220",
      "significance": 0.0002
    }
  ],
  "summary": "2 independent H¹ obstructions detected among 3421 records for CHEMBL220. Primary contradiction: binding assays (B) report pChEMBL ~8 while functional assays (F) report ~5."
}
```

### 5.4 Adjacency Management

```
POST /v1/bundles/{name}/adjacency
Content-Type: application/json

{
  "type": "equality",
  "field": "target_chembl_id",
  "weight": 1.0
}

POST /v1/federations
Content-Type: application/json

{
  "name": "mirador_pharma",
  "bundles": ["chembl_activities", "bindingdb_binding", "clintrials_studies"],
  "links": [
    {"from": "chembl_activities.molecule_chembl_id", "to": "bindingdb_binding.ligand_name", "weight": 0.7},
    {"from": "chembl_activities.target_chembl_id", "to": "clintrials_studies.nct_number", "via": "target_trial_map", "weight": 0.5}
  ]
}
```

---

## 6. Seed Adjacency Configurations

Each bundle ships with **exactly one** seed adjacency — the obvious equality on its primary grouping field. Additional adjacencies are **discovered from the data** using `SUGGEST_ADJACENCY` (§3.5), not prescribed. The whole point of the adjacency algebra is that it's tunable; the sheaf tells you which field relationships reduce inconsistency.

### 6.1 Seed Adjacencies (one per bundle)

| Bundle | Seed Adjacency | Rationale |
|--------|---------------|----------|
| `chembl_activities` | `EQUALITY ON target_chembl_id WEIGHT 1.0` | Activities for the same target should be consistent |
| `chembl_compounds` | `EQUALITY ON molecule_chembl_id WEIGHT 1.0` | Same molecule across records |
| `chembl_targets` | `EQUALITY ON organism WEIGHT 1.0` | Same organism targets |
| `chembl_assays` | `EQUALITY ON assay_type WEIGHT 1.0` | Same assay methodology |
| `chembl_drug_target` | `EQUALITY ON target_chembl_id WEIGHT 1.0` | Same drug target |
| `bindingdb_binding` | `EQUALITY ON target_name WEIGHT 1.0` | Same binding target |
| `clintrials_studies` | `EQUALITY ON condition WEIGHT 1.0` | Same disease condition |
| `pgx_clinical` | `EQUALITY ON gene WEIGHT 1.0` | Same pharmacogene |
| `pgx_variants` | `EQUALITY ON gene WEIGHT 1.0` | Same gene locus |
| `pgx_drug_labels` | `EQUALITY ON gene WEIGHT 1.0` | Same gene |
| `mirador_drugs` | `EQUALITY ON drug WEIGHT 1.0` | Same drug across tissues |
| `mirador_thresholds` | `EQUALITY ON disease WEIGHT 1.0` | Same disease |
| `mirador_regimens` | `EQUALITY ON drug WEIGHT 1.0` | Same drug |
| `mirador_pk_studies` | `EQUALITY ON drug WEIGHT 1.0` | Same drug |
| `mirador_resistance` | `EQUALITY ON mutation WEIGHT 1.0` | Same resistance mutation |
| `mirador_sources` | `EQUALITY ON type WEIGHT 1.0` | Same source type |

### 6.2 Discovery Workflow

After seed adjacencies are applied, run:

```sql
SUGGEST_ADJACENCY ON chembl_activities MINIMIZING h1 CANDIDATES 10
```

This returns ranked candidate adjacencies with their predicted $\Delta H^1$ improvement:

```json
{
  "bundle": "chembl_activities",
  "current_h1": 847,
  "suggestions": [
    {"adjacency": "EQUALITY ON assay_type WEIGHT 0.6", "predicted_h1": 612, "delta": -235},
    {"adjacency": "METRIC ON pchembl_value WITHIN 0.5 WEIGHT 0.8", "predicted_h1": 589, "delta": -258},
    {"adjacency": "EQUALITY ON standard_type WEIGHT 0.4", "predicted_h1": 831, "delta": -16}
  ]
}
```

The operator reviews the suggestions, accepts the ones that make domain sense, and rejects any that are spurious correlations. The adjacency structure is **discovered from the data, not prescribed**.

### 6.6 Cross-Bundle Federation: `mirador_pharma`

```
FEDERATION mirador_pharma:
  BUNDLES: chembl_activities, chembl_compounds, chembl_drug_target, 
           bindingdb_binding, clintrials_studies, pgx_clinical,
           mirador_drugs

  LINKS:
    chembl_activities.molecule_chembl_id = chembl_compounds.molecule_chembl_id  WEIGHT 1.0
    chembl_activities.target_chembl_id   = chembl_drug_target.target_chembl_id  WEIGHT 1.0
    chembl_activities.molecule_chembl_id ~ bindingdb_binding.ligand_name        WEIGHT 0.7
    chembl_drug_target.molecule_name     ~ mirador_drugs.drug                   WEIGHT 0.8
    chembl_drug_target.target_chembl_id  ~ clintrials_studies.condition VIA target_disease_map  WEIGHT 0.5
    pgx_clinical.drug                    ~ mirador_drugs.drug                   WEIGHT 0.9
```

This federation creates a single sheaf over **8.5M+ records** from 7 bundles, enabling:
- COMPLETE a drug's bone penetration using ChEMBL binding data + BindingDB affinity + clinical trial outcomes
- PROPAGATE a new PK measurement through pgx → mirador → chembl chains
- CONSISTENCY check between ChEMBL and BindingDB for the same drug-target pair

---

## 7. Computational Complexity and Performance

### 7.1 Complexity Analysis

| Operation | Local (single bundle) | Federated | Bottleneck |
|-----------|----------------------|-----------|------------|
| Neighbor discovery | $O(\log n)$ per adjacency | $O(B \log n)$ for $B$ bundles | Index lookup |
| Laplacian construction | $O(k^2)$ for $k$ neighbors | $O(k^2)$ (same) | Edge enumeration |
| Schur complement solve | $O(k^3)$ dense Cholesky | $O(k^3)$ | Matrix inversion |
| Confidence computation | $O(k^2)$ from existing factorization | $O(k^2)$ | Diagonal extraction |
| PROPAGATE (full re-solve) | $O(k^3)$ per hypothetical | $O(k^3)$ | Second Cholesky |
| CONSISTENCY (full scan) | $O(n \cdot \bar{d})$ for avg degree $\bar{d}$ | $O(N \cdot \bar{d})$ | Linear scan |

**Key insight**: The Schur complement operates on the **local neighborhood** (typically $k = 50$–$500$ records), not the entire bundle (4.9M). The neighborhood size is bounded by `max_neighbors`, making COMPLETE $O(1)$ with respect to bundle size after the $O(\log n)$ index lookup.

### 7.2 Performance Targets

| Operation | Target Latency | Record Scale |
|-----------|---------------|--------------|
| COMPLETE (single bundle) | < 5 ms | 4.9M (chembl_activities) |
| COMPLETE (federation, 7 bundles) | < 50 ms | 8.5M |
| PROPAGATE (depth 3) | < 100 ms | 8.5M |
| CONSISTENCY (filtered) | < 500 ms | Up to 100K records |
| CONSISTENCY (full bundle) | < 30 s | 4.9M |
| Adjacency index build (lazy) | < 10 s | 4.9M (one-time) |

### 7.3 Memory Budget

| Component | Memory | Notes |
|-----------|--------|-------|
| Equality index (chembl_activities, target_id) | ~8 MB | 15K groups × 320 records × 16 bytes |
| KD-tree (pchembl_value metric) | ~40 MB | 4.9M f64 values with tree overhead |
| Laplacian workspace | ~2 MB | 500×500 dense f64 matrix (max neighborhood) |
| Total per bundle | ~50 MB | |
| Total all 16 bundles | ~200 MB | Well within 32 GB VM |

---

## 8. Integration with MIRADOR Frontend

### 8.1 Upgraded GQL Verbs

The existing JS COMPLETE/PROPAGATE handlers in `gql-engine.js` become thin wrappers that route to GIGI when the server is reachable:

```javascript
// COMPLETE — route to GIGI native sheaf engine
if (gigiAvailable) {
  const resp = await fetch(`${GIGI_URL}/v1/bundles/${bundle}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ where: filters, fields, method, using: evidenceBundles })
  });
  return resp.json();
}
// Fallback: existing in-browser completion on mirador_universe
return localComplete(universe, filters, method);
```

### 8.2 New NL Intents

Extend the NL intent classifier with GIGI-native intents:

| Intent | Example Question | Generated GQL |
|--------|-----------------|---------------|
| `predict_unmeasured` | "Predict vancomycin's bone penetration" | `COMPLETE ON mirador_drugs WHERE drug='VAN' AND tissue='bone' USING chembl_activities,bindingdb_binding METHOD sheaf_extension` |
| `cascade_analysis` | "If we measured tedizolid in bone, what else would we learn?" | `PROPAGATE ON mirador_pharma ASSUMING drug='TDZ' AND tissue='bone' AND R=0.52 DEPTH 5 SHOW newly_determined` |
| `data_quality` | "Are there contradictions in ChEMBL data for PBP2a?" | `CONSISTENCY chembl_activities WHERE target_chembl_id='CHEMBL220' H1_THRESHOLD 3.0 SHOW contradictions` |
| `cross_bundle_complete` | "What does ChEMBL + BindingDB tell us about ceftaroline's target affinity?" | `COMPLETE ON mirador_pharma WHERE drug='CAR' FIELDS pchembl_value,ki_nm USING chembl_activities,bindingdb_binding` |

### 8.3 UI Components

**Sheaf Completion Card (new):**
- Input: drug, tissue, optional patient context
- Output: completed $C$ value, confidence gauge, constraint graph visualization
- Neighbors shown as a force-directed mini-graph with edge weights

**Consistency Dashboard (new):**
- Bundle selector dropdown
- $H^1$ dimension badge (green = 0, yellow = 1–2, red = 3+)
- Contradictions table sortable by residual magnitude
- "Resolve" button that links to the original data source

**Cascade Visualizer (new):**
- Sankey diagram showing propagation flow across bundles
- Confidence decay shown as opacity gradient
- Depth rings: innermost = depth 1, outermost = max depth

---

## 9. Mathematical Guarantees and Invariants

### 9.1 Correctness Invariants

**INV-1 (Sheaf consistency on completion).** For any completed section $\hat{x}$:

$$\hat{x}^T L_\mathcal{F} \hat{x} \leq x^T L_\mathcal{F} x \quad \forall x \text{ s.t. } x_{V_{\text{obs}}} = x^{\text{obs}}$$

The completed section minimizes sheaf energy — it is the most consistent extension of the data.

**INV-2 (Confidence monotonicity).** Adding more neighbors (increasing $|V_{\text{obs}}|$) can only increase confidence:

$$|V_{\text{obs}}'| \geq |V_{\text{obs}}| \implies \text{confidence}(\hat{x}_v') \geq \text{confidence}(\hat{x}_v) \quad \forall v$$

More evidence always increases certainty (or leaves it unchanged).

**INV-3 (Propagation causality).** The cascade set $\Delta$ is contained in the $d$-hop neighborhood of the new observation:

$$v \in \Delta \implies d_G(\text{source}, v) \leq \text{depth}$$

Cascades cannot teleport across the graph.

**INV-4 (Conservation of measurement).** Observed values are never modified by COMPLETE or PROPAGATE:

$$v \in V_{\text{obs}} \implies \hat{x}_v = x_v^{\text{obs}}$$

Sheaf completion fills gaps; it does not overwrite measurements.

**INV-5 (Consistency idempotence).** Running CONSISTENCY on data that passes CONSISTENCY returns $H^1 = 0$:

$$\text{CONSISTENCY}(\text{COMPLETE}(x^{\text{obs}})) = 0$$

Completing data resolves all resolvable contradictions.

### 9.2 Convergence Guarantees

**Theorem (Schur complement well-posedness).** If the adjacency graph $G$ is connected and the sheaf Laplacian $L_\mathcal{F}$ has no zero eigenvalues on the missing subspace ($L_{mm}$ is positive definite), then:

1. The completion $\hat{x}_m = -L_{mm}^{-1} L_{mo} x_o$ exists and is unique
2. The confidence scores are well-defined ($\sigma_v^2 > 0$ for all $v$)
3. The solution is numerically stable (condition number of $L_{mm}$ is bounded by $\kappa(L_\mathcal{F})$)

**When $L_{mm}$ is singular** (disconnected missing subgraph), the zero eigenvalues of $L_{mm}$ identify **degrees of freedom the data does not constrain**. Rather than silently using the pseudoinverse (which picks one arbitrary completion among infinitely many), the engine:

1. **Eigendecompose** $L_{mm} = Q \Lambda Q^T$
2. **Identify** the null directions: $\mathcal{N} = \{q_i : \lambda_i < \epsilon_{\text{machine}}\}$
3. **Solve** the constrained system on the non-null subspace only
4. **Report** each null direction as an **undetermined field** with:
   - The specific field(s) that cannot be completed
   - The set of **resolving measurements**: records that, if measured, would make the field completable (this is a reverse-PROPAGATE query)
   - `confidence = 0` for the undetermined direction

The response includes a `undetermined` array:

```json
{
  "completed": [{"field": "pchembl_value", "value": 6.82, "confidence": 0.89}],
  "undetermined": [
    {
      "field": "assay_cell_type",
      "reason": "disconnected from observed subgraph (no adjacent records with assay_cell_type)",
      "resolving_measurements": [
        {"bundle": "chembl_activities", "record": "CHEMBL_ACT_3344", "field": "assay_cell_type"},
        {"bundle": "chembl_activities", "record": "CHEMBL_ACT_5567", "field": "assay_cell_type"}
      ]
    }
  ]
}
```

This is common in sparse pharmacological data. The engine doesn't pretend to know what it can't determine — it tells you exactly what to measure next.

### 9.3 Relationship to the Davis Field Equation

Sheaf completion on the `mirador_pharma` federation **generates** the inputs to $C = \tau / K$:

1. **COMPLETE** on `chembl_activities` → predicted $\text{pChEMBL}$ → maps to $\tau$ via the pharmacophore pipeline
2. **COMPLETE** on ADMET-relevant fields → predicted clearance, distribution → informs $K$
3. **CONSISTENCY** checks literature values against clinical observations → validates the $C$ prediction

The chain is:

$$\text{ChEMBL/BindingDB data} \xrightarrow{\text{COMPLETE}} \hat{\tau}, \hat{K} \xrightarrow{C = \tau/K} C \in [C_{\text{lo}}, C_{\text{hi}}] \xrightarrow{\text{Keske layers}} C_{\text{bone}} \pm \sigma$$

This makes the Davis Field Equation **applicable to unmeasured drug-tissue combinations** by using sheaf geometry to fill the gaps in the input data, with uncertainty intervals derived from the geometry — no free parameters.

---

## 10. Test Plan

### 10.1 Unit Tests (Rust)

```
SHEAF-1: Laplacian construction for 3-node path graph
  Given: A → B → C, w=1.0, values A=10, C=20
  Then:  COMPLETE gives B̂ = 15.0, confidence > 0.9

SHEAF-2: Confidence increases with more neighbors
  Given: star graph with 3, 10, 50 neighbors (same value ± noise)
  Then:  confidence(50) > confidence(10) > confidence(3)

SHEAF-3: H¹ detection on known contradiction
  Given: triangle A→B→C→A, values A=1, B=10, C=1, all EQUALITY adjacency
  Then:  H¹ dimension ≥ 1, edge B→C flagged as contradiction

SHEAF-4: Propagation causality
  Given: chain A→B→C→D→E, new measurement at A
  Then:  PROPAGATE depth=2 returns cascades at B and C only (not D, E)

SHEAF-5: Conservation of observed values
  Given: any graph with observed values
  Then:  COMPLETE never modifies observed values

SHEAF-6: Schur complement matches manual calculation
  Given: 4-node graph with known L matrix
  Then:  x̂_miss matches hand-computed -L_mm⁻¹ L_mo x_obs to ε=1e-12

SHEAF-7: Metric adjacency radius cutoff
  Given: records with pchembl_value = [5.0, 5.4, 5.5, 6.0, 8.0], radius=0.5
  Then:  5.0 adjacent to 5.4, 5.5; not adjacent to 6.0, 8.0

SHEAF-8: Threshold adjacency
  Given: records with CRP = [10, 50, 100, 200], threshold=50
  Then:  50↔100, 50↔200, 100↔200; 10 has no threshold-neighbors

SHEAF-9: Empty neighborhood returns error
  Given: query vertex with 0 neighbors
  Then:  COMPLETE returns Error("insufficient evidence")

SHEAF-10: Confidence floor filter
  Given: completion with confidence=0.3, confidence_floor=0.5
  Then:  result filtered out (not returned)
```

### 10.2 Integration Tests (Rust, against real bundles)

```
SHEAF-INT-1: COMPLETE on chembl_activities for known target
  Given: target_chembl_id = CHEMBL220 (PBP2a), missing pchembl_value
  Then:  completed value ∈ [4.0, 9.0] (reasonable pChEMBL range)
         confidence > 0.5
         neighbor_count ≥ 10

SHEAF-INT-2: CONSISTENCY on chembl_activities for CHEMBL220
  Given: all records for PBP2a target
  Then:  H¹ dimension ≥ 0 (may find real contradictions in ChEMBL data)
         result includes assay-type-specific breakdown

SHEAF-INT-3: Cross-bundle COMPLETE via federation
  Given: federation mirador_pharma, query for vancomycin bone penetration
  Then:  evidence from ≥ 2 bundles
         constraint_graph includes edges from both ChEMBL and BindingDB

SHEAF-INT-4: PROPAGATE across federation
  Given: new measurement of ceftaroline at bone
  Then:  cascades into chembl_activities (binding strength predictions)
         cascades into clintrials_studies (expected trial outcomes)
         maximum depth ≥ 2

SHEAF-INT-5: Large-scale CONSISTENCY on full chembl_activities
  Given: no filter (all 4.9M records)
  Then:  completes in < 30 seconds
         H¹ result is integer ≥ 0

SHEAF-INT-6: Adjacency index build time
  Given: chembl_activities (4.9M records), equality on target_chembl_id
  Then:  index builds in < 10 seconds
         serialized index size < 20 MB
```

### 10.3 Frontend Tests (Vitest)

```
SHEAF-FE-1: COMPLETE routes to GIGI when available
  Given: mock GIGI server returning completion result
  Then:  GQL engine calls /v1/bundles/.../complete endpoint
         result includes origin='sheaf_completed'

SHEAF-FE-2: COMPLETE falls back to local when GIGI unavailable
  Given: GIGI server unreachable
  Then:  GQL engine uses in-browser completion on mirador_universe
         result structure matches GIGI format

SHEAF-FE-3: NL intent 'data_quality' maps to CONSISTENCY
  Given: "Are there contradictions in ChEMBL data for PBP2a?"
  Then:  intent = 'data_quality'
         generated_gql contains 'CONSISTENCY'

SHEAF-FE-4: NL intent 'cross_bundle_complete' parsed correctly
  Given: "What does ChEMBL + BindingDB tell us about ceftaroline?"
  Then:  generated_gql contains 'USING chembl_activities,bindingdb_binding'

SHEAF-FE-5: Cascade visualizer renders propagation
  Given: PropagationResult with 5 cascades across 3 bundles
  Then:  Sankey diagram renders without error
         all 5 cascades visible
```

### 10.4 Mathematical Validation Tests (Python)

```python
# VAL-SHEAF-1: Sheaf Laplacian eigenvalues match scipy
def test_laplacian_eigenvalues_match():
    """Build L_F for a small graph, verify eigenvalues match scipy.linalg.eigvalsh."""
    L_gigi = call_gigi("/v1/bundles/test/complete", debug=True)["laplacian"]
    L_scipy = build_sheaf_laplacian_scipy(same_graph)
    assert np.allclose(np.sort(np.linalg.eigvalsh(L_gigi)), 
                       np.sort(np.linalg.eigvalsh(L_scipy)), atol=1e-10)

# VAL-SHEAF-2: Confidence formula matches theoretical CoV
def test_confidence_formula():
    """Verify confidence = 1/(1 + CoV²) against manual computation."""
    result = call_gigi("/v1/bundles/test/complete", ...)
    sigma = result["uncertainty"]
    xhat = result["value"]
    cov = sigma / abs(xhat)
    expected_conf = 1.0 / (1.0 + cov**2)
    assert abs(result["confidence"] - expected_conf) < 1e-10

# VAL-SHEAF-3: Davis field equation with completed inputs
def test_completed_coherence_is_conservative():
    """C_completed ≤ C_measured for same (drug, tissue) when uncertainty > 0."""
    c_measured = tau / k  # from exact data
    result = complete_via_gigi(drug, tissue)
    tau_hat = result["completed_tau"]
    k_adjusted = k + LAMBDA * result["uncertainty"]
    c_completed = tau_hat / k_adjusted
    assert c_completed <= c_measured + 1e-10  # conservative by construction
```

---

## 11. Migration Plan

### Phase 1: Adjacency Infrastructure (Rust)

1. Add `AdjacencyType` and `AdjacencyIndex` to `Bundle` struct
2. Implement `ALTER BUNDLE ... ADD ADJACENCY` GQL verb
3. Implement lazy index construction on first COMPLETE query
4. Wire adjacency persistence to WAL (`WalEntry::AddAdjacency`)
5. Tests: SHEAF-7, SHEAF-8

### Phase 2: Local COMPLETE (Rust)

1. Implement `SheafLaplacian` construction from neighborhood
2. Implement Schur complement solver (dense Cholesky for $k < 500$, CG for larger)
3. Implement confidence scoring
4. Add `POST /v1/bundles/{name}/complete` endpoint
5. Tests: SHEAF-1, SHEAF-2, SHEAF-5, SHEAF-6, SHEAF-9, SHEAF-10

### Phase 3: CONSISTENCY (Rust)

1. Implement coboundary residual computation
2. Implement robust median + MAD $H^1$ detector
3. Add `POST /v1/bundles/{name}/consistency` endpoint
4. Tests: SHEAF-3

### Phase 4: PROPAGATE (Rust)

1. Implement hypothetical augmentation + re-solve
2. Implement cascade diff with depth tracking
3. Implement confidence decay formula
4. Add `POST /v1/bundles/{name}/propagate` endpoint
5. Tests: SHEAF-4

### Phase 5: Federation (Rust)

1. Implement `Federation` struct (virtual bundle union)
2. Implement cross-bundle LINKING with field mapping
3. Implement federated sheaf Laplacian (block structure)
4. Add `POST /v1/federations` management endpoint
5. Tests: SHEAF-INT-3, SHEAF-INT-4

### Phase 6: Default Adjacencies + Integration Tests

1. Apply default adjacency configurations (Section 6) to all 16 bundles
2. Create `mirador_pharma` federation
3. Run full integration test suite against live 11M-record server
4. Tests: SHEAF-INT-1 through SHEAF-INT-6

### Phase 7: Frontend Integration

1. Upgrade `gql-engine.js` COMPLETE/PROPAGATE handlers to route to GIGI
2. Add new NL intents (`data_quality`, `cross_bundle_complete`)
3. Add Sheaf Completion Card, Consistency Dashboard, Cascade Visualizer
4. Tests: SHEAF-FE-1 through SHEAF-FE-5

### Phase 8: Mathematical Validation

1. Python validation suite against scipy reference implementation
2. Davis Field Equation integration with completed values
3. Keske Method bone-specific sheaf completion validation
4. Tests: VAL-SHEAF-1 through VAL-SHEAF-3

---

## 12. Sheaf Completion for the Keske Method

### 12.1 Bone-Specific Sheaf

The Keske Method adds four curvature layers: $K_{\text{bone}} = K_{\text{admet}} + K_{\text{penetration}} + K_{\text{biofilm}} + K_{\text{reservoir}}$. Each layer has missing values that sheaf completion can fill:

| Layer | Missing Data Example | Sheaf Completion Source |
|-------|---------------------|----------------------|
| $K_{\text{penetration}}$ | Ceftaroline bone penetration ratio in pediatric patients | ChEMBL adult PK data + BindingDB tissue distribution |
| $K_{\text{biofilm}}$ | MRSA biofilm MIC for tedizolid | ChEMBL planktonic MIC (with 100–1000× biofilm correction sheaf) |
| $K_{\text{reservoir}}$ | Drug concentration in Haversian canals | COMPLETE from cortical bone + trabecular bone measurements |

### 12.2 Biofilm Correction Sheaf

The **biofilm correction sheaf** $\mathcal{B}$ relates planktonic MIC to biofilm MIC:

$$\mathcal{B}_{v_{\text{biofilm}} \leftarrow v_{\text{planktonic}}} : \text{MIC}_{\text{planktonic}} \mapsto \text{MIC}_{\text{planktonic}} \times \beta$$

where $\beta \in [100, 1000]$ is the biofilm amplification factor, itself estimated by sheaf completion from the available biofilm MIC data in the literature. The restriction map is **non-identity** — this is where the full power of cellular sheaves (vs. simple averaging) becomes necessary.

### 12.3 Clinical Decision Chain

For a patient like Steven Keske:

$$\text{ChEMBL binding data} \xrightarrow{\text{COMPLETE}} \hat{\tau}_{\text{ceftaroline}}$$

$$\text{Adult PK} + \text{Pediatric physiology} \xrightarrow{\text{COMPLETE}} \hat{K}_{\text{penetration,pediatric}}$$

$$\text{Planktonic MIC} \xrightarrow{\mathcal{B}} \hat{K}_{\text{biofilm}}$$

$$C_{\text{bone}} = \frac{\hat{\tau}}{K_{\text{admet}} + \hat{K}_{\text{penetration}} + \hat{K}_{\text{biofilm}} + K_{\text{reservoir}}}$$

Every $\hat{}$ quantity carries a confidence score from the sheaf Laplacian, so the clinician sees not just $C_{\text{bone}} = 11.2$ but $C_{\text{bone}} = 11.2 \pm 1.4$ (confidence: 0.87).

---

## 13. Theoretical Significance

### 13.1 First Principles

This is, to our knowledge, the **first implementation of cellular sheaf theory on a multi-million-record pharmacological database**. Previous applications of sheaf theory to data science (Curry 2014, Robinson 2014, Hansen & Ghrist 2019) have been limited to synthetic examples or small datasets (< 10K records).

The key technical contributions are:

1. **Local Schur complement**: By exploiting the sparsity of the adjacency graph, we reduce the $O(N^3)$ global solve to $O(k^3)$ local solves, making sheaf completion practical at the 11M-record scale
2. **Cross-bundle federation**: The block-structured sheaf Laplacian enables coherent reasoning across heterogeneous data sources (binding assays, clinical trials, pharmacogenomics) without data harmonization
3. **$H^1$ contradiction detection**: The first automated system for detecting contradictions in pharmacological literature using sheaf cohomology

### 13.2 Connection to MIRADOR Geometry

The Davis Field Equation $C = \tau / K$ defines coherence on the therapeutic manifold. Sheaf completion extends this manifold from the measured subspace to the full drug-tissue-patient product space. The relationship is:

$$\underbrace{(M, g_M)}_{\text{Candidate manifold}} \times \underbrace{(T, h)}_{\text{Target manifold}} \times \underbrace{(P, g_P)}_{\text{Patient manifold}} \xrightarrow{\text{Fiber bundle } \pi} \underbrace{C = \tau/K}_{\text{Coherence section}}$$

The coherence section $C$ is a **section of the fiber bundle** $\pi : E \to B$. Sheaf completion fills in the values of this section at points where no measurement exists, using the geometry of the bundle (adjacency = metric on the base, restriction maps = connection on the bundle).

In the language of the MIRADOR spec:
- **Layer 3** (Fiber Bundle) provides the geometric structure
- **Layer 5** (ADMET Curvature) provides $K$
- **Layer 4** (Pharmacophore) provides $\tau$
- **Sheaf Completion** is the **extension of the coherence section** to unmeasured fibers

This is the mathematical content of "rational drug design from first principles" — not just computing $C$ where we have data, but **predicting $C$ where we don't**, with quantified uncertainty derived from the geometry.

---

## 14. Dependencies

| Crate | Purpose | Version |
|-------|---------|---------|
| `nalgebra` | Dense linear algebra (Cholesky, eigendecomposition) | existing |
| `ordered-float` | BTreeMap keys for threshold adjacency | 4.x |
| `petgraph` | Graph algorithms (shortest path, connected components) | existing |
| `rayon` | Parallel consistency checks | existing |
| `serde` / `serde_json` | Serialization | existing |

No new external crates beyond what GIGI already depends on, except `ordered-float` for the threshold index.

---

## 15. Versioning and Recomputation

### 15.1 Measurement Override

When new measured data arrives for a field that was previously completed (predicted), the measured value **automatically supersedes** the completion. This is tracked via a new WAL entry type:

```rust
enum WalEntry {
    // existing variants...
    MeasurementOverride {
        bundle: String,
        record_id: String,
        field: String,
        old_completed_value: f64,
        old_confidence: f64,
        new_measured_value: f64,
        timestamp: u64,
    },
}
```

**Invariant:** Measured data always wins. A completed value is a prediction; a measurement is ground truth. The WAL records the override for audit trail and for computing completion accuracy over time.

### 15.2 Cascade Recomputation

When a `MeasurementOverride` is recorded, the engine triggers a **lazy cascade recomputation**:

1. The overridden record moves from $V_m$ (missing) to $V_o$ (observed) in the Laplacian
2. All records adjacent to the overridden record are marked **stale** in the completion cache
3. On the next COMPLETE query touching any stale record, the Schur complement is re-solved with the updated observation set
4. The cascade propagates: any records whose completed values change by more than $\epsilon$ are also marked stale

This is lazy — we don't eagerly recompute all downstream completions. The staleness flag is a single bit per record in the adjacency index.

### 15.3 Completion Accuracy Tracking

Each `MeasurementOverride` provides a ground-truth calibration point: we predicted $\hat{x}$ with confidence $c$, and the actual measurement was $x$. Over time this builds a calibration curve:

- If 90% of completions with confidence 0.9 are within 10% of the measurement, the confidence model is well-calibrated
- If completions systematically over/under-estimate, the adjacency weights may need adjustment (flag via `SUGGEST_ADJACENCY`)

The accuracy history is queryable:

```sql
COMPLETION_ACCURACY ON <bundle> [SINCE <timestamp>]
```

---

## References

1. Curry, J. (2014). *Sheaves, Cosheaves and Applications*. PhD thesis, University of Pennsylvania.
2. Robinson, M. (2014). *Topological Signal Processing*. Springer.
3. Hansen, J. & Ghrist, R. (2019). "Toward a spectral theory of cellular sheaves." *Journal of Applied and Computational Topology*, 3(4), 315–358.
4. Davis, B.R. (2026). *The Davis Manifold*. Theory paper, Davis Geometric.
5. Keske Method Spec v0.1 — Pediatric Bone MRSA Module for MIRADOR.
6. MIRADOR Spec v0.2 — TDD & Mathematical Validation.
7. GIGI Persistence Upgrade Spec — SHIPPED 2026-03-28.
