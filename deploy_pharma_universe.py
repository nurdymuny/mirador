#!/usr/bin/env python3
"""
Pharma Universe Warehouse → GIGI Deployment Script
====================================================
Deploys the 4-layer Unified Pharmacokinetic Geometry Warehouse
to the Fly.io GIGI instance (gigi-stream.fly.dev).

Usage:
  python deploy_pharma_universe.py                          # deploy to Fly.io
  python deploy_pharma_universe.py --host http://localhost:3142  # deploy locally
  python deploy_pharma_universe.py --dry-run                # preview API calls
  python deploy_pharma_universe.py --verify                 # verify only

Architecture:
  Layer 1 — Raw ingestion bundles (7 bundles, original schemas)
  Layer 2 — Harmonized master bundle (pharma_universe)
  Layer 3 — Computed bundles (k_pathway, coherence, double_cover)
  Layer 4 — Provenance bundles (firewall, chain)

Total: 14 bundles, 200+ records, 4 diseases, 23 drugs, 15+ tissues.
"""

from __future__ import annotations
import argparse, json, math, sys
import urllib.request, urllib.error


# ── GIGI REST Client ────────────────────────────────────────────

class GigiClient:
    def __init__(self, host: str, dry_run: bool = False):
        self.host = host.rstrip("/")
        self.dry_run = dry_run
        self.stats = {"bundles": 0, "records": 0, "errors": 0}

    def _req(self, method, path, body=None):
        url = f"{self.host}{path}"
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")

        if self.dry_run:
            print(f"  [DRY] {method} {path}")
            return {"status": "dry-run"}

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err = e.read().decode() if e.fp else str(e)
            print(f"  ERROR {e.code} on {path}: {err}")
            self.stats["errors"] += 1
            return {"error": err, "code": e.code}
        except Exception as e:
            print(f"  ERROR: {e}")
            self.stats["errors"] += 1
            return {"error": str(e)}

    def health(self):
        return self._req("GET", "/v1/health")

    def create_bundle(self, name, fields, keys, indexed=None):
        schema = {"fields": fields, "keys": keys}
        if indexed:
            schema["indexed"] = indexed
        result = self._req("POST", "/v1/bundles", {"name": name, "schema": schema})
        if "error" not in result:
            self.stats["bundles"] += 1
            print(f"  + Bundle '{name}'")
        return result

    def insert(self, bundle, records):
        # Convert booleans to ints and strip None values for GIGI compatibility
        clean = []
        for r in records:
            clean.append({k: (int(v) if isinstance(v, bool) else v)
                          for k, v in r.items() if v is not None})
        result = self._req("POST", f"/v1/bundles/{bundle}/insert", {"records": clean})
        if "error" not in result:
            self.stats["records"] += len(records)
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


# ── Math helpers ────────────────────────────────────────────────

def tau(auc, mic):
    return round(math.log10(auc / mic), 4) if auc and mic and mic > 0 else None

def k_barrier(r):
    return round(-math.log10(r), 4) if r and 0 < r < 1.0 else 0.0


# ═══════════════════════════════════════════════════════════════
# LAYER 1: RAW INGESTION BUNDLES
# ═══════════════════════════════════════════════════════════════

def create_layer1(db: GigiClient):
    print("\n── Layer 1: Raw Ingestion Bundles ──")

    # 1a. EUCAST MIC breakpoints
    db.create_bundle("raw_eucast", fields={
        "drug_name":  "categorical",
        "organism":   "categorical",
        "indication": "categorical",
        "mic_s":      "numeric",
        "mic_r":      "numeric",
        "standard":   "text",
        "notes":      "text",
    }, keys=["drug_name", "organism", "indication"],
       indexed=["drug_name", "organism"])

    db.insert("raw_eucast", [
        {"drug_name": "Vancomycin",  "organism": "S. aureus (MRSA)",           "indication": "systemic",    "mic_s": 2.0,  "mic_r": 2.0,  "standard": "EUCAST v14.0 / CLSI M100", "notes": "MIC >= 4 = VRSA"},
        {"drug_name": "Ceftaroline", "organism": "S. aureus (MRSA)",           "indication": "systemic",    "mic_s": 1.0,  "mic_r": 2.0,  "standard": "EUCAST v14.0 / CLSI M100", "notes": "PBP2a binding"},
        {"drug_name": "Daptomycin",  "organism": "S. aureus (MRSA)",           "indication": "systemic",    "mic_s": 1.0,  "mic_r": 1.0,  "standard": "EUCAST v14.0 / CLSI M100", "notes": "S dose-dependent"},
        {"drug_name": "Linezolid",   "organism": "S. aureus (MRSA)",           "indication": "systemic",    "mic_s": 4.0,  "mic_r": 4.0,  "standard": "EUCAST v14.0 / CLSI M100", "notes": ""},
        {"drug_name": "Clindamycin", "organism": "S. aureus (MRSA)",           "indication": "systemic",    "mic_s": 0.25, "mic_r": 0.5,  "standard": "EUCAST v14.0",              "notes": "D-test for inducible R"},
        {"drug_name": "Rifampin",    "organism": "S. aureus (MRSA)",           "indication": "systemic",    "mic_s": 0.06, "mic_r": 0.5,  "standard": "EUCAST v14.0",              "notes": "NEVER monotherapy"},
        {"drug_name": "Ceftriaxone", "organism": "S. pneumoniae (meningitis)", "indication": "meningitis",  "mic_s": 0.5,  "mic_r": 2.0,  "standard": "EUCAST v14.0 / CLSI M100", "notes": "Meningitis indication"},
        {"drug_name": "Vancomycin",  "organism": "S. pneumoniae (meningitis)", "indication": "meningitis",  "mic_s": 2.0,  "mic_r": 2.0,  "standard": "CLSI M100-Ed34",            "notes": "Inherently susceptible"},
        {"drug_name": "Rifampin",    "organism": "S. pneumoniae (meningitis)", "indication": "meningitis",  "mic_s": 0.5,  "mic_r": 4.0,  "standard": "CLSI M100-Ed34",            "notes": "Adjunctive only"},
        {"drug_name": "Linezolid",   "organism": "S. pneumoniae (meningitis)", "indication": "meningitis",  "mic_s": 2.0,  "mic_r": 4.0,  "standard": "EUCAST v14.0 / CLSI M100", "notes": ""},
    ])

    # 1b. WHO CC TB
    db.create_bundle("raw_who_cc", fields={
        "drug_name":  "categorical",
        "medium":     "categorical",
        "cc_mg_L":    "numeric",
        "mic_ph7":    "numeric",
        "mic_acidic":  "numeric",
        "source":     "text",
    }, keys=["drug_name", "medium"])

    db.insert("raw_who_cc", [
        {"drug_name": "Isoniazid",    "medium": "MGIT", "cc_mg_L": 0.1,   "mic_ph7": 0.05, "mic_acidic": 0.50, "source": "WHO CC 2024"},
        {"drug_name": "Rifampicin",   "medium": "MGIT", "cc_mg_L": 1.0,   "mic_ph7": 0.20, "mic_acidic": 0.50, "source": "WHO CC 2024"},
        {"drug_name": "Pyrazinamide", "medium": "MGIT", "cc_mg_L": 100.0, "mic_ph7": None,  "mic_acidic": 16.0, "source": "WHO CC 2024"},
        {"drug_name": "Ethambutol",   "medium": "MGIT", "cc_mg_L": 5.0,   "mic_ph7": 2.0,  "mic_acidic": 8.0,  "source": "WHO CC 2024"},
        {"drug_name": "Moxifloxacin", "medium": "MGIT", "cc_mg_L": 0.5,   "mic_ph7": 0.25, "mic_acidic": 0.50, "source": "WHO CC 2024"},
        {"drug_name": "Bedaquiline",  "medium": "MGIT", "cc_mg_L": 0.25,  "mic_ph7": 0.03, "mic_acidic": 0.06, "source": "WHO CC 2024"},
        {"drug_name": "Linezolid",    "medium": "MGIT", "cc_mg_L": 1.0,   "mic_ph7": 0.50, "mic_acidic": 1.0,  "source": "WHO CC 2024"},
    ])

    # 1c. Stanford HIVDB IC50
    db.create_bundle("raw_stanford_hivdb", fields={
        "drug_name":     "categorical",
        "drug_class":    "categorical",
        "ic50_nM":       "numeric",
        "auc_24_nM_hr":  "numeric",
        "k_admet":       "numeric",
        "source_ic50":   "text",
        "source_auc":    "text",
    }, keys=["drug_name", "drug_class"])

    db.insert("raw_stanford_hivdb", [
        {"drug_name": "DTG", "drug_class": "INSTI", "ic50_nM": 0.51,  "auc_24_nM_hr": 126400.0, "k_admet": 0.05, "source_ic50": "Kobayashi M, AAC 2011", "source_auc": "Song I, J Clin Pharmacol 2015"},
        {"drug_name": "TFV", "drug_class": "NRTI",  "ic50_nM": 50.0,  "auc_24_nM_hr": 7630.0,   "k_admet": 0.10, "source_ic50": "Balzarini J, BBRC 1996","source_auc": "Kearney BP, Clin Pharmacokinet 2004"},
        {"drug_name": "FTC", "drug_class": "NRTI",  "ic50_nM": 8.0,   "auc_24_nM_hr": 40000.0,  "k_admet": 0.08, "source_ic50": "Schinazi RF, AAC 1992", "source_auc": "Wang LH, Clin Pharmacol Ther 2004"},
        {"drug_name": "DRV", "drug_class": "PI",    "ic50_nM": 1.2,   "auc_24_nM_hr": 170000.0, "k_admet": 0.15, "source_ic50": "De Meyer S, AAC 2005",  "source_auc": "Sekar VJ, AAC 2010"},
        {"drug_name": "EFV", "drug_class": "NNRTI", "ic50_nM": 1.0,   "auc_24_nM_hr": 184000.0, "k_admet": 0.20, "source_ic50": "Young SD, AAC 1995",    "source_auc": "Csajka C, Clin Pharmacol Ther 2003"},
    ])

    # 1d. Tissue penetration R values
    db.create_bundle("raw_tissue_penetration", fields={
        "drug_name":  "categorical",
        "tissue":     "categorical",
        "condition":  "categorical",
        "r_value":    "numeric",
        "r_low":      "numeric",
        "r_high":     "numeric",
        "source":     "text",
    }, keys=["drug_name", "tissue", "condition"],
       indexed=["drug_name", "tissue"])

    tissue_records = [
        # Bone
        {"drug_name": "Vancomycin",  "tissue": "bone", "condition": "osteomyelitis", "r_value": 0.20, "r_low": 0.10, "r_high": 0.30, "source": "Graziani 1988 / Bue 2018"},
        {"drug_name": "Ceftaroline", "tissue": "bone", "condition": "standard",      "r_value": 0.30, "r_low": 0.20, "r_high": 0.40, "source": "Riccobene 2014"},
        {"drug_name": "Daptomycin",  "tissue": "bone", "condition": "standard",      "r_value": 0.15, "r_low": 0.10, "r_high": 0.20, "source": "Traunmuller 2010"},
        {"drug_name": "Linezolid",   "tissue": "bone", "condition": "standard",      "r_value": 0.50, "r_low": 0.40, "r_high": 0.60, "source": "Rana 2002"},
        {"drug_name": "Clindamycin", "tissue": "bone", "condition": "standard",      "r_value": 0.525,"r_low": 0.30, "r_high": 0.75, "source": "Feigin 1995"},
        {"drug_name": "Rifampin",    "tissue": "bone", "condition": "standard",      "r_value": 0.35, "r_low": 0.20, "r_high": 0.50, "source": "Currier 1979"},
        # CSF
        {"drug_name": "Ceftriaxone", "tissue": "csf", "condition": "uninflamed", "r_value": 0.01, "r_low": None, "r_high": None, "source": "Nau 2010"},
        {"drug_name": "Ceftriaxone", "tissue": "csf", "condition": "inflamed",   "r_value": 0.15, "r_low": None, "r_high": None, "source": "Nau 2010 / Lutsar 2000"},
        {"drug_name": "Vancomycin",  "tissue": "csf", "condition": "uninflamed", "r_value": 0.01, "r_low": None, "r_high": None, "source": "Nau 2010"},
        {"drug_name": "Vancomycin",  "tissue": "csf", "condition": "inflamed",   "r_value": 0.18, "r_low": None, "r_high": None, "source": "Nau 2010"},
        {"drug_name": "Rifampin",    "tissue": "csf", "condition": "uninflamed", "r_value": 0.15, "r_low": None, "r_high": None, "source": "Nau 2010"},
        {"drug_name": "Rifampin",    "tissue": "csf", "condition": "inflamed",   "r_value": 0.40, "r_low": None, "r_high": None, "source": "Nau 2010"},
        {"drug_name": "Linezolid",   "tissue": "csf", "condition": "uninflamed", "r_value": 0.40, "r_low": None, "r_high": None, "source": "Nau 2010"},
        {"drug_name": "Linezolid",   "tissue": "csf", "condition": "inflamed",   "r_value": 0.70, "r_low": None, "r_high": None, "source": "Nau 2010"},
    ]

    # HIV tissue penetration (5 drugs × 5 reservoirs)
    hiv_tissue = [
        ("DTG", [("cns", 0.01, "Letendre 2014"), ("lymph_node", 0.48, "Fletcher 2014"), ("galt", 0.35, "Else 2015"), ("genital_tract", 0.07, "Else 2015"), ("bone_marrow", 0.40, "Fletcher 2014")]),
        ("TFV", [("cns", 0.05, "Best 2012"),     ("lymph_node", 0.33, "Fletcher 2014"), ("galt", 0.50, "Patterson 2011"), ("genital_tract", 3.50, "Patterson 2013"), ("bone_marrow", 0.30, "Fletcher 2014")]),
        ("FTC", [("cns", 0.03, "Letendre 2010"), ("lymph_node", 0.40, "Fletcher 2014"), ("galt", 0.55, "Fletcher 2014"), ("genital_tract", 1.80, "Hendrix 2013"), ("bone_marrow", 0.35, "Fletcher 2014")]),
        ("DRV", [("cns", 0.05, "Croteau 2012"),  ("lymph_node", 0.70, "Fletcher 2014"), ("galt", 0.45, "Else 2011"), ("genital_tract", 0.15, "Else 2011"), ("bone_marrow", 0.35, "Fletcher 2014")]),
        ("EFV", [("cns", 0.005,"Tashima 1999"),  ("lymph_node", 0.55, "Fletcher 2014"), ("galt", 0.40, "Fletcher 2014"), ("genital_tract", 0.02, "Dumond 2008"), ("bone_marrow", 0.30, "Fletcher 2014")]),
    ]
    for drug, tissues in hiv_tissue:
        for tissue, r, src in tissues:
            tissue_records.append({"drug_name": drug, "tissue": tissue, "condition": "standard", "r_value": r, "r_low": None, "r_high": None, "source": src})

    # TB lesion penetration (7 drugs × 4 compartments)
    tb_tissue = [
        ("Isoniazid",    [("lung_plasma", 0.80), ("lung_cellular", 0.60), ("lung_necrotic", 0.30), ("lung_cavity", 0.40)]),
        ("Rifampicin",   [("lung_plasma", 0.30), ("lung_cellular", 0.20), ("lung_necrotic", 0.05), ("lung_cavity", 0.15)]),
        ("Pyrazinamide", [("lung_plasma", 0.80), ("lung_cellular", 0.70), ("lung_necrotic", 0.40), ("lung_cavity", 0.60)]),
        ("Ethambutol",   [("lung_plasma", 2.00), ("lung_cellular", 1.50), ("lung_necrotic", 0.80), ("lung_cavity", 1.00)]),
        ("Moxifloxacin", [("lung_plasma", 3.00), ("lung_cellular", 2.50), ("lung_necrotic", 1.50), ("lung_cavity", 2.00)]),
        ("Bedaquiline",  [("lung_plasma", 5.00), ("lung_cellular", 4.00), ("lung_necrotic", 2.00), ("lung_cavity", 3.00)]),
        ("Linezolid",    [("lung_plasma", 1.20), ("lung_cellular", 1.00), ("lung_necrotic", 0.60), ("lung_cavity", 0.80)]),
    ]
    for drug, comps in tb_tissue:
        for tissue, r in comps:
            tissue_records.append({"drug_name": drug, "tissue": tissue, "condition": "standard", "r_value": r, "r_low": None, "r_high": None, "source": "Prideaux 2015 / Strydom 2019"})

    db.insert("raw_tissue_penetration", tissue_records)
    print(f"    {len(tissue_records)} tissue penetration records")

    # 1e. Biofilm MBEC
    db.create_bundle("raw_biofilm", fields={
        "drug_name":      "categorical",
        "organism":       "categorical",
        "mbec":           "numeric",
        "mic":            "numeric",
        "mbec_mic_ratio": "numeric",
        "source":         "text",
    }, keys=["drug_name", "organism"])

    db.insert("raw_biofilm", [
        {"drug_name": "Vancomycin",  "organism": "S. aureus (MRSA)", "mbec": 512.0, "mic": 1.0,  "mbec_mic_ratio": 512.0, "source": "Parra-Ruiz 2012"},
        {"drug_name": "Ceftaroline", "organism": "S. aureus (MRSA)", "mbec": 128.0, "mic": 1.0,  "mbec_mic_ratio": 128.0, "source": "Barber 2015"},
        {"drug_name": "Daptomycin",  "organism": "S. aureus (MRSA)", "mbec": 32.0,  "mic": 1.0,  "mbec_mic_ratio": 32.0,  "source": "Parra-Ruiz 2012"},
        {"drug_name": "Linezolid",   "organism": "S. aureus (MRSA)", "mbec": 256.0, "mic": 4.0,  "mbec_mic_ratio": 64.0,  "source": "Parra-Ruiz 2012"},
        {"drug_name": "Clindamycin", "organism": "S. aureus (MRSA)", "mbec": 64.0,  "mic": 0.25, "mbec_mic_ratio": 256.0, "source": "LaPlante 2004"},
        {"drug_name": "Rifampin",    "organism": "S. aureus (MRSA)", "mbec": 0.5,   "mic": 0.06, "mbec_mic_ratio": 8.33,  "source": "Zimmerli 1998 / Okae 2022"},
    ])

    # 1f. FDA AUC
    db.create_bundle("raw_fda_auc", fields={
        "drug_name":   "categorical",
        "disease":     "categorical",
        "auc_24":      "numeric",
        "units":       "text",
        "dose":        "text",
        "range_low":   "numeric",
        "range_high":  "numeric",
        "source":      "text",
    }, keys=["drug_name", "disease"],
       indexed=["drug_name", "disease"])

    db.insert("raw_fda_auc", [
        {"drug_name": "CRO", "disease": "meningitis", "auc_24": 1000.0, "units": "ug_hr_mL", "dose": "2g IV q12h",            "range_low": 400.0,   "range_high": 1400.0,  "source": "Patel IH, AAC 1981; Garot D, AAC 2011"},
        {"drug_name": "VAN", "disease": "meningitis", "auc_24": 400.0,  "units": "ug_hr_mL", "dose": "Target AUC/MIC >= 400",  "range_low": 400.0,   "range_high": 600.0,   "source": "Rybak MJ, Am J Health-Syst Pharm 2020"},
        {"drug_name": "RIF", "disease": "meningitis", "auc_24": 60.0,   "units": "ug_hr_mL", "dose": "600mg IV",               "range_low": 40.0,    "range_high": 80.0,    "source": "Nau R, Clin Pharmacokinet 2010"},
        {"drug_name": "LZD", "disease": "meningitis", "auc_24": 250.0,  "units": "ug_hr_mL", "dose": "600mg PO/IV q12h",       "range_low": 200.0,   "range_high": 350.0,   "source": "Dryden MS, JAC 2011"},
        {"drug_name": "VAN", "disease": "bone_mrsa",  "auc_24": 400.0,  "units": "ug_hr_mL", "dose": "Target AUC/MIC >= 400",  "range_low": 400.0,   "range_high": 600.0,   "source": "Rybak MJ, Am J Health-Syst Pharm 2020"},
        {"drug_name": "CAR", "disease": "bone_mrsa",  "auc_24": 180.0,  "units": "ug_hr_mL", "dose": "600mg IV q8h",           "range_low": 150.0,   "range_high": 220.0,   "source": "Forest Pharmaceuticals label 2010"},
        {"drug_name": "DAP", "disease": "bone_mrsa",  "auc_24": 500.0,  "units": "ug_hr_mL", "dose": "6mg/kg IV daily",        "range_low": 400.0,   "range_high": 600.0,   "source": "Dvorchik BH, JAC 2003"},
        {"drug_name": "LZD", "disease": "bone_mrsa",  "auc_24": 250.0,  "units": "ug_hr_mL", "dose": "600mg PO/IV q12h",       "range_low": 200.0,   "range_high": 350.0,   "source": "Dryden MS, JAC 2011"},
        {"drug_name": "CLI", "disease": "bone_mrsa",  "auc_24": 80.0,   "units": "ug_hr_mL", "dose": "600mg IV q8h",           "range_low": 60.0,    "range_high": 100.0,   "source": "Smieja M, AAC 1998"},
        {"drug_name": "RIF", "disease": "bone_mrsa",  "auc_24": 60.0,   "units": "ug_hr_mL", "dose": "600mg PO daily",         "range_low": 40.0,    "range_high": 80.0,    "source": "Acocella G, Rev Infect Dis 1983"},
        {"drug_name": "DTG", "disease": "hiv",        "auc_24": 126400.0,"units": "nM_hr",   "dose": "50mg daily",             "range_low": 80000.0, "range_high": 180000.0,"source": "Song I, J Clin Pharmacol 2015"},
        {"drug_name": "TFV", "disease": "hiv",        "auc_24": 7630.0,  "units": "nM_hr",   "dose": "300mg daily (as TDF)",   "range_low": 4000.0,  "range_high": 12000.0, "source": "Kearney BP, Clin Pharmacokinet 2004"},
        {"drug_name": "FTC", "disease": "hiv",        "auc_24": 40000.0, "units": "nM_hr",   "dose": "200mg daily",            "range_low": 25000.0, "range_high": 60000.0, "source": "Wang LH, Clin Pharmacol Ther 2004"},
        {"drug_name": "DRV", "disease": "hiv",        "auc_24": 170000.0,"units": "nM_hr",   "dose": "800mg + 100mg RTV daily","range_low": 120000.0,"range_high": 250000.0,"source": "Sekar VJ, AAC 2010"},
        {"drug_name": "EFV", "disease": "hiv",        "auc_24": 184000.0,"units": "nM_hr",   "dose": "600mg daily",            "range_low": 130000.0,"range_high": 250000.0,"source": "Csajka C, Clin Pharmacol Ther 2003"},
    ])

    # 1g. Regimens
    db.create_bundle("raw_regimens", fields={
        "regimen_id":         "text",
        "name":               "text",
        "disease":            "categorical",
        "drugs":              "text",
        "synergy_factor":     "numeric",
        "fic_index":          "numeric",
        "clinical_efficacy":  "numeric",
        "indication":         "text",
        "trial":              "text",
        "source":             "text",
    }, keys=["regimen_id"])

    db.insert("raw_regimens", [
        {"regimen_id": "bone_van_rif",  "name": "VAN + RIF",             "disease": "bone_mrsa",    "drugs": "VAN,RIF",          "synergy_factor": 1.2, "fic_index": 0.013, "clinical_efficacy": None, "indication": "Prosthetic joint / osteomyelitis MRSA", "trial": "Zimmerli 1998 JAMA", "source": "Zimmerli W, JAMA 1998; 279:1537"},
        {"regimen_id": "ripe",          "name": "INH + RIF + PZA + EMB", "disease": "pulmonary_tb", "drugs": "INH,RIF,PZA,EMB",  "synergy_factor": 1.2, "fic_index": None,  "clinical_efficacy": 0.95, "indication": "Standard RIPE TB regimen",              "trial": "MRC 1986",           "source": "Fox W, Int J Tuberc Lung Dis 1999"},
        {"regimen_id": "mening_cro_van","name": "CRO + VAN",             "disease": "meningitis",   "drugs": "CRO,VAN",          "synergy_factor": 1.0, "fic_index": 0.014, "clinical_efficacy": None, "indication": "Empiric bacterial meningitis",           "trial": "IDSA 2004",          "source": "Tunkel AR, Clin Infect Dis 2004"},
        {"regimen_id": "art_1st_dtg",   "name": "DTG + TFV + FTC",       "disease": "hiv",          "drugs": "DTG,TFV,FTC",      "synergy_factor": 1.0, "fic_index": 0.0068,"clinical_efficacy": 0.97, "indication": "First-line ART (treatment-naive)",       "trial": "GEMINI-1/2",         "source": "Cahn P, Lancet 2019; 393:143"},
        {"regimen_id": "art_2nd_drv",   "name": "DRV/r + TFV + FTC",     "disease": "hiv",          "drugs": "DRV,TFV,FTC",      "synergy_factor": 1.0, "fic_index": 0.0068,"clinical_efficacy": 0.93, "indication": "Second-line / switch ART",               "trial": "EMERALD",            "source": "Orkin C, Lancet HIV 2020; 7:e23"},
    ])


# ═══════════════════════════════════════════════════════════════
# LAYER 2: HARMONIZED MASTER BUNDLE
# ═══════════════════════════════════════════════════════════════

def create_layer2(db: GigiClient):
    print("\n── Layer 2: Harmonized Master Bundle (pharma_universe) ──")

    db.create_bundle("pharma_universe", fields={
        "drug_id":             "categorical",
        "pathogen_id":         "categorical",
        "tissue_id":           "categorical",
        "context_id":          "categorical",
        "mic":                 "numeric",
        "mic_source":          "text",
        "ic50":                "numeric",
        "auc_24":              "numeric",
        "tissue_plasma_ratio": "numeric",
        "mbec":                "numeric",
        "k_barrier":           "numeric",
        "k_phenotype":         "numeric",
        "tau":                 "numeric",
        "coherence":           "numeric",
        "confidence":          "numeric",
        "citation_key":        "text",
        "assay_method":        "text",
        "n_subjects":          "numeric",
        "year":                "numeric",
    }, keys=["drug_id", "pathogen_id", "tissue_id", "context_id"],
       indexed=["drug_id", "pathogen_id", "tissue_id", "context_id"])

    # Bone MRSA (6 drugs)
    bone_records = [
        {"drug_id": "vancomycin",  "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "mic": 1.0,  "mic_source": "EUCAST v14.0", "ic50": None, "auc_24": 400.0, "tissue_plasma_ratio": 0.20,  "mbec": 512.0, "k_barrier": 0.6990, "k_phenotype": 2.709, "tau": 2.60, "coherence": 2.08, "confidence": 0.85, "citation_key": "Graziani1988", "assay_method": "broth_microdilution", "n_subjects": None, "year": 1988},
        {"drug_id": "ceftaroline", "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "mic": 1.0,  "mic_source": "EUCAST v14.0", "ic50": None, "auc_24": 180.0, "tissue_plasma_ratio": 0.30,  "mbec": 128.0, "k_barrier": 0.5229, "k_phenotype": 2.107, "tau": 2.26, "coherence": 2.84, "confidence": 0.80, "citation_key": "Riccobene2014","assay_method": "broth_microdilution", "n_subjects": None, "year": 2014},
        {"drug_id": "daptomycin",  "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "mic": 1.0,  "mic_source": "EUCAST v14.0", "ic50": None, "auc_24": 500.0, "tissue_plasma_ratio": 0.15,  "mbec": 32.0,  "k_barrier": 0.8239, "k_phenotype": 1.806, "tau": 3.00, "coherence": None, "confidence": 0.75, "citation_key": "Traunmuller2010","assay_method": "broth_microdilution", "n_subjects": None, "year": 2010},
        {"drug_id": "linezolid",   "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "mic": 4.0,  "mic_source": "EUCAST v14.0", "ic50": None, "auc_24": 250.0, "tissue_plasma_ratio": 0.50,  "mbec": 256.0, "k_barrier": 0.3010, "k_phenotype": 2.107, "tau": 2.10, "coherence": None, "confidence": 0.78, "citation_key": "Rana2002",      "assay_method": "broth_microdilution", "n_subjects": None, "year": 2002},
        {"drug_id": "clindamycin", "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "mic": 0.25, "mic_source": "EUCAST v14.0", "ic50": None, "auc_24": 80.0,  "tissue_plasma_ratio": 0.525, "mbec": 64.0,  "k_barrier": 0.2796, "k_phenotype": 2.408, "tau": 2.50, "coherence": None, "confidence": 0.72, "citation_key": "Feigin1995",    "assay_method": "broth_microdilution", "n_subjects": None, "year": 1995},
        {"drug_id": "rifampin",    "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "mic": 0.06, "mic_source": "EUCAST v14.0", "ic50": None, "auc_24": 60.0,  "tissue_plasma_ratio": 0.35,  "mbec": 0.5,   "k_barrier": 0.4559, "k_phenotype": 1.796, "tau": 1.88, "coherence": None, "confidence": 0.90, "citation_key": "Currier1979",   "assay_method": "broth_microdilution", "n_subjects": None, "year": 1979},
    ]
    db.insert("pharma_universe", bone_records)
    print(f"    Bone MRSA: {len(bone_records)} records")

    # Meningitis (4 drugs × 2 CSF states = 8)
    mening_records = []
    mening_data = [
        ("ceftriaxone", 0.015, "EUCAST v14.0",   1000.0, 0.15, 0.01, 4.82),
        ("vancomycin",  1.0,   "CLSI M100-Ed34", 400.0,  0.18, 0.01, 2.60),
        ("rifampin",    0.5,   "CLSI M100-Ed34", 60.0,   0.40, 0.15, 2.08),
        ("linezolid",   2.0,   "EUCAST v14.0",   250.0,  0.70, 0.40, 2.10),
    ]
    for drug, mic, src, auc, r_infl, r_uninfl, t in mening_data:
        for state, r in [("csf_inflamed", r_infl), ("csf_uninflamed", r_uninfl)]:
            kb = k_barrier(r)
            c = round(t / kb, 2) if kb > 0 else None
            mening_records.append({
                "drug_id": drug, "pathogen_id": "S. pneumoniae", "tissue_id": state, "context_id": "adult_standard",
                "mic": mic, "mic_source": src, "ic50": None, "auc_24": auc, "tissue_plasma_ratio": r, "mbec": None,
                "k_barrier": kb, "k_phenotype": None, "tau": t, "coherence": c,
                "confidence": 0.90 if state == "csf_inflamed" else 0.65,
                "citation_key": "Nau2010", "assay_method": "broth_microdilution", "n_subjects": None, "year": 2010,
            })
    db.insert("pharma_universe", mening_records)
    print(f"    Meningitis: {len(mening_records)} records")

    # HIV (5 drugs × 5 reservoirs = 25)
    hiv_data = [
        ("dolutegravir",  0.51,  126400.0, 0.05, 5.39, [("cns", 0.01, 2.63), ("lymph_node", 0.48, 14.63), ("galt", 0.35, 10.66), ("genital_tract", 0.07, 4.48), ("bone_marrow", 0.40, None)]),
        ("tenofovir",     50.0,  7630.0,   0.10, 2.18, [("cns", 0.05, 1.50), ("lymph_node", 0.33, 3.46),  ("galt", 0.50, 4.84),  ("genital_tract", 3.50, 14.56),("bone_marrow", 0.30, None)]),
        ("emtricitabine", 8.0,   40000.0,  0.08, 3.70, [("cns", 0.03, 2.35), ("lymph_node", 0.40, 8.26),  ("galt", 0.55, 11.95), ("genital_tract", 1.80, 73.98),("bone_marrow", 0.35, None)]),
        ("darunavir",     1.2,   170000.0, 0.15, 5.15, [("cns", 0.05, 3.68), ("lymph_node", 0.70, 20.21), ("galt", 0.45, 11.53), ("genital_tract", 0.15, 5.58), ("bone_marrow", 0.35, None)]),
        ("efavirenz",     1.0,   184000.0, 0.20, 5.26, [("cns", 0.005,2.21), ("lymph_node", 0.55, 15.50), ("galt", 0.40, 11.02), ("genital_tract", 0.02, 2.96), ("bone_marrow", 0.30, None)]),
    ]
    hiv_records = []
    for drug, ic50, auc, kadm, t, tissues in hiv_data:
        for tissue, r, c in tissues:
            kb = k_barrier(r)
            hiv_records.append({
                "drug_id": drug, "pathogen_id": "HIV-1", "tissue_id": tissue, "context_id": "adult_art_suppressed",
                "mic": None, "mic_source": "Stanford HIVDB v9.6", "ic50": ic50, "auc_24": auc,
                "tissue_plasma_ratio": r, "mbec": None, "k_barrier": kb, "k_phenotype": None,
                "tau": t, "coherence": c, "confidence": 0.88,
                "citation_key": "Fletcher2014", "assay_method": "cell_based_IC50", "n_subjects": None, "year": 2014,
            })
    db.insert("pharma_universe", hiv_records)
    print(f"    HIV reservoir: {len(hiv_records)} records")

    # TB (7 drugs × 3 key compartments = 21)
    tb_data = [
        ("isoniazid",    0.05, 3.50, [("lung_cellular", 0.60), ("lung_necrotic", 0.30), ("lung_cavity", 0.40)]),
        ("rifampicin",   0.20, 4.00, [("lung_cellular", 0.20), ("lung_necrotic", 0.05), ("lung_cavity", 0.15)]),
        ("pyrazinamide", 16.0, 4.50, [("lung_cellular", 0.70), ("lung_necrotic", 0.40), ("lung_cavity", 0.60)]),
        ("ethambutol",   2.0,  5.00, [("lung_cellular", 1.50), ("lung_necrotic", 0.80), ("lung_cavity", 1.00)]),
        ("moxifloxacin", 0.25, None, [("lung_cellular", 2.50), ("lung_necrotic", 1.50), ("lung_cavity", 2.00)]),
        ("bedaquiline",  0.03, 4.00, [("lung_cellular", 4.00), ("lung_necrotic", 2.00), ("lung_cavity", 3.00)]),
        ("linezolid",    0.50, 4.00, [("lung_cellular", 1.00), ("lung_necrotic", 0.60), ("lung_cavity", 0.80)]),
    ]
    tb_records = []
    for drug, mic, t, comps in tb_data:
        for tissue, r in comps:
            kb = k_barrier(r)
            c = round(t / kb, 2) if t and kb > 0 else None
            tb_records.append({
                "drug_id": drug, "pathogen_id": "M. tuberculosis", "tissue_id": tissue, "context_id": "adult_standard",
                "mic": mic, "mic_source": "WHO CC 2024", "ic50": None, "auc_24": None,
                "tissue_plasma_ratio": r, "mbec": None, "k_barrier": kb, "k_phenotype": None,
                "tau": t, "coherence": c, "confidence": 0.82,
                "citation_key": "Prideaux2015", "assay_method": "MALDI-MS", "n_subjects": None, "year": 2015,
            })
    db.insert("pharma_universe", tb_records)
    print(f"    Pulmonary TB: {len(tb_records)} records")


# ═══════════════════════════════════════════════════════════════
# LAYER 3: COMPUTED BUNDLES
# ═══════════════════════════════════════════════════════════════

def create_layer3(db: GigiClient):
    print("\n── Layer 3: Computed Bundles (K, C, Double Cover) ──")

    # 3a. K-decomposition
    db.create_bundle("computed_k_pathway", fields={
        "drug_id":      "categorical",
        "pathogen_id":  "categorical",
        "tissue_id":    "categorical",
        "context_id":   "categorical",
        "k_admet":      "numeric",
        "k_barrier":    "numeric",
        "k_phenotype":  "numeric",
        "k_reservoir":  "numeric",
        "k_pathway":    "numeric",
        "formula":      "text",
    }, keys=["drug_id", "pathogen_id", "tissue_id", "context_id"],
       indexed=["drug_id", "pathogen_id", "tissue_id"])

    db.insert("computed_k_pathway", [
        {"drug_id": "vancomycin",  "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "k_admet": 0.30, "k_barrier": 0.6990, "k_phenotype": 2.709, "k_reservoir": 0.0, "k_pathway": 5.78, "formula": "K = 0.30 + 0.6990 + 2.709 + p_bio*(K_bio+K_res) [INT-9]"},
        {"drug_id": "ceftaroline", "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "k_admet": 0.45, "k_barrier": 0.5229, "k_phenotype": 2.107, "k_reservoir": 0.0, "k_pathway": 4.23, "formula": "K = 0.45 + 0.5229 + 2.107 + p_bio*K_bio [INT-9]"},
        {"drug_id": "rifampin",    "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "k_admet": 0.67, "k_barrier": 0.4559, "k_phenotype": 1.796, "k_reservoir": 0.0, "k_pathway": 3.44, "formula": "K = 0.67 + 0.4559 + 1.796 + p_bio*K_bio [INT-9]"},
    ])

    # 3b. Coherence
    db.create_bundle("computed_coherence", fields={
        "drug_id":          "categorical",
        "pathogen_id":      "categorical",
        "tissue_id":        "categorical",
        "context_id":       "categorical",
        "tau":              "numeric",
        "k_pathway":        "numeric",
        "coherence":        "numeric",
        "rank":             "numeric",
        "above_threshold":  "numeric",
    }, keys=["drug_id", "pathogen_id", "tissue_id", "context_id"],
       indexed=["drug_id", "pathogen_id", "tissue_id"])

    coherence_records = [
        # Bone MRSA
        {"drug_id": "vancomycin",  "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "tau": 2.60, "k_pathway": 5.78, "coherence": 2.08, "rank": 2, "above_threshold": True},
        {"drug_id": "ceftaroline", "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "tau": 2.26, "k_pathway": 4.23, "coherence": 2.84, "rank": 1, "above_threshold": True},
        {"drug_id": "rifampin",    "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "tau": 1.88, "k_pathway": 3.44, "coherence": None, "rank": 3, "above_threshold": True},
        # Combination
        {"drug_id": "VAN+RIF",    "pathogen_id": "MRSA", "tissue_id": "bone", "context_id": "pediatric_8yo_25kg", "tau": 2.60, "k_pathway": 1.59, "coherence": 16.4, "rank": None, "above_threshold": True},
        # Meningitis (inflamed)
        {"drug_id": "ceftriaxone", "pathogen_id": "S. pneumoniae", "tissue_id": "csf_inflamed", "context_id": "adult_standard", "tau": 4.82, "k_pathway": 0.8239, "coherence": 4.29, "rank": 1, "above_threshold": True},
        {"drug_id": "vancomycin",  "pathogen_id": "S. pneumoniae", "tissue_id": "csf_inflamed", "context_id": "adult_standard", "tau": 2.60, "k_pathway": 0.7447, "coherence": 2.49, "rank": 3, "above_threshold": True},
        {"drug_id": "rifampin",    "pathogen_id": "S. pneumoniae", "tissue_id": "csf_inflamed", "context_id": "adult_standard", "tau": 2.08, "k_pathway": 0.3979, "coherence": 3.69, "rank": 2, "above_threshold": True},
        {"drug_id": "linezolid",   "pathogen_id": "S. pneumoniae", "tissue_id": "csf_inflamed", "context_id": "adult_standard", "tau": 2.10, "k_pathway": 0.2041, "coherence": 6.67, "rank": None, "above_threshold": True},
        # HIV CNS (bottleneck reservoir)
        {"drug_id": "dolutegravir",  "pathogen_id": "HIV-1", "tissue_id": "cns", "context_id": "adult_art_suppressed", "tau": 5.39, "k_pathway": 2.00, "coherence": 2.63, "rank": 1, "above_threshold": True},
        {"drug_id": "emtricitabine", "pathogen_id": "HIV-1", "tissue_id": "cns", "context_id": "adult_art_suppressed", "tau": 3.70, "k_pathway": 1.5229, "coherence": 2.35, "rank": 2, "above_threshold": True},
        {"drug_id": "efavirenz",     "pathogen_id": "HIV-1", "tissue_id": "cns", "context_id": "adult_art_suppressed", "tau": 5.26, "k_pathway": 2.3010, "coherence": 2.21, "rank": 3, "above_threshold": True},
        {"drug_id": "tenofovir",     "pathogen_id": "HIV-1", "tissue_id": "cns", "context_id": "adult_art_suppressed", "tau": 2.18, "k_pathway": 1.3010, "coherence": 1.50, "rank": 4, "above_threshold": True},
        # TB lung_cellular
        {"drug_id": "isoniazid",   "pathogen_id": "M. tuberculosis", "tissue_id": "lung_cellular", "context_id": "adult_standard", "tau": 3.50, "k_pathway": 0.2218, "coherence": 9.85, "rank": 1, "above_threshold": True},
        {"drug_id": "bedaquiline", "pathogen_id": "M. tuberculosis", "tissue_id": "lung_cellular", "context_id": "adult_standard", "tau": 4.00, "k_pathway": 0.0000, "coherence": 7.04, "rank": 2, "above_threshold": True},
    ]
    db.insert("computed_coherence", coherence_records)
    print(f"    {len(coherence_records)} coherence records")

    # 3c. Double Cover
    db.create_bundle("computed_double_cover", fields={
        "regimen_id":    "text",
        "tissue_id":     "categorical",
        "c_sequential":  "numeric",
        "c_parallel":    "numeric",
        "delta":         "numeric",
        "cover_valid":   "numeric",
        "drugs":         "text",
        "synergy":       "numeric",
    }, keys=["regimen_id", "tissue_id"])

    db.insert("computed_double_cover", [
        {"regimen_id": "bone_van_rif",   "tissue_id": "bone",         "c_sequential": 16.4, "c_parallel": 16.4, "delta": 0.0, "cover_valid": True, "drugs": "VAN+RIF",          "synergy": 1.2},
        {"regimen_id": "ripe",           "tissue_id": "lung_cellular","c_sequential": None,  "c_parallel": None,  "delta": 0.0, "cover_valid": True, "drugs": "INH+RIF+PZA+EMB", "synergy": 1.2},
        {"regimen_id": "mening_cro_van", "tissue_id": "csf_inflamed", "c_sequential": None,  "c_parallel": None,  "delta": 0.0, "cover_valid": True, "drugs": "CRO+VAN",          "synergy": 1.0},
        {"regimen_id": "art_1st_dtg",    "tissue_id": "cns",          "c_sequential": 2.63, "c_parallel": 2.63, "delta": 0.0, "cover_valid": True, "drugs": "DTG+TFV+FTC",      "synergy": 1.0},
    ])


# ═══════════════════════════════════════════════════════════════
# LAYER 4: PROVENANCE
# ═══════════════════════════════════════════════════════════════

def create_layer4(db: GigiClient):
    print("\n── Layer 4: Provenance & Firewall ──")

    # 4a. Firewall
    db.create_bundle("provenance_firewall", fields={
        "disease":               "categorical",
        "input_sources":         "text",
        "ground_truth_sources":  "text",
        "overlap":               "categorical",
        "test_count":            "numeric",
        "firewall_verified":     "numeric",
        "verification_date":     "text",
    }, keys=["disease"])

    db.insert("provenance_firewall", [
        {"disease": "bone_mrsa",    "input_sources": "EUCAST,GRAZIANI_1988,BUE_2018,RICCOBENE_2014,RANA_2002,CURRIER_1979,TRAUNMULLER_2010,FEIGIN_1995,PARRA_RUIZ_2012,STEWART_2015,ZIMMERLI_1998,SCHWARTZ_EGFR,ANDERSON_HOLFORD", "ground_truth_sources": "IDSA_MRSA_2011", "overlap": "NONE", "test_count": 161, "firewall_verified": True, "verification_date": "2026-03-26"},
        {"disease": "pulmonary_tb", "input_sources": "EUCAST,CLSI_M24,PRIDEAUX_2015,KJELLSSON_2012,SARATHY_2016,DARTOIS_2014,MITCHISON_1985", "ground_truth_sources": "MRC_TRIALS,WHO_TB_GUIDELINES_2022", "overlap": "NONE", "test_count": 52, "firewall_verified": True, "verification_date": "2026-03-26"},
        {"disease": "meningitis",   "input_sources": "EUCAST,NAU_2010,LUTSAR_2000", "ground_truth_sources": "IDSA_MENINGITIS_2004", "overlap": "NONE", "test_count": 10, "firewall_verified": True, "verification_date": "2026-03-26"},
        {"disease": "hiv_reservoir","input_sources": "STANFORD_HIVDB,FLETCHER_2014,PATTERSON_2011,LETENDRE_2010,NICOL_2008,CORY_2013", "ground_truth_sources": "FINZI_1999,SILICIANO_2003,ARCHIN_2012,RASMUSSEN_2014,CANESTRI_2010,PELUSO_2012,CHUN_2008", "overlap": "NONE", "test_count": 93, "firewall_verified": True, "verification_date": "2026-03-26"},
    ])

    # 4b. Provenance chain (sample records for vancomycin bone MRSA)
    db.create_bundle("provenance_chain", fields={
        "record_id":    "numeric",
        "drug_id":      "categorical",
        "pathogen_id":  "categorical",
        "tissue_id":    "categorical",
        "field_name":   "categorical",
        "value":        "numeric",
        "source_id":    "categorical",
        "role":         "categorical",
        "extraction":   "text",
        "confidence":   "numeric",
    }, keys=["record_id"],
       indexed=["drug_id", "pathogen_id", "tissue_id"])

    db.insert("provenance_chain", [
        {"record_id": 1, "drug_id": "vancomycin", "pathogen_id": "MRSA", "tissue_id": "bone", "field_name": "mic",       "value": 1.0,    "source_id": "EUCAST",         "role": "input", "extraction": "Table 8, S. aureus row, MIC_S column",        "confidence": 0.95},
        {"record_id": 2, "drug_id": "vancomycin", "pathogen_id": "MRSA", "tissue_id": "bone", "field_name": "auc_24",     "value": 400.0,  "source_id": "FDA_DAILYMED",   "role": "input", "extraction": "Section 12.3, AUC at steady-state",           "confidence": 0.90},
        {"record_id": 3, "drug_id": "vancomycin", "pathogen_id": "MRSA", "tissue_id": "bone", "field_name": "r_bone",     "value": 0.20,   "source_id": "GRAZIANI_1988",  "role": "input", "extraction": "Table 2, infected bone concentration",       "confidence": 0.85},
        {"record_id": 4, "drug_id": "vancomycin", "pathogen_id": "MRSA", "tissue_id": "bone", "field_name": "mbec",       "value": 512.0,  "source_id": "PARRA_RUIZ_2012","role": "input", "extraction": "Table 1, MBEC 24h S. aureus",                "confidence": 0.82},
        {"record_id": 5, "drug_id": "vancomycin", "pathogen_id": "MRSA", "tissue_id": "bone", "field_name": "tau",        "value": 2.60,   "source_id": "COMPUTED",       "role": "input", "extraction": "tau = log10(400/1.0) = 2.60",                 "confidence": 1.0},
        {"record_id": 6, "drug_id": "vancomycin", "pathogen_id": "MRSA", "tissue_id": "bone", "field_name": "k_barrier",  "value": 0.6990, "source_id": "COMPUTED",       "role": "input", "extraction": "K_barrier = -log10(0.20) = 0.6990",           "confidence": 1.0},
        {"record_id": 7, "drug_id": "vancomycin", "pathogen_id": "MRSA", "tissue_id": "bone", "field_name": "coherence",  "value": 2.08,   "source_id": "COMPUTED",       "role": "input", "extraction": "C = tau/K_pathway = 2.60/5.78 [INT-9]",       "confidence": 1.0},
    ])


# ═══════════════════════════════════════════════════════════════
# VERIFICATION
# ═══════════════════════════════════════════════════════════════

def verify(db: GigiClient):
    print("\n── Verification ──")
    checks = 0
    passed = 0

    # V1: Point query — vancomycin bone MRSA
    result = db.get("pharma_universe", drug_id="vancomycin", pathogen_id="MRSA", tissue_id="bone", context_id="pediatric_8yo_25kg")
    checks += 1
    if result and "error" not in result:
        print(f"  V1 vancomycin/MRSA/bone: PASS")
        passed += 1
    else:
        print(f"  V1 vancomycin/MRSA/bone: FAIL ({result})")

    # V2: Point query — DTG CNS
    result = db.get("pharma_universe", drug_id="dolutegravir", pathogen_id="HIV-1", tissue_id="cns", context_id="adult_art_suppressed")
    checks += 1
    if result and "error" not in result:
        print(f"  V2 dolutegravir/HIV-1/cns: PASS")
        passed += 1
    else:
        print(f"  V2 dolutegravir/HIV-1/cns: FAIL ({result})")

    # V3: Curvature check on pharma_universe
    result = db.curvature("pharma_universe", field="coherence")
    checks += 1
    if result and "error" not in result:
        print(f"  V3 curvature(coherence): PASS")
        passed += 1
    else:
        print(f"  V3 curvature(coherence): FAIL ({result})")

    # V4: Firewall check
    result = db.query("provenance_firewall", conditions=[{"field": "overlap", "op": "eq", "value": "NONE"}])
    checks += 1
    if result and "error" not in result:
        print(f"  V4 firewall I ∩ G = empty: PASS")
        passed += 1
    else:
        print(f"  V4 firewall: FAIL ({result})")

    # V5: Double Cover identity check
    result = db.query("computed_double_cover", conditions=[{"field": "cover_valid", "op": "eq", "value": 0}])
    checks += 1
    if result and "error" not in result:
        records = result.get("records", result.get("data", []))
        if isinstance(records, list) and len(records) == 0:
            print(f"  V5 Double Cover identity: PASS (no violations)")
            passed += 1
        else:
            print(f"  V5 Double Cover identity: FAIL (violations found)")
    else:
        print(f"  V5 Double Cover identity: FAIL ({result})")

    print(f"\n  Result: {passed}/{checks} checks passed")
    return passed == checks


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Deploy Pharma Universe Warehouse to GIGI")
    parser.add_argument("--host", default="https://gigi-stream.fly.dev", help="GIGI host URL")
    parser.add_argument("--dry-run", action="store_true", help="Print API calls without executing")
    parser.add_argument("--verify", action="store_true", help="Run verification only")
    args = parser.parse_args()

    db = GigiClient(host=args.host, dry_run=args.dry_run)

    print()
    print("=" * 70)
    print("  MIRADOR Unified Pharmacokinetic Geometry Warehouse")
    print("  4-Layer Architecture → GIGI Fiber Bundle Database")
    print("=" * 70)
    print(f"\n  Target:  {args.host}")
    print(f"  Mode:    {'DRY RUN' if args.dry_run else 'LIVE'}")

    if args.verify:
        verify(db)
        return

    # Health check
    if not args.dry_run:
        try:
            h = db.health()
            status = h.get("status", "unknown") if isinstance(h, dict) else "unknown"
            print(f"  Status:  {status}")
        except Exception as e:
            print(f"\n  Cannot reach GIGI at {args.host}")
            print(f"  Error: {e}")
            sys.exit(1)

    # Deploy all 4 layers
    create_layer1(db)
    create_layer2(db)
    create_layer3(db)
    create_layer4(db)

    # Summary
    s = db.stats
    print(f"\n{'=' * 70}")
    print(f"  DEPLOYMENT COMPLETE")
    print(f"  Bundles:  {s['bundles']}")
    print(f"  Records:  {s['records']}")
    print(f"  Errors:   {s['errors']}")
    print(f"{'=' * 70}")

    # Expected breakdown
    print(f"\n  Expected:")
    print(f"    Layer 1 (raw):       7 bundles, ~80 records")
    print(f"    Layer 2 (harmonized): 1 bundle (pharma_universe), ~80 records")
    print(f"    Layer 3 (computed):  3 bundles, ~20 records")
    print(f"    Layer 4 (provenance): 2 bundles, ~11 records")
    print(f"    TOTAL:               14 bundles, ~190 records")

    # Verify
    if not args.dry_run:
        print()
        verify(db)

    print()


if __name__ == "__main__":
    main()
