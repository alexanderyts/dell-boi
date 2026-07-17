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

### State at end of session 2026-07-16d
- **Version 0.65.0** (`js/version.js` = the single source of truth; `package.json`
  now tracks it — the long-standing 0.55.0 drift is FIXED). CHANGELOG.md has the
  0.65.0 entry.
- **Suite: 19/19 green, xfail 0.** Nothing is red. Nothing is skipped.
- **IN PROGRESS: nothing.** No half-built fix, no partial refactor.
- **BLOCKED ON MAINTAINER: nothing** blocks the next work item. (Three OPEN
  citation TASKS exist — listed below — but they are non-blocking re-rule
  triggers, not gates on R11.)

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
> **NOTE for a fresh session:** the R12 tail (railNicCage wizard question, Ruling 3
> remedies, citation rows, docs) is **DONE, not pending** — it landed 2026-07-16d and
> the tree is 19/19. If you were handed a queue that lists it as outstanding, that
> queue is stale. R12 is closed; start at (1).

1. **CORPUS INTAKE SESSION — the root PDFs** (next up). ~33 loose PDFs (~199 MB) sit
   at the repo root, outside the corpus pipeline and now git-ignored. Bring the ones
   that back real claims INTO the corpus properly: assign a `doc_id`, harvest to
   `corpus/raw/<KEY>.pdf` + extract to `corpus/txt/<KEY>.txt` (`pdftotext -enc UTF-8
   -table`), add the `docs/sources.csv` manifest row, then reconcile against
   SPEC/CITATION-LOG. **Highest-value targets first** — they are open re-rule
   triggers already logged: **H20082** (dell-technologies-ai-fabrics-overview) for
   the 800G-native inter-switch rule, and the Dell optics spec sheet for the
   1.6T→2×800G part hunt. Also note `corpus/h18157-…pdf` is a DUPLICATE of
   `corpus/raw/ST-PSTORE-HA.pdf` (the maintainer's original drop, left in place —
   delete the loose copy if you want it tidy).
2. **R11** — per-network merged-note enumeration. Cross-NETWORK merged
   switch lines enumerate only one network, masking backend isolation (PowerScale)
   and stranding the frontend (AI). Extend the merged-note to enumerate per network:
   "4 total — 2× frontend, 2× backend (dedicated, isolated per h16346)".
3. **R16** — B7 refresh `includeCoreUplink` has NO UI (unreachable). Add the
   refresh-mode question + close the invariant gap: every SIZING field REACHABLE
   from every mode whose engine reads it (sweep express/discovery/edge/refresh).
4. **R14** — NVIDIA-stack BOMs must state NOS per switch (SONiC vs Cumulus; Dell AI
   = SONiC); DFM auto-attach needs an applicability rule (DFM manages Dell
   Enterprise SONiC, not NVIDIA/Cumulus).
5. **R15** (pending maintainer check) — PowerScale F710 carried 2× dual-port FE NICs
   the maintainer doesn't think were selected. Determine seed-default vs wizard; if
   seed, fix + make NIC defaults visible + platform-seed invariant + F710
   CITATION-LOG row. Non-blocking.
6. **R13** — NVIDIA leaf ladder has no 25G rung (8× 25G on an SN4700, 32× 400G).
   R12 CORROBORATED this: the form-factor check flags SFP28 optics into the SN4700's
   QSFP-DD ports as needing QSA28 adapters that aren't quoted. Evaluate an
   SN2410-class 25G leaf; at minimum an R9-style low-util note.
7. **Mode items** — PowerScale severity (backend "non-blocking not met" should be
   ERROR not WARN per h16346; verify which fabric trips it, may clear with R15);
   refresh cabling-compat question; new-OOB-into-existing-env (apply the R3 pattern);
   edge headroom note + access-ICL self-contradiction + the S5200-vs-S4348F
   distribution BUSINESS-RULE (log with the VENDOR-FACT vs BUSINESS-RULE distinction).
8. **Then** resume the renderers slice (G-021 rack renderer) → validators →
   G-020 teardown.
Backtest queue detail: docs/backtests/BACKTEST-2026-07-16c.md.

### OPEN citation TASKS (non-blocking; re-rule triggers)
In CITATION-LOG → "Optic ↔ port form factor":
- **H20082 / AI Factory RA** — the 800G-native inter-switch rule is corroborated by
  PART evidence but not yet by a Dell design doc. If the RA sizes 800G 3-tier
  differently, **re-open the ruling** rather than bending the code to fit both.
- **1.6T→2×800G OSFP-far-end part** — hunt the Dell optics spec sheet + H20082. If a
  real part exists, catalog it with verification and the Z9964F-ON automatically
  re-enters the super-spine ladder (the tier narrows).
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

## Test suites
Run the full harness before and after changes. All suites are hard-fail.
Renderer parity, call-site guards, and structural 3-tier assertions
carry forward through the restructure unchanged.
