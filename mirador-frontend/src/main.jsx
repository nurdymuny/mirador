import { useState, useEffect, lazy, Suspense, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MiradorApp from './MiradorApp.jsx'
import MiradorSite from './MiradorSite.jsx'
import KeskeApp from './KeskeApp.jsx'
import KeskeVisualizations from './KeskeVisualizations.jsx'
import TbApp from './TbApp.jsx'
const HivApp = lazy(() => import('./HivApp.jsx?v=4'));
const MeningitisApp = lazy(() => import('./MeningitisApp.jsx'));
const SciencePage = lazy(() => import('./SciencePage.jsx'));
const GigiExplorer = lazy(() => import('./GigiExplorer.jsx'));
const PapersPage = lazy(() => import('./papers/PapersPage.jsx'));
const SheafLab = lazy(() => import('./SheafLab.jsx'));

const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div style={{ color: '#ef4444', padding: 40, fontFamily: FONT, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Module crashed</div>
        <div style={{ fontSize: 10, color: '#94a3b8', maxWidth: 600, margin: '0 auto', wordBreak: 'break-word' }}>{String(this.state.error)}</div>
        <button onClick={() => { this.setState({ error: null }); window.location.hash = ''; }} style={{ marginTop: 16, padding: '8px 24px', background: '#1e1e30', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontFamily: FONT }}>← Back to Home</button>
      </div>
    );
    return this.props.children;
  }
}

const TABS = [
  { key: 'demo',   label: 'MIRADOR CORE',  hash: '#demo',   color: '#3b82f6' },
  { key: 'keske',  label: 'KESKE METHOD',  hash: '#keske',  color: '#f97316' },
  { key: 'tb',     label: 'TB MODULE',     hash: '#tb',     color: '#22c55e', isNew: true },
  { key: 'hiv',    label: 'HIV RESERVOIR', hash: '#hiv',    color: '#ef4444', isNew: true },
  { key: 'meningitis', label: 'MENINGITIS', hash: '#meningitis', color: '#f59e0b', isNew: true },
  { key: 'science', label: 'THE SCIENCE', hash: '#pkpd', color: '#a78bfa' },
  { key: 'explorer', label: 'DB EXPLORER', hash: '#explorer', color: '#22d3ee', isNew: true },
  { key: 'papers', label: 'PAPERS', hash: '#papers', color: '#f59e0b', isNew: true },
  { key: 'sheaflab', label: 'SHEAF LAB', hash: '#sheaflab', color: '#2dd4bf', isNew: true },
];

function TabBar({ page }) {
  const [mobMenuOpen, setMobMenuOpen] = useState(false);
  const isMob = typeof window !== 'undefined' && window.innerWidth < 640;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, background: '#03030a', borderBottom: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', gap: 0, paddingLeft: 8, fontFamily: FONT }}>
      {/* Home button */}
      <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', fontSize: 10, fontWeight: 700, letterSpacing: 2, color: '#e2e8f0', textDecoration: 'none', borderRight: '1px solid #1a1a2e' }}>
        ← HOME
      </a>

      {/* Desktop tabs */}
      {!isMob && TABS.map(tab => {
        const active = page === tab.key;
        return (
          <a key={tab.key} href={tab.hash}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '9px 16px', fontSize: 10, fontWeight: active ? 700 : 400, letterSpacing: 2, color: active ? tab.color : '#475569', borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent', textDecoration: 'none', transition: 'color 0.2s', cursor: 'pointer', userSelect: 'none' }}
            onMouseOver={e => { if (!active) e.currentTarget.style.color = '#94a3b8'; }}
            onMouseOut={e => { if (!active) e.currentTarget.style.color = '#475569'; }}>
            {tab.label}
            {tab.isNew && <span style={{ fontSize: 7, background: tab.color + '33', color: tab.color, border: `1px solid ${tab.color}55`, borderRadius: 3, padding: '1px 4px', letterSpacing: 1 }}>NEW</span>}
          </a>
        );
      })}

      {/* Mobile: current module label + hamburger */}
      {isMob && (
        <>
          <span style={{ flex: 1, padding: '9px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 2, color: TABS.find(t => t.key === page)?.color || '#e2e8f0' }}>
            {TABS.find(t => t.key === page)?.label || ''}
          </span>
          <button onClick={() => setMobMenuOpen(!mobMenuOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ display: 'block', width: 18, height: 2, background: '#e2e8f0', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 18, height: 2, background: '#e2e8f0', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 18, height: 2, background: '#e2e8f0', borderRadius: 2 }} />
          </button>
        </>
      )}

      {/* Mobile dropdown */}
      {isMob && mobMenuOpen && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#03030a', borderBottom: '1px solid #1a1a2e', display: 'flex', flexDirection: 'column', zIndex: 99 }}>
          {TABS.map(tab => {
            const active = page === tab.key;
            return (
              <a key={tab.key} href={tab.hash} onClick={() => setMobMenuOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '12px 20px', fontSize: 10, fontWeight: active ? 700 : 400, letterSpacing: 2, color: active ? tab.color : '#64748b', borderLeft: active ? `3px solid ${tab.color}` : '3px solid transparent', textDecoration: 'none', background: active ? tab.color + '08' : 'transparent' }}>
                {tab.label}
                {tab.isNew && <span style={{ fontSize: 7, background: tab.color + '33', color: tab.color, border: `1px solid ${tab.color}55`, borderRadius: 3, padding: '1px 4px', letterSpacing: 1 }}>NEW</span>}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

function getPage() {
  if (window.location.hash === '#demo') return 'demo';
  if (window.location.hash === '#keske') return 'keske';
  if (window.location.hash === '#visuals') return 'visuals';
  if (window.location.hash === '#tb') return 'tb';
  if (window.location.hash === '#hiv') return 'hiv';
  if (window.location.hash === '#meningitis') return 'meningitis';
  if (window.location.hash === '#pkpd') return 'science';
  if (window.location.hash === '#explorer') return 'explorer';
  if (window.location.hash === '#papers') return 'papers';
  if (window.location.hash === '#sheaflab') return 'sheaflab';
  return 'home';
}

function App() {
  const [page, setPage] = useState(getPage());
  useEffect(() => {
    const handler = () => setPage(getPage());
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const goDemo = () => { window.location.hash = 'demo'; };
  const showTabBar = ['demo', 'keske', 'tb', 'hiv', 'meningitis', 'science', 'explorer', 'papers', 'sheaflab'].includes(page);
  const tabSpacer = <div style={{ height: 38 }} />;

  if (page === 'demo') return <><TabBar page={page} />{tabSpacer}<MiradorApp /></>;
  if (page === 'keske') return <><TabBar page={page} />{tabSpacer}<KeskeApp /></>;
  if (page === 'tb') return <><TabBar page={page} />{tabSpacer}<TbApp /></>;
  if (page === 'hiv') return <><TabBar page={page} />{tabSpacer}<ErrorBoundary><Suspense fallback={<div style={{color:'#475569',padding:40,fontFamily:FONT,textAlign:'center'}}>Loading HIV module…</div>}><HivApp /></Suspense></ErrorBoundary></>;
  if (page === 'meningitis') return <><TabBar page={page} />{tabSpacer}<ErrorBoundary><Suspense fallback={<div style={{color:'#475569',padding:40,fontFamily:FONT,textAlign:'center'}}>Loading Meningitis module…</div>}><MeningitisApp /></Suspense></ErrorBoundary></>;
  if (page === 'science') return <><TabBar page={page} />{tabSpacer}<ErrorBoundary><Suspense fallback={<div style={{color:'#475569',padding:40,fontFamily:FONT,textAlign:'center'}}>Loading Science page…</div>}><SciencePage /></Suspense></ErrorBoundary></>;
  if (page === 'explorer') return <><TabBar page={page} />{tabSpacer}<ErrorBoundary><Suspense fallback={<div style={{color:'#475569',padding:40,fontFamily:FONT,textAlign:'center'}}>Loading Explorer…</div>}><GigiExplorer /></Suspense></ErrorBoundary></>;
  if (page === 'papers') return <><TabBar page={page} />{tabSpacer}<ErrorBoundary><Suspense fallback={<div style={{color:'#475569',padding:40,fontFamily:FONT,textAlign:'center'}}>Loading Papers…</div>}><PapersPage /></Suspense></ErrorBoundary></>;
  if (page === 'sheaflab') return <><TabBar page={page} />{tabSpacer}<ErrorBoundary><Suspense fallback={<div style={{color:'#475569',padding:40,fontFamily:FONT,textAlign:'center'}}>Loading Sheaf Lab…</div>}><SheafLab /></Suspense></ErrorBoundary></>;
  if (page === 'visuals') return <KeskeVisualizations />;
  return <MiradorSite onLaunchDemo={goDemo} />;
}

createRoot(document.getElementById('root')).render(<App />)

