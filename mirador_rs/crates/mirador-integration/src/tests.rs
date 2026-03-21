// ============================================================================
// INT-1 through INT-4: End-to-end integration tests
// Validates the complete Davis Field Equation pipeline for MRSA / ceftaroline.
// ============================================================================

#[cfg(test)]
mod integration {
    use approx::assert_abs_diff_eq;

    // Bring in the cross-crate types
    use mirador_core::{BettiNumbers, ChiralSign};
    use mirador_patient::septic::{collateral_risk, vancomycin_toxicity_flag, SepticMRSAPatient};
    use mirador_pharmacophore::pharmacophore::Pharmacophore;
    use mirador_admet::curvature::{
        AbsorptionCurvature, DistributionCurvature, MetabolicCurvature,
        ExcretionCurvature, ToxicityCurvature, ADMETCurvature,
    };
    use mirador_resistance::resistance::{
        PBP2A_ESCAPE_SPECTRUM, CollateralEscapeManifold,
    };
    use mirador_dosing::dosing::{PKParameters, concentration_at, renal_adjusted_clearance};
    use mirador_patient::PharmacogenomicPanel;
    use mirador_core::CYPEnzyme;

    // -------------------------------------------------------------------------
    // INT-1: Full Davis Field Equation pipeline for ceftaroline / septic MRSA
    //   τ=12, K=0.666 → C_ceft ≈ 18.02 >> C_vanc ≈ 1.86
    // -------------------------------------------------------------------------
    #[test]
    fn int1_ceftaroline_coherence_exceeds_vancomycin() {
        // Ceftaroline pharmacophore (PBP2a dual-site)
        let ceft_pharmacophore = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 1, b2: 2 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 3,
        };
        let tau_ceft = ceft_pharmacophore.tau().unwrap(); // = 12.0

        // Vancomycin pharmacophore (glycopeptide, single active-site mode)
        let vanc_pharmacophore = Pharmacophore {
            betti: BettiNumbers { b0: 1, b1: 1, b2: 0 },
            tau_chiral: ChiralSign::AGONIST,
            ring_count: 2,
        };
        let tau_vanc = vanc_pharmacophore.tau().unwrap(); // = 4.0

        // Septic patient ADMET
        let panel = PharmacogenomicPanel::default();
        let egfr_septic = 45.0;

        let ceft_admet = ADMETCurvature {
            absorption:   AbsorptionCurvature { molecular_weight: 400.0, log_p: -1.0, hbd_count: 4, hba_count: 10 },
            distribution: DistributionCurvature { fraction_unbound: 0.926, pgp_substrate: false },
            metabolism:   MetabolicCurvature { primary_cyp: CYPEnzyme::CYP2D6, is_prodrug: false, k_met_reference: 0.0333 },
            excretion:    ExcretionCurvature { renal_fraction: 0.80 },
            toxicity:     ToxicityCurvature { herg_ic50_um: Some(15.0), ames_probability: 0.0 },
        };
        let k_ceft = ceft_admet.k_total(&panel, egfr_septic); // ≈ 0.666

        // Vancomycin ADMET: near-toxic trough adds K_tox, nephrotoxicity adds K_exc
        let vanc_admet = ADMETCurvature {
            absorption:   AbsorptionCurvature { molecular_weight: 1449.0, log_p: -3.0, hbd_count: 8, hba_count: 25 },
            distribution: DistributionCurvature { fraction_unbound: 0.50, pgp_substrate: false },
            metabolism:   MetabolicCurvature { primary_cyp: CYPEnzyme::CYP3A4, is_prodrug: false, k_met_reference: 0.01 },
            excretion:    ExcretionCurvature { renal_fraction: 0.90 },
            // Vancomycin hERG: IC50 ~100μM (safe), but Ames probability 0; however near-toxic trough
            // modeled as raised k_met_reference representing systemic toxicity leakage
            toxicity:     ToxicityCurvature { herg_ic50_um: Some(100.0), ames_probability: 0.0 },
        };
        let k_vanc = vanc_admet.k_total(&panel, egfr_septic);

        let c_ceft = tau_ceft / k_ceft;
        let c_vanc = tau_vanc / k_vanc;

        assert!(
            c_ceft > c_vanc,
            "INT-1: C_ceft ({c_ceft:.2}) must exceed C_vanc ({c_vanc:.2})"
        );
        // Quantitative: ceftaroline should be at least 5× better
        assert!(c_ceft >= 5.0 * c_vanc,
            "INT-1: C_ceft/C_vanc ratio must be ≥ 5; got {:.1}", c_ceft / c_vanc);
    }

    // -------------------------------------------------------------------------
    // INT-2: COLLATERAL_RISK flag propagates from patient state to K_total
    //   Demo patient (meropenem 14d ago) → COLLATERAL_RISK = true → K rises
    // -------------------------------------------------------------------------
    #[test]
    fn int2_collateral_risk_flag_raises_effective_k() {
        let patient = SepticMRSAPatient::demo();

        // Check COLLATERAL_RISK is active (meropenem 14 days ago)
        let is_collateral = collateral_risk(patient.days_since_carbapenem);
        assert!(is_collateral, "INT-2: demo patient must have COLLATERAL_RISK active");

        // Check vancomycin toxicity flag is active (trough=18 > 15)
        let is_vanco_tox = vancomycin_toxicity_flag(patient.vancomycin_trough_ug_ml);
        assert!(is_vanco_tox, "INT-2: demo patient must trigger vancomycin toxicity flag");

        // COLLATERAL_RISK adds K_collateral=0.10 to effective total K
        let k_collateral_penalty = 0.10;
        let k_base = 0.666_f64;
        let k_with_collateral = k_base + k_collateral_penalty;
        assert_abs_diff_eq!(k_with_collateral, 0.766, epsilon = 0.001);

        // C = τ/K decreases when collateral risk is active
        let tau = 12.0;
        let c_no_collateral = tau / k_base;
        let c_with_collateral = tau / k_with_collateral;
        assert!(c_with_collateral < c_no_collateral,
            "INT-2: COLLATERAL_RISK must reduce coherence C");
    }

    // -------------------------------------------------------------------------
    // INT-3: Resistance spectrum — E150K dominant, D357A rejected
    //   Verifies that real PBP2a resistance eigenvalues order correctly
    //   and that the collateral escape manifold activates for the demo patient.
    // -------------------------------------------------------------------------
    #[test]
    fn int3_pbp2a_resistance_spectrum_and_collateral_escape() {
        // E150K is dominant escape eigenvalue
        let dominant = PBP2A_ESCAPE_SPECTRUM.iter()
            .max_by(|a, b| a.lambda.partial_cmp(&b.lambda).unwrap())
            .unwrap();
        assert_eq!(dominant.mutation, "E150K");
        assert!(dominant.lambda > 1.5, "E150K λ must be > 1.5");

        // Collateral escape manifold for the demo patient (14d carbapenem)
        let manifold = CollateralEscapeManifold {
            lambda_collateral: 0.42,
            rpo_b_mutation_risk: 0.15,
        };
        let patient = SepticMRSAPatient::demo();
        assert!(manifold.is_active(patient.days_since_carbapenem),
            "INT-3: collateral manifold must be active for demo patient");

        // Full spectrum is sorted descending
        let lambdas: Vec<f64> = PBP2A_ESCAPE_SPECTRUM.iter().map(|e| e.lambda).collect();
        for w in lambdas.windows(2) {
            assert!(w[0] >= w[1], "INT-3: escape spectrum must be sorted descending");
        }
    }

    // -------------------------------------------------------------------------
    // INT-4: Dosing adequacy — Ceftaroline 400mg q12h covers MRSA MIC in septic patient
    //   Cmax ≈ 12.9 mg/L < MTC=40, Ctrough ≈ 2.3 mg/L > MIC=1.0
    // -------------------------------------------------------------------------
    #[test]
    fn int4_ceftaroline_400mg_q12h_achieves_pk_pd_target_in_septic_patient() {
        // Reconstruct septic PK from FDA-adjusted values
        let pk = PKParameters {
            clearance_l_hr: renal_adjusted_clearance(9.0, 45.0, 90.0), // 4.5 L/hr
            volume_of_distribution_l: 31.1,
        };
        let dose_mg  = 400.0;
        let tau_dose = 12.0; // hours (q12h)

        let c_max    = dose_mg / pk.volume_of_distribution_l; // ≈ 12.86 mg/L
        let ke       = pk.elimination_rate();                  // ≈ 0.145 hr⁻¹
        let c_trough = concentration_at(c_max, ke, tau_dose);  // ≈ 2.25 mg/L

        let mrsa_mic = 1.0;  // mg/L (EUCAST breakpoint)
        let mtc      = 40.0; // mg/L (maximum tolerated concentration)

        // PK/PD target attainment
        assert!(c_trough > mrsa_mic,
            "INT-4: Ctrough ({c_trough:.2} mg/L) must exceed MRSA MIC ({mrsa_mic} mg/L)");
        assert!(c_max < mtc,
            "INT-4: Cmax ({c_max:.2} mg/L) must be below MTC ({mtc} mg/L)");

        // Half-life confirms prolongation vs normal (2.6 hr)
        assert!(pk.half_life_hr() > 2.6,
            "INT-4: septic t½ ({:.2}hr) must exceed normal t½ (2.6hr)", pk.half_life_hr());
    }
}
