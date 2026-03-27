#!/usr/bin/env node
// One-off script: load WASM, build universe from seed data, write JSON.
// Usage: node scripts/build_universe.mjs

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmJsPath = resolve(__dirname, '../mirador-frontend/src/mirador_universe/mirador_universe_wasm.js');
const wasmBinPath = resolve(__dirname, '../mirador-frontend/src/mirador_universe/mirador_universe_wasm_bg.wasm');

// Dynamic import of the ES module WASM wrapper
const { initSync, wasm_build_universe } = await import('file:///' + wasmJsPath.replace(/\\/g, '/'));

const buf = readFileSync(wasmBinPath);
initSync({ module: buf });

// ── Seed data (mirrors GigiExplorer.jsx) ───────────────────────────
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

function buildDrugs() {
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

// Build
const drugs = buildDrugs();
const json = wasm_build_universe(JSON.stringify({ drugs, thresholds: THRESHOLDS, regimens: REGIMENS }));
const universe = JSON.parse(json);

console.log(`Built universe: ${universe.length} records`);
console.log(`Drugs: ${[...new Set(universe.map(r => r.drug))].join(', ')}`);
console.log(`Diseases: ${[...new Set(universe.map(r => r.disease))].join(', ')}`);

const outPath = resolve(__dirname, '../api/v1/_universe.json');
writeFileSync(outPath, JSON.stringify(universe, null, 2));
console.log(`Written to ${outPath}`);
