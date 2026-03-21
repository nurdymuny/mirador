use mirador_core::{BettiNumbers, ChiralSign};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Errors from pharmacophore computation.
#[derive(Debug, Error)]
pub enum PharmacophoreError {
    #[error("tau_ring must be a positive integer, got {0}")]
    InvalidRingCount(usize),

    #[error("BettiNumbers must have b0 ≥ 1 (connected binding pocket)")]
    DisconnectedPocket,
}

/// The pharmacophore topological invariant τ.
///
/// τ = τ_bind · τ_chiral · τ_ring
///
/// where:
///   |τ_bind| = b0 + b1 + b2   (total Betti weight of binding pocket)
///   τ_chiral = ±1              (chirality / double-cover sheet)
///   |τ_ring|  = Σ loops        (aromatic ring count as π₁ generator count)
///
/// The SIGN of τ encodes the chiral sheet:
///   τ > 0 → agonist sheet
///   τ < 0 → antagonist sheet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pharmacophore {
    /// Betti numbers of the binding pocket topology.
    pub betti: BettiNumbers,

    /// Chirality: +1 (active enantiomer) or -1 (inactive/antagonist enantiomer).
    pub tau_chiral: ChiralSign,

    /// Number of independent aromatic ring systems (τ_ring factor).
    /// Each ring system contributes one generator to π₁ of the ring graph.
    /// Benzene → 1, naphthalene → 2, quinoline → 1 (bicyclic but 1 new loop), etc.
    pub ring_count: usize,
}

impl Pharmacophore {
    /// The signed pharmacophore invariant τ = |τ_bind| · τ_chiral · |τ_ring|.
    ///
    /// Panics if ring_count = 0 (molecules must have at least one ring system
    /// for a meaningful pharmacophore; for acyclic molecules use ring_count = 1).
    pub fn tau(&self) -> Result<f64, PharmacophoreError> {
        if self.betti.b0 == 0 {
            return Err(PharmacophoreError::DisconnectedPocket);
        }
        if self.ring_count == 0 {
            return Err(PharmacophoreError::InvalidRingCount(0));
        }
        let tau_bind_mag = self.betti.tau_bind_magnitude();
        let tau_ring_mag = self.ring_count as f64;
        Ok(tau_bind_mag * self.tau_chiral.as_f64() * tau_ring_mag)
    }

    /// The log-magnitude of τ (for Künneth log-additivity check).
    ///
    /// log|τ| = log|τ_bind| + log|τ_chiral| + log|τ_ring|
    ///
    /// Since |τ_chiral| = 1, log|τ_chiral| = 0 always.
    pub fn log_tau_magnitude(&self) -> Result<f64, PharmacophoreError> {
        let t = self.tau()?.abs();
        if t <= 0.0 {
            return Err(PharmacophoreError::DisconnectedPocket);
        }
        Ok(t.ln())
    }
}
