/* =============================================================================
 * RENDERER PARITY AUDIT (permanent) — the three visual consumers of
 * result.fabrics (renderTopology, renderRack/renderRackMulti, buildDrawioXml)
 * are three independent copies of "which switches exist" logic (PR5, PROMPT-2).
 * This diffs BOM switch line items (by model) against the switch MODELS each
 * renderer actually draws, across all 8 archetypes from the PR5 5a audit.
 *
 * Caps ("+N more") are expected UI behavior, not bugs — a model missing
 * entirely (no representative box at all) is what this flags. The single-rack
 * schematic (renderRack, racks===1) has ONE known, accepted, documented gap:
 * on designs whose switch tiers alone exceed the fixed 42U budget, lower-
 * priority switches silently don't fit (GAPS.md G-010 — full rack-placement
 * redesign is a deliberately deferred design pass, not a bug in this PR).
 * KNOWN_GAPS pins that EXACTLY so any change (fixed OR regressed further)
 * fails this test and forces a conscious update here.
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'e:\\vs code\\programs\\Dell Boi';
const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), { runScripts: 'outside-only' });
const win = dom.window; win.alert = () => {}; win.print = () => {};
['js/version.js', 'js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
  'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
  'js/validate.js', 'js/engine.js', 'js/design.js', 'js/ui.js', 'js/wizard.js', 'js/app.js'].forEach(f => win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const d = win.document;
let problems = [];
const P = (n, m) => problems.push(`[${n}] ${m}`);

function bomModels(res) {
  const set = new Set();
  res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && b.model).forEach(b => set.add(b.model));
  return set;
}
function topoModels(res, mode) {
  win.UI.setTopoMode(mode || 'logical');
  win.UI.render(res, null);
  const wrap = d.querySelector('#tab-topology');
  const set = new Set();
  wrap.querySelectorAll('[data-bom-model]').forEach(n => set.add(n.getAttribute('data-bom-model')));
  return set;
}
function rackText(res) {
  win.UI.render(res, null);
  return d.querySelector('#tab-rack').textContent;
}
function drawioModels(res) {
  const xml = win.UI.buildDrawioXml(res);
  const set = new Set();
  const re = /Model="([^"]+)"/g; let m;
  while ((m = re.exec(xml))) set.add(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
  return set;
}

const scenarios = {
  'general 2-tier (25G/100G, redundant)': () => win.recommend({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true }),
  'general 3-tier (wayBig-class)': () => win.recommend({ platformId: 'poweredge-general', units: 4000, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 }),
  'AI 3-tier + super-spine (Dell)': () => win.recommend({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 }),
  'AI NVIDIA stack (SN5600-class)': () => win.recommend({ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true }),
  'PowerScale dedicated back-end': () => win.recommend({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerscale', units: 6 }], redundancy: 'dual', includeMgmt: true }),
  'edge/E3200 (distribution+access, PoE)': () => win.recommendEdge({ endpoints: 192, poe: 'poe++', accessSpeed: 'mgig', includeMgmt: true }),
  'multi-rack with OOB': () => win.recommend({ platformId: 'poweredge-general', units: 64, racks: 4, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' }),
  'converged (compute+storage shared leaves)': () => win.recommend({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerstore', units: 3 }], redundancy: 'dual', includeMgmt: true, fabricArchitecture: 'converged' })
};

// GAPS.md G-010 — single-rack schematic (racks===1) has a fixed 42U budget; on these two
// oversized archetypes the switch tiers alone exceed it, so these specific models don't fit
// and are silently dropped (no crash, no BOM error — the schematic just isn't complete).
const KNOWN_GAPS = {
  'general 3-tier (wayBig-class)': { renderRack: ['Z9432F-ON', 'S3248T-ON'] },
  // Z9964F-ON removed 2026-07-16d (R12 super-spine ruling): it is no longer SELECTED for this
  // design at all — it can't terminate 800G Z9864F-ON pod-spine links (no cataloged 1.6T→2×800G
  // part with OSFP112 far-ends), so the tier now uses a same-speed Z9864F-ON super-spine. With the
  // model gone from the BOM there is nothing for renderRack to miss, and this guard correctly
  // flagged the exception as stale. If a qualifying breakout is ever cataloged and the Z9964F-ON
  // re-enters the ladder, expect this gap to reappear and be re-pinned here consciously.
  'AI 3-tier + super-spine (Dell)': { renderRack: ['S5448F-ON', 'S5296F-ON', 'Z9664F-ON', 'S3248T-ON'] }
};

let n = 0;
for (const [name, mk] of Object.entries(scenarios)) {
  n++;
  let res;
  try { res = mk(); } catch (e) { P(name, 'GENERATE THREW: ' + e.message); continue; }
  try {
    const bm = bomModels(res);
    // renderTopology checked in BOTH view modes — 5d added an "Expanded" mode (every switch
    // instance, grouped by fabric/role, no invented rack placement — see GAPS.md G-014) that
    // must carry the SAME node set as Logical, just uncapped.
    const renderers = { 'renderTopology:logical': topoModels(res, 'logical'), 'renderTopology:expanded': topoModels(res, 'expanded'), buildDrawioXml: drawioModels(res) };
    const rackTxt = rackText(res);
    Object.entries(renderers).forEach(([rname, set]) => {
      const missing = [...bm].filter(m => !set.has(m));
      const allowed = (KNOWN_GAPS[name] && KNOWN_GAPS[name][rname]) || [];
      const unexpected = missing.filter(m => allowed.indexOf(m) < 0);
      const stale = allowed.filter(m => missing.indexOf(m) < 0);
      if (unexpected.length) P(name, `${rname}: missing model(s) not in KNOWN_GAPS: ${unexpected.join(', ')}`);
      if (stale.length) P(name, `${rname}: KNOWN_GAPS lists ${stale.join(', ')} as missing, but they now render — narrow/remove the exception`);
    });
    const missingRack = [...bm].filter(m => !rackTxt.includes(m));
    const allowedRack = (KNOWN_GAPS[name] && KNOWN_GAPS[name].renderRack) || [];
    const unexpectedRack = missingRack.filter(m => allowedRack.indexOf(m) < 0);
    const staleRack = allowedRack.filter(m => missingRack.indexOf(m) < 0);
    if (unexpectedRack.length) P(name, `renderRack: missing model(s) not in KNOWN_GAPS: ${unexpectedRack.join(', ')}`);
    if (staleRack.length) P(name, `renderRack: KNOWN_GAPS lists ${staleRack.join(', ')} as missing, but they now render — narrow/remove the exception`);
  } catch (e) { P(name, 'RENDER THREW: ' + e.message); }
}

win.UI.setTopoMode('logical');
console.log(`Renderer parity audit — ${n} archetypes × renderRack / buildDrawioXml / renderTopology (Logical + Expanded).`);
if (!problems.length) console.log('✓ every BOM switch model renders in every consumer (or matches a documented KNOWN_GAPS exception)');
else { console.log(`✗ ${problems.length} problem(s):`); problems.forEach(p => console.log('  ' + p)); }
process.exit(problems.length ? 1 : 0);
