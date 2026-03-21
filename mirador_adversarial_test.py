#!/usr/bin/env python3
"""
MIRADOR Adversarial Data / Edge Case Test Suite
Branch XI — Therapeutic Geometry  
Davis Lab / Davis Geometric

Tests the exact algorithms from MiradorApp.jsx against:
  A. Zero / degenerate inputs
  B. Exact boundary values (off-by-one in thresholds)
  C. Physiological monotonicity
  D. PK formula internal consistency
  E. Coherence advantage claims (C_ceft vs C_vanco)
  F. Research claims (gate probability, MIC coverage, eigenvalue ordering)
  G. Adversarial numerical inputs (negatives, extremes, NaN guards)
  H. Cross-formula independence checks
"""

import math
import sys
import json
from dataclasses import dataclass, field
from typing import List, Tuple

sys.stdout.reconfigure(encoding='utf-8')

# ============================================================================
# MIRADOR ALGORITHMS — exact 1-to-1 port from MiradorApp.jsx
# ============================================================================

@dataclass
class PatientInputs:
    age: float
    weight: float
    egfr: float
    alt: float
    albumin: float
    vancoTrough: float
    priorMero: float


def js_max(a, b):
    """Mirrors Math.max in JavaScript"""
    return max(a, b)


def compute_curvature(pt: PatientInputs):
    """
    Direct port of the reactive computed vars in MiradorApp.jsx.
    Returns a dict of every intermediate value.
    """
    K_abs       = 0.00
    K_dist      = (0.20 * (pt.albumin / 4.0)) ** 2
    K_met       = 0.05
    K_exc       = (90.0 / js_max(pt.egfr, 1.0)) ** 2 * 0.10
    K_tox_base  = 0.05 + (0.15 if pt.vancoTrough > 15 else 0.0)
    K_collateral = 0.10 if pt.priorMero < 90 else 0.0
    K_tox       = K_tox_base + K_collateral
    Kt          = K_abs + K_dist + K_met + K_exc + K_tox

    tau         = 12.0          # ceftaroline dosing interval
    tau_vanco   = 4.0
    K_vanco     = 0.0 + 0.1 + 0.05 + ((90.0 / js_max(pt.egfr, 1.0)) ** 2 * 0.30) + 0.8

    C_ceft      = tau      / js_max(Kt,     0.01)
    C_vanco     = tau_vanco / js_max(K_vanco, 0.01)

    # PK
    Vd          = 28.0 * (1.0 + (1.0 - pt.albumin / 4.0) * 0.3)
    CL          = 150.0 * (pt.egfr / 90.0) * 60.0 / 1000.0  # L/hr
    ke          = CL / js_max(Vd, 1.0)
    tHalf       = 0.693 / js_max(ke, 0.01)
    dose        = 400.0 if pt.egfr < 50 else 600.0
    Cmax        = dose / js_max(Vd, 1.0)
    Ctrough     = Cmax * math.exp(-ke * 12.0)

    return dict(
        K_abs=K_abs, K_dist=K_dist, K_met=K_met, K_exc=K_exc,
        K_tox_base=K_tox_base, K_collateral=K_collateral, K_tox=K_tox, Kt=Kt,
        tau=tau, tau_vanco=tau_vanco, K_vanco=K_vanco,
        C_ceft=C_ceft, C_vanco=C_vanco,
        Vd=Vd, CL=CL, ke=ke, tHalf=tHalf, dose=dose,
        Cmax=Cmax, Ctrough=Ctrough,
    )


# Default / reference patient from the demo
DEFAULT_PT = PatientInputs(
    age=68, weight=82, egfr=45, alt=85,
    albumin=2.5, vancoTrough=18, priorMero=14
)

EIGENVALUES = [1.59, 1.56, 1.36, 0.76]   # from MiradorApp.jsx (useMemo)

# ============================================================================
# TEST FRAMEWORK
# ============================================================================

class AdversarialSuite:
    def __init__(self):
        self.results: List[dict] = []
        self.pass_count = 0
        self.fail_count = 0

    def record(self, name: str, passed: bool, details: str, group: str = ""):
        mark = "[+] PASS" if passed else "[-] FAIL"
        print(f"  {mark}  {name}")
        if details:
            for line in details.strip().split("\n"):
                print(f"         {line}")
        self.results.append(dict(name=name, passed=passed, details=details, group=group))
        if passed:
            self.pass_count += 1
        else:
            self.fail_count += 1

    def summary(self):
        total = self.pass_count + self.fail_count
        print("\n" + "=" * 72)
        print("MIRADOR ADVERSARIAL TEST SUMMARY")
        print("=" * 72)
        print(f"Total:  {total}")
        print(f"Passed: {self.pass_count}")
        print(f"Failed: {self.fail_count}")
        print(f"Rate:   {100 * self.pass_count / total:.1f}%")

        if self.fail_count:
            print("\nFailed tests:")
            for r in self.results:
                if not r["passed"]:
                    print(f"  [-] {r['name']}")
                    for line in r["details"].strip().split("\n"):
                        print(f"       {line}")
        print("=" * 72)
        return self.pass_count, total


suite = AdversarialSuite()


# ============================================================================
# GROUP A: ZERO / DEGENERATE INPUTS
# ============================================================================
print("\n" + "=" * 72)
print("GROUP A: ZERO / DEGENERATE INPUTS")
print("=" * 72)


# A-1: Anephric patient (eGFR = 0)
pt_anephric = PatientInputs(age=68, weight=82, egfr=0,  alt=85,
                             albumin=2.5, vancoTrough=18, priorMero=14)
v = compute_curvature(pt_anephric)

K_exc_anephric_expected = (90.0 / 1.0) ** 2 * 0.10  # Math.max(0,1) = 1
suite.record(
    "A-1: eGFR=0 → K_exc uses Math.max guard (no division by zero)",
    abs(v["K_exc"] - K_exc_anephric_expected) < 1e-10,
    f"K_exc = {v['K_exc']:.6f}, expected {K_exc_anephric_expected:.6f}\n"
    f"(90/1)² × 0.10 = 8100 × 0.10 = 810.0",
    group="A"
)

suite.record(
    "A-2: eGFR=0 → C_ceft is finite (Kt clamped by max(Kt,0.01))",
    math.isfinite(v["C_ceft"]) and v["C_ceft"] > 0,
    f"Kt = {v['Kt']:.4f}, C_ceft = {v['C_ceft']:.6f}  "
    f"(very low but finite — dialysis patient)",
    group="A"
)

suite.record(
    "A-3: eGFR=0 → CL=0 → ke=0 → Ctrough equals Cmax (no renal elimination)",
    abs(v["ke"]) < 1e-10 and abs(v["Ctrough"] - v["Cmax"]) < 1e-10,
    f"CL={v['CL']:.6f} L/hr, ke={v['ke']:.6f} /hr\n"
    f"Cmax={v['Cmax']:.4f} μg/mL, Ctrough={v['Ctrough']:.4f} μg/mL  "
    f"(equal: drug doesn't clear)",
    group="A"
)

suite.record(
    "A-4: eGFR=0 → tHalf clamped by max(ke,0.01) → tHalf = 0.693/0.01 = 69.3 h",
    abs(v["tHalf"] - 69.3) < 1e-6,
    f"tHalf = {v['tHalf']:.6f} h (expected 69.3 h = renal failure ceiling)",
    group="A"
)


# A-5: Albumin = 0 (theoretical floor)
pt_no_albumin = PatientInputs(age=68, weight=82, egfr=45, alt=85,
                               albumin=0.0, vancoTrough=18, priorMero=14)
v_na = compute_curvature(pt_no_albumin)

suite.record(
    "A-5: Albumin=0 → K_dist = 0 (no protein-binding friction)",
    abs(v_na["K_dist"]) < 1e-15,
    f"K_dist = {v_na['K_dist']:.2e}  (formula: (0.20 × 0/4.0)² = 0)",
    group="A"
)

Vd_no_albumin_expected = 28.0 * (1.0 + (1.0 - 0.0 / 4.0) * 0.3)
suite.record(
    "A-6: Albumin=0 → Vd expands to 28 × 1.3 = 36.4 L (low protein binding)",
    abs(v_na["Vd"] - 36.4) < 1e-10,
    f"Vd = {v_na['Vd']:.6f} L, expected 36.4 L",
    group="A"
)


# A-6b: All inputs at physiological zero (stress test for NaN/inf)
pt_zeros = PatientInputs(age=0, weight=0, egfr=0, alt=0, albumin=0,
                          vancoTrough=0, priorMero=0)
v_z = compute_curvature(pt_zeros)

suite.record(
    "A-7: All inputs=0 → no NaN, no Inf anywhere in output",
    all(math.isfinite(x) for x in v_z.values()),
    f"C_ceft={v_z['C_ceft']:.4f}, C_vanco={v_z['C_vanco']:.4f}, "
    f"Vd={v_z['Vd']:.4f}, ke={v_z['ke']:.4f}  (all finite)",
    group="A"
)

suite.record(
    "A-8: All inputs=0 → all curvature components ≥ 0 (non-negativity)",
    all([v_z["K_dist"] >= 0, v_z["K_met"] >= 0, v_z["K_exc"] >= 0,
         v_z["K_tox"] >= 0, v_z["Kt"] >= 0, v_z["K_vanco"] >= 0]),
    f"K_dist={v_z['K_dist']:.4f}, K_met={v_z['K_met']:.4f}, "
    f"K_exc={v_z['K_exc']:.4f}, K_tox={v_z['K_tox']:.4f}, Kt={v_z['Kt']:.4f}",
    group="A"
)


# ============================================================================
# GROUP B: EXACT THRESHOLD BOUNDARIES
# ============================================================================
print("\n" + "=" * 72)
print("GROUP B: EXACT THRESHOLD BOUNDARIES (off-by-epsilon tests)")
print("=" * 72)

EPS = 1e-9  # numerical epsilon for boundary straddling

# B-1/2/3: vancoTrough threshold at 15.0
for label, trough, expected_penalty in [
    ("vancoTrough=15.0 exactly",  15.0,     0.0),    # NOT > 15 → no penalty
    ("vancoTrough=15+ε",          15.0+EPS, 0.15),   # > 15 → +0.15
    ("vancoTrough=14.99",         14.99,    0.0),    # < 15 → no penalty
    ("vancoTrough=15.01",         15.01,    0.15),   # > 15 → +0.15
]:
    pt_bt = PatientInputs(age=68, weight=82, egfr=45, alt=85,
                           albumin=2.5, vancoTrough=trough, priorMero=14)
    v_bt = compute_curvature(pt_bt)
    actual_penalty = v_bt["K_tox_base"] - 0.05
    suite.record(
        f"B-{label}: K_tox_base penalty = {expected_penalty}",
        abs(actual_penalty - expected_penalty) < 1e-12,
        f"vancoTrough={trough}, K_tox_base={v_bt['K_tox_base']:.6f}  "
        f"(base 0.05 + penalty {actual_penalty:.6f}, expected {expected_penalty})",
        group="B"
    )

# B-5/6/7: priorMero threshold at 90
for label, mero, expected_collateral in [
    ("priorMero=90 exactly", 90,    0.0),   # NOT < 90 → no collateral
    ("priorMero=89",         89,    0.10),  # < 90 → collateral
    ("priorMero=91",         91,    0.0),   # > 90 → no collateral
    ("priorMero=90-ε",       90-EPS,0.10),  # just under 90 → collateral
]:
    pt_bm = PatientInputs(age=68, weight=82, egfr=45, alt=85,
                           albumin=2.5, vancoTrough=18, priorMero=mero)
    v_bm = compute_curvature(pt_bm)
    suite.record(
        f"B-{label}: K_collateral = {expected_collateral}",
        abs(v_bm["K_collateral"] - expected_collateral) < 1e-12,
        f"priorMero={mero}, K_collateral={v_bm['K_collateral']:.6f}  "
        f"(expected {expected_collateral})",
        group="B"
    )

# B-8/9: eGFR dose threshold at 50
for label, egfr_val, expected_dose in [
    ("eGFR=50 exactly", 50,    600.0),  # NOT < 50 → 600 mg
    ("eGFR=49",         49,    400.0),  # < 50 → 400 mg
    ("eGFR=50.01",      50.01, 600.0),
    ("eGFR=49.99",      49.99, 400.0),
]:
    pt_bd = PatientInputs(age=68, weight=82, egfr=egfr_val, alt=85,
                           albumin=2.5, vancoTrough=18, priorMero=14)
    v_bd = compute_curvature(pt_bd)
    suite.record(
        f"B-{label}: dose = {expected_dose} mg",
        abs(v_bd["dose"] - expected_dose) < 1e-9,
        f"eGFR={egfr_val}, dose={v_bd['dose']} mg  (expected {expected_dose} mg)",
        group="B"
    )


# ============================================================================
# GROUP C: PHYSIOLOGICAL MONOTONICITY
# ============================================================================
print("\n" + "=" * 72)
print("GROUP C: PHYSIOLOGICAL MONOTONICITY")
print("=" * 72)

# C-1: K_exc decreases monotonically as eGFR increases 1 → 200
egfrs = [1, 5, 10, 20, 30, 45, 60, 90, 120, 150, 200]
K_exc_vals = []
for eg in egfrs:
    pt_c = PatientInputs(age=68, weight=82, egfr=eg, alt=85,
                          albumin=2.5, vancoTrough=18, priorMero=14)
    K_exc_vals.append(compute_curvature(pt_c)["K_exc"])

mono_exc = all(K_exc_vals[i] >= K_exc_vals[i+1] for i in range(len(K_exc_vals)-1))
suite.record(
    "C-1: K_exc strictly decreasing as eGFR increases 1→200",
    mono_exc,
    f"eGFR:  {egfrs}\n"
    f"K_exc: {[f'{k:.4f}' for k in K_exc_vals]}",
    group="C"
)

# C-2: tHalf decreases monotonically as eGFR increases (faster clearance)
tHalf_vals = []
for eg in egfrs:
    pt_c = PatientInputs(age=68, weight=82, egfr=eg, alt=85,
                          albumin=2.5, vancoTrough=18, priorMero=14)
    tHalf_vals.append(compute_curvature(pt_c)["tHalf"])

mono_tHalf = all(tHalf_vals[i] >= tHalf_vals[i+1] for i in range(len(tHalf_vals)-1))
suite.record(
    "C-2: tHalf strictly decreasing as eGFR increases (faster elimination)",
    mono_tHalf,
    f"eGFR:  {egfrs}\n"
    f"tHalf: {[f'{t:.2f}' for t in tHalf_vals]} h",
    group="C"
)

# C-3: C_vanco is monotonically dependent ONLY on eGFR (not albumin/trough/mero)
# Vary albumin — C_vanco should be constant
albumins = [1.0, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
C_vanco_vs_albumin = []
for alb in albumins:
    pt_c = PatientInputs(age=68, weight=82, egfr=45, alt=85,
                          albumin=alb, vancoTrough=18, priorMero=14)
    C_vanco_vs_albumin.append(compute_curvature(pt_c)["C_vanco"])

all_equal_albumin = max(C_vanco_vs_albumin) - min(C_vanco_vs_albumin) < 1e-12
suite.record(
    "C-3: C_vanco is INDEPENDENT of albumin (K_vanco formula doesn't use albumin)",
    all_equal_albumin,
    f"C_vanco across albumin {albumins}:\n"
    f"  {[f'{c:.6f}' for c in C_vanco_vs_albumin]}\n"
    f"  Range = {max(C_vanco_vs_albumin)-min(C_vanco_vs_albumin):.2e}",
    group="C"
)

# C-4: C_vanco is INDEPENDENT of vancoTrough
troughs = [0, 5, 10, 15, 16, 20, 25, 30]
C_vanco_vs_trough = []
for tr in troughs:
    pt_c = PatientInputs(age=68, weight=82, egfr=45, alt=85,
                          albumin=2.5, vancoTrough=tr, priorMero=14)
    C_vanco_vs_trough.append(compute_curvature(pt_c)["C_vanco"])

all_equal_trough = max(C_vanco_vs_trough) - min(C_vanco_vs_trough) < 1e-12
suite.record(
    "C-4: C_vanco is INDEPENDENT of vancoTrough (watch: K_tox_base affects Kt only)",
    all_equal_trough,
    f"C_vanco across trough {troughs}:\n"
    f"  {[f'{c:.6f}' for c in C_vanco_vs_trough]}\n"
    f"NOTE: dropping trough ≤15 improves C_ceft (reduces Kt) but NOT C_vanco",
    group="C"
)

# C-5: C_ceft DOES change with vancoTrough (via K_tox_base in Kt)
C_ceft_trough_hi = compute_curvature(
    PatientInputs(68, 82, 45, 85, 2.5, 20, 14))["C_ceft"]
C_ceft_trough_lo = compute_curvature(
    PatientInputs(68, 82, 45, 85, 2.5, 12, 14))["C_ceft"]
suite.record(
    "C-5: C_ceft DOES improve as vancoTrough drops from 20 → 12 (less K_tox_base)",
    C_ceft_trough_lo > C_ceft_trough_hi,
    f"C_ceft (trough=20, toxic): {C_ceft_trough_hi:.4f}\n"
    f"C_ceft (trough=12, safe):  {C_ceft_trough_lo:.4f}\n"
    f"Improvement: {(C_ceft_trough_lo/C_ceft_trough_hi - 1)*100:.1f}%",
    group="C"
)

# C-6: Kt is always non-negative across the physiological parameter space
import itertools
n_violations = 0
for egfr_v in [0, 10, 45, 90, 150]:
    for alb_v in [0, 1, 2.5, 4, 5]:
        for tr_v in [0, 10, 15, 20, 30]:
            for mero_v in [0, 30, 90, 180]:
                pt_s = PatientInputs(68, 82, egfr_v, 85, alb_v, tr_v, mero_v)
                v_s = compute_curvature(pt_s)
                if v_s["Kt"] < 0:
                    n_violations += 1

suite.record(
    "C-6: Kt ≥ 0 across 500 physiological combinations (no negative curvature)",
    n_violations == 0,
    f"Kt < 0 violations: {n_violations} / 500  "
    f"(expected 0 — curvature is always a friction, never a boost)",
    group="C"
)

# C-7: K_dist increases with albumin (more protein binding = more distribution friction)
K_dist_vals = []
for alb in [0.0, 1.0, 2.0, 3.0, 4.0, 5.0]:
    pt_c = PatientInputs(68, 82, 45, 85, alb, 18, 14)
    K_dist_vals.append(compute_curvature(pt_c)["K_dist"])

mono_dist = all(K_dist_vals[i] <= K_dist_vals[i+1] for i in range(len(K_dist_vals)-1))
suite.record(
    "C-7: K_dist monotonically increases with albumin (protein binding friction)",
    mono_dist,
    f"Albumin [0,1,2,3,4,5] g/dL → K_dist:\n  "
    f"{[f'{k:.6f}' for k in K_dist_vals]}",
    group="C"
)


# ============================================================================
# GROUP D: PK FORMULA INTERNAL CONSISTENCY
# ============================================================================
print("\n" + "=" * 72)
print("GROUP D: PK FORMULA INTERNAL CONSISTENCY")
print("=" * 72)

# D-1: Ctrough < Cmax for all eGFR > 0 (drug must eliminate some)
pks_ok = True
failing = []
for eg in [1, 10, 30, 45, 60, 90, 120]:
    pt_d = PatientInputs(68, 82, eg, 85, 2.5, 18, 14)
    v_d = compute_curvature(pt_d)
    if v_d["Ctrough"] >= v_d["Cmax"]:
        pks_ok = False
        failing.append(eg)

suite.record(
    "D-1: Ctrough < Cmax for all eGFR > 0 (some elimination must occur)",
    pks_ok,
    f"Tested eGFR ∈ {{1,10,30,45,60,90,120}}, failing: {failing if failing else 'none'}",
    group="D"
)

# D-2: Ctrough = Cmax when eGFR = 0 (ke = 0, no clearance)
v_d2 = compute_curvature(PatientInputs(68, 82, 0, 85, 2.5, 18, 14))
suite.record(
    "D-2: Ctrough = Cmax when eGFR=0 (ke=0, CL=0, zero elimination)",
    abs(v_d2["Ctrough"] - v_d2["Cmax"]) < 1e-10,
    f"ke={v_d2['ke']:.2e}, Cmax={v_d2['Cmax']:.4f}, Ctrough={v_d2['Ctrough']:.4f}",
    group="D"
)

# D-3: tHalf × ke ≈ 0.693 (fundamental relationship)
for eg in [10, 45, 90]:
    pt_d3 = PatientInputs(68, 82, eg, 85, 2.5, 18, 14)
    v_d3 = compute_curvature(pt_d3)
    # tHalf = 0.693 / max(ke, 0.01); so tHalf * max(ke,0.01) = 0.693
    product = v_d3["tHalf"] * js_max(v_d3["ke"], 0.01)
    suite.record(
        f"D-3: tHalf × max(ke,0.01) = 0.693 (eGFR={eg})",
        abs(product - 0.693) < 1e-12,
        f"ke={v_d3['ke']:.6f}/hr, tHalf={v_d3['tHalf']:.4f}h, product={product:.12f}",
        group="D"
    )

# D-4: Ctrough / Cmax = exp(-ke × 12) by definition
for eg in [30, 45, 90, 120]:
    pt_d4 = PatientInputs(68, 82, eg, 85, 2.5, 18, 14)
    v_d4 = compute_curvature(pt_d4)
    expected_ratio = math.exp(-v_d4["ke"] * 12.0)
    actual_ratio = v_d4["Ctrough"] / v_d4["Cmax"]
    suite.record(
        f"D-4: Ctrough/Cmax = exp(-ke×12) exactly (eGFR={eg})",
        abs(actual_ratio - expected_ratio) < 1e-12,
        f"ke={v_d4['ke']:.6f}, exp(-ke×12)={expected_ratio:.8f}, "
        f"Ctrough/Cmax={actual_ratio:.8f}",
        group="D"
    )

# D-5: Vd stays positive across physiological albumin range 0.5–6 g/dL
for alb in [0.5, 1.0, 2.0, 3.5, 4.0, 5.0, 6.0]:
    pt_d5 = PatientInputs(68, 82, 45, 85, alb, 18, 14)
    v_d5 = compute_curvature(pt_d5)
    suite.record(
        f"D-5: Vd > 0 for albumin={alb} g/dL",
        v_d5["Vd"] > 0,
        f"Vd = {v_d5['Vd']:.4f} L",
        group="D"
    )

# D-6: Vd formula — verify algebraically for normal albumin
# Vd(albumin=4) = 28 × (1 + (1-1) × 0.3) = 28 × 1 = 28
v_normal_alb = compute_curvature(PatientInputs(68, 82, 45, 85, 4.0, 14, 180))
suite.record(
    "D-6: Vd = 28 L when albumin = 4 g/dL (normal reference point)",
    abs(v_normal_alb["Vd"] - 28.0) < 1e-12,
    f"Vd(albumin=4) = {v_normal_alb['Vd']:.10f} L  (expected 28.0 L)",
    group="D"
)

# D-7: dose step function — verify the exact boundary produces 600  
v_egfr50 = compute_curvature(PatientInputs(68, 82, 50.0, 85, 2.5, 18, 14))
v_egfr49 = compute_curvature(PatientInputs(68, 82, 49.999, 85, 2.5, 18, 14))
suite.record(
    "D-7: dose = 600 mg at eGFR=50.0 (threshold is strictly < 50)",
    v_egfr50["dose"] == 600.0 and v_egfr49["dose"] == 400.0,
    f"dose(eGFR=50.0) = {v_egfr50['dose']} mg  (expected 600)\n"
    f"dose(eGFR=49.999) = {v_egfr49['dose']} mg  (expected 400)",
    group="D"
)


# ============================================================================
# GROUP E: COHERENCE ADVANTAGE CLAIMS
# ============================================================================
print("\n" + "=" * 72)
print("GROUP E: COHERENCE ADVANTAGE CLAIMS (C_ceft vs C_vanco)")
print("=" * 72)

# E-1: Default patient — C_ceft > C_vanco (the whole premise)
v_default = compute_curvature(DEFAULT_PT)
suite.record(
    "E-1: Default patient: C_ceft > C_vanco (ceftaroline advantage)",
    v_default["C_ceft"] > v_default["C_vanco"],
    f"C_ceft  = {v_default['C_ceft']:.4f}\n"
    f"C_vanco = {v_default['C_vanco']:.4f}\n"
    f"Ratio   = {v_default['C_ceft']/v_default['C_vanco']:.2f}×",
    group="E"
)

# E-2: Coherence ratio ≈ 8–10× for default patient (explainer claims "9×")
ratio = v_default["C_ceft"] / v_default["C_vanco"]
suite.record(
    "E-2: C_ceft/C_vanco ≈ 8–10× for default patient (explainer claims ~9×)",
    8.0 <= ratio <= 10.5,
    f"Ratio = {ratio:.4f}  (target: 8–10.5)",
    group="E"
)

# E-3: C_vanco < 5 (TREATMENT FAILING threshold for default patient)
suite.record(
    "E-3: Default patient C_vanco < 5 (TREATMENT FAILING threshold)",
    v_default["C_vanco"] < 5.0,
    f"C_vanco = {v_default['C_vanco']:.4f}  (threshold: C < 5 = failing)",
    group="E"
)

# E-4: C_ceft > 10 for default patient (effective treatment threshold)
suite.record(
    "E-4: Default patient C_ceft > 10 (EFFECTIVE treatment range)",
    v_default["C_ceft"] > 10.0,
    f"C_ceft = {v_default['C_ceft']:.4f}  (threshold: C > 10 = effective)",
    group="E"
)

# E-5: C_vanco display matches toFixed(1) = "1.9" as stated in the UI title
c_vanco_str = f"{v_default['C_vanco']:.1f}"
suite.record(
    "E-5: C_vanco.toFixed(1) for default patient = '1.9' (matches header title)",
    c_vanco_str == "1.9",
    f"C_vanco = {v_default['C_vanco']:.6f}  → toFixed(1) = '{c_vanco_str}'",
    group="E"
)

# E-6: C_ceft > C_vanco holds for ALL combinations of physiological inputs
ceft_advantage_always = True
worst_case = None
worst_ratio = float("inf")
for eg in [10, 30, 45, 60, 90, 120]:
    for alb in [1.0, 2.5, 4.0]:
        for tr in [10, 15, 18, 25]:
            for mero in [7, 14, 90, 200]:
                pt_e = PatientInputs(68, 82, eg, 85, alb, tr, mero)
                v_e = compute_curvature(pt_e)
                r = v_e["C_ceft"] / v_e["C_vanco"]
                if v_e["C_ceft"] <= v_e["C_vanco"]:
                    ceft_advantage_always = False
                    worst_case = dict(egfr=eg, albumin=alb, trough=tr, mero=mero)
                if r < worst_ratio:
                    worst_ratio = r

suite.record(
    "E-6: C_ceft > C_vanco for all physiological input combinations (288 cases)",
    ceft_advantage_always,
    f"Minimum observed ratio: {worst_ratio:.4f}×\n"
    + (f"Worst case: {worst_case}" if not ceft_advantage_always else "All 288 cases: C_ceft > C_vanco ✓"),
    group="E"
)

# E-7: Kt additivity — Kt = K_abs + K_dist + K_met + K_exc + K_tox exactly
V = v_default
K_sum = V["K_abs"] + V["K_dist"] + V["K_met"] + V["K_exc"] + V["K_tox"]
suite.record(
    "E-7: Kt = K_abs + K_dist + K_met + K_exc + K_tox (additivity holds exactly)",
    abs(K_sum - V["Kt"]) < 1e-12,
    f"Sum = {K_sum:.12f}\nKt  = {V['Kt']:.12f}\n|diff| = {abs(K_sum-V['Kt']):.2e}",
    group="E"
)

# E-8: K_vanco breakdown matches formula constants
# K_vanco = 0.0 + 0.1 + 0.05 + ((90/max(egfr,1))² × 0.30) + 0.8
K_vanco_manual = 0.0 + 0.1 + 0.05 + ((90.0 / js_max(DEFAULT_PT.egfr, 1.0))**2 * 0.30) + 0.8
suite.record(
    "E-8: K_vanco manual reconstruction matches compute_curvature output",
    abs(V["K_vanco"] - K_vanco_manual) < 1e-12,
    f"K_vanco (formula) = {K_vanco_manual:.8f}\n"
    f"K_vanco (output)  = {V['K_vanco']:.8f}",
    group="E"
)


# ============================================================================
# GROUP F: RESEARCH CLAIMS VERIFICATION
# ============================================================================
print("\n" + "=" * 72)
print("GROUP F: RESEARCH CLAIMS FROM THE LITERATURE")
print("=" * 72)

# F-1: Gate opening probability p = e^(-ΔG/kT) ≈ 0.03% at T=37°C
# ΔG = 5 kcal/mol, kB = 0.001987 kcal/(mol·K), T = 310K
k_B = 0.001987   # kcal/(mol·K)
T_body = 310.0   # Kelvin
delta_G = 5.0    # kcal/mol
kT = k_B * T_body
gate_prob = math.exp(-delta_G / kT)
suite.record(
    "F-1: Gate opening probability = exp(-5/kT) at 37°C ≈ 0.03%",
    0.0001 <= gate_prob <= 0.001,   # roughly 0.03% = 0.0003
    f"kT = {kT:.5f} kcal/mol\n"
    f"p = exp(-{delta_G}/{kT:.5f}) = {gate_prob:.6f} = {gate_prob*100:.4f}%\n"
    f"(UI states '0.03%' — computed {gate_prob*100:.4f}% ✓)",
    group="F"
)

# F-2: Gate probability rounded to 2 sig figs matches UI claim
gate_pct_rounded = f"{gate_prob*100:.2f}%"
suite.record(
    "F-2: Gate prob to 2 sig figs is in the 0.02%–0.04% range (UI says 0.03%)",
    0.02 <= gate_prob * 100 <= 0.04,
    f"p = {gate_prob*100:.4f}%  → displayed as '{gate_pct_rounded}'",
    group="F"
)

# F-3: Eigenvalue ordering — E150K is the highest vulnerability
suite.record(
    "F-3: Eigenvalue ordering λ₁ > λ₂ > λ₃ > λ₄ (E150K is primary escape)",
    all(EIGENVALUES[i] > EIGENVALUES[i+1] for i in range(len(EIGENVALUES)-1)),
    f"λ = {EIGENVALUES}\n"
    f"λ₁={EIGENVALUES[0]} (E150K gate) > λ₂={EIGENVALUES[1]} (N146K) > "
    f"λ₃={EIGENVALUES[2]} (Y446N) > λ₄={EIGENVALUES[3]} (E239K)",
    group="F"
)

# F-4: Eigenvalues are all positive (eigenvalues of curvature operator R_∇ > 0)
suite.record(
    "F-4: All eigenvalues are positive (physically: all escape routes have positive cost)",
    all(e > 0 for e in EIGENVALUES),
    f"All λ > 0: {all(e > 0 for e in EIGENVALUES)}",
    group="F"
)

# F-5: E150K ΔΔG_fold = 1.2 kcal/mol "survivable" — check it's < thermal energy × 5
# At 37°C, kT ≈ 0.616 kcal/mol; 5 kT ≈ 3.08 kcal/mol (survivable fitness cost)
# E150K fitness cost = 1.2 kcal/mol < 5 kT = 3.08 kcal/mol → survivable
E150K_fitness_cost = 1.2  # kcal/mol (from the explainer text)
thermal_threshold = 5 * kT  # "survivable" = within 5 kT
suite.record(
    "F-5: E150K fitness cost (1.2 kcal/mol) < 5 kT → survivable under pressure",
    E150K_fitness_cost < thermal_threshold,
    f"ΔΔG(E150K) = {E150K_fitness_cost} kcal/mol\n"
    f"5 kT = {thermal_threshold:.3f} kcal/mol\n"
    f"Ratio: {E150K_fitness_cost/thermal_threshold:.2f}× below threshold ✓",
    group="F"
)

# F-6: MRSA MIC coverage — Ctrough > 0.5 μg/mL for default patient
# (ceftaroline MRSA MIC₉₀ = 0.5–2.0 μg/mL, EUCAST breakpoint 1 mg/L)
MIC_threshold = 0.5  # μg/mL
suite.record(
    "F-6: Default patient Ctrough > 0.5 μg/mL (ceftaroline MRSA MIC coverage)",
    v_default["Ctrough"] > MIC_threshold,
    f"Ctrough = {v_default['Ctrough']:.4f} μg/mL  (MIC threshold = {MIC_threshold} μg/mL)\n"
    f"Coverage margin: {v_default['Ctrough']/MIC_threshold:.2f}× above MIC",
    group="F"
)

# F-7: Ctrough ✓/✗ color threshold at 0.5 is consistent with MIC data
# Verify that a patient with eGFR=5 (near-ESRD) still achieves Ctrough > 0.5
v_esrd = compute_curvature(PatientInputs(68, 82, 5, 85, 2.5, 18, 14))
suite.record(
    "F-7: Near-ESRD patient (eGFR=5) still achieves Ctrough > 0.5 μg/mL",
    v_esrd["Ctrough"] > MIC_threshold,
    f"eGFR=5: ke={v_esrd['ke']:.6f}/hr (nearly zero → minimal elimination)\n"
    f"Ctrough={v_esrd['Ctrough']:.4f} μg/mL  (drug accumulates → above MIC ✓)\n"
    f"NOTE: dose=400 mg (eGFR<50), Vd={v_esrd['Vd']:.2f} L",
    group="F"
)

# F-8: Collateral resistance claim — prior meropenem within 90 days
# K_collateral = 0.10 adds curvature to Kt (but NOT to K_vanco)
v_no_mero = compute_curvature(PatientInputs(68, 82, 45, 85, 2.5, 18, 200))
v_yes_mero = compute_curvature(PatientInputs(68, 82, 45, 85, 2.5, 18, 14))
suite.record(
    "F-8: Prior meropenem ≤90d adds K_collateral=0.10 to Kt only (not K_vanco)",
    (v_yes_mero["K_collateral"] == 0.10 and v_no_mero["K_collateral"] == 0.0
     and abs(v_yes_mero["K_vanco"] - v_no_mero["K_vanco"]) < 1e-12),
    f"K_collateral (mero=14d):  {v_yes_mero['K_collateral']:.2f}  → Kt = {v_yes_mero['Kt']:.6f}\n"
    f"K_collateral (mero=200d): {v_no_mero['K_collateral']:.2f}  → Kt = {v_no_mero['Kt']:.6f}\n"
    f"K_vanco unchanged: {abs(v_yes_mero['K_vanco']-v_no_mero['K_vanco']):.2e}",
    group="F"
)


# ============================================================================
# GROUP G: ADVERSARIAL NUMERICAL INPUTS
# ============================================================================
print("\n" + "=" * 72)
print("GROUP G: ADVERSARIAL NUMERICAL INPUTS")
print("=" * 72)

# G-1: Extremely high eGFR (10000) — K_exc → 0, C_ceft at maximum
v_superkidney = compute_curvature(PatientInputs(68, 82, 10000, 85, 2.5, 14, 200))
K_exc_superkidney = (90.0 / 10000.0)**2 * 0.10
suite.record(
    "G-1: eGFR=10000 → K_exc ≈ 0 (near-zero excretion curvature)",
    abs(v_superkidney["K_exc"] - K_exc_superkidney) < 1e-10,
    f"K_exc = {v_superkidney['K_exc']:.2e}  (expected {K_exc_superkidney:.2e})\n"
    f"C_ceft = {v_superkidney['C_ceft']:.4f}  (near-maximum for this albumin/trough)",
    group="G"
)

# G-2: Negative eGFR — Math.max(-5, 1) = 1, same as eGFR=0
v_neg_egfr = compute_curvature(PatientInputs(68, 82, -5, 85, 2.5, 18, 14))
v_zero_egfr = compute_curvature(PatientInputs(68, 82,  0, 85, 2.5, 18, 14))
suite.record(
    "G-2: Negative eGFR is clamped to 1 by Math.max guard (same as eGFR=0)",
    abs(v_neg_egfr["K_exc"] - v_zero_egfr["K_exc"]) < 1e-12,
    f"K_exc(eGFR=-5) = {v_neg_egfr['K_exc']:.8f}\n"
    f"K_exc(eGFR=0)  = {v_zero_egfr['K_exc']:.8f}  (identical — guard works)",
    group="G"
)

# G-3: Negative albumin — K_dist = (0.20 × (negative/4))² still positive (squared)
v_neg_alb = compute_curvature(PatientInputs(68, 82, 45, 85, -1.0, 18, 14))
suite.record(
    "G-3: Negative albumin → K_dist still ≥ 0 (squaring eliminates sign)",
    v_neg_alb["K_dist"] >= 0 and v_neg_alb["K_dist"] > 0,
    f"K_dist(albumin=-1) = (0.20 × (-1/4))² = {v_neg_alb['K_dist']:.6f}  (positive ✓)\n"
    f"Vd(albumin=-1) = {v_neg_alb['Vd']:.4f} L  (inflated — negative albumin unphysical)",
    group="G"
)

# G-4: Very high vancoTrough (1000) — K_tox_base still only 0.20 (binary ternary)
v_hi_trough = compute_curvature(PatientInputs(68, 82, 45, 85, 2.5, 1000, 14))
suite.record(
    "G-4: vancoTrough=1000 → K_tox_base still caps at 0.20 (ternary, no linear scaling)",
    abs(v_hi_trough["K_tox_base"] - 0.20) < 1e-12,
    f"K_tox_base(trough=1000) = {v_hi_trough['K_tox_base']:.6f}  (cap = 0.05 + 0.15 = 0.20)",
    group="G"
)

# G-5: priorMero = -100 (negative days) — still < 90, collateral applies
v_neg_mero = compute_curvature(PatientInputs(68, 82, 45, 85, 2.5, 18, -100))
suite.record(
    "G-5: priorMero=-100 → K_collateral=0.10 (negative days still < 90)",
    abs(v_neg_mero["K_collateral"] - 0.10) < 1e-12,
    f"K_collateral(priorMero=-100) = {v_neg_mero['K_collateral']:.4f}\n"
    f"(Negative days is nonsensical input but formula doesn't guard against it)",
    group="G"
)

# G-6: Very high albumin (12 g/dL, still physiological max reported) — Vd stays > 1
# albumin=12: Vd = 28(1+(1-3)*0.3) = 28(1-0.6) = 28*0.4 = 11.2 L
v_hi_alb = compute_curvature(PatientInputs(68, 82, 45, 85, 12.0, 18, 14))
suite.record(
    "G-6: albumin=12 g/dL → Vd = 11.2 L (positive; Cmax uses max(Vd,1))",
    v_hi_alb["Vd"] > 1.0 and abs(v_hi_alb["Vd"] - 11.2) < 1e-10,
    f"Vd = 28×(1+(1-12/4)×0.3) = 28×(1+(1-3)×0.3) = 28×0.4 = {v_hi_alb['Vd']:.4f} L",
    group="G"
)

# G-7: Super-hypoalbuminemia (albumin=20 g/dL) — Vd goes negative, clamped for Cmax
# This is physiologically impossible but the formula doesn't guard Vd itself
# Vd(albumin=20) = 28*(1+(1-5)*0.3) = 28*(1-1.2) = 28*(-0.2) = -5.6 L
v_extreme_alb = compute_curvature(PatientInputs(68, 82, 45, 85, 20.0, 18, 14))
Vd_extreme_expected = 28.0 * (1.0 + (1.0 - 20.0/4.0) * 0.3)  # = -5.6
suite.record(
    "G-7: albumin=20 (extreme) → Vd turns negative but Cmax still finite (max(Vd,1) guard)",
    (abs(v_extreme_alb["Vd"] - Vd_extreme_expected) < 1e-10
     and math.isfinite(v_extreme_alb["Cmax"])
     and v_extreme_alb["Cmax"] > 0),
    f"Vd = {v_extreme_alb['Vd']:.4f} L  (negative — unphysical albumin, no guard on Vd directly)\n"
    f"Cmax = {v_extreme_alb['Cmax']:.4f} μg/mL  (finite via max(Vd,1)=1)\n"
    f"FINDING: No guard on Vd itself; only Cmax/ke use max(Vd,1)",
    group="G"
)

# G-8: NaN propagation — math.nan as eGFR input
try:
    v_nan = compute_curvature(PatientInputs(68, 82, float('nan'), 85, 2.5, 18, 14))
    nan_outputs = [k for k, x in v_nan.items() if not math.isfinite(x)]
    suite.record(
        "G-8: NaN eGFR input → NaN propagates through K_exc/K_vanco/C/PK (expected)",
        len(nan_outputs) > 0,
        f"NaN/Inf in outputs: {nan_outputs}\n"
        f"(NaN propagation is expected — no NaN guard in JS either; "
        f"UI relies on HTML input validation)",
        group="G"
    )
except Exception as e:
    suite.record("G-8: NaN eGFR propagation", False, f"Unexpected exception: {e}", group="G")


# ============================================================================
# GROUP H: CROSS-FORMULA INDEPENDENCE CHECKS
# ============================================================================
print("\n" + "=" * 72)
print("GROUP H: CROSS-FORMULA INDEPENDENCE CHECKS")
print("=" * 72)

# H-1: K_vanco depends ONLY on eGFR (confirmed: formula has only pt.egfr)
egfr_range = [10, 30, 45, 60, 90, 120]
K_vanco_by_egfr_only = []
for eg in egfr_range:
    # Vary albumin and trough while keeping eGFR constant — K_vanco must be constant
    k_vanco_set = set()
    for alb in [1.0, 2.5, 4.0]:
        for tr in [10, 18, 25]:
            for mero in [14, 200]:
                pt_h = PatientInputs(68, 82, eg, 85, alb, tr, mero)
                kv = round(compute_curvature(pt_h)["K_vanco"], 12)
                k_vanco_set.add(kv)
    K_vanco_by_egfr_only.append(len(k_vanco_set) == 1)

suite.record(
    "H-1: K_vanco is a function of eGFR alone (not albumin/trough/mero)",
    all(K_vanco_by_egfr_only),
    f"Unique K_vanco per eGFR across 18 input combinations each: "
    f"{'all unique ✓' if all(K_vanco_by_egfr_only) else 'VIOLATION'}",
    group="H"
)

# H-2: K_dist depends ONLY on albumin
albumin_range = [0.5, 1.0, 2.5, 4.0, 5.0]
K_dist_albumin_only = []
for alb in albumin_range:
    k_dist_set = set()
    for eg in [10, 45, 90]:
        for tr in [10, 20]:
            for mero in [14, 200]:
                pt_h = PatientInputs(68, 82, eg, 85, alb, tr, mero)
                kd = round(compute_curvature(pt_h)["K_dist"], 14)
                k_dist_set.add(kd)
    K_dist_albumin_only.append(len(k_dist_set) == 1)

suite.record(
    "H-2: K_dist is a function of albumin alone (not eGFR/trough/mero)",
    all(K_dist_albumin_only),
    f"Unique K_dist per albumin across 12 input combinations each: "
    f"{'all unique ✓' if all(K_dist_albumin_only) else 'VIOLATION'}",
    group="H"
)

# H-3: K_exc depends ONLY on eGFR
K_exc_egfr_only = []
for eg in egfr_range:
    k_exc_set = set()
    for alb in [1.0, 2.5, 4.0]:
        for tr in [10, 20]:
            for mero in [14, 200]:
                pt_h = PatientInputs(68, 82, eg, 85, alb, tr, mero)
                ke_val = round(compute_curvature(pt_h)["K_exc"], 12)
                k_exc_set.add(ke_val)
    K_exc_egfr_only.append(len(k_exc_set) == 1)

suite.record(
    "H-3: K_exc is a function of eGFR alone (not albumin/trough/mero)",
    all(K_exc_egfr_only),
    f"Unique K_exc per eGFR across 12 input combinations each: "
    f"{'all unique ✓' if all(K_exc_egfr_only) else 'VIOLATION'}",
    group="H"
)

# H-4: K_tox_base depends ONLY on vancoTrough
K_tox_base_only = []
for tr in [5, 10, 15, 16, 20]:
    kb_set = set()
    for eg in [30, 90]:
        for alb in [2.5, 4.0]:
            for mero in [14, 200]:
                pt_h = PatientInputs(68, 82, eg, 85, alb, tr, mero)
                kb = round(compute_curvature(pt_h)["K_tox_base"], 14)
                kb_set.add(kb)
    K_tox_base_only.append(len(kb_set) == 1)

suite.record(
    "H-4: K_tox_base depends only on vancoTrough (binary: ≤15 → 0.05, >15 → 0.20)",
    all(K_tox_base_only),
    f"Values tested: {[5,10,15,16,20]} → "
    f"result unique per trough: {'✓' if all(K_tox_base_only) else 'VIOLATION'}",
    group="H"
)

# H-5: K_collateral depends ONLY on priorMero
K_coll_only = []
for mero in [14, 89, 90, 200]:
    kc_set = set()
    for eg in [30, 90]:
        for alb in [2.5, 4.0]:
            for tr in [14, 20]:
                pt_h = PatientInputs(68, 82, eg, 85, alb, tr, mero)
                kc = round(compute_curvature(pt_h)["K_collateral"], 14)
                kc_set.add(kc)
    K_coll_only.append(len(kc_set) == 1)

suite.record(
    "H-5: K_collateral depends only on priorMero (binary: <90 → 0.10, ≥90 → 0.0)",
    all(K_coll_only),
    f"Values tested: {[14,89,90,200]} → "
    f"result unique per mero: {'✓' if all(K_coll_only) else 'VIOLATION'}",
    group="H"
)

# H-6: Verify K_vanco vs Kt ratio — K_vanco should differ from Kt
# (they model different things: vancomycin vs ceftaroline pharmacodynamics)
ratio_Kvanco_Kt = V["K_vanco"] / V["Kt"]
suite.record(
    "H-6: K_vanco ≠ Kt for default patient (different PD models for each drug)",
    abs(ratio_Kvanco_Kt - 1.0) > 0.1,
    f"K_vanco = {V['K_vanco']:.6f}\n"
    f"Kt      = {V['Kt']:.6f}\n"
    f"Ratio   = {ratio_Kvanco_Kt:.4f}  (vancomycin has higher inherent curvature)",
    group="H"
)

# H-7: The 9x advantage arises from BOTH tau ratio AND K ratio
tau_ratio = 12.0 / 4.0   # ceft vs vanco dosing interval
K_ratio = V["K_vanco"] / V["Kt"]  # vanco K vs ceft K
C_ratio = V["C_ceft"] / V["C_vanco"]
# C_ceft/C_vanco = (tau_ceft/Kt) / (tau_vanco/K_vanco) = tau_ratio × K_ratio
expected_C_ratio = tau_ratio * K_ratio
suite.record(
    "H-7: C_ceft/C_vanco = (τ_ceft/τ_vanco) × (K_vanco/Kt) exactly",
    abs(C_ratio - expected_C_ratio) < 1e-10,
    f"τ ratio (12/4): {tau_ratio:.4f}×\n"
    f"K ratio (K_vanco/Kt): {K_ratio:.4f}×\n"
    f"Product: {expected_C_ratio:.6f}\n"
    f"C_ceft/C_vanco: {C_ratio:.6f}\n"
    f"|diff|: {abs(C_ratio - expected_C_ratio):.2e}",
    group="H"
)


# ============================================================================
# FINAL SUMMARY
# ============================================================================
p, t = suite.summary()

# Save to JSON for further analysis
results_out = {
    "total": t,
    "passed": p,
    "failed": t - p,
    "pass_rate": round(100 * p / t, 1),
    "tests": suite.results
}
with open("mirador_adversarial_results.json", "w", encoding="utf-8") as f:
    json.dump(results_out, f, indent=2)

print(f"\nResults saved to mirador_adversarial_results.json")
sys.exit(0 if p == t else 1)
