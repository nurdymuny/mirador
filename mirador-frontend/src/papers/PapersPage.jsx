import { useState } from 'react';
import PapersIndex from './PapersIndex.jsx';
import Prideaux2015 from './Prideaux2015.jsx';
import { C, FONTS } from './paperStyles.js';

const MONO = FONTS.MONO;

/* ═══ PAPER COMPONENT REGISTRY ═══ */
const PAPER_COMPONENTS = {
  'prideaux-2015': Prideaux2015,
  // Add future papers here:
  // 'kjellsson-2012': Kjellsson2012,
};

export default function PapersPage() {
  const [paper, setPaper] = useState(null);

  const Component = paper ? PAPER_COMPONENTS[paper] : null;

  if (Component) {
    return (
      <div>
        {/* Back button pinned at top-left, below the main tab bar */}
        <div style={{
          position: 'sticky', top: 38, zIndex: 60,
          background: C.bgDeep + 'ee', backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${C.border}`,
          padding: '6px 16px',
        }}>
          <button
            onClick={() => { setPaper(null); window.scrollTo(0, 0); }}
            style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: 4,
              color: C.textMuted, fontFamily: MONO, fontSize: 11, padding: '4px 14px',
              cursor: 'pointer', letterSpacing: 1,
            }}
            onMouseOver={e => { e.currentTarget.style.color = C.cyan; e.currentTarget.style.borderColor = C.cyan; }}
            onMouseOut={e => { e.currentTarget.style.color = C.textMuted; e.currentTarget.style.borderColor = C.border; }}
          >
            ← ALL PAPERS
          </button>
        </div>
        <Component />
      </div>
    );
  }

  return <PapersIndex onSelect={(id) => { setPaper(id); window.scrollTo(0, 0); }} />;
}
