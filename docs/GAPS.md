# Known Gaps — tracked backlog

CONSOLIDATED after direct review of: engine.js, validate.js, platforms.js,
switches.js, rules.js, optics.js. Two prior drafts (from before the real code
was available) are superseded by this version — the earlier draft-only
pickSuperSpine patch is now verified against the real catalog and folded into
G-001 below.

Status values: `OPEN` | `MITIGATED` | `CLOSED`
Severity: `HIGH` (produces a wrong/unbuildable BOM silently) · `MEDIUM`
(produces a suboptimal but buildable BOM, or fails loud) · `LOW` (edge case
or non-sizing feature)

## How to run the next review round
The loop that's worked across every round of this file so far:
1. **External review → verify against live code.** A written review (a
   pasted work order, a prior GAPS.md draft, a fresh-context reread) can
   describe the codebase wrong or go stale between when it's written and
   when it's acted on — G-002/G-003/G-008 sat "fixed in code" but
   unmarked in this file for a whole round; G-P03 described a test file
   that had existed the whole time. Read the actual current source before
   trusting any written description of it, including this file's own.
2. **Push back where the review is wrong.** G-007's own drafted fix (drop
   the AI-only gate on the breakout-radix credit) broke 7 real scenarios
   on first live test — reverted, root-caused, replaced with the
   correctly-scoped fix. Don't merge a drafted fix on faith; verify it
   against the live codebase the same way you'd verify the bug report.
3. **Fuzz after the fix, not just the hand-picked case.** Every recurring-
   pattern gap this engagement found (G-013's three `pickBreakout()` call
   sites, the AI grouping-key collision, the rep-is-slower-member merge
   bug) was found by `tests/harness/audit-fuzz.js` AFTER a hand-verified
   fix already looked done — the hand-picked scenario proves the reported
   case; fuzzing finds the sibling cases nobody thought to hand-pick.
4. **Land the fix and its test in the same commit/step.** A fix without a
   regression test is a fix that can silently un-fix itself; G-003's own
   reconciliation (PR7) found and closed exactly this gap — check #22 had
   coverage, check #13 (fixed in the same original commit) didn't.
5. **Convert a manual audit into a permanent guard, not a one-time pass.**
   The call-site-count static check (G-013), the `KNOWN_GAPS`-pinned
   renderer parity script (PR5/G-014), and the `resolveUplinkBreakout()`
   consolidation itself are all "turn a grep/audit a human just did into
   something that fails CI if it regresses" — cheap insurance once, not
   a debt that has to be manually re-checked every round.
6. **Flag instead of forcing.** When a citation, a drafted fix, or this
   file's own prior status doesn't match live reality, document the
   conflict precisely (source doc doesn't exist in `corpus/`, a target
   status list didn't account for a real still-open bug) — don't silently
   resolve it by guessing or by relabeling reality to match the plan.

---

## Numbered gaps
Each entry states its own current status in its header (CLOSED with a
date, OPEN, STOP-GAP CLOSED, etc.) — this is no longer one uniform "OPEN"
bucket; treat the section title as an index, not a status.

### G-001 — `pickSuperSpine()` missing native-radix rung — CLOSED 2026-07-15
> **AMENDED 2026-07-16d (R12 ruling) — read this first.** The closure text below says the
> above-boundary case "correctly falls through to Z9964F-ON". That is **no longer correct, and was
> phantom-backed even when written**: the Z9964F-ON (1.6TbE OSFP224) cannot terminate a 400GbE
> Z9664F-ON (or 800GbE Z9864F-ON) pod-spine link — no cataloged breakout with matching far-ends
> exists — so crediting it with usable ports was capacity attributed to a link with no part behind
> it. The ladder is now **part-evidence-gated**: a candidate qualifies only if it can terminate the
> pod-spine's uplink speed (native, or a cataloged breakout whose far ends seat in the pod-spine's
> cage); otherwise the tier steps to the **same-speed** switch and widens by port math. The G-001
> *principle* (don't jump past a valid same-speed rung) is unchanged and now stronger — it simply
> also applies to the flagship. The flagship is GATED, not banned: catalog a qualifying part and it
> re-enters automatically (CITATION-LOG → "super-spine 800G termination"). Tests re-ruled in
> `tests/unit-engine.js` + `audit-independent.js`; see DESIGN-LOG 2026-07-16d.
- **Status:** CLOSED. Merged as drafted. Boundary-tested (totalPodSpines
  56/64/72 around the Z9664F-ON radix ceiling — permanent tests in
  `tests/unit-engine.js`, since `pickSuperSpine` isn't exposed on `window`
  for direct testing): below and AT the 64-port boundary correctly picks
  Z9664F-ON (not the flagship); above it correctly falls through to
  Z9964F-ON with the documented 4th-tier scope-limit warning present (not a
  silent gap). NVIDIA path confirmed unchanged (SN5610→SN6810 still
  resolves to SN6810 — that jump is already same-speed/flagship-coincident,
  no intermediate rung exists or should be invented). One pre-existing test
  (`reuse-spine-3tier-regression` in `audit-independent.js`) had a stale
  comment describing the OLD flagship-jump behavior at the scale it pins —
  updated for accuracy; the test itself already passed either way (it
  checks "cable line OR explanatory warning", which holds under both the
  old and new super-spine pick).
- **Severity:** MEDIUM
- **Where:** `js/engine.js`, `pickSuperSpine()`
- **Fix:**
```js
function pickSuperSpine(podSpine, totalPodSpines, stack) {
  const byId = id => C.switches.find(x => x.id === id);
  const radix = sw => (sw && sw.access && sw.access.count) || 0;
  if (radix(podSpine) >= totalPodSpines) return podSpine;

  // MISSING RUNG (fixed): before jumping to the flagship, look for a
  // same-speed, higher-radix spine-role switch (e.g. Z9664F-ON, 400GbE/64
  // native, one step above the Z9432F-ON pod-spine's 400GbE/32) — keeps
  // pod-spine<->super-spine cabling same-speed/cataloged instead of
  // forcing an uncataloged breakout.
  const podSpeed = podSpine && podSpine.access && podSpine.access.speed;
  const podRadix = radix(podSpine);
  const sameSpeedStep = podSpeed ? C.switches
    .filter(sw => sw.vendor === podSpine.vendor && sw.access && sw.access.speed === podSpeed &&
      sw.roles && sw.roles.indexOf('spine') >= 0 && radix(sw) > podRadix)
    .sort((a, b) => radix(a) - radix(b))
    .find(sw => radix(sw) >= totalPodSpines)
    : null;
  if (sameSpeedStep) return sameSpeedStep;

  const flagship = stack === 'nvidia' ? byId('sn6810') : byId('z9964f-on');
  return (flagship && radix(flagship) >= totalPodSpines) ? flagship : (flagship || podSpine);
}
```
- **Verified against catalog:** confirms Z9664F-ON exists, is `roles:
  ['spine']`, `access.speed === '400GbE'`, radix 64 > Z9432F-ON's 32. No
  equivalent intermediate exists on the NVIDIA side (SN5610→SN6810 jumps
  64→128 with nothing between) or for Z9864F-ON pod-spines (800GbE, no
  second 800G-native spine model) — fix correctly falls through to
  existing flagship behavior in both those cases, no regression.

### G-002 — Pod-spine↔super-spine breakout info never reaches `validate.js` — CLOSED 2026-07-15
- **Status:** CLOSED. Fixed and shipped in this engagement's PR1 (round
  v0.63.0) — this entry's own draft fix is exactly what's live in code
  today (`fs._record` live-reference in `js/engine.js` step 4, step 5
  attaches `superSpineBreakout` onto the same object, `validate.js` #13/
  #22 both read `f.superSpineBreakout.ratio`). This GAPS.md entry itself
  was never marked closed at the time — reconciled now (PR7, PROMPT-2).
- **Test:** confirmed live in `tests/unit-engine.js` (the synthetic
  `bf.superSpineBreakout` credit/no-credit pair against check #22's
  `OVER-COMMITTED` error) and `tests/challenge-bestpractice.js`'s 3-tier
  scale assertions.
- **Severity:** HIGH (produces a false hard-error `'error'` in `validate.js`
  check #22 for a class of design most likely to occur exactly where it
  matters — large 3-tier AI builds)
- **Where:** `js/engine.js` step 4 (fabrics.push) vs step 5 (spine BOM /
  breakout calc) vs `js/validate.js` checks #13 and #22
- **What:** `fabrics.push({...})` in step 4 creates a plain object snapshot
  of `fs`'s fields. The pod-spine↔super-spine breakout ratio is computed
  in step 5 — which runs AFTER that push — and would need to mutate the
  ALREADY-PUSHED object to reach validate.js. It currently doesn't; step 5
  only touches local `grp`/loop variables, never the pushed record. Result:
  `f.superSpineBreakout` is always undefined when validate.js reads it, so
  both #13 (warn) and #22 (error) compute `superCap` from the RAW native
  super-spine port count with no breakout credit — e.g. a Z9864F-ON
  pod-spine (800GbE) stepping to a Z9964F-ON super-spine (1.6TbE, 2:1
  breakout) will always report `superNeeded > superCap` even when the
  design is correctly sized, firing a false `'error'` on the highest-value
  design class this tool targets.
- **Fix (two-file):**
  1. `engine.js` step 4 — keep a live reference to the pushed record:
     ```js
     const fabricRecord = { /* ...all existing fields, unchanged... */ };
     fs._record = fabricRecord;   // step 5 needs to attach breakout info onto
                                   // the SAME object validate.js reads
     fabrics.push(fabricRecord);
     ```
  2. `engine.js` step 5, inside the existing `if (superGbps > podGbps && ...)`
     breakout branch (where `assemblies` is computed):
     ```js
     const superSpineBreakout = { ratio, high: grp.superSpine.access.speed, low: grp.spine.access.speed, model: brk.model };
     grp.fabrics.forEach(f => { if (f._record) f._record.superSpineBreakout = superSpineBreakout; });
     ```
  3. `validate.js` #13 and #22, super-spine sections — read it:
     ```js
     const superRatio = (f.superSpineBreakout && f.superSpineBreakout.ratio) || 1;
     const superCap = ((f.superSpine.access && f.superSpine.access.count) || 0) * (f.superSpineCount || 1) * superRatio;
     ```
- **Test:** TODO — needs a 3-tier design that actually exercises the
  pod-spine↔super-spine breakout path (large AI build, Z9864F-ON pod-spine
  scale) added to `challenge-bestpractice.js`; not yet confirmed such a
  case exists in the current suite.

### G-003 — `validate.js` check #13 is breakout-blind; check #22 is not — CLOSED 2026-07-15
- **Status:** CLOSED. Fixed and shipped in PR1 (round v0.63.0) — this
  entry's draft fix (the `ratio = f.uplinkBreakout ? f.uplinkBreakout.ratio
  : 1` credit on check #13's `cap`, and simplifying #22's dead ternary) is
  exactly what's live in `js/validate.js` today. Like G-002, the code
  shipped without this entry being marked closed at the time; reconciled
  now (PR7, PROMPT-2). One residual gap found during this reconciliation:
  #22's fix (the ERROR-severity path) had regression coverage, but #13's
  own WARN-severity path had NONE — a design using breakout could regress
  back to a spurious "short on ports" warning and nothing would catch it.
  Closed that gap in the same commit: `tests/unit-engine.js` now has a
  synthetic `bf2.uplinkBreakout` credit/no-credit pair asserting #13
  specifically, mirroring the pattern G-002's test already used for #22.
- **Severity:** MEDIUM (false `'warn'` on correctly-sized designs — noise
  that trains reps to distrust/ignore warnings generally, distinct from
  G-002's false `'error'`)
- **Where:** `js/validate.js`, check #13 (spine capacity)
- **What:** #13 computes `cap = ((f.spine.access && f.spine.access.count)
  || 0) * podSpines` — no breakout adjustment. #22 (physical port budget,
  the authoritative hard-error check) correctly multiplies by
  `f.uplinkBreakout.ratio` when present. Any spine genuinely using breakout
  (e.g. Z9432F-ON serving 100G leaves via its 400G ports — a normal,
  correctly-sized case per the engine's own general-spine ladder) will
  make #13 warn "may be short on ports" even though #22 confirms the
  design fits. Also noted in passing: #22's own ternary
  `(cond ? 1 : 1)` is dead code — both branches return 1.
- **Fix:**
  ```js
  res.fabrics.forEach(f => {
    if (!f.spine) return;
    const podSpines = f.totalPodSpines || f.spineCount || 1;
    const needed = f.totalLeaves * (f.uplinksPerLeaf || 4);
    const ratio = f.uplinkBreakout ? f.uplinkBreakout.ratio : 1;
    const cap = ((f.spine.access && f.spine.access.count) || 0) * podSpines * ratio;
    if (cap && needed > cap)
      push(res, 'warn', `${f.network} spine may be short on ports (~${needed} leaf uplinks vs ~${cap} spine ports on ${f.spine.model} ×${podSpines}${ratio > 1 ? ` w/ ${ratio}× breakout` : ''}). Add spines or use a higher-radix model.`, R.leafSpine.source);
    ...
  ```
  Also simplify #22's dead ternary to just `1` while touching this code.
- **Test:** TODO — a design with Z9432F-ON serving 100G leaves via breakout
  should produce ZERO port-capacity warnings from #13; add as a regression
  assertion alongside the #22 physical-fit tests.

### G-004 — `rules.power.switchWatts` / `switchWeightKg` missing entries for several catalog switches — CLOSED (partial) 2026-07-15
- **Status:** CLOSED for what's fixable; two sub-findings escalated instead
  of guessed. Corrections to the original description, found while
  actually pulling real figures: `s4348t-on` and `e3224f-on` were ALREADY
  present in `switchWatts` (this GAPS.md draft was stale on those two —
  likely added in a later session round after this review was written).
  `switchWeightKg` was NEVER a per-model map at all — it's deliberately a
  by-rack-U-only estimate (`{1,2,3}`); the "missing weight entries" framing
  in the original write-up below doesn't match how the code actually
  consumes it (confirmed in `js/ui.js` `powerRollup()`) — no fix needed
  there, it's working as designed. What WAS real and is now fixed: added
  `z9964f-on` (4987W, sourced — see below) and `sn5600d` (940W, sourced)
  to `switchWatts`; added a `switchWattsByU[3]` floor (900) so any future
  3U addition doesn't repeat the silent-`undefined` gap. Permanent
  catalog-completeness test added (`tests/unit-engine.js`): every switch
  id resolves to a real, positive, finite wattage. `sn5600` (plain, not
  -D) and plain `sn6810` (not -LD) genuinely have no figure under those
  exact names anywhere in `corpus/` — left OUT rather than guessed; logged
  in `CITATION-LOG.md` as NEEDS RECHECK. The same pull also surfaced a
  real conflict unrelated to this gap: `z9964f-on`'s switching-capacity
  figure (204.8 Tbps in this catalog) doesn't match `corpus/txt/QRG-DC.txt`
  (102.4 Tbps) — and the EXISTING `z9664f-on`/`z9432f-on` wattage entries
  don't match that same document's own "normal" column either — all
  logged in `CITATION-LOG.md` (upgraded to STALE) for the citation-
  verification pass, not silently changed here without knowing which
  source is authoritative.
- **Severity:** LOW (doesn't affect network design/sizing correctness —
  affects the power/rack rollup shown to a customer)
- **Where:** `js/catalog/rules.js`, `power.switchWatts` and
  `power.switchWattsByU`
- **What:** Cross-referencing against the real `switches.js` catalog:
  `s4348t-on`, `sn5600`, `sn5600d`, `sn6810`, `e3224f-on` have no named
  wattage entry. The `switchWattsByU` fallback is keyed only `{1: ..., 2:
  ...}` — `z9964f-on` is a 3U switch (the flagship spine, 204.8 Tbps) with
  neither a named entry nor a matching `switchWattsByU[3]` fallback. Since
  `rules.power.note` explicitly promises the rollup is "a defensible
  ballpark" for the rep, this silently produces `undefined` or a wrong
  fallback figure for exactly the switches most likely to appear in the
  largest, highest-stakes AI quotes (flagship Dell and NVIDIA spines).
- **Fix:** Add explicit wattage + weight entries for the five listed
  switches; add a `switchWattsByU[3]` fallback entry as a floor even after
  the named entries exist, so any future 3U catalog addition doesn't
  silently repeat this gap.
- **Test:** TODO — assert every switch id in `switches.js` resolves to a
  non-undefined wattage figure (named or by-U fallback) — a simple
  catalog-completeness check, not a sizing-logic test.

### G-005 — `pickHostCable()`'s `adjacent` placement DAC fallback contradicts the stated design rule — CLOSED 2026-07-15
- **Status:** CLOSED. Took option (a) — removed the DAC fallback,
  `adjacent` now resolves ONLY to AOC or `null` (caller's existing "no
  cataloged optic" warning). Matches this codebase's established
  convention elsewhere (never silently substitute a wrong/lesser part —
  same principle behind `resolveUplinkBreakout()`'s null-not-guess
  design). The now-unused `first()` helper in `pickHostCable` was deleted
  rather than left dead. Permanent regression test added asserting
  `adjacent` resolves to AOC (not DAC) at 25G and 100G.
- **Severity:** LOW (currently dead code, not a live bug — flagging for
  defensive hardening)
- **Where:** `js/engine.js`, `pickHostCable()`, `placement === 'adjacent'`
  branch
- **What:** `rules.leafSpine.considerations` explicitly tells the rep "DAC
  is in-rack only" — shown to customers via validate.js check #17. But
  `pickHostCable`'s adjacent-rack branch is:
  ```js
  if (gbps >= 100 && gbps < 200) return first(['aoc-100g-qsfp28', 'dac-100g-qsfp28']);
  if (gbps >= 25 && gbps < 100) return first(['aoc-25g-sfp28', 'dac-25g-sfp28']);
  ```
  `first()` returns the first id found in the catalog; both AOC and DAC
  ids currently exist, so AOC always wins today — not a live bug. But if
  either AOC catalog entry is ever renamed/removed, this silently falls
  back to shipping DAC on an adjacent-rack run, directly contradicting the
  rule the tool tells the customer it follows.
- **Fix (pick one):** (a) remove the DAC fallback entirely and return
  `null` if AOC is missing — matches this codebase's own stated convention
  of failing loud rather than silently substituting; or (b) add a
  regression test asserting the AOC entry always resolves first for these
  speed ranges, so a future catalog edit that breaks this fails CI instead
  of shipping silently.
- **Test:** TODO — assert `pickHostCable(g, 'adjacent', ...)` never returns
  a DAC-category optic for any gbps currently in the catalog.

### G-006 — MX7000 external-uplink port count was a 2× under-count — CLOSED 2026-07-17
- **Status:** CLOSED. Confirmed live and fixed. `count: 4` → `count: 8`.
  The defect was real: the entry declared 4 external uplinks per chassis
  while its own `portOptions` prose said "4× per FSE (2 FSEs/chassis)" —
  i.e. the entry contradicted itself, and the count was the wrong half.
  A rep quoting an MX7000 chassis got **half the uplink optics the build
  needs**. Severity was MEDIUM as logged; it was accurate.
- **What resolved it — a revised evidence standard (maintainer ruling
  2026-07-17):** the prior blocker was "no MX9116n spec sheet in corpus."
  That requirement was a *proxy* for "authoritative citable source," and
  it was blocking on a document that **appears not to exist** — the
  MX9116n is an aging modular platform whose port layout is published in
  the deployment guides, not a standalone spec sheet. New standard: **two
  independent official Dell documents agreeing verbatim = sufficient.**
  Two such documents are now in corpus and agree exactly:
  - **H18548.9.2** — PowerEdge MX Networking Deployment Guide, **June 2026**
    (`corpus/txt/CO-MX-NET.txt`): *"Two 100 GbE QSFP28 ports, used for
    Ethernet uplinks, ports 41 and 42 ● Two 100 GbE QSFP28 unified ports,
    used for Ethernet and Fibre Channel connections, ports 43 and 44"*
  - **H19120** — MX Deployment with VMware Cloud Foundation, **March 2022**
    (`corpus/txt/CO-MX-VCF.txt`): *"Two 100 GbE QSFP28 ports ● Two 100 GbE
    QSFP28 unified ports ● Twelve 2x100 GbE QSFP28-Double Density (DD) ports"*
  => 4 Ethernet uplinks/FSE (2 dedicated + 2 unified) × 2 FSEs = **8/chassis**.
  The 2026-07-15 investigation's "zero hits for Fabric Switching Engine"
  finding was CORRECT at the time — neither guide was in `corpus/` yet.
  Both landed in the 2026-07-17 corpus-intake pass.
- **Where:** `js/catalog/platforms.js`, `mx7000` entry
- **Fix (landed):** `count: 4` → `8`; `portOptions` rewritten to state the
  per-FSE arithmetic explicitly (2 dedicated ports 41-42 + 2 unified 43-44,
  × 2 FSEs); `source` now cites both documents; `verify: true` → `false`
  (the number is now corroborated, not seed-and-verify). A rep-facing
  concern was added for the FC caveat below.
- **Design caveat carried into the BOM:** the 2 unified ports per FSE are
  **Ethernet OR native Fibre Channel** — they are not both. An FC-attached
  MX chassis flexes the uplink count **8 → 4**. The platform `note` and a
  `concerns` entry both say so, so a rep quoting FC sees it.
- **Test:** `tests/unit-engine.js`, "G-006" block — pins the count, the
  media/speed, the note's FC caveat, the rep-facing concern, and the
  end-to-end engine result (4 chassis = 32 links). Also pins the
  *self-consistency* of count vs `portOptions` prose, which is the exact
  class of drift that produced the original bug. **Verified as a real
  guard:** reintroducing `count:4` turns 3 assertions red (including
  totalLinks 32 → 16); it is not a vacuous test.
- **Recheck note:** do NOT reopen the MX9116n spec-sheet hunt. No such
  standalone document is known to exist; the two deployment guides are the
  citable source of record. See the CITATION-LOG row.

### G-007 — 3-tier trigger and `podLeafCap` are breakout-blind — CLOSED 2026-07-15
- **Status:** CLOSED. Confirmed live (520× poweredge-ai spuriously built a
  3-tier Clos + false hard error) and fixed for AI. The drafted fix below
  ("drop the `grp.ai &&` gate entirely") was verified WRONG on live testing —
  it compares the spine's native speed against the fabric's HOST NIC speed,
  which only equals the spine-facing uplink speed for AI's folded-Clos
  design; for general/storage (e.g. 25G host vs 100G uplink) it's a
  different hop and credited phantom capacity with no cataloged breakout
  behind it (broke 7 real scenarios on first attempt — reverted).
  The CORRECT general/storage fix (built as a same-day follow-up, user-
  directed): a new shared `resolveUplinkBreakout(spine, upSpeed, breakoutMode, nv)`
  helper, using each fabric's REAL `uplinkSpeed`/`stack` (already known in
  step 2, before spine-grouping runs) and validated against the actual
  `pickBreakout()` catalog + the `breakout` input toggle — never a naive
  speed-ratio guess. This SAME helper now backs both the 3-tier trigger
  (step 3) and the real uplink cabling (step 4), so they can never diverge.
  For a spine group combining multiple fabrics at different uplink speeds
  (sharedSpine mode), the group is credited the MINIMUM ratio any member
  achieves (conservative). Confirmed live: 3000 general-purpose servers (80
  leaves, Z9432F-ON spine, raw radix 32, but a cataloged 4× breakout the
  BOM already prices) now correctly stays flat 2-tier; 10000 servers (262
  leaves, genuinely beyond even the breakout-credited radix) correctly
  builds 3-tier. Fuzzing this fix also found and fixed two more real bugs:
  (1) even within AI, an implied ratio with no matching cataloged part (e.g.
  800G leaf under a 1.6T spine) was still phantom-credited — now validated
  against `pickBreakout()` directly; (2) multiple AI/PowerScale targets of
  the SAME platform were silently colliding into one shared spine group
  (`gkey()` keyed on the platform id, not the per-instance uid) — fixed.
  16/16 suites + 90,000+ fresh fuzz designs clean. Original description below,
  kept for context.
- **Severity:** HIGH — this is now the top-severity finding. Unlike G-002/
  G-003 (wrong warnings), this one changes the actual BOM: it adds a full,
  unneeded pod-spine + super-spine tier of real hardware to designs that
  fit on a flat 2-tier spine.
- **Where:** `js/engine.js` step 3, spine-group sizing
- **What:** `spineEffRadix` (the breakout-adjusted port budget) is computed
  correctly but only wired into `grp.spineCount`. The actual 3-tier
  trigger and `podLeafCap` a few lines below still read the RAW,
  non-breakout `spineRadix`:
  ```js
  const groupLeavesFinal = grp.fabrics.reduce((s, f) => s + f.totalLeaves, 0);
  if (groupLeavesFinal > spineRadix) {                       // should be spineEffRadix
    const podLeafCap = Math.max(1, Math.floor(spineRadix / 2));  // should be spineEffRadix
  ```
  Prior review of this comparison (before `challenge-bestpractice.js` was
  available) assumed the `grp.ai &&` gate on `spineEffRadix`'s computation
  was the only issue and that AI groups were exempt — WRONG. Even for AI
  groups, `spineEffRadix` is computed but never reaches the trigger or
  `podLeafCap` at all. Confirmed by manually tracing
  `challenge-bestpractice.js`'s own `big` AI scenario (260× poweredge-ai,
  8 GPU/server = 2080 rails, dual, default 25% headroom): leaf/spine both
  resolve to Z9864F-ON (800G native, breakout-adjusted radix 128); the
  correctly-computed `spineEffRadix` (128) says 82 leaves fit flat and the
  spine-count math (41 spines × 128 ports = 5248, exactly matching total
  uplinks needed) PROVES it fits — but the trigger compares `82 > 64`
  (raw radix) and builds a full unneeded 3-tier Clos anyway.
- **Why the test suite didn't catch it:** the harness's related check —
  `'Two-tier reach ~2,000 GPUs — beyond that, super-spine/3-tier is
  flagged'` — only asserts that A 3-tier warning fires, via a regex on
  warning text. It can't distinguish "correctly needed 3-tier at genuine
  scale" from "spuriously triggered because the breakout adjustment was
  dropped" — both produce the same warning text, so the test passes
  either way. The bug is exercised by the suite's own data and still
  reports green.
- **Fix:**
  ```js
  // Drop the grp.ai-only gate entirely — breakout applies to general/
  // storage spines exactly as much as AI ones. Use spineEffRadix for the
  // TRIGGER and podLeafCap, not just spineCount.
  const spineEffRadix = (f0.gbps > 0 && spineNativeG > f0.gbps) ? spineRadix * Math.floor(spineNativeG / f0.gbps) : spineRadix;
  ...
  const groupLeavesFinal = grp.fabrics.reduce((s, f) => s + f.totalLeaves, 0);
  if (groupLeavesFinal > spineEffRadix) {
    const podLeafCap = Math.max(1, Math.floor(spineEffRadix / 2));
  ```
  Also update the "3-tier CLOS" info-warning text (currently prints raw
  `spineRadix`) to reference the effective figure, so the customer-facing
  message matches what actually triggered.
- **Test:** TODO — the existing "Two-tier reach" harness check needs a
  SECOND, stronger assertion: at a leaf count that fits within the
  breakout-adjusted spine radix but exceeds the raw native radix
  (exactly the `big` scenario's numbers), assert 3-tier does NOT trigger
  (`numPods === 1` / no pod-spine BOM lines). The existing warning-text
  check should stay as a separate, softer signal.

### G-008 — harness test-quality issues (not code bugs, but reduce the suite's ability to catch real ones) — CLOSED 2026-07-15
- **Status:** CLOSED. All four findings verified live in
  `tests/challenge-bestpractice.js` (fixed during this engagement's
  earlier rounds, never marked closed here until this reconciliation
  pass — PR7, PROMPT-2): (1) the RA test now iterates every entry in
  `C.referenceArchitectures` in a try/catch, no `[0]`-indexing crash risk;
  (2) an `accessSpeed: 'fiber'` + redundancy edge scenario exists and
  asserts the hard-error/un-priced-ICL behavior; (3) blanket
  `!warnings.some(severity === 'error')` assertions now guard the
  `big`/`wayBig`/`huge`/express/RA scenarios; (4) the growth-headroom
  check uses strict `l50 > l0`, and the dead `!warned(r, /^/)` clause is
  gone from the express-equivalent check.
- **Severity:** MEDIUM — these don't misbuild a BOM, but they mean several
  "closed" gaps and future regressions have less protection than the
  green checkmarks suggest.
- **Where:** `tests/challenge-bestpractice.js`
- **Findings:**
  1. **RA test is fragile and under-covers `reference-architectures.js`:**
     `W.recommendRA((C.referenceArchitectures[0] || {}).id, 16)` blindly
     indexes `[0]`. If the array is empty or reordered, `.id` is
     `undefined` and `recommendRA()` throws uncaught — crashing the
     ENTIRE harness run, not failing one check. It also only ever tests
     whichever RA happens to be first, so the `published()` scaling path
     isn't guaranteed coverage unless that RA happens to be at index 0.
     **Fix:** iterate every entry in `C.referenceArchitectures`, wrap each
     in try/catch so one bad RA doesn't kill the whole suite, and assert
     coverage of both `published()` and non-published RA shapes.
  2. **The E3224F-ON compatibility-gap fix (closed gap, prior session) has
     ZERO regression protection.** Every edge test uses `accessSpeed:
     '1g'` → E3248P-ON (SONiC-fine). Nothing exercises `accessSpeed:
     'fiber'` + redundancy on, which is the only combination that hits the
     "REQUESTED — NOT achievable" hard-error path. A future refactor could
     silently reintroduce that bug with this suite reporting all-green.
     **Fix:** add an edge scenario with `accessSpeed: 'fiber'` and assert
     the hard error + un-priced ICL line, matching the behavior documented
     in the (old) closed gap.
  3. **No 3-tier-adjacent scenario asserts the absence of unexpected
     `error`-severity warnings.** This is exactly why G-002 (false hard
     error from the missing `superSpineBreakout` field) would sail through
     undetected even once its code path is exercised — checks look for
     specific warning TEXT, never for "and nothing else broke."
     **Fix:** add a blanket `!r.warnings.some(w => w.severity === 'error')`
     assertion alongside the `big`/`huge` scenarios, scoped to exclude any
     error that's the actual subject of that check.
  4. **Minor assertion-strength nits:** growth-headroom check uses `l50 >=
     l0` (should be strict `>` — a headroom setting with zero effect would
     still pass); the "express-equivalent" check has a `!warned(r, /^/) ||
     (...)` construct where `/^/` matches any message, making that first
     clause dead code (harmless, just confusing to a future maintainer —
     simplify to the second clause alone).
- **Test:** N/A — these ARE the tests; fixes are edits to the harness
  itself, not new assertions to add elsewhere.

### G-009 — `recommendRA()` silently truncates requested node count to `ra.maxGpuNodes`, no warning — CLOSED 2026-07-15
- **Status:** CLOSED. Fixed in both return branches (published + generic-
  scale) exactly as drafted. Verified live across every RA in the catalog:
  requesting `maxGpuNodes+5` now warns and clamps `context.units` to
  `maxGpuNodes`; requesting exactly `maxGpuNodes` does not false-fire.
  Permanent regression test added (loops every catalog RA, plus the
  at-the-boundary no-false-positive case).
- **Severity:** MEDIUM-HIGH (silent under-quoting risk — a rep could quote
  far fewer GPU nodes than requested without any indication)
- **Where:** `js/engine.js`, `recommendRA()`, top of function
- **What:** `const n = Math.min(ra.maxGpuNodes, Math.max(1, parseInt(nodes, 10) || ra.maxGpuNodes));`
  clamps silently. Every RA in `reference-architectures.js` explicitly
  documents that larger scale IS possible beyond `maxGpuNodes` ("Larger
  clusters are supported but REQUIRE additional network switching";
  "fully tested to 8 SU" implying untested-but-not-impossible beyond).
  Nothing in the returned result distinguishes a request that was honored
  from one that was silently reduced.
- **Fix:**
  ```js
  const requested = parseInt(nodes, 10) || ra.maxGpuNodes;
  const n = Math.min(ra.maxGpuNodes, Math.max(1, requested));
  const truncated = requested > ra.maxGpuNodes;
  // ...unchanged...
  // add in BOTH return branches (published + generic), right after the
  // existing '✓ endorsement' warning push:
  if (truncated) result.warnings.unshift({ severity: 'warn',
    message: `Requested ${requested} node(s) exceeds this RA's endorsed/validated scale of ${ra.maxGpuNodes} — sized DOWN to ${ra.maxGpuNodes}. ${ra.scaleNote}`,
    source: ra.source });
  ```
- **Test:** TODO — assert `recommendRA(id, maxGpuNodes + 5)` produces a
  `'warn'`-severity truncation message and `context.units === maxGpuNodes`
  for every RA in the catalog.

### G-010 — GB300 NVL72 published path has zero rack-topology awareness, contradicts its own documented design — STOP-GAP CLOSED 2026-07-15
- **Status:** Stop-gap warning shipped exactly as drafted (only the published
  path — no rack-placement redesign attempted, per explicit scope). Verified
  live: fires for n>1, silent at n=1. Permanent regression test added. The
  REAL fix (thread `racks` through the published-path cable selection) is
  still open — track as a genuine follow-up, not silently forgotten.
- **Severity:** HIGH — quotes cables that cannot physically span the run
  described by the RA's own text, with no reach warning.
- **Where:** `js/engine.js`, `recommendRA()`, published-path cable
  selection
- **What:** Every cable in the published path is selected via
  `pickHostCable(cb.speed, 'in-rack', true)` — hardcoded `'in-rack'`
  unconditionally, no `racks` parameter exists anywhere in `recommendRA`.
  The GB300 NVL72 RA's own `published()` note states leaves "serve 2
  racks (underpopulated by design)" — meaning leaf-to-spine links in a
  design spanning multiple SUs (tested to 8) physically cross racks. This
  path quotes every one of those as a ≤3m passive DAC
  (`nv-dac-400g-osfp`) regardless. The OOB section has the same gap — one
  flat `cat6-1g` cable count with no per-rack structure, unlike the main
  `recommend()` pipeline's explicit multi-rack OOB/cabling pattern
  (`racks` input, per-rack OOB switches, DAC→AOC cross-rack stepping).
- **Fix (stop-gap, cheap):**
  ```js
  if (n > 1) result.warnings.push({ severity: 'warn',
    message: `This RA path does not yet model physical rack placement — all cables (including GPU compute uplinks and leaf-to-spine links) are quoted as in-rack DAC (≤3m) for all ${n} SU(s)/racks. Per this RA's own design ("leaves serve 2 racks"), some leaf-to-spine and inter-rack links will actually need AOC/optical reach — confirm cable lengths against the real rack layout before quoting.`,
    source: ra.source });
  ```
  **Real fix** (larger scope, not a one-liner): thread rack placement
  through the published-path cable selection the way `recommend()`
  already does — likely its own design/implementation pass rather than a
  quick patch. Log as a separate follow-up once the stop-gap ships.
- **Test:** TODO — assert the stop-gap warning fires for any RA `n > 1`;
  once the real fix lands, assert cross-rack links resolve to AOC/optical
  rather than DAC.

### G-011 — `uplinksPerLeaf × totalLeaves` can diverge from the actual `pub.cables` quantity for certain node counts — CLOSED 2026-07-15
- **Status:** CLOSED. This was, as of the PR7 reconciliation pass, the
  ONLY confirmed-live code bug remaining in the repo — live-tested and
  reproduced (n=7: 1024 vs 1008) before closing PR5-7, then flagged as a
  conflict against that round's target open-items list rather than
  silently left off it. Fixed as its own small follow-up PR using the
  entry's own preferred fix (option 2): `validate.js` checks #13 and #22
  now prefer the engine's already-resolved `f.uplinkCableQty` field over
  recomputing `totalLeaves × uplinksPerLeaf`, falling back to the
  recomputation only when `uplinkCableQty` is absent/zero. Same principle
  as the breakout fixes (G-002/G-003/G-013): consume a field the engine
  already resolved, don't re-derive it downstream. `uplinkCableQty` was
  already being correctly propagated onto `result.fabrics[]` for every
  `recommend()`/`recommendEdge()` path (where it's already IDENTICAL to
  `totalLeaves × uplinksPerLeaf` by construction, so this is a no-op
  there) — the RA published path was the only place a real, independent
  ground-truth cable count existed that the validator wasn't consuming.
- **Test:** Added exactly the test this entry's own "Test:" line called
  for — `tests/unit-engine.js` now sweeps EVERY `n` from 1 to
  `maxGpuNodes` on EVERY published RA in the catalog, asserting
  `f.uplinkCableQty` matches the real "Leaf-to-spine" cable BOM line and
  that no false spine-capacity warn/error fires — this is the test that
  would have caught the bug originally (fails at n=7 pre-fix), and it
  guards any future RA added with a `published()` function, not just the
  one that exposed this. A second, synthetic test directly proves the
  validator's preference logic itself (uplinkCableQty vs. the fallback,
  straddling a spine-capacity boundary either side).
- **Severity:** LOW-MEDIUM (only certain `n` values trigger it; risks a
  spurious port-budget flag in validate.js, not a wrong cable count)
- **Where:** `js/catalog/reference-architectures.js`, GB300 NVL72
  `published()`, `uplinksPerLeaf` calculation; consumed by
  `validate.js` checks #13/#22
- **What:** `uplinksPerLeaf: Math.ceil(144 * n / (8 * blocks))` divides
  evenly for most `n` (verified n=1,2,3,5) but not all. At **n=7**
  (`blocks=4`): `totalLeaves=32`, `uplinksPerLeaf=Math.ceil(1008/32)=32`
  → `32×32=1024`, but the actual "leaf-to-spine intra-fabric links" cable
  line is explicitly quoted at `144×7=1008` — a 16-link gap between what's
  physically cabled (the real BOM line) and what validate.js's
  `f.totalLeaves × f.uplinksPerLeaf` port-budget math will compute.

### Not a bug — flagging so it isn't "fixed" later
`totalLeaves = 8 * blocks` in the GB300 NVL72 `published()` function
provisions a full block's worth of leaf switches (8) even at `n=1` (a
single rack, half a block). This looks like over-provisioning but is
INTENTIONAL per the RA's own text — a block spans 2 SUs by design, and
leaves are meant to be "underpopulated" for an odd rack count.

### G-012 — `discovery.js` / `solutions.js` branding drift + unprotected catalog couplings — CLOSED 2026-07-15
- **Status:** CLOSED, all three parts. (1) Branding: all ~11 "Verity"
  mentions in `discovery.js` renamed to "Dell Fabric Manager (DFM)",
  with "(formerly Verity)" on the first mention in each of the two
  independently-viewed sections (`competitors`, `painPoints` — a rep only
  ever sees ONE competitor's or ONE pain point's text at a time, so each
  needed its own first-mention context, not just one for the whole file).
  (2) `fitsPains` coupling: verified still intact, now with a permanent
  regression test (was previously zero coverage). (3) `platformSeed`
  coupling: `objectscale` and `apex-hci` CONFIRMED present in
  `platforms.js` (grep-verified); permanent regression test added
  covering every discovery workload, not just those two. Both coupling
  tests added to `tests/unit-engine.js` per GAPS.md's drafted assertions.
  The three citation-log items (hci switch list, ai SN5610/SN4700 claim,
  solutions.js DFM talking points) and the E3224F-ON discovery caveat are
  left for the citation-verification pass / a future content round —
  out of scope for a mechanical rename.
- **Severity:** MEDIUM (rep-facing consistency + silent-failure coupling;
  no BOM math involved)
- **Where:** `js/catalog/discovery.js`, `js/catalog/solutions.js`,
  `tests/challenge-bestpractice.js`
- **What (three parts):**
  1. **Branding drift:** `solutions.js` rebranded to Dell Fabric Manager
     (DFM); `discovery.js` still says "Verity" in ~10 places (every
     competitor displacement angle, two pain-point messages, greenfield
     pitch). A rep pitches "Verity" in Discovery, then attaches "DFM" from
     Solutions in the same meeting — same product, two names.
     **Fix:** mechanical rename to DFM (or "Dell Fabric Manager (formerly
     Verity)" on first mention per section).
  2. **`fitsPains` coupling — VERIFIED INTACT today:** all four ids in
     solutions.js (`complexity`, `lockin`, `support`, `cost`) exist in
     `discovery.painPoints`. But zero test coverage means the next rename
     breaks it silently (the recommendation just stops surfacing).
  3. **`platformSeed` coupling — NOT yet verified:** discovery.js seeds
     reference `objectscale` and `apex-hci`; `poweredge-general`,
     `poweredge-ai`, `powerstore`, `powerscale` are confirmed present in
     platforms.js, but `objectscale`/`apex-hci` need a grep to confirm.
     If missing, the Discovery→BOM handoff for those workloads silently
     seeds nothing.
- **Test (covers 2 and 3 permanently, one assertion each):**
  ```js
  // Every solution's fitsPains ids exist in discovery.painPoints
  C.solutions.forEach(s => (s.fitsPains || []).forEach(p =>
    check(A, `solution ${s.id} pain '${p}' exists in discovery`, !!C.discovery.painPoints[p], 'GAP')));
  // Every discovery platformSeed exists in platforms
  Object.entries(C.discovery.workloads).forEach(([k, w]) =>
    check(A, `workload ${k} platformSeed '${w.platformSeed}' exists`, C.platforms.some(pl => pl.id === w.platformSeed), 'GAP'));
  ```
- **Citation-log rows needed (not code):** (a) hci workload's
  "Microsoft-approved switch list" claim — verify quoted switches against
  the actual current Azure Local validated list; (b) ai workload's
  "SN5610 / SN4700" recommendation — confirm it still matches what the
  engine's AI ladder actually picks (SN4700 may have drifted behind, same
  pattern as G-004's power table); (c) solutions.js DFM talking points
  ("no maintenance window" upgrades, EXEO/IREN production references,
  "full portfolio through Z9864F" — which already lags the Z9964F-topped
  catalog) — all rep-spoken claims sourced only to be-net.com marketing.
- **Minor:** edge workload recommendation names E3224F-ON with no caveat —
  the one switch with a documented "sounds good in discovery, hard-errors
  in validation" failure mode (no SONiC MC-LAG). Consider a
  "(non-redundant deployments)" qualifier.

### G-013 — pattern-level: ANY implied breakout ratio must route through `resolveUplinkBreakout()` — CLOSED 2026-07-15
- **Status:** CLOSED. Logged as its own entry (not folded into G-007)
  because this is a RECURRING BUG SHAPE, not a single site — future
  maintainers need the pattern documented, not just this round's fixes.
- **Severity:** HIGH (three confirmed live instances, each capable of
  either silently under-provisioning real hardware or mispricing/mis-
  warning a cable hop) — same underlying mistake, three separate places.
- **The shape:** anywhere code computes `Math.round(highSpeed / lowSpeed)`
  and treats a resulting 2×/4× as "breakout available" WITHOUT (a)
  checking `pickBreakout()` actually has a cataloged part for that exact
  (high, low) pair, and (b) respecting the `breakout:'none'` user toggle —
  it silently credits capacity or prices a cable that was never actually
  cataloged/buildable/permitted.
- **Three confirmed instances, all found by grepping every `pickBreakout(`
  call site after the first one was fixed (not by re-deriving each
  independently — the grep is what surfaced #2 and #3):**
  1. `js/engine.js` step 3, 3-tier trigger `spineEffRadix` (leaf↔spine
     hop) — an initial fix approximated this from the fabric's HOST NIC
     speed instead of its actual uplink speed (fine for AI's folded-Clos,
     wrong for general/storage — see G-007). Root-caused and fixed
     properly by consolidating onto the real per-fabric `uplinkSpeed`.
  2. `js/engine.js` step 4, the SAME leaf↔spine hop's real cabling — had
     its own inline `ratio`/`pickBreakout()` call, duplicating #1's logic.
  3. `js/engine.js` step 5, the pod-spine↔super-spine hop — a THIRD
     separate inline `ratio`/`pickBreakout()` call, found only via the
     grep audit. Already drifted in practice: it never checked
     `breakout !== 'none'` at all, so a customer who explicitly disabled
     breakout still got one priced on this specific hop.
- **Fix:** a single shared `resolveUplinkBreakout(spine, upSpeed,
  breakoutMode, nv)` helper (`js/engine.js`, defined immediately after
  `pickBreakout()`) is now the ONLY code that calls `pickBreakout()`. All
  three sites above call the helper instead. It validates the ratio
  against the real catalog AND the `breakout` toggle in one place, so the
  three call sites can no longer independently drift from each other.
- **Guard against recurrence:** `tests/unit-engine.js` has a static-source
  check asserting `pickBreakout(` appears as a call exactly ONCE in
  `js/engine.js` (inside `resolveUplinkBreakout()`'s own body) — any new
  code that calls `pickBreakout()` directly instead of going through the
  helper fails the suite immediately, not silently. **How to apply
  generally: whenever a fix introduces a shared helper to stop one class
  of drift, grep every existing call site of the thing it wraps (here,
  `pickBreakout(`) — the fix for instance #1 does not imply instances #2
  and #3 are also fixed, and a static-count guard is cheap insurance that
  a future direct call doesn't quietly reintroduce the same drift.**

---

### G-014 — `renderRack()` single-rack schematic has no rack-placement ground truth to verify against; large designs silently drop switch tiers — DOCUMENTED 2026-07-15, DEFERRED
- **Status:** Scoping note only, deliberately not fixed in this round (PR5
  of PROMPT-2). Related to but distinct from G-010 (which is specifically
  about the GB300 NVL72 RA published-path cable-length gap) — this is
  about the general `recommend()` pipeline's rack elevation view.
- **Severity:** LOW — cosmetic/schematic-completeness only, not a BOM or
  sizing defect. The BOM itself is correct; only the single-rack picture
  can be incomplete.
- **Where:** `js/ui.js`, `renderRack()` (single-rack path, used whenever
  `context.racks` is 1 or unset).
- **What it is NOT:** there is no per-switch-instance rack-placement data
  structure anywhere in `js/engine.js` — only `target.racksSpanned` (a
  count) and `fabric.perRack` (a boolean). `renderRackMulti()`'s "Rack 1
  of N (representative)" framing is intentionally schematic, not a
  literal placement plan, so there is no engine ground truth to diff the
  picture against. The PR5 5a audit's original phrasing ("verify it uses
  the engine's actual rack assignments") doesn't map onto real data —
  logging that here instead of chasing a fix for something that isn't
  modeled.
- **What it IS:** the single-rack schematic has a fixed 42U budget.
  Switches are now placed before host units (fixed this round — an
  explicit stable sort, see `js/ui.js` `renderRack()`), but on designs
  where switch tiers ALONE exceed 42U (e.g. an 84-leaf 3-tier Clos), the
  lower-priority switches (typically the spine/super-spine/OOB, pushed
  later in BOM order) still don't fit and are silently dropped — no
  "+N more switches" note exists (only "+N more host units" does).
  `renderRackMulti()` (used once `racks > 1` is explicitly set) does NOT
  have this gap — its per-group caps already emit explicit "+N more
  {model}" notes.
- **Confirmed instances:** `tests/harness/audit-renderer-parity.js`
  `KNOWN_GAPS` pins two archetypes exactly (general 3-tier wayBig-class:
  missing Z9432F-ON, S3248T-ON; AI 3-tier + super-spine: missing
  S5448F-ON, S5296F-ON, Z9964F-ON, Z9664F-ON, S3248T-ON) — any change to
  either set (fixed further or regressed) fails that test until the
  exception list is consciously updated.
  **Real fix** (future design pass, not a quick patch — same scope
  boundary as G-010's "real fix"): either (a) add a "+N more switches
  (see multi-rack view)" note mirroring the existing host-truncation
  note, or (b) route any design whose switch tiers alone exceed 42U
  through `renderRackMulti()`'s single-rack-equivalent framing (which
  already handles caps correctly) regardless of the `racks` input value.
  Log as a follow-up; do not attempt inside PR5.
- **Test:** `tests/harness/audit-renderer-parity.js` (permanent suite
  member) — hard-fails on any UNDOCUMENTED renderer/model gap across all
  8 archetypes × 3 renderers; the two known gaps above are the only
  allowed exceptions and must shrink to nothing before this entry can
  close.

---

### G-020 — CANONICAL BOM string-parsing compatibility shim (RESTRUCTURE-3 Phase 2) — OPEN, TEARDOWN TRACKED 2026-07-16
- **Status:** OPEN by design — this entry EXISTS to guarantee a temporary shim
  gets deleted, not fossilized. `js/design.js` `applyCanonicalBom()` (the
  canonical BOM derivation that killed backtest defects B1/B3/B5) regenerates
  the corrected Switch + `host|`/`uplink|` notes to REPRODUCE the exact
  substrings five consumers still scrape from note/item strings. Reproducing old
  string formats is a **compatibility shim, not a contract** — every consumer
  below must migrate to structured fields, and when the last one does, the
  substring-preservation code in `design.js` is DELETED (itself a tracked
  increment, "G-020 teardown").
- **Severity:** LOW — no BOM/sizing defect (quantities are engine-authoritative;
  the shim only preserves note text). The risk it tracks is *silent
  fossilization*: if these parsers are never migrated, the shim ossifies into a
  de-facto contract and the restructure's "structured, not scraped" goal is lost
  on the cable/switch lines.
- **Where the shim lives:** `js/design.js` — `repairSwitchLines()` (item
  suffixes `— Pod-spine` / `— Super-spine` / `— Border-leaf`; note enum
  `N/fabric × M`), `repairCableLines()` (host note `Host-to-leaf … {network}` +
  `N link(s)`; uplink note `Leaf-to-spine … {network}` + `N/leaf × M`;
  copper-scrub keeping the placement tail).

- **Register — each parser, the substring it depends on, its migration slice:**

  | Consumer | Reads | Substring the shim preserves | Migrates in |
  |---|---|---|---|
  | `js/ui.js` `oooText()` (~L1319) | `b.item` | `— Border-leaf` / `— Super-spine` / `— Pod-spine` role suffixes | Renderers slice — read `device.role` from `buildDeviceList` instead of scraping item text |
  | `js/ui.js` `oooText()` (~L1306) | `res.fabrics` role map | (fabric-derived, not a BOM string) — but the cross-role split relies on it not re-merging | Renderers slice — group by canonical `(model, role)` |
  | `tests/harness/audit-boms.js` (L37/46/54) | `b.note` | `Host-to-leaf` / `Leaf-to-spine` / `BREAKOUT` + `{network}` in note | Validators slice — assert against `buildCableList` records (role + network fields) |
  | `tests/harness/audit-groundtruth.js` (L52/53/56/58) | `b.note` | `Dual-plane GPU` / `Converged` / `GPU compute uplinks` / `CPU fabric uplinks` (leaf notes — preserved verbatim, NOT regenerated) | Validators slice |
  | `tests/harness/audit-independent.js` (L207/227/240/273/297/332) | `b.item` / `b.note` | `Pod-spine` / `Super-spine` / `pod-spine ↔ super-spine` / `host` + `25G` / `SFP-1G-T` absence | Validators slice — assert against canonical device/cable records |
  | `js/validate.js` (indirect) | fabric records, not BOM strings | (no BOM-string dependency found this pass — listed for completeness; re-audit at the validators slice) | Validators slice |
  | `tests/invariants.js` inv. 2/3 | `b.note` | `N/fabric × M`, `N link(s)`, `N/leaf × M` (TEMPORARY per Amendment 7) | Deleted when the note-parsing invariants are rewritten against structured fields |

- **Teardown increment (G-020 teardown):** after the renderers slice (oooText +
  audit-boms/independent onto `buildDeviceList`/`buildCableList` records) and the
  validators slice (validate.js + audit-groundtruth onto structured fields), the
  note/item substring reproduction in `design.js` and the TEMPORARY string-parse
  in `tests/invariants.js` are removed together, and this entry closes. Until
  then, `applyCanonicalBom()` MUST keep emitting the substrings above — dropping
  one silently regresses a consumer.
- **Test:** `tests/invariants.js` (B1/B3/B5 hard guards + note-enumeration) and
  `tests/unit-design.js` (cable-layer faithful/corrective anchor) both fail loud
  if the derivation stops matching the engine or stops enumerating its own qty;
  the full suite (audit-boms/groundtruth/independent, renderer-parity, test-dom)
  guards every scraped substring because all now load `js/design.js`.

---

### G-021 — rack RENDERER still draws a dedicated "SPINE RACK" frame, inconsistent with the B6 BOM rule — OPEN 2026-07-16
- **Status:** OPEN, scoped to the renderers-consumer slice (RESTRUCTURE-3 Phase 2). The B6
  BOM fix (2026-07-16) makes OOB = declared racks and houses spines WITHIN declared racks
  (SPEC.md §Multi-rack; DESIGN-LOG). But `renderRackMulti()` (js/ui.js) still draws a separate
  "SPINE RACK" frame for multi-rack designs — so the PICTURE shows N+1 racks while the BOM
  quotes N racks' worth of hardware. `tests/harness/test-dom.js` still asserts the SPINE RACK
  frame exists (line ~166), pinning the current renderer behavior.
- **Severity:** LOW — the BOM (what's quoted) is correct; only the rack diagram is inconsistent
  with the declared-racks rule. No wrong hardware ships.
- **Real fix:** when the renderers migrate onto the canonical device layer (js/design.js
  `buildDeviceList`, which houses spines within declared racks by role — no spine-rack concept),
  drop the dedicated SPINE-RACK frame and place spine devices in a declared rack. Update the
  test-dom assertion at that time. Tracked alongside the oooText/audit renderer migration in
  G-020's register.

### G-022 — cross-network merged switch lines masked which network each unit belonged to — CLOSED 2026-07-17 (R11)
- **Status:** CLOSED. Confirmed live and fixed. Priority case (maintainer-named): PowerScale
  frontend + backend leaves happen to land on the same model (S5232F-ON) — a legitimate,
  intentional merge per DERIVATIONS §1 (switch lines group by `(model, role)`, deliberately NOT
  including network). But the note only ever described whichever fabric's `addLine` call ran
  first: `"Leaf/ToR — ... frontend (100GbE); 1/fabric × 4"` for a line whose qty of 4 was
  actually 2 frontend + 2 backend. The second contributor's note got silently swallowed behind
  `'; +more'`. A rep reading the BOM saw one homogeneous 4-switch frontend pool — **the h16346
  requirement that PowerScale's backend be a dedicated, physically-separate network was invisible
  on the line that priced the hardware.** Confirmed as a general (non-PowerScale-specific) defect
  too: general + storage targets whose leaf ladders both resolve to S5248F-ON merge the same way.
- **Severity:** MEDIUM — no wrong hardware ships (qty was always correct, only the note lied
  about composition), but a rep can't tell a customer "your backend is isolated per Dell's
  requirement" from a BOM line that reads as one undifferentiated frontend pool. On a scale-driven
  or compliance-sensitive quote (backend isolation is a hard requirement, not a preference) that's
  a real gap between what shipped and what the BOM claims.
- **Where:** `js/engine.js`, `addLine()` (the switch-line merge path) + the leaf switch-line
  `addLine` call in the per-fabric BOM loop (`specs.forEach`).
- **Fix:** `addLine` now accepts an optional `line.network` (+ `line.dedicated` for the
  h16346-class case). On a SECOND contribution to an already-existing switch line, if the
  incoming line declares a network, the note is **regenerated from structured per-network data**
  (never string-mutated) as `"N total — X× network1, Y× network2 (dedicated, physically
  separate)"` — matching DERIVATIONS §1's own worked example. A single-network line (the common
  case, no merge) is untouched — same detailed note as before. Lines that never declare a network
  (cable/edge/RA switch lines, which already use distinct per-network `mergeKey`s and never reach
  this path) keep the old `'; +more'` fallback unchanged.
- **Test:** `tests/unit-engine.js`, "R11" block — PowerScale case (breakdown correct, backend
  flagged dedicated, frontend not, arithmetic sums to qty, no more `'+more'`), general+storage
  case (same, no dedicated flag since neither network is backend-independent), and a regression
  guard that the single-network case keeps its original detailed note untouched. **Verified as a
  real guard:** `git stash`-ing just the `addLine` fix turned 6 assertions red; restoring it
  returns to 294/294. Not vacuous.
- **Design note carried into the fix:** `dedicated` reads off `fs.target.platform.backendIndependent`
  (currently PowerScale-only) rather than hardcoding "h16346" into generated text — the citation
  lives in CITATION-LOG/SPEC, not burned into a BOM note, so a future non-PowerScale
  backend-independent platform gets the same generic "(dedicated, physically separate)" phrasing
  without a wrong doc code attached. This matches the existing house style at the dedicated-spine
  note (`engine.js` ~line 1343: "kept physically separate").

---

## PROCESS GAPS (carried over from the pre-code-review pass — still open)

### G-P01 — Citation staleness (PNs, table/page refs)
- **Severity:** HIGH — see `CITATION-LOG.md`. Confirmed still relevant now
  that real PNs are visible in `optics.js` (many `dellPN: 'verify'`
  placeholders alongside a smaller set of `APD_SRC`-tagged "verified
  2026-07-10" SKUs) — the two-tier accuracy model (specConfirmed vs.
  verify) is well-designed, but the re-verification CADENCE for the
  APD_SRC-tagged rows still needs a process, not just a one-time pull.

### G-P02 — FDC-vs-H18364 divergence not surfaced to the end user
- **Severity:** MEDIUM — unchanged from prior pass; not yet addressed in
  code reviewed so far.

### G-P03 — Combinatorial coverage across ladders — CLOSED 2026-07-15
- **Status:** CLOSED. Stale premise — `tests/harness/audit-fuzz.js` IS the
  combinatorial test file this entry said didn't exist. It seeds a
  deterministic RNG (reproducible: same `FUZZ_SEED` always regenerates
  the same run, failures print a ready-to-paste repro input) and sweeps
  the FULL input surface — random NICs, targets, platforms, redundancy,
  breakout mode, traffic profile — across `recommend()`, `recommendEdge()`,
  and `recommendRefresh()`, checked against `tests/harness/lib/
  feasibility.js`'s independently-derived formulas (not the engine's own
  math mirrored back at itself). Default 6,000 designs/run; this
  engagement's rounds have run 126,000+ cumulative fuzz designs clean.
  This genuinely answers "combinatorial coverage across ladders" — the
  entry just predates whoever wrote it having seen this file. Reconciled
  now (PR7, PROMPT-2).

---

## CLOSED
(unchanged from prior draft — G-000 100G spine rung, G-004-old AI spine
port-math, G-005-old E3224F-ON — renumber on merge to avoid collision with
the new G-004/G-005 above)

---

## Priority order (updated after reviewing reference-architectures.js) — HISTORICAL, all items resolved 2026-07-15
0. ~~**G-007**~~, ~~**G-002**~~, ~~**G-003**~~ — CLOSED 2026-07-15 (PR1).
1. ~~**G-010**~~ — stop-gap CLOSED 2026-07-15 (PR2); the full rack-placement
   redesign remains its own tracked follow-up (see entry above).
3. ~~**G-009**~~ — CLOSED 2026-07-15 (PR2).
6. ~~**G-008**~~ — CLOSED 2026-07-15 (PR1/reconciled PR7).
7. ~~**G-001**~~ — CLOSED 2026-07-15 (PR4).
8. ~~**G-004**, **G-005**~~ — CLOSED 2026-07-15 (PR4). ~~**G-011**~~ —
   CLOSED 2026-07-15 (closeout PR, following the PR5-7 reconciliation
   that flagged it as the last confirmed-live bug). ~~**G-006**~~ —
   CLOSED 2026-07-17: the source documents (H18548.9.2 + H19120) landed in
   the corpus-intake pass, confirmed the 2× under-count, and the fix +
   regression test landed with them.

## Still needed to go further — RESOLVED 2026-07-15
Both items below were the two open threads this section flagged; both are
now closed out:
- ~~Draw.io / topology rendering code~~ — this WAS the PR5 audit (PROMPT-2):
  all three visual consumers of `result.fabrics` (`renderTopology`,
  `renderRack`/`renderRackMulti`, `buildDrawioXml`) reviewed, gaps found
  and fixed (see the PR5 entries above and `docs/DESIGN-LOG.md`), a
  permanent parity guard added (`tests/harness/audit-renderer-parity.js`).
- ~~`catalog/discovery.js` and `catalog/solutions.js` coverage~~ — done as
  G-012 (branding drift + `fitsPains`/`platformSeed` coupling review,
  CLOSED 2026-07-15).
