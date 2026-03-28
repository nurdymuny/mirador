# MIRADOR Validation Test 7: Infective Endocarditis
## The Avascular Fortress — Vegetation Penetration
### Davis Geometric · Validation Protocol · 2026-03-28

---

## 1. Clinical Question

The cardiac vegetation is the hardest barrier in infectious
disease. An avascular mass of fibrin, platelets, and bacteria
with NO internal blood supply. Drugs must DIFFUSE through the
vegetation matrix to reach embedded bacteria. Can the Davis
Field Equations predict which drugs penetrate cardiac
vegetations, rank them correctly, and identify why prosthetic
valve endocarditis (PVE) requires different therapy than
native valve endocarditis (NVE)?

This test validates THREE things:
1. **Extreme barrier K** — K_vegetation is the highest K in
   the MIRADOR suite (avascular, diffusion-limited)
2. **NVE vs PVE** — the biofilm penalty on a prosthetic valve
   adds K_biofilm to an already extreme barrier
3. **Why rifampin is essential for PVE** — a prediction from
   the geometry alone

---

## 2. The Firewall: I ∩ G = ∅

### Input set (I) — Pharmacokinetic measurements

| Parameter | Source | Type |
|---|---|---|
| AUC₂₄ for each drug | FDA labels, published PK | Exposure |
| MIC for S. aureus (MSSA) | EUCAST breakpoints | Susceptibility |
| R_vegetation (vegetation:serum ratio) | Cremieux 1989, Bayer AS studies | Penetration |
| R_vegetation values | Xiong 2011 (review) | Penetration |

### Ground truth set (G) — Clinical outcomes

| Ground truth | Source | Type |
|---|---|---|
| AHA 2015 guidelines | Baddour 2015 (Circulation) | Consensus |
| ESC 2023 guidelines | Delgado 2023 (Eur Heart J) | Consensus |
| POET trial (oral step-down) | Iversen 2019 (NEJM) | RCT |
| Gentamicin removal from staph IE recs | AHA 2015 | Consensus |
| PVE requires rifampin | AHA 2015, ESC 2023 | Consensus |
| Nafcillin > vancomycin for MSSA IE | AHA 2015 | Consensus |

### Overlap check

R_vegetation values from ex vivo and animal model PK studies.
Outcomes from clinical trials and guideline consensus.
Different experimental systems, different endpoints. I ∩ G = ∅. ✓

---

## 3. The Vegetation Barrier

Cardiac vegetations are fundamentally different from any
previous tissue compartment:

**No blood supply:** Once formed, the vegetation interior
has no capillaries. Drug delivery depends entirely on
diffusion from the vegetation surface inward.

**Fibrin-platelet matrix:** Dense protein matrix that impedes
diffusion of large or charged molecules. Lipophilic drugs
diffuse better.

**Bacterial embedding:** Bacteria are embedded deep in the
matrix, protected from both drugs and immune cells. This is
why endocarditis requires 4-6 weeks of therapy (need
prolonged exposure to maintain concentration gradient).

**Prosthetic valve biofilm:** PVE adds a bacterial biofilm
on the prosthetic surface UNDER the vegetation. This adds
K_biofilm on top of K_vegetation — the double barrier.

---

## 4. Input Data

### 4.1 Drug Panel — Staphylococcal Endocarditis

Eight drugs used in S. aureus endocarditis, all computed
against MSSA:

| Drug | Class | Dose | AUC₂₄ (mg·h/L) | MIC_MSSA | Source |
|---|---|---|---|---|---|
| Nafcillin | Anti-staph penicillin | 2g IV q4h | 200 | 0.5 | FDA |
| Cefazolin | 1st gen ceph | 2g IV q8h | 350 | 1.0 | FDA |
| Vancomycin | Glycopeptide | 15mg/kg IV q12h | 400 | 1.0 | FDA |
| Daptomycin | Lipopeptide | 8mg/kg IV daily | 750 | 0.5 | FDA |
| Gentamicin | Aminoglycoside | 3mg/kg IV daily | 70 | 0.5 | FDA |
| Rifampin | Rifamycin | 600mg PO q12h | 60 | 0.008 | FDA |
| Ceftriaxone | 3rd gen ceph | 2g IV daily | 550 | 2.0 | FDA |
| Linezolid | Oxazolidinone | 600mg PO q12h | 200 | 2.0 | FDA |

### 4.2 Vegetation Penetration Ratios

R_vegetation values from experimental studies measuring
drug concentrations inside cardiac vegetations:

| Drug | R_vegetation | Source | Mechanism |
|---|---|---|---|
| Rifampin | 0.50 | Cremieux 1989, Xiong 2011 | Lipophilic, small (823 Da), rapid diffusion |
| Linezolid | 0.35 | Xiong 2011, Bayer studies | Good tissue distribution (337 Da) |
| Nafcillin | 0.20 | Bayer AS, experimental models | Moderate diffusion (414 Da) |
| Daptomycin | 0.15 | Xiong 2011 | Lipopeptide (1620 Da), partially impeded |
| Cefazolin | 0.15 | Cremieux 1989 | Hydrophilic cephalosporin (455 Da) |
| Ceftriaxone | 0.12 | Cremieux 1989 | Large ceph (555 Da), highly protein-bound |
| Vancomycin | 0.10 | Cremieux 1989, Xiong 2011 | Large glycopeptide (1449 Da), charged |
| Gentamicin | 0.05 | Bayer AS, Xiong 2011 | Aminoglycoside (478 Da), polycationic |

### 4.3 τ Computation

τ = log₁₀(AUC₂₄ / MIC)

| Drug | AUC₂₄ | MIC | τ |
|---|---|---|---|
| Rifampin | 60 | 0.008 | 3.875 |
| Daptomycin | 750 | 0.5 | 3.176 |
| Nafcillin | 200 | 0.5 | 2.602 |
| Vancomycin | 400 | 1.0 | 2.602 |
| Pip/tazo | 250 | 0.5 | 2.699 |
| Cefazolin | 350 | 1.0 | 2.544 |
| Ceftriaxone | 550 | 2.0 | 2.439 |
| Gentamicin | 70 | 0.5 | 2.146 |
| Linezolid | 200 | 2.0 | 2.000 |

---

## 5. Computation — Native Valve Endocarditis (NVE)

K_total = K_ADMET + K_vegetation
K_ADMET = 0.1
K_vegetation = max(1/R - 1, -1)

### 5.1 NVE Drug Ranking

| Drug | τ | R_veg | K_veg | K_total | C_NVE |
|---|---|---|---|---|---|
| Rifampin | 3.875 | 0.50 | 1.000 | 1.100 | 3.523 |
| Linezolid | 2.000 | 0.35 | 1.857 | 1.957 | 1.022 |
| Nafcillin | 2.602 | 0.20 | 4.000 | 4.100 | 0.634 |
| Daptomycin | 3.176 | 0.15 | 5.667 | 5.767 | 0.551 |
| Cefazolin | 2.544 | 0.15 | 5.667 | 5.767 | 0.441 |
| Ceftriaxone | 2.439 | 0.12 | 7.333 | 7.433 | 0.328 |
| Vancomycin | 2.602 | 0.10 | 9.000 | 9.100 | 0.286 |
| Gentamicin | 2.146 | 0.05 | 19.000 | 19.100 | 0.112 |

---

## 6. Computation — Prosthetic Valve Endocarditis (PVE)

PVE adds K_biofilm = 2.0 to the vegetation barrier.
K_total_PVE = K_ADMET + K_vegetation + K_biofilm

### 6.1 PVE Drug Ranking

| Drug | τ | K_total_NVE | K_biofilm | K_total_PVE | C_PVE |
|---|---|---|---|---|---|
| Rifampin | 3.875 | 1.100 | 2.0 | 3.100 | 1.250 |
| Linezolid | 2.000 | 1.957 | 2.0 | 3.957 | 0.505 |
| Nafcillin | 2.602 | 4.100 | 2.0 | 6.100 | 0.427 |
| Daptomycin | 3.176 | 5.767 | 2.0 | 7.767 | 0.409 |
| Cefazolin | 2.544 | 5.767 | 2.0 | 7.767 | 0.328 |
| Ceftriaxone | 2.439 | 7.433 | 2.0 | 9.433 | 0.259 |
| Vancomycin | 2.602 | 9.100 | 2.0 | 11.100 | 0.234 |
| Gentamicin | 2.146 | 19.100 | 2.0 | 21.100 | 0.102 |

### 6.2 The PVE Penalty

| Drug | C_NVE | C_PVE | Loss |
|---|---|---|---|
| Rifampin | 3.523 | 1.250 | 65% |
| Linezolid | 1.022 | 0.505 | 51% |
| Nafcillin | 0.634 | 0.427 | 33% |
| Daptomycin | 0.551 | 0.409 | 26% |
| Cefazolin | 0.441 | 0.328 | 26% |
| Ceftriaxone | 0.328 | 0.259 | 21% |
| Vancomycin | 0.286 | 0.234 | 18% |
| Gentamicin | 0.112 | 0.102 | 9% |

The PVE penalty is LARGEST for the best-penetrating drugs
(rifampin 65%, linezolid 51%) and smallest for the worst
(gentamicin 9%). This is because K_biofilm = 2.0 is a
larger fraction of K_total for drugs with already-low K.

Key result: In NVE, 2 drugs exceed C = 1.0 (rifampin,
linezolid). In PVE, only rifampin exceeds C = 1.0. This
is the geometric basis for mandatory rifampin in PVE.

---

## 7. Validation Predictions

### Prediction 1: Rifampin dominates vegetation penetration

**Geometric prediction:** Rifampin is #1 in both NVE
(C = 3.523) and PVE (C = 1.250). Its combination of
high τ (3.875, driven by MIC = 0.008) and high R_veg
(0.50, lipophilic) gives it the highest coherence by
a large margin.

**Ground truth:** AHA 2015 and ESC 2023: rifampin is
recommended as adjunctive therapy for PVE. "Rifampin
should be added... for prosthetic valve endocarditis."
Rifampin has uniquely good biofilm/vegetation activity.

**Match: YES.**

### Prediction 2: Nafcillin > Vancomycin for MSSA endocarditis

**Geometric prediction:** Nafcillin (C = 0.634) ranks
above vancomycin (C = 0.286) by 2.2×. Despite identical
τ (both 2.602), nafcillin has better vegetation penetration
(R = 0.20 vs 0.10). The large molecular size of vancomycin
(1449 Da vs 414 Da) impedes diffusion into the avascular
vegetation.

**Ground truth:** AHA 2015: "For MSSA, nafcillin or
oxacillin is preferred over vancomycin." Multiple studies
show higher failure rates with vancomycin for MSSA IE
compared to nafcillin. Kim 2008: mortality 2× higher with
vancomycin vs nafcillin for MSSA bacteremia.

**Match: YES.**

### Prediction 3: Gentamicin is geometrically futile

**Geometric prediction:** Gentamicin ranks last (C = 0.112
NVE, 0.102 PVE). K_vegetation = 19.1 represents near-total
exclusion from the avascular vegetation interior.

**Ground truth:** AHA 2015 REMOVED gentamicin from
uncomplicated S. aureus NVE recommendations based on
lack of benefit and nephrotoxicity. "Routine use of
aminoglycoside therapy is not recommended for treatment
of native valve S. aureus infective endocarditis."
The geometry predicts what took decades to recognize
clinically.

**Match: YES.**

### Prediction 4: Rifampin is the ONLY drug above threshold in PVE

**Geometric prediction:** In PVE, only rifampin achieves
C > 1.0 (C = 1.250). Every other drug falls below threshold.
This predicts that rifampin is MANDATORY in PVE — the
biofilm penalty pushes all other drugs below therapeutic
coherence.

**Ground truth:** All guidelines mandate rifampin for PVE.
ESC 2023: "Rifampin is recommended for PVE." The consistent
clinical experience is that PVE without rifampin has higher
relapse rates.

**Match: YES.**

### Prediction 5: Daptomycin high τ but limited by K

**Geometric prediction:** Daptomycin has the second-highest
τ (3.176, driven by high AUC and low MIC), but ranks only
4th (C = 0.551 NVE) because R = 0.15 limits vegetation
penetration. Its 1620 Da molecular weight partially impedes
diffusion.

**Ground truth:** Daptomycin is approved only for right-sided
S. aureus endocarditis (smaller vegetations). It fails for
left-sided IE in clinical trials (Fowler 2006). Left-sided
vegetations are larger/thicker → effectively lower R →
even worse C. The geometry correctly identifies daptomycin's
limitation.

**Match: YES.**

### Prediction 6: Linezolid as oral alternative

**Geometric prediction:** Linezolid ranks #2 (C = 1.022
NVE) — the only non-rifampin drug above threshold. Its
excellent tissue distribution (R = 0.35) compensates for
modest τ (2.000). Being oral with 100% bioavailability
makes it a step-down option.

**Ground truth:** The POET trial (Iversen 2019, NEJM)
showed oral step-down was non-inferior to IV completion.
Linezolid was among the oral agents used successfully.
ESC 2023 acknowledges linezolid as a PVE option when
standard therapy fails.

**Match: YES.**

---

## 8. K_ADMET Sensitivity

| Drug | C_NVE (K_ADMET=0.1) | C_NVE (K_ADMET=0) | Rank change? |
|---|---|---|---|
| Rifampin | 3.523 | 3.875 | No |
| Linezolid | 1.022 | 1.077 | No |
| Nafcillin | 0.634 | 0.651 | No |
| Daptomycin | 0.551 | 0.561 | No |
| Cefazolin | 0.441 | 0.449 | No |
| Ceftriaxone | 0.328 | 0.333 | No |
| Vancomycin | 0.286 | 0.289 | No |
| Gentamicin | 0.112 | 0.113 | No |

Rankings identical. Vegetation barrier dominates.

---

## 9. Predicted Results Summary

| Prediction | Geometric result | Ground truth | Match? |
|---|---|---|---|
| Rifampin dominates penetration | C = 3.523 (#1 NVE, #1 PVE) | AHA/ESC: mandatory for PVE | ✓ |
| Nafcillin > vancomycin for MSSA | Nafcillin 2.2× better | AHA: nafcillin preferred | ✓ |
| Gentamicin futile in vegetation | C = 0.112, last place | AHA 2015: removed from recs | ✓ |
| Rifampin only drug > θ in PVE | C_PVE = 1.250 (only > 1.0) | Mandatory rifampin for PVE | ✓ |
| Daptomycin limited by K | C = 0.551 despite high τ | Fails left-sided IE | ✓ |
| Linezolid as oral step-down | C = 1.022 (above threshold) | POET trial success | ✓ |

Six predictions. Six matches. All from PK data + vegetation
penetration ratios. The avascular fortress, quantified.

---

*MIRADOR · Validation Test 7 · Infective Endocarditis*
*The avascular fortress*
*C = τ / K*
*Davis Geometric · 2026*
