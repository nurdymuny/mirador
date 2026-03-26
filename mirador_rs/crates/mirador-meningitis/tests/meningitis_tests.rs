//! TDD tests for the Meningitis module.
//!
//! Every test corresponds to a spec item in MENINGITIS_SPEC v0.4.
//! Numbers are validated against meningitis_math_validation.py.

#[cfg(test)]
mod tests {
    use approx::assert_abs_diff_eq;
    use mirador_meningitis::*;

    // ========================================================================
    // Helpers
    // ========================================================================

    fn ceft() -> MeningitisDrug {
        load_drug("ceftriaxone").unwrap()
    }
    fn vanc() -> MeningitisDrug {
        load_drug("vancomycin").unwrap()
    }
    fn rif() -> MeningitisDrug {
        load_drug("rifampin").unwrap()
    }
    fn lzd() -> MeningitisDrug {
        load_drug("linezolid").unwrap()
    }
    fn adult_dex() -> MeningitisPatient {
        MeningitisPatient::demo_adult() // dex = true
    }
    fn adult_no_dex() -> MeningitisPatient {
        MeningitisPatient {
            dexamethasone: false,
            ..MeningitisPatient::demo_adult()
        }
    }
    fn neonate_dex() -> MeningitisPatient {
        MeningitisPatient::demo_neonate() // dex = true
    }

    const THRESHOLD: f64 = 0.50;

    // ========================================================================
    // TAU-1: Ceftriaxone τ = log₁₀(1000/0.015) ≈ 4.824
    // ========================================================================
    #[test]
    fn tau_1_ceftriaxone_tau() {
        let tau = ceft().tau();
        assert_abs_diff_eq!(tau, 4.824, epsilon = 0.001);
    }

    // All drug taus from the registry
    #[test]
    fn tau_all_drugs() {
        assert_abs_diff_eq!(ceft().tau(), 4.824, epsilon = 0.001);
        assert_abs_diff_eq!(vanc().tau(), 2.602, epsilon = 0.001);
        assert_abs_diff_eq!(rif().tau(), 2.079, epsilon = 0.001);
        assert_abs_diff_eq!(lzd().tau(), 2.097, epsilon = 0.001);
    }

    // ========================================================================
    // K-RES-1: K_reservoir = 0.26
    // ========================================================================
    #[test]
    fn k_res_1_reservoir_curvature() {
        let kr = k_reservoir(&standard_reservoirs());
        assert_abs_diff_eq!(kr, 0.26, epsilon = 0.005);
    }

    // Reservoir weight sum = 1.0
    #[test]
    fn reservoir_weights_sum_to_one() {
        let sum: f64 = standard_reservoirs().iter().map(|r| r.weight).sum();
        assert_abs_diff_eq!(sum, 1.0, epsilon = 1e-12);
    }

    // ========================================================================
    // K_phenotype weighted = 0.0301
    // ========================================================================
    #[test]
    fn k_phenotype_standard() {
        let kph = k_phenotype_weighted(&standard_phenotype());
        assert_abs_diff_eq!(kph, 0.0301, epsilon = 0.001);
    }

    // Phenotype weight sum = 1.0
    #[test]
    fn phenotype_weights_sum_to_one() {
        let sum: f64 = standard_phenotype().iter().map(|p| p.weight).sum();
        assert_abs_diff_eq!(sum, 1.0, epsilon = 1e-12);
    }

    // Shunt biofilm K is extreme
    #[test]
    fn shunt_biofilm_k_is_extreme() {
        let kph = k_phenotype_weighted(&shunt_phenotype());
        assert!(kph > 2.5, "shunt biofilm K = {kph} should be > 2.5");
    }

    // ========================================================================
    // K-BARRIER-1: K_barrier(t=0, ceftriaxone, inflamed) = 5.667
    // ========================================================================
    #[test]
    fn k_barrier_1_ceft_t0_inflamed() {
        let r = r_bbb(0.0, 0.01, 0.15, 1.5);
        assert_abs_diff_eq!(r, 0.15, epsilon = 0.001);
        let kb = k_barrier(r);
        assert_abs_diff_eq!(kb, 5.667, epsilon = 0.01);
    }

    // K_barrier floor = 0 when R >= 1
    #[test]
    fn k_barrier_floor_zero() {
        assert_abs_diff_eq!(k_barrier(1.0), 0.0, epsilon = 1e-12);
        assert_abs_diff_eq!(k_barrier(2.0), 0.0, epsilon = 1e-12);
    }

    // R_BBB decays monotonically
    #[test]
    fn r_bbb_decays_monotonically() {
        let times = [0.0, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0];
        let rs: Vec<f64> = times.iter().map(|&t| r_bbb(t, 0.01, 0.15, 1.5)).collect();
        for w in rs.windows(2) {
            assert!(w[1] <= w[0] + 1e-12, "R_BBB should decrease: {:.6} -> {:.6}", w[0], w[1]);
        }
    }

    // R_BBB asymptotes to R_base
    #[test]
    fn r_bbb_asymptotes_to_r_base() {
        let r = r_bbb(100.0, 0.01, 0.15, 1.5);
        assert_abs_diff_eq!(r, 0.01, epsilon = 0.001);
    }

    // ========================================================================
    // DEX-1: t_half with Dex = 1.5 days
    // ========================================================================
    #[test]
    fn dex_1_t_half_with_dex() {
        let patient = adult_dex();
        assert_abs_diff_eq!(patient.t_half(), 1.5, epsilon = 1e-12);
    }

    // ========================================================================
    // DEX-2: t_half without Dex = 4.0 days
    // ========================================================================
    #[test]
    fn dex_2_t_half_without_dex() {
        let patient = adult_no_dex();
        assert_abs_diff_eq!(patient.t_half(), 4.0, epsilon = 1e-12);
    }

    // ========================================================================
    // C at t=0: Ceftriaxone = 0.771 (above threshold)
    // ========================================================================
    #[test]
    fn c_ceft_t0_above_threshold() {
        let c = compute_c_site(&ceft(), &adult_dex(), 0.0);
        assert_abs_diff_eq!(c, 0.771, epsilon = 0.01);
        assert!(c >= THRESHOLD);
    }

    // K_pathway at t=0 = 6.257
    #[test]
    fn k_pathway_ceft_t0() {
        let k = compute_k_pathway(&ceft(), &adult_dex(), 0.0);
        assert_abs_diff_eq!(k, 6.257, epsilon = 0.01);
    }

    // ========================================================================
    // DEX-3: Ceftriaxone failure — Day 0.97 with Dex, Day 2.59 without
    // ========================================================================
    #[test]
    fn dex_3_ceft_fails_earlier_with_dex() {
        let fail_dex = find_failure_time(&ceft(), &adult_dex(), THRESHOLD, 100.0).unwrap();
        let fail_no_dex = find_failure_time(&ceft(), &adult_no_dex(), THRESHOLD, 100.0).unwrap();
        assert!(fail_dex < fail_no_dex, "Dex should accelerate failure: {fail_dex} vs {fail_no_dex}");
        assert_abs_diff_eq!(fail_dex, 0.97, epsilon = 0.15);
        assert_abs_diff_eq!(fail_no_dex, 2.59, epsilon = 0.30);
    }

    // Dex shrinks the window by ~60%
    #[test]
    fn dex_shrinks_window_by_60_percent() {
        let fail_dex = find_failure_time(&ceft(), &adult_dex(), THRESHOLD, 100.0).unwrap();
        let fail_no = find_failure_time(&ceft(), &adult_no_dex(), THRESHOLD, 100.0).unwrap();
        let shrink = 1.0 - fail_dex / fail_no;
        assert!(shrink > 0.50, "window should shrink by >50%: got {:.1}%", shrink * 100.0);
        assert!(shrink < 0.75, "window should shrink by <75%: got {:.1}%", shrink * 100.0);
    }

    // ========================================================================
    // DEX-4: Linezolid NEVER fails (day 21+, regardless of Dex)
    // ========================================================================
    #[test]
    fn dex_4_linezolid_never_fails_with_dex() {
        let fail = find_failure_time(&lzd(), &adult_dex(), THRESHOLD, 30.0);
        assert!(fail.is_none(), "Linezolid should never fail with Dex");
    }

    #[test]
    fn dex_4_linezolid_never_fails_without_dex() {
        let fail = find_failure_time(&lzd(), &adult_no_dex(), THRESHOLD, 30.0);
        assert!(fail.is_none(), "Linezolid should never fail without Dex");
    }

    #[test]
    fn dex_4_linezolid_c_at_day21() {
        let c_dex = compute_c_site(&lzd(), &adult_dex(), 21.0);
        let c_no = compute_c_site(&lzd(), &adult_no_dex(), 21.0);
        assert_abs_diff_eq!(c_dex, 1.054, epsilon = 0.02);
        assert_abs_diff_eq!(c_no, 1.08, epsilon = 0.02);
        assert!(c_dex >= THRESHOLD);
        assert!(c_no >= THRESHOLD);
    }

    // ========================================================================
    // DEX-5: Vancomycin fails before Ceftriaxone under Dex
    // ========================================================================
    #[test]
    fn dex_5_vancomycin_fails_before_ceftriaxone() {
        let fail_vanc = find_failure_time(&vanc(), &adult_dex(), THRESHOLD, 100.0).unwrap();
        let fail_ceft = find_failure_time(&ceft(), &adult_dex(), THRESHOLD, 100.0).unwrap();
        assert!(
            fail_vanc < fail_ceft,
            "Vancomycin ({fail_vanc:.2}) should fail before Ceftriaxone ({fail_ceft:.2})"
        );
    }

    // Vancomycin barely above threshold at t=0
    #[test]
    fn vancomycin_marginal_at_t0() {
        let c = compute_c_site(&vanc(), &adult_dex(), 0.0);
        assert_abs_diff_eq!(c, 0.501, epsilon = 0.01);
        assert!(c >= THRESHOLD, "Vancomycin should barely clear at t=0");
    }

    // ========================================================================
    // NEO-1: Neonatal R_base = 3× adult
    // ========================================================================
    #[test]
    fn neo_1_neonatal_r_multiplier() {
        let neo = neonate_dex();
        assert!(neo.is_neonatal());
        assert_abs_diff_eq!(neo.neonatal_r_multiplier(), 3.0, epsilon = 1e-12);

        let (r_base_eff, _) = effective_penetration(0.01, 0.15, 3.0);
        assert_abs_diff_eq!(r_base_eff, 0.03, epsilon = 0.001);
    }

    // Non-neonatal has multiplier 1.0
    #[test]
    fn adult_r_multiplier_is_one() {
        let adult = adult_dex();
        assert!(!adult.is_neonatal());
        assert_abs_diff_eq!(adult.neonatal_r_multiplier(), 1.0, epsilon = 1e-12);
    }

    // ========================================================================
    // NEO-2: Neonatal failure time with Dex > adult failure time with Dex
    // ========================================================================
    #[test]
    fn neo_2_neonatal_fails_later_than_adult() {
        let fail_adult = find_failure_time(&ceft(), &adult_dex(), THRESHOLD, 100.0).unwrap();
        let fail_neo = find_failure_time(&ceft(), &neonate_dex(), THRESHOLD, 100.0).unwrap();
        assert!(
            fail_neo > fail_adult,
            "Neonatal ({fail_neo:.2}) should fail later than adult ({fail_adult:.2}) — leakier BBB"
        );
        assert_abs_diff_eq!(fail_neo, 3.9, epsilon = 0.3);
    }

    // ========================================================================
    // COMBO-1: Ceft + Linezolid under Dex at day 14 > 0.50
    // ========================================================================
    #[test]
    fn combo_1_ceft_lzd_day14() {
        let c = compute_c_combo(&[&ceft(), &lzd()], &adult_dex(), 14.0, 1.0);
        assert_abs_diff_eq!(c, 1.105, epsilon = 0.03);
        assert!(c >= THRESHOLD, "Combo at day 14 should be above threshold: {c}");
    }

    // Combo > max(individual) at any time (Kirchhoff parallel)
    #[test]
    fn combo_exceeds_individual_drugs() {
        let patient = adult_dex();
        for t in [0.0, 1.0, 5.0, 14.0, 21.0] {
            let c_ceft = compute_c_site(&ceft(), &patient, t);
            let c_lzd = compute_c_site(&lzd(), &patient, t);
            let c_combo = compute_c_combo(&[&ceft(), &lzd()], &patient, t, 1.0);
            let max_individual = c_ceft.max(c_lzd);
            assert!(
                c_combo >= max_individual - 1e-10,
                "Combo ({c_combo:.4}) should exceed max individual ({max_individual:.4}) at t={t}"
            );
        }
    }

    // ========================================================================
    // RANK: Drug ranking at t=0 (with Dex)
    // Linezolid > Rifampin > Ceftriaxone > Vancomycin
    // ========================================================================
    #[test]
    fn ranking_at_t0() {
        let patient = adult_dex();
        let c_lzd = compute_c_site(&lzd(), &patient, 0.0);
        let c_rif = compute_c_site(&rif(), &patient, 0.0);
        let c_ceft = compute_c_site(&ceft(), &patient, 0.0);
        let c_vanc = compute_c_site(&vanc(), &patient, 0.0);

        assert!(c_lzd > c_rif, "Linezolid {c_lzd:.3} > Rifampin {c_rif:.3}");
        assert!(c_rif > c_ceft, "Rifampin {c_rif:.3} > Ceftriaxone {c_ceft:.3}");
        assert!(c_ceft > c_vanc, "Ceftriaxone {c_ceft:.3} > Vancomycin {c_vanc:.3}");

        // Validate exact values from Python
        assert_abs_diff_eq!(c_lzd, 2.283, epsilon = 0.01);
        assert_abs_diff_eq!(c_rif, 1.019, epsilon = 0.01);
        assert_abs_diff_eq!(c_ceft, 0.771, epsilon = 0.01);
        assert_abs_diff_eq!(c_vanc, 0.501, epsilon = 0.01);
    }

    // ========================================================================
    // Asymptotic C: sealed BBB (t → ∞)
    // ========================================================================
    #[test]
    fn asymptotic_c_sealed_bbb() {
        let patient = adult_dex();
        let c_ceft = compute_c_site(&ceft(), &patient, 100.0);
        let c_vanc = compute_c_site(&vanc(), &patient, 100.0);
        let c_rif = compute_c_site(&rif(), &patient, 100.0);
        let c_lzd = compute_c_site(&lzd(), &patient, 100.0);

        assert_abs_diff_eq!(c_ceft, 0.048, epsilon = 0.005);
        assert_abs_diff_eq!(c_vanc, 0.026, epsilon = 0.005);
        assert_abs_diff_eq!(c_rif, 0.335, epsilon = 0.01);
        assert_abs_diff_eq!(c_lzd, 1.054, epsilon = 0.02);

        // Only linezolid survives sealed BBB
        assert!(c_lzd >= THRESHOLD);
        assert!(c_ceft < THRESHOLD);
        assert!(c_vanc < THRESHOLD);
        assert!(c_rif < THRESHOLD);
    }

    // ========================================================================
    // Failure times with Dex (all drugs)
    // ========================================================================
    #[test]
    fn failure_times_with_dex() {
        let patient = adult_dex();

        let ft_ceft = find_failure_time(&ceft(), &patient, THRESHOLD, 100.0).unwrap();
        let ft_vanc = find_failure_time(&vanc(), &patient, THRESHOLD, 100.0).unwrap();
        let ft_rif = find_failure_time(&rif(), &patient, THRESHOLD, 100.0).unwrap();
        let ft_lzd = find_failure_time(&lzd(), &patient, THRESHOLD, 30.0);

        assert_abs_diff_eq!(ft_ceft, 0.97, epsilon = 0.15);
        assert_abs_diff_eq!(ft_vanc, 0.0, epsilon = 0.05);
        assert_abs_diff_eq!(ft_rif, 2.86, epsilon = 0.20);
        assert!(ft_lzd.is_none(), "Linezolid should never fail");

        // Ordering: vanc < ceft < rif < lzd(never)
        assert!(ft_vanc < ft_ceft);
        assert!(ft_ceft < ft_rif);
    }

    // ========================================================================
    // Failure times without Dex (all drugs)
    // ========================================================================
    #[test]
    fn failure_times_without_dex() {
        let patient = adult_no_dex();

        let ft_ceft = find_failure_time(&ceft(), &patient, THRESHOLD, 100.0).unwrap();
        let ft_vanc = find_failure_time(&vanc(), &patient, THRESHOLD, 100.0).unwrap();
        let ft_rif = find_failure_time(&rif(), &patient, THRESHOLD, 100.0).unwrap();
        let ft_lzd = find_failure_time(&lzd(), &patient, THRESHOLD, 30.0);

        assert_abs_diff_eq!(ft_ceft, 2.59, epsilon = 0.30);
        assert_abs_diff_eq!(ft_vanc, 0.01, epsilon = 0.05);
        assert_abs_diff_eq!(ft_rif, 7.64, epsilon = 0.50);
        assert!(ft_lzd.is_none());
    }

    // ========================================================================
    // Drug breakdown at t=0
    // ========================================================================
    #[test]
    fn drug_breakdown_at_t0() {
        let drugs = load_meningitis_drugs();
        let refs: Vec<&MeningitisDrug> = drugs.iter().collect();
        let breakdown = drug_breakdown(&refs, &adult_dex(), 0.0);

        assert_eq!(breakdown.len(), 4);

        let bd_ceft = breakdown.iter().find(|b| b.name == "ceftriaxone").unwrap();
        assert_abs_diff_eq!(bd_ceft.tau, 4.824, epsilon = 0.001);
        assert_abs_diff_eq!(bd_ceft.k_barrier, 5.667, epsilon = 0.01);
        assert_abs_diff_eq!(bd_ceft.k_pathway, 6.257, epsilon = 0.01);
        assert_abs_diff_eq!(bd_ceft.c_site, 0.771, epsilon = 0.01);
    }

    // ========================================================================
    // C timeseries is monotonically decreasing
    // ========================================================================
    #[test]
    fn c_timeseries_monotonic() {
        let series = c_timeseries(&ceft(), &adult_dex(), 0.1, 10.0);
        for w in series.windows(2) {
            assert!(
                w[1].1 <= w[0].1 + 1e-10,
                "C should decrease: t={:.1} C={:.4} -> t={:.1} C={:.4}",
                w[0].0, w[0].1, w[1].0, w[1].1
            );
        }
    }

    // ========================================================================
    // Shunt patient: biofilm K dominates, ceftriaxone C drops dramatically
    // ========================================================================
    #[test]
    fn shunt_patient_c_drops() {
        let shunt_patient = MeningitisPatient {
            shunt: true,
            ..MeningitisPatient::demo_adult()
        };
        let c_normal = compute_c_site(&ceft(), &adult_dex(), 0.0);
        let c_shunt = compute_c_site(&ceft(), &shunt_patient, 0.0);
        assert!(
            c_shunt < c_normal,
            "Shunt patient C ({c_shunt:.3}) should be lower than normal ({c_normal:.3})"
        );
        // Biofilm adds ~2.67 to K_phenotype, so C drops substantially
        assert!(c_shunt < 0.60, "Shunt C should be substantially reduced: {c_shunt:.3}");
    }

    // ========================================================================
    // Drug registry completeness
    // ========================================================================
    #[test]
    fn drug_registry_has_four_drugs() {
        let drugs = load_meningitis_drugs();
        assert_eq!(drugs.len(), 4);
    }

    #[test]
    fn drug_lookup_works() {
        assert!(load_drug("ceftriaxone").is_some());
        assert!(load_drug("vancomycin").is_some());
        assert!(load_drug("rifampin").is_some());
        assert!(load_drug("linezolid").is_some());
        assert!(load_drug("nonexistent").is_none());
    }

    // ========================================================================
    // Neonatal effective penetration clamped at 1.0
    // ========================================================================
    #[test]
    fn neonatal_penetration_clamped() {
        // Linezolid R_peak = 0.70, × 3.0 = 2.10 → clamped to 1.0
        let (r_base, r_peak) = effective_penetration(0.40, 0.70, 3.0);
        assert!(r_peak <= 1.0, "r_peak should be clamped: {r_peak}");
        assert!(r_base <= r_peak, "r_base should not exceed r_peak");
        assert_abs_diff_eq!(r_peak, 1.0, epsilon = 1e-12);
    }

    // ========================================================================
    // Linezolid: the geometric rescue drug — always R_base = 0.40
    // ========================================================================
    #[test]
    fn linezolid_high_base_penetration() {
        let l = lzd();
        assert_abs_diff_eq!(l.r_base, 0.40, epsilon = 1e-12);
        // K_barrier at sealed BBB = 1/0.40 - 1 = 1.5
        let kb = k_barrier(l.r_base);
        assert_abs_diff_eq!(kb, 1.5, epsilon = 0.01);
        // Still manageable — C = 2.097 / (0.20 + 1.5 + 0.030 + 0.26) = 2.097 / 1.99 ≈ 1.054
    }
}
