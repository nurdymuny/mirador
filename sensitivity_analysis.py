"""
MIRADOR Sensitivity Analysis: K_ADMET and R Perturbation
=========================================================
Tests robustness of drug rank orderings under parameter perturbation.

Two analyses:
  1. K_ADMET perturbation: ±50% on all K_ADMET values → check rank stability
  2. R perturbation: ±30% on all tissue:plasma ratios → check rank stability

Output: Which predictions are robust (rank-stable) vs sensitive (rank-unstable).

Author: Davis Geometric
Date: March 29, 2026
"""

import math
import json
from dataclasses import dataclass
from typing import Optional


@dataclass
class Drug:
    name: str
    disease: str
    compartment: str
    tau: float
    k_admet: float
    R: float  # tissue:plasma ratio
    k_biofilm: Optional[float] = None  # only for MRSA biofilm


def compute_C(tau, k_admet, R, k_biofilm=None):
    """Compute coherence C = tau / K_total."""
    if R <= 0:
        return 0.0
    k_barrier = max(1.0 / R - 1.0, -1.0)
    k_total = k_admet + k_barrier
    if k_biofilm is not None:
        k_total += k_biofilm
    if k_total <= 0:
        return float('inf')  # concentrating
    return tau / k_total


def rank_drugs(drugs):
    """Return list of (drug_name, C) sorted descending by C."""
    results = []
    for d in drugs:
        c = compute_C(d.tau, d.k_admet, d.R, d.k_biofilm)
        results.append((d.name, c))
    results.sort(key=lambda x: -x[1])
    return results


def rank_order(drugs):
    """Return just the name ordering."""
    return [name for name, _ in rank_drugs(drugs)]


# ============================================================
# DRUG DATA — from published PK literature, all spec files
# ============================================================

DISEASE_PANELS = {}

# --- HIV: 5 drugs × 5 compartments ---
HIV_DRUGS_BASE = [
    # (name, tau, k_admet, R_per_compartment)
    ("DTG", 5.39, 0.05, {"cns": 0.01, "lymph": 0.48, "galt": 0.35, "genital": 0.07, "marrow": 0.40}),
    ("TFV", 2.18, 0.15, {"cns": 0.05, "lymph": 0.33, "galt": 0.50, "genital": 3.50, "marrow": 0.30}),
    ("FTC", 3.70, 0.05, {"cns": 0.03, "lymph": 0.40, "galt": 0.55, "genital": 1.80, "marrow": 0.35}),
    ("DRV", 5.15, 0.10, {"cns": 0.05, "lymph": 0.70, "galt": 0.45, "genital": 0.15, "marrow": 0.35}),
    ("EFV", 5.26, 0.08, {"cns": 0.005, "lymph": 0.55, "galt": 0.40, "genital": 0.02, "marrow": 0.30}),
]

for compartment in ["cns", "lymph", "galt", "genital", "marrow"]:
    key = f"HIV_{compartment}"
    DISEASE_PANELS[key] = [
        Drug(name=name, disease="HIV", compartment=compartment,
             tau=tau, k_admet=k_admet, R=R_dict[compartment])
        for name, tau, k_admet, R_dict in HIV_DRUGS_BASE
    ]

# --- MENINGITIS: 4 drugs × 2 BBB states ---
MENING_DRUGS = [
    # (name, tau, k_admet, R_uninflamed, R_inflamed)
    ("CRO", 4.82, 0.30, 0.01, 0.15),
    ("VAN", 2.60, 0.35, 0.01, 0.18),
    ("RIF", 2.08, 0.25, 0.15, 0.40),
    ("LZD", 2.10, 0.20, 0.40, 0.70),
]

for state, r_idx in [("uninflamed", 3), ("inflamed", 4)]:
    key = f"MENING_{state}"
    DISEASE_PANELS[key] = [
        Drug(name=d[0], disease="Meningitis", compartment=state,
             tau=d[1], k_admet=d[2], R=d[r_idx])
        for d in MENING_DRUGS
    ]

# --- TB: drugs at caseum (the critical compartment) ---
# Using data from prospective_prediction_QUANTUM_TB.md + MIRADOR_SPEC
TB_CASEUM_DRUGS = [
    # (name, tau, k_admet, R_caseum)
    ("INH", 2.38, 0.10, 0.05),
    ("RIF", 3.00, 0.10, 0.10),
    ("PZA", 0.78, 0.10, 0.80),
    ("EMB", 1.10, 0.10, 0.03),
    ("MXF", 2.45, 0.10, 1.50),
    ("BDQ", 3.60, 0.10, 2.00),
    ("LZD", 1.65, 0.10, 0.60),
]

DISEASE_PANELS["TB_caseum"] = [
    Drug(name=name, disease="TB", compartment="caseum",
         tau=tau, k_admet=k_admet, R=R)
    for name, tau, k_admet, R in TB_CASEUM_DRUGS
]

# TB at cellular granuloma
TB_CELLULAR_DRUGS = [
    ("INH", 2.38, 0.10, 0.60),
    ("RIF", 3.00, 0.10, 0.20),
    ("PZA", 0.78, 0.10, 0.70),
    ("EMB", 1.10, 0.10, 1.50),
    ("MXF", 2.45, 0.10, 2.50),
    ("BDQ", 3.60, 0.10, 4.00),
    ("LZD", 1.65, 0.10, 1.00),
]

DISEASE_PANELS["TB_cellular"] = [
    Drug(name=name, disease="TB", compartment="cellular",
         tau=tau, k_admet=k_admet, R=R)
    for name, tau, k_admet, R in TB_CELLULAR_DRUGS
]

# --- MRSA BONE (Keske Method): 6 drugs × bone compartment ---
MRSA_BONE_DRUGS = [
    # (name, tau, k_admet, R_bone, k_biofilm)
    ("VAN", 12.0, 0.50, 0.20, 2.71),
    ("CAR", 12.0, 0.67, 0.30, 2.11),
    ("DAP", 24.0, 0.60, 0.15, 1.81),
    ("LZD", 12.0, 0.40, 0.50, 2.11),
    ("CLI", 8.0,  0.50, 0.525, 2.41),
    ("RIF", 8.0,  0.50, 0.35, 1.80),
]

# MRSA at bone (no biofilm)
DISEASE_PANELS["MRSA_bone"] = [
    Drug(name=name, disease="MRSA", compartment="bone",
         tau=tau, k_admet=k_admet, R=R_bone)
    for name, tau, k_admet, R_bone, _ in MRSA_BONE_DRUGS
]

# MRSA at biofilm
DISEASE_PANELS["MRSA_biofilm"] = [
    Drug(name=name, disease="MRSA", compartment="biofilm",
         tau=tau, k_admet=k_admet, R=R_bone, k_biofilm=k_bio)
    for name, tau, k_admet, R_bone, k_bio in MRSA_BONE_DRUGS
]

# --- Clo-Fast vs SOC at caseum (QUANTUM-TB retroactive) ---
CLOFAST_CASEUM = [
    ("RPT", 3.766, 0.15, 0.10),
    ("INH", 2.380, 0.10, 0.05),
    ("PZA", 0.778, 0.10, 0.80),
    ("EMB", 1.097, 0.10, 0.03),
    ("CFZ", 0.903, 0.10, 0.05),
]

DISEASE_PANELS["CloFast_caseum"] = [
    Drug(name=name, disease="CloFast", compartment="caseum",
         tau=tau, k_admet=k_admet, R=R)
    for name, tau, k_admet, R in CLOFAST_CASEUM
]

# --- Endocarditis: 8 drugs ---
ENDO_DRUGS = [
    ("NAF", 3.60, 0.10, 0.20),
    ("CEF", 3.54, 0.10, 0.15),
    ("VAN", 2.60, 0.10, 0.10),
    ("DAP", 3.18, 0.10, 0.15),
    ("GEN", 2.15, 0.10, 0.05),
    ("RIF", 3.90, 0.10, 0.50),
    ("CRO", 3.54, 0.10, 0.12),
    ("LZD", 2.00, 0.10, 0.35),
]

DISEASE_PANELS["Endocarditis_vegetation"] = [
    Drug(name=name, disease="Endocarditis", compartment="vegetation",
         tau=tau, k_admet=k_admet, R=R)
    for name, tau, k_admet, R in ENDO_DRUGS
]

# --- Abscess: 8 drugs at capsule ---
ABSCESS_DRUGS = [
    ("MET", 2.11, 0.10, 0.12),
    ("CLI", 2.08, 0.10, 0.08),
    ("CIP", 3.14, 0.10, 0.06),
    ("MER", 2.80, 0.10, 0.03),
    ("TZP", 2.70, 0.10, 0.02),
    ("CRO", 3.96, 0.10, 0.02),
    ("GEN", 2.15, 0.10, 0.01),
    ("VAN", 2.60, 0.10, 0.01),
]

DISEASE_PANELS["Abscess_capsule"] = [
    Drug(name=name, disease="Abscess", compartment="capsule",
         tau=tau, k_admet=k_admet, R=R)
    for name, tau, k_admet, R in ABSCESS_DRUGS
]


# ============================================================
# PERTURBATION ANALYSIS
# ============================================================

def perturb_k_admet(drugs, factor):
    """Return new drug list with K_ADMET scaled by factor."""
    return [
        Drug(name=d.name, disease=d.disease, compartment=d.compartment,
             tau=d.tau, k_admet=d.k_admet * factor, R=d.R, k_biofilm=d.k_biofilm)
        for d in drugs
    ]


def perturb_R(drugs, factor):
    """Return new drug list with R scaled by factor."""
    return [
        Drug(name=d.name, disease=d.disease, compartment=d.compartment,
             tau=d.tau, k_admet=d.k_admet, R=d.R * factor, k_biofilm=d.k_biofilm)
        for d in drugs
    ]


def kendall_tau_distance(rank_a, rank_b):
    """Count pairwise rank swaps (inversions) between two orderings."""
    n = len(rank_a)
    if n != len(rank_b):
        return -1
    pos_b = {name: i for i, name in enumerate(rank_b)}
    swaps = 0
    for i in range(n):
        for j in range(i + 1, n):
            a_i = rank_a.index(rank_a[i])
            a_j = rank_a.index(rank_a[j])
            b_i = pos_b.get(rank_a[i], -1)
            b_j = pos_b.get(rank_a[j], -1)
            if b_i < 0 or b_j < 0:
                continue
            if (a_i - a_j) * (b_i - b_j) < 0:
                swaps += 1
    total_pairs = n * (n - 1) // 2
    return swaps, total_pairs


def run_perturbation(panel_name, drugs, param_name, factors):
    """Run perturbation analysis for one disease panel."""
    baseline_order = rank_order(drugs)
    baseline_ranked = rank_drugs(drugs)

    results = {
        "panel": panel_name,
        "parameter": param_name,
        "n_drugs": len(drugs),
        "baseline_ranking": baseline_ranked,
        "perturbations": [],
        "rank_stable": True,
    }

    for factor in factors:
        if param_name == "K_ADMET":
            perturbed = perturb_k_admet(drugs, factor)
        else:
            perturbed = perturb_R(drugs, factor)

        perturbed_order = rank_order(perturbed)
        perturbed_ranked = rank_drugs(perturbed)
        swaps, total = kendall_tau_distance(baseline_order, perturbed_order)
        changed = baseline_order != perturbed_order

        if changed:
            results["rank_stable"] = False

        results["perturbations"].append({
            "factor": factor,
            "pct": f"{(factor - 1) * 100:+.0f}%",
            "new_ranking": perturbed_ranked,
            "rank_changed": changed,
            "swaps": swaps,
            "total_pairs": total,
        })

    return results


def format_ranking(ranked):
    """Format ranking as string: #1 Drug (C=X.XX), #2 Drug (C=X.XX), ..."""
    parts = []
    for i, (name, c) in enumerate(ranked):
        if c == float('inf'):
            parts.append(f"#{i+1} {name} (C=∞)")
        else:
            parts.append(f"#{i+1} {name} (C={c:.2f})")
    return "  →  ".join(parts)


def main():
    print("=" * 100)
    print("MIRADOR SENSITIVITY ANALYSIS — K_ADMET and R Perturbation")
    print("=" * 100)
    print()

    k_admet_factors = [0.50, 0.70, 0.85, 1.15, 1.30, 1.50]  # ±50%
    r_factors = [0.70, 0.80, 0.90, 1.10, 1.20, 1.30]  # ±30%

    all_results = []
    summary_k = {"total_panels": 0, "stable_panels": 0, "total_perturbations": 0, "rank_changes": 0}
    summary_r = {"total_panels": 0, "stable_panels": 0, "total_perturbations": 0, "rank_changes": 0}

    for panel_name, drugs in sorted(DISEASE_PANELS.items()):
        # --- K_ADMET perturbation ---
        res_k = run_perturbation(panel_name, drugs, "K_ADMET", k_admet_factors)
        all_results.append(res_k)
        summary_k["total_panels"] += 1
        summary_k["total_perturbations"] += len(k_admet_factors)
        if res_k["rank_stable"]:
            summary_k["stable_panels"] += 1
        else:
            for p in res_k["perturbations"]:
                if p["rank_changed"]:
                    summary_k["rank_changes"] += 1

        # --- R perturbation ---
        res_r = run_perturbation(panel_name, drugs, "R", r_factors)
        all_results.append(res_r)
        summary_r["total_panels"] += 1
        summary_r["total_perturbations"] += len(r_factors)
        if res_r["rank_stable"]:
            summary_r["stable_panels"] += 1
        else:
            for p in res_r["perturbations"]:
                if p["rank_changed"]:
                    summary_r["rank_changes"] += 1

    # === Print detailed results ===
    for panel_name, drugs in sorted(DISEASE_PANELS.items()):
        print(f"\n{'─' * 100}")
        print(f"  PANEL: {panel_name}  ({len(drugs)} drugs)")
        print(f"{'─' * 100}")

        baseline = rank_drugs(drugs)
        print(f"\n  BASELINE: {format_ranking(baseline)}")

        # K_ADMET results
        res_k = next(r for r in all_results if r["panel"] == panel_name and r["parameter"] == "K_ADMET")
        print(f"\n  K_ADMET perturbation (±50%):")
        for p in res_k["perturbations"]:
            status = "  ✅ STABLE" if not p["rank_changed"] else f"  ❌ CHANGED ({p['swaps']}/{p['total_pairs']} swaps)"
            print(f"    {p['pct']:>5s}: {status}")
            if p["rank_changed"]:
                print(f"           NEW: {format_ranking(p['new_ranking'])}")

        # R results
        res_r = next(r for r in all_results if r["panel"] == panel_name and r["parameter"] == "R")
        print(f"\n  R perturbation (±30%):")
        for p in res_r["perturbations"]:
            status = "  ✅ STABLE" if not p["rank_changed"] else f"  ❌ CHANGED ({p['swaps']}/{p['total_pairs']} swaps)"
            print(f"    {p['pct']:>5s}: {status}")
            if p["rank_changed"]:
                print(f"           NEW: {format_ranking(p['new_ranking'])}")

    # === Summary ===
    print(f"\n\n{'=' * 100}")
    print("SUMMARY")
    print(f"{'=' * 100}")

    total_panels = summary_k["total_panels"]
    print(f"\n  Disease panels analyzed: {total_panels}")
    print(f"  Drugs across all panels: {sum(len(d) for d in DISEASE_PANELS.values())}")
    print()

    print(f"  K_ADMET PERTURBATION (±50%):")
    print(f"    Panels with ZERO rank changes: {summary_k['stable_panels']}/{total_panels}")
    print(f"    Total perturbation tests: {summary_k['total_perturbations']}")
    print(f"    Rank changes: {summary_k['rank_changes']}/{summary_k['total_perturbations']}")
    k_stability = summary_k["stable_panels"] / total_panels * 100 if total_panels > 0 else 0
    print(f"    Panel stability rate: {k_stability:.0f}%")
    print()

    print(f"  R PERTURBATION (±30%):")
    print(f"    Panels with ZERO rank changes: {summary_r['stable_panels']}/{total_panels}")
    print(f"    Total perturbation tests: {summary_r['total_perturbations']}")
    print(f"    Rank changes: {summary_r['rank_changes']}/{summary_r['total_perturbations']}")
    r_stability = summary_r["stable_panels"] / total_panels * 100 if total_panels > 0 else 0
    print(f"    Panel stability rate: {r_stability:.0f}%")
    print()

    # Which is more dangerous?
    print(f"  VERDICT:")
    if summary_k["rank_changes"] == 0 and summary_r["rank_changes"] == 0:
        print(f"    Both K_ADMET (±50%) and R (±30%) produce ZERO rank changes.")
        print(f"    All predictions are robust to parameter perturbation.")
    elif summary_k["rank_changes"] < summary_r["rank_changes"]:
        print(f"    K_ADMET perturbation is MORE ROBUST than R perturbation.")
        print(f"    K_ADMET: {summary_k['rank_changes']} rank changes")
        print(f"    R:       {summary_r['rank_changes']} rank changes")
        print(f"    → R values are the greater vulnerability (Attack 6 > Attack 3)")
    elif summary_r["rank_changes"] < summary_k["rank_changes"]:
        print(f"    R perturbation is MORE ROBUST than K_ADMET perturbation.")
        print(f"    K_ADMET: {summary_k['rank_changes']} rank changes")
        print(f"    R:       {summary_r['rank_changes']} rank changes")
    else:
        print(f"    Both produce equal rank instability:")
        print(f"    K_ADMET: {summary_k['rank_changes']} rank changes")
        print(f"    R:       {summary_r['rank_changes']} rank changes")

    print()

    # List specifically which panels are sensitive
    sensitive_k = [r["panel"] for r in all_results if r["parameter"] == "K_ADMET" and not r["rank_stable"]]
    sensitive_r = [r["panel"] for r in all_results if r["parameter"] == "R" and not r["rank_stable"]]

    if sensitive_k:
        print(f"  K_ADMET-SENSITIVE panels: {', '.join(sensitive_k)}")
    if sensitive_r:
        print(f"  R-SENSITIVE panels: {', '.join(sensitive_r)}")
    if not sensitive_k and not sensitive_r:
        print(f"  NO SENSITIVE PANELS — all rank orderings are perturbation-invariant.")

    print(f"\n{'=' * 100}")
    print("END OF SENSITIVITY ANALYSIS")
    print(f"{'=' * 100}")

    # Save JSON for supplementary table
    output = {
        "analysis": "MIRADOR Sensitivity Analysis",
        "date": "2026-03-29",
        "k_admet_perturbation_range": "±50%",
        "r_perturbation_range": "±30%",
        "summary": {
            "k_admet": {
                "stable_panels": summary_k["stable_panels"],
                "total_panels": total_panels,
                "rank_changes": summary_k["rank_changes"],
                "total_tests": summary_k["total_perturbations"],
            },
            "r_values": {
                "stable_panels": summary_r["stable_panels"],
                "total_panels": total_panels,
                "rank_changes": summary_r["rank_changes"],
                "total_tests": summary_r["total_perturbations"],
            },
        },
        "sensitive_panels_k_admet": sensitive_k,
        "sensitive_panels_r": sensitive_r,
    }

    with open("sensitivity_analysis_results.json", "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nResults saved to sensitivity_analysis_results.json")


if __name__ == "__main__":
    main()
