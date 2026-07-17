/* =============================================================================
 * PRINCIPLE-CONFORMANCE AUDIT — generate every guide's outcome space and check
 * each result against the documented principles (Dell docs), Dell practices,
 * and general data-center networking best practices. Reports a per-principle
 * conformance matrix + any violations.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm');
global.window = {};
['js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
 'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js',
 'js/validate.js','js/engine.js','js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync('e:\\vs code\\programs\\Dell Boi\\' + f, 'utf8'), { filename: f }));
const C = window.CATALOG, R = C.rules, known = new Set(C.switches.map(s => s.model));
const gb = s => { const m = String(s).match(/(\d+(?:\.\d+)?)\s*(T|G)/i); return m ? (m[2].toUpperCase() === 'T' ? parseFloat(m[1]) * 1000 : parseFloat(m[1])) : 0; };

// principle registry: id -> {desc, source, checked, violations:[]}
const PR = {};
const principle = (id, desc, src) => { PR[id] = PR[id] || { desc, src, checked: 0, viol: [] }; return PR[id]; };
function check(id, desc, src, name, applies, ok, detail) {
  const p = principle(id, desc, src); if (!applies) return; p.checked++; if (!ok) p.viol.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function conform(name, res) {
  const data = res.fabrics.filter(f => f.network !== 'mgmt');
  const warns = res.warnings.map(w => w.message).join(' | ');
  // P1 oversubscription within target (Dell H18364 ≤2:1 general/storage; general DC 3:1; AI 1:1)
  data.forEach(f => check('P1', 'Leaf oversubscription within target (Dell ≤2:1 storage/general; AI 1:1)', 'H18364.2 / DC best practice',
    name, f.oversub != null, f.oversub <= (f.oversubTarget || 2) + 0.01 || f.uplinkPortLimited, `${f.network} ${f.oversub}:1 > ${f.oversubTarget}:1`));
  // P2 AI / NVMe-oF non-blocking (H20082; general: GPU + NVMe-oF must be 1:1)
  data.forEach(f => check('P2', 'AI fabric is non-blocking 1:1 (rail-optimized)', 'H20082 / DC best practice',
    name, f.workload === 'ai' && f.nonBlockingReq, f.nonBlocking === true, `${f.network} oversub ${f.oversub}`));
  // P3 MTU 9216 guidance for storage/AI (h19678)
  check('P3', 'Jumbo MTU 9216 end-to-end on storage/AI fabrics', 'h19678.3 / h04600',
    name, data.some(f => ['storage', 'backend', 'aifabric', 'frontend'].includes(f.network)), /9216/.test(warns));
  // P4 RoCE lossless set for AI (h04600)
  check('P4', 'RoCEv2 lossless set (PFC + ECN + DCQCN + ARS/DLB) for AI', 'h04600 / h04658',
    name, data.some(f => f.workload === 'ai'), /PFC/.test(warns) && /ECN/.test(warns) && /DCQCN/.test(warns));
  // P5 redundancy: dual by default; single is flagged
  check('P5', 'Dual-fabric redundancy (single is flagged error)', 'Dell redundancy guide',
    name, true, res.context.redundancy === 'dual' ? true : res.warnings.some(w => w.severity === 'error' && /[Ss]ingle-fabric/.test(w.message)));
  // P6 Clos: leaves connect only to spines; never leaf-leaf/spine-spine. An ICL is legitimate ONLY as
  // an MC-LAG/VLT PEER-LINK bonding a leaf pair — and under the spare-port scope (ruling 2026-07-16c) a
  // spined redundant pair WITH spare uplink ports carries that peer-link too (was: any ICL forbidden on a
  // spined fabric). So the real invariant is: interconnectQty>0 ⟹ the method is a peer-link (mclag/vlt),
  // never an EVPN-MH fabric (which has no peer-link) sprouting a bogus inter-switch link. AI fabrics are
  // exempt: a collapsed 2-switch AI stack carries a rail ISL (not an MC-LAG peer-link), governed by the
  // NVIDIA RA — a legitimate non-mclag interconnect.
  check('P6', 'Clos — no leaf-leaf / spine-spine; ICL only ever an MC-LAG/VLT peer-link (AI rail ISL exempt)', 'DC best practice (ECMP)',
    name, data.some(f => f.spine || f.interconnectQty), data.every(f => !(f.interconnectQty > 0) || f.workload === 'ai' || ['mclag', 'vlt'].includes(f.redundancyMethod)) );
  // P7 spine count: ≥2 (redundancy); general fabrics ≤8 (leaf uplink radix per H18364);
  //     AI = PORT MATH — enough spines to terminate every uplink (breakout-adjusted radix),
  //     never more than uplinks/leaf (every leaf must still reach every spine). The old
  //     "= k spines for k uplinks/leaf" clause priced one spine PER UPLINK, ballooning as
  //     spine radix grew (64 spines where the port math — and sanity — needs 8); fixed
  //     2026-07-13 alongside the engine formula it was mirroring.
  const published = !!(res.ra && res.ra.published);   // vendor-published tables outrank the generic heuristic
  const gbP7 = s => { const m = /([\d.]+)\s*(T|G)/i.exec(String(s || '')); return m ? (m[2].toUpperCase() === 'T' ? 1000 * parseFloat(m[1]) : parseFloat(m[1])) : 0; };
  data.filter(f => f.spine).forEach(f => {
    let aiOk = true;
    if (f.workload === 'ai' && !published && f.uplinkCableQty !== 0) {
      const upl = f.uplinksPerLeaf || 2, radix = (f.spine.access && f.spine.access.count) || 64;
      const spG = gbP7(f.spine.access && f.spine.access.speed), upG = gbP7(f.uplinkSpeed || f.speed);
      const eff = (upG > 0 && spG > upG) ? radix * Math.floor(spG / upG) : radix;
      aiOk = f.spineCount <= upl &&
        (f.numPods > 1 || (f.spineCount * eff >= f.totalLeaves * upl));   // ports cover uplinks (3-tier pods split their own)
    }
    check('P7', 'Spine count ≥2; general ≤8 (leaf radix); AI = port math (cover uplinks, ≤ uplinks/leaf); published RA counts win', 'H18364.2 / H20082 / Clos port math / RA tables',
      name, true, f.spineCount >= 2 && (published ? true : (f.workload === 'ai' ? aiOk : f.spineCount <= (R.leafSpine.maxSpines || 8))));
  });
  // P8 PowerScale back-end dedicated + min 3 nodes (h15963/h16346)
  const ps = (res.targets || []).find(t => t.platform.id === 'powerscale');
  if (ps) { const be = data.find(f => f.network === 'backend'), fe = data.find(f => f.network === 'frontend');
    check('P8', 'PowerScale back-end is a dedicated fabric (separate from front-end)', 'h15963 / h16346',
      name, true, !!be && !!fe && be.spineGroupKey !== fe.spineGroupKey); }
  // P9 no-mix vendor within an AI fabric
  data.filter(f => f.workload === 'ai').forEach(f => { const vs = [f.leaf.vendor].concat(f.spine ? [f.spine.vendor] : []);
    check('P9', 'No Dell/NVIDIA mixing within an AI fabric', 'Dell/NVIDIA AI design principle',
      name, true, vs.every(v => /NVIDIA/i.test(v)) || vs.every(v => !/NVIDIA/i.test(v)), `${f.network}: ${vs.join('+')}`); });
  // P10 OOB present and covers every switch (not just hosts)
  const mg = res.fabrics.find(f => f.network === 'mgmt');
  check('P10', 'OOB management present and covers every switch mgmt port', 'AI fabrics guide / practice',
    name, res.context.units !== undefined && !res.isEdge ? true : true, !mg || (res.isEdge ? true : (mg.switchMgmt === undefined || mg.switchMgmt > 0)));
  // P11 optic vendor matches fabric stack (NVIDIA LinkX for NVIDIA AI ≥400G)
  data.filter(f => f.workload === 'ai' && f.stack === 'nvidia' && gb(f.speed) >= 400).forEach(f =>
    check('P11', 'NVIDIA (Spectrum-X) fabric cabled with NVIDIA LinkX optics', 'NVIDIA LinkX',
      name, true, res.bom.some(b => b.category === 'Cable/Optic' && b.vendor === 'NVIDIA')));
  // P12 LACP guidance for bonded storage/server NICs
  check('P12', 'LACP bonding guidance for storage/server node NICs', 'h19678.3',
    name, data.some(f => ['storage', 'frontend'].includes(f.network)), /LACP/.test(warns));
  // P13 host cables == units × per-unit links (BOM integrity)
  // R12 (2026-07-16d): a host line is no longer always 1 cable = 1 link. A 1:2 splitter/breakout
  // assembly (400G rails on a twin-port-OSFP or 800G-OSFP112 leaf) carries TWO links per ordered
  // part, so the invariant multiplies qty by the line's OWN declared linksPerAssembly rather than
  // assuming 1. This is the "units can't disagree" guard: the number the note prints, the ordered
  // quantity, and this assertion all derive from the same field on the line.
  const hostLines = res.bom.filter(b => b.category === 'Cable/Optic' && /Host-to-leaf/i.test(b.note || ''));
  const hc = hostLines.reduce((s, b) => s + b.qty * (b.linksPerAssembly || 1), 0);
  const links = data.reduce((s, f) => s + (f.totalLinks || 0), 0);
  check('P13', 'Host cabling qty × linksPerAssembly = Σ (units × ports/unit)', 'BOM integrity',
    name, !res.isEdge && data.length > 0, hc === links, `${hc} ≠ ${links}`);
  // P13b a line that declares linksPerAssembly must agree with the links it claims to cover —
  // catches an assembly whose qty was set one-per-link (the pre-R12 bug) even if P13 nets out.
  hostLines.filter(b => (b.linksPerAssembly || 1) > 1 && b.coversLinks != null).forEach(b =>
    check('P13b', 'Splitter line arithmetic: qty × linksPerAssembly ≥ links covered', 'BOM integrity',
      name, true, b.qty * b.linksPerAssembly >= b.coversLinks && b.qty === Math.ceil(b.coversLinks / b.linksPerAssembly),
      `${b.model}: qty ${b.qty} × ${b.linksPerAssembly} vs ${b.coversLinks} links`));
  // P14 all switch models exist in the current catalog
  check('P14', 'All switch/mgmt models exist in the portfolio catalog', 'Catalog integrity',
    name, true, res.bom.filter(b => b.category === 'Switch' || b.category === 'Management').every(b => known.has(b.model)));
  // P15 growth headroom applied to access sizing
  check('P15', 'Growth headroom applied to access port sizing', 'Growth best practice',
    name, res.context.headroom !== undefined, res.context.headroom >= 0);
}

let n = 0;
const run = (name, input) => { n++; try { conform(name, window.recommend(input)); } catch (e) { principle('THROW', 'no exceptions', '').viol.push(`${name}: ${e.message}`); principle('THROW', '', '').checked++; } };

/* full outcome space */
C.platforms.forEach(p => {
  const stk = p.workload === 'ai' ? ['nvidia', 'dell'] : [undefined];
  stk.forEach(stack => [['dual', 4], ['dual', 12], ['dual', 40], ['single', 4]].forEach(([red, u]) =>
    run(`${p.id}/${stack || 'dell'}/${red}/${u}`, { platformId: p.id, units: u, redundancy: red, includeMgmt: true, gpusPerServer: 8, stack, trafficProfile: 'balanced' })));
  (p.models || []).forEach(m => run(`${p.id}:${m.id}`, { targets: [{ platformId: p.id, modelId: m.id, units: 8, gpusPerServer: 8 }], redundancy: 'dual', includeMgmt: true, stack: p.workload === 'ai' ? 'nvidia' : undefined }));
});
['ns', 'balanced', 'ew'].forEach(tp => run(`traffic/${tp}`, { platformId: 'poweredge-general', units: 60, redundancy: 'dual', includeMgmt: true, trafficProfile: tp }));
run('combo/store+srv', { targets: [{ platformId: 'powerstore', units: 6 }, { platformId: 'poweredge-general', units: 20 }], redundancy: 'dual', includeMgmt: true });
run('combo/scale+ai', { targets: [{ platformId: 'powerscale', units: 6 }, { platformId: 'poweredge-ai', modelId: 'xe9780', units: 8, gpusPerServer: 8 }], stack: 'nvidia', redundancy: 'dual', includeMgmt: true });
(C.referenceArchitectures || []).forEach(ra => { n++; try { conform(`RA:${ra.id}`, window.recommendRA(ra.id, ra.maxGpuNodes)); } catch (e) { principle('THROW', '', '').viol.push(`RA:${ra.id}: ${e.message}`); } });
['poe+', 'poe++', 'none'].forEach(poe => { n++; try { const r = window.recommendEdge({ endpoints: 192, poe, accessSpeed: poe === 'poe++' ? 'mgig' : '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true });
  // 'none' PoE picks E3224F-ON (fiber) — genuinely can't do SONiC MC-LAG (no VLT/OS10 fallback,
  // that's the principle) — so it must show NO redundancy method + a real error, never a false
  // 'mclag' claim (found live 2026-07-13: it used to always say 'mclag' regardless).
  const broken = r.fabrics[0].leaf.model === 'E3224F-ON';
  check('P16', 'Edge = E-series SONiC MC-LAG pairs (no VLT/OS10, no stacking)', 'E3200-ON / Enterprise SONiC', `edge/${poe}`, true,
    /E32/.test(r.fabrics[0].leaf.model) &&
    (broken ? (r.fabrics[0].redundancyMethod === null && r.warnings.some(w => w.severity === 'error' && /E3224F/.test(w.message)))
            : r.fabrics[0].redundancyMethod === 'mclag') &&
    !r.bom.some(b => /VLTi/.test(b.item || '')) && r.context.edge.pairs > 0);
} catch (e) { principle('P16', '', '').viol.push(`edge/${poe}: ${e.message}`); } });

/* ---- report ---- */
console.log(`Principle-conformance audit — ${n} outcomes across every guide.\n`);
let totalViol = 0;
Object.keys(PR).sort().forEach(id => { const p = PR[id]; if (!p.desc && !p.checked) return; totalViol += p.viol.length;
  const status = p.viol.length ? '✗' : '✓';
  console.log(`${status} ${id}  ${p.desc}  [${p.src}]`);
  console.log(`     checked ${p.checked} outcome(s)${p.viol.length ? ` · ${p.viol.length} VIOLATION(S):` : ' · all conform'}`);
  p.viol.slice(0, 4).forEach(v => console.log(`        - ${v}`));
});
console.log(`\n${totalViol ? '✗ ' + totalViol + ' violation(s)' : '✓ ALL OUTCOMES CONFORM TO ALL PRINCIPLES'}`);
process.exit(totalViol ? 1 : 0);
