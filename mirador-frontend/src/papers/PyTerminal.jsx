import { useState, useEffect, useRef } from 'react';

const MONO = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

/**
 * Mock Python REPL terminal. Auto-runs on scroll into view.
 * 
 * lines: [{ text: string, out?: bool, cont?: bool, cmt?: bool }]
 *   - Default → ">>> text" (green prompt, white code)
 *   - out    → "text" (cyan output, no prompt)
 *   - cont   → "... text" (continuation prompt)
 *   - cmt    → ">>> text" rendered in gray
 */
export default function PyTerminal({ lines, title = 'Computation' }) {
  const [count, setCount] = useState(0);
  const [blink, setBlink] = useState(true);
  const ref = useRef(null);
  const ran = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !ran.current) { ran.current = true; run(); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (count < lines.length) return;
    const iv = setInterval(() => setBlink(b => !b), 530);
    return () => clearInterval(iv);
  }, [count, lines.length]);

  function run() {
    setCount(0);
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setCount(i);
      if (i >= lines.length) clearInterval(iv);
    }, 100);
  }

  const dot = (c) => ({ width: 10, height: 10, borderRadius: '50%', background: c, display: 'inline-block' });

  return (
    <div ref={ref} style={{ background: '#0a0e17', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden', margin: '1rem 0', fontFamily: MONO, fontSize: 13 }}>
      {/* Header */}
      <div style={{ background: '#111827', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={dot('#ef4444')} /><span style={dot('#f59e0b')} /><span style={dot('#22c55e')} />
          <span style={{ marginLeft: 10, fontSize: 11, color: '#64748b', letterSpacing: 0.5 }}>Python 3.11 — {title}</span>
        </div>
        <button
          onClick={run}
          style={{ background: '#1e293b', color: '#22c55e', border: '1px solid #334155', borderRadius: 4, padding: '3px 14px', fontSize: 11, fontFamily: MONO, cursor: 'pointer', letterSpacing: 1, transition: 'background 0.2s' }}
          onMouseOver={e => e.currentTarget.style.background = '#334155'}
          onMouseOut={e => e.currentTarget.style.background = '#1e293b'}
        >▶ Run</button>
      </div>
      {/* Body */}
      <div style={{ padding: '12px 16px', lineHeight: 1.85, overflowX: 'auto', minHeight: 40 }}>
        {lines.slice(0, count).map((l, i) => (
          <div key={i} style={{ whiteSpace: 'pre' }}>
            {l.out ? (
              <span style={{ color: '#22d3ee' }}>{l.text}</span>
            ) : (
              <>
                <span style={{ color: '#22c55e', userSelect: 'none' }}>{l.cont ? '... ' : '>>> '}</span>
                <span style={{ color: l.cmt ? '#6b7280' : '#e2e8f0' }}>{l.text}</span>
              </>
            )}
          </div>
        ))}
        {count >= lines.length && (
          <div>
            <span style={{ color: '#22c55e' }}>{'>>> '}</span>
            <span style={{ color: '#22c55e', opacity: blink ? 1 : 0, transition: 'opacity 0.15s' }}>▌</span>
          </div>
        )}
      </div>
    </div>
  );
}
