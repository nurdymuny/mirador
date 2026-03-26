/// Layer M3: Phenotypic Tolerance Manifold.
///
/// Meningitis bacteria exist in two phenotypic populations:
/// 1. CSF planktonic (90%) — fully susceptible, K_phenotype = 0
/// 2. Meningeal surface/exudate (10%) — 2× MIC shift, K = log₁₀(2)
///
/// If shunt/hardware present: biofilm K = 2.7 (100-500× MIC shift),
/// immediately demanding combination therapy.

/// Phenotypic population with weight and curvature.
pub struct PhenotypePop {
    pub weight: f64,
    pub k_phenotype: f64,
}

/// Standard meningitis phenotype populations (no shunt).
pub fn standard_phenotype() -> Vec<PhenotypePop> {
    vec![
        PhenotypePop { weight: 0.9, k_phenotype: 0.0 },            // CSF planktonic
        PhenotypePop { weight: 0.1, k_phenotype: f64::log10(2.0) }, // meningeal surface
    ]
}

/// Shunt/hardware biofilm phenotype — single dominant population.
pub fn shunt_phenotype() -> Vec<PhenotypePop> {
    vec![
        PhenotypePop { weight: 1.0, k_phenotype: 2.7 }, // biofilm
    ]
}

/// Weighted K_phenotype across all populations.
pub fn k_phenotype_weighted(pops: &[PhenotypePop]) -> f64 {
    pops.iter().map(|p| p.weight * p.k_phenotype).sum()
}
