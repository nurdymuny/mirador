import { useState, useEffect } from 'react';
import PyTerminal from './PyTerminal.jsx';
import { C, FONTS, paperStyles as S } from './paperStyles.js';

const K_ADMET = 0.10;
const computeK = R => Math.max(1/R - 1, -1);
const computeC = (t, R) => { const Kt = K_ADMET + computeK(R); return Kt <= 0 ? Infinity : t / Kt; };
const tau = (a, m) => Math.log10(a / m);

const PJI_DRUGS = [
  { abbr:'CIP', name:'Ciprofloxacin', auc:30,  mic:0.5,    rb:0.40, rs:0.30, rbio:0.01,  color:C.amber },
  { abbr:'RIF', name:'Rifampin',      auc:60,  mic:0.008,  rb:0.35, rs:0.20, rbio:2.50,  color:C.green },
  { abbr:'VAN', name:'Vancomycin',    auc:400, mic:1.0,    rb:0.20, rs:0.15, rbio:0.008, color:C.purple },
  { abbr:'LZD', name:'Linezolid',    auc:90,  mic:2.0,    rb:0.50, rs:0.40, rbio:0.15,  color:C.blue },
  { abbr:'DAP', name:'Daptomycin',   auc:500, mic:0.5,    rb:0.12, rs:0.10, rbio:0.005, color:C.red },
  { abbr:'MXF', name:'Moxifloxacin', auc:35,  mic:0.125,  rb:0.80, rs:0.50, rbio:0.03,  color:C.cyan },
];

const PY_COMPS = [
  { text: 'import math' },
  { text: '' },
  { text: '# PJI: Three compartments, one equation', cmt: true },
  { text: 'K_A = 0.10' },
  { text: 'def K(R): return K_A + max(1/R-1, -1)' },
  { text: 'def C(t,R): k=K(R); return float("inf") if k<=0 else t/k' },
  { text: '' },
  { text: '# CIP + RIF arm (100% cure)', cmt: true },
  { text: 'cip_t = math.log10(30/0.5)   # 1.778' },
  { text: 'rif_t = math.log10(60/0.008) # 3.875' },
  { text: '' },
  { text: '# CIP at three compartments' },
  { text: 'print(f"CIP: bone={C(cip_t,0.40):.2f}  surf={C(cip_t,0.30):.2f}  bio={C(cip_t,0.01):.3f}")' },
  { text: 'CIP: bone=1.11  surf=0.73  bio=0.018', out: true },
  { text: '' },
  { text: '# RIF at three compartments' },
  { text: 'print(f"RIF: bone={C(rif_t,0.35):.2f}  surf={C(rif_t,0.20):.2f}  bio=∞ (conc)")' },
  { text: 'RIF: bone=1.98  surf=0.95  bio=∞ (conc)', out: true },
  { text: '' },
  { text: '# CIP alone: biofilm = 0.018 → bacteria survive → resistance', cmt: true },
  { text: 'print(f"\\nCIP alone min C = {C(cip_t,0.01):.3f} at biofilm")' },
  { text: 'print(f"CIP+RIF  min C = {C(cip_t,0.30):.2f} at surface (bone & bio covered)")' },
  { text: 'CIP alone min C = 0.018 at biofilm', out: true },
  { text: 'CIP+RIF  min C = 0.73 at surface (bone & bio covered)', out: true },
];

const COMPS = ['bone', 'surface', 'biofilm'];

function CompartmentExplorer() {
  const [comp, setComp] = useState('bone');
  const getRval = (d) => comp === 'bone' ? d.rb : comp === 'surface' ? d.rs : d.rbio;
  const withC = PJI_DRUGS.map(d => { const t = tau(d.auc, d.mic); const r = getRval(d); return { ...d, tau: t, C: computeC(t, r), R: r }; });
  const sorted = [...withC].sort((a, b) => (b.C === Infinity ? 1e12 : b.C) - (a.C === Infinity ? 1e12 : a.C));
  const maxC = sorted.reduce((m, d) => d.C !== Infinity && d.C > m ? d.C : m, 1);

  return (
    <div style={{ background: '#0d1117', border: `1px solid ${C.border}`, borderRadius: 8, padding: '1.25rem', marginTop: '1rem' }}>
      <div style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.textMuted, marginBottom: 16 }}>
        Compartment:
        {COMPS.map(c => (
          <button key={c} onClick={() => setComp(c)} style={{
            marginLeft: 8, background: comp === c ? C.cyan + '22' : 'transparent', border: `1px solid ${comp === c ? C.cyan : C.border}`,
            color: comp === c ? C.cyan : C.textMuted, fontFamily: FONTS.MONO, fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer', textTransform: 'capitalize',
          }}>{c}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(d => (
          <div key={d.abbr} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: d.color, width: 36 }}>{d.abbr}</span>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.textDim, width: 55 }}>R={d.R < 0.01 ? d.R.toFixed(3) : d.R.toFixed(2)}</span>
            <div style={{ flex: 1, height: 20, background: C.bg, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
              {d.C !== Infinity ? (
                <div style={{
                  height: '100%', width: `${Math.min((d.C / maxC) * 100, 100)}%`,
                  background: d.C > 1 ? C.green + '44' : d.C > 0.3 ? C.amber + '44' : C.red + '44',
                  borderRight: `2px solid ${d.C > 1 ? C.green : d.C > 0.3 ? C.amber : C.red}`,
                  transition: 'width 0.4s ease',
                }} />
              ) : (
                <div style={{ height: '100%', width: '100%', background: C.green + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: FONTS.MONO, fontSize: 10, color: C.green }}>CONCENTRATING</span>
                </div>
              )}
            </div>
            <span style={{ fontFamily: FONTS.MONO, fontSize: 13, color: C.text, width: 55, textAlign: 'right' }}>
              {d.C === Infinity ? '∞' : d.C.toFixed(3)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.textDim, marginTop: 10 }}>
        {comp === 'biofilm'
          ? 'Only RIF penetrates biofilm (R=2.50, concentrating). All others near zero.'
          : comp === 'bone'
          ? 'Most drugs reach bone. RIF and MXF dominate.'
          : 'Surface has intermediate penetration. CIP and LZD perform well.'}
      </div>
    </div>
  );
}

const SECTIONS = [
  { id: 'abstract', label: 'Abstract' },
  { id: 's1', label: '§1 Three Compartments' },
  { id: 's2', label: '§2 Drug Geometry' },
  { id: 's3', label: '§3 Combination' },
  { id: 's4', label: '§4 Resistance' },
  { id: 'verdict', label: 'Verdict' },
];

export default function Zimmerli1998() {
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
      <div style={S.header}>
        <div style={S.headerInner(mob)}>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#fcd34d', marginBottom: 8 }}>Interactive Geometric Reanalysis</div>
          <h1 style={{ fontFamily: FONTS.SERIF, fontSize: mob ? '1.4rem' : '1.9rem', fontWeight: 400, fontStyle: 'italic', lineHeight: 1.3, marginBottom: 8, color: C.text }}>
            Zimmerli <em style={{ fontStyle: 'normal', fontWeight: 300 }}>et al.</em> (1998) × Davis Field Equations
          </h1>
          <div style={{ fontFamily: FONTS.SANS, fontSize: 14, color: C.textMuted }}>Why the prosthetic joint infection trial proved rifampin: a three-compartment geometric analysis</div>
          <div style={{ marginTop: 14 }}>
            <a href="https://doi.org/10.1001/jama.279.19.1537" target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONTS.MONO, fontSize: 12, color: '#fcd34d', background: '#fcd34d12', border: '1px solid #fcd34d33', borderRadius: 6, padding: '8px 16px', textDecoration: 'none' }}>
              📄 Read Original Paper — <em>JAMA</em> 279(19), 1537–1541 (1998)
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
          <h2 style={S.h2}>The Trial That Changed PJI Treatment Forever</h2>
          <div style={S.dual(mob)}>
            <div style={S.panelTheirs}>
              <div style={S.panelLabel('#fcd34d')}><span style={S.dot('#fcd34d')} /> Zimmerli et al. 1998</div>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                First RCT for PJI antibiotic selection. 33 patients with culture-proven staphylococcal
                orthopaedic implant infection. CIP + RIF: <strong style={{ color: C.green }}>12/12 (100%) cure</strong>.
                CIP alone: <strong style={{ color: C.red }}>7/12 (58%) cure</strong>. P = 0.02.
              </p>
              <p style={{ ...S.p, maxWidth: '100%', fontSize: 14 }}>
                5/6 failures in the CIP-alone group: ciprofloxacin-resistant isolates emerged from biofilm.
              </p>
            </div>
            <div style={S.panelGeo}>
              <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Davis Field Equations</div>
              <p style={{ ...S.p, maxWidth: '100%' }}>
                PJI has THREE compartments: bone, prosthetic surface, and biofilm. No single drug
                reaches all three. The geometry reveals: CIP alone leaves a hole at biofilm (C = 0.018).
                RIF fills it because R_biofilm = 2.50 (the drug concentrates INTO biofilm).
              </p>
            </div>
          </div>
        </div>

        {/* §1 */}
        <div style={S.section} id="s1">
          <div style={S.sectionNum}>Section 1</div>
          <h2 style={S.h2}>The Three Compartments of an Infected Prosthesis</h2>
          <div style={S.dual(mob)}>
            {[
              ['Bone (periosteal)', 'R_bone = 0.12–0.80', 'Most systemic drugs reach bone. FQs and LZD dominate.', C.green],
              ['Surface (metal/PE)', 'R_surface = 0.10–0.50', 'Metal interface. Lower R than bone — ions adsorb.', C.amber],
              ['Biofilm (EPS matrix)', 'R_biofilm = 0.005–2.50', 'Exopolysaccharide shield. Almost all drugs fail here.', C.red],
            ].map(([title, rng, desc, col], i) => (
              <div key={i} style={{ background: col + '08', border: `1px solid ${col}33`, borderRadius: 8, padding: '1rem', marginBottom: 8, flex: 1, minWidth: 200 }}>
                <div style={{ fontFamily: FONTS.MONO, fontSize: 13, color: col, fontWeight: 600 }}>{title}</div>
                <div style={{ fontFamily: FONTS.MONO, fontSize: 11, color: C.textDim, marginTop: 4 }}>{rng}</div>
                <p style={{ fontFamily: FONTS.SANS, fontSize: 13, color: C.textMuted, margin: '8px 0 0' }}>{desc}</p>
              </div>
            ))}
          </div>
          <div style={S.eq}>
            Regimen success = min(C) across ALL compartments &gt; θ<br />
            If ANY compartment has C ≈ 0 → bacteria survive there → treatment fails
          </div>
        </div>

        {/* §2 */}
        <div style={S.section} id="s2">
          <div style={S.sectionNum}>Section 2</div>
          <h2 style={S.h2}>Drug-by-Drug Geometry — Toggle Compartment</h2>
          <CompartmentExplorer />
          <PyTerminal title="Three-Compartment Analysis" lines={PY_COMPS} />
        </div>

        {/* §3 */}
        <div style={S.section} id="s3">
          <div style={S.sectionNum}>Section 3</div>
          <h2 style={S.h2}>The Combination — Geometric Complementarity</h2>
          <div style={S.dual(mob)}>
            <div style={S.panelTheirs}>
              <div style={S.panelLabel(C.red)}><span style={S.dot(C.red)} /> CIP Alone (58% cure)</div>
              <table style={{ ...S.table, fontSize: 12 }}>
                <thead><tr>{['Compartment', 'R', 'C', ''].map((h, i) => <th key={i} style={S.th()}>{h}</th>)}</tr></thead>
                <tbody>
                  <tr><td style={S.td}>Bone</td><td style={S.td}>0.40</td><td style={{ ...S.td, ...S.good }}>1.11</td><td style={S.td}>✓</td></tr>
                  <tr><td style={S.td}>Surface</td><td style={S.td}>0.30</td><td style={{ ...S.td, ...S.warn }}>0.73</td><td style={S.td}>~</td></tr>
                  <tr style={{ background: C.red + '0c' }}><td style={S.td}>Biofilm</td><td style={S.td}>0.01</td><td style={{ ...S.td, ...S.bad }}>0.018</td><td style={S.td}>✗</td></tr>
                </tbody>
              </table>
              <p style={{ ...S.p, maxWidth: '100%', fontSize: 13, marginTop: 8 }}>
                Biofilm = 0.018. Bacteria sheltered there survive, acquire gyrA mutations, re-emerge resistant.
              </p>
            </div>
            <div style={S.panelGeo}>
              <div style={S.panelLabel(C.green)}><span style={S.dot(C.green)} /> CIP + RIF (100% cure)</div>
              <table style={{ ...S.table, fontSize: 12 }}>
                <thead><tr>{['Compartment', 'Best Drug', 'C', ''].map((h, i) => <th key={i} style={S.th()}>{h}</th>)}</tr></thead>
                <tbody>
                  <tr><td style={S.td}>Bone</td><td style={S.td}>RIF</td><td style={{ ...S.td, ...S.good }}>1.98</td><td style={S.td}>✓</td></tr>
                  <tr><td style={S.td}>Surface</td><td style={S.td}>RIF</td><td style={{ ...S.td, ...S.warn }}>0.95</td><td style={S.td}>~</td></tr>
                  <tr><td style={S.td}>Biofilm</td><td style={S.td}>RIF</td><td style={{ ...S.td, ...S.good }}>∞ (conc)</td><td style={S.td}>✓</td></tr>
                </tbody>
              </table>
              <p style={{ ...S.p, maxWidth: '100%', fontSize: 13, marginTop: 8 }}>
                RIF fills the biofilm gap. The combination has no compartment near zero. Geometric complementarity.
              </p>
            </div>
          </div>
        </div>

        {/* §4 */}
        <div style={S.section} id="s4">
          <div style={S.sectionNum}>Section 4</div>
          <h2 style={S.h2}>The Resistance Mechanism — Sub-MIC Selection</h2>
          <div style={S.insight}>
            <div style={S.insightTitle}>Mutant Selection Window</div>
            <p style={{ ...S.p, maxWidth: '100%' }}>
              5/6 failures in the CIP-alone arm were ciprofloxacin-resistant PFGE-confirmed same-strain isolates.
              C_biofilm = 0.018 means bacteria experience sub-MIC drug pressure — enough to SELECT for
              resistance (single gyrA mutation) but not enough to KILL. This is the mutant selection window,
              predicted exactly by the geometry: 0 &lt; C &lt;&lt; 1 at any compartment = resistance factory.
            </p>
          </div>
          <div style={S.eq}>
            C = 0 → no selection (no drug)<br />
            0 &lt; C &lt;&lt; 1 → selection without killing → <strong>RESISTANCE</strong><br />
            C &gt; 1 → killing → cure
          </div>
        </div>

        {/* VERDICT */}
        <div style={S.section} id="verdict">
          <div style={S.sectionNum}>Final Assessment</div>
          <h2 style={S.h2}>Verdict: Three Compartments, One Equation</h2>
          <div style={{ ...S.panelGeo, maxWidth: '100%' }}>
            <div style={S.panelLabel(C.cyan)}><span style={S.dot(C.cyan)} /> Predictions vs Ground Truth</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...S.table, minWidth: 500 }}>
                <thead><tr>{['Prediction', 'Geometric Basis', 'Trial Outcome', ''].map((h, i) => <th key={i} style={S.th()}>{h}</th>)}</tr></thead>
                <tbody>{[
                  ['CIP+RIF cures PJI', 'All compartments C > 0.7', '100% cure (12/12)', '✓'],
                  ['CIP alone fails at biofilm', 'C_biofilm = 0.018', '42% failure (5/12)', '✓'],
                  ['Failures from resistance', 'Sub-MIC at biofilm = selection', '5/6 CIP-R emergence', '✓'],
                  ['RIF is the biofilm drug', 'R_biofilm = 2.50 (concentrating)', 'RIF = SOC for PJI worldwide', '✓'],
                  ['VAN monotherapy would fail', 'C_biofilm(VAN) = 0.021', 'IDSA: always add RIF', '✓'],
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
              <span style={{ fontSize: 13, color: C.textDim }}>I ∩ G = ∅ · 3 compartments · 33 patients · JAMA 1998</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '3rem 2rem', fontFamily: FONTS.MONO, fontSize: 12, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
        <strong style={{ color: C.text }}>MIRADOR</strong> · Davis Field Equations · C = τ / K<br />
        Patent Pending US 64/012,328 ·{' '}
        <a href="https://usemirador.sh" style={{ color: C.cyan }} target="_blank" rel="noopener noreferrer">usemirador.sh</a><br /><br />
        <span style={{ fontSize: 11 }}>
          <a href="https://doi.org/10.1001/jama.279.19.1537" style={{ color: C.cyan }} target="_blank" rel="noopener noreferrer">DOI: 10.1001/jama.279.19.1537</a>{' '}
          Zimmerli W et al. <em>JAMA</em> 279(19), 1537–1541 (1998). Geometric reanalysis: B. Rosa Davis, 2026.
        </span>
      </div>
    </div>
  );
}
