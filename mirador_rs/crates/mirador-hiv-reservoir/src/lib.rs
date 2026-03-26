//! MIRADOR HIV Latent Reservoir Pharmacology
//!
//! Davis Field Equations: C = τ/K applied to HIV latent reservoirs.
//! All PK data from published sources. Zero fitted parameters.

mod drug;
mod reservoir;
mod phenotype;
mod engine;

pub use drug::{ArvDrug, ArvClass, load_drug, load_all_drugs};
pub use reservoir::{HivReservoir, load_all_reservoirs};
pub use phenotype::{LatencyModel, Phenotype, Lra, load_all_lras};
pub use engine::{
    compute_tau,
    compute_k_barrier,
    compute_k_phenotype,
    compute_k_pathway,
    compute_c_site,
    compute_c_combo_active,
    compute_c_with_lra,
    compute_phi_threshold,
    compute_double_cover,
    compute_clearance_order,
};
