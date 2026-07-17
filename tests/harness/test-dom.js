/* Full DOM integration test via jsdom — loads the real page, runs every mode. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = 'e:\\vs code\\programs\\Dell Boi';

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only' });
const win = dom.window;
win.alert = m => { throw new Error('alert(): ' + m); };   // any alert = failure
win.print = () => {};

const SCRIPTS = ['js/version.js','js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
  'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js','js/catalog/glossary.js',
  'js/validate.js','js/engine.js','js/design.js','js/ui.js','js/wizard.js','js/app.js'];
SCRIPTS.forEach(f => win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));

const d = win.document, $ = s => d.querySelector(s);
let fails = [];
const check = (name, cond, extra) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  → ' + (extra || ''))); if (!cond) fails.push(name); };

function toModes() { const b = $('.mode-back:not([hidden])') || $('#wiz-exit'); }
function walkWizard(max) {
  for (let i = 0; i < max; i++) {
    if (!$('#results').hidden && $('#wizard').hidden) return;
    if ($('#wizard').hidden) return;
    $('#wiz-next').click();
  }
}
function reset() { // back to chooser
  ['#wizard', '#ra-mode', '#expert-form'].forEach(s => $(s).hidden = true);
  $('#mode-chooser').hidden = false;
  $('#results').hidden = true;
}
// expert-form: unlimited additional attach targets (dynamic rows)
function clearTargets() { d.querySelectorAll('#extra-targets .target-row').forEach(r => r.remove()); }
function addTarget(platformId, units, opts) {
  $('#btn-add-target').click();
  const rows = d.querySelectorAll('#extra-targets .target-row');
  const row = rows[rows.length - 1];
  row.querySelector('.t-platform').value = platformId;
  row.querySelector('.t-platform').dispatchEvent(new win.Event('change'));
  row.querySelector('.t-units').value = units;
  opts = opts || {};
  if (opts.model) row.querySelector('.t-model').value = opts.model;
  if (opts.nicSpeed) row.querySelector('.t-nic-speed').value = opts.nicSpeed;
  if (opts.nicPorts) row.querySelector('.t-nic-ports').value = opts.nicPorts;
  if (opts.nicCount) row.querySelector('.t-nic-count').value = opts.nicCount;
  if (opts.gpus) row.querySelector('.t-gpus').value = opts.gpus;
  if (opts.rail) row.querySelector('.t-rail').value = opts.rail;
  return row;
}

check('app initialized: mode chooser present', !!$('#mode-chooser') && $('.mode-btn'));
check('platform dropdown populated', $('#f-platform').options.length >= 5);
check('RA dropdown populated', $('#f-ra').options.length >= 1);

/* ---- GUIDED ---- */
try {
  $('.mode-btn[data-mode="guided"]').click();
  check('guided: wizard shown', !$('#wizard').hidden);
  check('guided: question + hint chips render', /wiz-q/.test($('#wiz-step').innerHTML) && /wiz-listen/.test($('#wiz-step').innerHTML));
  walkWizard(30);
  check('guided: results rendered', !$('#results').hidden);
  check('guided: BOM table has rows', $('#tab-bom table tbody tr') && $('#tab-bom tbody').children.length > 0);
  check('guided: design summary present', /design-summary/.test($('#tab-bom').innerHTML));
  check('guided: topology SVG rendered', /<svg/.test($('#tab-topology').innerHTML));
  check('guided: rack SVG rendered', /<svg/.test($('#tab-rack').innerHTML));
  check('guided: checks rendered', $('#tab-checks').children.length > 0);
  check('guided: guidance tab hidden (not discovery)', $('#tab-btn-guidance').hidden);
} catch (e) { check('guided flow no exception', false, e.message); }

/* ---- NEW: interactive topology + rack power rollup ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '120';
  addTarget('powerstore', '6');
  $('#f-traffic').value = 'balanced';
  $('#btn-generate').click();
  const topo = $('#tab-topology');
  check('interactive: leaf switches carry hover tooltips', topo.querySelectorAll('[data-role="leaf"][data-tip]').length > 0);
  check('interactive: switches are click-to-BOM (data-bom-model)', topo.querySelectorAll('[data-bom-model]').length > 0 && d.querySelectorAll('#tab-bom tr[data-bom-model]').length > 0);
  check('interactive: fabric-focus chips in legend (data-fabric)', d.querySelectorAll('.diagram-wrap ~ .legend [data-fabric]').length >= 1 || topo.querySelectorAll('.legend [data-fabric]').length >= 1);
  check('interactive: hover-hint copy present', /hover a switch|click one to jump/.test(topo.textContent));
  // clicking a switch jumps to its BOM row
  const sw = topo.querySelector('[data-bom-model]');
  if (sw) { const model = sw.getAttribute('data-bom-model'); sw.dispatchEvent(new win.Event('click', { bubbles: true }));
    check('interactive: BOM tab shown after switch click', !$('#tab-bom').hidden);
    check('interactive: target BOM row exists for clicked switch', !!d.querySelector(`#tab-bom tr[data-bom-model="${model}"]`)); }
  // rack power rollup
  check('rack: per-rack power/cooling/weight rollup shown', /Rack power ≈/.test($('#tab-rack').textContent) && /kW/.test($('#tab-rack').textContent) && /Dell EIPT/.test($('#tab-rack').textContent));
  // multi-rack deployment total
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '64'; $('#f-racks').value = '4';
  $('#btn-generate').click();
  check('rack: multi-rack shows a whole-deployment power total', /Whole deployment ≈/.test($('#tab-rack').textContent));
  $('#f-racks').value = '1';
} catch (e) { check('interactive topology / rack power no exception', false, e.message); }

/* ---- GUIDED with a fully-specced ADDED target (server flow + PowerStore 9200T @ custom NIC) ---- */
try {
  reset();
  $('.mode-btn[data-mode="guided"]').click();
  const picks = [
    { q: /Also connecting/, opt: /add PowerStore/ },
    { q: /model is being added/, opt: /9200T/ },
    { q: /Spec the added target/, opt: /Spec it exactly/ },
    { q: /Added target — port speed/, opt: /^100GbE/ }
  ];
  for (let i = 0; i < 40 && !$('#wizard').hidden; i++) {
    const q = ($('#wiz-step .wiz-q') || {}).textContent || '';
    const pick = picks.find(p => !p.done && p.q.test(q));
    if (pick) { const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => pick.opt.test(b.textContent)); if (btn) btn.click(); pick.done = true; }
    $('#wiz-next').click();
  }
  check('guided+2nd: all build-out questions appeared', picks.every(p => p.done));
  check('guided+2nd: results rendered', !$('#results').hidden);
  const bomTxt = $('#tab-bom').textContent;
  check('guided+2nd: added PowerStore 9200T present', /PowerStore/.test(bomTxt));
  check('guided+2nd: custom spec lands (8 units × 2×2 ports @100G = 32 links)', /32 link\(s\) \(4\/unit × 8\)/.test(bomTxt));
} catch (e) { check('guided second-target build-out no exception', false, e.message); }

/* ---- NEW: guided wizard reaches the newly-catalogued platforms (MX7000, PowerVault ME5) ---- */
try {
  reset();
  $('.mode-btn[data-mode="guided"]').click();
  const picks2 = [
    { q: /Also connecting servers or storage/, opt: /add PowerEdge MX7000/ },
    { q: /Add another attach target/, opt: /Yes — add another/ },
    { q: /Also connecting servers or storage/, opt: /add PowerVault ME5/ },
    { q: /Which .*platform is being added|model is being added/, opt: /ME5024/ }
  ];
  for (let i = 0; i < 90 && !$('#wizard').hidden; i++) {
    const q = ($('#wiz-step .wiz-q') || {}).textContent || '';
    const pick = picks2.find(p => !p.done && p.q.test(q));
    if (pick) { const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => pick.opt.test(b.textContent)); if (btn) btn.click(); pick.done = true; }
    $('#wiz-next').click();
  }
  check('guided+new-platforms: reached both added-platform prompts', picks2[0].done && picks2[2].done, picks2.map(p => !!p.done).join(','));
  check('guided+new-platforms: results rendered', !$('#results').hidden);
  const gt2 = win.UI.last.targets || [];
  check('guided+new-platforms: MX7000 + PowerVault ME5 both reached the engine', gt2.some(t => t.platform.id === 'mx7000') && gt2.some(t => t.platform.id === 'powervault-me5'), gt2.map(t => t.platform.id).join(','));
  check('guided+new-platforms: no hard errors', !win.UI.last.warnings.some(w => w.severity === 'error'), win.UI.last.warnings.filter(w => w.severity === 'error').map(w => w.message).join(' | '));
} catch (e) { check('guided new-platforms no exception', false, e.message); }

/* ---- MULTI-RACK + 100G leaf override (expert) ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '40';
  $('#f-nic-speed').value = '100GbE'; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '1';
  $('#f-racks').value = '4'; $('#f-leaf100').value = 'z9264f';
  $('#btn-generate').click();
  const bomTxt = $('#tab-bom').textContent, checksTxt = $('#tab-checks').textContent, rackTxt = $('#tab-rack').textContent;
  check('multirack: results rendered', !$('#results').hidden);
  check('multirack: leaf override honored (Z9264F in BOM)', /Z9264F/.test(bomTxt));
  check('multirack: pair-per-rack leaves (4 racks → ≥8 leaves)', win.UI.last.fabrics.find(f => f.network !== 'mgmt').totalLeaves >= 8);
  check('multirack: OOB one per declared rack note', /one per declared rack/.test(bomTxt));
  check('multirack: FDC-pattern note in checks', /Multi-rack deployment \(4 racks\)/.test(checksTxt));
  const rackEl = $('#tab-rack');
  check('multirack: MULTI-RACK elevation rendered (≥2 rack frames)', (rackEl.innerHTML.match(/data-role="rack-frame"/g) || []).length >= 2);
  check('multirack: spine rack + node rack frames present', /SPINE RACK/.test(rackTxt) && /NODE RACK/.test(rackTxt));
  check('multirack: inter-rack uplink trunks drawn', /data-role="interrack"/.test(rackEl.innerHTML) && /CROSS-RACK: AOC/.test(rackTxt));
  check('multirack: OOB aggregation drawn + labeled', /data-role="interrack-oob"/.test(rackEl.innerHTML) && /OOB aggregation/.test(rackTxt));
  check('multirack: cross-rack uplink note on BOM cable line (B6: no invented spine rack)', /CROSS-RACK \(leaf racks → the spine's declared rack\)/.test(bomTxt) && !/node racks → spine rack/.test(bomTxt));
  check('multirack: inter-rack OOB uplink line in BOM', /OOB inter-rack uplinks/.test(bomTxt));
  // restore expert-form state so later tests stay independent
  $('#f-racks').value = '1'; $('#f-leaf100').value = 'auto';
  $('#f-nic-speed').value = ''; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '2';
} catch (e) { check('multirack flow no exception', false, e.message); }

/* ---- THEME: toggle flips data-theme and repaints the diagrams ---- */
try {
  check('theme: toggle button present', !!$('#theme-toggle'));
  check('theme: light SVG sheet by default', /fill="#ffffff"/.test($('#tab-topology').innerHTML));
  $('#theme-toggle').click();
  check('theme: data-theme=dark set', d.documentElement.getAttribute('data-theme') === 'dark');
  check('theme: diagrams repainted dark', /fill="#14181c"/.test($('#tab-topology').innerHTML) && /fill="#14181c"/.test($('#tab-rack').innerHTML));
  $('#theme-toggle').click();
  check('theme: back to light + repaint', d.documentElement.getAttribute('data-theme') === 'light' && /fill="#ffffff"/.test($('#tab-topology').innerHTML));
} catch (e) { check('theme toggle no exception', false, e.message); }

/* ---- GUIDED AI with mixed NICs (XE9780 + CX-7 rails + Broadcom FE/storage NIC) ---- */
try {
  reset();
  $('.mode-btn[data-mode="guided"]').click();
  const picks = [
    { q: /What are you connecting/, opt: /AI \/ GPU servers/ },
    { q: /Which GPU server/, opt: /XE9780/ },
    { q: /AI fabric stack/, opt: /Dell PowerSwitch/ },
    { q: /Which NIC drives the GPU rails/, opt: /ConnectX-7/ },
    { q: /front-end \/ storage NICs — spec them/, opt: /Spec the front-end/ },
    { q: /NIC port speed/, opt: /^100GbE/ }
  ];
  for (let i = 0; i < 45 && !$('#wizard').hidden; i++) {
    const q = ($('#wiz-step .wiz-q') || {}).textContent || '';
    const pick = picks.find(p => !p.done && p.q.test(q));
    if (pick) { const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => pick.opt.test(b.textContent)); if (btn) btn.click(); pick.done = true; }
    $('#wiz-next').click();
  }
  check('AI mixed-NIC: all steps appeared (rails + FE/storage NIC)', picks.every(p => p.done), picks.filter(p => !p.done).map(p => String(p.q)).join(','));
  check('AI mixed-NIC: results rendered', !$('#results').hidden);
  const checksTxt = $('#tab-checks').textContent;
  check('AI mixed-NIC: rails override note (400G CX-7 over XE9780 default)', /GPU rails set to 400GbE/.test(checksTxt));
} catch (e) { check('AI mixed-NIC flow no exception', false, e.message); }

/* ---- DFM PITCH tab: BOM-scaled script + outline toggle ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'powerstore'; $('#f-units').value = '6';
  addTarget('poweredge-general', '20');
  $('#f-verity').checked = true;
  $('#btn-generate').click();
  const sw = win.UI.last.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && !/NVIDIA/i.test(b.vendor || '')).reduce((s, b) => s + b.qty, 0);
  check('pitch: tab button present', !!d.querySelector('[data-tab="pitch"]'));
  d.querySelector('[data-tab="pitch"]').click();   // CLICK the tab like a user would
  check('pitch: tab body actually becomes visible on click', $('#tab-pitch').hidden === false && $('#tab-bom').hidden === true);
  const pitchEl = $('#tab-pitch');
  check('pitch: script rendered with BOM-scaled switch count', new RegExp('design is <b>' + sw + ' switches</b>').test(pitchEl.innerHTML));
  check('pitch: EASY mode default — plain language, no jargon', /configure themselves/.test(pitchEl.textContent) && !/Time Traveler|telemetry|ZTP/.test($('#pitch-script').textContent));
  check('pitch: three functions present', /Automation\./.test(pitchEl.textContent) && /Observability\./.test(pitchEl.textContent) && /AIOps\./.test(pitchEl.textContent));
  check('pitch: value-add block always present (easy)', /💎/.test(pitchEl.textContent) && /value add/i.test(pitchEl.textContent));
  check('pitch: proof + closer present', /EXEO/.test(pitchEl.textContent) && /hardware fixes speed/i.test(pitchEl.textContent));
  $('#pitch-depth-tech').click();
  const techTxt = $('#pitch-script').textContent;
  check('pitch: TECH mode — real terms present', /Time Traveler/.test(techTxt) && /zero-touch provisioning/i.test(techTxt) && /ML-learned/.test(techTxt));
  check('pitch: TECH mode — every term glossed with meaning + impact', /in plain terms:/.test(techTxt) && /why it matters:/.test(techTxt));
  check('pitch: value-add block always present (tech)', /💎/.test(techTxt) && /value add/i.test(techTxt));
  $('#pitch-mode-outline').click();
  check('pitch: outline mode toggles (tech)', $('#pitch-outline').hidden === false && $('#pitch-script').hidden === true && new RegExp('WHAT\'S IN THIS QUOTE — "' + sw + '"').test($('#pitch-outline').textContent) && /💎 VALUE ADD/.test($('#pitch-outline').textContent));
  $('#pitch-depth-easy').click();
  check('pitch: outline follows depth (easy)', /walks the team through the fix/.test($('#pitch-outline').textContent) && !/Terraform/.test($('#pitch-outline').textContent));
  $('#pitch-mode-script').click();
  check('pitch: back to script', $('#pitch-script').hidden === false);
  check('pitch: no SmartFabric Manager bleed', !/SmartFabric/i.test(pitchEl.textContent));
} catch (e) { check('pitch tab no exception', false, e.message); }

/* ---- DISCOVERY ---- */
try {
  reset();
  $('.mode-btn[data-mode="discovery"]').click();
  check('discovery: wizard shown', !$('#wizard').hidden);
  walkWizard(30);
  check('discovery: results rendered', !$('#results').hidden);
  check('discovery: guidance tab shown', !$('#tab-btn-guidance').hidden);
  check('discovery: guidance populated', /g-card/.test($('#tab-guidance').innerHTML) && /Verity/.test($('#tab-guidance').innerHTML));
  check('discovery: starting BOM present', $('#tab-bom tbody').children.length > 0);
} catch (e) { check('discovery flow no exception', false, e.message); }

/* ---- NEW: Discovery mode, "Edge / campus / IoT" workload must route to recommendEdge()
 * (E-series access switches), not silently fall through to a general PowerEdge leaf-spine BOM.
 * The guidance text always correctly mentioned E3248PXE-ON/E3224F-ON — only the BOM was wrong. */
try {
  reset();
  $('.mode-btn[data-mode="discovery"]').click();
  check('discovery-edge: wizard shown', !$('#wizard').hidden);
  let pickedEdge = false;
  for (let i = 0; i < 30; i++) {
    if (!$('#results').hidden && $('#wizard').hidden) break;
    if ($('#wizard').hidden) break;
    if (!pickedEdge) {
      const opts = [...d.querySelectorAll('#wizard .wiz-opt')];
      const edgeBtn = opts.find(b => /Edge \/ campus \/ IoT/i.test(b.textContent));
      if (edgeBtn) { edgeBtn.click(); pickedEdge = true; continue; }
    }
    $('#wiz-next').click();
  }
  check('discovery-edge: found and selected the Edge/IoT workload option', pickedEdge);
  check('discovery-edge: results rendered', !$('#results').hidden);
  const bom = $('#tab-bom').innerHTML;
  check('discovery-edge: BOM contains E-series access switches', /E3224F|E3248P/.test(bom));
  check('discovery-edge: BOM is NOT a general PowerEdge leaf-spine build', !/Z9432F|Z9664F|Z9864F|Z9964F/.test(bom));
} catch (e) { check('discovery edge/IoT flow no exception', false, e.message); }

/* ---- REFERENCE ARCHITECTURE ---- */
try {
  reset();
  $('.mode-btn[data-mode="ra"]').click();
  const raSel = $('#f-ra'); raSel.value = raSel.options[0].value;
  raSel.dispatchEvent(new win.Event('change'));
  $('#btn-ra-generate').click();
  check('RA: results rendered', !$('#results').hidden);
  check('RA: endorsement banner present', /ra-banner/.test($('#tab-bom').innerHTML));
  check('RA: SN5610 in BOM', /SN5610/.test($('#tab-bom').innerHTML));
} catch (e) { check('RA flow no exception', false, e.message); }

/* ---- EXPERT + Verity ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-ai';
  $('#f-stack').value = 'nvidia';
  $('#f-verity').checked = true;
  $('#btn-generate').click();
  check('expert: results rendered', !$('#results').hidden);
  check('expert: DFM line present when toggled', /Dell Fabric Manager \(DFM\)/.test($('#tab-bom').innerHTML));
  check('expert: switch capability reference present', /switch-ref/.test($('#tab-bom').innerHTML));
} catch (e) { check('expert flow no exception', false, e.message); }

/* ---- COMBINED targets (storage + servers) ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'powerstore'; $('#f-units').value = '6';
  const addedRow = addTarget('poweredge-general', '20', { nicSpeed: '100GbE', nicPorts: '4' });   // spec the ADDED target exactly
  check('combined: added-target row carries its own NIC fields', !!addedRow.querySelector('.t-nic-speed') && !!addedRow.querySelector('.t-nic-ports'));
  $('#btn-generate').click();
  const bom = $('#tab-bom').innerHTML, topo = $('#tab-topology').innerHTML, bomTxt = $('#tab-bom').textContent;
  check('combined: results rendered', !$('#results').hidden);
  check('combined: both targets present', /PowerStore/.test(bom) && /PowerEdge/.test(bom));
  check('combined: shared spine (leaf-spine triggered)', /Shared spine|Z9432|Z9664/.test($('#tab-bom').textContent));
  check('combined: topology shows both targets', /PowerStore/.test(topo) && /PowerEdge/.test(topo));
  check('combined: added-target spec lands (20×4 = 80 links @ 100G)', /80 link\(s\) \(4\/unit × 20\)/.test(bomTxt));
} catch (e) { check('combined flow no exception', false, e.message); }

/* ---- AI Dell stack: no NVIDIA switches ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-ai'; $('#f-units').value = '8';
  $('#f-stack').value = 'dell'; $('#f-gpus').value = '8';
  $('#btn-generate').click();
  const bom = $('#tab-bom').innerHTML;
  check('AI Dell-stack: results rendered', !$('#results').hidden);
  check('AI Dell-stack: no NVIDIA switches (no mixing)', !/SN4700|SN5610|SN2201/.test(bom));
} catch (e) { check('AI stack flow no exception', false, e.message); }

/* ---- NEW: optics/cabling + sizing + brownfield (expert form) ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'powerstore'; $('#f-units').value = '8';
  addTarget('poweredge-general', '40');
  $('#f-placement').value = 'structured'; $('#f-breakout').value = 'on';
  $('#f-traffic').value = 'ew'; $('#f-roadmap').value = '100-400';
  $('#f-deploy').value = 'add'; $('#f-reuse').checked = true;
  $('#btn-generate').click();
  const bom = $('#tab-bom').innerHTML, topo = $('#tab-topology').innerHTML, checks = $('#tab-checks').innerHTML;
  check('optics: results rendered', !$('#results').hidden);
  check('optics: structured cabling reflected in BOM', /STRUCTURED/.test(bom));
  check('optics: breakout line present', /BREAKOUT|4x100/i.test(bom));
  check('topology: every-connection link-count labels present', /links =/.test(topo));
  check('sizing: oversubscription/uplinks surfaced in checks', /uplinks\/leaf|oversubscription/i.test(checks));
  check('sizing: speed-migration roadmap surfaced in checks', /roadmap/i.test(checks));
  check('brownfield: add-to-existing surfaced in checks', /incremental/i.test(checks));
} catch (e) { check('optics/sizing flow no exception', false, e.message); }

/* ---- NEW: 1G/10G Base-T (copper) NIC option — a distinct physical media, not just a speed ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '30';
  $('#f-nic-vendor').value = 'intel'; $('#f-nic-speed').value = '10GBase-T'; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '2';
  $('#f-placement').value = 'in-rack'; $('#f-breakout').value = 'auto'; $('#f-deploy').value = 'new'; $('#f-reuse').checked = false;
  $('#btn-generate').click();
  const bom = $('#tab-bom').innerHTML;
  check('basetnic: results rendered', !$('#results').hidden);
  check('basetnic: native RJ45 leaf + Cat6A patch cable in BOM (not a fiber leaf + SFP module)', /S4348T-ON/.test(bom) && /Cat6A/i.test(bom) && !/SFP-10G-T/.test(bom));
  check('basetnic: no silent 25G/DAC substitution', !/DAC-SFP-10G-xM/.test(bom));
} catch (e) { check('base-T NIC flow no exception', false, e.message); }

/* ---- NEW: Expert Form's "second NIC type" (nicb) purpose selector — this UI is entirely
 * separate from the Guided wizard's nic2 fields (own #f-nicb-* inputs in app.js), and was found
 * (independent review, 2026-07-15) to still hardcode network:'storage' with no way to say
 * otherwise — confirm the fix actually reaches this second, easy-to-miss entry point too. ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '20';
  // Reset the PRIMARY NIC fields too — an earlier test in this file (basetnic, above) leaves
  // #f-nic-speed set to '10GBase-T' and never resets it; without this, the primary fabric here
  // silently isn't the platform-default 25GbE this test's assertions assume (same test-isolation
  // trap documented for the converged-fabric round: field VALUES persist across tests in this
  // file's single shared document — reset()/clearTargets() don't touch them).
  $('#f-nic-vendor').value = 'broadcom'; $('#f-nic-speed').value = ''; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '2';
  $('#f-nicb-speed').value = '25GbE'; $('#f-nicb-ports').value = '2';
  const hasNicbNetwork = !!$('#f-nicb-network');
  check('expert second-NIC: purpose selector exists in the form', hasNicbNetwork);
  if (hasNicbNetwork) {
    $('#f-nicb-network').value = 'frontend';
    $('#btn-generate').click();
    const bom2 = $('#tab-bom').innerHTML;
    check('expert second-NIC: results rendered', !$('#results').hidden);
    // Both the primary NIC (platform default) and the second NIC are 25GbE on the same
    // platform/family — a "frontend" fabric note reads "...general-purpose) frontend (25GbE)";
    // that exact pattern appearing TWICE (once per fabric) means neither got mislabeled storage.
    // Checking a specific note pattern (not a bare "storage" substring) avoids false positives
    // from unrelated glossary/tooltip copy that also happens to mention "storage" generically.
    const frontendHits = (bom2.match(/general-purpose\) frontend \(25GbE\)/gi) || []).length;
    const storageHits = (bom2.match(/general-purpose\) storage \(25GbE\)/gi) || []).length;
    check('expert second-NIC: stated "frontend" purpose is honored, not forced to storage', frontendHits === 2 && storageHits === 0, `frontend:${frontendHits} storage:${storageHits}`);
  }
  // Reset — these fields are NOT cleared by reset()/clearTargets() (only field VALUES persist
  // across tests in this file's single shared document) and would otherwise silently leak a
  // phantom second NIC into every test that runs after this one.
  $('#f-nicb-speed').value = ''; $('#f-nicb-ports').value = ''; if (hasNicbNetwork) $('#f-nicb-network').value = 'storage';
} catch (e) { check('expert second-NIC purpose flow no exception', false, e.message); }

/* ---- NEW: guided wizard includes the cabling + sizing questions ---- */
try {
  reset();
  $('.mode-btn[data-mode="guided"]').click();
  let sawPlacement = false, sawTraffic = false, sawSummary = false;
  for (let i = 0; i < 40; i++) {
    if ($('#wizard').hidden) break;
    const q = $('#wiz-step').innerHTML;
    if (/switches sit relative/i.test(q)) sawPlacement = true;
    if (/traffic pattern/i.test(q)) sawTraffic = true;
    if (i >= 2 && !$('#wiz-summary').hidden && /wiz-sum-row/.test($('#wiz-summary').innerHTML)) sawSummary = true;
    $('#wiz-next').click();
  }
  check('guided: cabling placement question present', sawPlacement);
  check('guided: traffic-pattern (oversub) question present', sawTraffic);
  check('guided: running "solution so far" overview populates', sawSummary);
} catch (e) { check('guided cabling/sizing questions no exception', false, e.message); }

/* ---- NEW: model drill-down (expert) — XE9780 Blackwell 800G ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-ai'; $('#f-platform').dispatchEvent(new win.Event('change'));
  check('drill-down: model dropdown populates for AI', $('#f-model').options.length > 3 && !$('#f-model-wrap').style.display.includes('none'));
  $('#f-model').value = 'xe9780'; $('#f-stack').value = 'nvidia'; $('#f-gpus').value = '8'; $('#f-units').value = '8';
  $('#f-placement').value = 'in-rack';
  $('#btn-generate').click();
  const bom = $('#tab-bom').innerHTML;
  check('drill-down: XE9780 renders 800G + SN5610 + NVIDIA LinkX', /XE9780/.test(bom) && /SN5610/.test(bom) && /NVIDIA LinkX/.test(bom));
} catch (e) { check('drill-down flow no exception', false, e.message); }

/* ---- NEW: GB300 NVL72 reference architecture generates ---- */
try {
  reset();
  $('.mode-btn[data-mode="ra"]').click();
  const raSel = $('#f-ra'); const opt = [...raSel.options].find(o => /NVL72/.test(o.textContent));
  check('RA: GB300 NVL72 present in dropdown', !!opt);
  if (opt) { raSel.value = opt.value; raSel.dispatchEvent(new win.Event('change')); $('#btn-ra-generate').click(); check('RA: NVL72 generates a BOM', !$('#results').hidden && /NVL72|GB300/.test($('#tab-bom').innerHTML)); }
} catch (e) { check('NVL72 RA flow no exception', false, e.message); }

/* ---- NEW: edge / access mode ---- */
try {
  reset();
  $('.mode-btn[data-mode="edge"]').click();
  check('edge: mode shown', !$('#edge-mode').hidden);
  $('#e-endpoints').value = '192'; $('#e-poe').value = 'poe++'; $('#e-speed').value = 'mgig';
  $('#btn-edge-generate').click();
  const bom = $('#tab-bom').innerHTML, topo = $('#tab-topology').innerHTML;
  check('edge: results rendered', !$('#results').hidden);
  check('edge: E-series MC-LAG pairs + S5232F distribution + MC-LAG ICL in BOM', /E3248PXE/.test(bom) && /S5232F/.test(bom) && /MC-LAG ICL/.test(bom) && !/VLTi/.test(bom));
  check('edge: campus topology renders (ACCESS/DISTRIB labels, no SERVERS/SPINE)', /<svg/.test(topo) && /ACCESS/.test(topo) && !/SERVERS/.test(topo) && !/SPINE/.test(topo));
} catch (e) { check('edge flow no exception', false, e.message); }

/* ---- NEW: draw.io export — every switch & connection as editable objects ---- */
try {
  const res = win.recommend({ platformId: 'powerscale', units: 40, redundancy: 'dual', includeMgmt: true });
  const xml = win.UI.buildDrawioXml(res);
  const pdoc = new win.DOMParser().parseFromString(xml, 'text/xml');
  check('drawio: well-formed XML', !pdoc.querySelector('parsererror') && pdoc.querySelectorAll('mxCell').length > 4);
  const vertices = [...pdoc.querySelectorAll('mxCell[vertex="1"]')], edges = [...pdoc.querySelectorAll('mxCell[edge="1"]')];
  // a switch label now lives on the wrapping <object>; read that (fallback to mxCell value)
  const labelOf = v => (v.parentNode && v.parentNode.getAttribute && v.parentNode.getAttribute('label')) || v.getAttribute('value') || '';
  const data = res.fabrics.filter(f => f.network !== 'mgmt');
  const totalLeaves = data.reduce((s, f) => s + f.totalLeaves, 0);
  const leafCells = vertices.filter(v => { const l = labelOf(v); return data.some(f => l.includes(f.leaf.model) && /A\d+|B\d+|L\d+/.test(l)); });
  check('drawio: EVERY leaf switch is a vertex (uncapped)', leafCells.length === totalLeaves, `cells ${leafCells.length} vs leaves ${totalLeaves}`);
  const minUplinks = data.reduce((s, f) => s + (f.spine ? f.totalLeaves * (f.spineCount || 0) : 0), 0);
  check('drawio: full leaf→spine mesh present as edges', edges.length >= minUplinks, `edges ${edges.length} < mesh ${minUplinks}`);
  // PRO-GRADE upgrades: layers, shape metadata, orthogonal routing
  check('drawio: layers defined (Spines/Leaves/Hosts/OOB/Cabling)', /id="lyr-spine"/.test(xml) && /id="lyr-leaf"/.test(xml) && /id="lyr-cabling"/.test(xml));
  check('drawio: switches carry shape data (Model/Role/Ports)', /Model="/.test(xml) && /Role="/.test(xml) && /Ports="/.test(xml));
  check('drawio: edges use orthogonal routing', /orthogonalEdgeStyle/.test(xml));
  check('drawio: title block present', /Dell Networking Topology/.test(xml) && /verify part numbers/.test(xml));
} catch (e) { check('drawio export no exception', false, e.message); }

/* ---- NEW: PROMPT-2 PR5 5c — breakout links are visually/textually distinct in BOTH
 * renderTopology (dashed stroke + ratio/cable-class label) and buildDrawioXml (dashed edge +
 * label), sourced from the engine's uplinkBreakout/superSpineBreakout fields, never recomputed
 * client-side. wayBig-class AI hits a breakout on both the leaf<->spine AND super-spine hops. */
try {
  const res = win.recommend({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  win.UI.render(res, null);
  const svg = win.document.querySelector('#tab-topology svg').outerHTML;
  check('topology: breakout uplink label shows ratio + spine-port speed', /×\d+GbE breakout \(\d+GbE spine ports\)/.test(svg));
  check('topology: breakout uplinks drawn dashed (visually distinct from native)', /stroke-dasharray="7 3"/.test(svg));
  const xml = win.UI.buildDrawioXml(res);
  check('drawio: breakout uplink edge label shows ratio + spine-port speed', /\(\d+×\d+GbE breakout, \d+GbE spine ports\)/.test(xml));
  check('drawio: breakout edges dashed (dashed=1 on the same edge style)', /strokeColor=[^;]*;strokeWidth=[^;]*;dashed=1;/.test(xml));

  // a small flat 2-tier design has NO breakout anywhere — the label/dash must NOT appear
  const flat = win.recommend({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true });
  win.UI.render(flat, null);
  const flatSvg = win.document.querySelector('#tab-topology svg').outerHTML;
  check('topology: flat design has no breakout dashing on uplinks', !/stroke-dasharray="7 3"/.test(flatSvg));
} catch (e) { check('breakout link-fidelity no exception', false, e.message); }

/* ---- NEW: export download fallback — sandboxed/restricted contexts (or any browser API
 * failure) where the normal <a download> click is silently swallowed must show an on-page
 * fallback with the raw content, not fail invisibly. jsdom itself lacks URL.createObjectURL,
 * which exercises the exact "the native download path throws" case this fallback exists for. */
try {
  const res = win.recommend({ platformId: 'powerscale', units: 40, redundancy: 'dual', includeMgmt: true });
  const before = win.document.querySelectorAll('.export-fallback-backdrop').length;
  win.UI.exportDrawio(res);   // must NOT throw even though jsdom has no URL.createObjectURL
  const backs = win.document.querySelectorAll('.export-fallback-backdrop');
  check('export fallback: shown when native download is unavailable', backs.length === before + 1);
  const ta = backs[backs.length - 1] && backs[backs.length - 1].querySelector('textarea');
  check('export fallback: textarea holds the real exported content', !!ta && ta.value.length > 500 && /mxfile/.test(ta.value));
  backs.forEach(b => b.querySelector('[data-act="close"]').click());
  check('export fallback: close button removes the panel', win.document.querySelectorAll('.export-fallback-backdrop').length === 0);
} catch (e) { check('export fallback no exception', false, e.message); }

/* ---- NEW: BOM-aware Verity value card ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'powerstore'; $('#f-platform').dispatchEvent(new win.Event('change'));
  $('#f-units').value = '6'; $('#f-verity').checked = true;
  $('#btn-generate').click();
  const bomEl = $('#tab-bom');
  check('verity: default ON in expert form', d.querySelector('#f-verity').checked === true);
  check('verity: BOM-aware DFM card rendered', /verity-card/.test(bomEl.innerHTML) && /one platform, not \d+ consoles/.test(bomEl.textContent));
  check('verity: card counts MC-LAG pairs + ZTP day-1', /ZTP/i.test(bomEl.textContent) && /maintenance window|MC-LAG pair/i.test(bomEl.textContent));
  // nudge when Verity is off
  $('#f-verity').checked = false; $('#btn-generate').click();
  check('verity: nudge shown when omitted', /verity-nudge/.test($('#tab-bom').innerHTML) && /belongs on this quote/.test($('#tab-bom').textContent));
  // full-NVIDIA: scoped bullet
  $('#f-platform').value = 'poweredge-ai'; $('#f-platform').dispatchEvent(new win.Event('change'));
  $('#f-stack').value = 'nvidia'; $('#f-verity').checked = true; $('#btn-generate').click();
  check('verity: NVIDIA scope bullet on mixed/full-NVIDIA designs', /Scope:/.test($('#tab-bom').textContent) && /Cumulus/.test($('#tab-bom').textContent));
} catch (e) { check('verity card no exception', false, e.message); }

/* ---- NEW: network refresh journey ---- */
try {
  reset();
  $('.mode-btn[data-mode="refresh"]').click();
  check('refresh: wizard shown', !$('#wizard').hidden);
  walkWizard(20);
  check('refresh: results rendered', !$('#results').hidden);
  const bomTxt = $('#tab-bom').textContent, checksTxt = $('#tab-checks').textContent;
  check('refresh: like-for-like REFRESH BOM present', /REFRESH access/.test(bomTxt));
  check('refresh: migration guidance in checks', /rack-by-rack/.test(checksTxt));
} catch (e) { check('refresh flow no exception', false, e.message); }

/* ---- NEW: unlimited additional attach targets (expert form) — the real-world shape:
 * one big pool + several small pools on the SAME platform + two storage platforms. ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '50';
  addTarget('poweredge-general', '2'); addTarget('poweredge-general', '2'); addTarget('poweredge-general', '2');
  addTarget('poweredge-general', '2'); addTarget('poweredge-general', '2');
  addTarget('powerstore', '3', { model: 'ps5200' });
  addTarget('powerscale', '6', { model: 'f710' });
  check('unlimited targets: 7 rows added to the form', d.querySelectorAll('#extra-targets .target-row').length === 7);
  $('#btn-generate').click();
  check('unlimited targets: results rendered', !$('#results').hidden);
  check('unlimited targets: all 8 targets reached the engine', win.UI.last.targets.length === 8, win.UI.last.targets && win.UI.last.targets.length);
  const utids = win.UI.last.targets.map(t => t.uid);
  check('unlimited targets: every target instance has a unique uid', new Set(utids).size === 8, utids.join(','));
  const utopo = $('#tab-topology');
  check('unlimited targets: topology draws one host box per target (not collapsed by shared platform)', utopo.querySelectorAll('[data-role="host"]').length === 8, utopo.querySelectorAll('[data-role="host"]').length);
  check('unlimited targets: PowerStore + PowerScale both present in BOM', /PowerStore/.test($('#tab-bom').textContent) && /PowerScale/.test($('#tab-bom').textContent));
  check('unlimited targets: rack elevation renders without crashing', /<svg/.test($('#tab-rack').innerHTML));
  // remove a row and confirm the count drops
  d.querySelector('#extra-targets .target-row').remove();
  check('unlimited targets: remove button drops a row', d.querySelectorAll('#extra-targets .target-row').length === 6);
  clearTargets();
} catch (e) { check('unlimited targets (expert) no exception', false, e.message); }

/* ---- NEW: converged fabric architecture (2026-07-13, user-directed) — Expert form ----
 * The customer-intent question (was a misleading "share one fabric?" checkbox that only
 * shared the SPINE, never the leaf) end-to-end through the real form. */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  // explicitly reset the global NIC fields (an earlier test may have left #f-nic-speed set to
  // something like '10GBase-T') — the primary target must stay at its platform default (25GbE)
  // to actually SHARE a speed class with PowerStore's own 25GbE default; a leftover mismatch
  // would correctly (and misleadingly, for this test) prevent the merge on physical grounds.
  $('#f-nic-vendor').value = 'broadcom'; $('#f-nic-speed').value = ''; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '2';
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '12';
  addTarget('powerstore', '3');
  $('#f-storage-proto').value = 'nvme-tcp';
  check('converged (expert): architecture select exists with the right options', ['converged', 'sharedSpine', 'separate'].every(v => [...$('#f-fabricarch').options].some(o => o.value === v)));
  $('#f-fabricarch').value = 'sharedSpine';
  $('#btn-generate').click();
  const sharedLeaves = (win.UI.last.fabrics || []).filter(f => f.network !== 'mgmt').reduce((s, f) => s + f.totalLeaves, 0);
  check('converged (expert): sharedSpine default matches prior behavior (2 separate leaf fabrics)', win.UI.last.fabrics.filter(f => f.network !== 'mgmt').length === 2);

  $('#f-fabricarch').value = 'converged';
  $('#btn-generate').click();
  const convFabrics = win.UI.last.fabrics.filter(f => f.network !== 'mgmt');
  check('converged (expert): frontend + storage merge into ONE leaf fabric', convFabrics.length === 1, convFabrics.map(f => f.network));
  check('converged (expert): fewer total leaves than sharedSpine mode', convFabrics.reduce((s, f) => s + f.totalLeaves, 0) < sharedLeaves);
  check('converged (expert): BOM/topology/rack/checks all render without exception', !$('#results').hidden && /<svg/.test($('#tab-topology').innerHTML) && /<svg/.test($('#tab-rack').innerHTML));
  check('converged (expert): topology shows a CONVERGED fabric label', /CONVERGED/.test($('#tab-topology').textContent));
  let drawio = '', oooText = '', fullText = '', copyThrew = null;
  try { drawio = win.UI.buildDrawioXml(win.UI.last); oooText = win.UI.buildBOMText(win.UI.last, 'ooo'); fullText = win.UI.buildBOMText(win.UI.last, 'full'); } catch (e) { copyThrew = e.message; }
  check('converged (expert): draw.io / full copy / OOO copy all build without exception', copyThrew === null, copyThrew);
  check('converged (expert): draw.io mentions the converged fabric', /converged/i.test(drawio));
  check('converged (expert): OOO copy lists a sane switch total', /\d+ switches total\./.test(oooText), oooText);
  check('converged (expert): full copy names both contributing platforms', fullText.includes('CONVERGED') && fullText.includes('Server (general-purpose)') && fullText.includes('Block / Unified Storage'));
  clearTargets();
} catch (e) { check('converged fabric (expert) no exception', false, e.message); }

/* ---- NEW: converged fabric — guided wizard step is reachable, wired, and takes effect ---- */
try {
  reset();
  $('.mode-btn[data-mode="guided"]').click();
  let pickedAdd = false, pickedConverged = false;
  for (let i = 0; i < 80 && !$('#wizard').hidden; i++) {
    const q = ($('#wiz-step .wiz-q') || {}).textContent || '';
    if (/Also connecting servers or storage/.test(q) && !pickedAdd) {
      pickedAdd = true;
      const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => /add PowerStore/.test(b.textContent));
      if (btn) btn.click();
    } else if (/Add another attach target/.test(q)) {
      const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => /No —/.test(b.textContent));
      if (btn) btn.click();
    } else if (/share the same switches as compute/.test(q)) {
      pickedConverged = true;
      const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => /Converged — one fabric/.test(b.textContent));
      if (btn) btn.click();
    }
    $('#wiz-next').click();
  }
  check('converged (guided): reached the network-architecture step', pickedConverged);
  check('converged (guided): results rendered', !$('#results').hidden);
  const gFabrics = (win.UI.last.fabrics || []).filter(f => f.network !== 'mgmt');
  check('converged (guided): picking Converged actually merged the fabrics', gFabrics.length === 1 && gFabrics[0].converged === true, gFabrics.map(f => f.network + ':' + !!f.converged));
} catch (e) { check('converged fabric (guided) no exception', false, e.message); }

/* ---- REGRESSION (independent review, 2026-07-13): single-rack view must draw host-to-leaf
 * cabling for a converged fabric. Host boxes carry each contributor's REAL target uid, but a
 * converged fabric's OWN targetUid is synthetic — the cabling-path filter used to match only
 * the synthetic key, so it silently found zero hosts and drew NO cabling at all (switches and
 * hosts both present, nothing connecting them). ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-nic-vendor').value = 'broadcom'; $('#f-nic-speed').value = ''; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '2';
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '8';
  addTarget('powerstore', '4');
  $('#f-storage-proto').value = 'nvme-tcp';
  $('#f-fabricarch').value = 'converged';
  $('#btn-generate').click();
  const rackPaths = $('#tab-rack').querySelectorAll('svg path');
  check('converged (single-rack view): host-to-leaf cabling is actually drawn', rackPaths.length > 0, rackPaths.length);
  clearTargets();
} catch (e) { check('converged single-rack cabling no exception', false, e.message); }

/* ---- REGRESSION (independent review, 2026-07-13): multi-rack elevation must not draw a
 * nameless placeholder switch pair for a rack-spanning target whose fabric got merged (and is
 * HOSTED/drawn in a different rack's frame) — it used to fall back to two generic "ToR A"/
 * "ToR B" boxes with no model, overstating the hardware; it should show a cross-reference note
 * instead, matching the (already-correct) non-spanning branch's behavior. ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  $('#f-nic-vendor').value = 'broadcom'; $('#f-nic-speed').value = ''; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '2';
  $('#f-platform').value = 'powerstore'; $('#f-units').value = '4';
  addTarget('poweredge-general', '200');
  $('#f-storage-proto').value = 'nvme-tcp';
  $('#f-fabricarch').value = 'converged';
  $('#f-racks').value = '4';
  $('#btn-generate').click();
  const rackTexts = [...$('#tab-rack').querySelectorAll('svg text')].map(t => t.textContent);
  check('converged multi-rack elevation: no nameless placeholder switches', !rackTexts.some(t => t === 'ToR (ToR A)' || t === 'ToR (ToR B)'), rackTexts.filter(t => /^ToR /.test(t)));
  check('converged multi-rack elevation: cross-reference note points to the hosting rack', rackTexts.some(t => /^Shares .*converged.*see another rack/.test(t)), rackTexts.filter(t => /Shares/.test(t)));
  clearTargets();
} catch (e) { check('converged multi-rack cross-reference no exception', false, e.message); }

/* ---- NEW: guided wizard — unlimited "add another target" loop (not just one) ---- */
try {
  reset();
  $('.mode-btn[data-mode="guided"]').click();
  const wants = ['poweredge-general', 'poweredge-general', 'powerstore'];
  let addedCount = 0;
  for (let i = 0; i < 150 && !$('#wizard').hidden; i++) {
    const q = ($('#wiz-step .wiz-q') || {}).textContent || '';
    if (/Also connecting servers or storage/.test(q) && addedCount < wants.length) {
      const label = wants[addedCount] === 'powerstore' ? /add PowerStore/ : /add PowerEdge servers/;
      const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => label.test(b.textContent));
      if (btn) btn.click();
    } else if (/Add another attach target/.test(q)) {
      addedCount++;
      const wantMore = addedCount < wants.length;
      const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => (wantMore ? /Yes — add another/ : /No —/).test(b.textContent));
      if (btn) btn.click();
    }
    $('#wiz-next').click();
  }
  check('guided loop: reached "add another target" at least 3 times', addedCount >= 3, addedCount);
  check('guided loop: results rendered', !$('#results').hidden);
  const gt = win.UI.last.targets || [];
  check('guided loop: 4 targets total reached the engine (1 primary + 3 added)', gt.length === 4, gt.length);
  check('guided loop: topology shows 4 host boxes', $('#tab-topology').querySelectorAll('[data-role="host"]').length === 4);
} catch (e) { check('guided unlimited-target loop no exception', false, e.message); }

/* ---- NEW: guided wizard — "solution so far" panel lists each added target mid-flow ---- */
try {
  reset();
  $('.mode-btn[data-mode="guided"]').click();
  let sawAdded1 = false, sawAdded2 = false;
  for (let i = 0; i < 60 && !$('#wizard').hidden; i++) {
    const q = ($('#wiz-step .wiz-q') || {}).textContent || '';
    if (/Also connecting servers or storage/.test(q)) {
      const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => /add PowerStore/.test(b.textContent));
      if (btn) btn.click();
    } else if (/Add another attach target/.test(q)) {
      if (!sawAdded1) { sawAdded1 = /Added target 1/.test($('#wiz-summary').textContent); }
      const btn = [...d.querySelectorAll('#wiz-step .wiz-opt')].find(b => (!sawAdded2 ? /Yes — add another/ : /No —/).test(b.textContent));
      if (btn) btn.click();
      if (!sawAdded2 && sawAdded1) sawAdded2 = true;
    }
    $('#wiz-next').click();
  }
  check('guided loop: "solution so far" panel lists a committed added target', sawAdded1);
  check('guided loop: results rendered after two loops', !$('#results').hidden);
} catch (e) { check('guided summary-panel added-targets no exception', false, e.message); }

/* ---- NEW: 3-tier Clos (super-spine) — a design too large for a flat 2-tier fabric ---- */
try {
  reset();
  $('.mode-btn[data-mode="expert"]').click();
  clearTargets();
  // full reset — earlier blocks in this file leave the expert form in whatever state their own
  // scenario needed; this test must run on clean defaults to be deterministic.
  // 2000 -> 5000 (2026-07-15, G-007 follow-up): the 3-tier trigger now correctly credits the
  // spine's real (catalog-validated) uplink breakout instead of just its raw native port count,
  // so 2000 units (54 leaves, fits the breakout-credited radix) no longer needs — or builds — a
  // super-spine. 5000 is the smallest round number under these exact form settings that still
  // genuinely exceeds even the breakout-credited capacity.
  $('#f-platform').value = 'poweredge-general'; $('#f-units').value = '5000';
  $('#f-nic-vendor').value = 'broadcom'; $('#f-nic-speed').value = ''; $('#f-nic-ports').value = '2'; $('#f-nic-count').value = '2';
  $('#f-racks').value = '1'; $('#f-leaf100').value = 'auto';
  $('#f-redundancy').value = 'dual'; $('#f-growth').value = '0.25';
  $('#f-placement').value = 'in-rack'; $('#f-structured').checked = false; $('#f-breakout').value = 'auto';
  $('#f-fabstyle').value = 'mclag'; $('#f-storage-proto').value = '';
  $('#f-traffic').value = 'balanced'; $('#f-roadmap').value = 'none';
  $('#f-deploy').value = 'new'; $('#f-reuse').checked = true;
  $('#f-nos').value = 'sonic'; $('#f-fabricarch').value = 'sharedSpine'; $('#f-core').checked = false;
  $('#btn-generate').click();
  check('3-tier: results rendered', !$('#results').hidden);
  const res3 = win.UI.last;
  const f3 = res3.fabrics.find(x => x.network === 'frontend');
  check('3-tier: engine actually built a super-spine (not just warned)', !!(f3 && f3.superSpine), f3 && f3.superSpine);
  check('3-tier: no hard errors', !res3.warnings.some(w => w.severity === 'error'), res3.warnings.filter(w => w.severity === 'error').map(w => w.message).join(' | '));
  const bomTxt3 = $('#tab-bom').textContent;
  check('3-tier: BOM shows separate Pod-spine and Super-spine lines', /Pod-spine/.test(bomTxt3) && /Super-spine/.test(bomTxt3));
  check('3-tier: checks tab explains the 3-tier build', /3-TIER CLOS/.test($('#tab-checks').textContent));
  const topo3 = $('#tab-topology');
  check('3-tier: topology draws a super-spine tier', topo3.querySelectorAll('[data-role="superspine"]').length > 0);
  check('3-tier: topology super-spine tier label present', /SUPER-|SPINE/.test(topo3.textContent));
  check('3-tier: rack elevation renders without crashing', /<svg/.test($('#tab-rack').innerHTML));
  const xml3 = win.UI.buildDrawioXml(res3);
  const pdoc3 = new win.DOMParser().parseFromString(xml3, 'text/xml');
  check('3-tier: draw.io export is well-formed XML', !pdoc3.querySelector('parsererror'));
  check('3-tier: draw.io has a dedicated Super-Spines layer with the right vertex count', pdoc3.querySelectorAll('mxCell[parent="lyr-superspine"][vertex="1"]').length === f3.superSpineCount);
  check('3-tier: draw.io pod-spine vertex count matches totalPodSpines (every pod, uncapped)', pdoc3.querySelectorAll('mxCell[parent="lyr-spine"][vertex="1"]').length === f3.totalPodSpines);
  $('#f-units').value = '4'; $('#f-traffic').value = 'balanced';
} catch (e) { check('3-tier Clos no exception', false, e.message); }

console.log('\n' + (fails.length ? `FAILED: ${fails.length}` : 'ALL DOM TESTS PASSED'));
process.exit(fails.length ? 1 : 0);
