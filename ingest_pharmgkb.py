#!/usr/bin/env python3
"""
PharmGKB → GIGI Bulk Ingestor
================================
Downloads PharmGKB pharmacogenomics data (clinical annotations,
variant-drug pairs, pathways) and ingests into GIGI as fiber bundles.

Source: https://www.pharmgkb.org/downloads
License: CC BY-SA 4.0 (free for academic/research use)

PharmGKB provides free TSV downloads without requiring authentication.
Key datasets:
  - Clinical annotations: gene-drug-phenotype associations with evidence levels
  - Variant annotations: rsID → drug response data
  - Drug labels: FDA/EMA pharmacogenomic labels

Usage:
  python ingest_pharmgkb.py                                    # full ingest to Fly.io
  python ingest_pharmgkb.py --host http://localhost:3142        # local GIGI
  python ingest_pharmgkb.py --download-only                     # just download
  python ingest_pharmgkb.py --resume                            # resume interrupted
  python ingest_pharmgkb.py --limit 100000                      # ingest first N
  python ingest_pharmgkb.py --dry-run                           # preview

Estimated output: ~500K PGx records → ~5GB in GIGI fiber bundle form.
"""

from __future__ import annotations
import argparse, csv, json, math, os, sys, time, zipfile
import urllib.request, urllib.error
from pathlib import Path

# ── Constants ───────────────────────────────────────────────────

PHARMGKB_BASE = "https://api.pharmgkb.org/v1/download/file/data"
DOWNLOADS = {
    "clinical_annotations": f"{PHARMGKB_BASE}/clinicalAnnotations.zip",
    "variant_annotations": f"{PHARMGKB_BASE}/variantAnnotations.zip",
    "drug_labels": f"{PHARMGKB_BASE}/drugLabels.zip",
    "relationships": f"{PHARMGKB_BASE}/relationships.zip",
}
DATA_DIR = Path("data") / "pharmgkb"
DEFAULT_HOST = "https://gigi-stream.fly.dev"
BATCH_SIZE = 500
PROGRESS_FILE = DATA_DIR / "pharmgkb_progress.json"


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
    return {
        "clinical_offset": 0, "clinical_done": False,
        "variant_offset": 0, "variant_done": False,
        "drug_labels_done": False, "relationships_done": False,
        "bundles_created": False,
    }

def save_progress(p):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(p, f, indent=2)


# ── Math helpers ────────────────────────────────────────────────

EVIDENCE_TAU = {
    "1A": 0.95,  # Implemented in clinical practice
    "1B": 0.90,  # Strong evidence
    "2A": 0.80,  # Moderate evidence
    "2B": 0.70,  # Weak evidence
    "3":  0.50,  # Low-level annotation
    "4":  0.30,  # Case reports
}

def evidence_to_tau(level):
    """Convert PharmGKB evidence level to τ value."""
    if not level:
        return 0.40
    level = level.strip().upper()
    return EVIDENCE_TAU.get(level, 0.40)

def parse_float_safe(s):
    if not s or s.strip() in ("", "N/A", "NA", "-", "null"):
        return None
    try:
        return float(s.strip())
    except (ValueError, TypeError):
        return None


# ── Download ────────────────────────────────────────────────────

def download_file(url, dest, label):
    """Download a file with User-Agent header."""
    if dest.exists():
        size_mb = dest.stat().st_size / (1024 ** 2)
        print(f"  Already have: {dest.name} ({size_mb:.1f} MB)")
        return True

    print(f"  Downloading {label}...")
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (GIGI PharmGKB Ingestor)")
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
            dest.parent.mkdir(parents=True, exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            print(f"  Downloaded: {dest.name} ({len(data) / (1024**2):.1f} MB)")
            return True
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {url}")
        return False
    except Exception as e:
        print(f"  Error: {e}")
        return False

def download_all():
    """Download all PharmGKB data files."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ok = True
    for key, url in DOWNLOADS.items():
        zip_path = DATA_DIR / f"{key}.zip"
        if not download_file(url, zip_path, key):
            ok = False
            continue
        # Extract zip
        extract_dir = DATA_DIR / key
        if not extract_dir.exists():
            try:
                with zipfile.ZipFile(zip_path) as zf:
                    zf.extractall(extract_dir)
                    print(f"  Extracted: {key}/ ({len(zf.namelist())} files)")
            except zipfile.BadZipFile:
                print(f"  WARNING: {zip_path} is not a valid ZIP")
                ok = False
    return ok


def find_tsv(directory, pattern):
    """Find a TSV file in a directory matching a pattern."""
    d = Path(directory)
    if not d.exists():
        return None
    for f in sorted(d.glob("*.tsv")):
        if pattern.lower() in f.name.lower():
            return f
    # Fallback: any TSV
    tsvs = list(d.glob("*.tsv"))
    return tsvs[0] if tsvs else None


# ── Bundle schemas ──────────────────────────────────────────────

def create_bundles(gigi):
    """Create GIGI bundles for PharmGKB data."""
    gigi.create_bundle("pgx_clinical", {
        "annotation_id": "string",
        "gene": "string",
        "drug": "string",
        "phenotype_category": "string",
        "significance": "string",
        "evidence_level": "string",
        "alleles": "string",
        "population": "string",
        "tau": "float",
        "score": "float",
        "pmid_count": "int",
    }, keys=["annotation_id"], indexed=["gene", "drug", "evidence_level"])

    gigi.create_bundle("pgx_variants", {
        "variant_id": "string",
        "gene": "string",
        "drug": "string",
        "annotation_text": "string",
        "significance": "string",
        "alleles": "string",
        "tau": "float",
        "evidence_count": "int",
    }, keys=["variant_id", "gene", "drug"], indexed=["gene", "drug", "variant_id"])

    gigi.create_bundle("pgx_drug_labels", {
        "label_id": "string",
        "drug": "string",
        "source": "string",
        "testing_level": "string",
        "genes": "string",
        "tau": "float",
    }, keys=["label_id"], indexed=["drug", "source", "testing_level"])


# ── Transforms ──────────────────────────────────────────────────

def transform_clinical(row):
    """Transform PharmGKB clinical annotation row."""
    ann_id = row.get("Clinical Annotation ID") or row.get("Annotation ID")
    gene = row.get("Gene") or row.get("gene")
    drug = row.get("Drug(s)") or row.get("Drug") or row.get("drug")
    level = row.get("Level of Evidence") or row.get("Evidence Level") or row.get("Level")
    pheno = row.get("Phenotype Category") or row.get("Phenotype(Category)")
    sig = row.get("Significance") or row.get("significance")
    alleles = row.get("Variant/Haplotypes") or row.get("Genotype/Allele")
    pmid = row.get("PMIDs") or row.get("PMID Count") or ""

    if not ann_id:
        return None

    pmid_count = len([p for p in pmid.split(";") if p.strip()]) if pmid else 0
    tau = evidence_to_tau(level)
    score = parse_float_safe(row.get("Score"))

    return {
        "annotation_id": str(ann_id).strip(),
        "gene": gene.strip()[:100] if gene else None,
        "drug": drug.strip()[:200] if drug else None,
        "phenotype_category": pheno.strip()[:200] if pheno else None,
        "significance": sig.strip()[:100] if sig else None,
        "evidence_level": level.strip() if level else None,
        "alleles": alleles.strip()[:500] if alleles else None,
        "population": (row.get("Race") or row.get("Population")).strip()[:100]
                      if (row.get("Race") or row.get("Population")) else None,
        "tau": tau,
        "score": score,
        "pmid_count": pmid_count,
    }

def transform_variant(row):
    """Transform PharmGKB variant annotation row."""
    vid = row.get("Variant") or row.get("Variant/Haplotypes") or row.get("rsid")
    gene = row.get("Gene") or row.get("gene")
    drug = row.get("Drug(s)") or row.get("Drug") or row.get("Chemical")
    text = row.get("Sentence") or row.get("Annotation Text") or row.get("Summary")
    sig = row.get("Significance") or row.get("significance")
    alleles = row.get("Alleles") or row.get("Genotype/Allele")

    if not vid:
        return None

    ev_count = 0
    for key in ("PMID Count", "PMIDs", "Evidence Count"):
        v = row.get(key, "")
        if v:
            try:
                ev_count = max(ev_count, int(v))
            except ValueError:
                ev_count = max(ev_count, len([p for p in str(v).split(";") if p.strip()]))

    # Higher tau for variants with more evidence
    tau = min(0.95, 0.40 + 0.05 * ev_count)

    return {
        "variant_id": vid.strip()[:50],
        "gene": gene.strip()[:100] if gene else None,
        "drug": drug.strip()[:200] if drug else None,
        "annotation_text": text.strip()[:1000] if text else None,
        "significance": sig.strip()[:100] if sig else None,
        "alleles": alleles.strip()[:200] if alleles else None,
        "tau": round(tau, 4),
        "evidence_count": ev_count,
    }

def transform_drug_label(row):
    """Transform PharmGKB drug label row."""
    lid = row.get("PharmGKB ID") or row.get("Label ID")
    drug = row.get("Chemicals") or row.get("Name") or row.get("Drug")
    source = row.get("Source") or row.get("Agency")
    testing = row.get("Testing Level") or row.get("Biomarker Testing Level")
    genes = row.get("Genes") or row.get("Associated Genes")

    if not lid or not drug:
        return None

    # Testing level → tau
    testing_tau = {
        "Actionable PGx": 0.90,
        "Required Genetic Testing": 0.95,
        "Informative PGx": 0.70,
        "Testing Recommended": 0.85,
    }
    tau = testing_tau.get(testing, 0.50) if testing else 0.50

    return {
        "label_id": str(lid).strip(),
        "drug": drug.strip()[:200] if drug else None,
        "source": source.strip()[:100] if source else None,
        "testing_level": testing.strip()[:100] if testing else None,
        "genes": genes.strip()[:500] if genes else None,
        "tau": tau,
    }


# ── Generic TSV ingestor ────────────────────────────────────────

def ingest_tsv(gigi, tsv_path, bundle, transform, progress_key, progress,
               limit=None, label="records"):
    """Generic: read TSV, transform rows, stream to GIGI."""
    offset = progress.get(f"{progress_key}_offset", 0)
    if offset > 0:
        print(f"  Resuming {label} from offset {offset:,}")

    with open(tsv_path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f, delimiter="\t")
        total = offset
        skipped = 0
        batch = []
        t0 = time.time()

        for i, row in enumerate(reader):
            if i < offset:
                continue

            record = transform(row)
            if record is None:
                skipped += 1
                continue
            batch.append(record)

            if len(batch) >= BATCH_SIZE:
                result = gigi.stream_ndjson(bundle, batch)
                if "error" in result:
                    print(f"\n  ERROR at {total}: {result}")
                    progress[f"{progress_key}_offset"] = total
                    save_progress(progress)
                    return total
                total += len(batch)
                batch = []

                elapsed = time.time() - t0
                rate = (total - offset) / elapsed if elapsed > 0 else 0
                print(f"\r  {bundle}: {total:,} ({rate:.0f}/s)", end="", flush=True)

                if (total - offset) % 5000 < BATCH_SIZE:
                    progress[f"{progress_key}_offset"] = total
                    save_progress(progress)

                if limit and (total - offset) >= limit:
                    break

    if batch:
        result = gigi.stream_ndjson(bundle, batch)
        if "error" not in result:
            total += len(batch)

    progress[f"{progress_key}_offset"] = total
    progress[f"{progress_key}_done"] = True
    save_progress(progress)

    elapsed = time.time() - t0
    print(f"\r  {bundle}: {total:,} total, {skipped} skipped ({elapsed:.1f}s)")
    return total


# ── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="PharmGKB → GIGI Bulk Ingestor")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--download-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    print("=" * 60)
    print("  PharmGKB → GIGI Bulk Ingestor")
    print(f"  Target: {args.host}")
    if args.limit:
        print(f"  Limit: {args.limit:,} records per dataset")
    print("=" * 60)

    # Step 1: Download
    print("\n── Step 1: Download PharmGKB data ──")
    ok = download_all()
    if not ok:
        print("  WARNING: Some downloads failed — will ingest what we have.")

    if args.download_only:
        print("\n  Download complete.")
        return

    # Step 2: Connect
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
    progress = load_progress() if args.resume else {
        "clinical_offset": 0, "clinical_done": False,
        "variant_offset": 0, "variant_done": False,
        "drug_labels_done": False, "relationships_done": False,
        "bundles_created": False,
    }

    if not progress.get("bundles_created"):
        create_bundles(gigi)
        progress["bundles_created"] = True
        save_progress(progress)

    # Step 4: Ingest clinical annotations
    if not progress.get("clinical_done"):
        print("\n── Step 4: Clinical annotations ──")
        tsv = find_tsv(DATA_DIR / "clinical_annotations", "clinical_ann")
        if tsv:
            ingest_tsv(gigi, tsv, "pgx_clinical", transform_clinical,
                       "clinical", progress, limit=args.limit, label="clinical annotations")
        else:
            print("  SKIP: clinical annotations TSV not found")

    # Step 5: Variant annotations
    if not progress.get("variant_done"):
        print("\n── Step 5: Variant annotations ──")
        tsv = find_tsv(DATA_DIR / "variant_annotations", "var_")
        if not tsv:
            tsv = find_tsv(DATA_DIR / "variant_annotations", "variant")
        if tsv:
            ingest_tsv(gigi, tsv, "pgx_variants", transform_variant,
                       "variant", progress, limit=args.limit, label="variant annotations")
        else:
            print("  SKIP: variant annotations TSV not found")

    # Step 6: Drug labels
    if not progress.get("drug_labels_done"):
        print("\n── Step 6: Drug labels ──")
        tsv = DATA_DIR / "drug_labels" / "drugLabels.tsv"
        if not tsv.exists():
            tsv = find_tsv(DATA_DIR / "drug_labels", "label")
        if tsv:
            ingest_tsv(gigi, tsv, "pgx_drug_labels", transform_drug_label,
                       "drug_labels", progress, limit=args.limit, label="drug labels")
        else:
            print("  SKIP: drug labels TSV not found")

    # Summary
    print("\n" + "=" * 60)
    print("  INGESTION COMPLETE")
    print(f"  Bundles created: {gigi.stats['bundles']}")
    print(f"  Records inserted: {gigi.stats['records']:,}")
    print(f"  Errors: {gigi.stats['errors']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
