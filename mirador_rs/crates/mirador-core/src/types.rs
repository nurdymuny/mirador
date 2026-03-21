/// Betti numbers of a topological space (binding pocket, molecular graph, etc.)
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct BettiNumbers {
    /// β₀ — connected components
    pub b0: usize,
    /// β₁ — independent loops / tunnels
    pub b1: usize,
    /// β₂ — enclosed cavities
    pub b2: usize,
}

impl BettiNumbers {
    /// |τ_bind| = b0 + b1 + b2  (total topological weight)
    ///
    /// Each Betti number contributes independently (Künneth factor).
    /// b0=1 always for a connected pocket; b1 encodes tunnel complexity;
    /// b2 encodes enclosed cavities.
    pub fn tau_bind_magnitude(&self) -> f64 {
        (self.b0 + self.b1 + self.b2) as f64
    }
}

/// Chirality sheet index on the double cover.
///
/// +1 → agonist sheet (R-configuration, or whichever enantiomer is active)
/// -1 → antagonist / inactive sheet
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ChiralSign(pub i8);

impl ChiralSign {
    pub const AGONIST: Self = Self(1);
    pub const ANTAGONIST: Self = Self(-1);

    /// Returns the f64 value (+1.0 or -1.0) for use in τ computation.
    pub fn as_f64(self) -> f64 {
        self.0 as f64
    }
}

/// CYP450 enzyme identity — pharmacogenomically relevant enzymes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum CYPEnzyme {
    CYP2D6,
    CYP2C19,
    CYP3A4,
    CYP1A2,
    CYP2C9,
}

/// Metabolizer phenotype from pharmacogenomics.
///
/// The activity score (AS) maps to metabolic rate:
///   Poor  (AS = 0.0)  → no enzyme activity
///   Normal (AS = 1.0) → reference activity
///   Ultra  (AS = 2.0+) → enhanced activity
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct MetabolizerStatus {
    pub enzyme: CYPEnzyme,
    /// Activity score (0.0 = poor, 1.0 = normal, 2.0+ = ultra-rapid)
    pub activity_score: f64,
}

impl MetabolizerStatus {
    pub fn poor(enzyme: CYPEnzyme) -> Self {
        Self { enzyme, activity_score: 0.0 }
    }

    pub fn normal(enzyme: CYPEnzyme) -> Self {
        Self { enzyme, activity_score: 1.0 }
    }

    pub fn ultra_rapid(enzyme: CYPEnzyme) -> Self {
        Self { enzyme, activity_score: 2.0 }
    }
}
