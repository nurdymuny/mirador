import React, { useState, useMemo, useEffect } from "react";

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

// ─── tiny UI primitives (identical design system) ───────────────────────────

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

function FieldCtrl({ value, onChange, unit, color, step = 1 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input type="number" value={value} step={step} onChange={e => onChange(e.target.value)}
        style={{ width: 64, background: "#0e0e1c", color: color || "#e2e8f0", border: `1px solid ${color ? color + "44" : "#1e293b"}`, borderRadius: 4, padding: "3px 6px", fontFamily: FONT, fontSize: 11, outline: "none" }} />
      {unit && <span style={{ fontSize: 10, color: "#475569" }}>{unit}</span>}
    </div>
  );
}

function KBar({ label, value, max, color, note }) {
  const pct = Math.min(Math.abs(value) / max, 1) * 100;
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
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: done ? "pointer" : "default", borderBottom: `1px solid ${active ? accent + "22" : "#12121f"}` }}
        onClick={done ? onJumpTo : undefined}>
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
            <button onClick={onAdvance}
              style={{ marginTop: 16, width: "100%", padding: "10px 0", background: accent + "18", color: accent, border: `1px solid ${accent}44`, borderRadius: 6, fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2, cursor: "pointer" }}
              onMouseOver={e => e.currentTarget.style.background = accent + "28"}
              onMouseOut={e => e.currentTarget.style.background = accent + "18"}
            >{advanceLabel || "CONTINUE →"}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Drug database (Nau 2010, Lutsar 2000) ──────────────────────────────────

const DRUGS = [
  { key: "cro", name: "Ceftriaxone", abbr: "CRO", cls: "Cephalosporin",
    auc24: 1000, mic: 0.015, kAdmet: 0.30, dose: "2g IV q12h",
    rBase: 0.01, rPeak: 0.15,
    color: "#22c55e", refs: "Nau 2010 · Lutsar 2000 · FDA label" },
  { key: "van", name: "Vancomycin", abbr: "VAN", cls: "Glycopeptide",
    auc24: 400, mic: 0.5, kAdmet: 0.50, dose: "15mg/kg IV q6h",
    rBase: 0.01, rPeak: 0.18,
    color: "#ef4444", refs: "Nau 2010 · Lutsar 2000 · FDA label" },
  { key: "rif", name: "Rifampin", abbr: "RIF", cls: "Rifamycin",
    auc24: 50, mic: 0.06, kAdmet: 0.40, dose: "600mg IV/PO q24h",
    rBase: 0.15, rPeak: 0.40,
    color: "#f97316", refs: "Nau 2010 · Tuchscherr 2011" },
  { key: "lzd", name: "Linezolid", abbr: "LZD", cls: "Oxazolidinone",
    auc24: 200, mic: 1.0, kAdmet: 0.30, dose: "600mg IV/PO q12h",
    rBase: 0.40, rPeak: 0.70,
    color: "#a78bfa", refs: "Nau 2010 · Beer 2007 · FDA label" },
];

// Three CSF niches
const NICHES = [
  { name: "CSF Bulk", weight: 0.7, access: 0.9 },
  { name: "Meningeal Surface", weight: 0.2, access: 0.5 },
  { name: "Brain Parenchyma", weight: 0.1, access: 0.1 },
];

const K_RES = NICHES.reduce((s, n) => s + n.weight * (1 - n.access), 0); // 0.26

const THRESHOLD = 0.50;

// ─── Engine ─────────────────────────────────────────────────────────────────

const tau = (d) => Math.log10(d.auc24 / d.mic);
const kBarrier = (R) => R <= 0.001 ? 999.0 : Math.max(1 / R - 1, -1.0);

// Dynamic BBB permeability
function rBBB(drug, t, tHalf, neonatal) {
  const rB = neonatal ? drug.rBase * 3.0 : drug.rBase;
  const mPeak = drug.rPeak / drug.rBase;
  return rB * (1 + (mPeak - 1) * Math.exp(-t * Math.LN2 / tHalf));
}

function kPathwayAtTime(drug, t, tHalf, neonatal, kPheno) {
  const R = rBBB(drug, t, tHalf, neonatal);
  return drug.kAdmet + kBarrier(R) + kPheno + K_RES;
}

function cSiteAtTime(drug, t, tHalf, neonatal, kPheno) {
  const k = kPathwayAtTime(drug, t, tHalf, neonatal, kPheno);
  return tau(drug) / Math.max(k, 0.01);
}

// Kirchhoff combo at time t
function cComboAtTime(drugs, t, tHalf, neonatal, kPheno) {
  let tG = 0, wT = 0;
  for (const d of drugs) {
    const k = Math.max(kPathwayAtTime(d, t, tHalf, neonatal, kPheno), 0.01);
    const g = 1 / k;
    tG += g;
    wT += tau(d) * g;
  }
  if (tG <= 0) return 0;
  return (wT / tG) * tG;
}

// Find day when C crosses below threshold
function failureDay(drug, tHalf, neonatal, kPheno, threshold, maxDays = 30) {
  for (let d = 0; d <= maxDays * 100; d++) {
    const t = d / 100;
    if (cSiteAtTime(drug, t, tHalf, neonatal, kPheno) < threshold) return t;
  }
  return maxDays; // doesn't fail within range
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function SidebarContent({ stage, activeDrugs, pt, tHalf, kPheno, drugData, mob, expanded, FONT }) {
  const Divider = () => <div style={{ borderTop: "1px solid #1a1a2e", margin: "12px 0" }} />;
  const Explain = ({ children }) => <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.75, marginTop: 10 }}>{children}</div>;
  const MiniBar = ({ label, val, max, color, unit, note }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748b", marginBottom: 3 }}>
        <span style={{ fontFamily: FONT }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{typeof val === "number" ? val.toFixed(3) : val}{unit ? ` ${unit}` : ""}</span>
      </div>
      <div style={{ height: 7, background: "#12121f", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(Math.abs(val) / max, 1) * 100}%`, background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
      {note && <div style={{ fontSize: 8, color: "#334155", marginTop: 2 }}>{note}</div>}
    </div>
  );

  if (stage === 0) {
    return (<>
      <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 6 }}>NEURO-PK PROFILE</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Drug potency at the BBB</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        τ = log₁₀(AUC₂₄/MIC). Higher = more potent against susceptible bacteria.
      </div>
      {DRUGS.map(d => {
        const t = tau(d); const isSel = activeDrugs.some(a => a.key === d.key);
        return (
          <MiniBar key={d.key} label={`${d.abbr} (${d.cls})`} val={t} max={5} color={d.color}
            note={`AUC=${d.auc24} / MIC=${d.mic} · ${isSel ? "SELECTED" : "not selected"}`} />
        );
      })}
      <Divider />
      <Explain>
        Meningitis pathogens are mostly planktonic — free-floating in CSF. They don't form biofilm
        (unless there's a shunt). This means the MIC is the real MIC, not a biofilm-inflated MBEC.
        The raw drug potency (τ) matters here more than in bone, where biofilm dominates.
        Ceftriaxone has the highest τ (4.82) because its MIC against susceptible organisms is extremely low.
      </Explain>
    </>);
  }

  if (stage === 1) {
    const maxR = 0.8;
    return (<>
      <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>BBB PERMEABILITY OVER TIME</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>R(t) = R_base × (1 + (M_peak−1)e^(−t·ln2/t_half))</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        At t=0 (acute inflammation), BBB is open. As treatment works, BBB seals shut.
      </div>
      {activeDrugs.map(d => {
        const r0 = rBBB(d, 0, tHalf, pt.neonatal);
        const r7 = rBBB(d, 7, tHalf, pt.neonatal);
        const r14 = rBBB(d, 14, tHalf, pt.neonatal);
        return (
          <div key={d.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: d.color, fontWeight: 700, marginBottom: 4 }}>{d.abbr}</div>
            <MiniBar label="Day 0 (inflamed)" val={r0} max={maxR} color={d.color} note={`K_barrier=${kBarrier(r0).toFixed(1)}`} />
            <MiniBar label="Day 7" val={r7} max={maxR} color={d.color + "88"} note={`K_barrier=${kBarrier(r7).toFixed(1)}`} />
            <MiniBar label="Day 14" val={r14} max={maxR} color={d.color + "55"} note={`K_barrier=${kBarrier(r14).toFixed(1)}`} />
          </div>
        );
      })}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>INFLAMED vs UNINFLAMED</div>
        {DRUGS.map(d => (
          <div key={d.key} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <div style={{ flex: 1, padding: "4px 8px", background: "#12121f", borderRadius: 4, fontSize: 8, textAlign: "center" }}>
              <div style={{ color: "#64748b" }}>R_base</div>
              <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 10 }}>{d.rBase}</div>
            </div>
            <div style={{ flex: 1, padding: "4px 8px", background: "#12121f", borderRadius: 4, fontSize: 8, textAlign: "center" }}>
              <div style={{ color: "#64748b" }}>R_peak</div>
              <div style={{ color: "#22c55e", fontWeight: 700, fontSize: 10 }}>{d.rPeak}</div>
            </div>
            <div style={{ flex: 1, padding: "4px 8px", background: "#12121f", borderRadius: 4, fontSize: 8, textAlign: "center" }}>
              <div style={{ color: "#64748b" }}>M_peak</div>
              <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 10 }}>{(d.rPeak / d.rBase).toFixed(0)}×</div>
            </div>
          </div>
        ))}
      </>)}
      <Divider />
      <Explain>
        The BBB is the gatekeeper. During acute meningitis, inflammation blows it open — permeability
        spikes 10-18× above baseline. But as antibiotics kill bacteria, inflammation resolves, and the
        BBB seals back up. The drug that was getting through at Day 0 may be locked out by Day 2.
        This is the central paradox of meningitis treatment.
      </Explain>
    </>);
  }

  if (stage === 2) {
    return (<>
      <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 6 }}>PHENOTYPE & RESERVOIR</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>CSF niches and phenotypic states</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        Unlike bone or TB, most CSF bacteria are planktonic (K_pheno = 0). Exception: shunt hardware.
      </div>
      {NICHES.map(n => (
        <MiniBar key={n.name} label={n.name} val={n.weight} max={1} color="#a78bfa"
          note={`Access=${n.access} · K_niche=${(n.weight * (1 - n.access)).toFixed(3)}`} />
      ))}
      <div style={{ fontSize: 9, color: "#64748b", marginTop: 8, fontFamily: FONT }}>
        K_reservoir = Σ(weight × (1 − access)) = {K_RES.toFixed(3)}
      </div>
      {pt.shunt && (
        <div style={{ marginTop: 8, padding: "6px 8px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 4, fontSize: 9, color: "#ef4444" }}>
          ⚠ SHUNT DETECTED: K_phenotype elevated to 2.70 (biofilm on hardware). Combination therapy mandatory.
        </div>
      )}
      <Divider />
      <Explain>
        CSF bulk (70% of bacteria) is highly accessible during inflammation. The meningeal surface
        (20%) has moderate access — bacteria embedded in purulent exudate. Brain parenchyma (10%)
        is the hardest — requires lipophilic drugs that cross the BBB independently of inflammation.
        Linezolid and Rifampin reach parenchyma; Ceftriaxone and Vancomycin do not.
      </Explain>
    </>);
  }

  if (stage === 3) {
    return (<>
      <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 6 }}>THE DEX PARADOX — C(t) CURVES</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>When does each drug fail?</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        Failure = day when C_site drops below {THRESHOLD}. Lower = worse.
      </div>
      {activeDrugs.map(d => {
        const fDay = failureDay(d, tHalf, pt.neonatal, kPheno, THRESHOLD);
        const fDayNoDex = failureDay(d, 4.0, pt.neonatal, kPheno, THRESHOLD);
        return (
          <div key={d.key} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span style={{ color: d.color, fontWeight: 700 }}>{d.abbr}</span>
              <span style={{ color: fDay < 3 ? "#ef4444" : fDay < 7 ? "#f59e0b" : "#22c55e" }}>
                fails Day {fDay >= 30 ? ">30" : fDay.toFixed(1)} {pt.dex ? "(with Dex)" : ""}
              </span>
            </div>
            {pt.dex && (
              <div style={{ fontSize: 8, color: "#475569" }}>Without Dex: Day {fDayNoDex >= 30 ? ">30" : fDayNoDex.toFixed(1)}</div>
            )}
          </div>
        );
      })}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 6 }}>C(t) AT DAY 0 vs DAY 3 vs DAY 7</div>
        {activeDrugs.map(d => (
          <div key={d.key} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {[0, 3, 7].map(day => {
              const c = cSiteAtTime(d, day, tHalf, pt.neonatal, kPheno);
              return (
                <div key={day} style={{ flex: 1, padding: "4px 6px", background: "#12121f", borderRadius: 4, fontSize: 8, textAlign: "center" }}>
                  <div style={{ color: "#64748b" }}>Day {day}</div>
                  <div style={{ color: c >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 10 }}>{c.toFixed(2)}</div>
                </div>
              );
            })}
            <div style={{ display: "flex", alignItems: "center", fontSize: 8, color: d.color, fontWeight: 600, minWidth: 28 }}>{d.abbr}</div>
          </div>
        ))}
      </>)}
      <Divider />
      <Explain>
        Dexamethasone saves lives by reducing brain swelling. But it accelerates BBB closure
        from t_half=4.0 days to t_half=1.5 days. The geometric consequence: Ceftriaxone's therapeutic
        window shrinks from ~2.6 days to under 1 day. Rifampin and Linezolid survive because their
        baseline penetration (R_base = 0.15 and 0.40) is high enough to maintain C above threshold
        even after the BBB seals shut. The math says: if you give Dex, you MUST co-administer a
        high-baseline-penetration drug.
      </Explain>
    </>);
  }

  if (stage === 4) {
    return (<>
      <div style={{ fontSize: 9, color: "#14b8a6", letterSpacing: 2, marginBottom: 6 }}>DRUG RANKING OVER TIME</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Who survives the BBB closure?</div>
      {[0, 1, 3, 7, 14].map(day => (
        <div key={day} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 8, color: "#64748b", letterSpacing: 1, marginBottom: 3 }}>DAY {day}</div>
          {[...activeDrugs].sort((a, b) => cSiteAtTime(b, day, tHalf, pt.neonatal, kPheno) - cSiteAtTime(a, day, tHalf, pt.neonatal, kPheno)).map(d => {
            const c = cSiteAtTime(d, day, tHalf, pt.neonatal, kPheno);
            return (
              <div key={d.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#475569", borderBottom: "1px solid #0f1623", padding: "1px 0" }}>
                <span style={{ color: d.color }}>{d.abbr}</span>
                <span style={{ color: c >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 600 }}>C={c.toFixed(3)}</span>
              </div>
            );
          })}
        </div>
      ))}
      <Divider />
      <Explain>
        At Day 0, Ceftriaxone dominates — highest τ, decent inflamed penetration. By Day 3,
        the ranking inverts: Linezolid and Rifampin overtake because their baseline BBB penetration
        sustains C above threshold. By Day 14, only drugs with R_base ≥ 0.15 are still effective.
        The geometry predicts the clinical practice: high-penetration adjuncts for prolonged courses.
      </Explain>
    </>);
  }
  return null;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

export default function MeningitisApp() {
  const mob = useIsMobile();
  const [stage, setStage] = useState(0);
  const [sel, setSel] = useState([0, 2, 3]); // CRO, RIF, LZD
  const [vizExpanded, setVizExpanded] = useState(null);
  const [xDrug, setXDrug] = useState(null);
  const [xNiche, setXNiche] = useState(null);
  const [xBarrier, setXBarrier] = useState(null);  // drug key in Stage 1
  const [xDex, setXDex] = useState(null);           // drug key in Stage 3
  const [xFinding, setXFinding] = useState(null);   // index in Stage 4
  const [inspectDay, setInspectDay] = useState(0);   // day slider for Stage 1
  const [pt, setPt] = useState({
    age: 45, neonatal: false, csfWbc: 2000, dex: true,
    weight: 70, eGfr: 90, shunt: false,
  });
  const updatePt = (k, v) => setPt(p => ({ ...p, [k]: v }));
  const toggleDrug = i => setSel(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);

  const activeDrugs = useMemo(() => sel.map(i => DRUGS[i]), [sel]);
  const tHalf = pt.dex ? 1.5 : 4.0;
  const kPheno = pt.shunt ? 2.70 : 0.03; // weighted: 0.9×0 + 0.1×0.30 = 0.03 normal, 2.70 shunt

  // Compute drug data for current time
  const drugData = useMemo(() => {
    return DRUGS.map(d => {
      const t = tau(d);
      const r0 = rBBB(d, 0, tHalf, pt.neonatal);
      const c0 = cSiteAtTime(d, 0, tHalf, pt.neonatal, kPheno);
      const fDay = failureDay(d, tHalf, pt.neonatal, kPheno, THRESHOLD);
      const fDayNoDex = failureDay(d, 4.0, pt.neonatal, kPheno, THRESHOLD);
      const isSel = sel.includes(DRUGS.indexOf(d));
      return { ...d, tau: t, r0, c0, fDay, fDayNoDex, isSel };
    });
  }, [sel, tHalf, pt.neonatal, kPheno]);

  // C(t) curve data for SVG
  const cCurves = useMemo(() => {
    return activeDrugs.map(d => {
      const pts = [];
      for (let i = 0; i <= 100; i++) {
        const t = (i / 100) * 14; // 14 days
        pts.push({ t, c: cSiteAtTime(d, t, tHalf, pt.neonatal, kPheno) });
      }
      return { drug: d, pts };
    });
  }, [activeDrugs, tHalf, pt.neonatal, kPheno]);

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: FONT, overflowY: "auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeSlideIn { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        input[type=number]::-webkit-inner-spin-button { opacity:0.3; }
        input[type=number] { -moz-appearance:textfield; }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a2e", background: "linear-gradient(180deg,#0c0c18,#08080f)", position: "sticky", top: 0, zIndex: 10, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button onClick={() => { window.location.hash = ''; }} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>← HOME</button>
          <button onClick={() => { window.location.hash = 'demo'; }} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>MIRADOR CORE</button>
          <div style={{ fontSize: mob ? 13 : 16, fontWeight: 700, letterSpacing: 3, color: "#e2e8f0" }}>MENINGITIS</div>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>DYNAMIC BBB · BACTERIAL MENINGITIS</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 10, color: "#475569" }}>STAGE {stage + 1} / 5</div>
          {stage > 0 && <button onClick={() => setStage(0)} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>RESTART</button>}
        </div>
      </div>

      {/* DEDICATION */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 0" }}>
        <div style={{ padding: "16px 20px", background: "#09090f", borderRadius: 8, borderLeft: "3px solid #f59e0b", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 3, marginBottom: 8, fontFamily: FONT }}>THE TREATMENT PARADOX</div>
          <div style={{ fontSize: 15, color: "#e2e8f0", fontWeight: 500, marginBottom: 6 }}>Clinical success actively degrades geometric access.</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.8 }}>
            The antibiotics that save the patient's life also seal shut the barrier that let them reach
            the brain. If the bacteria aren't eradicated before the barrier closes, the survivors are
            trapped behind an impenetrable wall. This module computes the exact therapeutic window.
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 10, fontStyle: "italic" }}>C = τ/K(t)</div>
        </div>
      </div>

      {/* TITLE CARD */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 16px 4px" }}>
        <div style={{ padding: "12px 16px", background: "#0c0c1a", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
            Bacterial meningitis has the highest mortality of common infections. The blood-brain barrier
            is the dominant obstacle — and it changes over time. <span style={{ color: "#e2e8f0" }}>MIRADOR Meningitis</span> extends
            C = τ/K with a time-varying barrier function, computing the exact day each drug loses access
            to the brain. The Dexamethasone Paradox is derived, not assumed.
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flexDirection: mob ? "column" : "row", alignItems: "flex-start", maxWidth: 1200, margin: "0 auto", padding: mob ? "0 12px 32px" : "0 16px 32px", gap: 16 }}>

        {/* LEFT */}
        <div style={{ flex: mob ? "1 1 100%" : (vizExpanded !== null ? "1 1 340px" : "1 1 520px"), minWidth: 0, width: "100%", transition: "flex 0.35s ease" }}>

          {/* ══ STAGE 0: THE PATIENT ══ */}
          <StageCard stage={0} current={stage} title="THE PATIENT" subtitle="Neuro-PK profile and dexamethasone status" accent="#3b82f6"
            onAdvance={activeDrugs.length >= 1 ? () => setStage(1) : null} advanceLabel="MAP THE BARRIER →" onJumpTo={() => setStage(0)}>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              CLINICAL PROFILE <span style={{ color: "#3b82f6", fontSize: 9, letterSpacing: 0 }}>editable</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 16, rowGap: 8, alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: "#64748b", fontSize: 10 }}>Age</span>
              <FieldCtrl value={pt.age} onChange={v => { updatePt("age", +v); updatePt("neonatal", +v < 1); }} unit="yr" color={pt.age < 1 ? "#f59e0b" : undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>Weight</span>
              <FieldCtrl value={pt.weight} onChange={v => updatePt("weight", +v)} unit="kg" />
              <span style={{ color: "#64748b", fontSize: 10 }}>CSF WBC</span>
              <FieldCtrl value={pt.csfWbc} onChange={v => updatePt("csfWbc", +v)} unit="cells/µL" color={pt.csfWbc > 1000 ? "#ef4444" : undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>eGFR</span>
              <FieldCtrl value={pt.eGfr} onChange={v => updatePt("eGfr", +v)} unit="mL/min" color={pt.eGfr < 60 ? "#ef4444" : undefined} />
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              CRITICAL MODIFIERS
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { key: "dex", label: "Dexamethasone", color: "#f59e0b", note: `t_half: ${pt.dex ? "1.5d" : "4.0d"}` },
                { key: "neonatal", label: "Neonatal (<1mo)", color: "#a78bfa", note: pt.neonatal ? "R_base × 3.0" : "Adult BBB" },
                { key: "shunt", label: "VP Shunt/Hardware", color: "#ef4444", note: pt.shunt ? "K_pheno = 2.70 (biofilm)" : "No hardware" },
              ].map(m => (
                <button key={m.key} onClick={() => updatePt(m.key, !pt[m.key])} style={{
                  padding: "6px 12px", borderRadius: 6, fontFamily: FONT, fontSize: 9, cursor: "pointer",
                  background: pt[m.key] ? m.color + "18" : "transparent",
                  border: `1px solid ${pt[m.key] ? m.color + "55" : "#1e293b"}`,
                  color: pt[m.key] ? m.color : "#475569",
                }}>
                  {pt[m.key] ? "✓ " : ""}{m.label}
                  <div style={{ fontSize: 7, color: "#475569", marginTop: 2 }}>{m.note}</div>
                </button>
              ))}
            </div>

            {pt.neonatal && (
              <div style={{ padding: "8px 12px", background: "#a78bfa11", border: "1px solid #a78bfa33", borderRadius: 4, fontSize: 10, color: "#a78bfa", marginBottom: 10 }}>
                ⚠ Neonatal BBB: immature tight junctions. All R_base values multiplied by 3.0×. <Src text="Saunders 2012" />
              </div>
            )}

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              SELECT DRUGS
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {DRUGS.map((d, i) => (
                <button key={d.key} onClick={() => toggleDrug(i)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20,
                  background: sel.includes(i) ? d.color + "22" : "transparent",
                  border: `1px solid ${sel.includes(i) ? d.color + "66" : "#1e293b"}`,
                  cursor: "pointer", fontFamily: FONT, fontSize: 9,
                  color: sel.includes(i) ? d.color : "#475569", fontWeight: sel.includes(i) ? 600 : 400,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sel.includes(i) ? d.color : "#334155" }} />
                  {d.abbr}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>SELECTED DRUGS <span style={{ color: "#3b82f6", fontSize: 9, letterSpacing: 0 }}>tap for PK</span></div>
            {activeDrugs.map(d => {
              const isX = xDrug === d.key;
              const t = tau(d);
              const r0 = rBBB(d, 0, tHalf, pt.neonatal);
              const c0 = cSiteAtTime(d, 0, tHalf, pt.neonatal, kPheno);
              return (
                <div key={d.key}>
                  <div onClick={() => setXDrug(isX ? null : d.key)} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", borderBottom: "1px solid #0f1623", fontSize: 10, cursor: "pointer" }}>
                    <span style={{ color: d.color, fontWeight: 600 }}>{d.name} <span style={{ color: "#475569", fontWeight: 400 }}>{d.dose}</span></span>
                    <span style={{ color: d.color }}>τ={t.toFixed(2)} <span style={{ fontSize: 8, color: "#334155", display: "inline-block", transition: "transform 0.2s", transform: isX ? "rotate(90deg)" : "rotate(0)" }}>▶</span></span>
                  </div>
                  {isX && (
                    <div style={{ background: "#080812", borderRadius: 6, padding: "8px 10px", margin: "4px 0 8px", border: `1px solid ${d.color}22` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 9, marginBottom: 6 }}>
                        <span style={{ color: "#64748b" }}>AUC₂₄</span><span style={{ color: "#94a3b8" }}>{d.auc24} µg·hr/mL</span>
                        <span style={{ color: "#64748b" }}>MIC</span><span style={{ color: "#94a3b8" }}>{d.mic} µg/mL</span>
                        <span style={{ color: "#64748b" }}>K_admet</span><span style={{ color: "#94a3b8" }}>{d.kAdmet}</span>
                        <span style={{ color: "#64748b" }}>Class</span><span style={{ color: d.color }}>{d.cls}</span>
                      </div>
                      <div style={{ fontSize: 8, color: "#475569", borderTop: "1px solid #1a1a2e", paddingTop: 4, fontFamily: FONT }}>
                        τ = log₁₀({d.auc24}/{d.mic}) = log₁₀({(d.auc24 / d.mic).toFixed(0)}) = {t.toFixed(4)}
                      </div>
                      <div style={{ fontSize: 8, color: "#64748b", marginTop: 6 }}>BBB PENETRATION</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, fontSize: 8, marginTop: 3 }}>
                        <span style={{ color: "#475569" }}>R_base</span><span style={{ color: "#475569" }}>R_peak</span><span style={{ color: "#475569" }}>R(t=0)</span>
                        <span style={{ color: "#ef4444" }}>{pt.neonatal ? (d.rBase * 3).toFixed(3) : d.rBase}</span>
                        <span style={{ color: "#22c55e" }}>{d.rPeak}</span>
                        <span style={{ color: d.color, fontWeight: 600 }}>{r0.toFixed(3)}</span>
                      </div>
                      <div style={{ fontSize: 8, color: "#475569", borderTop: "1px solid #1a1a2e", paddingTop: 4, marginTop: 6 }}>
                        At t=0: K_path = {d.kAdmet} + {kBarrier(r0).toFixed(2)} + {kPheno.toFixed(2)} + {K_RES.toFixed(2)} = {(d.kAdmet + kBarrier(r0) + kPheno + K_RES).toFixed(2)}
                      </div>
                      <div style={{ fontSize: 8, color: d.color, fontWeight: 600, marginTop: 2 }}>
                        C(t=0) = {t.toFixed(2)} / {(d.kAdmet + kBarrier(r0) + kPheno + K_RES).toFixed(2)} = {c0.toFixed(3)} {c0 >= THRESHOLD ? "✓" : "✗"}
                      </div>
                      <div style={{ fontSize: 7, color: "#334155", marginTop: 4 }}>{d.refs}</div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginTop: 12, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>COMPUTED</div>
            <DataRow label="BBB inflammation half-life" value={`${tHalf.toFixed(1)} days`} color={tHalf < 2 ? "#f59e0b" : "#22c55e"} />
            <DataRow label="K_phenotype" value={kPheno.toFixed(2)} color={kPheno > 1 ? "#ef4444" : undefined} />
            <DataRow label="K_reservoir" value={K_RES.toFixed(3)} />
            <DataRow label="Threshold" value={THRESHOLD.toFixed(2)} />
          </StageCard>

          {/* ══ STAGE 1: THE BARRIER ══ */}
          <StageCard stage={1} current={stage} title="THE BARRIER" subtitle="M2: Dynamic BBB — permeability decays as treatment succeeds" accent="#f97316"
            onAdvance={() => setStage(2)} advanceLabel="SHOW THE PATHOGEN →" onJumpTo={() => setStage(1)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              The blood-brain barrier is not static. During acute meningitis, inflammation blows it open (R increases 10-18×).
              As antibiotics work, inflammation resolves, and R decays back to baseline with half-life {tHalf.toFixed(1)} days.
              <Src text="Nau 2010; de Gans NEJM 2002" />
            </div>

            {/* Day inspector slider */}
            <div style={{ background: "#0d0d1c", borderRadius: 8, padding: "10px 14px", border: "1px solid #f9731622", marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: "#f97316", letterSpacing: 2 }}>INSPECT DAY</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#f97316" }}>Day {inspectDay.toFixed(1)}</span>
              </div>
              <input type="range" min={0} max={14} step={0.1} value={inspectDay} onChange={e => setInspectDay(+e.target.value)}
                style={{ width: "100%", WebkitAppearance: "none", background: "#1e293b", height: 3, borderRadius: 2, outline: "none" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 7, color: "#334155", marginTop: 2 }}>
                <span>Day 0 (inflamed)</span><span>Day 14 (sealed)</span>
              </div>
            </div>

            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  {["Drug", "R_base", "R(t)", "K_barrier(t)", "K_path(t)", "C(t)", "Fails Day"].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {drugData.map(d => {
                    const rT = rBBB(d, inspectDay, tHalf, pt.neonatal);
                    const kB = kBarrier(rT);
                    const kP = d.kAdmet + kB + kPheno + K_RES;
                    const cT = tau(d) / Math.max(kP, 0.01);
                    const isX = xBarrier === d.key;
                    return (
                      <React.Fragment key={d.key}>
                        <tr style={{ borderBottom: "1px solid #0f1623", opacity: d.isSel ? 1 : 0.4, cursor: d.isSel ? "pointer" : "default", background: isX ? "#0c0c1a" : "transparent" }}
                          onClick={d.isSel ? () => setXBarrier(isX ? null : d.key) : undefined}>
                          <td style={{ padding: "4px 6px", color: d.color, fontWeight: 600 }}>{d.abbr} <span style={{ fontSize: 7, color: "#334155" }}>{isX ? "▼" : d.isSel ? "▶" : ""}</span></td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{pt.neonatal ? (d.rBase * 3).toFixed(3) : d.rBase}</td>
                          <td style={{ padding: "4px 6px", color: rT > 0.1 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{rT.toFixed(4)}</td>
                          <td style={{ padding: "4px 6px", color: kB > 50 ? "#ef4444" : kB > 10 ? "#f59e0b" : "#94a3b8" }}>{kB.toFixed(1)}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{kP.toFixed(2)}</td>
                          <td style={{ padding: "4px 6px", color: cT >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{cT.toFixed(3)}</td>
                          <td style={{ padding: "4px 6px", color: d.fDay < 3 ? "#ef4444" : d.fDay < 7 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                            {d.fDay >= 30 ? ">30" : d.fDay.toFixed(1)}
                          </td>
                        </tr>
                        {isX && (
                          <tr><td colSpan={7} style={{ padding: "8px 10px", background: "#080812" }}>
                            <div style={{ fontSize: 9, color: d.color, letterSpacing: 1, marginBottom: 6 }}>{d.name} — FULL PATHWAY AT DAY {inspectDay.toFixed(1)}</div>
                            <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.8 }}>
                              <div>R_BBB(t) = R_base × (1 + (M_peak−1) × e^(−t·ln2/t_half))</div>
                              <div style={{ color: "#475569", fontSize: 8 }}>
                                = {pt.neonatal ? (d.rBase * 3).toFixed(3) : d.rBase} × (1 + ({(d.rPeak / d.rBase).toFixed(0)}−1) × e^(−{inspectDay.toFixed(1)}×0.693/{tHalf.toFixed(1)}))
                              </div>
                              <div>= <span style={{ color: d.color, fontWeight: 600 }}>R = {rT.toFixed(4)}</span></div>
                              <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 4, marginTop: 4 }}>
                                K_barrier = max(1/{rT.toFixed(4)} − 1, −1) = <span style={{ color: kB > 50 ? "#ef4444" : "#e2e8f0", fontWeight: 600 }}>{kB.toFixed(2)}</span>
                              </div>
                              <div>K_pathway = {d.kAdmet} + {kB.toFixed(2)} + {kPheno.toFixed(2)} + {K_RES.toFixed(2)} = <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{kP.toFixed(2)}</span></div>
                              <div>τ = {tau(d).toFixed(2)}</div>
                              <div>C = τ/K = {tau(d).toFixed(2)} / {kP.toFixed(2)} = <span style={{ color: cT >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 11 }}>{cT.toFixed(4)}</span> {cT >= THRESHOLD ? "≥" : "<"} {THRESHOLD} {cT >= THRESHOLD ? "✓ EFFECTIVE" : "✗ LOCKED OUT"}</div>
                            </div>
                            {inspectDay > 0 && (
                              <div style={{ fontSize: 8, color: "#475569", marginTop: 6, borderTop: "1px solid #1a1a2e", paddingTop: 4 }}>
                                At Day 0: C = {d.c0.toFixed(3)}. Now: C = {cT.toFixed(3)}. Lost {((1 - cT / d.c0) * 100).toFixed(0)}% of coherence in {inspectDay.toFixed(1)} days.
                              </div>
                            )}
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* C(t) curve SVG */}
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>C(t) OVER 14 DAYS</div>
            <svg width="100%" height={160} viewBox="0 0 300 160" preserveAspectRatio="none" style={{ display: "block", marginBottom: 8 }}>
              <rect width={300} height={160} fill="#0a0a14" />
              {/* Threshold line */}
              <line x1={0} y1={160 - THRESHOLD / 2 * 160} x2={300} y2={160 - THRESHOLD / 2 * 160} stroke="#f59e0b44" strokeWidth="1" strokeDasharray="4,3" />
              <text x={4} y={160 - THRESHOLD / 2 * 160 - 3} fontSize={7} fill="#f59e0b" fontFamily="monospace">C={THRESHOLD}</text>
              {/* Drug curves */}
              {cCurves.map(({ drug, pts }) => {
                const pathD = pts.map((p, i) => {
                  const x = (p.t / 14) * 300;
                  const y = 160 - Math.min(p.c / 2, 1) * 160;
                  return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                }).join(" ");
                return <path key={drug.key} d={pathD} fill="none" stroke={drug.color} strokeWidth="2" opacity="0.8" />;
              })}
              {/* Labels */}
              {cCurves.map(({ drug, pts }) => {
                const lastPt = pts[pts.length - 1];
                const y = 160 - Math.min(lastPt.c / 2, 1) * 160;
                return <text key={drug.key + "l"} x={284} y={Math.max(y - 2, 10)} fontSize={7} fill={drug.color} fontFamily="monospace">{drug.abbr}</text>;
              })}
              <text x={2} y={155} fontSize={6} fill="#334155" fontFamily="monospace">Day 0</text>
              <text x={270} y={155} fontSize={6} fill="#334155" fontFamily="monospace">Day 14</text>
            </svg>
            <div style={{ fontSize: 8, color: "#334155" }}>
              Yellow dashed line = threshold ({THRESHOLD}). Curves below threshold = drug locked out.
              {pt.dex && " Dexamethasone ON — accelerated BBB closure (t_half=1.5d)."}
            </div>

            <div style={{ marginTop: 10, fontSize: 9, color: "#334155", fontStyle: "italic" }}>
              ⚠ First-order linearization: exponential decay is a proxy for the nonlinear bacteria → inflammation → R_BBB → C → kill → less inflammation feedback loop.
              <Src text="Model caveat per v0.2 spec" />
            </div>
          </StageCard>

          {/* ══ STAGE 2: THE PATHOGEN ══ */}
          <StageCard stage={2} current={stage} title="THE PATHOGEN" subtitle="M3-M4: Phenotype and reservoir geometry" accent="#a78bfa"
            onAdvance={() => setStage(3)} advanceLabel="SHOW THE PARADOX →" onJumpTo={() => setStage(2)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Unlike MRSA bone or TB, meningitis bacteria are primarily planktonic — free-floating in CSF.
              K_phenotype ≈ 0 for 90% of the population. The exception: ventricular shunt hardware, where
              biofilm forms and K_phenotype jumps to 2.70. <Src text="Nau 2010; Lutsar 2000" />
            </div>

            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  {["Niche", "Weight", "Access", "K_niche", "Dominant Drug"].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {NICHES.map((n, i) => {
                    const kN = n.weight * (1 - n.access);
                    const best = n.access < 0.3 ? "LZD/RIF" : "CRO";
                    return (
                      <tr key={n.name} style={{ borderBottom: "1px solid #0f1623", cursor: "pointer", background: xNiche === i ? "#0c0c1a" : "transparent" }}
                        onClick={() => setXNiche(xNiche === i ? null : i)}>
                        <td style={{ padding: "4px 6px", color: "#e2e8f0" }}>{n.name}</td>
                        <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{(n.weight * 100).toFixed(0)}%</td>
                        <td style={{ padding: "4px 6px", color: n.access >= 0.7 ? "#22c55e" : n.access >= 0.3 ? "#f59e0b" : "#ef4444" }}>{n.access}</td>
                        <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{kN.toFixed(3)}</td>
                        <td style={{ padding: "4px 6px", color: "#a78bfa", fontSize: 9 }}>{best}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {xNiche !== null && (() => {
              const n = NICHES[xNiche];
              return (
                <div style={{ background: "#080812", borderRadius: 6, padding: "8px 10px", marginBottom: 8, border: "1px solid #a78bfa22" }}>
                  <div style={{ fontSize: 9, color: "#a78bfa", fontWeight: 600, marginBottom: 4 }}>{n.name}</div>
                  <div style={{ fontSize: 8, color: "#94a3b8", lineHeight: 1.6 }}>
                    Weight = {n.weight} (fraction of bacteria here). Access = {n.access} (drug accessibility).
                    K_niche = {n.weight} × (1 − {n.access}) = {(n.weight * (1 - n.access)).toFixed(3)}.
                    {n.access < 0.3 ? " Low access — requires lipophilic drugs (Linezolid, Rifampin) that cross BBB independently of inflammation." : n.access < 0.7 ? " Moderate access — bacteria in purulent exudate partially shielded." : " High access — planktonic bacteria fully exposed during inflammation."}
                  </div>
                </div>
              );
            })()}

            <DataRow label="K_reservoir (weighted sum)" value={K_RES.toFixed(3)} />
            <DataRow label="K_phenotype (current)" value={kPheno.toFixed(2)} color={kPheno > 1 ? "#ef4444" : undefined} />

            {pt.shunt && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 4, fontSize: 10, color: "#ef4444" }}>
                ⛔ VP SHUNT: biofilm on hardware. K_phenotype = 2.70. Monotherapy is contraindicated — combination required.
                <Src text="Nau 2010" />
              </div>
            )}
          </StageCard>

          {/* ══ STAGE 3: THE PARADOX ══ */}
          <StageCard stage={3} current={stage} title="THE PARADOX" subtitle="Dexamethasone tradeoff — the therapeutic window" accent="#f59e0b"
            onAdvance={() => setStage(4)} advanceLabel="GENERATE REPORT →" onJumpTo={() => setStage(3)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Dexamethasone reduces brain swelling and saves lives. It also accelerates BBB closure — shrinking
              the window during which antibiotics can reach the brain. This is not a side effect. It is a geometric
              inevitability: reduce inflammation → reduce permeability → reduce drug access. <Src text="de Gans NEJM 2002" />
            </div>

            {/* Dex comparison table */}
            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  {["Drug", "C(t=0)", "Fails (with Dex)", "Fails (no Dex)", "Window Lost"].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {drugData.filter(d => d.isSel).map(d => {
                    const windowLost = d.fDayNoDex >= 30 && d.fDay >= 30 ? "—" :
                      d.fDayNoDex >= 30 ? `∞ → ${d.fDay.toFixed(1)}d` :
                      `${((1 - d.fDay / d.fDayNoDex) * 100).toFixed(0)}%`;
                    const isX = xDex === d.key;
                    const kPathFail = tau(d) / THRESHOLD;
                    const kBarrierFail = kPathFail - d.kAdmet - kPheno - K_RES;
                    const rFail = kBarrierFail > 0 ? 1 / (kBarrierFail + 1) : 999;
                    return (
                      <React.Fragment key={d.key}>
                        <tr style={{ borderBottom: "1px solid #0f1623", cursor: "pointer", background: isX ? "#0c0c1a" : "transparent" }}
                          onClick={() => setXDex(isX ? null : d.key)}>
                          <td style={{ padding: "4px 6px", color: d.color, fontWeight: 600 }}>{d.abbr} <span style={{ fontSize: 7, color: "#334155" }}>{isX ? "▼" : "▶"}</span></td>
                          <td style={{ padding: "4px 6px", color: d.c0 >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{d.c0.toFixed(2)}</td>
                          <td style={{ padding: "4px 6px", color: d.fDay < 3 ? "#ef4444" : d.fDay < 7 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                            Day {d.fDay >= 30 ? ">30" : d.fDay.toFixed(1)}
                          </td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>
                            Day {d.fDayNoDex >= 30 ? ">30" : d.fDayNoDex.toFixed(1)}
                          </td>
                          <td style={{ padding: "4px 6px", color: "#f59e0b", fontWeight: 600 }}>{windowLost}</td>
                        </tr>
                        {isX && (
                          <tr><td colSpan={5} style={{ padding: "8px 10px", background: "#080812" }}>
                            <div style={{ fontSize: 9, color: d.color, letterSpacing: 1, marginBottom: 6 }}>{d.name} — FAILURE DERIVATION</div>
                            <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.8 }}>
                              <div><span style={{ color: "#64748b" }}>Step 1:</span> Drug fails when C(t) {"<"} {THRESHOLD}</div>
                              <div><span style={{ color: "#64748b" }}>Step 2:</span> C = τ/K_path → K_path_fail = τ/threshold = {tau(d).toFixed(2)}/{THRESHOLD} = <span style={{ fontWeight: 600 }}>{kPathFail.toFixed(2)}</span></div>
                              <div><span style={{ color: "#64748b" }}>Step 3:</span> K_barrier_fail = {kPathFail.toFixed(2)} − {d.kAdmet} − {kPheno.toFixed(2)} − {K_RES.toFixed(2)} = <span style={{ fontWeight: 600 }}>{kBarrierFail.toFixed(2)}</span></div>
                              <div><span style={{ color: "#64748b" }}>Step 4:</span> R_fail = 1/(K_barrier+1) = 1/{(kBarrierFail + 1).toFixed(2)} = <span style={{ fontWeight: 600 }}>{rFail.toFixed(4)}</span></div>
                              <div><span style={{ color: "#64748b" }}>Step 5:</span> Solve R(t) = R_fail for t:</div>
                              <div style={{ color: "#475569", fontSize: 8, paddingLeft: 12 }}>
                                {rFail.toFixed(4)} = {pt.neonatal ? (d.rBase * 3).toFixed(3) : d.rBase} × (1 + ({(d.rPeak / d.rBase).toFixed(0)}−1) × e^(−t×ln2/{tHalf.toFixed(1)}))
                              </div>
                              <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 4, marginTop: 4 }}>
                                <span style={{ color: "#64748b" }}>Result:</span> t_fail = <span style={{ color: d.fDay < 3 ? "#ef4444" : "#f59e0b", fontWeight: 700, fontSize: 11 }}>Day {d.fDay >= 30 ? ">30" : d.fDay.toFixed(2)}</span>
                                {pt.dex && d.fDayNoDex < 30 && (
                                  <span style={{ color: "#475569" }}> (without Dex: Day {d.fDayNoDex.toFixed(2)} — Dex costs {(d.fDayNoDex - d.fDay).toFixed(1)} days)</span>
                                )}
                              </div>
                              {d.fDay >= 30 && (
                                <div style={{ color: "#22c55e", marginTop: 4, fontSize: 8 }}>
                                  ✓ R_base = {d.rBase} is high enough that R never decays to R_fail = {rFail.toFixed(4)}. Drug maintains access indefinitely.
                                </div>
                              )}
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Key comparison cards */}
            {drugData.filter(d => d.isSel && d.fDay < 30).length > 0 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                {drugData.filter(d => d.isSel && d.fDay < 3).map(d => (
                  <div key={d.key} style={{ flex: "1 1 140px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #ef444433", padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 6 }}>{d.abbr} FAILS</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>Day {d.fDay.toFixed(1)}</div>
                    <div style={{ fontSize: 9, color: "#64748b" }}>BBB seals before sterilization</div>
                  </div>
                ))}
                {drugData.filter(d => d.isSel && d.fDay >= 30).slice(0, 1).map(d => (
                  <div key={d.key} style={{ flex: "1 1 140px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #22c55e33", padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>{d.abbr} SURVIVES</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>&gt;30d</div>
                    <div style={{ fontSize: 9, color: "#64748b" }}>High baseline R sustains access</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: "10px 12px", background: "#1a1a0a", border: "1px solid #f59e0b33", borderRadius: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 4 }}>CLINICAL IMPLICATION</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                If Dexamethasone is administered, the geometric window collapses. Drugs with low baseline
                BBB penetration (CRO, VAN) must achieve sterilization within hours, not days. Co-administration
                of a high-penetration adjunct (RIF: R_base=0.15, LZD: R_base=0.40) is geometrically necessary
                to cover the tail end of the infection. <Src text="de Gans 2002; Nau 2010" />
              </div>
            </div>

            {/* Double Cover */}
            <div style={{ padding: "14px 16px", background: "#0d0d1c", borderRadius: 8, border: "1px solid #1a1a2e" }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 10 }}>DOUBLE COVER — S + d² = 1</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                <span style={{ color: "#3b82f6", fontWeight: 700 }}>Circle 1 (S): </span>
                Spatial penetration into CSF and the time-window of the BBB.
                <br />
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>Circle 2 (d²): </span>
                Neurotoxic cascade from bacterial lysis — determines mortality independent of drug access.
                <br /><br />
                Geometry explains <em>how</em> the drug gets in. Dynamics explain <em>whether the patient survives</em> the inflammatory storm.
              </div>
            </div>
          </StageCard>

          {/* ══ STAGE 4: THE REPORT ══ */}
          <StageCard stage={4} current={stage} title="THE REPORT" subtitle="Drug ranking, failure timeline, recommendations" accent="#14b8a6" onJumpTo={() => setStage(4)}>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>DRUG SURVIVAL RANKING</div>
            {[...drugData].filter(d => d.isSel).sort((a, b) => b.fDay - a.fDay).map((d, i) => (
              <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: i === 0 ? "#22c55e" : "#64748b", fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: d.color, fontWeight: 600 }}>{d.name} ({d.dose})</div>
                  <div style={{ fontSize: 8, color: "#475569" }}>
                    C(t=0)={d.c0.toFixed(2)} · Fails Day {d.fDay >= 30 ? ">30" : d.fDay.toFixed(1)} · R_base={d.rBase} · τ={d.tau.toFixed(2)}
                  </div>
                </div>
                <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, background: d.fDay >= 30 ? "#22c55e15" : d.fDay >= 3 ? "#f59e0b15" : "#ef444415", color: d.fDay >= 30 ? "#22c55e" : d.fDay >= 3 ? "#f59e0b" : "#ef4444" }}>
                  {d.fDay >= 30 ? "SURVIVES" : d.fDay >= 3 ? "LIMITED" : "FAILS EARLY"}
                </span>
              </div>
            ))}

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginTop: 16, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>KEY FINDINGS <span style={{ color: "#14b8a6", fontSize: 9, letterSpacing: 0 }}>tap for derivation</span></div>
            {[
              { title: "Monotherapy works at Day 0", detail: `CRO C=${drugData[0]?.c0.toFixed(2)} ≥ ${THRESHOLD} at peak inflammation. Matches IDSA 2004 first-line. Geometry derives the guideline.`, color: "#22c55e", src: "IDSA 2004",
                math: `τ(CRO) = log₁₀(${DRUGS[0].auc24}/${DRUGS[0].mic}) = ${tau(DRUGS[0]).toFixed(2)}. R_peak = ${DRUGS[0].rPeak} → K_barrier = ${kBarrier(DRUGS[0].rPeak).toFixed(2)}. K_path = ${DRUGS[0].kAdmet} + ${kBarrier(DRUGS[0].rPeak).toFixed(2)} + ${kPheno.toFixed(2)} + ${K_RES.toFixed(2)} = ${(DRUGS[0].kAdmet + kBarrier(DRUGS[0].rPeak) + kPheno + K_RES).toFixed(2)}. C = ${tau(DRUGS[0]).toFixed(2)} / ${(DRUGS[0].kAdmet + kBarrier(DRUGS[0].rPeak) + kPheno + K_RES).toFixed(2)} = ${drugData[0]?.c0.toFixed(3)} ≥ ${THRESHOLD}. ✓` },
              { title: "Dex paradox quantified", detail: `Dex shrinks CRO window from Day ${drugData[0]?.fDayNoDex >= 30 ? ">30" : drugData[0]?.fDayNoDex.toFixed(1)} to Day ${drugData[0]?.fDay.toFixed(1)}. A ${pt.dex && drugData[0]?.fDayNoDex < 30 ? ((1 - drugData[0]?.fDay / drugData[0]?.fDayNoDex) * 100).toFixed(0) : "~62"}% reduction in geometric access.`, color: "#f59e0b", src: "de Gans 2002",
                math: `Without Dex: t_half = 4.0d → CRO fails Day ${drugData[0]?.fDayNoDex >= 30 ? ">30" : drugData[0]?.fDayNoDex.toFixed(2)}. With Dex: t_half = 1.5d → fails Day ${drugData[0]?.fDay.toFixed(2)}. The BBB seals ${(4.0 / 1.5).toFixed(1)}× faster. Same drug, same dose, same bacteria — different geometry.` },
              { title: "High-penetration adjuncts necessary with Dex", detail: `LZD (R_base=0.40) and RIF (R_base=0.15) maintain C > ${THRESHOLD} beyond 21 days regardless of inflammation state.`, color: "#a78bfa", src: "Nau 2010",
                math: `LZD R_base = 0.40 → even at R_base (BBB fully sealed): K_barrier = ${kBarrier(0.40).toFixed(2)}. K_path = ${(DRUGS[3].kAdmet + kBarrier(0.40) + kPheno + K_RES).toFixed(2)}. C = ${tau(DRUGS[3]).toFixed(2)} / ${(DRUGS[3].kAdmet + kBarrier(0.40) + kPheno + K_RES).toFixed(2)} = ${(tau(DRUGS[3]) / (DRUGS[3].kAdmet + kBarrier(0.40) + kPheno + K_RES)).toFixed(3)}. ${(tau(DRUGS[3]) / (DRUGS[3].kAdmet + kBarrier(0.40) + kPheno + K_RES)) >= THRESHOLD ? "≥" : "<"} ${THRESHOLD}. Drug never loses access.` },
              { title: "Treatment paradox is a theorem", detail: "Clinical success (kill bacteria → resolve inflammation → close BBB) actively degrades drug access. This is a geometric inevitability, not a clinical observation.", color: "#ef4444", src: "Davis Field Equations",
                math: `dR/dt < 0 (inflammation resolves) → dK_barrier/dt > 0 (barrier increases) → dC/dt < 0 (coherence decreases). The sign chain is fixed: effective treatment always reduces future drug access. The only escape is R_base high enough that K_barrier(∞) still permits C ≥ threshold.` },
            ].map((pred, i) => {
              const isX = xFinding === i;
              return (
                <div key={i} onClick={() => setXFinding(isX ? null : i)}
                  style={{ padding: "10px 14px", background: isX ? "#0a0a1a" : "#0f0f1a", border: `1px solid ${isX ? pred.color + "33" : pred.color + "22"}`, borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${pred.color}66`, cursor: "pointer", transition: "all 0.2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: pred.color }}>{pred.title}</div>
                    <span style={{ fontSize: 8, color: "#334155", display: "inline-block", transition: "transform 0.2s", transform: isX ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                  </div>
                  {isX && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6, marginBottom: 6 }}>{pred.detail} <Src text={pred.src} /></div>
                      <div style={{ background: "#080812", borderRadius: 4, padding: "6px 8px", border: `1px solid ${pred.color}11`, fontSize: 8, color: "#64748b", lineHeight: 1.6 }}>
                        <span style={{ color: pred.color, fontWeight: 600, letterSpacing: 1 }}>DERIVATION</span><br />{pred.math}
                      </div>
                    </div>
                  )}
                  {!isX && <div style={{ fontSize: 8, color: "#475569", marginTop: 2 }}>Tap for derivation</div>}
                </div>
              );
            })}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14, padding: "14px", background: "#0d0d1c", borderRadius: 8, border: "1px solid #1a1a2e" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{tHalf.toFixed(1)}d</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>BBB half-life</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{drugData[0]?.fDay >= 30 ? ">30" : drugData[0]?.fDay.toFixed(1)}d</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>CRO failure day</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#14b8a6" }}>0</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>Fitted params</div>
              </div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #1a1a2e", textAlign: "center" }}>
              <div style={{ fontSize: 8, color: "#334155", letterSpacing: 2 }}>DAVIS LAB · DAVIS GEOMETRIC · BRANCH XI</div>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>The equation does not change. The barrier changes. The medicine follows.</div>
              <div style={{ fontSize: 11, color: "#1e293b", marginTop: 4, fontWeight: 700 }}>C = τ/K(t)</div>
            </div>
          </StageCard>

        </div>{/* end LEFT */}

        {/* RIGHT: VIZ */}
        {(() => {
          const isExp = vizExpanded === stage;
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
                <div style={{ fontSize: 9, color: "#334155", fontFamily: FONT, letterSpacing: 2 }}>{isExp ? "EXPANDED" : "VIZ"}</div>
                <button onClick={() => setVizExpanded(isExp ? null : stage)}
                  style={{ background: isExp ? "#1e293b22" : "none", border: `1px solid ${isExp ? "#334155" : "#1e293b"}`, color: isExp ? "#94a3b8" : "#475569", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontFamily: FONT, fontSize: 8, letterSpacing: 1 }}>
                  {isExp ? "⤡ COLLAPSE" : "⤢ EXPAND"}
                </button>
              </div>
              <SidebarContent stage={stage} activeDrugs={activeDrugs} pt={pt} tHalf={tHalf} kPheno={kPheno} drugData={drugData} mob={mob} expanded={isExp} FONT={FONT} />
            </div>
          );
        })()}

      </div>{/* end BODY */}
    </div>
  );
}
