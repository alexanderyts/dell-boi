/* =============================================================================
 * REP-FACING TEXT SWEEP — GAPS G-036 (2026-09-17)
 * -----------------------------------------------------------------------------
 * The maintainer is a sales rep; every string the app shows them can be repeated to a
 * customer verbatim. The 2026-09-17 review found eleven strings that contradicted current
 * rulings (OS10/VLT on new builds, "Verity", DFM "vendor-agnostic", single-mode advice beside
 * multimode optics, an unverified switch-support claim). tests/invariants.js's R14 scan covered
 * BOM item/note strings ONLY — every hit sat in a Checks message, a platform Requirement/
 * Concern, a rules consideration, the Discovery pitch, or a form label. This sweep covers all
 * of those, from the REAL engine output of representative new-build designs across every entry
 * point plus the static text sources, against a short forbidden-term list.
 *
 * Add a term here when a ruling retires it; a string that legitimately describes a customer's
 * EXISTING gear is allowed by the `allow` predicate (it must say so in the same string).
 * Run: node tests/unit-reptext.js
 * ========================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
['js/catalog/switches.js', 'js/catalog/optics.js', 'js/catalog/platforms.js', 'js/catalog/rules.js',
 'js/catalog/reference-architectures.js', 'js/catalog/solutions.js', 'js/catalog/discovery.js',
 'js/validate.js', 'js/engine.js', 'js/design.js'].forEach(f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f }));
const C = window.CATALOG;

let pass = 0; const fail = [];
const t = (name, cond, got) => { if (cond) pass++; else fail.push(name + (got !== undefined ? '  → ' + JSON.stringify(got) : '')); };

/* ---- forbidden on a NEW-BUILD quote (each with the ruling that retired it) ---- */
const FORBIDDEN = [
  { re: /\bVLT\b|VLTi/, why: 'OS10 dropped for new builds (SPEC §4, R14 2026-07-23) — VLT/VLTi only describes EXISTING gear',
    // legitimately describing a customer's existing switches must SAY so in the same string
    allow: s => /existing|EXISTING|customer'?s (own )?(switches|gear)|refresh/i.test(s) },
  { re: /Verity/, why: 'DFM rebrand — say "Dell Fabric Manager (DFM)"; the old name only as "formerly/was Verity" or in a document citation',
    allow: s => /formerly Verity|\(was Verity\)|Verity \d+(\.\d+)* documentation/.test(s) },
  { re: /vendor-agnostic/i, why: 'DFM manages Dell Enterprise SONiC only (SPEC §8) — it is not vendor-agnostic' },
  { re: /single-mode fiber for leaf/i, why: 'the engine quotes SR-class multimode optics + an OM4 plant for leaf→spine (SPEC §9)' },
  { re: /7308X3|via ETC/, why: 'CITATION-LOG: the Arista/SN5600-via-ETC PowerScale claim is STALE (not in the cited doc)' },
  { re: /\bSONiC or OS10\b|\bor VLT pair\b/, why: 'OS10 is not offered on new builds' }
];

/* ---- 1. REAL engine output across every entry point ---- */
const designs = {
  'tor-25g': () => window.recommend({ platformId: 'poweredge-general', units: 24, redundancy: 'dual', includeMgmt: true, nic: { speed: '25GbE', portsPerNic: 2, nicsPerUnit: 1 }, includeCoreUplink: true, coreSpeed: '100GbE', coreVendor: 'other' }),
  'copper-bt': () => window.recommend({ targets: [{ platformId: 'poweredge-general', units: 60, nic: { vendor: 'Broadcom', speed: '10GBase-T', portsPerNic: 2, nicsPerUnit: 1 } }], racks: 2, redundancy: 'dual', includeMgmt: true, trafficProfile: 'balanced' }),
  '100g-s5448f': () => window.recommend({ platformId: 'poweredge-general', units: 40, redundancy: 'dual', includeMgmt: true, placement: 'structured', nic: { speed: '100GbE', portsPerNic: 2, nicsPerUnit: 1 }, leaf100: 's5448f', includeCoreUplink: true, coreSpeed: '100GbE', coreVendor: 'dell', borderLeaf: true }),
  'single': () => window.recommend({ platformId: 'poweredge-general', units: 12, redundancy: 'single', includeMgmt: true }),
  'powerscale': () => window.recommend({ platformId: 'powerscale', units: 12, modelId: 'f710', redundancy: 'dual', includeMgmt: true }),
  'powerstore-roce': () => window.recommend({ platformId: 'powerstore', units: 6, redundancy: 'dual', includeMgmt: true, storageProtocol: 'nvme-roce', fabricInterconnect: 'independent' }),
  'ai-nvidia': () => window.recommend({ targets: [{ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, modelId: 'xe9680', railNicCage: 'qsfp112' }], stack: 'nvidia', redundancy: 'dual', includeMgmt: true }),
  'ai-dell': () => window.recommend({ targets: [{ platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, modelId: 'xe9680', railNicCage: 'qsfp112' }], stack: 'dell', redundancy: 'dual', includeMgmt: true, racks: 3 }),
  'ai-dell-osfp': () => window.recommend({ targets: [{ platformId: 'poweredge-ai', units: 8, gpusPerServer: 8, modelId: 'xe9680', railNicCage: 'osfp' }], stack: 'dell', redundancy: 'dual', includeMgmt: true }),
  'combined': () => window.recommend({ targets: [{ platformId: 'poweredge-general', units: 30 }, { platformId: 'powerstore', units: 4 }], redundancy: 'dual', includeMgmt: true, fabricArchitecture: 'converged', deployType: 'add', reuseExistingSpine: true }),
  'edge-poe': () => window.recommendEdge({ endpoints: 192, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'dual', includeMgmt: true }),
  'edge-fiber': () => window.recommendEdge({ endpoints: 48, poe: 'none', accessSpeed: 'fiber', edgeRedundancy: 'dual', includeMgmt: true }),
  'refresh': () => window.recommendRefresh({ swCount: 8, portsPer: 48, targetSpeed: '25g', topologyNow: 'tor', distribution: 'new', includeMgmt: true }),
  'ra': () => window.recommendRA((C.referenceArchitectures[0] || {}).id, 8, { railNicCage: 'osfp' })
};
const strings = [];   // { src, text }
Object.entries(designs).forEach(([name, mk]) => {
  let r; try { r = mk(); } catch (e) { fail.push(`design '${name}' threw: ${e.message}`); return; }
  (r.warnings || []).forEach(w => strings.push({ src: `${name} · Checks[${w.severity}]`, text: String(w.message || '') }));
  (r.bom || []).forEach(b => strings.push({ src: `${name} · BOM line "${String(b.item || b.model || '').slice(0, 40)}"`, text: `${b.item || ''} · ${b.note || ''}` }));
});
t('every representative design produced a result', strings.length > 200, strings.length);

/* ---- 2. static rep-facing sources ---- */
(C.platforms || []).forEach(p => {
  (p.requires || []).forEach(s => strings.push({ src: `platforms.${p.id}.requires`, text: s }));
  (p.concerns || []).forEach(s => strings.push({ src: `platforms.${p.id}.concerns`, text: s }));
});
(C.rules.leafSpine.considerations || []).forEach(s => strings.push({ src: 'rules.leafSpine.considerations', text: s }));
[['rules.leafSpine.note', C.rules.leafSpine.note], ['rules.redundancy.note', C.rules.redundancy.note], ['rules.coreUplink.note', C.rules.coreUplink.note],
 ['rules.cabling.note', C.rules.cabling.note], ['rules.backend.note', C.rules.backend.note], ['rules.deployment.note', C.rules.deployment.note]]
  .forEach(([src, s]) => { if (s) strings.push({ src, text: s }); });
Object.entries(C.rules.redundancy.methods || {}).forEach(([k, m]) => { if (k !== 'vlt') strings.push({ src: `rules.redundancy.methods.${k}`, text: `${m.label} ${m.note}` }); });
const walk = (obj, src) => { if (typeof obj === 'string') strings.push({ src, text: obj }); else if (obj && typeof obj === 'object') Object.entries(obj).forEach(([k, v]) => walk(v, src + '.' + k)); };
walk(C.discovery, 'discovery'); walk(C.solutions, 'solutions');
(C.switches || []).filter(s => !s.eol).forEach(s => strings.push({ src: `switches.${s.id}.useCase`, text: s.useCase || '' }));
// index.html visible text (tags, scripts, styles stripped; attributes are not rep-visible)
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n');
html.split('\n').map(s => s.trim()).filter(Boolean).forEach(s => strings.push({ src: 'index.html', text: s }));

/* ---- 3. the sweep ---- */
const hits = [];
strings.forEach(({ src, text }) => FORBIDDEN.forEach(f => {
  if (f.re.test(text) && !(f.allow && f.allow(text))) hits.push(`${src}: "${text.slice(0, 110)}"  ← ${f.why}`);
}));
t(`no rep-facing string carries a retired term (${strings.length} strings × ${FORBIDDEN.length} terms)`, hits.length === 0, hits);

/* ---- 4. positive pins for the specific corrections (so a rewrite can't quietly drop the point) ---- */
t('Discovery: DFM is scoped to Dell Enterprise SONiC, never "vendor-agnostic"', /Dell Enterprise SONiC switch/.test(C.discovery.competitors.mixed.points.join(' ')));
t('Discovery AI pitch names the switches the engine actually picks (SN5600 / SN5610)', /SN5600/.test(C.discovery.workloads.ai.recommendation) && !/SN4700/.test(C.discovery.workloads.ai.recommendation));
t('Discovery virtualization pitch names the SPEC 100G spine ladder (S5232F / Z9264F), not the 400G Z9432F', /S5232F/.test(C.discovery.workloads.virtualization.recommendation) && !/Z9432F/.test(C.discovery.workloads.virtualization.recommendation));
t('Checks leaf-spine advice matches what the BOM quotes (OM4 multimode, single-mode only leaving the building)', C.rules.leafSpine.considerations.some(s => /OM4 multimode/.test(s) && /single-mode only/.test(s)));
t('PowerEdge "Requirement:" names an MC-LAG leaf pair (not VLT)', (C.platforms.find(p => p.id === 'poweredge-general').requires || []).some(s => /MC-LAG leaf pair/.test(s)));
t('PowerScale back-end warning no longer offers the unverified Arista/ETC clause', !(() => { const r = window.recommend({ targets: [{ platformId: 'powerscale', units: 12, modelId: 'f710' }], stack: 'nvidia', redundancy: 'dual', includeMgmt: true }); return r.warnings.some(w => /7308X3|via ETC/.test(w.message)); })());

console.log(`unit-reptext: ${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + (Array.isArray(f) ? f.join('\n      ') : f)));
process.exit(fail.length ? 1 : 0);
