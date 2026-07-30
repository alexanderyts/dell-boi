# CLAUDE.md — Dell Boi

## What this is
A networking BOM sales tool. The maintainer is a sales rep, not an
engineer. Success criterion for all work: "input the deal info I'm
given, get a BOM that's safe to quote." Reliability over features.

## Current initiative
Structural redesign per docs/RESTRUCTURE-3.md (the plan of record).
**Phase 2 (engine/UI on the canonical layer) — in progress.** The three Phase 0
contracts are approved and landed; Phase 1 invariants + golden fixtures are live;
the backtest defect meter (B1–B7) is at ZERO (all hard guards).

### State at end of session 2026-07-30
- **Version 0.66.5** (`js/version.js` = the single source of truth; `package.json`
  tracks it). CHANGELOG.md has the 0.65.1–0.66.5 entries.
- **Suite: 19/19 green, xfail 0.** Nothing is red. Nothing is skipped.
- **IN PROGRESS: nothing.** No half-built fix, no partial refactor.
- **2026-07-30 (v0.66.5, GAPS G-031) — the shipped build was silently dead in real browsers.**
  Every `.js` source file has CRLF line endings (default Windows git checkout); the CSP
  script-hash `tools/build-single.js` computes for each embedded `<script>` was hashed from the
  raw (CRLF) bytes, but browsers normalize CRLF→LF before computing that hash themselves per the
  HTML5 spec — so the hash never matched and every inline script was silently CSP-blocked. Page
  rendered, nothing was interactive. Invisible to the test suite because jsdom doesn't enforce
  CSP `<meta>` tags at all — found by opening the actual built file in a real browser
  (Playwright + Chromium) when the maintainer reported a fresh rebuild "doesn't work." Likely
  affects any prior Windows-built bundle, **including the already-published claude.ai artifact
  link** — republish it. Fixed: normalize line endings before hashing. New regression test in
  `tests/unit-build.js` replicates the browser's normalization without needing a real browser;
  stash-verified (5 of 15 blocks mismatched on the old tool). DESIGN-LOG 2026-07-30, GAPS G-031.
- **This session (2026-07-23), after R14 closed — two `/improve-codebase-architecture` candidates
  implemented, each grilled via `/grill-with-docs` first:**
  - **v0.66.3 (GAPS G-029):** switch BOM-line note assembly (leaf/pod-spine/super-spine/
    border-leaf) had TWO hand-coded paths for the same text — one at line creation, one in
    `addLine()`'s merge branch — the exact structural cause behind G-022 and G-027 (same bug,
    twice). Hardened into one function (`switchLineNote`, in `js/engine.js`, exposed via
    `window._engineHelpers` matching the `switchNosNote`/`dfmStatus` precedent), called on every
    fact-change rather than patched at each of the two known instances. Auditing the 4 call sites
    found a live (if never reported) instance of the same class of gap on POD-SPINE lines
    specifically — only the leaf site had ever passed `network`/`dedicated` to `addLine`, so a
    spine merge across two networks landing on the same model silently lost its breakdown. Closed
    as part of the same change. Stash-verified two ways. DESIGN-LOG 2026-07-23e, GAPS G-029.
  - **v0.66.4 (GAPS G-030):** "is this switch DFM-manageable" was hand-typed 3 ways
    (`engine.js`'s `dfmStatus()`, `validate.js` check #14, `ui.js`'s `dfmStats()`), and the
    DFM-attach body (`addVerity()`) was pasted character-for-character into `wizard.js` and
    `app.js`. Consolidated to `isDellSonicCapable(sw)` + `attachDfm(res)`, both in `engine.js`,
    exposed on `window`; `wizard.js` keeps a thin delegate under the old name so
    `window.Wizard._test.addVerity` and `selftest.js` needed zero changes. Pure refactor —
    verified byte-identical output (19/19 suite, 320/320 unit-engine), stash-verified.
    DESIGN-LOG 2026-07-23f, GAPS G-030.
  - Architecture candidates C (one input-mapping table for the wizard vs. the Expert Form,
    rated Strong), D (switch-catalog capability shape — inline fields vs. a separate CAP map,
    rated Worth exploring), and E (naming `recommend()`'s internal seams, Worth exploring) remain
    unexplored. The original HTML report was a temp file, not saved in the repo.
- **BLOCKED ON MAINTAINER: nothing.** G-026 (E3224F-ON's fiber-edge branch also
  catches `poe==='none'`) is flagged for the maintainer, not blocking. **G-024**
  (railNicCage per-target) remains intentionally OPEN — feature-gated.
- **This session — R14 CLOSED, all 4 slices shipped (v0.65.5 → v0.66.2).**
  `/grill-with-docs` run against `docs/R14-WORKORDER.md` (a prior session's design-only
  work order) found its central premise false — the code already stated NVIDIA
  Spectrum runs Cumulus, not Dell Enterprise SONiC, and the work order's proposed
  `nvidiaNos` input would have overturned that tested, corpus-backed ruling without
  noticing it existed. Replanned as 4 slices, all landed: **the DCI long-reach engine
  defect** (v0.65.5, GAPS G-025) · **OS10 dropped portfolio-wide + per-switch NOS
  statements + NVIDIA's "SONiC" corrected to name Pure SONiC** (v0.66.0, GAPS G-027 —
  an `addLine()` merge bug found mid-slice) · **the DFM attach gate wired into all six
  entry points** (v0.66.1, GAPS G-028 — a vendor-blanket DFM-scoping bug found in
  THREE independent places, third being `ui.js`'s pitch card) · **the two near-duplicate
  "how far is the core?" wizard questions merged into one** (v0.66.2). Full reasoning
  for all four: DESIGN-LOG 2026-07-23 / 23b / 23c / 23d. Every slice was
  stash-verified (revert the fix alone, confirm the right assertions go red) before
  being trusted. Two real defects and a three-times-repeated bug pattern were found
  along the way that were never in the original work order — none of it would have
  surfaced from implementing that work order verbatim, which is why it was grilled
  first.

### G-023 / R16 closed 2026-07-17 — a fixed engine defect is still open if no UI reaches it
B7 (2026-07-16) made `recommendRefresh`'s `includeCoreUplink` actually price the uplink
cabling — but nothing in the refresh wizard ever SET it. Choosing "keep the existing
core" promised "uplink to what is there" and priced nothing. Fixed: three questions
(`core`/`coreVendor`/`coreReach`) reusing the main path's J2/J3 machinery verbatim,
shown only when `distribution === 'existing'` (matching the engine's own gate).
Deliberately did NOT add `coreFarModel`/`coreFarPort` — `recommendRefresh` never reads
them (confirmed by reading the function, not assumed). Regression-verified: stashing
the wizard fix alone turned 4 test-dom assertions red.

### R16 sweep triage — 5 rulings, all landed 2026-07-17 (same-day follow-up)
1. **`coreType`** — ADDED a guided-wizard question (conditional on a core uplink
   existing): "Is the core in the same building, or a longer run...?" → `'dci'`.
   **Flagged, not smoothed:** the wording closely echoes the pre-existing `coreReach`
   question — genuinely distinct engine effects (reach vs uplink class/speed floor),
   but a rep now sees two similar-sounding reach questions back to back. Implemented
   exactly as specified; noted for a possible future wording consolidation.
2/3. **Guided wizard's + Discovery's edge branches** — ruled DISCLOSE not ASK. Added
   an `assume()` line (Express's existing pattern): "Edge sized with defaults: 1G
   PoE+ access, 100G uplinks, new redundant distribution pair — use the Edge Form for
   full control." **Corrected, not applied verbatim:** the maintainer's proposed text
   said "10G uplinks" — read against `recommendEdge`'s code, the actual hardcoded
   default is the 100G rear-pair path (10G is the alternate `edgeUplink:'sfp'` class,
   never set by these branches). Fixed to say 100G so the disclosure is true, per
   standing rule 3.
4. **Discovery's missing core question** — documented as INTENTIONAL in SPEC.md's
   "Inter-network connectivity" rule, one sentence, so a future sweep reads it as a
   decision.
5. **Per-target `railNicCage`** — tracked as new **G-024** (a missing engine
   capability, not a missing UI control — different class from 1–4, kept separate).
   Interim: the engine now warns when 2+ AI targets exist, naming the count and
   telling the rep to verify the rail splitter per target. **Feature-gated: no
   plumbing until a real design has 2+ AI targets with different rail NICs.**
All five regression-verified with stash-and-restore before being trusted. Full
reasoning: DESIGN-LOG 2026-07-17d, GAPS G-023/G-024.

### G-022 / R11 closed 2026-07-17 — a merged BOM line must say what it merged
`addLine()` merged same-model switch lines across networks by design (DERIVATIONS §1),
but its only response to a second contributor was `'; +more'` — exactly the seam §1 names
retired. Priority case: PowerScale frontend+backend leaves often land on the same model;
the merged note described only whichever fabric ran first, so the h16346-mandated
backend isolation was invisible on the BOM line. Confirmed general (not PowerScale-only):
any two networks whose leaf ladder matches hit the same defect. Fix: `addLine` now
regenerates the note from structured `{network, qty, dedicated}` data on every merge —
"4 total — 2× frontend, 2× backend (dedicated, physically separate)" — while a
single-network line (the common case) is untouched. Regression-verified: stashing the
fix alone turned 6 assertions red. See DESIGN-LOG 2026-07-17b, GAPS G-022.

### G-006 closed 2026-07-17 — and the standing lesson from it
`platforms.js` mx7000 declared 4 external uplinks/chassis while its own `portOptions`
prose said "4× per FSE (2 FSEs/chassis)" = 8. The count was the wrong half, so every
MX7000 quote carried **half its uplink optics**. Now 8, with a regression block in
`unit-engine.js` verified to actually catch the defect (not vacuous).
**Why it sat open two sessions:** the closure standard was "check the MX9116n spec
sheet" — a document that appears **not to exist**. Revised standard (maintainer ruling):
*two independent official Dell docs agreeing verbatim = authoritative*. H18548.9.2
(June 2026) + H19120 (March 2022) agree exactly. **Do not reopen the spec-sheet hunt** —
CITATION-LOG and GAPS both carry that note. Generalizable: *a gap blocked on evidence
needs a periodic check that the evidence can exist at all; an unmeetable standard is a
permanent hold protecting a known-wrong value.* See DESIGN-LOG 2026-07-17.
**Caveat live in the BOM:** the 2 unified ports/FSE are Ethernet OR FC — an FC-attached
chassis flexes 8 → 4. Stated in the platform note + a rep-facing concern.

### Rulings landed this session (one line each)
All are in SPEC.md as current-state rules; reasoning is in DESIGN-LOG 2026-07-16d.
1. **PowerStore = MC-LAG + ICL, FINAL** — engine was right, the 16b hand-read was
   wrong; now CORPUS-BACKED (H18157.11) and verified verbatim. Fixture #5 closed.
2. **A quoted link must physically fit, not just speed-match** — cage table in
   `CATALOG.formFactor` (vendor fact, cited), read by engine AND validate #23;
   impossible = hard error. Found 4 defect classes (2 from the backtest, 2 new).
3. **Published RAs cable per their OWN cited document**; general cabling rulings
   bind the COMPUTED path only; a conflict between them is a **stop-and-ask**.
4. **No phantom credit** — 400G is the host/rail speed; inter-switch hops between
   same-cage switches run NATIVE port speed; a breakout counts only when a
   cataloged part with the correct FAR END exists.
5. **Super-spine ladder is part-evidence-gated** — a candidate qualifies only if it
   can TERMINATE the pod-spine's uplink speed; else step to same-speed and widen by
   port math, with an info line explaining the pass-over as a PARTS decision.
   (Flagship is GATED, not banned. G-001 amended: its closure was phantom-backed.)
6. **Far-end-only part choices are ASKED, not guessed** (derive-then-ask) —
   `railNicCage` picks MCP7Y00 vs MCP7Y10; "not sure" quotes one variant
   verify-flagged rather than blocking. Wizard question live (conditional reveal).
7. **1 splitter = 2 rails** — quantity, printed note arithmetic, and every
   BOM-integrity invariant read `linksPerAssembly` off the line, so units can't
   disagree. `design.js` now consumes `f.hostCableId` instead of re-deriving it.
8. **S56DD-100G SR1.2/FR/LR added; the S56DD DAC is deliberately HELD** — a passive
   DAC can't convert encoding (50G-PAM4 → 25G-NRZ), so S5448F in-rack hosts quote
   optics: pricier, known-buildable.
9. **Core uplink @400G off a 100G-port switch = hard error naming BOTH remedies**
   (turn on border-leaf / drop to 100GbE). Never silently changes the ask.
10. **800G pod-spine tiers take a SAME-SPEED super-spine** (Z9864F-ON ↔ Z9864F-ON,
    DAC-O112-800G cataloged, 64 native ports). The 520-case resolves to 48
    super-spines (3072 ÷ 64) with every link real. This is ruling #5 above applied
    to its first concrete case.
11. **Repo: git init, option 3 — track `corpus/`, ignore the root PDFs.** The
    harvested corpus (raw + txt, ~55 MB) IS version-controlled because it backs the
    CITATION-LOG rows — a citation must be re-verifiable from a clone alone. The
    ~199 MB of loose root PDFs are ignored (`/*.pdf`, root-anchored so it can't
    reach `corpus/raw/`); nothing at runtime or in the suite reads them and
    `docs/sources.csv` records their provenance.

### Sizing changes to expect (AI fabrics) — honest re-derivation, already shown
- 1024-rail Dell AI: **still 8 spines** (ratified number survived; now derived from
  16 leaves × 32 uplinks @800G ÷ 64 native ports, not a phantom 128-port radix).
- 520 servers / 4160 rails: flat 2-tier → **3 pods + 48× Z9864F-ON super-spine**
  (3072 links ÷ 64 ports), 0 hard errors. Off by ONE leaf — 512 still fits flat.
  Same uplink bandwidth either way; the phantom bought no capacity.

### QUEUE FOR NEXT SESSION — in priority order
> **NOTE for a fresh session — this note has now been right eight times; trust it.**
> The **R12 tail**, **corpus intake**, **G-006**, **R11/G-022**, **R16/G-023**, the **R16
> sweep triage** (all 5 rulings), and **R14 — ALL FOUR SLICES** (v0.65.5 → v0.66.0 → v0.66.1 →
> v0.66.2) are all **DONE** as of 2026-07-23 (verified with stash-based regression checks
> throughout — see DESIGN-LOG 2026-07-17d / 2026-07-23 / 2026-07-23b / 2026-07-23c / 2026-07-23d,
> GAPS G-023/G-024/G-025/G-027/G-028). `docs/R14-WORKORDER.md` is fully superseded and closed —
> do not reopen or re-implement any part of it. If you are handed a queue listing any of the
> above as outstanding, that queue is stale — **verify against the suite before doing the
> work.** Nothing is blocked on the maintainer. Start at (1) = R15.

1. **R15** (pending maintainer check) — PowerScale F710 carried 2× dual-port FE NICs
   the maintainer doesn't think were selected. Determine seed-default vs wizard; if
   seed, fix + make NIC defaults visible + platform-seed invariant + F710
   CITATION-LOG row. Non-blocking.
2. **R13** — NVIDIA leaf ladder has no 25G rung (8× 25G on an SN4700, 32× 400G).
   R12 CORROBORATED this: the form-factor check flags SFP28 optics into the SN4700's
   QSFP-DD ports as needing QSA28 adapters that aren't quoted. Evaluate an
   SN2410-class 25G leaf; at minimum an R9-style low-util note.
3. **Mode items** — PowerScale severity (backend "non-blocking not met" should be
   ERROR not WARN per h16346; verify which fabric trips it, may clear with R15);
   refresh cabling-compat question; new-OOB-into-existing-env (apply the R3 pattern);
   edge headroom note + access-ICL self-contradiction + the S5200-vs-S4348F
   distribution BUSINESS-RULE (log with the VENDOR-FACT vs BUSINESS-RULE distinction).
4. **G-024 (railNicCage per-target)** — do NOT pick up speculatively. Feature-gated:
   only when a real design has 2+ AI targets with genuinely different rail NICs.
5. **G-026 (E3224F-ON's `poe==='none'` fiber-edge routing)** — flagged for the
   maintainer 2026-07-23, not yet confirmed. Check with the maintainer before
   touching `js/engine.js`'s edge access-switch picker.
6. **Then** resume the renderers slice (G-021 rack renderer) → validators →
   G-020 teardown.
Backtest queue detail: docs/backtests/BACKTEST-2026-07-16c.md.

### OPEN citation TASKS (non-blocking; re-rule triggers)
In CITATION-LOG → "Optic ↔ port form factor". **H20082 is now IN corpus** (`AI-OVERVIEW`,
reviewed 2026-07-17) — it CONFIRMED the XE9680 400G-rail and Z9864F 128-GPU rows (both
flipped CURRENT) and **did not contradict anything**. What it did *not* do is settle these:
- **800G-native inter-switch rule** — H20082 shows the Rail Optimized topology and GPU
  reachability tables but **never states switch↔switch link speed**. No contradiction, no
  confirmation. Next target: the **Dell Validated Designs (DVDs) / Dell Reference Designs
  (DRDs)** that H20082 Ch.1 names as the detailed-configuration reference. Still a re-rule
  trigger if a DVD/DRD sizes 800G 3-tier differently.
- **1.6T→2×800G OSFP-far-end part** — not in `OPTICS.txt`; H20082 doesn't mention the
  Z9964F-ON at all (it covers only Z9864F / Z9664F-ON / Z9432F-ON). If a real part turns up,
  catalog it with verification and the Z9964F-ON re-enters the super-spine ladder automatically.
- **DAC-S56DD-Q56 far-end per NIC** — verify 50G-PAM4/QSFP56-capable NICs only,
  against the optics spec sheet + NIC datasheets, before enabling it per-NIC.

## Key documents
- docs/RESTRUCTURE-3.md — the active plan. Read it fully before working.
- docs/contracts/ — Phase 0 deliverables, APPROVED 2026-07-16 with
  amendments (all landed). Phase 1 (invariants + fixtures) may proceed;
  engine/UI implementation waits for Phase 2:
  - INPUT-SCHEMA.md (a) — every input field + what it changes.
  - CANONICAL-DESIGN.md (b) — the devices/ports/links/cables schema
    and why each backtest bug becomes unrepresentable.
  - DERIVATIONS.md (c) — how BOM / renderers / validators read it.
- docs/backtests/BACKTEST-2026-07-15.md — ground-truth backtest record:
  3 real runs, defects B1–B6, corrected expected BOMs for Phase 1
  fixtures. J1–J3 signed off 2026-07-16; J2/J3 each add a required
  input now specified in INPUT-SCHEMA.md §1.4.
- docs/SPEC.md — current-state design rules (no dates).
- docs/DESIGN-LOG.md — dated reasoning for rule changes.
- docs/GAPS.md — tracked gaps with status/severity/tests.
- docs/CITATION-LOG.md — verification dates for factual claims (PNs,
  specs). Rows past recheck are not trusted.

## Standing rules
1. Tests land in the same commit as the change they protect.
2. Stop and show the maintainer on any CONFLICT in the suites.
3. Flag conflicts with the plan explicitly — never silently match a
   plan that contradicts what the code shows (precedent: G-011).
4. Explain findings in plain language; the maintainer is not an
   engineer. Lead with what it means for quote accuracy.
5. Out of scope, permanently (see RESTRUCTURE-3): multi-vendor support,
   JSON APIs, Visio export, trace/logging infrastructure,
   mutation/metamorphic testing, architecture-review ceremony.
6. Every session close-out ends with commit AND push to `origin`. A commit
   that only exists on this machine is not a backup — `corpus/` alone is
   ~250 MB of harvested citations that would have to be re-pulled by hand.
   Push even when the session's work is docs-only or partial; an unpushed
   WIP commit is still worth more than a lost one.
7. **Recommend the model BEFORE starting the work, not in the postmortem.**
   Read the session's ask, judge whether it needs the current model, and say
   so in one line before the first tool call. The maintainer pays for this;
   the call is theirs, but the recommendation is mine to volunteer unasked.
   - **Sonnet work** (the default for this repo): corpus intake, PDF text
     extraction, manifest/doc/CITATION-LOG edits, mechanical refactors,
     running suites, commit/push, renumbering, chasing a known fix.
   - **Opus work:** design rulings, contradiction analysis (is this doc
     really disagreeing?), backtest defect hunting, anything where a wrong
     call silently ships an unbuildable BOM.
   - **Mixed session:** name the split up front — "intake on Sonnet, switch
     before the ruling" — rather than running the whole thing hot.
   Precedent 2026-07-17: an entire corpus intake plus a one-field fix ran on
   Opus and burned most of a usage window on work Sonnet does identically.
   Cost discipline is part of reliability here: a session that runs out of
   budget mid-fix leaves the tree in exactly the state this file exists to
   prevent.

## Test suites
Run the full harness before and after changes. All suites are hard-fail.
Renderer parity, call-site guards, and structural 3-tier assertions
carry forward through the restructure unchanged.
