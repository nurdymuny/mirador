//! Layer T4 — Multi-Reservoir Geometry
//!
//! TB bacteria inhabit four anatomically distinct niches simultaneously,
//! each with different drug accessibility.
//!
//!   Reservoir 1: Extracellular replicating — cavity wall + cellular granuloma
//!   Reservoir 2: Intracellular macrophages — acidic phagosome, pH 5.0-5.5
//!   Reservoir 3: Caseum (closed necrotic granuloma) — avascular, must diffuse
//!   Reservoir 4: Cavity caseum (open cavities) — caseum-air interface, high burden
//!
//! K_reservoir = K_res_extra + K_res_macro + K_res_caseum + K_res_cavity
//!
//! Each component: K_res_x = (1 - R_x) * w_x
//!   R_x = drug penetration ratio for that reservoir
//!   w_x = estimated weight of that reservoir in total bacterial burden
//!
//! NOTE: BDQ K_reservoir values represent steady-state accumulation (~week 8+).
//! At day 1, BDQ's effective K_reservoir is substantially higher.
//! Time-indexed K_reservoir_BDQ is a v0.2 target.
//!
//! Sources: Kjellsson 2012; Strydom 2025; Sarathy 2018

use thiserror::Error;

/// Drug-specific penetration ratios for each TB reservoir
#[derive(Debug, Clone)]
pub struct TbReservoirProfile {
    pub drug_name: String,
    /// Penetration into extracellular compartment (cellular gran / cavity wall)
    pub r_extracellular: f64,
    /// Penetration into macrophage intracellular space
    pub r_macrophage: f64,
    /// Total drug concentration ratio in caseum (avascular necrotic core).
    /// NOTE: Only the free (unbound) fraction reaches bacteria — use fu_caseum.
    pub r_caseum: f64,
    /// Fraction of drug unbound (free) in caseum. 1.0 = fully free (hydrophilic drugs).
    /// Lipophilic drugs (BDQ, CLO) bind caseum lipids → fu < 0.01 → drug barely reaches bacteria.
    /// R_eff = r_caseum × fu_caseum. Source: Sarathy 2016, Table 3.
    pub fu_caseum: f64,
    /// Penetration into open cavity caseum surface
    pub r_cavity: f64,
}

/// Reservoir burden weights for a patient — how bacterial load is distributed
#[derive(Debug, Clone)]
pub struct ReservoirWeights {
    pub w_extracellular: f64,
    pub w_macrophage: f64,
    pub w_caseum: f64,
    pub w_cavity: f64,
}

#[derive(Debug, Error)]
pub enum ReservoirError {
    #[error("Reservoir weights must sum to 1.0, got {0:.4}")]
    WeightSumNotOne(f64),
    #[error("Penetration ratio must be positive, got {0}")]
    InvalidRatio(f64),
}

impl ReservoirWeights {
    pub fn new(
        w_extracellular: f64,
        w_macrophage: f64,
        w_caseum: f64,
        w_cavity: f64,
    ) -> Result<Self, ReservoirError> {
        let total = w_extracellular + w_macrophage + w_caseum + w_cavity;
        if (total - 1.0).abs() > 1e-6 {
            return Err(ReservoirError::WeightSumNotOne(total));
        }
        Ok(Self { w_extracellular, w_macrophage, w_caseum, w_cavity })
    }

    /// Cavitary, sputum-positive patient
    pub fn cavitary() -> Self {
        Self::new(0.20, 0.10, 0.35, 0.35).unwrap()
    }
    /// Non-cavitary, sputum-positive
    pub fn noncavitary_sputum_positive() -> Self {
        Self::new(0.30, 0.20, 0.50, 0.00).unwrap()
    }
    /// Non-cavitary, sputum-negative
    pub fn noncavitary_sputum_negative() -> Self {
        Self::new(0.25, 0.25, 0.50, 0.00).unwrap()
    }
}

impl TbReservoirProfile {
    pub fn new(
        drug_name: impl Into<String>,
        r_extracellular: f64,
        r_macrophage: f64,
        r_caseum: f64,
        fu_caseum: f64,
        r_cavity: f64,
    ) -> Result<Self, ReservoirError> {
        for r in &[r_extracellular, r_macrophage, r_caseum, r_cavity] {
            if *r <= 0.0 { return Err(ReservoirError::InvalidRatio(*r)); }
        }
        if !(fu_caseum > 0.0 && fu_caseum <= 1.0) {
            return Err(ReservoirError::InvalidRatio(fu_caseum));
        }
        Ok(Self { drug_name: drug_name.into(), r_extracellular, r_macrophage, r_caseum, fu_caseum, r_cavity })
    }

    fn k_res_component(r: f64, w: f64) -> f64 {
        // K_res_x = (1 - R_x) * w_x; if R > 1 (drug concentrates), clamped at 0
        ((1.0 - r) * w).max(0.0)
    }

    /// K_reservoir = sum of all four reservoir curvature components.
    /// Caseum uses fu-corrected formula; others use total penetration ratio.
    pub fn k_reservoir(&self, weights: &ReservoirWeights) -> f64 {
        Self::k_res_component(self.r_extracellular, weights.w_extracellular)
            + Self::k_res_component(self.r_macrophage, weights.w_macrophage)
            + self.k_res_caseum(weights.w_caseum)
            + Self::k_res_component(self.r_cavity, weights.w_cavity)
    }

    /// K_res for the caseum compartment — uses fu-corrected effective penetration.
    /// R_eff = r_caseum × fu_caseum; K = (1 - R_eff) × w_caseum.
    /// v2.2 fix: previously used total R without fu correction → BDQ K was 0 (wrong).
    pub fn k_res_caseum(&self, w_caseum: f64) -> f64 {
        let r_eff = self.r_caseum * self.fu_caseum;
        ((1.0 - r_eff) * w_caseum).max(0.0)
    }
}

// ---------------------------------------------------------------------------
// Published reservoir profiles — Kjellsson 2012 + Strydom 2025
// ---------------------------------------------------------------------------

pub fn isoniazid_reservoir() -> TbReservoirProfile {
    // INH: hydrophilic → fu_caseum ≈ 1.0 (no lipid binding)
    TbReservoirProfile::new("isoniazid", 0.60, 0.40, 0.30, 1.00, 0.40).unwrap()
}

pub fn rifampin_reservoir() -> TbReservoirProfile {
    // RIF: fu_caseum = 0.10 (Sarathy 2016 — binds caseum lipoproteins)
    // R_eff = 0.05 × 0.10 = 0.005 → K_res_caseum ≈ 0.995 × w (RIF fails in caseum)
    TbReservoirProfile::new("rifampin", 0.20, 0.15, 0.05, 0.10, 0.15).unwrap()
}

pub fn pyrazinamide_reservoir() -> TbReservoirProfile {
    // PZA: hydrophilic → fu_caseum ≈ 1.0; good caseum diffusion
    TbReservoirProfile::new("pyrazinamide", 0.70, 0.60, 0.40, 1.00, 0.60).unwrap()
}

pub fn ethambutol_reservoir() -> TbReservoirProfile {
    // EMB: fu_caseum ≈ 0.70 (moderate binding)
    TbReservoirProfile::new("ethambutol", 1.50, 0.80, 0.30, 0.70, 1.00).unwrap()
}

pub fn moxifloxacin_reservoir() -> TbReservoirProfile {
    // MXF: fu_caseum = 0.70 (Sarathy 2016)
    TbReservoirProfile::new("moxifloxacin", 2.50, 2.00, 1.50, 0.70, 2.00).unwrap()
}

pub fn bedaquiline_reservoir() -> TbReservoirProfile {
    // BDQ: accumulates in macrophage lipid bodies (R_macro = 3.0 at steady state, ~week 8)
    // CRITICAL — fu_caseum = 0.001 (Sarathy 2016, Table 3):
    //   BDQ is >99.9% bound to caseum lipids — only 0.1% reaches free bacteria.
    //   R_eff = 2.0 × 0.001 = 0.002 → K_res_caseum ≈ 0.998 × w (catastrophic barrier).
    // v2.2 fix: previously used r_caseum: 2.00 without fu correction → K = 0 (WRONG).
    TbReservoirProfile::new("bedaquiline", 4.00, 3.00, 2.00, 0.001, 3.00).unwrap()
}

pub fn linezolid_reservoir() -> TbReservoirProfile {
    // LZD: fu_caseum = 0.60 (Sarathy 2016)
    TbReservoirProfile::new("linezolid", 1.00, 0.80, 0.60, 0.60, 0.80).unwrap()
}

// ---------------------------------------------------------------------------
// TDD — 8 tests matching spec Layer T4
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    // T4-1: K_reservoir formula with fu-corrected caseum component
    // v2.2: k_res_caseum = (1 - R_total × fu_caseum) × w
    #[test]
    fn test_k_reservoir_formula() {
        let rif = rifampin_reservoir();
        let w = ReservoirWeights::noncavitary_sputum_positive();
        // RIF: R_eff = 0.05 × 0.10 = 0.005 → K_res_caseum = (1 - 0.005) × 0.50 = 0.4975
        assert_relative_eq!(rif.k_res_caseum(0.50), 0.4975, epsilon = 1e-9);
        let total = rif.k_reservoir(&w);
        assert!(total > 0.0 && total < 1.0);
    }

    // T4-2: RIF K_res_caseum >> PZA K_res_caseum (rifampin fails in caseum)
    #[test]
    fn test_rif_vs_pza_caseum() {
        let rif = rifampin_reservoir();
        let pza = pyrazinamide_reservoir();
        let w_caseum = 0.35;
        assert!(
            rif.k_res_caseum(w_caseum) > pza.k_res_caseum(w_caseum),
            "RIF caseum K ({:.4}) should be > PZA caseum K ({:.4})",
            rif.k_res_caseum(w_caseum), pza.k_res_caseum(w_caseum)
        );
    }

    // T4-3: INH K_res_extra is low (clears extracellular bacteria well)
    #[test]
    fn test_inh_extracellular_low_k() {
        let inh = isoniazid_reservoir();
        // R_extra = 0.60 → K = (1-0.60)*w; with w=0.30 → 0.12
        let k = (1.0 - inh.r_extracellular).max(0.0) * 0.30;
        assert!(k < 0.20);
    }

    // T4-4: BDQ K_res_macrophage is low at steady state (accumulates in lipid bodies)
    #[test]
    fn test_bdq_macrophage_accumulation() {
        let bdq = bedaquiline_reservoir();
        // R_macro = 3.0 → K_res_macro = (1-3.0)*w = 0 (drug concentrates)
        let w = ReservoirWeights::cavitary();
        let k_macro = ((1.0 - bdq.r_macrophage) * w.w_macrophage).max(0.0);
        assert_relative_eq!(k_macro, 0.0, epsilon = 1e-9);
    }

    // T4-5: Cavitary patient has non-zero K_res_cavity
    #[test]
    fn test_cavitary_nonzero_cavity_k() {
        let rif = rifampin_reservoir();
        let w = ReservoirWeights::cavitary();
        // w_cavity = 0.35 → K_res_cavity = (1 - 0.15) * 0.35 = 0.2975
        let k_cav = ((1.0 - rif.r_cavity) * w.w_cavity).max(0.0);
        assert!(k_cav > 0.0);
    }

    // T4-6: Non-cavitary patient has K_res_cavity = 0
    #[test]
    fn test_noncavitary_zero_cavity_k() {
        let rif = rifampin_reservoir();
        let w = ReservoirWeights::noncavitary_sputum_positive();
        assert_relative_eq!(w.w_cavity, 0.0, epsilon = 1e-9);
        let k_cav = ((1.0 - rif.r_cavity) * w.w_cavity).max(0.0);
        assert_relative_eq!(k_cav, 0.0, epsilon = 1e-9);
    }

    // T4-7: Total K_reservoir is drug-specific (different for each RIPE drug)
    #[test]
    fn test_k_reservoir_drug_specific() {
        let w = ReservoirWeights::noncavitary_sputum_positive();
        let k_inh = isoniazid_reservoir().k_reservoir(&w);
        let k_rif = rifampin_reservoir().k_reservoir(&w);
        let k_pza = pyrazinamide_reservoir().k_reservoir(&w);
        // All should differ
        assert!((k_inh - k_rif).abs() > 0.01);
        assert!((k_rif - k_pza).abs() > 0.01);
    }

    // T4-8: ReservoirWeights rejects invalid weight sums
    #[test]
    fn test_invalid_reservoir_weights() {
        assert!(ReservoirWeights::new(0.3, 0.3, 0.3, 0.3).is_err()); // sum = 1.2
        assert!(ReservoirWeights::new(0.25, 0.25, 0.25, 0.25).is_ok()); // sum = 1.0
    }

    // T4-9: BDQ caseum barrier is catastrophic due to fu_caseum = 0.001
    // This was Bug 3: previously r_caseum: 2.00 without fu correction gave K = 0
    // (drug appeared to penetrate perfectly). Correct: K ≈ 0.998 × w (total barrier).
    #[test]
    fn test_bdq_caseum_barrier_catastrophic() {
        let bdq = bedaquiline_reservoir();
        // w_caseum = 0.35 (cavitary patient)
        // R_eff = 2.0 × 0.001 = 0.002 → K = (1 - 0.002) × 0.35 = 0.3493
        let k = bdq.k_res_caseum(0.35);
        assert!(
            k > 0.30,
            "BDQ K_res_caseum = {k:.4} must be > 0.30; fu=0.001 means drug is bound in caseum"
        );
        assert_relative_eq!(k, (1.0 - 2.0 * 0.001) * 0.35, epsilon = 1e-9);
    }

    // T4-10: fu_caseum must be in (0, 1] — zero or negative rejected
    #[test]
    fn test_invalid_fu_caseum_rejected() {
        assert!(TbReservoirProfile::new("test", 1.0, 1.0, 1.0, 0.0, 1.0).is_err()); // fu=0
        assert!(TbReservoirProfile::new("test", 1.0, 1.0, 1.0, 1.1, 1.0).is_err()); // fu>1
        assert!(TbReservoirProfile::new("test", 1.0, 1.0, 1.0, 0.001, 1.0).is_ok()); // BDQ-like
    }
}
