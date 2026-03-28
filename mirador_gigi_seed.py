#!/usr/bin/env python3
"""
MIRADOR → GIGI Data Ingestion Suite
====================================
Seeds the GIGI fiber bundle database with pharmacological data from
five authoritative sources:

  1. EUCAST v14.0         — MIC breakpoints (bacterial)
  2. Stanford HIVDB v9.6  — HIV IC₅₀ / resistance
  3. FDA DailyMed         — AUC₂₄ at approved dosing
  4. DrugComb / NCI       — Combination synergy reference
  5. CRyPTIC / WHO CC     — TB critical concentrations

Usage:
  # Start GIGI locally
  docker run -d --name gigi-mirador -p 3142:3142 -v gigi-data:/data beerosadavis/gigi

  # Run seeding
  python mirador_gigi_seed.py [--host http://localhost:3142] [--dry-run]

  # Verify
  python mirador_gigi_seed.py --verify

Bundles created:
  mirador_drugs       — 60+ drug-compartment sections
  mirador_thresholds  — clinical breakpoint reference data
  mirador_regimens    — combination regimen definitions
  mirador_sources     — provenance chain (source → value mapping)
"""

from __future__ import annotations
import argparse, json, math, sys
from dataclasses import dataclass
from typing import Optional

# ── Lightweight GIGI client (no pip dependency) ─────────────────────
import urllib.request, urllib.error

class GigiClient:
    """Minimal GIGI REST client — no external dependencies."""

    def __init__(self, host: str = "http://localhost:3142", dry_run: bool = False):
        self.host = host.rstrip("/")
        self.dry_run = dry_run
        self._stats = {"bundles": 0, "records": 0}

    def _req(self, method, path, body=None):
        url = f"{self.host}{path}"
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")

        if self.dry_run:
            print(f"  [DRY RUN] {method} {path}")
            if body:
                keys = list(body.keys()) if isinstance(body, dict) else f"{len(body)} items"
                print(f"            payload keys: {keys}")
            return {"status": "dry-run"}

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err = e.read().decode() if e.fp else str(e)
            print(f"  ERROR {e.code}: {err}")
            raise

    def health(self):
        return self._req("GET", "/v1/health")

    def create_bundle(self, name, fields, keys, indexed=None, defaults=None):
        schema = {"fields": fields, "keys": keys}
        if indexed:
            schema["indexed"] = indexed
        if defaults:
            schema["defaults"] = defaults
        result = self._req("POST", "/v1/bundles", {"name": name, "schema": schema})
        self._stats["bundles"] += 1
        print(f"  ✓ Bundle '{name}' created")
        return result

    BATCH_SIZE = 10_000  # Fly.io memory safety — never exceed 10k per POST

    def insert(self, bundle, records):
        """Insert records in batches of BATCH_SIZE to avoid Fly.io OOM."""
        result = None
        for i in range(0, len(records), self.BATCH_SIZE):
            chunk = records[i : i + self.BATCH_SIZE]
            result = self._req("POST", f"/v1/bundles/{bundle}/insert", {"records": chunk})
            if len(records) > self.BATCH_SIZE:
                print(f"    batch {i // self.BATCH_SIZE + 1}: {len(chunk)} records")
        self._stats["records"] += len(records)
        return result

    def query(self, bundle, conditions=None, limit=100):
        body = {"limit": limit}
        if conditions:
            body["conditions"] = conditions
        return self._req("POST", f"/v1/bundles/{bundle}/query", body)

    def get(self, bundle, **keys):
        qs = "&".join(f"{k}={v}" for k, v in keys.items())
        return self._req("GET", f"/v1/bundles/{bundle}/get?{qs}")

    def curvature(self, bundle, field=None):
        path = f"/v1/bundles/{bundle}/curvature"
        if field:
            path += f"?field={field}"
        return self._req("GET", path)


# ── Math helpers ────────────────────────────────────────────────────

def tau(auc: float, mic: float) -> float:
    """τ = log₁₀(AUC₂₄ / MIC)"""
    return round(math.log10(auc / mic), 4)

def k_barrier(r: float) -> float:
    """K_barrier = -log₁₀(R) if R < 1, else 0"""
    return round(-math.log10(r), 4) if r < 1.0 else 0.0

def k_pathway(*components: float) -> float:
    return round(sum(components), 4)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOURCE 1: EUCAST v14.0 Clinical Breakpoints (2024)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Values extracted from:
#   EUCAST Breakpoint tables v14.0, 2024-01-01
#   https://www.eucast.org/clinical_breakpoints
#
# CLSI M100-Ed34 cross-referenced where noted.
# All MIC values in μg/mL.
# ─────────────────────────────────────────────────────────────────────

EUCAST_BREAKPOINTS = [
    # (drug, organism, MIC_S, MIC_R, standard, notes)
    # ── Meningitis (S. pneumoniae) ──
    ("Ceftriaxone",  "S. pneumoniae (meningitis)", 0.5,   2.0,   "EUCAST v14.0 / CLSI M100", "Meningitis indication; CLSI S ≤ 0.5"),
    ("Vancomycin",   "S. pneumoniae (meningitis)", 2.0,   2.0,   "CLSI M100-Ed34",           "EUCAST: IE. CLSI: S ≤ 1. Inherently susceptible."),
    ("Rifampin",     "S. pneumoniae (meningitis)", 0.5,   4.0,   "CLSI M100-Ed34",           "EUCAST: no S.pn BP. CLSI: S ≤ 1. Adjunctive only."),
    ("Linezolid",    "S. pneumoniae (meningitis)", 2.0,   4.0,   "EUCAST v14.0 / CLSI M100", "S ≤ 2 (both standards)"),

    # ── MRSA (S. aureus) ──
    ("Vancomycin",   "S. aureus (MRSA)",           2.0,   2.0,   "EUCAST v14.0 / CLSI M100", "MIC ≥ 4 = VRSA. MIC creep concern at 1.5-2."),
    ("Ceftaroline",  "S. aureus (MRSA)",           1.0,   2.0,   "EUCAST v14.0 / CLSI M100", "Unique anti-MRSA cephalosporin (PBP2a binding)"),
    ("Daptomycin",   "S. aureus (MRSA)",           1.0,   1.0,   "EUCAST v14.0 / CLSI M100", "No EUCAST R — 'S, dose-dependent' only"),
    ("Linezolid",    "S. aureus (MRSA)",           4.0,   4.0,   "EUCAST v14.0 / CLSI M100", ""),
    ("Clindamycin",  "S. aureus (MRSA)",           0.25,  0.5,   "EUCAST v14.0",             "CLSI: S ≤ 0.5. D-test for inducible R."),
    ("Rifampin",     "S. aureus (MRSA)",           0.06,  0.5,   "EUCAST v14.0",             "CLSI: S ≤ 1. NEVER monotherapy."),
]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOURCE 2: Stanford HIVDB v9.6 + published IC₅₀
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# IC₅₀ values from published cell-based assays (nM).
# AUC₂₄ from approved dosing, population PK (nM·hr).
# Penetration ratios from tissue distribution studies.
# ─────────────────────────────────────────────────────────────────────

HIV_DRUGS = [
    {
        "drug_name": "DTG", "drug_class": "INSTI", "disease": "hiv",
        "auc_24": 126400.0, "mic": 0.51,
        "k_admet": 0.05,
        "source_auc": "Song I, J Clin Pharmacol 2015; 55:169-176",
        "source_ic50": "Kobayashi M, Antimicrob Agents Chemother 2011; 55:813-821",
        "penetration": {
            "cns":           {"R": 0.01, "source": "Letendre SL, J Antimicrob Chemother 2014; 69:2006-2010"},
            "lymph_node":    {"R": 0.48, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
            "galt":          {"R": 0.35, "source": "Else LJ, J Antimicrob Chemother 2015; 70:2526-2535"},
            "genital_tract": {"R": 0.07, "source": "Else LJ, J Antimicrob Chemother 2015; 70:2526-2535"},
            "bone_marrow":   {"R": 0.40, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
        },
    },
    {
        "drug_name": "TFV", "drug_class": "NRTI", "disease": "hiv",
        "auc_24": 7630.0, "mic": 50.0,
        "k_admet": 0.10,
        "source_auc": "Kearney BP, Clin Pharmacokinet 2004; 43:595-612",
        "source_ic50": "Balzarini J, Biochem Biophys Res Commun 1996; 225:363-369",
        "penetration": {
            "cns":           {"R": 0.05, "source": "Best BM, Antimicrob Agents Chemother 2012; 56:2692-2697"},
            "lymph_node":    {"R": 0.33, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
            "galt":          {"R": 0.50, "source": "Patterson KB, J Infect Dis 2011; 204:1550-1556"},
            "genital_tract": {"R": 3.50, "source": "Patterson KB, Sci Transl Med 2013; 5:198ra108"},
            "bone_marrow":   {"R": 0.30, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
        },
    },
    {
        "drug_name": "FTC", "drug_class": "NRTI", "disease": "hiv",
        "auc_24": 40000.0, "mic": 8.0,
        "k_admet": 0.08,
        "source_auc": "Wang LH, Clin Pharmacol Ther 2004; 75:P20",
        "source_ic50": "Schinazi RF, Antimicrob Agents Chemother 1992; 36:2423-2431",
        "penetration": {
            "cns":           {"R": 0.03, "source": "Letendre SL, AIDS 2010; 24:1823-1830"},
            "lymph_node":    {"R": 0.40, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
            "galt":          {"R": 0.55, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
            "genital_tract": {"R": 1.80, "source": "Hendrix CW, PLoS One 2013; 8:e55013"},
            "bone_marrow":   {"R": 0.35, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
        },
    },
    {
        "drug_name": "DRV", "drug_class": "PI", "disease": "hiv",
        "auc_24": 170000.0, "mic": 1.2,
        "k_admet": 0.15,
        "source_auc": "Sekar VJ, Antimicrob Agents Chemother 2010; 54:2775-2782",
        "source_ic50": "De Meyer S, Antimicrob Agents Chemother 2005; 49:2314-2321",
        "penetration": {
            "cns":           {"R": 0.05, "source": "Croteau D, J Antimicrob Chemother 2012; 67:1258-1263"},
            "lymph_node":    {"R": 0.70, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
            "galt":          {"R": 0.45, "source": "Else LJ, J Antimicrob Chemother 2011; 66:1861-1866"},
            "genital_tract": {"R": 0.15, "source": "Else LJ, J Antimicrob Chemother 2011; 66:1861-1866"},
            "bone_marrow":   {"R": 0.35, "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
        },
    },
    {
        "drug_name": "EFV", "drug_class": "NNRTI", "disease": "hiv",
        "auc_24": 184000.0, "mic": 1.0,
        "k_admet": 0.20,
        "source_auc": "Csajka C, Clin Pharmacol Ther 2003; 73:20-30",
        "source_ic50": "Young SD, Antimicrob Agents Chemother 1995; 39:2602-2605",
        "penetration": {
            "cns":           {"R": 0.005, "source": "Tashima KT, AIDS 1999; 13:1819-1826"},
            "lymph_node":    {"R": 0.55,  "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
            "galt":          {"R": 0.40,  "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
            "genital_tract": {"R": 0.02,  "source": "Dumond JB, AIDS 2008; 22:1521-1528"},
            "bone_marrow":   {"R": 0.30,  "source": "Fletcher CV, J Infect Dis 2014; 210:846-850"},
        },
    },
]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOURCE 3: FDA DailyMed / Approved Labeling — AUC₂₄ and PK
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Each entry: drug, AUC₂₄, units, dose, range_low, range_high, reference
# Values from Section 12 (Clinical Pharmacology) of FDA-approved labels.
# ─────────────────────────────────────────────────────────────────────

FDA_AUC_DATA = [
    # Meningitis antibiotics (μg·hr/mL)
    {"drug": "CRO", "disease": "meningitis", "auc_24": 1000.0, "units": "ug_hr_mL",
     "dose": "2g IV q12h", "range": [600, 1400],
     "source": "Patel IH, Antimicrob Agents Chemother 1981; 20:634; Garot D, AAC 2011; 55:2301"},
    {"drug": "VAN", "disease": "meningitis", "auc_24": 400.0, "units": "ug_hr_mL",
     "dose": "Target AUC/MIC ≥ 400", "range": [400, 600],
     "source": "Rybak MJ, Am J Health-Syst Pharm 2020; 77:835 (IDSA/ASHP/SIDP Guidelines)"},
    {"drug": "RIF", "disease": "meningitis", "auc_24": 60.0, "units": "ug_hr_mL",
     "dose": "600mg IV", "range": [40, 80],
     "source": "Nau R, Clin Pharmacokinet 2010; 49:691-712"},
    {"drug": "LZD", "disease": "meningitis", "auc_24": 250.0, "units": "ug_hr_mL",
     "dose": "600mg PO/IV q12h", "range": [200, 350],
     "source": "Dryden MS, J Antimicrob Chemother 2011; 66:S7-S22; Brier ME, AAC 2003; 47:2775"},

    # HIV ARVs (nM·hr)
    {"drug": "DTG", "disease": "hiv", "auc_24": 126400.0, "units": "nM_hr",
     "dose": "50mg daily", "range": [80000, 180000],
     "source": "Song I, J Clin Pharmacol 2015; 55:169; Min S, AAC 2010; 54:254"},
    {"drug": "TFV", "disease": "hiv", "auc_24": 7630.0, "units": "nM_hr",
     "dose": "300mg daily (as TDF)", "range": [4000, 12000],
     "source": "Kearney BP, Clin Pharmacokinet 2004; 43:595-612"},
    {"drug": "FTC", "disease": "hiv", "auc_24": 40000.0, "units": "nM_hr",
     "dose": "200mg daily", "range": [25000, 60000],
     "source": "Wang LH, Clin Pharmacol Ther 2004; 75:P20"},
    {"drug": "DRV", "disease": "hiv", "auc_24": 170000.0, "units": "nM_hr",
     "dose": "800mg + 100mg RTV daily", "range": [120000, 250000],
     "source": "Sekar VJ, AAC 2010; 54:2775-2782"},
    {"drug": "EFV", "disease": "hiv", "auc_24": 184000.0, "units": "nM_hr",
     "dose": "600mg daily", "range": [130000, 250000],
     "source": "Csajka C, Clin Pharmacol Ther 2003; 73:20-30"},
]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOURCE 4: DrugComb / Bliss / Loewe — Synergy Reference Data
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REGIMEN_DATA = [
    {
        "regimen_id": "art_1st_dtg",
        "name": "DTG + TFV + FTC",
        "disease": "hiv",
        "drugs": ["DTG", "TFV", "FTC"],
        "indication": "Treatment-naive HIV-1 (1st-line ART)",
        "synergy_factor": 1.0,
        "clinical_efficacy": 0.97,
        "fic_index": 0.0068,
        "fic_interpretation": "synergy",
        "trial": "GEMINI-1/2",
        "source": "Cahn P, Lancet 2019; 393:143-155",
    },
    {
        "regimen_id": "art_2nd_drv",
        "name": "DRV/r + TFV + FTC",
        "disease": "hiv",
        "drugs": ["DRV", "TFV", "FTC"],
        "indication": "2nd-line or switch ART",
        "synergy_factor": 1.0,
        "clinical_efficacy": 0.93,
        "fic_index": 0.0068,
        "fic_interpretation": "synergy",
        "trial": "EMERALD",
        "source": "Orkin C, Lancet HIV 2020; 7:e23-e34",
    },
    {
        "regimen_id": "mening_empiric",
        "name": "CRO + VAN",
        "disease": "meningitis",
        "drugs": ["CRO", "VAN"],
        "indication": "Empiric bacterial meningitis",
        "synergy_factor": 1.0,
        "clinical_efficacy": 0.85,
        "fic_index": 0.014,
        "fic_interpretation": "synergy",
        "trial": "IDSA Guidelines",
        "source": "Tunkel AR, Clin Infect Dis 2004; 39:1267-1284",
    },
    {
        "regimen_id": "mening_pcnr",
        "name": "CRO + VAN + RIF",
        "disease": "meningitis",
        "drugs": ["CRO", "VAN", "RIF"],
        "indication": "Penicillin-R pneumococcal meningitis",
        "synergy_factor": 1.10,
        "clinical_efficacy": 0.90,
        "fic_index": 0.035,
        "fic_interpretation": "synergy",
        "trial": "Multiple — see refs",
        "source": "van de Beek D, NEJM 2004; 351:1849; Martinez-Lacasa J, CID 2002; 34:1047",
    },
    {
        "regimen_id": "mrsa_pji_van_rif",
        "name": "VAN + RIF",
        "disease": "mrsa",
        "drugs": ["VAN", "RIF"],
        "indication": "MRSA prosthetic joint infection",
        "synergy_factor": 1.20,
        "clinical_efficacy": 0.82,
        "fic_index": 0.013,
        "fic_interpretation": "synergy",
        "trial": "Zimmerli protocol",
        "source": "Zimmerli W, NEJM 2004; 351:1645; Lew DP, Lancet 2004; 364:369",
    },
    {
        "regimen_id": "mrsa_salvage_dap_rif",
        "name": "DAP + RIF",
        "disease": "mrsa",
        "drugs": ["DAP", "RIF"],
        "indication": "MRSA implant salvage",
        "synergy_factor": 1.15,
        "clinical_efficacy": 0.78,
        "fic_index": 0.007,
        "fic_interpretation": "synergy",
        "trial": "Multiple",
        "source": "Byren I, AAC 2009; 53:2210; John AK, AAC 2009; 53:4057",
    },
    {
        "regimen_id": "mrsa_oral_lzd_rif",
        "name": "LZD + RIF",
        "disease": "mrsa",
        "drugs": ["LZD", "RIF"],
        "indication": "MRSA oral step-down (bone & joint)",
        "synergy_factor": 1.10,
        "clinical_efficacy": 0.75,
        "fic_index": 0.016,
        "fic_interpretation": "synergy",
        "trial": "OVIVA",
        "source": "Li HK, NEJM 2019; 380:425-436; Nguyen S, JAC 2009; 64:1337",
    },
    {
        "regimen_id": "tb_ripe",
        "name": "RIPE (INH + RIF + PZA + EMB)",
        "disease": "tb",
        "drugs": ["INH", "RIF", "PZA", "EMB"],
        "indication": "Drug-susceptible TB (intensive phase)",
        "synergy_factor": 1.20,
        "clinical_efficacy": 0.95,
        "fic_index": None,
        "fic_interpretation": "additive (multi-target cascade)",
        "trial": "WHO standard regimen",
        "source": "WHO consolidated guidelines on TB 2022; Mitchison DA, Am Rev Respir Dis 1979",
    },
    {
        "regimen_id": "tb_bpal",
        "name": "BPaL (BDQ + Pa + LZD)",
        "disease": "tb",
        "drugs": ["BDQ", "Pa", "LZD"],
        "indication": "XDR-TB / treatment-intolerant MDR-TB",
        "synergy_factor": 1.30,
        "clinical_efficacy": 0.90,
        "fic_index": None,
        "fic_interpretation": "synergy (novel MOA combination)",
        "trial": "TB-PRACTECAL, ZeNix",
        "source": "Conradie F, NEJM 2020; 382:893; Nyang'wa BT, NEJM 2022; 387:897",
    },
]

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SOURCE 5: CRyPTIC / WHO CC — TB Critical Concentrations
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# CRyPTIC Consortium: 20,000+ global M. tuberculosis isolates.
# WHO CC 2024 update (7H10/11 agar + MGIT broth).
# Phenotype MICs at 3 pH compartments from Mitchison/Zhang.
# ─────────────────────────────────────────────────────────────────────

TB_DRUGS = [
    {
        "drug_name": "INH", "disease": "tb",
        "who_cc": 0.1, "who_cc_method": "7H10/11 agar",
        "cryptic_ecoff": 0.1,
        "mic_std_ph7": 0.05, "mic_acid_ph55": 0.50, "mic_dormant": 50.0,
        "k_admet": 0.10,
        "tau_normalized": 3.50,
        "granuloma_R": {"lung": 0.80, "cellular": 0.60, "necrotic": 0.30, "cavity": 0.40},
        "source_mic": "Mitchison DA, Am Rev Respir Dis 1979; 120:1163",
        "source_cryptic": "CRyPTIC Consortium, Lancet Microbe 2022; 3:e265-e275",
        "source_granuloma": "Prideaux B, Nature Med 2015; 21:1223-1227",
    },
    {
        "drug_name": "RIF", "disease": "tb",
        "who_cc": 1.0, "who_cc_method": "7H10/11 + MGIT",
        "cryptic_ecoff": 0.5,
        "mic_std_ph7": 0.20, "mic_acid_ph55": 0.50, "mic_dormant": 2.0,
        "k_admet": 0.20,
        "tau_normalized": 4.00,
        "granuloma_R": {"lung": 0.30, "cellular": 0.20, "necrotic": 0.05, "cavity": 0.15},
        "source_mic": "Mitchison DA, Am Rev Respir Dis 1979; 120:1163",
        "source_cryptic": "CRyPTIC Consortium, Lancet Microbe 2022; 3:e265-e275",
        "source_granuloma": "Dartois VA, Nature Rev Microbiol 2022; 20:750-766",
    },
    {
        "drug_name": "PZA", "disease": "tb",
        "who_cc": 100.0, "who_cc_method": "MGIT (pH 5.9)",
        "cryptic_ecoff": None,
        "mic_std_ph7": None, "mic_acid_ph55": 16.0, "mic_dormant": 50.0,
        "k_admet": 0.05,
        "tau_normalized": 4.50,
        "granuloma_R": {"lung": 0.80, "cellular": 0.70, "necrotic": 0.40, "cavity": 0.60},
        "source_mic": "Zhang Y, J Antimicrob Chemother 2003; 52:790-795",
        "source_cryptic": None,
        "source_granuloma": "Via LE, Antimicrob Agents Chemother 2015; 59:5750",
    },
    {
        "drug_name": "EMB", "disease": "tb",
        "who_cc": 5.0, "who_cc_method": "7H10/11",
        "cryptic_ecoff": 5.0,
        "mic_std_ph7": 2.0, "mic_acid_ph55": 8.0, "mic_dormant": None,
        "k_admet": 0.08,
        "tau_normalized": 5.00,
        "granuloma_R": {"lung": 2.00, "cellular": 1.50, "necrotic": 0.80, "cavity": 1.00},
        "source_mic": "Mitchison DA, Am Rev Respir Dis 1979; 120:1163",
        "source_cryptic": "CRyPTIC Consortium, Lancet Microbe 2022; 3:e265-e275",
        "source_granuloma": "Prideaux B, Antimicrob Agents Chemother 2011; 55:2427",
    },
    {
        "drug_name": "MXF", "disease": "tb",
        "who_cc": 0.5, "who_cc_method": "7H10/11",
        "cryptic_ecoff": 0.25,
        "mic_std_ph7": 0.25, "mic_acid_ph55": 0.50, "mic_dormant": 4.0,
        "k_admet": 0.10,
        "tau_normalized": None,
        "granuloma_R": {"lung": 3.00, "cellular": 2.50, "necrotic": 1.50, "cavity": 2.00},
        "source_mic": "Poissy J, Antimicrob Agents Chemother 2010; 54:4316",
        "source_cryptic": "CRyPTIC Consortium, Lancet Microbe 2022; 3:e265-e275",
        "source_granuloma": "Prideaux B, Nature Med 2015; 21:1223-1227",
    },
    {
        "drug_name": "BDQ", "disease": "tb",
        "who_cc": 0.25, "who_cc_method": "MGIT (interim)",
        "cryptic_ecoff": None,
        "mic_std_ph7": 0.03, "mic_acid_ph55": 0.06, "mic_dormant": 0.25,
        "k_admet": 0.30,
        "tau_normalized": 4.00,
        "granuloma_R": {"lung": 5.00, "cellular": 4.00, "necrotic": 2.00, "cavity": 3.00},
        "source_mic": "Andries K, Science 2005; 307:223-227",
        "source_cryptic": None,
        "source_granuloma": "Dartois VA, Nature Rev Microbiol 2022; 20:750-766",
    },
    {
        "drug_name": "LZD_TB", "disease": "tb",
        "who_cc": 1.0, "who_cc_method": "7H10/11",
        "cryptic_ecoff": 1.0,
        "mic_std_ph7": 0.50, "mic_acid_ph55": 1.0, "mic_dormant": 4.0,
        "k_admet": 0.15,
        "tau_normalized": 4.00,
        "granuloma_R": {"lung": 1.20, "cellular": 1.00, "necrotic": 0.60, "cavity": 0.80},
        "source_mic": "Dietze R, Antimicrob Agents Chemother 2008; 52:1153",
        "source_cryptic": "CRyPTIC Consortium, Lancet Microbe 2022; 3:e265-e275",
        "source_granuloma": "Dartois VA, Nature Rev Microbiol 2022; 20:750-766",
    },
]

# ── Meningitis drugs (separate — CSF penetration model) ─────────────

MENINGITIS_DRUGS = [
    {
        "drug_name": "CRO", "disease": "meningitis",
        "auc_24": 1000.0, "mic": 0.015,
        "k_admet": 0.10,
        "R_uninflamed": 0.01, "R_inflamed": 0.15,
        "source_mic": "Weinstein MP, CLSI M100 v30, 2020",
        "source_pk": "Patel IH, Antimicrob Agents Chemother 1981; Nau R, Clin Pharmacokinet 2010",
    },
    {
        "drug_name": "VAN", "disease": "meningitis",
        "auc_24": 400.0, "mic": 1.0,
        "k_admet": 0.35,
        "R_uninflamed": 0.01, "R_inflamed": 0.18,
        "source_mic": "EUCAST v14.0; CLSI M100-Ed34",
        "source_pk": "Rybak MJ, Am J Health-Syst Pharm 2020; 77:835",
    },
    {
        "drug_name": "RIF", "disease": "meningitis",
        "auc_24": 60.0, "mic": 0.5,
        "k_admet": 0.20,
        "R_uninflamed": 0.15, "R_inflamed": 0.40,
        "source_mic": "CLSI M100-Ed34",
        "source_pk": "Nau R, Clin Pharmacokinet 2010; 49:691-712",
    },
    {
        "drug_name": "LZD", "disease": "meningitis",
        "auc_24": 250.0, "mic": 2.0,
        "k_admet": 0.15,
        "R_uninflamed": 0.40, "R_inflamed": 0.70,
        "source_mic": "EUCAST v14.0; CLSI M100-Ed34",
        "source_pk": "Dryden MS, JAC 2011; 66:S7-S22",
    },
]

# ── MRSA drugs (bone/biofilm model) ────────────────────────────────

MRSA_DRUGS = [
    {
        "drug_name": "VAN", "disease": "mrsa",
        "mic_planktonic": 1.0, "mbec": 512.0, "auc_24": 400.0,
        "R_bone": 0.20,
        "tau_keske": 12, "k_admet": 0.50,
        "source_mic": "EUCAST v14.0; CLSI M100-Ed34",
        "source_mbec": "Parra-Ruiz J, JAC 2012; 67:175-182",
        "source_bone": "Kunin CM, Ann Intern Med 1973; Stead DA, J Hosp Infect 1983",
    },
    {
        "drug_name": "CAR", "disease": "mrsa",
        "mic_planktonic": 1.0, "mbec": 128.0, "auc_24": 180.0,
        "R_bone": 0.30,
        "tau_keske": 12, "k_admet": 0.67,
        "source_mic": "EUCAST v14.0; CLSI M100-Ed34",
        "source_mbec": "Barber KE, Antimicrob Agents Chemother 2015; 59:5725",
        "source_bone": "Gauzit R, Med Mal Infect 2014; 44:169-174",
    },
    {
        "drug_name": "DAP", "disease": "mrsa",
        "mic_planktonic": 0.5, "mbec": 32.0, "auc_24": 500.0,
        "R_bone": 0.15,
        "tau_keske": 24, "k_admet": 0.60,
        "source_mic": "EUCAST v14.0; CLSI M100-Ed34",
        "source_mbec": "LaPlante KL, J Antimicrob Chemother 2012; 67:1172",
        "source_bone": "Senneville E, Int J Antimicrob Agents 2011; 37:311",
    },
    {
        "drug_name": "LZD", "disease": "mrsa",
        "mic_planktonic": 2.0, "mbec": 256.0, "auc_24": 250.0,
        "R_bone": 0.50,
        "tau_keske": 12, "k_admet": 0.40,
        "source_mic": "EUCAST v14.0; CLSI M100-Ed34",
        "source_mbec": "Stewart PS, J Antimicrob Chemother 2015; 70:2796",
        "source_bone": "Gould FK, J Antimicrob Chemother 2010; 65:1495",
    },
    {
        "drug_name": "CLI", "disease": "mrsa",
        "mic_planktonic": 0.25, "mbec": 64.0, "auc_24": 80.0,
        "R_bone": 0.525,
        "tau_keske": 8, "k_admet": 0.50,
        "source_mic": "EUCAST v14.0",
        "source_mbec": "Parra-Ruiz J, JAC 2012; 67:175-182",
        "source_bone": "Craig WA, Diagn Microbiol Infect Dis 2011; 69:214",
    },
    {
        "drug_name": "RIF", "disease": "mrsa",
        "mic_planktonic": 0.008, "mbec": 0.5, "auc_24": 60.0,
        "R_bone": 0.35,
        "tau_keske": 8, "k_admet": 0.50,
        "source_mic": "EUCAST v14.0",
        "source_mbec": "Parra-Ruiz J, JAC 2012; 67:175-182",
        "source_bone": "Zimmerli W, CID 2015; 61:e33",
    },
]


# ── Endocarditis drugs (vegetation diffusion model) ─────────────────
# Sources: Cremieux 1989, Xiong 2011 (review), Bayer AS studies
# K_ADMET = 0.1 for all drugs in this panel

ENDOCARDITIS_DRUGS = [
    {
        "drug_name": "NAF", "disease": "endocarditis",
        "auc_24": 200.0, "mic": 0.5,
        "k_admet": 0.10,
        "R_vegetation": 0.20,
        "source_pk": "Bayer AS, experimental models; FDA DailyMed",
    },
    {
        "drug_name": "CEF", "disease": "endocarditis",
        "auc_24": 350.0, "mic": 1.0,
        "k_admet": 0.10,
        "R_vegetation": 0.15,
        "source_pk": "Cremieux 1989; FDA DailyMed",
    },
    {
        "drug_name": "VAN", "disease": "endocarditis",
        "auc_24": 400.0, "mic": 1.0,
        "k_admet": 0.10,
        "R_vegetation": 0.10,
        "source_pk": "Cremieux 1989; Xiong 2011; FDA DailyMed",
    },
    {
        "drug_name": "DAP", "disease": "endocarditis",
        "auc_24": 750.0, "mic": 0.5,
        "k_admet": 0.10,
        "R_vegetation": 0.15,
        "source_pk": "Xiong 2011; FDA DailyMed",
    },
    {
        "drug_name": "GEN", "disease": "endocarditis",
        "auc_24": 70.0, "mic": 0.5,
        "k_admet": 0.10,
        "R_vegetation": 0.05,
        "source_pk": "Bayer AS; Xiong 2011; FDA DailyMed",
    },
    {
        "drug_name": "RIF", "disease": "endocarditis",
        "auc_24": 60.0, "mic": 0.008,
        "k_admet": 0.10,
        "R_vegetation": 0.50,
        "source_pk": "Cremieux 1989; Xiong 2011; FDA DailyMed",
    },
    {
        "drug_name": "CRO", "disease": "endocarditis",
        "auc_24": 550.0, "mic": 2.0,
        "k_admet": 0.10,
        "R_vegetation": 0.12,
        "source_pk": "Cremieux 1989; FDA DailyMed",
    },
    {
        "drug_name": "LZD", "disease": "endocarditis",
        "auc_24": 200.0, "mic": 2.0,
        "k_admet": 0.10,
        "R_vegetation": 0.35,
        "source_pk": "Xiong 2011; Bayer studies; FDA DailyMed",
    },
]


# ── Meningitis + Dexamethasone drugs (dynamic BBB model) ────────────
# Sources: Nau 2010 (Clin Micro Rev), Ricard 2007, Lutsar 1998
# K_ADMET = 0.1 for all drugs in this panel

MENINGITIS_DEX_DRUGS = [
    {
        "drug_name": "CRO", "disease": "meningitis_dex",
        "auc_24": 550.0, "mic": 0.5,
        "k_admet": 0.10,
        "R_inflamed": 0.15, "R_dex": 0.10,
        "source_pk": "Nau R, Clin Pharmacokinet 2010; FDA DailyMed",
    },
    {
        "drug_name": "VAN", "disease": "meningitis_dex",
        "auc_24": 400.0, "mic": 0.5,
        "k_admet": 0.10,
        "R_inflamed": 0.10, "R_dex": 0.04,
        "source_pk": "Ricard 2007; Paris 2008; FDA DailyMed",
    },
    {
        "drug_name": "MER", "disease": "meningitis_dex",
        "auc_24": 200.0, "mic": 0.25,
        "k_admet": 0.10,
        "R_inflamed": 0.10, "R_dex": 0.05,
        "source_pk": "Nau R, Clin Pharmacokinet 2010; FDA DailyMed",
    },
    {
        "drug_name": "AMP", "disease": "meningitis_dex",
        "auc_24": 150.0, "mic": 0.25,
        "k_admet": 0.10,
        "R_inflamed": 0.10, "R_dex": 0.05,
        "source_pk": "Nau R, Clin Pharmacokinet 2010; FDA DailyMed",
    },
    {
        "drug_name": "RIF", "disease": "meningitis_dex",
        "auc_24": 60.0, "mic": 0.03,
        "k_admet": 0.10,
        "R_inflamed": 0.20, "R_dex": 0.15,
        "source_pk": "Nau R, Clin Pharmacokinet 2010; Lutsar 1998; FDA DailyMed",
    },
    {
        "drug_name": "PEN", "disease": "meningitis_dex",
        "auc_24": 180.0, "mic": 0.03,
        "k_admet": 0.10,
        "R_inflamed": 0.08, "R_dex": 0.03,
        "source_pk": "Nau R, Clin Pharmacokinet 2010; Lutsar 1998; FDA DailyMed",
    },
]


# ── Intra-abdominal abscess drugs (two-compartment model) ───────────
# Sources: Wittau 2010, Joiner 1981, Wagner 2006, SIS 2010
# K_ADMET = 0.1 for all drugs in this panel

ABSCESS_DRUGS = [
    {
        "drug_name": "MET", "disease": "abscess",
        "auc_24": 130.0, "mic": 1.0,
        "k_admet": 0.10,
        "R_peritoneal": 0.80, "R_abscess": 0.12,
        "source_pk": "Wittau 2010; Joiner 1981; FDA DailyMed",
    },
    {
        "drug_name": "CLI", "disease": "abscess",
        "auc_24": 30.0, "mic": 0.25,
        "k_admet": 0.10,
        "R_peritoneal": 0.60, "R_abscess": 0.08,
        "source_pk": "Wittau 2010; FDA DailyMed",
    },
    {
        "drug_name": "CIP", "disease": "abscess",
        "auc_24": 30.0, "mic": 0.06,
        "k_admet": 0.10,
        "R_peritoneal": 0.70, "R_abscess": 0.06,
        "source_pk": "Wittau 2010; FDA DailyMed",
    },
    {
        "drug_name": "MER", "disease": "abscess",
        "auc_24": 200.0, "mic": 0.25,
        "k_admet": 0.10,
        "R_peritoneal": 0.30, "R_abscess": 0.03,
        "source_pk": "Wittau 2010; FDA DailyMed",
    },
    {
        "drug_name": "TZP", "disease": "abscess",
        "auc_24": 250.0, "mic": 0.5,
        "k_admet": 0.10,
        "R_peritoneal": 0.20, "R_abscess": 0.02,
        "source_pk": "Wittau 2010; FDA DailyMed",
    },
    {
        "drug_name": "CRO", "disease": "abscess",
        "auc_24": 550.0, "mic": 0.06,
        "k_admet": 0.10,
        "R_peritoneal": 0.15, "R_abscess": 0.02,
        "source_pk": "Wittau 2010; FDA DailyMed",
    },
    {
        "drug_name": "GEN", "disease": "abscess",
        "auc_24": 70.0, "mic": 0.5,
        "k_admet": 0.10,
        "R_peritoneal": 0.10, "R_abscess": 0.01,
        "source_pk": "Wittau 2010; Wagner 2006; FDA DailyMed",
    },
    {
        "drug_name": "VAN", "disease": "abscess",
        "auc_24": 400.0, "mic": 1.0,
        "k_admet": 0.10,
        "R_peritoneal": 0.10, "R_abscess": 0.01,
        "source_pk": "Wittau 2010; Wagner 2006; FDA DailyMed",
    },
]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# BUNDLE DEFINITIONS & SEEDING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def create_bundles(db: GigiClient):
    """Create the four MIRADOR bundles."""
    print("\n── Creating bundles ──")

    # 1. Drug-compartment sections
    db.create_bundle("mirador_drugs", fields={
        "compound_id":    "numeric",
        "compartment":    "categorical",
        "drug_name":      "text",
        "drug_class":     "categorical",
        "disease":        "categorical",
        "auc_24":         "numeric",
        "mic":            "numeric",
        "tau":            "numeric",
        "k_admet":        "numeric",
        "r_penetration":  "numeric",
        "k_barrier":      "numeric",
        "k_phenotype":    "numeric",
        "k_reservoir":    "numeric",
        "k_biofilm":      "numeric",
        "reference":      "text",
    }, keys=["compound_id", "compartment"],
       indexed=["disease", "drug_name", "compartment"],
       defaults={"k_phenotype": 0.0, "k_reservoir": 0.0, "k_biofilm": 0.0})

    # 2. Breakpoint / threshold reference
    db.create_bundle("mirador_thresholds", fields={
        "drug_name":     "text",
        "organism":      "text",
        "mic_s":         "numeric",
        "mic_r":         "numeric",
        "standard":      "text",
        "edition":       "text",
        "notes":         "text",
    }, keys=["drug_name", "organism"],
       indexed=["standard"])

    # 3. Combination regimens
    db.create_bundle("mirador_regimens", fields={
        "regimen_id":          "text",
        "name":                "text",
        "disease":             "categorical",
        "drug_list":           "text",
        "indication":          "text",
        "synergy_factor":      "numeric",
        "clinical_efficacy":   "numeric",
        "fic_index":           "numeric",
        "fic_interpretation":  "text",
        "trial":               "text",
        "source":              "text",
    }, keys=["regimen_id"],
       indexed=["disease"])

    # 4. Source provenance chain
    db.create_bundle("mirador_sources", fields={
        "source_id":     "numeric",
        "drug_name":     "text",
        "field":         "text",
        "value":         "numeric",
        "units":         "text",
        "standard":      "text",
        "citation":      "text",
        "doi":           "text",
        "year":          "numeric",
    }, keys=["source_id"],
       indexed=["drug_name", "standard"])


def seed_hiv(db: GigiClient):
    """Seed HIV ARV drug-compartment sections."""
    print("\n── Seeding HIV drugs (5 drugs × 5 reservoirs = 25 sections) ──")
    records = []
    for cid, drug in enumerate(HIV_DRUGS, start=100):
        t = tau(drug["auc_24"], drug["mic"])
        for site, pen in drug["penetration"].items():
            R = pen["R"]
            kb = k_barrier(R)
            records.append({
                "compound_id": cid,
                "compartment": site,
                "drug_name": drug["drug_name"],
                "drug_class": drug["drug_class"],
                "disease": "hiv",
                "auc_24": drug["auc_24"],
                "mic": drug["mic"],
                "tau": t,
                "k_admet": drug["k_admet"],
                "r_penetration": R,
                "k_barrier": kb,
                "k_phenotype": 0.0,
                "k_reservoir": 0.0,
                "k_biofilm": 0.0,
                "reference": pen["source"],
            })
    result = db.insert("mirador_drugs", records)
    print(f"  Inserted {len(records)} HIV sections")
    return records


def seed_meningitis(db: GigiClient):
    """Seed meningitis drug sections (uninflamed + inflamed BBB)."""
    print("\n── Seeding meningitis drugs (4 drugs × 2 states = 8 sections) ──")
    records = []
    for cid, drug in enumerate(MENINGITIS_DRUGS, start=200):
        t = tau(drug["auc_24"], drug["mic"])
        for state, R in [("csf_uninflamed", drug["R_uninflamed"]),
                         ("csf_inflamed", drug["R_inflamed"])]:
            kb = k_barrier(R)
            records.append({
                "compound_id": cid,
                "compartment": state,
                "drug_name": drug["drug_name"],
                "drug_class": "antibiotic",
                "disease": "meningitis",
                "auc_24": drug["auc_24"],
                "mic": drug["mic"],
                "tau": t,
                "k_admet": drug["k_admet"],
                "r_penetration": R,
                "k_barrier": kb,
                "k_phenotype": 0.0,
                "k_reservoir": 0.0,
                "k_biofilm": 0.0,
                "reference": drug["source_pk"],
            })
    result = db.insert("mirador_drugs", records)
    print(f"  Inserted {len(records)} meningitis sections")
    return records


def seed_mrsa(db: GigiClient):
    """Seed MRSA biofilm drug sections."""
    print("\n── Seeding MRSA drugs (6 drugs × 2 compartments = 12 sections) ──")
    records = []
    for cid, drug in enumerate(MRSA_DRUGS, start=300):
        t = tau(drug["auc_24"], drug["mic_planktonic"])
        k_bio = round(math.log10(drug["mbec"] / drug["mic_planktonic"]), 4)
        for comp, R in [("bone", drug["R_bone"]), ("planktonic", 1.0)]:
            kb = k_barrier(R)
            records.append({
                "compound_id": cid,
                "compartment": comp,
                "drug_name": drug["drug_name"],
                "drug_class": "antibiotic",
                "disease": "mrsa",
                "auc_24": drug["auc_24"],
                "mic": drug["mic_planktonic"],
                "tau": t if comp == "planktonic" else drug["tau_keske"],
                "k_admet": drug["k_admet"],
                "r_penetration": R,
                "k_barrier": kb,
                "k_phenotype": 0.0,
                "k_reservoir": 0.0,
                "k_biofilm": k_bio,
                "reference": drug["source_mbec"],
            })
    result = db.insert("mirador_drugs", records)
    print(f"  Inserted {len(records)} MRSA sections")
    return records


def seed_tb(db: GigiClient):
    """Seed TB drugs with multi-compartment granuloma data."""
    print("\n── Seeding TB drugs (7 drugs × 4 lesion types = 28 sections) ──")
    records = []
    for cid, drug in enumerate(TB_DRUGS, start=400):
        t = drug["tau_normalized"] or 0.0
        for site, R in drug["granuloma_R"].items():
            kb = k_barrier(R)
            # Use the appropriate MIC for each compartment
            if site in ("cellular", "necrotic") and drug["mic_acid_ph55"] is not None:
                mic_val = drug["mic_acid_ph55"]
            elif drug["mic_std_ph7"] is not None:
                mic_val = drug["mic_std_ph7"]
            else:
                mic_val = drug["mic_acid_ph55"] or 0.0
            records.append({
                "compound_id": cid,
                "compartment": f"granuloma_{site}",
                "drug_name": drug["drug_name"],
                "drug_class": "anti-TB",
                "disease": "tb",
                "auc_24": 0.0,  # TB uses normalized τ, not raw AUC
                "mic": mic_val,
                "tau": t,
                "k_admet": drug["k_admet"],
                "r_penetration": R,
                "k_barrier": kb,
                "k_phenotype": 0.0,
                "k_reservoir": 0.0,
                "k_biofilm": 0.0,
                "reference": drug["source_granuloma"] or "",
            })
    result = db.insert("mirador_drugs", records)
    print(f"  Inserted {len(records)} TB sections")
    return records


def seed_endocarditis(db: GigiClient):
    """Seed endocarditis drug sections (vegetation NVE + PVE with biofilm)."""
    print("\n── Seeding endocarditis drugs (8 drugs × 2 compartments = 16 sections) ──")
    records = []
    for cid, drug in enumerate(ENDOCARDITIS_DRUGS, start=500):
        t = tau(drug["auc_24"], drug["mic"])
        R = drug["R_vegetation"]
        kb = k_barrier(R)
        # NVE — vegetation only, no biofilm
        records.append({
            "compound_id": cid,
            "compartment": "vegetation",
            "drug_name": drug["drug_name"],
            "drug_class": "antibiotic",
            "disease": "endocarditis",
            "auc_24": drug["auc_24"],
            "mic": drug["mic"],
            "tau": t,
            "k_admet": drug["k_admet"],
            "r_penetration": R,
            "k_barrier": kb,
            "k_phenotype": 0.0,
            "k_reservoir": 0.0,
            "k_biofilm": 0.0,
            "reference": drug["source_pk"],
        })
        # PVE — vegetation + prosthetic biofilm (K_biofilm = 2.0)
        records.append({
            "compound_id": cid,
            "compartment": "vegetation_pve",
            "drug_name": drug["drug_name"],
            "drug_class": "antibiotic",
            "disease": "endocarditis",
            "auc_24": drug["auc_24"],
            "mic": drug["mic"],
            "tau": t,
            "k_admet": drug["k_admet"],
            "r_penetration": R,
            "k_barrier": kb,
            "k_phenotype": 0.0,
            "k_reservoir": 0.0,
            "k_biofilm": 2.0,
            "reference": drug["source_pk"],
        })
    result = db.insert("mirador_drugs", records)
    print(f"  Inserted {len(records)} endocarditis sections")
    return records


def seed_meningitis_dex(db: GigiClient):
    """Seed meningitis + dexamethasone drug sections (inflamed + dex BBB)."""
    print("\n── Seeding meningitis+dex drugs (6 drugs × 2 states = 12 sections) ──")
    records = []
    for cid, drug in enumerate(MENINGITIS_DEX_DRUGS, start=600):
        t = tau(drug["auc_24"], drug["mic"])
        for state, R in [("csf_inflamed", drug["R_inflamed"]),
                         ("csf_dex", drug["R_dex"])]:
            kb = k_barrier(R)
            records.append({
                "compound_id": cid,
                "compartment": state,
                "drug_name": drug["drug_name"],
                "drug_class": "antibiotic",
                "disease": "meningitis_dex",
                "auc_24": drug["auc_24"],
                "mic": drug["mic"],
                "tau": t,
                "k_admet": drug["k_admet"],
                "r_penetration": R,
                "k_barrier": kb,
                "k_phenotype": 0.0,
                "k_reservoir": 0.0,
                "k_biofilm": 0.0,
                "reference": drug["source_pk"],
            })
    result = db.insert("mirador_drugs", records)
    print(f"  Inserted {len(records)} meningitis+dex sections")
    return records


def seed_abscess(db: GigiClient):
    """Seed intra-abdominal abscess drug sections (phlegmon + abscess capsule)."""
    print("\n── Seeding abscess drugs (8 drugs × 2 compartments = 16 sections) ──")
    records = []
    for cid, drug in enumerate(ABSCESS_DRUGS, start=700):
        t = tau(drug["auc_24"], drug["mic"])
        for comp, R in [("peritoneal", drug["R_peritoneal"]),
                        ("abscess_capsule", drug["R_abscess"])]:
            kb = k_barrier(R)
            records.append({
                "compound_id": cid,
                "compartment": comp,
                "drug_name": drug["drug_name"],
                "drug_class": "antibiotic",
                "disease": "abscess",
                "auc_24": drug["auc_24"],
                "mic": drug["mic"],
                "tau": t,
                "k_admet": drug["k_admet"],
                "r_penetration": R,
                "k_barrier": kb,
                "k_phenotype": 0.0,
                "k_reservoir": 0.0,
                "k_biofilm": 0.0,
                "reference": drug["source_pk"],
            })
    result = db.insert("mirador_drugs", records)
    print(f"  Inserted {len(records)} abscess sections")
    return records


def seed_thresholds(db: GigiClient):
    """Seed EUCAST/CLSI/WHO breakpoint data."""
    print("\n── Seeding breakpoints (EUCAST/CLSI/WHO) ──")
    records = []
    for drug, organism, mic_s, mic_r, std, notes in EUCAST_BREAKPOINTS:
        records.append({
            "drug_name": drug,
            "organism": organism,
            "mic_s": mic_s,
            "mic_r": mic_r,
            "standard": std,
            "edition": "2024",
            "notes": notes,
        })
    # Add WHO CC for TB
    for drug in TB_DRUGS:
        records.append({
            "drug_name": drug["drug_name"],
            "organism": "M. tuberculosis",
            "mic_s": drug["who_cc"],
            "mic_r": drug["who_cc"],
            "standard": "WHO CC 2024",
            "edition": "2024",
            "notes": f"Method: {drug['who_cc_method']}. CRyPTIC ECOFF: {drug['cryptic_ecoff']}",
        })
    result = db.insert("mirador_thresholds", records)
    print(f"  Inserted {len(records)} breakpoint records")
    return records


def seed_regimens(db: GigiClient):
    """Seed combination regimen data."""
    print("\n── Seeding regimens (DrugComb/Bliss/FIC) ──")
    records = []
    for reg in REGIMEN_DATA:
        records.append({
            "regimen_id": reg["regimen_id"],
            "name": reg["name"],
            "disease": reg["disease"],
            "drug_list": ",".join(reg["drugs"]),
            "indication": reg["indication"],
            "synergy_factor": reg["synergy_factor"],
            "clinical_efficacy": reg["clinical_efficacy"],
            "fic_index": reg["fic_index"] or 0.0,
            "fic_interpretation": reg["fic_interpretation"],
            "trial": reg["trial"],
            "source": reg["source"],
        })
    result = db.insert("mirador_regimens", records)
    print(f"  Inserted {len(records)} regimen records")
    return records


def seed_provenance(db: GigiClient):
    """Seed source provenance chain."""
    print("\n── Seeding provenance chain ──")
    records = []
    sid = 1

    # FDA AUC provenance
    for entry in FDA_AUC_DATA:
        records.append({
            "source_id": sid,
            "drug_name": entry["drug"],
            "field": "auc_24",
            "value": entry["auc_24"],
            "units": entry["units"],
            "standard": "FDA DailyMed",
            "citation": entry["source"],
            "doi": "",
            "year": 2024,
        })
        sid += 1

    # HIV IC₅₀ provenance
    for drug in HIV_DRUGS:
        records.append({
            "source_id": sid,
            "drug_name": drug["drug_name"],
            "field": "ic50",
            "value": drug["mic"],
            "units": "nM",
            "standard": "Published IC50",
            "citation": drug["source_ic50"],
            "doi": "",
            "year": 2024,
        })
        sid += 1

    # TB WHO CC provenance
    for drug in TB_DRUGS:
        records.append({
            "source_id": sid,
            "drug_name": drug["drug_name"],
            "field": "who_cc",
            "value": drug["who_cc"],
            "units": "ug_mL",
            "standard": "WHO CC 2024",
            "citation": drug.get("source_cryptic") or drug["source_mic"],
            "doi": "",
            "year": 2024,
        })
        sid += 1

    result = db.insert("mirador_sources", records)
    print(f"  Inserted {len(records)} provenance records")
    return records


# ── Verification ────────────────────────────────────────────────────

def verify(db: GigiClient):
    """Verify seeded data integrity."""
    print("\n── Verification ──")
    checks = 0
    passed = 0

    # Check health
    health = db.health()
    print(f"  GIGI health: {health.get('status', 'unknown')}")
    print(f"  Bundles: {health.get('bundles', '?')}")
    print(f"  Records: {health.get('total_records', '?')}")

    # Check DTG CNS section
    try:
        rec = db.get("mirador_drugs", compound_id=100, compartment="cns")
        checks += 1
        if rec.get("data", {}).get("drug_name") == "DTG":
            print("  ✓ DTG @ CNS found")
            passed += 1
        else:
            print("  ✗ DTG @ CNS missing or wrong")
    except Exception as e:
        print(f"  ✗ DTG @ CNS query failed: {e}")
        checks += 1

    # Check HIV drugs
    try:
        result = db.query("mirador_drugs",
                          conditions=[{"field": "disease", "op": "eq", "value": "hiv"}],
                          limit=100)
        checks += 1
        count = len(result.get("data", []))
        if count == 25:
            print(f"  ✓ HIV sections: {count} (5 drugs × 5 sites)")
            passed += 1
        else:
            print(f"  ⚠ HIV sections: {count} (expected 25)")
    except Exception as e:
        print(f"  ✗ HIV query failed: {e}")
        checks += 1

    # Check breakpoints
    try:
        result = db.query("mirador_thresholds",
                          conditions=[{"field": "standard", "op": "eq", "value": "WHO CC 2024"}],
                          limit=100)
        checks += 1
        count = len(result.get("data", []))
        if count == 7:
            print(f"  ✓ WHO CC records: {count}")
            passed += 1
        else:
            print(f"  ⚠ WHO CC records: {count} (expected 7)")
    except Exception as e:
        print(f"  ✗ Threshold query failed: {e}")
        checks += 1

    # Check regimens
    try:
        result = db.query("mirador_regimens", limit=100)
        checks += 1
        count = len(result.get("data", []))
        if count == len(REGIMEN_DATA):
            print(f"  ✓ Regimens: {count}")
            passed += 1
        else:
            print(f"  ⚠ Regimens: {count} (expected {len(REGIMEN_DATA)})")
    except Exception as e:
        print(f"  ✗ Regimen query failed: {e}")
        checks += 1

    # Check curvature
    try:
        curv = db.curvature("mirador_drugs", field="tau")
        kappa = curv.get("curvature", None)
        conf = curv.get("confidence", None)
        checks += 1
        if kappa is not None:
            print(f"  ✓ Bundle curvature κ(τ) = {kappa:.4f}, confidence = {conf:.4f}")
            passed += 1
        else:
            print(f"  ⚠ Curvature returned: {curv}")
    except Exception as e:
        print(f"  ✗ Curvature query failed: {e}")
        checks += 1

    print(f"\n  Verification: {passed}/{checks} checks passed")
    return passed == checks


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MAIN
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def main():
    parser = argparse.ArgumentParser(description="MIRADOR → GIGI Data Ingestion")
    parser.add_argument("--host", default="http://localhost:3142", help="GIGI host URL")
    parser.add_argument("--dry-run", action="store_true", help="Print API calls without executing")
    parser.add_argument("--verify", action="store_true", help="Run verification only (skip seeding)")
    args = parser.parse_args()

    db = GigiClient(host=args.host, dry_run=args.dry_run)

    print()
    print("╔═══════════════════════════════════════════════════════════════════╗")
    print("║  MIRADOR → GIGI Data Ingestion Suite                            ║")
    print("║  Sources: EUCAST · CLSI · WHO CC · Stanford HIVDB · FDA · CRyPTIC ║")
    print("╚═══════════════════════════════════════════════════════════════════╝")
    print(f"\n  Target: {args.host}")
    print(f"  Mode:   {'DRY RUN' if args.dry_run else 'LIVE'}")

    if args.verify:
        verify(db)
        return

    # Check GIGI is running
    if not args.dry_run:
        try:
            h = db.health()
            print(f"  GIGI status: {h.get('status', 'unknown')}")
        except Exception as e:
            print(f"\n  ✗ Cannot reach GIGI at {args.host}")
            print(f"    Error: {e}")
            print(f"\n  Start GIGI first:")
            print(f"    docker run -d --name gigi-mirador -p 3142:3142 -v gigi-data:/data beerosadavis/gigi")
            sys.exit(1)

    # Create bundles
    create_bundles(db)

    # Seed all data
    seed_hiv(db)
    seed_meningitis(db)
    seed_mrsa(db)
    seed_tb(db)
    seed_endocarditis(db)
    seed_meningitis_dex(db)
    seed_abscess(db)
    seed_thresholds(db)
    seed_regimens(db)
    seed_provenance(db)

    # Summary
    total = db._stats["records"]
    print(f"\n{'═' * 70}")
    print(f"  SEEDING COMPLETE")
    print(f"  Bundles: {db._stats['bundles']}")
    print(f"  Records: {total}")
    print(f"{'═' * 70}")

    n_drugs = 25 + 8 + 12 + 28 + 16 + 12 + 16  # HIV + Men + MRSA + TB + Endo + MenDex + Abscess
    expected = n_drugs + (10 + 7) + len(REGIMEN_DATA) + (len(FDA_AUC_DATA) + len(HIV_DRUGS) + len(TB_DRUGS))
    print(f"\n  Expected breakdown:")
    print(f"    mirador_drugs:      25 (HIV) + 8 (meningitis) + 12 (MRSA) + 28 (TB)")
    print(f"                      + 16 (endocarditis) + 12 (meningitis+dex) + 16 (abscess) = {n_drugs}")
    print(f"    mirador_thresholds: 10 (EUCAST/CLSI) + 7 (WHO CC) = 17")
    print(f"    mirador_regimens:   {len(REGIMEN_DATA)}")
    print(f"    mirador_sources:    {len(FDA_AUC_DATA)} (AUC) + {len(HIV_DRUGS)} (IC50) + {len(TB_DRUGS)} (WHO CC) = {len(FDA_AUC_DATA) + len(HIV_DRUGS) + len(TB_DRUGS)}")
    print(f"    TOTAL:              {expected}")

    # Run verification
    if not args.dry_run:
        print()
        verify(db)

    print()


if __name__ == "__main__":
    main()
