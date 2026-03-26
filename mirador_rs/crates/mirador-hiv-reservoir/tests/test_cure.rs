use mirador_hiv_reservoir::*;

fn triple() -> Vec<ArvDrug> {
    let drugs = load_all_drugs();
    vec![
        drugs.iter().find(|d| d.name == "Dolutegravir").unwrap().clone(),
        drugs.iter().find(|d| d.name == "Tenofovir-DF").unwrap().clone(),
        drugs.iter().find(|d| d.name == "Emtricitabine").unwrap().clone(),
    ]
}

// TEST CURE-1: ART alone produces C_total << threshold at GALT
#[test]
fn cure_art_alone_impossible() {
    let t = triple();
    let latency = LatencyModel::default();

    let c_active = compute_c_combo_active(&t, "GALT", &latency, 1.0);
    let c_total = latency.f_active_on_art * c_active;

    assert!(
        c_total < 1e-4,
        "ART alone C_total should be << threshold: {}",
        c_total
    );
}

// TEST CURE-2: Shortfall is ~10^5x at GALT
#[test]
fn cure_shortfall_magnitude() {
    let t = triple();
    let latency = LatencyModel::default();

    let c_active = compute_c_combo_active(&t, "GALT", &latency, 1.0);
    let c_total = latency.f_active_on_art * c_active;
    let shortfall = 1.0 / c_total;

    assert!(
        shortfall > 1e4 && shortfall < 1e6,
        "Shortfall should be ~10^5: {}",
        shortfall
    );
}

// TEST CURE-3: Adding more ARVs does not overcome latency
#[test]
fn cure_five_drugs_still_impossible() {
    let drugs = load_all_drugs();
    let latency = LatencyModel::default();

    let c_active = compute_c_combo_active(&drugs, "GALT", &latency, 1.0);
    let c_total = latency.f_active_on_art * c_active;

    assert!(
        c_total < 1e-3,
        "Even 5 drugs cannot overcome latency: C_total={}",
        c_total
    );
}

// TEST CURE-4: With hypothetical Φ=0.15, GALT becomes curable
#[test]
fn cure_high_phi_works() {
    let t = triple();
    let latency = LatencyModel::default();
    let strong_lra = Lra {
        name: "Hypothetical".into(),
        reactivation_phi: 0.15,
        source: "hypothetical".into(),
    };

    let c = compute_c_with_lra(&t, "GALT", &strong_lra, &latency, 1.0);
    assert!(c >= 1.0, "Φ=0.15 should clear GALT: C={}", c);
}

// TEST CURE-5: Even Φ=1.0 cannot cure CNS (geometric bottleneck)
#[test]
fn cure_cns_geometric_block() {
    let t = triple();
    let latency = LatencyModel::default();
    let perfect_lra = Lra {
        name: "Perfect".into(),
        reactivation_phi: 1.0,
        source: "hypothetical".into(),
    };

    let c = compute_c_with_lra(&t, "CNS", &perfect_lra, &latency, 1.0);
    assert!(
        c < 1.0,
        "Even perfect Φ cannot cure CNS with standard triple: C={}",
        c
    );
}

// TEST CURE-6: CNS with 5-drug regimen + Φ=1 outperforms triple
#[test]
fn cure_cns_five_drug_high_cpe() {
    let drugs = load_all_drugs();
    let latency = LatencyModel::default();
    let perfect_lra = Lra {
        name: "Perfect".into(),
        reactivation_phi: 1.0,
        source: "hypothetical".into(),
    };

    let c5 = compute_c_with_lra(&drugs, "CNS", &perfect_lra, &latency, 1.0);
    let t = vec![drugs[0].clone(), drugs[1].clone(), drugs[2].clone()];
    let c3 = compute_c_with_lra(&t, "CNS", &perfect_lra, &latency, 1.0);

    assert!(c5 > c3, "5 drugs should outperform 3 at CNS");
}
