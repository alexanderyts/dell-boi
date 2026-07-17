/* =============================================================================
 * CONTRAST TEST — WCAG AA on the key text/background pairs in BOTH themes.
 * Pulls the token values straight from styles.css so it can't drift from the app.
 * Run: node tests/unit-contrast.js
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

// grab a token value from a given :root block ('' = light default, 'dark' = dark override)
function token(name, theme) {
  const block = theme === 'dark'
    ? (css.match(/:root\[data-theme="dark"\]\{([^}]*)\}/) || [, ''])[1]
    : (css.match(/:root\{([^}]*)\}/) || [, ''])[1];
  const m = block.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})'));
  return m ? m[1] : null;
}
function lum(hex) { const c = hex.replace('#', '').match(/../g).map(h => { let v = parseInt(h, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function ratio(a, b) { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }

let pass = 0, fail = [];
// [label, fg token, bg token, isLargeOrUI]  — small text needs 4.5:1, large/UI 3:1
const pairs = [
  ['body text', 'ink', 'bg', false],
  ['secondary text on page', 'muted', 'bg', false],
  ['secondary text on card', 'muted', 'card', false],
  ['teal accent (UI/large)', 'lum', 'bg', true],
  ['amber warning (large)', 'amber', 'bg', true],
  ['error red (large)', 'red', 'bg', true]
];
['', 'dark'].forEach(theme => {
  pairs.forEach(([label, fg, bg, big]) => {
    const f = token(fg, theme), b = theme === 'dark' ? (token('card', theme) || token('bg', theme)) : token(bg, theme);
    if (!f || !b) { fail.push(`${theme || 'light'}: ${label} — token missing (${fg}/${bg})`); return; }
    const r = ratio(f, b), min = big ? 3.0 : 4.5;
    if (r >= min) pass++; else fail.push(`${theme || 'light'}: ${label} ${r.toFixed(2)}:1 < ${min}:1 (${f} on ${b})`);
  });
});

console.log(`unit-contrast: ${pass} passed, ${fail.length} failed`);
fail.forEach(f => console.log('  ✗ ' + f));
process.exit(fail.length ? 1 : 0);
