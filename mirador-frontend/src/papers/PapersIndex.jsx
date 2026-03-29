import { useState } from 'react';
import { C, FONTS, paperStyles as S } from './paperStyles.js';

/* ═══ PAPER REGISTRY — add new papers here ═══ */
export const PAPERS = [
  {
    id: 'prideaux-2015',
    title: 'Prideaux et al. (2015)',
    subtitle: 'TB drug distribution in human pulmonary lesions',
    journal: 'Nature Medicine',
    doi: '10.1038/nm.3937',
    year: 2015,
    predictions: 6,
    matches: 6,
    status: 'complete',
    tags: ['TB', 'MALDI', 'PK/PD', 'rank inversion'],
    color: C.cyan,
    summary: 'Geometric reanalysis of MALDI mass-spectrometry imaging of TB drug penetration into granuloma compartments. The Davis Field Equations predict the MXF↔RIF rank inversion, the REMoxTB trial failure, and all 6 MALDI patterns from published R values alone.',
  },
  {
    id: 'kjellsson-2012',
    title: 'Kjellsson et al. (2012)',
    subtitle: 'ELF and cellular PK/PD of TB drugs in infected rabbit lungs',
    journal: 'Antimicrob Agents Chemother',
    doi: '10.1128/AAC.00266-12',
    year: 2012,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['TB', 'ELF', 'PK/PD', 'rabbit'],
    color: C.green,
    summary: 'Geometric reanalysis of drug penetration into rabbit lung ELF and alveolar cells. C = τ/K reproduces the MXF↔RIF rank inversion and PZA ELF dominance from published R values alone.',
  },
  {
    id: 'gillespie-2014',
    title: 'Gillespie et al. (2014)',
    subtitle: 'Four-arm TB trial with drug penetration into lesion compartments',
    journal: 'Lancet',
    doi: '10.1016/S0140-6736(13)62388-0',
    year: 2014,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['TB', 'REMoxTB', 'clinical trial', 'caseum'],
    color: C.amber,
    summary: 'Geometry predicts the REMoxTB trial failure: MXF↔RIF rank inversion in caseum means MXF-replacing-RIF arm cannot suppress sterilizing-phase relapse. Five predictions, five matches.',
  },
  {
    id: 'letendre-2010',
    title: 'Letendre et al. (2010)',
    subtitle: 'CPE score and CSF HIV-RNA suppression',
    journal: 'Arch Neurol',
    doi: '10.1001/archneurol.2009.357',
    year: 2010,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['HIV', 'CNS', 'CPE', 'BBB'],
    color: '#f472b6',
    summary: 'CNS Penetration Effectiveness (CPE) scores recast as geometric coherence. Higher CPE correlates with CSF viral suppression — the geometry reproduces the ranking from R values.',
  },
  {
    id: 'best-2011',
    title: 'Best et al. (2011)',
    subtitle: 'Efavirenz concentrations in CSF exceed IC50',
    journal: 'J Antimicrob Chemother',
    doi: '10.1093/jac/dkr139',
    year: 2011,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['HIV', 'CNS', 'efavirenz', 'CSF'],
    color: C.blue,
    summary: 'Efavirenz crosses the BBB with R = 0.005–0.01 yet achieves CSF concentrations above IC50. The geometry explains: extraordinary potency (τ > 5) overcomes a massive K_barrier.',
  },
  {
    id: 'zimmerli-1998',
    title: 'Zimmerli et al. (1998)',
    subtitle: 'Bone and joint infection treatment with antibiotic penetration',
    journal: 'N Engl J Med',
    doi: '10.1056/NEJM199808203390806',
    year: 1998,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['PJI', 'bone', 'biofilm', 'ortho'],
    color: C.green,
    summary: 'Prosthetic joint infection treatment recast as geometric coherence at the bone-biofilm interface. RIF dominance and the VAN paradox (high MIC reverses ranking) both predicted by C = τ/K.',
  },
  {
    id: 'landersdorfer-2009',
    title: 'Landersdorfer et al. (2009)',
    subtitle: 'Bone PK of antibiotics — penetration ratios',
    journal: 'Clin Pharmacokinet',
    doi: '10.2165/00003088-200948020-00002',
    year: 2009,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['bone', 'PK', 'penetration', 'ortho'],
    color: '#fb923c',
    summary: 'Comprehensive bone penetration ratios for 20+ antibiotics. The geometry ranks drugs by C = τ/K at the bone compartment and correctly predicts which drugs achieve therapeutic levels.',
  },
  {
    id: 'craig-1998',
    title: 'Craig (1998)',
    subtitle: 'PK/PD parameters: rationale for antibacterial dosing',
    journal: 'Clin Infect Dis',
    doi: '10.1086/516284',
    year: 1998,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['PK/PD', 'killing patterns', 'AUC/MIC', 'T>MIC'],
    color: C.cyan,
    summary: 'The foundational PK/PD paper. Craig\'s three killing patterns (concentration-dependent, time-dependent, AUC-dependent) are three K regimes of one equation C = τ/K, not three separate models.',
  },
  {
    id: 'lipinski-2001',
    title: 'Lipinski et al. (2001)',
    subtitle: 'Rule of Five — solubility and permeability estimation',
    journal: 'Adv Drug Deliv Rev',
    doi: '10.1016/S0169-409X(00)00129-0',
    year: 2001,
    predictions: 5,
    matches: 5,
    status: 'complete',
    tags: ['RO5', 'drug-likeness', 'ADMET', 'oral'],
    color: '#f97316',
    summary: 'The Rule of Five is a binary K_ADMET threshold. The geometry makes it continuous: each Lipinski parameter contributes to K, and C = τ/K determines whether a drug works despite violations.',
  },
  {
    id: 'nau-2010',
    title: 'Nau, Sörgel & Eiffert (2010)',
    subtitle: 'BBB/BCB drug penetration for CNS infections',
    journal: 'Clin Microbiol Rev',
    doi: '10.1128/CMR.00007-10',
    year: 2010,
    predictions: 7,
    matches: 7,
    status: 'complete',
    tags: ['CNS', 'BBB', 'meningitis', 'CSF'],
    color: C.purple,
    summary: 'The definitive BBB review. Meningeal inflammation reshuffles drug rankings: hydrophilic drugs surge as BBB opens, while lipophilic drugs are minimally affected. The geometry quantifies the rank inversion.',
  },
];

export default function PapersIndex({ onSelect }) {
  const [hover, setHover] = useState(null);
  const mob = typeof window !== 'undefined' && window.innerWidth < 800;

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ ...S.header, padding: '4rem 0 3rem' }}>
        <div style={S.headerInner(mob)}>
          <div style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: C.amber, marginBottom: 12 }}>
            Geometric Reanalysis Series
          </div>
          <h1 style={{ fontFamily: FONTS.SERIF, fontSize: mob ? '1.6rem' : '2.2rem', fontWeight: 400, fontStyle: 'italic', color: C.text, lineHeight: 1.3, marginBottom: 12 }}>
            Paper Reanalyses
          </h1>
          <p style={{ fontFamily: FONTS.SANS, fontSize: 15, color: C.textMuted, maxWidth: 640, lineHeight: 1.7 }}>
            Each paper is reanalyzed through the Davis Field Equations. The geometry is applied to
            independently published data — no fitting, no training, no parameters. Every prediction
            is verifiable from open inputs against published ground truth.
          </p>
          <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
            {[
              { n: PAPERS.length, label: 'Papers' },
              { n: PAPERS.reduce((s, p) => s + p.predictions, 0), label: 'Predictions' },
              { n: PAPERS.reduce((s, p) => s + p.matches, 0), label: 'Matches' },
              { n: 0, label: 'Parameters' },
            ].map(({ n, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: FONTS.MONO, fontSize: 28, fontWeight: 700, color: C.green }}>{n}</div>
                <div style={{ fontFamily: FONTS.MONO, fontSize: 10, letterSpacing: 1, color: C.textDim, textTransform: 'uppercase' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Paper cards */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: mob ? '2rem 16px' : '3rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(480px, 1fr))', gap: '1.5rem' }}>
          {PAPERS.map((p, i) => (
            <div
              key={p.id}
              onClick={() => onSelect(p.id)}
              onMouseOver={() => setHover(i)}
              onMouseOut={() => setHover(null)}
              style={{
                background: hover === i ? C.bgPanel : C.bgCard,
                border: `1px solid ${hover === i ? p.color + '55' : C.border}`,
                borderRadius: 10,
                padding: '1.75rem',
                cursor: 'pointer',
                transition: 'all 0.25s',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Accent bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: p.color }} />

              {/* Journal + year */}
              <div style={{ fontFamily: FONTS.MONO, fontSize: 11, letterSpacing: 1, color: p.color, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.journal} · {p.year}</span>
                <span style={{ background: C.green + '20', color: C.green, padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700 }}>
                  {p.matches}/{p.predictions} MATCHED
                </span>
              </div>

              {/* Title */}
              <h3 style={{ fontFamily: FONTS.SERIF, fontSize: '1.2rem', fontWeight: 400, fontStyle: 'italic', color: C.text, marginBottom: 6 }}>
                {p.title}
              </h3>
              <p style={{ fontFamily: FONTS.SANS, fontSize: 14, color: C.textMuted, marginBottom: 12 }}>
                {p.subtitle}
              </p>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {p.tags.map(t => (
                  <span key={t} style={{ fontFamily: FONTS.MONO, fontSize: 10, padding: '2px 8px', borderRadius: 3, background: C.border, color: C.textDim }}>
                    {t}
                  </span>
                ))}
              </div>

              {/* Summary */}
              <p style={{ fontFamily: FONTS.SANS, fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
                {p.summary}
              </p>

              {/* Arrow */}
              <div style={{ fontFamily: FONTS.MONO, fontSize: 12, color: p.color, marginTop: 12 }}>
                Read reanalysis →
              </div>
            </div>
          ))}


        </div>
      </div>

      {/* Methodology footer */}
      <div style={{ textAlign: 'center', padding: '3rem 2rem', fontFamily: FONTS.MONO, fontSize: 12, color: C.textDim, borderTop: `1px solid ${C.border}` }}>
        <strong style={{ color: C.text }}>MIRADOR</strong> · Davis Field Equations · C = τ / K<br />
        Patent Pending US 64/012,328 ·{' '}
        <a href="https://usemirador.sh" style={{ color: C.cyan }} target="_blank" rel="noopener noreferrer">usemirador.sh</a><br /><br />
        <span style={{ fontSize: 11 }}>
          Each reanalysis maintains I ∩ G = ∅ — inputs and ground truth share zero data.
        </span>
      </div>
    </div>
  );
}
