/* =============================================================================
 * SELF-TEST  --  "run accuracy checks" over the whole catalog + engine.
 * -----------------------------------------------------------------------------
 * Asserts catalog integrity and design invariants across every platform, every
 * reference architecture, and representative discovery scenarios. Open
 * selftest.html to run it in the browser; it also runs headlessly under Node.
 * Green = the app's current guidance is internally consistent.
 * ========================================================================== */
(function () {
  function runSelfTest() {
    const C = window.CATALOG, R = [];
    const ok = (name, cond, detail) => R.push({ name, pass: !!cond, detail: cond ? '' : (detail || '') });
    const swModels = C.switches.map(s => s.model), known = new Set(swModels);

    /* ---- catalog integrity ---- */
    ok('switches: unique ids', new Set(C.switches.map(s => s.id)).size === C.switches.length);
    ok('switches: unique models', new Set(swModels).size === swModels.length);
    ok('switches: required fields', C.switches.every(s => s.id && s.model && s.vendor && s.roles && s.access && s.source), 'need id/model/vendor/roles/access/source');
    ok('switches: specConfirmed + switchingCapacity + portsBySpeed', C.switches.every(s => typeof s.specConfirmed === 'boolean' && s.switchingCapacity && s.portsBySpeed));
    ok('optics: unique ids + specConfirmed flag', new Set(C.optics.map(o => o.id)).size === C.optics.length && C.optics.every(o => typeof o.specConfirmed === 'boolean'));
    ok('platforms: portGroups valid', C.platforms.every(p => p.portGroups && p.portGroups.length && p.portGroups.every(g => g.count && g.speed && g.media && g.network)), 'each portGroup needs count/speed/media/network');
    ok('rules: required blocks present', ['redundancy', 'mtu', 'oversubscription', 'growth', 'leafSpine', 'roce', 'aiFabric'].every(k => C.rules[k]));
    ok('reference architectures: shape', (C.referenceArchitectures || []).every(r => r.bom && r.bom.length && r.maxGpuNodes && r.source));
    ok('solutions: Verity has a BOM line', (C.solutions || []).some(s => s.id === 'verity' && s.bomLine && s.bomLine.category));
    ok('discovery: knowledge present', !!(C.discovery && C.discovery.competitors && C.discovery.workloads && C.discovery.painPoints));
    ok('discovery: workload seeds resolve to real platforms', Object.values(C.discovery.workloads).every(w => C.platforms.some(p => p.id === w.platformSeed)), 'a workload.platformSeed points at a missing platform');

    /* ---- engine sweep: every platform × redundancy × unit count ---- */
    const sweepFail = [];
    C.platforms.forEach(p => {
      [['dual', 4], ['single', 4], ['dual', 1], ['dual', 50], ['dual', 3]].forEach(pair => {
        const red = pair[0], units = pair[1];
        try {
          const res = window.recommend({ platformId: p.id, units, redundancy: red, growthHeadroom: 0.25, includeMgmt: true, stack: 'nvidia' });
          if (!res.bom.length) sweepFail.push(`${p.id}/${red}/${units}: empty BOM`);
          res.bom.forEach(l => { if (typeof l.qty === 'number' && l.qty <= 0) sweepFail.push(`${p.id}: qty<=0 (${l.model})`); });
          res.bom.filter(l => l.category === 'Switch' || l.category === 'Management').forEach(l => { if (!known.has(l.model)) sweepFail.push(`${p.id}: unknown model ${l.model}`); });
          res.fabrics.filter(f => f.network !== 'mgmt').forEach(f => { if (!f.leaf) sweepFail.push(`${p.id}: ${f.network} has no leaf`); });
          res.fabrics.forEach(f => { if (f.fabricsN === 2 && f.totalLeaves % 2 !== 0) sweepFail.push(`${p.id}: dual fabric odd leaves (${f.network})`); });
          if (red === 'dual' && units >= 3) {
            const errs = res.warnings.filter(w => w.severity === 'error');
            if (errs.length) sweepFail.push(`${p.id}/${red}/${units}: unexpected error → ${errs[0].message.slice(0, 70)}`);
          }
        } catch (e) { sweepFail.push(`${p.id}/${red}/${units}: threw ${e.message}`); }
      });
    });
    ok('engine: sweep all platforms × redundancy × units (no crashes / bad lines)', sweepFail.length === 0, sweepFail.slice(0, 6).join('  |  '));

    /* ---- single fabric always flags the redundancy error ---- */
    let singleOk = true;
    try { const r = window.recommend({ platformId: 'powerstore', units: 4, redundancy: 'single', growthHeadroom: 0, includeMgmt: true }); singleOk = r.warnings.some(w => w.severity === 'error'); } catch (e) { singleOk = false; }
    ok('validation: single-fabric raises a redundancy error', singleOk);

    /* ---- reference architectures ---- */
    const raFail = [];
    (C.referenceArchitectures || []).forEach(ra => {
      try {
        const r = window.recommendRA(ra.id, ra.maxGpuNodes);
        if (!r.isRA) raFail.push(ra.id + ': not flagged isRA');
        if (!r.bom.length) raFail.push(ra.id + ': empty BOM');
        r.bom.filter(l => l.category === 'Switch' || l.category === 'Management').forEach(l => { if (!known.has(l.model)) raFail.push(ra.id + ': unknown ' + l.model); });
      } catch (e) { raFail.push(ra.id + ': threw ' + e.message); }
    });
    ok('reference architectures: generate cleanly', raFail.length === 0, raFail.join('  |  '));

    /* ---- discovery guidance + platform mapping ---- */
    const discFail = [];
    try {
      const W = window.Wizard._test;
      [
        { vendor: 'cisco', workloads: ['ai'], pains: ['complexity'], dellPlat: ['poweredge-ai'], scale: 8, verity: 'yes', timeline: 'now' },
        { vendor: 'greenfield', workloads: ['block', 'nas'], pains: ['cost'], dellPlat: ['powerstore'], scale: 4, verity: 'no', timeline: 'year' },
        { vendor: 'arista', workloads: ['virtualization'], pains: ['lockin', 'support'], dellPlat: ['none'], scale: 12, verity: 'yes', timeline: 'quarter' }
      ].forEach(st => {
        W.setState(st, []);
        const g = W.compose(), plat = W.primaryPlatform();
        if (!C.platforms.some(p => p.id === plat)) discFail.push('primaryPlatform invalid: ' + plat);
        if (!g.headline || !g.positioning || !Array.isArray(g.portfolio)) discFail.push('guidance shape invalid');
      });
    } catch (e) { discFail.push('threw ' + e.message); }
    ok('discovery: guidance + platform mapping', discFail.length === 0, discFail.join('  |  '));

    /* ---- vendor no-mix (AI fabric = single vendor) ---- */
    const mixFail = [];
    ['nvidia', 'dell'].forEach(stk => {
      const r = window.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: stk, redundancy: 'dual', includeMgmt: true });
      r.fabrics.filter(f => f.workload === 'ai').forEach(f => {
        const vs = [f.leaf.vendor]; if (f.spine) vs.push(f.spine.vendor);
        vs.forEach(v => { const nv = /NVIDIA/i.test(v); if (stk === 'nvidia' && !nv) mixFail.push(`ai/nvidia has ${v}`); if (stk === 'dell' && nv) mixFail.push(`ai/dell has ${v}`); });
      });
    });
    ok('AI fabric is single-vendor (no Dell/NVIDIA mixing within a fabric)', mixFail.length === 0, mixFail.join('  |  '));

    /* ---- combined storage+servers triggers a shared leaf-spine ---- */
    const combo = window.recommend({ targets: [{ platformId: 'powerstore', units: 6 }, { platformId: 'poweredge-general', units: 20 }], redundancy: 'dual', includeMgmt: true });
    ok('combined storage + servers triggers a shared leaf-spine', !!combo.sharedSpine && combo.targets.length === 2, 'expected a shared spine across 2 targets');

    /* ---- AI fabric requires an explicit stack pick (no default) ---- */
    let forced = false;
    try { window.recommend({ platformId: 'poweredge-ai', units: 4, gpusPerServer: 8, redundancy: 'dual', includeMgmt: true }); } catch (e) { forced = /stack/i.test(e.message); }
    ok('AI fabric requires an explicit stack pick (no default)', forced);

    /* ---- PowerScale back-end is a dedicated (separate) spine group ---- */
    const ps = window.recommend({ platformId: 'powerscale', units: 12, redundancy: 'dual', includeMgmt: true });
    const be = ps.fabrics.find(f => f.network === 'backend'), fe = ps.fabrics.find(f => f.network === 'frontend');
    ok('PowerScale back-end kept a dedicated spine group (separate from front-end)', !!be && !!fe && be.spineGroupKey !== fe.spineGroupKey, 'back-end must not share the front-end spine');

    /* ---- new platforms: ObjectScale (dedicated back-end) + APEX HCI (storage) ---- */
    const osR = window.recommend({ platformId: 'objectscale', units: 6, redundancy: 'dual', includeMgmt: true });
    const osBe = osR.fabrics.find(f => f.network === 'backend'), osFe = osR.fabrics.find(f => f.network === 'frontend');
    ok('ObjectScale has a front-end + a dedicated private back-end fabric', !!osBe && !!osFe && osBe.spineGroupKey !== osFe.spineGroupKey, 'ObjectScale back-end must be its own group');
    const hciR = window.recommend({ platformId: 'apex-hci', units: 4, redundancy: 'dual', includeMgmt: true });
    ok('APEX / Azure Local HCI generates a storage fabric + BOM', hciR.fabrics.some(f => f.network === 'storage') && hciR.bom.length > 0 && hciR.warnings.some(w => /Azure Local|RDMA/i.test(w.message)));

    /* ---- NIC config drives the host port count ---- */
    const nicR = window.recommend({ platformId: 'poweredge-general', units: 10, redundancy: 'dual', includeMgmt: true, nic: { vendor: 'broadcom', speed: '25GbE', portsPerNic: 4, nicsPerUnit: 2 } });
    const nf = nicR.fabrics.find(f => f.network === 'frontend');
    ok('NIC config drives host port count (nicsPerUnit × portsPerNic)', !!nicR.context.nic && nf && nf.totalLinks === 10 * 2 * 4, 'expected 10×(2×4)=80 host links');

    /* ---- placement drives cable class: in-rack = DAC, structured = optics ---- */
    const inrack = window.recommend({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, placement: 'in-rack' });
    ok('in-rack placement selects passive DAC host cable', inrack.bom.some(b => /Host-to-leaf/.test(b.note || '') && /DAC/.test(b.item || '')));
    const struct = window.recommend({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, placement: 'structured' });
    ok('structured placement selects optical transceivers + notes structured cabling', struct.bom.some(b => /STRUCTURED/.test(b.note || '')) && struct.bom.some(b => /SR/.test(b.item || '') && /Host-to-leaf/.test(b.note || '')));
    // back-compat: legacy media:'fiber' still maps to structured optics
    const fib = window.recommend({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, media: 'fiber' });
    ok('legacy media:fiber maps to structured optics', fib.context.placement === 'structured' && fib.bom.some(b => /SR/.test(b.item || '') && /Host-to-leaf/.test(b.note || '')));

    /* ---- oversubscription target (traffic pattern) drives uplinks-per-leaf ---- */
    const ewD = window.recommend({ targets: [{ platformId: 'powerstore', units: 8 }, { platformId: 'poweredge-general', units: 40 }], redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
    const nsD = window.recommend({ targets: [{ platformId: 'powerstore', units: 8 }, { platformId: 'poweredge-general', units: 40 }], redundancy: 'dual', includeMgmt: true, trafficProfile: 'ns' });
    const ewF = ewD.fabrics.find(f => f.spine && f.uplinksPerLeaf), nsF = nsD.fabrics.find(f => f.spine && f.uplinksPerLeaf);
    ok('oversubscription target drives uplinks/leaf (east-west ≥ north-south)', !!ewF && !!nsF && ewF.uplinksPerLeaf >= nsF.uplinksPerLeaf && ewF.oversub <= nsF.oversub, 'east-west should add uplinks vs north-south');

    /* ---- spine COUNT scales with the oversubscription target (H18364.2 p.10: 2–8 spines) ---- */
    const ewG = window.recommend({ platformId: 'poweredge-general', units: 160, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
    const nsG = window.recommend({ platformId: 'poweredge-general', units: 160, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ns' });
    const ewGs = ewG.fabrics.find(f => f.spine), nsGs = nsG.fabrics.find(f => f.spine);
    ok('spine count scales with oversubscription (east-west needs more spines than north-south)', !!ewGs && !!nsGs && ewGs.spineCount > nsGs.spineCount && ewGs.spineCount <= 8, `ew=${ewGs && ewGs.spineCount} ns=${nsGs && nsGs.spineCount}`);

    /* ---- breakout: 400G spine port fans into 4×100G leaf uplinks ---- */
    const brkD = window.recommend({ targets: [{ platformId: 'powerstore', units: 8 }, { platformId: 'poweredge-general', units: 600 }], redundancy: 'dual', includeMgmt: true, breakout: 'on' });   // large fabric → Z-series 400G spine → breakout applies
    ok('breakout fans a high-speed spine port into multiple leaf uplinks', brkD.bom.some(b => /BREAKOUT/.test(b.note || '')) && brkD.fabrics.some(f => f.uplinkBreakout));
    const noBrk = window.recommend({ targets: [{ platformId: 'powerstore', units: 8 }, { platformId: 'poweredge-general', units: 600 }], redundancy: 'dual', includeMgmt: true, breakout: 'none' });
    ok('breakout:none uses straight (non-breakout) uplinks', !noBrk.fabrics.some(f => f.uplinkBreakout));

    /* ---- brownfield add-to-existing reuses the spine (not in the incremental BOM) ---- */
    const addD = window.recommend({ targets: [{ platformId: 'powerstore', units: 8 }, { platformId: 'poweredge-general', units: 40 }], redundancy: 'dual', includeMgmt: true, deployType: 'add', reuseExistingSpine: true });
    ok('add-to-existing reuses spine — no net-new shared spine switch line', addD.context.deploy === 'add' && !addD.bom.some(b => b.category === 'Switch' && /Shared spine/.test(b.note || '')));

    /* ---- small AI cluster fits without a spine (single switch/pair) ---- */
    const smallAi = window.recommend({ platformId: 'poweredge-ai', units: 2, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    const aiF = smallAi.fabrics.find(f => f.network === 'aifabric');
    ok('small AI (dual) = 2-switch pair minimum, no spine (ERA pattern — never a lone switch)', aiF && !aiF.spine && aiF.totalLeaves === 2, `leaves=${aiF && aiF.totalLeaves}`);
    const smallAi1 = window.recommend({ platformId: 'poweredge-ai', units: 2, gpusPerServer: 8, stack: 'nvidia', redundancy: 'single', includeMgmt: true });
    ok('small AI (single) allows 1 switch but flags the SPOF', smallAi1.fabrics.find(f => f.network === 'aifabric').totalLeaves === 1 && smallAi1.warnings.some(w => /SINGLE switch/i.test(w.message)));

    /* ---- NVIDIA stack cabled with NVIDIA LinkX optics; Dell stack is not ---- */
    const nvo = window.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    ok('NVIDIA AI fabric cabled with NVIDIA LinkX optics', nvo.bom.some(b => b.category === 'Cable/Optic' && b.vendor === 'NVIDIA'));
    const dlo = window.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true });
    ok('Dell AI stack uses no NVIDIA optics', !dlo.bom.some(b => b.vendor === 'NVIDIA'));

    /* ---- model drill-down: GPU generation sets rail speed / leaf ---- */
    const xe9780 = window.recommend({ targets: [{ platformId: 'poweredge-ai', modelId: 'xe9780', units: 8, gpusPerServer: 8 }], stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    const xaif = xe9780.fabrics.find(f => f.network === 'aifabric');
    ok('model drill-down: XE9780 (Blackwell) = 800GbE rails on SN5610', !!xaif && xaif.speed === '800GbE' && xaif.leaf.model === 'SN5610', 'Blackwell should be 800G on SN5610');
    const xe9680 = window.recommend({ targets: [{ platformId: 'poweredge-ai', modelId: 'xe9680', units: 8, gpusPerServer: 8 }], stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    ok('model drill-down: XE9680 (Hopper) = 400GbE rails', xe9680.fabrics.find(f => f.network === 'aifabric').speed === '400GbE');
    const f210 = window.recommend({ targets: [{ platformId: 'powerscale', modelId: 'f210', units: 6 }], redundancy: 'dual', includeMgmt: true });
    ok('model drill-down: PowerScale F210 = 25GbE front-end', f210.fabrics.find(f => f.network === 'frontend').speed === '25GbE');
    // single-platform modelId path (used by the Discovery flow)
    const discAi = window.recommend({ platformId: 'poweredge-ai', modelId: 'xe9780', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    ok('discovery (single-platform) modelId path applies the model', discAi.fabrics.find(f => f.network === 'aifabric').speed === '800GbE');

    /* ---- non-blocking: AI = rail-optimized folded Clos (1:1); east-west flags when unreachable ---- */
    const nbAi = window.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    const nbf = nbAi.fabrics.find(f => f.network === 'aifabric');
    // non-blocking is reachable TWO valid ways: a folded-Clos leaf-spine (oversub ≤ 1:1), OR a
    // collapsed 2-switch pair — 64 rails fit a 128-port SN5600 pair (the ERA "2 switches per
    // SU" shape; no spine, no oversub number, 1:1 by construction)
    ok('AI fabric is non-blocking (folded Clos ≤1:1, or a collapsed non-blocking pair)',
      nbf.nonBlocking === true && (nbf.spine ? (nbf.oversub <= 1.0 && nbf.aiFolded === true) : nbf.totalLeaves === 2), `spine=${!!nbf.spine} oversub=${nbf.oversub}`);
    const nbEw = window.recommend({ platformId: 'poweredge-general', units: 160, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
    const nbef = nbEw.fabrics.find(f => f.spine);
    ok('east-west non-blocking target is reported (met or flagged with remedy)', !!nbef && nbef.nonBlockingReq && (nbef.nonBlocking || nbEw.warnings.some(w => /non-blocking/i.test(w.message))));

    /* ---- edge / access: E-series SONiC MC-LAG PAIRS (no VLT/OS10) ---- */
    const edge = window.recommendEdge({ endpoints: 192, poe: 'poe++', accessSpeed: 'mgig', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
    ok('edge: E-series SONiC MC-LAG pairs (ICL between access pairs) + distribution pair', edge.bom.some(b => /E3248PXE/.test(b.model)) && edge.bom.some(b => /S5232F/.test(b.model)) && edge.bom.some(b => /MC-LAG ICL/.test(b.item || '')) && edge.context.edge.pairs === 2 && edge.fabrics[0].totalLeaves === 4 && edge.fabrics[0].uplinksPerLeaf === 2);
    ok('edge: SONiC-only (no VLT/OS10 — end-of-sale)', edge.fabrics[0].redundancyMethod === 'mclag' && edge.context.nos === 'sonic' && !edge.bom.some(b => /VLTi/.test(b.item || '')) && edge.warnings.some(w => /end-of-sale/i.test(w.message)));
    // OOB manages every network switch (not just hosts)
    const oobT = window.recommend({ targets: [{ platformId: 'powerstore', units: 6 }, { platformId: 'poweredge-general', units: 20 }], redundancy: 'dual', includeMgmt: true });
    const oobFab = oobT.fabrics.find(f => f.network === 'mgmt');
    ok('OOB manages network switches too (host mgmt + switch mgmt ports)', !!oobFab && oobFab.switchMgmt > 0 && oobFab.totalLinks === oobFab.hostMgmt + oobFab.switchMgmt);

    /* ---- FULL NVIDIA stack: every fabric + optic is NVIDIA (Cat6 copper excepted) ---- */
    const fullNv = window.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    const nonNv = fullNv.bom.filter(b => ['Switch', 'Management', 'Cable/Optic'].includes(b.category) && !/NVIDIA/i.test(b.vendor || '') && !/Cat6/.test(b.item || ''));
    ok('FULL NVIDIA stack: all switches + optics NVIDIA (storage/frontend/OOB included)', nonNv.length === 0 && fullNv.fabrics.filter(f => f.network !== 'mgmt').every(f => f.stack === 'nvidia'), nonNv.map(b => b.item).join('; ').slice(0, 60));

    /* ---- R14 Slice 3 (2026-07-23): DFM gate is a per-model catalog fact (window.dfmStatus),
     * exercised directly via window.Wizard._test.addVerity — the same function every wizard
     * entry point + the Expert Form call, rather than manually pushing the DFM line (which
     * bypasses the gate entirely and would test nothing about it). Covers all three shapes:
     * pure non-verify NVIDIA (not applicable → info line, no DFM line), pure verify-flagged
     * NVIDIA (DFM attaches, verify-flagged caveat), and mixed (scoped warning). ---- */
    const addVerity = window.Wizard._test.addVerity;
    // pure SN4700 (no dell-sonic path at all): DFM does NOT attach; info line names why.
    const allSn4700 = window.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 1, railNic: { speed: '100GbE' }, stack: 'nvidia', redundancy: 'dual', includeMgmt: false });
    ok('DFM gate: all-SN4700 design (no Dell-SONiC path) → status.applicable is false', window.dfmStatus(allSn4700).applicable === false);
    addVerity(allSn4700);
    ok('DFM gate: all-SN4700 design → NOT attached; info line explains why (NetQ/NVUE)', !allSn4700.bom.some(b => b.model === 'Dell Fabric Manager (DFM)') && allSn4700.warnings.some(w => w.severity === 'info' && /not applicable/i.test(w.message) && /NetQ|NVUE/.test(w.message)));
    // pure Dell stack: DFM attaches, no scope warning, no verify caveat added.
    const dellOnly = window.recommend({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true });
    addVerity(dellOnly);
    const dellDfmLine = dellOnly.bom.find(b => b.model === 'Dell Fabric Manager (DFM)');
    ok('DFM gate: pure Dell stack → attaches, no Spectrum verify caveat appended', !!dellDfmLine && !/Spectrum/.test(dellDfmLine.note));
    // mixed design (SN5600 dfmVerify + SN4700 non-verify, from the earlier FULL NVIDIA scenario's
    // general-NIC-group leaf): DFM attaches AND validate.js scopes it — real 2-switch-class case.
    const mixedNv = window.recommend({ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
    addVerity(mixedNv);
    ok('DFM gate: mixed SN5600(verify)+SN4700(non-verify) design → DFM still attaches', mixedNv.bom.some(b => b.model === 'Dell Fabric Manager (DFM)'));
    window.validateBOM(mixedNv);
    ok('DFM gate: mixed design → validate.js scopes DFM away from the non-Dell-SONiC-capable switches', mixedNv.warnings.some(w => w.severity === 'warn' && /DFM/.test(w.message) && /no Dell-SONiC path/i.test(w.message)));

    /* ---- storage protocol drives the fabric class ---- */
    const roce = window.recommend({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, storageProtocol: 'nvme-roce' });
    ok('NVMe-RoCE forces lossless + 1:1 storage fabric', roce.fabrics.find(f => f.network === 'storage').oversubTarget === 1.0 && roce.warnings.some(w => /LOSSLESS/.test(w.message)));
    const tcp = window.recommend({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, storageProtocol: 'nvme-tcp' });
    ok('NVMe/TCP stays a standard (2:1-capped) fabric', tcp.fabrics.find(f => f.network === 'storage').oversubTarget === 2.0 && tcp.warnings.some(w => /NVMe\/TCP/.test(w.message)));

    /* ---- fabric style: bonding architecture drives the ICL (BOM impact) ---- */
    const indep = window.recommend({ platformId: 'powermax', units: 2, redundancy: 'dual', includeMgmt: true, fabricInterconnect: 'independent', storageProtocol: 'nvme-tcp' });
    const indF = indep.fabrics.find(f => f.network === 'storage');
    ok('independent A/B fabrics (block+MPIO): no ICL in the BOM', indF.redundancyMethod === 'independent-ab' && indF.interconnectQty === 0 && !indep.bom.some(b => /ICL|VLTi/.test(b.item || '')) && indep.warnings.some(w => /INDEPENDENT A\/B/.test(w.message)));
    const sysB = window.recommend({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true, fabricInterconnect: 'independent', storageProtocol: 'nvme-tcp' });
    const sysF = sysB.fabrics.find(f => f.network === 'storage');
    ok('system-bond platform (PowerStore) overrides independent → MC-LAG + ICL kept + warning', sysF.redundancyMethod === 'mclag' && sysF.interconnectQty > 0 && sysB.warnings.some(w => /system bond/i.test(w.message)));
    ok('bond-mode guidance present (LACP vs independent+MPIO vs never-Static)', indep.warnings.some(w => /NEVER Static/i.test(w.message)));

    /* ---- PowerScale back-end: int-a/int-b independence (h16346) — no ICL ---- */
    const psbe = window.recommend({ platformId: 'powerscale', units: 6, redundancy: 'dual', includeMgmt: true });
    const psbeF = psbe.fabrics.find(f => f.network === 'backend');
    ok('PowerScale back-end = independent int-a/int-b (no ICL, no MC-LAG)', psbeF.redundancyMethod === 'independent-ab' && psbeF.interconnectQty === 0 && psbe.warnings.some(w => /int-a/.test(w.message)));

    /* ---- PowerScale back-end flat ladder: S5232 <=32, Z9664 FLAT 33-64 (OneFS Table 33) ---- */
    const beBig = window.recommend({ platformId: 'powerscale', units: 50, redundancy: 'dual', includeMgmt: true });
    const beBigF = beBig.fabrics.find(f => f.network === 'backend');
    ok('PowerScale BE 50 nodes: Z9664 FLAT per fabric (bigger flat before leaf-spine)', beBigF.leaf.model === 'Z9664F-ON' && beBigF.totalLeaves === 2 && !beBigF.spine && beBigF.redundancyMethod === 'independent-ab', beBigF.leaf.model + 'x' + beBigF.totalLeaves + ' spine=' + !!beBigF.spine);

    /* ---- network refresh: like-for-like at target speed, MC-LAG pairs + migration guidance ---- */
    const rf = window.recommendRefresh({ swCount: 8, portsPer: 48, speedNow: '10G', targetSpeed: '25g', topologyNow: '3tier', distribution: 'new', includeMgmt: true });
    ok('refresh: 8× 48-port → 8× S5248F MC-LAG pairs + distribution pair + migration guidance', rf.isRefresh === true && rf.bom.some(b => b.model === 'S5248F-ON' && b.qty === 8) && rf.context.edge.pairs === 4 && rf.bom.some(b => /ICL/.test(b.item || '')) && rf.warnings.some(w => /rack-by-rack/.test(w.message)) && rf.warnings.some(w => /cabling is REUSED/i.test(w.message)));
    const rf100 = window.recommendRefresh({ swCount: 4, portsPer: 48, targetSpeed: '100g', topologyNow: 'leafspine', distribution: 'new', includeMgmt: true });
    ok('refresh: 100G target on 48-port → S5448F with Z-series distribution', rf100.bom.some(b => b.model === 'S5448F-ON') && rf100.bom.some(b => /Z9664F/.test(b.model)));

    /* ---- edge: E3224F (fiber) + redundant = flagged (OS10-only, no SONiC MC-LAG) ---- */
    const fibEdge = window.recommendEdge({ endpoints: 48, poe: 'none', accessSpeed: 'fiber', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
    ok('edge: E3224F fiber + MC-LAG flagged as OS10-only conflict', fibEdge.warnings.some(w => w.severity === 'error' && /E3224F/.test(w.message)));
    ok('edge: stack-like positioning documented (one logical switch, hitless upgrades)', edge.warnings.some(w => /stack/i.test(w.message) && /one logical switch/i.test(w.message)));

    /* ---- inter-network connectivity: type + L2/L3 + config guidance ---- */
    const inet = window.recommend({ platformId: 'powerstore', units: 8, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, coreType: 'dci', coreLayer: 'l2', coreSpeed: '400GbE' });
    ok('inter-network: DCI + L2 captured with config guidance', !!inet.coreUplink && inet.coreUplink.type === 'dci' && inet.coreUplink.layer === 'l2' && inet.warnings.some(w => /DCI/.test(w.message)) && inet.bom.some(b => /inter-network/i.test(b.note || '')));

    /* ---- 800G host NIC (ConnectX-8) drives 800G host links ---- */
    const nic800 = window.recommend({ platformId: 'poweredge-general', units: 6, redundancy: 'dual', includeMgmt: true, nic: { vendor: 'nvidia', speed: '800GbE', portsPerNic: 1, nicsPerUnit: 2 } });
    ok('800G NIC (ConnectX-8) sizes 800GbE host links', nic800.fabrics.some(f => f.network === 'frontend' && f.speed === '800GbE'));

    const failed = R.filter(r => !r.pass).length;
    return { results: R, passed: R.length - failed, failed: failed, total: R.length };
  }
  window.runSelfTest = runSelfTest;
})();
