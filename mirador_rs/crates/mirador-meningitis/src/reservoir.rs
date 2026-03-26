/// Layer M4: Multi-Reservoir Geometry.
///
/// Bacteria inhabit three distinct neurological niches:
/// 1. CSF Bulk (70%) — high drug access (0.9)
/// 2. Meningeal Surface (20%) — moderate access (0.5)
/// 3. Brain Parenchyma (10%) — poor access (0.1)
///
/// K_res = Σ weight_i × (1 − access_i)

/// A neurological reservoir niche.
pub struct Reservoir {
    pub name: &'static str,
    pub weight: f64,
    pub access: f64,
}

/// Standard three-niche reservoir layout.
pub fn standard_reservoirs() -> Vec<Reservoir> {
    vec![
        Reservoir { name: "CSF Bulk",          weight: 0.7, access: 0.9 },
        Reservoir { name: "Meningeal Surface", weight: 0.2, access: 0.5 },
        Reservoir { name: "Brain Parenchyma",  weight: 0.1, access: 0.1 },
    ]
}

/// Weighted reservoir curvature.
/// K_res = Σ weight_i × (1 − access_i)
pub fn k_reservoir(reservoirs: &[Reservoir]) -> f64 {
    reservoirs.iter().map(|r| r.weight * (1.0 - r.access)).sum()
}
