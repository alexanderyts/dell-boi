const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = 'e:\\vs code\\programs\\Dell Boi'; global.window = {};
['js/catalog/switches.js','js/catalog/optics.js','js/catalog/platforms.js','js/catalog/rules.js',
 'js/catalog/reference-architectures.js','js/catalog/solutions.js','js/catalog/discovery.js',
 'js/validate.js','js/engine.js','js/design.js','js/wizard.js','js/selftest.js']
  .forEach(f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));

const r = window.runSelfTest();
r.results.forEach(t => console.log((t.pass ? 'PASS ' : 'FAIL ') + t.name + (t.detail ? '  → ' + t.detail : '')));
console.log(`\n${r.passed}/${r.total} passed, ${r.failed} failed`);
process.exit(r.failed ? 1 : 0);
