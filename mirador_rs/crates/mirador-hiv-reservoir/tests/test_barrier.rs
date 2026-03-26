use mirador_hiv_reservoir::*;
use approx::assert_relative_eq;

// TEST BAR-1: R=1 → K_barrier = 0 (no barrier)
#[test]
fn barrier_r_equals_one() {
    assert_relative_eq!(compute_k_barrier(1.0), 0.0, epsilon = 1e-10);
}

// TEST BAR-2: R=0.5 → K_barrier = 1.0 (half excluded)
#[test]
fn barrier_r_half() {
    assert_relative_eq!(compute_k_barrier(0.5), 1.0, epsilon = 1e-10);
}

// TEST BAR-3: R=0.01 → K_barrier = 99.0 (BBB-like)
#[test]
fn barrier_r_bbb() {
    assert_relative_eq!(compute_k_barrier(0.01), 99.0, epsilon = 0.01);
}

// TEST BAR-4: R > 1 → K_barrier is negative but floored at -1.0
#[test]
fn barrier_r_concentrating() {
    assert_relative_eq!(compute_k_barrier(3.5), -0.7143, epsilon = 0.001);
    assert_relative_eq!(compute_k_barrier(100.0), -0.99, epsilon = 0.001);
    assert!(compute_k_barrier(3.5) > -1.0);
    assert!(compute_k_barrier(100.0) > -1.0);
}

// TEST BAR-5: R → 0 → K_barrier = 999.0 (finite cap, not infinity)
#[test]
fn barrier_near_zero_finite() {
    let k = compute_k_barrier(0.0001);
    assert_eq!(k, 999.0);
    assert!(k.is_finite());
}

// TEST BAR-6: R = 0.0 → K_barrier = 999.0 (exact zero handled)
#[test]
fn barrier_exact_zero() {
    assert_eq!(compute_k_barrier(0.0), 999.0);
}

// TEST BAR-7: Highest K_barrier is at CNS (EFV has R=0.005 → K=199)
#[test]
fn barrier_dtg_cns_highest() {
    let drugs = load_all_drugs();
    let reservoirs = load_all_reservoirs();
    let mut max_k = f64::NEG_INFINITY;
    let mut max_pair = String::new();

    for drug in &drugs {
        for res in &reservoirs {
            let r = drug.penetration.get(&res.name).copied().unwrap_or(0.3);
            let k = compute_k_barrier(r);
            if k > max_k {
                max_k = k;
                max_pair = format!("{} @ {}", drug.name, res.name);
            }
        }
    }
    assert!(
        max_pair.contains("CNS"),
        "Highest barrier should be at CNS, got: {}",
        max_pair
    );
}

// TEST BAR-8: Monotonicity — lower R → higher K_barrier
#[test]
fn barrier_monotone_decreasing() {
    let rs = vec![0.01, 0.05, 0.1, 0.3, 0.5, 1.0];
    let ks: Vec<f64> = rs.iter().map(|r| compute_k_barrier(*r)).collect();
    for i in 0..ks.len() - 1 {
        assert!(
            ks[i] >= ks[i + 1],
            "K_barrier should decrease as R increases: R={} K={} vs R={} K={}",
            rs[i],
            ks[i],
            rs[i + 1],
            ks[i + 1]
        );
    }
}
