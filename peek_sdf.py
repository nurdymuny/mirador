#!/usr/bin/env python3
"""Peek at first 2 records of BindingDB SDF to understand structure."""
import sys

path = "data/BindingDB_2D/BindingDB_All_2D.sdf"
f = open(path, "r", encoding="utf-8", errors="replace")

lines = []
records = 0
for line in f:
    lines.append(line)
    if line.strip() == "$$$$":
        records += 1
        if records >= 2:
            break
f.close()

print(f"Lines in first 2 records: {len(lines)}")
print("--- FIRST 2 RECORDS ---")
for l in lines:
    print(l, end="")

# Also extract just the property names from first record
print("\n--- PROPERTY NAMES (first record) ---")
in_prop = False
for l in lines:
    if l.startswith("> <"):
        prop_name = l.strip().strip("> <").rstrip(">")
        print(f"  {prop_name}")
    if l.strip() == "$$$$":
        break
