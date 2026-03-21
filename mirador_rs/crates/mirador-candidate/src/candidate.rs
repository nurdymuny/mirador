/// Molecular descriptors used for Lipinski Rule-of-Five and metric computation.
#[derive(Debug, Clone)]
pub struct MoleculeDescriptors {
    pub mw: f64,        // Molecular weight (Da)
    pub log_p: f64,     // Calculated logP (lipophilicity)
    pub hbd: usize,     // Hydrogen-bond donors
    pub hba: usize,     // Hydrogen-bond acceptors
}

impl MoleculeDescriptors {
    /// Normalized Euclidean distance in descriptor space.
    /// Lipinski thresholds (500, 5, 5, 10) serve as scale factors.
    pub fn distance(&self, other: &Self) -> f64 {
        let dmw = (self.mw - other.mw) / 500.0;
        let dlp = (self.log_p - other.log_p) / 5.0;
        let dhbd = (self.hbd as f64 - other.hbd as f64) / 5.0;
        let dhba = (self.hba as f64 - other.hba as f64) / 10.0;
        (dmw * dmw + dlp * dlp + dhbd * dhbd + dhba * dhba).sqrt()
    }

    /// Lipinski Rule of Five: a molecule is drug-like if it satisfies all four criteria.
    pub fn is_lipinski_compliant(&self) -> bool {
        self.mw <= 500.0 && self.log_p <= 5.0 && self.hbd <= 5 && self.hba <= 10
    }
}

/// Binary molecular fingerprint (e.g., ECFP4 bit vector).
#[derive(Debug, Clone)]
pub struct MolecularFingerprint {
    pub bits: Vec<bool>,
}

impl MolecularFingerprint {
    /// Tanimoto (Jaccard) similarity: |A ∩ B| / |A ∪ B|.
    /// Returns 1.0 for two empty fingerprints.
    pub fn tanimoto(&self, other: &Self) -> f64 {
        let intersection = self
            .bits
            .iter()
            .zip(other.bits.iter())
            .filter(|(&a, &b)| a && b)
            .count();
        let union = self
            .bits
            .iter()
            .zip(other.bits.iter())
            .filter(|(&a, &b)| a || b)
            .count();
        if union == 0 {
            return 1.0;
        }
        intersection as f64 / union as f64
    }
}

/// Type of a pharmacophore feature.
#[derive(Debug, Clone, PartialEq)]
pub enum FeatureType {
    HydrogenBondDonor,
    HydrogenBondAcceptor,
    PositiveCharge,
    NegativeCharge,
    Hydrophobic,
    Aromatic,
}

/// A single pharmacophore feature located in 3D space.
#[derive(Debug, Clone)]
pub struct PharmacophoreFeature {
    pub position: [f64; 3],
    pub feature_type: FeatureType,
}

impl PharmacophoreFeature {
    /// Euclidean distance to another feature.
    pub fn distance_to(&self, other: &Self) -> f64 {
        self.position
            .iter()
            .zip(other.position.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum::<f64>()
            .sqrt()
    }

    /// Small perturbation of this feature (displacement in x).
    pub fn perturb(&self, delta_x: f64) -> Self {
        PharmacophoreFeature {
            position: [
                self.position[0] + delta_x,
                self.position[1],
                self.position[2],
            ],
            feature_type: self.feature_type.clone(),
        }
    }
}

// ============================================================================
// Tests — TDD, corresponding to MIRADOR_SPEC Tests 2.1–2.5
// ============================================================================
#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_abs_diff_eq;

    fn aspirin_like() -> MoleculeDescriptors {
        MoleculeDescriptors { mw: 180.0, log_p: 1.2, hbd: 1, hba: 4 }
    }

    fn paclitaxel_like() -> MoleculeDescriptors {
        MoleculeDescriptors { mw: 854.0, log_p: 3.5, hbd: 4, hba: 14 }
    }

    fn ibuprofen_like() -> MoleculeDescriptors {
        MoleculeDescriptors { mw: 206.0, log_p: 3.5, hbd: 1, hba: 2 }
    }

    // TEST 2.1 — Metric triangle inequality on the descriptor manifold
    #[test]
    fn metric_triangle_inequality() {
        let m1 = aspirin_like();
        let m2 = paclitaxel_like();
        let m3 = ibuprofen_like();
        let d12 = m1.distance(&m2);
        let d23 = m2.distance(&m3);
        let d13 = m1.distance(&m3);
        assert!(
            d13 <= d12 + d23 + 1e-10,
            "triangle inequality violated: d13={d13}, d12+d23={}",
            d12 + d23
        );
    }

    // TEST 2.1 — Self-distance is zero
    #[test]
    fn self_distance_is_zero() {
        let m = aspirin_like();
        assert_abs_diff_eq!(m.distance(&m), 0.0, epsilon = 1e-12);
    }

    // TEST 2.2 — Lipinski compliant molecule passes
    #[test]
    fn lipinski_compliant_molecule_passes() {
        assert!(aspirin_like().is_lipinski_compliant());
        assert!(ibuprofen_like().is_lipinski_compliant());
    }

    // TEST 2.2 — Lipinski violating molecule fails (paclitaxel violates MW and HBA)
    #[test]
    fn lipinski_violating_molecule_fails() {
        assert!(!paclitaxel_like().is_lipinski_compliant());
    }

    // TEST 2.2 — Boundary molecule exactly at Lipinski limit is compliant
    #[test]
    fn lipinski_boundary_molecule_is_compliant() {
        let m = MoleculeDescriptors { mw: 500.0, log_p: 5.0, hbd: 5, hba: 10 };
        assert!(m.is_lipinski_compliant());
    }

    // TEST 2.3 — Tanimoto: identical fingerprints → similarity = 1
    #[test]
    fn tanimoto_identical_fingerprints_is_one() {
        let fp = MolecularFingerprint { bits: vec![true, false, true, true] };
        assert_abs_diff_eq!(fp.tanimoto(&fp), 1.0, epsilon = 1e-12);
    }

    // TEST 2.3 — Tanimoto: disjoint fingerprints → similarity = 0
    #[test]
    fn tanimoto_disjoint_fingerprints_is_zero() {
        let fp1 = MolecularFingerprint { bits: vec![true, true, false, false] };
        let fp2 = MolecularFingerprint { bits: vec![false, false, true, true] };
        assert_abs_diff_eq!(fp1.tanimoto(&fp2), 0.0, epsilon = 1e-12);
    }

    // TEST 2.3 — Tanimoto: partial overlap
    #[test]
    fn tanimoto_partial_overlap() {
        // A = {0,1,2}, B = {1,2,3} → intersection = {1,2} = 2, union = {0,1,2,3} = 4
        let fp1 = MolecularFingerprint { bits: vec![true, true, true, false] };
        let fp2 = MolecularFingerprint { bits: vec![false, true, true, true] };
        assert_abs_diff_eq!(fp1.tanimoto(&fp2), 0.5, epsilon = 1e-12);
    }

    // TEST 2.5 — Pharmacophore feature continuity:
    //            small perturbation → small distance change
    #[test]
    fn pharmacophore_feature_continuity() {
        let f = PharmacophoreFeature {
            position: [1.0, 2.0, 3.0],
            feature_type: FeatureType::HydrogenBondDonor,
        };
        let epsilon = 0.01; // 0.01 Ångström
        let f_perturbed = f.perturb(epsilon);
        let d = f.distance_to(&f_perturbed);
        assert_abs_diff_eq!(d, epsilon, epsilon = 1e-10);
        assert!(d < 0.1, "small perturbation should produce small feature distance: d={d}");
    }

    // TEST 2.5 — Distance from feature to itself is zero
    #[test]
    fn pharmacophore_feature_distance_to_self_is_zero() {
        let f = PharmacophoreFeature {
            position: [5.0, 0.0, -3.0],
            feature_type: FeatureType::Aromatic,
        };
        assert_abs_diff_eq!(f.distance_to(&f), 0.0, epsilon = 1e-12);
    }
}
