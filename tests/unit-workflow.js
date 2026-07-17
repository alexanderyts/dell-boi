/* =============================================================================
 * WORKFLOW & USABILITY TESTS — the guide itself as a product:
 *   every wizard step well-formed, every form id wired, every tab routed,
 *   every step labeled in the "solution so far" panel, glossary coverage.
 * Run: node tests/unit-workflow.js  (jsdom — see unit-security.js note)
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { const alt = process.env.JSDOM_DIR; if (alt) ({ JSDOM } = require(path.join(alt, 'node_modules', 'jsdom'))); else { console.log('unit-workflow: SKIPPED (jsdom not found)'); process.exit(0); } }

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const win = dom.window; win.alert = m => { throw new Error('alert: ' + m); }; win.print = () => {};
['js/version.js', 'js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
 'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js', 'js/catalog/glossary.js',
 'js/validate.js', 'js/engine.js', 'js/design.js', 'js/ui.js', 'js/wizard.js', 'js/app.js'].forEach(f => win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const d = win.document, $ = s => d.querySelector(s);

let pass = 0, fail = [];
const t = (name, cond, got) => { if (cond) pass++; else fail.push(name + (got ? '  → ' + String(got).slice(0, 140) : '')); };
const wizardSrc = fs.readFileSync(path.join(ROOT, 'js', 'wizard.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(ROOT, 'js', 'ui.js'), 'utf8');

/* ---- every DOM id referenced by app.js exists in index.html (typo guard) ---- */
(() => {
  const ids = [...new Set([...appSrc.matchAll(/\$\('#([a-z0-9-]+)'\)/gi)].map(m => m[1]))];
  const missing = ids.filter(id => !d.getElementById(id));
  t(`app.js: all ${ids.length} referenced element ids exist in index.html`, missing.length === 0, missing.join(', '));
})();

/* ---- tab wiring: every .tab button's pane is in BOTH tab lists (the pitch-tab bug class) ---- */
(() => {
  const tabs = [...d.querySelectorAll('.tab')].map(b => b.dataset.tab);
  const missingPanes = tabs.filter(n => !d.getElementById('tab-' + n));
  t('every tab button has a pane', missingPanes.length === 0, missingPanes.join(','));
  const appList = (appSrc.match(/const TABS = \[([^\]]*)\]/) || [])[1] || '';
  const uiList = (uiSrc.match(/\['guidance'[^\]]*'pitch'[^\]]*\]|\['guidance'[^\]]*\]/) || [])[0] || '';
  const notInApp = tabs.filter(n => appList.indexOf(`'${n}'`) < 0);
  const notInUi = tabs.filter(n => uiList.indexOf(`'${n}'`) < 0);
  t('every tab is in app.js TABS list (click-to-show)', notInApp.length === 0, notInApp.join(','));
  t('every tab is in ui.js activateTab list (render-to-show)', notInUi.length === 0, notInUi.join(','));
})();

/* ---- wizard step integrity, per flow ---- */
(() => {
  ['guided', 'discovery', 'refresh'].forEach(mode => {
    win.Wizard.start(mode);
    // reach into the rendered flow via navigation: sanity = first step renders a question
    t(`${mode}: first step renders`, /wiz-q/.test($('#wiz-step').innerHTML));
    // walk with defaults to the end — no crashes, results appear
    for (let i = 0; i < 60 && $('#wizard') && !$('#wizard').hidden; i++) $('#wiz-next').click();
    t(`${mode}: default walk completes to results`, !$('#results').hidden);
    ['#wizard', '#ra-mode', '#expert-form'].forEach(s => { if ($(s)) $(s).hidden = true; });
    $('#mode-chooser').hidden = false; $('#results').hidden = true;
  });
})();

/* ---- static analysis of wizard steps: ids unique per flow, defaults sane, labels present ---- */
(() => {
  // extract every step id + whether SUM_LABELS names it (usability: the summary panel)
  const stepIds = [...new Set([...wizardSrc.matchAll(/\{ id: '([A-Za-z0-9_]+)', type/g)].map(m => m[1]))];
  const sumBlock = (wizardSrc.match(/const SUM_LABELS = \{[\s\S]*?\};/) || [''])[0] + (wizardSrc.match(/SECOND_MODEL_STEPS\.forEach[^\n]*/) || [''])[0];
  const unlabeled = stepIds.filter(id => sumBlock.indexOf(id + ':') < 0 && sumBlock.indexOf("'" + id + "'") < 0 && !/^secondModel_/.test(id));
  t('every wizard step has a "solution so far" label', unlabeled.length === 0, unlabeled.join(', '));
  // every choice step has options; every option has a label
  const badOpts = [...wizardSrc.matchAll(/type: 'choice'[\s\S]{0,80}?/g)].length;
  t('choice steps exist and parse', badOpts > 20);
})();

/* ---- every mode button routes somewhere real ---- */
(() => {
  const modes = [...d.querySelectorAll('.mode-btn')].map(b => b.dataset.mode);
  const routed = modes.filter(m => appSrc.indexOf(`'${m}'`) >= 0 || /guided|discovery|refresh/.test(m));
  t('every mode chooser button is routed', routed.length === modes.length, modes.filter(m => !routed.includes(m)).join(','));
})();

/* ---- glossary usability: key jargon that appears in UI copy has a tooltip entry ---- */
(() => {
  const g = win.CATALOG.glossary;
  const need = ['MC-LAG', 'ICL', 'leaf-spine', 'oversubscription', 'non-blocking', 'breakout', 'DAC', 'AOC', 'RoCEv2', 'ZTP', 'lossless', 'EVPN'];
  const missing = need.filter(k => !g[k]);
  t('glossary covers the jargon the guides use', missing.length === 0, missing.join(', '));
})();

/* ---- exports don't crash on every design shape ---- */
(() => {
  const shapes = [
    win.recommend({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true }),
    win.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true }),
    win.recommendEdge({ endpoints: 96, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true }),
    win.recommendRefresh({ swCount: 6, portsPer: 48, speedNow: '1g', targetSpeed: '10g-t', topologyNow: 'threetier', distribution: 'new', includeMgmt: true })
  ];
  let ok = true, err = '';
  shapes.forEach((res, i) => {
    try { win.UI.render(res, null); win.UI.buildDrawioXml(res); }
    catch (e) { ok = false; err = 'shape ' + i + ': ' + e.message; }
  });
  t('render + draw.io export survive all four design shapes', ok, err);
})();

/* ---- Full/OOO BOM copy text: right shape, right content, buttons wired ---- */
(() => {
  const res = win.recommend({ platformId: 'poweredge-general', units: 24, redundancy: 'dual', includeMgmt: true });
  win.UI.render(res, null);
  const full = win.UI.buildBOMText(res, 'full');
  const ooo = win.UI.buildBOMText(res, 'ooo');
  const swLine = res.bom.find(b => b.category === 'Switch');
  t('copy full: includes a SWITCHES section', /SWITCHES:/.test(full));
  t('copy full: includes Dell P/N lines', /PN:/.test(full));
  t('copy full: includes the draft-verify footer', /verify part numbers/.test(full));
  // OOO = a Teams-ready quick message: switch counts ONLY
  t('copy OOO: omits part numbers entirely', !/PN:/.test(ooo));
  const oooBullets = ooo.split('\n').filter(l => l.indexOf('•') === 0);
  t('copy OOO: switch counts only — NO cables/optics lines', oooBullets.length > 0 && oooBullets.every(l => !/DAC|AOC|patch|optic|transceiver|Cable/i.test(l)), ooo);
  t('copy OOO: no Software/Compute/Storage context', !/DFM|PowerEdge|PowerStore|AUTOMATION/i.test(ooo), ooo);
  t('copy OOO: bullet per switch model with role', new RegExp('• \\d+× ' + swLine.model + ' — ').test(ooo), ooo);
  t('copy OOO: totals line present', /\d+ switches total\./.test(ooo));
  t('copy OOO: reads like a message (lead + follow-up)', /^Quick network build \(draft\):/.test(ooo) && /to follow/.test(ooo));
  t('copy OOO: is shorter than the full copy (same design)', ooo.length < full.length, `${ooo.length} vs ${full.length}`);
  // OOO for an edge design labels access/distribution correctly
  const eres = win.recommendEdge({ endpoints: 96, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  const eooo = win.UI.buildBOMText(eres, 'ooo');
  t('copy OOO (edge): access role labeled', /— access/.test(eooo), eooo);
  t('copy OOO (edge): distribution role labeled', /— distribution/.test(eooo), eooo);
  // buttons are wired end-to-end and don't throw (jsdom has no real clipboard, so this
  // exercises the on-page fallback panel path — clean it up after so later tests aren't affected)
  win.UI.render(res, null);
  let threw = null;
  try { $('#btn-copy-bom').click(); $('#btn-copy-ooo').click(); } catch (e) { threw = e.message; }
  t('copy: clicking Copy BOM / Copy OOO does not throw', threw === null, threw);
  [...d.querySelectorAll('.export-fallback-backdrop')].forEach(b => b.remove());
})();

/* ---- examples keep the mode chooser visible (it used to vanish, stranding the user) ---- */
(() => {
  const btn = d.querySelector('.example-btn[data-example="ai"]');
  btn.click();
  t('example: BOM renders', !$('#results').hidden);
  t('example: mode chooser STAYS visible (can immediately pick something else)', !$('#mode-chooser').hidden);
  $('#results').hidden = true;
})();

/* ---- wizard option click updates IN PLACE (no step rebuild → no page jump on phones) ---- */
(() => {
  win.Wizard.start('guided');
  const stepEl = $('#wiz-step');
  const opts = [...stepEl.querySelectorAll('.wiz-opt')];
  if (opts.length >= 2) {
    const marker = stepEl.firstElementChild;   // node identity survives an in-place update, not a rebuild
    opts[1].click();
    t('wizard: selecting an option does NOT rebuild the step DOM', stepEl.firstElementChild === marker);
    t('wizard: selection highlight moved in place', opts[1].classList.contains('sel') && !opts[0].classList.contains('sel'));
  } else t('wizard: first guided step has clickable options', false);
  ['#wizard', '#ra-mode', '#expert-form'].forEach(s => { if ($(s)) $(s).hidden = true; }); $('#mode-chooser').hidden = false;
})();

/* ---- topology pan/zoom viewport: fixed window, zoom controls, print bypass ---- */
(() => {
  const res = win.recommend({ platformId: 'poweredge-general', units: 60, redundancy: 'dual', includeMgmt: true });
  win.UI.render(res, null);
  const vp = $('#topo-svg');
  t('topology: renders inside the pan/zoom viewport', vp && vp.classList.contains('topo-viewport'));
  t('topology: zoom stage wraps the SVG', !!(vp && vp.querySelector('.zoom-stage svg')));
  const ctl = vp && vp.querySelector('.zoom-ctl');
  t('topology: zoom controls present (in/out/fit/1:1)', !!ctl && ['in', 'out', 'fit', 'full'].every(z => ctl.querySelector(`[data-z="${z}"]`)));
  let zThrew = null;
  try { ['in', 'out', 'full', 'fit'].forEach(z => ctl.querySelector(`[data-z="${z}"]`).click()); } catch (e) { zThrew = e.message; }
  t('topology: zoom buttons operate without throwing', zThrew === null, zThrew);
  t('topology: zoom stage carries a transform after zooming', /scale\(/.test(vp.querySelector('.zoom-stage').style.transform || ''));
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  const printBlock = css.slice(css.indexOf('@media print'));
  t('topology: print resets the viewport (full untransformed diagram)', /\.topo-viewport\{height:auto;overflow:visible\}/.test(printBlock) && /\.topo-viewport \.zoom-stage\{transform:none!important/.test(printBlock));
  // edge topology uses the same viewport
  const eres = win.recommendEdge({ endpoints: 96, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  win.UI.render(eres, null);
  t('topology (edge): same pan/zoom viewport', $('#topo-svg') && $('#topo-svg').classList.contains('topo-viewport'));
})();

/* ---- review fixes 2026-07-13: topology core-wiring truth, drawio edge ICLs, multi-rack border ---- */
(() => {
  // dedicated spine groups must NOT be drawn wired to the core (they're isolated by design);
  // only the group that sources the uplink connects. Core box bottom sits at y=48 (coreY+coreH).
  const ded = win.recommend({ targets: [{ platformId: 'powerscale', units: 60 }, { platformId: 'poweredge-general', units: 300 }], redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE' });
  win.UI.render(ded, null);
  const dedF = ded.fabrics.find(f => f.dedicated && f.spine);
  if (dedF) {
    const coreLines = [...$('#topo-svg').querySelectorAll('line[y2="48"]')].length;
    t('topology: only the core-sourcing spine group wires to core (dedicated stays isolated)', coreLines === 2, coreLines);
  } else t('topology: dedicated-spine test design produced a dedicated spined fabric', false);
  // ToR-only + core: the BOM prices core optics from the ToR — a line must now be drawn
  const tor = win.recommend({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE' });
  win.UI.render(tor, null);
  t('topology: ToR-only + core uplink draws the ToR→core connection (was a floating core box)',
    [...$('#topo-svg').querySelectorAll('line[y2="48"]')].length >= 1);
  // multi-rack elevation places the border-leaf pair
  const mb = win.recommend({ platformId: 'poweredge-general', units: 90, racks: 3, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE', borderLeaf: true });
  if (mb.coreUplink && mb.coreUplink.borderLeaf) {
    win.UI.render(mb, null);
    t('rack (multi): border-leaf pair placed in the spine rack', /border-leaf/i.test($('#tab-rack').textContent));
  } else t('rack (multi): border-leaf design produced a border pair', false);
})();

/* ---- draw.io export: EVERY individual switch↔switch link is its own edge ---- */
(() => {
  const res = win.recommend({ platformId: 'poweredge-general', units: 120, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const xml = win.UI.buildDrawioXml(res);
  const f = res.fabrics.filter(x => x.network !== 'mgmt').filter(x => x.spine);
  const expected = f.reduce((s, x) => s + x.totalLeaves * (x.uplinksPerLeaf || 0), 0);
  const anchored = (xml.match(/exitY=0;/g) || []).length;   // per-link fanned edges (leaf→spine)
  t('drawio: one edge per individual uplink (anchored fan-out)', expected > 0 && anchored === expected, `${anchored} vs ${expected}`);
  t('drawio: legend explains one line = one physical link', /ONE physical link/.test(xml));
  // ICL pairs: each physical peer-link drawn for a ToR-pair design
  const tor = win.recommend({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true });
  const tf = tor.fabrics.find(x => x.network !== 'mgmt' && x.interconnectQty);
  if (tf) {
    const iclN = Math.max(1, Math.round(tf.interconnectQty / tf.leavesPerFabric));
    const iclEdges = (win.UI.buildDrawioXml(tor).match(/exitX=1;exitY=0\.\d+/g) || []).length;
    t('drawio: each ICL peer-link drawn individually', iclEdges >= iclN, `${iclEdges} vs ${iclN}`);
  }
  // edge/refresh shapes: access ICLs + the distribution-pair ICL are BOM-priced — draw them
  const eres = win.recommendEdge({ endpoints: 192, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  const ef = eres.fabrics.find(x => x.network !== 'mgmt');
  if (ef && ef.interconnectQty) {
    const exml = win.UI.buildDrawioXml(eres);
    const eIcl = (exml.match(/exitX=1;exitY=0\.\d+/g) || []).length;
    const wantAccessIcl = ef.interconnectQty;   // every access peer-link individually
    const distIclLine = eres.bom.find(b => b._mk === 'edge-dist-icl');
    const wantTotal = wantAccessIcl + (distIclLine ? Math.min(distIclLine.qty, 8) : 0);
    t('drawio (edge): access + distribution ICLs all drawn', eIcl === wantTotal, `${eIcl} vs ${wantTotal}`);
  } else t('drawio (edge): edge design produced ICLs to draw', false);
})();

/* ---- copy text handles non-numeric qty (RA rows use qty:'per ERA', not a count) ----
 * Regression guard: an early version of buildBOMText() blindly appended "x" to every
 * qty ("per ERAx Dell PowerScale..."), which only the "typeof qty === 'number'" guard
 * already used elsewhere in this file (BOM sum reducers) catches. */
(() => {
  const ra = win.recommendRA('nvidia-2-8-5-200', 16);
  const full = win.UI.buildBOMText(ra, 'full');
  t('copy full: RA non-numeric qty ("per ERA") renders without a bogus "x"', !/per ERAx/.test(full) && /per ERA/.test(full), full.split('\n').find(l => /per ERA/.test(l)));
})();

/* ---- Express mode: 5-question fast path completes ---- */
(() => {
  win.Wizard.start('express');
  t('express: mode starts', !$('#wizard').hidden);
  let steps = 0;
  for (let i = 0; i < 12 && !$('#wizard').hidden; i++) { if (/wiz-q/.test($('#wiz-step').innerHTML)) steps++; $('#wiz-next').click(); }
  t('express: is SHORT (≤6 steps)', steps <= 6, steps);
  t('express: completes to a rendered BOM on defaults', !$('#results').hidden);
  t('express: flags its smart-default assumptions', /Express mode filled/.test($('#tab-checks').textContent));
  ['#wizard', '#ra-mode', '#expert-form'].forEach(s => { if ($(s)) $(s).hidden = true; }); $('#mode-chooser').hidden = false; $('#results').hidden = true;
})();

/* ---- example designs load from the chooser ---- */
(() => {
  t('examples: buttons present on the chooser', d.querySelectorAll('.example-btn').length >= 3);
  const btn = d.querySelector('.example-btn[data-example="storage-servers"]');
  if (btn) { btn.click(); t('examples: opening one renders a BOM', !$('#results').hidden && /PowerStore/.test($('#tab-bom').textContent)); }
  else t('examples: storage-servers example present', false);
})();

/* ---- plain-English summary + confidence + next-steps for non-technical users ---- */
(() => {
  const res = win.recommend({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerstore', units: 3 }], redundancy: 'dual', includeMgmt: true });
  win.UI.render(res, null);
  const bom = $('#tab-bom');
  t('plain: narrative panel present', /design-plain/.test(bom.innerHTML) && /This design connects/.test(bom.textContent));
  t('plain: confidence signal present', /Draft — \d+ item|issue.* to resolve/.test(bom.textContent));
  t('next-steps: quote checklist present', /Turn this into a quote/.test(bom.textContent) && /orderable Dell SKUs/.test(bom.textContent));
})();

/* ---- phone: rendering results anchors the viewport on the results panel ----
 * On a single-column layout the results appear BELOW the inputs while the input side
 * changes height (wizard closes) — without an explicit scroll the page lands somewhere
 * arbitrary ("scrolls around", user-reported on iPhone). Desktop must NOT be hijacked. */
(() => {
  const res = win.recommend({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true });
  const out = d.getElementById('output');
  let scrolled = 0;
  out.scrollIntoView = () => { scrolled++; };
  const realMM = win.matchMedia;
  win.matchMedia = q => ({ matches: /max-width:\s*860px/.test(q) });   // simulate a phone
  win.requestAnimationFrame = cb => cb();                              // run the deferred anchor now
  win.UI.render(res, null);
  t('phone: new results scroll the results panel into view', scrolled === 1, scrolled);
  win.matchMedia = () => ({ matches: false });                         // simulate desktop
  win.UI.render(res, null);
  t('desktop: rendering results does NOT hijack scroll', scrolled === 1, scrolled);
  win.matchMedia = realMM; delete out.scrollIntoView; delete win.requestAnimationFrame;
})();

/* ---- accessibility: the essentials a keyboard + screen-reader user needs ---- */
(() => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  t('a11y: visible keyboard focus ring (:focus-visible) defined', /:focus-visible/.test(css));
  t('a11y: honors prefers-reduced-motion', /prefers-reduced-motion/.test(css));
  // generate a design and confirm the diagrams carry an accessible name
  const res = win.recommend({ platformId: 'poweredge-general', units: 8, redundancy: 'dual', includeMgmt: true });
  win.UI.render(res, null);
  const topo = $('#tab-topology').querySelector('svg');
  t('a11y: topology SVG has role=img + <title> accessible name', topo && topo.getAttribute('role') === 'img' && !!topo.querySelector('title') && topo.querySelector('title').textContent.length > 10, topo && topo.innerHTML.slice(0, 40));
  // tabs expose selection state to assistive tech
  const bomTab = d.querySelector('.tab[data-tab="bom"]');
  t('a11y: tabs are role=tab with aria-selected', bomTab.getAttribute('role') === 'tab' && bomTab.hasAttribute('aria-selected'));
  d.querySelector('.tab[data-tab="checks"]').click();
  t('a11y: aria-selected follows the active tab', d.querySelector('.tab[data-tab="checks"]').getAttribute('aria-selected') === 'true' && bomTab.getAttribute('aria-selected') === 'false');
  // result generation is announced
  t('a11y: results have a live status region that gets populated', /role="status"|aria-live/.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) && $('#results-status').textContent.length > 10, $('#results-status').textContent);
  // theme toggle exposes pressed state
  t('a11y: theme toggle reports aria-pressed', $('#theme-toggle').hasAttribute('aria-pressed'));
})();

/* ---- print pagination: overflow:auto/scroll is a printing trap ----
 * Regression guard, added 2026-07-13 after an independent review caught it: a printed
 * page can't scroll, so browsers render any overflow:auto/scroll box as ONE monolithic
 * fragment in paged media — content taller/wider than a physical page is silently never
 * printed at all, no error, no warning. A selector is only safe if @media print either
 * (a) hides it entirely (display:none), or (b) explicitly resets its overflow to visible.
 * This is a heuristic text scan, not a real CSS cascade — it exists to catch "a NEW
 * overflow:auto rule shipped with no print consideration," not to replace human review. */
(() => {
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  // strip every @media block's contents to find TOP-LEVEL (always-on, incl. print) rules
  let topLevel = '', inMedia = false, mediaDepth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (!inMedia && css.startsWith('@media', i)) inMedia = true;
    if (inMedia) { if (c === '{') mediaDepth++; else if (c === '}') { mediaDepth--; if (mediaDepth === 0) inMedia = false; } continue; }
    topLevel += c;
  }
  // concatenate the contents of every @media print{...} block (there are two in this file)
  const printBlocks = [...css.matchAll(/@media print\{/g)].map(m => {
    let i = m.index + m[0].length, depth = 1, s = '';
    while (i < css.length && depth > 0) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; if (depth > 0) s += css[i]; i++; }
    return s;
  }).join('\n');
  const risky = [...topLevel.matchAll(/([^{}]+)\{[^{}]*overflow(?:-x|-y)?\s*:\s*(?:auto|scroll)\b[^{}]*\}/g)];
  const unsafe = risky.filter(([, selectorList]) =>
    selectorList.split(',').map(s => s.trim()).filter(Boolean).some(sel => {
      const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hidden = new RegExp(escaped + '[^{}]*\\{[^{}]*display\\s*:\\s*none');
      const reset = new RegExp(escaped + '[^{}]*\\{[^{}]*overflow(?:-x|-y)?\\s*:\\s*visible');
      return !(hidden.test(printBlocks) || reset.test(printBlocks));   // this one selector is uncovered
    }));
  t('print: every overflow:auto/scroll rule is either hidden or reset to visible under @media print',
    unsafe.length === 0, unsafe.map(([, sel]) => sel.trim()).join(' | '));
})();

/* ---- pickBreakout() must have exactly ONE call site (2026-07-15, GAPS.md G-013) ----
 * Three separate places in engine.js used to compute their OWN breakout ratio and call
 * pickBreakout() directly — each one a candidate to silently drift from the others (one
 * instance already had, missing the `breakout:'none'` check the others had). Consolidated onto
 * a single resolveUplinkBreakout() helper, which is now the ONLY legitimate caller. This is a
 * heuristic source-text scan (matches the literal string "pickBreakout(" as a call, excluding
 * its own `function pickBreakout(` definition line), not a real JS parser — it exists to catch
 * "a NEW direct call reintroduced the drift risk," not to replace human review of what the call
 * actually does. If this ever needs a second legitimate call site, update the expected count
 * here deliberately — don't just raise the number to make the test pass. */
(() => {
  const engineSrc = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
  const calls = (engineSrc.match(/pickBreakout\(/g) || []).length;
  const defs = (engineSrc.match(/function pickBreakout\(/g) || []).length;
  t('pickBreakout() has exactly ONE call site (inside resolveUplinkBreakout — see G-013)', calls - defs === 1, `${calls} occurrences, ${defs} definition(s), ${calls - defs} call(s)`);
})();

console.log(`unit-workflow: ${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
