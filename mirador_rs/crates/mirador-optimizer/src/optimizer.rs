use mirador_core::{coherence, coherence_gradient, CoherenceError, efficacy_toxicity_from_theta};
use serde::{Deserialize, Serialize};

/// A point in the τ–K optimization landscape.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CandidatePoint {
    /// Pharmacophore topological invariant (signed).
    pub tau: f64,
    /// Total ADMET curvature (must be > 0).
    pub k: f64,
}

impl CandidatePoint {
    /// C = τ/K for this point.
    pub fn coherence(&self) -> Result<f64, CoherenceError> {
        coherence(self.tau, self.k)
    }

    /// Gradient of C at this point: (∂C/∂τ, ∂C/∂K).
    pub fn gradient(&self) -> Result<(f64, f64), CoherenceError> {
        coherence_gradient(self.tau, self.k)
    }

    /// The geodesic angle θ for this point's (E, T) coordinates.
    /// C = τ/K maps to θ via: θ = 2 arctan(1 / |C| + δ), calibrated so that
    /// very high |C| → θ → 0 (near-perfect drug) and |C| → 0 → θ → π (failure).
    ///
    /// Here we use the simple normalisation: θ = π / (1 + |C| / C_ref)
    /// where C_ref is a reference coherence (≥ 1.0).
    pub fn theta(&self, c_ref: f64) -> Result<f64, CoherenceError> {
        let c = self.coherence()?.abs();
        Ok(std::f64::consts::PI / (1.0 + c / c_ref))
    }

    /// (Efficacy, Toxicity) from the Double Cover Principle.
    pub fn efficacy_toxicity(&self, c_ref: f64) -> Result<(f64, f64), CoherenceError> {
        let theta = self.theta(c_ref)?;
        Ok(efficacy_toxicity_from_theta(theta))
    }
}

/// Riemannian gradient ascent on C = τ/K in the (τ, K) plane.
///
/// This is the Layer 6 optimizer.  In the full system, τ and K are
/// functions of the molecular structure — here we work directly in
/// (τ, K) space which is the abstract parameter space of coherence.
///
/// Ascent step:
///   τ ← τ + η · (∂C/∂τ)
///   K ← K − η · |∂C/∂K|   (decrease K to increase C, guarded K > K_min)
#[derive(Debug, Clone)]
pub struct CoherenceOptimizer {
    pub learning_rate: f64,
    pub max_iterations: usize,
    pub tolerance: f64,
    /// Minimum allowable K (prevents division by zero).
    pub k_min: f64,
}

impl Default for CoherenceOptimizer {
    fn default() -> Self {
        Self {
            learning_rate: 0.01,
            max_iterations: 1000,
            tolerance: 1e-8,
            k_min: 1e-6,
        }
    }
}

impl CoherenceOptimizer {
    /// Run gradient ascent from `start`, returning the trajectory.
    ///
    /// Returns `Err` if the starting point has K ≤ 0.
    pub fn ascend(&self, start: CandidatePoint) -> Result<Vec<CandidatePoint>, CoherenceError> {
        let mut trajectory = Vec::with_capacity(self.max_iterations + 1);
        let mut current = start;

        trajectory.push(current.clone());

        for _ in 0..self.max_iterations {
            let (dc_dtau, dc_dk) = current.gradient()?;

            // Ascent: increase τ (positive gradient direction), decrease K
            let new_tau = current.tau + self.learning_rate * dc_dtau;
            // K must stay > k_min
            let new_k = (current.k + self.learning_rate * dc_dk).max(self.k_min);

            let next = CandidatePoint { tau: new_tau, k: new_k };

            let c_prev = current.coherence()?;
            let c_next = next.coherence()?;

            let delta_c = (c_next - c_prev).abs();
            trajectory.push(next.clone());
            current = next;

            if delta_c / c_prev.abs().max(1e-10) < self.tolerance {
                break;
            }
        }

        Ok(trajectory)
    }
}

// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 6.1–6.7
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;
    use mirador_core::double_cover_residual;

    // TEST 6.1 — Gradient correctness: matches finite difference
    #[test]
    fn gradient_matches_finite_difference() {
        let pt = CandidatePoint { tau: 15.0, k: 3.0 };
        let eps = 1e-6;
        let (dc_dtau, dc_dk) = pt.gradient().unwrap();

        let pt_tau_p = CandidatePoint { tau: pt.tau + eps, k: pt.k };
        let pt_tau_m = CandidatePoint { tau: pt.tau - eps, k: pt.k };
        let fd_tau = (pt_tau_p.coherence().unwrap() - pt_tau_m.coherence().unwrap()) / (2.0 * eps);

        let pt_k_p = CandidatePoint { tau: pt.tau, k: pt.k + eps };
        let pt_k_m = CandidatePoint { tau: pt.tau, k: pt.k - eps };
        let fd_k = (pt_k_p.coherence().unwrap() - pt_k_m.coherence().unwrap()) / (2.0 * eps);

        assert_abs_diff_eq!(dc_dtau, fd_tau, epsilon = 1e-8);
        assert_abs_diff_eq!(dc_dk,   fd_k,   epsilon = 1e-8);
    }

    // TEST 6.2 — Coherence monotonicity under gradient ascent
    #[test]
    fn coherence_monotonically_increases() {
        let opt = CoherenceOptimizer {
            learning_rate: 0.05,
            max_iterations: 20,
            tolerance: 1e-10,
            k_min: 1e-6,
        };

        let start = CandidatePoint { tau: 5.0, k: 2.5 };
        let traj = opt.ascend(start).unwrap();

        // Coherence must be non-decreasing along the trajectory
        let mut violations = 0usize;
        for w in traj.windows(2) {
            let c_prev = w[0].coherence().unwrap();
            let c_next = w[1].coherence().unwrap();
            if c_next < c_prev - 1e-10 {
                violations += 1;
            }
        }
        assert_eq!(violations, 0, "coherence decreased {violations} times during ascent");
    }

    // TEST 6.3 — K = 0 returns an error (no silent division by zero)
    #[test]
    fn k_zero_is_error() {
        let pt = CandidatePoint { tau: 5.0, k: 0.0 };
        assert!(pt.coherence().is_err());
        assert!(pt.gradient().is_err());
    }

    // TEST 6.4 — Double Cover Constraint: E + T² = 1 for any (τ, K)
    #[test]
    fn double_cover_constraint_holds() {
        let c_ref = 10.0;
        let points = [
            CandidatePoint { tau: 1.0,  k: 1.0 },
            CandidatePoint { tau: 5.0,  k: 2.0 },
            CandidatePoint { tau: 20.0, k: 3.0 },
            CandidatePoint { tau: -6.0, k: 1.5 },  // antagonist sheet
            CandidatePoint { tau: 100.0, k: 5.0 },
        ];

        for pt in &points {
            let (e, t) = pt.efficacy_toxicity(c_ref).unwrap();
            let residual = double_cover_residual(e, t);
            assert!(
                residual < 1e-12,
                "E + T² ≠ 1 for τ={}, K={}: residual = {residual:.2e}",
                pt.tau, pt.k
            );
        }
    }

    // TEST 6.5 — Monotone relationship between |C| and efficacy E
    // Higher |C| → smaller θ → higher efficacy (closer to the "good" pole)
    #[test]
    fn higher_coherence_gives_higher_efficacy() {
        let c_ref = 10.0;
        let low_c  = CandidatePoint { tau: 2.0, k: 4.0 };   // C = 0.5
        let high_c = CandidatePoint { tau: 20.0, k: 2.0 };  // C = 10.0

        let (e_low,  _) = low_c.efficacy_toxicity(c_ref).unwrap();
        let (e_high, _) = high_c.efficacy_toxicity(c_ref).unwrap();

        assert!(e_high > e_low, "higher coherence must produce higher efficacy");
    }

    // TEST 6.6 — Pareto dominance: (τ=20, K=2) dominates (τ=10, K=3)
    // because C(20/2) = 10 > C(10/3) ≈ 3.33
    #[test]
    fn pareto_dominance() {
        let dominant  = CandidatePoint { tau: 20.0, k: 2.0 };
        let dominated = CandidatePoint { tau: 10.0, k: 3.0 };
        assert!(
            dominant.coherence().unwrap() > dominated.coherence().unwrap(),
            "dominant point must have higher C"
        );
    }

    // TEST 6.7 — Agonist/antagonist are on opposite sheets
    #[test]
    fn agonist_antagonist_opposite_sheets() {
        let agonist    = CandidatePoint { tau:  8.0, k: 2.0 };
        let antagonist = CandidatePoint { tau: -8.0, k: 2.0 };

        let c_ag = agonist.coherence().unwrap();
        let c_an = antagonist.coherence().unwrap();

        // Same magnitude — opposite orientation
        assert_abs_diff_eq!(c_ag.abs(), c_an.abs(), epsilon = 1e-12);
        assert!(c_ag > 0.0, "agonist coherence must be positive");
        assert!(c_an < 0.0, "antagonist coherence must be negative");
    }

    // TEST 6.8 — Optimizer converges: final C > initial C
    #[test]
    fn optimizer_converges_to_higher_coherence() {
        let opt = CoherenceOptimizer::default();
        let start = CandidatePoint { tau: 3.0, k: 5.0 };
        let c_start = start.coherence().unwrap();
        let traj = opt.ascend(start).unwrap();
        let c_final = traj.last().unwrap().coherence().unwrap();
        assert!(c_final > c_start, "optimizer must increase coherence");
    }
}
