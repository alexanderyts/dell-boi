/* =============================================================================
 * COMBINATORIAL FUZZ — random, seeded sweep of the FULL input surface (every
 * flag, every combination of them, arbitrary target counts/platforms/models),
 * checked against tests/harness/lib/feasibility.js's independent formulas.
 * Complements audit-independent.js's hand-picked high-signal scenarios with
 * raw combinatorial coverage a human wouldn't think to hand-pick.
 * Deterministic: same SEED (env var or default) always reproduces the same
 * run, so a failure prints a ready-to-paste repro input.
 * ========================================================================== */
const fs = require('fs'), vm = require('vm');
const ROOT = 'e:\\vs code\\programs\\Dell Boi';
global.window = {};
['js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
  'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
  'js/validate.js', 'js/engine.js', 'js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync(ROOT + '\\' + f, 'utf8'), { filename: f }));
const C = window.CATALOG;
const { checkAll } = require('./lib/feasibility.js');

const SEED = parseInt(process.env.FUZZ_SEED, 10) || 20260711;
const N = parseInt(process.env.FUZZ_N, 10) || 6000;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const pick = arr => arr[Math.floor(rng() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const chance = p => rng() < p;

const NIC_SPEEDS = ['', '1GBase-T', '1GbE', '10GBase-T', '10GbE', '25GbE', '40GbE', '100GbE', '200GbE', '400GbE', '800GbE'];
function randomNic() {
  return { vendor: pick(['Broadcom', 'Intel', 'NVIDIA', 'other']), speed: pick(NIC_SPEEDS), portsPerNic: pick([1, 2, 4]), nicsPerUnit: randInt(1, 4) };
}
function randomTarget() {
  const p = pick(C.platforms);
  // occasionally push well past 2-tier feasibility so the fuzzer regularly exercises the
  // 3-tier Clos (super-spine) path, not just the common small/medium case.
  const units = chance(0.08) ? randInt(1000, 6000) : (chance(0.1) ? randInt(1, 3000) : randInt(1, 200));
  const model = (p.models && p.models.length && chance(0.5)) ? pick(p.models) : null;
  const t = { platformId: p.id, units, modelId: model ? model.id : null };
  if (p.workload === 'ai') {
    t.gpusPerServer = pick([1, 4, 8]);
    if (chance(0.4)) t.railNic = { speed: pick(['400GbE', '800GbE']), model: pick(['ConnectX-7', 'ConnectX-8', '']) };
    if (chance(0.3)) t.nic = randomNic();
  } else {
    if (chance(0.45)) t.nic = randomNic();
    // nic2's purpose is a real customer-stated answer now, not a hardcoded assumption — fuzz
    // both options so 'frontend' (which can converge with the primary NIC) gets covered too.
    if (chance(0.15)) t.nic2 = Object.assign(randomNic(), { network: pick(['storage', 'frontend']) });
  }
  return t;
}
function randomRecommendInput() {
  const nTargets = chance(0.55) ? 1 : randInt(2, 8);
  const targets = []; for (let i = 0; i < nTargets; i++) targets.push(randomTarget());
  const anyAi = targets.some(t => { const p = C.platforms.find(x => x.id === t.platformId); return p && p.workload === 'ai'; });
  const input = {
    targets, redundancy: pick(['dual', 'single']), growthHeadroom: pick([0, 0.15, 0.25, 0.5, 1]),
    includeMgmt: chance(0.9), nos: pick(['sonic', 'os10']), fabricArchitecture: pick(['converged', 'sharedSpine', 'separate']),
    placement: pick(['in-rack', 'adjacent', 'structured']), structuredInPlace: chance(0.3),
    breakout: pick(['auto', 'on', 'none']), racks: chance(0.35) ? randInt(2, 80) : 1,
    leaf100: pick(['auto', 's5448f', 's5232f', 'z9264f']), leaf25: pick(['auto', 's5212f', 's5224f', 's5248f', 's5296f']), aiTransport: pick(['roce', 'uec']),
    trafficProfile: pick(['balanced', 'ns', 'ew']), speedRoadmap: pick(['none', '25-100', '100-400', 'unsure']),
    storageProtocol: pick([null, 'iscsi', 'nvme-tcp', 'nvme-roce']),
    fabricInterconnect: pick(['mclag', 'independent']), deployType: pick(['new', 'add']),
    reuseExistingSpine: chance(0.5)
  };
  if (anyAi) input.stack = pick(['dell', 'nvidia']);
  if (chance(0.35)) input.nic = randomNic();
  if (chance(0.3)) {
    input.includeCoreUplink = true; input.coreSpeed = pick(['25GbE', '100GbE', '400GbE']); input.coreCount = randInt(2, 4);
    input.coreType = pick(['core', 'fabric', 'dci']); input.coreLayer = pick(['l2', 'l3']); input.coreProtocol = pick(['bgp', 'ospf', 'static']);
    input.coreReach = pick(['auto', 'longreach']); input.coreFarEnd = pick(['dell', 'other']);
    input.borderLeaf = chance(0.5);
  }
  return input;
}
function randomEdgeInput() {
  return {
    endpoints: chance(0.15) ? randInt(1, 30000) : randInt(1, 2000),
    poe: pick(['none', 'poe+', 'poe++']), accessSpeed: pick(['mgig', '1g', 'fiber']),
    edgeRedundancy: pick(['single', 'vlt-pair']), distribution: pick(['new', 'existing']),
    edgeUplink: pick(['100g', 'sfp']), includeMgmt: chance(0.9)
  };
}
function randomRefreshInput() {
  return {
    swCount: chance(0.1) ? randInt(2, 400) : randInt(2, 64), portsPer: pick([24, 48]),
    speedNow: pick(['1G', '10G', '25G']), targetSpeed: pick(['10g-t', '25g', '100g']),
    topologyNow: pick(['tor', '3tier', 'leafspine']), distribution: pick(['new', 'existing']), includeMgmt: chance(0.9)
  };
}

let problems = [], runs = 0;
const seen = new Set();
function normalize(msg) { return msg.replace(/\d+(\.\d+)?/g, 'N').slice(0, 140); }
function P(tag, msg, input) {
  const key = normalize(msg);
  if (seen.has(key)) return;   // one example per distinct failure SHAPE, not every occurrence
  seen.add(key);
  problems.push({ tag, msg, input: JSON.stringify(input) });
}

function fuzz(label, gen, fn) {
  for (let i = 0; i < N; i++) {
    runs++;
    const input = gen();
    let res;
    try { res = fn(input); }
    catch (e) { P(`${label}#${i}`, 'THREW: ' + e.message, input); continue; }
    const localProblems = [];
    const localP = (tag, msg) => localProblems.push(msg);
    try { checkAll(C, `${label}#${i}`, res, localP); }
    catch (e) { P(`${label}#${i}`, 'CHECK THREW: ' + e.message, input); continue; }
    localProblems.forEach(msg => P(`${label}#${i}`, msg, input));
  }
}

fuzz('recommend', randomRecommendInput, i => window.recommend(i));
fuzz('edge', randomEdgeInput, i => window.recommendEdge(i));
fuzz('refresh', randomRefreshInput, i => window.recommendRefresh(i));

console.log(`\nCOMBINATORIAL FUZZ (seed ${SEED}, ${N}/generator): ${runs} designs checked`);
if (problems.length) {
  console.log(`${problems.length} DISTINCT PROBLEM SHAPE(S):`);
  problems.forEach(p => { console.log(`  [${p.tag}] ${p.msg}`); console.log(`    repro input: ${p.input}`); });
  process.exit(1);
} else console.log('NO PROBLEMS FOUND across the fuzzed input surface');
