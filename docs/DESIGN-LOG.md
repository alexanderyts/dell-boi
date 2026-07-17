# Design-rule changelog

Append-only, dated, newest-first. Each entry says what changed in [SPEC.md](SPEC.md), why, and
what was wrong before — the reasoning that doesn't belong mixed into a current-state rule
statement. This is a companion to `SPEC.md`, not a replacement for the project root's
`CHANGELOG.md` (which tracks user-facing version releases); this file tracks *design-rule*
history specifically, so a maintainer can answer "why does SPEC.md say X" without diffing git
blame across a dozen commits.

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
