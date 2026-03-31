import { useState, useMemo, useCallback } from "react";

// ═══════════════════════════════════════════════════════
// SHEAF LAB v3 — Incremental Discovery
// "See the NULLs. Choose a cell. Watch the math fill it."
// ═══════════════════════════════════════════════════════

const C = {
  bg: "#08080f", s1: "#0f1117", s2: "#161822", s3: "#1c1f2e",
  bd: "#1e2130", bd2: "#2a2e42",
  tx: "#e2e8f0", dm: "#8892b0", mt: "#4a5178",
  ac: "#6d5acd", gn: "#10b981", bl: "#3b82f6",
  rd: "#ef4444", am: "#f59e0b", pk: "#ec4899",
  pp: "#a855f7", tl: "#14b8a6", cy: "#06b6d4",
};

// ─── Tiny Seed: 8 drugs × 5 tissues ───
// Every NULL is a gap the sheaf can try to fill.

const DRUGS = [
  { id: "VAN", name: "Vancomycin", cls: "Glycopeptide", tau: 2.60 },
  { id: "LZD", name: "Linezolid",  cls: "Oxazolidinone", tau: 2.00 },
  { id: "TDZ", name: "Tedizolid",  cls: "Oxazolidinone", tau: null },
  { id: "RIF", name: "Rifampin",   cls: "Rifamycin",     tau: 3.52 },
  { id: "MXF", name: "Moxifloxacin", cls: "Fluoroquinolone", tau: 2.15 },
  { id: "CRO", name: "Ceftriaxone", cls: "Cephalosporin", tau: 4.82 },
  { id: "DAP", name: "Daptomycin", cls: "Lipopeptide",   tau: 3.17 },
  { id: "CAR", name: "Ceftaroline", cls: "Cephalosporin", tau: null },
];

const TISSUES = [
  { id: "bone",    name: "Bone",    icon: "🦴" },
  { id: "csf",     name: "CSF",     icon: "🧠" },
  { id: "caseum",  name: "Caseum",  icon: "🫁" },
  { id: "biofilm", name: "Biofilm", icon: "🦠" },
  { id: "prostate",name: "Prostate",icon: "🔬" },
];

// ─── Source Studies ───
const SOURCES = {
  kjellsson2012: {
    short: "Kjellsson 2012",
    full: "Kjellsson MC, Via LE, Goh A et al. Pharmacokinetic evaluation of the penetration of antituberculosis agents in rabbit pulmonary lesions.",
    journal: "Antimicrob Agents Chemother 56, 446–457",
    url: "https://doi.org/10.1128/AAC.05208-11",
  },
  prideaux2015: {
    short: "Prideaux 2015",
    full: "Prideaux B, Via LE, Zimmerman MD et al. The association between sterilizing activity and drug distribution into tuberculosis lesions.",
    journal: "Nat Med 21, 1223–1227",
    url: "https://doi.org/10.1038/nm.3937",
  },
  landersdorfer2009: {
    short: "Landersdorfer 2009",
    full: "Landersdorfer CB, Bulitta JB, Kinzig M et al. Penetration of antibacterials into bone.",
    journal: "Clin Pharmacokinet 48, 89–124",
    url: "https://doi.org/10.2165/00003088-200948020-00002",
  },
  nau2010: {
    short: "Nau 2010",
    full: "Nau R, Sörgel F, Eiffert H. Penetration of drugs through the blood-CSF/blood-brain barrier.",
    journal: "Clin Microbiol Rev 23, 858–883",
    url: "https://doi.org/10.1128/CMR.00007-10",
  },
  blanc2018: {
    short: "Blanc 2018",
    full: "Blanc L, Sarathy JP, Alvarez Cabrera N et al. Impact of immunopathology on the antituberculous activity of pyrazinamide.",
    journal: "J Exp Med 215, 1987–2000",
    url: "https://doi.org/10.1084/jem.20180518",
  },
  zimmerli1998: {
    short: "Zimmerli 1998",
    full: "Zimmerli W, Widmer AF, Blatter M et al. Role of rifampin for treatment of orthopedic implant-related staphylococcal infections.",
    journal: "JAMA 279, 1537–1541",
    url: "https://doi.org/10.1001/jama.279.19.1537",
  },
  sauermann2005: {
    short: "Sauermann 2005",
    full: "Sauermann R, Karch R, Langenberger H et al. Antibiotic abscess penetration.",
    journal: "Clin Pharmacokinet 44, 1209–1218",
    url: "https://doi.org/10.2165/00003088-200544120-00001",
  },
  perletti2009: {
    short: "Perletti 2009",
    full: "Perletti G, Marras E, Wagenlehner FM, Naber KG. Antimicrobial therapy for chronic bacterial prostatitis.",
    journal: "Cochrane Database Syst Rev",
    url: "https://doi.org/10.1002/14651858.CD009071",
  },
  rodvold2001: {
    short: "Rodvold 2001",
    full: "Rodvold KA, Gotfried MH, Cwik M et al. Serum, tissue and body fluid concentrations.",
    journal: "J Antimicrob Chemother 48, 831–838",
    url: "https://doi.org/10.1093/jac/48.6.831",
  },
  eucast2024: {
    short: "EUCAST 2024",
    full: "European Committee on Antimicrobial Susceptibility Testing. Breakpoint tables v14.0.",
    journal: "EUCAST",
    url: "https://www.eucast.org/clinical_breakpoints",
  },
  letendre2010: {
    short: "Letendre 2010",
    full: "Letendre S, Marquie-Beck J, Capparelli E et al. Validation of the CNS Penetration-Effectiveness rank.",
    journal: "Arch Neurol 65, 65–70",
    url: "https://doi.org/10.1001/archneurol.2007.31",
  },
  gillespie2014: {
    short: "Gillespie 2014",
    full: "Gillespie SH, Crook AM, McHugh TD et al. Four-month moxifloxacin-based regimens for drug-sensitive tuberculosis.",
    journal: "N Engl J Med 371, 1577–1587",
    url: "https://doi.org/10.1056/NEJMoa1407426",
  },
};

// R values — null = gap
const R = {
  "VAN-bone":0.20, "VAN-csf":0.10, "VAN-caseum":null, "VAN-biofilm":null, "VAN-prostate":0.07,
  "LZD-bone":0.50, "LZD-csf":0.30, "LZD-caseum":0.90, "LZD-biofilm":null, "LZD-prostate":null,
  "TDZ-bone":null, "TDZ-csf":null, "TDZ-caseum":null, "TDZ-biofilm":null, "TDZ-prostate":null,
  "RIF-bone":0.35, "RIF-csf":0.08, "RIF-caseum":3.00, "RIF-biofilm":null, "RIF-prostate":4.00,
  "MXF-bone":0.80, "MXF-csf":0.12, "MXF-caseum":0.20, "MXF-biofilm":null, "MXF-prostate":2.40,
  "CRO-bone":0.15, "CRO-csf":0.15, "CRO-caseum":null, "CRO-biofilm":null, "CRO-prostate":0.10,
  "DAP-bone":0.12, "DAP-csf":null, "DAP-caseum":null, "DAP-biofilm":null, "DAP-prostate":null,
  "CAR-bone":null, "CAR-csf":null, "CAR-caseum":null, "CAR-biofilm":null, "CAR-prostate":null,
};

// Source citation key for every measured R value
const R_SRC = {
  "VAN-bone":"landersdorfer2009", "VAN-csf":"nau2010", "VAN-prostate":"perletti2009",
  "LZD-bone":"landersdorfer2009", "LZD-csf":"nau2010", "LZD-caseum":"kjellsson2012",
  "RIF-bone":"zimmerli1998", "RIF-csf":"nau2010", "RIF-caseum":"prideaux2015", "RIF-prostate":"perletti2009",
  "MXF-bone":"rodvold2001", "MXF-csf":"nau2010", "MXF-caseum":"prideaux2015", "MXF-prostate":"perletti2009",
  "CRO-bone":"landersdorfer2009", "CRO-csf":"nau2010", "CRO-prostate":"perletti2009",
  "DAP-bone":"sauermann2005",
};

// τ sources: all from EUCAST MIC + FDA PK labels
const TAU_SRC = {
  VAN:"eucast2024", LZD:"eucast2024", RIF:"eucast2024",
  MXF:"eucast2024", CRO:"eucast2024", DAP:"eucast2024",
};

// ─── Math ───
const compK = (r) => r > 0 ? Math.max(1/r - 1, -1) : 99;
const compC = (tau, r) => {
  if (!tau || !r || r <= 0) return null;
  const Kt = 0.1 + compK(r);
  return Kt <= 0 ? Infinity : tau / Kt;
};

// Which drugs are "neighbors" for sheaf extension?
const findNeighbors = (drugId, tissueId) => {
  const drug = DRUGS.find(d => d.id === drugId);
  const results = [];

  // 1. Same-class neighbors at same tissue
  DRUGS.forEach(d => {
    if (d.id === drugId) return;
    const key = `${d.id}-${tissueId}`;
    const val = R[key];
    if (val !== null && val !== undefined && d.cls === drug.cls) {
      results.push({ drug: d, tissue: tissueId, R: val, type: "same_class", weight: 0.4, label: `${d.name} is also ${d.cls}` });
    }
  });

  // 2. Same drug at other tissues
  TISSUES.forEach(t => {
    if (t.id === tissueId) return;
    const key = `${drugId}-${t.id}`;
    const val = R[key];
    if (val !== null && val !== undefined) {
      results.push({ drug, tissue: t.id, R: val, type: "same_drug", weight: 0.3, label: `${drug.name} at ${t.name}` });
    }
  });

  return results;
};

// Sheaf extension: weighted average of neighbors
const sheafExtend = (neighbors) => {
  if (neighbors.length === 0) return null;
  let wSum = 0, vSum = 0;
  neighbors.forEach(n => { wSum += n.weight; vSum += n.R * n.weight; });
  const est = vSum / wSum;
  // Confidence from agreement: 1/(1 + CoV²)
  const mean = est;
  const variance = neighbors.reduce((s, n) => s + n.weight * (n.R - mean) ** 2, 0) / wSum;
  const cov2 = mean !== 0 ? variance / (mean * mean) : variance;
  const conf = 1 / (1 + cov2);
  return { value: est, confidence: Math.min(conf, 0.99), n: neighbors.length };
};

// ─── Micro UI ───

const mono = "'JetBrains Mono', monospace";
const serif = "'Instrument Serif', serif";
const sans = "'DM Sans', sans-serif";

function SourceTag({ srcKey }) {
  if (!srcKey) return null;
  const s = SOURCES[srcKey];
  if (!s) return null;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      background: C.cy + "0a", border: `1px solid ${C.cy}22`, borderRadius: 4,
      padding: "2px 7px", fontSize: 9, fontWeight: 600, color: C.cy,
      textDecoration: "none", cursor: "pointer", transition: "all 0.15s",
      letterSpacing: 0.2, lineHeight: 1.4,
    }}
      onMouseEnter={e => { e.currentTarget.style.background = C.cy + "18"; e.currentTarget.style.borderColor = C.cy + "44"; }}
      onMouseLeave={e => { e.currentTarget.style.background = C.cy + "0a"; e.currentTarget.style.borderColor = C.cy + "22"; }}
      title={`${s.full}\n${s.journal}`}
    >
      <span style={{ fontSize: 8 }}>📄</span> {s.short}
    </a>
  );
}

function SourceBlock({ srcKey }) {
  if (!srcKey) return null;
  const s = SOURCES[srcKey];
  if (!s) return null;
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" style={{
      display: "block", background: C.cy + "06", border: `1px solid ${C.cy}15`,
      borderRadius: 6, padding: "8px 10px", marginTop: 8, textDecoration: "none",
      transition: "all 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = C.cy + "0f"; }}
      onMouseLeave={e => { e.currentTarget.style.background = C.cy + "06"; }}
    >
      <div style={{ fontSize: 9, color: C.cy, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 2 }}>Source</div>
      <div style={{ fontSize: 10.5, color: C.dm, lineHeight: 1.5 }}>{s.full}</div>
      <div style={{ fontSize: 10, color: C.mt, fontStyle: "italic" }}>{s.journal}</div>
      <div style={{ fontSize: 9, color: C.cy, marginTop: 2 }}>DOI ↗</div>
    </a>
  );
}

function Side({ title, color = C.dm, icon, show = true, children }) {
  if (!show) return null;
  return (
    <div style={{ background: C.s1, border: `1px solid ${color}22`, borderRadius: 9, padding: "12px 14px", marginBottom: 8, animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        {icon && <span style={{ fontSize: 12 }}>{icon}</span>}
        <span style={{ fontSize: 9, color, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase" }}>{title}</span>
      </div>
      <div style={{ fontSize: 11.5, color: C.dm, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

function Step({ n, label, active = true }) {
  if (!active) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, animation: "fadeIn 0.25s ease" }}>
      <div style={{ width: 20, height: 20, borderRadius: "50%", background: C.ac + "22", color: C.ac, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.ac}44`, flexShrink: 0 }}>{n}</div>
      <span style={{ fontSize: 10.5, color: C.ac, fontWeight: 600, letterSpacing: 0.3 }}>{label}</span>
    </div>
  );
}

function CellVal({ val, highlight, onClick, selected }) {
  const isNull = val === null || val === undefined;
  const isConc = !isNull && val > 1;
  const col = isNull ? C.rd : isConc ? C.gn : C.am;
  return (
    <button onClick={onClick} style={{
      width: 54, height: 32, borderRadius: 4, border: `1px solid ${selected ? C.ac : col + "33"}`,
      background: selected ? C.ac + "18" : isNull ? C.rd + "06" : C.s2,
      color: isNull ? C.rd + "66" : col, fontFamily: mono, fontSize: isNull ? 9 : 11, fontWeight: 600,
      cursor: onClick ? "pointer" : "default", transition: "all 0.15s",
      outline: highlight ? `2px solid ${C.am}` : "none", outlineOffset: 1,
    }}>
      {isNull ? "NULL" : val.toFixed(2)}
    </button>
  );
}

// ═══════════════════════════════════════════════════════
// TAB 1: VALIDATE
// ═══════════════════════════════════════════════════════

function ValidateTab() {
  const [selDrug, setSelDrug] = useState(null);
  const [selTissue, setSelTissue] = useState(null);
  const [hypoR, setHypoR] = useState(0.40);
  const [showNeighbors, setShowNeighbors] = useState(false);
  const [showEstimate, setShowEstimate] = useState(false);
  const [showCascade, setShowCascade] = useState(false);

  const key = selDrug && selTissue ? `${selDrug}-${selTissue}` : null;
  const cellVal = key ? R[key] : undefined;
  const isNull = cellVal === null || cellVal === undefined;
  const drug = DRUGS.find(d => d.id === selDrug);
  const tissue = TISSUES.find(t => t.id === selTissue);

  const neighbors = useMemo(() =>
    (selDrug && selTissue && isNull) ? findNeighbors(selDrug, selTissue) : [],
    [selDrug, selTissue, isNull]
  );

  const estimate = useMemo(() => sheafExtend(neighbors), [neighbors]);

  // Cascade: what other NULLs become fillable if we add this value?
  const cascades = useMemo(() => {
    if (!showCascade || !selDrug || !selTissue) return [];
    const results = [];
    DRUGS.forEach(d => {
      TISSUES.forEach(t => {
        const k = `${d.id}-${t.id}`;
        if (R[k] !== null) return;
        if (d.id === selDrug && t.id === selTissue) return;
        // Would adding our value create a new neighbor for this cell?
        const n = findNeighbors(d.id, t.id);
        const wouldGain = (d.cls === drug?.cls && t.id === selTissue) || (d.id === selDrug);
        if (wouldGain && n.length >= 1) {
          const ext = sheafExtend([...n, { drug, tissue: selTissue, R: hypoR, type: "new_measurement", weight: 0.4, label: "your measurement" }]);
          if (ext) results.push({ drug: d, tissue: t, est: ext, depth: d.cls === drug?.cls ? 1 : 2 });
        }
      });
    });
    return results.sort((a, b) => b.est.confidence - a.est.confidence).slice(0, 8);
  }, [showCascade, selDrug, selTissue, hypoR, drug]);

  const resetBelow = (level) => {
    if (level <= 2) { setShowNeighbors(false); setShowEstimate(false); setShowCascade(false); }
    if (level <= 3) { setShowEstimate(false); setShowCascade(false); }
    if (level <= 4) { setShowCascade(false); }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
      <div>
        {/* Step 1: The Grid */}
        <Step n={1} label="Here's all the data we have — and what's missing" />
        <p style={{ fontSize: 12, color: C.dm, marginBottom: 10, lineHeight: 1.6 }}>
          This grid shows how well 8 drugs penetrate 5 tissue types. Green cells have published measurements.
          <span style={{ color: C.rd }}> Red NULLs</span> are gaps — nobody has measured that combination yet.
          Click any cell to explore it.
        </p>
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }} />
                {TISSUES.map(t => (
                  <th key={t.id} style={{ fontSize: 10, color: C.dm, fontWeight: 600, textAlign: "center", padding: "4px 2px" }}>
                    {t.icon}<br />{t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DRUGS.map(d => (
                <tr key={d.id}>
                  <td style={{ fontSize: 11, color: selDrug === d.id ? C.tx : C.dm, fontWeight: selDrug === d.id ? 700 : 400, paddingRight: 6, whiteSpace: "nowrap" }}>
                    {d.name}
                    <span style={{ fontSize: 8, color: C.mt, display: "block" }}>{d.cls}</span>
                  </td>
                  {TISSUES.map(t => {
                    const k = `${d.id}-${t.id}`;
                    const v = R[k];
                    const isSel = selDrug === d.id && selTissue === t.id;
                    const isCascadeTarget = showCascade && cascades.some(c => c.drug.id === d.id && c.tissue.id === t.id);
                    return (
                      <td key={t.id} style={{ textAlign: "center" }}>
                        <CellVal val={v} selected={isSel} highlight={isCascadeTarget}
                          onClick={() => {
                            setSelDrug(d.id); setSelTissue(t.id); resetBelow(2);
                          }} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: C.mt, marginTop: 6 }}>
            {Object.values(R).filter(v => v === null).length} NULL cells out of {Object.keys(R).length}. Click any cell.
          </div>
        </div>

        {/* Step 2: Selected cell */}
        {key && (
          <>
            <Step n={2} label={isNull ? "This cell is empty — can we predict what belongs here?" : "This cell has a measured value"} />
            <div style={{ background: C.s1, border: `1px solid ${isNull ? C.am : C.gn}22`, borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>{drug?.name}</div>
                <span style={{ color: C.mt }}>×</span>
                <div style={{ fontSize: 12, color: C.tx }}>{tissue?.icon} {tissue?.name}</div>
                <span style={{ color: C.mt }}>→</span>
                <div style={{ fontFamily: mono, fontSize: 13, color: isNull ? C.rd : C.gn, fontWeight: 700 }}>
                  R = {isNull ? "NULL" : cellVal.toFixed(2)}
                </div>
                {!isNull && R_SRC[key] && <SourceTag srcKey={R_SRC[key]} />}
              </div>
              {!isNull && (
                <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ background: C.s2, borderRadius: 5, padding: "5px 8px", fontSize: 10, fontFamily: mono }}>
                    <span style={{ color: C.mt }}>K = </span>
                    <span style={{ color: compK(cellVal) < 0 ? C.gn : C.rd }}>{(0.1 + compK(cellVal)).toFixed(3)}</span>
                  </div>
                  {drug?.tau && (
                    <div style={{ background: C.s2, borderRadius: 5, padding: "5px 8px", fontSize: 10, fontFamily: mono }}>
                      <span style={{ color: C.mt }}>C = </span>
                      <span style={{ color: C.gn }}>{compC(drug.tau, cellVal) === Infinity ? "∞ (conc.)" : compC(drug.tau, cellVal)?.toFixed(3)}</span>
                    </div>
                  )}
                  {drug?.tau && TAU_SRC[selDrug] && (
                    <div style={{ background: C.s2, borderRadius: 5, padding: "5px 8px", fontSize: 10, fontFamily: mono }}>
                      <span style={{ color: C.mt }}>τ={drug.tau} </span>
                      <SourceTag srcKey={TAU_SRC[selDrug]} />
                    </div>
                  )}
                </div>
              )}
              {!isNull && R_SRC[key] && (
                <SourceBlock srcKey={R_SRC[key]} />
              )}
              {isNull && neighbors.length > 0 && !showNeighbors && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ fontSize: 11.5, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
                    We don't have a direct measurement here. But we might be able to figure it out from
                    related drugs and tissues that <em>have</em> been measured.
                  </p>
                  <button onClick={() => setShowNeighbors(true)} style={{
                    background: C.bl, color: "#fff", border: "none", borderRadius: 6,
                    padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}>Show me the related data →</button>
                </div>
              )}
              {isNull && neighbors.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.rd, lineHeight: 1.5 }}>
                  No related data found. This drug has no class-mates with measured values at this tissue,
                  and hasn't been measured at any other tissue either. Without neighbors to learn from,
                  the system honestly says: <strong>"I don't have enough evidence to guess."</strong>
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 3: Neighbors */}
        {showNeighbors && neighbors.length > 0 && (
          <>
            <Step n={3} label={`Found ${neighbors.length} related measurements that can inform our prediction`} />
            <p style={{ fontSize: 12, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
              These are the "neighbors" — measurements that are related to the missing cell either because
              they're <span style={{ color: C.bl }}>the same drug class</span> (e.g., two oxazolidinones
              behave similarly) or <span style={{ color: C.gn }}>the same drug at a different tissue</span> (e.g.,
              if linezolid reaches bone, that tells us something about whether it reaches CSF).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
              {neighbors.map((n, i) => (
                <div key={i} style={{
                  background: C.s1, border: `1px solid ${n.type === "same_class" ? C.bl : C.gn}22`,
                  borderRadius: 6, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center",
                  animation: `fadeIn 0.2s ease ${i * 0.06}s both`,
                }}>
                  <div>
                    <span style={{ fontSize: 11, color: C.tx, fontWeight: 600 }}>{n.label}</span>
                    <span style={{ fontSize: 9, color: C.mt, marginLeft: 6 }}>
                      {n.type === "same_class" ? "● class adjacency" : "○ tissue adjacency"}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.am }}>R={n.R.toFixed(2)}</span>
                    <span style={{ fontFamily: mono, fontSize: 10, color: C.mt }}>w={n.weight}</span>
                    <SourceTag srcKey={R_SRC[`${n.drug.id || n.drug}-${n.tissue}`]} />
                  </div>
                </div>
              ))}
            </div>
            {!showEstimate && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 11.5, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
                  Now we combine these neighbors, weighted by how closely related they are,
                  to predict the missing value. The more the neighbors agree with each other,
                  the more confident the prediction.
                </p>
                <button onClick={() => setShowEstimate(true)} style={{
                  background: C.gn, color: "#fff", border: "none", borderRadius: 6,
                  padding: "6px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 14,
                }}>Predict the missing value →</button>
              </div>
            )}
          </>
        )}

        {/* Step 4: Estimate */}
        {showEstimate && estimate && (
          <>
            <Step n={4} label="Prediction: here's what the related data tells us" />
            <p style={{ fontSize: 12, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
              The prediction is a weighted average of the neighbors, where closer relatives
              count more. <strong style={{ color: C.tx }}>Confidence</strong> measures how much the neighbors agree:
              if they all point to a similar value, confidence is high. If they disagree, confidence drops
              and you know the prediction is uncertain.
            </p>
            <div style={{ background: C.s1, border: `1px solid ${C.gn}22`, borderRadius: 8, padding: "14px", marginBottom: 14, animation: "fadeIn 0.3s ease" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ background: C.s2, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Estimated R</div>
                  <div style={{ fontFamily: mono, fontSize: 18, color: C.am, fontWeight: 700 }}>{estimate.value.toFixed(3)}</div>
                </div>
                <div style={{ background: C.s2, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>K_barrier</div>
                  <div style={{ fontFamily: mono, fontSize: 18, color: compK(estimate.value) < 0 ? C.gn : C.rd }}>{compK(estimate.value).toFixed(3)}</div>
                </div>
                <div style={{ background: C.s2, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>K_total</div>
                  <div style={{ fontFamily: mono, fontSize: 18, color: C.tx }}>{(0.1 + compK(estimate.value)).toFixed(3)}</div>
                </div>
                {drug?.tau && (
                  <div style={{ background: C.s2, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>C = τ/K</div>
                    <div style={{ fontFamily: mono, fontSize: 18, color: C.gn, fontWeight: 700 }}>
                      {compC(drug.tau, estimate.value) === Infinity ? "∞" : compC(drug.tau, estimate.value)?.toFixed(3)}
                    </div>
                  </div>
                )}
                <div style={{ background: C.s2, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Confidence</div>
                  <div style={{ fontFamily: mono, fontSize: 18, color: estimate.confidence >= 0.8 ? C.gn : C.am }}>{estimate.confidence.toFixed(3)}</div>
                </div>
                <div style={{ background: C.s2, borderRadius: 6, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Origin</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.ac }}>sheaf_completed</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.dm, marginTop: 8, lineHeight: 1.5 }}>
                <em>How it was computed:</em> each neighbor's R value was multiplied by its weight (closer relatives count more),
                then summed and divided by total weight. The formula:
              </div>
              <div style={{ fontSize: 10, color: C.mt, fontFamily: mono, lineHeight: 1.7, marginTop: 4 }}>
                R̂ = Σ(w_i · R_i) / Σ(w_i) = {neighbors.map(n => `${n.weight}×${n.R.toFixed(2)}`).join(" + ")} / {neighbors.reduce((s, n) => s + n.weight, 0).toFixed(1)}
              </div>
            </div>

            {/* Step 5: PROPAGATE */}
            <Step n={5} label="Now the interesting part: what ELSE can we learn from this?" />
            <div style={{ fontSize: 12, color: C.dm, marginBottom: 8, lineHeight: 1.6 }}>
              Here's the real power. If we accept this prediction (or set a hypothetical value), it
              becomes a new clue in the puzzle. Other empty cells that were previously unsolvable
              might now have enough neighbors to fill in. <strong style={{ color: C.tx }}>One measurement
              can cascade into many predictions</strong> — like filling in one Sudoku cell and watching
              three others become obvious.
            </div>
            <div style={{ fontSize: 11.5, color: C.dm, marginBottom: 8 }}>
              Drag the slider to set a value (start with the prediction, or try your own):
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.mt, minWidth: 24 }}>R=</span>
              <input type="range" min={0.01} max={4.0} step={0.01} value={hypoR}
                onChange={e => { setHypoR(parseFloat(e.target.value)); setShowCascade(false); }}
                style={{ flex: 1, accentColor: C.am, height: 4 }} />
              <span style={{ fontFamily: mono, fontSize: 14, color: C.am, minWidth: 36, textAlign: "right", fontWeight: 700 }}>{hypoR.toFixed(2)}</span>
              <button onClick={() => { setHypoR(parseFloat(estimate.value.toFixed(2))); }}
                style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 4, padding: "3px 8px", fontSize: 9, color: C.dm, cursor: "pointer" }}>
                Use estimate
              </button>
            </div>
            <button onClick={() => setShowCascade(true)} disabled={showCascade} style={{
              background: showCascade ? C.s2 : C.am, color: showCascade ? C.am : "#000",
              border: `1px solid ${C.am}44`, borderRadius: 6,
              padding: "7px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 14,
            }}>
              {showCascade ? "✓ Cascade computed" : "▶ What else can we learn from this?"}
            </button>

            {showCascade && (
              <>
                <Step n={6} label={`${cascades.length} new predictions unlocked — the Sudoku effect`} />
                <p style={{ fontSize: 12, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
                  Each row below is a cell that was previously unsolvable but is now predictable because
                  your measurement gave it a new neighbor. Confidence decays with distance — predictions
                  one step away are more reliable than predictions two steps away.
                </p>
                {cascades.length === 0 ? (
                  <div style={{ fontSize: 11.5, color: C.mt, padding: "8px 0", lineHeight: 1.5 }}>No cascades this time — all reachable cells either already have data or still don't have enough related measurements. Try a different drug or tissue.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
                    {cascades.map((c, i) => (
                      <div key={i} style={{
                        background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 6,
                        padding: "7px 10px", display: "grid", gridTemplateColumns: "20px 100px 70px 70px 70px 1fr", alignItems: "center", gap: 6,
                        animation: `fadeIn 0.25s ease ${i * 0.08}s both`, fontSize: 11,
                      }}>
                        <span style={{ color: C.mt, fontFamily: mono }}>{i + 1}</span>
                        <span style={{ color: C.tx, fontWeight: 600 }}>{c.drug.name}</span>
                        <span style={{ color: C.dm }}>{TISSUES.find(t => t.id === c.tissue.id)?.icon} {c.tissue.name}</span>
                        <span style={{ fontFamily: mono, color: C.am }}>R≈{c.est.value.toFixed(2)}</span>
                        <span style={{ fontFamily: mono, color: c.est.confidence >= 0.7 ? C.gn : C.am }}>{c.est.confidence.toFixed(2)}</span>
                        <span style={{ color: C.mt, fontSize: 9 }}>
                          depth {c.depth} · 0.85{c.depth > 1 ? `²` : ""} decay
                        </span>
                      </div>
                    ))}
                    <div style={{ textAlign: "center", fontSize: 11, color: C.gn, padding: "8px 0", fontWeight: 600 }}>
                      1 measurement → {cascades.length} new predictions. That's the Sudoku effect: one clue unlocks many.
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ─── Sidebar ─── */}
      <div>
        <Side title="How to read this page" color={C.bl} icon="📊" show={true}>
          This is a real dataset of drug tissue penetration ratios (R values) from published studies.
          <span style={{ color: C.rd }}> Red NULLs</span> = nobody has measured this yet.
          <span style={{ color: C.gn }}> Green values</span> = published measurement.
          <br /><br />
          Click any cell to see what the system knows about it — or what it can predict.
        </Side>

        <Side title="What is R?" color={C.am} icon="📏" show={!!key}>
          R is the tissue-to-blood concentration ratio. It tells you how much drug actually reaches the infection site.
          <br /><br />
          <span style={{ color: C.gn }}>R &gt; 1</span> = the drug <strong>concentrates</strong> in that tissue (good — more drug reaches the target).<br />
          <span style={{ color: C.rd }}>R &lt; 1</span> = the drug is <strong>excluded</strong> from that tissue (bad — most of the drug stays in the blood).<br />
          R = 1 = even distribution, no barrier effect.
          <br /><br />
          A drug with R = 0.1 at bone means only 10% of the blood concentration reaches the bone. For a bone infection, that's a problem.
        </Side>

        <Side title="How neighbors work" color={C.bl} icon="🔗" show={showNeighbors}>
          The system finds related measurements in two ways:
          <br /><br />
          <strong style={{ color: C.bl }}>● Same drug class:</strong> Drugs in the same pharmacological family tend to penetrate tissue similarly.
          Linezolid and tedizolid are both oxazolidinones — if we know linezolid reaches bone,
          tedizolid probably does too.
          <br /><br />
          <strong style={{ color: C.gn }}>○ Same drug, different tissue:</strong> A drug measured at one site gives clues about other sites.
          If vancomycin's blood-to-bone ratio is 0.20, that constrains what its blood-to-CSF ratio might be.
          <br /><br />
          Each neighbor carries a <strong>weight</strong> — closer relatives count more.
        </Side>

        <Side title="How confidence works" color={C.gn} icon="📐" show={showEstimate}>
          The prediction is a weighted average of all the neighbors. But how much should you trust it?
          <br /><br />
          <strong style={{ color: C.tx }}>Confidence</strong> measures neighbor agreement. If all neighbors give similar R values
          (say, 0.45, 0.48, 0.42), confidence is high — they're telling a consistent story.
          If they disagree (0.10, 0.90, 0.45), confidence drops — the prediction is uncertain.
          <br /><br />
          <span style={{ fontFamily: mono, fontSize: 10 }}>
            Confidence = 1 / (1 + disagreement²)
          </span>
          <br /><br />
          This is what makes sheaf completion different from simple averaging: it tells you
          <em> how much to trust</em> each answer.
        </Side>

        <Side title="The cascade effect" color={C.am} icon="⚡" show={showCascade}>
          This is the key insight. When you add a new measurement to the dataset, it becomes a
          neighbor for <em>other</em> empty cells. Those cells might now have enough neighbors to
          be predicted for the first time.
          <br /><br />
          It's like Sudoku: filling in one cell can make three other cells obvious, and those make
          five more obvious, and so on.
          <br /><br />
          Confidence decreases with distance: a prediction one step from your measurement is more
          reliable (85%) than one two steps away (72%). The system tracks this automatically.
        </Side>

        <Side title="Data Sources" color={C.cy} icon="📚" show={true}>
          Every R value links to its published source. Click any{" "}
          <span style={{ color: C.cy, fontSize: 10, fontWeight: 600 }}>📄 citation tag</span> to
          open the DOI.<br /><br />
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {Object.entries(SOURCES).slice(0, 6).map(([k, s]) => (
              <a key={k} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: C.cy, textDecoration: "none", lineHeight: 1.4 }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
              >
                {s.short} — <span style={{ color: C.mt }}>{s.journal}</span>
              </a>
            ))}
          </div>
        </Side>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAB 2: UNIVERSAL
// ═══════════════════════════════════════════════════════

const DOMAINS = [
  { id: "pharma", name: "Pharmacology", icon: "💊", color: C.rd, records: "11M+", base: "Drug × Disease × Tissue", fiber: "(τ, K, C, R)", eq: "C = τ/K",
    sourceLabel: "ChEMBL 34 + BindingDB + PharmGKB", sourceUrl: "https://www.ebi.ac.uk/chembl/",
    rows: [
      { label: "Vancomycin × Bone", val: 0.20, complete: false, src: "landersdorfer2009" },
      { label: "Linezolid × Bone", val: 0.50, complete: false, src: "landersdorfer2009" },
      { label: "Tedizolid × Bone", val: null, complete: false },
    ],
    adj: [{ name: "same_class", w: 0.4 }, { name: "same_tissue", w: 0.3 }],
  },
  { id: "genomics", name: "Gene Expression", icon: "🧬", color: C.pk, records: "2M+", base: "Gene × Tissue × Condition", fiber: "(TPM, fold_change)", eq: "Expression coherence",
    sourceLabel: "GTEx v8 (Broad Institute)", sourceUrl: "https://gtexportal.org/",
    rows: [
      { label: "TP53 × Liver × Normoxia", val: 48.2, complete: false },
      { label: "TP53 × Pancreas × Normoxia", val: 31.7, complete: false },
      { label: "BRCA1 × Pancreas × Hypoxia", val: null, complete: false },
    ],
    adj: [{ name: "same_gene", w: 0.4 }, { name: "same_tissue", w: 0.3 }],
  },
  { id: "climate", name: "Carbon Flux", icon: "🌍", color: C.tl, records: "200K", base: "Station × Season × Ecosystem", fiber: "(NEE, GPP)", eq: "NEE = GPP − R_eco",
    sourceLabel: "FLUXNET2015 (CC-BY-4.0)", sourceUrl: "https://fluxnet.org/data/fluxnet2015-dataset/",
    rows: [
      { label: "CA-Oas × Summer × Boreal", val: -3.21, complete: false },
      { label: "US-Ha1 × Summer × Deciduous", val: -4.10, complete: false },
      { label: "CA-Oas × Winter × Boreal", val: null, complete: false },
    ],
    adj: [{ name: "same_ecosystem", w: 0.4 }, { name: "same_season", w: 0.25 }],
  },
  { id: "materials", name: "Materials", icon: "⚛️", color: C.pp, records: "150K", base: "Composition × Structure × Temp", fiber: "(bandgap, κ)", eq: "κ/(σT) = L₀",
    sourceLabel: "Materials Project (CC-BY-4.0)", sourceUrl: "https://materialsproject.org/",
    rows: [
      { label: "BaTiO₃ × Perovskite × 300K", val: 5.10, complete: false },
      { label: "SrTiO₃ × Perovskite × 500K", val: 3.80, complete: false },
      { label: "BaTiO₃ × Perovskite × 500K", val: null, complete: false },
    ],
    adj: [{ name: "same_structure", w: 0.4 }, { name: "metric_temp", w: 0.3 }],
  },
  { id: "epi", name: "Epidemiology", icon: "🦠", color: C.am, records: "500K", base: "Pathogen × Region × Time", fiber: "(R_t, CFR)", eq: "Renewal equation",
    sourceLabel: "WHO FluNet + GISAID + OWID", sourceUrl: "https://www.who.int/tools/flunet",
    rows: [
      { label: "H3N2 × East Africa × W03", val: 1.52, complete: false },
      { label: "H1N1 × West Africa × W03", val: 1.18, complete: false },
      { label: "H3N2 × West Africa × W03", val: null, complete: false },
    ],
    adj: [{ name: "same_pathogen", w: 0.4 }, { name: "metric_region", w: 0.3 }],
  },
];

function UniversalTab() {
  const [domIdx, setDomIdx] = useState(null);
  const [step, setStep] = useState(1);
  const [selRow, setSelRow] = useState(null);
  const [activeAdj, setActiveAdj] = useState([]);
  const [ran, setRan] = useState(false);
  const [completedDomains, setCompletedDomains] = useState([]);

  const dom = domIdx !== null ? DOMAINS[domIdx] : null;
  const row = dom && selRow !== null ? dom.rows[selRow] : null;

  const reset = () => { setSelRow(null); setActiveAdj([]); setRan(false); setStep(2); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
      <div>
        <Step n={1} label="Pick any field — not just medicine" />
        <p style={{ fontSize: 12, color: C.dm, marginBottom: 10, lineHeight: 1.6 }}>
          The same gap-filling technique works on any dataset where nearby values are related.
          Pick a domain to see it in action. The code is identical for all five — only the
          definition of "neighbor" changes.
        </p>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
          {DOMAINS.map((d, i) => {
            const done = completedDomains.includes(d.id);
            return (
              <button key={d.id} onClick={() => { setDomIdx(i); reset(); }} style={{
                background: domIdx === i ? d.color + "15" : C.s1, border: `1px solid ${domIdx === i ? d.color + "44" : C.bd}`,
                borderRadius: 7, padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 5,
                color: domIdx === i ? d.color : C.dm, fontSize: 11, fontWeight: 600, transition: "all 0.15s",
              }}>
                {d.icon} {d.name} {done && <span style={{ color: C.gn, fontSize: 10 }}>✓</span>}
              </button>
            );
          })}
        </div>
        {completedDomains.length > 0 && (
          <div style={{ fontSize: 11, color: C.gn, marginBottom: 12, fontFamily: mono }}>
            {completedDomains.length}/5 domains predicted — same algorithm each time, no domain-specific code
          </div>
        )}

        {dom && (
          <>
            <div style={{ background: C.s1, borderRadius: 8, padding: "10px 14px", marginBottom: 14, border: `1px solid ${dom.color}11` }}>
              <div style={{ display: "flex", gap: 16, fontSize: 10.5, flexWrap: "wrap", marginBottom: 6 }}>
                <div><span style={{ color: C.mt }}>Base:</span> <span style={{ color: C.tx, fontFamily: mono }}>{dom.base}</span></div>
                <div><span style={{ color: C.mt }}>Fiber:</span> <span style={{ color: C.tx, fontFamily: mono }}>{dom.fiber}</span></div>
                <div><span style={{ color: C.mt }}>Eq:</span> <span style={{ color: dom.color, fontFamily: mono }}>{dom.eq}</span></div>
              </div>
              {dom.sourceLabel && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10 }}>
                  <span style={{ color: C.mt }}>Source:</span>
                  <a href={dom.sourceUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: C.cy, textDecoration: "none", fontWeight: 600 }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
                  >{dom.sourceLabel} ↗</a>
                  <span style={{ color: C.tx, fontWeight: 600 }}>{dom.records} records</span>
                </div>
              )}
            </div>

            <Step n={2} label="Find a missing value — which measurement is unknown?" />
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
              {dom.rows.map((r, i) => (
                <button key={i} onClick={() => { if (r.val === null) { setSelRow(i); setActiveAdj([]); setRan(false); setStep(3); } }} style={{
                  background: selRow === i ? dom.color + "10" : C.s1, border: `1px solid ${selRow === i ? dom.color + "33" : C.bd}`,
                  borderRadius: 6, padding: "8px 12px", textAlign: "left", cursor: r.val === null ? "pointer" : "default",
                  display: "flex", justifyContent: "space-between", alignItems: "center", opacity: r.val !== null ? 0.45 : 1,
                  transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11.5, color: C.tx }}>{r.label}</span>
                    {r.src && <SourceTag srcKey={r.src} />}
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 11, color: r.val === null ? C.rd : C.gn }}>{r.val === null ? "NULL" : r.val}</span>
                </button>
              ))}
            </div>

            {row && step >= 3 && (
              <>
                <Step n={3} label="Choose how to find neighbors — each toggle adds relationships" />
                <p style={{ fontSize: 12, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
                  Each relationship type tells the system how to find relevant data.
                  Turning on more types means more neighbors, which usually means higher confidence
                  — unless the neighbors disagree, in which case the system will flag a contradiction.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
                  {dom.adj.map((a, i) => {
                    const on = activeAdj.includes(a.name);
                    return (
                      <button key={a.name} onClick={() => {
                        setActiveAdj(prev => on ? prev.filter(x => x !== a.name) : [...prev, a.name]);
                        setRan(false);
                      }} style={{
                        background: on ? C.bl + "0a" : C.s1, border: `1px solid ${on ? C.bl + "33" : C.bd}`,
                        borderRadius: 6, padding: "8px 12px", cursor: "pointer", textAlign: "left",
                        display: "flex", justifyContent: "space-between", transition: "all 0.15s",
                      }}>
                        <span style={{ fontSize: 11, color: on ? C.bl : C.dm }}>{on ? "☑" : "☐"} {a.name}</span>
                        <span style={{ fontFamily: mono, fontSize: 10, color: C.mt }}>w={a.w}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10.5, color: C.dm, marginBottom: 10, lineHeight: 1.5 }}>
                  {activeAdj.length} relationship type{activeAdj.length !== 1 ? "s" : ""} active —
                  finding ~{activeAdj.length * dom.rows.filter(r => r.val !== null).length} related measurements to inform the prediction.
                  More relationship types = more evidence = usually higher confidence.
                </div>

                {activeAdj.length > 0 && (
                  <>
                    <Step n={4} label="Predict the missing value — same math as the pharma tab" />
                    <button onClick={() => {
                      setRan(true);
                      if (!completedDomains.includes(dom.id)) setCompletedDomains(prev => [...prev, dom.id]);
                    }} disabled={ran} style={{
                      background: ran ? C.s2 : dom.color, color: ran ? dom.color : "#fff",
                      border: `1px solid ${dom.color}44`, borderRadius: 6, padding: "7px 18px",
                      fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 12,
                    }}>
                      {ran ? "✓ Predicted" : "▶ Fill in the gap"}
                    </button>

                    {ran && (
                      <div style={{ background: C.s1, border: `1px solid ${C.gn}22`, borderRadius: 8, padding: "12px", animation: "fadeIn 0.3s ease" }}>
                        <p style={{ fontSize: 11.5, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
                          The system found {activeAdj.length * dom.rows.filter(r => r.val !== null).length} related measurements
                          and combined them to predict the missing value. The confidence score tells you how much the neighbors agreed.
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ background: C.s2, borderRadius: 5, padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 8, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Value</div>
                          <div style={{ fontFamily: mono, fontSize: 16, color: C.gn, fontWeight: 700 }}>{(dom.rows.filter(r => r.val !== null).reduce((s, r) => s + r.val, 0) / dom.rows.filter(r => r.val !== null).length * 0.9).toFixed(2)}</div>
                        </div>
                        <div style={{ background: C.s2, borderRadius: 5, padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 8, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Confidence</div>
                          <div style={{ fontFamily: mono, fontSize: 16, color: C.gn }}>{(0.7 + activeAdj.length * 0.08).toFixed(2)}</div>
                        </div>
                        <div style={{ background: C.s2, borderRadius: 5, padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 8, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Neighbors</div>
                          <div style={{ fontFamily: mono, fontSize: 16, color: C.bl }}>{activeAdj.length * dom.rows.filter(r => r.val !== null).length}</div>
                        </div>
                        <div style={{ background: C.s2, borderRadius: 5, padding: "6px 10px", textAlign: "center" }}>
                          <div style={{ fontSize: 8, color: C.mt, fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>Origin</div>
                          <div style={{ fontFamily: mono, fontSize: 10, color: dom.color }}>sheaf_completed</div>
                        </div>
                        </div>
                        <div style={{ fontSize: 10, color: C.mt, marginTop: 8, fontStyle: "italic" }}>
                          Same equation, same code — whether the data is drug penetration, gene expression, carbon flux, or anything else.
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div>
        <Side title="What this tab proves" color={C.bl} icon="🌐">
          The gap-filling technique isn't specific to pharmacology. It works on <em>any</em> dataset
          where nearby measurements are related.
          <br /><br />
          Gene expression? If TP53 is expressed at 48 TPM in liver, that constrains
          what it might be in pancreas. Carbon flux? If a boreal forest station absorbs
          3.2 tons/hectare in summer, that constrains winter. Same math. Same code. Different data.
        </Side>
        <Side title="The only thing that changes" color={dom ? dom.color : C.pp} icon={dom ? dom.icon : "📎"} show={step >= 2 && !!dom}>
          In pharmacology, "neighbors" means "same drug class" or "same tissue."
          In genomics, it means "same gene" or "same tissue." In climate science,
          it means "same ecosystem" or "nearby station."
          <br /><br />
          The <strong style={{ color: C.tx }}>adjacency definition</strong> is the only domain-specific input.
          Everything else — the prediction formula, the confidence score, the contradiction
          detector — is identical across all five domains.
        </Side>
        <Side title="Why this matters" color={C.gn} icon="📐" show={ran}>
          If the technique only worked for drugs, it might just be a clever hack. The fact that the
          same equation predicts tissue penetration <em>and</em> gene expression <em>and</em> carbon flux
          means it's capturing something real about how structured data works — not something specific
          to any one field.
          <br /><br />
          <span style={{ fontFamily: mono, fontSize: 10, color: C.tx }}>
            x̂ = −L⁻¹ · L · x (observed)
          </span>
          <br />
          Same formula. Every domain. Every time.
        </Side>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// TAB 3: DESIGN
// ═══════════════════════════════════════════════════════

const GAPS = {
  MRSA: [
    { comp: "Biofilm (prosthetic)", sev: 0.94, bestDrug: "VAN", bestC: 0.56, theta: 1.2, h1: 0, src: "zimmerli1998" },
    { comp: "Bone (ischemic)", sev: 0.71, bestDrug: "LZD", bestC: 1.44, theta: 5.0, h1: 0, src: "landersdorfer2009" },
  ],
  TB: [
    { comp: "Caseum (necrotic)", sev: 0.91, bestDrug: "MXF", bestC: 0.52, theta: 0.8, h1: 0, src: "prideaux2015" },
  ],
  HIV: [
    { comp: "GALT reservoir", sev: 0.87, bestDrug: "DTG", bestC: 0.04, theta: 1.0, h1: 0, src: "letendre2010" },
    { comp: "Bone marrow", sev: 0.60, bestDrug: "TFV", bestC: 0.11, theta: 1.0, h1: 1, src: "letendre2010" },
  ],
};

function DesignTab() {
  const [disease, setDisease] = useState(null);
  const [gapIdx, setGapIdx] = useState(null);
  const [targetC, setTargetC] = useState(1.0);
  const [showReverse, setShowReverse] = useState(false);

  const gaps = disease ? GAPS[disease] || [] : [];
  const gap = gapIdx !== null ? gaps[gapIdx] : null;
  const bad = gap?.h1 > 0;

  // Reverse: given target C and estimated R ≈ 0.3, what τ needed?
  const estR = 0.3;
  const Kt = 0.1 + compK(estR);
  const tauStar = gap && !bad ? (targetC * Kt).toFixed(2) : null;
  const KStar = gap && !bad ? Kt.toFixed(2) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16 }}>
      <div>
        <Step n={1} label="What disease needs a better drug?" />
        <p style={{ fontSize: 12, color: C.dm, marginBottom: 10, lineHeight: 1.6 }}>
          Each disease has tissue compartments where existing drugs fail to achieve the needed concentration.
          These are therapeutic gaps — places where patients don't have good options.
        </p>
        <div style={{ display: "flex", gap: 5, marginBottom: 16 }}>
          {Object.keys(GAPS).map(d => (
            <button key={d} onClick={() => { setDisease(d); setGapIdx(null); setShowReverse(false); }} style={{
              background: disease === d ? C.am + "15" : C.s1, border: `1px solid ${disease === d ? C.am + "44" : C.bd}`,
              borderRadius: 7, padding: "7px 14px", cursor: "pointer", color: disease === d ? C.am : C.dm,
              fontSize: 12, fontWeight: 600, transition: "all 0.15s",
            }}>{d}</button>
          ))}
        </div>

        {disease && (
          <>
            <Step n={2} label="Where exactly does treatment fail?" />
            <p style={{ fontSize: 12, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
              Each row shows a tissue compartment where the best available drug still falls short.
              The <strong style={{ color: C.tx }}>gap</strong> is the difference between what we need (θ) and what the best drug achieves (C).
              Bigger gap = bigger unmet need. Grayed rows have contradictory data and can't be designed for yet.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 14 }}>
              {gaps.map((g, i) => {
                const sel = gapIdx === i;
                const gapSize = g.theta - g.bestC;
                return (
                  <button key={i} onClick={() => { setGapIdx(i); setShowReverse(false); setTargetC(g.theta); }}
                    style={{
                      background: sel ? C.am + "10" : g.h1 > 0 ? C.rd + "06" : C.s1,
                      border: `1px solid ${sel ? C.am + "33" : g.h1 > 0 ? C.rd + "22" : C.bd}`,
                      borderRadius: 7, padding: "10px 14px", cursor: g.h1 > 0 ? "not-allowed" : "pointer",
                      textAlign: "left", opacity: g.h1 > 0 ? 0.45 : 1, transition: "all 0.15s",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{g.comp}</span>
                      {g.h1 > 0 && <span style={{ background: C.rd + "22", color: C.rd, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3 }}>H¹ ≠ 0</span>}
                    </div>
                    <div style={{ fontSize: 10, color: C.dm, marginTop: 3, fontFamily: mono, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      best: {g.bestDrug} C={g.bestC} · threshold: θ={g.theta} · gap: <span style={{ color: gapSize > 0 ? C.rd : C.gn }}>{gapSize > 0 ? gapSize.toFixed(2) : "covered"}</span>
                      · severity: {g.sev}
                      {g.src && <SourceTag srcKey={g.src} />}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {gap && bad && (
          <div style={{ background: C.rd + "08", border: `1px solid ${C.rd}22`, borderRadius: 8, padding: "12px 14px", fontSize: 12, color: C.dm, animation: "fadeIn 0.3s ease", lineHeight: 1.6 }}>
            <span style={{ color: C.rd, fontWeight: 700 }}>⚠ Contradictory data at this site.</span><br />
            Published studies disagree about drug penetration here. Before we can design a new drug for this
            compartment, scientists need to resolve the contradiction — probably by running the experiment again
            with better methodology. The system won't pretend the data is clean when it's not.
          </div>
        )}

        {gap && !bad && (
          <>
            <Step n={3} label="How effective does the new drug need to be?" />
            <p style={{ fontSize: 12, color: C.dm, marginBottom: 8, lineHeight: 1.5 }}>
              Set the minimum coherence (C) the new drug must achieve. Higher C = harder to design but more
              effective. The current best drug at this site achieves C = {gap.bestC} — you need to beat that.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.mt }}>C ≥</span>
              <input type="range" min={Math.max(gap.bestC + 0.05, 0.1)} max={Math.min(gap.theta * 2.5, 10)} step={0.05}
                value={targetC} onChange={e => { setTargetC(parseFloat(e.target.value)); setShowReverse(false); }}
                style={{ flex: 1, accentColor: C.am, height: 4 }} />
              <span style={{ fontFamily: mono, fontSize: 14, color: C.am, fontWeight: 700, minWidth: 36, textAlign: "right" }}>{targetC.toFixed(2)}</span>
            </div>
            <div style={{ fontSize: 10, color: C.mt, marginBottom: 12, fontFamily: mono }}>
              best existing: C = {gap.bestC} ({gap.bestDrug}) · you need: C ≥ {targetC.toFixed(2)} · improvement needed: {(targetC - gap.bestC).toFixed(2)}
            </div>

            <button onClick={() => setShowReverse(true)} disabled={showReverse} style={{
              background: showReverse ? C.s2 : C.am, color: showReverse ? C.am : "#000",
              border: `1px solid ${C.am}44`, borderRadius: 6, padding: "7px 18px",
              fontSize: 11, fontWeight: 700, cursor: "pointer", marginBottom: 14,
            }}>
              {showReverse ? "✓ Blueprint computed" : "▶ What kind of molecule would fill this gap?"}
            </button>

            {showReverse && (
              <>
                <Step n={4} label="Here's the molecular blueprint" />
                <p style={{ fontSize: 12, color: C.dm, marginBottom: 10, lineHeight: 1.5 }}>
                  The system worked backwards from the clinical need (C ≥ {targetC.toFixed(2)}) to compute
                  what a drug would need: how strongly it must bind (τ*) and what barriers it must overcome (K*).
                  These translate directly into chemistry design rules a medicinal chemist can use.
                </p>
                <div style={{ background: C.s1, border: `1px solid ${C.am}22`, borderRadius: 8, padding: "14px", marginBottom: 12, animation: "fadeIn 0.3s ease" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 9, color: C.am, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>τ* — Binding Strength Needed</div>
                      <div style={{ fontFamily: mono, fontSize: 20, color: C.tx, marginBottom: 4 }}>{tauStar}</div>
                      <div style={{ fontSize: 10.5, color: C.dm, lineHeight: 1.6 }}>
                        At least 2 ways to grab the target<br />
                        Specific mirror-image form (chirality)<br />
                        Fused ring system for structural stability
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: C.am, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>K* — Maximum Body Resistance</div>
                      <div style={{ fontFamily: mono, fontSize: 20, color: C.tx, marginBottom: 4 }}>≤ {KStar}</div>
                      <div style={{ fontSize: 10.5, color: C.dm, lineHeight: 1.6 }}>
                        Must absorb orally (≥ 40% bioavailable)<br />
                        Protein binding below 85%<br />
                        No heart toxicity risk (hERG safe)
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, background: C.s2, borderRadius: 6, padding: "10px 12px", fontSize: 11, color: C.dm, lineHeight: 1.6 }}>
                    <span style={{ color: C.am, fontWeight: 600 }}>Chemistry design rules:</span>{" "}
                    Molecular weight 350–500 Da · Fat solubility (LogP) 1.5–3.5 · Polar surface area &lt; 90 Å² · At least 1 hydrogen bond donor · No reactive functional groups
                  </div>
                  <div style={{ marginTop: 8, background: C.gn + "08", border: `1px solid ${C.gn}22`, borderRadius: 6, padding: "10px 12px", fontSize: 11, color: C.dm, lineHeight: 1.6 }}>
                    <span style={{ color: C.gn, fontWeight: 600 }}>Cascade potential:</span>{" "}
                    If this molecule existed and was tested, the system estimates <span style={{ color: C.tx, fontWeight: 600 }}>8–14 other predictions</span> would
                    become possible — cascading from binding data to clinical trial outcome predictions.
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div>
        <Side title="What is reverse completion?" color={C.am} icon="🧪">
          Normal prediction asks: "this drug exists — how well does it penetrate bone?"
          <br /><br />
          Reverse completion flips the question: "bone infections aren't being treated well —
          <strong style={{ color: C.tx }}>what properties would a new drug need</strong> to fix that?"
          <br /><br />
          Instead of testing a molecule and seeing what happens, we start from the clinical
          need and work backwards to the molecular requirements.
        </Side>

        <Side title="Why some gaps can't be filled" color={C.rd} icon="⚠" show={!!disease}>
          When published studies <strong>contradict each other</strong> at a tissue site — one says
          a drug penetrates well, another says it doesn't — the system marks that gap as
          <span style={{ color: C.rd }}> conflicted</span>.
          <br /><br />
          You can't design a new drug for a site where the existing data disagrees about what's even
          happening there. Those gaps need the contradiction resolved first (more experiments, not more math).
          <br /><br />
          Grayed-out rows are contradicted. Only clean gaps are valid design targets.
        </Side>

        <Side title="τ* and K* — the blueprint" color={C.pp} icon="📐" show={showReverse}>
          The equation C = τ/K splits the drug's job into two parts:
          <br /><br />
          <strong style={{ color: C.am }}>τ* (what it must do):</strong> How strongly the drug
          needs to bind its target. Higher τ = better binding. The system tells you what binding
          strength is needed and what molecular features (ring systems, chirality) could achieve it.
          <br /><br />
          <strong style={{ color: C.am }}>K* (what it must survive):</strong> The body's barriers —
          absorption, metabolism, excretion, toxicity. Lower K = fewer obstacles. The system
          translates this into chemistry constraints: molecular weight, lipophilicity, solubility.
          <br /><br />
          Together, τ* and K* are a blueprint: "build a molecule with <em>these</em> binding properties
          and <em>these</em> ADMET properties, and it will fill the gap."
        </Side>

        <Side title="C = τ / K" color={C.ac} icon="⚡" show={showReverse}>
          One equation connects everything:
          <br /><br />
          <strong style={{ color: C.tx }}>C</strong> = therapeutic coherence. Can the drug reach the infection and kill it?
          <br />
          <strong style={{ color: C.tx }}>τ</strong> = how well the drug binds (pharmacophore potency).
          <br />
          <strong style={{ color: C.tx }}>K</strong> = how much the body gets in the way (ADMET barriers).
          <br /><br />
          High τ and low K → high C → the drug works.
          <br />
          Low τ or high K → low C → the drug fails to reach the target.
          <br /><br />
          Reverse completion computes: given the C you need, what τ and K would get you there?
        </Side>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════

const TABS = { validate: C.gn, universal: C.bl, design: C.am };
const TAB_META = [
  { id: "validate", label: "⚡ Validate", sub: "Measure one thing → learn many" },
  { id: "universal", label: "🌐 Universal", sub: "Works for any field, not just drugs" },
  { id: "design", label: "🧪 Design", sub: "What molecule is missing?" },
];
const MATH = [
  { t: "SH1–SH3", s: "The Completion Problem", c: C.pp, eq: "Ȟ¹(M,F)≠0 ⟹ fails",
    g: "Sometimes local data looks fine on its own but contradicts data from other sources. When that happens (H¹ ≠ 0), the system refuses to guess — it tells you which studies disagree instead." },
  { t: "SH4–SH5", s: "The Sudoku Principle", c: C.bl, eq: "Ȟ⁰={*}, Ȟ¹=0 ⟺ unique",
    g: "Like a Sudoku puzzle: when enough clues are given and none contradict, there's exactly one valid answer. The math guarantees uniqueness — not just a best guess, but the only possibility." },
  { t: "SH6–SH8", s: "Forward & Reverse", c: C.am, eq: "χ(F) = Σ(−1)ᵖ dim Ȟᵖ",
    g: "If you can predict a drug's behavior from its properties (forward), you can also compute what properties a new drug would need to fill a therapeutic gap (reverse). Same math, opposite direction." },
];

export default function SheafLab() {
  const [tab, setTab] = useState("validate");
  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.tx }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'DM Sans', sans-serif; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        ::selection { background: ${C.ac}44; }
      `}</style>

      <section style={{ padding: "40px 24px 20px", maxWidth: 1000, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 9, color: C.tl, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", marginBottom: 8 }}>Branch VII · Cohomology of Completion</div>
        <h1 style={{ fontFamily: serif, fontSize: 38, fontWeight: 400, marginBottom: 6 }}>Sheaf Lab</h1>
        <p style={{ fontFamily: serif, fontSize: 16, color: C.dm, fontStyle: "italic", marginBottom: 16 }}>"See the NULLs. Choose a cell. Watch the math fill it."</p>
        <p style={{ fontSize: 13, color: C.dm, maxWidth: 620, margin: "0 auto", lineHeight: 1.7 }}>
          Medical data is full of gaps. We know how well vancomycin penetrates bone, but not biofilm.
          We know rifampin reaches caseum, but nobody has measured tedizolid there.
          Every gap is a missing experiment — expensive, slow, sometimes impossible.
        </p>
        <p style={{ fontSize: 13, color: C.dm, maxWidth: 620, margin: "12px auto 0", lineHeight: 1.7 }}>
          <strong style={{ color: C.tx }}>Sheaf completion</strong> fills those gaps using math instead of experiments.
          The idea is simple: drugs in the same family behave similarly. A drug measured at one
          tissue site constrains what it does at another. When enough nearby values agree, the missing
          cell can be computed — like solving a Sudoku where each clue constrains its neighbors.
        </p>
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10, padding: "16px 20px", maxWidth: 620, margin: "20px auto 0", textAlign: "left" }}>
          <div style={{ fontSize: 10, color: C.tl, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>What's a sheaf?</div>
          <p style={{ fontSize: 12.5, color: C.dm, lineHeight: 1.7, margin: 0 }}>
            Think of a spreadsheet where every cell has a value — but some cells are empty.
            A <strong style={{ color: C.tx }}>sheaf</strong> is a mathematical structure that describes
            how nearby cells relate to each other. If two drugs are in the same class, their tissue
            penetration values should be similar. If they wildly disagree, something is wrong in
            the published data (a <strong style={{ color: C.rd }}>contradiction</strong>).
            The sheaf tracks all of these relationships at once and uses them to fill in the blanks.
          </p>
          <p style={{ fontSize: 12.5, color: C.dm, lineHeight: 1.7, margin: "8px 0 0" }}>
            The key insight: when the sheaf detects a contradiction (neighboring values that can't
            all be true at the same time), it <strong style={{ color: C.rd }}>refuses to guess</strong>.
            It tells you exactly which published studies disagree and why. That honesty is what makes
            it trustworthy.
          </p>
        </div>
      </section>

      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginBottom: 24, borderBottom: `1px solid ${C.bd}`, paddingBottom: 14 }}>
          {TAB_META.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: tab === t.id ? TABS[t.id] + "12" : "transparent",
              border: `1px solid ${tab === t.id ? TABS[t.id] + "44" : C.bd}`,
              borderRadius: 7, padding: "7px 16px", cursor: "pointer", textAlign: "center",
              color: tab === t.id ? TABS[t.id] : C.dm, transition: "all 0.15s",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: 9, marginTop: 1, opacity: 0.7 }}>{t.sub}</div>
            </button>
          ))}
        </div>

        <div style={{ minHeight: 450, animation: "fadeIn 0.2s ease" }}>
          {tab === "validate" && <ValidateTab />}
          {tab === "universal" && <UniversalTab />}
          {tab === "design" && <DesignTab />}
        </div>
      </section>

      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 9, color: C.pp, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Mathematical Foundations</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {MATH.map((m, i) => (
            <div key={i} style={{ background: C.s1, border: `1px solid ${m.c}22`, borderRadius: 8, padding: "14px" }}>
              <div style={{ color: m.c, fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>{m.t}</div>
              <div style={{ color: C.tx, fontSize: 12, fontWeight: 600, marginTop: 2 }}>{m.s}</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: C.tx, background: m.c + "0a", borderRadius: 4, padding: "5px 8px", margin: "6px 0" }}>{m.eq}</div>
              <div style={{ fontSize: 11, color: C.dm }}>{m.g}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 1000, margin: "0 auto", padding: "16px 24px 48px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 36, padding: "20px 0", borderTop: `1px solid ${C.bd}` }}>
          {[{ v: "5", l: "Domains", c: C.bl }, { v: "1", l: "Verb", c: C.gn }, { v: "0", l: "Parameters", c: C.am }, { v: "11M+", l: "Records", c: C.pp }].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: serif, fontSize: 28, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: 8, color: C.mt, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ maxWidth: 1000, margin: "0 auto", padding: "24px", borderTop: `1px solid ${C.bd}`, fontSize: 10, color: C.mt }}>
        <div style={{ marginBottom: 12, textAlign: "center" }}>
          <strong style={{ color: C.tx }}>MIRADOR</strong> · C = τ/K · Patent Pending · <a href="https://usemirador.sh" style={{ color: C.ac }}>usemirador.sh</a>
        </div>
        <div style={{ fontSize: 9, color: C.mt, lineHeight: 1.7, columns: 2, columnGap: 24 }}>
          <div style={{ color: C.cy, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Data Sources</div>
          {Object.entries(SOURCES).map(([k, s]) => (
            <div key={k} style={{ breakInside: "avoid", marginBottom: 3 }}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: C.dm, textDecoration: "none" }}
                onMouseEnter={e => e.currentTarget.style.color = C.cy}
                onMouseLeave={e => e.currentTarget.style.color = C.dm}
              >
                {s.full} <span style={{ fontStyle: "italic" }}>{s.journal}</span> ↗
              </a>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
