/// Abelian (U(1)) transition function, represented as a real additive element.
/// For U(1): the structure group acts by multiplication by a phase exp(iθ).
/// Logarithmically, g ↔ θ ∈ ℝ, where compose = addition and identity = 0.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TransitionFunction(pub f64);

impl TransitionFunction {
    /// Compose two transition functions: g_αβ · g_βγ = g_αγ (additive in log).
    pub fn compose(self, other: Self) -> Self {
        TransitionFunction(self.0 + other.0)
    }

    /// Inverse: g_αβ⁻¹ = g_βα.
    pub fn inverse(self) -> Self {
        TransitionFunction(-self.0)
    }

    pub fn identity() -> Self {
        TransitionFunction(0.0)
    }
}

/// Cocycle condition (TEST 3.1): g_αβ · g_βγ · g_γα = identity.
/// For abelian bundle: θ_αβ + θ_βγ + θ_γα = 0.
pub fn cocycle_holds(g_ab: TransitionFunction, g_bc: TransitionFunction, g_ca: TransitionFunction) -> bool {
    (g_ab.0 + g_bc.0 + g_ca.0).abs() < 1e-10
}

/// A therapeutic connection: encodes how binding affinity parallel-transports
/// across target conformations. Off-target components represent curvature leakage.
///
/// Geometrically: A ∈ Ω¹(T, Lie(G)) — a connection 1-form.
/// We represent it as a list of real-valued components (one per molecular DOF),
/// where each component's variation encodes off-target binding curvature.
#[derive(Debug, Clone)]
pub struct TherapeuticConnection {
    /// One off-target binding strength per fiber direction.
    /// A strength of 0 in direction i means the connection is flat in that direction
    /// (no off-target binding to target i).
    pub off_target_strengths: Vec<f64>,
}

impl TherapeuticConnection {
    /// Curvature magnitude: ||F_∇|| in the Frobenius sense.
    /// For abelian connection: F = dA; curvature components ≈ off-target strengths.
    pub fn curvature_magnitude(&self) -> f64 {
        self.off_target_strengths
            .iter()
            .map(|x| x * x)
            .sum::<f64>()
            .sqrt()
    }

    /// Number of significant off-target binding directions (rank of curvature tensor).
    pub fn curvature_rank(&self, threshold: f64) -> usize {
        self.off_target_strengths
            .iter()
            .filter(|&&x| x.abs() > threshold)
            .count()
    }

    /// True if the connection is flat (all curvature components are zero).
    /// Flat connection ↔ perfectly selective drug with no off-target activity.
    pub fn is_flat(&self, threshold: f64) -> bool {
        self.off_target_strengths.iter().all(|&x| x.abs() < threshold)
    }
}

/// A therapeutic section σ: T → E.
/// Concretely: the binding affinity of a drug candidate as a function of
/// target conformation, sampled at discrete conformation points.
#[derive(Debug, Clone)]
pub struct TherapeuticSection {
    /// Binding affinity at each conformation sample (arbitrary positive units).
    pub affinity_samples: Vec<f64>,
}

impl TherapeuticSection {
    /// Section is smooth if adjacent affinity samples change slowly
    /// (variation < threshold per step, mimicking ∇_c σ ≈ 0).
    pub fn is_smooth(&self, variation_threshold: f64) -> bool {
        if self.affinity_samples.len() < 2 {
            return true;
        }
        self.affinity_samples
            .windows(2)
            .all(|w| (w[1] - w[0]).abs() < variation_threshold)
    }

    /// Maximum variation between adjacent samples.
    pub fn max_variation(&self) -> f64 {
        if self.affinity_samples.len() < 2 {
            return 0.0;
        }
        self.affinity_samples
            .windows(2)
            .map(|w| (w[1] - w[0]).abs())
            .fold(0.0f64, f64::max)
    }
}

// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 3.1–3.6
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    // TEST 3.1 — Cocycle condition: consistent transition functions satisfy g_αβ + g_βγ + g_γα = 0
    #[test]
    fn cocycle_condition_holds_for_consistent_functions() {
        // Consistent: g_αβ = 1.0, g_βγ = 2.0, g_γα = -3.0 → sum = 0
        let g_ab = TransitionFunction(1.0);
        let g_bc = TransitionFunction(2.0);
        let g_ca = TransitionFunction(-3.0);
        assert!(cocycle_holds(g_ab, g_bc, g_ca));
    }

    // TEST 3.1 — Inconsistent transition functions violate cocycle
    #[test]
    fn cocycle_condition_fails_for_inconsistent_functions() {
        let g_ab = TransitionFunction(1.0);
        let g_bc = TransitionFunction(2.0);
        let g_ca = TransitionFunction(0.5); // should be -3.0
        assert!(!cocycle_holds(g_ab, g_bc, g_ca));
    }

    // TEST 3.1 — Identity triple satisfies cocycle: g_αβ = g_βγ = g_γα = 0
    #[test]
    fn identity_transitions_satisfy_cocycle() {
        let id = TransitionFunction::identity();
        assert!(cocycle_holds(id, id, id));
    }

    // TEST 3.2 — Connection compatibility: G-equivariance (abelian case)
    //            Composing g with connection then inverting is consistent.
    #[test]
    fn transition_function_compose_inverse_gives_identity() {
        let g = TransitionFunction(1.5);
        let composed = g.compose(g.inverse());
        assert_abs_diff_eq!(composed.0, TransitionFunction::identity().0, epsilon = 1e-12);
    }

    // TEST 3.3 — Curvature rank matches number of off-target bindings
    #[test]
    fn curvature_rank_matches_off_target_count() {
        // Imatinib-like: 3 known off-targets (ABL1 is on-target; KIT, PDGFRα, ABL2 are off)
        let conn = TherapeuticConnection {
            off_target_strengths: vec![0.8, 0.6, 0.4, 0.0], // 3 active, 1 silent
        };
        assert_eq!(conn.curvature_rank(0.1), 3, "should detect 3 off-target directions");
    }

    // TEST 3.4 — Flat connection = perfectly selective drug → zero curvature
    #[test]
    fn flat_connection_has_zero_curvature() {
        let conn = TherapeuticConnection {
            off_target_strengths: vec![0.0, 0.0, 0.0],
        };
        assert!(conn.is_flat(1e-10));
        assert_abs_diff_eq!(conn.curvature_magnitude(), 0.0, epsilon = 1e-12);
    }

    // TEST 3.4 — Non-flat connection has nonzero curvature
    #[test]
    fn non_flat_connection_has_nonzero_curvature() {
        let conn = TherapeuticConnection {
            off_target_strengths: vec![1.0, 0.5],
        };
        assert!(!conn.is_flat(1e-10));
        assert!(conn.curvature_magnitude() > 0.0);
    }

    // TEST 3.5 — Smooth section: affinity varies slowly across conformations
    //            (parallel transport keeps affinity nearly constant)
    #[test]
    fn slowly_varying_affinity_section_is_smooth() {
        let sigma = TherapeuticSection {
            // Affinity decreases by 0.05 per conformation step → smooth
            affinity_samples: vec![1.0, 0.95, 0.90, 0.85, 0.80],
        };
        assert!(sigma.is_smooth(0.1));
    }

    // TEST 3.5 — Discontinuous section is not smooth
    #[test]
    fn discontinuous_section_is_not_smooth() {
        let sigma = TherapeuticSection {
            affinity_samples: vec![1.0, 0.1, 0.9, 0.0], // large jumps
        };
        assert!(!sigma.is_smooth(0.1));
    }

    // TEST 3.6 — Curvature magnitude is non-negative
    #[test]
    fn curvature_magnitude_is_non_negative() {
        for strengths in [vec![0.0], vec![1.0, -0.5], vec![0.3, 0.7, -0.2]] {
            let conn = TherapeuticConnection { off_target_strengths: strengths };
            assert!(conn.curvature_magnitude() >= 0.0);
        }
    }
}
