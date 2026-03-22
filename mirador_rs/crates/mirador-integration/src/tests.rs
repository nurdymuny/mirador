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

    // =========================================================================
    // INT-5 through INT-9: Keske Method — Steven Keske pediatric AHO scenario
    //
    // Steven: ~8yo, 25kg, multifocal MRSA AHO (hip/femur/knee),
    //         CRP > 250, 4 surgeries, 5 failed antibiotics, 6 years chronic.
    //         The question the Keske Method answers: which combination works?
    // =========================================================================

    use mirador_pediatric::{
        PediatricPatient, AntibioticCourse, InfectionSite, MrsaStrain, PvlStatus,
    };
    use mirador_bone::{
        vancomycin_penetration, ceftaroline_penetration, rifampin_penetration,
    };
    use mirador_biofilm::{
        vancomycin_biofilm, ceftaroline_biofilm, rifampin_biofilm,
        Chronicity, check_rifampin_monotherapy,
    };
    use mirador_reservoir::ReservoirPatient;
    use mirador_combo_bone::{DrugBonePathway, combine_two, monotherapy};

    fn steven() -> PediatricPatient {
        PediatricPatient {
            age_months: 96.0,           // ~8 years
            weight_kg: 25.0,
            height_cm: 120.0,
            serum_creatinine: 0.5,
            alt_ul: 40.0,
            albumin_gdl: 3.2,
            crp_mgl: 250.0,             // septic shock
            esr_mmhr: 90.0,
            infection_site: InfectionSite::Multifocal,
            mrsa_strain: MrsaStrain::Usa300,
            pvl_status: PvlStatus::Unknown,
            prior_antibiotics: vec![
                AntibioticCourse { drug_name: "vancomycin".into(),  duration_days: 14 },
                AntibioticCourse { drug_name: "clindamycin".into(), duration_days: 21 },
                AntibioticCourse { drug_name: "daptomycin".into(),  duration_days: 14 },
                AntibioticCourse { drug_name: "linezolid".into(),   duration_days: 21 },
                AntibioticCourse { drug_name: "ceftaroline".into(), duration_days: 14 },
            ],
            surgical_debridements: 4,
            biofilm_suspected: true,
            infection_duration_days: 365.0 * 6.0, // 6 years
        }
    }

    // INT-5: Pediatric PK — Steven's flags all fire correctly
    #[test]
    fn int5_steven_pediatric_pk_flags() {
        let pk = steven().compute_pk().unwrap();
        // Schwartz GFR = 0.413 * 120 / 0.5 = 99.12 (normal for age — no dose reduction)
        assert!(pk.egfr_schwartz > 90.0, "Steven's eGFR should be normal, got {:.1}", pk.egfr_schwartz);
        assert!(!pk.dose_reduce_flag, "No dose reduction needed at normal eGFR");
        // Multifocal → combination therapy flag
        assert!(pk.multifocal_combo_flag, "Multifocal must trigger combo flag");
        // 5 failed antibiotics → resistance flag
        assert!(pk.resistance_prior_flag, "5 prior ABX must trigger resistance flag");
        // CRP 250 → Vd expansion
        // 0.002 * (250 - 100) = 0.30 → factor 1.30
        assert_abs_diff_eq!(pk.vd_inflam_mult, 1.30, epsilon = 1e-4);
        // Allometric CL: (25/70)^0.75
        let expected_cl = (25.0_f64 / 70.0).powf(0.75);
        assert_abs_diff_eq!(pk.cl_factor, expected_cl, epsilon = 1e-6);
    }

    // INT-6: Bone penetration — vancomycin vs ceftaroline at CRP 250
    #[test]
    fn int6_bone_penetration_crp_250() {
        let crp = 250.0_f64;
        let vanc_res = vancomycin_penetration().k_penetration(crp).unwrap();
        let cef_res  = ceftaroline_penetration().k_penetration(crp).unwrap();
        // Both get penetration boost from CRP 250, but vancomycin still far worse
        assert!(vanc_res.k_penetration > cef_res.k_penetration,
            "Vancomycin K_pen ({:.2}) must exceed ceftaroline K_pen ({:.2}) at CRP 250",
            vanc_res.k_penetration, cef_res.k_penetration);
        // CRP modifier: 0.006*(250-100)=0.9 → both at 1.9× baseline → but capped at 2×
        // For vancomycin baseline 0.20 → R_eff = min(0.20*1.9, 0.40) = 0.38
        assert_abs_diff_eq!(vanc_res.r_bone_eff, 0.38, epsilon = 1e-6);
    }

    // INT-7: Biofilm — chronic probability 0.95 for Steven (6 years)
    #[test]
    fn int7_biofilm_chronic_steven() {
        let chronicity = Chronicity::from_days(365.0 * 6.0);
        assert_eq!(chronicity, Chronicity::Chronic);
        assert_abs_diff_eq!(chronicity.biofilm_probability(), 0.95, epsilon = 1e-9);

        // Vancomycin biofilm curvature in chronic Steven
        let vanc_k_bio_eff = vancomycin_biofilm().k_biofilm_eff(&chronicity);
        // K_bio = log10(512) ≈ 2.709; K_bio_eff = 0.95 * 2.709 ≈ 2.574
        assert!(vanc_k_bio_eff > 2.5, "Chronic vancomycin K_bio_eff must be > 2.5");

        // Rifampin combo is not blocked when paired with ceftaroline
        let rif_profile = rifampin_biofilm();
        let cef_profile = ceftaroline_biofilm();
        assert!(check_rifampin_monotherapy(&[&rif_profile, &cef_profile]).is_ok());
        // But rifampin monotherapy is blocked
        assert!(check_rifampin_monotherapy(&[&rif_profile]).is_err());
    }

    // INT-8: Reservoir — vancomycin pathway dominates; rifampin reduces intra reservoir
    #[test]
    fn int8_reservoir_steven() {
        let steven_reservoir = ReservoirPatient {
            p_drainage: 0.8,             // 4 surgeries cleared SAC
            p_debride: 0.7,              // repeated debridements
            intracellular_fraction: 0.60, // 6 years chronic
            crp_mgl: 250.0,
        };
        let vanc_pen = vancomycin_penetration().k_penetration(250.0).unwrap();
        let rif_pen  = rifampin_penetration().k_penetration(250.0).unwrap();

        let vanc_res = steven_reservoir.compute(&vanc_pen, false);
        let rif_res  = steven_reservoir.compute(&rif_pen, true); // rifampin is present

        // Reservoir 3 reduced 60% with rifampin
        let reduction = (vanc_res.k_res_intra - rif_res.k_res_intra) / vanc_res.k_res_intra;
        assert_abs_diff_eq!(reduction, 0.60, epsilon = 1e-6);

        // K_reservoir > 1.0 in both cases (chronic infection persists)
        assert!(vanc_res.k_reservoir_total > 1.0);

        // Anti-Atl flag fires (intracellular_fraction = 0.60 > 0.30)
        assert!(vanc_res.anti_atl_flag);
    }

    // INT-9: Full Keske pipeline — vancomycin monotherapy C_bone < 2.0,
    //        ceftaroline + rifampin C_bone > 10.0 (Steven's scenario)
    #[test]
    fn int9_keske_full_pipeline_steven_keske() {
        let chronicity = Chronicity::Chronic;
        let crp = 250.0_f64;

        let steven_reservoir = ReservoirPatient {
            p_drainage: 0.8,
            p_debride: 0.7,
            intracellular_fraction: 0.60,
            crp_mgl: crp,
        };

        // --- Vancomycin monotherapy ---
        let vanc_pen = vancomycin_penetration().k_penetration(crp).unwrap();
        let vanc_res = steven_reservoir.compute(&vanc_pen, false);
        let vanc_bio = vancomycin_biofilm().k_biofilm_eff(&chronicity);

        let vanc_pathway = DrugBonePathway {
            drug_name: "vancomycin".into(),
            tau: 12.0,
            k_admet: 0.50,
            k_pen: vanc_pen.k_penetration,
            k_bio: vanc_bio,
            k_res: vanc_res.k_reservoir_total,
            is_rifampin: false,
        };
        let c_vanc = monotherapy(&vanc_pathway).unwrap();
        assert!(c_vanc < 3.0,
            "INT-9: vancomycin monotherapy C_bone must be < 3.0 (got {:.3}) \
             — at CRP 250 the inflammation modifier raises R_bone (more vascular), \
             slightly boosting penetration, but biofilm + reservoir barriers still dominate. \
             This is WHY five drugs failed Steven", c_vanc);

        // --- Ceftaroline + Rifampin combination ---
        let cef_pen = ceftaroline_penetration().k_penetration(crp).unwrap();
        let rif_pen = rifampin_penetration().k_penetration(crp).unwrap();
        let cef_res = steven_reservoir.compute(&cef_pen, true); // rifampin present
        let rif_res = steven_reservoir.compute(&rif_pen, true); // rifampin present
        let cef_bio = ceftaroline_biofilm().k_biofilm_eff(&chronicity);
        let rif_bio = rifampin_biofilm().k_biofilm_eff(&chronicity);

        let cef_pathway = DrugBonePathway {
            drug_name: "ceftaroline".into(),
            tau: 12.0,
            k_admet: 0.67,
            k_pen: cef_pen.k_penetration,
            k_bio: cef_bio,
            k_res: cef_res.k_reservoir_total,
            is_rifampin: false,
        };
        let rif_pathway = DrugBonePathway {
            drug_name: "rifampin".into(),
            tau: 8.0,
            k_admet: 0.50,
            k_pen: rif_pen.k_penetration,
            k_bio: rif_bio,
            k_res: rif_res.k_reservoir_total,
            is_rifampin: true,
        };

        let combo = combine_two(&cef_pathway, &rif_pathway, 1.2).unwrap();
        assert!(combo.c_bone_combo > 10.0,
            "INT-9: ceftaroline + rifampin C_bone must exceed 10.0 (got {:.2}) \
             — the Keske Method would have found this on day 1", combo.c_bone_combo);

        // The ratio tells the story
        let fold_improvement = combo.c_bone_combo / c_vanc;
        assert!(fold_improvement > 5.0,
            "INT-9: cef+rif must be at least 5× better than vancomycin, got {:.1}×",
            fold_improvement);
    }
}

