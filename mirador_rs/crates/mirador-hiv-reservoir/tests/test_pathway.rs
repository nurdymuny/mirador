use mirador_hiv_reservoir::*;
use approx::assert_relative_eq;

// TEST PATH-1: K_pathway is sum of components (series)
#[test]
fn pathway_is_series_sum() {
    let dtg = load_drug("Dolutegravir");
    let latency = LatencyModel::default();

    let k_total = compute_k_pathway(&dtg, "lymph_node", Phenotype::Active, &latency);
    let k_admet = dtg.k_admet;                   // 0.05
    let k_barrier = compute_k_barrier(0.48);      // 1/0.48 - 1 = 1.0833
    let k_pheno = 0.0;                            // active
    let k_reservoir = 0.0;                        // no fitted param

    assert_relative_eq!(
        k_total,
        k_admet + k_barrier + k_pheno + k_reservoir,
        epsilon = 0.01
    );
}

// TEST PATH-2: Latent pathway has K_phenotype = 6.0 added
#[test]
fn pathway_latent_adds_six() {
    let dtg = load_drug("Dolutegravir");
    let latency = LatencyModel::default();

    let k_active = compute_k_pathway(&dtg, "GALT", Phenotype::Active, &latency);
    let k_latent = compute_k_pathway(&dtg, "GALT", Phenotype::Latent, &latency);

    assert_relative_eq!(k_latent - k_active, 6.0, epsilon = 1e-10);
}

// TEST PATH-3: All K_pathway values positive for non-concentrating drugs
#[test]
fn pathway_all_positive_non_concentrating() {
    let drugs = load_all_drugs();
    let latency = LatencyModel::default();

    for drug in &drugs {
        for res_name in &["CNS", "lymph_node", "bone_marrow"] {
            let r = drug.penetration.get(*res_name).copied().unwrap_or(0.3);
            if r < 1.0 {
                let k = compute_k_pathway(drug, res_name, Phenotype::Active, &latency);
                assert!(
                    k > 0.0,
                    "K must be positive for {} @ {} (R={})",
                    drug.name,
                    res_name,
                    r
                );
            }
        }
    }
}

// TEST PATH-4: Missing reservoir defaults to conservative R=0.3
#[test]
fn pathway_missing_reservoir_default() {
    let mut dtg = load_drug("Dolutegravir");
    dtg.penetration.remove("GALT");
    let latency = LatencyModel::default();

    let k = compute_k_pathway(&dtg, "GALT", Phenotype::Active, &latency);
    let expected_k_barrier = compute_k_barrier(0.3); // 1/0.3 - 1 = 2.333
    assert_relative_eq!(k, dtg.k_admet + expected_k_barrier, epsilon = 0.01);
}

// TEST PATH-5: CNS has highest active K_pathway for DTG
#[test]
fn pathway_cns_hardest_dtg() {
    let dtg = load_drug("Dolutegravir");
    let latency = LatencyModel::default();
    let reservoirs = load_all_reservoirs();

    let mut ks: Vec<(String, f64)> = reservoirs
        .iter()
        .map(|r| {
            (
                r.name.clone(),
                compute_k_pathway(&dtg, &r.name, Phenotype::Active, &latency),
            )
        })
        .collect();
    ks.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    assert_eq!(ks[0].0, "CNS");
}

// TEST PATH-6: Genital tract K_pathway for TFV includes negative K_barrier
// R=3.5 → K_barrier = max(1/3.5 - 1, -1) = -0.714
// K_pathway = 0.15 + (-0.714) = -0.564 (negative — drug concentrates)
#[test]
fn pathway_tfv_genital_negative_barrier() {
    let tfv = load_drug("Tenofovir-DF");
    let latency = LatencyModel::default();

    let k = compute_k_pathway(&tfv, "genital_tract", Phenotype::Active, &latency);
    assert!(
        k < 0.0,
        "TFV genital K_pathway should be negative: {}",
        k
    );
}

// TEST PATH-7: All K values are finite (no parallel lines global check)
#[test]
fn pathway_no_infinities() {
    let drugs = load_all_drugs();
    let latency = LatencyModel::default();
    let reservoirs = load_all_reservoirs();

    for drug in &drugs {
        for res in &reservoirs {
            for pheno in &[Phenotype::Active, Phenotype::Latent] {
                let k = compute_k_pathway(drug, &res.name, *pheno, &latency);
                assert!(
                    k.is_finite(),
                    "K must be finite for {} @ {} ({:?})",
                    drug.name,
                    res.name,
                    pheno
                );
            }
        }
    }
}
