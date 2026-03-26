import React, { useState, useMemo, useEffect, useRef } from "react";
// HivApp v3 — WASM dynamic import, no JS math functions
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

// ─── tiny UI primitives (identical to Keske/TB design system) ───────────────

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

// ─── Drug/reservoir/LRA databases (from validated Python, 10/10) ────────────

const DRUGS = [
  { key: "dtg", name: "Dolutegravir", abbr: "DTG", cls: "INSTI", ic50: 0.51, auc24: 126400, kAdmet: 0.05, dose: "50mg QD",
    pen: { CNS: 0.01, lymph: 0.48, GALT: 0.35, genital: 0.07, marrow: 0.40 },
    color: "#818cf8", refs: "Kobayashi 2011 · Song 2015 · Letendre 2014" },
  { key: "tfv", name: "Tenofovir-DF", abbr: "TFV", cls: "NRTI", ic50: 50.0, auc24: 7630, kAdmet: 0.15, dose: "300mg QD",
    pen: { CNS: 0.05, lymph: 0.33, GALT: 0.50, genital: 3.50, marrow: 0.30 },
    color: "#34d399", refs: "Balzarini 1996 · Kearney 2004 · Patterson 2011" },
  { key: "ftc", name: "Emtricitabine", abbr: "FTC", cls: "NRTI", ic50: 8.0, auc24: 40000, kAdmet: 0.05, dose: "200mg QD",
    pen: { CNS: 0.03, lymph: 0.40, GALT: 0.55, genital: 1.80, marrow: 0.35 },
    color: "#38bdf8", refs: "Schinazi 1992 · Wang 2004 · Hendrix 2013" },
  { key: "drv", name: "Darunavir", abbr: "DRV", cls: "PI", ic50: 1.2, auc24: 170000, kAdmet: 0.10, dose: "800mg QD+RTV",
    pen: { CNS: 0.05, lymph: 0.70, GALT: 0.45, genital: 0.15, marrow: 0.35 },
    color: "#fb923c", refs: "De Meyer 2005 · Sekar 2010 · Croteau 2012" },
  { key: "efv", name: "Efavirenz", abbr: "EFV", cls: "NNRTI", ic50: 1.0, auc24: 184000, kAdmet: 0.08, dose: "600mg QD",
    pen: { CNS: 0.005, lymph: 0.55, GALT: 0.40, genital: 0.02, marrow: 0.30 },
    color: "#f472b6", refs: "Young 1995 · Csajka 2003 · Tashima 1999" },
];

const RESERVOIRS = [
  { key: "CNS", label: "CNS", full: "Central Nervous System", frac: 0.02, icon: "🧠", src: "Schnell 2011" },
  { key: "lymph", label: "Lymph", full: "Lymph Nodes", frac: 0.15, icon: "🫁", src: "Banga 2016" },
  { key: "GALT", label: "GALT", full: "Gut-Associated Lymphoid Tissue", frac: 0.65, icon: "🔴", src: "Estes 2017" },
  { key: "genital", label: "Genital", full: "Genital Tract", frac: 0.08, icon: "🧬", src: "Coombs 2003" },
  { key: "marrow", label: "Marrow", full: "Bone Marrow", frac: 0.10, icon: "🦴", src: "McNamara 2013" },
];

const LRAS = [
  { name: "Vorinostat", phi: 0.005, src: "Archin 2012" },
  { name: "Romidepsin", phi: 0.008, src: "Sogaard 2015" },
  { name: "Panobinostat", phi: 0.003, src: "Rasmussen 2014" },
  { name: "AZD5153 (BET)", phi: 0.015, src: "Banerjee 2012" },
];

// ─── Name mappings: JS short keys → Rust canonical names ────────────────────

const RES_KEY_TO_RUST = { CNS: "CNS", lymph: "lymph_node", GALT: "GALT", genital: "genital_tract", marrow: "bone_marrow" };
const RUST_TO_RES_KEY = Object.fromEntries(Object.entries(RES_KEY_TO_RUST).map(([k, v]) => [v, k]));
const DRUG_NAME_MAP = { dtg: "Dolutegravir", tfv: "Tenofovir-DF", ftc: "Emtricitabine", drv: "Darunavir", efv: "Efavirenz" };

// ─── JS math shims (fallback while WASM warms up or if cache serves old code) ──
const tau = (d) => Math.log10(d.auc24 / d.ic50);
const kBarrier = (R) => R >= 1 ? -(R - 1) : (1 / R) - 1;
const kPathway = (d, r) => d.kAdmet + kBarrier(d.pen[r.key] || 0.3);
const cSite = (d, r) => tau(d) / kPathway(d, r);
const cComboActive = (drugs, r) => drugs.reduce((s, d) => s + Math.max(0, cSite(d, r)), 0);
const phiThreshold = (drugs, r) => { const cA = cComboActive(drugs, r); return cA > 0 ? 1 / cA : Infinity; };
const cWithLRA = (drugs, r, phi) => { const cA = cComboActive(drugs, r); const fActive = 1e-6; const fNew = fActive + phi * (1 - fActive); return fNew * cA; };

// ─── Sidebar content per stage ──────────────────────────────────────────────

function SidebarContent({ stage, activeDrugs, resData, lraIdx, clearOrder, sVal, mob, expanded, FONT, wTau, wd }) {
  const Divider = () => <div style={{ borderTop: "1px solid #1a1a2e", margin: "12px 0" }} />;
  const Explain = ({ children }) => <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.75, marginTop: 10 }}>{children}</div>;
  const MiniBar = ({ label, val, max, color, unit, note }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#64748b", marginBottom: 3 }}>
        <span style={{ fontFamily: FONT }}>{label}</span>
        <span style={{ color, fontWeight: 700 }}>{typeof val === "number" ? val.toFixed(2) : val}{unit ? ` ${unit}` : ""}</span>
      </div>
      <div style={{ height: 7, background: "#12121f", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(Math.abs(val) / max, 1) * 100}%`, background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
      {note && <div style={{ fontSize: 8, color: "#334155", marginTop: 2 }}>{note}</div>}
    </div>
  );

  // Stage 0: Patient — show τ bars for all drugs
  if (stage === 0) {
    const maxTau = Math.max(...DRUGS.map(d => wTau(DRUG_NAME_MAP[d.key])));
    return (<>
      <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 6 }}>τ VALUES — ALL DRUGS</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Pharmacophoric potential</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        τ = log₁₀(AUC₂₄/IC₅₀). Higher = more potent. Selected drugs highlighted.
      </div>
      {DRUGS.map(d => {
        const t = wTau(DRUG_NAME_MAP[d.key]); const isSel = activeDrugs.some(a => a.key === d.key);
        return (
          <div key={d.key} style={{ marginBottom: 8, opacity: isSel ? 1 : 0.4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 3 }}>
              <span style={{ color: isSel ? d.color : "#475569", fontFamily: FONT, fontWeight: isSel ? 700 : 400 }}>{d.abbr} ({d.cls})</span>
              <span style={{ color: d.color, fontFamily: FONT }}>τ={t.toFixed(2)}</span>
            </div>
            <div style={{ height: 7, background: "#12121f", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(t / maxTau) * 100}%`, background: d.color, borderRadius: 3, opacity: isSel ? 1 : 0.5, transition: "width 0.5s ease" }} />
            </div>
            <div style={{ fontSize: 8, color: "#334155", fontFamily: FONT }}>AUC={d.auc24.toLocaleString()} / IC₅₀={d.ic50} → {t.toFixed(4)}</div>
          </div>
        );
      })}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 6 }}>τ COMPUTATION</div>
        {activeDrugs.map(d => (
          <div key={d.key} style={{ fontSize: 9, color: "#64748b", marginBottom: 4, fontFamily: FONT }}>
            {d.abbr}: log₁₀({d.auc24.toLocaleString()}/{d.ic50}) = <span style={{ color: d.color, fontWeight: 600 }}>{wTau(DRUG_NAME_MAP[d.key]).toFixed(4)}</span>
          </div>
        ))}
      </>)}
      <Divider />
      <Explain>
        Antiretroviral drugs vary enormously in raw potency. Dolutegravir has τ=5.39 — meaning
        its daily blood exposure is nearly 250,000× its IC₅₀. Tenofovir-DF looks weakest here (τ=2.18)
        because it's a prodrug — its intracellular metabolite TFV-DP does the work, but systemic
        plasma levels are low. This doesn't mean it's a bad drug; it means the barrier layers matter more.
      </Explain>
    </>);
  }

  // Stage 1: Reservoirs — show C_active per reservoir
  if (stage === 1) {
    if (!resData?.length) return null;
    const maxC = Math.max(...resData.map(r => r.cA), 1);
    return (<>
      <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 6 }}>C_COMBO_ACTIVE PER RESERVOIR</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Where the drugs reach</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        C above 1.0 (yellow line) = drugs suppress active virus. Below = drugs can't reach.
      </div>
      {resData.map(r => (
        <MiniBar key={r.key} label={`${r.icon} ${r.label}`} val={r.cA} max={maxC} color={r.cA >= 1 ? "#22c55e" : "#ef4444"}
          note={`${r.frac * 100}% of pool · ${r.bottleneck}`} />
      ))}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 8 }}>PER-DRUG C_SITE AT EACH RESERVOIR</div>
        {resData.map(r => (
          <div key={r.key} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600, marginBottom: 3 }}>{r.icon} {r.label}</div>
            {r.drugRank.map(dr => (
              <div key={dr.abbr} style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#475569", marginLeft: 12, borderBottom: "1px solid #0f1623", padding: "1px 0" }}>
                <span style={{ color: dr.color }}>{dr.abbr}</span>
                <span>R={dr.R < 0.1 ? dr.R.toFixed(3) : dr.R.toFixed(2)} K={dr.kB.toFixed(1)} <span style={{ color: dr.c >= 1 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>C={dr.c.toFixed(3)}</span></span>
              </div>
            ))}
          </div>
        ))}
      </>)}
      <Divider />
      <Explain>
        HIV hides in five anatomical sanctuaries. Each has a different physical barrier between the
        bloodstream and the virus. GALT holds 65% of the latent reservoir. CNS is the hardest to reach
        because the blood-brain barrier blocks almost everything. The genital tract is the one place
        Tenofovir actually concentrates — R=3.5 means the tissue has 3.5× more drug than plasma.
        That's the geometric basis of PrEP.
      </Explain>
    </>);
  }

  // Stage 2: Barriers — heatmap detail
  if (stage === 2) {
    return (<>
      <div style={{ fontSize: 9, color: "#a855f7", letterSpacing: 2, marginBottom: 6 }}>K_BARRIER DETAIL</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Drug × Reservoir breakdown</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        K = 1/R − 1. Higher K = harder barrier. Negative K = drug concentrates.
      </div>
      {activeDrugs.map(d => (
        <div key={d.key} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 9, color: d.color, fontWeight: 700, marginBottom: 4 }}>{d.abbr} ({d.cls})</div>
          {RESERVOIRS.map(r => {
            const R = d.pen[r.key] || 0.3;
            const detail = wd(d.name, r.key);
            const kB = detail.k_barrier;
            const c = detail.c_site;
            return (
              <div key={r.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: "#475569", borderBottom: "1px solid #0f1623", padding: "2px 0" }}>
                <span>{r.icon} {r.label}</span>
                <span>R={R < 0.1 ? R.toFixed(3) : R.toFixed(2)} → K={kB < 0 ? kB.toFixed(2) : kB.toFixed(1)} → <span style={{ color: c >= 1 ? "#22c55e" : c > 0.1 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>C={c.toFixed(3)}</span></span>
              </div>
            );
          })}
        </div>
      ))}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#a855f7", letterSpacing: 2, marginBottom: 6 }}>CNS PENETRATION COMPARISON</div>
        {activeDrugs.map(d => {
          const R = d.pen.CNS || 0.3;
          return <MiniBar key={d.key} label={d.abbr} val={R * 100} max={10} color={d.color} unit="%" note={`R=${R} → only ${(R * 100).toFixed(1)}% reaches brain`} />;
        })}
      </>)}
      <Divider />
      <Explain>
        The blood-brain barrier is the most formidable obstacle. Every drug in the standard arsenal
        has R ≤ 0.05 at the CNS — meaning 95%+ of the drug never crosses. Even Darunavir, the best
        CNS penetrator, only gets 5% through. This is why CSF viral escape happens in 5-10% of patients
        on otherwise suppressive therapy. The math predicts it before the clinic sees it.
      </Explain>
    </>);
  }

  // Stage 3: Cure gap — Φ detail
  if (stage === 3) {
    const bestPhi = lraIdx !== null ? LRAS[lraIdx].phi : 0.015;
    return (<>
      <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 6 }}>CURE CONDITION</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>(f_active + Φ × f_latent) × C_active ≥ 1.0</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        Two conditions must hold simultaneously: drugs must reach the reservoir (C_active ≥ 1) AND
        enough latent virus must be reactivated (Φ ≥ threshold).
      </div>
      {resData.map(r => {
        const needed = r.phiNeeded;
        const gap = needed > 0 ? bestPhi / needed : Infinity;
        return (
          <div key={r.key} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
              <span style={{ color: "#64748b" }}>{r.icon} {r.label}</span>
              <span style={{ color: r.bottleneck === "Cleared" ? "#22c55e" : r.bottleneck === "Geometric" ? "#ef4444" : "#f59e0b", fontWeight: 600, fontSize: 8 }}>{r.bottleneck}</span>
            </div>
            <div style={{ fontSize: 8, color: "#475569", fontFamily: FONT }}>
              C_active={r.cA.toFixed(2)} · Φ_need={needed > 10 ? ">1.0" : needed.toFixed(4)} · have={bestPhi} · {gap >= 1 ? "✓" : `gap ${(1 / gap).toFixed(0)}×`}
            </div>
          </div>
        );
      })}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 2, marginBottom: 8 }}>WITH vs WITHOUT LRA</div>
        {resData.map(r => {
          const cNoLRA = r.cTotal;
          const cLRA = lraIdx !== null ? r.cWithLra : cNoLRA;
          return (
            <div key={r.key} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
              <div style={{ flex: 1, padding: "4px 8px", background: "#12121f", borderRadius: 4, fontSize: 8, textAlign: "center" }}>
                <div style={{ color: "#64748b" }}>No LRA</div>
                <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 10 }}>{cNoLRA.toExponential(1)}</div>
              </div>
              <div style={{ flex: 1, padding: "4px 8px", background: "#12121f", borderRadius: 4, fontSize: 8, textAlign: "center" }}>
                <div style={{ color: "#64748b" }}>With LRA</div>
                <div style={{ color: cLRA >= 1 ? "#22c55e" : "#f59e0b", fontWeight: 700, fontSize: 10 }}>{cLRA < 0.001 ? cLRA.toExponential(1) : cLRA.toFixed(3)}</div>
              </div>
            </div>
          );
        })}
      </>)}
      <Divider />
      <Explain>
        ART alone misses by five orders of magnitude. The latent fraction (10⁻⁶) multiplied by even
        the best combination coherence gives a number far below the cure threshold. LRAs help — they
        wake sleeping virus up so drugs can hit it — but current LRAs only reactivate 0.3-1.5% of latent cells.
        The genital tract needs only 0.17%, so it's already clearable. GALT needs 11.1%, which is 7× beyond
        what we have. That 7× gap is the distance to a functional cure.
      </Explain>
    </>);
  }

  // Stage 4: Report — clearance + summary
  if (stage === 4) {
    return (<>
      <div style={{ fontSize: 9, color: "#14b8a6", letterSpacing: 2, marginBottom: 6 }}>CLEARANCE ANALYSIS</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 }}>Which reservoir clears first?</div>
      <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.6, marginBottom: 10 }}>
        Score = C_active / latent_fraction. Higher = clears faster.
      </div>
      {clearOrder.map((name, i) => {
        const r = resData.find(x => x.label === name);
        if (!r) return null;
        const score = r.cA / Math.max(r.frac, 0.001);
        return (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: i === 0 ? "#22c55e" : i === clearOrder.length - 1 ? "#ef4444" : "#64748b", fontWeight: 700, minWidth: 20 }}>#{i + 1}</span>
            <span style={{ fontSize: 14 }}>{r.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: "#e2e8f0", fontWeight: 600 }}>{name}</div>
              <div style={{ fontSize: 8, color: "#475569" }}>C={r.cA.toFixed(2)} / {r.frac} = score {score.toFixed(1)}</div>
            </div>
          </div>
        );
      })}
      {expanded && (<>
        <Divider />
        <div style={{ fontSize: 9, color: "#14b8a6", letterSpacing: 2, marginBottom: 8 }}>NOVEL PREDICTIONS</div>
        {[
          { t: "Genital tract curable now", c: "#22c55e" },
          { t: "CSF escape is geometric", c: "#ef4444" },
          { t: "Φ gap at GALT: 7×", c: "#f59e0b" },
          { t: "DRV dominates CNS", c: "#a855f7" },
          { t: "GALT clears last", c: "#3b82f6" },
        ].map((p, i) => (
          <div key={i} style={{ fontSize: 9, color: p.c, marginBottom: 4, paddingLeft: 8, borderLeft: `2px solid ${p.c}44` }}>{p.t}</div>
        ))}
      </>)}
      <Divider />
      <Explain>
        The clearance order tells a story: genital tract first (TFV concentrates there),
        bone marrow and lymph nodes next (decent penetration, moderate viral pool), then CNS
        (terrible penetration) and finally GALT (decent penetration but 65% of all latent virus).
        The bottleneck is mass, not access. GALT clears last not because drugs can't reach it,
        but because there's so much virus hiding there.
      </Explain>
    </>);
  }
  return null;
}

// ─── MAIN ───────────────────────────────────────────────────────────────────

export default function HivApp() {
  // ── WASM init ──
  const [wasmReady, setWasmReady] = useState(false);
  const [wasmResult, setWasmResult] = useState(null);
  const wasmRef = useRef(null); // holds { init, compute_hiv }
  useEffect(() => {
    import('./mirador_hiv/mirador_hiv_wasm.js').then(mod => {
      wasmRef.current = mod;
      return mod.default('/mirador_hiv/mirador_hiv_wasm_bg.wasm');
    }).then(() => setWasmReady(true))
      .catch(e => console.error('HIV WASM init failed:', e));
  }, []);

  const mob = useIsMobile();
  const [stage, setStage] = useState(0);
  const [sel, setSel] = useState([0, 1, 2]); // DTG, TFV, FTC
  const [lraIdx, setLraIdx] = useState(null);
  const [vizExpanded, setVizExpanded] = useState(null);
  const [pt, setPt] = useState({ cd4: 450, vl: "<20", artYears: 5, weight: 72, creatinine: 0.9, egfr: 0 });
  const [xDrug, setXDrug] = useState(null);     // expanded drug key in Stage 0
  const [xRes, setXRes] = useState(null);        // expanded reservoir key in Stage 1
  const [xCell, setXCell] = useState(null);      // "DTG:CNS" in Stage 2
  const [xPhi, setXPhi] = useState(null);        // expanded reservoir key in Stage 3
  const [xPred, setXPred] = useState(null);      // expanded prediction index in Stage 4
  const updatePt = (k, v) => setPt(p => ({ ...p, [k]: v }));

  const activeDrugs = useMemo(() => sel.map(i => DRUGS[i]), [sel]);
  const toggleDrug = i => setSel(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);

  // ── Call WASM once on init with ALL drugs to get display tau values ──
  const [allTaus, setAllTaus] = useState({});
  useEffect(() => {
    if (!wasmReady) return;
    const allNames = DRUGS.map(d => DRUG_NAME_MAP[d.key]);
    try {
      const raw = wasmRef.current.compute_hiv(JSON.stringify({ drugs: allNames }));
      const r = JSON.parse(raw);
      if (!r.error) {
        const map = {};
        r.drugs.forEach(d => { map[d.name] = d.tau; });
        setAllTaus(map);
      }
    } catch (e) { console.error('WASM allTaus init failed:', e); }
  }, [wasmReady]);

  // ── Call WASM whenever active drugs or LRA change ──
  useEffect(() => {
    if (!wasmReady) return;
    const drugNames = activeDrugs.map(d => DRUG_NAME_MAP[d.key]);
    if (!drugNames.length) { setWasmResult(null); return; }
    const params = JSON.stringify({
      drugs: drugNames,
      lra: lraIdx !== null ? LRAS[lraIdx].name : null,
      synergy: 1.0,
      cure_threshold: 1.0,
    });
    try {
      const raw = wasmRef.current.compute_hiv(params);
      const result = JSON.parse(raw);
      if (result.error) { console.error('WASM compute_hiv error:', result.error); setWasmResult(null); }
      else { setWasmResult(result); }
    } catch (e) { console.error('WASM call failed:', e); setWasmResult(null); }
  }, [wasmReady, activeDrugs, lraIdx]);

  // ── Helper: look up per-drug-per-reservoir from WASM result ──
  const wd = (drugName, resKey) => {
    if (!wasmResult) return { k_barrier: 0, k_pathway: 0, tau: 0, c_site: 0 };
    const rustRes = RES_KEY_TO_RUST[resKey] || resKey;
    const pr = wasmResult.per_reservoir[rustRes];
    if (!pr) return { k_barrier: 0, k_pathway: 0, tau: 0, c_site: 0 };
    return pr.per_drug[drugName] || { k_barrier: 0, k_pathway: 0, tau: 0, c_site: 0 };
  };
  // ── Helper: look up drug tau (active drugs from wasmResult, all from allTaus) ──
  const wTau = (drugName) => {
    if (wasmResult) {
      const ds = wasmResult.drugs.find(d => d.name === drugName);
      if (ds) return ds.tau;
    }
    return allTaus[drugName] || 0;
  };
  // ── Helper: reservoir-level values ──
  const wr = (resKey) => {
    if (!wasmResult) return { c_combo_active: 0, c_with_lra: 0, phi_needed: Infinity, bottleneck: "geometric" };
    const rustRes = RES_KEY_TO_RUST[resKey] || resKey;
    return wasmResult.per_reservoir[rustRes] || { c_combo_active: 0, c_with_lra: 0, phi_needed: Infinity, bottleneck: "geometric" };
  };

  // ── Derive resData from WASM output ──
  const resData = useMemo(() => {
    if (!wasmResult || !activeDrugs.length) return RESERVOIRS.map(r => ({ ...r, cA: 0, cTotal: 0, phiNeeded: Infinity, drugRank: [], bottleneck: "Geometric", cWithLra: 0 }));
    return RESERVOIRS.map(r => {
      const rv = wr(r.key);
      const cA = rv.c_combo_active;
      const cTotal = 1e-6 * cA;
      const phiN = rv.phi_needed;
      const drugRank = activeDrugs.map(d => {
        const detail = wd(d.name, r.key);
        return { abbr: d.abbr, color: d.color, R: d.pen[r.key] || 0.3, kB: detail.k_barrier, c: detail.c_site };
      }).sort((a, b) => b.c - a.c);
      let bn = rv.bottleneck === "cleared" ? "Cleared" : rv.bottleneck === "dynamic" ? "Dynamic" : "Geometric";
      const cWithLra = rv.c_with_lra;
      return { ...r, cA, cTotal, phiNeeded: phiN, drugRank, bottleneck: bn, cWithLra };
    });
  }, [wasmResult, activeDrugs, lraIdx]);

  const sVal = useMemo(() => {
    const n = resData.filter(r => r.cA >= 1).length;
    return n / resData.length;
  }, [resData]);

  const clearOrder = useMemo(() => {
    if (wasmResult && wasmResult.clearance_order) {
      return wasmResult.clearance_order.map(rustName => {
        const jsKey = RUST_TO_RES_KEY[rustName] || rustName;
        const res = RESERVOIRS.find(r => r.key === jsKey);
        return res ? res.label : rustName;
      });
    }
    return [...resData].map(r => ({ name: r.label, score: r.cA / Math.max(r.frac, 0.001) }))
      .sort((a, b) => b.score - a.score).map(r => r.name);
  }, [wasmResult, resData]);

  const galt = resData.find(r => r.key === "GALT");
  const shortfall = galt && galt.cTotal > 0 ? 1 / galt.cTotal : Infinity;

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
          <div style={{ fontSize: mob ? 13 : 16, fontWeight: 700, letterSpacing: 3, color: "#e2e8f0" }}>HIV RESERVOIR</div>
          <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>LATENT RESERVOIR · PHARMACOLOGY</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 10, color: "#475569" }}>STAGE {stage + 1} / 5</div>
          {stage > 0 && <button onClick={() => setStage(0)} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>RESTART</button>}
        </div>
      </div>

      {/* DEDICATION */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "20px 16px 0" }}>
        <div style={{ padding: "16px 20px", background: "#09090f", borderRadius: 8, borderLeft: "3px solid #ef4444", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#ef4444", letterSpacing: 3, marginBottom: 8, fontFamily: FONT }}>DEDICATION</div>
          <div style={{ fontSize: 15, color: "#e2e8f0", fontWeight: 500, marginBottom: 6 }}>For the community. For the cure.</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.8 }}>
            Every person living with HIV takes antiretroviral therapy every day. Those drugs work — they suppress
            the virus to undetectable. But they cannot cure. This tool computes exactly why, and how far we are
            from closing the gap. Same equation. Same framework. Disease instance number four.
          </div>
          <div style={{ fontSize: 10, color: "#64748b", marginTop: 10, fontStyle: "italic" }}>C = τ/K</div>
        </div>
      </div>

      {/* TITLE CARD */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "8px 16px 4px" }}>
        <div style={{ padding: "12px 16px", background: "#0c0c1a", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.7 }}>
            Standard ART suppresses HIV but cannot clear latent reservoirs. <span style={{ color: "#e2e8f0" }}>MIRADOR HIV</span> extends
            C = τ/K across five anatomical sanctuaries with a catalytic LRA modification — computing
            which reservoirs are penetration-limited, which are reactivation-limited, and which are already
            clearable with existing technology. Zero fitted parameters. 10/10 validated.
          </div>
        </div>
      </div>

      {/* BODY: two-column */}
      <div style={{ display: "flex", flexDirection: mob ? "column" : "row", alignItems: "flex-start", maxWidth: 1200, margin: "0 auto", padding: mob ? "0 12px 32px" : "0 16px 32px", gap: 16 }}>

        {/* LEFT: stages */}
        <div style={{ flex: mob ? "1 1 100%" : (vizExpanded !== null ? "1 1 340px" : "1 1 520px"), minWidth: 0, width: "100%", transition: "flex 0.35s ease" }}>

          {/* ══ STAGE 0: THE PATIENT ══ */}
          <StageCard stage={0} current={stage} title="THE PATIENT" subtitle="ART regimen and clinical profile" accent="#ef4444"
            onAdvance={activeDrugs.length >= 2 ? () => setStage(1) : null} advanceLabel="MAP THE RESERVOIRS →" onJumpTo={() => setStage(0)}>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              CLINICAL PROFILE <span style={{ color: "#ef4444", fontSize: 9, letterSpacing: 0 }}>editable</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 16, rowGap: 8, alignItems: "center", marginBottom: 14 }}>
              <span style={{ color: "#64748b", fontSize: 10 }}>CD4</span>
              <FieldCtrl value={pt.cd4} onChange={v => updatePt("cd4", v)} unit="cells/µL" color={pt.cd4 < 200 ? "#ef4444" : pt.cd4 < 350 ? "#f59e0b" : undefined} />
              <span style={{ color: "#64748b", fontSize: 10 }}>Viral load</span>
              <FieldCtrl value={pt.vl} onChange={v => updatePt("vl", v)} unit="copies/mL" />
              <span style={{ color: "#64748b", fontSize: 10 }}>Years on ART</span>
              <FieldCtrl value={pt.artYears} onChange={v => updatePt("artYears", v)} unit="yr" />
              <span style={{ color: "#64748b", fontSize: 10 }}>Weight</span>
              <FieldCtrl value={pt.weight} onChange={v => updatePt("weight", v)} unit="kg" />
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              SELECT REGIMEN <span style={{ color: "#ef4444", fontSize: 9, letterSpacing: 0 }}>≥2 drugs</span>
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
                  {d.abbr} <span style={{ fontSize: 7, color: "#475569" }}>{d.cls}</span>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>ACTIVE REGIMEN <span style={{ color: "#ef4444", fontSize: 9, letterSpacing: 0 }}>tap for details</span></div>
            {activeDrugs.map(d => {
              const isX = xDrug === d.key;
              const t = wTau(d.name);
              return (
                <div key={d.key}>
                  <div onClick={() => setXDrug(isX ? null : d.key)} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", borderBottom: "1px solid #0f1623", fontSize: 10, cursor: "pointer" }}>
                    <span style={{ color: d.color, fontWeight: 600 }}>{d.name} <span style={{ color: "#475569", fontWeight: 400 }}>{d.dose}</span></span>
                    <span style={{ color: d.color }}>τ={t.toFixed(2)} <span style={{ fontSize: 8, color: "#334155", transition: "transform 0.2s", display: "inline-block", transform: isX ? "rotate(90deg)" : "rotate(0)" }}>▶</span></span>
                  </div>
                  {isX && (
                    <div style={{ background: "#080812", borderRadius: 6, padding: "8px 10px", margin: "4px 0 8px 0", border: `1px solid ${d.color}22` }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 9, marginBottom: 6 }}>
                        <span style={{ color: "#64748b" }}>IC₅₀</span><span style={{ color: "#94a3b8" }}>{d.ic50} nM</span>
                        <span style={{ color: "#64748b" }}>AUC₂₄</span><span style={{ color: "#94a3b8" }}>{d.auc24.toLocaleString()} nM·hr</span>
                        <span style={{ color: "#64748b" }}>K_admet</span><span style={{ color: "#94a3b8" }}>{d.kAdmet}</span>
                        <span style={{ color: "#64748b" }}>Class</span><span style={{ color: d.color }}>{d.cls}</span>
                      </div>
                      <div style={{ fontSize: 8, color: "#475569", borderTop: "1px solid #1a1a2e", paddingTop: 4, fontFamily: FONT }}>
                        τ = log₁₀({d.auc24.toLocaleString()}/{d.ic50}) = {t.toFixed(4)}
                      </div>
                      <div style={{ fontSize: 8, color: "#64748b", marginTop: 6 }}>PENETRATION RATIOS</div>
                      {RESERVOIRS.map(r => {
                        const R = d.pen[r.key] || 0.3;
                        const kB = wd(d.name, r.key).k_barrier;
                        return (
                          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                            <span style={{ fontSize: 8, color: "#475569", width: 44 }}>{r.label}</span>
                            <div style={{ flex: 1, height: 4, background: "#12121f", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.min(R / 4, 1) * 100}%`, background: R > 1 ? "#22c55e66" : `${d.color}66`, borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 7, color: R > 1 ? "#22c55e" : "#94a3b8", minWidth: 28 }}>R={R < 0.1 ? R.toFixed(3) : R.toFixed(2)}</span>
                            <span style={{ fontSize: 7, color: kB < 0 ? "#22c55e" : kB > 50 ? "#ef4444" : "#64748b", minWidth: 30 }}>K={kB.toFixed(1)}</span>
                          </div>
                        );
                      })}
                      <div style={{ fontSize: 7, color: "#334155", marginTop: 4 }}>{d.refs}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {activeDrugs.length < 2 && <div style={{ marginTop: 8, fontSize: 10, color: "#ef4444" }}>Select at least 2 drugs to proceed</div>}
          </StageCard>

          {/* ══ STAGE 1: THE RESERVOIRS ══ */}
          <StageCard stage={1} current={stage} title="THE RESERVOIRS" subtitle="Five anatomical sanctuaries where HIV hides" accent="#3b82f6"
            onAdvance={() => setStage(2)} advanceLabel="SHOW THE BARRIERS →" onJumpTo={() => setStage(1)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              Even after adequate suppression, HIV persists in five anatomical compartments. Each reservoir
              has a different barrier profile. The latent fraction shows how much of the total viral pool
              hides in each location. <Src text="Estes 2017; Schnell 2011" />
            </div>

            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  {["Reservoir", "Pool %", "C_active", "Bottleneck", "Source"].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {resData.map(r => {
                    const isX = xRes === r.key;
                    return (
                      <React.Fragment key={r.key}>
                        <tr style={{ borderBottom: "1px solid #0f1623", cursor: "pointer", background: isX ? "#0c0c1a" : "transparent" }} onClick={() => setXRes(isX ? null : r.key)}>
                          <td style={{ padding: "4px 6px", color: "#e2e8f0" }}>{r.icon} {r.label} <span style={{ fontSize: 7, color: "#334155" }}>{isX ? "▼" : "▶"}</span></td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{(r.frac * 100).toFixed(0)}%</td>
                          <td style={{ padding: "4px 6px", color: r.cA >= 1 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{r.cA.toFixed(2)}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 8, background: r.bottleneck === "Cleared" ? "#22c55e15" : r.bottleneck === "Dynamic" ? "#f59e0b15" : "#ef444415", color: r.bottleneck === "Cleared" ? "#22c55e" : r.bottleneck === "Dynamic" ? "#f59e0b" : "#ef4444" }}>{r.bottleneck}</span>
                          </td>
                          <td style={{ padding: "4px 6px", color: "#334155", fontSize: 8 }}>{r.src}</td>
                        </tr>
                        {isX && (
                          <tr><td colSpan={5} style={{ padding: "6px 8px", background: "#080812" }}>
                            <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 1, marginBottom: 4 }}>DRUG RANKING — {r.full}</div>
                            {r.drugRank.map(dr => {
                              const drug = activeDrugs.find(x => x.abbr === dr.abbr);
                              const kTotal = drug ? drug.kAdmet + dr.kB : dr.kB;
                              return (
                                <div key={dr.abbr} style={{ marginBottom: 4 }}>
                                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, marginBottom: 2 }}>
                                    <span style={{ color: dr.color, fontWeight: 600 }}>{dr.abbr}</span>
                                    <span style={{ color: dr.c >= 1 ? "#22c55e" : "#ef4444" }}>C={dr.c.toFixed(3)}</span>
                                  </div>
                                  <div style={{ height: 4, background: "#12121f", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${Math.min(dr.c / Math.max(...r.drugRank.map(x => x.c), 1), 1) * 100}%`, background: dr.color, borderRadius: 2 }} />
                                  </div>
                                  <div style={{ fontSize: 7, color: "#475569", fontFamily: FONT }}>
                                    R={dr.R < 0.1 ? dr.R.toFixed(3) : dr.R.toFixed(2)} → K_barrier={dr.kB.toFixed(1)} → K_path={kTotal.toFixed(2)} → C=τ/K={dr.c.toFixed(3)}
                                  </div>
                                </div>
                              );
                            })}
                            <div style={{ fontSize: 7, color: "#334155", marginTop: 4 }}>Yellow = cure threshold (C ≥ 1.0)</div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #ef444433", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 6 }}>CNS (HARDEST)</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{resData.find(r => r.key === "CNS")?.cA.toFixed(2)}</div>
                <div style={{ fontSize: 9, color: "#64748b" }}>C_active &lt; 1.0 — geometric block</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", fontSize: 20, color: "#475569" }}>vs</div>
              <div style={{ flex: "1 1 160px", background: "#0d0d1c", borderRadius: 6, border: "1px solid #22c55e33", padding: "10px 12px" }}>
                <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 6 }}>GENITAL (EASIEST)</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{resData.find(r => r.key === "genital")?.cA.toFixed(1)}</div>
                <div style={{ fontSize: 9, color: "#64748b" }}>TFV concentrates at R=3.5</div>
              </div>
            </div>
          </StageCard>

          {/* ══ STAGE 2: THE BARRIERS ══ */}
          <StageCard stage={2} current={stage} title="THE BARRIERS" subtitle="K_barrier heatmap — tissue:plasma ratios" accent="#a855f7"
            onAdvance={() => setStage(3)} advanceLabel="SHOW THE CURE GAP →" onJumpTo={() => setStage(2)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              K_barrier = (1/R) − 1 where R is the tissue:plasma concentration ratio. Higher K = less drug
              reaches the site. R &gt; 1 means the drug concentrates (negative K). <Src text="Letendre 2014; Fletcher 2014; Patterson 2011" />
            </div>

            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  <th style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>Drug</th>
                  {RESERVOIRS.map(r => <th key={r.key} style={{ textAlign: "center", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{r.icon} {r.label}</th>)}
                </tr></thead>
                <tbody>
                  {activeDrugs.map(d => (
                    <tr key={d.key} style={{ borderBottom: "1px solid #0f1623" }}>
                      <td style={{ padding: "4px 6px", color: d.color, fontWeight: 600 }}>{d.abbr}</td>
                      {RESERVOIRS.map(r => {
                        const R = d.pen[r.key] || 0.3;
                        const kB = wd(d.name, r.key).k_barrier;
                        const isConc = R > 1;
                        const cellKey = `${d.abbr}:${r.key}`;
                        return (
                          <td key={r.key} onClick={() => setXCell(xCell === cellKey ? null : cellKey)}
                            style={{ padding: "4px 6px", textAlign: "center", cursor: "pointer",
                              color: isConc ? "#22c55e" : kB > 50 ? "#ef4444" : kB > 5 ? "#f59e0b" : "#94a3b8", fontWeight: 600,
                              background: xCell === cellKey ? "#12121f" : "transparent",
                            }}>
                            {kB < 0 ? kB.toFixed(2) : kB.toFixed(1)}
                            <div style={{ fontSize: 7, color: "#334155", fontWeight: 400 }}>R={R < 0.1 ? R.toFixed(3) : R.toFixed(2)}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Drilldown for tapped barrier cell */}
            {xCell && (() => {
              const [abbr, rKey] = xCell.split(":");
              const drug = activeDrugs.find(d => d.abbr === abbr);
              const res = RESERVOIRS.find(r => r.key === rKey);
              if (!drug || !res) return null;
              const R = drug.pen[rKey] || 0.3;
              const detail = wd(drug.name, rKey);
              const kB = detail.k_barrier;
              const t = wTau(drug.name);
              const kTotal = detail.k_pathway;
              const c = detail.c_site;
              return (
                <div style={{ background: "#080812", borderRadius: 8, padding: "10px 12px", marginBottom: 10, border: `1px solid ${drug.color}22` }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: drug.color, marginBottom: 6 }}>{drug.abbr} → {res.label}: Full Pathway</div>
                  <div style={{ fontSize: 9, color: "#94a3b8", lineHeight: 1.8 }}>
                    <div>R (tissue:plasma) = <span style={{ color: R > 1 ? "#22c55e" : R < 0.05 ? "#ef4444" : "#e2e8f0", fontWeight: 600 }}>{R}</span></div>
                    <div>K_barrier = max(1/R − 1, −1) = <span style={{ color: kB < 0 ? "#22c55e" : kB > 50 ? "#ef4444" : "#e2e8f0", fontWeight: 600 }}>{kB.toFixed(2)}</span></div>
                    <div>K_admet = {drug.kAdmet}</div>
                    <div>K_phenotype (active) = 0.0</div>
                    <div style={{ borderTop: "1px solid #1a1a2e", paddingTop: 4, marginTop: 4 }}>
                      K_pathway = {drug.kAdmet} + {kB.toFixed(2)} + 0 = <span style={{ fontWeight: 600, color: "#e2e8f0" }}>{kTotal.toFixed(2)}</span>
                    </div>
                    <div>C = τ/K = {t.toFixed(2)} / {kTotal.toFixed(2)} = <span style={{ color: c >= 1 ? "#22c55e" : "#ef4444", fontWeight: 700, fontSize: 11 }}>{c.toFixed(3)}</span></div>
                  </div>
                </div>
              );
            })()}

            <div style={{ padding: "10px 12px", background: "#1a0a0a", border: "1px solid #ef444433", borderRadius: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 4 }}>GEOMETRIC BLOCK: CNS</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                All drugs have R ≤ 0.05 at CNS. C_combo_active = {resData.find(r => r.key === "CNS")?.cA.toFixed(2)} — below threshold even for active virus.
                This predicts CSF viral escape, confirmed in 5-10% of patients. <Src text="Canestri 2010; Peluso 2012" />
              </div>
            </div>
            <div style={{ padding: "10px 12px", background: "#0a1a0f", border: "1px solid #22c55e33", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 4 }}>CONCENTRATING DRUG: TFV → GENITAL</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                Tenofovir R = 3.5 at genital tract → K_barrier = −0.71 (negative = drug accumulates).
                This is the geometric basis of PrEP. <Src text="Patterson 2011; Grant 2010 iPrEx" />
              </div>
            </div>
          </StageCard>

          {/* ══ STAGE 3: THE CURE GAP ══ */}
          <StageCard stage={3} current={stage} title="THE CURE GAP" subtitle="Φ thresholds, LRA selection, and the Double Cover" accent="#f59e0b"
            onAdvance={() => setStage(4)} advanceLabel="GENERATE REPORT →" onJumpTo={() => setStage(3)}>

            <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
              ART cannot cure because latent provirus has no replication machinery for drugs to target.
              K_phenotype_latent = 6.0 (10⁶× effective resistance). LRAs don't kill virus — they catalytically
              convert latent → active, enabling ARVs to work. <Src text="Deeks 2012; Siliciano 2003" />
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>
              LATENCY-REVERSING AGENT <span style={{ color: "#f59e0b", fontSize: 9, letterSpacing: 0 }}>optional</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              <button onClick={() => setLraIdx(null)} style={{ padding: "4px 10px", borderRadius: 14, fontFamily: FONT, fontSize: 8, cursor: "pointer", background: lraIdx === null ? "#f59e0b15" : "transparent", border: `1px solid ${lraIdx === null ? "#f59e0b44" : "#1e293b"}`, color: lraIdx === null ? "#f59e0b" : "#475569" }}>None</button>
              {LRAS.map((l, i) => (
                <button key={l.name} onClick={() => setLraIdx(i)} style={{ padding: "4px 10px", borderRadius: 14, fontFamily: FONT, fontSize: 8, cursor: "pointer", background: lraIdx === i ? "#f59e0b15" : "transparent", border: `1px solid ${lraIdx === i ? "#f59e0b44" : "#1e293b"}`, color: lraIdx === i ? "#f59e0b" : "#475569" }}>
                  {l.name} (Φ={l.phi}) <Src text={l.src} />
                </button>
              ))}
            </div>

            <div style={{ overflowX: "auto", marginBottom: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead><tr style={{ borderBottom: "1px solid #1a1a2e" }}>
                  {["Reservoir", "C_active", "Φ needed", "Best Φ", "Gap", "Status"].map(h => (
                    <th key={h} style={{ textAlign: "left", color: "#475569", padding: "4px 6px", fontWeight: 400 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {resData.map(r => {
                    const bestPhi = lraIdx !== null ? LRAS[lraIdx].phi : 0.015;
                    const gap = r.phiNeeded > 0 ? (r.phiNeeded / bestPhi).toFixed(0) : "—";
                    const isX = xPhi === r.key;
                    const cLRA = lraIdx !== null ? r.cWithLra : null;
                    return (
                      <React.Fragment key={r.key}>
                        <tr style={{ borderBottom: "1px solid #0f1623", cursor: "pointer", background: isX ? "#0c0c1a" : "transparent" }} onClick={() => setXPhi(isX ? null : r.key)}>
                          <td style={{ padding: "4px 6px", color: "#e2e8f0" }}>{r.icon} {r.label} <span style={{ fontSize: 7, color: "#334155" }}>{isX ? "▼" : "▶"}</span></td>
                          <td style={{ padding: "4px 6px", color: r.cA >= 1 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{r.cA.toFixed(2)}</td>
                          <td style={{ padding: "4px 6px", color: "#94a3b8" }}>{r.phiNeeded > 10 ? ">1.0" : r.phiNeeded.toFixed(4)}</td>
                          <td style={{ padding: "4px 6px", color: "#3b82f6" }}>{bestPhi}</td>
                          <td style={{ padding: "4px 6px", color: bestPhi >= r.phiNeeded ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>{bestPhi >= r.phiNeeded ? "✓" : `${gap}×`}</td>
                          <td style={{ padding: "4px 6px" }}>
                            <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 8, background: r.bottleneck === "Cleared" ? "#22c55e15" : r.bottleneck === "Dynamic" ? "#f59e0b15" : "#ef444415", color: r.bottleneck === "Cleared" ? "#22c55e" : r.bottleneck === "Dynamic" ? "#f59e0b" : "#ef4444" }}>{r.bottleneck}</span>
                          </td>
                        </tr>
                        {isX && (
                          <tr><td colSpan={6} style={{ padding: "8px 10px", background: "#080812" }}>
                            <div style={{ fontSize: 9, color: "#f59e0b", letterSpacing: 1, marginBottom: 6 }}>CURE CONDITION — {r.full}</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, fontSize: 9, color: "#94a3b8" }}>
                              <span>C_combo_active</span><span style={{ color: r.cA >= 1 ? "#22c55e" : "#ef4444" }}>{r.cA.toFixed(3)}</span>
                              <span>f_active (on ART)</span><span>10⁻⁶</span>
                              <span>C_total (no LRA)</span><span style={{ color: "#ef4444" }}>{r.cTotal.toExponential(2)}</span>
                              <span>Φ needed</span><span style={{ color: r.phiNeeded > 1 ? "#ef4444" : "#f59e0b" }}>{r.phiNeeded > 10 ? ">1.0 (impossible)" : r.phiNeeded.toFixed(4)}</span>
                              <span>Best Φ available</span><span style={{ color: "#3b82f6" }}>{bestPhi}</span>
                              {cLRA !== null && <><span>C with LRA</span><span style={{ color: cLRA >= 1 ? "#22c55e" : "#f59e0b" }}>{cLRA < 0.001 ? cLRA.toExponential(1) : cLRA.toFixed(4)}</span></>}
                            </div>
                            <div style={{ fontSize: 8, color: "#475569", marginTop: 6, fontFamily: FONT }}>
                              Solve: (10⁻⁶ + Φ × 0.999999) × {r.cA.toFixed(2)} ≥ 1.0 → Φ ≥ {r.phiNeeded > 10 ? ">1.0" : r.phiNeeded.toFixed(4)}
                            </div>
                            {r.bottleneck === "Geometric" && <div style={{ fontSize: 8, color: "#ef4444", marginTop: 4 }}>
                              Even Φ=1.0 gives C = {r.cA.toFixed(2)} — still below threshold. This reservoir needs better drugs, not better LRAs.
                            </div>}
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Double Cover */}
            <div style={{ padding: "14px 16px", background: "#0d0d1c", borderRadius: 8, border: "1px solid #1a1a2e", marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 10 }}>DOUBLE COVER — S + d² = 1</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>{(sVal * 100).toFixed(0)}%</div><div style={{ fontSize: 8, color: "#64748b" }}>S (geometry)</div></div>
                <div style={{ fontSize: 14, color: "#334155" }}>+</div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>{((1 - sVal) * 100).toFixed(0)}%</div><div style={{ fontSize: 8, color: "#64748b" }}>d² (dynamics)</div></div>
                <div style={{ fontSize: 14, color: "#334155" }}>=</div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, fontWeight: 700, color: "#e2e8f0" }}>100%</div><div style={{ fontSize: 8, color: "#64748b" }}>complete</div></div>
              </div>
            </div>

            <div style={{ padding: "10px 12px", background: "#1a0a0a", border: "1px solid #ef444433", borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 4 }}>ART ALONE CANNOT CURE</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                C_total at GALT (no LRA) = {galt?.cTotal.toExponential(2)}. Shortfall: {shortfall > 1e10 ? "∞" : shortfall.toExponential(0)}× below threshold.
                No number of ARVs in parallel can overcome the 10⁻⁶ active fraction. <Src text="Finzi 1999; Siliciano 2003" />
              </div>
            </div>
          </StageCard>

          {/* ══ STAGE 4: THE REPORT ══ */}
          <StageCard stage={4} current={stage} title="THE REPORT" subtitle="Predictions, clearance ordering, and clinical implications" accent="#14b8a6" onJumpTo={() => setStage(4)}>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>RESERVOIR CLEARANCE ORDER</div>
            <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 16, flexWrap: "wrap" }}>
              {clearOrder.map((name, i) => {
                const r = resData.find(x => x.label === name);
                return (
                  <div key={name} style={{ display: "flex", alignItems: "center", flex: "1 1 auto" }}>
                    <div style={{ background: "#0f0f1a", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 6px", textAlign: "center", flex: 1, minWidth: 50 }}>
                      <div style={{ fontSize: 14 }}>{r?.icon}</div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: "#e2e8f0", marginTop: 2 }}>{name}</div>
                      <div style={{ fontSize: 7, color: i === 0 ? "#22c55e" : i === clearOrder.length - 1 ? "#ef4444" : "#64748b" }}>
                        {i === 0 ? "FIRST" : i === clearOrder.length - 1 ? "LAST" : `#${i + 1}`}
                      </div>
                    </div>
                    {i < clearOrder.length - 1 && <div style={{ color: "#334155", fontSize: 10, padding: "0 3px" }}>→</div>}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, borderBottom: "1px solid #1a1a2e", paddingBottom: 4 }}>NOVEL PREDICTIONS <span style={{ color: "#14b8a6", fontSize: 9, letterSpacing: 0 }}>tap for derivation</span></div>
            {[
              { title: "Genital tract is already curable", detail: `TFV R=3.5, Φ needed=${resData.find(r => r.key === "genital")?.phiNeeded.toFixed(4)}, best Φ=0.015. Testable: measure genital reservoir in LRA trials.`, color: "#22c55e", src: "Patterson 2011; Grant 2010",
                math: `C_active(genital) = ${resData.find(r => r.key === "genital")?.cA.toFixed(1)}. Φ_needed = 1.0 / ${resData.find(r => r.key === "genital")?.cA.toFixed(1)} = ${resData.find(r => r.key === "genital")?.phiNeeded.toFixed(4)}. Best LRA Φ = 0.015 > ${resData.find(r => r.key === "genital")?.phiNeeded.toFixed(4)} → clearable.` },
              { title: "CSF viral escape is geometric", detail: `C_active(CNS)=${resData.find(r => r.key === "CNS")?.cA.toFixed(2)} < 1.0. BBB blocks even active-virus suppression. Matches 5-10% CSF escape.`, color: "#ef4444", src: "Canestri 2010; Peluso 2012",
                math: `CNS R values: ${activeDrugs.map(d => `${d.abbr}=${d.pen.CNS || "?"}`).join(", ")}. All ≤ 0.05. Parallel conductance → C = ${resData.find(r => r.key === "CNS")?.cA.toFixed(3)} < 1.0 even with Φ=1.` },
              { title: `Φ gap at GALT: ${galt ? (galt.phiNeeded / 0.015).toFixed(0) : "?"}×`, detail: `Best LRA Φ=0.015. GALT needs Φ=${galt?.phiNeeded.toFixed(4)}. Quantifies the distance to cure.`, color: "#f59e0b", src: "Archin 2012; Kim 2018",
                math: `C_active(GALT) = ${galt?.cA.toFixed(2)}. Φ_needed = 1.0 / ${galt?.cA.toFixed(2)} = ${galt?.phiNeeded.toFixed(4)}. Gap = ${galt?.phiNeeded.toFixed(4)} / 0.015 = ${galt ? (galt.phiNeeded / 0.015).toFixed(1) : "?"}×.` },
              { title: "Darunavir dominates CNS", detail: `DRV C_site=${resData.find(r => r.key === "CNS")?.drugRank.find(d => d.abbr === "DRV")?.c.toFixed(3) || "N/A"} — best single drug at CNS. Matches PI preference for HAND.`, color: "#a855f7", src: "Cusini 2013",
                math: (() => { const drvD = wd("Darunavir","CNS"); const drvT = wTau("Darunavir"); return `DRV: τ=${drvT.toFixed(2)}, R(CNS)=0.05, K_barrier=${drvD.k_barrier.toFixed(1)}. C = ${drvT.toFixed(2)} / ${drvD.k_pathway.toFixed(2)} = ${drvD.c_site.toFixed(3)}.`; })() },
              { title: "GALT clears last (65% of pool)", detail: `Despite decent penetration, sheer viral mass makes GALT the bottleneck. Order: ${clearOrder.join(" → ")}.`, color: "#3b82f6", src: "Estes 2017",
                math: `Score = C_active / fraction. GALT: ${galt?.cA.toFixed(2)} / 0.65 = ${galt ? (galt.cA / 0.65).toFixed(1) : "?"}. CNS: ${resData.find(r => r.key === "CNS")?.cA.toFixed(2)} / 0.02 = ${resData.find(r => r.key === "CNS") ? (resData.find(r => r.key === "CNS").cA / 0.02).toFixed(1) : "?"}. GALT scores lowest.` },
            ].map((pred, i) => {
              const isX = xPred === i;
              return (
                <div key={i} onClick={() => setXPred(isX ? null : i)}
                  style={{ padding: "10px 14px", background: isX ? "#0a0a1a" : "#0f0f1a", border: `1px solid ${isX ? pred.color + "33" : pred.color + "22"}`, borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${pred.color}66`, cursor: "pointer", transition: "all 0.2s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: pred.color }}>{pred.title}</div>
                    <span style={{ fontSize: 8, color: "#334155", transition: "transform 0.2s", display: "inline-block", transform: isX ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
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

            {/* Summary grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 14, padding: "14px", background: "#0d0d1c", borderRadius: 8, border: "1px solid #1a1a2e" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6" }}>{(sVal * 100).toFixed(0)}%</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>Geometry (S)</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{shortfall > 1e10 ? "∞" : shortfall.toExponential(0)}</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>Cure shortfall</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#14b8a6" }}>0</div>
                <div style={{ fontSize: 7, color: "#64748b" }}>Fitted params</div>
              </div>
            </div>

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #1a1a2e", textAlign: "center" }}>
              <div style={{ fontSize: 8, color: "#334155", letterSpacing: 2 }}>DAVIS LAB · DAVIS GEOMETRIC · BRANCH XI</div>
              <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>The equation does not change. The manifold changes. The medicine follows.</div>
              <div style={{ fontSize: 11, color: "#1e293b", marginTop: 4, fontWeight: 700 }}>C = τ/K</div>
            </div>
          </StageCard>

        </div>{/* end LEFT */}

        {/* RIGHT: VIZ sidebar */}
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
              <SidebarContent stage={stage} activeDrugs={activeDrugs} resData={resData} lraIdx={lraIdx} clearOrder={clearOrder} sVal={sVal} mob={mob} expanded={isExp} FONT={FONT} wTau={wTau} wd={wd} />
            </div>
          );
        })()}

      </div>{/* end BODY */}
    </div>
  );
}
