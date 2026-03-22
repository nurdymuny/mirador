import { useState, useMemo, useEffect } from "react";

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

// Load jsPDF + autotable from CDN on demand (same pattern as MiradorApp)
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

// ─── tiny UI primitives ───────────────────────────────────────────────────────

function Src({ text }) {
  return (
    <span style={{ fontSize: 8, color: "#334155", marginLeft: 4, fontStyle: "italic" }}>
      [{text}]
    </span>
  );
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

function FieldCtrl({ value, onChange, unit, color, step = 1 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 64, background: "#0e0e1c", color: color || "#e2e8f0",
          border: `1px solid ${color ? color + "44" : "#1e293b"}`,
          borderRadius: 4, padding: "3px 6px", fontFamily: FONT, fontSize: 11,
          outline: "none",
        }}
      />
      {unit && <span style={{ fontSize: 10, color: "#475569" }}>{unit}</span>}
    </div>
  );
}

function KBar({ label, value, max, color }) {
  const pct = Math.min(value / max, 1) * 100;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
        <span style={{ color: "#64748b" }}>{label}</span>
        <span style={{ color: color || "#94a3b8" }}>{value.toFixed(3)}</span>
      </div>
      <div style={{ height: 4, background: "#1a1a2e", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color || "#3b82f6", borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function StageCard({ stage, current, title, subtitle, accent, children, onAdvance, advanceLabel, onJumpTo }) {
  const visible = current >= stage;
  const active = current === stage;
  const done = current > stage;
  if (!visible) return null;
  return (
    <div style={{
      borderRadius: 8, border: `1px solid ${active ? accent + "44" : "#1a1a2e"}`,
      background: active ? "#0c0c1a" : done ? "#08080f" : "#0a0a14",
      marginBottom: 12, overflow: "hidden",
      animation: active ? "fadeSlideIn 0.45s ease" : "none",
      opacity: done ? 0.7 : 1,
    }}>
      <div
        style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: done ? "pointer" : "default", borderBottom: `1px solid ${active ? accent + "22" : "#12121f"}` }}
        onClick={done ? onJumpTo : undefined}
      >
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
            <button
              onClick={onAdvance}
              style={{
                marginTop: 16, width: "100%", padding: "10px 0",
                background: accent + "18", color: accent,
                border: `1px solid ${accent}44`, borderRadius: 6,
                fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2, cursor: "pointer",
              }}
              onMouseOver={e => e.currentTarget.style.background = accent + "28"}
              onMouseOut={e => e.currentTarget.style.background = accent + "18"}
            >
              {advanceLabel || "CONTINUE →"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Keske Method math (mirrors Rust, all formulas from spec) ─────────────────

// K1: Pediatric PK
function schwartz_egfr(height_cm, creatinine) {
  return 0.413 * height_cm / Math.max(creatinine, 0.01);
}
function allometric_cl(base_cl, weight_kg) {
  return base_cl * Math.pow(Math.max(weight_kg, 1) / 70, 0.75);
}
function allometric_vd(base_vd, weight_kg) {
  return base_vd * Math.pow(Math.max(weight_kg, 1) / 70, 1.0);
}
function bsa_mosteller(height_cm, weight_kg) {
  return Math.sqrt(height_cm * weight_kg / 3600);
}
function vd_inflation(crp) {
  return Math.min(1.0 + 0.002 * Math.max(crp - 100, 0), 1.4);
}

// K2: Bone penetration
function r_bone_eff(r_bone_baseline, crp) {
  const modifier = 1.0 + 0.006 * Math.max(crp - 100, 0);
  return Math.min(r_bone_baseline * modifier, r_bone_baseline * 2.0);
}
function k_penetration(r_bone_baseline, crp) {
  const r = r_bone_eff(r_bone_baseline, crp);
  return 1.0 / r - 1.0;
}

// K3: Biofilm
function k_biofilm(mbec, mic) {
  return Math.log10(Math.max(mbec / Math.max(mic, 0.001), 1.0));
}
function biofilm_prob(days) {
  if (days < 14) return 0.20;
  if (days <= 90) return 0.60;
  return 0.95;
}
function k_biofilm_eff(mbec, mic, days) {
  return biofilm_prob(days) * k_biofilm(mbec, mic);
}
function p_scv(days) {
  // Modeling assumption: rate k=0.1/day, pending clinical calibration
  return 1.0 - Math.exp(-0.1 * days);
}

// K4: Reservoir
function k_res_sac(p_drainage) {
  return (1.0 - p_drainage) * 0.5;
}
function k_res_mat(p_debride, k_pen) {
  return (1.0 - p_debride) * k_pen;
}
function k_res_intra(intracellular_fraction, rifampin_in_combo) {
  const rifampin_modifier = rifampin_in_combo ? 0.4 : 1.0;
  return 0.8 * intracellular_fraction * rifampin_modifier;
}
function k_reservoir(p_drainage, p_debride, k_pen, intracellular_frac, rifampin_in_combo) {
  return (
    k_res_sac(p_drainage) +
    k_res_mat(p_debride, k_pen) +
    k_res_intra(intracellular_frac, rifampin_in_combo)
  );
}

// K_pathway for a single drug in bone (all barriers in series)
function k_pathway(k_admet, k_pen, k_bio_eff, k_res) {
  return k_admet + k_pen + k_bio_eff + k_res;
}

// Combination: parallel resistor model
function combo_coherence(tau_a, k_path_a, tau_b, k_path_b, synergy) {
  const cond_sum = (1.0 / Math.max(k_path_a, 0.001)) + (1.0 / Math.max(k_path_b, 0.001));
  const K_combo = 1.0 / (cond_sum * synergy);
  const tau_combo = (tau_a + tau_b) * synergy;
  return { K_combo, tau_combo, C_combo: tau_combo / Math.max(K_combo, 0.001) };
}

// Drug reference data (published, spec-verified)
const DRUGS = {
  ceftaroline: {
    label: "Ceftaroline",
    tau: 12,
    k_admet: 0.67,
    r_bone: 0.30,
    mbec: 128, mic: 1.0,
    intracellular: 0.30,
    is_rifampin: false,
    color: "#22c55e",
    refs: "PDB 3ZG0 · FDA label · EUCAST 2024",
    note: "Only β-lactam active on PBP2a-MRSA; planktonic + moderate biofilm",
  },
  rifampin: {
    label: "Rifampin",
    tau: 8,
    k_admet: 0.50,
    r_bone: 0.35,
    mbec: 0.5, mic: 0.008,
    intracellular: 0.60,
    is_rifampin: true,
    color: "#f97316",
    refs: "Tuchscherr 2011 · Sendi 2011",
    note: "Unique osteoblast penetration; NEVER monotherapy (rpoB mutations in ~80%)",
  },
  vancomycin: {
    label: "Vancomycin",
    tau: 12,
    k_admet: 0.50,
    r_bone: 0.20,
    mbec: 512, mic: 1.0,
    intracellular: 0.05,
    is_rifampin: false,
    color: "#ef4444",
    refs: "FDA label · Liu AAC 2011",
    note: "Standard MRSA therapy: very poor bone penetration (R=0.20)",
  },
  linezolid: {
    label: "Linezolid",
    tau: 12,
    k_admet: 0.40,
    r_bone: 0.50,
    mbec: 256, mic: 2.0,
    intracellular: 0.50,
    is_rifampin: false,
    color: "#a78bfa",
    refs: "FDA label · Galanakis 2020",
    note: "Excellent intracellular and bone penetration; static only",
  },
  daptomycin: {
    label: "Daptomycin",
    tau: 24,
    k_admet: 0.60,
    r_bone: 0.15,
    mbec: 32, mic: 0.5,
    intracellular: 0.10,
    is_rifampin: false,
    color: "#f59e0b",
    refs: "FDA label",
    note: "High-dose biofilm activity; very poor bone penetration; surfactant inactivation in concurrent pneumonia",
  },
  clindamycin: {
    label: "Clindamycin",
    tau: 8,
    k_admet: 0.50,
    r_bone: 0.525,
    mbec: 64, mic: 0.25,
    intracellular: 0.25,
    is_rifampin: false,
    color: "#06b6d4",
    refs: "Liu AAC 2011",
    note: "Best bone penetration of all MRSA drugs (R=0.52); modest biofilm activity",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// SidebarContent — inline sidebar with optional expanded in-place mode
// ─────────────────────────────────────────────────────────────────────────────
function SidebarContent({ stage, pt, allDrugs, drugA, drugB, eGFR, bsa, vd_mult,
  bio_prob, k_pen_a, k_res_sac_val, k_res_mat_val, k_res_intra_val,
  rifampin_in_combo, c_vanc_mono, c_a_mono, kpa, kpb, combo, improvement_vs_vanc,
  DRUGS, FONT, expanded }) {

  const Divider = () => (
    <div style={{ borderTop: "1px solid #1a1a2e", margin: "12px 0" }} />
  );
  const Explain = ({ children }) => (
    <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.75, marginTop: 10 }}>{children}</div>
  );
  // Reusable small bar row
  const MiniBar = ({ label, val, max, color, unit, note }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748b", marginBottom: 3 }}>
        <span style={{ fontFamily: FONT }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{typeof val === "number" ? val.toFixed(unit === "%" ? 0 : 2) : val}{unit === "×adult" ? "×" : unit ? ` ${unit}` : ""}</span>
      </div>
      <div style={{ height: 7, background: "#12121f", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(val / max, 1) * 100}%`, background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
      {note && <div style={{ fontSize: 8, color: "#334155", marginTop: 2 }}>{note}</div>}
    </div>
  );

  if (stage === 0) {
    const clScale = allometric_cl(1.0, pt.weight_kg);
    const vdScale = allometric_vd(1.0, pt.weight_kg);
    const inflPct = (vd_mult - 1) * 100;
    const metrics = [
      { label: "CL (¾-power)", val: clScale, max: 1.0, unit: "×adult", color: "#3b82f6", note: `(Wt/70)^0.75` },
      { label: "Vd (linear)", val: vdScale, max: 1.0, unit: "×adult", color: "#818cf8", note: `(Wt/70)^1.0` },
      { label: "Vd inflation", val: inflPct, max: 40, unit: "%", color: "#f59e0b", note: `CRP ${pt.crp} mg/L` },
      { label: "eGFR (Schwartz)", val: eGFR, max: 130, unit: "mL/min", color: eGFR < 60 ? "#ef4444" : "#22c55e", note: eGFR < 60 ? "↓ impaired" : "normal" },
    ];
    return (
      <>
        <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 6 }}>K1 · PEDIATRIC PK</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>vs a 70 kg adult</div>
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
          Bars show this patient relative to an adult reference. Shorter bar = lower value.
        </div>
        {metrics.map(m => (
          <MiniBar key={m.label} label={m.label} val={m.val} max={m.max} unit={m.unit} color={m.color} note={m.note} />
        ))}
        <div style={{ padding: "7px 10px", background: "#0d0d1e", borderRadius: 6, fontSize: 9, color: "#475569", fontFamily: FONT, lineHeight: 1.6 }}>
          BSA {bsa.toFixed(3)} m² &nbsp;·&nbsp; SCV risk {(p_scv(pt.infection_days)*100).toFixed(0)}%
        </div>

        {expanded && (
          <>
            <Divider />
            <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 8 }}>ALL-DRUG ADJUSTED τ_eff FOR THIS CHILD</div>
            <div style={{ fontSize: 9, color: "#475569", marginBottom: 8 }}>
              Each drug's nominal dosing interval scaled by CL ratio — shorter bar = drug wears off faster.
            </div>
            {allDrugs.map(d => {
              const tauEff = DRUGS[d.key].tau * clScale;
              return (
                <div key={d.key} style={{ marginBottom: 7, opacity: d.isSelected ? 1 : 0.5 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
                    <span style={{ color: d.isSelected ? d.color : "#475569", fontFamily: FONT, fontWeight: d.isSelected ? 700 : 400 }}>{d.label}</span>
                    <span style={{ color: d.color, fontFamily: FONT }}>{tauEff.toFixed(1)}h effective</span>
                  </div>
                  <div style={{ height: 6, background: "#12121f", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(tauEff / 24) * 100}%`, background: d.color, borderRadius: 3, opacity: d.isSelected ? 1 : 0.45, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
            <Divider />
            <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 8 }}>SCV PROBABILITY CURVE</div>
            <div style={{ fontSize: 9, color: "#475569", marginBottom: 6 }}>
              Risk of Small Colony Variant emergence (1−e^(−0.1×√days)). Current day marked in blue.
            </div>
            {(() => {
              const W = "100%", H = 80;
              const pts = Array.from({ length: 50 }, (_, i) => {
                const d = (i / 49) * 2500;
                return { x: (i / 49) * 100, y: p_scv(d) * 100 };
              });
              const toSvgY = (pct) => H - (pct / 100) * H;
              const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x}% ${toSvgY(p.y)}`).join(" ");
              const curX = Math.min(pt.infection_days / 2500, 1) * 100;
              const curY = toSvgY(p_scv(pt.infection_days) * 100);
              return (
                <svg width="100%" height={H + 20} viewBox={`0 0 100 ${H + 20}`} preserveAspectRatio="none" style={{ display: "block", marginBottom: 4 }}>
                  <polyline points={pts.map(p => `${p.x},${toSvgY(p.y)}`).join(" ")} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
                  <line x1={curX} y1={0} x2={curX} y2={H} stroke="#3b82f644" strokeWidth="1" strokeDasharray="2,2" />
                  <circle cx={curX} cy={curY} r={2} fill="#3b82f6" />
                  <text x={curX + 1} y={curY - 3} fontSize={5} fill="#3b82f6" fontFamily="monospace">{(p_scv(pt.infection_days)*100).toFixed(0)}%</text>
                  <text x={0} y={H + 14} fontSize={5} fill="#334155" fontFamily="monospace">d=0</text>
                  <text x={90} y={H + 14} fontSize={5} fill="#334155" fontFamily="monospace">d=2500</text>
                </svg>
              );
            })()}
            <div style={{ fontSize: 8, color: "#334155" }}>
              At day {pt.infection_days}: {(p_scv(pt.infection_days)*100).toFixed(0)}% SCV risk · Vd inflation CRP={pt.crp} → +{inflPct.toFixed(0)}%
            </div>
          </>
        )}

        <Divider />
        <Explain>
          Drug doses are designed for a 70 kg adult. A {pt.weight_kg} kg child clears drugs
          in about {(clScale * 100).toFixed(0)}% of the time, so the drug is gone faster — meaning
          standard adult doses may never reach effective bone levels before wearing off.
          {inflPct > 5 && ` On top of that, severe inflammation (CRP ${pt.crp}) pushes ${inflPct.toFixed(0)}% more of the drug out of the bloodstream and into inflamed tissue, diluting what reaches the bone further.`}
        </Explain>
      </>
    );
  }

  if (stage === 1) {
    const maxKpen = Math.max(...allDrugs.map(d => d.kp));
    const crpMult = Math.min(1 + 0.006 * Math.max(pt.crp - 100, 0), 2);
    const crpBoost = ((crpMult - 1) * 100).toFixed(0);
    return (
      <>
        <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>K2 · BONE PENETRATION</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>K_pen per drug · CRP-adjusted</div>
        <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
          Longer bar = higher barrier. Your selected drugs are highlighted.
        </div>
        {allDrugs.map(d => (
          <div key={d.key} style={{ marginBottom: 8, opacity: d.isSelected ? 1 : 0.4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
              <span style={{ color: d.isSelected ? d.color : "#475569", fontFamily: FONT, fontWeight: d.isSelected ? 700 : 400 }}>{d.label}</span>
              <span style={{ color: d.color, fontFamily: FONT }}>K={d.kp.toFixed(2)}</span>
            </div>
            <div style={{ height: 7, background: "#12121f", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(d.kp / maxKpen) * 100}%`, background: d.color, borderRadius: 3, opacity: d.isSelected ? 1 : 0.5, transition: "width 0.5s ease" }} />
            </div>
          </div>
        ))}
        <div style={{ fontSize: 8, color: "#334155", fontFamily: FONT, marginTop: 4 }}>
          CRP {pt.crp} mg/L → +{crpBoost}% R_bone (capped 2×)
        </div>

        {expanded && (
          <>
            <Divider />
            <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 8 }}>BASELINE vs CRP-ADJUSTED R_bone</div>
            <div style={{ fontSize: 9, color: "#475569", marginBottom: 8 }}>
              Left (dim) = baseline penetration ratio. Right (bright) = CRP-boosted. Gap shows how much inflammation helps.
            </div>
            {allDrugs.map(d => {
              const baseR = DRUGS[d.key].r_bone;
              const effR = Math.min(baseR * crpMult, baseR * 2);
              const lostPct = ((1 - effR) * 100).toFixed(0);
              return (
                <div key={d.key} style={{ marginBottom: 10, opacity: d.isSelected ? 1 : 0.45 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
                    <span style={{ color: d.color, fontFamily: FONT, fontWeight: d.isSelected ? 700 : 400 }}>{d.label}</span>
                    <span style={{ color: "#475569", fontFamily: FONT }}>{lostPct}% lost at wall</span>
                  </div>
                  <div style={{ height: 5, background: "#12121f", borderRadius: 2, overflow: "hidden", marginBottom: 2 }}>
                    <div style={{ height: "100%", width: `${baseR * 100}%`, background: d.color, opacity: 0.3, borderRadius: 2 }} />
                  </div>
                  <div style={{ height: 5, background: "#12121f", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${effR * 100}%`, background: d.color, borderRadius: 2, transition: "width 0.5s ease" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#334155", fontFamily: FONT, marginTop: 1 }}>
                    <span>base {(baseR * 100).toFixed(0)}%</span>
                    <span>+CRP {(effR * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
            <Divider />
            <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>% DRUG LOST AT BONE WALL</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allDrugs.map(d => {
                const effR = Math.min(DRUGS[d.key].r_bone * crpMult, DRUGS[d.key].r_bone * 2);
                const lostPct = (1 - effR) * 100;
                const lostColor = lostPct > 80 ? "#ef4444" : lostPct > 60 ? "#f59e0b" : "#22c55e";
                return (
                  <div key={d.key} style={{ flex: "1 1 calc(50% - 6px)", padding: "6px 8px", background: "#0d0d1e", borderRadius: 5, opacity: d.isSelected ? 1 : 0.45 }}>
                    <div style={{ fontSize: 8, color: d.color, fontFamily: FONT, fontWeight: 700, marginBottom: 2 }}>{d.label}</div>
                    <div style={{ fontSize: 12, color: lostColor, fontFamily: FONT, fontWeight: 900 }}>{lostPct.toFixed(0)}%</div>
                    <div style={{ fontSize: 7, color: "#475569" }}>lost at wall</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <Divider />
        <Explain>
          Bone has very little blood flow compared to soft tissue, so most of an IV drug never
          even arrives at the infection. Vancomycin — the drug Steven was actually on — only
          gets 20% through the bone wall. Clindamycin gets over 50%. The inflammation from a
          high CRP actually helps a little by opening more blood vessels, but it tops out at 2×
          baseline, so it can't compensate for a fundamentally poor penetrator.
        </Explain>
      </>
    );
  }

  if (stage === 2) {
    const maxKbio = Math.max(...allDrugs.map(d => d.kb), 0.01);
    const bioColor = bio_prob > 0.85 ? "#ef4444" : bio_prob > 0.5 ? "#f59e0b" : "#22c55e";
    return (
      <>
        <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 6 }}>K3 · BIOFILM</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>K_bio_eff = p_biofilm × log₁₀(MBEC/MIC)</div>
        <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ padding: "4px 10px", background: bioColor + "18", border: `1px solid ${bioColor}44`, borderRadius: 20, fontSize: 10, color: bioColor, fontFamily: FONT, fontWeight: 700 }}>
            p_biofilm = {(bio_prob * 100).toFixed(0)}%
          </div>
          <span style={{ fontSize: 9, color: "#475569" }}>at {pt.infection_days}d</span>
        </div>
        {allDrugs.map(d => (
          <div key={d.key} style={{ marginBottom: 8, opacity: d.isSelected ? 1 : 0.4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
              <span style={{ color: d.isSelected ? d.color : "#475569", fontFamily: FONT, fontWeight: d.isSelected ? 700 : 400 }}>{d.label}</span>
              <span style={{ color: d.kb < 1 ? "#22c55e" : d.kb < 3 ? "#f59e0b" : "#ef4444", fontFamily: FONT }}>K={d.kb.toFixed(2)}</span>
            </div>
            <div style={{ height: 7, background: "#12121f", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(d.kb / maxKbio) * 100}%`, background: d.color, borderRadius: 3, opacity: d.isSelected ? 1 : 0.5, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ fontSize: 8, color: "#334155", fontFamily: FONT }}>MBEC/MIC {(d.mbec/d.mic).toFixed(0)}× → K_raw {Math.log10(d.mbec/d.mic).toFixed(2)}</div>
          </div>
        ))}

        {expanded && (
          <>
            <Divider />
            <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 8 }}>CHRONICITY TIMELINE</div>
            <div style={{ fontSize: 9, color: "#475569", marginBottom: 6 }}>
              Biofilm probability is a step function: 20% before 2 wks, 60% at 2–13 wks, 95% after 3 months.
            </div>
            {(() => {
              const H = 70;
              const segments = [
                { from: 0, to: 14, p: 0.20, color: "#22c55e", label: "<14d" },
                { from: 14, to: 90, p: 0.60, color: "#f59e0b", label: "14–90d" },
                { from: 90, to: 2500, p: 0.95, color: "#ef4444", label: ">90d" },
              ];
              const maxDay = 2500;
              const curX = Math.min(pt.infection_days / maxDay, 1) * 100;
              return (
                <svg width="100%" height={H + 22} viewBox={`0 0 100 ${H + 22}`} preserveAspectRatio="none" style={{ display: "block", marginBottom: 6 }}>
                  {segments.map(seg => {
                    const x1 = (seg.from / maxDay) * 100;
                    const x2 = (seg.to / maxDay) * 100;
                    const yTop = H - seg.p * H;
                    return (
                      <g key={seg.label}>
                        <rect x={x1} y={yTop} width={x2 - x1} height={seg.p * H} fill={seg.color} opacity={0.18} />
                        <line x1={x1} y1={yTop} x2={x2} y2={yTop} stroke={seg.color} strokeWidth="1.2" />
                        <text x={(x1 + x2) / 2} y={yTop - 2} fontSize={4.5} fill={seg.color} textAnchor="middle" fontFamily="monospace">{(seg.p * 100).toFixed(0)}%</text>
                      </g>
                    );
                  })}
                  <line x1={curX} y1={0} x2={curX} y2={H} stroke="#a78bfa88" strokeWidth="1" strokeDasharray="2,2" />
                  <text x={curX + 1} y={8} fontSize={4.5} fill="#a78bfa" fontFamily="monospace">{pt.infection_days}d</text>
                  <text x={0} y={H + 14} fontSize={4.5} fill="#334155" fontFamily="monospace">d=0</text>
                  <text x={87} y={H + 14} fontSize={4.5} fill="#334155" fontFamily="monospace">d=2500</text>
                </svg>
              );
            })()}
            <Divider />
            <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 8 }}>K_raw vs K_eff (weighted by p_biofilm)</div>
            {allDrugs.map(d => {
              const kRaw = Math.log10(d.mbec / d.mic);
              const kEff = d.kb;
              const maxRaw = Math.max(...allDrugs.map(x => Math.log10(x.mbec / x.mic)));
              return (
                <div key={d.key} style={{ marginBottom: 9, opacity: d.isSelected ? 1 : 0.45 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: d.color, fontFamily: FONT, marginBottom: 2, fontWeight: d.isSelected ? 700 : 400 }}>
                    <span>{d.label}</span>
                    <span>K_raw {kRaw.toFixed(2)} → K_eff {kEff.toFixed(2)}</span>
                  </div>
                  <div style={{ height: 4, background: "#12121f", borderRadius: 2, overflow: "hidden", marginBottom: 2 }}>
                    <div style={{ height: "100%", width: `${(kRaw / maxRaw) * 100}%`, background: d.color, opacity: 0.3, borderRadius: 2 }} />
                  </div>
                  <div style={{ height: 4, background: "#12121f", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(kRaw / maxRaw) * 100}%`, background: d.color, opacity: 0.85, borderRadius: 2 }}>
                      <div style={{ position: "relative", height: "100%", width: `${Math.min(kEff / kRaw, 1) * 100}%`, background: d.color }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 7, color: "#334155", fontFamily: FONT }}>MBEC/MIC = {(d.mbec/d.mic).toFixed(0)}× · p_bio {(bio_prob * 100).toFixed(0)}%</div>
                </div>
              );
            })}
          </>
        )}

        <Divider />
        <Explain>
          MRSA builds a protective shield called a biofilm — bacteria living inside it need
          100 to 1000× the normal drug concentration to be killed. The longer the infection
          runs, the more established the shield. After {pt.infection_days} days, there's a{" "}
          {(bio_prob * 100).toFixed(0)}% chance this biofilm is mature and near-impenetrable
          to standard doses. Rifampin is the only drug here whose biofilm bar is short —
          it has a unique ability to kill bacteria inside the biofilm structure itself. But
          use it alone and resistance emerges within days.
        </Explain>
      </>
    );
  }

  if (stage === 3) {
    const reservoirs = [
      { label: "R1 Sequestrum", K: k_res_sac_val, color: "#f97316", r: 96, desc: `K=${k_res_sac_val.toFixed(3)} · surgery cleared ${(pt.p_drainage*100).toFixed(0)}%` },
      { label: "R2 Bone matrix", K: k_res_mat_val, color: "#ef4444", r: 64, desc: `K=${k_res_mat_val.toFixed(3)} · drug-dependent` },
      { label: "R3 Intracellular", K: k_res_intra_val, color: "#991b1b", r: 32, desc: `K=${k_res_intra_val.toFixed(3)} · ${rifampin_in_combo ? "rif ×0.4 active" : "no drug reaches here"}` },
    ];
    const cx = 112, cy = 112;
    const totalK = k_res_sac_val + k_res_mat_val + k_res_intra_val;
    return (
      <>
        <div style={{ fontSize: 9, color: "#06b6d4", letterSpacing: 2, marginBottom: 6 }}>K4 · RESERVOIRS</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Three sanctuaries · live</div>
        <svg width={224} height={224} viewBox="0 0 224 224" style={{ display: "block", margin: "0 auto 6px" }}>
          {reservoirs.map(rv => (
            <g key={rv.label}>
              <circle cx={cx} cy={cy} r={rv.r} fill={rv.color}
                opacity={Math.min(0.12 + rv.K * 0.55, 0.65)}
                stroke={rv.color} strokeWidth={1} strokeOpacity={0.4} />
              <text x={cx} y={cy - rv.r + 13} textAnchor="middle" fill="#fff" fontSize={7} fontFamily={FONT} opacity={0.7}>{rv.label}</text>
            </g>
          ))}
          <text x={cx} y={cy - 5} textAnchor="middle" fill="#fff" fontSize={9} fontFamily={FONT} fontWeight={700}>MRSA</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fill="#64748b" fontSize={7} fontFamily={FONT}>SCV</text>
          <text x={cx} y={216} textAnchor="middle" fill="#475569" fontSize={8} fontFamily={FONT}>K_res = {totalK.toFixed(3)}</text>
        </svg>
        {reservoirs.map(rv => (
          <div key={rv.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: rv.color, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: "#64748b", fontFamily: FONT }}>{rv.desc}</span>
          </div>
        ))}
        <div style={{ marginTop: 4, fontSize: 8, color: "#334155" }}>Ring opacity ∝ K. Adjust surgery sliders — watch rings shrink.</div>

        {expanded && (
          <>
            <Divider />
            <div style={{ fontSize: 9, color: "#06b6d4", letterSpacing: 2, marginBottom: 8 }}>K_res COMPOSITION PER DRUG</div>
            <div style={{ fontSize: 9, color: "#475569", marginBottom: 8 }}>
              Stacked bars show how each drug's R3 intracellular burden shifts with vs without rifampin in combo.
            </div>
            {allDrugs.map(d => {
              const kpd = k_penetration(DRUGS[d.key].r_bone, pt.crp);
              const sacK = k_res_sac_val;
              const matK = k_res_mat(pt.p_debride, kpd);
              const intraWithRif = k_res_intra(pt.intracellular_frac, true);
              const intraNoRif = k_res_intra(pt.intracellular_frac, false);
              const intraK = d.key === "rifampin" ? intraWithRif : intraNoRif;
              const totalD = sacK + matK + intraK;
              const maxTotal = k_res_sac_val + k_res_mat_val + Math.max(intraWithRif, intraNoRif);
              return (
                <div key={d.key} style={{ marginBottom: 10, opacity: d.isSelected ? 1 : 0.45 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: d.color, fontFamily: FONT, fontWeight: d.isSelected ? 700 : 400, marginBottom: 3 }}>
                    <span>{d.label}</span>
                    <span>K_res={totalD.toFixed(3)}</span>
                  </div>
                  <div style={{ height: 8, background: "#12121f", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                    <div style={{ height: "100%", width: `${(sacK / maxTotal) * 100}%`, background: "#f97316", flexShrink: 0 }} />
                    <div style={{ height: "100%", width: `${(matK / maxTotal) * 100}%`, background: "#ef4444", flexShrink: 0 }} />
                    <div style={{ height: "100%", width: `${(intraK / maxTotal) * 100}%`, background: "#991b1b", flexShrink: 0 }} />
                  </div>
                  <div style={{ display: "flex", fontSize: 7, gap: 6, color: "#475569", fontFamily: FONT, marginTop: 2 }}>
                    <span style={{ color: "#f97316" }}>SAC {sacK.toFixed(3)}</span>
                    <span style={{ color: "#ef4444" }}>Mat {matK.toFixed(3)}</span>
                    <span style={{ color: "#991b1b" }}>Intra {intraK.toFixed(3)}</span>
                  </div>
                </div>
              );
            })}
            <Divider />
            <div style={{ fontSize: 9, color: "#06b6d4", letterSpacing: 2, marginBottom: 6 }}>RIFAMPIN EFFECT ON R3</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <div style={{ flex: 1, padding: "8px 10px", background: "#0d0d1e", borderRadius: 5 }}>
                <div style={{ fontSize: 8, color: "#475569", marginBottom: 3 }}>Without rifampin</div>
                <div style={{ fontSize: 13, color: "#ef4444", fontFamily: FONT, fontWeight: 900 }}>{k_res_intra(pt.intracellular_frac, false).toFixed(3)}</div>
              </div>
              <div style={{ flex: 1, padding: "8px 10px", background: "#0d1f0d", border: "1px solid #22c55e22", borderRadius: 5 }}>
                <div style={{ fontSize: 8, color: "#475569", marginBottom: 3 }}>With rifampin</div>
                <div style={{ fontSize: 13, color: "#22c55e", fontFamily: FONT, fontWeight: 900 }}>{k_res_intra(pt.intracellular_frac, true).toFixed(3)}</div>
              </div>
            </div>
            <div style={{ fontSize: 8, color: "#334155" }}>
              Rifampin reduces R3 by ×0.4 — from {k_res_intra(pt.intracellular_frac, false).toFixed(3)} down to {k_res_intra(pt.intracellular_frac, true).toFixed(3)}.
              K_res total: {(k_res_sac_val + k_res_mat_val + k_res_intra(pt.intracellular_frac, false)).toFixed(3)} → {(k_res_sac_val + k_res_mat_val + k_res_intra(pt.intracellular_frac, true)).toFixed(3)}.
            </div>
          </>
        )}

        <Divider />
        <Explain>
          Even if a drug survives the journey to the bone and breaks through the biofilm,
          MRSA has three escape routes. Dead bone without a blood supply (sequestra) acts
          like a bunker — no drug can reach in, only surgery can remove it. Bacteria that
          hide in the protein matrix around the bone also need specific drugs to be active.
          Worst of all, MRSA can crawl inside the bone-forming cells themselves (osteoblasts)
          where almost nothing can follow — except rifampin. That's why rifampin in combination
          is so important for chronic cases like this one.
        </Explain>
      </>
    );
  }

  if (stage === 4) {
    const c_b_mono = DRUGS[drugB].tau / Math.max(kpb, 0.001);
    const bars = [
      { label: "Vanc\nmono", val: c_vanc_mono, color: "#ef4444" },
      { label: `${DRUGS[drugA].label.split(" ")[0]}\nmono`, val: c_a_mono, color: DRUGS[drugA].color },
      { label: `${DRUGS[drugB].label.split(" ")[0]}\nmono`, val: c_b_mono, color: DRUGS[drugB].color },
      { label: "COMBO", val: combo.C_combo, color: "#22c55e" },
    ];
    const maxC = Math.max(...bars.map(b => b.val)) * 1.1;
    const H = 110, THRESH = 5;
    const barH = (v) => Math.min(v / maxC, 1) * H;
    const threshY = H - (THRESH / maxC) * H;
    return (
      <>
        <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>COMBINATION · C_BONE</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 10 }}>Parallel model vs mono</div>
        <div style={{ position: "relative", height: H + 32, marginBottom: 8 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: threshY, borderTop: "1px dashed #475569", zIndex: 2 }} />
          <div style={{ position: "absolute", right: 0, top: threshY - 12, fontSize: 7, color: "#475569", fontFamily: FONT }}>C=5</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: H, position: "absolute", bottom: 24, left: 0, right: 16 }}>
            {bars.map(b => (
              <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ fontSize: 8, color: b.color, fontFamily: FONT, fontWeight: 700 }}>{b.val.toFixed(1)}</div>
                <div style={{
                  width: "100%", height: barH(b.val), background: b.color,
                  borderRadius: "3px 3px 0 0",
                  opacity: b.label === "COMBO" ? 1 : 0.6,
                  transition: "height 0.5s ease",
                  boxShadow: b.label === "COMBO" ? `0 0 8px ${b.color}66` : "none",
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, position: "absolute", bottom: 0, left: 0, right: 16 }}>
            {bars.map(b => (
              <div key={b.label} style={{ flex: 1, textAlign: "center", fontSize: 7.5, color: b.color, fontFamily: FONT, lineHeight: 1.3, whiteSpace: "pre-line" }}>{b.label}</div>
            ))}
          </div>
        </div>
        <div style={{ padding: "8px 10px", background: "#0d1f0d", border: "1px solid #22c55e22", borderRadius: 6, fontSize: 9, color: "#22c55e", fontFamily: FONT }}>
          {improvement_vs_vanc.toFixed(1)}× vs vancomycin mono
        </div>

        {expanded && (
          <>
            <Divider />
            <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 8 }}>K_PATHWAY BREAKDOWN — WHERE EACH DRUG FAILS</div>
            <div style={{ fontSize: 9, color: "#475569", marginBottom: 8 }}>
              Stacked total K per drug. Each segment shows which barrier contributes most to failure.
            </div>
            {(() => {
              const drugKeys = ["vancomycin", drugA, drugB];
              const drugRows = drugKeys.map(key => {
                const dr = DRUGS[key];
                const kA = dr.k_admet;
                const kP = k_penetration(dr.r_bone, pt.crp);
                const kB = k_biofilm(dr.mbec, dr.mic) * bio_prob;
                const kR = k_res_sac_val + k_res_mat(pt.p_debride, kP) + k_res_intra(pt.intracellular_frac, dr.is_rifampin || false);
                const total = kA + kP + kB + kR;
                return { key, label: dr.label, color: dr.color, kA, kP, kB, kR, total };
              });
              const maxTotal = Math.max(...drugRows.map(r => r.total));
              return (
                <>
                  {drugRows.map(r => (
                    <div key={r.key} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: r.color, fontFamily: FONT, fontWeight: 700, marginBottom: 3 }}>
                        <span>{r.label}</span><span>K={r.total.toFixed(2)}</span>
                      </div>
                      <div style={{ height: 10, background: "#12121f", borderRadius: 3, overflow: "hidden", display: "flex" }}>
                        <div title={`K_admet ${r.kA.toFixed(2)}`} style={{ height: "100%", width: `${(r.kA / maxTotal) * 100}%`, background: "#3b82f6" }} />
                        <div title={`K_pen ${r.kP.toFixed(2)}`} style={{ height: "100%", width: `${(r.kP / maxTotal) * 100}%`, background: "#f97316" }} />
                        <div title={`K_bio ${r.kB.toFixed(2)}`} style={{ height: "100%", width: `${(r.kB / maxTotal) * 100}%`, background: "#a78bfa" }} />
                        <div title={`K_res ${r.kR.toFixed(2)}`} style={{ height: "100%", width: `${(r.kR / maxTotal) * 100}%`, background: "#06b6d4" }} />
                      </div>
                      <div style={{ display: "flex", fontSize: 7, gap: 5, color: "#475569", fontFamily: FONT, marginTop: 2 }}>
                        <span style={{ color: "#3b82f6" }}>PK {r.kA.toFixed(2)}</span>
                        <span style={{ color: "#f97316" }}>Pen {r.kP.toFixed(2)}</span>
                        <span style={{ color: "#a78bfa" }}>Bio {r.kB.toFixed(2)}</span>
                        <span style={{ color: "#06b6d4" }}>Res {r.kR.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 2, marginBottom: 4 }}>
                    {[["#3b82f6","K_admet (PK)"],["#f97316","K_pen (wall)"],["#a78bfa","K_bio (film)"],["#06b6d4","K_res (sanctuaries)"]].map(([c, lbl]) => (
                      <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <div style={{ width: 7, height: 7, background: c, borderRadius: 1 }} />
                        <span style={{ fontSize: 7, color: "#475569", fontFamily: FONT }}>{lbl}</span>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
            <Divider />
            <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 8 }}>SYNERGY SENSITIVITY</div>
            <div style={{ fontSize: 9, color: "#475569", marginBottom: 6 }}>
              C_combo across synergy factors 1.0 – 1.5. Current synergy marked.
            </div>
            {(() => {
              const synSteps = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
              const cVals = synSteps.map(s => {
                const kComb = 1 / ((1 / Math.max(kpa, 0.001) + 1 / Math.max(kpb, 0.001)) * s);
                const tau_eff = (DRUGS[drugA].tau + DRUGS[drugB].tau) / 2;
                return tau_eff / Math.max(kComb, 0.001);
              });
              const maxC2 = Math.max(...cVals) * 1.1;
              const barW = 100 / synSteps.length;
              const HS = 60;
              return (
                <svg width="100%" height={HS + 28} viewBox={`0 0 100 ${HS + 28}`} preserveAspectRatio="none" style={{ display: "block" }}>
                  {cVals.map((cv, i) => {
                    const x = i * barW;
                    const h = (cv / maxC2) * HS;
                    const isCur = Math.abs(synSteps[i] - (combo.synergy || 1.2)) < 0.05;
                    const col = cv >= THRESH ? "#22c55e" : "#ef4444";
                    return (
                      <g key={i}>
                        <rect x={x + 1} y={HS - h} width={barW - 2} height={h} fill={col} opacity={isCur ? 1 : 0.45} rx={1} />
                        <text x={x + barW / 2} y={HS - h - 2} fontSize={4} fill={col} textAnchor="middle" fontFamily="monospace">{cv.toFixed(1)}</text>
                        <text x={x + barW / 2} y={HS + 10} fontSize={4} fill={isCur ? "#e2e8f0" : "#475569"} textAnchor="middle" fontFamily="monospace">{synSteps[i].toFixed(1)}×</text>
                      </g>
                    );
                  })}
                  <line x1={0} y1={HS - (THRESH / maxC2) * HS} x2={100} y2={HS - (THRESH / maxC2) * HS} stroke="#47556988" strokeWidth="0.5" strokeDasharray="2,2" />
                  <text x={1} y={HS - (THRESH / maxC2) * HS - 1} fontSize={3.5} fill="#475569" fontFamily="monospace">C=5</text>
                </svg>
              );
            })()}
          </>
        )}

        <Divider />
        <Explain>
          The bars show the coherence score (C_bone) for each drug approach — how well-matched
          the drug is to this specific infection geometry. The C=5 dashed line is the minimum
          threshold for likely effectiveness. Vancomycin monotherapy, the standard approach
          Steven received for years, sits well below that line. The combination crosses it by
          a wide margin.{rifampin_in_combo
            ? " Rifampin's intracellular access is the key — it's the only drug that cuts through the final reservoir."
            : " Adding rifampin would further cut the intracellular reservoir (R3), the hardest barrier to breach."}
        </Explain>
      </>
    );
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function KeskeApp() {
  const mob = useIsMobile();
  const [stage, setStage] = useState(0);
  const [vizExpanded, setVizExpanded] = useState(null); // null = collapsed, number = which stage is open

  // ── K1: Pediatric patient ──
  const [pt, setPt] = useState({
    age_years: 10, weight_kg: 32, height_cm: 140,
    creatinine: 0.6, crp: 250, albumin: 3.2,
    infection_days: 2190, // ~6 years (Steven's scenario)
    p_drainage: 0.90,   // 4 surgical drainages; 90% SAC cleared
    p_debride: 0.80,    // 4 debridements
    intracellular_frac: 0.40, // high SCV burden after 6 yr
  });
  const updatePt = (k, v) => setPt(p => ({ ...p, [k]: parseFloat(v) || 0 }));

  // ── Drug selection ──
  const [drugA, setDrugA] = useState("ceftaroline");
  const [drugB, setDrugB] = useState("rifampin");
  const [synergy, setSynergy] = useState(1.2);

  // ── Computed K1 ──
  const eGFR = useMemo(() => schwartz_egfr(pt.height_cm, pt.creatinine), [pt.height_cm, pt.creatinine]);
  const bsa = useMemo(() => bsa_mosteller(pt.height_cm, pt.weight_kg), [pt.height_cm, pt.weight_kg]);
  const vd_mult = useMemo(() => vd_inflation(pt.crp), [pt.crp]);

  // ── Computed K2: bone penetration for each drug ──
  const k_pen_a = useMemo(() => k_penetration(DRUGS[drugA].r_bone, pt.crp), [drugA, pt.crp]);
  const k_pen_b = useMemo(() => k_penetration(DRUGS[drugB].r_bone, pt.crp), [drugB, pt.crp]);
  const k_pen_vanc = useMemo(() => k_penetration(DRUGS.vancomycin.r_bone, pt.crp), [pt.crp]);

  // ── Computed K3: biofilm ──
  const k_bio_a = useMemo(() => k_biofilm_eff(DRUGS[drugA].mbec, DRUGS[drugA].mic, pt.infection_days), [drugA, pt.infection_days]);
  const k_bio_b = useMemo(() => k_biofilm_eff(DRUGS[drugB].mbec, DRUGS[drugB].mic, pt.infection_days), [drugB, pt.infection_days]);
  const k_bio_vanc = useMemo(() => k_biofilm_eff(DRUGS.vancomycin.mbec, DRUGS.vancomycin.mic, pt.infection_days), [pt.infection_days]);
  const bio_prob = useMemo(() => biofilm_prob(pt.infection_days), [pt.infection_days]);
  const scv_prob = useMemo(() => p_scv(pt.infection_days), [pt.infection_days]);

  // ── Computed K4: reservoir ──
  const k_res_a = useMemo(() => k_reservoir(pt.p_drainage, pt.p_debride, k_pen_a, pt.intracellular_frac, DRUGS[drugB].is_rifampin), [pt, k_pen_a, drugA, drugB]);
  const k_res_b = useMemo(() => k_reservoir(pt.p_drainage, pt.p_debride, k_pen_b, pt.intracellular_frac, DRUGS[drugB].is_rifampin), [pt, k_pen_b, drugB]);
  const k_res_vanc = useMemo(() => k_reservoir(pt.p_drainage, pt.p_debride, k_pen_vanc, pt.intracellular_frac, false), [pt, k_pen_vanc]);

  // ── K_pathway totals ──
  const kpa = useMemo(() => k_pathway(DRUGS[drugA].k_admet, k_pen_a, k_bio_a, k_res_a), [drugA, k_pen_a, k_bio_a, k_res_a]);
  const kpb = useMemo(() => k_pathway(DRUGS[drugB].k_admet, k_pen_b, k_bio_b, k_res_b), [drugB, k_pen_b, k_bio_b, k_res_b]);
  const kp_vanc = useMemo(() => k_pathway(DRUGS.vancomycin.k_admet, k_pen_vanc, k_bio_vanc, k_res_vanc), [k_pen_vanc, k_bio_vanc, k_res_vanc]);

  // ── Combination + monotherapy coherence ──
  const combo = useMemo(() => combo_coherence(DRUGS[drugA].tau, kpa, DRUGS[drugB].tau, kpb, synergy), [drugA, kpa, drugB, kpb, synergy]);
  const c_vanc_mono = DRUGS.vancomycin.tau / Math.max(kp_vanc, 0.001);
  const c_a_mono = DRUGS[drugA].tau / Math.max(kpa, 0.001);

  const rifampin_in_combo = DRUGS[drugA].is_rifampin || DRUGS[drugB].is_rifampin;
  const rifampin_mono_blocked = DRUGS[drugA].is_rifampin && DRUGS[drugB].is_rifampin;

  const improvement_vs_vanc = combo.C_combo / Math.max(c_vanc_mono, 0.001);

  // ── All-drug comparison (for sidebar vizzes) ──
  const allDrugs = useMemo(() => {
    const hasRif = DRUGS[drugA].is_rifampin || DRUGS[drugB].is_rifampin;
    return Object.entries(DRUGS).map(([key, d]) => {
      const kp = k_penetration(d.r_bone, pt.crp);
      const kb = k_biofilm_eff(d.mbec, d.mic, pt.infection_days);
      const kr = k_reservoir(pt.p_drainage, pt.p_debride, kp, pt.intracellular_frac, hasRif);
      const kpath = k_pathway(d.k_admet, kp, kb, kr);
      const c = d.tau / Math.max(kpath, 0.001);
      return { key, label: d.label, color: d.color, tau: d.tau, r_bone: d.r_bone,
               k_admet: d.k_admet, mbec: d.mbec, mic: d.mic, kp, kb, kr, kpath, c,
               isSelected: key === drugA || key === drugB };
    });
  }, [pt, drugA, drugB]);

  // ─── Report builders ─────────────────────────────────────────────────────
  const buildReportData = () => ({
    framework: "MIRADOR — KESKE METHOD",
    governing_equation: "C_bone = tau / K_bone",
    branch: "XI  Therapeutic Geometry · Pediatric AHO Extension",
    generated: new Date().toISOString(),
    dedication: "For Steven Keske — 6 years, 5 antibiotics, 4 surgeries — still fighting",
    patient: {
      age_years: pt.age_years, weight_kg: pt.weight_kg, height_cm: pt.height_cm,
      creatinine: pt.creatinine, crp_mgl: pt.crp, albumin_gdl: pt.albumin,
      infection_days: pt.infection_days,
      p_drainage: pt.p_drainage, p_debridement: pt.p_debride,
      intracellular_fraction: pt.intracellular_frac,
    },
    k1_pediatric_pk: {
      eGFR_schwartz: +eGFR.toFixed(2),
      bsa_mosteller_m2: +bsa.toFixed(4),
      vd_inflation_multiplier: +vd_mult.toFixed(4),
      biofilm_probability_pct: +(bio_prob * 100).toFixed(1),
      p_scv_pct: +(scv_prob * 100).toFixed(2),
    },
    k2_bone_penetration: {
      drug_a: { name: DRUGS[drugA].label, r_bone_baseline: DRUGS[drugA].r_bone, r_bone_eff: +r_bone_eff(DRUGS[drugA].r_bone, pt.crp).toFixed(4), k_pen: +k_pen_a.toFixed(4) },
      drug_b: { name: DRUGS[drugB].label, r_bone_baseline: DRUGS[drugB].r_bone, r_bone_eff: +r_bone_eff(DRUGS[drugB].r_bone, pt.crp).toFixed(4), k_pen: +k_pen_b.toFixed(4) },
      vancomycin: { r_bone_baseline: 0.20, r_bone_eff: +r_bone_eff(0.20, pt.crp).toFixed(4), k_pen: +k_pen_vanc.toFixed(4) },
    },
    k3_biofilm: {
      drug_a: { name: DRUGS[drugA].label, mbec: DRUGS[drugA].mbec, mic: DRUGS[drugA].mic, k_bio: +k_biofilm(DRUGS[drugA].mbec, DRUGS[drugA].mic).toFixed(4), k_bio_eff: +k_bio_a.toFixed(4) },
      drug_b: { name: DRUGS[drugB].label, mbec: DRUGS[drugB].mbec, mic: DRUGS[drugB].mic, k_bio: +k_biofilm(DRUGS[drugB].mbec, DRUGS[drugB].mic).toFixed(4), k_bio_eff: +k_bio_b.toFixed(4) },
    },
    k4_reservoir: {
      k_res_sac: +k_res_sac(pt.p_drainage).toFixed(4),
      k_res_mat_drug_a: +k_res_mat(pt.p_debride, k_pen_a).toFixed(4),
      k_res_intra_no_rif: +k_res_intra(pt.intracellular_frac, false).toFixed(4),
      k_res_intra_with_rif: +k_res_intra(pt.intracellular_frac, true).toFixed(4),
      rifampin_in_combo: rifampin_in_combo,
      drug_a_total_reservoir: +k_res_a.toFixed(4),
      drug_b_total_reservoir: +k_res_b.toFixed(4),
    },
    combination_engine: {
      model: "Parallel resistor (barriers in series per drug, drugs in parallel)",
      drug_a: { name: DRUGS[drugA].label, tau_h: DRUGS[drugA].tau, k_pathway: +kpa.toFixed(4), c_mono: +(DRUGS[drugA].tau / Math.max(kpa, 0.001)).toFixed(4) },
      drug_b: { name: DRUGS[drugB].label, tau_h: DRUGS[drugB].tau, k_pathway: +kpb.toFixed(4), c_mono: +(DRUGS[drugB].tau / Math.max(kpb, 0.001)).toFixed(4) },
      synergy_factor: synergy,
      K_bone_combo: +combo.K_combo.toFixed(4),
      tau_combo_h: +combo.tau_combo.toFixed(2),
      C_bone_combo: +combo.C_combo.toFixed(4),
      vancomycin_mono_C_bone: +c_vanc_mono.toFixed(4),
      fold_improvement_vs_vanc: +improvement_vs_vanc.toFixed(2),
    },
    recommendation: {
      preferred_regimen: `${DRUGS[drugA].label} + ${DRUGS[drugB].label}`,
      c_bone_combo: +combo.C_combo.toFixed(2),
      c_bone_vanc_mono: +c_vanc_mono.toFixed(2),
      fold_improvement: +improvement_vs_vanc.toFixed(1),
      clinical_assessment: combo.C_combo > 10 ? "HIGHLY EFFECTIVE" : combo.C_combo > 5 ? "POTENTIALLY EFFECTIVE" : "LIKELY INSUFFICIENT",
      actions: [
        rifampin_in_combo ? "Rifampin MUST be combined — never monotherapy (rpoB resistance risk ~80%)" : null,
        eGFR < 30 ? `Dose-reduce based on eGFR ${eGFR.toFixed(1)} mL/min` : null,
        pt.intracellular_frac > 0.3 ? "High intracellular burden — rifampin combination strongly favored" : null,
        scv_prob > 0.5 ? `High SCV probability (${(scv_prob * 100).toFixed(0)}%) — prolonged therapy likely required` : null,
        "mecA sequencing recommended; monitor for rpoB if rifampin used",
      ].filter(Boolean),
    },
    data_sources: [
      "PDB 3ZG0 (ceftaroline-PBP2a complex)",
      "Tuchscherr 2011 (SCV intracellular persistence)",
      "Sendi 2011 (rifampin osteoblast penetration)",
      "Liu AAC 2011 (bone:serum ratios)",
      "FDA prescribing information (ceftaroline, rifampin, vancomycin)",
      "EUCAST 2024 (MIC breakpoints)",
    ],
  });

  const handleDownloadJSON = () => {
    const data = buildReportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "KESKE_Report.json";
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    const jsPDF = await loadJsPDF();
    const d = buildReportData();
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const ML = 54, MR = 54, CW = W - ML - MR;
    const NAVY = [15, 23, 42], SLATE = [51, 65, 85], GRAY = [100, 116, 139];
    const LIGHT = [248, 250, 252];
    let y = 54;

    const hline = (yy, w = 1, color = NAVY) => {
      doc.setDrawColor(...color); doc.setLineWidth(w);
      doc.line(ML, yy, W - MR, yy);
    };
    const addPage = () => { doc.addPage(); y = 54; };
    const checkY = (need = 60) => { if (y + need > doc.internal.pageSize.getHeight() - 54) addPage(); };
    const h1 = (text) => {
      checkY(32); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.setTextColor(...SLATE); doc.text(text.toUpperCase(), ML, y); y += 4;
      hline(y, 0.5, [203, 213, 225]); y += 10;
    };
    const h2 = (text) => {
      checkY(20); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.setTextColor(...SLATE); doc.text(text, ML, y); y += 14;
    };
    const body = (text, indent = 0) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
      const lines = doc.splitTextToSize(text, CW - indent);
      checkY(lines.length * 12);
      doc.text(lines, ML + indent, y); y += lines.length * 12 + 2;
    };
    const mono = (text) => {
      doc.setFont("courier", "normal"); doc.setFontSize(8); doc.setTextColor(...NAVY);
      const lines = doc.splitTextToSize(text, CW);
      checkY(lines.length * 11);
      doc.text(lines, ML, y); y += lines.length * 11;
    };
    const note = (text) => {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      const lines = doc.splitTextToSize(text, CW);
      checkY(lines.length * 10); doc.text(lines, ML, y); y += lines.length * 10 + 3;
    };

    const addHF = () => {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(...NAVY); doc.setLineWidth(1.5);
        doc.line(ML, 36, W - MR, 36);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
        doc.text("MIRADOR", ML, 30);
        doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY);
        doc.text("Keske Method — Pediatric AHO Clinical Analysis", ML + 52, 30);
        doc.text("CONFIDENTIAL", W - MR, 30, { align: "right" });
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.5);
        doc.line(ML, doc.internal.pageSize.getHeight() - 36, W - MR, doc.internal.pageSize.getHeight() - 36);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
        doc.text("MIRADOR  |  C_bone = tau/K_bone  |  Branch XI Therapeutic Geometry", ML, doc.internal.pageSize.getHeight() - 24);
        doc.text(`Page ${i}`, W - MR, doc.internal.pageSize.getHeight() - 24, { align: "right" });
      }
    };

    // ── COVER ──────────────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...NAVY);
    doc.text("MIRADOR", ML, y); y += 28;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...SLATE);
    doc.text("Keske Method — Pediatric Bone Infection (AHO) Extension", ML, y); y += 13;
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text(d.dedication, ML, y); y += 14;
    hline(y, 0.5, [203, 213, 225]); y += 12;

    doc.autoTable({
      startY: y, margin: { left: ML, right: MR }, head: [],
      body: [
        ["Target organism", "Staphylococcus aureus (MRSA) — chronic AHO"],
        ["Preferred regimen", d.recommendation.preferred_regimen],
        ["Patient", `${d.patient.age_years} yr, ${d.patient.weight_kg} kg, ${d.patient.height_cm} cm`],
        ["Infection duration", `${d.patient.infection_days} days (${(d.patient.infection_days / 365).toFixed(1)} yr)`],
        ["CRP", `${d.patient.crp_mgl} mg/L`],
        ["eGFR (Schwartz)", `${d.k1_pediatric_pk.eGFR_schwartz} mL/min`],
        ["Framework", "Davis Field Equations  Branch XI (Therapeutic Geometry)"],
        ["Report date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
      ],
      columnStyles: { 0: { fontStyle: "normal", textColor: GRAY, cellWidth: 130 }, 1: { fontStyle: "bold", textColor: NAVY } },
      styles: { fontSize: 8, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 14;

    // ── BLUF ───────────────────────────────────────────────────────────────
    checkY(80);
    doc.setDrawColor(...NAVY); doc.setLineWidth(1.5);
    doc.rect(ML, y, CW, 68);
    doc.setFillColor(...NAVY); doc.rect(ML, y, CW, 14, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255);
    doc.text("CLINICAL RECOMMENDATIONS — BOTTOM LINE UP FRONT", ML + 6, y + 10);
    doc.setFont("courier", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
    doc.text(`>> REGIMEN:   ${d.recommendation.preferred_regimen}`, ML + 6, y + 24);
    doc.text(`>> C_bone:    ${d.combination_engine.C_bone_combo.toFixed(2)}  vs  vancomycin mono ${d.combination_engine.vancomycin_mono_C_bone.toFixed(2)}  (${d.recommendation.fold_improvement}x better)`, ML + 6, y + 37);
    doc.text(`>> OUTCOME:   ${d.recommendation.clinical_assessment}`, ML + 6, y + 50);
    doc.text(`>> NOTE:      Rifampin MUST be combined — monotherapy risk ~80% rpoB resistance`, ML + 6, y + 63);
    y += 82;

    doc.setFont("courier", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text("C_bone  =  tau / K_bone", W / 2, y, { align: "center" }); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text("K_bone = K_admet + K_penetration + K_biofilm + K_reservoir", W / 2, y, { align: "center" }); y += 20;
    hline(y, 0.5, [203, 213, 225]); y += 10;
    doc.addPage(); y = 54;

    // ── S1: PEDIATRIC PK ──────────────────────────────────────────────────
    h1("Section 1  —  Layer K1: Pediatric Pharmacokinetics");
    body("Standard adult dosing assumptions fail in children. The Keske Method uses Schwartz GFR (height/creatinine), Mosteller BSA, and allometric scaling (CL ∝ Wt^0.75, Vd ∝ Wt^1.0) to compute patient-specific pharmacokinetic parameters. At elevated CRP, Vd inflates due to capillary leak.");
    y += 6;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Parameter", "Formula", "Value"]],
      body: [
        ["eGFR (Schwartz)", `0.413 × ${d.patient.height_cm} / ${d.patient.creatinine}`, `${d.k1_pediatric_pk.eGFR_schwartz} mL/min`],
        ["BSA (Mosteller)", `sqrt(${d.patient.height_cm} × ${d.patient.weight_kg} / 3600)`, `${d.k1_pediatric_pk.bsa_mosteller_m2} m²`],
        ["CL allometric", `CL_adult × (${d.patient.weight_kg}/70)^0.75`, `${(Math.pow(d.patient.weight_kg / 70, 0.75)).toFixed(3)}× adult`],
        ["Vd allometric", `Vd_adult × (${d.patient.weight_kg}/70)^1.0`, `${(d.patient.weight_kg / 70).toFixed(3)}× adult`],
        ["Vd inflation (CRP)", `min(1 + 0.002 × max(${d.patient.crp_mgl}−100, 0), 1.4)`, `${d.k1_pediatric_pk.vd_inflation_multiplier}×`],
        ["Biofilm probability", `chronicity(${d.patient.infection_days}d)`, `${d.k1_pediatric_pk.biofilm_probability_pct}%`],
        ["P(SCV)", `1 − e^(−0.1 × ${d.patient.infection_days}) [modeling assumption]`, `${d.k1_pediatric_pk.p_scv_pct}%`],
      ],
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 12;
    doc.addPage(); y = 54;

    // ── S2: BONE PENETRATION ──────────────────────────────────────────────
    h1("Section 2  —  Layer K2: Bone Penetration Barrier");
    body(`K_penetration = (1/R_bone) − 1, where R_bone is the bone:serum concentration ratio. CRP modifier: R_bone_eff = R_bone × (1 + 0.006 × max(CRP−100, 0)), capped at 2×. At CRP ${d.patient.crp_mgl} mg/L, the inflation modifier is ${(1 + 0.006 * Math.max(d.patient.crp_mgl - 100, 0)).toFixed(3)}.`);
    y += 6;
    const penRows = Object.entries(DRUGS).map(([, dr]) => {
      const reff = r_bone_eff(dr.r_bone, pt.crp);
      const kp = k_penetration(dr.r_bone, pt.crp);
      return [dr.label, dr.r_bone.toFixed(3), reff.toFixed(3), kp.toFixed(3), dr.refs.split("·")[0].trim()];
    });
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "R_bone", "R_eff (CRP)", "K_pen", "Source"]],
      body: penRows,
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 6;
    note("Vancomycin K_pen = " + d.k2_bone_penetration.vancomycin.k_pen.toFixed(3) + " — 80% of dose never reaches bone. Ceftaroline K_pen = " + d.k2_bone_penetration.drug_a.k_pen.toFixed(3) + ".");
    doc.addPage(); y = 54;

    // ── S3: BIOFILM ───────────────────────────────────────────────────────
    h1("Section 3  —  Layer K3: Biofilm Resistance");
    body(`K_biofilm = log10(MBEC/MIC), weighted by chronicity probability. After ${d.patient.infection_days} days, biofilm probability = ${d.k1_pediatric_pk.biofilm_probability_pct}% (chronic threshold >90d). K_bio_eff = p_bio × K_bio.`);
    y += 6;
    const bioRows = Object.entries(DRUGS).map(([, dr]) => {
      const kb = k_biofilm(dr.mbec, dr.mic);
      const kbe = k_biofilm_eff(dr.mbec, dr.mic, pt.infection_days);
      return [dr.label, dr.mic.toString(), dr.mbec.toString(), kb.toFixed(3), kbe.toFixed(3), dr.is_rifampin ? "COMBO ONLY" : "—"];
    });
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "MIC", "MBEC", "K_bio", "K_bio_eff", "Note"]],
      body: bioRows,
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 7.5 },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 10;
    body("Rifampin has the lowest K_bio (MBEC ≈ MIC for sessile bacteria) making it uniquely effective against established biofilm — but resistance emerges in ~80% of monotherapy cases via rpoB mutation. Combination with a cell-wall active agent is mandatory.");
    doc.addPage(); y = 54;

    // ── S4: RESERVOIR ─────────────────────────────────────────────────────
    h1("Section 4  —  Layer K4: Multi-Reservoir Persistence");
    body("Three anatomical sanctuaries protect residual organisms after adequate serum drug levels are achieved. Together they define a patient-specific K_reservoir that adds to total K_bone.");
    y += 6;
    [
      [`K_res_SAC  = (1 − ${d.patient.p_drainage}) × 0.5`, `= ${d.k4_reservoir.k_res_sac.toFixed(4)}`, "Drug-independent. Cleared by surgical drainage."],
      [`K_res_mat  = (1 − ${d.patient.p_debridement}) × K_pen_A`, `= ${d.k4_reservoir.k_res_mat_drug_a.toFixed(4)}`, "Drug-dependent. Residual biofilm matrix after debridement."],
      [`K_res_intra = 0.8 × ${d.patient.intracellular_fraction} × ${d.k4_reservoir.rifampin_in_combo ? "0.4 (rif.)" : "1.0"}`, `= ${d.k4_reservoir.rifampin_in_combo ? d.k4_reservoir.k_res_intra_with_rif.toFixed(4) : d.k4_reservoir.k_res_intra_no_rif.toFixed(4)}`, "Intracellular bacteria in osteoblasts/macrophages."],
    ].forEach(([formula, value, desc]) => {
      mono(`${formula.padEnd(42)} ${value}`); y += 2;
      note(desc);
    });
    y += 6;
    if (d.k4_reservoir.rifampin_in_combo) {
      body(`Rifampin intracellular modifier = 0.4: K_res_intra reduced from ${d.k4_reservoir.k_res_intra_no_rif.toFixed(4)} → ${d.k4_reservoir.k_res_intra_with_rif.toFixed(4)} (−${((1 - d.k4_reservoir.k_res_intra_with_rif / Math.max(d.k4_reservoir.k_res_intra_no_rif, 0.001)) * 100).toFixed(0)}%). Rifampin is the only approved agent with clinically validated osteoblast penetration.`);
    }
    doc.addPage(); y = 54;

    // ── S5: COMBINATION ───────────────────────────────────────────────────
    h1("Section 5  —  Combination Engine: Parallel Resistor Model");
    body("Barriers are IN SERIES for each drug (K_pathway = K_admet + K_pen + K_bio + K_res). Drugs are IN PARALLEL with each other — each is an independent pathway from blood to the bacterium. A drug cannot donate its biofilm stats to the combination unless it first crosses the bone penetration barrier.");
    y += 6;
    h2("In-series pathway impedances");
    const ce = d.combination_engine;
    [
      `K_pathway_${ce.drug_a.name.split(" ")[0].toLowerCase()} = ${DRUGS[drugA].k_admet.toFixed(3)} + ${k_pen_a.toFixed(3)} + ${k_bio_a.toFixed(3)} + ${k_res_a.toFixed(3)} = ${ce.drug_a.k_pathway.toFixed(4)}`,
      `K_pathway_${ce.drug_b.name.split(" ")[0].toLowerCase()} = ${DRUGS[drugB].k_admet.toFixed(3)} + ${k_pen_b.toFixed(3)} + ${k_bio_b.toFixed(3)} + ${k_res_b.toFixed(3)} = ${ce.drug_b.k_pathway.toFixed(4)}`,
      "",
      `1/K_combo = (1/${ce.drug_a.k_pathway.toFixed(4)} + 1/${ce.drug_b.k_pathway.toFixed(4)}) × ${ce.synergy_factor}`,
      `          = ${((1 / Math.max(ce.drug_a.k_pathway, 0.001) + 1 / Math.max(ce.drug_b.k_pathway, 0.001)) * ce.synergy_factor).toFixed(4)}`,
      `K_bone_combo  = ${ce.K_bone_combo.toFixed(4)}`,
      `tau_combo     = (${ce.drug_a.tau_h} + ${ce.drug_b.tau_h}) × ${ce.synergy_factor} = ${ce.tau_combo_h.toFixed(2)} h`,
      `C_bone_combo  = ${ce.tau_combo_h.toFixed(2)} / ${ce.K_bone_combo.toFixed(4)} = ${ce.C_bone_combo.toFixed(4)}`,
    ].forEach(l => { mono(l); y += 1; });
    y += 10;
    h2("Table  —  Coherence comparison");
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Regimen", "tau (h)", "K_bone", "C_bone", "Assessment"]],
      body: [
        ["Vancomycin (mono)", "12", ce.vancomycin_mono_C_bone > 0 ? (DRUGS.vancomycin.tau / ce.vancomycin_mono_C_bone * ce.vancomycin_mono_C_bone).toFixed(0) : "—", ce.vancomycin_mono_C_bone.toFixed(2), "INSUFFICIENT — cannot clear chronic AHO"],
        [ce.drug_a.name + " (mono)", ce.drug_a.tau_h.toString(), ce.drug_a.k_pathway.toFixed(3), ce.drug_a.c_mono.toFixed(2), ce.drug_a.c_mono > 5 ? "POTENTIALLY EFFECTIVE" : "INSUFFICIENT"],
        [`${ce.drug_a.name} + ${ce.drug_b.name}`, ce.tau_combo_h.toFixed(1), ce.K_bone_combo.toFixed(3), ce.C_bone_combo.toFixed(2), `RECOMMENDED — ${ce.fold_improvement_vs_vanc}× vs vanc`],
      ],
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8 },
      styles: { fontSize: 7.5, font: "courier", cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 12;
    doc.addPage(); y = 54;

    // ── S6: ACTIONS ───────────────────────────────────────────────────────
    h1("Section 6  —  Clinical Actions");
    d.recommendation.actions.forEach((action, i) => {
      mono(`${i + 1}. ${action}`); y += 3;
    });
    y += 10;
    h2("Data sources");
    d.data_sources.forEach(src => { note(`• ${src}`); });
    y += 10;
    hline(y, 0.5, [203, 213, 225]); y += 10;
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text("MIRADOR  |  Davis Geometric  |  Branch XI Therapeutic Geometry", W / 2, y, { align: "center" }); y += 12;
    doc.text("The equation does not change. The bone changes. The medicine follows.", W / 2, y, { align: "center" });

    addHF();
    doc.save("KESKE_Report.pdf");
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: FONT, overflowY: "auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.3; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* HEADER */}
      <div style={{
        padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid #1a1a2e", background: "linear-gradient(180deg,#0c0c18,#08080f)",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => { window.location.hash = ''; }}
            style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}
          >← HOME</button>
          <button
            onClick={() => { window.location.hash = 'demo'; }}
            style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}
          >MIRADOR CORE</button>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 3, color: "#e2e8f0" }}>KESKE METHOD</div>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>PEDIATRIC AHO · MRSA BONE</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 10, color: "#475569" }}>STAGE {stage + 1} / 5</div>
          {stage > 0 && (
            <button onClick={() => setStage(0)} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>RESTART</button>
          )}
        </div>
      </div>

      {/* DEDICATION */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 0" }}>
        <div style={{ padding: "16px 20px", background: "#09090f", borderRadius: 8, borderLeft: "3px solid #f97316", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#f97316", letterSpacing: 3, marginBottom: 8, fontFamily: FONT }}>DEDICATION</div>
          <div style={{ fontSize: 15, color: "#e2e8f0", fontWeight: 500, marginBottom: 6 }}>For Steven Keske</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.8 }}>
            Six years. Five antibiotics. Four surgeries. One child with recurrent MRSA osteomyelitis who is still fighting today — and who should have
            gotten better the first time. The drugs existed. The math did not.
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 10, fontStyle: "italic" }}>
            This method was built for Steven — still here, still fighting — and every child who comes after him.
          </div>
        </div>
      </div>

      {/* TITLE CARD */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 16px 4px" }}>
        <div style={{ padding: "12px 16px", background: "#0c0c1a", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
            Standard MRSA blood drugs don't work in bone. The <span style={{ color: "#e2e8f0" }}>Keske Method</span> extends C = τ/K with four
            bone-specific curvature layers: penetration barrier, biofilm resistance, multi-reservoir persistence,
            and a parallel-resistor combination engine. Walk through the pipeline below — every value recomputes
            from the patient inputs.
          </div>
        </div>
      </div>

      {/* BODY: two-column on wide screens, single column on mobile */}
      <div style={{ display: "flex", flexDirection: mob ? "column" : "row", alignItems: "flex-start", maxWidth: 1200, margin: "0 auto", padding: mob ? "0 12px 32px" : "0 16px 32px", gap: 16 }}>

        {/* LEFT: stages */}
        <div style={{ flex: mob ? "1 1 100%" : (vizExpanded !== null ? "1 1 340px" : "1 1 520px"), minWidth: 0, width: "100%", transition: "flex 0.35s ease" }}>

          {/* ══ STAGE 0: THE CHILD ══════════════════════════════════════ */}
          <StageCard
            stage={0} current={stage}
            title="THE CHILD" subtitle="Pediatric PK — why weight and height change everything"
            accent="#3b82f6"
            onAdvance={() => setStage(1)} advanceLabel="SHOW ME THE BONE →"
            onJumpTo={() => setStage(0)}
          >
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              PATIENT PROFILE <span style={{ color: "#3b82f6", fontSize: 9, letterSpacing: 0 }}>editable</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 16, rowGap: 8, alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: "#64748b", fontSize: 10 }}>Age</span>
              <FieldCtrl value={pt.age_years} onChange={v => updatePt("age_years", v)} unit="yr" />
              <span style={{ color: "#64748b", fontSize: 10 }}>Height</span>
              <FieldCtrl value={pt.height_cm} onChange={v => updatePt("height_cm", v)} unit="cm" />
              <span style={{ color: "#64748b", fontSize: 10 }}>Weight</span>
              <FieldCtrl value={pt.weight_kg} onChange={v => updatePt("weight_kg", v)} unit="kg" />
              <span style={{ color: "#64748b", fontSize: 10 }}>Creatinine</span>
              <FieldCtrl value={pt.creatinine} onChange={v => updatePt("creatinine", v)} unit="mg/dL" step={0.05} color={pt.creatinine > 1.2 ? "#ef4444" : undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>CRP</span>
              <FieldCtrl value={pt.crp} onChange={v => updatePt("crp", v)} unit="mg/L" color={pt.crp > 100 ? "#f59e0b" : undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>Albumin</span>
              <FieldCtrl value={pt.albumin} onChange={v => updatePt("albumin", v)} unit="g/dL" step={0.1} color={pt.albumin < 3.5 ? "#f59e0b" : undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>Infection duration</span>
              <FieldCtrl value={pt.infection_days} onChange={v => updatePt("infection_days", v)} unit="days" color={pt.infection_days > 90 ? "#ef4444" : undefined} />
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              SURGICAL HISTORY
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 16, rowGap: 8, alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: "#64748b", fontSize: 10 }}>P(drainage)</span>
              <FieldCtrl value={pt.p_drainage} onChange={v => updatePt("p_drainage", v)} unit="0–1" step={0.05} />
              <span style={{ color: "#64748b", fontSize: 10 }}>P(debridement)</span>
              <FieldCtrl value={pt.p_debride} onChange={v => updatePt("p_debride", v)} unit="0–1" step={0.05} />
              <span style={{ color: "#64748b", fontSize: 10 }}>Intracellular frac.</span>
              <FieldCtrl value={pt.intracellular_frac} onChange={v => updatePt("intracellular_frac", v)} unit="0–1" step={0.05} color={pt.intracellular_frac > 0.3 ? "#f59e0b" : undefined} />
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>COMPUTED</div>
            <DataRow label="eGFR (Schwartz)" value={`${eGFR.toFixed(1)} mL/min`} color={eGFR < 30 ? "#ef4444" : eGFR < 60 ? "#f59e0b" : "#22c55e"} />
            <DataRow label="BSA (Mosteller)" value={`${bsa.toFixed(3)} m²`} />
            <DataRow label="Vd inflation (CRP)" value={`×${vd_mult.toFixed(3)}`} color={vd_mult > 1.2 ? "#f59e0b" : undefined} />
            <DataRow label="Biofilm prob. (chronicity)" value={`${(bio_prob * 100).toFixed(0)}%`} color={bio_prob > 0.5 ? "#ef4444" : "#f59e0b"} />
            <DataRow label="P(SCV) (modeling assumption)" value={`${(scv_prob * 100).toFixed(1)}%`} color={scv_prob > 0.5 ? "#f97316" : undefined} />

            {pt.infection_days >= 2190 && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 4, fontSize: 10, color: "#ef4444" }}>
                ⚠ {Math.round(pt.infection_days / 365)} yr infection — chronic biofilm (95%), high SCV risk ({(scv_prob * 100).toFixed(0)}%).
                Standard monotherapy cannot work. <Src text="Tuchscherr 2011" />
              </div>
            )}
          </StageCard>

          {/* ══ STAGE 1: THE BONE ════════════════════════════════════════ */}
          <StageCard
            stage={1} current={stage}
            title="THE BONE" subtitle="K2: Bone penetration barrier — why blood levels lie"
            accent="#f97316"
            onAdvance={() => setStage(2)} advanceLabel="SHOW ME THE BIOFILM →"
            onJumpTo={() => setStage(1)}
          >
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Blood levels look therapeutic — but bone concentrations are a fraction of serum.
              The penetration barrier adds curvature <span style={{ color: "#f97316", fontWeight: 700 }}>K_pen = (1/R_bone) − 1</span> where R_bone is the
              bone:serum concentration ratio. At CRP {pt.crp} mg/L, inflammation modifies R_bone.
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>DRUG PENETRATION TABLE</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                      {["Drug", "R_bone", "R_eff (CRP)", "K_pen", "Source"].map(h => (
                        <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(DRUGS).map(([key, d]) => {
                      const r_eff = r_bone_eff(d.r_bone, pt.crp);
                      const k_pen = k_penetration(d.r_bone, pt.crp);
                      const isSelected = key === drugA || key === drugB;
                      return (
                        <tr key={key} style={{ borderBottom: "1px solid #0f1623", background: isSelected ? "#12121f" : "transparent" }}>
                          <td style={{ padding: "4px 6px", color: d.color, fontWeight: isSelected ? 700 : 400 }}>{d.label}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{d.r_bone.toFixed(3)}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{r_eff.toFixed(3)}</td>
                          <td style={{ padding: "4px 6px", color: k_pen > 5 ? "#ef4444" : k_pen > 2 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>{k_pen.toFixed(3)}</td>
                          <td style={{ padding: "4px 6px", color: "#334155", fontSize: 8 }}>{d.refs.split("·")[0]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: "#334155" }}>
                CRP modifier: R_bone_eff = R_bone × (1 + 0.006 × max(CRP−100, 0)), capped at 2× baseline. <Src text="Spec §K2" />
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #ef444433", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 6 }}>VANCOMYCIN</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{k_pen_vanc.toFixed(2)}</div>
                <div style={{ fontSize: 9, color: "#64748b" }}>K_pen</div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>R = 0.20 → only 20% reaches bone</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", fontSize: 20, color: "#475569" }}>vs</div>
              <div style={{ flex: "1 1 160px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #22c55e33", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>CEFTAROLINE</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{k_pen_a.toFixed(2)}</div>
                <div style={{ fontSize: 9, color: "#64748b" }}>K_pen</div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>R = 0.30 → 30% reaches bone</div>
              </div>
            </div>
          </StageCard>

          {/* ══ STAGE 2: THE BIOFILM ═════════════════════════════════════ */}
          <StageCard
            stage={2} current={stage}
            title="THE BIOFILM" subtitle="K3: Biofilm resistance — embedded bacteria are 100–1000× harder to kill"
            accent="#a78bfa"
            onAdvance={() => setStage(3)} advanceLabel="SHOW ME THE RESERVOIRS →"
            onJumpTo={() => setStage(2)}
          >
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              In chronic AHO, bacteria embed in biofilm matrix that blocks antibiotics.
              K_biofilm = log₁₀(MBEC/MIC) measures how much higher the biofilm-effective
              concentration must be. Weighted by <span style={{ color: "#a78bfa", fontWeight: 700 }}>chronicity ({(bio_prob * 100).toFixed(0)}% after {pt.infection_days} days)</span>.
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>BIOFILM CURVATURE TABLE</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                      {["Drug", "MIC", "MBEC", "K_bio", "K_bio_eff", "Note"].map(h => (
                        <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(DRUGS).map(([key, d]) => {
                      const kb = k_biofilm(d.mbec, d.mic);
                      const kbe = k_biofilm_eff(d.mbec, d.mic, pt.infection_days);
                      const isSelected = key === drugA || key === drugB;
                      return (
                        <tr key={key} style={{ borderBottom: "1px solid #0f1623", background: isSelected ? "#12121f" : "transparent" }}>
                          <td style={{ padding: "4px 6px", color: d.color, fontWeight: isSelected ? 700 : 400 }}>{d.label}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{d.mic}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{d.mbec}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{kb.toFixed(3)}</td>
                          <td style={{ padding: "4px 6px", color: kbe > 2 ? "#ef4444" : kbe > 1 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>{kbe.toFixed(3)}</td>
                          <td style={{ padding: "4px 6px", color: "#334155", fontSize: 8 }}>{d.is_rifampin ? "COMBO ONLY" : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 6, fontSize: 9, color: "#334155" }}>
                K_bio_eff = {(bio_prob * 100).toFixed(0)}% (chronicity) × K_bio. K_bio = log₁₀(MBEC/MIC). <Src text="Spec §K3" />
              </div>
            </div>

            <div style={{ padding: "10px 12px", background: "#a78bfa11", border: "1px solid #a78bfa33", borderRadius: 6, marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 6 }}>SCV EMERGENCE (MODELING ASSUMPTION)</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                Small colony variants are slow-growing, antibiotic-tolerant persisters. After {pt.infection_days} days:
                P(SCV) = 1 − e^(−0.1×days) = <span style={{ color: "#f97316", fontWeight: 600 }}>{(scv_prob * 100).toFixed(1)}%</span>.
                Rate k = 0.1/day is a modeling assumption pending clinical calibration. <Src text="Tuchscherr 2011" />
              </div>
            </div>

            {DRUGS[drugA].is_rifampin && DRUGS[drugB].is_rifampin && (
              <div style={{ padding: "8px 12px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 4, fontSize: 10, color: "#ef4444" }}>
                ⛔ RIFAMPIN MONOTHERAPY IS CONTRAINDICATED — rpoB mutations emerge in ~80% of cases. <Src text="Spec §K3" />
              </div>
            )}
          </StageCard>

          {/* ══ STAGE 3: THE RESERVOIRS ════════════════════════════════ */}
          <StageCard
            stage={3} current={stage}
            title="THE RESERVOIRS" subtitle="K4: Three persistent sanctuaries where bacteria hide"
            accent="#06b6d4"
            onAdvance={() => setStage(4)} advanceLabel="COMPUTE THE COMBINATION →"
            onJumpTo={() => setStage(3)}
          >
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Even after adequate serum levels, bacteria persist in three anatomical sanctuaries.
              Each adds curvature. Rifampin is the only approved agent with unique access to
              Reservoir 3 (intracellular compartment).
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>RESERVOIR BREAKDOWN (COMPUTED FROM SURGICAL HISTORY)</div>

              {[
                {
                  label: "R1: Sequestered avascular bone",
                  formula: `K_res_SAC = (1 − ${pt.p_drainage.toFixed(2)}) × 0.5`,
                  value: k_res_sac(pt.p_drainage),
                  color: "#06b6d4",
                  note: "Drug-independent. Cleared by surgical drainage.",
                },
                {
                  label: "R2: Biofilm matrix (drug-dependent)",
                  formula: `K_res_mat = (1 − ${pt.p_debride.toFixed(2)}) × K_pen`,
                  value: k_res_mat(pt.p_debride, k_pen_a),
                  color: "#06b6d4",
                  note: "K_pen for ceftaroline shown. Drug-dependent — different for each drug.",
                },
                {
                  label: "R3: Intracellular (osteoblasts/phagocytes)",
                  formula: `K_res_intra = 0.8 × ${pt.intracellular_frac.toFixed(2)} × ${rifampin_in_combo ? "0.4 (rif.)" : "1.0"}`,
                  value: k_res_intra(pt.intracellular_frac, rifampin_in_combo),
                  color: rifampin_in_combo ? "#22c55e" : "#f59e0b",
                  note: rifampin_in_combo
                    ? "Rifampin in combo: intracellular modifier = 0.4 (−60% curvature)"
                    : "No rifampin: modifier = 1.0 (full intracellular burden)",
                },
              ].map((r, i) => (
                <div key={i} style={{ marginBottom: 10, padding: "10px 12px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #1a1a2e" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: r.color, fontWeight: 600 }}>{r.label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.value.toFixed(3)}</span>
                  </div>
                  <div style={{ fontSize: 9, color: "#475569", fontFamily: "monospace", marginBottom: 4 }}>{r.formula}</div>
                  <div style={{ fontSize: 9, color: "#334155" }}>{r.note}</div>
                </div>
              ))}
            </div>

            <div style={{ padding: "10px 12px", background: "#0d0d1c", borderRadius: 6, border: `1px solid ${rifampin_in_combo ? "#22c55e33" : "#1a1a2e"}`, marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: "#64748b", letterSpacing: 2, marginBottom: 6 }}>K_reservoir TOTAL (without rifampin)</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 12px", fontSize: 10 }}>
                <span style={{ color: "#64748b" }}>R1 (avascular)</span><span style={{ color: "#94a3b8" }}>{k_res_sac(pt.p_drainage).toFixed(3)}</span>
                <span style={{ color: "#64748b" }}>R2 (matrix, cef)</span><span style={{ color: "#94a3b8" }}>{k_res_mat(pt.p_debride, k_pen_a).toFixed(3)}</span>
                <span style={{ color: "#64748b" }}>R3 (intracell.)</span><span style={{ color: "#94a3b8" }}>{k_res_intra(pt.intracellular_frac, false).toFixed(3)}</span>
                <span style={{ color: "#e2e8f0", fontWeight: 700 }}>K_reservoir</span>
                <span style={{ color: rifampin_in_combo ? "#22c55e" : "#f59e0b", fontWeight: 700 }}>
                  {k_reservoir(pt.p_drainage, pt.p_debride, k_pen_a, pt.intracellular_frac, false).toFixed(3)}
                  {rifampin_in_combo && ` → ${k_res_a.toFixed(3)} (rif.)`}
                </span>
              </div>
            </div>
          </StageCard>

          {/* ══ STAGE 4: THE COMBINATION ════════════════════════════════ */}
          <StageCard
            stage={4} current={stage}
            title="THE COMBINATION" subtitle="Parallel-resistor physics — each drug carries its own barriers"
            accent="#22c55e"
            onJumpTo={() => setStage(4)}
          >
            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Drug A and Drug B fight the same infection via <span style={{ color: "#22c55e", fontWeight: 700 }}>independent parallel pathways</span>.
              Barriers are <em>in series</em> for each drug — Drug B cannot donate its biofilm stats unless it crosses the bone
              first. Conductances add: <span style={{ color: "#22c55e" }}>1/K_combo = (1/K_A + 1/K_B) × synergy</span>.
            </div>

            {/* Drug selectors */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>SELECT COMBINATION</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>DRUG A</div>
                  <select
                    value={drugA}
                    onChange={e => setDrugA(e.target.value)}
                    style={{ width: "100%", background: "#0e0e1c", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: 4, padding: "5px 8px", fontFamily: FONT, fontSize: 10 }}
                  >
                    {Object.entries(DRUGS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                  </select>
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>{DRUGS[drugA].note}</div>
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>DRUG B</div>
                  <select
                    value={drugB}
                    onChange={e => setDrugB(e.target.value)}
                    style={{ width: "100%", background: "#0e0e1c", color: "#e2e8f0", border: "1px solid #1e293b", borderRadius: 4, padding: "5px 8px", fontFamily: FONT, fontSize: 10 }}
                  >
                    {Object.entries(DRUGS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
                  </select>
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>{DRUGS[drugB].note}</div>
                </div>
                <div style={{ flex: "0 0 120px" }}>
                  <div style={{ fontSize: 9, color: "#64748b", marginBottom: 4 }}>SYNERGY FACTOR</div>
                  <FieldCtrl value={synergy} onChange={v => setSynergy(Math.max(1.0, parseFloat(v) || 1.0))} step={0.05} />
                  <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>1.0 = additive, 1.2 = synergistic</div>
                </div>
              </div>
            </div>

            {rifampin_mono_blocked && (
              <div style={{ padding: "8px 12px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 4, fontSize: 10, color: "#ef4444", marginBottom: 10 }}>
                ⛔ Cannot combine rifampin with itself. Default: ceftaroline + rifampin.
              </div>
            )}

            {/* K_pathway breakdown */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>IN-SERIES PATHWAY IMPEDANCE (each drug)</div>
              {[
                { key: drugA, kp: kpa, kpen: k_pen_a, kbio: k_bio_a, kres: k_res_a },
                { key: drugB, kp: kpb, kpen: k_pen_b, kbio: k_bio_b, kres: k_res_b },
              ].map(({ key, kp, kpen, kbio, kres }) => (
                <div key={key} style={{ marginBottom: 10, padding: "10px 12px", background: "#0d0d1c", borderRadius: 6, border: `1px solid ${DRUGS[key].color}33` }}>
                  <div style={{ fontSize: 10, color: DRUGS[key].color, fontWeight: 700, marginBottom: 6 }}>{DRUGS[key].label}</div>
                  <KBar label="K_admet" value={DRUGS[key].k_admet} max={2} color="#3b82f6" />
                  <KBar label="K_penetration" value={kpen} max={10} color="#f97316" />
                  <KBar label="K_biofilm_eff" value={kbio} max={4} color="#a78bfa" />
                  <KBar label="K_reservoir" value={kres} max={4} color="#06b6d4" />
                  <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, borderTop: "1px solid #1a1a2e", paddingTop: 4 }}>
                    <span style={{ color: "#64748b" }}>K_pathway (series sum)</span>
                    <span style={{ color: DRUGS[key].color, fontWeight: 700 }}>{kp.toFixed(3)}</span>
                  </div>
                  <div style={{ fontSize: 10, marginTop: 2, textAlign: "right", color: "#475569" }}>
                    τ = {DRUGS[key].tau}h → C_mono = <span style={{ color: DRUGS[key].color }}>{(DRUGS[key].tau / Math.max(kp, 0.001)).toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Parallel combination */}
            <div style={{ padding: "14px 16px", background: "#10b98108", border: "2px solid #22c55e44", borderRadius: 8, marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>PARALLEL RESISTOR COMBINATION</div>
              <div style={{ fontFamily: "monospace", fontSize: 10, color: "#94a3b8", lineHeight: 2, marginBottom: 10 }}>
                <div>1/K_combo = (1/{kpa.toFixed(3)} + 1/{kpb.toFixed(3)}) × {synergy.toFixed(2)}</div>
                <div style={{ color: "#64748b" }}>         = ({(1/Math.max(kpa,0.001)).toFixed(4)} + {(1/Math.max(kpb,0.001)).toFixed(4)}) × {synergy.toFixed(2)}</div>
                <div style={{ color: "#64748b" }}>         = {((1/Math.max(kpa,0.001) + 1/Math.max(kpb,0.001)) * synergy).toFixed(4)}</div>
                <div>K_bone_combo = <span style={{ color: "#22c55e", fontWeight: 700 }}>{combo.K_combo.toFixed(3)}</span></div>
                <div style={{ marginTop: 4 }}>τ_combo = ({DRUGS[drugA].tau} + {DRUGS[drugB].tau}) × {synergy.toFixed(2)} = <span style={{ color: "#22c55e", fontWeight: 700 }}>{combo.tau_combo.toFixed(1)}h</span></div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                  C_bone_combo = {combo.tau_combo.toFixed(1)} / {combo.K_combo.toFixed(3)} = <span style={{ color: "#22c55e", fontSize: 20 }}>{combo.C_combo.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 6 }}>
                <div style={{ textAlign: "center", padding: "10px 14px", background: "#ef444411", borderRadius: 6, border: "1px solid #ef444433" }}>
                  <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 4 }}>VANCOMYCIN MONO</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "#ef4444" }}>{c_vanc_mono.toFixed(2)}</div>
                  <div style={{ fontSize: 9, color: "#64748b" }}>C_bone</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", fontSize: 20, color: "#22c55e" }}>→</div>
                <div style={{ textAlign: "center", padding: "10px 14px", background: "#22c55e11", borderRadius: 6, border: "1px solid #22c55e44" }}>
                  <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 4 }}>{DRUGS[drugA].label.toUpperCase()} + {DRUGS[drugB].label.toUpperCase()}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: "#22c55e" }}>{combo.C_combo.toFixed(2)}</div>
                  <div style={{ fontSize: 9, color: "#64748b" }}>C_bone</div>
                </div>
              </div>
            </div>

            {/* Clinical outcome */}
            <div style={{ padding: "14px 16px", background: combo.C_combo > 5 ? "#10b98111" : "#ef444411", border: `1px solid ${combo.C_combo > 5 ? "#10b98133" : "#ef444433"}`, borderRadius: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: combo.C_combo > 5 ? "#10b981" : "#ef4444", letterSpacing: 2, marginBottom: 8 }}>
                {combo.C_combo > 10 ? "HIGHLY EFFECTIVE" : combo.C_combo > 5 ? "POTENTIALLY EFFECTIVE" : "LIKELY INSUFFICIENT"}
              </div>
              <DataRow label="C_bone combination" value={combo.C_combo.toFixed(2)} color={combo.C_combo > 5 ? "#22c55e" : "#ef4444"} />
              <DataRow label="C_bone vanc mono" value={c_vanc_mono.toFixed(2)} color="#ef4444" />
              <DataRow label="Fold improvement vs vanc" value={`${improvement_vs_vanc.toFixed(1)}×`} color="#22c55e" />
              <DataRow label="C_bone Drug A mono" value={c_a_mono.toFixed(2)} color={DRUGS[drugA].color} />
              {rifampin_in_combo && (
                <DataRow label="Rifampin R3 effect" value="K_res_intra ×0.4 (−60%)" color="#22c55e" />
              )}
              {pt.infection_days >= 2190 && combo.C_combo > 10 && (
                <div style={{ marginTop: 10, fontSize: 10, color: "#94a3b8", lineHeight: 1.7, borderTop: "1px solid #1a1a2e", paddingTop: 8 }}>
                  The Keske Method would have told Steven's doctors on day 1: vancomycin
                  monotherapy cannot work in bone (C_bone = {c_vanc_mono.toFixed(2)}).
                  Switch to {DRUGS[drugA].label} + {DRUGS[drugB].label} (C_bone = {combo.C_combo.toFixed(1)}) — <span style={{ color: "#22c55e", fontWeight: 700 }}>{improvement_vs_vanc.toFixed(1)}× the therapeutic coherence</span>.
                  The difference lives in the bone penetration barrier and rifampin's unique access to Reservoir 3.
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #1a1a2e", textAlign: "center" }}>
              <div style={{ fontSize: 9, color: "#334155", letterSpacing: 2 }}>DAVIS GEOMETRIC · KESKE METHOD · BRANCH XI</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 6, fontStyle: "italic" }}>The equation does not change. The bone changes. The medicine follows.</div>
              <div style={{ fontSize: 10, color: "#2a3a4a", marginTop: 4 }}>C = τ / K_bone</div>
              <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  onClick={handleDownloadPDF}
                  style={{
                    padding: "9px 20px", background: "#0f172a", color: "#e2e8f0",
                    border: "1px solid #334155", borderRadius: 5, cursor: "pointer",
                    fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2,
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                  onMouseOver={e => e.currentTarget.style.borderColor = "#64748b"}
                  onMouseOut={e => e.currentTarget.style.borderColor = "#334155"}
                >
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 1v8M3 7l3 3 3-3M1 12h10" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  DOWNLOAD REPORT PDF
                </button>
                <button
                  onClick={handleDownloadJSON}
                  style={{
                    padding: "9px 20px", background: "transparent", color: "#64748b",
                    border: "1px solid #1e293b", borderRadius: 5, cursor: "pointer",
                    fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2,
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                  onMouseOver={e => e.currentTarget.style.borderColor = "#334155"}
                  onMouseOut={e => e.currentTarget.style.borderColor = "#1e293b"}
                >
                  <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 1v8M3 7l3 3 3-3M1 12h10" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  DOWNLOAD JSON
                </button>
                <button
                  onClick={() => { window.location.hash = 'visuals'; }}
                  style={{
                    padding: "9px 20px", background: "#0a1628", color: "#3b82f6",
                    border: "1px solid #1e3a5f", borderRadius: 5, cursor: "pointer",
                    fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2,
                    display: "flex", alignItems: "center", gap: 7,
                  }}
                  onMouseOver={e => e.currentTarget.style.borderColor = "#3b82f6"}
                  onMouseOut={e => e.currentTarget.style.borderColor = "#1e3a5f"}
                >
                  DEEP VISUALIZATIONS →
                </button>
              </div>
            </div>
          </StageCard>

        </div>{/* end LEFT */}

        {/* RIGHT: live viz + explainer sidebar — expands in-place */}
        {(() => {
          const isExp = vizExpanded === stage;
          const sideProps = {
            stage, pt, allDrugs, drugA, drugB, eGFR, bsa, vd_mult, bio_prob,
            k_pen_a,
            k_res_sac_val: k_res_sac(pt.p_drainage),
            k_res_mat_val: k_res_mat(pt.p_debride, k_pen_a),
            k_res_intra_val: k_res_intra(pt.intracellular_frac, rifampin_in_combo),
            rifampin_in_combo, c_vanc_mono, c_a_mono, kpa, kpb,
            combo, improvement_vs_vanc, DRUGS, FONT,
          };
          return (
            <div style={{
              flex: mob ? "1 1 100%" : (isExp ? "0 0 540px" : "0 0 280px"),
              width: mob ? "100%" : undefined,
              position: mob ? "static" : "sticky", top: 54,
              maxHeight: mob ? "none" : "calc(100vh - 66px)", overflowY: mob ? "visible" : "auto",
              background: "#0a0a14", border: `1px solid ${isExp ? "#1e293b" : "#1a1a2e"}`,
              borderRadius: 8, padding: mob ? 14 : 16,
              transition: "flex 0.35s ease, border-color 0.2s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: "#334155", fontFamily: FONT, letterSpacing: 2 }}>
                  {isExp ? "EXPANDED" : "VIZ"}
                </div>
                <button
                  onClick={() => setVizExpanded(isExp ? null : stage)}
                  title={isExp ? "Collapse" : "Expand visualization"}
                  style={{ background: isExp ? "#1e293b22" : "none", border: `1px solid ${isExp ? "#334155" : "#1e293b"}`, color: isExp ? "#94a3b8" : "#475569", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: FONT, fontSize: 8, letterSpacing: 1 }}
                >{isExp ? "⤡ COLLAPSE" : "⤢ EXPAND"}</button>
              </div>
              <SidebarContent {...sideProps} expanded={isExp} />
            </div>
          );
        })()}
        {/* end RIGHT */}

      </div>{/* end BODY */}
    </div>
  );
}
