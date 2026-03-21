use thiserror::Error;

/// Errors that can arise when computing coherence.
#[derive(Debug, Error)]
pub enum CoherenceError {
    #[error("curvature K must be positive, got {0}")]
    NonPositiveCurvature(f64),

    #[error("tau must be non-zero to define coherence")]
    ZeroTau,
}

/// Coherence C = τ / K  (the Davis Field Equation, Branch XI).
///
/// # Arguments
/// * `tau` — pharmacophore topological invariant (signed f64; sign = chiral sheet)
/// * `k`   — total ADMET curvature (must be > 0)
///
/// # Returns
/// `Ok(C)` where C = τ / K, or an error if K ≤ 0.
///
/// The sign of C encodes which sheet of the double cover the molecule sits on:
///   C > 0 → agonist sheet
///   C < 0 → antagonist sheet
pub fn coherence(tau: f64, k: f64) -> Result<f64, CoherenceError> {
    if k <= 0.0 {
        return Err(CoherenceError::NonPositiveCurvature(k));
    }
    Ok(tau / k)
}

/// Double Cover Principle: E + T² = 1
///
/// Given efficacy E ∈ [0, 1] and toxicity T ∈ [0, 1], verifies the
/// unit-sphere constraint.  Derived from the Fubini-Study metric on RP^n:
///   E = cos²(θ/2),  T = sin(θ/2)    ⟹  E + T² = 1  (trig identity).
///
/// # Arguments
/// * `efficacy`  — E = cos²(θ/2), in [0, 1]
/// * `toxicity`  — T = sin(θ/2),  in [0, 1]
///
/// # Returns
/// The residual |E + T² − 1|; should be ≤ machine epsilon for well-formed inputs.
pub fn double_cover_residual(efficacy: f64, toxicity: f64) -> f64 {
    (efficacy + toxicity * toxicity - 1.0).abs()
}

/// Compute (efficacy, toxicity) from the geodesic angle θ on the unit sphere.
///
/// θ = 0 at perfect binding (agonist, E = 1, T = 0).
/// θ = π at maximal mismatch / toxicity (E = 0, T = 1).
pub fn efficacy_toxicity_from_theta(theta: f64) -> (f64, f64) {
    let e = (theta / 2.0).cos().powi(2);
    let t = (theta / 2.0).sin();
    (e, t)
}

/// Gradient of C = τ/K with respect to (τ, K).
///
/// Used by the Riemannian optimizer in Layer 6.
/// ∂C/∂τ = 1/K
/// ∂C/∂K = −τ/K²
pub fn coherence_gradient(tau: f64, k: f64) -> Result<(f64, f64), CoherenceError> {
    if k <= 0.0 {
        return Err(CoherenceError::NonPositiveCurvature(k));
    }
    let dc_dtau = 1.0 / k;
    let dc_dk = -tau / (k * k);
    Ok((dc_dtau, dc_dk))
}

// ============================================================================
// Tests — RED first, then make GREEN
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    // TEST C-1: basic coherence formula
    #[test]
    fn coherence_basic() {
        let c = coherence(18.0, 3.0).unwrap();
        assert_abs_diff_eq!(c, 6.0, epsilon = 1e-12);
    }

    // TEST C-2: C is linear in τ
    #[test]
    fn coherence_linear_in_tau() {
        let k = 2.5;
        let c1 = coherence(10.0, k).unwrap();
        let c2 = coherence(20.0, k).unwrap();
        assert_abs_diff_eq!(c2, 2.0 * c1, epsilon = 1e-12);
    }

    // TEST C-3: C is inversely proportional to K
    #[test]
    fn coherence_inverse_in_k() {
        let tau = 12.0;
        let c1 = coherence(tau, 1.0).unwrap();
        let c2 = coherence(tau, 2.0).unwrap();
        assert_abs_diff_eq!(c1, 2.0 * c2, epsilon = 1e-12);
    }

    // TEST C-4: K = 0 returns error (no division by zero)
    #[test]
    fn coherence_zero_k_is_error() {
        assert!(coherence(5.0, 0.0).is_err());
        assert!(coherence(5.0, -1.0).is_err());
    }

    // TEST C-5: chirality sign propagates through coherence
    #[test]
    fn coherence_chirality_sign() {
        let k = 3.0;
        // agonist (τ_chiral = +1): C > 0
        let c_agonist = coherence(6.0, k).unwrap();
        // antagonist (τ_chiral = -1): C < 0, same magnitude
        let c_antagonist = coherence(-6.0, k).unwrap();
        assert!(c_agonist > 0.0);
        assert!(c_antagonist < 0.0);
        assert_abs_diff_eq!(c_agonist.abs(), c_antagonist.abs(), epsilon = 1e-12);
    }

    // TEST C-6: Double Cover Principle E + T² = 1 holds for any θ
    #[test]
    fn double_cover_holds_for_all_theta() {
        for i in 0..=100 {
            let theta = std::f64::consts::PI * (i as f64) / 100.0;
            let (e, t) = efficacy_toxicity_from_theta(theta);
            let residual = double_cover_residual(e, t);
            assert!(
                residual < 1e-12,
                "θ={theta:.4}: E+T²-1 = {residual:.2e}"
            );
        }
    }

    // TEST C-7: θ = 0 → E = 1, T = 0 (perfect drug)
    #[test]
    fn double_cover_perfect_drug() {
        let (e, t) = efficacy_toxicity_from_theta(0.0);
        assert_abs_diff_eq!(e, 1.0, epsilon = 1e-12);
        assert_abs_diff_eq!(t, 0.0, epsilon = 1e-12);
    }

    // TEST C-8: θ = π → E = 0, T = 1 (pure toxin)
    #[test]
    fn double_cover_pure_toxin() {
        let (e, t) = efficacy_toxicity_from_theta(std::f64::consts::PI);
        assert_abs_diff_eq!(e, 0.0, epsilon = 1e-12);
        assert_abs_diff_eq!(t, 1.0, epsilon = 1e-12);
    }

    // TEST C-9: gradient ∂C/∂τ = 1/K
    #[test]
    fn coherence_gradient_dtau() {
        let (dc_dtau, _) = coherence_gradient(10.0, 4.0).unwrap();
        assert_abs_diff_eq!(dc_dtau, 0.25, epsilon = 1e-12);
    }

    // TEST C-10: gradient ∂C/∂K = −τ/K²
    #[test]
    fn coherence_gradient_dk() {
        let tau = 10.0;
        let k = 4.0;
        let (_, dc_dk) = coherence_gradient(tau, k).unwrap();
        assert_abs_diff_eq!(dc_dk, -tau / (k * k), epsilon = 1e-12);
    }

    // TEST C-11: gradient matches finite difference
    #[test]
    fn coherence_gradient_finite_difference() {
        let tau = 15.0;
        let k = 3.0;
        let eps = 1e-6;

        let (dc_dtau, dc_dk) = coherence_gradient(tau, k).unwrap();

        let fd_tau = (coherence(tau + eps, k).unwrap() - coherence(tau - eps, k).unwrap())
            / (2.0 * eps);
        let fd_k = (coherence(tau, k + eps).unwrap() - coherence(tau, k - eps).unwrap())
            / (2.0 * eps);

        assert_abs_diff_eq!(dc_dtau, fd_tau, epsilon = 1e-8);
        assert_abs_diff_eq!(dc_dk, fd_k, epsilon = 1e-8);
    }
}
