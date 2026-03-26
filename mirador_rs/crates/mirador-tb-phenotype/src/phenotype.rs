//! Layer T3 — Phenotypic Tolerance Manifold
//!
//! TB bacteria exist in three metabolically distinct subpopulations, each
//! requiring different drug activity. This is the Mitchison model (1979),
//! validated by 40 years of TB clinical research.
//!
//!   Replicating    — aerobic, pH 7, rapid growth; best killed by INH
//!   Semi-dormant   — acidic, pH 5.5, slow growth; best killed by PZA
//!   Dormant/NRP    — hypoxic, pH <5, non-replicating; only RIF/BDQ have activity
//!
//! K_phenotype = log10(MIC_phenotype / MIC_standard)
//!
//! ## Binary Hammer Cap (v2.2)
//!
//! "Drug inactive in this compartment" is represented as BINARY_HAMMER_CAP
//! (log10(500) ≈ 2.699), NOT f64::MAX. Using true infinity in a weighted sum
//! poisons the entire downstream pipeline — any finite drug in the parallel
//! combination collapses to zero effect.
//!
//! The cap encodes: above MIC_ratio = 500×, the drug has zero clinical relevance
//! regardless of the exact value. The boundary is clinically binary (hammer).
//!
//! ## PZA special case
//!
//! PZA is inactive at neutral pH (mic_standard = None). Against replicating
//! bacteria K_phen = BINARY_HAMMER_CAP. In its native acidic environment
//! (pH 4.5-5.5) K_phen_acid = 0 (it is the reference drug for that compartment).
//!
//! PZA resistance (pncA): abolishes enzymatic activation in ALL compartments.
//! When resistance_abolishes_activation = true, K_phen = BINARY_HAMMER_CAP
//! for repicating AND acidic AND dormant populations.
//! Critically, K_phen_acid also becomes capped — distinguishing resistance
//! from the normal "inactive at neutral pH only" phenotype.
//!
//! Sources:
//!   Mitchison 1979; Zhang et al. 2012; WHO TB guidelines 2024; Sarathy 2018

/// Maximum finite phenotypic barrier. Represents "drug is clinically inactive
/// in this environment" without propagating infinity through the pipeline.
/// log10(500): above MIC_ratio = 500×, drug has no clinical relevance.
pub const BINARY_HAMMER_CAP: f64 = 2.698_970_004_336_019; // log10(500)

/// The three Mitchison bacterial subpopulations in TB
#[derive(Debug, Clone, PartialEq)]
pub enum TbSubpopulation {
    /// Aerobic, pH 7, rapidly replicating — target of INH's early bactericidal activity
    Replicating,
    /// Acidic (pH ~5.5), semi-dormant — target of PZA's sterilizing activity
    SemiDormantAcidic,
    /// Hypoxic, non-replicating persisters — target of RIF, BDQ for relapse prevention
    DormantNrp,
}

/// Phenotypic MIC profile for one drug against each bacterial subpopulation
#[derive(Debug, Clone)]
pub struct PhenotypeProfile {
    pub drug_name: String,
    /// Standard MIC at neutral pH against replicating bacteria (µg/mL).
    /// None = drug is inactive at neutral pH and requires acidic activation (PZA).
    pub mic_standard: Option<f64>,
    /// Effective MIC in acidic environment (pH ~5.5) (µg/mL).
    pub mic_acidic: f64,
    /// Effective MIC against dormant/NRP bacteria (µg/mL).
    /// None = drug has no meaningful activity against dormant bacteria (EMB).
    pub mic_dormant: Option<f64>,
    /// If true, drug cannot activate at all (pncA mutation in PZA, or similar).
    /// K_phen = BINARY_HAMMER_CAP for ALL subpopulations including acidic.
    pub resistance_abolishes_activation: bool,
}

impl PhenotypeProfile {
    /// K_phenotype for a specific bacterial subpopulation.
    ///
    /// Returns BINARY_HAMMER_CAP when drug is inactive in that environment.
    /// All return values are finite — no f64::MAX propagates downstream.
    pub fn k_phenotype(&self, pop: &TbSubpopulation) -> f64 {
        if self.resistance_abolishes_activation {
            // pncA or equivalent: capped in ALL compartments, including acidic.
            // This distinguishes resistance from normal "inactive at neutral pH only".
            return BINARY_HAMMER_CAP;
        }
        match pop {
            TbSubpopulation::Replicating => {
                match self.mic_standard {
                    None => BINARY_HAMMER_CAP, // PZA: inactive at neutral pH
                    Some(_) => 0.0,            // standard MIC applies; K_phen = 0
                }
            }
            TbSubpopulation::SemiDormantAcidic => {
                match self.mic_standard {
                    None => {
                        // PZA: acidic is its native environment; K_phen_acid = 0
                        0.0
                    }
                    Some(mic_std) => {
                        // Real MIC ratio — may exceed BINARY_HAMMER_CAP for very poor drugs;
                        // that is valid biology and should not be silently capped.
                        (self.mic_acidic / mic_std).log10().max(0.0)
                    }
                }
            }
            TbSubpopulation::DormantNrp => {
                let base = match self.mic_standard {
                    Some(s) => s,
                    None => self.mic_acidic, // PZA: compare dormant MIC to acidic MIC
                };
                match self.mic_dormant {
                    None => BINARY_HAMMER_CAP, // EMB: no meaningful dormant activity
                    Some(mic_d) => {
                        // Real MIC ratio — log10(50/0.05)=3.0 for INH is correct, not capped
                        (mic_d / base).log10().max(0.0)
                    }
                }
            }
        }
    }

    /// Total weighted K_phenotype across all three subpopulations.
    ///
    /// K_phen_total = w_rep * K_phen_rep + w_acid * K_phen_acid + w_dorm * K_phen_dorm
    ///
    /// v2.2: always returns a finite value. Binary Hammer cap ensures capped
    /// per-compartment values sum correctly without infinity poisoning.
    pub fn k_phenotype_total(&self, w_rep: f64, w_acid: f64, w_dorm: f64) -> f64 {
        let k_rep  = self.k_phenotype(&TbSubpopulation::Replicating);
        let k_acid = self.k_phenotype(&TbSubpopulation::SemiDormantAcidic);
        let k_dorm = self.k_phenotype(&TbSubpopulation::DormantNrp);
        // All values finite by construction — straightforward weighted sum
        w_rep * k_rep + w_acid * k_acid + w_dorm * k_dorm
    }
}

// ---------------------------------------------------------------------------
// Published drug phenotype profiles
// MIC values: Mitchison 1979; Zhang et al. 2012; WHO 2024
// ---------------------------------------------------------------------------

pub fn isoniazid_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "isoniazid".into(),
        mic_standard: Some(0.05),
        mic_acidic: 0.50,
        mic_dormant: Some(50.0),
        resistance_abolishes_activation: false,
    }
}

pub fn rifampin_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "rifampin".into(),
        mic_standard: Some(0.20),
        mic_acidic: 0.50,
        mic_dormant: Some(2.0),
        resistance_abolishes_activation: false,
    }
}

/// PZA: mic_standard = None (inactive at neutral pH — requires acid activation).
/// In acidic environment (its native compartment): K_phen_acid = 0.
/// pncA resistance abolishes activation in ALL compartments including acidic.
pub fn pyrazinamide_phenotype(pza_resistant: bool) -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "pyrazinamide".into(),
        mic_standard: None,   // prodrug — inactive at neutral pH
        mic_acidic: 16.0,
        mic_dormant: Some(50.0),
        resistance_abolishes_activation: pza_resistant,
    }
}

pub fn ethambutol_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "ethambutol".into(),
        mic_standard: Some(2.0),
        mic_acidic: 8.0,
        mic_dormant: None, // no meaningful activity against dormant NRP bacteria
        resistance_abolishes_activation: false,
    }
}

pub fn moxifloxacin_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "moxifloxacin".into(),
        mic_standard: Some(0.25),
        mic_acidic: 0.50,
        mic_dormant: Some(4.0),
        resistance_abolishes_activation: false,
    }
}

pub fn bedaquiline_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "bedaquiline".into(),
        mic_standard: Some(0.03),
        mic_acidic: 0.06,
        mic_dormant: Some(0.25),
        resistance_abolishes_activation: false,
    }
}

pub fn linezolid_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "linezolid".into(),
        mic_standard: Some(0.50),
        mic_acidic: 1.0,
        mic_dormant: Some(8.0),
        resistance_abolishes_activation: false,
    }
}

// ---------------------------------------------------------------------------
// TDD — tests for Layer T3. Red before green: failing tests were written
// against the CORRECT spec behavior, then implementation was fixed to match.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    // T3-1: K_phenotype computed correctly for each drug × subpopulation
    #[test]
    fn test_k_phenotype_formula() {
        let inh = isoniazid_phenotype();
        // K_phen_acid = log10(0.50 / 0.05) = log10(10) = 1.0
        assert_relative_eq!(
            inh.k_phenotype(&TbSubpopulation::SemiDormantAcidic),
            1.0, epsilon = 1e-9
        );
        // K_phen_dorm = log10(50 / 0.05) = log10(1000) = 3.0
        assert_relative_eq!(
            inh.k_phenotype(&TbSubpopulation::DormantNrp),
            3.0, epsilon = 1e-9
        );
    }

    // T3-2: INH K_phen_dormant = 3.0 (highest of all drugs — terrible against dormant)
    #[test]
    fn test_inh_dormant_worst() {
        let inh = isoniazid_phenotype();
        assert_relative_eq!(inh.k_phenotype(&TbSubpopulation::DormantNrp), 3.0, epsilon = 1e-9);
    }

    // T3-3: RIF K_phen_dormant = 1.0 (moderate — retains activity)
    #[test]
    fn test_rif_dormant_moderate() {
        let rif = rifampin_phenotype();
        // log10(2.0 / 0.20) = log10(10) = 1.0
        assert_relative_eq!(rif.k_phenotype(&TbSubpopulation::DormantNrp), 1.0, epsilon = 1e-9);
    }

    // T3-4: PZA inactive against replicating bacteria → Binary Hammer cap (NOT f64::MAX)
    // v2.2 fix: was asserting f64::MAX which poisoned downstream pipeline math.
    // Correct: BINARY_HAMMER_CAP = log10(500) ≈ 2.699 — finite, combinable.
    #[test]
    fn test_pza_replicating_binary_hammer_cap() {
        let pza = pyrazinamide_phenotype(false);
        let k = pza.k_phenotype(&TbSubpopulation::Replicating);
        assert_relative_eq!(k, BINARY_HAMMER_CAP, epsilon = 1e-9);
        assert!(k.is_finite(), "PZA K_phen_rep must be finite (Binary Hammer cap, not f64::MAX)");
    }

    // T3-5: PZA active in acidic compartment (K_phen_acid = 0 — its native environment)
    #[test]
    fn test_pza_active_acidic() {
        let pza = pyrazinamide_phenotype(false);
        assert_relative_eq!(pza.k_phenotype(&TbSubpopulation::SemiDormantAcidic), 0.0, epsilon = 1e-9);
    }

    // T3-6: BDQ has lowest K_phen_dormant (best against non-replicating persisters)
    #[test]
    fn test_bdq_best_against_dormant() {
        let bdq = bedaquiline_phenotype();
        let rif = rifampin_phenotype();
        let inh = isoniazid_phenotype();
        let mxf = moxifloxacin_phenotype();
        let bdq_k = bdq.k_phenotype(&TbSubpopulation::DormantNrp);
        // BDQ K_dorm = log10(0.25/0.03) = log10(8.33) ≈ 0.921
        assert!(bdq_k < rif.k_phenotype(&TbSubpopulation::DormantNrp));
        assert!(bdq_k < inh.k_phenotype(&TbSubpopulation::DormantNrp));
        assert!(bdq_k < mxf.k_phenotype(&TbSubpopulation::DormantNrp));
    }

    // T3-7: PZA resistance (pncA) caps K = BINARY_HAMMER_CAP for ALL compartments —
    // including the ACIDIC compartment (key distinction from normal "inactive at pH7").
    // v2.2 fix: was asserting f64::MAX which saturated pipeline; now uses cap.
    #[test]
    fn test_pza_resistance_abolishes_all() {
        let pza_r = pyrazinamide_phenotype(true);
        assert_relative_eq!(pza_r.k_phenotype(&TbSubpopulation::Replicating),      BINARY_HAMMER_CAP, epsilon = 1e-9);
        assert_relative_eq!(pza_r.k_phenotype(&TbSubpopulation::SemiDormantAcidic), BINARY_HAMMER_CAP, epsilon = 1e-9);
        assert_relative_eq!(pza_r.k_phenotype(&TbSubpopulation::DormantNrp),        BINARY_HAMMER_CAP, epsilon = 1e-9);
    }

    // T3-8: PZA non-resistant vs resistant: acidic compartment distinguishes the two
    #[test]
    fn test_pza_resistant_vs_nonresistant_acidic_differs() {
        let pza = pyrazinamide_phenotype(false);
        let pza_r = pyrazinamide_phenotype(true);
        // Non-resistant: K_acid = 0 (drug active in its native compartment)
        assert_relative_eq!(pza.k_phenotype(&TbSubpopulation::SemiDormantAcidic), 0.0, epsilon = 1e-9);
        // Resistant: K_acid = CAP (abolished even in acidic)
        assert_relative_eq!(pza_r.k_phenotype(&TbSubpopulation::SemiDormantAcidic), BINARY_HAMMER_CAP, epsilon = 1e-9);
    }

    // T3-9: k_phenotype_total always returns finite value — no f64::MAX in pipeline
    #[test]
    fn test_k_phenotype_total_always_finite() {
        // PZA in a population with replicating weight > 0 (was the poison case)
        let pza = pyrazinamide_phenotype(false);
        let k = pza.k_phenotype_total(0.6, 0.3, 0.1);
        assert!(k.is_finite(), "k_phenotype_total must be finite, got {k}");
        // Resistant PZA — all compartments capped but still finite sum
        let pza_r = pyrazinamide_phenotype(true);
        let k_r = pza_r.k_phenotype_total(0.6, 0.3, 0.1);
        assert!(k_r.is_finite(), "Resistant PZA total must be finite, got {k_r}");
        assert_relative_eq!(k_r, BINARY_HAMMER_CAP * (0.6 + 0.3 + 0.1), epsilon = 1e-9);
    }

    // T3-10: Weighted K_phenotype higher for chronic disease (more dormant weightings)
    #[test]
    fn test_weighted_k_phen_chronic_vs_early() {
        let inh = isoniazid_phenotype();
        let k_early   = inh.k_phenotype_total(0.6, 0.3, 0.1);
        let k_chronic = inh.k_phenotype_total(0.2, 0.4, 0.4);
        assert!(k_chronic > k_early, "chronic k={k_chronic:.3} should exceed early k={k_early:.3}");
    }

    // T3-11: INH monotherapy total K_phenotype > 2.0 (insufficient for sterilization)
    #[test]
    fn test_inh_monotherapy_insufficient() {
        let inh = isoniazid_phenotype();
        let k = inh.k_phenotype_total(0.1, 0.3, 0.6);
        assert!(k > 2.0, "INH monotherapy K = {k:.3} should be > 2.0");
    }

    // T3-12: RIF has most balanced K profile across subpopulations (all finite and < 2.0)
    #[test]
    fn test_rif_balanced_profile() {
        let rif = rifampin_phenotype();
        let k_rep  = rif.k_phenotype(&TbSubpopulation::Replicating);
        let k_acid = rif.k_phenotype(&TbSubpopulation::SemiDormantAcidic);
        let k_dorm = rif.k_phenotype(&TbSubpopulation::DormantNrp);
        assert!(k_rep.is_finite()  && k_rep  < 2.0, "RIF rep K  = {k_rep:.3}");
        assert!(k_acid.is_finite() && k_acid < 2.0, "RIF acid K = {k_acid:.3}");
        assert!(k_dorm.is_finite() && k_dorm < 2.0, "RIF dorm K = {k_dorm:.3}");
    }
}
