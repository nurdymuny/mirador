//! WASM bridge — HIV latent reservoir module
//!
//! Single JSON-in / JSON-out function so JSX never contains math.
//! The frontend calls `compute_hiv(params_json)` and renders whatever comes back.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use mirador_hiv_reservoir::{
    ArvDrug, HivReservoir, Lra, LatencyModel, Phenotype,
    load_drug, load_all_drugs, load_all_reservoirs, load_all_lras,
    compute_tau, compute_k_barrier, compute_k_phenotype, compute_k_pathway,
    compute_c_site, compute_c_combo_active, compute_c_with_lra,
    compute_phi_threshold, compute_double_cover, compute_clearance_order,
};

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct HivInput {
    /// Drug names active in the regimen, e.g. ["Dolutegravir","Tenofovir-DF","Emtricitabine"]
    drugs: Vec<String>,
    /// Selected LRA name (or null for no LRA)
    #[serde(default)]
    lra: Option<String>,
    /// Synergy multiplier (default 1.0 — conservative, no synergy assumed)
    #[serde(default = "default_synergy")]
    synergy: f64,
    /// Cure threshold (default 1.0)
    #[serde(default = "default_threshold")]
    cure_threshold: f64,
}

fn default_synergy() -> f64 { 1.0 }
fn default_threshold() -> f64 { 1.0 }

#[derive(Serialize)]
struct PerDrugPerReservoir {
    k_barrier:  f64,
    k_pathway:  f64,
    tau:        f64,
    c_site:     f64,
}

#[derive(Serialize)]
struct PerReservoirResult {
    c_combo_active:   f64,
    c_with_lra:       f64,
    phi_needed:       f64,
    reaches_active:   bool,
    phi_sufficient:   bool,
    bottleneck:       String,   // "geometric", "dynamic", or "cleared"
    per_drug:         std::collections::HashMap<String, PerDrugPerReservoir>,
}

#[derive(Serialize)]
struct DrugSummary {
    name:       String,
    drug_class: String,
    tau:        f64,
    k_admet:    f64,
    ic50_nM:    f64,
    auc24_nM_hr: f64,
}

#[derive(Serialize)]
struct HivOutput {
    drugs:              Vec<DrugSummary>,
    reservoirs:         Vec<ReservoirSummary>,
    per_reservoir:      std::collections::HashMap<String, PerReservoirResult>,
    clearance_order:    Vec<String>,
    double_cover_s:     f64,
    double_cover_d2:    f64,
    geometric_bottlenecks: Vec<String>,
    best_lra_phi:       f64,
    lra_name:           Option<String>,
}

#[derive(Serialize)]
struct ReservoirSummary {
    name:            String,
    latent_fraction: f64,
}

#[derive(Serialize)]
struct HivError { error: String }

// ---------------------------------------------------------------------------
// Main WASM entry point
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn compute_hiv(params_json: &str) -> String {
    match compute_hiv_inner(params_json) {
        Ok(result) => serde_json::to_string(&result).unwrap_or_else(|e| {
            serde_json::to_string(&HivError { error: e.to_string() }).unwrap()
        }),
        Err(e) => serde_json::to_string(&HivError { error: e }).unwrap_or_default(),
    }
}

fn compute_hiv_inner(params_json: &str) -> Result<HivOutput, String> {
    let input: HivInput = serde_json::from_str(params_json)
        .map_err(|e| format!("Invalid input JSON: {e}"))?;

    if input.drugs.is_empty() {
        return Err("No drugs specified".into());
    }

    // Load requested drugs from the embedded database
    let all_drugs = load_all_drugs();
    let mut drugs: Vec<ArvDrug> = Vec::new();
    for name in &input.drugs {
        let drug = all_drugs.iter().find(|d| d.name == *name)
            .ok_or_else(|| format!("Unknown drug: {name}"))?;
        drugs.push(drug.clone());
    }

    let reservoirs = load_all_reservoirs();
    let latency = LatencyModel::default();
    let all_lras = load_all_lras();

    // Find selected or best LRA
    let selected_lra = input.lra.as_ref().and_then(|name| {
        all_lras.iter().find(|l| l.name == *name)
    });
    let best_lra = all_lras.iter()
        .max_by(|a, b| a.reactivation_phi.partial_cmp(&b.reactivation_phi).unwrap())
        .unwrap();
    let active_lra = selected_lra.unwrap_or(best_lra);

    // Build drug summaries
    let drug_summaries: Vec<DrugSummary> = drugs.iter().map(|d| {
        DrugSummary {
            name: d.name.clone(),
            drug_class: format!("{:?}", d.drug_class),
            tau: round4(compute_tau(d)),
            k_admet: d.k_admet,
            ic50_nM: d.ic50_nM,
            auc24_nM_hr: d.auc24_nM_hr,
        }
    }).collect();

    let reservoir_summaries: Vec<ReservoirSummary> = reservoirs.iter().map(|r| {
        ReservoirSummary { name: r.name.clone(), latent_fraction: r.latent_fraction }
    }).collect();

    // Per-reservoir analysis
    let mut per_reservoir = std::collections::HashMap::new();

    for res in &reservoirs {
        let c_active = compute_c_combo_active(&drugs, &res.name, &latency, input.synergy);
        let c_lra = compute_c_with_lra(&drugs, &res.name, active_lra, &latency, input.synergy);
        let phi_needed = compute_phi_threshold(
            &drugs, &res.name, input.cure_threshold, &latency, input.synergy
        );
        let reaches_active = c_active >= input.cure_threshold;
        let phi_sufficient = active_lra.reactivation_phi >= phi_needed;

        let bottleneck = if reaches_active && phi_sufficient {
            "cleared"
        } else if !reaches_active {
            "geometric"
        } else {
            "dynamic"
        };

        // Per-drug detail at this reservoir
        let mut per_drug = std::collections::HashMap::new();
        for drug in &drugs {
            let r_val = drug.penetration.get(&res.name).copied().unwrap_or(0.3);
            let k_bar = compute_k_barrier(r_val);
            let k_path = compute_k_pathway(drug, &res.name, Phenotype::Active, &latency);
            let tau = compute_tau(drug);
            let c = compute_c_site(drug, &res.name, Phenotype::Active, &latency);
            per_drug.insert(drug.name.clone(), PerDrugPerReservoir {
                k_barrier: round4(k_bar),
                k_pathway: round4(k_path),
                tau: round4(tau),
                c_site: round4(c),
            });
        }

        per_reservoir.insert(res.name.clone(), PerReservoirResult {
            c_combo_active: round4(c_active),
            c_with_lra: round6(c_lra),
            phi_needed: round6(phi_needed),
            reaches_active,
            phi_sufficient,
            bottleneck: bottleneck.into(),
            per_drug,
        });
    }

    // Double cover
    let (s, d2, bottlenecks) = compute_double_cover(
        &drugs, &reservoirs, input.cure_threshold, &latency, input.synergy
    );

    // Clearance order
    let clearance = compute_clearance_order(&drugs, &reservoirs, &latency, input.synergy);

    Ok(HivOutput {
        drugs: drug_summaries,
        reservoirs: reservoir_summaries,
        per_reservoir,
        clearance_order: clearance,
        double_cover_s: round4(s),
        double_cover_d2: round4(d2),
        geometric_bottlenecks: bottlenecks,
        best_lra_phi: best_lra.reactivation_phi,
        lra_name: Some(active_lra.name.clone()),
    })
}

fn round4(v: f64) -> f64 { (v * 10_000.0).round() / 10_000.0 }
fn round6(v: f64) -> f64 { (v * 1_000_000.0).round() / 1_000_000.0 }
