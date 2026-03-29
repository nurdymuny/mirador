# SHEAF LAB — Page Specification

## A Live Demonstration of Sheaf-Theoretic Completion on the Davis Manifold

**Author:** Bee Rosa Davis
**Date:** June 2025
**Parent Branch:** VII (The Cohomology of Completion)
**Engine:** GIGI v1 — Geometric Intelligence Graph Interface
**Governing Equation:** $C = \tau / K$

---

## 0. Purpose

*"MIRADOR is the constructive dual of HERALD. Where HERALD detects biological disruption as curvature anomaly, MIRADOR designs biological restoration by maximizing coherence. The same Davis Field Equation governs both: C = τ/K. The arrow reverses."*
— MIRADOR_SPEC v0.2, §0 Preamble

*"The upgrade moves sheaf completion into the GIGI Rust engine as a native operation on any bundle, with a cross-bundle federation layer that treats the entire 11M-record corpus as a single cellular sheaf."*
— GIGI_SHEAF_COMPLETION_SPEC, §0 Motivation

The Sheaf Lab is a new top-level page on the MIRADOR site that demonstrates three capabilities of sheaf completion that no existing system can replicate:

1. **Auto-Validation via PROPAGATE** — the cascade output *is* the next validation study
2. **Cross-Domain COMPLETE** — one engine, one verb, five fiber bundles, five domains
3. **Reverse COMPLETE for Drug Discovery** — the missing vertex is a molecule that doesn't exist yet

Each capability is grounded in the formal sheaf-theoretic framework of Branch VII (SH1–SH8, Čech cohomology, obstruction theory) and executes against the live GIGI engine.

---

## 1. Auto-Validation via PROPAGATE

*"PROPAGATE computes the pushforward of a hypothetical new measurement through the sheaf. Given a new observation $x_v^{\text{new}}$ at vertex $v$: add $v$ to $V_{\text{obs}}$, re-solve the Schur complement system with the augmented observation set, and the cascade set identifies all records whose completed values change."*
— GIGI_SHEAF_COMPLETION_SPEC, §1.6

*"The first sheaf cohomology group $H^1(G, \mathcal{F}) = \ker(\delta_1) / \operatorname{im}(\delta_0)$ detects contradictions in the data that cannot be resolved by any consistent global section."*
— GIGI_SHEAF_COMPLETION_SPEC, §1.5

### 1.1 The Thesis

> The sheaf knows where the highest-confidence unmeasured gaps are. Each gap is a testable prediction. The validation suite writes itself from the geometry.

Instead of manually selecting disease conditions for validation (PJI, prostatitis, TB, HIV, DFO, neonatal meningitis, …), we run:

```gql
PROPAGATE ON mirador_pharma SHOW newly_determined
```

and the CASCADE output — ranked by `confidence × clinical_impact` — *is* the next 10 validation studies.

### 1.2 Mathematical Foundation

**Sheaf-Theoretic Basis:** PROPAGATE implements the pushforward of a hypothetical observation through the constraint cover $\mathcal{U} = \{U_c\}$ of the Davis manifold $(M, g)$.

**Definition (Cascade Set).** Given bundle $\mathcal{B}$, an observation $x_v$ at vertex $v$, and tolerance $\varepsilon > 0$, the cascade set is:

$$\mathcal{C}(v, x_v, \varepsilon) = \left\{ u \in V_{\text{miss}} \;\middle|\; \bigl|\hat{x}_u^{\text{new}} - \hat{x}_u^{\text{old}}\bigr| > \varepsilon \right\}$$

where $\hat{x}_u^{\text{new}}$ is the Schur-complement completion after adding $v$ to the observed set $V_{\text{obs}}$:

$$\hat{x}_m^{\text{new}} = -\bigl(L_{mm}^{\text{new}}\bigr)^{-1} L_{mo}^{\text{new}} \, x_o^{\text{new}}$$

**Confidence-Decay (SH5-motivated).** Cascade confidence decays with graph distance via the holonomy budget (SH5(d), eq. 44 of Branch VII):

$$\text{confidence}_{\text{cascade}}(u) = \text{confidence}(u) \times \alpha^{d_G(v,u)}, \quad \alpha = e^{-c/L}$$

where $d_G(v,u)$ is the shortest-path distance in the adjacency graph and $L$ is the nerve diameter. The decay parameter $\alpha$ is motivated by the cocycle norm bound $\|\alpha\|_{\check{C}^1} < \tau_{\text{budget}} / k$ — each hop through a constraint patch contributes an accumulated BCH error, and the multiplicative discount ensures the holonomy norm remains within the linearization convergence radius $\|\alpha\| < \log 2 / L$ (Remark 5.1 of Branch VII). For typical pharmacological nerves with $L \approx 4$–$5$, this yields $\alpha \approx 0.85$. The constant is graph-dependent, not universal.

**Clinical Impact Score.** Each newly-determined vertex $u$ carries a clinical impact weight:

$$w_{\text{clinical}}(u) = \underbrace{\text{disease\_burden}(u)}_{\text{DALYs or mortality}} \times \underbrace{\text{unmet\_need}(u)}_{\text{1 - coverage}} \times \underbrace{\text{measurability}(u)}_{\text{feasibility of RCT}}$$

**Ranking Function.** The auto-validation ranking is:

$$\text{rank}(u) = \text{confidence}(u) \times w_{\text{clinical}}(u)$$

This is the product of geometric certainty (how well-determined the completion is by the Čech complex) and clinical relevance. Studies at the top of this list have the highest expected information gain per research dollar.

### 1.3 Obstruction Detection as Quality Gate

Before ranking, PROPAGATE runs the H¹ obstruction detector (SH3, Theorem 3.1):

$$\check{H}^1(\mathcal{U}, \mathcal{F}) \neq 0 \implies \text{contradictions exist}$$

**Algorithm:**
1. Compute coboundary residuals $r_e = \mathcal{F}_{v \leftarrow u}(x_u) - x_v$ for all edges $e = (u,v)$
2. Robust median + MAD test: flag edges where $|r_e - \text{median}(r)| > 3.0 \times \text{MAD}(r)$
3. Flagged edges partition into independent contradiction clusters → $\dim H^1 \geq$ count of clusters (each component contributes at least one independent cocycle; the actual dimension can be higher if a single component contains multiple independent obstruction classes)

Any newly-determined vertex $u$ touching a flagged edge is marked `CONFLICTED` and excluded from the validation ranking. The obstruction class identifies *which* constraints are incompatible — these become the *negative* validation targets (studies expected to fail, confirming the contradiction).

### 1.4 GQL Interface

```gql
-- Auto-generate the next 10 validation studies
PROPAGATE ON mirador_pharma
  SHOW newly_determined
  RANKED BY confidence * clinical_impact DESC
  LIMIT 10
  WITH PROVENANCE

-- Show the contradiction map (negative controls)
PROPAGATE ON mirador_pharma
  SHOW conflicted
  WHERE dim_H1 > 0
  WITH OBSTRUCTION_CLASS
```

### 1.5 UI Panel: "Validation Generator"

| Element | Description |
|---------|-------------|
| **Run Button** | "Generate Next Studies" — executes PROPAGATE |
| **Results Table** | Rank, Drug × Disease × Compartment, Predicted C, Confidence, Clinical Impact, Combined Score |
| **Cascade Graph** | Interactive DAG showing which observations cascade to which predictions, edge weights = confidence decay |
| **Obstruction Panel** | Red-highlighted contradiction clusters with SH3 obstruction class labels |
| **Export** | Download as JSON or CSV for grant applications / protocol design |

### 1.6 What This Proves

The validation suite is not hand-picked. It is *derived* from the geometry of the constraint cover. Every prediction is a section of the completion presheaf $\mathcal{F}$ (SH1, Definition 2.1) that extends the observed data through the Čech complex. The ranking function combines geometric confidence (inverse of the Schur-complement posterior variance $(L_{mm}^{-1})_{vv}$) with clinical utility, producing a research prioritization that is both mathematically optimal and clinically actionable.

---

## 2. Cross-Domain COMPLETE

*"$L_{\mathcal{F}} x = 0$ if and only if $x$ is a global section — the data is perfectly sheaf-consistent across all adjacencies. The eigenvalues of $L_\mathcal{F}$ quantify the degree of inconsistency."*
— GIGI_SHEAF_COMPLETION_SPEC, §1.2

*"This is the minimum-energy extension of the observed data to the missing vertices — the unique completion that minimizes sheaf inconsistency."*
— GIGI_SHEAF_COMPLETION_SPEC, §1.3

*"This is the killer feature: automated scientific discovery of data relationships. The sheaf tells you which field relationships reduce inconsistency. The operator reviews suggestions and accepts the ones that make domain sense — the geometry proposes, the scientist disposes."*
— GIGI_SHEAF_COMPLETION_SPEC, §3.4 (SUGGEST_ADJACENCY)

### 2.1 The Thesis

> One GIGI engine, one COMPLETE verb, five different fiber bundles, five different domains, all producing sheaf-completed predictions with confidence scores. The demo isn't "GIGI works for pharma." The demo is "GIGI works for everything."

### 2.2 Mathematical Foundation

**The Universality Claim (SH1).** The completion presheaf $\mathcal{F}$ (Definition 2.1, Branch VII) is defined over *any* Davis manifold $(M, g)$ with constraint set $\mathcal{C} = \{c_1, \ldots, c_N\}$:

$$\mathcal{F}(U) = \left\{ \gamma_U : U \to W \;\middle|\; \gamma_U \text{ satisfies } c \text{ for all } c \text{ with } R_c \subseteq U \right\}$$

The value space $W$, the constraint operators $\{c_i\}$, and the adjacency structure are *parameters*, not hardcoded properties. COMPLETE solves the same Schur-complement equation regardless of what the fiber *means*:

$$\hat{x}_m = -L_{mm}^{-1} L_{mo} \, x_o$$

The only requirement is that the data admits a weighted graph Laplacian $L$ built from the four adjacency types (equality, metric, threshold, transform). This is the content of SH2 — the Čech complex construction is purely combinatorial and depends only on the nerve $\mathcal{N}(\mathcal{U})$, not on the domain semantics.

**Confidence Formula (domain-invariant).** For any completed vertex $v$, the posterior variance is:

$$\sigma_v^2 = (L_{mm}^{-1})_{vv} \cdot s^2$$

where $s^2$ is the empirical variance of the observed data in the bundle. The confidence is:

$$\text{confidence}(v) = \frac{1}{1 + \sigma_v^2 / s^2} = \frac{1}{1 + (L_{mm}^{-1})_{vv}}$$

The $s^2$ normalization is critical for cross-domain comparability: $(L_{mm}^{-1})_{vv}$ has units of (edge weight)$^{-1}$, which differ between bundles (pharmacological weights $\approx 1.0$ vs. geospatial weights $\approx 50$km). Dividing by the data variance $s^2$ makes the confidence dimensionless and comparable across all five domains. Note: this formula avoids the CoV-based normalization $1/(1 + \text{CoV}^2)$ which fails when $\hat{x}_v = 0$ (GIGI_SHEAF_COMPLETION_SPEC §1.4 correction).

**Obstruction Theorem (SH3) — Domain-Invariant.**

$$\text{Global completion exists} \iff \delta(b) = 0 \in \check{H}^1(M, \mathcal{F}_{\text{ext}})$$

This holds identically for every fiber bundle. When the Čech 1-cohomology is nonzero, completion fails — regardless of whether the bundle encodes drug penetration ratios, seismic velocities, or protein expression levels.

### 2.3 The Five Bundles

Each bundle is a fiber bundle $\pi: E \to B$ over a domain-specific base manifold $B$, with fibers $F$ carrying the target measurements and adjacency defined by domain-appropriate constraint types.

#### Bundle 1: `mirador_pharma` — Antimicrobial Pharmacology

| Property | Value |
|----------|-------|
| **Base** $B$ | Drug × Disease × Compartment |
| **Fiber** $F$ | $(\tau, K, C, R, \text{FIC})$ — pharmacophore, curvature, coherence, penetration ratio, synergy |
| **Adjacency** | Equality on `target_id`, Metric on `pchembl_value WITHIN 0.5`, Transform on `ki_nM TO pchembl VIA -log10` |
| **Governing Eq** | $C = \tau / K$ |
| **Records** | ~11M (ChEMBL 34 + BindingDB + PharmGKB) |
| **Example COMPLETE** | "What is the tissue penetration ratio for tedizolid in bone?" |

#### Bundle 2: `genomics_expr` — Gene Expression Atlas

| Property | Value |
|----------|-------|
| **Base** $B$ | Gene × Tissue × Condition |
| **Fiber** $F$ | $(TPM, \text{fold\_change}, p_{\text{adj}}, \text{pathway\_score})$ |
| **Adjacency** | Equality on `gene_id`, Metric on `expression WITHIN 1.0` (log₂ TPM), Threshold on `significance ABOVE 0.05` |
| **Governing Eq** | Fold-change coherence: ratio of observed-to-expected expression given pathway membership |
| **Data Source** | GTEx v8 + TCGA + GEO curated sets |
| **Example COMPLETE** | "What is the expected TPM for BRCA1 in pancreatic ductal cells under hypoxia?" |

#### Bundle 3: `climate_flux` — Carbon Flux Monitoring

| Property | Value |
|----------|-------|
| **Base** $B$ | Station × Season × Ecosystem |
| **Fiber** $F$ | $(\text{NEE}, \text{GPP}, R_{\text{eco}}, \text{soil\_moisture}, T_{\text{air}})$ |
| **Adjacency** | Metric on `lat,lon WITHIN 50km`, Equality on `ecosystem_type`, Transform on `NEE TO GPP VIA partition` |
| **Governing Eq** | NEE = GPP − R_eco (mass balance constraint) |
| **Data Source** | FLUXNET2015 + AmeriFlux |
| **Example COMPLETE** | "What is the expected net ecosystem exchange for a boreal forest station missing its winter measurement?" |

#### Bundle 4: `materials_prop` — Materials Science Properties

| Property | Value |
|----------|-------|
| **Base** $B$ | Composition × Structure × Temperature |
| **Fiber** $F$ | $(\text{bandgap}, \sigma, \kappa, C_p, \text{hardness})$ |
| **Adjacency** | Metric on `composition WITHIN 0.1` (Wasserstein on elemental fractions), Equality on `crystal_system`, Threshold on `temperature ABOVE 300K` |
| **Governing Eq** | Wiedemann–Franz: $\kappa / (\sigma T) = L_0$ (Lorenz number constraint) |
| **Data Source** | Materials Project + AFLOW + ICSD |
| **Example COMPLETE** | "What is the expected thermal conductivity for a perovskite with missing κ at 500K?" |

#### Bundle 5: `epi_spread` — Epidemiological Transmission

| Property | Value |
|----------|-------|
| **Base** $B$ | Pathogen × Region × Time |
| **Fiber** $F$ | $(R_t, \text{CFR}, \text{serial\_interval}, \text{vaccine\_efficacy}, \text{mobility\_index})$ |
| **Adjacency** | Metric on `region WITHIN 500km`, Equality on `pathogen_id`, Transform on `cases TO R_t VIA renewal_eq` |
| **Governing Eq** | Renewal equation: $I(t) = R_t \sum_s w_s I(t-s)$ |
| **Data Source** | WHO FluNet + GISAID + Our World in Data |
| **Example COMPLETE** | "What is the expected R_t for influenza A/H3N2 in a region with missing surveillance data?" |

### 2.4 The Universality Proof Structure

For each bundle $\mathcal{B}_i$, the demo executes:

```gql
COMPLETE ON {bundle_name}
  WHERE {target_vertex} IS NULL
  ASSUME {adjacency_spec}
  MIN_CONFIDENCE 0.6
  WITH PROVENANCE
```

**Theorem (Domain-Agnostic Completion).** Let $\mathcal{B}_1, \ldots, \mathcal{B}_5$ be fiber bundles over distinct base manifolds with distinct fiber types. Let $L^{(i)}$ be the graph Laplacian of $\mathcal{B}_i$ built from the adjacency specification. Then COMPLETE solves:

$$\hat{x}_m^{(i)} = -\bigl(L_{mm}^{(i)}\bigr)^{-1} L_{mo}^{(i)} \, x_o^{(i)} \quad \text{for } i = 1, \ldots, 5$$

with identical algorithm, identical confidence formula, and identical obstruction detection. The *only* domain-specific input is the adjacency specification $\{(u,v,w)\}$ and the observed values $x_o$.

**Corollary (Čech Complex Universality).** The Čech complex $\check{C}^\bullet(\mathcal{U}_i, \mathcal{F}_i)$ for bundle $i$ is determined entirely by the nerve $\mathcal{N}(\mathcal{U}_i)$. The coboundary maps $\delta^0, \delta^1, \ldots$ are the same linear operators as in SH2 (Theorem 2.1), applied to different underlying data. Obstruction detection via $\check{H}^1 \neq 0$ works identically across all five domains.

### 2.5 GQL Interface

```gql
-- Pharma: complete missing bone penetration for tedizolid
COMPLETE ON mirador_pharma
  WHERE drug = 'tedizolid' AND compartment = 'bone' AND R IS NULL
  ASSUME ON target_id = target_id, ON pchembl_value WITHIN 0.5
  MIN_CONFIDENCE 0.6
  WITH PROVENANCE

-- Genomics: complete missing expression under hypoxia
COMPLETE ON genomics_expr
  WHERE gene = 'BRCA1' AND tissue = 'pancreas_ductal' AND condition = 'hypoxia' AND TPM IS NULL
  ASSUME ON gene_id = gene_id, ON expression WITHIN 1.0
  MIN_CONFIDENCE 0.6

-- Climate: complete missing winter NEE
COMPLETE ON climate_flux
  WHERE station = 'CA-Oas' AND season = 'DJF' AND NEE IS NULL
  ASSUME ON ecosystem_type = ecosystem_type, ON lat_lon WITHIN 50
  MIN_CONFIDENCE 0.5

-- Materials: complete missing thermal conductivity
COMPLETE ON materials_prop
  WHERE composition = 'BaTiO3' AND temperature = 500 AND kappa IS NULL
  ASSUME ON crystal_system = crystal_system, ON composition WITHIN 0.1
  MIN_CONFIDENCE 0.5

-- Epidemiology: complete missing R_t
COMPLETE ON epi_spread
  WHERE pathogen = 'A/H3N2' AND region = 'West_Africa' AND week = '2025-W03' AND R_t IS NULL
  ASSUME ON pathogen_id = pathogen_id, ON region WITHIN 500
  MIN_CONFIDENCE 0.5
```

### 2.6 UI Panel: "Universal Completion"

| Element | Description |
|---------|-------------|
| **Bundle Selector** | 5 tabs, one per domain, each with domain-specific color and icon |
| **Query Editor** | Pre-filled COMPLETE query per bundle; user can modify |
| **Results Comparison** | Side-by-side: 5 completed values, 5 confidence scores, 5 provenance chains |
| **Confidence Histogram** | Overlay of confidence distributions across all 5 bundles |
| **Čech Diagnostic** | Per-bundle: dim H⁰ (solutions), dim H¹ (obstructions), Euler characteristic χ(F) |
| **The Punchline** | Single stat: "1 engine. 1 verb. 5 domains. 0 domain-specific code." |

### 2.7 What This Proves

The sheaf completion framework (SH1–SH3) is not a pharmacology tool. It is a *mathematical structure* that operates on any Davis manifold. The Čech complex doesn't know or care whether the value space $W$ contains drug penetration ratios or carbon flux measurements. The obstruction theorem $\check{H}^1 = 0 \iff$ global completion exists holds by *topology*, not by pharmacology. Demonstrating this across five unrelated domains with identical code, identical confidence formula, and identical obstruction detection is the strongest possible evidence that the framework is a genuine mathematical discovery, not a domain-specific heuristic.

---

## 3. Reverse COMPLETE for Drug Discovery

*"The core thesis: given a fully diagnosed disease state in a specific patient, MIRADOR constructs the optimal therapeutic molecule (or combination) by solving for maximum coherence on the patient-specific therapeutic manifold. This is personalized medicine derived from first principles, not statistical correlation."*
— MIRADOR_SPEC v0.2, §0 Preamble

*"The pharmacophore τ is the topological invariant of the therapeutic interaction. It is the minimal geometric arrangement of features that is necessary and sufficient for biological activity."*
— MIRADOR_SPEC v0.2, §6.0 (Layer 4)

*"Each $K_i$ is a sectional curvature of the molecule's trajectory through the corresponding biological compartment. This is not metaphor — the molecule's trajectory through the body is a curve on a Riemannian manifold, and curvature measures how much the trajectory deviates from a geodesic (the 'ideal' path with no loss)."*
— MIRADOR_SPEC v0.2, §7.3 Validation V5.1

### 3.1 The Thesis

> Instead of "what's the R value for tedizolid at bone?", ask "what PROPERTIES would a molecule need to fill the biggest gap in the therapeutic landscape?" The missing vertex isn't a measurement — it's a molecule that doesn't exist yet. The bundle geometry designs the drug.

### 3.2 Mathematical Foundation

**Standard COMPLETE (Forward Problem).** Given a molecule $m$ with known structure, complete the missing measurement $x_v$ (e.g., tissue penetration at a specific site):

$$\hat{x}_v = -\bigl(L_{mm}^{-1} L_{mo} \, x_o\bigr)_v$$

The vertex $v$ exists in the graph; its value is unknown.

**Reverse COMPLETE (Inverse Problem).** Given a *therapeutic gap* — a region of the base manifold $B$ (disease × compartment) where no existing molecule achieves $C \geq \theta$ — find the fiber coordinates $(τ^*, K^*, C^*)$ that a hypothetical molecule would need:

**Definition (Therapeutic Gap).** A therapeutic gap is a connected component $G \subseteq B$ such that:

$$\max_{m \in \pi^{-1}(G)} C(m) < \theta$$

where $\theta$ is the clinical efficacy threshold and $\pi^{-1}(G)$ is the set of all molecules fibered over $G$.

**Definition (Reverse Completion).** The reverse completion at gap $G$ solves:

$$(\tau^*, K^*) = \arg\min_{(\tau, K)} \; \bigl\| L_{mm}^{-1} L_{mo} \, x_o + x_{\text{target}} \bigr\|^2$$

subject to:

$$C^* = \frac{\tau^*}{K^*} \geq \theta, \quad K^* \in \mathcal{K}_{\text{feasible}}, \quad \tau^* \in \mathcal{T}_{\text{synthesizable}}$$

where:
- $x_{\text{target}}$ encodes the desired coherence at the gap ($C \geq \theta$)
- $\mathcal{K}_{\text{feasible}}$ is the set of ADMET curvature profiles achievable by drug-like molecules (Lipinski/Veber constraints define a compact submanifold of curvature space)
- $\mathcal{T}_{\text{synthesizable}}$ is the set of pharmacophore values realizable by synthetic chemistry

### 3.3 Well-Posedness via Serre Duality (SH8)

Serre duality (SH8, Conjecture 8.1) guarantees that the reverse problem inherits the well-posedness properties of the forward problem:

$$\check{H}^k(M, \mathcal{F}) \cong \check{H}^{d-k}(M, \mathcal{F}^\vee \otimes \omega_M)^\vee$$

At $k=0$:

$$\check{H}^0(M, \mathcal{F}) \cong \check{H}^d(M, \mathcal{F}^\vee \otimes \omega_M)^\vee$$

When $\dim \check{H}^0 = 1$ (unique forward completion), then $\dim \check{H}^d(\mathcal{F}^\vee \otimes \omega_M) = 1$ (unique reverse solution). This is the existence and uniqueness guarantee: the duality tells us the forward and reverse problems have **matching dimensions**, so a well-posed forward completion implies a well-posed reverse completion.

The *algorithm* for reverse completion (§3.2) is constrained optimization — standard least-squares with feasibility constraints on $\mathcal{K}_{\text{feasible}}$ and $\mathcal{T}_{\text{synthesizable}}$. Serre duality does not drive the computation; it guarantees the solution exists and is unique before we solve for it.

### 3.4 The Decomposition: τ* and K* as Independent Constraints

The governing equation $C = \tau / K$ decomposes the reverse completion into two independent sub-problems on orthogonal fiber directions:

**Sub-problem A: What τ is needed?**

The pharmacophore $\tau$ decomposes via the Künneth theorem (MIRADOR Spec, Layer 4):

$$\tau = |b_0| \cdot \tau_{\text{chiral}} \cdot |\pi_1(\text{aromatic})|$$

Reverse-completing $\tau^*$ yields:
- **$|b_0^*|$**: number of distinct binding modes required (connected components of the binding interaction)
- **$\tau_{\text{chiral}}^*$**: whether a specific enantiomer is required ($\pm 1$)
- **$|\pi_1^*|$**: aromatic ring topology required (e.g., "needs a fused bicyclic system" = $|\pi_1| \geq 3$)

These are *structural blueprints* for the molecule's binding pharmacophore.

**Sub-problem B: What K is achievable?**

The ADMET curvature $K$ decomposes (MIRADOR Spec, Layer 5):

$$K = K_{\text{abs}} + K_{\text{dist}} + K_{\text{met}} + K_{\text{exc}} + K_{\text{tox}} + K_{\text{collateral}}$$

Reverse-completing $K^*$ yields upper bounds on each barrier component:

$$K^*_{\text{abs}} \leq \alpha_1, \quad K^*_{\text{dist}} \leq \alpha_2, \quad \ldots$$

These translate directly to medicinal chemistry design rules:
- $K^*_{\text{abs}} \leq \alpha_1$ → "oral bioavailability must exceed threshold" → constrains LogP, MW, PSA
- $K^*_{\text{dist}} \leq \alpha_2$ → "protein binding must stay below threshold" → constrains lipophilicity
- $K^*_{\text{tox}} \leq \alpha_5$ → "hepatotoxicity risk must stay below threshold" → constrains reactive functional groups

### 3.5 The Coverage Functional

The reverse completion doesn't just find *one* molecule. It identifies the gap that, if filled, maximally reduces the global obstruction:

**Definition (Gap Severity).** Gaps are split into two categories based on their cohomological status:

**Drug Design Targets** ($\check{H}^1_G = 0$): Gaps where the sheaf geometry can actually complete them. Severity:

$$S_{\text{design}}(G) = \text{disease\_burden}(G) \times \Bigl(\theta - \max_{m \in \pi^{-1}(G)} C(m)\Bigr) \times \text{confidence}(G)$$

**Contradiction Targets** ($\check{H}^1_G > 0$): Gaps touching obstructions where existing data is contradictory. These are valuable as research targets for resolving contradictions, not as drug design targets. Severity:

$$S_{\text{contradiction}}(G) = \text{disease\_burden}(G) \times \dim \check{H}^1_G$$

**The Coverage Optimization.** For drug design, find the vertex $v^*$ and property profile $(τ^*, K^*)$ that maximizes:

$$v^* = \arg\max_{v \in V_{\text{gaps}},\; \check{H}^1 = 0} \; S_{\text{design}}(\text{gap}(v))$$

For contradiction resolution, rank gaps by $S_{\text{contradiction}}$ separately — these identify where a new molecule would reveal which data source is wrong.

### 3.6 Cascade Potential via PROPAGATE

After identifying the target property profile $(\tau^*, K^*)$, PROPAGATE reveals what *else* becomes completable:

```gql
-- Find the highest-severity gap
COMPLETE REVERSE ON mirador_pharma
  WHERE C IS NULL AND disease_burden > 1000
  TARGET C >= 1.0
  SHOW tau_star, K_star, confidence, gap_severity

-- Then propagate: what does this new molecule unlock?
PROPAGATE ON mirador_pharma
  ASSUME drug = 'hypothetical_v*' WITH tau = {tau_star}, K = {K_star}
  SHOW newly_determined
  RANKED BY confidence DESC
```

The cascade from a single reverse completion may unlock dozens of new forward completions — the molecule doesn't just fill one gap, it *reshapes the entire constraint graph* by adding a new vertex and its adjacency edges.

### 3.7 GQL Interface

```gql
-- Reverse COMPLETE: what molecule fills the biggest gap?
COMPLETE REVERSE ON mirador_pharma
  WHERE disease = 'MRSA' AND compartment = 'biofilm'
  TARGET C >= 1.2
  CONSTRAINTS K_abs <= 2.0, K_tox <= 0.5
  SHOW tau_star, K_star, tau_decomposition, K_bounds
  WITH PROVENANCE

-- Multi-gap reverse: design one molecule for many gaps
COMPLETE REVERSE ON mirador_pharma
  WHERE C < 0.5 AND disease_burden > 500
  TARGET C >= 1.0
  MINIMIZE count(gaps_remaining)
  SHOW property_profile, gaps_covered, cascade_potential
```

### 3.8 UI Panel: "Molecule Designer"

| Element | Description |
|---------|-------------|
| **Gap Map** | Heat map of the base manifold $B$ colored by gap severity $S(G)$; bright = severe unmet need |
| **Reverse COMPLETE Button** | "Design Molecule" — executes the reverse completion at the selected gap |
| **Property Profile Card** | $\tau^*$ decomposition (binding modes, chirality, ring topology) + $K^*$ bounds (absorption, distribution, metabolism, excretion, toxicity) |
| **Design Rules Table** | Translation of $(\tau^*, K^*)$ to medicinal chemistry constraints: LogP range, MW range, PSA range, required pharmacophore features, forbidden functional groups |
| **Cascade Visualization** | DAG showing what other gaps become completable if this molecule existed |
| **Duality Indicator** | Shows the Serre duality pairing: forward completion confidence ↔ reverse completion feasibility |

### 3.9 What This Proves

Drug discovery is traditionally a forward search: propose a molecule, test it, iterate. Reverse COMPLETE inverts this: start from the therapeutic need, and let the sheaf geometry compute the molecular properties that would satisfy it. This is possible because the *same* Čech complex that encodes forward completion (SH1–SH3) also encodes, via Serre duality (SH8), the inverse problem. The dual sheaf $\mathcal{F}^\vee \otimes \omega_M$ carries the "reverse" constraint data — what inputs produce desired outputs. The governing equation $C = \tau / K$ makes the decomposition explicit: $\tau$ encodes what the molecule must *do* (bind), and $K$ encodes what the molecule must *survive* (ADMET barriers). Reverse COMPLETE computes both simultaneously from the bundle geometry.

---

## 4. Site Architecture

*"This formulation introduces zero free parameters. The interval IS the uncertainty. The Davis Field Equation framework has no tunable constants ($C = \tau / K$ is exact for measured data), and the completed extension preserves this property."*
— GIGI_SHEAF_COMPLETION_SPEC, §1.7

*"If HERALD is the radar that tracks the target, MIRADOR is the engineer that positions the interceptors."*
— theory/mirador.tex, §1 Introduction

### 4.1 Page Placement

The Sheaf Lab is a new top-level route (`/sheaf-lab` or `#sheaf-lab`) accessible from the main navigation. It sits between "Demo" and "Science" in the nav ordering:

```
Proof | Validation | The Problem | Demo | **Sheaf Lab** | Science | Paper | Roadmap | Researcher | Book | Contact
```

### 4.2 Component: `SheafLab.jsx`

New React component following the MiradorSite.jsx patterns:
- Uses `FadeIn`, `Stat`, `SciCard`, `useFadeIn`, `useIsMobile` from the shared component library
- Dark theme consistent with existing site (#08080f base, #e2e8f0 text)
- Fonts: Instrument Serif (headings), JetBrains Mono (code/math), DM Sans (body)

### 4.3 Section Layout

```
┌─────────────────────────────────────────────┐
│  SHEAF LAB                                   │
│  "The geometry completes itself."            │
│                                              │
│  Three live demonstrations of sheaf-         │
│  theoretic completion on five domains.       │
│  Zero domain-specific code.                  │
├─────────────────────────────────────────────┤
│  ┌─ Tab 1 ─┐ ┌─ Tab 2 ─┐ ┌─ Tab 3 ─┐      │
│  │ VALIDATE │ │UNIVERSAL│ │ DESIGN  │      │
│  └──────────┘ └─────────┘ └─────────┘      │
├─────────────────────────────────────────────┤
│                                              │
│  [Active Tab Content — see §1.5/§2.6/§3.8]  │
│                                              │
├─────────────────────────────────────────────┤
│  MATHEMATICAL FOUNDATIONS                    │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ SH1–SH3  │ │ SH4–SH5  │ │ SH6–SH8  │    │
│  │ Presheaf │ │ Sudoku   │ │ Euler &  │    │
│  │ Čech     │ │ Holonomy │ │ Serre    │    │
│  │ Obstruct │ │ Budget   │ │ Duality  │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                              │
│  Each card: theorem statement, equation,     │
│  "in GIGI" gloss (clinical language)        │
├─────────────────────────────────────────────┤
│  LIVE METRICS                                │
│                                              │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐       │
│  │  5   │ │  1   │ │  0   │ │ 11M+ │       │
│  │domains│ │ verb │ │params│ │records│       │
│  └──────┘ └──────┘ └──────┘ └──────┘       │
│                                              │
└─────────────────────────────────────────────┘
```

### 4.4 Color Coding

| Feature | Accent Color | Hex |
|---------|-------------|-----|
| Auto-Validation (PROPAGATE) | Emerald | `#10b981` |
| Universal Completion | Blue | `#3b82f6` |
| Molecule Designer | Gold/Amber | `#f59e0b` |
| Obstruction / H¹ | Red | `#ef4444` |
| Confidence | Green gradient | `#22c55e` → `#10b981` |
| Math Foundations | Purple | `#a855f7` |

### 4.5 Routing Integration

In `App.jsx`, add route for SheafLab:

```jsx
import SheafLab from './SheafLab';

// In Router:
<Route path="/sheaf-lab" element={<SheafLab />} />
```

Or as a hash section within MiradorSite.jsx, following the existing pattern:

```jsx
<section id="sheaf-lab" style={{ padding: mob ? "40px 16px" : "80px 24px", maxWidth: 960, margin: "0 auto" }}>
  {/* Sheaf Lab content */}
</section>
```

---

## 5. Mathematical Rigor Checklist

*"A completion of 'this drug fails here' can be high-confidence; the old formula would incorrectly report confidence = 0 regardless of evidence strength. The corrected formula has these properties: $\sigma_v \to 0$ (perfectly constrained by neighbors): confidence → 1; $\sigma_v = s$ (uncertainty equals population variance): confidence = 0.5; $\sigma_v \gg s$ (poorly constrained): confidence → 0."*
— GIGI_SHEAF_COMPLETION_SPEC, §1.4

Every equation displayed on the Sheaf Lab page must satisfy:

| # | Requirement | Grounding |
|---|-------------|-----------|
| 1 | Completion equation $\hat{x}_m = -L_{mm}^{-1} L_{mo} x_o$ derived from Schur complement of graph Laplacian | Standard spectral graph theory; implemented in GIGI `laplacian::solve()` |
| 2 | Confidence formula $\text{conf}(v) = 1/(1 + \sigma_v^2/s^2) = 1/(1 + (L_{mm}^{-1})_{vv})$ with $s^2$ normalization for cross-domain comparability | GIGI_SHEAF_COMPLETION_SPEC §3.2, §1.4 correction |
| 3 | Cascade decay $\alpha^{d_G}$ with $\alpha = e^{-c/L}$ motivated by cocycle norm bound ($\alpha \approx 0.85$ for pharmacological nerves, graph-dependent) | SH5(d), eq. 44 of Branch VII; BCH convergence radius |
| 4 | Obstruction $\check{H}^1 \neq 0$ detected via robust MAD estimator on coboundary residuals | SH3, Theorem 3.1; Maronna et al. (2006) for MAD robustness |
| 5 | Euler characteristic $\chi(\mathcal{F}) = \sum (-1)^p \dim \check{H}^p$ computable from nerve | SH7, Theorem 7.1; McKean-Singer for temperature independence |
| 6 | Serre duality $\check{H}^k \cong (\check{H}^{d-k})^\vee$ provides existence/uniqueness guarantee for reverse COMPLETE (algorithm is constrained optimization) | SH8, Conjecture 8.1; classical when $M$ is compact complex |
| 7 | Künneth decomposition $\tau = |b_0| \cdot \tau_{\text{chiral}} \cdot |\pi_1|$ additive in log-space | MIRADOR_SPEC Layer 4, Test V4.2 |
| 8 | ADMET curvature decomposition $K = \sum K_i$ with each $K_i$ non-negative | MIRADOR_SPEC Layer 5; each barrier is a non-negative energy |
| 9 | Clinical impact × confidence ranking is a well-defined total order on $V_{\text{miss}}$ | Product of reals; ties broken by vertex ID |
| 10 | Domain-agnosticism proven by identical algorithm on structurally distinct nerves | SH1–SH2: presheaf + Čech construction parametric in $(\mathcal{U}, W)$ |

---

## 6. Data Requirements

*"COMPLETE on vancomycin bone penetration uses 700 neighbors, not the 4.9M ChEMBL activity records that contain real binding affinity data for vancomycin against hundreds of targets."*
— GIGI_SHEAF_COMPLETION_SPEC, §0 Motivation

*"Each bundle ships with exactly one seed adjacency — the obvious equality on its primary grouping field. Additional adjacencies are discovered from the data using SUGGEST_ADJACENCY, not prescribed."*
— GIGI_SHEAF_COMPLETION_SPEC, §6 Seed Adjacency Configurations

### 6.1 Bundle Data Sources

| Bundle | Source | Estimated Records | Ingestion |
|--------|--------|-------------------|-----------|
| `mirador_pharma` | ChEMBL 34 + BindingDB + PharmGKB | ~11M | Already in GIGI |
| `genomics_expr` | GTEx v8 (public, dbGaP) | ~2M tissue-gene pairs | TSV ingest via GIGI LOAD |
| `climate_flux` | FLUXNET2015 (CC-BY-4.0) | ~200K station-months | CSV ingest |
| `materials_prop` | Materials Project (CC-BY-4.0 API) | ~150K compounds | JSON ingest |
| `epi_spread` | WHO FluNet + OWID (public) | ~500K pathogen-region-weeks | CSV ingest |

### 6.2 Seed Data for Demo Mode

For the demo page (when not connected to live GIGI), each bundle carries 20–50 seed records with known ground truth. The demo runs COMPLETE locally (same Schur-complement logic as the full engine, sparse matrix path) and displays results with a `DEMO` badge.

---

## 7. Testing

*"Sheaf completion fills gaps; it does not overwrite measurements."*
— GIGI_SHEAF_COMPLETION_SPEC, §9.1 INV-4

*"The completed section minimizes sheaf energy — it is the most consistent extension of the data. Adding more neighbors can only increase confidence. Cascades cannot teleport across the graph. Completing data resolves all resolvable contradictions."*
— GIGI_SHEAF_COMPLETION_SPEC, §9.1 Correctness Invariants (INV-1 through INV-5)

### 7.1 Forward Completion Tests (per bundle)

For each of the 5 bundles, withhold 10% of known values and verify:

| Test | Criterion | SH Reference |
|------|-----------|--------------|
| T1: Accuracy | $|\hat{x}_v - x_v^{\text{true}}| < 2\sigma_v$ for $\geq 95\%$ of vertices | SH1 (section space well-defined) |
| T2: Confidence calibration | Fraction of vertices where $|x - \hat{x}| < \sigma$ matches confidence level | SH3 (obstruction ↔ confidence) |
| T3: Obstruction detection | $\check{H}^1 = 0$ for clean data; $\check{H}^1 \neq 0$ when contradictions injected | SH3, SH4 |
| T4: Euler characteristic | $\chi(\mathcal{F})$ invariant under cover refinement | SH7(a) |
| T5: Domain-invariance | Identical code path for all 5 bundles (no branch on bundle name) | SH1–SH2 |

### 7.2 Reverse Completion Tests

| Test | Criterion | SH Reference |
|------|-----------|--------------|
| R1: Round-trip | Forward COMPLETE of a molecule with $(\tau^*, K^*)$ recovers the target $C \geq \theta$ | SH8 (Serre duality) |
| R2: Feasibility | $K^* \in \mathcal{K}_{\text{feasible}}$ (all curvature bounds within Lipinski space) | MIRADOR_SPEC Layer 5 |
| R3: Künneth consistency | $\tau^* = |b_0^*| \cdot \tau_{\text{chiral}}^* \cdot |\pi_1^*|$ (decomposition is multiplicative) | MIRADOR_SPEC Layer 4, V4.2 |
| R4: Cascade unlocking | PROPAGATE after reverse insertion unlocks $\geq 1$ new forward completion | SH5 (cascade) |

### 7.3 PROPAGATE / Auto-Validation Tests

| Test | Criterion | SH Reference |
|------|-----------|--------------|
| P1: Monotone confidence | Cascade confidence $\leq$ source confidence | SH5(d) (holonomy budget) |
| P2: Decay correctness | $\text{conf}(u) = \text{conf}(v) \times 0.85^{d_G}$ within floating-point tolerance | SH5(c) |
| P3: Obstruction exclusion | No vertex in `CONFLICTED` set appears in ranked output | SH3 |
| P4: Ranking stability | Adding a low-weight edge does not change top-5 ranking | Schur complement continuity |

---

## 8. Implementation Phases

*"The Schur complement operates on the local neighborhood (typically $k = 50$–$500$ records), not the entire bundle (4.9M). The neighborhood size is bounded by max_neighbors, making COMPLETE $O(1)$ with respect to bundle size after the $O(\log n)$ index lookup."*
— GIGI_SHEAF_COMPLETION_SPEC, §7.1 Complexity Analysis

*"The engine doesn't pretend to know what it can't determine — it tells you exactly what to measure next."*
— GIGI_SHEAF_COMPLETION_SPEC, §9.2

### Phase 1: Page Shell + Demo Mode (no live bundles)
- Create `SheafLab.jsx` with three-tab layout
- Embed seed data for all 5 bundles (20–50 records each)
- Client-side Schur-complement solver (sparse, reuse gql-engine.js patterns)
- Display COMPLETE results with `DEMO` badge
- Math foundations cards (SH1–SH8 summaries)
- Wire into site nav + routing

### Phase 2: Live GIGI Integration
- Ingest genomics_expr, climate_flux, materials_prop, epi_spread bundles
- Wire tab queries to live GIGI `/v1/gql` endpoint
- PROPAGATE cascade visualization (D3 or Three.js DAG)
- Confidence histogram overlay

### Phase 3: Reverse COMPLETE Engine
- Implement `COMPLETE REVERSE` verb in GIGI Rust engine
- Dual sheaf solver: given target output, solve for input coordinates
- Gap severity computation and ranking
- Cascade potential estimation
- Molecule Designer UI panel

---

## 9. References

*"Lipinski's Rule of Five is the statement $K_{\text{abs}} < K_{\text{crit}}$ for a specific choice of metric. MIRADOR derives Lipinski as a special case and then generalizes: the curvature framework applies to any route of administration, any metabolic phenotype, any patient."*
— MIRADOR_SPEC v0.2, §7.3 Validation V5.2

*"CYP450 enzymes are holonomy operators: they parallel-transport the molecule around the metabolic loop, and the molecule comes back transformed. The holonomy group of the metabolic connection encodes the full set of metabolites."*
— MIRADOR_SPEC v0.2, §7.3 Validation V5.3

1. **Branch VII** — B. R. Davis, "The Cohomology of Completion," 2026. SH1–SH8, Čech cohomology, obstruction theory.
2. **GIGI_SHEAF_COMPLETION_SPEC** — COMPLETE, PROPAGATE, CONSISTENCY, SUGGEST_ADJACENCY verb specifications.
3. **MIRADOR_SPEC v0.2** — 10-layer architecture, $C = \tau/K$, Layer 4 (pharmacophore), Layer 5 (ADMET curvature).
4. **Serre, J.-P.** — "Faisceaux algébriques cohérents," Annals of Mathematics, 1955. Serre duality theorem.
5. **Leray, J.** — "L'anneau d'homologie d'une représentation," CRAS, 1945. Nerve theorem.
6. **Maronna, R. A., Martin, R. D., Yohai, V. J.** — *Robust Statistics: Theory and Methods*, 2006. MAD estimator robustness.
7. **McGuire, G., Tugemann, B., Civario, G.** — "There is no 16-clue Sudoku," 2012. Minimum clue density.
