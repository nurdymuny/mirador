//! WASM bridge — Meningitis BBB module
//!
//! Single JSON-in / JSON-out function so JSX never contains math.
//! The frontend calls `compute_meningitis(params_json)` and renders the result.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use mirador_meningitis::{
    MeningitisDrug, MeningitisPatient,
    load_meningitis_drugs,
    r_bbb, k_barrier, effective_penetration,
    standard_phenotype, shunt_phenotype, k_phenotype_weighted,
    standard_reservoirs, k_reservoir,
    compute_c_site, find_failure_time, compute_c_combo,
};

// ─── Input ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct Input {
    /// Drug names, e.g. ["Ceftriaxone", "Rifampin", "Linezolid"]
    drugs: Vec<String>,
    #[serde(default = "def_age")]
    age_years: f64,
    #[serde(default = "def_dex")]
    dexamethasone: bool,
    #[serde(default)]
    shunt: bool,
    #[serde(default = "def_thr")]
    threshold: f64,
    #[serde(default)]
    inspect_day: f64,
    #[serde(default = "def_syn")]
    synergy: f64,
}

fn def_age() -> f64 { 45.0 }
fn def_dex() -> bool { true }
fn def_thr() -> f64 { 0.50 }
fn def_syn() -> f64 { 1.0 }

// ─── Output structures ─────────────────────────────────────────────────────

#[derive(Serialize, Debug)]
pub struct PatientSummary {
    pub age_years: f64,
    pub neonatal: bool,
    pub dexamethasone: bool,
    pub shunt: bool,
    pub t_half: f64,
    pub t_half_no_dex: f64,
    pub k_phenotype: f64,
    pub k_reservoir: f64,
    pub neonatal_r_multiplier: f64,
}

#[derive(Serialize, Debug)]
pub struct NicheSummary {
    pub name: String,
    pub weight: f64,
    pub access: f64,
    pub k_niche: f64,
}

#[derive(Serialize, Debug)]
pub struct DrugInfo {
    pub name: String,
    pub drug_class: String,
    pub abbr: String,
    pub dose: String,
    pub auc24: f64,
    pub mic: f64,
    pub tau: f64,
    pub k_admet: f64,
    pub r_base: f64,
    pub r_peak: f64,
    pub refs: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct Breakdown {
    pub day: f64,
    pub r_bbb: f64,
    pub k_admet: f64,
    pub k_barrier: f64,
    pub k_phenotype: f64,
    pub k_reservoir: f64,
    pub k_pathway: f64,
    pub c_site: f64,
}

#[derive(Serialize, Debug)]
pub struct PerDrug {
    pub tau: f64,
    pub c_t0: f64,
    /// Day C drops below threshold. -1.0 = never fails within 30 days.
    pub failure_day: f64,
    /// Failure day with dexamethasone OFF. -1.0 = never fails.
    pub failure_day_no_dex: f64,
    pub breakdown_t0: Breakdown,
    pub breakdown_inspect: Breakdown,
    /// [[day, c], ...] — 101 points over 14 days
    pub timeseries: Vec<[f64; 2]>,
}

#[derive(Serialize, Debug)]
pub struct RankedDrug {
    pub name: String,
    pub c: f64,
}

#[derive(Serialize, Debug)]
pub struct ComboData {
    pub c_t0: f64,
    pub c_t14: f64,
    pub timeseries: Vec<[f64; 2]>,
}

#[derive(Serialize, Debug)]
pub struct Output {
    pub patient: PatientSummary,
    pub niches: Vec<NicheSummary>,
    pub all_drugs: Vec<DrugInfo>,
    pub per_drug: HashMap<String, PerDrug>,
    pub combo: ComboData,
    pub rankings: HashMap<String, Vec<RankedDrug>>,
    pub threshold: f64,
}

#[derive(Serialize)]
struct WasmError {
    error: String,
}

// ─── Drug presentation metadata ─────────────────────────────────────────────

/// Returns (display_name, abbr, class, dose, refs) for a drug.
fn drug_meta(registry_name: &str) -> (&'static str, &'static str, &'static str, &'static str, &'static str) {
    match registry_name {
        "ceftriaxone" => ("Ceftriaxone", "CRO", "Cephalosporin",
                          "2g IV q12h",
                          "Nau 2010 \u{00b7} Lutsar 2000 \u{00b7} FDA label"),
        "vancomycin"  => ("Vancomycin",  "VAN", "Glycopeptide",
                          "15mg/kg IV q6h",
                          "Nau 2010 \u{00b7} Lutsar 2000 \u{00b7} FDA label"),
        "rifampin"    => ("Rifampin",    "RIF", "Rifamycin",
                          "600mg IV/PO q24h",
                          "Nau 2010 \u{00b7} Tuchscherr 2011"),
        "linezolid"   => ("Linezolid",   "LZD", "Oxazolidinone",
                          "600mg IV/PO q12h",
                          "Nau 2010 \u{00b7} Beer 2007 \u{00b7} FDA label"),
        _ => ("Unknown", "???", "Unknown", "N/A", "N/A"),
    }
}

/// Map display name → registry (lowercase) name.
fn to_registry_name(input: &str) -> String {
    input.to_lowercase()
}

/// Map registry name → display name.
fn to_display_name(registry_name: &str) -> String {
    drug_meta(registry_name).0.to_string()
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn build_breakdown(
    drug: &MeningitisDrug,
    pt: &MeningitisPatient,
    t: f64,
    kph: f64,
    kr: f64,
) -> Breakdown {
    let (rb, rp) = effective_penetration(
        drug.r_base, drug.r_peak, pt.neonatal_r_multiplier(),
    );
    let r = r_bbb(t, rb, rp, pt.t_half());
    let kb = k_barrier(r);
    let kw = drug.k_admet + kb + kph + kr;
    let c = drug.tau() / kw;
    Breakdown {
        day: r4(t),
        r_bbb: r6(r),
        k_admet: r4(drug.k_admet),
        k_barrier: r4(kb),
        k_phenotype: r4(kph),
        k_reservoir: r4(kr),
        k_pathway: r4(kw),
        c_site: r4(c),
    }
}

fn r4(v: f64) -> f64 { (v * 1e4).round() / 1e4 }
fn r6(v: f64) -> f64 { (v * 1e6).round() / 1e6 }

// ─── WASM entry point ──────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn compute_meningitis(params_json: &str) -> String {
    match compute_inner(params_json) {
        Ok(out) => serde_json::to_string(&out).unwrap_or_else(|e| {
            serde_json::to_string(&WasmError { error: e.to_string() }).unwrap()
        }),
        Err(e) => serde_json::to_string(&WasmError { error: e }).unwrap_or_default(),
    }
}

pub fn compute_inner(json: &str) -> Result<Output, String> {
    let inp: Input =
        serde_json::from_str(json).map_err(|e| format!("Invalid input JSON: {e}"))?;

    if inp.drugs.is_empty() {
        return Err("No drugs specified".into());
    }

    // ── Build patients ──────────────────────────
    let pt = MeningitisPatient {
        age_years: inp.age_years,
        csf_wbc: 2000.0,
        dexamethasone: inp.dexamethasone,
        shunt: inp.shunt,
    };
    let pt_no_dex = MeningitisPatient {
        age_years: inp.age_years,
        csf_wbc: 2000.0,
        dexamethasone: false,
        shunt: inp.shunt,
    };

    // ── Phenotype & reservoir (computed once) ───
    let pops = if inp.shunt { shunt_phenotype() } else { standard_phenotype() };
    let kph = k_phenotype_weighted(&pops);
    let reservoirs = standard_reservoirs();
    let kr = k_reservoir(&reservoirs);

    // ── All drugs (full registry) ───────────────
    let registry = load_meningitis_drugs();
    let all_drugs: Vec<DrugInfo> = registry
        .iter()
        .map(|d| {
            let (dname, abbr, cls, dose, refs) = drug_meta(&d.name);
            DrugInfo {
                name: dname.into(),
                drug_class: cls.into(),
                abbr: abbr.into(),
                dose: dose.into(),
                auc24: d.auc24,
                mic: d.mic,
                tau: r4(d.tau()),
                k_admet: d.k_admet,
                r_base: d.r_base,
                r_peak: d.r_peak,
                refs: refs.into(),
            }
        })
        .collect();

    // ── Resolve selected drugs ──────────────────
    let mut selected: Vec<&MeningitisDrug> = Vec::new();
    for name in &inp.drugs {
        let key = to_registry_name(name);
        let drug = registry
            .iter()
            .find(|d| d.name == key)
            .ok_or_else(|| format!("Unknown drug: {name}"))?;
        selected.push(drug);
    }

    // ── Per-drug results ────────────────────────
    let mut per_drug = HashMap::new();
    for &drug in &selected {
        let tau = drug.tau();
        let c_t0 = compute_c_site(drug, &pt, 0.0);
        let fail = find_failure_time(drug, &pt, inp.threshold, 30.0);
        let fail_nd = find_failure_time(drug, &pt_no_dex, inp.threshold, 30.0);

        let bd_t0 = build_breakdown(drug, &pt, 0.0, kph, kr);
        let bd_ins = build_breakdown(drug, &pt, inp.inspect_day, kph, kr);

        // Timeseries: 101 points over 14 days
        let ts: Vec<[f64; 2]> = (0..=100)
            .map(|i| {
                let t = (i as f64) / 100.0 * 14.0;
                [r4(t), r4(compute_c_site(drug, &pt, t))]
            })
            .collect();

        let display = to_display_name(&drug.name);
        per_drug.insert(
            display,
            PerDrug {
                tau: r4(tau),
                c_t0: r4(c_t0),
                failure_day: fail.map(|f| r4(f)).unwrap_or(-1.0),
                failure_day_no_dex: fail_nd.map(|f| r4(f)).unwrap_or(-1.0),
                breakdown_t0: bd_t0,
                breakdown_inspect: bd_ins,
                timeseries: ts,
            },
        );
    }

    // ── Combo ───────────────────────────────────
    let c_t0 = compute_c_combo(&selected, &pt, 0.0, inp.synergy);
    let c_t14 = compute_c_combo(&selected, &pt, 14.0, inp.synergy);
    let combo_ts: Vec<[f64; 2]> = (0..=100)
        .map(|i| {
            let t = (i as f64) / 100.0 * 14.0;
            [r4(t), r4(compute_c_combo(&selected, &pt, t, inp.synergy))]
        })
        .collect();

    // ── Rankings at key days ────────────────────
    let mut rankings = HashMap::new();
    for day_s in &["0", "1", "3", "7", "14"] {
        let day: f64 = day_s.parse().unwrap();
        let mut ranked: Vec<RankedDrug> = selected
            .iter()
            .map(|d| RankedDrug {
                name: to_display_name(&d.name),
                c: r4(compute_c_site(d, &pt, day)),
            })
            .collect();
        ranked.sort_by(|a, b| b.c.partial_cmp(&a.c).unwrap());
        rankings.insert(day_s.to_string(), ranked);
    }

    // ── Niches ──────────────────────────────────
    let niches: Vec<NicheSummary> = reservoirs
        .iter()
        .map(|r| NicheSummary {
            name: r.name.to_string(),
            weight: r.weight,
            access: r.access,
            k_niche: r4(r.weight * (1.0 - r.access)),
        })
        .collect();

    Ok(Output {
        patient: PatientSummary {
            age_years: inp.age_years,
            neonatal: pt.is_neonatal(),
            dexamethasone: inp.dexamethasone,
            shunt: inp.shunt,
            t_half: pt.t_half(),
            t_half_no_dex: 4.0,
            k_phenotype: r4(kph),
            k_reservoir: r4(kr),
            neonatal_r_multiplier: pt.neonatal_r_multiplier(),
        },
        niches,
        all_drugs,
        per_drug,
        combo: ComboData {
            c_t0: r4(c_t0),
            c_t14: r4(c_t14),
            timeseries: combo_ts,
        },
        rankings,
        threshold: inp.threshold,
    })
}

// ─── Tests — validated against meningitis_math_validation.py ────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn default_input() -> String {
        serde_json::json!({
            "drugs": ["Ceftriaxone", "Vancomycin", "Rifampin", "Linezolid"],
            "age_years": 45,
            "dexamethasone": true,
            "shunt": false,
            "threshold": 0.50,
            "inspect_day": 0.0,
            "synergy": 1.0
        })
        .to_string()
    }

    fn run(json: &str) -> Output {
        compute_inner(json).expect("compute failed")
    }

    // ── τ values (spec validated) ──────────────
    #[test]
    fn tau_ceftriaxone() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert!((cro.tau - 4.8239).abs() < 0.001, "tau CRO = {}", cro.tau);
    }

    #[test]
    fn tau_vancomycin() {
        let out = run(&default_input());
        let van = out.per_drug.get("Vancomycin").unwrap();
        assert!((van.tau - 2.6021).abs() < 0.001, "tau VAN = {}", van.tau);
    }

    #[test]
    fn tau_rifampin() {
        let out = run(&default_input());
        let rif = out.per_drug.get("Rifampin").unwrap();
        assert!((rif.tau - 2.0792).abs() < 0.001, "tau RIF = {}", rif.tau);
    }

    #[test]
    fn tau_linezolid() {
        let out = run(&default_input());
        let lzd = out.per_drug.get("Linezolid").unwrap();
        assert!((lzd.tau - 2.0969).abs() < 0.001, "tau LZD = {}", lzd.tau);
    }

    // ── Patient computed values ────────────────
    #[test]
    fn k_reservoir_value() {
        let out = run(&default_input());
        assert!(
            (out.patient.k_reservoir - 0.26).abs() < 0.001,
            "K_res = {}",
            out.patient.k_reservoir
        );
    }

    #[test]
    fn k_phenotype_normal() {
        let out = run(&default_input());
        assert!(
            (out.patient.k_phenotype - 0.0301).abs() < 0.005,
            "K_pheno = {}",
            out.patient.k_phenotype
        );
    }

    #[test]
    fn t_half_with_dex() {
        let out = run(&default_input());
        assert!((out.patient.t_half - 1.5).abs() < 0.001);
        assert!((out.patient.t_half_no_dex - 4.0).abs() < 0.001);
    }

    // ── C(t=0) values (math validation) ───────
    #[test]
    fn c_t0_ceftriaxone_dex() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert!(
            (cro.c_t0 - 0.771).abs() < 0.02,
            "c_t0 CRO = {}",
            cro.c_t0
        );
    }

    #[test]
    fn c_t0_linezolid_dex() {
        let out = run(&default_input());
        let lzd = out.per_drug.get("Linezolid").unwrap();
        assert!(
            (lzd.c_t0 - 2.283).abs() < 0.05,
            "c_t0 LZD = {}",
            lzd.c_t0
        );
    }

    // ── Failure days (Dex paradox) ─────────────
    #[test]
    fn failure_ceftriaxone_dex() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert!(
            cro.failure_day > 0.0 && cro.failure_day < 2.0,
            "CRO fail = {} (expected ~0.97)",
            cro.failure_day
        );
    }

    #[test]
    fn failure_ceftriaxone_no_dex() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert!(
            cro.failure_day_no_dex > 2.0 && cro.failure_day_no_dex < 3.5,
            "CRO no-dex = {} (expected ~2.59)",
            cro.failure_day_no_dex
        );
    }

    #[test]
    fn linezolid_never_fails() {
        let out = run(&default_input());
        let lzd = out.per_drug.get("Linezolid").unwrap();
        assert_eq!(lzd.failure_day, -1.0, "LZD should never fail");
    }

    #[test]
    fn rifampin_fails_day_2_to_3() {
        let out = run(&default_input());
        let rif = out.per_drug.get("Rifampin").unwrap();
        assert!(
            rif.failure_day > 2.0 && rif.failure_day < 4.0,
            "RIF fail = {} (expected ~2.86)",
            rif.failure_day
        );
    }

    // ── Rankings at t=0 ───────────────────────
    #[test]
    fn ranking_t0_order() {
        let out = run(&default_input());
        let rank = out.rankings.get("0").unwrap();
        assert_eq!(rank[0].name, "Linezolid",   "rank0 #1");
        assert_eq!(rank[1].name, "Rifampin",    "rank0 #2");
        assert_eq!(rank[2].name, "Ceftriaxone", "rank0 #3");
        assert_eq!(rank[3].name, "Vancomycin",  "rank0 #4");
    }

    #[test]
    fn ranking_t14_linezolid_still_top() {
        let out = run(&default_input());
        let rank = out.rankings.get("14").unwrap();
        assert_eq!(rank[0].name, "Linezolid", "LZD should still be #1 at day 14");
    }

    // ── Combination ───────────────────────────
    #[test]
    fn combo_cro_lzd_day14() {
        let input = serde_json::json!({
            "drugs": ["Ceftriaxone", "Linezolid"],
            "dexamethasone": true,
            "threshold": 0.50,
            "synergy": 1.0
        })
        .to_string();
        let out = run(&input);
        assert!(
            out.combo.c_t14 > 1.0,
            "combo CRO+LZD day14 = {} (expected ~1.105)",
            out.combo.c_t14
        );
    }

    // ── Neonatal ──────────────────────────────
    #[test]
    fn neonatal_extends_window() {
        let input = serde_json::json!({
            "drugs": ["Ceftriaxone"],
            "age_years": 0.02,
            "dexamethasone": true,
            "threshold": 0.50
        })
        .to_string();
        let out = run(&input);
        assert!(out.patient.neonatal);
        assert!((out.patient.neonatal_r_multiplier - 3.0).abs() < 0.001);
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert!(
            cro.failure_day > 3.0,
            "neonatal CRO fail = {} (expected ~3.9)",
            cro.failure_day
        );
    }

    // ── Shunt ─────────────────────────────────
    #[test]
    fn shunt_elevates_k_phenotype() {
        let input = serde_json::json!({
            "drugs": ["Ceftriaxone"],
            "shunt": true,
            "threshold": 0.50
        })
        .to_string();
        let out = run(&input);
        assert!(
            (out.patient.k_phenotype - 2.70).abs() < 0.05,
            "shunt k_pheno = {}",
            out.patient.k_phenotype
        );
    }

    // ── Registry ──────────────────────────────
    #[test]
    fn all_drugs_returned() {
        let out = run(&default_input());
        assert_eq!(out.all_drugs.len(), 4);
        let names: Vec<&str> = out.all_drugs.iter().map(|d| d.name.as_str()).collect();
        assert!(names.contains(&"Ceftriaxone"));
        assert!(names.contains(&"Vancomycin"));
        assert!(names.contains(&"Rifampin"));
        assert!(names.contains(&"Linezolid"));
    }

    #[test]
    fn drug_info_has_metadata() {
        let out = run(&default_input());
        let cro = out.all_drugs.iter().find(|d| d.name == "Ceftriaxone").unwrap();
        assert_eq!(cro.abbr, "CRO");
        assert_eq!(cro.drug_class, "Cephalosporin");
        assert_eq!(cro.dose, "2g IV q12h");
        assert!((cro.auc24 - 1000.0).abs() < 0.01);
        assert!((cro.mic - 0.015).abs() < 0.001);
    }

    // ── Timeseries ────────────────────────────
    #[test]
    fn timeseries_101_points() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert_eq!(cro.timeseries.len(), 101);
        assert_eq!(cro.timeseries[0][0], 0.0);
        assert!((cro.timeseries[100][0] - 14.0).abs() < 0.01);
    }

    #[test]
    fn timeseries_monotone_decreasing_cro() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        // CRO C(t) should be monotone decreasing (BBB seals)
        let first_c = cro.timeseries[0][1];
        let last_c = cro.timeseries[100][1];
        assert!(first_c > last_c, "CRO should decrease: {} > {}", first_c, last_c);
    }

    // ── Niches ────────────────────────────────
    #[test]
    fn niches_correct() {
        let out = run(&default_input());
        assert_eq!(out.niches.len(), 3);
        let csf = out.niches.iter().find(|n| n.name == "CSF Bulk").unwrap();
        assert!((csf.weight - 0.7).abs() < 0.001);
        assert!((csf.access - 0.9).abs() < 0.001);
        assert!((csf.k_niche - 0.07).abs() < 0.001);
    }

    // ── Breakdown ─────────────────────────────
    #[test]
    fn breakdown_t0_k_barrier_cro() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert!(
            (cro.breakdown_t0.k_barrier - 5.667).abs() < 0.1,
            "CRO K_barrier(0) = {} (expected ~5.667)",
            cro.breakdown_t0.k_barrier
        );
    }

    #[test]
    fn breakdown_t0_k_pathway_cro() {
        let out = run(&default_input());
        let cro = out.per_drug.get("Ceftriaxone").unwrap();
        assert!(
            (cro.breakdown_t0.k_pathway - 6.257).abs() < 0.1,
            "CRO K_pathway(0) = {} (expected ~6.257)",
            cro.breakdown_t0.k_pathway
        );
    }

    // ── Error handling ────────────────────────
    #[test]
    fn empty_drugs_error() {
        let input = serde_json::json!({ "drugs": [] }).to_string();
        assert!(compute_inner(&input).is_err());
    }

    #[test]
    fn unknown_drug_error() {
        let input = serde_json::json!({ "drugs": ["NotADrug"] }).to_string();
        assert!(compute_inner(&input).is_err());
    }

    // ── Case insensitive input ────────────────
    #[test]
    fn case_insensitive_drug_names() {
        let input = serde_json::json!({
            "drugs": ["ceftriaxone", "LINEZOLID"],
            "threshold": 0.50
        })
        .to_string();
        let out = run(&input);
        assert!(out.per_drug.contains_key("Ceftriaxone"));
        assert!(out.per_drug.contains_key("Linezolid"));
    }

    // ── JSON roundtrip ────────────────────────
    #[test]
    fn json_roundtrip() {
        let raw = compute_meningitis(&default_input());
        let v: serde_json::Value = serde_json::from_str(&raw).expect("invalid JSON");
        assert!(v.get("patient").is_some());
        assert!(v.get("per_drug").is_some());
        assert!(v.get("combo").is_some());
        assert!(v.get("rankings").is_some());
        assert!(v.get("niches").is_some());
        assert!(v.get("all_drugs").is_some());
        assert!(v.get("error").is_none());
    }

    // ── Dex OFF ───────────────────────────────
    #[test]
    fn no_dex_t_half_is_4() {
        let input = serde_json::json!({
            "drugs": ["Ceftriaxone"],
            "dexamethasone": false,
            "threshold": 0.50
        })
        .to_string();
        let out = run(&input);
        assert!((out.patient.t_half - 4.0).abs() < 0.001);
    }
}
