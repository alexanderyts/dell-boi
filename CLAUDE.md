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

### State at end of session 2026-07-23
- **Version 0.66.1** (`js/version.js` = the single source of truth; `package.json`
  tracks it). CHANGELOG.md has the 0.65.1–0.66.1 entries.
- **Suite: 19/19 green, xfail 0.** Nothing is red. Nothing is skipped.
- **IN PROGRESS: nothing.** No half-built fix, no partial refactor. Slices 1–3 of the
  R14 replan (below) shipped clean; Slice 4 is fully specified but not started.
- **BLOCKED ON MAINTAINER: nothing.** G-026 (E3224F-ON's fiber-edge branch also
  catches `poe==='none'`) is flagged for the maintainer, not blocking. **G-024**
  (railNicCage per-target) remains intentionally OPEN — feature-gated.
- **This session — R14 grilled, not implemented as written:** `/grill-with-docs` run
  against `docs/R14-WORKORDER.md` (a prior session's design-only work order) found its
  central premise false — the code already states NVIDIA Spectrum runs Cumulus, not
  Dell Enterprise SONiC (ruling v0.29.0), and the work order's proposed `nvidiaNos`
  input would have overturned that tested, corpus-backed ruling without noticing it
  existed. Full replan (superseding `docs/R14-WORKORDER.md` §MECHANICAL) shipped as
  4 slices. **Slice 1 (v0.65.5):** an independent, unrelated defect found while
  verifying the plan — `engine.js:1603`'s DCI-forces-long-reach clause has never
  actually forced long reach (dead condition since introduction); fixed +
  regression-tested; stash-verify caught a false-positive test on the first attempt
  (DESIGN-LOG 2026-07-23, GAPS G-025). **Slice 2 (v0.66.0):** OS10 dropped
  portfolio-wide as a quotable NOS choice (maintainer: "OS10 shouldn't be quoted,
  it's end of sale") — wizard question + Expert Form select both removed, `engine.js`'s
  `nos` pinned `'sonic'` unconditionally; every switch BOM line now states its NOS
  from a new structured catalog fact (`nosSupported`/`dfmVerify`); NVIDIA Spectrum's
  mislabeled "SONiC" corrected to name NVIDIA's own community **Pure SONiC**, distinct
  from Dell's; E3224F-ON's edge line was found independently wrong (claimed "Dell
  Enterprise SONiC" with no path to it — now discloses OS10/EOS). A real bug found +
  fixed mid-slice: the NOS statement was silently dropped by `addLine()`'s
  merge-regeneration whenever two networks shared a switch model — the SAME bug class
  as G-022, second occurrence (GAPS G-027). **Slice 3 (v0.66.1, this session): the DFM
  gate.** `window.dfmStatus(res)` — one shared predicate reading the ACTUAL switches on
  the finished BOM — wired into all SIX `addVerity` sites (the work order named three;
  the Expert Form's, inside `DesignIO.run()`, was the missed one). An all-Cumulus/
  Pure-SONiC design no longer gets DFM at all (info line + NetQ/NVUE pointer instead);
  a design backed only by SN5600/SN5610/SN2201 still gets DFM, verify-flagged. **A
  THIRD independent occurrence of the same vendor-blanket bug** was found and fixed in
  the same pass: `ui.js`'s BOM-tab DFM value card miscounted Dell-vs-NVIDIA switches
  the same way `validate.js` used to — would have told a rep "DFM doesn't cover this
  switch" directly under a BOM line saying it does. Stash-verified in two steps
  (engine.js alone, then wizard.js+app.js alone) — both correctly broke the tests that
  depend on them. **Slice 4 (the wizard core-distance question merge) is queued next,
  unstarted** — see QUEUE below.

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
> **NOTE for a fresh session — this note has now been right seven times; trust it.**
> The **R12 tail**, **corpus intake**, **G-006**, **R11/G-022**, **R16/G-023**, the **R16
> sweep triage** (all 5 rulings), **R14 Slice 1** (the DCI long-reach defect, v0.65.5), **R14
> Slice 2** (the NOS model + OS10 drop, v0.66.0), and now **R14 Slice 3** (the DFM gate, v0.66.1)
> are all **DONE** as of 2026-07-23 (verified with stash-based regression checks throughout —
> see DESIGN-LOG 2026-07-17d / 2026-07-23 / 2026-07-23b / 2026-07-23c, GAPS
> G-023/G-024/G-025/G-027). If you are handed a queue listing any of those as outstanding, that
> queue is stale — **verify against the suite before doing the work.** Nothing is blocked on the
> maintainer. Start at (1) = R14 Slice 4 — the last slice of this initiative.

1. **R14 Slice 4 (v0.66.2): the wizard core-distance question merge** — the last slice
   of the R14 replan (`docs/R14-WORKORDER.md` §MECHANICAL D4, now safe to implement
   since Slice 1 already fixed the underlying engine defect: `coreType:'dci'`
   genuinely forces long reach now, so merging the two wizard questions can't
   reintroduce that bug). Replace `wizard.js`'s separate `coreReach`/`coreType`
   questions in the guided main path with one 3-way "how far is the core?" question
   (see `docs/R14-WORKORDER.md` M4 for the exact wording/mapping — still valid, D4
   itself was never in question, only the engine fix it depended on). Guided main
   path only — the refresh path has `coreReach` with no `coreType`, no duplication
   there. Tests in the same commit, stash-verified, full suite green before/after.
   **This closes out R14 entirely** — after this slice, update `docs/R14-WORKORDER.md`
   itself (or a closing note in DESIGN-LOG) to mark it fully superseded/complete
   rather than leaving 4 DESIGN-LOG entries as the only record. Recommended model:
   **Sonnet** — small, fully specified, no new design rulings expected.
2. **R15** (pending maintainer check) — PowerScale F710 carried 2× dual-port FE NICs
   the maintainer doesn't think were selected. Determine seed-default vs wizard; if
   seed, fix + make NIC defaults visible + platform-seed invariant + F710
   CITATION-LOG row. Non-blocking.
3. **R13** — NVIDIA leaf ladder has no 25G rung (8× 25G on an SN4700, 32× 400G).
   R12 CORROBORATED this: the form-factor check flags SFP28 optics into the SN4700's
   QSFP-DD ports as needing QSA28 adapters that aren't quoted. Evaluate an
   SN2410-class 25G leaf; at minimum an R9-style low-util note.
4. **Mode items** — PowerScale severity (backend "non-blocking not met" should be
   ERROR not WARN per h16346; verify which fabric trips it, may clear with R15);
   refresh cabling-compat question; new-OOB-into-existing-env (apply the R3 pattern);
   edge headroom note + access-ICL self-contradiction + the S5200-vs-S4348F
   distribution BUSINESS-RULE (log with the VENDOR-FACT vs BUSINESS-RULE distinction).
5. **G-024 (railNicCage per-target)** — do NOT pick up speculatively. Feature-gated:
   only when a real design has 2+ AI targets with genuinely different rail NICs.
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
