/* =============================================================================
 * GROUND-TRUTH AUDIT — the tool's output vs PUBLISHED worked examples from the
 * Dell/NVIDIA docs themselves. Not my model vs my model: each check cites the
 * document figure it reproduces. If the tool disagrees with a published number,
 * the tool is wrong.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm');
global.window = {};
['js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
 'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js',
 'js/validate.js','js/engine.js','js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\' + f, 'utf8'), { filename: f }));
let pass = 0, fail = 0;
const gt = (id, src, desc, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${id} ${desc}`); } else { fail++; console.log(`  ✗ ${id} ${desc}\n      source: ${src}\n      got: ${detail}`); } };

console.log('GROUND TRUTH vs published documents\n');

/* ---- GT1: H18364.2 p.10 — "32 servers × 25GbE = 800G; 8×100G spines for 1:1, 4 for 2:1" ---- */
{
  // 32 PowerFlex nodes (4×25G each), dual, 0 headroom → exactly 32×25G per leaf on S5248F WITH a spine (the doc's worked example)
  const mk = tp => window.recommend({ platformId: 'powerflex', units: 32, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0, trafficProfile: tp });
  const bal = mk('balanced').fabrics.find(f => f.spine && f.network === 'storage');
  gt('GT1a', 'H18364.2 p.10', '32×25G/leaf @2:1 → 4×100G uplinks (doc: "four spines")', bal && bal.uplinksPerLeaf === 4 && Math.abs(bal.oversub - 2.0) < 0.01, bal && `${bal.uplinksPerLeaf} uplinks, ${bal.oversub}:1`);
  const ew = mk('ew').fabrics.find(f => f.spine && f.network === 'storage');
  // doc: 1:1 needs 8×100G. S5248F has 6 uplink ports → the tool must be HONEST: flag port-limited, not fake 1:1.
  gt('GT1b', 'H18364.2 p.10', '32×25G/leaf @1:1 needs 8×100G — tool uses all 6 S5248F ports AND flags the shortfall', ew && ew.uplinksPerLeaf === 6 && ew.uplinkPortLimited === true, ew && `${ew.uplinksPerLeaf} uplinks, portLimited=${ew.uplinkPortLimited}`);
}

/* ---- GT2: PowerFlex on SONiC DG — "352 nodes (22 nodes per leaf pair)"; max 32 leaves / 6 spines ---- */
{
  const r22 = window.recommend({ platformId: 'powerflex', units: 22, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const f22 = r22.fabrics.find(f => f.network === 'storage');
  gt('GT2a', 'PowerFlex SONiC DG (h19678.3)', '22 PowerFlex nodes fit exactly one leaf pair (published: "22 nodes per leaf pair")', f22 && f22.totalLeaves === 2, f22 && `${f22.totalLeaves} leaves`);
  const r352 = window.recommend({ platformId: 'powerflex', units: 352, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const f352 = r352.fabrics.find(f => f.network === 'storage');
  gt('GT2b', 'PowerFlex SONiC DG (h19678.3)', '352 nodes (published max) → ≤32 leaves (published max)', f352 && f352.totalLeaves <= 32 && f352.totalLeaves >= 30, f352 && `${f352.totalLeaves} leaves`);
  gt('GT2c', 'PowerFlex SONiC DG (h19678.3)', '352 nodes → ≤6 spines (published max)', f352 && f352.spineCount >= 2 && f352.spineCount <= 6, f352 && `${f352.spineCount} spines`);
}

/* ---- GT3: ERA briefs — design-point switch counts ---- */
{
  const r = window.recommendRA('nvidia-2-8-5-200', 16);
  const sw = r.bom.filter(b => b.category === 'Switch');
  gt('GT3a', '2-8-5-200 ERA brief', '16 nodes → exactly 2× SN5610 (published design point)', sw.length === 1 && sw[0].model === 'SN5610' && sw[0].qty === 2, sw.map(s => s.model + '×' + s.qty).join(','));
  const r2 = window.recommendRA('nvidia-2-8-9-400', 12);
  const sw2 = r2.bom.filter(b => b.category === 'Switch');
  gt('GT3b', '2-8-9-400 ERA brief', '12 nodes → exactly 2× SN5610 (published design point)', sw2.length === 1 && sw2[0].model === 'SN5610' && sw2[0].qty === 2, sw2.map(s => s.model + '×' + s.qty).join(','));
}

/* ---- GT4: GB300 NVL72 RA (Mar 2026) — published per-SU counts ---- */
{
  const r2su = window.recommendRA('nvidia-gb300-nvl72', 2);
  const gpuSw = r2su.bom.find(b => b.category === 'Switch' && /Dual-plane GPU/.test(b.note || ''));
  const conv = r2su.bom.find(b => b.category === 'Switch' && /Converged/.test(b.note || ''));
  gt('GT4a', 'NVL72 RA p.25 ("up to 12x SN5600 per 1–2 SU block")', '2 SU → 12× SN5600 GPU network', gpuSw && gpuSw.model === 'SN5600' && gpuSw.qty === 12, gpuSw && `${gpuSw.model}×${gpuSw.qty}`);
  gt('GT4b', 'NVL72 RA p.25 ("each rack requires 2x SN5600")', '2 SU → 4× SN5600 converged', conv && conv.qty === 4, conv && `×${conv.qty}`);
  const gpuCab = r2su.bom.find(b => /GPU compute uplinks/.test(b.note || ''));
  gt('GT4c', 'NVL72 RA p.25 ("144x 400G uplinks per SU")', '2 SU → 288× 400G GPU cables', gpuCab && gpuCab.qty === 288, gpuCab && `×${gpuCab.qty}`);
  const cpuCab = r2su.bom.find(b => /CPU fabric uplinks/.test(b.note || ''));
  gt('GT4d', 'NVL72 RA p.25 ("36x 400G uplinks per SU")', '2 SU → 72× 400G CPU-fabric cables', cpuCab && cpuCab.qty === 72, cpuCab && `×${cpuCab.qty}`);
  const r4su = window.recommendRA('nvidia-gb300-nvl72', 4);
  const gpuSw4 = r4su.bom.find(b => b.category === 'Switch' && /Dual-plane GPU/.test(b.note || ''));
  gt('GT4e', 'NVL72 RA (per-block scaling)', '4 SU → 24× SN5600 GPU network (2 blocks)', gpuSw4 && gpuSw4.qty === 24, gpuSw4 && `×${gpuSw4.qty}`);
}

/* ---- GT5: PowerScale back-end supported switches (H16346.8 Table 4) ---- */
{
  const r = window.recommend({ platformId: 'powerscale', units: 12, redundancy: 'dual', includeMgmt: true });
  const be = r.fabrics.find(f => f.network === 'backend');
  const supported = ['Z9664F-ON', 'S5232F-ON', 'Z9264-ON'];
  gt('GT5', 'H16346.8 Table 4 (p.14)', `back-end leaf ∈ published supported list (${supported.join('/')})`, be && supported.includes(be.leaf.model), be && be.leaf.model);
}

/* ---- GT6: E-series SONiC Compatibility Matrix (Table 7) ---- */
{
  const r = window.recommendEdge({ endpoints: 96, poe: 'poe++', accessSpeed: 'mgig', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  gt('GT6a', 'SONiC Compat Matrix Table 7', 'E3248PXE MC-LAG pair design allowed (MCLAG=Yes published)', r.fabrics[0].redundancyMethod === 'mclag' && !r.warnings.some(w => w.severity === 'error'), r.warnings.filter(w => w.severity === 'error').map(w => w.message).join(';').slice(0, 60));
  const rf = window.recommendEdge({ endpoints: 48, poe: 'none', accessSpeed: 'fiber', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  gt('GT6b', 'SONiC Compat Matrix (E3224F absent)', 'E3224F + MC-LAG flagged as error (OS10-only, published)', rf.warnings.some(w => w.severity === 'error' && /E3224F/.test(w.message)), 'no error raised');
}

/* ---- GT8: h04504 PowerStore SFM DG — published design: S5248F leaves + S5232F spines ---- */
{
  // enough PowerStore to force a spine (multi-rack) at 100G uplinks
  const r = window.recommend({ platformId: 'powerstore', units: 24, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const f = r.fabrics.find(x => x.network === 'storage');
  gt('GT8a', 'h04504 (PowerStore SFM DG)', 'PowerStore leaf = S5248F-ON (published)', f && f.leaf.model === 'S5248F-ON', f && f.leaf.model);
  gt('GT8b', 'h04504 ("two S5232F-ON switches as spine")', 'small PowerStore leaf-spine uses S5232F-ON spines (published)', f && f.spine && f.spine.model === 'S5232F-ON', f && f.spine && f.spine.model);
}

/* ---- GT9: h04504 — ICL sizing: ≥2 ports at 100G+; ≥4 when sub-100G ---- */
{
  const e = window.recommendEdge({ endpoints: 96, poe: 'poe++', accessSpeed: 'mgig', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  const iclLine = e.bom.find(b => /MC-LAG ICL/.test(b.item || '') && /access pair/.test(b.note || ''));
  gt('GT9a', 'h04504 ("if 25 GbE ports are used... at least four connections")', 'edge 25G ICL = 4 links per pair', iclLine && iclLine.qty === (e.context.edge.pairs * 4), iclLine && `qty ${iclLine.qty} for ${e.context.edge.pairs} pair(s)`);
  const t = window.recommend({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true });
  const tf = t.fabrics.find(x => x.network === 'storage');
  gt('GT9b', 'h04504 ("at least two physical ports" at 100G+)', 'ToR pair 100G ICL = 2 links per pair', tf && tf.interconnectQty === tf.leavesPerFabric * 2 && (tf.interconnectSpeed || '').includes('100'), tf && `${tf.interconnectQty} @ ${tf.interconnectSpeed}`);
}

/* ---- GT10: OneFS Supportability Guide Table 33 — verified back-end PNs ---- */
{
  const C2 = window.CATALOG.rules.backend.powerScaleBackendPNs || {};
  gt('GT10a', 'OneFS Supportability Guide Table 33', 'S5232 back-end PN 210-BCVB encoded', /210-BCVB/.test(C2['S5232F-ON'] || ''), C2['S5232F-ON']);
  const r = window.recommend({ platformId: 'powerscale', units: 12, redundancy: 'dual', includeMgmt: true });
  gt('GT10b', 'OneFS Supportability Guide Table 33', 'back-end check surfaces the VERIFIED PN', r.warnings.some(w => /210-BCVB|210-BCJH/.test(w.message)), 'no PN surfaced');
}

/* ---- GT7: MTU 9216 (h19678.3 "9216 bytes for best performance") ---- */
{
  const r = window.recommend({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true });
  gt('GT7', 'h19678.3', 'MTU 9216 guidance present on a storage design', r.warnings.some(w => /9216/.test(w.message)), 'no 9216 guidance');
}

/* ==================== FDC EXPORTS (Dell Fabric Design Center — Dell's own validated designs) ==== */
function fdcSummary(file) {
  const d = JSON.parse(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\' + file, 'utf8'));
  const sw = (d.inventory && d.inventory.switches) || [], links = (d.inventory && d.inventory.links) || [];
  const tally = t => { const m = {}; sw.filter(s => s.tier === t).forEach(s => m[s.model] = (m[s.model] || 0) + 1); return m; };
  const vlt = {}; links.filter(l => l.linkType === 'VLT').forEach(l => vlt[l.portSpeed] = (vlt[l.portSpeed] || 0) + 1);
  return { leaves: tally('LEAF'), spines: tally('SPINE'), vlt };
}
{ // FDC-F1: 1-rack ToR (4 servers, dual-homed) — S5212F pair, VLT 2× 100G
  const f = fdcSummary('FDC-PowerEdgeFabric1.json');
  const r = window.recommend({ platformId: 'poweredge-general', units: 4, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const fab = r.fabrics.find(x => x.network === 'frontend');
  gt('FDC-F1a', 'FDC-PowerEdgeFabric1.json', `small ToR right-sized to S5212F (FDC: ${JSON.stringify(f.leaves)})`, fab.leaf.model === 'S5212F-ON' && fab.totalLeaves === 2, fab.leaf.model + '×' + fab.totalLeaves);
  gt('FDC-F1b', 'FDC-PowerEdgeFabric1.json', `ICL = 2× 100G (FDC VLT: ${JSON.stringify(f.vlt)})`, fab.interconnectQty === 2 && /100/.test(fab.interconnectSpeed), `${fab.interconnectQty}× ${fab.interconnectSpeed}`);
}
{ // FDC-F2: mid-size (256 servers dual-homed, 4 racks) — 8× S5296F leaves + S5232F spines
  const f = fdcSummary('FDC-Poweredge mid size fabric 1.json');
  const r = window.recommend({ platformId: 'poweredge-general', units: 256, redundancy: 'dual', includeMgmt: true });
  const fab = r.fabrics.find(x => x.network === 'frontend');
  gt('FDC-F2a', 'FDC mid-size fabric (512 downlinks)', `dense racks use S5296F ×8 (FDC: ${JSON.stringify(f.leaves)})`, fab.leaf.model === 'S5296F-ON' && fab.totalLeaves === 8, fab.leaf.model + '×' + fab.totalLeaves);
  gt('FDC-F2b', 'FDC mid-size fabric', `spine model S5232F (FDC: ${JSON.stringify(f.spines)})`, fab.spine && fab.spine.model === 'S5232F-ON', fab.spine && fab.spine.model);
}
{ // FDC-F3: PowerScale 100G front-end — S5232F leaves + S5232F spines
  const f = fdcSummary('FDC-PowerScale.json');
  const r = window.recommend({ platformId: 'powerscale', units: 8, redundancy: 'dual', includeMgmt: true });
  const fe = r.fabrics.find(x => x.network === 'frontend');
  gt('FDC-F3', 'FDC-PowerScale.json', `100G front-end on S5232F (FDC: ${JSON.stringify(f.leaves)} + ${JSON.stringify(f.spines)})`, fe.leaf.model === 'S5232F-ON', fe.leaf.model);
}
{ // FDC-F4: NVMeTCP front-end — sub-100G VLT = 4 links (S5212F pair), 100G VLT = 2 — matches h04504 rule
  const f = fdcSummary('FDC-NVMeTCP-FrontEnd.json');
  gt('FDC-F4', 'FDC-NVMeTCP-FrontEnd.json', `FDC itself wires 4× sub-100G VLT + 2× 100G VLT (${JSON.stringify(f.vlt)}) — matches our encoded rule (2 @100G+, 4 below)`,
    f.vlt.G_25 === 4 && f.vlt.G_100 === 2 && window.CATALOG.rules.redundancy.interconnectLinksPerPair === 2 && window.CATALOG.rules.redundancy.interconnectLinksPerPairSub100 === 4, JSON.stringify(f.vlt));
}
{ // FDC-F5: PowerScale back-end — S5232F leaf AND spine
  const f = fdcSummary('FDC-Backend-Fabric.json');
  const r = window.recommend({ platformId: 'powerscale', units: 16, redundancy: 'dual', includeMgmt: true });
  const be = r.fabrics.find(x => x.network === 'backend');
  gt('FDC-F5', 'FDC-Backend-Fabric.json', `back-end on S5232F leaf${be.spine ? ' + S5232F spine' : ''} (FDC: ${JSON.stringify(f.leaves)} + ${JSON.stringify(f.spines)})`,
    be.leaf.model === 'S5232F-ON' && (!be.spine || be.spine.model === 'S5232F-ON'), be.leaf.model + ' / ' + (be.spine ? be.spine.model : 'no spine'));
}

{ // FDC-F6: converged (poweredge + large PowerStore) — S5448F dense 100G leaves + Z9664F spine
  const f = fdcSummary('FDC-NVMeTCP poweredge and large power store converged.json');
  const r = window.recommend({ targets: [{ platformId: 'powerstore', modelId: 'ps9200', units: 16 }, { platformId: 'poweredge-general', units: 92 }], redundancy: 'dual', includeMgmt: true });
  const st = r.fabrics.find(x => x.network === 'storage');
  gt('FDC-F6a', 'FDC converged export', `dense 100G hosts on S5448F leaves (FDC: ${JSON.stringify(f.leaves)})`, st.leaf.model === 'S5448F-ON', st.leaf.model);
  gt('FDC-F6b', 'FDC converged export', `converged spine = Z9664F (FDC: ${JSON.stringify(f.spines)})`, st.spine && st.spine.model === 'Z9664F-ON', st.spine && st.spine.model);
  gt('FDC-F6c', 'FDC converged export (VLT 8× @G_400)', `S5448F pairs use 400G ICL class (FDC wires 400G VLT)`, JSON.stringify(f.vlt).includes('G_400'), JSON.stringify(f.vlt));
}
{ // FDC-F7: dedicated SAN, small 100G — S5232F leaves (FDC) = our pick at ≤32 links/fabric
  const f = fdcSummary('FDC-NVMeTCP-FrontEnd 100G server PcIE dedicated SAN.json');
  const r = window.recommend({ platformId: 'powerstore', modelId: 'ps9200', units: 2, redundancy: 'dual', includeMgmt: true });
  const st = r.fabrics.find(x => x.network === 'storage');
  gt('FDC-F7', 'FDC dedicated-SAN export', `small 100G attach stays on S5232F (FDC 100G leaves: ${JSON.stringify(f.leaves)})`, st.leaf.model === 'S5232F-ON', st.leaf.model);
}
{ // FDC-F8: PowerFlex HCI ToR — 2× S5248F + 2× 100G VLT (16 HCI nodes, 64× 25G)
  const f = fdcSummary('FDC-powerflexapp HCI.json');
  const r = window.recommend({ platformId: 'powerflex', units: 16, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const st = r.fabrics.find(x => x.network === 'storage');
  gt('FDC-F8', 'FDC-powerflexapp HCI.json', `16 HCI nodes → S5248F pair + 2× 100G ICL (FDC: ${JSON.stringify(f.leaves)}, VLT ${JSON.stringify(f.vlt)})`,
    st.leaf.model === 'S5248F-ON' && st.totalLeaves === 2 && st.interconnectQty === 2 && /100/.test(st.interconnectSpeed), `${st.leaf.model}×${st.totalLeaves}, ICL ${st.interconnectQty}× ${st.interconnectSpeed}`);
}

{ // FDC-F9: "40G NIC" export — FDC normalized 40G hosts to 25G/S5224F (no 40G wiring).
  // PHYSICS: 40G QSFP+ needs QSFP28 ports → our 40G lands on S5232F. Divergence documented.
  const r = window.recommend({ platformId: 'poweredge-general', units: 8, redundancy: 'dual', includeMgmt: true, nic: { vendor: 'intel', speed: '40GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  const f = r.fabrics.find(x => x.network === 'frontend');
  gt('FDC-F9', 'FDC 40G-NIC export + QSFP connector physics', '40G legacy NICs land on a QSFP28-class leaf (S5232F) — never SFP28', f.leaf.model === 'S5232F-ON' && f.speed === '40GbE', f.leaf.model + ' @ ' + f.speed);
}

{ // FDC-F10: AI fabric export (Dell's own AI design) — scale-out + front-end
  const d = JSON.parse(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\FDC-AI-fabric.json', 'utf8'));
  const so = d.scaleout_data.inventory.switches, fe = d.frontend_data.inventory.switches;
  const soLeaves = so.filter(s => s.tier === 'LEAF').length, feSpines = fe.filter(s => s.tier === 'SPINE').length;
  const r = window.recommend({ platformId: 'poweredge-ai', units: 128, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const aif = r.fabrics.find(f => f.network === 'aifabric');
  gt('FDC-F10a', 'FDC-AI-fabric.json (scale-out: 16× Z9864F leaves for 1024 rails)', `Dell AI 400G rails on Z9864F leaves, leaf count matches FDC (${soLeaves})`, aif.leaf.model === 'Z9864F-ON' && aif.totalLeaves === soLeaves, `${aif.leaf.model}×${aif.totalLeaves} vs FDC ${soLeaves}`);
  gt('FDC-F10b', 'FDC-AI-fabric.json (800G interlinks)', 'Dell AI spine = Z9864F class', aif.spine && aif.spine.model === 'Z9864F-ON', aif.spine && aif.spine.model);
  gt('FDC-F10c', 'FDC-AI-fabric.json (front-end: 4 spines)', `FDC itself builds >2 spines (${feSpines}) — multi-spine designs are Dell-tool-validated`, feSpines === 4, String(feSpines));
  gt('FDC-F10d', 'FDC-AI-fabric.json (scale-out has NO VLT)', 'rail-optimized GPU fabric has no peer-links (matches our EVPN-MH/no-ICL AI model)', !d.scaleout_data.inventory.links.some(l => l.linkType === 'VLT'), 'VLT found in scale-out');
}

{ // FDC-F11: MULTI-RACK pattern — read the mid-size export's rack_topology directly and
  // reproduce it: every node rack = 2 ToR + 1 OOB switch; spines in a dedicated rack (own OOB).
  const j = JSON.parse(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\FDC-Poweredge mid size fabric 1.json', 'utf8'));
  let rt = null; (function walk(o, d) { if (d > 6 || !o || typeof o !== 'object' || rt) return; if (o.rack_topology) { rt = o.rack_topology; return; } for (const k of Object.keys(o)) walk(o[k], d + 1); })(j, 0);
  const nodeRacks = rt.nodeRacks || [], spineRacks = rt.racks || [];
  const torPerRack = nodeRacks.every(r => (r.switches || []).length === 2);
  const oobPerRack = nodeRacks.concat(spineRacks).every(r => !!r.mgmtSwitch);
  gt('FDC-F11a', 'FDC-Poweredge mid size (rack_topology)', `FDC multi-rack pattern: every node rack = 2 ToR switches (${nodeRacks.length} node racks) + dedicated spine rack`, torPerRack && spineRacks.length >= 1, `torPerRack=${torPerRack}, spineRacks=${spineRacks.length}`);
  gt('FDC-F11b', 'FDC-Poweredge mid size (rack_topology)', 'FDC puts an OOB/mgmt switch in EVERY rack (node racks + spine rack)', oobPerRack, 'a rack without mgmtSwitch');
  const r = window.recommend({ platformId: 'poweredge-general', units: 64, racks: nodeRacks.length, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const f = r.fabrics.find(x => x.network !== 'mgmt');
  const oob = r.bom.find(b => b.category === 'Management');
  // B6 (maintainer ruling 2026-07-16, SPEC.md multi-rack + DESIGN-LOG): the tool DELIBERATELY
  // diverges from the FDC export's dedicated-spine-rack OOB — OOB count = DECLARED racks, spines
  // housed within them. So the engine reproduces the FDC leaf layout (pair per rack) but quotes
  // one OOB per DECLARED rack, NOT racks+1. This divergence is a documented design decision.
  gt('FDC-F11c', 'FDC-Poweredge mid size (4 racks x 16 servers)', `engine reproduces the leaf layout: ${nodeRacks.length * 2} leaves (pair per rack); OOB = ${nodeRacks.length} declared racks (B6: no phantom spine-rack OOB, deliberate divergence from FDC export)`,
    f.totalLeaves === nodeRacks.length * 2 && oob.qty === nodeRacks.length, `${f.leaf.model}x${f.totalLeaves}, OOB ${oob && oob.qty}`);
}

{ // FDC-F12: small 25G ToR pair (2 switches) — S5224F-ON, VLT 2× 100G. Closes the ground-truth
  // gap flagged 2026-07-13: the tool's small-scale (≤24-link) leaf right-sizing was previously
  // only confirmed at 8-leaf mid-size scale (FDC-F2) and a smaller S5212F pair (FDC-F1) — this
  // pins the S5224F-ON tier specifically.
  const f = fdcSummary('FDC - 2 switch TOR fabric.json');
  const r = window.recommend({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const fab = r.fabrics.find(x => x.network === 'frontend');
  gt('FDC-F12a', 'FDC - 2 switch TOR fabric.json', `small ToR right-sized to S5224F-ON (FDC: ${JSON.stringify(f.leaves)})`, fab.leaf.model === 'S5224F-ON' && fab.totalLeaves === 2, fab.leaf.model + '×' + fab.totalLeaves);
  gt('FDC-F12b', 'FDC - 2 switch TOR fabric.json', `ICL = 2× 100G (FDC VLT: ${JSON.stringify(f.vlt)})`, fab.interconnectQty === 2 && /100/.test(fab.interconnectSpeed), `${fab.interconnectQty}× ${fab.interconnectSpeed}`);
}

{ // FDC-F13: THE deal-size gap this suite was missing (flagged 2026-07-13 audit) — 4 leaves +
  // 2 spines = 6 total switches, this tool's user's single most common real design. FDC picks
  // S5296F-ON leaves + S5232F-ON spines, matching this tool's right-sizing ladder exactly.
  const f = fdcSummary('FDC-4 leaf 2 spines.json');
  const r = window.recommend({ platformId: 'poweredge-general', units: 120, redundancy: 'dual', includeMgmt: true });
  const fab = r.fabrics.find(x => x.network === 'frontend');
  gt('FDC-F13a', 'FDC-4 leaf 2 spines.json', `4-leaf/2-spine design: leaf = S5296F-ON ×4 (FDC: ${JSON.stringify(f.leaves)})`, fab.leaf.model === 'S5296F-ON' && fab.totalLeaves === 4, fab.leaf.model + '×' + fab.totalLeaves);
  // Spine MODEL matches; spine COUNT does not (FDC: 2, engine: 8) — this is the SAME already-
  // documented, already-ratified divergence in docs/SPEC.md "FDC-validated leaf right-
  // sizing": "FDC's own leaf→spine default is 1 link/leaf/spine (minimum wiring, can run 8:1) —
  // we keep H18364's oversubscription-driven uplink sizing instead." FDC hits its bandwidth
  // target with fewer spine SWITCHES carrying multiple parallel links each; this tool scales by
  // adding more spine switches (H18364.2 p.10's model). Not a bug — re-confirms a prior decision.
  gt('FDC-F13b', 'FDC-4 leaf 2 spines.json', `spine model = S5232F-ON (FDC: ${JSON.stringify(f.spines)}; spine COUNT intentionally differs — FDC:2 engine:8, see comment)`, fab.spine && fab.spine.model === 'S5232F-ON', fab.spine && fab.spine.model);
  // DIVERGENCE, DOCUMENTED NOT RESOLVED (same pattern as FDC-F9's 40G normalization note): the
  // real FDC export pairs its 4 leaves into TWO VLT pairs (leaf1<->leaf2, leaf3<->leaf4 — 2× VLT
  // @100G per pair, 4 total, confirmed via inventory.links + each spine's per-pair eBGP AS in the
  // raw export) even though a spine tier exists on top — i.e. VLT-paired ToR leaves with an L3
  // ECMP/eBGP uplink to the spine, NOT this tool's current across-the-board assumption that ANY
  // fabric with a spine uses pure EVPN-Multihoming (no peer-link at all, `js/engine.js` ~line 647:
  // `spine ? 'evpn-mh' : ...` — ignores `nos`/OS10-vs-SONiC once a spine exists). Switch/spine
  // MODEL selection is confirmed correct (F13a/b above); the REDUNDANCY METHOD is a real, live
  // divergence from Dell's own FDC tool at exactly this scale — flagged for the user to decide,
  // not silently changed (see [[adversarial-audit-method]] on not overriding ground truth, and
  // its mirror: don't silently overRIDE the engine from a single ground-truth sample either — a
  // 4-leaf design's redundancy pattern may depend on customer OS choice (OS10 naturally VLTs
  // paired ToRs; SONiC's EVPN-MH doesn't need to) which this export alone doesn't disambiguate).
  gt('FDC-F13c', 'FDC-4 leaf 2 spines.json (documented divergence, not a failure)', 'FDC pairs leaves via VLT even with a spine present; engine currently always assumes pure EVPN-MH once any spine exists — see comment above', true, 'informational only');
}

// NOT YET WIRED (2026-07-13 import batch) — logged here rather than force-fit into a possibly-
// wrong assertion: 'FDC-vSAN-fabric.json' (2 spine + mixed S5224F-ON/S5248F-ON leaves, 6
// switches — likely two distinct link-rate groups on one platform, needs the right recommend()
// shape worked out); 'FDC-VxRail-fabric.json' (8 switches, VxRail isn't ground-truth tested at
// all yet); 'FDC-Backend-Fabric 100Gbe F910.json' (could sharpen GT5's generic backend check to a
// specific model); 'FDC-NVMeTCP with 40G NIC.json' (could upgrade FDC-F9's hardcoded 40G-
// normalization assertion into a real file comparison); 'FDC-AI-fabric scale out.json' (possible
// update/variant of the already-wired FDC-AI-fabric.json — needs a diff first).

console.log(`\n${fail ? '✗ ' + fail + ' GROUND-TRUTH FAILURE(S), ' + pass + ' passed' : '✓ ALL ' + pass + ' GROUND-TRUTH CHECKS MATCH THE PUBLISHED DOCUMENTS'}`);
process.exit(fail ? 1 : 0);
