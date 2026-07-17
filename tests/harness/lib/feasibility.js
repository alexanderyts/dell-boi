/* =============================================================================
 * SHARED INDEPENDENT PHYSICAL-FEASIBILITY CHECKS — hand-written formulas kept
 * deliberately separate from engine.js/validate.js's own math (see
 * tests/harness/audit-independent.js header for the full rationale and the
 * three real gaps this class of check has already caught). Reused by the
 * targeted-scenario sweep AND the combinatorial fuzz harness so both stay
 * consistent with a single, carefully-reviewed set of invariants.
 * Every check function takes an explicit `P(tag, msg)` reporter — no shared
 * module state — so multiple independent harnesses can use this safely.
 * ========================================================================== */
function gbps(s) {
  const m = String(s).match(/(\d+(?:\.\d+)?)\s*(T|G)/i);
  return m ? (m[2].toUpperCase() === 'T' ? Math.round(parseFloat(m[1]) * 1000) : Math.round(parseFloat(m[1]))) : 0;
}
// matches engine.js's hasFabricUplink() — a switch's `uplink` field is only a real dedicated
// fabric-uplink port class when meant for spine-facing traffic (SN5610/SN5600D's 1-2× 25GbE is
// a mgmt/breakout-assist port, flagged `notFabricUplink:true` in switches.js).
function hasFabricUplink(leaf) {
  return !!(leaf && leaf.uplink && leaf.uplink.count && !leaf.uplink.notFabricUplink);
}

function checkFabric(C, tag, f, res, P) {
  if (f.network === 'mgmt') return;
  // BOM/topology-data consistency: if the fabric object says a spine/super-spine tier exists,
  // the BOM must actually contain hardware for it — a brownfield "reuse existing spine" shortcut
  // must never silently drop a NEWLY-required tier (only ever legitimate for a flat 2-tier reuse
  // where the customer's existing spine genuinely covers the add-on; a 3-tier design always needs
  // brand-new super-spine hardware the customer can't already own).
  if (f.spine && (!res.context || !res.context.reuseSpine || (f.numPods || 1) > 1)) {
    const swLines = (res.bom || []).filter(b => b.category === 'Switch');
    if (!swLines.some(b => b.model === f.spine.model))
      P(tag, `${f.network}: fabric has a spine (${f.spine.model}) assigned but NO matching Switch BOM line exists`);
    if (f.superSpine && !swLines.some(b => b.model === f.superSpine.model && /Super-spine/i.test(b.item || '')))
      P(tag, `${f.network}: fabric has a super-spine (${f.superSpine.model}) assigned but NO matching Switch BOM line exists`);
  }
  // Same class of check, generalized beyond spine: every fabric with a leaf assigned must have
  // matching Switch hardware in the BOM, and a non-zero peer-link/ICL must have matching cabling.
  // This is a "shape consistency" net — it would have caught the reuse-spine 3-tier bug (a whole
  // BOM-emission block silently skipped by an unrelated flag) generically, without needing to
  // already know that specific bug existed; it exists to catch the NEXT one of this shape too.
  if (f.leaf) {
    const swLines = (res.bom || []).filter(b => b.category === 'Switch');
    if (!swLines.some(b => b.model === f.leaf.model))
      P(tag, `${f.network}: fabric has a leaf (${f.leaf.model}) assigned but NO matching Switch BOM line exists`);
  }
  if (f.interconnectQty > 0) {
    const cableLines = (res.bom || []).filter(b => b.category === 'Cable/Optic');
    if (!cableLines.some(b => /(ICL|ISL|peer-link|MC-LAG|VLTi|inter-switch)/i.test(b.item || b.note || '')))
      P(tag, `${f.network}: fabric has interconnectQty=${f.interconnectQty} but NO matching peer-link/ICL Cable/Optic BOM line found`);
  }
  const leaf = f.leaf;
  if (!leaf) { P(tag, `${f.network}: no leaf switch assigned at all`); return; }
  const accessCount = (leaf.access && leaf.access.count) || 0;
  // breakout-adjust whenever the leaf's native access speed exceeds this fabric's actual speed —
  // breakout is physically happening regardless of the fabric's workload label.
  let accessBudget = accessCount;
  if (leaf.access) {
    const accG = gbps(leaf.access.speed), railG = gbps(f.speed);
    if (accG > railG && railG > 0) accessBudget = accessCount * Math.floor(accG / railG);
  }
  const hostPerLeaf = Math.ceil((f.perFabricLinks || 0) / (f.leavesPerFabric || 1));
  const iclPerLeaf = f.interconnectQty ? Math.ceil(f.interconnectQty / (f.leavesPerFabric || 1)) : 0;
  const upPerLeaf = f.uplinksPerLeaf || 0;
  const noDedicatedUp = !hasFabricUplink(leaf);
  const raCollapsedIsl = f.workload === 'ai' && f.totalLeaves === 2 && !f.spine;
  const knownThirdPortClass = /^e32/i.test(leaf.id || '');   // E3200-series ICL rides its SFP+/SFP28 ports
  const iclOnAccess = iclPerLeaf > 0 && leaf.access && String(f.interconnectSpeed) === String(leaf.access.speed);
  const iclOnUplink = iclPerLeaf > 0 && !noDedicatedUp && String(f.interconnectSpeed) === String(leaf.uplink.speed);
  // leaves with NO genuine dedicated fabric-uplink class present uplinks on the SAME
  // (breakout-adjusted) pool as hosts — general no-uplink Dell leaves AND AI leaves alike.
  const upEatsAccess = noDedicatedUp && f.spine;
  const accessUsed = hostPerLeaf + (iclOnAccess ? iclPerLeaf : 0) + (upEatsAccess ? upPerLeaf : 0);
  if (accessUsed > accessBudget + 0.001)
    P(tag, `${f.network}/${leaf.model}: OVERCOMMIT — ${accessUsed} > ${accessBudget} access ports/leaf`);
  if (!noDedicatedUp) {
    // DUAL uplink classes (E-series `uplinkAlt`: 4× SFP+/SFP28 alongside the 2× 100G rear pair)
    // — uplinks ride whichever class matches f.uplinkSpeed, the ICL rides the other; budget
    // each class separately (independently re-derived, mirrors the physical port map)
    const alt = leaf.uplinkAlt;
    if (alt) {
      const upOnAlt = String(alt.speed) === String(f.uplinkSpeed);
      const upBudget = upOnAlt ? alt.count : leaf.uplink.count;
      const upUsed = f.spine ? upPerLeaf : 0;
      if (upUsed > upBudget + 0.001) P(tag, `${f.network}/${leaf.model}: uplink-class ports used ${upUsed} > ${upBudget} (${upOnAlt ? 'alt/SFP' : '100G'} class)`);
      const iclBudget = upOnAlt ? leaf.uplink.count : alt.count;
      const iclOnClasses = iclPerLeaf > 0 && (String(f.interconnectSpeed) === String(leaf.uplink.speed) || String(f.interconnectSpeed) === String(alt.speed));
      if (iclOnClasses && iclPerLeaf > iclBudget + 0.001) P(tag, `${f.network}/${leaf.model}: ICL ports used ${iclPerLeaf} > ${iclBudget} (non-uplinking class)`);
    } else {
      const upBudget = leaf.uplink.count;
      const upUsed = (f.spine ? upPerLeaf : 0) + (iclOnUplink ? iclPerLeaf : 0);
      if (upUsed > upBudget + 0.001) P(tag, `${f.network}/${leaf.model}: uplink-class ports used ${upUsed} > ${upBudget}`);
    }
  }
  if (iclPerLeaf > 0 && !iclOnAccess && !iclOnUplink && !noDedicatedUp && !raCollapsedIsl && !knownThirdPortClass)
    P(tag, `${f.network}/${leaf.model}: ICL at ${f.interconnectSpeed} matches neither access nor uplink speed — unmodeled 3rd port class?`);
  if (f.spine) {
    // NOTE: these "already flagged" checks match the SPECIFIC per-design alert phrasing only —
    // NOT the generic educational bullets (R.leafSpine.considerations) that always accompany any
    // leaf-spine design and happen to also contain words like "3-tier"/"oversubscription"/
    // "non-blocking" — matching those generically would silently mask real gaps (caught in review).
    // breakout-adjust the spine's leaf-facing radix: a Z9432F distribution terminating 100G
    // uplinks as 400G→4×100G breakout presents 128 leaf-facing ports, not its 32 native cages
    // (the design carries f.uplinkBreakout when it builds on breakout — same signal the
    // engine's own port-budget check uses; 2026-07-13, found by this harness's own fuzz)
    const spineRadix = ((f.spine.access && f.spine.access.count) || 0) * ((f.uplinkBreakout && f.uplinkBreakout.ratio) || 1);
    const numPods = f.numPods || 1;
    const fourthTierFlagged = (res.warnings || []).some(w => /exceed even the .* super-spine radix|GPUs exceed the .*two-tier reach|spine tier OVER-COMMITTED|multi-pair distribution/i.test(w.message));
    if (numPods === 1) {
      // flat 2-tier: every leaf must fit the single spine tier's (breakout-adjusted) radix.
      if (f.totalLeaves > spineRadix && !fourthTierFlagged)
        P(tag, `${f.network}/${leaf.model}: ${f.totalLeaves} leaves > spine radix ${spineRadix} and no 3-tier Clos was built, no warning anywhere`);
    } else {
      // 3-TIER CLOS: leaves are split across pods, each pod-spine folded half-down/half-up —
      // independently re-derive the pod math and check it against what the engine actually built.
      const podLeafCap = Math.max(1, Math.floor(spineRadix / 2));
      const expectedPods = Math.max(1, Math.ceil(f.totalLeaves / podLeafCap));
      if (numPods < expectedPods) P(tag, `${f.network}/${leaf.model}: ${numPods} pods can't fit ${f.totalLeaves} leaves at ${podLeafCap}/pod (need >= ${expectedPods})`);
      // super-spine must reach every pod-spine (Clos) — or the tool must say a 4th tier is needed.
      if (f.superSpine) {
        const superRadix = (f.superSpine.access && f.superSpine.access.count) || 0;
        const totalPodSpines = f.totalPodSpines || 0;
        if (totalPodSpines > superRadix && !fourthTierFlagged)
          P(tag, `${f.network}/${leaf.model}: ${totalPodSpines} pod-spines > super-spine radix ${superRadix} (${f.superSpine.model}) and no 4th-tier warning anywhere`);
        const neededSuperPorts = totalPodSpines * (f.podUplinksToSuper || 0);
        const superCap = (f.superSpineCount || 1) * superRadix;
        if (neededSuperPorts > superCap + 0.001 && !fourthTierFlagged)
          P(tag, `${f.network}/${leaf.model}: super-spine tier needs ${neededSuperPorts} ports > capacity ${superCap}, no 4th-tier warning anywhere`);
      } else {
        P(tag, `${f.network}/${leaf.model}: 3-tier Clos built (${numPods} pods) but no super-spine assigned`);
      }
    }
    // NOTE: `f.gbps` does not exist on the actual fabric object (only `f.speed`, a string) —
    // using it directly here silently produced NaN, which made every comparison below false and
    // left this oversubscription-ratio check permanently inert. Found auditing the checker itself
    // while building the layer-3 optic-compatibility check (see checkOpticSpeedMatch below) —
    // exactly the same "independent checker shares a blind spot" risk this file exists to guard
    // against, just inside the guard itself.
    const accessBw = (f.perFabricLinks || 0) * gbps(f.speed);
    const upG = gbps(f.uplinkSpeed) || 100;
    const uplinkBw = upPerLeaf * upG * (f.leavesPerFabric || 1);
    const ratio = uplinkBw > 0 ? accessBw / uplinkBw : Infinity;
    const oversubAlreadyFlagged = (res.warnings || []).some(w => /fabric oversubscription ~[\d.]+:1 exceeds target|REQUIRES non-blocking \(1:1\) but is|ran out of uplink ports/i.test(w.message));
    if (f.oversubTarget && ratio > f.oversubTarget + 0.05 && !oversubAlreadyFlagged)
      P(tag, `${f.network}/${leaf.model}: ratio ~${ratio.toFixed(2)}:1 exceeds target ${f.oversubTarget}:1 with NO warning`);
    // spine-tier PORT CAPACITY: leaves' total uplink demand vs the pod-spine tier's TOTAL
    // capacity across every pod (totalPodSpines, not just one pod's spineCount).
    const brkRatio = (f.uplinkBreakout && f.uplinkBreakout.ratio) || 1;
    const neededSpinePorts = f.totalLeaves * upPerLeaf;
    const spineCap = (f.totalPodSpines || f.spineCount || 1) * spineRadix * brkRatio;
    if (neededSpinePorts > spineCap + 0.001 && !fourthTierFlagged)
      P(tag, `${f.network}/${leaf.model}: spine tier needs ${neededSpinePorts} ports > capacity ${spineCap}, no warning anywhere`);
  }
  [f.totalLeaves, f.leavesPerFabric, f.uplinksPerLeaf, f.totalLinks].forEach(v => {
    if (v == null) return;
    if (!isFinite(v) || v < 0) P(tag, `${f.network}: non-finite/negative value in fabric sizing (${v})`);
  });
}

// LAYER 3 — physical optic compatibility. Layers 1-2 (above, checkFabric) verify PORT-COUNT
// budgets: do enough links exist. They cannot catch the class of bug that shipped 3 times in the
// 3-tier Clos feature (v0.54.1/.2): the engine picking a PHYSICALLY WRONG optic for the port it's
// meant to plug into (e.g. a 400GbE transceiver quoted for an 800GbE OSFP112 port) — the numbers
// still add up (same link count either way), so a port-budget check has nothing to catch. This
// recovers the actual optics.js catalog entry behind each Cable/Optic BOM line (by matching its
// `model` text back to a `desc`) and verifies its cataloged SPEED matches the link speed the
// fabric actually needs at that hop — independent of whatever speed engine.js's own pickers
// claim, the same "re-derive, don't trust" principle as the port-budget checks above.
// Deliberately SPEED-based, not full media/connector-string matching: switches.js and optics.js
// use slightly different (but equivalent) media naming conventions at the same tier (e.g.
// "QSFP-DD" vs "QSFP56-DD" both mean the 400G form factor) — a strict string-equality check would
// false-positive on that cosmetic difference. Speed is unambiguous and was the actual root cause
// every time. Breakout assemblies are skipped here (compound "800GbE→2x400GbE" speed strings) —
// checkBreakoutAssemblies above already independently validates their ratio arithmetic.
function opticFromBomLine(C, b) {
  if (!b.model) return null;
  return (C.optics || []).find(o => o.desc && (b.model === o.desc || b.model.indexOf(o.desc + ' —') === 0 || b.model.indexOf(o.desc) === 0));
}
function breakoutLowGbps(speedStr) {
  const parts = String(speedStr).split('→');
  return parts.length > 1 ? gbps(parts[1]) : null;
}
// inverse of gbps() label parsing, for matching engine.js's own "no cataloged optic..." warnings
// (which embed the speed as text, e.g. "800GbE" / "1.6TbE") back to a required-gbps number.
function gbpsLabel(g) {
  return g >= 1000 ? (g / 1000) + 'TbE' : g + 'GbE';
}
function checkOpticSpeedMatch(C, tag, res, P) {
  const cableLines = (res.bom || []).filter(b => b.category === 'Cable/Optic');
  // addLine() stores the merge key as `_mk` on the final line object (it deletes the incoming
  // `mergeKey` field once dedup is resolved — see engine.js addLine()), not `mergeKey`. The prefix
  // (targetId|network) is NOT unique per fabric INSTANCE — e.g. two separate 'poweredge-general'
  // targets at different scales legitimately share the same targetId+network but need DIFFERENT
  // speeds/optics (opticId is the only differentiator, and it's the part deliberately left out of
  // the prefix here). So: gather EVERY line sharing the prefix, not just the first match, and
  // confirm the specific speed this fabric needs is present somewhere in that set — a genuine
  // wrong-optic bug still has NO matching speed anywhere in the set; a legitimate multi-instance
  // split does.
  const findLines = prefixes => cableLines.filter(b => prefixes.some(p => String(b._mk || '').indexOf(p) === 0));
  const verify = (hop, lines, requiredGbps) => {
    if (!lines.length || !requiredGbps) return;
    // a hop can be served EITHER by a plain optic at the exact required speed, OR by a breakout
    // assembly whose LOW side (the leaf/pod-spine-facing end) matches it — both are physically
    // valid; only checkBreakoutAssemblies re-validates a breakout's internal ratio math, this
    // check only needs to confirm the low side is the right speed for what's plugging into it.
    const candidates = lines.map(line => ({ line, optic: opticFromBomLine(C, line) })).filter(x => x.optic);
    if (!candidates.length) return;
    const speedsSeen = candidates.map(x => x.optic.speed);
    const anyMatch = candidates.some(x => {
      const low = breakoutLowGbps(x.optic.speed);
      if (low != null) return low === requiredGbps;
      // Rate-adaptive copper (Cat6A RJ45 on a native BaseT leaf, e.g. cat6a-host) is ONE
      // physical SKU that auto-negotiates any speed up to its cataloged ceiling (1G and 10G
      // hosts both legitimately use the same cable) — not an exact-speed part like an optic/DAC.
      if (x.optic.category === 'copper') return requiredGbps <= gbps(x.optic.speed);
      return gbps(x.optic.speed) === requiredGbps;
    });
    // legitimate exception: a DIFFERENT fabric instance sharing this same targetId+network prefix
    // (e.g. two 'poweredge-ai' targets at different rail speeds) can leave a genuine candidate
    // line in the set while THIS instance's own requirement has no cataloged part at all — the
    // engine explicitly flags that case (return null + warn) rather than silently omitting it.
    // Don't re-flag what's already been flagged.
    const flaggedUncataloged = (res.warnings || []).some(w => /no cataloged/i.test(w.message) && w.message.indexOf(gbpsLabel(requiredGbps)) >= 0);
    if (!anyMatch && !flaggedUncataloged)
      P(tag, `${hop}: needs ${requiredGbps}Gbps but no BOM line among {${speedsSeen.join(', ')}} matches — physically incompatible, silently substituted`);
  };
  (res.fabrics || []).forEach(f => {
    if (f.network === 'mgmt' || !f.leaf) return;
    verify(`${f.network} host`, findLines([`host|${f.targetId}|${f.network}|`]), gbps(f.speed));
    if (f.spine) verify(`${f.network} leaf→spine`, findLines([`uplink|${f.targetId}|${f.network}|`, `brk|${f.targetId}|${f.network}|`]), gbps(f.uplinkSpeed));
    if (f.interconnectQty) verify(`${f.network} peer-link`, findLines([`peer|${f.targetId}|${f.network}`]), gbps(f.interconnectSpeed));
    // pod-spine→super-spine: scope to THIS fabric's own spine group (spineGroupKey), not a bare
    // "superspine|" prefix — multiple independent 3-tier groups (e.g. an AI group + a shared
    // general group) can coexist in one design, each with its own totally different link speed.
    if (f.superSpine && f.spineGroupKey) verify(`${f.network} pod-spine→super-spine`, findLines([`superspine|${f.spineGroupKey}`, `superspine-brk|${f.spineGroupKey}`]), gbps(f.spine.access && f.spine.access.speed));
  });
  if (res.context && res.context.borderLeaf) {
    const bl = res.context.borderLeaf;
    verify('border-leaf uplink', findLines(['border-up']), gbps(bl.uplinkSpeed));
  }
  if (res.coreUplink && res.coreUplink.enabled && res.coreUplink.gbps < 800) {
    // DCI/fabric core-uplink clamps to <=400 internally (see engine.js coreOptic pick) — only
    // check the common (non-DCI) case where the requested speed should flow straight through.
    if (res.coreUplink.type !== 'dci') verify('core-uplink', findLines(['core']), res.coreUplink.gbps);
  }
}

function checkOob(C, tag, res, P) {
  const mgmtLines = (res.bom || []).filter(b => b.category === 'Management');
  if (!mgmtLines.length) return;
  const mgmtF = (res.fabrics || []).find(f => f.network === 'mgmt');
  if (!mgmtF) { P(tag, 'Management switch(es) in BOM but no mgmt fabric present'); return; }
  const totalMgmtPorts = mgmtF.totalLinks != null ? mgmtF.totalLinks : (mgmtF.hostMgmt || 0) + (mgmtF.switchMgmt || 0);
  const cap = mgmtLines.reduce((s, b) => { const sw = C.switches.find(x => x.model === b.model); return s + (b.qty * ((sw && sw.access && sw.access.count) || 48)); }, 0);
  if (cap < totalMgmtPorts) P(tag, `OOB capacity ${cap} ports < ${totalMgmtPorts} mgmt ports needed`);
}

function checkBom(C, tag, res, P) {
  (res.bom || []).forEach(b => {
    if (typeof b.qty === 'number' && (!isFinite(b.qty) || b.qty < 0)) P(tag, `BOM line "${b.item}" has bad qty ${b.qty}`);
    if (typeof b.qty === 'number' && b.qty === 0) P(tag, `BOM line "${b.item}" has ZERO qty (should be omitted)`);
  });
  checkOob(C, tag, res, P);
  // shape consistency, top-level result fields: border-leaf / core-uplink / mgmt all say they were
  // built into the design (non-null) — the BOM must actually contain matching hardware for each.
  const swLines = (res.bom || []).filter(b => b.category === 'Switch');
  const cableLines = (res.bom || []).filter(b => b.category === 'Cable/Optic');
  if (res.context && res.context.borderLeaf) {
    if (!swLines.some(b => b.model === res.context.borderLeaf.model && /border-leaf/i.test(b.item || b.note || '')))
      P(tag, `context.borderLeaf (${res.context.borderLeaf.model}) set but NO matching border-leaf Switch BOM line exists`);
  }
  if (res.coreUplink && res.coreUplink.enabled) {
    // legitimate exception: the engine explicitly flags (and skips) core-uplink speeds it has no
    // cataloged optic for (e.g. 800G+) rather than silently shipping a wrong one — don't flag that.
    const flaggedUncataloged = (res.warnings || []).some(w => /no cataloged optic for .* — this speed is beyond current catalog coverage/i.test(w.message));
    if (!flaggedUncataloged && !cableLines.some(b => /inter-network/i.test(b.item || b.note || '')))
      P(tag, `coreUplink.enabled but NO matching inter-network Cable/Optic BOM line exists`);
  }
  if (res.mgmt && res.mgmt.qty) {
    const mgmtLines = (res.bom || []).filter(b => b.category === 'Management');
    if (!mgmtLines.some(b => b.model === res.mgmt.model))
      P(tag, `mgmt (${res.mgmt.model} ×${res.mgmt.qty}) set but NO matching Management BOM line exists`);
  }
}

function checkBreakoutAssemblies(C, tag, res, P) {
  (res.bom || []).forEach(b => {
    // matches BOTH leaf→spine breakout ("Leaf-to-spine uplinks (BREAKOUT) ... 1× X spine port →
    // N× Y leaf uplinks (Q leaf uplinks ÷ N = A assemblies)") AND the 3-tier pod-spine→super-spine
    // breakout, which uses the same "1 high-speed port → N low-speed links" shape but different
    // tier nouns ("super-spine port" / "pod-spine uplink(s)").
    // the tier-noun phrase between the low speed and the "(" is OPTIONAL: the 2-tier note reads
    // "→ 4× 100GbE (80 leaf uplinks ÷ 4 = 20 assemblies)" with no noun, while the 3-tier one has
    // " pod-spine uplink (" — a 2026-07-13 review found the mandatory noun made this check inert
    // for the far more common 2-tier line (it silently matched nothing)
    const m = /(?:Leaf-to-spine uplinks|3-tier Clos) \(BREAKOUT\).*?1× (\S+) (?:spine|super-spine) port → (\d+)× (\S+)(?: (?:leaf|pod-spine) uplinks?)? \((\d+) (?:leaf|pod-spine) uplinks ÷ (\d+) = (\d+) assemblies\)/.exec(b.note || '');
    if (!m) return;
    const [, highSpeed, ratioStr, lowSpeed, uplinkQty, , assembliesStr] = m;
    const ratio = parseInt(ratioStr, 10), uplinkCableQty = parseInt(uplinkQty, 10), assemblies = parseInt(assembliesStr, 10);
    const expectedAssemblies = Math.ceil(uplinkCableQty / ratio);
    if (assemblies !== expectedAssemblies) P(tag, `breakout assembly math wrong: ${assemblies} != ceil(${uplinkCableQty}/${ratio})=${expectedAssemblies}`);
    const merged = /; \+more/.test(b.note || '');
    if (!merged && b.qty !== assemblies) P(tag, `breakout BOM qty ${b.qty} != stated assemblies ${assemblies}`);
    if (merged && b.qty < assemblies) P(tag, `breakout BOM qty ${b.qty} < stated single-contributor assemblies ${assemblies} (should only grow on merge)`);
    const hi = gbps(highSpeed), lo = gbps(lowSpeed);
    const table = C.rules.cabling.breakoutRatios;
    const tableKey = Object.keys(table).find(k => { const [a, bb] = k.split('→').map(Number); return a === hi && bb === lo; });
    if (tableKey && table[tableKey] !== ratio) P(tag, `breakout ratio ${ratio} != documented ${table[tableKey]} for ${hi}→${lo}`);
  });
}

// full battery for one result — the standard entry point most callers want
function checkAll(C, tag, res, P) {
  (res.fabrics || []).forEach(f => checkFabric(C, tag, f, res, P));
  checkBom(C, tag, res, P);
  checkBreakoutAssemblies(C, tag, res, P);
  checkOpticSpeedMatch(C, tag, res, P);
}

module.exports = { gbps, checkFabric, checkOob, checkBom, checkBreakoutAssemblies, checkOpticSpeedMatch, checkAll };
