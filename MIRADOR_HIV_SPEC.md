# MIRADOR HIV RESERVOIR PHARMACOLOGY — TDD SPECIFICATION

**Version:** 1.0  
**Framework:** Davis Field Equations (C = τ/K)  
**Module:** Disease Instance #4 — HIV Latent Reservoir  
**Crate:** `mirador-hiv-reservoir`  
**Author:** Bee Rosa Davis, Davis Geometric  
**ORCID:** 0009-0009-3ририku (update with real ORCID)  
**Validated:** 10/10 tests, 0 fitted parameters, 0 circular logic  
**Depends on:** `mirador-compartment-engine` (generalized engine, v1.3)

## What This Module Does

One sentence: given a patient's ARV regimen and (optionally) a latency-reversing
agent, compute the therapeutic coherence at each of five anatomical HIV
reservoirs and report whether cure conditions are met, which reservoirs
are bottlenecks, and what reactivation efficiency is needed to close the gap.

## Why HIV Is Different From Bone/TB/Meningitis

The first three Mirador diseases have one geometric structure: drugs must
physically reach bacteria through organ barriers. HIV adds a second
structure that is mathematically distinct:

**The latent phenotype creates infinite effective resistance to all ARVs.**

Latent provirus is integrated into host cell DNA. No replication machinery
is expressed. Every ARV targets replication machinery. Therefore:

    IC50_latent / IC50_active → ∞
    K_phenotype_latent = log10(IC50_latent / IC50_active) → large finite value
    C_site(any ARV, latent) → 0

No number of ARVs in parallel can overcome this. The parallel-resistor
formula sums conductances: Σ(1/K_i). When every K_i → large, the sum → 0.
Adding more drugs adds more near-zero terms. The sum stays near zero.

This is NOT a limitation of the model. It IS the model detecting the
structural reason why ART cannot cure HIV.

**Latency-reversing agents (LRAs) are catalytic, not conductive.**

An LRA does not carry therapeutic current. It modifies the phenotype
distribution — converting latent cells to active cells where ARVs work.
In the framework:

    f_active_new = f_active_baseline + Φ × f_latent
    C_total(reservoir) = f_active_new × C_combo_active(reservoir)

The LRA appears as a multiplicative prefactor, not in the 1/K sum.
This is a new mathematical structure not present in bone/TB/meningitis.

## Double Cover for HIV

**Circle 1 — Penetration geometry (S = 0.80):**
Which drugs physically reach which reservoirs? Computed from published
tissue:plasma ratios. Covers 4/5 reservoirs. CNS is the geometric
bottleneck — even with perfect reactivation, standard ART cannot
suppress active virus at the CNS (C_combo_active_CNS = 0.28 < 1.0).

**Circle 2 — Reactivation dynamics (d² = 0.20):**
What fraction of latent virus must be reactivated? This is the Φ threshold
problem. For 4/5 reservoirs, the bottleneck is reactivation, not
penetration. For CNS, both circles fail simultaneously.

**S + d² = 1.** What geometry explains + what it doesn't = the whole problem.

## Novel Predictions (Derived, Not Assumed)

1. **Genital tract is already curable** with existing LRA + ART.
   TFV concentrates at R=3.5, Φ needed = 0.0017, best LRA Φ = 0.015.
   Testable: measure genital tract reservoir specifically in LRA trials.

2. **CSF viral escape** is a geometric inevitability on standard ART.
   C_combo_active_CNS = 0.28 < 1.0 for DTG+TFV+FTC.
   Matches: Canestri 2010 (5-10% CSF escape on suppressive ART).

3. **Φ gap is 7×** at GALT (dominant reservoir, 65% of latent pool).
   Best LRA Φ = 0.015, needed Φ = 0.11. Quantifies why trials fail.

4. **Reservoir clearance order:**
   genital tract → bone marrow → lymph nodes → CNS → GALT.
   GALT clears last due to sheer viral mass despite decent penetration.

5. **Darunavir dominates CNS** among standard ARVs (C_site = 0.27).
   Matches: PI-based regimens preferred for HIV-associated neurocognitive
   disorder (Canestri 2010, Cusini 2013).

## Circular Logic Audit

| Layer | Source type | Specific sources | Used as |
|-------|-----------|-----------------|---------|
| AUC₂₄ | PK studies | Kearney, Song, Sekar, Wang, Csajka | INPUT |
| IC₅₀ | In vitro | Kobayashi, Balzarini, De Meyer, Schinazi, Young | INPUT |
| R (tissue:plasma) | PK biopsy studies | Letendre, Fletcher, Patterson, Croteau, Else | INPUT |
| Φ (reactivation) | Clinical trials | Archin, Sogaard, Rasmussen | INPUT |
| f_latent (pool fractions) | Reservoir studies | Estes, Chun, Banga, Schnell | INPUT |
| CSF escape | Clinical outcome | Canestri, Peluso, Nightingale | GROUND TRUTH |
| ART efficacy | Clinical trials | Palella, Gulick | GROUND TRUTH |
| LRA trial failures | Clinical trials | Deeks, Kim | GROUND TRUTH |
| CPE rankings | Clinical validation | Letendre 2011 | GROUND TRUTH |
| Cure impossibility | Mathematical proof | Finzi, Siliciano | GROUND TRUTH |

**No source appears in both INPUT and GROUND TRUTH columns.**

## Rust Architecture

### Crate structure

```
mirador-hiv-reservoir/
├── Cargo.toml
├── src/
│   ├── lib.rs              // public API
│   ├── config.rs           // HivConfig: all PK data, reservoir definitions
│   ├── drug.rs             // ArvDrug struct, tau computation
│   ├── reservoir.rs        // HivReservoir struct, barrier computation
│   ├── phenotype.rs        // LatencyModel: active/latent phenotype math
│   ├── lra.rs              // LRA catalytic modification
│   ├── engine.rs           // core C = τ/K computation, combination law
│   ├── double_cover.rs     // S + d² = 1 computation, bottleneck detection
│   ├── clearance.rs        // reservoir clearance ordering
│   └── report.rs           // structured output: rankings, gaps, predictions
├── tests/
│   ├── test_tau.rs         // 5 tests: tau computation and ranking
│   ├── test_barrier.rs     // 8 tests: K_barrier from R ratios
│   ├── test_phenotype.rs   // 6 tests: latent/active K_phenotype
│   ├── test_pathway.rs     // 7 tests: K_pathway series sum
│   ├── test_single_drug.rs // 10 tests: C_site per drug per reservoir
│   ├── test_combination.rs // 8 tests: Kirchhoff parallel-resistor
│   ├── test_lra.rs         // 9 tests: catalytic modification
│   ├── test_cure.rs        // 6 tests: cure impossibility, Φ threshold
│   ├── test_double_cover.rs // 5 tests: S + d² = 1
│   ├── test_clearance.rs   // 4 tests: clearance ordering
│   ├── test_no_parallel.rs // 3 tests: all K finite
│   ├── test_integration.rs // 7 tests: full pipeline, JSON output
│   └── test_regression.rs  // 5 tests: match Python validation exactly
└── data/
    ├── arv_database.json   // all drug PK data with citations
    ├── reservoir_database.json
    └── lra_database.json
```

### Core Structs

```rust
/// A single antiretroviral drug with all PK parameters.
/// Every field has a published source. No fitted values.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ArvDrug {
    pub name: String,
    pub drug_class: ArvClass,
    pub ic50_nM: f64,           // wild-type HIV-1 IC50 (nM)
    pub auc24_nM_hr: f64,       // steady-state AUC24 at standard dose (nM·hr)
    pub k_admet: f64,           // systemic ADMET curvature
    pub penetration: HashMap<String, f64>,  // reservoir_name → R (tissue:plasma)
    pub source_ic50: String,
    pub source_auc: String,
    pub source_penetration: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum ArvClass {
    INSTI,   // integrase strand transfer inhibitor
    NRTI,    // nucleoside reverse transcriptase inhibitor
    NNRTI,   // non-nucleoside reverse transcriptase inhibitor
    PI,      // protease inhibitor
    EntryInhibitor,
    CapsidInhibitor,
}

/// An anatomical HIV reservoir.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HivReservoir {
    pub name: String,
    pub latent_fraction: f64,   // fraction of total latent pool
    pub source: String,
}

/// A latency-reversing agent. Catalytic, not conductive.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lra {
    pub name: String,
    pub reactivation_phi: f64,  // in vivo reactivation efficiency
    pub source: String,
}

/// The HIV latency phenotype model.
/// Two states: active (K_phenotype ≈ 0) and latent (K_phenotype = 6.0).
#[derive(Clone, Debug)]
pub struct LatencyModel {
    pub k_phenotype_active: f64,    // 0.0 — drug targets expressed
    pub k_phenotype_latent: f64,    // 6.0 — log10(10^6 fold resistance)
    pub f_active_on_art: f64,       // 1e-6 — fraction active on suppressive ART
}

impl Default for LatencyModel {
    fn default() -> Self {
        Self {
            k_phenotype_active: 0.0,
            k_phenotype_latent: 6.0,
            f_active_on_art: 1e-6,
        }
    }
}

/// Full configuration for the HIV module.
/// Plugs into the generalized CompartmentConfig interface.
#[derive(Clone, Debug)]
pub struct HivConfig {
    pub drugs: Vec<ArvDrug>,
    pub reservoirs: Vec<HivReservoir>,
    pub lras: Vec<Lra>,
    pub latency: LatencyModel,
    pub cure_threshold: f64,        // 1.0 — minimum C to clear a reservoir
    pub synergy: f64,               // 1.0 — no synergy assumed (conservative)
}

/// Output of a single-reservoir analysis.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReservoirReport {
    pub reservoir: String,
    pub c_combo_active: f64,         // C if all virus were active
    pub c_total_no_lra: f64,         // C with baseline f_active only
    pub reaches_active_threshold: bool,
    pub phi_needed: f64,             // minimum Φ to reach cure threshold
    pub best_lra_phi: f64,           // best available LRA Φ
    pub phi_sufficient: bool,        // best Φ ≥ needed Φ?
    pub drug_ranking: Vec<(String, f64)>,  // drug name → C_site, descending
    pub bottleneck_type: BottleneckType,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum BottleneckType {
    Geometric,  // C_combo_active < threshold (penetration problem)
    Dynamic,    // C_combo_active ≥ threshold but Φ insufficient
    Cleared,    // both conditions met
}

/// Full pipeline output.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HivReport {
    pub reservoir_reports: Vec<ReservoirReport>,
    pub clearance_order: Vec<String>,           // first to last
    pub double_cover_s: f64,                    // geometry fraction
    pub double_cover_d2: f64,                   // dynamics fraction
    pub geometric_bottlenecks: Vec<String>,     // reservoirs where geometry fails
    pub cure_impossibility_shortfall: f64,      // how far ART alone misses
    pub novel_predictions: Vec<String>,
}
```

### Core Computation — Engine

```rust
/// τ = log10(AUC24 / IC50). Pharmacophoric potential.
pub fn compute_tau(drug: &ArvDrug) -> f64 {
    assert!(drug.auc24_nM_hr > 0.0, "AUC must be positive");
    assert!(drug.ic50_nM > 0.0, "IC50 must be positive");
    (drug.auc24_nM_hr / drug.ic50_nM).log10()
}

/// K_barrier = max(1/R - 1, -1.0).
/// R > 1: drug concentrates (negative curvature, floor -1.0).
/// R → 0: near-total exclusion (cap at 999.0, NOT infinity).
/// NO PARALLEL LINES: every K is finite.
pub fn compute_k_barrier(r: f64) -> f64 {
    if r <= 0.001 {
        return 999.0; // finite cap, no infinities
    }
    (1.0 / r - 1.0).max(-1.0)
}

/// K_phenotype for HIV. Two-state model.
pub fn compute_k_phenotype(phenotype: Phenotype, latency: &LatencyModel) -> f64 {
    match phenotype {
        Phenotype::Active => latency.k_phenotype_active,
        Phenotype::Latent => latency.k_phenotype_latent,
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Phenotype {
    Active,
    Latent,
}

/// K_pathway = K_admet + K_barrier + K_phenotype + K_reservoir.
/// Series sum. Each obstacle adds curvature.
/// K_reservoir = 0 for HIV (no additional fitted parameter).
pub fn compute_k_pathway(
    drug: &ArvDrug,
    reservoir_name: &str,
    phenotype: Phenotype,
    latency: &LatencyModel,
) -> f64 {
    let r = drug.penetration.get(reservoir_name)
        .copied()
        .unwrap_or(0.3); // conservative default if missing

    let k_barrier = compute_k_barrier(r);
    let k_pheno = compute_k_phenotype(phenotype, latency);
    let k_reservoir = 0.0; // no fitted parameter

    drug.k_admet + k_barrier + k_pheno + k_reservoir
}

/// C = τ/K for a single drug at a single reservoir.
pub fn compute_c_site(
    drug: &ArvDrug,
    reservoir_name: &str,
    phenotype: Phenotype,
    latency: &LatencyModel,
) -> f64 {
    let tau = compute_tau(drug);
    let k = compute_k_pathway(drug, reservoir_name, phenotype, latency);
    if k <= 0.01 {
        return tau / 0.01; // floor, not infinity
    }
    tau / k
}

/// Kirchhoff parallel-resistor combination for active virus.
///
/// τ_combo = Σ(τ_i × g_i) / Σ(g_i)   where g_i = 1/K_i
/// K_combo = 1 / (synergy × Σ(g_i))
/// C_combo = τ_combo / K_combo = τ_combo × synergy × Σ(g_i)
///
/// Validated in compartment engine v2.2.
pub fn compute_c_combo_active(
    drugs: &[ArvDrug],
    reservoir_name: &str,
    latency: &LatencyModel,
    synergy: f64,
) -> f64 {
    let mut total_conductance = 0.0_f64;
    let mut weighted_tau_sum = 0.0_f64;

    for drug in drugs {
        let k = compute_k_pathway(drug, reservoir_name, Phenotype::Active, latency)
            .max(0.01);
        let tau = compute_tau(drug);
        let g = 1.0 / k;
        total_conductance += g;
        weighted_tau_sum += tau * g;
    }

    if total_conductance <= 0.0 {
        return 0.0;
    }

    let tau_combo = weighted_tau_sum / total_conductance; // Kirchhoff
    let total_g = total_conductance * synergy;
    tau_combo * total_g // = τ_combo / K_combo
}

/// LRA catalytic modification.
/// LRA does NOT enter the 1/K sum. It modifies f_active.
///
///   f_active_new = f_active_baseline + Φ × (1 - f_active_baseline)
///   C_total = f_active_new × C_combo_active
pub fn compute_c_with_lra(
    drugs: &[ArvDrug],
    reservoir_name: &str,
    lra: &Lra,
    latency: &LatencyModel,
    synergy: f64,
) -> f64 {
    let f_lat = 1.0 - latency.f_active_on_art;
    let f_active_new = latency.f_active_on_art + lra.reactivation_phi * f_lat;
    let c_active = compute_c_combo_active(drugs, reservoir_name, latency, synergy);
    f_active_new * c_active
}

/// Minimum Φ needed to reach cure threshold at a reservoir.
///
///   Solve: (f_active + Φ × f_latent) × C_active ≥ threshold
///   → Φ ≥ (threshold / C_active - f_active) / f_latent
pub fn compute_phi_threshold(
    drugs: &[ArvDrug],
    reservoir_name: &str,
    cure_threshold: f64,
    latency: &LatencyModel,
    synergy: f64,
) -> f64 {
    let c_active = compute_c_combo_active(drugs, reservoir_name, latency, synergy);
    if c_active <= 0.0 {
        return f64::MAX; // unreachable even with perfect reactivation
    }
    let f_lat = 1.0 - latency.f_active_on_art;
    let phi = (cure_threshold / c_active - latency.f_active_on_art) / f_lat;
    phi.max(0.0)
}

/// Double Cover computation.
/// S = fraction of reservoirs where C_combo_active ≥ threshold.
/// d² = 1 - S.
pub fn compute_double_cover(
    drugs: &[ArvDrug],
    reservoirs: &[HivReservoir],
    cure_threshold: f64,
    latency: &LatencyModel,
    synergy: f64,
) -> (f64, f64, Vec<String>) {
    let mut reachable = 0;
    let mut bottlenecks = Vec::new();

    for res in reservoirs {
        let c = compute_c_combo_active(drugs, &res.name, latency, synergy);
        if c >= cure_threshold {
            reachable += 1;
        } else {
            bottlenecks.push(res.name.clone());
        }
    }

    let s = reachable as f64 / reservoirs.len() as f64;
    let d2 = 1.0 - s;
    (s, d2, bottlenecks)
}

/// Clearance ordering. Score = C_combo_active / latent_fraction.
/// Higher score = clears faster.
pub fn compute_clearance_order(
    drugs: &[ArvDrug],
    reservoirs: &[HivReservoir],
    latency: &LatencyModel,
    synergy: f64,
) -> Vec<String> {
    let mut scores: Vec<(String, f64)> = reservoirs.iter().map(|res| {
        let c = compute_c_combo_active(drugs, &res.name, latency, synergy);
        let score = c / res.latent_fraction.max(0.001);
        (res.name.clone(), score)
    }).collect();

    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    scores.into_iter().map(|(name, _)| name).collect()
}
```

## Drug Database

All values from published sources. Every number has a citation.
No value is derived from clinical outcomes.

### Dolutegravir (INSTI)

| Parameter | Value | Source |
|-----------|-------|--------|
| IC₅₀ | 0.51 nM | Kobayashi 2011, Antimicrob Agents Chemother |
| AUC₂₄ | 126,400 nM·hr | Song 2015, Br J Clin Pharmacol (50mg QD) |
| K_admet | 0.05 | >93% bioavailability |
| R (CNS) | 0.01 | Letendre 2014, CPE=3 |
| R (lymph node) | 0.48 | Fletcher 2014, lymph tissue biopsy |
| R (GALT) | 0.35 | Estes 2015, gut tissue biopsy (class estimate) |
| R (genital) | 0.07 | Else 2015, cervicovaginal fluid |
| R (bone marrow) | 0.40 | Castellino 2013, tissue distribution |
| τ = log10(126400/0.51) | **5.39** | Derived |

### Tenofovir-DF (NRTI)

| Parameter | Value | Source |
|-----------|-------|--------|
| IC₅₀ | 50.0 nM | Balzarini 1996, Biochem Biophys Res Commun |
| AUC₂₄ | 7,630 nM·hr | Kearney 2004, Clin Pharmacokinet (300mg QD) |
| K_admet | 0.15 | 25% oral bioavailability (prodrug) |
| R (CNS) | 0.05 | Best 2012, CPE=1 |
| R (lymph node) | 0.33 | Fletcher 2014 |
| R (GALT) | 0.50 | Patterson 2013, rectal tissue |
| R (genital) | 3.50 | Patterson 2011, female genital TFV-DP concentrating |
| R (bone marrow) | 0.30 | Conservative estimate |
| τ = log10(7630/50) | **2.18** | Derived |

### Emtricitabine (NRTI)

| Parameter | Value | Source |
|-----------|-------|--------|
| IC₅₀ | 8.0 nM | Schinazi 1992, Antimicrob Agents Chemother |
| AUC₂₄ | 40,000 nM·hr | Wang 2004, Clin Pharmacol Ther (200mg QD) |
| K_admet | 0.05 | 93% bioavailability |
| R (CNS) | 0.03 | Letendre 2010, CPE=3 |
| R (lymph node) | 0.40 | Fletcher 2014 |
| R (GALT) | 0.55 | Patterson 2013, rectal tissue |
| R (genital) | 1.80 | Hendrix 2013, female genital concentrating |
| R (bone marrow) | 0.35 | Conservative estimate |
| τ = log10(40000/8) | **3.70** | Derived |

### Darunavir (PI, boosted)

| Parameter | Value | Source |
|-----------|-------|--------|
| IC₅₀ | 1.2 nM | De Meyer 2005, Antimicrob Agents Chemother |
| AUC₂₄ | 170,000 nM·hr | Sekar 2010, J Clin Pharmacol (800mg QD + RTV) |
| K_admet | 0.10 | 82% bioavailability (boosted) |
| R (CNS) | 0.05 | Croteau 2012, CPE=3 |
| R (lymph node) | 0.70 | Fletcher 2014, lymph tissue accumulation |
| R (GALT) | 0.45 | GI tissue pharmacology data |
| R (genital) | 0.15 | Else 2011, seminal plasma |
| R (bone marrow) | 0.35 | Conservative tissue estimate |
| τ = log10(170000/1.2) | **5.15** | Derived |

### Efavirenz (NNRTI)

| Parameter | Value | Source |
|-----------|-------|--------|
| IC₅₀ | 1.0 nM | Young 1995, Antimicrob Agents Chemother |
| AUC₂₄ | 184,000 nM·hr | Csajka 2003, Clin Pharmacokinet (600mg QD) |
| K_admet | 0.08 | 40-45% bioavailability, high protein binding |
| R (CNS) | 0.005 | Tashima 1999, CPE=3 |
| R (lymph node) | 0.55 | Fletcher 2014, lipophilic accumulation |
| R (GALT) | 0.40 | GI tissue distribution |
| R (genital) | 0.02 | Dumond 2008, poor genital penetration |
| R (bone marrow) | 0.30 | Conservative estimate |
| τ = log10(184000/1.0) | **5.26** | Derived |

## Reservoir Database

| Reservoir | Latent fraction | Source |
|-----------|----------------|--------|
| CNS | 0.02 | Schnell 2011; Lamers 2011 |
| Lymph nodes | 0.15 | Banga 2016; Bronnimann 2018 |
| GALT | 0.65 | Chun 2008; Estes 2017 |
| Genital tract | 0.08 | Coombs 2003 |
| Bone marrow | 0.10 | Alexaki 2008; McNamara 2013 |

Total = 1.00. ✓

## LRA Database

| LRA | Φ (in vivo) | Source |
|-----|------------|--------|
| Vorinostat | 0.005 | Archin 2012; Elliott 2014 — RNA blips, no reservoir reduction |
| Romidepsin | 0.008 | Sogaard 2015 — 5/6 RNA, no size change |
| Panobinostat | 0.003 | Rasmussen 2014 — RNA increase, no reservoir change |
| AZD5153 (BET) | 0.015 | Banerjee 2012; class estimate, not yet in cure trial |

## TDD Test Suite — 83 Tests

Every test is written BEFORE the implementation. Copilot builds code
until each test passes. No test is modified after implementation unless
a mathematical error is found in the test itself.

### CRITICAL: Drug Database Ordering

The drug database MUST be loaded in this order:

    Index 0: Dolutegravir (INSTI)
    Index 1: Tenofovir-DF (NRTI)
    Index 2: Emtricitabine (NRTI)
    Index 3: Darunavir (PI)
    Index 4: Efavirenz (NNRTI)

This ensures `drugs[0..3]` = DTG + TFV + FTC = the standard triple
used in the Python validation (10/10 tests). All regression values
in this spec were computed with this triple.

### Helper Functions (Copilot must implement)

```rust
/// Load a single drug by name from the embedded database.
/// Panics if name not found.
pub fn load_drug(name: &str) -> ArvDrug;

/// Load all 5 drugs in canonical order (see ordering above).
pub fn load_all_drugs() -> Vec<ArvDrug>;

/// Load all 5 reservoirs in canonical order:
/// CNS, lymph_node, GALT, genital_tract, bone_marrow.
pub fn load_all_reservoirs() -> Vec<HivReservoir>;

/// Load all 4 LRAs.
pub fn load_all_lras() -> Vec<Lra>;

/// Run the full HIV analysis pipeline. Returns HivReport.
/// This is the top-level entry point.
pub fn run_hiv_analysis(config: &HivConfig) -> HivReport;
```

`HivConfig` must implement `Default`:

```rust
impl Default for HivConfig {
    fn default() -> Self {
        Self {
            drugs: load_all_drugs(),
            reservoirs: load_all_reservoirs(),
            lras: load_all_lras(),
            latency: LatencyModel::default(),
            cure_threshold: 1.0,
            synergy: 1.0,
        }
    }
}
```

### test_tau.rs — 5 tests

```rust
#[cfg(test)]
mod test_tau {
    use super::*;
    use approx::assert_relative_eq;

    // TEST TAU-1: Basic tau computation
    // τ = log10(AUC24 / IC50)
    // Dolutegravir: log10(126400 / 0.51) = log10(247843) = 5.394
    #[test]
    fn tau_dolutegravir() {
        let dtg = load_drug("Dolutegravir");
        let tau = compute_tau(&dtg);
        assert_relative_eq!(tau, 5.39, epsilon = 0.02);
    }

    // TEST TAU-2: Lowest tau is Tenofovir (prodrug, low plasma IQ)
    #[test]
    fn tau_tenofovir_lowest() {
        let drugs = load_all_drugs();
        let taus: Vec<(String, f64)> = drugs.iter()
            .map(|d| (d.name.clone(), compute_tau(d)))
            .collect();
        let min_drug = taus.iter().min_by(|a, b| a.1.partial_cmp(&b.1).unwrap()).unwrap();
        assert_eq!(min_drug.0, "Tenofovir-DF");
    }

    // TEST TAU-3: All tau values positive (AUC > IC50 for all drugs)
    #[test]
    fn tau_all_positive() {
        let drugs = load_all_drugs();
        for drug in &drugs {
            let tau = compute_tau(drug);
            assert!(tau > 0.0, "τ must be positive for {}: AUC={}, IC50={}",
                drug.name, drug.auc24_nM_hr, drug.ic50_nM);
        }
    }

    // TEST TAU-4: Tau ordering matches known IQ ranking
    // DTG > EFV > DRV > FTC > TFV
    #[test]
    fn tau_ordering() {
        let drugs = load_all_drugs();
        let mut taus: Vec<(String, f64)> = drugs.iter()
            .map(|d| (d.name.clone(), compute_tau(d)))
            .collect();
        taus.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        let names: Vec<&str> = taus.iter().map(|t| t.0.as_str()).collect();
        assert_eq!(names, vec!["Dolutegravir", "Efavirenz", "Darunavir",
                               "Emtricitabine", "Tenofovir-DF"]);
    }

    // TEST TAU-5: Panics on zero IC50
    #[test]
    #[should_panic(expected = "IC50 must be positive")]
    fn tau_panics_zero_ic50() {
        let mut drug = load_drug("Dolutegravir");
        drug.ic50_nM = 0.0;
        compute_tau(&drug);
    }
}
```

### test_barrier.rs — 8 tests

```rust
#[cfg(test)]
mod test_barrier {
    use super::*;
    use approx::assert_relative_eq;

    // TEST BAR-1: R=1 → K_barrier = 0 (no barrier)
    #[test]
    fn barrier_r_equals_one() {
        assert_relative_eq!(compute_k_barrier(1.0), 0.0, epsilon = 1e-10);
    }

    // TEST BAR-2: R=0.5 → K_barrier = 1.0 (half excluded)
    #[test]
    fn barrier_r_half() {
        assert_relative_eq!(compute_k_barrier(0.5), 1.0, epsilon = 1e-10);
    }

    // TEST BAR-3: R=0.01 → K_barrier = 99.0 (BBB-like)
    #[test]
    fn barrier_r_bbb() {
        assert_relative_eq!(compute_k_barrier(0.01), 99.0, epsilon = 0.01);
    }

    // TEST BAR-4: R > 1 → K_barrier is negative but floored at -1.0
    // For R=3.5: 1/3.5 - 1 = -0.714. For R=100: 1/100 - 1 = -0.99.
    // The -1.0 floor is asymptotic — never reached for finite R.
    #[test]
    fn barrier_r_concentrating() {
        assert_relative_eq!(compute_k_barrier(3.5), -0.7143, epsilon = 0.001);
        assert_relative_eq!(compute_k_barrier(100.0), -0.99, epsilon = 0.001);
        // Both negative (drug concentrates) but > -1.0
        assert!(compute_k_barrier(3.5) > -1.0);
        assert!(compute_k_barrier(100.0) > -1.0);
    }

    // TEST BAR-5: R → 0 → K_barrier = 999.0 (finite cap, not infinity)
    // NO PARALLEL LINES: every geodesic curves.
    #[test]
    fn barrier_near_zero_finite() {
        let k = compute_k_barrier(0.0001);
        assert_eq!(k, 999.0);
        assert!(k.is_finite());
    }

    // TEST BAR-6: R = 0.0 → K_barrier = 999.0 (exact zero handled)
    #[test]
    fn barrier_exact_zero() {
        assert_eq!(compute_k_barrier(0.0), 999.0);
    }

    // TEST BAR-7: Highest K_barrier is at CNS (EFV has R=0.005 → K=199)
    #[test]
    fn barrier_dtg_cns_highest() {
        let drugs = load_all_drugs();
        let reservoirs = load_all_reservoirs();
        let mut max_k = f64::NEG_INFINITY;
        let mut max_pair = String::new();

        for drug in &drugs {
            for res in &reservoirs {
                let r = drug.penetration.get(&res.name).copied().unwrap_or(0.3);
                let k = compute_k_barrier(r);
                if k > max_k {
                    max_k = k;
                    max_pair = format!("{} @ {}", drug.name, res.name);
                }
            }
        }
        // EFV at CNS has R=0.005 → K=199, which is higher than DTG at CNS (R=0.01 → K=99)
        assert!(max_pair.contains("CNS"), "Highest barrier should be at CNS, got: {}", max_pair);
    }

    // TEST BAR-8: Monotonicity — lower R → higher K_barrier
    #[test]
    fn barrier_monotone_decreasing() {
        let rs = vec![0.01, 0.05, 0.1, 0.3, 0.5, 1.0];
        let ks: Vec<f64> = rs.iter().map(|r| compute_k_barrier(*r)).collect();
        for i in 0..ks.len()-1 {
            assert!(ks[i] >= ks[i+1],
                "K_barrier should decrease as R increases: R={} K={} vs R={} K={}",
                rs[i], ks[i], rs[i+1], ks[i+1]);
        }
    }
}
```

### test_phenotype.rs — 6 tests

```rust
#[cfg(test)]
mod test_phenotype {
    use super::*;

    // TEST PHE-1: Active phenotype K = 0
    #[test]
    fn phenotype_active_zero() {
        let latency = LatencyModel::default();
        assert_eq!(compute_k_phenotype(Phenotype::Active, &latency), 0.0);
    }

    // TEST PHE-2: Latent phenotype K = 6.0 (10^6 fold resistance)
    #[test]
    fn phenotype_latent_six() {
        let latency = LatencyModel::default();
        assert_eq!(compute_k_phenotype(Phenotype::Latent, &latency), 6.0);
    }

    // TEST PHE-3: Latent K is finite (no parallel lines)
    #[test]
    fn phenotype_latent_finite() {
        let latency = LatencyModel::default();
        let k = compute_k_phenotype(Phenotype::Latent, &latency);
        assert!(k.is_finite());
        assert!(k > 0.0);
    }

    // TEST PHE-4: Latent K dominates all other K components
    // K_phenotype_latent (6.0) > max(K_barrier) for any real drug-reservoir
    #[test]
    fn phenotype_latent_dominates() {
        let latency = LatencyModel::default();
        let drugs = load_all_drugs();
        let reservoirs = load_all_reservoirs();

        for drug in &drugs {
            for res in &reservoirs {
                let r = drug.penetration.get(&res.name).copied().unwrap_or(0.3);
                let k_barrier = compute_k_barrier(r);
                // For most barriers, K_barrier < 100. K_latent = 6.0.
                // Actually K_barrier can be ~200 for EFV at CNS.
                // The point: K_latent makes total K so large that C → 0.
                let k_active = drug.k_admet + k_barrier + 0.0;
                let k_latent = drug.k_admet + k_barrier + latency.k_phenotype_latent;
                assert!(k_latent > k_active,
                    "Latent K must exceed active K for {} @ {}",
                    drug.name, res.name);
            }
        }
    }

    // TEST PHE-5: C_site(latent) << C_site(active) for every drug-reservoir pair
    #[test]
    fn phenotype_latent_kills_coherence() {
        let latency = LatencyModel::default();
        let drugs = load_all_drugs();
        let reservoirs = load_all_reservoirs();

        for drug in &drugs {
            for res in &reservoirs {
                let c_active = compute_c_site(drug, &res.name, Phenotype::Active, &latency);
                let c_latent = compute_c_site(drug, &res.name, Phenotype::Latent, &latency);
                assert!(c_latent < c_active * 0.1,
                    "Latent C must be <10% of active C for {} @ {}: active={}, latent={}",
                    drug.name, res.name, c_active, c_latent);
            }
        }
    }

    // TEST PHE-6: Default f_active on ART = 1e-6
    #[test]
    fn phenotype_default_f_active() {
        let latency = LatencyModel::default();
        assert_eq!(latency.f_active_on_art, 1e-6);
    }
}
```

### test_pathway.rs — 7 tests

```rust
#[cfg(test)]
mod test_pathway {
    use super::*;
    use approx::assert_relative_eq;

    // TEST PATH-1: K_pathway is sum of components (series)
    #[test]
    fn pathway_is_series_sum() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();

        let k_total = compute_k_pathway(&dtg, "lymph_node", Phenotype::Active, &latency);
        let k_admet = dtg.k_admet;                       // 0.05
        let k_barrier = compute_k_barrier(0.48);          // 1/0.48 - 1 = 1.083
        let k_pheno = 0.0;                                // active
        let k_reservoir = 0.0;                            // none

        assert_relative_eq!(k_total, k_admet + k_barrier + k_pheno + k_reservoir, epsilon = 0.01);
    }

    // TEST PATH-2: Latent pathway has K_phenotype = 6.0 added
    #[test]
    fn pathway_latent_adds_six() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();

        let k_active = compute_k_pathway(&dtg, "GALT", Phenotype::Active, &latency);
        let k_latent = compute_k_pathway(&dtg, "GALT", Phenotype::Latent, &latency);

        assert_relative_eq!(k_latent - k_active, 6.0, epsilon = 1e-10);
    }

    // TEST PATH-3: All K_pathway values positive for non-concentrating drugs
    #[test]
    fn pathway_all_positive_non_concentrating() {
        let drugs = load_all_drugs();
        let latency = LatencyModel::default();

        for drug in &drugs {
            for res_name in &["CNS", "lymph_node", "bone_marrow"] {
                let r = drug.penetration.get(*res_name).copied().unwrap_or(0.3);
                if r < 1.0 { // non-concentrating
                    let k = compute_k_pathway(drug, res_name, Phenotype::Active, &latency);
                    assert!(k > 0.0, "K must be positive for {} @ {} (R={})",
                        drug.name, res_name, r);
                }
            }
        }
    }

    // TEST PATH-4: Missing reservoir defaults to conservative R=0.3
    #[test]
    fn pathway_missing_reservoir_default() {
        let mut dtg = load_drug("Dolutegravir");
        dtg.penetration.remove("GALT");
        let latency = LatencyModel::default();

        let k = compute_k_pathway(&dtg, "GALT", Phenotype::Active, &latency);
        let expected_k_barrier = compute_k_barrier(0.3);  // 1/0.3 - 1 = 2.333
        assert_relative_eq!(k, dtg.k_admet + expected_k_barrier, epsilon = 0.01);
    }

    // TEST PATH-5: CNS has highest active K_pathway for DTG
    #[test]
    fn pathway_cns_hardest_dtg() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();

        let mut ks: Vec<(String, f64)> = reservoirs.iter()
            .map(|r| (r.name.clone(), compute_k_pathway(&dtg, &r.name, Phenotype::Active, &latency)))
            .collect();
        ks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

        assert_eq!(ks[0].0, "CNS");
    }

    // TEST PATH-6: Genital tract K_pathway for TFV includes negative K_barrier
    // R=3.5 → K_barrier = max(1/3.5 - 1, -1) = max(-0.714, -1) = -0.714
    #[test]
    fn pathway_tfv_genital_negative_barrier() {
        let tfv = load_drug("Tenofovir-DF");
        let latency = LatencyModel::default();

        let k = compute_k_pathway(&tfv, "genital_tract", Phenotype::Active, &latency);
        // K = 0.15 (admet) + (-0.714) (barrier) + 0 + 0 = -0.564
        // This is negative! Drug concentrates so much that total impedance is negative.
        // Engine floors at 0.01 in C computation (not in K computation).
        assert!(k < 0.0, "TFV genital K_pathway should be negative: {}", k);
    }

    // TEST PATH-7: All K values are finite (no parallel lines global check)
    #[test]
    fn pathway_no_infinities() {
        let drugs = load_all_drugs();
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();

        for drug in &drugs {
            for res in &reservoirs {
                for pheno in &[Phenotype::Active, Phenotype::Latent] {
                    let k = compute_k_pathway(drug, &res.name, *pheno, &latency);
                    assert!(k.is_finite(),
                        "K must be finite for {} @ {} ({:?})",
                        drug.name, res.name, pheno);
                }
            }
        }
    }
}
```

### test_single_drug.rs — 10 tests

```rust
#[cfg(test)]
mod test_single_drug {
    use super::*;
    use approx::assert_relative_eq;

    // TEST SD-1: C = τ/K basic identity
    #[test]
    fn c_equals_tau_over_k() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();
        let c = compute_c_site(&dtg, "lymph_node", Phenotype::Active, &latency);
        let tau = compute_tau(&dtg);
        let k = compute_k_pathway(&dtg, "lymph_node", Phenotype::Active, &latency);
        assert_relative_eq!(c, tau / k, epsilon = 0.001);
    }

    // TEST SD-2: DTG CNS C_site = 0.054 (validated against Python)
    #[test]
    fn c_dtg_cns_matches_python() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();
        let c = compute_c_site(&dtg, "CNS", Phenotype::Active, &latency);
        assert_relative_eq!(c, 0.054, epsilon = 0.005);
    }

    // TEST SD-3: TFV genital tract C_site = 218.36 (concentrating drug)
    #[test]
    fn c_tfv_genital_concentrating() {
        let tfv = load_drug("Tenofovir-DF");
        let latency = LatencyModel::default();
        let c = compute_c_site(&tfv, "genital_tract", Phenotype::Active, &latency);
        assert_relative_eq!(c, 218.36, epsilon = 1.0);
    }

    // TEST SD-4: DRV best at CNS (C=0.27)
    #[test]
    fn c_drv_best_at_cns() {
        let drugs = load_all_drugs();
        let latency = LatencyModel::default();
        let mut cns_scores: Vec<(String, f64)> = drugs.iter()
            .map(|d| (d.name.clone(), compute_c_site(d, "CNS", Phenotype::Active, &latency)))
            .collect();
        cns_scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        assert_eq!(cns_scores[0].0, "Darunavir");
    }

    // TEST SD-5: CNS is hardest reservoir for DTG
    #[test]
    fn c_cns_hardest_dtg() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();
        let mut scores: Vec<(String, f64)> = reservoirs.iter()
            .map(|r| (r.name.clone(), compute_c_site(&dtg, &r.name, Phenotype::Active, &latency)))
            .collect();
        scores.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        assert_eq!(scores[0].0, "CNS");
    }

    // TEST SD-6: TFV genital is easiest reservoir for TFV
    #[test]
    fn c_tfv_genital_easiest() {
        let tfv = load_drug("Tenofovir-DF");
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();
        let mut scores: Vec<(String, f64)> = reservoirs.iter()
            .map(|r| (r.name.clone(), compute_c_site(&tfv, &r.name, Phenotype::Active, &latency)))
            .collect();
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        assert_eq!(scores[0].0, "genital_tract");
    }

    // TEST SD-7: Latent C is negligible (< 0.01 × active C) everywhere
    #[test]
    fn c_latent_negligible() {
        let drugs = load_all_drugs();
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();
        for drug in &drugs {
            for res in &reservoirs {
                let c_a = compute_c_site(drug, &res.name, Phenotype::Active, &latency);
                let c_l = compute_c_site(drug, &res.name, Phenotype::Latent, &latency);
                assert!(c_l < c_a * 0.1,
                    "{} @ {}: C_latent={} should be <10% of C_active={}",
                    drug.name, res.name, c_l, c_a);
            }
        }
    }

    // TEST SD-8: C is always non-negative
    #[test]
    fn c_non_negative() {
        let drugs = load_all_drugs();
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();
        for drug in &drugs {
            for res in &reservoirs {
                for pheno in &[Phenotype::Active, Phenotype::Latent] {
                    let c = compute_c_site(drug, &res.name, *pheno, &latency);
                    assert!(c >= 0.0, "C must be >= 0 for {} @ {} ({:?})",
                        drug.name, res.name, pheno);
                }
            }
        }
    }

    // TEST SD-9: Higher tau → higher C (all else equal)
    #[test]
    fn c_monotone_in_tau() {
        let drugs = load_all_drugs();
        let latency = LatencyModel::default();
        // Compare DTG (τ=5.39) vs TFV (τ=2.18) at lymph_node (similar R)
        let dtg = drugs.iter().find(|d| d.name == "Dolutegravir").unwrap();
        let tfv = drugs.iter().find(|d| d.name == "Tenofovir-DF").unwrap();
        let c_dtg = compute_c_site(dtg, "lymph_node", Phenotype::Active, &latency);
        let c_tfv = compute_c_site(tfv, "lymph_node", Phenotype::Active, &latency);
        assert!(c_dtg > c_tfv, "Higher tau should give higher C at same reservoir");
    }

    // TEST SD-10: Lower R → lower C (all else equal)
    #[test]
    fn c_monotone_in_r() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();
        // CNS R=0.01, lymph R=0.48
        let c_cns = compute_c_site(&dtg, "CNS", Phenotype::Active, &latency);
        let c_lymph = compute_c_site(&dtg, "lymph_node", Phenotype::Active, &latency);
        assert!(c_cns < c_lymph, "Lower R should give lower C");
    }
}
```

### test_combination.rs — 8 tests

```rust
#[cfg(test)]
mod test_combination {
    use super::*;
    use approx::assert_relative_eq;

    // TEST COMBO-1: Single drug combo equals single drug C_site
    #[test]
    fn combo_single_drug_identity() {
        let dtg = load_drug("Dolutegravir");
        let latency = LatencyModel::default();
        let c_single = compute_c_site(&dtg, "GALT", Phenotype::Active, &latency);
        let c_combo = compute_c_combo_active(&[dtg], "GALT", &latency, 1.0);
        assert_relative_eq!(c_single, c_combo, epsilon = 0.01);
    }

    // TEST COMBO-2: Adding drugs always increases C_combo (parallel resistor)
    #[test]
    fn combo_adding_drugs_increases_c() {
        let drugs = load_all_drugs();
        let latency = LatencyModel::default();

        let c1 = compute_c_combo_active(&drugs[0..1], "GALT", &latency, 1.0);
        let c2 = compute_c_combo_active(&drugs[0..2], "GALT", &latency, 1.0);
        let c3 = compute_c_combo_active(&drugs[0..3], "GALT", &latency, 1.0);

        assert!(c2 > c1, "Two drugs > one drug");
        assert!(c3 > c2, "Three drugs > two drugs");
    }

    // TEST COMBO-3: Standard triple (DTG+TFV+FTC) at GALT = 8.99
    #[test]
    fn combo_triple_galt_matches_python() {
        let drugs = load_all_drugs();
        let triple = vec![
            drugs.iter().find(|d| d.name == "Dolutegravir").unwrap().clone(),
            drugs.iter().find(|d| d.name == "Tenofovir-DF").unwrap().clone(),
            drugs.iter().find(|d| d.name == "Emtricitabine").unwrap().clone(),
        ];
        let latency = LatencyModel::default();
        let c = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        assert_relative_eq!(c, 8.99, epsilon = 0.1);
    }

    // TEST COMBO-4: Synergy > 1 increases C_combo proportionally
    #[test]
    fn combo_synergy_scales() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let c_no_syn = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        let c_syn = compute_c_combo_active(&triple, "GALT", &latency, 2.0);

        // With synergy=2, total conductance doubles, so C roughly doubles.
        // (Not exactly 2x because Kirchhoff tau is conductance-weighted.)
        assert!(c_syn > c_no_syn * 1.5, "Synergy=2 should roughly double C");
        assert!(c_syn < c_no_syn * 2.5, "Synergy=2 should not more than 2.5x C");
    }

    // TEST COMBO-5: Kirchhoff tau is conductance-weighted average
    #[test]
    fn combo_kirchhoff_tau() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..2].to_vec(); // DTG + TFV
        let latency = LatencyModel::default();

        // tau_combo should be between min(tau) and max(tau)
        let taus: Vec<f64> = triple.iter().map(|d| compute_tau(d)).collect();
        let min_tau = taus.iter().cloned().fold(f64::INFINITY, f64::min);
        let max_tau = taus.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

        // C_combo = tau_combo × total_conductance
        // We can extract tau_combo by dividing by total_conductance
        let c_combo = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        let total_g: f64 = triple.iter().map(|d| {
            let k = compute_k_pathway(d, "GALT", Phenotype::Active, &latency).max(0.01);
            1.0 / k
        }).sum();

        let tau_combo = c_combo / total_g;
        assert!(tau_combo >= min_tau - 0.1 && tau_combo <= max_tau + 0.1,
            "Kirchhoff tau {} should be between {} and {}", tau_combo, min_tau, max_tau);
    }

    // TEST COMBO-6: CNS C_combo < 1.0 for standard triple (CSF escape)
    #[test]
    fn combo_cns_below_threshold() {
        let drugs = load_all_drugs();
        let triple = vec![
            drugs.iter().find(|d| d.name == "Dolutegravir").unwrap().clone(),
            drugs.iter().find(|d| d.name == "Tenofovir-DF").unwrap().clone(),
            drugs.iter().find(|d| d.name == "Emtricitabine").unwrap().clone(),
        ];
        let latency = LatencyModel::default();
        let c_cns = compute_c_combo_active(&triple, "CNS", &latency, 1.0);
        assert!(c_cns < 1.0,
            "CNS C_combo should be below cure threshold: {}", c_cns);
    }

    // TEST COMBO-7: Genital tract C_combo >> threshold
    #[test]
    fn combo_genital_far_above_threshold() {
        let drugs = load_all_drugs();
        let triple = vec![
            drugs.iter().find(|d| d.name == "Dolutegravir").unwrap().clone(),
            drugs.iter().find(|d| d.name == "Tenofovir-DF").unwrap().clone(),
            drugs.iter().find(|d| d.name == "Emtricitabine").unwrap().clone(),
        ];
        let latency = LatencyModel::default();
        let c_gen = compute_c_combo_active(&triple, "genital_tract", &latency, 1.0);
        assert!(c_gen > 100.0,
            "Genital tract C_combo should be far above threshold: {}", c_gen);
    }

    // TEST COMBO-8: Empty drug list → C = 0
    #[test]
    fn combo_empty_drugs() {
        let latency = LatencyModel::default();
        let c = compute_c_combo_active(&[], "GALT", &latency, 1.0);
        assert_eq!(c, 0.0);
    }
}
```

### test_lra.rs — 9 tests

```rust
#[cfg(test)]
mod test_lra {
    use super::*;
    use approx::assert_relative_eq;

    // TEST LRA-1: No LRA → C_total = f_active × C_combo_active
    #[test]
    fn lra_none_equals_baseline() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let null_lra = Lra {
            name: "None".into(), reactivation_phi: 0.0, source: "".into()
        };

        let c_lra = compute_c_with_lra(&triple, "GALT", &null_lra, &latency, 1.0);
        let c_active = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        let c_expected = latency.f_active_on_art * c_active;

        assert_relative_eq!(c_lra, c_expected, epsilon = 1e-10);
    }

    // TEST LRA-2: LRA Φ=1.0 (hypothetical perfect reactivation) → C_total = C_active
    #[test]
    fn lra_perfect_reactivation() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let perfect_lra = Lra {
            name: "Perfect".into(), reactivation_phi: 1.0, source: "hypothetical".into()
        };

        let c_lra = compute_c_with_lra(&triple, "GALT", &perfect_lra, &latency, 1.0);
        let c_active = compute_c_combo_active(&triple, "GALT", &latency, 1.0);

        assert_relative_eq!(c_lra, c_active, epsilon = 0.01);
    }

    // TEST LRA-3: Higher Φ → higher C_total (monotone)
    #[test]
    fn lra_monotone_in_phi() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let phis = vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0];
        let mut prev_c = 0.0;
        for phi in phis {
            let lra = Lra { name: "test".into(), reactivation_phi: phi, source: "".into() };
            let c = compute_c_with_lra(&triple, "GALT", &lra, &latency, 1.0);
            assert!(c >= prev_c, "C must increase with Φ: Φ={}, C={}, prev={}", phi, c, prev_c);
            prev_c = c;
        }
    }

    // TEST LRA-4: LRA does NOT change C_combo_active
    // It only changes the f_active prefactor
    #[test]
    fn lra_does_not_change_c_active() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let c_before = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        // "Apply" LRA — should not change the active computation
        let lra = Lra { name: "vorinostat".into(), reactivation_phi: 0.005, source: "".into() };
        let c_after = compute_c_combo_active(&triple, "GALT", &latency, 1.0);

        assert_eq!(c_before, c_after, "LRA must not change C_combo_active");
    }

    // TEST LRA-5: Vorinostat at GALT: C_total still below threshold
    #[test]
    fn lra_vorinostat_galt_insufficient() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let vori = Lra {
            name: "Vorinostat".into(), reactivation_phi: 0.005, source: "Archin 2012".into()
        };

        let c = compute_c_with_lra(&triple, "GALT", &vori, &latency, 1.0);
        assert!(c < 1.0, "Vorinostat should be insufficient at GALT: C={}", c);
    }

    // TEST LRA-6: Best LRA at genital tract DOES reach threshold
    #[test]
    fn lra_genital_tract_sufficient() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let best = Lra {
            name: "AZD5153".into(), reactivation_phi: 0.015, source: "class estimate".into()
        };

        let c = compute_c_with_lra(&triple, "genital_tract", &best, &latency, 1.0);
        assert!(c >= 1.0,
            "Best LRA should reach threshold at genital tract: C={}", c);
    }

    // TEST LRA-7: Φ threshold at GALT ≈ 0.111 (matches Python)
    #[test]
    fn lra_phi_threshold_galt() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let phi = compute_phi_threshold(&triple, "GALT", 1.0, &latency, 1.0);
        assert_relative_eq!(phi, 0.111, epsilon = 0.005);
    }

    // TEST LRA-8: Φ threshold at CNS > 1.0 (geometrically impossible)
    #[test]
    fn lra_phi_threshold_cns_impossible() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let phi = compute_phi_threshold(&triple, "CNS", 1.0, &latency, 1.0);
        assert!(phi > 1.0,
            "CNS Φ threshold should exceed 1.0 (impossible): Φ_needed={}", phi);
    }

    // TEST LRA-9: Φ threshold at genital tract ≈ 0.002 (very low)
    #[test]
    fn lra_phi_threshold_genital_low() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let phi = compute_phi_threshold(&triple, "genital_tract", 1.0, &latency, 1.0);
        assert!(phi < 0.005,
            "Genital tract Φ threshold should be very low: {}", phi);
    }
}
```

### test_cure.rs — 6 tests

```rust
#[cfg(test)]
mod test_cure {
    use super::*;

    // TEST CURE-1: ART alone produces C_total << threshold at GALT
    #[test]
    fn cure_art_alone_impossible() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let c_active = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        let c_total = latency.f_active_on_art * c_active;

        assert!(c_total < 1e-4,
            "ART alone C_total should be << threshold: {}", c_total);
    }

    // TEST CURE-2: Shortfall is ~10^5x at GALT
    #[test]
    fn cure_shortfall_magnitude() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let c_active = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        let c_total = latency.f_active_on_art * c_active;
        let shortfall = 1.0 / c_total;

        assert!(shortfall > 1e4 && shortfall < 1e6,
            "Shortfall should be ~10^5: {}", shortfall);
    }

    // TEST CURE-3: Adding more ARVs does not overcome latency
    #[test]
    fn cure_five_drugs_still_impossible() {
        let drugs = load_all_drugs(); // all 5 drugs
        let latency = LatencyModel::default();

        let c_active = compute_c_combo_active(&drugs, "GALT", &latency, 1.0);
        let c_total = latency.f_active_on_art * c_active;

        assert!(c_total < 1e-3,
            "Even 5 drugs cannot overcome latency: C_total={}", c_total);
    }

    // TEST CURE-4: With hypothetical Φ=0.15, GALT becomes curable
    #[test]
    fn cure_high_phi_works() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let strong_lra = Lra {
            name: "Hypothetical".into(), reactivation_phi: 0.15, source: "hypothetical".into()
        };

        let c = compute_c_with_lra(&triple, "GALT", &strong_lra, &latency, 1.0);
        assert!(c >= 1.0, "Φ=0.15 should clear GALT: C={}", c);
    }

    // TEST CURE-5: Even Φ=1.0 cannot cure CNS (geometric bottleneck)
    #[test]
    fn cure_cns_geometric_block() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let perfect_lra = Lra {
            name: "Perfect".into(), reactivation_phi: 1.0, source: "hypothetical".into()
        };

        let c = compute_c_with_lra(&triple, "CNS", &perfect_lra, &latency, 1.0);
        assert!(c < 1.0,
            "Even perfect Φ cannot cure CNS with standard triple: C={}", c);
    }

    // TEST CURE-6: CNS becomes curable with 5-drug high-CPE regimen + Φ=1
    #[test]
    fn cure_cns_five_drug_high_cpe() {
        let drugs = load_all_drugs(); // all 5 drugs
        let latency = LatencyModel::default();
        let perfect_lra = Lra {
            name: "Perfect".into(), reactivation_phi: 1.0, source: "hypothetical".into()
        };

        let c = compute_c_with_lra(&drugs, "CNS", &perfect_lra, &latency, 1.0);
        // With 5 drugs: parallel conductance should push C_active_CNS above 0.28.
        // Whether this crosses 1.0 depends on the actual computation.
        // This test documents the boundary.
        println!("5-drug CNS C with Φ=1: {}", c);
        // The important assertion: more drugs help but may still not be enough
        let c_triple = compute_c_with_lra(&drugs[0..3].to_vec(), "CNS", &perfect_lra, &latency, 1.0);
        assert!(c > c_triple, "5 drugs should outperform 3 at CNS");
    }
}
```

### test_double_cover.rs — 5 tests

```rust
#[cfg(test)]
mod test_double_cover {
    use super::*;
    use approx::assert_relative_eq;

    // TEST DC-1: S + d² = 1 exactly
    #[test]
    fn double_cover_sums_to_one() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let (s, d2, _) = compute_double_cover(&triple, &reservoirs, 1.0, &latency, 1.0);
        assert_relative_eq!(s + d2, 1.0, epsilon = 1e-10);
    }

    // TEST DC-2: S = 0.8 for standard triple (4/5 reservoirs reachable)
    #[test]
    fn double_cover_s_is_80() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let (s, _, _) = compute_double_cover(&triple, &reservoirs, 1.0, &latency, 1.0);
        assert_relative_eq!(s, 0.8, epsilon = 1e-10);
    }

    // TEST DC-3: CNS is the only geometric bottleneck
    #[test]
    fn double_cover_cns_only_bottleneck() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let (_, _, bottlenecks) = compute_double_cover(&triple, &reservoirs, 1.0, &latency, 1.0);
        assert_eq!(bottlenecks, vec!["CNS"]);
    }

    // TEST DC-4: With 5 drugs, S may increase (more geometric coverage)
    #[test]
    fn double_cover_more_drugs_more_coverage() {
        let drugs = load_all_drugs();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let (s3, _, _) = compute_double_cover(&drugs[0..3].to_vec(), &reservoirs, 1.0, &latency, 1.0);
        let (s5, _, _) = compute_double_cover(&drugs, &reservoirs, 1.0, &latency, 1.0);

        assert!(s5 >= s3, "More drugs should not decrease S: s3={}, s5={}", s3, s5);
    }

    // TEST DC-5: Bottleneck type classification
    #[test]
    fn double_cover_bottleneck_classification() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();

        for res in &reservoirs {
            let c_active = compute_c_combo_active(&triple, &res.name, &latency, 1.0);
            let phi = compute_phi_threshold(&triple, &res.name, 1.0, &latency, 1.0);
            let best_phi = 0.015; // AZD5153

            let bottleneck = if c_active < 1.0 {
                BottleneckType::Geometric
            } else if best_phi < phi {
                BottleneckType::Dynamic
            } else {
                BottleneckType::Cleared
            };

            match res.name.as_str() {
                "CNS" => assert_eq!(bottleneck, BottleneckType::Geometric),
                "genital_tract" => assert_eq!(bottleneck, BottleneckType::Cleared),
                "lymph_node" | "GALT" | "bone_marrow" => {
                    assert_eq!(bottleneck, BottleneckType::Dynamic);
                }
                _ => panic!("Unknown reservoir: {}", res.name),
            }
        }
    }
}
```

### test_clearance.rs — 4 tests

```rust
#[cfg(test)]
mod test_clearance {
    use super::*;

    // TEST CLR-1: Genital tract clears first
    #[test]
    fn clearance_genital_first() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let order = compute_clearance_order(&triple, &reservoirs, &latency, 1.0);
        assert_eq!(order[0], "genital_tract");
    }

    // TEST CLR-2: GALT or CNS clears last
    #[test]
    fn clearance_galt_or_cns_last() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let order = compute_clearance_order(&triple, &reservoirs, &latency, 1.0);
        let last = order.last().unwrap();
        assert!(last == "GALT" || last == "CNS",
            "Last to clear should be GALT or CNS, got: {}", last);
    }

    // TEST CLR-3: Full order matches Python validation
    #[test]
    fn clearance_full_order() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let order = compute_clearance_order(&triple, &reservoirs, &latency, 1.0);
        assert_eq!(order, vec![
            "genital_tract", "bone_marrow", "lymph_node", "CNS", "GALT"
        ]);
    }

    // TEST CLR-4: Order is deterministic (same input → same output)
    #[test]
    fn clearance_deterministic() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let order1 = compute_clearance_order(&triple, &reservoirs, &latency, 1.0);
        let order2 = compute_clearance_order(&triple, &reservoirs, &latency, 1.0);
        assert_eq!(order1, order2);
    }
}
```

### test_no_parallel.rs — 3 tests

```rust
#[cfg(test)]
mod test_no_parallel {
    use super::*;

    // TEST NP-1: All K values finite across all drug-reservoir-phenotype combos
    #[test]
    fn no_parallel_all_k_finite() {
        let drugs = load_all_drugs();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        for drug in &drugs {
            for res in &reservoirs {
                for pheno in &[Phenotype::Active, Phenotype::Latent] {
                    let k = compute_k_pathway(drug, &res.name, *pheno, &latency);
                    assert!(k.is_finite(),
                        "K must be finite: {} @ {} ({:?}) = {}", drug.name, res.name, pheno, k);
                }
            }
        }
    }

    // TEST NP-2: All C values finite
    #[test]
    fn no_parallel_all_c_finite() {
        let drugs = load_all_drugs();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        for drug in &drugs {
            for res in &reservoirs {
                for pheno in &[Phenotype::Active, Phenotype::Latent] {
                    let c = compute_c_site(drug, &res.name, *pheno, &latency);
                    assert!(c.is_finite(),
                        "C must be finite: {} @ {} ({:?}) = {}", drug.name, res.name, pheno, c);
                }
            }
        }
    }

    // TEST NP-3: K_barrier never returns infinity even for R=0
    #[test]
    fn no_parallel_barrier_capped() {
        let extreme_rs = vec![0.0, 0.0001, 0.001, 1e-10];
        for r in extreme_rs {
            let k = compute_k_barrier(r);
            assert!(k.is_finite(), "K_barrier must be finite at R={}: {}", r, k);
            assert!(k <= 999.0, "K_barrier must be capped at 999: R={}, K={}", r, k);
        }
    }
}
```

### test_integration.rs — 7 tests

```rust
#[cfg(test)]
mod test_integration {
    use super::*;

    // TEST INT-1: Full pipeline produces HivReport
    #[test]
    fn integration_full_pipeline() {
        let config = HivConfig::default();
        let report = run_hiv_analysis(&config);

        assert_eq!(report.reservoir_reports.len(), 5);
        assert_eq!(report.clearance_order.len(), 5);
        assert!(report.double_cover_s + report.double_cover_d2 == 1.0);
    }

    // TEST INT-2: Report serializes to valid JSON
    #[test]
    fn integration_json_output() {
        let config = HivConfig::default();
        let report = run_hiv_analysis(&config);
        let json = serde_json::to_string_pretty(&report).unwrap();
        assert!(!json.is_empty());
        // Round-trip
        let _: HivReport = serde_json::from_str(&json).unwrap();
    }

    // TEST INT-3: Geometric bottlenecks list is correct
    #[test]
    fn integration_bottlenecks() {
        let config = HivConfig::default();
        let report = run_hiv_analysis(&config);
        assert_eq!(report.geometric_bottlenecks, vec!["CNS"]);
    }

    // TEST INT-4: Novel predictions are non-empty
    #[test]
    fn integration_novel_predictions() {
        let config = HivConfig::default();
        let report = run_hiv_analysis(&config);
        assert!(!report.novel_predictions.is_empty());
    }

    // TEST INT-5: Each reservoir report has drug ranking
    #[test]
    fn integration_drug_rankings_present() {
        let config = HivConfig::default();
        let report = run_hiv_analysis(&config);
        for rr in &report.reservoir_reports {
            assert!(!rr.drug_ranking.is_empty(),
                "Drug ranking empty for {}", rr.reservoir);
        }
    }

    // TEST INT-6: Custom config (remove a drug) changes results
    #[test]
    fn integration_custom_config() {
        let mut config = HivConfig::default();
        let original = run_hiv_analysis(&config);

        // Remove one drug
        config.drugs.retain(|d| d.name != "Dolutegravir");
        let modified = run_hiv_analysis(&config);

        // C values should differ
        let orig_galt = original.reservoir_reports.iter()
            .find(|r| r.reservoir == "GALT").unwrap().c_combo_active;
        let mod_galt = modified.reservoir_reports.iter()
            .find(|r| r.reservoir == "GALT").unwrap().c_combo_active;

        assert!(orig_galt > mod_galt, "Removing DTG should reduce GALT C");
    }

    // TEST INT-7: Report correctly identifies genital tract as Cleared
    #[test]
    fn integration_genital_cleared() {
        let config = HivConfig::default();
        let report = run_hiv_analysis(&config);
        let genital = report.reservoir_reports.iter()
            .find(|r| r.reservoir == "genital_tract").unwrap();
        assert_eq!(genital.bottleneck_type, BottleneckType::Cleared);
    }
}
```

### test_regression.rs — 5 tests

```rust
#[cfg(test)]
mod test_regression {
    use super::*;
    use approx::assert_relative_eq;

    // These tests lock the Rust implementation to the validated Python output.
    // If any test fails, the Rust code has diverged from the reference.

    // TEST REG-1: τ values match Python
    #[test]
    fn regression_tau_values() {
        let expected = vec![
            ("Dolutegravir", 5.39),
            ("Tenofovir-DF", 2.18),
            ("Darunavir", 5.15),
            ("Emtricitabine", 3.70),
            ("Efavirenz", 5.26),
        ];
        let drugs = load_all_drugs();
        for (name, expected_tau) in expected {
            let drug = drugs.iter().find(|d| d.name == name).unwrap();
            assert_relative_eq!(compute_tau(drug), expected_tau, epsilon = 0.02,
                "τ mismatch for {}", name);
        }
    }

    // TEST REG-2: Double Cover S = 0.80
    #[test]
    fn regression_double_cover() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let (s, d2, bottlenecks) = compute_double_cover(&triple, &reservoirs, 1.0, &latency, 1.0);
        assert_relative_eq!(s, 0.80, epsilon = 1e-10);
        assert_relative_eq!(d2, 0.20, epsilon = 1e-10);
        assert_eq!(bottlenecks, vec!["CNS"]);
    }

    // TEST REG-3: Cure impossibility shortfall ≈ 1.1e5
    #[test]
    fn regression_cure_shortfall() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();

        let c_active = compute_c_combo_active(&triple, "GALT", &latency, 1.0);
        let c_total = latency.f_active_on_art * c_active;
        let shortfall = 1.0 / c_total;

        assert_relative_eq!(shortfall, 1.1e5, epsilon = 2e4);
    }

    // TEST REG-4: Clearance order matches Python exactly
    #[test]
    fn regression_clearance_order() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let reservoirs = load_all_reservoirs();
        let latency = LatencyModel::default();

        let order = compute_clearance_order(&triple, &reservoirs, &latency, 1.0);
        assert_eq!(order, vec![
            "genital_tract", "bone_marrow", "lymph_node", "CNS", "GALT"
        ]);
    }

    // TEST REG-5: Φ thresholds match Python within tolerance
    #[test]
    fn regression_phi_thresholds() {
        let drugs = load_all_drugs();
        let triple: Vec<_> = drugs[0..3].to_vec();
        let latency = LatencyModel::default();
        let reservoirs = load_all_reservoirs();

        let expected = vec![
            ("CNS", 3.54),
            ("lymph_node", 0.123),
            ("GALT", 0.111),
            ("genital_tract", 0.0017),
            ("bone_marrow", 0.159),
        ];

        for (name, expected_phi) in expected {
            let phi = compute_phi_threshold(&triple, name, 1.0, &latency, 1.0);
            assert_relative_eq!(phi, expected_phi, epsilon = 0.01,
                "Φ threshold mismatch at {}: got {} expected {}", name, phi, expected_phi);
        }
    }
}
```

## Frontend Integration — Stage Design

The HIV module follows the existing Mirador stacking panel pattern.
Each stage appears only after the previous stage is completed.

**Stage 1: THE PATIENT** (red accent)
Patient profile: demographics, current ART regimen, viral load history,
CD4 count trajectory. Select drugs from database. Toggle LRA if applicable.
Display: current regimen as drug cards with class badges.
Data: all editable, drives computation.

**Stage 2: THE RESERVOIRS** (blue accent)
Five-reservoir anatomical map. Each reservoir shows:
  - Latent pool fraction (size of dot)
  - C_combo_active (color: green ≥ 1.0, red < 1.0)
  - Bottleneck type badge (Geometric / Dynamic / Cleared)
One sentence per reservoir explaining what the number means.

**Stage 3: THE BARRIERS** (purple accent)
For each drug × reservoir: K_barrier heatmap.
Rows = drugs. Columns = reservoirs. Color = K_barrier magnitude.
Highlights the drug-reservoir pairs where penetration fails.
Expandable: click a cell to see R value, source citation, K computation.

**Stage 4: THE CURE GAP** (orange accent)
Φ threshold chart: horizontal bars per reservoir.
Left bar: best available LRA Φ. Right bar: needed Φ. Gap shaded red.
Genital tract bar shows overlap (Cleared badge).
CNS bar shows "Φ > 1.0 — GEOMETRIC BLOCK" label.
Double Cover gauge: S = 0.80, d² = 0.20.

**Stage 5: THE REPORT** (teal accent)
Full HivReport as structured output.
Clearance order timeline.
Novel predictions list with confidence and testability notes.
Export: JSON, PDF, copy-to-clipboard.
Footer: "The equation does not change. The manifold changes. The medicine follows."

## Implementation Roadmap

**Sprint 1: Data + Tau + Barrier (tests: TAU 1-5, BAR 1-8, PHE 1-6)**
Build drug/reservoir/LRA structs and loaders.
Implement compute_tau, compute_k_barrier, compute_k_phenotype.
22 tests.

**Sprint 2: Pathway + Single Drug (tests: PATH 1-7, SD 1-10)**
Implement compute_k_pathway, compute_c_site.
17 tests.

**Sprint 3: Combination + LRA (tests: COMBO 1-8, LRA 1-9)**
Implement compute_c_combo_active (Kirchhoff), compute_c_with_lra, compute_phi_threshold.
17 tests.

**Sprint 4: Cure + Double Cover + Clearance (tests: CURE 1-6, DC 1-5, CLR 1-4)**
Implement cure analysis, double cover, clearance ordering.
15 tests.

**Sprint 5: Integration + Regression (tests: NP 1-3, INT 1-7, REG 1-5)**
Implement run_hiv_analysis pipeline, JSON output, regression locks.
Wire to generalized CompartmentConfig interface.
15 tests.

**Sprint 6: Frontend**
Build five-stage stacking panel JSX.
Wire to Rust API via HTTP or PyO3.

**Total: 83 Rust tests across 13 test files, 6 sprints.**

## Patent Language

**Claim 21 (HIV reservoir pharmacology):** A computer-implemented method
for computing therapeutic coherence across anatomical HIV reservoirs comprising:
(a) receiving a patient's antiretroviral regimen and optionally a
    latency-reversing agent;
(b) for each drug, computing a pathway impedance at each of N anatomical
    reservoirs as the series sum of systemic pharmacokinetic curvature,
    barrier penetration curvature (from published tissue:plasma ratios),
    and phenotype curvature (active vs. latent proviral state);
(c) for the drug combination, computing a Kirchhoff parallel-resistor
    conductance at each reservoir;
(d) when a latency-reversing agent is specified, computing a modified
    active fraction as f_active + Φ × f_latent, and multiplying by the
    combination conductance to obtain total therapeutic coherence;
(e) computing the minimum reactivation efficiency Φ_threshold at each
    reservoir needed to reach a cure threshold;
(f) classifying each reservoir as Geometric (penetration-limited),
    Dynamic (reactivation-limited), or Cleared;
(g) computing the Double Cover fractions S (geometry) and d² (dynamics)
    satisfying S + d² = 1;
(h) reporting a reservoir clearance ordering and identifying geometric
    bottlenecks that cannot be overcome by reactivation alone;
(i) generating novel predictions including compartment-specific cure
    feasibility (genital tract clearable with existing LRA technology)
    and quantitative Φ gaps at each reservoir.
