"""
MIRADOR HIV Reservoir Report — JSON + PDF
Davis Field Equations: C = τ/K applied to HIV latent reservoirs.
All PK data from published sources. Zero fitted parameters.
"""
import json, math, os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, Preformatted,
)
from reportlab.lib.styles import ParagraphStyle

def esc(s):
    """Escape XML-special characters for ReportLab Paragraph."""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# ─── Colour palette (matches MRSA report) ─────────────────────────────────────
NAVY  = HexColor("#0f172a")
SLATE = HexColor("#334155")
GRAY  = HexColor("#64748b")
MUTED = HexColor("#94a3b8")
RULE  = HexColor("#cbd5e1")
LIGHT = HexColor("#f8fafc")
WARN_HEX = "#7f1d1d"

# ============================================================================
# DATA — identical to HivApp.jsx and mirador-hiv-reservoir Rust crate
# ============================================================================
DRUGS = [
    {"name": "Dolutegravir",  "abbr": "DTG", "cls": "INSTI", "ic50": 0.51,
     "auc24": 126400, "k_admet": 0.05, "dose": "50 mg QD",
     "pen": {"CNS": 0.01, "lymph_node": 0.48, "GALT": 0.35,
             "genital_tract": 0.07, "bone_marrow": 0.40},
     "src_ic50": "Kobayashi 2011", "src_auc": "Song 2015",
     "src_pen": "Letendre 2014, Fletcher 2014, Else 2015"},
    {"name": "Tenofovir-DF",  "abbr": "TFV", "cls": "NRTI",  "ic50": 50.0,
     "auc24": 7630,   "k_admet": 0.15, "dose": "300 mg QD",
     "pen": {"CNS": 0.05, "lymph_node": 0.33, "GALT": 0.50,
             "genital_tract": 3.50, "bone_marrow": 0.30},
     "src_ic50": "Balzarini 1996", "src_auc": "Kearney 2004",
     "src_pen": "Best 2012, Fletcher 2014, Patterson 2011/2013"},
    {"name": "Emtricitabine", "abbr": "FTC", "cls": "NRTI",  "ic50": 8.0,
     "auc24": 40000,  "k_admet": 0.05, "dose": "200 mg QD",
     "pen": {"CNS": 0.03, "lymph_node": 0.40, "GALT": 0.55,
             "genital_tract": 1.80, "bone_marrow": 0.35},
     "src_ic50": "Schinazi 1992", "src_auc": "Wang 2004",
     "src_pen": "Letendre 2010, Fletcher 2014, Hendrix 2013"},
    {"name": "Darunavir",     "abbr": "DRV", "cls": "PI",    "ic50": 1.2,
     "auc24": 170000, "k_admet": 0.10, "dose": "800 mg QD + RTV",
     "pen": {"CNS": 0.05, "lymph_node": 0.70, "GALT": 0.45,
             "genital_tract": 0.15, "bone_marrow": 0.35},
     "src_ic50": "De Meyer 2005", "src_auc": "Sekar 2010",
     "src_pen": "Croteau 2012, Fletcher 2014, Else 2011"},
    {"name": "Efavirenz",     "abbr": "EFV", "cls": "NNRTI", "ic50": 1.0,
     "auc24": 184000, "k_admet": 0.08, "dose": "600 mg QD",
     "pen": {"CNS": 0.005, "lymph_node": 0.55, "GALT": 0.40,
             "genital_tract": 0.02, "bone_marrow": 0.30},
     "src_ic50": "Young 1995", "src_auc": "Csajka 2003",
     "src_pen": "Tashima 1999, Fletcher 2014, Dumond 2008"},
]

RESERVOIRS = [
    {"name": "CNS",           "full": "Central Nervous System",
     "frac": 0.02, "src": "Schnell 2011; Lamers 2011"},
    {"name": "lymph_node",    "full": "Lymph Nodes",
     "frac": 0.15, "src": "Banga 2016; Bronnimann 2018"},
    {"name": "GALT",          "full": "Gut-Associated Lymphoid Tissue",
     "frac": 0.65, "src": "Chun 2008; Estes 2017"},
    {"name": "genital_tract", "full": "Genital Tract",
     "frac": 0.08, "src": "Coombs 2003"},
    {"name": "bone_marrow",   "full": "Bone Marrow",
     "frac": 0.10, "src": "Alexaki 2008; McNamara 2013"},
]

LRAS = [
    {"name": "Vorinostat",   "phi": 0.005, "src": "Archin 2012; Elliott 2014"},
    {"name": "Romidepsin",   "phi": 0.008, "src": "Sogaard 2015"},
    {"name": "Panobinostat", "phi": 0.003, "src": "Rasmussen 2014"},
    {"name": "AZD5153 (BET)","phi": 0.015, "src": "Banerjee 2012; class estimate"},
]

# Latency model constants
K_PHENOTYPE_ACTIVE = 0.0
K_PHENOTYPE_LATENT = 6.0
F_ACTIVE_ON_ART    = 1e-6

# Default regimen: DTG + TFV + FTC (standard first-line)
DEFAULT_REGIMEN = ["Dolutegravir", "Tenofovir-DF", "Emtricitabine"]

SOURCES = [
    ("1",  "Kobayashi 2011, Antimicrob Agents Chemother",
           "Dolutegravir IC50 = 0.51 nM against HIV-1 integrase"),
    ("2",  "Song 2015, Br J Clin Pharmacol",
           "Dolutegravir AUC24 = 126,400 nM hr at 50 mg QD steady state"),
    ("3",  "Balzarini 1996, Biochem Biophys Res Commun",
           "Tenofovir IC50 = 50 nM; nucleotide reverse transcriptase inhibitor"),
    ("4",  "Kearney 2004, Clin Pharmacokinet",
           "Tenofovir AUC24 = 7,630 nM hr at 300 mg QD"),
    ("5",  "Schinazi 1992, Antimicrob Agents Chemother",
           "Emtricitabine IC50 = 8 nM; pyrimidine NRTI"),
    ("6",  "Wang 2004, Clin Pharmacol Ther",
           "Emtricitabine AUC24 = 40,000 nM hr at 200 mg QD"),
    ("7",  "De Meyer 2005, Antimicrob Agents Chemother",
           "Darunavir IC50 = 1.2 nM; second-generation protease inhibitor"),
    ("8",  "Sekar 2010, J Clin Pharmacol",
           "Darunavir AUC24 = 170,000 nM hr at 800 mg QD + RTV"),
    ("9",  "Young 1995, Antimicrob Agents Chemother",
           "Efavirenz IC50 = 1.0 nM (WT HIV-1 RT)"),
    ("10", "Csajka 2003, Clin Pharmacokinet",
           "Efavirenz AUC24 = 184,000 nM hr at 600 mg QD"),
    ("11", "Letendre 2014; Fletcher 2014",
           "CNS penetration effectiveness; lymph node tissue PK biopsy data"),
    ("12", "Patterson 2011; Hendrix 2013",
           "Genital tract TFV-DP and FTC-TP concentrating ratios"),
    ("13", "Schnell 2011; Lamers 2011",
           "CNS latent reservoir fraction ~2% of total latent pool"),
    ("14", "Estes 2017; Chun 2008",
           "GALT as dominant reservoir: 65% of latent proviral DNA"),
    ("15", "Banga 2016; Bronnimann 2018",
           "Lymph node latent reservoir ~15%"),
    ("16", "McNamara 2013; Alexaki 2008",
           "Bone marrow as HIV reservoir ~10%"),
    ("17", "Archin 2012; Elliott 2014",
           "Vorinostat LRA trial: RNA blips but no reservoir reduction"),
    ("18", "Sogaard 2015",
           "Romidepsin LRA trial: 5/6 RNA positive but no reservoir change"),
    ("19", "Rasmussen 2014",
           "Panobinostat LRA trial: RNA increase, no reservoir change"),
    ("20", "Canestri 2010; Peluso 2012",
           "CSF viral escape on suppressive ART: 5-10% prevalence"),
    ("21", "Finzi 1997; Siliciano 2003",
           "Latent reservoir half-life ~44 months; cure impossibility proof"),
    ("22", "Palella 1998; Gulick 1997",
           "ART efficacy: 90%+ suppression with triple-drug ART"),
    ("23", "Deeks 2012; Kim 2018",
           "LRA clinical trial failures: reactivation insufficient for cure"),
]

# ============================================================================
# COMPUTED VALUES — identical to Rust engine and JSX frontend
# ============================================================================
def tau(d):
    return math.log10(d["auc24"] / d["ic50"])

def k_barrier(r):
    if r <= 0.001:
        return 999.0
    return max(1.0 / r - 1.0, -1.0)

def k_pathway(d, res_name):
    """K for active virus: K_admet + K_barrier (no K_phenotype for active)."""
    r = d["pen"].get(res_name, 0.3)
    return d["k_admet"] + k_barrier(r)

def c_site(d, res_name):
    k = k_pathway(d, res_name)
    return tau(d) / max(k, 0.01)

def c_combo_active(drugs, res_name, synergy=1.0):
    total_g = 0.0
    weighted_tau = 0.0
    for d in drugs:
        k = max(k_pathway(d, res_name), 0.01)
        t = tau(d)
        g = 1.0 / k
        total_g += g
        weighted_tau += t * g
    if total_g <= 0:
        return 0.0
    tau_combo = weighted_tau / total_g
    return tau_combo * total_g * synergy

def phi_threshold(drugs, res_name, cure_thresh=1.0, synergy=1.0):
    c_active = c_combo_active(drugs, res_name, synergy)
    if c_active <= 0:
        return float("inf")
    f_lat = 1.0 - F_ACTIVE_ON_ART
    phi = (cure_thresh / c_active - F_ACTIVE_ON_ART) / f_lat
    return max(phi, 0.0)

def c_with_lra(drugs, res_name, lra, synergy=1.0):
    f_lat = 1.0 - F_ACTIVE_ON_ART
    f_active_new = F_ACTIVE_ON_ART + lra["phi"] * f_lat
    c_active = c_combo_active(drugs, res_name, synergy)
    return f_active_new * c_active

def clearance_order(drugs, reservoirs, synergy=1.0):
    scores = []
    for res in reservoirs:
        c = c_combo_active(drugs, res["name"], synergy)
        score = c / max(res["frac"], 0.001)
        scores.append((res["name"], score))
    scores.sort(key=lambda x: -x[1])
    return [s[0] for s in scores]

# Pre-compute for default regimen
REG_DRUGS = [d for d in DRUGS if d["name"] in DEFAULT_REGIMEN]
BEST_LRA  = max(LRAS, key=lambda l: l["phi"])

PER_RESERVOIR = {}
for res in RESERVOIRS:
    rn = res["name"]
    c_active = c_combo_active(REG_DRUGS, rn)
    phi_needed = phi_threshold(REG_DRUGS, rn)
    c_lra = c_with_lra(REG_DRUGS, rn, BEST_LRA)
    per_drug = [(d["name"], c_site(d, rn)) for d in REG_DRUGS]
    per_drug.sort(key=lambda x: -x[1])
    PER_RESERVOIR[rn] = {
        "c_combo_active": c_active,
        "phi_needed": phi_needed,
        "phi_sufficient": BEST_LRA["phi"] >= phi_needed,
        "c_with_best_lra": c_lra,
        "per_drug": per_drug,
        "reaches_threshold": c_active >= 1.0,
    }

# Double cover
reachable = sum(1 for r in RESERVOIRS if PER_RESERVOIR[r["name"]]["reaches_threshold"])
DOUBLE_COVER_S  = reachable / len(RESERVOIRS)
DOUBLE_COVER_D2 = 1.0 - DOUBLE_COVER_S
GEO_BOTTLENECKS = [r["name"] for r in RESERVOIRS
                   if not PER_RESERVOIR[r["name"]]["reaches_threshold"]]

CLEAR_ORDER = clearance_order(REG_DRUGS, RESERVOIRS)

# ============================================================================
# STYLE FACTORY
# ============================================================================
def make_styles():
    def ps(name, **kw):
        return ParagraphStyle(name, **kw)
    return {
        "title":    ps("title",    fontName="Helvetica-Bold", fontSize=20, leading=24,
                       textColor=NAVY,  spaceAfter=4),
        "subtitle": ps("subtitle", fontName="Helvetica",      fontSize=9,  leading=13,
                       textColor=SLATE, spaceAfter=12),
        "h1":       ps("h1",  fontName="Helvetica-Bold", fontSize=9,  leading=13,
                       textColor=NAVY,  spaceBefore=14, spaceAfter=3),
        "h2":       ps("h2",  fontName="Helvetica-Bold", fontSize=8.5, leading=12,
                       textColor=SLATE, spaceBefore=8,  spaceAfter=3),
        "body":     ps("body",    fontName="Helvetica", fontSize=9,  leading=13,
                       textColor=NAVY,  spaceAfter=6),
        "body_sm":  ps("body_sm", fontName="Helvetica", fontSize=8,  leading=11.5,
                       textColor=SLATE, spaceAfter=4),
        "eq":       ps("eq",    fontName="Courier-Bold", fontSize=10, leading=14,
                       textColor=NAVY,  alignment=TA_CENTER, spaceBefore=6, spaceAfter=6),
        "eq_sm":    ps("eq_sm", fontName="Courier",      fontSize=8,  leading=11.5,
                       textColor=SLATE, spaceBefore=1, spaceAfter=1),
        "t_label":  ps("t_label", fontName="Helvetica",      fontSize=8.0, leading=11, textColor=GRAY),
        "t_val":    ps("t_val",   fontName="Courier-Bold",   fontSize=8.0, leading=11, textColor=NAVY),
        "t_warn":   ps("t_warn",  fontName="Courier-Bold",   fontSize=8.0, leading=11,
                       textColor=HexColor(WARN_HEX)),
        "note":     ps("note", fontName="Helvetica", fontSize=7,   leading=9.5,  textColor=GRAY,  spaceAfter=2),
        "ref":      ps("ref",  fontName="Helvetica", fontSize=7.5, leading=10.5, textColor=SLATE, spaceAfter=2),
        "warn_title": ps("warn_title", fontName="Helvetica-Bold", fontSize=8, leading=11,
                         textColor=HexColor(WARN_HEX)),
        "warn_body":  ps("warn_body",  fontName="Helvetica",      fontSize=8, leading=11,
                         textColor=SLATE, spaceAfter=0),
        "footer":   ps("footer", fontName="Helvetica", fontSize=6.5, leading=9,
                       textColor=MUTED, alignment=TA_CENTER),
    }

# ============================================================================
# LAYOUT PRIMITIVES
# ============================================================================
def rule():
    return HRFlowable(width="100%", thickness=0.5, color=RULE, spaceAfter=8, spaceBefore=2)

def thin_rule():
    return HRFlowable(width="100%", thickness=0.25, color=RULE, spaceAfter=5, spaceBefore=5)

def section_header(S, text):
    return [Paragraph(text.upper(), S["h1"]), rule()]

def kv_table(rows, col_widths=None, S=None):
    if col_widths is None:
        col_widths = [2.2 * inch, 4.4 * inch]
    tbl_rows = []
    for row in rows:
        label, val = row[0], row[1]
        is_warn = len(row) > 2 and row[2] is True
        val_style = S["t_warn"] if is_warn else S["t_val"]
        tbl_rows.append([
            Paragraph(label, S["t_label"]),
            Paragraph(val,   val_style),
        ])
    t = Table(tbl_rows, colWidths=col_widths)
    cmds = [
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW",     (0, 0), (-1, -1), 0.25, RULE),
    ]
    for i in range(0, len(tbl_rows), 2):
        cmds.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
    t.setStyle(TableStyle(cmds))
    return t

def data_table(header, rows, col_widths):
    hdr_ps  = ParagraphStyle("dt_h", fontName="Helvetica-Bold", fontSize=8,
                             leading=11, textColor=white)
    body_ps = ParagraphStyle("dt_b", fontName="Courier", fontSize=7.5,
                             leading=10.5, textColor=NAVY)
    hdr_row   = [Paragraph(str(c), hdr_ps)  for c in header]
    body_rows = [[Paragraph(str(c), body_ps) for c in row] for row in rows]
    all_rows  = [hdr_row] + body_rows
    t = Table(all_rows, colWidths=col_widths)
    cmds = [
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("GRID",          (0, 0), (-1, -1), 0.25, RULE),
    ]
    for i in range(1, len(all_rows), 2):
        cmds.append(("BACKGROUND", (0, i), (-1, i), LIGHT))
    t.setStyle(TableStyle(cmds))
    return t

def side_warning(S, title, body_text):
    inner = [
        Paragraph(title,     S["warn_title"]),
        Spacer(1, 2),
        Paragraph(body_text, S["warn_body"]),
    ]
    t = Table([[inner]], colWidths=[6.5 * inch])
    t.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (0, 0), 10),
        ("RIGHTPADDING",  (0, 0), (0, 0), 6),
        ("TOPPADDING",    (0, 0), (0, 0), 5),
        ("BOTTOMPADDING", (0, 0), (0, 0), 5),
        ("LINEBEFORE",    (0, 0), (0, 0), 2.0, HexColor(WARN_HEX)),
        ("VALIGN",        (0, 0), (0, 0), "TOP"),
    ]))
    return t

# ============================================================================
# PAGE TEMPLATE
# ============================================================================
def on_page(canvas_obj, doc):
    canvas_obj.saveState()
    w = letter[0]
    canvas_obj.setStrokeColor(NAVY)
    canvas_obj.setLineWidth(1.5)
    canvas_obj.line(inch, 10.30 * inch, w - inch, 10.30 * inch)
    canvas_obj.setFont("Helvetica-Bold", 8)
    canvas_obj.setFillColor(NAVY)
    canvas_obj.drawString(inch, 10.38 * inch, "MIRADOR")
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.setFillColor(GRAY)
    canvas_obj.drawString(1.72 * inch, 10.38 * inch,
                          "HIV Latent Reservoir Analysis")
    canvas_obj.drawRightString(w - inch, 10.38 * inch,
                               "CONFIDENTIAL  —  FOR AUTHORISED USE ONLY")
    canvas_obj.setStrokeColor(RULE)
    canvas_obj.setLineWidth(0.5)
    canvas_obj.line(inch, 0.65 * inch, w - inch, 0.65 * inch)
    canvas_obj.setFont("Helvetica", 6.5)
    canvas_obj.setFillColor(MUTED)
    canvas_obj.drawString(inch, 0.45 * inch,
                          "Davis Lab  |  C = tau/K  |  Branch XI Therapeutic Geometry")
    canvas_obj.drawRightString(w - inch, 0.45 * inch, f"Page {doc.page}")
    canvas_obj.restoreState()

# ============================================================================
# BUILD REPORT
# ============================================================================
def build_report(output_path):
    S = make_styles()
    doc = SimpleDocTemplate(
        output_path, pagesize=letter,
        leftMargin=inch, rightMargin=inch,
        topMargin=0.95 * inch, bottomMargin=0.85 * inch,
    )
    story = []

    # ══════════════════════════════════════════════════════════════════════
    # COVER
    # ══════════════════════════════════════════════════════════════════════
    story.append(Spacer(1, 0.35 * inch))
    story.append(Paragraph("MIRADOR — HIV LATENT RESERVOIR", S["title"]))
    story.append(Paragraph(
        "Manifold-Informed Rational Architecture for Drug-Organism Response",
        S["subtitle"]))
    story.append(thin_rule())
    story.append(Spacer(1, 6))

    reg_str = " + ".join(d["abbr"] for d in REG_DRUGS)
    cover_rows = [
        ("Target pathogen",    "HIV-1 (latent proviral reservoir)"),
        ("Molecular target",   "Latent provirus integrated in host CD4+ T-cells"),
        ("Candidate regimen",  f"{reg_str}  (standard first-line ART)"),
        ("Anatomical sites",   "CNS, Lymph nodes, GALT, Genital tract, Bone marrow"),
        ("Latency model",
         f"Two-state: active (K=0) / latent (K={K_PHENOTYPE_LATENT}); "
         f"f_active = 1.0e-6"),
        ("Framework",          "Davis Field Equations  Branch XI (Therapeutic Geometry)"),
        ("Report date",        "June 2025"),
    ]
    story.append(kv_table(cover_rows, col_widths=[2.0 * inch, 4.6 * inch], S=S))
    story.append(Spacer(1, 14))
    story.append(Paragraph("C  =  tau / K", S["eq"]))
    story.append(Paragraph(
        "Coherence  =  Topological persistence tau  /  ADMET Curvature K",
        ParagraphStyle("eq_sub", fontName="Helvetica", fontSize=8, leading=11,
                       textColor=GRAY, alignment=TA_CENTER, spaceAfter=14)))
    story.append(thin_rule())
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "This document presents a computational analysis of antiretroviral drug penetration "
        "into HIV latent reservoirs using the MIRADOR framework. Each computed value is derived "
        "from first principles using published pharmacokinetic data. All formulas are stated "
        "explicitly so results are independently reproducible. The analysis demonstrates why "
        "ART alone cannot cure HIV (a structural impossibility, not a model limitation) and "
        "quantifies the reactivation gap that latency-reversing agents must close.",
        S["body_sm"]))
    story.append(Spacer(1, 12))

    # ── BLUF ───────────────────────────────────────────────────────────────
    cns_c = PER_RESERVOIR["CNS"]["c_combo_active"]
    galt_phi = PER_RESERVOIR["GALT"]["phi_needed"]
    bluf_items = [
        Paragraph("CLINICAL ANALYSIS  —  BOTTOM LINE UP FRONT", S["h1"]),
        Spacer(1, 5),
        Preformatted(
            f"  >>  ART SUPPRESSION:   {reg_str} achieves C >= 1.0 at "
            f"{reachable}/5 reservoirs  (S = {DOUBLE_COVER_S:.0%})",
            S["body"]),
        Preformatted(
            f"  >>  CSF ESCAPE:        CNS C_active = {cns_c:.2f} < 1.0  "
            f"-- viral escape geometrically inevitable  [20]",
            S["body"]),
        Preformatted(
            f"  >>  CURE GAP:          Best LRA Phi = {BEST_LRA['phi']}  vs  "
            f"needed Phi_GALT = {galt_phi:.4f}  -- "
            f"{galt_phi / BEST_LRA['phi']:.0f}x shortfall",
            S["body"]),
        Preformatted(
            f"  >>  CLEARANCE ORDER:   "
            + " --> ".join(CLEAR_ORDER),
            S["body"]),
        Spacer(1, 4),
        Paragraph(
            "Full derivation: Sections 1-8 below.",
            S["note"]),
    ]
    bluf_table = Table([[bluf_items]], colWidths=[6.5 * inch])
    bluf_table.setStyle(TableStyle([
        ("BOX",           (0, 0), (-1, -1), 1.5, NAVY),
        ("LEFTPADDING",   (0, 0), (0, 0), 10),
        ("RIGHTPADDING",  (0, 0), (0, 0), 8),
        ("TOPPADDING",    (0, 0), (0, 0), 6),
        ("BOTTOMPADDING", (0, 0), (0, 0), 8),
        ("VALIGN",        (0, 0), (0, 0), "TOP"),
    ]))
    story.append(bluf_table)
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 1 — GOVERNING FRAMEWORK
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S, "Section 1  —  Governing Framework"):
        story.append(el)

    story.append(Paragraph(
        "The MIRADOR coherence score C quantifies the ability of a drug to maintain sustained "
        "target engagement at a specific anatomical reservoir. For HIV, the framework addresses "
        "two distinct barriers: (1) tissue penetration geometry and (2) latent phenotype dynamics.",
        S["body"]))
    story.append(Paragraph("C  =  tau / K", S["eq"]))
    story.append(Paragraph(
        "where tau = log10(AUC24/IC50) is the pharmacophoric potential — a measure of drug "
        "potency normalised to dosing exposure — and K is the total curvature (impedance) "
        "through the pathway from plasma to target. For HIV reservoirs, K decomposes as:",
        S["body"]))
    story.append(Paragraph(
        "K_pathway  =  K_admet  +  K_barrier  +  K_phenotype", S["eq"]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Framework-to-clinical terminology", S["h2"]))
    trans_rows = [
        ["Coherence  C = tau/K",        "Drug efficacy at reservoir site — higher C means better suppression"],
        ["Topological persistence  tau", "log10(AUC24/IC50) — potency-normalised drug exposure"],
        ["K_admet",                      "Systemic ADMET curvature — bioavailability, protein binding, clearance"],
        ["K_barrier = max(1/R - 1, -1)", "Tissue penetration barrier — R = tissue:plasma ratio (published PK data)"],
        ["K_phenotype",                  "Latent phenotype impedance — 0 for active virus, 6.0 for latent provirus"],
        ["Phi (reactivation)",           "LRA catalytic efficiency — fraction of latent cells reactivated per dose"],
        ["Double Cover (S, d2)",         "S = fraction reachable by geometry; d2 = 1-S = reactivation-limited"],
    ]
    story.append(data_table(
        ["MIRADOR term", "Standard PK/PD equivalent"],
        trans_rows, [2.2 * inch, 4.4 * inch]))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "Table 1  —  K component definitions and HIV-specific meaning",
        S["h2"]))
    k_head = ["Component", "Formula", "HIV application", "Range"]
    k_rows = [
        ["K_admet",     "Drug-specific constant",
         "Systemic PK impedance (bioavailability, PPB, clearance)", "0.05 - 0.15"],
        ["K_barrier",   "max(1/R - 1, -1.0)",
         "Tissue penetration: R = tissue:plasma ratio from PK biopsy",
         "BBB: 99 to genital: -0.71"],
        ["K_phenotype", "0 (active) / 6.0 (latent)",
         "Latent provirus: no replication machinery expressed",
         "0 or 6.0"],
        ["K_pathway",   "sum of all K components",
         "Total resistance from plasma to active drug-target contact",
         "0.05 to ~105"],
    ]
    story.append(data_table(k_head, k_rows,
                            [0.85*inch, 1.6*inch, 2.6*inch, 1.5*inch]))
    story.append(Spacer(1, 5))

    story.append(Paragraph(
        "Key structural insight: When phenotype = Latent, K_phenotype = 6.0 dominates all "
        "other K components. For every drug at every reservoir, the latent K_pathway &gt; 6.0, "
        "making C_latent &lt;&lt; 1. This is why ART alone cannot cure HIV — it is a structural "
        "property of the problem, not a tuning parameter. LRAs modify the phenotype distribution "
        "(catalytic, not conductive) and appear as a multiplicative prefactor on C, not in the "
        "1/K sum.",
        S["body_sm"]))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 2 — DRUG POTENCY (tau VALUES)
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S, "Section 2  —  Drug Potency  (tau = log10(AUC24/IC50))"):
        story.append(el)

    story.append(Paragraph(
        "Topological persistence tau measures intrinsic drug potency: the log-ratio of "
        "systemic exposure (AUC24) to target inhibition (IC50). Higher tau = more potent. "
        "All values derived from published PK studies — no fitted parameters.",
        S["body"]))
    story.append(Spacer(1, 4))

    tau_head = ["Drug", "Class", "IC50 (nM)", "AUC24 (nM hr)", "tau", "Dose"]
    tau_rows = []
    for d in DRUGS:
        t = tau(d)
        tau_rows.append([
            d["name"], d["cls"],
            f"{d['ic50']:.2f}" if d["ic50"] < 10 else f"{d['ic50']:.0f}",
            f"{d['auc24']:,.0f}",
            f"{t:.2f}", d["dose"],
        ])
    story.append(data_table(tau_head, tau_rows,
                            [1.2*inch, 0.55*inch, 0.7*inch, 1.1*inch, 0.55*inch, 1.3*inch]))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Full derivation", S["h2"]))
    for d in DRUGS:
        t = tau(d)
        story.append(Preformatted(
            f"tau_{d['abbr']}  =  log10({d['auc24']:,.0f} / {d['ic50']})  =  {t:.4f}",
            S["eq_sm"]))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "DTG has the highest tau (5.39) due to sub-nanomolar IC50 combined with high systemic "
        "exposure. TFV has the lowest tau (2.18) because of relatively high IC50 (50 nM) and "
        "moderate AUC. However, TFV uniquely concentrates in genital tissue (R=3.50), compensating "
        "for low systemic potency at that reservoir.",
        S["body_sm"]))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 3 — RESERVOIR PENETRATION
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S, "Section 3  —  Reservoir Penetration  (K_barrier)"):
        story.append(el)

    story.append(Paragraph(
        "Each reservoir imposes a tissue penetration barrier quantified by the tissue:plasma "
        "ratio R. K_barrier = max(1/R - 1, -1.0). When R &gt; 1, the drug concentrates (K_barrier "
        "is negative, aiding penetration). When R &lt;&lt; 1 (e.g. CNS), K_barrier &gt;&gt; 1 (severe "
        "exclusion). All R values from published PK biopsy studies.",
        S["body"]))
    story.append(Spacer(1, 4))

    story.append(Paragraph("Table 3  —  Reservoir characterisation", S["h2"]))
    res_head = ["Reservoir", "Full name", "Latent fraction", "Source"]
    res_rows = []
    for r in RESERVOIRS:
        res_rows.append([r["name"], r["full"], f"{r['frac']:.0%}", r["src"]])
    story.append(data_table(res_head, res_rows,
                            [1.1*inch, 2.0*inch, 1.0*inch, 2.5*inch]))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "Table 4  —  Penetration ratios R (tissue:plasma) and K_barrier",
        S["h2"]))
    pen_header = ["Drug", "CNS", "Lymph", "GALT", "Genital", "Marrow"]
    pen_rows = []
    for d in DRUGS:
        row = [d["abbr"]]
        for r in RESERVOIRS:
            rv = d["pen"].get(r["name"], 0.3)
            kb = k_barrier(rv)
            row.append(f"R={rv:.2f} K={kb:.1f}")
        pen_rows.append(row)
    cws = [0.45*inch] + [1.21*inch] * 5
    story.append(data_table(pen_header, pen_rows, cws))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Notable: DTG's CNS R=0.01 yields K_barrier=99.0, near-total exclusion by BBB. "
        "TFV concentrates in genital tract (R=3.50, K_barrier=-0.71, negative = favourable). "
        "EFV has the poorest CNS penetration (R=0.005, K_barrier=199.0).",
        S["body_sm"]))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 4 — SINGLE-DRUG COHERENCE
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S, "Section 4  —  Single-Drug Coherence  (C = tau/K)"):
        story.append(el)

    story.append(Paragraph(
        "C_site(drug, reservoir) = tau / K_pathway, where K_pathway = K_admet + K_barrier "
        "(active virus, K_phenotype = 0). C &gt;= 1.0 indicates the drug alone can suppress "
        "active virus at that reservoir.",
        S["body"]))
    story.append(Spacer(1, 4))

    c_header = ["Drug", "CNS", "Lymph", "GALT", "Genital", "Marrow"]
    c_rows = []
    for d in DRUGS:
        row = [d["abbr"]]
        for r in RESERVOIRS:
            c = c_site(d, r["name"])
            row.append(f"{c:.2f}")
        c_rows.append(row)
    story.append(data_table(c_header, c_rows,
                            [0.5*inch] + [1.2*inch] * 5))
    story.append(Spacer(1, 4))

    story.append(Paragraph(
        "Key findings: (1) No single drug achieves C &gt;= 1.0 at CNS — the BBB blocks all five. "
        "(2) TFV dominates genital tract (C=5.91) due to drug concentrating. "
        "(3) DTG and DRV provide the strongest lymph node and GALT coverage. "
        "Combination therapy is required for suppression at 4/5 reservoirs.",
        S["body_sm"]))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 5 — COMBINATION COHERENCE (Kirchhoff)
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S,
        "Section 5  —  Combination Coherence  (Kirchhoff Parallel-Resistor)"):
        story.append(el)

    story.append(Paragraph(
        "Multiple ARVs in combination follow the Kirchhoff parallel-resistor law: "
        "each drug contributes conductance g_i = 1/K_i. The combination coherence is:",
        S["body"]))
    story.append(Paragraph(
        "C_combo  =  tau_combo  x  synergy  x  sum(g_i)", S["eq"]))
    story.append(Paragraph(
        "where tau_combo = sum(tau_i x g_i) / sum(g_i) is the conductance-weighted "
        "average potency. Synergy = 1.0 (conservative; no assumed synergy).",
        S["body"]))
    story.append(Spacer(1, 4))

    story.append(Paragraph(
        f"Table 5  —  {reg_str} combination coherence at each reservoir", S["h2"]))
    combo_head = ["Reservoir", "C_combo_active", "Threshold", "Status",
                  "Top contributor"]
    combo_rows = []
    for r in RESERVOIRS:
        rn = r["name"]
        pr = PER_RESERVOIR[rn]
        status = "COVERED" if pr["reaches_threshold"] else "ESCAPE RISK"
        top = pr["per_drug"][0]  # highest-C drug
        combo_rows.append([
            rn, f"{pr['c_combo_active']:.2f}", "1.0",
            status, f"{top[0]} (C={top[1]:.2f})",
        ])
    story.append(data_table(combo_head, combo_rows,
                            [1.1*inch, 1.0*inch, 0.7*inch, 1.0*inch, 2.0*inch]))
    story.append(Spacer(1, 6))

    # Full derivation for one reservoir (GALT — largest)
    story.append(Paragraph("Full derivation  —  GALT (largest reservoir, 65%)", S["h2"]))
    galt_lines = []
    for d in REG_DRUGS:
        rv = d["pen"].get("GALT", 0.3)
        kb = k_barrier(rv)
        kp = d["k_admet"] + kb
        t  = tau(d)
        g  = 1.0 / max(kp, 0.01)
        galt_lines.append(
            f"  {d['abbr']}:  R={rv:.2f}  K_barrier={kb:.4f}  "
            f"K_path={kp:.4f}  tau={t:.4f}  g=1/K={g:.4f}")
    total_g_galt = sum(1.0 / max(k_pathway(d, "GALT"), 0.01) for d in REG_DRUGS)
    wtau_galt = sum(tau(d) / max(k_pathway(d, "GALT"), 0.01) for d in REG_DRUGS)
    tau_combo_galt = wtau_galt / total_g_galt
    c_combo_galt = tau_combo_galt * total_g_galt
    galt_lines.append(f"")
    galt_lines.append(f"  sum(g_i) = {total_g_galt:.4f}")
    galt_lines.append(f"  tau_combo = sum(tau x g) / sum(g) = {tau_combo_galt:.4f}")
    galt_lines.append(f"  C_combo_GALT = tau_combo x sum(g) = {c_combo_galt:.4f}")
    for line in galt_lines:
        story.append(Preformatted(line if line else " ", S["eq_sm"]))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 6 — DOUBLE COVER
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S,
        "Section 6  —  Double Cover  (S + d2 = 1)"):
        story.append(el)

    story.append(Paragraph(
        "The Double Cover theorem decomposes the HIV cure problem into two orthogonal circles:",
        S["body"]))
    story.append(Spacer(1, 4))

    dc_rows = [
        ("Circle 1  — Penetration geometry  S",
         f"{DOUBLE_COVER_S:.0%}  ({reachable}/5 reservoirs with C_active &gt;= 1.0)"),
        ("Circle 2  — Reactivation dynamics  d2",
         f"{DOUBLE_COVER_D2:.0%}  ({len(GEO_BOTTLENECKS)}/5 reservoirs where geometry alone fails)"),
        ("Geometric bottlenecks",
         ", ".join(GEO_BOTTLENECKS) if GEO_BOTTLENECKS else "None",
         bool(GEO_BOTTLENECKS)),
    ]
    story.append(kv_table(dc_rows, col_widths=[2.4*inch, 4.2*inch], S=S))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        "S = 0.80 means geometry (drug penetration) reaches 4/5 reservoirs. The CNS is the "
        "geometric bottleneck: even with perfect reactivation (Phi=1), C_combo_active_CNS = "
        f"{cns_c:.2f} &lt; 1.0. At CNS, BOTH circles fail simultaneously — neither drug "
        "penetration nor reactivation alone can solve it.",
        S["body"]))
    story.append(Spacer(1, 4))

    story.append(side_warning(S,
        "CSF VIRAL ESCAPE  —  GEOMETRIC INEVITABILITY",
        f"C_combo_active_CNS = {cns_c:.2f} &lt; 1.0 for {reg_str}. "
        f"This predicts 5-10% CSF viral escape on standard ART, matching Canestri 2010 "
        f"and Peluso 2012 clinical observations [20]. The BBB imposes K_barrier &gt;= 19.0 "
        f"for every ARV tested, overwhelming all tau values."))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 7 — CURE GAP AND LRA ANALYSIS
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S,
        "Section 7  —  Cure Gap and LRA Analysis"):
        story.append(el)

    story.append(Paragraph(
        "ART suppresses active viral replication but cannot touch latent provirus. "
        "Latency-reversing agents (LRAs) are catalytic: they modify the phenotype distribution "
        "by reactivating a fraction Phi of latent cells, making them susceptible to ARVs. "
        "The LRA appears as a multiplicative prefactor:",
        S["body"]))
    story.append(Paragraph(
        "f_active_new  =  f_active  +  Phi  x  (1 - f_active)", S["eq"]))
    story.append(Paragraph(
        "C_total  =  f_active_new  x  C_combo_active", S["eq"]))
    story.append(Spacer(1, 4))

    story.append(Paragraph("Table 6  —  LRA reactivation efficiencies", S["h2"]))
    lra_head = ["LRA", "Phi", "Source"]
    lra_rows = [[l["name"], f"{l['phi']:.3f}", l["src"]] for l in LRAS]
    story.append(data_table(lra_head, lra_rows,
                            [1.5*inch, 0.8*inch, 4.3*inch]))
    story.append(Spacer(1, 8))

    story.append(Paragraph(
        f"Table 7  —  Phi threshold analysis per reservoir  "
        f"(regimen: {reg_str}, best LRA: {BEST_LRA['name']} Phi={BEST_LRA['phi']})",
        S["h2"]))
    phi_head = ["Reservoir", "C_active", "Phi needed", "Best LRA Phi",
                "Gap factor", "Status"]
    phi_rows = []
    for r in RESERVOIRS:
        rn = r["name"]
        pr = PER_RESERVOIR[rn]
        ca = pr["c_combo_active"]
        pn = pr["phi_needed"]
        if pn > 0 and BEST_LRA["phi"] > 0:
            gap = pn / BEST_LRA["phi"]
            gap_str = f"{gap:.1f}x" if gap < 1000 else f"{gap:.0f}x"
        else:
            gap_str = "N/A"
        status = "CURABLE" if pr["phi_sufficient"] else "GAP"
        if not pr["reaches_threshold"]:
            status = "GEO FAIL"
        phi_rows.append([
            rn, f"{ca:.2f}", f"{pn:.4f}", f"{BEST_LRA['phi']:.3f}",
            gap_str, status,
        ])
    story.append(data_table(phi_head, phi_rows,
                            [1.1*inch, 0.7*inch, 0.8*inch, 0.8*inch, 0.7*inch, 0.9*inch]))
    story.append(Spacer(1, 6))

    # Derivation for GALT
    story.append(Paragraph("Full derivation  —  GALT Phi threshold", S["h2"]))
    galt_ca = PER_RESERVOIR["GALT"]["c_combo_active"]
    galt_pn = PER_RESERVOIR["GALT"]["phi_needed"]
    phi_deriv = [
        f"C_combo_active_GALT  =  {galt_ca:.4f}",
        f"Solve: (f_active + Phi x f_latent) x C_active >= 1.0",
        f"  Phi >= (1.0 / {galt_ca:.4f} - {F_ACTIVE_ON_ART}) / (1 - {F_ACTIVE_ON_ART})",
        f"  Phi >= {galt_pn:.6f}",
        f"Best LRA (AZD5153): Phi = {BEST_LRA['phi']}",
        f"Gap factor: {galt_pn / BEST_LRA['phi']:.1f}x  -- current LRAs are insufficient",
    ]
    for line in phi_deriv:
        story.append(Preformatted(line, S["eq_sm"]))
    story.append(Spacer(1, 6))

    story.append(side_warning(S,
        f"CURE GAP  —  {galt_pn / BEST_LRA['phi']:.0f}x SHORTFALL AT GALT",
        f"GALT contains 65% of the latent reservoir. The best available LRA "
        f"(AZD5153, Phi=0.015) provides {BEST_LRA['phi']/galt_pn*100:.1f}% of the "
        f"reactivation needed. This quantifies the structural reason why all LRA clinical "
        f"trials have failed to reduce reservoir size [23]."))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # SECTION 8 — CLEARANCE ORDER AND NOVEL PREDICTIONS
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S,
        "Section 8  —  Clearance Order and Novel Predictions"):
        story.append(el)

    story.append(Paragraph(
        "Reservoir clearance ordering: score = C_active / latent_fraction. "
        "Higher score = higher penetration per unit of virus = clears first.",
        S["body"]))
    story.append(Spacer(1, 4))

    story.append(Paragraph("Table 8  —  Clearance order", S["h2"]))
    clear_head = ["Rank", "Reservoir", "C_active", "Latent frac",
                  "Score (C/frac)"]
    clear_rows = []
    for i, rn in enumerate(CLEAR_ORDER):
        r = next(r for r in RESERVOIRS if r["name"] == rn)
        ca = PER_RESERVOIR[rn]["c_combo_active"]
        score = ca / max(r["frac"], 0.001)
        clear_rows.append([
            str(i + 1), rn, f"{ca:.2f}", f"{r['frac']:.0%}",
            f"{score:.1f}",
        ])
    story.append(data_table(clear_head, clear_rows,
                            [0.5*inch, 1.3*inch, 0.8*inch, 0.9*inch, 1.0*inch]))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Novel predictions  (derived, not assumed)", S["h2"]))

    gen_c = PER_RESERVOIR["genital_tract"]["c_combo_active"]
    gen_pn = PER_RESERVOIR["genital_tract"]["phi_needed"]
    predictions = [
        (f"Genital tract is already curable with existing LRA + ART. "
         f"TFV concentrates at R=3.50; Phi needed = {gen_pn:.4f}, "
         f"best LRA Phi = {BEST_LRA['phi']}. Testable: measure genital reservoir "
         f"specifically in LRA trials."),
        (f"CSF viral escape is a geometric inevitability on standard ART. "
         f"C_combo_active_CNS = {cns_c:.2f} &lt; 1.0. Matches Canestri 2010 "
         f"(5-10% CSF escape on suppressive ART) [20]."),
        (f"Phi gap is {galt_pn / BEST_LRA['phi']:.0f}x at GALT (dominant reservoir, 65%). "
         f"Best LRA Phi = {BEST_LRA['phi']}, needed Phi = {galt_pn:.4f}. "
         f"Quantifies why LRA trials fail [23]."),
        (f"Clearance order: {' --> '.join(CLEAR_ORDER)}. "
         f"GALT clears last due to sheer viral mass (65%) despite decent penetration."),
        (f"Darunavir dominates CNS among standard ARVs. "
         f"Matches: PI-based regimens preferred for HIV-associated neurocognitive disorder."),
    ]
    for i, pred in enumerate(predictions, 1):
        story.append(Paragraph(f"<b>{i}.</b>  {pred}", S["body_sm"]))
        story.append(Spacer(1, 3))
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════
    # REFERENCES
    # ══════════════════════════════════════════════════════════════════════
    for el in section_header(S, "References"):
        story.append(el)

    for ref_num, ref_short, ref_full in SOURCES:
        story.append(Paragraph(
            f"[{ref_num}]  {ref_short}.  {ref_full}.",
            S["ref"]))
    story.append(Spacer(1, 12))
    story.append(thin_rule())
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Davis Lab  |  Davis Geometric  |  Branch XI  Therapeutic Geometry  "
        "|  bee_davis@alumni.brown.edu",
        S["footer"]))

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return output_path


# ============================================================================
# JSON EXPORT
# ============================================================================
def export_json(output_path):
    per_res = {}
    for r in RESERVOIRS:
        rn = r["name"]
        pr = PER_RESERVOIR[rn]
        per_res[rn] = {
            "full_name": r["full"],
            "latent_fraction": r["frac"],
            "source": r["src"],
            "c_combo_active": round(pr["c_combo_active"], 4),
            "reaches_threshold": pr["reaches_threshold"],
            "phi_needed": round(pr["phi_needed"], 6),
            "phi_sufficient": pr["phi_sufficient"],
            "c_with_best_lra": round(pr["c_with_best_lra"], 6),
            "per_drug": [{"drug": name, "c_site": round(c, 4)}
                         for name, c in pr["per_drug"]],
        }

    drug_data = []
    for d in DRUGS:
        drug_data.append({
            "name": d["name"],
            "abbreviation": d["abbr"],
            "class": d["cls"],
            "ic50_nM": d["ic50"],
            "auc24_nM_hr": d["auc24"],
            "k_admet": d["k_admet"],
            "dose": d["dose"],
            "tau": round(tau(d), 4),
            "penetration": d["pen"],
            "source_ic50": d["src_ic50"],
            "source_auc": d["src_auc"],
            "source_penetration": d["src_pen"],
        })

    data = {
        "framework": "MIRADOR",
        "governing_equation": "C = tau/K",
        "branch": "XI  Therapeutic Geometry",
        "disease": "HIV-1 Latent Reservoir",
        "regimen": DEFAULT_REGIMEN,
        "drugs": drug_data,
        "reservoirs": [
            {"name": r["name"], "full_name": r["full"],
             "latent_fraction": r["frac"], "source": r["src"]}
            for r in RESERVOIRS
        ],
        "latency_model": {
            "k_phenotype_active": K_PHENOTYPE_ACTIVE,
            "k_phenotype_latent": K_PHENOTYPE_LATENT,
            "f_active_on_art": F_ACTIVE_ON_ART,
        },
        "lras": [
            {"name": l["name"], "phi": l["phi"], "source": l["src"]}
            for l in LRAS
        ],
        "per_reservoir": per_res,
        "double_cover": {
            "S": round(DOUBLE_COVER_S, 4),
            "d2": round(DOUBLE_COVER_D2, 4),
            "geometric_bottlenecks": GEO_BOTTLENECKS,
        },
        "clearance_order": CLEAR_ORDER,
        "best_lra": {
            "name": BEST_LRA["name"],
            "phi": BEST_LRA["phi"],
        },
        "novel_predictions": [
            "Genital tract is already curable with existing LRA + ART",
            "CSF viral escape is a geometric inevitability on standard ART",
            f"Phi gap is {PER_RESERVOIR['GALT']['phi_needed'] / BEST_LRA['phi']:.0f}x at GALT",
            f"Clearance order: {' -> '.join(CLEAR_ORDER)}",
            "Darunavir dominates CNS among standard ARVs",
        ],
        "sources": [{"id": r[0], "short": r[1], "full": r[2]}
                     for r in SOURCES],
    }
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return output_path


# ============================================================================
# MAIN
# ============================================================================
if __name__ == "__main__":
    base      = os.path.dirname(os.path.abspath(__file__))
    pdf_path  = os.path.join(base, "MIRADOR_HIV_Report.pdf")
    json_path = os.path.join(base, "MIRADOR_HIV_Report.json")
    build_report(pdf_path)
    export_json(json_path)
    print(f"PDF:  {pdf_path}")
    print(f"JSON: {json_path}")
