/// One-compartment pharmacokinetic parameters.
///
/// In the Davis Field Equation framework, dosing is **parallel transport**:
/// the drug concentration c(t) is a geodesic in pharmacokinetic space, and the
/// therapeutic effect σ is parallel-transported along this geodesic.
/// The parallel transport equation ∇_c σ = 0 yields exponential decay as its solution.
#[derive(Debug, Clone)]
pub struct PKParameters {
    /// Systemic clearance (L/hr). Patient-specific: function of organ function from Layer 0.
    pub clearance_l_hr: f64,
    /// Volume of distribution (L). Governs drug distribution after absorption.
    pub volume_of_distribution_l: f64,
}

impl PKParameters {
    /// Elimination rate constant k_e = CL / Vd (hr⁻¹).
    pub fn elimination_rate(&self) -> f64 {
        self.clearance_l_hr / self.volume_of_distribution_l
    }

    /// Half-life: t½ = ln(2) / k_e = ln(2) × Vd / CL (hr).
    pub fn half_life_hr(&self) -> f64 {
        f64::ln(2.0) / self.elimination_rate()
    }
}

/// Concentration at time t after a single IV bolus (parallel transport solution).
///
/// C(t) = C₀ · exp(−k_e · t)
/// This is the solution to ∇_c σ = 0: the drug parallel-transports along the
/// concentration geodesic, decaying at rate k_e.
pub fn concentration_at(c0: f64, ke: f64, t: f64) -> f64 {
    c0 * (-ke * t).exp()
}

/// Trough concentration at the end of the Nth dose interval under repeated IV bolus dosing.
///
/// After the Nth dose, the accumulation factor is (1 − R^N) / (1 − R) where R = exp(−k_e τ).
/// Trough = C₀_per_dose · R · accumulation_factor.
pub fn trough_at_dose_n(c0_per_dose: f64, ke: f64, tau_dose: f64, n: usize) -> f64 {
    let r = (-ke * tau_dose).exp(); // fraction remaining at end of interval
    if (1.0 - r).abs() < 1e-12 {
        // Limit: ke → 0, no elimination → concentration accumulates linearly
        return c0_per_dose * n as f64;
    }
    let accumulation = (1.0 - r.powi(n as i32)) / (1.0 - r);
    c0_per_dose * r * accumulation
}

/// Steady-state trough concentration (limit of infinite repeated dosing).
///
/// C_ss_trough = C₀/dose · R / (1 − R) where R = exp(−k_e · τ_dose)
pub fn steady_state_trough(c0_per_dose: f64, ke: f64, tau_dose: f64) -> f64 {
    let r = (-ke * tau_dose).exp();
    if (1.0 - r).abs() < 1e-12 {
        return f64::INFINITY;
    }
    c0_per_dose * r / (1.0 - r)
}

/// Emax pharmacodynamic model (Hill equation with n=1):
///
/// E(C) = Emax · C / (EC50 + C)
///
/// EC50 is the conjugate point on the concentration geodesic:
/// the concentration where marginal therapeutic gain = marginal toxicity risk.
/// At C = EC50: E = Emax / 2 (half-maximal effect).
pub fn emax_effect(concentration: f64, emax: f64, ec50: f64) -> f64 {
    emax * concentration / (ec50 + concentration)
}

/// Conventional "time to steady state" estimate: 4–5 half-lives.
/// Returns the midpoint (4.5 × t½), i.e. within 5% of true CSS.
pub fn steady_state_time_hr(half_life_hr: f64) -> f64 {
    4.5 * half_life_hr
}

/// Patient-adjusted clearance for renal impairment.
///
/// For renally cleared drugs, clearance scales with eGFR:
/// CL_patient = CL_normal × (eGFR_patient / eGFR_normal)
/// Reduces clearance proportionally to residual kidney function.
pub fn renal_adjusted_clearance(cl_normal: f64, egfr_patient: f64, egfr_normal: f64) -> f64 {
    cl_normal * (egfr_patient / egfr_normal)
}

// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 9.1–9.5
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    /// Typical adult PK parameters (gentamicin-like: renally cleared aminoglycoside)
    fn normal_pk() -> PKParameters {
        PKParameters {
            clearance_l_hr: 5.0,          // CL = 5 L/hr
            volume_of_distribution_l: 10.0, // Vd = 10 L
        }
    }

    // TEST 9.1 — Parallel transport solution: C(t½) = C₀ / 2
    #[test]
    fn concentration_halves_at_halflife() {
        let pk = normal_pk();
        let ke = pk.elimination_rate();
        let t_half = pk.half_life_hr();
        let c0 = 100.0; // mg/L
        let c_at_half = concentration_at(c0, ke, t_half);
        assert_abs_diff_eq!(c_at_half, c0 / 2.0, epsilon = 1e-8);
    }

    // TEST 9.1 — Parallel transport: concentration is monotonically decreasing
    #[test]
    fn concentration_is_monotonically_decreasing() {
        let ke = 0.5; // hr⁻¹
        let c0 = 50.0;
        let times = [0.0, 0.5, 1.0, 2.0, 5.0];
        let concentrations: Vec<f64> = times.iter().map(|&t| concentration_at(c0, ke, t)).collect();
        for w in concentrations.windows(2) {
            assert!(w[1] < w[0], "concentration should decrease monotonically");
        }
    }

    // TEST 9.2 — EC50 as conjugate point: at C = EC50, effect = Emax / 2
    #[test]
    fn ec50_gives_half_maximal_effect() {
        let emax = 1.0;
        let ec50 = 10.0; // mg/L
        let effect = emax_effect(ec50, emax, ec50);
        assert_abs_diff_eq!(effect, emax / 2.0, epsilon = 1e-12);
    }

    // TEST 9.2 — EC50 model: below EC50 → effect < 50%, above EC50 → effect > 50%
    #[test]
    fn emax_model_is_monotone() {
        let emax = 1.0;
        let ec50 = 5.0;
        assert!(emax_effect(1.0, emax, ec50) < emax_effect(ec50, emax, ec50));
        assert!(emax_effect(ec50, emax, ec50) < emax_effect(100.0, emax, ec50));
    }

    // TEST 9.3 — Patient-specific PK: renal impairment reduces clearance.
    // Gentamicin is >90% renally cleared; eGFR < 30 → CL drops proportionally.
    #[test]
    fn renal_impairment_reduces_clearance() {
        let cl_normal = 5.0; // L/hr at eGFR = 90 mL/min/1.73m²
        let egfr_normal = 90.0;
        let egfr_impaired = 25.0; // Stage 4 CKD

        let cl_impaired = renal_adjusted_clearance(cl_normal, egfr_impaired, egfr_normal);
        assert!(cl_impaired < cl_normal, "renal impairment must reduce clearance");
        assert_abs_diff_eq!(
            cl_impaired,
            cl_normal * egfr_impaired / egfr_normal,
            epsilon = 1e-10
        );
    }

    // TEST 9.3 — Renal impairment increases half-life (CL ↓ → t½ ↑)
    #[test]
    fn renal_impairment_increases_half_life() {
        let pk_normal = PKParameters { clearance_l_hr: 5.0, volume_of_distribution_l: 10.0 };
        let pk_impaired = PKParameters {
            clearance_l_hr: renal_adjusted_clearance(5.0, 25.0, 90.0),
            volume_of_distribution_l: 10.0,
        };
        assert!(
            pk_impaired.half_life_hr() > pk_normal.half_life_hr(),
            "renal impairment should increase half-life: normal={:.2}hr, impaired={:.2}hr",
            pk_normal.half_life_hr(),
            pk_impaired.half_life_hr()
        );
    }

    // TEST 9.4 — Steady state time is 4–5 half-lives
    #[test]
    fn steady_state_time_is_four_point_five_halflives() {
        let pk = normal_pk();
        let t_half = pk.half_life_hr();
        let t_ss = steady_state_time_hr(t_half);
        assert_abs_diff_eq!(t_ss, 4.5 * t_half, epsilon = 1e-10);
        assert!(t_ss >= 4.0 * t_half && t_ss <= 5.0 * t_half);
    }

    // TEST 9.4 — Repeated dosing: trough concentration accumulates toward steady state
    #[test]
    fn repeated_dosing_accumulates_to_steady_state() {
        let ke = 0.347; // hr⁻¹ (t½ ≈ 2 hr)
        let tau_dose = 6.0; // dosing interval 6 hr
        let c0_per_dose = 10.0; // mg/L per dose

        // Trough should increase and converge to steady-state value
        let troughs: Vec<f64> = (1..=20)
            .map(|n| trough_at_dose_n(c0_per_dose, ke, tau_dose, n))
            .collect();

        // Monotonically increasing
        for w in troughs.windows(2) {
            assert!(w[1] >= w[0] - 1e-10, "trough should increase monotonically");
        }

        // Converges close to steady-state trough
        let css = steady_state_trough(c0_per_dose, ke, tau_dose);
        let last_trough = troughs.last().unwrap();
        assert!(
            (last_trough - css).abs() / css < 0.05,
            "should be within 5% of steady state after 20 doses: got {last_trough:.4}, css={css:.4}"
        );
    }

    // TEST 9.5 — Half-life formula: t½ = ln(2) × Vd / CL
    #[test]
    fn half_life_formula_is_correct() {
        let pk = normal_pk(); // CL=5, Vd=10
        let expected = f64::ln(2.0) * 10.0 / 5.0; // ≈ 1.386 hr
        assert_abs_diff_eq!(pk.half_life_hr(), expected, epsilon = 1e-10);
    }

    // Additional — elimination rate is CL/Vd
    #[test]
    fn elimination_rate_is_cl_over_vd() {
        let pk = PKParameters { clearance_l_hr: 3.0, volume_of_distribution_l: 15.0 };
        assert_abs_diff_eq!(pk.elimination_rate(), 0.2, epsilon = 1e-12);
    }

    // =========================================================================
    // Septic MRSA patient / Ceftaroline-specific PK tests
    // Source: FDA NDA 200327, clinical PK in sepsis (MIRADOR_PBP2A_REAL_DATA_SPEC)
    // =========================================================================

    /// Ceftaroline PK for septic MRSA patient (68yo, eGFR=45, sepsis-expanded Vd).
    ///
    /// Normal:  Vd=28L, CL=9.0 L/hr (CrCl≈90 mL/min), t½=2.6 hr
    /// Septic:  Vd=31.1L (×1.11 expansion), CL=4.5 L/hr (×CrCl_45/90), t½=4.8 hr
    fn septic_mrsa_pk() -> PKParameters {
        PKParameters {
            clearance_l_hr: 4.5,           // CL = 9.0 × (45/90) = 4.5 L/hr
            volume_of_distribution_l: 31.1, // Vd = 28 × 1.11 = 31.1 L (sepsis expansion)
        }
    }

    // TEST 9.6 — Septic patient half-life is prolonged vs normal (t½=4.8hr > 2.6hr)
    #[test]
    fn septic_patient_half_life_is_prolonged() {
        let pk_normal = PKParameters { clearance_l_hr: 9.0, volume_of_distribution_l: 28.0 };
        let pk_septic = septic_mrsa_pk();

        let t_half_normal = pk_normal.half_life_hr(); // ≈ 2.16 hr
        let t_half_septic = pk_septic.half_life_hr(); // ≈ 4.80 hr

        assert!(
            t_half_septic > t_half_normal,
            "septic patient t½ ({t_half_septic:.2}hr) must exceed normal ({t_half_normal:.2}hr)"
        );
        // At least 1.5× prolongation due to reduced clearance
        assert!(
            t_half_septic >= 1.5 * t_half_normal,
            "septic t½ must be ≥ 1.5× normal: {t_half_septic:.2}hr vs 1.5×{t_half_normal:.2}hr"
        );
        assert_abs_diff_eq!(t_half_septic, 4.8, epsilon = 0.1);
    }

    // TEST 9.7 — FDA dose: CL adjustment at eGFR=45 gives 4.5 L/hr (400mg q12h label)
    #[test]
    fn fda_dose_adjustment_at_egfr_45_gives_cl_4_5() {
        let cl_normal  = 9.0;   // L/hr at CrCl=90 mL/min
        let egfr_normal = 90.0;
        let egfr_septic = 45.0;

        let cl_adjusted = renal_adjusted_clearance(cl_normal, egfr_septic, egfr_normal);
        // CL at eGFR=45 must be 4.5 L/hr (FDA table: 400mg q12h for CrCl 15-50)
        assert_abs_diff_eq!(cl_adjusted, 4.5, epsilon = 1e-10);
    }

    // TEST 9.8 — Ceftaroline Ctrough > MRSA MIC (therapeutic coverage confirmed)
    // 400mg IV q12h: C0 = 400mg / 31.1L = 12.86 mg/L; Ctrough at 12hr.
    #[test]
    fn ceftaroline_ctrough_exceeds_mrsa_mic() {
        let pk = septic_mrsa_pk();
        let dose_mg = 400.0;
        let c0 = dose_mg / pk.volume_of_distribution_l; // ≈ 12.86 mg/L (≈ Cmax)
        let ke = pk.elimination_rate();                  // 4.5/31.1 = 0.145 hr⁻¹
        let tau_dose = 12.0;                             // q12h dosing interval

        let ctrough = concentration_at(c0, ke, tau_dose); // C at end of first interval
        let mrsa_mic = 1.0; // μg/mL (mg/L); EUCAST breakpoint for MRSA

        assert!(
            ctrough > mrsa_mic,
            "ceftaroline Ctrough ({ctrough:.2} mg/L) must exceed MRSA MIC ({mrsa_mic} mg/L)"
        );
        assert_abs_diff_eq!(ctrough, 2.3, epsilon = 0.2);
    }

    // TEST 9.9 — Ceftaroline Cmax < MTC (no supratherapeutic toxicity)
    #[test]
    fn ceftaroline_cmax_below_maximum_tolerated_concentration() {
        let pk = septic_mrsa_pk();
        let dose_mg = 400.0;
        let c_max = dose_mg / pk.volume_of_distribution_l; // IV bolus peak ≈ 12.9 mg/L
        let mtc = 40.0; // mg/L — maximum tolerated concentration for ceftaroline

        assert!(
            c_max < mtc,
            "ceftaroline Cmax ({c_max:.2} mg/L) must be below MTC ({mtc} mg/L)"
        );
        assert_abs_diff_eq!(c_max, 12.9, epsilon = 0.2);
    }
}
