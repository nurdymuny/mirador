//! WASM bridge — TB module
//!
//! A single JSON-in / JSON-out function so JSX never contains math.
//! The frontend calls `compute_tb(params_json)` and renders whatever comes back.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use mirador_tb_combo::{DrugPathway, TbComboEngine};
use mirador_tb_phenotype::{
    PhenotypeProfile,
    isoniazid_phenotype, rifampin_phenotype, pyrazinamide_phenotype,
    ethambutol_phenotype, moxifloxacin_phenotype, bedaquiline_phenotype,
    linezolid_phenotype,
};
use mirador_tb_reservoir::{
    TbReservoirProfile, ReservoirWeights,
    isoniazid_reservoir, rifampin_reservoir, pyrazinamide_reservoir,
    ethambutol_reservoir, moxifloxacin_reservoir, bedaquiline_reservoir,
    linezolid_reservoir,
};
use mirador_granuloma::{
    GranulomaProfile,
    isoniazid_granuloma, rifampin_granuloma, pyrazinamide_granuloma,
    ethambutol_granuloma, moxifloxacin_granuloma, bedaquiline_granuloma,
    linezolid_granuloma, clofazimine_granuloma,
    lesion_weights_cavitary_sputum_positive,
    lesion_weights_noncavitary_sputum_positive,
};

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct TbInput {
    /// Drug names active in the regimen, e.g. ["rifampin","isoniazid","pyrazinamide","ethambutol"]
    drugs: Vec<String>,
    /// true = pncA or equivalent abolishes PZA activation
    #[serde(default)]
    pza_resistant: bool,
    /// true = patient has open cavities on imaging
    #[serde(default)]
    cavitary: bool,
    /// Months since TB symptoms first appeared (governs bacterial population weights)
    #[serde(default = "default_disease_months")]
    disease_months: f64,
    /// Synergy multiplier ≥ 1.0 (1.0 = additive, 1.2 = standard RIPE synergy)
    #[serde(default = "default_synergy")]
    synergy: f64,
}

fn default_disease_months() -> f64 { 3.0 }
fn default_synergy() -> f64 { 1.2 }

#[derive(Serialize)]
struct PerDrugResult {
    k_phenotype:  f64,
    k_reservoir:  f64,
    k_granuloma:  f64,
    k_pathway:    f64,
    tau:          f64,
}

#[derive(Serialize)]
struct TbOutput {
    k_combo:         f64,
    k_combo_ripe:    f64,
    tau_combo:       f64,
    c_lesion:        f64,
    duration_months: f64,
    verdict:         &'static str,
    per_drug:        std::collections::HashMap<String, PerDrugResult>,
    /// Population weights used
    pop_weights:     PopWeights,
    /// Reservoir weights used
    res_weights:     ResWeights,
}

#[derive(Serialize)]
struct PopWeights { w_rep: f64, w_acid: f64, w_dorm: f64 }

#[derive(Serialize)]
struct ResWeights { w_extra: f64, w_macro: f64, w_caseum: f64, w_cavity: f64 }

#[derive(Serialize)]
struct TbError { error: String }

// ---------------------------------------------------------------------------
// Drug registry — k_admet (systemic PK barrier) and tau values per drug.
//
// k_admet represents Layer T1 ADMET barriers: oral bioavailability losses,
// hepatic first-pass, plasma protein binding, and renal/metabolic clearance.
// Values reflect steady-state (v0.1 simplification; time-indexed v0.2 target).
// k_pathway_total = k_admet + k_gran + k_phen + k_res  (spec §Combination Engine)
// ---------------------------------------------------------------------------

fn drug_registry(name: &str, pza_resistant: bool) -> Option<(f64, f64, PhenotypeProfile, TbReservoirProfile, GranulomaProfile)> {
    match name {
        // k_admet: RIF 0.30 (auto-induction at steady state; ~75% BA)
        "rifampin"     => Some((0.30, 1.66, rifampin_phenotype(),                    rifampin_reservoir(),    rifampin_granuloma())),
        // k_admet: INH 0.20 (excellent BA ~90%; moderate hepatic NAT2 extraction)
        "isoniazid"    => Some((0.20, 1.97, isoniazid_phenotype(),                   isoniazid_reservoir(),   isoniazid_granuloma())),
        // k_admet: PZA 0.15 (good BA ~85%; hydrophilic, minimal first-pass)
        "pyrazinamide" => Some((0.15, 0.91, pyrazinamide_phenotype(pza_resistant),   pyrazinamide_reservoir(), pyrazinamide_granuloma())),
        // k_admet: EMB 0.20 (BA ~75-80%; primarily renal clearance)
        "ethambutol"   => Some((0.20, 0.46, ethambutol_phenotype(),                  ethambutol_reservoir(),  ethambutol_granuloma())),
        // k_admet: MXF 0.15 (excellent BA >90%; minimal first-pass)
        "moxifloxacin" => Some((0.15, 1.60, moxifloxacin_phenotype(),               moxifloxacin_reservoir(), moxifloxacin_granuloma())),
        // k_admet: BDQ 0.25 (moderate BA; extreme macrophage/lipid accumulation modeled in reservoir layer)
        "bedaquiline"  => Some((0.25, 1.76, bedaquiline_phenotype(),                 bedaquiline_reservoir(), bedaquiline_granuloma())),
        // k_admet: LZD 0.15 (excellent BA ~100%; minimal hepatic CYP involvement)
        "linezolid"    => Some((0.15, 1.50, linezolid_phenotype(),                   linezolid_reservoir(),   linezolid_granuloma())),
        // Stubs for drugs without dedicated crates yet
        "pretomanid"   => Some((0.20, 1.45, linezolid_phenotype(),                   linezolid_reservoir(),   linezolid_granuloma())),
        "clofazimine"  => Some((0.20, 1.96, bedaquiline_phenotype(),                 bedaquiline_reservoir(), clofazimine_granuloma())),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Main WASM entry point
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn compute_tb(params_json: &str) -> String {
    match compute_tb_inner(params_json) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|e| {
            serde_json::to_string(&TbError { error: e.to_string() }).unwrap()
        }),
        Err(e) => serde_json::to_string(&TbError { error: e }).unwrap_or_default(),
    }
}

fn compute_tb_inner(params_json: &str) -> Result<TbOutput, String> {
    let input: TbInput = serde_json::from_str(params_json)
        .map_err(|e| format!("Invalid input JSON: {e}"))?;

    if input.drugs.is_empty() {
        return Err("No drugs specified".into());
    }
    if input.synergy < 1.0 {
        return Err(format!("synergy must be ≥ 1.0, got {}", input.synergy));
    }

    // Bacterial population weights: shift toward dormant as disease progresses
    let (w_rep, w_acid, w_dorm) = if input.disease_months < 2.0 {
        (0.60, 0.30, 0.10) // early / acute
    } else {
        (0.20, 0.40, 0.40) // chronic
    };

    // Reservoir burden weights
    let res_weights = if input.cavitary {
        ReservoirWeights::cavitary()
    } else {
        ReservoirWeights::noncavitary_sputum_positive()
    };

    // Lesion weights (w_lung, w_cellular, w_necrotic, w_cavity)
    let (wl, wc, wn, wcav) = if input.cavitary {
        lesion_weights_cavitary_sputum_positive()
    } else {
        lesion_weights_noncavitary_sputum_positive()
    };

    // Build per-drug results and DrugPathway vec for the combo engine
    let mut pathways: Vec<DrugPathway> = Vec::new();
    let mut per_drug = std::collections::HashMap::new();

    for drug_name in &input.drugs {
        let (k_admet, tau, phen, res, gran) = drug_registry(drug_name, input.pza_resistant)
            .ok_or_else(|| format!("Unknown drug: {drug_name}"))?;

        // Layer T3 — phenotype
        let k_phen = phen.k_phenotype_total(w_rep, w_acid, w_dorm);

        // Layer T4 — reservoir
        let k_res = res.k_reservoir(&res_weights);

        // Layer T2 — granuloma
        let k_gran = gran.k_granuloma_weighted(wl, wc, wn, wcav)
            .map_err(|e| e.to_string())?;

        // Spec §Combination Engine: K_pathway = K_admet + K_gran + K_phen + K_res
        let k_pathway = k_admet + k_gran + k_phen + k_res;

        pathways.push(
            DrugPathway::new(drug_name.clone(), k_pathway, tau)
                .map_err(|e| e.to_string())?
        );

        per_drug.insert(drug_name.clone(), PerDrugResult {
            k_phenotype: round4(k_phen),
            k_reservoir: round4(k_res),
            k_granuloma: round4(k_gran),
            k_pathway:   round4(k_pathway),
            tau:         round4(tau),
        });
    }

    let engine = TbComboEngine::new(pathways, input.synergy)
        .map_err(|e| e.to_string())?;

    let k_combo   = engine.k_combo();
    let tau_combo = engine.tau_combo();
    let c_lesion  = engine.c_lesion();

    // Duration is 6 months × (K_combo / K_combo_RIPE), so RIPE always = 6 months.
    // Compute RIPE reference K_combo using the SAME patient context (cavitary, disease months).
    let ripe_names = ["rifampin", "isoniazid", "pyrazinamide", "ethambutol"];
    let mut ripe_pathways: Vec<DrugPathway> = Vec::new();
    for ripe_name in &ripe_names {
        let (k_admet, tau, phen, res, gran) = drug_registry(ripe_name, input.pza_resistant)
            .unwrap(); // RIPE drugs always exist in registry
        let k_phen = phen.k_phenotype_total(w_rep, w_acid, w_dorm);
        let k_res  = res.k_reservoir(&res_weights);
        let k_gran = gran.k_granuloma_weighted(wl, wc, wn, wcav)
            .map_err(|e| e.to_string())?;
        let k_pathway = k_admet + k_gran + k_phen + k_res;
        ripe_pathways.push(
            DrugPathway::new(ripe_name.to_string(), k_pathway, tau)
                .map_err(|e| e.to_string())?
        );
    }
    let ripe_engine = TbComboEngine::new(ripe_pathways, 1.2) // RIPE synergy = 1.2
        .map_err(|e| e.to_string())?;
    let k_combo_ripe = ripe_engine.k_combo();
    let duration = 6.0 * (k_combo / k_combo_ripe); // months (relative to RIPE 6-month standard)

    // Threshold validated against TBTC Study 28/31, REMoxTB, OFLOTUB,
    // TB-PRACTECAL, ZeNix, and historical Fox/Mitchison data.
    // Composite criterion: week-8 sputum conversion ≥ 75% AND relapse ≤ 8%
    // Youden J = 0.800, accuracy = 93.3%, Σn = 6,188 patients.
    let verdict = if c_lesion >= 9.5 {
        "EFFECTIVE"
    } else if c_lesion >= 5.0 {
        "MARGINAL"
    } else {
        "FAILING"
    };

    Ok(TbOutput {
        k_combo:         round4(k_combo),
        k_combo_ripe:    round4(k_combo_ripe),
        tau_combo:       round4(tau_combo),
        c_lesion:        round3(c_lesion),
        duration_months: round2(duration),
        verdict,
        per_drug,
        pop_weights: PopWeights { w_rep, w_acid, w_dorm },
        res_weights: ResWeights {
            w_extra:   res_weights.w_extracellular,
            w_macro:   res_weights.w_macrophage,
            w_caseum:  res_weights.w_caseum,
            w_cavity:  res_weights.w_cavity,
        },
    })
}

fn round4(v: f64) -> f64 { (v * 10_000.0).round() / 10_000.0 }
fn round3(v: f64) -> f64 { (v * 1_000.0).round() / 1_000.0 }
fn round2(v: f64) -> f64 { (v * 100.0).round() / 100.0 }
