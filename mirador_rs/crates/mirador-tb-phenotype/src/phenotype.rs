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
//! PZA special case: PZA is a prodrug that requires acidic conditions for
//! activation. At neutral pH it is essentially inactive (K_phen = ∞).
//! Against replicating bacteria at pH 7: K_phen_PZA = f64::MAX.
//!
//! PZA resistance: caused by pncA mutations abolishing pyrazinamidase.
//! NOT a MIC shift — PZA fails to activate entirely.
//! When pza_resistant = true: K_phen = f64::MAX for ALL subpopulations.
//!
//! Sources:
//!   Mitchison 1979; Zhang et al. 2012; WHO TB guidelines 2024

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
    /// Standard MIC at neutral pH against replicating bacteria (µg/mL)
    pub mic_standard: f64,
    /// Effective MIC in acidic environment (pH ~5.5) (µg/mL)
    /// f64::MAX = drug is inactive in this environment
    pub mic_acidic: f64,
    /// Effective MIC against dormant/NRP bacteria (µg/mL)
    pub mic_dormant: f64,
    /// If true, drug cannot activate (pncA mutation in PZA, or similar).
    /// All K_phenotype values become f64::MAX.
    pub resistance_abolishes_activation: bool,
}

impl PhenotypeProfile {
    /// K_phenotype for a specific bacterial subpopulation.
    ///
    /// For the replicating population: K_phen = 0 (standard MIC applies).
    /// Returns f64::MAX when drug is inactive in that environment.
    pub fn k_phenotype(&self, pop: &TbSubpopulation) -> f64 {
        if self.resistance_abolishes_activation {
            return f64::MAX;
        }
        match pop {
            TbSubpopulation::Replicating => {
                // Standard MIC applies; K_phen = 0 for replicating populations
                // PZA special case: inactive at neutral pH
                if self.mic_standard == f64::MAX {
                    f64::MAX
                } else {
                    0.0
                }
            }
            TbSubpopulation::SemiDormantAcidic => {
                if self.mic_acidic == f64::MAX { return f64::MAX; }
                if self.mic_standard == f64::MAX {
                    // PZA: no standard MIC → K_phen_acid is 0 (acidic is its native environment)
                    return 0.0;
                }
                (self.mic_acidic / self.mic_standard).log10().max(0.0)
            }
            TbSubpopulation::DormantNrp => {
                if self.mic_dormant == f64::MAX { return f64::MAX; }
                let base = if self.mic_standard == f64::MAX {
                    self.mic_acidic // PZA: compare to acidic MIC
                } else {
                    self.mic_standard
                };
                if base == f64::MAX { return f64::MAX; }
                (self.mic_dormant / base).log10().max(0.0)
            }
        }
    }

    /// Total weighted K_phenotype across all three subpopulations.
    ///
    /// K_phen_total = w_rep * K_phen_rep + w_acid * K_phen_acid + w_dorm * K_phen_dorm
    ///
    /// If any term involves f64::MAX (inactive), saturates to f64::MAX.
    pub fn k_phenotype_total(&self, w_rep: f64, w_acid: f64, w_dorm: f64) -> f64 {
        let k_rep  = self.k_phenotype(&TbSubpopulation::Replicating);
        let k_acid = self.k_phenotype(&TbSubpopulation::SemiDormantAcidic);
        let k_dorm = self.k_phenotype(&TbSubpopulation::DormantNrp);

        // If weighted into an inactive compartment, saturate
        if (w_rep > 0.0 && k_rep == f64::MAX)
            || (w_acid > 0.0 && k_acid == f64::MAX)
            || (w_dorm > 0.0 && k_dorm == f64::MAX)
        {
            return f64::MAX;
        }
        let k_rep_c  = if k_rep  == f64::MAX { 0.0 } else { k_rep  };
        let k_acid_c = if k_acid == f64::MAX { 0.0 } else { k_acid };
        let k_dorm_c = if k_dorm == f64::MAX { 0.0 } else { k_dorm };
        w_rep * k_rep_c + w_acid * k_acid_c + w_dorm * k_dorm_c
    }
}

// ---------------------------------------------------------------------------
// Published drug phenotype profiles
// MIC values: Mitchison 1979; Zhang et al. 2012; WHO 2024
// ---------------------------------------------------------------------------

pub fn isoniazid_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "isoniazid".into(),
        mic_standard: 0.05,
        mic_acidic: 0.50,
        mic_dormant: 50.0,
        resistance_abolishes_activation: false,
    }
}

pub fn rifampin_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "rifampin".into(),
        mic_standard: 0.20,
        mic_acidic: 0.50,
        mic_dormant: 2.0,
        resistance_abolishes_activation: false,
    }
}

/// PZA: mic_standard = f64::MAX (inactive at neutral pH)
/// Acidic MIC = 16 µg/mL; dormant MIC = 50 µg/mL
pub fn pyrazinamide_phenotype(pza_resistant: bool) -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "pyrazinamide".into(),
        mic_standard: f64::MAX,  // inactive at pH 7
        mic_acidic: 16.0,
        mic_dormant: 50.0,
        resistance_abolishes_activation: pza_resistant, // pncA mutation → no activation
    }
}

pub fn ethambutol_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "ethambutol".into(),
        mic_standard: 2.0,
        mic_acidic: 8.0,
        mic_dormant: f64::MAX, // essentially inactive against dormant bacteria
        resistance_abolishes_activation: false,
    }
}

pub fn moxifloxacin_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "moxifloxacin".into(),
        mic_standard: 0.25,
        mic_acidic: 0.50,
        mic_dormant: 4.0,
        resistance_abolishes_activation: false,
    }
}

pub fn bedaquiline_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "bedaquiline".into(),
        mic_standard: 0.03,
        mic_acidic: 0.06,
        mic_dormant: 0.25,
        resistance_abolishes_activation: false,
    }
}

pub fn linezolid_phenotype() -> PhenotypeProfile {
    PhenotypeProfile {
        drug_name: "linezolid".into(),
        mic_standard: 0.50,
        mic_acidic: 1.0,
        mic_dormant: 8.0,
        resistance_abolishes_activation: false,
    }
}

// ---------------------------------------------------------------------------
// TDD — 10 tests matching spec Layer T3
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

    // T3-4: PZA is inactive against replicating bacteria (K = MAX)
    #[test]
    fn test_pza_inactive_replicating() {
        let pza = pyrazinamide_phenotype(false);
        assert_eq!(pza.k_phenotype(&TbSubpopulation::Replicating), f64::MAX);
    }

    // T3-5: PZA active in acidic compartment (K_phen_acid = 0 — it's the reference)
    #[test]
    fn test_pza_active_acidic() {
        let pza = pyrazinamide_phenotype(false);
        let k = pza.k_phenotype(&TbSubpopulation::SemiDormantAcidic);
        assert!(k.is_finite(), "PZA K_phen_acid should be finite (not MAX)");
    }

    // T3-6: BDQ has lowest K_phen_dormant (best against non-replicating persisters)
    #[test]
    fn test_bdq_best_against_dormant() {
        let bdq = bedaquiline_phenotype();
        let rif = rifampin_phenotype();
        let inh = isoniazid_phenotype();
        let mxf = moxifloxacin_phenotype();
        let bdq_k = bdq.k_phenotype(&TbSubpopulation::DormantNrp);
        // BDQ K_dorm = log10(0.25/0.03) = log10(8.33) ≈ 0.92
        assert!(bdq_k < rif.k_phenotype(&TbSubpopulation::DormantNrp));
        assert!(bdq_k < inh.k_phenotype(&TbSubpopulation::DormantNrp));
        assert!(bdq_k < mxf.k_phenotype(&TbSubpopulation::DormantNrp));
    }

    // T3-7: PZA resistance (pncA) sets K = MAX for ALL compartments
    #[test]
    fn test_pza_resistance_abolishes_all() {
        let pza_r = pyrazinamide_phenotype(true);
        assert_eq!(pza_r.k_phenotype(&TbSubpopulation::Replicating),    f64::MAX);
        assert_eq!(pza_r.k_phenotype(&TbSubpopulation::SemiDormantAcidic), f64::MAX);
        assert_eq!(pza_r.k_phenotype(&TbSubpopulation::DormantNrp),     f64::MAX);
    }

    // T3-8: Weighted K_phenotype higher for chronic disease (more dormant weightings)
    #[test]
    fn test_weighted_k_phen_chronic_vs_early() {
        let inh = isoniazid_phenotype();
        // Early: (0.6, 0.3, 0.1)
        let k_early = inh.k_phenotype_total(0.6, 0.3, 0.1);
        // Chronic: (0.2, 0.4, 0.4)
        let k_chronic = inh.k_phenotype_total(0.2, 0.4, 0.4);
        assert!(k_chronic > k_early);
    }

    // T3-9: INH monotherapy total K_phenotype > 2.0 (insufficient for sterilization)
    // Heavy-dormant weighting (0.1 rep, 0.3 acidic, 0.6 dormant) to model late-disease;
    // INH MIC_dormant >> MIC_standard → K_dorm = log10(50/0.05) = 3.0, total = 2.1 > 2.0
    #[test]
    fn test_inh_monotherapy_insufficient() {
        let inh = isoniazid_phenotype();
        let k = inh.k_phenotype_total(0.1, 0.3, 0.6);
        assert!(k > 2.0, "INH monotherapy K should be > 2.0, got {:.3}", k);
    }

    // T3-10: RIF has most balanced K profile across subpopulations
    #[test]
    fn test_rif_balanced_profile() {
        let rif = rifampin_phenotype();
        let k_rep  = rif.k_phenotype(&TbSubpopulation::Replicating);
        let k_acid = rif.k_phenotype(&TbSubpopulation::SemiDormantAcidic);
        let k_dorm = rif.k_phenotype(&TbSubpopulation::DormantNrp);
        // All three should be finite and moderate (< 2.0)
        assert!(k_rep.is_finite() && k_rep < 2.0);
        assert!(k_acid.is_finite() && k_acid < 2.0);
        assert!(k_dorm.is_finite() && k_dorm < 2.0);
    }
}
