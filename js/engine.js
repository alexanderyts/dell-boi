/* =============================================================================
 * RECOMMENDATION ENGINE
 * -----------------------------------------------------------------------------
 * Input -> sized, validated networking BOM. Supports MULTIPLE attach targets in
 * one design (e.g. storage + servers), a design-wide leaf-spine decision, GPU-
 * driven AI sizing, and NO-MIX vendor stacks (core = Dell; AI = all-Dell OR
 * all-NVIDIA). Reads window.CATALOG.{switches, optics, platforms, rules}.
 * ========================================================================== */
(function () {
  const C = window.CATALOG;

  function speedToGbps(s) {
    const m = String(s).match(/(\d+(?:\.\d+)?)\s*(T|G)/i);
    return m ? (m[2].toUpperCase() === 'T' ? Math.round(parseFloat(m[1]) * 1000) : Math.round(parseFloat(m[1]))) : 0;
  }
  // Copper host NIC speeds ("1GBase-T" / "10GBase-T") — a distinct PHYSICAL media, not just a
  // speed. Routes to an electrical RJ-45 SFP/SFP+ module (see pickHostCable) instead of a
  // DAC/fiber transceiver; the leaf switch itself is unchanged (the module plugs into the same
  // SFP+ port already modeled for every other host speed).
  function isBaseT(s) { return /base-?t/i.test(String(s)); }
  // A switch's `uplink` field is only a real DEDICATED fabric-uplink port class when it's
  // actually meant for spine-facing traffic — some AI leaves (SN5610/SN5600D) carry a tiny
  // mgmt/breakout-assist port in that field (e.g. 2× 25GbE on an 800G leaf) that is NOT usable
  // for spine uplinks; `notFabricUplink:true` on the catalog entry flags that.
  function hasFabricUplink(leaf) {
    return !!(leaf && leaf.uplink && leaf.uplink.count && !leaf.uplink.notFabricUplink);
  }
  // EVPN-Multihoming support is an EXPLICIT per-switch capability (catalog `redundancyMethods`,
  // sourced from the Enterprise SONiC Compatibility Matrix) — NOT the topology `roles` field, which
  // says where a switch sits, not which protocols it speaks. (E3248P/E3248PXE edge switches DO run
  // EVPN-MH; E3224F-ON specifically does not.) The main recommend() path only ever sizes main-fabric
  // leaves — pickLeaf/pickSpine return S/Z/SN leaf-spine switches, never an edge switch — so in the
  // ICL fallback this is the TRUE capability test, not a proxy, and would correctly hard-error if a
  // non-EVPN-MH switch ever reached it.
  function supportsEvpnMh(sw) {
    return !!(sw && Array.isArray(sw.redundancyMethods) && sw.redundancyMethods.indexOf('evpn-mh') >= 0);
  }
  // R14 (2026-07-23, work-order D3, kept) — the NOS a switch BOM line states. Dell switches on
  // the NEW-BUILD main path are always Dell Enterprise SONiC (nos is pinned — see the `nos`
  // const above); NVIDIA Spectrum switches have no chosen NOS input anymore (R14-D2 was
  // DROPPED — DFM applicability is a per-model catalog fact, not a wizard question), so the
  // line states what the model CAN run, per the catalog's own `nosSupported`/`dfmVerify` facts
  // — not inferred from `npu` (npu can't express "no SONiC path", which is the E3224F case).
  function switchNosNote(sw) {
    if (!sw) return '';
    if (/NVIDIA/i.test(sw.vendor || '')) {
      return sw.dfmVerify
        ? 'NVIDIA Cumulus Linux / NVIDIA Pure SONiC / Dell SONiC on Spectrum (verify)'
        : 'NVIDIA Cumulus Linux / NVIDIA Pure SONiC';
    }
    return 'Dell Enterprise SONiC';
  }
  // Architecture refactor (2026-07-23, GAPS G-030): the ATOMIC per-model fact underlying
  // dfmStatus/validate.js check #14/ui.js's dfmStats — "does this switch model have a Dell-SONiC
  // path" — used to be typed out as `Array.isArray(m.nosSupported) && m.nosSupported.indexOf
  // ('dell-sonic') >= 0` independently in all three places. One predicate now; every consumer
  // calls it instead of re-deriving it.
  function isDellSonicCapable(sw) {
    return !!(sw && Array.isArray(sw.nosSupported) && sw.nosSupported.indexOf('dell-sonic') >= 0);
  }
  // R14 Slice 3 (2026-07-23, work-order M2/D1, kept) — DFM applicability is a PER-MODEL CATALOG
  // FACT (ruling 1), not a wizard question (the work order's `nvidiaNos` input was dropped — see
  // DESIGN-LOG 2026-07-23). Single predicate, read from the ACTUAL switches on the finished BOM
  // (not from `input.stack` or similar — a design can mix, and the BOM is ground truth) so every
  // DFM attach site (wizard + Expert Form, 6 call sites) shares one answer instead of
  // hand-duplicating the logic (same "share, don't copy-paste" discipline as hasFabricUplink).
  function dfmStatus(res) {
    const sw = (C.switches || []);
    const models = (res && res.bom || []).filter(l => l.category === 'Switch')
      .map(l => sw.find(s => s.model === l.model)).filter(Boolean);
    const dellSonicCapable = models.filter(isDellSonicCapable);
    return {
      applicable: dellSonicCapable.length > 0,
      // true only when EVERY dell-sonic-capable switch backing this design is one of the three
      // verify-flagged Spectrum models (AI-SPECTRUM H04658) — i.e. no plain Dell PowerSwitch is
      // present to anchor the claim without the compatibility-matrix caveat.
      verifyOnly: dellSonicCapable.length > 0 && dellSonicCapable.every(m => m.dfmVerify)
    };
  }
  // Architecture refactor (2026-07-23, GAPS G-030): moved out of wizard.js/app.js, which each
  // had a byte-identical addVerity(res) — the only difference was how each file reaches the
  // catalog (wizard.js's C() helper vs. app.js's window.CATALOG directly), which vanishes here
  // since engine.js already aliases `C = window.CATALOG`. wizard.js's addVerity is now a
  // one-line delegate (keeping its name and window.Wizard._test exposure so selftest.js's
  // existing DFM-gate tests need no changes); app.js calls this directly.
  function attachDfm(res) {
    const v = (C.solutions || []).find(x => x.id === 'verity');
    if (!v) return;
    const status = dfmStatus(res);
    res.warnings = res.warnings || [];
    if (!status.applicable) {
      res.warnings.push({ severity: 'info', message: 'Dell Fabric Manager (DFM) not applicable — this fabric runs NVIDIA Cumulus Linux / NVIDIA Pure SONiC, not Dell Enterprise SONiC (DFM manages Dell Enterprise SONiC fabrics only). For the NVIDIA side, use NVIDIA NetQ / NVUE instead.', source: 'Dell Fabric Manager (DFM) applicability — R14' });
      return;
    }
    const line = Object.assign({}, v.bomLine);
    if (status.verifyOnly) line.note += ' — the Spectrum switches here run Dell SONiC per AI-SPECTRUM H04658, but are not yet listed on the Enterprise SONiC Compatibility Matrix; DFM attach here is verify-flagged.';
    res.bom.push(line);
  }

  /* ---- vendor/stack-aware switch selection ----------------------------- */
  // Core data-center (general) ALWAYS leads with Dell PowerSwitch.
  // AI fabric is a single stack: 'dell' (PowerSwitch/SONiC) OR 'nvidia' (Spectrum).
  function pickLeaf(gbps, workload, stack, baseT) {
    const byId = id => C.switches.find(x => x.id === id);
    if (stack === 'nvidia') {   // full-NVIDIA stack: Spectrum for EVERY fabric (breakout covers 10-100G)
      if (gbps >= 800) return byId('sn5610');
      // 400G AI rails ride Spectrum-4 SN5600 (128×400G twin-port OSFP) — the switch BOTH the
      // GB200 RA ("SN5600 Leaf switches") and the NVL72 RA build on. SN4700 (Spectrum-3,
      // 32×400G) stays the economical ToR for the lower-speed host fabrics only.
      if (workload === 'ai' && gbps >= 400) return byId('sn5600');
      return byId('sn4700');
    }
    if (workload === 'ai') return gbps >= 400 ? byId('z9864f-on') : byId('z9432f-on');   // dell AI — FDC AI export: Z9864F dense leaf (128×400G) at 400G rails
    if (gbps >= 200) return byId('z9432f-on');   // 200G hosts (QSFP56 class) — Z9432F runs 64×200G breakout (FDC AI FE evidence)
    if (gbps >= 40) return byId('s5232f-on');   // 40G QSFP+ plugs natively into QSFP28 (legacy 40G NICs land here, NOT on SFP28 leaves)
    if (gbps >= 25) return byId('s5248f-on');
    // 1/10G copper (BaseT) hosts get the NATIVE RJ45 ToR (S4348T-ON, same 48-port/6x100G-uplink
    // tier as S4348F-ON) — no SFP+ cage to plug a copper module into is needed. Fiber/DAC hosts
    // at the same speed class keep the SFP+ ToR (S4348F-ON) with the matching optic/DAC.
    if (baseT) return byId('s4348t-on');
    return byId('s4348f-on');   // 1/10G fiber ToR — S41xx series is END OF SALE, S4348F-ON (Trident3, Enterprise SONiC) replaces it
  }
  function pickSpine(gbps, workload, stack) {
    const byId = id => C.switches.find(x => x.id === id);
    if (stack === 'nvidia') {
      if (gbps >= 800) return byId('sn5610');
      // GB200 RA: "Each SU features two SN5600 switches as the aggregation layer or spine
      // layer" — the AI spine (and any 400G-class spine) is Spectrum-4 SN5600, never the
      // 32-port Spectrum-3 SN4700 (which forced absurd spine counts at rail scale).
      if (workload === 'ai' || gbps >= 400) return byId('sn5600');
      return byId('sn4700');
    }
    if (workload === 'ai') return gbps >= 800 ? byId('z9964f-on') : (gbps >= 400 ? byId('z9864f-on') : byId('z9664f-on'));   // dell AI — FDC: Z9864F spine w/ 800G interlinks
    return gbps >= 400 ? byId('z9664f-on') : byId('z9432f-on');
  }
  // SUPER-SPINE (3-tier Clos, top tier) — only reached once a single spine tier's radix can't
  // reach every pod-spine (see step 3). Prefers the SAME model as the pod-spine (many real
  // 3-tier designs run one switch type end-to-end); steps up to the largest same-vendor/stack
  // switch (Z9964F-ON for Dell, SN6810 for NVIDIA) when more radix is needed.
  // R12 ruling 2026-07-16d: a super-spine candidate qualifies ONLY if its ports can actually
  // TERMINATE the pod-spine's uplink speed — by native match, or by a cataloged breakout whose
  // FAR ENDS seat in the pod-spine's cage. Radix alone is not qualification: the Z9964F-ON
  // (64× 1.6T OSFP224) was being credited with 2048 ports for 800G Z9864F-ON pod-spines, but it
  // reaches 800G only via breakout ('800G': '128 (breakout)') and NO 1.6T→2×800G part with
  // OSFP112 far-ends is cataloged. That credit is the same PHANTOM class as the 400G-uplink
  // credit one tier down — capacity attributed to a link with no part behind it.
  // The flagship is GATED, not banned: catalog a real 1.6T→2×800G OSFP part and it re-qualifies
  // automatically (CITATION-LOG → "AI 3-tier super-spine 800G termination").
  // Routed through resolveUplinkBreakout — never the breakout picker directly — so this shares the
  // ONE source of truth for "is this speed step actually cataloged, with far-ends that seat?"
  // (G-013 call-site guard). It also keeps the far-end fit check in exactly one place.
  // (Deliberately not naming the picker with parens above: G-013's guard is TEXT-based and counts
  // any `name(` occurrence as a call site — a prose mention would trip it. Same inert-regex class
  // the 0.58 review found.)
  function superSpineTerminates(candidate, podSpine, stack, breakoutMode) {
    if (!candidate || !candidate.access || !podSpine || !podSpine.access) return false;
    const FF = C.formFactor;
    const hiG = speedToGbps(candidate.access.speed) || 0, loG = speedToGbps(podSpine.access.speed) || 0;
    if (!hiG || !loG) return false;
    // native same-speed — still must be cage-compatible (always is within a family; check anyway)
    if (hiG === loG) return !FF || FF.fits(candidate.access.media, podSpine.access.media).ok;
    if (hiG < loG) return false;                       // can't step DOWN to reach a faster pod-spine
    // faster candidate → only qualifies via a REAL breakout for this exact hop. Note this honors the
    // design's breakout mode: with breakout OFF, a 1.6T switch genuinely cannot carry 800G links, so
    // it is gated the same way — the tier steps to same-speed rather than quoting an unbuildable hop.
    return !!resolveUplinkBreakout(candidate, podSpine.access.speed, breakoutMode || 'auto',
      stack === 'nvidia', podSpine.access);
  }
  function pickSuperSpine(podSpine, totalPodSpines, stack, breakoutMode) {
    const byId = id => C.switches.find(x => x.id === id);
    const radix = sw => (sw && sw.access && sw.access.count) || 0;
    if (radix(podSpine) >= totalPodSpines) return podSpine;
    // MISSING RUNG (fixed, GAPS.md G-001): before jumping straight to the flagship, look for a
    // SAME-SPEED, higher-radix spine-role switch (e.g. Z9432F-ON pod-spine, 400GbE/32 native ->
    // Z9664F-ON, 400GbE/64 native, one step up) — keeps pod-spine<->super-spine cabling
    // same-speed/cataloged instead of forcing a cross-speed step that may have no cataloged
    // breakout (see resolveUplinkBreakout()/G-002). No equivalent exists for Z9864F-ON pod-
    // spines (800GbE, no second 800G-native Dell spine) or on the NVIDIA side (SN5610->SN6810
    // is already a same-speed 800GbE jump straight to the flagship) — both fall through to the
    // existing flagship behavior unchanged, verified against the real catalog.
    const podSpeed = podSpine && podSpine.access && podSpine.access.speed;
    const podRadix = radix(podSpine);
    const sameSpeedStep = podSpeed ? C.switches
      .filter(sw => sw.vendor === podSpine.vendor && sw.access && sw.access.speed === podSpeed &&
        sw.roles && sw.roles.indexOf('spine') >= 0 && radix(sw) > podRadix)
      .sort((a, b) => radix(a) - radix(b))
      .find(sw => radix(sw) >= totalPodSpines)
      : null;
    if (sameSpeedStep && superSpineTerminates(sameSpeedStep, podSpine, stack, breakoutMode)) return sameSpeedStep;
    const flagship = stack === 'nvidia' ? byId('sn6810') : byId('z9964f-on');
    // The flagship qualifies ONLY if it can actually terminate the pod-spine's links (R12 ruling
    // 2026-07-16d). If it can, behavior is unchanged from before — including the case where even
    // the flagship's radix falls short, which still returns it and lets the 4th-tier warning fire.
    if (flagship && superSpineTerminates(flagship, podSpine, stack, breakoutMode)) return flagship;
    // Flagship gated on PART EVIDENCE → step to the WIDEST SAME-SPEED spine instead (G-001 ladder
    // principle, part-evidence-gated). Every link in the tier is then a cataloged same-speed link,
    // and the tier grows WIDER by port math rather than being credited with ports it can't use.
    const widestSameSpeed = podSpeed ? C.switches
      .filter(sw => sw.vendor === podSpine.vendor && sw.access && sw.access.speed === podSpeed &&
        sw.roles && sw.roles.indexOf('spine') >= 0)
      .sort((a, b) => radix(b) - radix(a))[0] : null;
    return (widestSameSpeed && radix(widestSameSpeed) >= podRadix ? widestSameSpeed : podSpine) || flagship;
  }
  // Was the flagship passed over purely for lack of a cataloged connection? (Radix was fine, parts
  // weren't.) The caller uses this to emit the "parts decision, not an error" info line — computed
  // here rather than stashed on the returned switch, because catalog objects are SHARED singletons:
  // hanging per-design state on one would leak into every later design in the same session.
  function superSpineGatedFlagship(podSpine, totalPodSpines, stack, breakoutMode) {
    const flagship = stack === 'nvidia' ? C.switches.find(x => x.id === 'sn6810') : C.switches.find(x => x.id === 'z9964f-on');
    // gated = the flagship was passed over for PARTS, not size — i.e. it would otherwise have been
    // chosen (it isn't the pod-spine's own model) but can't terminate these links.
    return (flagship && flagship.id !== (podSpine && podSpine.id) && !superSpineTerminates(flagship, podSpine, stack, breakoutMode)) ? flagship : null;
  }

  // Host↔leaf cable class follows WHERE the switch sits relative to the host:
  //   in-rack  -> passive DAC (copper, ≤3-5m)
  //   adjacent -> AOC/AEC (active optical/copper, ≤~30m) where available, else DAC
  //   structured -> pluggable optical transceiver over structured fiber (100m+/km)
  // Both pickHostCable and pickUplinkCable use EXACT speed matching (===), not loose `>=`
  // thresholds. The catalog only covers specific discrete tiers per vendor/placement — a loose
  // `>=` silently lets a HIGHER, uncataloged speed fall through to the nearest LOWER tier's part,
  // shipping a physically wrong connector (found live repeatedly: 800G structured host, 1.6T
  // super-spine cabling, 1.6T/800G-loose border-leaf uplink, 40G host). Any combination with no
  // genuine match returns null; every caller must check for that and warn, not substitute.
  // R12: `port` = the SWITCH port this cable seats in (a {speed, media} port class), and
  // `farCage` = the far-end (server NIC) cage where that distinction picks a different part.
  // Both are optional so existing callers keep their behavior for the speeds/media where the
  // cage never branches; where it DOES branch (400G NVIDIA rails, 100G SFP56-DD), passing them
  // is what makes the pick buildable instead of merely speed-matched.
  function pickHostCable(gbps, placement, nv, baseT, port, farCage) {
    const byId = id => C.optics.find(x => x.id === id);
    const portCages = port && port.media ? (C.formFactor ? C.formFactor.cagesOf(port.media) : []) : [];
    const onCage = c => portCages.indexOf(c) >= 0;
    // Copper host NIC (1000BASE-T / 10GBASE-T) lands on the NATIVE RJ45 leaf (S4348T-ON, see
    // pickLeaf) — a plain rate-adaptive Cat6A patch cable, not an SFP module (that switch's
    // access bank has no SFP+ cage to plug one into). Applies regardless of placement/vendor
    // toggle (copper twisted-pair reach already covers every placement this tool models;
    // there's no "structured" or "NVIDIA" variant of a copper patch cord).
    if (baseT) {
      if (gbps === 10 || gbps === 1) return byId('cat6a-host');
      return null;   // no cataloged copper cabling at any other speed (e.g. 25GBase-T)
    }
    if (nv) {   // NVIDIA LinkX — cataloged at exactly 25/100/400/800GbE, nothing else
      if (gbps === 800) return placement === 'structured' ? byId('nv-dr8-800g-osfp') : (placement === 'adjacent' ? byId('nv-acc-800g-osfp') : byId('nv-dac-800g-osfp'));
      if (gbps === 400) {
        // A 400G rail lands on one of TWO physically different switch cages, and the part differs:
        //   twin-port OSFP (SN5600/SN5610/SN5600D/SN6810) -> an MCP7Y00/Y10 1:2 SPLITTER, chosen by
        //     the SERVER NIC's cage (OSFP -> Y00, QSFP112 -> Y10). NEVER defaulted: they are
        //     different far-end connectors and a wrong guess is an unbuildable cable
        //     (ruling 2026-07-16d(a)). Unknown cage -> null, and the caller asks.
        //   QSFP-DD (SN5400/SN4700) -> the MCP1660-W0xx QSFP-DD DAC, which fits ONLY these.
        // Quoting the QSFP-DD DAC into an OSFP cage was R12's second defect (1152 wrong parts on a
        // GB300 NVL72 BOM). One splitter carries TWO rails — see railsPerAssembly.
        if (onCage('OSFP')) {
          if (placement === 'structured') return byId('nv-sr4-400g-osfp');
          if (farCage === 'osfp') return byId('nv-brk-800g-2x400-osfp');
          if (farCage === 'qsfp112') return byId('nv-brk-800g-2x400-q112');
          // 'unsure' = the rep was ASKED and answered "not sure" (ruling 2026-07-16d(a)): quote the
          // OSFP variant but VERIFY-flag it rather than block the BOM. Distinct from `null`, which
          // means nobody was asked — that still refuses to guess.
          if (farCage === 'unsure') return byId('nv-brk-800g-2x400-osfp');
          return null;
        }
        return placement === 'structured' ? byId('nv-sr4-400g-osfp') : byId('nv-dac-400g-qsfpdd');
      }
      if (gbps === 100) return placement === 'structured' ? byId('nv-sr4-100g-qsfp28') : byId('nv-dac-100g-qsfp28');
      if (gbps === 25) return placement === 'structured' ? byId('nv-sr-25g-sfp28') : byId('nv-dac-25g-sfp28');
      return null;   // 1G/10G/40G/200G/1.6T — no cataloged NVIDIA host optic at these speeds
    }
    if (gbps === 1) return byId('sfp-1g-sx');   // fiber SFP, non-baseT — same SFP+ port, any placement
    if (gbps === 40 || gbps >= 1600) return null;   // no cataloged Dell/general optic at all
    // 100G into an SFP56-DD access bank (S5448F-ON) — its ports are 2x50G-PAM4, and per its own
    // spec sheet "QSFP28 optics and break-out will not work on the SFP56-DD ports". So this tier
    // NEVER takes the QSFP28 ladder below; it takes the S56DD family. Note this branch applies at
    // EVERY placement including in-rack: no SFP56-DD DAC is cataloged, because the only S56DD
    // copper part has a QSFP56 far end and a passive DAC can't downshift 50G-PAM4 to a 25G-NRZ
    // QSFP28 NIC (ruling 2026-07-16d(b) — DAC held pending per-NIC verification). In-rack hosts
    // therefore quote the SR1.2 optic: costlier than a DAC, but known-buildable.
    if (gbps === 100 && onCage('SFP-DD'))
      return byId(placement === 'structured' ? 's56dd-100g-fr' : 's56dd-100g-sr');
    if (placement === 'structured') {
      // no cataloged long-reach Dell/general transceiver at 200G or 800G+ (only in-rack DACs
      // exist at those tiers) — null, not a silent fallthrough to the nearest lower tier.
      if (gbps === 800 || gbps === 200) return null;
      if (gbps >= 400) return byId('dr4-400g-qsfpdd');
      if (gbps >= 100) return byId('sr4-100g-qsfp28');
      if (gbps >= 25) return byId('sr-25g-sfp28');
      return byId('sr-10g-sfpp');
    }
    if (placement === 'adjacent') {
      // AOC only — DAC is in-rack-only reach (rules.leafSpine.considerations, surfaced to the
      // customer via validate.js), so an adjacent-rack run must never fall back to it (GAPS.md
      // G-005). Both AOC ids are cataloged today so this was never a live bug, but a naive
      // `first([aoc, dac])` fallback would have silently shipped DAC on a cross-rack run the
      // moment either AOC entry was ever renamed/removed — matches this codebase's convention of
      // returning null (caller warns "no cataloged optic") over silently substituting.
      if (gbps >= 100 && gbps < 200) return byId('aoc-100g-qsfp28');
      if (gbps >= 25 && gbps < 100) return byId('aoc-25g-sfp28');
    }
    if (gbps >= 800) return byId('dac-800g-osfp');   // in-rack passive DAC — default
    // 400G rails on a Dell 800G OSFP112 leaf (Z9864F-ON): the port is OSFP, so the QSFP56-DD DAC
    // below cannot seat in it (R12 — this is the Dell-stack twin of the NVIDIA MCP1660 defect).
    // The port fans out via the 800G→2×400G breakout instead; its far ends are QSFP56-DD, which
    // suits a QSFP56-DD host NIC. One assembly = 2 rails (see railsPerAssembly).
    if (gbps === 400 && onCage('OSFP')) return placement === 'structured' ? null : byId('brk-800g-2x400');
    if (gbps >= 400) return byId('dac-400g-qsfpdd');
    if (gbps >= 200) return byId('dac-200g-qsfp56');
    if (gbps >= 100) return byId('dac-100g-qsfp28');
    if (gbps >= 25) return byId('dac-25g-sfp28');
    return byId('dac-10g-sfpp');
  }
  function pickUplinkCable(gbps, nv, structured) {
    const byId = id => C.optics.find(x => x.id === id);
    if (nv) {   // NVIDIA LinkX leaf/pod-spine↔spine — cataloged at exactly 25/100/400/800GbE
      if (gbps === 800) return byId('nv-sr8-800g-osfp');
      if (gbps === 400) return byId('nv-sr4-400g-osfp');
      if (gbps === 100) return byId('nv-sr4-100g-qsfp28');
      if (gbps === 25) return byId('nv-sr-25g-sfp28');
      return null;   // 10G/40G/200G/1.6T — no cataloged NVIDIA uplink optic at these speeds
    }
    if (gbps === 40 || gbps >= 1600) return null;   // no cataloged Dell/general optic at all
    if (gbps === 800) return byId('dac-800g-osfp');   // in-rack only (DAC, ≤4m) — callers crossing racks must check reach and warn
    if (gbps === 200) return null;   // no cataloged 200G uplink transceiver/AOC (only an unmodeled-for-this-hop DAC exists)
    if (gbps >= 400) return byId('dr4-400g-qsfpdd');
    // structured runs (row/room) use transceivers over fiber, not fixed-length AOCs
    if (gbps >= 100) return byId(structured ? 'sr4-100g-qsfp28' : 'aoc-100g-qsfp28');
    return byId(structured ? 'sr-25g-sfp28' : 'aoc-25g-sfp28');
  }
  // Breakout optic for a high-speed switch port fanned into N lower-speed links. EXACT match on
  // highG — each of these is a fixed physical SKU wired to ONE specific native port speed (an
  // 800G→2x400G assembly's high-speed end is an 800G connector; it does NOT also fit a 1.6T port
  // just because 1.6T is ">= 800"). A loose `>=` here silently returned a physically-incompatible
  // breakout for any highG above its intended tier — dormant until pickSuperSpine (3-tier) became
  // the first caller able to ever pass a 1.6T highG; fix at the source so every caller benefits.
  function pickBreakout(highG, lowG, nv, farCage) {
    const byId = id => C.optics.find(x => x.id === id);
    // 800G->2x400G on NVIDIA is the twin-port-OSFP rail splitter — same never-defaulted far-end
    // cage rule as pickHostCable (MCP7Y00 = 2x OSFP, MCP7Y10 = 2x QSFP112). Unknown cage -> null.
    if (nv && highG === 800 && lowG === 400)
      return farCage === 'osfp' ? byId('nv-brk-800g-2x400-osfp')
        : farCage === 'qsfp112' ? byId('nv-brk-800g-2x400-q112') : null;
    if (nv && highG === 400 && lowG === 100) return byId('nv-brk-400g-4x100');
    if (highG === 800 && lowG === 400) return byId('brk-800g-2x400');
    if (highG === 400 && lowG === 100) return byId('brk-400g-4x100');
    if (highG === 200 && lowG === 100) return byId('brk-200g-2x100');
    if (highG === 100 && lowG === 25) return byId('brk-100g-4x25');
    return null;
  }
  // Resolves the ACTUAL leaf<->spine breakout (if any) for a fabric riding a given spine — the
  // SINGLE SOURCE OF TRUTH for whether/how a spine port breaks out into multiple uplink-speed
  // links, validated against the real breakout catalog (never a naive speed-ratio guess). Used
  // BOTH by the 3-tier trigger (step 3, crediting the group's effective radix with only a
  // catalog-real ratio) and the actual uplink cabling (step 4) — so the two can never diverge.
  // An earlier attempt to approximate this at the trigger from UNRELATED speeds (spine native
  // vs the fabric's HOST NIC speed, not its actual uplink speed) produced phantom credit with no
  // cataloged part behind it (G-007 follow-up, 2026-07-15) — this is why the real per-fabric
  // uplinkSpeed/breakoutMode/nv must be threaded through, not re-derived from something else.
  // `leafPort`: R12 — a breakout's LOW ends land on the LEAF, so a candidate assembly is only real
  // if those ends physically seat there. Without this, a Dell 800G-OSFP112 spine serving 400G links
  // to an 800G-OSFP112 leaf "resolved" the DAC-O112-800G2x400G breakout, whose low ends are
  // QSFP56-DD — unbuildable against an OSFP leaf port. There is no cataloged OSFP→2×OSFP Dell
  // assembly, so this must return null (caller warns) rather than substitute a part that can't reach.
  function resolveUplinkBreakout(spine, upSpeed, breakoutMode, nv, leafPort) {
    if (breakoutMode === 'none' || !spine || !spine.access) return null;
    const spineGbps = speedToGbps(spine.access.speed) || 0;
    const upGbps = speedToGbps(upSpeed) || 0;
    if (!spineGbps || !upGbps || spineGbps <= upGbps) return null;
    const ratio = Math.round(spineGbps / upGbps);
    if (ratio !== 2 && ratio !== 4) return null;
    const leafCages = (leafPort && leafPort.media && C.formFactor) ? C.formFactor.cagesOf(leafPort.media) : [];
    const farCage = leafCages.indexOf('OSFP') >= 0 ? 'osfp' : leafCages.indexOf('QSFP112') >= 0 ? 'qsfp112' : null;
    const brk = pickBreakout(spineGbps, upGbps, nv, farCage);
    if (!brk) return null;
    // the assembly's low end must seat in the leaf port it fans out to
    if (leafPort && leafPort.media && C.formFactor) {
      const low = C.formFactor.lowMediaOf(brk.media);
      if (low && !C.formFactor.fits(leafPort.media, low).ok) return null;
    }
    return { ratio, brk };
  }
  // The right patch cord for a standalone optic: PARALLEL optics (SR4/SR4.2/SR8/DR8 — MPO
  // connector) take an MPO jumper; DUPLEX optics (SR/LR/FR/LR4/CWDM4 — LC connector) take an
  // LC duplex cord. Classified from the optic's own model/media/reach text, never assumed.
  function fiberCordFor(optic) {
    const s = optic ? `${optic.model || ''} ${optic.media || ''} ${optic.reach || ''}` : '';
    return C.optics.find(x => x.id === (/MPO|SR4|SR8|DR8|PSM4/i.test(s) ? 'struct-patch-mpo' : 'struct-patch-lc'));
  }
  function pickCoreOptic(gbps, longReach) {
    const byId = id => C.optics.find(x => x.id === id);
    // no cataloged 800G+ core/DCI optic yet — the expert-form dropdown caps at 400GbE, but the
    // engine itself doesn't enforce that (programmatic/DesignIO callers could still pass higher),
    // so return null explicitly rather than silently falling through to the 400G branch.
    if (gbps >= 800) return null;
    // long reach = 10 km single-mode LR/LR4 (inter-building / metro / another vendor's core
    // far away); default = short/campus reach (SR / FR-2km class), the pre-existing ladder.
    if (longReach) {
      if (gbps >= 400) return byId('lr4-400g-qsfpdd');
      if (gbps >= 100) return byId('lr4-100g-qsfp28');
      return byId('lr-25g-sfp28');
    }
    if (gbps >= 400) return byId('dr4-400g-qsfpdd');
    if (gbps >= 100) return byId('dr-100g-qsfp28');
    return byId('sr-25g-sfp28');
  }

  // R14 architecture refactor (2026-07-23): a switch line's note used to be assembled BY HAND
  // twice — once here-adjacent, at whichever of the 4 call sites created the line, and a second,
  // differently-coded time in addLine's merge branch. That split is exactly what let G-022 and
  // then G-027 ship: a fact appended at line-creation (first the per-network breakdown, later the
  // NOS statement) silently vanished the moment a second network's switches merged into the same
  // line, because the merge path regenerated the note without knowing that fact existed. Same bug,
  // twice, from the same structural cause. switchLineNote() is now the ONLY place a switch line's
  // note gets written — called once at creation and again on every merge — so there is no second
  // path left to drift out of sync.
  //   `_detail` — the full role-specific description (e.g. "Leaf/ToR — PowerScale frontend
  //     (25GbE); 2/fabric × 2"), written once at creation, never touched again.
  //   `_breakdown` — one {network, qty, dedicated} entry per contributor, starting with the
  //     creator and growing by one entry per merge (DERIVATIONS §1's per-network enumeration).
  //   `nos` — the catalog NOS fact for the model (switchNosNote()), unchanged by merges since a
  //     merge is always same-model (mergeKey defaults to category|model).
  // A single contributor (the common case) prints `_detail` unchanged; two or more print the
  // terse "N total — X× net1, Y× net2 (dedicated, physically separate)" rollup so a merge can
  // never mask something that matters (e.g. PowerScale's h16346-mandated backend isolation).
  function switchLineNote(fields) {
    const bd = fields._breakdown || [];
    const base = bd.length <= 1 ? fields._detail
      : `${bd.reduce((s, b) => s + b.qty, 0)} total — `
        + bd.map(b => `${b.qty}× ${b.network}${b.dedicated ? ' (dedicated, physically separate)' : ''}`).join(', ');
    return base + (fields.nos ? ` · NOS: ${fields.nos}` : '');
  }

  // Dedup: switches consolidate by model (one line, total qty); cables pass a `mergeKey`
  // so host / uplink / breakout / peer cables stay DISTINCT per fabric+role (accurate BOM).
  function addLine(bom, line) {
    const key = line.mergeKey || (line.category + '|' + (line.model || line.item));
    const existing = bom.find(b => (b._mk || (b.category + '|' + (b.model || b.item))) === key);
    if (existing) {
      existing.qty += line.qty;
      // R11 (DERIVATIONS §1): switch lines merge across NETWORKS by design — the group key is
      // (model, role), deliberately not (model, role, network). Every category:'Switch' call
      // site provides `network`/`dedicated` (a synthetic constant label where a real network
      // concept doesn't apply, e.g. border-leaf), so the '; +more' fallback below is now
      // switch-only dead code — kept for the categories that never opted into this (cable/
      // uplink/edge/RA lines use distinct mergeKeys per network already and never reach here).
      if (line.category === 'Switch') {
        existing._breakdown.push({ network: line.network, qty: line.qty, dedicated: line.dedicated });
        existing.note = switchLineNote(existing);
      } else if (existing.note && existing.note.indexOf('; +more') < 0) existing.note += '; +more';
      return;
    }
    const nl = Object.assign({ qty: 0 }, line); nl._mk = key; delete nl.mergeKey; nl.qty = line.qty;
    if (nl.category === 'Switch') {
      nl._detail = nl.note;
      nl._breakdown = [{ network: nl.network, qty: nl.qty, dedicated: nl.dedicated }];
      nl.note = switchLineNote(nl);
    }
    bom.push(nl);
  }

  /* ---- main ------------------------------------------------------------- */
  // Normalize a NIC/port spec ({vendor, speed, portsPerNic, nicsPerUnit}) — used for the
  // global (primary-target) NIC answer AND per-target specs on added targets.
  function normNic(raw) {
    raw = raw || {};
    if (!(parseInt(raw.nicsPerUnit, 10) || parseInt(raw.portsPerNic, 10))) return null;
    const n = { vendor: raw.vendor || '', model: raw.model || '', speed: raw.speed || '', network: raw.network || '',
      portsPerNic: Math.max(1, parseInt(raw.portsPerNic, 10) || 2),
      nicsPerUnit: Math.max(1, parseInt(raw.nicsPerUnit, 10) || 2) };
    n.portsPerUnit = n.nicsPerUnit * n.portsPerNic;
    n.label = `${n.nicsPerUnit}× ${(n.vendor || '').trim()} ${n.portsPerNic}-port${n.speed ? ' ' + n.speed : ''} = ${n.portsPerUnit} ports/unit`.replace(/\s+/g, ' ').trim();
    return n;
  }

  function recommend(input) {
    const R = C.rules;
    // Normalize to a list of targets (back-compat with single platformId).
    const raw = (input.targets && input.targets.length) ? input.targets
      : [{ platformId: input.platformId, units: input.units, gpusPerServer: input.gpusPerServer, modelId: input.modelId,
          railNic: input.railNic, nic2: input.nic2 }];
    const targets = raw.map((t, ti) => {
      const basePlatform = C.platforms.find(p => p.id === t.platformId);
      if (!basePlatform) throw new Error('Unknown platform: ' + t.platformId);
      if (!basePlatform.portGroups || !basePlatform.portGroups.length) throw new Error('Platform has no port groups: ' + basePlatform.id);
      // model drill-down: apply the chosen model's speed / GPU overrides onto a clone
      let platform = basePlatform, model = null;
      if (t.modelId && basePlatform.models) model = basePlatform.models.find(m => m.id === t.modelId);
      if (model) {
        platform = Object.assign({}, basePlatform, { model: model.label, portGroups: basePlatform.portGroups.map(g => Object.assign({}, g)) });
        if (model.aiSpeed) platform.portGroups.forEach(g => { if (g.role === 'aifabric' || g.network === 'aifabric') g.speed = model.aiSpeed; });
        if (model.dataSpeed) { const g = platform.portGroups.find(x => x.role !== 'mgmt' && x.network !== 'backend' && x.network !== 'mgmt'); if (g) g.speed = model.dataSpeed; }
      }
      const units = Math.min(100000, Math.max(1, parseInt(t.units, 10) || 1));
      const gpusPerServer = parseInt(t.gpusPerServer, 10) || (model && model.gpusPerServer) || null;
      // railNic: the GPU-rail NIC generation (e.g. ConnectX-7 400G on a chassis whose
      // model default is ConnectX-8 800G) — overrides the model's rail speed.
      const railNic = (t.railNic && t.railNic.speed && speedToGbps(t.railNic.speed)) ? { speed: t.railNic.speed, model: t.railNic.model || '' } : null;
      // uid: a design can carry SEVERAL targets on the SAME platform (e.g. five separate
      // server pools) — `id` stays the platform id (BOM consolidation keys off it on purpose,
      // so identical hardware/cabling lines merge), but rendering needs a per-INSTANCE key so
      // topology/rack views don't collapse distinct pools into one mislabeled box.
      return { platform, units, gpusPerServer, id: platform.id, uid: ti + ':' + platform.id, modelId: model ? model.id : null,
        nic: normNic(t.nic), nic2: normNic(t.nic2), railNic,
        label: units + '× ' + platform.model, shortLabel: units + '× ' + platform.family };
    });

    let headroom = (input.growthHeadroom != null && !isNaN(input.growthHeadroom)) ? input.growthHeadroom : R.growth.defaultHeadroom;
    headroom = Math.min(2, Math.max(0, headroom));
    const wantDual = input.redundancy !== 'single';
    // R14 ruling (2026-07-23, maintainer): "OS10 shouldn't be quoted, it's end of sale" —
    // dropped portfolio-wide as a quotable NEW-BUILD choice. This is the "new fabrics" function
    // (recommend()) — pinned to 'sonic'/MC-LAG unconditionally, regardless of input.nos. VLT/OS10
    // terminology survives only in recommendRefresh(), which describes a customer's EXISTING
    // switches, not a new quote. input.nos is still accepted (silently ignored) rather than
    // thrown on, for input back-compat.
    const nos = 'sonic';
    // Network architecture — a customer intent question, not a soft default. Three real
    // shapes: 'converged' (compute + storage share ONE leaf tier, VLAN-segmented — no
    // physical separation), 'sharedSpine' (separate leaf per network, one shared spine tier
    // — the long-standing default), 'separate' (separate leaf AND separate spine per
    // network — max isolation). Legacy callers/saved designs only ever set the old boolean
    // `separateFabrics` — mapped straight onto its exact prior meaning for back-compat.
    const fabricArch = ['converged', 'sharedSpine', 'separate'].indexOf(input.fabricArchitecture) >= 0
      ? input.fabricArchitecture : (input.separateFabrics ? 'separate' : 'sharedSpine');
    const separate = fabricArch === 'separate';    // storage/server on separate spines vs one shared spine
    const converged = fabricArch === 'converged';  // storage/server on the SAME leaf switches (VLAN-segmented)

    // Host↔leaf cabling: WHERE the switch sits decides DAC vs AOC vs optical.
    // Back-compat: legacy `media` ('fiber'/'copper') maps to a placement.
    const placement = ['in-rack', 'adjacent', 'structured'].indexOf(input.placement) >= 0 ? input.placement
      : (input.media === 'fiber' ? 'structured' : 'in-rack');
    const placeDef = (R.cabling.placements && R.cabling.placements[placement]) || { media: 'copper' };
    const media = placeDef.media === 'fiber' ? 'fiber' : (placeDef.media === 'aoc' ? 'aoc' : 'copper');
    const structuredInPlace = !!input.structuredInPlace;

    // Breakout: fan a high-speed switch port into N lower-speed links (changes port math + optic count).
    const breakout = input.breakout === 'on' ? 'on' : (input.breakout === 'off' || input.breakout === 'none' ? 'none' : 'auto');

    // MULTI-RACK (FDC pattern, verified across all exports): every node rack gets its own
    // ToR MC-LAG pair + its own OOB switch; spines live in a dedicated rack (with OOB).
    // Affects: leaf count (pair per rack), OOB count (per rack), and cable class for any
    // fabric whose switches are centralized (hosts in far racks need AOC/fiber, not DAC).
    const racks = Math.min(200, Math.max(1, parseInt(input.racks, 10) || 1));

    // GPU rail NIC cage ('osfp' | 'qsfp112') — picks MCP7Y00 vs MCP7Y10 on a twin-port-OSFP leaf.
    // NEVER defaulted (ruling 2026-07-16d(a)): they are different far-end connectors, so a guess
    // ships a cable that cannot plug into the customer's NIC. Absent → the engine quotes no rail
    // cable and hard-errors asking for it.
    // DERIVE-THEN-ASK: explicit answer → a cage the NIC model pins → 'unsure' (asked, answered
    // "not sure": quote the OSFP variant VERIFY-flagged rather than block). `null` never survives
    // here on the AI path, because the wizard/expert question always offers the three options.
    const railNicCage = ['osfp', 'qsfp112', 'unsure'].indexOf(input.railNicCage) >= 0 ? input.railNicCage
      : ((input.railNic && ['osfp', 'qsfp112', 'unsure'].indexOf(input.railNic.cage) >= 0) ? input.railNic.cage
        : ((C.formFactor && input.railNic && C.formFactor.railNicCageOf(input.railNic.model)) || 'unsure'));

    // 100G leaf preference — 'auto' (right-size ladder: S5232F → S5448F when dense or 1:1
    // required) or an explicit override: s5448f / s5232f / z9264f.
    const leaf100 = ['s5448f', 's5232f', 'z9264f'].indexOf(input.leaf100) >= 0 ? input.leaf100 : 'auto';

    // 25G leaf preference — mirrors leaf100: 'auto' (FDC right-size ladder: S5212F ≤12 links →
    // S5224F ≤24 → S5296F when dense (frontend) → S5248F otherwise) or an explicit override:
    // s5212f / s5224f / s5248f / s5296f. Added 2026-07-13 — a user wanted S5248F-ON specifically
    // for a design where the dense-rack auto-rule would otherwise pick S5296F-ON.
    const leaf25 = ['s5212f', 's5224f', 's5248f', 's5296f'].indexOf(input.leaf25) >= 0 ? input.leaf25 : 'auto';

    // Oversubscription target — the traffic pattern decides uplinks-per-leaf ("sized right").
    const trafficProfile = (input.trafficProfile && R.oversubscription.profiles[input.trafficProfile]) ? input.trafficProfile : null;
    let genOversub = (input.oversubTarget != null && !isNaN(parseFloat(input.oversubTarget))) ? parseFloat(input.oversubTarget)
      : (trafficProfile ? R.oversubscription.profiles[trafficProfile].target : R.oversubscription.generalAccessToUplinkMax);
    genOversub = Math.min(4, Math.max(1, genOversub));

    // Speed-migration roadmap (informational — argues for multi-rate optics/switches).
    const roadmap = (input.speedRoadmap && R.growth.migration && R.growth.migration[input.speedRoadmap]) ? input.speedRoadmap : 'none';

    // Block-storage protocol: iSCSI / NVMe-TCP = standard fabric; NVMe-RoCE = lossless + non-blocking.
    const storageProtocol = (input.storageProtocol && R.storageProtocol.protocols[input.storageProtocol]) ? input.storageProtocol : null;
    const spDef = storageProtocol ? R.storageProtocol.protocols[storageProtocol] : null;

    // New build vs adding into an existing fabric (brownfield → incremental BOM).
    const deploy = input.deployType === 'add' ? 'add' : 'new';
    const reuseSpine = deploy === 'add' && !!input.reuseExistingSpine;

    // J2 — uplink target: 'new-spine' (self-contained pod: quote a spine + leaf→spine cabling) vs
    // 'existing-core' (no spine; leaves uplink straight to the customer's existing core). When set,
    // it OVERRIDES the automatic >2-leaf spine trigger. ABSENT (legacy/expert unset) keeps the auto
    // behaviour, so nothing changes for callers that don't pass it. The WIZARD pre-selects it by
    // deployType (existing-core for add/refresh, new-spine for greenfield); the engine just honours
    // whatever arrives.
    const uplinkTarget = ['new-spine', 'existing-core'].indexOf(input.uplinkTarget) >= 0 ? input.uplinkTarget : null;

    // J3 — the far-side (core) handoff decision is WHAT THE EXISTING CORE RUNS, not rep preference:
    //   'dell'   → far-side optics are quotable (Dell part into a Dell switch) → include them.
    //   'other'  → far side is by the customer's core vendor (their part, same link type); OUR side only.
    //   'unsure' → OUR side only + verify flag (default — a wrong 'dell' silently quotes optics that
    //              won't seat in a third-party core; a wrong 'unsure' just under-includes, visibly).
    // Legacy `coreFarEnd:'other'` maps onto 'other' for back-compat.
    const coreVendor = ['dell', 'other', 'unsure'].indexOf(input.coreVendor) >= 0 ? input.coreVendor
      : (input.coreFarEnd === 'other' ? 'other' : 'unsure');
    const coreFarModel = (coreVendor === 'dell' && input.coreFarModel && C.switches.find(s => s.id === input.coreFarModel || s.model === input.coreFarModel)) ? input.coreFarModel : null;

    // AI/HPC RDMA transport: RoCEv2 (default) or Ultra Ethernet (UEC 1.0).
    const aiTransport = (input.aiTransport && R.aiTransport && R.aiTransport.options[input.aiTransport]) ? input.aiTransport : 'roce';

    const anyAi = targets.some(t => t.platform.workload === 'ai');
    const aiStack = input.stack === 'dell' ? 'dell' : (input.stack === 'nvidia' ? 'nvidia' : null);   // AI: no default — must pick
    if (anyAi && !aiStack) throw new Error('Choose an AI fabric stack: Dell PowerSwitch or NVIDIA Spectrum (no default).');
    const allAi = targets.every(t => t.platform.workload === 'ai');
    const aiTargetCount = targets.filter(t => t.platform.workload === 'ai').length;

    const bom = [], warnings = [], fabrics = [];
    // Sweep finding #5 (2026-07-17, maintainer ruling — GAPS G-023, interim measure):
    // `railNicCage` is a single top-level engine input, not per-Target — a 2nd AI target with a
    // DIFFERENT rail-NIC generation (and therefore a different far-end cage: OSFP vs QSFP112)
    // silently gets the SAME cage answer as the first. This is a missing engine capability, not
    // a missing question, so it is NOT plumbed here — only surfaced, so a rep with a genuinely
    // mixed-cage multi-AI-target design sees it rather than trusting a silently-shared answer.
    if (aiTargetCount >= 2) warnings.push({ severity: 'warn',
      message: `${aiTargetCount} AI targets in this design share ONE rail-NIC-cage answer (${railNicCage === 'unsure' ? 'not confirmed' : railNicCage.toUpperCase()}) — the engine does not yet support a different cage per target. If these AI targets use DIFFERENT GPU NIC generations/connectors (e.g. one OSFP, one QSFP112), verify the rail splitter part PER TARGET before ordering; a mismatch ships a cable that cannot plug into that target's NIC.`,
      source: 'railNicCage — single global input, not per-Target (GAPS G-023)' });

    /* NIC config — the global answer describes the PRIMARY target's hosts */
    const nic = normNic(input.nic);

    /* 1. expand targets into fabric specs (mgmt tallied separately) */
    let mgmtLinks = 0;
    const specs = [];
    // The global NIC answers describe the PRIMARY target's hosts. An ADDED target uses
    // its OWN spec (t.nic — captured in the guide/expert form) or its published config.
    // AI targets take a NIC override ONLY via an explicit t.nic (their front-end/storage
    // group) — never from the global answers, whose defaults describe general servers.
    const unspecced = nic ? targets.slice(1).filter(t => !t.nic && t.platform.workload !== 'ai') : [];
    if (unspecced.length) warnings.push({ severity: 'info',
      message: `NIC answers applied to ${targets[0].platform.family} only — ${unspecced.map(t => t.platform.family).join(', ')} keeps its published port configuration (answer the added target's connectivity questions to spec it exactly).`,
      source: 'BOM Advisor input scoping' });
    targets.forEach((t, ti) => {
      const effNic = t.nic || (ti === 0 && t.platform.workload !== 'ai' ? nic : null);
      let nicApplied = false;
      t.platform.portGroups.forEach(g => {
        if (g.role === 'mgmt') { mgmtLinks += t.units * g.count; return; }
        const isAi = g.network === 'aifabric' || (t.platform.workload === 'ai' && g.role === 'aifabric');
        let count = g.count, speed = g.speed, nicOverride = false;
        if (g.network === 'aifabric' && t.gpusPerServer) count = t.gpusPerServer;   // 1 rail per GPU
        // rail-NIC generation override (e.g. XE9780 configured with ConnectX-7 400G rails)
        if (isAi && t.railNic) {
          if (speed !== t.railNic.speed) warnings.push({ severity: 'info',
            message: `${t.platform.family}: GPU rails set to ${t.railNic.speed}${t.railNic.model ? ' (' + t.railNic.model + ')' : ''} per the stated NIC config — overriding the model default of ${speed}. Rail count stays 1 per GPU.`,
            source: 'Stated host configuration' });
          speed = t.railNic.speed;
        }
        // apply the target's NIC spec to its primary non-AI data group
        if (effNic && !isAi && !nicApplied && g.network !== 'backend') {
          count = effNic.portsPerUnit;
          if (effNic.speed) speed = effNic.speed;
          nicApplied = true; nicOverride = true;
        }
        // B4 (single-homing): a NON-redundant design attaches each host by ONE port to its single
        // leaf — the redundant half of the host's ports is spare, not cabled (maintainer ruling
        // 2026-07-16). This halves host links (→ genuinely fewer leaves) for redundant-capable host
        // groups on a single design; dual, back-end (already independent A/B), and AI are unchanged.
        // `singleHomed`/`sparePorts` drive the host-cable note so the quote states WHY a 2-port NIC
        // produced half the cables.
        const singleHomed = g.redundant && !wantDual && !isAi && g.network !== 'backend';
        const usedCount = singleHomed ? Math.max(1, Math.ceil(count / 2)) : count;
        specs.push({ target: t, network: g.network, role: g.role, speed, media: g.media,
          redundant: g.redundant, gbps: speedToGbps(speed), workload: isAi ? 'ai' : 'general',
          linksPerUnit: usedCount, unitsN: t.units, links: t.units * usedCount, note: g.note, nicOverride,
          singleHomed, sparePorts: count - usedCount });
      });
      // SECOND NIC TYPE in the same hosts (e.g. LAN on Broadcom + a dedicated storage
      // NIC) — its own dedicated fabric, sized like whatever network it's stated to serve.
      // Purpose is a customer-stated answer (t.nic2.network), NOT assumed — a second NIC is
      // just as often a second LAN/legacy network as it is storage; defaulting silently to
      // 'storage' mislabeled it and blocked convergence for anyone who meant something else.
      if (t.nic2) {
        const s2 = t.nic2.speed || '25GbE';
        const net2 = t.nic2.network || 'storage';
        specs.push({ target: t, network: net2, role: 'nic2', speed: s2, media: '',
          redundant: true, gbps: speedToGbps(s2), workload: 'general',
          linksPerUnit: t.nic2.portsPerUnit, unitsN: t.units, links: t.units * t.nic2.portsPerUnit,
          note: `Second NIC type — ${t.nic2.label}`, nicOverride: true });
      }
    });
    // Mark each target's PRIMARY host-facing fabric and how many racks the target's units
    // actually SPAN (FDC packs racks by cluster: 4 racks of 16 servers + a storage rack).
    // The primary fabric lands as a ToR pair in each rack the target occupies; the
    // target's OTHER fabrics stay centralized → far-rack hosts cable over AOC/fiber.
    const totalUnitsAll = targets.reduce((s, t) => s + t.units, 0);
    const unitsPerRackEff = Math.max(1, Math.ceil(totalUnitsAll / racks));
    targets.forEach(t => {
      t.racksSpanned = Math.min(racks, Math.max(1, Math.ceil(t.units / unitsPerRackEff)));
      const cand = specs.filter(fs => fs.target === t && fs.workload !== 'ai' && fs.network !== 'backend');
      if (cand.length) cand.reduce((a, b) => (b.links > a.links ? b : a)).isPrimary = true;
    });
    if (racks > 1) {
      warnings.push({ severity: 'info',
        message: `Multi-rack deployment (${racks} racks) — FDC pattern applied: each node rack gets its own ToR MC-LAG pair + its own OOB switch; spines sit in a dedicated rack (with OOB); centralized fabrics (SAN/back-end/secondary NICs) reach far racks over AOC/fiber instead of DAC. Typical density ≈16× 1U hosts/rack — confirm per-rack power/cooling and cable lengths.`,
        source: 'Dell Fabric Design Center exports (rack_topology: node racks = 2 ToR + 1 OOB each; dedicated spine rack)' });
      if (anyAi) warnings.push({ severity: 'warn',
        message: `AI fabric across ${racks} racks: rail switches are row-scale (not per-rack) — GPU rail runs to other racks exceed passive-DAC reach (~3 m). Plan ACC/AOC/optics for cross-rack rails and confirm per-rack power (GPU servers typically 3–4 per rack).`,
        source: 'NVIDIA LinkX reach guidance (DAC ≤3 m; ACC 3–5 m; optics beyond) + AI rack power practice' });
    }

    /* 1.5 CONVERGED FABRIC — combine general-compute + storage specs of matching native
     * speed/electrical-class onto ONE leaf fabric (same physical switches, VLAN-segmented),
     * only when the customer's stated network architecture is 'converged'. Runs BEFORE leaf
     * sizing/spine grouping so every downstream step (host-port budget, spine radix, BOM,
     * topology, rack, OOO copy, draw.io) treats the merged result as one ordinary atomic
     * fabric — no special-casing needed anywhere else in the pipeline.
     * NEVER converges — technical requirements, not customer preferences:
     *   - PowerScale-class 'backend' (h15963/h16346 — physically mandated separate network)
     *   - AI fabrics (Dell/NVIDIA no-mix + rail-optimized topology; unrelated speed class)
     *   - mgmt (already tallied separately, never enters `specs`)
     *   - NVMe over RoCE storage (needs a dedicated lossless PFC/ECN fabric; user-confirmed
     *     2026-07-13: convergence is simply not OFFERED for it, not silently allowed+warned)
     * The merged fabric keeps the MOST CONSTRAINED contributor's `network` label (storage
     * outranks frontend), so every EXISTING oversubscription/redundancy/protocol check in
     * this file and validate.js keeps applying correctly with ZERO changes there — only
     * display/labeling needs to know it's actually converged (fs.converged / .convergedPlatforms
     * / .convergedNetworks / ._convergedFrom). */
    if (converged) {
      const eligible = s => s.workload !== 'ai' && s.network !== 'backend' &&
        !(s.network === 'storage' && storageProtocol === 'nvme-roce');
      // BaseT copper hosts of ANY speed <=10G land on ONE native leaf (S4348T-ON's RJ45 ports
      // are multi-rate — 1G and 10G auto-negotiate on the same switch/port class, see pickLeaf)
      // — bucket them together regardless of exact gbps so e.g. a 1GBase-T pool and a 10GBase-T
      // pool converge onto one physical tier. Fiber/DAC fabrics still require an EXACT gbps
      // match (different speeds there really are different switch chassis).
      const mkKey = s => (isBaseT(s.speed) && s.gbps <= 10) ? 'baseT<=10g' : `${s.gbps}|${isBaseT(s.speed)}`;   // stack is always 'dell' here — AI is excluded
      const buckets = {};
      specs.forEach(s => { if (!eligible(s)) return; (buckets[mkKey(s)] = buckets[mkKey(s)] || []).push(s); });
      Object.entries(buckets).forEach(([key, members]) => {
        if (members.length < 2) return;   // nothing to converge — only one contributor at this speed class
        const rep = members.slice().sort((a, b) => b.links - a.links)[0];   // biggest contributor stands in for target-level fields
        const netLabel = members.some(m => m.network === 'storage') ? 'storage' : 'frontend';
        const platforms = [...new Set(members.map(m => m.target.platform.family))];
        const networks = [...new Set(members.map(m => m.network))];
        const totalLinks = members.reduce((s, m) => s + m.links, 0);
        // Unit count sums PHYSICAL units once per DISTINCT target, not once per member spec —
        // a target's primary NIC and its nic2 (second NIC type) are TWO members from the SAME
        // 60 servers, not 120 different ones; summing unitsN blindly double-counted every
        // same-target multi-NIC merge (newly common now BaseT nic2/primary pools converge).
        const totalUnits = [...new Set(members.map(m => m.target))].reduce((s, t) => s + t.units, 0);
        // Rack-span placement (perRack ToR-per-rack sizing, DAC-vs-cross-rack cabling class)
        // reads fs.target.racksSpanned — borrowing just the biggest-LINK contributor's target
        // silently used ITS span even when a smaller-link contributor actually spans more racks
        // (review-confirmed: DAC priced for hosts physically in a different rack). Use the WORST
        // case across every contributor; clone (never mutate) the real target object so other
        // specs still pointing at it — e.g. an AI portGroup on the same target excluded from
        // convergence — don't inherit an inflated span.
        const maxRacksSpanned = Math.max.apply(null, members.map(m => m.target.racksSpanned || 1));
        const mergedTarget = maxRacksSpanned > (rep.target.racksSpanned || 1) ? Object.assign({}, rep.target, { racksSpanned: maxRacksSpanned }) : rep.target;
        // The BaseT<=10g bucket can combine a genuinely MIXED-rate pool (some 1GBase-T links,
        // some 10GBase-T) onto one leaf tier — labeling the whole thing with just whichever
        // member happened to have more links overstates a single precise speed on a customer-
        // facing BOM/topology note. Say "mixed-rate" when the contributors actually differ.
        const distinctSpeeds = [...new Set(members.map(m => m.speed))];
        const mergedSpeed = distinctSpeeds.length > 1 ? '1/10GBase-T (mixed-rate)' : rep.speed;
        // Uplink-port sizing (fs.uplinksPerLeaf) and the internal oversub check both key off
        // this numeric gbps — a mixed pool's real bandwidth demand is set by its FASTEST
        // contributor (10G traffic still needs 10G-worth of uplink budget even if a slower-
        // link-count 1G pool happened to win the `rep` tiebreak), never the smaller value.
        const mergedGbps = Math.max.apply(null, members.map(m => m.gbps));
        const merged = {
          target: mergedTarget, network: netLabel, role: 'converged', speed: mergedSpeed, media: rep.media,
          redundant: members.some(m => m.redundant), gbps: mergedGbps, workload: 'general',
          linksPerUnit: totalUnits ? +(totalLinks / totalUnits).toFixed(2) : totalLinks,
          unitsN: totalUnits, links: totalLinks, isPrimary: members.some(m => m.isPrimary),
          nicOverride: members.some(m => m.nicOverride),
          converged: true, convergedPlatforms: platforms, convergedNetworks: networks,
          _convergedFrom: members, _mergeKey: key
        };
        members.forEach(m => { const i = specs.indexOf(m); if (i >= 0) specs.splice(i, 1); });
        specs.push(merged);
        warnings.push({ severity: 'info',
          message: `Converged fabric: ${platforms.join(' + ')} — ${networks.join(' + ')} traffic (${totalLinks} link(s) total) shares ONE leaf switch tier at ${mergedSpeed} (VLAN-segmented, not physically separated). Confirm this matches intent — some environments still want physical separation for isolation or QoS predictability even where it's not a hard technical requirement.`,
          source: 'Customer-stated network architecture: converged' });
      });
    }

    /* 2. size leaves per fabric (stack-aware) */
    specs.forEach(fs => {
      // FULL-NVIDIA: picking the NVIDIA stack makes EVERY fabric of an AI target NVIDIA
      // (switches + optics), not just the compute rails. Non-AI targets stay Dell (separate pod).
      fs.stack = (fs.target.platform.workload === 'ai') ? (aiStack || 'dell') : (fs.workload === 'ai' ? aiStack : 'dell');
      // oversubscription target: AI is non-blocking; storage/back-end capped at 2:1 (1:1 for NVMe-RoCE); rest = traffic-driven
      const storageCap = (spDef && (fs.network === 'storage' || fs.network === 'backend')) ? spDef.oversubMax : R.oversubscription.storageTargetMax;
      fs.oversubTarget = fs.workload === 'ai' ? R.oversubscription.aiTarget
        : (fs.network === 'storage' || fs.network === 'backend') ? Math.min(genOversub, storageCap)
        : genOversub;
      fs.nonBlockingReq = fs.oversubTarget <= 1.0;   // AI + heavy east-west require 1:1
      fs.fabricsN = (fs.redundant && wantDual) ? R.redundancy.defaultFabrics : 1;
      fs.perFabricLinks = Math.ceil(fs.links / fs.fabricsN);
      fs.leaf = pickLeaf(fs.gbps, fs.workload, fs.stack, isBaseT(fs.speed));
      if (!fs.leaf) throw new Error(`No leaf switch for ${fs.speed} (${fs.network})`);
      // PowerScale back-end ladder (OneFS Table 33): stay FLAT as long as possible — S5232
      // (32×100G) up to 32 links/fabric, then Z9664 FLAT ("100/200GbE flat topology only" per
      // its back-end SKU 210-BCJH) up to 64 — only beyond that go leaf-spine.
      if (fs.network === 'backend' && fs.target.platform.backendIndependent && fs.gbps >= 100 && fs.stack !== 'nvidia') {
        const beAdj = fs.perFabricLinks * (1 + headroom);
        if (beAdj > 32 && beAdj <= 64) fs.leaf = C.switches.find(x => x.id === 'z9664f-on');
      }
      // FDC-VALIDATED (converged export): dense 100G host fabrics that outgrow one S5232F use
      // the S5448F (48×100G SFP56-DD + 8×400G uplinks) as leaf — its 400G uplinks pull in a
      // Z-series spine, matching FDC's converged design (8× S5448F + 2× Z9664F).
      if (fs.stack !== 'nvidia' && fs.workload !== 'ai' && fs.gbps >= 100 && fs.gbps < 200
          && !(fs.network === 'backend' && fs.target.platform.backendIndependent)) {
        const adj100 = fs.perFabricLinks * (1 + headroom);
        const byId = id => C.switches.find(x => x.id === id);
        // Explicit 100G-leaf preference wins; 'auto' = right-size ladder: S5448F when the
        // S5232F can't fit the demand — OR when the fabric REQUIRES non-blocking (RoCE /
        // 1:1) and more than ~4 hosts/leaf would outrun the S5232F's 4 spine-facing ports.
        if (leaf100 === 's5448f') fs.leaf = byId('s5448f-on');
        else if (leaf100 === 's5232f') fs.leaf = byId('s5232f-on');
        else if (leaf100 === 'z9264f') fs.leaf = byId('z9264f-on');
        else if (adj100 > 32 || (fs.nonBlockingReq && adj100 > 4)) fs.leaf = byId('s5448f-on');
        if (leaf100 !== 'auto') fs.leafOverride = leaf100;
      }
      // FDC-VALIDATED right-sizing (Dell 25G, non-AI): Dell's Fabric Design Center picks the
      // smallest S52xx that fits the rack demand (S5212F for a 4-server rack; S5296F at 64/leaf).
      // Storage/back-end stay on S5248F per the published PowerFlex/PowerStore designs.
      // Explicit leaf25 preference wins (mirrors leaf100); 'auto' runs the ladder below.
      if (fs.stack !== 'nvidia' && fs.workload !== 'ai' && fs.gbps >= 25 && fs.gbps < 40) {   // 40G+ is QSFP-class — stays on S5232F
        const adj = fs.perFabricLinks * (1 + headroom);
        const byId = id => C.switches.find(x => x.id === id);
        if (leaf25 === 's5212f') fs.leaf = byId('s5212f-on');
        else if (leaf25 === 's5224f') fs.leaf = byId('s5224f-on');
        else if (leaf25 === 's5248f') fs.leaf = byId('s5248f-on');
        else if (leaf25 === 's5296f') fs.leaf = byId('s5296f-on');
        else if (adj <= 12) fs.leaf = byId('s5212f-on');
        else if (adj <= 24) fs.leaf = byId('s5224f-on');
        else if (fs.network === 'frontend' && Math.ceil(adj / 48) > Math.ceil(adj / 96)) fs.leaf = byId('s5296f-on');  // dense server racks (FDC mid-size: 8× S5296F)
        else fs.leaf = byId('s5248f-on');
        if (leaf25 !== 'auto') fs.leafOverride = leaf25;
        fs.leaf25Auto = leaf25 === 'auto';   // Ruling 1 leaf step-up (post-harmonize) may revisit this pick
      }
      let radix = (fs.leaf.access && fs.leaf.access.count) || 48;
      // AI: the leaf presents access ports AT THE RAIL SPEED via breakout (Z9864F 64×800G = 128×400G)
      if (fs.workload === 'ai') { const accG = speedToGbps(fs.leaf.access.speed) || fs.gbps; if (accG > fs.gbps && fs.gbps > 0) radix = radix * Math.floor(accG / fs.gbps); }
      // AI = same-speed folded Clos: a leaf that needs a spine splits its radix HALF down
      // (GPU rails) / HALF up (spine) to stay non-blocking. Single-switch AI uses the full radix.
      fs.aiFolded = fs.workload === 'ai' && (fs.perFabricLinks * (1 + headroom)) > radix;
      // Leaves WITHOUT dedicated uplink ports (S5232F / Z9264F / Z-series as leaf) spend
      // ACCESS ports on uplinks once a spine is inevitable — reserve them so hosts aren't
      // overbooked (4 = the h04504 uplink assumption used for these switches). The SAME pool
      // also carries the MC-LAG/VLT peer-link (ICL) for a redundant (fabricsN=2) ToR pair on
      // these leaves — their `interconnectSpeed` always resolves to `leaf.access.speed` (no
      // dedicated uplink field to fall back on), so a pair whose raw host links alone already
      // fill the radix leaves zero room for the ICL. Reserve whenever EITHER condition could
      // apply; a later pass (step 3) grows leaves further if a shared spine group ends up
      // needing more uplinks than this reserved. EXCEPT PowerScale-style back-ends (int-a/int-b):
      // those are ALWAYS independent A/B fabrics — no ICL, ever — so no reservation is needed
      // (reserving anyway would push their "stay flat" leaf count into an unwanted spine tier).
      const noDedicatedUp = !hasFabricUplink(fs.leaf);
      const beIndependent = fs.network === 'backend' && fs.target.platform.backendIndependent;
      const upReserve = (fs.workload !== 'ai' && noDedicatedUp && (fs.perFabricLinks * (1 + headroom) > radix || (fs.fabricsN === 2 && !beIndependent))) ? 4 : 0;
      const cap = fs.aiFolded ? Math.max(1, Math.floor(radix / 2)) : Math.max(1, radix - upReserve);
      fs.leavesPerFabric = Math.max(1, Math.ceil(fs.perFabricLinks * (1 + headroom) / cap));
      // MULTI-RACK (FDC): EVERY data fabric of a rack-spanning target = a ToR pair in EVERY rack the
      // target occupies (a 1-rack target keeps its single pair). Backtest 2026-07-16 R2: this used to
      // gate on `fs.isPrimary`, so a SECONDARY NIC's fabric on the same multi-rack servers stayed
      // centralized → fell to the EVPN-MH POLICY branch while the primary was MC-LAG. That silent
      // per-fabric mechanism split is the bug: on the same servers the fabrics must be consistent
      // (all per-rack MC-LAG pairs). EVPN-MH is now reachable only as the port-infeasibility FALLBACK
      // (fs.iclFits === false + warn), never a silent policy substitution. Back-end (independent A/B)
      // is excluded — it's air-gapped, not an MC-LAG pair.
      if (racks > 1 && placement === 'in-rack' && fs.workload !== 'ai' && fs.network !== 'backend' && fs.target.racksSpanned > 1) {
        fs.leavesPerFabric = Math.max(fs.leavesPerFabric, fs.target.racksSpanned);
        fs.perRack = true;
      }
      // AI compute fabric MINIMUM = a 2-switch pair (rails striped across both) on a redundant
      // design — every validated ERA uses ≥2 (2× SN5610); a lone switch is a cluster-wide SPOF.
      // Dell's "single switch AI GPU fabric" (h04600) remains available via redundancy: single.
      if (fs.workload === 'ai' && wantDual && fs.leavesPerFabric < 2) fs.leavesPerFabric = 2;
      fs.totalLeaves = fs.leavesPerFabric * fs.fabricsN;
      // Uplinks-per-leaf from the oversubscription target — H18364.2 p.10:
      // uplinks = ceil(accessBW / (uplinkSpeed × target)). Drives spine COUNT + cabling.
      // R12 ruling 2026-07-16d — 400G is the HOST/RAIL speed, not the inter-switch speed. An
      // inter-switch hop between SAME-CAGE switches runs at the leaf's NATIVE port speed: a
      // Z9864F-ON pair links OSFP112↔OSFP112 at 800G. The old `fs.speed` (rail speed) quoted 400G
      // leaf↔spine on an 800G OSFP pair, for which NO cataloged part exists — the only Dell
      // 800G→2×400G breakout fans out to QSFP56-DD HOST ends, not to another OSFP switch port. That
      // was phantom radix credit in the sizing (same class as the G-007 fuzz fix, resurfaced here):
      // uplink capacity was being credited to a link that couldn't be built. Native speed is both
      // buildable (dac-800g-osfp / nv-sr8-800g-osfp seat in OSFP) and the same bandwidth.
      // Note this is a no-op where native ALREADY equals rail speed (SN5600: 400GbE twin-port).
      fs.uplinkSpeed = fs.workload === 'ai' ? ((fs.leaf.access && fs.leaf.access.speed) || fs.speed)
        : (hasFabricUplink(fs.leaf) ? fs.leaf.uplink.speed : '100GbE');
      const upG = speedToGbps(fs.uplinkSpeed) || 100;
      // AI (high-radix) can dedicate up to half its ports to uplinks; Dell/general leaves use the uplink ports.
      // A per-rack MC-LAG/VLT PAIR carries its peer-link (ICL) on those SAME dedicated uplink ports
      // (interconnectSpeed resolves to leaf.uplink.speed) — reserve 2 for it so a dense fabric can't
      // over-commit the port (5 uplinks + 2 ICL > 6). Only perRack dual pairs build this ICL (see the
      // redundancyMethod decision below); leaves without dedicated uplink ports reserve via upReserve.
      const iclUplinkReserve = (fs.perRack && fs.fabricsN === 2 && fs.workload !== 'ai' && hasFabricUplink(fs.leaf)) ? 2 : 0;
      // AI uplinks are NATIVE-speed links, so they consume PHYSICAL ports — not the breakout-adjusted
      // logical rail ports `radix` counts. Half the physical bank goes up (folded Clos). On a Z9864F-ON
      // that's 32× 800G up + 32 physical down (= 64 rails at 400G via the 2× breakout): identical
      // bandwidth to the old "64× 400G up", but in ports that actually exist and parts that exist.
      // Using floor(radix/2) here would have claimed 64 uplink ports on a 64-port switch.
      const aiPhysPorts = (fs.leaf.access && fs.leaf.access.count) || radix;
      const availUp = fs.workload === 'ai' ? Math.max(2, Math.floor(aiPhysPorts / 2)) : (hasFabricUplink(fs.leaf) ? Math.max(2, fs.leaf.uplink.count - iclUplinkReserve) : 4);
      const linksPerLeaf = Math.max(1, Math.ceil(fs.perFabricLinks / fs.leavesPerFabric));
      fs.uplinksPerLeaf = Math.max(2, Math.min(availUp, Math.ceil((linksPerLeaf * fs.gbps) / (upG * fs.oversubTarget))));
      // Can a per-rack MC-LAG/VLT PAIR physically fit its peer-link (ICL) on this leaf? The ICL
      // rides the dedicated uplink ports (2 for ≥100G) or, on a leaf without them, the access ports
      // alongside host links + uplinks. If it CAN'T fit, the pair falls back to pure EVPN-Multihoming
      // (ESI — no peer-link) rather than over-committing the leaf. MC-LAG+ICL is for designs with
      // room (e.g. the copper ToR backtest); dense high-speed fabrics use EVPN-MH, the modern default.
      const iclPorts = (speedToGbps(hasFabricUplink(fs.leaf) ? fs.leaf.uplink.speed : fs.leaf.access.speed) >= 100) ? 2 : 4;
      fs.iclFits = hasFabricUplink(fs.leaf)
        ? (fs.uplinksPerLeaf + iclPorts) <= fs.leaf.uplink.count
        : (linksPerLeaf + fs.uplinksPerLeaf + iclPorts) <= radix;
      fs.availUp = availUp;
      fs.uplinkPortLimited = ((linksPerLeaf * fs.gbps) / (upG * fs.oversubTarget)) > availUp + 0.001;  // couldn't reach target ratio
    });

    /* 3. spine GROUPS (design-wide leaf-spine decision) --------------------
     *   - back-end (e.g. PowerScale) is ALWAYS its own dedicated group
     *   - each AI fabric is its own group (single stack)
     *   - the rest: one shared spine, OR one spine per network type if 'separate'
     *   A group gets a spine only when it has MORE THAN 2 leaves (else single
     *   switch / ToR pair — incl. small AI clusters). */
    const spineThreshold = R.leafSpine.addSpineWhenLeafPairsExceed * 2; // > 2 leaves => spine
    // FUZZ-FOUND (2026-07-15): keyed on fs.target.id (the PLATFORM id, e.g. 'poweredge-ai') —
    // NOT unique per target INSTANCE (fs.target.uid is: `${index}:${platformId}`, see target
    // normalization). Two different poweredge-ai targets (e.g. different GPU models/rail speeds)
    // silently shared ONE spine group, sized/spined off whichever happened to be `grp.fabrics[0]`
    // — the other target's leaves could exceed what that group's spine/pod math actually
    // accounts for. Same latent risk for multiple 'backend' (PowerScale) targets. Use uid.
    const gkey = fs => fs.workload === 'ai' ? ('ai|' + fs.target.uid + '|' + fs.network)
      : fs.network === 'backend' ? ('backend|' + fs.target.uid)
      : (separate ? ('net|' + fs.network + '|' + fs.stack) : 'shared|' + fs.stack);   // never mix stacks on one spine
    const groups = {};
    specs.forEach(fs => { const k = gkey(fs); (groups[k] = groups[k] || { key: k, ai: fs.workload === 'ai', dedicated: fs.network === 'backend', fabrics: [] }).fabrics.push(fs); });
    Object.keys(groups).forEach(k => {
      const grp = groups[k];
      const leaves = grp.fabrics.reduce((s, f) => s + f.totalLeaves, 0);
      // J2 uplinkTarget OVERRIDES the auto >2-leaf spine trigger for general/storage groups:
      // 'new-spine' forces a spine (even ≤2 leaves), 'existing-core' forces spine-less (leaves are
      // the border to the customer's core). AI groups keep their own rail-optimized spine logic
      // (a GPU pod needs its spine regardless). Absent → the auto threshold, unchanged.
      const buildSpine = grp.ai ? (leaves > spineThreshold)
        : uplinkTarget === 'existing-core' ? false
        : uplinkTarget === 'new-spine' ? true
        : (leaves > spineThreshold);
      if (buildSpine) {
        const f0 = grp.fabrics[0];
        const gstack = grp.fabrics.every(f => f.stack === 'nvidia') ? 'nvidia' : 'dell';
        const maxUpG = Math.max.apply(null, grp.fabrics.map(f => speedToGbps((f.leaf.uplink && f.leaf.uplink.speed) || '100GbE') || 100));
        // PUBLISHED design point (h04504 PowerStore SFM DG): small storage/general fabrics with
        // 100G uplinks use S5232F-ON spines ("100 GbE leaf or spine"); larger fabrics → Z-series.
        // NVIDIA AI spines come straight from pickSpine (SN5600 per the GB200 RA — "two SN5600
        // switches as the aggregation layer or spine layer"; SN5610 at 800G). The old SN5400
        // step-up rung existed only because the AI spine used to be the 32-port SN4700.
        grp.spine = grp.ai
          ? pickSpine(f0.gbps >= 100 ? f0.gbps : 400, 'ai', f0.stack)
          : (gstack === 'dell' && maxUpG <= 100 && leaves <= 8) ? C.switches.find(x => x.id === 's5232f-on')
          // MISSING RUNG (fixed): pickSpine()'s 'general' branch only ever returns Z9432F-ON
          // (400G-native, needs breakout for 100G) or Z9664F-ON — without this step, growing
          // past 8 100G-class leaves jumped straight from a 32-port S5232F-ON to a much larger
          // 400G-breakout switch. Z9264F-ON (64×100G native, already cataloged with 'spine' in
          // its roles) is the natural next rung — same mirrors the leaf right-sizing ladder in
          // docs/SPEC.md §"100G leaf selection".
          : (gstack === 'dell' && maxUpG <= 100 && leaves <= 64 && breakout !== 'on') ? C.switches.find(x => x.id === 'z9264f-on')
          : pickSpine(maxUpG, 'general', gstack);
        // Spine COUNT comes from the oversubscription math (Clos: ~1 uplink per spine),
        // not a fixed pair. H18364.2 p.10: 2–8 spines depending on the target ratio.
        // AI: the non-blocking bandwidth is fixed by uplinksPerLeaf (already 1:1); the spine
        // COUNT is the PORT math — enough spines to terminate every uplink, never more:
        //   ceil(total uplinks / spine radix), clamped to [2, uplinksPerLeaf].
        // (upper clamp: every leaf must still reach every spine with ≥1 link.) The old
        // formula set spineCount = uplinksPerLeaf outright — one spine per uplink — which
        // ballooned as spine radix grew: 16× Z9864F leaves at 1024 rails priced 64 spines
        // where the FDC AI export builds the same leaves with 2 (its minimal wiring) and the
        // port math says 8. Parallel leaf→spine links are normal Clos, not a defect.
        const spineRadix = (grp.spine.access && grp.spine.access.count) || 64;
        const wantSpines = Math.max.apply(null, grp.fabrics.map(f => f.uplinksPerLeaf || 2));
        const totalGroupUplinks = grp.fabrics.reduce((s, f) => s + f.totalLeaves * (f.uplinksPerLeaf || 2), 0);
        // breakout-adjust the spine's port budget the same way leaf radix already is (line
        // ~432): a 64×800G Z9864F terminates 128×400G uplinks via 2×400G breakout — counting
        // native cages would double the spine count for no bandwidth gain.
        // GENERAL/STORAGE + AI, via the SHARED resolveUplinkBreakout() helper (also used for the
        // real uplink cabling in step 4) — the single source of truth for whether a ratio is
        // catalog-real, never a naive speed-ratio guess. History here: an earlier draft (external
        // review, GAPS.md) proposed crediting this from the fabric's HOST NIC speed vs the
        // spine's native speed — works for AI (folded-Clos rails: host speed IS the uplink
        // speed) but silently over-credited general/storage groups (25G host vs 100G uplink are
        // DIFFERENT hops) with no matching cataloged breakout SKU. Using each fabric's actual
        // `uplinkSpeed` (set in step 2, before this runs) through the same resolver step 4 uses
        // for real cabling fixes that for both cases with one code path, and also respects the
        // `breakout:'none'` user toggle (crediting capacity the user opted out of is the same
        // class of phantom-credit bug).
        // A group can (under sharedSpine) combine MULTIPLE fabrics riding the same spine at
        // DIFFERENT uplink speeds — credit only the MINIMUM ratio any member achieves
        // (conservative: never credits more spine capacity than the least-privileged fabric in
        // the group can actually use).
        const groupBreakoutRatios = grp.fabrics.map(f => {
          const upSp = f.uplinkSpeed || (f.workload === 'ai' ? f.speed : '100GbE');
          const resolved = resolveUplinkBreakout(grp.spine, upSp, breakout, f.stack === 'nvidia',
            f.leaf ? (hasFabricUplink(f.leaf) ? f.leaf.uplink : f.leaf.access) : null);
          return resolved ? resolved.ratio : 1;
        });
        const spineEffRadix = spineRadix * Math.min.apply(null, groupBreakoutRatios);
        // B4: a NON-redundant (single) design accepts a NON-redundant spine — floor 1, grown only
        // if one spine's radix can't aggregate every leaf uplink (the leaf's uplinks-per-leaf stay
        // as sized; on a single spine they land there for bandwidth, decoupled from spine COUNT).
        // Redundant designs are UNCHANGED (floor 2, Clos fan-out = uplinks-per-leaf).
        grp.spineCount = (!wantDual && !grp.ai)
          ? Math.max(1, Math.ceil(totalGroupUplinks / spineEffRadix))
          : grp.ai
            ? Math.max(R.leafSpine.spineCountForRedundancy, Math.min(wantSpines, Math.ceil(totalGroupUplinks / spineEffRadix)))
            : Math.max(R.leafSpine.spineCountForRedundancy, Math.min(R.leafSpine.maxSpines || 8, wantSpines));
        // HARMONIZE combined designs: in a Clos, EVERY leaf connects to EVERY spine.
        // When fabrics with different uplink needs share this spine group, raise the
        // lighter fabrics' uplinks-per-leaf to the group's spine count (more uplink
        // cables in the BOM, better ratio) — or warn when the leaf physically can't.
        grp.fabrics.forEach(f => {
          if ((f.uplinksPerLeaf || 0) >= grp.spineCount) return;
          const can = Math.min(f.availUp || grp.spineCount, grp.spineCount);
          if (can > (f.uplinksPerLeaf || 0)) f.uplinksPerLeaf = can;
          if (f.uplinksPerLeaf < grp.spineCount) warnings.push({ severity: 'warn',
            message: `${f.target.platform.family} ${f.network}: the ${f.leaf.model} leaf has only ${f.availUp} uplink ports but this shared spine group is sized at ${grp.spineCount} spines — every leaf must reach every spine. Use "separate fabrics" for this target, or a leaf with more uplink ports.`,
            source: R.leafSpine.source });
        });
        // PHYSICAL FIT: uplinksPerLeaf may have just GROWN (folded-Clos sizing, or the
        // harmonize step above) — leaves with NO genuine dedicated uplink port class present
        // uplinks on the SAME (breakout-adjusted) pool as hosts/rails: leaves.uplink:{count:0}
        // (S5232F/Z9264F/Z9432F/Z9664F/Z9864F), or an AI leaf whose catalog "uplink" field is a
        // small mgmt/breakout-assist port (e.g. SN5610's 2×25GbE — never a real fabric-uplink
        // pool for an 800G leaf). A fabric that fits standalone can still be pulled into a
        // SHARED spine group needing more uplinks than it originally reserved room for — this
        // must run AFTER spine sizing/harmonization, when uplinksPerLeaf is truly final.
        grp.fabrics.forEach(f => {
          const leaf = f.leaf;
          if (hasFabricUplink(leaf) || !leaf.access) return;
          // breakout-adjust the radix whenever the leaf's native access speed exceeds this
          // fabric's actual speed (breakout is physically happening regardless of the fabric's
          // workload label — a general/storage NIC group riding an AI-class leaf breaks out too).
          let radixAdj = leaf.access.count;
          { const accG = speedToGbps(leaf.access.speed), railG = f.gbps; if (accG > railG && railG > 0) radixAdj = radixAdj * Math.floor(accG / railG); }
          // NOTE: no ICL/peer-link reservation needed here — every fabric reaching this pass
          // already has a spine (we're inside the `leaves > spineThreshold` branch), and a
          // spine-connected fabric always uses EVPN Multihoming, which has NO peer-link at all
          // (see R.redundancy.methods['evpn-mh'].peerLink === false) — the ICL only exists for
          // a plain ToR pair (no spine), which step 2's upReserve already covers.
          const perLeafCap = Math.max(1, radixAdj - (f.uplinksPerLeaf || 0));
          const neededLeaves = Math.max(f.leavesPerFabric, Math.ceil(f.perFabricLinks / perLeafCap));
          if (neededLeaves > f.leavesPerFabric) { f.leavesPerFabric = neededLeaves; f.totalLeaves = f.leavesPerFabric * f.fabricsN; }
        });
        // 3-TIER CLOS (super-spine) — a single spine tier's radix must fit EVERY leaf (every
        // leaf connects to every spine). Recompute the leaf total now, AFTER the physical-fit
        // pass above may have grown individual fabrics' leaf counts, and go 3-tier if a flat
        // 2-tier still can't reach them all.
        const groupLeavesFinal = grp.fabrics.reduce((s, f) => s + f.totalLeaves, 0);
        // BREAKOUT-ADJUSTED trigger (fixed): this used to compare against the RAW native
        // spineRadix even though spineEffRadix (the breakout-credited figure, computed above)
        // is the actual port budget a spine tier can serve — e.g. a 64-port-native spine
        // breaking out to 128 effective ports could see 65-128 leaves and still spuriously
        // build a whole unneeded pod-spine + super-spine tier of real hardware. Confirmed live:
        // 520× poweredge-ai (65 AI leaves) built a 3-tier Clos AND a false hard "OVER-COMMITTED"
        // error, though the design fits flat on the breakout-adjusted 128-port radix.
        if (groupLeavesFinal > spineEffRadix) {
          // Fold the pod-spine exactly like AI's folded-Clos, one tier up: HALF its ports serve
          // leaves within a pod, HALF uplink to the super-spine tier — non-blocking by
          // construction (equal capacity both directions, matching the leaf-side folding this
          // tool already uses for AI compute fabrics).
          const podLeafCap = Math.max(1, Math.floor(spineEffRadix / 2));
          grp.numPods = Math.max(1, Math.ceil(groupLeavesFinal / podLeafCap));
          grp.totalPodSpines = grp.numPods * grp.spineCount;
          grp.superSpine = pickSuperSpine(grp.spine, grp.totalPodSpines, grp.ai ? f0.stack : gstack, breakout);
          const superSpineRadix = (grp.superSpine.access && grp.superSpine.access.count) || 64;
          // super-spine uplinks/pod-spine: mirror the pod-spine count used at the leaf hop (same
          // fan-out at both tiers — simple, symmetric, and bounded by the folded "up" half).
          const wantSuperSpines = Math.min(podLeafCap, grp.spineCount);
          // FAN-OUT per pod-spine (how many links each pod-spine sends up). Decoupled from the
          // super-spine COUNT below: they're equal only while the tier is narrow enough for every
          // pod-spine to reach every super-spine with one link each.
          grp.podUplinksToSuper = grp.ai ? Math.max(R.leafSpine.spineCountForRedundancy, wantSuperSpines)
            : Math.max(R.leafSpine.spineCountForRedundancy, Math.min(R.leafSpine.maxSpines || 8, wantSuperSpines));
          // COUNT is PORT MATH (R12 ruling 2026-07-16d): the tier must physically terminate every
          // pod-spine uplink — totalPodSpines × podUplinksToSuper links ÷ ports per super-spine.
          // Previously the count just mirrored the fan-out, which silently under-built the tier and
          // then tripped validate's own "super-spine OVER-COMMITTED" hard error on a design the
          // engine itself had sized (520-server case: 3072 links vs 2048 ports). Sizing to the link
          // count makes every link real; the tier gets WIDER, never phantom-credited.
          const superLinks = grp.totalPodSpines * grp.podUplinksToSuper;
          grp.superSpineCount = Math.max(grp.podUplinksToSuper, Math.ceil(superLinks / Math.max(1, superSpineRadix)));
          // (b) Explain a WIDE super-spine tier as a PARTS decision, not a failure — the flagship had
          // the radix but no cataloged way to terminate these links.
          const gated = superSpineGatedFlagship(grp.spine, grp.totalPodSpines, grp.ai ? f0.stack : gstack, breakout);
          if (gated) warnings.push({ severity: 'info', message: `${grp.key}: super-spine tier is ${grp.superSpineCount}× ${grp.superSpine.model} (same speed as the pod-spine) rather than the higher-radix ${gated.model} — no cataloged ${grp.spine.access.speed}-capable connection exists between them (the ${gated.model} reaches ${grp.spine.access.speed} only via a breakout that is not in the catalog with matching far-end connectors). This is a PARTS decision, not a shortfall: every link in this tier is a cataloged, buildable ${grp.spine.access.speed} link. If a qualifying ${gated.access.speed}→${grp.spine.access.speed} breakout is confirmed, the ${gated.model} re-enters the ladder and this tier gets narrower.`, source: 'Catalog part evidence · R12 ruling 2026-07-16d (super-spine termination)' });
          if (grp.totalPodSpines > superSpineRadix) {
            grp.needsFourthTier = true;
            warnings.push({ severity: 'warn', message: `${grp.key}: ${grp.totalPodSpines} pod-spines (across ${grp.numPods} pods) exceed even the ${grp.superSpine.model} super-spine radix (${superSpineRadix}) — this needs a 4th tier or must be partitioned into separate fabrics/sites. Beyond this tool's automatic sizing at this scale — engage Dell Advanced Engineering / Services.`, source: R.leafSpine.source });
          }
          warnings.push({ severity: 'info', message: `${grp.key}: ${groupLeavesFinal} leaves exceed a single ${grp.spine.model} spine tier's breakout-adjusted radix (${spineEffRadix}${spineEffRadix !== spineRadix ? `, ${spineRadix} native × breakout` : ''}) — built as a 3-TIER CLOS: ${grp.numPods} pod(s) × ${grp.spineCount} pod-spine(s) (${grp.totalPodSpines}× ${grp.spine.model} total) + ${grp.superSpineCount}× ${grp.superSpine.model} super-spine, ${grp.podUplinksToSuper} uplink(s)/pod-spine to the super-spine tier.`, source: R.leafSpine.source });
        } else {
          grp.numPods = 1;
          grp.totalPodSpines = grp.spineCount;
        }
      }
      grp.fabrics.forEach(f => { f.spine = grp.spine || null; f.spineCount = grp.spineCount || 0; f.spineGroupKey = k; f.dedicated = grp.dedicated;
        f.numPods = grp.numPods || 1; f.totalPodSpines = grp.totalPodSpines || grp.spineCount || 0;
        f.superSpine = grp.superSpine || null; f.superSpineCount = grp.superSpineCount || 0; f.podUplinksToSuper = grp.podUplinksToSuper || 0; });
    });

    /* 3b. REDUNDANCY IS AN INPUT TO LEAF SELECTION (ruling 2026-07-16c, Ruling 1) --------------
     * A redundant, MC-LAG-eligible 25G fabric needs a leaf that affords BOTH its spine uplinks AND
     * the 2-port MC-LAG/VLT peer-link (ICL). The density-only ladder (step 2) can under-pick an
     * economy leaf (S5212F/S5224F) whose few uplink ports fit the uplinks but not uplinks+ICL — the
     * fabric then loses its peer-link (auto-drops to EVPN-MH). Per the spare-port ruling we STEP UP
     * the leaf model to afford the ICL rather than shrink uplinks (the rejected fabric-degrading
     * trade). This runs HERE, after the shared-spine HARMONIZE step has finalized uplinksPerLeaf
     * (which the selection-time estimate couldn't see) and BEFORE any BOM line is emitted. Only the
     * leaf MODEL changes (a bigger 25G leaf has ≥ radix, so the existing leaf COUNT still fits — no
     * resize cascade). Auto-mode only (explicit leaf25 override untouched); PowerScale-style
     * independent back-ends are excluded (never an ICL); S5224F stays for non-redundant/economy. */
    specs.forEach(fs => {
      if (!fs.leaf25Auto || fs.fabricsN !== 2 || fs.workload === 'ai') return;
      // SPINED fabrics only. A no-spine ToR PAIR has no spine to uplink to — its `uplinksPerLeaf` is
      // just the `max(2,…)` floor, not real port pressure, and the FDC exports pin those small pairs
      // to their economy leaf (S5212F/S5224F VLT pairs — FDC-F1/F12 ground truth). The uplinks-vs-ICL
      // contention that this step-up exists to resolve arises ONLY when a spine forces uplinks onto
      // the same ports the ICL needs (e.g. the harmonize step grew them to reach a shared spine group).
      if (!fs.spine) return;
      if (fs.network === 'backend' && fs.target.platform.backendIndependent) return;
      if (!hasFabricUplink(fs.leaf) || !fs.leaf.uplink || !fs.leaf.uplink.count) return;   // no dedicated uplink class → ICL rides access, budgeted elsewhere
      const iclPorts = (speedToGbps(fs.leaf.uplink.speed) >= 100) ? 2 : 4;
      if ((fs.uplinksPerLeaf + iclPorts) <= fs.leaf.uplink.count) return;   // current leaf already affords uplinks + ICL
      const linksPerLeafNow = Math.max(1, Math.ceil(fs.perFabricLinks / Math.max(1, fs.leavesPerFabric)));
      // Step economy leaves UP to the STANDARD ToR (S5248F-ON) only — the ruling is "S5224F → S5248F-ON",
      // not "keep climbing". If even S5248F-ON can't seat uplinks+ICL, the fabric is genuinely dense →
      // the spare-port scope (b) correctly auto-selects EVPN-MH downstream (never a bump to S5296F-ON,
      // which would contradict the published PowerStore leaf ground truth, GT8a/h04504).
      const ladder = ['s5212f-on', 's5224f-on', 's5248f-on'];
      let li = ladder.indexOf(fs.leaf.id);
      if (li < 0) return;   // already S5248F-ON+ / off-ladder — don't climb further
      while (li < ladder.length - 1) {
        li++;
        const cand = C.switches.find(x => x.id === ladder[li]);
        if (!cand || !cand.uplink) continue;
        const candIclPorts = (speedToGbps(cand.uplink.speed) >= 100) ? 2 : 4;
        // the stepped-up leaf must afford the FINAL uplinks + ICL AND still hold this fabric's links
        if ((fs.uplinksPerLeaf + candIclPorts) <= cand.uplink.count && linksPerLeafNow <= ((cand.access && cand.access.count) || 48)) {
          fs.leaf = cand; fs.leafSteppedUpForIcl = true; break;
        }
      }
    });

    /* 4. per-fabric BOM (leaves, host cables, uplinks, peer-links) */
    specs.forEach(fs => {
      const leaf = fs.leaf, spine = fs.spine;
      // A converged fs represents several platforms sharing one leaf tier — every note below
      // that would otherwise say "for {one platform}" instead names all of them, and the unit
      // count reflects the combined total, not just one contributor's.
      const fam = fs.converged ? `${fs.convergedPlatforms.join(' + ')} (CONVERGED: ${fs.convergedNetworks.join('+')})` : fs.target.platform.family;
      // Same dedupe-by-distinct-target as the merge step above (a target's primary + nic2
      // members are the SAME physical units, not two populations) — keeps "×N" BOM/note text
      // matching the real server count instead of double-counting same-target multi-NIC merges.
      const unitsTot = fs.converged ? [...new Set(fs._convergedFrom.map(m => m.target))].reduce((s, t) => s + t.units, 0) : fs.target.units;
      addLine(bom, { category: 'Switch', vendor: leaf.vendor, item: leaf.model, model: leaf.model, qty: fs.totalLeaves,
        // network + dedicated: opt this line into R11's per-network breakdown (see addLine) — a
        // same-model leaf shared by (say) PowerScale frontend AND backend must never read as one
        // undifferentiated pool once merged; `dedicated` marks the h16346-mandated isolated network.
        network: fs.network, dedicated: fs.network === 'backend' && fs.target.platform.backendIndependent,
        dellPN: leaf.dellPN, verify: leaf.verify, specConfirmed: leaf.specConfirmed, source: leaf.source,
        nos: switchNosNote(leaf),
        note: `Leaf/ToR — ${fam} ${fs.network} (${fs.speed}); ${fs.leavesPerFabric}/fabric × ${fs.fabricsN}` + (leaf.switchingCapacity ? ` · ${leaf.switchingCapacity}` : '') });
      // R9 (backtest 2026-07-16b): LOW-UTILIZATION note — when RACK count (not port demand) drove the
      // switch count (perRack), a leaf can run far below its port capacity. Surface it so the rep can
      // see the switch is rack-sized, and whether a smaller leaf or fewer racks would raise utilization.
      const leafCap = (leaf.access && leaf.access.count) || 48;
      const portsPerLeaf = Math.ceil((fs.links || 0) / Math.max(1, fs.totalLeaves));
      if (fs.perRack && leafCap > 0 && portsPerLeaf / leafCap < 0.35 && portsPerLeaf > 0) {
        warnings.push({ severity: 'info',
          message: `${fam} ${fs.network}: each ${leaf.model} runs ~${portsPerLeaf} of ${leafCap} ports (${Math.round(portsPerLeaf / leafCap * 100)}%) — the switch COUNT here is driven by rack count (a pair per rack), not port demand. That's the FDC per-rack pattern; if the racks consolidate, a smaller leaf (or fewer, denser racks) would raise utilization. Confirm the rack layout is real.`,
          source: 'Utilization check · rack-driven switch count (B6-adjacent)' });
      }

      const nv = fs.stack === 'nvidia';   // NVIDIA-stack fabric → NVIDIA LinkX cabling end-to-end
      const connector = (R.cabling.connectorsBySpeed && R.cabling.connectorsBySpeed[fs.speed]) || fs.media || '';
      fs.connector = connector;
      // Multi-rack: a CENTRALIZED fabric (not the per-rack primary) serving a target that
      // SPANS racks has cross-rack host runs — the cable class steps up from DAC to AOC.
      const fsPlacement = (racks > 1 && placement === 'in-rack' && !fs.perRack && fs.workload !== 'ai' && fs.target.racksSpanned > 1) ? 'adjacent' : placement;
      const fsPlaceDef = (R.cabling.placements && R.cabling.placements[fsPlacement]) || placeDef;
      // R12: the cable must seat in THIS leaf's access cage — pass the real port, and the rail
      // NIC's cage where the part branches on it (twin-port-OSFP 400G rails). `railNicCage` comes
      // from the design input, never a default (ruling 2026-07-16d(a)).
      const hostCable = pickHostCable(fs.gbps, fsPlacement, nv, isBaseT(fs.speed), leaf && leaf.access, railNicCage);
      // R12: record WHICH optic this fabric resolved, so validate.js can hard-check that it
      // physically seats in the leaf's access cage without re-deriving the pick. Same principle
      // as G-011/uplinkCableQty: consume the engine's resolved value, never recompute it.
      fs.hostCableId = hostCable ? hostCable.id : null;
      // "ToR pair per rack" is a REDUNDANCY construct — only a dual design has pairs. A single
      // (non-redundant) per-rack design is "one leaf per rack" (B4: no pair language on single).
      const placeLbl = (fsPlaceDef.cableClass || '') + (fsPlaceDef.reach ? ` · ${fsPlaceDef.reach}` : '') +
        (fsPlacement !== placement ? ' · CROSS-RACK (centralized switches, multi-rack hosts)' : (fs.perRack ? ` · ${wantDual ? 'ToR pair' : 'one leaf'} per rack × ${racks}` : ''));
      if (!hostCable) {
        warnings.push({ severity: 'warn', message: `${fam} ${fs.network}: no cataloged ${fsPlacement} optic for a ${fs.speed} host connection — this speed/placement combination is beyond current catalog coverage. Engage Dell Advanced Engineering / Services to confirm optics before quoting.`, source: R.leafSpine.source });
      } else {
        // QUANTITY SEMANTICS (R12 ruling 2026-07-16d(b)): a 1:2 splitter/breakout assembly carries
        // TWO links, so the ordered quantity is links ÷ railsPerAssembly — never one-per-link. The
        // note states the arithmetic so the printed line and the number can't drift apart.
        const hcLpa = hostCable.railsPerAssembly || 1;
        const hcQty = Math.ceil(fs.links / hcLpa);
        fs.hostCableQty = hcQty; fs.hostLinksPerAssembly = hcLpa;
        // 'unsure' cage (ruling 2026-07-16d(a)): the MCP7Y00/Y10 pick was NOT confirmed — quote the
        // OSFP variant but VERIFY-flag the line and say so, rather than block the BOM or pretend.
        // flag ONLY where two variants genuinely compete (see farCageVariant) — a part with a single
        // fixed far end (Dell's brk-800g-2x400) has nothing to be unsure about.
        const cageUnsure = railNicCage === 'unsure' && !!hostCable.farCageVariant;
        if (cageUnsure) warnings.push({ severity: 'verify', message: `${fam} ${fs.network}: the GPU rail NIC's connector was not confirmed, and the 1:2 rail splitter differs by it — MCP7Y00 (far end 2× OSFP) vs MCP7Y10 (far end 2× QSFP112). Quoted as ${hostCable.model} and flagged: CONFIRM the NIC connector before ordering. Not interchangeable, but a like-for-like swap (no design or quantity impact).`, source: 'NVIDIA LinkX 1:2 splitter selection (corpus NV-LINKX-400G-COMBO) · R12 ruling 2026-07-16d(a)' });
        addLine(bom, { category: 'Cable/Optic', vendor: hostCable.vendor || 'Dell', item: hostCable.desc, model: hostCable.desc, qty: hcQty,
          // links this line actually covers = qty × linksPerAssembly. Carried ON the line so the
          // BOM-integrity invariant (P13) reads the same number the note prints — a 1:2 assembly
          // must never be mistaken for a 1:1 cable by anything downstream.
          linksPerAssembly: hcLpa, coversLinks: fs.links,
          mergeKey: 'host|' + fs.target.id + '|' + fs.network + '|' + hostCable.id,
          dellPN: hostCable.dellPN, verify: cageUnsure ? true : hostCable.verify, specConfirmed: cageUnsure ? false : hostCable.specConfirmed, source: hostCable.source,
          note: `Host-to-leaf for ${fam} ${fs.network} — ${fs.links} link(s) (${fs.linksPerUnit || 0}/unit × ${unitsTot}${fs.singleHomed && fs.sparePorts > 0 ? `; ${fs.sparePorts} NIC port${fs.sparePorts > 1 ? 's' : ''} spare — non-redundant (single-homed) design` : ''}) · ${connector} · ${placeLbl}` +
            (hcLpa > 1 ? ` · ARITHMETIC: 1 assembly carries ${hcLpa} links → ${fs.links} ÷ ${hcLpa} = ${hcQty} assemblies` : '') +
            (cageUnsure ? ' · ⚠ NIC CONNECTOR NOT CONFIRMED: quoted as the 2× OSFP far-end variant. If the rail NICs are QSFP112 (BlueField-3, or a QSFP112 ConnectX-7/-8), the correct part is MCP7Y10. VERIFY before ordering.' : '') +
            (hostCable.lengths ? ` · lengths ${hostCable.lengths}` : '') +
            (fsPlacement === 'structured' ? ' · STRUCTURED: switch-side optic shown; host-side optic + fiber plant itemized below' + (structuredInPlace ? ' (patching in place — plant not re-quoted)' : '') : '') });
        // A structured run is a standalone-optic link: TWO transceivers per link, one each end.
        // The line above is the SWITCH side; this one is the HOST/NIC side (its note has always
        // promised this line — it was missing until the 2026-07-13 standalone-optics audit).
        // NOT for Base-T copper: the NIC end is a fixed RJ-45 jack (no module exists there) —
        // the electrical SFP module is switch-side only, and the run is Cat6A, not fiber.
        if (fsPlacement === 'structured' && hostCable.category === 'transceiver' && !isBaseT(fs.speed)) {
          addLine(bom, { category: 'Cable/Optic', vendor: hostCable.vendor || 'Dell', item: hostCable.desc + ' — host/NIC side', model: hostCable.desc + ' — host/NIC side', qty: fs.links,
            mergeKey: 'hostnic|' + fs.target.id + '|' + fs.network + '|' + hostCable.id,
            dellPN: hostCable.dellPN, verify: true, specConfirmed: hostCable.specConfirmed, source: hostCable.source,
            note: `Host/NIC-side transceiver for ${fam} ${fs.network} — ${fs.links} link(s), one per NIC port. CONFIRM NIC compatibility: NIC vendors commonly require their own branded/coded optics (NVIDIA ConnectX → LinkX; Broadcom/Intel per their compatibility list) — same PMD type as the switch side.` });
        }
      }

      // STRUCTURED-CABLING PASSIVE PLANT: when the run is optical over a structured plant
      // that must be INCLUDED, itemize the channel (transceiver → trunk → cassette → panel
      // → patch cord). Vendor-neutral estimate: 12-fiber cassette = 6 duplex links,
      // 2 cassettes + 2 patch cords per link-group (both ends), 4 cassettes per 1U panel.
      // Base-T copper runs get NO fiber plant — that's Cat6A structured cabling (by others).
      if (fsPlacement === 'structured' && !structuredInPlace && fs.links > 0 && !isBaseT(fs.speed)) {
        const L = fs.links;
        const cassettes = 2 * Math.ceil(L / 6);
        const panels = Math.ceil(cassettes / 4);
        const trunks = Math.ceil(L / 6);
        const patchCords = 2 * L;
        const byId = id => C.optics.find(x => x.id === id);
        const plant = [
          // cord type follows the OPTIC's connector: MPO jumper for parallel (SR4/SR8),
          // LC duplex for duplex optics — never LC on an MPO port
          { o: fiberCordFor(hostCable), qty: patchCords, extra: `${patchCords} = 2 per link × ${L} links` },
          { o: byId('struct-cassette'), qty: cassettes, extra: `${cassettes} (12-fiber cassette = 6 duplex links, both ends)` },
          { o: byId('struct-panel'), qty: panels, extra: `${panels} × 1U (≈4 cassettes each)` },
          { o: byId('struct-trunk-mpo'), qty: trunks, extra: `${trunks} trunk(s) (12-fiber = 6 duplex links)` }
        ];
        plant.forEach(p => { if (p.o) addLine(bom, { category: 'Cable/Optic', vendor: 'Structured', item: p.o.desc, model: p.o.desc, qty: p.qty,
          mergeKey: 'struct|' + fs.target.id + '|' + fs.network + '|' + p.o.id,
          dellPN: p.o.dellPN, verify: p.o.verify, specConfirmed: p.o.specConfirmed, source: p.o.source,
          note: `Structured plant for ${fam} ${fs.network} — ${p.extra}. Fiber: ${fs.gbps >= 100 ? 'OM4 MMF in-building / OS2 SMF if it leaves the building' : 'OM4 MMF'}; polish UPC (MMF) or APC (SMF) — never mix; one polarity method facility-wide.` }); });
      }

      if (spine) {
        // uplinks-per-leaf + uplinkSpeed were sized in step 2 from the oversubscription target.
        const upSpeed = fs.uplinkSpeed || (fs.workload === 'ai' ? fs.speed : '100GbE');
        const upGbps = speedToGbps(upSpeed) || 100;
        const uplinksPerLeaf = fs.uplinksPerLeaf || 4;
        fs.uplinkCableQty = fs.totalLeaves * uplinksPerLeaf;

        // Breakout on the SPINE side when the spine port is a 2×/4× multiple of the uplink speed
        // — resolved via the shared helper (also used by the 3-tier trigger in step 3) so the
        // two can never disagree about what's actually cataloged/buildable.
        // Multi-rack: leaf→spine runs cross racks — size for row distances. B6 (backtest 2026-07-16b):
        // there is NO dedicated spine rack — the spine is housed within a declared rack (or, when
        // reused, at the customer's existing spine location).
        const xRack = racks > 1 ? ` · CROSS-RACK (leaf racks → ${reuseSpine ? 'the existing spine location' : "the spine's declared rack"}): size lengths for row distance — AOC 7–30 m or structured fiber; do NOT quote in-rack DAC lengths` : '';
        const resolved = resolveUplinkBreakout(spine, upSpeed, breakout, nv, hasFabricUplink(leaf) ? leaf.uplink : leaf.access);
        const ratio = resolved ? resolved.ratio : 1;
        const brk = resolved ? resolved.brk : null;
        if (brk) {
          fs.uplinkBreakout = { ratio, high: spine.access.speed, low: upSpeed, model: brk.model, class: brk.category, id: brk.id };   // id: R12 form-factor check
          const assemblies = Math.ceil(fs.uplinkCableQty / ratio);   // one assembly = one spine port → `ratio` leaf uplinks
          const brkDac = racks > 1 && (brk.category === 'dac' || /^DAC/i.test(brk.model || ''));
          addLine(bom, { category: 'Cable/Optic', vendor: brk.vendor || 'Dell', item: brk.desc, model: brk.desc, qty: assemblies,
            mergeKey: 'brk|' + fs.target.id + '|' + fs.network + '|' + brk.id,
            dellPN: brk.dellPN, verify: brk.verify, specConfirmed: brk.specConfirmed, source: brk.source,
            note: `Leaf-to-spine uplinks (BREAKOUT) for ${fam} ${fs.network} — 1× ${spine.access.speed} spine port → ${ratio}× ${upSpeed} (${fs.uplinkCableQty} leaf uplinks ÷ ${ratio} = ${assemblies} assemblies)` + xRack });
          if (brkDac) warnings.push({ severity: 'warn',
            message: `${fs.network}: the ${brk.model} breakout is a passive-DAC assembly (≤3 m) but this is a ${racks}-rack deployment — leaf→spine crosses racks. Use the AOC/optical breakout variant (see the line's alternatives) or structured fiber.`,
            source: 'Cable reach physics (DAC ≤3 m) · FDC multi-rack pattern' });
        } else {
          const upCable = pickUplinkCable(upGbps, nv, placement === 'structured');
          // A standalone transceiver (structured run) means TWO optics per link — leaf end AND
          // spine end. An integrated cable (DAC/AOC) is one part with both ends attached, ×1.
          const upStandalone = upCable && upCable.category === 'transceiver';
          const upQty = upStandalone ? fs.uplinkCableQty * 2 : fs.uplinkCableQty;
          if (upCable) fs.uplinkCableClass = upCable.category;
          fs.uplinkCableId = upCable ? upCable.id : null;   // R12 form-factor check (leaf end + spine end)
          if (upCable) addLine(bom, { category: 'Cable/Optic', vendor: upCable.vendor || 'Dell', item: upCable.desc, model: upCable.desc, qty: upQty,
            mergeKey: 'uplink|' + fs.target.id + '|' + fs.network + '|' + upCable.id,
            dellPN: upCable.dellPN, verify: upCable.verify, specConfirmed: upCable.specConfirmed, source: upCable.source,
            note: `Leaf-to-spine uplinks for ${fam} ${fs.network} — ${uplinksPerLeaf}/leaf × ${fs.totalLeaves} @ ${upSpeed} (~${fs.oversubTarget}:1 target)` + (upStandalone ? ` · ${fs.uplinkCableQty} links × 2 optics (leaf end + spine end) + fiber per link (${placement === 'structured' ? 'patch cords itemized below' : 'MPO/LC jumpers — by others unless a structured plant is quoted'})` : '') + (upCable.lengths ? ` · lengths ${upCable.lengths}` : '') + xRack });
          else warnings.push({ severity: 'warn', message: `${fam} ${fs.network}: no cataloged optic for a ${upSpeed} leaf-to-spine uplink — this speed is beyond current catalog coverage. Engage Dell Advanced Engineering / Services to confirm optics before quoting.`, source: R.leafSpine.source });
          // and the fiber those standalone optics ride on (patch cords; plant when not in place)
          if (upStandalone && placement === 'structured' && fs.uplinkCableQty > 0) {
            const pc2 = fiberCordFor(upCable);
            if (pc2 && !structuredInPlace) addLine(bom, { category: 'Cable/Optic', vendor: 'Structured', item: pc2.desc + ' — leaf↔spine', model: pc2.desc + ' — leaf↔spine', qty: fs.uplinkCableQty * 2,
              mergeKey: 'uplinkpatch|' + fs.target.id + '|' + fs.network,
              dellPN: pc2.dellPN, verify: pc2.verify, specConfirmed: pc2.specConfirmed, source: pc2.source,
              note: `Fiber patch cords for ${fs.network} leaf↔spine — 2 per link × ${fs.uplinkCableQty} links (one each end); the host-run plant lines cover the shared panels/trunks — confirm total channel count with the cabling vendor.` });
          }
        }
      }

      // redundancy method (OS/design-aware). fabricInterconnect:'independent' = air-gapped A/B
      // fabrics (block+MPIO only, no ICL) — blocked when the platform mandates a system bond (LACP).
      fs.redundancyMethod = null; fs.interconnectQty = 0; fs.interconnectSpeed = null;
      if (fs.fabricsN === 2 && fs.workload !== 'ai') {
        // PowerScale-style back-end: int-a / int-b are ALWAYS independent networks (h16346) — no ICL,
        // at ANY scale. This is a PLATFORM property (OneFS runs A and B as separate failover networks),
        // not a function of size: a back-end large enough to grow its own spine is STILL independent A/B
        // (each fabric reaches its own spine; A never peer-links to B). The `!spine` gate that used to sit
        // here silently dropped that independence once the back-end spined — harmless under the old
        // spined⇒EVPN-MH policy, but under the spare-port scope (ruling 2026-07-16c) it let a spined
        // back-end fall through to an MC-LAG ICL, violating h16346. Independence is now scale-independent.
        const beIndependent = fs.network === 'backend' && fs.target.platform.backendIndependent;
        const wantsIndependent = beIndependent || (input.fabricInterconnect === 'independent' && !spine);
        if (wantsIndependent && fs.target.platform.systemBond) {
          warnings.push({ severity: 'warn', message: `${fam}: independent A/B fabrics requested, but this platform's published design REQUIRES a switch-dependent (LACP) system bond — the ToR pair must run MC-LAG with an ICL. Keeping the MC-LAG pair.`, source: fs.target.platform.source });
        } else if (wantsIndependent) {
          fs.redundancyMethod = 'independent-ab';   // no ICL — interconnectQty stays 0
        }
        // Redundancy MECHANISM — spare-port scope (ruling 2026-07-16c, Option b). MC-LAG/VLT is the
        // customer-standard pair mechanism; its peer-link (ICL) costs 2 leaf ports. Where the leaf has
        // HEADROOM for that link (fs.iclFits — computed AFTER the oversub-driven uplinks, so it reflects
        // genuine spare ports, not reduced uplinks), pay it: every redundant A/B fabric is MC-LAG/VLT —
        // a bare ToR pair (no spine), a per-rack FDC pair, AND a spined single-/multi-leaf pair alike.
        // Where uplinks FILL the leaf (!iclFits), EVPN-Multihoming is the purpose-built answer, NOT a
        // degraded fallback — cutting uplinks to force a peer-link would trade fabric throughput for
        // mechanism uniformity, which this ruling explicitly rejects. R2's "never silent" holds because
        // port-driven EVPN-MH ALWAYS emits the visible WARN below (it is never a silent policy choice).
        if (fs.redundancyMethod !== 'independent-ab') {
          // iclFits was frozen in the sizing pass (step 2) against the INITIAL uplinksPerLeaf. The
          // shared-spine HARMONIZE step (line ~767) may have GROWN uplinksPerLeaf since, to reach every
          // spine — so under the spare-port scope it must be RE-EVALUATED against the FINAL port budget.
          // Otherwise a stale-true iclFits picks MC-LAG on a leaf whose uplinks now fill the port, and
          // the physical-feasibility check (validate.js) hard-errors "uplinks + ICL > ports". (perRack
          // pairs reserved 2 uplink ports up front via iclUplinkReserve, so they stay fitting here — the
          // FDC ground-truth VLT structure is unchanged; only spined non-perRack fabrics are re-gated.)
          const iclPortsNow = (speedToGbps(hasFabricUplink(leaf) ? leaf.uplink.speed : leaf.access.speed) >= 100) ? 2 : 4;
          if (hasFabricUplink(leaf)) {
            fs.iclFits = (fs.uplinksPerLeaf + iclPortsNow) <= leaf.uplink.count;
          } else if (leaf.access) {
            let radixAdj = leaf.access.count;
            const accG = speedToGbps(leaf.access.speed), railG = fs.gbps;
            if (accG > railG && railG > 0) radixAdj = radixAdj * Math.floor(accG / railG);
            const linksPerLeafNow = Math.max(1, Math.ceil(fs.perFabricLinks / Math.max(1, fs.leavesPerFabric)));
            fs.iclFits = (linksPerLeafNow + fs.uplinksPerLeaf + iclPortsNow) <= radixAdj;
          }
          // Ruling 1 + point (2), 2026-07-16c: the EVPN-MH auto-substitution below is scoped to
          // AUTO-mode mechanism selection on a SPINED fabric. A no-spine ToR PAIR is the explicit
          // MC-LAG topology (a ToR pair IS an MC-LAG/VLT pair) — `!spine` forces the peer-link and is
          // NEVER silently swapped for EVPN-MH; its feasibility gate is the hard port-budget error in
          // validate.js (and Ruling 1's leaf step-up sizes the leaf to fit up front). Only a spined
          // fabric whose uplinks fill the leaf falls to EVPN-MH — the spare-port choice, always warned.
          const wantsPeerPair = !spine || fs.iclFits;   // no-spine ToR pair (explicit MC-LAG), OR any spined redundant fabric with spare ports for the ICL
          if (wantsPeerPair) {
            fs.redundancyMethod = 'mclag';   // nos is pinned 'sonic' (R14 ruling) — MC-LAG is the only new-build peer-pair mechanism
          } else {   // spine && !fs.iclFits (AUTO mode) — uplinks fill the leaf, EVPN-MH is the purpose-built mechanism
            if (supportsEvpnMh(leaf)) {
              fs.redundancyMethod = 'evpn-mh';
              fs.iclFellBack = true;   // drives the visible, never-silent WARN below (R2)
            } else {
              warnings.push({ severity: 'error', message: `${fam} ${fs.network}: the ${leaf.model} leaf can't fit an MC-LAG/VLT peer-link at this scale (${hasFabricUplink(leaf) ? leaf.uplink.count + ' uplink ports, ' + fs.uplinksPerLeaf + ' needed for spine uplinks' : 'no dedicated uplink ports'}) AND is not a VXLAN leaf that can run EVPN-Multihoming — no redundant fabric is possible on this switch. Pick a larger leaf (S5248F-ON / S5296F-ON) for an MC-LAG pair, or accept a single (non-redundant) design.`, source: 'Enterprise SONiC Compatibility Matrix + leaf-spine port budget' });
              fs.redundancyMethod = 'evpn-mh';
            }
          }
        }
        // Visible, never-silent PORT-DRIVEN EVPN-MH notice (ruling 2026-07-16c, R2 point 1: this
        // mechanism choice is ALWAYS announced, never silent). Under the spare-port scope EVPN-MH here
        // is the CORRECT, purpose-built mechanism — a leaf whose uplinks fill its ports uses all-active
        // multihoming rather than surrendering uplink throughput to carve out a peer-link. It is NOT a
        // degraded fallback; the note states the port math so the rep sees WHY, and offers a
        // higher-uplink leaf only as the option for a site whose standard MANDATES an MC-LAG peer-link.
        if (fs.iclFellBack) warnings.push({ severity: 'warn', message: `${fam} ${fs.network}: this fabric uses EVPN-Multihoming (all-active redundancy, no peer-link) — the correct mechanism here because the ${leaf.model} leaf's ${leaf.uplink ? leaf.uplink.count : 0} uplink ports are fully used by its ${fs.uplinksPerLeaf} spine uplinks, leaving no room for an MC-LAG/VLT peer-link (ICL). This is by design, not a shortfall: cutting spine uplinks to free ICL ports would reduce fabric throughput. Redundancy is fully maintained. If your site standard specifically requires an MC-LAG/VLT peer-link pair, a higher-uplink leaf (S5248F-ON / S5296F-ON) has the spare ports for one.`, source: 'Leaf-spine port budget + Enterprise SONiC Compatibility Matrix' });
        const m = R.redundancy.methods[fs.redundancyMethod];
        if (m.peerLink && leaf.access) {
          const pairs = fs.leavesPerFabric;
          fs.interconnectSpeed = hasFabricUplink(leaf) ? leaf.uplink.speed : leaf.access.speed;
          // PUBLISHED (h04504): ≥2 peer-link ports at 100GbE+; ≥4 when using sub-100G ports
          const perPair = speedToGbps(fs.interconnectSpeed) >= 100 ? (R.redundancy.interconnectLinksPerPair || 2) : (R.redundancy.interconnectLinksPerPairSub100 || 4);
          fs.interconnectQty = pairs * perPair;
          // the ICL rides the port class whose speed matches interconnectSpeed (see validate #22/#23)
          const iclPort = [leaf.uplink, leaf.uplinkAlt, leaf.access]
            .find(p => p && p.media && p.media !== '-' && String(p.speed) === String(fs.interconnectSpeed)) || null;
          // both ends of a peer-link are switch cages — no NIC far end
          const ic = pickHostCable(speedToGbps(fs.interconnectSpeed), 'in-rack', nv, false, iclPort,
            (C.formFactor && iclPort && C.formFactor.cagesOf(iclPort.media).indexOf('OSFP') >= 0) ? 'osfp' : null);
          fs.iclCableId = ic ? ic.id : null;   // R12 form-factor check (rides the class named by fs.interconnectSpeed)
          const tag = fs.redundancyMethod === 'vlt' ? 'VLTi' : 'MC-LAG ICL';
          if (ic) addLine(bom, { category: 'Cable/Optic', vendor: ic.vendor || 'Dell', item: ic.desc + ' — ' + tag, model: ic.desc + ' — ' + tag, qty: fs.interconnectQty,
            mergeKey: 'peer|' + fs.target.id + '|' + fs.network + '|' + ic.id,
            dellPN: ic.dellPN, verify: ic.verify, specConfirmed: ic.specConfirmed, source: ic.source,
            note: `${m.label} between the ${fam} ${fs.network} ToR pair — ${perPair}× ${fs.interconnectSpeed} per pair (${pairs} pair(s))` });
          else warnings.push({ severity: 'warn', message: `${fam} ${fs.network}: no cataloged optic for a ${fs.interconnectSpeed} ${tag} — this speed is beyond current catalog coverage. Engage Dell Advanced Engineering / Services to confirm optics before quoting.`, source: R.leafSpine.source });
        }
      } else if (fs.workload === 'ai') { fs.redundancyMethod = 'evpn-mh'; }

      // oversubscription (when spine present) — computed from the sized uplinks
      fs.oversub = null;
      if (spine) {
        const accessBw = fs.perFabricLinks * fs.gbps;
        const upGbps = speedToGbps(fs.uplinkSpeed || (fs.workload === 'ai' ? fs.speed : '100GbE')) || 100;
        const uplinkBw = (fs.uplinksPerLeaf || 4) * upGbps * fs.leavesPerFabric;
        fs.oversub = uplinkBw > 0 ? +(accessBw / uplinkBw).toFixed(2) : null;
      }
      // non-blocking = 1:1 (or better). AI single-switch is inherently non-blocking.
      fs.nonBlocking = (fs.oversub != null && fs.oversub <= 1.0) || (fs.workload === 'ai' && !spine);

      // a converged fabric gets synthetic target identifiers (there's no single real target
      // to point at) — stable per merge group so topology/rack/draw.io group it as ONE column
      const fabricRecord = { network: fs.network, role: fs.role, speed: fs.speed, media: fs.media, workload: fs.workload,
        targetId: fs.converged ? 'converged-' + fs._mergeKey : fs.target.id,
        // the REAL id the BOM cable mergeKeys use (`host|<bomTargetId>|...`) — for a converged fabric
        // `targetId` above is a synthetic render key, but addLine still keys off `fs.target.id`, so the
        // canonical cable layer must reconstruct the SAME key from this field, not the synthetic one.
        bomTargetId: fs.target.id,
        targetUid: fs.converged ? 'converged-' + fs._mergeKey : fs.target.uid,
        targetLabel: fs.converged ? fam : fs.target.label, targetFamily: fam, stack: fs.stack,
        converged: !!fs.converged, convergedPlatforms: fs.convergedPlatforms || null, _convergedFrom: fs._convergedFrom || null,
        totalLinks: fs.links, linksPerUnit: fs.linksPerUnit, unitsN: fs.unitsN, connector: fs.connector, nicOverride: fs.nicOverride,
        fabricsN: fs.fabricsN, perFabricLinks: fs.perFabricLinks,
        perRack: !!fs.perRack, cablePlacement: fsPlacement,
        leaf, leavesPerFabric: fs.leavesPerFabric, totalLeaves: fs.totalLeaves,
        spine: fs.spine, spineCount: fs.spineCount, spineGroupKey: fs.spineGroupKey, dedicated: fs.dedicated, oversub: fs.oversub, oversubTarget: fs.oversubTarget, note: fs.note,
        numPods: fs.numPods || 1, totalPodSpines: fs.totalPodSpines || fs.spineCount || 0,
        superSpine: fs.superSpine || null, superSpineCount: fs.superSpineCount || 0, podUplinksToSuper: fs.podUplinksToSuper || 0,
        superSpineBreakout: null, superSpineCableClass: null,   // step 5 (spine BOM), which runs AFTER this push, fills these in via fs._record
        nonBlocking: fs.nonBlocking, nonBlockingReq: fs.nonBlockingReq, uplinkPortLimited: fs.uplinkPortLimited, aiFolded: fs.aiFolded,
        // R12 — the optic ids this fabric actually resolved, for the form-factor hard check in
        // validate.js (#23). Recorded here rather than re-derived from BOM mergeKeys: this record
        // is already the canonical "what the engine decided" object every port check reads.
        hostCableId: fs.hostCableId || null, uplinkCableId: fs.uplinkCableId || null, iclCableId: fs.iclCableId || null,
        uplinksPerLeaf: fs.uplinksPerLeaf || 0, uplinkSpeed: fs.uplinkSpeed || null, uplinkBreakout: fs.uplinkBreakout || null,
        uplinkCableClass: fs.uplinkCableClass || null,
        redundancyMethod: fs.redundancyMethod, interconnectQty: fs.interconnectQty, interconnectSpeed: fs.interconnectSpeed, uplinkCableQty: fs.uplinkCableQty || 0 };
      // step 5's pod-spine↔super-spine breakout ratio is computed AFTER this record is pushed
      // (a later, separate per-spine-group pass) — keep a live reference so it can attach onto
      // the SAME object validate.js reads, instead of a snapshot that breakout info never reaches
      // (previously left `superSpineBreakout` permanently null, making both the port-capacity
      // warn and the hard-error check compute super-spine capacity with NO breakout credit).
      fs._record = fabricRecord;
      fabrics.push(fabricRecord);
    });

    /* 5. spine BOM lines — one per spine group (skipped when reusing an existing spine) */
    Object.keys(groups).forEach(k => {
      const grp = groups[k]; if (!grp.spine) return;
      const f0 = grp.fabrics[0];
      const podNote = (grp.numPods || 1) > 1 ? ` — 3-TIER CLOS: ${grp.numPods} pod(s) × ${grp.spineCount}/pod` : '';
      const note = (grp.ai ? `Spine — ${f0.target.platform.family} ${f0.network} AI fabric (${f0.stack} stack, rail-optimized)`
        : grp.dedicated ? `Dedicated spine — ${f0.target.platform.family} back-end (kept physically separate)`
          : (separate ? `Spine — ${f0.network} fabric` : 'Shared spine — all non-AI, non-back-end leaves connect here')) + podNote;
      const is3Tier = (grp.numPods || 1) > 1;
      // brownfield "reuse existing spine" assumes the customer's existing fabric is a flat 2-tier
      // spine that can just absorb more leaves. That assumption breaks once growth pushes the
      // design into a NEW 3rd tier — the customer does not already own a super-spine (it never
      // existed before), and does not already own all `totalPodSpines` pod-spines (only ever had
      // one pod's worth, `spineCount`). Silently skipping the whole tier here would drop
      // brand-new required hardware from the BOM with no error anywhere. So: only apply the
      // "already owned, skip it" shortcut for a flat 2-tier reuse; once 3-tier is needed, quote
      // the FULL pod-spine/super-spine hardware and flag it explicitly instead of guessing at
      // partial credit for what the customer may already have.
      if (reuseSpine && !grp.ai && !is3Tier) {
        // R7 extension (backtest 2026-07-16b): state the PORT DEMAND the new leaves place on the
        // reused spine, out of its capacity — the reused spine isn't in this BOM, but confirming it
        // has the free ports is a precondition to quoting (same "surface the core-port cost" rule).
        const reuseUplinks = grp.fabrics.reduce((s, f) => s + (f.totalLeaves || 0) * (f.uplinksPerLeaf || 2), 0);
        const cap = (grp.spine.access && grp.spine.access.count) || 0;
        warnings.push({ severity: 'info',
          message: `Reused spine (${grp.spine.model}): the new leaves need ${reuseUplinks}× ${grp.spine.access ? grp.spine.access.speed : '100GbE'} FREE ports on the existing ${grp.spine.model}${cap ? ` (of ${cap} total)` : ''}. The spine is NOT re-quoted here — confirm it has that capacity before finalizing.`,
          source: 'Leaf-uplink port math · reused-spine handoff' });
        return;
      }
      if (reuseSpine && !grp.ai && is3Tier)
        warnings.push({ severity: 'warn', message: `${grp.key}: this add-on now exceeds a flat 2-tier spine's capacity and needs a 3-tier Clos (pod-spines + super-spine) — "reuse existing spine" no longer fully covers this scale. The FULL pod-spine/super-spine hardware below is quoted as new; manually net out only the ~${grp.spineCount} pod-spine switches the customer already physically owns (out of ${grp.totalPodSpines} total) before finalizing — the super-spine tier is entirely new.`, source: R.leafSpine.source });
      addLine(bom, { category: 'Switch', vendor: grp.spine.vendor, item: grp.spine.model + (is3Tier ? ' — Pod-spine' : ''), model: grp.spine.model, qty: grp.totalPodSpines || grp.spineCount,
        mergeKey: is3Tier ? ('podspine-sw|' + k) : undefined,
        // network/dedicated: a flat 2-tier spine (undefined mergeKey → default category|model key)
        // CAN merge across groups sharing a model — e.g. separate frontend and storage fabrics
        // both landing on the same spine rung — so this opts into the same per-network breakdown
        // leaf lines already use (R11), closing the gap for spine lines specifically.
        network: f0.network, dedicated: grp.dedicated,
        dellPN: grp.spine.dellPN, verify: grp.spine.verify, specConfirmed: grp.spine.specConfirmed, source: grp.spine.source,
        nos: switchNosNote(grp.spine),
        note: note + (grp.spine.switchingCapacity ? ` · ${grp.spine.switchingCapacity}` : '') });
      // 3-TIER: super-spine switches + pod-spine <-> super-spine cabling. Every pod-spine reaches
      // every super-spine (Clos), 1 link each — the LINK RATE is the pod-spine's own port speed
      // (its access class, split half down/half up) but the physical OPTIC must match whatever
      // port the super-spine actually presents — pickSuperSpine can step up to a higher-radix
      // FLAGSHIP model with faster native ports (e.g. Z9864F-ON pod-spine @800GbE stepping up to
      // Z9964F-ON super-spine @1.6TbE) — so this must breakout-detect exactly like leaf→spine
      // does, not assume the two tiers share one speed.
      if (grp.superSpine) {
        // distinct mergeKey — even when the super-spine happens to be the SAME model as the
        // pod-spine tier, it must stay its own BOM line (different rack, different role); merging
        // by model alone (the default for Switch lines) would hide the tier split from the BOM.
        addLine(bom, { category: 'Switch', vendor: grp.superSpine.vendor, item: grp.superSpine.model + ' — Super-spine', model: grp.superSpine.model, qty: grp.superSpineCount, mergeKey: 'superspine-sw|' + k,
          // mergeKey is unique per group `k`, so this never actually merges with another group's
          // super-spine today (deliberately — see the comment above this block) — network/dedicated
          // are supplied anyway so every Switch line shares one shape (see switchLineNote).
          network: f0.network, dedicated: grp.dedicated,
          dellPN: grp.superSpine.dellPN, verify: grp.superSpine.verify, specConfirmed: grp.superSpine.specConfirmed, source: grp.superSpine.source,
          nos: switchNosNote(grp.superSpine),
          note: `Super-spine (3-tier Clos top tier) — ${f0.target.platform.family} ${f0.network}; every ${grp.spine.model} pod-spine (${grp.totalPodSpines} total) uplinks to every super-spine` + (grp.superSpine.switchingCapacity ? ` · ${grp.superSpine.switchingCapacity}` : '') });
        const podGbps = speedToGbps((grp.spine.access && grp.spine.access.speed) || '100GbE') || 100;
        const superGbps = speedToGbps((grp.superSpine.access && grp.superSpine.access.speed) || '100GbE') || 100;
        const nv = (grp.ai ? f0.stack : (grp.fabrics.every(f => f.stack === 'nvidia') ? 'nvidia' : 'dell')) === 'nvidia';
        const superQty = grp.totalPodSpines * grp.podUplinksToSuper;
        const ratio = podGbps > 0 ? Math.round(superGbps / podGbps) : 1;
        // does this hop even WANT a breakout (speeds genuinely differ by a real 2x/4x step)?
        // plain arithmetic, not a catalog guess — resolveUplinkBreakout below is the single
        // source of truth for whether that want is actually catalog-real AND user-permitted.
        const wantsSuperBreakout = superGbps > podGbps && (ratio === 2 || ratio === 4);
        // Resolved via the SAME resolveUplinkBreakout() helper as the leaf<->spine hop — this
        // call site used to compute ratio/pickBreakout inline and had already drifted from the
        // leaf<->spine version: it never checked `breakout !== 'none'` at all, so a customer who
        // explicitly turned breakout off still got one priced here. Fixed by consolidating.
        // far end here is the POD-SPINE's own port (that's what the low ends land in), not a leaf
        const superResolved = wantsSuperBreakout ? resolveUplinkBreakout(grp.superSpine, grp.spine.access.speed, breakout, nv, grp.spine.access) : null;
        const xRackDacWarn = () => warnings.push({ severity: 'warn', message: `${grp.key}: the pod-spine↔super-spine link is a passive-DAC assembly (short reach) but pod-spines and the super-spine sit in different racks at this scale — use the AOC/optical variant or structured fiber instead.`, source: R.leafSpine.source });
        if (superResolved) {
          const brk = superResolved.brk;
          const assemblies = Math.ceil(superQty / ratio);
          addLine(bom, { category: 'Cable/Optic', vendor: brk.vendor || 'Dell', item: brk.desc + ' — pod-spine ↔ super-spine', model: brk.desc + ' — pod-spine ↔ super-spine', qty: assemblies,
            mergeKey: 'superspine-brk|' + k,
            dellPN: brk.dellPN, verify: brk.verify, specConfirmed: brk.specConfirmed, source: brk.source,
            note: `3-tier Clos (BREAKOUT) — 1× ${grp.superSpine.access.speed} super-spine port → ${ratio}× ${grp.spine.access.speed} pod-spine uplink (${superQty} pod-spine uplinks ÷ ${ratio} = ${assemblies} assemblies)` });
          if (brk.category === 'dac' || /^DAC/i.test(brk.model || '')) xRackDacWarn();
          // this breakout ratio is what actually multiplies the super-spine tier's REAL port
          // capacity — propagate it onto the already-pushed fabric records (via the live
          // reference kept at push time) so validate.js's super-spine port-budget checks stop
          // computing capacity from the raw native port count alone.
          const superSpineBreakout = { ratio, high: grp.superSpine.access.speed, low: grp.spine.access.speed, model: brk.model, class: brk.category };
          grp.fabrics.forEach(f => { if (f._record) f._record.superSpineBreakout = superSpineBreakout; });
        } else if (wantsSuperBreakout) {
          // genuinely needs a step (speeds differ by a real 2x/4x) but resolveUplinkBreakout
          // came back null — either no cataloged part exists, or the user disabled breakout.
          // Either way a straight same-speed cable is physically impossible here; say so
          // explicitly rather than falling through to the same-speed branch below.
          warnings.push({ severity: 'warn', message: breakout === 'none'
            ? `${grp.key}: breakout is disabled but the ${grp.spine.model} pod-spine (${grp.spine.access.speed}) needs a ${ratio}× breakout to reach the ${grp.superSpine.model} super-spine (${grp.superSpine.access.speed}) — enable breakout, or pick a same-speed super-spine model.`
            : `${grp.key}: no cataloged breakout connects the ${grp.spine.model} pod-spine (${grp.spine.access.speed}) to the ${grp.superSpine.model} super-spine (${grp.superSpine.access.speed}) — this speed step is beyond current catalog coverage. Engage Dell Advanced Engineering / Services to confirm optics before quoting.`,
            source: R.leafSpine.source });
        } else {
          // same speed (no step-up, or step-up landed on an equal-speed model) — one cable per link.
          const superCable = pickUplinkCable(podGbps, nv, racks > 1);
          const superCableGbps = superCable && speedToGbps(superCable.speed);
          if (superCable && superCableGbps >= podGbps) {
            const super2 = superCable.category === 'transceiver';   // standalone optic → 2 per link (one each end)
            addLine(bom, { category: 'Cable/Optic', vendor: superCable.vendor || 'Dell', item: superCable.desc + ' — pod-spine ↔ super-spine', model: superCable.desc + ' — pod-spine ↔ super-spine', qty: super2 ? superQty * 2 : superQty,
              mergeKey: 'superspine|' + k,
              dellPN: superCable.dellPN, verify: superCable.verify, specConfirmed: superCable.specConfirmed, source: superCable.source,
              note: `3-tier Clos — ${grp.podUplinksToSuper}× uplink(s)/pod-spine × ${grp.totalPodSpines} pod-spines @ ${grp.spine.access.speed} → ${grp.superSpineCount}× ${grp.superSpine.model} super-spine` + (super2 ? ` · ${superQty} links × 2 optics (one each end) + fiber per link` : '') + (superCable.lengths ? ` · lengths ${superCable.lengths}` : '') });
            if (superCable.category === 'dac' || /^DAC/i.test(superCable.model || '')) xRackDacWarn();
            grp.fabrics.forEach(f => { if (f._record) f._record.superSpineCableClass = superCable.category; });
          } else {
            warnings.push({ severity: 'warn', message: `${grp.key}: no cataloged optic supports the ${grp.spine.access.speed} pod-spine↔super-spine link at this scale — engage Dell Advanced Engineering / Services to confirm optics before quoting.`, source: R.leafSpine.source });
          }
        }
      }
    });

    /* 6b. BORDER-LEAF pair (Dell EVPN-VXLAN multisite / DCI pattern): a dedicated leaf pair
     * that terminates ALL external / DCI connectivity (the north-south border VTEP) instead
     * of consuming spine ports. Built BEFORE OOB so its two switches get management ports.
     * Requires a spine tier to attach to. */
    let borderLeafInfo = null;
    if (input.includeCoreUplink && input.borderLeaf) {
      const spinedFab = fabrics.find(f => f.spine && !f.dedicated) || fabrics.find(f => f.spine);
      if (!spinedFab) {
        warnings.push({ severity: 'warn', message: 'Border-leaf pair requested but this design has no spine tier (ToR-only fabric) — border leaves attach to the spine. Scale to a leaf-spine fabric, or run the core uplink from the ToR pair directly.', source: R.coreUplink.source });
      } else {
        // attach to whatever tops the fabric — the super-spine when this is a 3-tier Clos,
        // otherwise the (pod-)spine tier itself.
        const topTier = spinedFab.superSpine || spinedFab.spine;
        const topTierCount = spinedFab.superSpine ? spinedFab.superSpineCount : spinedFab.spineCount;
        const coreGbps = speedToGbps(input.coreSpeed || '100GbE');
        const upG = speedToGbps((topTier.access && topTier.access.speed) || '100GbE') || 100;
        const borderSw = C.switches.find(x => x.id === (Math.max(upG, coreGbps) >= 400 ? 'z9432f-on' : 's5232f-on'));
        const spinesN = topTierCount || 2;
        addLine(bom, { category: 'Switch', vendor: borderSw.vendor, item: borderSw.model + ' — Border-leaf', model: borderSw.model, qty: 2, mergeKey: 'border-sw|' + borderSw.id,
          // this addLine runs at most once per recommend() call (guarded above, outside any
          // per-network loop), so there is no real "network" to break down — the constant label
          // is here only so every Switch line shares one shape (see switchLineNote).
          network: 'core/DCI', dedicated: false,
          dellPN: borderSw.dellPN, verify: borderSw.verify, specConfirmed: borderSw.specConfirmed, source: borderSw.source,
          nos: switchNosNote(borderSw),
          note: `Border-leaf pair — dedicated external / DCI egress (EVPN-VXLAN border VTEP); MC-LAG pair uplinked to the ${spinedFab.superSpine ? 'super-spine' : 'spine'}, terminating the core/DCI links (keeps north-south off the spine ports)` + (borderSw.switchingCapacity ? ` · ${borderSw.switchingCapacity}` : '') });
        const bUp = pickUplinkCable(upG, false, placement === 'structured' || racks > 1);
        const bUp2 = bUp && bUp.category === 'transceiver';   // standalone optic → 2 per link (one each end)
        if (bUp) addLine(bom, { category: 'Cable/Optic', vendor: bUp.vendor || 'Dell', item: bUp.desc + ' — border-leaf ↔ spine', model: bUp.desc + ' — border-leaf ↔ spine', qty: bUp2 ? 4 * spinesN : 2 * spinesN, mergeKey: 'border-up',
          dellPN: bUp.dellPN, verify: bUp.verify, specConfirmed: bUp.specConfirmed, source: bUp.source,
          note: `Border-leaf uplinks — 2 border switches × ${spinesN} ${spinedFab.superSpine ? 'super-spine(s)' : 'spine(s)'} @ ${topTier.access ? topTier.access.speed : '100GbE'} (every border leaf to every ${spinedFab.superSpine ? 'super-spine' : 'spine'}, Clos)${bUp2 ? ` · ${2 * spinesN} links × 2 optics (one each end) + fiber per link` : ''}` });
        else warnings.push({ severity: 'warn', message: `Border-leaf uplink: no cataloged optic for a ${topTier.access ? topTier.access.speed : '100GbE'} link to the ${spinedFab.superSpine ? 'super-spine' : 'spine'} — this speed is beyond current catalog coverage. Engage Dell Advanced Engineering / Services to confirm optics before quoting.`, source: R.coreUplink.source });
        const bIcl = pickHostCable(upG, 'in-rack', false, false, borderSw.access);
        if (bIcl) addLine(bom, { category: 'Cable/Optic', vendor: bIcl.vendor || 'Dell', item: bIcl.desc + ' — border MC-LAG ICL', model: bIcl.desc + ' — border MC-LAG ICL', qty: 2, mergeKey: 'border-icl',
          dellPN: bIcl.dellPN, verify: bIcl.verify, specConfirmed: bIcl.specConfirmed, source: bIcl.source,
          note: 'Border-leaf pair ICL — 2× links between the two border switches (MC-LAG)' });
        else warnings.push({ severity: 'warn', message: `Border-leaf ICL: no cataloged optic for a ${upG}Gbps link between the two border switches — this speed is beyond current catalog coverage. Engage Dell Advanced Engineering / Services to confirm optics before quoting.`, source: R.coreUplink.source });
        // `sw`/`topTier`/cable ids: R12 — the border pair is the SOURCE PORT for the core uplink
        // when one is present, so the form-factor check needs the real switch objects, not just a
        // display model name.
        borderLeafInfo = { model: borderSw.model, qty: 2, spines: spinesN, uplinkSpeed: topTier.access ? topTier.access.speed : '100GbE',
          sw: borderSw, topTier, upCableId: bUp ? bUp.id : null, iclCableId: bIcl ? bIcl.id : null };
      }
    }

    /* 6. OOB management (single, vendor consistent with stack) */
    let mgmtInfo = null;
    // Every NETWORK switch (leaf + spine + border) also needs a mgmt port to the OOB, not just the hosts.
    const switchMgmt = bom.filter(b => b.category === 'Switch').reduce((s, b) => s + (typeof b.qty === 'number' ? b.qty : 0), 0);
    const totalMgmt = mgmtLinks + switchMgmt;
    if (input.includeMgmt !== false && totalMgmt > 0) {
      // OOB follows the stack only if EVERY data-fabric switch is NVIDIA; else Dell leads.
      const dataFabrics = fabrics.filter(f => f.network !== 'mgmt');
      const oobNvidia = dataFabrics.length > 0 && dataFabrics.every(f => /NVIDIA/i.test(f.leaf.vendor) && (!f.spine || /NVIDIA/i.test(f.spine.vendor)));
      const mgmtSw = (oobNvidia ? C.switches.find(x => x.id === 'sn2201') : C.switches.find(x => x.id === 's3248t-on'))
        || C.switches.find(x => x.roles && x.roles.includes('management'));
      const cap = (mgmtSw && mgmtSw.access && mgmtSw.access.count) || 48;
      // B6 / SPEC multi-rack governing rule (ruling 2026-07-16): OOB count = DECLARED racks, never
      // declared+1. Spines are housed WITHIN the declared racks — a dedicated spine rack is the
      // user entering racks=N+1, not the tool inventing one. The tool never quotes hardware for a
      // rack the customer didn't declare.
      const rackMin = racks;
      const qty = Math.max(rackMin, Math.ceil(totalMgmt / cap));
      addLine(bom, { category: 'Management', vendor: mgmtSw.vendor, item: mgmtSw.model, model: mgmtSw.model, qty,
        dellPN: mgmtSw.dellPN, verify: mgmtSw.verify, specConfirmed: mgmtSw.specConfirmed, source: mgmtSw.source,
        note: `Out-of-band management switch — ${mgmtLinks} host (iDRAC/BMC) + ${switchMgmt} network-switch mgmt ports` + (racks > 1 ? ` · one per declared rack (${racks}, FDC pattern)` : '') + (mgmtSw.switchingCapacity ? ` · ${mgmtSw.switchingCapacity}` : '') });
      const cat6 = C.optics.find(x => x.id === 'cat6-1g');
      addLine(bom, { category: 'Cable/Optic', vendor: 'Dell', item: cat6.desc, model: cat6.desc, qty: totalMgmt, mergeKey: 'mgmtcable',
        dellPN: cat6.dellPN, verify: cat6.verify, specConfirmed: cat6.specConfirmed, source: cat6.source, note: `OOB management cabling — host iDRAC/BMC + every switch mgmt port (${totalMgmt}), within-rack runs` });
      // Multi-rack OOB aggregation (backtest 2026-07-16 R3, maintainer ruling): each rack's OOB
      // switch uplinks to the CUSTOMER's existing out-of-band / management network — the standard
      // brownfield model. The old note cited a "spine-rack OOB", but the B6 rule removed the
      // dedicated spine rack, so there is no such switch to aggregate to (an isolated OOB island
      // is wrong for an incremental deal). A future greenfield deal with no existing mgmt network
      // is a NEW question to surface then, not a default to change now.
      if (racks > 1) addLine(bom, { category: 'Cable/Optic', vendor: 'Dell', item: cat6.desc + ' — OOB inter-rack uplinks', model: cat6.desc + ' — OOB inter-rack uplinks', qty: racks, mergeKey: 'mgmtuplink',
        dellPN: cat6.dellPN, verify: cat6.verify, specConfirmed: cat6.specConfirmed, source: cat6.source,
        note: `OOB aggregation — each rack's OOB switch uplinks to your existing out-of-band / management network (1 per rack × ${racks}); use fiber/SFP uplinks if row runs exceed ~90 m Cat6A` });
      fabrics.push({ network: 'mgmt', role: 'mgmt', speed: '1GbE', media: 'RJ45', workload: 'general', leaf: mgmtSw,
        totalLinks: totalMgmt, hostMgmt: mgmtLinks, switchMgmt, fabricsN: 1, perFabricLinks: totalMgmt, leavesPerFabric: qty, totalLeaves: qty, spine: null, spineCount: 0, oversub: null });
      mgmtInfo = { model: mgmtSw.model, qty, hostMgmt: mgmtLinks, switchMgmt };
    }

    /* 7. inter-network connectivity — uplinks to an existing core / another fabric / DCI.
     * NOTE: the border-leaf pair (if any) is created in step 6b ABOVE the OOB section so
     * its switches get management ports; here we just route the core optic from it. */
    let coreUplink = null;
    if (input.includeCoreUplink) {
      const coreSpeed = input.coreSpeed || '100GbE', coreGbps = speedToGbps(coreSpeed);
      // R6 (backtest 2026-07-16b, CRITICAL): in existing-core (spine-less) mode EVERY leaf pair
      // uplinks to the customer's core INDEPENDENTLY — the count scales with the leaves (2 per
      // MC-LAG pair = 1 per leaf), never a fixed 2. Fixed-2 stranded all but one pair with no uplink
      // path at all (8 leaves, 2 uplinks → 6 switches unreachable — an unbuildable BOM). Our-side
      // AND far-side both scale with it.
      const spinelessLeaves = uplinkTarget === 'existing-core'
        ? fabrics.filter(f => f.network !== 'mgmt' && !f.spine).reduce((s, f) => s + (f.totalLeaves || 0), 0) : 0;
      const coreCount = spinelessLeaves > 0 ? spinelessLeaves : Math.max(2, parseInt(input.coreCount, 10) || 2);
      const ctype = ['core', 'fabric', 'dci'].indexOf(input.coreType) >= 0 ? input.coreType : 'core';
      const layer = input.coreLayer === 'l2' ? 'l2' : 'l3';
      const proto = ['bgp', 'ospf', 'static'].indexOf(input.coreProtocol) >= 0 ? input.coreProtocol : 'bgp';
      const typeLabel = ctype === 'fabric' ? 'another fabric / pod' : ctype === 'dci' ? 'a second site (DCI)' : 'the existing core / backbone';
      const spinedFab = fabrics.find(f => f.spine && !f.dedicated) || fabrics.find(f => f.spine);

      // B2: when the spine is REUSED (flat 2-tier brownfield), its switch line is intentionally
      // dropped (customer already owns it) — so the note must name it as the customer's EXISTING
      // hardware, not cite a bare model as if it were a quoted line (the "ghost spine"). It's an
      // external endpoint (canonical design §1.3), never a switch BOM line.
      const srcSpineReused = reuseSpine && spinedFab && spinedFab.spine && !borderLeafInfo && !spinedFab.superSpine
        && !bom.some(b => b.category === 'Switch' && b.model === spinedFab.spine.model);
      const srcLeafFab = fabrics.find(f => f.network !== 'mgmt');
      const sourceTier = borderLeafInfo ? (borderLeafInfo.model + ' border-leaf pair')
        : spinedFab ? (spinedFab.superSpine ? spinedFab.superSpine.model + ' super-spine'
            : (srcSpineReused ? 'the existing (reused) ' + spinedFab.spine.model + ' spine' : spinedFab.spine.model + ' spine'))
        : ((srcLeafFab || { leaf: { model: 'ToR/border' } }).leaf.model + ' border-leaf');
      // R12: the REAL switch + port class the core optic plugs into — the same tier `sourceTier`
      // names above, resolved as objects so the form-factor check can see the actual cage. A
      // spine/border switch presents its core links on its ACCESS bank (these models have no
      // dedicated uplink class); a bare ToR border-leaf uses its uplink bank when it has one.
      // This is the pairing that was missing entirely: pickCoreOptic() only ever saw a speed, so
      // a 400G QSFP56-DD optic was quoted off a QSFP28-only S5232F-ON (backtest 16c, R12).
      const coreSrcSw = borderLeafInfo ? borderLeafInfo.sw
        : spinedFab ? (spinedFab.superSpine || spinedFab.spine)
        : (srcLeafFab ? srcLeafFab.leaf : null);
      const coreSrcPort = !coreSrcSw ? null
        : (!borderLeafInfo && !spinedFab && hasFabricUplink(coreSrcSw)) ? coreSrcSw.uplink : coreSrcSw.access;
      const coreSrcReused = !!(srcSpineReused && !borderLeafInfo);
      // Reach + far-end vendor: 'longreach' = 10 km single-mode LR/LR4 (inter-building/metro,
      // or a far-away third-party core); DCI (coreType:'dci') is UNCONDITIONALLY long-reach — a
      // second site/campus/metro link is never short-reach regardless of what coreReach was left
      // at. (Bug fixed 2026-07-23, R14 grill: the old clause read `ctype==='dci' && coreReach
      // !=='auto'` — but coreReach's only two values are 'auto'|'longreach' per INPUT-SCHEMA.md,
      // so that condition could only be true when coreReach was ALREADY 'longreach', meaning the
      // clause never changed the result. A DCI answer with coreReach left at its 'auto' default
      // was silently quoted with short-reach optics for a metro link.)
      // A THIRD-PARTY far end is fully supported — only OUR side's optic is quoted; the interop
      // rule is both ends run the SAME IEEE PMD (SR4↔SR4, LR4↔LR4), never "same brand".
      // coreFarPort (asked only when coreVendor=dell & the core model is unknown) tells us the far
      // port's reach — a single-mode/LC/LR far port means the whole link is long-reach (both ends
      // must match), which selects the LR optic instead of SR. This is what makes coreFarPort SIZING.
      const farPort = input.coreFarPort;
      const farLongReach = farPort && typeof farPort === 'object' && /SMF|single|LR|\bLC\b/i.test(`${farPort.media || ''} ${farPort.connector || ''} ${farPort.reach || ''}`);
      const longReach = input.coreReach === 'longreach' || ctype === 'dci' || (coreVendor === 'dell' && farLongReach);
      // J3 far-side handoff by coreVendor (see the input parsing above).
      const includeFar = coreVendor === 'dell';                       // Dell-into-Dell → far-side optics quotable
      const farVerify = includeFar && !coreFarModel && (!farPort || farPort === 'unknown');
      const farModelName = coreFarModel ? (C.switches.find(s => s.id === coreFarModel || s.model === coreFarModel) || {}).model : null;
      const coreOptic = ctype === 'dci' ? pickCoreOptic(coreGbps >= 400 ? 400 : 100, longReach) : pickCoreOptic(coreGbps, longReach);
      if (coreOptic) {
        // The far side runs the SAME link type (both ends must be the same IEEE PMD). Name the
        // concrete part-class in plain language so the customer's network team can act on it.
        const linkClass = coreOptic.model + '-class';
        const handoff = includeFar
          ? `BOTH sides quoted — Dell ${coreOptic.model} into a Dell core${farModelName ? ' (' + farModelName + ')' : ''}${farVerify ? '; far-side port matched to ours — VERIFY the core port type/speed' : ''}`
          : coreVendor === 'other'
            ? `OUR side only. You supply the far-side optics: your core vendor's part for the same link type (a ${linkClass} optic in your vendor's format) — by customer`
            : `OUR side only. Far-side optics to VERIFY once the core vendor & port are confirmed`;
        addLine(bom, { category: 'Cable/Optic', vendor: 'Dell', item: coreOptic.desc + ' — inter-network', model: coreOptic.desc + ' — inter-network', qty: coreCount, mergeKey: 'core',
          dellPN: coreOptic.dellPN, verify: coreOptic.verify, specConfirmed: coreOptic.specConfirmed, source: coreOptic.source,
          note: `Inter-network uplink from ${sourceTier} to ${typeLabel} — ${coreCount}× ${coreSpeed} (redundant, ${layer === 'l3' ? 'L3 routed via ' + proto.toUpperCase() : 'L2 stretched (EVPN-VXLAN)'}); ${handoff}${ctype === 'dci' ? '; DCI: confirm distance/optics (long-range/coherent) & MACsec' : ''}.` });
        // Dell-into-Dell: the matched FAR-side transceiver is quotable (the fiber cords below are
        // 2/link = both ends, so no extra cords needed — only the second optic).
        if (includeFar) addLine(bom, { category: 'Cable/Optic', vendor: 'Dell', item: coreOptic.desc + ' — inter-network (far side)', model: coreOptic.desc + ' — inter-network (far side)', qty: coreCount, mergeKey: 'core-far',
          dellPN: coreOptic.dellPN, verify: farVerify || coreOptic.verify, specConfirmed: !farVerify && coreOptic.specConfirmed, source: coreOptic.source,
          note: `Far-side (core) optic — ${coreCount}× ${coreSpeed}, matched to our side (${coreOptic.model}${farModelName ? ', into a ' + farModelName : ''}). ${farVerify ? 'VERIFY the core port type/speed before ordering.' : 'Dell part into a Dell core.'}` });
        // A standalone transceiver rides fiber, not an integrated cable — the patch cords are a
        // separate, real line item (one per end per link; connector & fiber type match the optic).
        if (coreOptic.category === 'transceiver') {
          const pc = fiberCordFor(coreOptic);
          if (pc) addLine(bom, { category: 'Cable/Optic', vendor: 'Structured', item: pc.desc + ' — inter-network', model: pc.desc + ' — inter-network', qty: coreCount * 2, mergeKey: 'core-patch',
            dellPN: pc.dellPN, verify: pc.verify, specConfirmed: pc.specConfirmed, source: pc.source,
            note: `Fiber patch cords for the inter-network uplink — 2 per link × ${coreCount} links (one each end). ${longReach ? 'OS2 single-mode (LR/LR4 optic)' : (/SMF/i.test(coreOptic.reach || '') ? 'OS2 single-mode to match the optic' : 'OM4 multimode')}; a run through patch panels also needs the passive plant (trunk/cassettes) — by facilities unless quoted.` });
        }
        if (coreVendor === 'other') warnings.push({ severity: 'info',
          message: `Inter-network uplink lands on ANOTHER VENDOR's core: optics interoperate by IEEE 802.3 link type, not by brand — the far side must run the SAME link type as ours (a ${linkClass} optic: LR4↔LR4, SR4↔SR4, FR↔FR), over the same fiber & wavelength. We quote the Dell optic for OUR port; the far side supplies its own vendor's matching optic (third-party switches commonly require their own branded/coded optics). Confirm the far-end port type & speed before ordering.`,
          source: 'IEEE 802.3 PMD interop · Dell Networking Transceivers & Cables Spec Sheet 2026' });
        else if (coreVendor === 'unsure') warnings.push({ severity: 'info',
          message: `Core vendor not yet confirmed: quoting OUR side only, far side left to verify. If the core is Dell PowerSwitch we can quote the matched far-side optic too; if it's another vendor, the far side supplies a ${linkClass}-equivalent optic in their format. Confirm the core switch model/port before ordering.`,
          source: 'IEEE 802.3 PMD interop · Dell Networking Transceivers & Cables Spec Sheet 2026' });
      }
      else warnings.push({ severity: 'warn', message: `Core/inter-network uplink: no cataloged optic for ${coreSpeed} — this speed is beyond current catalog coverage. Engage Dell Advanced Engineering / Services to confirm optics before quoting.`, source: R.leafSpine.source });

      // AMENDMENT 2 (2026-07-16): existing-core mode consumes ports on the CUSTOMER's core. The
      // `core` line above is only our handoff transceiver count — the TRUE demand is every leaf's
      // uplinks landing on the core. State it (the Q1 confirm asks it; the engine does the math),
      // warn-severity once it's large enough that a self-contained spine is the cleaner build.
      // R7 (backtest 2026-07-16b): surface the core-port cost, and it MUST equal the actual uplink
      // count (R6's `coreCount`) — the two were computed differently before (this note said 16 while
      // only 2 uplinks were built). One number now: every leaf pair uplinks 2× → `coreCount` ports.
      if (uplinkTarget === 'existing-core' && coreCount > 0) {
        const totLeaves = fabrics.filter(f => f.network !== 'mgmt' && !f.spine).reduce((s, f) => s + (f.totalLeaves || 0), 0);
        const big = coreCount > 16;   // beyond ~16 core ports a new spine (self-contained pod) is usually cheaper/cleaner
        warnings.push({ severity: big ? 'warn' : 'info',
          message: `Existing-core uplink: ${totLeaves} leaf switch(es) uplink to your existing core — ${coreCount}× ${coreSpeed} FREE ports needed there (2 per MC-LAG pair, redundant). Confirm the core has that capacity${big ? ` — at ${coreCount} ports, a new spine tier (uplinkTarget "new spine") is usually cheaper/cleaner than consuming that many core ports.` : '.'}`,
          source: 'Leaf-uplink port math · existing-core handoff' });
      }
      coreUplink = { enabled: true, speed: coreSpeed, count: coreCount, source: sourceTier, gbps: coreGbps, type: ctype, typeLabel, layer, protocol: proto, borderLeaf: borderLeafInfo, longReach, coreVendor, includeFar,
        // R12 form-factor check inputs: the optic we picked + the port it must seat in.
        opticId: coreOptic ? coreOptic.id : null, srcSw: coreSrcSw, srcPort: coreSrcPort, srcReused: coreSrcReused };
    }

    const totalUnits = targets.reduce((s, t) => s + t.units, 0);

    // R5 (backtest 2026-07-16): NICs are quoted with the SERVER configuration, not by this network
    // BOM — BUT the demand source must be VISIBLE so the dependency is explicit. (a) The header lists
    // EVERY NIC with the true total ports/unit; (b) one UNPRICED reference line per NIC per target so
    // a reviewer sees exactly what drives each fabric — if the server quote drops a NIC, re-run this.
    // A summary that under-reports the input makes correct hardware look wrong (this nearly caused a
    // false defect report). `nicSummary` + the reference lines are what the input-summary invariant checks.
    const allNics = [];
    targets.forEach(t => { [t.nic, t.nic2].forEach(n => { if (n) allNics.push({ target: t, nic: n }); }); });
    allNics.forEach(({ target: t, nic: n }) => {
      addLine(bom, { category: 'Reference', vendor: n.vendor || 'per server config', unpriced: true,
        item: `${t.units}× ${(n.vendor || '').trim()} ${n.portsPerNic}-port ${n.speed} NIC`.replace(/\s+/g, ' ').trim(),
        model: '', qty: t.units, mergeKey: 'ref-nic|' + (t.uid != null ? t.uid : t.id) + '|' + n.speed + '|' + (n.network || 'primary'),
        note: `Reference only — NICs are quoted with the server configuration, NOT this network BOM. This ${n.speed} NIC (${n.portsPerUnit} ports/unit) is the demand source for its fabric; if the server quote changes NICs, re-run this network BOM.` });
    });
    const primaryPorts = (targets[0].nic ? targets[0].nic.portsPerUnit : 0) + (targets[0].nic2 ? targets[0].nic2.portsPerUnit : 0);
    const nicSummary = allNics.length ? allNics.map(x => x.nic.label).join('  +  ') : (nic ? nic.label : '');

    const sharedGrp = groups['shared|dell'] || groups['shared|nvidia'];
    const result = {
      platform: targets[0].platform, targets,
      context: {
        units: totalUnits, headroom, redundancy: wantDual ? 'dual' : 'single', nos, aiStack, separate, media,
        fabricArchitecture: fabricArch, converged,
        placement, placementLabel: placeDef.label || placement, structuredInPlace, racks, leaf100, leaf25,
        breakout, oversubTarget: genOversub, trafficProfile, roadmap, deploy, reuseSpine, uplinkTarget, coreVendor, coreFarModel, storageProtocol, aiTransport,
        borderLeaf: borderLeafInfo,
        nic: nic, nics: allNics.map(x => x.nic), nicSummary, nicPortsPerUnit: primaryPorts,
        targetsLabel: targets.map(t => t.label).join('  +  ')
      },
      fabrics, bom, warnings, coreUplink, mgmt: mgmtInfo,
      sharedSpine: (sharedGrp && sharedGrp.spine) ? { model: sharedGrp.spine.model, count: sharedGrp.spineCount, vendor: sharedGrp.spine.vendor } : null,
      allAi
    };
    if (window.validateBOM) window.validateBOM(result);
    return result;
  }

  /* ---- prescriptive reference-architecture path ------------------------ */
  // `opts.railNicCage` ('osfp' | 'qsfp112'): the GPU rail NIC's cage. Required on the COMPUTED path
  // whenever the rails land on a twin-port-OSFP switch, because the 1:2 splitter differs by far end
  // (MCP7Y00 = 2× OSFP, MCP7Y10 = 2× QSFP112) and guessing ships an unbuildable cable — so it is
  // never defaulted (ruling 2026-07-16d(a)). An RA that CITES its NIC cage may declare `railNicCage`
  // in its own data; otherwise the caller must supply it. Third param is optional/back-compatible.
  function recommendRA(raId, nodes, opts) {
    const ra = C.referenceArchitectures.find(r => r.id === raId);
    if (!ra) throw new Error('Unknown reference architecture: ' + raId);
    opts = opts || {};
    // DERIVE-THEN-ASK (ruling 2026-07-16d(a)): an explicit answer wins; else an RA that CITES its
    // NIC cage supplies it (the GB300 RA says "the ConnectX-8 OSFP port"); else derive from a NIC
    // model the vendor pins to a cage; else 'unsure' — quote the OSFP variant VERIFY-flagged rather
    // than block, since these RA briefs genuinely don't state the connector.
    const railNicCage = ['osfp', 'qsfp112', 'unsure'].indexOf(opts.railNicCage) >= 0 ? opts.railNicCage
      : (ra.railNicCage || (C.formFactor && C.formFactor.railNicCageOf(opts.railNicModel || ra.railNicModel)) || 'unsure');
    // Silently clamping a request beyond this RA's endorsed scale used to leave no trace in the
    // result — every RA's own scaleNote says larger clusters ARE possible ("REQUIRE additional
    // network switching"), so a rep could quote far fewer nodes than requested with zero
    // indication anything was reduced. Track the REQUESTED count and flag the truncation.
    const requested = Math.max(1, parseInt(nodes, 10) || ra.maxGpuNodes);
    const n = Math.min(ra.maxGpuNodes, requested);
    const truncated = requested > ra.maxGpuNodes;

    const R = C.rules, sn2201 = C.switches.find(s => s.id === 'sn2201');

    /* ---- PUBLISHED scaling path: the RA doc's own per-SU switch/cable counts ---- */
    if (ra.published) {
      const pub = ra.published(n);
      const leaf = C.switches.find(s => s.model === pub.fabric.leafModel);
      const bom = ra.bom.filter(l => l.category !== 'Switch' && l.category !== 'Management' && l.category !== 'Cable/Optic').map(l => {
        let qty = l.qty; if (l.qtyExpr === 'nodes') qty = n; else if (l.qtyExpr === 'perEra') qty = 'per ERA';
        return Object.assign({}, l, { qty, source: l.source || ra.source });
      });
      pub.switches.forEach((s, i) => bom.push({ category: 'Switch', vendor: leaf.vendor, item: s.model, model: s.model, qty: s.qty,
        mergeKey: 'pub-sw-' + i, dellPN: leaf.dellPN, verify: leaf.verify, specConfirmed: leaf.specConfirmed, source: ra.source, note: s.note }));
      // R12: collect the optic ids this RA resolved. EVERY cable on this path lands on the SAME
      // switch model (leaf === spine on a rail-optimized RA fabric), so validate.js #23 checks
      // each of them against that switch's access cage.
      const pubOpticIds = [], pubWarn = [];   // collected before `result` exists — merged below
      pub.cables.forEach((cb, i) => {
        // A published RA may NAME its own part (`opticId`) — when it does, that wins outright: this
        // path exists to reproduce the endorsed document's own cabling, and a general engine ruling
        // never overrides a cited RA (SPEC: published RAs defer to their document; a conflict is a
        // stop-and-ask). Only fall back to the generic ladder when the RA doesn't specify.
        const oc = (cb.opticId && C.optics.find(o => o.id === cb.opticId))
          || pickHostCable(cb.speed, 'in-rack', true, false, leaf && leaf.access)
          || pickUplinkCable(cb.speed, true);
        if (!oc) {
          pubWarn.push({ severity: 'warn', message: `${ra.name}: no cataloged NVIDIA optic for the ${cb.speed}G link this RA lists (${cb.qty} link(s)) — that cabling is NOT on the BOM. Engage Dell Advanced Engineering / Services to confirm the part before quoting.`, source: ra.source });
          return;
        }
        pubOpticIds.push(oc.id);
        // QUANTITY SEMANTICS (ruling 2026-07-16d(b)): a twin-port / 1:2 assembly carries `n` LINKS,
        // so the ordered quantity is links ÷ linksPerAssembly — never one-per-link. `bothEnds` adds
        // the far-end module (a transceiver terminates per end; a DAC/splitter is one physical part
        // with both ends attached). cb.qty is always the honest LINK count; assemblies derive from it.
        const lpa = cb.linksPerAssembly || 1;
        const perEnd = Math.ceil(cb.qty / lpa);
        const qty = cb.bothEnds ? perEnd * 2 : perEnd;
        bom.push({ category: 'Cable/Optic', vendor: oc.vendor || 'NVIDIA', item: oc.desc, model: oc.desc, qty,
          mergeKey: 'pub-cb-' + i, dellPN: oc.dellPN, verify: oc.verify, specConfirmed: oc.specConfirmed, source: oc.source,
          note: cb.note + (lpa > 1 ? ` · ARITHMETIC: ${cb.qty} links ÷ ${lpa} per assembly = ${perEnd}${cb.bothEnds ? ` per end × 2 ends = ${qty}` : ` = ${qty}`}` : '') });
      });
      const mgmtN = (pub.fabric.mgmtNodes || n) + pub.switches.reduce((s, x) => s + x.qty, 0);
      const oobQty = Math.max(1, Math.ceil(mgmtN / ((sn2201.access && sn2201.access.count) || 48)));
      bom.push({ category: 'Management', vendor: sn2201.vendor, item: sn2201.model, model: sn2201.model, qty: oobQty,
        dellPN: sn2201.dellPN, verify: sn2201.verify, specConfirmed: sn2201.specConfirmed, source: ra.source, note: `OOB management — ${pub.fabric.mgmtNodes || n} node + switch mgmt ports (all nodes to 1G mgmt switches per RA)` });
      const cat6 = C.optics.find(o => o.id === 'cat6-1g');
      if (cat6) bom.push({ category: 'Cable/Optic', vendor: 'Dell', item: cat6.desc, model: cat6.desc, qty: mgmtN, mergeKey: 'pub-mgmt',
        dellPN: cat6.dellPN, verify: cat6.verify, specConfirmed: cat6.specConfirmed, source: cat6.source, note: 'OOB management cabling (mgmt)' });
      const platform = { id: 'ra-' + ra.id, family: 'Dell AI Factory + NVIDIA', model: ra.name, requires: ra.designPoints, concerns: [ra.scaleNote], source: ra.source, workload: 'ai' };
      const fabrics = [
        { network: 'aifabric', role: 'aifabric', speed: pub.fabric.railSpeed, media: 'OSFP', workload: 'ai', targetId: platform.id, targetFamily: 'AI Factory', targetLabel: n + '× ' + (ra.gpuOptions || 'NVL72 rack'), stack: 'nvidia',
          totalLinks: pub.fabric.totalLinks, linksPerUnit: pub.fabric.linksPerUnit, unitsN: n, connector: 'OSFP', fabricsN: 1, perFabricLinks: pub.fabric.totalLinks,
          leaf, leavesPerFabric: pub.fabric.totalLeaves, totalLeaves: pub.fabric.totalLeaves, spine: leaf, spineCount: pub.fabric.spineCount, spineGroupKey: 'ai',
          oversub: 1.0, oversubTarget: 1.0, nonBlocking: true, redundancyMethod: 'evpn-mh', interconnectQty: 0,
          opticIds: [...new Set(pubOpticIds)],   // R12 — every optic on this fabric seats in `leaf`'s access cage
          uplinksPerLeaf: pub.fabric.uplinksPerLeaf || 0, uplinkSpeed: pub.fabric.railSpeed, uplinkCableQty: pub.fabric.uplinkCableQty || 0 },
        { network: 'mgmt', role: 'mgmt', speed: '1GbE', media: 'RJ45', workload: 'general', leaf: sn2201, totalLinks: mgmtN, fabricsN: 1, perFabricLinks: mgmtN, leavesPerFabric: oobQty, totalLeaves: oobQty, spine: null, spineCount: 0, oversub: null }
      ];
      const result = { platform, targets: [{ platform, units: n, label: n + '× GB300 NVL72 rack', shortLabel: n + '× NVL72' }],
        context: { units: n, headroom: 0, redundancy: 'dual', nonBlocking: true, targetsLabel: n + ' SU · ' + (n * ra.gpusPerNode) + ' GPUs' }, fabrics, bom, warnings: [], isRA: true, ra, coreUplink: null, sharedSpine: null, mgmt: { model: sn2201.model, qty: oobQty } };
      pubWarn.forEach(w => result.warnings.push(w));
      result.warnings.push({ severity: 'info', message: '✓ ' + ra.endorsement, source: ra.source });
      if (truncated) result.warnings.unshift({ severity: 'warn',
        message: `Requested ${requested} node(s) exceeds this RA's endorsed/validated scale of ${ra.maxGpuNodes} — sized DOWN to ${ra.maxGpuNodes}. ${ra.scaleNote}`,
        source: ra.source });
      // STOP-GAP (G-010, 2026-07-15): this path quotes EVERY cable — including cross-block
      // leaf-to-spine links — as ≤3m in-rack DAC regardless of scale, even though the RA's OWN
      // published() note says leaves "serve 2 racks (underpopulated by design)" once n>1 spans
      // multiple SUs/racks. Flag it explicitly rather than silently mis-quoting reach; a full
      // rack-placement redesign of this path (threading `racks` through like recommend() does)
      // is a separate, larger follow-up — not attempted here.
      if (n > 1) result.warnings.push({ severity: 'warn',
        message: `This RA path does not yet model physical rack placement — all cables (including GPU compute uplinks and leaf-to-spine links) are quoted as in-rack DAC (≤3m) for all ${n} SU(s)/racks. Per this RA's own design ("leaves serve 2 racks"), some leaf-to-spine and inter-rack links will actually need AOC/optical reach — confirm cable lengths against the real rack layout before quoting.`,
        source: ra.source });
      result.warnings.push({ severity: 'info', message: `PUBLISHED scaling applied: ${n} SU → ${pub.switches.map(s => s.qty + '× ' + s.model + ' (' + s.note.split('—')[0].trim() + ')').join(' + ')}. Counts follow the RA's per-SU tables — validate against RA Tables 6/7 before quoting.`, source: ra.source });
      if (window.validateBOM) window.validateBOM(result);
      return result;
    }

    const railSpeed = ra.railSpeed || (/800/.test(ra.gpuNetSpeeds || '') ? '800GbE' : '400GbE');
    const railGbps = speedToGbps(railSpeed), rails = n * ra.gpusPerNode;

    // ---- SCALE the rail-optimized compute fabric with node count (folded Clos) ----
    // Use the RA's PRESCRIBED switch (high-radix, e.g. SN5610) so the design point matches the brief.
    const raSwitch = ra.bom.find(l => l.category === 'Switch');
    const leaf = (raSwitch && C.switches.find(s => s.model === raSwitch.model)) || pickLeaf(railGbps, 'ai', 'nvidia');
    const accGbps = speedToGbps(leaf.access && leaf.access.speed) || railGbps;
    const radix = Math.max(1, Math.floor(((leaf.access && leaf.access.count) || 64) * (accGbps / railGbps)));
    const folded = rails > radix;                                   // needs a spine tier
    const cap = folded ? Math.max(1, Math.floor(radix / 2)) : radix;   // half-down when folded
    const leaves = Math.max(2, Math.ceil(rails / cap));
    let spine = null, spineCount = 0, superSpine = false, uplinksPerLeaf = 0;
    if (leaves > 2) {
      spine = pickSpine(railGbps, 'ai', 'nvidia');
      uplinksPerLeaf = Math.max(2, Math.min(Math.floor(radix / 2), Math.ceil(rails / leaves)));   // 1:1 non-blocking
      spineCount = Math.max(2, Math.min(R.leafSpine.maxSpines || 8, uplinksPerLeaf));
      superSpine = rails > (R.aiFabric.twoTierGpuScale || 2000);
    }
    const mgmtN = n + leaves + spineCount, oobQty = Math.max(1, Math.ceil(mgmtN / ((sn2201.access && sn2201.access.count) || 48)));

    // prescriptive compute + storage from ra.bom; network switches + cabling are COMPUTED (scale)
    const bom = ra.bom.filter(l => l.category !== 'Switch' && l.category !== 'Management' && l.category !== 'Cable/Optic').map(l => {
      let qty = l.qty; if (l.qtyExpr === 'nodes') qty = n; else if (l.qtyExpr === 'perEra') qty = 'per ERA';
      return Object.assign({}, l, { qty, source: l.source || ra.source });
    });
    const add = l => addLine(bom, l);
    add({ category: 'Switch', vendor: leaf.vendor, item: leaf.model, model: leaf.model, qty: leaves, dellPN: leaf.dellPN, verify: leaf.verify, specConfirmed: leaf.specConfirmed, source: ra.source,
      note: `Rail-optimized ${railSpeed} ${leaves > 2 ? 'leaf' : 'compute'} switch — ${rails} GPU rails${folded ? ' (folded Clos: half-down / half-up)' : ' (collapsed pair)'} · ${leaf.switchingCapacity}` });
    if (spine) add({ category: 'Switch', vendor: spine.vendor, item: spine.model, model: spine.model, qty: spineCount, dellPN: spine.dellPN, verify: spine.verify, specConfirmed: spine.specConfirmed, source: ra.source,
      note: `Spine — non-blocking ${uplinksPerLeaf}×${railSpeed}/leaf${superSpine ? '; add SUPER-SPINE (3-tier) at this scale' : ''} · ${spine.switchingCapacity}` });
    add({ category: 'Management', vendor: sn2201.vendor, item: sn2201.model, model: sn2201.model, qty: oobQty, dellPN: sn2201.dellPN, verify: sn2201.verify, specConfirmed: sn2201.specConfirmed, source: ra.source, note: `OOB management — ${n} node + ${leaves + spineCount} fabric-switch mgmt ports` });
    // this path collects warnings BEFORE `result` exists — merged into result.warnings below
    const raWarn = [];
    // GPU rails — the cable must seat in THIS leaf's cage, and on a twin-port-OSFP leaf the 1:2
    // splitter is chosen by the rail NIC's cage (never defaulted). See pickHostCable().
    const hc = pickHostCable(railGbps, 'in-rack', true, false, leaf && leaf.access, railNicCage);
    const hcLpa = (hc && hc.railsPerAssembly) || 1;   // 1 splitter = 2 rails (ruling 2026-07-16d(b))
    const hcQty = Math.ceil(rails / hcLpa);
    const cageUnsure = railNicCage === 'unsure' && !!(hc && hc.farCageVariant);
    if (hc) add({ category: 'Cable/Optic', vendor: hc.vendor || 'NVIDIA', item: hc.desc, model: hc.desc, qty: hcQty, mergeKey: 'ra-rail', dellPN: hc.dellPN,
      linksPerAssembly: hcLpa, coversLinks: rails,   // P13: qty × linksPerAssembly = rails
      verify: cageUnsure ? true : hc.verify, specConfirmed: cageUnsure ? false : hc.specConfirmed, source: hc.source,
      note: `GPU rail cabling (NVIDIA LinkX) — ${rails} rails @ ${railSpeed}; Host-to-leaf aifabric`
        + (hcLpa > 1 ? ` · ARITHMETIC: 1 splitter carries ${hcLpa} rails → ${rails} rails ÷ ${hcLpa} = ${hcQty} assemblies` : '')
        + (cageUnsure ? ' · ⚠ NIC CONNECTOR NOT CONFIRMED: quoted as MCP7Y00 (far end 2× OSFP). If the GPU NICs are QSFP112 (e.g. BlueField-3, or a QSFP112 ConnectX-7/-8), the correct part is MCP7Y10 — same price class, different connector. VERIFY before ordering.'
          : (hcLpa > 1 ? ` (far end = ${railNicCage === 'osfp' ? 'OSFP' : 'QSFP112'} NIC)` : '')) });
    if (cageUnsure) raWarn.push({ severity: 'verify', message: `GPU rail cabling: this RA's brief does not state the GPU NIC's connector, and the 1:2 rail splitter differs by it — MCP7Y00 (2× OSFP) vs MCP7Y10 (2× QSFP112). Quoted as MCP7Y00 and flagged: CONFIRM the NIC connector with the customer before ordering. They are not interchangeable, but the swap is a like-for-like part change (no design/qty impact).`, source: 'NVIDIA LinkX 1:2 splitter selection (corpus NV-LINKX-400G-COMBO) · R12 ruling 2026-07-16d(a)' });
    else if (railGbps === 400 && C.formFactor && C.formFactor.cagesOf(leaf.access.media).indexOf('OSFP') >= 0 && !railNicCage)
      raWarn.push({ severity: 'error', message: `GPU rail cabling: the ${leaf.model} presents 400G rails on twin-port OSFP cages, which need a 1:2 splitter — but the part depends on the GPU NIC's connector and this RA does not state it. MCP7Y00 (far end 2× OSFP, e.g. an OSFP ConnectX-7/-8) and MCP7Y10 (far end 2× QSFP112, e.g. QSFP112 ConnectX-7 / BlueField-3) are NOT interchangeable. CONFIRM the rail NIC cage with the customer and re-run — no rail cable is quoted until then, because guessing here ships a cable that cannot plug in.`, source: 'NVIDIA LinkX 1:2 splitter selection (corpus NV-LINKX-400G-COMBO) · R12 ruling 2026-07-16d' });
    if (spine) { const uc = pickUplinkCable(railGbps, true); if (uc) { const ucLinks = leaves * uplinksPerLeaf, uc2 = uc.category === 'transceiver'; add({ category: 'Cable/Optic', vendor: uc.vendor || 'NVIDIA', item: uc.desc, model: uc.desc, qty: uc2 ? ucLinks * 2 : ucLinks, mergeKey: 'ra-up', dellPN: uc.dellPN, verify: uc.verify, specConfirmed: uc.specConfirmed, source: uc.source, note: `Leaf-to-spine uplinks (NVIDIA LinkX) — ${uplinksPerLeaf}/leaf × ${leaves} @ ${railSpeed} (non-blocking)${uc2 ? ` · ${ucLinks} links × 2 optics (leaf end + spine end) + MPO fiber per link (by others)` : ''}; aifabric` }); } }
    // collapsed 2-switch pair (no spine): the two switches interconnect for non-blocking (rails/2 links)
    const islQty = (!spine && leaves === 2) ? Math.ceil(rails / leaves) : 0;
    // Inter-switch: BOTH ends are switch cages, so on a twin-port-OSFP pair the splitter's far end
    // is OSFP by definition (no NIC involved) — that is data, not a default.
    const islCage = (C.formFactor && leaf.access && C.formFactor.cagesOf(leaf.access.media).indexOf('OSFP') >= 0) ? 'osfp' : railNicCage;
    const isw = islQty ? pickHostCable(railGbps, 'in-rack', true, false, leaf && leaf.access, islCage) : null;
    const iswLpa = (isw && isw.railsPerAssembly) || 1;
    const iswQty = Math.ceil(islQty / iswLpa);
    if (isw) add({ category: 'Cable/Optic', vendor: isw.vendor || 'NVIDIA', item: isw.desc + ' — inter-switch', model: isw.desc + ' — inter-switch', qty: iswQty, mergeKey: 'ra-isl', dellPN: isw.dellPN, verify: isw.verify, specConfirmed: isw.specConfirmed, source: isw.source,
      note: `Inter-switch links (collapsed non-blocking pair) — ${islQty}× ${railSpeed}` + (iswLpa > 1 ? ` · ARITHMETIC: ${islQty} links ÷ ${iswLpa} per assembly = ${iswQty}` : '') });
    const cat6 = C.optics.find(o => o.id === 'cat6-1g');
    if (cat6) add({ category: 'Cable/Optic', vendor: 'Dell', item: cat6.desc, model: cat6.desc, qty: mgmtN, mergeKey: 'ra-mgmt', dellPN: cat6.dellPN, verify: cat6.verify, specConfirmed: cat6.specConfirmed, source: cat6.source, note: 'OOB management cabling (mgmt)' });

    const platform = { id: 'ra-' + ra.id, family: 'Dell AI Factory + NVIDIA', model: ra.name, requires: ra.designPoints, concerns: [ra.scaleNote], source: ra.source, workload: 'ai' };
    const fabrics = [
      { network: 'aifabric', role: 'aifabric', speed: railSpeed, media: 'OSFP', workload: 'ai', targetId: platform.id, targetFamily: 'AI Factory', targetLabel: n + '× ' + (ra.gpuOptions || 'GPU node'), stack: 'nvidia',
        totalLinks: rails, linksPerUnit: ra.gpusPerNode, unitsN: n, connector: 'OSFP', fabricsN: 1, perFabricLinks: rails, leaf, leavesPerFabric: leaves, totalLeaves: leaves,
        spine, spineCount, spineGroupKey: 'ai', oversub: spine ? 1.0 : null, oversubTarget: 1.0, nonBlocking: true, aiFolded: folded, redundancyMethod: 'evpn-mh',
        interconnectQty: islQty, interconnectSpeed: railSpeed, uplinksPerLeaf, uplinkSpeed: railSpeed, uplinkCableQty: spine ? leaves * uplinksPerLeaf : 0,
        // R12 — rail/uplink/ISL optics all seat in this fabric's switch cages (leaf, and spine when folded)
        hostCableId: hc ? hc.id : null, iclCableId: isw ? isw.id : null,
        uplinkCableId: spine ? (pickUplinkCable(railGbps, true) || {}).id || null : null },
      { network: 'mgmt', role: 'mgmt', speed: '1GbE', media: 'RJ45', workload: 'general', leaf: sn2201, totalLinks: mgmtN, fabricsN: 1, perFabricLinks: mgmtN, leavesPerFabric: oobQty, totalLeaves: oobQty, spine: null, spineCount: 0, oversub: null }
    ];
    const result = { platform, targets: [{ platform, units: n, label: n + '× ' + (ra.gpuOptions || 'GPU node'), shortLabel: n + '× AI Factory' }],
      context: { units: n, headroom: 0, redundancy: 'dual', nonBlocking: true, targetsLabel: n + ' node(s) · ' + rails + ' GPUs' }, fabrics, bom, warnings: [], isRA: true, ra, coreUplink: null, sharedSpine: null, mgmt: { model: sn2201.model, qty: oobQty } };
    raWarn.forEach(w => result.warnings.push(w));   // collected before `result` existed
    result.warnings.push({ severity: 'info', message: '✓ ' + ra.endorsement, source: ra.source });
    if (truncated) result.warnings.unshift({ severity: 'warn',
      message: `Requested ${requested} node(s) exceeds this RA's endorsed/validated scale of ${ra.maxGpuNodes} — sized DOWN to ${ra.maxGpuNodes}. ${ra.scaleNote}`,
      source: ra.source });
    result.warnings.push({ severity: 'info', message: `Rail-optimized ${railSpeed} fabric SIZED for ${n} node(s) / ${rails} GPUs: ${leaves} ${leaves > 2 ? 'leaf switches + ' + spineCount + ' spine(s)' : 'switches (collapsed pair, non-blocking)'}${superSpine ? ' + super-spine (3-tier)' : ''}. Prescriptive compute/storage is fixed; validate the switch count against the ERA scaling table.`, source: ra.source });
    if (superSpine) result.warnings.push({ severity: 'warn', message: `${rails} GPUs exceed the ~${R.aiFabric.twoTierGpuScale}-GPU two-tier reach — this needs a 3-tier Clos with super-spines.`, source: R.aiFabric.source });
    if (window.validateBOM) window.validateBOM(result);
    return result;
  }

  /* ---- edge / campus access-layer path --------------------------------
   * Client endpoints -> E-series PoE access switches deployed as SONiC MC-LAG
   * PAIRS (ICL peer-link between the two) -> uplink to an MC-LAG distribution
   * pair (or existing core). E-series campus = Dell Enterprise SONiC ONLY
   * (SmartFabric OS10 is end-of-sale for the E-series; MC-LAG, not VLT/stacking). */
  function recommendEdge(input) {
    const R = C.rules, byId = id => C.switches.find(s => s.id === id);
    const endpoints = Math.min(100000, Math.max(1, parseInt(input.endpoints, 10) || 48));
    const poe = ['none', 'poe+', 'poe++'].indexOf(input.poe) >= 0 ? input.poe : 'poe+';
    const accessSpeed = ['mgig', '1g', 'fiber'].indexOf(input.accessSpeed) >= 0 ? input.accessSpeed : (poe === 'poe++' ? 'mgig' : (poe === 'none' ? 'fiber' : '1g'));
    const redundant = input.edgeRedundancy !== 'single';
    const newDist = input.distribution !== 'existing';
    const method = redundant ? 'mclag' : null;   // SONiC MC-LAG (E-series edge is deliberately SONiC-only — no VLT/OS10 here, see note below)

    // access switch by PoE / speed
    const acc = (accessSpeed === 'mgig' || poe === 'poe++') ? byId('e3248pxe-on')
      : (accessSpeed === 'fiber' || poe === 'none') ? byId('e3224f-on') : byId('e3248p-on');
    // E3224F-ON (fiber) is OS10-ONLY — absent from the Enterprise SONiC compatibility matrix, so a
    // SONiC MC-LAG pair is genuinely NOT possible on this model (confirmed: Table 7). This is a real
    // Dell portfolio gap (no fiber-SFP E-series switch has a SONiC MC-LAG path today), not something
    // to paper over with VLT/OS10 — this edge product line is deliberately SONiC-only end-to-end (no
    // stacking, no OS10) per the compatibility matrix. So: still spec the requested switch count, but
    // do NOT price a peer-link that cannot actually be configured — the error below is the actionable
    // signal, not a silently "valid-looking" BOM.
    const e3224fBroken = acc.id === 'e3224f-on' && redundant;
    const perSw = (acc.access && acc.access.count) || 48;
    let accessSwitches = Math.ceil(endpoints / perSw);
    if (redundant && accessSwitches % 2 === 1) accessSwitches += 1;   // deploy as MC-LAG pairs
    const pairs = redundant ? accessSwitches / 2 : 0;

    // Every E-series access switch has TWO uplink classes: 4× SFP+/SFP28 (10G on E3248P/E3224F,
    // 25G on E3248PXE) AND 2× 100G QSFP28 (rear) — the SITUATION picks which one uplinks:
    //   '100g' (default) — 100G rear pair uplinks; the 4× SFP ports carry the MC-LAG ICL
    //                      (sub-100G ICL needs ≥4 links per h04504).
    //   'sfp'            — the 4× SFP ports uplink (existing 10/25G aggregation, budget sites);
    //                      the 100G rear pair carries the ICL (≥100G ICL needs only 2 links).
    const sfpUplink = input.edgeUplink === 'sfp';
    const altSpeed = (acc.uplinkAlt && acc.uplinkAlt.speed) || '10GbE';
    const iclSpeed = sfpUplink ? '100GbE' : altSpeed;
    const iclPerPair = sfpUplink ? (R.redundancy.interconnectLinksPerPair || 2)
      : (R.redundancy.interconnectLinksPerPairSub100 || 4);   // PUBLISHED (h04504): sub-100G ICL needs ≥4 links
    const iclOptic = C.optics.find(o => o.id === (iclSpeed === '100GbE' ? 'dac-100g-qsfp28' : iclSpeed === '25GbE' ? 'dac-25g-sfp28' : 'dac-10g-sfpp'));
    const upSpeed = sfpUplink ? altSpeed : '100GbE';
    // links per access switch: 100G mode = the rear pair (1 to each dist member); SFP mode =
    // all 4 SFP ports (2 to each member — the ICL freed them), halved when non-redundant
    const upPerSw = sfpUplink ? (redundant ? 4 : 2) : (redundant ? 2 : 1);

    // Distribution SCALES with the access layer — the ladder is PORT-RADIX math at the chosen
    // uplink speed (each member terminates upPerSw/2 links per access switch + 4 reserved:
    // 2 ICL + 2 core/future). 100G mode: S5232F-ON (32×100G) ≤28 → Z9264F-ON (64×100G) ≤60 →
    // Z9432F-ON (128×100G via breakout) ≤124 → LOUD multi-pair warning beyond. SFP mode:
    // 25G → S5248F-ON (48×25G) → S5296F-ON (96×25G) dense; 10G → S4348F-ON (48×10G SFP+).
    const perMember = redundant ? upPerSw / 2 : upPerSw;
    const distNeed = accessSwitches * perMember + 4;
    const dist = sfpUplink
      ? (upSpeed === '25GbE' ? (distNeed <= 48 ? byId('s5248f-on') : byId('s5296f-on')) : byId('s4348f-on'))
      : (distNeed <= 32 ? byId('s5232f-on') : distNeed <= 64 ? byId('z9264f-on') : byId('z9432f-on'));
    const distCount = redundant ? 2 : 1;
    const distCap = dist.id === 'z9432f-on' ? 128 : (dist.access && dist.access.count) || 32;

    const bom = [], warnings = [];
    const add = l => addLine(bom, l);
    // R14 ruling (2026-07-23, maintainer: "OS10 shouldn't be quoted, it's end of sale"): E3224F-ON
    // is kept quotable — it's the only fiber-SFP edge switch, and the OS10 ruling drops OS10 as a
    // CHOICE, not hardware that has no substitute — but its line must disclose the fact, not say
    // "Dell Enterprise SONiC" (which this note did unconditionally before, even for this model —
    // E3224F-ON has NO Enterprise SONiC path at all, see switches.js).
    const accNos = acc.id === 'e3224f-on' ? 'SmartFabric OS10 — end of sale; no Enterprise SONiC path on this model' : 'Dell Enterprise SONiC';
    add({ category: 'Switch', vendor: acc.vendor, item: acc.model, model: acc.model, qty: accessSwitches,
      dellPN: acc.dellPN, verify: acc.verify, specConfirmed: acc.specConfirmed, source: acc.source,
      note: `Edge/access (${accNos}) — ${perSw}× ${acc.access.speed}${poe !== 'none' ? ' 802.3' + (poe === 'poe++' ? 'bt PoE++ (90W)' : 'at PoE+ (30W)') : ' (no PoE)'} per switch` + (e3224fBroken ? `; ${pairs} pair(s) REQUESTED — NOT achievable as MC-LAG on this model, see error` : (redundant ? `; deployed as ${pairs} MC-LAG pair(s)` : '')) });
    // MC-LAG ICL peer-link between each access pair (2× SFP per pair) — never priced for the
    // E3224F-ON+redundant combination: that peer-link cannot actually be configured (no SONiC path).
    if (redundant && iclOptic && !e3224fBroken) add({ category: 'Cable/Optic', vendor: 'Dell', item: iclOptic.desc + ' — MC-LAG ICL', model: iclOptic.desc + ' — MC-LAG ICL', qty: pairs * iclPerPair, mergeKey: 'edge-acc-icl',
      dellPN: iclOptic.dellPN, verify: iclOptic.verify, specConfirmed: iclOptic.specConfirmed, source: iclOptic.source, note: `MC-LAG ICL (peer-link) between each access pair — ${iclPerPair}× ${iclSpeed} per pair (published: sub-100G ICL needs ≥4 links) (${pairs} pair(s))` });
    // access -> distribution uplinks, each access switch to both distribution switches, at the
    // CHOSEN uplink class. On a Z9432F-ON distribution the 100G links land as 400G→4×100G
    // BREAKOUT assemblies (that's how its 128×100G radix physically exists — plain 100G cables
    // would use only 32 ports).
    const upLinks = accessSwitches * upPerSw;
    if (newDist && dist.id === 'z9432f-on') {
      const upBrk = C.optics.find(o => o.id === 'brk-400g-4x100');
      const upAsm = Math.ceil(upLinks / 4);
      add({ category: 'Cable/Optic', vendor: 'Dell', item: upBrk.desc, model: upBrk.desc, qty: upAsm, mergeKey: 'edge-up',
        dellPN: upBrk.dellPN, verify: upBrk.verify, specConfirmed: upBrk.specConfirmed, source: upBrk.source,
        note: `Access-to-distribution uplinks (BREAKOUT) — ${upPerSw}× 100GbE per access switch (${accessSwitches} sw); 1× 400G distribution port → 4× 100G access uplinks (${upLinks} ÷ 4 = ${upAsm} assemblies)` });
    } else if (sfpUplink && upSpeed === '10GbE') {
      // no cataloged 10G AOC — SR optics (2 per link, one each end) + fiber, per the
      // standalone-optics standard; typical IDF→MDF runs are structured fiber anyway
      const up10 = C.optics.find(o => o.id === 'sr-10g-sfpp');
      add({ category: 'Cable/Optic', vendor: 'Dell', item: up10.desc, model: up10.desc, qty: upLinks * 2, mergeKey: 'edge-up',
        dellPN: up10.dellPN, verify: up10.verify, specConfirmed: up10.specConfirmed, source: up10.source,
        note: `Access-to-distribution uplinks — ${upPerSw}× 10GbE per access switch (${accessSwitches} sw, via the 4× SFP+ uplink class) · ${upLinks} links × 2 optics (one each end) + fiber per link (IDF→MDF plant — by others unless quoted)` + (newDist ? '' : '; far side by others') });
    } else {
      const up = C.optics.find(o => o.id === (sfpUplink ? 'aoc-25g-sfp28' : 'aoc-100g-qsfp28'));
      add({ category: 'Cable/Optic', vendor: 'Dell', item: up.desc, model: up.desc, qty: upLinks, mergeKey: 'edge-up',
        dellPN: up.dellPN, verify: up.verify, specConfirmed: up.specConfirmed, source: up.source,
        note: `Access-to-distribution uplinks — ${upPerSw}× ${upSpeed} per access switch (${accessSwitches} sw${sfpUplink ? ', via the 4× SFP28 uplink class' : ''})` + (newDist ? '' : ' to existing core (far side by others)') });
    }
    let distIclSpeed = null;
    if (newDist) {
      add({ category: 'Switch', vendor: dist.vendor, item: dist.model, model: dist.model, qty: distCount,
        dellPN: dist.dellPN, verify: dist.verify, specConfirmed: dist.specConfirmed, source: dist.source,
        note: `Distribution / aggregation ${redundant ? 'MC-LAG pair' : 'switch'} (${upSpeed} downlinks, SONiC) — auto-sized for ${accessSwitches} access-switch uplinks · ${dist.switchingCapacity}` });
      if (redundant) {
        // pair ICL at the distribution's own high-speed class (400G DAC on the Z9432F rung;
        // 100G everywhere else — every rung has 100G-class ports for it)
        const icId = dist.id === 'z9432f-on' ? 'dac-400g-qsfpdd' : 'dac-100g-qsfp28';
        distIclSpeed = dist.id === 'z9432f-on' ? '400GbE' : '100GbE';
        const ic = C.optics.find(o => o.id === icId);
        add({ category: 'Cable/Optic', vendor: 'Dell', item: ic.desc + ' — MC-LAG ICL', model: ic.desc + ' — MC-LAG ICL', qty: 2, mergeKey: 'edge-dist-icl',
          dellPN: ic.dellPN, verify: ic.verify, specConfirmed: ic.specConfirmed, source: ic.source, note: `MC-LAG ICL (peer-link) between the distribution pair — 2× ${distIclSpeed}` });
      }
      // past the ladder: don't silently overflow — this is a real campus-core design
      if (accessSwitches * perMember > distCap - 4) warnings.push({ severity: 'warn',
        message: `${accessSwitches} access switches (${perMember}× ${upSpeed} link(s) each per member) exceed a single ${dist.model} distribution pair's usable ${distCap}-port radix (with ICL/core reserve) — this scale is multi-pair distribution / campus-core territory: split the access layer across multiple distribution pairs (or add a small campus spine) and engage a network SE for the aggregation design.`,
        source: 'E3200-ON Spec Sheet (uplink classes per access switch) · distribution port-radix math' });
    }
    // OOB mgmt — every network switch (access + distribution) has a management port to the OOB switch
    let mgmtInfo = null;
    const swTotal = accessSwitches + (newDist ? distCount : 0);
    if (input.includeMgmt !== false) {
      const oob = byId('s3248t-on'), cap = (oob.access && oob.access.count) || 48, q = Math.max(1, Math.ceil(swTotal / cap));
      add({ category: 'Management', vendor: oob.vendor, item: oob.model, model: oob.model, qty: q, dellPN: oob.dellPN, verify: oob.verify, specConfirmed: oob.specConfirmed, source: oob.source, note: `Out-of-band management switch — one mgmt port per network switch (${accessSwitches} access + ${newDist ? distCount : 0} distribution)` });
      const cat6 = C.optics.find(o => o.id === 'cat6-1g');
      add({ category: 'Cable/Optic', vendor: 'Dell', item: cat6.desc, model: cat6.desc, qty: swTotal, mergeKey: 'edge-mgmt', dellPN: cat6.dellPN, verify: cat6.verify, specConfirmed: cat6.specConfirmed, source: cat6.source, note: 'OOB management cabling — one per switch mgmt port (mgmt)' });
      mgmtInfo = { model: oob.model, qty: q };
    }

    const platform = { id: 'edge-access', family: 'Edge / Access (campus)', model: acc.model + ' access layer', workload: 'edge',
      requires: ['E-series access switches run Dell Enterprise SONiC (SmartFabric OS10 is end-of-sale for E-series)', 'Deploy access switches as MC-LAG pairs (ICL peer-link); clients single-home to an access port, or dual-home critical devices across the pair', 'Uplink each access switch to both distribution switches (MC-LAG, active/active, no STP)', 'Confirm PoE budget vs endpoint power classes'],
      concerns: ['Client cabling (Cat6A / fiber) to endpoints is structured & typically by others', 'Size the PoE budget for the endpoint mix (APs / phones / cameras)', 'MC-LAG is a 2-node pair — scale by adding pairs, not by stacking (no stacking on E-series SONiC)'], source: acc.source };
    const fabrics = [
      { network: 'access', role: 'access', speed: acc.access.speed, media: acc.access.media, workload: 'edge', targetId: 'edge-access', targetLabel: endpoints + ' client ports', targetFamily: 'Edge / Access', stack: 'dell',
        totalLinks: endpoints, linksPerUnit: 1, unitsN: endpoints, connector: 'RJ45 / SFP', fabricsN: 1, perFabricLinks: endpoints,
        leaf: acc, leavesPerFabric: accessSwitches, totalLeaves: accessSwitches, spine: newDist ? dist : null, spineCount: newDist ? distCount : 0,
        spineGroupKey: 'edge', oversub: null, nonBlocking: false, redundancyMethod: e3224fBroken ? null : method, interconnectQty: (redundant && !e3224fBroken) ? pairs * iclPerPair : 0, interconnectSpeed: iclSpeed,
        // the Z9432F distribution rung terminates the 100G access uplinks as 400G→4×100G
        // breakout — the marker keeps the port-budget checker (validate.js) and the diagrams
        // crediting 128×100G per member instead of the 32 native cages
        uplinksPerLeaf: upPerSw, uplinkSpeed: upSpeed,
        uplinkBreakout: (newDist && dist.id === 'z9432f-on') ? { ratio: 4, high: '400GbE', low: '100GbE', model: 'Q56DD→4×QSFP28 breakout' } : null,
        uplinkCableQty: accessSwitches * upPerSw }
    ];
    if (mgmtInfo) fabrics.push({ network: 'mgmt', role: 'mgmt', speed: '1GbE', media: 'RJ45', workload: 'general', leaf: byId('s3248t-on'), totalLinks: swTotal, fabricsN: 1, perFabricLinks: swTotal, leavesPerFabric: mgmtInfo.qty, totalLeaves: mgmtInfo.qty, spine: null, spineCount: 0, oversub: null });

    if (poe !== 'none') warnings.push({ severity: 'warn', message: `PoE budget: each ${acc.model} supplies up to ~${acc.maxPowerW}W. Confirm the endpoint mix (APs ~15–30W, phones ~7–15W, cameras ~15–60W, 802.3bt up to 90W) fits within ${accessSwitches} switch budget(s).`, source: acc.source });
    // E3224F is OS10-only (absent from the Enterprise SONiC compatibility matrix) — no SONiC MC-LAG.
    // This is a real portfolio gap (no fiber-SFP E-series switch has a SONiC MC-LAG path today) —
    // a hard error, matching this tool's "physical port budget" convention of rejecting an
    // unbuildable design rather than silently pricing it (see validate.js #22). The switch/pair
    // count above is still shown as what was REQUESTED, but the ICL cable is deliberately not
    // priced (see the `!e3224fBroken` guard above) so the BOM doesn't look deployable.
    if (e3224fBroken) warnings.push({ severity: 'error', message: 'E3224F-ON (fiber) is NOT on the Enterprise SONiC compatibility matrix — it runs SmartFabric OS10 only, so a SONiC MC-LAG pair is not possible on this model, and no ICL peer-link has been priced. Options: use E3248P-ON/E3248PXE-ON (SONiC MC-LAG confirmed) — copper RJ45 access, not fiber SFP — or accept a single, non-redundant E3224F-ON design.', source: 'Enterprise SONiC Compatibility Matrix (Table 7)' });
    // These two info notes describe a WORKING MC-LAG deployment — must not fire for the broken
    // E3224F-ON case (found by an independent fresh-context review: they previously branched on
    // raw `redundant` only, so they still claimed "deployed as N MC-LAG pairs" and walked through
    // MC-LAG mechanics right below the error saying that's not possible on this model).
    if (redundant && !e3224fBroken) warnings.push({ severity: 'info', message: `Access deployed as ${pairs} MC-LAG pair(s) on Dell Enterprise SONiC — each pair joined by a ${iclPerPair}× ${iclSpeed} ICL peer-link; each switch uplinks to both distribution switches (active/active, no STP).`, source: R.redundancy.source });
    else if (!redundant) warnings.push({ severity: 'info', message: 'Single access switches with a single uplink (no redundancy — lab/small only).', source: R.redundancy.source });
    if (redundant && !e3224fBroken) warnings.push({ severity: 'info', message: '"Stacking" story for customers: each MC-LAG pair behaves like a stack — two switches act as one logical switch (one LAG to the client/upstream, active/active, no STP), and firmware can be upgraded one member at a time WITHOUT taking the network offline. Unlike a stack, each switch keeps its own control plane — a software fault can\'t take down the whole "stack". MC-LAG L2, graceful shutdown, fallback, and LACP-individual are all confirmed for E3248P/E3248PXE on the SONiC compatibility matrix.', source: 'E3200-ON Spec Sheet + Enterprise SONiC Compatibility Matrix' });
    warnings.push({ severity: 'info', message: 'E-series campus switches run Dell Enterprise SONiC (Lite bundle). SmartFabric OS10 is end-of-sale for the E-series — MC-LAG is the redundancy mechanism (there is no switch stacking; scale by adding MC-LAG pairs).', source: 'Dell PowerSwitch E3200-ON / Enterprise SONiC' });
    warnings.push({ severity: 'info', message: 'Client access cabling (Cat6A / fiber) to endpoints is structured and typically by others — not in this switching BOM. OOB manages every switch (one mgmt port each).', source: 'Edge/access best practice' });

    const result = { platform, targets: [{ platform, units: accessSwitches, label: accessSwitches + '× ' + acc.model, shortLabel: 'Edge access' }],
      context: { units: accessSwitches, endpoints, headroom: 0, redundancy: redundant ? 'dual' : 'single', nos: 'sonic', edge: { poe, accessSpeed, accessSwitch: acc.model, accessSwitches, pairs, iclSpeed, upPerSw, upSpeed, distIclSpeed, distribution: newDist ? dist.model : 'existing', distCount: newDist ? distCount : 0, method: e3224fBroken ? null : method, perSw, endpoints }, targetsLabel: endpoints + ' client ports · ' + accessSwitches + '× ' + acc.model + (redundant && !e3224fBroken ? ' (' + pairs + ' MC-LAG pair' + (pairs > 1 ? 's' : '') + ')' : '') },
      fabrics, bom, warnings, coreUplink: null, mgmt: mgmtInfo, sharedSpine: null, isEdge: true };
    if (window.validateBOM) window.validateBOM(result);
    return result;
  }

  /* ---- network REFRESH path -------------------------------------------
   * The network itself is the deal: replace an ageing fabric like-for-like(+),
   * keeping the same access-switch count but at modern speeds, deployed as
   * SONiC MC-LAG pairs, with migration guidance. Output is edge-shaped so the
   * campus renderer / validators apply. */
  function recommendRefresh(input) {
    const R = C.rules, byId = id => C.switches.find(s => s.id === id);
    let swCount = Math.min(512, Math.max(2, parseInt(input.swCount, 10) || 2));
    if (swCount % 2 === 1) swCount += 1;                       // deploy as MC-LAG pairs
    const portsPer = parseInt(input.portsPer, 10) === 24 ? 24 : 48;
    const target = ['10g-t', '25g', '100g'].indexOf(input.targetSpeed) >= 0 ? input.targetSpeed : '25g';
    const hadCore = input.topologyNow !== 'tor';               // 3-tier / leaf-spine today
    const newDist = input.distribution !== 'existing';

    // replacement access model (like-for-like port count at the TARGET speed)
    const acc = target === '10g-t' ? byId('s4348t-on')
      : target === '100g' ? (portsPer > 32 ? byId('s5448f-on') : byId('s5232f-on'))
      : (portsPer <= 24 ? byId('s5224f-on') : byId('s5248f-on'));
    const pairs = swCount / 2;
    const iclSpeed = (acc.uplink && acc.uplink.count) ? acc.uplink.speed : acc.access.speed;
    const iclPerPair = speedToGbps(iclSpeed) >= 100 ? (R.redundancy.interconnectLinksPerPair || 2) : (R.redundancy.interconnectLinksPerPairSub100 || 4);
    const needSpine = newDist && (hadCore || swCount > 2);
    // same distribution radix ladder as the edge flow (each access switch takes 2×100G-class
    // uplinks → each distribution member terminates swCount links + reserve): the Z9264F rung
    // was missing here too (the v0.56.0 spine-rung fix, one tier down)
    const dist = speedToGbps(iclSpeed) >= 400 ? byId('z9664f-on')
      : (swCount <= 28 ? byId('s5232f-on') : swCount <= 60 ? byId('z9264f-on') : byId('z9432f-on'));
    const upPerSw = needSpine ? 2 : (input.includeCoreUplink ? 2 : 0);

    const bom = [], warnings = [];
    const add = l => addLine(bom, l);
    add({ category: 'Switch', vendor: acc.vendor, item: acc.model, model: acc.model, qty: swCount,
      dellPN: acc.dellPN, verify: acc.verify, specConfirmed: acc.specConfirmed, source: acc.source,
      note: `REFRESH access — replaces ${swCount}× existing switches like-for-like at ${acc.access.speed} (${pairs} MC-LAG pair(s), Enterprise SONiC) · ${acc.switchingCapacity}` });
    const icOpt = pickHostCable(speedToGbps(iclSpeed), 'in-rack');
    if (icOpt) add({ category: 'Cable/Optic', vendor: 'Dell', item: icOpt.desc + ' — MC-LAG ICL', model: icOpt.desc + ' — MC-LAG ICL', qty: pairs * iclPerPair, mergeKey: 'rf-icl',
      dellPN: icOpt.dellPN, verify: icOpt.verify, specConfirmed: icOpt.specConfirmed, source: icOpt.source, note: `MC-LAG ICL — ${iclPerPair}× ${iclSpeed} per pair (${pairs} pairs)` });
    if (needSpine) {
      add({ category: 'Switch', vendor: dist.vendor, item: dist.model, model: dist.model, qty: 2,
        dellPN: dist.dellPN, verify: dist.verify, specConfirmed: dist.specConfirmed, source: dist.source,
        note: `REFRESH distribution/spine — MC-LAG pair replacing the existing aggregation tier · ${dist.switchingCapacity}` });
      const up = pickUplinkCable(speedToGbps(iclSpeed));
      const up2 = up && up.category === 'transceiver';   // standalone optic → 2 per link (one each end)
      if (up) add({ category: 'Cable/Optic', vendor: 'Dell', item: up.desc, model: up.desc, qty: up2 ? swCount * 4 : swCount * 2, mergeKey: 'rf-up',
        dellPN: up.dellPN, verify: up.verify, specConfirmed: up.specConfirmed, source: up.source, note: `Access-to-distribution uplinks — 2× ${iclSpeed} per access switch${up2 ? ` · ${swCount * 2} links × 2 optics (one each end) + fiber per link` : ''}` });
      const dic = pickHostCable(100, 'in-rack');
      if (dic) add({ category: 'Cable/Optic', vendor: 'Dell', item: dic.desc + ' — MC-LAG ICL', model: dic.desc + ' — MC-LAG ICL', qty: 2, mergeKey: 'rf-dist-icl',
        dellPN: dic.dellPN, verify: dic.verify, specConfirmed: dic.specConfirmed, source: dic.source, note: 'MC-LAG ICL between the distribution pair — 2× 100GbE' });
    }
    // B7 (2026-07-16): includeCoreUplink with NO new spine (the access switches uplink to the
    // customer's EXISTING core) must actually PRICE those uplinks — before this it flipped upPerSw
    // but added no cable line (hardware-inert). Wired through the same coreVendor far-side machinery
    // as the main path: 'dell' quotes the matched far-side optic too; 'other'/'unsure' = our side only.
    let refreshCore = null;
    if (input.includeCoreUplink && !needSpine) {
      const coreSpeed = input.coreSpeed || iclSpeed || '100GbE';
      const coreGbps = speedToGbps(coreSpeed) || 100;
      const longReach = input.coreReach === 'longreach';
      const rfVendor = ['dell', 'other', 'unsure'].indexOf(input.coreVendor) >= 0 ? input.coreVendor : (input.coreFarEnd === 'other' ? 'other' : 'unsure');
      const includeFar = rfVendor === 'dell';
      const cOpt = pickCoreOptic(coreGbps, longReach);
      const links = swCount * upPerSw;
      if (cOpt && links > 0) {
        const linkClass = cOpt.model + '-class';
        const handoff = includeFar ? `BOTH sides quoted (Dell into a Dell core)`
          : rfVendor === 'other' ? `OUR side only — far side by your core vendor (a ${linkClass} optic in their format), by customer`
          : `OUR side only — far side to VERIFY once the core vendor & port are confirmed`;
        add({ category: 'Cable/Optic', vendor: 'Dell', item: cOpt.desc + ' — to existing core', model: cOpt.desc + ' — to existing core', qty: links, mergeKey: 'rf-core',
          dellPN: cOpt.dellPN, verify: cOpt.verify, specConfirmed: cOpt.specConfirmed, source: cOpt.source,
          note: `Refresh uplinks to the EXISTING core — ${upPerSw}× ${coreSpeed} per access switch × ${swCount} = ${links} links; ${handoff}.` });
        if (cOpt.category === 'transceiver') { const pc = fiberCordFor(cOpt); if (pc) add({ category: 'Cable/Optic', vendor: 'Structured', item: pc.desc + ' — to existing core', model: pc.desc + ' — to existing core', qty: links * 2, mergeKey: 'rf-core-patch', dellPN: pc.dellPN, verify: pc.verify, specConfirmed: pc.specConfirmed, source: pc.source, note: `Fiber patch cords for the core uplinks — 2 per link × ${links} links (one each end).` }); }
        if (includeFar) add({ category: 'Cable/Optic', vendor: 'Dell', item: cOpt.desc + ' — existing core (far side)', model: cOpt.desc + ' — existing core (far side)', qty: links, mergeKey: 'rf-core-far', dellPN: cOpt.dellPN, verify: true, specConfirmed: false, source: cOpt.source, note: `Far-side (core) optic — ${links}× ${coreSpeed}, matched to ours (${cOpt.model}). VERIFY the core port before ordering.` });
        warnings.push({ severity: links > 16 ? 'warn' : 'info', message: `Uplinks to existing core: ${swCount} access switch(es) need ${links}× ${coreSpeed} FREE ports on your existing core${links > 16 ? ' — at this count a new aggregation/spine tier is usually cleaner than consuming that many core ports' : ''}. Confirm capacity before ordering.`, source: 'Leaf-uplink port math · existing-core handoff' });
        refreshCore = { enabled: true, speed: coreSpeed, count: links, coreVendor: rfVendor, includeFar };
      }
    }
    let mgmtInfo = null;
    const swTotal = swCount + (needSpine ? 2 : 0);
    if (input.includeMgmt !== false) {
      const oob = byId('s3248t-on'), q = Math.max(1, Math.ceil(swTotal / 48));
      add({ category: 'Management', vendor: oob.vendor, item: oob.model, model: oob.model, qty: q, dellPN: oob.dellPN, verify: oob.verify, specConfirmed: oob.specConfirmed, source: oob.source, note: `Out-of-band management — one mgmt port per new switch (${swTotal})` });
      const cat6 = C.optics.find(o => o.id === 'cat6-1g');
      add({ category: 'Cable/Optic', vendor: 'Dell', item: cat6.desc, model: cat6.desc, qty: swTotal, mergeKey: 'rf-mgmt', dellPN: cat6.dellPN, verify: cat6.verify, specConfirmed: cat6.specConfirmed, source: cat6.source, note: 'OOB management cabling (mgmt)' });
      mgmtInfo = { model: oob.model, qty: q };
    }

    const endpoints = swCount * portsPer;
    const platform = { id: 'net-refresh', family: 'Network Refresh', model: acc.model + ' refresh', workload: 'refresh',
      requires: ['Build the new fabric in PARALLEL and cut over rack-by-rack (no big-bang)', 'Deploy access as MC-LAG pairs on Enterprise SONiC (one logical switch per pair — the modern "stack")', 'Match VLANs/MTU on old + new during migration; move LACP bonds pair-by-pair', 'Existing patching/client cabling is reused — not in this BOM'],
      concerns: ['Confirm existing port utilization — like-for-like sizing assumes similar density', 'Map existing VLANs / STP domains before cutover; new fabric is active/active (no STP blocking)', 'Book maintenance windows per rack; MC-LAG allows hitless per-member upgrades AFTER migration'], source: 'Refresh best practice + Enterprise SONiC MC-LAG' };
    const fabrics = [
      { network: 'access', role: 'access', speed: acc.access.speed, media: acc.access.media, workload: 'refresh', targetId: 'net-refresh', targetLabel: endpoints + ' existing ports (reused cabling)', targetFamily: 'Network Refresh', stack: 'dell',
        totalLinks: endpoints, linksPerUnit: portsPer, unitsN: swCount, connector: 'per existing cabling', fabricsN: 1, perFabricLinks: endpoints,
        leaf: acc, leavesPerFabric: swCount, totalLeaves: swCount, spine: needSpine ? dist : null, spineCount: needSpine ? 2 : 0,
        spineGroupKey: 'refresh', oversub: null, nonBlocking: false, redundancyMethod: 'mclag', interconnectQty: pairs * iclPerPair, interconnectSpeed: iclSpeed,
        uplinksPerLeaf: upPerSw, uplinkSpeed: iclSpeed, uplinkBreakout: null, uplinkCableQty: needSpine ? swCount * 2 : 0 }
    ];
    if (mgmtInfo) fabrics.push({ network: 'mgmt', role: 'mgmt', speed: '1GbE', media: 'RJ45', workload: 'general', leaf: byId('s3248t-on'), totalLinks: swTotal, fabricsN: 1, perFabricLinks: swTotal, leavesPerFabric: mgmtInfo.qty, totalLeaves: mgmtInfo.qty, spine: null, spineCount: 0, oversub: null });

    warnings.push({ severity: 'info', message: `REFRESH: ${swCount}× existing ${input.speedNow || ''} switches → ${swCount}× ${acc.model} at ${acc.access.speed} (${pairs} MC-LAG pairs). Existing client/server cabling is REUSED where the media matches — confirm connector types (RJ45 vs SFP) against what's in the racks.`, source: 'Refresh best practice' });
    warnings.push({ severity: 'info', message: 'Migration path: 1) stand the new fabric up in parallel (own mgmt/OOB), 2) pre-stage VLANs + MTU 9216 + LACP port-channels, 3) cut over rack-by-rack in windows, 4) decommission the old tier last. MC-LAG gives hitless per-member software updates from day 2 onward.', source: 'Enterprise SONiC MC-LAG / deployment guides' });
    warnings.push({ severity: 'info', message: 'Positioning: open networking (Enterprise SONiC) ends the proprietary-lock refresh cycle — and Dell Fabric Manager (DFM) gives one-platform automation, observability and AIOps from day one of the new fabric.', source: 'Discovery guidance' });

    const result = { platform, targets: [{ platform, units: swCount, label: swCount + '× ' + acc.model + ' (refresh)', shortLabel: 'Network refresh' }],
      context: { units: swCount, endpoints, headroom: 0, redundancy: 'dual', nos: 'sonic', edge: { poe: 'none', accessSpeed: target, accessSwitch: acc.model, accessSwitches: swCount, pairs, iclSpeed, iclPerPair, upPerSw, distribution: needSpine ? dist.model : 'existing', distCount: needSpine ? 2 : 0, method: 'mclag', perSw: portsPer, endpoints }, targetsLabel: `REFRESH: ${swCount} switches → ${acc.model} @ ${acc.access.speed}` },
      fabrics, bom, warnings, coreUplink: null, mgmt: mgmtInfo, sharedSpine: null, isEdge: true, isRefresh: true };
    if (window.validateBOM) window.validateBOM(result);
    return result;
  }

  window.recommend = recommend;
  window.recommendRA = recommendRA;
  window.recommendEdge = recommendEdge;
  window.recommendRefresh = recommendRefresh;
  // Exposed so validate.js (the OTHER half of "the product," not the independent test-harness
  // checker) shares this classification instead of hand-duplicating it — a prior audit found the
  // same function copy-pasted verbatim in 3 places with nothing enforcing they stay in sync.
  // tests/harness/lib/feasibility.js keeps its OWN separate copy deliberately (it's the
  // independent re-derivation check — sharing this with the engine would defeat the point of it
  // being independent, see that file's header).
  window.hasFabricUplink = hasFabricUplink;
  // Shared by wizard.js/app.js's DFM attach call sites (R14 Slice 3) and validate.js
  // (DFM scope note) — same "share, don't hand-duplicate" reasoning as hasFabricUplink above.
  window.dfmStatus = dfmStatus;
  // The atomic per-model fact underneath dfmStatus — also consumed directly by validate.js
  // check #14 and ui.js's dfmStats(), which each need a per-switch answer, not the whole-design
  // summary dfmStatus() returns (GAPS G-030).
  window.isDellSonicCapable = isDellSonicCapable;
  // The moved addVerity() body (GAPS G-030) — wizard.js keeps a thin delegate under that name
  // (window.Wizard._test.addVerity stays valid for selftest.js); app.js calls this directly.
  window.attachDfm = attachDfm;
  // Exposed for the canonical design layer (js/design.js, RESTRUCTURE-3 Phase 2): the
  // cable-line derivation re-uses the ENGINE's own optic/cable pickers so the canonical
  // cable records can never diverge from what the engine actually quoted (that divergence
  // is the whole class of seam bug the restructure kills). Additive only — no engine output
  // changes from exposing these.
  window._engineHelpers = { speedToGbps, isBaseT, pickLeaf, pickSpine,
    pickHostCable, pickUplinkCable, pickBreakout, resolveUplinkBreakout, fiberCordFor, pickCoreOptic,
    // R14 architecture refactor (2026-07-23): the one function that writes every switch line's
    // note, exposed directly so tests can hand it synthetic facts (single vs. multi-contributor
    // breakdown, with/without NOS, with/without dedicated) without building a full design.
    switchLineNote };
})();
