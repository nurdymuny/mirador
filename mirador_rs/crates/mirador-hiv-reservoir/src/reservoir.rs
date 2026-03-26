use serde::{Deserialize, Serialize};

/// An anatomical HIV reservoir.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct HivReservoir {
    pub name: String,
    pub latent_fraction: f64,
    pub source: String,
}

/// Load all 5 reservoirs in canonical order:
/// CNS, lymph_node, GALT, genital_tract, bone_marrow.
pub fn load_all_reservoirs() -> Vec<HivReservoir> {
    vec![
        HivReservoir {
            name: "CNS".into(),
            latent_fraction: 0.02,
            source: "Schnell 2011; Lamers 2011".into(),
        },
        HivReservoir {
            name: "lymph_node".into(),
            latent_fraction: 0.15,
            source: "Banga 2016; Bronnimann 2018".into(),
        },
        HivReservoir {
            name: "GALT".into(),
            latent_fraction: 0.65,
            source: "Chun 2008; Estes 2017".into(),
        },
        HivReservoir {
            name: "genital_tract".into(),
            latent_fraction: 0.08,
            source: "Coombs 2003".into(),
        },
        HivReservoir {
            name: "bone_marrow".into(),
            latent_fraction: 0.10,
            source: "Alexaki 2008; McNamara 2013".into(),
        },
    ]
}
