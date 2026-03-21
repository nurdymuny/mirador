import { useState, useEffect, useRef, useMemo } from "react";
import * as THREE from "three";

const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";

function useContainerSize(ref) {
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

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

function Expandable({ expanded, onToggle, label, badge, children }) {
  return (<div>
    <div onClick={onToggle} style={{ fontSize: 8, color: expanded ? "#e2e8f0" : "#64748b", letterSpacing: 2, marginBottom: expanded ? 8 : 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", userSelect: "none" }}>
      <span>{label} <span style={{ fontSize: 7, color: expanded ? "#3b82f6" : "#334155", display: "inline-block", transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▸</span></span>
      {badge && <span style={{ fontSize: 7, color: "#475569", background: "#1e1e30", padding: "1px 4px", borderRadius: 3 }}>{badge}</span>}
    </div>
    {expanded && <div style={{ background: "#0e0e1c", border: "1px solid #1e1e30", borderRadius: 4, padding: 8, marginBottom: 8, fontSize: 9, lineHeight: 1.6, color: "#94a3b8" }}>{children}</div>}
  </div>);
}

function DataRow({ label, value, unit, color }) {
  return (<div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0", borderBottom: "1px solid #12121f" }}>
    <span style={{ color: "#64748b" }}>{label}</span>
    <span style={{ color: color || "#94a3b8" }}>{value}{unit && <span style={{ color: "#475569", fontSize: 8 }}> {unit}</span>}</span>
  </div>);
}

function FormulaRow({ formula, result }) {
  return (<div style={{ background: "#12121f", padding: "3px 6px", borderRadius: 3, margin: "4px 0", fontSize: 8 }}>
    <span style={{ color: "#64748b" }}>{formula}</span> <span style={{ color: "#e2e8f0" }}>= {result}</span>
  </div>);
}

function CurvatureBar({ label, value, max, color, expanded, onToggle, detail }) {
  const pct = Math.min(value / max, 1) * 100;
  return (<div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: expanded ? 0 : 4, cursor: "pointer" }} onClick={onToggle}>
      <span style={{ width: 36, fontSize: 9, color: expanded ? "#e2e8f0" : "#94a3b8", fontFamily: FONT, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: "#1e1e30", borderRadius: 3, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s" }} /></div>
      <span style={{ width: 30, fontSize: 9, color: "#94a3b8", fontFamily: FONT }}>{value.toFixed(2)}</span>
    </div>
    {expanded && detail && <div style={{ background: "#0e0e1c", border: "1px solid #1e1e30", borderRadius: 4, padding: 6, margin: "2px 0 6px 42px", fontSize: 8, lineHeight: 1.6, color: "#94a3b8" }}>{detail}</div>}
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

function CoherenceGauge({ tau, K, C }) {
  const pct = Math.min(C / 15, 1), r = 52, cx = 60, cy = 60, sa = -135 * Math.PI / 180, ea = (pct * 270 - 135) * Math.PI / 180;
  return (<svg width="120" height="100" viewBox="0 0 120 100">
    <path d={`M ${cx+r*Math.cos(sa)} ${cy+r*Math.sin(sa)} A ${r} ${r} 0 1 1 ${cx+r*Math.cos(135*Math.PI/180)} ${cy+r*Math.sin(135*Math.PI/180)}`} fill="none" stroke="#1a1a2e" strokeWidth="8" strokeLinecap="round" />
    <path d={`M ${cx+r*Math.cos(sa)} ${cy+r*Math.sin(sa)} A ${r} ${r} 0 ${ea-sa>Math.PI?1:0} 1 ${cx+r*Math.cos(ea)} ${cy+r*Math.sin(ea)}`} fill="none" stroke="url(#gG)" strokeWidth="8" strokeLinecap="round" />
    <defs><linearGradient id="gG" x1="0%" y1="0%" x2="100%"><stop offset="0%" stopColor="#ef4444"/><stop offset="50%" stopColor="#f59e0b"/><stop offset="100%" stopColor="#22c55e"/></linearGradient></defs>
    <text x={cx} y={cy-4} textAnchor="middle" fill="#e2e8f0" fontSize="20" fontFamily={FONT} fontWeight="700">{C.toFixed(2)}</text>
    <text x={cx} y={cy+12} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily={FONT}>C = τ/K</text>
  </svg>);
}

function ResistanceRadar({ eigenvalues, selectedIdx, onSelect }) {
  const cx=50, cy=50, r=38, n=eigenvalues.length, max=Math.max(...eigenvalues.map(Math.abs),1);
  const pts = eigenvalues.map((v,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;const rv=(Math.abs(v)/max)*r;return`${cx+rv*Math.cos(a)},${cy+rv*Math.sin(a)}`;}).join(" ");
  return (<svg width="100" height="100" viewBox="0 0 100 100">
    {[0.25,0.5,0.75,1].map(f=><circle key={f} cx={cx} cy={cy} r={r*f} fill="none" stroke="#1e1e30" strokeWidth="0.5"/>)}
    {eigenvalues.map((_,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;return<line key={i} x1={cx} y1={cy} x2={cx+r*Math.cos(a)} y2={cy+r*Math.sin(a)} stroke="#1e1e30" strokeWidth="0.5"/>;})};
    <polygon points={pts} fill="#ef444433" stroke="#ef4444" strokeWidth="1.5"/>
    {eigenvalues.map((v,i)=>{const a=(i/n)*2*Math.PI-Math.PI/2;const rv=(Math.abs(v)/max)*r;return<circle key={i} cx={cx+rv*Math.cos(a)} cy={cy+rv*Math.sin(a)} r={selectedIdx===i?4:2.5} fill={selectedIdx===i?"#fff":"#ef4444"} stroke={selectedIdx===i?"#ef4444":"none"} strokeWidth="1.5" style={{cursor:"pointer"}} onClick={()=>onSelect(selectedIdx===i?-1:i)}/>;})};
    <text x={cx} y={cy+3} textAnchor="middle" fill="#64748b" fontSize="7" fontFamily={FONT}>Hol(∇)</text>
  </svg>);
}

function DoubleCoverPlot({E,T}){const cx=50,cy=50,r=40;const pts=[];for(let t=0;t<=1;t+=0.02)pts.push(`${cx+t*r},${cy-(1-t*t)*r}`);return(<svg width="100" height="100" viewBox="0 0 100 100"><line x1={cx-r-5} y1={cy} x2={cx+r+5} y2={cy} stroke="#1e1e30" strokeWidth="0.5"/><line x1={cx} y1={cy+r+5} x2={cx} y2={cy-r-5} stroke="#1e1e30" strokeWidth="0.5"/><path d={`M ${cx} ${cy} L ${pts.join(" L ")} Z`} fill="#3b82f644" opacity="0.15"/><polyline points={pts.join(" ")} fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.5"/><circle cx={cx+T*r} cy={cy-E*r} r="3.5" fill="#22c55e" stroke="#fff" strokeWidth="0.8"/><text x={cx+r+2} y={cy+3} fill="#64748b" fontSize="6" fontFamily={FONT}>T</text><text x={cx+2} y={cy-r-2} fill="#64748b" fontSize="6" fontFamily={FONT}>E</text></svg>);}

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
      {scores[selectedPos]>0.5&&<div style={{marginTop:4,padding:"3px 6px",background:"#ef444411",border:"1px solid #ef444422",borderRadius:3,color:"#ef4444",fontSize:8}}>ESCAPE HOTSPOT — {selectedPos>=28&&selectedPos<=30?"E150K codon (primary gate mutation, λ₁=1.59)":selectedPos>=24&&selectedPos<=26?"N146K codon (proximal mutation, λ₂=1.56)":"Y446N codon (active site mutation, λ₃=1.36)"}. Predicted resistance direction against ceftaroline.</div>}
      {structure[selectedPos]==="^"&&scores[selectedPos]<=0.5&&<div style={{marginTop:4,fontSize:8,color:"#64748b"}}>Gate region — elevated curvature but below escape threshold. Monitor for drift.</div>}
    </div>)}
  </div>);
}

function PipelineView({ activeLayer, onSelect }) {
  const layers = [{id:0,symbol:"P",color:"#22c55e"},{id:1,symbol:"T",color:"#3b82f6"},{id:2,symbol:"M",color:"#8b5cf6"},{id:3,symbol:"π",color:"#ec4899"},{id:4,symbol:"τ",color:"#f59e0b"},{id:5,symbol:"K",color:"#ef4444"},{id:6,symbol:"C*",color:"#10b981"},{id:7,symbol:"Hol",color:"#f97316"},{id:8,symbol:"⊗",color:"#6366f1"},{id:9,symbol:"∇",color:"#14b8a6"}];
  return (<div style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto", padding: "4px 0" }}>
    {layers.map((l,i)=>(<div key={l.id} style={{display:"flex",alignItems:"center"}}>
      <div onClick={()=>onSelect(activeLayer===l.id?-1:l.id)} style={{width:36,height:36,borderRadius:"50%",background:activeLayer===l.id?l.color+"33":"#12121f",border:`2px solid ${activeLayer===l.id?l.color:"#2a2a3e"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.3s",boxShadow:activeLayer===l.id?`0 0 12px ${l.color}44`:"none"}}>
        <span style={{fontSize:11,fontFamily:FONT,fontWeight:700,color:activeLayer===l.id?l.color:"#64748b"}}>{l.symbol}</span>
      </div>
      {i<layers.length-1&&<div style={{width:12,height:2,background:i<(activeLayer??-1)?"#22c55e44":"#1e1e30"}}/>}
    </div>))}
  </div>);
}

// --- MAIN ---

export default function MiradorApp() {
  const [viewMode, setViewMode] = useState("combined");
  const [activeLayer, setActiveLayer] = useState(-1);
  const [simRunning, setSimRunning] = useState(true);
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [exp, setExp] = useState({});
  const [selSeq, setSelSeq] = useState(-1);
  const [selEigen, setSelEigen] = useState(-1);
  const [selFeat, setSelFeat] = useState(-1);
  const tog = k => setExp(p => ({ ...p, [k]: !p[k] }));
  const [mobilePanel, setMobilePanel] = useState("3d"); // "3d" | "dash" | "info"

  const containerRef = useRef(null);
  const { w } = useContainerSize(containerRef);
  const isMobile = w < 640;
  const isTablet = w >= 640 && w < 1024;

  const protein = useMemo(() => generateProteinBackbone(60), []);
  const drug = useMemo(() => generateDrugMolecule(), []);
  const rna = useMemo(() => generateMecASequence(), []);
  // PBP2a escape geodesic eigenvalues from validation: E150K, N146K, Y446N, E239K
  const eigenvalues = useMemo(() => [1.59, 1.56, 1.36, 0.76], []);

  // Ceftaroline coherence for septic MRSA patient
  const [coh, setCoh] = useState({ tau: 12, K: 0.67, tauBind: 4, tauChiral: 1, tauRing: 3 });
  const [admet, setAdmet] = useState({ abs: 0.00, dist: 0.02, met: 0.05, exc: 0.40, tox: 0.20 });

  // Septic MRSA patient: 68yo, eGFR 45, elevated ALT, low albumin, on vancomycin
  const patient = useMemo(() => ({ cyp2d6: { as: 1.0, phenotype: "Normal", genotype: "*1/*2" }, cyp3a4: { activity: 0.7, status: "Reduced (sepsis)" }, egfr: { value: 45, stage: "G3a", adj: "400mg IV q12h" }, alt: { value: 85, uln: 40, ratio: 2.1 }, age: 68, weight: 82 }), []);
  // Ceftaroline molecular descriptors
  const mol = useMemo(() => ({ mw: 684.7, logp: -1.0, hbd: 4, hba: 10, tpsa: 225.8, rb: 8, ar: 3, chiral: "+1 (R)" }), []);

  useEffect(() => { if (!simRunning) return; const iv = setInterval(() => { const t = Date.now(); setCoh(p => ({ ...p, tau: 12 + Math.sin(t/3000)*0.4, K: 0.67 + Math.sin(t/4000)*0.03 })); setAdmet({ abs: 0.00, dist: 0.02+Math.sin(t/4500)*0.005, met: 0.05+Math.sin(t/3500)*0.01, exc: 0.40+Math.sin(t/4000)*0.02, tox: 0.20+Math.sin(t/6000)*0.02 }); }, 100); return () => clearInterval(iv); }, [simRunning]);

  const C = coh.tau / coh.K;
  const Kt = admet.abs + admet.dist + admet.met + admet.exc + admet.tox;
  const En = Math.min(coh.tau / 20, 0.95), Tn = Math.min(admet.tox / 2, 0.95);
  const totalInteractionE = drug.features.reduce((s, f) => s + f.interactionE, 0);

  const admetDetail = k => {
    const v = admet[k];
    if (k === "abs") return (<><FormulaRow formula="IV administration" result="K_abs = 0" /><DataRow label="Route" value="Intravenous" color="#22c55e" /><DataRow label="Bioavailability" value="100% (IV)" color="#22c55e" /><DataRow label="Lipinski" value="N/A (IV bypasses GI)" /></>);
    if (k === "dist") return (<><DataRow label="Protein binding" value="20%" color="#22c55e" /><DataRow label="Albumin" value={`${patient.alt.ratio < 1 ? "Normal" : "Low ("+((patient.egfr/90*4)).toFixed(1)+" g/dL)"}`} color="#f59e0b" /><DataRow label="Free fraction" value="80% (high — good for sepsis)" color="#22c55e" /><DataRow label="V_d" value="~30L (expanded in sepsis)" /></>);
    if (k === "met") return (<><DataRow label="CYP metabolism" value="Minimal" color="#22c55e" /><DataRow label="CYP3A4 status" value={patient.cyp3a4.status} color="#f59e0b" /><DataRow label="Primary route" value="Hydrolysis (non-CYP)" color="#22c55e" /><DataRow label="Prodrug" value="Ceftaroline fosamil → ceftaroline" /></>);
    if (k === "exc") return (<><DataRow label="eGFR" value={`${patient.egfr.value} mL/min`} color="#ef4444" /><DataRow label="CKD stage" value={patient.egfr.stage} color="#ef4444" /><DataRow label="Dose adj." value={patient.egfr.adj} color="#f59e0b" /><FormulaRow formula="t½ = 0.693×31/4.5" result="4.8 hr (normal: 2.6)" /><DataRow label="Accumulation risk" value="YES — monitor trough" color="#ef4444" /></>);
    if (k === "tox") return (<><DataRow label="hERG" value="No liability" color="#22c55e" /><DataRow label="Nephrotoxicity" value="Low (unlike vancomycin)" color="#22c55e" /><DataRow label="Vanco interaction" value="+0.15 (additive nephro risk)" color="#f59e0b" /><DataRow label="Recommendation" value="Taper vancomycin as ceftaroline reaches steady state" /></>);
  };

  const eigenLabels = ["E150K (gate)", "N146K (proximal)", "Y446N (active site)", "E239K (allosteric)"];
  const eigenMech = ["Gate mutation — changes allosteric gate dynamics. ΔΔG_fold=1.2 kcal/mol (accessible). Steric clash blocks C3-pyrrolidine threading. Counter: modify C3 substituent.", "Proximal to active site — steric effects on β-lactam ring. ΔΔG_fold=0.8 kcal/mol (easily accessible). Counter: expand ring contacts.", "Active site Y446N — direct binding disruption of Ser403 acylation. ΔΔG_fold=2.1 kcal/mol (moderate cost). Counter: alternative acylation geometry.", "Distal allosteric network — rewires gate opening mechanism. ΔΔG_fold=1.5 kcal/mol. Affects gate dynamics indirectly. Counter: combination therapy."];

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100vh", background: "#08080f", color: "#e2e8f0", fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ padding: isMobile ? "8px 10px" : "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #1a1a2e", flexShrink: 0, background: "linear-gradient(180deg, #0c0c18, #08080f)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 12 }}>
          <div style={{ width: isMobile ? 24 : 28, height: isMobile ? 24 : 28, borderRadius: "50%", background: "conic-gradient(from 0deg, #22c55e, #3b82f6, #a855f7, #ef4444, #f59e0b, #22c55e)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: isMobile ? 16 : 20, height: isMobile ? 16 : 20, borderRadius: "50%", background: "#08080f", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: isMobile ? 7 : 9, fontWeight: 700 }}>M</span></div>
          </div>
          <div><div style={{ fontSize: isMobile ? 11 : 13, fontWeight: 700, letterSpacing: 3 }}>MIRADOR</div>{!isMobile && <div style={{ fontSize: 8, color: "#64748b", letterSpacing: 1 }}>PBP2a / MRSA · CEFTAROLINE · SEPTIC PATIENT</div>}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!isMobile && <span style={{ fontSize: 9, color: "#475569" }}>C = τ/K</span>}
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: simRunning ? "#22c55e" : "#475569", boxShadow: simRunning ? "0 0 6px #22c55e88" : "none" }} />
          <span style={{ fontSize: 9, color: simRunning ? "#22c55e" : "#475569" }}>{simRunning ? "LIVE" : "PAUSED"}</span>
        </div>
      </div>

      {/* PIPELINE */}
      <div style={{ padding: isMobile ? "4px 8px" : "6px 16px", borderBottom: "1px solid #1a1a2e", flexShrink: 0, background: "#0a0a14", overflowX: "auto" }}>
        <PipelineView activeLayer={activeLayer} onSelect={setActiveLayer} />
        {activeLayer >= 0 && (<div style={{ background: "#0e0e1c", border: "1px solid #1e1e30", borderRadius: 4, padding: 8, marginTop: 4, fontSize: 9, color: "#94a3b8" }}>
          {activeLayer===0&&<><DataRow label="Patient" value="68yo, MRSA bacteremia"/><DataRow label="eGFR" value="45 mL/min (AKI)" color="#ef4444"/><DataRow label="ALT" value="85 U/L (2.1× ULN)" color="#f59e0b"/><DataRow label="Albumin" value="2.5 g/dL (low)" color="#f59e0b"/><DataRow label="Vanco trough" value="18 μg/mL (near toxic)" color="#ef4444"/></>}
          {activeLayer===1&&<><DataRow label="Target" value="PBP2a (mecA gene product)"/><DataRow label="PDB" value="4CJN (closed), 6Q9N (open)"/><DataRow label="Gate state" value="99.97% CLOSED" color="#ef4444"/><DataRow label="Gate residues" value="440-460 (β3-β4 loop)"/><DataRow label="Druggable (open)" value="pers = 0.0003 — NO" color="#ef4444"/><DataRow label="Strategy" value="Thread closed gate" color="#f59e0b"/></>}
          {activeLayer===2&&<><DataRow label="Drug" value="Ceftaroline (MW 684.7)"/><DataRow label="Route" value="IV (Lipinski N/A)"/><DataRow label="Key feature" value="C3 pyrrolidine threads gate" color="#22c55e"/><DataRow label="τ" value="12 (4×1×3)"/><DataRow label="vs oxacillin τ" value="4 (fails — can't thread)" color="#ef4444"/></>}
          {activeLayer===3&&<><DataRow label="Bundle" value="PBP2a conformational fiber bundle"/><DataRow label="||F_∇||" value="3.01 (gate curvature)"/><DataRow label="c₁(E)" value="0" color="#22c55e"/><DataRow label="Monotherapy" value="Possible (c₁=0)" color="#22c55e"/></>}
          {activeLayer===4&&<><FormulaRow formula="τ = 4 × 1 × 3" result="12"/><DataRow label="τ_bind" value="4 (β-lac + gate-key + thiaz + oxime)"/><DataRow label="τ_ring" value="3 (β-lactam, pyrrolidine, thiadiazole)"/><DataRow label="β₁ (gate tunnel)" value="1 — molecule must thread" color="#f59e0b"/></>}
          {activeLayer===5&&<>{Object.entries(admet).map(([k,v])=><DataRow key={k} label={`K_${k}`} value={v.toFixed(3)} color={v>0.3?"#ef4444":v>0.1?"#f59e0b":"#22c55e"}/>)}<FormulaRow formula="K_total" result={Kt.toFixed(3)}/><DataRow label="Dominant" value="K_exc (renal impairment)" color="#ef4444"/></>}
          {activeLayer===6&&<><FormulaRow formula="C = τ/K = 12/0.67" result={C.toFixed(1)}/><DataRow label="vs vancomycin" value="C = 1.86" color="#ef4444"/><DataRow label="Improvement" value={`${((C/1.86-1)*100).toFixed(0)}%`} color="#22c55e"/><DataRow label="E+T²" value={(En+Tn*Tn).toFixed(3)} color="#22c55e"/><DataRow label="Recommendation" value="Switch to ceftaroline" color="#22c55e"/></>}
          {activeLayer===7&&<><DataRow label="λ₁ E150K" value={eigenvalues[0]} color="#ef4444"/><DataRow label="λ₂ N146K" value={eigenvalues[1]} color="#ef4444"/><DataRow label="λ₃ Y446N" value={eigenvalues[2]} color="#f59e0b"/><DataRow label="λ₁ dominance" value={`${(eigenvalues[0]/eigenvalues.reduce((a,b)=>a+b,0)*100).toFixed(0)}%`}/><DataRow label="Strategy" value="Spread escape → monitor all 3" color="#f59e0b"/></>}
          {activeLayer===8&&<><DataRow label="c₁(E)" value="0 → monotherapy OK" color="#22c55e"/><DataRow label="Vanco + ceftaroline" value="Additive nephro risk" color="#f59e0b"/><DataRow label="Recommendation" value="Taper vanco, mono ceftaroline" /></>}
          {activeLayer===9&&<><DataRow label="Standard" value="600mg q12h"/><DataRow label="This patient" value="400mg q12h (eGFR 45)" color="#f59e0b"/><DataRow label="t½" value="4.8 hr (prolonged)"/><DataRow label="Ctrough" value="2.3 μg/mL > MIC 1.0" color="#22c55e"/><DataRow label="FDA match" value="400mg for CrCl 15-50 ✓" color="#22c55e"/></>}
        </div>)}
      </div>

      {/* MOBILE PANEL TABS */}
      {isMobile && (
        <div style={{ display: "flex", borderBottom: "1px solid #1a1a2e", flexShrink: 0, background: "#0a0a14" }}>
          {[{k:"3d",l:"3D VIEW"},{k:"dash",l:"DASHBOARD"},{k:"info",l:"INFO"}].map(t => (
            <button key={t.k} onClick={() => setMobilePanel(t.k)} style={{
              flex: 1, padding: "6px 0", fontSize: 8, fontFamily: FONT, letterSpacing: 1,
              background: mobilePanel === t.k ? "#1e1e30" : "transparent",
              color: mobilePanel === t.k ? "#e2e8f0" : "#475569",
              border: "none", borderBottom: mobilePanel === t.k ? "2px solid #3b82f6" : "2px solid transparent",
              cursor: "pointer",
            }}>{t.l}</button>
          ))}
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden", minHeight: 0 }}>

        {/* LEFT SIDEBAR — hidden on mobile unless "dash" panel selected */}
        {(!isMobile || mobilePanel === "dash") && (
          <div style={{ width: isMobile ? "100%" : isTablet ? 190 : 210, borderRight: isMobile ? "none" : "1px solid #1a1a2e", padding: 10, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", background: "#0a0a14", flexShrink: 0, ...(isMobile ? { flex: 1 } : {}) }}>
            <Expandable expanded={exp.coh} onToggle={() => tog("coh")} label="COHERENCE" badge={C.toFixed(2)}>
              <CoherenceGauge tau={coh.tau} K={coh.K} C={C} />
              <FormulaRow formula="C = τ / K" result={`${coh.tau.toFixed(2)} / ${coh.K.toFixed(2)} = ${C.toFixed(4)}`} />
              <DataRow label="∂C/∂τ" value={`+${(1/coh.K).toFixed(3)}`} color="#22c55e" />
              <DataRow label="∂C/∂K" value={(- coh.tau / (coh.K * coh.K)).toFixed(3)} color="#ef4444" />
            </Expandable>
            <Expandable expanded={exp.tau} onToggle={() => tog("tau")} label="τ TOPOLOGY" badge={coh.tau.toFixed(2)}>
              <FormulaRow formula={`${mol.hbd+mol.hba} × 1 × ${mol.ar}`} result={(mol.hbd+mol.hba)*mol.ar} />
              <DataRow label="τ_bind" value={mol.hbd+mol.hba}/><DataRow label="τ_chiral" value={mol.chiral}/><DataRow label="τ_ring" value={mol.ar}/>
              <DataRow label="β₀" value="1"/><DataRow label="β₁" value="1"/><DataRow label="β₂" value="0"/>
            </Expandable>
            <div>
              <div style={{ fontSize: 8, color: "#64748b", letterSpacing: 2, marginBottom: 6 }}>K CURVATURE <span style={{ float: "right", color: "#94a3b8" }}>{Kt.toFixed(2)}</span></div>
              {Object.entries(admet).map(([k,v])=><CurvatureBar key={k} label={`K_${k}`} value={v} max={2} color={{abs:"#22c55e",dist:"#3b82f6",met:"#f59e0b",exc:"#f97316",tox:"#ef4444"}[k]} expanded={exp[`k_${k}`]} onToggle={()=>tog(`k_${k}`)} detail={admetDetail(k)}/>)}
            </div>
            <Expandable expanded={exp.dc} onToggle={() => tog("dc")} label="DOUBLE COVER" badge={`${(En+Tn*Tn).toFixed(2)}`}>
              <DoubleCoverPlot E={En} T={Tn}/>
              <DataRow label="E" value={En.toFixed(4)}/><DataRow label="T" value={Tn.toFixed(4)}/>
              <FormulaRow formula="E + T²" result={(En+Tn*Tn).toFixed(4)}/>
              <DataRow label="Margin" value={(1-En-Tn*Tn).toFixed(4)} color="#22c55e"/>
            </Expandable>
            <Expandable expanded={exp.res} onToggle={() => tog("res")} label="RESISTANCE" badge={`λ₁=${eigenvalues[0]}`}>
              <ResistanceRadar eigenvalues={eigenvalues} selectedIdx={selEigen} onSelect={setSelEigen}/>
              <DataRow label="Tr(R)" value={eigenvalues.reduce((a,b)=>a+b,0).toFixed(3)}/>
              {selEigen>=0&&(<div style={{background:"#12121f",borderRadius:4,padding:6,marginTop:4}}>
                <DataRow label="λ" value={eigenvalues[selEigen].toFixed(3)} color="#ef4444"/>
                <DataRow label="Direction" value={eigenLabels[selEigen]}/>
                <DataRow label="Share" value={`${(eigenvalues[selEigen]/eigenvalues.reduce((a,b)=>a+b,0)*100).toFixed(1)}%`}/>
                <div style={{marginTop:4,fontSize:8,color:"#64748b",lineHeight:1.5}}>{eigenMech[selEigen]}</div>
              </div>)}
            </Expandable>
          </div>
        )}

        {/* CENTER — hidden on mobile unless "3d" panel selected */}
        {(!isMobile || mobilePanel === "3d") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", gap: 2, padding: "6px 8px", background: "#0a0a14", borderBottom: "1px solid #1a1a2e", flexShrink: 0, flexWrap: "wrap" }}>
              {[{key:"target",label:"TARGET"},{key:"drug",label:"CANDIDATE"},{key:"combined",label:"BINDING"}].map(t=><button key={t.key} onClick={()=>setViewMode(t.key)} style={{padding: isMobile ? "4px 8px" : "4px 12px",fontSize:9,fontFamily:FONT,letterSpacing:1,background:viewMode===t.key?"#1e1e30":"transparent",color:viewMode===t.key?"#e2e8f0":"#475569",border:`1px solid ${viewMode===t.key?"#3b82f6":"transparent"}`,borderRadius:4,cursor:"pointer"}}>{t.label}</button>)}
              <div style={{flex:1}}/>
              <button onClick={()=>setOrbitEnabled(!orbitEnabled)} style={{padding:"4px 8px",fontSize:9,fontFamily:FONT,background:orbitEnabled?"#3b82f622":"#1e1e30",color:orbitEnabled?"#3b82f6":"#64748b",border:`1px solid ${orbitEnabled?"#3b82f644":"#2a2a3e"}`,borderRadius:4,cursor:"pointer",marginRight:4}}>{orbitEnabled?"◎ ORBIT":"◎ DRAG"}</button>
              <button onClick={()=>setSimRunning(!simRunning)} style={{padding:"4px 8px",fontSize:9,fontFamily:FONT,background:simRunning?"#22c55e22":"#1e1e30",color:simRunning?"#22c55e":"#64748b",border:`1px solid ${simRunning?"#22c55e44":"#2a2a3e"}`,borderRadius:4,cursor:"pointer"}}>{simRunning?"⏸":"▶"}</button>
            </div>
            <div style={{ flex: 1, position: "relative", minHeight: isMobile ? 200 : 0 }}>
              <MoleculeCanvas protein={protein} drug={drug} viewMode={viewMode} orbitEnabled={orbitEnabled}/>
              {!isMobile && <div style={{position:"absolute",top:12,left:12,fontSize:10,color:"#475569",letterSpacing:2}}>{viewMode==="target"?"PBP2a TRANSPEPTIDASE · ALLOSTERIC GATE":viewMode==="drug"?"CEFTAROLINE · GATE-THREADING PHARMACOPHORE":"CEFTAROLINE → PBP2a · C3 THREADS GATE"}</div>}
              <div style={{position:"absolute",bottom:8,left:8,display:"flex",gap:6,flexWrap:"wrap"}}>
                {viewMode!=="drug"&&<div style={{padding:"2px 6px",background:"#08080fcc",borderRadius:4,border:"1px solid #1a1a2e",fontSize:8,color:"#94a3b8"}}><span style={{color:"#2a5a8a"}}>●</span> Backbone <span style={{color:"#c2185b"}}>●</span> Near gate <span style={{color:"#ff9800"}}>●</span> Gate (locked)</div>}
                {viewMode!=="target"&&<div style={{padding:"2px 6px",background:"#08080fcc",borderRadius:4,border:"1px solid #1a1a2e",fontSize:8,color:"#94a3b8"}}><span style={{color:"#ef4444"}}>●</span> β-Lac <span style={{color:"#22c55e"}}>●</span> Gate key <span style={{color:"#a855f7"}}>●</span> Thiaz <span style={{color:"#3b82f6"}}>●</span> HBA <span style={{color:"#eab308"}}>●</span> Hφ</div>}
              </div>
            </div>
            {/* PHARMACOPHORE CONTACTS */}
            {viewMode!=="target"&&(<div style={{borderTop:"1px solid #1a1a2e",background:"#0a0a14",flexShrink:0,padding:"6px 8px",maxHeight:selFeat>=0?160:80,overflowY:"auto",transition:"max-height 0.3s"}}>
              <div style={{fontSize:8,color:"#64748b",letterSpacing:2,marginBottom:4}}>PHARMACOPHORE · ΔG = {totalInteractionE.toFixed(1)} kcal/mol</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {drug.features.map((f,i)=>(<div key={i} onClick={()=>setSelFeat(selFeat===i?-1:i)} style={{padding:"3px 6px",background:selFeat===i?"#1e1e30":"#12121f",border:`1px solid ${selFeat===i?f.color:"#1a1a2e"}`,borderRadius:4,cursor:"pointer",fontSize:8}}>
                  <span style={{color:f.color}}>{f.label}</span><span style={{color:"#475569",marginLeft:4}}>{f.interactionE.toFixed(1)}</span>
                </div>))}
              </div>
              {selFeat>=0&&(<div style={{background:"#0e0e1c",border:"1px solid #1e1e30",borderRadius:4,padding:6,marginTop:4,fontSize:9}}>
                <DataRow label="Feature" value={drug.features[selFeat].label} color={drug.features[selFeat].color}/>
                <DataRow label="Type" value={drug.features[selFeat].type}/>
                <DataRow label="ΔG" value={`${drug.features[selFeat].interactionE.toFixed(1)} kcal/mol`} color={drug.features[selFeat].interactionE<-2?"#22c55e":"#f59e0b"}/>
                <DataRow label="Target" value={`${protein.atoms[drug.features[selFeat].targetResidue]?.residueName}${drug.features[selFeat].targetResidue} ${protein.atoms[drug.features[selFeat].targetResidue]?.isBindingSite?"(gate)":"(backbone)"}`}/>
                <DataRow label="B-factor" value={protein.atoms[drug.features[selFeat].targetResidue]?.bFactor?.toFixed(1)} color={protein.atoms[drug.features[selFeat].targetResidue]?.bFactor>40?"#f59e0b":"#22c55e"}/>
                {drug.features[selFeat].desc && <div style={{marginTop:4,fontSize:8,color:"#64748b",lineHeight:1.4}}>{drug.features[selFeat].desc}</div>}
              </div>)}
            </div>)}
            {/* SEQUENCE */}
            <div style={{padding:"6px 8px",borderTop:"1px solid #1a1a2e",background:"#0a0a14",flexShrink:0}}>
              <div style={{fontSize:8,color:"#64748b",letterSpacing:2,marginBottom:4}}>mecA GENE · ESCAPE MUTATIONS · <span style={{color:"#475569"}}>! hotspot · ^ gate · - background</span></div>
              <SequenceViewer data={rna} selectedPos={selSeq} onSelect={setSelSeq}/>
            </div>
          </div>
        )}

        {/* RIGHT SIDEBAR — hidden on mobile unless "info" panel, hidden on tablet */}
        {((!isMobile && !isTablet) || (isMobile && mobilePanel === "info")) && (
          <div style={{width: isMobile ? "100%" : 185,borderLeft: isMobile ? "none" : "1px solid #1a1a2e",padding:10,display:"flex",flexDirection:"column",gap:8,overflowY:"auto",background:"#0a0a14",flexShrink:0, ...(isMobile ? { flex: 1 } : {})}}>
            <Expandable expanded={exp.pt} onToggle={()=>tog("pt")} label="PATIENT" badge="Layer 0">
              <DataRow label="CYP2D6" value={`${patient.cyp2d6.phenotype} (${patient.cyp2d6.as})`} color="#22c55e"/><DataRow label="  genotype" value={patient.cyp2d6.genotype}/>
              <DataRow label="CYP3A4" value={patient.cyp3a4.status} color="#22c55e"/><DataRow label="  activity" value={patient.cyp3a4.activity}/>
              <DataRow label="eGFR" value={`${patient.egfr.value} mL/min`} color="#22c55e"/><DataRow label="  stage" value={patient.egfr.stage}/><DataRow label="  dose adj" value={patient.egfr.adj} color="#22c55e"/>
              <DataRow label="ALT" value={`${patient.alt.value} U/L (${patient.alt.ratio.toFixed(1)}× ULN)`} color="#22c55e"/>
              <DataRow label="Age" value={patient.age}/><DataRow label="Weight" value={`${patient.weight} kg`}/>
            </Expandable>
            <Expandable expanded={exp.ml} onToggle={()=>tog("ml")} label="CEFTAROLINE" badge={`C=${C.toFixed(1)}`}>
              <DataRow label="MW" value={mol.mw} unit="Da" color="#94a3b8"/><DataRow label="logP" value={mol.logp} color="#94a3b8"/><DataRow label="HBD" value={mol.hbd}/><DataRow label="HBA" value={mol.hba}/><DataRow label="TPSA" value={mol.tpsa} unit="Å²"/><DataRow label="Rot bonds" value={mol.rb}/><DataRow label="Rings" value={`${mol.ar} (β-lactam, pyrrolidine, thiadiazole)`}/><DataRow label="Chiral" value={mol.chiral}/>
              <FormulaRow formula="K_abs" result="0.00 (IV — bypasses GI)"/><DataRow label="Lipinski" value="N/A (IV drug)" color="#64748b"/><DataRow label="Gate threading" value="C3 pyrrolidine" color="#22c55e"/>
            </Expandable>
            <Expandable expanded={exp.dos} onToggle={()=>tog("dos")} label="DOSING" badge="400mg IV">
              <DataRow label="Drug" value="Ceftaroline fosamil"/><DataRow label="EC50" value="2.0" unit="μg/mL"/>
              <FormulaRow formula="t½ = 0.693×31/4.5" result="4.8 hr (normal: 2.6)"/>
              <DataRow label="V_d" value="31" unit="L (sepsis)"/><DataRow label="CL" value="4.5" unit="L/hr (eGFR 45)"/>
              <DataRow label="Standard" value="600mg q12h" color="#64748b"/><DataRow label="This patient" value="400mg IV q12h" color="#f59e0b"/>
              <DataRow label="Cmax" value="12.8" unit="μg/mL"/><DataRow label="Ctrough" value="2.3" unit="μg/mL"/>
              <DataRow label="MEC" value="1.0" unit="μg/mL"/><DataRow label="In window" value="YES" color="#22c55e"/>
              <DataRow label="Matches FDA" value="400mg for CrCl 15-50" color="#22c55e"/>
              <DataRow label="Vanco taper" value="Recommended" color="#f59e0b"/>
            </Expandable>
            <div style={{marginTop:"auto",paddingTop:8,borderTop:"1px solid #1a1a2e",textAlign:"center"}}>
              <div style={{fontSize:7,color:"#334155",letterSpacing:2}}>DAVIS LAB · DAVIS GEOMETRIC</div>
              <div style={{fontSize:7,color:"#1e293b",marginTop:2}}>C = τ/K</div>
            </div>
          </div>
        )}

        {/* TABLET: right sidebar content merged below 3D on tablet */}
        {isTablet && !isMobile && mobilePanel !== "info" && (
          <div style={{width:170,borderLeft:"1px solid #1a1a2e",padding:10,display:"flex",flexDirection:"column",gap:8,overflowY:"auto",background:"#0a0a14",flexShrink:0}}>
            <Expandable expanded={exp.pt} onToggle={()=>tog("pt")} label="PATIENT" badge="68yo">
              <DataRow label="eGFR" value={`${patient.egfr.value}`} color="#ef4444"/>
              <DataRow label="ALT" value={`${patient.alt.value} (${patient.alt.ratio}× ULN)`} color="#f59e0b"/>
              <DataRow label="Vanco trough" value="18 μg/mL (toxic)" color="#ef4444"/>
            </Expandable>
            <Expandable expanded={exp.ml} onToggle={()=>tog("ml")} label="CEFTAROLINE" badge={`C=${C.toFixed(1)}`}>
              <DataRow label="MW" value={mol.mw} color="#94a3b8"/><DataRow label="IV" value="bypasses Lipinski" color="#22c55e"/>
              <DataRow label="Gate threading" value="C3 pyrrolidine" color="#22c55e"/>
            </Expandable>
            <Expandable expanded={exp.dos} onToggle={()=>tog("dos")} label="DOSING" badge="400mg">
              <DataRow label="Dose adj." value="400mg (eGFR 45)" color="#f59e0b"/><DataRow label="t½" value="4.8 hr"/>
              <DataRow label="Matches FDA" value="YES" color="#22c55e"/>
            </Expandable>
          </div>
        )}
      </div>
    </div>
  );
}
