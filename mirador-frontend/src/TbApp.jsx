import { useState, useMemo, useEffect, useRef } from "react";
import init, { compute_tb } from './mirador_tb/mirador_tb_wasm.js';

function useIsMobile() {
  const [mob, setMob] = useState(window.innerWidth < 700);
  useEffect(() => {
    const h = () => setMob(window.innerWidth < 700);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return mob;
}

const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

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
}

// ─── tiny components (identical design system as KeskeApp) ───────────────────

function Src({ text }) {
  return <span style={{ fontSize: 8, color: "#334155", marginLeft: 4, fontStyle: "italic" }}>[{text}]</span>;
}

function DataRow({ label, value, color, unit }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "2px 0", borderBottom: "1px solid #0f1623", fontSize: 10 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ color: color || "#94a3b8", fontWeight: color ? 600 : 400 }}>
        {value}{unit ? <span style={{ color: "#475569", fontWeight: 400 }}> {unit}</span> : null}
      </span>
    </div>
  );
}

function KBar({ label, value, max, color, note }) {
  const pct = Math.min(value / max, 1) * 100;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
        <span style={{ color: "#64748b" }}>{label}</span>
        <span style={{ color: color || "#94a3b8" }}>{typeof value === "number" ? value.toFixed(3) : value}</span>
      </div>
      <div style={{ height: 4, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color || "#3b82f6", borderRadius: 2, transition: "width 0.35s" }} />
      </div>
      {note && <div style={{ fontSize: 8, color: "#334155", marginTop: 1 }}>{note}</div>}
    </div>
  );
}

function StageCard({ stage, current, title, subtitle, accent, children, onAdvance, advanceLabel, onJumpTo }) {
  const visible = current >= stage, active = current === stage, done = current > stage;
  if (!visible) return null;
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${active ? accent + "44" : "#1a1a2e"}`, background: active ? "#0c0c1a" : done ? "#08080f" : "#0a0a14", marginBottom: 12, overflow: "hidden", animation: active ? "fadeSlideIn 0.45s ease" : "none", opacity: done ? 0.7 : 1 }}>
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: done ? "pointer" : "default", borderBottom: `1px solid ${active ? accent + "22" : "#12121f"}` }} onClick={done ? onJumpTo : undefined}>
        <span style={{ fontSize: 10, fontWeight: 700, color: active ? accent : done ? accent + "99" : "#475569", minWidth: 18 }}>{stage + 1}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: active ? "#e2e8f0" : "#64748b", letterSpacing: 1 }}>{title}</div>
          <div style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>{subtitle}</div>
        </div>
        {done && <span style={{ fontSize: 9, color: accent + "88" }}>↑ REVISIT</span>}
      </div>
      {active && (
        <div style={{ padding: "14px 14px" }}>
          {children}
          {onAdvance && (
            <button onClick={onAdvance} style={{ marginTop: 16, width: "100%", padding: "10px 0", background: accent + "18", color: accent, border: `1px solid ${accent}44`, borderRadius: 6, fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2, cursor: "pointer" }}
              onMouseOver={e => e.currentTarget.style.background = accent + "28"} onMouseOut={e => e.currentTarget.style.background = accent + "18"}>
              {advanceLabel || "CONTINUE →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TB Math functions (mirrors Rust crates) ─────────────────────────────────

function nat2_cl_mult(nat2) {
  return nat2 === 'slow' ? 0.5 : nat2 === 'fast' ? 2.0 : 1.0;
}
function diabetes_vd_factor(hba1c) {
  return Math.min(1.0 + 0.05 * Math.max(hba1c - 7.0, 0), 1.35);
}
// ─── Drug reference data ─────────────────────────────────────────────────────
// Sources: Kjellsson 2012 · Strydom 2025 · Mitchison 1979 · WHO 2024

const TB_DRUGS = {
  inh: {
    label: "Isoniazid (H)", short: "H", color: "#22c55e",
    tau: 10.0, // log2(AUC24/MIC) = log2(52/0.05) ≈ 10.0 (Peloquin 1997)
    r_lung: 0.80, r_cellular: 0.60, r_necrotic: 0.30, r_cavity: 0.40,
    r_extra: 0.60, r_macro: 0.40, r_caseum: 0.30, r_cav: 0.40,
    mic_standard: 0.05, mic_acidic: 0.50, mic_dormant: 50.0,
    note: "Bactericidal vs replicating; NAT2-dependent; high dormant MIC",
    refs: "Mitchison 1979 · Zhang 2020",
  },
  rif: {
    label: "Rifampin (R)", short: "R", color: "#f97316", is_rif: true,
    tau: 8.5, // log2(AUC24/MIC) = log2(70/0.20) ≈ 8.5 (Peloquin 1997, steady-state)
    r_lung: 0.30, r_cellular: 0.20, r_necrotic: 0.05, r_cavity: 0.15,
    r_extra: 0.20, r_macro: 0.15, r_caseum: 0.05, r_cav: 0.15,
    mic_standard: 0.20, mic_acidic: 0.50, mic_dormant: 2.0,
    note: "Backbone of RIPE; auto-induction 40% CL ↑ at steady state; catastrophic caseum penetration (R=0.05)",
    refs: "Kjellsson 2012 · Strydom 2025",
  },
  pza: {
    label: "Pyrazinamide (Z)", short: "Z", color: "#f59e0b",
    tau: 4.6, // log2(AUC24/MIC_acidic) = log2(400/16) ≈ 4.6 (Peloquin 1997; acidic MIC used since PZA only active at low pH)
    r_lung: 0.80, r_cellular: 0.70, r_necrotic: 0.40, r_cavity: 0.60,
    r_extra: 0.70, r_macro: 0.60, r_caseum: 0.40, r_cav: 0.60,
    mic_standard: null, mic_acidic: 16.0, mic_dormant: 50.0, // inactive at neutral pH
    note: "Caseum specialist; inactive at neutral pH; pncA → resistance abolishes all activity (not MIC shift)",
    refs: "Zhang 2012 · Sarathy 2016",
  },
  emb: {
    label: "Ethambutol (E)", short: "E", color: "#06b6d4",
    tau: 2.3, // log2(AUC24/MIC) = log2(10/2.0) ≈ 2.3 (Peloquin 1997)
    r_lung: 2.00, r_cellular: 1.50, r_necrotic: 0.80, r_cavity: 1.00,
    r_extra: 1.50, r_macro: 0.80, r_caseum: 0.30, r_cav: 1.00,
    mic_standard: 2.0, mic_acidic: 8.0, mic_dormant: null, // inactive vs dormant
    note: "Synergist; concentrates in lung tissue (R>1); poor caseum; inactive vs dormant NRP",
    refs: "Kjellsson 2012",
  },
  bdq: {
    label: "Bedaquiline (B)", short: "B", color: "#a78bfa",
    tau: 9.0, // log2(AUC24_intracellular/MIC) = log2(15/0.03) ≈ 9.0 (Strydom 2025, week-8+ SS)
    r_lung: 5.00, r_cellular: 4.00, r_necrotic: 2.00, r_cavity: 3.00,
    r_extra: 4.00, r_macro: 3.00, r_caseum: 2.00, r_cav: 3.00,
    mic_standard: 0.03, mic_acidic: 0.06, mic_dormant: 0.25, fu_caseum: 0.001,
    note: "ATP synthase inhibitor; best-in-class dormant; accumulates in macrophage lipid bodies; steady-state values represent week 8+",
    refs: "Strydom 2025 · Sarathy 2016",
  },
  lzd: {
    label: "Linezolid (L)", short: "L", color: "#818cf8",
    tau: 7.6, // log2(AUC24/MIC) = log2(100/0.50) ≈ 7.6 (MacGowan 2003)
    r_lung: 1.20, r_cellular: 1.00, r_necrotic: 0.60, r_cavity: 0.80,
    r_extra: 1.00, r_macro: 0.80, r_caseum: 0.60, r_cav: 0.80,
    mic_standard: 0.50, mic_acidic: 1.0, mic_dormant: 8.0,
    note: "BPaL component; protein synthesis inhibitor; good tissue penetration",
    refs: "WHO 2022",
  },
  pto: {
    label: "Pretomanid (Pa)", short: "Pa", color: "#ec4899",
    tau: 7.4, // log2(AUC24/MIC) = log2(10/0.06) ≈ 7.4 (Diacon 2012, pretomanid PK)
    r_lung: 0.80, r_cellular: 0.70, r_necrotic: 0.50, r_cavity: 0.60,
    r_extra: 0.70, r_macro: 0.65, r_caseum: 0.50, r_cav: 0.60,
    mic_standard: 0.06, mic_acidic: 0.03, mic_dormant: 0.12,
    note: "Nitroimidazole; reductive activation under hypoxia; BPaL component; active vs dormant NRP",
    refs: "Conradie 2020 (ZeNix)",
  },
};

// ─── Granuloma SVG ───────────────────────────────────────────────────────────

function GranulomaSection({ pt, ripeActive }) {
  // Layout: granuloma on left (cx=155), label panel on right (x=295+)
  // viewBox: 500 wide × 300 tall — rendered at 100% width
  const cx = 150, cy = 150;
  const rings = [
    { r: 122, color: "#1d4ed8", label: "Lung tissue",   opacity: 0.10, textColor: "#3b82f6" },
    { r:  94, color: "#16a34a", label: "Cellular gran",  opacity: 0.22, textColor: "#22c55e" },
    { r:  66, color: "#d97706", label: "Necrotic cuff",  opacity: 0.28, textColor: "#f59e0b" },
    { r:  38, color: "#dc2626", label: "Caseum core",    opacity: 0.40, textColor: "#ef4444" },
  ];

  // Arrow tip = deepest point drug reaches (left-pointing, from outside inward)
  // Boundaries from cx: lung=122, cellular=94, necrotic=66, caseum=38
  const ALL_ARROWS = [
    { key: 'rif', label: "R  Rifampin",   color: TB_DRUGS.rif.color, row: 0,
      tip_x: cx + 88, zone: "cellular only",   note: "R=0.05 — 95% blocked at caseum" },
    { key: 'inh', label: "H  Isoniazid",  color: TB_DRUGS.inh.color, row: 1,
      tip_x: cx + 54, zone: "necrotic",         note: "R=0.30 — NAT2-dependent" },
    { key: 'emb', label: "E  Ethambutol", color: TB_DRUGS.emb.color, row: 2,
      tip_x: cx + 82, zone: "cellular",         note: "R=1.5 — concentrates in lung tissue" },
    { key: 'pza', label: "Z  Pyrazinamide", color: TB_DRUGS.pza.color, row: 3,
      tip_x: cx + 20, zone: "CASEUM ✓",        note: "R=0.40 — only drug reaching caseum" },
    { key: 'bdq', label: "B  Bedaquiline", color: TB_DRUGS.bdq.color, row: 4,
      tip_x: cx + 72, zone: "macrophage",       note: "R=4.0 — accumulates in lipid bodies" },
    { key: 'lzd', label: "L  Linezolid",  color: TB_DRUGS.lzd.color, row: 5,
      tip_x: cx + 68, zone: "necrotic",         note: "R=0.60 — good tissue penetration" },
    { key: 'pto', label: "Pa Pretomanid", color: TB_DRUGS.pto.color, row: 6,
      tip_x: cx + 58, zone: "necrotic",         note: "R=0.50 — activated under hypoxia" },
  ].filter(a => !ripeActive || ripeActive[a.key] !== false);

  const arrowStart = cx + 126; // just outside lung ring
  const labelX = cx + 136;    // label column start
  const rowH = 34;             // vertical spacing between rows
  const firstY = 32;           // y of first arrow row

  return (
    <svg width="100%" viewBox="0 0 500 300" style={{ display: "block" }}>
      {/* Background */}
      <rect width={500} height={300} fill="#080811" rx={6} />

      {/* Concentric rings — draw outer→inner so inner sits on top */}
      {[...rings].reverse().map(ring => (
        <circle key={ring.label} cx={cx} cy={cy} r={ring.r}
          fill={ring.color} fillOpacity={ring.opacity}
          stroke={ring.color} strokeWidth={1.5} strokeOpacity={0.6} />
      ))}

      {/* Ring labels — placed at top of each ring arc */}
      {rings.map(ring => (
        <text key={ring.label} x={cx} y={cy - ring.r + 13}
          textAnchor="middle" fill={ring.textColor} fontSize={8.5} fontFamily={FONT} fontWeight={600} opacity={0.9}>
          {ring.label}
        </text>
      ))}

      {/* Center label */}
      <text x={cx} y={cy - 6}  textAnchor="middle" fill="#fff"     fontSize={11} fontFamily={FONT} fontWeight={700} opacity={0.9}>M.tb</text>
      <text x={cx} y={cy + 8}  textAnchor="middle" fill="#64748b"  fontSize={8}  fontFamily={FONT}>bacteria</text>

      {/* Vertical separator line */}
      <line x1={labelX - 4} y1={10} x2={labelX - 4} y2={290} stroke="#1e293b" strokeWidth={1} />

      {/* Column headers */}
      <text x={labelX} y={18} fill="#334155" fontSize={7.5} fontFamily={FONT} fontWeight={700} letterSpacing={1}>DRUG</text>
      <text x={labelX + 115} y={18} fill="#334155" fontSize={7.5} fontFamily={FONT} fontWeight={700} letterSpacing={1} textAnchor="middle">ZONE</text>

      {/* Drug penetration arrows */}
      {ALL_ARROWS.map((a, i) => {
        const y = firstY + i * rowH;
        const active = !ripeActive || ripeActive[a.key] !== false;
        return (
          <g key={a.key} opacity={active ? 1 : 0.18}>
            {/* Horizontal guide line at this row's y */}
            <line x1={a.tip_x} y1={y} x2={arrowStart} y2={y}
              stroke={a.color} strokeWidth={2} strokeLinecap="round"
              strokeDasharray={active ? "none" : "4 3"} />
            {/* Arrowhead pointing left (tip = deepest penetration) */}
            <polygon points={`${a.tip_x},${y} ${a.tip_x + 8},${y - 4} ${a.tip_x + 8},${y + 4}`} fill={a.color} />
            {/* Small dot at arrow start (blood/lung boundary) */}
            <circle cx={arrowStart} cy={y} r={3} fill={a.color} opacity={0.6} />

            {/* Drug name label */}
            <text x={labelX} y={y - 4} fill={a.color} fontSize={9} fontFamily={FONT} fontWeight={700}>{a.label}</text>
            {/* Zone badge */}
            <text x={labelX} y={y + 8} fill="#64748b" fontSize={7.5} fontFamily={FONT}>{a.note}</text>
            {/* Zone pill */}
            <rect x={labelX + 108} y={y - 12} width={70} height={14} rx={3}
              fill={active ? a.color + "22" : "#0d0d1e"} stroke={a.color + "44"} />
            <text x={labelX + 143} y={y - 2} fill={a.color} fontSize={7} fontFamily={FONT} fontWeight={700} textAnchor="middle">
              {a.zone}
            </text>
          </g>
        );
      })}

      {/* Axis caption */}
      <text x={labelX - 6} y={292} fill="#1e293b" fontSize={7} fontFamily={FONT} textAnchor="end">blood</text>
      <text x={cx} y={292} fill="#1e293b" fontSize={7} fontFamily={FONT} textAnchor="middle">← deeper penetration</text>
    </svg>
  );
}

// ─── Coherence Gauge ─────────────────────────────────────────────────────────
function ClesionGauge({ c, label }) {
  const color = c < 5 ? "#ef4444" : c < 7 ? "#f59e0b" : "#22c55e";
  const status = c < 5.0 ? "FAILING" : c < 9.5 ? "MARGINAL" : "EFFECTIVE";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", background: "#0d0d1c", borderRadius: 6, border: `1px solid ${color}33`, marginBottom: 10 }}>
      <div style={{ textAlign: "center", minWidth: 60 }}>
        <div style={{ fontSize: 38, fontWeight: 700, color, lineHeight: 1, fontFamily: FONT }}>{c >= 99 ? "—" : c.toFixed(1)}</div>
        <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>C_lesion</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>{label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 1 }}>{status}</span>
        </div>
        <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(c / 12, 1) * 100}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 8, color: "#334155" }}>
          <span>0</span><span style={{ color: "#475569" }}>5 = threshold</span><span>12</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
function TbSidebar({ stage, pt, active, kCombo, cLesion, patientWeights, popWeights, resWeights, expanded, wasmResult }) {
  const Divider = () => <div style={{ borderTop: "1px solid #1a1a2e", margin: "12px 0" }} />;
  const Explain = ({ children }) => <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.75, marginTop: 10 }}>{children}</div>;
  const MiniBar = ({ label, val, max, color, note }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748b", marginBottom: 3 }}>
        <span style={{ fontFamily: FONT }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{typeof val === "number" ? val.toFixed(3) : val}</span>
      </div>
      <div style={{ height: 6, background: "#12121f", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(val / max, 1) * 100}%`, background: color, borderRadius: 3, transition: "width 0.5s" }} />
      </div>
      {note && <div style={{ fontSize: 7, color: "#334155", marginTop: 1 }}>{note}</div>}
    </div>
  );

  if (stage === 0) {
    const nat2m = nat2_cl_mult(pt.nat2);
    const vdf = diabetes_vd_factor(pt.hba1c);
    return (
      <>
        <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 6 }}>K1 · TB PATIENT PK</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Isoniazid clearance factors</div>
        <MiniBar label="NAT2 CL multiplier" val={nat2m} max={2.0} color={nat2m < 0.7 ? "#ef4444" : nat2m > 1.5 ? "#22c55e" : "#f59e0b"}
          note={`Slow: toxic accumulation ↑ · Fast: sub-therapeutic levels ↑`} />
        <MiniBar label="Vd inflation (diabetes)" val={vdf} max={1.35} color="#f97316"
          note={`HbA1c ${pt.hba1c}% → Vd ×${vdf.toFixed(3)}`} />
        <MiniBar label="Albumin effect" val={pt.albumin / 4.0} max={1.0} color="#3b82f6"
          note={`Low albumin → higher free fraction of protein-bound drugs`} />
        <Divider />
        <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>RIFAMPIN AUTO-INDUCTION</div>
        <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
          RIF induces CYP3A4 and P-gp, increasing its own clearance ~40% by week 2.
          At steady-state, plasma AUC falls to ~60% of day-1 levels.
          <span style={{ color: "#f97316" }}> K_admet_RIF is time-varying</span> — v0.1 uses steady-state only.
          <Src text="Strydom 2025" />
        </div>
        {pt.hiv && (
          <>
            <Divider />
            <div style={{ padding: "8px 10px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 5, fontSize: 10, color: "#ef4444" }}>
              ⚠ HIV + PI-based ART: RIF dramatically reduces PI levels (CYP3A4 induction).
              Switch to <strong>rifabutin</strong> for HIV/TB cotreatment. Not modeled in v0.1.
            </div>
          </>
        )}
        <Divider />
        <Explain>
          NAT2 slow acetylators (≈50% of any population) clear isoniazid half as fast as fast metabolizers.
          Standard dosing produces toxic exposures in slow acetylators and sub-therapeutic exposures in fast acetylators.
          Phenotyping before treatment changes outcomes — especially in retreatment and HIV/TB cotreatment.
        </Explain>
      </>
    );
  }

  if (stage === 1) {
    const { wl, wc, wn, wv } = patientWeights;
    return (
      <>
        <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>K2 · GRANULOMA GEOMETRY</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>K_gran = (1/R_lesion) − 1</div>
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 8 }}>
          Lesion weights (cavitary: {pt.cavitary ? "YES" : "NO"}):
        </div>
        {[["Uninvolved lung", wl, "#3b82f6"], ["Cellular gran", wc, "#22c55e"], ["Necrotic cuff", wn, "#f59e0b"], ["Cavity caseum", wv, "#ef4444"]].map(([lbl, w, c]) => (
          <MiniBar key={lbl} label={lbl} val={w} max={0.5} color={c} note={`w = ${w.toFixed(2)}`} />
        ))}
        <Divider />
        {["inh","rif","pza","emb"].map(key => {
          const d = TB_DRUGS[key];
          const kg = wasmResult?.per_drug?.[DRUG_NAME_MAP[key]]?.k_granuloma ?? 0;
          return <MiniBar key={key} label={`K_gran ${d.short}`} val={kg} max={12} color={d.color} note={d.note.split(';')[0]} />;
        })}
        <Divider />
        <div style={{ padding: "6px 10px", background: "#0d0d1e", borderRadius: 5, fontSize: 9, color: "#475569" }}>
          Higher K_gran = more barrier. RIF's catastrophic caseum K_gran (R=0.05 → K≈19) is why PZA + duration matter.
        </div>
        <Divider />
        <Explain>
          The granuloma is not a uniform sphere. Rifampin — the most potent TB drug — gets 20% through the cellular layer
          but only 5% through to the caseum core. Pyrazinamide reaches 40% of caseum. That asymmetry is why pyrazinamide
          cannot be removed without extending therapy by months.
        </Explain>
      </>
    );
  }

  if (stage === 2) {
    const { wr, wa, wd } = popWeights;
    return (
      <>
        <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 6 }}>K3 · PHENOTYPE</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>K_phen = log₁₀(MIC_harder/MIC_std)</div>
        <div style={{ fontSize: 10, color: "#475569", marginBottom: 8 }}>
          Population weights (chronic disease):
        </div>
        {[["Replicating", wr, "#22c55e"], ["Semi-dormant acidic", wa, "#f59e0b"], ["Dormant NRP", wd, "#ef4444"]].map(([lbl, w, c]) => (
          <MiniBar key={lbl} label={lbl} val={w} max={0.6} color={c} note={`w = ${w.toFixed(2)}`} />
        ))}
        <Divider />
        <div style={{ fontSize: 9, color: "#475569", marginBottom: 6 }}>PZA SPECIAL: inactive at neutral pH</div>
        <div style={{ padding: "8px 10px", background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 5, fontSize: 10, color: "#f59e0b" }}>
          PZA mic_standard = null → K_phen_rep = log₁₀(500) ≈ 2.70 (Binary Hammer cap).<br />
          In caseum (pH 4.5–5.5): sole sterilizing drug → MIC_acidic = 16 µg/mL
        </div>
        <Divider />
        <div style={{ fontSize: 9, color: "#a78bfa", marginBottom: 6 }}>BDQ DOMINATES DORMANT NRP</div>
        <div style={{ display: "flex", gap: 8 }}>
          {[["inh","Dormant K",Math.log10(50/0.05).toFixed(2)],["rif","Dormant K",Math.log10(2/0.2).toFixed(2)],["bdq","Dormant K",Math.log10(0.25/0.03).toFixed(2)]].map(([key, lbl, val]) => (
            <div key={key} style={{ flex: 1, padding: "6px 8px", background: "#0d0d1e", borderRadius: 5 }}>
              <div style={{ fontSize: 8, color: TB_DRUGS[key].color, fontFamily: FONT, fontWeight: 700 }}>{TB_DRUGS[key].short}</div>
              <div style={{ fontSize: 13, color: TB_DRUGS[key].color, fontFamily: FONT, fontWeight: 900 }}>{val}</div>
              <div style={{ fontSize: 7, color: "#475569" }}>{lbl}</div>
            </div>
          ))}
        </div>
        <Divider />
        <Explain>
          TB bacteria don't all behave the same way. Fast-replicating bacteria in fresh cavities are killed by isoniazid within days.
          Bacteria inside acidic, lipid-rich macrophages (semi-dormant) respond only to pyrazinamide. Non-replicating persisters
          in hypoxic caseum need bedaquiline or rifampin. Standard RIPE targets all three populations simultaneously — that's why
          it works in 6 months. Any drug removed leaves one population uncovered.
        </Explain>
      </>
    );
  }

  if (stage === 3) {
    const { we, wm, wc, wv } = resWeights;
    return (
      <>
        <div style={{ fontSize: 9, color: "#06b6d4", letterSpacing: 2, marginBottom: 6 }}>K4 · RESERVOIRS</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>K_res = Σ (1−R_x)·w_x</div>
        {[["Extracellular", we, "#22c55e"], ["Intracellular (macrophage)", wm, "#f59e0b"], ["Caseum (closed gran)", wc, "#ef4444"], ["Cavity surface", wv, "#f97316"]].map(([lbl, w, c]) => (
          <MiniBar key={lbl} label={lbl} val={w} max={0.5} color={c} note={`w = ${w.toFixed(2)}`} />
        ))}
        <Divider />
        <div style={{ fontSize: 9, color: "#06b6d4", marginBottom: 6 }}>BDQ MACROPHAGE TRAP</div>
        <div style={{ padding: "8px 10px", background: "#a78bfa11", border: "1px solid #a78bfa33", borderRadius: 5, fontSize: 10, color: "#a78bfa" }}>
          BDQ R_macro = 3.0 (accumulates 3× plasma). K_res_macro = max(1−3.0, 0) × w = 0.<br />
          <span style={{ color: "#64748b" }}>Drug concentrates → barrier = 0 → macrophage reservoir cleared.</span><br />
          <br />
          BDQ fu_caseum = 0.001 (99.9% bound in caseum fat). Free-drug K_caseum = (1/(R×fu))−1 = 499.<br />
          <span style={{ color: "#ef4444" }}>⚠ Effective caseum clearance = catastrophic despite high total R</span>
        </div>
        <Divider />
        <Explain>
          Four distinct bacterial sanctuaries exist in TB lung disease simultaneously.
          Extracellular bacteria in the cellular granuloma are the best-targeted.
          Bacteria inside macrophages (intracellular) need drugs that accumulate in acidic organelles.
          The avascular caseum core has no blood supply — only diffusion. The cavity surface has direct drug access
          from inhaled air. Bedaquiline clears macrophages but virtually fails at caseum (99.9% protein-bound to caseum fat).
        </Explain>
      </>
    );
  }

  if (stage === 4) {
    const onKeys = Object.keys(active).filter(k => active[k]);
    const sumInv = onKeys.reduce((s, k) => s + 1.0 / Math.max(wasmResult?.per_drug?.[DRUG_NAME_MAP[k]]?.k_pathway ?? 5, 0.001), 0);
    const synergy = onKeys.some(k => ['bdq','lzd','pto'].includes(k)) ? 1.25 : 1.2;
    return (
      <>
        <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>K5 · COMBINATION ENGINE</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Parallel conductor model</div>
        <div style={{ background: "#12121f", padding: "8px 10px", borderRadius: 5, fontSize: 9, fontFamily: FONT, lineHeight: 1.9, marginBottom: 8 }}>
          <div style={{ color: "#64748b" }}>K_combo = 1 / (synergy × Σ(1/K_pathway_i))</div>
          <div style={{ color: "#94a3b8" }}>= 1 / ({synergy.toFixed(2)} × {sumInv.toFixed(4)})</div>
          <div style={{ color: "#e2e8f0" }}>K_combo = {kCombo.toFixed(4)}</div>
          <div style={{ color: "#64748b", marginTop: 4 }}>tau_combo = synergy × Σ(τᵢ)</div>
          <div style={{ color: "#94a3b8" }}>= {synergy.toFixed(2)} × {onKeys.map(k => `${(wasmResult?.per_drug?.[DRUG_NAME_MAP[k]]?.tau ?? 0).toFixed(2)}`).join(' + ')}</div>
          <div style={{ color: "#e2e8f0" }}>tau_combo = {wasmResult?.tau_combo != null ? wasmResult.tau_combo.toFixed(4) : "—"}</div>
          <div style={{ color: "#64748b", marginTop: 4 }}>C_lesion = tau_combo / K_combo</div>
          <div style={{ color: "#22c55e", fontWeight: 700 }}>= {cLesion <= 0 ? "—" : cLesion.toFixed(2)}</div>
        </div>
        <div style={{ fontSize: 9, color: "#22c55e", marginBottom: 6 }}>Drug conductances (1/K_pathway):</div>
        {onKeys.map(k => {
          const kv = wasmResult?.per_drug?.[DRUG_NAME_MAP[k]]?.k_pathway ?? 5;
          const cond = 1.0 / kv;
          const pct = (cond / sumInv) * 100;
          return (
            <div key={k} style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
                <span style={{ color: TB_DRUGS[k].color, fontFamily: FONT, fontWeight: 700 }}>{TB_DRUGS[k].short}</span>
                <span style={{ color: TB_DRUGS[k].color, fontFamily: FONT }}>{(pct).toFixed(0)}% — cond {cond.toFixed(3)}</span>
              </div>
              <div style={{ height: 5, background: "#12121f", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: TB_DRUGS[k].color, borderRadius: 2, transition: "width 0.4s" }} />
              </div>
            </div>
          );
        })}
        <Divider />
        <div style={{ fontSize: 9, color: "#475569", lineHeight: 1.8 }}>
          Duration ≈ <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{wasmResult?.duration_months != null ? wasmResult.duration_months.toFixed(1) : "∞"} months</span> (= 6 × K_combo / K_combo_RIPE, baselined to RIPE = 6 mo)<br />
          Threshold: C_lesion ≥ 9.5 EFFECTIVE, ≥ 5.0 MARGINAL (v0.2 — validated against TBTC/REMoxTB, n=6,188)
        </div>
        <Divider />
        <Explain>
          Each drug contributes conductance (1/K_pathway) to the parallel combination. PZA contributes the largest share
          because it has the lowest K_pathway — fewest barriers standing between the drug and caseum bacteria.
          Remove PZA and the total conductance collapses, duration doubles. The geometry shows what the MIC cannot:
          even if INH and RIF are sensitive, three drugs cannot sterilize four reservoirs.
        </Explain>
      </>
    );
  }
  return null;
}

// ─── Main App ─────────────────────────────────────────────────────────────────
// Drug key → Rust name mapping
const DRUG_NAME_MAP = {
  inh: "isoniazid",
  rif: "rifampin",
  pza: "pyrazinamide",
  emb: "ethambutol",
  bdq: "bedaquiline",
  lzd: "linezolid",
  pto: "pretomanid",
};

export default function TbApp() {
  // ── WASM init ──
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmResult, setWasmResult] = useState(null);
  useEffect(() => {
    init({ module_or_path: '/mirador_tb/mirador_tb_wasm_bg.wasm' }).then(() => setWasmReady(true));
  }, []);

  const mob = useIsMobile();
  const [stage, setStage] = useState(0);
  const [vizExpanded, setVizExpanded] = useState(null);

  // ── Patient state ──
  const [pt, setPt] = useState({
    age: 38, weight: 62, nat2: 'intermediate',
    hiv: false, art_regimen: 'none',
    hba1c: 6.2, albumin: 3.8, egfr: 88,
    cavitary: true, sputum_pos: true,
    disease_months: 3,
  });
  const updatePt = (k, v) => setPt(p => ({ ...p, [k]: v }));

  // ── Drug toggles ──
  const [ripeOn, setRipeOn] = useState({ inh: true, rif: true, pza: true, emb: true });
  const [bpalOn, setBpalOn] = useState({ bdq: false, lzd: false, pto: false });
  const allActive = { ...ripeOn, ...bpalOn };
  const toggleRipe = k => setRipeOn(p => ({ ...p, [k]: !p[k] }));
  const toggleBpal = k => setBpalOn(p => ({ ...p, [k]: !p[k] }));

  const applyPreset = (preset) => {
    if (preset === 'ripe') { setRipeOn({ inh: true, rif: true, pza: true, emb: true }); setBpalOn({ bdq: false, lzd: false, pto: false }); }
    if (preset === 'hrze_no_z') { setRipeOn({ inh: true, rif: true, pza: false, emb: true }); setBpalOn({ bdq: false, lzd: false, pto: false }); }
    if (preset === 'mdr') { setRipeOn({ inh: false, rif: false, pza: true, emb: true }); setBpalOn({ bdq: false, lzd: false, pto: false }); }
    if (preset === 'bpal') { setRipeOn({ inh: false, rif: false, pza: false, emb: false }); setBpalOn({ bdq: true, lzd: true, pto: true }); }
    if (preset === 'mdr_bpal') { setRipeOn({ inh: false, rif: false, pza: true, emb: false }); setBpalOn({ bdq: true, lzd: true, pto: false }); }
  };

  // ── Lesion weights ──
  const patientWeights = useMemo(() => {
    const cav = pt.cavitary;
    return { wl: cav ? 0.05 : 0.15, wc: cav ? 0.15 : 0.45, wn: cav ? 0.30 : 0.40, wv: cav ? 0.50 : 0.00 };
  }, [pt.cavitary]);

  // ── Pop weights (disease duration) ──
  const popWeights = useMemo(() => {
    const chronic = pt.disease_months > 2;
    return { wr: chronic ? 0.20 : 0.60, wa: chronic ? 0.40 : 0.25, wd: chronic ? 0.40 : 0.15 };
  }, [pt.disease_months]);

  // ── Reservoir weights ──
  const resWeights = useMemo(() => {
    const cav = pt.cavitary;
    return { we: cav ? 0.20 : 0.30, wm: cav ? 0.10 : 0.20, wc: cav ? 0.35 : 0.50, wv: cav ? 0.35 : 0.00 };
  }, [pt.cavitary]);

  // ── Combination math — called from Rust via WASM ──
  const synergy = useMemo(() => Object.keys(bpalOn).some(k => bpalOn[k]) ? 1.25 : 1.2, [bpalOn]);

  useEffect(() => {
    if (!wasmReady) return;
    const activeDrugs = Object.entries(allActive)
      .filter(([, on]) => on)
      .map(([k]) => DRUG_NAME_MAP[k]);
    if (!activeDrugs.length) { setWasmResult(null); return; }
    const params = JSON.stringify({
      drugs: activeDrugs,
      pza_resistant: false,
      cavitary: pt.cavitary,
      disease_months: pt.disease_months,
      synergy,
    });
    try {
      const raw = compute_tb(params);
      const result = JSON.parse(raw);
      if (result.error) {
        console.error('WASM compute_tb error:', result.error);
        setWasmResult(null);
      } else {
        setWasmResult(result);
      }
    } catch (e) {
      console.error('WASM call failed:', e);
      setWasmResult(null);
    }
  }, [wasmReady, ripeOn, bpalOn, pt.cavitary, pt.disease_months, synergy]);

  const kCombo         = wasmResult?.k_combo         ?? 99;
  const cLesion        = wasmResult?.c_lesion         ?? 0;
  const durationMonths = wasmResult?.duration_months  ?? 99;

  const { wl, wc, wn, wv } = patientWeights;

  const ripeColor = "#22c55e", granColor = "#f97316", popColor = "#a78bfa", resColor = "#06b6d4", comboColor = "#22c55e";
  const SelectBtn = ({ label, on, onClick, color }) => (
    <button onClick={onClick} style={{ padding: "4px 10px", fontFamily: FONT, fontSize: 10, fontWeight: 700, cursor: "pointer", borderRadius: 5, border: `1px solid ${on ? color + "88" : "#1e293b"}`, background: on ? color + "22" : "#0d0d1e", color: on ? color : "#475569", transition: "all 0.2s", letterSpacing: 1 }}
      onMouseOver={e => { e.currentTarget.style.background = color + "22"; }}
      onMouseOut={e => { e.currentTarget.style.background = on ? color + "22" : "#0d0d1e"; }}>
      {label}
    </button>
  );

  const hiv_rif_conflict = pt.hiv && pt.art_regimen === 'pi' && ripeOn.rif;

  // ─── Report builders ─────────────────────────────────────────────────────
  const buildTbReportData = () => {
    const onKeys = Object.keys(allActive).filter(k => allActive[k]);
    const getPerDrug = (k) => wasmResult?.per_drug?.[DRUG_NAME_MAP[k]] ?? {};
    const totalCond = onKeys.reduce((s, k) => s + 1.0 / Math.max(getPerDrug(k).k_pathway ?? 1, 0.001), 0);
    const perDrug = {};
    onKeys.forEach(k => {
      const kv = getPerDrug(k).k_pathway ?? 1;
      perDrug[k] = { K_pathway: +kv.toFixed(4), tau: +(getPerDrug(k).tau ?? 0).toFixed(4), conductance: +(1 / kv).toFixed(4), share_pct: +((1 / kv / Math.max(totalCond, 0.001)) * 100).toFixed(1) };
    });
    const verdict = cLesion >= 9.5 ? "EFFECTIVE" : cLesion >= 5.0 ? "MARGINAL" : "FAILING";
    const isBpal = Object.keys(bpalOn).some(k => bpalOn[k]);
    const allRipe = ripeOn.inh && ripeOn.rif && ripeOn.pza && ripeOn.emb;
    const regimenClass = isBpal ? "BPaL / MDR regimen" : allRipe ? "RIPE standard" : "Modified RIPE";
    const keyActions = [
      ripeOn.pza ? "Continue pyrazinamide for full 2-month intensive phase — sole caseum sterilizer" : "⛔ PZA absent: caseum reservoir uncovered — extend duration or add caseum-active agent",
      hiv_rif_conflict ? "⛔ RIF + PI contraindicated — switch to rifabutin 150mg 3×/week" : null,
      pt.nat2 === 'slow' ? "Slow NAT2: monitor LFTs weekly — INH hepatotoxicity risk elevated" : null,
      pt.nat2 === 'fast' ? "Fast NAT2: check INH trough at week 2 — sub-therapeutic levels likely" : null,
      pt.egfr < 30 ? `eGFR ${pt.egfr} mL/min: dose-reduce EMB or avoid — ocular toxicity risk` : null,
      pt.cavitary ? "Cavitary disease: extend intensive phase if week-8 sputum culture still positive" : null,
      pt.hba1c > 7 ? `HbA1c ${pt.hba1c}% — poorly-controlled DM increases relapse and hepatotoxicity risk` : null,
      !ripeOn.pza && !bpalOn.bdq ? "No caseum-active drug present — regimen cannot sterilize granuloma core" : null,
    ].filter(Boolean);
    const monitoring = [
      "Sputum smear + culture at weeks 2, 4, 8",
      "LFTs weekly for first 2 months (INH/RIF/PZA hepatotoxicity triangle)",
      onKeys.includes('emb') ? "Visual acuity + red-green color monthly (EMB)" : null,
      "Uric acid monthly if PZA + RIF combined (hyperuricemia synergy)",
      onKeys.includes('bdq') ? "ECG at baseline, week 2, week 4, then monthly (BDQ QTc prolongation)" : null,
      onKeys.includes('lzd') ? "CBC weekly (LZD myelosuppression), ophthalmology monthly" : null,
    ].filter(Boolean);
    return {
      framework: "MIRADOR",
      governing_equation: "C_lesion = tau_combo / K_combo  [Keske pooled v0.2, tau_combo = synergy * Sum(tau_i), K_combo = 1/(synergy * Sum(1/K_i))]",
      branch: "TB MODULE — Pulmonary Tuberculosis",
      generated: new Date().toISOString(),
      patient: {
        age: pt.age, weight_kg: pt.weight, nat2: pt.nat2,
        hiv: pt.hiv, art_regimen: pt.art_regimen,
        hba1c: pt.hba1c, albumin: pt.albumin, egfr: pt.egfr,
        cavitary: pt.cavitary, sputum_positive: pt.sputum_pos,
        disease_months: pt.disease_months,
        diagnosis: "Pulmonary TB — M. tuberculosis complex",
      },
      regimen: {
        active_drugs: onKeys,
        inactive_drugs: Object.keys(allActive).filter(k => !allActive[k]),
        synergy_factor: synergy,
        class: regimenClass,
      },
      combination_math: {
        K_pathway_per_drug: perDrug,
        K_combo: +kCombo.toFixed(4),
        tau_combo: +(wasmResult?.tau_combo ?? 0).toFixed(4),
        C_lesion: +cLesion.toFixed(3),
        status: verdict,
        duration_months_predicted: wasmResult?.duration_months ?? null,
      },
      granuloma_geometry: {
        lesion_weights: { wl: patientWeights.wl, wc: patientWeights.wc, wn: patientWeights.wn, wv: patientWeights.wv },
        K_gran_per_drug: Object.fromEntries(
          onKeys.map(k => [k, +(getPerDrug(k).k_granuloma ?? 0).toFixed(3)])
        ),
      },
      subpopulations: {
        weights: { wr: popWeights.wr, wa: popWeights.wa, wd: popWeights.wd },
        K_phen_per_drug: Object.fromEntries(
          onKeys.map(k => [k, +(getPerDrug(k).k_phenotype ?? 0).toFixed(3)])
        ),
      },
      reservoirs: {
        weights: { we: resWeights.we, wm: resWeights.wm, wc: resWeights.wc, wv: resWeights.wv },
        K_res_per_drug: Object.fromEntries(
          onKeys.map(k => [k, +(getPerDrug(k).k_reservoir ?? 0).toFixed(3)])
        ),
      },
      bluf: {
        verdict,
        c_lesion: +cLesion.toFixed(2),
        duration_months: wasmResult?.duration_months ?? null,
        regimen_class: regimenClass,
        key_actions: keyActions,
        monitoring,
      },
      recommendation: {
        regimen: onKeys.map(k => TB_DRUGS[k].short).join(""),
        duration_months: wasmResult?.duration_months != null ? Math.ceil(wasmResult.duration_months) : null,
        actions: keyActions,
        monitoring,
        resistance_risk: [
          onKeys.includes('rif') ? "rpoB (RIF) — monotherapy risk ~80%; never use RIF alone" : null,
          onKeys.includes('inh') ? "katG / inhA (INH) — high prevalence in retreatment cases" : null,
          onKeys.includes('pza') ? "pncA (PZA) — resistance abolishes ALL compartment activity globally" : null,
          onKeys.includes('bdq') ? "Rv0678 (BDQ) — efflux pump mutation; test before BPaL initiation" : null,
        ].filter(Boolean),
      },
      sources: [
        { id: "1", short: "Kjellsson 2012", full: "Kjellsson MC et al. Pharmacokinetic evaluation of anti-TB drugs: lesion:plasma concentration ratios. AAPS J. 2012." },
        { id: "2", short: "Strydom 2025", full: "Strydom N et al. Bedaquiline pharmacokinetics and tissue distribution in tuberculosis lesions. Nat Commun. 2025." },
        { id: "3", short: "Mitchison 1979", full: "Mitchison DA. The action of antituberculosis drugs in short-course chemotherapy. Tubercle. 1985." },
        { id: "4", short: "Zhang 2012", full: "Zhang Y and Mitchison D. The curious characteristics of pyrazinamide. Int J Tuberc Lung Dis. 2003." },
        { id: "5", short: "Sarathy 2016", full: "Sarathy JP et al. Extreme drug tolerance of Mycobacterium tuberculosis in caseum. Antimicrob Agents Chemother. 2018." },
        { id: "6", short: "Conradie 2020", full: "Conradie F et al. Treatment of highly drug-resistant pulmonary tuberculosis — ZeNix trial. N Engl J Med. 2020." },
        { id: "7", short: "WHO 2022", full: "World Health Organization. Treatment of drug-resistant tuberculosis. WHO/UCN/GMP/2022.01." },
      ],
    };
  };

  const handleDownloadJSON = () => {
    const data = buildTbReportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "TB_Report.json";
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    const jsPDF = await loadJsPDF();
    const d = buildTbReportData();
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const ML = 54, MR = 54, CW = W - ML - MR;
    const NAVY = [15, 23, 42], SLATE = [51, 65, 85], GRAY = [100, 116, 139];
    const GREEN = [34, 197, 94], AMBER = [245, 158, 11], RED = [239, 68, 68];
    const LIGHT = [248, 250, 252];
    let y = 54;
    const verdictColor = d.bluf.verdict === "EFFECTIVE" ? GREEN : d.bluf.verdict === "MARGINAL" ? AMBER : RED;

    // jsPDF standard fonts only support ISO-8859-1 — strip all non-Latin1 chars
    const sanitize = (s) => String(s ?? '')
      .replace(/\u2212/g, '-').replace(/\u2014/g, '--').replace(/\u2013/g, '-')
      .replace(/\u2265/g, '>=').replace(/\u2264/g, '<=').replace(/\u2248/g, '~')
      .replace(/\u221E/g, 'inf').replace(/\u03A3/g, 'Sum')
      .replace(/\u2022/g, '-').replace(/\u2019/g, "'").replace(/\u2018/g, "'")
      .replace(/\u2191/g, '^').replace(/\u2193/g, 'v').replace(/\u2192/g, '->')
      .replace(/[\u2080-\u2089]/g, (c) => String(c.codePointAt(0) - 0x2080))
      .replace(/\u26A0/g, '[!]').replace(/\u26D4/g, '[X]').replace(/\u2713/g, '[ok]')
      .replace(/[^\x00-\xFF]/g, '');
    const hline = (yy, w = 1, color = NAVY) => {
      doc.setDrawColor(...color); doc.setLineWidth(w); doc.line(ML, yy, W - MR, yy);
    };
    const addPage = () => { doc.addPage(); y = 54; };
    const checkY = (need = 60) => { if (y + need > doc.internal.pageSize.getHeight() - 54) addPage(); };
    const h1 = (text) => {
      checkY(32); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.setTextColor(...SLATE); doc.text(sanitize(text).toUpperCase(), ML, y); y += 4;
      hline(y, 0.5, [203, 213, 225]); y += 10;
    };
    const h2 = (text) => {
      checkY(20); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.setTextColor(...SLATE); doc.text(sanitize(text), ML, y); y += 14;
    };
    const body = (text) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
      const lines = doc.splitTextToSize(sanitize(text), CW);
      checkY(lines.length * 12); doc.text(lines, ML, y); y += lines.length * 12 + 2;
    };
    const mono = (text) => {
      doc.setFont("courier", "normal"); doc.setFontSize(8); doc.setTextColor(...NAVY);
      const lines = doc.splitTextToSize(sanitize(text), CW);
      checkY(lines.length * 11); doc.text(lines, ML, y); y += lines.length * 11;
    };
    const note = (text) => {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      const lines = doc.splitTextToSize(sanitize(text), CW);
      checkY(lines.length * 10); doc.text(lines, ML, y); y += lines.length * 10 + 3;
    };
    const addHF = () => {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(...NAVY); doc.setLineWidth(1.5); doc.line(ML, 36, W - MR, 36);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
        doc.text("MIRADOR", ML, 30);
        doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY);
        doc.text("TB Module -- Pulmonary Tuberculosis", ML + 52, 30);
        doc.text("CONFIDENTIAL", W - MR, 30, { align: "right" });
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.5);
        doc.line(ML, doc.internal.pageSize.getHeight() - 36, W - MR, doc.internal.pageSize.getHeight() - 36);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
        doc.text("MIRADOR  |  C_lesion = tau/K_combo  |  TB Module", ML, doc.internal.pageSize.getHeight() - 24);
        doc.text(`Page ${i}`, W - MR, doc.internal.pageSize.getHeight() - 24, { align: "right" });
      }
    };

    // ── COVER ───────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...NAVY);
    doc.text("MIRADOR", ML, y); y += 28;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...SLATE);
    doc.text("TB Module -- Pulmonary Tuberculosis  M. tuberculosis complex", ML, y); y += 13;
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text("For every patient who received the right drugs in the wrong geometry.", ML, y); y += 14;
    hline(y, 0.5, [203, 213, 225]); y += 12;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR }, head: [],
      body: [
        ["Patient", `${d.patient.age} yr  ·  ${d.patient.weight_kg} kg  ·  ${d.patient.cavitary ? "Cavitary" : "Non-cavitary"}  ·  NAT2 ${d.patient.nat2}`],
        ["HIV", d.patient.hiv ? `Positive - ART: ${d.patient.art_regimen}` : "Negative"],
        ["eGFR / Albumin", `${d.patient.egfr} mL/min  /  ${d.patient.albumin} g/dL`],
        ["HbA1c", `${d.patient.hba1c}%${d.patient.hba1c > 7 ? "  [!] diabetic - Vd expanded" : ""}`],
        ["Disease duration", `${d.patient.disease_months} months  Sputum ${d.patient.sputum_positive ? "positive" : "negative"}`],
        ["Regimen", `${d.recommendation.regimen}  (${d.regimen.class})`],
        ["Framework", "Davis Field Equations  Branch XI -- Therapeutic Geometry"],
        ["Report date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
      ],
      columnStyles: { 0: { fontStyle: "normal", textColor: GRAY, cellWidth: 130 }, 1: { fontStyle: "bold", textColor: NAVY } },
      styles: { fontSize: 8, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 14;

    // ── BLUF ────────────────────────────────────────────────────────────────
    // Draw navy header first, capture start y, render all content, THEN draw border
    checkY(80);
    const blufStartY = y;
    doc.setFillColor(...NAVY); doc.rect(ML, y, CW, 14, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    doc.text("CLINICAL RECOMMENDATIONS -- BOTTOM LINE UP FRONT", ML + 6, y + 10);
    y += 24;  // must clear the 14pt navbar + cap-height of next font
    doc.setFont("courier", "bold"); doc.setFontSize(8); doc.setTextColor(...verdictColor);
    doc.text(`>> VERDICT:   ${d.bluf.verdict}  --  C_lesion = ${d.bluf.c_lesion}`, ML + 6, y); y += 13;
    doc.text(`>> REGIMEN:   ${d.recommendation.regimen}  (${d.regimen.class})`, ML + 6, y); y += 13;
    doc.text(`>> DURATION:  ${d.bluf.duration_months ? d.bluf.duration_months + " months predicted" : "No drugs active"}`, ML + 6, y); y += 14;
    doc.setFont("courier", "normal"); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
    d.bluf.key_actions.forEach(action => {
      const lines = doc.splitTextToSize(sanitize(`- ${action}`), CW - 16);
      doc.text(lines, ML + 8, y); y += lines.length * 11 + 2;
    });
    y += 6;
    // Draw the border AFTER content so it wraps exactly the rendered height
    doc.setDrawColor(...verdictColor); doc.setLineWidth(1.5);
    doc.rect(ML, blufStartY, CW, y - blufStartY);
    y += 10;

    // ── S1: COMBINATION ENGINE ───────────────────────────────────────────────
    doc.addPage(); y = 54;
    h1("Section 1  —  Combination Engine: C_lesion = tau_combo / K_combo");
    body("Barriers act IN SERIES for each drug: K_pathway = total geometric barrier from blood to bacterium. Drugs act IN PARALLEL — each independently reaches the target population. K_combo = 1 / (synergy × Σ 1/K_i) is the composite barrier. tau_combo = synergy × Σ(τᵢ) is the pharmacophoric potential, where τᵢ is the per-drug AUC₂₄/MIC index (log scale, calibrated to RIPE: INH=1.97 RIF=1.66 PZA=0.91 EMB=0.46, Σ=5.00). C_lesion = tau_combo / K_combo. Removing a drug reduces both tau_combo and K_combo — the geometry encodes which matters more.");
    y += 6;
    const totalCond = d.regimen.active_drugs.reduce((s, k) => s + d.combination_math.K_pathway_per_drug[k].conductance, 0);
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "K_pathway", "tau_i (AUC/MIC)", "Conductance (1/K)", "Share(%)", "Note"]],
      body: d.regimen.active_drugs.map(k => {
        const kp = d.combination_math.K_pathway_per_drug[k];
        return [TB_DRUGS[k].label, String(kp.K_pathway.toFixed(3)), String((kp.tau ?? 0).toFixed(3)), String(kp.conductance.toFixed(3)), kp.share_pct.toFixed(0) + "%", sanitize(TB_DRUGS[k].note).slice(0, 48)];
      }),
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, font: "helvetica" },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 10;
    const tauSum = d.regimen.active_drugs.reduce((s, k) => s + (d.combination_math.K_pathway_per_drug[k].tau ?? 0), 0);
    mono(`Synergy factor:  ${d.regimen.synergy_factor}  (${d.regimen.class})`); y += 3;
    mono(`K_combo   =  1 / (${d.regimen.synergy_factor} x ${totalCond.toFixed(4)})  =  ${d.combination_math.K_combo.toFixed(4)}`); y += 3;
    mono(`tau_combo =  ${d.regimen.synergy_factor} x S(ti)  =  ${d.regimen.synergy_factor} x ${tauSum.toFixed(4)}  =  ${d.combination_math.tau_combo.toFixed(4)}`); y += 3;
    mono(`C_lesion  =  tau_combo / K_combo  =  ${d.combination_math.tau_combo.toFixed(4)} / ${d.combination_math.K_combo.toFixed(4)}  =  ${d.combination_math.C_lesion.toFixed(3)}`); y += 3;
    const kRipe = wasmResult?.k_combo_ripe ?? d.combination_math.K_combo;
    mono(`Duration  =  6 x (K_combo / K_combo_RIPE)  =  6 x (${d.combination_math.K_combo.toFixed(4)} / ${kRipe.toFixed(4)})  =  ${d.combination_math.duration_months_predicted ?? "inf"} months`); y += 10;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Threshold", "C_lesion", "Clinical meaning"]],
      body: [
        ["EFFECTIVE", ">= 9.5", "Standard 6-month cure rate achievable"],
        ["MARGINAL", "5.0-9.4", "Extended duration required; close monitoring"],
        ["FAILING", "< 5.0", "Insufficient coverage - regimen revision required"],
        [`This patient  [${d.bluf.verdict}]`, d.combination_math.C_lesion.toFixed(2), d.bluf.verdict === "EFFECTIVE" ? "Proceed with standard RIPE protocol" : d.bluf.verdict === "MARGINAL" ? "Extend to 9 months, culture-guided" : "Revise regimen before starting"],
      ],
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 14;

    // ── S2: GRANULOMA ────────────────────────────────────────────────────────
    h1("Section 2  —  Granuloma Penetration Geometry");
    const pw = d.granuloma_geometry.lesion_weights;
    body(`K_gran = (1/R_lesion) − 1  where R = lesion:plasma concentration ratio. Patient: ${d.patient.cavitary ? "cavitary" : "non-cavitary"}. Weighted compartments: lung ${(pw.wl * 100).toFixed(0)}%  cellular ${(pw.wc * 100).toFixed(0)}%  necrotic ${(pw.wn * 100).toFixed(0)}%  caseum ${(pw.wv * 100).toFixed(0)}%.`);
    y += 4;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "R_lung", "R_cellular", "R_necrotic", "R_caseum", "K_gran (weighted)"]],
      body: d.regimen.active_drugs.map(k => {
        const dr = TB_DRUGS[k];
        return [dr.label, dr.r_lung, dr.r_cellular, dr.r_necrotic, dr.r_caseum, d.granuloma_geometry.K_gran_per_drug[k].toFixed(3)];
      }),
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 8;
    note("RIF R_caseum = 0.05 → 95% of drug blocked at caseum barrier; K_gran catastrophically high. PZA R_caseum = 0.40 → only RIPE drug reliably reaching caseum. (Kjellsson 2012; Strydom 2025)");
    y += 8;

    // ── S3: SUBPOPULATIONS ───────────────────────────────────────────────────
    h1("Section 3  —  Bacterial Subpopulations (Mitchison Model)");
    const sw = d.subpopulations.weights;
    body(`Three phenotypic populations coexist. Disease ${d.patient.disease_months} months → ${d.patient.disease_months > 2 ? "chronic" : "acute"} pattern. Weights: replicating ${(sw.wr * 100).toFixed(0)}%  semi-dormant acidic ${(sw.wa * 100).toFixed(0)}%  dormant NRP ${(sw.wd * 100).toFixed(0)}%. K_phen = weighted phenotypic MIC penalty log₁₀(MIC_harder/MIC_std).`);
    y += 4;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "MIC_std (pH 7)", "MIC_acid (pH 5)", "MIC_dorm", "K_phen"]],
      body: d.regimen.active_drugs.map(k => {
        const dr = TB_DRUGS[k];
        const kp = d.subpopulations.K_phen_per_drug[k];
        return [dr.label, dr.mic_standard === null ? "inf (inactive pH 7)" : String(dr.mic_standard), String(dr.mic_acidic), dr.mic_dormant === null ? "inf" : String(dr.mic_dormant), (typeof kp === 'number') ? kp.toFixed(3) : "inf"];
      }),
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 8;
    note("PZA mic_std = ∞ (inactive at pH 7.4). In acidic caseum pH 4.5–5.5: sole sterilizing drug. pncA mutation abrogates activity globally — not a simple MIC shift. (Zhang 2012)");
    y += 8;

    // ── S4: RESERVOIRS ───────────────────────────────────────────────────────
    h1("Section 4  —  Multi-Reservoir Anatomy");
    const rw = d.reservoirs.weights;
    body(`K_res = Σ (1−R_x)·w_x across four anatomical sanctuaries. Patient: ${d.patient.cavitary ? "cavitary — cavity reservoir active" : "non-cavitary — cavity reservoir inactive (w=0)"}. Weights: extracellular ${(rw.we * 100).toFixed(0)}%  macrophage ${(rw.wm * 100).toFixed(0)}%  caseum ${(rw.wc * 100).toFixed(0)}%  cavity ${(rw.wv * 100).toFixed(0)}%.`);
    y += 4;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "K_res_extra", "K_res_macro", "K_res_caseum", "K_res_cav", "K_res (total)"]],
      body: d.regimen.active_drugs.map(k => {
        const dr = TB_DRUGS[k];
        return [dr.label,
          (Math.max((1 - dr.r_extra) * rw.we, 0)).toFixed(3),
          (Math.max((1 - dr.r_macro) * rw.wm, 0)).toFixed(3),
          (Math.max((1 - (dr.r_caseum || dr.r_necrotic)) * rw.wc, 0)).toFixed(3),
          (Math.max((1 - dr.r_cav) * rw.wv, 0)).toFixed(3),
          d.reservoirs.K_res_per_drug[k].toFixed(3),
        ];
      }),
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 8;
    note("BDQ R_macro = 3.0 → K_res_macro = max(1−3, 0)×w = 0 (accumulates, clears macrophage reservoir). BDQ fu_caseum = 0.001 → 99.9% protein-bound in caseum fat → effective caseum clearance catastrophic despite high total concentration. (Sarathy 2016; Strydom 2025)");
    y += 8;

    // ── S5: CLINICAL ACTIONS ─────────────────────────────────────────────────
    doc.addPage(); y = 54;
    h1("Section 5  —  Clinical Actions and Monitoring");
    d.recommendation.actions.forEach((action, i) => { mono(`${i + 1}.  ${action}`); y += 2; });
    y += 10;
    h2("Monitoring protocol");
    d.recommendation.monitoring.forEach(m => { note(`• ${m}`); });
    y += 8;
    if (d.recommendation.resistance_risk.length) {
      h2("Resistance risk — genes to monitor");
      d.recommendation.resistance_risk.forEach(r => { note(`• ${r}`); });
      y += 8;
    }
    h2("Data sources");
    d.sources.forEach(src => { note(`• [${src.short}]  ${src.full}`); });
    y += 12;
    hline(y, 0.5, [203, 213, 225]); y += 10;
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text("MIRADOR  |  Davis Geometric  |  Branch XI Therapeutic Geometry -- TB Module", W / 2, y, { align: "center" }); y += 12;
    doc.text("The granuloma does not care what the MIC says. The geometry decides.", W / 2, y, { align: "center" });
    addHF();
    doc.save("TB_Report.pdf");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#05050d", color: "#e2e8f0", fontFamily: FONT }}>
      <style>{`@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* HEADER */}
      <div style={{ background: "#05050d", borderBottom: "1px solid #1a1a2e", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: 3, color: "#e2e8f0" }}>TB MODULE</div>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>PULMONARY TB · M. tuberculosis complex</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 10, color: "#475569" }}>STAGE {stage + 1} / 5</div>
          {stage > 0 && <button onClick={() => setStage(0)} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>RESTART</button>}
        </div>
      </div>

      {/* DEDICATION */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 0" }}>
        <div style={{ padding: "16px 20px", background: "#09090f", borderRadius: 8, borderLeft: "3px solid #22c55e", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: 3, marginBottom: 6, fontFamily: FONT }}>FOR EVERY PATIENT WITH DRUG-RESISTANT TB</div>
          <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500, marginBottom: 5 }}>The drugs exist. The geometry of deployment does not.</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.8 }}>
            10 million new TB cases per year. 1.5 million deaths. A cure rate that hasn't changed since 1952 — not because
            the drugs failed, but because the math of where they go inside a granuloma was never formally described.
            The TB module extends the Davis manifold to four lesion compartments, three bacterial subpopulations, and four anatomical reservoirs.
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 8, fontStyle: "italic" }}>
            For every patient who received the right drugs in the wrong geometry.
          </div>
        </div>
      </div>

      {/* TITLE CARD */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "6px 16px 4px" }}>
        <div style={{ padding: "10px 14px", background: "#0c0c1a", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
            Five layers: patient pharmacokinetics → granuloma penetration geometry → bacterial subpopulation phenotypes
            → multi-reservoir anatomy → combination conductance. Each stage recomputes from patient inputs.
            The <span style={{ color: "#f59e0b" }}>RIPE drug toggles in Stage 5</span> are the geometric proof that no three-drug subset covers all four reservoirs.
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flexDirection: mob ? "column" : "row", alignItems: "flex-start", maxWidth: 1200, margin: "0 auto", padding: mob ? "0 12px 32px" : "0 16px 32px", gap: 16 }}>

        {/* ── LEFT: Stage cards ── */}
        <div style={{ flex: mob ? "1 1 100%" : (vizExpanded !== null ? "1 1 340px" : "1 1 520px"), minWidth: 0, width: "100%", transition: "flex 0.35s ease" }}>

          {/* ══ STAGE 0: THE PATIENT ═══════════════════════════════════ */}
          <StageCard stage={0} current={stage} title="THE PATIENT" subtitle="Adult TB PK — NAT2, HIV, diabetes, disease extent"
            accent={ripeColor} onAdvance={() => setStage(1)} advanceLabel="SHOW ME THE GRANULOMA →" onJumpTo={() => setStage(0)}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              {[["Age", pt.age, v => updatePt('age', +v), "yr"], ["Weight", pt.weight, v => updatePt('weight', +v), "kg"], ["Albumin", pt.albumin, v => updatePt('albumin', parseFloat(v)), "g/dL", 0.1], ["eGFR", pt.egfr, v => updatePt('egfr', +v), "mL/min"]].map(([label, val, onChange, unit, step = 1]) => (
                <div key={label} style={{ flex: "1 1 120px", padding: "8px 10px", background: "#0c0c1a", border: "1px solid #1a1a2e", borderRadius: 6 }}>
                  <div style={{ fontSize: 8, color: "#64748b", marginBottom: 4 }}>{label}</div>
                  <input type="number" value={val} step={step} onChange={e => onChange(e.target.value)}
                    style={{ width: "100%", background: "#12121f", border: "1px solid #1e293b", borderRadius: 4, padding: "4px 6px", color: "#e2e8f0", fontFamily: FONT, fontSize: 11, outline: "none" }} />
                  <div style={{ fontSize: 8, color: "#334155", marginTop: 2 }}>{unit}</div>
                </div>
              ))}
            </div>

            {/* NAT2 Acetylator */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "#64748b", marginBottom: 5 }}>NAT2 Acetylator Status (isoniazid metabolism):</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[['slow', '#ef4444'], ['intermediate', '#f59e0b'], ['fast', '#22c55e']].map(([v, c]) => (
                  <SelectBtn key={v} label={v.toUpperCase()} on={pt.nat2 === v} onClick={() => updatePt('nat2', v)} color={c} />
                ))}
              </div>
              <div style={{ fontSize: 9, color: "#334155", marginTop: 4 }}>
                {pt.nat2 === 'slow' && "Slow: ↑ INH exposure → hepatotoxicity risk; monitor LFTs"}
                {pt.nat2 === 'intermediate' && "Intermediate: standard RIPE dosing appropriate"}
                {pt.nat2 === 'fast' && "Fast: ↑ clearance → sub-therapeutic INH; consider higher dose or TDM"}
              </div>
            </div>

            {/* HIV Toggle */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "#64748b", marginBottom: 5 }}>HIV Status:</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <SelectBtn label="HIV negative" on={!pt.hiv} onClick={() => updatePt('hiv', false)} color="#22c55e" />
                <SelectBtn label="HIV positive" on={pt.hiv} onClick={() => updatePt('hiv', true)} color="#ef4444" />
                {pt.hiv && (
                  <select value={pt.art_regimen} onChange={e => updatePt('art_regimen', e.target.value)}
                    style={{ background: "#0d0d1e", border: "1px solid #1e293b", borderRadius: 5, color: "#e2e8f0", fontFamily: FONT, fontSize: 10, padding: "4px 8px" }}>
                    <option value="none">No ART yet</option>
                    <option value="nnrti">NNRTI-based (efavirenz)</option>
                    <option value="pi">PI-based (atazanavir/r)</option>
                    <option value="insti">INSTI-based (dolutegravir)</option>
                  </select>
                )}
              </div>
              {hiv_rif_conflict && (
                <div style={{ marginTop: 6, padding: "6px 10px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 5, fontSize: 9, color: "#ef4444" }}>
                  ⛔ RIF + PI contraindicated — RIF induces CYP3A4, collapses PI levels 75-90%. Switch to rifabutin (150mg 3×/wk).
                </div>
              )}
            </div>

            {/* HbA1c + Disease extent */}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, padding: "8px 10px", background: "#0c0c1a", border: "1px solid #1a1a2e", borderRadius: 6 }}>
                <div style={{ fontSize: 8, color: "#64748b", marginBottom: 4 }}>HbA1c (diabetes)</div>
                <input type="number" value={pt.hba1c} step={0.1} onChange={e => updatePt('hba1c', parseFloat(e.target.value))}
                  style={{ width: "100%", background: "#12121f", border: `1px solid ${pt.hba1c > 7 ? "#f59e0b44" : "#1e293b"}`, borderRadius: 4, padding: "4px 6px", color: pt.hba1c > 7 ? "#f59e0b" : "#e2e8f0", fontFamily: FONT, fontSize: 11, outline: "none" }} />
                <div style={{ fontSize: 8, color: "#334155", marginTop: 2 }}>% — &gt;7 expands Vd, ↑ INH toxicity risk</div>
              </div>
              <div style={{ flex: 1, padding: "8px 10px", background: "#0c0c1a", border: "1px solid #1a1a2e", borderRadius: 6 }}>
                <div style={{ fontSize: 8, color: "#64748b", marginBottom: 4 }}>Disease duration</div>
                <input type="number" value={pt.disease_months} step={1} min={0} onChange={e => updatePt('disease_months', +e.target.value)}
                  style={{ width: "100%", background: "#12121f", border: "1px solid #1e293b", borderRadius: 4, padding: "4px 6px", color: "#e2e8f0", fontFamily: FONT, fontSize: 11, outline: "none" }} />
                <div style={{ fontSize: 8, color: "#334155", marginTop: 2 }}>months — sets population weights</div>
              </div>
            </div>

            {/* Cavitary + Sputum */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <SelectBtn label={`Cavitary: ${pt.cavitary ? "YES" : "NO"}`} on={pt.cavitary} onClick={() => updatePt('cavitary', !pt.cavitary)} color="#ef4444" />
              <SelectBtn label={`Sputum: ${pt.sputum_pos ? "POSITIVE" : "NEGATIVE"}`} on={pt.sputum_pos} onClick={() => updatePt('sputum_pos', !pt.sputum_pos)} color="#f59e0b" />
            </div>
            {pt.cavitary && <div style={{ fontSize: 9, color: "#ef4444", marginBottom: 4 }}>Cavitary disease: high bacillary burden in cavity, caseum reservoir active. Longer duration common.</div>}

            <DataRow label="Age / Weight" value={`${pt.age} yr / ${pt.weight} kg`} />
            <DataRow label="NAT2 INH CL ×" value={nat2_cl_mult(pt.nat2).toFixed(2)} color={pt.nat2 === 'slow' ? "#ef4444" : pt.nat2 === 'fast' ? "#22c55e" : "#94a3b8"} />
            <DataRow label="Diabetes Vd factor" value={diabetes_vd_factor(pt.hba1c).toFixed(3)} color={pt.hba1c > 7 ? "#f59e0b" : "#94a3b8"} />
            <DataRow label="eGFR" value={pt.egfr} unit="mL/min" color={pt.egfr < 30 ? "#ef4444" : "#94a3b8"} />
            {pt.egfr < 30 && <div style={{ fontSize: 9, color: "#ef4444", marginTop: 4 }}>⚠ EMB renally excreted — reduce dose or avoid below eGFR 30</div>}
          </StageCard>

          {/* ══ STAGE 1: THE GRANULOMA ═════════════════════════════════ */}
          <StageCard stage={1} current={stage} title="THE GRANULOMA" subtitle="Lesion:plasma penetration ratios · four-compartment geometry"
            accent={granColor} onAdvance={() => setStage(2)} advanceLabel="SHOW THE POPULATIONS →" onJumpTo={() => setStage(1)}>
            <GranulomaSection pt={pt} ripeActive={null} />
            <div style={{ marginTop: 10, fontSize: 9, color: "#334155", textAlign: "center", marginBottom: 10 }}>
              K_gran = (1/R_lesion) − 1 · longer arrow = better penetration <Src text="Kjellsson 2012 · Strydom 2025" />
            </div>
            {/* Lesion:plasma ratio table */}
            <div style={{ overflowX: "auto", marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                    {["Drug", "R_lung", "R_cellular", "R_necrotic", "R_caseum", "K_gran"].map(h => (
                      <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["inh","rif","pza","emb","bdq"].map(key => {
                    const d = TB_DRUGS[key];
                    const kg = wasmResult?.per_drug?.[DRUG_NAME_MAP[key]]?.k_granuloma ?? 0;
                    return (
                      <tr key={key} style={{ borderBottom: "1px solid #0f1623" }}>
                        <td style={{ padding: "3px 6px", color: d.color, fontWeight: 600 }}>{d.short}</td>
                        <td style={{ padding: "3px 6px", color: "#94a3b8" }}>{d.r_lung}</td>
                        <td style={{ padding: "3px 6px", color: "#94a3b8" }}>{d.r_cellular}</td>
                        <td style={{ padding: "3px 6px", color: d.r_necrotic < 0.1 ? "#ef4444" : "#94a3b8" }}>{d.r_necrotic}</td>
                        <td style={{ padding: "3px 6px", color: d.r_caseum < 0.1 ? "#ef4444" : d.r_caseum > 0.35 ? "#22c55e" : "#94a3b8" }}>{d.r_caseum}</td>
                        <td style={{ padding: "3px 6px", color: kg > 5 ? "#ef4444" : kg > 2 ? "#f59e0b" : "#22c55e", fontWeight: 700 }}>{kg > 20 ? ">20" : kg.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 12px", background: "#f9711011", border: "1px solid #f9711033", borderRadius: 5, fontSize: 10, color: "#f97316" }}>
              RIF K_gran = {(wasmResult?.per_drug?.rifampin?.k_granuloma ?? 0).toFixed(1)} — catastrophic caseum barrier (R=0.05 → 95% of drug never arrives).
              PZA K_gran = {(wasmResult?.per_drug?.pyrazinamide?.k_granuloma ?? 0).toFixed(2)} — only RIPE drug that reliably penetrates caseum.
            </div>
          </StageCard>

          {/* ══ STAGE 2: THE POPULATIONS ═══════════════════════════════ */}
          <StageCard stage={2} current={stage} title="THE POPULATIONS" subtitle="Mitchison subpopulations · three bacterial phenotypes"
            accent={popColor} onAdvance={() => setStage(3)} advanceLabel="SHOW THE RESERVOIRS →" onJumpTo={() => setStage(2)}>
            {/* Subpopulation bars */}
            {[
              { key: 'rep', label: "Replicating (cavity wall)", w: popWeights.wr, color: "#22c55e", best: "INH", desc: "Neutral pH · fast-dividing · INH cycle 0 → 5 days" },
              { key: 'acid', label: "Semi-dormant acidic (macrophage)", w: popWeights.wa, color: "#f59e0b", best: "PZA", desc: "pH 4.5-5.5 · slow-growing · 2-3 month sterilization" },
              { key: 'dorm', label: "Dormant NRP (caseum hypoxic)", w: popWeights.wd, color: "#ef4444", best: "RIF/BDQ", desc: "Non-replicating · 5-6 month sterilization" },
            ].map(pop => (
              <div key={pop.key} style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4, fontWeight: 600 }}>
                  <span style={{ color: pop.color }}>{pop.label}</span>
                  <span style={{ color: "#475569" }}>w = {pop.w.toFixed(2)} · best: <span style={{ color: pop.color }}>{pop.best}</span></span>
                </div>
                <div style={{ height: 28, background: "#12121f", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pop.w * 200}%`, height: "100%", background: pop.color, opacity: 0.8, transition: "width 0.4s" }} />
                </div>
                <div style={{ fontSize: 9, color: "#334155", marginTop: 2 }}>{pop.desc}</div>
              </div>
            ))}
            <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 6, marginTop: 8 }}>MIC COMPARISON PER DRUG PER POPULATION</div>
            <div style={{ overflowX: "auto", marginBottom: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                    {["Drug", "MIC_std (pH7)", "MIC_acid (pH5)", "MIC_dorm", "K_phen"].map(h => (
                      <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {["inh","rif","pza","emb","bdq"].map(key => {
                    const d = TB_DRUGS[key];
                    const kp = wasmResult?.per_drug?.[DRUG_NAME_MAP[key]]?.k_phenotype ?? 0;
                    return (
                      <tr key={key} style={{ borderBottom: "1px solid #0f1623" }}>
                        <td style={{ padding: "3px 6px", color: d.color, fontWeight: 600 }}>{d.short}</td>
                        <td style={{ padding: "3px 6px", color: d.mic_standard === null ? "#ef4444" : "#94a3b8" }}>{d.mic_standard === null ? "∞ (pH7)" : d.mic_standard}</td>
                        <td style={{ padding: "3px 6px", color: "#94a3b8" }}>{d.mic_acidic}</td>
                        <td style={{ padding: "3px 6px", color: d.mic_dormant === null ? "#ef4444" : "#94a3b8" }}>{d.mic_dormant === null ? "∞" : d.mic_dormant}</td>
                        <td style={{ padding: "3px 6px", color: kp > 2 ? "#ef4444" : kp > 1 ? "#f59e0b" : "#22c55e", fontWeight: 700 }}>{kp.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "8px 12px", background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 5, fontSize: 10, color: "#f59e0b" }}>
              PZA K_phen_rep capped at log₁₀(500) ≈ 2.70 — inactive at pH 7.4 (Binary Hammer cap, v2.2). In the acidic caseum (pH 4.5), PZA is the ONLY drug that sterilizes.
              pncA mutation abolishes enzymatic activation globally — resistance sets K_phen to max cap for ALL compartments, not just MIC shift.
              <Src text="Zhang 2012" />
            </div>
          </StageCard>

          {/* ══ STAGE 3: THE RESERVOIRS ═══════════════════════════════ */}
          <StageCard stage={3} current={stage} title="THE RESERVOIRS" subtitle="Four TB anatomical sanctuaries · drug-specific access"
            accent={resColor} onAdvance={() => setStage(4)} advanceLabel="BUILD THE COMBINATION →" onJumpTo={() => setStage(3)}>
            {/* 4-ring nested visualization */}
            {(() => {
              const { we, wm, wc, wv } = resWeights;
              const reservoirs = [
                { label: "R4 Cavity surface", K: Math.max((1 - TB_DRUGS.rif.r_cav) * wv, 0) + 0.05, color: "#f97316", r: 100, desc: `w=${wv.toFixed(2)} · direct inhaled + blood access` },
                { label: "R1 Extracellular", K: Math.max((1 - TB_DRUGS.rif.r_extra) * we, 0) + 0.08, color: "#22c55e", r: 80, desc: `w=${we.toFixed(2)} · vascularized, cleared by INH/RIF` },
                { label: "R2 Intracellular", K: Math.max((1 - TB_DRUGS.rif.r_macro) * wm, 0) + 0.1, color: "#f59e0b", r: 60, desc: `w=${wm.toFixed(2)} · acidic phagosome, pH 5.0·BDQ accumulates` },
                { label: "R3 Caseum core", K: Math.max((1 - TB_DRUGS.rif.r_caseum) * wc, 0), color: "#ef4444", r: 38, desc: `w=${wc.toFixed(2)} · avascular, only PZA+MXF reliable` },
              ];
              const cx = 108, cy = 108;
              return (
                <svg width={216} height={216} viewBox="0 0 216 216" style={{ display: "block", margin: "0 auto 10px" }}>
                  {reservoirs.map(rv => (
                    <g key={rv.label}>
                      <circle cx={cx} cy={cy} r={rv.r} fill={rv.color} opacity={Math.min(0.1 + rv.K * 0.5, 0.55)}
                        stroke={rv.color} strokeWidth={1} strokeOpacity={0.4} />
                      <text x={cx} y={cy - rv.r + 13} textAnchor="middle" fill="#e2e8f0" fontSize={6.5} fontFamily={FONT} opacity={0.8}>{rv.label}</text>
                    </g>
                  ))}
                  <text x={cx} y={cy + 4} textAnchor="middle" fill="#fff" fontSize={9} fontFamily={FONT} fontWeight={700}>M.tb</text>
                  <text x={cx} y={215} textAnchor="middle" fill="#334155" fontSize={7} fontFamily={FONT}>opacity ∝ K_res · RIF reference</text>
                </svg>
              );
            })()}
            {[["inh","rif","pza","bdq"]].flat().map(key => {
              const d = TB_DRUGS[key];
              const kr = wasmResult?.per_drug?.[DRUG_NAME_MAP[key]]?.k_reservoir ?? 0;
              const label = `K_res ${d.short} = ${kr.toFixed(3)}`;
              return <KBar key={key} label={label} value={kr} max={1.0} color={d.color} note={d.note.split(';')[0]} />;
            })}
            <div style={{ marginTop: 8, padding: "8px 12px", background: "#a78bfa11", border: "1px solid #a78bfa33", borderRadius: 5, fontSize: 10, color: "#a78bfa" }}>
              BDQ R_macro = 3.0 → K_res_macro = max(1−3, 0) × w = <strong>0</strong> (accumulates, clears macrophage reservoir).<br />
              BDQ fu_caseum = 0.001 → effective caseum clearance = catastrophic despite high total drug concentration.
              <Src text="Sarathy 2016 · Strydom 2025" />
            </div>
            {!pt.cavitary && <div style={{ fontSize: 9, color: "#06b6d4", marginTop: 6 }}>Non-cavitary: w_cavity = 0. Cavity reservoir = inactive in this patient.</div>}
          </StageCard>

          {/* ══ STAGE 4: THE COMBINATION ══════════════════════════════ */}
          <StageCard stage={4} current={stage} title="THE COMBINATION" subtitle="Parallel conductor model · drug removal geometry · MDR scenario"
            accent={comboColor} onJumpTo={() => setStage(4)}>

            {/* Drug toggle buttons — the centerpiece */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 2, marginBottom: 8 }}>STANDARD RIPE (toggle any drug off):</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {["inh","rif","pza","emb"].map(k => (
                  <button key={k} onClick={() => toggleRipe(k)} style={{
                    padding: "8px 16px", fontFamily: FONT, fontSize: 13, fontWeight: 900, cursor: "pointer", borderRadius: 6,
                    border: `2px solid ${ripeOn[k] ? TB_DRUGS[k].color : "#1e293b"}`,
                    background: ripeOn[k] ? TB_DRUGS[k].color + "25" : "#0d0d1e",
                    color: ripeOn[k] ? TB_DRUGS[k].color : "#334155",
                    transition: "all 0.2s", letterSpacing: 2,
                    boxShadow: ripeOn[k] ? `0 0 12px ${TB_DRUGS[k].color}33` : "none",
                  }}>
                    {TB_DRUGS[k].short}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 2, marginBottom: 6 }}>ADD-ON DRUGS (BPaL / MDR):</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {["bdq","lzd","pto"].map(k => (
                  <button key={k} onClick={() => toggleBpal(k)} style={{
                    padding: "6px 12px", fontFamily: FONT, fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 5,
                    border: `1px solid ${bpalOn[k] ? TB_DRUGS[k].color : "#1e293b"}`,
                    background: bpalOn[k] ? TB_DRUGS[k].color + "20" : "#0d0d1e",
                    color: bpalOn[k] ? TB_DRUGS[k].color : "#334155", transition: "all 0.2s",
                  }}>
                    {TB_DRUGS[k].short} ({TB_DRUGS[k].label.split(' ')[0]})
                  </button>
                ))}
              </div>
              {/* Presets */}
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 2, marginBottom: 5 }}>PRESETS:</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {[
                  ["RIPE (standard)", "ripe", "#22c55e"],
                  ["No Z (caseum crisis)", "hrze_no_z", "#ef4444"],
                  ["MDR (no H+R)", "mdr", "#ef4444"],
                  ["BPaL (XDR)", "bpal", "#a78bfa"],
                  ["MDR + BDQ+LZD", "mdr_bpal", "#f59e0b"],
                ].map(([lbl, preset, c]) => (
                  <button key={preset} onClick={() => applyPreset(preset)} style={{ padding: "4px 9px", fontFamily: FONT, fontSize: 8, cursor: "pointer", borderRadius: 4, border: `1px solid ${c}44`, background: "#0d0d1e", color: c, letterSpacing: 1 }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* C_lesion gauge */}
            <ClesionGauge c={cLesion} label={
              cLesion >= 9.5 ? "EFFECTIVE — 6-month standard cure achievable" :
              cLesion >= 5.0 ? "MARGINAL — extend duration, monitor closely" :
              Object.values(allActive).every(v => !v) ? "No drugs selected" :
              !ripeOn.pza && !bpalOn.bdq ? "Caseum reservoir untreated — fatal gap in coverage" :
              !ripeOn.inh && !ripeOn.rif ? "MDR pattern — second-line therapy required" :
              "Coverage insufficient — combination review needed"
            } />

            {/* Duration */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, padding: "10px 12px", background: "#0d0d1e", borderRadius: 6, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: durationMonths > 9 ? "#ef4444" : durationMonths > 7 ? "#f59e0b" : "#22c55e", fontFamily: FONT }}>
                  {durationMonths >= 99 ? "∞" : durationMonths.toFixed(1)}
                </div>
                <div style={{ fontSize: 9, color: "#64748b" }}>months predicted</div>
              </div>
              <div style={{ flex: 1, padding: "10px 12px", background: "#0d0d1e", borderRadius: 6, textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#94a3b8", fontFamily: FONT }}>{kCombo >= 99 ? "∞" : kCombo.toFixed(3)}</div>
                <div style={{ fontSize: 9, color: "#64748b" }}>K_combo</div>
              </div>
            </div>

            {/* Per-drug K_pathway bars */}
            <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 2, marginBottom: 6 }}>DRUG PATHWAYS (K_pathway = total barrier):</div>
            {Object.entries(allActive).filter(([,on]) => on).map(([key]) => {
              const kv = wasmResult?.per_drug?.[DRUG_NAME_MAP[key]]?.k_pathway ?? 5;
              return (
                <div key={key} style={{ marginBottom: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
                    <span style={{ color: TB_DRUGS[key].color, fontFamily: FONT, fontWeight: 700 }}>{TB_DRUGS[key].label}</span>
                    <span style={{ color: "#64748b", fontFamily: FONT }}>K={kv.toFixed(2)} · cond={(1/kv).toFixed(3)}</span>
                  </div>
                  <div style={{ height: 5, background: "#12121f", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(kv / 10) * 100}%`, background: TB_DRUGS[key].color, borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                  <div style={{ fontSize: 7, color: "#334155", fontFamily: FONT, marginTop: 1 }}>{TB_DRUGS[key].note.slice(0, 70)}</div>
                </div>
              );
            })}
            {Object.values(allActive).every(v => !v) && (
              <div style={{ padding: "10px", textAlign: "center", color: "#ef4444", fontSize: 11, border: "1px dashed #ef444433", borderRadius: 6 }}>
                No drugs active — select at least one
              </div>
            )}
            {!ripeOn.pza && !bpalOn.bdq && Object.values(allActive).some(v => v) && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 5, fontSize: 10, color: "#ef4444" }}>
                ⛔ PZA removed with no caseum-active substitute — caseum reservoir untreated. C_lesion collapse confirmed: {cLesion.toFixed(2)} vs threshold 5.0.
              </div>
            )}
            {!ripeOn.inh && !ripeOn.rif && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 5, fontSize: 10, color: "#f59e0b" }}>
                ⚠ MDR-TB pattern: both INH and RIF removed. This requires molecularly confirmed resistance testing (GeneXpert, line probe assay, WGS)
                and second-line regimen design (BPaL ± pyrazinamide ± meropenem-clavulanate). MDR C_lesion = {cLesion.toFixed(2)}.
              </div>
            )}
          </StageCard>

          {/* ══ REPORT SECTION ════════════════════════════════════════ */}
          {stage >= 4 && (
            <div style={{ borderRadius: 8, border: "1px solid #22c55e44", background: "#080f08", marginBottom: 12, overflow: "hidden", animation: "fadeSlideIn 0.45s ease" }}>
              {/* Header strip */}
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #22c55e22", background: "#091209" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", letterSpacing: 1 }}>CLINICAL REPORT</div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>BLUF · JSON export · PDF summary</div>
              </div>
              <div style={{ padding: "14px 14px" }}>

                {/* ── BLUF card ── */}
                {(() => {
                  const verdict = cLesion >= 9.5 ? "EFFECTIVE" : cLesion >= 5.0 ? "MARGINAL" : "FAILING";
                  const verdictColor = verdict === "EFFECTIVE" ? "#22c55e" : verdict === "MARGINAL" ? "#f59e0b" : "#ef4444";
                  const isBpal = Object.keys(bpalOn).some(k => bpalOn[k]);
                  const allRipe = ripeOn.inh && ripeOn.rif && ripeOn.pza && ripeOn.emb;
                  const regimenClass = isBpal ? "BPaL / MDR" : allRipe ? "RIPE standard" : "Modified RIPE";
                  const onKeys = Object.keys(allActive).filter(k => allActive[k]);
                  const regimenStr = onKeys.map(k => TB_DRUGS[k].short).join("");
                  const keyPoints = [
                    ripeOn.pza || bpalOn.bdq ? "✓ Caseum-active drug present (PZA/BDQ)" : "⛔ No caseum-active drug — granuloma core untreated",
                    ripeOn.inh ? "✓ INH: replicating bacteria targeted (cavity wall)" : "⚠ No INH: replicating subpopulation uncovered",
                    ripeOn.rif || bpalOn.bdq ? "✓ RIF/BDQ: dormant NRP subpopulation targeted" : "⚠ No RIF or BDQ: dormant bacteria uncovered",
                    pt.nat2 === 'slow' ? "⚠ Slow NAT2: monitor LFTs weekly (INH hepatotoxicity)" : null,
                    pt.nat2 === 'fast' ? "⚠ Fast NAT2: INH sub-therapeutic — check trough at week 2" : null,
                    pt.egfr < 30 ? `⚠ eGFR ${pt.egfr}: dose-adjust EMB; monitor ocular toxicity` : null,
                    hiv_rif_conflict ? "⛔ RIF + PI: switch to rifabutin immediately" : null,
                    pt.hba1c > 7 ? `⚠ DM (HbA1c ${pt.hba1c}%): relapse risk ↑, optimize glycemia` : null,
                    pt.cavitary ? "⚠ Cavitary: extend to culture-guided endpoint (week 8 sputum)" : null,
                  ].filter(Boolean);
                  return (
                    <div style={{ marginBottom: 14, padding: "12px 14px", background: "#05080a", border: `1px solid ${verdictColor}44`, borderRadius: 6 }}>
                      <div style={{ fontSize: 9, color: verdictColor, letterSpacing: 3, marginBottom: 8, fontWeight: 700 }}>BOTTOM LINE UP FRONT</div>
                      <div style={{ display: "flex", gap: 14, marginBottom: 10 }}>
                        <div style={{ textAlign: "center", minWidth: 64 }}>
                          <div style={{ fontSize: 42, fontWeight: 700, color: verdictColor, lineHeight: 1, fontFamily: FONT }}>{cLesion >= 99 ? "—" : cLesion.toFixed(1)}</div>
                          <div style={{ fontSize: 8, color: "#64748b", marginTop: 2 }}>C_lesion</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: verdictColor, marginBottom: 4 }}>{verdict}</div>
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>Regimen: <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{regimenStr || "—"}</span> ({regimenClass})</div>
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>
                            Duration: <span style={{ color: durationMonths > 9 ? "#ef4444" : durationMonths > 7 ? "#f59e0b" : "#22c55e", fontWeight: 700 }}>
                              {durationMonths >= 99 ? "∞" : durationMonths.toFixed(1)} months
                            </span> predicted
                          </div>
                          <div style={{ fontSize: 10, color: "#94a3b8" }}>Patient: {pt.age} yr · {pt.weight} kg · {pt.cavitary ? "cavitary" : "non-cavitary"} · NAT2 {pt.nat2}</div>
                        </div>
                      </div>
                      <div style={{ borderTop: "1px solid #0f1623", paddingTop: 8 }}>
                        {keyPoints.map((pt2, i) => (
                          <div key={i} style={{ fontSize: 10, color: pt2.startsWith("⛔") ? "#ef4444" : pt2.startsWith("⚠") ? "#f59e0b" : "#22c55e", marginBottom: 3 }}>
                            {pt2}
                          </div>
                        ))}
                      </div>
                      <div style={{ marginTop: 10, padding: "6px 10px", background: "#0a0a14", borderRadius: 4, fontSize: 9, color: "#334155", lineHeight: 1.7, fontStyle: "italic" }}>
                        Monitor: sputum culture at weeks 2/4/8 · LFTs weekly × 2 months
                        {Object.values(allActive).some((v, i) => v && Object.keys(allActive)[i] === 'emb') ? " · visual acuity monthly (EMB)" : ""}
                        {bpalOn.bdq ? " · ECG monthly (BDQ QTc)" : ""}
                        {bpalOn.lzd ? " · CBC weekly (LZD myelosuppression)" : ""}
                      </div>
                    </div>
                  );
                })()}

                {/* ── Download buttons ── */}
                <div style={{ display: "flex", gap: 8 }}>
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
                  Report includes: combination math · granuloma penetration · subpopulations · reservoirs · clinical actions
                </div>

              </div>
            </div>
          )}

        </div>

        {/* ── RIGHT: sidebar (math panel) ── */}
        <div style={{ flex: mob ? "1 1 100%" : (vizExpanded !== null ? "1 1 calc(100% - 360px)" : "0 0 300px"), minWidth: mob ? 0 : 260, maxWidth: mob ? "100%" : 440 }}>
          <div style={{ position: mob ? "static" : "sticky", top: 80 }}>
            {/* Expand/collapse toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#0a0a14", border: "1px solid #1a1a2e", borderRadius: "6px 6px 0 0" }}>
              <span style={{ fontSize: 9, color: "#475569", letterSpacing: 2 }}>MATH PANEL — STAGE {stage + 1}</span>
              <button onClick={() => setVizExpanded(vizExpanded === stage ? null : stage)} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
                {vizExpanded === stage ? "COLLAPSE" : "EXPAND"}
              </button>
            </div>
            <div style={{ background: "#09090f", border: "1px solid #1a1a2e", borderTop: "none", borderRadius: "0 0 6px 6px", padding: "12px 14px" }}>
              <TbSidebar stage={stage} pt={pt} active={allActive} kCombo={kCombo} cLesion={cLesion}
                patientWeights={patientWeights} popWeights={popWeights} resWeights={resWeights}
                expanded={vizExpanded === stage} wasmResult={wasmResult} />
            </div>

            {/* Stage 4 live granuloma with active drugs */}
            {stage === 4 && (
              <div style={{ marginTop: 10, background: "#09090f", border: "1px solid #1a1a2e", borderRadius: 6, padding: "10px 14px" }}>
                <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 2, marginBottom: 6 }}>PENETRATION MAP — CURRENT REGIMEN</div>
                <GranulomaSection pt={pt} ripeActive={allActive} />
                <div style={{ fontSize: 8, color: "#334155", textAlign: "center", marginTop: 4 }}>Dim arrows = drug toggled off</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
