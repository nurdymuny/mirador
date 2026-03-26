use serde::{Deserialize, Serialize};

/// Meningitis patient state — Layer M1.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeningitisPatient {
    /// Age in years; < 1/12 (one month) triggers neonatal flag.
    pub age_years: f64,
    /// Baseline CSF WBC count (cells/μL).
    pub csf_wbc: f64,
    /// Whether dexamethasone is administered.
    pub dexamethasone: bool,
    /// Whether a VP shunt or hardware is present.
    pub shunt: bool,
}

impl MeningitisPatient {
    /// Neonatal flag: age < 1 month (1/12 year).
    pub fn is_neonatal(&self) -> bool {
        self.age_years < 1.0 / 12.0
    }

    /// Inflammation decay half-life (days).
    /// Dex accelerates BBB restoration: t_half drops from 4.0 to 1.5.
    pub fn t_half(&self) -> f64 {
        if self.dexamethasone { 1.5 } else { 4.0 }
    }

    /// Neonatal R_base multiplier.
    /// Neonates have immature tight junctions → 3× baseline permeability.
    /// Ek et al., Toxicol Lett 2012.
    pub fn neonatal_r_multiplier(&self) -> f64 {
        if self.is_neonatal() { 3.0 } else { 1.0 }
    }

    /// Demo adult patient (default).
    pub fn demo_adult() -> Self {
        Self {
            age_years: 45.0,
            csf_wbc: 2000.0,
            dexamethasone: true,
            shunt: false,
        }
    }

    /// Demo neonatal patient.
    pub fn demo_neonate() -> Self {
        Self {
            age_years: 0.02, // ~1 week old
            csf_wbc: 3000.0,
            dexamethasone: true,
            shunt: false,
        }
    }
}
