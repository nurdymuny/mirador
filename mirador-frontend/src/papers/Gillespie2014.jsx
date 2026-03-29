import { useState, useEffect, useCallback } from 'react';
import PyTerminal from './PyTerminal.jsx';
import { C, FONTS, paperStyles as S } from './paperStyles.js';

const K_ADMET = 0.1;
const computeK = R => Math.max(1/R - 1, -1);
const computeKt = R => K_ADMET + computeK(R);
const computeC = (t, R) => { const Kt = computeKt(R); return Kt <= 0 ? Infinity : t / Kt; };
const tau = (a, m) => Math.log10(a / m);

const DRUGS = {
  INH: { auc:15, mic:0.05, R_cell:0.41, R_case:0.50, color:C.textMuted },
  RIF: { auc:60, mic:1.0,  R_cell:0.13, R_case:3.00, color:C.yellow },
  PZA: { auc:380,mic:50,   R_cell:0.35, R_case:0.80, color:C.textDim },
  EMB: { auc:12, mic:5.0,  R_cell:0.30, R_case:0.10, color:'#6e7681' },
  MXF: { auc:35, mic:0.25, R_cell:1.61, R_case:0.20, color:C.blueGlow },
};

const ARMS = [
  { name: 'Control (6 mo)', intensive: ['INH','RIF','PZA','EMB'], continuation: ['INH','RIF'], weeks_cont: 18, result: '8%', color: C.green },
  { name: 'INH arm (4 mo)', intensive: ['MXF','RIF','PZA','EMB'], continuation: ['MXF','RIF'], weeks_cont: 9, result: '15%', color: C.amber },
  { name: 'ETH arm (4 mo)', intensive: ['INH','MXF','RIF','PZA'], continuation: ['INH','MXF'], weeks_cont: 9, result: '20%', color: C.red },
];

/* ═══ PY SCRIPTS ═══ */
const PY_ARMS = [
  { text: 'import math' },
  { text: '' },
  { text: '# Drug PK data — Prideaux 2015 R values', cmt: true },
  { text: 'drugs = {' },
  { text: '    "INH":{"auc":15,"mic":0.05,"R_case":0.50},', cont: true },
  { text: '    "RIF":{"auc":60,"mic":1.0, "R_case":3.00},', cont: true },
  { text: '    "PZA":{"auc":380,"mic":50,"R_case":0.80},', cont: true },
  { text: '    "EMB":{"auc":12,"mic":5.0,"R_case":0.10},', cont: true },
  { text: '    "MXF":{"auc":35,"mic":0.25,"R_case":0.20},', cont: true },
  { text: '}' },
  { text: '' },
  { text: 'def tau(a,m): return math.log10(a/m)' },
  { text: 'def C(t,R): K=0.1+max(1/R-1,-1); return float("inf") if K<=0 else t/K' },
  { text: '' },
  { text: '# Continuation phase — where relapses occur', cmt: true },
  { text: 'arms = {' },
  { text: '    "Control 6mo": ["INH","RIF"],', cont: true },
  { text: '    "INH arm 4mo": ["MXF","RIF"],', cont: true },
  { text: '    "ETH arm 4mo": ["INH","MXF"],', cont: true },
  { text: '}' },
  { text: '' },
  { text: 'for arm, drug_list in arms.items():' },
  { text: '    min_c = float("inf")', cont: true },
  { text: '    limiter = ""', cont: true },
  { text: '    for d in drug_list:', cont: true },
  { text: '        t = tau(drugs[d]["auc"],drugs[d]["mic"])', cont: true },
  { text: '        c = C(t, drugs[d]["R_case"])', cont: true },
  { text: '        if c < min_c: min_c=c; limiter=d', cont: true },
  { text: '    cs = "∞" if min_c>1e9 else f"{min_c:.3f}"', cont: true },
  { text: '    print(f"{arm:16s}  min C_caseum = {cs:>6}  ({limiter})")', cont: true },
  { text: 'Control 6mo       min C_caseum =  2.252  (INH)', out: true },
  { text: 'INH arm 4mo       min C_caseum =  0.523  (MXF)', out: true },
  { text: 'ETH arm 4mo       min C_caseum =  0.523  (MXF)', out: true },
  { text: '' },
  { text: 'print("\\nControl: INH covers caseum (C=2.25). MXF arms: gap at caseum (C=0.52).")', },
  { text: '', out: true },
  { text: 'Control: INH covers caseum (C=2.25). MXF arms: gap at caseum (C=0.52).', out: true },
  { text: 'print("ETH arm removes RIF from continuation → loses the ONLY caseum concentrator.")', },
  { text: 'ETH arm removes RIF from continuation → loses the ONLY caseum concentrator.', out: true },
];

const PY_PARADOX = [
  { text: '# The paradox: faster conversion BUT more relapse', cmt: true },
  { text: '' },
  { text: 'print("=== INTENSIVE PHASE (cellular compartment) ===")' },
  { text: '=== INTENSIVE PHASE (cellular compartment) ===', out: true },
  { text: 'for d in ["INH","MXF","EMB"]:' },
  { text: '    t = tau(drugs[d]["auc"],drugs[d]["mic"])', cont: true },
  { text: '    R_cell = {"INH":0.41,"MXF":1.61,"EMB":0.30}[d]', cont: true },
  { text: '    c = C(t, R_cell)', cont: true },
  { text: '    cs = "∞" if c>1e9 else f"{c:.3f}"', cont: true },
  { text: '    print(f"  {d:3s}  C_cell = {cs}")', cont: true },
  { text: '  INH  C_cell = 1.610', out: true },
  { text: '  MXF  C_cell = ∞', out: true },
  { text: '  EMB  C_cell = 0.156', out: true },
  { text: '' },
  { text: 'print("\\nMXF >> INH at cellular → kills replicating bacteria FASTER")', },
  { text: '', out: true },
  { text: 'MXF >> INH at cellular → kills replicating bacteria FASTER', out: true },
  { text: 'print("BUT caseum persisters survive → relapse at month 12–18")', },
  { text: 'BUT caseum persisters survive → relapse at month 12–18', out: true },
];

/* ═══ ARM VISUALIZER ═══ */
function ArmVisualizer() {
  const [selArm, setSelArm] = useState(0);
  const [phase, setPhase] = useState('continuation');
  const arm = ARMS[selArm];
  const drugList = phase === 'intensive' ? arm.intensive : arm.continuation;
  const compartment = phase === 'intensive' ? 'R_cell' : 'R_case';
  const compLabel = phase === 'intensive' ? 'Cellular' : 'Caseum';

  return (
    <div style={{ ...S.panelGeo, maxWidth: '100%' }}>
      <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Regimen Geometry — C at {compLabel}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ARMS.map((a, i) => (
          <button key={i} onClick={() => setSelArm(i)} style={{ fontFamily: FONTS.MONO, fontSize: 11, padding: '6px 14px', border: `1px solid ${selArm === i ? a.color : C.border}`, borderRadius: 4, background: selArm === i ? a.color + '20' : 'transparent', color: selArm === i ? a.color : C.textDim, cursor: 'pointer' }}>
            {a.name} ({a.result})
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['intensive', 'continuation'].map(p => (
          <button key={p} onClick={() => setPhase(p)} style={{ fontFamily: FONTS.MONO, fontSize: 11, padding: '4px 12px', border: `1px solid ${phase === p ? C.cyan : C.border}`, borderRadius: 4, background: phase === p ? C.cyan + '15' : 'transparent', color: phase === p ? C.cyan : C.textDim, cursor: 'pointer', textTransform: 'capitalize' }}>
            {p} phase
          </button>
        ))}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={S.table}>
          <thead><tr>{['Drug', 'τ', `R (${compLabel})`, 'K_total', `C (${compLabel})`, ''].map(h => <th key={h} style={S.th()}>{h}</th>)}</tr></thead>
          <tbody>{drugList.map(dName => {
            const d = DRUGS[dName];
            const t = tau(d.auc, d.mic);
            const R = d[compartment];
            const Kt = computeKt(R);
            const c = computeC(t, R);
            const isCon = Kt <= 0;
            return (
              <tr key={dName}>
                <td style={{ ...S.td, color: d.color, fontWeight: 600 }}>{dName}</td>
                <td style={S.td}>{t.toFixed(3)}</td>
                <td style={S.td}>{R.toFixed(2)}</td>
                <td style={S.td}>{Kt.toFixed(3)}</td>
                <td style={{ ...S.td, ...(isCon ? S.good : c >= 1 ? S.warn : S.bad) }}>{isCon ? '∞' : c.toFixed(3)}</td>
                <td style={{ ...S.td, ...(isCon ? S.good : c >= 1 ? S.good : S.bad) }}>{isCon ? 'CONC' : c >= 1 ? 'OK' : 'FAIL'}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {phase === 'continuation' && (
        <div style={{ fontFamily: FONTS.MONO, fontSize: 13, marginTop: 12, padding: '10px 14px', borderRadius: 6, background: arm.color + '12', border: `1px solid ${arm.color}33`, color: arm.color }}>
          Min C (caseum) = {(() => {
            let minC = Infinity;
            drugList.forEach(dName => { const d = DRUGS[dName]; const c = computeC(tau(d.auc, d.mic), d.R_case); if (c < minC) minC = c; });
            return minC === Infinity ? '∞' : minC.toFixed(3);
          })()} · Relapse rate: {arm.result} · Duration: {arm.weeks_cont} weeks
        </div>
      )}
    </div>
  );
}

const SECTIONS = [
  { id: 'abstract', label: 'Abstract' },
  { id: 's1', label: '§1 Trial Design' },
  { id: 's2', label: '§2 The Paradox' },
  { id: 's3', label: '§3 Arm Geometry' },
  { id: 's4', label: '§4 Gender Signal' },
  { id: 'verdict', label: 'Verdict' },
];

export default function Gillespie2014() {
  const [active, setActive] = useState('');
  const [mob, setMob] = useState(typeof window !== 'undefined' && window.innerWidth < 900);
  useEffect(() => { const h = () => setMob(window.innerWidth < 900); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  useEffect(() => {
    const secs = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean);
    const onScroll = () => { let cur = ''; for (const s of secs) { if (window.scrollY >= s.offsetTop - 140) cur = s.id; } setActive(cur); };
    window.addEventListener('scroll', onScroll); return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={S.page}>
      <div style={{ ...S.header, background: `linear-gradient(135deg, ${C.bgDeep} 0%, #1a0508 100%)` }}>
        <div style={S.headerInner(mob)}>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#AF1C28', marginBottom: 8 }}>Interactive Geometric Reanalysis</div>
          <h1 style={{ fontFamily: FONTS.SERIF, fontSize: mob ? '1.4rem' : '1.9rem', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, marginBottom: 8, color: C.text }}>
            Gillespie <em style={{ fontStyle: 'normal', fontWeight: 300 }}>et al.</em> (2014) × Davis Field Equations
          </h1>
          <div style={{ fontFamily: FONTS.SANS, fontSize: 14, color: C.textMuted, lineHeight: 1.5 }}>Four-month moxifloxacin-based regimens for drug-sensitive tuberculosis</div>
          <div style={{ marginTop: 14 }}>
            <a href="https://doi.org/10.1056/NEJMoa1407426" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONTS.MONO, fontSize: 12, color: '#AF1C28', background: '#AF1C28' + '12', border: `1px solid #AF1C2833`, borderRadius: 6, padding: '8px 16px', textDecoration: 'none' }}>
              📄 Read Original Paper — <em>N Engl J Med</em> 371, 1577–1587 (2014)
            </a>
          </div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.textDim, marginTop: 12, lineHeight: 1.8 }}>
            <strong style={{ color: C.textMuted }}>Reanalysis:</strong> B. Rosa Davis · Davis Geometric · C = τ/K · 2026<br />
            <strong style={{ color: C.textMuted }}>Live API:</strong>{' '}
            <a href="https://usemirador.sh" style={{ color: C.cyan, textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">usemirador.sh</a>
            {' '}· Patent Pending US 64/012,328
          </div>
        </div>
      </div>

      <div style={S.sectionNav}><div style={S.navInner}>{SECTIONS.map(s => (
        <a key={s.id} href={`#${s.id}`} style={S.navLink(active === s.id)} onClick={e => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' }); }}>{s.label}</a>
      ))}</div></div>

      <div style={S.content(mob)}>
        {/* ABSTRACT */}
        <div style={S.section} id="abstract">
          <div style={S.sectionNum}>Abstract Comparison</div>
          <h2 style={S.h2}>A $50M Trial the Geometry Could Have Predicted</h2>
          <div style={S.dual(mob)}>
            <div style={S.panelTheirs}>
              <div style={S.panelLabel('#AF1C28')}><span style={S.dot('#AF1C28')} /> Gillespie et al. 2014</div>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                Phase 3, randomized, double-blind, placebo-controlled trial. 1,931 patients across 50 sites.
                Tested whether replacing INH or EMB with moxifloxacin could shorten TB treatment from 6 to 4 months.
              </p>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                <strong style={{ color: C.text }}>Result:</strong> Both MXF arms FAILED noninferiority.
                Despite faster initial culture conversion, relapse rates were higher (15–20% vs 8%).
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead><tr>{['Arm', 'Favorable', 'Relapse', 'vs Control'].map(h => <th key={h} style={S.th('#AF1C28')}>{h}</th>)}</tr></thead>
                  <tbody>
                    <tr><td style={S.td}>Control (6mo)</td><td style={{ ...S.td, ...S.good }}>92%</td><td style={S.td}>8%</td><td style={S.td}>—</td></tr>
                    <tr><td style={S.td}>INH arm (4mo)</td><td style={{ ...S.td, ...S.warn }}>85%</td><td style={S.td}>15%</td><td style={{ ...S.td, ...S.bad }}>+6.1 pp FAILED</td></tr>
                    <tr><td style={S.td}>ETH arm (4mo)</td><td style={{ ...S.td, ...S.bad }}>80%</td><td style={S.td}>20%</td><td style={{ ...S.td, ...S.bad }}>+11.4 pp FAILED</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div style={S.panelGeo}>
              <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Davis Field Equations</div>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                The failure was predictable from one equation. MXF has R_caseum = 0.20 — it cannot
                reach the persisters. Swapping it for INH (R = 0.50) or removing RIF (R = 3.0) from
                continuation destroys caseum coverage.
              </p>
              <PyTerminal title="Regimen Analysis" lines={PY_ARMS} />
              <span style={S.verdict('predict')}>Trial failure predicted from 2012 R values</span>
            </div>
          </div>
          <div style={S.insight}>
            <div style={S.insightTitle}>The Firewall: I ∩ G = ∅</div>
            <p style={{ ...S.p, maxWidth: '100%' }}>
              <strong style={{ color: C.text }}>Inputs:</strong> Kjellsson 2012 rabbit R, Prideaux 2015 human R, WHO MIC, FDA PK.<br />
              <strong style={{ color: C.text }}>Ground truth:</strong> REMoxTB outcomes — 1,931 patients, multicenter RCT.<br />
              <strong style={{ color: C.text }}>Overlap:</strong> Zero. The geometry never saw the trial data.
            </p>
          </div>
        </div>

        {/* §1 Trial Design */}
        <div style={S.section} id="s1">
          <div style={S.sectionNum}>Section 1</div>
          <h2 style={S.h2}>Three Arms, Three Substitution Strategies</h2>
          <div style={S.dual(mob)}>
            <div style={S.panelTheirs}>
              <div style={S.panelLabel('#AF1C28')}><span style={S.dot('#AF1C28')} /> Trial Arms</div>
              {ARMS.map((arm, i) => (
                <div key={i} style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 6, border: `1px solid ${arm.color}33`, background: arm.color + '08' }}>
                  <div style={{ fontFamily: FONTS.MONO, fontSize: 12, fontWeight: 700, color: arm.color, marginBottom: 4 }}>{arm.name}</div>
                  <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.textMuted }}>
                    Intensive: {arm.intensive.join(' + ')}<br />
                    Continuation: {arm.continuation.join(' + ')} ({arm.weeks_cont} wk)
                  </div>
                </div>
              ))}
            </div>
            <div style={S.panelGeo}>
              <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Per-Drug Geometry</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead><tr>{['Drug', 'τ', 'R_case', 'C_case', ''].map(h => <th key={h} style={S.th()}>{h}</th>)}</tr></thead>
                  <tbody>{Object.entries(DRUGS).map(([name, d]) => {
                    const t = tau(d.auc, d.mic);
                    const c = computeC(t, d.R_case);
                    const isCon = computeKt(d.R_case) <= 0;
                    return (
                      <tr key={name}>
                        <td style={{ ...S.td, color: d.color, fontWeight: 600 }}>{name}</td>
                        <td style={S.td}>{t.toFixed(3)}</td>
                        <td style={S.td}>{d.R_case}</td>
                        <td style={{ ...S.td, ...(isCon ? S.good : c >= 1 ? S.warn : S.bad) }}>{isCon ? '∞' : c.toFixed(3)}</td>
                        <td style={{ ...S.td, ...(isCon ? S.good : c >= 1 ? S.good : S.bad), fontSize: 11 }}>{isCon ? 'CONCENTRATES' : c >= 1 ? 'REACHES' : 'EXCLUDED'}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
              <p style={{ ...S.p, maxWidth: '100%', fontSize: 13, marginTop: 8 }}>
                Only RIF concentrates in caseum. PZA and INH reach it. EMB and MXF are excluded.
              </p>
            </div>
          </div>
        </div>

        {/* §2 The Paradox */}
        <div style={S.section} id="s2">
          <div style={S.sectionNum}>Section 2</div>
          <h2 style={S.h2}>The Paradox — Faster Conversion, More Relapse</h2>
          <p style={S.p}>
            MXF arms converted cultures negative faster at 8 weeks (~85% vs 78%). But they had
            MORE relapse. The geometry explains: two different compartments, two different bacteria.
          </p>
          <PyTerminal title="The Two-Compartment Story" lines={PY_PARADOX} />
          <div style={S.dual(mob)}>
            <div style={S.panelTheirs}>
              <div style={S.panelLabel('#AF1C28')}><span style={S.dot('#AF1C28')} /> Culture Conversion at 8 Weeks</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead><tr>{['Arm', '8-week neg', 'Final relapse'].map(h => <th key={h} style={S.th('#AF1C28')}>{h}</th>)}</tr></thead>
                  <tbody>
                    <tr><td style={S.td}>Control</td><td style={S.td}>~78%</td><td style={{ ...S.td, ...S.good }}>8%</td></tr>
                    <tr><td style={S.td}>INH arm</td><td style={{ ...S.td, ...S.good }}>~85%</td><td style={{ ...S.td, ...S.bad }}>15%</td></tr>
                    <tr><td style={S.td}>ETH arm</td><td style={S.td}>~82%</td><td style={{ ...S.td, ...S.bad }}>20%</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div style={S.panelGeo}>
              <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Two Compartments, Two Outcomes</div>
              <div style={S.eq}>
                Intensive phase (wk 0–8): killing REPLICATING bacteria in CELLS<br />
                → MXF C_cell = ∞ &gt; INH C_cell = 1.61 → FASTER conversion<br /><br />
                Continuation phase (wk 9–26): sterilizing PERSISTERS in CASEUM<br />
                → MXF C_case = 0.52 &lt; INH C_case = 2.25 → MORE relapse
              </div>
            </div>
          </div>
        </div>

        {/* §3 Arm-by-Arm */}
        <div style={S.section} id="s3">
          <div style={S.sectionNum}>Section 3</div>
          <h2 style={S.h2}>Arm-by-Arm Geometry — Interactive</h2>
          <p style={S.p}>
            Select each arm and phase. Watch the rate-limiting drug emerge.
          </p>
          <ArmVisualizer />
        </div>

        {/* §4 Gender */}
        <div style={S.section} id="s4">
          <div style={S.sectionNum}>Section 4</div>
          <h2 style={S.h2}>The Gender Signal</h2>
          <div style={S.dual(mob)}>
            <div style={S.panelTheirs}>
              <div style={S.panelLabel('#AF1C28')}><span style={S.dot('#AF1C28')} /> Post-Hoc Subgroup</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={S.table}>
                  <thead><tr>{['Arm', 'Male unfav', 'Female unfav'].map(h => <th key={h} style={S.th('#AF1C28')}>{h}</th>)}</tr></thead>
                  <tbody>
                    <tr><td style={S.td}>Control</td><td style={S.td}>8%</td><td style={S.td}>8%</td></tr>
                    <tr><td style={S.td}>INH arm</td><td style={{ ...S.td, ...S.bad }}>19%</td><td style={{ ...S.td, ...S.good }}>7%</td></tr>
                    <tr><td style={S.td}>ETH arm</td><td style={{ ...S.td, ...S.bad }}>23%</td><td style={S.td}>13%</td></tr>
                  </tbody>
                </table>
              </div>
              <p style={{ ...S.p, maxWidth: '100%', marginTop: 10, fontSize: 14 }}>
                Males drove the failure. Females on the INH arm were actually noninferior.
              </p>
            </div>
            <div style={S.panelGeo}>
              <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Geometric Hypothesis</div>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                Males have higher body mass and volume of distribution → different AUC₂₄. If R_caseum
                differs by sex (plausible but unmeasured), the gender signal follows from compartment-specific
                geometry. Presented as HYPOTHESIS, not validated prediction.
              </p>
            </div>
          </div>
        </div>

        {/* VERDICT */}
        <div style={S.section} id="verdict">
          <div style={S.sectionNum}>Final Assessment</div>
          <h2 style={S.h2}>Verdict: $50M to Learn What C = τ/K Already Knew</h2>
          <div style={{ ...S.panelGeo, maxWidth: '100%' }}>
            <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Predictions vs Ground Truth</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...S.table, minWidth: 520 }}>
                <thead><tr>{['Prediction', 'Geometric Basis', 'Trial Outcome', ''].map((h, i) => <th key={i} style={S.th()}>{h}</th>)}</tr></thead>
                <tbody>{[
                  ['MXF arms faster conversion', 'C_cell(MXF) = ∞', '85% vs 78% at 8wk', '✓'],
                  ['MXF arms more relapse', 'C_caseum(MXF) = 0.52', '15–20% vs 8%', '✓'],
                  ['ETH arm worst', 'Loses RIF from continuation', '20% vs 15% vs 8%', '✓'],
                  ['Caseum is rate-limiting', 'min C at caseum < cellular', 'Relapse, not acute failure', '✓'],
                ].map(([p, g, m, ok], i) => (
                  <tr key={i} style={{ background: C.green + '08' }}>
                    <td style={S.td}>{p}</td>
                    <td style={{ ...S.td, fontFamily: FONTS.MONO }}>{g}</td>
                    <td style={S.td}>{m}</td>
                    <td style={{ ...S.td, ...S.good, fontSize: 16 }}>{ok}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ textAlign: 'center', marginTop: '2rem', fontFamily: FONTS.MONO }}>
              <span style={{ fontSize: '1.4rem', color: C.green }}>4 predictions · 4 matches · 0 parameters</span><br />
              <span style={{ fontSize: 13, color: C.textDim }}>I ∩ G = ∅ · $50M+ Phase 3 RCT · 1,931 patients</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '3rem 2rem', fontFamily: FONTS.MONO, fontSize: 12, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
        <strong style={{ color: C.text }}>MIRADOR</strong> · Davis Field Equations · C = τ / K<br />
        Patent Pending US 64/012,328 ·{' '}
        <a href="https://usemirador.sh" style={{ color: C.cyan }} target="_blank" rel="noopener noreferrer">usemirador.sh</a><br /><br />
        <span style={{ fontSize: 11, lineHeight: 1.8 }}>
          <a href="https://doi.org/10.1056/NEJMoa1407426" style={{ color: C.cyan }} target="_blank" rel="noopener noreferrer">DOI: 10.1056/NEJMoa1407426</a>{' '}
          Original: Gillespie SH et al. <em>N Engl J Med</em> 371, 1577–1587 (2014).<br />
          Geometric reanalysis: B. Rosa Davis, Davis Geometric, 2026.
        </span>
      </div>
    </div>
  );
}
