$f = Resolve-Path "c:\Users\nurdm\OneDrive\Documents\mirador\mirador-frontend\src\HivApp.jsx"
$text = [System.IO.File]::ReadAllText($f)

# 1. Update version comment
$text = $text.Replace(
  '// HivApp v3 — WASM dynamic import, no JS math functions',
  '// HivApp v4 — WASM dynamic import + PDF/JSON reports'
)

# 2. Insert loadScript + loadJsPDF after FONT line
$fontLine = "const FONT = `"'JetBrains Mono', 'Fira Code', 'SF Mono', monospace`";"
$loadJsPDF = @"

// Load jsPDF + autotable from CDN on demand
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(``script[src="`${src}"]``)) return resolve();
  const s = document.createElement("script");
  s.src = src; s.onload = resolve; s.onerror = reject;
  document.head.appendChild(s);
});
async function loadJsPDF() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js");
  return window.jspdf.jsPDF;
}
"@

$text = $text.Replace($fontLine, $fontLine + $loadJsPDF)

Write-Output "Patch 1+2 applied: $($text.Contains('loadJsPDF'))"

[System.IO.File]::WriteAllText($f, $text)
Write-Output "File written. Contains buildHiv: $($text.Contains('buildHivReportData'))"
