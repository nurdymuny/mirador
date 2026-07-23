# MIRADOR

**Manifold-Informed Rational Architecture for Drug-Organism Response** — a
geometric framework for predicting drug efficacy in *compartmentalized*
infections from published pharmacokinetic data, with no fitted PK parameters.

> Standard pharmacokinetic reasoning equates serum drug concentration with
> tissue drug concentration. It fails, predictably and repeatedly, in bone,
> lung granuloma, cerebrospinal fluid, and latent viral reservoirs — the
> places where infections actually persist. MIRADOR models the *delivery
> geometry* of the barrier between the bloodstream and the pathogen, and
> ranks drugs by how well they cross it.

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20NC%201.0.0-blueviolet.svg)](LICENSE)
[![Rust 2021](https://img.shields.io/badge/rust-2021-orange.svg)](mirador_rs/Cargo.toml)
[![Engine tests](https://img.shields.io/badge/rust%20tests-290%20passing-brightgreen.svg)](mirador_rs)

> **Licensing:** MIRADOR is released under the **PolyForm Noncommercial
> License 1.0.0** — free for personal use, research, education, and
> nonprofit/government use. **Commercial use is not granted by this license**
> and is reserved by the copyright holder under a separate commercial
> agreement. See [License & commercial use](#license--commercial-use) below.

```
Davis Geometric · 2026 · Bee Rosa Davis
```

---

## The one equation

Everything in MIRADOR is one governing equation — *therapeutic coherence*:

```
C(d, r)  =  τ(d)  /  K_pathway(d, r)
```

- **`C`** is a dimensionless score for how well drug `d` can act on the
  pathogen at anatomical reservoir `r`. Above a single disease-specific
  threshold `θ`, the drug reaches and suppresses the pathogen there; below
  it, the drug fails at that site *regardless of how adequate its serum
  levels look.*
- **`τ(d) = log₁₀(AUC₂₄ / MIC)`** — the *pharmacophoric potential*: a drug's
  intrinsic potency ceiling in the absence of barriers, computed from its
  published 24-hour area-under-the-curve and its minimum inhibitory
  concentration (IC₅₀ substituted for viruses).
- **`K_pathway = K_ADMET + K_barrier + K_pheno + K_res`** — the total
  *delivery impedance*, a series sum of four penalties:
  - `K_ADMET` — systemic absorption / distribution / metabolism / excretion / toxicity cost
  - `K_barrier = max(1/R − 1, −1)` — the anatomical barrier, driven entirely
    by `R`, the measured **tissue-to-plasma concentration ratio**. `R < 1`
    (drug excluded) → positive impedance; `R = 1` → zero; `R > 1` (drug
    concentrates) → a bounded bonus, floored at `−1` by the *No Parallel
    Lines* axiom.
  - `K_pheno` — phenotypic resistance (biofilm, dormancy, latency)
  - `K_res` — drug-independent persistence of the anatomical niche

Multi-drug regimens combine by a **Kirchhoff parallel-resistor law** on drug
conductances `gᵢ = 1/K_pathway,ᵢ` — drugs compose the way parallel resistors
do, and the framework identifies which combinations cover which reservoirs
above threshold.

**Zero fitted PK parameters.** The impedances and potentials are computed
from published data by deterministic formulas — no optimization loop, no loss
function, no gradient descent. The only calibrated quantity is one diagnostic
threshold `θ` per disease, each anchored to a single established standard of
care. (See [Honest accounting](#scope--honest-accounting) for what that claim
does and does not cover.)

### The Double Cover — a model that reports its own reliability

MIRADOR ships with a built-in self-diagnostic, the **Double Cover Identity**:

```
S + d² = 1
```

`S` is the fraction of anatomical reservoirs the regimen reaches above
threshold — *what penetration geometry explains*. `d² = 1 − S` is the
residual — *what unmodeled dynamics (kill kinetics, immunity, resistance
emergence) must account for.* When `S ≈ 1`, trust the geometric ranking. When
`S ≈ 0`, do not. When `0 < S < 1`, the model tells you which reservoirs to
trust and which to question. A model that knows the boundary of its own
competence is the point — not a claim to explain all of biology.

---

## What is actually validated

MIRADOR has been applied, with the **same equation throughout**, to four
compartmentalized diseases spanning four pathogens, four organ systems, and
four barrier types:

| Disease instance | Pathogen | Barrier | Result |
|---|---|---|---|
| Pediatric bone MRSA (osteomyelitis) | *S. aureus* | bone + biofilm | reproduces vancomycin-monotherapy failure and rifampin-combination rescue; `θ = 5.0` |
| Pulmonary tuberculosis | *M. tuberculosis* | granuloma / caseum | see the continuous correlation below; `S ≈ 0.78` |
| Bacterial meningitis | bacteria | blood-brain barrier (time-varying) | reproduces IDSA first-line ordering; `θ = 0.50` |
| HIV latent reservoirs | HIV-1 | CNS / lymph / GALT / genital / marrow | reproduces reservoir-persistence hierarchy; `θ = 1.0` |

**These are all infectious diseases.** MIRADOR is, today, a model of drug
delivery to a *pathogen* behind a barrier. It has not been applied to
genetic, oncologic, or other non-infectious disease.

**The strongest single result** is quantitative and external: against the TB
Trials Consortium / REMoxTB / OFLOTUB literature, MIRADOR's computed
lesion-coherence `C_lesion` correlates with real week-8 culture-conversion
across **15 trial arms / 6,188 patients** at **Pearson r = 0.81 (R² = 0.65),
Spearman ρ = 0.80**. (Relapse prediction is weaker, r ≈ −0.56 — reported
honestly, not hidden.) Every other disease result is *ordinal* agreement:
the model reproduces already-established clinical drug rankings, which is a
consistency check, not a blinded prospective trial.

The engine is real, working code — **290 Rust tests pass across 29 crates**
(`cargo test --workspace`) — implementing standard, textbook pharmacology
(one-compartment PK, Emax/Hill pharmacodynamics, Lipinski rule-of-five,
Schwartz eGFR, Mosteller BSA, allometric scaling, hERG/Ames toxicity, the
AUC/MIC index) inside the coherence geometry above.

---

## What's in this repository

```
mirador/
├── geometry_of_the_cure.pdf / .tex   # Flagship paper: the full C = τ/K framework, 4 disease instances
├── theory/                           # Mathematical manuscripts (Davis Field Equation, Double Cover, etc.)
│   ├── mirador.tex                    #   — immune/receptor manuscript (see naming note below)
│   ├── the_davis_manifold.tex        #   — the abstract Davis-manifold foundation
│   ├── keske_method_clinical_brief.tex
│   └── ...
├── mirador_rs/                       # The engine — 29-crate Rust workspace (290 tests)
│   └── crates/
│       ├── mirador-core/             #   C = τ/K, coherence, Double Cover residual
│       ├── mirador-admet/            #   K_ADMET curvature (Lipinski, CYP450, hERG/Ames)
│       ├── mirador-dosing/           #   one-compartment PK, Emax/Hill, steady-state
│       ├── mirador-pediatric/        #   Schwartz eGFR, allometric scaling, weight-based dosing
│       ├── mirador-hiv-reservoir/    #   5 ARVs × 5 reservoirs, Kirchhoff combination law
│       ├── mirador-meningitis/       #   time-dependent BBB penetration r_bbb(t)
│       ├── mirador-tb-*/             #   granuloma / caseum multi-compartment lesion model
│       └── *-wasm/                   #   WASM bridges to the frontend
├── mirador-frontend/                 # React/Vite SPA — disease calculators, DB explorer, paper reanalyses
├── validation_test_*.md              # Worked compartment cases (PJI, prostatitis, endocarditis, abscess, …)
├── spec_*.md                         # Reanalyses of published PK papers (Craig, Lipinski, Zimmerli, Letendre, …)
├── *_validation.py / *_results.json  # Validation harnesses and their numeric outputs
└── MIRADOR_Patent.tex                # Provisional patent application draft
```

The Rust engine is the source of truth for every number; the Python scripts
cross-check it against public MIC/AUC/breakpoint databases (EUCAST, CLSI,
WHO); the frontend and WASM builds expose the same engine interactively.

---

## Quick start

```bash
# Build and test the engine (Rust 2021)
cd mirador_rs
cargo test --workspace          # 290 tests, ~seconds after first compile
cargo build --release

# Run the frontend (Node 18+)
cd ../mirador-frontend
npm install
npm run dev                      # Vite dev server; disease calculators + DB explorer
```

The engine has **no network dependency** — all PK constants are literature-
sourced and compiled in. The frontend's live "DB Explorer" optionally reaches
a hosted [GIGI](https://github.com/) fiber-bundle database; when that is
unreachable it falls back to an in-browser demo seed, so a fresh clone works
offline.

> **Large datasets are not included.** The optional ingestion scripts
> (`ingest_*.py`) build a local `data/` tree from ChEMBL / BindingDB /
> PharmGKB / ClinicalTrials dumps. That directory is git-ignored and must be
> downloaded from the original sources under their own licenses; it is **not**
> part of this repository.

---

## Scope & honest accounting

This section states the limits explicitly, because a model is only useful if
you know where it stops. From the flagship paper's own "Limitations" section
and an independent review of the codebase:

- **Decision support, not clinical guidance.** MIRADOR is an investigational
  mathematical framework for hypothesis generation and ranking. It is **not**
  a diagnostic or prescribing tool and must not be used to make treatment
  decisions.
- **Relative ranking, not absolute prediction.** `C` is a dimensionless
  ratio, not a tissue concentration or a time-to-cure. For absolute drug
  levels, use PBPK.
- **First-order geometry only.** The equation does *not* model kill kinetics
  (`dC/dt`), the immune system, resistance *emergence* over time, or
  molecular dynamics. The Double Cover measures exactly how much this
  omission costs on a given problem.
- **Validation is (mostly) retrospective and ordinal.** With the exception of
  the TB continuous correlation above, results reproduce already-documented
  clinical rankings. No prospective clinical prediction has been confirmed
  against new patient outcomes in this repository. (One timestamped
  prospective TB prediction, `prospective_prediction_QUANTUM_TB.md`, will not
  be resolvable until ~2028–2029.)
- **"Zero fitted parameters" is precise but narrow.** It is strictly true for
  `τ = log₁₀(AUC/MIC)` and `K_barrier = 1/R − 1`. The per-disease thresholds
  (`θ = 5.0 / 0.50 / 1.0`) and several sub-terms (phenotype/reservoir weights,
  synergy factor) are *literature-anchored and expert-assigned*, not fitted to
  outcomes — but they are chosen values, and this README calls them that.
- **Some source parameters rest on few citations.** A number of penetration
  ratios `R` are drawn from only two literature sources; broadening and
  cross-checking that provenance is ongoing work.
- **Single-author, pre-peer-review.** The mathematical foundation (the Davis
  Field Equation, the Double Cover Principle, the Non-Decoupling Theorem)
  is documented in author preprints and has not yet been independently
  peer-reviewed.

---

## A note on the name

Two distinct manuscripts in the Davis Geometric program share the acronym
**MIRADOR**:

1. **This repository** — *Manifold-Informed Rational Architecture for
   Drug-Organism Response*: the drug-delivery / pharmacokinetics framework
   (`geometry_of_the_cure.tex`, the `mirador_rs` engine).
2. A separate immunology manuscript — *Manifold of Immune Receptors And
   Drift-Optimized Responses*: a geometry-first framework for vaccine and
   antibody panel design (`theory/mirador.tex`, `ZENODO.md`).

They are related by a shared mathematical core (the Davis Field Equation
`C = τ/K`) but are **different systems addressing different problems**. When
this README says "MIRADOR," it means (1), the drug framework.

---

## Publications & theory

- **The Geometry of the Cure: Geometric Therapeutic Optimization via the
  Davis Field Equations** — Bee Rosa Davis (2026). Flagship manuscript;
  `geometry_of_the_cure.pdf` in this repo.
- **The Keske Method** — clinical instantiation for pediatric MRSA
  osteomyelitis. `theory/keske_method_clinical_brief.tex`
  (DOI: [10.5281/zenodo.18511755](https://doi.org/10.5281/zenodo.18511755)).
- **The Davis Manifold** / **The Non-Decoupling Theorem** / **The Double
  Cover Principle** — foundational geometry, `theory/`.
- Author: **Bee Rosa Davis** · ORCID
  [0009-0009-8034-4308](https://orcid.org/0009-0009-8034-4308) ·
  `bee_davis@alumni.brown.edu`

---

## License & commercial use

**Copyright © 2025–2026 Bee Rosa Davis (Davis Geometric). All rights reserved.**

MIRADOR is released under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**
([canonical text](https://polyformproject.org/licenses/noncommercial/1.0.0)).

### Why this license

> I make money off of the people who make money.

Research, education, personal use, hobby projects, charities, public-research
organizations, and government institutions all have a **permanent free
permission** and a patent license scoped to noncommercial use — and they keep
it regardless of how they are funded. A for-profit company building a product
on top of MIRADOR needs a separate written commercial agreement. The
noncommercial scope stays free.

### What's covered for free

Per the PolyForm Noncommercial license, **any noncommercial purpose is a
permitted purpose.** That explicitly includes:

- **Personal use** — research, experimentation, testing for the benefit of
  public knowledge, personal study, hobby and amateur pursuits, *without any
  anticipated commercial application.*
- **Noncommercial organizations** — charitable organizations, educational
  institutions, public research organizations, public safety or health
  organizations, and government institutions — *regardless of the source of
  funding.*

The license includes a **patent license scoped to noncommercial use**: the
patent claims below are licensed for use *within* the permitted noncommercial
scope.

### What's NOT covered (commercial use is reserved)

Commercial use is **not granted by the PolyForm license** and is reserved to
the copyright holder. "Commercial" includes — but is not limited to —
building a paid product on top of MIRADOR, embedding it in a SaaS or hosted
service offered to paying customers, redistributing it as part of a
commercial offering, and use inside any organization that does not qualify as
a "noncommercial organization" under the license.

If you want to use MIRADOR commercially, **you need a separate commercial
license from the copyright holder** (contact below).

### Patents

The mathematical constructions underlying MIRADOR — the coherence equation
`C = τ/K` as a therapeutic-delivery model, the barrier-impedance and Double
Cover constructions, the Kirchhoff combination law on drug conductances, and
resistance prediction via escape geodesics on drug-target fiber bundles — are
the subject of a provisional patent application held by the copyright holder
(*MIRADOR: Manifold-Informed Rational Architecture for Drug-Organism
Response*, US Provisional Patent Application No. 64/012,328). The PolyForm
license grants patent rights *only for permitted (noncommercial) use*; all
commercial patent rights are reserved.

### Commercial licensing

For commercial use — product use, hosted/SaaS use, paid redistribution, or
any use inside a for-profit organization not covered by the "Noncommercial
Organizations" definition — contact the copyright holder to negotiate an
exclusive or non-exclusive commercial license:

**Bee Rosa Davis — Davis Geometric** · `bee_davis@alumni.brown.edu`

---

## Citing MIRADOR

```bibtex
@misc{davis2026mirador,
  author = {Davis, Bee Rosa},
  title  = {The Geometry of the Cure: Geometric Therapeutic Optimization
            via the Davis Field Equations},
  year   = {2026},
  note   = {MIRADOR: Manifold-Informed Rational Architecture for
            Drug-Organism Response},
  howpublished = {\url{https://orcid.org/0009-0009-8034-4308}}
}
```

---

*MIRADOR is research software and an investigational modeling framework. It is
not a medical device, not clinical decision-making software, and not a
substitute for the judgment of a qualified clinician.*
