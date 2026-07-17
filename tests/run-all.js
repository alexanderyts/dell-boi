/* =============================================================================
 * ONE RUNNER for the whole test battery. Run: node tests/run-all.js
 * Exits non-zero if ANY suite fails, so it works as a CI / pre-share gate.
 *
 * Some suites need jsdom. It isn't a project dependency (the app ships zero deps),
 * so this runner locates a jsdom install automatically: JSDOM_DIR env, or a couple
 * of known scratch locations. Suites that can't find it SKIP (not fail) and say so.
 * ========================================================================== */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

// locate jsdom for the DOM-based suites
function findJsdomDir() {
  if (process.env.JSDOM_DIR && fs.existsSync(path.join(process.env.JSDOM_DIR, 'node_modules', 'jsdom'))) return process.env.JSDOM_DIR;
  try { require.resolve('jsdom'); return ROOT; } catch (e) {}
  const guesses = [];
  const tmp = process.env.TEMP || process.env.TMP || '';
  if (tmp) { // claude scratchpad pattern: <tmp>/claude/<slug>/<uuid>/scratchpad
    const base = path.join(tmp, 'claude');
    try { for (const slug of fs.readdirSync(base)) for (const uuid of fs.readdirSync(path.join(base, slug))) guesses.push(path.join(base, slug, uuid, 'scratchpad')); } catch (e) {}
  }
  for (const g of guesses) if (fs.existsSync(path.join(g, 'node_modules', 'jsdom'))) return g;
  return null;
}
const JSDOM_DIR = findJsdomDir();

// Node-only suites (pure engine/logic — no DOM) vs DOM suites (need jsdom).
const NODE_SUITES = [
  ['unit-engine', 'tests/unit-engine.js', 'engine math, boundaries, input hardening'],
  ['unit-contrast', 'tests/unit-contrast.js', 'WCAG AA contrast, both themes'],
  ['unit-build', 'tests/unit-build.js', 'build output sanity — standalone/hosted bundles match source'],
  ['unit-design', 'tests/unit-design.js', 'canonical design layer — device list faithful vs engine + corrective vs fixtures (Phase 2 foundation)'],
  ['selftest', 'tests/harness/run-selftest.js', 'catalog + engine self-tests'],
  ['audit-boms', 'tests/harness/audit-boms.js', 'BOM accuracy across guide paths'],
  ['audit-scaling', 'tests/harness/audit-scaling.js', 'monotonic scaling'],
  ['audit-principles', 'tests/harness/audit-principles.js', 'design-principle conformance'],
  ['audit-groundtruth', 'tests/harness/audit-groundtruth.js', 'vs published docs + FDC exports'],
  ['audit-multitarget', 'tests/harness/audit-multitarget.js', 'combined / multi-rack / multi-NIC'],
  ['audit-topology', 'tests/harness/audit-topology.js', 'SVG render matches data'],
  ['audit-renderer-parity', 'tests/harness/audit-renderer-parity.js', 'BOM switch models render in all 3 renderers (topology/rack/drawio)'],
  ['audit-independent', 'tests/harness/audit-independent.js', 'independent physical-feasibility challenge, all sizes'],
  ['audit-fuzz', 'tests/harness/audit-fuzz.js', 'combinatorial fuzz — full input surface, seeded/reproducible'],
  ['challenge-bp', 'tests/challenge-bestpractice.js', 'best-practice conformance (fails on CONFLICT)'],
  ['invariants', 'tests/invariants.js', 'Phase 1 invariants + golden fixtures (xfail inventory = Phase 2 progress meter)']
];
const DOM_SUITES = [
  ['unit-security', 'tests/unit-security.js', 'XSS / CSV / XML / offline / secrets'],
  ['unit-workflow', 'tests/unit-workflow.js', 'wiring, tabs, wizard flows, exports'],
  ['test-dom', 'tests/harness/test-dom.js', 'full page integration, every mode']
];

function resolveSuite(rel) { const p = path.join(ROOT, rel); return fs.existsSync(p) ? p : null; }

let passed = 0, failed = 0, skipped = 0;
const results = [];
function run(name, rel, desc, needsDom) {
  const file = resolveSuite(rel);
  if (!file) { skipped++; results.push(['SKIP', name, desc + ' (file not found)']); return; }
  if (needsDom && !JSDOM_DIR) { skipped++; results.push(['SKIP', name, desc + ' (jsdom not found — set JSDOM_DIR)']); return; }
  const env = Object.assign({}, process.env);
  if (needsDom) env.JSDOM_DIR = JSDOM_DIR;
  try {
    const out = execFileSync('node', [file], { cwd: ROOT, env, stdio: 'pipe', timeout: 240000 }).toString();
    // Surface tracked-defect meter lines even when the suite PASSES — the xfail inventory
    // (Phase 1 invariants) must be visible on every run, never buried (maintainer
    // requirement, 2026-07-16: this count is the Phase 2 progress meter).
    const meter = out.split('\n').filter(l => /^(xfail:|FLAGGED CONFLICT|  [BF]\d+[:—\s])/.test(l)).join('\n      ');
    passed++; results.push(['PASS', name, desc + (meter ? '\n      ' + meter : '')]);
  } catch (e) {
    failed++;
    const out = ((e.stdout || '') + (e.stderr || '')).toString().trim().split('\n').filter(l => /✗|FAIL|Error|failed/i.test(l)).slice(0, 6).join('\n      ');
    results.push(['FAIL', name, desc + (out ? '\n      ' + out : '')]);
  }
}

console.log('Dell Boi — full test battery\n' + '='.repeat(52));
NODE_SUITES.forEach(([n, r, d]) => run(n, r, d, false));
DOM_SUITES.forEach(([n, r, d]) => run(n, r, d, true));

console.log('');
results.forEach(([st, name, desc]) => {
  const mark = st === 'PASS' ? '✓' : st === 'FAIL' ? '✗' : '–';
  console.log(`  ${mark} ${name.padEnd(22)} ${desc}`);
});
console.log('='.repeat(52));
console.log(`${passed} passed · ${failed} failed · ${skipped} skipped` + (JSDOM_DIR ? '' : '  (DOM suites need jsdom — set JSDOM_DIR)'));
process.exit(failed ? 1 : 0);
