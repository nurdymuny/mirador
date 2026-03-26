use mirador_hiv_reservoir::*;
use approx::assert_relative_eq;

fn triple() -> Vec<ArvDrug> {
    let drugs = load_all_drugs();
    vec![
        drugs.iter().find(|d| d.name == "Dolutegravir").unwrap().clone(),
        drugs.iter().find(|d| d.name == "Tenofovir-DF").unwrap().clone(),
        drugs.iter().find(|d| d.name == "Emtricitabine").unwrap().clone(),
    ]
}

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
    let t = triple();
    let latency = LatencyModel::default();
    let c = compute_c_combo_active(&t, "GALT", &latency, 1.0);
    assert_relative_eq!(c, 8.99, epsilon = 0.1);
}

// TEST COMBO-4: Synergy > 1 increases C_combo proportionally
#[test]
fn combo_synergy_scales() {
    let t = triple();
    let latency = LatencyModel::default();

    let c_no_syn = compute_c_combo_active(&t, "GALT", &latency, 1.0);
    let c_syn = compute_c_combo_active(&t, "GALT", &latency, 2.0);

    assert!(c_syn > c_no_syn * 1.5, "Synergy=2 should roughly double C");
    assert!(c_syn < c_no_syn * 2.5, "Synergy=2 should not more than 2.5x C");
}

// TEST COMBO-5: Kirchhoff tau is conductance-weighted average
#[test]
fn combo_kirchhoff_tau() {
    let drugs = load_all_drugs();
    let pair: Vec<_> = drugs[0..2].to_vec(); // DTG + TFV
    let latency = LatencyModel::default();

    let taus: Vec<f64> = pair.iter().map(|d| compute_tau(d)).collect();
    let min_tau = taus.iter().cloned().fold(f64::INFINITY, f64::min);
    let max_tau = taus.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    let c_combo = compute_c_combo_active(&pair, "GALT", &latency, 1.0);
    let total_g: f64 = pair
        .iter()
        .map(|d| {
            let k = compute_k_pathway(d, "GALT", Phenotype::Active, &latency).max(0.01);
            1.0 / k
        })
        .sum();

    let tau_combo = c_combo / total_g;
    assert!(
        tau_combo >= min_tau - 0.1 && tau_combo <= max_tau + 0.1,
        "Kirchhoff tau {} should be between {} and {}",
        tau_combo,
        min_tau,
        max_tau
    );
}

// TEST COMBO-6: CNS C_combo < 1.0 for standard triple (CSF escape)
#[test]
fn combo_cns_below_threshold() {
    let t = triple();
    let latency = LatencyModel::default();
    let c_cns = compute_c_combo_active(&t, "CNS", &latency, 1.0);
    assert!(
        c_cns < 1.0,
        "CNS C_combo should be below cure threshold: {}",
        c_cns
    );
}

// TEST COMBO-7: Genital tract C_combo >> threshold
#[test]
fn combo_genital_far_above_threshold() {
    let t = triple();
    let latency = LatencyModel::default();
    let c_gen = compute_c_combo_active(&t, "genital_tract", &latency, 1.0);
    assert!(
        c_gen > 100.0,
        "Genital tract C_combo should be far above threshold: {}",
        c_gen
    );
}

// TEST COMBO-8: Empty drug list → C = 0
#[test]
fn combo_empty_drugs() {
    let latency = LatencyModel::default();
    let c = compute_c_combo_active(&[], "GALT", &latency, 1.0);
    assert_eq!(c, 0.0);
}
