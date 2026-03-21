use mirador_core::{CYPEnzyme, MetabolizerStatus};
use serde::{Deserialize, Serialize};

/// Pharmacogenomic panel — CYP450 metabolizer statuses for the five
/// clinically most important enzymes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PharmacogenomicPanel {
    pub cyp2d6: MetabolizerStatus,
    pub cyp2c19: MetabolizerStatus,
    pub cyp3a4: MetabolizerStatus,
    pub cyp1a2: MetabolizerStatus,
    pub cyp2c9: MetabolizerStatus,
}

impl Default for PharmacogenomicPanel {
    fn default() -> Self {
        Self {
            cyp2d6: MetabolizerStatus::normal(CYPEnzyme::CYP2D6),
            cyp2c19: MetabolizerStatus::normal(CYPEnzyme::CYP2C19),
            cyp3a4: MetabolizerStatus::normal(CYPEnzyme::CYP3A4),
            cyp1a2: MetabolizerStatus::normal(CYPEnzyme::CYP1A2),
            cyp2c9: MetabolizerStatus::normal(CYPEnzyme::CYP2C9),
        }
    }
}

impl PharmacogenomicPanel {
    pub fn activity_score(&self, enzyme: CYPEnzyme) -> f64 {
        match enzyme {
            CYPEnzyme::CYP2D6  => self.cyp2d6.activity_score,
            CYPEnzyme::CYP2C19 => self.cyp2c19.activity_score,
            CYPEnzyme::CYP3A4  => self.cyp3a4.activity_score,
            CYPEnzyme::CYP1A2  => self.cyp1a2.activity_score,
            CYPEnzyme::CYP2C9  => self.cyp2c9.activity_score,
        }
    }
}
