use wasm_bindgen::prelude::*;
use mirador_universe::{
    DrugRecord, Threshold, Regimen,
    build_universe, cover_evaluate, combine_drugs, decompose, compare_drugs,
};
use serde::{Deserialize, Serialize};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JSON-in / JSON-out WASM entry points
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[derive(Deserialize)]
struct BuildUniverseInput {
    drugs: Vec<DrugRecord>,
    thresholds: Vec<Threshold>,
    regimens: Vec<Regimen>,
}

#[derive(Deserialize)]
struct CoverInput {
    universe: Vec<mirador_universe::UniverseRecord>,
    filters: Vec<(String, String)>,
    #[serde(default = "default_desc")]
    rank_dir: String,
}

fn default_desc() -> String { "DESC".to_string() }

#[derive(Deserialize)]
struct CombineInput {
    universe: Vec<mirador_universe::UniverseRecord>,
    drugs: Vec<String>,
    tissue: String,
    #[serde(default = "default_synergy")]
    synergy_factor: f64,
}

fn default_synergy() -> f64 { 1.0 }

#[derive(Deserialize)]
struct DecomposeInput {
    universe: Vec<mirador_universe::UniverseRecord>,
    drug: String,
    tissue: String,
}

#[derive(Deserialize)]
struct CompareInput {
    universe: Vec<mirador_universe::UniverseRecord>,
    drugs: Vec<String>,
    tissue: String,
}

#[derive(Serialize)]
struct ErrorOut {
    error: String,
}

/// Build the mirador_universe from raw drug/threshold/regimen data.
/// Input: JSON { drugs, thresholds, regimens }
/// Output: JSON array of UniverseRecord
#[wasm_bindgen]
pub fn wasm_build_universe(params_json: &str) -> String {
    let input: BuildUniverseInput = match serde_json::from_str(params_json) {
        Ok(v) => v,
        Err(e) => return serde_json::to_string(&ErrorOut { error: e.to_string() }).unwrap(),
    };
    let universe = build_universe(&input.drugs, &input.thresholds, &input.regimens);
    serde_json::to_string(&universe).unwrap()
}

/// COVER ... EVALUATE coherence
/// Input: JSON { universe, filters: [[key, value], ...], rank_dir: "DESC"|"ASC" }
/// Output: JSON array of CoverRow
#[wasm_bindgen]
pub fn wasm_cover_evaluate(params_json: &str) -> String {
    let input: CoverInput = match serde_json::from_str(params_json) {
        Ok(v) => v,
        Err(e) => return serde_json::to_string(&ErrorOut { error: e.to_string() }).unwrap(),
    };
    let rows = cover_evaluate(&input.universe, &input.filters, &input.rank_dir);
    serde_json::to_string(&rows).unwrap()
}

/// COMBINE drugs at tissue with synergy
/// Input: JSON { universe, drugs: ["VAN","RIF"], tissue, synergy_factor }
/// Output: JSON CombineResult or { error }
#[wasm_bindgen]
pub fn wasm_combine_drugs(params_json: &str) -> String {
    let input: CombineInput = match serde_json::from_str(params_json) {
        Ok(v) => v,
        Err(e) => return serde_json::to_string(&ErrorOut { error: e.to_string() }).unwrap(),
    };
    match combine_drugs(&input.universe, &input.drugs, &input.tissue, input.synergy_factor) {
        Some(r) => serde_json::to_string(&r).unwrap(),
        None => serde_json::to_string(&ErrorOut { error: "No matching drugs found".into() }).unwrap(),
    }
}

/// DECOMPOSE — full impedance breakdown
/// Input: JSON { universe, drug, tissue }
/// Output: JSON DecomposeResult or { error }
#[wasm_bindgen]
pub fn wasm_decompose(params_json: &str) -> String {
    let input: DecomposeInput = match serde_json::from_str(params_json) {
        Ok(v) => v,
        Err(e) => return serde_json::to_string(&ErrorOut { error: e.to_string() }).unwrap(),
    };
    match decompose(&input.universe, &input.drug, &input.tissue) {
        Some(r) => serde_json::to_string(&r).unwrap(),
        None => serde_json::to_string(&ErrorOut {
            error: format!("Drug '{}' not found at tissue '{}'", input.drug, input.tissue),
        }).unwrap(),
    }
}

/// COMPARE — head-to-head drug comparison
/// Input: JSON { universe, drugs: ["VAN","RIF"], tissue }
/// Output: JSON CompareResult or { error }
#[wasm_bindgen]
pub fn wasm_compare_drugs(params_json: &str) -> String {
    let input: CompareInput = match serde_json::from_str(params_json) {
        Ok(v) => v,
        Err(e) => return serde_json::to_string(&ErrorOut { error: e.to_string() }).unwrap(),
    };
    match compare_drugs(&input.universe, &input.drugs, &input.tissue) {
        Some(r) => serde_json::to_string(&r).unwrap(),
        None => serde_json::to_string(&ErrorOut {
            error: format!("No matching drugs at tissue '{}'", input.tissue),
        }).unwrap(),
    }
}
