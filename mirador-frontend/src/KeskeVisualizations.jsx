import { useState, useEffect, useRef, useMemo } from "react";

const FM = "'JetBrains Mono', 'Fira Code', monospace";
const FS = "'DM Sans', 'Helvetica Neue', sans-serif";

// Steven Keske data
const DRUGS = {
  Ceftaroline: { tau: 12, R_bone: 0.30, MIC: 1, MBEC: 128, K_admet: 0.670, color: "#22c55e", intracellular: false, label: "5th-gen cephalosporin" },
  Rifampin:    { tau: 8,  R_bone: 0.35, MIC: 0.008, MBEC: 0.5, K_admet: 0.500, color: "#f59e0b", intracellular: true, label: "Biofilm + intracellular" },
  Vancomycin:  { tau: 12, R_bone: 0.20, MIC: 1, MBEC: 512, K_admet: 0.500, color: "#ef4444", intracellular: false, label: "Glycopeptide" },
  Linezolid:   { tau: 8,  R_bone: 0.50, MIC: 2, MBEC: 256, K_admet: 0.600, color: "#a855f7", intracellular: false, label: "Oxazolidinone" },
  Daptomycin:  { tau: 10, R_bone: 0.15, MIC: 0.5, MBEC: 32, K_admet: 0.550, color: "#3b82f6", intracellular: false, label: "Lipopeptide" },
  Clindamycin: { tau: 6,  R_bone: 0.525,MIC: 0.25, MBEC: 64, K_admet: 0.450, color: "#14b8a6", intracellular: false, label: "Lincosamide" },
};

function computeDrug(name, pt) {
  const d = DRUGS[name];
  const CRP_mod = 1 + 0.006 * Math.max(pt.crp - 100, 0);
  const R_eff = Math.min(d.R_bone * CRP_mod, d.R_bone * 2);
  const K_pen = (1 / R_eff) - 1;
  const K_bio_raw = Math.log10(d.MBEC / d.MIC);
  const K_bio_eff = pt.biofilm_prob * K_bio_raw;
  const rif_mod = (name === "Rifampin" || pt.hasRifampin) && d.intracellular ? 0.4 : (pt.hasRifampin && name !== "Rifampin" ? 1.0 : 1.0);
  const K_res_SAC = (1 - pt.P_drain) * 0.5;
  const K_res_mat = (1 - pt.P_debride) * K_pen;
  const K_res_intra_base = 0.8 * pt.intra_frac;
  const K_res_intra = K_res_intra_base * (pt.hasRifampin ? 0.4 : 1.0);
  const K_res = K_res_SAC + K_res_mat + K_res_intra;
  const K_pathway = d.K_admet + K_pen + K_bio_eff + K_res;
  const C_bone = d.tau / K_pathway;
  return { name, ...d, R_eff, K_pen, K_bio_raw, K_bio_eff, K_res_SAC, K_res_mat, K_res_intra, K_res, K_pathway, C_bone };
}

const STEVEN = { crp: 250, biofilm_prob: 0.95, P_drain: 0.9, P_debride: 0.8, intra_frac: 0.4, hasRifampin: true, infectionDays: 2190 };
const STEVEN_NO_RIF = { ...STEVEN, hasRifampin: false };

// ============================================================
// VIZ 1: BONE CROSS-SECTION RESERVOIR DIAGRAM
// ============================================================
function BoneCrossSection({ patient, drugA, drugB }) {
  const [selected, setSelected] = useState(null);
  const hasRif = drugA === "Rifampin" || drugB === "Rifampin";
  const dA = computeDrug(drugA, { ...patient, hasRifampin: hasRif });
  const dB = computeDrug(drugB, { ...patient, hasRifampin: hasRif });

  const cx = 200, cy = 150;
  const RX = [190, 130, 66];   // horizontal radii (wide oval)
  const RY = [130, 88, 46];    // vertical radii
  const layers = [
    {
      name: "R1", sub: "Soft Tissue", rx: RX[0], ry: RY[0], color: "#f97316",
      K: dA.K_res_SAC,
      formula: `K_res_SAC = (1 − P_drain) × 0.5 = (1 − ${patient.P_drain.toFixed(2)}) × 0.5 = ${dA.K_res_SAC.toFixed(3)}`,
      why: `Uncleared abscess space adds impedance. Surgery (P_drain=${(patient.P_drain*100).toFixed(0)}%) cleared most. Remaining dead space = ${dA.K_res_SAC.toFixed(3)} units. Without drainage this would be 0.25.`,
    },
    {
      name: "R2", sub: "Bone Matrix", rx: RX[1], ry: RY[1], color: "#ef4444",
      K: dA.K_res_mat,
      formula: `K_res_mat = (1 − P_debride) × K_pen = (1 − ${patient.P_debride.toFixed(2)}) × ${dA.K_pen.toFixed(3)} = ${dA.K_res_mat.toFixed(3)}`,
      why: `Dead bone not excised keeps biofilm sheltered. Debridement (P_debride=${(patient.P_debride*100).toFixed(0)}%) removed most. Higher K_pen drugs pay a larger matrix penalty.`,
    },
    {
      name: "R3", sub: "Intracellular", rx: RX[2], ry: RY[2], color: "#991b1b",
      K: dA.K_res_intra,
      formula: `K_res_intra = 0.8 × frac${hasRif ? " × 0.4 (rifampin)" : ""} = 0.8 × ${patient.intra_frac.toFixed(2)}${hasRif ? " × 0.4" : ""} = ${dA.K_res_intra.toFixed(3)}`,
      why: hasRif
        ? `Rifampin penetrates osteoblast SCVs. Its ×0.4 modifier cuts intracellular impedance by 60%.`
        : `SCVs hide inside bone-forming cells. No current drug reaches here — why monotherapy fails.`,
    },
  ];

  const getReach = (d, drug) => {
    if (d.K_pen >= 3) return 0;
    if (d.K_bio_eff >= 2.5) return 1;
    if (!DRUGS[drug].intracellular && !(hasRif && drug === "Rifampin")) return 2;
    return 3;
  };
  const arrows = [
    { drug: drugA, d: dA, color: DRUGS[drugA].color, side: "left",  reach: getReach(dA, drugA) },
    { drug: drugB, d: dB, color: DRUGS[drugB].color, side: "right", reach: getReach(dB, drugB) },
  ];
  const reachLabel = r => ["BLOCKED — K_pen", "BLOCKED — biofilm", "BLOCKED — intracell.", "✓ REACHES SCVs"][r];
  const reachColor = r => r === 3 ? "#22c55e" : "#ef4444";

  const arrowEndX = (side, reach, y) => {
    const dy = y - cy;
    const li = reach === 0 ? 0 : reach === 1 ? 1 : reach === 2 ? 2 : -1;
    if (li === -1) return side === "left" ? cx - 22 : cx + 22;
    const l = layers[li];
    const t = Math.abs(dy) < l.ry ? Math.sqrt(1 - (dy / l.ry) ** 2) : 0;
    return side === "left" ? cx - l.rx * t - 4 : cx + l.rx * t + 4;
  };

  const svgW = 400, svgH = 370;

  return (
    <div style={{ background: "#0a0a14", borderRadius: 12, padding: 24, border: "1px solid #1e1e30" }}>
      <div style={{ fontSize: 11, fontFamily: FM, color: "#64748b", letterSpacing: 2, marginBottom: 6 }}>BONE CROSS-SECTION · RESERVOIR IMPEDANCE</div>
      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 16 }}>
        Each ring is a physical barrier adding impedance to drug delivery.
        <strong style={{ color: "#e2e8f0" }}> Click a ring tag below</strong> to see its formula.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* Left: SVG oval + ring tabs */}
        <div>
          <svg width="100%" viewBox={`0 0 ${svgW} ${svgH}`} style={{ aspectRatio: `${svgW}/${svgH}`, display: "block" }}>
            {/* Ellipses: outermost first so inner paints on top */}
            {[...layers].reverse().map((l, ri) => {
              const i = 2 - ri;
              const isSel = selected === i;
              return (
                <ellipse key={`el-${i}`} cx={cx} cy={cy} rx={l.rx} ry={l.ry}
                  fill={l.color} opacity={isSel ? 0.65 : 0.38}
                  stroke={isSel ? "#fff" : l.color} strokeWidth={isSel ? 2.5 : 0.5} />
              );
            })}

            {/* Transparent hit ellipses: R1 first, R3 last (highest z) so inner rings catch clicks first */}
            {layers.map((l, i) => (
              <ellipse key={`hit-${i}`} cx={cx} cy={cy} rx={l.rx} ry={l.ry}
                fill="transparent" style={{ cursor: "pointer" }}
                onClick={() => setSelected(selected === i ? null : i)} />
            ))}

            {/* MRSA center */}
            <ellipse cx={cx} cy={cy} rx={22} ry={17} fill="#0a0a14" stroke="#ef4444" strokeWidth={1.5} />
            <text x={cx} y={cy - 2} textAnchor="middle" fill="#ef4444" fontSize={8} fontFamily={FM} fontWeight={700}>MRSA</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize={7} fontFamily={FM}>SCVs</text>

            {/* Drug arrows below the oval */}
            {arrows.map((a, i) => {
              const startX = a.side === "left" ? 6 : svgW - 6;
              const y = cy + RY[0] + 20 + i * 36;
              const endX = arrowEndX(a.side, a.reach, y);
              return (
                <g key={`arr-${i}`}>
                  <line x1={startX} y1={y} x2={endX} y2={y}
                    stroke={a.color} strokeWidth={2.5}
                    strokeDasharray={a.reach >= 2 ? "none" : "6,3"} opacity={0.9} />
                  <polygon
                    points={a.side === "left"
                      ? `${endX},${y} ${endX+7},${y-4} ${endX+7},${y+4}`
                      : `${endX},${y} ${endX-7},${y-4} ${endX-7},${y+4}`}
                    fill={a.color} opacity={0.9} />
                  <text x={a.side === "left" ? startX + 4 : startX - 4} y={y - 7}
                    textAnchor={a.side === "left" ? "start" : "end"}
                    fill={a.color} fontSize={10} fontFamily={FM} fontWeight={700}>{a.drug}</text>
                  <text x={(startX + endX) / 2} y={y + 15} textAnchor="middle"
                    fill={reachColor(a.reach)} fontSize={8} fontFamily={FM}>{reachLabel(a.reach)}</text>
                </g>
              );
            })}
          </svg>

          {/* Ring selector tabs — clean labels outside the cramped SVG */}
          <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
            {layers.map((l, i) => (
              <button key={i}
                onClick={() => setSelected(selected === i ? null : i)}
                style={{
                  background: selected === i ? l.color + "28" : "transparent",
                  border: `1.5px solid ${selected === i ? l.color : l.color + "66"}`,
                  borderRadius: 20, padding: "5px 13px", cursor: "pointer",
                  color: selected === i ? "#fff" : l.color,
                  fontSize: 10, fontFamily: FM, fontWeight: selected === i ? 700 : 400,
                  transition: "all 0.15s",
                }}>
                {l.name} · {l.sub} &nbsp;<span style={{ opacity: 0.6 }}>K={l.K.toFixed(3)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: info panel */}
        <div style={{ minWidth: 0 }}>
          {/* Drug score cards */}
          {arrows.map(a => {
            const good = a.d.C_bone >= 5;
            return (
              <div key={a.drug} style={{ marginBottom: 10, padding: "10px 14px", background: "#12121f", borderRadius: 8, border: `1px solid ${a.color}33` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: a.color, fontFamily: FM }}>{a.drug}</span>
                  <span style={{ fontSize: 11, color: good ? "#22c55e" : "#ef4444", fontFamily: FM, fontWeight: 700 }}>
                    C_bone = {a.d.C_bone.toFixed(2)} {good ? "✓" : "✗"}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: "#64748b", fontFamily: FM, marginBottom: 4 }}>
                  K = {a.d.K_pathway.toFixed(3)} = {a.d.K_admet.toFixed(3)} + {a.d.K_pen.toFixed(3)} + {a.d.K_bio_eff.toFixed(3)} + {a.d.K_res.toFixed(3)}
                </div>
                <div style={{ fontSize: 10, color: reachColor(a.reach), fontFamily: FM }}>→ {reachLabel(a.reach)}</div>
              </div>
            );
          })}

          {/* Selected ring detail */}
          {selected !== null ? (
            <div style={{ padding: "12px 14px", background: "#0d0d1a", borderRadius: 8, border: `1px solid ${layers[selected].color}55`, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: layers[selected].color, fontFamily: FM, marginBottom: 6 }}>
                {layers[selected].name} · {layers[selected].sub}
              </div>
              <div style={{ fontSize: 10, color: "#22c55e", fontFamily: FM, marginBottom: 8 }}>{layers[selected].formula}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>{layers[selected].why}</div>
            </div>
          ) : (
            <div style={{ padding: "10px 14px", background: "#0d0d1a", borderRadius: 8, border: "1px solid #1e2030", marginTop: 4 }}>
              <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.8, fontFamily: FM }}>
                K_res (total) = {(layers[0].K + layers[1].K + layers[2].K).toFixed(3)}<br />
                C_bone = τ / K_total · Smaller K → better penetration<br />
                <span style={{ color: "#334155" }}>← Click a ring tag to see its formula</span>
              </div>
            </div>
          )}

          <div style={{ marginTop: 10, padding: "10px 14px", background: "#0a1a0a", borderRadius: 8, border: "1px solid #22c55e22" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#22c55e", fontFamily: FM, marginBottom: 4 }}>WHAT DOES "WORKING" LOOK LIKE?</div>
            <div style={{ fontSize: 10, color: "#4a7c59", lineHeight: 1.7 }}>
              For a drug to reach R3 it needs:<br />
              • K_pen &lt; 3 (low R_bone, good bone penetration)<br />
              • K_biofilm &lt; 2.5 (MIC/MBEC ratio manageable)<br />
              • Rifampin in combo (only drug entering SCVs)<br />
              Try <strong style={{ color: "#22c55e" }}>Ceftaroline + Rifampin</strong> to see full penetration.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VIZ 2: PATHWAY IMPEDANCE WATERFALL
// ============================================================
function PathwayWaterfall({ patient }) {
  const [expanded, setExpanded] = useState(null); // `${di}-${segKey}` or `${di}-row`
  const pt = { ...patient, hasRifampin: true };
  const drugs = ["Ceftaroline", "Rifampin", "Vancomycin", "Linezolid", "Daptomycin", "Clindamycin"];
  const data = drugs.map(name => computeDrug(name, pt));
  const maxK = Math.max(...data.map(d => d.K_pathway));
  const bestC = Math.max(...data.map(d => d.C_bone));

  const segments = [
    { key: "K_admet",   label: "ADMET",    color: "#3b82f6" },
    { key: "K_pen",     label: "Pen",      color: "#f97316" },
    { key: "K_bio_eff", label: "Biofilm",  color: "#ef4444" },
    { key: "K_res",     label: "Reserv.",  color: "#a855f7" },
  ];

  const drillRows = (d) => [
    {
      seg: "K_admet", color: "#3b82f6",
      formula: `K_admet = ${d.K_admet.toFixed(3)}`,
      explain: `ADMET curvature. Serum PK losses (absorption, distribution, metabolism, excretion, toxicity). Fixed per drug.`,
    },
    {
      seg: "K_pen", color: "#f97316",
      formula: `R_bone=${DRUGS[d.name].R_bone} → R_eff=${d.R_eff.toFixed(3)} → K_pen = 1/${d.R_eff.toFixed(3)} − 1 = ${d.K_pen.toFixed(3)}`,
      explain: `Only ${(d.R_eff * 100).toFixed(0)}% of serum concentration reaches bone. CRP ${patient.crp} inflates R_eff by ${((d.R_eff / DRUGS[d.name].R_bone - 1)*100).toFixed(0)}%.`,
    },
    {
      seg: "K_bio_eff", color: "#ef4444",
      formula: `log₁₀(${DRUGS[d.name].MBEC}/${DRUGS[d.name].MIC}) = ${d.K_bio_raw.toFixed(3)} × ${(patient.biofilm_prob).toFixed(2)} = ${d.K_bio_eff.toFixed(3)}`,
      explain: `MBEC/MIC ratio shows how hard it is to kill biofilm vs planktonic bacteria. Weighted by ${(patient.biofilm_prob*100).toFixed(0)}% biofilm probability.`,
    },
    {
      seg: "K_res", color: "#a855f7",
      formula: `SAC ${d.K_res_SAC.toFixed(3)} + Matrix ${d.K_res_mat.toFixed(3)} + Intra ${d.K_res_intra.toFixed(3)} = ${d.K_res.toFixed(3)}`,
      explain: `Three reservoirs add impedance. SAC=(1−P_drain)×0.5. Matrix=(1−P_deb)×K_pen. Intra=0.8×frac×(0.4 if rifampin).${d.name === "Rifampin" ? " Rifampin active (×0.4 modifier)." : ""}`,
    },
  ];

  return (
    <div style={{ background: "#0a0a14", borderRadius: 12, padding: 24, border: "1px solid #1e1e30" }}>
      <div style={{ fontSize: 11, fontFamily: FM, color: "#64748b", letterSpacing: 2, marginBottom: 4 }}>PATHWAY IMPEDANCE WATERFALL</div>
      <div style={{ fontSize: 10, color: "#475569", marginBottom: 20 }}>Click any bar segment to drill down into the formula. Click a drug name to see full breakdown.</div>
      {data.map((d, di) => {
        const isBest = d.C_bone === bestC;
        const rowOpen = expanded === `${di}-row`;
        return (
          <div key={d.name} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
              {/* Drug name — click for full row */}
              <button onClick={() => setExpanded(rowOpen ? null : `${di}-row`)} style={{
                fontSize: 12, fontWeight: 700, color: d.color, fontFamily: FM, width: 106,
                background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0,
                textDecoration: rowOpen ? "underline" : "none",
              }}>{isBest ? "★ " : ""}{d.name}</button>

              {/* Segmented bar */}
              <div style={{ flex: 1, height: 28, background: "#12121f", borderRadius: 4, overflow: "hidden", display: "flex" }}>
                {segments.map(seg => {
                  const val = d[seg.key];
                  const pct = (val / maxK) * 100;
                  const isOpen = expanded === `${di}-${seg.key}`;
                  return (
                    <div key={seg.key}
                      onClick={() => setExpanded(isOpen ? null : `${di}-${seg.key}`)}
                      title={`${seg.label}: ${val.toFixed(3)}`}
                      style={{
                        width: `${pct}%`, height: "100%", background: seg.color,
                        opacity: isOpen ? 1 : 0.65, cursor: "pointer",
                        transition: "opacity 0.15s", borderRight: "1px solid #0a0a14",
                        display: "flex", alignItems: "center", overflow: "hidden",
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = 1}
                      onMouseLeave={e => { if (!isOpen) e.currentTarget.style.opacity = "0.65"; }}
                    >
                      {pct > 10 && (
                        <span style={{ paddingLeft: 5, fontSize: 10, color: "#fff", fontFamily: FM, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {seg.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* K total */}
              <span style={{ fontSize: 11, fontFamily: FM, color: "#94a3b8", width: 48, textAlign: "right", flexShrink: 0 }}>
                K={d.K_pathway.toFixed(2)}
              </span>
              {/* C bone */}
              <span style={{
                fontSize: 12, fontFamily: FM, fontWeight: 700, width: 64, textAlign: "right", flexShrink: 0,
                color: d.C_bone > 5 ? "#22c55e" : d.C_bone > 2 ? "#f59e0b" : "#ef4444",
              }}>
                C={d.C_bone.toFixed(1)}
              </span>
            </div>

            {/* Segment drill-down */}
            {segments.map(seg => expanded === `${di}-${seg.key}` && (() => {
              const row = drillRows(d).find(r => r.seg === seg.key);
              return (
                <div key={seg.key} style={{
                  marginLeft: 116, marginBottom: 4, padding: "10px 14px",
                  background: "#0d0d1a", border: `1px solid ${seg.color}44`, borderRadius: 6,
                }}>
                  <div style={{ fontSize: 11, fontFamily: FM, color: seg.color, fontWeight: 700, marginBottom: 5 }}>
                    {row.formula}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>{row.explain}</div>
                </div>
              );
            })())}

            {/* Full row drill-down */}
            {rowOpen && (
              <div style={{ marginLeft: 116, marginBottom: 4, padding: "12px 14px", background: "#0d0d1a", border: `1px solid ${d.color}33`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: d.color, fontFamily: FM, marginBottom: 10 }}>{d.name} — full component breakdown</div>
                {drillRows(d).map(row => (
                  <div key={row.seg} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.color, marginTop: 3, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 11, fontFamily: FM, color: row.color, fontWeight: 700 }}>{row.formula}</div>
                      <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.5, marginTop: 2 }}>{row.explain}</div>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #1e2030", paddingTop: 8, marginTop: 4, fontSize: 12, fontFamily: FM, fontWeight: 700, color: d.C_bone > 5 ? "#22c55e" : "#ef4444" }}>
                  K_total = {d.K_pathway.toFixed(4)} → C_bone = τ/K = {DRUGS[d.name].tau}/{d.K_pathway.toFixed(4)} = {d.C_bone.toFixed(3)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
        {segments.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: s.color, opacity: 0.8 }} />
            <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: FM }}>{s.label}</span>
          </div>
        ))}
        <span style={{ fontSize: 10, color: "#475569", fontFamily: FM, marginLeft: "auto" }}>★ = best C_bone</span>
      </div>
    </div>
  );
}

// ============================================================
// VIZ 3: TIMELINE SIMULATION
// ============================================================
function TimelineSimulation({ patient }) {
  const [scrubDay, setScrubDay] = useState(30);
  const [activeEvent, setActiveEvent] = useState(null);
  const [activeTile, setActiveTile] = useState(null);
  const svgRef = useRef(null);
  const isDragging = useRef(false);

  const days = 180;
  const width = 680, height = 260, padL = 48, padR = 24, padT = 36, padB = 36;
  const gW = width - padL - padR, gH = height - padT - padB;

  const getCRP        = d => 250 * Math.exp(-0.03 * d) + 20;
  const getBioProb    = d => Math.min(0.2 + d * 0.004, 0.95);
  const getIntraFrac  = d => Math.min(0.1 + d * 0.002, 0.6);

  const computeAtDay = (drug, day, hasRif) => {
    const crp = getCRP(day);
    const pt = {
      crp, biofilm_prob: getBioProb(day),
      P_drain: day > 10 ? 0.9 : 0.1, P_debride: day > 30 ? 0.8 : 0.1,
      intra_frac: getIntraFrac(day), hasRifampin: hasRif,
    };
    return computeDrug(drug, pt);
  };

  // Both lines computed purely from the Keske formula — no multipliers
  const vanc_pts = [], combo_pts = [];
  for (let d = 0; d <= days; d += 2) {
    const v = computeAtDay("Vancomycin", d, false);
    const c = computeAtDay("Ceftaroline", d, true); // hasRifampin:true → K_res_intra × 0.4
    vanc_pts.push({ day: d, C: v.C_bone });
    combo_pts.push({ day: d, C: c.C_bone });
  }

  const maxC = Math.max(...vanc_pts.map(p => p.C), ...combo_pts.map(p => p.C), 5) * 1.15;
  const xp = d => padL + (d / days) * gW;
  const yp = c => padT + gH - (Math.min(c, maxC) / maxC) * gH;
  const toPath = pts => pts.map((p, i) => `${i === 0 ? "M" : "L"}${xp(p.day).toFixed(1)},${yp(p.C).toFixed(1)}`).join(" ");

  const events = [
    { day: 1,  label: "Admit",      color: "#ef4444", detail: "Steven presents with 6-year history. CRP 250. Febrile. Empirical vancomycin started. Biofilm at 20% on day 1." },
    { day: 10, label: "Surgery 1",  color: "#f97316", detail: "First debridement. ~90% surgical drainage achieved. K_res_SAC drops from 0.25 → 0.05. C_bone rises immediately." },
    { day: 30, label: "Surgery 2",  color: "#f97316", detail: "Second debridement. Bone matrix accessible. Biofilm still 72% established — monotherapy insufficient." },
    { day: 45, label: "ABX switch", color: "#3b82f6", detail: "Switch to ceftaroline + rifampin combination. Parallel combo resistance formula drops K. C_bone improves ~1.8×." },
    { day: 90, label: "Relapse",    color: "#ef4444", detail: "CRP rises again. Intracellular SCVs persisted undetected. Biofilm re-established to 95%. Model predicted this from day 1 geometry." },
  ];

  const getMouseDay = e => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const mx = (e.clientX - rect.left) * scaleX - padL;
    if (mx < 0 || mx > gW) return null;
    return Math.min(Math.max(Math.round((mx / gW) * days), 0), days);
  };

  const interp = (pts, day) => pts[Math.min(Math.round(day / 2), pts.length - 1)];

  const hd = scrubDay !== null ? {
    vanc:   interp(vanc_pts,  scrubDay),
    combo:  interp(combo_pts, scrubDay),
    crp:    getCRP(scrubDay),
    biofilm: getBioProb(scrubDay),
  } : null;

  return (
    <div style={{ background: "#0a0a14", borderRadius: 12, padding: 24, border: "1px solid #1e1e30" }}>
      <div style={{ fontSize: 11, fontFamily: FM, color: "#64748b", letterSpacing: 2, marginBottom: 4 }}>TREATMENT TIMELINE</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4, lineHeight: 1.6 }}>
        This chart shows how well two antibiotic strategies penetrate Steven's bone over 6 months of treatment.
        The <span style={{ color: "#22c55e", fontWeight: 700 }}>green line</span> is the Ceftaroline + Rifampin combination.
        The <span style={{ color: "#ef4444", fontWeight: 700 }}>red line</span> is Vancomycin alone.
        Anything above the <span style={{ color: "#475569" }}>dashed C=5 line</span> is clinically adequate bone concentration.
      </div>
      <div style={{ fontSize: 10, color: "#475569", marginBottom: 16 }}>
        Drag the slider below to inspect values at any day. Click the numbered markers to read what happened at each clinical event.
      </div>

      <svg ref={svgRef} width="100%" viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", cursor: "default", touchAction: "none", userSelect: "none" }}
        onMouseMove={e => { if (isDragging.current) { const d = getMouseDay(e); if (d !== null) setScrubDay(d); } }}
        onMouseDown={e => { isDragging.current = true; const d = getMouseDay(e); if (d !== null) setScrubDay(d); }}
        onMouseUp={() => { isDragging.current = false; }}
        onMouseLeave={() => { isDragging.current = false; }}>

        {/* Grid rows */}
        {[5, 10, 15, 20, 25].map(v => yp(v) > padT && yp(v) < padT + gH && (
          <g key={v}>
            <line x1={padL} y1={yp(v)} x2={padL + gW} y2={yp(v)} stroke="#1e1e30" strokeWidth={0.5} />
            <text x={padL - 6} y={yp(v) + 4} textAnchor="end" fill="#475569" fontSize={10} fontFamily={FM}>{v}</text>
          </g>
        ))}
        {/* X axis ticks */}
        {[0, 30, 60, 90, 120, 150, 180].map(d => (
          <text key={d} x={xp(d)} y={height - 4} textAnchor="middle" fill="#475569" fontSize={10} fontFamily={FM}>D{d}</text>
        ))}

        {/* C=5 threshold */}
        <line x1={padL} y1={yp(5)} x2={padL + gW} y2={yp(5)} stroke="#475569" strokeWidth={1} strokeDasharray="5,4" />
        <text x={padL + gW + 2} y={yp(5) + 4} fill="#64748b" fontSize={9} fontFamily={FM}>C=5</text>

        {/* Fill: combo above threshold */}
        <path d={`${toPath(combo_pts)} L${xp(days)},${yp(0)} L${xp(0)},${yp(0)} Z`} fill="#22c55e" opacity={0.06} />

        {/* Lines — real Keske formula C_bone values only */}
        <path d={toPath(vanc_pts)}   fill="none" stroke="#ef4444" strokeWidth={2} />
        <path d={toPath(combo_pts)}  fill="none" stroke="#22c55e" strokeWidth={2.5} />

        {/* Event markers */}
        {events.map((ev, i) => (
          <g key={i} style={{ cursor: "pointer" }} onClick={() => setActiveEvent(activeEvent === i ? null : i)}>
            <line x1={xp(ev.day)} y1={padT} x2={xp(ev.day)} y2={padT + gH}
              stroke={ev.color} strokeWidth={activeEvent === i ? 2 : 1} strokeDasharray="3,3" opacity={0.6} />
            <circle cx={xp(ev.day)} cy={padT - 10} r={9}
              fill={activeEvent === i ? ev.color : "#0d0d1a"} stroke={ev.color} strokeWidth={1.5} />
            <text x={xp(ev.day)} y={padT - 6} textAnchor="middle" fill={activeEvent === i ? "#fff" : ev.color} fontSize={9} fontFamily={FM} fontWeight={700}>{i + 1}</text>
            <text x={xp(ev.day)} y={padT + gH + 18} textAnchor="middle" fill={ev.color} fontSize={8} fontFamily={FM}>{ev.label}</text>
          </g>
        ))}

        {/* Scrub crosshair */}
        {scrubDay !== null && (
          <g>
            <line x1={xp(scrubDay)} y1={padT} x2={xp(scrubDay)} y2={padT + gH} stroke="#fff" strokeWidth={1} opacity={0.25} />
            {hd && <>
              <circle cx={xp(scrubDay)} cy={yp(hd.vanc?.C || 0)} r={5} fill="#ef4444" stroke="#fff" strokeWidth={1} />
              <circle cx={xp(scrubDay)} cy={yp(hd.combo?.C || 0)} r={5} fill="#22c55e" stroke="#fff" strokeWidth={1} />
            </>}
          </g>
        )}

        {/* Y axis label */}
        <text x={10} y={padT + gH / 2 + 16} transform={`rotate(-90,10,${padT + gH / 2})`} textAnchor="middle" fill="#334155" fontSize={9} fontFamily={FM}>C_bone</text>
      </svg>

      {/* Drag scrubber — padding matches SVG chart area proportionally */}
      <div style={{ padding: `0 ${(padR/width*100).toFixed(1)}% 0 ${(padL/width*100).toFixed(1)}%`, marginTop: 2 }}>
        <input type="range" min={0} max={180} value={scrubDay ?? 0}
          onChange={e => setScrubDay(Number(e.target.value))}
          style={{ width: "100%", accentColor: "#3b82f6", cursor: "pointer" }} />
      </div>

      {/* Live stat cards — click any tile to get a formula-linked explanation */}
      {hd && (() => {
        const tiles = [
          { key: "day",   label: "Day",         color: "#e2e8f0", fmt: v => `${v}`,
            interp: v => v < 10 ? "Acute phase — empirical antibiotics only. CRP at peak. K_pen maximally elevated by inflammation." : v < 30 ? "Surgical window — first debridement imminent. K_res_SAC is about to drop sharply after drainage." : v < 60 ? "Recovery — bone matrix now accessible. Antibiotics penetrating cleared tissue." : v < 90 ? "Optimization — targeted combination in effect. K_res components improving." : "Surveillance — monitoring for SCV relapse. Intracellular reservoirs may still harbour bacteria." },
          { key: "vanc",  label: "Vanc C_bone", color: "#ef4444", fmt: v => v.toFixed(2),
            interp: v => v >= 5 ? `✓ C=${v.toFixed(2)} ≥ 5 — Vancomycin meeting the Keske coherence criterion. Bone concentration adequate.` : v >= 3 ? `⚠ C=${v.toFixed(2)} (sub-therapeutic). Suppressing but not eradicating. High relapse risk.` : `✗ C=${v.toFixed(2)} — far below threshold. Bone impedance K is too high for Vancomycin alone.` },
          { key: "combo", label: "Cef+Rif C",   color: "#22c55e", fmt: v => v.toFixed(2),
            interp: v => v >= 5 ? `✓ C=${v.toFixed(2)} ≥ 5 — Ceftaroline+Rifampin achieving coherence. Rifampin reduces K_res_intra by 60%.` : v >= 3 ? `⚠ C=${v.toFixed(2)} — approaching threshold. Rifampin lowering intracellular impedance progressively.` : `✗ C=${v.toFixed(2)} — biofilm or surgical impedance still dominating. K too high.` },
          { key: "crp",   label: "CRP",          color: "#f97316", fmt: v => v.toFixed(0),
            interp: v => v > 150 ? `CRP ${v.toFixed(0)} mg/L — high. R_bone_eff = R_bone × (1 + 0.006 × ${(v-100).toFixed(0)}) inflates K_pen, directly lowering C_bone.` : v > 50 ? `CRP ${v.toFixed(0)} mg/L — moderate. Inflammation resolving; R_bone_eff modifier shrinking; drug penetration improving.` : `CRP ${v.toFixed(0)} mg/L — low. CRP modifier inactive below 100 mg/L. R_bone_eff at baseline.` },
          { key: "bio",   label: "Biofilm %",    color: "#a855f7", fmt: v => `${v.toFixed(0)}%`,
            interp: v => v > 70 ? `Mature biofilm (${v.toFixed(0)}%). K_biofilm = log₁₀(MBEC/MIC) × ${(v/100).toFixed(2)} — at maximum. Surgery + rifampin are the only effective interventions now.` : v > 30 ? `Establishing biofilm (${v.toFixed(0)}%). K_biofilm rising. Combination therapy and surgical disruption critical.` : `Early biofilm (${v.toFixed(0)}%). Bacteria mostly planktonic. Best window for antibiotic effectiveness.` },
        ];
        const vals = [scrubDay, hd.vanc?.C, hd.combo?.C, hd.crp, hd.biofilm * 100];
        return (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 10 }}>
              {tiles.map((c, i) => (
                <div key={c.key} onClick={() => setActiveTile(activeTile === i ? null : i)}
                  style={{ padding: "8px 10px", background: "#12121f", borderRadius: 6,
                    border: `1px solid ${activeTile === i ? c.color : c.color + "22"}`,
                    cursor: "pointer", transition: "border-color 0.2s" }}>
                  <div style={{ fontSize: 9, color: "#64748b", fontFamily: FM, marginBottom: 2 }}>{c.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c.color, fontFamily: FM }}>{c.fmt(vals[i])}</div>
                  <div style={{ fontSize: 8, color: "#2a3040", fontFamily: FM, marginTop: 1 }}>click to explain</div>
                </div>
              ))}
            </div>
            {activeTile !== null && (
              <div style={{ marginTop: 8, padding: "10px 14px", background: "#0d0d1a",
                border: `1px solid ${tiles[activeTile].color}33`, borderRadius: 8 }}>
                <div style={{ fontSize: 10, fontFamily: FM, fontWeight: 700, color: tiles[activeTile].color, marginBottom: 4 }}>
                  {tiles[activeTile].label}
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7 }}>{tiles[activeTile].interp(vals[activeTile])}</div>
              </div>
            )}
          </>
        );
      })()}

      {/* Event detail card */}
      {activeEvent !== null && (
        <div style={{ marginTop: 12, padding: "12px 16px", background: "#0d0d1a", border: `1px solid ${events[activeEvent].color}44`, borderRadius: 8 }}>
          <div style={{ fontSize: 10, fontFamily: FM, color: events[activeEvent].color, fontWeight: 700, marginBottom: 2 }}>
            EVENT {activeEvent + 1} · {events[activeEvent].label.toUpperCase()} · DAY {events[activeEvent].day}
          </div>
          <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.7, marginTop: 4 }}>{events[activeEvent].detail}</div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 20, fontSize: 10, fontFamily: FM, marginTop: 10, flexWrap: "wrap", color: "#64748b" }}>
        <span><span style={{ color: "#22c55e" }}>━━</span> Cef+Rif C_bone (Keske formula)</span>
        <span><span style={{ color: "#ef4444" }}>━━</span> Vancomycin C_bone (Keske formula)</span>
        <span><span style={{ color: "#475569" }}>┅┅</span> C=5 cure threshold</span>
      </div>
    </div>
  );
}


// ============================================================
// VIZ 4: DRUG COMPARISON RADAR
// ============================================================
function DrugRadar({ patient, selectedDrugs }) {
  const [lockedDrug, setLockedDrug] = useState(null);
  const [lockedAxis, setLockedAxis] = useState(null);
  const pt = { ...patient, hasRifampin: selectedDrugs.includes("Rifampin") };
  const computed = selectedDrugs.map(name => computeDrug(name, pt));

  const axes = [
    { key: "K_pen",       label: "K_pen",     full: "Bone Penetration",       desc: "1/R_bone_eff − 1. Higher value = harder for drug to get into bone. Lower is better." },
    { key: "K_bio_eff",   label: "K_biofilm", full: "Biofilm Impedance",       desc: "log₁₀(MBEC/MIC) × biofilm probability. A high score means biofilm is a major blocker." },
    { key: "K_res_SAC",   label: "K_abscess", full: "Abscess / SAC Reservoir", desc: "(1 − P_drain) × 0.5. Uncleared abscess space traps bacteria. Surgery reduces this." },
    { key: "K_res_mat",   label: "K_matrix",  full: "Bone Matrix Reservoir",   desc: "(1 − P_debride) × K_pen. Dead bone not excised keeps bacteria sheltered." },
    { key: "K_res_intra", label: "K_intra",   full: "Intracellular Reservoir", desc: "0.8 × frac × (0.4 if rifampin). SCVs inside osteoblasts. Only rifampin reaches here." },
    { key: "K_admet",     label: "K_admet",   full: "ADMET Curvature",         desc: "Serum PK losses: absorption, distribution, metabolism, excretion, toxicity." },
  ];

  const cx = 180, cy = 180, r = 120;
  // Per-axis normalization so every dimension fills the full radius
  const axisMax = axes.reduce((acc, a) => {
    acc[a.key] = Math.max(...computed.map(d => d[a.key]), 0.01);
    return acc;
  }, {});
  const angleStep = (2 * Math.PI) / axes.length;

  const getPoint = (val, i) => {
    const angle = i * angleStep - Math.PI / 2;
    const rv = (Math.min(val, axisMax[axes[i].key]) / axisMax[axes[i].key]) * r;
    return { x: cx + rv * Math.cos(angle), y: cy + rv * Math.sin(angle) };
  };
  const getLabelPt = (i, scale = 1.28) => {
    const angle = i * angleStep - Math.PI / 2;
    return { x: cx + r * scale * Math.cos(angle), y: cy + r * scale * Math.sin(angle) };
  };

  const axisDrillData = lockedAxis !== null
    ? computed.map(d => ({ name: d.name, color: d.color, val: d[axes[lockedAxis].key], pct: (d[axes[lockedAxis].key] / axisMax[axes[lockedAxis].key]) * 100 })).sort((a, b) => a.val - b.val)
    : null;

  return (
    <div style={{ background: "#0a0a14", borderRadius: 12, padding: 24, border: "1px solid #1e1e30" }}>
      <div style={{ fontSize: 11, fontFamily: FM, color: "#64748b", letterSpacing: 2, marginBottom: 4 }}>DRUG COMPARISON RADAR · SMALLER POLYGON = BETTER</div>
      <div style={{ fontSize: 10, color: "#475569", marginBottom: 16 }}>Click a drug polygon or name to see full breakdown. Click an axis label to compare all drugs on that dimension.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "flex-start" }}>
        <svg width="100%" viewBox="0 0 360 360" style={{ aspectRatio: "1/1" }}>
          {/* Grid rings */}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <circle key={f} cx={cx} cy={cy} r={r * f} fill="none" stroke="#1e1e30" strokeWidth={0.5} />
          ))}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <text key={f} x={cx + 5} y={cy - r * f + 4} fill="#2a3040" fontSize={7} fontFamily={FM}>{(axisMax[axes[0].key] * f).toFixed(2)}</text>
          ))}

          {/* Axes + clickable labels */}
          {axes.map((a, i) => {
            const p = getPoint(axisMax[a.key], i);
            const lp = getLabelPt(i);
            const isActive = lockedAxis === i && !lockedDrug;
            return (
              <g key={a.key} style={{ cursor: "pointer" }} onClick={() => { setLockedAxis(lockedAxis === i ? null : i); setLockedDrug(null); }}>
                <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={isActive ? "#3b82f6" : "#1e1e30"} strokeWidth={isActive ? 2 : 0.5} />
                <text x={lp.x} y={lp.y + 3} textAnchor="middle"
                  fill={isActive ? "#3b82f6" : "#94a3b8"}
                  fontSize={9} fontFamily={FM} fontWeight={isActive ? 700 : 500}>
                  {a.label}
                </text>
              </g>
            );
          })}

          {/* Drug polygons */}
          {computed.map((d) => {
            const pts = axes.map((a, i) => getPoint(d[a.key], i));
            const pathStr = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") + " Z";
            const isLocked = lockedDrug === d.name;
            const dimmed = lockedDrug !== null && !isLocked;
            return (
              <g key={d.name} style={{ cursor: "pointer" }}
                onClick={() => { setLockedDrug(lockedDrug === d.name ? null : d.name); setLockedAxis(null); }}>
                <path d={pathStr} fill={d.color} opacity={dimmed ? 0.03 : isLocked ? 0.28 : 0.12}
                  stroke={d.color} strokeWidth={isLocked ? 3 : 1.5} />
                {pts.map((p, i) => {
                  const isWorst = computed.every(od => od[axes[i].key] <= d[axes[i].key]);
                  return <circle key={i} cx={p.x} cy={p.y} r={isLocked ? 4.5 : 2.5} fill={d.color}
                    opacity={dimmed ? 0.1 : 1} stroke={isWorst ? "#fff" : "none"} strokeWidth={1} />;
                })}
              </g>
            );
          })}
          <text x={cx} y={cy + 4} textAnchor="middle" fill="transparent" fontSize={0} fontFamily={FM}></text>
        </svg>

        <div style={{ flex: "1 1 200px", minWidth: 180 }}>
          {/* Drug legend / selector */}
          {computed.map(d => {
            const isLocked = lockedDrug === d.name;
            const dimmed = lockedDrug !== null && !isLocked;
            return (
              <div key={d.name}
                onClick={() => { setLockedDrug(lockedDrug === d.name ? null : d.name); setLockedAxis(null); }}
                style={{
                  display: "flex", gap: 8, marginBottom: 6, padding: "6px 10px", borderRadius: 6, cursor: "pointer",
                  border: `1px solid ${isLocked ? d.color : "transparent"}`,
                  background: isLocked ? `${d.color}12` : "transparent",
                  opacity: dimmed ? 0.3 : 1, transition: "all 0.2s",
                }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: d.color, marginTop: 2, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: d.color, fontFamily: FM }}>{d.name}</div>
                  <div style={{ fontSize: 10, color: "#64748b", fontFamily: FM }}>K={d.K_pathway.toFixed(2)} · C={d.C_bone.toFixed(1)}</div>
                </div>
              </div>
            );
          })}

          {/* Locked drug breakdown */}
          {lockedDrug && (() => {
            const d = computed.find(dc => dc.name === lockedDrug);
            if (!d) return null;
            return (
              <div style={{ marginTop: 10, padding: 10, background: "#0d0d1a", borderRadius: 8, border: `1px solid ${d.color}44` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: d.color, fontFamily: FM, marginBottom: 8 }}>{lockedDrug} — component scores</div>
                {axes.map(a => (
                  <div key={a.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: "#64748b", fontFamily: FM, width: 72 }}>{a.label}</span>
                    <div style={{ flex: 1, height: 7, background: "#1e1e30", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${(d[a.key] / axisMax[a.key]) * 100}%`, height: "100%", background: d.color, opacity: 0.85 }} />
                    </div>
                    <span style={{ fontSize: 11, color: d.color, fontFamily: FM, width: 42, textAlign: "right", fontWeight: 700 }}>{d[a.key].toFixed(3)}</span>
                  </div>
                ))}
                <div style={{ borderTop: "1px solid #1e2030", marginTop: 6, paddingTop: 6, fontSize: 11, fontFamily: FM }}>
                  <span style={{ color: "#64748b" }}>K_total = </span>
                  <span style={{ color: d.color, fontWeight: 700 }}>{d.K_pathway.toFixed(4)}</span>
                  <span style={{ color: "#64748b" }}> · C_bone = </span>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>{d.C_bone.toFixed(2)}</span>
                </div>
              </div>
            );
          })()}

          {/* Locked axis breakdown */}
          {lockedAxis !== null && !lockedDrug && (
            <div style={{ marginTop: 10, padding: 10, background: "#0d0d1a", borderRadius: 8, border: "1px solid #3b82f644" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", fontFamily: FM, marginBottom: 4 }}>{axes[lockedAxis].full}</div>
              <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.5, marginBottom: 10 }}>{axes[lockedAxis].desc}</div>
              {axisDrillData?.map(d => (
                <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: d.color, fontFamily: FM, width: 82, fontWeight: 700 }}>{d.name}</span>
                  <div style={{ flex: 1, height: 8, background: "#1e1e30", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${d.pct}%`, height: "100%", background: d.color, opacity: 0.85 }} />
                  </div>
                  <span style={{ fontSize: 11, color: d.color, fontFamily: FM, width: 42, textAlign: "right" }}>{d.val.toFixed(3)}</span>
                </div>
              ))}
            </div>
          )}

          {!lockedDrug && lockedAxis === null && (
            <div style={{ marginTop: 12, fontSize: 10, color: "#475569", lineHeight: 1.7, fontFamily: FM }}>
              ↗ Click a polygon to see its breakdown<br />
              ↗ Click an axis label to rank all drugs<br />
              ○ White-circled vertex = worst drug on that axis
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VIZ 5: WHAT-IF CALCULATOR
// ============================================================
function DayOneWhatIf() {
  const [crp, setCrp] = useState(250);
  const [biofilmPct, setBiofilmPct] = useState(95);
  const [drainPct, setDrainPct] = useState(90);
  const [debridePct, setDebridePct] = useState(80);
  const [intraFrac, setIntraFrac] = useState(40);
  const [hasRif, setHasRif] = useState(false);
  const [activePreset, setActivePreset] = useState(1); // default = 6 YRS CHRONIC
  const [optMsg, setOptMsg] = useState(null);

  const pt = {
    crp,
    biofilm_prob: biofilmPct / 100,
    P_drain: drainPct / 100,
    P_debride: debridePct / 100,
    intra_frac: intraFrac / 100,
    hasRifampin: hasRif,
  };

  const BASELINE = { crp: 250, biofilm_prob: 0.95, P_drain: 0.9, P_debride: 0.8, intra_frac: 0.4, hasRifampin: false };
  const DRUGS_LIST = ["Vancomycin", "Ceftaroline", "Clindamycin", "Linezolid", "Rifampin", "Daptomycin"];
  const data = DRUGS_LIST.map(name => computeDrug(name, pt));
  const baseline = DRUGS_LIST.map(name => computeDrug(name, BASELINE));
  const maxC = Math.max(...data.map(d => d.C_bone), ...baseline.map(d => d.C_bone), 5) * 1.15;
  const CHART_H = 300;

  const presets = [
    { label: "DAY 1 ACUTE",   color: "#22c55e", desc: "Fresh infection, no biofilm yet. Surgery just started. Best-case scenario — what drug would you pick first?",                                    v: { crp: 250, bio: 20, drain: 10, debride: 10, intra: 5  } },
    { label: "6 YRS CHRONIC", color: "#ef4444", desc: "Steven's real case: thick biofilm, good surgical clearance, but bacteria have had years to hide inside bone cells.",                          v: { crp: 250, bio: 95, drain: 90, debride: 80, intra: 40 } },
    { label: "POST-SURGERY",  color: "#3b82f6", desc: "48h after debridement: inflammation dropping, biofilm partially cleared, bone now more accessible. Which drug dominates now?",              v: { crp: 80,  bio: 75, drain: 90, debride: 80, intra: 30 } },
    { label: "RELAPSE",       color: "#f59e0b", desc: "Treatment failed. Biofilm is back, surgery was incomplete, intracellular reservoirs are full. How bad is the impedance penalty?",            v: { crp: 180, bio: 95, drain: 50, debride: 40, intra: 50 } },
  ];

  const applyPreset = (p, i) => { setActivePreset(i); setCrp(p.crp); setBiofilmPct(p.bio); setDrainPct(p.drain); setDebridePct(p.debride); setIntraFrac(p.intra); setOptMsg(null); };

  // Auto-optimize: fix patient disease state (CRP, biofilm, intraFrac), search over
  // surgical interventions (drain, debride) + rifampin to maximize best drug's C_bone.
  const autoOptimize = () => {
    const DRUGS_LIST_LOCAL = ["Vancomycin", "Ceftaroline", "Clindamycin", "Linezolid", "Rifampin", "Daptomycin"];
    let bestScore = -Infinity;
    let bestConfig = null;
    for (const rif of [false, true]) {
      for (let drain = 0; drain <= 100; drain += 10) {
        for (let debride = 0; debride <= 100; debride += 10) {
          const candidate = { crp, biofilm_prob: biofilmPct / 100, P_drain: drain / 100, P_debride: debride / 100, intra_frac: intraFrac / 100, hasRifampin: rif };
          const topC = Math.max(...DRUGS_LIST_LOCAL.map(n => computeDrug(n, candidate).C_bone));
          if (topC > bestScore) { bestScore = topC; bestConfig = { rif, drain, debride }; }
        }
      }
    }
    if (bestConfig) {
      setHasRif(bestConfig.rif);
      setDrainPct(bestConfig.drain);
      setDebridePct(bestConfig.debride);
      setActivePreset(null);
      const bestDrug = DRUGS_LIST_LOCAL.reduce((best, n) => {
        const c = computeDrug(n, { crp, biofilm_prob: biofilmPct/100, P_drain: bestConfig.drain/100, P_debride: bestConfig.debride/100, intra_frac: intraFrac/100, hasRifampin: bestConfig.rif }).C_bone;
        return c > best.c ? { name: n, c } : best;
      }, { name: "", c: -1 });
      if (bestScore >= 5) {
        setOptMsg({ ok: true, text: `✓ ${bestDrug.name} reaches C_bone ${bestScore.toFixed(1)} — green threshold cleared with${bestConfig.rif ? " Rifampin combo +" : ""} ${bestConfig.drain}% drainage / ${bestConfig.debride}% debridement.` });
      } else {
        setOptMsg({ ok: false, text: `Ceiling: ${bestScore.toFixed(1)} — even with optimal surgical clearance${bestConfig.rif ? " + Rifampin" : ""}, no drug crosses the cure threshold. The biofilm + intracellular burden is too high for monotherapy.` });
      }
    }
  };

  const sliders = [
    { label: "CRP (inflammation)",   value: crp,        min: 0,  max: 500, color: "#ef4444", unit: "mg/L",     set: setCrp },
    { label: "Biofilm probability",   value: biofilmPct, min: 5,  max: 100, color: "#f97316", unit: "%",        set: setBiofilmPct },
    { label: "Surgical drainage",     value: drainPct,   min: 0,  max: 100, color: "#22c55e", unit: "% done",   set: setDrainPct },
    { label: "Debridement",           value: debridePct, min: 0,  max: 100, color: "#22c55e", unit: "% done",   set: setDebridePct },
    { label: "Intracellular frac.",   value: intraFrac,  min: 0,  max: 80,  color: "#a855f7", unit: "%",        set: setIntraFrac },
  ];

  return (
    <div style={{ background: "#0a0a14", borderRadius: 12, padding: 24, border: "1px solid #1e1e30" }}>
      <div style={{ fontSize: 11, fontFamily: FM, color: "#64748b", letterSpacing: 2, marginBottom: 4 }}>WHAT-IF CALCULATOR</div>
      <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16, lineHeight: 1.6 }}>
        Pick a clinical scenario below, then drag the sliders to tweak any parameter.
        The bar chart shows how well each drug penetrates bone under those exact conditions.
      </div>

      {/* Presets */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {presets.map((p, i) => {
          const isActive = activePreset === i;
          return (
            <button key={p.label} onClick={() => applyPreset(p.v, i)} style={{
              padding: "7px 14px", fontSize: 10, fontFamily: FM, fontWeight: 700, letterSpacing: 1,
              background: isActive ? `${p.color}20` : "#12121f",
              border: `1px solid ${isActive ? p.color : p.color + "44"}`,
              color: p.color, borderRadius: 6, cursor: "pointer",
              boxShadow: isActive ? `0 0 8px ${p.color}44` : "none",
            }}>{p.label}</button>
          );
        })}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontFamily: FM, color: "#94a3b8", cursor: "pointer", marginLeft: 8 }}>
          <input type="checkbox" checked={hasRif} onChange={e => { setHasRif(e.target.checked); setOptMsg(null); }} style={{ accentColor: "#f59e0b", width: 14, height: 14 }} />
          + Rifampin in combo
        </label>
        <button onClick={autoOptimize} style={{
          marginLeft: 8, padding: "7px 14px", fontSize: 10, fontFamily: FM, fontWeight: 700, letterSpacing: 1,
          background: "#0a1628", border: "1px solid #3b82f6", color: "#3b82f6", borderRadius: 6, cursor: "pointer",
        }}
          onMouseEnter={e => { e.currentTarget.style.background = "#1e3a5f"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#0a1628"; }}
        >⚡ AUTO-OPTIMIZE</button>
      </div>

      {/* Optimization result */}
      {optMsg && (
        <div style={{ marginBottom: 14, padding: "9px 14px", background: optMsg.ok ? "#05380f" : "#1a0a0a", border: `1px solid ${optMsg.ok ? "#22c55e44" : "#ef444444"}`, borderRadius: 8, fontSize: 11, color: optMsg.ok ? "#22c55e" : "#ef4444", fontFamily: FM, lineHeight: 1.6 }}>
          {optMsg.text}
        </div>
      )}

      {/* Active scenario description */}
      {activePreset !== null && (
        <div style={{ marginBottom: 20, padding: "10px 14px", background: `${presets[activePreset].color}0d`, border: `1px solid ${presets[activePreset].color}33`, borderRadius: 8 }}>
          <span style={{ fontSize: 10, fontFamily: FM, fontWeight: 700, color: presets[activePreset].color }}>{presets[activePreset].label}: </span>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{presets[activePreset].desc}</span>
          <span style={{ fontSize: 10, color: "#475569", display: "block", marginTop: 4 }}>Adjust any slider below to explore variations on this scenario.</span>
        </div>
      )}

      {/* Sliders */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10, marginBottom: 24 }}>
        {sliders.map(s => (
          <div key={s.label} style={{ background: "#12121f", borderRadius: 8, padding: "10px 14px", border: "1px solid #1e1e30" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: FM }}>{s.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: FM }}>
                {s.value}{s.unit === "mg/L" ? "" : "%"}
                <span style={{ fontSize: 9, color: "#475569", fontWeight: 400 }}> {s.unit === "mg/L" ? " mg/L" : ""}</span>
              </span>
            </div>
            <input type="range" min={s.min} max={s.max} value={s.value}
              onChange={e => { s.set(Number(e.target.value)); setOptMsg(null); }}
              style={{ width: "100%", accentColor: s.color }} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#334155", fontFamily: FM }}>
              <span>{s.min}{s.unit !== "mg/L" ? "%" : ""}</span>
              <span>{s.max}{s.unit !== "mg/L" ? "%" : ""}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontFamily: FM, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>DRUG BONE COHERENCE SCORES (C_bone = τ / K_total)</div>
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.5 }}>
          Each bar is one antibiotic. Taller = better bone penetration under your current settings.
          <span style={{ color: "#22c55e" }}> Green</span> = C_bone ≥ 5 (adequate).
          <span style={{ color: "#ef4444" }}> Red</span> = C_bone &lt; 5 (drug can't overcome the impedance — unlikely to cure).
          Δ shows change vs the 6-year chronic baseline.
        </div>
      </div>
      <div style={{ position: "relative", paddingLeft: 36 }}>
        {/* Y-axis ticks */}
        {[0, 1, 2, 3, 4, 5].filter(v => v <= maxC).map(v => {
          const topPct = 100 - (v / maxC) * 100;
          return (
            <div key={v} style={{ position: "absolute", left: 0, right: 0, top: `${topPct}%`, pointerEvents: "none" }}>
              <span style={{ position: "absolute", left: 0, top: -7, fontSize: 8, color: "#334155", fontFamily: FM, width: 28, textAlign: "right" }}>{v}</span>
              <div style={{ position: "absolute", left: 32, right: 0, borderTop: v === 0 ? "1px solid #1e1e30" : "1px dashed #11111e" }} />
            </div>
          );
        })}
        {/* C=5 threshold line */}
        <div style={{
          position: "absolute", left: 32, right: 0,
          top: `${100 - (5 / maxC) * 100}%`,
          borderTop: "1px dashed #475569", zIndex: 1,
        }}>
          <span style={{ position: "absolute", right: 2, top: -14, fontSize: 9, color: "#64748b", fontFamily: FM }}>C=5 cure threshold</span>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: CHART_H, marginBottom: 0 }}>
          {data.map((d, i) => {
            const base = baseline[i];
            const pct = Math.min(d.C_bone / maxC, 1) * 100;
            const delta = d.C_bone - base.C_bone;
            const good = d.C_bone >= 5;
            return (
              <div key={d.name} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
                <div style={{ fontSize: 9, fontFamily: FM, color: delta > 0.05 ? "#22c55e" : delta < -0.05 ? "#ef4444" : "#475569", marginBottom: 1 }}>
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FM, color: good ? "#22c55e" : "#ef4444", marginBottom: 4 }}>{d.C_bone.toFixed(1)}</div>
                <div style={{
                  width: "80%", height: `${pct}%`, minHeight: 6,
                  background: `linear-gradient(to top, ${good ? "#22c55e" : "#ef4444"}, ${good ? "#22c55e55" : "#ef444455"})`,
                  borderRadius: "4px 4px 0 0", transition: "height 0.35s ease",
                }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Drug name row */}
      <div style={{ display: "flex", gap: 10, borderTop: "2px solid #1e1e30", paddingTop: 8, marginTop: 0 }}>
        {data.map(d => (
          <div key={d.name} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: d.color, fontFamily: FM }}>{d.name}</div>
            <div style={{ fontSize: 9, color: "#475569", fontFamily: FM }}>K={d.K_pathway.toFixed(1)}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 9, color: "#334155", fontFamily: FM }}>
        Δ = change vs 6-yr chronic baseline · C_bone = τ/K_total · K = sum of all impedance factors
      </div>
    </div>
  );
}


// ============================================================
// MAIN APP
// ============================================================
export default function KeskeVisualizations() {
  const [tab, setTab] = useState(0);
  const [drugA, setDrugA] = useState("Ceftaroline");
  const [drugB, setDrugB] = useState("Rifampin");
  const radarDrugs = ["Ceftaroline", "Rifampin", "Vancomycin", "Clindamycin"];

  const tabs = [
    { label: "Bone Section", icon: "🦴" },
    { label: "Waterfall", icon: "📊" },
    { label: "Timeline", icon: "📈" },
    { label: "Radar", icon: "🎯" },
    { label: "Day 1 What-If", icon: "⏪" },
  ];

  return (
    <div style={{ background: "#08080f", minHeight: "100vh", color: "#e2e8f0", fontFamily: FS, padding: "16px 24px" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => { window.location.hash = 'keske'; }}
          style={{
            padding: "5px 12px", background: "transparent", border: "1px solid #1e293b",
            borderRadius: 5, color: "#64748b", cursor: "pointer", fontFamily: FM,
            fontSize: 10, letterSpacing: 1, display: "flex", alignItems: "center", gap: 6,
          }}
          onMouseOver={e => e.currentTarget.style.borderColor = "#334155"}
          onMouseOut={e => e.currentTarget.style.borderColor = "#1e293b"}
        >← DEMO</button>
        <div style={{ fontSize: 16, fontWeight: 700, fontFamily: FM, letterSpacing: 3 }}>KESKE METHOD</div>
        <div style={{ fontSize: 10, color: "#64748b" }}>VISUALIZATIONS</div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
        {tabs.map((t, i) => (
          <button key={i} onClick={() => setTab(i)} style={{
            padding: "8px 16px", fontSize: 10, fontFamily: FM, letterSpacing: 1,
            background: tab === i ? "#1e1e30" : "#0c0c18",
            border: `1px solid ${tab === i ? "#3b82f6" : "#1e1e30"}`,
            color: tab === i ? "#e2e8f0" : "#64748b", borderRadius: 6, cursor: "pointer",
          }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Drug selector for bone section + radar */}
      {(tab === 0 || tab === 3) && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#64748b", fontFamily: FM }}>DRUGS:</span>
          <select value={drugA} onChange={e => setDrugA(e.target.value)} style={{ background: "#12121f", border: "1px solid #2a2a3e", color: "#e2e8f0", padding: "4px 8px", borderRadius: 4, fontFamily: FM, fontSize: 10 }}>
            {Object.keys(DRUGS).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span style={{ color: "#475569" }}>+</span>
          <select value={drugB} onChange={e => setDrugB(e.target.value)} style={{ background: "#12121f", border: "1px solid #2a2a3e", color: "#e2e8f0", padding: "4px 8px", borderRadius: 4, fontFamily: FM, fontSize: 10 }}>
            {Object.keys(DRUGS).map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}

      {/* Viz content */}
      {tab === 0 && <BoneCrossSection patient={STEVEN} drugA={drugA} drugB={drugB} />}
      {tab === 1 && <PathwayWaterfall patient={STEVEN} />}
      {tab === 2 && <TimelineSimulation patient={STEVEN} />}
      {tab === 3 && <DrugRadar patient={STEVEN_NO_RIF} selectedDrugs={[drugA, drugB, "Vancomycin", "Clindamycin"].filter((v,i,a) => a.indexOf(v) === i)} />}
      {tab === 4 && <DayOneWhatIf />}

      <div style={{ marginTop: 24, textAlign: "center", fontSize: 8, color: "#334155", fontFamily: FM, letterSpacing: 2 }}>
        DAVIS GEOMETRIC · KESKE METHOD · BRANCH XI · C = τ / K_bone
      </div>
    </div>
  );
}
