//! Faithful combination report for the Steven Keske scenario — REAL engine output.
//!
//! Reduces each drug to C_bone = τ / K_pathway (the in-series K-decomposition),
//! then combines ceftaroline + rifampin under each interaction model via the
//! Bliss-based `mirador-combination` engine, and contrasts with the legacy
//! parallel-resistor `combine_two`.
//!
//! Reproduce:  cargo run -p mirador-combo-bone --example steven_faithful_report

use mirador_combo_bone::scenarios::{ceftaroline, rifampin, vancomycin};
use mirador_combo_bone::{combine_two, combine_two_interaction, InteractionType};

fn main() {
    let cef = ceftaroline();
    let rif = rifampin();
    let vanc = vancomycin();

    let c_cef = cef.tau / cef.k_pathway();
    let c_rif = rif.tau / rif.k_pathway();
    let c_vanc = vanc.tau / vanc.k_pathway();

    println!("# Steven Keske — faithful combination report (real engine output)\n");
    println!("Threshold for adequate bone coherence: C = 5\n");

    println!("## Monotherapy   C_bone = tau / K_pathway\n");
    println!("| Drug | tau | K_admet | K_pen | K_bio | K_res | K_pathway | C_bone |");
    println!("|---|---:|---:|---:|---:|---:|---:|---:|");
    for d in [&cef, &rif, &vanc] {
        println!(
            "| {} | {:.0} | {:.3} | {:.3} | {:.3} | {:.3} | {:.3} | {:.3} |",
            d.drug_name, d.tau, d.k_admet, d.k_pen, d.k_bio, d.k_res, d.k_pathway(),
            d.tau / d.k_pathway()
        );
    }
    println!("\n*Rifampin is never monotherapy (rpoB resistance); its C_bone is shown only as a combination component.*\n");
    let _ = (c_cef, c_rif, c_vanc);

    let add   = combine_two_interaction(&cef, &rif, InteractionType::Additivity).unwrap();
    let syn05 = combine_two_interaction(&cef, &rif, InteractionType::Synergy { bliss_delta: 0.5 }).unwrap();
    let syn10 = combine_two_interaction(&cef, &rif, InteractionType::Synergy { bliss_delta: 1.0 }).unwrap();
    let ant03 = combine_two_interaction(&cef, &rif, InteractionType::Antagonism { bliss_delta: 0.3 }).unwrap();
    let ant05 = combine_two_interaction(&cef, &rif, InteractionType::Antagonism { bliss_delta: 0.5 }).unwrap();
    let legacy = combine_two(&cef, &rif, 1.2).unwrap();

    println!("## Ceftaroline + Rifampin — combination models\n");
    println!("C_ceftaroline = {:.3}, C_rifampin = {:.3}  (best single = {:.3}, weakest single = {:.3})\n",
        add.c_bone_a, add.c_bone_b, add.c_bone_a.max(add.c_bone_b), add.c_bone_a.min(add.c_bone_b));
    println!("| Interaction model | Formula | C_bone_combo | vs C=5 |");
    println!("|---|---|---:|:--:|");
    let row = |name: &str, formula: &str, c: f64| {
        println!("| {} | {} | {:.2} | {} |", name, formula, c, if c >= 5.0 { "PASS" } else { "below" });
    };
    row("Bliss additivity",   "C_A + C_B",              add.c_bone_combo);
    row("Synergy d=0.5",      "max(C_A,C_B) + d",       syn05.c_bone_combo);
    row("Synergy d=1.0",      "max(C_A,C_B) + d",       syn10.c_bone_combo);
    row("Antagonism d=0.3",   "min(C_A,C_B) x (1-d)",   ant03.c_bone_combo);
    row("Antagonism d=0.5",   "min(C_A,C_B) x (1-d)",   ant05.c_bone_combo);
    println!("| _legacy parallel-resistor (s=1.2)_ | (tau_A+tau_B)(1/K_A+1/K_B)s^2 | {:.2} | {} |",
        legacy.c_bone_combo, if legacy.c_bone_combo >= 5.0 { "PASS" } else { "below" });
}
