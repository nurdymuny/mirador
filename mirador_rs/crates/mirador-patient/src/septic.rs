/// COLLATERAL_RISK flag — per "Beyond mecA" (Schaffer/Rosato, AAC Feb 2026).
///
/// Prior carbapenem exposure within 90 days primes a non-PBP2a resistance
/// pathway: meropenem selects rpoB mutations → pbp1 H499R → mecA Y446H/E447K.
/// Patients with this flag active need an additional escape manifold evaluation
/// in Layer 7 and combination therapy consideration in Layer 8.
/// (Test 0.2 of MIRADOR_PBP2A_REAL_DATA_SPEC.md)
pub fn collateral_risk(days_since_carbapenem: Option<f64>) -> bool {
    match days_since_carbapenem {
        Some(d) => d < 90.0,
        None => false,
    }
}

/// Vancomycin nephrotoxicity flag.
///
/// Trough > 15 μg/mL triggers nephrotoxicity risk.
/// This elevates K_tox in Layer 5 (additive renal burden with ceftaroline).
/// (Test 0.3 of MIRADOR_PBP2A_REAL_DATA_SPEC.md)
pub fn vancomycin_toxicity_flag(trough_ug_ml: f64) -> bool {
    trough_ug_ml > 15.0
}

/// PBP2a septic MRSA demo patient (68yo, eGFR 45, on vancomycin).
///
/// From MIRADOR_PBP2A_REAL_DATA_SPEC Layer 0.
pub struct SepticMRSAPatient {
    pub age_years: f64,
    pub weight_kg: f64,
    /// eGFR mL/min/1.73m² — 45 = Stage G3a (AKI from sepsis)
    pub egfr: f64,
    /// ALT U/L — 85 = 2.1× ULN (mild hepatic stress from sepsis)
    pub alt_ul: f64,
    /// Serum albumin g/dL — 2.5 (low: hypoalbuminaemia in sepsis)
    pub albumin_g_dl: f64,
    /// Vancomycin trough μg/mL — 18 (near toxic: > 15 = flag)
    pub vancomycin_trough_ug_ml: f64,
    /// Days since last carbapenem dose (14 = meropenem 14 days ago for UTI)
    pub days_since_carbapenem: Option<f64>,
    /// CYP2D6 genotype activity score (*1/*2 = Normal metabolizer, AS=1.0)
    pub cyp2d6_activity_score: f64,
    /// CYP3A4 fractional activity (0.7 = reduced by sepsis)
    pub cyp3a4_activity: f64,
}

impl SepticMRSAPatient {
    /// Demo patient from the spec.
    pub fn demo() -> Self {
        SepticMRSAPatient {
            age_years: 68.0,
            weight_kg: 82.0,
            egfr: 45.0,
            alt_ul: 85.0,
            albumin_g_dl: 2.5,
            vancomycin_trough_ug_ml: 18.0,
            days_since_carbapenem: Some(14.0), // meropenem 14 days ago
            cyp2d6_activity_score: 1.0,        // *1/*2 Normal
            cyp3a4_activity: 0.7,              // reduced by sepsis
        }
    }

    /// COLLATERAL_RISK flag — elevated when prior carbapenem within 90 days.
    pub fn collateral_risk(&self) -> bool {
        collateral_risk(self.days_since_carbapenem)
    }

    /// Vancomycin toxicity flag.
    pub fn vancomycin_nephrotoxicity_flag(&self) -> bool {
        vancomycin_toxicity_flag(self.vancomycin_trough_ug_ml)
    }

    /// Albumin ratio (patient / normal 4.0 g/dL).
    /// Used to compute distribution curvature K_dist.
    pub fn albumin_ratio(&self) -> f64 {
        self.albumin_g_dl / 4.0
    }
}

// ============================================================================
// Tests — PBP2a Real Data Spec Tests 0.1–0.3
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;

    // TEST 0.2 — COLLATERAL_RISK = true when meropenem < 90 days ago (LIT-1)
    #[test]
    fn collateral_risk_flag_within_90_days() {
        let days_since_meropenem = 14.0_f64;
        assert!(collateral_risk(Some(days_since_meropenem)), "meropenem 14d ago → COLLATERAL_RISK must be true");
    }

    // TEST 0.2 — COLLATERAL_RISK = false when > 90 days
    #[test]
    fn collateral_risk_flag_beyond_90_days() {
        assert!(!collateral_risk(Some(95.0)), "meropenem 95d ago → COLLATERAL_RISK must be false");
    }

    // TEST 0.2 — COLLATERAL_RISK = false when no prior carbapenem
    #[test]
    fn collateral_risk_flag_no_carbapenem() {
        assert!(!collateral_risk(None), "no carbapenem history → COLLATERAL_RISK must be false");
    }

    // TEST 0.3 — Vancomycin trough 18 μg/mL → nephrotoxicity flag
    #[test]
    fn vancomycin_trough_near_toxic_flags() {
        assert!(vancomycin_toxicity_flag(18.0), "trough 18 > 15 → must flag nephrotoxicity risk");
    }

    // TEST 0.3 — Safe trough does not flag
    #[test]
    fn vancomycin_trough_safe_no_flag() {
        assert!(!vancomycin_toxicity_flag(12.0), "trough 12 < 15 → should not flag");
    }

    // TEST 0.2 — Demo patient triggers COLLATERAL_RISK
    #[test]
    fn demo_patient_has_collateral_risk() {
        let patient = SepticMRSAPatient::demo();
        assert!(patient.collateral_risk(), "demo patient had meropenem 14d ago → COLLATERAL_RISK");
    }

    // TEST 0.3 — Demo patient triggers vancomycin toxicity flag
    #[test]
    fn demo_patient_has_vancomycin_risk() {
        let patient = SepticMRSAPatient::demo();
        assert!(patient.vancomycin_nephrotoxicity_flag(), "demo patient vanco trough 18 > 15 → toxicity flag");
    }

    // Boundary: trough exactly at 15 should NOT flag (strictly greater than 15)
    #[test]
    fn vancomycin_trough_exactly_at_boundary_does_not_flag() {
        assert!(!vancomycin_toxicity_flag(15.0), "trough exactly 15 is not above 15 → no flag");
    }
}
