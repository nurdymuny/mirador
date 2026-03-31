# TOPOLOGY & GEOMETRY — UI Integration Spec

> **Status:** Draft  
> **Date:** 2026-03-31  
> **Scope:** GigiExplorer.jsx — surface Sprint A + Sprint B GIGI endpoints in the MIRADOR frontend  
> **File:** `mirador-frontend/src/GigiExplorer.jsx` (1,244 lines)  
> **Baseline commit:** `af7ad85`  
> **Tests:** 324 total (319 pass, 5 todo) — `mirador-frontend/src/GigiExplorer.test.js`

---

## Background

Sprint A shipped three topology/geometry REST + GQL endpoints:

| Endpoint | REST | GQL | Status |
|----------|------|-----|--------|
| Betti numbers | `GET /v1/bundles/{name}/betti` | `BETTI bundle` | **Working** |
| Entropy | `GET /v1/bundles/{name}/entropy` | `ENTROPY bundle` | **Working** |
| Free energy | `GET /v1/bundles/{name}/free-energy?tau=X` | `FREEENERGY bundle AT X` | **Working** |

Sprint B added two more:

| Endpoint | REST | GQL | Status |
|----------|------|-----|--------|
| Geodesic distance | `POST /v1/bundles/{name}/geodesic` | `GEODESIC bundle FROM id=X TO id=Y [MAX_HOPS N]` | **Working** (GQL returns -1 sentinel for no path) |
| Metric tensor | `GET /v1/bundles/{name}/metric` | `METRIC bundle` | **Working** (empty matrix = no numeric fibers; GQL returns condition_number scalar) |

None of these currently surface in the UI. Four changes are needed.

---

## Change 1 — `PRESETS_TOPOLOGY` Array

**What:** New preset array with 8 pre-built GQL queries for topology/geometry endpoints.  
**Where:** After `PRESETS_UNIVERSE` (ends at line 401), before `NL_QUESTIONS` (line 403).  
**Risk:** Zero — data-only, no JSX, no logic.  
**Size:** ~12 lines.

### Code

Insert after line 401 (`];` closing `PRESETS_UNIVERSE`):

```js
const PRESETS_TOPOLOGY = [
  { label: '🔢 Betti numbers (drugs)',       gql: 'BETTI mirador_drugs;' },
  { label: '🔢 Betti numbers (thresholds)',  gql: 'BETTI mirador_thresholds;' },
  { label: '📊 Entropy (drugs)',             gql: 'ENTROPY mirador_drugs;' },
  { label: '📊 Entropy (ChEMBL)',            gql: 'ENTROPY chembl_activities;' },
  { label: '🌡️ Free energy (drugs, τ=4)',    gql: 'FREEENERGY mirador_drugs AT 4.0;' },
  { label: '🌡️ Free energy (drugs, τ=7)',    gql: 'FREEENERGY mirador_drugs AT 7.0;' },
  { label: '📏 Geodesic (drugs, 0→1)',       gql: 'GEODESIC mirador_drugs FROM id=0 TO id=1;' },
  { label: '📐 Metric tensor (drugs)',       gql: 'METRIC mirador_drugs;' },
];
```

### Notes

- All presets work on live connection (GIGI commit `2348247` fixed GQL routing for GEODESIC/METRIC).
- Metric presets return `{"value": 0}` for bundles without numeric fibers — this is expected.

---

## Change 2 — Sidebar TOPOLOGY Section

**What:** New sidebar section rendering `PRESETS_TOPOLOGY` buttons.  
**Where:** After the SHEAF COMPLETION `</div>` (line 1010), before the HISTORY `{history.length > 0 &&` block (line 1011).  
**Risk:** Low — copy-paste of existing sidebar pattern, insertion between two independent blocks.  
**Size:** ~18 lines.

### Code

Insert after line 1010 (closing `</div>` of SHEAF COMPLETION button container):

```jsx
          <div style={{ fontSize: 9, color: MAINTENANCE_MODE ? '#4a3020' : demoMode ? '#0a4a3a' : '#10b981', letterSpacing: 2, marginTop: 16, marginBottom: 6, fontWeight: 700 }}>TOPOLOGY & GEOMETRY {(MAINTENANCE_MODE || demoMode) && <span style={{ fontSize: 7, color: '#475569' }}>{MAINTENANCE_MODE ? '🔧 MAINT' : '🔒 LIVE'}</span>}</div>
          <div style={{ fontSize: 8, color: '#475569', marginBottom: 8, lineHeight: 1.4 }}>
            Betti numbers, entropy, free energy, geodesic distance, metric tensor — Sprint A+B topology endpoints
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: MAINTENANCE_MODE ? 0.3 : demoMode ? 0.45 : 1, pointerEvents: MAINTENANCE_MODE ? 'none' : 'auto' }}>
            {PRESETS_TOPOLOGY.map((p, i) => (
              <button key={'tp'+i}
                onClick={() => { setQuery(p.gql); runQuery(p.gql); }}
                style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '7px 10px', color: '#94a3b8', fontSize: 10, fontFamily: FONT, textAlign: 'left', cursor: MAINTENANCE_MODE ? 'not-allowed' : 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onMouseOver={e => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#34d399'; e.currentTarget.style.borderColor = '#064e3b'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'transparent'; }}>
                {p.label}
              </button>
            ))}
          </div>
```

### Design Choices

| Property | Value | Rationale |
|----------|-------|-----------|
| Color | `#10b981` (emerald-500) | Distinct from existing sections: blue (clinical), green (BindingDB), cyan (trials), purple (PGx), pink (ChEMBL), cyan (universe), amber (sheaf) |
| Hover color | `#34d399` / `#064e3b` border | Emerald family, consistent intensity |
| Key prefix | `'tp'` | Avoids collision with `'c'`, `'bdb'`, `'ct'`, `'pgx'`, `'ch'`, `'u'`, `'sh'` |
| Live-only gating | `opacity: 0.45` + `pointerEvents: 'auto'` in demo | Same pattern as BindingDB/ClinTrials/PGx/ChEMBL — these queries need the live GIGI server |
| Position | After SHEAF, before HISTORY | Logical grouping: data sources → sheaf computation → topology analysis → history |

---

## Change 3 — `restCall` Helper Function

**What:** Reusable async function for making REST GET calls to the GIGI server.  
**Where:** After `runQuery` closes (line 741, the `}, [query, host, demoMode, connected]);` line), before the NL translation effect.  
**Risk:** Zero — standalone function, no existing code modified.  
**Size:** ~8 lines.

### Code

Insert after line 741:

```js
  // REST helper — used by BundleInfoCard for topology endpoints
  const restCall = useCallback(async (path) => {
    if (!connected || demoMode) return null;
    try {
      const resp = await fetch(`${host}${path}`);
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  }, [host, connected, demoMode]);
```

### Notes

- Returns `null` on any failure (network, 4xx, 5xx) — consumer decides how to handle.
- Depends on `host`, `connected`, `demoMode` — same deps as `runQuery`.
- `useCallback` memoized to avoid re-creating on every render.

---

## Change 4 — `BundleInfoCard` Component

**What:** Inline topology summary card that appears above query results when the user runs a `DESCRIBE` query on a bundle while connected to the live server. Fetches betti + entropy REST endpoints, displays β₀, β₁, entropy inline.  
**Where:** After `MetaPanel` component (ends at line 572), before `ResultTable` component (starts at line 575).  
**Risk:** Low — self-contained component, only renders when `connected && !demoMode && query matches DESCRIBE`.  
**Size:** ~75 lines.

### Component Spec

```
┌─────────────────────────────────────────────────────────────────┐
│ TOPOLOGY                                                 🔄    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│ │ β₀       │ │ β₁       │ │ ENTROPY  │ │ CONDITION        │   │
│ │ 3        │ │ 0        │ │ 2.4519   │ │ —                │   │
│ └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Code

Insert after line 572 (closing `}` of `MetaPanel`):

```jsx
function BundleInfoCard({ bundleName, host, connected, demoMode }) {
  const [topo, setTopo] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bundleName || !connected || demoMode) { setTopo(null); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`${host}/v1/bundles/${bundleName}/betti`).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${host}/v1/bundles/${bundleName}/entropy`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([betti, entropy]) => {
      if (cancelled) return;
      setTopo({ betti, entropy });
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [bundleName, host, connected, demoMode]);

  if (!connected || demoMode || !bundleName) return null;
  if (loading) return (
    <div style={{ display: 'flex', gap: 16, padding: '8px 0', alignItems: 'center' }}>
      <span style={{ fontSize: 9, color: '#64748b', letterSpacing: 2 }}>TOPOLOGY</span>
      <span style={{ fontSize: 10, color: '#475569' }}>Loading…</span>
    </div>
  );
  if (!topo) return null;

  const items = [];
  if (topo.betti) {
    const bn = topo.betti.betti_numbers || topo.betti;
    if (Array.isArray(bn)) {
      if (bn.length > 0) items.push({ label: 'β₀', value: bn[0] });
      if (bn.length > 1) items.push({ label: 'β₁', value: bn[1] });
      if (bn.length > 2) items.push({ label: 'β₂', value: bn[2] });
    }
  }
  if (topo.entropy) {
    const e = topo.entropy.entropy ?? topo.entropy.value ?? topo.entropy;
    if (typeof e === 'number') items.push({ label: 'ENTROPY', value: e.toFixed(4) });
  }

  if (items.length === 0) return null;

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 9, color: '#10b981', letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>TOPOLOGY</div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {items.map(it => (
          <div key={it.label} style={{ background: '#0a1a14', borderRadius: 6, padding: '8px 14px', border: '1px solid #064e3b' }}>
            <div style={{ fontSize: 9, color: '#10b981', letterSpacing: 1 }}>{it.label}</div>
            <div style={{ fontSize: 16, color: '#e2e8f0', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {it.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Rendering

In the results area, the `BundleInfoCard` renders when the current query is a `DESCRIBE` query. Insert in the results rendering section where `ResultTable` is shown.

**Detection logic** (inline, no separate function):
```js
const describedBundle = /^DESCRIBE\s+(\w+)/i.exec(query)?.[1] || null;
```

**JSX** — insert above the `ResultTable` render:
```jsx
{describedBundle && <BundleInfoCard bundleName={describedBundle} host={host} connected={connected} demoMode={demoMode} />}
```

### Integration Points

| Location | Line | What to add |
|----------|------|-------------|
| After `resultStatus` declaration | ~815 | `const describedBundle = ...` extraction |
| Before `ResultTable` render | ~1237 | `{describedBundle && <BundleInfoCard ... />}` |

---

## Deferred (Not In This Spec)

These are parked for future sprints. Do not implement now.

| Feature | Reason to defer |
|---------|----------------|
| **Free energy sweep chart** | Needs `recharts` dependency — don't want to add deps without discussion |
| **Geodesic search panel** | Complex form (bundle selector, from/to ID inputs, max hops slider) — needs its own spec |
| **Metric tensor heatmap** | Metric returns empty for all current bundles (no numeric fibers) — visual heatmap pointless until bundles have numeric data |
| **New tabs** | Overcomplicates the 10-tab layout — presets + BundleInfoCard are sufficient for now |
| **Roadmap badges** | Cosmetic — no functional value |

---

## Execution Plan

| Step | Changes | Risk | Verify |
|------|---------|------|--------|
| 1 | Change 1 + Change 2 (presets + sidebar) | Zero + Low | `npm run dev` → visual check sidebar shows TOPOLOGY section |
| 2 | Change 3 + Change 4 (restCall + BundleInfoCard) | Zero + Low | `npm run dev` → click "📋 Describe" preset → confirm β₀/β₁/entropy card appears |
| 3 | Run full test suite | — | `npx vitest run` → 324 pass, 0 fail |
| 4 | Commit | — | `git add -A && git commit -m "feat: topology sidebar + BundleInfoCard (Sprint A+B UI)"` |

---

## GIGI Team Dependencies

All Sprint B bugs resolved in GIGI commit `2348247` (deployed 2026-03-31):

1. ~~Metric REST returns empty~~ — **Expected behavior**: bundles without numeric fiber fields return empty matrix. `condition_number` now returns `0` instead of `null` (was `f64::INFINITY`).
2. ~~GQL routing missing GEODESIC/METRIC~~ — **Fixed**: both GQL keywords now route correctly. GEODESIC returns `-1` sentinel for no path, METRIC returns condition_number scalar.

All 5 `.todo` tests converted to active assertions — **324/324 green**.
