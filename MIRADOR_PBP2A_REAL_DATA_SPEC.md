# MIRADOR × PBP2a: Real Data Pipeline Specification

## Test-Driven Development with Mathematical Validation

**Davis Lab / Davis Geometric**
**Author: Bee Rosa Davis**
**Date: March 2026**
**Branch: XI (Therapeutic Geometry)**
**Governing Equation: C = τ/K**
**Target: PBP2a (MRSA), Ceftaroline Optimization, Septic Patient**

## 0. What This Spec Does

This spec defines a pipeline that downloads real crystal structures from the Protein Data Bank, computes real conformational metrics, runs every MIRADOR layer on real structural data, and produces a clinically actionable recommendation for a septic MRSA patient. Every step has a mathematical validation test that must pass before the next step runs. No synthetic data.

## 0.1 Public Data Sources

| Source | What | Access | Used By |
|--------|------|--------|---------|
| PDB 1VQQ | PBP2a apo, closed gate | rcsb.org (free) | Layer 1 |
| PDB 3ZG0 | PBP2a + ceftaroline (both sites) | rcsb.org (free) | Layer 1, 3, 4 |
| PDB 3ZFZ | PBP2a + ceftaroline (soaking) | rcsb.org (free) | Layer 3 |
| PDB 4BL2 | E150K mutant | rcsb.org (free) | Layer 7 |
| PDB 4BL3 | N146K mutant | rcsb.org (free) | Layer 7 |
| PDB 4CPK | N146K/E150K double mutant | rcsb.org (free) | Layer 7 |
| PDB 5M18 | PBP2a + cefepime | rcsb.org (free) | Layer 3 |
| PDB 4DKI | PBP2a + ceftobiprole | rcsb.org (free) | Layer 3 |
| NCBI Pathogen Detection | MRSA WGS (tens of thousands) | ncbi.nlm.nih.gov (free) | Layer 7, HERALD bridge |
| Published kinetics | Kd, MIC, Cmax values | JACS 2014, AAC 2023, PNAS 2013 | Layers 4, 5, 6, 9 |

## 0.2 Critical Literature (2024–2026)

The following papers contain findings that MIRADOR must account for. Ignoring any of them would be a scientific gap.

**[LIT-1] "Beyond mecA" (Schaffer/Rosato, AAC, Feb 2026)**
High-level ceftaroline resistance arises via a COLLATERAL pathway triggered by carbapenems (meropenem), NOT by ceftaroline exposure itself. Two-tiered mechanism: (1) meropenem selects rpoB mutations that reprogram gene expression, (2) these co-occur with pbp1 H499R and mecA variants Y446H/E447K. Stabilized by Spx/TrfA oxidative stress response and c-di-AMP signaling.
MIRADOR implication: Layer 7 must model non-PBP2a escape routes.

**[LIT-2] Jiao et al. (J Comput Aided Mol Des, Feb 2025)**
Computational MD simulations confirm N146K/E150K mutations disrupt salt bridge network and electrostatic environment, reducing ceftaroline binding affinity and diminishing allosteric signal propagation.
MIRADOR implication: Independent computational validation of escape geodesic predictions λ₁ (E150K) and λ₂ (N146K).

**[LIT-3] Ceftaroline + carbapenem synergy (Open Forum Infect Dis, Dec 2025)**
Ceftaroline + ertapenem/meropenem restores activity against ceftaroline-resistant MRSA (MIC 16 mg/L) in vitro and in murine bacteremia model. Checkerboard assays show synergy (FICI ≤ 0.50).
MIRADOR implication: Layer 8 (tensor product bundle) validation target.

**[LIT-4] ME/PI/TZ triple β-lactam (Nature Communications)**
Meropenem/piperacillin/tazobactam is synergistic and bactericidal against 72 clinical MRSA isolates. Meropenem Kd at PBP2a allosteric site = 270 ± 80 μM. Suppresses resistance evolution through reciprocal collateral sensitivity.
MIRADOR implication: Collateral sensitivity = curvature coupling in the tensor product bundle. Strongest Layer 8 validation target.

**[LIT-5] PBP2a chaperone vulnerability (Comm Bio, 2019)**
PBP2a requires PrsA and HtrA1 for extracellular folding. Insolubility midpoint 45-46°C. Targeting chaperones = non-allosteric attack vector on the folding manifold.
MIRADOR implication: Alternative attack surface for Layer 2 candidate generation.

**[LIT-6] MIT AI antibiotics (Cell, Aug 2025)**
Generative AI designed 36M+ compounds, DN1 effective against MRSA in mouse model. Works via membrane disruption, not PBP2a. Statistical generation (brute force) vs MIRADOR's geometric optimization.
MIRADOR implication: Different approach, validates the urgent need. MIRADOR's differentiator is resistance prediction, which statistical methods cannot do.

**[LIT-7] Pre-existing resistance (Kelley et al., AAC 2015)**
Ceftaroline-resistant strains with N146K/E239K existed in Switzerland as early as 1998, before ceftaroline was launched. Resistance was not selected by ceftaroline.
MIRADOR implication: HERALD surveillance must screen for allosteric mutations proactively.

**[LIT-8] Dual-site drug design (multiple 2023–2026)**
Quinazolinone + piperacillin synergy demonstrated. Indole derivatives with MIC as low as 0.0625 μg/mL against MRSA. Active research on molecules binding BOTH allosteric and active sites simultaneously.
MIRADOR implication: Layer 4 pharmacophore should consider dual-site topology.

## 1. Layer 0: Patient Manifold (P, g_P)

### 1.0 Data Source
Clinical patient record (structured input).

### 1.1 Construction

The patient manifold P is a finite-dimensional Riemannian manifold whose coordinates encode all pharmacologically relevant patient state:

```
P = (genomic, phenomic, temporal)

genomic:  CYP2D6 diplotype, CYP3A4 activity, CYP2C19
phenomic: age, weight, eGFR, ALT, albumin, serum creatinine
temporal: current medications, prior antibiotic exposure (KEY — see LIT-1)
```

For the demo patient:
```
age=68, weight=82kg, eGFR=45 mL/min (AKI from sepsis)
ALT=85 U/L (2.1× ULN), albumin=2.5 g/dL, creatinine=1.8 mg/dL
CYP2D6=*1/*2 (Normal), CYP3A4=0.7 (reduced, sepsis)
Current: vancomycin (trough 18 μg/mL — near toxic)
Prior ABX: meropenem 14 days ago for Gram-negative UTI
```

### 1.2 Mathematical Validation

**Test 0.1 — Metric is positive-definite**
g_P must have all positive eigenvalues. Each coordinate axis has a natural scale (eGFR in mL/min, ALT in U/L, etc.), and the metric normalizes them to comparable ranges.
```python
eigenvalues = np.linalg.eigvalsh(g_P)
assert all(eigenvalues > 0), "g_P must be positive-definite"
```

**Test 0.2 — Prior carbapenem exposure flag (LIT-1)**
If patient received meropenem within 90 days, set COLLATERAL_RISK = True. This is a binary flag derived from LIT-1 finding that carbapenems prime ceftaroline resistance.
```python
days_since_meropenem = 14  # from patient record
assert COLLATERAL_RISK == (days_since_meropenem < 90)
```

**Test 0.3 — Vancomycin toxicity flag**
Trough > 15 μg/mL → nephrotoxicity risk. This modifies K_tox in Layer 5.
```python
assert patient.vanco_trough > 15  # triggers K_tox elevation
```

## 2. Layer 1: Target Manifold (T, h) — PBP2a

### 2.0 Data Source
PDB files: 1VQQ (apo closed), 3ZG0 (ceftaroline-bound open).

### 2.1 Construction

Download PDB coordinates. Extract Cα positions for the transpeptidase domain (residues 327-668) and allosteric domain (residues 27-326). Build the conformational manifold as the space of Cα distance matrices.

```python
# pseudocode
pdb_closed = fetch_pdb("1VQQ")
pdb_open = fetch_pdb("3ZG0")

# Extract binding site residues
active_site = residues[S403, S461, K406, T600, ...] # transpeptidase
allosteric_site = residues[N146, E150, K148, ...] # allosteric domain
gate_residues = residues[440:460] # β3-β4 loop (the locked door)
```

### 2.2 Mathematical Validation

**Test 1.1 — Gate RMSD between open/closed > 3 Å**
The allosteric gate (β3-β4 loop, residues 440-460) must show large conformational change between 1VQQ (closed) and 3ZG0 (open). Published value: ~4-5 Å RMSD at the gate.
```python
gate_rmsd = compute_rmsd(
    pdb_closed.select(residues=range(440,461)),
    pdb_open.select(residues=range(440,461))
)
assert gate_rmsd > 3.0, f"Gate RMSD {gate_rmsd} too small — structures may be misaligned"
```
Grounding: PNAS 2013 (Mobashery) — "multiresidue conformational change culminates in the opening of the active site"

**Test 1.2 — Active site RMSD < 1.5 Å (distal from gate)**
The active site residues should NOT change much between open and closed. The conformational change is allosteric — it propagates 60 Å from the allosteric site to the active site via the gate.
```python
active_rmsd = compute_rmsd(
    pdb_closed.select(residues=[403,461,406,600]),
    pdb_open.select(residues=[403,461,406,600])
)
assert active_rmsd < 1.5, "Active site should be relatively stable"
```

**Test 1.3 — Allosteric distance ≈ 60 Å**
The distance from the allosteric site to the active site must be approximately 60 Å (published value from multiple papers).
```python
allosteric_center = center_of_mass(pdb_closed.select(residues=[146,148,150]))
active_center = center_of_mass(pdb_closed.select(residues=[403,461]))
distance = np.linalg.norm(allosteric_center - active_center)
assert 55.0 < distance < 65.0, f"Allosteric distance {distance} should be ~60 Å"
```
Grounding: JACS 2014 — "60 Å distant from the active site"

**Test 1.4 — Spectral gap of conformational Laplacian > 0 (Branch IX)**
Build distance matrix on binding site residues, construct graph Laplacian, verify spectral gap exists (connected manifold with separated basins).
```python
D = pairwise_distances(binding_site_coords)
W = np.exp(-D**2 / (2 * sigma**2))
L = np.diag(W.sum(1)) - W
eigvals = sorted(np.linalg.eigvalsh(L))
spectral_gap = eigvals[1] - eigvals[0]
assert spectral_gap > 0.01, "Conformational basins must be spectrally separated"
```
Grounding: Branch IX — spectral gap of Δ on Davis manifold

**Test 1.5 — Boltzmann gate closure ≥ 99.9% (Branch VI)**
From published ΔG ≈ 5 kcal/mol for gate opening:
```python
dG_gate = 5.0  # kcal/mol (from MD simulations, published)
kBT = 0.616    # at 310K
P_open = np.exp(-dG_gate / kBT) / (1 + np.exp(-dG_gate / kBT))
P_closed = 1 - P_open
assert P_closed > 0.999, f"Gate should be >99.9% closed, got {P_closed}"
```
Grounding: Branch VI, Conjecture S1 — Boltzmann partition function

**Test 1.6 — HERALD druggability: persistence < 0.01 for open-gate pocket**
The β-lactam binding pocket at the active site has near-zero persistence because the gate is almost always closed. This is WHY β-lactams fail.
```python
persistence_open = P_open  # probability of finding the pocket accessible
assert persistence_open < 0.01, "Open-gate pocket is undruggable by conventional β-lactams"
```
Grounding: HERALD — pers(B) = Σ πᵢ · 1[B exists in cᵢ], druggable iff pers > 0.80

## 3. Layer 2: Candidate Manifold (M, g_M) — Ceftaroline and Comparators

### 3.0 Data Source
PDB 3ZG0 (ceftaroline coordinates), PubChem (molecular descriptors), FDA label.

### 3.1 Construction

Extract ceftaroline 3D coordinates from PDB 3ZG0. Also load comparator drugs: oxacillin (fails), vancomycin (current therapy), ceftobiprole (alternative 5th-gen cephalosporin from 4DKI).

Molecular descriptors from published data:
```
Ceftaroline:  MW=684.7, logP=-1.0, HBD=4, HBA=10, TPSA=225.8, rings=3
Oxacillin:    MW=401.4, logP=2.4,  HBD=1, HBA=5,  TPSA=112.7, rings=2
Vancomycin:   MW=1449.3, logP=-3.1, HBD=19, HBA=28, TPSA=530.5, rings=4
Ceftobiprole: MW=534.6, logP=-0.2, HBD=4, HBA=8,  TPSA=180.1, rings=3
```

### 3.2 Mathematical Validation

**Test 2.1 — Ceftaroline coordinates present in 3ZG0 at BOTH sites**
3ZG0 has two ceftaroline molecules: CFT1 (active site, covalent) and CFT2 (allosteric site, non-covalent). Both must be extracted.
```python
cft_molecules = pdb_3zg0.select(ligand="CFT")
assert len(cft_molecules) == 2, "3ZG0 must have two ceftaroline molecules"
# CFT1 = covalent at active site (acyl-enzyme)
# CFT2 = non-covalent at allosteric site (the trigger)
```

**Test 2.2 — CFT2 distance from active site ≈ 60 Å**
The allosteric ceftaroline (CFT2) must be far from the active site.
```python
cft2_center = center_of_mass(cft_molecules[1])
active_ser = pdb_3zg0.select(residue=403, atom="OG")
dist = np.linalg.norm(cft2_center - active_ser)
assert 55 < dist < 65, "CFT2 should be ~60 Å from Ser403"
```

## 4. Layer 3: Fiber Bundle π: E → T

### 4.0 Data Source
PDB files: 1VQQ, 3ZG0, 3ZFZ, 5M18, 4DKI (multiple ligand-bound conformations).

### 4.1 Construction

The fiber bundle has:
- Base space T: PBP2a conformational manifold (from Layer 1)
- Fiber Mₜ: space of molecules that can bind to PBP2a in conformation t
- Connection ∇: how binding affinity varies as PBP2a flexes

Build the connection by comparing ligand-bound structures:
- 3ZG0: ceftaroline bound → gate OPEN
- 5M18: cefepime bound → gate partially open
- 4DKI: ceftobiprole bound → gate open (different mode)
- 1VQQ: apo → gate CLOSED

### 4.2 Mathematical Validation

**Test 3.1 — Curvature F_∇ nonzero at allosteric site**
If F_∇ = 0, the bundle is flat and there's no allosteric effect. PBP2a is famously allosteric, so curvature must be nonzero.
```python
# Compare B-factors between apo and ligand-bound at allosteric residues
bfactors_apo = pdb_1vqq.bfactors(residues=[146,148,150])
bfactors_bound = pdb_3zg0.bfactors(residues=[146,148,150])
delta_bfactor = np.mean(np.abs(bfactors_bound - bfactors_apo))
assert delta_bfactor > 5.0, "Allosteric site must show conformational change upon binding"
```

**Test 3.2 — c₁(E) = 0 (first Chern class) → monotherapy possible**
If c₁(E) ≠ 0, there's a topological obstruction requiring combination therapy (Branch VII, Theorem 4.3). For ceftaroline against wild-type PBP2a, monotherapy works clinically, so c₁ should be 0.
```python
# c₁ computed from holonomy around minimal loops in the base
# For ceftaroline: MIC 0.5-1 μg/mL against WT MRSA = monotherapy effective
c1 = compute_first_chern(bundle, base_loops)
assert c1 == 0, "c₁(E)=0 → ceftaroline monotherapy should work against WT"
```
Grounding: Branch VII, Theorem 4.3 — Chern class obstruction proves some targets require combination

## 5. Layer 4: Pharmacophore τ

### 5.0 Data Source
PDB 3ZG0 (ceftaroline-PBP2a contacts), published SAR data.

### 5.1 Construction

Extract pharmacophore features from the ceftaroline-PBP2a interaction in 3ZG0. Compute contact residues within 4.0 Å of ceftaroline atoms. Classify each contact by interaction type.

```
CFT2 (allosteric site) contacts — THE KEY INTERACTIONS:
  C3 pyrrolidine  → threads through gate → hydrophobic contact with gate interior
  Thiadiazole     → π-stacking with gate residues
  Oxime           → H-bond with allosteric pocket wall

CFT1 (active site) contacts — standard β-lactam mechanism:
  β-lactam ring   → acylates Ser403 (covalent)
  Carboxylate     → salt bridge with Lys406
```

τ decomposes via Künneth:
```
τ_bind  = count of essential pharmacophore features making ≤4Å contacts
τ_chiral = 1 (R configuration at C6)
τ_ring  = count of ring systems (β-lactam, pyrrolidine, thiadiazole)
τ = τ_bind × |τ_chiral| × τ_ring
```

### 5.2 Mathematical Validation

**Test 4.1 — Ceftaroline τ > oxacillin τ (explains MRSA activity)**
Ceftaroline's critical advantage: the C3 pyrrolidine threads the allosteric gate. Oxacillin lacks this. Therefore τ_ceft > τ_oxa.
```python
tau_ceft = count_contacts(pdb_3zg0, "CFT", cutoff=4.0)  # includes gate contacts
tau_oxa = count_estimated_contacts("oxacillin")  # cannot thread gate
assert tau_ceft > tau_oxa, "Ceftaroline must have more contacts (gate threading)"
```

**Test 4.2 — β₁ of closed gate pocket ≥ 1 (tunnel topology)**
The closed-gate pocket is a narrow tunnel. Its first Betti number β₁ must be ≥ 1 (has a "hole" / channel). A molecule must thread this tunnel.
```python
# Compute persistent homology of pocket point cloud
pocket_coords = extract_pocket(pdb_1vqq, center=gate_center, radius=8.0)
betti = compute_betti_numbers(pocket_coords, max_dim=2)
assert betti[1] >= 1, "Closed gate pocket must be tunnel-shaped (β₁ ≥ 1)"
```

**Test 4.3 — Gate contacts present only for ceftaroline, not oxacillin**
The gate-threading contacts (residues 440-460) should only appear for drugs with the right C3 substituent.
```python
gate_contacts_ceft = count_contacts(pdb_3zg0, "CFT", residues=range(440,461))
assert gate_contacts_ceft > 0, "Ceftaroline must have gate contacts"
# Oxacillin lacks C3 pyrrolidine → cannot thread → zero gate contacts
```

## 6. Layer 5: ADMET Curvature K

### 6.0 Data Source
Published PK data from FDA label, published kinetics (JACS 2014), patient parameters from Layer 0.

### 6.1 Construction

K = K_abs + K_dist + K_met + K_exc + K_tox

For this patient (68yo, septic, eGFR 45, on vancomycin):

```
K_abs = 0.00              (IV administration, bypasses GI entirely)
K_dist = (PPB × alb_ratio)² = (0.20 × 0.625)² = 0.016
   PPB = 20% (published)
   alb_ratio = 2.5/4.0 = 0.625 (low albumin in sepsis)
K_met = 0.05              (minimal CYP metabolism — hydrolysis)
K_exc = (90/eGFR)² × 0.10 = (90/45)² × 0.10 = 0.40
   Renal clearance dominant. eGFR 45 → CL halved → t½ doubled
K_tox = K_tox_base + K_tox_vanco = 0.05 + 0.15 = 0.20
   Additive nephrotoxicity with vancomycin (published interaction)
```

K_total = 0.00 + 0.016 + 0.05 + 0.40 + 0.20 = 0.666

### 6.2 Mathematical Validation

**Test 5.1 — K_abs = 0 for IV drug**
```python
assert K_abs == 0.0, "IV drugs bypass absorption entirely"
```

**Test 5.2 — K_exc dominant when eGFR < 60**
For renally cleared drugs in AKI, excretion curvature must be the largest K component.
```python
assert K_exc > K_dist and K_exc > K_met and K_exc > K_tox
assert K_exc > 0.3, "eGFR 45 must produce significant excretion curvature"
```

**Test 5.3 — Lipinski derivation from curvature bounds (Theorem 6.4)**
For oral drugs (not our patient, but validates the framework): K_abs < 4 iff MW < 500, logP < 5, HBD < 5, HBA < 10. Ceftaroline violates Lipinski (MW 684) but is IV, so K_abs is irrelevant.
```python
K_abs_oral = (684.7/500)**2 + (-1.0/5)**2 + (4/5)**2 + (10/10)**2
assert K_abs_oral > 4.0, "Ceftaroline would fail oral absorption (Lipinski)"
assert K_abs == 0.0, "But it's IV, so K_abs = 0 — framework handles this correctly"
```
Grounding: Theorem 6.4 — Lipinski's Rule of Five as curvature bound

**Test 5.4 — COLLATERAL_RISK flag elevates K_tox (LIT-1)**
Patient received meropenem 14 days ago. Per LIT-1, this primes rpoB mutations that can confer ceftaroline resistance via a non-PBP2a pathway. This should add a risk premium to K_tox.
```python
if COLLATERAL_RISK:
    K_tox_collateral = 0.10  # resistance risk premium
    K_tox += K_tox_collateral
    # Also flag Layer 7 for extended escape geodesic analysis
```

## 7. Layer 6: Coherence Optimization C* = max(τ/K)

### 7.0 Data Source
Computed from Layers 4 (τ) and 5 (K).

### 7.1 Construction

```
C_ceftaroline = τ_ceft / K_total_ceft
C_vancomycin  = τ_vanco / K_total_vanco

# Published validation targets:
#   Ceftaroline MIC 0.5-1 μg/mL against MRSA → effective
#   Vancomycin MIC creeping, trough 18 → failing
# C_ceft >> C_vanco must hold
```

### 7.2 Mathematical Validation

**Test 6.1 — C_ceftaroline > C_vancomycin (clinical ground truth)**
Ceftaroline is clinically superior to vancomycin for this patient (septic, AKI, near-toxic vanco trough).
```python
assert C_ceftaroline > C_vancomycin * 5, "Ceftaroline must dominate vancomycin for this patient"
```

**Test 6.2 — Double Cover: E + T² ≤ 1**
```python
E = min(tau / 20, 0.95)
T = min(K_tox / 2, 0.95)
assert E + T**2 <= 1.0, "Must be inside therapeutic double cover"
```
Grounding: Branch VII, Double Cover Principle S + d² = 1

**Test 6.3 — Sensitivity: ∂C/∂τ > 0 and ∂C/∂K < 0**
Coherence improves with better topology and lower curvature. Basic sanity.
```python
dC_dtau = 1 / K_total
dC_dK = -tau / K_total**2
assert dC_dtau > 0 and dC_dK < 0
```

**Test 6.4 — Davis Free Energy: ceftaroline is ground state (Branch VI)**
In the Boltzmann ensemble of candidate drugs, ceftaroline should have the highest probability.
```python
Z = sum(np.exp(beta * c) for c in [C_vanco, C_ceft, C_ceftobiprole])
P_ceft = np.exp(beta * C_ceft) / Z
assert P_ceft > 0.9, "Ceftaroline must dominate the therapeutic ensemble"
```
Grounding: Branch VI, S2 — Davis Free Energy; E0 — Principle of Least Holonomy

## 8. Layer 7: Resistance Prediction — Escape Geodesics

### 8.0 Data Source
PDB: 4BL2 (E150K), 4BL3 (N146K), 4CPK (double mutant).
Literature: JACS 2014, AAC 2026 (LIT-1).
NCBI Pathogen Detection: MRSA mecA sequences.

### 8.1 Construction

**Part A: PBP2a Allosteric Escape (classical pathway)**

Download mutant crystal structures. Compute structural deviation from WT at the allosteric site. Rank mutations by escape score:

```
escape_score = ΔΔG_bind / (1 + ΔΔG_fold)
```

High ΔΔG_bind = drug can't trigger allostery. Low ΔΔG_fold = mutation is tolerable. The ratio gives the eigenvalue of the curvature operator along that escape direction.

From published data:
```
E150K:  ΔΔG_bind ~ 3.5 (disrupts salt bridge), ΔΔG_fold ~ 1.2 → λ₁ = 1.59
N146K:  ΔΔG_bind ~ 2.8, ΔΔG_fold ~ 0.8 → λ₂ = 1.56
Y446N:  ΔΔG_bind ~ 4.2, ΔΔG_fold ~ 2.1 → λ₃ = 1.35
E239K:  ΔΔG_bind ~ 1.9, ΔΔG_fold ~ 1.5 → λ₄ = 0.76
```

**Part B: "Beyond mecA" Collateral Escape (LIT-1 pathway)**

If COLLATERAL_RISK = True (patient had meropenem), add the non-PBP2a escape manifold:

```
rpoB mutations → gene expression reprogramming → pbp1 H499R → mecA Y446H/E447K
```

This is a SECOND escape manifold that lives on a different base space (transcription regulation, not PBP2a structure). The escape eigenvalue for this pathway:

```
λ_collateral = P(rpoB_mutated | meropenem_exposure) × ΔΔG_bind(Y446H)
```

### 8.2 Mathematical Validation

**Test 7.1 — Top 3 predicted escape mutations match published clinical data**
The escape geodesic must rank E150K, N146K, Y446N in the top 3. All three have independently published crystal structures confirming they confer resistance.
```python
predicted_top3 = sorted(escape_scores, reverse=True)[:3]
clinical_top3 = {"E150K", "N146K", "Y446N"}
overlap = set(predicted_top3) & clinical_top3
assert len(overlap) >= 2, f"Must predict ≥2 of 3 clinical mutations, got {overlap}"
```

**Test 7.2 — Structural validation: RMSD(WT, E150K) at allosteric site > 1.0 Å**
The E150K crystal structure (4BL2) must show measurable deviation from WT (1VQQ) at the allosteric site, confirming structural disruption.
```python
rmsd_allosteric = compute_rmsd(
    pdb_1vqq.select(residues=range(140,160)),
    pdb_4bl2.select(residues=range(140,160))
)
assert rmsd_allosteric > 1.0, "E150K must structurally disrupt allosteric site"
```

**Test 7.3 — Electrostatic disruption at allosteric site (LIT-2)**
N146K and E150K both change neutral/acidic residues to basic (K). The local electrostatic potential must shift from negative to positive, disrupting ceftaroline binding.
```python
# From PDB structures: compute local charge
charge_wt = charge_at_position(pdb_1vqq, [146, 150])  # N=neutral, E=negative
charge_mut = charge_at_position(pdb_4cpk, [146, 150])  # K=positive, K=positive
assert charge_mut > charge_wt, "Mutation must shift electrostatics positive"
```
Grounding: JACS 2014 — "mutations alter the electrostatic potential within the allosteric site"

**Test 7.4 — D357A correctly rejected (too destabilizing)**
Mutations with ΔΔG_fold > 3.0 kcal/mol should be selected against (they kill the bacteria). The escape score should be very low.
```python
assert escape_score("D357A") < 0.2, "Highly destabilizing mutations should rank low"
```

**Test 7.5 — Ambrose-Singer: holonomy rank = number of accessible escape directions**
```python
R_operator = np.diag(eigenvalues_escape)
rank = np.linalg.matrix_rank(R_operator, tol=0.01)
assert rank >= 3, "At least 3 independent escape directions must be accessible"
```
Grounding: Branch VII — Ambrose-Singer theorem; hol(∇) = span{F_∇(X,Y)}

**Test 7.6 — λ₁ dominance < 40% → combination therapy signal**
If no single escape route dominates, the bacteria can escape in multiple directions. This triggers Layer 8 combination therapy.
```python
total = sum(eigenvalues_escape)
lambda1_dominance = eigenvalues_escape[0] / total
if lambda1_dominance < 0.40:
    COMBINATION_NEEDED = True
```

**Test 7.7 — Collateral pathway flag when COLLATERAL_RISK = True (LIT-1)**
```python
if COLLATERAL_RISK:
    assert "rpoB" in escape_manifolds, "Must include non-PBP2a escape when carbapenem exposure exists"
    assert lambda_collateral > 0, "Collateral escape eigenvalue must be nonzero"
```

**Test 7.8 — HERALD bridge: pre-existing resistance screening (LIT-7)**
Before prescribing ceftaroline, run HERALD drift detection on the patient's MRSA isolate mecA sequence to check for pre-existing allosteric mutations.
```python
meca_sequence = get_patient_isolate_meca()
mutations_found = scan_for_allosteric_mutations(meca_sequence, known=[146,150,239,446])
if len(mutations_found) > 0:
    PRE_EXISTING_RESISTANCE = True
    # Abort ceftaroline recommendation, go directly to Layer 8
```

## 9. Layer 8: Combination Therapy — Tensor Product E₁ ⊗ E₂

### 9.0 Data Source
Published synergy data: OFID Dec 2025 (LIT-3), Nature Comms (LIT-4).

### 9.1 Construction

When Layer 7 signals COMBINATION_NEEDED or COLLATERAL_RISK or PRE_EXISTING_RESISTANCE:

Evaluate combination bundles:
```
E₁ = ceftaroline bundle (allosteric trigger + active site acylation)
E₂ = meropenem bundle (PBP1 inhibition + allosteric trigger Kd=270μM)
E₃ = piperacillin bundle (PBP2 inhibition)
E₄ = tazobactam bundle (β-lactamase protection)

Combinations to test:
  E₁ ⊗ E₂     (ceftaroline + meropenem — LIT-3)
  E₂ ⊗ E₃ ⊗ E₄ (ME/PI/TZ — LIT-4)
```

Synergy metric: FICI ≤ 0.50 = synergistic.

### 9.2 Mathematical Validation

**Test 8.1 — Ceftaroline + meropenem synergy (LIT-3 validation target)**
Published FICI ≤ 0.50. The tensor product curvature must be less than the sum of individual curvatures.
```python
F_combined = compute_bundle_curvature(E1_tensor_E2)
F_individual = compute_bundle_curvature(E1) + compute_bundle_curvature(E2)
assert F_combined < F_individual, "Synergy = subadditive curvature"
# Published: FICI ≤ 0.50 for ceftaroline + ertapenem/meropenem
```
Grounding: Layer 8 — synergy = F(E₁⊗E₂) < F(E₁) + F(E₂)

**Test 8.2 — Meropenem allosteric Kd validation (LIT-4)**
Published Kd = 270 ± 80 μM for meropenem at the PBP2a allosteric site.
```python
meropenem_Kd = 270  # μM, from Nature Comms
meropenem_Cmax = 112  # μg/mL = ~292 μM at recommended dose
# Cmax > Kd → meropenem CAN trigger allostery at therapeutic dose
assert meropenem_Cmax_uM > meropenem_Kd * 0.8, "Meropenem must reach allosteric Kd"
```

**Test 8.3 — Collateral sensitivity: resistance to E₂ → increased sensitivity to E₁ (LIT-4)**
The ME/PI/TZ paper shows reciprocal collateral sensitivity. In the tensor product bundle, this means escape along one fiber creates vulnerability along another.
```python
# If MRSA evolves resistance to meropenem (↑ MIC_mero),
# it should become MORE sensitive to piperacillin (↓ MIC_pip)
# Published: this is exactly what happens in ME/PI/TZ
assert collateral_sensitivity_score > 0, "Resistance to one component must increase sensitivity to another"
```
Grounding: LIT-4 — "reciprocal collateral sensitivities suppress the evolution of resistance"

## 10. Layer 9: Dosing — Parallel Transport

### 10.0 Data Source
FDA ceftaroline label, published PK parameters, patient eGFR from Layer 0.

### 10.1 Construction

PK parameters for this patient:
```
Vd = 28 L × 1.11 (sepsis expansion) = 31.1 L
CL = 150 mL/min × (45/90) = 75 mL/min = 4.5 L/hr
ke = CL/Vd = 4.5/31.1 = 0.145 hr⁻¹
t½ = 0.693/ke = 4.8 hr (normal: 2.6 hr — prolonged)

Standard dose: 600mg IV q12h
Adjusted dose: 400mg IV q12h (FDA: CrCl 15-50 mL/min)

Cmax = 400/31.1 = 12.9 μg/mL
Ctrough = 12.9 × exp(-0.145 × 12) = 2.3 μg/mL
MIC = 1.0 μg/mL (published for MRSA)
MTC = 40 μg/mL
```

### 10.2 Mathematical Validation

**Test 9.1 — Ctrough > MIC (efficacy)**
```python
assert Ctrough > MIC, f"Trough {Ctrough} must exceed MIC {MIC}"
```

**Test 9.2 — Cmax < MTC (safety)**
```python
assert Cmax < MTC, f"Peak {Cmax} must be below MTC {MTC}"
```

**Test 9.3 — Dose matches FDA label for CrCl 15-50**
The pipeline must independently derive 400mg q12h, which matches the FDA recommendation.
```python
if patient.egfr < 50:
    assert adjusted_dose == 400, "FDA: 400mg for CrCl 15-50"
```

**Test 9.4 — t½ prolongation flagged**
```python
normal_t_half = 2.6  # hours
assert t_half > normal_t_half * 1.5, "Must flag prolonged half-life in renal impairment"
```

**Test 9.5 — Vancomycin taper recommended**
With Ctrough vancomycin at 18 μg/mL (near toxic) and additive nephrotoxicity:
```python
assert RECOMMEND_VANCO_TAPER == True, "Must recommend vancomycin taper when switching to ceftaroline"
```

## 11. Integration Tests

**Test INT-1 — Full pipeline: patient in → prescription out**
Run Layers 0-9 sequentially. Output must include: drug recommendation, dose, interval, warnings.
```python
result = mirador_pipeline(patient, target="PBP2a_MRSA")
assert result.drug == "ceftaroline"
assert result.dose == "400mg IV q12h"
assert "renal_adjustment" in result.warnings
assert "vanco_taper" in result.warnings
assert len(result.escape_mutations) >= 3
```

**Test INT-2 — Escape prediction validated against crystal structures**
For each predicted escape mutation with λ > 0.5, verify that a crystal structure exists in PDB confirming structural disruption.
```python
for mutation, eigenvalue in escape_predictions:
    if eigenvalue > 0.5:
        pdb_code = KNOWN_MUTANT_STRUCTURES.get(mutation)
        if pdb_code:
            rmsd = compute_rmsd_at_allosteric_site(pdb_wt, fetch_pdb(pdb_code))
            assert rmsd > 0.5, f"{mutation} must show structural change (RMSD {rmsd})"
```

**Test INT-3 — COLLATERAL_RISK modifies output**
When patient has prior meropenem exposure, the pipeline must either:
(a) flag elevated resistance risk and recommend surveillance, or
(b) recommend combination therapy preemptively.
```python
patient_with_meropenem = patient.copy()
patient_with_meropenem.prior_abx = ["meropenem_14d"]
result = mirador_pipeline(patient_with_meropenem, target="PBP2a_MRSA")
assert "collateral_resistance_risk" in result.warnings or result.combination_therapy
```

**Test INT-4 — Pre-existing resistance aborts monotherapy**
If mecA scan finds N146K or E150K, pipeline must skip ceftaroline monotherapy.
```python
patient_with_resistant_mrsa = patient.copy()
patient_with_resistant_mrsa.meca_mutations = ["N146K"]
result = mirador_pipeline(patient_with_resistant_mrsa, target="PBP2a_MRSA")
assert result.drug != "ceftaroline" or result.combination_therapy
```

## 12. Implementation Phases

**Phase 1 (Week 1-2): Data Ingestion**
- PDB fetcher (download + parse mmCIF/PDB format)
- Cα coordinate extraction, RMSD computation, B-factor extraction
- Tests 1.1–1.6 passing

**Phase 2 (Week 3-4): Geometric Pipeline**
- Fiber bundle construction from multi-structure alignment
- Pharmacophore extraction from contact analysis
- τ computation (Künneth decomposition)
- Tests 3.1–4.3 passing

**Phase 3 (Week 5-6): Patient-Specific ADMET**
- K computation from patient parameters + published PK
- Coherence C = τ/K for candidate drugs
- Tests 5.1–6.4 passing

**Phase 4 (Week 7-8): Escape Geodesics**
- Mutant structure alignment (4BL2, 4BL3, 4CPK)
- Escape score computation
- "Beyond mecA" collateral pathway integration
- HERALD bridge for pre-existing resistance
- Tests 7.1–7.8 passing

**Phase 5 (Week 9-10): Combination Therapy + Dosing**
- Tensor product bundle evaluation
- Synergy metric (FICI) from published data
- PK dosing computation
- Tests 8.1–9.5 passing

**Phase 6 (Week 11-12): Integration + Dashboard**
- Full pipeline integration tests
- Real-data 3D dashboard update
- INT-1 through INT-4 passing

## 13. Provisional Patent Claims (extending MIRADOR parent patent)

**Claim 8:** A method for predicting antibiotic resistance mutations from the eigenvalue spectrum of the curvature operator on a drug-target fiber bundle, wherein the eigenvalues rank the accessibility of escape mutations and the eigenvectors identify the structural changes.

**Claim 9:** A method for detecting collateral resistance pathways by computing escape geodesics on a multi-manifold resistance landscape that includes both target protein mutations and transcriptional regulator mutations activated by prior antibiotic exposure.

**Claim 10:** A method for computing combination therapy synergy as subadditive curvature of the tensor product of individual drug fiber bundles, wherein reciprocal collateral sensitivity is predicted from the coupling structure of the product bundle.

## 14. Branch Coverage Summary

| Branch | Results Used | Tests |
|--------|-------------|-------|
| Parent (89 results) | C = τ/K, τ decomposition, K decomposition | 5.1–6.3 |
| Branch VI (44 results) | Partition function, Boltzmann, Free Energy, E0 | 1.5, 6.4 |
| Branch VII (30 results) | Čech cohomology, Sudoku Principle, holonomy, Double Cover | 3.2, 6.2, 7.5 |
| Branch VIII (25 results) | Cauchy interlace, coarse-graining | 1.4 (spectral gap) |
| Branch IX (30 results) | Laplace-Beltrami, spectral gap, heat kernels | 1.4 |
| Branch X | Fisher metric on patient manifold | 0.1 (metric) |
| HERALD | Druggability persistence, drift detection, Cantelli bounds | 1.6, 7.8 |
| TESSERA | Mosaic fiber bundles, polar AMR coordinates | 7.7 (collateral) |

The equation does not change. The manifold changes. The medicine follows.
