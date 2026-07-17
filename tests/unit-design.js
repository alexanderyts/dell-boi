/* =============================================================================
 * CANONICAL DESIGN LAYER — unit tests (js/design.js, Phase 2 foundation)
 * -----------------------------------------------------------------------------
 * Anchors the device layer TWO ways before any consumer relies on it:
 *   FAITHFUL — on designs the current engine sizes CORRECTLY (single-rack, so
 *     no B6 over-count), the device-list switch counts must EXACTLY equal the
 *     current BOM switch counts. The layer represents what the engine already
 *     computes; it must not silently change a correct design.
 *   CORRECTIVE — on the backtest design, the device list must produce the
 *     CORRECTED counts the golden fixtures pin (2 OOB, not the BOM's buggy 3).
 * Plus structural guarantees the layer embodies (B3/B6 kills, dedup, reuse).
 *
 * Cross-checking against the live engine's correct outputs — not just against
 * my own expected numbers — is the anchor: same-author expectation blindness
 * (see memory: adversarial-audit-method) can't hide a wrong count that
 * disagrees with the engine the whole tool already trusts.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
['js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
  'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
  'js/validate.js', 'js/engine.js', 'js/design.js'].forEach(f =>
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
const { buildDeviceList, groupDevicesForBom, buildCableList } = window.Design;
const rec = i => window.recommend(i);

let pass = 0; const fails = [];
function t(name, ok, detail) { if (ok) pass++; else fails.push(name + (detail !== undefined ? ` — ${JSON.stringify(detail)}` : '')); }

// device-list switch counts grouped by model (role-agnostic, to compare against BOM which merges cross-role)
const devCountsByModel = dl => dl.devices.reduce((m, d) => { m[d.model] = (m[d.model] || 0) + 1; return m; }, {});
// current BOM switch counts by model
const bomCountsByModel = r => r.bom.filter(b => b.category === 'Switch' || b.category === 'Management')
  .reduce((m, b) => { m[b.model] = (m[b.model] || 0) + (typeof b.qty === 'number' ? b.qty : 0); return m; }, {});

/* ---- FAITHFUL: single-rack designs the engine sizes correctly ---- */
const faithful = {
  'clean 20u single-rack (ToR pair)': { platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true },
  'PowerScale back-end 2-target (shared spine + dedicated backend)': { targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerscale', units: 6 }], redundancy: 'dual', includeMgmt: true },
  'AI 3-tier (super-spine dedup, 514 switches)': { platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 },
  'general 2-tier w/ spine (120u)': { platformId: 'poweredge-general', units: 120, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 }
};
Object.entries(faithful).forEach(([name, input]) => {
  const r = rec(input);
  const dl = buildDeviceList(r);
  t(`faithful [${name}]: not partial`, dl.partial === false);
  const dev = devCountsByModel(dl), bom = bomCountsByModel(r);
  const models = [...new Set([...Object.keys(dev), ...Object.keys(bom)])];
  models.forEach(m => t(`faithful [${name}]: ${m} device count == BOM count`, dev[m] === bom[m], { device: dev[m], bom: bom[m] }));
});

/* ---- CORRECTIVE: the backtest design — device list produces the FIXTURE counts,
 * not the engine's buggy BOM counts (B6: 2 OOB not 3) ---- */
(() => {
  const bt = rec({ targets: [{ platformId: 'poweredge-general', units: 60, nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 } }], racks: 2, redundancy: 'dual', deployType: 'add', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE', trafficProfile: 'balanced' });
  const dl = buildDeviceList(bt);
  const dev = devCountsByModel(dl);
  t('corrective [backtest]: S4348T-ON leaves == 4', dev['S4348T-ON'] === 4, dev['S4348T-ON']);
  t('corrective [backtest]: S5232F-ON spines == 2', dev['S5232F-ON'] === 2, dev['S5232F-ON']);
  t('corrective [backtest B6]: S3248T-ON OOB == 2 (declared racks) — NOT the old buggy 3', dev['S3248T-ON'] === 2, { device: dev['S3248T-ON'], bom: bomCountsByModel(bt)['S3248T-ON'] });
  // B6 is now FIXED in the engine too (rackMin = racks) — the device layer and the BOM now AGREE
  // on 2. (Before the B4/B6 increment the BOM still showed 3 and this asserted the divergence.)
  t('corrective [backtest B6]: device layer and engine BOM now AGREE on OOB == 2', dev['S3248T-ON'] === 2 && bomCountsByModel(bt)['S3248T-ON'] === 2);
})();

/* ---- STRUCTURAL: the bug-kills, proven on shape not just counts ---- */
(() => {
  // B3: S5232F-ON serves as BOTH leaf (2nd frontend fabric + backend) AND spine (shared group)
  // in the PowerScale design — grouping by (model, role) MUST keep them separate.
  const ps = rec({ targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerscale', units: 6 }], redundancy: 'dual', includeMgmt: true });
  const groups = groupDevicesForBom(buildDeviceList(ps).devices);
  const s5232 = groups.filter(g => g.model === 'S5232F-ON');
  t('structural B3: S5232F-ON appears as ≥2 distinct (model,role) groups (leaf AND spine), never merged', s5232.length >= 2, s5232.map(g => `${g.role}:${g.qty}`));
  t('structural B3: no group mixes roles (every group is one role)', groups.every(g => typeof g.role === 'string' && g.role.length > 0));
  // total across the S5232F groups equals the model's total device count (nothing lost/double-counted)
  const s5232total = s5232.reduce((s, g) => s + g.qty, 0);
  t('structural B3: split groups sum to the model total (7)', s5232total === 7, s5232total);

  // cross-fabric SAME-role DOES merge (maintainer decision): the shared spine group's qty is one
  // number spanning both frontend fabrics, with a per-network breakdown for the note.
  const spineGroup = s5232.find(g => g.role === 'spine');
  t('structural (cross-fabric merge): shared spine is ONE group with a networks breakdown', !!spineGroup && Object.keys(spineGroup.networks).length >= 1, spineGroup && spineGroup.networks);

  // B6: OOB never exceeds max(port-demand, racks); on a 4-rack design it's racks-driven, not racks+1
  const mr = rec({ platformId: 'poweredge-general', units: 64, racks: 4, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const oob = groupDevicesForBom(buildDeviceList(mr).devices).find(g => g.role === 'oob');
  t('structural B6: 4-rack OOB count == 4 (one per declared rack, not 5)', oob && oob.qty === 4, oob && oob.qty);

  // reuse: reuseExistingSpine → spine is EXTERNAL, not a device (no spine switch line will exist)
  const reuse = rec({ targets: [{ platformId: 'poweredge-general', units: 60, nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 } }], racks: 2, redundancy: 'dual', deployType: 'add', reuseExistingSpine: true, includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE', trafficProfile: 'balanced' });
  const rdl = buildDeviceList(reuse);
  const hasSpineDev = rdl.devices.some(d => d.role === 'spine');
  t('structural B2: reuseExistingSpine → NO spine device, spine modeled as external', !hasSpineDev && rdl.externals.some(e => /reused/.test(e.label)), { hasSpineDev, externals: rdl.externals.map(e => e.label) });

  // every device references a real catalog model (no ghost devices)
  const catalogModels = new Set(window.CATALOG.switches.map(s => s.model));
  const allReal = buildDeviceList(ps).devices.every(d => catalogModels.has(d.model));
  t('structural: every device references a real catalog model', allReal);
})();

/* ---- edge/RA return partial, not empty (a caller must not mistake unmodeled for empty) ---- */
(() => {
  const edge = window.recommendEdge({ endpoints: 96, poe: 'poe++', accessSpeed: 'mgig', includeMgmt: true });
  t('scope: edge path returns { partial: true }', buildDeviceList(edge).partial === true);
  t('scope: edge cable list returns { partial: true }', buildCableList(edge).partial === true);
  const ra = window.recommendRA(window.CATALOG.referenceArchitectures[0].id, 4);
  t('scope: RA path returns { partial: true }', buildDeviceList(ra).partial === true);
  t('scope: RA cable list returns { partial: true }', buildCableList(ra).partial === true);
})();

/* =============================================================================
 * CABLE LAYER (buildCableList) — anchored the SAME two ways as the device layer
 * (maintainer condition, 2026-07-16: every canonical layer gets faithful +
 * corrective anchoring). host| / uplink| only — the scope of this increment.
 *   FAITHFUL — on designs the engine cables correctly, each host|/uplink| cable
 *     record's qty AND optic id EXACTLY equal the engine's own BOM line (the
 *     record re-uses the engine's pickers, so it must not drift).
 *   CORRECTIVE — on the backtest / REPRO merge, unitsPerLink is declared per
 *     media class (copper = 1, NO DAC metadata) and the derived BOM copper line
 *     is scrubbed clean — B1 made structurally unrepresentable, not just fixed.
 * ========================================================================== */
(() => {
  // FAITHFUL: cable record qty+optic == engine host|/uplink| BOM line, per merge key
  const faithfulCables = {
    'clean 20u (ToR pair)': { platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true },
    'AI 16-node (DAC hosts + AOC uplinks)': { platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true },
    'general 2-tier w/ spine (120u)': { platformId: 'poweredge-general', units: 120, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 }
  };
  Object.entries(faithfulCables).forEach(([name, input]) => {
    const r = rec(input);
    const cl = buildCableList(r);
    t(`cable-faithful [${name}]: not partial`, cl.partial === false);
    const byKey = {}; cl.cables.forEach(c => { byKey[c.mergeKey] = c; });
    r.bom.filter(b => /^(host|uplink)\|/.test(b._mk || '')).forEach(b => {
      const c = byKey[b._mk];
      t(`cable-faithful [${name}]: ${b._mk} has a matching cable record`, !!c, b._mk);
      if (c) {
        t(`cable-faithful [${name}]: ${b._mk} qty ${b.qty} == record ${c.qty}`, c.qty === b.qty, { bom: b.qty, rec: c.qty });
        t(`cable-faithful [${name}]: ${b._mk} optic == record optic ${c.opticId}`, b._mk.split('|')[3] === c.opticId, { mk: b._mk, rec: c.opticId });
        // unitsPerLink is per media class: transceiver = 2 (one each end), everything else = 1
        t(`cable-faithful [${name}]: ${c.opticId} unitsPerLink matches media class`, c.unitsPerLink === (c.isTx ? 2 : 1), { media: c.media, upl: c.unitsPerLink });
      }
    });
  });

  // CORRECTIVE: the backtest copper host cable — media 'copper', unitsPerLink 1, no DAC metadata
  const bt = rec({ targets: [{ platformId: 'poweredge-general', units: 60, nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 } }], racks: 2, redundancy: 'dual', deployType: 'add', includeMgmt: true, includeCoreUplink: true, coreSpeed: '100GbE', trafficProfile: 'balanced' });
  const btCopper = buildCableList(bt).cables.find(c => c.role === 'host' && c.media === 'copper');
  t('cable-corrective [backtest]: copper host cable exists, unitsPerLink == 1 (no per-media DAC doubling)', !!btCopper && btCopper.unitsPerLink === 1, btCopper && btCopper.unitsPerLink);
  const btHostLine = bt.bom.find(b => /^host\|.*cat6a/.test(b._mk || ''));
  t('cable-corrective [backtest]: derived copper host note carries NO DAC/SFP metadata (B1 killed)',
    !!btHostLine && !/SFP28|Passive DAC|twinax|QSFP|AOC\b/i.test(btHostLine.note || ''), btHostLine && (btHostLine.note || '').slice(0, 80));

  // CORRECTIVE: the REPRO cross-fabric merge — ONE copper record at the true total (240), still 1/link
  const repro = (() => { const d = { targets: [{ platformId: 'poweredge-general', units: 60, nic: { speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 }, nic2: { speed: '1GBase-T', portsPerNic: 2, nicsPerUnit: 1, network: 'frontend' } }], racks: 2, redundancy: 'dual', deployType: 'add', includeMgmt: true, trafficProfile: 'balanced' }; return rec(d); })();
  const rCopper = buildCableList(repro).cables.find(c => c.role === 'host' && c.media === 'copper');
  t('cable-corrective [REPRO]: merged copper record links == 240 (120+120), unitsPerLink 1 → qty 240', !!rCopper && rCopper.qty === 240 && rCopper.unitsPerLink === 1, rCopper && { qty: rCopper.qty, upl: rCopper.unitsPerLink });
  t('cable-corrective [REPRO]: merged copper record shows a per-source breakdown (2 fabrics)', !!rCopper && rCopper.sources && rCopper.sources.length === 2, rCopper && rCopper.sources && rCopper.sources.length);
})();

console.log(`CANONICAL DESIGN LAYER (devices) — ${pass} passed`);
if (fails.length) { console.log(`✗ ${fails.length} failed:`); fails.forEach(f => console.log('  ' + f)); }
process.exit(fails.length ? 1 : 0);
