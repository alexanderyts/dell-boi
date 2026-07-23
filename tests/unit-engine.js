/* =============================================================================
 * UNIT TESTS — engine math, boundaries, and input hardening.
 * Plain-English intent per test. Run: node tests/unit-engine.js
 * ========================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
['js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
 'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
 'js/validate.js', 'js/engine.js', 'js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));

let pass = 0, fail = [];
const t = (name, cond, got) => { if (cond) { pass++; } else { fail.push(name + (got !== undefined ? '  → got: ' + JSON.stringify(got) : '')); } };
const rec = i => window.recommend(i);
const dataFabrics = r => r.fabrics.filter(f => f.network !== 'mgmt');

/* ---- input hardening: garbage in must never crash or produce nonsense ---- */
t('units: negative clamps to 1', rec({ platformId: 'powerstore', units: -5 }).context.units === 1);
t('units: string parses', rec({ platformId: 'powerstore', units: '12' }).context.units === 12);
t('units: NaN clamps to 1', rec({ platformId: 'powerstore', units: 'abc' }).context.units === 1);
t('units: absurd clamps to 100000', rec({ platformId: 'powerstore', units: 9e9 }).context.units === 100000);
t('racks: 0 clamps to 1', rec({ platformId: 'powerstore', units: 4, racks: 0 }).context.racks === 1);
t('racks: 9999 clamps to 200', rec({ platformId: 'powerstore', units: 4, racks: 9999 }).context.racks === 200);
t('headroom: 99 clamps to 2', rec({ platformId: 'powerstore', units: 4, growthHeadroom: 99 }).context.headroom === 2);
t('headroom: -1 clamps to 0', rec({ platformId: 'powerstore', units: 4, growthHeadroom: -1 }).context.headroom === 0);
t('oversub: 0.1 clamps to 1', rec({ platformId: 'poweredge-general', units: 4, oversubTarget: 0.1 }).context.oversubTarget === 1);
t('oversub: 50 clamps to 4', rec({ platformId: 'poweredge-general', units: 4, oversubTarget: 50 }).context.oversubTarget === 4);
t('unknown platform throws (not silent garbage)', (() => { try { rec({ platformId: 'nope' }); return false; } catch (e) { return /Unknown platform/.test(e.message); } })());
t('unknown leaf100 falls back to auto', rec({ platformId: 'powerstore', units: 4, leaf100: 'hack' }).context.leaf100 === 'auto');
t('unknown leaf25 falls back to auto', rec({ platformId: 'powerstore', units: 4, leaf25: 'hack' }).context.leaf25 === 'auto');
t('nic: garbage counts fall back sane', (() => { const r = rec({ platformId: 'poweredge-general', units: 4, nic: { portsPerNic: 'x', nicsPerUnit: 3 } }); const f = r.fabrics.find(x => x.nicOverride); return f && f.linksPerUnit === 6; })());
t('AI without stack throws with guidance', (() => { try { rec({ platformId: 'poweredge-ai', units: 2, gpusPerServer: 8 }); return false; } catch (e) { return /stack/i.test(e.message); } })());

/* ---- leaf-ladder boundaries (the FDC right-sizing must flip at EXACT edges) ---- */
const leafAt = (u, extra) => dataFabrics(rec(Object.assign({ platformId: 'poweredge-general', units: u, redundancy: 'dual', growthHeadroom: 0 }, extra)))[0].leaf.model;
t('25G ladder: 6 srv (12 links/fab) → S5212F', leafAt(12) === 'S5212F-ON', leafAt(12));           // 12*2/2=12
t('25G ladder: 13 links/fab → S5224F', leafAt(13) === 'S5224F-ON', leafAt(13));
t('25G ladder: 24 links/fab → S5224F', leafAt(24) === 'S5224F-ON', leafAt(24));
t('25G ladder: 25 links/fab → S5248F', leafAt(25) === 'S5248F-ON', leafAt(25));
const leaf100At = (u) => { const r = rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', growthHeadroom: 0, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 } }); return r.fabrics.find(f => f.nicOverride).leaf.model; };
t('100G ladder: 32 links/fab stays S5232F', leaf100At(32) === 'S5232F-ON', leaf100At(32));
t('100G ladder: 33 links/fab → S5448F', leaf100At(33) === 'S5448F-ON', leaf100At(33));

/* ---- leaf25 override — explicit preference wins over the auto ladder, and the leaf count/
   spine tier correctly re-derive around it (real bug this closes: user wanted S5248F-ON forced
   for a design where 'auto' would pick the denser S5296F-ON) ---- */
const leaf25At = (u, leaf25) => { const r = rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, leaf25 }); const f = r.fabrics.find(x => x.network === 'frontend'); return { model: f.leaf.model, leaves: f.totalLeaves, spine: f.spine && f.spine.model, spineCount: f.spineCount, errs: r.warnings.filter(w => w.severity === 'error').length }; };
(() => {
  const auto = leaf25At(120, 'auto'), forced = leaf25At(120, 's5248f');
  t('leaf25 auto picks S5296F-ON at this scale (baseline)', auto.model === 'S5296F-ON' && auto.leaves === 4, JSON.stringify(auto));
  t('leaf25:s5248f overrides the auto pick', forced.model === 'S5248F-ON', forced.model);
  t('leaf25:s5248f roughly doubles leaf count (half the port density)', forced.leaves === 8, forced.leaves);
  t('leaf25:s5248f still resolves a valid spine with no errors', !!forced.spine && forced.errs === 0, JSON.stringify(forced));
})();
(() => {
  // extreme override (S5212F-ON, 12 ports/leaf) at a scale the auto ladder would never pick it —
  // leaf count and spine tier must still scale to physically fit, not silently under-provision.
  const extreme = leaf25At(500, 's5212f');
  t('leaf25:s5212f forced at scale still produces a physically consistent design', extreme.model === 'S5212F-ON' && extreme.leaves > 60 && extreme.errs === 0, JSON.stringify(extreme));
})();

/* ---- oversubscription math is the H18364 formula, exactly ---- */
(() => {
  const r = rec({ platformId: 'poweredge-general', units: 90, redundancy: 'dual', growthHeadroom: 0.25, trafficProfile: 'balanced' });
  const f = dataFabrics(r)[0];
  if (!f.spine) { t('oversub formula: fabric has spine', false); return; }
  const linksPerLeaf = Math.ceil(f.perFabricLinks / f.leavesPerFabric);
  const upG = parseInt(f.uplinkSpeed, 10) * (/GbE/.test(f.uplinkSpeed) ? 1 : 1);
  const expect = Math.max(2, Math.ceil((linksPerLeaf * 25) / (upG * f.oversubTarget)));
  t('uplinks/leaf = ceil(accessBW / (uplinkSpeed × target))', f.uplinksPerLeaf >= Math.min(expect, 8), { got: f.uplinksPerLeaf, expect });
  t('reported oversub ≤ target when not port-limited', f.uplinkPortLimited || f.oversub <= f.oversubTarget + 0.01, f.oversub);
})();

/* ---- multi-rack math ---- */
(() => {
  const r = rec({ targets: [{ platformId: 'poweredge-general', units: 48 }, { platformId: 'powerstore', units: 4 }], racks: 3, redundancy: 'dual', includeMgmt: true });
  t('racksSpanned: 48 servers over 3 racks = 3', r.targets[0].racksSpanned === 3, r.targets[0].racksSpanned);
  t('racksSpanned: 4 appliances = 1 rack', r.targets[1].racksSpanned === 1, r.targets[1].racksSpanned);
  const prim = r.fabrics.find(f => f.perRack);
  t('per-rack fabric flagged + pair per rack', prim && prim.totalLeaves >= 6, prim && prim.totalLeaves);
})();

/* ---- ICL rules: ≥2 at 100G+, ≥4 sub-100G ---- */
(() => {
  const ps = dataFabrics(rec({ platformId: 'powerstore', units: 4, redundancy: 'dual' }))[0];   // 25G leaf, ToR pair
  t('sub-100G ICL = 4 per pair', ps.interconnectQty === 4 * ps.leavesPerFabric || /100/.test(ps.interconnectSpeed), { qty: ps.interconnectQty, spd: ps.interconnectSpeed });
})();

/* ---- breakout assemblies: ceil(uplinks / ratio) ---- */
(() => {
  // 400× 25G servers, breakout explicitly requested → Z-series 400G spine, 100G leaf uplinks →
  // 400G→4×100G breakouts. (breakout:'on' is explicit here since 'auto' now correctly prefers a
  // native-port Z9264F-ON spine — no breakout needed — whenever leaf count fits its 64-port radix;
  // this test is about the assembly-qty MATH, not which spine 'auto' picks.)
  const r = rec({ platformId: 'poweredge-general', units: 400, redundancy: 'dual', trafficProfile: 'balanced', breakout: 'on' });
  const f = dataFabrics(r).find(x => x.uplinkBreakout);
  if (f) {
    const line = r.bom.find(b => (b._mk || '').indexOf('brk|' + f.targetId) === 0);
    t('breakout assemblies = ceil(uplinkCables / ratio)', line && line.qty === Math.ceil(f.uplinkCableQty / f.uplinkBreakout.ratio), line && line.qty);
  } else t('mixed-speed shared spine produced a breakout', false, dataFabrics(r).map(x => x.uplinkSpeed).join(','));
})();

/* ---- PROMPT-2 PR5 5c: cable-class fields consumed (not recomputed) by the renderers ----
 * uplinkBreakout/superSpineBreakout carry the resolved optic's .category as `class`; the
 * non-breakout leaf<->spine hop carries the same info via a plain uplinkCableClass field.
 * The renderers (js/ui.js) only ever READ these — this pins that the engine actually sets
 * them to a real catalog category, so a future engine refactor that forgets to set one of
 * them fails here instead of silently blanking a label in the UI. */
(() => {
  const brkR = rec({ platformId: 'poweredge-general', units: 400, redundancy: 'dual', trafficProfile: 'balanced', breakout: 'on' });
  const bf = dataFabrics(brkR).find(x => x.uplinkBreakout);
  const CATS = ['dac', 'aoc', 'copper', 'transceiver', 'breakout'];
  if (bf) t('uplinkBreakout carries a real optic category as .class', CATS.indexOf(bf.uplinkBreakout.class) >= 0, bf.uplinkBreakout.class);
  else t('breakout scenario produced an uplinkBreakout to check .class on', false);

  const plainR = rec({ platformId: 'poweredge-general', units: 100, redundancy: 'dual' });
  const pf = dataFabrics(plainR).find(x => x.spine && !x.uplinkBreakout);
  if (pf) t('non-breakout leaf<->spine hop carries uplinkCableClass', CATS.indexOf(pf.uplinkCableClass) >= 0, pf.uplinkCableClass);
  else t('100-unit general design produced a non-breakout spined fabric to check uplinkCableClass on', false);

  // 3-tier AI (wayBig-class) has MULTIPLE independent spine groups; at this scale one of them
  // genuinely has no cataloged breakout part for its super-spine hop (a real, separately-
  // warned gap — see GAPS.md), so that ONE group legitimately has neither field set. The
  // pin here is that AT LEAST ONE super-spine hop in the design carries a real cable-class
  // field, not that every single one does.
  const ssR = rec({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const ssFabs = dataFabrics(ssR).filter(x => x.superSpine);
  const ssHasClass = ssFabs.some(f => (f.superSpineBreakout && CATS.indexOf(f.superSpineBreakout.class) >= 0) || CATS.indexOf(f.superSpineCableClass) >= 0);
  if (ssFabs.length) t('at least one super-spine hop carries a real cable-class field (breakout .class or superSpineCableClass)', ssHasClass, ssFabs.map(f => ({ brk: f.superSpineBreakout && f.superSpineBreakout.class, cls: f.superSpineCableClass })));
  else t('wayBig-class AI design produced 3-tier fabric(s) to check super-spine cable-class fields on', false);
})();

/* ---- OOB never zero, covers every switch, per-rack when multirack ---- */
(() => {
  const r = rec({ platformId: 'poweredge-general', units: 64, racks: 4, redundancy: 'dual', includeMgmt: true });
  const sw = r.bom.filter(b => b.category === 'Switch').reduce((s, b) => s + b.qty, 0);
  const mg = r.fabrics.find(f => f.network === 'mgmt');
  t('OOB counts every switch mgmt port', mg.switchMgmt === sw, { mgmt: mg.switchMgmt, sw });
  t('OOB == declared racks (B6: no phantom spine rack, ruling 2026-07-16)', r.bom.find(b => b.category === 'Management').qty === 4);
})();

/* ---- ICL→EVPN-MH fallback: undersized leaf OVERRIDE at scale (B4 follow-up, ruling 2026-07-16).
 * Conditions: visible WARN (never silent), verify EVPN-MH support (hard-error if neither works),
 * and prove the fallback is override-only — an auto-sized pair keeps its ICL. ---- */
(() => {
  const r = rec({ targets: [{ platformId: 'poweredge-general', units: 400, nic: { speed: '25GbE', portsPerNic: 4, nicsPerUnit: 1 } }], racks: 4, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew', leaf25: 's5212f' });
  const f = r.fabrics.find(x => x.network !== 'mgmt' && x.perRack);
  t('ICL fallback: undersized leaf override → EVPN-MH, not a broken MC-LAG', !!f && f.redundancyMethod === 'evpn-mh' && f.interconnectQty === 0, f && { m: f.redundancyMethod, icl: f.interconnectQty });
  const w = r.warnings.find(x => x.severity === 'warn' && /EVPN-Multihoming/.test(x.message));
  t('ICL fallback: visible WARN, never silent', !!w);
  t('ICL fallback: WARN names the escape-hatch leaves (S5248F/S5296F)', !!w && /S5248F-ON|S5296F-ON/.test(w.message));
  t('ICL fallback: no hard error (S5212F is a VXLAN leaf → supports EVPN-MH)', !r.warnings.some(x => x.severity === 'error'));
  // auto-sized multi-rack dual (no leaf override) right-sizes to a leaf that FITS the ICL — no fallback
  const auto = rec({ platformId: 'poweredge-general', units: 400, racks: 4, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
  const af = auto.fabrics.find(x => x.network !== 'mgmt' && x.perRack && x.spine);
  t('ICL fallback: auto-sized multi-rack pair keeps its MC-LAG/VLT ICL (fallback is override-only)', !!af && af.interconnectQty > 0, af && af.interconnectQty);
})();

/* ---- redundancy-method CAPABILITY is explicit catalog data, NOT a role proxy (correction
 * 2026-07-16): E3248P/E3248PXE run EVPN-MH on Enterprise SONiC; E3224F-ON specifically does not.
 * Pins the fact so it can't be re-derived-away from the edge role again. ---- */
(() => {
  const byId = id => window.CATALOG.switches.find(s => s.id === id);
  t('capability: E3248P-ON IS EVPN-MH-capable (SONiC compat matrix — role is not the test)', byId('e3248p-on').redundancyMethods.indexOf('evpn-mh') >= 0);
  t('capability: E3248PXE-ON IS EVPN-MH-capable', byId('e3248pxe-on').redundancyMethods.indexOf('evpn-mh') >= 0);
  t('capability: E3248P-ON runs MC-LAG (compat matrix)', byId('e3248p-on').redundancyMethods.indexOf('mclag') >= 0);
  t('capability: E3224F-ON is NOT EVPN-MH/MC-LAG capable (OS10-only, absent from SONiC matrix)', byId('e3224f-on').redundancyMethods.indexOf('evpn-mh') < 0 && byId('e3224f-on').redundancyMethods.indexOf('mclag') < 0);
  t('capability: every main-fabric leaf the engine can pick is EVPN-MH-capable', ['s5212f-on', 's5248f-on', 's4348t-on', 's5232f-on', 'z9432f-on', 'z9864f-on', 'sn5610', 'sn5600'].every(id => byId(id).redundancyMethods.indexOf('evpn-mh') >= 0));
})();

/* ---- backtest 2026-07-16 R2/R3: dual-NIC multi-rack consistency ---- */
(() => {
  const r = rec({ targets: [{ platformId: 'poweredge-general', units: 40, nic: { vendor: 'Broadcom', speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 }, nic2: { vendor: 'Broadcom', speed: '1GBase-T', portsPerNic: 2, nicsPerUnit: 1, network: 'frontend' } }], racks: 2, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const dataF = r.fabrics.filter(f => f.network !== 'mgmt');
  // R2: BOTH fabrics on the same multi-rack servers are per-rack MC-LAG (no silent EVPN-MH policy split)
  t('R2: both data fabrics are per-rack MC-LAG (consistent, not a silent mechanism split)', dataF.length === 2 && dataF.every(f => f.perRack && f.redundancyMethod === 'mclag'), dataF.map(f => f.redundancyMethod));
  const peer = r.bom.find(b => /^peer\|/.test(b._mk || ''));
  t('R2: merged ICL qty = 8 (4 per fabric)', peer && peer.qty === 8, peer && peer.qty);
  t('R2: ICL note enumerates PER-FABRIC, no stale +more', peer && /4× 10GBase-T fabric/.test(peer.note) && /4× 1GBase-T fabric/.test(peer.note) && !/\+more/.test(peer.note), peer && peer.note);
  // R3: OOB inter-rack note aggregates to the customer mgmt network, NOT a removed spine rack
  const oobUp = r.bom.find(b => b._mk === 'mgmtuplink');
  t('R3: OOB inter-rack note cites the customer mgmt network, not a spine rack', oobUp && /existing out-of-band|management network/i.test(oobUp.note) && !/spine.?rack/i.test(oobUp.note), oobUp && oobUp.note);
})();

/* ---- UEC transport ---- */
(() => {
  const roce = rec({ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true });
  const uec = rec({ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, aiTransport: 'uec' });
  t('UEC: default transport is roce', roce.context.aiTransport === 'roce');
  t('UEC: selected transport carried in context', uec.context.aiTransport === 'uec');
  t('UEC: config guidance surfaced (packet spray / per-packet ECMP)', uec.warnings.some(w => /packet spraying|per-packet ECMP/i.test(w.message)));
  t('UEC: still non-blocking 1:1 AI fabric', uec.fabrics.some(f => f.workload === 'ai' && f.nonBlocking));
  t('UEC: unknown value falls back to roce', rec({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'dell', aiTransport: 'bogus' }).context.aiTransport === 'roce');
})();

/* ---- Border-leaf pair ---- */
(() => {
  const r = rec({ platformId: 'poweredge-general', units: 120, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', includeCoreUplink: true, coreSpeed: '100GbE', coreType: 'dci', borderLeaf: true });
  const bl = r.bom.find(b => b.category === 'Switch' && /Border-leaf/.test(b.item || ''));
  t('border-leaf: distinct switch line (qty 2)', bl && bl.qty === 2, bl && bl.qty);
  t('border-leaf: uplink + ICL cable lines present', r.bom.some(b => /border-leaf ↔ spine/.test(b.item || '')) && r.bom.some(b => /border MC-LAG ICL/.test(b.item || '')));
  t('border-leaf: context populated', r.context.borderLeaf && r.context.borderLeaf.qty === 2);
  const sw = r.bom.filter(b => b.category === 'Switch').reduce((s, b) => s + b.qty, 0);
  const mg = r.fabrics.find(f => f.network === 'mgmt');
  t('border-leaf: OOB counts the border switches', mg.switchMgmt === sw, { mgmt: mg.switchMgmt, sw });
  const core = r.bom.find(b => b._mk === 'core');
  t('border-leaf: core optic sources FROM the border pair', /border-leaf pair/.test((core || {}).note || ''));
  // ToR-only design: border-leaf request warns and adds nothing
  const tor = rec({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, borderLeaf: true });
  t('border-leaf: refused (with warning) when no spine exists', tor.warnings.some(w => /no spine tier/.test(w.message)) && !tor.bom.some(b => /Border-leaf/.test(b.item || '')));
})();

/* ---- VxRail platform ---- */
(() => {
  const ve = rec({ platformId: 'vxrail', units: 8, modelId: 'vxrail-ve', redundancy: 'dual', includeMgmt: true });
  const vp = rec({ platformId: 'vxrail', units: 8, modelId: 'vxrail-vp', redundancy: 'dual', includeMgmt: true });
  t('vxrail: VE-series = 25GbE', dataFabrics(ve)[0].speed === '25GbE');
  t('vxrail: VP-series = 100GbE', dataFabrics(vp)[0].speed === '100GbE');
  t('vxrail: LACP system-bond enforced as MC-LAG (ICL present)', dataFabrics(ve)[0].interconnectQty > 0);
  t('vxrail: family is VMware VCF', /VMware VCF/.test(ve.platform.family));
})();

/* ---- PowerScale 252-node OneFS cluster cap (H16346.8) ---- */
(() => {
  const cap = n => rec({ platformId: 'powerscale', units: n, modelId: 'f710', redundancy: 'dual', includeMgmt: true });
  const err = r => r.warnings.some(w => w.severity === 'error' && /252/.test(w.message));
  t('powerscale: 252 nodes allowed (boundary, no error)', !err(cap(252)));
  t('powerscale: 253 nodes errors (exceeds OneFS max)', err(cap(253)));
  t('powerscale: 300 nodes advises splitting into 2 clusters', cap(300).warnings.some(w => /split into 2 clusters/i.test(w.message)));
  t('powerscale: 600 nodes → 3 clusters', cap(600).warnings.some(w => /split into 3 clusters/i.test(w.message)));
  t('powerscale: non-powerscale platforms are unaffected by the cap', !err(rec({ platformId: 'poweredge-general', units: 500, redundancy: 'dual', includeMgmt: true })));
})();

/* ---- structured cabling plant itemization ---- */
(() => {
  const r = rec({ platformId: 'poweredge-general', units: 24, redundancy: 'dual', includeMgmt: true, placement: 'structured', structuredInPlace: false, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  const L = dataFabrics(r)[0].totalLinks;
  const plant = k => { const line = r.bom.find(b => (b._mk || '').indexOf('struct|') === 0 && new RegExp(k, 'i').test(b.item || '')); return line ? line.qty : 0; };
  t('structured: LC patch cords = 2 × links', plant('patch cord') === 2 * L, { got: plant('patch cord'), want: 2 * L });
  t('structured: cassettes = 2 × ceil(links/6)', plant('cassette') === 2 * Math.ceil(L / 6));
  t('structured: patch panels present', plant('patch panel') > 0);
  t('structured: MPO trunks present', plant('trunk') > 0);
  t('structured: polarity/polish warning surfaced', r.warnings.some(w => /UPC.*APC.*never|never mix/i.test(w.message)));
  // in-place → plant NOT re-itemized
  const inplace = rec({ platformId: 'poweredge-general', units: 24, redundancy: 'dual', includeMgmt: true, placement: 'structured', structuredInPlace: true, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  t('structured: in-place skips plant itemization', !inplace.bom.some(b => (b._mk || '').indexOf('struct|') === 0));
  // in-rack → no plant
  t('in-rack: no structured plant lines', !rec({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true, placement: 'in-rack' }).bom.some(b => (b._mk || '').indexOf('struct|') === 0));
})();

/* ---- standalone optics: 2 transceivers per fiber link, host-side line, patch cords
 * (added 2026-07-13 — the engine used to quote ONE optic per structured/400G link, i.e.
 * half the physical parts; and the host line's note promised a host-side optic line that
 * never existed) ---- */
(() => {
  const r = rec({ platformId: 'poweredge-general', units: 120, redundancy: 'dual', includeMgmt: true, placement: 'structured', structuredInPlace: false, trafficProfile: 'balanced' });
  const f = dataFabrics(r)[0];
  const hostSw = r.bom.find(b => (b._mk || '').indexOf('host|') === 0);
  const hostNic = r.bom.find(b => (b._mk || '').indexOf('hostnic|') === 0);
  t('standalone: switch-side host optic qty = links', hostSw && hostSw.qty === f.totalLinks, hostSw && hostSw.qty);
  t('standalone: host/NIC-side optic line EXISTS (the note always promised it)', !!hostNic);
  t('standalone: host/NIC-side qty = links', hostNic && hostNic.qty === f.totalLinks, hostNic && hostNic.qty);
  t('standalone: host/NIC-side flags NIC-vendor compatibility', hostNic && /NIC/i.test(hostNic.note || ''));
  const up = r.bom.find(b => (b._mk || '').indexOf('uplink|') === 0);
  const upLinks = f.uplinkCableQty;
  if (up && f.spine) {
    const opt = window.CATALOG.optics.find(o => o.desc === up.model.replace(/ — .*/, '')) || window.CATALOG.optics.find(o => up.model.indexOf(o.desc) === 0);
    const isTrx = opt && opt.category === 'transceiver';
    t('standalone: structured uplink optics = 2 × links (one each end)', !isTrx || up.qty === 2 * upLinks, { qty: up.qty, links: upLinks });
    if (isTrx) t('standalone: structured uplink patch cords = 2 × links', (r.bom.find(b => (b._mk || '').indexOf('uplinkpatch|') === 0) || {}).qty === 2 * upLinks);
  }
  // integrated cables stay ×1: in-rack DAC host line = links exactly
  const dacR = rec({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true, placement: 'in-rack' });
  const dacF = dataFabrics(dacR)[0];
  const dacLine = dacR.bom.find(b => (b._mk || '').indexOf('host|') === 0);
  t('integrated DAC stays 1 per link (no double-count)', dacLine && dacLine.qty === dacF.totalLinks, dacLine && dacLine.qty);
  t('integrated DAC never gets a hostnic side-line', !dacR.bom.some(b => (b._mk || '').indexOf('hostnic|') === 0));
})();

/* ---- core uplink: long reach, third-party far end, patch cords ---- */
(() => {
  const base = { platformId: 'poweredge-general', units: 30, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE' };
  const lr = rec(Object.assign({}, base, { coreReach: 'longreach' }));
  const coreLine = lr.bom.find(b => (b._mk || '') === 'core');
  t('core longreach: LR4 optic picked', coreLine && /LR4/i.test(coreLine.item), coreLine && coreLine.item);
  t('core longreach: patch cords 2 per link', (lr.bom.find(b => (b._mk || '') === 'core-patch') || {}).qty === 2 * lr.coreUplink.count);
  t('core longreach: patch-cord note says single-mode', /single-mode|OS2/i.test((lr.bom.find(b => (b._mk || '') === 'core-patch') || {}).note || ''));
  const other = rec(Object.assign({}, base, { coreVendor: 'other' }));
  t('core other-vendor: interop info note (plain language — same link type, not brand)', other.warnings.some(w => /ANOTHER VENDOR|IEEE 802\.3/i.test(w.message) && /same link type/i.test(w.message)));
  t('core other-vendor: coreVendor=other, no far-side line quoted', other.coreUplink && other.coreUplink.coreVendor === 'other' && !other.bom.some(b => b._mk === 'core-far'));
  t('core other-vendor: BOM note names the concrete far-side standard for the customer', /class optic in your vendor's format/i.test((other.bom.find(b => b._mk === 'core') || {}).note || ''));
  // Dell core → far-side optic IS quoted (both sides)
  const dellCore = rec(Object.assign({}, base, { coreVendor: 'dell' }));
  t('core Dell-vendor: matched far-side optic quoted (both sides)', dellCore.coreUplink && dellCore.coreUplink.includeFar === true && dellCore.bom.some(b => b._mk === 'core-far'));
  // legacy coreFarEnd:'other' still maps onto coreVendor 'other' (back-compat)
  t('core legacy coreFarEnd:other → coreVendor other', rec(Object.assign({}, base, { coreFarEnd: 'other' })).coreUplink.coreVendor === 'other');
  const dci = rec(Object.assign({}, base, { coreType: 'dci' }));
  t('core DCI: defaults to long reach', dci.coreUplink && dci.coreUplink.longReach === true);
  // Regression (2026-07-23, R14 grill): the wizard/expert form send coreReach:'auto' EXPLICITLY
  // as the default (wizard.js), not undefined. The old buggy clause `ctype==='dci' &&
  // coreReach!=='auto'` was only ever exercised by the test above (which omits coreReach,
  // leaving it undefined — undefined!=='auto' is true, masking the bug). With 'auto' explicitly
  // set, undefined!=='auto' is false and the old code fell through to short-reach. Assert the
  // ACTUAL OPTIC, not just the flag, so this can't regress the same way twice.
  const dciAuto = rec(Object.assign({}, base, { coreType: 'dci', coreReach: 'auto' }));
  const dciAutoLine = dciAuto.bom.find(b => (b._mk || '') === 'core');
  t('core DCI + coreReach explicitly auto: STILL long reach (not silently short-reach)',
    dciAuto.coreUplink && dciAuto.coreUplink.longReach === true && dciAutoLine && /LR4/i.test(dciAutoLine.item),
    dciAutoLine && dciAutoLine.item);
  const dflt = rec(base);
  t('core default: short/campus reach unchanged (FR-class optic, not the LR4 SKU)', /^Q28-100G-FR/.test((dflt.bom.find(b => (b._mk || '') === 'core') || { item: '' }).item));
})();

/* ---- review fixes 2026-07-13: Base-T structured, MPO-vs-LC cords, edge method, 400G fiber note ---- */
(() => {
  // Base-T + structured: NIC end is a fixed RJ-45 jack — no host-side module, no fiber plant
  const bt = rec({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true, placement: 'structured', structuredInPlace: false, nic: { vendor: 'Intel', speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 } });
  t('Base-T structured: NO host/NIC-side module line (RJ-45 jack, nothing plugs there)', !bt.bom.some(b => (b._mk || '').indexOf('hostnic|') === 0));
  t('Base-T structured: NO fiber plant for the copper fabric', !bt.bom.some(b => (b._mk || '').indexOf('struct|') === 0 && /frontend/.test(b.note || '')));
  // MPO-class optics get MPO jumpers, LC-class get LC cords
  const st25 = rec({ platformId: 'poweredge-general', units: 120, redundancy: 'dual', includeMgmt: true, placement: 'structured', structuredInPlace: false, trafficProfile: 'balanced' });
  const upPatch = st25.bom.find(b => (b._mk || '').indexOf('uplinkpatch|') === 0);
  t('MPO optics (100G SR4 uplinks) get MPO jumpers, not LC cords', upPatch && /MPO/i.test(upPatch.item), upPatch && upPatch.item);
  const coreFr = rec({ platformId: 'poweredge-general', units: 30, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE' });
  const corePatch = coreFr.bom.find(b => (b._mk || '') === 'core-patch');
  t('duplex optics (100G FR core) keep LC duplex cords', corePatch && /LC duplex/i.test(corePatch.item), corePatch && corePatch.item);
  // E3224F broken case: context.edge.method must be null (the topology draws an ICL off it)
  const e32 = window.recommendEdge({ endpoints: 96, poe: 'none', accessSpeed: 'fiber', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  if (e32.fabrics[0].leaf.model === 'E3224F-ON') {
    t('E3224F broken redundancy: context.edge.method is null (no phantom ICL in the topology)', e32.context.edge.method === null, e32.context.edge.method);
  }
  // non-structured 400G standalone uplinks: the note must say fiber is still needed
  const g400 = rec({ platformId: 'poweredge-general', units: 150, redundancy: 'dual', includeMgmt: true, placement: 'in-rack', leaf100: 's5448f', breakout: 'none', nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  const up400 = g400.bom.find(b => (b._mk || '').indexOf('uplink|') === 0 && /400/.test(b.item || ''));
  if (up400) t('400G standalone uplinks (non-structured): note flags "+ fiber per link"', /fiber per link/i.test(up400.note || ''), up400.note);
})();

/* ---- NVIDIA AI switches: Spectrum-4 SN5600, spine count = port math (2026-07-13) ----
 * GB200 RA: "Each SU features two SN5600 switches as the aggregation layer or spine layer";
 * SN5600 is also the NVL72 RA leaf. The old picks sent everything <800G to the 32-port
 * Spectrum-3 SN4700 (both tiers), and spine count was one-spine-per-uplink (43 spines for 3
 * leaves at radix 128). Spine count is now ceil(total uplinks / breakout-adjusted radix). */
(() => {
  const ai = rec({ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, modelId: 'xe9680', stack: 'nvidia', redundancy: 'dual', includeMgmt: true, placement: 'in-rack', racks: 2 });
  const af = ai.fabrics.find(f => f.network === 'aifabric');
  t('nvidia AI 400G: leaf = SN5600 (GB200/NVL72 RA switch), never SN4700', af.leaf.model === 'SN5600', af.leaf.model);
  if (af.spine) {
    t('nvidia AI 400G: spine = SN5600 (GB200 RA aggregation/spine layer)', af.spine.model === 'SN5600', af.spine.model);
    const totalUp = af.totalLeaves * af.uplinksPerLeaf;
    t('nvidia AI: spine count = port math, not one-per-uplink', af.spineCount === Math.max(2, Math.ceil(totalUp / 128)), `${af.spineCount} spines for ${totalUp} uplinks`);
  }
  t('nvidia AI example: no hard errors', !ai.warnings.some(w => w.severity === 'error'));
  // small cluster collapses to the ERA "2 switches per SU" shape — a non-blocking SN5600 pair
  const small = rec({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
  const sf = small.fabrics.find(f => f.network === 'aifabric');
  t('nvidia AI 64 rails: collapsed non-blocking SN5600 pair (no spine)', sf.leaf.model === 'SN5600' && !sf.spine && sf.totalLeaves === 2 && sf.nonBlocking === true, `${sf.leaf.model}×${sf.totalLeaves} spine=${!!sf.spine}`);
  // Dell parallel (FDC-AI-fabric.json shape): 16× Z9864F leaves, spine count 8 by port math
  // (1024 uplinks ÷ 128 effective ports — the Z9864F carries 400G uplinks 2-per-800G-port).
  // FDC's own export wires 2 spines (its minimal-wiring default, an already-ratified
  // divergence) — 8 preserves the ratified oversubscription-driven sizing; 64 was absurd.
  const dell = rec({ platformId: 'poweredge-ai', units: 128, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const df = dell.fabrics.find(f => f.network === 'aifabric');
  t('dell AI 1024 rails: 16× Z9864F leaves (FDC ground truth)', df.leaf.model === 'Z9864F-ON' && df.totalLeaves === 16, `${df.leaf.model}×${df.totalLeaves}`);
  t('dell AI 1024 rails: 8 spines by port math (was 64 — one per uplink)', df.spineCount === 8, df.spineCount);
})();

/* ---- edge distribution SCALES with the access layer (2026-07-13) ----
 * All E-series uplink at 2×100G (dedicated rear QSFP28 — hardware, not a choice); the
 * distribution radix ladder: S5232F ≤28 access → Z9264F ≤60 → Z9432F (100G via breakout,
 * priced as 400G→4×100G assemblies, native-400G pair ICL) → LOUD multi-pair warning beyond. */
(() => {
  const at = ep => window.recommendEdge({ endpoints: ep, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  const small = at(500);    // 12 access
  t('edge ≤28 access: S5232F-ON distribution', small.context.edge.distribution === 'S5232F-ON', small.context.edge.distribution);
  const mid = at(2000);     // 42 access
  t('edge 29-60 access: Z9264F-ON distribution', mid.context.edge.distribution === 'Z9264F-ON', mid.context.edge.distribution);
  const big = at(4000);     // 84 access
  t('edge >60 access: Z9432F-ON distribution', big.context.edge.distribution === 'Z9432F-ON', big.context.edge.distribution);
  const bigUp = big.bom.find(b => b._mk === 'edge-up');
  t('edge Z9432F rung: uplinks priced as 400G→4×100G breakout assemblies', /4Q28|4x100|→ 4× 100/i.test(bigUp.item + (bigUp.note || '')), bigUp.item);
  t('edge Z9432F rung: breakout assembly math (links ÷ 4)', bigUp.qty === Math.ceil(big.context.edge.accessSwitches * 2 / 4), bigUp.qty);
  const bigIcl = big.bom.find(b => b._mk === 'edge-dist-icl');
  t('edge Z9432F rung: distribution ICL at native 400G', bigIcl && /400G/.test(bigIcl.item), bigIcl && bigIcl.item);
  const huge = at(7000);    // 146 access — beyond even the Z9432F pair
  t('edge beyond the ladder: LOUD multi-pair/campus-core warning', huge.warnings.some(w => w.severity === 'warn' && /multi-pair distribution/.test(w.message)));
  [small, mid, big].forEach((r, i) => t(`edge ladder rung ${i}: no hard errors`, !r.warnings.some(w => w.severity === 'error')));
})();

/* ---- E-series dual uplink classes (2026-07-13, user-corrected): every E3200 has 4× SFP+/
 * SFP28 (10/25G) AND 2× 100G QSFP28 — either can uplink; whichever class isn't uplinking
 * carries the MC-LAG ICL. 'sfp' mode: 4 uplinks/switch at 10/25G, ICL on 2×100G. ---- */
(() => {
  const eAt = (extra) => window.recommendEdge(Object.assign({ endpoints: 192, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true }, extra));
  // default (100g): unchanged — 2×100G uplinks, ICL on the 4× SFP ports at 10G, 4 links/pair
  const d = eAt({});
  t('edge default: 100G uplinks, 2 per access switch', d.context.edge.upSpeed === '100GbE' && d.context.edge.upPerSw === 2);
  t('edge default: ICL on the SFP class (10G × 4 links/pair)', d.context.edge.iclSpeed === '10GbE');
  // SFP mode on E3248P (10G class): 4× 10G uplinks, ICL moves to 2×100G, dist = S4348F-ON
  const s10 = eAt({ edgeUplink: 'sfp' });
  t('edge sfp (E3248P): uplinks at 10GbE via the 4× SFP+ class', s10.context.edge.upSpeed === '10GbE' && s10.context.edge.upPerSw === 4);
  t('edge sfp: ICL moves to the 100G rear pair (2 links ≥100G per h04504)', s10.context.edge.iclSpeed === '100GbE');
  const s10Icl = s10.bom.find(b => b._mk === 'edge-acc-icl');
  t('edge sfp: access-pair ICL priced as 2× 100G DAC per pair', s10Icl && /100G/.test(s10Icl.item) && s10Icl.qty === s10.context.edge.pairs * 2, s10Icl && `${s10Icl.qty}× ${s10Icl.item}`);
  t('edge sfp 10G: distribution = S4348F-ON (48×10G SFP+ — the S41xx replacement)', s10.context.edge.distribution === 'S4348F-ON', s10.context.edge.distribution);
  const s10Up = s10.bom.find(b => b._mk === 'edge-up');
  t('edge sfp 10G: SR optics at 2 per link (standalone-optic rule)', s10Up && /SR/.test(s10Up.item) && s10Up.qty === s10.context.edge.accessSwitches * 4 * 2, s10Up && s10Up.qty);
  // SFP mode on E3248PXE (25G class): 25G uplinks, dist = S5248F-ON, AOC ×1/link
  const s25 = eAt({ edgeUplink: 'sfp', poe: 'poe++', accessSpeed: 'mgig' });
  t('edge sfp (E3248PXE): uplinks at 25GbE via the 4× SFP28 class', s25.context.edge.upSpeed === '25GbE');
  t('edge sfp 25G: distribution = S5248F-ON (48×25G)', s25.context.edge.distribution === 'S5248F-ON', s25.context.edge.distribution);
  const s25Up = s25.bom.find(b => b._mk === 'edge-up');
  t('edge sfp 25G: AOC integrated cable, 1 per link', s25Up && /AOC/.test(s25Up.item) && s25Up.qty === s25.context.edge.accessSwitches * 4, s25Up && s25Up.qty);
  // dense 25G steps to S5296F-ON
  const s25big = eAt({ edgeUplink: 'sfp', poe: 'poe++', accessSpeed: 'mgig', endpoints: 1400 });
  t('edge sfp 25G dense: distribution steps to S5296F-ON (96×25G)', s25big.context.edge.distribution === 'S5296F-ON', s25big.context.edge.distribution);
  [d, s10, s25, s25big].forEach((r, i) => t(`edge uplink-class case ${i}: no hard errors`, !r.warnings.some(w => w.severity === 'error')));
})();

/* ---- S41xx end-of-sale: the 10G fiber rung quotes S4348F-ON, never S4148F ---- */
(() => {
  const r = rec({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true, nic: { vendor: 'Intel', speed: '10GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  const f = r.fabrics.find(x => x.network === 'frontend');
  t('10G fiber leaf = S4348F-ON (S41xx is end of sale)', f && f.leaf.model === 'S4348F-ON', f && f.leaf.model);
  t('no BOM anywhere prices an EOL S41xx switch', !r.bom.some(b => /S41\d\d/.test(b.model || '')));
  const cat = window.CATALOG.switches.find(s => s.id === 's4148f-on');
  t('catalog keeps S4148F-ON flagged eol (brownfield recognition only)', cat && cat.eol === true);
  const s4348 = window.CATALOG.switches.find(s => s.id === 's4348f-on');
  t('S4348F-ON runs Enterprise SONiC (QRG June 2026)', s4348 && /SONiC/i.test(s4348.os));
})();

/* ---- refreshed reach classes carry the current (2026) guidance ---- */
(() => {
  const R = window.CATALOG.rules.cabling;
  t('reach: DAC note reflects 800G shrink to ~2m', /2m at 800G|shrinks with speed/i.test(R.placements['in-rack'].note));
  t('reach: adjacent lists AEC (3–7m) as its own class', /AEC/i.test(R.placements.adjacent.cableClass));
  t('reach: fiberPolish rule present (UPC/APC never mixed)', R.fiberPolish && /never/i.test(R.fiberPolish.note));
})();

/* ---- power model present + sane (rack rollup depends on it) ---- */
(() => {
  const PW = window.CATALOG.rules.power;
  t('power: model exists with switch + host watts', PW && PW.switchWatts && PW.hostWatts && PW.btuPerWatt > 3);
  t('power: GPU host is the dominant draw (>5× a general server)', PW.hostWatts.gpu > PW.hostWatts.server * 5);
  t('power: known switches have explicit watts (S5232F, Z9664F)', PW.switchWatts['s5232f-on'] > 0 && PW.switchWatts['z9664f-on'] > 0);
  t('power: EIPT confirmation is called out as the source', /EIPT/.test(PW.source));
})();

/* ---- CONVERGED FABRIC architecture (2026-07-13, user-directed) ----
 * A genuine customer-intent axis, distinct from the pre-existing separateFabrics/'shared spine'
 * toggle: sharedSpine = separate leaf per network, one shared spine (old default, unchanged);
 * converged = compute + storage NICs of matching speed share the SAME leaf switches (VLAN-
 * segmented); separate = dedicated leaf AND spine per network (old separateFabrics:true). */
(() => {
  const twoTarget = arch => rec({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerstore', units: 3 }], redundancy: 'dual', includeMgmt: true, fabricArchitecture: arch, storageProtocol: 'nvme-tcp' });

  const shared = twoTarget('sharedSpine');
  const sharedLeaves = dataFabrics(shared).reduce((s, f) => s + f.totalLeaves, 0);
  t('sharedSpine (default): frontend + storage stay on SEPARATE leaf fabrics', dataFabrics(shared).length === 2 && !dataFabrics(shared).some(f => f.converged));

  const conv = twoTarget('converged');
  t('converged: frontend + storage MERGE into ONE leaf fabric', dataFabrics(conv).length === 1, dataFabrics(conv).map(f => f.network));
  const cf = dataFabrics(conv)[0];
  t('converged: fabric is flagged converged with both contributing platforms named', cf.converged === true && cf.convergedPlatforms.length === 2, cf.convergedPlatforms);
  t('converged: uses fewer TOTAL leaves than keeping them separate', cf.totalLeaves < sharedLeaves, `${cf.totalLeaves} vs ${sharedLeaves}`);
  t('converged: network label is the MORE CONSTRAINED contributor (storage, not frontend)', cf.network === 'storage', cf.network);
  t('converged: link count = the exact sum of both contributors (no data lost)', cf.totalLinks === 12 * 2 + 3 * 8, cf.totalLinks);
  t('converged: no hard errors', !conv.warnings.some(w => w.severity === 'error'));
  t('converged: info warning explains the merge', conv.warnings.some(w => /Converged fabric/.test(w.message) && /storage|frontend/.test(w.message)));

  const sep = twoTarget('separate');
  t('separate: frontend + storage on separate leaf AND separate spine', dataFabrics(sep).length === 2 && dataFabrics(sep)[0].spineGroupKey !== dataFabrics(sep)[1].spineGroupKey);

  // NVMe-RoCE is NEVER converged — a technical requirement (lossless fabric), not a preference
  const roce = rec({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerstore', units: 3 }], redundancy: 'dual', includeMgmt: true, fabricArchitecture: 'converged', storageProtocol: 'nvme-roce' });
  t('converged + NVMe-RoCE: storage stays on its OWN fabric (not merged)', dataFabrics(roce).length === 2 && !dataFabrics(roce).some(f => f.converged), dataFabrics(roce).map(f => f.network));
  t('converged + NVMe-RoCE: still gets its lossless 1:1 oversub enforcement', dataFabrics(roce).find(f => f.network === 'storage').oversubTarget <= 1.0);

  // PowerScale back-end is NEVER converged (h15963/h16346 — physically mandated separate)
  const psBackend = rec({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerscale', units: 6 }], redundancy: 'dual', includeMgmt: true, fabricArchitecture: 'converged' });
  t('converged + PowerScale: back-end stays dedicated (never merged)', dataFabrics(psBackend).some(f => f.network === 'backend' && !f.converged), dataFabrics(psBackend).map(f => f.network + ':' + !!f.converged));

  // AI is never converged (no-mix + rail-optimized — an unrelated speed class anyway)
  const withAi = rec({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'poweredge-ai', units: 4, gpusPerServer: 8 }], stack: 'dell', redundancy: 'dual', includeMgmt: true, fabricArchitecture: 'converged' });
  t('converged + AI target: AI fabric never merges', dataFabrics(withAi).some(f => f.workload === 'ai' && !f.converged));

  // legacy back-compat: old separateFabrics boolean still works exactly as before
  const legacyTrue = twoTargetLegacy(true), legacyFalse = twoTargetLegacy(false);
  function twoTargetLegacy(v) { return rec({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerstore', units: 3 }], redundancy: 'dual', includeMgmt: true, separateFabrics: v, storageProtocol: 'nvme-tcp' }); }
  t('legacy separateFabrics:true → fabricArchitecture "separate"', legacyTrue.context.fabricArchitecture === 'separate' && legacyTrue.context.separate === true);
  t('legacy separateFabrics:false → fabricArchitecture "sharedSpine" (unchanged default)', legacyFalse.context.fabricArchitecture === 'sharedSpine' && legacyFalse.context.separate === false && !legacyFalse.context.converged);

  // single-target designs: nothing to converge, no crash, no phantom merge
  const single = rec({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, fabricArchitecture: 'converged' });
  t('converged + single target: nothing to merge, no crash, still correct', !single.warnings.some(w => w.severity === 'error') && !dataFabrics(single).some(f => f.converged));

  // REGRESSION (independent review, 2026-07-13): the merge pass used to borrow rack-span
  // placement from whichever contributor had the MOST links, not the one that actually spans
  // the most racks — a small-link, single-rack contributor (e.g. a modest PowerStore) could
  // silently win over a big-link contributor spanning many racks, pricing physically-impossible
  // in-rack DAC for hosts that are in a DIFFERENT rack, with zero cross-rack warning.
  const multiRackConv = rec({
    targets: [{ platformId: 'powerstore', units: 60 }, { platformId: 'poweredge-general', units: 200 }],
    fabricArchitecture: 'converged', racks: 4, redundancy: 'dual', includeMgmt: true, storageProtocol: 'nvme-tcp'
  });
  const mrf = dataFabrics(multiRackConv).find(f => f.converged);
  t('converged multi-rack: uses the WORST-CASE (max) rack span across contributors, not the biggest-link one', mrf.perRack === true, mrf.perRack);
  t('converged multi-rack: leaf count scales for the full span (not a single centralized pair)', mrf.totalLeaves >= 8, mrf.totalLeaves);
  t('converged multi-rack: no hard errors', !multiRackConv.warnings.some(w => w.severity === 'error'));
  // sanity: cloning the representative target for racksSpanned must NOT mutate the real target
  // object other (non-merged) specs on the same target still point at
  const realTarget = multiRackConv.targets.find(x => x.platform.id === 'powerstore');
  t('converged multi-rack: cloning for placement does not mutate the real target object', realTarget.racksSpanned === 1, realTarget.racksSpanned);
})();

/* ---- BaseT copper host NICs (2026-07-15, user-directed): native RJ45 leaf (S4348T-ON), not
 * SFP+ fiber + copper module. Also: nic2's network is a customer-stated answer, not a hardcoded
 * 'storage' assumption, and BaseT nic2/primary pools of DIFFERENT speeds (1G + 10G) converge
 * onto ONE native leaf under converged — S4348T-ON's RJ45 ports are multi-rate. ---- */
(() => {
  const r10t = rec({ platformId: 'poweredge-general', units: 10, redundancy: 'dual', includeMgmt: true,
    nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 2 } });
  const f10t = dataFabrics(r10t).find(f => f.nicOverride);
  t('10GBase-T host: leaf is the NATIVE RJ45 ToR (S4348T-ON), not S4348F-ON+module', f10t.leaf.model === 'S4348T-ON', f10t.leaf.model);
  const hostLine10t = r10t.bom.find(b => b.category === 'Cable/Optic' && /host/i.test(b.note || ''));
  t('10GBase-T host: cabling is a Cat6A patch cable, not an SFP-10G-T module', hostLine10t && /Cat6A/i.test(hostLine10t.item) && !/SFP-10G-T/i.test(hostLine10t.item), hostLine10t && hostLine10t.item);

  const r1t = rec({ platformId: 'poweredge-general', units: 10, redundancy: 'dual', includeMgmt: true,
    nic: { speed: '1GBase-T', portsPerNic: 2, nicsPerUnit: 2 } });
  const f1t = dataFabrics(r1t).find(f => f.nicOverride);
  t('1GBase-T host: leaf is ALSO the native RJ45 ToR (S4348T-ON)', f1t.leaf.model === 'S4348T-ON', f1t.leaf.model);

  const nic2Default = rec({ platformId: 'poweredge-general', units: 8, redundancy: 'dual', includeMgmt: true,
    nic2: { speed: '25GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  const n2d = dataFabrics(nic2Default).find(f => f.role === 'nic2');
  t('nic2 with no stated purpose defaults to storage (back-compat)', n2d.network === 'storage', n2d.network);

  const nic2Frontend = rec({ platformId: 'poweredge-general', units: 8, redundancy: 'dual', includeMgmt: true,
    nic2: { speed: '25GbE', portsPerNic: 2, nicsPerUnit: 1, network: 'frontend' } });
  const n2f = dataFabrics(nic2Frontend).find(f => f.role === 'nic2');
  t('nic2 with a stated "frontend" purpose is honored, not forced to storage', n2f.network === 'frontend', n2f.network);

  // THE USER'S EXACT SCENARIO: 60 servers, primary NIC 10GBase-T + nic2 1GBase-T (stated as a
  // second front-end network, not storage), fabricArchitecture: converged. Must merge onto ONE
  // native-copper leaf tier, not stay as two separate fabrics (the reported bug).
  const mixedBaseT = rec({ platformId: 'poweredge-general', units: 60, redundancy: 'dual', includeMgmt: true,
    fabricArchitecture: 'converged',
    nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 2 },
    nic2: { speed: '1GBase-T', portsPerNic: 2, nicsPerUnit: 2, network: 'frontend' } });
  t('converged BaseT: 10G + 1G copper MERGE into ONE fabric (not two)', dataFabrics(mixedBaseT).length === 1, dataFabrics(mixedBaseT).map(f => f.speed));
  const mbt = dataFabrics(mixedBaseT)[0];
  t('converged BaseT: merged fabric uses the native RJ45 leaf (S4348T-ON)', mbt.leaf.model === 'S4348T-ON', mbt.leaf.model);
  t('converged BaseT: link count = the exact sum of both NIC populations (60x4 + 60x4)', mbt.totalLinks === 60 * 4 + 60 * 4, mbt.totalLinks);
  t('converged BaseT: unit count reflects the 60 REAL servers, not double-counted to 120', mbt.unitsN === 60, mbt.unitsN);
  const mbtCableLine = mixedBaseT.bom.find(b => b.category === 'Cable/Optic' && /Cat6A/i.test(b.item || ''));
  t('converged BaseT: cable BOM note shows the real 60-server count, not 120', mbtCableLine && /× 60\)/.test(mbtCableLine.note || ''), mbtCableLine && mbtCableLine.note);
  t('converged BaseT: no hard errors', !mixedBaseT.warnings.some(w => w.severity === 'error'));
  // The 60 hosts are genuinely mixed-rate (some 10G links, some 1G) — the merged fabric must
  // say so, not silently claim a single precise speed for the whole pool on a customer BOM.
  t('converged BaseT: mixed 10G+1G contributors are labeled "mixed-rate", not one arbitrary speed', mbt.speed === '1/10GBase-T (mixed-rate)', mbt.speed);

  // A converged BaseT bucket where every contributor is the SAME exact speed (e.g. two 10GBase-T
  // pools) must NOT get the mixed-rate label — only genuinely mixed pools do.
  const sameBaseT = rec({ targets: [{ platformId: 'poweredge-general', units: 20, nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 2 } }, { platformId: 'poweredge-general', units: 15, nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 2 } }],
    fabricArchitecture: 'converged', redundancy: 'dual', includeMgmt: true });
  const sbt = dataFabrics(sameBaseT).find(f => f.converged);
  t('converged BaseT: SAME-speed contributors keep the exact speed label (no false "mixed-rate")', sbt && sbt.speed === '10GBase-T', sbt && sbt.speed);

  // REGRESSION (fuzz-found, 2026-07-15): when `rep` (the biggest-LINK contributor) happens to
  // be the SLOWER (1G) member, uplink-port sizing/oversub math must still budget for the
  // FASTER (10G) member's real bandwidth demand — using rep's lower gbps silently under-sized
  // uplinks (engine's own oversub check agreed with itself using the wrong number; only an
  // independently-recomputed check using the honest "mixed-rate" speed label caught the gap).
  const bigSlowSmallFast = rec({ platformId: 'powermax', units: 138, modelId: 'pmax2500', redundancy: 'single', includeMgmt: true,
    fabricArchitecture: 'converged', storageProtocol: 'iscsi', trafficProfile: 'ew',
    nic: { vendor: 'other', speed: '1GBase-T', portsPerNic: 4, nicsPerUnit: 4 },
    nic2: { vendor: 'Broadcom', speed: '10GBase-T', portsPerNic: 4, nicsPerUnit: 3, network: 'storage' } });
  const bss = dataFabrics(bigSlowSmallFast).find(f => f.converged);
  t('converged BaseT (rep=slower member): oversub still meets the non-blocking target', bss && bss.oversub <= bss.oversubTarget + 0.001, bss && [bss.oversub, bss.oversubTarget]);

  // PIN (2nd independent review, 2026-07-15): the "mixed-rate" merged-fabric speed label is
  // never re-parsed by engine.js itself (its numeric `gbps` field is computed directly, not
  // derived from this string) — but the INDEPENDENT checker (feasibility.js) deliberately
  // re-derives required bandwidth FROM this exact string via its own regex, specifically so it
  // doesn't just trust engine.js's own number. That only works because "10G" appears before "1G"
  // in the current wording. If this label is ever reworded, the independent checker would
  // silently start under-deriving bandwidth with no visible symptom — pin the parse here so a
  // future wording change fails loudly instead of quietly weakening the checker.
  const feas = require('./harness/lib/feasibility.js');
  t('mixed-rate label parses to the FASTER speed (10), not the slower one', feas.gbps('1/10GBase-T (mixed-rate)') === 10, feas.gbps('1/10GBase-T (mixed-rate)'));

  const mixedBaseTShared = rec({ platformId: 'poweredge-general', units: 60, redundancy: 'dual', includeMgmt: true,
    nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 2 },
    nic2: { speed: '1GBase-T', portsPerNic: 2, nicsPerUnit: 2, network: 'frontend' } });
  t('sharedSpine (default) BaseT: 10G + 1G stay as TWO fabrics (convergence is opt-in)', dataFabrics(mixedBaseTShared).length === 2, dataFabrics(mixedBaseTShared).map(f => f.speed));
  t('sharedSpine (default) BaseT: both still use the native RJ45 leaf individually', dataFabrics(mixedBaseTShared).every(f => f.leaf.model === 'S4348T-ON'), dataFabrics(mixedBaseTShared).map(f => f.leaf.model));
})();

/* ---- 3-tier Clos: breakout-adjusted trigger + super-spine breakout port budget
 * (2026-07-15, external code review GAPS.md G-007/G-002/G-003) ----
 * G-007: the 3-tier trigger and podLeafCap read the RAW native spine radix, not the
 * breakout-adjusted one already computed for spine-count sizing — a spine genuinely serving
 * MORE leaves via breakout (e.g. 128 effective ports on a 64-native-port switch) could see
 * 65-128 leaves and still spuriously build a full unneeded pod-spine + super-spine tier of
 * real hardware, WITH a false hard "OVER-COMMITTED" error (G-002) on top. Confirmed live before
 * the fix: 520× poweredge-ai (65 AI leaves, fits flat within the 128-port breakout-adjusted
 * radix) built a 3-tier Clos AND threw a false super-spine-over-committed error. ---- */
(() => {
  // RE-RULED 2026-07-16d (R12, maintainer, before/after shown). This case previously asserted a
  // FLAT 2-tier on the premise that 65 leaves "fit the 128-port breakout-adjusted radix" — but that
  // 128 was PHANTOM: it credited the Z9864F-ON spine with 400G breakout ports for a leaf↔spine hop
  // that has no cataloged part (the only Dell 800G→2×400G assembly fans out to QSFP56-DD HOSTS, not
  // to another OSFP switch). Inter-switch hops between same-cage switches run NATIVE speed, so the
  // spine has 64 real ports and 65 leaves genuinely do NOT fit flat — by ONE leaf (512 servers still
  // does). Uplink bandwidth is identical either way (32×800G == 64×400G == 25,600G/leaf): the
  // phantom bought no capacity, only an unbuildable BOM. The honest shape is a 3-tier Clos with a
  // same-speed, fully cabled super-spine tier sized by port math.
  const spineFitsFlat = rec({ platformId: 'poweredge-ai', units: 520, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const f = spineFitsFlat.fabrics.find(x => x.workload === 'ai');
  t('breakout-adjusted trigger: 520 AI servers = 65 leaves vs the Z9864F-ON spine\'s 64 NATIVE ports -> honestly 3-tier (the old "fits flat" was phantom breakout credit)',
    (f.numPods || 1) > 1 && !!f.superSpine, `numPods=${f.numPods}, superSpine=${f.superSpine && f.superSpine.model}`);
  t('breakout-adjusted trigger: 520-case uplinks are NATIVE 800G (buildable), not phantom 400G',
    f.uplinkSpeed === '800GbE' && f.uplinksPerLeaf === 32, `${f.uplinksPerLeaf}× ${f.uplinkSpeed}`);
  t('breakout-adjusted trigger: 520-case super-spine is same-speed Z9864F-ON, sized by port math (3072 links / 64 ports = 48)',
    f.superSpine && f.superSpine.model === 'Z9864F-ON' && f.superSpineCount === 48,
    `${f.superSpineCount}× ${f.superSpine && f.superSpine.model}`);
  // the boundary the phantom was hiding: one leaf fewer and it genuinely DOES fit flat
  const flat512 = rec({ platformId: 'poweredge-ai', units: 512, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const f512 = flat512.fabrics.find(x => x.workload === 'ai');
  t('breakout-adjusted trigger: 512 AI servers (64 leaves) DOES fit flat 2-tier on 64 native spine ports', (f512.numPods || 1) === 1 && !f512.superSpine, `numPods=${f512.numPods}, superSpine=${f512.superSpine && f512.superSpine.model}`);
  t('breakout-adjusted trigger: no false "OVER-COMMITTED" hard error on a design that fits', !spineFitsFlat.warnings.some(w => w.severity === 'error'), spineFitsFlat.warnings.filter(w => w.severity === 'error').map(w => w.message));

  const genuinely3Tier = rec({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const f2 = genuinely3Tier.fabrics.find(x => x.workload === 'ai');
  t('breakout-adjusted trigger: 1200 AI servers (150 leaves, genuinely exceeds the 128-port radix) DOES build 3-tier', (f2.numPods || 1) > 1 && !!f2.superSpine, `numPods=${f2.numPods}, superSpine=${f2.superSpine && f2.superSpine.model}`);

  // G-002/G-003 (validate.js consumer side) — SYNTHETIC: no current catalog pairing reaches a
  // valid pod-spine<->super-spine breakout end-to-end (Z9864F-ON's only super-spine step-up,
  // Z9964F-ON, has no cataloged 1.6T->800G breakout part — confirmed by exhaustive scan), so
  // this exercises validate.js's check #13/#22 super-spine capacity math directly rather than
  // via a live recommend() scenario. Start from a REAL result (so res.bom/context/platform are
  // all genuinely populated) and mutate just the fabric's super-spine fields.
  const base = rec({ platformId: 'poweredge-general', units: 100, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
  const bf = dataFabrics(base).find(x => x.spine);
  const z9864 = window.CATALOG.switches.find(s => s.id === 'z9864f-on');   // 800GbE native, radix 64
  Object.assign(bf, { superSpine: z9864, superSpineCount: 1, totalPodSpines: 50, podUplinksToSuper: 2 });
  // superNeeded = 50 * 2 = 100; native cap (ratio 1) = 1*64 = 64 (100 > 64 -> WOULD false-error);
  // breakout-credited cap (ratio 2) = 1*64*2 = 128 (100 <= 128 -> correctly no error).
  bf.superSpineBreakout = { ratio: 2, high: '1.6TbE', low: '800GbE', model: 'synthetic-test-breakout' };
  base.warnings.length = 0;
  window.validateBOM(base);
  t('super-spine breakout credit: a design that fits WITH the ratio produces NO over-committed error', !base.warnings.some(w => w.severity === 'error' && /super-spine tier OVER-COMMITTED/.test(w.message)), base.warnings.filter(w => /super-spine/i.test(w.message)).map(w => w.message));

  bf.superSpineBreakout = null;   // same raw numbers, no breakout credit — SHOULD still error
  base.warnings.length = 0;
  window.validateBOM(base);
  t('super-spine breakout credit: the SAME numbers WITHOUT a breakout genuinely over-commit (check still catches real over-commitment)', base.warnings.some(w => w.severity === 'error' && /super-spine tier OVER-COMMITTED/.test(w.message)), base.warnings.filter(w => /super-spine/i.test(w.message)).map(w => w.message));

  // GAPS.md G-003: check #13 (leaf<->spine, WARN severity) must credit f.uplinkBreakout the
  // same way #22 (ERROR severity, tested above) already does — otherwise a spine genuinely
  // using breakout (e.g. 400G spine serving 100G leaves via 4x breakout) warns "may be short
  // on ports" on a design that actually fits, training reps to distrust real warnings. This
  // was the one G-002/G-003 sub-case with NO direct regression test until now.
  const base2 = rec({ platformId: 'poweredge-general', units: 100, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
  const bf2 = dataFabrics(base2).find(x => x.spine);
  // uplinkCableQty is cleared (not just left at its ORIGINAL real-design value) so this test
  // exercises the totalLeaves×uplinksPerLeaf fallback it's actually about (G-011's fix made
  // uplinkCableQty — when present — take priority over that fallback; a stale leftover value
  // here would silently test the wrong number after G-011 landed).
  Object.assign(bf2, { totalLeaves: 40, uplinksPerLeaf: 4, totalPodSpines: 2, spineCount: 2, uplinkCableQty: 0 });
  // needed = 40*4 = 160; native cap (ratio 1) = spine.access.count * 2 (whatever the real
  // catalog radix is — 160 comfortably exceeds any 2-spine native cap at this scale, so the
  // native case is guaranteed to warn; the credited case must not).
  bf2.uplinkBreakout = { ratio: 4, high: '400GbE', low: '100GbE', model: 'synthetic-test-breakout' };
  base2.warnings.length = 0;
  window.validateBOM(base2);
  t('leaf<->spine breakout credit (#13): a design that fits WITH the ratio produces NO "short on ports" warning', !base2.warnings.some(w => w.severity === 'warn' && /spine may be short on ports/.test(w.message)), base2.warnings.filter(w => /short on ports/i.test(w.message)).map(w => w.message));

  bf2.uplinkBreakout = null;   // same raw numbers, no breakout credit — SHOULD warn
  base2.warnings.length = 0;
  window.validateBOM(base2);
  t('leaf<->spine breakout credit (#13): the SAME numbers WITHOUT a breakout genuinely warn (check still catches real shortfall)', base2.warnings.some(w => w.severity === 'warn' && /spine may be short on ports/.test(w.message)), base2.warnings.filter(w => /short on ports/i.test(w.message)).map(w => w.message));

  // REGRESSION (fuzz-found, 2026-07-15): TWO different AI targets (different GPU models/rail
  // speeds) used to collide into ONE shared spine group — spineGroupKey was keyed on the
  // platform id ('poweredge-ai'), not the per-instance uid — so the group's spine/pod sizing was
  // computed from whichever target happened to be grp.fabrics[0], silently under-provisioning
  // for the other. Each AI target instance must get its OWN dedicated spine group.
  const twoAiTargets = rec({ targets: [
    { platformId: 'poweredge-ai', units: 181, modelId: 'xe9780', gpusPerServer: 8, railNic: { speed: '400GbE' } },
    { platformId: 'poweredge-ai', units: 5871, modelId: 'xe9785', gpusPerServer: 4 }
  ], redundancy: 'dual', includeMgmt: true, stack: 'dell' });
  const aiFabrics = twoAiTargets.fabrics.filter(f => f.workload === 'ai');
  t('two different AI targets get SEPARATE spine groups (no cross-target sizing collision)', aiFabrics.length === 2 && aiFabrics[0].spineGroupKey !== aiFabrics[1].spineGroupKey, aiFabrics.map(f => f.spineGroupKey));

  // GENERAL/STORAGE equivalent of the breakout-adjusted trigger (2026-07-15, follow-up to the
  // AI-only fix above): 3000 general-purpose servers (80 leaves) lands on a Z9432F-ON spine
  // (raw native radix 32) via a REAL, cataloged 4x uplink breakout (100G leaf uplinks -> 400G
  // spine ports) that the BOM already prices — 128 effective ports, plenty for 80 leaves flat.
  // Fixed via the SAME resolveUplinkBreakout() helper the real cabling uses (not a naive
  // speed-ratio guess off the host NIC speed, which was the earlier phantom-credit bug).
  const genFitsFlat = rec({ platformId: 'poweredge-general', units: 3000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const gf = dataFabrics(genFitsFlat).find(x => x.network === 'frontend');
  t('general/storage breakout-adjusted trigger: 3000 servers (80 leaves, fits the 128-port breakout radix) stays FLAT 2-tier', (gf.numPods || 1) === 1 && !gf.superSpine, `numPods=${gf.numPods}, superSpine=${gf.superSpine && gf.superSpine.model}, uplinkBreakout=${JSON.stringify(gf.uplinkBreakout)}`);
  t('general/storage breakout-adjusted trigger: no unexpected hard error', !genFitsFlat.warnings.some(w => w.severity === 'error'));

  const genGenuinely3Tier = rec({ platformId: 'poweredge-general', units: 10000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const gf2 = dataFabrics(genGenuinely3Tier).find(x => x.network === 'frontend');
  t('general/storage breakout-adjusted trigger: 10000 servers (262 leaves, genuinely exceeds the 128-port radix) DOES build 3-tier', (gf2.numPods || 1) > 1 && !!gf2.superSpine, `numPods=${gf2.numPods}, superSpine=${gf2.superSpine && gf2.superSpine.model}`);

  // breakout:'none' (user explicitly opted out) must NOT get the credit — the same 3000-unit
  // design that stays flat with auto breakout genuinely needs 3-tier without it, and must build
  // that cleanly (no false errors), mirroring the AI case's breakout-toggle guard.
  const genBreakoutOff = rec({ platformId: 'poweredge-general', units: 3000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', breakout: 'none' });
  const gf3 = dataFabrics(genBreakoutOff).find(x => x.network === 'frontend');
  t('general/storage breakout-adjusted trigger: breakout:"none" gets NO credit (3-tier genuinely needed without it)', (gf3.numPods || 1) > 1 && !!gf3.superSpine, `numPods=${gf3.numPods}`);
  t('general/storage breakout-adjusted trigger: breakout:"none" still builds cleanly, no false errors', !genBreakoutOff.warnings.some(w => w.severity === 'error'));

  // REGRESSION (consolidation follow-up, 2026-07-15): the pod-spine<->super-spine hop (step 5)
  // used to compute its breakout ratio/pickBreakout call INLINE, separately from the leaf<->
  // spine hop — and had already drifted: it never checked `breakout !== 'none'` at all, so a
  // customer who explicitly disabled breakout still got a super-spine breakout cable priced (or,
  // for an uncataloged pairing, the SAME generic "no cataloged breakout" message regardless of
  // whether the real reason was a catalog gap or the user's own toggle). Consolidated onto the
  // same resolveUplinkBreakout() helper; the warning text must now distinguish the two causes.
  const superAuto = rec({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0, breakout: 'auto' });
  const superOff = rec({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0, breakout: 'none' });
  // REWRITTEN 2026-07-16d (R12 super-spine ruling). Both assertions above described a design that
  // STEPPED to the 1.6T flagship and only then discovered it had no cable — the catalog gap was
  // reported at CABLING time. The ruling moves that decision earlier: a super-spine candidate is
  // gated at SELECTION time on whether a real part terminates the hop (native or a cataloged
  // breakout with far-ends that seat), and the design's breakout toggle is an input to that gate.
  // Consequence: an uncabled cross-speed super-spine hop is now structurally UNREACHABLE, so the
  // old "no cataloged breakout connects" / "breakout is disabled but" messages no longer fire here
  // — not because the bug returned, but because the situation can't arise. What must hold now is
  // stronger, and is what these assert: BOTH toggle states land on a same-speed, fully cabled tier,
  // and the pass-over is explained. (The two messages remain as defensive guards on other hops.)
  const ssAuto = dataFabrics(superAuto).find(x => x.network === 'aifabric');
  const ssOff = dataFabrics(superOff).find(x => x.network === 'aifabric');
  t('super-spine hop ("auto"): part-evidence gate lands on a SAME-SPEED super-spine — no uncabled cross-speed hop',
    !!ssAuto.superSpine && ssAuto.superSpine.access.speed === ssAuto.spine.access.speed && !superAuto.warnings.some(w => /no cataloged breakout connects/.test(w.message)),
    `spine=${ssAuto.spine && ssAuto.spine.model}, superSpine=${ssAuto.superSpine && ssAuto.superSpine.model}`);
  t('super-spine hop ("auto"): the passed-over flagship is EXPLAINED as a parts decision, not left silent',
    superAuto.warnings.some(w => /no cataloged .*-capable connection|PARTS decision/i.test(w.message)),
    superAuto.warnings.filter(w => /super-spine/i.test(w.message)).map(w => w.message.slice(0, 80)));
  t('super-spine hop ("none"): disabling breakout is honored at SELECTION time — still a same-speed, cabled tier, no false catalog-gap wording',
    !!ssOff.superSpine && ssOff.superSpine.access.speed === ssOff.spine.access.speed && !superOff.warnings.some(w => /no cataloged breakout connects/.test(w.message)),
    `spine=${ssOff.spine && ssOff.spine.model}, superSpine=${ssOff.superSpine && ssOff.superSpine.model}`);
  t('super-spine hop: neither toggle state produces a hard error', !superAuto.warnings.some(w => w.severity === 'error') && !superOff.warnings.some(w => w.severity === 'error'));
})();

/* ---- recommendRA(): node-count truncation warning + multi-rack cabling stop-gap
 * (2026-07-15, GAPS.md G-009/G-010) ----
 * G-009: requesting more nodes than an RA's endorsed maxGpuNodes silently clamped with no
 * indication anything was reduced — every RA's own scaleNote says larger clusters ARE possible
 * ("REQUIRE additional network switching"), so a rep could quote far fewer nodes than requested
 * with zero warning. Fixed in BOTH recommendRA() return branches (published + generic-scale).
 * G-010: the published GB300 NVL72 path prices EVERY cable as ≤3m in-rack DAC regardless of
 * scale, even though the RA's own text says leaves "serve 2 racks" once n>1 — added a stop-gap
 * warning (not a full rack-placement redesign, per explicit scope). ---- */
(() => {
  window.CATALOG.referenceArchitectures.forEach(ra => {
    const over = window.recommendRA(ra.id, ra.maxGpuNodes + 5);
    t(`recommendRA truncation warning (${ra.id}): requesting maxGpuNodes+5 warns and clamps to context.units===maxGpuNodes`,
      over.context.units === ra.maxGpuNodes && over.warnings.some(w => w.severity === 'warn' && /exceeds this RA's endorsed\/validated scale/.test(w.message)),
      { units: over.context.units, expected: ra.maxGpuNodes });
    const atMax = window.recommendRA(ra.id, ra.maxGpuNodes);
    t(`recommendRA truncation warning (${ra.id}): requesting EXACTLY maxGpuNodes does NOT false-fire the truncation warning`,
      !atMax.warnings.some(w => /exceeds this RA's endorsed\/validated scale/.test(w.message)));
  });

  const pubRa = window.CATALOG.referenceArchitectures.find(ra => ra.published);
  const multi = window.recommendRA(pubRa.id, 3);
  t('recommendRA multi-rack stop-gap: fires for n>1 on the published path', multi.warnings.some(w => w.severity === 'warn' && /does not yet model physical rack placement/.test(w.message)));
  const single = window.recommendRA(pubRa.id, 1);
  t('recommendRA multi-rack stop-gap: does NOT fire for n===1 (nothing to warn about)', !single.warnings.some(w => /does not yet model physical rack placement/.test(w.message)));
})();

/* ---- GAPS.md G-011: validate.js #13/#22 must consume the engine's already-resolved
 * uplinkCableQty, not recompute totalLeaves × uplinksPerLeaf — the two can diverge for the
 * published RA path (uplinksPerLeaf is a per-leaf CEILING that doesn't divide evenly for every
 * n; multiplying it back out overcounts vs the real cabled quantity, e.g. GB300 NVL72 n=7:
 * totalLeaves×uplinksPerLeaf=1024 vs the actual "Leaf-to-spine intra-fabric links" cable line=
 * 1008). Same principle as the breakout fixes: consume a field the engine already resolved. ---- */
(() => {
  // Part 1 — synthetic, direct proof of the validate.js preference itself: engineer a fabric
  // where totalLeaves×uplinksPerLeaf and uplinkCableQty disagree, straddling a spine capacity
  // boundary, and confirm the validator uses uplinkCableQty (the field it's supposed to prefer).
  const base = rec({ platformId: 'poweredge-general', units: 100, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
  const bf = dataFabrics(base).find(x => x.spine);
  // a SYNTHETIC spine object — never mutate a real catalog switch in place, test files share one
  // persistent context and a mutated catalog entry would silently corrupt every later test.
  // uplinksPerLeaf stays at the real leaf's actual uplink-port count (8) so this scenario
  // exercises ONLY the spine-capacity check under test, not the unrelated leaf-uplink-port check.
  const synthSpine = { model: 'synthetic-test-spine', vendor: 'Dell', access: { count: 38, speed: '400GbE' } };
  Object.assign(bf, { spine: synthSpine, totalPodSpines: 2, spineCount: 2, totalLeaves: 10, uplinksPerLeaf: 8, uplinkBreakout: null, superSpine: null });
  const spineMsg = /spine tier OVER-COMMITTED|spine may be short on ports/;
  // naive totalLeaves×uplinksPerLeaf = 80; cap = 2×38 = 76 (80 > 76 -> WOULD false-fire);
  // real cabled qty (uplinkCableQty) = 70 (70 <= 76 -> correctly no false-fire).
  bf.uplinkCableQty = 70;
  base.warnings.length = 0;
  window.validateBOM(base);
  t('G-011 fix: validator PREFERS uplinkCableQty (70 <= cap 76) — no false spine-capacity warn/error', !base.warnings.some(w => (w.severity === 'warn' || w.severity === 'error') && spineMsg.test(w.message)), base.warnings.filter(w => spineMsg.test(w.message)).map(w => w.message));

  bf.uplinkCableQty = 0;   // remove the resolved field -> forces the fallback recomputation (80)
  base.warnings.length = 0;
  window.validateBOM(base);
  t('G-011 fix: WITHOUT uplinkCableQty, the fallback recomputation (80 > cap 76) genuinely flags it (check still catches a real shortfall)', base.warnings.some(w => (w.severity === 'warn' || w.severity === 'error') && spineMsg.test(w.message)), base.warnings.filter(w => spineMsg.test(w.message)).map(w => w.message));

  // Part 2 — the regression the user asked for: for EVERY n from 1 to maxGpuNodes on EVERY
  // published RA, assert the engine's uplinkCableQty (what validate.js now consumes) matches
  // the ACTUAL priced "Leaf-to-spine" cable line in the BOM — not spot-checked values. This is
  // the test that would have caught G-011 originally (n=7 fails pre-fix: 1024 vs 1008), and it
  // guards any future published RA added to the catalog, not just this one.
  window.CATALOG.referenceArchitectures.filter(ra => ra.published).forEach(ra => {
    for (let n = 1; n <= ra.maxGpuNodes; n++) {
      const res = window.recommendRA(ra.id, n);
      const aif = res.fabrics.find(f => f.workload === 'ai');
      const cableQty = res.bom.filter(b => b.category === 'Cable/Optic' && /leaf-to-spine/i.test(b.note || '')).reduce((s, b) => s + (typeof b.qty === 'number' ? b.qty : 0), 0);
      t(`G-011 regression (${ra.id}, n=${n}): uplinkCableQty matches the real leaf-to-spine cable BOM line`, aif.uplinkCableQty === cableQty, { uplinkCableQty: aif.uplinkCableQty, cableQty });
      t(`G-011 regression (${ra.id}, n=${n}): no false spine-capacity error/warn from this hop`, !res.warnings.some(w => (w.severity === 'warn' || w.severity === 'error') && /spine.*short on ports|spine tier OVER-COMMITTED/i.test(w.message)), res.warnings.filter(w => /spine/i.test(w.message)).map(w => w.message));
    }
  });
})();

/* ---- pickSuperSpine(): same-speed intermediate rung (2026-07-15, GAPS.md G-001) ----
 * Before jumping straight to the 1.6TbE flagship (Z9964F-ON), a pod-spine that outgrows its own
 * radix should first check for a SAME-SPEED, higher-radix spine model — Z9432F-ON (400GbE, 32
 * native) -> Z9664F-ON (400GbE, 64 native) is exactly that rung, verified against the real
 * catalog. pickSuperSpine() isn't exposed on window, so this is tested indirectly through
 * recommend() at scales that land totalPodSpines just below/at/above the Z9664F-ON boundary
 * (64). ---- */
(() => {
  const below = rec({ platformId: 'poweredge-general', units: 17000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const bf = dataFabrics(below).find(f => f.network === 'frontend');
  t('super-spine same-speed rung: totalPodSpines(56) < 64 -> Z9664F-ON, NOT the flagship', bf.totalPodSpines === 56 && bf.superSpine && bf.superSpine.model === 'Z9664F-ON', `totalPodSpines=${bf.totalPodSpines}, superSpine=${bf.superSpine && bf.superSpine.model}`);

  const at = rec({ platformId: 'poweredge-general', units: 18000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const af = dataFabrics(at).find(f => f.network === 'frontend');
  t('super-spine same-speed rung: totalPodSpines(64) === Z9664F-ON\'s own radix -> still Z9664F-ON, not a false step-up to flagship', af.totalPodSpines === 64 && af.superSpine && af.superSpine.model === 'Z9664F-ON', `totalPodSpines=${af.totalPodSpines}, superSpine=${af.superSpine && af.superSpine.model}`);

  const above = rec({ platformId: 'poweredge-general', units: 20000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const abf = dataFabrics(above).find(f => f.network === 'frontend');
  // RE-RULED 2026-07-16d (R12): "falls through to the flagship" was phantom-backed. The Z9964F-ON
  // (1.6TbE OSFP224) cannot terminate a 400GbE Z9664F-ON pod-spine link — no cataloged 1.6T→4×400G
  // part with matching far-ends exists — so crediting it with 64 usable ports here was capacity
  // attributed to a link that has no part behind it. The ladder is now part-evidence-gated: the
  // flagship is passed over and the tier stays same-speed (Z9664F-ON ↔ Z9664F-ON @400G, cabled),
  // widening by port math instead. The 4th-tier scope limit below still applies and still fires.
  t('super-spine same-speed rung: totalPodSpines(72) > 64 -> flagship is GATED on part evidence (no cataloged 1.6T→400G part), tier stays same-speed Z9664F-ON', abf.totalPodSpines === 72 && abf.superSpine && abf.superSpine.model === 'Z9664F-ON', `totalPodSpines=${abf.totalPodSpines}, superSpine=${abf.superSpine && abf.superSpine.model}`);
  t('super-spine same-speed rung: the flagship pass-over is explained as a parts decision', above.warnings.some(w => /no cataloged .*-capable connection|PARTS decision/i.test(w.message)));
  // beyond-scope errors are expected here (needs a 4th tier) — assert the SPECIFIC scope-limit
  // warning is present, not that the design is error-free (it legitimately isn't at this scale).
  t('super-spine same-speed rung: the above-boundary case is the documented 4th-tier scope limit, not a silent gap', above.warnings.some(w => /needs a 4th tier/i.test(w.message)));

  // NVIDIA path must fall through to sn6810 unchanged (SN5610->SN6810 is already a same-speed
  // 800GbE jump straight to the flagship — no intermediate rung exists or should be invented).
  const nvidia3Tier = rec({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const nf = nvidia3Tier.fabrics.find(f => f.workload === 'ai');
  t('super-spine same-speed rung: NVIDIA AI 3-tier still correctly steps to SN6810 (unchanged)', (nf.numPods || 1) > 1 && nf.superSpine && nf.superSpine.model === 'SN6810', `numPods=${nf.numPods}, superSpine=${nf.superSpine && nf.superSpine.model}`);
})();

/* ---- catalog completeness: every switch resolves to a non-undefined wattage
 * (2026-07-15, GAPS.md G-004) — a named entry or the by-rack-U fallback, never `undefined`.
 * z9964f-on (3U flagship spine) previously had neither a named entry nor a matching
 * switchWattsByU[3] fallback, silently producing undefined for the highest-stakes AI quotes. ---- */
(() => {
  const PW = window.CATALOG.rules.power;
  window.CATALOG.switches.forEach(sw => {
    const watts = PW.switchWatts[sw.id] != null ? PW.switchWatts[sw.id] : PW.switchWattsByU[sw.rackU];
    t(`catalog completeness: ${sw.id} (${sw.rackU}U) resolves to a real wattage figure, not undefined`, watts != null && isFinite(watts) && watts > 0, watts);
  });
})();

/* ---- pickHostCable('adjacent') never resolves to a DAC (2026-07-15, GAPS.md G-005) ----
 * DAC is documented in-rack-only reach (rules.leafSpine.considerations); an adjacent-rack run
 * must use AOC or return null (no cataloged optic), never silently fall back to DAC. Removed the
 * `first([aoc, dac])` fallback that used to make this a live risk if either AOC entry were ever
 * renamed. pickHostCable isn't exposed on window, so tested indirectly via recommend(). ---- */
(() => {
  [
    { speed: '100GbE', want: 'AOC-QSFP-100G' },
    { speed: '25GbE', want: 'AOC-SFP-25G' }
  ].forEach(({ speed, want }) => {
    const r = rec({ platformId: 'poweredge-general', units: 24, redundancy: 'dual', includeMgmt: true, placement: 'adjacent', nic: { speed, portsPerNic: 2, nicsPerUnit: 1 } });
    const hostLine = r.bom.find(b => b.category === 'Cable/Optic' && /host/i.test(b.note || ''));
    t(`adjacent placement @ ${speed}: resolves to AOC, not DAC`, hostLine && new RegExp(want, 'i').test(hostLine.item) && !/DAC/i.test(hostLine.item), hostLine && hostLine.item);
  });
})();

/* ---- discovery.js / solutions.js catalog couplings (2026-07-15, GAPS.md G-012) ----
 * Both discovery.js and solutions.js are loaded by the app but reference OTHER catalog files by
 * bare string id (platformSeed -> platforms.js, fitsPains -> discovery.painPoints) with zero
 * enforcement — a future rename on either side silently breaks the Discovery->BOM handoff or the
 * pain-point recommendation with no error, just a feature that quietly stops surfacing. ---- */
(() => {
  const C = window.CATALOG;
  (C.solutions || []).forEach(s => (s.fitsPains || []).forEach(p =>
    t(`solution ${s.id}: fitsPains '${p}' exists in discovery.painPoints`, !!C.discovery.painPoints[p])));
  Object.entries(C.discovery.workloads).forEach(([k, w]) =>
    t(`discovery workload ${k}: platformSeed '${w.platformSeed}' exists in platforms.js`, C.platforms.some(pl => pl.id === w.platformSeed)));
})();

/* ---- determinism: same input twice = identical BOM ---- */
(() => {
  const i = { targets: [{ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, modelId: 'xe9780', railNic: { speed: '400GbE' } }], stack: 'dell', redundancy: 'dual', includeMgmt: true };
  const a = JSON.stringify(rec(i).bom), b = JSON.stringify(rec(i).bom);
  t('engine is deterministic', a === b);
})();

/* ---- G-006: MX7000 external FSE uplink count (regression) ----
 * The MX9116n FSE has 4 Ethernet uplink ports (2 dedicated 41-42 + 2 unified 43-44 in
 * Ethernet mode); an HA chassis runs 2 FSEs (A1/A2) => 8 external uplinks per chassis.
 * Corroborated verbatim by H18548.9.2 (June 2026) AND H19120 (March 2022) — see the
 * citation block on the mx7000 entry in platforms.js.
 * The original defect was count:4 (a 2x undercount) sitting next to a portOptions string
 * that said "4x per FSE (2 FSEs/chassis)" — the entry contradicted itself, and a rep
 * quoting an MX chassis got half the uplink optics they needed. */
(() => {
  const mx = window.CATALOG.platforms.find(p => p.id === 'mx7000');
  t('G-006: mx7000 platform entry exists', !!mx);
  const data = mx && mx.portGroups.find(g => g.role === 'data');
  t('G-006: MX7000 external uplinks = 8/chassis (4 per FSE x 2 FSEs)', data && data.count === 8, data && data.count);
  t('G-006: MX7000 uplinks are 100GbE QSFP28', data && data.speed === '100GbE' && data.media === 'QSFP28');
  // Self-consistency: the defect was the count disagreeing with the entry's OWN prose.
  // Pin both halves of the arithmetic so they cannot drift apart again silently.
  t('G-006: portOptions states the per-FSE count that multiplies to the declared count',
    data && /4×\s*100GbE QSFP28 Ethernet uplinks per FSE/.test(data.portOptions) && /×\s*2 FSEs\s*=\s*8\/chassis/.test(data.portOptions), data && data.portOptions);
  // The unified ports are Ethernet-OR-FC: a rep quoting an FC-attached chassis must be told
  // the 8 flexes down to 4. Ruling 2026-07-17.
  t('G-006: note warns the 2 unified ports/FSE are Ethernet-mode-only', data && /unified/i.test(data.note) && /Fibre Channel|FC/.test(data.note));
  t('G-006: an FC concern is surfaced to the rep', mx && mx.concerns.some(c => /unified/i.test(c) && /Fibre Channel|FC/.test(c)));
  // End-to-end: the count must actually reach the engine, not just sit in the catalog.
  const r = rec({ platformId: 'mx7000', units: 4, redundancy: 'dual', includeMgmt: true });
  const fe = r.fabrics.filter(f => f.network === 'frontend');
  t('G-006: engine reads 8 uplinks per chassis', fe.length > 0 && fe.every(f => f.linksPerUnit === 8), fe.map(f => f.linksPerUnit));
  t('G-006: engine sizes the frontend fabric off 8 uplinks/chassis (4 chassis = 32 links)',
    fe.length > 0 && fe.reduce((n, f) => n + (f.totalLinks || 0), 0) === 32,
    fe.map(f => f.totalLinks));
})();

/* ---- R11: cross-network merged switch lines must enumerate the breakdown (regression) ----
 * DERIVATIONS §1: switch lines merge by (model, role) ACROSS networks on purpose — that's the
 * correct BOM grouping — but "4 total" read as one undifferentiated pool erased which network
 * each unit belongs to. Priority case: PowerScale frontend + backend happen to pick the same
 * leaf model; backend MUST be a dedicated, physically-separate network (h16346) and the old
 * merged note ("Leaf/ToR — ... frontend (100GbE); 1/fabric × 4") never mentioned backend at all
 * — a rep reading the BOM saw one homogeneous frontend pool with no isolation visible. Same
 * defect, non-PowerScale case: any two targets/networks whose leaf ladder lands on the same
 * model (e.g. general + storage both sizing to S5248F-ON) merged the same way. */
(() => {
  // PowerScale: the maintainer's named priority case — backend isolation must survive the merge.
  const ps = rec({ platformId: 'powerscale', units: 12, redundancy: 'dual', includeMgmt: true });
  const psLeaf = ps.bom.find(l => l.category === 'Switch' && /S52/.test(l.model));
  t('R11/PowerScale: frontend+backend leaves merge into one line (same model, by design)',
    !!psLeaf, ps.bom.filter(l => l.category === 'Switch').map(l => l.model));
  t('R11/PowerScale: merged qty = frontend + backend leaves (nothing double-counted or dropped)',
    psLeaf && psLeaf.qty === 4, psLeaf && psLeaf.qty);
  t('R11/PowerScale: note enumerates BOTH networks, not just whichever fabric ran first',
    psLeaf && /frontend/.test(psLeaf.note) && /backend/.test(psLeaf.note), psLeaf && psLeaf.note);
  t('R11/PowerScale: note states the per-network split, not a bare total', psLeaf && /2×\s*frontend/.test(psLeaf.note) && /2×\s*backend/.test(psLeaf.note), psLeaf && psLeaf.note);
  t('R11/PowerScale: backend is flagged dedicated/isolated (h16346) — the isolation fact the old note masked',
    psLeaf && /backend \(dedicated/.test(psLeaf.note), psLeaf && psLeaf.note);
  t('R11/PowerScale: frontend is NOT flagged dedicated (only backend is h16346-mandated)',
    psLeaf && !/frontend \(dedicated/.test(psLeaf.note), psLeaf && psLeaf.note);
  t('R11/PowerScale: old masking behavior is gone — note no longer silently says "; +more"',
    psLeaf && psLeaf.note.indexOf('+more') < 0, psLeaf && psLeaf.note);
  // Arithmetic self-consistency: breakdown entries must sum to the printed qty (BOM-integrity
  // discipline — a generated note can never show a different total than the qty field).
  t('R11/PowerScale: per-network breakdown sums to the line qty',
    psLeaf && (psLeaf.note.match(/(\d+)×/g) || []).reduce((s, m) => s + parseInt(m, 10), 0) === psLeaf.qty,
    psLeaf && psLeaf.note);

  // General case (not backend-specific): general + storage leaves landing on the same model.
  const gs = rec({ targets: [{ platformId: 'poweredge-general', units: 20 }, { platformId: 'powerflex', units: 20 }],
    redundancy: 'dual', includeMgmt: true, networkArch: 'separate' });
  const gsLeaf = gs.bom.find(l => l.category === 'Switch' && /S5248F/.test(l.model));
  t('R11/general+storage: merged leaf line enumerates both networks', gsLeaf && /frontend/.test(gsLeaf.note) && /storage/.test(gsLeaf.note), gsLeaf && gsLeaf.note);
  t('R11/general+storage: neither network is flagged dedicated (only PowerScale-style backend is)',
    gsLeaf && !/dedicated/.test(gsLeaf.note), gsLeaf && gsLeaf.note);
  t('R11/general+storage: breakdown sums to qty', gsLeaf && (gsLeaf.note.match(/(\d+)×/g) || []).reduce((s, m) => s + parseInt(m, 10), 0) === gsLeaf.qty, gsLeaf && gsLeaf.note);

  // Regression guard: the common case (one network, no merge) must NOT gain the terse
  // "N total — ..." form — the detailed per-fabric note (model capacity, speed, leaves/fabric)
  // stays exactly as before. R11 only changes behavior at the moment of an actual cross-network
  // merge; it must not degrade the far more common single-network line.
  const single = rec({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true });
  const singleLeaf = single.bom.find(l => l.category === 'Switch');
  t('R11: single-network leaf line keeps the ORIGINAL detailed note (no regression)',
    singleLeaf && /^Leaf\/ToR —/.test(singleLeaf.note) && !/total —/.test(singleLeaf.note), singleLeaf && singleLeaf.note);
})();

/* ---- Sweep finding #5 (2026-07-17, maintainer ruling — GAPS G-023): railNicCage is a single
 * top-level engine input, not per-Target. Interim measure (no plumbing until a real deal demands
 * it): warn when 2+ AI targets exist, since they silently share one cage answer. ---- */
(() => {
  const single = rec({ targets: [{ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, railNic: { speed: '400GbE' } }], stack: 'dell', redundancy: 'dual', includeMgmt: true });
  t('sweep#5: 1 AI target — no shared-cage warning', !single.warnings.some(w => /rail-NIC-cage/.test(w.message)));

  const two = rec({ targets: [
    { platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, railNic: { speed: '400GbE' } },
    { platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, railNic: { speed: '800GbE' } }
  ], stack: 'dell', redundancy: 'dual', includeMgmt: true });
  const w = two.warnings.find(x => /rail-NIC-cage/.test(x.message));
  t('sweep#5: 2 AI targets — shared-cage warning present', !!w, two.warnings.map(x => x.message));
  t('sweep#5: warning names the count and the per-target verify action', w && /^2 AI targets/.test(w.message) && /PER TARGET/.test(w.message), w && w.message);

  const mixed = rec({ targets: [
    { platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, railNic: { speed: '400GbE' } },
    { platformId: 'powerstore', units: 4 }
  ], stack: 'dell', redundancy: 'dual', includeMgmt: true });
  t('sweep#5: 1 AI target + 1 non-AI target — no shared-cage warning (only AI targets count)',
    !mixed.warnings.some(x => /rail-NIC-cage/.test(x.message)));
})();

console.log(`unit-engine: ${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
