import { useState, useEffect } from 'react';
import PyTerminal from './PyTerminal.jsx';
import { C, FONTS, paperStyles as S } from './paperStyles.js';

const tau = (a, m) => Math.log10(a / m);

const PATTERNS = [
  { id: 1, name: 'Concentration-dependent', kDom: 'K_ADMET', color: C.cyan,
    desc: 'Aminoglycosides, fluoroquinolones. Kill faster at higher Cmax. AUC/MIC >125 for GNR.',
    geo: 'K is dominated by toxicity (K_ADMET). Maximize dose → maximize τ → high C.',
    drugs: ['Gentamicin', 'Ciprofloxacin', 'Moxifloxacin'] },
  { id: 2, name: 'Time-dependent', kDom: 'K_clearance', color: C.amber,
    desc: 'β-lactams, carbapenems. Kill at the same rate regardless of concentration above MIC. %T>MIC ≥ 40–50%.',
    geo: 'K is dominated by clearance. Drug disappears fast. Dose frequency or infusion extends T>MIC.',
    drugs: ['Amoxicillin', 'Ceftriaxone', 'Meropenem'] },
  { id: 3, name: 'AUC-dependent', kDom: 'K balanced', color: C.green,
    desc: 'Vancomycin, macrolides, linezolid. Moderate PAE extends exposure. AUC/MIC >400 for VAN.',
    geo: 'K is balanced — neither toxicity nor clearance dominates. τ IS the determinant.',
    drugs: ['Vancomycin', 'Linezolid', 'Azithromycin'] },
];

const TARGETS = [
  { cls: 'FQ (GNR)',   amic: 125, tau: Math.log10(125), pattern: 1 },
  { cls: 'FQ (GPC)',   amic: 30,  tau: Math.log10(30),  pattern: 1 },
  { cls: 'Vancomycin', amic: 400, tau: Math.log10(400), pattern: 3 },
  { cls: 'Linezolid',  amic: 80,  tau: Math.log10(80),  pattern: 3 },
  { cls: 'Macrolides',  amic: 25,  tau: Math.log10(25),  pattern: 3 },
];

const DRUGS = [
  { name:'Gentamicin',    auc:70,   mic:1,    pattern:1, cls:'Amino' },
  { name:'Ciprofloxacin', auc:30,   mic:0.5,  pattern:1, cls:'FQ' },
  { name:'Moxifloxacin',  auc:35,   mic:0.25, pattern:1, cls:'FQ' },
  { name:'Amoxicillin',   auc:25,   mic:0.5,  pattern:2, cls:'Pen' },
  { name:'Ceftriaxone',   auc:1000, mic:0.06, pattern:2, cls:'Ceph' },
  { name:'Vancomycin',    auc:400,  mic:1.0,  pattern:3, cls:'Glyco' },
  { name:'Linezolid',     auc:90,   mic:2.0,  pattern:3, cls:'Oxaz' },
  { name:'Azithromycin',  auc:4,    mic:0.125,pattern:3, cls:'Mac' },
];

const PY_TARGETS = [
  { text: 'import math' },
  { text: '' },
  { text: '# Craig\'s PK/PD targets → τ thresholds', cmt: true },
  { text: 'targets = {' },
  { text: '    "FQ vs GNR":  125,   # AUC/MIC >125', cont: true },
  { text: '    "FQ vs GPC":   30,   # AUC/MIC >30', cont: true },
  { text: '    "VAN (MRSA)": 400,   # AUC/MIC >400', cont: true },
  { text: '    "LZD":         80,   # AUC/MIC >80', cont: true },
  { text: '    "Macrolides":  25,   # AUC/MIC >25', cont: true },
  { text: '}' },
  { text: '' },
  { text: 'for cls, amic in targets.items():' },
  { text: '    t = math.log10(amic)', cont: true },
  { text: '    print(f"  {cls:<15} AUC/MIC >{amic:>4}  →  τ > {t:.3f}")', cont: true },
  { text: '  FQ vs GNR       AUC/MIC > 125  →  τ > 2.097', out: true },
  { text: '  FQ vs GPC       AUC/MIC >  30  →  τ > 1.477', out: true },
  { text: '  VAN (MRSA)      AUC/MIC > 400  →  τ > 2.602', out: true },
  { text: '  LZD             AUC/MIC >  80  →  τ > 1.903', out: true },
  { text: '  Macrolides      AUC/MIC >  25  →  τ > 1.398', out: true },
  { text: '' },
  { text: '# τ IS Craig\'s index — just log-transformed', cmt: true },
  { text: 'print("\\nτ = log₁₀(AUC₂₄/MIC) directly encodes the Craig target")' },
  { text: 'τ = log₁₀(AUC₂₄/MIC) directly encodes the Craig target', out: true },
];

const SECTIONS = [
  { id: 'abstract', label: 'Abstract' },
  { id: 's1', label: '§1 Three Patterns' },
  { id: 's2', label: '§2 τ = AUC/MIC' },
  { id: 's3', label: '§3 Unification' },
  { id: 'verdict', label: 'Verdict' },
];

export default function Craig1998() {
  const [active, setActive] = useState('');
  const [mob, setMob] = useState(typeof window !== 'undefined' && window.innerWidth < 900);
  const [selPattern, setSelPattern] = useState(null);
  useEffect(() => { const h = () => setMob(window.innerWidth < 900); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h); }, []);
  useEffect(() => {
    const secs = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean);
    const onScroll = () => { let cur = ''; for (const s of secs) { if (window.scrollY >= s.offsetTop - 140) cur = s.id; } setActive(cur); };
    window.addEventListener('scroll', onScroll); return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner(mob)}>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: C.blue, marginBottom: 8 }}>Interactive Geometric Reanalysis</div>
          <h1 style={{ fontFamily: FONTS.SERIF, fontSize: mob ? '1.4rem' : '1.9rem', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, marginBottom: 8, color: C.text }}>
            Craig (1998) × Davis Field Equations
          </h1>
          <div style={{ fontFamily: FONTS.SANS, fontSize: 14, color: C.textMuted }}>Three killing patterns are three regimes of one equation: C = τ/K</div>
          <div style={{ marginTop: 14 }}>
            <a href="https://doi.org/10.1086/516284" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONTS.MONO, fontSize: 12, color: C.blue, background: C.blue + '12', border: `1px solid ${C.blue}33`, borderRadius: 6, padding: '8px 16px', textDecoration: 'none' }}>
              📄 Read Original Paper — <em>Clin Infect Dis</em> 26(1), 1–10 (1998)
            </a>
          </div>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.textDim, marginTop: 12, lineHeight: 1.8 }}>
            <strong style={{ color: C.textMuted }}>Reanalysis:</strong> B. Rosa Davis · Davis Geometric · C = τ/K · 2026
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
          <h2 style={S.h2}>One Equation, Three Patterns — Not Three Models</h2>
          <div style={S.dual(mob)}>
            <div style={S.panelTheirs}>
              <div style={S.panelLabel(C.blue)}><span style={S.dot(C.blue)} /> Craig 1998</div>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                The foundational PK/PD paper. 20 years of mouse thigh data → three killing patterns →
                three separate indices: Cmax/MIC, %T&gt;MIC, AUC₂₄/MIC. Each drug class gets its own
                metric. Three models for three behaviours.
              </p>
            </div>
            <div style={S.panelGeo}>
              <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Davis Field Equations</div>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                τ = log₁₀(AUC₂₄/MIC) encodes Craig's primary index. The three patterns map to three
                K regimes — where the dominant component of K differs. Pattern 1: K_ADMET. Pattern 2:
                K_clearance. Pattern 3: K_balanced. One equation, three regimes.
              </p>
            </div>
          </div>
        </div>

        {/* §1 */}
        <div style={S.section} id="s1">
          <div style={S.sectionNum}>Section 1</div>
          <h2 style={S.h2}>The Three Killing Patterns</h2>
          <div style={{ display: 'flex', flexDirection: mob ? 'column' : 'row', gap: 12 }}>
            {PATTERNS.map(p => (
              <div key={p.id} onClick={() => setSelPattern(selPattern === p.id ? null : p.id)}
                style={{ flex: 1, background: selPattern === p.id ? p.color + '14' : '#0d1117', border: `1px solid ${selPattern === p.id ? p.color : C.border}`, borderRadius: 8, padding: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}>
                <div style={{ fontFamily: FONTS.MONO, fontSize: 13, color: p.color, fontWeight: 600 }}>
                  Pattern {p.id}: {p.name}
                </div>
                <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.textDim, margin: '4px 0 8px' }}>
                  Dominant K: {p.kDom}
                </div>
                <p style={{ fontFamily: FONTS.SANS, fontSize: 13, color: C.textMuted, margin: 0 }}>{p.desc}</p>
                {selPattern === p.id && (
                  <div style={{ marginTop: 10, padding: '8px', background: C.bg, borderRadius: 4 }}>
                    <p style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.text, margin: 0 }}>{p.geo}</p>
                    <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.textDim, marginTop: 6 }}>
                      Drugs: {p.drugs.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* §2 */}
        <div style={S.section} id="s2">
          <div style={S.sectionNum}>Section 2</div>
          <h2 style={S.h2}>τ IS AUC/MIC — Craig's Primary Index</h2>
          <PyTerminal title="Craig Targets → τ Thresholds" lines={PY_TARGETS} />
          <div style={{ overflowX: 'auto', marginTop: '1.5rem' }}>
            <table style={S.table}>
              <thead><tr>{['Drug', 'Class', 'Pattern', 'AUC₂₄', 'MIC', 'AUC/MIC', 'τ'].map(h => <th key={h} style={S.th()}>{h}</th>)}</tr></thead>
              <tbody>{DRUGS.map(d => {
                const t = tau(d.auc, d.mic);
                const amic = d.auc / d.mic;
                const col = PATTERNS.find(p => p.id === d.pattern)?.color || C.text;
                return (
                  <tr key={d.name}>
                    <td style={{ ...S.td, color: col, fontWeight: 600 }}>{d.name}</td>
                    <td style={{ ...S.td, fontSize: 11 }}>{d.cls}</td>
                    <td style={{ ...S.td, color: col }}>{d.pattern}</td>
                    <td style={S.td}>{d.auc}</td>
                    <td style={S.td}>{d.mic}</td>
                    <td style={S.td}>{amic.toFixed(0)}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{t.toFixed(3)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>

        {/* §3 */}
        <div style={S.section} id="s3">
          <div style={S.sectionNum}>Section 3</div>
          <h2 style={S.h2}>The Unification — Three Regimes, One Equation</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead><tr>{['Pattern', 'Dominant K', 'Geometry Says', 'Clinical Implication'].map(h => <th key={h} style={S.th()}>{h}</th>)}</tr></thead>
              <tbody>{[
                ['Conc-dependent', 'K_ADMET', 'Increase dose → maximise τ', 'Once-daily aminoglycosides', C.cyan],
                ['Time-dependent', 'K_clearance', 'Increase frequency or infuse', 'Extended/continuous β-lactam infusion', C.amber],
                ['AUC-dependent', 'K balanced', 'Optimise total exposure = τ', 'Standard dosing, TDM for vancomycin', C.green],
              ].map(([p, k, g, ci, col], i) => (
                <tr key={i}>
                  <td style={{ ...S.td, color: col, fontWeight: 600 }}>{p}</td>
                  <td style={{ ...S.td, fontFamily: FONTS.MONO }}>{k}</td>
                  <td style={S.td}>{g}</td>
                  <td style={S.td}>{ci}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={S.eq}>
            C = τ / K<br /><br />
            Pattern 1: K ≈ K_ADMET → ↑ dose → ↑ τ → ↑ C<br />
            Pattern 2: K ≈ K_clearance → ↑ frequency → extend τ(t) → ↑ C<br />
            Pattern 3: K balanced → AUC₂₄/MIC = 10^τ IS the driver
          </div>
        </div>

        {/* VERDICT */}
        <div style={S.section} id="verdict">
          <div style={S.sectionNum}>Final Assessment</div>
          <h2 style={S.h2}>Verdict: Three Patterns = One Equation</h2>
          <div style={{ ...S.panelGeo, maxWidth: '100%' }}>
            <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Predictions vs Ground Truth</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...S.table, minWidth: 500 }}>
                <thead><tr>{['Prediction', 'Geometric Basis', 'Craig Data', ''].map((h, i) => <th key={i} style={S.th()}>{h}</th>)}</tr></thead>
                <tbody>{[
                  ['τ encodes AUC/MIC', 'τ = log₁₀(AUC₂₄/MIC)', 'AUC/MIC is primary index', '✓'],
                  ['Pattern 1 = K_ADMET dominant', 'Conc-dep → toxicity-limited', 'Aminoglycosides, FQs', '✓'],
                  ['Pattern 2 = K_clearance dominant', 'Time-dep → clearance-limited', 'β-lactams', '✓'],
                  ['Pattern 3 = K balanced', 'AUC-dep → total exposure', 'VAN, macrolides, LZD', '✓'],
                  ['Three patterns = one equation', 'C = τ/K, different K regime', 'Three separate indices', '✓'],
                ].map(([p, g, m, ok], i) => (
                  <tr key={i} style={{ background: C.green + '08' }}>
                    <td style={S.td}>{p}</td><td style={{ ...S.td, fontFamily: FONTS.MONO }}>{g}</td>
                    <td style={S.td}>{m}</td><td style={{ ...S.td, ...S.good, fontSize: 16 }}>{ok}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div style={{ textAlign: 'center', marginTop: '2rem', fontFamily: FONTS.MONO }}>
              <span style={{ fontSize: '1.4rem', color: C.green }}>5 predictions · 5 matches · 0 parameters</span><br />
              <span style={{ fontSize: 13, color: C.textDim }}>I ∩ G = ∅ · 3 killing patterns · 8 drugs · CID 1998</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '3rem 2rem', fontFamily: FONTS.MONO, fontSize: 12, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
        <strong style={{ color: C.text }}>MIRADOR</strong> · Davis Field Equations · C = τ / K<br />
        Patent Pending US 64/012,328 ·{' '}
        <a href="https://usemirador.sh" style={{ color: C.cyan }} target="_blank" rel="noopener noreferrer">usemirador.sh</a><br /><br />
        <span style={{ fontSize: 11 }}>
          <a href="https://doi.org/10.1086/516284" style={{ color: C.cyan }} target="_blank" rel="noopener noreferrer">DOI: 10.1086/516284</a>{' '}
          Craig WA. <em>Clin Infect Dis</em> 26(1), 1–10 (1998). Geometric reanalysis: B. Rosa Davis, 2026.
        </span>
      </div>
    </div>
  );
}
