/* =============================================================================
 * SECURITY TESTS — injection surfaces of a client-side app:
 *   1. DOM/XSS: hostile strings reaching innerHTML unescaped
 *   2. CSV formula injection (=cmd / @cmd cells executing in Excel)
 *   3. draw.io/Visio XML: unescaped characters breaking or smuggling markup
 *   4. localStorage theme value abuse
 * Run: node tests/unit-security.js   (needs jsdom: run from a dir that has it,
 * or `npm i jsdom` once — the suite auto-locates the scratchpad copy too)
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) {
  const alt = process.env.JSDOM_DIR;
  if (alt) ({ JSDOM } = require(path.join(alt, 'node_modules', 'jsdom')));
  else { console.log('unit-security: SKIPPED (jsdom not found — set JSDOM_DIR)'); process.exit(0); }
}

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const win = dom.window; win.alert = () => {}; win.print = () => {}; win.open = () => null;
['js/version.js', 'js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
 'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js', 'js/catalog/glossary.js',
 'js/validate.js', 'js/engine.js', 'js/design.js', 'js/ui.js', 'js/wizard.js', 'js/app.js'].forEach(f => win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8')));
const d = win.document;

let pass = 0, fail = [];
const t = (name, cond, got) => { if (cond) pass++; else fail.push(name + (got ? '  → ' + String(got).slice(0, 120) : '')); };
const XSS = '<img src=x onerror="window.__pwned=1">';

/* 1. hostile NIC vendor/model → BOM + summary + pitch (innerHTML sinks) */
(() => {
  const res = win.recommend({ platformId: 'poweredge-general', units: 4, redundancy: 'dual', includeMgmt: true,
    nic: { vendor: XSS, model: XSS, speed: '25GbE', portsPerNic: 2, nicsPerUnit: 2 } });
  win.UI.render(res, null);
  const injected = !!d.querySelector('#tab-bom img[src="x"]') || !!d.querySelector('#results img[src="x"]') || win.__pwned;
  t('XSS: hostile NIC strings must NOT become live DOM (design summary / BOM notes / pitch)', !injected, 'payload rendered as element');
})();

/* 2. CSV formula injection — Excel executes cells starting with = + - @ */
(() => {
  const res = win.recommend({ platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true,
    nic: { vendor: '=HYPERLINK("http://evil","x")', portsPerNic: 2, nicsPerUnit: 2 } });
  // reproduce exportCSV's row building without triggering a download
  const rows = res.bom.map(b => [b.category, b.vendor, b.item, b.qty, b.dellPN, b.note || '', b.source || '']);
  const risky = rows.flat().filter(c => typeof c === 'string' && /^[=+\-@]/.test(c.trim()));
  t('CSV: no cell begins with a formula trigger (=, +, -, @) unless neutralized', risky.length === 0, risky[0]);
})();

/* 3. draw.io XML stays WELL-FORMED with special chars in the pipeline */
(() => {
  const res = win.recommend({ targets: [{ platformId: 'poweredge-general', units: 8, nic: { vendor: 'A&B <Corp> "q"', speed: '25GbE', portsPerNic: 2, nicsPerUnit: 2 } }], redundancy: 'dual', includeMgmt: true });
  const xml = win.UI.buildDrawioXml(res);
  let ok = true, err = '';
  try { new win.DOMParser().parseFromString(xml, 'text/xml'); const pe = new win.DOMParser().parseFromString(xml, 'text/xml').querySelector('parsererror'); if (pe) { ok = false; err = pe.textContent; } }
  catch (e) { ok = false; err = e.message; }
  t('draw.io export: XML parses cleanly with &, <, > and quotes in labels', ok, err);
})();

/* 4. theme value from localStorage cannot escape the attribute */
(() => {
  const appSrc = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
  // static: the stored value flows ONLY into setAttribute (an inert sink), never into markup
  const safeSink = /setAttribute\('data-theme'/.test(appSrc) && !/innerHTML[^\n]*dellboi-theme|dellboi-theme[^\n]*innerHTML/.test(appSrc);
  // runtime: plant a hostile value and exercise the same sink — nothing may execute
  try { win.localStorage.setItem('dellboi-theme', '"><img src=x onerror="window.__pwned2=1">'); } catch (e) {}
  win.eval("document.documentElement.setAttribute('data-theme', localStorage.getItem('dellboi-theme'))");
  t('theme: hostile localStorage value stays an inert attribute', safeSink && !win.__pwned2);
})();

/* 5. no secrets / internal endpoints anywhere in shipped code */
(() => {
  const shipped = ['js/engine.js', 'js/design.js', 'js/ui.js', 'js/wizard.js', 'js/app.js', 'js/validate.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('');
  t('no credentials / tokens / internal hosts in shipped JS', !/api[_-]?key|password|secret|\.dell\.com\/internal|Bearer /i.test(shipped));
})();

/* 6. app is fully offline: no runtime network calls in shipped JS */
(() => {
  const shipped = ['js/engine.js', 'js/design.js', 'js/ui.js', 'js/wizard.js', 'js/app.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('');
  t('no fetch/XHR/WebSocket in the app (customer data never leaves the browser)', !/fetch\(|XMLHttpRequest|WebSocket\(/.test(shipped));
})();

/* 7. design loader (save/share) — must treat files as DATA, never execute them */
(() => {
  if (!win.DesignIO) { t('design loader present', false); return; }
  win.__pwn = 0;
  const payloads = [
    { app: 'evil' },
    { app: 'dellboi-design', engine: 'process' },        // not an allowlisted engine
    { app: 'dellboi-design', engine: 'constructor' },     // Function-constructor style probe
    { app: 'dellboi-design', engine: 'eval', input: {} },
    { app: 'dellboi-design', engine: 'recommend', input: JSON.parse('{"__proto__":{"polluted":1}}') }
  ];
  let rejected = 0;
  payloads.forEach(p => { try { win.DesignIO.run(p); } catch (e) { rejected++; } });
  t('design loader: non-allowlisted / malformed designs are rejected, not run', rejected >= 4, rejected);
  t('design loader: no prototype pollution from a crafted design', ({}).polluted === undefined);
  t('design loader: no code executed from any payload', win.__pwn === 0);
  // a valid design round-trips
  const valid = { app: 'dellboi-design', v: 1, engine: 'recommend', input: { platformId: 'powerstore', units: 4, redundancy: 'dual', includeMgmt: true }, verity: false, guidance: null };
  let ok = false, err = ''; try { win.DesignIO.run(valid); ok = !d.querySelector('#results').hidden && /S52\d\dF/.test(d.querySelector('#tab-bom').textContent); } catch (e) { err = e.message; }
  t('design loader: a valid design rebuilds a BOM', ok, err);
})();

console.log(`unit-security: ${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
