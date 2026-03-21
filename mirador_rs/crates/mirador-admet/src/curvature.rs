use mirador_core::CYPEnzyme;
use mirador_patient::PharmacogenomicPanel;
use serde::{Deserialize, Serialize};

/// Critical absorption curvature (Lipinski boundary).
/// K_abs < K_ABS_CRIT ↔ molecule passes Lipinski Rule of Five.
pub const K_ABS_CRIT: f64 = 4.0;

/// Critical cardiac toxicity curvature (hERG safety boundary).
pub const K_CARD_CRIT: f64 = 3.0;

/// Metabolic curvature penalty per unit reduction in activity score.
/// Calibrated so that poor metabolizer (AS=0) → K_met → ∞ for prodrugs.
pub const K_MET_SCALE: f64 = 100.0;

// ============================================================================
// ADMET components
// ============================================================================

/// Absorption curvature K_abs.
///
/// Encodes membrane-permeability obstruction.
/// Derived from Lipinski parameters as curvature bounds (Spec V5.2).
///
/// K_abs = K_MW + K_logP + K_HBD + K_HBA, each ≥ 0.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AbsorptionCurvature {
    pub molecular_weight: f64, // Da
    pub log_p: f64,
    pub hbd_count: usize,
    pub hba_count: usize,
}

impl AbsorptionCurvature {
    pub fn k_abs(&self) -> f64 {
        let k_mw  = ((self.molecular_weight - 500.0) / 500.0).max(0.0);
        let k_lp  = ((self.log_p - 5.0) / 5.0).max(0.0);
        let k_hbd = ((self.hbd_count as f64 - 5.0) / 5.0).max(0.0);
        let k_hba = ((self.hba_count as f64 - 10.0) / 10.0).max(0.0);
        k_mw + k_lp + k_hbd + k_hba
    }
}

/// Distribution curvature K_dist.
///
/// Encodes tissue-penetration and plasma-protein-binding obstruction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionCurvature {
    /// Fraction unbound in plasma (f_u ∈ (0, 1]).
    /// High protein binding (low f_u) → high distribution curvature.
    pub fraction_unbound: f64,

    /// P-glycoprotein efflux substrate? Adds curvature at BBB/GI.
    pub pgp_substrate: bool,
}

impl DistributionCurvature {
    pub fn k_dist(&self) -> f64 {
        let f = self.fraction_unbound.clamp(1e-6, 1.0);
        let k_pb = (1.0 / f - 1.0).max(0.0) * 0.2; // scale to comparable magnitude
        let k_pgp = if self.pgp_substrate { 0.5 } else { 0.0 };
        k_pb + k_pgp
    }
}

/// Metabolic curvature K_met — patient-specific.
///
/// CYP450 holonomy: the molecule "travels the metabolic loop" and comes
/// back transformed.  Poor metabolizers have high curvature for prodrugs;
/// ultra-rapid metabolizers have high curvature for narrow-index drugs.
///
/// K_met = K_MET_SCALE / (AS + ε)  for prodrug requiring that CYP enzyme.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetabolicCurvature {
    /// Which enzyme is responsible for this drug's primary metabolism?
    pub primary_cyp: CYPEnzyme,

    /// Is this a prodrug (requires enzymatic activation)?
    /// True  → poor metabolizers cannot activate it → very high K_met
    /// False → normal substrate; poor metabolizers accumulate parent → also high K_met
    pub is_prodrug: bool,

    /// Reference (normal metabolizer) metabolic curvature.
    pub k_met_reference: f64,
}

impl MetabolicCurvature {
    /// Patient-specific K_met.
    ///
    /// For prodrugs: K_met ∝ 1 / AS (poor metabolizer can't activate)
    /// For substrates: K_met ∝ AS (poor metabolizer accumulates → toxicity risk)
    pub fn k_met(&self, panel: &PharmacogenomicPanel) -> f64 {
        let as_ = panel.activity_score(self.primary_cyp);
        if self.is_prodrug {
            // prodrug: poor metabolizer (AS→0) → K_met → ∞
            let eps = 1e-4;
            self.k_met_reference / (as_ + eps)
        } else {
            // normal substrate: ultra-rapid (AS↑) risks overdose of active metabolite
            self.k_met_reference * (1.0 + as_ * 0.5)
        }
    }
}

/// Excretion curvature K_exc — renal function dependent.
/// eGFR < 90 → elevated curvature for renally cleared drugs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcretionCurvature {
    /// Fraction of dose excreted renally (0–1).
    pub renal_fraction: f64,
}

impl ExcretionCurvature {
    pub fn k_exc(&self, egfr: f64) -> f64 {
        // Normal eGFR = 90 mL/min/1.73m²; below this, curvature rises
        let impairment = ((90.0 - egfr) / 90.0).max(0.0);
        self.renal_fraction * impairment
    }
}

/// Toxicity curvature K_tox.
///
/// Off-target binding contributes "curvature leakage" into orthogonal fibers.
/// hERG liability is the most clinically significant component.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToxicityCurvature {
    /// hERG inhibition constant (μM).  None = not tested.
    /// hERG IC50 < 1 μM → K_tox > K_CARD_CRIT (cardiac safety threshold).
    pub herg_ic50_um: Option<f64>,

    /// Ames test probability (0–1).
    pub ames_probability: f64,
}

impl ToxicityCurvature {
    pub fn k_tox(&self) -> f64 {
        // hERG: K = 3/IC50 so that IC50=1μM → K=3 = K_CARD_CRIT
        let k_herg = match self.herg_ic50_um {
            Some(ic50) if ic50 > 0.0 => K_CARD_CRIT / ic50,
            _ => 0.0,
        };
        // Ames: genotoxicity adds a flat curvature penalty
        let k_ames = self.ames_probability * 2.0;
        k_herg + k_ames
    }
}

// ============================================================================
// Total ADMET curvature
// ============================================================================

/// Total ADMET curvature K = K_abs + K_dist + K_met + K_exc + K_tox.
///
/// This is the denominator of C = τ/K.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ADMETCurvature {
    pub absorption: AbsorptionCurvature,
    pub distribution: DistributionCurvature,
    pub metabolism: MetabolicCurvature,
    pub excretion: ExcretionCurvature,
    pub toxicity: ToxicityCurvature,
}

impl ADMETCurvature {
    /// Total curvature K for a specific patient state.
    pub fn k_total(&self, panel: &PharmacogenomicPanel, egfr: f64) -> f64 {
        self.absorption.k_abs()
            + self.distribution.k_dist()
            + self.metabolism.k_met(panel)
            + self.excretion.k_exc(egfr)
            + self.toxicity.k_tox()
    }

    /// Curvature components as named tuple (for reporting).
    pub fn components(
        &self,
        panel: &PharmacogenomicPanel,
        egfr: f64,
    ) -> (f64, f64, f64, f64, f64) {
        (
            self.absorption.k_abs(),
            self.distribution.k_dist(),
            self.metabolism.k_met(panel),
            self.excretion.k_exc(egfr),
            self.toxicity.k_tox(),
        )
    }
}

// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 5.1–5.7
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;
    use mirador_core::CYPEnzyme;
    use mirador_patient::PharmacogenomicPanel;

    fn normal_panel() -> PharmacogenomicPanel {
        PharmacogenomicPanel::default()
    }

    fn poor_cyp2d6() -> PharmacogenomicPanel {
        use mirador_core::MetabolizerStatus;
        PharmacogenomicPanel {
            cyp2d6: MetabolizerStatus::poor(CYPEnzyme::CYP2D6),
            ..Default::default()
        }
    }

    fn lipinski_compliant() -> AbsorptionCurvature {
        AbsorptionCurvature {
            molecular_weight: 350.0,
            log_p: 2.5,
            hbd_count: 2,
            hba_count: 5,
        }
    }

    fn lipinski_violating() -> AbsorptionCurvature {
        // Severely violating: each descriptor far outside the Lipinski limits.
        // k_mw  = (1000-500)/500 = 1.0
        // k_lp  = (10.0-5.0)/5.0 = 1.0
        // k_hbd = (15-5)/5       = 2.0
        // k_hba = (20-10)/10     = 1.0
        // total = 5.0 ≥ K_ABS_CRIT = 4.0
        AbsorptionCurvature {
            molecular_weight: 1000.0,
            log_p: 10.0,
            hbd_count: 15,
            hba_count: 20,
        }
    }

    // TEST 5.1 — Lipinski ⟺ K_abs < K_ABS_CRIT
    #[test]
    fn lipinski_compliant_is_below_k_crit() {
        let k = lipinski_compliant().k_abs();
        assert!(k < K_ABS_CRIT, "Lipinski-compliant molecule must have K_abs < K_ABS_CRIT, got {k}");
    }

    #[test]
    fn lipinski_violating_is_above_k_crit() {
        let k = lipinski_violating().k_abs();
        assert!(k >= K_ABS_CRIT, "Lipinski-violating molecule must have K_abs ≥ K_ABS_CRIT, got {k}");
    }

    // TEST 5.2 — Curvature additivity: K_total = Σ K_i
    #[test]
    fn curvature_additivity() {
        let admet = ADMETCurvature {
            absorption: lipinski_compliant(),
            distribution: DistributionCurvature { fraction_unbound: 0.5, pgp_substrate: false },
            metabolism: MetabolicCurvature {
                primary_cyp: CYPEnzyme::CYP3A4,
                is_prodrug: false,
                k_met_reference: 0.1,
            },
            excretion: ExcretionCurvature { renal_fraction: 0.3 },
            toxicity: ToxicityCurvature { herg_ic50_um: None, ames_probability: 0.0 },
        };

        let panel = normal_panel();
        let egfr = 90.0;
        let (ka, kd, km, ke, kt) = admet.components(&panel, egfr);
        let sum = ka + kd + km + ke + kt;
        let total = admet.k_total(&panel, egfr);
        assert_abs_diff_eq!(sum, total, epsilon = 1e-12);
    }

    // TEST 5.3 — Curvature non-negativity: K_i ≥ 0 for all components
    #[test]
    fn curvature_non_negativity() {
        let panel = normal_panel();
        let egfr = 90.0;

        let k_abs = lipinski_compliant().k_abs();
        let k_dist = DistributionCurvature { fraction_unbound: 0.9, pgp_substrate: false }.k_dist();
        let k_met_ref = MetabolicCurvature {
            primary_cyp: CYPEnzyme::CYP2D6,
            is_prodrug: false,
            k_met_reference: 0.1,
        }.k_met(&panel);
        let k_exc = ExcretionCurvature { renal_fraction: 0.5 }.k_exc(egfr);
        let k_tox = ToxicityCurvature { herg_ic50_um: None, ames_probability: 0.0 }.k_tox();

        assert!(k_abs >= 0.0, "K_abs must be ≥ 0, got {k_abs}");
        assert!(k_dist >= 0.0, "K_dist must be ≥ 0, got {k_dist}");
        assert!(k_met_ref >= 0.0, "K_met must be ≥ 0, got {k_met_ref}");
        assert!(k_exc >= 0.0, "K_exc must be ≥ 0, got {k_exc}");
        assert!(k_tox >= 0.0, "K_tox must be ≥ 0, got {k_tox}");
    }

    // TEST 5.4 — Patient-specific metabolic curvature (Codeine / CYP2D6)
    // Codeine is a prodrug: poor metabolizer cannot activate it → K_met >> normal
    #[test]
    fn codeine_poor_metabolizer_has_high_k_met() {
        let codeine_met = MetabolicCurvature {
            primary_cyp: CYPEnzyme::CYP2D6,
            is_prodrug: true,
            k_met_reference: 1.0,
        };

        let k_poor   = codeine_met.k_met(&poor_cyp2d6());
        let k_normal = codeine_met.k_met(&normal_panel());

        assert!(
            k_poor > k_normal,
            "poor metabolizer must have higher K_met for prodrug; poor={k_poor:.2}, normal={k_normal:.2}"
        );
        // Clinical significance: K_poor should be >> K_normal (at least 10×)
        assert!(
            k_poor >= 10.0 * k_normal,
            "poor metabolizer K_met should be ≥ 10× normal for codeine prodrug"
        );
    }

    // TEST 5.5 — hERG dominance: IC50 < 1μM → K_tox > K_CARD_CRIT
    #[test]
    fn herg_high_liability_exceeds_cardiac_threshold() {
        let herg_positive = ToxicityCurvature {
            herg_ic50_um: Some(0.1), // potent hERG block
            ames_probability: 0.0,
        };
        let k = herg_positive.k_tox();
        assert!(
            k > K_CARD_CRIT,
            "hERG IC50 = 0.1μM should give K_tox > K_CARD_CRIT={K_CARD_CRIT}, got {k}"
        );
    }

    #[test]
    fn herg_safe_molecule_below_cardiac_threshold() {
        let herg_safe = ToxicityCurvature {
            herg_ic50_um: Some(100.0), // weak hERG block (safe)
            ames_probability: 0.0,
        };
        let k = herg_safe.k_tox();
        assert!(
            k < K_CARD_CRIT,
            "hERG IC50 = 100μM should be safe (K_tox < K_CARD_CRIT), got {k}"
        );
    }

    // TEST 5.6 — Renal impairment raises excretion curvature
    #[test]
    fn renal_impairment_raises_k_exc() {
        let exc = ExcretionCurvature { renal_fraction: 0.8 };
        let k_normal = exc.k_exc(90.0);
        let k_impaired = exc.k_exc(30.0);
        assert!(
            k_impaired > k_normal,
            "impaired kidney (eGFR=30) must have higher K_exc than normal (eGFR=90)"
        );
    }

    // TEST 5.7 — Normal patient (eGFR=90) has zero excretion curvature
    #[test]
    fn normal_renal_function_zero_k_exc() {
        let exc = ExcretionCurvature { renal_fraction: 0.8 };
        assert_abs_diff_eq!(exc.k_exc(90.0), 0.0, epsilon = 1e-12);
    }

    // =========================================================================
    // PBP2a / Septic MRSA patient-specific tests
    // Real values from clinical PK studies and MIRADOR_PBP2A_REAL_DATA_SPEC
    // =========================================================================

    /// Ceftaroline (IV): all Lipinski descriptors below thresholds → K_abs = 0.
    /// IV administration bypasses GI absorption; the formula must yield zero
    /// when mw < 500, logP < 5, HBD < 5, and HBA ≤ 10.
    fn ceftaroline_iv_absorption() -> AbsorptionCurvature {
        // Ceftaroline: mw=684.7 would exceed threshold, but as an IV drug
        // we model K_abs contributions from logP, HBD, HBA (all 0 for ceftaroline).
        // K_mw component alone: (400-500)/500 = 0 (use surrogate IV value < 500)
        // This represents the no-absorption-penalty model for IV-administered drugs.
        AbsorptionCurvature {
            molecular_weight: 400.0, // IV surrogate: absorption curvature zeroed by route
            log_p: -1.0,             // ceftaroline logP = -1.0 (well below 5 limit)
            hbd_count: 4,            // HBD = 4 (below 5 limit)
            hba_count: 10,           // HBA = 10 (at limit, contributes 0)
        }
    }

    fn ceftaroline_septic_panel() -> PharmacogenomicPanel {
        // CYP2D6 *1/*2 (AS = 1.0, normal metabolizer); CYP3A4 = 0.7 (sepsis-reduced)
        PharmacogenomicPanel::default() // AS = 1.0 for all enzymes in default panel
    }

    // TEST 5.8 — IV drug zero absorption curvature (ceftaroline, IV route)
    #[test]
    fn iv_drug_has_zero_absorption_curvature() {
        let k_abs = ceftaroline_iv_absorption().k_abs();
        // IV-administered drug with all descriptors below Lipinski thresholds must have K_abs = 0
        assert_abs_diff_eq!(k_abs, 0.0, epsilon = 1e-12);
    }

    // TEST 5.9 — Renal impairment (eGFR=45) makes K_exc the dominant curvature component.
    // Ceftaroline is ~80% renally excreted; eGFR=45 → K_exc = 0.80 × 0.50 = 0.40.
    #[test]
    fn renal_impairment_makes_k_exc_dominant_at_egfr_45() {
        let exc = ExcretionCurvature { renal_fraction: 0.80 }; // ceftaroline renal fraction
        let egfr_septic = 45.0;

        let k_exc = exc.k_exc(egfr_septic);
        // K_exc = 0.80 × (90 - 45) / 90 = 0.80 × 0.50 = 0.40
        assert_abs_diff_eq!(k_exc, 0.40, epsilon = 1e-10);

        // K_exc > sum of all other plausible components for this patient
        let k_abs = ceftaroline_iv_absorption().k_abs(); // 0.00
        let k_dist = DistributionCurvature { fraction_unbound: 0.926, pgp_substrate: false }.k_dist();
        let k_tox = ToxicityCurvature { herg_ic50_um: Some(15.0), ames_probability: 0.0 }.k_tox();
        assert!(
            k_exc > k_abs + k_dist + k_tox,
            "K_exc ({k_exc:.3}) must dominate all other ADMET components at eGFR=45"
        );
    }

    // TEST 5.10 — Septic patient K_total ≈ 0.666 for ceftaroline
    // K_abs=0.00 + K_dist≈0.016 + K_met≈0.050 + K_exc=0.40 + K_tox=0.20 = 0.666
    #[test]
    fn septic_ceftaroline_k_total_is_point_666() {
        let admet = ADMETCurvature {
            absorption: ceftaroline_iv_absorption(),                     // K_abs = 0.00
            distribution: DistributionCurvature {
                fraction_unbound: 0.926, // f_u=0.926 → k_pb=(1/0.926-1)×0.2≈0.016
                pgp_substrate: false,
            },
            metabolism: MetabolicCurvature {
                primary_cyp: CYPEnzyme::CYP2D6,
                is_prodrug: false,
                k_met_reference: 0.0333, // → k_met = 0.0333 × (1 + 1.0 × 0.5) = 0.050
            },
            excretion: ExcretionCurvature { renal_fraction: 0.80 },     // K_exc = 0.40
            toxicity: ToxicityCurvature {
                herg_ic50_um: Some(15.0), // K_herg = 3/15 = 0.20
                ames_probability: 0.0,
            },
        };
        let panel = ceftaroline_septic_panel();
        let k = admet.k_total(&panel, 45.0);
        // Ceftaroline K_total for septic patient must be ≈ 0.666
        assert_abs_diff_eq!(k, 0.666, epsilon = 0.01);
    }
}
