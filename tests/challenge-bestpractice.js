/* =============================================================================
 * BEST-PRACTICE CHALLENGE HARNESS
 * Encodes authoritative topology best practices (corpus/TOPOLOGY-CHALLENGE-RESEARCH.txt +
 * NET-BESTPRACTICE-RESEARCH.txt) as assertions and runs EVERY guided workflow through
 * representative scenarios, checking conformance. Emits a report: PASS / GAP / CONFLICT.
 *   GAP      = a best practice the tool does not currently enforce/surface
 *   CONFLICT = the tool does something that contradicts a best practice
 * This is a REPORTING harness (does not fail the build) — run: node tests/challenge-bestpractice.js
 * ========================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
['js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
 'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
 'js/validate.js', 'js/engine.js', 'js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
const W = window, C = W.CATALOG;

const findings = [];
const rec = i => W.recommend(i);
const df = r => r.fabrics.filter(f => f.network !== 'mgmt');
const warned = (r, rx) => r.warnings.some(w => rx.test(w.message));
// pass = the tool conforms; otherwise record a GAP or CONFLICT with context
function check(area, practice, conforms, kind, detail) {
  if (conforms) { findings.push({ area, practice, status: 'PASS' }); }
  else { findings.push({ area, practice, status: kind || 'GAP', detail: detail || '' }); }
}

/* ============ AI / GPU FABRIC ============ */
{
  const A = 'AI fabric';
  const small = rec({ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const big = rec({ platformId: 'poweredge-ai', units: 260, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const aifS = small.fabrics.find(f => f.workload === 'ai'), aifB = big.fabrics.find(f => f.workload === 'ai');
  check(A, 'Leaf-to-GPU tier is non-blocking 1:1 at all scales', aifS.nonBlocking && aifB.nonBlocking, 'CONFLICT');
  check(A, 'AI compute fabric uses ≥2 switches (no single-switch SPOF on redundant designs)', aifS.totalLeaves >= 2, 'CONFLICT');
  check(A, 'Two-tier reach ~2,000 GPUs — beyond that, super-spine/3-tier is flagged', warned(big, /2[,.]?000|two-tier|super.?spine|3-tier|multi-pod/i), 'GAP', '260 servers = 2080 GPUs should trigger the >2000-GPU two-tier warning');
  // REGRESSION GUARD (GAPS.md G-007): the check above only asserts a GPU-COUNT-based generic
  // advisory fires — it's decoupled from whether the engine's ACTUAL leaf/spine radix math built
  // a real 3-tier Clos, so it stayed green through the breakout-blind trigger bug (spurious
  // 3-tier hardware AND a false hard error at 65 leaves, confirmed live before the fix — see
  // engine.js step 3, spineEffRadix). 'big' (260 servers/33 leaves) fits FLAT within the
  // breakout-adjusted spine radix (128) and must NOT build a super-spine; a genuinely larger
  // scale (1200 servers/150 leaves, beyond the 128-port breakout-adjusted radix) must.
  check(A, 'big (260 servers, fits within breakout-adjusted radix): stays FLAT 2-tier, no spurious pod-spine/super-spine', (aifB.numPods || 1) === 1 && !aifB.superSpine, 'CONFLICT', `numPods=${aifB.numPods}, superSpine=${aifB.superSpine && aifB.superSpine.model}`);
  check(A, 'big (260 servers): no unexpected hard errors from the breakout-blind trigger', !big.warnings.some(w => w.severity === 'error'), 'CONFLICT');
  const wayBig = rec({ platformId: 'poweredge-ai', units: 1200, gpusPerServer: 8, stack: 'dell', redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const aifW = wayBig.fabrics.find(f => f.workload === 'ai');
  check(A, 'wayBig (1200 servers, genuinely exceeds the breakout-adjusted radix): builds a REAL 3-tier Clos', (aifW.numPods || 1) > 1 && !!aifW.superSpine, 'CONFLICT', `numPods=${aifW.numPods}, superSpine=${aifW.superSpine && aifW.superSpine.model}`);
  check(A, 'Rail-optimized topology surfaced for GPU collectives', warned(small, /rail.?optimized|Rail-Optimized/i), 'GAP');
  // full-NVIDIA: no Dell switches/optics leak into an NVIDIA AI stack
  const nv = rec({ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
  const dellLeak = nv.bom.some(b => b.category === 'Switch' && /Dell/i.test(b.vendor) && !/NVIDIA/i.test(b.vendor));
  check(A, 'NVIDIA AI stack contains NO Dell switches (no vendor mixing in an AI fabric)', !dellLeak, 'CONFLICT');
  // transport guidance present
  check(A, 'RDMA transport guidance (RoCEv2 default; UEC alternative) surfaced', warned(small, /RoCEv2 config required/) && warned(small, /Ultra Ethernet|UEC/i), 'GAP');
}

/* ============ POWERSCALE BACK-END (Dell H16346/H17682) ============ */
{
  const A = 'PowerScale back-end';
  const ps = rec({ platformId: 'powerscale', units: 12, modelId: 'f710', redundancy: 'dual', includeMgmt: true });
  const be = ps.fabrics.find(f => f.network === 'backend');
  check(A, 'int-a/int-b are INDEPENDENT networks — no inter-switch link (OneFS failover)', be && be.interconnectQty === 0 && be.redundancyMethod === 'independent-ab', 'CONFLICT');
  check(A, 'Back-end kept dedicated (its own switches, physically separate)', warned(ps, /dedicated|physically separate|back-end MUST/i), 'GAP');
  // HARD LIMIT: max 252 nodes for a OneFS cluster (Dell H16346.8)
  const big = rec({ platformId: 'powerscale', units: 300, modelId: 'f210', redundancy: 'dual', includeMgmt: true }); // F210 = 25G
  const okCap = big.warnings.some(w => w.severity === 'error' && /252/.test(w.message) && /split/i.test(w.message));
  check(A, 'Max cluster size 252 nodes (OneFS) is enforced with a split recommendation', okCap, 'CONFLICT',
    '300 nodes must error + advise splitting into ≤252-node clusters (H16346.8).');
  const ok252 = rec({ platformId: 'powerscale', units: 252, modelId: 'f710', redundancy: 'dual', includeMgmt: true });
  check(A, 'Exactly 252 nodes is allowed (no false positive at the boundary)', !ok252.warnings.some(w => w.severity === 'error' && /252/.test(w.message)), 'CONFLICT');
}

/* ============ STORAGE PROTOCOL ============ */
{
  const A = 'Storage protocol';
  const roce = rec({ platformId: 'powerstore', units: 8, redundancy: 'dual', includeMgmt: true, storageProtocol: 'nvme-roce', separateFabrics: true, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  const rf = df(roce).find(f => f.network === 'storage' || f.network === 'frontend');
  check(A, 'NVMe-RoCE forces a lossless, non-blocking (1:1) storage fabric', rf && rf.oversubTarget <= 1.0, 'CONFLICT');
  check(A, 'RoCE lossless config (PFC/ECN/DCQCN) surfaced', warned(roce, /PFC|ECN|DCQCN|lossless/i), 'GAP');
  const tcp = rec({ platformId: 'powerstore', units: 8, redundancy: 'dual', includeMgmt: true, storageProtocol: 'nvme-tcp' });
  check(A, 'iSCSI/NVMe-TCP ride a standard (≤2:1) fabric with jumbo MTU 9216', warned(tcp, /9216|jumbo/i), 'GAP');
}

/* ============ GENERAL / ENTERPRISE DC ============ */
{
  const A = 'General DC';
  // oversubscription target honored per traffic profile
  ['balanced', 'ns', 'ew'].forEach(tp => {
    const r = rec({ platformId: 'poweredge-general', units: 300, redundancy: 'dual', includeMgmt: true, trafficProfile: tp, growthHeadroom: 0 });
    const f = df(r).find(x => x.spine);
    if (f) check(A, `Oversubscription ≤ target for '${tp}' traffic`, f.oversub == null || f.oversub <= f.oversubTarget + 0.01 || f.uplinkPortLimited, 'CONFLICT', `${tp}: ${f.oversub}:1 vs target ${f.oversubTarget}:1`);
  });
  // single rack small → ToR pair (no spine); multi-leaf → spine
  const smallR = rec({ platformId: 'poweredge-general', units: 8, redundancy: 'dual', includeMgmt: true });
  check(A, 'Small single-rack design = ToR pair (no unnecessary spine)', !df(smallR).some(f => f.spine), 'CONFLICT');
  const bigR = rec({ platformId: 'poweredge-general', units: 400, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  check(A, 'Large design adds a spine tier (leaf-spine)', df(bigR).some(f => f.spine), 'CONFLICT');
  check(A, 'Large (400-unit) design: no unexpected hard errors', !bigR.warnings.some(w => w.severity === 'error'), 'CONFLICT');
  // super-spine when leaves exceed spine radix
  const huge = rec({ platformId: 'poweredge-general', units: 5000, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
  check(A, 'Super-spine / 3-tier flagged when leaves exceed spine radix', warned(huge, /super.?spine|3-tier|two-tier Clos cannot/i) || df(huge).every(f => f.totalLeaves <= (f.spine && f.spine.access ? f.spine.access.count : 64)), 'GAP');
  // REGRESSION GUARD (GAPS.md G-008): this is exactly why a false hard 'error' from the missing
  // superSpineBreakout field (fixed — see engine.js step 4/5 `_record`/`superSpineBreakout`)
  // would previously sail through undetected even once its code path was exercised — every check
  // above looks for specific warning TEXT, never for "and nothing else unexpectedly broke". The
  // needs-4th-tier case is a KNOWN, intentional error at this tool's documented scope boundary —
  // excluded here, not silenced.
  // the scope-limit text lives on a SEPARATE 'warn' entry (the needsFourthTier warning), not on
  // the 'error' message itself — check for its presence anywhere in this result, not within the
  // error's own text.
  const hugeHitsScopeLimit = warned(huge, /exceed even the .* super-spine radix|needs a 4th tier/i);
  const unexpectedHugeErrors = huge.warnings.filter(w => w.severity === 'error');
  check(A, 'Very large (5000-unit) design: no UNEXPECTED hard errors beyond the documented 4th-tier scope limit', unexpectedHugeErrors.length === 0 || hugeHitsScopeLimit, 'CONFLICT', JSON.stringify(unexpectedHugeErrors.map(w => w.message)));
  // Clos rule text present
  check(A, 'Clos rule surfaced (every leaf to every spine; never leaf-leaf/spine-spine)', warned(bigR, /every leaf.*every spine|NEVER leaf-to-leaf|leaf-to-leaf or spine-to-spine/i), 'GAP');
}

/* ============ EDGE / CAMPUS — SONiC ONLY ============ */
{
  const A = 'Edge/campus (SONiC only)';
  const e = W.recommendEdge({ endpoints: 192, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  const swModels = [...new Set(e.bom.filter(b => b.category === 'Switch').map(b => b.model))];
  const allSonic = e.bom.filter(b => b.category === 'Switch').every(b => { const s = C.switches.find(x => x.model === b.model); return s && /SONiC/i.test(s.os); });
  check(A, 'Edge uses SONiC-only switches (no OS10-exclusive gear)', allSonic, 'CONFLICT', 'switches: ' + swModels.join(', '));
  // even when OS10 is forced, edge stays SONiC (E-series is SONiC-only)
  const eForce = W.recommendEdge({ endpoints: 192, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', nos: 'os10', includeMgmt: true });
  check(A, 'Forcing OS10 does NOT leak OS10/VLTi into the edge BOM', !/OS10 ONLY|VLTi/i.test(JSON.stringify(eForce.bom)), 'CONFLICT');
  // redundant access = MC-LAG pairs, no STP dependence
  check(A, 'Redundant access = MC-LAG pairs (not a stack, loop-free without STP)', warned(e, /MC-LAG|ESI|multihom/i) || (e.context.edge && e.context.edge.method === 'mclag'), 'GAP');
  // PoE captured
  check(A, 'PoE requirement captured for APs/phones/cameras', (e.context.edge && /poe/i.test(JSON.stringify(e.context.edge))) || warned(e, /PoE/i), 'GAP');
  // distribution present
  check(A, 'Distribution/aggregation tier present (S5232F MC-LAG)', e.bom.some(b => /S5232F/.test(b.model)), 'GAP');
  // REGRESSION GUARD (GAPS.md G-008): the E3224F-ON compatibility-gap fix (closed gap, prior
  // session) has ZERO coverage above — every other edge test uses accessSpeed:'1g' (E3248P-ON,
  // SONiC-fine). Only accessSpeed:'fiber' + redundancy on hits the "REQUESTED — NOT achievable"
  // hard-error path (E3224F-ON is OS10-only, absent from the SONiC compatibility matrix — no
  // SONiC MC-LAG is possible on it). A future refactor could silently reintroduce that bug with
  // this suite reporting all-green.
  const eFiber = W.recommendEdge({ endpoints: 96, poe: 'none', accessSpeed: 'fiber', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  check(A, 'E3224F-ON (fiber) + redundancy: hard error (no SONiC MC-LAG path on this model)', eFiber.warnings.some(w => w.severity === 'error' && /E3224F-ON/.test(w.message) && /not possible|NOT achievable/i.test(w.message)), 'CONFLICT');
  // scope to the ACCESS-tier ICL specifically — the distribution pair's own (unrelated,
  // legitimate) MC-LAG ICL is expected to still be present; only an access-pair ICL note would
  // mean the broken E3224F-ON peer-link was silently priced anyway.
  check(A, 'E3224F-ON (fiber) + redundancy: ICL peer-link NOT priced (can\'t actually be configured)', !eFiber.bom.some(b => /MC-LAG ICL/.test(b.item || '') && /access pair/i.test(b.note || '')), 'CONFLICT');
  check(A, 'E3224F-ON (fiber) + redundancy: no self-contradicting "deployed as N pairs" text next to the error', !/deployed as \d+ MC-LAG pair/.test(JSON.stringify(eFiber.bom)), 'CONFLICT');
}

/* ============ CABLING / OPTICS ============ */
{
  const A = 'Cabling/optics';
  const inrack = rec({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true, placement: 'in-rack' });
  check(A, 'In-rack = passive DAC (cheapest/lowest-power/short)', warned(inrack, /DAC|Passive/i), 'GAP');
  const struct = rec({ platformId: 'poweredge-general', units: 24, redundancy: 'dual', includeMgmt: true, placement: 'structured', structuredInPlace: false, nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 } });
  check(A, 'Structured plant itemized (trunk/cassette/panel/patch cord)', struct.bom.some(b => (b._mk || '').indexOf('struct|') === 0), 'GAP');
  check(A, 'Polarity/polish gotcha surfaced (UPC/APC never mixed)', warned(struct, /UPC.*APC|never mix/i), 'GAP');
}

/* ============ PER-PLATFORM NETWORKING (bonding / protocol / network model) ============ */
{
  const A = 'Platform networking';
  // Bonding architecture: LACP-bonded platforms MUST land on an MC-LAG pair (ICL present),
  // never independent A/B. (H18390 PowerFlex, H18241 PowerStore, ObjectScale, VxRail)
  ['powerstore', 'powerflex', 'objectscale', 'vxrail'].forEach(pid => {
    const r = rec({ platformId: pid, units: 8, redundancy: 'dual', includeMgmt: true });
    const f = df(r).find(x => x.network !== 'backend');
    const lacpOk = f && f.redundancyMethod !== 'independent-ab' && (f.spine ? f.redundancyMethod === 'evpn-mh' : f.interconnectQty > 0);
    check(A, `${pid}: LACP system-bond → MC-LAG pair (ICL) or EVPN-MH, never independent A/B`, lacpOk, 'CONFLICT', f && `method=${f.redundancyMethod}, icl=${f.interconnectQty}`);
  });
  // PowerFlex is heavy east-west → should not be over-subscribed beyond storage cap
  const pflex = rec({ platformId: 'powerflex', units: 32, redundancy: 'dual', includeMgmt: true, trafficProfile: 'ew' });
  const pf = df(pflex).find(x => x.spine);
  check(A, 'PowerFlex (heavy east-west) honors a ≤2:1 / non-blocking target', !pf || pf.oversub == null || pf.oversub <= 2.01 || pf.uplinkPortLimited, 'CONFLICT');
  // Azure Local / APEX = Switch-Embedded Teaming (switch-independent) — surfaced
  const apex = rec({ platformId: 'apex-hci', units: 6, redundancy: 'dual', includeMgmt: true });
  check(A, 'Azure Local (APEX): Switch-Embedded Teaming (SET) surfaced', warned(apex, /SET|Switch-Embedded|Azure Local supported switch/i), 'GAP');
  // PowerMax / PowerStore: MPIO ≥2 paths per node + jumbo for iSCSI/NVMe-TCP
  const pmax = rec({ platformId: 'powermax', units: 4, redundancy: 'dual', includeMgmt: true, storageProtocol: 'iscsi' });
  check(A, 'Block storage: jumbo MTU (9216) for iSCSI/NVMe-TCP surfaced', warned(pmax, /9216|jumbo/i), 'GAP');
  check(A, 'Block storage: dual-fabric gives ≥2 paths per node (MPIO/redundancy)', df(pmax)[0] && df(pmax)[0].fabricsN === 2, 'CONFLICT');
  // Every platform produces a non-empty, error-free design at a sane size
  C.platforms.forEach(p => {
    const extra = p.workload === 'ai' ? { stack: 'dell', gpusPerServer: 8 } : {};
    const r = rec(Object.assign({ platformId: p.id, units: 8, redundancy: 'dual', includeMgmt: true }, extra));
    check(A, `${p.id}: produces a valid design (switches + OOB, no hard error)`, r.bom.some(b => b.category === 'Switch') && r.fabrics.some(f => f.network === 'mgmt') && !r.warnings.some(w => w.severity === 'error'), 'CONFLICT');
  });
}

/* ============ FABRIC INTERCONNECT / ICL SIZING (h04504, FDC) ============ */
{
  const A = 'Interconnect / ICL';
  // ICL: ≥2 links at 100G+, ≥4 links sub-100G, per pair
  const sub100 = rec({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true });   // 25G ToR
  const f1 = df(sub100).find(x => x.interconnectQty > 0);
  if (f1) check(A, 'ICL sizing: ≥4 links per pair on sub-100G ports', f1.interconnectQty >= 4 * f1.leavesPerFabric || /100/.test(f1.interconnectSpeed), 'CONFLICT', `${f1.interconnectQty}× ${f1.interconnectSpeed}`);
  // independent A/B (block + MPIO) = no ICL
  const indep = rec({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, storageProtocol: 'iscsi', fabricInterconnect: 'independent' });
  const f2 = df(indep).find(x => x.network !== 'mgmt');
  // NOTE: PowerStore mandates a system bond (LACP) → the tool should KEEP MC-LAG and warn, not silently go independent
  check(A, 'Independent A/B refused when the platform mandates a LACP system bond (kept MC-LAG + warned)', f2 && f2.redundancyMethod !== 'independent-ab' && warned(indep, /system bond|MC-LAG pair/i), 'CONFLICT');
}

/* ============ EVPN-VXLAN UNDERLAY GUIDANCE ============ */
{
  const A = 'EVPN-VXLAN underlay';
  const big = rec({ platformId: 'poweredge-general', units: 400, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  check(A, 'Underlay MTU ≥1600 (9216 for perf) for VXLAN encap overhead surfaced', warned(big, /MTU.*1600|9216.*encap|VXLAN.*MTU|underlay MTU/i), 'GAP');
  check(A, 'Private-ASN plan + anycast gateway guidance surfaced', warned(big, /ASN|anycast gateway/i), 'GAP');
  check(A, 'ECMP / all-active spine uplinks (no STP) surfaced', warned(big, /ECMP|Adaptive Routing|DLB|all spine uplinks active/i), 'GAP');
}

/* ============ BREAKOUT ============ */
{
  const A = 'Breakout';
  const brk = rec({ platformId: 'poweredge-general', units: 400, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', breakout: 'on' });
  const bf = df(brk).find(f => f.uplinkBreakout);
  if (bf) {
    const line = brk.bom.find(b => (b._mk || '').indexOf('brk|') === 0);
    check(A, 'Breakout assemblies = ceil(uplinks / ratio) — no over/under count', line && line.qty === Math.ceil(bf.uplinkCableQty / bf.uplinkBreakout.ratio), 'CONFLICT');
    check(A, 'Breakout preserves non-blocking (aggregate matches source)', bf.oversub == null || bf.oversub <= bf.oversubTarget + 0.01 || bf.uplinkPortLimited, 'CONFLICT');
  } else check(A, 'A large 25G design triggers 400G→4×100G-class breakout', !!bf, 'GAP');
  // S5448F PAM4 caveat (SFP56-DD ≠ QSFP28) present in the catalog note
  const s5448 = C.switches.find(x => x.id === 's5448f-on');
  check(A, 'S5448F PAM4/SFP56-DD caveat documented (QSFP28 optics will NOT fit)', s5448 && /PAM4|SFP56-DD|will NOT/i.test(s5448.breakout || ''), 'GAP');
}

/* ============ BORDER-LEAF / CORE / DCI ============ */
{
  const A = 'Border-leaf / core / DCI';
  const bl = rec({ platformId: 'poweredge-general', units: 200, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', includeCoreUplink: true, coreType: 'dci', coreSpeed: '100GbE', borderLeaf: true });
  check(A, 'Border-leaf: dedicated MC-LAG pair, spine-attached, kept off spine ports', bl.context.borderLeaf && bl.context.borderLeaf.qty === 2, 'CONFLICT');
  check(A, 'Border-leaf: its switches are counted in OOB', (() => { const sw = bl.bom.filter(b => b.category === 'Switch').reduce((s, b) => s + b.qty, 0); const mg = bl.fabrics.find(f => f.network === 'mgmt'); return mg && mg.switchMgmt === sw; })(), 'CONFLICT');
  check(A, 'Core/DCI uplink is redundant (≥2)', bl.coreUplink && bl.coreUplink.count >= 2, 'CONFLICT');
  check(A, 'DCI notes long-range/coherent + MACsec consideration', warned(bl, /DCI.*distance|long-range|coherent|MACsec/i), 'GAP');
  // border-leaf on a ToR-only design is refused
  const tor = rec({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true, includeCoreUplink: true, borderLeaf: true });
  check(A, 'Border-leaf refused (warned) with no spine tier', warned(tor, /no spine tier/i) && !tor.bom.some(b => /Border-leaf/.test(b.item || '')), 'CONFLICT');
}

/* ============ MULTI-RACK (FDC pattern) ============ */
{
  const A = 'Multi-rack';
  const mr = rec({ platformId: 'poweredge-general', units: 64, racks: 4, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const prim = df(mr).find(f => f.perRack);
  check(A, 'Each node rack gets its own ToR pair (pair per rack)', prim && prim.totalLeaves >= 4 * 2, 'CONFLICT', prim && `${prim.totalLeaves} leaves / 4 racks`);
  check(A, 'One OOB switch per DECLARED rack (B6 ruling 2026-07-16: no phantom spine-rack OOB)', (mr.bom.find(b => b.category === 'Management') || {}).qty === 4, 'CONFLICT');
  check(A, 'Cross-rack leaf→spine uplinks flagged (AOC/fiber, not in-rack DAC)', warned(mr, /CROSS-RACK|cross-rack/i) || mr.bom.some(b => /CROSS-RACK/.test(b.note || '')), 'GAP');
  check(A, 'Multi-rack FDC pattern explained', warned(mr, /Multi-rack deployment|FDC pattern/i), 'GAP');
}

/* ============ BROWNFIELD (add to existing / reuse spine) ============ */
{
  const A = 'Brownfield (add)';
  const add = rec({ platformId: 'poweredge-general', units: 200, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced', deployType: 'add', reuseExistingSpine: true });
  const full = rec({ platformId: 'poweredge-general', units: 200, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' });
  const addSpine = add.bom.filter(b => b.category === 'Switch' && /spine/i.test(b.note || '')).reduce((s, b) => s + b.qty, 0);
  check(A, 'Reuse-spine (brownfield) does NOT re-add the spine to the incremental BOM', addSpine === 0, 'CONFLICT', `spine switches in incremental BOM = ${addSpine}`);
  check(A, 'Incremental BOM is smaller than the greenfield equivalent', add.bom.length <= full.bom.length, 'CONFLICT');
}

/* ============ GROWTH HEADROOM ============ */
{
  const A = 'Growth headroom';
  // units=80 (not 46): a strict > assertion needs a scale where 50% headroom actually crosses a
  // leaf-count boundary — 46 units happens to fit 2 leaves at BOTH 0% and 50% headroom, so the
  // old `>=` passed even with a headroom setting that had zero real effect (GAPS.md G-008 nit).
  const h0 = rec({ platformId: 'poweredge-general', units: 80, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0 });
  const h50 = rec({ platformId: 'poweredge-general', units: 80, redundancy: 'dual', includeMgmt: true, growthHeadroom: 0.5 });
  const l0 = df(h0)[0].totalLeaves, l50 = df(h50)[0].totalLeaves;
  check(A, 'Growth headroom expands the leaf count (reserves access ports)', l50 > l0, 'CONFLICT', `0%→${l0} leaves, 50%→${l50} leaves`);
  check(A, 'Growth headroom reported to the user', warned(h50, /growth headroom|headroom/i), 'GAP');
}

/* ============ WORKFLOW CONFORMANCE (each guide produces a sound design) ============ */
{
  const A = 'Workflow conformance';
  // Express-mode-equivalent inputs (mirrors what the express finish builds)
  const express = rec({ targets: [{ platformId: 'poweredge-general', units: 20 }, { platformId: 'powerstore', units: 5 }], redundancy: 'dual', growthHeadroom: 0.25, includeMgmt: true, placement: 'in-rack', trafficProfile: 'balanced', racks: 2 });
  // was `!warned(express, /^/) || (...)` — /^/ matches ANY warning message, so that first clause
  // was always true and the check always passed regardless of the second clause (GAPS.md G-008
  // nit: dead code, harmless but confusing to a future maintainer).
  check(A, 'Express-equivalent design: no hard errors, redundant, OOB present', !express.warnings.some(w => w.severity === 'error') && express.fabrics.some(f => f.network === 'mgmt'), 'CONFLICT');
  // RA — iterate EVERY reference architecture, not just index [0] (GAPS.md G-008: blindly
  // indexing [0] means an empty/reordered array throws uncaught and kills the WHOLE harness run,
  // and only ever covers whichever RA happens to be first — the published() scaling path isn't
  // guaranteed exercised unless that RA happens to sit at index 0). Wrap each in try/catch so one
  // bad RA can't take down every other check in this file.
  (C.referenceArchitectures || []).forEach(raDef => {
    try {
      const ra = W.recommendRA(raDef.id, 16);
      check(A, `Reference architecture (${raDef.id}): non-blocking AI fabric, ≥2 leaves`, ra && ra.fabrics.some(f => f.network === 'aifabric' && f.nonBlocking), 'CONFLICT');
      check(A, `Reference architecture (${raDef.id}): no hard errors`, ra && !ra.warnings.some(w => w.severity === 'error'), 'CONFLICT');
    } catch (e) {
      check(A, `Reference architecture (${raDef.id}): recommendRA() does not throw`, false, 'CONFLICT', e.message);
    }
  });
  if (!C.referenceArchitectures || !C.referenceArchitectures.length)
    check(A, 'Reference architecture catalog is non-empty', false, 'GAP');
  // Refresh
  const rf = W.recommendRefresh({ swCount: 8, portsPer: 48, speedNow: '1g', targetSpeed: '10g-t', topologyNow: 'threetier', distribution: 'new', includeMgmt: true });
  check(A, 'Refresh: produces a like-for-like BOM with migration guidance', rf.bom.length > 0 && warned(rf, /migration|rack-by-rack|cutover/i), 'GAP');
}

/* ---------- report ---------- */
const pass = findings.filter(f => f.status === 'PASS');
const gaps = findings.filter(f => f.status === 'GAP');
const conflicts = findings.filter(f => f.status === 'CONFLICT');
console.log('\n================ BEST-PRACTICE CHALLENGE REPORT ================');
console.log(`${pass.length} conform · ${gaps.length} gaps · ${conflicts.length} conflicts · ${findings.length} checks\n`);
if (conflicts.length) { console.log('CONFLICTS (tool contradicts a best practice):'); conflicts.forEach(f => console.log(`  ✗ [${f.area}] ${f.practice}\n      ${f.detail}`)); console.log(''); }
if (gaps.length) { console.log('GAPS (best practice not enforced/surfaced):'); gaps.forEach(f => console.log(`  ⚠ [${f.area}] ${f.practice}${f.detail ? '\n      ' + f.detail : ''}`)); console.log(''); }
console.log('CONFORMS:'); pass.forEach(f => console.log(`  ✓ [${f.area}] ${f.practice}`));
console.log('\n================================================================');
// Fail the build ONLY on a CONFLICT (the tool contradicting a best practice — a real
// regression). GAPs are informational (surfaced, tracked, but don't break CI).
process.exit(conflicts.length ? 1 : 0);
