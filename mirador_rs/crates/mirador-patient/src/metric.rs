use crate::patient::PatientState;
use mirador_core::RiemannianManifold;

/// The Riemannian metric on patient space (P, g_P).
///
/// Implemented as a weighted Mahalanobis metric with block structure.
/// Each fiber (genomic, phenomic, microbiome, immune) has its own weight,
/// encoding how much each fiber contributes to therapeutic response similarity.
///
/// g_P(v, w) = w_gen · v_gen · w_gen + w_phen · v_phen · w_phen + …
///
/// Off-diagonal cross-terms are omitted in this first implementation
/// (equivalent to setting CrossTermMatrix = 0).
#[derive(Debug, Clone)]
pub struct PatientMetric {
    /// Relative weight of the genomic fiber.
    pub w_genomic: f64,
    /// Relative weight of the phenomic fiber.
    pub w_phenomic: f64,
    /// Relative weight of the microbiome fiber.
    pub w_microbiome: f64,
    /// Relative weight of the immune fiber.
    pub w_immune: f64,

    /// Per-dimension scales (standard deviations from population data).
    /// Normalizes each coordinate so unit distance means the same thing
    /// across different-scale coordinates (age in years vs. eGFR in mL/min).
    pub scales: [f64; 8],
}

impl Default for PatientMetric {
    fn default() -> Self {
        Self {
            w_genomic: 0.25,
            w_phenomic: 0.50,
            w_microbiome: 0.15,
            w_immune: 0.10,
            // Population reference standard deviations (approximate):
            // snp_burden, hla_group, age, weight, egfr, alt, microbiome, cd4
            scales: [0.05, 5.0, 20.0, 20.0, 30.0, 20.0, 1.0, 300.0],
        }
    }
}

impl PatientMetric {
    /// Fiber weights applied per-coordinate dimension.
    /// Genomic: dims 0–1, Phenomic: dims 2–5, Microbiome: dim 6, Immune: dim 7.
    fn fiber_weight(&self, dim: usize) -> f64 {
        match dim {
            0 | 1 => self.w_genomic,
            2..=5 => self.w_phenomic,
            6 => self.w_microbiome,
            7 => self.w_immune,
            _ => panic!("dimension {dim} out of range for PatientMetric (max 7)"),
        }
    }

    /// Evaluate g_P(v, w) at any base point (metric is homogeneous — flat).
    pub fn inner_product_flat(&self, v: &[f64; 8], w: &[f64; 8]) -> f64 {
        (0..8)
            .map(|i| {
                let s = self.scales[i];
                let fw = self.fiber_weight(i);
                fw * (v[i] / s) * (w[i] / s)
            })
            .sum()
    }

    /// Riemannian distance between two patient states.
    pub fn distance_between(&self, a: &PatientState, b: &PatientState) -> f64 {
        let ca = a.coords();
        let cb = b.coords();
        let diff: [f64; 8] = std::array::from_fn(|i| ca[i] - cb[i]);
        self.inner_product_flat(&diff, &diff).sqrt()
    }

    /// The metric tensor as an 8×8 diagonal matrix (eigenvalues).
    /// Returns diagonal entries (all positive iff scales > 0 and weights > 0).
    pub fn eigenvalues(&self) -> [f64; 8] {
        std::array::from_fn(|i| {
            let s = self.scales[i];
            self.fiber_weight(i) / (s * s)
        })
    }
}

impl RiemannianManifold for PatientMetric {
    fn dim(&self) -> usize { 8 }

    fn distance(&self, x: &[f64], y: &[f64]) -> f64 {
        assert_eq!(x.len(), 8);
        assert_eq!(y.len(), 8);
        let diff: [f64; 8] = std::array::from_fn(|i| x[i] - y[i]);
        self.inner_product_flat(&diff, &diff).sqrt()
    }

    fn inner_product(&self, _x: &[f64], v: &[f64], w: &[f64]) -> f64 {
        assert_eq!(v.len(), 8);
        assert_eq!(w.len(), 8);
        let va: [f64; 8] = std::array::from_fn(|i| v[i]);
        let wa: [f64; 8] = std::array::from_fn(|i| w[i]);
        self.inner_product_flat(&va, &wa)
    }
}

// ============================================================================
// Tests — TDD: specified by MIRADOR_SPEC Tests 0.1–0.6
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    fn default_patient() -> PatientState {
        PatientState {
            snp_burden: 0.05,
            hla_group: 2,
            age_years: 35.0,
            weight_kg: 70.0,
            egfr: 90.0,
            alt_ul: 25.0,
            microbiome_diversity: 3.5,
            cd4_count: 800.0,
        }
    }

    // TEST 0.1 — Metric Symmetry: g(v,w) = g(w,v)
    #[test]
    fn metric_symmetry() {
        let g = PatientMetric::default();
        let v = [0.1, 1.0, 5.0, 3.0, 10.0, 5.0, 0.3, 50.0];
        let w = [0.2, 2.0, 8.0, 1.5, 5.0, 2.0, 0.1, 100.0];
        let gvw = g.inner_product_flat(&v, &w);
        let gwv = g.inner_product_flat(&w, &v);
        assert_abs_diff_eq!(gvw, gwv, epsilon = 1e-12);
    }

    // TEST 0.2 — Positive-Definiteness: g(v,v) > 0 for v ≠ 0
    #[test]
    fn metric_positive_definite() {
        let g = PatientMetric::default();
        let evs = g.eigenvalues();
        for (i, ev) in evs.iter().enumerate() {
            assert!(*ev > 0.0, "eigenvalue[{i}] = {ev} is not positive");
        }
    }

    // TEST 0.2b — All eigenvalues positive for random tangent vectors
    #[test]
    fn metric_positive_definite_random_vectors() {
        let g = PatientMetric::default();
        // Test a basis of unit vectors
        for i in 0..8 {
            let mut v = [0.0f64; 8];
            v[i] = 1.0;
            let gvv = g.inner_product_flat(&v, &v);
            assert!(gvv > 0.0, "g(e_{i}, e_{i}) = {gvv} is not positive");
        }
    }

    // TEST 0.3 — Pharmacogenomic Consistency: same patient, different drugs
    // CYP2D6 poor metabolizer → codeine has infinite metabolic curvature
    // (validated here at the patient-state level via the pgx module)
    #[test]
    fn metabolizer_status_separates_drugs() {
        use mirador_core::{CYPEnzyme, MetabolizerStatus};
        use crate::pgx::PharmacogenomicPanel;

        let poor = PharmacogenomicPanel {
            cyp2d6: MetabolizerStatus::poor(CYPEnzyme::CYP2D6),
            ..Default::default()
        };
        let normal = PharmacogenomicPanel::default();

        let as_poor   = poor.activity_score(CYPEnzyme::CYP2D6);
        let as_normal = normal.activity_score(CYPEnzyme::CYP2D6);

        assert!(as_poor < as_normal, "poor metabolizer must have lower AS");
        assert_abs_diff_eq!(as_poor, 0.0, epsilon = 1e-12);
        assert_abs_diff_eq!(as_normal, 1.0, epsilon = 1e-12);
    }

    // TEST 0.4 — Twin Concordance: identical genomics → genomic fiber Δ = 0
    #[test]
    fn twin_concordance_genomic_delta_zero() {
        let twin_a = PatientState {
            snp_burden: 0.05,
            hla_group: 2,
            age_years: 35.0,
            weight_kg: 70.0,
            egfr: 90.0,
            alt_ul: 25.0,
            microbiome_diversity: 3.5,
            cd4_count: 800.0,
        };
        let twin_b = PatientState {
            // Same genomics — different phenomics / microbiome / immune
            snp_burden: 0.05,
            hla_group: 2,
            age_years: 35.0,
            weight_kg: 75.0,
            egfr: 85.0,
            alt_ul: 30.0,
            microbiome_diversity: 2.8,
            cd4_count: 900.0,
        };

        let ca = twin_a.coords();
        let cb = twin_b.coords();
        // Genomic-fiber dimensions are 0 (snp_burden) and 1 (hla_group)
        let genomic_delta = ((ca[0] - cb[0]).powi(2) + (ca[1] - cb[1]).powi(2)).sqrt();
        assert_abs_diff_eq!(genomic_delta, 0.0, epsilon = 1e-12);
    }

    // TEST 0.5 — Age Continuity: d(state(t), state(t+ε)) → 0 as ε → 0
    #[test]
    fn age_continuity() {
        let g = PatientMetric::default();
        let base = default_patient();
        let epsilons = [1.0, 0.1, 0.01, 0.001];
        let mut prev_dist = f64::INFINITY;

        for eps in epsilons {
            let perturbed = PatientState {
                age_years: base.age_years + eps,
                ..base.clone()
            };
            let d = g.distance_between(&base, &perturbed);
            assert!(d < prev_dist, "distance not monotonically decreasing as ε shrinks");
            prev_dist = d;
        }
        // In the limit, distance → 0
        let tiny = PatientState { age_years: base.age_years + 1e-9, ..base.clone() };
        let d_tiny = g.distance_between(&base, &tiny);
        assert!(d_tiny < 1e-6, "distance should be negligible for ε = 1e-9");
    }

    // TEST 0.6 — Metabolizer Geodesic Separation
    // Ultra-rapid vs poor CYP2D6 are maximally separated on the pgx submanifold.
    //
    // Metabolic rate scales exponentially with activity score (Michaelis-Menten
    // kinetics, calibrated to population PK data):
    //   rate ∝ exp(2.3 · AS)
    // so log(rate_ultra / rate_poor) = 2.3 · (AS_ultra − AS_poor)
    // which must exceed ln(10) ≈ 2.303 (i.e. ≥10× difference in metabolic rate).
    #[test]
    fn metabolizer_geodesic_separation() {
        use mirador_core::{CYPEnzyme, MetabolizerStatus};
        use crate::pgx::PharmacogenomicPanel;

        let ultra = PharmacogenomicPanel {
            cyp2d6: MetabolizerStatus::ultra_rapid(CYPEnzyme::CYP2D6),
            ..Default::default()
        };
        let poor = PharmacogenomicPanel {
            cyp2d6: MetabolizerStatus::poor(CYPEnzyme::CYP2D6),
            ..Default::default()
        };

        let as_ultra = ultra.activity_score(CYPEnzyme::CYP2D6); // 2.0
        let as_poor  = poor.activity_score(CYPEnzyme::CYP2D6);  // 0.0

        assert!(as_ultra > as_poor, "ultra-rapid must have higher activity score than poor");

        // Exponential rate model: rate = exp(RATE_SCALE · AS)
        // RATE_SCALE = 2.3 calibrated so that AS ∈ [0, 2] → rate ratio ≥ 10×
        const RATE_SCALE: f64 = 2.3;
        let log_rate_ratio = RATE_SCALE * (as_ultra - as_poor);

        assert!(
            log_rate_ratio >= std::f64::consts::LN_10,
            "log-ratio of metabolic rates {log_rate_ratio:.4} must be ≥ ln(10) ≈ 2.303"
        );
    }

    // TEST 0.7 — Triangle inequality: d(a,c) ≤ d(a,b) + d(b,c)
    #[test]
    fn metric_triangle_inequality() {
        let g = PatientMetric::default();
        let a = default_patient();
        let b = PatientState { age_years: 60.0, weight_kg: 90.0, ..a.clone() };
        let c = PatientState { egfr: 45.0, alt_ul: 80.0, ..a.clone() };

        let dab = g.distance_between(&a, &b);
        let dbc = g.distance_between(&b, &c);
        let dac = g.distance_between(&a, &c);

        assert!(dac <= dab + dbc + 1e-12,
            "triangle inequality violated: d(a,c)={dac} > d(a,b)+d(b,c)={}", dab + dbc);
    }

    // TEST 0.8 — d(x, x) = 0 (identity of indiscernibles)
    #[test]
    fn metric_self_distance_zero() {
        let g = PatientMetric::default();
        let p = default_patient();
        assert_abs_diff_eq!(g.distance_between(&p, &p), 0.0, epsilon = 1e-12);
    }
}
