//! Layer T1 — TB Patient Manifold
//!
//! TB patients vary enormously in PK: HIV co-infection, diabetes, malnutrition,
//! NAT2 acetylator status (fast vs slow), CYP induction by rifampin.
//!
//! Key pharmacokinetic adjustments computed here:
//!   - NAT2-adjusted isoniazid clearance
//!   - Rifampin auto-induction (v0.1: steady-state only; v0.2: time-indexed)
//!   - HIV-ART interaction flag (rifampin + PI contraindication)
//!   - Diabetes Vd adjustment
//!   - Malnutrition protein binding adjustment
//!   - eGFR-based ethambutol dose reduction flag
//!
//! Sources:
//!   Kinzig-Schippers et al. AAC 2005 (NAT2)
//!   WHO consolidated guidelines 2022

use thiserror::Error;

/// NAT2 acetylator phenotype for isoniazid metabolism
#[derive(Debug, Clone, PartialEq)]
pub enum Nat2Status {
    /// CL_INH ~2-3× higher than slow; standard dose often sub-therapeutic
    Fast,
    /// Reference population
    Intermediate,
    /// CL_INH ~50% of fast; standard dose →  elevated exposure, hepatotoxicity risk
    Slow,
}

/// HIV antiretroviral regimen class — determines rifampin interaction severity
#[derive(Debug, Clone, PartialEq)]
pub enum ArtRegimen {
    None,
    /// Rifampin induces CYP3A4 → reduces PI levels ~75%. Contraindicated.
    ProteinaseInhibitor,
    /// NNRTI (efavirenz preferred with rifampin)
    Nnrti,
    /// Integrase inhibitor — dolutegravir dose adjustment needed
    InSti,
}

/// Disease stage driving bacterial subpopulation weights
#[derive(Debug, Clone, PartialEq)]
pub enum DiseaseStage {
    /// < 2 weeks symptoms: w_rep=0.6, w_acid=0.3, w_dorm=0.1
    EarlyActive,
    /// 2 weeks – 3 months: partially treated or subacute
    Subacute,
    /// > 3 months or retreatment: w_rep=0.2, w_acid=0.4, w_dorm=0.4
    ChronicLate,
}

impl DiseaseStage {
    /// Subpopulation weights: (replicating, acidic/semi-dormant, dormant/NRP)
    pub fn subpopulation_weights(&self, cavitary: bool) -> (f64, f64, f64) {
        if cavitary {
            // Cavitary: high replicating + dormant mix
            (0.5, 0.2, 0.3)
        } else {
            match self {
                Self::EarlyActive  => (0.6, 0.3, 0.1),
                Self::Subacute     => (0.4, 0.35, 0.25),
                Self::ChronicLate  => (0.2, 0.4, 0.4),
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct TbPatient {
    pub age_years: f64,
    pub weight_kg: f64,
    pub height_cm: f64,
    pub hiv_positive: bool,
    pub art_regimen: ArtRegimen,
    pub diabetes: bool,
    pub hba1c: Option<f64>,
    pub nat2: Nat2Status,
    pub albumin_gdl: f64,
    pub egfr_ml_min: f64,
    pub alt_ul: f64,
    pub ast_ul: f64,
    pub sputum_positive: bool,
    pub cavitary_disease: bool,
    pub stage: DiseaseStage,
    pub prior_tb_treatment: bool,
}

#[derive(Debug, Error)]
pub enum TbPatientError {
    #[error("Weight must be positive, got {0}")]
    InvalidWeight(f64),
    #[error("Age must be positive, got {0}")]
    InvalidAge(f64),
    #[error("Albumin must be in (0, 6] g/dL, got {0}")]
    InvalidAlbumin(f64),
    #[error("eGFR must be non-negative, got {0}")]
    InvalidEgfr(f64),
    #[error("Rifampin + protease inhibitor is contraindicated: rifampin reduces PI levels by ~75% via CYP3A4 induction. Switch to rifabutin or change ART.")]
    RifampinProteinaseInhibitorContraindicated,
}

/// Result of patient PK computation
#[derive(Debug, Clone)]
pub struct TbPatientPk {
    /// INH clearance multiplier relative to reference (intermediate NAT2)
    pub inh_cl_multiplier: f64,
    /// RIF clearance multiplier (v0.1: steady-state auto-induction = 1.40)
    /// NOTE v0.1 simplification: time-varying K_admet_RIF is a v0.2 target
    pub rif_cl_multiplier: f64,
    /// Volume of distribution multiplier from diabetes
    pub diabetes_vd_multiplier: f64,
    /// Free fraction multiplier from malnutrition (low albumin)
    pub free_fraction_multiplier: f64,
    /// True if ethambutol dose reduction is indicated (eGFR < 30)
    pub ethambutol_dose_reduce: bool,
    /// CYP2E1 + INH hepatotoxicity risk flag
    pub hepatotoxicity_risk: bool,
    /// True if rifampin + PI conflict detected
    pub art_rifampin_conflict: bool,
}

impl TbPatient {
    pub fn new(
        age_years: f64,
        weight_kg: f64,
        height_cm: f64,
        hiv_positive: bool,
        art_regimen: ArtRegimen,
        diabetes: bool,
        hba1c: Option<f64>,
        nat2: Nat2Status,
        albumin_gdl: f64,
        egfr_ml_min: f64,
        alt_ul: f64,
        ast_ul: f64,
        sputum_positive: bool,
        cavitary_disease: bool,
        stage: DiseaseStage,
        prior_tb_treatment: bool,
    ) -> Result<Self, TbPatientError> {
        if weight_kg <= 0.0 { return Err(TbPatientError::InvalidWeight(weight_kg)); }
        if age_years <= 0.0 { return Err(TbPatientError::InvalidAge(age_years)); }
        if albumin_gdl <= 0.0 || albumin_gdl > 6.0 {
            return Err(TbPatientError::InvalidAlbumin(albumin_gdl));
        }
        if egfr_ml_min < 0.0 { return Err(TbPatientError::InvalidEgfr(egfr_ml_min)); }
        Ok(Self {
            age_years, weight_kg, height_cm,
            hiv_positive, art_regimen, diabetes, hba1c,
            nat2, albumin_gdl, egfr_ml_min, alt_ul, ast_ul,
            sputum_positive, cavitary_disease, stage, prior_tb_treatment,
        })
    }

    /// Compute patient-specific PK multipliers.
    ///
    /// Does NOT produce a hard error for art_rifampin_conflict (callers decide
    /// whether to bail); flags it clearly so the UI can warn.
    pub fn compute_pk(&self) -> TbPatientPk {
        // NAT2 isoniazid clearance (Kinzig-Schippers AAC 2005)
        let inh_cl_multiplier = match self.nat2 {
            Nat2Status::Fast         => 2.0,   // fast: ~2× reference CL
            Nat2Status::Intermediate => 1.0,
            Nat2Status::Slow         => 0.50,  // slow: ~50% reference CL
        };

        // Rifampin auto-induction — v0.1 steady-state (40% CL increase after ~14d)
        // v0.2 will time-index this; at day 0 multiplier starts at 1.0
        let rif_cl_multiplier = 1.40;

        // Diabetes Vd expansion: hyperglycemia → 15-20% Vd increase (midpoint 17.5%)
        let diabetes_vd_multiplier = if self.diabetes { 1.175 } else { 1.0 };

        // Malnutrition: low albumin → more free drug → faster effective CL
        // Albumin reference 4.0 g/dL; below this increases free fraction
        let free_fraction_multiplier = if self.albumin_gdl < 4.0 {
            1.0 + 0.10 * (4.0 - self.albumin_gdl) // 10% per g/dL drop
        } else {
            1.0
        };

        // Ethambutol: dose reduction when eGFR < 30 mL/min
        let ethambutol_dose_reduce = self.egfr_ml_min < 30.0;

        // CYP2E1 + INH → hepatotoxicity risk (both INH and elevated AST/ALT)
        let hepatotoxicity_risk = self.alt_ul > 40.0 || self.ast_ul > 40.0;

        // HIV-ART conflict
        let art_rifampin_conflict = self.art_regimen == ArtRegimen::ProteinaseInhibitor;

        TbPatientPk {
            inh_cl_multiplier,
            rif_cl_multiplier,
            diabetes_vd_multiplier,
            free_fraction_multiplier,
            ethambutol_dose_reduce,
            hepatotoxicity_risk,
            art_rifampin_conflict,
        }
    }

    /// Validate that rifampin can be safely combined with current ART.
    pub fn check_rifampin_art_safety(&self) -> Result<(), TbPatientError> {
        if self.art_regimen == ArtRegimen::ProteinaseInhibitor {
            return Err(TbPatientError::RifampinProteinaseInhibitorContraindicated);
        }
        Ok(())
    }

    pub fn subpopulation_weights(&self) -> (f64, f64, f64) {
        self.stage.subpopulation_weights(self.cavitary_disease)
    }
}

// ---------------------------------------------------------------------------
// TDD — 10 tests matching the spec Layer T1
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn default_patient(nat2: Nat2Status, egfr: f64, albumin: f64, art: ArtRegimen,
                       diabetes: bool, cavitary: bool, stage: DiseaseStage) -> TbPatient {
        TbPatient::new(35.0, 55.0, 165.0, false, art, diabetes, None,
                       nat2, albumin, egfr, 25.0, 22.0, true, cavitary, stage, false).unwrap()
    }

    // T1-1: NAT2 slow acetylator reduces INH clearance multiplier to 0.50
    #[test]
    fn test_nat2_slow_inh_clearance() {
        let p = default_patient(Nat2Status::Slow, 90.0, 4.0,
                                ArtRegimen::None, false, false, DiseaseStage::EarlyActive);
        assert_relative_eq!(p.compute_pk().inh_cl_multiplier, 0.50, epsilon = 1e-9);
    }

    // T1-2: NAT2 fast acetylator gives 2× clearance
    #[test]
    fn test_nat2_fast_inh_clearance() {
        let p = default_patient(Nat2Status::Fast, 90.0, 4.0,
                                ArtRegimen::None, false, false, DiseaseStage::EarlyActive);
        assert_relative_eq!(p.compute_pk().inh_cl_multiplier, 2.0, epsilon = 1e-9);
    }

    // T1-3: Rifampin steady-state auto-induction gives 1.40 CL multiplier
    #[test]
    fn test_rifampin_auto_induction() {
        let p = default_patient(Nat2Status::Intermediate, 90.0, 4.0,
                                ArtRegimen::None, false, false, DiseaseStage::EarlyActive);
        assert_relative_eq!(p.compute_pk().rif_cl_multiplier, 1.40, epsilon = 1e-9);
    }

    // T1-4: HIV + protease inhibitor flags rifampin conflict
    #[test]
    fn test_hiv_pi_rifampin_conflict_flagged() {
        let p = TbPatient::new(35.0, 55.0, 165.0, true, ArtRegimen::ProteinaseInhibitor,
                               false, None, Nat2Status::Intermediate, 4.0, 90.0,
                               25.0, 22.0, true, false, DiseaseStage::EarlyActive, false).unwrap();
        assert!(p.compute_pk().art_rifampin_conflict);
        assert!(p.check_rifampin_art_safety().is_err());
    }

    // T1-5: Diabetes increases Vd multiplier ~17.5%
    #[test]
    fn test_diabetes_vd_multiplier() {
        let p = default_patient(Nat2Status::Intermediate, 90.0, 4.0,
                                ArtRegimen::None, true, false, DiseaseStage::EarlyActive);
        assert_relative_eq!(p.compute_pk().diabetes_vd_multiplier, 1.175, epsilon = 1e-9);
        let p_no = default_patient(Nat2Status::Intermediate, 90.0, 4.0,
                                   ArtRegimen::None, false, false, DiseaseStage::EarlyActive);
        assert_relative_eq!(p_no.compute_pk().diabetes_vd_multiplier, 1.0, epsilon = 1e-9);
    }

    // T1-6: Low albumin (2.5 g/dL) increases free fraction multiplier
    #[test]
    fn test_low_albumin_free_fraction() {
        let p = default_patient(Nat2Status::Intermediate, 90.0, 2.5,
                                ArtRegimen::None, false, false, DiseaseStage::EarlyActive);
        let pk = p.compute_pk();
        // 10% per g/dL below 4.0 → (4.0 - 2.5) * 0.10 = 0.15 → 1.15
        assert_relative_eq!(pk.free_fraction_multiplier, 1.15, epsilon = 1e-9);
    }

    // T1-7: eGFR < 30 triggers ethambutol dose reduction flag
    #[test]
    fn test_egfr_ethambutol_flag() {
        let low_egfr = default_patient(Nat2Status::Intermediate, 25.0, 4.0,
                                       ArtRegimen::None, false, false, DiseaseStage::EarlyActive);
        assert!(low_egfr.compute_pk().ethambutol_dose_reduce);
        let high_egfr = default_patient(Nat2Status::Intermediate, 90.0, 4.0,
                                        ArtRegimen::None, false, false, DiseaseStage::EarlyActive);
        assert!(!high_egfr.compute_pk().ethambutol_dose_reduce);
    }

    // T1-8: Cavitary disease flags high bacillary burden subpopulation weights
    #[test]
    fn test_cavitary_subpopulation_weights() {
        let p = default_patient(Nat2Status::Intermediate, 90.0, 4.0,
                                ArtRegimen::None, false, true, DiseaseStage::EarlyActive);
        let (w_rep, w_acid, w_dorm) = p.subpopulation_weights();
        // Cavitary: (0.5, 0.2, 0.3)
        assert_relative_eq!(w_rep,  0.5, epsilon = 1e-9);
        assert_relative_eq!(w_acid, 0.2, epsilon = 1e-9);
        assert_relative_eq!(w_dorm, 0.3, epsilon = 1e-9);
        assert_relative_eq!(w_rep + w_acid + w_dorm, 1.0, epsilon = 1e-9);
    }

    // T1-9: Chronic disease gives high dormant weight
    #[test]
    fn test_chronic_subpopulation_weights() {
        let p = default_patient(Nat2Status::Intermediate, 90.0, 4.0,
                                ArtRegimen::None, false, false, DiseaseStage::ChronicLate);
        let (w_rep, w_acid, w_dorm) = p.subpopulation_weights();
        assert_relative_eq!(w_rep,  0.2, epsilon = 1e-9);
        assert_relative_eq!(w_acid, 0.4, epsilon = 1e-9);
        assert_relative_eq!(w_dorm, 0.4, epsilon = 1e-9);
    }

    // T1-10: Invalid patient construction returns appropriate errors
    #[test]
    fn test_invalid_patient_construction() {
        assert!(TbPatient::new(0.0, 55.0, 165.0, false, ArtRegimen::None,
                               false, None, Nat2Status::Intermediate,
                               4.0, 90.0, 25.0, 22.0, true, false,
                               DiseaseStage::EarlyActive, false).is_err()); // age = 0
        assert!(TbPatient::new(35.0, 0.0, 165.0, false, ArtRegimen::None,
                               false, None, Nat2Status::Intermediate,
                               4.0, 90.0, 25.0, 22.0, true, false,
                               DiseaseStage::EarlyActive, false).is_err()); // weight = 0
        assert!(TbPatient::new(35.0, 55.0, 165.0, false, ArtRegimen::None,
                               false, None, Nat2Status::Intermediate,
                               -1.0, 90.0, 25.0, 22.0, true, false,
                               DiseaseStage::EarlyActive, false).is_err()); // albumin < 0
    }
}
