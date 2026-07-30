/* =============================================================================
 * BUILD SINGLE-FILE BUNDLE — packs the whole app (HTML + CSS + fonts + JS) into
 * one self-contained page for hosting (claude.ai Artifact / any static host).
 * Zero runtime requests: fonts become base64 data URIs, all scripts inline.
 * Output: dist/dellboi-hosted.html  (body-content only — no <html>/<head> shell,
 * as required by the Artifact publisher, which wraps it in a skeleton).
 * Usage: node tools/build-single.js
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---- CSS with fonts inlined ---- */
let css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
for (const f of ['Satoshi-Variable.woff2']) {
  const b64 = fs.readFileSync(path.join(ROOT, 'fonts', f)).toString('base64');
  css = css.split(`url('fonts/${f}')`).join(`url('data:font/woff2;base64,${b64}')`);
}

/* ---- head content (theme-color, Add-to-Home-Screen tags, favicon/apple-touch-icon, title) —
 * pulled from index.html itself so anything added there (e.g. a new meta tag) automatically
 * reaches the standalone build too, instead of a hand-maintained duplicate list drifting out
 * of sync. The stylesheet <link> is dropped since CSS is inlined into a <style> block below. */
let headContent = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
headContent = headContent.replace(/\s*<link rel="stylesheet" href="styles\.css"\s*\/>\s*\n/, '\n');

/* ---- body content ---- */
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/<script src="[^"]+"><\/script>\s*/g, '');           // scripts re-added inline below
body = body.replace(/<a href="selftest\.html"[^>]*>[\s\S]*?<\/a>\s*/, ''); // selftest page doesn't ship in the bundle

/* ---- scripts, in load order (same list as index.html) ---- */
const crypto = require('crypto');
const SCRIPTS = ['js/version.js', 'js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js',
  'js/catalog/rules.js', 'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
  'js/catalog/glossary.js', 'js/validate.js', 'js/engine.js', 'js/design.js', 'js/ui.js', 'js/wizard.js', 'js/app.js'];

// Build each inline <script> and compute its SHA-256 (base64) — the CSP allowlists
// exactly these hashes, so the app's own scripts run while the browser refuses ANY
// other inline script (including one an attacker somehow injects). This is the
// strongest CSP available to a static single-file page (no server for a nonce).
const scriptHashes = [];
// Line endings are normalized to LF BEFORE hashing: the HTML5 parsing spec requires browsers to
// normalize CR/CRLF to LF while parsing <script> content, before computing a CSP hash over it
// (whatwg.org/html "preprocessing the input stream"). Source files checked out with CRLF (as
// git does by default on Windows) would otherwise hash differently here than the browser
// computes at parse time — every inline script silently CSP-blocked, page renders but no JS
// runs at all. Caught by opening the actual built file in a real browser; jsdom (the test
// suite's DOM) does not enforce CSP meta tags, so unit-build.js never exercised this failure.
const js = SCRIPTS.map(f => {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n|\r/g, '\n');
  const inner = '\n/* ==== ' + f + ' ==== */\n' + src.replace(/<\/script>/gi, '<\\/script>') + '\n';
  scriptHashes.push("'sha256-" + crypto.createHash('sha256').update(inner, 'utf8').digest('base64') + "'");
  return '<script>' + inner + '</script>';
}).join('\n');

// Content-Security-Policy: deny-by-default, then only what a self-contained tool needs.
// The load-bearing line is connect-src 'none' — no fetch/XHR/WebSocket can leave the
// page, so customer BOM data can never be exfiltrated even in a worst case.
const csp = [
  "default-src 'none'",
  "script-src " + scriptHashes.join(' '),   // only the app's own script blocks
  "style-src 'unsafe-inline'",              // inline <style> + SVG/legend style attributes (style injection ≠ code execution)
  "img-src data:",                          // favicons / any inline data images
  "font-src data:",                         // Satoshi as a data URI
  "connect-src 'none'",                     // NO network egress — the privacy guarantee
  "form-action 'none'", "base-uri 'none'", "frame-ancestors 'none'"
].join('; ');
const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

const version = fs.readFileSync(path.join(ROOT, 'js/version.js'), 'utf8').match(/'([\d.]+)'/)[1];
fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });

// (1) Artifact bundle — body-content only (the claude.ai publisher supplies the
// <html>/<head> skeleton and its own CSP). Title + CSP meta included harmlessly; the
// platform CSP is what governs here.
const bundle = `${cspMeta}\n<title>Dell Networking BOM Advisor</title>\n<style>\n${css}\n</style>\n${body}\n${js}\n`;
fs.writeFileSync(path.join(ROOT, 'dist', 'dellboi-hosted.html'), bundle);

// (2) Standalone document — a COMPLETE page with the CSP meta correctly inside <head>,
// so the policy is actually enforced when self-hosted (GitHub Pages, S3, opened directly).
const standalone = `<!doctype html>\n<html lang="en">\n<head>\n${headContent}${cspMeta}\n<style>\n${css}\n</style>\n</head>\n<body>\n${body}\n${js}\n</body>\n</html>\n`;
fs.writeFileSync(path.join(ROOT, 'dist', 'dellboi-standalone.html'), standalone);

console.log(`dist/dellboi-hosted.html      — ${(bundle.length / 1024).toFixed(0)} KB (artifact body; platform CSP governs)`);
console.log(`dist/dellboi-standalone.html  — ${(standalone.length / 1024).toFixed(0)} KB (full page; CSP enforced: ${scriptHashes.length} script hashes, connect-src 'none')`);
console.log(`v${version} · self-contained · zero network egress`);
