import { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import MiradorApp from './MiradorApp.jsx'
import MiradorSite from './MiradorSite.jsx'

function App() {
  const [page, setPage] = useState(
    window.location.hash === '#demo' ? 'demo' : 'home'
  );
  useEffect(() => {
    const handler = () =>
      setPage(window.location.hash === '#demo' ? 'demo' : 'home');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const goDemo = () => { window.location.hash = 'demo'; };

  return page === 'demo' ? <MiradorApp /> : <MiradorSite onLaunchDemo={goDemo} />;
}

createRoot(document.getElementById('root')).render(<App />)

