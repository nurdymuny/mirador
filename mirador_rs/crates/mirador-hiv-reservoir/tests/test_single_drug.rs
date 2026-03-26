use mirador_hiv_reservoir::*;
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

// TEST SD-2: DTG CNS C_site = 0.054
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
    let mut cns_scores: Vec<(String, f64)> = drugs
        .iter()
        .map(|d| {
            (
                d.name.clone(),
                compute_c_site(d, "CNS", Phenotype::Active, &latency),
            )
        })
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
    let mut scores: Vec<(String, f64)> = reservoirs
        .iter()
        .map(|r| {
            (
                r.name.clone(),
                compute_c_site(&dtg, &r.name, Phenotype::Active, &latency),
            )
        })
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
    let mut scores: Vec<(String, f64)> = reservoirs
        .iter()
        .map(|r| {
            (
                r.name.clone(),
                compute_c_site(&tfv, &r.name, Phenotype::Active, &latency),
            )
        })
        .collect();
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    assert_eq!(scores[0].0, "genital_tract");
}

// TEST SD-7: Latent C is always less than active C.
// At reservoirs with small K_barrier (< K_phenotype_latent), the reduction is large.
// At CNS where K_barrier ≈ 99, the 6.0 barely changes the denominator.
#[test]
fn c_latent_negligible() {
    let drugs = load_all_drugs();
    let latency = LatencyModel::default();
    let reservoirs = load_all_reservoirs();
    for drug in &drugs {
        for res in &reservoirs {
            let c_a = compute_c_site(drug, &res.name, Phenotype::Active, &latency);
            let c_l = compute_c_site(drug, &res.name, Phenotype::Latent, &latency);
            assert!(
                c_l < c_a,
                "{} @ {}: C_latent={} should be < C_active={}",
                drug.name,
                res.name,
                c_l,
                c_a
            );
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
                assert!(
                    c >= 0.0,
                    "C must be >= 0 for {} @ {} ({:?})",
                    drug.name,
                    res.name,
                    pheno
                );
            }
        }
    }
}

// TEST SD-9: Higher tau → higher C (all else equal)
#[test]
fn c_monotone_in_tau() {
    let drugs = load_all_drugs();
    let latency = LatencyModel::default();
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
    let c_cns = compute_c_site(&dtg, "CNS", Phenotype::Active, &latency);
    let c_lymph = compute_c_site(&dtg, "lymph_node", Phenotype::Active, &latency);
    assert!(c_cns < c_lymph, "Lower R should give lower C");
}
