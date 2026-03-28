# MIRADOR Validation Test 9: Intra-abdominal Abscess
## The Walled City — When Geometry Predicts Drug Failure
### Davis Geometric · Validation Protocol · 2026-03-28

---

## 1. Clinical Question

An intra-abdominal abscess is a walled-off collection of
pus surrounded by a fibrous capsule with no blood supply
to the interior. Unlike every previous validation test
where the equation identifies which drug WORKS BEST, this
test validates the inverse: can the Davis Field Equations
predict when NO drug is sufficient?

If C < threshold for ALL drugs in a compartment, the equation
predicts therapeutic failure — the clinical requirement for
SOURCE CONTROL (drainage). This is the "drain the abscess"
prediction, and it's the most powerful kind of validation.

This test validates:
1. **Two-compartment model** — phlegmon (drugs work) vs
   abscess (drugs fail)
2. **Universal drug failure** — ALL C < threshold in mature
   abscess
3. **The Metro inversion from DFO** — metronidazole goes
   from #8 in bone to #1 in abscess

---

## 2. The Firewall: I ∩ G = ∅

### Input set (I) — Pharmacokinetic measurements

| Parameter | Source | Type |
|---|---|---|
| AUC₂₄ for each drug | FDA labels, published PK | Exposure |
| MIC for B. fragilis / E. coli | EUCAST breakpoints | Susceptibility |
| R_peritoneal (phlegmon tissue) | Surgical PK, Wittau 2010 | Penetration |
| R_abscess (mature abscess) | Joiner 1981, Wagner 2006 | Penetration |

### Ground truth set (G) — Clinical outcomes

| Ground truth | Source | Type |
|---|---|---|
| Abscess requires drainage | SIS 2010 guidelines, IDSA 2010 | Consensus |
| Antibiotics alone fail for mature abscess | Brook 2008 (review) | Consensus |
| Antibiotics can cure small phlegmons | SIS 2010 | Consensus |
| Metronidazole first-line for anaerobes | All guidelines | Consensus |
| Metro #1 but not in DFO context | Cross-test comparison | Internal |

### Overlap check

R values from peritoneal fluid and abscess aspiration PK studies.
Outcomes from surgical guidelines and clinical reviews.
Different measurements, different endpoints. I ∩ G = ∅. ✓

---

## 3. The Two-Compartment Model

### Phlegmon (Early / No Capsule)

An early intra-abdominal infection without a mature capsule.
Tissue is inflamed, edematous, but retains blood supply.
R_peritoneal reflects normal tissue:serum drug ratios in
inflamed peritoneal tissue. In this compartment, drugs
CAN work — the barrier is moderate.

### Mature Abscess (Encapsulated)

A fully formed abscess has:
- **Fibrous capsule:** thick collagen barrier
- **No vasculature:** interior cut off from blood supply
- **Low pH:** anaerobic metabolism → pH 5.5-6.0
- **High protein:** drug binding, inactivation
- **Anaerobic core:** aminoglycosides inactive at low pH

R_abscess is extremely low for all drugs. Even the best
penetrator (metronidazole) achieves R ≈ 0.12.

---

## 4. Input Data

### 4.1 Drug Panel — Intra-abdominal Infection

Eight drugs covering aerobic (E. coli) and anaerobic
(B. fragilis) pathogens. MIC is for each drug's primary
target organism:

| Drug | Class | Target | AUC₂₄ (mg·h/L) | MIC | Source |
|---|---|---|---|---|---|
| Metronidazole | Nitroimidazole | B. fragilis | 130 | 1.0 | FDA |
| Clindamycin | Lincosamide | B. fragilis | 30 | 0.25 | FDA |
| Ciprofloxacin | Fluoroquinolone | E. coli | 30 | 0.06 | FDA |
| Meropenem | Carbapenem | Mixed | 200 | 0.25 | FDA |
| Pip/tazo | BL/BLI | Mixed | 250 | 0.5 | FDA |
| Ceftriaxone | 3rd gen ceph | E. coli | 550 | 0.06 | FDA |
| Gentamicin | Aminoglycoside | E. coli | 70 | 0.5 | FDA |
| Vancomycin | Glycopeptide | Enterococcus | 400 | 1.0 | FDA |

### 4.2 Penetration Ratios — Two Compartments

| Drug | R_phlegmon | R_abscess | Mechanism |
|---|---|---|---|
| Metronidazole | 0.80 | 0.12 | Small (171 Da), lipophilic — best capsule crosser |
| Ciprofloxacin | 0.70 | 0.06 | Zwitterionic (331 Da), good tissue penetration |
| Clindamycin | 0.60 | 0.08 | Moderate lipophilicity (425 Da) |
| Meropenem | 0.30 | 0.03 | Hydrophilic beta-lactam (437 Da) |
| Pip/tazo | 0.20 | 0.02 | Large hydrophilic (518+300 Da), poor diffusion |
| Ceftriaxone | 0.15 | 0.02 | Large (555 Da), highly protein-bound, poor diffusion |
| Gentamicin | 0.10 | 0.01 | Polycationic (478 Da), pH-inactivated |
| Vancomycin | 0.10 | 0.01 | Very large (1449 Da), cannot diffuse through capsule |

### 4.3 τ Computation

τ = log₁₀(AUC₂₄ / MIC)

| Drug | AUC₂₄ | MIC | τ |
|---|---|---|---|
| Ceftriaxone | 550 | 0.06 | 3.962 |
| Meropenem | 200 | 0.25 | 2.903 |
| Ciprofloxacin | 30 | 0.06 | 2.699 |
| Pip/tazo | 250 | 0.5 | 2.699 |
| Vancomycin | 400 | 1.0 | 2.602 |
| Gentamicin | 70 | 0.5 | 2.146 |
| Metronidazole | 130 | 1.0 | 2.114 |
| Clindamycin | 30 | 0.25 | 2.079 |

---

## 5. Computation — Phlegmon (No Capsule)

K_total = K_ADMET + K_peritoneal
K_ADMET = 0.1
K_peritoneal = max(1/R - 1, -1)

### 5.1 Phlegmon Drug Ranking

| Drug | τ | R_phleg | K_peri | K_total | C_phlegmon |
|---|---|---|---|---|---|
| Metronidazole | 2.114 | 0.80 | 0.250 | 0.350 | 6.040 |
| Ciprofloxacin | 2.699 | 0.70 | 0.429 | 0.529 | 5.103 |
| Clindamycin | 2.079 | 0.60 | 0.667 | 0.767 | 2.712 |
| Meropenem | 2.903 | 0.30 | 2.333 | 2.433 | 1.193 |
| Ceftriaxone | 3.962 | 0.15 | 5.667 | 5.767 | 0.687 |
| Pip/tazo | 2.699 | 0.20 | 4.000 | 4.100 | 0.658 |
| Vancomycin | 2.602 | 0.10 | 9.000 | 9.100 | 0.286 |
| Gentamicin | 2.146 | 0.10 | 9.000 | 9.100 | 0.236 |

**Phlegmon result:** 4 drugs exceed C = 1.0 (Metro 6.040,
Cipro 5.103, Clinda 2.712, Mero 1.193). Antibiotics CAN
work in phlegmon. This predicts why small phlegmons can
be cured with antibiotics alone.

---

## 6. Computation — Mature Abscess (Encapsulated)

K_total = K_ADMET + K_capsule
K_capsule = max(1/R - 1, -1)

### 6.1 Abscess Drug Ranking

| Drug | τ | R_abs | K_caps | K_total | C_abscess |
|---|---|---|---|---|---|
| Metronidazole | 2.114 | 0.12 | 7.333 | 7.433 | 0.284 |
| Clindamycin | 2.079 | 0.08 | 11.500 | 11.600 | 0.179 |
| Ciprofloxacin | 2.699 | 0.06 | 15.667 | 15.767 | 0.171 |
| Meropenem | 2.903 | 0.03 | 32.333 | 32.433 | 0.090 |
| Ceftriaxone | 3.962 | 0.02 | 49.000 | 49.100 | 0.081 |
| Pip/tazo | 2.699 | 0.02 | 49.000 | 49.100 | 0.055 |
| Vancomycin | 2.602 | 0.01 | 99.000 | 99.100 | 0.026 |
| Gentamicin | 2.146 | 0.01 | 99.000 | 99.100 | 0.022 |

### 6.2 KEY RESULT: All C < 0.3 in Mature Abscess

| Drug | C_abscess | Above 1.0? |
|---|---|---|
| Metronidazole | 0.284 | **NO** |
| Clindamycin | 0.179 | **NO** |
| Ciprofloxacin | 0.171 | **NO** |
| Meropenem | 0.090 | **NO** |
| Ceftriaxone | 0.081 | **NO** |
| Pip/tazo | 0.055 | **NO** |
| Vancomycin | 0.026 | **NO** |
| Gentamicin | 0.022 | **NO** |

**EVERY DRUG FAILS.** The maximum C achievable in a mature
abscess is 0.284 (metronidazole). The equation predicts
that no antibiotic can achieve therapeutic coherence through
the abscess capsule. This is the geometric basis for
MANDATORY SOURCE CONTROL.

---

## 7. The Metronidazole Inversion

This is the most elegant cross-test validation in the suite:

### DFO (Test 5) — Ischemic Bone
Metronidazole is LAST (#8) in the DFO ranking.
R_bone = 0.10, low τ → worst drug for osteomyelitis.

### Abscess (Test 9) — Mature Abscess
Metronidazole is FIRST (#1) in the abscess ranking.
R_abscess = 0.12 (best penetrator), targets anaerobes.

The SAME drug reverses position across two tissues.
The SAME equation captures both rankings correctly.
The difference is the R value — tissue context changes
the geometry.

| Disease | Metro rank | Metro C | Metro R |
|---|---|---|---|
| DFO (bone) | 8 / 8 | 0.170 | 0.10 |
| Abscess (phlegmon) | 1 / 8 | 6.040 | 0.80 |
| Abscess (mature) | 1 / 8 | 0.284 | 0.12 |

---

## 8. Validation Predictions

### Prediction 1: Antibiotics cure phlegmon but fail for abscess

**Geometric prediction:** In phlegmon, 4 drugs achieve C > 1.0.
In mature abscess, 0 drugs achieve C > 1.0. The transition
from phlegmon to abscess crosses the treatment boundary —
drugs stop working when the capsule forms.

**Ground truth:** SIS 2010 guidelines: "Antibiotic therapy
alone may be adequate for small phlegmons." But: "Adequate
source control is essential for management of complicated
intra-abdominal infection." Brook 2008: "Drainage is
mandatory for established abscesses."

**Match: YES.**

### Prediction 2: Metronidazole is the best abscess penetrator

**Geometric prediction:** Metronidazole achieves the highest
C in mature abscess (0.284) — small molecular weight (171 Da)
and high lipophilicity enable capsule diffusion. Still not
enough for monotherapy, but best of all options.

**Ground truth:** Metronidazole is recommended first-line for
anaerobic coverage in intra-abdominal infections (SIS 2010,
IDSA 2010). It achieves measurable concentrations in abscess
cavities (Wagner 2006, Joiner 1981). This is consistent with
it being the best capsule penetrator.

**Match: YES.**

### Prediction 3: Metro inversion from DFO validates tissue context

**Geometric prediction:** Metro is #8 in bone (DFO, Test 5)
and #1 in abscess (Test 9). The same equation, the same drug,
opposite rankings. Only R differs.

**Ground truth:** Metro is never used for osteomyelitis
(confirmed in DFO test). Metro IS used for abdominal
infections. The real-world prescribing patterns match the
geometric context-dependence.

**Match: YES.**

### Prediction 4: Vancomycin and gentamicin are geometrically excluded

**Geometric prediction:** VAN (C = 0.026) and GEN (C = 0.022)
are essentially zero in the abscess. VAN = 1449 Da (too large
to diffuse through capsule). GEN is polycationic AND pH-
inactivated in the anaerobic, acidic core.

**Ground truth:** Neither vancomycin nor gentamicin is
recommended for intra-abdominal abscess. Vancomycin is
reserved for enterococcal coverage only when IV access is
needed. Gentamicin has been largely abandoned for IAI due
to aminoglycoside inactivation in the abscess environment.

**Match: YES.**

### Prediction 5: Ceftriaxone high τ but fails in abscess

**Geometric prediction:** Ceftriaxone has the highest τ in
the panel (3.962) but only 5th in abscess (C = 0.081)
because R_abscess = 0.02. Its massive exposure advantage
cannot overcome the capsule barrier.

**Ground truth:** Ceftriaxone + metronidazole is the
recommended COMBINATION for peritonitis/phlegmon (CRO for
GNR, metro for anaerobes). In abscess, CRO alone is
insufficient — consistent with low abscess C.

**Match: YES.**

---

## 9. K_ADMET Sensitivity

| Drug | C_phleg (K=0.1) | C_phleg (K=0) | Rank change? |
|---|---|---|---|
| Metronidazole | 6.040 | 8.456 | No |
| Ciprofloxacin | 5.103 | 6.294 | No |
| Clindamycin | 2.712 | 3.119 | No |
| Meropenem | 1.193 | 1.244 | No |
| Ceftriaxone | 0.687 | 0.699 | No |
| Pip/tazo | 0.658 | 0.675 | No |
| Vancomycin | 0.286 | 0.289 | No |
| Gentamicin | 0.236 | 0.238 | No |

Rankings identical. Peritoneal barrier dominates.

---

## 10. Predicted Results Summary

| Prediction | Geometric result | Ground truth | Match? |
|---|---|---|---|
| Phlegmon treatable, abscess not | 4 drugs > 1.0 vs 0 | SIS/IDSA: drainage mandatory | ✓ |
| Metro best abscess penetrator | C_abs = 0.284 (#1) | First-line anaerobic drug | ✓ |
| Metro inversion from DFO | #8 bone → #1 abscess | Metro not used in bone, IS used in abdomen | ✓ |
| VAN/GEN excluded from abscess | C = 0.026, 0.022 | Not recommended for IAI | ✓ |
| CRO high τ but capsule-blocked | C_abs = 0.081 despite τ=3.962 | CRO + metro combo needed | ✓ |

Five predictions. Five matches. The geometry predicts when
drugs CAN'T work — the strongest possible validation.

---

*MIRADOR · Validation Test 9 · Intra-abdominal Abscess*
*The walled city*
*C = τ / K*
*Davis Geometric · 2026*
