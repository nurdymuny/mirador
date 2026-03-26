"""Remove duplicate loadScript/loadJsPDF block from HivApp.jsx."""
path = r"c:\Users\nurdm\OneDrive\Documents\mirador\mirador-frontend\src\HivApp.jsx"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# The first copy is at lines 13-24 (from the git commit), second at lines 26-37 (from patch).
# Remove the second copy by finding the duplicate block.
# The duplicate starts with the second occurrence of "// Load jsPDF"
first = text.find("// Load jsPDF + autotable from CDN on demand")
if first < 0:
    print("ERROR: Can't find loadJsPDF block")
    exit(1)

second = text.find("// Load jsPDF + autotable from CDN on demand", first + 1)
if second < 0:
    print("No duplicate found. Already clean.")
    exit(0)

# Find the end of the second loadJsPDF block (ends with "}\n")
# The block is: from "// Load jsPDF..." to the closing "}" of loadJsPDF()
end_marker = "  return window.jspdf.jsPDF;\n}"
end_pos = text.find(end_marker, second)
if end_pos < 0:
    print("ERROR: Can't find end of duplicate block")
    exit(1)

# Remove from the newline before "// Load jsPDF" to end of block + newline
remove_start = text.rfind("\n", 0, second)  # newline before the comment
remove_end = end_pos + len(end_marker) + 1  # +1 for trailing newline

duplicate = text[remove_start:remove_end]
print(f"Removing duplicate block ({len(duplicate)} chars):")
print(duplicate[:200] + "...")

text = text[:remove_start] + text[remove_end:]

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)

print(f"\nFixed! New length: {len(text)}")

# Count occurrences
count = text.count("loadJsPDF")
print(f"loadJsPDF occurrences: {count}")
