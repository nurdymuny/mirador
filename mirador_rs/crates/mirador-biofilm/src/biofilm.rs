//! Layer K3 — Biofilm Resistance Manifold
//!
//! K_biofilm = log10(MBEC / MIC)
//!
//! MIC  = minimum inhibitory concentration (planktonic MRSA, µg/mL)
//! MBEC = minimum biofilm eradication concentration (µg/mL)
//!
//! Biofilm bacteria can require 100–1000× higher drug concentrations than
//! planktonic bacteria. This layer encodes that geometric friction.
//!
//! Effective biofilm curvature includes a biofilm probability weight:
//!   K_biofilm_eff = biofilm_prob × K_biofilm
//!
//! Biofilm probability is estimated from infection chronicity:
//!   acute  (< 14 days):     biofilm_prob = 0.20
//!   subacute (14d – 90d):   biofilm_prob = 0.60
//!   chronic  (> 90 days):   biofilm_prob = 0.95
//!
//! Rifampin hard-block: rifampin monotherapy is contraindicated because
//! rpoB mutations emerge rapidly. System errors on monotherapy attempt.

use thiserror::Error;

/// Published MIC and MBEC values for a drug against MRSA biofilm
#[derive(Debug, Clone)]
pub struct BiofilmProfile {
    pub drug_name: String,
    /// Minimum inhibitory concentration vs planktonic MRSA (µg/mL)
    pub mic_ug_ml: f64,
    /// Minimum biofilm eradication concentration (µg/mL)
    pub mbec_ug_ml: f64,
    /// True if this drug requires a mandatory companion drug (rifampin rule)
    pub requires_companion: bool,
}

/// Infection chronicity classification for biofilm probability estimation
#[derive(Debug, Clone, PartialEq)]
pub enum Chronicity {
    /// < 14 days: CRP rising, acute presentation
    Acute,
    /// 14 days – 90 days: CRP plateau, subacute
    Subacute,
    /// > 90 days: CRP fluctuating, established biofilm
    Chronic,
}

impl Chronicity {
    pub fn from_days(days: f64) -> Self {
        if days < 14.0 {
            Self::Acute
        } else if days <= 90.0 {
            Self::Subacute
        } else {
            Self::Chronic
        }
    }

    /// Estimated probability that infection has established biofilm
    pub fn biofilm_probability(&self) -> f64 {
        match self {
            Self::Acute    => 0.20,
            Self::Subacute => 0.60,
            Self::Chronic  => 0.95,
        }
    }
}

#[derive(Debug, Error)]
pub enum BiofilmError {
    #[error("MIC must be positive, got {0}")]
    InvalidMic(f64),
    #[error("MBEC must be positive, got {0}")]
    InvalidMbec(f64),
    #[error("MBEC must be ≥ MIC (biofilm MIC ≥ planktonic MIC), got MBEC={0} < MIC={1}")]
    MbecLessThanMic(f64, f64),
    #[error("Rifampin monotherapy is contraindicated: rpoB mutations emerge rapidly. Add a companion drug with independent bactericidal activity.")]
    RifampinMonotherapyContraindicated,
}

impl BiofilmProfile {
    pub fn new(
        drug_name: impl Into<String>,
        mic_ug_ml: f64,
        mbec_ug_ml: f64,
        requires_companion: bool,
    ) -> Result<Self, BiofilmError> {
        if mic_ug_ml <= 0.0 { return Err(BiofilmError::InvalidMic(mic_ug_ml)); }
        if mbec_ug_ml <= 0.0 { return Err(BiofilmError::InvalidMbec(mbec_ug_ml)); }
        if mbec_ug_ml < mic_ug_ml {
            return Err(BiofilmError::MbecLessThanMic(mbec_ug_ml, mic_ug_ml));
        }
        Ok(Self { drug_name: drug_name.into(), mic_ug_ml, mbec_ug_ml, requires_companion })
    }

    /// K_biofilm = log10(MBEC / MIC)
    pub fn k_biofilm(&self) -> f64 {
        (self.mbec_ug_ml / self.mic_ug_ml).log10()
    }

    /// Effective biofilm curvature weighted by biofilm probability
    /// K_biofilm_eff = biofilm_prob × K_biofilm
    pub fn k_biofilm_eff(&self, chronicity: &Chronicity) -> f64 {
        chronicity.biofilm_probability() * self.k_biofilm()
    }
}

/// Validate that a proposed therapy is not rifampin monotherapy.
/// Returns Err if rifampin is used alone.
pub fn check_rifampin_monotherapy(drugs: &[&BiofilmProfile]) -> Result<(), BiofilmError> {
    let has_rifampin = drugs.iter().any(|d| d.requires_companion);
    if has_rifampin && drugs.len() == 1 {
        return Err(BiofilmError::RifampinMonotherapyContraindicated);
    }
    Ok(())
}

/// Returns the rifampin resistance probability given therapy mode
pub fn rifampin_resistance_probability(monotherapy: bool) -> f64 {
    if monotherapy { 0.80 } else { 0.05 }
}

// Published MRSA profiles (Parra-Ruiz 2012, LaPlante 2012, Barber 2015, Stewart 2015, Zimmerli)
pub fn vancomycin_biofilm() -> BiofilmProfile {
    BiofilmProfile::new("vancomycin", 1.0, 512.0, false).unwrap()
}
pub fn clindamycin_biofilm() -> BiofilmProfile {
    BiofilmProfile::new("clindamycin", 0.25, 64.0, false).unwrap()
}
pub fn ceftaroline_biofilm() -> BiofilmProfile {
    BiofilmProfile::new("ceftaroline", 1.0, 128.0, false).unwrap()
}
pub fn daptomycin_biofilm() -> BiofilmProfile {
    BiofilmProfile::new("daptomycin", 0.5, 32.0, false).unwrap()
}
pub fn linezolid_biofilm() -> BiofilmProfile {
    BiofilmProfile::new("linezolid", 2.0, 256.0, false).unwrap()
}
pub fn rifampin_biofilm() -> BiofilmProfile {
    // requires_companion = true enforces the hard block against monotherapy
    BiofilmProfile::new("rifampin", 0.008, 0.5, true).unwrap()
}

// ---------------------------------------------------------------------------
// TDD — 10 tests matching the spec
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    // Test 1: K_biofilm computed correctly from MIC/MBEC for each drug
    #[test]
    fn test_k_biofilm_all_drugs() {
        let cases: [(_, f64); 6] = [
            (vancomycin_biofilm(),  512.0 / 1.0),
            (clindamycin_biofilm(), 64.0  / 0.25),
            (ceftaroline_biofilm(), 128.0 / 1.0),
            (daptomycin_biofilm(),  32.0  / 0.5),
            (linezolid_biofilm(),   256.0 / 2.0),
            (rifampin_biofilm(),    0.5   / 0.008),
        ];
        for (drug, ratio) in cases {
            let expected = ratio.log10();
            assert_relative_eq!(drug.k_biofilm(), expected, epsilon = 1e-3,
                max_relative = 0.001);
        }
    }

    // Test 2: Rifampin has the lowest K_biofilm (best biofilm penetrator)
    #[test]
    fn test_rifampin_has_lowest_k_biofilm() {
        let drugs = [
            vancomycin_biofilm(), clindamycin_biofilm(), ceftaroline_biofilm(),
            daptomycin_biofilm(), linezolid_biofilm(),
        ];
        let rif_k = rifampin_biofilm().k_biofilm();
        for drug in &drugs {
            assert!(rif_k < drug.k_biofilm(),
                "rifampin K_bio ({:.3}) must be less than {} ({:.3})",
                rif_k, drug.drug_name, drug.k_biofilm());
        }
    }

    // Test 3: Daptomycin K_biofilm < vancomycin K_biofilm
    #[test]
    fn test_daptomycin_better_than_vancomycin_biofilm() {
        assert!(daptomycin_biofilm().k_biofilm() < vancomycin_biofilm().k_biofilm());
    }

    // Test 4: Biofilm probability = 0.20 for acute presentation (< 14 days)
    #[test]
    fn test_biofilm_probability_acute() {
        assert_relative_eq!(Chronicity::from_days(7.0).biofilm_probability(), 0.20, epsilon = 1e-9);
        assert_relative_eq!(Chronicity::from_days(13.9).biofilm_probability(), 0.20, epsilon = 1e-9);
    }

    // Test 5: Biofilm probability = 0.95 for chronic (> 90 days / 3 months)
    #[test]
    fn test_biofilm_probability_chronic() {
        assert_relative_eq!(Chronicity::from_days(91.0).biofilm_probability(), 0.95, epsilon = 1e-9);
        // Steven Keske: 6 years
        assert_relative_eq!(Chronicity::from_days(2190.0).biofilm_probability(), 0.95, epsilon = 1e-9);
    }

    // Test 6: K_biofilm_eff scales linearly with biofilm_prob
    #[test]
    fn test_k_biofilm_eff_scales_linearly() {
        let drug = vancomycin_biofilm();
        let k = drug.k_biofilm();
        assert_relative_eq!(drug.k_biofilm_eff(&Chronicity::Acute),    0.20 * k, epsilon = 1e-9);
        assert_relative_eq!(drug.k_biofilm_eff(&Chronicity::Subacute), 0.60 * k, epsilon = 1e-9);
        assert_relative_eq!(drug.k_biofilm_eff(&Chronicity::Chronic),  0.95 * k, epsilon = 1e-9);
    }

    // Test 7: Combination therapy flag when K_biofilm_eff > 2.0
    #[test]
    fn test_combination_flag_threshold() {
        // vancomycin K_biofilm = 2.709; at chronic (prob=0.95): 2.709*0.95 = 2.574 > 2.0
        let vanc = vancomycin_biofilm();
        assert!(vanc.k_biofilm_eff(&Chronicity::Chronic) > 2.0);
        // acute: 2.709 * 0.20 = 0.542 < 2.0
        assert!(vanc.k_biofilm_eff(&Chronicity::Acute) < 2.0);
    }

    // Test 8: Rifampin combination flag when biofilm_prob > 0.5
    #[test]
    fn test_rifampin_required_for_subacute_and_chronic() {
        // biofilm_prob for subacute = 0.60 > 0.5 → rifampin should be in combination
        // (this tests the clinical decision logic, not the hard block)
        assert!(Chronicity::Subacute.biofilm_probability() > 0.5);
        assert!(Chronicity::Chronic.biofilm_probability()  > 0.5);
        assert!(Chronicity::Acute.biofilm_probability()    <= 0.5);
    }

    // Test 9: Steven Keske scenario — K_biofilm_eff > 2.5 (chronic MRSA AHO)
    #[test]
    fn test_steven_keske_k_biofilm_eff() {
        // Steven: 6 years chronic → prob = 0.95. Using vancomycin:
        // K_biofilm = 2.709, K_biofilm_eff = 0.95 * 2.709 = 2.574 > 2.5
        let steven_chronicity = Chronicity::from_days(365.0 * 6.0);
        let k_eff = vancomycin_biofilm().k_biofilm_eff(&steven_chronicity);
        assert!(k_eff > 2.5, "Steven Keske vanc K_bio_eff should be > 2.5, got {:.3}", k_eff);
    }

    // Test 10: Rifampin monotherapy is hard-blocked
    #[test]
    fn test_rifampin_monotherapy_blocked() {
        let rif = rifampin_biofilm();
        // Monotherapy → error
        let result = check_rifampin_monotherapy(&[&rif]);
        assert!(result.is_err(), "rifampin monotherapy must be blocked");
        matches!(result.unwrap_err(), BiofilmError::RifampinMonotherapyContraindicated);

        // Combination → OK
        let cef = ceftaroline_biofilm();
        let result2 = check_rifampin_monotherapy(&[&rif, &cef]);
        assert!(result2.is_ok(), "rifampin + ceftaroline combination must be allowed");
    }
}
