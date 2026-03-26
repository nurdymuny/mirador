"""
MIRADOR Meningitis Module — Math Validation
Computes every number in MENINGITIS_SPEC v0.4 from first principles.
Zero fitted parameters beyond the single calibration point (C_threshold = 0.50).
"""
import math
import json

# ============================================================================
# Drug Registry (Table from spec)
# ============================================================================
DRUGS = {
    "ceftriaxone": {"auc24": 1000.0, "mic": 0.015, "r_base": 0.01, "r_peak": 0.15, "k_admet": 0.30},
    "vancomycin":  {"auc24": 400.0,  "mic": 1.0,   "r_base": 0.01, "r_peak": 0.18, "k_admet": 0.35},
    "rifampin":    {"auc24": 60.0,   "mic": 0.5,   "r_base": 0.15, "r_peak": 0.40, "k_admet": 0.25},
    "linezolid":   {"auc24": 250.0,  "mic": 2.0,   "r_base": 0.40, "r_peak": 0.70, "k_admet": 0.20},
}

# ============================================================================
# Layer M1: Patient parameters
# ============================================================================
T_HALF_NO_DEX = 4.0   # days
T_HALF_DEX = 1.5       # days
NEONATAL_R_MULTIPLIER = 3.0

# ============================================================================
# Layer M3: Phenotypic tolerance
# ============================================================================
PHENO_PLANKTONIC = {"weight": 0.9, "k": 0.0}
PHENO_SURFACE    = {"weight": 0.1, "k": math.log10(2.0)}  # ≈ 0.301

def k_phenotype_weighted():
    return PHENO_PLANKTONIC["weight"] * PHENO_PLANKTONIC["k"] + \
           PHENO_SURFACE["weight"] * PHENO_SURFACE["k"]

# ============================================================================
# Layer M4: Multi-reservoir geometry
# ============================================================================
RESERVOIRS = [
    {"name": "CSF Bulk",          "weight": 0.7, "access": 0.9},
    {"name": "Meningeal Surface", "weight": 0.2, "access": 0.5},
    {"name": "Brain Parenchyma",  "weight": 0.1, "access": 0.1},
]

def k_reservoir():
    return sum(r["weight"] * (1.0 - r["access"]) for r in RESERVOIRS)

# ============================================================================
# Core equations
# ============================================================================
def compute_tau(drug):
    return math.log10(drug["auc24"] / drug["mic"])

def r_bbb(t, r_base, r_peak, t_half):
    """Dynamic BBB permeability at time t (days)."""
    m_peak = r_peak / r_base
    return r_base * (1.0 + (m_peak - 1.0) * math.exp(-t * math.log(2) / t_half))

def k_barrier(r):
    """Barrier curvature from penetration ratio. Floor = 0."""
    return max(1.0 / r - 1.0, 0.0)

def k_pathway(drug, t, t_half, neonatal=False):
    """Total series impedance at time t."""
    r_base = drug["r_base"] * (NEONATAL_R_MULTIPLIER if neonatal else 1.0)
    r_peak = drug["r_peak"] * (NEONATAL_R_MULTIPLIER if neonatal else 1.0)
    # Clamp r_peak at 1.0 (can't exceed full permeability)
    r_peak = min(r_peak, 1.0)
    r_base = min(r_base, r_peak)
    r = r_bbb(t, r_base, r_peak, t_half)
    kb = k_barrier(r)
    kp = k_phenotype_weighted()
    kr = k_reservoir()
    return drug["k_admet"] + kb + kp + kr

def c_site(drug, t, t_half, neonatal=False):
    """Coherence C = tau / K_pathway at time t."""
    tau = compute_tau(drug)
    kp = k_pathway(drug, t, t_half, neonatal=neonatal)
    return tau / kp

def find_failure_time(drug, t_half, threshold=0.50, neonatal=False, max_t=100.0):
    """Binary search for the day C drops below threshold. Returns None if always above."""
    # Check if ever fails
    c_end = c_site(drug, max_t, t_half, neonatal=neonatal)
    if c_end >= threshold:
        return None  # never fails within max_t days

    lo, hi = 0.0, max_t
    for _ in range(200):
        mid = (lo + hi) / 2.0
        c = c_site(drug, mid, t_half, neonatal=neonatal)
        if c >= threshold:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0

# ============================================================================
# Kirchhoff parallel combination
# ============================================================================
def c_combo(drugs_list, t, t_half, synergy=1.0, neonatal=False):
    """Kirchhoff parallel-source combination C at time t."""
    conductances = []
    taus = []
    for drug in drugs_list:
        kp = k_pathway(drug, t, t_half, neonatal=neonatal)
        g = 1.0 / kp
        conductances.append(g)
        taus.append(compute_tau(drug))

    g_total = sum(conductances)
    tau_combo = sum(t * g for t, g in zip(taus, conductances)) / g_total
    return tau_combo * synergy * g_total

# ============================================================================
# VALIDATION — compute every spec number
# ============================================================================
def validate():
    results = {}
    ceft = DRUGS["ceftriaxone"]
    vanc = DRUGS["vancomycin"]
    rif  = DRUGS["rifampin"]
    lzd  = DRUGS["linezolid"]

    # --- TAU-1: Ceftriaxone tau ---
    tau_ceft = compute_tau(ceft)
    results["TAU-1_ceftriaxone_tau"] = round(tau_ceft, 3)
    assert abs(tau_ceft - 4.824) < 0.01, f"tau_ceft = {tau_ceft}"

    # --- K-RES-1: Reservoir curvature ---
    kr = k_reservoir()
    results["K-RES-1"] = round(kr, 3)
    assert abs(kr - 0.26) < 0.005, f"kr = {kr}"

    # --- K_phenotype (weighted) ---
    kph = k_phenotype_weighted()
    results["K_phenotype_weighted"] = round(kph, 4)
    # 0.9 * 0 + 0.1 * 0.301 = 0.0301
    assert abs(kph - 0.0301) < 0.001

    # --- K-BARRIER-1: Ceftriaxone at t=0 (inflamed) ---
    r_t0 = r_bbb(0, ceft["r_base"], ceft["r_peak"], T_HALF_DEX)
    kb_t0 = k_barrier(r_t0)
    results["K-BARRIER-1_ceft_t0"] = round(kb_t0, 3)
    assert abs(r_t0 - 0.15) < 0.001
    assert abs(kb_t0 - 5.667) < 0.01, f"kb_t0 = {kb_t0}"

    # --- Dex paradox: C at t=0 ---
    c_t0 = c_site(ceft, 0.0, T_HALF_DEX)
    results["C_ceft_t0"] = round(c_t0, 3)
    # Verify: K_pathway = 0.30 + 5.667 + 0.030 + 0.26 = 6.257
    kp_t0 = k_pathway(ceft, 0.0, T_HALF_DEX)
    results["K_pathway_ceft_t0"] = round(kp_t0, 3)
    assert c_t0 >= 0.50, f"C_ceft(t=0) = {c_t0} < 0.50"
    # Spec says C = 0.77, but recompute:
    # tau=4.824, K=0.30+5.667+0.030+0.26 = 6.257 → C = 4.824/6.257 = 0.771
    assert abs(c_t0 - 0.771) < 0.02, f"C_ceft_t0 = {c_t0}"

    # --- DEX-1 / DEX-2: half-lives ---
    results["DEX-1_t_half_dex"] = T_HALF_DEX
    results["DEX-2_t_half_no_dex"] = T_HALF_NO_DEX
    assert T_HALF_DEX == 1.5
    assert T_HALF_NO_DEX == 4.0

    # --- DEX-3: Failure times ---
    fail_dex = find_failure_time(ceft, T_HALF_DEX, threshold=0.50)
    fail_no_dex = find_failure_time(ceft, T_HALF_NO_DEX, threshold=0.50)
    results["DEX-3_fail_day_dex"] = round(fail_dex, 2)
    results["DEX-3_fail_day_no_dex"] = round(fail_no_dex, 2)
    assert fail_dex < fail_no_dex, f"Dex should fail earlier: {fail_dex} vs {fail_no_dex}"
    # Spec says ~0.98 with Dex, ~2.6 without
    assert abs(fail_dex - 0.98) < 0.15, f"fail_dex = {fail_dex}"
    assert abs(fail_no_dex - 2.6) < 0.3, f"fail_no_dex = {fail_no_dex}"

    # --- DEX-4: Linezolid never fails ---
    fail_lzd_dex = find_failure_time(lzd, T_HALF_DEX, threshold=0.50, max_t=30.0)
    fail_lzd_no_dex = find_failure_time(lzd, T_HALF_NO_DEX, threshold=0.50, max_t=30.0)
    results["DEX-4_lzd_fail_dex"] = fail_lzd_dex  # should be None
    results["DEX-4_lzd_fail_no_dex"] = fail_lzd_no_dex
    # Verify C at day 21 is still above threshold
    c_lzd_21_dex = c_site(lzd, 21.0, T_HALF_DEX)
    c_lzd_21_no_dex = c_site(lzd, 21.0, T_HALF_NO_DEX)
    results["DEX-4_C_lzd_day21_dex"] = round(c_lzd_21_dex, 3)
    results["DEX-4_C_lzd_day21_no_dex"] = round(c_lzd_21_no_dex, 3)
    assert c_lzd_21_dex >= 0.50, f"Linezolid should not fail at day 21 with Dex: C = {c_lzd_21_dex}"
    assert c_lzd_21_no_dex >= 0.50, f"Linezolid should not fail at day 21 without Dex: C = {c_lzd_21_no_dex}"

    # --- DEX-5: Vancomycin fails before Ceftriaxone under Dex ---
    fail_vanc_dex = find_failure_time(vanc, T_HALF_DEX, threshold=0.50)
    results["DEX-5_vanc_fail_dex"] = round(fail_vanc_dex, 2) if fail_vanc_dex else "NEVER"
    # Vancomycin: tau = log10(400/1) = 2.602, R_peak = 0.18 (slightly better than ceft)
    # But tau is much lower, so it should fail earlier despite slightly better R_peak
    # Let's check: at t=0, K_barrier_vanc = 1/0.18 - 1 = 4.556
    # K_pathway = 0.35 + 4.556 + 0.030 + 0.26 = 5.196
    # C_vanc_t0 = 2.602 / 5.196 = 0.501 — barely above threshold!
    c_vanc_t0 = c_site(vanc, 0.0, T_HALF_DEX)
    results["C_vanc_t0"] = round(c_vanc_t0, 3)
    if fail_vanc_dex is not None:
        assert fail_vanc_dex < fail_dex, f"Vancomycin should fail before ceftriaxone: {fail_vanc_dex} vs {fail_dex}"

    # --- NEO-1: Neonatal R_base multiplier ---
    r_base_neo = ceft["r_base"] * NEONATAL_R_MULTIPLIER
    results["NEO-1_r_base_neonate"] = r_base_neo
    assert abs(r_base_neo - 0.03) < 0.001

    # --- NEO-2: Neonatal failure time > adult failure time under Dex ---
    fail_neo_dex = find_failure_time(ceft, T_HALF_DEX, threshold=0.50, neonatal=True)
    results["NEO-2_fail_neo_dex"] = round(fail_neo_dex, 2) if fail_neo_dex else "NEVER"
    if fail_neo_dex is not None:
        assert fail_neo_dex > fail_dex, f"Neonatal should fail later: {fail_neo_dex} vs {fail_dex}"

    # --- COMBO-1: Ceftriaxone + Linezolid under Dex at day 14 ---
    c_combo_14 = c_combo([ceft, lzd], 14.0, T_HALF_DEX, synergy=1.0)
    results["COMBO-1_C_combo_day14_dex"] = round(c_combo_14, 3)
    assert c_combo_14 >= 0.50, f"Combo should stay above 0.50 at day 14: {c_combo_14}"

    # --- Drug ranking at t=0 (with Dex) ---
    ranking_t0 = {}
    for name, drug in DRUGS.items():
        c = c_site(drug, 0.0, T_HALF_DEX)
        ranking_t0[name] = round(c, 3)
    results["ranking_at_t0"] = ranking_t0
    # Sort by C descending
    sorted_ranking = sorted(ranking_t0.items(), key=lambda x: x[1], reverse=True)
    results["ranking_order_t0"] = [r[0] for r in sorted_ranking]

    # --- Asymptotic C (t → large, BBB sealed) ---
    asymptotic = {}
    for name, drug in DRUGS.items():
        c_inf = c_site(drug, 100.0, T_HALF_DEX)
        asymptotic[name] = round(c_inf, 3)
    results["asymptotic_C"] = asymptotic

    # --- Failure times for all drugs (with Dex) ---
    fail_times = {}
    for name, drug in DRUGS.items():
        ft = find_failure_time(drug, T_HALF_DEX, threshold=0.50)
        fail_times[name] = round(ft, 2) if ft else "NEVER"
    results["failure_times_dex"] = fail_times

    # --- Failure times (without Dex) ---
    fail_times_nd = {}
    for name, drug in DRUGS.items():
        ft = find_failure_time(drug, T_HALF_NO_DEX, threshold=0.50)
        fail_times_nd[name] = round(ft, 2) if ft else "NEVER"
    results["failure_times_no_dex"] = fail_times_nd

    return results


if __name__ == "__main__":
    results = validate()
    print(json.dumps(results, indent=2))
    print("\n=== ALL MATH VALIDATION PASSED ===")
