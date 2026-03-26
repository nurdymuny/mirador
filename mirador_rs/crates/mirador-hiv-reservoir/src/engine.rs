use crate::drug::ArvDrug;
use crate::reservoir::HivReservoir;
use crate::phenotype::{LatencyModel, Phenotype, Lra};

/// τ = log10(AUC24 / IC50). Pharmacophoric potential.
pub fn compute_tau(drug: &ArvDrug) -> f64 {
    assert!(drug.auc24_nM_hr > 0.0, "AUC must be positive");
    assert!(drug.ic50_nM > 0.0, "IC50 must be positive");
    (drug.auc24_nM_hr / drug.ic50_nM).log10()
}

/// K_barrier = max(1/R - 1, -1.0).
/// R > 1: drug concentrates (negative curvature, floor -1.0).
/// R → 0: near-total exclusion (cap at 999.0, NOT infinity).
pub fn compute_k_barrier(r: f64) -> f64 {
    if r <= 0.001 {
        return 999.0;
    }
    (1.0 / r - 1.0).max(-1.0)
}

/// K_phenotype for HIV. Two-state model.
pub fn compute_k_phenotype(phenotype: Phenotype, latency: &LatencyModel) -> f64 {
    match phenotype {
        Phenotype::Active => latency.k_phenotype_active,
        Phenotype::Latent => latency.k_phenotype_latent,
    }
}

/// K_pathway = K_admet + K_barrier + K_phenotype.
/// Series sum — each obstacle adds curvature.
pub fn compute_k_pathway(
    drug: &ArvDrug,
    reservoir_name: &str,
    phenotype: Phenotype,
    latency: &LatencyModel,
) -> f64 {
    let r = drug.penetration.get(reservoir_name).copied().unwrap_or(0.3);
    let k_barrier = compute_k_barrier(r);
    let k_pheno = compute_k_phenotype(phenotype, latency);
    drug.k_admet + k_barrier + k_pheno
}

/// C = τ/K for a single drug at a single reservoir.
pub fn compute_c_site(
    drug: &ArvDrug,
    reservoir_name: &str,
    phenotype: Phenotype,
    latency: &LatencyModel,
) -> f64 {
    let tau = compute_tau(drug);
    let k = compute_k_pathway(drug, reservoir_name, phenotype, latency);
    if k <= 0.01 {
        return tau / 0.01;
    }
    tau / k
}

/// Kirchhoff parallel-resistor combination for active virus.
///
/// τ_combo = Σ(τ_i × g_i) / Σ(g_i)   where g_i = 1/K_i
/// C_combo = τ_combo × synergy × Σ(g_i)
pub fn compute_c_combo_active(
    drugs: &[ArvDrug],
    reservoir_name: &str,
    latency: &LatencyModel,
    synergy: f64,
) -> f64 {
    let mut total_g = 0.0_f64;
    let mut weighted_tau = 0.0_f64;

    for drug in drugs {
        let k = compute_k_pathway(drug, reservoir_name, Phenotype::Active, latency).max(0.01);
        let tau = compute_tau(drug);
        let g = 1.0 / k;
        total_g += g;
        weighted_tau += tau * g;
    }

    if total_g <= 0.0 {
        return 0.0;
    }

    let tau_combo = weighted_tau / total_g;
    tau_combo * total_g * synergy
}

/// LRA catalytic modification.
///   f_active_new = f_active_baseline + Φ × (1 - f_active_baseline)
///   C_total = f_active_new × C_combo_active
pub fn compute_c_with_lra(
    drugs: &[ArvDrug],
    reservoir_name: &str,
    lra: &Lra,
    latency: &LatencyModel,
    synergy: f64,
) -> f64 {
    let f_lat = 1.0 - latency.f_active_on_art;
    let f_active_new = latency.f_active_on_art + lra.reactivation_phi * f_lat;
    let c_active = compute_c_combo_active(drugs, reservoir_name, latency, synergy);
    f_active_new * c_active
}

/// Minimum Φ needed to reach cure threshold at a reservoir.
///   Solve: (f_active + Φ × f_latent) × C_active ≥ threshold
///   → Φ ≥ (threshold / C_active - f_active) / f_latent
pub fn compute_phi_threshold(
    drugs: &[ArvDrug],
    reservoir_name: &str,
    cure_threshold: f64,
    latency: &LatencyModel,
    synergy: f64,
) -> f64 {
    let c_active = compute_c_combo_active(drugs, reservoir_name, latency, synergy);
    if c_active <= 0.0 {
        return f64::MAX;
    }
    let f_lat = 1.0 - latency.f_active_on_art;
    let phi = (cure_threshold / c_active - latency.f_active_on_art) / f_lat;
    phi.max(0.0)
}

/// Double Cover computation.
/// S = fraction of reservoirs where C_combo_active ≥ threshold.
/// d² = 1 - S.
/// Returns (S, d², geometric_bottlenecks).
pub fn compute_double_cover(
    drugs: &[ArvDrug],
    reservoirs: &[HivReservoir],
    cure_threshold: f64,
    latency: &LatencyModel,
    synergy: f64,
) -> (f64, f64, Vec<String>) {
    let mut reachable = 0;
    let mut bottlenecks = Vec::new();

    for res in reservoirs {
        let c = compute_c_combo_active(drugs, &res.name, latency, synergy);
        if c >= cure_threshold {
            reachable += 1;
        } else {
            bottlenecks.push(res.name.clone());
        }
    }

    let s = reachable as f64 / reservoirs.len() as f64;
    let d2 = 1.0 - s;
    (s, d2, bottlenecks)
}

/// Clearance ordering. Score = C_combo_active / latent_fraction.
/// Higher score = clears faster.
pub fn compute_clearance_order(
    drugs: &[ArvDrug],
    reservoirs: &[HivReservoir],
    latency: &LatencyModel,
    synergy: f64,
) -> Vec<String> {
    let mut scores: Vec<(String, f64)> = reservoirs
        .iter()
        .map(|res| {
            let c = compute_c_combo_active(drugs, &res.name, latency, synergy);
            let score = c / res.latent_fraction.max(0.001);
            (res.name.clone(), score)
        })
        .collect();

    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
    scores.into_iter().map(|(name, _)| name).collect()
}
