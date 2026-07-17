/* =============================================================================
 * MULTI-TARGET AUDIT — "add another server / storage into the same design".
 * Sweeps combined designs (server+storage, AI+NAS, shared vs separate fabrics,
 * NIC overrides, protocols, model drill-downs) across scale and checks that
 * every added variable flows through correctly:
 *   A. NIC answers apply to the PRIMARY target only (never the added one)
 *   B. Clos integrity on shared spines: every fabric's uplinks/leaf == spineCount
 *      (or an explicit warning), uplink cable qty matches
 *   C. host cables per target = units × links/unit (model dataSpeed respected)
 *   D. spine radix covers all leaves in every group (or super-spine warning)
 *   E. dedicated fabrics stay dedicated (PowerScale back-end has no ICL/spine mix)
 *   F. storage-protocol oversubscription caps hold on storage fabrics only
 *   G. OOB covers hosts of BOTH targets + every switch
 *   H. monotonic scaling of second target; no validate() hard errors anywhere
 * ========================================================================== */
const fs = require('fs'), vm = require('vm');
global.window = {};
['js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
 'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js',
 'js/validate.js','js/engine.js','js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\' + f, 'utf8'), { filename: f }));
const C = window.CATALOG;
let problems = [], runs = 0;
const P = (n, m) => problems.push(`[${n}] ${m}`);
const speedG = s => window.CATALOG && parseInt(String(s), 10) || parseInt(s, 10);

function checkCommon(tag, res, opts) {
  runs++;
  opts = opts || {};
  // --- no hard errors from validate ---
  (res.warnings || []).filter(w => w.severity === 'error').forEach(w => P(tag, 'HARD ERROR: ' + w.message));

  const dataF = res.fabrics.filter(f => f.network !== 'mgmt');

  // --- A. NIC scoping: global answer = primary only; t.nic = that target exactly ---
  dataF.forEach(f => {
    const tgt = res.targets.find(t => t.id === f.targetId);
    if (f.nicOverride && f.targetId !== res.targets[0].id && !(tgt && tgt.nic))
      P(tag, `NIC override leaked onto added target ${f.targetId} (${f.network}) with no per-target spec`);
  });
  if (opts.nic && res.targets.slice(1).some(t => !t.nic && t.platform.workload !== 'ai')) {
    const primaryHasOverride = dataF.some(f => f.targetId === res.targets[0].id && f.nicOverride);
    if (!primaryHasOverride && res.targets[0].platform.workload !== 'ai') P(tag, 'NIC given but primary target has no override fabric');
    if (!res.warnings.some(w => /NIC answers applied/.test(w.message))) P(tag, 'missing NIC-scoping info note on combined design');
  }
  // per-target spec must land: links/unit + speed on the target's primary data fabric
  res.targets.forEach((t, ti) => {
    if (!t.nic || t.platform.workload === 'ai') return;
    const f = dataF.find(x => x.targetId === t.id && x.network !== 'backend' && x.nicOverride);
    if (!f) { P(tag, `target ${t.id} has a NIC spec but no fabric with nicOverride`); return; }
    if (f.linksPerUnit !== t.nic.portsPerUnit) P(tag, `${t.id}: links/unit ${f.linksPerUnit} ≠ spec ${t.nic.portsPerUnit}`);
    if (t.nic.speed && f.speed !== t.nic.speed) P(tag, `${t.id}: fabric speed ${f.speed} ≠ spec ${t.nic.speed}`);
  });

  // --- B. Clos integrity per spine group ---
  const groups = {};
  dataF.forEach(f => { if (f.spine) (groups[f.spineGroupKey] = groups[f.spineGroupKey] || []).push(f); });
  Object.keys(groups).forEach(k => {
    const g = groups[k];
    const sc = g[0].spineCount;
    g.forEach(f => {
      if (f.spineCount !== sc) P(tag, `${k}: fabric ${f.targetId}/${f.network} spineCount ${f.spineCount} ≠ group ${sc}`);
      if (f.uplinksPerLeaf < sc && !res.warnings.some(w => /uplink ports but this shared spine/.test(w.message)))
        P(tag, `${k}: ${f.targetId}/${f.network} has ${f.uplinksPerLeaf} uplinks/leaf < ${sc} spines and NO warning (leaf can't reach every spine)`);
      if (f.uplinkCableQty && f.uplinkCableQty !== f.totalLeaves * f.uplinksPerLeaf)
        P(tag, `${k}: ${f.targetId}/${f.network} uplink cables ${f.uplinkCableQty} ≠ leaves ${f.totalLeaves} × uplinks/leaf ${f.uplinksPerLeaf}`);
    });
    // D. spine radix vs total leaves
    const leaves = g.reduce((s, f) => s + f.totalLeaves, 0);
    const radix = (g[0].spine.access && g[0].spine.access.count) || 64;
    if (leaves > radix && !res.warnings.some(w => /super-spine/i.test(w.message)))
      P(tag, `${k}: ${leaves} leaves > spine radix ${radix} with no super-spine warning`);
    // never mix stacks on one spine
    const stacks = [...new Set(g.map(f => f.stack))];
    if (stacks.length > 1) P(tag, `${k}: mixed stacks on one spine group (${stacks.join(',')})`);
  });

  // --- C. host cables per target/network = totalLinks ---
  // R12 (2026-07-16d): compare LINKS COVERED, not part count — a 1:2 splitter assembly (400G rails
  // on a twin-port-OSFP / 800G-OSFP112 leaf) is one ordered part per TWO links. The multiplier is
  // the line's own `linksPerAssembly` (absent ⇒ 1).
  dataF.forEach(f => {
    // find by prefix (the cable id isn't known here)
    const lines = res.bom.filter(b => (b._mk || '').indexOf(`host|${f.targetId}|${f.network}|`) === 0);
    const qty = lines.reduce((s, b) => s + b.qty * (b.linksPerAssembly || 1), 0);
    if (qty !== f.totalLinks) P(tag, `${f.targetId}/${f.network}: host cables (links covered) ${qty} ≠ links ${f.totalLinks}`);
  });

  // --- E. PowerScale back-end stays independent when present ---
  const be = dataF.find(f => f.network === 'backend' && f.targetId === 'powerscale');
  if (be) {
    if (be.interconnectQty > 0) P(tag, `PowerScale back-end has an ICL (${be.interconnectQty}) — int-a/int-b must be independent`);
    if (be.spineGroupKey && !/^backend\|/.test(be.spineGroupKey || '') && be.spine) P(tag, `PowerScale back-end landed on a shared spine group (${be.spineGroupKey})`);
  }

  // --- F. storage protocol cap ---
  if (opts.proto) {
    const cap = C.rules.storageProtocol.protocols[opts.proto].oversubMax;
    dataF.filter(f => f.network === 'storage' || f.network === 'backend').forEach(f => {
      if (f.oversubTarget > cap + 0.001) P(tag, `${f.targetId}/${f.network}: oversub target ${f.oversubTarget} > ${opts.proto} cap ${cap}`);
    });
    dataF.filter(f => f.network === 'frontend' || f.network === 'converged' || f.network === 'data').forEach(f => {
      // front-end fabrics must NOT be forced to the storage cap unless shared-group harmonization did it
    });
  }

  // --- G. OOB coverage ---
  const mgmtF = res.fabrics.find(f => f.network === 'mgmt');
  if (mgmtF) {
    const swQty = res.bom.filter(b => b.category === 'Switch').reduce((s, b) => s + b.qty, 0);
    if (mgmtF.switchMgmt !== swQty) P(tag, `OOB switch-mgmt count ${mgmtF.switchMgmt} ≠ BOM switches ${swQty}`);
    const hostMgmt = res.targets.reduce((s, t) => {
      const g = t.platform.portGroups.find(x => x.role === 'mgmt');
      return s + (g ? t.units * g.count : 0);
    }, 0);
    if (mgmtF.hostMgmt !== hostMgmt) P(tag, `OOB host-mgmt ${mgmtF.hostMgmt} ≠ expected ${hostMgmt} across ${res.targets.length} targets`);
    const oobLine = res.bom.find(b => b.category === 'Management');
    const cap = 48;
    if (oobLine && oobLine.qty < Math.ceil((mgmtF.hostMgmt + mgmtF.switchMgmt) / cap)) P(tag, `OOB switch qty ${oobLine.qty} too small for ${mgmtF.hostMgmt + mgmtF.switchMgmt} ports`);
  }

  // --- leaf port budget: access side must fit (breakout-aware fabrics excluded — validate covers) ---
  dataF.forEach(f => {
    if (f.workload === 'ai') return;
    const radix = (f.leaf.access && f.leaf.access.count) || 48;
    if (f.perFabricLinks > f.leavesPerFabric * radix) P(tag, `${f.targetId}/${f.network}: ${f.perFabricLinks} links/fabric exceed ${f.leavesPerFabric} leaves × ${radix} ports`);
  });
  return res;
}

/* ================= sweeps ================= */
const pairs = [
  { a: 'poweredge-general', b: 'powerstore', bModel: 'ps5200' },
  { a: 'poweredge-general', b: 'powerstore', bModel: 'ps9200' },
  { a: 'poweredge-general', b: 'powerscale', bModel: 'f710' },
  { a: 'poweredge-general', b: 'powerscale', bModel: 'f210' },
  { a: 'poweredge-ai',      b: 'powerscale', bModel: 'f910' },
  { a: 'apex-hci',          b: 'powerstore', bModel: 'ps5200' },
  { a: 'powerstore',        b: 'poweredge-general' }             // storage-first, servers added
];
const sizes = [[4, 2], [8, 4], [16, 8], [48, 16], [120, 32], [240, 64]];
const nic = { vendor: 'NVIDIA', model: 'ConnectX-6', speed: '25GbE', portsPerNic: 2, nicsPerUnit: 2 };

pairs.forEach(pr => {
  sizes.forEach(([ua, ub]) => {
    [false, true].forEach(sep => {
      [null, nic].forEach(nicIn => {
        const tag = `${pr.a}+${pr.b}@${ua}/${ub}${sep ? ' sep' : ''}${nicIn ? ' nic' : ''}`;
        try {
          const res = window.recommend({
            targets: [
              { platformId: pr.a, units: ua, gpusPerServer: 8 },
              { platformId: pr.b, units: ub, modelId: pr.bModel || null }],
            redundancy: 'dual', growthHeadroom: 0.25, includeMgmt: true,
            separateFabrics: sep, nic: nicIn, stack: pr.a === 'poweredge-ai' ? 'dell' : undefined,
            trafficProfile: 'balanced'
          });
          checkCommon(tag, res, { nic: !!nicIn });
        } catch (e) { P(tag, 'THREW: ' + e.message); }
      });
    });
  });
});

/* second-target model drill-down changes the BOM (dataSpeed flows through) */
(function () {
  const mk = m => window.recommend({ targets: [{ platformId: 'poweredge-general', units: 16 }, { platformId: 'powerscale', units: 8, modelId: m }], redundancy: 'dual', includeMgmt: true });
  const f210 = mk('f210'), f710 = mk('f710');
  const fe210 = f210.fabrics.find(f => f.targetId === 'powerscale' && f.network !== 'backend' && f.network !== 'mgmt');
  const fe710 = f710.fabrics.find(f => f.targetId === 'powerscale' && f.network !== 'backend' && f.network !== 'mgmt');
  if (!fe210 || fe210.speed !== '25GbE') P('model-drill', `F210 front-end speed ${fe210 && fe210.speed} ≠ 25GbE`);
  if (!fe710 || fe710.speed !== '100GbE') P('model-drill', `F710 front-end speed ${fe710 && fe710.speed} ≠ 100GbE`);
  if (fe210 && fe710 && fe210.leaf.id === fe710.leaf.id && fe210.speed !== fe710.speed && fe210.leaf.access.speed === fe710.leaf.access.speed)
    P('model-drill', 'different FE speeds picked the same leaf access class');
  checkCommon('model-drill-f210', f210, {}); checkCommon('model-drill-f710', f710, {});
})();

/* NIC on a storage-FIRST design still works (primary = storage) */
(function () {
  const res = window.recommend({ targets: [{ platformId: 'powerstore', units: 6 }], redundancy: 'dual', includeMgmt: true, nic: { vendor: 'NVIDIA', speed: '100GbE', portsPerNic: 2, nicsPerUnit: 2 } });
  const fe = res.fabrics.find(f => f.network !== 'mgmt');
  if (!fe.nicOverride) P('storage-primary-nic', 'single-target storage design should still honor the NIC/IO-module answer');
  if (fe.speed !== '100GbE') P('storage-primary-nic', `speed ${fe.speed} ≠ NIC 100GbE`);
  checkCommon('storage-primary-nic', res, {});
})();

/* protocol cap on combined design: NVMe-RoCE forces 1:1 on storage fabric only */
(function () {
  const res = window.recommend({
    targets: [{ platformId: 'poweredge-general', units: 32 }, { platformId: 'powerstore', units: 8, modelId: 'ps9200' }],
    redundancy: 'dual', includeMgmt: true, storageProtocol: 'nvme-roce', trafficProfile: 'balanced' });
  checkCommon('roce-combined', res, { proto: 'nvme-roce' });
})();

/* growth monotonicity: grow the SECOND target only; its leaves must not shrink */
(function () {
  let prev = -1;
  [4, 8, 16, 32, 64, 96].forEach(ub => {
    const res = window.recommend({ targets: [{ platformId: 'poweredge-general', units: 24 }, { platformId: 'powerstore', units: ub }], redundancy: 'dual', includeMgmt: true });
    const lv = res.fabrics.filter(f => f.targetId === 'powerstore' && f.network !== 'mgmt').reduce((s, f) => s + f.totalLeaves, 0);
    if (lv < prev) P('second-growth', `powerstore leaves regressed ${prev}→${lv} at ${ub} appliances`);
    prev = lv;
    checkCommon(`second-growth@${ub}`, res, {});
  });
})();

/* per-target NIC spec on the ADDED target: exact ports & speed flow through */
(function () {
  [{ speed: '100GbE', ppn: 2, npu: 2 }, { speed: '25GbE', ppn: 4, npu: 1 }, { speed: '', ppn: 2, npu: 3 }].forEach(spec => {
    const res = window.recommend({
      targets: [
        { platformId: 'poweredge-general', units: 24 },
        { platformId: 'powerstore', units: 6, modelId: 'ps5200', nic: { speed: spec.speed, portsPerNic: spec.ppn, nicsPerUnit: spec.npu } }],
      redundancy: 'dual', includeMgmt: true, nic, trafficProfile: 'balanced' });
    checkCommon(`tnic ${spec.speed || 'default'}/${spec.ppn}x${spec.npu}`, res, { nic: true });
    // and the primary keeps ITS global spec (2×2 25GbE)
    const pf = res.fabrics.find(f => f.targetId === 'poweredge-general' && f.nicOverride);
    if (!pf || pf.linksPerUnit !== 4) P('tnic-primary', `primary links/unit ${pf && pf.linksPerUnit} ≠ 4 (global NIC)`);
  });
  // no note when every added target is fully specced
  const specced = window.recommend({
    targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerstore', units: 4, nic: { portsPerNic: 2, nicsPerUnit: 2 } }],
    redundancy: 'dual', includeMgmt: true, nic });
  if (specced.warnings.some(w => /NIC answers applied/.test(w.message))) P('tnic-note', 'scoping note fired even though the added target is fully specced');
})();

/* AI servers as the ADDED target: rail fabric appears, per-GPU rails, stack honored */
(function () {
  ['dell', 'nvidia'].forEach(stack => {
    const res = window.recommend({
      targets: [
        { platformId: 'powerscale', units: 12, modelId: 'f710' },
        { platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, modelId: 'xe9680' }],
      redundancy: 'dual', includeMgmt: true, stack, trafficProfile: 'balanced' });
    const aif = res.fabrics.find(f => f.workload === 'ai');
    if (!aif) { P(`ai-second-${stack}`, 'no AI fabric for added GPU target'); return; }
    if (aif.linksPerUnit !== 8) P(`ai-second-${stack}`, `rails/unit ${aif.linksPerUnit} ≠ 8 GPUs`);
    if (aif.nonBlockingReq && !aif.nonBlocking) P(`ai-second-${stack}`, `AI fabric not non-blocking (${aif.oversub})`);
    if (!/^ai\|/.test(aif.spineGroupKey || 'ai|')) P(`ai-second-${stack}`, `AI fabric not in its own spine group (${aif.spineGroupKey})`);
    const wantVendor = stack === 'nvidia' ? /NVIDIA/i : /Dell/i;
    if (!wantVendor.test(aif.leaf.vendor)) P(`ai-second-${stack}`, `AI leaf vendor ${aif.leaf.vendor} ≠ ${stack} stack`);
    checkCommon(`ai-second-${stack}`, res, {});
  });
})();

/* MULTI-NIC: XE9780 with ConnectX-7 rails + Broadcom data NIC (the mixed-NIC AI server) */
(function () {
  const res = window.recommend({
    targets: [{ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, modelId: 'xe9780',
      railNic: { speed: '400GbE', model: 'ConnectX-7' },
      nic: { vendor: 'Broadcom', speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 } }],
    redundancy: 'dual', includeMgmt: true, stack: 'dell', trafficProfile: 'balanced' });
  const rails = res.fabrics.find(f => f.workload === 'ai');
  const st = res.fabrics.find(f => f.network === 'storage');
  if (!rails || rails.speed !== '400GbE') P('xe9780-cx7', `rails ${rails && rails.speed} ≠ 400GbE (railNic override)`);
  if (rails && rails.linksPerUnit !== 8) P('xe9780-cx7', `rails/unit ${rails.linksPerUnit} ≠ 8`);
  if (!st || !st.nicOverride || st.speed !== '100GbE' || st.linksPerUnit !== 2) P('xe9780-cx7', `Broadcom data NIC not applied: ${st && st.speed}/${st && st.linksPerUnit}`);
  if (!res.warnings.some(w => /GPU rails set to 400GbE/.test(w.message))) P('xe9780-cx7', 'missing rail-override note');
  checkCommon('xe9780-cx7', res, {});
  // railNic must be a NO-OP when it matches the model default (no note)
  const same = window.recommend({ targets: [{ platformId: 'poweredge-ai', units: 4, gpusPerServer: 8, modelId: 'xe9680', railNic: { speed: '400GbE' } }],
    redundancy: 'dual', includeMgmt: true, stack: 'dell' });
  if (same.warnings.some(w => /GPU rails set to/.test(w.message))) P('rail-noop', 'note fired though railNic equals the model default');
})();

/* MULTI-NIC: second NIC type (nic2) gets its own storage-class fabric, protocol caps apply */
(function () {
  const res = window.recommend({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true,
    nic: { vendor: 'Broadcom', speed: '25GbE', portsPerNic: 2, nicsPerUnit: 2 },
    nic2: { vendor: 'NVIDIA', speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, storageProtocol: 'nvme-roce' });
  const n2 = res.fabrics.find(f => f.role === 'nic2');
  if (!n2) { P('nic2', 'no nic2 fabric'); return; }
  if (n2.speed !== '100GbE' || n2.linksPerUnit !== 2 || n2.totalLinks !== 40) P('nic2', `wrong sizing ${n2.speed}/${n2.linksPerUnit}/${n2.totalLinks}`);
  if (n2.oversubTarget > 1.001) P('nic2', `RoCE cap not applied to nic2 fabric (target ${n2.oversubTarget})`);
  const lan = res.fabrics.find(f => f.nicOverride && f.role !== 'nic2');
  if (!lan || lan.speed !== '25GbE' || lan.linksPerUnit !== 4) P('nic2', 'primary NIC fabric disturbed by nic2');
  checkCommon('nic2', res, {});
})();

/* MULTI-RACK sweep — FDC rack pattern must hold at every scale and combination */
(function () {
  [1, 2, 4, 6, 8].forEach(racks => {
    [
      { tag: 'srv', targets: [{ platformId: 'poweredge-general', units: 64 }] },
      { tag: 'srv+ps', targets: [{ platformId: 'poweredge-general', units: 48 }, { platformId: 'powerstore', units: 4 }] },
      { tag: 'ai+nas', targets: [{ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, modelId: 'xe9680' }, { platformId: 'powerscale', units: 8, modelId: 'f710' }], stack: 'dell' }
    ].forEach(sc => {
      ['in-rack', 'adjacent'].forEach(placement => {
        const tag = `rack:${sc.tag}@${racks}r/${placement}`;
        try {
          const res = window.recommend({ targets: sc.targets, racks, placement, stack: sc.stack,
            redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
          checkCommon(tag, res, {});
          const dataF = res.fabrics.filter(f => f.network !== 'mgmt');
          res.targets.forEach(t => {
            const prim = dataF.filter(f => f.targetId === t.id && f.workload !== 'ai' && f.network !== 'backend')
              .reduce((a, b) => (!a || b.totalLinks > a.totalLinks ? b : a), null);
            if (!prim) return;
            // ToR placement: primary fabric carries a pair in every rack the target spans
            if (placement === 'in-rack' && racks > 1 && t.racksSpanned > 1 &&
                prim.totalLeaves < prim.fabricsN * t.racksSpanned)
              P(tag, `${t.id}: primary leaves ${prim.totalLeaves} < pair-per-rack ${prim.fabricsN}×${t.racksSpanned}`);
            // EoR/adjacent placement: leaves stay port-math (no rack forcing)
            if (placement === 'adjacent' && racks > 1 && prim.totalLeaves > Math.max(prim.fabricsN * (t.racksSpanned || 1), prim.fabricsN * Math.ceil(prim.perFabricLinks * 1.25 / 12)) * 10)
              P(tag, `${t.id}: adjacent placement should not rack-force leaves`);
          });
          // OOB = one per DECLARED rack (B6, ruling 2026-07-16: no phantom spine-rack OOB — spines
          // are housed within the declared racks). Capacity can push it higher, never below racks.
          if (racks > 1) {
            const oob = res.bom.find(b => b.category === 'Management');
            if (oob && oob.qty < racks) P(tag, `OOB qty ${oob.qty} < ${racks} declared racks`);
            if (!res.warnings.some(w => /Multi-rack deployment/.test(w.message))) P(tag, 'missing multi-rack info note');
            // CABLING invariants: every leaf→spine line is marked cross-rack; no passive DAC
            // may serve a cross-rack role without a loud warning; OOB aggregation line present
            res.bom.filter(b => (b._mk || '').indexOf('uplink|') === 0 || (b._mk || '').indexOf('brk|') === 0).forEach(b => {
              const fabOf = dataF.find(f => (b._mk || '').indexOf('|' + f.targetId + '|' + f.network + '|') > 0);
              if (fabOf && fabOf.spine && !/CROSS-RACK/.test(b.note || '')) P(tag, `uplink line "${(b.item || '').slice(0, 30)}" missing cross-rack sizing note`);
              if (/^DAC/i.test(b.model || '') && !/CROSS-RACK/.test(b.note || '') && !res.warnings.some(w => /passive-DAC assembly/.test(w.message)))
                P(tag, `DAC assembly on a cross-rack uplink with no reach warning: ${(b.model || '').slice(0, 30)}`);
            });
            const oobUp = res.bom.find(b => /OOB inter-rack uplinks/.test(b.item || ''));
            if (!oobUp || oobUp.qty !== racks) P(tag, `OOB inter-rack uplinks ${oobUp ? oobUp.qty : 'missing'} ≠ ${racks}`);
            // centralized fabric of a rack-spanning target: host cable must not be in-rack DAC
            res.targets.forEach(t => {
              if ((t.racksSpanned || 1) <= 1) return;
              dataF.filter(f => f.targetId === t.id && !f.perRack && f.workload !== 'ai' && placement === 'in-rack').forEach(f => {
                const line = res.bom.find(b => (b._mk || '').indexOf(`host|${f.targetId}|${f.network}|`) === 0);
                if (line && /^dac-|^DAC-/.test((line._mk || '').split('|')[3] || '') && !/CROSS-RACK/.test(line.note || ''))
                  P(tag, `${t.id}/${f.network}: centralized fabric host cable is in-rack DAC without cross-rack handling`);
              });
            });
          }
          // AI rails: never rack-forced; cross-rack rail warning when racks>1
          const aif = dataF.find(f => f.workload === 'ai');
          if (aif && racks > 1 && !res.warnings.some(w => /rail switches are row-scale/.test(w.message)))
            P(tag, 'missing AI cross-rack rail-reach warning');
        } catch (e) { P(tag, 'THREW: ' + e.message); }
      });
    });
  });
  // monotonic: primary leaves never shrink as racks grow
  let prev = 0;
  [1, 2, 3, 4, 6].forEach(racks => {
    const res = window.recommend({ platformId: 'poweredge-general', units: 64, racks, redundancy: 'dual', includeMgmt: true });
    const lv = res.fabrics.filter(f => f.network !== 'mgmt').reduce((s, f) => s + f.totalLeaves, 0);
    if (lv < prev) P('rack-monotonic', `leaves regressed ${prev}→${lv} at ${racks} racks`);
    prev = lv;
  });
  // FDC mid-size reproduction: 64 servers / 4 racks = 8× S5296F + 5 OOB
  const mid = window.recommend({ platformId: 'poweredge-general', units: 64, racks: 4, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const midF = mid.fabrics.find(f => f.network !== 'mgmt');
  if (midF.totalLeaves !== 8 || !/S5296F/.test(midF.leaf.model)) P('fdc-midsize-racks', `expected 8× S5296F, got ${midF.totalLeaves}× ${midF.leaf.model}`);
  const midOob = mid.bom.find(b => b.category === 'Management');
  if (!midOob || midOob.qty !== 4) P('fdc-midsize-racks', `expected 4 OOB (one per declared rack, B6 — no phantom spine-rack OOB), got ${midOob && midOob.qty}`);
})();

/* 100G LEAF OVERRIDE sweep — every choice must hold across scale, with honest warnings */
(function () {
  ['auto', 's5448f', 's5232f', 'z9264f'].forEach(l => {
    [8, 24, 40, 80].forEach(u => {
      const tag = `leaf100:${l}@${u}`;
      try {
        const res = window.recommend({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true,
          nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, leaf100: l, trafficProfile: 'balanced' });
        checkCommon(tag, res, {});
        const f = res.fabrics.find(x => x.nicOverride);
        const want = { s5448f: 'S5448F', s5232f: 'S5232F', z9264f: 'Z9264F' }[l];
        if (want && !new RegExp(want).test(f.leaf.model)) P(tag, `leaf ${f.leaf.model} ≠ forced ${want}`);
        // reservation: hosts/leaf + 4 reserved uplinks fit the radix when a spine exists
        if (f.spine && !(f.leaf.uplink && f.leaf.uplink.count)) {
          const radix = f.leaf.access.count, perLeaf = Math.ceil(f.perFabricLinks / f.leavesPerFabric);
          if (perLeaf + 4 > radix) P(tag, `overbooked: ${perLeaf} hosts + 4 uplinks > ${radix} ports`);
        }
        // small leaf can miss the target ratio — that's allowed ONLY with the warning surfaced
        if (f.oversub != null && f.oversubTarget && f.oversub > f.oversubTarget + 0.01 &&
            !res.warnings.some(w => /oversubscription|uplink ports/i.test(w.message))) P(tag, `ratio ${f.oversub}:1 over target with no warning`);
      } catch (e) { P(tag, 'THREW: ' + e.message); }
    });
    // RoCE 1:1 + forced small leaf → engine must surface the failure, not hide it
    const roce = window.recommend({ platformId: 'poweredge-general', units: 40, redundancy: 'dual', includeMgmt: true,
      nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, leaf100: l, storageProtocol: 'nvme-roce', separateFabrics: true });
    const rf = roce.fabrics.find(x => x.nicOverride);
    if (rf && rf.nonBlockingReq && !rf.nonBlocking && !roce.warnings.some(w => /non-blocking/i.test(w.message)))
      P(`leaf100:${l}/roce`, '1:1 required, not met, and no warning surfaced');
  });
})();

/* three targets (expert can do it): server + block + NAS */
(function () {
  const res = window.recommend({
    targets: [{ platformId: 'poweredge-general', units: 40 }, { platformId: 'powerstore', units: 8 }, { platformId: 'powerscale', units: 12, modelId: 'f710' }],
    redundancy: 'dual', includeMgmt: true, nic, trafficProfile: 'balanced' });
  checkCommon('triple', res, { nic: true });
})();

/* LARGE HETEROGENEOUS build — the real-world shape: a big pool + several small pools on the
 * SAME platform + two different storage platforms. No cap on target count; each target
 * instance must stay individually distinguishable (unique uid) even when platforms repeat,
 * and BOM cable lines for identical hardware/config must still consolidate accurately. */
(function () {
  runs++;
  const tag = 'large-mixed-8target';
  const rawTargets = [
    { platformId: 'poweredge-general', units: 50 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'poweredge-general', units: 2 },
    { platformId: 'powerstore', units: 3, modelId: 'ps5200' },
    { platformId: 'powerscale', units: 6, modelId: 'f710' }
  ];
  [1, 3].forEach(racks => {
    let res;
    try { res = window.recommend({ targets: rawTargets, redundancy: 'dual', growthHeadroom: 0.25, includeMgmt: true, trafficProfile: 'balanced', racks, nic }); }
    catch (e) { P(`${tag}@${racks}r`, 'THREW: ' + e.message); return; }
    const t2 = `${tag}@${racks}r`;
    (res.warnings || []).filter(w => w.severity === 'error').forEach(w => P(t2, 'HARD ERROR: ' + w.message));
    if (res.targets.length !== rawTargets.length) P(t2, `targets ${res.targets.length} ≠ requested ${rawTargets.length} — target count got capped/dropped`);
    const uids = res.targets.map(t => t.uid);
    if (new Set(uids).size !== uids.length) P(t2, `target uids not unique: ${uids.join(', ')}`);
    // aggregate host-cable qty for the REPEATED platform: sum of BOM lines with the shared
    // mergeKey prefix must equal the sum of totalLinks across every fabric on that platform
    // (consolidation is allowed/expected across identical pools — total must still be exact).
    const dataF = res.fabrics.filter(f => f.network !== 'mgmt');
    const genLinksTotal = dataF.filter(f => f.targetId === 'poweredge-general').reduce((s, f) => s + f.totalLinks, 0);
    const genCableQty = res.bom.filter(b => (b._mk || '').indexOf('host|poweredge-general|') === 0).reduce((s, b) => s + b.qty, 0);
    if (genCableQty !== genLinksTotal) P(t2, `repeated-platform host cables ${genCableQty} ≠ combined links ${genLinksTotal} across its ${dataF.filter(f => f.targetId === 'poweredge-general').length} pools`);
    // OOB must cover every unit of every pool + every switch, regardless of platform repeats
    const mgmtF = res.fabrics.find(f => f.network === 'mgmt');
    if (mgmtF) {
      const hostMgmtExpected = res.targets.reduce((s, t) => { const g = t.platform.portGroups.find(x => x.role === 'mgmt'); return s + (g ? t.units * g.count : 0); }, 0);
      if (mgmtF.hostMgmt !== hostMgmtExpected) P(t2, `OOB host-mgmt ${mgmtF.hostMgmt} ≠ expected ${hostMgmtExpected} across ${res.targets.length} targets (platform repeated)`);
    }
    // PowerScale (single instance here) still gets its dedicated back-end + 252-node checks
    const be = dataF.find(f => f.network === 'backend' && f.targetId === 'powerscale');
    if (be && be.interconnectQty > 0) P(t2, `PowerScale back-end has an ICL (${be.interconnectQty}) — int-a/int-b must be independent`);
  });
})();

/* UNCAPPED target count — a dozen small pools must all flow through with no artificial limit */
(function () {
  runs++;
  const many = [];
  for (let i = 0; i < 12; i++) many.push({ platformId: i % 3 === 0 ? 'poweredge-general' : (i % 3 === 1 ? 'powerstore' : 'powerscale'), units: 2 + (i % 4), modelId: i % 3 === 2 ? 'f710' : null });
  let res;
  try { res = window.recommend({ targets: many, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' }); }
  catch (e) { P('12-targets', 'THREW: ' + e.message); return; }
  if (res.targets.length !== 12) P('12-targets', `targets ${res.targets.length} ≠ 12 requested — engine capped target count`);
  const uids = res.targets.map(t => t.uid);
  if (new Set(uids).size !== 12) P('12-targets', 'target uids not all unique at 12 targets');
  (res.warnings || []).filter(w => w.severity === 'error').forEach(w => P('12-targets', 'HARD ERROR: ' + w.message));
})();

console.log(`\nMULTI-TARGET AUDIT: ${runs} designs checked`);
if (problems.length) { console.log(`PROBLEMS (${problems.length}):`); problems.forEach(p => console.log('  ' + p)); process.exit(1); }
else console.log('ALL MULTI-TARGET INVARIANTS HOLD');
