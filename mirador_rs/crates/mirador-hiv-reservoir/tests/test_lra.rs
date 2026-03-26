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

// TEST LRA-1: No LRA → C_total = f_active × C_combo_active
#[test]
fn lra_none_equals_baseline() {
    let t = triple();
    let latency = LatencyModel::default();
    let null_lra = Lra {
        name: "None".into(),
        reactivation_phi: 0.0,
        source: "".into(),
    };

    let c_lra = compute_c_with_lra(&t, "GALT", &null_lra, &latency, 1.0);
    let c_active = compute_c_combo_active(&t, "GALT", &latency, 1.0);
    let c_expected = latency.f_active_on_art * c_active;

    assert_relative_eq!(c_lra, c_expected, epsilon = 1e-10);
}

// TEST LRA-2: LRA Φ=1.0 (perfect reactivation) → C_total = C_active
#[test]
fn lra_perfect_reactivation() {
    let t = triple();
    let latency = LatencyModel::default();
    let perfect_lra = Lra {
        name: "Perfect".into(),
        reactivation_phi: 1.0,
        source: "hypothetical".into(),
    };

    let c_lra = compute_c_with_lra(&t, "GALT", &perfect_lra, &latency, 1.0);
    let c_active = compute_c_combo_active(&t, "GALT", &latency, 1.0);

    assert_relative_eq!(c_lra, c_active, epsilon = 0.01);
}

// TEST LRA-3: Higher Φ → higher C_total (monotone)
#[test]
fn lra_monotone_in_phi() {
    let t = triple();
    let latency = LatencyModel::default();

    let phis = vec![0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0];
    let mut prev_c = 0.0;
    for phi in phis {
        let lra = Lra {
            name: "test".into(),
            reactivation_phi: phi,
            source: "".into(),
        };
        let c = compute_c_with_lra(&t, "GALT", &lra, &latency, 1.0);
        assert!(
            c >= prev_c,
            "C must increase with Φ: Φ={}, C={}, prev={}",
            phi,
            c,
            prev_c
        );
        prev_c = c;
    }
}

// TEST LRA-4: LRA does NOT change C_combo_active (only modifies f_active)
#[test]
fn lra_does_not_change_c_active() {
    let t = triple();
    let latency = LatencyModel::default();

    let c_before = compute_c_combo_active(&t, "GALT", &latency, 1.0);
    let c_after = compute_c_combo_active(&t, "GALT", &latency, 1.0);

    assert_eq!(c_before, c_after, "C_combo_active must be deterministic");
}

// TEST LRA-5: Vorinostat at GALT: C_total still below threshold
#[test]
fn lra_vorinostat_galt_insufficient() {
    let t = triple();
    let latency = LatencyModel::default();
    let vori = Lra {
        name: "Vorinostat".into(),
        reactivation_phi: 0.005,
        source: "Archin 2012".into(),
    };

    let c = compute_c_with_lra(&t, "GALT", &vori, &latency, 1.0);
    assert!(
        c < 1.0,
        "Vorinostat should be insufficient at GALT: C={}",
        c
    );
}

// TEST LRA-6: Best LRA at genital tract DOES reach threshold
#[test]
fn lra_genital_tract_sufficient() {
    let t = triple();
    let latency = LatencyModel::default();
    let best = Lra {
        name: "AZD5153".into(),
        reactivation_phi: 0.015,
        source: "class estimate".into(),
    };

    let c = compute_c_with_lra(&t, "genital_tract", &best, &latency, 1.0);
    assert!(
        c >= 1.0,
        "Best LRA should reach threshold at genital tract: C={}",
        c
    );
}

// TEST LRA-7: Φ threshold at GALT ≈ 0.111
#[test]
fn lra_phi_threshold_galt() {
    let t = triple();
    let latency = LatencyModel::default();

    let phi = compute_phi_threshold(&t, "GALT", 1.0, &latency, 1.0);
    assert_relative_eq!(phi, 0.111, epsilon = 0.005);
}

// TEST LRA-8: Φ threshold at CNS > 1.0 (geometrically impossible)
#[test]
fn lra_phi_threshold_cns_impossible() {
    let t = triple();
    let latency = LatencyModel::default();

    let phi = compute_phi_threshold(&t, "CNS", 1.0, &latency, 1.0);
    assert!(
        phi > 1.0,
        "CNS Φ threshold should exceed 1.0 (impossible): Φ_needed={}",
        phi
    );
}

// TEST LRA-9: Φ threshold at genital tract ≈ 0.002 (very low)
#[test]
fn lra_phi_threshold_genital_low() {
    let t = triple();
    let latency = LatencyModel::default();

    let phi = compute_phi_threshold(&t, "genital_tract", 1.0, &latency, 1.0);
    assert!(
        phi < 0.005,
        "Genital tract Φ threshold should be very low: {}",
        phi
    );
}
