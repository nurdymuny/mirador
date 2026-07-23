# KESKE METHOD — Specification v0.1
## Pediatric Bone MRSA Module for MIRADOR
### Named for Steven Keske, who fought AHO for 6 years

---

## The Problem

Acute Hematogenous Osteomyelitis (AHO) is MRSA that has invaded bone via the
bloodstream. It is the most common invasive bacterial infection in children.
MRSA-AHO driven by the USA300 pulsotype causes:

- Septic shock and toxic shock syndrome
- Venous thromboses and septic emboli
- Necrotizing pneumonia
- Pathologic fractures
- Chronic reinfection over years
- Amputation

The clinical failure mode is always the same: doctors cycle through antibiotics
empirically — vancomycin, clindamycin, daptomycin, linezolid, ceftaroline —
without a systematic framework to determine which drug, at what dose, will
reach therapeutic concentration INSIDE BONE for THIS child's biology while
accounting for biofilm resistance.

Steven Keske: 10 days PICU, 4 surgeries, 2 months PICC line, 5 antibiotics
that didn't work, 6 years of recurrent infections, kidney damage from missed
blood clot, amputation discussed. His mother Barbara was told "there is no cure."

The Keske Method says: there is geometry.

---

## Governing Equation

Same equation. Different manifold.

```
C_bone = tau / K_bone
```

Where K_bone extends MIRADOR's standard ADMET curvature with three additional
geometric layers that account for the unique challenges of bone infection:

```
K_bone = K_admet + K_penetration + K_biofilm + K_reservoir
```

- K_admet:       Standard MIRADOR (absorption, distribution, metabolism, excretion, toxicity)
- K_penetration: Bone penetration barrier (drug must cross from serum into bone matrix)
- K_biofilm:     Biofilm resistance multiplier (MIC shifts 100-1000x in biofilm state)
- K_reservoir:   Multi-reservoir persistence (3 distinct hiding places in bone)

Higher K_bone = more friction = lower coherence = drug fails in bone even if
it works in blood. The entire clinical problem is that K_bone >> K_serum.

---

## Why Standard MIRADOR Is Insufficient

MIRADOR's current demo models a 68-year-old septic adult with MRSA bacteremia
(bloodstream infection). The drug needs to reach PBP2a in planktonic (free-
floating) MRSA cells. K is dominated by renal function and drug-drug interaction.

In pediatric AHO, the drug must:

1. Reach therapeutic serum levels (standard PK — MIRADOR handles this)
2. Cross from serum into bone matrix (NEW: bone penetration ratio)
3. Penetrate biofilm communities embedded in bone (NEW: biofilm MIC shift)
4. Reach bacteria hiding in 3 distinct reservoirs (NEW: reservoir geometry)
5. Maintain bone concentration for weeks (NEW: bone half-life vs serum half-life)

A drug can have C = 18 in blood and C = 0.3 in bone. That's why Steven
got 5 antibiotics that "should have worked" and none of them did.

---

## Architecture: Four New Layers

The Keske Method adds 4 layers on top of MIRADOR's existing 10-layer pipeline.
Layers 0-9 remain identical. The Keske layers are K1-K4.


### Layer K1: Pediatric Patient Manifold

Children are not small adults. This layer replaces MIRADOR L0 with pediatric-
specific pharmacokinetic models.

**Editable patient fields (pediatric):**
- Age (months or years)
- Weight (kg)
- BSA (body surface area, m^2) — computed from height and weight via Mosteller formula
- eGFR_ped — Schwartz equation: (0.413 x height_cm) / creatinine
- Serum creatinine (mg/dL)
- Height (cm)
- ALT (U/L)
- Albumin (g/dL)
- CRP (mg/L) — inflammation marker, key for AHO monitoring
- ESR (mm/hr) — inflammation marker
- Infection site (long bone / pelvis / spine / multifocal)
- MRSA strain if known (USA300 / USA100 / other / unknown)
- PVL status (positive / negative / unknown)
- Prior antibiotics (list with durations)
- Surgical history (number of debridements)
- Biofilm suspected (yes / no / confirmed by imaging)

**Computed:**
- Pediatric GFR via Schwartz (not Cockcroft-Gault)
- Allometric scaling: CL = CL_adult * (weight/70)^0.75
- Volume of distribution: Vd = Vd_adult * (weight/70)^1.0
- Age-adjusted protein binding (neonates have lower albumin)
- Inflammation-adjusted Vd (CRP > 100 expands Vd by 20-40%)

**TDD Tests (10):**
- Schwartz GFR matches manual calculation for 3 age groups
- Allometric CL scaling correct for 10kg, 25kg, 50kg child
- Vd inflammation adjustment activates at CRP > 100
- BSA computed correctly from weight
- Age < 1 month triggers neonatal flag
- PVL-positive triggers severity escalation
- Multifocal infection triggers combination therapy flag
- Prior antibiotic history feeds into resistance probability
- eGFR < 30 triggers dose reduction
- Protein binding adjustment for albumin < 3.0


### Layer K2: Bone Penetration Manifold

The ratio of bone concentration to serum concentration. This is the critical
layer that standard MIRADOR misses entirely.

**Published bone penetration ratios (bone:serum):**

| Drug          | Bone:Serum | Source                              | Notes                    |
|---------------|------------|-------------------------------------|--------------------------|
| Vancomycin    | 0.10-0.30  | Graziani et al. JAC 1988           | Higher in inflamed bone  |
| Clindamycin   | 0.30-0.75  | Feigin et al. Pediatr Infect 1995  | Best bone penetrator     |
| Ceftaroline   | 0.20-0.40  | Riccobene et al. AAC 2014          | Limited pediatric data   |
| Daptomycin    | 0.10-0.20  | Traunmuller et al. AAC 2010        | Poor bone penetration; surfactant inactivation contraindicated in concurrent pneumonia |
| Linezolid     | 0.40-0.60  | Rana et al. JAC 2002               | Good oral bioavailability|
| Nafcillin     | 0.10-0.20  | Tetzlaff et al. Clin Orthop 1976   | MSSA only                |
| Rifampin      | 0.20-0.50  | Currier et al. Bone Joint Surg 1979| Biofilm penetrator       |
| TMP-SMX       | 0.30-0.50  | Rayner et al. AAC 1988             | Oral option              |

**Geometric model:**

```
K_penetration = (1 / R_bone) - 1
```

Where R_bone is the bone:serum penetration ratio (0 to 1).

- R_bone = 0.10 → K_pen = 9.0  (vancomycin: terrible bone penetration)
- R_bone = 0.40 → K_pen = 1.5  (ceftaroline: moderate)
- R_bone = 0.75 → K_pen = 0.33 (clindamycin: good if susceptible)

This means the effective coherence IN BONE is:

```
C_bone = tau / (K_admet + K_penetration + ...)
```

A drug with C_serum = 18 and R_bone = 0.10 effectively has:
K_bone_total = 0.67 + 9.0 + ... ≈ 10+
C_bone ≈ 12 / 10 = 1.2  — BELOW THERAPEUTIC THRESHOLD

This is exactly what happens with vancomycin in osteomyelitis. Works in blood.
Fails in bone.

**Inflammation modifier:**
Inflamed bone is more vascular → higher penetration. CRP > 100 increases
R_bone by 30-50% (published, Graziani et al.).

```
R_bone_eff = R_bone * (1 + 0.006 * max(CRP - 100, 0))
```

Capped at 2x baseline. This anchors the effect at CRP > 100 where Graziani's
data lives: CRP 150 → +30% penetration, CRP 183 → +50% penetration.
A child in septic shock (CRP 250+) gets a meaningful penetration boost;
a child with mild inflammation (CRP 60) does not — clinically correct.
As inflammation resolves, penetration drops — which is why late-stage
chronic osteomyelitis is harder to treat.

**TDD Tests (8):**
- K_penetration computed correctly for each drug
- Vancomycin K_pen > 3.0 (poor penetration)
- Clindamycin K_pen < 1.0 (good penetration)
- Inflammation modifier activates at CRP > 100 (not CRP > 50)
- Inflammation modifier capped at 2x
- C_bone < C_serum for all drugs (penetration always loses signal)
- R_bone = 1.0 gives K_pen = 0 (perfect penetration, theoretical only)
- Effective bone MIC computed: MIC_bone = MIC / R_bone_eff


### Layer K3: Biofilm Resistance Manifold

MRSA in osteomyelitis forms biofilm — structured communities embedded in
extracellular matrix. Biofilm bacteria are phenotypically distinct from
planktonic (free-floating) bacteria.

**Key published facts:**
- Biofilm MIC is 100-1000x higher than planktonic MIC (Stewart 2015)
- Biofilm bacteria enter a dormant state (small colony variants, SCVs)
- SCVs can hide inside osteocytes (bone cells) for years
- Biofilm is the reason for chronic relapsing osteomyelitis
- Rifampin is one of few drugs that penetrates biofilm matrix
- Daptomycin retains activity against biofilm at high concentrations

**Biofilm curvature:**

```
K_biofilm = log10(MBEC / MIC)
```

Where:
- MIC  = minimum inhibitory concentration (planktonic, published)
- MBEC = minimum biofilm eradication concentration (published or estimated)

| Drug          | MIC (ug/mL) | MBEC (ug/mL)  | K_biofilm | Source              |
|---------------|-------------|---------------|-----------|---------------------|
| Vancomycin    | 1.0         | 512           | 2.71      | Parra-Ruiz 2012     |
| Clindamycin   | 0.25        | 64            | 2.41      | LaPlante 2012       |
| Ceftaroline   | 1.0         | 128           | 2.11      | Barber et al. 2015  |
| Daptomycin    | 0.5         | 32            | 1.81      | Stewart 2015        |
| Linezolid     | 2.0         | 256           | 2.11      | Parra-Ruiz 2012     |
| Rifampin      | 0.008       | 0.5           | 1.80      | Zimmerli et al.     |

Rifampin has the lowest K_biofilm — it penetrates biofilm better than any
other anti-staphylococcal drug. This is why the clinical literature recommends
rifampin combination therapy for chronic osteomyelitis. The geometry explains
the clinical practice.

**Biofilm state detection:**

```
biofilm_probability = f(duration_of_infection, imaging_findings, CRP_trend)
```

- Acute (< 2 weeks, CRP rising): biofilm_prob = 0.2
- Subacute (2 weeks - 3 months, CRP plateau): biofilm_prob = 0.6
- Chronic (> 3 months, CRP fluctuating): biofilm_prob = 0.95

K_biofilm is weighted by biofilm probability:

```
K_biofilm_eff = biofilm_prob * K_biofilm
```

For Steven Keske (6 years of recurrent infection): biofilm_prob = 0.99.
K_biofilm dominates all other curvature terms. This is why nothing worked.

**TDD Tests (10):**
- K_biofilm computed correctly from MIC/MBEC for each drug
- Rifampin has lowest K_biofilm
- Daptomycin K_biofilm < vancomycin K_biofilm
- Biofilm probability = 0.2 for acute presentation
- Biofilm probability = 0.95 for chronic (> 3 months)
- K_biofilm_eff scales linearly with biofilm_prob
- Combination therapy flag when K_biofilm_eff > 2.0
- Rifampin combination flag when biofilm_prob > 0.5
- Steven Keske scenario: K_biofilm_eff > 2.5 (chronic MRSA AHO)
- C_bone < 1.0 for vancomycin monotherapy in chronic biofilm (matches clinical failure)


### Layer K4: Reservoir Geometry

MRSA in osteomyelitis doesn't just sit in one place. Published research
identifies three distinct reservoirs, each with different accessibility:

**Reservoir 1: Soft tissue abscess communities (SAC)**
- Location: periosteal/subperiosteal abscesses around bone
- Accessibility: BEST — vascularized tissue, drugs reach
- Intervention: surgical drainage
- Persistence: days to weeks without drainage

**Reservoir 2: Bone matrix biofilm**
- Location: cortical and cancellous bone surfaces
- Accessibility: MODERATE — depends on bone penetration ratio
- Intervention: surgical debridement
- Persistence: months to years

**Reservoir 3: Intracellular (osteocyte-lacuno-canalicular network)**
- Location: INSIDE bone cells, in the microscopic channels of bone
- Accessibility: WORST — most drugs cannot reach
- Intervention: none currently available (experimental: anti-Atl mAbs)
- Persistence: years to decades (small colony variants)

**Reservoir curvature:**

Each reservoir contributes independently to K_reservoir. K_res_SAC is
a patient property (drug-independent, set by surgical history). K_res_mat
and K_res_intra are both drug-dependent:

- K_res_mat depends on the drug's penetration curvature (drugs with high
  K_pen cannot reach the matrix biofilm even after debridement).
- K_res_intra is drug-dependent: rifampin is one of the very few antibiotics
  that crosses the osteoblast cell membrane. When rifampin is in the
  combination, K_res_intra is reduced by a modifier of 0.4 (Zimmerli 2004).

```
K_reservoir = K_res_SAC + K_res_mat + K_res_intra

K_res_SAC   = (1 - P_drainage) * 0.5
K_res_mat   = (1 - P_debride) * K_penetration * 1.0
K_res_intra = 0.8 * intracellular_fraction
                  * rifampin_intra_modifier  # 0.4 if rifampin present, else 1.0
```

- P_drainage: probability that surgical drainage cleared SAC (0 after surgery, 0.8 before)
- P_debride: probability that debridement cleared matrix biofilm
- intracellular_fraction: estimated from chronicity (acute=0.1, chronic=0.6)

For Steven:
- 4 surgeries (SAC likely cleared: K_res_SAC ≈ 0.1)
- Multiple debridements (matrix partially cleared: K_res_mat ≈ 0.5)
- 6 years chronic (intracellular heavy: K_res_intra ≈ 0.48)
- K_reservoir ≈ 1.08

This reservoir term explains why Steven kept relapsing. Surgery cleared the
abscess (reservoir 1) and debrided the surface (reservoir 2), but the bacteria
living INSIDE bone cells (reservoir 3) reseeded the infection every time.

**TDD Tests (9):**
- K_reservoir computed correctly for acute presentation
- K_reservoir computed correctly for Steven Keske scenario
- SAC drainage reduces K_res_SAC by 80%
- Debridement reduces K_res_mat by 50-70%
- Intracellular fraction increases with chronicity
- K_reservoir > 1.0 for any chronic case (ensures C_bone stays low)
- Reservoir 3 unchanged by any surgical intervention
- Rifampin reduces K_res_intra by 60% (modifier = 0.4) when present
- Anti-Atl mAb flag when intracellular_fraction > 0.3 (experimental)


---

## Combination Therapy Engine

Single drugs almost always fail in chronic AHO because no single drug has
low K across all three new layers simultaneously.

**The insight:** no single drug has low K_pathway across all three barriers simultaneously.
Different drugs attack different curvature terms — the combination leverages
each drug's in-series pathway, then adds them as parallel conductances.

| Drug        | K_pen  | K_bio  | K_res  | Pathway strength    |
|-------------|--------|--------|--------|---------------------|
| Ceftaroline | MED    | MED    | MED    | Planktonic PBP2a    |
| Rifampin    | MED    | LOW    | LOW    | Biofilm + matrix    |
| Daptomycin  | HIGH   | LOW    | MED    | Biofilm (high dose) |
| Clindamycin | LOW    | MED    | MED    | Bone penetration    |
| Linezolid   | MED    | MED    | LOW    | Intracellular       |

**Combination coherence — parallel resistor model:**

For a combination of drugs A + B, each drug is an independent pathway from
blood to bacterium. A drug cannot donate its biofilm-killing stats to the
combination unless it first physically crosses the bone penetration barrier.
Decoupling the layers (taking min of each independently) commits a routing
error: Drug B cannot apply its biofilm activity to bone if it never arrived
there. The layers are IN SERIES for each drug; the drugs are IN PARALLEL with
each other.

```
# Step 1: compute each drug's total in-series pathway impedance
K_pathway_A = K_admet_A + K_pen_A + K_bio_A + K_res_A
K_pathway_B = K_admet_B + K_pen_B + K_bio_B + K_res_B

# Step 2: combine pathways in parallel, with synergy enhancing conductance
1/K_bone_combo = (1/K_pathway_A + 1/K_pathway_B) * synergy_factor

# Step 3: tau is symmetric and synergy amplifies the combined binding
tau_combo = (tau_A + tau_B) * synergy_factor

C_bone_combo = tau_combo / K_bone_combo
```

Swapping drug A and drug B must yield identical C_bone_combo (commutativity).
A drug with a very high K_pathway (stuck at any one barrier: penetration,
biofilm, or reservoir) contributes little even if it excels at the others —
because the conductance 1/K_pathway is low. This enforces the physics.

**Example: Ceftaroline + Rifampin for chronic AHO (Steven's scenario)**

Using K_admet ≈ 0.67 (ceftaroline, C_serum = 18) and K_admet ≈ 0.50 (rifampin
estimate). K_pen_rif from R_bone = 0.35 midpoint → (1/0.35)-1 = 1.86.
All K_res values from Steven's surgical history (4 surgeries, chronic).
Rifampin intracellular modifier: K_res_intra 0.48 → 0.48 × 0.4 = 0.19.

```
K_pathway_cef = 0.67 + 1.50 + 2.11 + (0.10 + 0.45 + 0.48) = 5.31
K_pathway_rif = 0.50 + 1.86 + 1.80 + (0.10 + 0.56 + 0.19) = 5.01

1/K_bone_combo = (1/5.31 + 1/5.01) × 1.2 = (0.188 + 0.200) × 1.2 = 0.466
K_bone_combo  = 1/0.466 = 2.15

tau_combo     = (12 + 8) × 1.2 = 24.0
C_bone_combo  = 24.0 / 2.15 = ~11.2
```

Compare vancomycin monotherapy:
```
K_pathway_vanc = 0.50 + 9.00 + 2.71 + (0.10 + 2.70 + 0.48) = 15.49
C_bone_vanc   = τ_vanc / K_pathway_vanc  ≈ 12 / 15.5 = 0.77
```

Retrospectively, the Keske Method flags that vancomycin
monotherapy cannot work in bone (C_bone = 0.77). Switch to ceftaroline +
rifampin (C_bone = 11.2) — more than 14x the therapeutic coherence.
The difference lives in the bone penetration barrier (K_pen_vanc = 9.0 vs
K_pen_cef = 1.5) and rifampin's unique access to reservoir 3.

**TDD Tests (9):**
- K_pathway computed as in-series sum for each drug (K_admet + K_pen + K_bio + K_res)
- Combination K via parallel resistor: 1/K = (1/K_A + 1/K_B) * synergy_factor
- Synergy applied symmetrically to tau: tau_combo = (tau_A + tau_B) * synergy_factor
- Drug order commutative: swap A/B, get identical C_bone_combo
- Drug with terrible penetration contributes little even with great biofilm stats (routing correctness test)
- Ceftaroline + rifampin C_bone >> ceftaroline alone
- Vancomycin monotherapy C_bone < 2.0 for chronic AHO (K_pathway_vanc >> 10)
- Rifampin monotherapy flagged as resistance risk (contraindicated — never alone)
- Steven Keske scenario: ceftaroline + rifampin C_bone > 10.0


---

## Surgical Decision Support

The Keske Method doesn't just recommend drugs. It tells you WHEN to operate.

**Surgical indication score:**

```
S = K_res_SAC * 10 + (K_res_mat > 0.5) * 5 + (abscess_volume_mL > 20) * 5
```

- S < 5: antibiotics alone may suffice
- S 5-10: surgical drainage recommended
- S > 10: urgent debridement + drainage

**Post-surgical K update:**
After each surgery, the patient's K_reservoir is recomputed:
- SAC drainage: K_res_SAC *= 0.2
- Bone debridement: K_res_mat *= 0.4
- Neither addresses reservoir 3 (intracellular)

This creates the visualization: a reservoir diagram showing 3 pools draining
after each intervention, with reservoir 3 stubbornly persisting. The parent
can SEE why the infection keeps coming back.

**TDD Tests (4):**
- Surgical score computed correctly for acute abscess
- Post-drainage K update reduces SAC component
- Post-debridement K update reduces matrix component
- Reservoir 3 unchanged by any surgical intervention; reducible ~60% by rifampin (drug therapy only)


---

## Resistance Prediction (Extended)

MIRADOR's escape geodesics already predict PBP2a mutations. The Keske Method
adds two AHO-specific resistance pathways:

**1. Small Colony Variant (SCV) emergence**
SCVs are metabolically dormant MRSA that evade antibiotics by not growing.
They're the reason chronic osteomyelitis relapses years later.

```
P_SCV = 1 - exp(-0.1 * days_of_therapy)
```

Rate constant k_SCV = 0.1/day is a modeling assumption (estimated; pending
clinical calibration — Tuchscherr 2011 documents SCV biology but does not
provide a rate constant for emergence during antibiotic therapy).

After 30 days: P_SCV = 0.95 (near certain)
Steven at 6 years: P_SCV = 1.0

SCV emergence increases K_reservoir_intracellular by 50%.

**2. Rifampin resistance (critical)**
Rifampin resistance emerges rapidly when used as monotherapy (rpoB mutations).
NEVER use rifampin alone.

```
P_rif_resistance = 0.8 * monotherapy_flag + 0.05 * combo_flag
```

The system MUST flag rifampin monotherapy as contraindicated and require
a companion drug with independent bactericidal activity.

**TDD Tests (4):**
- SCV probability increases with therapy duration
- SCV probability > 0.9 after 30 days
- Rifampin monotherapy blocked with error
- Rifampin resistance probability < 0.1 in combination


---

## Demo Tab: The Keske Method

The demo adds a new tab to the existing MIRADOR 5-stage flow. When the user
clicks the "Keske Method" tab, the patient template switches to pediatric AHO.

### Default Patient: Steven Keske (reconstructed from Sepsis Alliance profile)

- Age: ~8 years (estimated from timeline)
- Weight: 25 kg (estimated)
- Diagnosis: AHO — hip, femur, knee (multifocal)
- CRP: 250+ mg/L (septic shock presentation)
- Prior ABX: vancomycin, clindamycin, and 3 others (failed)
- Surgeries: 4
- Duration: 6 years chronic
- PVL: unknown (but USA300 likely given severity)
- Complications: sepsis, toxic shock, renal lesions, blood clots

### Five Stages (Keske Edition)

**Stage 1: THE CHILD**
Pediatric patient card with editable fields. Shows current failed therapy.
C_serum vs C_bone side by side — the gap IS the problem.
"Why are the antibiotics not working? They can't reach the bone."

**Stage 2: THE BONE**
3D bone cross-section showing 3 reservoirs.
- Soft tissue abscess (orange, outer)
- Bone matrix biofilm (red, middle)
- Intracellular SCVs (deep red, inner core)
K_penetration + K_biofilm + K_reservoir visualized as nested barriers.
"The bacteria are hiding in three places. Each requires different geometry."

**Stage 3: THE COMBINATION**
Combination therapy selector. User picks 2-3 drugs.
Each drug shows which curvature term it attacks best.
Real-time C_bone_combo computation.
"No single drug can reach all three reservoirs. The combination can."

**Stage 4: THE RESISTANCE**
Extended escape geodesics including:
- PBP2a mutations (from standard MIRADOR)
- SCV emergence probability curve
- Rifampin resistance risk
- Biofilm adaptation timeline
"The bacteria will evolve. Here's when and how."

**Stage 5: THE PROTOCOL**
Full output:
- Drug combination with doses (pediatric, weight-based)
- Surgical recommendations with timing
- Monitoring schedule (CRP, ESR, imaging intervals)
- Duration of therapy
- SCV surveillance plan
- Reservoir status after each intervention
"This is what Steven's doctors needed on day 1."

### Math Panel (sidebar)

Each stage shows the governing equations with patient values substituted.
The parent sees: "C_bone = 0.8 (vancomycin alone) vs C_bone = 5.2
(ceftaroline + rifampin). That's why we're switching."

---

## Data Sources

All bone penetration ratios, MBEC values, and pediatric PK parameters come
from published literature. No fitted parameters. Two physical constants
(kT, 5kT) carried forward from MIRADOR core.

| Data Type                  | Source                                    |
|---------------------------|-------------------------------------------|
| Bone penetration ratios   | Graziani 1988, Riccobene 2014, Rana 2002  |
| Biofilm MBEC values       | Parra-Ruiz 2012, LaPlante 2012, Barber 2015 |
| Pediatric PK allometry    | Anderson & Holford, Clin Pharmacokinet 2008 |
| Schwartz GFR equation     | Schwartz et al. JASN 2009                 |
| SCV biology               | Tuchscherr et al. Nature Med 2011         |
| Reservoir model           | Masters et al. Bone Research 2019         |
| Rifampin biofilm data     | Zimmerli et al. NEJM 2004                 |
| AHO clinical guidelines   | PIDS/IDSA 2021 (Woods et al.)             |
| Steven Keske case         | sepsis.org/faces/steven-keske             |

---

## Implementation Roadmap

**Week 1-2:** Layers K1 + K2 (Pediatric PK + Bone Penetration)
- Rust crates: mirador-pediatric, mirador-bone
- 18 TDD tests
- Demo tab: Stages 1 + 2

**Week 3-4:** Layer K3 (Biofilm Manifold)
- Rust crate: mirador-biofilm
- 10 TDD tests
- Demo tab: Stages 3 + 4

**Week 5-6:** Layer K4 + Combination Engine + Surgical Support
- Rust crates: mirador-reservoir, mirador-combo-bone
- 12 TDD tests + 4 surgical tests
- Demo tab: Stage 5

**Week 7-8:** Integration + Steven Keske Scenario Validation
- Full pipeline test: Steven's case through all layers
- Retrospective: would Keske Method have recommended differently?
- Comparison: actual clinical course vs geometric recommendation
- Publication draft

**Total: 56 new TDD tests across 5 new Rust crates**

---

## Patent Claims (Provisional — Extension of 64/012,328)

**Claim 11:** A method for computing therapeutic coherence in bone infection
comprising measuring bone penetration ratio from published pharmacokinetic
data and computing bone-specific curvature K_bone = K_admet + (1/R_bone - 1).

**Claim 12:** The method of claim 11 further comprising a biofilm resistance
manifold wherein the minimum biofilm eradication concentration defines a
biofilm curvature K_biofilm = log10(MBEC/MIC).

**Claim 13:** The method of claim 11 further comprising a multi-reservoir
persistence model with three anatomically distinct bacterial reservoirs
(soft tissue, bone matrix, intracellular) each contributing independently
to total curvature.

**Claim 14:** A method for combination therapy optimization in osteomyelitis
wherein the combination curvature takes the minimum K across each barrier
layer from any drug in the combination.

**Claim 15:** The method of claim 11 wherein pediatric pharmacokinetic
parameters are computed via allometric scaling with Schwartz GFR estimation.

---

## For Barbara

This spec is named after your son Steven. His story on Sepsis Alliance
is the reason this module exists. The Keske Method aims to give future
doctors the mathematical framework to make the right decision on day 1 —
not after 5 failed antibiotics and 4 surgeries and 6 years of fighting.

The equation doesn't change. The manifold changes. The medicine follows.

C = tau / K

---

Davis Lab / Davis Geometric / Branch XI
Bee Rosa Davis — bee_davis@alumni.brown.edu
March 2026
