"""Patch HivApp.jsx on disk: add loadJsPDF, report builders, and download buttons."""
import os

path = r"c:\Users\nurdm\OneDrive\Documents\mirador\mirador-frontend\src\HivApp.jsx"
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

print(f"Original length: {len(text)}")
print(f"Has buildHivReportData: {'buildHivReportData' in text}")

# ── PATCH 1: version comment ──
text = text.replace(
    "// HivApp v3 \u2014 WASM dynamic import, no JS math functions",
    "// HivApp v4 \u2014 WASM dynamic import + PDF/JSON reports",
)

# ── PATCH 2: loadScript + loadJsPDF after FONT line ──
font_anchor = '''const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";'''
load_block = '''

// Load jsPDF + autotable from CDN on demand
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const s = document.createElement("script");
  s.src = src; s.onload = resolve; s.onerror = reject;
  document.head.appendChild(s);
});
async function loadJsPDF() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js");
  return window.jspdf.jsPDF;
}'''
text = text.replace(font_anchor, font_anchor + load_block)

# ── PATCH 3: report functions before `return (` ──
return_anchor = "  const shortfall = galt && galt.cTotal > 0 ? 1 / galt.cTotal : Infinity;\n\n  return ("
report_funcs = r'''  const shortfall = galt && galt.cTotal > 0 ? 1 / galt.cTotal : Infinity;

  // ── Report data builder ──
  const buildHivReportData = () => {
    const bestLra = lraIdx !== null ? LRAS[lraIdx] : { name: "AZD5153 (BET)", phi: 0.015, src: "Banerjee 2012" };
    return {
      meta: { engine: "MIRADOR HIV Reservoir Module", version: "1.0", generated: new Date().toISOString(), fitted_parameters: 0 },
      patient: { ...pt },
      regimen: activeDrugs.map(d => ({ name: d.name, abbr: d.abbr, class: d.cls, dose: d.dose, ic50: d.ic50, auc24: d.auc24, tau: wTau(DRUG_NAME_MAP[d.key]), refs: d.refs })),
      reservoirs: resData.map(r => ({
        name: r.full, key: r.key, latent_fraction: r.frac,
        c_combo_active: r.cA, bottleneck: r.bottleneck, phi_needed: r.phiNeeded,
        per_drug: r.drugRank.map(dr => ({ abbr: dr.abbr, R: dr.R, k_barrier: dr.kB, c_site: dr.c })),
      })),
      lra: { name: bestLra.name, phi: bestLra.phi, src: bestLra.src },
      cure_analysis: {
        s_geometry: sVal, clearance_order: clearOrder,
        galt_shortfall: shortfall > 1e10 ? "Infinity" : shortfall.toFixed(0) + "x",
        genital_clearable: resData.find(r => r.key === "genital")?.phiNeeded < 0.015,
      },
      sources: [
        "Kobayashi 2011", "Song 2015", "Letendre 2014", "Balzarini 1996", "Kearney 2004",
        "Patterson 2011", "Schinazi 1992", "Wang 2004", "Hendrix 2013", "De Meyer 2005",
        "Sekar 2010", "Croteau 2012", "Young 1995", "Csajka 2003", "Archin 2012",
        "Sogaard 2015", "Rasmussen 2014", "Schnell 2011", "Banga 2016", "Estes 2017",
        "Coombs 2003", "McNamara 2013", "Canestri 2010", "Peluso 2012", "Kim 2018",
      ],
    };
  };

  const handleDownloadJSON = () => {
    const data = buildHivReportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "HIV_Reservoir_Report.json";
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    const jsPDF = await loadJsPDF();
    const d = buildHivReportData();
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, CW = W - ML - MR;
    const NAVY = [15, 23, 42], SLATE = [51, 65, 85], GRAY = [100, 116, 139];
    const GREEN = [34, 197, 94], AMBER = [245, 158, 11], RED = [239, 68, 68];
    let y = 54;

    const sanitize = (s) => String(s ?? '')
      .replace(/\u2212/g, '-').replace(/\u2014/g, '--').replace(/\u2013/g, '-')
      .replace(/\u2265/g, '>=').replace(/\u2264/g, '<=').replace(/\u2248/g, '~')
      .replace(/\u221E/g, 'inf').replace(/\u03A6/g, 'Phi').replace(/\u03C4/g, 'tau')
      .replace(/\u2022/g, '-').replace(/\u2019/g, "'").replace(/\u2018/g, "'")
      .replace(/\u2191/g, '^').replace(/\u2193/g, 'v').replace(/\u2192/g, '->')
      .replace(/[\u2080-\u2089]/g, (c) => String(c.codePointAt(0) - 0x2080))
      .replace(/[^\x00-\xFF]/g, '');
    const hline = (yy, w = 1, color = NAVY) => { doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(ML, yy, W - MR, yy); };
    const addPage = () => { doc.addPage(); y = 54; };
    const checkY = (need = 60) => { if (y + need > H - 54) addPage(); };

    // Title
    doc.setFont("helvetica", "bold"); doc.setFontSize(18);
    doc.setTextColor(...NAVY); doc.text("MIRADOR HIV RESERVOIR REPORT", ML, y); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.setTextColor(...GRAY); doc.text(sanitize(`Generated: ${d.meta.generated} | Fitted parameters: 0`), ML, y); y += 18;
    hline(y); y += 16;

    // Patient
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setTextColor(...SLATE); doc.text("PATIENT PROFILE", ML, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(sanitize(`CD4: ${d.patient.cd4} | VL: ${d.patient.vl} | ART years: ${d.patient.artYears} | Weight: ${d.patient.weight}kg | Creatinine: ${d.patient.creatinine}`), ML, y);
    y += 18;

    // Regimen table
    checkY(80);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setTextColor(...SLATE); doc.text("ART REGIMEN", ML, y); y += 4;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "Class", "Dose", "IC50 (nM)", "AUC24 (nM-h)", "tau"]],
      body: d.regimen.map(dr => [sanitize(dr.name), dr.class, dr.dose, dr.ic50, dr.auc24.toLocaleString(), dr.tau.toFixed(2)]),
      styles: { fontSize: 8, cellPadding: 4, textColor: GRAY, lineColor: [30, 30, 48], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 15, 31], textColor: [148, 163, 184], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [12, 12, 24] },
    });
    y = doc.lastAutoTable.finalY + 16;

    // Reservoir analysis
    checkY(80);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setTextColor(...SLATE); doc.text("RESERVOIR ANALYSIS", ML, y); y += 4;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Reservoir", "Fraction", "C_active", "Bottleneck", "Phi needed", "Status"]],
      body: d.reservoirs.map(r => [
        sanitize(r.name), (r.latent_fraction * 100).toFixed(0) + "%", r.c_combo_active.toFixed(2),
        r.bottleneck, r.phi_needed > 100 ? ">1.0" : r.phi_needed.toFixed(4),
        r.c_combo_active >= 1 ? "SUPPRESSED" : "FAILING",
      ]),
      styles: { fontSize: 8, cellPadding: 4, textColor: GRAY, lineColor: [30, 30, 48], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 15, 31], textColor: [148, 163, 184], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [12, 12, 24] },
      didParseCell: (data) => {
        if (data.column.index === 5 && data.section === "body") {
          data.cell.styles.textColor = data.cell.raw === "SUPPRESSED" ? GREEN : RED;
          data.cell.styles.fontStyle = "bold";
        }
      },
    });
    y = doc.lastAutoTable.finalY + 16;

    // Per-drug per-reservoir detail
    checkY(80);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setTextColor(...SLATE); doc.text("DRUG x RESERVOIR DETAIL", ML, y); y += 4;
    const detailRows = [];
    d.reservoirs.forEach(r => {
      r.per_drug.forEach(dr => {
        detailRows.push([sanitize(r.name), dr.abbr, dr.R < 0.1 ? dr.R.toFixed(3) : dr.R.toFixed(2), dr.k_barrier.toFixed(2), dr.c >= 1 ? dr.c.toFixed(2) : dr.c.toFixed(3)]);
      });
    });
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Reservoir", "Drug", "R (penetration)", "K_barrier", "C_site"]],
      body: detailRows,
      styles: { fontSize: 7, cellPadding: 3, textColor: GRAY, lineColor: [30, 30, 48], lineWidth: 0.5 },
      headStyles: { fillColor: [15, 15, 31], textColor: [148, 163, 184], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [12, 12, 24] },
    });
    y = doc.lastAutoTable.finalY + 16;

    // Cure analysis
    checkY(100);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.setTextColor(...SLATE); doc.text("CURE ANALYSIS", ML, y); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    const ca = d.cure_analysis;
    doc.text(sanitize(`Geometry (S): ${(ca.s_geometry * 100).toFixed(0)}%`), ML, y); y += 12;
    doc.text(sanitize(`GALT shortfall: ${ca.galt_shortfall}`), ML, y); y += 12;
    doc.text(sanitize(`Genital tract clearable: ${ca.genital_clearable ? "YES" : "NO"}`), ML, y); y += 12;
    doc.text(sanitize(`Clearance order: ${ca.clearance_order.join(" -> ")}`), ML, y); y += 12;
    doc.text(sanitize(`Best LRA: ${d.lra.name} (Phi = ${d.lra.phi}) [${d.lra.src}]`), ML, y); y += 18;

    // Footer
    checkY(40);
    hline(y, 0.5, SLATE); y += 12;
    doc.setFontSize(7); doc.setTextColor(...SLATE);
    doc.text("DAVIS LAB | DAVIS GEOMETRIC | BRANCH XI", ML, y); y += 10;
    doc.text(sanitize("C = tau/K | The equation does not change. The manifold changes. The medicine follows."), ML, y); y += 10;
    doc.text("Zero fitted parameters. All values from published PK literature.", ML, y);

    doc.save("HIV_Reservoir_Report.pdf");
  };

  return ('''
text = text.replace(return_anchor, report_funcs)

# ── PATCH 4: download buttons after summary grid ──
grid_end_anchor = '''              <div style={{ fontSize: 7, color: "#64748b" }}>Fitted params</div>
              </div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #1a1a2e", textAlign: "center" }}>'''
buttons_block = '''              <div style={{ fontSize: 7, color: "#64748b" }}>Fitted params</div>
              </div>
            </div>

            {/* ── Download buttons ── */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={handleDownloadJSON} style={{
                flex: 1, padding: "10px 0", background: "#22c55e18", color: "#22c55e",
                border: "1px solid #22c55e44", borderRadius: 6, fontFamily: FONT, fontSize: 10,
                fontWeight: 700, letterSpacing: 2, cursor: "pointer",
              }}
                onMouseOver={e => e.currentTarget.style.background = "#22c55e28"}
                onMouseOut={e => e.currentTarget.style.background = "#22c55e18"}>
                ↓ JSON REPORT
              </button>
              <button onClick={handleDownloadPDF} style={{
                flex: 1, padding: "10px 0", background: "#3b82f618", color: "#3b82f6",
                border: "1px solid #3b82f644", borderRadius: 6, fontFamily: FONT, fontSize: 10,
                fontWeight: 700, letterSpacing: 2, cursor: "pointer",
              }}
                onMouseOver={e => e.currentTarget.style.background = "#3b82f628"}
                onMouseOut={e => e.currentTarget.style.background = "#3b82f618"}>
                ↓ PDF REPORT
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 8, color: "#334155", textAlign: "center" }}>
              Report includes: reservoir analysis · drug penetration · cure gap · clearance order · novel predictions
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #1a1a2e", textAlign: "center" }}>'''
text = text.replace(grid_end_anchor, buttons_block)

print(f"Patched length: {len(text)}")
print(f"Has buildHivReportData: {'buildHivReportData' in text}")
print(f"Has handleDownloadPDF: {'handleDownloadPDF' in text}")
print(f"Has handleDownloadJSON: {'handleDownloadJSON' in text}")
print(f"Has loadJsPDF: {'loadJsPDF' in text}")
print(f"Has JSON REPORT button: {'JSON REPORT' in text}")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(text)

print("File written to disk!")

# Verify
with open(path, "r", encoding="utf-8") as f:
    verify = f.read()
print(f"Verified on disk: buildHivReportData={'buildHivReportData' in verify}, handleDownloadPDF={'handleDownloadPDF' in verify}")
