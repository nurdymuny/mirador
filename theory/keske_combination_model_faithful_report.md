# Keske Method — Combination Model, Faithful Revision

**Scope:** technical/methods report on how MIRADOR computes the *combination* bone
coherence for the Steven Keske scenario (chronic MRSA acute hematogenous
osteomyelitis). It documents a model change in the Rust engine and the numbers it
produces. It is **not** clinical advice and makes **no** treatment recommendation;
the choice of interaction model and its magnitude is a clinical/evidence decision.

**Every number below is emitted by the real engine.** Reproduce with:

```bash
cargo run -p mirador-combo-bone --example steven_faithful_report
```

---

## Why this revision

The prior combination score came from a **parallel-resistor** model
(`combine_two`), shared by `KeskeApp.jsx` and the Rust core
`mirador-combo-bone`. On inspection it has three properties that are hard to
justify for a refractory patient:

1. **Synergy is applied twice.** `C_combo = (τ_A+τ_B)(1/K_A+1/K_B)·synergy²`, so a
   1.2 factor raises the result ~44%, not 20%.
2. **It is always super-additive.** Adding *any* second drug lowers combined
   impedance and raises the score — it **cannot represent antagonism**.
3. For Steven it returns **≈10.4**, roughly 2× the "cure" threshold of C=5 — for a
   child whose real course was 6 years, 5 antibiotics, 4 surgeries, still fighting.

The brief's own cited evidence (Barber 2015, in-vitro biofilm PK/PD, three MRSA
strains) found rifampin's benefit **strain-dependent — minimal or antagonistic**.
A model that can only ever help is the wrong shape for that evidence.

## The faithful approach

Reduce each drug to its bone coherence `C_bone = τ / K_pathway` (the same
in-series K-decomposition used everywhere), then combine the two coherences
through the **evidence-typed** `mirador-combination` engine (Bliss-style), where
the caller supplies the interaction from data (FICI / checkerboard / Bliss):

- **Additivity (Bliss independence):** `C = C_A + C_B`
- **Synergy:** `C = max(C_A, C_B) + δ`
- **Antagonism:** `C = min(C_A, C_B) × (1 − δ)`

This is wired as `combine_two_interaction(...)` in `mirador-combo-bone`, **added
alongside** the parallel-resistor (which is left intact for comparison), and
gated by tests (see below).

## Monotherapy — `C_bone = τ / K_pathway`

| Drug | τ | K_admet | K_pen | K_bio | K_res | K_pathway | C_bone |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ceftaroline | 12 | 0.670 | 2.333 | 2.002 | 1.280 | 6.285 | **1.909** |
| Rifampin\* | 8 | 0.500 | 1.857 | 1.706 | 0.849 | 4.912 | **1.629** |
| Vancomycin | 12 | 0.500 | 4.000 | 2.574 | 1.780 | 8.854 | **1.355** |

\*Rifampin is never monotherapy (rpoB resistance); its C_bone is a combination
component only. No monotherapy reaches C=5.

## Ceftaroline + Rifampin — every model

C_ceftaroline = 1.909, C_rifampin = 1.629 (best single 1.909, weakest single 1.629).

| Interaction model | Formula | C_bone_combo | vs C=5 |
|---|---|---:|:--:|
| Bliss additivity | C_A + C_B | **3.54** | below |
| Synergy δ=0.5 | max(C_A,C_B) + δ | 2.41 | below |
| Synergy δ=1.0 | max(C_A,C_B) + δ | 2.91 | below |
| Antagonism δ=0.3 | min(C_A,C_B) × (1−δ) | 1.14 | below |
| Antagonism δ=0.5 | min(C_A,C_B) × (1−δ) | 0.81 | below |
| _legacy parallel-resistor (s=1.2)_ | (τ_A+τ_B)(1/K_A+1/K_B)·s² | **10.44** | PASS |

**Key finding:** under every evidence-typed model, ceftaroline+rifampin stays
**below** the adequacy threshold for Steven's chronic geometry — consistent with a
refractory course. The parallel-resistor is the lone outlier that clears it.

## Honest caveats (do not skip)

- **δ and the interaction type are clinical/evidence inputs, not defaults.** The
  table shows a sensitivity range; picking cef+rif's actual interaction requires
  FICI/checkerboard/Bliss data (and per Barber 2015 it may be antagonistic for
  some strains). No value is asserted here as the truth.
- **The C=5 threshold is itself unvalidated.** Making engines agree cannot
  establish a cure threshold; it needs separate calibration against outcomes.
- **Penetration convention differs across implementations.** These Rust fixtures
  use *non-CRP-inflated* K_pen (e.g. ceftaroline 2.333), so their monotherapy
  C_bone (cef 1.909) is lower than the `KeskeApp.jsx` CRP-inflated version
  (cef ≈ 3.04). Which penetration convention is correct for Steven is an open,
  separate decision.
- `mirador-combination`'s additivity (sum of coherences) and synergy (max + δ) are
  themselves modeling simplifications — note that additivity can exceed a
  small-δ "synergy" when both agents are weak (as here: 3.54 > 2.41).

## What changed in the engine (all TDD-gated, non-destructive)

- Added dependency `mirador-combination` to `mirador-combo-bone`.
- Added `combine_two_interaction()` + `InteractionComboResult`; re-exported
  `InteractionType`. The existing `combine_two` parallel-resistor is **unchanged**.
- Promoted the Steven drug fixtures to a public `scenarios` module so tests, this
  report, and any tooling share ONE definition (no divergent copy).
- Tests: 14/14 pass — the original 9 plus 5 new (`additivity_is_sum`,
  `synergy_exceeds_best_single`, `antagonism_falls_below_weakest_single`,
  `additivity_is_more_conservative_than_parallel_resistor`, `rifampin_pair_is_blocked`).

Files: `mirador_rs/crates/mirador-combo-bone/src/combo.rs`,
`mirador_rs/crates/mirador-combo-bone/examples/steven_faithful_report.rs`.
