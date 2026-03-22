import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MiradorApp from './MiradorApp.jsx'
import MiradorSite from './MiradorSite.jsx'
import KeskeApp from './KeskeApp.jsx'
import KeskeVisualizations from './KeskeVisualizations.jsx'

function getPage() {
  if (window.location.hash === '#demo') return 'demo';
  if (window.location.hash === '#keske') return 'keske';
  if (window.location.hash === '#visuals') return 'visuals';
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

  if (page === 'demo') return <MiradorApp />;
  if (page === 'keske') return <KeskeApp />;
  if (page === 'visuals') return <KeskeVisualizations />;
  return <MiradorSite onLaunchDemo={goDemo} />;
}

createRoot(document.getElementById('root')).render(<App />)

