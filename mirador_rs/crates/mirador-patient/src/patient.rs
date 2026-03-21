use serde::{Deserialize, Serialize};

/// Patient state vector on the Riemannian patient manifold (P, g_P).
///
/// Coordinates are partitioned into four fibers.  The metric g_P is a
/// block-diagonal + cross-term structure (see PatientMetric).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatientState {
    // --- Genomic fiber ---
    /// Fraction of SNP variants that are non-reference (0.0–1.0).
    /// Proxy for overall genomic divergence from reference.
    pub snp_burden: f64,

    /// HLA allele group encoded as integer (0 = A*01, 1 = A*02, …).
    /// Kept scalar for the math; real implementation uses full HLA typing.
    pub hla_group: u32,

    // --- Phenomic fiber ---
    pub age_years: f64,
    pub weight_kg: f64,

    /// eGFR in mL/min/1.73m² (kidney function; normal ≥ 90).
    pub egfr: f64,

    /// ALT in U/L (liver function; normal < 40).
    pub alt_ul: f64,

    // --- Microbiome fiber ---
    /// Shannon diversity index of gut microbiome (0 = monoculture, ~4 = healthy).
    pub microbiome_diversity: f64,

    // --- Immune fiber ---
    /// CD4+ T-cell count (cells/μL; normal 500–1500).
    pub cd4_count: f64,
}

impl PatientState {
    /// Coordinates as a flat f64 vector for metric computation.
    /// Order: [snp_burden, hla_group_f, age, weight, egfr, alt, microbiome, cd4]
    pub fn coords(&self) -> [f64; 8] {
        [
            self.snp_burden,
            self.hla_group as f64,
            self.age_years,
            self.weight_kg,
            self.egfr,
            self.alt_ul,
            self.microbiome_diversity,
            self.cd4_count,
        ]
    }
}
