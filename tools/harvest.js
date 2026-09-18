#!/usr/bin/env node
/* =============================================================================
 * harvest.js  --  corpus harvester for the Dell Boi source manifest
 * -----------------------------------------------------------------------------
 * Reads docs/sources.csv, downloads the PUBLIC `access=direct` docs (polite:
 * real UA, rate-limited, robots-aware, conditional GET), extracts PDFs with
 * `pdftotext -table`, and prints a "new / changed since last run" list to feed
 * the ingest-and-reconcile loop. `browser-check` / `manual` rows are listed for
 * you to save by hand (Info Hub reCAPTCHA / support-portal pages).
 *
 * Zero dependencies (Node built-ins only). Run from the repo root:
 *     node tools/harvest.js                 # fetch all direct docs
 *     node tools/harvest.js --dry-run       # show the plan, download nothing
 *     node tools/harvest.js --only=storage  # one category
 *     node tools/harvest.js --id=SONIC-L3   # one doc
 *     node tools/harvest.js --force         # re-download even if unchanged
 *     node tools/harvest.js --help
 *
 * Public docs only, for personal reference — cite, don't republish. See docs/sources.md.
 * ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path'), https = require('https'), http = require('http');
const crypto = require('crypto'), { execFileSync } = require('child_process'), { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'docs', 'sources.csv');
const CORPUS = path.join(ROOT, 'corpus');
const RAW = path.join(CORPUS, 'raw'), TXT = path.join(CORPUS, 'txt');
const STATE_FILE = path.join(CORPUS, '.harvest-state.json');
const UA = 'DellBoiHarvester/1.0 (personal reference tool; +local)';

/* ---------- args ---------- */
const args = process.argv.slice(2);
const has = f => args.includes(f);
const val = (k, d) => { const a = args.find(x => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
if (has('--help')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 26).join('\n').replace(/^ \* ?/gm, ''));
  process.exit(0);
}
const DRY = has('--dry-run'), FORCE = has('--force'), IGNORE_ROBOTS = has('--ignore-robots');
const INCLUDE_MANUAL = has('--include-manual');
const DELAY = parseInt(val('--delay', '1500'), 10);
const ONLY = val('--only', null), ONLY_ID = val('--id', null);

/* ---------- tiny CSV parser (handles optional double-quotes) ---------- */
function parseCSV(text) {
  const rows = []; let i = 0, field = '', row = [], q = false;
  const pushF = () => { row.push(field); field = ''; };
  const pushR = () => { pushF(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') pushF();
    else if (c === '\n') pushR();
    else if (c === '\r') { /* skip */ }
    else field += c;
    i++;
  }
  if (field.length || row.length) pushR();
  const hdr = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(hdr.map((h, j) => [h, (r[j] || '').trim()])));
}

/* ---------- polite HTTP with redirects + conditional GET ---------- */
function fetchUrl(u, headers, hops) {
  hops = hops || 0;
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error('too many redirects'));
    const lib = u.startsWith('http://') ? http : https;
    const req = lib.get(u, { headers: Object.assign({ 'User-Agent': UA, 'Accept': '*/*' }, headers || {}), timeout: 30000 }, res => {
      const { statusCode: s, headers: h } = res;
      if ([301, 302, 303, 307, 308].includes(s) && h.location) {
        res.resume();
        const next = new URL(h.location, u).href;
        return resolve(fetchUrl(next, headers, hops + 1));
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve({ status: s, headers: h, body: Buffer.concat(chunks), url: u }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/* ---------- minimal robots.txt (per-host, cached) ---------- */
const robotsCache = new Map();
async function robotsAllowed(u) {
  if (IGNORE_ROBOTS) return true;
  const { protocol, host, pathname } = new URL(u);
  if (!robotsCache.has(host)) {
    let dis = [];
    try {
      const r = await fetchUrl(`${protocol}//${host}/robots.txt`, {}, 0);
      if (r.status >= 200 && r.status < 300) {
        let apply = false;
        r.body.toString('utf8').split(/\r?\n/).forEach(line => {
          const m = line.split('#')[0].trim(); if (!m) return;
          const [kRaw, ...rest] = m.split(':'); const k = kRaw.toLowerCase().trim(); const v = rest.join(':').trim();
          if (k === 'user-agent') apply = (v === '*' || UA.toLowerCase().includes(v.toLowerCase()));
          else if (k === 'disallow' && apply && v) dis.push(v);
        });
      }
    } catch (e) { /* no robots => allow */ }
    robotsCache.set(host, dis);
  }
  const dis = robotsCache.get(host);
  return !dis.some(p => pathname.startsWith(p));
}

/* ---------- pdftotext discovery ---------- */
function findPdftotext() {
  const cands = [process.env.PDFTOTEXT, 'pdftotext', '/mingw64/bin/pdftotext',
    'C:/Program Files/Git/mingw64/bin/pdftotext.exe', 'C:/msys64/mingw64/bin/pdftotext.exe'].filter(Boolean);
  // Xpdf's pdftotext exits 99 on -v; only ENOENT means the binary is truly missing.
  for (const c of cands) { try { execFileSync(c, ['-v'], { stdio: 'ignore' }); return c; } catch (e) { if (e.code !== 'ENOENT') return c; } }
  return null;
}
const PDFTOTEXT = findPdftotext();

// `-enc UTF-8` is NOT poppler's default despite what the flag name implies for some builds — without
// it, a PDF whose font subset embeds Latin-1/CP1252 code points (e.g. "®") can come out as invalid
// UTF-8 bytes in the .txt file, which corrupts anything downstream that assumes text-mode UTF-8
// (found 2026-09-18 re-fetching ST-POWERSTORE.pdf: byte 0xAE from "System®" broke a plain read).
function extractPdf(pdf, txt) { execFileSync(PDFTOTEXT, ['-table', '-enc', 'UTF-8', pdf, txt], { stdio: 'ignore' }); }
function extractHtml(buf, txt) {
  const t = buf.toString('utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#\d+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
  fs.writeFileSync(txt, t);
}

/* ---------- challenge-page detector ---------- */
// A "direct" URL can still land on a bot-challenge page (reCAPTCHA/Cloudflare/WAF) instead of the
// real document — the server returns 200, so nothing above catches it, and it would otherwise be
// silently saved as if it were the source (found 2026-09-18: three Info Hub URLs mis-tagged
// `direct` did exactly this — a 20KB "PDF" that was actually a recaptcha challenge page). Checked
// against a small byte prefix of the body, case-insensitively, before any bytes are written to disk.
const CHALLENGE_SIGNS = [
  /recaptcha\/challengepage/i, /g-recaptcha/i, /cf-challenge/i, /cf_chl_/i,
  /<title>\s*(just a moment|attention required|access denied|are you a human)/i,
  /checking your browser before accessing/i, /captcha-delivery\.com/i,
];
function detectChallengePage(body) {
  const head = body.slice(0, 4096).toString('utf8');
  return CHALLENGE_SIGNS.some(re => re.test(head));
}

/* ---------- state ---------- */
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

/* ---------- main ---------- */
(async function main() {
  if (!fs.existsSync(MANIFEST)) { console.error('Manifest not found:', MANIFEST); process.exit(1); }
  [CORPUS, RAW, TXT].forEach(d => fs.mkdirSync(d, { recursive: true }));
  let rows = parseCSV(fs.readFileSync(MANIFEST, 'utf8'));
  if (ONLY) rows = rows.filter(r => r.category === ONLY);
  if (ONLY_ID) rows = rows.filter(r => r.doc_id === ONLY_ID);

  const direct = rows.filter(r => r.access === 'direct' || (INCLUDE_MANUAL && r.access !== 'direct'));
  const manual = rows.filter(r => r.access !== 'direct');

  console.log(`Manifest: ${rows.length} row(s) · ${direct.length} auto-fetch · ${manual.length} manual`);
  console.log(`pdftotext: ${PDFTOTEXT || 'NOT FOUND (raw PDFs saved, no text extraction)'}`);
  console.log(`mode: ${DRY ? 'DRY-RUN' : 'download'} · delay ${DELAY}ms · robots ${IGNORE_ROBOTS ? 'ignored' : 'respected'}\n`);

  const report = { NEW: [], CHANGED: [], UNCHANGED: [], FAILED: [], ROBOTS: [], BLOCKED: [] };
  for (const r of direct) {
    const ext = r.type === 'pdf' ? 'pdf' : 'html';
    const rawPath = path.join(RAW, `${r.doc_id}.${ext}`), txtPath = path.join(TXT, `${r.doc_id}.txt`);
    const prev = state[r.doc_id] || {};
    try {
      if (DRY) { console.log(`  · [plan] ${r.doc_id.padEnd(16)} ${r.url}`); continue; }
      if (!(await robotsAllowed(r.url))) { report.ROBOTS.push(r); console.log(`  ⛔ robots  ${r.doc_id} (${new URL(r.url).host}) — use --ignore-robots or save manually`); continue; }
      await sleep(DELAY);
      const cond = (!FORCE && prev.etag) ? { 'If-None-Match': prev.etag } : (!FORCE && prev.lastModified ? { 'If-Modified-Since': prev.lastModified } : {});
      const res = await fetchUrl(r.url, cond, 0);
      if (res.status === 304) { report.UNCHANGED.push(r); console.log(`  = 304      ${r.doc_id}`); continue; }
      if (res.status >= 400 || !res.body.length) { report.FAILED.push({ r, why: 'HTTP ' + res.status }); console.log(`  ✗ HTTP ${res.status} ${r.doc_id} ${r.url}`); continue; }
      if (detectChallengePage(res.body)) {
        report.BLOCKED.push(r);
        console.log(`  ⚠ blocked  ${r.doc_id} — got a bot-challenge page, not the document. Nothing written; re-tag this row 'browser-check' or 'manual' in sources.csv.`);
        continue;
      }
      const hash = sha(res.body);
      const unchanged = !FORCE && prev.sha256 === hash;
      fs.writeFileSync(rawPath, res.body);
      // extract text
      let txtChars = prev.txtChars || 0;
      try {
        if (ext === 'pdf' && PDFTOTEXT) { extractPdf(rawPath, txtPath); txtChars = fs.existsSync(txtPath) ? fs.statSync(txtPath).size : 0; }
        else if (ext === 'html') { extractHtml(res.body, txtPath); txtChars = fs.statSync(txtPath).size; }
      } catch (e) { console.log(`    (extract failed for ${r.doc_id}: ${e.message})`); }
      state[r.doc_id] = { url: r.url, etag: res.headers.etag || '', lastModified: res.headers['last-modified'] || '', sha256: hash, bytes: res.body.length, txtChars, fetchedAt: new Date().toISOString() };
      if (!prev.sha256) { report.NEW.push(r); console.log(`  + NEW      ${r.doc_id.padEnd(16)} ${(res.body.length / 1024 | 0)}KB`); }
      else if (unchanged) { report.UNCHANGED.push(r); console.log(`  = same     ${r.doc_id}`); }
      else { report.CHANGED.push(r); console.log(`  ~ CHANGED  ${r.doc_id.padEnd(16)} ${(res.body.length / 1024 | 0)}KB`); }
    } catch (e) { report.FAILED.push({ r, why: e.message }); console.log(`  ✗ error    ${r.doc_id}: ${e.message}`); }
  }

  if (!DRY) fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

  /* ---------- summary + whats-new ---------- */
  const reaudit = report.NEW.concat(report.CHANGED);
  console.log(`\n── summary ──`);
  console.log(`  NEW ${report.NEW.length} · CHANGED ${report.CHANGED.length} · UNCHANGED ${report.UNCHANGED.length} · FAILED ${report.FAILED.length} · robots-skipped ${report.ROBOTS.length} · blocked ${report.BLOCKED.length}`);
  if (!DRY) {
    const lines = ['# Harvest — new / changed since last run  (' + new Date().toISOString() + ')', ''];
    if (!reaudit.length) lines.push('(nothing new — corpus is current)');
    reaudit.forEach(r => lines.push(`- [${r.doc_id}] ${r.title}  →  corpus/txt/${r.doc_id}.txt   (${r.notes})`));
    fs.writeFileSync(path.join(CORPUS, 'whats-new.txt'), lines.join('\n') + '\n');
    if (reaudit.length) { console.log(`\n  ▶ RE-AUDIT these (facts may have changed) — see corpus/whats-new.txt:`); reaudit.forEach(r => console.log(`     • ${r.doc_id} — ${r.title}`)); }
  }
  if (manual.length) {
    console.log(`\n  ✎ SAVE BY HAND (${manual.length}) — Info Hub reCAPTCHA / support-portal pages:`);
    manual.forEach(r => console.log(`     • ${r.doc_id.padEnd(16)} [${r.access}] ${r.url}`));
  }
  if (report.FAILED.length) { console.log(`\n  ✗ FAILED:`); report.FAILED.forEach(x => console.log(`     • ${x.r.doc_id}: ${x.why}  (${x.r.url})`)); }
  if (report.BLOCKED.length) { console.log(`\n  ⚠ BLOCKED (bot-challenge page, not the document — nothing written, sources.csv needs re-tagging):`); report.BLOCKED.forEach(x => console.log(`     • ${x.doc_id}  (${x.url})`)); }
  console.log('');
})().catch(e => { console.error('harvest fatal:', e); process.exit(1); });
