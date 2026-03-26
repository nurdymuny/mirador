/// Layer M2: Dynamic BBB Manifold.
///
/// The BBB is a time-varying barrier. During acute infection, meningeal
/// inflammation makes it highly permeable. As treatment reduces bacterial load,
/// inflammation resolves and the BBB seals shut.
///
/// R_BBB(t) = R_base × (1 + (M_peak − 1) × exp(−t × ln(2) / t_half))
/// K_barrier(t) = max(1/R_BBB(t) − 1, 0)

/// Dynamic BBB permeability at time t (days).
///
/// Uses first-order exponential decay of inflammation.
/// M_peak = R_peak / R_base (the magnification factor at peak inflammation).
pub fn r_bbb(t: f64, r_base: f64, r_peak: f64, t_half: f64) -> f64 {
    let m_peak = r_peak / r_base;
    r_base * (1.0 + (m_peak - 1.0) * (-t * f64::ln(2.0) / t_half).exp())
}

/// Barrier curvature from penetration ratio.
///
/// K = max(1/R − 1, 0). Floor = 0 (consistent with HIV engine).
/// When R ≥ 1 the drug concentrates in CSF (no barrier), so K = 0.
pub fn k_barrier(r: f64) -> f64 {
    (1.0 / r - 1.0).max(0.0)
}

/// Effective R_base and R_peak for a drug, accounting for neonatal multiplier.
/// Neonates: R × 3.0 (immature tight junctions), clamped at 1.0.
pub fn effective_penetration(r_base: f64, r_peak: f64, neonatal_mult: f64) -> (f64, f64) {
    let r_peak_eff = (r_peak * neonatal_mult).min(1.0);
    let r_base_eff = (r_base * neonatal_mult).min(r_peak_eff);
    (r_base_eff, r_peak_eff)
}
