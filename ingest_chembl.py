#!/usr/bin/env python3
"""
ChEMBL → GIGI Bulk Ingestor
============================
Downloads ChEMBL SQLite database and ingests bioactivity data
into GIGI as fiber bundles with computed τ, K_admet, and K_pathway.

Source: https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/latest/
License: CC BY-SA 3.0

Usage:
  python ingest_chembl.py                                    # full ingest to Fly.io
  python ingest_chembl.py --host http://localhost:3142        # local GIGI
  python ingest_chembl.py --download-only                     # just download ChEMBL
  python ingest_chembl.py --resume                            # resume interrupted ingest
  python ingest_chembl.py --limit 100000                      # ingest first N activities
  python ingest_chembl.py --dry-run                           # preview without inserting

Estimated output: ~20M bioactivity records → ~100-200GB in GIGI fiber bundle form.
"""

from __future__ import annotations
import argparse, gzip, json, math, os, sqlite3, sys, time, tarfile, tempfile
import urllib.request, urllib.error
from pathlib import Path

# ── Constants ───────────────────────────────────────────────────

CHEMBL_VERSION = "36"
CHEMBL_URL = f"https://ftp.ebi.ac.uk/pub/databases/chembl/ChEMBLdb/latest/chembl_{CHEMBL_VERSION}_sqlite.tar.gz"
CHEMBL_DIR = Path("data")
CHEMBL_TAR = CHEMBL_DIR / f"chembl_{CHEMBL_VERSION}_sqlite.tar.gz"
CHEMBL_DB = CHEMBL_DIR / f"chembl_{CHEMBL_VERSION}" / f"chembl_{CHEMBL_VERSION}_sqlite" / f"chembl_{CHEMBL_VERSION}.db"
DEFAULT_HOST = "https://gigi-stream.fly.dev"
BATCH_SIZE = 10000
STREAM_MAX_BYTES = 200 * 1024 * 1024  # 200 MB per stream request (limit 256 MB)
PROGRESS_FILE = CHEMBL_DIR / "ingest_progress.json"


# ── GIGI REST Client (reused pattern) ──────────────────────────

class GigiClient:
    def __init__(self, host: str, dry_run: bool = False):
        self.host = host.rstrip("/")
        self.dry_run = dry_run
        self.stats = {"bundles": 0, "records": 0, "errors": 0, "skipped": 0}

    def _req(self, method, path, body=None, timeout=30):
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
        result = self._req("POST", f"/v1/bundles/{bundle}/insert",
                           {"records": clean}, timeout=60)
        if "error" not in result:
            self.stats["records"] += len(clean)
        return result

    def stream_ndjson(self, bundle, records):
        """Stream records as NDJSON to /v1/bundles/{name}/stream (up to 256MB)."""
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

def safe_log10(x):
    """Safe log10 that handles zero/negative."""
    if x is not None and x > 0:
        return round(math.log10(x), 4)
    return None

def compute_tau(potency_nm, dose_nm=None):
    """Compute τ = log10(exposure/MIC) from nM values."""
    if potency_nm and potency_nm > 0:
        return round(-math.log10(potency_nm * 1e-9) - 3, 4)  # pIC50-like
    return None


# ── Download ────────────────────────────────────────────────────

def download_chembl():
    """Download ChEMBL SQLite database if not present."""
    CHEMBL_DIR.mkdir(parents=True, exist_ok=True)

    if CHEMBL_DB.exists():
        size_gb = CHEMBL_DB.stat().st_size / (1024 ** 3)
        print(f"  ChEMBL DB already exists: {CHEMBL_DB} ({size_gb:.1f} GB)")
        return CHEMBL_DB

    if not CHEMBL_TAR.exists():
        print(f"  Downloading ChEMBL {CHEMBL_VERSION} (~4 GB)...")
        print(f"  URL: {CHEMBL_URL}")
        _download_with_progress(CHEMBL_URL, CHEMBL_TAR)
    else:
        print(f"  Tarball already downloaded: {CHEMBL_TAR}")

    print("  Extracting...")
    with tarfile.open(CHEMBL_TAR, "r:gz") as tar:
        tar.extractall(path=CHEMBL_DIR, filter="data")

    if CHEMBL_DB.exists():
        size_gb = CHEMBL_DB.stat().st_size / (1024 ** 3)
        print(f"  Extracted: {CHEMBL_DB} ({size_gb:.1f} GB)")
    else:
        # Try to find the .db file wherever it was extracted
        for db in CHEMBL_DIR.rglob("*.db"):
            print(f"  Found DB at: {db}")
            return db
        print("  ERROR: Could not find ChEMBL .db file after extraction")
        sys.exit(1)

    return CHEMBL_DB


def _download_with_progress(url, dest):
    """Download a large file with progress reporting."""
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=300) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 1024 * 1024  # 1MB
        start = time.time()

        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total > 0:
                    pct = downloaded / total * 100
                    speed = downloaded / (time.time() - start) / (1024 * 1024)
                    print(f"\r  {pct:.1f}% ({downloaded / (1024**3):.2f} / {total / (1024**3):.2f} GB) @ {speed:.1f} MB/s", end="", flush=True)
        print()


# ── Progress tracking ──────────────────────────────────────────

def load_progress():
    if PROGRESS_FILE.exists():
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"activities_offset": 0, "compounds_done": False,
            "targets_done": False, "assays_done": False}

def save_progress(progress):
    CHEMBL_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f)


# ── Bundle creation ─────────────────────────────────────────────

def create_bundles(db: GigiClient):
    """Create the ChEMBL fiber bundles in GIGI."""
    print("\n── Creating ChEMBL bundles ──")

    # 1. Compounds bundle — drug/molecule metadata
    db.create_bundle("chembl_compounds", fields={
        "chembl_id":       "categorical",
        "pref_name":       "text",
        "max_phase":       "numeric",
        "molecule_type":   "categorical",
        "mw_freebase":     "numeric",
        "alogp":           "numeric",
        "hba":             "numeric",
        "hbd":             "numeric",
        "psa":             "numeric",
        "ro5_violations":  "numeric",
        "qed_weighted":    "numeric",
        "aromatic_rings":  "numeric",
        "heavy_atoms":     "numeric",
        "oral":            "numeric",
        "parenteral":      "numeric",
        "topical":         "numeric",
        "first_approval":  "numeric",
    }, keys=["chembl_id"],
       indexed=["pref_name", "max_phase", "molecule_type"])

    # 2. Targets bundle — biological targets
    db.create_bundle("chembl_targets", fields={
        "target_chembl_id": "categorical",
        "pref_name":        "text",
        "target_type":      "categorical",
        "organism":         "categorical",
        "tax_id":           "numeric",
    }, keys=["target_chembl_id"],
       indexed=["target_type", "organism"])

    # 3. Assays bundle — experimental context
    db.create_bundle("chembl_assays", fields={
        "assay_chembl_id":  "categorical",
        "assay_type":       "categorical",
        "description":      "text",
        "target_chembl_id": "categorical",
        "organism":         "categorical",
        "confidence_score": "numeric",
    }, keys=["assay_chembl_id"],
       indexed=["assay_type", "target_chembl_id"])

    # 4. Activities — the main fiber bundle (compound × target → potency)
    #    Only records with pchembl_value (4.9M of 24M) — these carry tau coordinates
    db.create_bundle("chembl_activities", fields={
        "activity_id":      "numeric",
        "compound_chembl_id": "categorical",
        "target_chembl_id": "categorical",
        "assay_chembl_id":  "categorical",
        "standard_type":    "categorical",
        "standard_relation":"categorical",
        "standard_value":   "numeric",
        "standard_units":   "categorical",
        "pchembl_value":    "numeric",
        "tau":              "numeric",
        "potency_class":    "categorical",
    }, keys=["activity_id"],
       indexed=["compound_chembl_id", "target_chembl_id", "standard_type"])

    # 5. Drug-target fibers — computed τ per (drug, target) pair
    db.create_bundle("chembl_drug_target", fields={
        "compound_chembl_id": "categorical",
        "target_chembl_id":   "categorical",
        "pref_name":          "text",
        "target_name":        "text",
        "target_type":        "categorical",
        "organism":           "categorical",
        "mean_pchembl":       "numeric",
        "median_pchembl":     "numeric",
        "min_pchembl":        "numeric",
        "max_pchembl":        "numeric",
        "n_measurements":     "numeric",
        "tau":                "numeric",
        "potency_class":      "categorical",
    }, keys=["compound_chembl_id", "target_chembl_id"],
       indexed=["organism", "potency_class", "target_type"])


# ── Data extraction queries ─────────────────────────────────────

COMPOUNDS_SQL = """
SELECT
    md.chembl_id,
    md.pref_name,
    md.max_phase,
    md.molecule_type,
    cp.mw_freebase,
    cp.alogp,
    cp.hba,
    cp.hbd,
    cp.psa,
    cp.num_ro5_violations AS ro5_violations,
    cp.qed_weighted,
    cp.aromatic_rings,
    cp.heavy_atoms,
    CASE WHEN md.oral = 1 THEN 1 ELSE 0 END AS oral,
    CASE WHEN md.parenteral = 1 THEN 1 ELSE 0 END AS parenteral,
    CASE WHEN md.topical = 1 THEN 1 ELSE 0 END AS topical,
    md.first_approval
FROM molecule_dictionary md
LEFT JOIN compound_properties cp ON md.molregno = cp.molregno
WHERE md.molregno IN (
    SELECT DISTINCT act.molregno FROM activities act
    WHERE act.pchembl_value IS NOT NULL
)
ORDER BY md.molregno
"""

TARGETS_SQL = """
SELECT
    td.chembl_id AS target_chembl_id,
    td.pref_name,
    td.target_type,
    td.organism,
    td.tax_id
FROM target_dictionary td
ORDER BY td.tid
"""

ASSAYS_SQL = """
SELECT
    ad.chembl_id AS assay_chembl_id,
    ad.assay_type,
    ad.description,
    td.chembl_id AS target_chembl_id,
    ad.assay_organism AS organism,
    ad.confidence_score
FROM assays ad
LEFT JOIN target_dictionary td ON ad.tid = td.tid
ORDER BY ad.assay_id
"""

ACTIVITIES_SQL = """
SELECT
    act.activity_id,
    md.chembl_id AS compound_chembl_id,
    td.chembl_id AS target_chembl_id,
    ad.chembl_id AS assay_chembl_id,
    act.standard_type,
    act.standard_relation,
    act.standard_value,
    act.standard_units,
    act.pchembl_value
FROM activities act
JOIN assays ad ON act.assay_id = ad.assay_id
JOIN molecule_dictionary md ON act.molregno = md.molregno
LEFT JOIN target_dictionary td ON ad.tid = td.tid
WHERE act.pchembl_value IS NOT NULL
ORDER BY act.activity_id
LIMIT -1 OFFSET {offset}
"""

DRUG_TARGET_SQL = """
SELECT
    md.chembl_id AS compound_chembl_id,
    td.chembl_id AS target_chembl_id,
    md.pref_name,
    td.pref_name AS target_name,
    td.target_type,
    td.organism,
    AVG(act.pchembl_value) AS mean_pchembl,
    MIN(act.pchembl_value) AS min_pchembl,
    MAX(act.pchembl_value) AS max_pchembl,
    COUNT(*) AS n_measurements
FROM activities act
JOIN assays ad ON act.assay_id = ad.assay_id
JOIN molecule_dictionary md ON act.molregno = md.molregno
JOIN target_dictionary td ON ad.tid = td.tid
WHERE act.pchembl_value IS NOT NULL
GROUP BY md.chembl_id, td.chembl_id
HAVING COUNT(*) >= 2
ORDER BY mean_pchembl DESC
"""


# ── Ingestion functions ─────────────────────────────────────────

def classify_potency(pchembl):
    """Classify potency by pChEMBL: >=8 = potent, >=6 = moderate, else weak."""
    if pchembl is None:
        return None
    if pchembl >= 8:
        return "potent"
    if pchembl >= 6:
        return "moderate"
    return "weak"


def ingest_table(db: GigiClient, conn: sqlite3.Connection, bundle: str,
                 sql: str, transform=None, limit=None, label="records"):
    """Generic: query SQLite, transform rows, stream via NDJSON to GIGI."""
    cursor = conn.cursor()
    cursor.execute(sql)
    columns = [desc[0] for desc in cursor.description]

    total = 0
    batch = []
    t0 = time.time()

    for row in cursor:
        record = dict(zip(columns, row))
        if transform:
            record = transform(record)
            if record is None:
                continue
        batch.append(record)

        if len(batch) >= BATCH_SIZE:
            result = db.stream_ndjson(bundle, batch)
            if "error" in result:
                print(f"\n  ERROR: {result}")
                return total
            total += len(batch)
            elapsed = time.time() - t0
            rate = total / elapsed if elapsed > 0 else 0
            print(f"\r  {bundle}: {total:,} {label} ({rate:.0f}/s)", end="", flush=True)
            batch = []

            if limit and total >= limit:
                break

    if batch:
        result = db.stream_ndjson(bundle, batch)
        if "error" not in result:
            total += len(batch)

    elapsed = time.time() - t0
    print(f"\r  {bundle}: {total:,} {label} done ({elapsed:.1f}s)")
    return total


def transform_activity(record):
    """Add computed τ and potency class to activity row."""
    pchembl = record.get("pchembl_value")
    if pchembl is not None:
        record["tau"] = round(pchembl, 4)
    else:
        # Estimate from standard_value if IC50/Ki/EC50 in nM
        val = record.get("standard_value")
        units = record.get("standard_units")
        stype = record.get("standard_type")
        if val and val > 0 and units == "nM" and stype in ("IC50", "Ki", "EC50", "Kd"):
            record["tau"] = round(9 - math.log10(val), 4)  # pIC50 approx
    record["potency_class"] = classify_potency(record.get("tau") or record.get("pchembl_value"))
    return record


def transform_drug_target(record):
    """Add computed fields to drug-target aggregate."""
    mean_p = record.get("mean_pchembl")
    record["tau"] = round(mean_p, 4) if mean_p else None
    # Median approximation (we only have min/max/mean from SQL)
    min_p = record.get("min_pchembl")
    max_p = record.get("max_pchembl")
    record["median_pchembl"] = round((min_p + max_p) / 2, 4) if min_p and max_p else None
    record["potency_class"] = classify_potency(mean_p)
    return record


def ingest_activities_resumable(db: GigiClient, conn: sqlite3.Connection,
                                 progress: dict, limit=None):
    """Ingest activities with resume support."""
    offset = progress.get("activities_offset", 0)
    if offset > 0:
        print(f"  Resuming from offset {offset:,}")

    sql = ACTIVITIES_SQL.format(offset=offset)
    cursor = conn.cursor()
    cursor.execute(sql)
    columns = [desc[0] for desc in cursor.description]

    total = offset
    batch = []
    t0 = time.time()
    checkpoint_interval = 10000

    for row in cursor:
        record = dict(zip(columns, row))
        record = transform_activity(record)
        batch.append(record)

        if len(batch) >= BATCH_SIZE:
            result = db.stream_ndjson("chembl_activities", batch)
            if "error" in result:
                print(f"\n  ERROR: {result}")
                progress["activities_offset"] = total
                save_progress(progress)
                return total
            total += len(batch)
            batch = []

            elapsed = time.time() - t0
            rate = (total - offset) / elapsed if elapsed > 0 else 0
            print(f"\r  chembl_activities: {total:,} ({rate:.0f}/s)", end="", flush=True)

            # Save checkpoint
            if (total - offset) % checkpoint_interval < BATCH_SIZE:
                progress["activities_offset"] = total
                save_progress(progress)

            if limit and (total - offset) >= limit:
                break

    if batch:
        result = db.stream_ndjson("chembl_activities", batch)
        if "error" not in result:
            total += len(batch)

    progress["activities_offset"] = total
    save_progress(progress)

    elapsed = time.time() - t0
    print(f"\r  chembl_activities: {total:,} total ({elapsed:.1f}s)")
    return total


# ── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ChEMBL → GIGI Bulk Ingestor")
    parser.add_argument("--host", default=DEFAULT_HOST, help="GIGI host URL")
    parser.add_argument("--download-only", action="store_true", help="Only download ChEMBL")
    parser.add_argument("--dry-run", action="store_true", help="Preview without inserting")
    parser.add_argument("--resume", action="store_true", help="Resume interrupted ingest")
    parser.add_argument("--limit", type=int, default=None, help="Max activities to ingest")
    parser.add_argument("--skip-activities", action="store_true", help="Skip activities (do metadata only)")
    parser.add_argument("--db-path", type=str, default=None, help="Path to ChEMBL .db file")
    args = parser.parse_args()

    print("=" * 60)
    print("  ChEMBL → GIGI Bulk Ingestor")
    print(f"  Target: {args.host}")
    if args.limit:
        print(f"  Limit: {args.limit:,} activities")
    print("=" * 60)

    # Step 1: Download
    print("\n── Step 1: Acquire ChEMBL database ──")
    if args.db_path:
        db_path = Path(args.db_path)
        if not db_path.exists():
            print(f"  ERROR: {db_path} not found")
            sys.exit(1)
        print(f"  Using provided DB: {db_path}")
    else:
        db_path = download_chembl()

    if args.download_only:
        print("\n  Download complete. Use --resume to start ingestion.")
        return

    # Step 2: Connect
    print("\n── Step 2: Connect to GIGI ──")
    gigi = GigiClient(args.host, dry_run=args.dry_run)
    health = gigi.health()
    if "error" in health:
        print(f"  WARNING: GIGI not reachable at {args.host}")
        print(f"  Error: {health['error']}")
        if not args.dry_run:
            print("  Use --dry-run to preview, or start GIGI first.")
            sys.exit(1)
    else:
        print(f"  Connected: {health}")

    # Step 3: Open SQLite
    print(f"\n── Step 3: Open ChEMBL database ──")
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA cache_size=-2000000")  # 2GB cache

    # Count records
    counts = {}
    for table in ["molecule_dictionary", "target_dictionary", "assays", "activities"]:
        try:
            c = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            counts[table] = c
            print(f"  {table}: {c:,}")
        except Exception:
            counts[table] = "?"
            print(f"  {table}: (not found)")

    # Step 4: Create bundles
    progress = load_progress() if args.resume else {
        "activities_offset": 0, "compounds_done": False,
        "targets_done": False, "assays_done": False
    }

    print("\n── Step 4: Create GIGI bundles ──")
    create_bundles(gigi)

    # Step 5: Ingest metadata tables
    print("\n── Step 5: Ingest metadata ──")
    if not progress.get("compounds_done"):
        ingest_table(gigi, conn, "chembl_compounds", COMPOUNDS_SQL, label="compounds")
        progress["compounds_done"] = True
        save_progress(progress)

    if not progress.get("targets_done"):
        ingest_table(gigi, conn, "chembl_targets", TARGETS_SQL, label="targets")
        progress["targets_done"] = True
        save_progress(progress)

    if not progress.get("assays_done"):
        ingest_table(gigi, conn, "chembl_assays", ASSAYS_SQL, label="assays")
        progress["assays_done"] = True
        save_progress(progress)

    # Step 6: Ingest activities (the big one)
    if not args.skip_activities:
        print("\n── Step 6: Ingest activities (this is the big one) ──")
        act_count = counts.get("activities", 0)
        if isinstance(act_count, int):
            est_hours = act_count / 200 / 3600 * 0.15  # rough estimate
            print(f"  ~{act_count:,} activities, estimated ~{est_hours:.1f} hours at 200 rec/batch")
        ingest_activities_resumable(gigi, conn, progress, limit=args.limit)

    # Step 7: Ingest drug-target aggregates
    print("\n── Step 7: Drug-target fiber aggregates ──")
    if not progress.get("drug_target_done"):
        ingest_table(gigi, conn, "chembl_drug_target", DRUG_TARGET_SQL,
                     transform=transform_drug_target, label="drug-target pairs")
        progress["drug_target_done"] = True
        save_progress(progress)

    # Summary
    conn.close()
    print("\n" + "=" * 60)
    print("  INGESTION COMPLETE")
    print(f"  Bundles created: {gigi.stats['bundles']}")
    print(f"  Records inserted: {gigi.stats['records']:,}")
    print(f"  Errors: {gigi.stats['errors']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
