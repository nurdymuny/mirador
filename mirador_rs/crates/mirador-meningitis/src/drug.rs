use serde::{Deserialize, Serialize};

/// Meningitis drug profile — published PK data.
///
/// τ = log₁₀(AUC₂₄ / MIC) — pharmacophoric potential.
/// In meningitis, τ is a PK-derived potency index (not Künneth topology)
/// because the bacteria are planktonic — binding topology is not the bottleneck.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeningitisDrug {
    pub name: String,
    /// AUC₂₄ in μg·hr/mL.
    pub auc24: f64,
    /// MIC in μg/mL against the target pathogen.
    pub mic: f64,
    /// Uninflamed BBB penetration ratio (Nau 2010).
    pub r_base: f64,
    /// Inflamed BBB penetration ratio (Nau 2010).
    pub r_peak: f64,
    /// ADMET curvature (absorption + distribution + metabolism + excretion + toxicity).
    pub k_admet: f64,
}

impl MeningitisDrug {
    /// τ = log₁₀(AUC₂₄ / MIC).
    pub fn tau(&self) -> f64 {
        (self.auc24 / self.mic).log10()
    }
}

/// Load the four-drug meningitis registry.
/// All values from published sources (Nau 2010, IDSA 2004 guidelines).
pub fn load_meningitis_drugs() -> Vec<MeningitisDrug> {
    vec![
        MeningitisDrug {
            name: "ceftriaxone".into(),
            auc24: 1000.0,
            mic: 0.015,
            r_base: 0.01,
            r_peak: 0.15,
            k_admet: 0.30,
        },
        MeningitisDrug {
            name: "vancomycin".into(),
            auc24: 400.0,
            mic: 1.0,
            r_base: 0.01,
            r_peak: 0.18,
            k_admet: 0.35,
        },
        MeningitisDrug {
            name: "rifampin".into(),
            auc24: 60.0,
            mic: 0.5,
            r_base: 0.15,
            r_peak: 0.40,
            k_admet: 0.25,
        },
        MeningitisDrug {
            name: "linezolid".into(),
            auc24: 250.0,
            mic: 2.0,
            r_base: 0.40,
            r_peak: 0.70,
            k_admet: 0.20,
        },
    ]
}

/// Look up a drug by name.
pub fn load_drug(name: &str) -> Option<MeningitisDrug> {
    load_meningitis_drugs().into_iter().find(|d| d.name == name)
}
