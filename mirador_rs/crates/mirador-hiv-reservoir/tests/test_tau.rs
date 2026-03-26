use mirador_hiv_reservoir::*;
use approx::assert_relative_eq;

// TEST TAU-1: Basic tau computation
// τ = log10(AUC24 / IC50)
// Dolutegravir: log10(126400 / 0.51) = log10(247843) ≈ 5.394
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
    let min_drug = drugs
        .iter()
        .min_by(|a, b| {
            compute_tau(a)
                .partial_cmp(&compute_tau(b))
                .unwrap()
        })
        .unwrap();
    assert_eq!(min_drug.name, "Tenofovir-DF");
}

// TEST TAU-3: All tau values positive (AUC > IC50 for all drugs)
#[test]
fn tau_all_positive() {
    let drugs = load_all_drugs();
    for drug in &drugs {
        let tau = compute_tau(drug);
        assert!(
            tau > 0.0,
            "τ must be positive for {}: AUC={}, IC50={}",
            drug.name,
            drug.auc24_nM_hr,
            drug.ic50_nM
        );
    }
}

// TEST TAU-4: Tau ordering matches known IQ ranking
// DTG > EFV > DRV > FTC > TFV
#[test]
fn tau_ordering() {
    let drugs = load_all_drugs();
    let mut taus: Vec<(String, f64)> = drugs
        .iter()
        .map(|d| (d.name.clone(), compute_tau(d)))
        .collect();
    taus.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    let names: Vec<&str> = taus.iter().map(|t| t.0.as_str()).collect();
    assert_eq!(
        names,
        vec![
            "Dolutegravir",
            "Efavirenz",
            "Darunavir",
            "Emtricitabine",
            "Tenofovir-DF"
        ]
    );
}

// TEST TAU-5: Panics on zero IC50
#[test]
#[should_panic(expected = "IC50 must be positive")]
fn tau_panics_zero_ic50() {
    let mut drug = load_drug("Dolutegravir");
    drug.ic50_nM = 0.0;
    compute_tau(&drug);
}
