/* =============================================================================
 * ACCURACY & STANDARDS CHECKS
 * -----------------------------------------------------------------------------
 * Runs against a completed recommendation. Adds warnings with severity:
 *   'verify' = must confirm before quoting a customer
 *   'error'  = violates a Dell design standard
 *   'warn'   = review / likely needs a decision
 *   'info'   = good-practice reminder / requirement to configure
 * Every check cites its source so you can defend it to a customer.
 * ========================================================================== */
(function () {
  const C = window.CATALOG;

  function push(res, severity, message, source) {
    res.warnings.push({ severity, message, source: source || '' });
  }
  // Shared with engine.js (window.hasFabricUplink) — was hand-duplicated here verbatim until a
  // 2026-07-13 audit flagged the drift risk. A switch's `uplink` field is only a real dedicated
  // fabric-uplink port class when it's meant for spine-facing traffic (see switches.js SN5610/
  // SN5600D notFabricUplink comments: their 1-2× 25GbE is a mgmt/breakout-assist port).
  // Looked up lazily (not captured at load time) — validate.js's <script> tag runs before
  // engine.js's, so `window.hasFabricUplink` doesn't exist yet at THIS line; it does by the time
  // validateBOM() is actually called (always after recommend() has run).
  function hasFabricUplink(leaf) { return window.hasFabricUplink(leaf); }

  function validateBOM(res) {
    const R = C.rules;
    const p = res.platform;
    const targets = res.targets || [{ platform: p, units: res.context.units }];
    const plats = targets.map(t => t.platform);

    // 1. Verification gate (two-stage accuracy model) ----------------------
    const specOnly = res.bom.filter(l => l.specConfirmed && l.verify).length;
    const unconfirmed = res.bom.filter(l => !l.specConfirmed && l.verify).length;
    const skuSeeded = res.bom.filter(l => l.verify && l.dellPN && l.dellPN !== 'verify' && /\d{3}-[A-Z]{4}/.test(l.dellPN)).length;
    if (skuSeeded) {
      push(res, 'verify',
        `${skuSeeded} cable/optic line(s) carry Dell SKUs verified against live dell.com product pages (2026-07-10). ` +
        `Pick the length variant per your rack runs and confirm KIT TYPE when quoting — Customer Kit (CusKit) vs factory-install SKUs differ.`,
        'dell.com product pages · corpus/dellcom-apd-verified.json');
    }
    if (specOnly) {
      push(res, 'verify',
        `${specOnly} line(s): model + specs CONFIRMED vs the source Dell doc — ` +
        `only the orderable Dell SKU still needs lookup in Dell ordering tools before quoting. ` +
        `SWITCHES are configure-to-order: the SKU depends on airflow direction (IO/PSU), PSU count, and the OS/support bundle — no single public part number exists.`,
        'Dell source documents (see each line\'s source)');
    }
    if (unconfirmed) {
      push(res, 'verify',
        `${unconfirmed} line(s) — cables/optics and per-unit platform port assumptions — are best-effort ` +
        `estimates. Confirm model, part number, and port counts against Dell sources.`,
        'Seed-and-verify workflow');
    }

    // 2. Redundancy --------------------------------------------------------
    if (res.context.redundancy === 'single') {
      push(res, 'error',
        'Single-fabric selected: no switch-level redundancy. Dell guidance is a dual-fabric MC-LAG pair (SONiC) or VLT pair (OS10) for production storage/server attach.',
        R.redundancy.source);
    }

    // 3. Jumbo frames on any data-carrying fabric (storage / server / AI) --
    if (res.fabrics.some(f => ['storage', 'backend', 'frontend', 'aifabric'].includes(f.network))) {
      push(res, 'info',
        `Enable jumbo frames (MTU ${R.mtu.storageJumbo}) end-to-end on the data fabrics (iSCSI / NVMe-TCP / storage back-end / vMotion / AI RoCE) — 9216 for best performance. On a VXLAN underlay keep ≥1600 for the encap overhead.`,
        R.mtu.source);
    }

    // 4. AI fabric: RoCE + topology + GPU-scale ----------------------------
    const aif = res.fabrics.find(f => f.workload === 'ai');
    if (aif) {
      const A = R.aiFabric;
      if (aif.totalLeaves === 1)
        push(res, 'warn', 'AI compute fabric is a SINGLE switch — Dell publishes this topology for small clusters (h04600), but it is a cluster-wide single point of failure. Every validated ERA uses ≥2 switches; use a redundant design for production.', A.source);
      else if (!aif.spine && aif.totalLeaves === 2)
        push(res, 'info', 'Small AI cluster on a 2-switch pair (rails striped across both) — matches the validated ERA pattern (e.g. 2× SN5610); no spine needed at this scale.', A.source);
      push(res, 'info',
        `AI east-west fabric: ${A.lossless}; ${A.fabricLayer}. Recommended topology: Rail-Optimized (best GPU-collective performance).`,
        A.source);
      // Transport: RoCEv2 (default) OR Ultra Ethernet (UEC) — surface the right config list.
      const transport = (res.context && res.context.aiTransport) || 'roce';
      const uec = R.aiTransport && R.aiTransport.options.uec;
      if (transport === 'uec' && uec) {
        push(res, 'info', 'Transport: Ultra Ethernet (UEC 1.0). ' + uec.note, R.aiTransport.source);
        push(res, 'info', 'UEC config required: ' + uec.config.join('; ') + '.', R.aiTransport.source);
        const nvSpine = /NVIDIA/i.test((aif.spine && aif.spine.vendor) || '') || /NVIDIA/i.test(aif.leaf.vendor);
        if (nvSpine) push(res, 'warn', 'UEC selected on an NVIDIA Spectrum stack — Spectrum-X is NVIDIA\'s vertically-integrated fabric; UEC is the open multi-vendor path best matched to the Dell PowerSwitch (Tomahawk) stack. Confirm which the customer intends.', R.aiTransport.source);
      } else {
        push(res, 'info', 'Transport: RoCEv2 (default). RoCEv2 config required: ' + R.roce.required.join(', ') + '.', R.roce.source);
        push(res, 'info', 'Alternative: Ultra Ethernet (UEC 1.0) is the open multi-vendor transport — multipath packet spraying keeps every path busy for GPU collectives, on the same Dell Z-series (Tomahawk) switches. Consider it if the NICs are UEC-capable.', R.aiTransport.source);
      }
      const gpus = aif.totalLinks; // 1 rail per GPU
      if (gpus > A.twoTierGpuScale) {
        push(res, 'warn',
          `~${gpus} GPU rails exceed the ~${A.twoTierGpuScale}-GPU reach of a two-tier leaf-spine Ethernet fabric — plan a multi-pod / 3-tier design.`,
          A.source);
      } else {
        push(res, 'info',
          `~${gpus} GPU rails — within a two-tier leaf-spine Ethernet fabric (scales to ~${A.twoTierGpuScale} GPUs).`,
          A.source);
      }
    }

    // 5. Oversubscription --------------------------------------------------
    res.fabrics.forEach(f => {
      if (f.oversub == null) return;
      const limit = f.workload === 'ai' ? R.oversubscription.aiTarget
        : (f.network === 'storage' || f.network === 'backend') ? R.oversubscription.storageTargetMax
        : R.oversubscription.generalAccessToUplinkMax;
      // non-blocking reporting: confirm 1:1 when required & met; give the remedy when it isn't
      if (f.nonBlockingReq) {
        if (f.nonBlocking) push(res, 'info', `${f.network}: NON-BLOCKING ✓ (~${f.oversub}:1) — uplink bandwidth ≥ access bandwidth (${f.uplinksPerLeaf}× ${f.uplinkSpeed}/leaf${f.aiFolded ? ', rail-optimized folded Clos' : ''}).`, R.oversubscription.source);
        else push(res, f.workload === 'ai' ? 'error' : 'warn', `${f.network} ${f.workload === 'ai' ? 'REQUIRES' : 'targets'} non-blocking (1:1) but is ~${f.oversub}:1 — the ${f.leaf.model} ran out of uplink ports (${f.uplinksPerLeaf}× ${f.uplinkSpeed}). Fix: use a leaf with more/faster uplinks (e.g. S5448F 8×400G, or a higher-radix Spectrum/Z leaf), enable breakout, or accept the ratio.`, R.oversubscription.source);
      } else if (f.oversub > limit) {
        push(res, 'warn', `${f.network} fabric oversubscription ~${f.oversub}:1 exceeds target ${limit}:1. Add spine uplinks or a higher-speed spine.`, R.oversubscription.source);
      }
    });

    // 6. PowerScale back-end dedication + cluster-size limit ----------------
    // A design can carry MORE THAN ONE PowerScale target (e.g. two separate clusters) —
    // check every one, not just the first.
    const psTargets = targets.filter(t => t.platform.id === 'powerscale');
    const psTarget = psTargets[0];
    psTargets.forEach((t, ti) => {
      const tag = psTargets.length > 1 ? ` (${t.label || 'cluster ' + (ti + 1)})` : '';
      push(res, 'warn',
        `PowerScale back-end${tag} MUST be a dedicated network on its own switches, physically separate from front-end. Confirm the model-specific supported back-end switch list.`,
        t.platform.source);
      // HARD OneFS LIMIT: a single PowerScale cluster maxes at 252 nodes (Dell H16346.8,
      // Mar 2025: "max cluster size for 10/25/40 GbE nodes is 252"). Beyond that the design
      // is NOT one cluster — it must be split into multiple clusters, each ≤252 nodes.
      const psNodes = t.units || 0;
      if (psNodes > 252) {
        const clusters = Math.ceil(psNodes / 252);
        push(res, 'error',
          `${psNodes} PowerScale nodes${tag} exceed the 252-node OneFS maximum cluster size — a single cluster CANNOT be built this large. Split into ${clusters} clusters (≤252 nodes each), each with its own dedicated back-end fabric, and confirm with the customer how the namespace is partitioned.`,
          'Dell PowerScale Ethernet Back-End Network Overview H16346.8 (Mar 2025) — 252-node OneFS cluster maximum');
      } else if (psNodes > 226) {
        push(res, 'info',
          `${psNodes} PowerScale nodes${tag} — approaching the 252-node OneFS cluster maximum. Plan spine radix + growth accordingly (a 252-node back-end uses 64-port leaf/spine switches per Dell's large-cluster design).`,
          'Dell PowerScale Leaf-Spine Network Best Practices H17682');
      }
    });

    // 7. Growth headroom note ----------------------------------------------
    push(res, 'info',
      `Sized with ${Math.round(res.context.headroom * 100)}% growth headroom on access ports.`,
      R.growth.note);

    // 8. Platform-declared requirements & concerns (per target) -----------
    const multi = plats.length > 1;
    plats.forEach(pl => {
      const pfx = multi ? `[${pl.family}] ` : '';
      (pl.requires || []).forEach(r => push(res, 'info', pfx + 'Requirement: ' + r, pl.source));
      (pl.concerns || []).forEach(c => push(res, 'warn', pfx + 'Concern: ' + c, pl.source));
    });

    // 9. BOM sanity — empty or malformed lines -----------------------------
    if (!res.bom.length) push(res, 'error', 'BOM is empty — no switches or cabling were generated. Check the inputs.', 'Sanity check');
    res.bom.forEach(l => {
      if (typeof l.qty === 'number' && l.qty <= 0) push(res, 'error', `Line "${l.item || l.model}" has quantity ${l.qty}.`, 'Sanity check');
      if (!l.item && !l.model) push(res, 'error', 'A BOM line is missing its item/model.', 'Sanity check');
    });

    // 10. Switch models must exist in the current catalog ------------------
    const known = new Set((C.switches || []).map(s => s.model));
    res.bom.filter(l => l.category === 'Switch' || l.category === 'Management')
      .forEach(l => { if (!known.has(l.model)) push(res, 'error', `Switch "${l.model}" is not in the current portfolio catalog — confirm it exists / is orderable.`, 'Catalog integrity'); });

    // 11. Platform-specific minimums ---------------------------------------
    psTargets.filter(t => t.units < 3).forEach(t =>
      push(res, 'warn', `PowerScale needs a minimum of 3 nodes — ${t.units} entered${psTargets.length > 1 ? ` (${t.label || ''})` : ''}. Size up for a valid cluster.`, t.platform.source));

    // 12. AI clusters should have an out-of-band network -------------------
    if (res.fabrics.some(f => f.workload === 'ai') && !res.fabrics.some(f => f.network === 'mgmt'))
      push(res, 'warn', 'AI/GPU clusters should include an out-of-band management network (BMC / console) — none is in this BOM.', (R.aiFabric && R.aiFabric.source) || p.source);

    // 13. Spine capacity — enough spine ports for the leaf uplinks ---------
    // totalPodSpines covers every pod when this is a 3-tier Clos (falls back to spineCount for
    // a flat 2-tier design, where numPods===1 and totalPodSpines===spineCount).
    res.fabrics.forEach(f => {
      if (!f.spine) return;
      const podSpines = f.totalPodSpines || f.spineCount || 1;
      // GAPS.md G-011: prefer the engine's own already-resolved cable quantity over
      // recomputing totalLeaves × uplinksPerLeaf — the two can diverge for certain node counts
      // on the GB300 NVL72 published path (uplinksPerLeaf is a per-leaf CEILING that doesn't
      // divide evenly for every n, so multiplying it back out overcounts vs the real cabled
      // quantity). Same principle as the breakout fixes: consume a field the engine already
      // resolved, don't re-derive it here.
      const needed = f.uplinkCableQty || (f.totalLeaves * (f.uplinksPerLeaf || 4));
      // breakout-adjust the cap the same way check #22 (physical port budget, the authoritative
      // hard-error check) already does — without this, ANY spine genuinely using breakout (e.g.
      // a 400G spine serving 100G leaves via 4x breakout, a normal correctly-sized case) warned
      // "may be short on ports" even though the design fits, training reps to distrust warnings.
      const ratio = f.uplinkBreakout ? f.uplinkBreakout.ratio : 1;
      const cap = ((f.spine.access && f.spine.access.count) || 0) * podSpines * ratio;
      if (cap && needed > cap)
        push(res, 'warn', `${f.network} spine may be short on ports (~${needed} leaf uplinks vs ~${cap} spine ports on ${f.spine.model} ×${podSpines}${ratio > 1 ? ` w/ ${ratio}× breakout` : ''}). Add spines or use a higher-radix model.`, R.leafSpine.source);
      // 3-tier: the pod-spine -> super-spine hop needs its own capacity check — same breakout
      // credit as above, using the pod-spine<->super-spine ratio (a DIFFERENT hop/ratio than
      // the leaf<->spine one above; f.uplinkBreakout must not be reused here).
      if (f.superSpine) {
        const superNeeded = podSpines * (f.podUplinksToSuper || 0);
        const superRatio = (f.superSpineBreakout && f.superSpineBreakout.ratio) || 1;
        const superCap = ((f.superSpine.access && f.superSpine.access.count) || 0) * (f.superSpineCount || 1) * superRatio;
        if (superCap && superNeeded > superCap)
          push(res, 'warn', `${f.network} super-spine may be short on ports (~${superNeeded} pod-spine uplinks vs ~${superCap} ports on ${f.superSpine.model} ×${f.superSpineCount}${superRatio > 1 ? ` w/ ${superRatio}× breakout` : ''}). Add super-spines or a higher-radix model.`, R.leafSpine.source);
      }
    });

    // 14. Verity / NOS compatibility (SONiC vs Cumulus) ---------------------
    const hasNvidiaSw = res.fabrics.some(f => f.network !== 'mgmt' && ((f.leaf && /NVIDIA/i.test(f.leaf.vendor)) || (f.spine && /NVIDIA/i.test(f.spine.vendor))));
    if (res.bom.some(l => l.model === 'Dell Fabric Manager (DFM)')) {
      if (hasNvidiaSw)
        push(res, 'warn', 'DFM manages Dell Enterprise SONiC (Dell PowerSwitch) — NVIDIA Spectrum switches run Cumulus Linux and are NOT on the Dell Enterprise SONiC compatibility matrix. Scope DFM to the Dell portion of this design.', 'Dell Fabric Manager (DFM) / Enterprise SONiC Compatibility Matrix');
      else
        push(res, 'info', 'Dell Fabric Manager (DFM) runs on Dell Enterprise SONiC — confirm the fabric switches are ordered with Enterprise SONiC (all listed Dell models support it).', 'Dell Fabric Manager (DFM)');
    }
    // NOS statement for NVIDIA fabrics — Cumulus Linux is the validated NOS
    if (hasNvidiaSw)
      push(res, 'info', 'NVIDIA Spectrum switches run NVIDIA Cumulus Linux (the NOS the validated designs use — e.g. Cumulus 5.9.1 qualified for SN5600 with PowerScale). They do NOT run Dell Enterprise SONiC (absent from the compatibility matrix). Plan Cumulus skills/automation (NVIDIA Air / NVUE) for the NVIDIA fabric.', 'NVIDIA Cumulus / Enterprise SONiC Compatibility Matrix / OneFS Supportability Guide');

    // 15. Very large design heads-up ---------------------------------------
    const totalSwitches = res.bom.filter(l => (l.category === 'Switch' || l.category === 'Management') && typeof l.qty === 'number').reduce((s, l) => s + l.qty, 0);
    if (totalSwitches > 200) push(res, 'warn', `Large design (~${totalSwitches} switches) — validate against a formal Dell reference architecture / Power Sizer before quoting.`, 'Scale check');

    // 16. Host speed must not exceed the chosen leaf's access speed --------
    const gbps = str => { const m = String(str).match(/(\d+(?:\.\d+)?)\s*(T|G)/i); return m ? (m[2].toUpperCase() === 'T' ? parseFloat(m[1]) * 1000 : parseFloat(m[1])) : 0; };
    res.fabrics.forEach(f => {
      if (f.network === 'mgmt' || !f.leaf || !f.leaf.access) return;
      const host = gbps(f.speed), la = gbps(f.leaf.access.speed);
      if (host && la && host > la)
        push(res, 'warn', `${f.network}: host links are ${f.speed} but leaf ${f.leaf.model} tops out at ${f.leaf.access.speed} — select a higher-speed leaf.`, 'Speed match');
    });

    // 17. Leaf-spine / large-deployment considerations gate ----------------
    const dataFabrics = res.fabrics.filter(f => f.network !== 'mgmt');
    const hasSpine = dataFabrics.some(f => f.spine);
    const totalLeaves = dataFabrics.reduce((s, f) => s + (f.totalLeaves || 0), 0);
    const large = hasSpine || totalLeaves > ((R.leafSpine && R.leafSpine.largeLeafThreshold) || 8);
    if (large && R.leafSpine.considerations) {
      push(res, 'info', `Leaf-spine / larger deployment (${totalLeaves} leaves${hasSpine ? ', spine tier present' : ''}) — connectivity considerations:`, R.leafSpine.source);
      R.leafSpine.considerations.forEach(c => push(res, 'info', '• ' + c, R.leafSpine.source));
    }

    // 18. Redundancy method — state it clearly (SONiC vs OS10) ------------
    res.fabrics.forEach(f => {
      if (f.network === 'mgmt' || !f.redundancyMethod) return;
      const m = R.redundancy.methods[f.redundancyMethod];
      if (m) push(res, 'info', `${f.network} redundancy: ${m.label}. ${m.note}`, R.redundancy.source);
      if (f.interconnectQty && hasFabricUplink(f.leaf) && String(f.leaf.uplink.speed) === String(f.interconnectSpeed))
        push(res, 'warn', `${f.network}: the ${f.interconnectQty}× ${f.interconnectSpeed} peer-link uses uplink ports on the ${f.leaf.model} — confirm the remaining uplink ports cover host/core needs.`, R.redundancy.source);
    });

    // 19. Inter-network / core connectivity -------------------------------
    if (res.coreUplink) {
      const cu = res.coreUplink;
      push(res, 'info', `Inter-network: ${cu.count}× ${cu.speed} from the ${cu.source} to ${cu.typeLabel || 'the existing core'} (redundant). Far-side switch & optics by others.`, R.coreUplink.source);
      if (cu.layer === 'l3') push(res, 'info', `Inter-network config: L3 routed — ${(cu.protocol || 'bgp').toUpperCase()} ${cu.protocol === 'ospf' ? 'adjacency on the uplink (area / route summarization as needed)' : cu.protocol === 'static' ? 'static routes + a floating default; track next-hop' : 'peering (eBGP between the border and the far side; advertise the fabric prefixes; add BFD for fast failover)'}. Bundle the redundant links with LACP or spread with ECMP.`, R.coreUplink.source);
      else push(res, 'info', 'Inter-network config: L2 stretch — extend the VLAN/VNI over BGP EVPN-VXLAN (do not stretch raw spanning tree). Use an anycast gateway + storm-control on the border-leaf.', R.coreUplink.source);
      if (cu.type === 'dci') push(res, 'warn', 'DCI: confirm inter-site distance & optics (LR/ER/ZR or coherent), consider MACsec, and route (don’t bridge) between sites where possible to keep failure domains separate.', R.coreUplink.source);
    } else if (large)
      push(res, 'warn', 'No inter-network uplink included — confirm how this fabric connects to the core/backbone or another fabric (enable an inter-network uplink).', R.coreUplink.source);

    // 20. Bonding / teaming guidance (BOM-relevant: switch-dependent bonds ⇒ MC-LAG + ICL) --
    if (res.fabrics.some(f => f.network === 'storage' || f.network === 'frontend')) {
      const indep = res.fabrics.some(f => f.redundancyMethod === 'independent-ab');
      if (indep)
        push(res, 'info', 'INDEPENDENT A/B FABRICS: no ICL between the ToR pair (classic block-SAN air gap). Valid ONLY while every appliance bond stays switch-INDEPENDENT (or no LAG) with host MPIO doing load balancing + failover. If ANY bond is set switch-dependent (LACP or Static), the pair must be converted to MC-LAG with an ICL — that changes the BOM.', R.redundancy.source);
      push(res, 'info', 'Bond-mode guidance: system/cluster + file bonds → Switch Dependent LACP (requires a matching port-channel across the MC-LAG pair). Block paths (iSCSI/NVMe-TCP) → switch-independent/no-LAG + MPIO (multipathing needs individual paths; LACP adds no per-session speed). NEVER Static/"mode on" — no LACPDU negotiation, mismatches blackhole silently.', 'h19678.3 / h04504 / SAN best practice');
    }

    // 21b. Host NIC config (drives host port counts) ----------------------
    if (res.context.nic)
      push(res, 'info', `Host NIC (confirm actual config): ${res.context.nic.label}. Per-unit host port count is driven from this.`, 'Host NIC input');

    // 21c. Cabling by placement — class, reach, connector per speed --------
    const ctx = res.context || {};
    if (ctx.placement && R.cabling.placements && R.cabling.placements[ctx.placement]) {
      const pl = R.cabling.placements[ctx.placement];
      push(res, 'info', `Host↔leaf cabling: ${pl.label} → ${pl.cableClass} (${pl.reach}). ${pl.note}`, R.cabling.source);
      const speeds = [...new Set(res.fabrics.filter(f => f.network !== 'mgmt').map(f => f.speed))];
      const conn = speeds.map(s => `${s} → ${(R.cabling.connectorsBySpeed && R.cabling.connectorsBySpeed[s]) || '?'}`).join('; ');
      if (conn) push(res, 'info', `Connector / form factor by speed in this design: ${conn}. Confirm cable lengths per rack layout (switch-to-rack distance).`, R.cabling.source);
      if (ctx.placement === 'structured') {
        push(res, ctx.structuredInPlace ? 'info' : 'warn', `Structured cabling: ${ctx.structuredInPlace ? 'reported already in place — confirm fiber type (MMF/SMF) & patch capacity.' : 'NOT in place — the passive plant (MPO trunks, cassettes, patch panels, LC patch cords) is itemized on the BOM as a vendor-neutral estimate.'} ${R.cabling.structuredNote}`, R.cabling.source);
        // The classic re-cabling gotcha — surface it whenever a fiber plant is in play.
        if (R.cabling.fiberPolish) push(res, 'warn', R.cabling.fiberPolish.note, R.cabling.fiberPolish.source);
      }
    }

    // 21d. Breakout — port-math & optic-count impact -----------------------
    const brkFab = res.fabrics.filter(f => f.uplinkBreakout);
    if (brkFab.length) {
      brkFab.forEach(f => push(res, 'info', `${f.network}: leaf→spine uses breakout — 1× ${f.uplinkBreakout.high} spine port → ${f.uplinkBreakout.ratio}× ${f.uplinkBreakout.low}. ${R.cabling.breakoutNote}`, R.cabling.source));
    } else if (ctx.breakout === 'on') {
      push(res, 'info', `Breakout requested: ${R.cabling.breakoutNote} If breaking a leaf access port into host links (e.g. 100G→4×25G), a 32-port switch presents up to 128 logical ports — recount ports and optics accordingly.`, R.cabling.source);
    }

    // 21e. Oversubscription target / traffic pattern ("sized right") -------
    if (ctx.trafficProfile && R.oversubscription.profiles[ctx.trafficProfile]) {
      const pr = R.oversubscription.profiles[ctx.trafficProfile];
      push(res, 'info', `Traffic pattern: ${pr.label} → target oversubscription ~${pr.target}:1, which sets uplinks-per-leaf. ${pr.note}`, R.oversubscription.source);
    }
    res.fabrics.filter(f => f.spine && f.uplinksPerLeaf).forEach(f => {
      push(res, 'info', `${f.network}: ${f.uplinksPerLeaf}× ${f.uplinkSpeed} uplinks/leaf → ~${f.oversub}:1 (target ${f.oversubTarget}:1). Uplinks×leaves = ${f.uplinksPerLeaf * f.totalLeaves} spine-facing ports.`, R.oversubscription.source);
    });

    // 21f. Spine tier — two-tier vs three-tier (super-spine) --------------
    res.fabrics.filter(f => f.spine).forEach(f => {
      if (f.spineCount && f.spineCount < 2)
        push(res, 'warn', `${f.network}: only ${f.spineCount} spine — needs ≥2 so the fabric survives a spine failure.`, R.leafSpine.source);
      if (f.superSpine && f.superSpineCount && f.superSpineCount < 2)
        push(res, 'warn', `${f.network}: only ${f.superSpineCount} super-spine — needs ≥2 so the fabric survives a super-spine failure.`, R.leafSpine.source);
    });

    // 21g. Buffer / latency by workload -----------------------------------
    if (res.fabrics.some(f => f.network === 'storage' || f.network === 'backend'))
      push(res, 'info', `Buffer/latency: ${R.buffer.incastNote}`, R.buffer.source);
    if (res.fabrics.some(f => f.workload === 'ai'))
      push(res, 'info', `Buffer/latency: ${R.buffer.note}`, R.buffer.source);

    // 21h. Speed-migration roadmap → multi-rate optics/switches -----------
    if (ctx.roadmap && ctx.roadmap !== 'none' && R.growth.migration[ctx.roadmap])
      push(res, 'info', `Speed roadmap — ${R.growth.migration[ctx.roadmap].label}: ${R.growth.migration[ctx.roadmap].note}`, R.growth.source);

    // 21i. PowerScale back-end supported switch (Table 4, H16346.8) -------
    psTargets.forEach((t, ti) => {
      const tag = psTargets.length > 1 ? ` (${t.label || 'cluster ' + (ti + 1)})` : '';
      const beFab = res.fabrics.find(f => f.network === 'backend' && (f.targetUid != null ? f.targetUid : f.targetId) === (t.uid != null ? t.uid : t.id));
      const supported = R.backend.powerScaleSupportedSwitches;
      if (beFab && supported.indexOf(beFab.leaf.model) >= 0) {
        const pn = (R.backend.powerScaleBackendPNs || {})[beFab.leaf.model];
        push(res, 'info', `PowerScale back-end${tag} leaf ${beFab.leaf.model} is on the Dell-supported back-end list${pn ? ` — VERIFIED Dell PN ${pn} (OneFS Supportability & Compatibility Guide, Table 33)` : ''}. Back-end must be Dell-managed & dedicated; mixed node speeds share a 100G switch via breakout. Newest option: Z9664 (210-BCJH) in 100G/200G FLAT topologies.`, R.backend.source);
      }
      else
        push(res, 'warn', `PowerScale back-end${tag} must use a Dell-supported, Dell-managed switch — Table 4: ${supported.join(', ')} (also Arista 7308X3 / NVIDIA SN5600 via ETC).${beFab ? ` This tool sized ${beFab.leaf.model}; substitute a supported model.` : ''}`, R.backend.source);
    });

    // 21k. Azure Local / APEX HCI — RDMA + Microsoft-approved ToR ----------
    targets.filter(t => t.platform.id === 'apex-hci').forEach(hciT =>
      push(res, 'warn', 'Azure Local / APEX Cloud Platform: the storage network is RDMA (RoCEv2 or iWARP) — RoCE requires a lossless fabric (PFC/ECN). The ToR pair MUST be on Microsoft’s Azure Local supported switch list, or use switchless storage networking for small (2–3 node) clusters. Confirm converged vs non-converged NIC layout.', hciT.platform.source));

    // 21l. ObjectScale — dedicated private back-end + LACP ----------------
    targets.filter(t => t.platform.id === 'objectscale').forEach(osT =>
      push(res, 'info', 'ObjectScale: a public front-end plus a DEDICATED private back-end switch pair; bond node NICs with LACP on both networks. EX500/EX5000 use Dell S5248F for both pairs (25GbE; 100GbE on XF960). Attach no other devices to the back-end.', osT.platform.source));

    // 22. PHYSICAL PORT BUDGET — a switch cannot be over-committed (hard error)
    //     host ports + ICL(if on access) ≤ access ports; uplinks + ICL(if on uplink) ≤ uplink ports.
    res.fabrics.forEach(f => {
      if (f.network === 'mgmt' || !f.leaf || !f.leaf.access || !f.leavesPerFabric) return;
      const hostPerLeaf = Math.ceil((f.perFabricLinks || 0) / f.leavesPerFabric);
      // ICL/ISL physical port consumption PER SWITCH — the divisor differs by shape:
      //  - recommend(): leavesPerFabric already counts PAIRS (1 unit = 2 switches, each pair's
      //    OWN ICL) -> divide interconnectQty by leavesPerFabric directly.
      //  - edge/refresh: leavesPerFabric counts TOTAL switches (2 per pair) -> divide by half that.
      //  - RA collapsed compute pair (exactly 2 switches wired directly, no spine): interconnectQty
      //    IS already the per-switch count (a direct point-to-point link, not a spread fan-out).
      const raCollapsedIsl = f.workload === 'ai' && f.totalLeaves === 2 && !f.spine && !!f.interconnectQty;
      let iclPortsPerLeaf = 0;
      if (f.interconnectQty) {
        if (raCollapsedIsl) iclPortsPerLeaf = f.interconnectQty;
        else if (res.isEdge) iclPortsPerLeaf = (2 * f.interconnectQty) / f.leavesPerFabric;
        else iclPortsPerLeaf = f.interconnectQty / f.leavesPerFabric;
      }
      // which physical port class does the ICL ride? (match by speed; e.g. E3248PXE ICL uses its
      // separate SFP28 ports — neither access RJ45 nor 100G uplink — so it budgets against neither)
      const iclOnUplink = iclPortsPerLeaf && hasFabricUplink(f.leaf) && String(f.leaf.uplink.speed) === String(f.interconnectSpeed);
      const iclOnAccess = iclPortsPerLeaf && !iclOnUplink && String(f.leaf.access.speed) === String(f.interconnectSpeed);
      // breakout-adjust the budget whenever the leaf's native access speed exceeds this fabric's
      // actual speed — breakout is physically happening regardless of the fabric's workload label.
      let accessBudget = f.leaf.access.count;
      { const aG = gbps(f.leaf.access.speed) || gbps(f.speed); const rG = gbps(f.speed); if (aG > rG && rG > 0) accessBudget = accessBudget * Math.floor(aG / rG); }
      // the RA collapsed-pair ISL shares the SAME breakout-adjusted pool as the GPU rails
      // themselves. Leaves with NO genuine dedicated fabric-uplink class (S5232F/Z9264F/Z9432F/
      // Z9664F/Z9864F, or an AI leaf whose catalog "uplink" is a mgmt/breakout-assist port like
      // SN5610's 2× 25GbE — see hasFabricUplink) present uplinks on this SAME pool too.
      const uplinksOnAccess = !hasFabricUplink(f.leaf) && f.spine && !!f.uplinksPerLeaf;
      const accessUsed = hostPerLeaf + (iclOnAccess || raCollapsedIsl ? iclPortsPerLeaf : 0) + (uplinksOnAccess ? (f.uplinksPerLeaf || 0) : 0);
      if (accessUsed > accessBudget)
        push(res, 'error', `${f.network}: ${f.leaf.model} access ports OVER-COMMITTED — ${hostPerLeaf} host${(iclOnAccess || raCollapsedIsl) ? ' + ' + iclPortsPerLeaf + (raCollapsedIsl ? ' ISL' : ' ICL') : ''}${uplinksOnAccess ? ' + ' + f.uplinksPerLeaf + ' uplink' : ''} = ${accessUsed} > ${accessBudget} ports (breakout-adjusted). Add leaves or a bigger switch.`, 'Physical port budget');
      if (hasFabricUplink(f.leaf)) {
        // DUAL uplink classes (E-series: 4× SFP+/SFP28 `uplinkAlt` AND 2× 100G `uplink`) —
        // uplinks ride whichever class matches the fabric's uplinkSpeed; the ICL rides the
        // OTHER class. Budget each class against its own consumer, never lump them together.
        const alt = f.leaf.uplinkAlt;
        const upOnAlt = alt && String(alt.speed) === String(f.uplinkSpeed);
        const upCap = upOnAlt ? alt.count : f.leaf.uplink.count;
        const upUsedOnly = f.spine ? (f.uplinksPerLeaf || 0) : 0;
        if (alt) {
          if (upUsedOnly > upCap)
            push(res, 'error', `${f.network}: ${f.leaf.model} uplink ports OVER-COMMITTED — ${upUsedOnly} uplinks > ${upCap} ${upOnAlt ? alt.media : f.leaf.uplink.media} ports.`, 'Physical port budget');
          const iclClassCap = upOnAlt ? f.leaf.uplink.count : alt.count;
          const iclOnEither = iclPortsPerLeaf && (String(f.leaf.uplink.speed) === String(f.interconnectSpeed) || String(alt.speed) === String(f.interconnectSpeed));
          if (iclOnEither && iclPortsPerLeaf > iclClassCap)
            push(res, 'error', `${f.network}: ${f.leaf.model} ICL ports OVER-COMMITTED — ${iclPortsPerLeaf} ICL > ${iclClassCap} ports on the non-uplinking class.`, 'Physical port budget');
        } else {
          const upUsed = upUsedOnly + (iclOnUplink ? iclPortsPerLeaf : 0);
          if (upUsed > f.leaf.uplink.count)
            push(res, 'error', `${f.network}: ${f.leaf.model} uplink ports OVER-COMMITTED — ${f.spine ? f.uplinksPerLeaf + ' uplinks' : ''}${iclOnUplink ? ' + ' + iclPortsPerLeaf + ' ICL' : ''} = ${upUsed} > ${f.leaf.uplink.count} ports.`, 'Physical port budget');
        }
      }
      // spine ports (incl. breakout multiplier when the design uses it) — totalPodSpines covers
      // every pod when this is a 3-tier Clos (equals spineCount for a flat 2-tier design).
      if (f.spine && f.spine.access && f.uplinksPerLeaf) {
        const podSpines = f.totalPodSpines || f.spineCount || 1;
        // GAPS.md G-011 — same preference as check #13 above: the engine's own resolved
        // uplinkCableQty over a recomputation that can diverge from it for certain node counts.
        const needed = f.uplinkCableQty || (f.totalLeaves * f.uplinksPerLeaf);
        const ratio = f.uplinkBreakout ? f.uplinkBreakout.ratio : 1;
        const cap = podSpines * f.spine.access.count * ratio;
        if (needed > cap)
          push(res, 'error', `${f.network}: spine tier OVER-COMMITTED — ${needed} leaf uplinks > ${cap} spine ports (${podSpines}× ${f.spine.model}${f.uplinkBreakout ? ' with ' + ratio + '× breakout' : ''}). Add spines or a higher-radix model.`, 'Physical port budget');
      }
      // 3-tier: pod-spine -> super-spine hop must also physically fit — credit the
      // pod-spine<->super-spine breakout ratio when present (a DIFFERENT hop/ratio than the
      // leaf<->spine one above). Previously always computed cap from the raw native port count,
      // which could fire a false hard error on a correctly-sized design (e.g. a pod-spine
      // stepping to a higher-speed super-spine via 2:1/4:1 breakout).
      if (f.superSpine && f.superSpine.access) {
        const podSpines = f.totalPodSpines || f.spineCount || 1;
        const superNeeded = podSpines * (f.podUplinksToSuper || 0);
        const superRatio = (f.superSpineBreakout && f.superSpineBreakout.ratio) || 1;
        const superCap = (f.superSpineCount || 1) * f.superSpine.access.count * superRatio;
        if (superNeeded > superCap)
          push(res, 'error', `${f.network}: super-spine tier OVER-COMMITTED — ${superNeeded} pod-spine uplinks > ${superCap} super-spine ports (${f.superSpineCount}× ${f.superSpine.model}${superRatio > 1 ? ` with ${superRatio}× breakout` : ''}). Add super-spines or a higher-radix model.`, 'Physical port budget');
      }
    });

    // 23. OPTIC ↔ PORT FORM FACTOR — a transceiver must PHYSICALLY seat in the port (hard error)
    //     R12 (backtest 2026-07-16c). Speed match is not enough: a 400G QSFP56-DD module does not
    //     fit a QSFP28 cage (double-density, physically longer) and does not fit an OSFP cage
    //     (different MSA). Both were being quoted — a 400G-Q56DD-SR4.2 off a QSFP28-only
    //     S5232F-ON, and an MCP1660-W0xx (QSFP-DD) into SN5600/SN5610 OSFP ports.
    //     This reads the optic ids the ENGINE resolved (fabric.hostCableId/uplinkCableId/…), never
    //     re-deriving the pick from BOM mergeKeys — same rule as G-011/uplinkCableQty.
    //     The cage table itself is a VENDOR FACT and lives in the catalog (C.formFactor), so the
    //     engine and this check can never disagree about what fits what.
    //     SCOPE: switch ports only. The host/NIC end is not checked here — a NIC's cage is the
    //     customer's choice and isn't modeled per-platform (tracked separately).
    const FF = C.formFactor;
    if (FF) {
      const optById = id => (C.optics || []).find(o => o.id === id);
      const reported = new Set();
      // Resolve which PHYSICAL port class on `sw` runs at `speed` (E-series carry two uplink
      // classes; the ICL rides whichever one the uplinks don't).
      const portAtSpeed = (sw, speed) => {
        if (!sw || !speed) return null;
        return [sw.uplink, sw.uplinkAlt, sw.access]
          .find(p => p && p.media && p.media !== '-' && String(p.speed) === String(speed)) || null;
      };
      function checkFit(opticId, media, sw, port, what, netLabel) {
        if (!opticId && !media) return;
        if (!sw || !port || !port.media || port.media === '-') return;
        const o = opticId ? optById(opticId) : null;
        const m = media || (o && o.media);
        if (!m) return;
        const r = FF.fits(port.media, m);
        if (r.unknown) return;                       // not a pluggable pair we model (bare fiber, panel)
        const name = (o && o.model) || m;
        const key = [opticId || m, sw.model, port.media, what].join('|');
        if (reported.has(key)) return;
        reported.add(key);
        const where = `${netLabel ? netLabel + ': ' : ''}${what}`;
        if (!r.ok) {
          push(res, 'error',
            `${where} — the ${name} (${r.opticCages.join('/')} form factor) CANNOT physically plug into the ${sw.model}'s ${port.speed} ${port.media} port (${r.portCages.join('/')} cage). This link is not buildable as quoted: the module will not seat, whatever the speeds say. Fix: pick an optic in the ${r.portCages.join(' or ')} form factor for this port, or choose a switch whose ports match the optic.`,
            FF.source);
        } else if (r.adapter) {
          push(res, 'warn',
            `${where} — the ${name} (${r.opticCages.join('/')}) does fit the ${sw.model}'s ${port.media} port, but ONLY via a ${r.adapter} pluggable adapter (${FF.adapterPN}), which is NOT on this BOM. Add one per port, or use a leaf whose native ports are ${r.opticCages.join('/')}. Note the adapter also caps that ${port.speed} port down to the optic's speed.`,
            FF.source);
        }
      }

      res.fabrics.forEach(f => {
        if (!f.leaf || !f.leaf.access) return;
        const net = f.network;
        // host ↔ leaf access
        checkFit(f.hostCableId, null, f.leaf, f.leaf.access, 'host-to-leaf cabling', net);
        // RA published path: every rail/uplink optic lands on this switch's access bank
        (f.opticIds || []).forEach(id => checkFit(id, null, f.leaf, f.leaf.access, 'AI fabric cabling', net));
        // leaf ↔ spine
        if (f.spine && f.spine.access) {
          const leafUpPort = hasFabricUplink(f.leaf) ? f.leaf.uplink : f.leaf.access;
          if (f.uplinkBreakout && f.uplinkBreakout.id) {
            const brk = optById(f.uplinkBreakout.id);
            if (brk) {
              // a breakout's two ends land on DIFFERENT switches — check each against its own port
              checkFit(f.uplinkBreakout.id, null, f.spine, f.spine.access, 'leaf-to-spine breakout (spine end)', net);
              const low = FF.lowMediaOf(brk.media);
              if (low) checkFit(null, low, f.leaf, leafUpPort, `leaf-to-spine breakout (leaf end, ${low})`, net);
            }
          } else if (f.uplinkCableId) {
            checkFit(f.uplinkCableId, null, f.leaf, leafUpPort, 'leaf-to-spine uplink (leaf end)', net);
            checkFit(f.uplinkCableId, null, f.spine, f.spine.access, 'leaf-to-spine uplink (spine end)', net);
          }
        }
        // MC-LAG / VLT peer-link — rides the port class matching interconnectSpeed
        if (f.iclCableId && f.interconnectSpeed)
          checkFit(f.iclCableId, null, f.leaf, portAtSpeed(f.leaf, f.interconnectSpeed), 'MC-LAG/VLT peer-link (ICL)', net);
      });

      // core / inter-network uplink — the pairing that was missing entirely (R12 case 1)
      const cu = res.coreUplink;
      if (cu && cu.opticId && cu.srcSw && cu.srcPort) {
        const o = optById(cu.opticId);
        const r = o ? FF.fits(cu.srcPort.media, o.media) : { ok: true, unknown: true };
        if (!r.unknown && !r.ok) {
          // Ruling 3 (2026-07-16d): impossible = ERROR, and the error NAMES BOTH REMEDIES. This one
          // gets its own message rather than the generic form-factor text because the cause is a
          // specific, fixable input combination: the rep asked for a core speed the source tier's
          // ports can't carry. Auto-adding a border leaf or silently capping the speed were both
          // rejected — they change what was asked for without saying so.
          push(res, 'error',
            `Inter-network uplink: you asked for ${cu.speed} to the core, but it would leave from the ${cu.srcReused ? 'existing (reused) ' : ''}${cu.srcSw.model}, whose ports are ${cu.srcPort.speed} ${cu.srcPort.media} — a ${cu.speed} link cannot come out of that port, so this BOM is not buildable as quoted. TWO WAYS TO FIX: (1) turn ON the border-leaf option — it adds a dedicated Z9432F-ON pair that HAS real ${cu.speed}-capable ports and terminates the core links there; or (2) drop the inter-network uplink to ${cu.srcPort.speed}, which the current switches can carry today. We do not pick for you: (1) adds hardware you did not ask for, (2) changes the speed you asked the customer for.`,
            FF.source);
        } else {
          // fits, or fits-with-adapter — the generic check still has something to say (QSA28)
          checkFit(cu.opticId, null, cu.srcSw, cu.srcPort,
            `inter-network uplink @ ${cu.speed} off the ${cu.srcReused ? 'existing (reused) ' : ''}${cu.srcSw.model}`, null);
        }
      }
      // border-leaf pair
      const bl = cu && cu.borderLeaf;
      if (bl && bl.sw) {
        if (bl.upCableId && bl.topTier && bl.topTier.access) {
          checkFit(bl.upCableId, null, bl.sw, bl.sw.access, 'border-leaf uplink (border end)', null);
          checkFit(bl.upCableId, null, bl.topTier, bl.topTier.access, 'border-leaf uplink (spine end)', null);
        }
        if (bl.iclCableId) checkFit(bl.iclCableId, null, bl.sw, bl.sw.access, 'border-leaf pair ICL', null);
      }
    }

    // 21n. Block-storage protocol → fabric class ---------------------------
    if (ctx.storageProtocol && R.storageProtocol.protocols[ctx.storageProtocol]) {
      const sp = R.storageProtocol.protocols[ctx.storageProtocol];
      push(res, 'info', `Storage protocol: ${sp.label} — ${sp.note}`, R.storageProtocol.source);
      if (sp.lossless) {
        push(res, 'warn', `${sp.label} requires a LOSSLESS storage fabric: PFC + ECN (DCQCN) with no-drop queues on the storage class, and a non-blocking (1:1) path — the storage fabric is sized to 1:1 accordingly. Misconfiguration = silent performance collapse.`, R.roce.source);
        res.fabrics.filter(f => (f.network === 'storage' || f.network === 'backend') && f.oversub != null && f.oversub > 1.01)
          .forEach(f => push(res, 'error', `${f.network}: NVMe-RoCE requires 1:1 but this fabric is ~${f.oversub}:1 — add uplinks / higher-speed leaf.`, R.storageProtocol.source));
      }
      // NVMe/TCP is sensitive to out-of-order delivery (it retransmits on reorder, not just
      // loss) — round-robin LAG hashing across a bonded/multihomed link WILL reorder packets
      // within a flow. Only relevant when the host is actually bonded (mclag/vlt/evpn-mh); the
      // independent-A/B pattern above sidesteps this entirely by using no LAG at all.
      if (ctx.storageProtocol === 'nvme-tcp' && res.fabrics.some(f => (f.network === 'storage' || f.network === 'backend') && f.redundancyMethod && f.redundancyMethod !== 'independent-ab'))
        push(res, 'info', 'NVMe/TCP + bonded/multihomed storage NICs: use LACP with L3/L4 (source+dest IP/port) hashing, NOT round-robin — round-robin reorders packets within a TCP flow, and NVMe/TCP treats reordering as loss (spurious retransmits, latency spikes). Keep each flow pinned to one physical link.', 'NVMe over TCP best practices (2026) — flow-consistent hashing');
    }

    // 21o. PowerScale back-end int-a/int-b independence ---------------------
    psTargets.forEach(t => {
      const beF = res.fabrics.find(f => f.network === 'backend' && (f.targetUid != null ? f.targetUid : f.targetId) === (t.uid != null ? t.uid : t.id));
      if (beF && beF.redundancyMethod === 'independent-ab')
        push(res, 'info', 'PowerScale back-end = TWO independent networks (int-a / int-b) on separate subnets — each node attaches once to each; OneFS provides the failover (RBM). No ICL, no bonding, nothing else attached.', 'h16346 (back-end overview)');
    });

    // 21m. Edge / campus — MC-LAG pair integrity ("stack-like") ------------
    if (res.isEdge && ctx.edge) {
      const e = ctx.edge;
      if (ctx.redundancy === 'dual') {
        if (e.accessSwitches % 2 !== 0) push(res, 'error', `Edge: ${e.accessSwitches} access switches cannot form MC-LAG pairs — deploy an even count (pairs).`, 'Enterprise SONiC MC-LAG');
        if (!res.bom.some(b => /MC-LAG ICL/.test(b.item || ''))) push(res, 'error', 'Edge: redundant access pairs need an MC-LAG ICL peer-link — none in the BOM.', 'Enterprise SONiC MC-LAG');
        if (e.upPerSw < 2) push(res, 'warn', 'Edge: each access switch should uplink to BOTH distribution switches (2 uplinks) for active/active.', 'Enterprise SONiC MC-LAG');
        push(res, 'info', `Edge redundancy verified: ${e.pairs} MC-LAG pair(s), ICL per pair, ${e.upPerSw} uplinks per switch — every access switch is redundant (pair = one logical switch).`, 'Enterprise SONiC Compatibility Matrix');
      } else {
        push(res, 'warn', 'Edge: single (non-redundant) access — an access switch failure takes down its clients. Recommend MC-LAG pairs (the "stack-like" option).', 'Enterprise SONiC MC-LAG');
      }
    }

    // 21j. Brownfield / add-to-existing -----------------------------------
    if (ctx.deploy === 'add')
      push(res, 'warn', `Add-to-existing: BOM reflects incremental additions only${ctx.reuseSpine ? ' (existing spine reused — not in this BOM)' : ''}. ${R.deployment.note}`, R.deployment.source);

    // 21. Vendor stack — no mixing within an (AI) fabric ------------------
    const aiFabrics = res.fabrics.filter(f => f.workload === 'ai');
    if (aiFabrics.length) {
      const stack = res.context.aiStack || aiFabrics[0].stack;
      push(res, 'info', `AI fabric is an all-${stack === 'nvidia' ? 'NVIDIA Spectrum' : 'Dell PowerSwitch'} stack (leaf + spine + OOB one vendor) — never mix Dell and NVIDIA switches within an AI fabric.`, 'Dell/NVIDIA AI fabric design principle');
      if (stack === 'nvidia' && res.fabrics.some(f => f.workload !== 'ai' && f.network !== 'mgmt' && f.stack !== 'nvidia'))
        push(res, 'info', 'Design pairs a Dell PowerSwitch core/storage fabric with a separate NVIDIA Spectrum AI fabric — correct: each fabric stays single-vendor.', 'AI fabric design principle');
      else if (stack === 'nvidia' && res.fabrics.filter(f => f.network !== 'mgmt').every(f => f.stack === 'nvidia'))
        push(res, 'info', 'FULL NVIDIA stack: every fabric (compute + storage + front-end + OOB) is NVIDIA Spectrum with NVIDIA LinkX cabling — single-vendor end-to-end.', 'AI fabric design principle');
    }

    // stable sort by severity for display
    const order = { error: 0, verify: 1, warn: 2, info: 3 };
    res.warnings.sort((a, b) => (order[a.severity] - order[b.severity]));
    return res;
  }

  window.validateBOM = validateBOM;
})();
