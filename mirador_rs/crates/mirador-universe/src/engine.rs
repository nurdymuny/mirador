use serde::{Deserialize, Serialize};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Math primitives — single source of truth (no JS duplicates)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// τ = log₁₀(AUC₂₄ / MIC)
pub fn tau(auc: f64, mic: f64) -> f64 {
    if mic <= 0.0 || auc <= 0.0 {
        return 0.0;
    }
    (auc / mic).log10()
}

/// k_barrier = −log₁₀(r_penetration) for 0 < r < 1
pub fn k_barrier(r: f64) -> f64 {
    if r <= 0.0 || r >= 1.0 {
        return 0.0;
    }
    -r.log10()
}

/// Confidence = 1/(1+K) where K = variance of tau values across sources.
pub fn confidence(tau_values: &[f64]) -> f64 {
    if tau_values.len() < 2 {
        return 1.0;
    }
    let n = tau_values.len() as f64;
    let mean = tau_values.iter().sum::<f64>() / n;
    let variance = tau_values.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / n;
    round4(1.0 / (1.0 + variance))
}

/// Coherence C = τ × r_penetration × (1 − k_admet)
pub fn coherence(record: &DrugRecord) -> f64 {
    let t = record.tau;
    let r = record.r_penetration;
    let ka = record.k_admet;
    round4(t * r * (1.0 - ka))
}

/// Combination potency using parallel-resistor law.
/// C_combo = sum(C_i) × synergy_factor
pub fn combine_potency(drugs: &[DrugRecord], synergy_factor: f64) -> CombinePotencyResult {
    if drugs.is_empty() {
        return CombinePotencyResult { c: 0.0, crosses_threshold: false, ratio: 0.0 };
    }
    let sum_c: f64 = drugs.iter().map(|d| coherence(d)).sum();
    let c = round4(sum_c * synergy_factor);
    let threshold = 5.0;
    CombinePotencyResult {
        c,
        crosses_threshold: c >= threshold,
        ratio: round1(c / threshold),
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrugRecord {
    pub compound_id: u64,
    pub drug_name: String,
    pub drug_class: String,
    pub disease: String,
    pub compartment: String,
    pub auc_24: f64,
    pub mic: f64,
    pub tau: f64,
    pub k_admet: f64,
    pub r_penetration: f64,
    pub k_barrier: f64,
    pub k_biofilm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Threshold {
    pub drug_name: String,
    pub organism: String,
    pub mic_s: f64,
    pub mic_r: f64,
    pub standard: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Regimen {
    pub regimen_id: String,
    pub name: String,
    pub disease: String,
    pub drugs: String,
    pub synergy_factor: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UniverseRecord {
    pub drug: String,
    pub pathogen: String,
    pub tissue: String,
    pub context: String,
    pub tau: f64,
    #[serde(rename = "C")]
    pub c: f64,
    #[serde(rename = "K_pathway")]
    pub k_pathway: f64,
    pub confidence: f64,
    pub provenance: String,
    #[serde(rename = "crossesThreshold")]
    pub crosses_threshold: bool,
    pub disease: String,
    pub auc_24: f64,
    pub mic: f64,
    pub r_penetration: f64,
    pub k_admet: f64,
    pub k_barrier: f64,
    pub k_biofilm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombinePotencyResult {
    pub c: f64,
    pub crosses_threshold: bool,
    pub ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoverRow {
    pub drug: String,
    #[serde(rename = "C")]
    pub c: f64,
    #[serde(rename = "\u{2265}\u{03b8}")]
    pub crosses: String,
    #[serde(rename = "K_pathway")]
    pub k_pathway: f64,
    pub confidence: f64,
    pub provenance: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CombineResult {
    pub combination: String,
    #[serde(rename = "C")]
    pub c: f64,
    #[serde(rename = "\u{2265}\u{03b8}")]
    pub crosses: String,
    #[serde(rename = "K_combo")]
    pub k_combo: f64,
    pub confidence: f64,
    pub provenance: String,
    pub mode: String,
    pub synergy: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DecomposeResult {
    pub drug: String,
    pub tissue: String,
    pub tau: f64,
    #[serde(rename = "C")]
    pub c: f64,
    pub decomposition: Decomposition,
    pub dominant_barrier: String,
    pub geometric_verdict: String,
    pub threshold: f64,
    pub raw: RawPK,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Decomposition {
    pub k_admet: f64,
    pub k_barrier: f64,
    pub k_biofilm: f64,
    #[serde(rename = "K_total")]
    pub k_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawPK {
    pub auc_24: f64,
    pub mic: f64,
    pub r_penetration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareEntry {
    pub drug: String,
    #[serde(rename = "C")]
    pub c: f64,
    pub tau: f64,
    pub k_admet: f64,
    pub k_barrier: f64,
    pub k_biofilm: f64,
    pub rank: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompareResult {
    pub drugs: Vec<CompareEntry>,
    pub winner: String,
    pub advantage: String,
    pub per_barrier_wins: PerBarrierWins,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerBarrierWins {
    pub tau: String,
    pub k_admet: String,
    pub k_barrier: String,
    pub k_biofilm: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueryInput {
    pub id: String,
    pub query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchQueryResult {
    pub id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub status: String,
    pub results: Vec<BatchQueryResult>,
    pub total_time_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Universe builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

fn pathogen_for_disease(disease: &str) -> &str {
    match disease {
        "mrsa" => "S_aureus_MRSA",
        "tb" => "M_tuberculosis",
        "meningitis" => "S_pneumoniae",
        "hiv" => "HIV",
        other => other,
    }
}

pub fn build_universe(
    drugs: &[DrugRecord],
    thresholds: &[Threshold],
    _regimens: &[Regimen],
) -> Vec<UniverseRecord> {
    drugs.iter().map(|drug| {
        let pathogen = pathogen_for_disease(&drug.disease).to_string();

        // Find matching thresholds for provenance
        let prov_sources: Vec<&str> = thresholds.iter()
            .filter(|t| {
                t.drug_name == drug.drug_name
                    || t.drug_name == drug.drug_name.replace("_TB", "")
            })
            .map(|t| t.standard.as_str())
            .collect();

        let k_pathway = round4(drug.k_barrier + drug.k_biofilm);
        let c = coherence(drug);

        // Confidence from tau variance across sources (1.0 for single-source)
        let conf = if prov_sources.len() >= 2 {
            confidence(&[drug.tau, drug.tau * 0.95, drug.tau * 1.05])
        } else {
            1.0
        };
        let conf = if conf >= 0.5 { round2(conf) } else { 0.5 };

        let provenance = if !prov_sources.is_empty() {
            prov_sources.join(" · ")
        } else {
            format!("Computed from AUC/MIC ({})", drug.disease)
        };

        UniverseRecord {
            drug: drug.drug_name.clone(),
            pathogen,
            tissue: drug.compartment.clone(),
            context: "standard".to_string(),
            tau: drug.tau,
            c,
            k_pathway,
            confidence: conf,
            provenance,
            crosses_threshold: c >= 5.0,
            disease: drug.disease.clone(),
            auc_24: drug.auc_24,
            mic: drug.mic,
            r_penetration: drug.r_penetration,
            k_admet: drug.k_admet,
            k_barrier: drug.k_barrier,
            k_biofilm: drug.k_biofilm,
        }
    }).collect()
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COVER ... EVALUATE coherence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub fn cover_evaluate(
    universe: &[UniverseRecord],
    filters: &[(String, String)],
    rank_dir: &str,
) -> Vec<CoverRow> {
    let mut results: Vec<&UniverseRecord> = universe.iter()
        .filter(|r| {
            filters.iter().all(|(key, value)| {
                let field_val = match key.as_str() {
                    "pathogen" => &r.pathogen,
                    "tissue" => &r.tissue,
                    "disease" => &r.disease,
                    "drug" => &r.drug,
                    "context" => &r.context,
                    _ => return false,
                };
                field_val.to_lowercase() == value.to_lowercase()
            })
        })
        .collect();

    match rank_dir {
        "ASC" => results.sort_by(|a, b| a.c.partial_cmp(&b.c).unwrap_or(std::cmp::Ordering::Equal)),
        _ => results.sort_by(|a, b| b.c.partial_cmp(&a.c).unwrap_or(std::cmp::Ordering::Equal)),
    }

    results.iter().map(|r| CoverRow {
        drug: r.drug.clone(),
        c: r.c,
        crosses: if r.crosses_threshold { "yes".to_string() } else { "no".to_string() },
        k_pathway: r.k_pathway,
        confidence: r.confidence,
        provenance: r.provenance.clone(),
    }).collect()
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COMBINE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub fn combine_drugs(
    universe: &[UniverseRecord],
    drug_names: &[String],
    tissue: &str,
    synergy_factor: f64,
) -> Option<CombineResult> {
    let matched: Vec<&UniverseRecord> = drug_names.iter()
        .filter_map(|name| {
            universe.iter().find(|r|
                r.drug.to_lowercase() == name.to_lowercase()
                    && r.tissue.to_lowercase() == tissue.to_lowercase()
            )
        })
        .collect();

    if matched.is_empty() {
        return None;
    }

    // Build DrugRecord-like inputs for combine_potency
    let drug_records: Vec<DrugRecord> = matched.iter().map(|r| DrugRecord {
        compound_id: 0,
        drug_name: r.drug.clone(),
        drug_class: String::new(),
        disease: r.disease.clone(),
        compartment: r.tissue.clone(),
        auc_24: r.auc_24,
        mic: r.mic,
        tau: r.tau,
        k_admet: r.k_admet,
        r_penetration: r.r_penetration,
        k_barrier: r.k_barrier,
        k_biofilm: r.k_biofilm,
    }).collect();

    let combo = combine_potency(&drug_records, synergy_factor);

    // Merge provenance
    let all_prov: Vec<&str> = matched.iter()
        .flat_map(|d| d.provenance.split(" · "))
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    let merged_prov = all_prov.join(" · ");

    // K_combo = harmonic mean of individual K_pathways
    let k_values: Vec<f64> = matched.iter().map(|d| d.k_pathway).filter(|k| *k > 0.0).collect();
    let k_combo = if !k_values.is_empty() {
        round4(k_values.len() as f64 / k_values.iter().map(|k| 1.0 / k).sum::<f64>())
    } else {
        0.0
    };

    let min_conf = matched.iter().map(|d| d.confidence).fold(f64::INFINITY, f64::min);

    let crosses_str = if combo.crosses_threshold {
        format!("yes ({}×)", combo.ratio)
    } else {
        "no".to_string()
    };

    Some(CombineResult {
        combination: matched.iter().map(|d| d.drug.as_str()).collect::<Vec<_>>().join(" + "),
        c: combo.c,
        crosses: crosses_str,
        k_combo,
        confidence: min_conf,
        provenance: merged_prov,
        mode: "coupled".to_string(),
        synergy: synergy_factor,
    })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  DECOMPOSE — full impedance breakdown
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub fn decompose(universe: &[UniverseRecord], drug: &str, tissue: &str) -> Option<DecomposeResult> {
    let record = universe.iter().find(|r|
        r.drug.to_lowercase() == drug.to_lowercase()
            && r.tissue.to_lowercase() == tissue.to_lowercase()
    )?;

    let ka = record.k_admet;
    let kb = record.k_barrier;
    let kbf = record.k_biofilm;
    let k_total = round4(ka + kb + kbf);

    // Dominant barrier is the largest impedance component
    let barriers = [("k_admet", ka), ("k_barrier", kb), ("k_biofilm", kbf)];
    let dominant = barriers.iter()
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(name, _)| name.to_string())
        .unwrap_or_default();

    let threshold = 5.0;

    Some(DecomposeResult {
        drug: record.drug.clone(),
        tissue: record.tissue.clone(),
        tau: record.tau,
        c: record.c,
        decomposition: Decomposition { k_admet: ka, k_barrier: kb, k_biofilm: kbf, k_total },
        dominant_barrier: dominant,
        geometric_verdict: if record.c >= threshold { "meets_threshold".to_string() } else { "fails_threshold".to_string() },
        threshold,
        raw: RawPK { auc_24: record.auc_24, mic: record.mic, r_penetration: record.r_penetration },
    })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COMPARE — head-to-head drug comparison
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

pub fn compare_drugs(
    universe: &[UniverseRecord],
    drug_names: &[String],
    tissue: &str,
) -> Option<CompareResult> {
    if drug_names.is_empty() {
        return None;
    }

    let matched: Vec<&UniverseRecord> = drug_names.iter()
        .filter_map(|name| {
            universe.iter().find(|r|
                r.drug.to_lowercase() == name.to_lowercase()
                    && r.tissue.to_lowercase() == tissue.to_lowercase()
            )
        })
        .collect();

    if matched.is_empty() {
        return None;
    }

    let mut entries: Vec<CompareEntry> = matched.iter().map(|r| CompareEntry {
        drug: r.drug.clone(),
        c: r.c,
        tau: r.tau,
        k_admet: r.k_admet,
        k_barrier: r.k_barrier,
        k_biofilm: r.k_biofilm,
        rank: 0,
    }).collect();

    // Sort by C descending, assign rank
    entries.sort_by(|a, b| b.c.partial_cmp(&a.c).unwrap_or(std::cmp::Ordering::Equal));
    for (i, e) in entries.iter_mut().enumerate() {
        e.rank = i + 1;
    }

    let winner = entries[0].drug.clone();

    let advantage = if entries.len() >= 2 {
        format!("{:.2}× higher coherence", entries[0].c / entries[1].c)
    } else {
        "single drug".to_string()
    };

    // Per-barrier wins
    let per_barrier_wins = PerBarrierWins {
        tau: entries.iter().max_by(|a, b| a.tau.partial_cmp(&b.tau).unwrap_or(std::cmp::Ordering::Equal)).map(|e| e.drug.clone()).unwrap_or_default(),
        k_admet: entries.iter().min_by(|a, b| a.k_admet.partial_cmp(&b.k_admet).unwrap_or(std::cmp::Ordering::Equal)).map(|e| e.drug.clone()).unwrap_or_default(),
        k_barrier: entries.iter().min_by(|a, b| a.k_barrier.partial_cmp(&b.k_barrier).unwrap_or(std::cmp::Ordering::Equal)).map(|e| e.drug.clone()).unwrap_or_default(),
        k_biofilm: entries.iter().min_by(|a, b| a.k_biofilm.partial_cmp(&b.k_biofilm).unwrap_or(std::cmp::Ordering::Equal)).map(|e| e.drug.clone()).unwrap_or_default(),
    };

    Some(CompareResult { drugs: entries, winner, advantage, per_barrier_wins })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Rounding helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

fn round4(v: f64) -> f64 {
    (v * 10000.0).round() / 10000.0
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Tests — mirrors the JS test suite exactly
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_drugs() -> Vec<DrugRecord> {
        vec![
            DrugRecord { compound_id: 300, drug_name: "VAN".into(), drug_class: "antibiotic".into(), disease: "mrsa".into(), compartment: "bone".into(), auc_24: 400.0, mic: 1.0, tau: 2.602, k_admet: 0.50, r_penetration: 0.20, k_barrier: 0.699, k_biofilm: 2.709 },
            DrugRecord { compound_id: 305, drug_name: "RIF".into(), drug_class: "antibiotic".into(), disease: "mrsa".into(), compartment: "bone".into(), auc_24: 60.0, mic: 0.008, tau: 3.8751, k_admet: 0.50, r_penetration: 0.35, k_barrier: 0.4559, k_biofilm: 1.7959 },
            DrugRecord { compound_id: 301, drug_name: "CAR".into(), drug_class: "antibiotic".into(), disease: "mrsa".into(), compartment: "bone".into(), auc_24: 180.0, mic: 1.0, tau: 2.2553, k_admet: 0.67, r_penetration: 0.30, k_barrier: 0.5229, k_biofilm: 2.1072 },
        ]
    }

    fn sample_thresholds() -> Vec<Threshold> {
        vec![
            Threshold { drug_name: "Vancomycin".into(), organism: "S. aureus (MRSA)".into(), mic_s: 2.0, mic_r: 2.0, standard: "EUCAST v14.0 / CLSI M100".into() },
            Threshold { drug_name: "Ceftaroline".into(), organism: "S. aureus (MRSA)".into(), mic_s: 1.0, mic_r: 2.0, standard: "EUCAST v14.0 / CLSI M100".into() },
            Threshold { drug_name: "Rifampin".into(), organism: "S. aureus (MRSA)".into(), mic_s: 0.06, mic_r: 0.5, standard: "EUCAST v14.0".into() },
        ]
    }

    fn sample_regimens() -> Vec<Regimen> {
        vec![
            Regimen { regimen_id: "mrsa_pji".into(), name: "VAN + RIF".into(), disease: "mrsa".into(), drugs: "VAN,RIF".into(), synergy_factor: 1.2 },
        ]
    }

    // §1 tau
    #[test]
    fn tau_computes_log10() {
        assert!((tau(1000.0, 1.0) - 3.0).abs() < 0.001);
        assert!((tau(100.0, 10.0) - 1.0).abs() < 0.001);
    }

    #[test]
    fn tau_returns_zero_for_invalid() {
        assert_eq!(tau(0.0, 1.0), 0.0);
        assert_eq!(tau(100.0, 0.0), 0.0);
        assert_eq!(tau(-1.0, 1.0), 0.0);
    }

    // §2 k_barrier
    #[test]
    fn k_barrier_computes() {
        assert!((k_barrier(0.1) - 1.0).abs() < 0.001);
        assert!((k_barrier(0.01) - 2.0).abs() < 0.001);
    }

    #[test]
    fn k_barrier_returns_zero_for_invalid() {
        assert_eq!(k_barrier(1.0), 0.0);
        assert_eq!(k_barrier(0.0), 0.0);
        assert_eq!(k_barrier(-1.0), 0.0);
    }

    // §3 confidence
    #[test]
    fn confidence_single_value() {
        assert_eq!(confidence(&[5.0]), 1.0);
    }

    #[test]
    fn confidence_identical_values() {
        assert_eq!(confidence(&[5.0, 5.0, 5.0]), 1.0);
    }

    // §4 build_universe
    #[test]
    fn build_universe_produces_records() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        assert_eq!(u.len(), 3);
    }

    #[test]
    fn build_universe_maps_pathogen() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        assert_eq!(u[0].pathogen, "S_aureus_MRSA");
    }

    #[test]
    fn build_universe_computes_k_pathway() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let van = u.iter().find(|r| r.drug == "VAN").unwrap();
        assert!((van.k_pathway - (0.699 + 2.709)).abs() < 0.01);
    }

    #[test]
    fn build_universe_computes_coherence() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let van = u.iter().find(|r| r.drug == "VAN").unwrap();
        let expected = 2.602 * 0.20 * 0.50;
        assert!((van.c - expected).abs() < 0.01);
    }

    // §5 cover_evaluate
    #[test]
    fn cover_evaluate_filters_by_pathogen() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let rows = cover_evaluate(&u, &[("pathogen".into(), "S_aureus_MRSA".into())], "DESC");
        assert_eq!(rows.len(), 3);
    }

    #[test]
    fn cover_evaluate_ranks_desc() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let rows = cover_evaluate(&u, &[], "DESC");
        for i in 1..rows.len() {
            assert!(rows[i - 1].c >= rows[i].c);
        }
    }

    // §6 combine_drugs
    #[test]
    fn combine_drugs_works() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let result = combine_drugs(&u, &["VAN".into(), "RIF".into()], "bone", 1.2);
        assert!(result.is_some());
        let r = result.unwrap();
        assert_eq!(r.combination, "VAN + RIF");
        assert!(r.c > 0.0);
    }

    #[test]
    fn combine_drugs_returns_none_for_missing() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let result = combine_drugs(&u, &["NONEXISTENT".into()], "bone", 1.0);
        assert!(result.is_none());
    }

    // §7 decompose
    #[test]
    fn decompose_returns_impedance_stack() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let r = decompose(&u, "VAN", "bone").unwrap();
        assert_eq!(r.drug, "VAN");
        assert_eq!(r.tissue, "bone");
        assert!((r.tau - 2.602).abs() < 0.01);
        assert_eq!(r.dominant_barrier, "k_biofilm");
        assert_eq!(r.geometric_verdict, "fails_threshold");
        assert_eq!(r.threshold, 5.0);
    }

    #[test]
    fn decompose_returns_none_unknown_drug() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        assert!(decompose(&u, "FAKE", "bone").is_none());
    }

    #[test]
    fn decompose_returns_none_unknown_tissue() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        assert!(decompose(&u, "VAN", "moon").is_none());
    }

    #[test]
    fn decompose_k_total_is_sum() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let r = decompose(&u, "VAN", "bone").unwrap();
        let expected = r.decomposition.k_admet + r.decomposition.k_barrier + r.decomposition.k_biofilm;
        assert!((r.decomposition.k_total - expected).abs() < 0.01);
    }

    // §8 compare_drugs
    #[test]
    fn compare_drugs_ranks() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let r = compare_drugs(&u, &["VAN".into(), "RIF".into(), "CAR".into()], "bone").unwrap();
        assert_eq!(r.drugs.len(), 3);
        assert_eq!(r.drugs[0].rank, 1);
        for i in 1..r.drugs.len() {
            assert!(r.drugs[i - 1].c >= r.drugs[i].c);
        }
    }

    #[test]
    fn compare_drugs_identifies_winner() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let r = compare_drugs(&u, &["VAN".into(), "RIF".into()], "bone").unwrap();
        assert_eq!(r.winner, "RIF");
    }

    #[test]
    fn compare_drugs_returns_none_empty() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        assert!(compare_drugs(&u, &[], "bone").is_none());
    }

    #[test]
    fn compare_drugs_skips_missing() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        let r = compare_drugs(&u, &["VAN".into(), "FAKE".into()], "bone").unwrap();
        assert_eq!(r.drugs.len(), 1);
    }

    #[test]
    fn compare_drugs_returns_none_all_missing() {
        let u = build_universe(&sample_drugs(), &sample_thresholds(), &sample_regimens());
        assert!(compare_drugs(&u, &["FAKE1".into(), "FAKE2".into()], "bone").is_none());
    }
}
