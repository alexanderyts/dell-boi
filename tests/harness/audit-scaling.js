/* =============================================================================
 * SCALING AUDIT — as unit / node counts grow, switches, cables, uplinks and
 * spines must scale monotonically; non-blocking must hold; oversubscription
 * must stay within target. Flags anything that stays fixed or regresses.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm');
global.window = {};
['js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
 'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js',
 'js/validate.js','js/engine.js','js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\' + f, 'utf8'), { filename: f }));
const C = window.CATALOG, R = C.rules;
let problems = [];
const P = (n, m) => problems.push(`[${n}] ${m}`);
const switches = res => res.bom.filter(b => b.category === 'Switch').reduce((s, b) => s + (typeof b.qty === 'number' ? b.qty : 0), 0);
// LINKS COVERED by the host lines (not part count): R12 (2026-07-16d) — a 1:2 splitter assembly
// carries two links per ordered part, so multiply by the line's own declared linksPerAssembly
// (absent ⇒ 1). Comparing raw part count to link count would flag every correct AI BOM.
const hostCables = res => res.bom.filter(b => b.category === 'Cable/Optic' && /Host-to-leaf/i.test(b.note || '')).reduce((s, b) => s + b.qty * (b.linksPerAssembly || 1), 0);
const dataLeaves = res => res.fabrics.filter(f => f.network !== 'mgmt').reduce((s, f) => s + (f.totalLeaves || 0), 0);

/* ---- 1. every platform: switch count & leaves grow with units, cables linear ---- */
C.platforms.forEach(p => {
  const stack = p.workload === 'ai' ? 'nvidia' : undefined;
  const counts = [2, 4, 8, 16, 32, 64, 128, 256];   // extended: right-sized S5296F absorbs ≤64u into one pair
  let prevSw = -1, prevLeaves = -1, grewSw = false, grewLeaves = false;
  counts.forEach(u => {
    const res = window.recommend({ platformId: p.id, units: u, redundancy: 'dual', includeMgmt: true, gpusPerServer: 8, stack, trafficProfile: 'balanced' });
    const sw = switches(res), lv = dataLeaves(res), hc = hostCables(res);
    // host cables must equal units × per-unit links summed across fabrics
    const expect = res.fabrics.filter(f => f.network !== 'mgmt').reduce((s, f) => s + (f.totalLinks || 0), 0);
    if (hc !== expect) P(`${p.id}@${u}`, `host cables ${hc} ≠ data links ${expect}`);
    if (sw < prevSw) P(`${p.id}`, `switch count REGRESSED ${prevSw}→${sw} at ${u} units`);
    if (lv < prevLeaves) P(`${p.id}`, `leaf count REGRESSED ${prevLeaves}→${lv} at ${u} units`);
    if (sw > prevSw && prevSw >= 0) grewSw = true;
    if (lv > prevLeaves && prevLeaves >= 0) grewLeaves = true;
    prevSw = sw; prevLeaves = lv;
    // non-blocking must hold for AI as it scales
    res.fabrics.filter(f => f.workload === 'ai').forEach(f => { if (f.nonBlockingReq && !f.nonBlocking) P(`${p.id}@${u}`, `AI ${f.network} lost non-blocking (oversub ${f.oversub})`); });
    // oversubscription must stay within target as it scales
    res.fabrics.forEach(f => { if (f.oversub != null && f.oversubTarget && f.oversub > f.oversubTarget + 0.01 && !f.uplinkPortLimited) P(`${p.id}@${u}`, `${f.network} oversub ${f.oversub} > target ${f.oversubTarget} (not port-limited)`); });
  });
  if (!grewLeaves) P(`${p.id}`, `leaf count NEVER grew across 2→64 units (not scaling)`);
});

/* ---- 2. edge: access switches grow with endpoints; pairs even ---- */
let prevE = -1, grewE = false;
[48, 96, 192, 384, 768].forEach(ep => {
  const res = window.recommendEdge({ endpoints: ep, poe: 'poe++', accessSpeed: 'mgig', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  const acc = res.fabrics[0].totalLeaves;
  if (acc < prevE) P('edge', `access switches REGRESSED ${prevE}→${acc} at ${ep} endpoints`);
  if (acc > prevE && prevE >= 0) grewE = true;
  if (acc % 2 !== 0) P('edge', `redundant access count ${acc} not even (MC-LAG pairs) at ${ep}`);
  if (acc !== Math.ceil(ep / 48 / 2) * 2) P('edge', `access count ${acc} wrong for ${ep} endpoints (48/sw, paired)`);
  prevE = acc;
});
if (!grewE) P('edge', 'access switch count never grew with endpoints');

/* ---- 3. reference architectures: match design point + scale (NVL72) ---- */
(C.referenceArchitectures || []).forEach(ra => {
  const atMax = window.recommendRA(ra.id, ra.maxGpuNodes);
  const aif = atMax.fabrics.find(f => f.network === 'aifabric');
  if (!aif.nonBlocking) P(`RA:${ra.id}`, `not non-blocking at max nodes`);
  if (aif.totalLeaves < 2) P(`RA:${ra.id}`, `< 2 leaf switches`);
  // scaling within range: fewer nodes => leaves non-increasing; more capped at max
  const half = Math.max(1, Math.floor(ra.maxGpuNodes / 2));
  const atHalf = window.recommendRA(ra.id, half);
  if (atHalf.fabrics.find(f => f.network === 'aifabric').totalLeaves > aif.totalLeaves) P(`RA:${ra.id}`, `half-scale has MORE leaves than max-scale`);
  // node count clamps at maxGpuNodes
  const over = window.recommendRA(ra.id, ra.maxGpuNodes * 4);
  if (over.context.units > ra.maxGpuNodes) P(`RA:${ra.id}`, `node count not clamped to maxGpuNodes`);
});

/* ---- 4. combined design scales both targets ---- */
[[6, 20], [12, 40], [24, 80]].forEach(([a, b]) => {
  const res = window.recommend({ targets: [{ platformId: 'powerstore', units: a }, { platformId: 'poweredge-general', units: b }], redundancy: 'dual', includeMgmt: true });
  const hc = hostCables(res), expect = res.fabrics.filter(f => f.network !== 'mgmt').reduce((s, f) => s + (f.totalLinks || 0), 0);
  if (hc !== expect) P('combo', `host cables ${hc} ≠ links ${expect} at ${a}+${b}`);
});

console.log('Scaling audit across all flows (platforms × 6 scales, edge, RAs, combined).');
if (!problems.length) console.log('✓ EVERYTHING SCALES CORRECTLY');
else { console.log(`✗ ${problems.length} scaling problem(s):`); [...new Set(problems)].slice(0, 40).forEach(p => console.log('  ' + p)); }
process.exit(problems.length ? 1 : 0);
