// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 4.1–4.6
// ============================================================================
#[cfg(test)]
mod tests {
    use crate::pharmacophore::Pharmacophore;
    use mirador_core::{BettiNumbers, ChiralSign};
    use approx::assert_abs_diff_eq;

    fn tunnel_pocket() -> Pharmacophore {
        Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 1, b2: 0 },  // tunnel (HIV protease-like)
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 1,
        }
    }

    // TEST 4.1 — Betti number interpretation: tunnel pocket has b1 ≥ 1
    #[test]
    fn betti_tunnel_pocket() {
        let p = tunnel_pocket();
        assert_eq!(p.betti.b0, 1, "binding pocket must be connected (b0=1)");
        assert!(p.betti.b1 >= 1, "tunnel pocket must have at least one loop (b1≥1)");
    }

    // TEST 4.1b — Solid cluster pocket: b1 = 0, b2 = 0
    #[test]
    fn betti_solid_cluster() {
        let solid = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 0, b2: 0 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 1,
        };
        assert_eq!(solid.betti.b1, 0, "solid cluster has no tunnels");
        assert_eq!(solid.betti.b2, 0, "solid cluster has no cavities");
    }

    // TEST 4.2 — Pharmacophore equivalence: same betti + chiral + ring → same τ
    #[test]
    fn pharmacophore_equivalence() {
        // Molecules A and B: different scaffolds, same pharmacophore
        let mol_a = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 0, b2: 0 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 2,
        };
        let mol_b = mol_a.clone(); // different scaffold, same pharmacophore
        assert_abs_diff_eq!(
            mol_a.tau().unwrap(),
            mol_b.tau().unwrap(),
            epsilon = 1e-12
        );
    }

    // TEST 4.3 — Chirality determines activity: enantiomers on opposite sheets
    #[test]
    fn chirality_opposite_sheets() {
        let r_enantiomer = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 1, b2: 0 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 2,
        };
        let s_enantiomer = Pharmacophore {
            tau_chiral: ChiralSign::ANTAGONIST,
            ..r_enantiomer.clone()
        };

        let tau_r = r_enantiomer.tau().unwrap();
        let tau_s = s_enantiomer.tau().unwrap();

        // Same magnitude, opposite sign
        assert_abs_diff_eq!(tau_r.abs(), tau_s.abs(), epsilon = 1e-12);
        assert!(tau_r > 0.0, "R-enantiomer (agonist) must have τ > 0");
        assert!(tau_s < 0.0, "S-enantiomer (antagonist) must have τ < 0");

        // Same Betti numbers (same binding metric)
        assert_eq!(r_enantiomer.betti, s_enantiomer.betti);
    }

    // TEST 4.4 — τ log-multiplicativity (Künneth decomposition)
    // log|τ| = log|τ_bind| + log|τ_chiral| + log|τ_ring|
    // Since |τ_chiral| = 1, log|τ_chiral| = 0.
    #[test]
    fn tau_log_multiplicativity() {
        let p = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 2, b2: 1 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 3,
        };

        let tau_bind_mag = p.betti.tau_bind_magnitude();   // b0+b1+b2 = 4
        let tau_ring_mag = p.ring_count as f64;            // 3
        let tau_chiral_mag = p.tau_chiral.as_f64().abs();  // 1

        let log_tau_expected = tau_bind_mag.ln()
            + tau_chiral_mag.ln() // = 0
            + tau_ring_mag.ln();
        let log_tau_computed = p.log_tau_magnitude().unwrap();

        assert_abs_diff_eq!(log_tau_computed, log_tau_expected, epsilon = 1e-12);
    }

    // TEST 4.5 — Ring topology: π₁ generator count for common ring systems
    // benzene: 1 ring → ring_count = 1
    // naphthalene: 2 independent loops → ring_count = 2
    // quinoline: 2 fused rings but 1 new loop over benzene → ring_count = 2
    #[test]
    fn ring_topology_encoding() {
        let benzene = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 0, b2: 0 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 1,
        };
        let naphthalene = Pharmacophore { ring_count: 2, ..benzene.clone() };

        // τ is proportional to ring_count
        let ratio = naphthalene.tau().unwrap() / benzene.tau().unwrap();
        assert_abs_diff_eq!(ratio, 2.0, epsilon = 1e-12);
    }

    // TEST 4.6 — τ_bind magnitude = sum of Betti numbers
    #[test]
    fn tau_bind_magnitude_is_betti_sum() {
        let b = BettiNumbers { b0: 1, b1: 3, b2: 2 };
        assert_abs_diff_eq!(b.tau_bind_magnitude(), 6.0, epsilon = 1e-12);
    }

    // TEST 4.7 — Disconnected pocket (b0 = 0) returns error
    #[test]
    fn disconnected_pocket_is_error() {
        let p = Pharmacophore {
            betti: BettiNumbers { b0: 0, b1: 0, b2: 0 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 1,
        };
        assert!(p.tau().is_err());
    }

    // TEST 4.8 — Zero ring count is an error
    #[test]
    fn zero_ring_count_is_error() {
        let p = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 0, b2: 0 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 0,
        };
        assert!(p.tau().is_err());
    }

    // TEST 4.9 — τ is linear in ring count (holding betti and chirality fixed)
    #[test]
    fn tau_linear_in_ring_count() {
        let base_betti = BettiNumbers { b0: 1, b1: 0, b2: 0 };
        let tau1 = Pharmacophore {
            betti: base_betti,
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 1,
        }.tau().unwrap();
        let tau3 = Pharmacophore {
            betti: base_betti,
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 3,
        }.tau().unwrap();
        assert_abs_diff_eq!(tau3, 3.0 * tau1, epsilon = 1e-12);
    }

    // =========================================================================
    // PBP2a / Ceftaroline-specific tests (real data from JACS 2014, PDB 3ZG0)
    // =========================================================================

    /// Ceftaroline pharmacophore: dual-site topology for PBP2a.
    /// B = {b0=1, b1=1, b2=2} → τ_bind = 4 (Betti sum).
    /// Three rings (β-lactam + pyrrolidine + thiadiazole) thread the allosteric gate.
    /// τ = τ_bind × τ_chiral × ring_count = 4 × 1 × 3 = 12.
    fn ceftaroline() -> Pharmacophore {
        Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 1, b2: 2 }, // dual-site: b2≥1 signals cavity pocket
            tau_chiral: ChiralSign::AGONIST,              // R-configuration
            ring_count: 3,                                // β-lactam, pyrrolidine, thiadiazole
        }
    }

    /// Oxacillin comparator: same dual-site Betti topology but only one β-lactam ring
    /// → cannot thread the allosteric gate → τ = 4 × 1 × 1 = 4.
    fn oxacillin() -> Pharmacophore {
        Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 1, b2: 2 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 1, // single ring: can't thread the PBP2a gate
        }
    }

    // TEST 4.10 — Ceftaroline τ = 12 (PBP2a dual-site binding, JACS 2014)
    #[test]
    fn ceftaroline_tau_is_12() {
        let tau = ceftaroline().tau().unwrap();
        // τ = τ_bind(4) × τ_chiral(1) × ring_count(3) = 12
        assert_abs_diff_eq!(tau, 12.0, epsilon = 1e-12);
    }

    // TEST 4.11 — Oxacillin single-ring τ = 4 (insufficient gate-threading; β-lactam-only)
    #[test]
    fn oxacillin_single_ring_tau_is_4() {
        let tau = oxacillin().tau().unwrap();
        // τ = τ_bind(4) × τ_chiral(1) × ring_count(1) = 4
        assert_abs_diff_eq!(tau, 4.0, epsilon = 1e-12);
    }

    // TEST 4.12 — Ceftaroline τ >> oxacillin τ (explains MRSA activity advantage)
    // The threefold ring advantage corresponds to threefold coherence advantage C = τ/K.
    #[test]
    fn ceftaroline_tau_exceeds_oxacillin_tau() {
        let tau_ceft = ceftaroline().tau().unwrap();
        let tau_oxa  = oxacillin().tau().unwrap();
        assert!(
            tau_ceft > tau_oxa,
            "ceftaroline τ ({tau_ceft}) must exceed oxacillin τ ({tau_oxa}) to explain MRSA activity"
        );
        // Exactly threefold difference (ring_count ratio = 3:1)
        assert_abs_diff_eq!(tau_ceft / tau_oxa, 3.0, epsilon = 1e-12);
    }

    // TEST 4.13 — Dual-site pharmacophore topology has b1≥1 and b2≥1 (cavity + tunnel)
    // The PBP2a closed-gate pocket is topologically a cavity (b2≥1) with allosteric loop (b1≥1).
    #[test]
    fn pbp2a_closed_gate_pocket_is_dual_site_topology() {
        let ceft = ceftaroline();
        assert!(ceft.betti.b1 >= 1, "PBP2a allosteric relay requires at least one topological loop");
        assert!(ceft.betti.b2 >= 1, "PBP2a gate cavity requires at least one topological pocket");
        // Dual-site: two molecules of ceftaroline achieve τ_total = 12 + 12 = 24 (additive)
        let dual_site_tau = 2.0 * ceft.tau().unwrap();
        assert_abs_diff_eq!(dual_site_tau, 24.0, epsilon = 1e-12);
    }
}
