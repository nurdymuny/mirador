//! WASM bridge — Keske bone module.
//!
//! Single JSON-in / JSON-out `compute_keske` so the JSX contains no math.
//! Composes the real Rust pipeline end to end:
//!   penetration (mirador-bone) + biofilm (mirador-biofilm)
//!   + reservoir (mirador-reservoir) + combination (mirador-combo-bone).
//! Both combination models are returned: the interaction-typed Bliss model
//! (`combine_two_interaction`) and the legacy parallel-resistor (`combine_two`),
//! so the front end can show the honest model and the contrast side by side.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

use mirador_biofilm::{BiofilmProfile, Chronicity};
use mirador_bone::DrugBonePenetration;
use mirador_combo_bone::{combine_two, combine_two_interaction, DrugBonePathway, InteractionType};
use mirador_reservoir::ReservoirPatient;

const THRESHOLD: f64 = 5.0;

// ── Drug registry ────────────────────────────────────────────────────────────
// tau / k_admet / r_bone match KeskeApp.jsx DRUGS; mic / mbec / is_rifampin match
// mirador-biofilm's published profiles. (TODO: centralize into one source.)
struct DrugSpec {
    name: &'static str,
    tau: f64,
    k_admet: f64,
    r_bone: f64,
    mic: f64,
    mbec: f64,
    is_rifampin: bool,
}

fn registry() -> Vec<DrugSpec> {
    vec![
        DrugSpec { name: "Ceftaroline", tau: 12.0, k_admet: 0.67, r_bone: 0.30,  mic: 1.0,   mbec: 128.0, is_rifampin: false },
        DrugSpec { name: "Rifampin",    tau: 8.0,  k_admet: 0.50, r_bone: 0.35,  mic: 0.008, mbec: 0.5,   is_rifampin: true  },
        DrugSpec { name: "Vancomycin",  tau: 12.0, k_admet: 0.50, r_bone: 0.20,  mic: 1.0,   mbec: 512.0, is_rifampin: false },
        DrugSpec { name: "Linezolid",   tau: 12.0, k_admet: 0.40, r_bone: 0.50,  mic: 2.0,   mbec: 256.0, is_rifampin: false },
        DrugSpec { name: "Daptomycin",  tau: 24.0, k_admet: 0.60, r_bone: 0.15,  mic: 0.5,   mbec: 32.0,  is_rifampin: false },
        DrugSpec { name: "Clindamycin", tau: 8.0,  k_admet: 0.50, r_bone: 0.525, mic: 0.25,  mbec: 64.0,  is_rifampin: false },
    ]
}

fn find<'a>(reg: &'a [DrugSpec], name: &str) -> Option<&'a DrugSpec> {
    reg.iter().find(|d| d.name.eq_ignore_ascii_case(name))
}

// ── Input ────────────────────────────────────────────────────────────────────
#[derive(Deserialize)]
struct Input {
    #[serde(default = "d_crp")] crp: f64,
    #[serde(default = "d_days")] infection_days: f64,
    #[serde(default = "d_drain")] p_drainage: f64,
    #[serde(default = "d_debride")] p_debride: f64,
    #[serde(default = "d_intra")] intracellular_frac: f64,
    #[serde(default = "d_a")] drug_a: String,
    #[serde(default = "d_b")] drug_b: String,
    #[serde(default = "d_interaction")] interaction: String,
    #[serde(default = "d_delta")] bliss_delta: f64,
    #[serde(default = "d_syn")] synergy: f64,
}
fn d_crp() -> f64 { 250.0 }
fn d_days() -> f64 { 2190.0 }
fn d_drain() -> f64 { 0.90 }
fn d_debride() -> f64 { 0.80 }
fn d_intra() -> f64 { 0.40 }
fn d_a() -> String { "Ceftaroline".into() }
fn d_b() -> String { "Rifampin".into() }
fn d_interaction() -> String { "additivity".into() }
fn d_delta() -> f64 { 0.0 }
fn d_syn() -> f64 { 1.2 }

// ── Output ───────────────────────────────────────────────────────────────────
#[derive(Serialize)]
struct DrugResult {
    name: String,
    tau: f64,
    k_admet: f64,
    k_pen: f64,
    k_bio: f64,
    k_res: f64,
    k_pathway: f64,
    c_bone: f64,
    is_rifampin: bool,
}

#[derive(Serialize)]
struct ComboResult {
    drug_a: String,
    drug_b: String,
    c_bone_a: f64,
    c_bone_b: f64,
    interaction: String,
    bliss_delta: f64,
    c_bone_combo: f64,
    legacy_parallel_resistor: f64,
    synergy: f64,
}

#[derive(Serialize)]
struct Output {
    threshold: f64,
    monotherapy: Vec<DrugResult>,
    combo: ComboResult,
}

#[derive(Serialize)]
struct WasmError {
    error: String,
}

struct Patient {
    crp: f64,
    days: f64,
    p_drainage: f64,
    p_debride: f64,
    intra: f64,
}

/// Compose the full pathway for one drug at the given patient state.
fn pathway(spec: &DrugSpec, pt: &Patient, rif_in_combo: bool) -> Result<DrugBonePathway, String> {
    let pen = DrugBonePenetration::new(spec.name, spec.r_bone)
        .map_err(|e| e.to_string())?
        .k_penetration(pt.crp)
        .map_err(|e| e.to_string())?;
    let profile = BiofilmProfile::new(spec.name, spec.mic, spec.mbec, spec.is_rifampin)
        .map_err(|e| e.to_string())?;
    let k_bio = profile.k_biofilm_eff(&Chronicity::from_days(pt.days));
    let res = ReservoirPatient {
        p_drainage: pt.p_drainage,
        p_debride: pt.p_debride,
        intracellular_fraction: pt.intra,
        crp_mgl: pt.crp,
    }
    .compute(&pen, rif_in_combo);
    Ok(DrugBonePathway {
        drug_name: spec.name.to_string(),
        tau: spec.tau,
        k_admet: spec.k_admet,
        k_pen: pen.k_penetration,
        k_bio,
        k_res: res.k_reservoir_total,
        is_rifampin: spec.is_rifampin,
    })
}

fn parse_interaction(kind: &str, delta: f64) -> InteractionType {
    match kind.to_lowercase().as_str() {
        "synergy" => InteractionType::Synergy { bliss_delta: delta },
        "antagonism" => InteractionType::Antagonism { bliss_delta: delta },
        _ => InteractionType::Additivity,
    }
}

pub(crate) fn compute_inner(json: &str) -> Result<Output, String> {
    let inp: Input = serde_json::from_str(json).map_err(|e| format!("Invalid input JSON: {e}"))?;
    let reg = registry();
    let pt = Patient {
        crp: inp.crp,
        days: inp.infection_days,
        p_drainage: inp.p_drainage,
        p_debride: inp.p_debride,
        intra: inp.intracellular_frac,
    };

    // Monotherapy: each drug alone (rifampin flag = its own is_rifampin).
    let mut monotherapy = Vec::new();
    for spec in &reg {
        let p = pathway(spec, &pt, spec.is_rifampin)?;
        let kp = p.k_pathway();
        monotherapy.push(DrugResult {
            name: spec.name.to_string(),
            tau: p.tau,
            k_admet: p.k_admet,
            k_pen: p.k_pen,
            k_bio: p.k_bio,
            k_res: p.k_res,
            k_pathway: kp,
            c_bone: p.tau / kp,
            is_rifampin: spec.is_rifampin,
        });
    }

    // Combination.
    let a = find(&reg, &inp.drug_a).ok_or_else(|| format!("Unknown drug: {}", inp.drug_a))?;
    let b = find(&reg, &inp.drug_b).ok_or_else(|| format!("Unknown drug: {}", inp.drug_b))?;
    let rif_in_combo = a.is_rifampin || b.is_rifampin;
    let pa = pathway(a, &pt, rif_in_combo)?;
    let pb = pathway(b, &pt, rif_in_combo)?;
    let ir = combine_two_interaction(&pa, &pb, parse_interaction(&inp.interaction, inp.bliss_delta))
        .map_err(|e| e.to_string())?;
    let legacy = combine_two(&pa, &pb, inp.synergy).map_err(|e| e.to_string())?;

    Ok(Output {
        threshold: THRESHOLD,
        monotherapy,
        combo: ComboResult {
            drug_a: a.name.to_string(),
            drug_b: b.name.to_string(),
            c_bone_a: ir.c_bone_a,
            c_bone_b: ir.c_bone_b,
            interaction: inp.interaction.clone(),
            bliss_delta: inp.bliss_delta,
            c_bone_combo: ir.c_bone_combo,
            legacy_parallel_resistor: legacy.c_bone_combo,
            synergy: inp.synergy,
        },
    })
}

/// WASM entry point — JSON in, JSON out.
#[wasm_bindgen]
pub fn compute_keske(params_json: &str) -> String {
    match compute_inner(params_json) {
        Ok(out) => serde_json::to_string(&out)
            .unwrap_or_else(|e| serde_json::to_string(&WasmError { error: e.to_string() }).unwrap()),
        Err(e) => serde_json::to_string(&WasmError { error: e }).unwrap_or_default(),
    }
}

// ── Tests (native rlib) — fidelity + honesty gates ───────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn steven() -> String {
        // All defaults = Steven's chronic scenario.
        serde_json::json!({}).to_string()
    }

    // FIDELITY: the composed Rust pipeline must reproduce the JS front-end
    // per-drug numbers (CRP-inflated penetration), proving the wire is faithful.
    #[test]
    fn monotherapy_matches_frontend_numbers() {
        let out = compute_inner(&steven()).unwrap();
        let cef = out.monotherapy.iter().find(|d| d.name == "Ceftaroline").unwrap();
        assert!((cef.c_bone - 3.04).abs() < 0.03, "cef mono C_bone = {}", cef.c_bone);
        let van = out.monotherapy.iter().find(|d| d.name == "Vancomycin").unwrap();
        assert!((van.c_bone - 2.22).abs() < 0.03, "vanc mono C_bone = {}", van.c_bone);
        // No monotherapy reaches the C=5 threshold.
        assert!(out.monotherapy.iter().all(|d| d.c_bone < 5.0));
    }

    // The interaction path stays far below the legacy parallel-resistor.
    #[test]
    fn interaction_below_legacy_parallel() {
        let out = compute_inner(&steven()).unwrap();
        assert!(out.combo.c_bone_combo < out.combo.legacy_parallel_resistor);
        println!(
            "cef+rif additivity = {:.3} | legacy parallel = {:.3}",
            out.combo.c_bone_combo, out.combo.legacy_parallel_resistor
        );
    }

    // Antagonism falls below additivity — the capability the parallel model lacks.
    #[test]
    fn antagonism_below_additivity() {
        let ant = serde_json::json!({"interaction":"antagonism","bliss_delta":0.5}).to_string();
        let a = compute_inner(&ant).unwrap().combo.c_bone_combo;
        let d = compute_inner(&steven()).unwrap().combo.c_bone_combo;
        assert!(a < d, "antagonism {a} must be below additivity {d}");
    }

    #[test]
    fn json_roundtrip_and_unknown_drug() {
        let raw = compute_keske(&steven());
        let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
        assert!(v.get("combo").is_some());
        assert!(v.get("monotherapy").is_some());
        let bad = serde_json::json!({"drug_a":"NotADrug"}).to_string();
        let raw2 = compute_keske(&bad);
        assert!(raw2.contains("error"));
    }
}
