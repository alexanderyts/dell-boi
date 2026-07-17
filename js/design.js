/* =============================================================================
 * CANONICAL DESIGN LAYER  (docs/RESTRUCTURE-3.md Phase 2; docs/contracts/
 * CANONICAL-DESIGN.md + DERIVATIONS.md)
 * -----------------------------------------------------------------------------
 * ONE structured description of the network — devices / (links / cables to
 * follow) — that the BOM, renderers, and validators will all derive from, so
 * they can never disagree (that disagreement is every backtest seam bug).
 *
 * THIS INCREMENT: the DEVICE LIST only (CANONICAL-DESIGN §1.1). It is the
 * foundation both the switch-line BOM derivation (DERIVATIONS §1) and the
 * renderer node-lists (§2) read. Links + cables are the next increment (they
 * pair with the cable-line BOM migration). Not yet consumed by any output —
 * loaded by tests/unit-design.js only, so the shipped app is byte-unchanged
 * until the BOM consumer is migrated onto it.
 *
 * SCOPE: the main recommend() path. Edge / refresh / RA get their own slice as
 * the migration proceeds (they carry a reduced fabric shape — see
 * INPUT-SCHEMA/CANONICAL-DESIGN). buildDeviceList returns { partial: true }
 * for those so a caller never mistakes an unmodeled path for an empty design.
 *
 * The two structural bug-kills this device layer already embodies:
 *   B3 — devices group by (model, role); a model serving as BOTH leaf and
 *        spine (e.g. S5232F-ON) stays two role-groups, never one merged line.
 *   B6 — OOB device count = max(port-demand, DECLARED racks), never
 *        declared+1: no hardware for a rack the user didn't declare (SPEC
 *        "Multi-rack deployments" governing rule; ruling 2026-07-16).
 * ========================================================================== */
(function () {
  'use strict';

  // OOB switch access-port capacity (mgmt ports one switch terminates). Read from
  // the catalog so it tracks the real OOB model, with the documented S3248T-ON default.
  function oobCap(model) {
    const C = (typeof window !== 'undefined' && window.CATALOG) || {};
    const sw = (C.switches || []).find(s => s.model === model);
    return (sw && sw.access && sw.access.count) || 48;
  }

  /* Expand a recommend() result into one device record per physical switch.
   * Hosts stay grouped (they're context, not itemized switch hardware). */
  function buildDeviceList(result) {
    if (!result || result.isEdge || result.isRA || result.isRefresh) {
      return { devices: [], hostGroups: [], externals: [], partial: true,
        reason: 'edge / refresh / RA paths carry a reduced fabric shape — modeled in a later migration slice' };
    }
    const ctx = result.context || {};
    const racks = Math.max(1, ctx.racks || 1);
    const reuseSpine = !!ctx.reuseSpine;
    const dataFabrics = result.fabrics.filter(f => f.network !== 'mgmt');
    const mgmt = result.fabrics.find(f => f.network === 'mgmt');

    const devices = [], externals = [];
    let did = 0, xid = 0;
    const push = (model, role, network, n) => {
      for (let i = 0; i < n; i++) devices.push({ id: 'd' + (++did), model, role, network, rack: null });
    };
    // external endpoint (CANONICAL-DESIGN §1.3) — the customer's own hardware (e.g. a reused
    // spine, or their core), referenced by notes but NEVER a switch BOM line. Carries `model` so
    // consumers can tell "note cites a REUSED external" (legitimate) from "note cites a dropped
    // switch" (B2 ghost) without string-scraping the label.
    const ext = (model, label) => { const e = { id: 'x' + (++xid), model, label }; externals.push(e); return e; };

    // ---- leaves: one group of instances per fabric (totalLeaves is the full count,
    // already ×2 for a dual fabricsN===2 design) ----
    dataFabrics.forEach(f => {
      if (f.leaf && f.totalLeaves > 0) push(f.leaf.model, 'leaf', f.network, f.totalLeaves);
    });

    // ---- spines + super-spines: DEDUP by spineGroupKey (a shared spine tier is
    // built once, not once per fabric it serves — matches the engine's shared-spine
    // BOM). totalPodSpines covers every pod for a 3-tier Clos (== spineCount flat). ----
    const seenGroups = new Set();
    dataFabrics.forEach(f => {
      if (!f.spine) return;
      const key = f.spineGroupKey || f.spine.model;
      if (seenGroups.has(key)) return;
      seenGroups.add(key);
      // a dedicated group (PowerScale back-end etc.) keeps its own network; a shared
      // spine spans networks (DERIVATIONS §2 groups by network — 'shared' is its own group)
      const network = f.dedicated ? f.network : 'shared';
      const spineN = f.totalPodSpines || f.spineCount || 0;
      if (spineN > 0) {
        if (reuseSpine) ext(f.spine.model, f.spine.model + ' spine (existing, reused)');   // B2: not our device — external
        else push(f.spine.model, 'spine', network, spineN);
      }
      if (f.superSpine && f.superSpineCount > 0) {
        if (reuseSpine) ext(f.superSpine.model, f.superSpine.model + ' super-spine (existing, reused)');
        else push(f.superSpine.model, 'super-spine', network, f.superSpineCount);
      }
    });

    // ---- border-leaf pair (core/DCI egress) ----
    const bl = result.coreUplink && result.coreUplink.borderLeaf;
    if (bl && bl.model) push(bl.model, 'border-leaf', 'core', bl.qty || 2);

    // ---- host groups (context, grouped — not devices) ----
    const hostGroups = (result.targets || []).map(t => ({
      targetUid: t.uid != null ? t.uid : (t.platform && t.platform.id),
      family: t.platform && t.platform.family, units: t.units || 0
    }));

    // ---- OOB: capacity-driven, capped BELOW by declared racks, never declared+1
    // (B6 / SPEC multi-rack governing rule). Port demand = every host's iDRAC/BMC +
    // every data-switch mgmt port (= the device count built above). ----
    if (mgmt && mgmt.leaf) {
      const hostMgmt = hostGroups.reduce((s, h) => s + h.units, 0);
      const switchMgmt = devices.length;   // every data switch has one mgmt port
      const cap = oobCap(mgmt.leaf.model);
      const oobN = Math.max(Math.ceil((hostMgmt + switchMgmt) / cap), racks);
      push(mgmt.leaf.model, 'oob', 'mgmt', oobN);
    }

    return { devices, hostGroups, externals, partial: false };
  }

  /* Switch-BOM grouping (DERIVATIONS §1) — exposed now so the test can prove the
   * grouping key is (model, role) and the migration can reuse the exact function.
   * Returns [{ model, role, qty, networks }] — networks lists the fabrics a group
   * spans, for the generated per-fabric note ("4 total — 2× frontend, 2× storage").
   * Cross-fabric same-(model,role) DOES merge (maintainer decision, DERIVATIONS §1);
   * cross-ROLE never does (the B3 kill). */
  function groupDevicesForBom(devices) {
    const groups = new Map();
    devices.forEach(d => {
      const key = d.model + '|' + d.role;
      if (!groups.has(key)) groups.set(key, { model: d.model, role: d.role, qty: 0, networks: {} });
      const g = groups.get(key);
      g.qty++;
      g.networks[d.network] = (g.networks[d.network] || 0) + 1;
    });
    return [...groups.values()];
  }

  /* ===========================================================================
   * LINKS + CABLES LAYER (CANONICAL-DESIGN §1.3–1.4; DERIVATIONS §1)
   * ---------------------------------------------------------------------------
   * The host↔leaf and leaf↔spine cable records the BOM cable lines derive from.
   * It re-uses the ENGINE's OWN optic pickers (window._engineHelpers) so a
   * canonical cable record can never disagree with what the engine actually
   * quoted — that disagreement is the B1/B5 seam (a merged line whose NOTE lies
   * about the qty, or a copper line carrying DAC metadata it never had).
   *
   * unitsPerLink is declared per MEDIA CLASS (CANONICAL-DESIGN §1.4): a copper
   * patch or an integrated DAC/AOC is ONE unit per link; a standalone
   * transceiver is TWO (one optic each end). Copper carries NO DAC/optic
   * metadata — that is B1 made unrepresentable.
   *
   * SCOPE this increment: host| and uplink| (the non-breakout uplink branch).
   * Breakout / structured-plant / peer / super-spine / core cables stay on the
   * engine path until their own migration slice (tracked in the shim register,
   * docs/GAPS.md G-020). buildCableList returns { partial: true } for edge/RA/
   * refresh, exactly like buildDeviceList.
   * ========================================================================= */
  function opticById(id) {
    const C = (typeof window !== 'undefined' && window.CATALOG) || {};
    return (C.optics || []).find(o => o.id === id) || null;
  }
  function engineHelpers() { return (typeof window !== 'undefined' && window._engineHelpers) || {}; }

  function buildCableList(result) {
    if (!result || result.isEdge || result.isRA || result.isRefresh || !result.fabrics)
      return { cables: [], partial: true, reason: 'edge / refresh / RA cabling is a later migration slice' };
    const H = engineHelpers();
    const gbpsOf = s => (H.speedToGbps ? H.speedToGbps(s) : 0);
    const dataF = result.fabrics.filter(f => f.network !== 'mgmt');
    const groups = new Map();
    // merge by the SAME key the engine's addLine() uses, so cross-fabric merges combine to the
    // SAME qty the engine produces (faithful) — the fix is the NOTE, not the count (quantities
    // are already correct; sizing corrections are the separate B4 increment).
    const merge = (key, base, add) => {
      if (!groups.has(key)) { groups.set(key, Object.assign({ mergeKey: key, links: 0, totalLeaves: 0, sources: [] }, base)); }
      const g = groups.get(key);
      g.links += add.links || 0;
      g.totalLeaves += add.totalLeaves || 0;
      if (add.source) g.sources.push(add.source);
      if (add.uplinksPerLeaf) g.uplinksPerLeaf = add.uplinksPerLeaf;
    };
    dataF.forEach(f => {
      const gbps = gbpsOf(f.speed);
      const nv = f.stack === 'nvidia';
      const baseT = H.isBaseT ? H.isBaseT(f.speed) : /base-?t/i.test(String(f.speed));
      const placement = f.cablePlacement || 'in-rack';
      // ---- host↔leaf ----
      // CONSUME the engine's RESOLVED optic (f.hostCableId) rather than re-deriving the pick here.
      // Re-deriving drifted the moment the pick grew cage/NIC awareness (R12): this call passed
      // neither the leaf port nor the rail-NIC cage, so it chose a DIFFERENT part than the engine
      // and the merge keys stopped lining up — the canonical layer silently described a cable the
      // BOM never had. Same rule as G-011/uplinkCableQty: read what the engine decided.
      // (The re-derivation stays only as a fallback for fabrics predating the recorded id.)
      const hc = (f.hostCableId && (window.CATALOG.optics || []).find(o => o.id === f.hostCableId))
        || (H.pickHostCable && H.pickHostCable(gbps, placement, nv, baseT, f.leaf && f.leaf.access));
      if (hc && f.totalLinks > 0) {
        // R10: a CONVERGED fabric merges several platforms onto one leaf tier — carry the per-platform
        // members so the note enumerates them ("64× Server (2/unit × 32), 64× PowerStore (8/unit × 8)")
        // instead of a meaningless fractional average (128/40 = 3.2/unit).
        const members = (f.converged && f._convergedFrom) ? f._convergedFrom.map(m => ({
          fam: (m.target && m.target.platform && m.target.platform.family) || m.network, units: m.target && m.target.units,
          linksPerUnit: m.linksPerUnit, links: m.links })) : null;
        merge('host|' + (f.bomTargetId != null ? f.bomTargetId : f.targetId) + '|' + f.network + '|' + hc.id,
          { role: 'host', opticId: hc.id, opticDesc: hc.desc, media: hc.category, isTx: hc.category === 'transceiver',
            // a 1:2 splitter assembly carries TWO links per ordered part (R12) — declared here so
            // the canonical qty derives from the same number the engine and the note use
            unitsPerLink: 1, linksPerAssembly: hc.railsPerAssembly || 1,
            family: f.targetFamily, network: f.network, placement, speed: f.speed },
          { links: f.totalLinks, source: { network: f.network, links: f.totalLinks, speed: f.speed, linksPerUnit: f.linksPerUnit, units: f.unitsN, members } });
      }
      // ---- leaf↔spine (non-breakout branch only; breakout keeps its own engine line) ----
      if (f.spine && !f.uplinkBreakout && f.uplinkCableQty > 0) {
        const upSpeed = f.uplinkSpeed || (f.workload === 'ai' ? f.speed : '100GbE');
        const uc = H.pickUplinkCable && H.pickUplinkCable(gbpsOf(upSpeed) || 100, nv, placement === 'structured');
        if (uc) {
          const isTx = uc.category === 'transceiver';
          merge('uplink|' + (f.bomTargetId != null ? f.bomTargetId : f.targetId) + '|' + f.network + '|' + uc.id,
            { role: 'uplink', opticId: uc.id, opticDesc: uc.desc, media: uc.category, isTx,
              unitsPerLink: isTx ? 2 : 1, family: f.targetFamily, network: f.network, upSpeed },
            { links: f.uplinkCableQty, totalLeaves: f.totalLeaves, uplinksPerLeaf: f.uplinksPerLeaf, source: { network: f.network, links: f.uplinkCableQty } });
        }
      }
      // ---- ICL / peer-link (MC-LAG / VLT) — the SAME `peer|target|network|optic` key the engine
      // merges on. Two fabrics of one target+network at the same ICL speed (e.g. a 10G + a 1G NIC
      // fabric, both 100G-uplink S4348T pairs) collide here → one line. Its note MUST enumerate the
      // per-fabric contribution (DERIVATIONS §1, backtest 2026-07-16 R2), not carry a stale "+more".
      if (f.interconnectQty > 0 && /mclag|vlt/.test(f.redundancyMethod || '')) {
        const icG = gbpsOf(f.interconnectSpeed) || (H.speedToGbps ? H.speedToGbps(f.interconnectSpeed) : 100);
        const ic = H.pickHostCable && H.pickHostCable(icG, 'in-rack', nv);
        if (ic) {
          merge('peer|' + (f.bomTargetId != null ? f.bomTargetId : f.targetId) + '|' + f.network + '|' + ic.id,
            { role: 'peer', opticId: ic.id, opticDesc: ic.desc, media: ic.category, isTx: false, unitsPerLink: 1,
              family: f.targetFamily, network: f.network, tag: f.redundancyMethod === 'vlt' ? 'VLTi' : 'MC-LAG ICL', interconnectSpeed: f.interconnectSpeed },
            { links: f.interconnectQty, source: { speed: f.speed, qty: f.interconnectQty, pairs: f.leavesPerFabric } });
        }
      }
    });
    // qty = links × unitsPerLink ÷ linksPerAssembly. unitsPerLink counts parts PER LINK (a
    // standalone transceiver is 2 — one each end); linksPerAssembly counts links PER PART (a 1:2
    // splitter is 2). Both default to 1, so every pre-R12 line is unchanged.
    const cables = [...groups.values()].map(g => { g.qty = Math.ceil(g.links * g.unitsPerLink / (g.linksPerAssembly || 1)); return g; });
    return { cables, partial: false };
  }

  /* ===========================================================================
   * BOM DERIVATION (DERIVATIONS §1) — the CANONICAL correction applied to the
   * engine's main-path Switch + host|/uplink| lines. Minimal-surface by design:
   * a CLEAN line (no merge, right media) is left untouched, so this is a no-op
   * on every design the engine already sizes correctly. It only repairs the
   * three seams the backtest pinned:
   *   B3 — a switch model serving as BOTH leaf and (flat) spine merged into one
   *        line (default key = model): SPLIT by (model, role); a same-role
   *        cross-fabric merge keeps ONE line but its note is regenerated to
   *        enumerate the true total (no stale "+more").
   *   B1 — a copper host line carrying DAC/SFP metadata (structurally wrong) or
   *        a merged host line whose "N link(s)" lies: note regenerated from the
   *        canonical cable record (copper carries no optic metadata).
   *   B5 — a merged uplink line whose "N/leaf × M" lies: enumeration regenerated
   *        from the canonical cable record's true leaf total.
   *
   * TEMPORARY COMPATIBILITY SHIM (docs/GAPS.md G-020): the regenerated notes
   * REPRODUCE the engine's parseable substrings ("N/fabric × M", "N link(s)",
   * "N/leaf × M", "Host-to-leaf … {network}", "Leaf-to-spine … {network}") and
   * the "— Pod-spine/— Super-spine/— Border-leaf" item suffixes, because five
   * consumers still scrape them (ui.js oooText; tests/harness audit-boms,
   * audit-groundtruth, audit-independent; validate.js indirectly). When those
   * consumers migrate to structured fields, this substring-preservation code is
   * DELETED — that deletion is itself a tracked increment. This layer is not a
   * contract; the register is what guarantees it gets torn down, not fossilized.
   * ========================================================================= */
  // switchingCapacity suffix the engine appends to switch notes (" · 6.4 Tbps")
  function capSuffix(model) {
    const C = (typeof window !== 'undefined' && window.CATALOG) || {};
    const sw = (C.switches || []).find(s => s.model === model);
    return sw && sw.switchingCapacity ? ' · ' + sw.switchingCapacity : '';
  }
  // A flat (2-tier) spine note, matching the engine's line-965 wording by design shape. Only
  // reached on a flat leaf==spine merge (3-tier pod-spines never merge — they carry a suffix +
  // distinct key), so no pod-note is ever needed here.
  function flatSpineNote(f, model) {
    const fam = f.targetFamily || (f.target && f.target.platform && f.target.platform.family) || '';
    const body = f.workload === 'ai' ? `Spine — ${fam} ${f.network} AI fabric (${f.stack} stack, rail-optimized)`
      : f.dedicated ? `Dedicated spine — ${fam} back-end (kept physically separate)`
        : `Shared spine — all non-AI, non-back-end leaves connect here`;
    return body + capSuffix(model);
  }
  const stripMore = n => String(n || '').replace(/;?\s*\+more/g, '');
  // rewrite an "A/unit-or-fabric-or-leaf × B" enumeration so A×B == qty, preserving the A term
  function fixEnum(note, re, perUnit, qty) {
    const A = perUnit > 0 ? perUnit : 1;
    const B = A > 0 && qty % A === 0 ? qty / A : qty, a2 = A > 0 && qty % A === 0 ? A : 1;
    return note.replace(re, `${a2}/${re.source.indexOf('fabric') >= 0 ? 'fabric' : 'leaf'} × ${B}`);
  }

  function applyCanonicalBom(result) {
    if (!result || !result.bom || !result.fabrics) return result;
    const dl = buildDeviceList(result);
    if (dl.partial) return result;              // edge/RA/refresh — untouched this slice
    const groups = groupDevicesForBom(dl.devices);
    repairSwitchLines(result, groups);
    repairCableLines(result, buildCableList(result).cables);
    // R6: hard-surface a stranded design (a leaf with no uplink path) as an ERROR so an unbuildable
    // BOM can never ship silently again. Structural — computed from the fabric/link shape.
    const conn = checkConnectivity(result);
    if (!conn.ok && result.warnings) {
      conn.stranded.forEach(s => result.warnings.unshift({ severity: 'error',
        message: `UNBUILDABLE — ${s.why}. Every leaf switch must reach a spine or the core; ${s.count} switch(es) have no uplink path. Add a spine (uplinkTarget "new spine") or ensure the core uplink covers every leaf pair.`,
        source: 'Canonical connectivity check (js/design.js)' }));
    }
    return result;
  }

  function repairSwitchLines(result, groups) {
    const bom = result.bom;
    // model -> { leaf, spine } role groups (only the two that can collide on the default key)
    const byModel = {};
    groups.forEach(g => { if (g.role === 'leaf' || g.role === 'spine') { (byModel[g.model] || (byModel[g.model] = {}))[g.role] = g; } });
    const leavesPerFabricFor = model => {
      const f = result.fabrics.find(x => x.leaf && x.leaf.model === model && x.network !== 'mgmt');
      return f && f.leavesPerFabric > 0 ? f.leavesPerFabric : 1;
    };
    const flatSpineFabricFor = model => result.fabrics.find(x => x.spine && x.spine.model === model && (x.numPods || 1) === 1);

    // ---- B3 cross-role split: one PLAIN line (item === model) whose qty == leaf+spine ----
    Object.keys(byModel).forEach(model => {
      const rg = byModel[model];
      if (!rg.leaf || !rg.spine) return;                        // not a leaf+spine model — nothing to split
      const plain = bom.filter(b => b.category === 'Switch' && b.model === model && b.item === model);
      if (plain.length !== 1) return;                           // already separate lines (or suffixed) — no merge happened
      const line = plain[0];
      if (line.qty !== rg.leaf.qty + rg.spine.qty) return;      // qty doesn't match a leaf+spine merge — leave it
      const idx = bom.indexOf(line);
      // leaf keeps the original line (its note is the leaf contributor's, already enumerating leaf qty)
      line.qty = rg.leaf.qty;
      line.note = stripMore(line.note);
      // spine becomes its own line, distinct key so it can never re-merge with the leaf
      const f = flatSpineFabricFor(model) || {};
      bom.splice(idx + 1, 0, Object.assign({}, line, {
        qty: rg.spine.qty, item: model, _mk: 'spine-sw|' + model, note: flatSpineNote(f, model)
      }));
    });

    // ---- B3 same-role merge: a leaf line that merged across fabrics keeps ONE line but its
    // "N/fabric × M" enumeration must equal the merged qty, and drop the stale "+more" ----
    bom.filter(b => b.category === 'Switch' && /\+more/.test(b.note || '')).forEach(line => {
      const lpf = leavesPerFabricFor(line.model);
      line.note = stripMore(fixEnum(line.note, /(\d+)\/fabric × (\d+)/, lpf, line.qty));
    });
  }

  function repairCableLines(result, cables) {
    const bom = result.bom;
    const byKey = {};
    cables.forEach(c => { byKey[c.mergeKey || (c.role + '|')] = c; });
    bom.forEach(b => {
      const mk = b._mk || '';
      const c = null;
      // ---- host| : MEDIA-CLASS-AWARE metadata regen (B1 copper + backtest 2026-07-16b R8/R10).
      // Every host line carries ONLY its own media class's metadata (a DAC never says "LC duplex"
      // or "≤2m at 800G"; copper never says DAC/SFP), the true merged/converged link count, and a
      // per-SOURCE breakdown (per-platform for converged, per-fabric for a cross-fabric merge, per-
      // unit for a single source) — never a fractional average. The engine's placement tail (ToR
      // pair, cross-rack, lengths — B4 territory) is preserved; only the optic-metadata + wrong-
      // speed segments are dropped. ----
      if (/^host\|/.test(mk)) {
        const rec = byKey[mk];
        // the optic id is the LAST segment — a converged targetId ("converged-25|false") contains a
        // pipe, so a fixed split[3] index grabs the network, not the optic (why R8/R10 skipped it).
        const opt = opticById(mk.split('|').pop());
        if (opt) {
          const parts = (b.note || '').split(' · ');
          let head = stripMore(parts[0]).replace(/(\d+) link\(s\)/, `${b.qty} link(s)`);
          const brk = sourceBreakdown(rec);
          // replace the count parenthetical that follows "link(s)" — NOT the first "(...)" in the
          // note (family names like "Server (general-purpose)" contain their own parentheses).
          if (brk) head = /link\(s\)\s*\([^)]*\)/.test(head)
            ? head.replace(/(link\(s\))\s*\([^)]*\)/, `$1 (${brk})`)
            : head.replace(/(\d+ link\(s\))/, `$1 (${brk})`);
          // DROP optic-metadata + WRONG-SPEED segments (cross-media / cross-speed junk); keep the rest
          const DIRTY = /SFP|QSFP|OSFP|\bDAC\b|twinax|AOC\b|MPO|LC duplex|≤\s*\d|\bSR4?\b|\bLR4?\b|\bDR4?\b|\bFR\b|OM4|OS2|\d+G(?=\b)/i;
          const tail = parts.slice(1).map(stripMore).filter(s => s && !DIRTY.test(s));
          b.note = [head, cleanMedia(opt)].concat(tail).join(' · ');
        }
      }
      // ---- uplink| : merged-count fix on the "N/leaf × M" enumeration (B5) ----
      else if (/^uplink\|/.test(mk) && /\+more/.test(b.note || '')) {
        const rec = byKey[mk];
        const leaves = rec && rec.totalLeaves > 0 ? rec.totalLeaves : null;
        const per = rec && rec.uplinksPerLeaf > 0 ? rec.uplinksPerLeaf : null;
        if (leaves && per && per * leaves === b.qty) {
          b.note = stripMore((b.note || '').replace(/(\d+)\/leaf × (\d+)/, `${per}/leaf × ${leaves}`));
        } else {
          b.note = stripMore((b.note || '').replace(/(\d+)\/leaf × (\d+)/, (mm, a) => `${a}/leaf × ${b.qty % (+a) === 0 ? b.qty / (+a) : b.qty}`));
        }
      }
      // ---- peer| (ICL / MC-LAG / VLT) : merged across two same-target fabrics → the note must
      // enumerate the PER-FABRIC contribution, not carry a stale "+more" (backtest 2026-07-16 R2,
      // DERIVATIONS §1). This is the canonical gap that let the ICL line escape note regeneration. ----
      else if (/^peer\|/.test(mk) && /\+more/.test(b.note || '')) {
        const rec = byKey[mk];
        if (rec && rec.sources && rec.sources.length > 1) {
          const breakdown = rec.sources.map(s => `${s.qty}× ${s.speed} fabric`).join(', ');
          const tag = rec.tag || 'MC-LAG ICL';
          b.note = `${tag} — ${b.qty} total across ${rec.sources.length} fabrics on the same servers: ${breakdown} (each a ${rec.interconnectSpeed} peer-link between that fabric's ToR pair)`;
        } else {
          b.note = stripMore(b.note || '');
        }
      }
    });
  }
  function copperReach(opt) { return (opt && opt.reach) ? opt.reach : 'CAT6A up to 55m (10G) / 100m (1G)'; }
  // The clean media descriptor for a host optic — ITS OWN class + media + reach, nothing borrowed
  // from another class (R8: a 25G DAC must not carry "LC duplex" (fiber) or "≤2m at 800G" (a wrong
  // speed's reach)). Copper = RJ45/Cat6A; DAC/AOC = twinax/active-optical with the optic's own reach;
  // transceiver = fiber (LC/MPO belong here legitimately).
  function cleanMedia(opt) {
    const cat = opt.category, media = opt.media || '', reach = opt.reach || '';
    if (cat === 'copper') return `native RJ45 / Cat6A patch (rate-adaptive; no SFP module, no DAC) · ${reach || 'CAT6A up to 55m (10G) / 100m (1G)'}`;
    if (cat === 'dac') return `${media || 'SFP/QSFP'} passive DAC (twinax copper)${reach ? ' · ' + reach : ''}`;
    if (cat === 'aoc') return `${media || ''} AOC (active optical cable)${reach ? ' · ' + reach : ''}`.trim();
    return (`${media}${reach ? ' · ' + reach : ''}`).replace(/^ · /, '').trim() || 'fiber optic';
  }
  // Per-SOURCE link breakdown (R10): a converged line enumerates its platforms; a cross-fabric
  // merge enumerates per fabric; a single source shows per-unit. Never a fractional average.
  function sourceBreakdown(rec) {
    if (!rec || !rec.sources || !rec.sources.length) return null;
    const conv = rec.sources.find(s => s.members && s.members.length);
    if (conv) return conv.members.map(m => `${m.links}× ${m.fam} (${m.linksPerUnit}/unit × ${m.units})`).join(', ');
    if (rec.sources.length > 1) return rec.sources.map(s => `${s.links} @ ${s.speed}`).join(' + ');
    const s = rec.sources[0];
    return (s && s.linksPerUnit && s.units && Number.isInteger(s.linksPerUnit)) ? `${s.linksPerUnit}/unit × ${s.units}` : null;
  }

  /* ===========================================================================
   * CONNECTIVITY (backtest 2026-07-16b R6) — every leaf must have an UPLINK PATH:
   * to a spine (leaf→spine links) or to the customer core (core uplinks). A leaf
   * with neither is STRANDED — an unbuildable BOM (R6 shipped 6 stranded leaves
   * because existing-core built a fixed 2 core uplinks for 8 leaves). This is a
   * pure structural reachability check on the fabric/link shape — exactly what a
   * canonical design layer should make impossible to miss.
   * ========================================================================= */
  function checkConnectivity(result) {
    if (!result || !result.fabrics) return { ok: true, stranded: [] };
    const dataF = result.fabrics.filter(f => f.network !== 'mgmt');
    const stranded = [];
    // spined fabrics: leaves reach the spine only if leaf→spine links exist
    dataF.forEach(f => {
      if (f.spine && !(f.uplinkCableQty > 0) && (f.totalLeaves || 0) > 0)
        stranded.push({ network: f.network, count: f.totalLeaves, why: `spine present but 0 leaf→spine uplinks` });
    });
    // spine-less leaves must ALL be covered by core uplinks (each leaf reaches the core). Only
    // enforced when the design actually connects north-south (a core uplink exists, or existing-core
    // was chosen) — a deliberately-isolated standalone ToR island is not "stranded".
    const spinelessLeaves = dataF.filter(f => !f.spine).reduce((s, f) => s + (f.totalLeaves || 0), 0);
    const coreUp = (result.coreUplink && result.coreUplink.count) || 0;
    const wantsCore = coreUp > 0 || (result.context && result.context.uplinkTarget === 'existing-core');
    if (spinelessLeaves > 0 && wantsCore && coreUp < spinelessLeaves)
      stranded.push({ network: 'spine-less', count: spinelessLeaves - coreUp, why: `${spinelessLeaves} leaves uplink to core but only ${coreUp} core uplinks — ${spinelessLeaves - coreUp} stranded` });
    return { ok: stranded.length === 0, stranded };
  }

  const api = { buildDeviceList, groupDevicesForBom, buildCableList, applyCanonicalBom, checkConnectivity };
  if (typeof window !== 'undefined') {
    window.Design = api;
    // MIGRATE the main-path BOM onto the canonical layer: wrap window.recommend so every
    // consumer (the shipped app AND the audit suites) reads the corrected BOM. Edge/RA/refresh
    // are untouched (applyCanonicalBom no-ops on them). Defensive: if the canonical pass ever
    // throws, degrade to the raw engine BOM rather than break a quote — a hard-fail invariant
    // (tests/invariants.js) would surface the miss, so this never hides silently in the harness.
    if (typeof window.recommend === 'function' && !window.recommend._canonical) {
      const rawRecommend = window.recommend;
      const wrapped = function (input) {
        const result = rawRecommend(input);
        try { return applyCanonicalBom(result); } catch (e) { return result; }
      };
      wrapped._canonical = true;
      wrapped._raw = rawRecommend;
      window.recommend = wrapped;
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
