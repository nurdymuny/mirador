import React, { useState, useMemo, useEffect, useRef } from "react";

// ─── CDN jsPDF loader ───────────────────────────────────────────────────────
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
const THRESHOLD = 0.50;

// Drug display metadata — colors and presentation only, no PK/PD values
const DRUG_META = [
  { name: "Ceftriaxone", abbr: "CRO", cls: "Cephalosporin", color: "#22c55e", dose: "2g IV q12h", refs: "Nau 2010 \u00b7 Lutsar 2000 \u00b7 FDA label" },
  { name: "Vancomycin",  abbr: "VAN", cls: "Glycopeptide",   color: "#ef4444", dose: "15mg/kg IV q6h", refs: "Nau 2010 \u00b7 Lutsar 2000 \u00b7 FDA label" },
  { name: "Rifampin",    abbr: "RIF", cls: "Rifamycin",      color: "#f97316", dose: "600mg IV/PO q24h", refs: "Nau 2010 \u00b7 Tuchscherr 2011" },
  { name: "Linezolid",   abbr: "LZD", cls: "Oxazolidinone",  color: "#a78bfa", dose: "600mg IV/PO q12h", refs: "Nau 2010 \u00b7 Beer 2007 \u00b7 FDA label" },
];
const DRUG_COLORS = Object.fromEntries(DRUG_META.map(d => [d.name, d.color]));

// ─── UI primitives ──────────────────────────────────────────────────────────

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
            >{advanceLabel || "CONTINUE \u2192"}</button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Timeseries lookup ──────────────────────────────────────────────────────
const cAt = (ts, day) => {
  if (!ts || ts.length === 0) return 0;
  const idx = Math.min(Math.round((day / 14) * 100), ts.length - 1);
  return ts[idx]?.[1] ?? 0;
};

// ─── Sidebar ────────────────────────────────────────────────────────────────

function SidebarContent({ stage, drugData, activeDrugs, wasmResult, expanded, FONT }) {
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

  const tHalf = wasmResult?.patient?.t_half ?? 1.5;
  const kPheno = wasmResult?.patient?.k_phenotype ?? 0.03;
  const kRes = wasmResult?.patient?.k_reservoir ?? 0.26;

  if (stage === 0) {
    return (<>
      <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 6 }}>NEURO-PK PROFILE</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Drug potency at the BBB</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        {"\u03C4"} = log{"\u2081\u2080"}(AUC{"\u2082\u2084"}/MIC). Higher = more potent against susceptible bacteria.
      </div>
      {drugData.map(d => (
        <MiniBar key={d.name} label={`${d.abbr} (${d.cls})`} val={d.tau} max={5} color={d.color}
          note={`AUC=${d.auc24} / MIC=${d.mic} \u00b7 ${d.isSel ? "SELECTED" : "not selected"}`} />
      ))}
      <Divider />
      <Explain>
        Meningitis pathogens are mostly planktonic {"\u2014"} free-floating in CSF. They don{"'"}t form biofilm
        (unless there{"'"}s a shunt). The raw drug potency ({"\u03C4"}) matters here more than in bone, where biofilm dominates.
        Ceftriaxone has the highest {"\u03C4"} because its MIC against susceptible organisms is extremely low.
      </Explain>
    </>);
  }

  if (stage === 1) {
    return (<>
      <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>BBB PERMEABILITY</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>R(t) = R_base {"\u00d7"} (1 + (M_peak{"\u22121"})e^({"\u2212"}t{"\u00b7"}ln2/t_half))</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        At t=0 (acute inflammation), BBB is open. As treatment works, BBB seals shut.
      </div>
      {activeDrugs.map(d => {
        const r0 = d.bd_t0?.r_bbb ?? 0;
        const kb0 = d.bd_t0?.k_barrier ?? 0;
        const rIns = d.bd_ins?.r_bbb ?? 0;
        const kbIns = d.bd_ins?.k_barrier ?? 0;
        return (
          <div key={d.name} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: d.color, fontWeight: 700, marginBottom: 4 }}>{d.abbr}</div>
            <MiniBar label="Day 0 (inflamed)" val={r0} max={0.8} color={d.color} note={`K_barrier=${kb0.toFixed(1)}`} />
            <MiniBar label={`Day ${(d.bd_ins?.day ?? 0).toFixed(1)}`} val={rIns} max={0.8} color={d.color + "88"} note={`K_barrier=${kbIns.toFixed(1)}`} />
          </div>
        );
      })}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 6 }}>INFLAMED vs UNINFLAMED</div>
        {drugData.map(d => (
          <div key={d.name} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
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
              <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: 10 }}>{d.rBase > 0 ? (d.rPeak / d.rBase).toFixed(0) : "?"}{"\u00d7"}</div>
            </div>
          </div>
        ))}
      </>)}
      <Divider />
      <Explain>
        The BBB is the gatekeeper. During acute meningitis, inflammation blows it open {"\u2014"} permeability
        spikes 10-18{"\u00d7"} above baseline. But as antibiotics kill bacteria, inflammation resolves, and the
        BBB seals back up. The drug that was getting through at Day 0 may be locked out by Day 2.
      </Explain>
    </>);
  }

  if (stage === 2) {
    const niches = wasmResult?.niches ?? [];
    return (<>
      <div style={{ fontSize: 9, color: "#a78bfa", letterSpacing: 2, marginBottom: 6 }}>PHENOTYPE & RESERVOIR</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>CSF niches and phenotypic states</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        Unlike bone or TB, most CSF bacteria are planktonic (K_pheno = 0). Exception: shunt hardware.
      </div>
      {niches.map(n => (
        <MiniBar key={n.name} label={n.name} val={n.weight} max={1} color="#a78bfa"
          note={`Access=${n.access} \u00b7 K_niche=${n.k_niche.toFixed(3)}`} />
      ))}
      <div style={{ fontSize: 9, color: "#64748b", marginTop: 8, fontFamily: FONT }}>
        K_reservoir = {"\u03A3"}(weight {"\u00d7"} (1 {"\u2212"} access)) = {kRes.toFixed(3)}
      </div>
      <Divider />
      <Explain>
        CSF bulk (70% of bacteria) is highly accessible during inflammation. The meningeal surface
        (20%) has moderate access. Brain parenchyma (10%) is the hardest {"\u2014"} requires lipophilic drugs.
        Linezolid and Rifampin reach parenchyma; Ceftriaxone and Vancomycin do not.
      </Explain>
    </>);
  }

  if (stage === 3) {
    return (<>
      <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 6 }}>THE DEX PARADOX {"\u2014"} C(t) CURVES</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>When does each drug fail?</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        Failure = day when C_site drops below {THRESHOLD}. Lower = worse.
      </div>
      {activeDrugs.map(d => {
        const fDay = d.fDay;
        const fDayNoDex = d.fDayNoDex;
        return (
          <div key={d.name} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span style={{ color: d.color, fontWeight: 700 }}>{d.abbr}</span>
              <span style={{ color: fDay < 3 ? "#ef4444" : fDay < 7 ? "#f59e0b" : "#22c55e" }}>
                fails Day {fDay >= 30 ? ">30" : fDay.toFixed(1)}
              </span>
            </div>
            {fDayNoDex !== fDay && (
              <div style={{ fontSize: 8, color: "#475569" }}>Without Dex: Day {fDayNoDex >= 30 ? ">30" : fDayNoDex.toFixed(1)}</div>
            )}
          </div>
        );
      })}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 6 }}>C(t) AT DAY 0 vs DAY 3 vs DAY 7</div>
        {activeDrugs.map(d => (
          <div key={d.name} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {[0, 3, 7].map(day => {
              const c = cAt(d.timeseries, day);
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
        from t_half=4.0 days to t_half={tHalf.toFixed(1)} days. Rifampin and Linezolid survive because their
        baseline penetration is high enough to maintain C above threshold even after the BBB seals shut.
        The math says: if you give Dex, you MUST co-administer a high-baseline-penetration drug.
      </Explain>
    </>);
  }

  if (stage === 4) {
    return (<>
      <div style={{ fontSize: 9, color: "#14b8a6", letterSpacing: 2, marginBottom: 6 }}>DRUG RANKING OVER TIME</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Who survives the BBB closure?</div>
      {["0", "1", "3", "7", "14"].map(day => {
        const ranked = wasmResult?.rankings?.[day] ?? [];
        return (
          <div key={day} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 8, color: "#64748b", letterSpacing: 1, marginBottom: 3 }}>DAY {day}</div>
            {ranked.map(r => (
              <div key={r.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#475569", borderBottom: "1px solid #0f1623", padding: "1px 0" }}>
                <span style={{ color: DRUG_COLORS[r.name] || "#94a3b8" }}>{DRUG_META.find(m => m.name === r.name)?.abbr ?? r.name}</span>
                <span style={{ color: r.c >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 600 }}>C={r.c.toFixed(3)}</span>
              </div>
            ))}
          </div>
        );
      })}
      <Divider />
      <Explain>
        At Day 0, Ceftriaxone dominates {"\u2014"} highest {"\u03C4"}, decent inflamed penetration. By Day 3,
        the ranking inverts: Linezolid and Rifampin overtake because their baseline BBB penetration
        sustains C above threshold. The geometry predicts the clinical practice.
      </Explain>
    </>);
  }
  return null;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

export default function MeningitisApp() {
  const mob = useIsMobile();
  const [stage, setStage] = useState(0);
  const [sel, setSel] = useState(["Ceftriaxone", "Rifampin", "Linezolid"]);
  const [vizExpanded, setVizExpanded] = useState(null);
  const [xDrug, setXDrug] = useState(null);
  const [xNiche, setXNiche] = useState(null);
  const [xBarrier, setXBarrier] = useState(null);
  const [xDex, setXDex] = useState(null);
  const [xFinding, setXFinding] = useState(null);
  const [inspectDay, setInspectDay] = useState(0);
  const [pt, setPt] = useState({ age: 45, neonatal: false, dex: true, weight: 70, eGfr: 90, shunt: false });
  const updatePt = (k, v) => setPt(p => ({ ...p, [k]: v }));
  const toggleDrug = name => setSel(p => p.includes(name) ? p.filter(x => x !== name) : [...p, name]);

  // ── WASM ──────────────────────────────────
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmResult, setWasmResult] = useState(null);
  const wasmRef = useRef(null);

  useEffect(() => {
    import('./mirador_meningitis/mirador_meningitis_wasm.js').then(mod => {
      wasmRef.current = mod;
      return mod.default({ module_or_path: '/mirador_meningitis/mirador_meningitis_wasm_bg.wasm' });
    }).then(() => setWasmReady(true))
      .catch(e => console.error('Meningitis WASM init failed:', e));
  }, []);

  useEffect(() => {
    if (!wasmReady || !sel.length) { setWasmResult(null); return; }
    const params = JSON.stringify({
      drugs: sel,
      age_years: pt.age,
      dexamethasone: pt.dex,
      shunt: pt.shunt,
      threshold: THRESHOLD,
      inspect_day: inspectDay,
      synergy: 1.0,
    });
    try {
      const raw = wasmRef.current.compute_meningitis(params);
      const result = JSON.parse(raw);
      if (result.error) { console.error('WASM error:', result.error); setWasmResult(null); }
      else { setWasmResult(result); }
    } catch (e) { console.error('WASM call failed:', e); setWasmResult(null); }
  }, [wasmReady, sel, pt.age, pt.dex, pt.shunt, inspectDay]);

  // ── Derived data ──────────────────────────
  const tHalf = wasmResult?.patient?.t_half ?? (pt.dex ? 1.5 : 4.0);
  const kPheno = wasmResult?.patient?.k_phenotype ?? (pt.shunt ? 2.70 : 0.03);
  const kRes = wasmResult?.patient?.k_reservoir ?? 0.26;

  const drugData = useMemo(() => {
    return DRUG_META.map(m => {
      const wd = wasmResult?.all_drugs?.find(d => d.name === m.name);
      const pd = wasmResult?.per_drug?.[m.name];
      return {
        key: m.name, name: m.name, abbr: m.abbr, cls: m.cls, color: m.color, dose: m.dose, refs: m.refs,
        auc24: wd?.auc24 ?? 0, mic: wd?.mic ?? 0, tau: wd?.tau ?? 0,
        kAdmet: wd?.k_admet ?? 0, rBase: wd?.r_base ?? 0, rPeak: wd?.r_peak ?? 0,
        isSel: sel.includes(m.name),
        c0: pd?.c_t0 ?? 0, r0: pd?.breakdown_t0?.r_bbb ?? 0,
        fDay: pd ? (pd.failure_day === -1 ? 30 : pd.failure_day) : 30,
        fDayNoDex: pd ? (pd.failure_day_no_dex === -1 ? 30 : pd.failure_day_no_dex) : 30,
        bd_t0: pd?.breakdown_t0 ?? null, bd_ins: pd?.breakdown_inspect ?? null,
        timeseries: pd?.timeseries ?? [],
      };
    });
  }, [wasmResult, sel]);

  const activeDrugs = drugData.filter(d => d.isSel);

  const cCurves = useMemo(() =>
    activeDrugs.map(d => ({ drug: d, pts: d.timeseries.map(([t, c]) => ({ t, c })) })),
    [activeDrugs]
  );

  // ── Report builders ───────────────────────
  const buildReportData = () => ({
    meta: { engine: "MIRADOR Meningitis BBB Module", version: "1.0", generated: new Date().toISOString(), fitted_parameters: 0 },
    patient: { ...(wasmResult?.patient ?? {}), weight: pt.weight, eGfr: pt.eGfr },
    regimen: activeDrugs.map(d => ({ name: d.name, abbr: d.abbr, class: d.cls, dose: d.dose, tau: d.tau, auc24: d.auc24, mic: d.mic, k_admet: d.kAdmet, r_base: d.rBase, r_peak: d.rPeak })),
    niches: wasmResult?.niches ?? [],
    per_drug: wasmResult?.per_drug ?? {},
    combo: wasmResult?.combo ?? {},
    rankings: wasmResult?.rankings ?? {},
    threshold: THRESHOLD,
    sources: ["Nau 2010", "Lutsar 2000", "de Gans NEJM 2002", "Beer 2007", "Tuchscherr 2011", "IDSA 2004", "Saunders 2012", "FDA labels", "Model: Davis Field Equations"],
  });

  const handleDownloadJSON = () => {
    const data = buildReportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "Meningitis_BBB_Report.json";
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    const jsPDF = await loadJsPDF();
    const d = buildReportData();
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const ML = 54, MR = 54, CW = W - ML - MR;
    const NAVY = [15, 23, 42], SLATE = [51, 65, 85], GRAY = [100, 116, 139];
    let y = 54;
    const sanitize = (s) => String(s ?? '').replace(/[\u2212]/g, '-').replace(/[\u2014]/g, '--').replace(/[\u03C4]/g, 'tau').replace(/[\u00b7]/g, '.').replace(/[^\x00-\xFF]/g, '');
    const addPage = () => { doc.addPage(); y = 54; };
    const checkPage = (need) => { if (y + need > doc.internal.pageSize.getHeight() - 54) addPage(); };

    // Title
    doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...NAVY);
    doc.text("MIRADOR Meningitis BBB Report", ML, y); y += 20;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...GRAY);
    doc.text(`Generated ${d.meta.generated} | Fitted parameters: 0`, ML, y); y += 20;

    // Patient
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...SLATE);
    doc.text("Patient Profile", ML, y); y += 14;
    const ptP = d.patient;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Parameter", "Value"]],
      body: [
        ["Age", `${ptP.age_years} years${ptP.neonatal ? " (NEONATAL)" : ""}`],
        ["Dexamethasone", ptP.dexamethasone ? "YES" : "NO"],
        ["VP Shunt", ptP.shunt ? "YES" : "NO"],
        ["BBB t_half", `${ptP.t_half} days`],
        ["K_phenotype", String(ptP.k_phenotype)],
        ["K_reservoir", String(ptP.k_reservoir)],
      ],
      styles: { fontSize: 8, font: "helvetica" },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = doc.lastAutoTable.finalY + 16;

    // Regimen
    checkPage(80);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...SLATE);
    doc.text("Drug Regimen", ML, y); y += 14;
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "Class", "Dose", "tau", "AUC24", "MIC", "R_base", "R_peak"]],
      body: d.regimen.map(r => [r.name, r.class, r.dose, r.tau?.toFixed(3), r.auc24, r.mic, r.r_base, r.r_peak]),
      styles: { fontSize: 7, font: "helvetica" },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = doc.lastAutoTable.finalY + 16;

    // Per-drug breakdown
    checkPage(80);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...SLATE);
    doc.text("Per-Drug BBB Analysis", ML, y); y += 14;
    const pdRows = Object.entries(d.per_drug).map(([name, v]) => [
      name, v.tau?.toFixed(3), v.c_t0?.toFixed(3),
      v.failure_day === -1 ? ">30" : v.failure_day?.toFixed(2),
      v.failure_day_no_dex === -1 ? ">30" : v.failure_day_no_dex?.toFixed(2),
      v.breakdown_t0?.k_barrier?.toFixed(2), v.breakdown_t0?.k_pathway?.toFixed(2),
    ]);
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "tau", "C(t=0)", "Fail(Dex)", "Fail(noDex)", "K_barrier(0)", "K_path(0)"]],
      body: pdRows,
      styles: { fontSize: 7, font: "helvetica" },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = doc.lastAutoTable.finalY + 16;

    // Combination Therapy (Kirchhoff parallel conductance)
    const combo = d.combo;
    if (combo && combo.c_t0 != null) {
      checkPage(120);
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...SLATE);
      doc.text("Combination Therapy (Kirchhoff Parallel Conductance)", ML, y); y += 14;

      // Hero box
      const boxH = 52;
      doc.setFillColor(15, 23, 42); doc.roundedRect(ML, y, CW, boxH, 4, 4, 'F');
      doc.setFont("helvetica", "bold"); doc.setFontSize(22);
      const comboPass = combo.c_t0 >= d.threshold;
      doc.setTextColor(comboPass ? 34 : 239, comboPass ? 197 : 68, comboPass ? 94 : 68);
      doc.text(`C_combo(t=0) = ${combo.c_t0.toFixed(3)}`, ML + 14, y + 22);
      doc.setFontSize(13); doc.setTextColor(...GRAY);
      doc.text(`C_combo(t=14) = ${combo.c_t14.toFixed(3)}`, ML + 14, y + 40);
      const passLabel = comboPass ? 'ABOVE THRESHOLD' : 'BELOW THRESHOLD';
      doc.setFontSize(9); doc.setTextColor(comboPass ? 34 : 239, comboPass ? 197 : 68, comboPass ? 94 : 68);
      doc.text(passLabel, ML + CW - 14 - doc.getTextWidth(passLabel), y + 22);
      doc.setFontSize(8); doc.setTextColor(...GRAY);
      doc.text(`Threshold: ${d.threshold}`, ML + CW - 14 - doc.getTextWidth(`Threshold: ${d.threshold}`), y + 36);
      y += boxH + 12;

      // Combo timeseries table (sampled)
      if (combo.timeseries && combo.timeseries.length > 0) {
        const sampleDays = [0, 1, 2, 3, 5, 7, 10, 14];
        const tsRows = sampleDays.map(day => {
          const idx = Math.min(Math.round((day / 14) * (combo.timeseries.length - 1)), combo.timeseries.length - 1);
          const c = combo.timeseries[idx]?.[1] ?? 0;
          return [`Day ${day}`, c.toFixed(3), c >= d.threshold ? 'PASS' : 'FAIL'];
        });
        doc.autoTable({
          startY: y, margin: { left: ML, right: MR },
          head: [['Day', 'C_combo', 'Status']],
          body: tsRows,
          styles: { fontSize: 7, font: 'helvetica' },
          headStyles: { fillColor: [30, 41, 59] },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 2) {
              data.cell.styles.textColor = data.cell.raw === 'PASS' ? [34, 197, 94] : [239, 68, 68];
              data.cell.styles.fontStyle = 'bold';
            }
          },
        });
        y = doc.lastAutoTable.finalY + 12;
      }

      // Clinical note
      checkPage(40);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
      const allFail = Object.values(d.per_drug).every(v => v.failure_day !== -1 && v.failure_day < 14);
      if (allFail && comboPass) {
        doc.text('NOTE: All individual drugs fail before Day 14, but parallel conductance of the', ML, y); y += 10;
        doc.text('combination sustains C_combo above threshold. Monotherapy is contraindicated.', ML, y); y += 14;
      }
    }

    // Rankings
    checkPage(100);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...SLATE);
    doc.text("Drug Rankings Over Time", ML, y); y += 14;
    const rankDays = ['0', '1', '3', '7', '14'];
    const rankHead = ['Drug', ...rankDays.map(dd => `Day ${dd}`)];
    const drugNames = [...new Set(rankDays.flatMap(dd => (d.rankings[dd] ?? []).map(r => r.name)))];
    const rankBody = drugNames.map(name => [
      name,
      ...rankDays.map(dd => {
        const entry = (d.rankings[dd] ?? []).find(r => r.name === name);
        return entry ? entry.c.toFixed(3) : '-';
      }),
    ]);
    doc.autoTable({
      startY: y, margin: { left: ML, right: MR },
      head: [rankHead],
      body: rankBody,
      styles: { fontSize: 7, font: 'helvetica' },
      headStyles: { fillColor: [30, 41, 59] },
    });
    y = doc.lastAutoTable.finalY + 16;

    // Footer
    checkPage(40);
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(...GRAY);
    doc.text(sanitize("C = tau / K(t) | Davis Geometric | Fitted parameters: 0"), ML, y);

    doc.save("Meningitis_BBB_Report.pdf");
  };

  // ── Render ────────────────────────────────
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
          <button onClick={() => { window.location.hash = ''; }} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>{"\u2190"} HOME</button>
          <button onClick={() => { window.location.hash = 'demo'; }} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>MIRADOR CORE</button>
          <div style={{ fontSize: mob ? 13 : 16, fontWeight: 700, letterSpacing: 3, color: "#e2e8f0" }}>MENINGITIS</div>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>DYNAMIC BBB {"\u00b7"} BACTERIAL MENINGITIS</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 10, color: "#475569" }}>STAGE {stage + 1} / 5</div>
          {!wasmReady && <span style={{ fontSize: 8, color: "#f59e0b" }}>LOADING WASM{"\u2026"}</span>}
          {stage > 0 && <button onClick={() => setStage(0)} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>RESTART</button>}
        </div>
      </div>

      {/* DEDICATION */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 0" }}>
        <div style={{ padding: "16px 20px", background: "#09090f", borderRadius: 8, borderLeft: "3px solid #f59e0b", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#f59e0b", letterSpacing: 3, marginBottom: 8, fontFamily: FONT }}>THE TREATMENT PARADOX</div>
          <div style={{ fontSize: 15, color: "#e2e8f0", fontWeight: 500, marginBottom: 6 }}>Clinical success actively degrades geometric access.</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.8 }}>
            The antibiotics that save the patient{"'"}s life also seal shut the barrier that let them reach
            the brain. If the bacteria aren{"'"}t eradicated before the barrier closes, the survivors are
            trapped behind an impenetrable wall. This module computes the exact therapeutic window.
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 10, fontStyle: "italic" }}>C = {"\u03C4"}/K(t)</div>
        </div>
      </div>

      {/* TITLE CARD */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 16px 4px" }}>
        <div style={{ padding: "12px 16px", background: "#0c0c1a", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
            Bacterial meningitis has the highest mortality of common infections. The blood-brain barrier
            is the dominant obstacle {"\u2014"} and it changes over time. <span style={{ color: "#e2e8f0" }}>MIRADOR Meningitis</span> extends
            C = {"\u03C4"}/K with a time-varying barrier function, computing the exact day each drug loses access
            to the brain. The Dexamethasone Paradox is derived, not assumed.
          </div>
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", flexDirection: mob ? "column" : "row", alignItems: "flex-start", maxWidth: 1200, margin: "0 auto", padding: mob ? "0 12px 32px" : "0 16px 32px", gap: 16 }}>

        {/* LEFT */}
        <div style={{ flex: mob ? "1 1 100%" : (vizExpanded !== null ? "1 1 340px" : "1 1 520px"), minWidth: 0, width: "100%", transition: "flex 0.35s ease" }}>

          {/* STAGE 0: THE PATIENT */}
          <StageCard stage={0} current={stage} title="THE PATIENT" subtitle="Neuro-PK profile and dexamethasone status" accent="#3b82f6"
            onAdvance={activeDrugs.length >= 1 ? () => setStage(1) : null} advanceLabel={"MAP THE BARRIER \u2192"} onJumpTo={() => setStage(0)}>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              CLINICAL PROFILE <span style={{ color: "#3b82f6", fontSize: 9, letterSpacing: 0 }}>editable</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 16, rowGap: 8, alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: "#64748b", fontSize: 10 }}>Age</span>
              <FieldCtrl value={pt.age} onChange={v => { updatePt("age", +v); updatePt("neonatal", +v < 1); }} unit="yr" color={pt.age < 1 ? "#f59e0b" : undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>Weight</span>
              <FieldCtrl value={pt.weight} onChange={v => updatePt("weight", +v)} unit="kg" />
              <span style={{ color: "#64748b", fontSize: 10 }}>CSF WBC</span>
              <FieldCtrl value={2000} onChange={() => {}} unit={"cells/\u00B5L"} color={undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>eGFR</span>
              <FieldCtrl value={pt.eGfr} onChange={v => updatePt("eGfr", +v)} unit="mL/min" color={pt.eGfr < 60 ? "#ef4444" : undefined} />
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>CRITICAL MODIFIERS</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              {[
                { key: "dex", label: "Dexamethasone", color: "#f59e0b", note: `t_half: ${pt.dex ? "1.5d" : "4.0d"}` },
                { key: "neonatal", label: "Neonatal (<1mo)", color: "#a78bfa", note: pt.neonatal ? "R_base \u00d7 3.0" : "Adult BBB" },
                { key: "shunt", label: "VP Shunt/Hardware", color: "#ef4444", note: pt.shunt ? "K_pheno = 2.70 (biofilm)" : "No hardware" },
              ].map(m => (
                <button key={m.key} onClick={() => updatePt(m.key, !pt[m.key])} style={{
                  padding: "6px 12px", borderRadius: 6, fontFamily: FONT, fontSize: 9, cursor: "pointer",
                  background: pt[m.key] ? m.color + "18" : "transparent",
                  border: `1px solid ${pt[m.key] ? m.color + "55" : "#1e293b"}`,
                  color: pt[m.key] ? m.color : "#475569",
                }}>
                  {pt[m.key] ? "\u2713 " : ""}{m.label}
                  <div style={{ fontSize: 7, color: "#475569", marginTop: 2 }}>{m.note}</div>
                </button>
              ))}
            </div>

            {pt.neonatal && (
              <div style={{ padding: "8px 12px", background: "#a78bfa11", border: "1px solid #a78bfa33", borderRadius: 4, fontSize: 10, color: "#a78bfa", marginBottom: 10 }}>
                {"\u26A0"} Neonatal BBB: immature tight junctions. All R_base values multiplied by 3.0{"\u00d7"}. <Src text="Saunders 2012" />
              </div>
            )}

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>SELECT DRUGS</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {DRUG_META.map(m => (
                <button key={m.name} onClick={() => toggleDrug(m.name)} style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20,
                  background: sel.includes(m.name) ? m.color + "22" : "transparent",
                  border: `1px solid ${sel.includes(m.name) ? m.color + "66" : "#1e293b"}`,
                  cursor: "pointer", fontFamily: FONT, fontSize: 9,
                  color: sel.includes(m.name) ? m.color : "#475569", fontWeight: sel.includes(m.name) ? 600 : 400,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: sel.includes(m.name) ? m.color : "#334155" }} />
                  {m.abbr}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>SELECTED DRUGS <span style={{ color: "#3b82f6", fontSize: 9, letterSpacing: 0 }}>tap for PK</span></div>
            {activeDrugs.map(d => {
              const isX = xDrug === d.name;
              return (
                <div key={d.name}>
                  <div onClick={() => setXDrug(isX ? null : d.name)} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", borderBottom: "1px solid #0f1623", fontSize: 10, cursor: "pointer" }}>
                    <span style={{ color: d.color, fontWeight: 600 }}>{d.name} <span style={{ color: "#475569", fontWeight: 400 }}>{d.dose}</span></span>
                    <span style={{ color: d.color }}>{"\u03C4"}={d.tau.toFixed(2)} <span style={{ fontSize: 8, color: "#334155", display: "inline-block", transition: "transform 0.2s", transform: isX ? "rotate(90deg)" : "rotate(0)" }}>{"\u25B6"}</span></span>
                  </div>
                  {isX && (
                    <div style={{ background: "#080812", borderRadius: 6, padding: "8px 10px", margin: "4px 0 8px", border: `1px solid ${d.color}22` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 9, marginBottom: 6 }}>
                        <span style={{ color: "#64748b" }}>AUC{"\u2082\u2084"}</span><span style={{ color: "#94a3b8" }}>{d.auc24} {"\u00B5"}g{"\u00b7"}hr/mL</span>
                        <span style={{ color: "#64748b" }}>MIC</span><span style={{ color: "#94a3b8" }}>{d.mic} {"\u00B5"}g/mL</span>
                        <span style={{ color: "#64748b" }}>K_admet</span><span style={{ color: "#94a3b8" }}>{d.kAdmet}</span>
                        <span style={{ color: "#64748b" }}>Class</span><span style={{ color: d.color }}>{d.cls}</span>
                      </div>
                      <div style={{ fontSize: 8, color: "#475569", borderTop: "1px solid #1a1a2e", paddingTop: 4, fontFamily: FONT }}>
                        {"\u03C4"} = log{"\u2081\u2080"}({d.auc24}/{d.mic}) = {d.tau.toFixed(4)}
                      </div>
                      <div style={{ fontSize: 8, color: "#64748b", marginTop: 6 }}>BBB PENETRATION</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 3, fontSize: 8, marginTop: 3 }}>
                        <span style={{ color: "#475569" }}>R_base</span><span style={{ color: "#475569" }}>R_peak</span><span style={{ color: "#475569" }}>R(t=0)</span>
                        <span style={{ color: "#ef4444" }}>{d.rBase}</span>
                        <span style={{ color: "#22c55e" }}>{d.rPeak}</span>
                        <span style={{ color: d.color, fontWeight: 600 }}>{d.r0.toFixed(3)}</span>
                      </div>
                      {d.bd_t0 && (
                        <>
                          <div style={{ fontSize: 8, color: "#475569", borderTop: "1px solid #1a1a2e", paddingTop: 4, marginTop: 6 }}>
                            At t=0: K_path = {d.kAdmet} + {d.bd_t0.k_barrier.toFixed(2)} + {kPheno.toFixed(2)} + {kRes.toFixed(2)} = {d.bd_t0.k_pathway.toFixed(2)}
                          </div>
                          <div style={{ fontSize: 8, color: d.color, fontWeight: 600, marginTop: 2 }}>
                            C(t=0) = {d.tau.toFixed(2)} / {d.bd_t0.k_pathway.toFixed(2)} = {d.c0.toFixed(3)} {d.c0 >= THRESHOLD ? "\u2713" : "\u2717"}
                          </div>
                        </>
                      )}
                      <div style={{ fontSize: 7, color: "#334155", marginTop: 4 }}>{d.refs}</div>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginTop: 12, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>COMPUTED</div>
            <DataRow label="BBB inflammation half-life" value={`${tHalf.toFixed(1)} days`} color={tHalf < 2 ? "#f59e0b" : "#22c55e"} />
            <DataRow label="K_phenotype" value={kPheno.toFixed(2)} color={kPheno > 1 ? "#ef4444" : undefined} />
            <DataRow label="K_reservoir" value={kRes.toFixed(3)} />
            <DataRow label="Threshold" value={THRESHOLD.toFixed(2)} />
          </StageCard>

          {/* STAGE 1: THE BARRIER */}
          <StageCard stage={1} current={stage} title="THE BARRIER" subtitle="M2: Dynamic BBB \u2014 permeability decays as treatment succeeds" accent="#f97316"
            onAdvance={() => setStage(2)} advanceLabel={"SHOW THE PATHOGEN \u2192"} onJumpTo={() => setStage(1)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              The blood-brain barrier is not static. During acute meningitis, inflammation blows it open (R increases 10-18{"\u00d7"}).
              As antibiotics work, inflammation resolves, and R decays back to baseline with half-life {tHalf.toFixed(1)} days.
              <Src text="Nau 2010; de Gans NEJM 2002" />
            </div>

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
                    const bd = d.bd_ins;
                    const rT = bd?.r_bbb ?? 0;
                    const kB = bd?.k_barrier ?? 0;
                    const kP = bd?.k_pathway ?? 0;
                    const cT = bd?.c_site ?? 0;
                    const isX = xBarrier === d.name;
                    return (
                      <React.Fragment key={d.name}>
                        <tr style={{ borderBottom: "1px solid #0f1623", opacity: d.isSel ? 1 : 0.4, cursor: d.isSel ? "pointer" : "default", background: isX ? "#0c0c1a" : "transparent" }}
                          onClick={d.isSel ? () => setXBarrier(isX ? null : d.name) : undefined}>
                          <td style={{ padding: "4px 6px", color: d.color, fontWeight: 600 }}>{d.abbr} <span style={{ fontSize: 7, color: "#334155" }}>{isX ? "\u25BC" : d.isSel ? "\u25B6" : ""}</span></td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{d.rBase}</td>
                          <td style={{ padding: "4px 6px", color: rT > 0.1 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{rT.toFixed(4)}</td>
                          <td style={{ padding: "4px 6px", color: kB > 50 ? "#ef4444" : kB > 10 ? "#f59e0b" : "#94a3b8" }}>{kB.toFixed(1)}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{kP.toFixed(2)}</td>
                          <td style={{ padding: "4px 6px", color: cT >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{cT.toFixed(3)}</td>
                          <td style={{ padding: "4px 6px", color: d.fDay < 3 ? "#ef4444" : d.fDay < 7 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
                            {d.fDay >= 30 ? ">30" : d.fDay.toFixed(1)}
                          </td>
                        </tr>
                        {isX && bd && (
                          <tr><td colSpan={7} style={{ padding: "8px 10px", background: "#080812" }}>
                            <div style={{ fontSize: 9, color: d.color, letterSpacing: 1, marginBottom: 6 }}>{d.name} {"\u2014"} FULL PATHWAY AT DAY {inspectDay.toFixed(1)}</div>
                            <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.8 }}>
                              <div>R_BBB(t) = R_base {"\u00d7"} (1 + (M_peak{"\u2212"}1) {"\u00d7"} e^({"\u2212"}t{"\u00b7"}ln2/t_half))</div>
                              <div>= <span style={{ color: d.color, fontWeight: 600 }}>R = {rT.toFixed(4)}</span></div>
                              <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 4, marginTop: 4 }}>
                                K_barrier = max(1/{rT.toFixed(4)} {"\u2212"} 1, 0) = <span style={{ color: kB > 50 ? "#ef4444" : "#e2e8f0", fontWeight: 600 }}>{kB.toFixed(2)}</span>
                              </div>
                              <div>K_pathway = {d.kAdmet} + {kB.toFixed(2)} + {kPheno.toFixed(2)} + {kRes.toFixed(2)} = <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{kP.toFixed(2)}</span></div>
                              <div>C = {"\u03C4"}/K = {d.tau.toFixed(2)} / {kP.toFixed(2)} = <span style={{ color: cT >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 11 }}>{cT.toFixed(4)}</span> {cT >= THRESHOLD ? "\u2265" : "<"} {THRESHOLD} {cT >= THRESHOLD ? "\u2713 EFFECTIVE" : "\u2717 LOCKED OUT"}</div>
                            </div>
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
              <line x1={0} y1={160 - THRESHOLD / 2 * 160} x2={300} y2={160 - THRESHOLD / 2 * 160} stroke="#f59e0b44" strokeWidth="1" strokeDasharray="4,3" />
              <text x={4} y={160 - THRESHOLD / 2 * 160 - 3} fontSize={7} fill="#f59e0b" fontFamily="monospace">C={THRESHOLD}</text>
              {cCurves.map(({ drug, pts }) => {
                const pathD = pts.map((p, i) => {
                  const x = (p.t / 14) * 300;
                  const y = 160 - Math.min(p.c / 2, 1) * 160;
                  return `${i === 0 ? "M" : "L"} ${x} ${y}`;
                }).join(" ");
                return <path key={drug.name} d={pathD} fill="none" stroke={drug.color} strokeWidth="2" opacity="0.8" />;
              })}
              {cCurves.map(({ drug, pts }) => {
                const lastPt = pts[pts.length - 1];
                if (!lastPt) return null;
                const y = 160 - Math.min(lastPt.c / 2, 1) * 160;
                return <text key={drug.name + "l"} x={284} y={Math.max(y - 2, 10)} fontSize={7} fill={drug.color} fontFamily="monospace">{drug.abbr}</text>;
              })}
              <text x={2} y={155} fontSize={6} fill="#334155" fontFamily="monospace">Day 0</text>
              <text x={270} y={155} fontSize={6} fill="#334155" fontFamily="monospace">Day 14</text>
            </svg>
            <div style={{ fontSize: 8, color: "#334155" }}>
              Yellow dashed line = threshold ({THRESHOLD}). Curves below threshold = drug locked out.
              {pt.dex && " Dexamethasone ON \u2014 accelerated BBB closure (t_half=1.5d)."}
            </div>
          </StageCard>

          {/* STAGE 2: THE PATHOGEN */}
          <StageCard stage={2} current={stage} title="THE PATHOGEN" subtitle="M3-M4: Phenotype and reservoir geometry" accent="#a78bfa"
            onAdvance={() => setStage(3)} advanceLabel={"SHOW THE PARADOX \u2192"} onJumpTo={() => setStage(2)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Unlike MRSA bone or TB, meningitis bacteria are primarily planktonic {"\u2014"} free-floating in CSF.
              K_phenotype {"\u2248"} 0 for 90% of the population. The exception: ventricular shunt hardware, where
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
                  {(wasmResult?.niches ?? []).map((n, i) => {
                    const best = n.access < 0.3 ? "LZD/RIF" : "CRO";
                    return (
                      <tr key={n.name} style={{ borderBottom: "1px solid #0f1623", cursor: "pointer", background: xNiche === i ? "#0c0c1a" : "transparent" }}
                        onClick={() => setXNiche(xNiche === i ? null : i)}>
                        <td style={{ padding: "4px 6px", color: "#e2e8f0" }}>{n.name}</td>
                        <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{(n.weight * 100).toFixed(0)}%</td>
                        <td style={{ padding: "4px 6px", color: n.access >= 0.7 ? "#22c55e" : n.access >= 0.3 ? "#f59e0b" : "#ef4444" }}>{n.access}</td>
                        <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{n.k_niche.toFixed(3)}</td>
                        <td style={{ padding: "4px 6px", color: "#a78bfa", fontSize: 9 }}>{best}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <DataRow label="K_reservoir (weighted sum)" value={kRes.toFixed(3)} />
            <DataRow label="K_phenotype (current)" value={kPheno.toFixed(2)} color={kPheno > 1 ? "#ef4444" : undefined} />

            {pt.shunt && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 4, fontSize: 10, color: "#ef4444" }}>
                {"\u26D4"} VP SHUNT: biofilm on hardware. K_phenotype = 2.70. Monotherapy contraindicated. <Src text="Nau 2010" />
              </div>
            )}
          </StageCard>

          {/* STAGE 3: THE PARADOX */}
          <StageCard stage={3} current={stage} title="THE PARADOX" subtitle="Dexamethasone tradeoff \u2014 the therapeutic window" accent="#f59e0b"
            onAdvance={() => setStage(4)} advanceLabel={"GENERATE REPORT \u2192"} onJumpTo={() => setStage(3)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Dexamethasone reduces brain swelling and saves lives. It also accelerates BBB closure {"\u2014"} shrinking
              the window during which antibiotics can reach the brain. <Src text="de Gans NEJM 2002" />
            </div>

            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  {["Drug", "C(t=0)", "Fails (with Dex)", "Fails (no Dex)", "Window Lost"].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {drugData.filter(d => d.isSel).map(d => {
                    const windowLost = d.fDayNoDex >= 30 && d.fDay >= 30 ? "\u2014" :
                      d.fDayNoDex >= 30 ? `\u221E \u2192 ${d.fDay.toFixed(1)}d` :
                      `${((1 - d.fDay / d.fDayNoDex) * 100).toFixed(0)}%`;
                    const isX = xDex === d.name;
                    return (
                      <React.Fragment key={d.name}>
                        <tr style={{ borderBottom: "1px solid #0f1623", cursor: "pointer", background: isX ? "#0c0c1a" : "transparent" }}
                          onClick={() => setXDex(isX ? null : d.name)}>
                          <td style={{ padding: "4px 6px", color: d.color, fontWeight: 600 }}>{d.abbr}</td>
                          <td style={{ padding: "4px 6px", color: d.c0 >= THRESHOLD ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{d.c0.toFixed(2)}</td>
                          <td style={{ padding: "4px 6px", color: d.fDay < 3 ? "#ef4444" : d.fDay < 7 ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>Day {d.fDay >= 30 ? ">30" : d.fDay.toFixed(1)}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>Day {d.fDayNoDex >= 30 ? ">30" : d.fDayNoDex.toFixed(1)}</td>
                          <td style={{ padding: "4px 6px", color: "#f59e0b", fontWeight: 600 }}>{windowLost}</td>
                        </tr>
                        {isX && d.bd_t0 && (
                          <tr><td colSpan={5} style={{ padding: "8px 10px", background: "#080812" }}>
                            <div style={{ fontSize: 9, color: d.color, letterSpacing: 1, marginBottom: 6 }}>{d.name} {"\u2014"} FAILURE DERIVATION</div>
                            <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.8 }}>
                              <div>Drug fails when C(t) {"<"} {THRESHOLD}</div>
                              <div>K_path_fail = {"\u03C4"}/threshold = {d.tau.toFixed(2)}/{THRESHOLD} = <span style={{ fontWeight: 600 }}>{(d.tau / THRESHOLD).toFixed(2)}</span></div>
                              <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 4, marginTop: 4 }}>
                                Result: t_fail = <span style={{ color: d.fDay < 3 ? "#ef4444" : "#f59e0b", fontWeight: 700, fontSize: 11 }}>Day {d.fDay >= 30 ? ">30" : d.fDay.toFixed(2)}</span>
                                {d.fDayNoDex < 30 && d.fDayNoDex !== d.fDay && (
                                  <span style={{ color: "#475569" }}> (without Dex: Day {d.fDayNoDex.toFixed(2)})</span>
                                )}
                              </div>
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {drugData.filter(d => d.isSel && d.fDay < 30).length > 0 && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                {drugData.filter(d => d.isSel && d.fDay < 3).map(d => (
                  <div key={d.name} style={{ flex: "1 1 140px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #ef444433", padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 6 }}>{d.abbr} FAILS</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>Day {d.fDay.toFixed(1)}</div>
                    <div style={{ fontSize: 9, color: "#64748b" }}>BBB seals before sterilization</div>
                  </div>
                ))}
                {drugData.filter(d => d.isSel && d.fDay >= 30).slice(0, 1).map(d => (
                  <div key={d.name} style={{ flex: "1 1 140px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #22c55e33", padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>{d.abbr} SURVIVES</div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>&gt;30d</div>
                    <div style={{ fontSize: 9, color: "#64748b" }}>High baseline R sustains access</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: "10px 12px", background: "#1a1a0a", border: "1px solid #f59e0b33", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 4 }}>CLINICAL IMPLICATION</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                If Dexamethasone is administered, the geometric window collapses. Co-administration
                of a high-penetration adjunct (RIF: R_base=0.15, LZD: R_base=0.40) is geometrically necessary. <Src text="de Gans 2002; Nau 2010" />
              </div>
            </div>
          </StageCard>

          {/* STAGE 4: THE REPORT */}
          <StageCard stage={4} current={stage} title="THE REPORT" subtitle="Drug ranking, failure timeline, recommendations" accent="#14b8a6" onJumpTo={() => setStage(4)}>

            {/* COMBO HERO */}
            {wasmResult?.combo && (() => {
              const cc = wasmResult.combo;
              const pass0 = cc.c_t0 >= THRESHOLD;
              const pass14 = cc.c_t14 >= THRESHOLD;
              const allFail = activeDrugs.every(d => d.fDay < 14);
              return (
                <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 8, border: `2px solid ${pass0 ? "#14b8a6" : "#ef4444"}44`, background: pass0 ? "#14b8a611" : "#ef444411" }}>
                  <div style={{ fontSize: 9, color: pass0 ? "#14b8a6" : "#ef4444", letterSpacing: 3, marginBottom: 8 }}>COMBINATION THERAPY {"\u2014"} KIRCHHOFF PARALLEL CONDUCTANCE</div>
                  <div style={{ display: "flex", gap: 20, alignItems: "baseline", flexWrap: "wrap", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 9, color: "#64748b" }}>C_combo(t=0)</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: pass0 ? "#14b8a6" : "#ef4444" }}>{cc.c_t0.toFixed(3)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: "#64748b" }}>C_combo(t=14)</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: pass14 ? "#22c55e" : "#ef4444" }}>{cc.c_t14.toFixed(3)}</div>
                    </div>
                    <div style={{ flex: 1, textAlign: "right" }}>
                      <span style={{ fontSize: 11, padding: "4px 14px", borderRadius: 8, background: pass0 ? "#14b8a618" : "#ef444418", color: pass0 ? "#14b8a6" : "#ef4444", fontWeight: 700 }}>
                        {pass0 && pass14 ? "\u2713 ABOVE THRESHOLD THROUGH DAY 14" : pass0 ? "\u26A0 DROPS BELOW THRESHOLD" : "\u2717 BELOW THRESHOLD"}
                      </span>
                    </div>
                  </div>
                  {allFail && pass0 && (
                    <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6, borderTop: "1px solid #1a1a2e", paddingTop: 8 }}>
                      Every individual drug fails before Day 14, but the parallel conductance of the combination
                      sustains C_combo above threshold. <span style={{ color: "#14b8a6", fontWeight: 600 }}>Monotherapy is contraindicated {"\u2014"} combination is the treatment.</span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>DRUG SURVIVAL RANKING</div>
            {[...drugData].filter(d => d.isSel).sort((a, b) => b.fDay - a.fDay).map((d, i) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: i === 0 ? "#22c55e" : "#64748b", fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: d.color, fontWeight: 600 }}>{d.name} ({d.dose})</div>
                  <div style={{ fontSize: 8, color: "#475569" }}>
                    C(t=0)={d.c0.toFixed(2)} {"\u00b7"} Fails Day {d.fDay >= 30 ? ">30" : d.fDay.toFixed(1)} {"\u00b7"} R_base={d.rBase} {"\u00b7"} {"\u03C4"}={d.tau.toFixed(2)}
                  </div>
                </div>
                <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, background: d.fDay >= 30 ? "#22c55e15" : d.fDay >= 3 ? "#f59e0b15" : "#ef444415", color: d.fDay >= 30 ? "#22c55e" : d.fDay >= 3 ? "#f59e0b" : "#ef4444" }}>
                  {d.fDay >= 30 ? "SURVIVES" : d.fDay >= 3 ? "LIMITED" : "FAILS EARLY"}
                </span>
              </div>
            ))}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14, padding: "14px", background: "#0d0d1c", borderRadius: 8, border: "1px solid #1a1a2e" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b" }}>{tHalf.toFixed(1)}d</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>BBB half-life</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#ef4444" }}>{(drugData.find(d => d.name === "Ceftriaxone")?.fDay ?? 30) >= 30 ? ">30" : (drugData.find(d => d.name === "Ceftriaxone")?.fDay ?? 0).toFixed(1)}d</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>CRO failure day</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#14b8a6" }}>0</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>Fitted params</div>
              </div>
            </div>

            {/* DOWNLOAD BUTTONS */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={handleDownloadJSON} style={{
                flex: 1, padding: "10px 0", background: "#22c55e18", color: "#22c55e",
                border: "1px solid #22c55e44", borderRadius: 6, fontFamily: FONT, fontSize: 10,
                fontWeight: 700, letterSpacing: 2, cursor: "pointer",
              }}
                onMouseOver={e => e.currentTarget.style.background = "#22c55e28"}
                onMouseOut={e => e.currentTarget.style.background = "#22c55e18"}>
                {"\u2193"} JSON REPORT
              </button>
              <button onClick={handleDownloadPDF} style={{
                flex: 1, padding: "10px 0", background: "#3b82f618", color: "#3b82f6",
                border: "1px solid #3b82f644", borderRadius: 6, fontFamily: FONT, fontSize: 10,
                fontWeight: 700, letterSpacing: 2, cursor: "pointer",
              }}
                onMouseOver={e => e.currentTarget.style.background = "#3b82f628"}
                onMouseOut={e => e.currentTarget.style.background = "#3b82f618"}>
                {"\u2193"} PDF REPORT
              </button>
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #1a1a2e", textAlign: "center" }}>
              <div style={{ fontSize: 8, color: "#334155", letterSpacing: 2 }}>DAVIS LAB {"\u00b7"} DAVIS GEOMETRIC {"\u00b7"} BRANCH XI</div>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>The equation does not change. The barrier changes. The medicine follows.</div>
              <div style={{ fontSize: 11, color: "#1e293b", marginTop: 4, fontWeight: 700 }}>C = {"\u03C4"}/K(t)</div>
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
                  {isExp ? "\u2921 COLLAPSE" : "\u2922 EXPAND"}
                </button>
              </div>
              <SidebarContent stage={stage} drugData={drugData} activeDrugs={activeDrugs} wasmResult={wasmResult} expanded={isExp} FONT={FONT} />
            </div>
          );
        })()}

      </div>{/* end BODY */}
    </div>
  );
}
