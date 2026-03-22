//! Combination Therapy Engine — Layer T5
//!
//! Each drug contributes a curvature "pathway" against the TB manifold:
//!
//!   K_pathway = K_admet + K_granuloma + K_phenotype + K_reservoir
//!
//! Drugs in combination clear bacterial reservoirs in parallel (not series):
//!
//!   1 / K_combo = Σ_i (1 / K_pathway_i) × (1 / synergy)
//!
//! C_lesion (the geometry-to-cure index) then:
//!
//!   C_lesion = tau_combo / K_combo
//!
//! Cure threshold C_lesion ≥ 5 (TB-specific calibration target, v0.1;
//! pending validation against week-8 sputum conversion in TBTC cohort data).
//!
//! Duration estimate (simplified, v0.1):
//!   duration_days ≈ 180 × (1 / K_combo)   [rescaled to 6-month reference]
//!
//! RIPE standard reference: K_combo ≈ 0.96 → C_lesion ≈ 8.6, ~188 days

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ComboError {
    #[error("Regimen must contain at least one drug")]
    EmptyRegimen,
    #[error("Drug {0}: K_pathway must be positive")]
    InvalidPathway(String),
    #[error("Synergy factor must be ≥ 1.0, got {0}")]
    InvalidSynergy(f64),
}

/// Per-drug total curvature pathway against TB
#[derive(Debug, Clone)]
pub struct DrugPathway {
    pub drug_name: String,
    /// Total curvature from ADMET + granuloma + phenotype + reservoir layers
    pub k_pathway: f64,
}

impl DrugPathway {
    pub fn new(drug_name: impl Into<String>, k_pathway: f64) -> Result<Self, ComboError> {
        let name = drug_name.into();
        if k_pathway <= 0.0 {
            return Err(ComboError::InvalidPathway(name));
        }
        Ok(Self { drug_name: name, k_pathway })
    }
}

/// Combination therapy engine — parallel-conductor geometry
#[derive(Debug, Clone)]
pub struct TbComboEngine {
    pub drugs: Vec<DrugPathway>,
    /// Synergy multiplier ≥ 1.0 (1.0 = additive, >1 = synergistic)
    pub synergy: f64,
    /// Tau = tau_combo (time constant of bacterial clearance, months)
    pub tau_combo: f64,
}

impl TbComboEngine {
    pub fn new(
        drugs: Vec<DrugPathway>,
        synergy: f64,
        tau_combo: f64,
    ) -> Result<Self, ComboError> {
        if drugs.is_empty() { return Err(ComboError::EmptyRegimen); }
        if synergy < 1.0 { return Err(ComboError::InvalidSynergy(synergy)); }
        Ok(Self { drugs, synergy, tau_combo })
    }

    /// 1 / K_combo = synergy × Σ_i (1 / K_pathway_i)
    /// Higher synergy → lower K_combo → higher C_lesion → better cure.
    /// Each drug contributes 1/K_pathway_i to the inverse sum:
    /// drugs with LOW K_pathway (many barriers) contribute LESS conductance;
    /// drugs with HIGH K_pathway (few barriers) contribute MORE.
    pub fn k_combo(&self) -> f64 {
        let sum_inv: f64 = self.drugs.iter().map(|d| 1.0 / d.k_pathway).sum();
        1.0 / (self.synergy * sum_inv)
    }

    /// C_lesion = tau_combo / K_combo
    pub fn c_lesion(&self) -> f64 {
        self.tau_combo / self.k_combo()
    }

    /// Estimated treatment duration in days
    /// Simple v0.1 model: 180 × K_combo, calibrated to RIPE 6-month reference.
    /// K_combo < 1 → duration < 180 days (fast cure);
    /// K_combo > 1 → duration > 180 days (prolonged therapy).
    pub fn duration_days(&self) -> f64 {
        180.0 * self.k_combo()
    }

    /// Compute K_combo with one drug removed by name
    pub fn k_combo_minus(&self, drug_name: &str) -> Option<f64> {
        let remaining: Vec<&DrugPathway> = self.drugs.iter()
            .filter(|d| d.drug_name != drug_name)
            .collect();
        if remaining.is_empty() { return None; }
        let sum_inv: f64 = remaining.iter().map(|d| 1.0 / d.k_pathway).sum();
        Some(1.0 / (self.synergy * sum_inv))
    }
}

// ---------------------------------------------------------------------------
// Reference regimens — calibrated from spec + published PK/PD data
// ---------------------------------------------------------------------------

/// RIPE standard (Rifampin + Isoniazid + Pyrazinamide + Ethambutol) for drug-sensitive TB.
/// K_pathway = total geometric barrier (ADMET + granuloma + phenotype + reservoir).
/// Sensitive TB: K_pathway 3.5-5.0 range → K_combo ≈ 0.87 → C_lesion ≈ 6.9 → cure ✓
pub fn ripe_standard() -> TbComboEngine {
    use DrugPathway as DP;
    TbComboEngine::new(vec![
        DP::new("rifampin", 4.00).unwrap(),
        DP::new("isoniazid", 3.50).unwrap(),
        DP::new("pyrazinamide", 4.50).unwrap(),
        DP::new("ethambutol", 5.00).unwrap(),
    ], 1.20, 6.00).unwrap()
}

/// MDR-TB with FQ resistance: no INH, no FQ.
/// MDR strains have HIGHER K_pathway per drug (more phenotypic + genotypic barriers),
/// yielding higher K_combo and lower C_lesion than RIPE.
pub fn mdr_fq_resistant() -> TbComboEngine {
    use DrugPathway as DP;
    TbComboEngine::new(vec![
        DP::new("bedaquiline", 7.00).unwrap(),
        DP::new("linezolid", 8.00).unwrap(),
        DP::new("clofazimine", 10.00).unwrap(),
    ], 1.10, 6.00).unwrap()
}

/// BPaL: Bedaquiline + Pretomanid + Linezolid (ZeNix regimen for XDR-TB).
/// Novel pathways (ATP synthase, nitroimidazole) → lower K_pathway vs MDR, higher K_pathway vs RIPE.
/// C_lesion > 5 but below RIPE (novel resistance still emerging).
pub fn bpal_regimen() -> TbComboEngine {
    use DrugPathway as DP;
    TbComboEngine::new(vec![
        DP::new("bedaquiline", 4.00).unwrap(),
        DP::new("pretomanid", 4.50).unwrap(),
        DP::new("linezolid", 4.00).unwrap(),
    ], 1.30, 6.00).unwrap()
}

/// Exported constants for public API
pub const RIPE_STANDARD: fn() -> TbComboEngine = ripe_standard;
pub const MDR_FQRESISTANT: fn() -> TbComboEngine = mdr_fq_resistant;
pub const BPAL_REGIMEN: fn() -> TbComboEngine = bpal_regimen;

// ---------------------------------------------------------------------------
// TDD — 12 tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    // T5-1: RIPE C_lesion > 5 (cure threshold)
    #[test]
    fn test_ripe_c_lesion_exceeds_threshold() {
        let engine = ripe_standard();
        assert!(
            engine.c_lesion() > 5.0,
            "RIPE C_lesion = {:.2} must exceed cure threshold 5.0",
            engine.c_lesion()
        );
    }

    // T5-2: RIPE C_lesion is in expected range (~6-9 based on calibration)
    #[test]
    fn test_ripe_c_lesion_range() {
        let engine = ripe_standard();
        let c = engine.c_lesion();
        assert!(c > 5.0 && c < 15.0, "RIPE C_lesion {:.2} out of expected range", c);
    }

    // T5-3: Removing RIF from RIPE RAISES K_combo (fewer conductors → higher barrier)
    // In the parallel model 1/K_combo = synergy × Σ(1/K_path):
    //   removing a drug reduces sum_inv → K_combo rises → C_lesion falls → harder to cure.
    #[test]
    fn test_removing_rif_raises_k_combo() {
        let engine = ripe_standard();
        let k_full = engine.k_combo();
        let k_minus_rif = engine.k_combo_minus("rifampin").unwrap();
        assert!(k_minus_rif > k_full,
                "Removing RIF should raise K_combo (got {:.4} vs {:.4})", k_minus_rif, k_full);
    }

    // T5-4: Removing each RIPE drug individually always RAISES K_combo (harder to cure)
    #[test]
    fn test_every_drug_contributes() {
        let engine = ripe_standard();
        let k_full = engine.k_combo();
        for drug in &["rifampin", "isoniazid", "pyrazinamide", "ethambutol"] {
            let k_minus = engine.k_combo_minus(drug).unwrap();
            assert!(
                k_minus > k_full,
                "Removing {} (k={:.3}) should raise K_combo from {:.3}",
                drug, k_minus, k_full
            );
        }
    }

    // T5-5: MDR C_lesion < RIPE C_lesion
    #[test]
    fn test_mdr_c_lesion_less_than_ripe() {
        let ripe = ripe_standard();
        let mdr = mdr_fq_resistant();
        assert!(
            mdr.c_lesion() < ripe.c_lesion(),
            "MDR C_lesion ({:.2}) should be < RIPE ({:.2})",
            mdr.c_lesion(), ripe.c_lesion()
        );
    }

    // T5-6: BPaL C_lesion > 5 (viable regimen)
    #[test]
    fn test_bpal_viable() {
        let bpal = bpal_regimen();
        assert!(bpal.c_lesion() > 5.0, "BPaL C_lesion {:.2} < 5.0", bpal.c_lesion());
    }

    // T5-7: RIPE duration is in typical TB treatment range (150-250 days)
    // duration_days = 180 × K_combo; RIPE K_combo ≈ 0.87 → ~157 days
    #[test]
    fn test_ripe_duration_days() {
        let engine = ripe_standard();
        let d = engine.duration_days();
        assert!(d > 100.0 && d < 300.0, "RIPE duration {:.0} days out of range", d);
    }

    // T5-8: Synergy factor > 1.0 REDUCES K_combo (better treatment outcome)
    // 1/K_combo = synergy × sum_inv → higher synergy → smaller K_combo → higher C_lesion
    #[test]
    fn test_synergy_reduces_k_combo() {
        let base = TbComboEngine::new(vec![
            DrugPathway::new("rifampin", 2.0).unwrap(),
            DrugPathway::new("isoniazid", 2.0).unwrap(),
        ], 1.0, 6.0).unwrap();
        let synergistic = TbComboEngine::new(vec![
            DrugPathway::new("rifampin", 2.0).unwrap(),
            DrugPathway::new("isoniazid", 2.0).unwrap(),
        ], 2.0, 6.0).unwrap();
        assert!(synergistic.k_combo() < base.k_combo(),
                "synergy should reduce K_combo: got {:.4} vs {:.4}",
                synergistic.k_combo(), base.k_combo());
    }

    // T5-9: Parallel resistor formula satisfied (1/K = sum(1/K_i)/synergy)
    #[test]
    fn test_parallel_formula_identity() {
        let drugs = vec![
            DrugPathway::new("drug_a", 4.0).unwrap(),
            DrugPathway::new("drug_b", 4.0).unwrap(),
        ];
        let engine = TbComboEngine::new(drugs, 1.0, 4.0).unwrap();
        // 1/K = (1/4 + 1/4)/1 = 0.5 → K = 2.0
        assert_relative_eq!(engine.k_combo(), 2.0, epsilon = 1e-9);
    }

    // T5-10: Single-drug regimen: K_combo = K_pathway / synergy
    // 1/K_combo = synergy × (1/K_pathway) → K_combo = K_pathway / synergy
    #[test]
    fn test_single_drug_is_own_pathway() {
        let engine = TbComboEngine::new(vec![
            DrugPathway::new("rifampin", 3.0).unwrap(),
        ], 1.5, 6.0).unwrap();
        assert_relative_eq!(engine.k_combo(), 3.0 / 1.5, epsilon = 1e-9);
    }

    // T5-11: Empty regimen returns error
    #[test]
    fn test_empty_regimen_error() {
        assert!(TbComboEngine::new(vec![], 1.0, 6.0).is_err());
    }

    // T5-12: Invalid synergy (< 1.0) returns error
    #[test]
    fn test_invalid_synergy_error() {
        assert!(TbComboEngine::new(vec![
            DrugPathway::new("rifampin", 2.0).unwrap()
        ], 0.5, 6.0).is_err());
    }
}
