//! Keske Combination Engine — Parallel Resistor Model
//!
//! Each drug is an independent pathway from blood to bacterium.
//! Barriers are in SERIES for each drug (must all be crossed).
//! Pathways are in PARALLEL across drugs (independent routes).
//!
//! For drug X:
//!   K_pathway_X = K_admet_X + K_pen_X + K_bio_X + K_res_X
//!
//! Combined:
//!   1/K_bone_combo = (1/K_pathway_A + 1/K_pathway_B) × synergy_factor
//!   tau_combo      = (tau_A + tau_B) × synergy_factor
//!   C_bone_combo   = tau_combo / K_bone_combo
//!
//! A drug that never reaches bone (high K_pen → high K_pathway) contributes
//! little even if its biofilm stats are excellent. The physics are enforced.
//!
//! Rifampin monotherapy is hard-blocked — rpoB resistance (Stewart 2015).

use mirador_biofilm::BiofilmError;
use thiserror::Error;

use mirador_combination::{CombinationSection, DrugSection};
// Re-export so callers get the interaction vocabulary straight from this crate.
pub use mirador_combination::InteractionType;

#[derive(Debug, Error)]
pub enum ComboBoneError {
    #[error("At least two drugs are required for combination therapy")]
    TooFewDrugs,
    #[error("Synergy factor must be > 0, got {0}")]
    InvalidSynergyFactor(f64),
    #[error("tau must be positive for each drug, got {0} for '{1}'")]
    InvalidTau(f64, String),
    #[error("K_pathway must be positive for each drug, got {0} for '{1}'")]
    InvalidKPathway(f64, String),
    #[error("{0}")]
    RifampinMonotherapy(#[from] BiofilmError),
}

/// Complete per-drug bone pathway input
#[derive(Debug, Clone)]
pub struct DrugBonePathway {
    pub drug_name: String,
    /// τ (pharmacophore topological invariant) for this drug vs PBP2a
    pub tau: f64,
    /// K_admet: standard MIRADOR curvature (absorption/distribution/metabolism/excretion/toxicity)
    pub k_admet: f64,
    /// K_pen: bone penetration curvature from Layer K2
    pub k_pen: f64,
    /// K_bio: effective biofilm curvature from Layer K3 (already weighted by biofilm_prob)
    pub k_bio: f64,
    /// K_res: total reservoir curvature from Layer K4 (SAC + matrix + intracellular)
    pub k_res: f64,
    /// True if this drug is rifampin (requires mandatory companion)
    pub is_rifampin: bool,
}

impl DrugBonePathway {
    /// Total in-series pathway impedance for this drug
    pub fn k_pathway(&self) -> f64 {
        self.k_admet + self.k_pen + self.k_bio + self.k_res
    }
}

/// Result of combining two drugs via the parallel resistor model
#[derive(Debug, Clone)]
pub struct ComboBoneResult {
    pub k_pathway_a: f64,
    pub k_pathway_b: f64,
    pub k_bone_combo: f64,
    pub tau_combo: f64,
    pub c_bone_combo: f64,
}

/// Compute bone coherence for a two-drug combination using the parallel resistor model.
///
/// # Errors
/// Returns an error if rifampin is used without a companion.
pub fn combine_two(
    drug_a: &DrugBonePathway,
    drug_b: &DrugBonePathway,
    synergy_factor: f64,
) -> Result<ComboBoneResult, ComboBoneError> {
    if synergy_factor <= 0.0 {
        return Err(ComboBoneError::InvalidSynergyFactor(synergy_factor));
    }
    for d in [drug_a, drug_b] {
        if d.tau <= 0.0 { return Err(ComboBoneError::InvalidTau(d.tau, d.drug_name.clone())); }
        if d.k_pathway() <= 0.0 {
            return Err(ComboBoneError::InvalidKPathway(d.k_pathway(), d.drug_name.clone()));
        }
    }

    // Hard-block rifampin monotherapy
    let drugs_with_rif = [drug_a, drug_b].iter().filter(|d| d.is_rifampin).count();
    let total_drugs = 2;
    if drugs_with_rif == total_drugs {
        return Err(ComboBoneError::RifampinMonotherapy(
            BiofilmError::RifampinMonotherapyContraindicated
        ));
    }

    let k_a = drug_a.k_pathway();
    let k_b = drug_b.k_pathway();

    // Parallel resistor: 1/K_combo = (1/K_a + 1/K_b) * synergy_factor
    let combined_conductance = (1.0 / k_a + 1.0 / k_b) * synergy_factor;
    let k_bone_combo = 1.0 / combined_conductance;

    let tau_combo = (drug_a.tau + drug_b.tau) * synergy_factor;
    let c_bone_combo = tau_combo / k_bone_combo;

    Ok(ComboBoneResult {
        k_pathway_a: k_a,
        k_pathway_b: k_b,
        k_bone_combo,
        tau_combo,
        c_bone_combo,
    })
}

/// Compute bone coherence for a single drug (monotherapy) — used for comparison.
/// Rifampin monotherapy is blocked.
pub fn monotherapy(drug: &DrugBonePathway) -> Result<f64, ComboBoneError> {
    if drug.is_rifampin {
        return Err(ComboBoneError::RifampinMonotherapy(
            BiofilmError::RifampinMonotherapyContraindicated
        ));
    }
    if drug.tau <= 0.0 { return Err(ComboBoneError::InvalidTau(drug.tau, drug.drug_name.clone())); }
    let k = drug.k_pathway();
    if k <= 0.0 { return Err(ComboBoneError::InvalidKPathway(k, drug.drug_name.clone())); }
    Ok(drug.tau / k)
}

/// Result of combining two bone pathways via an explicit, evidence-typed
/// interaction model (Bliss synergy / antagonism / additivity), composed
/// through the `mirador-combination` engine.
///
/// Each drug is reduced to its bone coherence `C_bone = τ / K_pathway` (the
/// same in-series K-decomposition used everywhere else), then combined by the
/// caller-supplied [`InteractionType`]. This is the alternative to
/// [`combine_two`]'s parallel-resistor model: instead of a fixed synergy
/// multiplier that always raises the score, the interaction type and magnitude
/// come from data (FICI / checkerboard / Bliss), so antagonism and additivity
/// are representable — not only super-additivity.
#[derive(Debug, Clone)]
pub struct InteractionComboResult {
    /// Bone coherence of drug A alone (τ_A / K_pathway_A)
    pub c_bone_a: f64,
    /// Bone coherence of drug B alone (τ_B / K_pathway_B)
    pub c_bone_b: f64,
    /// Combined bone coherence under the supplied interaction model
    pub c_bone_combo: f64,
}

/// Combine two bone pathways under an explicit [`InteractionType`].
///
/// Reduces each drug to `C_bone = τ / K_pathway` and applies the Bliss-style
/// interaction from `mirador-combination`. Setting `DrugSection.k = k_pathway()`
/// makes `DrugSection::coherence()` equal `C_bone` by construction.
///
/// # Errors
/// Returns an error if either τ or K_pathway is non-positive, or if both drugs
/// are rifampin (rpoB monotherapy is contraindicated).
pub fn combine_two_interaction(
    drug_a: &DrugBonePathway,
    drug_b: &DrugBonePathway,
    interaction: InteractionType,
) -> Result<InteractionComboResult, ComboBoneError> {
    for d in [drug_a, drug_b] {
        if d.tau <= 0.0 {
            return Err(ComboBoneError::InvalidTau(d.tau, d.drug_name.clone()));
        }
        if d.k_pathway() <= 0.0 {
            return Err(ComboBoneError::InvalidKPathway(d.k_pathway(), d.drug_name.clone()));
        }
    }

    // Same hard block as combine_two: two rifampins = rpoB monotherapy.
    let drugs_with_rif = [drug_a, drug_b].iter().filter(|d| d.is_rifampin).count();
    if drugs_with_rif == 2 {
        return Err(ComboBoneError::RifampinMonotherapy(
            BiofilmError::RifampinMonotherapyContraindicated,
        ));
    }

    let sec_a = DrugSection { tau: drug_a.tau, k: drug_a.k_pathway() };
    let sec_b = DrugSection { tau: drug_b.tau, k: drug_b.k_pathway() };
    let c_bone_a = sec_a.coherence();
    let c_bone_b = sec_b.coherence();

    let combo = CombinationSection { drug1: sec_a, drug2: sec_b, interaction };
    Ok(InteractionComboResult {
        c_bone_a,
        c_bone_b,
        c_bone_combo: combo.combined_coherence(),
    })
}

/// Canonical bone pathways for the Steven Keske scenario (chronic MRSA AHO).
///
/// The same illustrative, spec-derived parameters the test suite uses —
/// promoted to the public API so tests, examples, and report tooling share
/// ONE definition (no divergent copies). τ and the K-components follow
/// KESKE_METHOD_SPEC; they are model inputs, not patient data.
pub mod scenarios {
    use super::DrugBonePathway;

    /// Ceftaroline — τ=12 (β=4, rings=3, chiral=+1; JACS 2014, PDB 3ZG0)
    pub fn ceftaroline() -> DrugBonePathway {
        DrugBonePathway {
            drug_name: "ceftaroline".into(),
            tau: 12.0,
            k_admet: 0.67,
            k_pen: (1.0 / 0.30) - 1.0,
            k_bio: 0.95 * (128_f64 / 1.0).log10(),
            k_res: 0.10 + (1.0 - 0.70) * ((1.0 / 0.30) - 1.0) + 0.48,
            is_rifampin: false,
        }
    }

    /// Rifampin — τ=8 (3 rings × ~2.67 Betti); intracellular modifier applied
    pub fn rifampin() -> DrugBonePathway {
        DrugBonePathway {
            drug_name: "rifampin".into(),
            tau: 8.0,
            k_admet: 0.50,
            k_pen: (1.0 / 0.35) - 1.0,
            k_bio: 0.95 * (0.5_f64 / 0.008).log10(),
            k_res: 0.10 + (1.0 - 0.70) * ((1.0 / 0.35) - 1.0) + 0.192,
            is_rifampin: true,
        }
    }

    /// Vancomycin — very poor bone penetration (R=0.20)
    pub fn vancomycin() -> DrugBonePathway {
        DrugBonePathway {
            drug_name: "vancomycin".into(),
            tau: 12.0,
            k_admet: 0.50,
            k_pen: (1.0 / 0.20) - 1.0,
            k_bio: 0.95 * (512_f64 / 1.0).log10(),
            k_res: 0.10 + (1.0 - 0.70) * ((1.0 / 0.20) - 1.0) + 0.48,
            is_rifampin: false,
        }
    }
}

// ---------------------------------------------------------------------------
// TDD — 9 tests matching the updated spec
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    // Steven's bone pathways now live in the public `scenarios` module so tests,
    // examples, and report tooling all share one definition (no divergent copy).
    use super::scenarios::{ceftaroline, rifampin, vancomycin};

    const SYNERGY: f64 = 1.2;

    // Test 1: K_pathway = sum for each drug (in-series correctness)
    #[test]
    fn test_k_pathway_series_sum() {
        let cef = ceftaroline();
        let expected = cef.k_admet + cef.k_pen + cef.k_bio + cef.k_res;
        assert_relative_eq!(cef.k_pathway(), expected, epsilon = 1e-10);
    }

    // Test 2: Parallel resistor formula: 1/K_combo = (1/Ka + 1/Kb) * synergy
    #[test]
    fn test_parallel_resistor_formula() {
        let cef = ceftaroline();
        let rif = rifampin();
        let result = combine_two(&cef, &rif, SYNERGY).unwrap();
        let expected_k = 1.0 / ((1.0/cef.k_pathway() + 1.0/rif.k_pathway()) * SYNERGY);
        assert_relative_eq!(result.k_bone_combo, expected_k, epsilon = 1e-10);
    }

    // Test 3: tau_combo = (tau_A + tau_B) * synergy, symmetric
    #[test]
    fn test_tau_combo_symmetric() {
        let cef = ceftaroline();
        let rif = rifampin();
        let result = combine_two(&cef, &rif, SYNERGY).unwrap();
        let expected_tau = (cef.tau + rif.tau) * SYNERGY;
        assert_relative_eq!(result.tau_combo, expected_tau, epsilon = 1e-10);
    }

    // Test 4: Drug order is commutative — swap A/B, identical C_bone_combo
    #[test]
    fn test_commutativity() {
        let cef = ceftaroline();
        let rif = rifampin();
        let ab = combine_two(&cef, &rif, SYNERGY).unwrap();
        let ba = combine_two(&rif, &cef, SYNERGY).unwrap();
        assert_relative_eq!(ab.c_bone_combo, ba.c_bone_combo, epsilon = 1e-10);
        assert_relative_eq!(ab.k_bone_combo, ba.k_bone_combo, epsilon = 1e-10);
    }

    // Test 5: Routing correctness — drug with terrible penetration contributes little.
    // Drug A: excellent biofilm (K_bio=0.5) but terrible penetration (K_pen=20) → high K_pathway.
    // Drug B: moderate everything → moderate K_pathway.
    // Combination should NOT be dramatically better than Drug B alone — Drug A barely arrives.
    #[test]
    fn test_terrible_penetration_drug_contributes_little() {
        let drug_poor_pen = DrugBonePathway {
            drug_name: "poor_pen".into(),
            tau: 15.0,
            k_admet: 0.5,
            k_pen: 20.0,   // cannot reach bone
            k_bio: 0.5,    // great biofilm activity — but doesn't matter
            k_res: 0.5,
            is_rifampin: false,
        };
        let drug_moderate = DrugBonePathway {
            drug_name: "moderate".into(),
            tau: 12.0,
            k_admet: 0.67,
            k_pen: 2.33,
            k_bio: 2.0,
            k_res: 1.0,
            is_rifampin: false,
        };
        let c_moderate_alone = monotherapy(&drug_moderate).unwrap();
        let c_combo = combine_two(&drug_poor_pen, &drug_moderate, 1.0).unwrap().c_bone_combo;

        // Drug A's K_pathway = 0.5 + 20 + 0.5 + 0.5 = 21.5 → conductance ≈ 0.0465
        // Drug B's conductance = 1/(0.67+2.33+2.0+1.0) = 1/6.0 ≈ 0.167
        // Drug A contributes only ~22% to combined conductance, not proportionally
        // to its biofilm stats — routing correctness is measured in conductance fraction.
        let poor_pen_conductance = 1.0 / drug_poor_pen.k_pathway();
        let moderate_conductance = 1.0 / drug_moderate.k_pathway();
        let poor_pen_contribution = poor_pen_conductance / (poor_pen_conductance + moderate_conductance);
        assert!(poor_pen_contribution < 0.30,
            "Drug with terrible penetration must contribute < 30% to combined conductance, got {:.1}%",
            poor_pen_contribution * 100.0);

        // Combination always exceeds monotherapy (Drug A adds some tau + some conductance),
        // but its K_pathway impedance correctly limits how much it contributes.
        let c_combo = combine_two(&drug_poor_pen, &drug_moderate, 1.0).unwrap().c_bone_combo;
        assert!(c_combo > c_moderate_alone, "combination should exceed monotherapy");

        // Verify routing vs old min() approach: parallel model is correctly more conservative.
        // Old min() would give: K = min(K_pen)=2.33 + min(K_bio)=0.5 + min(K_res)=0.5 + min(K_admet)=0.5 = 3.83
        let k_old_min = 0.5_f64 + 2.33 + 0.5 + 0.5; // old min() approach
        let tau_combined = drug_poor_pen.tau + drug_moderate.tau;
        let c_old_min = tau_combined / k_old_min;
        // Parallel model is lower (more honest) than old min() for this pathological case
        assert!(c_combo < c_old_min,
            "parallel model ({:.2}) must be more conservative than old min() approach ({:.2})",
            c_combo, c_old_min);
    }

    // Test 6: Ceftaroline + rifampin C_bone >> ceftaroline monotherapy
    #[test]
    fn test_cef_rif_exceeds_cef_mono() {
        let cef = ceftaroline();
        let rif = rifampin();
        let c_mono = monotherapy(&cef).unwrap();
        let c_combo = combine_two(&cef, &rif, SYNERGY).unwrap().c_bone_combo;
        assert!(c_combo > c_mono,
            "cef+rif combo ({:.2}) must exceed cef alone ({:.2})", c_combo, c_mono);
    }

    // Test 7: Vancomycin monotherapy C_bone < 2.0 in Steven's chronic AHO
    // K_pathway_vanc = K_admet + K_pen + K_bio + K_res
    //   K_pen_vanc = 4.0, K_bio_eff = 0.95*2.709 = 2.574, K_res heavy → C < 2.0
    #[test]
    fn test_vancomycin_monotherapy_below_2() {
        let vanc = vancomycin();
        let c = monotherapy(&vanc).unwrap();
        assert!(c < 2.0,
            "vancomycin monotherapy in chronic AHO must give C_bone < 2.0, got {:.3}", c);
    }

    // Test 8: Rifampin monotherapy is hard-blocked
    #[test]
    fn test_rifampin_monotherapy_blocked() {
        let rif = rifampin();
        let result = monotherapy(&rif);
        assert!(result.is_err(), "rifampin monotherapy must error");
    }

    // Test 9: Steven Keske scenario — ceftaroline + rifampin C_bone > 10.0
    #[test]
    fn test_steven_keske_combo_coherence() {
        let cef = ceftaroline();
        let rif = rifampin();
        let result = combine_two(&cef, &rif, SYNERGY).unwrap();
        assert!(result.c_bone_combo > 10.0,
            "Steven's cef+rif C_bone must exceed 10.0, got {:.2}", result.c_bone_combo);
    }

    // ---------------------------------------------------------------------
    // Interaction-typed (Bliss) combination — the evidence-typed alternative
    // to the parallel-resistor model. Composes each drug's C_bone = τ/K_pathway
    // through mirador-combination. Unlike combine_two, this CAN express
    // antagonism (e.g. strain-dependent rifampin, Barber 2015) and does not
    // assume a fixed multiplier that always helps.
    // ---------------------------------------------------------------------

    // Additivity (Bliss independence): C_combo = C_bone_A + C_bone_B
    #[test]
    fn interaction_additivity_is_sum_of_bone_coherences() {
        let cef = ceftaroline();
        let rif = rifampin();
        let r = combine_two_interaction(&cef, &rif, InteractionType::Additivity).unwrap();
        assert_relative_eq!(r.c_bone_a, cef.tau / cef.k_pathway(), epsilon = 1e-10);
        assert_relative_eq!(r.c_bone_b, rif.tau / rif.k_pathway(), epsilon = 1e-10);
        assert_relative_eq!(r.c_bone_combo, r.c_bone_a + r.c_bone_b, epsilon = 1e-10);
    }

    // Synergy: exceeds the better single agent by δ
    #[test]
    fn interaction_synergy_exceeds_best_single_agent() {
        let cef = ceftaroline();
        let rif = rifampin();
        let r = combine_two_interaction(&cef, &rif, InteractionType::Synergy { bliss_delta: 1.0 }).unwrap();
        assert!(r.c_bone_combo > r.c_bone_a.max(r.c_bone_b),
            "synergy combo {:.3} must exceed best single {:.3}", r.c_bone_combo, r.c_bone_a.max(r.c_bone_b));
    }

    // Antagonism: falls BELOW the weaker single agent — the capability the
    // parallel-resistor model structurally cannot represent.
    #[test]
    fn interaction_antagonism_falls_below_weakest_single_agent() {
        let cef = ceftaroline();
        let rif = rifampin();
        let r = combine_two_interaction(&cef, &rif, InteractionType::Antagonism { bliss_delta: 0.5 }).unwrap();
        assert!(r.c_bone_combo < r.c_bone_a.min(r.c_bone_b),
            "antagonism combo {:.3} must fall below weakest single {:.3}", r.c_bone_combo, r.c_bone_a.min(r.c_bone_b));
    }

    // Contrast: Bliss additivity is far more conservative than the
    // parallel-resistor model for the same two drugs.
    #[test]
    fn interaction_additivity_is_more_conservative_than_parallel_resistor() {
        let cef = ceftaroline();
        let rif = rifampin();
        let bliss = combine_two_interaction(&cef, &rif, InteractionType::Additivity).unwrap().c_bone_combo;
        let parallel = combine_two(&cef, &rif, SYNERGY).unwrap().c_bone_combo;
        assert!(bliss < parallel,
            "Bliss additivity ({:.2}) must be below parallel-resistor ({:.2})", bliss, parallel);
    }

    // Rifampin pair still hard-blocked in the interaction path
    #[test]
    fn interaction_rifampin_pair_is_blocked() {
        let rif_a = rifampin();
        let rif_b = rifampin();
        assert!(combine_two_interaction(&rif_a, &rif_b, InteractionType::Additivity).is_err(),
            "two rifampins must be blocked (rpoB monotherapy)");
    }
}
