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
  // ─── future papers go here ───
  // {
  //   id: 'kjellsson-2012',
  //   title: 'Kjellsson et al. (2012)',
  //   subtitle: 'PK of TB drugs in infected rabbit lungs',
  //   journal: 'AAC',
  //   ...
  // },
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

          {/* Coming soon placeholder */}
          <div style={{
            background: C.bgCard,
            border: `1px dashed ${C.border}`,
            borderRadius: 10,
            padding: '1.75rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 200,
          }}>
            <div style={{ fontFamily: FONTS.MONO, fontSize: 24, color: C.textDim, marginBottom: 8 }}>+</div>
            <div style={{ fontFamily: FONTS.MONO, fontSize: 12, color: C.textDim, letterSpacing: 1, textTransform: 'uppercase' }}>More papers coming</div>
            <div style={{ fontFamily: FONTS.SANS, fontSize: 13, color: C.textDim, marginTop: 8, textAlign: 'center', maxWidth: 280 }}>
              Kjellsson 2012, Gillespie 2014, Dartois 2024, and more will receive the same geometric treatment.
            </div>
          </div>
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
