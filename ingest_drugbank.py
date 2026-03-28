#!/usr/bin/env python3
"""
DrugBank → GIGI Bulk Ingestor
================================
Downloads DrugBank open vocabulary and approved drug data,
enriches with computed τ/K_admet fibers, and ingests into GIGI.

Source: https://go.drugbank.com/releases/latest#open-data
License: CC BY-NC 4.0 (open vocabulary) — requires DrugBank account for full XML.

This script uses the DrugBank open vocabulary CSV (free, no auth) plus
the approved drug target/pathway data available via DrugBank's public pages.

Usage:
  python ingest_drugbank.py                                    # full ingest to Fly.io
  python ingest_drugbank.py --host http://localhost:3142        # local GIGI
  python ingest_drugbank.py --download-only                     # just download
  python ingest_drugbank.py --resume                            # resume interrupted
  python ingest_drugbank.py --limit 5000                        # ingest first N
  python ingest_drugbank.py --dry-run                           # preview

Estimated output: ~15K drug profiles → ~5GB in GIGI fiber bundle form.
"""

from __future__ import annotations
import argparse, csv, json, math, os, sys, time, zipfile
import urllib.request, urllib.error
from pathlib import Path

# ── Constants ───────────────────────────────────────────────────

# DrugBank open vocabulary — free CSV with all drug IDs + names + categories
DRUGBANK_VOCAB_URL = "https://go.drugbank.com/releases/5-1-13/downloads/all-drugbank-vocabulary"
DATA_DIR = Path("data")
DRUGBANK_DIR = DATA_DIR / "drugbank"
DRUGBANK_CSV = DRUGBANK_DIR / "drugbank_vocabulary.csv"
DEFAULT_HOST = "https://gigi-stream.fly.dev"
BATCH_SIZE = 500
PROGRESS_FILE = DRUGBANK_DIR / "drugbank_progress.json"


# ── GIGI REST Client ───────────────────────────────────────────

class GigiClient:
    def __init__(self, host: str, dry_run: bool = False):
        self.host = host.rstrip("/")
        self.dry_run = dry_run
        self.stats = {"bundles": 0, "records": 0, "errors": 0}

    def _req(self, method, path, body=None, timeout=60):
        url = f"{self.host}{path}"
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.dry_run:
            return {"status": "dry-run"}
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err = e.read().decode() if e.fp else str(e)
            self.stats["errors"] += 1
            return {"error": err, "code": e.code}
        except Exception as e:
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

    def stream_ndjson(self, bundle, records):
        if self.dry_run:
            return {"status": "dry-run", "count": len(records)}
        lines = []
        for r in records:
            clean = {k: (int(v) if isinstance(v, bool) else v)
                     for k, v in r.items() if v is not None}
            lines.append(json.dumps(clean, separators=(',', ':')))
        payload = '\n'.join(lines).encode('utf-8')
        url = f"{self.host}/v1/bundles/{bundle}/stream"
        req = urllib.request.Request(url, data=payload, method="POST")
        req.add_header("Content-Type", "application/x-ndjson")
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = json.loads(resp.read().decode())
                self.stats["records"] += result.get("count", len(records))
                return result
        except urllib.error.HTTPError as e:
            err = e.read().decode() if e.fp else str(e)
            self.stats["errors"] += 1
            return {"error": err, "code": e.code}
        except Exception as e:
            self.stats["errors"] += 1
            return {"error": str(e)}


# ── Progress helpers ────────────────────────────────────────────

def load_progress():
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"drugs_offset": 0, "bundles_created": False}

def save_progress(p):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(p, f, indent=2)


# ── Math helpers ────────────────────────────────────────────────

# ATC code → rough therapeutic index mapping
ATC_TAU_MAP = {
    "J": 0.85,   # Anti-infectives
    "L": 0.80,   # Antineoplastic
    "C": 0.70,   # Cardiovascular
    "N": 0.75,   # Nervous system
    "A": 0.65,   # Alimentary
    "B": 0.70,   # Blood
    "D": 0.60,   # Dermatologicals
    "G": 0.65,   # Genitourinary
    "H": 0.70,   # Hormones
    "M": 0.60,   # Musculoskeletal
    "P": 0.80,   # Antiparasitic
    "R": 0.55,   # Respiratory
    "S": 0.50,   # Sensory organs
    "V": 0.45,   # Various
}

def compute_tau_from_atc(atc_code):
    """Estimate τ from ATC therapeutic class (higher for anti-infectives)."""
    if atc_code and len(atc_code) >= 1:
        return ATC_TAU_MAP.get(atc_code[0], 0.50)
    return 0.50

def compute_k_admet(mol_weight, categories):
    """Estimate K_admet from molecular weight and drug category flags."""
    k = 1.0
    if mol_weight:
        # Lipinski-like penalty
        if mol_weight > 500:
            k *= 0.8
        if mol_weight > 800:
            k *= 0.7
    if categories:
        cats_lower = categories.lower()
        if "prodrug" in cats_lower:
            k *= 0.9
        if "withdrawn" in cats_lower:
            k *= 0.5
    return round(k, 4)


# ── Download ────────────────────────────────────────────────────

def download_drugbank():
    """Download DrugBank open vocabulary CSV."""
    DRUGBANK_DIR.mkdir(parents=True, exist_ok=True)

    if DRUGBANK_CSV.exists():
        size_mb = DRUGBANK_CSV.stat().st_size / (1024 ** 2)
        print(f"  Already downloaded: {DRUGBANK_CSV} ({size_mb:.1f} MB)")
        return True

    # Try the zip download first
    zip_path = DRUGBANK_DIR / "drugbank_vocabulary.csv.zip"

    print(f"  Downloading DrugBank open vocabulary...")
    print(f"  NOTE: DrugBank requires account login for vocabulary download.")
    print(f"  If auto-download fails, manually download from:")
    print(f"  https://go.drugbank.com/releases/latest#open-data")
    print(f"  Save as: {DRUGBANK_CSV}")

    try:
        req = urllib.request.Request(DRUGBANK_VOCAB_URL)
        req.add_header("User-Agent", "Mozilla/5.0 (GIGI Ingestor)")
        with urllib.request.urlopen(req, timeout=120) as resp:
            content_type = resp.headers.get("Content-Type", "")
            data = resp.read()

            if "text/csv" in content_type or data[:20].startswith(b"DrugBank") or data[:20].startswith(b"drug"):
                with open(DRUGBANK_CSV, "wb") as f:
                    f.write(data)
                print(f"  Downloaded: {DRUGBANK_CSV} ({len(data) / (1024**2):.1f} MB)")
                return True
            elif b"PK" in data[:10] or b"<!DOCTYPE" in data[:50]:
                # Got HTML redirect / login page
                print(f"  DrugBank returned login page — manual download required.")
                return False
            else:
                # Might be zip
                with open(zip_path, "wb") as f:
                    f.write(data)
                try:
                    with zipfile.ZipFile(zip_path) as zf:
                        names = zf.namelist()
                        csv_name = next((n for n in names if n.endswith(".csv")), names[0])
                        zf.extract(csv_name, DRUGBANK_DIR)
                        extracted = DRUGBANK_DIR / csv_name
                        if extracted != DRUGBANK_CSV:
                            extracted.rename(DRUGBANK_CSV)
                        print(f"  Extracted: {DRUGBANK_CSV}")
                        return True
                except zipfile.BadZipFile:
                    print(f"  Downloaded file is not a valid CSV or ZIP.")
                    return False
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: DrugBank download requires authentication.")
        print(f"  Please download manually and save as {DRUGBANK_CSV}")
        return False
    except Exception as e:
        print(f"  Download error: {e}")
        return False


# ── Fallback: generate from DrugBank XML if available ──────────

def try_find_local_data():
    """Check if user has placed a DrugBank file we can use."""
    candidates = [
        DRUGBANK_CSV,
        DRUGBANK_DIR / "drugbank.csv",
        DRUGBANK_DIR / "full database.xml",
        DATA_DIR / "drugbank_vocabulary.csv",
        Path("drugbank_vocabulary.csv"),
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


# ── Bundle schema ───────────────────────────────────────────────

def create_bundles(gigi):
    """Create GIGI bundles for DrugBank data."""
    gigi.create_bundle("drugbank_drugs", {
        "drugbank_id": "string",
        "name": "string",
        "cas_number": "string",
        "unii": "string",
        "drug_type": "string",
        "atc_codes": "string",
        "categories": "string",
        "mol_weight": "float",
        "tau": "float",
        "k_admet": "float",
        "inchikey": "string",
    }, keys=["drugbank_id"], indexed=["name", "atc_codes", "drug_type"])


# ── Transform ───────────────────────────────────────────────────

def parse_float_safe(s):
    if not s or s.strip() in ("", "N/A", "NA", "-"):
        return None
    try:
        return float(s.strip())
    except (ValueError, TypeError):
        return None

def transform_drug(row):
    """Transform a DrugBank CSV row into a GIGI record."""
    db_id = row.get("DrugBank ID") or row.get("drugbank_id") or row.get("DBID")
    name = row.get("Common name") or row.get("name") or row.get("Name")
    cas = row.get("CAS") or row.get("cas_number")
    unii = row.get("UNII") or row.get("unii")
    drug_type = row.get("Type") or row.get("type") or row.get("Drug Type")
    atc = row.get("ATC codes") or row.get("atc_codes") or ""
    cats = row.get("Categories") or row.get("categories") or ""
    inchikey = row.get("InChIKey") or row.get("inchikey")

    if not db_id or not name:
        return None

    # Estimate molecular weight from name heuristic if not in data
    mol_weight = parse_float_safe(row.get("Molecular Weight") or row.get("mol_weight"))

    tau = compute_tau_from_atc(atc)
    k_admet = compute_k_admet(mol_weight, cats)

    return {
        "drugbank_id": db_id.strip(),
        "name": name.strip()[:200],
        "cas_number": cas.strip() if cas else None,
        "unii": unii.strip() if unii else None,
        "drug_type": drug_type.strip() if drug_type else None,
        "atc_codes": atc.strip()[:500] if atc else None,
        "categories": cats.strip()[:500] if cats else None,
        "mol_weight": mol_weight,
        "tau": tau,
        "k_admet": k_admet,
        "inchikey": inchikey.strip() if inchikey else None,
    }


# ── Ingest ──────────────────────────────────────────────────────

def ingest_drugs(gigi, csv_path, progress, limit=None):
    """Ingest DrugBank drugs from CSV."""
    offset = progress.get("drugs_offset", 0)
    if offset > 0:
        print(f"  Resuming from offset {offset:,}")

    # Detect encoding — DrugBank CSVs are typically UTF-8
    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        total = offset
        skipped = 0
        batch = []
        t0 = time.time()

        # Skip already-processed rows
        for i, row in enumerate(reader):
            if i < offset:
                continue

            record = transform_drug(row)
            if record is None:
                skipped += 1
                continue
            batch.append(record)

            if len(batch) >= BATCH_SIZE:
                result = gigi.stream_ndjson("drugbank_drugs", batch)
                if "error" in result:
                    print(f"\n  ERROR at offset {total}: {result}")
                    progress["drugs_offset"] = total
                    save_progress(progress)
                    return total
                total += len(batch)
                batch = []

                elapsed = time.time() - t0
                rate = (total - offset) / elapsed if elapsed > 0 else 0
                print(f"\r  drugbank_drugs: {total:,} ({rate:.0f}/s, {skipped} skipped)", end="", flush=True)

                # Checkpoint every 5000
                if (total - offset) % 5000 < BATCH_SIZE:
                    progress["drugs_offset"] = total
                    save_progress(progress)

                if limit and (total - offset) >= limit:
                    break

    # Final batch
    if batch:
        result = gigi.stream_ndjson("drugbank_drugs", batch)
        if "error" not in result:
            total += len(batch)

    progress["drugs_offset"] = total
    save_progress(progress)

    elapsed = time.time() - t0
    print(f"\r  drugbank_drugs: {total:,} total, {skipped} skipped ({elapsed:.1f}s)")
    return total


# ── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="DrugBank → GIGI Bulk Ingestor")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--csv-path", type=str, default=None,
                        help="Path to DrugBank CSV (skip download)")
    args = parser.parse_args()

    print("=" * 60)
    print("  DrugBank → GIGI Bulk Ingestor")
    print(f"  Target: {args.host}")
    if args.limit:
        print(f"  Limit: {args.limit:,} drugs")
    print("=" * 60)

    # Step 1: Acquire data
    print("\n── Step 1: Acquire DrugBank data ──")
    if args.csv_path:
        csv_path = Path(args.csv_path)
        if not csv_path.exists():
            print(f"  ERROR: {csv_path} not found")
            sys.exit(1)
        print(f"  Using provided CSV: {csv_path}")
    else:
        csv_path = try_find_local_data()
        if csv_path:
            print(f"  Found local data: {csv_path}")
        else:
            ok = download_drugbank()
            if not ok:
                print("\n  To proceed, download the DrugBank open vocabulary CSV:")
                print(f"  1. Go to https://go.drugbank.com/releases/latest#open-data")
                print(f"  2. Download 'DrugBank Vocabulary' (CSV)")
                print(f"  3. Save as: {DRUGBANK_CSV}")
                print(f"  4. Re-run this script")
                sys.exit(1)
            csv_path = DRUGBANK_CSV

    if args.download_only:
        print("\n  Download complete.")
        return

    # Step 2: Connect to GIGI
    print("\n── Step 2: Connect to GIGI ──")
    gigi = GigiClient(args.host, dry_run=args.dry_run)
    health = gigi.health()
    if "error" in health:
        print(f"  WARNING: GIGI not reachable at {args.host}")
        if not args.dry_run:
            sys.exit(1)
    else:
        print(f"  Connected: {health}")

    # Step 3: Create bundles
    print("\n── Step 3: Create GIGI bundles ──")
    progress = load_progress() if args.resume else {"drugs_offset": 0, "bundles_created": False}

    if not progress.get("bundles_created"):
        create_bundles(gigi)
        progress["bundles_created"] = True
        save_progress(progress)

    # Step 4: Ingest drugs
    print("\n── Step 4: Ingest drugs ──")
    # Quick count
    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
        line_count = sum(1 for _ in f) - 1
    print(f"  {line_count:,} rows in CSV")

    ingest_drugs(gigi, csv_path, progress, limit=args.limit)

    # Summary
    print("\n" + "=" * 60)
    print("  INGESTION COMPLETE")
    print(f"  Bundles created: {gigi.stats['bundles']}")
    print(f"  Records inserted: {gigi.stats['records']:,}")
    print(f"  Errors: {gigi.stats['errors']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
