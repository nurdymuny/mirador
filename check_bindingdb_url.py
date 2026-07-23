#!/usr/bin/env python3
"""Check which BindingDB download URL is currently valid."""
import urllib.request

urls = [
    # New YYYYMM naming convention (from download page)
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_202603.tsv.zip",
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_202602.tsv.zip",
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_202601.tsv.zip",
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_202512.tsv.zip",
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_202509.tsv.zip",
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_202506.tsv.zip",
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_202503.tsv.zip",
    # JSP redirect pattern
    "https://www.bindingdb.org/bind/chemsearch/marvin/SDFdownload.jsp?download_file=/bind/downloads/BindingDB_All_202603.tsv.zip",
    # Old m-style naming
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_2025m3.tsv.zip",
    "https://www.bindingdb.org/bind/downloads/BindingDB_All_2024m12.tsv.zip",
]

for u in urls:
    fname = u.rsplit("/", 1)[-1]
    try:
        r = urllib.request.Request(u, method="HEAD")
        r.add_header("User-Agent", "Mozilla/5.0")
        resp = urllib.request.urlopen(r, timeout=10)
        size_mb = int(resp.headers.get("Content-Length", 0)) / (1024 * 1024)
        print(f"  FOUND: {fname} ({size_mb:.0f} MB)")
        break
    except Exception as e:
        code = getattr(e, "code", "?")
        print(f"  {code}: {fname}")
else:
    print("  All URLs returned errors")
