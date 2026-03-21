use crate::optimizer::CandidatePoint;
use mirador_core::CoherenceError;
use serde::{Deserialize, Serialize};

/// A point on the Pareto front in (τ, K) space.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParetoPoint {
    pub tau: f64,
    pub k: f64,
    pub coherence: f64,
}

impl ParetoPoint {
    pub fn from_candidate(pt: &CandidatePoint) -> Result<Self, CoherenceError> {
        Ok(Self {
            tau: pt.tau,
            k: pt.k,
            coherence: pt.coherence()?,
        })
    }
}

/// Compute the Pareto-optimal subset of candidate points.
///
/// Point A dominates B iff: A.tau ≥ B.tau AND A.k ≤ B.k
/// with at least one strict inequality (higher τ and lower K is better).
pub fn pareto_front(candidates: &[CandidatePoint]) -> Result<Vec<ParetoPoint>, CoherenceError> {
    let pts: Vec<ParetoPoint> = candidates
        .iter()
        .map(ParetoPoint::from_candidate)
        .collect::<Result<_, _>>()?;

    let mut front = Vec::new();

    for (i, a) in pts.iter().enumerate() {
        let dominated = pts.iter().enumerate().any(|(j, b)| {
            i != j
                && b.tau >= a.tau
                && b.k <= a.k
                && (b.tau > a.tau || b.k < a.k)
        });
        if !dominated {
            front.push(a.clone());
        }
    }

    // Sort by coherence descending
    front.sort_by(|a, b| b.coherence.partial_cmp(&a.coherence).unwrap());
    Ok(front)
}

#[cfg(test)]
mod tests {
    use super::*;

    // TEST 6.3 — Pareto front is non-dominated
    #[test]
    fn pareto_front_is_non_dominated() {
        let candidates = vec![
            CandidatePoint { tau: 10.0, k: 2.0 },  // dominated by (20, 2)
            CandidatePoint { tau: 20.0, k: 2.0 },  // Pareto optimal
            CandidatePoint { tau: 5.0,  k: 1.0 },  // may be optimal (low K)
            CandidatePoint { tau: 20.0, k: 3.0 },  // dominated by (20, 2)
            CandidatePoint { tau: 25.0, k: 4.0 },  // may be optimal (highest τ)
        ];

        let front = pareto_front(&candidates).unwrap();

        // Every front point must not be dominated
        for a in &front {
            let dominated = front.iter().any(|b| {
                b.tau >= a.tau && b.k <= a.k && (b.tau > a.tau || b.k < a.k)
            });
            assert!(!dominated, "Pareto point (τ={}, K={}) is dominated", a.tau, a.k);
        }
    }

    // Pareto front must be non-empty for non-empty input
    #[test]
    fn pareto_front_non_empty() {
        let candidates = vec![
            CandidatePoint { tau: 5.0, k: 2.0 },
            CandidatePoint { tau: 3.0, k: 4.0 },
        ];
        let front = pareto_front(&candidates).unwrap();
        assert!(!front.is_empty());
    }

    // Front is sorted by coherence descending
    #[test]
    fn pareto_front_sorted_by_coherence() {
        let candidates = vec![
            CandidatePoint { tau: 10.0, k: 5.0 },
            CandidatePoint { tau: 20.0, k: 3.0 },
            CandidatePoint { tau: 30.0, k: 8.0 },
        ];
        let front = pareto_front(&candidates).unwrap();
        for w in front.windows(2) {
            assert!(w[0].coherence >= w[1].coherence,
                "front not sorted: {:.3} < {:.3}", w[0].coherence, w[1].coherence);
        }
    }
}
