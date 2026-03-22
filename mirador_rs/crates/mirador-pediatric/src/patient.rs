//! Layer K1 — Pediatric Patient Manifold
//!
//! Children are not small adults. This module provides pediatric-specific
//! pharmacokinetic models using:
//!   - Schwartz GFR (2009 CKiD update, k = 0.413 for enzymatic assay)
//!   - Allometric scaling: CL ∝ (weight/70)^0.75, Vd ∝ (weight/70)^1.0
//!   - Mosteller BSA: sqrt(height_cm × weight_kg / 3600)
//!   - Inflammation-adjusted Vd (CRP > 100 expands by 20-40%)
//!   - Age-adjusted protein binding (neonates: albumin <3.0 lowers PPB)

use thiserror::Error;

/// Infection site classification for AHO
#[derive(Debug, Clone, PartialEq)]
pub enum InfectionSite {
    LongBone,
    Pelvis,
    Spine,
    Multifocal,
}

/// MRSA strain / pulsotype
#[derive(Debug, Clone, PartialEq)]
pub enum MrsaStrain {
    Usa300,
    Usa100,
    Other,
    Unknown,
}

/// PVL (Panton-Valentine Leukocidin) toxin status
#[derive(Debug, Clone, PartialEq)]
pub enum PvlStatus {
    Positive,
    Negative,
    Unknown,
}

/// A record of one antibiotic course in the patient's history
#[derive(Debug, Clone)]
pub struct AntibioticCourse {
    pub drug_name: String,
    pub duration_days: u32,
}

/// Complete pediatric patient state for the Keske Method
#[derive(Debug, Clone)]
pub struct PediatricPatient {
    // Demographics
    pub age_months: f64,
    pub weight_kg: f64,
    pub height_cm: f64,

    // Labs
    pub serum_creatinine: f64, // mg/dL
    pub alt_ul: f64,
    pub albumin_gdl: f64,
    pub crp_mgl: f64,   // C-reactive protein mg/L
    pub esr_mmhr: f64,  // erythrocyte sedimentation rate

    // Infection details
    pub infection_site: InfectionSite,
    pub mrsa_strain: MrsaStrain,
    pub pvl_status: PvlStatus,
    pub prior_antibiotics: Vec<AntibioticCourse>,
    pub surgical_debridements: u32,
    pub biofilm_suspected: bool,
    pub infection_duration_days: f64,
}

/// Computed pediatric pharmacokinetic parameters
#[derive(Debug, Clone)]
pub struct PediatricPk {
    pub bsa_m2: f64,
    pub egfr_schwartz: f64,
    pub cl_factor: f64,        // (weight/70)^0.75 — apply to adult CL
    pub vd_factor: f64,        // (weight/70)^1.0  — apply to adult Vd
    pub vd_inflam_mult: f64,   // 1.0–1.4, inflamed Vd expansion
    pub protein_bind_adj: f64, // 0.0–1.0 reduction in PPB fraction
    pub is_neonate: bool,
    pub pvl_severity_flag: bool,
    pub multifocal_combo_flag: bool,
    pub dose_reduce_flag: bool,
    pub resistance_prior_flag: bool,
}

#[derive(Debug, Error)]
pub enum PediatricError {
    #[error("Weight must be positive, got {0}")]
    InvalidWeight(f64),
    #[error("Height must be positive, got {0}")]
    InvalidHeight(f64),
    #[error("Creatinine must be positive, got {0}")]
    InvalidCreatinine(f64),
    #[error("Age must be non-negative, got {0} months")]
    InvalidAge(f64),
}

impl PediatricPatient {
    /// Validates the patient and computes all derived PK parameters.
    pub fn compute_pk(&self) -> Result<PediatricPk, PediatricError> {
        if self.weight_kg <= 0.0 {
            return Err(PediatricError::InvalidWeight(self.weight_kg));
        }
        if self.height_cm <= 0.0 {
            return Err(PediatricError::InvalidHeight(self.height_cm));
        }
        if self.serum_creatinine <= 0.0 {
            return Err(PediatricError::InvalidCreatinine(self.serum_creatinine));
        }
        if self.age_months < 0.0 {
            return Err(PediatricError::InvalidAge(self.age_months));
        }

        // Mosteller BSA: sqrt(height_cm * weight_kg / 3600)
        let bsa_m2 = (self.height_cm * self.weight_kg / 3600.0).sqrt();

        // Schwartz GFR (2009 CKiD, enzymatic assay, k = 0.413)
        // eGFR = 0.413 * height_cm / serum_creatinine   [mL/min/1.73m²]
        let egfr_schwartz = 0.413 * self.height_cm / self.serum_creatinine;

        // Allometric scaling (Anderson & Holford 2008)
        let w_ratio = self.weight_kg / 70.0;
        let cl_factor = w_ratio.powf(0.75);
        let vd_factor = w_ratio.powf(1.0);

        // Inflammation-adjusted Vd: CRP > 100 expands Vd by 20–40%
        // Linear ramp: at CRP=100 → +0%, at CRP=200 → +20%, at CRP=300 → +40%
        // Capped at +40% (factor 1.4)
        let vd_inflam_mult = if self.crp_mgl > 100.0 {
            let expansion = 0.002 * (self.crp_mgl - 100.0);
            (1.0 + expansion).min(1.4)
        } else {
            1.0
        };

        // Age-adjusted protein binding: albumin < 3.0 g/dL reduces PPB
        // Represents neonatal/inflammatory hypoalbuminemia
        // adj = 0 (no change) at albumin ≥ 3.0; increases linearly below 3.0
        let protein_bind_adj = if self.albumin_gdl < 3.0 {
            (3.0 - self.albumin_gdl) / 3.0
        } else {
            0.0
        };

        let is_neonate = self.age_months < 1.0;
        let pvl_severity_flag = matches!(self.pvl_status, PvlStatus::Positive);
        let multifocal_combo_flag = matches!(self.infection_site, InfectionSite::Multifocal);
        let dose_reduce_flag = egfr_schwartz < 30.0;

        // Prior antibiotic exposure of ≥ 2 agents signals elevated resistance probability
        let resistance_prior_flag = self.prior_antibiotics.len() >= 2;

        Ok(PediatricPk {
            bsa_m2,
            egfr_schwartz,
            cl_factor,
            vd_factor,
            vd_inflam_mult,
            protein_bind_adj,
            is_neonate,
            pvl_severity_flag,
            multifocal_combo_flag,
            dose_reduce_flag,
            resistance_prior_flag,
        })
    }
}

// ---------------------------------------------------------------------------
// TDD — 10 tests matching the spec
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    fn base_patient() -> PediatricPatient {
        PediatricPatient {
            age_months: 96.0, // 8 years
            weight_kg: 25.0,
            height_cm: 120.0,
            serum_creatinine: 0.5,
            alt_ul: 30.0,
            albumin_gdl: 4.0,
            crp_mgl: 50.0,
            esr_mmhr: 40.0,
            infection_site: InfectionSite::LongBone,
            mrsa_strain: MrsaStrain::Unknown,
            pvl_status: PvlStatus::Unknown,
            prior_antibiotics: vec![],
            surgical_debridements: 0,
            biofilm_suspected: false,
            infection_duration_days: 7.0,
        }
    }

    // Test 1: Schwartz GFR correct for three age groups
    #[test]
    fn test_schwartz_gfr_three_age_groups() {
        // 8-year-old, 120 cm, Cr 0.5 → eGFR = 0.413 * 120 / 0.5 = 99.12
        let p1 = base_patient();
        let pk1 = p1.compute_pk().unwrap();
        assert_relative_eq!(pk1.egfr_schwartz, 0.413 * 120.0 / 0.5, epsilon = 0.001);

        // 2-year-old, 85 cm, 12 kg, Cr 0.3 → eGFR = 0.413 * 85 / 0.3 = 116.98
        let p2 = PediatricPatient {
            age_months: 24.0,
            weight_kg: 12.0,
            height_cm: 85.0,
            serum_creatinine: 0.3,
            ..base_patient()
        };
        let pk2 = p2.compute_pk().unwrap();
        assert_relative_eq!(pk2.egfr_schwartz, 0.413 * 85.0 / 0.3, epsilon = 0.001);

        // 15-year-old, 160 cm, 50 kg, Cr 0.8 → eGFR = 0.413 * 160 / 0.8 = 82.6
        let p3 = PediatricPatient {
            age_months: 180.0,
            weight_kg: 50.0,
            height_cm: 160.0,
            serum_creatinine: 0.8,
            ..base_patient()
        };
        let pk3 = p3.compute_pk().unwrap();
        assert_relative_eq!(pk3.egfr_schwartz, 0.413 * 160.0 / 0.8, epsilon = 0.001);
    }

    // Test 2: Allometric CL scaling for 10 kg, 25 kg, 50 kg
    #[test]
    fn test_allometric_cl_scaling() {
        for (weight, expected_cl_factor) in [(10.0f64, (10.0/70.0f64).powf(0.75)),
                                             (25.0f64, (25.0/70.0f64).powf(0.75)),
                                             (50.0f64, (50.0/70.0f64).powf(0.75))] {
            let p = PediatricPatient { weight_kg: weight, ..base_patient() };
            let pk = p.compute_pk().unwrap();
            assert_relative_eq!(pk.cl_factor, expected_cl_factor, epsilon = 1e-6);
        }
    }

    // Test 3: Vd inflammation adjustment activates at CRP > 100
    #[test]
    fn test_vd_inflammation_adjustment() {
        let below = PediatricPatient { crp_mgl: 80.0, ..base_patient() };
        let pk_below = below.compute_pk().unwrap();
        assert_relative_eq!(pk_below.vd_inflam_mult, 1.0, epsilon = 1e-6);

        let above = PediatricPatient { crp_mgl: 200.0, ..base_patient() };
        let pk_above = above.compute_pk().unwrap();
        // 0.002 * (200-100) = 0.2 → factor = 1.2
        assert_relative_eq!(pk_above.vd_inflam_mult, 1.2, epsilon = 1e-6);

        // Capped at 1.4 even at CRP = 500
        let extreme = PediatricPatient { crp_mgl: 500.0, ..base_patient() };
        let pk_extreme = extreme.compute_pk().unwrap();
        assert_relative_eq!(pk_extreme.vd_inflam_mult, 1.4, epsilon = 1e-6);
    }

    // Test 4: BSA computed correctly from height and weight (Mosteller)
    #[test]
    fn test_bsa_mosteller() {
        // sqrt(120 * 25 / 3600) = sqrt(0.8333) ≈ 0.9129
        let p = base_patient();
        let pk = p.compute_pk().unwrap();
        let expected = (120.0_f64 * 25.0 / 3600.0).sqrt();
        assert_relative_eq!(pk.bsa_m2, expected, epsilon = 1e-6);
    }

    // Test 5: Age < 1 month triggers neonatal flag
    #[test]
    fn test_neonatal_flag() {
        let neonate = PediatricPatient {
            age_months: 0.5,
            weight_kg: 3.5,
            height_cm: 50.0,
            serum_creatinine: 0.4,
            ..base_patient()
        };
        let pk = neonate.compute_pk().unwrap();
        assert!(pk.is_neonate, "age < 1 month must set is_neonate");

        let infant = PediatricPatient { age_months: 3.0, ..base_patient() };
        let pk2 = infant.compute_pk().unwrap();
        assert!(!pk2.is_neonate, "age ≥ 1 month must not set is_neonate");
    }

    // Test 6: PVL-positive triggers severity escalation flag
    #[test]
    fn test_pvl_severity_flag() {
        let pvl_pos = PediatricPatient {
            pvl_status: PvlStatus::Positive,
            ..base_patient()
        };
        assert!(pvl_pos.compute_pk().unwrap().pvl_severity_flag);

        let pvl_neg = PediatricPatient {
            pvl_status: PvlStatus::Negative,
            ..base_patient()
        };
        assert!(!pvl_neg.compute_pk().unwrap().pvl_severity_flag);
    }

    // Test 7: Multifocal infection triggers combination therapy flag
    #[test]
    fn test_multifocal_combo_flag() {
        let multi = PediatricPatient {
            infection_site: InfectionSite::Multifocal,
            ..base_patient()
        };
        assert!(multi.compute_pk().unwrap().multifocal_combo_flag);

        let single = PediatricPatient {
            infection_site: InfectionSite::LongBone,
            ..base_patient()
        };
        assert!(!single.compute_pk().unwrap().multifocal_combo_flag);
    }

    // Test 8: Prior antibiotic history feeds into resistance probability flag
    #[test]
    fn test_prior_antibiotic_resistance_flag() {
        let naive = base_patient();
        assert!(!naive.compute_pk().unwrap().resistance_prior_flag);

        let one_abx = PediatricPatient {
            prior_antibiotics: vec![
                AntibioticCourse { drug_name: "vancomycin".into(), duration_days: 14 },
            ],
            ..base_patient()
        };
        assert!(!one_abx.compute_pk().unwrap().resistance_prior_flag);

        let two_abx = PediatricPatient {
            prior_antibiotics: vec![
                AntibioticCourse { drug_name: "vancomycin".into(), duration_days: 14 },
                AntibioticCourse { drug_name: "clindamycin".into(), duration_days: 21 },
            ],
            ..base_patient()
        };
        assert!(two_abx.compute_pk().unwrap().resistance_prior_flag);
    }

    // Test 9: eGFR < 30 triggers dose reduction flag
    #[test]
    fn test_dose_reduce_flag_at_low_egfr() {
        // eGFR = 0.413 * 80 / 1.6 = 20.65 → dose_reduce
        let ckd = PediatricPatient {
            height_cm: 80.0,
            serum_creatinine: 1.6,
            weight_kg: 12.0,
            ..base_patient()
        };
        let pk = ckd.compute_pk().unwrap();
        assert!(pk.egfr_schwartz < 30.0);
        assert!(pk.dose_reduce_flag);

        // eGFR = 0.413 * 120 / 0.5 = 99.12 → no flag
        let normal = base_patient();
        let pk2 = normal.compute_pk().unwrap();
        assert!(!pk2.dose_reduce_flag);
    }

    // Test 10: Protein binding adjustment for albumin < 3.0
    #[test]
    fn test_protein_binding_adjustment_low_albumin() {
        // albumin = 2.0 → adj = (3.0 - 2.0) / 3.0 ≈ 0.333
        let hypoalb = PediatricPatient { albumin_gdl: 2.0, ..base_patient() };
        let pk = hypoalb.compute_pk().unwrap();
        assert_relative_eq!(pk.protein_bind_adj, (3.0 - 2.0) / 3.0, epsilon = 1e-6);
        assert!(pk.protein_bind_adj > 0.0);

        // albumin = 4.0 → no adjustment
        let normal_alb = base_patient();
        let pk2 = normal_alb.compute_pk().unwrap();
        assert_relative_eq!(pk2.protein_bind_adj, 0.0, epsilon = 1e-6);
    }
}
