# R14 — Work Order

> **SUPERSEDED AND CLOSED — 2026-07-23.** This document was shared inline at the start of a
> session (never previously committed to the repo — saved here now, after the fact, so the
> citations to it elsewhere in this repo point at a real file instead of a phantom one). It was
> grilled against the live code before implementation (`/grill-with-docs`) and found to rest on
> a **false premise**: §RULED D1 below claims the engine "silently hardcodes SONiC for NVIDIA
> fabrics" — the code already stated NVIDIA Spectrum runs Cumulus, deliberately, since ruling
> v0.29.0. §MECHANICAL was NOT implemented as written. The actual work shipped as 4 slices
> (v0.65.5 → v0.66.0 → v0.66.1 → v0.66.2); full reasoning for what changed and why is in
> **`docs/DESIGN-LOG.md`, entries dated 2026-07-23 / 23b / 23c / 23d** — that is the authoritative
> record, not this file. §RULED D3 and D4 survived largely as specified (D4 landed once its
> dependency — a real engine defect this document never mentions — was fixed in Slice 1). §RULED
> D1/D2 were superseded: DFM applicability became a per-model catalog fact (`nosSupported`/
> `dfmVerify`), not the `nvidiaNos` wizard input D2 specifies. Kept below verbatim as the
> historical record of what was proposed, not what shipped.

*Produced by the R14 prep + design session (research/design only — no `js/` changes were made
here). The follow-on Claude Code session implements §MECHANICAL verbatim. Decisions in §RULED are
settled; do not re-open them. §DEFERRED items are explicitly punted with their trigger.*

Base state at hand-off: **v0.65.4**, suite 19/19 green, tree clean. Queue verified against repo
state per CLAUDE.md's stale-queue warning (version.js, git log, GAPS.md all agree) — R14 is
genuinely next; nothing stale, nothing blocked.

---

## §RULED — decisions made this session (rationale, one line each)

**R14-D1 — DFM applicability is NOS-gated, not vendor-gated.** DFM (Dell Fabric Manager =
BE Networks Verity/Satori/SensAI; **not** SmartFabric Manager) attaches only to fabrics that run
**SONiC**; it is **never** attached to an NVIDIA fabric running **Cumulus**.
*Evidence:* Dell's own white paper `AI-SPECTRUM` Ch.4 names **BE Networks Verity** as an
orchestration option for NVIDIA-Spectrum-on-**Dell-SONiC** ("push only hardened, validated SONiC
images from the Verity repository"); Verity's 360-page docs `MG-VERITY-DOC` carry a Spectrum-X
fabric type (§4.7.10) — **but "Cumulus" appears zero times** in any DFM/Verity source, while it is
a real NVIDIA NOS in the corpus (`NV-SN4700` datasheet: "Cumulus Linux and Pure SONiC";
`AI-OPENSHIFT`: "all switches run NVIDIA Cumulus"; `ST-PS-BACKEND`: Spectrum-4 on "Cumulus Linux
5.9.1"). So DFM manages Spectrum only under SONiC; under Cumulus there is no support claim to stand on.

**R14-D2 — NVIDIA-stack NOS becomes a real input (Dell SONiC vs NVIDIA Cumulus).** Today the schema
cannot express Cumulus (`nos` is `'sonic'|'os10'` only) and the code silently hardcodes SONiC for
NVIDIA fabrics — an unstated guess. R14-D1 cannot be enforced without this fork being knowable, so
it is promoted from assumption to an explicit input.
*Rationale:* the SONiC/Cumulus choice is quotable and license-affecting, and it is the exact
predicate the DFM gate reads.

**R14-D3 — every switch BOM line states its assumed NOS.** A quote must say what each switch line
runs, because it is license-affecting and (for NVIDIA) drives whether DFM even applies.

**R14-D4 — the two look-alike core-reach questions merge into one 3-way "distance" question
(Wording 1).** One question sets both `coreType` and `coreReach`; it preserves every real
combination and removes the impossible `dci`+short one. Resolves the R16-sweep flag (two
near-duplicate reach questions back-to-back in the guided wizard).

**Implication flagged for confirmation (see DEFERRED-1):** R14-D1 as written ("only on SONiC
fabrics") also means a **Dell-stack fabric on SmartFabric OS10** should not get DFM auto-attached —
OS10 is not SONiC, and the DFM pitch itself frames OS10 as the thing customers *migrate off* onto
SONiC. Only the NVIDIA case was explicitly on the table this session, so the OS10 consequence is
called out, not silently shipped (standing rule 3).

---

## §MECHANICAL — implementation checklist for the Code session

Recommended model for this session: **Sonnet** (mechanical wiring + refactor + tests + a known,
specified fix — no new design rulings). Standing rules apply: tests land in the SAME commit as the
change they protect (rule 1); regression-verify each change by stashing the fix alone and
confirming the named assertions go red before trusting it; every new input must appear in the
input-effect/coverage tests.

### M1 — Add the NVIDIA-stack NOS input (`nvidiaNos`)
- **`docs/contracts/INPUT-SCHEMA.md` §1.1:** add row
  `` `nvidiaNos` | `'sonic'` \| `'cumulus'` | default `'sonic'` | SIZING `` — "NOS running on NVIDIA
  Spectrum switches; drives the per-line NOS statement (M3) and DFM applicability (M2). Only
  meaningful when `stack === 'nvidia'`." Global (matches `stack`'s no-mix, fabric-wide scope).
- **`js/wizard.js`:** add a `choice` question shown only when the AI stack is NVIDIA
  (`showIf: s => s.stack === 'nvidia'`), placed on the AI-stack path (near the `stack` question,
  ids around 276/365/692):
  - `q:` "Which NOS runs on the NVIDIA Spectrum switches?"
  - options: `{ v:'sonic', label:'Dell Enterprise SONiC (recommended)', desc:'Dell-sold Spectrum — DFM-manageable' }`,
    `{ v:'cumulus', label:'NVIDIA Cumulus Linux', desc:'NVIDIA-managed — DFM does not apply; use NetQ' }`
  - `default: 'sonic'`, `help:` "Cumulus vs SONiC is license-affecting and decides whether Dell
    Fabric Manager can manage this fabric."
  - add `nvidiaNos: 'NVIDIA NOS'` to the label map (wizard.js:814).
- **Thread it through** the `rec(...)` input objects that currently hardcode `nos:'sonic'` for the
  AI/expert path (e.g. wizard.js:983) so `nvidiaNos` reaches the engine; Dell-stack `nos` behavior
  is unchanged.
- **Test:** input-effect coverage row for `nvidiaNos`; a case proving `'cumulus'` vs `'sonic'`
  changes output (the DFM line in M2 and the NOS statement in M3).

### M2 — Gate the DFM attach on SONiC (R14-D1)
- Single predicate, e.g. `fabricRunsSonic(input)`:
  - Dell-stack: `input.nos === 'sonic'`  *(OS10 → false — see DEFERRED-1; if the maintainer has not
    yet confirmed the OS10 extension, scope this predicate's Dell branch to `true` and gate only the
    NVIDIA branch — leave a `// DEFERRED-1` marker so the OS10 tightening is a one-line change.)*
  - NVIDIA-stack: `input.nvidiaNos === 'sonic'`
- **`js/wizard.js` `addVerity(res)` (~904) and its call sites (~987/1002/1022):** attach the DFM
  bomLine only when `fabricRunsSonic(input)` is true, in addition to the existing `verity !== 'no'`
  rep toggle. When suppressed on an NVIDIA-Cumulus design, push an info line: "Dell Fabric Manager
  not applicable — this fabric runs NVIDIA Cumulus; DFM manages SONiC fabrics only."
- **Test:** NVIDIA+Cumulus design → **no** DFM bomLine (+ the info line present); NVIDIA+SONiC and
  Dell+SONiC → DFM line present. Stash-verify: reverting the gate re-adds the DFM line to the
  Cumulus case (assertion goes red).

### M3 — Per-switch NOS statement on every Switch line (R14-D3)
- Applies to all `category:'Switch'` `addLine` sites: leaf (engine.js~1070), pod-spine (~1397),
  super-spine (~1412), border-leaf (~1491).
- Classify by catalog: a switch is **NVIDIA Spectrum** iff `CATALOG.switches[model].npu` starts with
  `'NVIDIA Spectrum'` (e.g. `'NVIDIA Spectrum-4'`); Dell otherwise.
- NOS string:
  - Dell + `nos==='sonic'` → `Dell Enterprise SONiC`
  - Dell + `nos==='os10'` → `Dell SmartFabric OS10`
  - NVIDIA + `nvidiaNos==='sonic'` → `Dell Enterprise SONiC (on NVIDIA Spectrum)`
  - NVIDIA + `nvidiaNos==='cumulus'` → `NVIDIA Cumulus Linux`
- Append to each switch line's `note` as ` · NOS: <string>` (or a dedicated `nos` field on the line
  if the renderer prefers a column — keep one representation, read by both BOM and any invariant).
- **Test:** one assertion per branch (Dell-SONiC, Dell-OS10, NVIDIA-SONiC, NVIDIA-Cumulus) that the
  switch line carries the exact NOS string.

### M4 — Merge the two core-reach questions into one 3-way question (R14-D4, Wording 1)
- **`js/wizard.js`:** in the **guided main path**, remove the `coreReach` block (~465–472) and the
  `coreType` block (~479–486); replace with ONE question (id `coreDistance`, same `showIf: s => s.core && s.core !== 'none'`):
  - `q:` "How far is the core you're uplinking to?"
  - `{ v:'room',     label:'Same room / rack / row',                         desc:'Short-reach optics' }`
  - `{ v:'building', label:'Elsewhere in the same building (long cable run)', desc:'10km LR single-mode' }`
  - `{ v:'offsite',  label:'Different building / campus / metro',            desc:'DCI-class uplink' }`
  - `default: 'room'`
- **Mapping** (apply where `rec(...)` reads these, ~999/1081/1083):
  - `room`     → `coreType:'core'`, `coreReach:'short'`  (→ engine `coreReach:'auto'`)
  - `building` → `coreType:'core'`, `coreReach:'long'`   (→ engine `coreReach:'longreach'`)
  - `offsite`  → `coreType:'dci'`,  `coreReach:'long'`   (→ engine `coreReach:'longreach'`)
- **Scope:** guided main path only. The **refresh** path (~660) has a `coreReach` question but **no**
  `coreType`, so there is no duplication there — leave it unchanged.
- Update the label map / any input-effect test that referenced `coreType`/`coreReach` as separate
  wizard questions.
- **Test:** each of the 3 answers yields the expected `(coreType, coreReach)` pair; assert the
  `dci`+short combination is unreachable from the wizard.

### Cross-cutting
- Run the full harness before and after (rule: hard-fail suites). Suite must return to green with
  the new assertions added.
- CHANGELOG.md: bump to **0.66.0** (new capability — new input + applicability rule), plain-language
  "what this means for a quote" entry.
- GAPS/DESIGN-LOG: log R14 closure with the R14-D1..D4 rationale and the DEFERRED-1 trigger.

---

## §DEFERRED — explicitly punted, with trigger

**DEFERRED-1 — DFM on Dell-stack OS10 fabrics.** R14-D1's "SONiC-only" logic implies DFM should not
auto-attach to a Dell fabric running SmartFabric OS10 (OS10 is not SONiC; DFM is its migration
*target*, not its manager). Not explicitly ruled this session. **Trigger:** maintainer confirms
"yes, suppress DFM on OS10 too" — flip the Dell branch of `fabricRunsSonic` from `true` to
`nos==='sonic'` (one line; marker left in M2).

**DEFERRED-2 — corpus hygiene: `MG-VERITY-SS` is contaminated.** `docs/sources.csv` lists
`MG-VERITY-SS` as the "Verity for Cloud Spec Sheet," but the harvested text is an unrelated
Melbourne **film/TV production company** (beyondedge.com), not BE Networks. It backs no current
citation and must not be cited. **Trigger:** next corpus intake — re-harvest the real Verity spec
sheet or drop the row; until then all DFM claims rest on `MG-DFM-BENET` + `MG-VERITY-DOC` (both good).

**DEFERRED-3 — DFM support for the specific Spectrum model `SN4700`.** The corpus places DFM/Verity
management on Spectrum **SN5600/SN5610/SN2201 under Dell SONiC** (`AI-SPECTRUM`); it does **not**
independently confirm the tool's `SN4700` (whose datasheet defaults to Cumulus) as a Dell-SONiC,
DFM-managed device. Not blocking (R14-D2's input lets the rep declare the NOS). **Trigger:** a
Dell DVD/DRD or spec sheet that names SN4700 under Dell SONiC.

---

## One-line opener for the Code session

> Implement `docs/R14-WORKORDER.md` §MECHANICAL verbatim on `js/` — SONiC-gated DFM attach (R14-D1),
> the `nvidiaNos` SONiC/Cumulus input (R14-D2), a per-switch NOS statement on every switch line
> (R14-D3), and the merged 3-way core-distance question (R14-D4). Tests land in the same commit;
> stash-verify each; run the full harness before and after; do not re-open any §RULED decision.
> Recommended model: **Sonnet**.
