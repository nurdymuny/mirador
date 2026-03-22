//! Layer K4 — Reservoir Geometry (Multi-Reservoir Persistence Model)
//!
//! Three anatomically distinct MRSA reservoirs in osteomyelitis, each with
//! different drug accessibility:
//!
//!   Reservoir 1 — Soft Tissue Abscess Communities (SAC)
//!     Location: periosteal/subperiosteal abscesses around bone
//!     Intervention: surgical drainage
//!
//!   Reservoir 2 — Bone Matrix Biofilm
//!     Location: cortical and cancellous bone surfaces
//!     Intervention: surgical debridement
//!     K_res_mat is DRUG-DEPENDENT (multiplies that drug's K_pen)
//!
//!   Reservoir 3 — Intracellular (osteocyte-lacuno-canalicular network)
//!     Location: inside bone cells
//!     Intervention: no surgical fix. Rifampin reduces K_res_intra × 0.4.
//!     Anti-Atl mAbs (experimental) flagged when intracellular_fraction > 0.3
//!
//! K_reservoir = K_res_SAC + K_res_mat + K_res_intra
//! K_res_SAC   = (1 - P_drainage) * 0.5
//! K_res_mat   = (1 - P_debride)  * K_penetration
//! K_res_intra = 0.8 * intracellular_fraction * rifampin_modifier
//!   where rifampin_modifier = 0.4 if rifampin is in the combination, else 1.0

use mirador_bone::BonePenetrationResult;

/// Patient surgical history that feeds into reservoir curvature computation
#[derive(Debug, Clone)]
pub struct ReservoirPatient {
    /// Probability (0–1) that drainage has cleared the SAC reservoir.
    /// 0.0 = no drainage done. 0.8 = successful drainage (20% residual).
    /// After confirmed surgical drainage, set to 0.8.
    pub p_drainage: f64,

    /// Probability (0–1) that debridement cleared matrix biofilm.
    /// 0.0 = no debridement. ~0.5-0.7 after repeated debridements.
    pub p_debride: f64,

    /// Estimated intracellular bacterial fraction (dimensionless, 0–1).
    /// Acute AHO: 0.10. Chronic (> 3 months): 0.60.
    pub intracellular_fraction: f64,

    /// CRP at current assessment (mg/L) — used for inflammation context
    pub crp_mgl: f64,
}

/// Computed reservoir curvature for a specific drug
#[derive(Debug, Clone)]
pub struct ReservoirCurvature {
    pub k_res_sac: f64,
    pub k_res_mat: f64,
    pub k_res_intra: f64,
    pub k_reservoir_total: f64,
    pub anti_atl_flag: bool,
}

/// Rifampin intracellular modifier: reduces K_res_intra by 60%
/// (Zimmerli NEJM 2004 — rifampin crosses osteoblast membrane)
pub const RIFAMPIN_INTRA_MODIFIER: f64 = 0.4;

impl ReservoirPatient {
    /// Compute reservoir curvature for one drug.
    ///
    /// `bone_pen`: bone penetration result for this specific drug.
    /// `rifampin_in_combo`: true if rifampin is in the combination for this patient.
    pub fn compute(&self, bone_pen: &BonePenetrationResult, rifampin_in_combo: bool)
        -> ReservoirCurvature
    {
        // Reservoir 1: soft tissue abscess (drug-independent, set by surgery)
        let k_res_sac = (1.0 - self.p_drainage) * 0.5;

        // Reservoir 2: bone matrix biofilm (drug-dependent — K_pen must be crossed first)
        let k_res_mat = (1.0 - self.p_debride) * bone_pen.k_penetration;

        // Reservoir 3: intracellular SCVs
        let rif_modifier = if rifampin_in_combo { RIFAMPIN_INTRA_MODIFIER } else { 1.0 };
        let k_res_intra = 0.8 * self.intracellular_fraction * rif_modifier;

        let k_reservoir_total = k_res_sac + k_res_mat + k_res_intra;

        // Flag for experimental anti-Atl mAb therapy when intracellular reservoir is heavy
        let anti_atl_flag = self.intracellular_fraction > 0.3;

        ReservoirCurvature { k_res_sac, k_res_mat, k_res_intra, k_reservoir_total, anti_atl_flag }
    }
}

/// Surgical indicator score. Guides when to operate.
///   S < 5:   antibiotics alone may suffice
///   S 5–10:  surgical drainage recommended
///   S > 10:  urgent debridement + drainage
pub fn surgical_score(k_res_sac: f64, k_res_mat: f64, abscess_volume_ml: f64) -> f64 {
    let sac_term  = k_res_sac * 10.0;
    let mat_term  = if k_res_mat > 0.5 { 5.0 } else { 0.0 };
    let absc_term = if abscess_volume_ml > 20.0 { 5.0 } else { 0.0 };
    sac_term + mat_term + absc_term
}

// ---------------------------------------------------------------------------
// TDD — 9 tests matching the updated spec
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;
    use mirador_bone::BonePenetrationResult;

    fn pen_result(k_pen: f64, r: f64) -> BonePenetrationResult {
        BonePenetrationResult { r_bone_eff: r, k_penetration: k_pen, mic_bone_factor: 1.0 / r }
    }

    fn acute_patient() -> ReservoirPatient {
        ReservoirPatient {
            p_drainage: 0.0,
            p_debride: 0.0,
            intracellular_fraction: 0.10,
            crp_mgl: 200.0,
        }
    }

    fn steven_keske() -> ReservoirPatient {
        ReservoirPatient {
            p_drainage: 0.8,  // 4 surgeries
            p_debride: 0.7,   // repeated debridements
            intracellular_fraction: 0.60, // 6 years chronic
            crp_mgl: 250.0,
        }
    }

    // Test 1: K_reservoir correct for acute presentation
    #[test]
    fn test_k_reservoir_acute() {
        let p = acute_patient();
        // K_pen_vanc ≈ 4.0 (R=0.20), no rifampin
        let res = p.compute(&pen_result(4.0, 0.20), false);
        // K_res_SAC = (1-0.0)*0.5 = 0.5
        // K_res_mat = (1-0.0)*4.0 = 4.0
        // K_res_intra = 0.8*0.10*1.0 = 0.08
        assert_relative_eq!(res.k_res_sac,   0.5,  epsilon = 1e-9);
        assert_relative_eq!(res.k_res_mat,   4.0,  epsilon = 1e-9);
        assert_relative_eq!(res.k_res_intra, 0.08, epsilon = 1e-9);
        assert_relative_eq!(res.k_reservoir_total, 4.58, epsilon = 1e-9);
    }

    // Test 2: K_reservoir computed for Steven Keske scenario (no rifampin)
    #[test]
    fn test_k_reservoir_steven_no_rifampin() {
        let p = steven_keske();
        // K_pen_vanc = (1/0.20)-1 = 4.0, no rifampin
        let res = p.compute(&pen_result(4.0, 0.20), false);
        // K_res_SAC   = (1-0.8)*0.5 = 0.10
        // K_res_mat   = (1-0.7)*4.0 = 1.20
        // K_res_intra = 0.8*0.60*1.0 = 0.48
        assert_relative_eq!(res.k_res_sac,   0.10, epsilon = 1e-9);
        assert_relative_eq!(res.k_res_mat,   1.20, epsilon = 1e-9);
        assert_relative_eq!(res.k_res_intra, 0.48, epsilon = 1e-9);
        assert_relative_eq!(res.k_reservoir_total, 1.78, epsilon = 1e-9);
    }

    // Test 3: SAC drainage reduces K_res_SAC by 80%
    // undrained: p_drainage=0 → K_res_SAC = 0.5
    // drained:   p_drainage=0.8 → K_res_SAC = 0.1  (80% reduction)
    #[test]
    fn test_sac_drainage_reduces_k_res_sac() {
        let undrained = ReservoirPatient { p_drainage: 0.0, ..acute_patient() };
        let drained   = ReservoirPatient { p_drainage: 0.8, ..acute_patient() };
        let pen = pen_result(1.5, 0.40);
        let k_un = undrained.compute(&pen, false).k_res_sac;
        let k_dr = drained.compute(&pen, false).k_res_sac;
        let reduction = (k_un - k_dr) / k_un;
        assert_relative_eq!(reduction, 0.80, epsilon = 1e-9);
    }

    // Test 4: Debridement reduces K_res_mat by 50–70%
    #[test]
    fn test_debridement_reduces_k_res_mat() {
        let not_debrided = ReservoirPatient { p_debride: 0.0, ..acute_patient() };
        let debrided_50  = ReservoirPatient { p_debride: 0.5, ..acute_patient() };
        let debrided_70  = ReservoirPatient { p_debride: 0.7, ..acute_patient() };
        let pen = pen_result(2.0, 0.33);
        let k0  = not_debrided.compute(&pen, false).k_res_mat;
        let k50 = debrided_50.compute(&pen,  false).k_res_mat;
        let k70 = debrided_70.compute(&pen,  false).k_res_mat;
        let red50 = (k0 - k50) / k0;
        let red70 = (k0 - k70) / k0;
        assert_relative_eq!(red50, 0.50, epsilon = 1e-9);
        assert_relative_eq!(red70, 0.70, epsilon = 1e-9);
    }

    // Test 5: Intracellular fraction increases with chronicity
    #[test]
    fn test_intracellular_fraction_increases_with_chronicity() {
        let acute_frac   = 0.10_f64;
        let chronic_frac = 0.60_f64;
        assert!(chronic_frac > acute_frac);
        // K_res_intra ratio should mirror fractions
        let pen = pen_result(1.5, 0.4);
        let p_acute   = ReservoirPatient { intracellular_fraction: acute_frac,   ..acute_patient() };
        let p_chronic = ReservoirPatient { intracellular_fraction: chronic_frac, ..acute_patient() };
        let k_a = p_acute.compute(&pen, false).k_res_intra;
        let k_c = p_chronic.compute(&pen, false).k_res_intra;
        assert!(k_c > k_a);
    }

    // Test 6: K_reservoir > 1.0 for any chronic case (C_bone stays therapeutically low)
    #[test]
    fn test_k_reservoir_exceeds_1_for_chronic() {
        // Use ceftaroline (K_pen = 1/0.30 - 1 ≈ 2.33) in a chronic patient
        let chronic = ReservoirPatient {
            p_drainage: 0.3,
            p_debride: 0.3,
            intracellular_fraction: 0.60,
            crp_mgl: 50.0,
        };
        let pen = pen_result((1.0/0.30) - 1.0, 0.30);
        let res = chronic.compute(&pen, false);
        assert!(res.k_reservoir_total > 1.0,
            "chronic K_reservoir must exceed 1.0, got {:.3}", res.k_reservoir_total);
    }

    // Test 7: Reservoir 3 is unchanged by any surgical intervention
    // (p_drainage and p_debride do not affect K_res_intra)
    #[test]
    fn test_reservoir_3_unchanged_by_surgery() {
        let pen = pen_result(1.5, 0.40);
        let unsurgical = ReservoirPatient { p_drainage: 0.0, p_debride: 0.0, ..acute_patient() };
        let full_surgery = ReservoirPatient { p_drainage: 1.0, p_debride: 1.0, ..acute_patient() };
        let k_intra_before = unsurgical.compute(&pen, false).k_res_intra;
        let k_intra_after  = full_surgery.compute(&pen, false).k_res_intra;
        assert_relative_eq!(k_intra_before, k_intra_after, epsilon = 1e-9);
        assert_eq!(k_intra_before.to_bits(), k_intra_after.to_bits(),
            "surgery must not change K_res_intra");
    }

    // Test 8: Rifampin reduces K_res_intra by 60% (modifier = 0.4)
    #[test]
    fn test_rifampin_reduces_k_res_intra() {
        let pen = pen_result(1.86, 0.35);
        let without_rif = steven_keske().compute(&pen, false);
        let with_rif    = steven_keske().compute(&pen, true);
        // Steven K_res_intra without rif: 0.8 * 0.60 = 0.48
        // With rif: 0.48 * 0.4 = 0.192
        assert_relative_eq!(without_rif.k_res_intra, 0.48,  epsilon = 1e-9);
        assert_relative_eq!(with_rif.k_res_intra,    0.192, epsilon = 1e-9);
        let reduction = (without_rif.k_res_intra - with_rif.k_res_intra)
                        / without_rif.k_res_intra;
        assert_relative_eq!(reduction, 0.60, epsilon = 1e-6);
    }

    // Test 9: Anti-Atl mAb flag when intracellular_fraction > 0.3
    #[test]
    fn test_anti_atl_flag() {
        let pen = pen_result(1.5, 0.40);
        let low  = ReservoirPatient { intracellular_fraction: 0.25, ..acute_patient() };
        let high = ReservoirPatient { intracellular_fraction: 0.60, ..acute_patient() };
        assert!(!low.compute(&pen, false).anti_atl_flag);
        assert!(high.compute(&pen, false).anti_atl_flag);
    }
}
