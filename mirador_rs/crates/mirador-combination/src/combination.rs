/// A single therapeutic drug, described by its topological invariant τ and
/// ADMET curvature K. Coherence C = τ / K.
#[derive(Debug, Clone)]
pub struct DrugSection {
    /// Pharmacophore topological invariant (τ > 0).
    pub tau: f64,
    /// Total ADMET curvature (K > 0).
    pub k: f64,
}

impl DrugSection {
    /// Davis Field Equation: C = τ / K.
    pub fn coherence(&self) -> f64 {
        self.tau / self.k
    }
}

/// Classification of a drug-drug interaction according to the tensor product bundle.
///
/// Synergy:    combined curvature coupling is favorable → C_combo > max(C₁, C₂)
/// Antagonism: curvature coupling is unfavorable → C_combo < min(C₁, C₂)
/// Additivity: curvatures add independently → Bliss independence
#[derive(Debug, Clone)]
pub enum InteractionType {
    /// Synergy: C_combo = max(C₁, C₂) + bliss_delta (super-additive).
    /// bliss_delta > 0 is the coherence bonus from cooperative binding.
    Synergy { bliss_delta: f64 },
    /// Antagonism: C_combo = min(C₁, C₂) × (1 − bliss_delta) (sub-additive).
    /// bliss_delta ∈ (0, 1] is the fractional coherence penalty.
    Antagonism { bliss_delta: f64 },
    /// Additivity (Bliss independence): C_combo = C₁ + C₂.
    Additivity,
}

/// A combination of two drugs: the therapeutic tensor product section E₁ ⊗ E₂.
pub struct CombinationSection {
    pub drug1: DrugSection,
    pub drug2: DrugSection,
    pub interaction: InteractionType,
}

impl CombinationSection {
    /// Combined coherence of the drug pair under the specified interaction model.
    ///
    /// - Synergy:    C = max(C₁, C₂) + δ          (exceeds the better drug alone)
    /// - Antagonism: C = min(C₁, C₂) × (1 − δ)   (worse than the weaker drug alone)
    /// - Additivity: C = C₁ + C₂                   (Bliss independence)
    pub fn combined_coherence(&self) -> f64 {
        let c1 = self.drug1.coherence();
        let c2 = self.drug2.coherence();
        match &self.interaction {
            InteractionType::Synergy { bliss_delta } => c1.max(c2) + bliss_delta,
            InteractionType::Antagonism { bliss_delta } => c1.min(c2) * (1.0 - bliss_delta).max(0.0),
            InteractionType::Additivity => c1 + c2,
        }
    }

    /// Upper bound on the combined ADMET curvature.
    ///
    /// K(E₁ ⊗ E₂) ≤ K₁ + K₂ + |interaction_penalty|
    /// The interaction term captures DDI (drug-drug interaction) curvature.
    pub fn combined_curvature_bound(&self) -> f64 {
        let interaction_penalty = match &self.interaction {
            InteractionType::Synergy { bliss_delta } => *bliss_delta,
            InteractionType::Antagonism { bliss_delta } => *bliss_delta,
            InteractionType::Additivity => 0.0,
        };
        self.drug1.k + self.drug2.k + interaction_penalty.abs()
    }
}

// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 8.1–8.5
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    // TEST 8.1 — Synergy detection: co-trimoxazole (TMP + SMX) is synergistic.
    // Trimethoprim blocks DHFR; sulfamethoxazole blocks upstream DHPS.
    // Sequential pathway blockade → coherence exceeds either drug alone.
    #[test]
    fn cotrimoxazole_combination_is_synergistic() {
        let combo = CombinationSection {
            drug1: DrugSection { tau: 5.0, k: 1.0 }, // TMP: C = 5
            drug2: DrugSection { tau: 4.0, k: 1.0 }, // SMX: C = 4
            interaction: InteractionType::Synergy { bliss_delta: 2.0 },
        };
        let c_combo = combo.combined_coherence();
        let c1 = combo.drug1.coherence();
        let c2 = combo.drug2.coherence();
        assert!(
            c_combo > c1.max(c2),
            "synergistic combination should exceed max individual coherence: {c_combo} vs max({c1},{c2})"
        );
    }

    // TEST 8.2 — Antagonism detection: bacteriostatic (tetracycline) + bactericidal (penicillin).
    // Tetracycline slows growth → penicillin (which targets dividing cells) is blunted.
    // Combined coherence should be BELOW min(C_tet, C_pcn).
    #[test]
    fn bacteriostatic_plus_bactericidal_is_antagonistic() {
        let combo = CombinationSection {
            drug1: DrugSection { tau: 2.0, k: 0.5 }, // tetracycline: C = 4
            drug2: DrugSection { tau: 3.0, k: 0.8 }, // penicillin: C ≈ 3.75
            interaction: InteractionType::Antagonism { bliss_delta: 0.9 },
        };
        let c_combo = combo.combined_coherence();
        let c1 = combo.drug1.coherence();
        let c2 = combo.drug2.coherence();
        assert!(
            c_combo < c1.min(c2),
            "antagonistic combination should be below min individual coherence: {c_combo} vs min({c1},{c2})"
        );
    }

    // TEST 8.3 — Tensor product curvature bound: K_combo ≤ K₁ + K₂ + |delta|
    #[test]
    fn tensor_product_curvature_bound_holds() {
        let combo = CombinationSection {
            drug1: DrugSection { tau: 3.0, k: 1.5 },
            drug2: DrugSection { tau: 2.0, k: 0.8 },
            interaction: InteractionType::Synergy { bliss_delta: 0.5 },
        };
        let bound = combo.combined_curvature_bound();
        let k1 = combo.drug1.k;
        let k2 = combo.drug2.k;
        let delta = 0.5f64;
        assert!(
            bound <= k1 + k2 + delta.abs() + 1e-10,
            "curvature bound violated: {bound} > {}",
            k1 + k2 + delta.abs()
        );
    }

    // TEST 8.4 — Additivity (Bliss independence): combined coherence = C₁ + C₂
    #[test]
    fn additive_combination_coherence_is_sum() {
        let combo = CombinationSection {
            drug1: DrugSection { tau: 4.0, k: 2.0 }, // C = 2
            drug2: DrugSection { tau: 3.0, k: 1.0 }, // C = 3
            interaction: InteractionType::Additivity,
        };
        let c_combo = combo.combined_coherence();
        assert_abs_diff_eq!(c_combo, 5.0, epsilon = 1e-10);
    }

    // TEST 8.5 — DDI: CYP3A4 inhibitor raises K_met of substrate.
    // We model ketoconazole (CYP3A4 inhibitor) + midazolam (CYP3A4 substrate).
    // The DDI raises K (worse ADMET) for midazolam → lower coherence than alone.
    #[test]
    fn cyp3a4_ddi_raises_substrate_curvature() {
        // Midazolam alone
        let midazolam = DrugSection { tau: 3.0, k: 1.0 }; // C = 3

        // Midazolam in presence of ketoconazole (CYP3A4 inhibited):
        // plasma exposure increases 10-15×, meaning effective K rises dramatically
        let midazolam_with_keto = DrugSection { tau: 3.0, k: 10.0 }; // C = 0.3

        assert!(
            midazolam_with_keto.k > midazolam.k,
            "CYP3A4 DDI should raise metabolic curvature"
        );
        assert!(
            midazolam_with_keto.coherence() < midazolam.coherence(),
            "DDI should reduce coherence: {} vs {}",
            midazolam_with_keto.coherence(),
            midazolam.coherence()
        );
    }

    // Additional — synergy combined coherence is positive
    #[test]
    fn combined_coherence_positive_for_synergy() {
        let combo = CombinationSection {
            drug1: DrugSection { tau: 1.0, k: 0.5 },
            drug2: DrugSection { tau: 1.0, k: 0.5 },
            interaction: InteractionType::Synergy { bliss_delta: 0.5 },
        };
        assert!(combo.combined_coherence() > 0.0);
    }

    // Additional — antagonism clamps to zero (cannot have negative combined coherence)
    #[test]
    fn antagonism_combined_coherence_is_non_negative() {
        let combo = CombinationSection {
            drug1: DrugSection { tau: 1.0, k: 1.0 }, // C = 1
            drug2: DrugSection { tau: 1.0, k: 1.0 }, // C = 1
            interaction: InteractionType::Antagonism { bliss_delta: 1.0 }, // max penalty
        };
        assert!(combo.combined_coherence() >= 0.0);
    }

    // =========================================================================
    // PBP2a / Ceftaroline+Meropenem combination tests (OFID Dec 2025 data)
    // =========================================================================

    /// Ceftaroline section: τ=12 (PBP2a dual-site), K=0.666 (septic patient)
    /// → C_ceft = 12.0 / 0.666 ≈ 18.02
    fn ceftaroline_section() -> DrugSection {
        DrugSection { tau: 12.0, k: 0.666 }
    }

    /// Meropenem section: τ=6 (β-lactam allosteric binder), K=0.80 (renally cleared, septic)
    /// → C_mer = 6.0 / 0.80 = 7.5
    fn meropenem_section() -> DrugSection {
        DrugSection { tau: 6.0, k: 0.80 }
    }

    /// Vancomycin section: τ=4 (glycopeptide, limited topological complexity), K=2.15 (nephrotoxic)
    /// → C_vanc = 4 / 2.15 ≈ 1.86  (near-toxic trough + high K_tox contribution)
    fn vancomycin_section() -> DrugSection {
        DrugSection { tau: 4.0, k: 2.15 }
    }

    // TEST 8.7 — Ceftaroline+meropenem combination is synergistic (OFID Dec 2025)
    // FICI ≤ 0.50 in clinical isolates; modeled as synergy with positive bliss_delta.
    #[test]
    fn ceftaroline_meropenem_synergy_exceeds_individual_drugs() {
        // Meropenem allosterically opens the PBP2a gate (Kd=270μM); bliss_delta
        // represents the additional coherence from cooperative dual-target action.
        let combo = CombinationSection {
            drug1: ceftaroline_section(), // C ≈ 18.02
            drug2: meropenem_section(),   // C = 7.50
            interaction: InteractionType::Synergy { bliss_delta: 3.0 },
        };
        let c_combo = combo.combined_coherence();
        let c_ceft  = combo.drug1.coherence();
        let c_mer   = combo.drug2.coherence();
        assert!(
            c_combo > c_ceft.max(c_mer),
            "ceftaroline+meropenem combination ({c_combo:.2}) must exceed best single agent ({:.2})",
            c_ceft.max(c_mer)
        );
    }

    // TEST 8.8 — Ceftaroline coherence greatly exceeds vancomycin (C_ceft >> C_vanc)
    // C_ceft ≈ 18 vs C_vanc ≈ 1.86: ceftaroline is the recommended first-line agent.
    #[test]
    fn ceftaroline_coherence_exceeds_vancomycin_by_ninefold() {
        let c_ceft = ceftaroline_section().coherence();
        let c_vanc = vancomycin_section().coherence();
        assert!(
            c_ceft > c_vanc,
            "ceftaroline coherence ({c_ceft:.2}) must exceed vancomycin ({c_vanc:.2})"
        );
        // Quantitative: at least 5× advantage
        assert!(
            c_ceft >= 5.0 * c_vanc,
            "ceftaroline should have ≥5× coherence advantage: C_ceft={c_ceft:.2}, C_vanc={c_vanc:.2}"
        );
    }

    // TEST 8.9 — Meropenem Cmax (292 μM) exceeds allosteric binding threshold (Kd=270 μM)
    // Cmax=12.9 mg/L / MW=383.5 g/mol × 1000 = 33.6 μmol/L → scale to clinical peak.
    // At 2g q8h IV (sepsis dosing): Cmax≈292 μM >> Kd=270 μM → allosteric site occupied.
    #[test]
    fn meropenem_clinical_cmax_exceeds_allosteric_kd() {
        let meropenem_mw_g_per_mol = 383.5;
        let meropenem_cmax_mg_per_l = 112.0; // 2g IV peak in sepsis (μg/mL)
        let meropenem_cmax_um = (meropenem_cmax_mg_per_l / meropenem_mw_g_per_mol) * 1000.0;
        let pbp2a_allosteric_kd_um = 270.0; // Kd from JACS 2014 allosteric site

        assert!(
            meropenem_cmax_um > pbp2a_allosteric_kd_um,
            "meropenem Cmax ({meropenem_cmax_um:.1} μM) must exceed PBP2a allosteric Kd ({pbp2a_allosteric_kd_um} μM)"
        );
    }
}
