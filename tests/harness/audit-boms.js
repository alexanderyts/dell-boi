/* =============================================================================
 * GUIDE ACCURACY AUDIT — exercise the input space every guide funnels into
 * (guided / discovery / expert all call recommend(); RA calls recommendRA())
 * and assert BOM-accuracy invariants for each. Reports any violation.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm');
global.window = {};
['js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
 'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js',
 'js/validate.js','js/engine.js','js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\' + f, 'utf8'), { filename: f }));
const C = window.window ? window.window.CATALOG : window.CATALOG;
const known = new Set(C.switches.map(s => s.model));
const gb = s => { const m = String(s).match(/(\d+(?:\.\d+)?)\s*(T|G)/i); return m ? (m[2].toUpperCase() === 'T' ? parseFloat(m[1]) * 1000 : parseFloat(m[1])) : 0; };

let problems = [];
function audit(name, res) {
  const P = m => problems.push(`[${name}] ${m}`);
  // Edge/access has its OWN invariants: client cabling is by others (not in BOM), and it's
  // access→distribution (VLT/MC-LAG), not leaf-spine.
  if (res.isEdge) {
    const a = res.fabrics.find(f => f.network === 'access');
    if (!a) { P('edge: no access fabric'); return; }
    if (!known.has(a.leaf.model) || (!res.isRefresh && !/E32/.test(a.leaf.model))) P(`edge: access leaf ${a.leaf.model} not E-series`);
    if (a.spine && !known.has(a.spine.model)) P(`edge: distribution ${a.spine.model} not in catalog`);
    if (!res.bom.some(b => b.category === 'Cable/Optic' && /Access-to-distribution/i.test(b.note || ''))) P('edge: no access-to-distribution uplink cable');
    res.bom.forEach(b => { if (typeof b.qty === 'number' && b.qty <= 0) P(`edge qty ≤ 0: ${b.item || b.model}`); });
    res.bom.filter(b => b.category === 'Switch' || b.category === 'Management').forEach(b => { if (!known.has(b.model)) P(`edge unknown model ${b.model}`); });
    if (!res.bom.some(b => b.category === 'Switch')) P('edge: no switches');
    return;
  }
  const data = res.fabrics.filter(f => f.network !== 'mgmt');
  // 1. every data fabric has a leaf + a host cable line matching totalLinks
  data.forEach(f => {
    if (!f.leaf) return P(`${f.network}: no leaf switch`);
    if (!known.has(f.leaf.model)) return P(`${f.network}: leaf ${f.leaf.model} not in catalog`);
    // existence (case-insensitive network match); exact qty is checked globally below
    const hostLines = res.bom.filter(b => b.category === 'Cable/Optic' && /Host-to-leaf/i.test(b.note || '') && new RegExp(f.network, 'i').test(b.note || ''));
    if (!hostLines.length) P(`${f.network}: no host-to-leaf cable line`);
    // host link count = units × ports/unit
    if (f.linksPerUnit && f.unitsN && f.totalLinks !== f.linksPerUnit * f.unitsN) P(`${f.network}: links ${f.totalLinks} ≠ ${f.unitsN}×${f.linksPerUnit}`);
    // host speed must not exceed leaf access speed
    if (f.leaf.access && gb(f.speed) > gb(f.leaf.access.speed) + 0.001) P(`${f.network}: host ${f.speed} > leaf ${f.leaf.model} access ${f.leaf.access.speed}`);
    // spine present => uplink cable line + spine switch line
    if (f.spine) {
      if (!known.has(f.spine.model)) P(`${f.network}: spine ${f.spine.model} not in catalog`);
      const up = res.bom.some(b => b.category === 'Cable/Optic' && /[Ll]eaf-to-spine|BREAKOUT/.test(b.note || '') && (b.note || '').includes(f.network));
      if (!up) P(`${f.network}: spine present but no leaf-to-spine uplink cable`);
      if ((f.spineCount || 0) < 2) P(`${f.network}: spine count ${f.spineCount} < 2`);
    }
    // dual-fabric ToR pair (no spine) needs a redundancy interconnect (mclag/vlt) unless AI
    if (f.fabricsN === 2 && !f.spine && f.workload !== 'ai' && !f.interconnectQty && f.redundancyMethod !== 'independent-ab') P(`${f.network}: dual ToR pair without a peer-link interconnect (and not declared independent A/B)`);
    // NVIDIA AI fabric => NVIDIA optics; Dell/general => never NVIDIA optics
    if (f.workload === 'ai' && f.stack === 'nvidia' && gb(f.speed) >= 400) {
      const nvHost = res.bom.some(b => b.category === 'Cable/Optic' && b.vendor === 'NVIDIA' && (b.note || '').includes(f.network));
      if (!nvHost) P(`${f.network}: NVIDIA AI fabric not cabled with NVIDIA LinkX`);
    }
    // AI must be non-blocking
    if (f.workload === 'ai' && f.nonBlockingReq && !f.nonBlocking) P(`${f.network}: AI fabric NOT non-blocking (oversub ${f.oversub})`);
  });
  // 2. mgmt: if includeMgmt, OOB switch + cat6 present
  const mg = res.fabrics.find(f => f.network === 'mgmt');
  if (mg) {
    if (!res.bom.some(b => b.category === 'Management')) P('mgmt fabric present but no Management switch line');
    if (!res.bom.some(b => b.category === 'Cable/Optic' && /OOB/.test(b.note || ''))) P('mgmt: no OOB cabling line');
  }
  // 3. no bad qty / missing item
  res.bom.forEach(b => { if (typeof b.qty === 'number' && b.qty <= 0) P(`qty ≤ 0: ${b.item || b.model}`); if (!b.item && !b.model) P('BOM line missing item/model'); });
  // 4. every Switch/Mgmt model exists
  res.bom.filter(b => b.category === 'Switch' || b.category === 'Management').forEach(b => { if (!known.has(b.model)) P(`unknown switch model ${b.model}`); });
  // 5. must have at least one switch and one cable
  if (!res.bom.some(b => b.category === 'Switch')) P('no switches in BOM');
  if (!res.bom.some(b => b.category === 'Cable/Optic')) P('no cables/optics in BOM');
  // 6. GLOBAL host-cable invariant: Σ (host-to-leaf qty × linksPerAssembly) == Σ data-fabric links.
  // R12 (2026-07-16d): a 1:2 splitter/breakout assembly covers TWO links per ordered part, so the
  // sum multiplies by the line's own declared linksPerAssembly (absent ⇒ 1, an ordinary cable).
  // Reading the line's field — rather than assuming 1 — is what keeps this invariant and the note
  // arithmetic derived from the same number.
  const hostQtyAll = res.bom.filter(b => b.category === 'Cable/Optic' && /Host-to-leaf/i.test(b.note || ''))
    .reduce((s, b) => s + b.qty * (b.linksPerAssembly || 1), 0);
  const linksAll = data.reduce((s, f) => s + (f.totalLinks || 0), 0);
  if (hostQtyAll !== linksAll) P(`total host cables (links covered) ${hostQtyAll} ≠ total data links ${linksAll}`);
}

let n = 0;
function run(name, input) { n++; try { audit(name, window.recommend(input)); } catch (e) { problems.push(`[${name}] THREW: ${e.message}`); } }

/* ---- every platform (all guides funnel here) × redundancy × scale ---- */
C.platforms.forEach(p => {
  const stack = p.workload === 'ai' ? 'nvidia' : undefined;
  [['dual', 3], ['dual', 8], ['single', 4], ['dual', 40]].forEach(([red, u]) => {
    run(`${p.id}/${red}/${u}`, { platformId: p.id, units: u, redundancy: red, includeMgmt: true, gpusPerServer: 8, stack, trafficProfile: 'balanced' });
  });
  // model drill-down: every model
  (p.models || []).forEach(m => run(`${p.id}:${m.id}`, { targets: [{ platformId: p.id, modelId: m.id, units: 8, gpusPerServer: 8 }], redundancy: 'dual', includeMgmt: true, stack }));
});

/* ---- AI both stacks + both GPU speeds + placements + traffic ---- */
['nvidia', 'dell'].forEach(st => ['in-rack', 'adjacent', 'structured'].forEach(pl =>
  run(`ai/${st}/${pl}`, { platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: st, redundancy: 'dual', includeMgmt: true, placement: pl })));
['ns', 'balanced', 'ew'].forEach(tp => run(`ew-general/${tp}`, { platformId: 'poweredge-general', units: 60, redundancy: 'dual', includeMgmt: true, trafficProfile: tp }));

/* ---- combined targets (storage + servers, storage + AI) ---- */
run('combo/store+srv', { targets: [{ platformId: 'powerstore', units: 6 }, { platformId: 'poweredge-general', units: 20 }], redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
run('combo/scale+ai', { targets: [{ platformId: 'powerscale', units: 6 }, { platformId: 'poweredge-ai', modelId: 'xe9780', units: 8, gpusPerServer: 8 }], stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
run('combo/nic+core', { targets: [{ platformId: 'powerstore', units: 8 }, { platformId: 'poweredge-general', units: 30 }], redundancy: 'dual', includeMgmt: true, nic: { vendor: 'broadcom', speed: '25GbE', portsPerNic: 2, nicsPerUnit: 2 }, includeCoreUplink: true, coreSpeed: '100GbE', breakout: 'on' });

/* ---- reference architectures ---- */
(C.referenceArchitectures || []).forEach(ra => { n++; try { audit(`RA:${ra.id}`, window.recommendRA(ra.id, ra.maxGpuNodes)); } catch (e) { problems.push(`[RA:${ra.id}] THREW: ${e.message}`); } });

/* ---- edge / access flow (every PoE / speed / redundancy / distribution combo) ---- */
['poe+', 'poe++', 'none'].forEach(poe => ['1g', 'mgig', 'fiber'].forEach(sp => ['vlt-pair', 'single'].forEach(rd => ['new', 'existing'].forEach(dist => {
  const name = `edge/${poe}/${sp}/${rd}/${dist}`; n++;
  try {
    const res = window.recommendEdge({ endpoints: 192, poe, accessSpeed: sp, edgeRedundancy: rd, distribution: dist, nos: 'os10', includeMgmt: true });
    audit(name, res);
    const acc = res.fabrics[0];
    if (!/E32/.test(acc.leaf.model)) problems.push(`[${name}] access leaf not E-series: ${acc.leaf.model}`);
    if (acc.totalLeaves !== Math.ceil(192 / acc.leaf.access.count)) problems.push(`[${name}] access count ${acc.totalLeaves} wrong for 192 endpoints`);
    if (rd === 'vlt-pair' && dist === 'new' && !res.bom.some(b => /VLTi|ICL/.test(b.item || ''))) problems.push(`[${name}] redundant edge missing VLTi/ICL peer-link`);
    if (rd === 'vlt-pair' && acc.uplinksPerLeaf !== 2) problems.push(`[${name}] dual-homed edge should have 2 uplinks/access-switch`);
  } catch (e) { problems.push(`[${name}] THREW: ${e.message}`); }
}))));

/* ---- network refresh (like-for-like ladder) ---- */
[['25g',8],['10g-t',4],['100g',6]].forEach(([sp,n])=>{const name=`refresh/${sp}/${n}`;global.__n=(global.__n||0)+1;try{const r=window.recommendRefresh({swCount:n,portsPer:48,targetSpeed:sp,topologyNow:'3tier',distribution:'new',includeMgmt:true});audit(name,r);if(r.context.edge.accessSwitches%2!==0)problems.push(`[${name}] refresh count not paired`);if(!r.warnings.some(w=>/rack-by-rack/.test(w.message)))problems.push(`[${name}] no migration guidance`);}catch(e){problems.push(`[${name}] THREW: ${e.message}`)}});

/* ---- inter-network connectivity (all types × L2/L3) ---- */
['core', 'fabric', 'dci'].forEach(ct => ['l3', 'l2'].forEach(ly => {
  const name = `internet/${ct}/${ly}`; n++;
  try {
    const res = window.recommend({ targets: [{ platformId: 'powerstore', units: 6 }, { platformId: 'poweredge-general', units: 20 }], redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreType: ct, coreLayer: ly, coreSpeed: '100GbE', coreProtocol: 'bgp' });
    audit(name, res);
    if (!res.coreUplink || res.coreUplink.type !== ct || res.coreUplink.layer !== ly) problems.push(`[${name}] coreUplink type/layer not captured`);
    if (!res.bom.some(b => /inter-network/i.test(b.note || ''))) problems.push(`[${name}] no inter-network uplink optic line`);
  } catch (e) { problems.push(`[${name}] THREW: ${e.message}`); }
}));

console.log(`Audited ${n} scenarios across all guide paths.`);
if (!problems.length) console.log('✓ NO BOM-ACCURACY PROBLEMS FOUND');
else { console.log(`✗ ${problems.length} problem(s):`); problems.slice(0, 40).forEach(p => console.log('  ' + p)); }
process.exit(problems.length ? 1 : 0);
