# Design-rule changelog

Append-only, dated, newest-first. Each entry says what changed in [SPEC.md](SPEC.md), why, and
what was wrong before — the reasoning that doesn't belong mixed into a current-state rule
statement. This is a companion to `SPEC.md`, not a replacement for the project root's
`CHANGELOG.md` (which tracks user-facing version releases); this file tracks *design-rule*
history specifically, so a maintainer can answer "why does SPEC.md say X" without diffing git
blame across a dozen commits.

---

## 2026-07-23f — DFM applicability check consolidated (v0.66.4) — GAPS G-030

**Change:** second `/improve-codebase-architecture` candidate implemented this session (Candidate
B — "DFM capability: the seam that wasn't"). The atomic fact "does this switch model have a
Dell-SONiC path" — `Array.isArray(sw.nosSupported) && sw.nosSupported.indexOf('dell-sonic') >= 0`
— was hand-typed independently in three places: `engine.js`'s `dfmStatus()`, `validate.js` check
#14, and `ui.js`'s `dfmStats()`. Separately, the code that actually attaches the DFM software
line to a finished design (`addVerity()`) was pasted character-for-character into both
`wizard.js` and `app.js`, differing only in how each file reaches the catalog (`C()` vs.
`window.CATALOG` — a difference that only existed because `engine.js` wasn't the one holding it).

**Grilled first, one question.** The only real fork: where does the shared attach body live —
folded into `engine.js` (matching `dfmStatus`/`switchNosNote` precedent, since it only reads/
mutates a computed `res` object, no DOM, no wizard state) or kept in `wizard.js` with `app.js`
calling into it. Chose `engine.js` — the alternative makes the Expert Form depend on the guided
wizard for something that isn't guided-flow-specific at all. Everything else followed from the
code as it stood, not from a decision: the predicate needed a resolved switch object (every
current caller already had one resolved), and `nosSupported` is populated on every catalog
switch entry (Dell and NVIDIA alike), so one predicate genuinely covers every case.

**Fix:**
- `isDellSonicCapable(sw)` — the one predicate, in `engine.js`, exposed as
  `window.isDellSonicCapable`. `dfmStatus()` now calls it instead of re-deriving it (a fourth
  internal duplication, even though same-file); `validate.js` and `ui.js` call it directly.
- `attachDfm(res)` — the moved `addVerity()` body, exposed as `window.attachDfm`. `wizard.js`'s
  `addVerity` is now a one-line delegate (`res => window.attachDfm(res)`), keeping its name and
  its `window.Wizard._test.addVerity` exposure so `selftest.js`'s existing DFM-gate tests needed
  zero changes. `app.js`'s pasted copy is deleted; its one call site calls `window.attachDfm`
  directly.
- `validate.js`'s separate raw-vendor `hasNvidiaSw` check (a genuinely different question — "is
  this NVIDIA-vendor," used for the unrelated "plan Cumulus/NVUE skills" message) was
  deliberately left untouched — out of scope, not overlooked.

**Verification.** Pure refactor — no output should change, and none did: full harness 19/19 green
before and after, byte-for-byte. New direct unit tests on `isDellSonicCapable()` (Dell switch →
true, verify-flagged Spectrum model → true, non-verify Spectrum model → false, null-safe).
Stash-verified: reverting `engine.js`/`wizard.js`/`app.js`/`validate.js`/`ui.js` together crashes
the suite outright (the new functions don't exist without the fix); restoring them returns to
320/320 unit-engine assertions passing.

See GAPS.md G-030 for the full before/after.

---

## 2026-07-23e — switch-line note assembly hardened into one function (v0.66.3) — GAPS G-029

**Change:** `/improve-codebase-architecture` surfaced `addLine()`'s note assembly as the top
recommendation after R14 closed — the same fact (a switch line's descriptive text) was being
written TWICE, by two differently-coded paths: by hand at whichever of the 4 `category:'Switch'`
call sites created the line, and again, differently, in `addLine()`'s merge branch when a second
network's switches folded in. That split is the exact structural cause of both G-022 (2026-07-17,
the per-network breakdown silently dropped on merge) and G-027 (2026-07-23b, the NOS statement
silently dropped on merge) — same bug, twice, on two different appended facts. G-027's own entry
named the fix in advance: "a third occurrence would be worth hardening `addLine()` itself...
rather than relying on catching it by hand again."

**Grilled per `/grill-with-docs` + `/domain-modeling` before any code changed.** Four decisions,
explained here in the plain terms used with the maintainer during the grill:

1. **Scope: all 4 main-path switch lines** (leaf, pod-spine, super-spine, border-leaf) — not just
   the leaf line G-022/G-027 actually hit. The Edge/Refresh/RA lines use separate functions
   (`recommendEdge`/`recommendRefresh`/the RA path) and were left alone.
2. **One function writes the note, exposed the same way `switchNosNote`/`dfmStatus` already are**
   (private inside the engine's IIFE, attached to `window._engineHelpers` for direct testing) —
   matching established precedent rather than inventing a new exposure pattern.
3. **One shape covers both the single-contributor and merged case**: every switch line now stores
   its facts as real fields — `_detail` (the full descriptive text, written once) and `_breakdown`
   (an array of `{network, qty, dedicated}`, one entry per contributor) — instead of a note string
   that means something different depending on how many times it's been touched.
4. **Recompute the note from those facts every single time they change** — creation counts as a
   change — so there is exactly ONE call to the note-writer (`switchLineNote`), not a separate
   create-path call and merge-path call that could drift apart again. This is the actual fix: it
   doesn't patch the two known instances, it removes the second code path they both came from.

**A live gap closed in passing, not just a theoretical hardening.** Auditing all 4 call sites for
this refactor found only the LEAF site had ever passed `network`/`dedicated` to `addLine` — the
other three never did. A pod-spine merge across two separate networks landing on the same model
(concretely: a general-purpose frontend fabric and a PowerFlex storage fabric both sizing to
S5232F-ON at moderate scale — a reachable, unremarkable scenario, not an edge case) silently fell
to the bare `'; +more'` tag with no per-network breakdown at all. This was never reported and
never had a symptom on record; it's the same defect class as G-022, just never noticed on the
spine tier. Fixed as part of the same change, since the new shape naturally covers it.

**Verification.** `tests/unit-engine.js` gained a direct unit-test block for `switchLineNote()`
(single contributor, two-contributor rollup, with/without NOS) plus a live pod-spine merge
scenario asserting the newly-closed spine-line gap. Stash-verified two ways: reverting
`js/engine.js` wholesale crashes the suite outright (the function doesn't exist without the fix);
reverting only the pod-spine call site's two new fields turns exactly the new spine-line
assertion red and nothing else — confirming the test catches the specific thing it claims to.
Full harness 19/19 green throughout, xfail 0.

See GAPS.md G-029 for the full before/after and the generalizable lesson (a structural fix beats
a lint rule when the lint rule's only job would be "don't reintroduce the second code path").

---

## 2026-07-23d — R14 Slice 4 landed: the two core-distance wizard questions merged (v0.66.2) — R14 CLOSED

**Change:** implements Slice 4, the last of the R14 replan (work order M4/D4). The guided
wizard's `coreReach` ("Same room / campus, or a long run to another building?") and `coreType`
("Is the core in the same building, or a longer run...?") — two near-duplicate questions, both
genuinely controlling different engine behavior (the optic vs the uplink class), but worded
closely enough that the R16 sweep (2026-07-17d) flagged the collision without fixing it — are
now ONE question, `coreDistance`, with three answers (same room/rack/row, elsewhere in the
building, different building/campus/metro) mapping onto both `coreType` and `coreReach`
consistently. This closes the "future wording consolidation" note left open in the 2026-07-17d
entry above.

**Why this waited for Slice 1 first, not done earlier:** merging the two questions before Slice
1 fixed `engine.js:1603`'s dead DCI-forces-long-reach clause would have risked PERMANENTLY
masking that bug — a single merged answer that always sets both fields "correctly" gives no way
to independently notice the engine wasn't honoring one of them. Sequencing the defect fix first,
then the merge, was deliberate.

**Refresh path unaffected** — it only ever had `coreReach`, no `coreType`, so there was no
duplication to merge there; `docs/contracts/INPUT-SCHEMA.md` §3.7 is unchanged. The Expert Form
also keeps its two separate `#f-core-type`/`#f-core-reach` controls (found and noted in Slice 1)
— D4 was scoped to the guided wizard specifically, matching the work order.

**Test coverage added a genuinely new case**, not just a rename: the middle answer ("elsewhere in
the building" → core-class, but still long-reach) was previously only reachable via an
inconsistent two-question combo or the Expert Form — never exercised end-to-end through the
guided wizard before this merge. `tests/harness/test-dom.js` now drives all three answers and
asserts the exact optic model for each. Stash-verified: reverting `js/wizard.js` alone turned 4
of the new assertions red.

**R14 is now fully closed** — all 4 slices shipped (v0.65.5 → v0.66.0 → v0.66.1 → v0.66.2).
`docs/R14-WORKORDER.md`'s §MECHANICAL was superseded entry-by-entry across these four dated
entries; its §RULED D1 and D3 survived largely intact, D2 was dropped (DFM applicability became
a catalog fact, not a wizard input — Ruling 1 of the 2026-07-23 grill), and D4 landed as
specified once its dependency was fixed. Two real defects were found and fixed along the way that
were never in the original work order: the DCI long-reach engine bug (Slice 1, GAPS G-025) and
the `addLine()` merge-drops-NOS-text bug (Slice 2, GAPS G-027) — plus a vendor-blanket DFM-scoping
bug found in three independent places (Slice 3, GAPS G-028). None of that would have surfaced
from implementing the work order verbatim, which is the entire reason `/grill-with-docs` was run
against it before any code changed.

---

## 2026-07-23c — R14 Slice 3 landed: the DFM gate, all six entry points (v0.66.1)

**Change:** implements Slice 3 of the R14 replan. A single predicate, `window.dfmStatus(res)`
(new in `js/engine.js`), reads the ACTUAL switches on a finished BOM — not `input.stack`, not a
vendor string — and returns `{applicable, verifyOnly}`. `applicable` is true iff at least one
switch on the BOM has `nosSupported.indexOf('dell-sonic') >= 0` (a plain Dell PowerSwitch, or one
of the three verify-flagged Spectrum models). `verifyOnly` is true iff EVERY dell-sonic-capable
switch present is one of those three verify-flagged models (no plain Dell hardware backs the
claim). Wired into all SIX `addVerity` call sites the work order undercounted (it named three):
`wizard.js` × 5 (Express, Refresh, Edge, guided main, Discovery) and `app.js` × 1 — the Expert
Form's, which the work order missed entirely (it lives inside `DesignIO.run()`, the save/load/
share replay path that the "Generate" button also goes through, not an obviously-separate
"Expert Form" code block).

**Behavior change, not just plumbing:** an all-Cumulus/Pure-SONiC NVIDIA design no longer gets
the DFM software line at all — it gets an info line naming why and pointing at NVIDIA NetQ/NVUE.
A design backed only by the three verify-flagged models still attaches DFM, with an appended
compatibility-matrix caveat on that BOM line. A mixed design (some DFM-manageable switches, some
genuinely not) still attaches DFM, and `validate.js`'s existing scope warning is now keyed off
the SAME catalog fact instead of a raw NVIDIA-vendor check — the old check would have wrongly
told a rep to "scope DFM to the Dell portion" even when the NVIDIA switches present were
verify-flagged Dell-SONiC-capable ones.

**A third independent occurrence of the vendor-blanket bug, found and fixed in the same pass.**
`js/ui.js`'s BOM-tab DFM value card computed its "N Dell SONiC switches / N NVIDIA switches"
counts by raw vendor string too — same bug class as `validate.js`'s pre-fix check. Fixed to use
`nosSupported` the same way. Left unfixed, the card would have told a rep "DFM doesn't cover
these NVIDIA switches" for switches the BOM line right above it says DFM DOES cover
(verify-flagged) — a visible, trust-eroding contradiction on the same screen.

**Test infrastructure note:** `addVerity` lives in a closure inside `wizard.js`/`app.js`, neither
of which is loaded by `tests/unit-engine.js` (DOM-free, catalog+engine only). Added it to
`window.Wizard._test` (an existing testing backdoor) so `js/selftest.js` — which DOES load
`wizard.js` — can exercise the real gate function directly, rather than the old test's approach
of manually pushing a DFM BOM line and only checking `validate.js`'s downstream reaction (which
never actually tested whether the gate itself decided to attach). `selftest.js:204/209`'s old
assertions were retired and replaced with three precise cases (not-applicable, pure-Dell,
mixed) plus a `dfmStatus()`-specific block in `tests/unit-engine.js` covering all branches
against synthetic BOMs, independent of which exact `recommend()` scenario happens to produce
which switch mix.

**Stash-verified in two steps** (the logic spans engine.js + wizard.js/app.js): reverting
`engine.js` alone removed `window.dfmStatus`, correctly failing `unit-engine.js` and
`selftest.js` (both call it directly; `wizard.js`/`app.js` degrade gracefully to "always
attach," which is why `test-dom.js` stayed green under that revert — expected, not a gap, since
neither of the two tests that DO exercise the not-applicable path ran through a DOM flow).
Reverting `wizard.js`+`app.js` alone (with `dfmStatus` intact) correctly failed `selftest.js`
with `addVerity is not a function`. Full suite green after each restore.

---

## 2026-07-23b — R14 Slice 2 landed: OS10 dropped, per-switch NOS statement, NVIDIA "SONiC" corrected (v0.66.0)

**Change:** implements the R14-grill session's replacement plan (see the entry below), Slice 2 of
4. `SPEC.md` §4 rewritten: OS10 is no longer a new-build NOS choice anywhere in the tool (guided
wizard question removed, Expert Form `#f-nos` select removed, `js/engine.js`'s `nos` const pinned
`'sonic'` unconditionally in the main `recommend()` path). New §4z added, naming the four things
that share the word "SONiC" in this codebase's sources — Dell Enterprise SONiC, Dell SONiC on
Spectrum (three named models only), NVIDIA Pure SONiC, NVIDIA Cumulus Linux — since conflating
them is exactly what produced R14's original bad premise.

**Catalog change:** `js/catalog/switches.js` gained a structured `nosSupported` fact per switch
(replacing free-text-only `os`), plus `dfmVerify:true` on SN5600/SN5610/SN2201 — the three models
`AI-SPECTRUM.txt:25` (H04658) names as "Dell PowerSwitch ... with Dell SONiC." The other four
Spectrum models (SN4700/SN5400/SN5600D/SN6810) had their `os` display string corrected from
"NVIDIA Cumulus Linux / SONiC" (ambiguous — reads as Dell's) to explicitly name NVIDIA Pure
SONiC, sourced to `NV-SN4700.txt:777` ("community-developed, open source"). `redundancyMethods`'
`DELL_LEAF_SPINE` dropped `'vlt'` (documentation-accuracy only — confirmed via grep that no code
path reads the `'vlt'` value specifically, only `'evpn-mh'`/`'mclag'`) and `s4148f-on`'s capability
entry was fixed from `DELL_SONIC_ONLY` to `[]` (its own `os` field has always said OS10-only; the
old CAP entry contradicted it — inert since it's `eol:true` and never selected, but wrong data).

**A real bug found and fixed mid-implementation, not just a doc/test exercise.** Adding the
per-switch NOS statement (work-order D3, kept) by string-appending `· NOS: ...` onto each switch
line's `note` worked for a single-network line — but `addLine()`'s existing merge logic (from
G-022, 2026-07-17) *regenerates* a switch line's note from scratch whenever a second network
merges into the same model, to keep the per-network breakdown from drifting. That regeneration
silently discarded the appended NOS text on the second+ contributor — caught live via an
AI-platform target's non-rail (general-workload) NIC group, which merges SN4700 lines across
storage and frontend networks. Fixed at the root: NOS is now a first-class `nos` field on the
line object (not embedded in `note` text), and `addLine()`'s merge-regeneration path re-appends
it — safe because a merge is only ever same-model by construction (`mergeKey` defaults to
`category|model`), so every contributor to one merged line has the identical NOS value. This is
the second time this exact merge path has silently dropped information appended after the fact
(G-022 was the first, for the per-network breakdown itself) — the lesson generalizes: anything
appended to a `note:` string on a `category:'Switch'` addLine call must be re-verified against a
multi-network merge scenario, not just a single-network one.

**E3224F-ON's edge-access BOM line was independently found to be wrong**, unrelated to the merge
bug: its note read "Edge/access (Dell Enterprise SONiC)" unconditionally for every E-series
model, including E3224F-ON — which has no Enterprise SONiC path at all (`switches.js`'s own `os`
field already said so). Fixed to disclose OS10/end-of-sale on that one model only, verified with
a regression guard that the common copper case (E3248P-ON) still says Dell Enterprise SONiC.

**Contract change:** `docs/contracts/INPUT-SCHEMA.md`'s `nos` row reclassified from `SIZING` to
`PINNED` — it no longer changes hardware on the main path, so `tests/invariants.js`'s
`INPUT-EFFECT` pair for it was retired (a SIZING-only invariant) and replaced with an explicit
inverse guard: `nos:'sonic'` vs `nos:'os10'` now produce IDENTICAL hardware, and no new-build BOM
contains VLT/VLTi/OS10 regardless of what's passed. Stash-verified: reverting `js/engine.js`
alone turned all 4 new `unit-engine.js` assertions and both new `invariants.js` assertions red.

`docs/CITATION-LOG.md` gained two rows: the OS10 end-of-sale ruling marked **MAINTAINER-ATTESTED,
NOT VENDOR-CITED** (a new status value, added to the doc's own enum — same class of gap as the
pre-existing S41xx row; zero hits for "end of sale" across the four candidate corpus docs), and
the Dell-SONiC-on-Spectrum claim marked `CURRENT`/`verify:true` (two Dell sources agree, the
compatibility matrix is silent not contradicting — re-verified with a binary-safe grep + positive
control after the original v0.29.0 finding used a grep that silently skipped the non-UTF-8 matrix
file). `js/catalog/glossary.js` gained hover tooltips for all four NOS terms.

---

## 2026-07-23 — R14 grilled: work order's premise was false; DCI long-reach defect found and fixed (Slice 1 of 4)

**Trigger:** `docs/R14-WORKORDER.md`, prepared by a prior design-only session, asked the next
session to implement its §MECHANICAL "verbatim" against §RULED decisions. Grilling it against
the live code (`/grill-with-docs`) before implementing — per standing rule 3, never silently
match a plan that contradicts what the code shows — found the work order's central premise false,
in the direction that would have shipped a worse quote than today's.

**What the work order got wrong:** it claimed the engine "silently hardcodes SONiC for NVIDIA
fabrics" and proposed a global `nvidiaNos` input defaulting to `'sonic'`. In fact `validate.js`
already states NVIDIA Spectrum runs Cumulus, not Dell Enterprise SONiC (ruling v0.29.0,
CHANGELOG:1415), with `selftest.js` assertions protecting it. `corpus/txt/SONIC-COMPAT.txt` (the
authoritative Enterprise SONiC matrix, re-verified readable this session with a positive control
after an early binary-unsafe grep returned a false zero) still contains zero occurrences of
SN5600/SN5610/SN4700/SN2201/Spectrum/NVIDIA. The misread traced to a genuine vocabulary
collision: **four** distinct things wear the word "SONiC" in this codebase (Dell Enterprise
SONiC; Dell SONiC on Spectrum — `AI-SPECTRUM.txt` H04658, SN5600/SN5610/SN2201 only; NVIDIA Pure
SONiC, a community distro — `NV-SN4700.txt:777`; NVIDIA Cumulus Linux), stored in one ambiguous
catalog string. `js/catalog/switches.js`'s `os: 'NVIDIA Cumulus Linux / SONiC'` on SN4700 reads
as Dell-SONiC-capable if you don't know the SONiC there is the community one.

**Rulings made this session** (full detail + evidence: `docs/R14-WORKORDER.md`'s replacement
plan, saved as the session's plan file — DFM applicability becomes a per-model catalog fact
rather than a wizard input; DFM attaches to Dell PowerSwitch SN5600/SN5610/SN2201 only,
verify-flagged; **OS10 is dropped portfolio-wide as a quotable NOS choice** (maintainer: "OS10
shouldn't be quoted, it's end of sale") — new Dell switches are Enterprise SONiC, VLT/OS10
wording survives only for the customer's *existing* gear; E3224F-ON stays quotable with an
end-of-sale disclosure (it is OS10-only and the tool's only fiber-SFP edge switch — dropping it
outright would remove a deal type with no substitute); terminology extends `SPEC.md` +
`js/catalog/glossary.js`, no new `CONTEXT.md`/`docs/adr/`.

**Independent defect found while verifying D4 (the core-reach/core-type wizard merge):**
`engine.js:1603`'s DCI-forces-long-reach clause — `ctype === 'dci' && input.coreReach !== 'auto'`
— could only be true when `coreReach` was *already* `'longreach'` (its only other value per
`INPUT-SCHEMA.md`), which had already satisfied the clause before it. **The DCI clause has never
changed the outcome since it was introduced.** A rep answering "different building / campus /
metro" but leaving the reach question at its wizard default got short-reach optics quoted for a
metro link. `INPUT-SCHEMA.md:64,67` and the `wizard.js:473-478` comment (written during the
2026-07-17d sweep above) correctly describe the *intended* behavior — the bug was purely in the
engine not living up to its own spec, so those doc lines needed no correction, only the code.
Fixed in v0.65.5: `longReach = input.coreReach === 'longreach' || ctype === 'dci' || ...` —
unconditional. Shipped as its own patch release, independent of the other R14 rulings, because it
is a live quote defect with no dependency on them.

**Stash-verify caught a false-positive test on the first attempt.** The first version of the
`test-dom.js` regression check used `/LR4/i.test(bom)` — which passed even against the *unfixed*
buggy engine, because the short-reach `Q28-100G-FR` optic's own catalog description contains the
substring "(LR4 for 10km)" as a comparison note (`optics.js:129`). Narrowed to match the actual
`Q28-100G-LR4` model string. Recorded here because it's a reusable lesson: a regex assertion
against rendered BOM text can pass by matching a *different* part's description, not the part
that was actually picked — stash-verify (revert the fix alone, confirm red) is what caught it,
not code review.

**Sequencing:** implemented as 4 slices rather than one release, so each stash-verifies honestly
— v0.65.5 (this defect, shipped), then v0.66.0 (NOS model), v0.66.1 (DFM gate — 6 `addVerity`
entry points, not the 3 the work order named), v0.66.2 (wizard merge). `docs/R14-WORKORDER.md`
§MECHANICAL is superseded; §RULED D1/D3 survive, D2/D4 are revised per the above.

---

## 2026-07-17d — R16 reachability sweep triage: 5 rulings, all landed same-day

**Change:** the maintainer triaged all four sweep findings from the R16 session (GAPS G-023)
plus the adjacent railNicCage observation, in one ruling pass. All five rulings implemented in
this session — no finding carried forward as a stale gap.

1. **`coreType` — ADD the guided-wizard question.** A new conditional-reveal question ("Is the
   core in the same building, or a longer run — different building / campus / metro?"),
   same-building default, `showIf` gated on a core uplink existing. The longer-run answer maps to
   `coreType: 'dci'`. Landed with wizard-level input-effect coverage (`test-dom.js`) alongside the
   engine-level pair that already existed in `tests/invariants.js`.
   **Implementation note surfaced, not silently absorbed:** the maintainer's specified question
   wording closely echoes the ALREADY-EXISTING `coreReach` question ("Same room / campus, or a
   long run to another building?"). These are genuinely distinct engine effects — `coreReach`
   picks the optic (short vs 10km LR), `coreType==='dci'` independently forces long-reach AND
   raises the optic-speed floor — so both questions are correct to have, but a rep now answers two
   similarly-worded reach questions back-to-back. Implemented exactly as specified (the instruction
   was unambiguous); flagged here per standing rule 3 rather than silently smoothing the wording,
   in case a future session wants to consolidate the phrasing.
2. **Guided wizard's edge branch — DISCLOSE, don't build questions.** Ruled explicitly against
   adding a second question set (the dedicated Edge Form already exposes PoE class, access speed,
   uplink class, and distribution reuse — building it twice would be redundant, not reachable-gap
   closure). Fixed with an `assume()` call, the same declared-defaults mechanism Express mode
   already uses, surfaced as a `severity: 'warn'` "Assumption:" line in Checks.
   **Correction made and flagged, not silently applied:** the maintainer's proposed disclosure
   text read "...1G PoE access, **10G** uplinks, redundant distribution...". Read against
   `recommendEdge`'s actual code (`js/engine.js`, `sfpUplink = input.edgeUplink === 'sfp'`), the
   HARDCODED default when `edgeUplink` is left unset is the **100G** rear-QSFP28-pair path, not
   10G — 10G is only the alternate class engaged by `edgeUplink: 'sfp'`, which this branch never
   sets. Corrected the disclosure text to "100G uplinks" so the assumption line tells the rep the
   truth about what was actually assumed, per standing rule 3 ("never silently match a plan that
   contradicts what the code shows"). Also added "new" ahead of "redundant distribution pair" to
   name the fourth hardcode (`distribution: 'new'`) that the original proposed wording didn't
   otherwise capture.
3. **Discovery's edge branch — same disclosure, nothing more.** Identical `assume()` text at
   Discovery's edge-workload branch. No new questions, matching the ruling.
4. **Discovery's missing core question — documented as intentional.** One sentence added to
   SPEC.md's "Inter-network connectivity" rule: "Discovery omits core-uplink questions by design;
   resolved at quote time in guided/expert paths." A future sweep now reads this as a decision on
   record, not an undocumented gap to re-flag.
5. **Per-target `railNicCage` — GAPS entry (new G-024) with an explicit revisit trigger**, not a
   fix. This is a genuinely different class of finding from 1–4 (a missing ENGINE capability —
   the field is resolved once, globally, near the top of `recommend()` — not a missing UI
   control), so it gets its own gap entry rather than folding into G-023. **Feature-gate rule,
   maintainer-set:** no plumbing work until a real design actually has 2+ AI targets with
   different rail NICs. Interim: the engine now warns when 2+ AI targets exist in one design,
   naming the count and telling the rep to verify the rail splitter part per target if the NIC
   generations differ — so a genuinely mixed-cage design surfaces the risk instead of silently
   trusting one shared answer, without building capability nobody has asked for yet.

**Test discipline, continuing this session's practice:** every code change (1, 2/3, 5) was
verified against its own regression test with a stash-and-restore check before being trusted —
sweep #1's wizard-level test (4 assertions), sweep #2/#3's disclosure tests (2 assertions), and
sweep #5's engine-level warning test (2 assertions) all went red when their respective fix was
stashed, and green when restored. Sweep #1's SMOKE-TEST FIRST discipline also caught a bug in the
TEST script itself before it was trusted: an early draft's `/Edge/` regex matched "Power**Edge**"
in an earlier, unrelated wizard option before ever reaching the real "Edge / access" button —
fixed to an anchored `/^Edge \/ access/` before the assertion was written into the suite. A test
that passes by accident is worse than no test; verifying the SELECTOR against the real DOM before
trusting the assertion is the same discipline as verifying the assertion against the real defect.

---

## 2026-07-17c — G-023 / R16 closed: a fixed engine defect is still a live defect if no UI can reach it

**Change:** three new refresh-mode wizard questions (`core`, `coreVendor`, `coreReach`) wire
`recommendRefresh`'s `includeCoreUplink`/`coreSpeed`/`coreVendor`/`coreReach`, closing the gap
between B7 (fixed at the engine level 2026-07-16) and B7 actually being reachable by a rep.

**What was wrong before:** B7's own fix landed cleanly — `recommendRefresh` now prices the
uplink-to-existing-core cabling through the same `coreVendor` machinery the main path uses,
instead of flipping `upPerSw` with no hardware line behind it. But nothing in `wizard.js`'s
`REFRESH()` question array or its `go()` translation ever set `includeCoreUplink`. The refresh
wizard's `distribution: 'existing'` option is labeled "Access-only refresh, uplink to what is
there" — a promise that hardware exists connecting the new access switches somewhere — but the
BOM behind that promise was empty. A fixed backend defect behind an unreachable front end is
still, from the rep's chair, an open defect; the defect meter reading "B1–B7 hard guards" was
true of the engine and false of the product.

**Fix, mechanically:** reused the main path's J2/J3 `core`/`coreVendor`/`coreReach` question
objects (same ids, same option labels, same behaviors) inside `REFRESH()`, gated behind
`distribution === 'existing'` — the exact condition under which `recommendRefresh` itself gates
core-uplink pricing (`!needSpine`). Asking the question when `distribution === 'new'` would create
a question the engine can never act on — the mirror-image bug to the one being fixed, and worth
naming explicitly since the reachability sweep (below) found instances of exactly that mirror
image elsewhere.

**Scope decision, made from reading the engine, not assumed:** the main path's core-uplink
funnel goes four questions deep (`core` → `coreVendor` → `coreFarModel`/`coreFarPort`) when the
vendor is Dell and the far switch is named. `recommendRefresh` does not read `coreFarModel` or
`coreFarPort` at all — its `coreVendor === 'dell'` branch always resolves the far side through
`pickCoreOptic`'s simpler matched-both-ends pattern (confirmed by grep: those two identifiers
appear nowhere in the function). Adding those two extra questions to the refresh wizard would
have "reused the machinery" more completely in one sense, but would have built UI for a value the
engine silently discards — trading one reachability defect for its inverse. Stopped at the three
fields the function actually consumes.

**Reachability sweep (queue item 2, RESTRUCTURE-3 R16's other half):** before calling R16 done, I
cross-checked every SIZING field in `docs/contracts/INPUT-SCHEMA.md` §1–§2 against the ACTUAL
code (`grep` on `js/wizard.js`/`js/app.js`, not the doc's own §3 tables, since those can drift —
and did: §3.7 predates this session's fix). Found four gaps beyond R16's own scope. Per the
maintainer's explicit instruction, **none of these were fixed** — reported for triage instead:

1. `coreType` (SIZING-partial — `'dci'` forces long-reach optics AND a different optic-speed
   floor, confirmed by reading the `ctype === 'dci'` branches in `engine.js`) has a control ONLY
   in the expert form (`#f-core-type`). No wizard-based mode (guided, express, discovery) can ever
   select it — every wizard-built core uplink is `coreType: 'core'` by omission.
2. The guided wizard's `category === 'edge'` branch hardcodes `poe: 'poe+'`, `accessSpeed: '1g'`,
   `edgeUplink` (unset → engine default), and `distribution: 'new'` — all four SIZING per
   `recommendEdge`'s own contract — with no question AND no `assume()` disclosure. Compare the
   dedicated Edge Form, which exposes all four, or Express mode, which hardcodes plenty but
   narrates every one of them in a single visible assumption line. The guided wizard's edge path
   does neither: it's silent.
3. Discovery's edge-workload branch hardcodes the same four fields — lower-priority than (2)
   since Discovery's guidance-tool scope is already partially documented (INPUT-SCHEMA §3.6), but
   the specific hardcodes were never spelled out there either.
4. Discovery's general (non-edge) path has no core/DCI-uplink question anywhere — a
   Discovery-originated BOM can never price one, an omission the contract doesn't currently
   declare as intentional.

A fifth observation is a different *class* of finding, not a same-shape instance: `railNicCage`
is read as a single top-level `input.railNicCage`, not per-Target — so even if a "2nd AI target's
rail cage" question existed, the engine has nowhere to put the answer. This isn't a missing UI
control, it's a missing engine capability, and belongs in a separate ticket if the maintainer
wants it pursued (multi-target AI designs with genuinely different rail-NIC generations are
plausible but not yet modeled at the field level).

**Test discipline, continuing this session's practice:** the regression test (`test-dom.js`, "R16"
blocks) was verified against the actual defect before being trusted — stashing only the
`wizard.js` change (leaving the test in place) turned 4 assertions red; restoring returned to
green. A smoke script proved the DOM path worked before any test was written, so the permanent
test was built against a *known-working* flow rather than guessed at blind.

---

## 2026-07-17b — G-022 / R11 closed: a merged BOM line must say WHAT it merged, not just HOW MUCH

**Change:** `addLine()` in `engine.js` now regenerates a switch line's note from structured
per-network data whenever a second network's contribution merges into an existing line. No SPEC
rule changed — this implements DERIVATIONS §1's already-approved worked example ("4 total — 2×
frontend, 2× storage") that had never actually been built.

**What was wrong before:** DERIVATIONS §1 (approved 2026-07-16, with this exact amendment
attached) says switch lines merge across networks by `(model, role)` on purpose, and "the
generated note enumerates the per-fabric breakdown." The merge-by-model-key existed; the
enumeration didn't. `addLine`'s only response to a second contribution was `existing.note +=
'; +more'` — literally the seam §1 names as retired ("There is nothing to merge... no line ever
has 'qty 8, note describes 4'"). It had silently regressed back in, on the one BOM-affecting
line (leaf switches) that gets one `addLine` call per fabric instead of one call for an
already-aggregated group.

**Why this one mattered more than a cosmetic note:** the maintainer's named priority case is
PowerScale. Backend must be a dedicated, physically-separate network — that's not a style
preference, it's h16346. When PowerScale frontend and backend leaves happen to pick the same
model (a real, common case — both often land on S5232F-ON at moderate node counts), the merged
line read `"Leaf/ToR — ... frontend (100GbE); 1/fabric × 4"` — four switches, all apparently
frontend, isolation nowhere visible. A rep can't defend "your backend is isolated per Dell's
requirement" off a BOM line that doesn't mention backend exists. The qty was always right; the
note was lying about composition, on the exact fact a compliance-sensitive customer would ask
about.

**Fix, mechanically:** `addLine` accepts an optional `line.network` (+ `line.dedicated`). On a
second contribution carrying a network, it builds/extends `existing._networkBreakdown` (an array
of `{network, qty, dedicated}`) and regenerates `existing.note` from that array — never string
concatenation. A single-network line (still the common case) is byte-identical to before; only
the moment of an actual cross-network merge changes behavior. Confirmed general (not
PowerScale-specific): general + storage targets that both resolve to S5248F-ON hit the exact
same defect, so the fix lives at the shared merge mechanism, not a PowerScale special case.

**Scope check performed, not assumed:** before touching `addLine`, I confirmed the spine-tier
BOM lines do NOT have this bug — `grp.fabrics` is aggregated once per spine group *before* the
single `addLine` call for that group runs, so the spine note is already computed over the full
membership and already says something honest and generic ("Shared spine — all non-AI,
non-back-end leaves connect here") rather than claiming to describe only one contributor. The
defect is specific to lines built by repeated `addLine` calls inside a per-fabric loop, which
today is only the leaf-switch line.

**Design choice — no hardcoded citation in generated text:** the `dedicated` flag is computed
from `fs.target.platform.backendIndependent` (currently true only for `powerscale`), and the
note text says "(dedicated, physically separate)" — not "(per h16346)". Citations belong in
CITATION-LOG/SPEC, re-checked on a cadence; burning a doc code into generated BOM text means a
future backend-independent platform with a *different* citation would print PowerScale's wrong
source. This matches the existing phrasing already used at the spine-tier dedicated note
("kept physically separate").

**Test discipline:** per the G-006 lesson earlier this session, the regression test was verified
against the actual defect, not just written and trusted — `git stash`-ing only the `addLine`
change (leaving the test file in place) turned 6 of the 12 new assertions red; restoring it
returned to green. A regression test that was never run against the bug it claims to catch is
not a regression test.

---

## 2026-07-17 — G-006 closed: an evidence standard that was blocking on a document that doesn't exist

**Change:** MX7000 external uplink count `4` → `8` per chassis (`platforms.js` mx7000
`portGroups[].count`), plus a regression block in `unit-engine.js` and a CITATION-LOG row citing
two documents. Also a **standing change to how a citation gets closed** — see below.

**What was wrong before:** the `mx7000` entry declared `count: 4` external uplinks while its own
`portOptions` string said *"Up to 4× 100GbE QSFP28 uplinks per FSE (2 FSEs/chassis)"*. Those are
not the same number: 4/FSE × 2 FSEs = 8. The entry contradicted itself and the count was the
wrong half, so an MX7000 quote carried **half the uplink optics the build actually needs**. The
BOM would look complete and be unbuildable — the failure mode this tool exists to prevent.

**Why it stayed open for two sessions:** the closure standard was "confirm against the MX9116n FSE
spec sheet." The 2026-07-15 investigation searched the corpus, found zero hits for "Fabric
Switching Engine," and correctly refused to guess — `count:4` was left alone rather than
"fixed" on a hunch. That was the right call *at the time*. But the standard had a defect: **it was
blocking on a document that appears not to exist.** The MX9116n is an aging modular platform; Dell
publishes its port layout in the deployment guides, not a standalone spec sheet. The requirement
would never have been satisfiable, so the gap would have stayed open forever while the wrong
number kept shipping.

**The revised standard (maintainer ruling 2026-07-17):** "spec sheet" was only ever a *proxy* for
"authoritative citable source." **Two independent official Dell documents agreeing verbatim meet
that bar.** Both are now in corpus (they landed in the 2026-07-17 intake pass — which is why the
2026-07-15 search legitimately came up empty):

- **H18548.9.2**, PowerEdge MX Networking Deployment Guide, **June 2026** — *"Two 100 GbE QSFP28
  ports, used for Ethernet uplinks, ports 41 and 42 ● Two 100 GbE QSFP28 unified ports, used for
  Ethernet and Fibre Channel connections, ports 43 and 44"*
- **H19120**, MX Deployment with VMware Cloud Foundation, **March 2022** — *"Two 100 GbE QSFP28
  ports ● Two 100 GbE QSFP28 unified ports ● Twelve 2x100 GbE QSFP28-DD ports"*

Four years apart, different authors, different purposes, identical port layout. The newer one adds
port numbers, which is strictly more specific — no drift between revisions.

**The generalizable lesson (why this entry is worth reading later):** when a gap is blocked on
evidence, check periodically that the evidence *can exist*. A standard that cannot be met is not
rigor — it is a permanent hold that quietly protects a known-wrong value. The fix is not to lower
the bar but to ask what the bar was a proxy for, and whether something else clears the real one.
The CITATION-LOG row and the GAPS entry both now carry an explicit **"do not reopen the spec-sheet
hunt"** note so a future quarterly recheck doesn't restart the same dead search.

**Caveat that survives the fix:** the 2 unified ports per FSE are Ethernet **or** native Fibre
Channel, not both. An FC-attached MX chassis flexes the count **8 → 4**. This is in the platform
`note`, in a rep-facing `concerns` entry, and pinned by the regression test — because the number is
now *less* universally true than a plain "8" implies, and a rep quoting FC needs to see that.

**Test discipline note:** the regression test was verified to be a real guard, not a vacuous one —
reintroducing `count:4` turns 3 assertions red including the end-to-end link total (32 → 16). The
first draft of that test asserted against a field name (`hostLinks`) that doesn't exist on the
fabric object; it passed `undefined || 0` checks and would have been a permanently-green test
guarding nothing. Caught by running it against the reintroduced defect. (Same failure mode as the
inert checker regex found in the v0.58.0 review.)

---

## 2026-07-16d — R12: optics must physically fit, and sizing may not credit phantom links
**Change (SPEC, five new rules):** a quoted link must be physically buildable, not merely
speed-matched (cage table + hard error); no phantom credit (400G is host/rail speed — inter-switch
same-cage hops run native; a breakout needs a cataloged part with the correct far end; a super-spine
must be able to TERMINATE the pod-spine's links); published RAs cable per their own document
(conflict = stop-and-ask); far-end-only part choices are asked, not guessed (derive-then-ask); a 1:2
assembly covers two links and every invariant reads that from the line.

**Why:** the 16c backtest logged R12 as "no optic↔port form-factor validation" with two examples.
Building the check found **four** defect classes, every one an unbuildable BOM a rep could have
quoted:
1. Core uplink @400G off QSFP28-only switches (S5232F-ON, Z9264F-ON, …) — reproduced live.
2. **NVIDIA AI:** MCP1660-W0xx (a *QSFP-DD* DAC) quoted into SN5600/SN5610 **OSFP** cages — 1152
   wrong parts on a GB300 NVL72 BOM. The optic's own catalog note already said OSFP twin-port
   platforms use the MCP7Y00/Y10 splitters; the engine quoted it anyway. Its id was
   `nv-dac-400g-osfp` — a misnomer that read as an OSFP part (renamed `nv-dac-400g-qsfpdd`).
3. **NEW, not in the backtest — S5448F-ON:** its 100G ports are SFP56-DD and its own spec sheet
   says *"QSFP28 optics and break-out will not work on the SFP56-DD ports"*. We quoted QSFP28 into
   them on every 100G-host design that landed on this leaf. The catalog was simply missing the
   S56DD family that Dell's spec sheet lists.
4. **NEW — Dell AI:** 400G QSFP-DD DAC quoted into Z9864F-ON OSFP112 — the Dell twin of (2).

**What was wrong before:** `pickCoreOptic`/`pickHostCable`/`pickBreakout` only ever saw a SPEED.
Nothing in the engine knew which port a cable plugged into, so "400G" was treated as sufficient.
The fix threads the real port (and, where the part branches on it, the far-end NIC cage) into the
picks, and adds a final-BOM sweep (validate #23) reading the optic ids the engine RESOLVED — never
re-derived from BOM mergeKeys (the G-011 rule). That re-derivation habit bit us again here:
`design.js` was independently re-picking the host cable and silently described a cable the BOM never
had once picks became cage-aware; it now consumes `f.hostCableId`.

**The phantom-credit thread (the deeper find).** Refusing to substitute a part that can't reach
exposed that AI sizing was crediting uplink capacity to links with no part behind them: a Z9864F-ON
spine was credited with 128 breakout-adjusted 400G ports for leaf↔spine, but the only Dell
800G→2×400G assembly fans out to QSFP56-DD **hosts**, not to another OSFP switch. Same class as the
G-007 fuzz fix, resurfaced one layer up in sizing — and then again one tier further up, where the
Z9964F-ON was credited with 2048 super-spine ports for 800G pod-spines it reaches only via an
**uncataloged** 1.6T→2×800G breakout. Both are now part-evidence-gated.

**Honest re-derivation (shown, per the ruling's condition — the prior shape was phantom-backed, so
"does it return to the old answer" was not assumed):**
- 1024-rail Dell AI: **still 8 spines** — the ratified FDC-adjacent number SURVIVES, but is now
  derived from 16 leaves × 32 uplinks @800G ÷ 64 native ports instead of via the phantom 128-port
  radix. Same answer, honest arithmetic.
- 520 servers / 4160 rails: **flat 2-tier → 3 pods + 48× Z9864F-ON super-spine**. The old "fits
  flat" depended entirely on the 128-port credit; the spine really has 64 native ports and 65 leaves
  don't fit — by ONE leaf (512 servers still fits flat). Uplink bandwidth is identical either way
  (32×800G == 64×400G == 25,600G/leaf): the phantom bought **no capacity**, only an unbuildable BOM.
  Super-spine count is now port math (3072 links ÷ 64 ports = 48), so the tier can actually
  terminate what it's sold.

**Tests re-ruled (6), each with its reasoning recorded in place.** Several suites had *encoded* the
phantom: one test's own comment read "fits flat within the 128-port breakout-adjusted radix", and
the super-spine regression guard *required* a step-up to a flagship its own comment conceded had no
cataloged optic "at any speed". Those expectations were changed, not the code — but only after the
maintainer ruled, and never by relaxing an assertion. The renderer-parity KNOWN_GAPS exception for
Z9964F-ON was correctly flagged stale by its own guard and removed.

**Self-inflicted, worth logging:** the new `superSpineTerminates` initially called the breakout
picker directly, violating the G-013 single-call-site guard (breakout decisions must have one source
of truth) — rerouted through `resolveUplinkBreakout`, which also deleted a duplicated far-end check.
And the guard is TEXT-based, so a prose mention of the picker *with parens* in a comment tripped it:
the same inert-regex class the 0.58 review found. Comment reworded.

**Deliberately NOT done:** the S56DD **DAC** is held. The only S56DD copper part has a QSFP56 far
end, and a passive DAC cannot convert line encoding (50G-PAM4 → 25G-NRZ) — NVIDIA states the same
rule for its own cables: *"100G-PAM4 cables and transceivers cannot downshift to 50G-PAM4 or
25G-NRZ."* Quoting it unverified is exactly the unbuildable-line class R12 exists to kill, so
S5448F in-rack hosts quote the SR1.2 optic: pricier, known-buildable. CITATION-LOG carries the
per-NIC verification task.

**Open re-rule triggers (CITATION-LOG):** the 800G-native rule is corroborated by part evidence but
not yet by a Dell design doc — verify against H20082/AI Factory RA; if it sizes 800G 3-tier
differently, re-open rather than bend the code to both. Likewise, if a real 1.6T→2×800G OSFP-far-end
part exists, catalog it and the Z9964F-ON re-enters the super-spine ladder automatically.

---

## 2026-07-16d — PowerStore storage ToR pair = MC-LAG + ICL: ruling FINAL, citation closed
**Change:** none to the engine — this entry CLOSES the one provisional item left by the 16c
ruling. `platform.powerstore.systemBond === true` (and therefore "a redundant PowerStore storage
fabric is MC-LAG/VLT with a peer-link, never independent A/B") is now a VERIFIED rule rather than
a pending one. Fixture #5's storage ICL loses its PENDING qualifier; the CITATION-LOG row moves
from PENDING VERIFICATION → CURRENT.

**Why:** the 16c ruling re-pinned Fixture #5 storage to MC-LAG + ICL on the strength of the
`systemBond` flag alone, which REVERSED the 16b hand-verified "storage A/B without ICL" reading.
A reversal of hand-verified ground truth can't stand on a flag whose source we hadn't located —
so it was booked as provisional, blocking-adjacent (it decides whether a real PowerStore quote
carries 2× 100G ICL DAC per storage pair).

**What settled it:** the maintainer verified against the CURRENT source — **H18157.11, "Dell
PowerStore: Clustering and High Availability" (April 2026)**, which supersedes the PowerStore
Networking Guide lead the original citation chased. Three independent corroborations in that doc:
(1) multi-appliance cluster ICM/ICD traffic rides an LACP bond through the ToRs; (2) cross-switch
bonds require VLTi — "must be configured" for stacked switches; (3) the HA block reference diagram
(Fig. 43) draws the ToR pair with an interconnect, labelled LACP/vPC. Fixture #5's 6× 5200T is a
multi-appliance cluster, i.e. the strongest form of the requirement, not an edge case.

**What was wrong before:** nothing in the code — the engine was right and the 16b hand-read was
wrong. Worth recording as a precedent in the other direction from G-011: the engine contradicted
hand-verified ground truth, we did NOT force the fixture to match either side, and the doc check
vindicated the code. The provisional-pin + citation-row mechanism is what kept a correct behavior
from being "fixed" into a wrong one.

**Noted, no impact today:** the 2026 revision of H18157 adds **FSN (Fail-Safe Networking)** as an
active/passive alternative to LAG for **NAS interfaces**. It does not relax the ToR-pair
requirement for the system bond. Flagged on the citation row for re-check if/when file-deployment
(NAS) variants are modeled — an FSN-only NAS design may not need the peer-link for that traffic.

**Provenance caveat:** H18157.11 is NOT in this repo's corpus; it was verified by the maintainer
against the live Dell document. The citation row records that explicitly rather than implying a
local text extraction.

---

## 2026-07-16c — EVPN-MH scope becomes SPARE-PORT (Option b); redundancy drives leaf selection
**Change (SPEC §4 + new §4a):** the redundancy MECHANISM is now chosen by spare ports, not by a
blanket "SONiC leaf-spine → EVPN-MH" policy. Any redundant A/B fabric whose leaf affords the 2-port
ICL is MC-LAG/VLT — including a **spined** single-/multi-leaf pair, which the old rule always forced
to EVPN-MH. Where uplinks fill the leaf, EVPN-MH is the purpose-built mechanism (not a compromise).
Redundancy is now an input to leaf selection: a redundant MC-LAG-eligible design steps its leaf up
(S5224F-ON → S5248F-ON, capped) so uplinks + ICL fit, rather than shrinking uplinks.

**Why:** three backtests (16b/16c) plus the Fixture #5 reused-spine deal showed the old policy
producing EVPN-MH on fabrics the maintainer's verified BOMs built as MC-LAG pairs — the "spined ⇒
EVPN-MH" rule was a topology proxy, not a real port-budget decision. The maintainer ruled Option (b):
pay for the peer-link where headroom exists (customer-standard); use EVPN-MH where uplinks fill the
leaf. Cutting uplinks to force an ICL (mechanism uniformity at the cost of fabric throughput) was
explicitly rejected.

**What was wrong before:** (1) a spined redundant pair with spare ports silently lost its ICL
(dropped to EVPN-MH); (2) the density-only leaf ladder under-picked economy leaves (S5224F-ON) whose
few uplink ports can't seat uplinks+ICL, compounding (1); (3) two latent bugs the ruling exposed —
`iclFits` was frozen before the shared-spine harmonize grew uplinks (stale-true → validate
over-commit), and PowerScale back-end independence (h16346) was gated on `!spine`, so a spined
back-end silently gained an ICL. Both fixed. **Provisional:** PowerStore storage is MC-LAG (its
`systemBond: true` = an LACP aggregate across both ToRs) — pending a PowerStore Networking Guide
citation for the 5200T (CITATION-LOG). If the guide shows pure MPIO, reverse to independent A/B.

**Enforced:** engine redundancy block + step 3b; `audit-principles` P6 reframed (ICL ⇒ MC-LAG/VLT
peer-link, AI rail ISL exempt); `tests/fixtures/fixture-5-reused-spine-mclag.json`. Suite 19/19,
xfail 0.

## 2026-07-16 — J2/J3 inputs built; B7 fixed; defect meter hits ZERO
**Change:** the two backtest judgment-call inputs are now real, end-to-end (engine + wizard + expert
form + fixtures + input-effect coverage), and backtest defect B7 is fixed. All seven backtest
defects B1–B7 are now hard guards — the RESTRUCTURE-3 defect meter is at zero.

**J2 `uplinkTarget`** (`new-spine` | `existing-core` | absent): overrides the auto ">2-leaf → spine"
trigger. `new-spine` forces a self-contained pod (spine + leaf→spine cabling); `existing-core`
forces spine-less — the leaves are the border to the customer's core (Fixture A2). Absent = the auto
threshold (legacy/expert "Auto"), so nothing changes for callers that don't pass it. Wizard
pre-selects existing-core for add/refresh, new-spine for greenfield.

**J3 `coreVendor`** (`dell` | `other` | `unsure`, default unsure) replaces the old our-side/far-side
binary: the decision variable is WHAT THE EXISTING CORE RUNS, not rep preference. `dell` quotes the
matched far-side optic too (Dell into a Dell core; `coreFarModel`/`coreFarPort` refine it, Fixture
A3); `other` = our side + a plain-language note naming the concrete far-side standard the customer's
vendor must match; `unsure` = our side + verify. Default stays `unsure` by FAILURE DIRECTION — a
wrong `dell` silently quotes optics that won't seat in a third-party core (silent + wrong); a wrong
`unsure` just under-includes with a visible verify flag (loud + safe). Existing-core mode also
reports the true core-port demand ("N leaves need 2N× [speed] free ports"), warn-severity past ~16.

**B7 proper:** `recommendRefresh`'s `includeCoreUplink` now PRICES the uplinks to the existing core
(the `rf-core` line, through the same coreVendor machinery) — before, it flipped a flag but added no
cable line (hardware-inert). SPEC.md §4 / §core; INPUT-SCHEMA §1.4 record the built inputs.

---

## 2026-07-16 — Redundancy is hardware, not a label: single-homing + ICL feasibility (B4, + B6 landed)
**Change:** [SPEC.md §4 Redundancy](SPEC.md#4-redundancy-os-aware--sonic--os10) gains three rules,
and the engine's sizing path implements the B4/B6 defect fixes (RESTRUCTURE-3 Phase 2). Meter 4→2.

**Single-homing (B4).** A non-redundant (`redundancy: single`) design now attaches each host by
ONE NIC port to its single leaf — the redundant half of the host's ports is spare, not cabled. This
HALVES the host links (→ genuinely fewer leaves), where before single produced byte-identical
hardware to dual (the defect: redundancy was a label). Dual keeps dual-homing (both ports across a
pair). *What was wrong before:* dual and single sized the same leaves/spines/cables; the only
difference was internal fabric bookkeeping the BOM never showed.

**Fixture B is the spine-less / direct-to-core variant.** Resolving B4 made the single design a
real 2-leaf design, which falls under the existing ">2 leaves → spine" rule AND the backtest's own
stated preference — so it has NO new spine tier; the leaves uplink direct to the customer's existing
core (border-leaf). The hand-authored fixture's leaf=2 + host=120 was physically impossible (120
copper links > 2× 48 ports) and its spine=1/mgmtcable=63 assumed a spine the 2-leaf design doesn't
build. Both corrected (host 60, no spine, mgmtcable 62) — logged in the backtest doc as fixture
error #2. The growth-spine is J2's `uplinkTarget: 'new-spine'` opt-in.

**ICL under a spine, gated on feasibility (B4).** A per-rack MC-LAG/VLT pair carries its peer-link
(ICL) even with a spine (the FDC multi-rack pattern) — this restored the 4× 100G DAC ICL the engine
was silently dropping on the backtest's dual design (evpn-mh was chosen for ALL spined designs,
suppressing the peer-link). But the ICL consumes ports: a dense/high-speed leaf that can't spare
them falls back to pure EVPN-Multihoming (no peer-link) rather than over-committing — verified
against the fuzz surface (8 physical over-commits appeared then cleared). Also keyed the peer-link
BOM line by optic id so two same-target fabrics at different ICL speeds can't merge to one wrong-
speed line (same merge-seam class as B1/B3/B5). The fallback was then hardened per maintainer
conditions (ruling 2026-07-16): it raises a **WARN** naming the escape-hatch leaves (never silent);
it **verifies** EVPN-MH support against **explicit per-switch capability data** (catalog
`redundancyMethods`, sourced from the Enterprise SONiC Compatibility Matrix — NOT the topology
`roles` field, corrected 2026-07-16 after the role proxy wrongly implied the E3248P/E3248PXE edge
switches can't run EVPN-MH; they can — only E3224F-ON specifically can't) and **hard-errors** if
neither ICL nor EVPN-MH is possible; and it is
**override-only** — 0/960 auto-sized designs trigger it, only an expert `leaf25:'s5212f'` at
multi-rack scale does. EVPN-MH being valid supported redundancy is why "refuse" (E3224F precedent,
for the impossible) was too strict and a quiet info too soft — a changed redundancy mechanism is
warn-severity by definition.

**B6 landed.** The multi-rack OOB rule stated below is now implemented: `rackMin = racks` (was
`racks + spineRack`). One deliberate, documented divergence from the FDC export (which puts an OOB
in a dedicated spine rack) — the tool follows the maintainer's "never quote an undeclared rack"
ruling instead. NOTE (follow-up, renderer slice): the rack RENDERER still draws a separate "SPINE
RACK" frame; reconciling the picture with the B6 BOM rule is the renderers-consumer increment.

---

## 2026-07-16 — Multi-rack: never quote hardware for an undeclared rack (F1/B6 ruling)
**Change:** [SPEC.md § Multi-rack deployments](SPEC.md#multi-rack-deployments-fdc-rack_topology-pattern)
gains a governing rule — OOB switch count equals the `racks` input (one per declared rack), and
spine equipment is housed within the declared racks, never in an assumed dedicated spine rack.

**What was wrong before:** the rule said "spines live in a dedicated spine rack, which also has
its own OOB switch," and the engine sized OOB as "per rack incl. spine rack." For `racks = 2`
that produced THREE OOB switches (2 node racks + 1 assumed spine rack) — quoting a third rack's
worth of management hardware the customer never declared. The RESTRUCTURE-3 backtest
(docs/backtests/BACKTEST-2026-07-15.md) surfaced this as F1 when the corrected golden fixtures
pinned 2 OOB switches for a 2-rack design; the maintainer ruled the fixtures correct and the tool
wrong (2026-07-16).

**Governing principle (maintainer):** the tool must never quote hardware for a rack the user
didn't declare. `racks = N` means exactly N physical racks; a dedicated network/spine rack is the
user entering `racks = N+1`, a stated input, never an inference. This is the concrete, pinnable
form of backtest B6's "rack count, not port demand, silently drives switch quantity" concern.

**Status:** rule stated now; the code fix is a Phase-2 defect (tracked as B6 in the invariant
suite's xfail inventory, pinned by fixtures A/B). Reasoning lives here; the current-state rule
lives in SPEC.md; the code catches up in Phase 2.

## 2026-07-15 — External code review (GAPS.md) round: 3-tier breakout-blindness, RA truncation, super-spine rung, catalog hygiene
A structured external review (`docs/GAPS.md`) of `engine.js`/`validate.js`/the catalog surfaced
several real, live bugs — verified against the actual code before merging, since the review
itself couldn't run anything.

**Breakout-blind 3-tier trigger (the round's top finding).** The 3-tier Clos trigger and pod-fold
math (`js/engine.js` step 3) compared leaf count against a spine's RAW native port count, not its
real breakout-credited capacity — even though that credited capacity was already computed
elsewhere (`grp.spineCount`'s own formula). Confirmed live: 520× `poweredge-ai` (65 AI leaves,
which fits flat within a 128-port breakout-adjusted radix) built a full unneeded 3-tier Clos AND
threw a false hard "OVER-COMMITTED" error. Fixed by using the breakout-adjusted radix for the
trigger and pod-fold cap, not just spine-count sizing (see [SPEC.md § AI switch selection](SPEC.md#ai-switch-selection--ai-spine-count--port-math)).

The review's own drafted fix ("drop the AI-only gate on the breakout credit — general/storage
spines need the same credit") was verified WRONG on live testing before merging: it compared a
spine's native speed against the fabric's HOST NIC speed, which only equals the real
spine-facing uplink speed for AI's folded-Clos design (same speed both hops, by construction).
For general/storage (e.g. a 25G host NIC riding a 100G leaf uplink) those are different hops
entirely — the naive fix credited phantom capacity with no cataloged breakout SKU behind it and
broke 7 real scenarios on first attempt. The CORRECT general/storage fix (built same-day,
user-directed): a new shared `resolveUplinkBreakout(spine, upSpeed, breakoutMode, nv)` helper,
using each fabric's REAL uplink speed (already known before the trigger runs) and validated
against the actual breakout catalog + the `breakout` input toggle. Confirmed live: 3000
general-purpose servers (80 leaves, Z9432F-ON spine, raw radix 32, but a cataloged 4× breakout the
BOM already prices) now correctly stays flat 2-tier; 10000 servers (262 leaves, genuinely beyond
even the credited radix) correctly builds 3-tier.

**Pattern-level finding: `resolveUplinkBreakout()` needed to be the ONLY caller of
`pickBreakout()`.** Fuzzing the fix above found two more real instances of the same underlying
mistake (implying a breakout ratio without validating it against the real catalog + toggle): (1)
even within AI, an implied ratio with no matching cataloged part (e.g. an 800G leaf under a 1.6T
spine) was still phantom-credited; (2) the pod-spine↔super-spine hop (step 5) had its own THIRD
separate inline breakout computation, found only by grepping every `pickBreakout(` call site —
and it had already drifted, never checking the `breakout:'none'` toggle at all. All three sites
now route through the one shared helper; a permanent static-source test
(`tests/unit-workflow.js`) asserts `pickBreakout(` has exactly one call site, so a future direct
call can't silently reintroduce the drift.

**Also found via fuzzing:** multiple AI (or PowerScale) targets of the SAME platform in one
design were silently colliding into a single shared spine group — the grouping key used the
platform id (`'poweredge-ai'`), not the per-target-instance id, so a design with two different GPU
models could size the shared spine off only whichever target happened to be first. Fixed by
keying on the unique per-instance id.

**Pod-spine↔super-spine breakout info never reached the port-budget checks.** The breakout ratio
for this hop was computed in a later pipeline step than the fabric record's own push to
`result.fabrics` — `validate.js`'s super-spine capacity checks (#13 warn, #22 error) always
computed capacity from the raw native port count, which could fire a false hard error on a
correctly-sized 3-tier design. Fixed by keeping a live reference to the pushed fabric record
(`fs._record`) so the later step can attach the real breakout info onto the SAME object
`validate.js` reads. `validate.js` check #13 (spine port-capacity warning) was also
breakout-blind on the leaf↔spine hop specifically (a spine genuinely using breakout warned "may
be short on ports" even when correctly sized); a dead `(cond ? 1 : 1)` ternary in check #22 was
also simplified while touching this code.

**`recommendRA()` silently truncated a requested node count to the RA's endorsed max, with zero
warning** — every RA's own scale note says larger clusters ARE possible ("REQUIRE additional
network switching"), so a rep could quote far fewer nodes than requested with no indication
anything was reduced. Fixed in both `recommendRA()` return branches (published-scaling path and
generic-scale path): the requested count is tracked separately, and a truncation warning fires
whenever it's clamped.

**GB300 NVL72 published path has zero rack-topology awareness — stop-gap only.** Every cable in
the published-scaling path (including cross-block leaf-to-spine links) is quoted as in-rack DAC
regardless of scale, even though the RA's own text says leaves "serve 2 racks" once a design spans
multiple SUs. A full rack-placement redesign of this path (threading `racks` through the way
`recommend()` already does) was explicitly out of scope for this round — added a stop-gap warning
at n>1 SU instead, so the gap is visible rather than silent. Real fix tracked as an open item.

**`pickSuperSpine()` missing a same-speed intermediate rung.** Before jumping straight to the
1.6TbE flagship, a pod-spine that outgrows its own radix now first checks for a same-speed,
higher-radix spine-role switch (Z9432F-ON → Z9664F-ON, both 400GbE) — verified against the real
catalog (`Z9664F-ON` exists, `roles:['spine']`, same access speed, radix 64 > 32). Keeps
pod-spine↔super-spine cabling same-speed/cataloged instead of forcing a cross-speed breakout that
may have no cataloged part. No equivalent exists for Z9864F-ON pod-spines or on the NVIDIA side
(SN5610→SN6810 is already a same-speed jump to the flagship) — both correctly fall through
unchanged.

**Catalog hygiene.** `rules.power.switchWatts` was missing wattage for `z9964f-on` (the 3U
flagship spine — genuinely undefined, since no matching `switchWattsByU[3]` fallback existed
either) and `sn5600d`; added both with real sourced figures (`corpus/txt/QRG-DC.txt`, Dell
Networking QRG June 2026) and a `[3]` floor fallback. `pickHostCable()`'s `adjacent`-placement
branch had a `first([aoc, dac])` fallback that could silently ship DAC on a cross-rack run (DAC is
documented in-rack-only reach) the moment either AOC catalog entry was ever renamed — removed,
matching this codebase's convention of returning `null` (caller warns) over silent substitution.
`discovery.js`'s ~11 "Verity" mentions renamed to "Dell Fabric Manager (DFM)" to match the
already-completed `solutions.js` rebrand; two previously-unprotected catalog couplings
(`solutions.js.fitsPains` → `discovery.painPoints`, `discovery.workloads[].platformSeed` →
`platforms.js`) got permanent regression tests.

Pulling real wattage figures also surfaced two citation conflicts unrelated to this round's actual
work — logged in `CITATION-LOG.md`, not silently resolved: the existing `z9964f-on` switching-
capacity figure (204.8 Tbps) doesn't match the same newly-consulted QRG document (102.4 Tbps), and
the existing `z9664f-on`/`z9432f-on` wattage entries don't match that document's own numbers
either.

16/16 suites + 126,000+ fresh fuzz designs clean across the round.

## 2026-07-15 — BaseT copper leaf: native RJ45, not fiber + module; nic2 purpose asked not assumed
**User challenge, with an actual generated BOM attached:** 60 servers with dual-port 10GBase-T +
dual-port 1GBase-T NICs, `fabricArchitecture:'converged'` selected, still produced S4348F-ON (a
10G FIBER leaf) for copper hosts and TWO separate leaf fabrics instead of one.

Root cause #1: `pickLeaf()` always routed BaseT (RJ45 copper) NICs to the SFP+ fiber ToR plus an
electrical SFP-1G-T/SFP-10G-T module — physically valid, but the catalog already had a fully
specced, completely unused native alternative (S4348T-ON). Fixed: BaseT hosts now route to
S4348T-ON with a plain Cat6A patch cable.

Root cause #2: the converged-merge bucketing key required an EXACT `gbps` match, so a mixed
1G+10G BaseT design still built two fabrics even under `converged` — even though S4348T-ON's RJ45
ports are natively multi-rate. Fixed: BaseT specs of any speed ≤10G now bucket together.

Root cause #3: a target's "second NIC type" (`nic2`) was hardcoded `network:'storage'` — a real
second NIC is just as often a second/legacy LAN. Combined with root cause #2, this blocked
convergence for a customer who explicitly asked for it. Fixed: `nic2.network` is now a real
customer-stated answer, asked at BOTH the Guided wizard's `nic2Network` step AND the Expert Form's
own separate second-NIC fields (`#f-nicb-network` — a genuinely separate code path from the
wizard's, missed on the first pass and only caught by an independent review).

A subsequent fresh fuzz sweep (not the review) then caught a real bug in THIS fix: the
converged-merge picks a representative contributor to source several fields, and when that
representative happened to be the SLOWER (1G) member, the merged fabric's numeric `gbps` — which
drives real uplink-port sizing — stayed at the slower value, silently under-provisioning uplinks
for a pool that also carried real 10G traffic. Fixed: the merged `gbps` is the MAX across
contributors. See [SPEC.md §0b](SPEC.md#0b-network-architecture-intent) and
[§7b](SPEC.md#7b-edge--access-campus--inter-network).

16/16 suites + 126,000+ fresh fuzz designs clean.

## 2026-07-13 — Network architecture is a real customer-intent question, not a mislabeled toggle
**Problem:** The tool was silently building separate leaf-switch fabrics for storage vs. compute
the moment both were combined. The one control that looked like it addressed this ("Share one
fabric across all targets?") only shared the SPINE tier — leaf switches were ALWAYS separate per
network, independent of that setting. The wording was actively misleading ("One fabric for both"
delivered two fabrics on one spine).

**Fix:** Replaced the boolean with the three-way `fabricArchitecture` input described in
[SPEC.md §0b](SPEC.md#0b-network-architecture-intent).

**Back-compat:** Legacy callers/saved designs that only set the old `separateFabrics` boolean map
onto their exact prior meaning (`true`→`separate`, `false`/absent→`sharedSpine`) — no break.

## 2026-07-13 — E3224F-ON + redundancy: stop pricing an impossible topology
No fiber-SFP E-series switch has a SONiC MC-LAG path today (E3224F-ON is OS10-only, absent from
the Enterprise SONiC compatibility matrix) — a real hardware/OS portfolio gap, not something the
tool should paper over. `recommendEdge()` previously priced 2× E3224F-ON **and** a full MC-LAG
ICL cable line as if the pair were deployable, only flagging the contradiction afterward in the
warnings list — a rep skimming the BOM tab could quote hardware for an impossible topology. Fixed:
the requested switch count still shows (labeled "REQUESTED — NOT achievable"), the ICL cable is
never priced, and the contradiction is a hard `error` — not silently resolved to VLT/OS10
(ground-truth-confirmed that's the wrong resolution; this edge line is deliberately SONiC-only,
no VLT/stacking). A later independent review found a live self-contradiction in this same fix
(the "deployed as N pairs" copy sitting next to the error saying that's not possible) that fed
into sales-pitch text — fixed in the same pass. See
[SPEC.md §7b](SPEC.md#7b-edge--access-campus--inter-network).

## 2026-07-13 — 100G general/storage spine: missing native-100G rung
`pickSpine()`'s 'general' branch previously jumped straight from S5232F-ON to Z9432F-ON with no
native-100G rung between them — any design crossing 8 leaves at 100G paid for 400G-breakout
complexity (and, at 33-64 leaves, could be pushed into an unnecessary 3-tier Clos, since
Z9432F-ON's own native radix is only 32) it never needed. Fixed: Z9264F-ON (64×100G native, ≤64
leaves) inserted as the intermediate rung. Explicit `breakout:'on'` still routes straight to
Z9432F-ON/beyond. See [SPEC.md § 100G general/storage spine selection](SPEC.md#100g-generalstorage-spine-selection).

## 2026-07-13 — NVIDIA AI switch selection + AI spine count = port math
**User challenge:** "I don't think the AI cluster spine should be a SN4700." Confirmed: SN4700
(Spectrum-3, 32×400G) had been the pick for BOTH leaf and spine tiers of everything under 800G,
forcing 10-leaf/13-spine builds where 3+2 was right. Fixed: 400G AI rails now ride Spectrum-4
SN5600 for both leaf AND spine, grounded in the GB200 NVL72 RA ("Each SU features two SN5600
switches as the aggregation layer or spine layer") and the GB300 NVL72 RA. SN4700 remains the
economical ToR for lower-speed host fabrics (25/100G via breakout) in an all-NVIDIA stack.

Separately, AI spine COUNT had been `spineCount = uplinksPerLeaf` — one spine PER UPLINK, pricing
64× Z9864F spines for 16 leaves at 1024 rails where the FDC AI export wires the same leaves with 2
(its minimal-wiring default) and the actual port math says 8. Fixed to real port math:
`ceil(total uplinks ÷ breakout-adjusted spine radix)`, clamped to `[2, uplinks/leaf]`. See
[SPEC.md § AI switch selection](SPEC.md#ai-switch-selection--ai-spine-count--port-math).

## 2026-07-13 — Edge/campus: E-series has TWO uplink classes, not one
**User correction:** "E3248P has 4 10GbE uplinks and 2 100GbE uplinks, and E3248PXE has 4 25G
uplinks and 2 100GbE — depending on the switch and situation it can uplink at either." The tool
had been treating the 4× SFP ports as ICL-only and 100G as the only way up. Fixed: every E3200
access switch now models BOTH uplink classes; whichever class is NOT uplinking carries the MC-LAG
ICL. The distribution radix ladder was also missing its Z9264F-ON rung (same root cause as the
100G general/storage spine fix above) — a design past 28 access switches jumped straight to the
400G-breakout Z9432F-ON tier. See [SPEC.md §7b](SPEC.md#7b-edge--access-campus--inter-network).

## 2026-07-13 — 10G fiber leaf: S41xx replaced by S4348F-ON (end of sale)
The S41xx series (S4148F-ON, S4128F-ON, S4112F-ON — SmartFabric OS10, Broadcom Maverick) is end of
sale. The tool now never quotes it: the ≤10G fiber leaf rung picks S4348F-ON (Broadcom Trident3-X5,
Enterprise SONiC). S4148F-ON stays in the catalog flagged `eol:true` for brownfield recognition
only.

## 2026-07-13 — Standalone optics, patch cables & third-party interop standardized
Formalized the "two optics per fiber link when we own both ends" accounting (switch↔switch hops =
1 line at 2/link; structured host runs = 2 lines at 1/link each, since the NIC end needs its own
compatibility check), the patch-cord connector-follows-the-optic rule (MPO for parallel optics, LC
for duplex), the long-reach ladder (SR/SR4 → FR/CWDM4 → LR/LR4 → coherent ZR/ZR+), and the
third-party interop rule (same PMD both ends, Dell only quotes its own side). See
[SPEC.md §9](SPEC.md#9-optics--cabling).

## 2026-07-10 — Multi-rack deployment pattern verified across all FDC exports
Confirmed and documented the FDC (Fabric Design Center) `rack_topology` pattern: every node rack
gets its own ToR MC-LAG pair + OOB switch, spines live in a dedicated spine rack, hosts pack
≈16/rack, cross-rack runs step up from DAC to AOC/fiber. See
[SPEC.md § Multi-rack deployments](SPEC.md#multi-rack-deployments-fdc-rack_topology-pattern).

## 2026-07-09 (v0.12.0) — Audit decisions ratified
User-ratified the standing audit decisions now in [SPEC.md §11](SPEC.md#11-audit-decisions):
PowerScale back-end always gets its own dedicated spine group; small AI clusters use a single
switch/pair with no spine until a real threshold is crossed; the AI fabric stack (Dell or NVIDIA)
must be an explicit choice, never a default; shared-vs-separate storage/server fabrics is a user
option (later superseded by the fuller `fabricArchitecture` three-way question, 2026-07-13).

## 2026-07-09 — Gap audit resolved against H16346.8 + H18364.2
**PowerScale back-end supported switch — RESOLVED (no conflict).** H16346.8 Table 4 (p.14) lists
the supported back-end switches; the engine's sized S5232F-ON is on that list, alongside
Z9664F-ON and Z9264-ON (Dell), plus Arista 7308X3 and NVIDIA Spectrum-4 SN5600 (via the Dell ETC
program). EOL for back-end: Z9100-ON, S4148F-ON, S4112F-ON.

**Spine COUNT is derived, not fixed — GAP FIXED.** H18364.2 p.10: 32×25GbE servers = 800GbE → 8
spines for 1:1, 4 for 2:1, 2 for 4:1; a leaf connects to 2–8 spines. The engine now sets spine
count from uplinks-per-leaf (floor 2, ceiling 8) instead of a fixed pair.

**Cross-checks that matched (no change):** PowerFlex DG (h19678.3) — leaf oversub ≤ 2:1, MTU 9216.
PowerFlex networking max ≈ 352 nodes / 22 nodes per leaf pair (sizing anchor).

**Gap noted at the time, since closed:** this audit flagged PowerEdge MX7000 Scalable Fabric
(MX9116n FSE / MX7116n Fabric Expander / MX5108n) as a modular attach model not yet in the
catalog. Built in a later round (v0.53.0) — see the project root `CHANGELOG.md` for that work; the
platform is now in `platforms.js`. (The original gap-audit text calling this "not yet modeled" was
stale and has been removed from SPEC.md, not carried forward as if still true.)

*Conflicts resolved in this and the surrounding rounds: MTU 9000→9216; leaf oversubscription
3:1→2:1; RoCE + DCQCN + ARS/DLB; redundancy OS-aware (VLT=OS10-only, SONiC=EVPN-MH/MC-LAG); no-mix
Dell/NVIDIA per fabric; PowerScale back-end dedicated; small-AI single-switch; AI stack forced
pick; optics by placement (DAC/AOC/optical); breakout port-math; traffic-driven oversubscription;
spine count 2–8 from oversub math.*

## v0.18.x — Switch capacity convention resolved
Dell PowerSwitch spec sheets publish full-duplex switching capacity; NVIDIA Spectrum publishes
single-direction. Catalog corrected to match each vendor's own spec-sheet convention (Dell
Z-series corrected to full-duplex: Z9432F 25.6, Z9664F 51.2, Z9864F 102.4, Z9964F 204.8 Tbps —
S-series already were; NVIDIA left as-is: SN4700 12.8, SN5610 51.2). Display-only; sizing uses
ports, not Tbps. *(Note, 2026-07-15: the Z9964F 204.8 Tbps figure has since been found to conflict
with a different Dell QRG document — see `CITATION-LOG.md`, not yet reconciled.)*

## v0.16.0 — Optics & cabling captured in every guide; sizing intent formalized
Cable-class-by-placement (DAC/AOC/optical), connector-by-speed, and breakout port-math folded into
every guided journey, not just the Expert form. Oversubscription formalized as the single lever
that decides "sized right" — traffic pattern → target ratio → uplinks-per-leaf, non-blocking
(1:1) defined as uplink BW ≥ access BW, and AI's folded-Clos half-down/half-up split documented as
its own case. See [SPEC.md §9](SPEC.md#9-optics--cabling) and
[§10](SPEC.md#10-sizing-intent--oversubscription-is-where-sized-right-is-decided).
