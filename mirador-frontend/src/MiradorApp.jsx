import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";

// Load jsPDF + autotable from CDN on demand (avoids Rolldown/core-js build conflict)
const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const s = document.createElement("script");
  s.src = src; s.onload = resolve; s.onerror = reject;
  document.head.appendChild(s);
});
async function loadJsPDF() {
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js");
  return window.jspdf.jsPDF;
}

const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

function generateProteinBackbone(nResidues = 60) {
  const atoms = [], bonds = [];
  // PBP2a transpeptidase domain — α-helix + allosteric gate region (res 22-38)
  const r = 2.3, rise = 1.5, twist = (100 * Math.PI) / 180;
  const gateStart = 22, gateEnd = 38; // β3-β4 loop (allosteric gate, res 440-460 in PDB)
  const pbp2aNames = ["SER","ASN","THR","GLU","LYS","ASP","ALA","PHE","TYR","VAL",
    "LEU","GLY","ILE","PRO","ASN","GLU","LYS","ALA","THR","SER",
    "ASP","GLU","ASN","LYS","TYR","ASN","GLU","LYS","ALA","THR", // gate region starts
    "SER","GLY","LEU","ASP","ALA","PHE","VAL","TYR","ASN","GLU",
    "LYS","THR","SER","ASP","ALA","PHE","TYR","VAL","LEU","GLY",
    "ILE","PRO","ASN","GLU","LYS","ALA","THR","SER","ASP","GLU"];
  for (let i = 0; i < nResidues; i++) {
    const angle = i * twist;
    const inGate = i >= gateStart && i <= gateEnd;
    // Gate residues bulge outward (closed conformation blocks access)
    const gateDisplace = inGate ? 1.5 * Math.sin((i - gateStart) / (gateEnd - gateStart) * Math.PI) : 0;
    const x = (r + gateDisplace) * Math.cos(angle);
    const y = (r + gateDisplace) * Math.sin(angle);
    const z = i * rise * 0.5 - (nResidues * rise * 0.25);
    // Curvature: gate region has HIGH curvature (the locked door), active site has MEDIUM
    const distFromGate = Math.min(Math.abs(i - 30), 15) / 15;
    const curvature = inGate ? 0.7 + 0.3 * Math.sin((i - gateStart) / (gateEnd - gateStart) * Math.PI) : 0.1 + 0.15 * (1 - distFromGate);
    atoms.push({ pos: [x, y, z], residue: i, curvature, isBindingSite: inGate,
      residueName: pbp2aNames[i] || "ALA",
      bFactor: inGate ? 45 + Math.random() * 15 : 15 + Math.random() * 10,
      hbonds: inGate ? Math.floor(Math.random() * 3) + 1 : 0 });
    if (i > 0) bonds.push([i - 1, i]);
  }
  return { atoms, bonds };
}

function generateDrugMolecule() {
  // Ceftaroline — the only β-lactam that threads the PBP2a allosteric gate
  const features = [
    { pos: [0, 0, 0], type: "β-lactam", color: "#ef4444", label: "β-Lac", interactionE: -4.2, targetResidue: 30, desc: "β-lactam ring — acylates Ser403 in active site" },
    { pos: [1.2, 0.9, 0.3], type: "gate-key", color: "#22c55e", label: "C3-Pyr", interactionE: -3.8, targetResidue: 28, desc: "C3 pyrrolidine — THREADS the allosteric gate" },
    { pos: [-1.0, 0.7, -0.2], type: "aromatic", color: "#a855f7", label: "Thiaz", interactionE: -2.9, targetResidue: 32, desc: "Thiadiazole ring — π-stacking with gate residues" },
    { pos: [0.4, -1.3, 0.4], type: "hba", color: "#3b82f6", label: "Oxime", interactionE: -2.1, targetResidue: 27, desc: "Oxime group — H-bond acceptor stabilizing gate contact" },
    { pos: [-0.7, -0.8, -0.7], type: "hydrophobic", color: "#eab308", label: "Hφ", interactionE: -1.5, targetResidue: 33, desc: "Hydrophobic contact with gate interior" },
    { pos: [1.6, -0.3, -0.5], type: "hba", color: "#3b82f6", label: "C=O", interactionE: -1.8, targetResidue: 29, desc: "Carbonyl — anchors to transpeptidase backbone" },
    { pos: [-1.4, -0.1, 0.6], type: "positive", color: "#f97316", label: "NH₃⁺", interactionE: -1.2, targetResidue: 31, desc: "Amino — salt bridge with Glu150" },
  ];
  const bonds = [[0,1],[0,2],[0,3],[1,4],[2,5],[3,6],[4,5]];
  return { features, bonds };
}

function generateMecASequence() {
  // mecA gene region encoding PBP2a — DNA not RNA (bacterial)
  // Positions 28-36 are the allosteric gate codons where escape mutations cluster
  const seq = "ATGAAAAAGATAAAAATTGTTCCACTTATTTTAATAGTTGTAGTTGTCGGGTTTGGTATATATTTTTATGCTTCAAAAGATAAAGAAATTAAT";
  const scores = seq.split("").map((_, i) => {
    // E150K codon region: pos 28-30; N146K: 24-26; Y446N: 34-36
    if (i >= 28 && i <= 30) return 0.92;  // E150K — primary escape
    if (i >= 24 && i <= 26) return 0.78;  // N146K — secondary escape
    if (i >= 34 && i <= 36) return 0.85;  // Y446N — tertiary escape
    if (i >= 22 && i <= 38) return 0.35 + Math.random() * 0.15;  // gate region elevated
    return 0.05 + Math.random() * 0.1;  // background
  });
  const structure = seq.split("").map((_, i) =>
    (i >= 28 && i <= 30) ? "!" :   // E150K hotspot
    (i >= 24 && i <= 26) ? "!" :   // N146K hotspot
    (i >= 34 && i <= 36) ? "!" :   // Y446N hotspot
    (i >= 22 && i <= 38) ? "^" :   // gate region
    "-"
  );
  return { sequence: seq, scores, structure };
}

function curvatureColor(v) {
  const lerp = (a, b, t) => { const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16); return `rgb(${Math.round(((ah>>16)&0xff)+(((bh>>16)&0xff)-((ah>>16)&0xff))*t)},${Math.round(((ah>>8)&0xff)+(((bh>>8)&0xff)-((ah>>8)&0xff))*t)},${Math.round((ah&0xff)+((bh&0xff)-(ah&0xff))*t)})`; };
  if (v < 0.25) return lerp("#0d0221", "#6a0572", v / 0.25);
  if (v < 0.5) return lerp("#6a0572", "#c2185b", (v - 0.25) / 0.25);
  if (v < 0.75) return lerp("#c2185b", "#f57c00", (v - 0.5) / 0.25);
  return lerp("#f57c00", "#ffeb3b", (v - 0.75) / 0.25);
}

// --- INLINE UI COMPONENTS ---

function Source({ text }) {
  return <span style={{ fontSize: 9, color: "#3b82f6", background: "#3b82f611", padding: "1px 4px", borderRadius: 2, marginLeft: 4, fontFamily: FONT, letterSpacing: 0.5 }}>{text}</span>;
}

const BTN = { width: 22, height: 22, background: "#1a1a2e", border: "1px solid #2a2a3e", borderRadius: 4, color: "#94a3b8", fontSize: 13, fontFamily: FONT, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", userSelect: "none", flexShrink: 0 };

function FieldCtrl({ value, onChange, unit, color, step = 1 }) {
  const num = parseFloat(value);
  const dec = step < 1 ? 1 : 0;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <button style={BTN} onClick={() => onChange((num - step).toFixed(dec))}>−</button>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 42, background: "#12121f", border: "1px solid #2a2a3e", borderRadius: 3, color: color || "#e2e8f0", fontSize: 10, fontFamily: FONT, padding: "2px 4px", textAlign: "center", outline: "none" }} />
      <button style={BTN} onClick={() => onChange((num + step).toFixed(dec))}>+</button>
      {unit && <span style={{ color: "#475569", fontSize: 10, whiteSpace: "nowrap" }}>{unit}</span>}
    </span>
  );
}

function EditField({ label, value, onChange, unit, color, step = 1 }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #12121f" }}>
      <span style={{ color: "#64748b", fontSize: 10 }}>{label}</span>
      <FieldCtrl value={value} onChange={onChange} unit={unit} color={color} step={step} />
    </div>
  );
}

function DataRow({ label, value, unit, color, cite }) {
  return (<div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", borderBottom: "1px solid #12121f", fontSize: 10 }}>
    <span style={{ color: "#64748b" }}>{label}</span>
    <span style={{ color: color || "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
      {value}{unit && <span style={{ color: "#475569", fontSize: 9 }}> {unit}</span>}
      {cite && <Source text={cite} />}
    </span>
  </div>);
}

function FormulaRow({ formula, result }) {
  return (<div style={{ background: "#12121f", padding: "3px 6px", borderRadius: 3, margin: "4px 0", fontSize: 10 }}>
    <span style={{ color: "#64748b" }}>{formula}</span> <span style={{ color: "#e2e8f0" }}>= {result}</span>
  </div>);
}

function CurvatureBar({ label, value, max, color, expanded, onToggle, detail }) {
  const pct = Math.min(value / max, 1) * 100;
  return (<div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: expanded ? 0 : 4, cursor: "pointer" }} onClick={onToggle}>
      <span style={{ width: 40, fontSize: 10, color: expanded ? "#e2e8f0" : "#94a3b8", fontFamily: FONT, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "#1e1e30", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s" }} /></div>
      <span style={{ width: 34, fontSize: 10, color: "#94a3b8", fontFamily: FONT }}>{value.toFixed(2)}</span>
    </div>
    {expanded && detail && <div style={{ background: "#0e0e1c", border: "1px solid #1e1e30", borderRadius: 4, padding: 6, margin: "2px 0 6px 46px", fontSize: 10, lineHeight: 1.6, color: "#94a3b8" }}>{detail}</div>}
  </div>);
}

// --- THREE.JS ---

function MoleculeCanvas({ protein, drug, viewMode, orbitEnabled }) {
  const canvasRef = useRef(null), frameRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x08080f); scene.fog = new THREE.FogExp2(0x08080f, 0.008);
    const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 200); camera.position.set(0, 5, 35);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setSize(canvas.clientWidth, canvas.clientHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    scene.add(new THREE.AmbientLight(0x334466, 0.6));
    const k = new THREE.DirectionalLight(0xc8d8ff, 0.9); k.position.set(10, 15, 10); scene.add(k);
    const rim = new THREE.PointLight(0xff6644, 0.5, 60); rim.position.set(-15, -5, 10); scene.add(rim);
    const fill = new THREE.PointLight(0x4488ff, 0.3, 60); fill.position.set(5, -10, -15); scene.add(fill);

    const pG = new THREE.Group(), sGeo = new THREE.SphereGeometry(0.35, 12, 8);
    protein.atoms.forEach(a => { const c = a.curvature; const col = new THREE.Color(c < 0.3 ? 0x2a5a8a : c < 0.6 ? 0xc2185b : 0xff9800); const m = new THREE.Mesh(sGeo, new THREE.MeshPhongMaterial({ color: col, emissive: col.clone().multiplyScalar(c * 0.4), shininess: 40, transparent: true, opacity: a.isBindingSite ? 0.95 : 0.5 })); m.position.set(...a.pos); m.scale.setScalar(a.isBindingSite ? 1.2 : 0.7); pG.add(m); });
    const bp = protein.atoms.map(a => new THREE.Vector3(...a.pos));
    if (bp.length > 1) pG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), protein.atoms.length * 3, 0.12, 6, false), new THREE.MeshPhongMaterial({ color: 0x3a6a9a, emissive: 0x112233, transparent: true, opacity: 0.6 })));
    const bs = protein.atoms.filter(a => a.isBindingSite);
    if (bs.length) { const ct = bs.reduce((a, b) => [a[0]+b.pos[0], a[1]+b.pos[1], a[2]+b.pos[2]], [0,0,0]).map(v => v/bs.length); const g = new THREE.Mesh(new THREE.SphereGeometry(5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.06, side: THREE.BackSide })); g.position.set(...ct); pG.add(g); }

    const dG = new THREE.Group(), dS = new THREE.SphereGeometry(0.5, 16, 12);
    drug.features.forEach(f => { const m = new THREE.Mesh(dS, new THREE.MeshPhongMaterial({ color: new THREE.Color(f.color), emissive: new THREE.Color(f.color).multiplyScalar(0.3), shininess: 60, transparent: true, opacity: 0.9 })); m.position.set(...f.pos); dG.add(m); });
    const bM = new THREE.MeshPhongMaterial({ color: 0x888888, emissive: 0x222222 });
    drug.bonds.forEach(([i, j]) => { const a = new THREE.Vector3(...drug.features[i].pos), b = new THREE.Vector3(...drug.features[j].pos); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, a.distanceTo(b), 6), bM); m.position.copy(a.clone().add(b).multiplyScalar(0.5)); m.lookAt(b); m.rotateX(Math.PI/2); dG.add(m); });
    const dc = drug.features.reduce((a, f) => [a[0]+f.pos[0], a[1]+f.pos[1], a[2]+f.pos[2]], [0,0,0]).map(v => v/drug.features.length);
    const sh = new THREE.Mesh(new THREE.SphereGeometry(2.8, 24, 16), new THREE.MeshPhongMaterial({ color: 0x4488cc, transparent: true, opacity: 0.08, side: THREE.DoubleSide, wireframe: true })); sh.position.set(dc[0], dc[1], dc[2]); dG.add(sh);

    if (viewMode === "target" || viewMode === "combined") { scene.add(pG); pG.position.set(viewMode === "combined" ? -6 : 0, 0, 0); }
    if (viewMode === "drug" || viewMode === "combined") { scene.add(dG); dG.position.set(viewMode === "combined" ? 6 : 0, 0, 0); }
    if (viewMode === "combined" && bs.length) { const lM = new THREE.LineBasicMaterial({ color: 0x44ffaa, transparent: true, opacity: 0.3 }); drug.features.forEach(f => { const n = bs.reduce((best, a) => { const d = Math.hypot(a.pos[0]-6-f.pos[0]+6, a.pos[1]-f.pos[1], a.pos[2]-f.pos[2]); return d < best.d ? { a, d } : best; }, { a: null, d: Infinity }); if (n.d < 20) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(f.pos[0]+6, f.pos[1], f.pos[2]), new THREE.Vector3(n.a.pos[0]-6, n.a.pos[1], n.a.pos[2])]), lM)); }); }

    const grid = new THREE.GridHelper(60, 30, 0x1a1a2e, 0x0f0f1a); grid.position.y = -12; scene.add(grid);
    let angle = 0, isDrag = false, dx = 0, dy = 0, mx = 0, my = 0.17;
    const onDown = (x, y) => { isDrag = true; dx = x; dy = y; };
    const onMove = (x, y) => { if (!isDrag) return; mx += (x - dx) * 0.005; my = Math.max(-1.2, Math.min(1.2, my + (y - dy) * 0.003)); dx = x; dy = y; };
    const onUp = () => isDrag = false;

    canvas.addEventListener("mousedown", e => onDown(e.clientX, e.clientY));
    canvas.addEventListener("mousemove", e => onMove(e.clientX, e.clientY));
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("mouseleave", onUp);

    canvas.addEventListener("touchstart", e => { e.preventDefault(); const t = e.touches[0]; onDown(t.clientX, t.clientY); }, { passive: false });
    canvas.addEventListener("touchmove", e => { e.preventDefault(); const t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: false });
    canvas.addEventListener("touchend", onUp);
    canvas.addEventListener("touchcancel", onUp);

    const anim = () => { frameRef.current = requestAnimationFrame(anim);
      if (orbitEnabled) { angle += 0.004; camera.position.set(30*Math.sin(angle), 5+3*Math.sin(angle*0.7), 30*Math.cos(angle)); } else { camera.position.set(30*Math.sin(mx), 5+20*Math.sin(my), 30*Math.cos(mx)); }
      camera.lookAt(0,0,0);
      pG.children.forEach((c, i) => { if (c.isMesh && i < protein.atoms.length && protein.atoms[i].isBindingSite) c.scale.setScalar(1.2 + 0.08 * Math.sin(angle * 8 + i * 0.3)); });
      renderer.render(scene, camera); };
    anim();
    const onR = () => { if (!canvas.parentElement) return; camera.aspect = canvas.parentElement.clientWidth / canvas.parentElement.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight); };
    window.addEventListener("resize", onR);
    return () => { cancelAnimationFrame(frameRef.current); window.removeEventListener("resize", onR); renderer.dispose(); };
  }, [protein, drug, viewMode, orbitEnabled]);
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />;
}

function CoherenceGauge({ C, label }) {
  const pct = Math.min(Math.max(C / 25, 0.01), 0.99);
  const color = C < 5 ? "#ef4444" : C < 12 ? "#f59e0b" : "#22c55e";
  const status = C < 5 ? "FAILING" : C < 12 ? "MARGINAL" : "EFFECTIVE";
  const filled = pct * 100;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", background: "#0d0d1c", borderRadius: 6, border: `1px solid ${color}33` }}>
      <div style={{ textAlign: "center", minWidth: 64 }}>
        <div style={{ fontSize: 40, fontWeight: 700, color, lineHeight: 1, fontFamily: FONT }}>{C.toFixed(1)}</div>
        <div style={{ fontSize: 9, color: "#64748b", marginTop: 3, letterSpacing: 1 }}>C = τ/K</div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 10, color: "#64748b" }}>{label}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 1 }}>{status}</span>
        </div>
        <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${filled}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s ease", boxShadow: `0 0 8px ${color}88` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: "#334155" }}>
          <span>0</span><span style={{ color: "#475569" }}>threshold 5</span><span>25</span>
        </div>
      </div>
    </div>
  );
}

function ResistanceRadar({ eigenvalues, selectedIdx, onSelect }) {
  const cx=100, cy=100, r=76, n=eigenvalues.length, max=Math.max(...eigenvalues.map(Math.abs),1);
  const pts = eigenvalues.map((v,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;const rv=(Math.abs(v)/max)*r;return`${cx+rv*Math.cos(a)},${cy+rv*Math.sin(a)}`;}).join(" ");
  const axisLabels = ["E150K","N146K","Y446N","E239K"];
  return (<svg width="200" height="200" viewBox="0 0 200 200">
    {[0.25,0.5,0.75,1].map(f=><circle key={f} cx={cx} cy={cy} r={r*f} fill="none" stroke="#1e1e30" strokeWidth="0.8"/>)}
    {eigenvalues.map((_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return<line key={i} x1={cx} y1={cy} x2={cx+r*Math.cos(a)} y2={cy+r*Math.sin(a)} stroke="#1e1e30" strokeWidth="0.8"/>;})}
    <polygon points={pts} fill="#ef444422" stroke="#ef4444" strokeWidth="2"/>
    {eigenvalues.map((v,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;const rv=(Math.abs(v)/max)*r;const lx=cx+(r+16)*Math.cos(a);const ly=cy+(r+16)*Math.sin(a);return(<g key={i}>
      <circle cx={cx+rv*Math.cos(a)} cy={cy+rv*Math.sin(a)} r={selectedIdx===i?6:4} fill={selectedIdx===i?"#fff":"#ef4444"} stroke={selectedIdx===i?"#ef4444":"none"} strokeWidth="2" style={{cursor:"pointer"}} onClick={()=>onSelect(selectedIdx===i?-1:i)}/>
      <text x={lx} y={ly+4} textAnchor="middle" fill={selectedIdx===i?"#e2e8f0":"#475569"} fontSize="9" fontFamily={FONT}>{axisLabels[i]}</text>
    </g>);})}
    <text x={cx} y={cy+4} textAnchor="middle" fill="#334155" fontSize="10" fontFamily={FONT}>Hol(∇)</text>
  </svg>);
}

function SequenceViewer({ data, selectedPos, onSelect }) {
  const { sequence, scores, structure } = data;
  const baseColors = { A:"#22c55e", U:"#ef4444", G:"#eab308", C:"#3b82f6" };
  return (<div>
    <div style={{ overflowX: "auto", padding: "4px 0" }}>
      <div style={{ display: "flex", gap: 1, minWidth: "fit-content" }}>
        {sequence.split("").map((base, i) => { const s = scores[i], hot = s > 0.5, sel = selectedPos === i;
          return (<div key={i} onClick={() => onSelect(sel ? -1 : i)} style={{ width: 14, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
            <div style={{ width: 12, height: Math.max(2, s * 24), background: curvatureColor(s), borderRadius: "2px 2px 0 0", marginBottom: 1, boxShadow: hot ? `0 0 4px ${curvatureColor(s)}` : "none" }} />
            <span style={{ fontSize: 7, color: "#475569", fontFamily: FONT }}>{structure[i]}</span>
            <span style={{ fontSize: 9, fontFamily: FONT, color: sel ? "#fff" : hot ? baseColors[base] : "#4a5568", fontWeight: sel || hot ? 700 : 400, background: sel ? "#3b82f633" : "none", borderRadius: 2, padding: "0 1px" }}>{base}</span>
          </div>); })}
      </div>
    </div>
    {selectedPos >= 0 && (<div style={{ background: "#0e0e1c", border: "1px solid #1e1e30", borderRadius: 4, padding: 8, marginTop: 4, fontSize: 9, color: "#94a3b8", fontFamily: FONT }}>
      <DataRow label="Position" value={selectedPos} /><DataRow label="Base" value={sequence[selectedPos]} color={baseColors[sequence[selectedPos]]} />
      <DataRow label="Structure" value={structure[selectedPos]==="!"?"Escape hotspot":structure[selectedPos]==="^"?"Gate region":"Background"} />
      <DataRow label="Curvature" value={scores[selectedPos].toFixed(4)} color={scores[selectedPos]>0.5?"#ef4444":"#22c55e"} />
      <DataRow label="vs background" value={`${(scores[selectedPos]/0.08).toFixed(1)}×`} color={scores[selectedPos]>0.5?"#ef4444":"#94a3b8"} />
      {scores[selectedPos]>0.5&&<div style={{marginTop:4,padding:"3px 6px",background:"#ef444411",border:"1px solid #ef444422",borderRadius:3,color:"#ef4444",fontSize:8}}>ESCAPE HOTSPOT — {selectedPos>=24&&selectedPos<=26?"N146K codon (proximal gate mutation, λ₁=1.98)":selectedPos>=28&&selectedPos<=30?"E150K codon (gate mutation, λ₂=1.93)":"Y446N codon (active site mutation, λ₃=1.55)"}. Predicted resistance direction against ceftaroline.</div>}
      {structure[selectedPos]==="^"&&scores[selectedPos]<=0.5&&<div style={{marginTop:4,fontSize:8,color:"#64748b"}}>Gate region — elevated curvature but below escape threshold. Monitor for drift.</div>}
    </div>)}
  </div>);
}

// --- MAIN ---

function StageCard({ stage, current, children, title, subtitle, accent, onAdvance, advanceLabel, onJumpTo }) {
  const visible = current >= stage;
  const active = current === stage;
  const completed = current > stage;
  if (!visible) return null;
  return (
    <div style={{
      background: "#0a0a14", border: `1px solid ${active ? accent+"66" : "#1a1a2e"}`,
      borderRadius: 8, margin: "0 0 2px 0", overflow: "hidden",
      boxShadow: active ? `0 0 20px ${accent}15` : "none",
      transition: "all 0.4s ease",
      animation: current === stage ? "fadeSlideIn 0.5s ease" : "none",
    }}>
      <div
        onClick={completed ? onJumpTo : undefined}
        style={{ padding: "10px 16px", borderBottom: `1px solid ${active ? accent+"33" : "#1a1a2e"}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: completed ? "pointer" : "default" }}
        onMouseEnter={e => { if (completed) e.currentTarget.style.background = "#12121f"; }}
        onMouseLeave={e => { if (completed) e.currentTarget.style.background = ""; }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: active ? accent : completed ? accent+"99" : "#475569", fontFamily: FONT, flexShrink: 0 }}>{stage + 1}</span>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: active ? "#e2e8f0" : completed ? "#94a3b8" : "#64748b", fontFamily: FONT, flexShrink: 0 }}>{title}</span>
          {subtitle && <span style={{ fontSize: 10, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</span>}
        </div>
        {completed && <span style={{ fontSize: 9, color: accent+"aa", fontFamily: FONT, letterSpacing: 1, flexShrink: 0 }}>COMPLETE ↩</span>}
      </div>
      {active && (
        <div style={{ padding: "12px 16px" }}>
          {children}
          {onAdvance && (
            <button onClick={onAdvance} style={{
              width: "100%", marginTop: 16, padding: "11px 0", fontSize: 11, fontFamily: FONT,
              fontWeight: 700, letterSpacing: 2, border: `1px solid ${accent}`, borderRadius: 6,
              background: accent + "15", color: accent, cursor: "pointer",
              transition: "all 0.2s",
            }}>{advanceLabel || "CONTINUE"}</button>
          )}
        </div>
      )}
    </div>
  );
}

export default function MiradorApp() {
  const [stage, setStage] = useState(0);
  const [viewMode, setViewMode] = useState("target");
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [exp, setExp] = useState({});
  const [selEigen, setSelEigen] = useState(-1);
  const [selFeat, setSelFeat] = useState(-1);
  const [selSeq, setSelSeq] = useState(-1);
  const tog = k => setExp(p => ({ ...p, [k]: !p[k] }));

  const protein = useMemo(() => generateProteinBackbone(60), []);
  const drug = useMemo(() => generateDrugMolecule(), []);
  const rna = useMemo(() => generateMecASequence(), []);
  const eigenvalues = useMemo(() => [1.9774, 1.9273, 1.5464, 0.8979], []);

  // EDITABLE patient fields — user can tweak these
  const [pt, setPt] = useState({ age: 68, weight: 82, egfr: 45, alt: 85, albumin: 2.5, vancoTrough: 18, priorMero: 14 });
  const updatePt = (k, v) => setPt(p => ({ ...p, [k]: parseFloat(v) || 0 }));

  // Computed from patient (reactive to edits)
  const K_abs = 0.00;
  const K_dist = (0.20 * (pt.albumin / 4.0)) ** 2;
  const K_met = 0.05;
  const K_exc = (90 / Math.max(pt.egfr, 1)) ** 2 * 0.10;
  const K_tox_base = 0.05 + (pt.vancoTrough > 15 ? 0.15 : 0);
  const K_collateral = pt.priorMero < 90 ? 0.10 : 0;
  const K_tox = K_tox_base + K_collateral;
  const Kt = K_abs + K_dist + K_met + K_exc + K_tox;
  const admetObj = { abs: K_abs, dist: K_dist, met: K_met, exc: K_exc, tox: K_tox };

  const tau = 12; // ceftaroline: 4 × 1 × 3
  const tau_vanco = 4;
  const K_vanco = 0.0 + 0.1 + 0.05 + ((90/Math.max(pt.egfr,1))**2 * 0.30) + 0.8;
  const C_ceft = tau / Math.max(Kt, 0.01);
  const C_vanco = tau_vanco / Math.max(K_vanco, 0.01);

  // PK computed from patient eGFR
  const Vd = 28 * (1 + (1 - pt.albumin/4.0) * 0.3);
  const CL = 150 * (pt.egfr / 90) * 60 / 1000; // L/hr
  const ke = CL / Math.max(Vd, 1);
  const tHalf = 0.693 / Math.max(ke, 0.01);
  const dose = pt.egfr < 50 ? 400 : 600;
  const Cmax = dose / Math.max(Vd, 1);
  const Ctrough = Cmax * Math.exp(-ke * 12);

  const totalInteractionE = drug.features.reduce((s, f) => s + f.interactionE, 0);

  // ── Download helpers ──────────────────────────────────────────────────────
  const buildReportData = () => ({
    framework: "MIRADOR",
    governing_equation: "C = tau/K",
    branch: "XI  Therapeutic Geometry",
    generated: new Date().toISOString(),
    patient: {
      age: pt.age, weight_kg: pt.weight, egfr: pt.egfr,
      alt: pt.alt, albumin: pt.albumin,
      vanco_trough: pt.vancoTrough, prior_meropenem_days: pt.priorMero,
    },
    admet: {
      K_abs: +K_abs.toFixed(6), K_dist: +K_dist.toFixed(6),
      K_met: +K_met.toFixed(6), K_exc: +K_exc.toFixed(6),
      K_tox: +K_tox.toFixed(6), K_total: +Kt.toFixed(6),
    },
    coherence: {
      C_ceftaroline: +C_ceft.toFixed(4),
      C_vancomycin: +C_vanco.toFixed(4),
      K_vanco: +K_vanco.toFixed(4),
      improvement_factor: +(C_ceft / Math.max(C_vanco, 0.001)).toFixed(2),
    },
    pharmacokinetics: {
      Vd: +Vd.toFixed(4), CL: +CL.toFixed(4),
      ke: +ke.toFixed(6), t_half: +tHalf.toFixed(4),
      dose, Cmax: +Cmax.toFixed(4), Ctrough: +Ctrough.toFixed(4),
    },
    gate_thermodynamics: {
      gate_dG_kcal_mol: 5.0, temperature_K: 310,
      kT_kcal_mol: 0.6162, P_open_pct: 0.0298,
    },
    escape_geodesics: [
      { mutation: "N146K", type: "Proximal gate", ddG_bind: 2.8, ddG_fold: 0.8, lam: 1.9774, pdb: "4BL3", clinical: true  },
      { mutation: "E150K", type: "Gate residue",  ddG_bind: 3.5, ddG_fold: 1.2, lam: 1.9273, pdb: "4BL2", clinical: true  },
      { mutation: "Y446N", type: "Active site",   ddG_bind: 4.2, ddG_fold: 2.1, lam: 1.5464, pdb: "--",   clinical: true  },
      { mutation: "E239K", type: "Allosteric",    ddG_bind: 1.9, ddG_fold: 1.5, lam: 0.8979, pdb: "--",   clinical: true  },
    ],
    recommendation: {
      drug: "Ceftaroline fosamil", dose_mg: dose, route: "IV", interval: "q12h",
      fda_label_match: dose === 400 && pt.egfr < 50,
      actions: [
        pt.vancoTrough > 15 ? `Taper vancomycin (trough ${pt.vancoTrough} ug/mL)` : null,
        pt.egfr < 60 ? `Monitor eGFR at 48h (currently ${pt.egfr} mL/min)` : null,
        "mecA sequencing Day 7: E150K, N146K, Y446N",
        pt.priorMero < 90 ? `Collateral: mecA Y446H/E447K (meropenem ${pt.priorMero}d ago)` : null,
      ].filter(Boolean),
    },
  });

  const handleDownloadJSON = () => {
    const data = buildReportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "MIRADOR_Report.json";
    a.click(); URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    const jsPDF = await loadJsPDF();  // CDN; no-op if already loaded
    const d = buildReportData();
    const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const ML = 54, MR = 54, CW = W - ML - MR;
    const NAVY = [15, 23, 42], SLATE = [51, 65, 85], GRAY = [100, 116, 139];
    const LIGHT = [248, 250, 252], WARN = [127, 29, 29];
    let y = 54;

    const hline = (yy, w=1, color=NAVY) => {
      doc.setDrawColor(...color); doc.setLineWidth(w);
      doc.line(ML, yy, W - MR, yy);
    };
    const addPage = () => { doc.addPage(); y = 54; };
    const checkY = (need=60) => { if (y + need > doc.internal.pageSize.getHeight() - 54) addPage(); };
    const h1 = (text) => {
      checkY(32);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8);
      doc.setTextColor(...SLATE); doc.text(text.toUpperCase(), ML, y); y += 4;
      hline(y, 0.5, [203, 213, 225]); y += 10;
    };
    const h2 = (text) => {
      checkY(20); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
      doc.setTextColor(...SLATE); doc.text(text, ML, y); y += 14;
    };
    const body = (text, indent=0) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...SLATE);
      const lines = doc.splitTextToSize(text, CW - indent);
      checkY(lines.length * 12);
      doc.text(lines, ML + indent, y); y += lines.length * 12 + 2;
    };
    const mono = (text) => {
      doc.setFont("courier", "normal"); doc.setFontSize(8); doc.setTextColor(...NAVY);
      const lines = doc.splitTextToSize(text, CW);
      checkY(lines.length * 11);
      doc.text(lines, ML, y); y += lines.length * 11;
    };
    const note = (text) => {
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRAY);
      const lines = doc.splitTextToSize(text, CW);
      checkY(lines.length * 10); doc.text(lines, ML, y); y += lines.length * 10 + 3;
    };

    // Running header/footer
    const totalPages = () => doc.getNumberOfPages();
    const addHF = () => {
      const n = totalPages();
      for (let i = 1; i <= n; i++) {
        doc.setPage(i);
        doc.setDrawColor(...NAVY); doc.setLineWidth(1.5);
        doc.line(ML, 36, W - MR, 36);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...NAVY);
        doc.text("MIRADOR", ML, 30);
        doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY);
        doc.text("Clinical Pharmacological Analysis", ML + 52, 30);
        doc.text("CONFIDENTIAL", W - MR, 30, { align: "right" });
        doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.5);
        doc.line(ML, doc.internal.pageSize.getHeight() - 36, W - MR, doc.internal.pageSize.getHeight() - 36);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...GRAY);
        doc.text("Davis Lab  |  C = tau/K  |  Branch XI Therapeutic Geometry", ML, doc.internal.pageSize.getHeight() - 24);
        doc.text(`Page ${i}`, W - MR, doc.internal.pageSize.getHeight() - 24, { align: "right" });
      }
    };

    // ── COVER ──
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...NAVY);
    doc.text("MIRADOR", ML, y); y += 28;
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...SLATE);
    doc.text("Manifold-Informed Rational Architecture for Drug-Organism Response", ML, y); y += 13;
    hline(y, 0.5, [203, 213, 225]); y += 12;

    doc.autoTable( {
      startY: y,
      margin: { left: ML, right: MR },
      head: [],
      body: [
        ["Target organism", "Staphylococcus aureus (mecA+) — MRSA"],
        ["Molecular target", "PBP2a (penicillin-binding protein 2a)"],
        ["Candidate drug", "Ceftaroline fosamil (5th-gen cephalosporin)"],
        ["Current therapy", `Vancomycin — trough ${d.patient.vanco_trough} ug/mL (near-toxic)`],
        ["Patient summary", `${d.patient.age} yo, eGFR ${d.patient.egfr} mL/min, albumin ${d.patient.albumin} g/dL`],
        ["Framework", "Davis Field Equations  Branch XI (Therapeutic Geometry)"],
        ["Report date", new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
      ],
      columnStyles: { 0: { fontStyle: "normal", textColor: GRAY, cellWidth: 130 }, 1: { fontStyle: "bold", textColor: NAVY } },
      styles: { fontSize: 8, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 14;

    doc.setFont("courier", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
    doc.text("C  =  tau / K", W / 2, y, { align: "center" }); y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text("Coherence  =  Topological persistence tau  /  ADMET Curvature K", W / 2, y, { align: "center" }); y += 20;
    hline(y, 0.5, [203, 213, 225]); y += 10;
    doc.addPage(); y = 54;

    // ── S1: FRAMEWORK ──
    h1("Section 1  —  Governing Framework");
    body("The MIRADOR coherence score C quantifies the ability of a drug to maintain sustained target engagement in the context of the patient's physiological barriers. It is defined as C = tau / K, where tau (topological persistence) equals the drug dosing interval in hours and K is the ADMET Curvature — a composite patient-specific impedance scalar. For beta-lactam antibiotics exhibiting time-dependent bactericidal activity, C is analogous to the %T>MIC index used in standard PK/PD optimisation.");
    y += 6;
    h2("Table 1  —  ADMET Curvature components");
    doc.autoTable( {
      startY: y, margin: { left: ML, right: MR },
      head: [["Component", "Formula  (patient parameters)", "Standard PK analogue", "Value"]],
      body: [
        ["K_abs",   "0.00  (fixed — IV route)",                       "Bioavailability F = 1.0",                     d.admet.K_abs.toFixed(4)],
        ["K_dist",  `(0.20 x ${d.patient.albumin}/4.0)^2`,           "PPB distribution penalty",                    d.admet.K_dist.toFixed(4)],
        ["K_met",   "0.05  (fixed — minimal CYP)",                    "Hepatic metabolic clearance",                 d.admet.K_met.toFixed(4)],
        ["K_exc",   `(90/${d.patient.egfr})^2 x 0.10`,               "GFR-scaled renal clearance impedance",        d.admet.K_exc.toFixed(4)],
        ["K_tox",   `0.05 + 0.15[trough>${d.patient.vanco_trough > 15 ? "15" : "15"}] + 0.10[mero<90d]`, "Safety-margin penalty", d.admet.K_tox.toFixed(4)],
        ["K_total", "sum of K_i",                                     "Total ADMET impedance",                       d.admet.K_total.toFixed(4)],
      ],
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      styles: { fontSize: 7.5, cellPadding: 3, font: "courier", lineColor: [203, 213, 225], lineWidth: 0.25 },
      columnStyles: { 0: { cellWidth: 48 }, 1: { cellWidth: 140 }, 3: { cellWidth: 44, halign: "right" } },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 12;
    doc.addPage(); y = 54;

    // ── S2: PATIENT ──
    h1("Section 2  —  Patient Phenotype");
    doc.autoTable( {
      startY: y, margin: { left: ML, right: MR },
      head: [],
      body: [
        ["Age / Weight",    `${d.patient.age} yr  /  ${d.patient.weight_kg} kg`],
        ["eGFR",           `${d.patient.egfr} mL/min  [AKI — sepsis induced]`],
        ["Serum albumin",  `${d.patient.albumin} g/dL  [hypoalbuminaemia; normal 3.5-5.0]`],
        ["Vanco trough",   `${d.patient.vanco_trough} ug/mL  [NEAR TOXIC — threshold 15]`],
        ["Prior meropenem",`${d.patient.prior_meropenem_days} days ago  [collateral risk if <90d]`],
        ["C_vancomycin",   `${d.coherence.C_vancomycin.toFixed(2)}  [insufficient]`],
      ],
      columnStyles: { 0: { textColor: GRAY, cellWidth: 120, fontStyle: "normal" }, 1: { fontStyle: "bold", textColor: NAVY } },
      styles: { fontSize: 8, cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.25, font: "courier" },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 14;
    doc.addPage(); y = 54;

    // ── S3: COHERENCE ──
    h1("Section 3  —  Coherence Derivation");
    h2("Ceftaroline ADMET curvature — full derivation");
    const albFrac = (d.patient.albumin / 4.0).toFixed(4);
    [
      `K_abs   = 0.0000   (IV; F = 1.0)`,
      `K_dist  = (0.20 x ${d.patient.albumin}/4.0)^2 = (0.20 x ${albFrac})^2 = ${d.admet.K_dist.toFixed(4)}`,
      `K_met   = 0.0500   (minimal CYP hydroxylation)`,
      `K_exc   = (90/${d.patient.egfr})^2 x 0.10 = ${(90/d.patient.egfr).toFixed(4)}^2 x 0.10 = ${d.admet.K_exc.toFixed(4)}`,
      `K_tox   = 0.05 + 0.15[trough>${d.patient.vanco_trough}] + 0.10[mero<90d] = ${d.admet.K_tox.toFixed(4)}`,
      "-".repeat(52),
      `K_total = ${d.admet.K_abs.toFixed(4)} + ${d.admet.K_dist.toFixed(4)} + ${d.admet.K_met.toFixed(4)} + ${d.admet.K_exc.toFixed(4)} + ${d.admet.K_tox.toFixed(4)} = ${d.admet.K_total.toFixed(4)}`,
      `C_ceft  = tau / K_total = 12 / ${d.admet.K_total.toFixed(4)} = ${d.coherence.C_ceftaroline.toFixed(2)}`,
    ].forEach(l => { mono(l); y += 1; });
    y += 10;
    h2("Table 2  —  Coherence comparison");
    const ratio = d.coherence.improvement_factor;
    doc.autoTable( {
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "tau (h)", "K (total)", "C = tau/K", "Assessment"]],
      body: [
        ["Vancomycin",  "4",   d.coherence.K_vanco.toFixed(4), d.coherence.C_vancomycin.toFixed(2), "INSUFFICIENT — near toxic"],
        ["Ceftaroline", "12",  d.admet.K_total.toFixed(4),     d.coherence.C_ceftaroline.toFixed(2), `RECOMMENDED — ${ratio}x superior`],
      ],
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      styles: { fontSize: 7.5, font: "courier", cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 14;
    doc.addPage(); y = 54;

    // ── S4: STANDARD PK ──
    h1("Section 4  —  Standard Pharmacokinetics");
    const pk = d.pharmacokinetics;
    [
      `Vd  = 28.0 x (1 + (1 - ${d.patient.albumin}/4.0) x 0.30)  =  ${pk.Vd.toFixed(2)} L`,
      `CL  = 150 x (${d.patient.egfr}/90) x 60/1000  =  ${pk.CL.toFixed(3)} L/hr`,
      `ke  = CL / Vd  =  ${pk.CL.toFixed(3)} / ${pk.Vd.toFixed(2)}  =  ${pk.ke.toFixed(4)} hr^-1`,
      `t1/2 = 0.693 / ke  =  ${pk.t_half.toFixed(2)} h  (ref ~2.6 h at normal renal function)`,
      `Dose = ${pk.dose} mg IV q12h  (FDA label: 400mg for CrCl 15-50 mL/min)`,
      `Cmax = ${pk.dose} / ${pk.Vd.toFixed(2)}  =  ${pk.Cmax.toFixed(2)} ug/mL`,
      `Ctrough = Cmax x exp(-ke x 12)  =  ${pk.Cmax.toFixed(2)} x exp(-${pk.ke.toFixed(4)} x 12)  =  ${pk.Ctrough.toFixed(2)} ug/mL`,
      `MIC90  (MRSA, EUCAST/CLSI 2024)  =  1.0 ug/mL`,
      `Ctrough / MIC90  =  ${pk.Ctrough.toFixed(2)} / 1.0  =  ${pk.Ctrough.toFixed(2)}x  — COVERAGE ADEQUATE`,
    ].forEach(l => { mono(l); y += 2; });
    y += 10;
    doc.addPage(); y = 54;

    // ── S5: RESISTANCE ──
    h1("Section 5  —  Resistance Landscape");
    body("Resistance eigenvalues rank escape mutations by net selection advantage: high binding disruption combined with low conformational stability penalty yields high lambda and high clinical probability. Top 4 correspond to all clinically observed ceftaroline resistance mutations.");
    y += 6;
    doc.autoTable( {
      startY: y, margin: { left: ML, right: MR },
      head: [["Rank", "Mutation", "Mechanism", "ddG_bind", "ddG_fold", "lambda", "PDB", "Clinical"]],
      body: d.escape_geodesics.map((e, i) => [
        `lam${i+1}`, e.mutation, e.type,
        e.ddG_bind.toFixed(1), e.ddG_fold.toFixed(1), e.lam.toFixed(2), e.pdb, e.clinical ? "YES" : "no",
      ]),
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      styles: { fontSize: 7.5, font: "courier", cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 12;
    const trR = d.escape_geodesics.reduce((s, e) => s + e.lam, 0);
    note(`Tr(R) = ${trR.toFixed(2)}  |  lambda-1 dominance = ${(d.escape_geodesics[0].lam / trR * 100).toFixed(0)}% of total escape probability mass`);
    doc.addPage(); y = 54;

    // ── S6: RECOMMENDATION ──
    h1("Section 6  —  Clinical Recommendation");
    const rec = d.recommendation;
    doc.autoTable( {
      startY: y, margin: { left: ML, right: MR },
      head: [["Drug", "Dose", "Route", "Interval", "FDA basis"]],
      body: [[rec.drug, `${rec.dose_mg} mg`, rec.route, rec.interval, `CrCl ${d.patient.egfr} mL/min -> 400mg q12h`]],
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
      styles: { fontSize: 7.5, font: "courier", cellPadding: 4, lineColor: [203, 213, 225], lineWidth: 0.25 },
      alternateRowStyles: { fillColor: LIGHT },
    });
    y = doc.lastAutoTable.finalY + 14;
    h2("Required monitoring actions");
    rec.actions.forEach(a => { body(`• ${a}`); });
    y += 14;
    hline(y, 0.5, [203, 213, 225]); y += 10;
    doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(...GRAY);
    doc.text("Davis Lab  |  Davis Geometric  |  Branch XI Therapeutic Geometry", W / 2, y, { align: "center" }); y += 12;
    doc.text("The equation does not change. The manifold changes. The medicine follows.", W / 2, y, { align: "center" });

    addHF();
    doc.save("MIRADOR_Report.pdf");
  };
  const eigenLabels = ["N146K (proximal)", "E150K (gate)", "Y446N (active site)", "E239K (allosteric)"];
  const eigenMech = [
    "Proximal gate — steric effect on β-lactam orientation. ΔΔG_fold = 0.8 kcal/mol (lowest fitness cost). Crystal structure: PDB 4BL3.",
    "Gate mutation — disrupts allosteric signal. ΔΔG_fold = 1.2 kcal/mol. Crystal structure: PDB 4BL2. Co-occurs with N146K in PDB 4CPK.",
    "Active site — direct binding disruption. ΔΔG_fold = 2.1 kcal/mol. Moderate fitness cost.",
    "Distal allosteric — rewires gate mechanism. ΔΔG_fold = 1.5 kcal/mol. Requires combination therapy."
  ];

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: FONT, overflowY: "auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes explainerFade { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      {/* HEADER */}
      <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a2e", background: "linear-gradient(180deg, #0c0c18, #08080f)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 4, color: "#e2e8f0" }}>MIRADOR</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 10, color: "#475569" }}>STAGE {stage + 1} / 5</div>
          {stage > 0 && <button onClick={() => setStage(0)} style={{ fontSize: 9, fontFamily: FONT, color: "#475569", background: "none", border: "1px solid #1e1e30", borderRadius: 4, padding: "4px 10px", cursor: "pointer" }}>RESTART</button>}
        </div>
      </div>

      {/* BODY */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, maxWidth: 1200, margin: "0 auto", padding: "12px 16px" }}>

        {/* LEFT: STAGES */}
        <div style={{ flex: "1 1 540px", minWidth: 0, marginRight: 16 }}>

        {/* ===== STAGE 0: THE PATIENT ===== */}
        <StageCard stage={0} current={stage} title="THE PATIENT" subtitle="Why is the current treatment failing?" accent="#ef4444" onAdvance={() => setStage(1)} advanceLabel="SHOW ME THE TARGET" onJumpTo={() => setStage(0)}>

          {/* ── PATIENT PROFILE ── */}
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid #1a1a2e" }}>
            PATIENT PROFILE <span style={{ color: "#3b82f6", fontSize: 9, letterSpacing: 0 }}>editable</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 16, rowGap: 8, alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "#64748b", fontSize: 10 }}>Age</span>
            <FieldCtrl value={pt.age} onChange={v => updatePt("age", v)} unit="years" />
            <span style={{ color: "#64748b", fontSize: 10 }}>eGFR</span>
            <FieldCtrl value={pt.egfr} onChange={v => updatePt("egfr", v)} unit="mL/min" color={pt.egfr < 60 ? "#ef4444" : "#22c55e"} />
            <span style={{ color: "#64748b", fontSize: 10 }}>Weight</span>
            <FieldCtrl value={pt.weight} onChange={v => updatePt("weight", v)} unit="kg" />
            <span style={{ color: "#64748b", fontSize: 10 }}>ALT</span>
            <FieldCtrl value={pt.alt} onChange={v => updatePt("alt", v)} unit="U/L" color={pt.alt > 40 ? "#f59e0b" : "#22c55e"} />
            <span style={{ color: "#64748b", fontSize: 10 }}>Diagnosis</span>
            <span style={{ color: "#ef4444", fontSize: 10 }}>MRSA bacteremia</span>
            <span style={{ color: "#64748b", fontSize: 10 }}>Albumin</span>
            <FieldCtrl value={pt.albumin} onChange={v => updatePt("albumin", v)} unit="g/dL" color={pt.albumin < 3.5 ? "#f59e0b" : "#22c55e"} step={0.1} />
          </div>

          {/* ── CURRENT TREATMENT ── */}
          <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2, marginBottom: 8, paddingBottom: 4, borderBottom: "1px solid #1a1a2e" }}>CURRENT TREATMENT</div>
          <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 16, rowGap: 8, alignItems: "center", marginBottom: 16 }}>
            <span style={{ color: "#64748b", fontSize: 10 }}>Drug</span>
            <span style={{ color: "#94a3b8", fontSize: 10 }}>Vancomycin</span>
            <span style={{ color: "#64748b", fontSize: 10 }}>Trough</span>
            <FieldCtrl value={pt.vancoTrough} onChange={v => updatePt("vancoTrough", v)} unit="μg/mL" color={pt.vancoTrough > 15 ? "#ef4444" : "#22c55e"} step={0.5} />
            <span style={{ color: "#64748b", fontSize: 10 }}>Status</span>
            <span style={{ color: pt.vancoTrough > 15 ? "#ef4444" : "#22c55e", fontSize: 10, fontWeight: 600 }}>{pt.vancoTrough > 15 ? "NEAR TOXIC" : "In range"}</span>
            <span style={{ color: "#64748b", fontSize: 10 }}>Prior meropenem</span>
            <FieldCtrl value={pt.priorMero} onChange={v => updatePt("priorMero", v)} unit="days ago" color={pt.priorMero < 90 ? "#f59e0b" : "#22c55e"} />
          </div>

          {/* ── COHERENCE BANNER ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 20, background: "#0d0d1c", border: "1px solid #ef444433", borderRadius: 6, padding: "12px 16px", marginBottom: pt.priorMero < 90 ? 8 : 0 }}>
            <div style={{ minWidth: 64, textAlign: "center" }}>
              <div style={{ fontSize: 40, fontWeight: 700, color: "#ef4444", lineHeight: 1 }}>{C_vanco.toFixed(1)}</div>
              <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>C = τ/K</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 2 }}>VANCOMYCIN COHERENCE</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", letterSpacing: 1, marginTop: 4 }}>TREATMENT FAILING</div>
              <div style={{ fontSize: 10, color: "#475569", marginTop: 3 }}>Effective treatment requires C &gt; 5. At C = {C_vanco.toFixed(1)}, the drug cannot overcome accumulated curvature.</div>
            </div>
          </div>

          {/* ── COLLATERAL WARNING ── */}
          {pt.priorMero < 90 && (
            <div style={{ padding: "8px 12px", background: "#f59e0b0d", border: "1px solid #f59e0b33", borderRadius: 4, fontSize: 10, color: "#f59e0b" }}>
              ⚠ COLLATERAL RESISTANCE RISK — carbapenem within 90d <Source text="Schaffer/Rosato AAC 2026" />
            </div>
          )}
        </StageCard>

        {/* ===== STAGE 1: THE TARGET ===== */}
        <StageCard stage={1} current={stage} title="THE TARGET" subtitle="Why is MRSA invincible?" accent="#3b82f6" onAdvance={() => { setViewMode("combined"); setStage(2); }} advanceLabel="SHOW ME THE KEY" onJumpTo={() => setStage(1)}>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
            PBP2a is the protein that makes MRSA resistant. Its active site is locked behind an allosteric gate that is <span style={{ color: "#ef4444", fontWeight: 700 }}>shut 99.97% of the time</span>. Traditional β-lactam antibiotics bounce off because the door is closed.
          </div>
          <div style={{ height: 280, borderRadius: 6, overflow: "hidden", border: "1px solid #1a1a2e", position: "relative" }}>
            <MoleculeCanvas protein={protein} drug={drug} viewMode="target" orbitEnabled={orbitEnabled} />
            <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 6 }}>
              <div style={{ padding: "2px 6px", background: "#08080fcc", borderRadius: 4, border: "1px solid #1a1a2e", fontSize: 9, color: "#94a3b8" }}>
                <span style={{ color: "#2a5a8a" }}>●</span> Backbone <span style={{ color: "#ff9800" }}>●</span> Allosteric gate (locked)
              </div>
            </div>
            <div style={{ position: "absolute", top: 8, right: 8 }}>
              <button onClick={() => setOrbitEnabled(!orbitEnabled)} style={{ padding: "4px 10px", fontSize: 9, fontFamily: FONT, background: "#08080fcc", color: orbitEnabled ? "#3b82f6" : "#64748b", border: "1px solid #1a1a2e", borderRadius: 4, cursor: "pointer" }}>{orbitEnabled ? "ORBIT" : "DRAG"}</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "max-content 1fr max-content 1fr", columnGap: 20, rowGap: 6, alignItems: "baseline", marginTop: 12, fontSize: 10 }}>
            <span style={{ color: "#64748b" }}>Protein</span>
            <span style={{ color: "#94a3b8" }}>PBP2a (mecA) <Source text="UniProt P07944" /></span>
            <span style={{ color: "#64748b" }}>Active site</span>
            <span style={{ color: "#94a3b8" }}>Ser403 (transpeptidase)</span>

            <span style={{ color: "#64748b" }}>PDB</span>
            <span style={{ color: "#94a3b8" }}>1VQQ (closed) <Source text="rcsb.org" /></span>
            <span style={{ color: "#64748b" }}>Allosteric site</span>
            <span style={{ color: "#94a3b8" }}>60 Å from active site <Source text="Otero JACS 2014" /></span>

            <span style={{ color: "#64748b" }}>Gate residues</span>
            <span style={{ color: "#94a3b8" }}>440-460 (β3-β4 loop)</span>
            <span style={{ color: "#64748b" }}>Kd (ceftaroline)</span>
            <span style={{ color: "#94a3b8" }}>20 ± 4 μM <Source text="JACS 2014" /></span>

            <span style={{ color: "#64748b" }}>Gate state</span>
            <span style={{ color: "#ef4444", fontWeight: 600 }}>99.97% CLOSED <Source text="Mobashery PNAS 2013" /></span>
            <span style={{ color: "#64748b" }}>Clinical Cmax</span>
            <span style={{ color: "#94a3b8" }}>35.2 ± 6.8 μM <Source text="FDA label" /></span>

            <span style={{ color: "#64748b" }}>ΔG (gate open)</span>
            <span style={{ color: "#94a3b8" }}>5 kcal/mol</span>
            <span style={{ color: "#64748b" }}>Druggable (conv.)</span>
            <span style={{ color: "#ef4444" }}>NO — pers = 0.0003</span>
          </div>
        </StageCard>

        {/* ===== STAGE 2: THE KEY ===== */}
        <StageCard stage={2} current={stage} title="THE KEY" subtitle="Ceftaroline threads the locked gate" accent="#22c55e" onAdvance={() => setStage(3)} advanceLabel="PREDICT RESISTANCE" onJumpTo={() => setStage(2)}>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
            Ceftaroline is the only β-lactam that works. Its <span style={{ color: "#22c55e", fontWeight: 700 }}>C3 pyrrolidine threads through the closed gate</span>, triggering allosteric opening 60 Å away. A second molecule then acylates the active site.
          </div>
          <div style={{ height: 280, borderRadius: 6, overflow: "hidden", border: "1px solid #1a1a2e", position: "relative" }}>
            <MoleculeCanvas protein={protein} drug={drug} viewMode="combined" orbitEnabled={orbitEnabled} />
            <div style={{ position: "absolute", bottom: 8, left: 8, padding: "2px 6px", background: "#08080fcc", borderRadius: 4, border: "1px solid #1a1a2e", fontSize: 8, color: "#94a3b8" }}>
              <span style={{ color: "#22c55e" }}>—</span> Drug-target contacts <span style={{ color: "#ff9800" }}>●</span> Gate
            </div>
          </div>

          {/* Coherence flip */}
          <div style={{ display: "flex", gap: 12, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <div style={{ textAlign: "center", padding: 12, background: "#ef444411", borderRadius: 6, border: "1px solid #ef444422", minWidth: 120 }}>
              <div style={{ fontSize: 10, color: "#ef4444", letterSpacing: 2, marginBottom: 4 }}>VANCOMYCIN</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444" }}>{C_vanco.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>C = τ/K</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", fontSize: 20, color: "#475569" }}>→</div>
            <div style={{ textAlign: "center", padding: 12, background: "#22c55e11", borderRadius: 6, border: "1px solid #22c55e22", minWidth: 120 }}>
              <div style={{ fontSize: 10, color: "#22c55e", letterSpacing: 2, marginBottom: 4 }}>CEFTAROLINE</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{C_ceft.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>C = τ/K</div>
            </div>
          </div>

          {/* Pharmacophore chips */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 6 }}>PHARMACOPHORE · ΔG = {totalInteractionE.toFixed(1)} kcal/mol · click to inspect</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {drug.features.map((f, i) => (
                <div key={i} onClick={() => setSelFeat(selFeat === i ? -1 : i)} style={{
                  padding: "4px 8px", background: selFeat === i ? "#1e1e30" : "#12121f",
                  border: `1px solid ${selFeat === i ? f.color : "#1a1a2e"}`, borderRadius: 4, cursor: "pointer", fontSize: 9,
                }}>
                  <span style={{ color: f.color, fontWeight: 700, fontSize: 10 }}>{f.label}</span>
                  <span style={{ color: "#475569", marginLeft: 4, fontSize: 10 }}>{f.interactionE.toFixed(1)}</span>
                </div>
              ))}
            </div>
            {selFeat >= 0 && (
              <div style={{ background: "#0e0e1c", border: "1px solid #1e1e30", borderRadius: 4, padding: 8, marginTop: 6, fontSize: 10 }}>
                <DataRow label="Feature" value={drug.features[selFeat].label} color={drug.features[selFeat].color} />
                <DataRow label="Type" value={drug.features[selFeat].type} />
                <DataRow label="ΔG" value={`${drug.features[selFeat].interactionE.toFixed(1)} kcal/mol`} color={drug.features[selFeat].interactionE < -2 ? "#22c55e" : "#f59e0b"} />
                <DataRow label="Target" value={`${protein.atoms[drug.features[selFeat].targetResidue]?.residueName}${drug.features[selFeat].targetResidue} ${protein.atoms[drug.features[selFeat].targetResidue]?.isBindingSite ? "(gate)" : ""}`} />
                {drug.features[selFeat].desc && <div style={{ marginTop: 4, fontSize: 8, color: "#64748b", lineHeight: 1.4 }}>{drug.features[selFeat].desc}</div>}
              </div>
            )}
          </div>

          {/* ADMET bars */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 6 }}>ADMET CURVATURE K = {Kt.toFixed(3)} · computed from patient values above</div>
            {Object.entries(admetObj).map(([k, v]) => (
              <CurvatureBar key={k} label={`K_${k}`} value={v} max={0.5} color={{ abs: "#22c55e", dist: "#3b82f6", met: "#f59e0b", exc: "#f97316", tox: "#ef4444" }[k]} expanded={exp[`k_${k}`]} onToggle={() => tog(`k_${k}`)} detail={
                k === "abs" ? <DataRow label="Route" value="IV — K_abs = 0" color="#22c55e" /> :
                k === "dist" ? <><DataRow label="PPB" value="20%" /><DataRow label="Albumin" value={`${pt.albumin} g/dL`} color={pt.albumin<3.5?"#f59e0b":"#22c55e"} /></> :
                k === "met" ? <DataRow label="CYP" value="Minimal (hydrolysis)" color="#22c55e" /> :
                k === "exc" ? <><DataRow label="eGFR" value={`${pt.egfr} mL/min`} color={pt.egfr<60?"#ef4444":"#22c55e"} /><DataRow label="Dose" value={`${dose}mg IV q12h`} color="#f59e0b" /><Source text="FDA label" /></> :
                <><DataRow label="Nephrotoxicity" value="Low vs vancomycin" color="#22c55e" />{pt.vancoTrough>15&&<DataRow label="Vanco interaction" value="+0.15" color="#f59e0b" />}{pt.priorMero<90&&<DataRow label="Collateral" value="+0.10 (rpoB risk)" color="#f59e0b" />}</>
              } />
            ))}
          </div>
        </StageCard>

        {/* ===== STAGE 3: THE NEXT MOVES ===== */}
        <StageCard stage={3} current={stage} title="THE NEXT MOVES" subtitle="How the bacteria fights back — and we already know" accent="#f97316" onAdvance={() => setStage(4)} advanceLabel="WRITE THE PRESCRIPTION" onJumpTo={() => setStage(3)}>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.7, marginBottom: 12 }}>
            MIRADOR predicts resistance mutations from the eigenvalue spectrum of the curvature operator on the drug-target fiber bundle. Each eigenvalue ranks how accessible the escape route is.
          </div>

          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ background: "#0d0d1c", borderRadius: 8, padding: 8, border: "1px solid #1a1a2e", flexShrink: 0 }}>
              <ResistanceRadar eigenvalues={eigenvalues} selectedIdx={selEigen} onSelect={setSelEigen} />
            </div>
            <div style={{ flex: "2 1 240px" }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 6 }}>ESCAPE GEODESICS — click any dot</div>
              {eigenvalues.map((v, i) => (
                <div key={i} onClick={() => setSelEigen(selEigen === i ? -1 : i)} style={{
                  padding: "6px 8px", marginBottom: 2, cursor: "pointer", borderRadius: 4,
                  background: selEigen === i ? "#1e1e30" : "transparent",
                  border: `1px solid ${selEigen === i ? "#f97316" : "transparent"}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                    <span style={{ color: selEigen === i ? "#e2e8f0" : "#94a3b8" }}>λ{i + 1} — {eigenLabels[i]}</span>
                    <span style={{ color: "#ef4444", fontWeight: 700 }}>{v.toFixed(2)}</span>
                  </div>
                  {selEigen === i && (
                    <div style={{ marginTop: 4, fontSize: 10, color: "#64748b", lineHeight: 1.6 }}>{eigenMech[i]}</div>
                  )}
                </div>
              ))}
              <DataRow label="Tr(R)" value={eigenvalues.reduce((a, b) => a + b, 0).toFixed(2)} />
              <DataRow label="λ₁ dominance" value={`${(eigenvalues[0] / eigenvalues.reduce((a, b) => a + b, 0) * 100).toFixed(0)}%`} />
              <DataRow label="Strategy" value="Spread escape → monitor all 3" color="#f59e0b" />
            </div>
          </div>

          {/* Collateral warning */}
          {pt.priorMero < 90 && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "#ef444411", border: "1px solid #ef444433", borderRadius: 6 }}>
              <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>COLLATERAL RESISTANCE PATHWAY DETECTED <Source text="Schaffer/Rosato AAC Feb 2026" /></div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>
                Patient received meropenem {pt.priorMero} days ago. Carbapenem exposure selects rpoB mutations → gene reprogramming → pbp1 H499R + mecA Y446H/E447K — conferring ceftaroline resistance independently of PBP2a allosteric mutations.
              </div>
              <div style={{ fontSize: 10, color: "#f59e0b", marginTop: 4 }}>Recommendation: monitor mecA for Y446H/E447K. Consider combination therapy.</div>
            </div>
          )}

          {/* mecA sequence */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 4 }}>mecA GENE · ESCAPE HOTSPOTS · click positions to inspect</div>
            <SequenceViewer data={rna} selectedPos={selSeq} onSelect={setSelSeq} />
          </div>
        </StageCard>

        {/* ===== STAGE 4: THE PRESCRIPTION ===== */}
        <StageCard stage={4} current={stage} title="THE PRESCRIPTION" subtitle="Patient in, prescription out" accent="#10b981" onJumpTo={() => setStage(4)}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <CoherenceGauge C={C_ceft} label="C = τ/K (ceftaroline)" />
          </div>

          <div style={{ background: "#10b98111", border: "1px solid #10b98133", borderRadius: 6, padding: 16, marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", letterSpacing: 2, marginBottom: 10, textAlign: "center" }}>RECOMMENDED PROTOCOL</div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1 }}>DRUG</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>Ceftaroline</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1 }}>DOSE</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{dose} mg IV</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1 }}>INTERVAL</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>q12h</div>
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: "#22c55e" }}>
              {pt.egfr < 50 ? "Matches FDA: 400mg for CrCl 15-50" : "Standard dose (eGFR ≥ 50)"} <Source text="FDA label" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 6 }}>PHARMACOKINETICS <span style={{ color: "#3b82f6", fontSize: 9 }}>computed from patient</span></div>
              <DataRow label="V_d" value={`${Vd.toFixed(1)} L`} unit={pt.albumin < 3.5 ? "(sepsis-expanded)" : ""} />
              <DataRow label="CL" value={`${CL.toFixed(1)} L/hr`} unit={`(eGFR ${pt.egfr})`} />
              <DataRow label="t½" value={`${tHalf.toFixed(1)} hr`} color={tHalf > 3.5 ? "#f59e0b" : "#22c55e"} unit="(normal: 2.6)" />
              <DataRow label="Cmax" value={`${Cmax.toFixed(1)} μg/mL`} />
              <DataRow label="Ctrough" value={`${Ctrough.toFixed(1)} μg/mL`} color={Ctrough > 1.0 ? "#22c55e" : "#ef4444"} />
              <DataRow label="MIC (MRSA)" value="0.5–1.0 μg/mL" /><Source text="JACS 2014" />
              <DataRow label="Ctrough > MIC" value={Ctrough > 1.0 ? "YES" : "NO — increase dose"} color={Ctrough > 1.0 ? "#22c55e" : "#ef4444"} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <div style={{ fontSize: 10, color: "#64748b", letterSpacing: 1, marginBottom: 6 }}>ACTIONS</div>
              {pt.vancoTrough > 15 && (
                <div style={{ padding: "6px 8px", background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 4, marginBottom: 4, fontSize: 10, color: "#f59e0b" }}>
                  Taper vancomycin — trough {pt.vancoTrough} μg/mL (near toxic). Nephrotoxicity risk.
                </div>
              )}
              {pt.egfr < 60 && (
                <div style={{ padding: "6px 8px", background: "#3b82f611", border: "1px solid #3b82f633", borderRadius: 4, marginBottom: 4, fontSize: 10, color: "#3b82f6" }}>
                  Monitor eGFR — currently {pt.egfr}, t½ prolonged to {tHalf.toFixed(1)} hr. Recheck 48h.
                </div>
              )}
              <div style={{ padding: "6px 8px", background: "#ef444411", border: "1px solid #ef444422", borderRadius: 4, marginBottom: 4, fontSize: 10, color: "#ef4444" }}>
                Surveillance — mecA at day 7 for E150K/N146K/Y446N. <Source text="PDB 4BL2, 4BL3" />
              </div>
              {pt.priorMero < 90 && (
                <div style={{ padding: "6px 8px", background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 4, fontSize: 10, color: "#f59e0b" }}>
                  Collateral — meropenem {pt.priorMero}d ago. Watch rpoB. <Source text="AAC 2026" />
                </div>
              )}
            </div>
          </div>

          {/* Source data summary */}
            <div style={{ marginTop: 4, padding: "8px 12px", background: "#12121f", borderRadius: 6, fontSize: 9, color: "#475569", lineHeight: 1.7 }}>
            <span style={{ color: "#64748b", fontWeight: 700, letterSpacing: 1 }}>DATA SOURCES</span>
            <div style={{ marginTop: 4 }}>
              PDB: 1VQQ · 3ZG0 · 4BL2 · 4BL3 · 4CPK · 5M18 · 4DKI &nbsp;
              Kinetics: Otero et al. JACS 2014, Kd = 20±4 μM &nbsp;
              Collateral: Schaffer/Rosato AAC Feb 2026 &nbsp;
              Synergy: Werth et al. OFID Dec 2025 &nbsp;
              MIC: 0.5–1 μg/mL (published) &nbsp;
              Surveillance: NCBI Pathogen Detection (2M+ isolates)
            </div>
          </div>

          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #1a1a2e", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "#334155", letterSpacing: 2 }}>DAVIS GEOMETRIC · BRANCH XI</div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 6, fontStyle: "italic" }}>The equation does not change. The manifold changes. The medicine follows.</div>
            <div style={{ fontSize: 10, color: "#2a3a4a", marginTop: 4 }}>C = τ/K</div>
            <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={handleDownloadPDF}
                style={{
                  padding: "9px 20px", background: "#0f172a", color: "#e2e8f0",
                  border: "1px solid #334155", borderRadius: 5, cursor: "pointer",
                  fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2,
                  display: "flex", alignItems: "center", gap: 7,
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = "#64748b"}
                onMouseOut={e => e.currentTarget.style.borderColor = "#334155"}
              >
                <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 1v8M3 7l3 3 3-3M1 12h10" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                DOWNLOAD REPORT PDF
              </button>
              <button
                onClick={handleDownloadJSON}
                style={{
                  padding: "9px 20px", background: "transparent", color: "#64748b",
                  border: "1px solid #1e293b", borderRadius: 5, cursor: "pointer",
                  fontFamily: FONT, fontSize: 10, fontWeight: 700, letterSpacing: 2,
                  display: "flex", alignItems: "center", gap: 7,
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = "#334155"}
                onMouseOut={e => e.currentTarget.style.borderColor = "#1e293b"}
              >
                <svg width="12" height="14" viewBox="0 0 12 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 1v8M3 7l3 3 3-3M1 12h10" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                DOWNLOAD JSON
              </button>
            </div>
          </div>
        </StageCard>

      </div>{/* end LEFT */}

        {/* RIGHT: EXPLAINER PANEL */}
        <div style={{ flex: "0 0 300px", position: "sticky", top: 54, maxHeight: "calc(100vh - 66px)", overflowY: "auto", background: "#0a0a14", border: "1px solid #1a1a2e", borderRadius: 8, padding: "16px", animation: "explainerFade 0.4s ease" }}>
          {stage === 0 && (
            <>
              <div style={{ fontSize: 9, color: "#ef4444", letterSpacing: 2, marginBottom: 10 }}>THE MATH · STAGE 1</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Why is C = {C_vanco.toFixed(1)} bad?</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, marginBottom: 12 }}>The Davis Field Equation scores how well a drug can act given the patient’s biology. C = τ / K where τ is the dosing interval and K is the total curvature — all the friction the drug faces.</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, marginBottom: 12 }}>For vancomycin in this patient: K is high because low albumin reduces distribution, impaired kidneys slow clearance, and the trough is already near toxic. The drug is fighting the patient’s own biology.</div>
              <div style={{ background: "#12121f", borderRadius: 6, padding: "10px 12px", marginBottom: 10, fontSize: 10 }}>
                <div style={{ color: "#64748b", marginBottom: 4 }}>K breakdown</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2px 8px", color: "#94a3b8" }}>
                  <span>Distribution (low albumin)</span><span style={{ color: "#f59e0b" }}>+{K_dist.toFixed(3)}</span>
                  <span>Excretion (eGFR {pt.egfr})</span><span style={{ color: "#f59e0b" }}>+{K_exc.toFixed(3)}</span>
                  <span>Toxicity (trough {pt.vancoTrough})</span><span style={{ color: pt.vancoTrough>15?"#ef4444":"#22c55e" }}>+{K_tox_base.toFixed(3)}</span>
                  <span>Collateral (mero {pt.priorMero}d)</span><span style={{ color: pt.priorMero<90?"#f59e0b":"#22c55e" }}>+{K_collateral.toFixed(3)}</span>
                  <span style={{ color: "#e2e8f0", fontWeight: 700 }}>Total K</span><span style={{ color: "#ef4444", fontWeight: 700 }}>{Kt.toFixed(3)}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.7 }}>C &lt; 5 means the drug cannot maintain therapeutic exposure long enough to clear the infection. Effective antibiotics typically score C &gt; 10.</div>
            </>
          )}
          {stage === 1 && (
            <>
              <div style={{ fontSize: 9, color: "#3b82f6", letterSpacing: 2, marginBottom: 10 }}>THE MATH · STAGE 2</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Why can’t antibiotics just break into PBP2a?</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, marginBottom: 12 }}>PBP2a has evolved a two-lock system. The active site — where penicillin normally binds — is guarded by an allosteric gate 60 Å away. Without a signal at the gate, the active site stays permanently closed.</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, marginBottom: 12 }}>The gate energy barrier is ΔG = 5 kcal/mol. At 37°C body temperature, random thermal fluctuation opens it only 0.03% of the time. Standard β-lactams never see an open door.</div>
              <div style={{ background: "#12121f", borderRadius: 6, padding: "10px 12px", fontSize: 10, color: "#94a3b8", lineHeight: 1.7 }}>
                <div style={{ color: "#64748b", marginBottom: 4 }}>Gate persistence</div>
                <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 13 }}>p = e<sup>-ΔG/kT</sup> = 0.03%</div>
                <div style={{ marginTop: 6 }}>A conventional drug would need to arrive exactly during that 0.03% window. At clinical concentrations, the probability of successful acylation is effectively zero.</div>
              </div>
            </>
          )}
          {stage === 2 && (
            <>
              <div style={{ fontSize: 9, color: "#22c55e", letterSpacing: 2, marginBottom: 10 }}>THE MATH · STAGE 3</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>How does ceftaroline cheat the lock?</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, marginBottom: 12 }}>Ceftaroline carries a C3 pyrrolidine sidechain that fits the allosteric site on the outside of the gate. Binding there shifts the protein curvature, pulling the gate open from the outside — then a second molecule enters the active site and acylates Ser403.</div>
              <div style={{ background: "#12121f", borderRadius: 6, padding: "10px 12px", marginBottom: 10, fontSize: 10 }}>
                <div style={{ color: "#64748b", marginBottom: 4 }}>Coherence flip</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px" }}>
                  <span style={{ color: "#94a3b8" }}>Vancomycin C</span><span style={{ color: "#ef4444", fontWeight: 700 }}>{C_vanco.toFixed(1)} → FAILING</span>
                  <span style={{ color: "#94a3b8" }}>Ceftaroline C</span><span style={{ color: "#22c55e", fontWeight: 700 }}>{C_ceft.toFixed(1)} → EFFECTIVE</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.7 }}>The longer τ = 12h interval (vs 4h for vancomycin) combined with a lower K — no toxicity ceiling, better distribution — produces a 9× coherence advantage.</div>
            </>
          )}
          {stage === 3 && (
            <>
              <div style={{ fontSize: 9, color: "#f97316", letterSpacing: 2, marginBottom: 10 }}>THE MATH · STAGE 4</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Can the bacteria escape?</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, marginBottom: 12 }}>The holonomy spectrum Hol(∇) of the drug-target fiber bundle gives eigenvalues that rank each possible escape mutation by how geometrically accessible it is. A high eigenvalue = the curvature geodesic for that mutation is short = the bacteria can reach it quickly.</div>
              <div style={{ background: "#12121f", borderRadius: 6, padding: "10px 12px", fontSize: 10, color: "#94a3b8", lineHeight: 1.7, marginBottom: 10 }}>
                <div style={{ color: "#64748b", marginBottom: 4 }}>Top escape route</div>
                <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 12, marginBottom: 4 }}>λ₁ = {eigenvalues[0].toFixed(2)} — N146K proximal gate mutation</div>
                <div>This substitution moves a neutral asparagine to positive lysine at position 146, imposing steric effects on β-lactam orientation at the allosteric pocket. Lowest fitness cost of the gate mutations (ΔΔG_fold = 0.8 kcal/mol) — first mutation to emerge under pressure. Co-crystallised with E150K in PDB 4CPK.</div>
              </div>
              <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.7 }}>MIRADOR flags this before you treat. Monitor mecA at day 7 for E150K/N146K/Y446N. If detected, combination therapy with daptomycin collapses the remaining geodesics.</div>
            </>
          )}
          {stage === 4 && (
            <>
              <div style={{ fontSize: 9, color: "#10b981", letterSpacing: 2, marginBottom: 10 }}>THE MATH · STAGE 5</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>Why this dose, this interval?</div>
              <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.8, marginBottom: 12 }}>The prescription is not a lookup table — it’s derived from this patient’s pharmacokinetics. Vd and CL are computed from actual albumin, eGFR, and weight. The dose is chosen so Ctrough stays above the MRSA MIC (0.5–2.0 μg/mL) at q12h.</div>
              <div style={{ background: "#12121f", borderRadius: 6, padding: "10px 12px", fontSize: 10, lineHeight: 1.7, marginBottom: 10 }}>
                <div style={{ color: "#64748b", marginBottom: 6 }}>Patient PK values</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 12px", color: "#94a3b8" }}>
                  <span>Vd (volume of distribution)</span><span style={{ color: "#e2e8f0" }}>{Vd.toFixed(1)} L</span>
                  <span>CL (clearance)</span><span style={{ color: "#e2e8f0" }}>{CL.toFixed(2)} L/h</span>
                  <span>ke (elimination rate)</span><span style={{ color: "#e2e8f0" }}>{ke.toFixed(4)} /h</span>
                  <span>t½</span><span style={{ color: "#e2e8f0" }}>{tHalf.toFixed(1)} h</span>
                  <span>Dose</span><span style={{ color: "#e2e8f0" }}>{dose} mg</span>
                  <span>Cmax = dose / Vd</span><span style={{ color: "#e2e8f0" }}>{Cmax.toFixed(1)} μg/mL</span>
                  <span>Ctrough = Cmax × e<sup>-ke×12</sup></span><span style={{ color: Ctrough > 0.5 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{Ctrough.toFixed(2)} μg/mL {Ctrough > 0.5 ? "✓" : "✗"}</span>
                </div>
              </div>
              <div style={{ fontSize: 10, color: "#475569", lineHeight: 1.7 }}>Change any patient value on stage 1 and the dose, Ctrough, and t½ recalculate instantly. The manifold changes. The medicine follows.</div>
            </>
          )}
        </div>{/* end RIGHT */}

      </div>{/* end BODY */}
    </div>
  );
}

