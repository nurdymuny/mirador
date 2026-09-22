//! Emit the canonical Steven-scenario numbers for the clinical brief,
//! straight from the engine (no hand-typed figures).
//! Run: cargo run -p mirador-combo-bone-wasm --example brief_numbers

use mirador_combo_bone_wasm::compute_keske;

fn main() {
    // Default params = Steven's chronic scenario; drug_a=Ceftaroline, drug_b=Rifampin, additivity.
    println!("=== ADDITIVITY ===");
    println!("{}", compute_keske("{}"));
    println!("\n=== SYNERGY d=0.5 ===");
    println!("{}", compute_keske(r#"{"interaction":"synergy","bliss_delta":0.5}"#));
    println!("\n=== ANTAGONISM d=0.5 ===");
    println!("{}", compute_keske(r#"{"interaction":"antagonism","bliss_delta":0.5}"#));
}
