#!/usr/bin/env python3
"""
GIGI Data Pipeline — Master Orchestrator
==========================================
Coordinates all data ingestors to build toward 1TB of
pharmacokinetic fiber bundle data in GIGI.

Usage:
  python ingest_all.py status                    # show current data inventory
  python ingest_all.py run                       # run all ingestors sequentially
  python ingest_all.py run --source chembl        # run just ChEMBL
  python ingest_all.py run --source bindingdb     # run just BindingDB
  python ingest_all.py run --limit 10000          # limit per source
  python ingest_all.py run --host localhost:3142   # target local GIGI

Data Sources (ordered by ROI):
  1. ChEMBL       — 20M bioactivities (~100GB)  ██████████
  2. BindingDB    — 2.7M bindings (~15GB)        ██
  3. PubChem      — 300M bioassays (~300GB)      ██████████████████████████████
  4. PDB          — 220K structures (~250GB)     █████████████████████████
  5. FDA FAERS    — 25M adverse events (~50GB)   █████████
  6. DrugBank     — 15K drugs (~5GB)             █
  7. PharmGKB     — PGx variants (~5GB)          █
  8. ClinTrials   — 450K trials (~10GB)          ██
  ─────────────────────────────────────────────
  Total target:                         ~750GB → 1TB with computed fibers
"""

from __future__ import annotations
import argparse, json, os, subprocess, sys, time
import urllib.request
from pathlib import Path

DEFAULT_HOST = "https://gigi-stream.fly.dev"
DATA_DIR = Path("data")
INVENTORY_FILE = DATA_DIR / "inventory.json"

SOURCES = [
    {
        "key": "pharma_universe",
        "name": "Pharma Universe (MIRADOR seed)",
        "script": "deploy_pharma_universe.py",
        "est_records": 207,
        "est_gb": 0.001,
        "status": "deployed",
    },
    {
        "key": "chembl",
        "name": "ChEMBL Bioactivities",
        "script": "ingest_chembl.py",
        "est_records": 20_000_000,
        "est_gb": 100,
        "status": "deployed",
    },
    {
        "key": "bindingdb",
        "name": "BindingDB Binding Measurements",
        "script": "ingest_bindingdb.py",
        "est_records": 2_700_000,
        "est_gb": 15,
        "status": "ready",
    },
    {
        "key": "pubchem",
        "name": "PubChem BioAssay",
        "script": "ingest_pubchem.py",
        "est_records": 300_000_000,
        "est_gb": 300,
        "status": "planned",
    },
    {
        "key": "pdb",
        "name": "Protein Data Bank (structures)",
        "script": "ingest_pdb.py",
        "est_records": 220_000,
        "est_gb": 250,
        "status": "planned",
    },
    {
        "key": "faers",
        "name": "FDA FAERS Adverse Events",
        "script": "ingest_faers.py",
        "est_records": 25_000_000,
        "est_gb": 50,
        "status": "planned",
    },
    {
        "key": "drugbank",
        "name": "DrugBank Drug Profiles",
        "script": "ingest_drugbank.py",
        "est_records": 15_000,
        "est_gb": 5,
        "status": "ready",
    },
    {
        "key": "pharmgkb",
        "name": "PharmGKB Pharmacogenomics",
        "script": "ingest_pharmgkb.py",
        "est_records": 500_000,
        "est_gb": 5,
        "status": "ready",
    },
    {
        "key": "clintrials",
        "name": "ClinicalTrials.gov Studies",
        "script": "ingest_clintrials.py",
        "est_records": 450_000,
        "est_gb": 10,
        "status": "ready",
    },
]


def get_gigi_stats(host):
    """Get current GIGI health/stats."""
    try:
        url = f"{host.rstrip('/')}/v1/health"
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}


def show_status(host):
    """Show current data inventory and progress toward 1TB."""
    print("\n" + "=" * 70)
    print("  GIGI DATA PIPELINE — Status")
    print("=" * 70)

    # Check GIGI
    stats = get_gigi_stats(host)
    if "error" in stats:
        print(f"\n  GIGI: OFFLINE ({stats['error']})")
    else:
        total_records = stats.get("total_records", "?")
        bundles = stats.get("bundles", "?")
        print(f"\n  GIGI: LIVE at {host}")
        print(f"  Bundles: {bundles}  |  Records: {total_records:,}" if isinstance(total_records, int) else f"  Bundles: {bundles}  |  Records: {total_records}")

    # Source inventory
    print(f"\n  {'Source':<35} {'Records':>12} {'Est. GB':>8} {'Status':>10}")
    print("  " + "─" * 67)

    total_est_gb = 0
    total_est_records = 0
    ready_gb = 0

    for s in SOURCES:
        total_est_gb += s["est_gb"]
        total_est_records += s["est_records"]
        status_icon = {
            "deployed": "✓ DONE",
            "ready": "● READY",
            "running": "⟳ RUNNING",
            "planned": "○ PLANNED",
        }.get(s["status"], s["status"])

        if s["status"] in ("deployed", "ready", "running"):
            ready_gb += s["est_gb"]

        print(f"  {s['name']:<35} {s['est_records']:>12,} {s['est_gb']:>7.1f}  {status_icon:>10}")

    print("  " + "─" * 67)
    print(f"  {'TOTAL':<35} {total_est_records:>12,} {total_est_gb:>7.0f}")

    # Progress bar
    target_tb = 1.0
    current_pct = ready_gb / (target_tb * 1024) * 100
    bar_width = 40
    filled = int(bar_width * current_pct / 100)
    bar = "█" * filled + "░" * (bar_width - filled)
    print(f"\n  Progress to 1 TB: [{bar}] {ready_gb:.0f} GB / {target_tb * 1024:.0f} GB ({current_pct:.1f}%)")
    print()


def run_source(source, host, limit=None, resume=False):
    """Run a single source ingestor."""
    script = source["script"]
    if not Path(script).exists():
        print(f"  SKIP: {script} not yet implemented")
        return False

    cmd = [sys.executable, script, "--host", host]
    if limit:
        cmd += ["--limit", str(limit)]
    if resume:
        cmd.append("--resume")

    print(f"\n{'=' * 60}")
    print(f"  Running: {source['name']}")
    print(f"  Script: {script}")
    print(f"  Command: {' '.join(cmd)}")
    print(f"{'=' * 60}\n")

    result = subprocess.run(cmd)
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser(description="GIGI Data Pipeline Orchestrator")
    parser.add_argument("action", choices=["status", "run"], help="Action to perform")
    parser.add_argument("--host", default=DEFAULT_HOST, help="GIGI host URL")
    parser.add_argument("--source", type=str, default=None,
                        help="Run specific source (chembl, bindingdb, etc.)")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit records per source")
    parser.add_argument("--resume", action="store_true",
                        help="Resume interrupted ingestion")
    args = parser.parse_args()

    if args.action == "status":
        show_status(args.host)
        return

    if args.action == "run":
        if args.source:
            # Run single source
            source = next((s for s in SOURCES if s["key"] == args.source), None)
            if not source:
                print(f"  Unknown source: {args.source}")
                print(f"  Available: {', '.join(s['key'] for s in SOURCES)}")
                sys.exit(1)
            run_source(source, args.host, limit=args.limit, resume=args.resume)
        else:
            # Run all ready sources
            for source in SOURCES:
                if source["status"] in ("ready", "running"):
                    run_source(source, args.host, limit=args.limit, resume=args.resume)


if __name__ == "__main__":
    main()
