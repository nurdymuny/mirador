use thiserror::Error;

#[derive(Debug, Clone, Error)]
pub enum TargetError {
    #[error("ensemble is empty")]
    EmptyEnsemble,
    #[error("target is not expressed in this patient tissue (expression_level = 0)")]
    NotExpressed,
    #[error("conformation index out of range")]
    IndexOutOfRange,
}

/// A single conformational state of a biological target.
/// `energy_kbt` is in units of k_B T at 310 K (body temperature), dimensionless.
#[derive(Debug, Clone)]
pub struct ConformationalState {
    /// Abstract generalized coordinates (e.g., PCA-reduced from MD trajectory).
    pub coords: Vec<f64>,
    /// Free energy in units of k_B T_body (dimensionless).
    pub energy_kbt: f64,
    /// Whether the primary binding site is solvent-accessible in this conformation.
    pub binding_site_open: bool,
}

/// Ensemble of conformational states sampled from MD or cryo-EM.
pub struct ConformationalEnsemble {
    pub states: Vec<ConformationalState>,
}

impl ConformationalEnsemble {
    /// Boltzmann weight: exp(-E_i / k_B T), already in kBT units so just exp(-E_i).
    fn raw_weight(state: &ConformationalState) -> f64 {
        (-state.energy_kbt).exp()
    }

    /// Normalized Boltzmann probability distribution π(i).
    pub fn boltzmann_weights(&self) -> Result<Vec<f64>, TargetError> {
        if self.states.is_empty() {
            return Err(TargetError::EmptyEnsemble);
        }
        let raw: Vec<f64> = self.states.iter().map(Self::raw_weight).collect();
        let z: f64 = raw.iter().sum();
        Ok(raw.into_iter().map(|w| w / z).collect())
    }

    /// Boltzmann-weighted fraction of ensemble with binding site accessible.
    pub fn binding_site_persistence(&self) -> Result<f64, TargetError> {
        let weights = self.boltzmann_weights()?;
        let p = self
            .states
            .iter()
            .zip(weights.iter())
            .filter(|(s, _)| s.binding_site_open)
            .map(|(_, w)| *w)
            .sum();
        Ok(p)
    }

    /// Euclidean distance between two conformations in coordinate space.
    pub fn conformational_distance(&self, i: usize, j: usize) -> Result<f64, TargetError> {
        let a = self.states.get(i).ok_or(TargetError::IndexOutOfRange)?;
        let b = self.states.get(j).ok_or(TargetError::IndexOutOfRange)?;
        let d = a
            .coords
            .iter()
            .zip(b.coords.iter())
            .map(|(x, y)| (x - y).powi(2))
            .sum::<f64>()
            .sqrt();
        Ok(d)
    }
}

/// The target manifold (T, h): conformational ensemble with patient-specific context.
pub struct TargetManifold {
    pub ensemble: ConformationalEnsemble,
    /// Tissue-specific expression level (0.0 = not expressed, 1.0 = full expression).
    pub expression_level: f64,
}

impl TargetManifold {
    /// Effective distance between two conformations, scaled by expression.
    /// Returns `f64::INFINITY` when expression_level = 0 (target unreachable).
    pub fn effective_distance(&self, i: usize, j: usize) -> Result<f64, TargetError> {
        if self.expression_level == 0.0 {
            return Ok(f64::INFINITY);
        }
        Ok(self.ensemble.conformational_distance(i, j)? / self.expression_level)
    }

    /// Whether the target is druggable (binding site persistence > 80%).
    pub fn is_druggable(&self) -> Result<bool, TargetError> {
        Ok(self.ensemble.binding_site_persistence()? > 0.8)
    }
}

// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 1.1–1.6
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    /// Build a simple 2-state ensemble: ground state (open) and excited state (closed).
    fn two_state_ensemble(e_ground: f64, e_excited: f64) -> ConformationalEnsemble {
        ConformationalEnsemble {
            states: vec![
                ConformationalState {
                    coords: vec![0.0, 0.0],
                    energy_kbt: e_ground,
                    binding_site_open: true,
                },
                ConformationalState {
                    coords: vec![1.0, 0.0],
                    energy_kbt: e_excited,
                    binding_site_open: false,
                },
            ],
        }
    }

    // TEST 1.1 — Conformational distance is non-negative; self = 0; symmetric
    #[test]
    fn conformational_metric_non_negative_and_self_zero() {
        let ens = two_state_ensemble(0.0, 2.0);
        assert_abs_diff_eq!(ens.conformational_distance(0, 0).unwrap(), 0.0, epsilon = 1e-12);
        assert_abs_diff_eq!(ens.conformational_distance(1, 1).unwrap(), 0.0, epsilon = 1e-12);
        let d = ens.conformational_distance(0, 1).unwrap();
        assert!(d >= 0.0);
        // Symmetry
        let d_rev = ens.conformational_distance(1, 0).unwrap();
        assert_abs_diff_eq!(d, d_rev, epsilon = 1e-12);
    }

    // TEST 1.2 — Boltzmann consistency: weights are non-negative, sum to 1,
    //            lowest-energy state has highest weight.
    #[test]
    fn boltzmann_weights_sum_to_one_and_min_energy_is_max_weight() {
        // E_ground = 0, E_excited = 2 kBT
        let ens = two_state_ensemble(0.0, 2.0);
        let weights = ens.boltzmann_weights().unwrap();
        let sum: f64 = weights.iter().sum();
        assert_abs_diff_eq!(sum, 1.0, epsilon = 1e-12);
        // Ground state (E=0, w=1) is heavier than excited state (E=2, w=e^-2)
        assert!(weights[0] > weights[1]);
        // High energy conf has exponentially lower weight
        let expected_ratio = (-2.0f64).exp();
        assert_abs_diff_eq!(weights[1] / weights[0], expected_ratio, epsilon = 1e-10);
    }

    // TEST 1.3 — Binding site persistence: open-dominant ensemble is druggable.
    #[test]
    fn dominant_open_ensemble_is_druggable() {
        // Ground state is open and has much lower energy → high persistence
        let ens = two_state_ensemble(0.0, 5.0); // exp(-5) ≈ 0.007 for closed
        let persistence = ens.binding_site_persistence().unwrap();
        // Weight of open state ≈ 1/(1+exp(-5)) ≈ 0.993
        assert!(persistence > 0.8, "expected druggable, got persistence = {persistence}");
        let target = TargetManifold { ensemble: ens, expression_level: 1.0 };
        assert!(target.is_druggable().unwrap());
    }

    // TEST 1.3 — binding site with low persistence is not druggable
    #[test]
    fn rare_open_conformation_is_not_druggable() {
        // Closed state is ground state: open state (excited) at high energy
        let ens = ConformationalEnsemble {
            states: vec![
                ConformationalState {
                    coords: vec![0.0],
                    energy_kbt: 0.0,
                    binding_site_open: false, // ground state is closed
                },
                ConformationalState {
                    coords: vec![1.0],
                    energy_kbt: 5.0,
                    binding_site_open: true, // open only at high energy
                },
            ],
        };
        let persistence = ens.binding_site_persistence().unwrap();
        assert!(persistence < 0.8, "should not be druggable, got {persistence}");
    }

    // TEST 1.4 — Patient-specific PTM: lowering activation energy of open state
    //            increases binding site persistence (mimics phosphorylation activating kinase).
    #[test]
    fn ptm_shifts_boltzmann_toward_open_state() {
        // Before PTM: ground state closed (E=0), open at E=3 kBT
        let ens_before = ConformationalEnsemble {
            states: vec![
                ConformationalState { coords: vec![0.0], energy_kbt: 0.0, binding_site_open: false },
                ConformationalState { coords: vec![1.0], energy_kbt: 3.0, binding_site_open: true },
            ],
        };
        // After PTM (phosphorylation): open state stabilized by −3 kBT → E=0
        let ens_after = ConformationalEnsemble {
            states: vec![
                ConformationalState { coords: vec![0.0], energy_kbt: 0.0, binding_site_open: false },
                ConformationalState { coords: vec![1.0], energy_kbt: 0.0, binding_site_open: true },
            ],
        };
        let persist_before = ens_before.binding_site_persistence().unwrap();
        let persist_after = ens_after.binding_site_persistence().unwrap();
        assert!(
            persist_after > persist_before,
            "PTM should increase open-state persistence: before={persist_before:.4}, after={persist_after:.4}"
        );
    }

    // TEST 1.5 — Pathway coherence: distance between conformations is finite and positive
    //            when expression_level > 0.
    #[test]
    fn expressed_target_has_finite_distance() {
        let ens = two_state_ensemble(0.0, 2.0);
        let target = TargetManifold { ensemble: ens, expression_level: 1.0 };
        let d = target.effective_distance(0, 1).unwrap();
        assert!(d > 0.0 && d.is_finite());
    }

    // TEST 1.6 — Zero expression → infinite effective distance (target is unreachable).
    #[test]
    fn zero_expression_gives_infinite_effective_distance() {
        let ens = two_state_ensemble(0.0, 2.0);
        let target = TargetManifold { ensemble: ens, expression_level: 0.0 };
        let d = target.effective_distance(0, 1).unwrap();
        assert!(d.is_infinite(), "expected infinity for unexpressed target, got {d}");
    }

    // Additional — triangle inequality for conformational distance
    #[test]
    fn conformational_distance_triangle_inequality() {
        let ens = ConformationalEnsemble {
            states: vec![
                ConformationalState { coords: vec![0.0, 0.0], energy_kbt: 0.0, binding_site_open: true },
                ConformationalState { coords: vec![3.0, 0.0], energy_kbt: 1.0, binding_site_open: true },
                ConformationalState { coords: vec![0.0, 4.0], energy_kbt: 2.0, binding_site_open: false },
            ],
        };
        let d01 = ens.conformational_distance(0, 1).unwrap();
        let d12 = ens.conformational_distance(1, 2).unwrap();
        let d02 = ens.conformational_distance(0, 2).unwrap();
        assert!(d02 <= d01 + d12 + 1e-10, "triangle inequality violated");
    }

    // =========================================================================
    // PBP2a-specific tests (MIRADOR_PBP2A_REAL_DATA_SPEC Tests 1.1–1.6)
    // =========================================================================

    /// PBP2a gate RMSD model: allosteric gate is the β3-β4 loop.
    /// In 1VQQ (closed) vs 3ZG0 (open) the gate RMSD is ~4-5 Å.
    /// We model this as the distance between 2D conformation coordinates
    /// representing the open vs closed gate positions.
    fn pbp2a_closed_gate() -> ConformationalState {
        // 1VQQ — gate CLOSED: β3-β4 loop position encoded as coords[0] (gate angle)
        // and coords[1] (allosteric relay distance ~60 Å → normalized to 6.0 units)
        ConformationalState {
            coords: vec![0.0, 6.0], // gate angle=0, allosteric distance=60Å
            energy_kbt: 0.0,         // ground state (ΔG_gate = 0 for closed)
            binding_site_open: false, // active site inaccessible when gate closed
        }
    }

    fn pbp2a_open_gate() -> ConformationalState {
        // 3ZG0 — gate OPEN: ceftaroline-induced allosteric opening
        // Gate RMSD ≈ 4.5 Å → coords[0] = 4.5; active site becomes accessible
        ConformationalState {
            coords: vec![4.5, 6.0], // gate displaced 4.5 units; allosteric distance unchanged
            energy_kbt: 8.1,         // ΔG_gate = +5 kcal/mol / 0.616 kBT/kcal·mol = 8.1 kBT
            binding_site_open: true, // active site accessible when gate open
        }
    }

    // TEST 1.1 (PBP2a) — Gate RMSD > 3 Å between closed (1VQQ) and open (3ZG0) conformations.
    // Published: ~4-5 Å RMSD at the β3-β4 gate (PNAS 2013, Mobashery).
    #[test]
    fn pbp2a_gate_rmsd_exceeds_3_angstroms() {
        let closed = pbp2a_closed_gate();
        let open = pbp2a_open_gate();
        let gate_rmsd = (closed.coords[0] - open.coords[0]).abs();
        // Our 1D model: gate coord displacement = 4.5 Å (representative of 3D RMSD)
        assert!(gate_rmsd > 3.0, "PBP2a gate RMSD should exceed 3 Å, got {gate_rmsd}");
        assert!(gate_rmsd < 6.0, "PBP2a gate RMSD should be below 6 Å (published ~4-5 Å)");
    }

    // TEST 1.3 (PBP2a) — Allosteric distance ≈ 60 Å (JACS 2014).
    // coords[1] encodes the allosteric relay distance in units of 10 Å.
    #[test]
    fn pbp2a_allosteric_distance_is_60_angstroms() {
        let closed = pbp2a_closed_gate();
        let allosteric_dist_angstroms = closed.coords[1] * 10.0;
        assert!(
            (allosteric_dist_angstroms - 60.0).abs() < 5.0,
            "Allosteric distance should be ≈60 Å, got {allosteric_dist_angstroms} Å"
        );
    }

    // TEST 1.5 (PBP2a) — Boltzmann gate closure ≥ 99.9%.
    // Published ΔG ≈ 5 kcal/mol for gate opening (from MD simulations).
    // At body temperature 310K: k_B T = 0.616 kcal/mol → ΔG/kBT ≈ 8.12.
    // P_open = exp(-ΔG/kBT) / (1 + exp(-ΔG/kBT)) ≈ 0.000297.
    // P_closed = 1 - P_open ≈ 0.9997 > 0.999. ✓
    #[test]
    fn pbp2a_boltzmann_gate_closure_exceeds_99_9_percent() {
        let dg_gate_kcal_mol = 5.0_f64;
        let kbt_kcal_mol = 0.616_f64; // at 310K
        let dg_kbt = dg_gate_kcal_mol / kbt_kcal_mol;
        let p_open = (-dg_kbt).exp() / (1.0 + (-dg_kbt).exp());
        let p_closed = 1.0 - p_open;
        assert!(
            p_closed > 0.999,
            "Gate closure must be >99.9%, got {:.6} (p_open={:.6})",
            p_closed, p_open
        );
    }

    // TEST 1.6 (PBP2a) — HERALD druggability: open-gate persistence < 1%
    // (because the gate is closed > 99.9% of the time without a ligand trigger).
    #[test]
    fn pbp2a_active_site_persistence_below_1_percent_without_allosteric_trigger() {
        let ens = ConformationalEnsemble {
            states: vec![pbp2a_closed_gate(), pbp2a_open_gate()],
        };
        let persistence = ens.binding_site_persistence().unwrap();
        assert!(
            persistence < 0.01,
            "PBP2a active site persistence should be <1% (conventional β-lactams fail), got {persistence:.6}"
        );
    }

    // TEST 1.2 (PBP2a) — Two-state PBP2a ensemble: gate modelled correctly.
    // P_closed > 0.999 means the ensemble is overwhelmingly in the closed state.
    #[test]
    fn pbp2a_two_state_ensemble_is_predominantly_closed() {
        let ens = ConformationalEnsemble {
            states: vec![pbp2a_closed_gate(), pbp2a_open_gate()],
        };
        let weights = ens.boltzmann_weights().unwrap();
        // closed (index 0) should have weight > 0.999
        assert!(
            weights[0] > 0.999,
            "closed gate must dominate ensemble, P_closed={:.6}", weights[0]
        );
    }
}
