//! Layer K2 — Bone Penetration Manifold
//!
//! K_penetration = (1/R_bone) - 1
//!
//! R_bone is the published bone:serum concentration ratio (0 < R ≤ 1).
//! Low R_bone (e.g. vancomycin 0.10) means high K_pen — the drug cannot
//! cross from blood into bone at therapeutic concentrations.
//!
//! CRP inflammation modifier (Graziani et al. JAC 1988):
//!   R_bone_eff = R_bone × (1 + 0.006 × max(CRP - 100, 0))
//!   Capped at 2× baseline. Effect anchored at CRP > 100 where data exists.
//!
//! Effective bone MIC: MIC_bone = MIC_serum / R_bone_eff

use thiserror::Error;

/// Published bone penetration data for an antibiotic.
/// R_bone is the bone:serum ratio (midpoint of published range).
#[derive(Debug, Clone)]
pub struct DrugBonePenetration {
    pub drug_name: String,
    /// Bone:serum concentration ratio, 0 < R ≤ 1.0
    pub r_bone_baseline: f64,
}

/// Result of computing bone penetration curvature for a specific patient CRP.
#[derive(Debug, Clone)]
pub struct BonePenetrationResult {
    pub r_bone_eff: f64,
    pub k_penetration: f64,
    pub mic_bone_factor: f64, // bone MIC = serum MIC / r_bone_eff (multiply serum MIC by this)
}

#[derive(Debug, Error)]
pub enum BoneError {
    #[error("r_bone must be in (0, 1], got {0}")]
    InvalidRBone(f64),
    #[error("CRP must be non-negative, got {0}")]
    InvalidCrp(f64),
}

impl DrugBonePenetration {
    pub fn new(drug_name: impl Into<String>, r_bone_baseline: f64) -> Result<Self, BoneError> {
        if r_bone_baseline <= 0.0 || r_bone_baseline > 1.0 {
            return Err(BoneError::InvalidRBone(r_bone_baseline));
        }
        Ok(Self { drug_name: drug_name.into(), r_bone_baseline })
    }

    /// Compute effective bone penetration ratio with CRP inflammation modifier.
    ///
    /// R_bone_eff = R_bone × (1 + 0.006 × max(CRP - 100, 0)), capped at 2 × baseline.
    pub fn r_bone_eff(&self, crp_mgl: f64) -> Result<f64, BoneError> {
        if crp_mgl < 0.0 {
            return Err(BoneError::InvalidCrp(crp_mgl));
        }
        let modifier = 0.006 * (crp_mgl - 100.0).max(0.0);
        let r_eff = self.r_bone_baseline * (1.0 + modifier);
        // Cap at 2× baseline
        Ok(r_eff.min(self.r_bone_baseline * 2.0))
    }

    /// K_penetration = (1/R_bone_eff) - 1
    pub fn k_penetration(&self, crp_mgl: f64) -> Result<BonePenetrationResult, BoneError> {
        let r_eff = self.r_bone_eff(crp_mgl)?;
        let k_pen = (1.0 / r_eff) - 1.0;
        // MIC_bone = MIC_serum / r_bone_eff  → caller multiplies serum MIC by (1/r_eff)
        Ok(BonePenetrationResult {
            r_bone_eff: r_eff,
            k_penetration: k_pen,
            mic_bone_factor: 1.0 / r_eff,
        })
    }
}

/// Published bone penetration ratios (midpoints)
pub fn vancomycin_penetration() -> DrugBonePenetration {
    DrugBonePenetration::new("vancomycin", 0.20).unwrap() // 0.10–0.30 range, mid
}
pub fn clindamycin_penetration() -> DrugBonePenetration {
    DrugBonePenetration::new("clindamycin", 0.525).unwrap() // 0.30–0.75 range, mid
}
pub fn ceftaroline_penetration() -> DrugBonePenetration {
    DrugBonePenetration::new("ceftaroline", 0.30).unwrap() // 0.20–0.40 range, mid
}
pub fn daptomycin_penetration() -> DrugBonePenetration {
    DrugBonePenetration::new("daptomycin", 0.15).unwrap() // 0.10–0.20 range, mid
}
pub fn linezolid_penetration() -> DrugBonePenetration {
    DrugBonePenetration::new("linezolid", 0.50).unwrap() // 0.40–0.60 range, mid
}
pub fn rifampin_penetration() -> DrugBonePenetration {
    DrugBonePenetration::new("rifampin", 0.35).unwrap() // 0.20–0.50 range, mid
}
pub fn tmp_smx_penetration() -> DrugBonePenetration {
    DrugBonePenetration::new("tmp-smx", 0.40).unwrap() // 0.30–0.50 range, mid
}

// ---------------------------------------------------------------------------
// TDD — 8 tests matching the spec
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    const NO_INFLAM: f64 = 0.0; // CRP 0: baseline, no modifier

    // Test 1: K_penetration computed correctly for each drug
    #[test]
    fn test_k_penetration_all_drugs() {
        // K = (1/R) - 1
        let cases = [
            (vancomycin_penetration(),  0.20, (1.0/0.20) - 1.0),   // 4.0
            (clindamycin_penetration(), 0.525, (1.0/0.525) - 1.0), // ~0.905
            (ceftaroline_penetration(), 0.30, (1.0/0.30) - 1.0),   // ~2.333
            (daptomycin_penetration(),  0.15, (1.0/0.15) - 1.0),   // ~5.667
            (linezolid_penetration(),   0.50, (1.0/0.50) - 1.0),   // 1.0
            (rifampin_penetration(),    0.35, (1.0/0.35) - 1.0),   // ~1.857
            (tmp_smx_penetration(),     0.40, (1.0/0.40) - 1.0),   // 1.5
        ];
        for (drug, _r, expected_k) in cases {
            let res = drug.k_penetration(NO_INFLAM).unwrap();
            assert_relative_eq!(res.k_penetration, expected_k, epsilon = 1e-3,
                max_relative = 0.01);
        }
    }

    // Test 2: Vancomycin K_pen > 3.0 (poor penetration)
    #[test]
    fn test_vancomycin_k_pen_poor() {
        let res = vancomycin_penetration().k_penetration(NO_INFLAM).unwrap();
        assert!(res.k_penetration > 3.0,
            "vancomycin K_pen should be > 3.0, got {}", res.k_penetration);
    }

    // Test 3: Clindamycin K_pen < 1.0 (good penetration)
    #[test]
    fn test_clindamycin_k_pen_good() {
        let res = clindamycin_penetration().k_penetration(NO_INFLAM).unwrap();
        assert!(res.k_penetration < 1.0,
            "clindamycin K_pen should be < 1.0, got {}", res.k_penetration);
    }

    // Test 4: Inflammation modifier increases R_bone at CRP > 100
    #[test]
    fn test_inflammation_modifier_activates_at_crp_100() {
        let drug = vancomycin_penetration();
        let r_base = drug.r_bone_eff(0.0).unwrap();
        let r_at_50 = drug.r_bone_eff(50.0).unwrap();
        let r_at_150 = drug.r_bone_eff(150.0).unwrap();

        // Below or at 100: no change
        assert_relative_eq!(r_base, 0.20, epsilon = 1e-9);
        assert_relative_eq!(r_at_50, 0.20, epsilon = 1e-9);

        // CRP 150: modifier = 0.006 * 50 = 0.30 → R = 0.20 * 1.30 = 0.26
        assert_relative_eq!(r_at_150, 0.20 * 1.30, epsilon = 1e-6);
        assert!(r_at_150 > r_base, "CRP 150 must increase R_bone");
    }

    // Test 5: Inflammation modifier capped at 2×
    #[test]
    fn test_inflammation_modifier_cap_at_2x() {
        let drug = vancomycin_penetration(); // baseline 0.20
        // CRP 500: modifier = 0.006 * 400 = 2.4 → would give 0.20 * 3.4, capped at 0.40
        let r_extreme = drug.r_bone_eff(500.0).unwrap();
        assert_relative_eq!(r_extreme, 0.20 * 2.0, epsilon = 1e-9);
    }

    // Test 6: C_bone < C_serum for all drugs (penetration always loses signal)
    // i.e., R_bone_eff < 1.0 for all real drugs → K_pen > 0
    #[test]
    fn test_all_drugs_have_positive_k_pen() {
        let drugs = [
            vancomycin_penetration(), clindamycin_penetration(),
            ceftaroline_penetration(), daptomycin_penetration(),
            linezolid_penetration(), rifampin_penetration(),
            tmp_smx_penetration(),
        ];
        for drug in drugs {
            let res = drug.k_penetration(NO_INFLAM).unwrap();
            assert!(res.k_penetration > 0.0, "{}: K_pen must be > 0", drug.drug_name);
            assert!(res.r_bone_eff < 1.0, "{}: R_bone must be < 1.0", drug.drug_name);
        }
    }

    // Test 7: R_bone = 1.0 gives K_pen = 0.0 (theoretical perfect penetration)
    #[test]
    fn test_perfect_penetration_gives_zero_k_pen() {
        let perfect = DrugBonePenetration::new("perfect", 1.0).unwrap();
        let res = perfect.k_penetration(NO_INFLAM).unwrap();
        assert_relative_eq!(res.k_penetration, 0.0, epsilon = 1e-9);
    }

    // Test 8: Effective bone MIC factor = 1/R_bone_eff
    #[test]
    fn test_mic_bone_factor() {
        // ceftaroline R=0.30 → MIC_bone = MIC_serum / 0.30 → factor = 3.333
        let res = ceftaroline_penetration().k_penetration(NO_INFLAM).unwrap();
        assert_relative_eq!(res.mic_bone_factor, 1.0 / 0.30, epsilon = 1e-6);

        // At CRP 200: R_eff = 0.30 * (1 + 0.006*100) = 0.30 * 1.6 = 0.48
        let res_inflam = ceftaroline_penetration().k_penetration(200.0).unwrap();
        assert_relative_eq!(res_inflam.r_bone_eff, 0.30 * 1.6, epsilon = 1e-6);
        assert_relative_eq!(res_inflam.mic_bone_factor, 1.0 / (0.30 * 1.6), epsilon = 1e-6);
    }
}
