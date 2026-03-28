#!/usr/bin/env python3
"""
BindingDB → GIGI Bulk Ingestor
================================
Parses BindingDB SDF (or TSV) dump and ingests binding measurements
into GIGI as fiber bundles with computed τ values.

Source: https://www.bindingdb.org/rwd/bind/chemsearch/marvin/SDFdownload.jsp?all_download=yes
License: Creative Commons Attribution-ShareAlike 3.0

Usage:
  python ingest_bindingdb.py                                   # ingest SDF from data/BindingDB_2D/
  python ingest_bindingdb.py --host http://localhost:3142       # local GIGI
  python ingest_bindingdb.py --resume                           # resume interrupted ingest
  python ingest_bindingdb.py --limit 500000                     # ingest first N records
  python ingest_bindingdb.py --dry-run                          # preview without inserting
  python ingest_bindingdb.py --sdf-path data/custom.sdf         # use specific SDF file
  python ingest_bindingdb.py --tsv-path data/custom.tsv         # use TSV instead

Estimated output: ~3.2M binding measurements → ~15-20GB in GIGI fiber bundle form.
"""

from __future__ import annotations
import argparse, csv, json, math, os, sys, time
import urllib.request, urllib.error
from pathlib import Path

# ── Constants ───────────────────────────────────────────────────

DATA_DIR = Path("data")
BINDINGDB_SDF = DATA_DIR / "BindingDB_2D" / "BindingDB_All_2D.sdf"
BINDINGDB_TSV = DATA_DIR / "BindingDB_All.tsv"
DEFAULT_HOST = "https://gigi-stream.fly.dev"
BATCH_SIZE = 500
PROGRESS_FILE = DATA_DIR / "bindingdb_progress.json"


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

    def insert_batch(self, bundle, records):
        clean = []
        for r in records:
            clean.append({k: (int(v) if isinstance(v, bool) else v)
                          for k, v in r.items() if v is not None})
        result = self._req("POST", f"/v1/bundles/{bundle}/insert", {"records": clean})
        if "error" not in result:
            self.stats["records"] += len(clean)
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


# ── Math helpers ────────────────────────────────────────────────

def parse_float(s):
    """Parse a float from a potentially messy string."""
    if not s or s.strip() in ("", "N/A", "NA", "-"):
        return None
    try:
        s = s.strip().replace(",", "")
        # Handle ">10000" or "<0.1" etc
        s = s.lstrip(">< ")
        return float(s)
    except (ValueError, TypeError):
        return None

def compute_pval(nm_value):
    """Convert nM value to p-value (like pIC50 = -log10(M))."""
    if nm_value and nm_value > 0:
        return round(-math.log10(nm_value * 1e-9), 4)
    return None


# ── Download ────────────────────────────────────────────────────

def download_bindingdb():
    """Download BindingDB TSV dump if not present."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    if BINDINGDB_TSV.exists():
        size_mb = BINDINGDB_TSV.stat().st_size / (1024 ** 2)
        print(f"  BindingDB TSV already exists: {BINDINGDB_TSV} ({size_mb:.0f} MB)")
        return BINDINGDB_TSV

    if not BINDINGDB_ZIP.exists():
        print(f"  Downloading BindingDB (~2 GB compressed)...")
        print(f"  URL: {BINDINGDB_URL}")
        req = urllib.request.Request(BINDINGDB_URL)
        with urllib.request.urlopen(req, timeout=600) as resp:
            total = int(resp.headers.get("Content-Length", 0))
            downloaded = 0
            start = time.time()
            with open(BINDINGDB_ZIP, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total > 0:
                        pct = downloaded / total * 100
                        speed = downloaded / (time.time() - start) / (1024 * 1024)
                        print(f"\r  {pct:.1f}% @ {speed:.1f} MB/s", end="", flush=True)
            print()

    print("  Extracting...")
    import zipfile
    with zipfile.ZipFile(BINDINGDB_ZIP, "r") as zf:
        # Find the TSV file inside
        tsv_names = [n for n in zf.namelist() if n.endswith(".tsv")]
        if tsv_names:
            zf.extract(tsv_names[0], path=DATA_DIR)
            extracted = DATA_DIR / tsv_names[0]
            if extracted != BINDINGDB_TSV:
                extracted.rename(BINDINGDB_TSV)
        else:
            print("  ERROR: No TSV found in zip")
            sys.exit(1)

    size_mb = BINDINGDB_TSV.stat().st_size / (1024 ** 2)
    print(f"  Extracted: {BINDINGDB_TSV} ({size_mb:.0f} MB)")
    return BINDINGDB_TSV


def find_data_file():
    """Locate BindingDB data file, preferring SDF over TSV."""
    if BINDINGDB_SDF.exists():
        size_mb = BINDINGDB_SDF.stat().st_size / (1024 ** 2)
        print(f"  Found SDF: {BINDINGDB_SDF} ({size_mb:.0f} MB)")
        return BINDINGDB_SDF, "sdf"
    if BINDINGDB_TSV.exists():
        size_mb = BINDINGDB_TSV.stat().st_size / (1024 ** 2)
        print(f"  Found TSV: {BINDINGDB_TSV} ({size_mb:.0f} MB)")
        return BINDINGDB_TSV, "tsv"
    return None, None


def iter_sdf_records(sdf_path: Path):
    """Streaming SDF parser — yields dicts of {property: value} per record."""
    with open(sdf_path, "r", encoding="utf-8", errors="replace") as f:
        props = {}
        current_prop = None
        for line in f:
            line = line.rstrip("\n")
            if line == "$$$$":
                if props:
                    yield props
                props = {}
                current_prop = None
            elif line.startswith("> <") and line.endswith(">"):
                current_prop = line[3:-1]
            elif current_prop is not None:
                if line == "":
                    current_prop = None
                else:
                    if current_prop in props:
                        props[current_prop] += " " + line
                    else:
                        props[current_prop] = line


# ── Progress tracking ──────────────────────────────────────────

def load_progress():
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"offset": 0}

def save_progress(progress):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f)


# ── Bundle creation ─────────────────────────────────────────────

def create_bundles(db: GigiClient):
    """Create the BindingDB fiber bundles in GIGI."""
    db.create_bundle("bindingdb_binding", fields={
        "bindingdb_id":     "numeric",
        "ligand_name":      "text",
        "target_name":      "text",
        "target_source_org":"categorical",
        "ki_nm":            "numeric",
        "ic50_nm":          "numeric",
        "kd_nm":            "numeric",
        "ec50_nm":          "numeric",
        "pki":              "numeric",
        "pic50":            "numeric",
        "pkd":              "numeric",
        "pec50":            "numeric",
        "tau":              "numeric",
        "potency_class":    "categorical",
        "pH":               "numeric",
        "temp_c":           "numeric",
        "chembl_id":        "categorical",
        "pubmed_id":        "text",
        "doi":              "text",
        "institution":      "text",
        "inchikey":         "text",
        "pubchem_cid":      "text",
    }, keys=["bindingdb_id"],
       indexed=["target_source_org", "potency_class", "chembl_id"])


# ── Column mapping (SDF property names → GIGI fields) ──────────

SDF_MAP = {
    "BindingDB MonomerID": "bindingdb_id",
    "BindingDB Ligand Name": "ligand_name",
    "Target Name": "target_name",
    "Target Source Organism According to Curator or DataSource": "target_source_org",
    "Ki (nM)": "ki_nm",
    "IC50 (nM)": "ic50_nm",
    "Kd (nM)": "kd_nm",
    "EC50 (nM)": "ec50_nm",
    "pH": "pH",
    "Temp C": "temp_c",
    "ChEMBL ID of Ligand": "chembl_id",
    "PMID": "pubmed_id",
    "Article DOI": "doi",
    "Institution": "institution",
    "Ligand InChI Key": "inchikey",
    "PubChem CID of Ligand": "pubchem_cid",
}

# TSV columns (slightly different names)
TSV_MAP = {
    "BindingDB MonomerID": "bindingdb_id",
    "Ligand Name": "ligand_name",
    "Target Name": "target_name",
    "Target Source Organism According to Curator or DataSource": "target_source_org",
    "Ki (nM)": "ki_nm",
    "IC50 (nM)": "ic50_nm",
    "Kd (nM)": "kd_nm",
    "EC50 (nM)": "ec50_nm",
    "pH": "pH",
    "Temp (C)": "temp_c",
    "ChEMBL ID of Ligand": "chembl_id",
    "PMID": "pubmed_id",
    "DOI": "doi",
    "Institution": "institution",
}


def classify_potency(p_value):
    if p_value is None:
        return None
    if p_value >= 8:
        return "potent"
    if p_value >= 6:
        return "moderate"
    return "weak"


def transform_record(raw, col_map):
    """Transform a BindingDB record (SDF or TSV) to GIGI record."""
    record = {}
    for src_col, gigi_col in col_map.items():
        record[gigi_col] = raw.get(src_col, None)

    # Parse numeric fields
    for field in ("ki_nm", "ic50_nm", "kd_nm", "ec50_nm", "pH", "temp_c"):
        record[field] = parse_float(str(record.get(field, "")))

    bid = parse_float(str(record.get("bindingdb_id", "")))
    record["bindingdb_id"] = int(bid) if bid else None

    # Compute p-values
    record["pki"] = compute_pval(record.get("ki_nm"))
    record["pic50"] = compute_pval(record.get("ic50_nm"))
    record["pkd"] = compute_pval(record.get("kd_nm"))
    record["pec50"] = compute_pval(record.get("ec50_nm"))

    # Best τ: prefer Ki > Kd > IC50 > EC50
    best_p = record.get("pki") or record.get("pkd") or record.get("pic50") or record.get("pec50")
    record["tau"] = best_p
    record["potency_class"] = classify_potency(best_p)

    # Skip rows with no binding data at all
    if not any(record.get(f) for f in ("ki_nm", "ic50_nm", "kd_nm", "ec50_nm")):
        return None

    # Truncate long text fields
    for tf in ("ligand_name", "target_name", "institution"):
        v = record.get(tf)
        if isinstance(v, str) and len(v) > 500:
            record[tf] = v[:497] + "..."

    return record


# ── Main ingestion ──────────────────────────────────────────────

def ingest_sdf(db: GigiClient, sdf_path: Path, progress: dict, limit=None):
    """Stream-ingest BindingDB SDF file."""
    offset = progress.get("offset", 0)
    if offset > 0:
        print(f"  Resuming from record {offset:,}")

    total = 0
    ingested = 0
    skipped = 0
    batch = []
    t0 = time.time()
    checkpoint_interval = 50000

    for raw in iter_sdf_records(sdf_path):
        total += 1
        if total <= offset:
            continue

        record = transform_record(raw, SDF_MAP)
        if record is None:
            skipped += 1
            continue

        batch.append(record)

        if len(batch) >= BATCH_SIZE:
            result = db.stream_ndjson("bindingdb_binding", batch)
            if "error" in result:
                print(f"\n  ERROR at record {total}: {result}")
                progress["offset"] = total
                save_progress(progress)
                return ingested
            ingested += len(batch)
            batch = []

            elapsed = time.time() - t0
            rate = ingested / elapsed if elapsed > 0 else 0
            print(f"\r  bindingdb_binding: {ingested:,} ingested, {skipped:,} skipped ({rate:.0f}/s) [rec {total:,}]",
                  end="", flush=True)

            if (total - offset) % checkpoint_interval < BATCH_SIZE:
                progress["offset"] = total
                save_progress(progress)

            if limit and ingested >= limit:
                break

    if batch:
        result = db.stream_ndjson("bindingdb_binding", batch)
        if "error" not in result:
            ingested += len(batch)

    progress["offset"] = total
    save_progress(progress)

    elapsed = time.time() - t0
    print(f"\r  bindingdb_binding: {ingested:,} ingested, {skipped:,} skipped from {total:,} records ({elapsed:.1f}s)")
    return ingested


def ingest_tsv(db: GigiClient, tsv_path: Path, progress: dict, limit=None):
    """Stream-ingest BindingDB TSV file (fallback)."""
    offset = progress.get("offset", 0)
    if offset > 0:
        print(f"  Resuming from row {offset:,}")

    total = 0
    ingested = 0
    batch = []
    t0 = time.time()
    checkpoint_interval = 10000

    with open(tsv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter="\t")

        for row in reader:
            total += 1
            if total <= offset:
                continue

            record = transform_record(row, TSV_MAP)
            if record is None:
                continue

            batch.append(record)

            if len(batch) >= BATCH_SIZE:
                result = db.stream_ndjson("bindingdb_binding", batch)
                if "error" in result:
                    print(f"\n  ERROR at row {total}: {result}")
                    progress["offset"] = total
                    save_progress(progress)
                    return ingested
                ingested += len(batch)
                batch = []

                elapsed = time.time() - t0
                rate = ingested / elapsed if elapsed > 0 else 0
                print(f"\r  bindingdb_binding: {ingested:,} records ({rate:.0f}/s) [row {total:,}]",
                      end="", flush=True)

                if ingested % checkpoint_interval < BATCH_SIZE:
                    progress["offset"] = total
                    save_progress(progress)

                if limit and ingested >= limit:
                    break

    if batch:
        result = db.stream_ndjson("bindingdb_binding", batch)
        if "error" not in result:
            ingested += len(batch)

    progress["offset"] = total
    save_progress(progress)

    elapsed = time.time() - t0
    print(f"\r  bindingdb_binding: {ingested:,} records from {total:,} rows ({elapsed:.1f}s)")
    return ingested


# ── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BindingDB → GIGI Bulk Ingestor")
    parser.add_argument("--host", default=DEFAULT_HOST, help="GIGI host URL")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--sdf-path", type=str, default=None,
                        help="Path to BindingDB SDF file")
    parser.add_argument("--tsv-path", type=str, default=None,
                        help="Path to BindingDB TSV file (fallback)")
    args = parser.parse_args()

    print("=" * 60)
    print("  BindingDB → GIGI Bulk Ingestor")
    print(f"  Target: {args.host}")
    if args.limit:
        print(f"  Limit: {args.limit:,} records")
    print("=" * 60)

    # Step 1: Find data
    print("\n── Step 1: Locate BindingDB data ──")
    if args.sdf_path:
        data_path, fmt = Path(args.sdf_path), "sdf"
    elif args.tsv_path:
        data_path, fmt = Path(args.tsv_path), "tsv"
    else:
        data_path, fmt = find_data_file()

    if data_path is None or not data_path.exists():
        print("  ERROR: No BindingDB data found.")
        print(f"  Expected SDF at: {BINDINGDB_SDF}")
        print(f"  Or TSV at: {BINDINGDB_TSV}")
        print("  Download from: https://www.bindingdb.org/rwd/bind/chemsearch/marvin/SDFdownload.jsp?all_download=yes")
        sys.exit(1)

    # Step 2: Connect
    print("\n── Step 2: Connect to GIGI ──")
    gigi = GigiClient(args.host, dry_run=args.dry_run)
    health = gigi.health()
    if "error" in health:
        print(f"  WARNING: {health['error']}")
        if not args.dry_run:
            sys.exit(1)
    else:
        print(f"  Connected: {health}")

    # Step 3: Create bundles
    print("\n── Step 3: Create bundles ──")
    progress = load_progress() if args.resume else {"offset": 0}
    create_bundles(gigi)

    # Step 4: Ingest
    print(f"\n── Step 4: Ingest binding data ({fmt.upper()}) ──")
    if fmt == "sdf":
        ingest_sdf(gigi, data_path, progress, limit=args.limit)
    else:
        ingest_tsv(gigi, data_path, progress, limit=args.limit)

    # Summary
    print("\n" + "=" * 60)
    print("  INGESTION COMPLETE")
    print(f"  Bundles: {gigi.stats['bundles']}")
    print(f"  Records: {gigi.stats['records']:,}")
    print(f"  Errors: {gigi.stats['errors']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
