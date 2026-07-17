/* =============================================================================
 * INDEPENDENT PHYSICAL-FEASIBILITY CHALLENGE — targeted-scenario sweep, using
 * the hand-written formulas in tests/harness/lib/feasibility.js (kept
 * DELIBERATELY separate from engine.js/validate.js's own math, so a shared
 * blind spot in the sizing code can't also hide from its own safety net).
 * Sweeps deployments of every size (2 units -> 20,000 endpoints, 1 -> 200
 * racks, 1 -> 1024 AI nodes) at hand-picked, high-signal combinations —
 * complements tests/harness/audit-fuzz.js, which covers the combinatorial
 * space randomly at much higher volume.
 * This is what caught three real gaps (all fixed, see CHANGELOG 0.51.0):
 *   - validate.js's port-budget check divided ICL cable qty by leaf count with
 *     ONE fixed shape, wrong for edge/refresh (leavesPerFabric = total switches,
 *     not pairs) and for the RA collapsed AI compute pair (a direct
 *     point-to-point ISL, not a fan-out) — now shape-aware.
 *   - the NVIDIA 400G AI stack had no spine radix ladder (SN4700 only, 32
 *     ports), so it hit "needs a 3-tier super-spine" around ~500 GPUs while
 *     the equivalent Dell-stack design sailed to ~2,000 — added SN5400 (64
 *     ports) as the intermediate rung, matching Dell's own Z9432F→Z9664F
 *     pattern.
 *   - addLine() only flagged a merged BOM line as "+more" when the incoming
 *     note text differed from the existing one — two identically-sized pools
 *     on the same platform produce byte-identical note text, so the merge
 *     silently understated its own description. Now flags every merge.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm');
const ROOT = 'e:\\vs code\\programs\\Dell Boi';
global.window = {};
['js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
  'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
  'js/validate.js', 'js/engine.js', 'js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync(ROOT + '\\' + f, 'utf8'), { filename: f }));
const C = window.CATALOG;
const { checkAll } = require('./lib/feasibility.js');
let problems = [], runs = 0;
const P = (tag, msg) => problems.push(`[${tag}] ${msg}`);

function run(tag, fn) {
  runs++;
  try {
    const res = fn();
    checkAll(C, tag, res, P);
    return res;
  } catch (e) { P(tag, 'THREW: ' + e.message); return null; }
}

const rec = (...a) => window.recommend(...a);
const recRA = (...a) => window.recommendRA(...a);
const recEdge = (...a) => window.recommendEdge(...a);
const recRefresh = (...a) => window.recommendRefresh(...a);

/* ---- small (2-16) across every platform ---- */
const platIds = C.platforms.map(p => p.id).filter(id => id !== 'poweredge-ai');
[2, 4, 8, 16].forEach(u => platIds.forEach(pid => {
  run(`small:${pid}@${u}`, () => rec({ platformId: pid, units: u, redundancy: 'dual', includeMgmt: true }));
  run(`small-single:${pid}@${u}`, () => rec({ platformId: pid, units: u, redundancy: 'single', includeMgmt: true }));
}));

/* ---- medium (24-240), crossing leaf-model transitions ---- */
[24, 48, 96, 150, 240].forEach(u => {
  run(`med-25g@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' }));
  run(`med-100g@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, trafficProfile: 'ew' }));
});
['powerstore', 'powerflex', 'powermax', 'powerscale', 'objectscale', 'apex-hci', 'vxrail', 'mx7000', 'powervault-me5'].forEach(pid => {
  [24, 120, 252, 300].forEach(u => run(`med:${pid}@${u}`, () => rec({ platformId: pid, units: u, redundancy: 'dual', includeMgmt: true })));
});

/* ---- large / extreme (500-5000 units), multi-rack to 200 racks ---- */
[500, 2000, 5000].forEach(u => {
  run(`large@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' }));
  run(`large-100g@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, trafficProfile: 'ew' }));
});
[10, 50, 100, 200].forEach(racks => run(`mrack@${racks}`, () => rec({ platformId: 'poweredge-general', units: racks * 16, racks, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' })));

/* ---- AI/GPU clusters, both stacks, 1 - 1024 nodes (the NVIDIA radix ladder regression) ---- */
['dell', 'nvidia'].forEach(stack => {
  [1, 4, 16, 32, 33, 64, 65, 128, 256, 512, 1024].forEach(nodes => {
    run(`ai:${stack}@${nodes}n`, () => rec({ platformId: 'poweredge-ai', units: nodes, gpusPerServer: 8, modelId: 'xe9680', stack, redundancy: 'dual', includeMgmt: true }));
  });
  [64, 128, 256].forEach(nodes => run(`ai-bw:${stack}@${nodes}n`, () => rec({ platformId: 'poweredge-ai', units: nodes, gpusPerServer: 8, modelId: 'xe9780', stack, redundancy: 'dual', includeMgmt: true })));
});
(C.referenceArchitectures || []).forEach(ra => {
  [1, Math.floor(ra.maxGpuNodes / 2), ra.maxGpuNodes].forEach(n => run(`ra:${ra.id}@${n}`, () => recRA(ra.id, n)));
});
// REGRESSION GUARD: 64-GPU-node (512-GPU) NVIDIA 400G design must NOT need a 3-tier super-spine.
// The 400G NVIDIA AI leaf AND spine are Spectrum-4 SN5600 (GB200 RA: "two SN5600 switches as the
// aggregation layer or spine layer") — the old SN4700→SN5400 ladder existed only because the AI
// spine used to be the 32-port Spectrum-3. Spine COUNT is port math (ceil(uplinks/radix)), so it
// must stay a small handful here, never one-spine-per-uplink.
(function () {
  const res = rec({ platformId: 'poweredge-ai', units: 64, gpusPerServer: 8, modelId: 'xe9680', stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
  if (res.warnings.some(w => /leaves exceed the .* spine radix|spine tier OVER-COMMITTED/i.test(w.message))) P('nvidia-radix-ladder', '64-node/512-GPU NVIDIA 400G design falsely needs a 3-tier super-spine');
  if (res.warnings.some(w => w.severity === 'error')) P('nvidia-radix-ladder', 'unexpected hard error on a 512-GPU NVIDIA design: ' + res.warnings.filter(w => w.severity === 'error').map(w => w.message).join(' | '));
  const f = res.fabrics.find(x => x.workload === 'ai');
  if (f.spine.model !== 'SN5600') P('nvidia-radix-ladder', `expected the SN5600 Spectrum-4 spine (GB200 RA), got ${f.spine.model}`);
  const totalUp = f.totalLeaves * (f.uplinksPerLeaf || 0);
  if (f.spineCount > (f.uplinksPerLeaf || 0)) P('nvidia-radix-ladder', `spineCount ${f.spineCount} > uplinksPerLeaf ${f.uplinksPerLeaf} — a leaf can't reach every spine`);
  if (f.spineCount * 128 < totalUp) P('nvidia-radix-ladder', `spine ports don't cover the uplinks: ${f.spineCount}×128 < ${totalUp}`);
  if (f.spineCount > Math.max(2, Math.ceil(totalUp / 128))) P('nvidia-radix-ladder', `spine OVERBUILD: ${f.spineCount} spines where port math needs ${Math.max(2, Math.ceil(totalUp / 128))}`);
})();

/* REGRESSION GUARDS from the combinatorial-fuzz pass (see audit-fuzz.js + CHANGELOG 0.52.0):
 * four real port-overcommit gaps, all on leaves with NO genuine dedicated fabric-uplink port
 * class (S5232F/Z9432F/etc., or an AI leaf whose catalog "uplink" is a mgmt/breakout-assist
 * port like SN5610's). Pin each minimal repro down explicitly, independent of fuzz RNG luck. */
(function () {
  // 1. shared spine group pulls in a small fabric that fit standalone, needing more uplinks
  //    than it reserved — must not overcommit its own access pool.
  const res = rec({
    targets: [{ platformId: 'poweredge-general', units: 19, modelId: 'r660' }, { platformId: 'apex-hci', units: 150 }, { platformId: 'powerscale', units: 67, modelId: 'f210' }],
    redundancy: 'dual', growthHeadroom: 0, includeMgmt: true, nos: 'os10', placement: 'adjacent', leaf100: 's5232f',
    storageProtocol: 'nvme-roce', fabricInterconnect: 'independent', stack: 'dell', nic: { vendor: 'NVIDIA', speed: '40GbE', portsPerNic: 1, nicsPerUnit: 3 }
  });
  checkAll(C, 'regress-shared-spine-overcommit', res, P);
  // 2. a plain ToR pair (no spine) whose host links alone already fill a no-dedicated-uplink
  //    leaf's radix must still leave room for the MC-LAG peer-link.
  const res2 = rec({
    platformId: 'objectscale', units: 8, modelId: 'xf960', redundancy: 'dual', growthHeadroom: 0, includeMgmt: true,
    separateFabrics: true, nic2: { vendor: 'NVIDIA', speed: '40GbE', portsPerNic: 4, nicsPerUnit: 2 }
  });
  checkAll(C, 'regress-tor-pair-icl-squeeze', res2, P);
  // 3. an AI-PLATFORM target's non-rail (general-workload) NIC group on the NVIDIA stack lands
  //    on an AI-class leaf (SN4700/SN5610) whose small "uplink" field is NOT a real fabric pool.
  const res3 = rec({
    targets: [{ platformId: 'poweredge-ai', units: 29, gpusPerServer: 1, railNic: { speed: '400GbE', model: 'ConnectX-8' }, nic: { vendor: 'Intel', speed: '100GbE', portsPerNic: 2, nicsPerUnit: 2 } }],
    redundancy: 'dual', growthHeadroom: 0, includeMgmt: true, nos: 'os10', placement: 'adjacent', stack: 'nvidia'
  });
  checkAll(C, 'regress-ai-platform-general-nic-on-nvidia-leaf', res3, P);
  // 4. PowerScale back-end (int-a/int-b, always independent — no ICL) must stay FLAT at 50
  //    nodes, not get pushed into an unwanted spine tier by an unneeded ICL reservation.
  const res4 = rec({ platformId: 'powerscale', units: 50, modelId: 'f710', redundancy: 'dual', includeMgmt: true });
  const be4 = res4.fabrics.find(f => f.network === 'backend');
  if (!be4 || be4.spine || be4.redundancyMethod !== 'independent-ab') P('regress-powerscale-be-flat', `50-node PowerScale back-end should stay flat (no spine, independent-ab) — got spine=${!!(be4 && be4.spine)} method=${be4 && be4.redundancyMethod}`);
})();

/* ---- edge/campus + refresh at scale ---- */
[48, 500, 5000, 20000].forEach(endpoints => run(`edge@${endpoints}`, () => recEdge({ endpoints, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true })));
[2, 64, 256].forEach(swCount => run(`refresh@${swCount}`, () => recRefresh({ swCount, portsPer: 48, speedNow: '10G', targetSpeed: '25g', topologyNow: '3tier', distribution: 'new', includeMgmt: true })));

/* ---- breakout stress ---- */
[40, 200, 800].forEach(u => run(`brk@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, breakout: 'on', nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, trafficProfile: 'ew' })));
[32, 128].forEach(nodes => run(`brk-ai@${nodes}`, () => rec({ platformId: 'poweredge-ai', units: nodes, gpusPerServer: 8, modelId: 'xe9780', stack: 'dell', redundancy: 'dual', includeMgmt: true })));

/* ---- leaf100 override + storage protocol x breakout interactions ---- */
['auto', 's5448f', 's5232f', 'z9264f'].forEach(l => [8, 100, 300].forEach(u =>
  run(`leaf100:${l}@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, leaf100: l, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, trafficProfile: 'ew' }))));
/* ---- leaf25 override — same shape as leaf100, across every explicit model x a range of scales
   (incl. the exact 4-leaf/2-spine deal size the override was built for, and a deliberately-
   mismatched extreme (S5212F forced at 300 units) to confirm the physical-fit growth pass
   still holds at any forced starting radix) ---- */
['auto', 's5212f', 's5224f', 's5248f', 's5296f'].forEach(l => [8, 120, 300].forEach(u =>
  run(`leaf25:${l}@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, leaf25: l, trafficProfile: 'balanced' }))));
['iscsi', 'nvme-tcp', 'nvme-roce'].forEach(proto => ['auto', 'on'].forEach(brk =>
  run(`proto-brk:${proto}/${brk}`, () => rec({ platformId: 'powerstore', units: 40, modelId: 'ps9200', redundancy: 'dual', includeMgmt: true, storageProtocol: proto, breakout: brk }))));

/* ---- PowerScale 252-node cluster boundary (independent) ---- */
[251, 252, 253, 300].forEach(n => {
  const res = rec({ platformId: 'powerscale', units: n, modelId: 'f710', redundancy: 'dual', includeMgmt: true });
  const hasErr = res.warnings.some(w => w.severity === 'error' && /252-node/.test(w.message));
  if (n > 252 && !hasErr) P(`ps252@${n}`, 'expected 252-node hard error, missing');
  if (n <= 252 && hasErr) P(`ps252@${n}`, 'unexpected 252-node hard error at/below the cap');
});

/* ---- border-leaf + core uplink at scale ---- */
[8, 200, 1000].forEach(u => run(`borderleaf@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew', includeCoreUplink: true, coreSpeed: '400GbE', coreCount: 2, borderLeaf: true })));

/* ---- kitchen sink: unlimited heterogeneous targets + racks + breakout + AI ---- */
run('kitchen-sink', () => rec({
  targets: [
    { platformId: 'poweredge-general', units: 300 }, { platformId: 'poweredge-general', units: 4 }, { platformId: 'poweredge-general', units: 4 },
    { platformId: 'powerstore', units: 20, modelId: 'ps9200' }, { platformId: 'powerscale', units: 40, modelId: 'f710' },
    { platformId: 'poweredge-ai', units: 32, gpusPerServer: 8, modelId: 'xe9680' }
  ], stack: 'dell', racks: 25, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew', breakout: 'auto', nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }
}));

/* ---- 3-TIER CLOS (super-spine) — dedicated sweep across scale, workload, and stack ---- */
[1200, 2000, 3500, 6000].forEach(u => run(`3tier-general@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', racks: Math.ceil(u / 16) })));
[1200, 3000].forEach(u => run(`3tier-100g@${u}`, () => rec({ platformId: 'poweredge-general', units: u, redundancy: 'dual', includeMgmt: true, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, trafficProfile: 'ew', racks: Math.ceil(u / 16) })));
['dell', 'nvidia'].forEach(stack => [2000, 4000].forEach(nodes =>
  run(`3tier-ai:${stack}@${nodes}n`, () => rec({ platformId: 'poweredge-ai', units: nodes, gpusPerServer: 8, modelId: 'xe9680', stack, redundancy: 'dual', includeMgmt: true, racks: Math.ceil(nodes / 4) }))));
run('3tier-powerscale-backend', () => rec({ platformId: 'powerscale', units: 252, modelId: 'f710', redundancy: 'dual', includeMgmt: true, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 2 } }));
// REGRESSION GUARD: exact structure for a known 3000-unit general design (pins the pod/super-
// spine math down independent of the fuzzer's random luck).
// NOTE: this scenario used to be pinned at 2000 units/32 pod-spines. Bumped to 3000 when a
// missing Z9264F-ON spine rung was fixed in pickSpine() (js/engine.js) — Z9264F-ON (64×100G
// native) is now correctly considered for 100G-class general spines between the S5232F-ON
// small-spine special-case (≤8 leaves) and the old Z9432F-ON/Z9664F-ON (400G-native, needs
// breakout for 100G) fallback. A flat 2000-unit design's ~54 leaves now fits entirely within
// Z9264F-ON's 64-port radix, so it no longer needs — or should build — a 3-tier Clos.
// UPDATED (2026-07-15, G-007 follow-up): 3000 units (~80 leaves, Z9432F-ON spine, raw radix 32)
// used to spuriously trigger 3-tier here — the trigger read the raw native spine radix, not the
// spine's REAL breakout-credited capacity (a cataloged 4× breakout to 100G uplinks the actual
// BOM already prices, giving 128 effective ports — plenty for 80 leaves flat). Fixed by crediting
// the trigger with the SAME resolveUplinkBreakout() the real cabling uses (never a naive speed
// guess — see the AI-only phantom-credit lesson this round). 10000 units (~262 leaves) is now
// the smallest round scenario that genuinely exceeds even the breakout-credited radix (128).
(function () {
  const res = rec({ platformId: 'poweredge-general', units: 10000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const f = res.fabrics.find(x => x.network === 'frontend');
  if (!f.superSpine) { P('3tier-regression', 'a 10000-server design should trigger a 3-tier Clos (super-spine), got none'); return; }
  // sanity: the OLD false-trigger scale must now correctly stay FLAT — a design that fits within
  // the breakout-credited radix must not build spurious pod-spine/super-spine hardware.
  const stays2Tier = rec({ platformId: 'poweredge-general', units: 3000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const s2f = stays2Tier.fabrics.find(x => x.network === 'frontend');
  if (s2f.superSpine || (s2f.numPods || 1) > 1) P('3tier-regression', `3000-unit design (fits the breakout-credited radix) should stay flat 2-tier, got numPods=${s2f.numPods}, superSpine=${s2f.superSpine && s2f.superSpine.model}`);
  if (f.numPods !== 5) P('3tier-regression', `expected 5 pods, got ${f.numPods}`);
  if (f.totalPodSpines !== 40) P('3tier-regression', `expected 40 total pod-spines, got ${f.totalPodSpines}`);
  if (f.superSpineCount !== 8) P('3tier-regression', `expected 8 super-spines, got ${f.superSpineCount}`);
  const podSpineLine = res.bom.find(b => /Pod-spine/.test(b.item || ''));
  const superSpineLine = res.bom.find(b => /Super-spine/.test(b.item || ''));
  if (!podSpineLine || podSpineLine.qty !== 40) P('3tier-regression', `pod-spine BOM line wrong: ${podSpineLine && podSpineLine.qty}`);
  if (!superSpineLine || superSpineLine.qty !== 8) P('3tier-regression', `super-spine BOM line wrong: ${superSpineLine && superSpineLine.qty}`);
  if (podSpineLine && superSpineLine && podSpineLine.model === superSpineLine.model && podSpineLine._mk === superSpineLine._mk)
    P('3tier-regression', 'pod-spine and super-spine BOM lines share a mergeKey — would silently merge when same model');
  if (res.warnings.some(w => w.severity === 'error')) P('3tier-regression', 'unexpected hard error on a clean 3-tier design: ' + res.warnings.filter(w => w.severity === 'error').map(w => w.message).join(' | '));
})();

// REGRESSION GUARD: brownfield "reuse existing spine" must NOT silently drop a NEWLY-required
// 3rd tier from the BOM. Found live: a deploy:'add' + reuseExistingSpine:true design that grows
// past 2-tier feasibility skipped the ENTIRE pod-spine/super-spine switch+cable BOM (the shortcut
// assumes the customer's existing flat spine already covers the add-on — false once a super-spine
// tier that never existed before is now required). Pin the exact same 10000-unit shape as the
// plain 3-tier regression above (see its note re: the breakout-credited-radix fix), and demand
// the tier still ships.
(function () {
  const res = rec({ platformId: 'poweredge-general', units: 10000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', deployType: 'add', reuseExistingSpine: true });
  const f = res.fabrics.find(x => x.network === 'frontend');
  if (!f.superSpine) { P('reuse-spine-3tier-regression', 'a 10000-server brownfield reuse-spine design should still trigger a 3-tier Clos, got none'); return; }
  const podSpineLine = res.bom.find(b => /Pod-spine/.test(b.item || ''));
  const superSpineLine = res.bom.find(b => /Super-spine/.test(b.item || ''));
  if (!podSpineLine || podSpineLine.qty !== 40) P('reuse-spine-3tier-regression', `reuse-spine brownfield add dropped/mis-sized the pod-spine BOM line: ${podSpineLine && podSpineLine.qty}`);
  if (!superSpineLine || superSpineLine.qty !== 8) P('reuse-spine-3tier-regression', `reuse-spine brownfield add dropped/mis-sized the super-spine BOM line: ${superSpineLine && superSpineLine.qty}`);
  // NOTE (updated 2026-07-15, G-001): at this scale the super-spine now steps to the SAME-SPEED
  // rung (Z9664F-ON, 400GbE/64 native — same speed as the Z9432F-ON pod-spine, just higher
  // radix), not the 1.6TbE flagship — so this hop gets a plain same-speed cable line, not a
  // breakout. Kept as an either/or check (cable line OR an explanatory "no cataloged breakout"
  // warning) since a smaller-scale variant of this same test could still land on a genuine
  // cross-speed flagship step (e.g. a Z9864F-ON pod-spine, which has no same-speed rung — see
  // pickSuperSpine()) where there's no cataloged breakout (deliberate, per v0.54.2/.3 — never
  // silently substitute a wrong-connector cable) and the tool correctly WARNS instead. Either
  // outcome is valid here — what must NOT happen is a silent gap (no cable line AND no warning).
  const superCableLine = res.bom.find(b => /pod-spine ↔ super-spine/.test(b.item || b.note || ''));
  const noCableWarned = res.warnings.some(w => /no cataloged breakout connects/.test(w.message));
  if (!superCableLine && !noCableWarned) P('reuse-spine-3tier-regression', 'reuse-spine brownfield add dropped the pod-spine↔super-spine cabling BOM line with no explanatory warning');
  if (!res.warnings.some(w => /no longer fully covers this scale/i.test(w.message)))
    P('reuse-spine-3tier-regression', 'no explicit warning telling the rep "reuse existing spine" no longer covers the new 3-tier hardware');
  // sanity: a SMALL brownfield reuse-spine add (stays flat 2-tier) must still skip spine BOM lines —
  // confirms the fix didn't regress the original, still-legitimate shortcut.
  const small = rec({ platformId: 'poweredge-general', units: 100, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', deployType: 'add', reuseExistingSpine: true });
  const smallF = small.fabrics.find(x => x.network === 'frontend');
  if (smallF.spine && (smallF.numPods || 1) === 1 && (small.bom || []).some(b => b.category === 'Switch' && b.model === smallF.spine.model))
    P('reuse-spine-3tier-regression', 'small flat-2-tier brownfield reuse-spine design unexpectedly has a spine BOM line (should be skipped, existing spine reused)');
})();

// REGRESSION GUARD: pod-spine↔super-spine cabling must match the ACTUAL super-spine's port
// speed, not silently reuse the pod-spine's speed. Found live (independent fresh-agent review,
// not caught by any prior automated check): pickSuperSpine() can step up to a higher-radix
// FLAGSHIP switch (Z9964F-ON @1.6TbE for Dell) with a DIFFERENT native port speed than the
// pod-spine (e.g. Z9864F-ON @800GbE). The original code priced the link at the pod-spine's speed
// unconditionally, AND pickBreakout() used a loose `highG >= X` match that let an 1.6T port
// silently match the 800G→2x400G breakout SKU (a different physical connector) whenever lowG
// happened to coincide — dormant until pickSuperSpine became the first-ever caller able to pass a
// 1.6T highG. Both fixed: pickBreakout() now matches highG exactly, and the cabling code
// breakout-detects the pod-spine/super-spine speed gap like leaf→spine already does, falling back
// to an explicit "no cataloged optic — engage Dell Advanced Engineering" warning instead of
// silently shipping a physically-incompatible cable when the catalog genuinely has no part for it
// (true today for 1.6TbE — no OSFP224 optic/breakout exists in the catalog at any speed).
// UPDATED 2026-07-16d (R12 super-spine ruling): this guard used to REQUIRE the flagship step-up and
// then accept a "no cataloged optic" warning as the outcome. That expectation was itself
// phantom-backed — its own comment above concedes "no OSFP224 optic/breakout exists in the catalog
// at any speed", i.e. the tier it demanded could never be cabled. The ruling makes the ladder
// part-evidence-gated: a super-spine candidate qualifies only if it can TERMINATE the pod-spine's
// uplink speed (native, or a cataloged breakout with far-ends that seat). So the correct shape here
// is a SAME-SPEED super-spine (Z9864F-ON ↔ Z9864F-ON @800G, DAC-O112-800G cataloged), with the tier
// widening by port math. The teeth are kept and sharpened: whatever model is chosen, the cabling
// must physically match its ports, and the tier must be explained rather than silently absent.
(function () {
  // large enough Dell AI fabric to force a 3-tier Clos on Z9864F-ON (800GbE, 64 native ports).
  const res = rec({ platformId: 'poweredge-ai', units: 4000, gpusPerServer: 8, modelId: 'xe9680', stack: 'dell', redundancy: 'dual', includeMgmt: true, racks: 200 });
  const f = res.fabrics.find(x => x.network === 'aifabric');
  if (!f.superSpine) { P('superspine-cable-speed-regression', 'expected this scale to trigger a 3-tier Clos, got no super-spine'); return; }
  // The super-spine must be able to terminate the pod-spine's links. Same-speed is the expected
  // outcome today; a DIFFERENT model is only legitimate if the speeds match or a real breakout
  // exists — never "bigger radix, no part" (the phantom the ruling killed).
  if (f.spine.access.speed !== f.superSpine.access.speed) {
    const brkLine = res.bom.find(b => /pod-spine ↔ super-spine/.test(b.item || '') && /→|2x|4x/i.test(b.item || ''));
    if (!brkLine) P('superspine-cable-speed-regression', `super-spine ${f.superSpine.model} (${f.superSpine.access.speed}) differs in speed from pod-spine ${f.spine.model} (${f.spine.access.speed}) with NO cataloged breakout line — phantom radix credit (R12 ruling 2026-07-16d)`);
  }
  // a passed-over flagship must be EXPLAINED as a parts decision, not left as a silent oddity
  if (f.spine.model === f.superSpine.model && !res.warnings.some(w => /no cataloged .*-capable connection|PARTS decision/i.test(w.message)))
    P('superspine-cable-speed-regression', 'same-speed super-spine tier chosen but no info line explains why the higher-radix flagship was passed over — reads as an error, not a parts decision');
  const cableLine = res.bom.find(b => /pod-spine ↔ super-spine/.test(b.item || ''));
  const wrongSpeedCable = cableLine && /400G-Q56DD|dr4-400g/i.test(cableLine.item || '');
  if (wrongSpeedCable) P('superspine-cable-speed-regression', `pod-spine↔super-spine cable line "${cableLine.item}" is a 400G optic but the super-spine (${f.superSpine.model}) is ${f.superSpine.access.speed} — physically wrong connector, regressed`);
  const wrongBreakout = cableLine && /800G2x400G/i.test(cableLine.item || '') && f.superSpine.access.speed !== '800GbE';
  if (wrongBreakout) P('superspine-cable-speed-regression', `pod-spine↔super-spine breakout "${cableLine.item}" is an 800G-native assembly but the super-spine port is ${f.superSpine.access.speed} — physically wrong connector, regressed`);
  const flaggedUncataloged = res.warnings.some(w => /no cataloged (breakout|optic)/i.test(w.message));
  if (!cableLine && !flaggedUncataloged) P('superspine-cable-speed-regression', 'no pod-spine↔super-spine cable line AND no "uncataloged" warning — silently missing cabling with no explanation');
})();

// REGRESSION GUARD: LAYER-3 physical optic compatibility (checkOpticSpeedMatch in feasibility.js).
// Found via a systematic pick*() audit prompted by the super-spine bug above: pickHostCable and
// pickUplinkCable used LOOSE `gbps >= X` thresholds throughout, not just at the one super-spine
// call site — the exact same disease, reachable from several other places once looked for.
// Fixed every pick*() function to exact-match cataloged tiers and return null (never silently
// substitute) for genuinely uncataloged combinations. Two anchor cases, pinned directly (the
// layer-3 check itself now runs on every scenario in every suite as ongoing protection — these
// exist as human-readable documentation of what specifically broke, not the only net catching it).
(function () {
  // 1. 40GbE legacy QSFP+ NIC — pickLeaf routes it to S5232F-ON, but NO 40G optic is cataloged at
  // all (only 25G/100G neighbors exist) — `gbps >= 25` used to silently substitute a 25G DAC on a
  // 40G port. Must now be null + an explicit warning, never a wrong-speed line.
  const r40 = rec({ platformId: 'poweredge-general', units: 20, redundancy: 'dual', includeMgmt: true, nic: { vendor: 'Intel', speed: '40GbE', portsPerNic: 2, nicsPerUnit: 2 } });
  const f40 = r40.fabrics.find(x => x.network === 'frontend');
  if (f40 && f40.leaf && f40.leaf.access && f40.leaf.access.speed === '40GbE') {
    const hostLine40 = r40.bom.find(b => b.category === 'Cable/Optic' && /25G/i.test(b.item || '') && /host/i.test(b.note || ''));
    if (hostLine40) P('layer3-regression', `40GbE host NIC silently got a 25G cable line: "${hostLine40.item}"`);
    if (!r40.warnings.some(w => /no cataloged .*40GbE/i.test(w.message)))
      P('layer3-regression', '40GbE host NIC produced no explicit "no cataloged" warning');
  }
  // 2. border-leaf uplink to a 1.6TbE flagship super-spine — pickUplinkCable's OLD `gbps >= 800`
  // silently matched the 800G DAC for a 1.6T port too. Reuse the same 4000-unit AI scenario (which
  // pins a 1.6T super-spine above) plus a border-leaf request.
  const r1600 = rec({ platformId: 'poweredge-ai', units: 4000, gpusPerServer: 8, modelId: 'xe9680', stack: 'dell', redundancy: 'dual', includeMgmt: true, racks: 200, includeCoreUplink: true, coreSpeed: '100GbE', coreCount: 2, borderLeaf: true });
  const wrongBorderCable = r1600.bom.find(b => /border-leaf ↔ spine/.test(b.item || '') && /800G-O112|DAC-O112-800G-xM/i.test(b.item || ''));
  if (wrongBorderCable) {
    const bl = r1600.fabrics.find(f => f.superSpine);
    if (bl && bl.superSpine.access.speed !== '800GbE')
      P('layer3-regression', `border-leaf uplink got an 800G DAC but attaches to a ${bl.superSpine.access.speed} super-spine — physically wrong connector, regressed`);
  }
})();

// REGRESSION GUARD: 1G/10G copper (Base-T) and 1G fiber host NICs — a distinct PHYSICAL MEDIA,
// not just a speed. UPDATED 2026-07-15 (user-directed, real hardware correction): Base-T copper
// hosts route to the NATIVE RJ45 leaf (S4348T-ON — same 48-port/6x100G-uplink tier as S4348F-ON,
// confirmed in the catalog) with a plain Cat6A patch cable, not the older "SFP+ fiber leaf + an
// electrical SFP-1G-T/SFP-10G-T module" workaround — S4348T-ON's RJ45 ports are natively
// multi-rate (1G and 10G auto-negotiate on the same port), so it's both the more accurate and
// the more practical pick. Non-Base-T fiber hosts (1GbE/10GbE) are unaffected — still SFP/DAC.
(function () {
  ['1GBase-T', '10GBase-T'].forEach(speed => {
    const res = rec({ platformId: 'poweredge-general', units: 30, redundancy: 'dual', includeMgmt: true, nic: { vendor: 'Intel', speed, portsPerNic: 2, nicsPerUnit: 2 } });
    const f = res.fabrics.find(x => x.network === 'frontend');
    if (!f || !f.leaf) { P('basetnic-regression', `${speed}: no frontend fabric/leaf produced`); return; }
    if (f.leaf.model !== 'S4348T-ON')
      P('basetnic-regression', `${speed}: unexpected leaf ${f.leaf.model} — Base-T copper NICs should land on the native RJ45 ToR (S4348T-ON), not a fiber leaf + module`);
    const opt = C.optics.find(o => o.id === 'cat6a-host');
    const hostLine = res.bom.find(b => b.category === 'Cable/Optic' && b.model === opt.desc);
    if (!hostLine) P('basetnic-regression', `${speed}: expected native Cat6A host cable "cat6a-host" not found in BOM`);
    if (opt && !/RJ45/i.test(opt.media)) P('basetnic-regression', `${speed}: catalog entry cat6a-host media "${opt.media}" doesn't match expected pattern`);
    if (res.bom.some(b => /SFP-1G-T|SFP-10G-T/i.test(b.item || ''))) P('basetnic-regression', `${speed}: still shipping an electrical SFP module alongside the native RJ45 leaf`);
    if (res.warnings.some(w => w.severity === 'error')) P('basetnic-regression', `${speed}: unexpected hard error`);
  });

  const fiberCases = [
    { speed: '1GbE', wantId: 'sfp-1g-sx', wantMedia: /SFP\b/i },
    { speed: '10GbE', wantId: 'dac-10g-sfpp', wantMedia: /SFP\+/i },
  ];
  fiberCases.forEach(({ speed, wantId, wantMedia }) => {
    const res = rec({ platformId: 'poweredge-general', units: 30, redundancy: 'dual', includeMgmt: true, nic: { vendor: 'Intel', speed, portsPerNic: 2, nicsPerUnit: 2 } });
    const f = res.fabrics.find(x => x.network === 'frontend');
    if (!f || !f.leaf) { P('basetnic-regression', `${speed}: no frontend fabric/leaf produced`); return; }
    if (!/S4348F|S5248F|S5296F/i.test(f.leaf.model))
      P('basetnic-regression', `${speed}: unexpected leaf ${f.leaf.model} — fiber hosts should land on a standard SFP+ leaf`);
    const opt = C.optics.find(o => o.id === wantId);
    const hostLine = res.bom.find(b => b.category === 'Cable/Optic' && b.model === opt.desc);
    if (!hostLine) P('basetnic-regression', `${speed}: expected host cable "${wantId}" not found in BOM`);
    if (opt && !wantMedia.test(opt.media)) P('basetnic-regression', `${speed}: catalog entry ${wantId} media "${opt.media}" doesn't match expected pattern`);
    if (res.warnings.some(w => w.severity === 'error')) P('basetnic-regression', `${speed}: unexpected hard error`);
  });
})();

// REGRESSION GUARD: NVIDIA 3-tier flagship step-up (SN6810). With SN5600 (128×400G) as the AI
// leaf/spine, 2-tier now reaches much further — 300 nodes (2400 GPUs) correctly stays FLAT
// (128-radix spine covers ~47 leaves easily; the old SN4700/SN5400 forced 3-tier here). True
// 3-tier now starts when leaves outgrow the spine radix (~820+ nodes) — pin both behaviors.
// (Known follow-up, documented: the pod-spine COUNT inside a 3-tier still uses the strict
// k-per-uplink formula, so totalPodSpines can exceed the SN6810's radix and legitimately fire
// the 4th-tier warning — deliberate honesty at a scale far outside this tool's deal size.)
(function () {
  const flat = rec({ platformId: 'poweredge-ai', units: 300, gpusPerServer: 8, modelId: 'xe9680', stack: 'nvidia', redundancy: 'dual', includeMgmt: true, racks: 75 });
  const ff = flat.fabrics.find(x => x.network === 'aifabric');
  if (ff.superSpine) P('nvidia-flagship-regression', '300-node/2400-GPU NVIDIA AI should stay FLAT 2-tier on 128-radix SN5600 spines, got a 3-tier Clos');
  if (ff.spine && ff.spine.model !== 'SN5600') P('nvidia-flagship-regression', `300-node spine should be SN5600, got ${ff.spine && ff.spine.model}`);
  const res = rec({ platformId: 'poweredge-ai', units: 900, gpusPerServer: 8, modelId: 'xe9680', stack: 'nvidia', redundancy: 'dual', includeMgmt: true, racks: 225 });
  const f = res.fabrics.find(x => x.network === 'aifabric');
  if (!f.superSpine) { P('nvidia-flagship-regression', '900-node (7200-GPU) NVIDIA AI fabric should trigger a 3-tier Clos, got none'); return; }
  if (f.superSpine.model !== 'SN6810') P('nvidia-flagship-regression', `expected SN6810 flagship super-spine, got ${f.superSpine.model}`);
  if ((f.superSpine.access && f.superSpine.access.count) !== 128) P('nvidia-flagship-regression', `SN6810 should have 128 access ports, catalog says ${f.superSpine.access && f.superSpine.access.count}`);
})();

console.log(`\nINDEPENDENT PHYSICAL-FEASIBILITY CHALLENGE: ${runs} designs checked`);
if (problems.length) { console.log(`PROBLEMS (${problems.length}):`); problems.forEach(p => console.log('  ' + p)); process.exit(1); }
else console.log('ALL INDEPENDENT INVARIANTS HOLD');
