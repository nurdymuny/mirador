use serde::{Deserialize, Serialize};

/// HIV latency phenotype: active vs latent.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Phenotype {
    Active,
    Latent,
}

/// The HIV latency model.
/// Two states: active (K_phenotype = 0) and latent (K_phenotype = 6.0).
#[derive(Clone, Debug)]
pub struct LatencyModel {
    pub k_phenotype_active: f64,
    pub k_phenotype_latent: f64,
    pub f_active_on_art: f64,
}

impl Default for LatencyModel {
    fn default() -> Self {
        Self {
            k_phenotype_active: 0.0,
            k_phenotype_latent: 6.0,
            f_active_on_art: 1e-6,
        }
    }
}

/// A latency-reversing agent. Catalytic, not conductive.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Lra {
    pub name: String,
    pub reactivation_phi: f64,
    pub source: String,
}

/// Load all 4 LRAs.
pub fn load_all_lras() -> Vec<Lra> {
    vec![
        Lra {
            name: "Vorinostat".into(),
            reactivation_phi: 0.005,
            source: "Archin 2012; Elliott 2014".into(),
        },
        Lra {
            name: "Romidepsin".into(),
            reactivation_phi: 0.008,
            source: "Sogaard 2015".into(),
        },
        Lra {
            name: "Panobinostat".into(),
            reactivation_phi: 0.003,
            source: "Rasmussen 2014".into(),
        },
        Lra {
            name: "AZD5153".into(),
            reactivation_phi: 0.015,
            source: "Banerjee 2012; class estimate".into(),
        },
    ]
}
