#!/usr/bin/env python3
"""
ClinicalTrials.gov → GIGI Bulk Ingestor
==========================================
Queries the ClinicalTrials.gov REST API v2 and ingests trial data
into GIGI as fiber bundles with computed pharmacokinetic fibers.

Source: https://clinicaltrials.gov/api/v2/studies
License: Public domain (US Government work)

Usage:
  python ingest_clintrials.py                                    # full ingest
  python ingest_clintrials.py --host http://localhost:3142        # local GIGI
  python ingest_clintrials.py --resume                            # resume
  python ingest_clintrials.py --limit 50000                       # ingest first N
  python ingest_clintrials.py --dry-run                           # preview

Estimated output: ~450K clinical trials → ~10GB in GIGI fiber bundle form.
"""

from __future__ import annotations
import argparse, json, math, os, sys, time
import urllib.request, urllib.error, urllib.parse
from pathlib import Path

# ── Constants ───────────────────────────────────────────────────

API_BASE = "https://clinicaltrials.gov/api/v2/studies"
# Request fields we need (minimizes payload)
API_FIELDS = (
    "NCTId,BriefTitle,OverallStatus,Phase,StudyType,"
    "Condition,InterventionName,InterventionType,"
    "EnrollmentCount,StartDate,CompletionDate,"
    "LeadSponsorName,CollaboratorName,"
    "PrimaryOutcomeMeasure,SecondaryOutcomeMeasure"
)
PAGE_SIZE = 1000  # max allowed by API
DATA_DIR = Path("data") / "clintrials"
DEFAULT_HOST = "https://gigi-stream.fly.dev"
BATCH_SIZE = 500
PROGRESS_FILE = DATA_DIR / "clintrials_progress.json"

# Rate limit: ClinicalTrials.gov asks for ≤3 req/sec
API_DELAY = 0.4  # seconds between API calls


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
    return {"page_token": None, "total_fetched": 0, "total_ingested": 0,
            "bundles_created": False}

def save_progress(p):
    PROGRESS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(PROGRESS_FILE, "w") as f:
        json.dump(p, f, indent=2)


# ── API helpers ─────────────────────────────────────────────────

def fetch_page(page_token=None):
    """Fetch one page of studies from ClinicalTrials.gov API v2."""
    params = {
        "format": "json",
        "pageSize": PAGE_SIZE,
        "fields": API_FIELDS,
    }
    if page_token:
        params["pageToken"] = page_token

    url = f"{API_BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "GIGI-Ingestor/1.0 (research)")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 429:
            # Rate limited — back off
            print("\n  Rate limited, waiting 10s...")
            time.sleep(10)
            return fetch_page(page_token)
        raise


# ── Math helpers ────────────────────────────────────────────────

PHASE_TAU = {
    "PHASE1": 0.30,
    "PHASE2": 0.50,
    "PHASE3": 0.75,
    "PHASE4": 0.90,
    "EARLY_PHASE1": 0.20,
    "NA": 0.10,
}

STATUS_MULTIPLIER = {
    "COMPLETED": 1.0,
    "ACTIVE_NOT_RECRUITING": 0.9,
    "RECRUITING": 0.7,
    "ENROLLING_BY_INVITATION": 0.7,
    "NOT_YET_RECRUITING": 0.5,
    "SUSPENDED": 0.3,
    "TERMINATED": 0.2,
    "WITHDRAWN": 0.1,
    "UNKNOWN": 0.4,
}

def compute_trial_tau(phases, status, enrollment):
    """Compute τ for a clinical trial based on phase, status, enrollment."""
    # Base tau from highest phase
    tau = 0.10
    if phases:
        for p in phases:
            p_upper = p.upper().replace(" ", "")
            tau = max(tau, PHASE_TAU.get(p_upper, 0.10))

    # Adjust for status
    if status:
        mult = STATUS_MULTIPLIER.get(status.upper().replace(" ", "_"), 0.5)
        tau *= mult

    # Small boost for large enrollment (more statistical power)
    if enrollment and enrollment > 100:
        tau = min(0.99, tau * (1.0 + 0.01 * math.log10(enrollment)))

    return round(tau, 4)


# ── Bundle schema ───────────────────────────────────────────────

def create_bundles(gigi):
    """Create GIGI bundle for clinical trials."""
    gigi.create_bundle("clintrials_studies", {
        "nct_id": "string",
        "title": "string",
        "status": "string",
        "phase": "string",
        "study_type": "string",
        "conditions": "string",
        "interventions": "string",
        "intervention_types": "string",
        "enrollment": "int",
        "start_date": "string",
        "completion_date": "string",
        "sponsor": "string",
        "tau": "float",
    }, keys=["nct_id"], indexed=["status", "phase", "conditions", "sponsor"])


# ── Transform ───────────────────────────────────────────────────

def safe_get(d, *keys):
    """Safely navigate nested dict keys."""
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k)
        else:
            return None
    return d

def transform_study(study):
    """Transform a ClinicalTrials.gov API v2 study into a GIGI record."""
    proto = study.get("protocolSection", {})
    ident = proto.get("identificationModule", {})
    status_mod = proto.get("statusModule", {})
    design = proto.get("designModule", {})
    cond_mod = proto.get("conditionsModule", {})
    arms_mod = proto.get("armsInterventionsModule", {})
    sponsor_mod = proto.get("sponsorCollaboratorsModule", {})

    nct_id = ident.get("nctId")
    if not nct_id:
        return None

    title = ident.get("briefTitle", "")
    status = status_mod.get("overallStatus", "")
    phases = design.get("phases", [])
    study_type = design.get("studyType", "")
    enrollment_info = design.get("enrollmentInfo", {})
    enrollment = enrollment_info.get("count") if enrollment_info else None

    conditions = cond_mod.get("conditions", []) if cond_mod else []
    interventions = arms_mod.get("interventions", []) if arms_mod else []
    interv_names = [i.get("name", "") for i in interventions]
    interv_types = list(set(i.get("type", "") for i in interventions))

    start_date = safe_get(status_mod, "startDateStruct", "date")
    comp_date = safe_get(status_mod, "completionDateStruct", "date")
    sponsor = safe_get(sponsor_mod, "leadSponsor", "name")

    tau = compute_trial_tau(phases, status, enrollment)

    return {
        "nct_id": nct_id,
        "title": title[:300] if title else None,
        "status": status or None,
        "phase": "; ".join(phases) if phases else None,
        "study_type": study_type or None,
        "conditions": "; ".join(conditions)[:500] if conditions else None,
        "interventions": "; ".join(interv_names)[:500] if interv_names else None,
        "intervention_types": "; ".join(interv_types)[:200] if interv_types else None,
        "enrollment": enrollment,
        "start_date": start_date,
        "completion_date": comp_date,
        "sponsor": sponsor[:200] if sponsor else None,
        "tau": tau,
    }


# ── Ingest ──────────────────────────────────────────────────────

def ingest_studies(gigi, progress, limit=None):
    """Paginate through ClinicalTrials.gov API and ingest into GIGI."""
    page_token = progress.get("page_token")
    total_fetched = progress.get("total_fetched", 0)
    total_ingested = progress.get("total_ingested", 0)

    if total_fetched > 0:
        print(f"  Resuming from {total_fetched:,} fetched, {total_ingested:,} ingested")

    batch = []
    t0 = time.time()
    pages = 0

    while True:
        # Fetch page from API
        try:
            data = fetch_page(page_token)
        except Exception as e:
            print(f"\n  API error: {e}")
            # Save progress and exit gracefully
            progress["page_token"] = page_token
            progress["total_fetched"] = total_fetched
            progress["total_ingested"] = total_ingested
            save_progress(progress)
            return total_ingested

        studies = data.get("studies", [])
        if not studies:
            break

        for study in studies:
            record = transform_study(study)
            if record:
                batch.append(record)
            total_fetched += 1

        # Stream batch to GIGI when full
        if len(batch) >= BATCH_SIZE:
            result = gigi.stream_ndjson("clintrials_studies", batch)
            if "error" in result:
                print(f"\n  GIGI error: {result}")
                progress["page_token"] = page_token
                progress["total_fetched"] = total_fetched
                progress["total_ingested"] = total_ingested
                save_progress(progress)
                return total_ingested
            total_ingested += len(batch)
            batch = []

        pages += 1
        elapsed = time.time() - t0
        rate = total_fetched / elapsed if elapsed > 0 else 0
        print(f"\r  Studies: {total_fetched:,} fetched, {total_ingested:,} ingested ({rate:.0f}/s)",
              end="", flush=True)

        # Checkpoint every 10 pages
        if pages % 10 == 0:
            progress["page_token"] = data.get("nextPageToken")
            progress["total_fetched"] = total_fetched
            progress["total_ingested"] = total_ingested
            save_progress(progress)

        # Check limit
        if limit and total_fetched >= limit:
            break

        # Next page
        page_token = data.get("nextPageToken")
        if not page_token:
            break

        # Rate limit
        time.sleep(API_DELAY)

    # Final batch
    if batch:
        result = gigi.stream_ndjson("clintrials_studies", batch)
        if "error" not in result:
            total_ingested += len(batch)

    progress["page_token"] = None  # completed
    progress["total_fetched"] = total_fetched
    progress["total_ingested"] = total_ingested
    save_progress(progress)

    elapsed = time.time() - t0
    print(f"\r  Studies: {total_fetched:,} fetched, {total_ingested:,} ingested ({elapsed:.1f}s)")
    return total_ingested


# ── Main ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ClinicalTrials.gov → GIGI Bulk Ingestor")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    print("=" * 60)
    print("  ClinicalTrials.gov → GIGI Bulk Ingestor")
    print(f"  Target: {args.host}")
    if args.limit:
        print(f"  Limit: {args.limit:,} studies")
    print("=" * 60)

    # Step 1: Connect
    print("\n── Step 1: Connect to GIGI ──")
    gigi = GigiClient(args.host, dry_run=args.dry_run)
    health = gigi.health()
    if "error" in health:
        print(f"  WARNING: GIGI not reachable at {args.host}")
        if not args.dry_run:
            sys.exit(1)
    else:
        print(f"  Connected: {health}")

    # Step 2: Create bundles
    print("\n── Step 2: Create GIGI bundles ──")
    progress = load_progress() if args.resume else {
        "page_token": None, "total_fetched": 0, "total_ingested": 0,
        "bundles_created": False,
    }

    if not progress.get("bundles_created"):
        create_bundles(gigi)
        progress["bundles_created"] = True
        save_progress(progress)

    # Step 3: Ingest studies
    print("\n── Step 3: Ingest clinical trials ──")
    print(f"  API: {API_BASE}")
    print(f"  Page size: {PAGE_SIZE}, Batch size: {BATCH_SIZE}")
    ingest_studies(gigi, progress, limit=args.limit)

    # Summary
    print("\n" + "=" * 60)
    print("  INGESTION COMPLETE")
    print(f"  Bundles created: {gigi.stats['bundles']}")
    print(f"  Records inserted: {gigi.stats['records']:,}")
    print(f"  Errors: {gigi.stats['errors']}")
    print("=" * 60)


if __name__ == "__main__":
    main()
