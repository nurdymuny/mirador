import { useState, useRef, useEffect, useCallback } from 'react';
import { initEngine, buildUniverse, universeGQL, nlToGql } from './gql-engine';

const FONT = "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace";
const DEFAULT_HOST = 'https://gigi-stream.fly.dev';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMBEDDED SEED DATA (mirrors mirador_gigi_seed.py)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const _tau = (a, m) => +(Math.log10(a / m)).toFixed(4);
const _kb = (r) => r < 1 ? +(-Math.log10(r)).toFixed(4) : 0;

const HIV_RAW = [
  { cid:100, d:'DTG', c:'INSTI', a:126400, m:0.51, ka:0.05, p:{cns:0.01,lymph_node:0.48,galt:0.35,genital_tract:0.07,bone_marrow:0.40} },
  { cid:101, d:'TFV', c:'NRTI',  a:7630,   m:50,   ka:0.10, p:{cns:0.05,lymph_node:0.33,galt:0.50,genital_tract:3.50,bone_marrow:0.30} },
  { cid:102, d:'FTC', c:'NRTI',  a:40000,  m:8,    ka:0.08, p:{cns:0.03,lymph_node:0.40,galt:0.55,genital_tract:1.80,bone_marrow:0.35} },
  { cid:103, d:'DRV', c:'PI',    a:170000, m:1.2,  ka:0.15, p:{cns:0.05,lymph_node:0.70,galt:0.45,genital_tract:0.15,bone_marrow:0.35} },
  { cid:104, d:'EFV', c:'NNRTI', a:184000, m:1.0,  ka:0.20, p:{cns:0.005,lymph_node:0.55,galt:0.40,genital_tract:0.02,bone_marrow:0.30} },
];
const MEN_RAW = [
  { cid:200, d:'CRO', a:1000, m:0.015, ka:0.10, Ru:0.01, Ri:0.15 },
  { cid:201, d:'VAN', a:400,  m:1.0,   ka:0.35, Ru:0.01, Ri:0.18 },
  { cid:202, d:'RIF', a:60,   m:0.5,   ka:0.20, Ru:0.15, Ri:0.40 },
  { cid:203, d:'LZD', a:250,  m:2.0,   ka:0.15, Ru:0.40, Ri:0.70 },
];
const MRSA_RAW = [
  { cid:300, d:'VAN', m:1.0,   mb:512, a:400, Rb:0.20, tK:12, ka:0.50 },
  { cid:301, d:'CAR', m:1.0,   mb:128, a:180, Rb:0.30, tK:12, ka:0.67 },
  { cid:302, d:'DAP', m:0.5,   mb:32,  a:500, Rb:0.15, tK:24, ka:0.60 },
  { cid:303, d:'LZD', m:2.0,   mb:256, a:250, Rb:0.50, tK:12, ka:0.40 },
  { cid:304, d:'CLI', m:0.25,  mb:64,  a:80,  Rb:0.525,tK:8,  ka:0.50 },
  { cid:305, d:'RIF', m:0.008, mb:0.5, a:60,  Rb:0.35, tK:8,  ka:0.50 },
];
const TB_RAW = [
  { cid:400, d:'INH',    ka:0.10, tN:3.50, m7:0.05, m5:0.50, g:{lung:0.80,cellular:0.60,necrotic:0.30,cavity:0.40} },
  { cid:401, d:'RIF',    ka:0.20, tN:4.00, m7:0.20, m5:0.50, g:{lung:0.30,cellular:0.20,necrotic:0.05,cavity:0.15} },
  { cid:402, d:'PZA',    ka:0.05, tN:4.50, m7:null, m5:16.0, g:{lung:0.80,cellular:0.70,necrotic:0.40,cavity:0.60} },
  { cid:403, d:'EMB',    ka:0.08, tN:5.00, m7:2.0,  m5:8.0,  g:{lung:2.00,cellular:1.50,necrotic:0.80,cavity:1.00} },
  { cid:404, d:'MXF',    ka:0.10, tN:null, m7:0.25, m5:0.50, g:{lung:3.00,cellular:2.50,necrotic:1.50,cavity:2.00} },
  { cid:405, d:'BDQ',    ka:0.30, tN:4.00, m7:0.03, m5:0.06, g:{lung:5.00,cellular:4.00,necrotic:2.00,cavity:3.00} },
  { cid:406, d:'LZD_TB', ka:0.15, tN:4.00, m7:0.50, m5:1.0,  g:{lung:1.20,cellular:1.00,necrotic:0.60,cavity:0.80} },
];

function _buildDrugs() {
  const R = [];
  HIV_RAW.forEach(x => { const t = _tau(x.a, x.m); Object.entries(x.p).forEach(([s,r]) => {
    R.push({compound_id:x.cid,compartment:s,drug_name:x.d,drug_class:x.c,disease:'hiv',auc_24:x.a,mic:x.m,tau:t,k_admet:x.ka,r_penetration:r,k_barrier:_kb(r),k_biofilm:0});
  });});
  MEN_RAW.forEach(x => { const t = _tau(x.a, x.m); [['csf_uninflamed',x.Ru],['csf_inflamed',x.Ri]].forEach(([s,r]) => {
    R.push({compound_id:x.cid,compartment:s,drug_name:x.d,drug_class:'antibiotic',disease:'meningitis',auc_24:x.a,mic:x.m,tau:t,k_admet:x.ka,r_penetration:r,k_barrier:_kb(r),k_biofilm:0});
  });});
  MRSA_RAW.forEach(x => { const t = _tau(x.a, x.m); const bio = +(Math.log10(x.mb/x.m)).toFixed(4);
    [['bone',x.Rb],['planktonic',1.0]].forEach(([s,r]) => {
      R.push({compound_id:x.cid,compartment:s,drug_name:x.d,drug_class:'antibiotic',disease:'mrsa',auc_24:x.a,mic:x.m,tau:s==='planktonic'?t:x.tK,k_admet:x.ka,r_penetration:r,k_barrier:_kb(r),k_biofilm:bio});
  });});
  TB_RAW.forEach(x => { Object.entries(x.g).forEach(([s,r]) => {
    const mic = ['cellular','necrotic'].includes(s)&&x.m5!=null ? x.m5 : (x.m7??x.m5??0);
    R.push({compound_id:x.cid,compartment:'granuloma_'+s,drug_name:x.d,drug_class:'anti-TB',disease:'tb',auc_24:0,mic,tau:x.tN??0,k_admet:x.ka,r_penetration:r,k_barrier:_kb(r),k_biofilm:0});
  });});
  return R;
}

const THRESHOLDS = [
  {drug_name:'Ceftriaxone',organism:'S. pneumoniae (meningitis)',mic_s:0.5,mic_r:2.0,standard:'EUCAST v14.0 / CLSI M100'},
  {drug_name:'Vancomycin',organism:'S. pneumoniae (meningitis)',mic_s:2.0,mic_r:2.0,standard:'CLSI M100-Ed34'},
  {drug_name:'Rifampin',organism:'S. pneumoniae (meningitis)',mic_s:0.5,mic_r:4.0,standard:'CLSI M100-Ed34'},
  {drug_name:'Linezolid',organism:'S. pneumoniae (meningitis)',mic_s:2.0,mic_r:4.0,standard:'EUCAST v14.0 / CLSI M100'},
  {drug_name:'Vancomycin',organism:'S. aureus (MRSA)',mic_s:2.0,mic_r:2.0,standard:'EUCAST v14.0 / CLSI M100'},
  {drug_name:'Ceftaroline',organism:'S. aureus (MRSA)',mic_s:1.0,mic_r:2.0,standard:'EUCAST v14.0 / CLSI M100'},
  {drug_name:'Daptomycin',organism:'S. aureus (MRSA)',mic_s:1.0,mic_r:1.0,standard:'EUCAST v14.0 / CLSI M100'},
  {drug_name:'Linezolid',organism:'S. aureus (MRSA)',mic_s:4.0,mic_r:4.0,standard:'EUCAST v14.0 / CLSI M100'},
  {drug_name:'Clindamycin',organism:'S. aureus (MRSA)',mic_s:0.25,mic_r:0.5,standard:'EUCAST v14.0'},
  {drug_name:'Rifampin',organism:'S. aureus (MRSA)',mic_s:0.06,mic_r:0.5,standard:'EUCAST v14.0'},
  {drug_name:'INH',organism:'M. tuberculosis',mic_s:0.1,mic_r:0.1,standard:'WHO CC 2024'},
  {drug_name:'RIF',organism:'M. tuberculosis',mic_s:1.0,mic_r:1.0,standard:'WHO CC 2024'},
  {drug_name:'PZA',organism:'M. tuberculosis',mic_s:100,mic_r:100,standard:'WHO CC 2024'},
  {drug_name:'EMB',organism:'M. tuberculosis',mic_s:5.0,mic_r:5.0,standard:'WHO CC 2024'},
  {drug_name:'MXF',organism:'M. tuberculosis',mic_s:0.5,mic_r:0.5,standard:'WHO CC 2024'},
  {drug_name:'BDQ',organism:'M. tuberculosis',mic_s:0.25,mic_r:0.25,standard:'WHO CC 2024'},
  {drug_name:'LZD_TB',organism:'M. tuberculosis',mic_s:1.0,mic_r:1.0,standard:'WHO CC 2024'},
];

const REGIMENS = [
  {regimen_id:'art_1st_dtg',name:'DTG + TFV + FTC',disease:'hiv',drugs:'DTG,TFV,FTC',indication:'1st-line ART',synergy_factor:1.0,clinical_efficacy:0.97,fic_index:0.0068,trial:'GEMINI-1/2'},
  {regimen_id:'art_2nd_drv',name:'DRV/r + TFV + FTC',disease:'hiv',drugs:'DRV,TFV,FTC',indication:'2nd-line ART',synergy_factor:1.0,clinical_efficacy:0.93,fic_index:0.0068,trial:'EMERALD'},
  {regimen_id:'mening_empiric',name:'CRO + VAN',disease:'meningitis',drugs:'CRO,VAN',indication:'Empiric meningitis',synergy_factor:1.0,clinical_efficacy:0.85,fic_index:0.014,trial:'IDSA Guidelines'},
  {regimen_id:'mening_pcnr',name:'CRO + VAN + RIF',disease:'meningitis',drugs:'CRO,VAN,RIF',indication:'PCN-R meningitis',synergy_factor:1.1,clinical_efficacy:0.90,fic_index:0.035,trial:'Multiple'},
  {regimen_id:'mrsa_pji',name:'VAN + RIF',disease:'mrsa',drugs:'VAN,RIF',indication:'MRSA PJI',synergy_factor:1.2,clinical_efficacy:0.82,fic_index:0.013,trial:'Zimmerli protocol'},
  {regimen_id:'mrsa_salvage',name:'DAP + RIF',disease:'mrsa',drugs:'DAP,RIF',indication:'MRSA salvage',synergy_factor:1.15,clinical_efficacy:0.78,fic_index:0.007,trial:'Multiple'},
  {regimen_id:'mrsa_oral',name:'LZD + RIF',disease:'mrsa',drugs:'LZD,RIF',indication:'MRSA oral step-down',synergy_factor:1.10,clinical_efficacy:0.75,fic_index:0.016,trial:'OVIVA'},
  {regimen_id:'tb_ripe',name:'RIPE',disease:'tb',drugs:'INH,RIF,PZA,EMB',indication:'DS-TB intensive',synergy_factor:1.20,clinical_efficacy:0.95,fic_index:0,trial:'WHO standard'},
  {regimen_id:'tb_bpal',name:'BPaL',disease:'tb',drugs:'BDQ,Pa,LZD',indication:'XDR-TB',synergy_factor:1.30,clinical_efficacy:0.90,fic_index:0,trial:'TB-PRACTECAL'},
];

const _DRUGS = _buildDrugs();
let DEMO_DB = null; // Lazy: populated after WASM init

// ── Lightweight in-browser GQL engine ──────────────────────────────
const _noBundleMsg = (name) => {
  const available = Object.keys(DEMO_DB).join(', ');
  return {error:`Bundle '${name}' is not available in demo mode.\n\nChEMBL bundles (chembl_compounds, chembl_targets, chembl_activities, chembl_drug_target, etc.) require a live GIGI connection.\n\nAvailable in demo: ${available}`};
};

function demoGQL(q) {
  const s = q.trim().replace(/;$/,'').trim(), up = s.toUpperCase();
  // SHOW BUNDLES (also accept legacy BUNDLES)
  if (up === 'SHOW BUNDLES' || up === 'BUNDLES') return { bundles: Object.entries(DEMO_DB).map(([n,r])=>({name:n,records:r.length,fields:r.length?Object.keys(r[0]).length:0})) };

  // Route universe queries early — prevents COVER regexes capturing "ON" as bundle name
  if (/^COVER\s+ON\s+mirador_universe\b/i.test(up)) {
    const uResult = universeGQL(s, DEMO_DB.mirador_universe);
    return uResult || {error:'Universe query could not be evaluated'};
  }

  let m;
  // DESCRIBE <b>
  if ((m = s.match(/^DESCRIBE\s+(\w+)/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const numF = t.length ? Object.values(t[0]).filter(v=>typeof v==='number').length : 0;
    return {record_count:t.length,base_fields:2,fiber_fields:t.length?Object.keys(t[0]).length-2:0,storage_mode:'hashed',curvature:0,confidence:0};
  }
  // COVER <b> ALL [FIRST n]
  if ((m = s.match(/^COVER\s+(\w+)\s+ALL(?:\s+FIRST\s+(\d+))?$/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const rows = m[2] ? t.slice(0, parseInt(m[2])) : t;
    return {count:rows.length,rows};
  }
  // COVER <b> ON <f1> = '<v1>' AND <f2> = '<v2>' ... [FIRST n]
  if ((m = s.match(/^COVER\s+(\w+)\s+ON\s+(.+?)(?:\s+FIRST\s+(\d+))?$/i)) && m[2].toUpperCase().includes('AND')) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const conds = m[2].split(/\s+AND\s+/i);
    const filters = [];
    for (const c of conds) {
      const cm = c.trim().match(/^(\w+)\s*=\s*'([^']+)'$/);
      if (cm) filters.push([cm[1], cm[2]]);
    }
    let rows = t.filter(r => filters.every(([k,v]) => String(r[k]).toLowerCase() === v.toLowerCase()));
    if (m[3]) rows = rows.slice(0, parseInt(m[3]));
    return {count:rows.length,rows};
  }
  // COVER <b> ON <f> = '<v>' [FIRST n]
  if ((m = s.match(/^COVER\s+(\w+)\s+ON\s+(\w+)\s*=\s*'([^']+)'(?:\s+FIRST\s+(\d+))?$/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    let rows = t.filter(r => String(r[m[2]]).toLowerCase() === m[3].toLowerCase());
    if (m[4]) rows = rows.slice(0, parseInt(m[4]));
    return {count:rows.length,rows};
  }
  // COVER <b> ON/WHERE <f> <op> <num> [FIRST n]
  if ((m = s.match(/^COVER\s+(\w+)\s+(?:ON|WHERE)\s+(\w+)\s*(>|<|>=|<=|=)\s*([\d.]+)(?:\s+FIRST\s+(\d+))?$/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const ops = {'>': (a,b)=>a>b,'<': (a,b)=>a<b,'>=': (a,b)=>a>=b,'<=': (a,b)=>a<=b,'=': (a,b)=>a===b};
    const num = parseFloat(m[4]);
    let rows = t.filter(r => typeof r[m[2]]==='number' && ops[m[3]](r[m[2]],num));
    if (m[5]) rows = rows.slice(0, parseInt(m[5]));
    return {count:rows.length,rows};
  }
  // COVER <b> DISTINCT <f>
  if ((m = s.match(/^COVER\s+(\w+)\s+DISTINCT\s+(\w+)$/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const vals = [...new Set(t.map(r=>r[m[2]]))].sort();
    const rows = vals.map(v=>({[m[2]]:v}));
    return {count:rows.length,rows};
  }
  // SECTION <b> AT k=v, k2='v2'
  if ((m = s.match(/^SECTION\s+(\w+)\s+AT\s+(.+)$/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const pairs = m[2].split(',').map(p => p.trim().split('=')).map(([k,v]) => { const val = v.replace(/'/g,'').trim(); return [k.trim(), isNaN(val)?val:parseFloat(val)]; });
    const row = t.find(r => pairs.every(([k,v]) => typeof r[k]==='number' ? r[k]===v : String(r[k])===String(v)));
    return row ? {count:1,rows:[row]} : {count:0,rows:[]};
  }
  // CURVATURE <b>
  if ((m = s.match(/^CURVATURE\s+(\w+)/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const taus = t.map(r=>r.tau).filter(v=>typeof v==='number'&&v>0);
    if (taus.length<2) return {value:0};
    const mean = taus.reduce((a,b)=>a+b,0)/taus.length;
    const vari = taus.reduce((a,v)=>a+(v-mean)**2,0)/taus.length;
    return {value:+(vari/(mean*mean+1)).toFixed(6)};
  }
  // SPECTRAL <b>
  if ((m = s.match(/^SPECTRAL\s+(\w+)/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    return {value:0};
  }
  // CONSISTENCY <b>
  if ((m = s.match(/^CONSISTENCY\s+(\w+)/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const taus = t.map(r=>r.tau).filter(v=>typeof v==='number'&&v>0);
    const mean = taus.length ? taus.reduce((a,b)=>a+b,0)/taus.length : 0;
    const vari = taus.length ? taus.reduce((a,v)=>a+(v-mean)**2,0)/taus.length : 0;
    return {value:+(vari/(mean*mean+1)).toFixed(6)};
  }
  // INTEGRATE <b> OVER <f> MEASURE aggs
  if ((m = s.match(/^INTEGRATE\s+(\w+)\s+OVER\s+(\w+)\s+MEASURE\s+(.+)$/i))) {
    const t = DEMO_DB[m[1]]; if (!t) return _noBundleMsg(m[1]);
    const groupBy = m[2], specs = m[3].split(',').map(s=>s.trim());
    const groups = {}; t.forEach(r => { const k = String(r[groupBy]??'null'); (groups[k]??=[]).push(r); });
    const rows = Object.entries(groups).map(([k,gRows]) => {
      const out = {[groupBy]:k};
      specs.forEach(sp => { const am = sp.match(/^(\w+)\((\*|\w+)\)$/); if(!am) return; const [,fn,col]=am;
        if(fn==='count'){out[sp]=gRows.length;return;} const vals=gRows.map(r=>r[col]).filter(v=>typeof v==='number');
        if(!vals.length){out[sp]=null;return;} if(fn==='avg') out[sp]=+(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(4);
        else if(fn==='sum') out[sp]=+vals.reduce((a,b)=>a+b,0).toFixed(4); else if(fn==='min') out[sp]=Math.min(...vals); else if(fn==='max') out[sp]=Math.max(...vals);
      }); return out;
    });
    return {count:rows.length,rows};
  }
  // Try universe engine for advanced queries (EVALUATE, COMBINE, etc.)
  const uResult = universeGQL(s, DEMO_DB.mirador_universe);
  if (uResult) return uResult;

  return {error:`Could not parse: "${s}"\n\nDemo mode supports:\n  SHOW BUNDLES\n  DESCRIBE <bundle>\n  COVER <bundle> ALL [FIRST n]\n  COVER <bundle> ON <field> = '<value>' [AND ...]\n  COVER <bundle> WHERE <field> > <num>\n  COVER <bundle> DISTINCT <field>\n  SECTION <bundle> AT key=val\n  CURVATURE <bundle>\n  SPECTRAL <bundle>\n  CONSISTENCY <bundle>\n  INTEGRATE <bundle> OVER <f> MEASURE avg(col), count(*)\n  COVER ON mirador_universe WHERE ... EVALUATE coherence ...\n  COMBINE ... MODE COUPLED SYNERGY n ...\n  DECOMPOSE mirador_universe ON drug = 'X' AND tissue = 'Y'\n  COMPARE ['A','B'] ON mirador_universe WHERE tissue = 'Y'`};
}

// ── Preset queries ─────────────────────────────────────────────────
const PRESETS_CLINICAL = [
  { label: '🧬 HIV drugs (all)',     gql: "COVER mirador_drugs ON disease = 'hiv';" },
  { label: '🦠 MRSA drugs',          gql: "COVER mirador_drugs ON disease = 'mrsa';" },
  { label: '🫁 TB drugs',            gql: "COVER mirador_drugs ON disease = 'tb';" },
  { label: '🧠 Meningitis drugs',    gql: "COVER mirador_drugs ON disease = 'meningitis';" },
  { label: '📊 τ by compartment',    gql: 'INTEGRATE mirador_drugs OVER compartment MEASURE avg(tau), count(*);' },
  { label: '📏 Breakpoints',         gql: 'COVER mirador_thresholds ALL;' },
  { label: '💊 Regimens',            gql: 'COVER mirador_regimens ALL;' },
  { label: '🎯 DTG @ CNS',          gql: "COVER mirador_drugs ON drug_name = 'DTG' AND compartment = 'cns';" },
  { label: '📐 τ by disease',        gql: 'INTEGRATE mirador_drugs OVER disease MEASURE avg(tau), count(*);' },
  { label: '📈 High τ drugs',        gql: 'COVER mirador_drugs ON tau > 4;' },
];
const PRESETS_CHEMBL = [
  { label: '📋 Describe activities',  gql: 'DESCRIBE chembl_activities;' },
  { label: '⚗️ Potent hits',          gql: "COVER chembl_activities ON potency_class = 'potent' FIRST 50;" },
  { label: '📊 EC50 measurements',    gql: "COVER chembl_activities ON standard_type = 'EC50' FIRST 50;" },
  { label: '🔬 Human targets',        gql: "COVER chembl_drug_target ON organism = 'Homo sapiens' FIRST 50;" },
  { label: '🧪 Drug-target fibers',   gql: 'COVER chembl_drug_target ALL FIRST 50;' },
  { label: '📋 Describe drug-target',  gql: 'DESCRIBE chembl_drug_target;' },
  { label: '📐 τ by potency',         gql: 'INTEGRATE chembl_activities OVER potency_class MEASURE avg(tau), count(*);' },
  { label: '📊 τ by assay type',      gql: 'INTEGRATE chembl_activities OVER standard_type MEASURE avg(tau), count(*);' },
];
const PRESETS_UNIVERSE = [
  { label: '🌐 All drugs overview',   gql: 'DESCRIBE mirador_drugs;' },
  { label: '🦠 MRSA @ bone',          gql: "COVER mirador_drugs ON disease = 'mrsa' AND compartment = 'bone';" },
  { label: '🧬 HIV @ CNS',            gql: "COVER mirador_drugs ON disease = 'hiv' AND compartment = 'cns';" },
  { label: '🫁 TB @ granuloma',       gql: "COVER mirador_drugs ON disease = 'tb';" },
  { label: '🧠 Meningitis @ CSF',     gql: "COVER mirador_drugs ON disease = 'meningitis' AND compartment = 'csf';" },
  { label: '🔬 Resistance library',   gql: 'COVER mirador_resistance ALL;' },
  { label: '📈 PK studies',           gql: 'COVER mirador_pk_studies ALL;' },
  { label: '📐 τ by organism',        gql: 'INTEGRATE mirador_drugs OVER organism MEASURE avg(tau), count(*);' },
];

// ── Plain-English → GQL demo questions ─────────────────────────────
const NL_GROUPS = [
  {
    label: 'CLINICAL QUESTIONS', color: '#64b5f6',
    questions: [
      { q: "Which HIV drugs cross the blood-brain barrier?",
        gql: "COVER mirador_drugs ON disease = 'hiv' AND compartment = 'cns';",
        tag: "HIV · CNS", why: "CNS penetration is the #1 barrier to HIV cure — τ ranks drugs by geometric BBB permeability in one fiber scan" },
      { q: "What kills MRSA inside bone tissue?",
        gql: "COVER mirador_drugs ON disease = 'mrsa' AND compartment = 'bone';",
        tag: "MRSA · bone", why: "Osteomyelitis needs drugs that survive bone matrix AND biofilm — τ(bone) + k_biofilm surfaced in a single bundle traversal" },
      { q: "Which meningitis drugs reach inflamed CSF?",
        gql: "COVER mirador_drugs ON disease = 'meningitis' AND compartment = 'csf_inflamed';",
        tag: "meningitis · CSF", why: "Inflamed vs uninflamed BBB can differ 10-40× — csf_inflamed compartment uses peak penetration ratios from Nau 2010. Compare vs csf_uninflamed to see the difference" },
      { q: "Show all EUCAST/CLSI resistance breakpoints",
        gql: "COVER mirador_thresholds ALL;",
        tag: "EUCAST · CLSI", why: "Standard MIC S/I/R breakpoints encoded as geometric fiber data — the whole drug-resistance landscape in one statement" },
    ],
  },
  {
    label: 'FOR EVERYONE', color: '#4ade80',
    questions: [
      { q: "What's the best drug combo for a knee implant infection?",
        gql: "COVER mirador_regimens ON disease = 'mrsa';",
        tag: "MRSA · regimens", why: "Prosthetic joint infections need drugs that penetrate biofilm AND bone. Bundle traversal ranks every clinical regimen by synergy score + cure rate in <5ms — months of literature review in one query" },
      { q: "Which drugs have above 90% cure rates?",
        gql: "COVER mirador_regimens ON clinical_efficacy > 0.9;",
        tag: "efficacy · >90%", why: "Clinical efficacy is a validated trial outcome — filtering 1,378 clinical records by a single geometric inequality returns only the elite regimens instantly" },
      { q: "Which drugs can beat drug-resistant TB?",
        gql: "COVER mirador_drugs ON disease = 'tb' AND tau > 4;",
        tag: "XDR-TB · high τ", why: "τ > 4 means AUC₂₄ is 10,000× the MIC — only drugs at this geometric threshold reliably sterilize TB granulomas. Traditional methods take 6-month animal studies to learn this" },
      { q: "What drug resistance mechanisms are we fighting?",
        gql: "COVER mirador_resistance ALL;",
        tag: "resistance · library", why: "Every known resistance mechanism encoded as a geometric fiber — from efflux pumps to enzyme modification. Clinicians can see the full resistance landscape in a single scan" },
    ],
  },
  {
    label: 'CHEMBL · 5.5M RECORDS', color: '#a78bfa',
    questions: [
      { q: "Find the 50 most potent ChEMBL drug hits",
        gql: "COVER chembl_activities ON potency_class = 'potent' FIRST 50;",
        tag: "ChEMBL · 4.9M", why: "Scanning 4.9M bioactivity records for potent hits would take ETL pipelines days — COVER returns 50 in <100ms" },
      { q: "Which human proteins do drugs target most?",
        gql: "COVER chembl_drug_target ON organism = 'Homo sapiens' FIRST 50;",
        tag: "drug-target · 690K", why: "690K drug-target fibers traversed without a JOIN — bundle structure replaces relational joins with geometric projection" },
      { q: "How does potency vary by EC50 vs IC50 vs Ki?",
        gql: "INTEGRATE chembl_activities OVER standard_type MEASURE avg(tau), count(*);",
        tag: "assay type · τ", why: "INTEGRATE is a fiber-bundle integral operator — collapses 4.9M assays into mean τ by assay type, no GROUP BY clause needed" },
      { q: "Rank TB drug efficacy across all compartments",
        gql: "INTEGRATE mirador_drugs OVER compartment MEASURE avg(tau), count(*);",
        tag: "TB · INTEGRATE", why: "TB granulomas have 5 distinct pharmacological barriers — INTEGRATE collapses them all into a ranked τ-summary in <2ms" },
    ],
  },
  {
    label: 'PK / PHARMACOMETRICS', color: '#f0e68c',
    questions: [
      { q: "Rank CNS drugs by AUC:MIC geometric potency index",
        gql: "COVER mirador_drugs ON compartment = 'cns';",
        tag: "CNS · AUC:MIC τ", why: "τ = log₁₀(AUC₂₄/MIC) is the fiber-bundle coordinate for drug potency — sorting CNS drugs by τ takes one scan vs weeks of PK modelling" },
      { q: "Which drug classes have the lowest gut absorption barrier?",
        gql: "INTEGRATE mirador_drugs OVER drug_class MEASURE avg(k_admet), count(*);",
        tag: "k_admet · ADMET", why: "k_admet encodes gut-wall permeability as a geometric curvature coefficient — INTEGRATE collapses the entire ADMET landscape into a ranked class summary" },
      { q: "Find regimens with true pharmacological synergy (FIC < 0.05)",
        gql: "COVER mirador_regimens ON fic_index < 0.05;",
        tag: "FIC · synergy", why: "FIC < 0.5 = synergy, < 0.1 = strong synergy — filtering 1,378 regimens by this single geometric threshold surfaces the genuinely synergistic combos that reduce resistance risk" },
      { q: "Compare average pChEMBL potency by target organism",
        gql: "INTEGRATE chembl_drug_target OVER organism MEASURE avg(avg_pchembl), count(*);",
        tag: "pChEMBL · organism", why: "pChEMBL = −log₁₀(IC₅₀ in mol/L) — INTEGRATE projects 690K drug-target pairs onto the organism fiber, producing a cross-species potency ranking impossible to compute in SQL without multiple CTEs" },
    ],
  },
];
const NL_QUESTIONS = NL_GROUPS.flatMap(g => g.questions);

// ── Syntax highlighting (minimal) ──────────────────────────────────
const GQL_KEYWORDS = /\b(SHOW|DESCRIBE|BUNDLE|BUNDLES|SECTION|SECTIONS|COVER|CURVATURE|SPECTRAL|CONSISTENCY|CONFIDENCE|CAPACITY|INTEGRATE|PULLBACK|CORRELATE|SEGMENT|PREDICT|WILSON|TRANSPORT|GEODESIC|DOUBLECOVER|REDEFINE|RETRACT|ATLAS|EXPLAIN|AT|ON|WHERE|ALL|OVER|MEASURE|PROJECT|DISTINCT|FIRST|RANK|SKIP|SET|BEGIN|COMMIT|ROLLBACK|ALONG|ONTO|INTO|BY|FROM|TO|AROUND|FULL|REPAIR|BASE|FIBER|RANGE|NUMERIC|CATEGORICAL|TEXT|TIMESTAMP|BINARY|VECTOR|HEALTH|VERBOSE|EVALUATE|COMBINE|MODE|COUPLED|SYNERGY|PROVENANCE|ASC|DESC|AND|WITH)\b/gi;
const GQL_FUNCTIONS = /\b(avg|sum|count|min|max|std|var)\b/gi;
const GQL_STRINGS = /('[^']*')/g;
const GQL_NUMBERS = /\b(\d+\.?\d*)\b/g;

function highlightGQL(code) {
  let html = code
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(GQL_STRINGS, '<span style="color:#a5d6a7">$1</span>')
    .replace(GQL_KEYWORDS, '<span style="color:#64b5f6;font-weight:700">$1</span>')
    .replace(GQL_FUNCTIONS, '<span style="color:#ce93d8">$1</span>');
  return html;
}

// ── Result rendering ───────────────────────────────────────────────

function ResultTable({ data }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [expanded, setExpanded] = useState(null);

  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const cols = Object.keys(data[0]);

  const sorted = sortCol ? [...data].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (av == null) return 1; if (bv == null) return -1;
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  }) : data;

  const handleSort = col => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setExpanded(null);
  };

  const fmt = v => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString() : v.toFixed(4);
    return String(v);
  };

  // Drug code → generic name for PubMed searches
  const DRUG_NAMES = {
    VAN:'vancomycin', RIF:'rifampicin', LZD:'linezolid', LZD_TB:'linezolid',
    CRO:'ceftriaxone', DAP:'daptomycin', CAR:'ceftaroline', CLI:'clindamycin',
    DTG:'dolutegravir', TFV:'tenofovir', FTC:'emtricitabine', DRV:'darunavir',
    EFV:'efavirenz', INH:'isoniazid', PZA:'pyrazinamide', EMB:'ethambutol',
    MXF:'moxifloxacin', BDQ:'bedaquiline',
  };

  // Build reference link(s) for provenance / reference columns
  const provenanceUrl = (prov, row) => {
    if (!prov || typeof prov !== 'string') return null;
    if (/WHO/i.test(prov)) return 'https://www.whocc.no/atc_ddd_index/';
    const m = prov.match(/Computed from AUC\/MIC/i);
    if (m && row?.drug) {
      const name = DRUG_NAMES[row.drug] || row.drug;
      const drug = encodeURIComponent(name);
      const disease = row.disease ? encodeURIComponent(row.disease) : '';
      return `https://pubmed.ncbi.nlm.nih.gov/?term=${drug}+AUC+MIC${disease ? '+' + disease : ''}`;
    }
    return null;
  };

  // Parse "Author, Journal Year; Author2, Journal2 Year2" into per-citation PubMed links
  const refLinks = (val) => {
    if (!val || typeof val !== 'string') return null;
    const cites = val.split(/;\s*/).filter(Boolean);
    if (!cites.length) return null;
    return cites.map((cite, i) => {
      const q = encodeURIComponent(cite.trim());
      const url = `https://pubmed.ncbi.nlm.nih.gov/?term=${q}`;
      return <span key={i}>{i > 0 && '; '}<a href={url} target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        style={{ color: '#22d3ee', textDecoration: 'underline', textUnderlineOffset: 2 }}>{cite.trim()}</a></span>;
    });
  };

  // Render a cell value, making provenance/reference columns clickable
  const renderCell = (col, val, row) => {
    if (val === null || val === undefined) return <span style={{ color: '#334155' }}>—</span>;
    if (col === 'provenance') {
      const url = provenanceUrl(val, row);
      return url ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        style={{ color: '#22d3ee', textDecoration: 'underline', textUnderlineOffset: 2 }}>{fmt(val)}</a> : fmt(val);
    }
    if (col === 'reference' || col === 'guideline') {
      const links = refLinks(val);
      return links || fmt(val);
    }
    if (col === 'trial') {
      const q = encodeURIComponent(String(val).trim());
      const url = `https://clinicaltrials.gov/search?term=${q}`;
      return <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
        style={{ color: '#22d3ee', textDecoration: 'underline', textUnderlineOffset: 2 }}>{fmt(val)}</a>;
    }
    if (col === 'drug_name' || col === 'drugs') {
      const names = String(val).split(',').map(s => s.trim()).filter(Boolean);
      return names.map((n, i) => {
        const generic = DRUG_NAMES[n] || n.toLowerCase();
        const url = `https://dailymed.nlm.nih.gov/dailymed/search.cfm?labeltype=all&query=${encodeURIComponent(generic)}`;
        return <span key={i}>{i > 0 && ', '}<a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          style={{ color: '#22d3ee', textDecoration: 'underline', textUnderlineOffset: 2 }}>{n}</a></span>;
      });
    }
    return fmt(val);
  };

  // Color-code numeric values by magnitude (tau / pchembl / etc)
  const numColor = (col, v) => {
    if (typeof v !== 'number') return '#e2e8f0';
    const lc = col.toLowerCase();
    if (lc.includes('tau') || lc.includes('pchembl') || lc.includes('avg')) {
      if (v >= 7) return '#4ade80'; if (v >= 5) return '#f0e68c'; return '#f87171';
    }
    return '#f0e68c';
  };

  return (
    <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, fontFamily: FONT }}>
        <thead>
          <tr>
            {cols.map(c => {
              const active = sortCol === c;
              return (
                <th key={c} onClick={() => handleSort(c)}
                  style={{ position: 'sticky', top: 0, background: '#0f0f1a', padding: '6px 10px',
                    textAlign: 'left', color: active ? '#64b5f6' : '#475569', borderBottom: '2px solid #1e3a5f',
                    whiteSpace: 'nowrap', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                    userSelect: 'none', transition: 'color 0.1s' }}
                  onMouseOver={e => e.currentTarget.style.color = '#94a3b8'}
                  onMouseOut={e => e.currentTarget.style.color = active ? '#64b5f6' : '#475569'}>
                  {c} {active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const isExp = expanded === i;
            return (
              <>
                <tr key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{ background: isExp ? '#0d2040' : i % 2 === 0 ? '#0a0a14' : '#0f0f1a', cursor: 'pointer' }}
                  onMouseOver={e => { if (!isExp) e.currentTarget.style.background = '#131330'; }}
                  onMouseOut={e => { if (!isExp) e.currentTarget.style.background = i % 2 === 0 ? '#0a0a14' : '#0f0f1a'; }}>
                  {cols.map(c => {
                    const v = row[c];
                    return (
                      <td key={c} style={{ padding: '5px 10px', color: numColor(c, v), borderBottom: isExp ? 'none' : '1px solid #1a1a2e',
                        whiteSpace: ['reference','guideline','trial','indication'].includes(c) ? 'normal' : 'nowrap', fontVariantNumeric: typeof v === 'number' ? 'tabular-nums' : undefined }}>
                        {renderCell(c, v, row)}
                      </td>
                    );
                  })}
                </tr>
                {isExp && (
                  <tr key={`exp-${i}`}>
                    <td colSpan={cols.length} style={{ padding: 0, borderBottom: '2px solid #1e3a5f' }}>
                      <div style={{ background: '#080e1a', padding: '12px 16px', display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px 20px' }}>
                        <div style={{ gridColumn: '1 / -1', fontSize: 9, color: '#22d3ee', letterSpacing: 2,
                          fontWeight: 700, marginBottom: 4 }}>ROW DETAIL — click header to sort, click row to collapse</div>
                        {cols.map(c => {
                          const v = row[c];
                          return (
                            <div key={c}>
                              <div style={{ fontSize: 8, color: '#475569', letterSpacing: 1, marginBottom: 2 }}>{c.toUpperCase()}</div>
                              <div style={{ fontSize: 12, color: numColor(c, v), fontWeight: typeof v === 'number' ? 700 : 400,
                                wordBreak: 'break-word', whiteSpace: 'normal' }}>
                                {renderCell(c, v, row)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetaPanel({ meta }) {
  if (!meta || typeof meta !== 'object') return null;
  const entries = Object.entries(meta);
  if (entries.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '8px 0' }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{ background: '#1a1a2e', borderRadius: 6, padding: '8px 14px', border: '1px solid #2a2a44' }}>
          <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>{k}</div>
          <div style={{ fontSize: 16, color: '#e2e8f0', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(6)) : String(v)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────

export default function GigiExplorer() {
  const [host, setHost] = useState(() => {
    const saved = localStorage.getItem('gigi_host');
    if (saved && saved.includes('localhost')) { localStorage.removeItem('gigi_host'); return DEFAULT_HOST; }
    return saved || DEFAULT_HOST;
  });
  const [query, setQuery] = useState("COVER mirador_drugs ON disease = 'hiv';");
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(null);
  const [elapsed, setElapsed] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const textareaRef = useRef(null);
  const highlightRef = useRef(null);
  const [nlActive, setNlActive] = useState(null);
  const nlTypingRef = useRef(null);
  const [nlQuestion, setNlQuestion] = useState('');
  const [nlAnswer, setNlAnswer] = useState(null);
  const [isMob, setIsMob] = useState(() => window.innerWidth < 640);
  const [wasmReady, setWasmReady] = useState(false);

  // WASM init — must happen before any buildUniverse call
  useEffect(() => {
    initEngine('/mirador_universe/mirador_universe_wasm_bg.wasm').then(() => {
      DEMO_DB = {
        mirador_drugs: _DRUGS,
        mirador_thresholds: THRESHOLDS,
        mirador_regimens: REGIMENS,
        mirador_universe: buildUniverse(_DRUGS, THRESHOLDS, REGIMENS),
      };
      setWasmReady(true);
    });
  }, []);

  useEffect(() => {
    const handler = () => setIsMob(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  useEffect(() => { localStorage.setItem('gigi_host', host); }, [host]);

  // Health check — auto-fallback to demo mode
  useEffect(() => {
    setConnected(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    fetch(`${host}/v1/health`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(() => { setConnected(true); setDemoMode(false); })
      .catch(() => { setConnected(false); setDemoMode(true); });
    return () => { clearTimeout(timer); controller.abort(); };
  }, [host]);

  const syncScroll = useCallback(() => {
    if (highlightRef.current && textareaRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const runQuery = useCallback(async (q) => {
    const queryText = (q || query).trim();
    if (!queryText) return;
    setLoading(true); setError(null); setResult(null); setElapsed(null);
    const t0 = performance.now();

    // Universe queries always run locally — the GIGI server doesn't handle them
    const isUniverseQ = /^COVER\s+ON\s+mirador_universe\b/i.test(queryText) ||
                        /^(DECOMPOSE|COMPARE|COMPLETE|PROPAGATE|COMBINE)\b/i.test(queryText);
    if (isUniverseQ) {
      await new Promise(r => setTimeout(r, 15));
      const dt = performance.now() - t0;
      setElapsed(dt);
      // Handle UNION queries (multi-disease): split, run each, merge rows
      let res;
      if (/--\s*UNION\s*--/i.test(queryText)) {
        const parts = queryText.split(/\n?--\s*UNION\s*--\n?/i).map(s => s.trim()).filter(Boolean);
        const allRows = [];
        for (const part of parts) {
          const sub = universeGQL(part, DEMO_DB.mirador_universe);
          if (sub?.rows) for (const row of sub.rows) allRows.push(row);
        }
        allRows.sort((a, b) => (b.C ?? 0) - (a.C ?? 0));
        res = allRows.length ? { count: allRows.length, rows: allRows, meta: { source: 'mirador_universe', mode: 'evaluate_coherence', multi_disease: true } } : null;
      } else {
        res = universeGQL(queryText, DEMO_DB.mirador_universe);
      }
      res = res || {error:'Universe query could not be evaluated'};
      if (res.error) setError(res.error); else setResult(res);
      setHistory(prev => [{ query: queryText, time: new Date().toISOString(), elapsed: dt, demo: true }, ...prev].slice(0, 50));
      setLoading(false);
      return;
    }

    if (demoMode || !connected) {
      await new Promise(r => setTimeout(r, 15));
      const dt = performance.now() - t0;
      setElapsed(dt);
      const res = demoGQL(queryText);
      if (res.error) setError(res.error); else setResult(res);
      setHistory(prev => [{ query: queryText, time: new Date().toISOString(), elapsed: dt, demo: true }, ...prev].slice(0, 50));
      setLoading(false);
      return;
    }

    try {
      const resp = await fetch(`${host}/v1/gql`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText }),
      });
      const dt = performance.now() - t0; setElapsed(dt);
      if (!resp.ok) {
        const errBody = await resp.text();
        try { const j = JSON.parse(errBody); setError(j.error || errBody); } catch { setError(`HTTP ${resp.status}: ${errBody}`); }
        return;
      }
      const data = await resp.json();
      if (data.error) { setError(data.error); return; }
      setResult(data);
      setHistory(prev => [{ query: queryText, time: new Date().toISOString(), elapsed: dt }, ...prev].slice(0, 50));
    } catch (e) {
      setElapsed(performance.now() - t0);
      setError(`Connection failed: ${e.message}`);
    } finally { setLoading(false); }
  }, [query, host, demoMode, connected]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current, start = ta.selectionStart, end = ta.selectionEnd;
      setQuery(ta.value.substring(0, start) + '  ' + ta.value.substring(end));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
  };

  const animateGQL = useCallback((gqlStr, idx) => {
    if (nlTypingRef.current) clearInterval(nlTypingRef.current);
    setNlActive(idx); setQuery(''); setResult(null); setError(null);
    let i = 0;
    nlTypingRef.current = setInterval(() => {
      i++;
      setQuery(gqlStr.slice(0, i));
      if (i >= gqlStr.length) {
        clearInterval(nlTypingRef.current);
        nlTypingRef.current = null;
        setTimeout(() => runQuery(gqlStr), 200);
      }
    }, 14);
  }, [runQuery]);

  const handleNlSubmit = useCallback(() => {
    const q = nlQuestion.trim();
    if (!q || !DEMO_DB?.mirador_universe) return;
    setNlAnswer(null);
    const res = nlToGql(q, DEMO_DB.mirador_universe);
    setNlAnswer(res);
    if (res.generated_gql) {
      // Show the GQL in the query box (animated) but set the result directly
      // from nlToGql instead of re-running through demoGQL.
      if (nlTypingRef.current) clearInterval(nlTypingRef.current);
      setNlActive(null); setQuery(''); setError(null);
      // Use the result already computed by nlToGql (handles UNION/multi-disease)
      if (res.result) {
        setResult(res.result);
      }
      // Animate the GQL text into the query box (display only, no re-execution)
      let i = 0;
      nlTypingRef.current = setInterval(() => {
        i++;
        setQuery(res.generated_gql.slice(0, i));
        if (i >= res.generated_gql.length) {
          clearInterval(nlTypingRef.current);
          nlTypingRef.current = null;
        }
      }, 14);
    }
  }, [nlQuestion]);

  const resultData = result?.rows ?? result?.bundles ?? result?.data ?? (result?.value !== undefined ? [{value: result.value}] : null);
  const resultMeta = result?.meta ?? (result?.count !== undefined ? {count: result.count} : null);
  const resultStatus = result?.status ?? (result?.error ? 'error' : result ? 'ok' : null);
  const rowCount = Array.isArray(resultData) ? resultData.length : null;

  if (!wasmReady) return (
    <div style={{ minHeight: '100vh', background: '#03030a', color: '#64b5f6', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>
      Initializing WASM engine…
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#03030a', color: '#e2e8f0', fontFamily: FONT, padding: 0 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #0f172a 50%, #0a0a1a 100%)', borderBottom: '1px solid #1e3a5f', padding: isMob ? '14px 14px' : '20px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1400, margin: '0 auto', flexWrap: 'wrap', gap: 12, flexDirection: isMob ? 'column' : 'row' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -1 }}>
              <span style={{ color: '#64b5f6' }}>GIGI</span>
              <span style={{ color: '#475569' }}> × </span>
              <span style={{ color: '#a78bfa' }}>MIRADOR</span>
            </div>
            <div style={{ fontSize: 10, color: '#475569', letterSpacing: 2, borderLeft: '1px solid #1a1a2e', paddingLeft: 14 }}>
              FIBER BUNDLE<br/>EXPLORER
            </div>
            {!isMob && <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, maxWidth: 480, borderLeft: '1px solid #1a1a2e', paddingLeft: 14 }}>
              Explore <span style={{ color: '#22d3ee' }}>3M+</span> pharmacological records stored as <span style={{ color: '#a78bfa' }}>fiber bundles</span> — not flat tables.
              Clinical PK/PD data (EUCAST/CLSI) plus ChEMBL v36 bioactivities, compounds & targets.
              Each record carries a geometric potency coordinate <span style={{ color: '#f0e68c' }}>τ</span> that encodes drug-target affinity on a manifold — enabling
              {' '}<code style={{ color: '#a78bfa', background: '#a78bfa12', padding: '1px 4px', borderRadius: 3 }}>CURVATURE</code>,
              {' '}<code style={{ color: '#a78bfa', background: '#a78bfa12', padding: '1px 4px', borderRadius: 3 }}>SECTION</code>, and
              {' '}<code style={{ color: '#a78bfa', background: '#a78bfa12', padding: '1px 4px', borderRadius: 3 }}>COVER</code> queries
              that no relational DB can express.
            </div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {demoMode && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a0a', border: '1px solid #4a3f00', borderRadius: 4, padding: '4px 10px' }}>
                <span style={{ fontSize: 12 }}>⚡</span>
                <span style={{ fontSize: 9, color: '#f59e0b', letterSpacing: 1, fontWeight: 700 }}>DEMO MODE</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%',
                background: connected === true ? '#22c55e' : demoMode ? '#f59e0b' : connected === false ? '#ef4444' : '#64748b',
                boxShadow: connected === true ? '0 0 8px #22c55e55' : demoMode ? '0 0 8px #f59e0b33' : 'none' }} />
              <span style={{ fontSize: 9, color: '#64748b', letterSpacing: 1 }}>
                {connected === true ? 'LIVE · 3M+ RECORDS' : demoMode ? `${DEMO_DB.mirador_drugs.length} CLINICAL · ${DEMO_DB.mirador_universe.length} UNIVERSE` : connected === false ? 'OFFLINE' : 'CHECKING…'}
              </span>
            </div>
            <input value={host} onChange={e => setHost(e.target.value)}
              style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 4, padding: '5px 10px', color: '#94a3b8', fontSize: 10, fontFamily: FONT, width: isMob ? '100%' : 220 }}
              placeholder="http://localhost:3142" spellCheck={false} />
          </div>
        </div>
      </div>

      {/* Demo banner */}
      {demoMode && (
        <div style={{ background: '#0a0a14', borderBottom: '1px solid #1a1a2e', padding: isMob ? '8px 12px' : '8px 32px', textAlign: 'center' }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>
            Running against <span style={{ color: '#f59e0b' }}>embedded clinical seed data</span> ({DEMO_DB.mirador_drugs.length} drug sections · {THRESHOLDS.length} breakpoints · {REGIMENS.length} regimens · {DEMO_DB.mirador_universe.length} universe records).
            ChEMBL queries require a <span style={{ color: '#a78bfa' }}>live GIGI connection</span>. Universe queries with <span style={{ color: '#22d3ee' }}>EVALUATE</span> and <span style={{ color: '#22d3ee' }}>COMBINE</span> run in-browser.
          </span>
        </div>
      )}

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMob ? '12px 12px' : '20px 32px', display: 'grid', gridTemplateColumns: isMob ? '1fr' : '220px 1fr', gap: 20, minHeight: 'calc(100vh - 120px)' }}>
        {/* Sidebar */}
        <div>
          {/* Show Bundles — always first */}
          <button
            onClick={() => { setQuery('SHOW BUNDLES;'); runQuery('SHOW BUNDLES;'); }}
            style={{ background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 4, padding: '7px 10px', color: '#64b5f6', fontSize: 10, fontFamily: FONT, textAlign: 'left', cursor: 'pointer', width: '100%', marginBottom: 12, fontWeight: 700, letterSpacing: 1 }}
            onMouseOver={e => { e.currentTarget.style.background = '#2a2a44'; }}
            onMouseOut={e => { e.currentTarget.style.background = '#1a1a2e'; }}>
            📦 Show all bundles
          </button>

          <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 2, marginBottom: 6, fontWeight: 700 }}>CLINICAL PK/PD</div>
          <div style={{ fontSize: 8, color: '#475569', marginBottom: 8, lineHeight: 1.4 }}>
            EUCAST/CLSI-validated drug sections across HIV, MRSA, TB & meningitis compartments
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PRESETS_CLINICAL.map((p, i) => (
              <button key={'c'+i}
                onClick={() => { setQuery(p.gql); runQuery(p.gql); }}
                style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '7px 10px', color: '#94a3b8', fontSize: 10, fontFamily: FONT, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onMouseOver={e => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#2a2a44'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'transparent'; }}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 9, color: demoMode ? '#5a4f8a' : '#a78bfa', letterSpacing: 2, marginTop: 16, marginBottom: 6, fontWeight: 700 }}>CHEMBL BIOACTIVITY {demoMode && <span style={{ fontSize: 7, color: '#475569' }}>🔒 LIVE</span>}</div>
          <div style={{ fontSize: 8, color: '#475569', marginBottom: 8, lineHeight: 1.4 }}>
            4.9M activities + 690K drug-target fibers from ChEMBL v36
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: demoMode ? 0.45 : 1 }}>
            {PRESETS_CHEMBL.map((p, i) => (
              <button key={'ch'+i}
                onClick={() => { setQuery(p.gql); runQuery(p.gql); }}
                style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '7px 10px', color: '#94a3b8', fontSize: 10, fontFamily: FONT, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onMouseOver={e => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#2a2a44'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'transparent'; }}>
                {p.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: 9, color: '#22d3ee', letterSpacing: 2, marginTop: 16, marginBottom: 6, fontWeight: 700 }}>MIRADOR UNIVERSE</div>
          <div style={{ fontSize: 8, color: '#475569', marginBottom: 8, lineHeight: 1.4 }}>
            Cross-compartment PK/PD — drugs by disease & tissue site, resistance library & PK studies
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {PRESETS_UNIVERSE.map((p, i) => (
              <button key={'u'+i}
                onClick={() => { setQuery(p.gql); runQuery(p.gql); }}
                style={{ background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '7px 10px', color: '#94a3b8', fontSize: 10, fontFamily: FONT, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                onMouseOver={e => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#e2e8f0'; e.currentTarget.style.borderColor = '#2a2a44'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'transparent'; }}>
                {p.label}
              </button>
            ))}
          </div>
          {history.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 9, color: '#64748b', letterSpacing: 2, marginBottom: 10, fontWeight: 700 }}>HISTORY</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 300, overflowY: 'auto' }}>
                {history.map((h, i) => (
                  <button key={i}
                    onClick={() => { setQuery(h.query); runQuery(h.query); }}
                    title={h.query}
                    style={{ background: 'transparent', border: 'none', padding: '4px 8px', color: '#475569', fontSize: 9, fontFamily: FONT, textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderRadius: 3 }}
                    onMouseOver={e => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#94a3b8'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; }}>
                    {h.demo ? '⚡ ' : ''}{h.query.length > 28 ? h.query.slice(0, 28) + '…' : h.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

          {/* ── NL → GQL Live Translator ─────────────────────────── */}
          <div style={{ background: '#07071a', border: '1px solid #1a2a40', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 14px', borderBottom: '1px solid #1a1a2e', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 9, color: '#64748b', letterSpacing: 2, fontWeight: 700 }}>ASK IN PLAIN ENGLISH</span>
              <span style={{ fontSize: 9, color: '#2a3a50' }}>→</span>
              <span style={{ fontSize: 9, color: '#334155' }}>translated to GQL & executed against {demoMode ? 'demo engine' : '5.5M live records'}</span>
            </div>

            {/* Free-text NL input */}
            <div style={{ padding: '10px 14px', display: 'flex', gap: 8, borderBottom: '1px solid #1a1a2e', background: '#08081a' }}>
              <input
                type="text" value={nlQuestion}
                onChange={e => setNlQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleNlSubmit(); } }}
                placeholder="e.g. Can vancomycin reach MRSA in bone?"
                style={{ flex: 1, background: '#0f0f1e', border: '1px solid #1e2e48', borderRadius: 6, padding: '8px 12px',
                  color: '#e2e8f0', fontSize: 12, fontFamily: FONT, outline: 'none', caretColor: '#64b5f6' }}
              />
              <button onClick={handleNlSubmit} disabled={!nlQuestion.trim()}
                style={{ background: nlQuestion.trim() ? '#1e3a5f' : '#0f0f1e', color: nlQuestion.trim() ? '#64b5f6' : '#334155',
                  border: '1px solid #2a4a6f', borderRadius: 6, padding: '8px 16px', fontSize: 10, fontFamily: FONT,
                  fontWeight: 700, cursor: nlQuestion.trim() ? 'pointer' : 'default', letterSpacing: 1, transition: 'all 0.15s' }}>
                ASK
              </button>
            </div>

            {/* NL answer panel */}
            {nlAnswer && nlAnswer.status === 'ok' && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1a1a2e', background: '#0a1020' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 8, color: '#22d3ee', letterSpacing: 1, fontWeight: 700 }}>ANSWER</span>
                  <span style={{ fontSize: 8, color: nlAnswer.verdict === 'meets_threshold' || nlAnswer.verdict === 'drugs_available' ? '#22c55e' : '#f59e0b',
                    letterSpacing: 1, fontWeight: 700 }}>{nlAnswer.verdict?.toUpperCase().replace(/_/g, ' ')}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>{nlAnswer.answer}</div>
                {nlAnswer.follow_ups?.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 8, color: '#475569', letterSpacing: 1, alignSelf: 'center' }}>FOLLOW-UP:</span>
                    {nlAnswer.follow_ups.map((f, i) => (
                      <button key={i} onClick={() => animateGQL(f.gql, null)}
                        style={{ background: '#0f0f20', border: '1px solid #1e2e48', borderRadius: 4, padding: '4px 10px',
                          color: '#64b5f6', fontSize: 9, fontFamily: FONT, cursor: 'pointer' }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {nlAnswer && nlAnswer.status === 'clarification_needed' && (
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #1a1a2e', background: '#0a1020' }}>
                <div style={{ fontSize: 8, color: '#f59e0b', letterSpacing: 1, fontWeight: 700, marginBottom: 6 }}>CLARIFICATION NEEDED</div>
                <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.6, marginBottom: 8 }}>{nlAnswer.message}</div>
                {nlAnswer.options && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {nlAnswer.options.map((o, i) => (
                      <button key={i} onClick={() => { setNlAnswer(null); animateGQL(o.gql, null); }}
                        style={{ background: '#0f0f20', border: '1px solid #1e2e48', borderRadius: 4, padding: '5px 12px',
                          color: '#64b5f6', fontSize: 10, fontFamily: FONT, cursor: 'pointer' }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Preset NL question cards */}
            {NL_GROUPS.map((group, gi) => {
              const groupStart = NL_GROUPS.slice(0, gi).reduce((s, g) => s + g.questions.length, 0);
              return (
                <div key={gi}>
                  <div style={{ padding: '6px 14px 4px', background: '#05050f', borderTop: gi > 0 ? '1px solid #12121e' : 'none',
                    fontSize: 8, color: group.color, letterSpacing: 2, fontWeight: 700, opacity: 0.7 }}>
                    {group.label}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMob ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 8, padding: '6px 14px 10px' }}>
                    {group.questions.map((nq, qi) => {
                      const idx = groupStart + qi;
                      return (
                        <button key={idx} onClick={() => animateGQL(nq.gql, idx)}
                          style={{ background: nlActive === idx ? '#0d2040' : '#0f0f1e',
                            border: `1px solid ${nlActive === idx ? group.color + '60' : '#1e1e32'}`,
                            borderRadius: 6, padding: '9px 12px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseOver={e => { if (nlActive !== idx) { e.currentTarget.style.background = '#13132a'; e.currentTarget.style.borderColor = group.color + '30'; } }}
                          onMouseOut={e => { if (nlActive !== idx) { e.currentTarget.style.background = '#0f0f1e'; e.currentTarget.style.borderColor = '#1e1e32'; } }}>
                          <div style={{ fontSize: 10, color: nlActive === idx ? '#e2e8f0' : '#94a3b8', lineHeight: 1.45, marginBottom: 5 }}>{nq.q}</div>
                          <div style={{ fontSize: 8, color: nlActive === idx ? group.color : '#334155', letterSpacing: 1, fontWeight: 700 }}>{nq.tag}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {nlActive !== null && (
              <div style={{ borderTop: '1px solid #1a1a2e', padding: '8px 14px', display: 'flex', gap: 10, alignItems: 'flex-start', background: '#0a0a18' }}>
                <span style={{ fontSize: 8, color: '#22d3ee', letterSpacing: 1, fontWeight: 700, whiteSpace: 'nowrap', paddingTop: 1 }}>WHY FASTER</span>
                <span style={{ fontSize: 10, color: '#64748b', lineHeight: 1.5 }}>{NL_QUESTIONS[nlActive].why}</span>
              </div>
            )}
          </div>

          {/* Editor */}
          <div style={{ position: 'relative', borderRadius: 8, border: '1px solid #1e3a5f', overflow: 'hidden', background: '#0a0a14' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: '#0f0f1a', borderBottom: '1px solid #1a1a2e' }}>
              <span style={{ fontSize: 9, color: '#64748b', letterSpacing: 2 }}>GQL QUERY</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#475569' }}>Ctrl+Enter to run</span>
                <button onClick={() => runQuery()} disabled={loading}
                  style={{ background: loading ? '#1a1a2e' : '#1e3a5f', color: loading ? '#475569' : '#64b5f6', border: '1px solid #2a4a6f', borderRadius: 4, padding: '4px 16px', fontSize: 10, fontFamily: FONT, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', letterSpacing: 1, transition: 'all 0.15s' }}
                  onMouseOver={e => { if (!loading) e.currentTarget.style.background = '#2a4a7f'; }}
                  onMouseOut={e => { if (!loading) e.currentTarget.style.background = '#1e3a5f'; }}>
                  {loading ? <><span className="gigi-spinner">⟳</span><span className="gigi-blink"> RUNNING…</span></> : '▶ RUN'}
                </button>
              </div>
            </div>
            <div style={{ position: 'relative', minHeight: 120 }}>
              <pre ref={highlightRef} aria-hidden="true"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, margin: 0, padding: 14, fontSize: 13, lineHeight: '20px', fontFamily: FONT, color: 'transparent', background: 'transparent', overflow: 'hidden', pointerEvents: 'none', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}
                dangerouslySetInnerHTML={{ __html: highlightGQL(query) + '\n' }} />
              <textarea ref={textareaRef} value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown} onScroll={syncScroll} spellCheck={false}
                style={{ position: 'relative', width: '100%', minHeight: 120, resize: 'vertical', background: 'transparent', color: '#e2e8f080', caretColor: '#64b5f6', border: 'none', outline: 'none', padding: 14, fontSize: 13, lineHeight: '20px', fontFamily: FONT, whiteSpace: 'pre-wrap', wordWrap: 'break-word', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Status bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 10 }}>
            {elapsed !== null && <span style={{ color: '#64748b' }}>⏱ {elapsed.toFixed(1)}ms</span>}
            {rowCount !== null && <span style={{ color: '#64748b' }}>{rowCount} row{rowCount !== 1 ? 's' : ''}</span>}
            {resultStatus && (
              <span style={{ color: resultStatus === 'ok' ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                {resultStatus === 'ok' ? '✓ OK' : `✗ ${resultStatus}`}
              </span>
            )}
            {demoMode && result && <span style={{ color: '#f59e0b', fontSize: 9 }}>⚡ demo engine</span>}
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#1a0a0a', border: '1px solid #5c2020', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>ERROR</div>
              <pre style={{ margin: 0, fontSize: 11, color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</pre>
            </div>
          )}

          {/* Meta panel */}
          {resultMeta && <MetaPanel meta={resultMeta} />}

          {/* Results */}
          {result && (
            <div style={{ background: '#0a0a14', border: '1px solid #1a1a2e', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid #1a1a2e', background: '#0f0f1a' }}>
                <span style={{ fontSize: 9, color: '#64748b', letterSpacing: 2, fontWeight: 700 }}>RESULTS</span>
                <button onClick={() => {
                    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = url; a.download = 'gigi_query_result.json'; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  style={{ background: 'transparent', border: '1px solid #2a2a44', borderRadius: 3, padding: '3px 10px', color: '#64748b', fontSize: 9, fontFamily: FONT, cursor: 'pointer', letterSpacing: 1 }}
                  onMouseOver={e => e.currentTarget.style.color = '#e2e8f0'}
                  onMouseOut={e => e.currentTarget.style.color = '#64748b'}>
                  ↓ JSON
                </button>
              </div>
              {Array.isArray(resultData) && resultData.length > 0
                ? <ResultTable data={resultData} />
                : <pre style={{ margin: 0, padding: 14, fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 500, overflowY: 'auto' }}>{JSON.stringify(result, null, 2)}</pre>
              }
            </div>
          )}

          {/* Empty state */}
          {!result && !error && !loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#334155' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⟐</div>
              <div style={{ fontSize: 12, letterSpacing: 2 }}>ENTER A GQL QUERY OR CLICK A PRESET</div>
              <div style={{ fontSize: 10, color: '#1e293b', marginTop: 8 }}>
                {demoMode ? `⚡ Demo mode — ${DEMO_DB.mirador_drugs.length} clinical drug sections in-browser · ChEMBL queries need live server` : 'Connected — 3M+ records across clinical PK/PD & ChEMBL bioactivity bundles'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #1a1a2e', padding: isMob ? '12px 12px' : '12px 32px', display: 'flex', justifyContent: 'center', gap: isMob ? 10 : 24, fontSize: 9, color: '#334155', flexWrap: 'wrap' }}>
        <span>GIGI Fiber Bundle Database</span>
        <span>•</span>
        <span>Clinical PK/PD + ChEMBL v36</span>
        <span>•</span>
        <span>{demoMode ? 'In-Browser Demo Engine' : '3M+ records · POST /v1/gql'}</span>
      </div>
    </div>
  );
}
