/* =============================================================================
 * TOPOLOGY RENDER AUDIT — parse the actual SVG (via data-role attributes) and
 * verify the PICTURE matches the engine data: every expected switch box drawn,
 * uplink lines from every drawn leaf to every drawn spine, ICL per drawn pair,
 * host strands, OOB drops, and "+N more" whenever capped.
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'e:\\vs code\\programs\\Dell Boi';
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { runScripts: 'outside-only' });
const win = dom.window; win.alert = () => {}; win.print = () => {};
['js/version.js','js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
 'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js',
 'js/validate.js','js/engine.js','js/design.js','js/ui.js','js/wizard.js','js/app.js'].forEach(f => win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const d = win.document;
const SHOW_PAIRS = 2, SHOW_SINGLE = 4, SPINE_SHOW = 2;   // must mirror ui.js caps
let problems = [];
const P = (n, m) => problems.push(`[${n}] ${m}`);

function auditTopo(name, res) {
  win.UI.render(res, null);
  const svg = d.querySelector('#tab-topology svg');
  if (!svg) return P(name, 'no SVG rendered');
  const q = r => svg.querySelectorAll(`[data-role="${r}"]`).length;
  const txt = svg.textContent;
  const data = res.fabrics.filter(f => f.network !== 'mgmt');

  // expected drawn leaves + whether "+N more" must appear
  let expLeaves = 0, expICL = 0, needMore = false, expUplinks = 0;
  const spineGroups = {};
  data.forEach(f => { if (f.spine) { const k = f.spineGroupKey || f.spine.model; spineGroups[k] = Math.min(f.spineCount || 2, SPINE_SHOW); } });
  data.forEach(f => {
    let shown;
    if (f.fabricsN === 2) {
      const showPairs = Math.min(f.leavesPerFabric, SHOW_PAIRS); shown = showPairs * 2;
      if (f.interconnectQty) expICL += showPairs;
      if (f.leavesPerFabric > SHOW_PAIRS) needMore = true;
    } else { shown = Math.min(f.totalLeaves, SHOW_SINGLE); if (f.totalLeaves > shown) needMore = true; }
    expLeaves += shown;
    if (f.spine) expUplinks += shown * Math.min(f.spineCount || 2, SPINE_SHOW);
  });
  const expSpines = Object.values(spineGroups).reduce((s, v) => s + v, 0);

  if (q('leaf') !== expLeaves) P(name, `leaf boxes drawn ${q('leaf')} ≠ expected ${expLeaves}`);
  if (q('spine') !== expSpines) P(name, `spine boxes drawn ${q('spine')} ≠ expected ${expSpines}`);
  if (q('uplink') !== expUplinks) P(name, `uplink lines ${q('uplink')} ≠ expected ${expUplinks} (every drawn leaf → every drawn spine)`);
  if (q('icl') !== expICL) P(name, `ICL segments ${q('icl')} ≠ expected ${expICL}`);
  if (data.length && q('strand') === 0) P(name, 'no host↔leaf strands drawn');
  if (needMore && !/more/i.test(txt)) P(name, 'capped switches but no "+N more" label');
  if (res.fabrics.some(f => f.network === 'mgmt')) {
    if (q('oob-switch') !== 1) P(name, 'OOB switch box missing');
    if (q('oob') === 0) P(name, 'no OOB drops drawn');
  }
  if (q('host') !== (res.targets || [1]).length) P(name, `host boxes ${q('host')} ≠ targets ${(res.targets || [1]).length}`);
  // several targets can share a PLATFORM (e.g. five separate general-server pools) — each
  // must keep its own host box/unit-count instead of collapsing into one (grouping bug guard).
  if (res.targets && res.targets.length > 1) {
    const tipUnits = [...svg.querySelectorAll('[data-role="host"]')].map(h => {
      const m = /^(\d+)×/.exec(h.getAttribute('data-tip') || ''); return m ? parseInt(m[1], 10) : 0;
    });
    const sumTip = tipUnits.reduce((a, b) => a + b, 0), sumTrue = res.targets.reduce((s, t) => s + t.units, 0);
    if (sumTip !== sumTrue) P(name, `host box unit labels sum to ${sumTip} ≠ true total units ${sumTrue} (same-platform targets may have collapsed into one box)`);
  }
}

const scenarios = {
  'powerstore/4 (single pair)': { platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true },
  'powerscale/40 (multi-pair + spine)': { platformId: 'powerscale', units: 40, redundancy: 'dual', includeMgmt: true },
  'combined 6+20': { targets: [{ platformId: 'powerstore', units: 6 }, { platformId: 'poweredge-general', units: 20 }], redundancy: 'dual', includeMgmt: true },
  'AI nvidia 8 (full stack)': { platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true },
  'AI dell 16 (big)': { platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true },
  'general 60 ew': { platformId: 'poweredge-general', units: 60, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' },
  'objectscale 8': { platformId: 'objectscale', units: 8, redundancy: 'dual', includeMgmt: true },
  // large heterogeneous build with the SAME platform added several times (the real-world
  // "50 nodes + five 2-node pools + PowerStore + PowerScale" shape) — each pool must keep
  // its own host box/label instead of collapsing into one because they share a platform id.
  'large mixed: 8 targets, platform repeated 6x': { targets: [
    { platformId: 'poweredge-general', units: 50 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'powerstore', units: 3, modelId: 'ps5200' },
    { platformId: 'powerscale', units: 6, modelId: 'f710' }
  ], redundancy: 'dual', growthHeadroom: 0.25, includeMgmt: true, trafficProfile: 'balanced' }
};
let n = 0;
for (const [name, input] of Object.entries(scenarios)) { n++; try { auditTopo(name, win.recommend(input)); } catch (e) { P(name, 'THREW: ' + e.message); } }

console.log(`Topology render audit — ${n} designs, checked against the drawn SVG structure.`);
if (!problems.length) console.log('✓ THE PICTURE MATCHES THE DATA (every switch, uplink, ICL, strand, OOB)');
else { console.log(`✗ ${problems.length} problem(s):`); problems.forEach(p => console.log('  ' + p)); }
process.exit(problems.length ? 1 : 0);
