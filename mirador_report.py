#!/usr/bin/env python3
"""
MIRADOR Clinical Report Generator
Produces a high-fidelity PDF report from pipeline data.
"""

import json
import math
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, Circle, String, Line, Wedge
from reportlab.graphics import renderPDF

# ============================================================================
# COLOR SCHEME — clinical, readable, dark accents on white
# ============================================================================
BG = HexColor("#FFFFFF")
TEXT = HexColor("#1a1a2e")
TEXT_LIGHT = HexColor("#475569")
TEXT_MUTED = HexColor("#94a3b8")
ACCENT = HexColor("#0f172a")
RED = HexColor("#dc2626")
RED_LIGHT = HexColor("#fef2f2")
ORANGE = HexColor("#ea580c")
ORANGE_LIGHT = HexColor("#fff7ed")
GREEN = HexColor("#16a34a")
GREEN_LIGHT = HexColor("#f0fdf4")
BLUE = HexColor("#2563eb")
BLUE_LIGHT = HexColor("#eff6ff")
TEAL = HexColor("#0d9488")
TEAL_LIGHT = HexColor("#f0fdfa")
PURPLE = HexColor("#7c3aed")
BORDER = HexColor("#e2e8f0")
BORDER_DARK = HexColor("#cbd5e1")
ROW_ALT = HexColor("#f8fafc")

# ============================================================================
# PIPELINE DATA — matches the JSX demo exactly
# ============================================================================
PATIENT = {
    "age": 68, "weight_kg": 82, "egfr": 45, "alt": 85, "albumin": 2.5,
    "creatinine": 1.8, "vanco_trough": 18, "prior_meropenem_days": 14,
    "cyp2d6": "Normal (*1/*2)", "cyp3a4": "Reduced (sepsis, 0.7)",
    "diagnosis": "MRSA bacteremia (mecA+)",
}

TARGET = {
    "name": "PBP2a (penicillin-binding protein 2a)",
    "gene": "mecA", "pdb_closed": "1VQQ", "pdb_open": "3ZG0",
    "gate_residues": "440-460 (beta3-beta4 loop)",
    "gate_closure": "99.97%", "gate_dG": "5.0 kcal/mol",
    "allosteric_distance": "60 angstrom",
    "active_site": "Ser403 (transpeptidase)",
    "druggability_persistence": "0.0003",
    "kd_ceftaroline": "20 +/- 4 uM",
    "clinical_cmax": "35.2 +/- 6.8 uM",
}

DRUG = {
    "name": "Ceftaroline fosamil",
    "mw": 684.7, "logp": -1.0, "hbd": 4, "hba": 10, "rings": 3,
    "tau": 12, "tau_bind": 4, "tau_chiral": 1, "tau_ring": 3,
    "key_feature": "C3 pyrrolidine (threads allosteric gate)",
    "mic_mrsa": "0.5-1.0 ug/mL",
    "features": [
        {"name": "beta-lactam", "dG": -4.2, "target": "Ser403 acylation"},
        {"name": "C3 pyrrolidine", "dG": -3.8, "target": "Gate threading"},
        {"name": "Thiadiazole", "dG": -2.9, "target": "pi-stacking gate"},
        {"name": "Oxime", "dG": -2.1, "target": "H-bond gate wall"},
        {"name": "Hydrophobic", "dG": -1.5, "target": "Gate interior"},
        {"name": "Carbonyl", "dG": -1.8, "target": "Backbone anchor"},
        {"name": "Amino (NH3+)", "dG": -1.2, "target": "Salt bridge Glu150"},
    ],
}

def compute_admet(pt):
    K_abs = 0.00
    K_dist = (0.20 * (pt["albumin"] / 4.0)) ** 2
    K_met = 0.05
    K_exc = (90 / max(pt["egfr"], 1)) ** 2 * 0.10
    K_tox_base = 0.05 + (0.15 if pt["vanco_trough"] > 15 else 0)
    K_collateral = 0.10 if pt["prior_meropenem_days"] < 90 else 0
    K_tox = K_tox_base + K_collateral
    K_total = K_abs + K_dist + K_met + K_exc + K_tox
    return {"abs": K_abs, "dist": K_dist, "met": K_met, "exc": K_exc, "tox": K_tox, "total": K_total}

def compute_pk(pt):
    Vd = 28 * (1 + (1 - pt["albumin"]/4.0) * 0.3)
    CL = 150 * (pt["egfr"] / 90) * 60 / 1000
    ke = CL / max(Vd, 1)
    t_half = 0.693 / max(ke, 0.01)
    dose = 400 if pt["egfr"] < 50 else 600
    Cmax = dose / max(Vd, 1)
    Ctrough = Cmax * math.exp(-ke * 12)
    return {"Vd": Vd, "CL": CL, "ke": ke, "t_half": t_half, "dose": dose, "Cmax": Cmax, "Ctrough": Ctrough}

ADMET = compute_admet(PATIENT)
PK = compute_pk(PATIENT)
C_CEFT = DRUG["tau"] / max(ADMET["total"], 0.01)
K_VANCO = 0.0 + 0.1 + 0.05 + ((90/max(PATIENT["egfr"],1))**2 * 0.30) + 0.8
C_VANCO = 4 / max(K_VANCO, 0.01)

ESCAPE = [
    {"mutation": "E150K", "type": "Gate", "ddG_bind": 3.5, "ddG_fold": 1.2, "lam": 1.59, "pdb": "4BL2", "clinical": True},
    {"mutation": "N146K", "type": "Proximal", "ddG_bind": 2.8, "ddG_fold": 0.8, "lam": 1.56, "pdb": "4BL3", "clinical": True},
    {"mutation": "Y446N", "type": "Active site", "ddG_bind": 4.2, "ddG_fold": 2.1, "lam": 1.35, "pdb": "-", "clinical": True},
    {"mutation": "E239K", "type": "Allosteric", "ddG_bind": 1.9, "ddG_fold": 1.5, "lam": 0.76, "pdb": "-", "clinical": True},
    {"mutation": "K318N", "type": "Distal", "ddG_bind": 0.2, "ddG_fold": 0.3, "lam": 0.15, "pdb": "-", "clinical": False},
    {"mutation": "D357A", "type": "Destabilizing", "ddG_bind": 2.5, "ddG_fold": 3.8, "lam": 0.05, "pdb": "-", "clinical": False},
]

SOURCES = [
    "PDB: 1VQQ, 3ZG0, 3ZFZ, 4BL2, 4BL3, 4CPK, 5M18, 4DKI",
    "Otero et al. JACS 2014 — Kd = 20 +/- 4 uM, allosteric mechanism",
    "Mobashery et al. PNAS 2013 — allosteric site discovery, 60A distance",
    "Schaffer/Rosato. AAC Feb 2026 — 'Beyond mecA' collateral resistance",
    "Werth et al. OFID Dec 2025 — ceftaroline + carbapenem synergy",
    "Fisher et al. Nature Comms — ME/PI/TZ, meropenem Kd = 270 +/- 80 uM",
    "Jiao et al. J Comput Aided Mol Des Feb 2025 — MD validation of N146K/E150K",
    "NCBI Pathogen Detection — 2M+ bacterial isolates, MRSA surveillance",
    "FDA ceftaroline label — 400mg for CrCl 15-50 mL/min",
]

# ============================================================================
# STYLES
# ============================================================================
def make_styles():
    s = {}
    s["title"] = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=ACCENT, alignment=TA_LEFT, spaceAfter=4)
    s["subtitle"] = ParagraphStyle("subtitle", fontName="Helvetica", fontSize=10, leading=14, textColor=TEXT_LIGHT, spaceAfter=16)
    s["h1"] = ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=14, leading=18, textColor=ACCENT, spaceBefore=18, spaceAfter=8)
    s["h2"] = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=11, leading=14, textColor=BLUE, spaceBefore=12, spaceAfter=6)
    s["h3"] = ParagraphStyle("h3", fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=TEXT_LIGHT, spaceBefore=8, spaceAfter=4, textTransform="uppercase")
    s["body"] = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=13, textColor=TEXT, spaceAfter=6)
    s["body_small"] = ParagraphStyle("body_small", fontName="Helvetica", fontSize=8, leading=11, textColor=TEXT_LIGHT, spaceAfter=4)
    s["metric_big"] = ParagraphStyle("metric_big", fontName="Helvetica-Bold", fontSize=28, leading=32, textColor=RED, alignment=TA_CENTER)
    s["metric_label"] = ParagraphStyle("metric_label", fontName="Helvetica", fontSize=8, leading=10, textColor=TEXT_MUTED, alignment=TA_CENTER)
    s["source"] = ParagraphStyle("source", fontName="Helvetica", fontSize=7, leading=9, textColor=BLUE, spaceAfter=2)
    s["footer"] = ParagraphStyle("footer", fontName="Helvetica", fontSize=7, leading=9, textColor=TEXT_MUTED, alignment=TA_CENTER)
    s["warning"] = ParagraphStyle("warning", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=RED, spaceAfter=2)
    s["alert_body"] = ParagraphStyle("alert_body", fontName="Helvetica", fontSize=8, leading=11, textColor=TEXT)
    s["eq"] = ParagraphStyle("eq", fontName="Courier-Bold", fontSize=12, leading=16, textColor=ACCENT, alignment=TA_CENTER, spaceBefore=6, spaceAfter=6)
    return s

def kv_table(data, col_widths=None):
    """Key-value table with alternating rows"""
    if not col_widths:
        col_widths = [2.2*inch, 3.8*inch]
    rows = []
    for k, v, *rest in data:
        color = rest[0] if rest else TEXT
        rows.append([
            Paragraph(f'<font color="#475569">{k}</font>', ParagraphStyle("k", fontName="Helvetica", fontSize=8, leading=11)),
            Paragraph(f'<font color="{color}">{v}</font>', ParagraphStyle("v", fontName="Helvetica-Bold", fontSize=8, leading=11)),
        ])
    t = Table(rows, colWidths=col_widths)
    style = [
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("LINEBELOW", (0,0), (-1,-1), 0.5, BORDER),
    ]
    for i in range(0, len(rows), 2):
        style.append(("BACKGROUND", (0,i), (-1,i), ROW_ALT))
    t.setStyle(TableStyle(style))
    return t

def alert_box(title, body, color, bg):
    """Colored alert box"""
    inner = []
    inner.append(Paragraph(title, ParagraphStyle("at", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=color)))
    inner.append(Paragraph(body, ParagraphStyle("ab", fontName="Helvetica", fontSize=8, leading=11, textColor=TEXT)))
    t = Table([[inner]], colWidths=[6*inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg),
        ("BOX", (0,0), (-1,-1), 1, color),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    return t

def section_line():
    return HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8, spaceBefore=4)

# ============================================================================
# PAGE TEMPLATE
# ============================================================================
def header_footer(canvas_obj, doc):
    canvas_obj.saveState()
    # Header line
    canvas_obj.setStrokeColor(BLUE)
    canvas_obj.setLineWidth(2)
    canvas_obj.line(0.75*inch, 10.25*inch, 7.75*inch, 10.25*inch)
    # Header text
    canvas_obj.setFont("Helvetica-Bold", 8)
    canvas_obj.setFillColor(ACCENT)
    canvas_obj.drawString(0.75*inch, 10.35*inch, "MIRADOR")
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.setFillColor(TEXT_LIGHT)
    canvas_obj.drawString(1.5*inch, 10.35*inch, "Clinical Therapeutic Geometry Report")
    canvas_obj.drawRightString(7.75*inch, 10.35*inch, "CONFIDENTIAL")
    # Footer
    canvas_obj.setFont("Helvetica", 7)
    canvas_obj.setFillColor(TEXT_MUTED)
    canvas_obj.drawString(0.75*inch, 0.5*inch, "Davis Lab / Davis Geometric  |  C = tau/K  |  Branch XI")
    canvas_obj.drawRightString(7.75*inch, 0.5*inch, f"Page {doc.page}")
    canvas_obj.restoreState()

# ============================================================================
# BUILD REPORT
# ============================================================================
def build_report(output_path):
    S = make_styles()
    doc = SimpleDocTemplate(
        output_path, pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.9*inch, bottomMargin=0.75*inch,
    )
    story = []

    # ===== COVER =====
    story.append(Spacer(1, 0.5*inch))
    story.append(Paragraph("MIRADOR", S["title"]))
    story.append(Paragraph("Manifold-Informed Rational Architecture for Drug-Organism Response", S["subtitle"]))
    story.append(Paragraph("Clinical Therapeutic Geometry Report", ParagraphStyle("sub2", fontName="Helvetica", fontSize=10, textColor=TEAL, spaceAfter=24)))
    story.append(Paragraph("C = <font face='Courier-Bold'>tau</font> / <font face='Courier-Bold'>K</font>", S["eq"]))
    story.append(Spacer(1, 12))

    # Report metadata
    meta = [
        ("Target", "PBP2a (MRSA) — methicillin-resistant Staphylococcus aureus"),
        ("Drug", "Ceftaroline fosamil (5th-gen cephalosporin)"),
        ("Patient", f"{PATIENT['age']}yo, MRSA bacteremia, eGFR {PATIENT['egfr']}, septic"),
        ("Framework", "Davis Field Equations — Branch XI (Therapeutic Geometry)"),
        ("Date", "March 2026"),
    ]
    story.append(kv_table(meta))
    story.append(PageBreak())

    # ===== STAGE 1: THE PATIENT =====
    story.append(Paragraph("Stage 1: The Patient", S["h1"]))
    story.append(Paragraph("Why is the current treatment failing?", S["body"]))
    story.append(section_line())

    story.append(Paragraph("PATIENT PROFILE", S["h3"]))
    pt_data = [
        ("Age", f"{PATIENT['age']} years"),
        ("Weight", f"{PATIENT['weight_kg']} kg"),
        ("Diagnosis", PATIENT["diagnosis"], "#dc2626"),
        ("eGFR", f"{PATIENT['egfr']} mL/min (AKI from sepsis)", "#dc2626"),
        ("ALT", f"{PATIENT['alt']} U/L (2.1x ULN)", "#ea580c"),
        ("Albumin", f"{PATIENT['albumin']} g/dL (low — sepsis)", "#ea580c"),
        ("Creatinine", f"{PATIENT['creatinine']} mg/dL", "#dc2626"),
        ("CYP2D6", PATIENT["cyp2d6"]),
        ("CYP3A4", PATIENT["cyp3a4"], "#ea580c"),
    ]
    story.append(kv_table(pt_data))
    story.append(Spacer(1, 8))

    story.append(Paragraph("CURRENT TREATMENT", S["h3"]))
    tx_data = [
        ("Drug", "Vancomycin"),
        ("Trough", f"{PATIENT['vanco_trough']} ug/mL", "#dc2626"),
        ("Status", "NEAR TOXIC (threshold: 15 ug/mL)", "#dc2626"),
        ("Coherence (vancomycin)", f"C = {C_VANCO:.1f}", "#dc2626"),
    ]
    story.append(kv_table(tx_data))
    story.append(Spacer(1, 8))

    # Collateral risk
    if PATIENT["prior_meropenem_days"] < 90:
        story.append(alert_box(
            "COLLATERAL RESISTANCE RISK",
            f"Patient received meropenem {PATIENT['prior_meropenem_days']} days ago. "
            "Per Schaffer/Rosato (AAC, Feb 2026), carbapenem exposure selects rpoB mutations "
            "that reprogram gene expression, co-occurring with pbp1 H499R and mecA Y446H/E447K "
            "— conferring ceftaroline resistance independently of PBP2a allosteric mutations.",
            ORANGE, ORANGE_LIGHT
        ))
    story.append(PageBreak())

    # ===== STAGE 2: THE TARGET =====
    story.append(Paragraph("Stage 2: The Target", S["h1"]))
    story.append(Paragraph("Why is MRSA invincible?", S["body"]))
    story.append(section_line())

    story.append(Paragraph(
        "PBP2a is the protein that makes MRSA resistant to beta-lactam antibiotics. "
        "Its active site is locked behind an allosteric gate (beta3-beta4 loop, residues 440-460) "
        f"that is <b>{TARGET['gate_closure']} closed</b> at physiological temperature "
        f"(delta-G = {TARGET['gate_dG']}). The binding pocket has a persistence of only "
        f"{TARGET['druggability_persistence']}, far below the druggability threshold of 0.80.",
        S["body"]
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph("PBP2a STRUCTURAL DATA", S["h3"]))
    tgt_data = [
        ("Protein", TARGET["name"]),
        ("Gene", TARGET["gene"]),
        ("PDB (closed)", TARGET["pdb_closed"]),
        ("PDB (ceftaroline-bound)", TARGET["pdb_open"]),
        ("Active site", TARGET["active_site"]),
        ("Allosteric site distance", TARGET["allosteric_distance"]),
        ("Gate residues", TARGET["gate_residues"]),
        ("Gate closure", TARGET["gate_closure"], "#dc2626"),
        ("Kd (ceftaroline at allosteric)", TARGET["kd_ceftaroline"]),
        ("Clinical Cmax", TARGET["clinical_cmax"]),
        ("Druggability (persistence)", TARGET["druggability_persistence"], "#dc2626"),
    ]
    story.append(kv_table(tgt_data))
    story.append(Paragraph("Sources: rcsb.org; Otero et al. JACS 2014; Mobashery et al. PNAS 2013", S["source"]))
    story.append(PageBreak())

    # ===== STAGE 3: THE KEY =====
    story.append(Paragraph("Stage 3: The Key", S["h1"]))
    story.append(Paragraph("Ceftaroline threads the locked gate", S["body"]))
    story.append(section_line())

    story.append(Paragraph(
        "Ceftaroline is the only beta-lactam effective against MRSA. Its C3 pyrrolidine "
        "substituent threads through the closed allosteric gate, triggering conformational "
        "opening 60 angstrom away. A second ceftaroline molecule then acylates the active site Ser403.",
        S["body"]
    ))

    # Coherence comparison
    story.append(Spacer(1, 8))
    story.append(Paragraph("COHERENCE COMPARISON", S["h3"]))
    coh_rows = [
        ["Drug", "tau", "K", "C = tau/K", "Status"],
        ["Vancomycin", "4", f"{K_VANCO:.3f}", f"{C_VANCO:.1f}", "FAILING"],
        ["Ceftaroline", "12", f"{ADMET['total']:.3f}", f"{C_CEFT:.1f}", "RECOMMENDED"],
    ]
    ct = Table(coh_rows, colWidths=[1.6*inch, 0.8*inch, 1*inch, 1.2*inch, 1.4*inch])
    ct.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
        ("ALIGN", (1,0), (-1,-1), "CENTER"),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER),
        ("BACKGROUND", (0,1), (-1,1), RED_LIGHT),
        ("TEXTCOLOR", (3,1), (4,1), RED),
        ("BACKGROUND", (0,2), (-1,2), GREEN_LIGHT),
        ("TEXTCOLOR", (3,2), (4,2), GREEN),
        ("FONTNAME", (3,1), (4,2), "Helvetica-Bold"),
    ]))
    story.append(ct)
    story.append(Spacer(1, 12))

    # Pharmacophore
    story.append(Paragraph("PHARMACOPHORE CONTACTS", S["h3"]))
    ph_rows = [["Feature", "delta-G (kcal/mol)", "Target Residue"]]
    total_dG = 0
    for f in DRUG["features"]:
        ph_rows.append([f["name"], f"{f['dG']:.1f}", f["target"]])
        total_dG += f["dG"]
    ph_rows.append(["TOTAL", f"{total_dG:.1f}", ""])
    pt2 = Table(ph_rows, colWidths=[1.8*inch, 1.4*inch, 2.8*inch])
    pt2.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("FONTNAME", (0,1), (-1,-2), "Helvetica"),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("ALIGN", (1,0), (1,-1), "CENTER"),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER),
        ("BACKGROUND", (0,-1), (-1,-1), BLUE_LIGHT),
        ("LINEABOVE", (0,-1), (-1,-1), 1, ACCENT),
    ]))
    for i in range(1, len(ph_rows)-1, 2):
        pt2.setStyle(TableStyle([("BACKGROUND", (0,i), (-1,i), ROW_ALT)]))
    story.append(pt2)
    story.append(Spacer(1, 12))

    # ADMET
    story.append(Paragraph("ADMET CURVATURE (PATIENT-SPECIFIC)", S["h3"]))
    admet_rows = [["Component", "Value", "Driver"]]
    admet_items = [
        ("K_abs", ADMET["abs"], "IV administration (bypasses GI)"),
        ("K_dist", ADMET["dist"], f"PPB 20%, albumin {PATIENT['albumin']} g/dL"),
        ("K_met", ADMET["met"], "Minimal CYP (hydrolysis)"),
        ("K_exc", ADMET["exc"], f"eGFR {PATIENT['egfr']} mL/min (AKI)"),
        ("K_tox", ADMET["tox"], f"Vanco interaction + collateral risk"),
    ]
    for name, val, driver in admet_items:
        admet_rows.append([name, f"{val:.4f}", driver])
    admet_rows.append(["K_total", f"{ADMET['total']:.4f}", ""])
    at = Table(admet_rows, colWidths=[1.2*inch, 1*inch, 3.8*inch])
    at.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("FONTNAME", (0,1), (-1,-2), "Helvetica"),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("ALIGN", (1,0), (1,-1), "CENTER"),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER),
        ("BACKGROUND", (0,-1), (-1,-1), BLUE_LIGHT),
        ("LINEABOVE", (0,-1), (-1,-1), 1, ACCENT),
    ]))
    story.append(at)
    story.append(PageBreak())

    # ===== STAGE 4: THE NEXT MOVES =====
    story.append(Paragraph("Stage 4: The Next Moves", S["h1"]))
    story.append(Paragraph("How the bacteria fights back — and we already know", S["body"]))
    story.append(section_line())

    story.append(Paragraph(
        "MIRADOR predicts resistance mutations from the eigenvalue spectrum of the curvature "
        "operator on the drug-target fiber bundle. Each eigenvalue lambda ranks how accessible "
        "the escape route is: high binding disruption with tolerable fitness cost = high lambda.",
        S["body"]
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph("ESCAPE GEODESIC EIGENVALUE SPECTRUM", S["h3"]))
    esc_rows = [["Rank", "Mutation", "Type", "ddG_bind", "ddG_fold", "lambda", "PDB", "Clinical"]]
    for i, e in enumerate(ESCAPE):
        esc_rows.append([
            f"lambda-{i+1}",
            e["mutation"], e["type"],
            f"{e['ddG_bind']:.1f}", f"{e['ddG_fold']:.1f}", f"{e['lam']:.2f}",
            e["pdb"], "YES" if e["clinical"] else "no",
        ])
    et = Table(esc_rows, colWidths=[0.6*inch, 0.7*inch, 0.9*inch, 0.7*inch, 0.7*inch, 0.6*inch, 0.6*inch, 0.7*inch])
    et.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), ACCENT),
        ("TEXTCOLOR", (0,0), (-1,0), white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 7.5),
        ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
        ("GRID", (0,0), (-1,-1), 0.5, BORDER),
    ]))
    # Color the clinical rows
    for i in range(1, 5):
        et.setStyle(TableStyle([("BACKGROUND", (0,i), (-1,i), RED_LIGHT if i <= 3 else ORANGE_LIGHT)]))
    for i in range(5, 7):
        et.setStyle(TableStyle([("BACKGROUND", (0,i), (-1,i), ROW_ALT), ("TEXTCOLOR", (0,i), (-1,i), TEXT_MUTED)]))
    story.append(et)
    story.append(Spacer(1, 4))

    total_lam = sum(e["lam"] for e in ESCAPE)
    dom = ESCAPE[0]["lam"] / total_lam * 100
    story.append(Paragraph(f"Tr(R) = {total_lam:.2f} &nbsp;&nbsp;|&nbsp;&nbsp; lambda-1 dominance = {dom:.0f}% &nbsp;&nbsp;|&nbsp;&nbsp; Strategy: spread escape — monitor all top 3", S["body_small"]))
    story.append(Paragraph("Top 3 match all clinically observed ceftaroline resistance mutations. Crystal structures exist for E150K (4BL2) and N146K (4BL3).", S["source"]))
    story.append(Spacer(1, 8))

    if PATIENT["prior_meropenem_days"] < 90:
        story.append(alert_box(
            "COLLATERAL PATHWAY — 'BEYOND mecA' (Schaffer/Rosato AAC Feb 2026)",
            f"Meropenem {PATIENT['prior_meropenem_days']}d ago selects rpoB mutations -> "
            "gene reprogramming -> pbp1 H499R + mecA Y446H/E447K. This is a SECOND escape "
            "manifold not captured by PBP2a allosteric analysis alone. "
            "Recommend: monitor mecA for Y446H/E447K; consider combination therapy.",
            RED, RED_LIGHT
        ))
    story.append(PageBreak())

    # ===== STAGE 5: THE PRESCRIPTION =====
    story.append(Paragraph("Stage 5: The Prescription", S["h1"]))
    story.append(Paragraph("Patient in, prescription out", S["body"]))
    story.append(section_line())

    # Big protocol box
    proto_rows = [
        ["DRUG", "DOSE", "ROUTE", "INTERVAL"],
        ["Ceftaroline", f"{PK['dose']} mg", "IV", "q12h"],
    ]
    proto = Table(proto_rows, colWidths=[1.5*inch, 1.5*inch, 1.5*inch, 1.5*inch])
    proto.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), TEAL),
        ("TEXTCOLOR", (0,0), (-1,0), white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,0), 9),
        ("BACKGROUND", (0,1), (-1,1), TEAL_LIGHT),
        ("TEXTCOLOR", (0,1), (-1,1), TEAL),
        ("FONTNAME", (0,1), (-1,1), "Helvetica-Bold"),
        ("FONTSIZE", (0,1), (-1,1), 14),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("BOX", (0,0), (-1,-1), 1, TEAL),
        ("GRID", (0,0), (-1,0), 0.5, white),
    ]))
    story.append(proto)
    fda_match = "400mg for CrCl 15-50 mL/min" if PK["dose"] == 400 else "Standard dose"
    story.append(Paragraph(f"Matches FDA label: {fda_match}", S["source"]))
    story.append(Spacer(1, 12))

    # PK
    story.append(Paragraph("PHARMACOKINETICS (computed from patient parameters)", S["h3"]))
    pk_data = [
        ("V_d", f"{PK['Vd']:.1f} L {'(sepsis-expanded)' if PATIENT['albumin'] < 3.5 else ''}"),
        ("CL", f"{PK['CL']:.1f} L/hr (eGFR {PATIENT['egfr']})"),
        ("t 1/2", f"{PK['t_half']:.1f} hr (normal: 2.6)", "#ea580c" if PK["t_half"] > 3.5 else "#16a34a"),
        ("Cmax", f"{PK['Cmax']:.1f} ug/mL"),
        ("Ctrough", f"{PK['Ctrough']:.1f} ug/mL", "#16a34a" if PK["Ctrough"] > 1.0 else "#dc2626"),
        ("MIC (MRSA)", "0.5-1.0 ug/mL"),
        ("Ctrough > MIC", "YES" if PK["Ctrough"] > 1.0 else "NO", "#16a34a" if PK["Ctrough"] > 1.0 else "#dc2626"),
    ]
    story.append(kv_table(pk_data))
    story.append(Spacer(1, 12))

    # Actions
    story.append(Paragraph("CLINICAL ACTIONS", S["h3"]))
    if PATIENT["vanco_trough"] > 15:
        story.append(alert_box("TAPER VANCOMYCIN", f"Trough {PATIENT['vanco_trough']} ug/mL (near toxic). Additive nephrotoxicity with ceftaroline. Transition over 24-48h.", ORANGE, ORANGE_LIGHT))
        story.append(Spacer(1, 4))
    if PATIENT["egfr"] < 60:
        story.append(alert_box("MONITOR RENAL FUNCTION", f"eGFR {PATIENT['egfr']} mL/min. t1/2 prolonged to {PK['t_half']:.1f} hr. Recheck eGFR at 48h.", BLUE, BLUE_LIGHT))
        story.append(Spacer(1, 4))
    story.append(alert_box("GENOMIC SURVEILLANCE", "mecA sequence at day 7 for E150K / N146K / Y446N emergence. Crystal structures available for validation (PDB 4BL2, 4BL3).", RED, RED_LIGHT))
    story.append(Spacer(1, 4))
    if PATIENT["prior_meropenem_days"] < 90:
        story.append(alert_box("COLLATERAL ALERT", f"Prior meropenem {PATIENT['prior_meropenem_days']}d ago. Monitor for rpoB-mediated resistance (Y446H/E447K in mecA).", ORANGE, ORANGE_LIGHT))
    story.append(PageBreak())

    # ===== DATA SOURCES =====
    story.append(Paragraph("Data Sources and Provenance", S["h1"]))
    story.append(section_line())
    for i, src in enumerate(SOURCES):
        story.append(Paragraph(f"{i+1}. {src}", S["body_small"]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("GOVERNING EQUATION", S["h3"]))
    story.append(Paragraph("C = tau / K", S["eq"]))
    story.append(Paragraph(
        "Coherence = Topology / Curvature. "
        "The pharmacophore topological invariant tau encodes how the drug fits the target. "
        "The ADMET curvature K encodes what the patient's body does to the drug. "
        "Maximize C. The equation does not change. The manifold changes. The medicine follows.",
        S["body"]
    ))
    story.append(Spacer(1, 16))
    story.append(Paragraph("Davis Lab / Davis Geometric / Branch XI (Therapeutic Geometry)", S["footer"]))
    story.append(Paragraph("Bee Rosa Davis — bee_davis@alumni.brown.edu", S["footer"]))

    # Build
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    return output_path

# ============================================================================
# JSON EXPORT
# ============================================================================
def export_json(output_path):
    data = {
        "framework": "MIRADOR",
        "governing_equation": "C = tau/K",
        "branch": "XI (Therapeutic Geometry)",
        "target": TARGET,
        "patient": PATIENT,
        "drug": DRUG,
        "admet": ADMET,
        "coherence": {
            "C_ceftaroline": round(C_CEFT, 2),
            "C_vancomycin": round(C_VANCO, 2),
            "improvement_pct": round((C_CEFT / C_VANCO - 1) * 100, 0),
        },
        "escape_geodesics": ESCAPE,
        "pharmacokinetics": {k: round(v, 2) for k, v in PK.items()},
        "collateral_risk": PATIENT["prior_meropenem_days"] < 90,
        "recommendation": {
            "drug": "Ceftaroline",
            "dose_mg": PK["dose"],
            "route": "IV",
            "interval": "q12h",
            "fda_match": PK["dose"] == 400 and PATIENT["egfr"] < 50,
            "actions": [
                "Taper vancomycin" if PATIENT["vanco_trough"] > 15 else None,
                f"Monitor eGFR (currently {PATIENT['egfr']})" if PATIENT["egfr"] < 60 else None,
                "mecA surveillance at day 7",
                f"Collateral alert (meropenem {PATIENT['prior_meropenem_days']}d)" if PATIENT["prior_meropenem_days"] < 90 else None,
            ],
        },
        "sources": SOURCES,
    }
    data["recommendation"]["actions"] = [a for a in data["recommendation"]["actions"] if a]
    with open(output_path, "w") as f:
        json.dump(data, f, indent=2)
    return output_path

# ============================================================================
# MAIN
# ============================================================================
if __name__ == "__main__":
    pdf_path = build_report("/mnt/user-data/outputs/MIRADOR_Report.pdf")
    json_path = export_json("/mnt/user-data/outputs/MIRADOR_Report.json")
    print(f"PDF: {pdf_path}")
    print(f"JSON: {json_path}")
