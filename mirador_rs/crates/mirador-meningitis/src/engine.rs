//! Meningitis computation engine.
//!
//! Computes C(t) = τ / K_pathway(t) for single drugs and
//! Kirchhoff parallel-source C_combo for combinations.

use crate::barrier::{effective_penetration, k_barrier, r_bbb};
use crate::drug::MeningitisDrug;
use crate::patient::MeningitisPatient;
use crate::phenotype::{k_phenotype_weighted, shunt_phenotype, standard_phenotype};
use crate::reservoir::{k_reservoir, standard_reservoirs};

/// Full pathway curvature K(t) for a single drug in a patient.
///
/// K_pathway = K_admet + K_barrier(t) + K_phenotype + K_reservoir
pub fn compute_k_pathway(drug: &MeningitisDrug, patient: &MeningitisPatient, t: f64) -> f64 {
    let (r_base_eff, r_peak_eff) =
        effective_penetration(drug.r_base, drug.r_peak, patient.neonatal_r_multiplier());
    let r = r_bbb(t, r_base_eff, r_peak_eff, patient.t_half());
    let kb = k_barrier(r);

    let pops = if patient.shunt {
        shunt_phenotype()
    } else {
        standard_phenotype()
    };
    let kph = k_phenotype_weighted(&pops);
    let kr = k_reservoir(&standard_reservoirs());

    drug.k_admet + kb + kph + kr
}

/// Single-drug coherence C(t) = τ / K_pathway(t).
pub fn compute_c_site(drug: &MeningitisDrug, patient: &MeningitisPatient, t: f64) -> f64 {
    let tau = drug.tau();
    let k = compute_k_pathway(drug, patient, t);
    tau / k
}

/// Find the day C drops below threshold (binary search).
/// Returns None if C stays above threshold through max_t days.
pub fn find_failure_time(
    drug: &MeningitisDrug,
    patient: &MeningitisPatient,
    threshold: f64,
    max_t: f64,
) -> Option<f64> {
    let c_end = compute_c_site(drug, patient, max_t);
    if c_end >= threshold {
        return None;
    }
    let c_start = compute_c_site(drug, patient, 0.0);
    if c_start < threshold {
        return Some(0.0);
    }

    let mut lo = 0.0_f64;
    let mut hi = max_t;
    for _ in 0..200 {
        let mid = (lo + hi) / 2.0;
        if compute_c_site(drug, patient, mid) >= threshold {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    Some((lo + hi) / 2.0)
}

/// Kirchhoff parallel-source combination C at time t.
///
/// τ_combo = Σ(τ_i × g_i) / Σ(g_i)  where g_i = 1/K_pathway_i(t)
/// C_combo = τ_combo × synergy × Σ(g_i)
pub fn compute_c_combo(
    drugs: &[&MeningitisDrug],
    patient: &MeningitisPatient,
    t: f64,
    synergy: f64,
) -> f64 {
    let mut g_total = 0.0;
    let mut tau_g_sum = 0.0;

    for drug in drugs {
        let k = compute_k_pathway(drug, patient, t);
        let g = 1.0 / k;
        g_total += g;
        tau_g_sum += drug.tau() * g;
    }

    let tau_combo = tau_g_sum / g_total;
    tau_combo * synergy * g_total
}

/// Time-series C(t) for a single drug at regular intervals.
pub fn c_timeseries(
    drug: &MeningitisDrug,
    patient: &MeningitisPatient,
    dt: f64,
    max_t: f64,
) -> Vec<(f64, f64)> {
    let n = (max_t / dt).ceil() as usize + 1;
    (0..n)
        .map(|i| {
            let t = (i as f64) * dt;
            (t, compute_c_site(drug, patient, t))
        })
        .collect()
}

/// Per-drug pathway breakdown at time t.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DrugBreakdown {
    pub name: String,
    pub tau: f64,
    pub k_admet: f64,
    pub k_barrier: f64,
    pub k_phenotype: f64,
    pub k_reservoir: f64,
    pub k_pathway: f64,
    pub c_site: f64,
}

/// Compute a full breakdown for each drug at time t.
pub fn drug_breakdown(
    drugs: &[&MeningitisDrug],
    patient: &MeningitisPatient,
    t: f64,
) -> Vec<DrugBreakdown> {
    let pops = if patient.shunt {
        shunt_phenotype()
    } else {
        standard_phenotype()
    };
    let kph = k_phenotype_weighted(&pops);
    let kr = k_reservoir(&standard_reservoirs());

    drugs
        .iter()
        .map(|drug| {
            let (r_base_eff, r_peak_eff) =
                effective_penetration(drug.r_base, drug.r_peak, patient.neonatal_r_multiplier());
            let r = r_bbb(t, r_base_eff, r_peak_eff, patient.t_half());
            let kb = k_barrier(r);
            let kp = drug.k_admet + kb + kph + kr;
            DrugBreakdown {
                name: drug.name.clone(),
                tau: drug.tau(),
                k_admet: drug.k_admet,
                k_barrier: kb,
                k_phenotype: kph,
                k_reservoir: kr,
                k_pathway: kp,
                c_site: drug.tau() / kp,
            }
        })
        .collect()
}
