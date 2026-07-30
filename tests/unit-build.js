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

/* Real bug (2026-07-30): source .js files are checked out with CRLF line endings on Windows,
 * but the HTML5 parsing spec requires browsers to normalize CR/CRLF to LF while parsing
 * <script> content BEFORE computing a CSP hash over it. build-single.js used to hash the raw
 * (CRLF) source — a hash that could never match what a real browser computes, so EVERY inline
 * script was silently CSP-blocked (the page rendered — it's static HTML/CSS — but no JS ran at
 * all). jsdom (this suite's DOM) doesn't enforce CSP meta tags, so nothing here caught it; found
 * by opening the actual built file in a real browser (Playwright/Chromium) and reading the
 * console. This check replicates the browser's own normalization so a regression here fails the
 * suite without needing a real browser. */
(() => {
  const crypto = require('crypto');
  const cspMatch = standalone.match(/Content-Security-Policy" content="([^"]*)"/);
  const csp = cspMatch ? cspMatch[1] : '';
  const blocks = [...standalone.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const mismatched = blocks.filter(content => {
    const normalized = content.replace(/\r\n|\r/g, '\n');
    const hash = "'sha256-" + crypto.createHash('sha256').update(normalized, 'utf8').digest('base64') + "'";
    return !csp.includes(hash);
  });
  t(`every embedded script's hash matches what a browser computes after CRLF→LF normalization (${blocks.length} blocks)`,
    blocks.length > 0 && mismatched.length === 0, `${mismatched.length} of ${blocks.length} blocks mismatched`);
})();

console.log(`unit-build: ${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
