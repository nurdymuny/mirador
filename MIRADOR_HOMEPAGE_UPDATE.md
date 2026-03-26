# usemirador.sh Homepage Update — Copilot Instructions
## From single-disease showcase → four-disease terrain map

**Rule: Do NOT rebuild the site. Edit in place. The bottom half of the page (Researcher, Book, Science, Collaborate, Footer) stays almost untouched.**

---

## 1. HERO SECTION (replace lines 1-14)

**Old:**
```
BRANCH XI · THERAPEUTIC GEOMETRY
One equation predicted MRSA's next three resistance mutations.
All three confirmed by independent crystal structures...
```

**New:**
```
BRANCH XI · COMPARTMENT PK/PD

The first computationally accurate terrain map for drug efficacy.
Validated across four diseases.

Published tissue ratios in. Site-specific drug rankings out.
No training data. No fitted parameters.
Accurate enough to derive FDA dosing and predict resistance
mutations from geometry alone.

C = τ / K

SEE THE DEMOS          BRING YOUR DATA
```

## 2. STATS BAR (replace the 3/3 · 400mg · 6wk row)

Replace with four disease cards in a row (or 2x2 on mobile):

```
MRSA BONE                          TUBERCULOSIS
Derived FDA dose from geometry.    Derived the 4-drug regimen.
Predicted 3 resistance mutations   Detected which drug removal
confirmed by crystal structure.    causes the largest C drop.
161 tests · SEE DEMO →             52 tests · SEE DEMO →

MENINGITIS                         HIV RESERVOIRS
Computed the exact day steroids    Proved ART cannot cure from
lock antibiotics out of the brain. first principles. Identified one
Matches published survival data.   reservoir already clearable.
8+ tests · SEE DEMO →              83 tests · SEE DEMO →
```

Below the four cards, add one summary line:
```
4 diseases · 37+ independent tests · 0 fitted parameters
```

## 3. THE PROOF SECTION (edit, don't delete)

Keep the full MRSA proof (eigenvalue table, PDB citations, run-in-browser button). But wrap it in a tab or accordion so it's one of four proof sections:

```
[MRSA BONE] [TB] [MENINGITIS] [HIV]
```

- MRSA tab: current content (no changes)
- TB tab: Mitchison subpopulation model, drug ranking inversion, Double Cover detection. Link to TB demo.
- Meningitis tab: Dynamic BBB function, Dex paradox (Day 0.98 failure), monotherapy derivation. Link to Meningitis demo.
- HIV tab: Cure impossibility theorem (10⁵× shortfall), genital tract clearability prediction, Φ gap at GALT. Link to HIV demo.

Each tab follows the same structure: headline result → math → validation table → reproduce it yourself.

## 4. THE PROBLEM SECTION (broaden)

**Old headline:** "MRSA is winning. We have no new weapons."

**New headline:** "The drugs exist. The data is published. The terrain map was missing."

**New body (replace, don't append):**
```
Vancomycin serum levels look therapeutic — but only 20% reaches
bone. ART suppresses HIV to undetectable — but the virus hides in
five reservoirs the drugs can barely reach. Ceftriaxone sterilizes
CSF during meningitis — but steroids seal the brain shut in under
a day. TB requires four drugs for six months — but nobody computed
which drug fails at which barrier.

The data has been in the literature for decades. Tissue penetration
ratios. AUC curves. MIC values. Published, peer-reviewed, sitting
in journals since the 1950s. The missing piece was never more data.
It was a way to compute what the data already says.

MIRADOR reads published PK data and computes where drugs actually
go — across bone, brain, lung, and reservoir. One equation.
Four diseases. Zero fitted parameters.
```

**Keep the BY THE NUMBERS stats** but update:
```
20,000+   Americans killed by MRSA per year
480,000   New MDR-TB cases per year globally
~38M      People living with HIV worldwide
>90%      Drug candidates that fail clinical trials
0         Fitted parameters in MIRADOR
```

## 5. INTERACTIVE DEMO SECTION (make it a selector)

**Old:** Single MRSA 5-stage pipeline description.

**New:** Disease selector + description:

```
Patient in. Terrain map out.

Choose a disease module. Edit any patient value. Watch every
downstream computation update in real time. All data sourced
from published PK studies and clinical literature.

[MRSA BONE]  [TB]  [MENINGITIS]  [HIV RESERVOIRS]
LAUNCH DEMO →
```

Keep the four feature badges (Editable patient, 3D viewer, Resistance radar, Source citations) but generalize "3D protein viewer" to "Interactive visualization" and "Resistance radar" to "Prediction engine."

## 6. ROADMAP (update status)

```
1   PBP2a / MRSA Validation              COMPLETE (no changes)
1b  Keske Method — Pediatric AHO         LIVE (no changes)
1c  TB Module — Pulmonary Tuberculosis   LIVE ← NEW
    Mitchison subpopulations, caseum bottleneck, 4-drug derivation
    52 Rust tests · Generalized compartment engine v1.3

1d  Meningitis Module                    LIVE ← NEW
    Dynamic BBB barrier, Dex paradox, monotherapy derivation
    8+ tests · Time-varying K_barrier manifold

1e  HIV Reservoir Module                 LIVE ← NEW
    5-reservoir pharmacology, catalytic LRA modification
    Cure impossibility theorem, genital tract clearability
    83 TDD tests specified · 10/10 Python validation

2   Retrospective Clinical Validation    SEEKING PARTNERS (no changes)
3   Additional Disease Instances         PLANNED ← renamed
    Cystic fibrosis · Prosthetic joint · Endocarditis · Fungal meningitis
4   Clinical Decision Support            PLANNED (no changes)
```

## 7. ECOSYSTEM GRID (add new products if needed, otherwise no change)

Current grid: HERALD, GEODESIC, TESSERA, CHIHIRO, MIRADOR
No changes needed — MIRADOR card already exists and now encompasses four diseases internally.

## 8. COLLABORATE SECTION (broaden)

**Old:** "You have MRSA cases and clinical outcomes."

**New:** "You have compartment infection data — MRSA, TB, meningitis, HIV, or any disease where blood levels don't tell the whole story."

**Old role list:** Infectious Disease MD, Clinical Pharmacist, Comp Biologist, Researcher, Industry/Pharma, Other

**New role list (add):** HIV Cure Researcher, Pharmacokineticist (keep all existing, add these two)

## 9. GROUNDING LINE (add above footer)

New element — a lineage bar that anchors the framework in established science:

```
Built on 60 years of clinical pharmacology.
Eagle 1953 · Craig 1998 · Kirchhoff 1845 · Davis 2025
```

Place this between the Collaborate section and the footer.

## 10. DO NOT CHANGE
- THE RESEARCHER section (Bee's bio, credentials, career) — untouched
- THE BOOK section (Geometry of Medicine) — untouched
- THE SCIENCE bridge section (AlphaFold, docking, pharmacophores) — untouched
- Footer legal/patent text — untouched
- C = τ/K equation styling — untouched
- Color scheme, fonts, dark theme — untouched

---

## SUMMARY OF CHANGES
- Hero: new headline + subtitle (terrain map framing)
- Stats: 3 stats → 4 disease cards + summary line
- Proof: wrap in tabs (one per disease)
- Problem: broaden from MRSA-only to four-disease framing
- Demo: add disease selector
- Roadmap: promote TB/Meningitis/HIV from PLANNED to LIVE
- Collaborate: broaden target audience
- Grounding line: add Eagle/Craig/Kirchhoff/Davis lineage
- Everything else: don't touch
