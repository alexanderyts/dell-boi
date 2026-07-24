/* =============================================================================
 * PHASE 1 INVARIANTS + GOLDEN FIXTURES  (docs/RESTRUCTURE-3.md, Phase 1)
 * -----------------------------------------------------------------------------
 * Runs against the CURRENT engine to pin the starting truth of the structural
 * redesign. The known backtest defects (docs/backtests/BACKTEST-2026-07-15.md,
 * B1–B5) are wired as XFAIL — expected failures that do NOT red the suite but
 * are inventoried on every run:
 *
 *     xfail: N known defects still open — B1, B2, ...
 *
 * That inventory line is the maintainer's Phase 2 progress meter (maintainer
 * requirement, 2026-07-16): Phase 2 drives N to zero; each fixed defect's
 * assertions flip to ordinary hard-fail guards and leave the list.
 *
 * XFAIL RULES (do not soften):
 *   - xfail suppresses ONLY the tagged, expected failures. Any untagged
 *     assertion failing → the suite fails loudly (real regression).
 *   - An xfail-tagged assertion that unexpectedly PASSES → the suite fails
 *     loudly with "investigate, don't celebrate": either the bug got fixed
 *     (flip the assertion to a hard guard and remove the tag) or the test
 *     stopped exercising it.
 *   - An XFAIL id that no assertion exercises at all → hard failure (a
 *     defect silently dropping out of the inventory is not progress).
 *
 * Invariants (RESTRUCTURE-3 Phase 1 + approved amendments):
 *   1. INPUT-EFFECT — every SIZING-classified input changes hardware, each
 *      paired with a base design where it is live (Amendment 6); plus the
 *      inverse completeness guard (Amendment 5): every input.* field the
 *      engine reads is classified in docs/contracts/INPUT-SCHEMA.md.
 *   2. LINE-ARITHMETIC — every checked BOM qty derives from structured
 *      fields (links × units-per-link etc.), incl. the B1 copper-metadata
 *      check.
 *   3. REFERENTIAL-INTEGRITY — switch models cited in notes exist as lines;
 *      line qty matches what its own note enumerates.
 *   4. GOLDEN FIXTURES — tests/fixtures/*.json pin the backtest's CORRECTED
 *      BOMs (structured essentials only, Amendment 3).
 *
 * TEMPORARY (Amendment 7): the note-enumeration clause of invariant 3 and the
 * _mk merge-key routing in invariant 2 parse strings the engine wrote,
 * because strings are all that exists today. This is exactly the scraping the
 * restructure retires — Phase 2 rewrites these against canonical-design
 * structured fields. Do NOT copy this pattern into new code.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
['js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
  'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
  'js/validate.js', 'js/engine.js', 'js/design.js'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
const C = window.CATALOG;

/* ---------- xfail harness ---------- */
const XFAIL = {
  // B1, B3, B5 FLIPPED to hard guards 2026-07-16 (RESTRUCTURE-3 Phase 2, canonical BOM
  // derivation — js/design.js applyCanonicalBom). Their assertions below are now ordinary
  // hard-fail guards (no tag): the merge/stale-note mechanism is dead, so if any regresses
  // the suite reds loudly instead of quietly xfailing. See docs/GAPS.md G-020 (shim register).
  // B2/B4/B6 FLIPPED to hard guards 2026-07-16 (RESTRUCTURE-3 Phase 2). B2: a reused spine is now a
  // canonical EXTERNAL endpoint — its note names it "existing (reused)" and the referential guard
  // exempts external models (real ghosts still fail). B4: single is single-homed + no ICL, dual gets
  // the MC-LAG/VLT peer-link. B6: OOB = declared racks.
  // B7 FLIPPED to a hard guard 2026-07-16 (RESTRUCTURE-3 Phase 2, J2/J3 build): recommendRefresh
  // includeCoreUplink now PRICES uplinks-to-existing-core through the coreVendor machinery (rf-core
  // line). M='0' — the defect meter is at ZERO; every backtest defect B1–B7 is a hard guard now.
};
/* FLAGGED CONFLICTS — findings NOT yet ruled on. Empty now: F1→B6 and F2→B7 were
 * both ruled tracked defects (2026-07-16). New conflicts found later land here. */
const FLAGS = {};
let nPass = 0;
const failures = [], unexpectedPasses = [], conflicts = [];
const openDefects = new Map();   // id -> [assertion names]
function t(name, ok, detail, tag) {
  const bIds = tag ? String(tag).split('/').filter(x => /^B\d/.test(x)) : [];
  const fIds = tag ? String(tag).split('/').filter(x => /^F\d/.test(x)) : [];
  if (bIds.length || fIds.length) {
    if (!ok) {
      bIds.forEach(id => { if (!openDefects.has(id)) openDefects.set(id, []); openDefects.get(id).push(name); });
      fIds.forEach(id => conflicts.push(`${id}: ${name}` + (detail !== undefined ? ` — ${JSON.stringify(detail)}` : '')));
    } else {
      unexpectedPasses.push(`[${tag}] ${name} — investigate, don't celebrate: if genuinely fixed, flip to a hard guard and drop the tag`);
    }
  } else {
    if (ok) nPass++;
    else failures.push(`${name}` + (detail !== undefined ? ` — got: ${JSON.stringify(detail)}` : ''));
  }
}

/* ---------- shared designs (Amendment 6: each field tested where it's LIVE) ---------- */
// The backtest canonical design (single dual-port 10GBase-T NIC — the OFFICIAL design under test)
const BT = () => ({
  targets: [{ platformId: 'poweredge-general', units: 60, nic: { vendor: 'Broadcom', speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 } }],
  racks: 2, redundancy: 'dual', deployType: 'add', includeMgmt: true,
  includeCoreUplink: true, coreSpeed: '100GbE', trafficProfile: 'balanced'
});
// The as-run merge REPRO: + a 1GBase-T second NIC on the same 'frontend' network —
// reproduces the observed 240-Cat6A / 8-leaf / 16-AOC merged lines (B1/B3/B5, traced 2026-07-16)
const REPRO = () => { const d = BT(); d.targets[0].nic2 = { speed: '1GBase-T', portsPerNic: 2, nicsPerUnit: 1, network: 'frontend' }; return d; };
const REUSE = () => Object.assign(BT(), { reuseExistingSpine: true });                       // B2 repro
const TOR = () => ({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true });   // ToR pair (ICL/nos live)
const AI = () => ({ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true });
const G25 = (over) => Object.assign({ platformId: 'poweredge-general', units: 80, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 }, over || {});
const TWO = (over) => Object.assign({ targets: [{ platformId: 'poweredge-general', units: 20 }, { platformId: 'powerstore', units: 4 }], redundancy: 'dual', includeMgmt: true }, over || {});

const rec = i => window.recommend(i);
// hardware signature: Switch/Management/Cable lines as identity|qty (model for switches,
// full item string for cables so terminology differences — VLT vs MC-LAG per J1 — count)
const sig = r => r.bom
  .filter(b => b.category === 'Switch' || b.category === 'Management' || b.category === 'Cable/Optic')
  .map(b => `${b.category}|${b.category === 'Cable/Optic' ? b.item : b.model}|${b.qty}`).sort().join(' ~ ');

/* =============================================================================
 * INVARIANT 1 — INPUT-EFFECT: every SIZING field changes hardware
 * ========================================================================== */
(() => {
  const pairs = [
    // [field label, inputA, inputB, xfailTag?]
    ['targets[].units', BT(), Object.assign(BT(), { targets: [Object.assign(BT().targets[0], { units: 12 })], racks: 1 }), null],
    ['targets[].platformId', { platformId: 'poweredge-general', units: 20, redundancy: 'dual' }, { platformId: 'powerstore', units: 20, redundancy: 'dual' }, null],
    // xe9680 (400G rails) vs xe9780 (800G rails) — NOTE: xe9780 vs xe9785 are two SAME-speed
    // models and legitimately produce identical networking; the pair must span a speed step.
    ['targets[].modelId (AI drill-down)', Object.assign(AI(), { modelId: 'xe9680' }), Object.assign(AI(), { modelId: 'xe9780' }), null],
    ['targets[].gpusPerServer', AI(), Object.assign(AI(), { gpusPerServer: 4 }), null],
    ['targets[].railNic.speed', Object.assign(AI(), { railNic: { speed: '400GbE' } }), Object.assign(AI(), { railNic: { speed: '100GbE' } }), null],
    ['nic.speed', BT(), (() => { const d = BT(); d.targets[0].nic.speed = '25GbE'; return d; })(), null],
    ['nic.portsPerNic', BT(), (() => { const d = BT(); d.targets[0].nic.portsPerNic = 4; return d; })(), null],
    ['nic.nicsPerUnit', BT(), (() => { const d = BT(); d.targets[0].nic.nicsPerUnit = 2; return d; })(), null],
    ['nic2 present vs absent', BT(), REPRO(), null],
    ['redundancy dual vs single (BACKTEST B4 — flipped: single is single-homed + fewer switches, no ICL)', BT(), Object.assign(BT(), { redundancy: 'single' }), null],
    // 'nos sonic vs os10' pair REMOVED (R14, 2026-07-23, maintainer ruling: "OS10 shouldn't be
    // quoted, it's end of sale" — dropped portfolio-wide). recommend() now pins nos:'sonic'
    // unconditionally; input.nos no longer changes hardware on this (new-build) path, so this
    // pair would fail the INPUT-EFFECT premise by design, not by regression. `nos` is
    // reclassified PINNED in INPUT-SCHEMA.md (was SIZING). The inverse regression guard —
    // proving os10 is silently ignored rather than the pin quietly breaking — lives just below.
    ['growthHeadroom 0 vs 1 (single-rack so port math, not racks, drives leaves)', G25({ racks: 1 }), G25({ racks: 1, growthHeadroom: 1 }), null],
    ['fabricArchitecture converged vs separate (2 targets)', TWO({ fabricArchitecture: 'converged' }), TWO({ fabricArchitecture: 'separate' }), null],
    ['placement in-rack vs structured', G25(), G25({ placement: 'structured' }), null],
    ['structuredInPlace (on structured base)', G25({ placement: 'structured' }), G25({ placement: 'structured', structuredInPlace: true }), null],
    ['breakout on vs none (400×25G spine class)', { platformId: 'poweredge-general', units: 400, redundancy: 'dual', trafficProfile: 'balanced', breakout: 'on' }, { platformId: 'poweredge-general', units: 400, redundancy: 'dual', trafficProfile: 'balanced', breakout: 'none' }, null],
    ['racks 1 vs 4', G25({ racks: 1 }), G25({ racks: 4 }), null],
    // override keys carry NO '-on' suffix (engine.js:322/328: 's5448f'/'s5232f'/'z9264f', 's5212f'…)
    ['leaf25 override s5248f vs s5296f', G25({ leaf25: 's5248f' }), G25({ leaf25: 's5296f' }), null],
    ['leaf100 override s5232f vs z9264f (100G hosts)', { platformId: 'poweredge-general', units: 40, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, redundancy: 'dual', leaf100: 's5232f' }, { platformId: 'poweredge-general', units: 40, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, redundancy: 'dual', leaf100: 'z9264f' }, null],
    // uplinks-per-leaf only turns into HARDWARE once a spine exists (a ToR-only design computes
    // uplinksPerLeaf but prices no uplinks) — 120 units genuinely builds the spine tier.
    ['trafficProfile ew vs ns (at spine scale)', G25({ units: 120, trafficProfile: 'ew' }), G25({ units: 120, trafficProfile: 'ns' }), null],
    ['storageProtocol none vs nvme-roce (converged 2-target base — RoCE forces separation)', TWO({ fabricArchitecture: 'converged' }), TWO({ fabricArchitecture: 'converged', storageProtocol: 'nvme-roce' }), null],
    ['reuseExistingSpine (on deployType add)', BT(), REUSE(), null],
    ['stack dell vs nvidia (AI)', AI(), Object.assign(AI(), { stack: 'nvidia' }), null],
    // NOT on a PowerStore base: storage back-end ToR is ALREADY air-gapped by default
    // (beIndependent), so the toggle is dead there — a general-compute ToR pair is where it's live.
    ['fabricInterconnect mclag vs independent (general ToR pair)', { platformId: 'poweredge-general', units: 12, redundancy: 'dual', includeMgmt: true }, { platformId: 'poweredge-general', units: 12, redundancy: 'dual', includeMgmt: true, fabricInterconnect: 'independent' }, null],
    ['includeMgmt true vs false', BT(), Object.assign(BT(), { includeMgmt: false }), null],
    ['includeCoreUplink false vs true', Object.assign(BT(), { includeCoreUplink: false }), BT(), null],
    ['coreSpeed 100G vs 400G', BT(), Object.assign(BT(), { coreSpeed: '400GbE' }), null],
    ['coreType core vs dci (reach class)', BT(), Object.assign(BT(), { coreType: 'dci' }), null],
    ['coreReach auto vs longreach', BT(), Object.assign(BT(), { coreReach: 'longreach' }), null],
    ['borderLeaf (needs spine + core)', BT(), Object.assign(BT(), { borderLeaf: true }), null],
    // J2/J3 NEW SIZING inputs (INPUT-SCHEMA §1.4) — each must change hardware:
    ['uplinkTarget new-spine vs existing-core (BT has 4 leaves)', Object.assign(BT(), { uplinkTarget: 'new-spine' }), Object.assign(BT(), { uplinkTarget: 'existing-core' }), null],
    ['coreVendor dell vs other (far-side optic quoted or not)', Object.assign(BT(), { coreVendor: 'dell' }), Object.assign(BT(), { coreVendor: 'other' }), null],
    ['coreFarPort SMF/LR vs MMF/SR (far port reach → optic class, coreVendor dell)', Object.assign(BT(), { coreVendor: 'dell', coreFarPort: { media: 'SMF', connector: 'LC' } }), Object.assign(BT(), { coreVendor: 'dell', coreFarPort: { media: 'MMF', connector: 'MPO' } }), null]
  ];
  pairs.forEach(([label, a, b, tag]) => {
    let ok, det;
    try { const sa = sig(rec(a)), sb = sig(rec(b)); ok = sa !== sb; det = ok ? undefined : '(hardware identical)'; }
    catch (e) { ok = false; det = 'THREW: ' + e.message; }
    t(`input-effect: ${label}`, ok, det, tag);
  });

  // R14 (2026-07-23): explicit guard that nos:'os10' is SILENTLY IGNORED on new-build
  // recommend() — the inverse of the removed input-effect pair above. Proves the pin didn't
  // quietly regress (sonic and os10 inputs must be hardware-IDENTICAL) and that no VLT/OS10
  // terminology leaks into a new-build BOM regardless of what's passed.
  (() => {
    const sonicRes = rec(Object.assign(TOR(), { nos: 'sonic' })), os10Res = rec(Object.assign(TOR(), { nos: 'os10' }));
    t('R14: nos:sonic vs nos:os10 produce IDENTICAL new-build hardware (OS10 dropped, ruling 2026-07-23)',
      sig(sonicRes) === sig(os10Res), { sonic: sig(sonicRes), os10: sig(os10Res) });
    t('R14: new-build BOM never says VLT/VLTi/OS10, even when nos:os10 is explicitly forced',
      !os10Res.bom.some(b => /\bVLT\b|VLTi|OS10/.test(b.item || '') || /\bVLT\b|VLTi|OS10/.test(b.note || '')));
  })();

  // edge + refresh + RA entry points
  const edgePairs = [
    ['edge endpoints 48 vs 192', { endpoints: 48 }, { endpoints: 192 }],
    ['edge poe none vs poe++', { endpoints: 96, poe: 'none', accessSpeed: '1g' }, { endpoints: 96, poe: 'poe++' }],
    ['edge accessSpeed 1g vs mgig', { endpoints: 96, accessSpeed: '1g' }, { endpoints: 96, accessSpeed: 'mgig' }],
    ['edge edgeRedundancy single vs redundant', { endpoints: 96, edgeRedundancy: 'single' }, { endpoints: 96 }],
    ['edge edgeUplink sfp vs 100g', { endpoints: 96, edgeUplink: 'sfp' }, { endpoints: 96 }],
    ['edge distribution existing vs new', { endpoints: 96, distribution: 'existing' }, { endpoints: 96, distribution: 'new' }],
    ['edge includeMgmt', { endpoints: 96, includeMgmt: false }, { endpoints: 96, includeMgmt: true }]
  ];
  edgePairs.forEach(([label, a, b]) => {
    let ok, det;
    try { const sa = sig(window.recommendEdge(a)), sb = sig(window.recommendEdge(b)); ok = sa !== sb; det = ok ? undefined : '(hardware identical)'; }
    catch (e) { ok = false; det = 'THREW: ' + e.message; }
    t(`input-effect: ${label}`, ok, det);
  });
  const refreshPairs = [
    ['refresh swCount 8 vs 16', { swCount: 8, portsPer: 48, targetSpeed: '25g', distribution: 'new' }, { swCount: 16, portsPer: 48, targetSpeed: '25g', distribution: 'new' }],
    ['refresh portsPer 24 vs 48', { swCount: 8, portsPer: 24, targetSpeed: '25g', distribution: 'new' }, { swCount: 8, portsPer: 48, targetSpeed: '25g', distribution: 'new' }],
    ['refresh targetSpeed 25g vs 100g', { swCount: 8, portsPer: 48, targetSpeed: '25g', distribution: 'new' }, { swCount: 8, portsPer: 48, targetSpeed: '100g', distribution: 'new' }],
    ['refresh distribution existing vs new', { swCount: 8, portsPer: 48, targetSpeed: '25g', distribution: 'existing' }, { swCount: 8, portsPer: 48, targetSpeed: '25g', distribution: 'new' }],
    // B7 (was F2; ruled a tracked defect 2026-07-16): hardware-inert today — flips
    // context.edge.upPerSw but recommendRefresh prices uplink cables only inside the
    // needSpine branch. SIZING per INPUT-SCHEMA §2.2. Phase-2 fix wired through J3 coreHandoff.
    ['refresh includeCoreUplink (B7 flipped — now prices uplinks-to-existing-core)', { swCount: 8, portsPer: 48, targetSpeed: '25g', distribution: 'existing', includeCoreUplink: false }, { swCount: 8, portsPer: 48, targetSpeed: '25g', distribution: 'existing', includeCoreUplink: true }, null]
  ];
  refreshPairs.forEach(([label, a, b, tag]) => {
    let ok, det;
    try { const sa = sig(window.recommendRefresh(a)), sb = sig(window.recommendRefresh(b)); ok = sa !== sb; det = ok ? undefined : '(hardware identical)'; }
    catch (e) { ok = false; det = 'THREW: ' + e.message; }
    t(`input-effect: ${label}`, ok, det, tag);
  });
  try {
    const ras = C.referenceArchitectures;
    // NOTE: the two ERA briefs (2-8-5-200 / 2-8-9-400) legitimately share identical
    // NETWORKING hardware at equal node counts — the pair must span genuinely different
    // fabrics, so compare an ERA against the GB300 published-path RA.
    const pubRa = ras.find(r => r.published) || ras[1];
    t('input-effect: RA raId (ERA vs GB300 published)', sig(window.recommendRA(ras[0].id, 4)) !== sig(window.recommendRA(pubRa.id, 4)));
    t('input-effect: RA nodes 2 vs 6', sig(window.recommendRA(pubRa.id, 2)) !== sig(window.recommendRA(pubRa.id, 6)));
  } catch (e) { t('input-effect: RA pairs no exception', false, e.message); }

  /* Amendment 5 — inverse completeness: every input.* field the engine reads is
   * classified somewhere in the INPUT-SCHEMA contract. A field added to the engine
   * but never classified fails HERE instead of silently escaping the regime. */
  const src = fs.readFileSync(path.join(ROOT, 'js/engine.js'), 'utf8');
  const contract = fs.readFileSync(path.join(ROOT, 'docs/contracts/INPUT-SCHEMA.md'), 'utf8');
  const fields = [...new Set([...src.matchAll(/\binput\.([A-Za-z_$][A-Za-z0-9_$]*)/g)].map(m => m[1]))];
  const unclassified = fields.filter(f => contract.indexOf('`' + f) < 0);
  t('inverse completeness: every engine-read input.* field is classified in INPUT-SCHEMA.md',
    unclassified.length === 0, unclassified);
})();

/* =============================================================================
 * INVARIANT 2 — LINE-ARITHMETIC: BOM qtys derive from structured fields
 * TEMPORARY (Amendment 7): lines are routed to their rule via _mk merge-key
 * strings — Phase 2 replaces this with canonical cable records.
 * ========================================================================== */
(() => {
  const opticById = id => C.optics.find(o => o.id === id);
  const isTx = id => { const o = opticById(id); return !!o && o.category === 'transceiver'; };

  function checkDesign(designKey, res, tags) {
    const dataF = res.fabrics.filter(f => f.network !== 'mgmt');
    const fabricsFor = (target, network) => dataF.filter(f => f.targetId === target && f.network === network);
    res.bom.forEach(b => {
      const mk = b._mk || '';
      let expected = null, rule = '';
      if (/^host\|/.test(mk)) {
        const [, target, network, optic] = mk.split('|');
        const hostLinks = fabricsFor(target, network).reduce((s, f) => s + (f.totalLinks || 0), 0);
        // R12 (2026-07-16d): a host line is not always 1 part per link. A 1:2 splitter/breakout
        // assembly (400G rails on a twin-port-OSFP or 800G-OSFP112 leaf) carries TWO links per
        // ordered part, so expected qty = ceil(links ÷ linksPerAssembly). The divisor is read from
        // the LINE ITSELF, so this invariant, the printed note arithmetic, and the ordered quantity
        // all derive from one number and cannot drift apart (the maintainer's "units can't disagree"
        // condition on the splitter ruling).
        const lpa = b.linksPerAssembly || 1;
        expected = Math.ceil(hostLinks / lpa);
        rule = lpa > 1 ? `host links ÷ ${lpa} per assembly (${hostLinks} links)`
          : 'host links × 1' + (isTx(optic) ? ' (switch-side of a 2-optic link)' : '');
      } else if (/^hostnic\|/.test(mk)) {
        const [, target, network] = mk.split('|');
        expected = fabricsFor(target, network).reduce((s, f) => s + (f.totalLinks || 0), 0);
        rule = 'host/NIC-side optics × 1 per link';
      } else if (/^uplink\|/.test(mk)) {
        const [, target, network, optic] = mk.split('|');
        const per = isTx(optic) ? 2 : 1;
        expected = fabricsFor(target, network).reduce((s, f) => s + (f.uplinkCableQty || 0), 0) * per;
        rule = `uplink links × ${per}`;
      } else if (/^brk\|/.test(mk)) {
        const [, target, network] = mk.split('|');
        expected = fabricsFor(target, network).reduce((s, f) => s + (f.uplinkBreakout ? Math.ceil((f.uplinkCableQty || 0) / f.uplinkBreakout.ratio) : 0), 0);
        rule = 'breakout assemblies = links ÷ ratio';
      } else if (mk === 'core') {
        expected = (res.coreUplink && res.coreUplink.count) || 0;
        rule = 'core uplinks × 1 our-side transceiver per port';
      } else if (mk === 'core-patch') {
        expected = ((res.coreUplink && res.coreUplink.count) || 0) * 2;
        rule = 'core patch cords × 2 per link';
      } else if (mk === 'mgmtuplink') {
        expected = res.context && res.context.racks;
        rule = 'OOB inter-rack uplinks = 1 per rack';
      } else return;   // other mergeKey classes: out of Phase-1 arithmetic scope (see header)
      if (expected == null || !(expected > 0)) return;
      const tag = (tags && tags[mk.split('|')[0]]) || null;
      t(`line-arithmetic [${designKey}]: "${(b.item || '').slice(0, 48)}…" qty ${b.qty} == ${rule} (${expected})`,
        b.qty === expected, { qty: b.qty, expected }, tag);
    });

    // '+more' HARD GUARD (B3 flipped 2026-07-16): the canonical BOM derivation regenerates
    // every merged note from structured totals, so a stale '+more' marker must NEVER survive
    // on any design. Was tag-only-when-present; now a positive absence assertion on every design.
    const moreLines = res.bom.filter(b => /\+more/.test(b.note || ''));
    t(`line-arithmetic [${designKey}]: no line carries a stale '+more' merged-note marker`,
      moreLines.length === 0, moreLines.map(b => (b.model || b.item || '').slice(0, 30)));

    // B1 metadata HARD GUARD (flipped 2026-07-16): a copper host line's NOTE carries no DAC/optic metadata
    res.bom.forEach(b => {
      const mk = b._mk || '';
      if (/^host\|/.test(mk)) {
        const optic = opticById(mk.split('|')[3]);
        if (optic && optic.category === 'copper') {
          const dirty = /SFP28|Passive DAC|twinax|QSFP|AOC\b/i.test(b.note || '');
          t(`line-arithmetic [${designKey}]: copper RJ45 host line carries NO DAC/SFP metadata`, !dirty, (b.note || '').slice(0, 100));
        }
      }
    });
  }

  checkDesign('BASE', rec(BT()), null);
  // REPRO / AI once carried the B3 merge (REPRO: two 'frontend' NIC fabrics merged 240 Cat6A /
  // 16 AOC with stale notes; AI: Z9864F & S5232F leaf+spine cross-ROLE merges). The canonical
  // derivation (js/design.js) now splits by (model,role) and regenerates notes, so these are
  // ordinary hard guards — the '+more' and note-enumeration assertions must pass, untagged.
  checkDesign('REPRO', rec(REPRO()), null);
  checkDesign('TOR', rec(TOR()), null);
  checkDesign('AI', rec(AI()), null);
  checkDesign('G25-structured', rec(G25({ placement: 'structured' })), null);
  checkDesign('BRK', rec({ platformId: 'poweredge-general', units: 400, redundancy: 'dual', trafficProfile: 'balanced', breakout: 'on' }), null);
})();

/* =============================================================================
 * INVARIANT 3 — REFERENTIAL-INTEGRITY
 * Clause 1: every switch model a note cites exists as a Switch/Management line.
 * Clause 2 (TEMPORARY note-parsing, Amendment 7): a line's qty matches the
 * count its own note enumerates.
 * ========================================================================== */
(() => {
  const models = C.switches.map(s => s.model);
  function checkDesign(designKey, res, tags) {
    const present = new Set(res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && b.model).map(b => b.model));
    // B2 flipped 2026-07-16: a model cited in a note with no switch line is a GHOST — UNLESS it's a
    // reused EXTERNAL endpoint (the customer's own hardware, canonical §1.3). The device layer's
    // externals list is the authority; a reused spine legitimately has no line, so exempt it. A
    // non-external ghost still fails hard (the guard stays meaningful).
    const externalModels = new Set(((window.Design ? window.Design.buildDeviceList(res).externals : []) || []).map(e => e.model).filter(Boolean));
    // clause 1 — notes only (item/desc strings carry catalog marketing text like "SN4700-class ports")
    res.bom.filter(b => b.category === 'Cable/Optic').forEach(b => {
      models.forEach(m => {
        if ((b.note || '').indexOf(m) >= 0 && !present.has(m) && !externalModels.has(m)) {
          t(`referential [${designKey}]: note cites ${m} but no such switch line exists (and it is not a reused external)`, false, (b.note || '').slice(0, 90), (tags && tags.ghost) || null);
        }
      });
    });
    // clause 2 — TEMPORARY note-enumeration parse (see file header)
    res.bom.forEach(b => {
      const note = b.note || '', mk = b._mk || '';
      let m;
      // switch / host / uplink note-enumeration HARD GUARDS (B3/B1/B5 flipped 2026-07-16):
      // every canonically-derived line's note enumerates its own qty — a merged line's note is
      // regenerated to the true total, never left stale. Untagged: a mismatch is a real regression.
      if ((b.category === 'Switch' || b.category === 'Management') && (m = note.match(/(\d+)\/fabric × (\d+)/))) {
        const enumd = parseInt(m[1], 10) * parseInt(m[2], 10);
        t(`referential [${designKey}]: switch line qty ${b.qty} == note's ${m[0]} (${enumd}) for ${b.model}`,
          b.qty === enumd, { qty: b.qty, enumd });
      }
      if (/^host\|/.test(mk) && (m = note.match(/(\d+) link\(s\)/))) {
        const enumd = parseInt(m[1], 10);
        t(`referential [${designKey}]: host line qty ${b.qty} == note's "${m[0]}"`,
          b.qty === enumd, { qty: b.qty, enumd });
      }
      if (/^uplink\|/.test(mk) && !isTxMk(mk) && (m = note.match(/(\d+)\/leaf × (\d+)/))) {
        const enumd = parseInt(m[1], 10) * parseInt(m[2], 10);
        t(`referential [${designKey}]: uplink line qty ${b.qty} == note's ${m[0]} (${enumd})`,
          b.qty === enumd, { qty: b.qty, enumd });
      }
    });
  }
  const isTxMk = mk => { const o = C.optics.find(x => x.id === mk.split('|')[3]); return !!o && o.category === 'transceiver'; };

  checkDesign('BASE', rec(BT()), null);
  checkDesign('REUSE', rec(REUSE()), null);   // B2 flipped — reused spine is a recognized external, not a ghost
  checkDesign('REPRO', rec(REPRO()), null);
  checkDesign('TOR', rec(TOR()), null);
  checkDesign('AI', rec(AI()), null);
})();

/* =============================================================================
 * INVARIANT 4 — GOLDEN FIXTURES (backtest CORRECTED BOMs)
 * Structured-essentials diff only (Amendment 3): category + line identity
 * (model / merge-key match) + qty. Exception: Fixture B's phrase-absence check.
 * ========================================================================== */
(() => {
  const FIXDIR = path.join(__dirname, 'fixtures');
  fs.readdirSync(FIXDIR).filter(f => f.endsWith('.json')).sort().forEach(file => {
    const fx = JSON.parse(fs.readFileSync(path.join(FIXDIR, file), 'utf8'));
    let res;
    try { res = window[fx.engine](fx.input); } catch (e) { t(`fixture ${fx.name}: generates`, false, e.message); return; }
    if (fx.verity) {   // replicate the UI's DFM add (app.js addVerity) — engine doesn't emit Software lines
      const v = (C.solutions || []).find(x => x.id === 'verity');
      if (v) res.bom.push(Object.assign({}, v.bomLine));
    }
    const fxKey = file.replace(/\.json$/, '');
    fx.expected.forEach(exp => {
      const re = new RegExp(exp.match, 'i');
      const matches = res.bom.filter(b => b.category === exp.category &&
        re.test(exp.on === 'model' ? (b.model || '') : exp.on === 'mk' ? (b._mk || '') : (b.item || '')));
      const got = matches.reduce((s, b) => s + (typeof b.qty === 'number' ? b.qty : 0), 0);
      t(`fixture ${fxKey}: ${exp.label} — qty ${exp.qty}`, got === exp.qty, { got, expected: exp.qty }, exp.knownDiff);
    });
    if (fx.noExtraSwitchModels) {
      const expectedModels = new Set(fx.expected.filter(e => e.on === 'model').map(e => e.match.replace(/[\^\$]/g, '')));
      const extras = res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && b.model && !expectedModels.has(b.model)).map(b => b.model);
      t(`fixture ${fxKey}: no switch models beyond the fixture's expected set`, extras.length === 0, extras);
    }
    (fx.phraseAbsence || []).forEach(pa => {
      const hits = res.bom.filter(b => ((b.note || '') + ' ' + (b.item || '')).indexOf(pa.phrase) >= 0);
      t(`fixture ${fxKey}: ${pa.label}`, hits.length === 0, hits.map(b => (b.item || '').slice(0, 40)), pa.knownDiff);
    });
  });
})();

/* =============================================================================
 * INVARIANT 5 — INPUT-SUMMARY ACCURACY (backtest 2026-07-16, R5)
 * Every host-driving NIC in the input must appear in the output: the header
 * lists ALL NICs with the true total ports/unit, and each NIC gets an unpriced
 * reference line (NICs are quoted with the server config, not this BOM — but the
 * demand source must be visible). A summary that under-reports the config makes
 * correct hardware look wrong (this nearly caused a false defect report).
 * ========================================================================== */
(() => {
  const dualNic = { targets: [{ platformId: 'poweredge-general', units: 40, nic: { vendor: 'Broadcom', speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 }, nic2: { vendor: 'Broadcom', speed: '1GBase-T', portsPerNic: 2, nicsPerUnit: 1, network: 'frontend' } }], racks: 2, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' };
  const r = rec(dualNic);
  t('input-summary: header lists BOTH NICs (not just the primary)', r.context.nics && r.context.nics.length === 2, r.context.nics && r.context.nics.length);
  t('input-summary: total ports/unit reflects both NICs (2+2 = 4)', r.context.nicPortsPerUnit === 4, r.context.nicPortsPerUnit);
  t('input-summary: nicSummary names both NIC speeds', /10GBase-T/.test(r.context.nicSummary || '') && /1GBase-T/.test(r.context.nicSummary || ''));
  const refs = r.bom.filter(b => b.category === 'Reference' && b.unpriced);
  t('input-summary: one UNPRICED reference line per NIC (2)', refs.length === 2, refs.length);
  t('input-summary: reference lines name each NIC speed', refs.some(b => /10GBase-T/.test(b.item || '')) && refs.some(b => /1GBase-T/.test(b.item || '')));
  t('input-summary: reference lines state "quoted with the server config"', refs.length > 0 && refs.every(b => /server config/i.test(b.note || '')));
  // GENERAL: no NIC that drove a fabric is silently omitted from the output
  const bomText = r.bom.map(b => (b.item || '') + ' ' + (b.note || '')).join(' ');
  t('input-summary: every input NIC speed appears in the output (no silent omission)', (r.context.nics || []).every(n => bomText.indexOf(n.speed) >= 0));
})();

/* =============================================================================
 * INVARIANT 6 — CONNECTIVITY (backtest 2026-07-16b, R6): every leaf switch in a
 * design has an uplink PATH (to a spine, or to the customer core). A stranded
 * leaf is an unbuildable BOM — R6 shipped 6 of 8 leaves with no uplink because
 * existing-core built a fixed 2 core uplinks. Structural check on the canonical
 * design/link layer (js/design.js checkConnectivity).
 * ========================================================================== */
(() => {
  const connDesigns = {
    'BT dual 2-rack': BT(),
    'REPRO dual-NIC': REPRO(),
    'general 120u spine': G25({ units: 120 }),
    'AI 3-tier': Object.assign(AI(), { units: 1200, growthHeadroom: 0 }),
    'existing-core 8-leaf (R6 repro)': { targets: [{ platformId: 'poweredge-general', units: 60, nic: { speed: '25GbE', portsPerNic: 2, nicsPerUnit: 1 } }], racks: 4, redundancy: 'dual', deployType: 'add', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE', coreVendor: 'dell', uplinkTarget: 'existing-core', trafficProfile: 'balanced' },
    'existing-core single-rack': { platformId: 'poweredge-general', units: 40, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE', uplinkTarget: 'existing-core' }
  };
  Object.entries(connDesigns).forEach(([name, input]) => {
    const conn = window.Design.checkConnectivity(rec(input));
    t(`connectivity [${name}]: every leaf has an uplink path (none stranded)`, conn.ok, conn.stranded);
  });
  // R6 corrective: existing-core core uplinks SCALE with the leaves (2 per pair), not a fixed 2
  const r6 = rec(connDesigns['existing-core 8-leaf (R6 repro)']);
  const leaves = r6.fabrics.filter(f => f.network !== 'mgmt' && !f.spine).reduce((s, f) => s + f.totalLeaves, 0);
  t('R6: existing-core core uplinks == leaf count (every pair uplinks to core, no stranding)', (r6.coreUplink && r6.coreUplink.count) === leaves, { core: r6.coreUplink && r6.coreUplink.count, leaves });
  t('R6: far-side + patch scale with the core uplinks too', r6.bom.filter(b => b._mk === 'core-far').reduce((s, b) => s + b.qty, 0) === leaves);
})();

/* ---------- report ---------- */
console.log(`PHASE 1 INVARIANTS + GOLDEN FIXTURES — ${nPass} passed hard assertions`);
const ids = Object.keys(XFAIL).filter(id => openDefects.has(id));
const missing = Object.keys(XFAIL).filter(id => !openDefects.has(id) && !unexpectedPasses.some(u => u.indexOf(`[${id}]`) >= 0 || u.indexOf(id) >= 0));
console.log(`xfail: ${ids.length} known defects still open — ${ids.join(', ')}`);
ids.forEach(id => console.log(`  ${id} — ${XFAIL[id]}  (${openDefects.get(id).length} assertion(s))`));
if (conflicts.length) {
  console.log(`FLAGGED CONFLICT (needs maintainer ruling — not in the approved B1–B5 defect list):`);
  [...new Set(conflicts.map(c => c.split(':')[0]))].forEach(fid => {
    console.log(`  ${fid}: ${FLAGS[fid] || '(unregistered flag id — add it to FLAGS)'}  (${conflicts.filter(c => c.indexOf(fid + ':') === 0).length} assertion(s))`);
  });
}
if (unexpectedPasses.length) { console.log(`✗ UNEXPECTED PASSES (${unexpectedPasses.length}):`); unexpectedPasses.forEach(u => console.log('  ' + u)); }
if (missing.length) { console.log(`✗ XFAIL ids not exercised by any assertion: ${missing.join(', ')} — a defect silently dropped out of the inventory`); }
if (failures.length) { console.log(`✗ FAILURES (${failures.length}):`); failures.forEach(f => console.log('  ' + f)); }
process.exit((failures.length || unexpectedPasses.length || missing.length) ? 1 : 0);
