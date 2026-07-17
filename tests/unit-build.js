/* =============================================================================
 * BUILD OUTPUT SANITY — verifies tools/build-single.js actually produces what it
 * claims to. Added 2026-07-13 after a real bug: new <meta>/<link> tags added to
 * index.html's <head> (Add-to-Home-Screen tags, favicon) silently never reached
 * dist/dellboi-standalone.html, because the standalone build hardcoded its own
 * minimal head instead of deriving it from index.html. Caught by manually reading
 * the built file, not by any automated check — this suite is that missing check.
 * Run: node tests/unit-build.js
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

execFileSync('node', [path.join(ROOT, 'tools', 'build-single.js')], { cwd: ROOT, stdio: 'pipe' });

const standalone = fs.readFileSync(path.join(ROOT, 'dist', 'dellboi-standalone.html'), 'utf8');
const hosted = fs.readFileSync(path.join(ROOT, 'dist', 'dellboi-hosted.html'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let pass = 0, fail = [];
const t = (name, cond, got) => { if (cond) pass++; else fail.push(name + (got ? '  → ' + String(got).slice(0, 200) : '')); };

/* every <meta>/<link> tag in index.html's <head> (except the stylesheet link, which is
 * intentionally inlined into a <style> block instead) must survive into the standalone
 * build's <head> verbatim — the whole point of a "complete, self-hostable page" */
(() => {
  const headSrc = indexHtml.slice(indexHtml.indexOf('<head>') + 6, indexHtml.indexOf('</head>'));
  const standaloneHead = standalone.slice(standalone.indexOf('<head>') + 6, standalone.indexOf('</head>'));
  const tags = [...headSrc.matchAll(/<(meta|link)\b[^>]*>/g)].map(m => m[0]).filter(tag => !/rel="stylesheet"/.test(tag));
  const missing = tags.filter(tag => !standaloneHead.includes(tag));
  t(`standalone build carries all ${tags.length} index.html head tags (meta/link) verbatim`, tags.length > 0 && missing.length === 0, missing.join(' | '));
})();

t('standalone build is a complete document (<html>…</html>)', /<html[\s>]/.test(standalone) && /<\/html>/.test(standalone));
t('hosted build is body-content only (Artifact publisher supplies its own <html>/<head>)', !/<html[\s>]/.test(hosted));
t('no dead Clash Grotesk reference in standalone build', !/Clash ?Grotesk/i.test(standalone));
t('no dead Clash Grotesk reference in hosted build', !/Clash ?Grotesk/i.test(hosted));
t('Satoshi font is embedded (base64 data URI, not a broken external ref)', /data:font\/woff2;base64,/.test(standalone) && !/url\('fonts\//.test(standalone));

// self-consistency: one CSP script-hash per embedded script block (not a hardcoded
// magic number — stays correct as catalog files are added/removed over time)
(() => {
  const hashes = (standalone.match(/'sha256-/g) || []).length;
  const blocks = (standalone.match(/\/\* ==== js\//g) || []).length;
  t('CSP script-hash count matches the number of embedded script blocks', hashes > 0 && hashes === blocks, `${hashes} hashes vs ${blocks} blocks`);
})();

t('CSP connect-src is none (no network egress) in both builds', /connect-src 'none'/.test(standalone) && /connect-src 'none'/.test(hosted));

console.log(`unit-build: ${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
