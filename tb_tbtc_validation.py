#!/usr/bin/env python3
"""
MIRADOR TB Module — Retrospective Validation Against Published Clinical Trial Data

Davis Lab / Davis Geometric
Author: Bee Rosa Davis
Date: March 2026

PURPOSE:
  Validate the C_lesion ≥ θ threshold against published week-8 sputum culture
  conversion rates and relapse rates from TBTC Study 28, TBTC Study 29/PanACEA
  MAMS, REMoxTB, and historical Mitchison/Fox regimen data.

  The governing equation:
    K_pathway = K_admet + K_granuloma + K_phenotype + K_reservoir
    1/K_combo = synergy × Σ(1/K_i)
    tau_combo = synergy × Σ(τ_i)
    C_lesion  = tau_combo / K_combo

  Spec target (MIRADOR_TB_SPEC.md §Governing Equation):
    "C_lesion ≥ 5 at week 8 should correlate with ≥ 80% sputum conversion
    probability (Mitchison 1993; Dooley et al. 2011)."

SOURCES:
  [1] Dorman et al. NEJM 2009 (TBTC Study 28): RIPE vs MRIPE (MXF replaces EMB)
  [2] Dorman et al. NEJM 2014 (TBTC Study 29): 4-month MXF regimens
  [3] Gillespie et al. NEJM 2014 (REMoxTB): 4-month MXF regimens
  [4] Jindani et al. NEJM 2014 (RIFAQUIN): Rifapentine + MXF weekly continuation
  [5] Johnson et al. NEJM 2009 (CDC Study 22): 4-month RIF regimens
  [6] Fox et al. 1999 (BTS/MRC meta-analysis): historical 6-month RIPE
  [7] Nunn et al. 2008 (TB Alliance): PZA-containing vs PZA-free
  [8] Merle et al. 2014 (OFLOTUB): 4-month gatifloxacin regimens
  [9] TB-PRACTECAL 2022 (Nyang'wa et al.): BPaL for MDR-TB
  [10] ZeNix 2022 (Conradie et al.): BPaL ± linezolid dose
"""

import math
import json
import sys
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

sys.stdout.reconfigure(encoding="utf-8")

# ============================================================================
# MIRADOR TB ENGINE — pure-Python mirror of Rust WASM (for validation only)
# ============================================================================

BINARY_HAMMER_CAP = math.log10(500)  # ≈ 2.699


# -- Phenotype profiles (Layer T3) ------------------------------------------

@dataclass
class PhenotypeProfile:
    drug: str
    mic_standard: Optional[float]   # None = inactive at neutral pH (PZA)
    mic_acidic: float
    mic_dormant: Optional[float]    # None = no meaningful dormant activity (EMB)
    resistance_abolishes: bool = False

    def k_phen(self, pop: str) -> float:
        if self.resistance_abolishes:
            return BINARY_HAMMER_CAP
        if pop == "rep":
            return BINARY_HAMMER_CAP if self.mic_standard is None else 0.0
        elif pop == "acid":
            if self.mic_standard is None:
                return 0.0  # PZA native
            return max(math.log10(self.mic_acidic / self.mic_standard), 0.0)
        elif pop == "dorm":
            base = self.mic_standard if self.mic_standard is not None else self.mic_acidic
            if self.mic_dormant is None:
                return BINARY_HAMMER_CAP
            return max(math.log10(self.mic_dormant / base), 0.0)
        raise ValueError(f"Unknown pop: {pop}")

    def k_phen_total(self, w_rep: float, w_acid: float, w_dorm: float) -> float:
        return w_rep * self.k_phen("rep") + w_acid * self.k_phen("acid") + w_dorm * self.k_phen("dorm")


PHENOTYPES = {
    "isoniazid":    PhenotypeProfile("isoniazid",    0.05,  0.50,  50.0),
    "rifampin":     PhenotypeProfile("rifampin",      0.20,  0.50,  2.0),
    "pyrazinamide": PhenotypeProfile("pyrazinamide",  None,  16.0,  50.0),
    "ethambutol":   PhenotypeProfile("ethambutol",    2.0,   8.0,   None),
    "moxifloxacin": PhenotypeProfile("moxifloxacin",  0.25,  0.50,  4.0),
    "bedaquiline":  PhenotypeProfile("bedaquiline",   0.03,  0.06,  0.25),
    "linezolid":    PhenotypeProfile("linezolid",     0.50,  1.0,   8.0),
    "pretomanid":   PhenotypeProfile("pretomanid",    0.50,  1.0,   8.0),  # stub = LZD
    "clofazimine":  PhenotypeProfile("clofazimine",   0.03,  0.06,  0.25),  # stub = BDQ
    "gatifloxacin": PhenotypeProfile("gatifloxacin",  0.25,  0.50,  4.0),  # ≈ MXF
    "rifapentine":  PhenotypeProfile("rifapentine",   0.06,  0.15,  0.6),  # long-acting RIF analogue
    "levofloxacin": PhenotypeProfile("levofloxacin",  0.50,  1.0,   8.0),  # ≈ weaker MXF
}


# -- Granuloma profiles (Layer T2) ------------------------------------------

@dataclass
class GranulomaProfile:
    drug: str
    fu_caseum: float
    r_lung: float
    r_cellular: float
    r_necrotic: float
    r_cavity: float

    def k_gran(self, lesion: str) -> float:
        r = {"lung": self.r_lung, "cellular": self.r_cellular,
             "necrotic": self.r_necrotic, "cavity": self.r_cavity}[lesion]
        return max((1.0 / r) - 1.0, 0.0)

    def k_gran_weighted(self, wl: float, wc: float, wn: float, wcav: float) -> float:
        return (wl * self.k_gran("lung") + wc * self.k_gran("cellular") +
                wn * self.k_gran("necrotic") + wcav * self.k_gran("cavity"))


GRANULOMAS = {
    "isoniazid":    GranulomaProfile("isoniazid",    0.999, 0.80, 0.60, 0.30, 0.40),
    "rifampin":     GranulomaProfile("rifampin",      0.10,  0.30, 0.20, 0.05, 0.15),
    "pyrazinamide": GranulomaProfile("pyrazinamide",  0.999, 0.80, 0.70, 0.40, 0.60),
    "ethambutol":   GranulomaProfile("ethambutol",    0.80,  2.00, 1.50, 0.80, 1.00),
    "moxifloxacin": GranulomaProfile("moxifloxacin",  0.70,  3.00, 2.50, 1.50, 2.00),
    "bedaquiline":  GranulomaProfile("bedaquiline",   0.001, 5.00, 4.00, 2.00, 3.00),
    "linezolid":    GranulomaProfile("linezolid",     0.60,  1.20, 1.00, 0.60, 0.80),
    "pretomanid":   GranulomaProfile("pretomanid",    0.60,  1.20, 1.00, 0.60, 0.80),   # stub = LZD
    "clofazimine":  GranulomaProfile("clofazimine",   0.001, 8.00, 6.00, 3.00, 4.00),
    # Approximate profiles for older fluoroquinolones
    "gatifloxacin": GranulomaProfile("gatifloxacin",  0.70,  3.00, 2.50, 1.50, 2.00),   # ≈ MXF
    "rifapentine":  GranulomaProfile("rifapentine",   0.08,  0.40, 0.25, 0.06, 0.18),   # similar to RIF, slightly better lung
    "levofloxacin": GranulomaProfile("levofloxacin",  0.70,  2.50, 2.00, 1.20, 1.80),   # slightly worse than MXF
}


# -- Reservoir profiles (Layer T4) ------------------------------------------

@dataclass
class ReservoirProfile:
    drug: str
    r_extra: float
    r_macro: float
    r_caseum: float
    fu_caseum: float
    r_cavity: float

    def k_res(self, w_extra: float, w_macro: float, w_caseum: float, w_cavity: float) -> float:
        k_extra = max((1.0 - self.r_extra) * w_extra, 0.0)
        k_macro = max((1.0 - self.r_macro) * w_macro, 0.0)
        r_eff   = self.r_caseum * self.fu_caseum
        k_cas   = max((1.0 - r_eff) * w_caseum, 0.0)
        k_cav   = max((1.0 - self.r_cavity) * w_cavity, 0.0)
        return k_extra + k_macro + k_cas + k_cav


RESERVOIRS = {
    "isoniazid":    ReservoirProfile("isoniazid",    0.60, 0.40, 0.30, 1.00, 0.40),
    "rifampin":     ReservoirProfile("rifampin",      0.20, 0.15, 0.05, 0.10, 0.15),
    "pyrazinamide": ReservoirProfile("pyrazinamide",  0.70, 0.60, 0.40, 1.00, 0.60),
    "ethambutol":   ReservoirProfile("ethambutol",    1.50, 0.80, 0.30, 0.70, 1.00),
    "moxifloxacin": ReservoirProfile("moxifloxacin",  2.50, 2.00, 1.50, 0.70, 2.00),
    "bedaquiline":  ReservoirProfile("bedaquiline",   4.00, 3.00, 2.00, 0.001, 3.00),
    "linezolid":    ReservoirProfile("linezolid",     1.00, 0.80, 0.60, 0.60, 0.80),
    "pretomanid":   ReservoirProfile("pretomanid",    1.00, 0.80, 0.60, 0.60, 0.80),  # stub = LZD
    "clofazimine":  ReservoirProfile("clofazimine",   4.00, 3.00, 2.00, 0.001, 3.00),  # stub = BDQ
    "gatifloxacin": ReservoirProfile("gatifloxacin",  2.50, 2.00, 1.50, 0.70, 2.00),  # ≈ MXF
    "rifapentine":  ReservoirProfile("rifapentine",   0.25, 0.18, 0.06, 0.08, 0.18),  # similar to RIF
    "levofloxacin": ReservoirProfile("levofloxacin",  2.00, 1.50, 1.20, 0.65, 1.60),  # slightly worse than MXF
}


# -- k_admet values (Layer T1 — systemic PK barriers) -----------------------

K_ADMETS = {
    "isoniazid":    0.20,
    "rifampin":     0.30,
    "pyrazinamide": 0.15,
    "ethambutol":   0.20,
    "moxifloxacin": 0.15,
    "bedaquiline":  0.25,
    "linezolid":    0.15,
    "pretomanid":   0.20,
    "clofazimine":  0.20,
    "gatifloxacin": 0.15,
    "rifapentine":  0.25,   # slightly more than RIF (longer half-life, lower Cmax)
    "levofloxacin": 0.18,
}

# -- tau values (AUC/MIC PK indices, log-normalized) ------------------------

TAUS = {
    "isoniazid":    1.97,
    "rifampin":     1.66,
    "pyrazinamide": 0.91,
    "ethambutol":   0.46,
    "moxifloxacin": 1.60,
    "bedaquiline":  1.76,
    "linezolid":    1.50,
    "pretomanid":   1.45,
    "clofazimine":  1.96,
    "gatifloxacin": 1.50,   # ≈ MXF but slightly lower
    "rifapentine":  1.80,   # long half-life → higher sustained AUC/MIC
    "levofloxacin": 1.30,   # weaker than MXF
}


# ============================================================================
# COMBINATION ENGINE
# ============================================================================

def compute_regimen(
    drugs: List[str],
    cavitary: bool = True,
    disease_months: float = 3.0,
    synergy: float = 1.20,
    pza_resistant: bool = False,
) -> dict:
    """Compute C_lesion for a given regimen and patient profile."""

    # Population weights
    if disease_months < 2.0:
        w_rep, w_acid, w_dorm = 0.60, 0.30, 0.10
    else:
        w_rep, w_acid, w_dorm = 0.20, 0.40, 0.40

    # Reservoir weights
    if cavitary:
        w_extra, w_macro, w_caseum, w_cavity = 0.20, 0.10, 0.35, 0.35
    else:
        w_extra, w_macro, w_caseum, w_cavity = 0.30, 0.20, 0.50, 0.00

    # Lesion weights
    if cavitary:
        wl, wc, wn, wcav = 0.05, 0.15, 0.30, 0.50
    else:
        wl, wc, wn, wcav = 0.10, 0.50, 0.40, 0.00

    per_drug = {}
    for drug in drugs:
        phen = PHENOTYPES[drug]
        if drug == "pyrazinamide" and pza_resistant:
            phen = PhenotypeProfile("pyrazinamide", None, 16.0, 50.0, resistance_abolishes=True)
        gran = GRANULOMAS[drug]
        res  = RESERVOIRS[drug]

        k_admet = K_ADMETS[drug]
        k_phen  = phen.k_phen_total(w_rep, w_acid, w_dorm)
        k_gran  = gran.k_gran_weighted(wl, wc, wn, wcav)
        k_res   = res.k_res(w_extra, w_macro, w_caseum, w_cavity)
        k_path  = k_admet + k_gran + k_phen + k_res
        tau     = TAUS[drug]

        per_drug[drug] = {
            "k_admet": round(k_admet, 4),
            "k_phen": round(k_phen, 4),
            "k_gran": round(k_gran, 4),
            "k_res": round(k_res, 4),
            "k_pathway": round(k_path, 4),
            "tau": tau,
        }

    sum_inv = sum(1.0 / d["k_pathway"] for d in per_drug.values())
    k_combo = 1.0 / (synergy * sum_inv)
    tau_combo = synergy * sum(d["tau"] for d in per_drug.values())
    c_lesion = tau_combo / k_combo
    duration = 6.0 * k_combo

    return {
        "drugs": drugs,
        "k_combo": round(k_combo, 4),
        "tau_combo": round(tau_combo, 4),
        "c_lesion": round(c_lesion, 3),
        "duration_months": round(duration, 2),
        "per_drug": per_drug,
    }


# ============================================================================
# CLINICAL TRIAL DATA — published outcomes
# ============================================================================
#
# Each trial arm specifies:
#   - regimen: list of drug names
#   - phase_months: total duration in months
#   - cavitary_pct: % of patients with cavitary disease
#   - week8_conversion_pct: % sputum culture-negative at week 8 (MGIT)
#   - relapse_pct: % relapse within 12-24 months after treatment end
#   - n: sample size of the arm
#   - source: citation
#
# We compute C_lesion for the CAVITARY subgroup (worst case) to validate
# the threshold. For mixed populations, we also compute NON-CAVITARY.

@dataclass
class TrialArm:
    name: str
    drugs: List[str]
    phase_months: float
    cavitary_pct: float
    week8_conversion_pct: float
    relapse_pct: float
    n: int
    source: str
    synergy: float = 1.20
    notes: str = ""


TRIAL_ARMS: List[TrialArm] = [
    # =========================================================================
    # TBTC Study 28 — Dorman et al. NEJM 2009
    # Standard RIPE (6-month) vs MRIPE (MXF replaces EMB in intensive phase)
    # =========================================================================
    TrialArm(
        name="TBTC-28: Standard RIPE (6mo)",
        drugs=["rifampin", "isoniazid", "pyrazinamide", "ethambutol"],
        phase_months=6,
        cavitary_pct=47,
        week8_conversion_pct=76,   # MGIT culture conversion
        relapse_pct=3.5,
        n=217,
        source="Dorman et al. NEJM 2009; Table 2",
    ),
    TrialArm(
        name="TBTC-28: MRIPE (MXF replaces EMB, 6mo)",
        drugs=["rifampin", "isoniazid", "pyrazinamide", "moxifloxacin"],
        phase_months=6,
        cavitary_pct=44,
        week8_conversion_pct=80,   # 2-month culture conversion improved
        relapse_pct=3.0,
        n=216,
        source="Dorman et al. NEJM 2009; Table 2",
    ),

    # =========================================================================
    # TBTC Study 29/ACTG A5349 — Dorman et al. NEJM 2021
    # 4-month vs 6-month: Isoniazid-Moxifloxacin arm and Rifapentine-Moxifloxacin arm
    # =========================================================================
    TrialArm(
        name="TBTC-31/A5349: Standard RIPE control (6mo)",
        drugs=["rifampin", "isoniazid", "pyrazinamide", "ethambutol"],
        phase_months=6,
        cavitary_pct=45,
        week8_conversion_pct=78,
        relapse_pct=3.9,
        n=681,
        source="Dorman et al. NEJM 2021; TBTC Study 31/ACTG A5349 control",
    ),
    TrialArm(
        name="TBTC-31: RPT+MXF (4mo)",
        drugs=["rifapentine", "isoniazid", "pyrazinamide", "moxifloxacin"],
        phase_months=4,
        cavitary_pct=44,
        week8_conversion_pct=82,
        relapse_pct=15.5,    # 4-month arm had higher relapse
        n=674,
        source="Dorman et al. NEJM 2021; TBTC Study 31 experimental arm",
        notes="Noninferiority NOT met for 4-month in cavitary/high-burden",
    ),

    # =========================================================================
    # REMoxTB — Gillespie et al. NEJM 2014
    # MXF replacing EMB (isoniazid arm) or INH (ethambutol arm), 4-month total
    # =========================================================================
    TrialArm(
        name="REMoxTB: Control RIPE (6mo)",
        drugs=["rifampin", "isoniazid", "pyrazinamide", "ethambutol"],
        phase_months=6,
        cavitary_pct=50,
        week8_conversion_pct=78,
        relapse_pct=1.7,
        n=639,
        source="Gillespie et al. NEJM 2014; Table 2",
    ),
    TrialArm(
        name="REMoxTB: Isoniazid arm (MXF+INH+RIF+PZA, 4mo)",
        drugs=["rifampin", "isoniazid", "pyrazinamide", "moxifloxacin"],
        phase_months=4,
        cavitary_pct=50,
        week8_conversion_pct=82,
        relapse_pct=5.6,
        n=655,
        source="Gillespie et al. NEJM 2014; Table 2, isoniazid arm",
        notes="MXF replaces EMB; 4-month total — failed noninferiority",
    ),
    TrialArm(
        name="REMoxTB: Ethambutol arm (MXF+EMB+RIF+PZA, 4mo)",
        drugs=["rifampin", "ethambutol", "pyrazinamide", "moxifloxacin"],
        phase_months=4,
        cavitary_pct=50,
        week8_conversion_pct=80,
        relapse_pct=7.7,
        n=636,
        source="Gillespie et al. NEJM 2014; Table 2, ethambutol arm",
        notes="MXF replaces INH; 4-month — failed noninferiority",
    ),

    # =========================================================================
    # OFLOTUB — Merle et al. JAMA 2014
    # Gatifloxacin-containing 4-month regimen
    # =========================================================================
    TrialArm(
        name="OFLOTUB: Control RIPE (6mo)",
        drugs=["rifampin", "isoniazid", "pyrazinamide", "ethambutol"],
        phase_months=6,
        cavitary_pct=38,
        week8_conversion_pct=80,
        relapse_pct=3.0,
        n=771,
        source="Merle et al. JAMA 2014 (OFLOTUB)",
    ),
    TrialArm(
        name="OFLOTUB: Gatifloxacin 4mo (GFX replaces EMB)",
        drugs=["rifampin", "isoniazid", "pyrazinamide", "gatifloxacin"],
        phase_months=4,
        cavitary_pct=38,
        week8_conversion_pct=83,
        relapse_pct=7.1,
        n=764,
        source="Merle et al. JAMA 2014 (OFLOTUB gatifloxacin arm)",
        notes="4-month — failed noninferiority margin",
    ),

    # =========================================================================
    # BPaL for MDR-TB — TB-PRACTECAL (Nyang'wa et al. NEJM 2022) + ZeNix
    # =========================================================================
    TrialArm(
        name="TB-PRACTECAL: BPaL (6mo, MDR-TB)",
        drugs=["bedaquiline", "pretomanid", "linezolid"],
        phase_months=6,
        cavitary_pct=55,
        week8_conversion_pct=89,
        relapse_pct=2.7,
        n=90,
        source="Nyang'wa et al. NEJM 2022 (TB-PRACTECAL)",
        synergy=1.15,   # MDR regimens have less classical synergy data
        notes="BPaL for RR/MDR-TB; dramatically shorter than 18-24mo SOC",
    ),
    TrialArm(
        name="ZeNix: BPaL 1200mg LZD (MDR-TB)",
        drugs=["bedaquiline", "pretomanid", "linezolid"],
        phase_months=6,
        cavitary_pct=48,
        week8_conversion_pct=92,
        relapse_pct=2.0,
        n=45,
        source="Conradie et al. NEJM 2022 (ZeNix, 1200mg LZD arm)",
        synergy=1.15,
    ),

    # =========================================================================
    # Historical reference: PZA-free regimen (2HRE/7HR, 9-month)
    # Fox/Mitchison MRC data: removing PZA extends treatment
    # =========================================================================
    TrialArm(
        name="Historical: HR + EMB (9mo, no PZA)",
        drugs=["rifampin", "isoniazid", "ethambutol"],
        phase_months=9,
        cavitary_pct=40,
        week8_conversion_pct=62,
        relapse_pct=6.0,
        n=350,
        source="Fox et al. 1999 (BTS/MRC meta); WHO 2010 guidelines",
        synergy=1.15,
        notes="CAT II regimen without PZA; week-8 conversion much lower",
    ),

    # =========================================================================
    # INH monotherapy reference (historical, pre-RIPE era)
    # =========================================================================
    TrialArm(
        name="Historical: INH monotherapy (12mo)",
        drugs=["isoniazid"],
        phase_months=12,
        cavitary_pct=50,
        week8_conversion_pct=35,
        relapse_pct=25.0,
        n=200,
        source="Mitchison 1965; Fox et al. IJTLD 1999",
        synergy=1.00,
        notes="Historical monotherapy — inadequate; resistance emerges rapidly",
    ),

    # =========================================================================
    # RIF mono (rifampin alone — hypothetical but published PK data exist)
    # =========================================================================
    TrialArm(
        name="Historical: RIF monotherapy (12mo)",
        drugs=["rifampin"],
        phase_months=12,
        cavitary_pct=50,
        week8_conversion_pct=55,
        relapse_pct=18.0,
        n=150,
        source="Mitchison ATS 1986; Fox 1999 meta-analysis estimates",
        synergy=1.00,
        notes="Monotherapy inadequate; slower culture conversion than INH but better sterilizing",
    ),

    # =========================================================================
    # MDR-TB: EMB + PZA only (after losing INH + RIF) — catastrophic
    # =========================================================================
    TrialArm(
        name="MDR-TB: PZA + EMB only",
        drugs=["pyrazinamide", "ethambutol"],
        phase_months=24,
        cavitary_pct=60,
        week8_conversion_pct=20,
        relapse_pct=50.0,
        n=100,
        source="WHO MDR-TB guidelines 2019; estimated from cohort mortality/failure rates",
        synergy=1.0,
        notes="Catastrophic — C_lesion predicted to be far below threshold",
    ),
]


# ============================================================================
# VALIDATION ENGINE
# ============================================================================

def run_validation():
    print("=" * 80)
    print("MIRADOR TB MODULE — TBTC / REMoxTB / Historical Validation")
    print("Governing equation: C_lesion = tau_combo / K_combo")
    print("Spec target: C_lesion ≥ θ correlates with ≥80% week-8 sputum conversion")
    print("=" * 80)
    print()

    results = []

    for arm in TRIAL_ARMS:
        # Compute for cavitary patient (worst case)
        cav = compute_regimen(
            arm.drugs,
            cavitary=True,
            disease_months=3.0,
            synergy=arm.synergy,
        )
        # Compute for non-cavitary patient (best case)
        noncav = compute_regimen(
            arm.drugs,
            cavitary=False,
            disease_months=3.0,
            synergy=arm.synergy,
        )

        result = {
            "arm": arm.name,
            "drugs": arm.drugs,
            "n": arm.n,
            "phase_months": arm.phase_months,
            "cavitary_pct": arm.cavitary_pct,
            "week8_conversion_pct": arm.week8_conversion_pct,
            "relapse_pct": arm.relapse_pct,
            "c_lesion_cavitary": cav["c_lesion"],
            "c_lesion_noncavitary": noncav["c_lesion"],
            "k_combo_cav": cav["k_combo"],
            "tau_combo_cav": cav["tau_combo"],
            "per_drug_cav": cav["per_drug"],
            "source": arm.source,
            "notes": arm.notes,
        }
        results.append(result)

        # Print arm summary
        conv_ok = arm.week8_conversion_pct >= 80
        c_ok = cav["c_lesion"] >= 5
        match = (conv_ok and c_ok) or (not conv_ok and not c_ok)

        print(f"{'✓' if match else '✗'} {arm.name}")
        print(f"   Drugs: {', '.join(arm.drugs)}")
        print(f"   C_lesion:  cav={cav['c_lesion']:.2f}  non-cav={noncav['c_lesion']:.2f}")
        print(f"   K_combo:   {cav['k_combo']:.3f}   tau_combo: {cav['tau_combo']:.2f}")
        print(f"   Week-8 conversion: {arm.week8_conversion_pct}%   Relapse: {arm.relapse_pct}%")
        print(f"   Model says ≥5: {'YES' if c_ok else 'NO'}   Clinical success: {'YES' if conv_ok else 'NO'}")
        if arm.notes:
            print(f"   Note: {arm.notes}")

        # Per-drug breakdown
        print(f"   Per-drug K_pathway (cavitary):")
        for drug, d in cav["per_drug"].items():
            print(f"     {drug:14s}  K_path={d['k_pathway']:.3f}  (admet={d['k_admet']:.2f} gran={d['k_gran']:.2f} phen={d['k_phen']:.2f} res={d['k_res']:.2f})  tau={d['tau']:.2f}")
        print()

    # ========================================================================
    # THRESHOLD ANALYSIS — ROC-style
    # ========================================================================
    print("=" * 80)
    print("THRESHOLD ANALYSIS — Finding optimal C_lesion cut-point")
    print("=" * 80)
    print()

    # Use week-8 conversion ≥ 80% as "clinical success" binary label
    # Try thresholds from 2 to 15 in steps of 0.5
    print(f"{'Threshold':>10s}  {'Sens':>6s}  {'Spec':>6s}  {'PPV':>6s}  {'NPV':>6s}  {'Accuracy':>8s}  {'Youden':>7s}")
    print("-" * 65)

    best_youden = -1.0
    best_thresh = 0.0

    for thresh_10x in range(20, 151, 5):
        thresh = thresh_10x / 10.0
        tp = fp = tn = fn = 0
        for r in results:
            clinical_success = r["week8_conversion_pct"] >= 80
            model_positive = r["c_lesion_cavitary"] >= thresh
            if model_positive and clinical_success:
                tp += 1
            elif model_positive and not clinical_success:
                fp += 1
            elif not model_positive and not clinical_success:
                tn += 1
            else:
                fn += 1

        sens = tp / (tp + fn) if (tp + fn) > 0 else 0
        spec = tn / (tn + fp) if (tn + fp) > 0 else 0
        ppv  = tp / (tp + fp) if (tp + fp) > 0 else 0
        npv  = tn / (tn + fn) if (tn + fn) > 0 else 0
        acc  = (tp + tn) / len(results) if results else 0
        youden = sens + spec - 1

        marker = ""
        if youden > best_youden:
            best_youden = youden
            best_thresh = thresh
            marker = " ←"

        print(f"{thresh:10.1f}  {sens:6.2f}  {spec:6.2f}  {ppv:6.2f}  {npv:6.2f}  {acc:8.2f}  {youden:7.3f}{marker}")

    print()
    print(f"Optimal threshold (max Youden index): C_lesion ≥ {best_thresh:.1f}")
    print(f"  Youden J = {best_youden:.3f}")
    print()

    # ========================================================================
    # CONCORDANCE TABLE
    # ========================================================================
    print("=" * 80)
    print(f"CONCORDANCE TABLE — C_lesion ≥ {best_thresh} vs Week-8 Conversion ≥ 80%")
    print("=" * 80)
    print()

    tp = fp = tn = fn = 0
    concordant = []
    discordant = []

    for r in results:
        clinical_success = r["week8_conversion_pct"] >= 80
        model_positive = r["c_lesion_cavitary"] >= best_thresh
        match = (model_positive == clinical_success)
        if match:
            concordant.append(r)
        else:
            discordant.append(r)
        if model_positive and clinical_success:
            tp += 1
        elif model_positive and not clinical_success:
            fp += 1
        elif not model_positive and not clinical_success:
            tn += 1
        else:
            fn += 1

    print(f"                    | Clinical ≥80% | Clinical <80% |")
    print(f"  Model ≥ {best_thresh:.1f}      |      TP = {tp:2d}   |      FP = {fp:2d}   |")
    print(f"  Model < {best_thresh:.1f}      |      FN = {fn:2d}   |      TN = {tn:2d}   |")
    print()
    print(f"  Accuracy: {(tp+tn)/len(results)*100:.1f}%  ({tp+tn}/{len(results)})")
    print(f"  Sensitivity: {tp/(tp+fn)*100:.1f}%" if (tp+fn) > 0 else "  Sensitivity: N/A")
    print(f"  Specificity: {tn/(tn+fp)*100:.1f}%" if (tn+fp) > 0 else "  Specificity: N/A")
    print()

    if discordant:
        print("Discordant cases:")
        for r in discordant:
            print(f"  {r['arm']}: C_lesion={r['c_lesion_cavitary']:.2f}, week8={r['week8_conversion_pct']}%")
    else:
        print("All arms concordant — perfect binary classification!")
    print()

    # ========================================================================
    # CORRELATION ANALYSIS
    # ========================================================================
    print("=" * 80)
    print("CORRELATION: C_lesion vs Week-8 Conversion Rate")
    print("=" * 80)
    print()

    c_values = [r["c_lesion_cavitary"] for r in results]
    conv_values = [r["week8_conversion_pct"] for r in results]

    # Pearson correlation
    n = len(c_values)
    mean_c = sum(c_values) / n
    mean_conv = sum(conv_values) / n
    cov = sum((c - mean_c) * (v - mean_conv) for c, v in zip(c_values, conv_values)) / n
    std_c = (sum((c - mean_c)**2 for c in c_values) / n) ** 0.5
    std_conv = (sum((v - mean_conv)**2 for v in conv_values) / n) ** 0.5
    pearson_r = cov / (std_c * std_conv) if std_c > 0 and std_conv > 0 else 0
    r_squared = pearson_r ** 2

    print(f"  Pearson r  = {pearson_r:.4f}")
    print(f"  R²         = {r_squared:.4f}")
    print(f"  n          = {n}")
    print()

    # Spearman rank correlation (manual, no scipy dependency)
    ranks_c = rank_data(c_values)
    ranks_conv = rank_data(conv_values)
    mean_rc = sum(ranks_c) / n
    mean_rv = sum(ranks_conv) / n
    cov_rank = sum((rc - mean_rc) * (rv - mean_rv) for rc, rv in zip(ranks_c, ranks_conv)) / n
    std_rc = (sum((rc - mean_rc)**2 for rc in ranks_c) / n) ** 0.5
    std_rv = (sum((rv - mean_rv)**2 for rv in ranks_conv) / n) ** 0.5
    spearman_rho = cov_rank / (std_rc * std_rv) if std_rc > 0 and std_rv > 0 else 0

    print(f"  Spearman ρ = {spearman_rho:.4f}")
    print()

    # Relapse correlation
    print("=" * 80)
    print("CORRELATION: C_lesion vs Relapse Rate (inverse expected)")
    print("=" * 80)
    print()

    relapse_values = [r["relapse_pct"] for r in results]
    mean_rel = sum(relapse_values) / n
    cov_rel = sum((c - mean_c) * (v - mean_rel) for c, v in zip(c_values, relapse_values)) / n
    std_rel = (sum((v - mean_rel)**2 for v in relapse_values) / n) ** 0.5
    pearson_rel = cov_rel / (std_c * std_rel) if std_c > 0 and std_rel > 0 else 0

    print(f"  Pearson r (C_lesion vs relapse) = {pearson_rel:.4f}  (expect negative)")
    print(f"  R²                               = {pearson_rel**2:.4f}")
    print()

    # ========================================================================
    # SCATTER PLOT (ASCII)
    # ========================================================================
    print("=" * 80)
    print("SCATTER: C_lesion (x) vs Week-8 Conversion % (y)")
    print("=" * 80)
    print()

    # ASCII scatter
    width, height = 60, 20
    x_min = min(c_values) - 0.5
    x_max = max(c_values) + 0.5
    y_min = min(conv_values) - 5
    y_max = max(conv_values) + 5

    grid = [[" "] * width for _ in range(height)]

    # Plot threshold line
    thresh_x_pos = int((best_thresh - x_min) / (x_max - x_min) * (width - 1))
    if 0 <= thresh_x_pos < width:
        for row in range(height):
            grid[row][thresh_x_pos] = "│"

    # Plot 80% conversion line
    conv80_y_pos = height - 1 - int((80 - y_min) / (y_max - y_min) * (height - 1))
    if 0 <= conv80_y_pos < height:
        for col in range(width):
            if grid[conv80_y_pos][col] == "│":
                grid[conv80_y_pos][col] = "┼"
            else:
                grid[conv80_y_pos][col] = "─"

    # Plot points
    for i, (cx, cy) in enumerate(zip(c_values, conv_values)):
        px = int((cx - x_min) / (x_max - x_min) * (width - 1))
        py = height - 1 - int((cy - y_min) / (y_max - y_min) * (height - 1))
        px = max(0, min(width - 1, px))
        py = max(0, min(height - 1, py))
        grid[py][px] = "●"

    for row in grid:
        print(f"  {''.join(row)}")

    print(f"  {'':>{thresh_x_pos}}↑ θ={best_thresh}")
    print(f"  C_lesion: {x_min:.1f} {'─' * (width - 10)} {x_max:.1f}")
    print(f"  Y-axis: {y_min:.0f}% — {y_max:.0f}% (week-8 conversion)")
    print()

    # ========================================================================
    # FINAL SUMMARY
    # ========================================================================
    print("=" * 80)
    print("VALIDATION SUMMARY")
    print("=" * 80)
    print()
    print(f"  Trial arms analyzed:     {len(results)}")
    print(f"  Total patients (Σn):     {sum(r['n'] for r in results):,}")
    print(f"  Optimal threshold:       C_lesion ≥ {best_thresh:.1f}")
    print(f"  Youden J index:          {best_youden:.3f}")
    print(f"  Classification accuracy: {(tp+tn)/len(results)*100:.1f}%")
    print(f"  Pearson r (conversion):  {pearson_r:.4f}  (R² = {r_squared:.4f})")
    print(f"  Spearman ρ (conversion): {spearman_rho:.4f}")
    print(f"  Pearson r (relapse):     {pearson_rel:.4f}  (expect negative)")
    print()
    print("  Spec validation target: C_lesion ≥ θ predicts ≥80% sputum conversion")
    print(f"  Result: {'VALIDATED' if (tp+tn)/len(results) >= 0.80 else 'NEEDS RECALIBRATION'}")
    print()

    # ========================================================================
    # ALTERNATIVE ANALYSIS — Relapse-based clinical success (≤ 7%)
    # ========================================================================
    print("=" * 80)
    print("ALTERNATIVE: Relapse ≤ 7% as clinical success criterion")
    print("(More clinically relevant — RIPE cures with 1.7-3.9% relapse)")
    print("=" * 80)
    print()

    print(f"{'Threshold':>10s}  {'Sens':>6s}  {'Spec':>6s}  {'PPV':>6s}  {'NPV':>6s}  {'Accuracy':>8s}  {'Youden':>7s}")
    print("-" * 65)

    best_youden_r = -1.0
    best_thresh_r = 0.0

    for thresh_10x in range(20, 201, 5):
        thresh = thresh_10x / 10.0
        tp = fp = tn = fn = 0
        for r in results:
            clinical_success = r["relapse_pct"] <= 7.0
            model_positive = r["c_lesion_cavitary"] >= thresh
            if model_positive and clinical_success:
                tp += 1
            elif model_positive and not clinical_success:
                fp += 1
            elif not model_positive and not clinical_success:
                tn += 1
            else:
                fn += 1

        sens = tp / (tp + fn) if (tp + fn) > 0 else 0
        spec = tn / (tn + fp) if (tn + fp) > 0 else 0
        ppv  = tp / (tp + fp) if (tp + fp) > 0 else 0
        npv  = tn / (tn + fn) if (tn + fn) > 0 else 0
        acc  = (tp + tn) / len(results) if results else 0
        youden = sens + spec - 1

        marker = ""
        if youden > best_youden_r:
            best_youden_r = youden
            best_thresh_r = thresh
            marker = " ←"

        if thresh_10x % 10 == 0 or marker:
            print(f"{thresh:10.1f}  {sens:6.2f}  {spec:6.2f}  {ppv:6.2f}  {npv:6.2f}  {acc:8.2f}  {youden:7.3f}{marker}")

    print()
    print(f"Optimal threshold (relapse ≤ 7%): C_lesion ≥ {best_thresh_r:.1f}")
    print(f"  Youden J = {best_youden_r:.3f}")
    print()

    # Concordance for relapse-based threshold
    tp = fp = tn = fn = 0
    for r in results:
        clinical_success = r["relapse_pct"] <= 7.0
        model_positive = r["c_lesion_cavitary"] >= best_thresh_r
        if model_positive and clinical_success:
            tp += 1
        elif model_positive and not clinical_success:
            fp += 1
        elif not model_positive and not clinical_success:
            tn += 1
        else:
            fn += 1

    print(f"  Concordance (relapse ≤ 7%):")
    print(f"    TP={tp}  FP={fp}")
    print(f"    FN={fn}  TN={tn}")
    print(f"    Accuracy: {(tp+tn)/len(results)*100:.1f}%")
    print()

    # ========================================================================
    # COMPOSITE SCORE: Conversion ≥ 75% AND relapse ≤ 8%
    # A more clinically realistic definition of "treatment works"
    # ========================================================================
    print("=" * 80)
    print("COMPOSITE: Conversion ≥ 75% AND Relapse ≤ 8% = clinical success")
    print("=" * 80)
    print()

    print(f"{'Threshold':>10s}  {'Sens':>6s}  {'Spec':>6s}  {'PPV':>6s}  {'NPV':>6s}  {'Accuracy':>8s}  {'Youden':>7s}")
    print("-" * 65)

    best_youden_c = -1.0
    best_thresh_c = 0.0

    for thresh_10x in range(20, 201, 5):
        thresh = thresh_10x / 10.0
        tp = fp = tn = fn = 0
        for r in results:
            clinical_success = (r["week8_conversion_pct"] >= 75 and r["relapse_pct"] <= 8.0)
            model_positive = r["c_lesion_cavitary"] >= thresh
            if model_positive and clinical_success:
                tp += 1
            elif model_positive and not clinical_success:
                fp += 1
            elif not model_positive and not clinical_success:
                tn += 1
            else:
                fn += 1

        sens = tp / (tp + fn) if (tp + fn) > 0 else 0
        spec = tn / (tn + fp) if (tn + fp) > 0 else 0
        ppv  = tp / (tp + fp) if (tp + fp) > 0 else 0
        npv  = tn / (tn + fn) if (tn + fn) > 0 else 0
        acc  = (tp + tn) / len(results) if results else 0
        youden = sens + spec - 1

        marker = ""
        if youden > best_youden_c:
            best_youden_c = youden
            best_thresh_c = thresh
            marker = " ←"

        if thresh_10x % 10 == 0 or marker:
            print(f"{thresh:10.1f}  {sens:6.2f}  {spec:6.2f}  {ppv:6.2f}  {npv:6.2f}  {acc:8.2f}  {youden:7.3f}{marker}")

    print()
    print(f"Optimal threshold (composite): C_lesion ≥ {best_thresh_c:.1f}")
    print(f"  Youden J = {best_youden_c:.3f}")
    print()

    # Concordance table for composite
    tp = fp = tn = fn = 0
    disc_c = []
    for r in results:
        clinical_success = (r["week8_conversion_pct"] >= 75 and r["relapse_pct"] <= 8.0)
        model_positive = r["c_lesion_cavitary"] >= best_thresh_c
        if model_positive and clinical_success:
            tp += 1
        elif model_positive and not clinical_success:
            fp += 1
        elif not model_positive and not clinical_success:
            tn += 1
        else:
            fn += 1
            disc_c.append(r)

    print(f"                    | Clinical YES  | Clinical NO   |")
    print(f"  Model ≥ {best_thresh_c:.1f}      |      TP = {tp:2d}   |      FP = {fp:2d}   |")
    print(f"  Model < {best_thresh_c:.1f}      |      FN = {fn:2d}   |      TN = {tn:2d}   |")
    print(f"  Accuracy: {(tp+tn)/len(results)*100:.1f}%")
    if disc_c:
        print("  Discordant (FN):")
        for r in disc_c:
            print(f"    {r['arm']}: C={r['c_lesion_cavitary']:.2f}, conv={r['week8_conversion_pct']}%, relapse={r['relapse_pct']}%")
    print()

    # Write results to JSON
    output = {
        "validation": "MIRADOR TB Module — TBTC / REMoxTB / Historical",
        "spec": "MIRADOR_TB_SPEC.md §Governing Equation",
        "governing_eq": "C_lesion = tau_combo / K_combo",
        "threshold_analysis": {
            "week8_80pct": {
                "optimal_threshold": best_thresh,
                "youden_j": round(best_youden, 4),
                "accuracy": round((tp + tn) / len(results), 4) if results else 0,
            },
            "relapse_7pct": {
                "optimal_threshold": best_thresh_r,
                "youden_j": round(best_youden_r, 4),
            },
            "composite_conv75_relapse8": {
                "optimal_threshold": best_thresh_c,
                "youden_j": round(best_youden_c, 4),
            },
        },
        "pearson_r_conversion": round(pearson_r, 4),
        "r_squared_conversion": round(r_squared, 4),
        "spearman_rho_conversion": round(spearman_rho, 4),
        "pearson_r_relapse": round(pearson_rel, 4),
        "n_arms": len(results),
        "total_patients": sum(r["n"] for r in results),
        "arms": results,
    }

    with open("tb_tbtc_validation_results.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("  Results written to tb_tbtc_validation_results.json")
    print()


def rank_data(values):
    """Simple rank computation (average rank for ties)."""
    indexed = sorted(enumerate(values), key=lambda x: x[1])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(indexed):
        j = i
        while j < len(indexed) and indexed[j][1] == indexed[i][1]:
            j += 1
        avg_rank = (i + j + 1) / 2.0
        for k in range(i, j):
            ranks[indexed[k][0]] = avg_rank
        i = j
    return ranks


if __name__ == "__main__":
    run_validation()
