use mirador_hiv_reservoir::*;

// TEST PHE-1: Active phenotype K = 0
#[test]
fn phenotype_active_zero() {
    let latency = LatencyModel::default();
    assert_eq!(compute_k_phenotype(Phenotype::Active, &latency), 0.0);
}

// TEST PHE-2: Latent phenotype K = 6.0 (10^6 fold resistance)
#[test]
fn phenotype_latent_six() {
    let latency = LatencyModel::default();
    assert_eq!(compute_k_phenotype(Phenotype::Latent, &latency), 6.0);
}

// TEST PHE-3: Latent K is finite (no parallel lines)
#[test]
fn phenotype_latent_finite() {
    let latency = LatencyModel::default();
    let k = compute_k_phenotype(Phenotype::Latent, &latency);
    assert!(k.is_finite());
    assert!(k > 0.0);
}

// TEST PHE-4: Latent K dominates — latent pathway always exceeds active
#[test]
fn phenotype_latent_dominates() {
    let latency = LatencyModel::default();
    let drugs = load_all_drugs();
    let reservoirs = load_all_reservoirs();

    for drug in &drugs {
        for res in &reservoirs {
            let k_active = compute_k_pathway(drug, &res.name, Phenotype::Active, &latency);
            let k_latent = compute_k_pathway(drug, &res.name, Phenotype::Latent, &latency);
            assert!(
                k_latent > k_active,
                "Latent K must exceed active K for {} @ {}",
                drug.name,
                res.name
            );
        }
    }
}

// TEST PHE-5: Latent phenotype always reduces C, and the reduction factor
// equals K_active / K_latent (mathematical identity from C = τ/K).
// When K_barrier >> K_phenotype_latent (e.g. CNS), the ratio approaches 1.0
// because the barrier already blocks the drug — latency is irrelevant there.
// When K_barrier is small, latency dominates and the ratio is small.
#[test]
fn phenotype_latent_kills_coherence() {
    let latency = LatencyModel::default();
    let drugs = load_all_drugs();
    let reservoirs = load_all_reservoirs();

    for drug in &drugs {
        for res in &reservoirs {
            let c_active = compute_c_site(drug, &res.name, Phenotype::Active, &latency);
            let c_latent = compute_c_site(drug, &res.name, Phenotype::Latent, &latency);

            // Latent C is always ≤ active C (adding K_phenotype increases denominator)
            assert!(
                c_latent <= c_active,
                "{} @ {}: C_latent={} should be <= C_active={}",
                drug.name, res.name, c_latent, c_active
            );

            // The reduction factor is exactly K_active / K_latent
            let k_active = compute_k_pathway(drug, &res.name, Phenotype::Active, &latency);
            let k_latent = compute_k_pathway(drug, &res.name, Phenotype::Latent, &latency);
            if k_active > 0.01 && k_latent > 0.01 {
                let expected_ratio = k_active / k_latent;
                let actual_ratio = c_latent / c_active;
                assert!(
                    (actual_ratio - expected_ratio).abs() < 0.01,
                    "{} @ {}: ratio={:.4} expected={:.4}",
                    drug.name, res.name, actual_ratio, expected_ratio
                );
            }
        }
    }
}

// TEST PHE-6: Default f_active on ART = 1e-6
#[test]
fn phenotype_default_f_active() {
    let latency = LatencyModel::default();
    assert_eq!(latency.f_active_on_art, 1e-6);
}
