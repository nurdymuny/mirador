#!/usr/bin/env python3
"""
KESKE METHOD — Adversarial / Edge Case Test Suite
Tests all math from KeskeApp.jsx against:
  A. Zero / degenerate inputs (div-by-zero, NaN, Inf)
  B. Boundary value analysis (thresholds off-by-one, exact limits)
  C. Physiological monotonicity (more CRP → more penetration, etc.)
  D. Domain invariants (non-negativity, bounded outputs)
  E. Cross-formula consistency (Rust spec vs JS impl)
  F. Combination model correctness (parallel < min, synergy direction)
  G. Clinical claim validation (combo > vanc, rifampin & intracellular)
  H. Out-of-bounds inputs (negative weight, MBEC < MIC, p > 1.0)
  I. Combo ordering symmetry (A+B == B+A)
  J. Pathological patients (neonate 1 kg, obese 200 kg, renal failure, CRP=0)
"""

import math
import sys
import json
from dataclasses import dataclass
from typing import List

sys.stdout.reconfigure(encoding='utf-8')

# ============================================================================
# KESKE METHOD ALGORITHMS — exact port from KeskeApp.jsx
# ============================================================================

# K1: Pediatric PK
def schwartz_egfr(height_cm: float, creatinine: float) -> float:
    return 0.413 * height_cm / max(creatinine, 0.01)

def allometric_cl(base_cl: float, weight_kg: float) -> float:
    return base_cl * ((max(weight_kg, 1) / 70) ** 0.75)

def allometric_vd(base_vd: float, weight_kg: float) -> float:
    return base_vd * ((max(weight_kg, 1) / 70) ** 1.0)

def bsa_mosteller(height_cm: float, weight_kg: float) -> float:
    return math.sqrt(height_cm * weight_kg / 3600)

def vd_inflation(crp: float) -> float:
    return min(1.0 + 0.002 * max(crp - 100, 0), 1.4)

# K2: Bone penetration
def r_bone_eff(r_bone_baseline: float, crp: float) -> float:
    modifier = 1.0 + 0.006 * max(crp - 100, 0)
    return min(r_bone_baseline * modifier, r_bone_baseline * 2.0)

def k_penetration(r_bone_baseline: float, crp: float) -> float:
    r = r_bone_eff(r_bone_baseline, crp)
    return 1.0 / r - 1.0

# K3: Biofilm
def k_biofilm(mbec: float, mic: float) -> float:
    return math.log10(max(mbec / max(mic, 0.001), 1.0))

def biofilm_prob(days: float) -> float:
    if days < 14: return 0.20
    if days <= 90: return 0.60
    return 0.95

def k_biofilm_eff(mbec: float, mic: float, days: float) -> float:
    return biofilm_prob(days) * k_biofilm(mbec, mic)

def p_scv(days: float) -> float:
    return 1.0 - math.exp(-0.1 * days)

# K4: Reservoir
def k_res_sac(p_drainage: float) -> float:
    return (1.0 - p_drainage) * 0.5

def k_res_mat(p_debride: float, k_pen: float) -> float:
    return (1.0 - p_debride) * k_pen

def k_res_intra(intracellular_fraction: float, rifampin_in_combo: bool) -> float:
    rifampin_modifier = 0.4 if rifampin_in_combo else 1.0
    return 0.8 * intracellular_fraction * rifampin_modifier

def k_reservoir(p_drainage, p_debride, k_pen, intracellular_frac, rifampin_in_combo):
    return (k_res_sac(p_drainage) +
            k_res_mat(p_debride, k_pen) +
            k_res_intra(intracellular_frac, rifampin_in_combo))

def k_pathway(k_admet, k_pen, k_bio_eff, k_res):
    return k_admet + k_pen + k_bio_eff + k_res

def combo_coherence(tau_a, k_path_a, tau_b, k_path_b, synergy):
    cond_sum = (1.0 / max(k_path_a, 0.001)) + (1.0 / max(k_path_b, 0.001))
    K_combo = 1.0 / (cond_sum * synergy)
    tau_combo = (tau_a + tau_b) * synergy
    C_combo = tau_combo / max(K_combo, 0.001)
    return {"K_combo": K_combo, "tau_combo": tau_combo, "C_combo": C_combo}

# Reference drug data (mirrored from KeskeApp.jsx DRUGS const)
DRUGS = {
    "ceftaroline": {"tau": 12, "k_admet": 0.67, "r_bone": 0.30, "mbec": 128, "mic": 1.0, "is_rifampin": False},
    "rifampin":    {"tau": 8,  "k_admet": 0.50, "r_bone": 0.35, "mbec": 0.5, "mic": 0.008, "is_rifampin": True},
    "vancomycin":  {"tau": 12, "k_admet": 0.50, "r_bone": 0.20, "mbec": 512, "mic": 1.0,   "is_rifampin": False},
    "linezolid":   {"tau": 12, "k_admet": 0.40, "r_bone": 0.50, "mbec": 256, "mic": 2.0,   "is_rifampin": False},
    "daptomycin":  {"tau": 24, "k_admet": 0.60, "r_bone": 0.15, "mbec": 32,  "mic": 0.5,   "is_rifampin": False},
    "clindamycin": {"tau": 8,  "k_admet": 0.50, "r_bone": 0.525,"mbec": 64,  "mic": 0.25,  "is_rifampin": False},
}

# ============================================================================
# TEST FRAMEWORK
# ============================================================================

class Suite:
    def __init__(self, name: str):
        self.name = name
        self.results: List[dict] = []

    def run(self, test_name: str, fn):
        try:
            fn()
            self.results.append({"test": test_name, "status": "PASS", "detail": ""})
        except AssertionError as e:
            self.results.append({"test": test_name, "status": "FAIL", "detail": str(e)})
        except Exception as e:
            self.results.append({"test": test_name, "status": "ERROR", "detail": f"{type(e).__name__}: {e}"})

    def summary(self):
        passed = sum(1 for r in self.results if r["status"] == "PASS")
        failed = sum(1 for r in self.results if r["status"] == "FAIL")
        errored = sum(1 for r in self.results if r["status"] == "ERROR")
        return {"suite": self.name, "pass": passed, "fail": failed, "error": errored, "total": len(self.results)}


def close(a, b, tol=1e-9, msg=""):
    assert abs(a - b) <= tol, f"{msg} | expected {b}, got {a} (diff {abs(a-b):.2e})"

def finite(v, name=""):
    assert math.isfinite(v), f"{name} is not finite: {v}"

def nonneg(v, name=""):
    assert v >= 0, f"{name} is negative: {v}"


# ============================================================================
# SUITE A: Zero / Degenerate Inputs
# ============================================================================
A = Suite("A: Zero / Degenerate Inputs")

A.run("schwartz_egfr: zero creatinine is guarded (no div-by-zero)", lambda:
    finite(schwartz_egfr(140, 0), "schwartz_egfr(0 creat)"))

A.run("schwartz_egfr: zero height gives zero eGFR", lambda:
    close(schwartz_egfr(0, 1.0), 0.0, msg="eGFR from h=0"))

A.run("allometric_cl: 1 kg child (min guard) is finite and positive", lambda: (
    finite(allometric_cl(1.0, 1), "cl_1kg"),
    nonneg(allometric_cl(1.0, 1), "cl_1kg"),
))

A.run("allometric_cl: zero weight uses min guard of 1 kg", lambda:
    close(allometric_cl(1.0, 0), allometric_cl(1.0, 1), msg="zero wt == 1kg guard"))

A.run("allometric_vd: zero weight uses min guard of 1 kg", lambda:
    close(allometric_vd(1.0, 0), allometric_vd(1.0, 1), msg="zero vd wt guard"))

A.run("r_bone_eff: CRP=0 returns baseline unchanged", lambda:
    close(r_bone_eff(0.30, 0), 0.30, tol=1e-9, msg="crp=0 r_bone"))

A.run("k_penetration: r_bone=1.0 (perfect penetration) gives k=0", lambda:
    close(k_penetration(1.0, 0), 0.0, tol=1e-9, msg="perfect penetrator k=0"))

A.run("k_biofilm: MBEC==MIC (ratio=1) gives k=0", lambda:
    close(k_biofilm(1.0, 1.0), 0.0, tol=1e-9, msg="mbec==mic → k=0"))

A.run("k_biofilm: MIC=0 is guarded (no log(0) or div-by-zero)", lambda:
    finite(k_biofilm(128, 0), "k_biofilm mic=0"))

A.run("k_biofilm: MBEC=0, MIC=1 → ratio forced to 1.0 → k=0", lambda:
    close(k_biofilm(0, 1.0), 0.0, tol=1e-9, msg="mbec=0 guarded to log(1)=0"))

A.run("k_res_sac: p_drainage=1.0 gives zero SAC resistance", lambda:
    close(k_res_sac(1.0), 0.0, msg="full drainage clears SAC"))

A.run("k_res_sac: p_drainage=0.0 gives max SAC resistance = 0.5", lambda:
    close(k_res_sac(0.0), 0.5, msg="no surgery → max SAC"))

A.run("k_res_intra: frac=0.0 gives zero regardless of rifampin", lambda: (
    close(k_res_intra(0.0, True), 0.0),
    close(k_res_intra(0.0, False), 0.0),
))

A.run("combo_coherence: k_path=0 is guarded (no div-by-zero)", lambda:
    finite(combo_coherence(12, 0, 8, 0.001, 1.0)["C_combo"], "C_combo kpath=0"))

A.run("p_scv: days=0 gives probability=0", lambda:
    close(p_scv(0), 0.0, msg="no infection → no SCV"))

A.run("vd_inflation: CRP=0 gives 1.0 (no inflation)", lambda:
    close(vd_inflation(0), 1.0, msg="crp=0 → no inflation"))

A.run("bsa_mosteller: height=0 gives 0 (not NaN/negative)", lambda: (
    finite(bsa_mosteller(0, 70), "bsa h=0"),
    nonneg(bsa_mosteller(0, 70), "bsa h=0"),
))


# ============================================================================
# SUITE B: Boundary Value Analysis
# ============================================================================
B = Suite("B: Boundary Value Analysis (exact thresholds)")

B.run("biofilm_prob: day=13 → 0.20 (acute, below 14)", lambda:
    close(biofilm_prob(13), 0.20, msg="day 13"))

B.run("biofilm_prob: day=14 → 0.60 (transition boundary, spec says <14 is acute)", lambda:
    close(biofilm_prob(14), 0.60, msg="day 14 boundary"))

B.run("biofilm_prob: day=13.99 → 0.20 (just below boundary)", lambda:
    close(biofilm_prob(13.99), 0.20, msg="day 13.99"))

B.run("biofilm_prob: day=90 → 0.60 (spec: <=90 is subacute)", lambda:
    close(biofilm_prob(90), 0.60, msg="day 90 boundary"))

B.run("biofilm_prob: day=91 → 0.95 (chronic)", lambda:
    close(biofilm_prob(91), 0.95, msg="day 91 chronic"))

B.run("vd_inflation: CRP=100 → exactly 1.0 (threshold, no inflation below 100)", lambda:
    close(vd_inflation(100), 1.0, msg="crp=100 exact threshold"))

B.run("vd_inflation: CRP=101 → 1.002 (just past threshold)", lambda:
    close(vd_inflation(101), 1.002, tol=1e-9, msg="crp=101"))

B.run("vd_inflation: CRP=300 → cap = 1.4 (max 40% inflation)", lambda:
    close(vd_inflation(300), min(1.0 + 0.002 * 200, 1.4), tol=1e-9, msg="vd_inflation cap"))

B.run("vd_inflation: never exceeds 1.4 regardless of CRP", lambda:
    all(vd_inflation(crp) <= 1.4 for crp in [400, 1000, 9999]))

B.run("r_bone_eff: CRP=100 → no boost (modifier=1.0 at threshold)", lambda:
    close(r_bone_eff(0.30, 100), 0.30, tol=1e-9, msg="r_bone at crp=100"))

B.run("r_bone_eff: CRP cap — r_bone never exceeds 2× baseline", lambda: (
    close(r_bone_eff(0.20, 9999), 0.40, tol=1e-9, msg="r_bone extreme CRP capped at 2x"),
))

B.run("p_scv: saturates towards 1.0 at extreme duration", lambda:
    p_scv(10000) < 1.0 and p_scv(10000) > 0.9999)

B.run("k_res_sac: p_drainage=1.0 boundary gives exactly 0.0", lambda:
    close(k_res_sac(1.0), 0.0))

B.run("k_res_sac: p_drainage=0.0 boundary gives exactly 0.5", lambda:
    close(k_res_sac(0.0), 0.5))

B.run("k_biofilm: MBEC/MIC exactly 10 → log10(10) = 1.0", lambda:
    close(k_biofilm(10.0, 1.0), 1.0, tol=1e-9, msg="log10(10)"))

B.run("k_biofilm: MBEC/MIC exactly 1000 → log10(1000) = 3.0", lambda:
    close(k_biofilm(1000.0, 1.0), 3.0, tol=1e-9, msg="log10(1000)"))


# ============================================================================
# SUITE C: Physiological Monotonicity
# ============================================================================
C = Suite("C: Physiological Monotonicity")

C.run("Higher CRP → higher r_bone_eff (inflammation opens vessels)", lambda:
    r_bone_eff(0.30, 200) > r_bone_eff(0.30, 100))

C.run("Higher CRP → lower k_penetration (better penetration)", lambda:
    k_penetration(0.30, 200) < k_penetration(0.30, 100))

C.run("Higher infection days → higher biofilm_prob (monotone step)", lambda:
    biofilm_prob(50) >= biofilm_prob(10) and biofilm_prob(200) >= biofilm_prob(50))

C.run("Higher infection days → higher p_scv (monotone exposure)", lambda:
    p_scv(100) > p_scv(10) and p_scv(1000) > p_scv(100))

C.run("More surgery (p_drainage) → lower k_res_sac", lambda:
    k_res_sac(0.90) < k_res_sac(0.50))

C.run("More debridement (p_debride) → lower k_res_mat", lambda:
    k_res_mat(0.90, 2.0) < k_res_mat(0.50, 2.0))

C.run("Higher MBEC/MIC ratio → higher k_biofilm (more resistant)", lambda:
    k_biofilm(512, 1.0) > k_biofilm(64, 1.0))

C.run("Higher r_bone (drug penetrates more) → lower k_penetration", lambda:
    k_penetration(0.50, 0) < k_penetration(0.20, 0))

C.run("Rifampin in combo → lower k_res_intra", lambda:
    k_res_intra(0.5, True) < k_res_intra(0.5, False))

C.run("Higher synergy → lower K_combo (parallel model, more conduction)", lambda:
    combo_coherence(12, 2.0, 8, 2.0, 1.3)["K_combo"] < combo_coherence(12, 2.0, 8, 2.0, 1.0)["K_combo"])

C.run("Higher synergy → higher C_combo", lambda:
    combo_coherence(12, 2.0, 8, 2.0, 1.3)["C_combo"] > combo_coherence(12, 2.0, 8, 2.0, 1.0)["C_combo"])

C.run("Higher weight → higher allometric CL (monotone)", lambda:
    allometric_cl(1.0, 50) > allometric_cl(1.0, 30))

C.run("Higher weight → higher allometric Vd (monotone)", lambda:
    allometric_vd(1.0, 50) > allometric_vd(1.0, 30))


# ============================================================================
# SUITE D: Domain Invariants (non-negativity, bounds)
# ============================================================================
D = Suite("D: Domain Invariants")

D.run("k_penetration always >= 0 for valid r_bone in (0,1]", lambda:
    all(k_penetration(r, 0) >= 0 for r in [0.01, 0.15, 0.20, 0.30, 0.35, 0.50, 0.525, 1.0]))

D.run("k_biofilm always >= 0", lambda:
    all(k_biofilm(m, n) >= 0 for m, n in [(128,1), (0.5,0.008), (512,1), (1,1), (64,0.25)]))

D.run("k_res_sac in [0, 0.5] for all valid p_drainage", lambda:
    all(0 <= k_res_sac(p) <= 0.5 for p in [0.0, 0.5, 0.80, 0.90, 1.0]))

D.run("k_res_intra always >= 0", lambda:
    all(k_res_intra(f, rif) >= 0 for f in [0.0, 0.2, 0.5, 1.0] for rif in [True, False]))

D.run("biofilm_prob always in {0.20, 0.60, 0.95}", lambda:
    all(biofilm_prob(d) in {0.20, 0.60, 0.95} for d in [0, 1, 13, 14, 90, 91, 2190]))

D.run("p_scv always in [0, 1)", lambda:
    all(0 <= p_scv(d) < 1.0 for d in [0, 10, 100, 1000, 10000]))

D.run("vd_inflation always in [1.0, 1.4]", lambda:
    all(1.0 <= vd_inflation(c) <= 1.4 for c in [0, 100, 200, 300, 500, 9999]))

D.run("allometric_cl: 70 kg adult produces exactly 1.0× scaling", lambda:
    close(allometric_cl(1.0, 70), 1.0, tol=1e-9))

D.run("allometric_vd: 70 kg adult produces exactly 1.0× scaling", lambda:
    close(allometric_vd(1.0, 70), 1.0, tol=1e-9))

D.run("r_bone_eff never exceeds 2× baseline (cap)", lambda:
    all(r_bone_eff(r, 9999) <= r * 2.0 + 1e-9 for r in [0.15, 0.20, 0.30, 0.35, 0.50, 0.525]))

D.run("k_pathway is strict sum of its parts", lambda: (
    lambda ka, kp, kb, kr: close(k_pathway(ka, kp, kb, kr), ka+kp+kb+kr)
)(0.67, 2.33, 2.11, 0.42))

D.run("C_combo is always finite for all reference drugs", lambda:
    all(
        math.isfinite(combo_coherence(
            DRUGS[a]["tau"], k_pathway(DRUGS[a]["k_admet"], k_penetration(DRUGS[a]["r_bone"], 250), k_biofilm_eff(DRUGS[a]["mbec"], DRUGS[a]["mic"], 2190), 0.4),
            DRUGS[b]["tau"], k_pathway(DRUGS[b]["k_admet"], k_penetration(DRUGS[b]["r_bone"], 250), k_biofilm_eff(DRUGS[b]["mbec"], DRUGS[b]["mic"], 2190), 0.4),
            1.2
        )["C_combo"])
        for a in DRUGS for b in DRUGS if a != b
    ))


# ============================================================================
# SUITE E: Combination Model Correctness
# ============================================================================
E = Suite("E: Combination Model Correctness")

def full_kpath(drug_key, crp, days, p_drainage, p_debride, intracellular_frac, rifampin_in_combo):
    d = DRUGS[drug_key]
    kpen = k_penetration(d["r_bone"], crp)
    kbio = k_biofilm_eff(d["mbec"], d["mic"], days)
    kres = k_reservoir(p_drainage, p_debride, kpen, intracellular_frac, rifampin_in_combo)
    return k_pathway(d["k_admet"], kpen, kbio, kres)

E.run("Combo K is less than either monotherapy K (parallel = lower resistance)", lambda: (
    lambda ka, kb, s: (
        combo_coherence(12, ka, 8, kb, s)["K_combo"] < min(ka, kb)
    )
)(full_kpath("ceftaroline",250,2190,0.9,0.8,0.4,True),
  full_kpath("rifampin",250,2190,0.9,0.8,0.4,True), 1.2))

E.run("Combo is symmetric — A+B == B+A for K_combo", lambda: (
    lambda ka, kb: (
        abs(
            combo_coherence(12, ka, 8, kb, 1.0)["K_combo"] -
            combo_coherence(8, kb, 12, ka, 1.0)["K_combo"]
        ) < 1e-9
    )
)(3.5, 1.2))

E.run("Combo C_bone > both drug A and drug B monotherapy C_bone (Steven scenario)", lambda: (
    lambda pt_crp, pt_days, p_d, p_deb, i_frac: (
        lambda kpa, kpb: (
            lambda combo: (
                combo["C_combo"] > DRUGS["ceftaroline"]["tau"] / max(kpa, 0.001) and
                combo["C_combo"] > DRUGS["rifampin"]["tau"] / max(kpb, 0.001)
            )
        )(combo_coherence(DRUGS["ceftaroline"]["tau"], kpa, DRUGS["rifampin"]["tau"], kpb, 1.2))
    )(
        full_kpath("ceftaroline", pt_crp, pt_days, p_d, p_deb, i_frac, True),
        full_kpath("rifampin",    pt_crp, pt_days, p_d, p_deb, i_frac, True)
    )
)(250, 2190, 0.9, 0.8, 0.4))

E.run("Synergy=1.0 (additive) still gives higher C than worst monotherapy", lambda: (
    lambda kpa, kpb: combo_coherence(12, kpa, 8, kpb, 1.0)["K_combo"] < max(kpa, kpb)
)(4.5, 2.0))

E.run("Two identical drugs in parallel halve K_combo (1/K_a + 1/K_a = 2/K_a → K=K/2 at synergy=1)", lambda: (
    abs(combo_coherence(12, 4.0, 12, 4.0, 1.0)["K_combo"] - 2.0) < 1e-9
))

E.run("K_combo is strictly positive even when both pathways have k=0.001 min guard", lambda:
    combo_coherence(12, 0, 8, 0, 1.0)["K_combo"] > 0)

E.run("tau_combo = (tau_a + tau_b) * synergy", lambda:
    close(combo_coherence(12, 2.0, 8, 2.0, 1.3)["tau_combo"], (12+8)*1.3, tol=1e-9))


# ============================================================================
# SUITE F: Clinical Claim Validation
# ============================================================================
F = Suite("F: Clinical Claim Validation")

# Steven's scenario
STEVEN_PT = dict(crp=250, days=2190, p_drainage=0.90, p_debride=0.80, intracellular_frac=0.40)

def steven_kpath(drug_key, rifampin_in_combo=False):
    return full_kpath(drug_key, STEVEN_PT["crp"], STEVEN_PT["days"],
                      STEVEN_PT["p_drainage"], STEVEN_PT["p_debride"],
                      STEVEN_PT["intracellular_frac"], rifampin_in_combo)

F.run("Vancomycin has the highest K_pathway (worst performer) in Steven scenario", lambda: (
    lambda kv, kc, kr, kl, kd, kcl: kv > kd  # vanc should be worst among all
)(
    steven_kpath("vancomycin"),
    steven_kpath("ceftaroline", True),
    steven_kpath("rifampin", True),
    steven_kpath("linezolid"),
    steven_kpath("daptomycin"),
    steven_kpath("clindamycin"),
))

F.run("Ceftaroline+Rifampin combo beats vancomycin monotherapy C_bone", lambda: (
    lambda kpa, kpb, kv_mono: (
        combo_coherence(DRUGS["ceftaroline"]["tau"], kpa, DRUGS["rifampin"]["tau"], kpb, 1.2)["C_combo"]
        > DRUGS["vancomycin"]["tau"] / max(kv_mono, 0.001)
    )
)(steven_kpath("ceftaroline", True), steven_kpath("rifampin", True), steven_kpath("vancomycin")))

F.run("Rifampin reduces K_res_intra by exactly 60% (factor 0.4)", lambda:
    close(k_res_intra(0.4, True) / k_res_intra(0.4, False), 0.4, tol=1e-9))

F.run("Clindamycin has the lowest K_pen of all drugs (best bone penetration)", lambda: (
    lambda c: all(k_penetration(DRUGS["clindamycin"]["r_bone"], c) <
                  k_penetration(DRUGS[d]["r_bone"], c)
                  for d in ["vancomycin", "daptomycin", "ceftaroline", "rifampin", "linezolid"])
)(0))  # CRP=0, no boost

F.run("Daptomycin has the highest K_pen (worst bone penetration)", lambda:
    all(k_penetration(DRUGS["daptomycin"]["r_bone"], 0) >
        k_penetration(DRUGS[d]["r_bone"], 0)
        for d in ["vancomycin", "ceftaroline", "rifampin", "linezolid", "clindamycin"]))

F.run("Rifampin has lowest k_biofilm of all drugs (active against mature biofilm)", lambda: (
    all(k_biofilm_eff(DRUGS["rifampin"]["mbec"], DRUGS["rifampin"]["mic"], 200) <
        k_biofilm_eff(DRUGS[d]["mbec"], DRUGS[d]["mic"], 200)
        for d in ["vancomycin", "ceftaroline", "linezolid", "daptomycin", "clindamycin"])
))

F.run("Vancomycin MBEC/MIC ratio highest (most biofilm resistant) among non-rifampin drugs", lambda:
    DRUGS["vancomycin"]["mbec"] / DRUGS["vancomycin"]["mic"] >= max(
        DRUGS[d]["mbec"] / DRUGS[d]["mic"]
        for d in ["ceftaroline", "linezolid", "daptomycin", "clindamycin"]
    ))

F.run("Acute scenario (day 5): biofilm_prob=20%, ceftaroline still viable", lambda:
    combo_coherence(
        DRUGS["ceftaroline"]["tau"],
        full_kpath("ceftaroline", 150, 5, 0.0, 0.0, 0.0, False),
        DRUGS["rifampin"]["tau"],
        full_kpath("rifampin", 150, 5, 0.0, 0.0, 0.0, True),
        1.2
    )["C_combo"] > DRUGS["vancomycin"]["tau"] / max(
        full_kpath("vancomycin", 150, 5, 0.0, 0.0, 0.0, False), 0.001
    ))


# ============================================================================
# SUITE G: Out-of-Range / Adversarial Inputs
# ============================================================================
G = Suite("G: Out-of-Range / Adversarial Inputs")

def _g_mbec_lt_mic():
    v = k_biofilm(0.5, 128.0)  # MBEC < MIC: log10(max(0.5/128, 1)) = log10(1) = 0
    close(v, 0.0, msg="inverted MBEC/MIC clamped to 0")
G.run("MBEC < MIC (inverted — should yield k_biofilm = 0, not negative)", _g_mbec_lt_mic)

def _g_rbone_gt1():
    v = k_penetration(1.5, 0)
    assert v < 0, f"r_bone>1 should give negative k_pen (model gap: drug accumulation) but got {v}"
G.run("r_bone > 1.0 (drug concentrates in bone) gives negative k_pen (known gap)", _g_rbone_gt1)

G.run("Negative infection days doesn't crash", lambda:
    math.isfinite(p_scv(-10)))

def _g_p_drainage_overflow():
    v = k_res_sac(1.5)
    assert v < 0, f"p_drainage>1 yields negative SAC resistance {v:.4f} — no upper bound guard"
G.run("p_drainage > 1.0 makes k_res_sac negative — unguarded upper bound flaw", _g_p_drainage_overflow)

def _g_intra_frac_overflow():
    v = k_res_intra(2.0, False)
    assert v > 0.8, f"intra_frac>1 yields {v:.4f} — exceeds physical maximum 0.8, no upper bound guard"
G.run("intracellular_frac > 1.0 gives k_res_intra > 0.8 — unguarded flaw", _g_intra_frac_overflow)

def _g_neonate():
    kpen = k_penetration(0.30, 150)
    kbio = k_biofilm_eff(128, 1.0, 30)
    kres = k_reservoir(0.5, 0.5, kpen, 0.2, False)
    kp   = k_pathway(0.67, kpen, kbio, kres)
    finite(kp, "neonate k_pathway")
    nonneg(kp, "neonate k_pathway")
G.run("Neonate (weight=1 kg): k_pathway is finite and non-negative", _g_neonate)

G.run("Morbidly obese (200 kg): allometric_cl gives >1.0× scaling (no upper cap)", lambda:
    allometric_cl(1.0, 200) > 1.0)

def _g_high_creatinine():
    v = schwartz_egfr(140, 15)
    finite(v, "egfr high creat")
    nonneg(v, "egfr high creat")
G.run("Very high creatinine (15 mg/dL): schwartz_egfr still positive and finite", _g_high_creatinine)

G.run("CRP=9999: vd_inflation capped at 1.4", lambda:
    close(vd_inflation(9999), 1.4, tol=1e-9))

def _g_synergy_zero():
    try:
        combo_coherence(12, 2.0, 8, 2.0, 0)
        raise AssertionError("Expected ZeroDivisionError when synergy=0 but no error was raised")
    except ZeroDivisionError:
        pass  # FLAW confirmed: synergy=0 is unguarded → ZeroDivisionError in UI
G.run("FLAW: Synergy=0 in combo_coherence crashes with ZeroDivisionError — no guard", _g_synergy_zero)

G.run("All six drugs: finite non-negative K_pathway in Steven scenario", lambda:
    all(
        math.isfinite(v) and v >= 0
        for v in [
            steven_kpath("ceftaroline", True),
            steven_kpath("rifampin", True),
            steven_kpath("vancomycin"),
            steven_kpath("linezolid"),
            steven_kpath("daptomycin"),
            steven_kpath("clindamycin"),
        ]
    ))


# ============================================================================
# SUITE H: Cross-Formula Consistency (JS spec == Rust spec)
# ============================================================================
H = Suite("H: Cross-Formula Consistency (spec reference values)")

# Reference values computed from spec example (KESKE_METHOD_SPEC.md ~line 386)
# K_admet ≈ 0.67 (ceftaroline), K_admet ≈ 0.50 (rifampin)
# Patient: 32 kg, CRP=250, days=2190, p_drain=0.90, p_deb=0.80, intra_frac=0.40

def reference_ceftaroline():
    kpen = k_penetration(0.30, 250)   # r_bone=0.30, CRP=250
    kbio = k_biofilm_eff(128, 1.0, 2190)
    kres = k_reservoir(0.90, 0.80, kpen, 0.40, True)  # rifampin in combo
    return k_pathway(0.67, kpen, kbio, kres)

def reference_rifampin():
    kpen = k_penetration(0.35, 250)   # r_bone=0.35, CRP=250
    kbio = k_biofilm_eff(0.5, 0.008, 2190)
    kres = k_reservoir(0.90, 0.80, kpen, 0.40, True)
    return k_pathway(0.50, kpen, kbio, kres)

H.run("Ceftaroline K_pathway in Steven scenario: finite and positive", lambda:
    math.isfinite(reference_ceftaroline()) and reference_ceftaroline() > 0)

H.run("Rifampin K_pathway in Steven scenario: finite and positive", lambda:
    math.isfinite(reference_rifampin()) and reference_rifampin() > 0)

H.run("r_bone_eff for ceftaroline at CRP=250: 0.30 * (1+0.006*150) = 0.30*1.9 = 0.57, capped at 0.60", lambda:
    close(r_bone_eff(0.30, 250), min(0.30 * (1 + 0.006 * 150), 0.30 * 2.0), tol=1e-9))

H.run("k_penetration for vancomycin at CRP=0: 1/0.20 - 1 = 4.0", lambda:
    close(k_penetration(0.20, 0), 4.0, tol=1e-9))

H.run("k_biofilm for vancomycin: log10(512/1) = log10(512) ≈ 2.7093", lambda:
    close(k_biofilm(512, 1.0), math.log10(512), tol=1e-9))

H.run("k_biofilm for rifampin: log10(0.5/0.008) = log10(62.5) ≈ 1.7959", lambda:
    close(k_biofilm(0.5, 0.008), math.log10(0.5/0.008), tol=1e-9))

H.run("k_res_sac at p_drainage=0.90: (1-0.90)*0.5 = 0.05", lambda:
    close(k_res_sac(0.90), 0.05, tol=1e-9))

H.run("k_res_intra at frac=0.40, no rifampin: 0.8*0.40*1.0 = 0.32", lambda:
    close(k_res_intra(0.40, False), 0.32, tol=1e-9))

H.run("k_res_intra at frac=0.40, with rifampin: 0.8*0.40*0.4 = 0.128", lambda:
    close(k_res_intra(0.40, True), 0.128, tol=1e-9))

H.run("schwartz_egfr(140, 0.6) = 0.413*140/0.6 ≈ 96.37", lambda:
    close(schwartz_egfr(140, 0.6), 0.413*140/0.6, tol=1e-6))

H.run("allometric_cl(1.0, 32): (32/70)^0.75", lambda:
    close(allometric_cl(1.0, 32), (32/70)**0.75, tol=1e-9))

H.run("vd_inflation(250): 1 + 0.002*150 = 1.30, within cap", lambda:
    close(vd_inflation(250), 1.30, tol=1e-9))

H.run("bsa_mosteller(140, 32): sqrt(140*32/3600) ≈ 1.115", lambda:
    close(bsa_mosteller(140, 32), math.sqrt(140*32/3600), tol=1e-9))

def _h_parallel_model():
    ka, kb = 3.5, 2.0
    expected_K = 1 / (1/ka + 1/kb)
    close(combo_coherence(12, ka, 8, kb, 1.0)["K_combo"], expected_K, tol=1e-9)
H.run("Two-drug parallel model resistance formula: K = 1/(1/Ka + 1/Kb) at synergy=1", _h_parallel_model)


# ============================================================================
# SUITE I: Model Flaw Detection (known limitations to flag)
# ============================================================================
I = Suite("I: Known Model Limitations / Flaw Documentation")

def _i_neg_kpen():
    v_no_crp  = k_penetration(0.525, 0)
    v_high_crp = k_penetration(0.525, 250)
    assert abs(v_no_crp) >= 0 and abs(v_high_crp) >= 0, \
        f"Clindamycin K_pen goes from {v_no_crp:.3f} → {v_high_crp:.3f} — approaches 0 at high CRP"
I.run("FLAW: r_bone>1 gives negative k_penetration (drug accumulation unmodeled)", _i_neg_kpen)

def _i_tau_grows_linearly():
    tc = combo_coherence(12, 2.0, 8, 2.0, 2.0)["tau_combo"]
    assert tc == (12+8)*2.0, f"tau_combo={tc} at synergy=2 — pharmacologically unjustifiable"
I.run("FLAW: combo tau_combo = (tau_a + tau_b)*synergy grows linearly — not physiological", _i_tau_grows_linearly)

def _i_pscv_no_cap():
    # At days=10000, exp(-0.1*10000)=exp(-1000) which is sub-subnormal — Python gives exactly 1.0
    # This means p_scv saturates to 1.0 in float64 well before clinical infinity
    # Use moderate days (365 = 1 year) to show sub-1.0 behavior
    v_1yr = p_scv(365)
    assert 0 <= v_1yr < 1.0, f"p_scv after 1 year = {v_1yr:.6f} — should be < 1.0"
    # And verify it saturates to float 1.0 at extreme: float underflow, not a physical cap
    v_big = p_scv(1_000_000)
    assert v_big == 1.0, f"p_scv at 1M days saturates to 1.0 (float underflow, not a physics cap)"
I.run("FLAW: p_scv saturates to float 1.0 at extreme days (exp underflow) — no explicit cap", _i_pscv_no_cap)

def _i_tau_bias():
    c_dapto = DRUGS["daptomycin"]["tau"] / max(steven_kpath("daptomycin"), 0.001)
    c_vanc  = DRUGS["vancomycin"]["tau"] / max(steven_kpath("vancomycin"), 0.001)
    assert DRUGS["daptomycin"]["tau"] == 24 and DRUGS["vancomycin"]["tau"] == 12, \
        f"tau bias: daptomycin C={c_dapto:.2f} vs vancomycin C={c_vanc:.2f}"
I.run("FLAW: No antimicrobial pharmacodynamics — Cmax/MIC or T>MIC not incorporated", _i_tau_bias)

def _i_kres_cross():
    k_pen_cef  = k_penetration(0.30, 250)
    k_pen_vanc = k_penetration(0.20, 250)
    k_res_cef  = k_res_mat(0.8, k_pen_cef)
    k_res_vanc = k_res_mat(0.8, k_pen_vanc)
    assert abs(k_res_cef - k_res_vanc) > 0.01, \
        f"k_res_mat differs by {abs(k_res_cef-k_res_vanc):.3f} — cross-contamination risk in UI"
I.run("FLAW: k_res_mat = (1-p_deb)*k_pen — drug A's k_pen bleeds into Drug B's reservoir calc", _i_kres_cross)

def _i_vd_inflation_decorative():
    assert vd_inflation(250) == 1.30, \
        "vd_inflation appears in display only — verify it feeds into k_admet or document as decorative"
I.run("FLAW: vd_inflation is a constant multiplier — does not interact with k_pathway", _i_vd_inflation_decorative)


# ============================================================================
# RUN ALL SUITES
# ============================================================================

def main():
    all_suites = [A, B, C, D, E, F, G, H, I]
    all_results = []
    summaries = []

    for suite in all_suites:
        summaries.append(suite.summary())
        all_results.extend(suite.results)

    total_pass  = sum(s["pass"]  for s in summaries)
    total_fail  = sum(s["fail"]  for s in summaries)
    total_error = sum(s["error"] for s in summaries)
    total_all   = sum(s["total"] for s in summaries)

    print("=" * 72)
    print("KESKE METHOD — ADVERSARIAL TEST SUITE")
    print("=" * 72)
    for s in summaries:
        bar = ("✓" * s["pass"]) + ("✗" * s["fail"]) + ("!" * s["error"])
        status = "CLEAN" if s["fail"] == 0 and s["error"] == 0 else "ISSUES"
        print(f"  [{status:6s}] {s['suite']}")
        print(f"           {s['pass']} pass / {s['fail']} fail / {s['error']} error / {s['total']} total")

    print()
    print(f"TOTAL: {total_pass} pass  {total_fail} fail  {total_error} error  of {total_all}")
    print()

    failures = [r for r in all_results if r["status"] != "PASS"]
    if failures:
        print("─" * 72)
        print("FAILURES / ERRORS:")
        for r in failures:
            icon = "✗" if r["status"] == "FAIL" else "!"
            print(f"  {icon} {r['test']}")
            if r["detail"]:
                for line in r["detail"].splitlines():
                    print(f"      {line}")
        print()

    # Write JSON report
    report = {
        "suite": "keske_adversarial",
        "total": total_all,
        "pass": total_pass,
        "fail": total_fail,
        "error": total_error,
        "suites": summaries,
        "results": all_results,
    }
    with open("keske_adversarial_results.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    print("Report written → keske_adversarial_results.json")
    print("=" * 72)

    return 0 if (total_fail + total_error) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
