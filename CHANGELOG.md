# Changelog — Dell Networking BOM Advisor

Versioning (pre-1.0): **MAJOR.MINOR.PATCH**
- **MAJOR (X.0.0)** — reserved for the first production-ready release (a `1.0`).
- **MINOR (0.X.0)** — a new capability or significant change.
- **PATCH (0.0.X)** — a fix or small iteration within a minor version.

Current version: **0.66.1**

---

## 0.66.1 — Dell Fabric Manager now attaches (or doesn't) per the actual switches quoted (2026-07-23)

**What this means for a quote:** Dell Fabric Manager (DFM) used to attach to a design whenever
the rep toggled it on, full stop — regardless of what was actually being quoted. Now it checks:
- **An all-NVIDIA-Cumulus/Pure-SONiC design no longer gets a DFM line at all.** It gets an info
  line instead, explaining DFM doesn't apply and pointing at NVIDIA NetQ/NVUE.
- **A design built on SN5600, SN5610, or SN2201** — the three NVIDIA switches Dell's own
  documentation names as Dell-SONiC-capable — still gets DFM, with a note flagging that those
  models aren't yet on Dell's official compatibility list (verify before finalizing).
- **A mixed design** (some DFM-manageable switches, some not) still gets DFM, and the scope
  warning on the quote now correctly names only the switches DFM genuinely doesn't cover —
  previously it would have wrongly flagged an SN5600/SN5610/SN2201 as out of scope too.
- **The DFM value card on the BOM tab** (the "N Dell switches, one console" pitch) had the exact
  same miscounting bug, found and fixed in the same pass — it would have told a rep DFM doesn't
  cover switches the line right above it says it does.

**Reconfirm:** any existing quote with an all-NVIDIA-Cumulus design and DFM manually attached
should be revisited — that combination no longer auto-attaches, and the rep should confirm
whether DFM genuinely belongs on that quote.

---

## 0.66.0 — OS10 dropped; every switch line states its NOS; NVIDIA "SONiC" corrected (2026-07-23)

**What this means for a quote:**
- **SmartFabric OS10 is no longer offered as a network-OS choice on any new quote.** The
  maintainer ruled it end-of-sale ("OS10 shouldn't be quoted, it's end of sale"). New Dell
  switches are always Dell Enterprise SONiC, redundancy is always MC-LAG — the "Which network
  operating system?" question is gone from both the guided wizard and the Expert Form. VLT/OS10
  wording still appears, but ONLY when describing a customer's EXISTING switches in Refresh mode
  — never a new design. **E3224F-ON stays quotable** for fiber edge (it's the only fiber-SFP
  E-series model and there's no substitute) but its BOM line now says so plainly: "SmartFabric
  OS10 — end of sale; no Enterprise SONiC path on this model." Before this fix its line
  incorrectly claimed "Dell Enterprise SONiC" like every other edge model, which was never true
  for this one.
- **Every switch line on the BOM now states its NOS.** Leaf, pod-spine, super-spine, and
  border-leaf lines all carry a `· NOS: ...` statement, read from the catalog rather than
  guessed. NVIDIA Spectrum switches state what they can actually run: NVIDIA Cumulus Linux or
  NVIDIA Pure SONiC on every model, PLUS a verify-flagged Dell SONiC path on exactly three models
  — SN5600, SN5610, SN2201 — the only ones Dell's own documentation (H04658, "AI Fabrics with
  NVIDIA Spectrum and Enterprise SONiC") names as "Dell PowerSwitch ... with Dell SONiC."
- **Corrected a mislabeling:** the catalog previously described every NVIDIA Spectrum switch as
  running "NVIDIA Cumulus Linux / SONiC" — which reads as if the SONiC there is Dell's. It's
  actually NVIDIA's own **Pure SONiC**, a different, community-built distro with no Dell Fabric
  Manager support. Corrected on all seven Spectrum models.

**Root cause, worth knowing:** this whole slice started from grilling a prior session's R14 work
order, which read that old catalog string and concluded Dell Fabric Manager applied to every
NVIDIA switch — it doesn't. See `docs/DESIGN-LOG.md` (2026-07-23) for the full account, including
a real bug found and fixed mid-implementation: the per-switch NOS statement was silently getting
dropped whenever two networks shared the same switch model on the BOM (the merge logic rebuilds
that line's note from scratch and was discarding anything appended to the original) — fixed at
the root in `addLine()`, not papered over.

**Reconfirm:** nothing on an already-quoted BOM changes hardware — this is disclosure and one
dropped question, not a resizing. A quote built with OS10 forced via a non-UI path (API/test use)
now silently produces Enterprise SONiC/MC-LAG hardware instead.

---

## 0.65.5 — DCI core uplinks could be quoted with short-reach optics (2026-07-23)

**What this means for a quote:** a rep who told the tool the core uplink was a **longer run —
different building / campus / metro** (DCI-class), but left the "same room / long run" reach
question at its default, got the DCI note on the BOM but the **wrong optic** — a 2 km short-reach
part, not the 10 km long-reach part a metro link actually needs. Every quote built this way (via
the guided wizard's DCI question, added last session, or the Expert Form's separate `coreType`/
`coreReach` controls) was affected if the reach question wasn't also touched.

**Root cause:** `engine.js`'s DCI-forces-long-reach logic checked `coreReach !== 'auto'` — but
`coreReach` only ever has two values, `'auto'` or `'longreach'` (per `INPUT-SCHEMA.md`), so that
condition could only be true when `coreReach` was *already* `'longreach'`, which had already
satisfied the check one clause earlier. The DCI clause has never actually changed the outcome
since it was introduced. Found and fixed same-day via a design-grilling session on the (unrelated)
R14 work order — the fix is a one-line correctness change: `coreType:'dci'` now forces long-reach
unconditionally, with no dependency on what the reach question was left at.

**Also found while stash-verifying the fix:** the first version of the regression test for this
used a loose `/LR4/i` text match — which passed even under the *unfixed* buggy code, because the
short-reach optic's own catalog description contains the substring "(LR4 for 10km)" as a
comparison note. Narrowed to match the actual optic model instead of a substring, per standing
practice of stash-verifying every fix (revert the fix alone, confirm the assertion goes red).

**Reconfirm:** any existing quote with a DCI-class core uplink (built before today) should be
re-checked — the core optic may need to change from short-reach to long-reach if the customer's
actual distance requires it.

---

## 0.65.4 — Guided-wizard reachability gaps closed; two hardcoded assumptions now disclosed (2026-07-17)

**What this means for a quote:** four small gaps found in last session's reachability sweep are
now closed:
- The guided wizard can now select a **DCI-class core uplink** (a longer run to another
  building/campus/metro) — previously only the expert form could do this, and every wizard-built
  core uplink silently defaulted to same-building/core class.
- The guided wizard's **Edge / access** category, and Discovery's **Edge / campus / IoT** path,
  now **state their assumptions on the BOM** ("Edge sized with defaults: 1G PoE+ access, 100G
  uplinks, new redundant distribution pair — use the Edge Form for full control") instead of
  silently picking defaults with no visibility. Nothing about the hardware changed — only whether
  the rep can see what was assumed.
- Discovery mode's lack of a core-uplink question is now documented as intentional (SPEC.md),
  not an open gap.
- A new warning: designs with **2+ AI targets** now flag that the rail-NIC-cage answer is shared
  across all of them — verify the rail splitter part per target if the GPU NIC generations differ.

**Nothing to reconfirm on past quotes** — no hardware changed. This is visibility and one new
optional question, not a BOM correction.

---

## 0.65.3 — Refresh quotes could promise a core uplink and price zero hardware for it (2026-07-17)

**What this means for a quote:** in Network Refresh mode, choosing "No — keep the existing core
for now" (access-only refresh, uplink to what is there) produced a BOM with **no uplink cabling
priced at all** — the option text promised a connection to the existing core, but the hardware to
make that connection was never on the quote. Fixed: three new questions ask whether to price that
uplink, what the existing core runs (Dell or another vendor), and whether it's a short in-room run
or a long-haul link to another building — reusing the exact same question flow the main guided
wizard already uses for this. If you decline, nothing changes (still access-only, still unpriced
on purpose). If you accept, the uplink cabling is priced, and if the core is Dell, the matching
far-side optic is quoted too.

**Nothing to reconfirm on past refresh quotes that included a new distribution/aggregation tier**
— that path was never affected. This only applies to access-only refreshes that keep the
customer's existing core.

---

## 0.65.2 — A merged switch line could hide that PowerScale's backend network was isolated (2026-07-17)

**What this means for a quote:** if PowerScale frontend and backend leaves happened to land on
the same switch model (common — both often size to S5232F-ON), the BOM showed one combined line
like "4× S5232F-ON, frontend" with no mention that 2 of those 4 are the backend switches — the
ones Dell requires to sit on their own dedicated, physically-separate network. The switch count
was always correct; the note was silently describing only one of the two networks. Fixed: a
merged line now reads "4 total — 2× frontend, 2× backend (dedicated, physically separate)" so the
isolation requirement is visible on the line that prices it. Same fix applies wherever any two
networks' leaf ladders happen to land on the same model, not just PowerScale.

**Nothing to reconfirm on past quotes** — the hardware and quantities were always right; only the
BOM line's wording is different going forward.

---

## 0.65.1 — MX7000 chassis quotes carried half the uplink optics they needed (2026-07-17)

**What this means for a quote:** if you quoted a PowerEdge MX7000 chassis, the BOM gave you **4**
external uplinks per chassis. The real number is **8** — each MX9116n Fabric Switching Engine has
4× 100GbE Ethernet uplink ports, and an HA chassis runs 2 of them (one per fabric slot). Every
MX7000 quote was short by half its uplink optics and would not have built as printed. Fixed.

**One thing to confirm when you quote it:** 2 of the 4 ports per FSE are *unified* — they run
Ethernet **or** native Fibre Channel, not both. The 8 assumes Ethernet on all of them. If the
customer is using those ports for FC, the number drops back to 4. The tool now says so on the
MX7000 line and in its confirm-before-quoting list.

**How it got caught:** this was tracked as G-006 since the first audit and had been sitting open
because the closure standard was "check the MX9116n spec sheet" — a document that appears not to
exist (Dell publishes this platform's port layout in its deployment guides instead). Two of those
guides, four years apart (H18548.9.2 June 2026 and H19120 March 2022), state the port layout in
identical terms; that's now the citable source. See `docs/DESIGN-LOG.md` 2026-07-17 for the
reasoning, including why a blocked-forever evidence standard is its own kind of bug.

---

## 0.65.0 — R12: optics must physically fit the port; sizing may not credit phantom links (2026-07-16)

**What this means for a quote:** the tool used to hand you cables that cannot be plugged in. It
matched on SPEED alone and never checked the connector, so a 400G optic could be quoted off a switch
whose ports only take 100G, and a QSFP-DD cable could be quoted into an OSFP port. Those BOMs looked
fine and would have failed at the rack. Impossible combinations are now a **hard error** that says
what to do instead. Four such defect classes were found — two known, two new.

**New capability**
- **Optic ↔ port form-factor checking.** A cage-compatibility table (a VENDOR FACT, cited to the
  Dell spec sheet + NVIDIA LinkX) now sits in the catalog and is read by BOTH the engine at pick
  time and a final-BOM sweep, so they cannot disagree. SFP-into-QSFP correctly requires a QSA28
  adapter and says so.
- **New parts:** S56DD-100G-SR1.2 / -FR / -LR (the S5448F-ON's 100G ports are SFP56-DD, and Dell's
  own spec sheet says QSFP28 optics "will not work" in them — we were quoting QSFP28 anyway).
  MCP7Y00 and MCP7Y10 are now separate parts, because they differ by the NIC's connector.
- **New question:** "What connector do the GPU rail NICs use?" (OSFP / QSFP112 / not sure) — asked
  only when it actually changes the part. "Not sure" quotes one variant and flags it to verify
  rather than blocking.

**Corrections to what gets quoted**
- NVIDIA AI: rail cabling on SN5600/SN5610 was MCP1660-W0xx, a QSFP-DD DAC quoted into OSFP cages —
  1152 wrong parts on a GB300 NVL72 BOM. The GB300 RA now cables per its own published document
  (dual-ported MMA4Z00-NS at the ConnectX-8 OSFP port); the computed path uses the MCP7Y00/Y10 1:2
  splitter chosen by the NIC connector.
- **1 splitter = 2 rails.** Splitter/breakout lines are no longer quoted one-per-link; the line
  shows its own arithmetic so the quantity and the note can't drift apart.
- Dell AI: 400G QSFP-DD DACs were being quoted into Z9864F-ON OSFP112 ports.
- 400G core uplink off a 100G-port switch now errors with both fixes named (turn on the border-leaf,
  which uses a switch with real 400G ports — or drop the uplink to 100GbE). It never silently
  changes what you asked for.

**Sizing corrections (AI fabrics)** — these change switch counts on large AI designs:
- Inter-switch hops between same-cage switches now run at **native port speed** (an 800G switch pair
  links at 800G). The old 400G leaf↔spine had no cataloged part behind it, so its capacity was
  imaginary. Same bandwidth, buildable links.
- A breakout is only credited when a real part with the correct far end exists; a super-spine is
  only chosen if it can actually terminate the links below it. A 520-server AI design moves from
  flat 2-tier to 3 pods + 48 super-spines — the old shape depended on ports that didn't exist.
  A 1024-rail design still sizes to 8 spines, now derived honestly.
- Where a bigger switch is passed over for lack of a cataloged connection, the BOM says so — a wide
  tier reads as a parts decision, not an error.

**Verification**
- PowerStore's MC-LAG + ICL requirement is now corpus-backed (H18157.11) and confirmed verbatim.
- `package.json` version drift (stuck at 0.55.0 for several releases) fixed — now tracks
  `js/version.js`.
- Suite 19/19 green, xfail 0. Six tests were re-ruled (not relaxed) because they had encoded the
  phantom sizing; each carries its reasoning. See `docs/DESIGN-LOG.md` 2026-07-16d.

---

## 0.64.1 — GAPS.md closeout: G-011 fixed (last confirmed-live code bug) (2026-07-15)
Small follow-up PR closing G-011, the one gap the v0.64.0 reconciliation pass flagged as still
genuinely open rather than force-closing to match the work order's target list. On the GB300 NVL72
published RA path, `validate.js` checks #13/#22 recomputed `totalLeaves × uplinksPerLeaf` for
spine port-budget math, which can diverge from the actual priced "leaf-to-spine" cable quantity
for certain node counts (`uplinksPerLeaf` is a per-leaf ceiling that doesn't divide evenly for
every `n` — confirmed at n=7: computed 1024 vs. actually cabled 1008). Fixed per the same principle
as the earlier breakout fixes: both checks now prefer the engine's already-resolved
`f.uplinkCableQty` field over recomputing it, falling back to the recomputation only when that
field is absent. Regression test sweeps every `n` from 1 to `maxGpuNodes` on every published RA in
the catalog (not spot-checked values) — this is the test that would have caught the bug
originally, and it guards any future RA added with a `published()` function. 17/17 suites, fresh
fuzz clean.

## 0.64.0 — Renderer audit + parity: topology/rack/draw.io now diffed against the BOM, Logical/Expanded diagram view, GAPS.md reconciled (2026-07-15)
Second work order from the same external-review engagement (`PROMPT-2.md`) — the topology
renderers (`renderTopology`, `renderRack`/`renderRackMulti`, `buildDrawioXml`) were the only major
consumer of `result.fabrics` never independently audited. Full detail lives in
`docs/DESIGN-LOG.md` (renamed from `docs/CHANGELOG.md` this round — that name collided with this
file); this entry summarizes.

- **Coverage audit** diffed every archetype's BOM switch models against what each of the three
  renderers actually draws. Found two real, unrelated defects (not one shared drifted computation,
  so no `buildNodeList()` extraction was warranted): (1) the single-rack schematic (`renderRack`)
  placed switches and hosts into a fixed 42U budget in incidental push order, with no warning when
  switch tiers alone exceeded it on oversized designs — now an explicit stable sort guarantees
  switches consume the budget before any host units; (2) the campus/edge topology
  (`renderEdgeTopology`) never got the hover-tooltip/click-to-BOM interactivity the main topology
  view has — ported over, edge now passes the parity check with zero exceptions.
- **`tests/harness/audit-renderer-parity.js`** is now a permanent, hard-fail suite member — pins
  the two remaining, documented single-rack-budget gaps (GAPS.md G-014) to an exact allowlist, so
  either fixing them further or regressing them further fails the suite until consciously updated.
- **Link fidelity:** breakout uplinks (leaf↔spine and pod-spine↔super-spine) now draw dashed and
  distinct from native links in both the SVG and draw.io export, labeled with their actual
  ratio/composition and cable class (DAC/AOC/optic/Cat6A/breakout) — sourced entirely from the
  engine's already-resolved `uplinkBreakout`/`superSpineBreakout` fields plus two new additive
  fields (`uplinkCableClass`, `superSpineCableClass`) that just carry forward an already-selected
  catalog object's category; no ratio is ever recomputed client-side.
- **New "Logical / Expanded" diagram toggle** (deliberately NOT called "Physical" — the engine has
  no per-instance rack-placement data to draw a real placement from, see GAPS.md G-014). Logical
  keeps the existing capped view ("+N more"); Expanded draws every switch instance individually,
  grouped by fabric/role, with the same hover/click interactivity — verified to render exactly the
  BOM's switch count with zero truncation on an 82-leaf 3-tier AI design (514 boxes = 514 BOM
  units). The parity script now asserts both modes carry the same node set.
- **GAPS.md reconciled**: several entries (G-002, G-003, G-008, G-P03) had shipped fixes from
  earlier rounds that were never marked closed in this file — verified each fix is genuinely live
  in code (not just assumed) before closing. Found and closed one real residual test gap in the
  process: check #13's breakout credit (G-003) had no regression test, unlike check #22's — added.
  **Flagged, not force-closed:** G-011 (GB300 NVL72 `uplinksPerLeaf` divergence at certain node
  counts) is still a genuine, live, unfixed gap — confirmed by direct testing (n=7: computed
  1024 vs. actual cabled 1008) — despite not appearing on the work order's expected-open list;
  documented as a conflict rather than silently closed to match the plan.
- Content fixes: the AI-workload pitch text (`discovery.js`) now says "SN5600 / SN5610" (was
  stale "SN5610 / SN4700" — the engine has led with SN5600 for 400G AI rails since 2026-07-13);
  the edge pitch's E3224F-ON mention now notes "for non-redundant deployments" (the one switch
  with a documented sounds-good-in-discovery, hard-errors-in-validation failure mode).

17/17 suites, fresh fuzz clean. Full detail in `docs/DESIGN-LOG.md`.

## 0.63.0 — External code review round: 3-tier breakout-blindness, RA truncation, super-spine rung, catalog hygiene, docs restructure (2026-07-15)
A structured external code review (`docs/GAPS.md`) of `engine.js`/`validate.js`/the catalog,
worked in four scoped PRs with tests landing in the same commit as each fix. Full detail —
including where the review's own drafted fixes were verified wrong before merging — lives in
`docs/CHANGELOG.md` (the new design-rule changelog, see the docs restructure below); this entry
summarizes.

- **3-tier Clos was breakout-blind (top finding).** The trigger and pod-fold math compared leaf
  count against a spine's RAW native port count, not its real breakout-credited capacity.
  Confirmed live: 520× AI servers (65 leaves, fits flat within a 128-port breakout radix) built an
  unneeded 3-tier Clos AND threw a false hard "OVER-COMMITTED" error. Fixed for AI; the review's
  own proposed general/storage fix was verified WRONG on live testing (compared the wrong two
  speeds, broke 7 real scenarios) and replaced with a correctly-threaded one: 3000 general-purpose
  servers (80 leaves, a real cataloged 4× breakout) now correctly stays flat; 10000 (genuinely
  beyond it) correctly builds 3-tier.
- **Pattern-level fix:** a new shared `resolveUplinkBreakout()` is now the ONLY place that decides
  whether an implied breakout ratio is real (catalog-validated) and permitted (respects the
  `breakout` toggle) — three separate call sites had each computed this independently and one had
  already drifted (missing the toggle check). A permanent static-source test asserts exactly one
  call site, so a future direct call can't reintroduce the drift.
- **Fuzzing the fixes found two more real bugs**, unrelated to breakout: multiple AI/PowerScale
  targets of the same platform were silently colliding into one shared spine group (fixed by
  keying on the per-instance id, not the platform id); the pod-spine↔super-spine hop's breakout
  info never reached `validate.js`'s port-budget checks (false hard errors possible on correctly-
  sized 3-tier designs), fixed by keeping a live reference to the pushed fabric record.
- **`recommendRA()`** silently truncated an over-requested node count to the RA's endorsed max
  with no warning — fixed in both return branches. The GB300 NVL72 published path quotes every
  cable as in-rack DAC regardless of scale, contradicting its own "leaves serve 2 racks" text at
  n>1 — added a stop-gap warning (the full rack-placement redesign is a tracked follow-up, not
  attempted this round).
- **`pickSuperSpine()`** now checks for a same-speed, higher-radix rung (Z9432F-ON → Z9664F-ON)
  before jumping to the 1.6TbE flagship, keeping pod-spine↔super-spine cabling cataloged instead
  of forcing a cross-speed breakout that may not exist.
- **Catalog hygiene:** added real sourced wattage for `z9964f-on` and `sn5600d` (previously
  undefined for the flagship spine — the highest-stakes AI quotes); removed a DAC fallback on
  adjacent-rack cabling that contradicted the tool's own "DAC is in-rack only" rule; renamed the
  ~11 remaining "Verity" mentions in `discovery.js` to "Dell Fabric Manager (DFM)"; added
  permanent tests for two previously-unprotected discovery/solutions catalog couplings. Pulling
  real wattage figures also surfaced two citation conflicts against a newly-consulted Dell QRG
  document — logged in `CITATION-LOG.md`, not silently resolved.
- **Docs restructure:** split `docs/best-practices.md` into `docs/SPEC.md` (current-state rules,
  no dates) and `docs/CHANGELOG.md` (dated design-rule reasoning, newest-first) per
  `docs/RESTRUCTURE-GUIDE.md`'s worked example — going forward, a rule change is a `SPEC.md` edit
  + a `CHANGELOG.md` entry in the same commit, never a dated parenthetical appended to the rule
  itself. The old file is deleted; references in `README.md`, `docs/sources.md`,
  `docs/CITATION-LOG.md`, and code comments (`engine.js`, `audit-groundtruth.js`) updated to point
  at the new files. Also caught and fixed one stale claim in the process: the old doc's gap-audit
  section still said PowerEdge MX7000 was "not yet modeled" — it shipped in v0.53.0 and has been
  in the catalog for months; the new `CHANGELOG.md` entry notes the correction rather than
  silently dropping the history.
- 16/16 suites + 126,000+ fresh fuzz designs clean across the round; zero CONFLICTs hit at any
  checkpoint.

## 0.62.0 — BaseT copper hosts get the native RJ45 leaf; "second NIC" purpose is asked, not assumed (2026-07-15)
User challenge, with an actual BOM attached: 60 servers with dual-port 10GBase-T + dual-port
1GBase-T NICs, `fabricArchitecture: 'converged'` selected, still produced S4348F-ON (a 10G **fiber**
SFP+ leaf) for copper hosts and TWO separate leaf fabrics instead of one. "I want to only build
separate fabrics if they ask for it, they might want converged."

- **Root cause #1 — wrong switch class for copper hosts.** `pickLeaf()` always routed BaseT (RJ45
  copper) NICs to the SFP+ fiber ToR (S4348F-ON) plus an electrical SFP-1G-T/SFP-10G-T module —
  physically valid, but the catalog already had an unused, fully-specced native alternative
  (**S4348T-ON**: same 48-port/6×100G-uplink tier, but genuinely native 1/10GBase-T RJ45 access
  ports). Fixed: `pickLeaf()` now takes the host's BaseT-ness and routes to S4348T-ON, with a plain
  Cat6A patch cable (new catalog entry `cat6a-host`) instead of an SFP module — more accurate, and
  avoids the real per-switch power-budget caveat that comes with densely populating SFP-10G-T
  modules. The `sfp-10g-t`/`sfp-1g-t` catalog entries stay (real Dell PNs, still valid for e.g. a
  brownfield refresh adding copper to an *existing* SFP+-only switch) but the main sizing path no
  longer picks them.
- **Root cause #2 — the converged-merge pass required an EXACT speed match.** S4348T-ON's RJ45
  ports are natively multi-rate (1G and 10G auto-negotiate on the same port) — a real 1GBase-T pool
  and a real 10GBase-T pool can physically share ONE leaf tier. The merge bucketing key required
  identical `gbps`, so under `fabricArchitecture:'converged'` a mixed 1G+10G design still built two
  fabrics. Fixed: BaseT specs of any speed ≤10G now bucket together and merge; fiber/DAC fabrics
  still require an exact speed match (those genuinely are different switch chassis per speed). The
  merged fabric's label says **"1/10GBase-T (mixed-rate)"** when contributors genuinely differ, not
  one arbitrary contributor's exact speed — a customer-facing BOM/topology note shouldn't overstate
  a single precise rate for a pool that's actually mixed.
- **Root cause #3 — a target's "second NIC type" (`nic2`) was hardcoded `network:'storage'`.** A
  second NIC is just as often a second/legacy LAN or a management-adjacent network as it is
  storage — the hardcode silently mislabeled anything else, and (combined with root cause #2)
  blocked convergence for a customer who explicitly asked for it. Fixed: `nic2.network` is now a
  real customer-stated answer (defaults to `'storage'` only when genuinely unstated — back-compat
  for older saved designs). Asked in **two separate places** that both needed the fix: the Guided
  wizard's new `nic2Network` step, and the Expert Form's own separate "second NIC type" fields
  (`#f-nicb-network` — an independent UI entry point from the wizard's, easy to miss and in fact
  missed on the first pass, see below).
- **Unit-count dedupe.** A target's primary NIC and its own `nic2` merging together (newly common
  now that BaseT nic2/primary pools converge) are the SAME physical servers contributing two specs,
  not two different populations — summing `unitsN` across every merge member blindly double-counted
  same-target multi-NIC merges (e.g. 60 real servers showing as "×120" in BOM/topology notes).
  Fixed at both sites that summed it (the merge itself, and the per-fabric BOM-note builder) by
  deduping to distinct target objects before summing.
- **Independent review (1st pass) found a real gap self-testing missed**: the Expert Form's second-
  NIC UI (`#f-nicb-speed`/`#f-nicb-ports` in `index.html`/`js/app.js`) is a *completely separate*
  code path from the Guided wizard's `nic2` fields — the wizard fix didn't reach it. It still
  hardcoded storage with no way to say otherwise. Fixed: added `#f-nicb-network` alongside it.
  Also flagged (fixed): stale UI copy in the NIC-speed dropdowns still describing the removed
  "SFP module, any SFP+ leaf" mechanism.
- **Fresh fuzzing (not either review pass) then found a real under-provisioning bug in the fix
  itself**: the converged-merge picks a `rep` (biggest-link-count contributor) to source several
  fields. When `rep` happened to be the SLOWER (1G) member, the merged fabric's numeric `gbps` —
  which drives real uplink-port sizing math and the internal oversub check — stayed at `rep.gbps`
  (1), silently under-budgeting uplinks for a pool that also carries real 10G traffic. The engine's
  own internal oversub check agreed with itself (both used the same wrong number), so nothing
  warned — only an independently-recomputed check, now reading the honest "mixed-rate" label,
  caught the mismatch. Fixed: the merged fabric's `gbps` is the MAX across contributors, not
  whichever happened to have more links. Repro and a permanent regression test added.
- **2nd independent review pass** (scoped to just the fixes above) found one more thing, non-
  manifesting but worth pinning: the "mixed-rate" label's parseability by the independent checkers
  (which deliberately re-derive bandwidth from the text, not from engine.js's own numbers) is an
  implicit invariant depending on exact wording ("10G" must appear before "1G" in the string). Not
  a live bug, but unpinned — added a regression test asserting the parse, so a future rewording
  fails loudly instead of silently weakening the checker.
- 16/16 suites green; 126,000+ fresh fuzz designs across the round clean (one real bug found and
  fixed mid-round, see above); new permanent tests for BaseT leaf/cable selection, the converged
  BaseT merge (including the rep-is-slower-member regression), the mixed-rate label, nic2 purpose
  at both entry points, and the unit-count dedupe.

## 0.61.0 — Network architecture is now a real customer-intent question: converged, shared-spine, or fully separate fabrics (2026-07-13)
User challenge: combining a storage appliance with general-compute servers always silently built
TWO separate leaf-switch fabrics, and the one control that looked like it addressed this ("Share
one fabric across all targets?") only ever shared the SPINE tier — leaf switches were ALWAYS
separate per network (a hard label baked into each platform's `portGroups`), independent of that
setting. The wording actively oversold it ("One fabric for both" delivered two fabrics on one
spine). Root-caused and rebuilt as a real, named architecture decision instead of a mislabeled
cost/isolation toggle.

- **New `input.fabricArchitecture`**: `'converged'` (compute + storage NICs of matching native
  speed share the SAME leaf switches, VLAN-segmented — genuinely fewer switches, no physical
  separation) | `'sharedSpine'` (today's unchanged default — separate leaf per network, one
  shared spine) | `'separate'` (dedicated leaf AND spine per network — max isolation, the old
  `separateFabrics:true`). Legacy `separateFabrics` boolean still works exactly as before
  (`true`→`separate`, `false`/absent→`sharedSpine`) — no back-compat break for saved designs.
- **Converged mode implemented as a merge pass** (`js/engine.js`, before any leaf sizing) that
  combines eligible specs into one atomic fabric up front, so every downstream step — host-port
  budgets, spine radix, BOM, topology, rack elevation, OOO copy, draw.io — treats it as one
  ordinary fabric with no special-casing anywhere else. The merged fabric keeps the MORE
  CONSTRAINED contributor's network label (storage outranks frontend), so every existing
  oversubscription/redundancy/protocol check keeps applying correctly with zero changes.
- **Never converged — technical requirements, not preferences**: PowerScale-class back-end
  (h15963/h16346 — physically mandated separate), AI fabrics (no-mix + unrelated speed class),
  and **NVMe over RoCE storage** (needs a dedicated lossless PFC/ECN fabric — user-confirmed:
  convergence is simply not offered for it, not silently allowed with a warning).
- **Where it's asked**: Guided wizard (new `fabricArch` step, replacing the misleading `separate`
  step) and the Expert form (`#f-fabricarch`, replacing the `#f-sep` checkbox) — both only appear
  once a design has 2+ targets. Express mode keeps the `sharedSpine` default and now flags it as
  an assumption in Checks for its one path that ever combines two targets. Discovery mode never
  asks — it only ever builds single-target designs, so there's structurally nothing to converge.
- **Independent fresh-context review found 3 real bugs, all in the multi-rack × converged seam**,
  after the full suite + 90,000+ fuzz designs were already green:
  1. The merge pass borrowed rack-span placement from whichever contributor had the MOST links,
     not whichever actually spans the most racks — a small single-rack contributor could win over
     a big multi-rack one, silently pricing physically-impossible in-rack DAC cable for hosts in a
     different rack, with no cross-rack warning. Fixed: uses the worst-case (max) span across all
     contributors, via a cloned (never mutated) target object.
  2. The single-rack elevation drew zero host-to-leaf cabling for any converged fabric — its
     cabling-path filter matched only the fabric's own synthetic target id, but host boxes carry
     each contributor's REAL target id. Switches and hosts both rendered; nothing connected them.
  3. The multi-rack elevation drew nameless placeholder switches ("ToR A"/"ToR B", no model) for a
     rack-spanning target whose fabric got merged and is hosted in a different rack's frame —
     overstating the hardware. Now shows a cross-reference note, matching the already-correct
     non-spanning case.
- 16/16 suites green; 90,000+ fresh fuzz designs across the full session clean; new permanent
  tests for the merge mechanics, every exclusion rule, Expert-form and Guided-wizard end-to-end
  wiring, and all three review-found bugs.


## 0.60.0 — E-series dual uplink classes: uplink at 10/25G OR 100G per situation (2026-07-13)
User correction: "E3248P has 4 10GbE uplinks and 2 100GbE uplinks, and E3248PXE has 4 25G uplinks
and 2 100GbE — depending on the switch and situation it can uplink at either." The tool had been
treating the 4× SFP ports as ICL-only and 100G as the only way up.

- **Catalog**: all three E-series entries now model BOTH uplink classes explicitly — `uplink`
  (2×100G QSFP28 rear) + new `uplinkAlt` (4×10G SFP+ on E3248P/E3224F, 4×25G SFP28 on E3248PXE)
  — with the rule that whichever class is NOT uplinking carries the MC-LAG ICL.
- **New edge input `edgeUplink`** ('100g' default | 'sfp'), in the edge form + fuzz surface:
  - 100g (unchanged behavior): rear pair uplinks, ICL on 4× SFP (sub-100G ICL ≥4 links, h04504).
  - sfp: all 4 SFP ports uplink (2 per distribution member — existing 10/25G aggregation or
    budget sites); ICL moves to the 2×100G rear pair (≥100G ICL needs only 2 links) as 100G DACs.
- **SFP-mode distribution ladder**: 25G → S5248F-ON (48×25G) → S5296F-ON (96×25G) dense;
  10G → S4348F-ON (48×10G SFP+ — the new S41xx replacement slots straight in). Cabling per the
  standalone-optics standards: 25G = AOC (integrated, 1/link); 10G = SR optics (2/link, one each
  end) + fiber note (no cataloged 10G AOC; IDF→MDF runs are structured fiber anyway).
- **Both port-budget checkers taught the dual-class model** (validate.js #22 AND the independent
  feasibility harness — each re-derived separately): uplinks budget against the uplinking class,
  ICL against the other, never lumped onto one field. The harness's own fuzz caught the initial
  omission on three E-series shapes within one seed — fixed and re-swept clean.
- Edge topology labels now read the actual uplink/ICL speeds from the design instead of
  hardcoded "×100G"/"2×100G" strings.
- 16/16 suites green; 36,000 fresh fuzz designs across 2 new seeds clean; permanent pins for
  both modes on all three access models, the ICL swap, the SFP distribution picks, and the
  10G 2-optics-per-link cabling.

## 0.59.0 — NVIDIA AI = SN5600 + port-math spines; edge distribution scales (2026-07-13)
User reviewed the finished examples and challenged two things, both real: "I don't think the AI
cluster spine should be a SN4700," and "does the edge access layer always need a 100G at the top,
can't it scale?"

- **NVIDIA AI: Spectrum-4 SN5600 leaf AND spine at 400G rails** (SN5610 at 800G). Grounded in the
  GB200 RA ("Each SU features two SN5600 switches as the aggregation layer or spine layer",
  "SN5600 Leaf switches") and the NVL72 RA — both in the corpus. The old picker sent EVERYTHING
  under 800G to the 32-port Spectrum-3 SN4700, both tiers. SN4700 remains only the economical ToR
  for lower-speed host fabrics in an all-NVIDIA stack. The obsolete SN5400 step-up rung (a
  workaround for the SN4700-as-spine era) was removed.
- **Fixed while verifying it — AI spine count was one-spine-per-uplink.** The formula
  (spineCount = uplinksPerLeaf) priced 43 SN5600 spines for 3 leaves, and 64 Z9864F spines for
  the FDC AI export's 16-leaf/1024-rail design — where FDC itself wires 2 (its minimal-wiring
  default, an already-ratified divergence) and the port math says 8. New formula:
  ceil(total uplinks ÷ breakout-adjusted spine radix), clamped to [2, uplinks/leaf]. The AI
  example now reads 3× SN5600 leaves + 2× SN5600 spines; small clusters collapse to the
  ERA-validated non-blocking pair ("2 switches per SU"). Updated the principle test (P7) and two
  regression guards that had been ENCODING the old formula/rungs; the 300-node NVIDIA design now
  correctly stays flat 2-tier (3-tier starts ~820+ nodes where leaves outgrow the 128-radix spine).
- **Edge answer: 100G at the top IS the E-series hardware** (every model's dedicated rear 2×100G
  QSFP28 uplinks) — but the distribution now SCALES instead of being a fixed S5232F-ON pair
  (which silently ran out of ports past ~28 access switches): S5232F-ON ≤28 → Z9264F-ON ≤60 →
  Z9432F-ON ≤124 (100G via 400G→4×100G breakout assemblies, native-400G pair ICL, breakout marker
  so port-budget checks credit 128 ports) → beyond that a LOUD multi-pair/campus-core warning.
  The refresh flow's distribution gets the same missing Z9264F rung.
- **Checker fixes (audit-the-checker class):** the independent feasibility harness's leaf-fit rule
  counted the spine's native cages without breakout credit — its own fuzz flagged a fully-valid
  106-access-switch edge design as unbuildable; and the selftest's AI non-blocking check refused
  the (better) collapsed-pair outcome. Both now test the physical reality.
- 16/16 suites green; 36,000 fresh fuzz designs across 2 new seeds clean; new permanent pins for
  the SN5600 picks, the spine port-math (both stacks), the collapsed pair, and every edge-ladder
  rung including the breakout arithmetic and the beyond-ladder warning.

## 0.58.1 — Phone: results panel now anchors the viewport when it appears (2026-07-13)
User report: "when the final menu (rack elevation / topology tabs) pops in, the page scrolls
around on phone." Root cause: on the single-column phone layout the results panel renders BELOW
the input panel, and the input side changes height at that exact moment (the wizard closes, the
mode chooser returns) — the browser keeps the old scroll offset, which now points at arbitrary
content. Fix: `render()` scrolls the results panel into view on ≤860px layouts (the single-column
breakpoint), deferred one animation frame so it measures the layout AFTER the caller's own panel
swap settles. Desktop is untouched (results render beside the inputs); theme toggles don't pass
through `render()` so repaints never hijack scroll. Regression tests for both (phone scrolls once,
desktop never). 16/16 suites green.

## 0.58.0 — Phone-first UX pass 2, pan/zoom topology, S41xx EOS, Teams-style OOO, standalone-optics overhaul, per-link draw.io (2026-07-13)
User reported the app still didn't work well on an iPhone (menus jumped when picking options; the
topology zoomed into an unreadable corner; picking an example killed the left menu), flagged the
S41xx as end-of-sale, asked for a Teams-message-style OOO copy (switch counts only), asked whether
standalone optics + fiber patch cables were modeled (long reach, third-party uplinks), asked for
every individual switch link in the draw.io export, and asked for a full best-practices research
pass + an authoritative adversarial challenge afterward.

- **Fixed: wizard option-tap page jump.** Selecting an option used to re-render the whole step
  (destroying the button under the user's finger — a visible jump on phones). Selection now updates
  IN PLACE (classes, Next label, progress bar, summary); full re-render only on real step changes,
  which also scroll the new question into view when it starts above the viewport.
- **Fixed: opening an example emptied the left panel.** The mode chooser stays visible.
- **New: fixed-size pan/zoom topology viewer.** The diagram now lives in a constant-height window
  (460px desktop / 62vh phone) whatever the BOM size: opens fitted to show the whole topology,
  then wheel/pinch zooms around the cursor and drag pans; +/−/Fit/1:1 controls; hover tooltips and
  click-a-switch→BOM still work (post-drag clicks suppressed); print bypasses the viewport entirely
  (full untransformed diagram). Auto-refits on first tab open/rotation via ResizeObserver until the
  user takes over — the independent review caught that the initial fit ran while the tab was still
  hidden (clientWidth 0), which would have reproduced the exact cropped-corner problem.
- **S41xx series is END OF SALE.** Added S4348F-ON (Enterprise SONiC, Trident3-X5, 2.16 Tbps,
  48×10G SFP+ +12 breakout, 6×100G uplinks — QRG June 2026) and repointed the ≤10G fiber leaf rung
  to it. S4148F-ON stays cataloged flagged `eol:true` (brownfield recognition only, never quoted).
- **OOO copy is now a Teams-ready message.** Switch counts ONLY — `• N× MODEL — role` bullets
  (roles from the fabric structure; models serving two tiers show both), a totals line, and a
  "part numbers to follow" close. No cables, no optics, no P/Ns, no server/storage lines.
- **Standalone optics & fiber overhaul (research-grounded vs the Dell optics sheet):**
  - **2 transceivers per fiber link we own both ends of** — leaf↔spine, pod-spine↔super-spine,
    border-leaf, refresh uplinks. 400G/800G uplink optics were HALF-counted everywhere before.
  - Structured host runs now itemize the promised **host/NIC-side transceiver** (with NIC-vendor
    compatibility note) — except Base-T copper (fixed RJ-45 jack; also no fiber plant on copper).
  - **Patch cords follow the OPTIC's connector**: MPO jumpers for parallel optics (SR4/SR4.2/SR8/
    DR8), LC duplex for duplex optics — a review catch; LC was being quoted against MPO ports.
  - **Long-reach catalog**: SFP-10G-LR, SFP28-25G-LR, Q28-100G-LR4, 400G LR4 (10km single-mode).
  - **Core uplink asks reach + far end**: short/campus (default) vs 10km LR (DCI defaults LR), and
    Dell vs ANOTHER VENDOR far end — third-party interop is by IEEE PMD (LR4↔LR4), our optic on
    our port only, far side supplies its own; an info note spells this out. Patch cords itemized.
    Wired through Expert form + a new Guided "what's at the far end" step + fuzz surface.
- **draw.io: every individual switch↔switch link** (leaf↔spine uplinks, ICLs, pod↔super-spine,
  border/core) drawn as its own edge, fanned across both switch faces via anchor points; falls
  back to aggregated ×N edges past 300 links/tier. Edge/refresh access + distribution ICLs now
  drawn too (BOM priced them; the export omitted them). Border-leaf pair + core node added.
- **Topology truthfulness fixes (screen):** border-leaf pair now DRAWN between core and spine
  (BOM priced it invisibly before); dedicated spine groups (e.g. PowerScale back-end) no longer
  drawn wired to the core; ToR-only designs with a core uplink show the connection; E3224F-ON
  broken-redundancy case no longer draws a phantom ICL (context.edge.method now nulled); border
  pair placed in the multi-rack elevation.
- **Checker integrity:** the independent feasibility harness's breakout-arithmetic check had an
  overly-strict regex that silently matched NOTHING for the common 2-tier breakout note — inert
  since it was written. Fixed (both note shapes verified matching).
- **docs/best-practices.md**: new "Standalone optics, patch cables & third-party interop" and
  "10G fiber leaf — S41xx END OF SALE" sections; ownership-aware wording of the 2-optics rule.
- Process note: the independent fresh-context review found 10 real issues after 16/16 suites +
  36,000 fuzz designs were green — including the viewport-fit flagship bug, the Base-T phantom
  module, the MPO/LC mismatch, and the inert checker regex. All fixed with regression tests;
  final state 16/16 green + fresh fuzz seeds clean (54,000+ designs this session).

## 0.57.0 — Satoshi-only type, phone usability pass, Copy BOM / Copy OOO, and a print-pagination bug found by independent review (2026-07-13)
User asked for a UI-designer-style readability/usability review, to consolidate the whole app onto
one typeface (Satoshi), the best way to use the tool on a phone, and two new "copy the BOM to the
clipboard" buttons — a full copy and a condensed "OOO" copy for sharing a rough parts list from a
phone before getting back to a laptop.

- **Type: Satoshi everywhere.** Removed the second typeface (Clash Grotesk) entirely — deleted the
  `@font-face`, repointed its two usages (headings/tabs/table-heads and topology SVG text) to
  Satoshi, deleted the now-unreferenced font file, and simplified `tools/build-single.js`'s font-
  embedding loop to match. Shrinks both shipped bundles by ~57 KB (613 KB → 556/558 KB).
- **New: mobile/phone usability pass.** Fixed a real, well-known mobile bug — form inputs under
  16px cause iOS Safari to auto-zoom the whole page on focus; the Expert form's selects/number
  inputs were 14px. Added a `max-width:600px` breakpoint that bumps those to 16px, enlarges touch
  targets on buttons/tabs/mode cards, and reclaims header/panel padding. Made the 6-tab result strip
  horizontally scrollable instead of clipping/wrapping on a narrow screen, and wrapped tab content in
  its own horizontal-scroll container so a wide BOM table scrolls in place instead of forcing the
  whole page to scroll sideways. Added Add-to-Home-Screen polish (`theme-color`, Apple/Android
  "capable" meta tags, an inline-SVG favicon/apple-touch-icon) so bookmarking the tool on a phone's
  home screen gets a real icon and matching chrome color instead of a generic bookmark.
- **New: Copy BOM (full + OOO).** Two buttons in the export bar. "Copy BOM" copies the complete BOM
  as plain text (every category, Dell P/N + notes/source) — paste into an email, Teams/Slack, or a
  doc. "Copy OOO" copies a condensed version — switches and cables/optics only, model + quantity, no
  part numbers — for texting or emailing a rough parts list to a colleague or customer while away
  from the laptop, before the full BOM + checks are worked out. Both build off the same `res.bom`
  data the on-screen table already renders from; `window.UI.buildBOMText(res, 'full'|'ooo')` is
  exposed separately from the clipboard/download side-effect (`copyBOM`) for testability, mirroring
  the existing `buildDrawioXml`/`exportDrawio` split.
  - **Found and fixed while building it:** Reference-Architecture BOM rows can carry a non-numeric
    `qty` (`'per ERA'`, a string — see `qtyExpr === 'perEra'` in `engine.js`), which the rest of the
    codebase already guards against (`typeof b.qty === 'number'`) when summing BOM counts. The first
    version of the new text builder didn't, and would have rendered "per ERAx Dell PowerScale…" in
    the copied text. Fixed with the same guard; added a regression test.
  - **Found and fixed while building it:** `tools/build-single.js`'s standalone build (the complete,
    self-hostable single-file page — the one meant for sharing directly with a colleague, no claude.ai
    account needed) hardcoded its own minimal `<head>` instead of deriving it from `index.html`, so
    the new Add-to-Home-Screen meta tags silently never reached it. Fixed by extracting `index.html`'s
    real `<head>` content (minus the stylesheet `<link>`, which is inlined separately) instead of a
    hand-maintained duplicate list — the fragile pattern that let this happen in the first place.
    Added `tests/unit-build.js` (a new suite) so a future head tag that doesn't propagate fails a
    test instead of shipping silently.
- **Fixed — real bug found by independent fresh-context review, not self-review.** The new
  `.tab-body{overflow-x:auto}` rule (added for the phone table-scroll fix above) had no `@media
  print` override. Printed pages can't scroll, so browsers render any `overflow:auto` box as one
  monolithic fragment in paged media — content taller than one physical page is silently never
  printed at all. A long BOM (multi-target designs, AI clusters) or the DFM pitch tab could have lost
  content past page 1 on "🖨 Print / Save PDF" with no error or warning. Fixed by resetting
  `overflow:visible` under `@media print` for both the new rule and the pre-existing
  `.diagram-wrap{overflow-x:auto}` (same risk class, predates this release, patched at the same
  time). Added a static-analysis regression test (`tests/unit-workflow.js`) that flags any future
  `overflow:auto`/`scroll` rule that isn't either hidden or reset under `@media print`. This is
  another confirmed instance of independent review catching what self-review + a green suite missed
  — see `adversarial-audit-method` in project memory.
- 16/16 suites green (added `unit-build`, a new print-pagination static check, and copy-BOM/RA-qty
  regression tests to `unit-workflow`); 36,000+ fresh fuzz designs across 2 new seeds clean, plus an
  independent reviewer's own 9,000-design sweep piped through the new text builder specifically
  hunting for `undefined`/`NaN`/`null` leakage.

## 0.56.0 — 25G leaf override, dedup cleanup, and a real edge-redundancy bug found by re-testing the fix (2026-07-13)
User asked for a specific 25G leaf-model override (mirroring the existing 100G one), then asked for
a general debug/test/challenge/research/validate/clean/optimize pass across recent changes.

- **New: 25G leaf preference override** (`leaf25` — auto/S5212F/S5224F/S5248F/S5296F), mirroring the
  existing `leaf100` control. Previously the 25G leaf ladder (S5212F ≤12 links → S5224F ≤24 →
  S5296F when dense → S5248F otherwise) was fully automatic with no way to force a specific model —
  surfaced when the user wanted S5248F-ON specifically for a design where the auto-logic picks the
  denser S5296F-ON. Verified the downstream math scales correctly under an explicit override,
  including a deliberately extreme case (S5212F-ON forced at 500 servers → 106 leaves, still zero
  errors) — the leaf-count-growth and spine-tier logic are model-agnostic by construction, not
  special-cased. Wired through every intake surface (Guided, Discovery, Expert form; Express keeps
  its 'auto' default).
- **Cleanup: deduplicated `hasFabricUplink()`.** A prior audit flagged this port-classification
  helper as hand-copy-pasted in 3 files with nothing enforcing they stay in sync. Consolidated
  `engine.js` and `validate.js` (both "the product") onto one shared `window.hasFabricUplink` —
  deliberately did NOT touch `tests/harness/lib/feasibility.js`'s own copy, since that one is an
  intentionally-independent re-derivation (the whole point of an independent checker is that it
  doesn't share code with what it's checking). Caught and fixed a real bug the deduplication itself
  introduced: `validate.js`'s `<script>` tag loads before `engine.js`'s, so a top-level `const`
  capture of `window.hasFabricUplink` grabbed `undefined` — fixed with a lazy wrapper function
  instead (looked up at call time, not load time). Full suite caught this immediately.
- **Fixed: a real, independently-found bug in the E3224F-ON edge fix from the last release.** An
  independent fresh-context review (not self-review — a separate pass with no memory of writing
  the original fix) found that `recommendEdge()`'s hard error for E3224F-ON + redundancy (added
  last release) still let `redundancyMethod` get set to `'mclag'` and let two info messages claim
  "deployed as N MC-LAG pairs" — directly contradicting the error saying that's impossible on this
  model. This fed forward into `validate.js`'s Checks tab (a redundant info note next to the hard
  error) and the DFM pitch generator (`dfmStats()` in `ui.js` counted the fabric into the pitch's
  "N MC-LAG pairs" copy). Fixed: `redundancyMethod` is now `null` for this case, and both info
  messages are gated on the same "actually achievable" condition as the BOM/error already were.
  Updated the ground-truth-adjacent principle test (P16) that had been silently validating the OLD,
  wrong behavior (it asserted `redundancyMethod === 'mclag'` unconditionally) to instead require
  the correct null-method + real-error pair for this specific case.
- Regression: added `leaf25` override tests (unit + independent-audit sweep across every explicit
  model × 3 scales) and folded `leaf25` into the continuous fuzz input surface. 15/15 suites green;
  96,000 fresh fuzz designs across 4 new seeds clean.

---

## 0.55.2 — Ground-truth gap closed at real deal size, DFM pitch rewritten for a non-engineer audience (2026-07-13)
- **Closed the small-deal ground-truth gap flagged in the last audit.** User provided fresh Dell
  Fabric Design Center exports. Wired three new scenarios into `tests/harness/audit-groundtruth.js`:
  a small 2-switch S5224F-ON ToR pair (sharpens the existing right-sizing ladder confirmation), and
  — the headline one — a real **4-leaf + 2-spine (6 total switch) design**, exactly the deal size
  this tool's user actually quotes. Leaf model (S5296F-ON ×4) and spine model (S5232F-ON) both
  match the engine's picks exactly. Two real divergences surfaced and documented (not silently
  "fixed" — flagged for a decision): (1) FDC pairs the 4 leaves into two VLT pairs even with a
  spine present, while this tool always assumes pure EVPN-Multihoming (no peer-link) once any
  spine exists — a live gap in the engine's OS-awareness once a spine is in the picture; (2) spine
  **count** differs (FDC: 2, engine: 8) — already-known and already-ratified (documented in
  best-practices.md: this tool deliberately keeps H18364's oversubscription-driven spine-count
  math over FDC's own minimal-wiring default). Five more imported FDC files identified but not yet
  wired (vSAN, VxRail, PowerScale-F910 backend, 40G-NIC, AI scale-out variant) — logged as a
  follow-up in `audit-groundtruth.js`.
- **DFM pitch rewritten for a non-engineer presenter** (`docs/dfm-pitch.md` + the in-app 🎤 DFM
  pitch tab, `buildPitch()` in `js/ui.js` — kept in sync). Technical terms now get described by
  what they actually do rather than dropped as jargon (e.g. "BGP peering" → "the routing," "NOS
  upgrade sequencing" → "updating software on a pair in the right order"). Folded in, without
  lengthening the script: an opening that frames the customer's modernization journey (compute →
  storage → AI) and puts the network team deploying it front and center as the one living with the
  outcome; a concrete OS10-to-SONiC migration example (config conversion, digital twin testing,
  zero-touch provisioning) tied to a real, current customer conversation; and a close that opens
  the floor to the room for what pain points they're seeing this solve, instead of ending flat on
  "questions?". Cut the REST/Terraform/Ansible/NetBox tool-name list to make room without growing
  the runtime — still ~8 minutes, still 4 slides + close, still Automation/Observability/AIOps.
- Regression: updated one stale DOM test assertion to match the reworded AIOps outline bullet.
  15/15 suites green; 18,000 fresh fuzz designs clean.

---

## 0.55.1 — Adversarial audit focused on small (4-6 switch) deal accuracy (2026-07-13)
User asked for an extensive fact-checking pass, with an explicit focus on the deal size that
actually matters day-to-day (4-6 switches; anything bigger already routes to a dedicated SE).
Ran three parallel investigations (small-scale engine trace, full intake-question census,
checks-and-balances/test-architecture audit) plus direct verification of the highest-impact
claims before acting on them. Found and fixed two real, reachable bugs; found one real ground-
truth coverage gap sitting exactly in the user's deal-size zone (documented, not yet closed —
needs real Fabric Design Center exports); found one further latent gap while fixing the first
(documented, not yet fixed — see best-practices.md).

- **Fixed: Edge/IoT redundant fiber design priced hardware for an impossible topology.**
  `recommendEdge()` defaulted fiber-endpoint/no-PoE designs to E3224F-ON + dual redundancy, which
  unconditionally built and priced 2× E3224F-ON **plus** a full MC-LAG ICL cable line — only
  afterward flagging (buried in the warnings list) that E3224F-ON is OS10-only and can't actually
  run SONiC MC-LAG. A rep skimming the BOM tab could quote hardware for a design that literally
  cannot be built. Now the switch count still shows what was requested, but the ICL cable is never
  priced, and the contradiction is a hard `error`, not a silent VLT/OS10 substitution (ground-truth
  checks confirmed VLT is the wrong resolution — this edge product line is deliberately SONiC-only,
  no VLT/stacking, per principle P16).
- **Fixed: missing Z9264F-ON spine rung caused avoidable over-building past 8 100G-class leaves.**
  `pickSpine()`'s general-workload branch jumped straight from the 32-port S5232F-ON small-spine
  special case to the 400G-native Z9432F-ON (needs breakout for 100G) — skipping the already-
  cataloged Z9264F-ON (64×100G native, `roles` already include 'spine'). Beyond just cost/
  complexity, this meant any 33-64-leaf 100G design was pushed into an UNNECESSARY 3-tier Clos,
  since Z9432F-ON's own native radix (32) couldn't cover it — confirmed live: a 2000-server general
  design dropped from a 40-switch 3-tier Clos to a flat 6-switch-tier (54 leaves + 8 Z9264F-ON
  spines) with the fix. Explicit `breakout:'on'` still routes to the breakout-capable ladder.
  Surfaced a related, NOT-yet-fixed gap in `pickSuperSpine()` while validating this — see
  best-practices.md "100G general/storage SPINE selection".
- **Ground-truth coverage gap identified (not yet closed — needs user action):** the existing FDC
  ground-truth suite (11 real Dell Fabric Design Center exports, `tests/harness/audit-groundtruth.js`)
  validates flat 2-switch ToR pairs and larger (8+ leaf) fabrics, but has no scenario in the exact
  "3-4 leaves + 2 spines = 5-6 total switches" shape — the single most common real deal size for
  this tool's actual user. Everything at that scale is currently only internally self-consistent,
  not externally confirmed. Needs 2-3 real FDC exports at that size dropped into the repo.
- **Documentation:** added an explicit "vendor-neutral by design" framing to `docs/best-practices.md`
  §0 — the sizing math is generic Clos-network theory operating on catalog-supplied numbers; only
  the catalog itself and the deliberate "no-mix Dell/NVIDIA" business rule are vendor-specific.
- Regression coverage: updated two pre-existing 2000-unit 3-tier pins (now correctly flat at that
  scale) to 3000 units, where 3-tier is still genuinely required; added an explicit `breakout:'on'`
  to a unit test that had been relying on 'auto' incidentally choosing a breakout-capable spine.
  15/15 suites green; 72,000+ fresh fuzz designs across 3 new seeds clean.

## 0.55.0 — Copper (Base-T) NIC support, export fallback, Discovery-mode edge routing fix, NVIDIA flagship catalog correction (2026-07-13)
Fixed a reported export bug, closed a real coverage gap (no copper NIC options), found and fixed a
live Discovery-mode routing bug the same day it was reported, then did a fresh best-practices research
pass that surfaced and fixed a genuine catalog error predating this session.

- **draw.io/Visio export fixed for embedded/sandboxed contexts.** The export button used the standard
  `<a download>` + blob-URL pattern, which several embedded/iframe-sandboxed page contexts (missing
  `allow-downloads`) silently swallow — no error, the click just does nothing. All four export buttons
  (CSV/SVG/draw.io/print already route through one `download()` helper) now detect that context
  (`window.self !== window.top`, or any thrown error from the native path) and fall back to an on-page
  panel with the raw content in a selectable textarea + a "Copy to clipboard" button — guaranteed to
  work under any permission set since it needs no browser download/popup permission at all.
- **1G/10G copper (Base-T) and 1G fiber NIC options added** — previously the NIC-speed dropdowns only
  went down to "10GbE" (implicitly SFP+ fiber/DAC), with no way to spec a copper RJ45 host NIC at all,
  despite many real server configs (onboard/rNDC LOMs, especially older or budget builds) shipping
  10GBase-T or 1GBase-T. Sourced the real Dell parts from the Dell Networking Transceivers & Cables
  Spec Sheet: **SFP-10G-T** and **SFP-1G-T** are genuine electrical (RJ-45) modules in the STANDARD
  SFP+/SFP form factor — "the 10GbE SFP+ receptacle will also recognize 1GbE SFP transceivers" per
  Dell's own doc — so no new switch model was needed, just new cable-selection logic: the existing
  SFP+ leaf ladder now correctly picks the copper module instead of a DAC/fiber part whenever the NIC
  speed is Base-T. Added a plain "1GbE (SFP fiber)" option too (previously entirely unmodeled below
  10G). SFP-10G-T's real reach is notably short (30m over CAT6A, rate-adaptive down to 1G/100m over
  CAT5A) and higher power than a DAC — both noted in the catalog entry and BOM line.
- **Discovery mode's "Edge / campus / IoT" workload never actually built an edge BOM.** The guidance
  text always correctly recommended E3248PXE-ON/E3224F-ON, but `primaryPlatform()` mapped the edge
  workload to `platformSeed: 'poweredge-general'` and the finalize step unconditionally called
  `recommend()` — never `recommendEdge()` (the guided wizard's own separate 'edge' flow already got
  this right; Discovery mode's parallel path was simply never wired the same way). Fixed by adding the
  same explicit `recommendEdge()` branch Discovery mode was missing. Found a second bug validating the
  fix: 'virtualization' is the STICKY DEFAULT pre-selection in the workload multi-select, and it
  outranked 'edge' in the priority order — so even after fixing the routing, clicking "Edge/IoT" without
  ALSO remembering to un-click the untouched default still lost. Reordered so the generic default-only
  workload ranks last, below every workload a rep actually clicked.
- **Fresh best-practices research pass** (2026 sources: leaf-spine/Clos design guides, Ultra Ethernet
  Consortium status, NVIDIA Spectrum-6 specs, Dell SONiC guides, NVMe/TCP tuning guides) — confirmed
  the tool's existing modeling is current on the fundamentals (1:1 AI oversubscription is the 2026
  standard and already the default; EVPN-VXLAN remains the 2026 standard and is already used
  throughout; RoCEv2 remains the production-majority AI transport with UEC correctly modeled as the
  emerging/advisory alternative, not yet requiring different hardware; the PowerEdge XE8812/Vera Rubin
  deferral from v0.53.0 was re-confirmed — global availability remains early 2027 even though the GPU
  silicon itself entered production mid-2026). Found and fixed one real, dormant catalog error:
  - **NVIDIA's cataloged 3-tier flagship switch had the wrong model name AND the wrong port spec.**
    `sn6600` (64× 1.6TbE/OSFP224) doesn't match any real NVIDIA product — the actual Spectrum-6
    flagship is the **SN6810** (102.4T, 2U, single-chip, natively 128× 800GbE/OSFP112; `SN6600-LD` is
    its liquid-cooled MGX SKU variant with an identical spec, which is likely where the stale "6600"
    number came from). This wasn't just a naming error: with BOTH the pod-spine (SN5610/SN5400, 64
    ports) and the old flagship spec ALSO at 64 ports, `pickSuperSpine()`'s "does the flagship's radix
    actually cover this pod-spine count" check could mathematically never pass — every NVIDIA 3-tier
    fabric that needed a flagship step-up fell straight through to the "beyond this tool's automatic
    sizing" 4th-tier warning, even at scales (65-128 pod-spines) a real 128-port SN6810 super-spine can
    genuinely serve. Corrected the catalog entry and confirmed live: a 300-node NVIDIA AI design
    (91 pod-spines) now correctly builds a working SN6810 super-spine instead of hitting the warning.
  - **NVMe/TCP + LAG hashing note added**: bonded/multihomed NVMe/TCP storage NICs need L3/L4
    (flow-consistent) LACP hashing, not round-robin — round-robin reorders packets within a TCP flow,
    and NVMe/TCP treats reordering as loss (spurious retransmits, latency spikes). Now flagged in the
    Checks tab whenever NVMe/TCP is paired with any bonded redundancy method.
- **DFM pitch tab rewritten** (`docs/dfm-pitch.md` + the in-app 🎤 DFM pitch generator, kept in sync) —
  same required structure (DFM naming discipline, the three-function slide, EXEO Group/IREN proof
  points, ~8-minute timing budget, Easy/Tech × Script/Outline toggles), rewritten prose throughout to
  read like an engineer describing real deployment friction (a mistyped VLAN range that doesn't surface
  until traffic testing; manually sequencing a NOS upgrade across an MC-LAG/VLT pair — drain, verify,
  upgrade, repeat, in order, or it's an outage; an undocumented change from six months ago made by
  someone no longer on the team) instead of stage-pitch rhetoric (rhetorical hook questions, "2 AM/war
  room" dramatization repeated across every slide, a tricolon cadence, a 3x-repeated tagline, a hard
  scripted close). Cut the "Build it. See it. Stay ahead of it." refrain from 3 repetitions to 1.
- All 15 suites green, plus 96,000+ additional fuzz-sweep designs across 6 fresh seeds with zero
  problems found.

## 0.54.3 — Systematic pick*() audit + a new permanent LAYER-3 physical-compatibility checker (2026-07-13)
Directly answered "why do bugs keep happening, and how do we make this airtight": audited every
`pick*()` optic/cable-selection function in engine.js for the SAME disease that caused 0.54.2's bug
(loose `gbps >= X` thresholds silently matching a physically wrong, lower-speed part), then built a
new permanent, general-purpose checker layer specifically for this failure class — one that would
have caught all of these on its own, rather than requiring a human/agent to trace each one by hand.
- **Found and fixed 5 more real gaps** in `pickHostCable`/`pickUplinkCable`, all the same root cause
  (a loose `>=` ceiling silently falling through to the nearest lower-speed cataloged part instead of
  recognizing "nothing genuinely fits here"): no cataloged 40GbE optic at all (legacy QSFP+ NICs
  silently got a 25G DAC); the `structured` placement branch had no 200G or 800G+ tier for either
  the NVIDIA or Dell/general catalog; and — most severe — `pickUplinkCable`'s own `gbps >= 800`
  branch (added in 0.54.2 to fix the super-spine case) was ITSELF loose, so a border-leaf pair
  uplinking to a 1.6TbE flagship super-spine got the SAME wrong 800G DAC that started this whole
  investigation. Every `pick*()` function now matches cataloged tiers EXACTLY and returns `null` —
  never a silent substitution — for a genuinely uncataloged speed; every call site was audited to
  confirm it warns explicitly ("no cataloged optic — engage Dell Advanced Engineering") rather than
  silently dropping the BOM line or (worse) crashing on a null dereference.
- **Found and fixed a dead check inside the independent checker itself**: `feasibility.js`'s
  oversubscription-ratio check referenced `f.gbps`, a field that doesn't exist on the actual fabric
  object (only `f.speed`, a string) — every comparison silently evaluated `NaN > x` (always false),
  so this check had never actually verified anything since it was written. Found while auditing the
  checker's own assumptions, not the engine's — exactly the "independent checker can share the
  engine's blind spot" risk this whole file exists to guard against, just turned inward. Fixed.
- **New: LAYER-3 physical-optic-compatibility check** (`checkOpticSpeedMatch` in `feasibility.js`,
  wired into `checkAll` — runs on every scenario in every suite automatically). Layers 1-2 (port
  budgets) only verify enough links exist; they can't see a physically wrong optic, since the link
  count is identical either way. This recovers the actual optics.js entry behind every Cable/Optic
  BOM line and independently re-derives the required link speed at each hop (host, leaf→spine,
  peer-link/ICL, pod-spine↔super-spine, border-leaf, core-uplink), flagging any mismatch. Iterating
  on false positives while building it (multi-instance targets sharing a BOM merge-key prefix at
  different speeds; breakout assemblies; legitimately-flagged uncataloged gaps) is what surfaced most
  of the 5 gaps above — the check found real bugs before it was even finished being built correctly.
- All 15 suites green, plus 264,000+ additional fuzz-sweep designs across 10 fresh seeds — now
  actually exercising the new layer-3 check on every single one, not just the port-budget layers.

## 0.54.2 — Independent fresh-context review of 0.54.x: wrong physical optic at flagship step-up (2026-07-13)
Went one step further than re-reading the code myself: spawned a genuinely independent review (fresh
context, zero memory of having built the feature) specifically to hunt for more bugs of the reuse-spine
shape. It found a real one nothing else had caught — not the 15-suite battery, not 288,000+ cumulative
fuzz designs across this feature's lifetime, because the checker used by both shares the same blind
spot as the engine it checks (see the new [[adversarial-audit-method]] note on this pattern):
- **Pod-spine↔super-spine cabling could quote a physically incompatible optic.** `pickSuperSpine()`
  steps up to a higher-radix FLAGSHIP switch (Z9964F-ON @1.6TbE for Dell, SN6600 for NVIDIA) once a
  pod-spine's own port count can't reach every pod. The cabling code priced that link at the
  **pod-spine's** speed unconditionally, never checking what the super-spine actually presents. Worse,
  the fallback breakout picker (`pickBreakout()`) matched `highG` with a loose `>=` instead of exact
  equality — since these are fixed physical SKUs (an 800G→2×400G assembly IS an 800G connector, it
  does not also fit a 1.6T port), the loose match let a 1.6T super-spine port silently match the 800G
  breakout SKU whenever the low-speed end happened to coincide. This exact flaw existed before this
  session but was **provably unreachable** until `pickSuperSpine` became the first-ever caller able to
  pass a 1.6T `highG` — a latent defect the new feature exposed rather than introduced.
- Fixed at the source (`pickBreakout()` now exact-matches, benefiting every caller) and in the
  pod-spine↔super-spine cabling itself (now breakout-detects the two tiers' real speeds exactly like
  the existing leaf→spine hop already does). Where the catalog genuinely has no part for the gap
  (confirmed: no 1.6TbE/OSFP224 optic or breakout exists in the catalog at all yet, for either stack),
  the tool now says so explicitly — "no cataloged optic — engage Dell Advanced Engineering" — instead
  of silently substituting a lower-speed, wrong-connector cable.
- **New permanent regression coverage**: a dedicated named test pinning the exact flagship step-up
  scenario, plus the shared breakout-assembly math checker (`feasibility.js`) now also validates the
  new pod-spine↔super-spine breakout line's arithmetic, not just the pre-existing leaf→spine one.
- Also broadened the generic "does the BOM contain what the fabric data claims" consistency check
  introduced in 0.54.1 — now covers leaf hardware, peer-link/ICL cabling, border-leaf, core-uplink, and
  mgmt presence generically, not just the one spine/super-spine instance that first surfaced the pattern.
- All 15 suites green, plus 132,000+ additional fuzz-sweep designs across 8+ fresh seeds with zero
  problems found after all three fixes.

## 0.54.1 — Adversarial re-test of 0.54.0: brownfield "reuse spine" silently dropped a 3rd tier (2026-07-13)
Immediately re-challenged the freshly-shipped 3-tier Clos feature rather than treating its own green
test suite as the final word — the harness that validates a feature is written by the same hand that
built it, so it can share blind spots. Read through the new engine.js/validate.js code fresh, hand-traced
the pod/super-spine port math for soundness (checked out), then hunted for **seams between the new
capability and existing features** rather than re-running what already passed. Found one real, live,
high-severity bug and one latent one:
- **Brownfield "reuse existing spine" silently dropped the ENTIRE 3rd tier from the BOM.** The
  `reuseExistingSpine` shortcut (deploy:'add', "don't re-quote spine hardware the customer already
  owns") was written for a flat 2-tier fabric and unconditionally skipped a spine group's whole
  switch/cabling BOM block. Once growth pushes that same group into 3-tier territory, the assumption
  breaks completely — a super-spine tier that never existed before is now required, and the customer
  does not already own most of the pod-spines either. Confirmed live with a 2000-unit brownfield-add +
  reuse-spine repro: the topology/checks tab correctly described "4 pods × 8 pod-spines + 8 super-spines,"
  but the **BOM contained zero pod-spine or super-spine switch/cable lines** — 40 switches and 256 cables
  missing from a quote with no error anywhere. Fixed: the reuse-spine BOM skip now only applies to a
  flat 2-tier group; a 3-tier group always quotes the full new pod-spine/super-spine hardware, with an
  explicit warning telling the rep to net out only the pod-spines they already physically own. A related
  stale calc (the multi-rack OOB "dedicated spine rack" floor, which also gated on `!reuseSpine`) was
  fixed the same way — mgmt PORT capacity was never actually wrong (it sums whatever's in the BOM, and
  now the new hardware is in it), but the rack-count floor reasoning was inconsistent post-fix.
- **New permanent regression coverage**: a generic BOM/fabric-data consistency check added to the shared
  independent feasibility checker (`tests/harness/lib/feasibility.js`) — if a fabric claims a spine or
  super-spine, the BOM must contain matching switch hardware, full stop — plus a dedicated named
  regression test in `audit-independent.js` pinning the exact 2000-unit reuse-spine + 3-tier shape (BOM
  qty, cabling, and warning text) alongside a sanity check that the original flat-2-tier reuse-spine
  shortcut still works unchanged.
- **Documented, not yet fixed (currently unreachable)**: the separate NVIDIA reference-architecture path
  (`recommendRA()`, used for prescriptive designs like GB300 NVL72) has its own independent super-spine
  detection that still only *warns* rather than building — inconsistent with the custom-BOM engine after
  this round. Confirmed unreachable today: `recommendRA()` hard-clamps node count to each RA's
  `maxGpuNodes`, and no current RA's GPU count gets remotely close to the ~2,000-GPU two-tier ceiling
  (576 GPUs max). Left as-is rather than force a fix into unreachable code, but flagged so it isn't
  silently forgotten if a future large-scale RA is added to the catalog.
- All 15 suites green, plus 114,000+ additional fuzz-sweep designs across 11 seeds with zero problems
  found after both fixes.

## 0.54.0 — 3-tier Clos (super-spine) generation for designs beyond flat leaf-spine scale (2026-07-13)
Closed the largest remaining "topology not addressed" gap flagged in the 0.53.0 coverage audit: designs
large enough that a flat 2-tier leaf-spine fabric can't fit within a single spine group's radix
previously only got a warning telling the rep to go design a 3-tier fabric by hand. The tool now builds
one:
- **Pod partitioning** — once a fabric's leaf count exceeds what one spine group's radix can serve, leaves
  are split into pods (`podLeafCap = floor(spineRadix / 2)`, mirroring the existing folded-Clos convention
  already used for AI rail fabrics: half a spine's ports go down to leaves, half go up to the next tier).
  Each pod gets its own full spine group (pod-spines); every pod-spine then trunks up to a shared
  **super-spine** tier sized symmetrically to the per-pod spine count, full-mesh at each hop.
- **Physical-feasibility checks extended to the third tier** — `validate.js` and the independent
  `tests/harness/lib/feasibility.js` checker (which deliberately re-derives the math itself rather than
  trusting engine output, so a shared blind spot can't hide from its own safety net) both now verify
  super-spine radix, capacity, and redundancy (warns if `superSpineCount < 2`), in addition to the
  existing per-pod spine checks.
- **BOM, topology, rack, and draw.io/Visio export all represent the new tier accurately** — pod-spine and
  super-spine switch lines stay distinct even when they happen to be the same model (own merge keys, ' —
  Pod-spine' / ' — Super-spine' suffixes, matching the existing border-leaf convention); the topology
  diagram gains a labeled SUPER-SPINE row above the pod-spines; the rack elevation adds a super-spine
  frame; the draw.io export — which stays the uncapped, every-switch source of truth — draws every
  pod-spine across every pod (not just a sample) with pod-aware leaf-to-spine edge partitioning (a leaf
  only meshes to its own pod's spine chunk, not a false full mesh across pods) and a full mesh from every
  pod-spine to every super-spine in a new dedicated layer.
- **Permanent test coverage**: a dedicated 3-tier sweep in `audit-independent.js` (general/100G/AI-dell/
  AI-nvidia/PowerScale-backend scenarios) plus a hard-coded regression guard on an exact 2000-unit
  scenario (4 pods × 8 pod-spines = 32 total pod-spines, 8 super-spines, correct BOM line separation, zero
  hard errors); the fuzz harness now guarantees ~8% of generated designs land in the 1,000–6,000 unit
  range that forces 3-tier scale; a new `test-dom.js` block drives the actual Expert form UI end-to-end
  (topology, rack, checks tab, draw.io export) rather than only calling the engine directly.
- All 15 suites green, plus 99,000+ additional fuzz-sweep designs across 6 seeds (including guaranteed
  3-tier-scale coverage in the mix) with zero problems found.

## 0.53.0 — Coverage audit: 2 new platforms added, roadmap items researched and documented (2026-07-12)
Went beyond correctness this round — audited for **coverage**, not just correctness: scraped/harvested
current Dell + NVIDIA product documentation to find topologies and platforms the tool didn't address
at all, cross-checked the real Dell FDC export files already in the repo (confirmed the switch catalog
matches every model actually used in 13 real exported designs — no drift), and verified the switch
catalog against Dell's current PowerSwitch lineup (Z9964F-ON/Z9964FL-ON, announced at Supercomputing 25,
were already modeled). Found and closed two real gaps:
- **PowerEdge MX7000 (Scalable Fabric Architecture)** — a fundamentally different attach shape (modular
  chassis with MX9116n Fabric Switching Engine + MX7116n Fabric Expander Modules instead of a
  conventional external ToR) was completely unmodeled; flagged as a candidate back in v0.16.0 and never
  closed. Added as a platform: external uplinks are the FSE pair's 4× 100GbE QSFP28 ports (redundant,
  one FSE per fabric slot), with the sled-to-FSE fabric correctly scoped OUT of the external BOM (it's
  chassis-internal, pre-wired) — matches how the tool already treats other multi-node systems as a
  defined external port count without modeling internal architecture. Sourced from the Dell PowerEdge MX
  Networking Architecture Guide + MX9116n/MX7116n spec sheets.
- **PowerVault ME5 (entry/mid-range iSCSI SAN)** — the block-storage lineup had PowerStore/PowerFlex/
  PowerMax but nothing for the "simple, fast, affordable" entry segment Dell still actively sells today.
  Added with its real dual-active-controller iSCSI port counts (up to 8× 25GbE SFP28/array) sourced from
  the PowerVault ME5000 Series Specification Sheet, correctly modeled as MPIO (not LACP-bonded, unlike
  most other platforms here) since ME5 doesn't system-bond.
- Both wired into every entry point: the catalog-driven Expert form and unlimited-target rows picked
  them up automatically; the guided wizard's block-storage and "add another target" steps were extended
  by hand to reach them too (plus VxRail, which was missing from the "add another target" list as a
  pre-existing oversight — fixed in the same pass). Fixed two hardcoded platform-id regexes in ui.js that
  would have mis-colored PowerVault as a "server" instead of "storage" on the topology/rack diagrams.
- **Researched and deliberately NOT added**: NVIDIA's Vera Rubin platform (Dell PowerEdge XE8812,
  announced CES 2026) — confirmed via Dell's own announcements that it isn't GA until **early 2027**,
  and its flagship reference deployment uses Quantum-X800 **InfiniBand** (out of this tool's Ethernet-only
  scope) rather than Spectrum-X Ethernet. Modeling a not-yet-orderable platform as a current attach
  target would risk a rep offering hardware that isn't sellable yet — noting it as a future candidate
  instead of adding it now.
- All 15 suites green, plus 148,000+ additional fuzz-sweep designs (including the two new platforms in
  the random mix) across 16 seeds with zero problems found.

## 0.52.0 — Combinatorial fuzz audit: 4 more real port-overcommit gaps found and closed (2026-07-11)
Went beyond hand-picked scenarios: built a seeded, reproducible combinatorial fuzz harness
(`tests/harness/audit-fuzz.js`) that generates random combinations across the FULL input surface —
every flag, every target platform/model/NIC combination, 1–8 targets per design — and checks each
against the same independent physical-feasibility formulas from the 0.51.0 audit. Ran 180,000+
generated designs across 10 seeds (plus a 60,000-design stress run). Found and fixed four more
real port-overcommit gaps, all variations on the same root theme (leaves with no genuine
dedicated fabric-uplink port class getting overcommitted once *something else* — a shared spine
group, a peer-link — claims ports the sizing pass never reserved):
- **A fabric that fit standalone got pulled into a shared spine group** needing more uplinks than
  it had reserved room for, overcommitting its own access pool. Fixed with a post-harmonization
  correction pass that grows leaf count to fit once the group's real uplink need is final.
- **A plain ToR pair (no spine) whose host links alone already filled the leaf's radix** left zero
  room for the MC-LAG/VLT peer-link. Fixed by reserving peer-link headroom whenever a redundant
  pair sits on a leaf with no dedicated uplink class — except PowerScale-style back-ends, which are
  always independent A/B fabrics with no peer-link at all (reserving there was itself a small
  regression, caught by `npm test` and fixed in the same pass).
- **SN5610 and SN5600D's small auxiliary port (1–2× 25GbE) was being treated as a real dedicated
  uplink tier** because it was merely non-zero — it's a mgmt/breakout-assist port on an 800G leaf,
  never a genuine spine-uplink pool. Flagged explicitly in the catalog (`notFabricUplink: true`)
  and every consumer (engine sizing, both validation layers) now checks a shared `hasFabricUplink()`
  helper instead of raw truthiness. This also generalized several breakout-budget and peer-link
  checks that were incorrectly gated on a fabric's *workload label* ('ai' vs 'general') instead of
  the *switch's actual port layout* — an AI server's non-rail NIC group landing on an NVIDIA leaf
  was hitting the exact same misattribution the workload gate was supposed to prevent.
- Four regression-guard scenarios pinned the minimal repro for each gap down explicitly in
  `audit-independent.js`, and `audit-fuzz.js` (seed 20260711, 6,000 designs/generator) now runs on
  every `npm test` — 15 suites, all green.

## 0.51.0 — Independent physical-feasibility audit: 3 real gaps found and closed (2026-07-11)
Ran an adversarial, from-scratch physical-feasibility challenge against the sizing engine — deliberately
NOT reusing engine.js/validate.js's own formulas, so a shared blind spot couldn't hide from its own safety
net. Swept ~450 designs from 2 units to 20,000 endpoints, 1 to 200 racks, and 1 to 1,024 AI nodes,
independently recomputing port budgets, Clos feasibility, spine capacity, oversubscription, breakout
assembly math, and OOB capacity by hand. Found and fixed three real gaps:
- **NVIDIA 400G AI fabrics hit "needs a 3-tier super-spine" far too early.** The NVIDIA stack's spine
  selection was binary (SN4700 32-port @400G, or SN5610 64-port @800G) with no intermediate right-sizing
  step — SN5400 (64×400G, same Spectrum-4 leaf/spine role) sat unused in the catalog. A 512-GPU NVIDIA
  design was incorrectly told it needed 3-tier super-spines, while the equivalent Dell-stack design at the
  same GPU count sailed through on a single Z-series spine tier. Added SN5400 as the intermediate rung —
  mirrors the Dell Z9432F→Z9664F ladder already in place — pushing the real 2-tier ceiling for NVIDIA
  400G-class fabrics from ~500 GPUs to ~4,000+.
- **Physical port-budget check had a shape-naive ICL divisor.** `validate.js`'s over-commit check assumed
  one fixed relationship between total ICL cable count and leaves-per-fabric, which only holds for the
  main guided/expert flow (where that count means "pairs"). Edge and refresh access switches count
  leaves as *total switches* (2 per pair), and the AI reference-architecture's collapsed 2-switch compute
  pair is a direct point-to-point ISL, not a fan-out — three different shapes needed three different
  divisors. Never actually produced a wrong overcommit verdict on any currently-cataloged switch (verified
  by hand), but was a live landmine for the next catalog change. Now shape-aware.
- **Merged BOM lines could understate their own note text.** `addLine()`'s dedup only appended "; +more"
  when two contributing fabrics produced *different* note text — but two identically-sized pools on the
  same platform (the exact shape the new unlimited-target feature makes routine — "five 2-node server
  pools") produce byte-identical arithmetic in their notes (e.g. "6 leaf uplinks ÷ 4 = 2 assemblies"), so
  the merge silently skipped the flag and the combined line's description undercounted. The BOM *quantity*
  was always correct — only the descriptive text lagged. Now flags every merge unconditionally.
- New permanent suite `tests/harness/audit-independent.js` (14th in `npm test`) locks in the independent
  physical-feasibility sweep — including a direct regression guard on the NVIDIA spine-ladder fix — so
  these stay caught going forward, not just this once.

## 0.50.0 — Unlimited attach targets: build as big a solution as the job needs (2026-07-11)
The intake was capped at "primary + one added target." Real builds aren't — one customer's
design was a 50-node pool, five separate 2-node pools, a PowerStore, and a PowerScale. The
**engine already supported an arbitrary `targets[]` array**; the gap was entirely in the two
intake UIs, which only ever exposed a single "second target" slot.
- **Guided wizard** now loops: after building out an added target (platform, model, count,
  speed, NICs — same full build-out as before), it asks "Add another attach target?" — answer
  yes and it loops back for another, as many times as needed. The "Solution so far" panel lists
  every committed added target with a ✕ to remove it.
- **Expert quick form** replaced the single "second attach target" fields with a **repeatable
  list** — "+ Add another attach target" appends a self-contained card (platform, model, units,
  GPUs/rail NIC for AI, NIC speed/ports/count) with its own remove button. Add as many as the
  design needs.
- **Fixed a real bug this surfaced**: designs with two or more targets on the SAME platform
  (e.g. five separate general-server pools) were collapsing into one mislabeled host box on the
  topology view, and cross-contaminating leaf/host counts on the rack elevation — both were
  grouping by platform id, which multiple targets can share. Every target instance now carries
  a unique `uid`; topology, single-rack, and multi-rack rendering (and the PowerScale/APEX-HCI/
  ObjectScale validate.js checks) key off it, so each pool keeps its own accurate box, label,
  and unit count no matter how many targets share a platform. BOM line consolidation for
  identical hardware/cabling across pools is unaffected (still keyed for conciseness).
- Tests: engine-level sweeps at 8 heterogeneous targets (1, 3 racks) and 12 targets (no cap);
  a topology-render check verifying host-box unit-labels sum correctly when a platform repeats;
  full DOM tests driving both the wizard loop and the expert form's dynamic rows end-to-end
  (add, generate, verify 8 distinct host boxes, remove a row). All 13 suites green.

## 0.49.0 — Diagram & export upgrades: interactive topology, rack power, pro draw.io/Visio (2026-07-11)
Three UX/output refinements, each tested and audited.
- **Interactive topology.** The flagship view is now explorable: **hover any switch** for a
  detail tooltip (model, fabric, speed, uplinks, oversubscription); **click a switch** to jump
  to and flash its BOM line; **click a fabric chip** in the legend to focus it (dim the rest).
  A **1:1 ✓ badge** marks non-blocking-required fabrics. Works after theme repaint; the
  data-role render audit still passes (every switch/uplink/ICL/strand/OOB accounted for).
- **Per-rack power / cooling / weight rollup** on the rack elevation — **≈ kW, BTU/hr, weight,
  and U used** per rack, with a whole-deployment total on multi-rack designs. Driven by a new
  `rules.power` model (planning estimates; GPU servers dominate — an 8-GPU node ≈ 8 kW, so a
  4-node GPU rack ≈ 36 kW). Clearly flagged as an estimate pointing to **Dell EIPT** for exact
  figures.
- **draw.io / Visio export is now pro-grade.** The `.drawio` (→ VSDX for Visio) now has:
  **layers** (Spines / Leaves / Hosts / OOB / Cabling / Title) you can toggle; **shape data**
  on every switch (Model, Role, Ports, Speed, Part #, Vendor) → tooltips + a Visio Shape-Data
  pane an engineer can filter on; **orthogonal routing** so links stay tidy; a **title block +
  legend**; and the palette unified with the app. One change lifts both draw.io and Visio.
- Tests: interactive-topology + rack-power DOM checks, draw.io layer/metadata/orthogonal
  checks, power-model unit tests. All 13 suites green.

## 0.48.0 — Best-practice challenge harness + PowerScale 252-node cap (2026-07-11)
- **Widened the best-practice challenge harness to 69 checks** (`tests/challenge-bestpractice.js`),
  challenging the tool against current authoritative guidance across **all 9 platforms, all 7
  workflows, and every major feature** — per-platform bonding/protocol (LACP→MC-LAG for
  PowerStore/PowerFlex/ObjectScale/VxRail; PowerScale int-a/int-b independence; APEX SET; block
  MPIO+jumbo), ICL sizing, independent-A/B guardrail, EVPN-VXLAN underlay (MTU/ASN/anycast/ECMP),
  breakout (assembly math + non-blocking + S5448F PAM4 caveat), border-leaf, multi-rack FDC
  pattern, brownfield reuse-spine, growth headroom, core/DCI redundancy. Result: **0 conflicts**.
  The harness is part of `npm test` and **fails the build on any CONFLICT** (gaps are informational).
- **Closed the one gap — PowerScale 252-node OneFS cluster maximum is now enforced.** A design
  above 252 PowerScale nodes raises an **error** advising a split into ceil(nodes/252) clusters
  (each with its own dedicated back-end fabric); 227–252 gets an approaching-limit note; exactly
  252 is allowed. Verified against the current source (Dell H16346.8, Mar 2025). 5 new unit tests
  cover the boundary and the split math.
- Research refreshed to current revisions (PowerStore H18241.7, PowerScale back-end H16346.8) and
  archived to `corpus/TOPOLOGY-CHALLENGE-RESEARCH.txt`. All 13 test suites green.

## 0.47.0 — Cabling accuracy + non-technical usability (2026-07-11)
A research-driven release: swept authoritative sources on topologies, optics/cabling, open
standards and workflows (archived to `corpus/NET-BESTPRACTICE-RESEARCH.txt`), then implemented
the approved accuracy + usability improvements. All **12 test suites green**.

**Accuracy (cabling)**
- **Structured-fiber plant is now itemized.** When a run is optical over a structured plant that
  must be included, the BOM lists the whole channel — **MPO/MTP trunks, MPO cassettes, patch
  panels, and LC patch cords** — as a vendor-neutral estimate (12-fiber cassette = 6 duplex links;
  2 cassettes + 2 patch cords per link-group; ~4 cassettes/1U panel). Skipped when the plant is
  already in place.
- **Polarity & polish guidance** — a Checks warning surfaces the classic re-cabling gotcha
  (multimode = UPC, single-mode = APC, **never mixed**; one polarity method facility-wide) plus
  MPO-12-vs-16 and OM4/OS2 fiber-type guidance.
- **Reach classes refreshed to 2026 reality** — passive DAC ~2m at 800G (was 3–5m), **AEC (3–7m)
  surfaced as its own class** between DAC and AOC; LPO/CPO noted for a 2027–28 refresh.

**Usability (for people with little networking background)**
- **⚡ Express mode** — a **5-question** fast path (what you're connecting · how many · one rack or
  several · resilient or lab · manage from one console). Everything else is inferred with
  Dell-standard defaults, each clearly flagged in Checks. Power users keep the full guide.
- **Plain-English design summary + confidence signal** atop the BOM — 2–3 plain sentences on what
  it connects and why nothing bottlenecks, plus a "Draft — N items to confirm" readiness signal.
- **"Turn this into a quote" next-steps** — a tailored checklist (confirm SKUs, kit types, cable
  lengths, structured-plant with your vendor, DFM sizing, save/share).
- **Example designs** on the mode chooser (storage+servers · AI cluster · campus edge) — a novice
  can open a complete BOM and learn from it; uses the save/load engine.
- New glossary terms (AEC, MTP, trunk, cassette, patch panel/cord, UPC, APC, OM4, OS2, LPO).

## 0.46.0 — Research-driven capabilities: UEC, border-leaf, VxRail, save/share (2026-07-11)
Four approved additions, each researched against authoritative sources, implemented, and
covered by the permanent test battery (now **12 suites, all green**).
- **Ultra Ethernet (UEC 1.0) transport option.** The open, multi-vendor RDMA transport
  (ratified 2025-06) as a peer to RoCEv2 for AI fabrics. Selectable in the guided AI flow
  and the expert form (`aiTransport`). The Checks tab emits the correct config list —
  packet spraying / per-packet ECMP / packet-spray-friendly buffers / UEC-capable NICs —
  and notes it runs on the *same* Dell Z-series (Tomahawk-4/5) switches; flags UEC-on-NVIDIA
  (Spectrum-X is NVIDIA's integrated path). Glossary + `corpus/UEC-RESEARCH.txt` provenance.
- **Border-leaf pair.** A dedicated MC-LAG border pair for external / DCI egress (the
  EVPN-VXLAN border VTEP), matching Dell's published multisite design — keeps north-south off
  the spine ports. Adds the pair (Z9432F 400G-class / else S5232F), its spine uplinks + ICL,
  routes the core optic from it, and counts it in OOB. Guided (when a core uplink is chosen)
  + expert checkbox. Warns + no-ops on a ToR-only fabric (needs a spine).
- **VxRail as a first-class platform.** Dell VxRail (VMware VCF) with its own SONiC fabric
  rules: LACP node bonding → switch-dependent → MC-LAG ToR pair on BGP EVPN-VXLAN; VE/VS/VD
  = 25GbE, VP = 100GbE. Guided HCI flow now asks VxRail vs APEX/Azure Local; expert form
  lists it. Distinct from Azure Local's Switch-Embedded Teaming.
- **Save / load / share a design.** Every generated BOM is captured as a portable,
  JSON-serializable recipe. **💾 Save design** (download), **📂 Load design** (open a file),
  **🔗 Copy link** (the design travels in the URL hash; opening the link rebuilds it exactly).
  Works across all modes (guided/discovery/refresh/edge/RA/expert). **Security:** designs are
  DATA only — parsed with `JSON.parse` in a try/catch, engine name checked against an
  allowlist, every field clamped/validated; no eval, no prototype pollution, nothing leaves
  the browser (proven by the security suite).
- Tests: 3 new engine-suite groups (UEC, border-leaf, VxRail), design-loader security tests
  (malicious payloads rejected, valid round-trips), toast made a static `role="status"` node.

## 0.45.0 — QA hardening: security, accessibility, one-command test battery (2026-07-11)
Wearing the QA / security / a11y hats across the whole app. **No engine logic changed.**
- **XSS closed (render layer).** Every user-derived string (NIC vendor/model/labels and the
  engine `note`/`item`/`vendor`/`source` fields that carry them) is now HTML-escaped before
  reaching `innerHTML` — BOM table, design summary, checks, switch reference, DFM pitch, and
  **every SVG `<text>` label**. Removed a no-op `esc` shadow inside the topology that would
  have silently defeated the fix. Not exploitable through today's dropdown-only form, but
  now safe if any free-text field is ever added and for direct API use.
- **Content-Security-Policy on the hosted build.** `tools/build-single.js` computes a
  SHA-256 hash of each inline script and emits a strict CSP allowlisting exactly those —
  the browser refuses any other inline script (incl. injected). `connect-src 'none'` blocks
  all network egress, so customer BOM data can never leave the page. Emits **two** outputs:
  the artifact body (`dellboi-hosted.html`) and a full standalone document
  (`dellboi-standalone.html`) with the CSP correctly in `<head>` for self-hosting.
- **Accessibility.** Visible `:focus-visible` ring on every control; `prefers-reduced-motion`
  honored; SVG diagrams carry a `<title>`/`role="img"` accessible name describing the design;
  tabs are proper `role="tab"` with `aria-selected` tracking; a `role="status"` live region
  announces "BOM generated: N switches…"; theme toggle reports `aria-pressed`. **WCAG-AA
  contrast verified** in both themes (nudged light-mode muted text #6f7a84→#667079 to clear
  4.5:1 on both card and page grounds).
- **One-command test battery.** `npm test` (`tests/run-all.js`) runs **12 suites** —
  3 new unit suites (engine math/boundaries/input-hardening, security XSS/CSV/XML/offline,
  workflow/wiring/a11y) + a WCAG contrast suite + the 8 existing audits now living in
  `tests/harness/`. Exits non-zero on any failure (a real pre-share gate). `package.json`
  added (jsdom as the only devDependency; the app itself still ships zero runtime deps).
- Security posture confirmed by test: **no network calls, no secrets/tokens/internal hosts**
  in shipped code; CSV export safe from spreadsheet-formula injection; draw.io/Visio XML
  stays well-formed with hostile characters.

## 0.44.0 — Multi-rack elevation + cross-rack cabling + hosted build (2026-07-10)
- **Rack elevation now actually draws multi-rack deployments**: a spine rack (spines +
  centralized-fabric leaves + OOB aggregation) beside representative node racks (ToR pair +
  OOB + per-rack hosts, "×N racks like this"), single-rack targets get their own frame —
  with the **inter-rack cabling drawn**: leaf→spine uplink trunks and per-rack OOB
  aggregation runs, labeled with reach guidance.
- **Cross-rack cabling is sized, not implied**:
  - every leaf→spine uplink/breakout line in a multi-rack BOM carries a CROSS-RACK note
    (AOC 7–30 m / structured fiber — never in-rack DAC lengths);
  - a passive-DAC breakout landing on a cross-rack role now raises a loud reach warning;
  - structured placement selects transceivers (SR4/SR) for uplinks instead of fixed AOCs;
  - **OOB inter-rack uplinks added to the BOM** (1 per rack to the spine-rack aggregation,
    with the >90 m Cat6A → fiber caveat).
- **Audit found & fixed a visibility bug**: `perRack`/`cablePlacement` weren't exposed on
  fabric records, blinding downstream consumers to the per-rack decision. Cabling
  invariants added to the 232-design sweep (cross-rack notes present, no unsized DAC on
  cross-rack roles, OOB aggregation counts match racks); 6 new DOM checks (rack frames,
  trunk lines, BOM notes).
- **Hosted build**: `tools/build-single.js` packs the whole app (HTML + CSS + both fonts
  as data URIs + all JS) into one self-contained page (`dist/dellboi-hosted.html`, 489 KB,
  verified to boot + generate BOMs headlessly) — published as a private claude.ai artifact
  for sharing.

## 0.43.0 — Multi-rack deployments + 100G leaf choice (2026-07-10)
- **Multi-rack is now a first-class BOM variable, grounded in FDC's own rack model.**
  Reviewed `rack_topology` across all 14 FDC exports — the pattern is universal: every node
  rack = **2 ToR switches + 1 OOB switch**, spines live in a **dedicated spine rack** (with
  its own OOB), hosts pack ≈16× 1U per rack. The engine now applies it via a `racks` input:
  - pair-per-rack on each target's primary fabric, scoped by **racksSpanned** (a 4-appliance
    storage target in one rack keeps its single pair — verified against the converged export);
  - **one OOB switch per rack** including the spine rack;
  - **cable class steps up to AOC/fiber** for hosts reaching centralized fabrics
    (dedicated SAN / back-end / second-NIC) from other racks; AI rails get a cross-rack
    reach warning (row-scale switches, DAC ≤3 m, 3–4 GPU servers/rack on power);
  - rack elevation labeled "Rack 1 of N" with per-rack host density.
  Asked in guided + discovery (with plain-language help) and the expert form.
  **Ground truth: FDC-F11a–c** read the mid-size export's rack_topology directly and the
  engine reproduces it exactly (4 racks → 8× S5296F + 5 OOB).
- **100G leaf is now a choice**: auto ladder (S5232F → S5448F) or an explicit override —
  **Z9264F-ON added to the catalog** (64×100G standard QSFP28, 2U — the dense-leaf
  alternative when the S5448F's SFP56-DD PAM4 ports are unwanted; can absorb mid-size
  fabrics as a flat pair with no spine), or force S5232F/S5448F. Overrides that miss the
  stated oversubscription/1:1 target surface loud warnings instead of failing silently.
  Asked in guided sizing + expert form.
- **Accuracy fix uncovered during the audit**: leaves without dedicated uplink ports
  (S5232F / Z9264F / Z-series as leaf) now **reserve 4 access ports for uplinks** once a
  spine is inevitable — hosts were previously overbookable by 4 ports on spined designs.
- Audits: multi-target harness grown to **232 designs** (rack sweep 1–8 across single/
  combined/AI × placements, monotonicity, FDC mid-size reproduction, leaf-override sweep
  with reservation + honest-warning invariants); ground truth now **42 checks**; 6 new DOM
  checks (override in BOM, pair-per-rack, OOB note, FDC note, rack label). All green.

## 0.42.1 — Fix: DFM pitch tab showed blank (2026-07-10)
- The tab-click handler in app.js kept its own tab list and did not know about the new
  pitch pane — clicking the tab hid everything and showed nothing. Added to the list;
  the DOM test now CLICKS the tab like a user and asserts the pane becomes visible
  (the previous test read the content directly and missed it).

## 0.42.0 — Dell Fabric Manager (DFM): rebrand + BOM-scaled pitch generator (2026-07-10)
- **Verity → Dell Fabric Manager (DFM)** across the app (BOM line, value card, wizard/expert
  labels, validation messages, discovery guidance). The card now speaks the three functions:
  **Automation** (was Verity) · **Observability** (was Satori) · **AIOps** (was SensAI) —
  internal ids unchanged for compatibility. Facts verified against BE Networks' Dell SONiC
  page (be-net.com/dell, archived: `corpus/MG-DFM-BENET.txt`): Verity 6.6 intent-based
  orchestration, ZTP + orchestrated SONiC upgrades + config rendering, **Time Traveler**
  rollback, REST OpenAPI/Terraform/Ansible/NetBox, RoCEv2/PoE; Satori telemetry + ML
  thresholds + dashboards + alarms; SensAI agentic Q&A + task queueing + guided workflows;
  proof points: EXEO Group production order, IREN AI factory. **Explicitly NOT SmartFabric
  Manager** — different product, guarded in tests.
- **🎤 DFM pitch tab** — a manager-ready ~8-minute pitch generated from THIS BOM (switch
  count, fabrics, MC-LAG pairs, speeds, hosts, AI/RoCE and refresh angles all scale).
  Four variants via two toggles: **Script / Outline** × **🙂 Easy mode** (fully plain
  language) / **🔬 Tech mode** (real terms, each glossed inline: "in plain terms … why it
  matters"). A **💎 value-add block is always included** (time, uptime, people, audit
  proof, deal defensibility). Companion prep doc: `docs/dfm-pitch.md` (full script,
  outline mode, delivery notes, Q&A prep incl. the SFM-lane guard).
- Verified: 13 new DOM checks (BOM-scaled numbers, easy default with zero jargon, tech
  glosses, value-add in all four variants, outline toggles, no SFM bleed); all 8 harnesses green.

## 0.41.0 — Dark mode + Satoshi (2026-07-10)
- **Dark mode**: a clean Apple-dark counterpart to the light theme (same minimalism, still
  no glow) — full token set under `[data-theme="dark"]`, component-tint overrides, and
  **theme-aware diagrams**: the topology/rack SVG palettes swap and repaint live via
  `UI.setTheme`. Header **◐ toggle**; choice persists in localStorage and falls back to the
  OS `prefers-color-scheme`; selftest page follows the same preference. **Print always
  stays paper-light**, even from dark mode.
- **Satoshi** (Fontshare, variable, 42 KB) ships locally in `fonts/` as the primary body/UI
  typeface; **Clash Grotesk stays on headings, brand, tabs and micro-labels** — the app
  remains zero-install/offline.
- Verified: DOM tests toggle the theme and assert the diagrams actually repaint
  (light sheet ↔ dark sheet) and revert; all 8 harnesses green; SVG sanity sweep clean.

## 0.40.0 — Multiple NICs per server, NVIDIA MPNs verified, "Lumon clean" look (2026-07-10)
- **Multiple NIC types per server — in every guide.** The driving case: an XE9780 ordered
  with ConnectX-7 (400G rails, not the CX-8 800G default) AND a Broadcom data NIC:
  - `railNic` per target: the GPU-rail NIC generation overrides the model's rail speed
    (rail count stays 1/GPU); an info note flags the override. Asked in guided (primary +
    added AI target), discovery, and expert (GPU rail NIC select).
  - **AI front-end/storage NIC**: an explicit opt-in ("spec them?") unlocks the NIC
    questions for AI servers and applies them to the server's storage/data group — global
    NIC answers still never silently touch AI targets.
  - **Second NIC type (`nic2`)** on any server/target: own storage-class fabric with its
    own speed/ports sizing, protocol caps, and redundancy. Guided asks "a second,
    different NIC type?"; expert has speed + ports/unit fields.
- **Accuracy bug found & fixed by the new tests**: a non-blocking-required (RoCE / 1:1)
  100G fabric that joins a shared spine now upgrades its leaf S5232F → S5448F when demand
  exceeds the S5232F's 4 spine-facing ports — 1:1 is otherwise physically impossible.
  (FDC's flat dedicated-SAN S5232F designs are unchanged.)
- **NVIDIA LinkX MPNs filled — all 13 items** — verified against NVIDIA's own docs
  (LinkX 400GbE/NDR combo portfolio PDF + 400G PAM4 user guide, both archived to corpus):
  MCP4Y10-N (800G DAC, per-length), MCA7J60-N (ACC), MMA4Z00-NS / MMS4X00-NM (800G optics),
  MCP7Y00-N/-Y10-N (800G→2×400G splitters), MCP7F60-W0 (400G→4×100G), MCP2M00-A0 /
  MCP1600-C0 (25/100G DACs), MMA2P00-AS / MMA1B00-C100D (25/100G optics),
  MMA4Z00-NS400 / MMA1Z00-NS400 (400G SR4). **Corrected a fabricated part**: MCP4Y40
  does not exist — the 400G point-to-point DAC is the QSFP-DD MCP1660-W0xx (SN4700-class);
  OSFP twin-port platforms use the MCP7Y00/Y10 splitters.
- **"Lumon clean" redesign** (replaces the dark glow look at the user's direction):
  Apple-like light minimalism — near-white surfaces, hairline rules, one teal accent
  (#0e7c86), wide-tracked micro-labels, Clash Grotesk retained; diagrams render as clean
  white drawing sheets (no glow/gradients), device-shape distinctions kept.
- Full audit re-run: all 8 harnesses green (59 self-tests, DOM incl. a guided XE9780
  CX-7 + Broadcom walk, 111 BOM scenarios, scaling, principles, topology render,
  39 ground-truth, 186 multi-target designs); SVG sanity sweep confirms zero dark-theme
  remnants.

## 0.39.0 — Real Dell SKUs, verified against live dell.com product pages (2026-07-10)
- **35 orderable Dell part numbers** now seed the cable/optic catalog, each one
  **title-verified against its live dell.com `/apd/` product page** (robots-allowed paths,
  polite pacing; per-SKU title + "Dell part" cross-check cached in
  `corpus/dellcom-apd-verified.json`). 14 of 17 Dell cable/optic families covered,
  **per length** (e.g. 25G DAC: 470-ACFB 2m · 470-ACEU 3m · 470-ACEY 5m; 100G DAC:
  470-ABPW/ABPY/ABQE/ABPU; 400G DAC: 470-ADYS/ADYU/ADYT; SR4 407-BBWV; SR4.2 407-BCID;
  CWDM4/LR4 407-BBVO/407-BCWC; breakouts 470-ABQF/ABQB/ACIJ + 470-ACWC/ACUE).
- **Honesty preserved (seed-and-verify)**: 10 search-indexed SKUs whose US store pages are
  delisted (400G ACC breakouts, 800G parts) stay `verify` with the leads recorded in the
  source note; 800G DAC/breakout and generic Cat6 stay `verify`. The BOM's verify check now
  explains the remaining step: pick the length variant and confirm **kit type**
  (Customer Kit vs factory-install) when quoting.
- **Switches stay configure-to-order by design**: no public per-SKU pages exist — the
  verify check now states what drives the switch SKU (airflow IO/PSU direction, PSU count,
  OS/support bundle) instead of pretending a single PN exists.
- Provenance: `DELL-APD` row added to `docs/sources.csv`; discovery = dell.com search +
  sitemap probing; verification = live page fetch per SKU. All 8 harnesses green.

## 0.38.0 — Full build-out for ADDED targets (2026-07-10)
- **Added targets are now specced exactly like the primary** — when a design combines
  servers + storage (+ more), the added target gets its own model, count, speed and NIC/port
  build-out instead of inheriting defaults:
  - **Engine**: per-target NIC/port spec (`targets[i].nic` — vendor/speed/ports-per-NIC/NICs-per-unit)
    overrides that target's primary data group; the global NIC answer stays scoped to the
    primary target; the scoping info note now fires only for added targets left unspecced.
  - **Guided flow**: the "also connecting…" step now offers **every attach platform**
    (PowerEdge, AI/GPU servers, PowerStore, PowerScale, PowerMax, PowerFlex, ObjectScale,
    APEX HCI); **model drill-downs for the added target are generated from the catalog** for
    all platforms; adding AI servers asks GPUs/server and the AI stack (Dell/NVIDIA) and
    builds the rail-optimized fabric; a "spec it exactly vs published default" step captures
    the added target's speed, ports/NIC and NICs/unit.
  - **Expert form**: second-target port-speed + ports-per-unit fields (speed-only override
    keeps the platform's published port count).
- **Verified**: multi-target audit grown to **184 designs** (per-target specs land exactly —
  links/unit + speed per fabric; primary keeps its own; no scoping note when fully specced;
  AI-as-added-target: 8 rails/unit, non-blocking, own spine group, stack honored on both
  Dell and NVIDIA); DOM suite walks the guided flow picking PowerStore 9200T + custom
  100G spec end-to-end and checks the exact link math in the BOM (32 = 4/unit × 8).

## 0.37.0 — Multi-target scaling fixes + Severance-style visual overhaul (2026-07-10)
- **Multi-target correctness (the "add another server/storage" path), verified at scale**
  - **NIC scoping fixed**: the NIC questions describe the PRIMARY target's hosts — an added
    second target (e.g., PowerStore joined to a server design) now keeps its published port
    configuration instead of inheriting the server NIC answer; an info note explains the scoping.
  - **Shared-spine Clos harmonization**: when fabrics with different uplink needs share one
    spine group, the lighter fabric's uplinks-per-leaf is raised to the group's spine count
    (every leaf reaches every spine, uplink cables counted correctly); a warning fires when the
    leaf physically lacks the uplink ports (suggests separate fabrics).
  - **Second-target model drill-down** in the guided flow (PowerStore 1200T–9200T,
    PowerScale F210/F710/F910/F900) — front-end speed flows into switches and optics.
  - **New 8th harness `audit-multitarget.js`**: 179 combined designs (7 platform pairs ×
    6 size points × shared/separate × NIC on/off, plus RoCE caps, storage-first NIC, model
    drill-down, three-target, second-target growth monotonicity) — all invariants hold.
- **Look & feel: "Lumon terminal" redesign** — deep teal-black surfaces, phosphor-cyan
  accents, thin luminous rules, wide-tracked uppercase micro-labels; **Clash Grotesk**
  (variable) ships locally in `fonts/` (zero-install, offline; Fontshare ITF Free Font License).
  Print output stays light for paper BOMs; selftest page restyled to match.
- **Topology readability overhaul**: dark terminal frame with glow + grid, every label
  enlarged (min 9px → 9.5–10.5px) with dark halos so text reads over crossing lines;
  **servers, storage and GPU servers are visually distinct chassis** (server = seam + LEDs,
  storage = drive-slot shelf, GPU = accelerator blocks) in matching colours, with a legend.
- **Rack elevation cabling visuals**: one cable channel per fabric (colour-matched to the
  topology) with rounded-elbow runs from **every shown host to ITS leaf**, dashed leaf→spine
  uplink trunks, amber ICL brackets between pair members (left side), OOB bus with port dots
  into every unit, and device-aware unit faces (ports / LEDs / drive slots / GPU blocks).
- All harnesses green: 59 self-tests, all DOM modes, 111+ BOM scenarios, scaling,
  16 principles, topology render, 39 ground-truth, 179 multi-target designs.

## 0.36.0 — Full-path audit + BOM-aware Verity on every quote (2026-07-10)
- **Full audit run** across all seven harnesses (59 self-tests, all DOM modes, 111+ BOM
  scenarios, scaling, 16 principles, render, 39 ground-truth) — green. Consistency sweep fixed
  5 stale VLT-first labels (mode chooser, edge hint, redundancy selector, validation copy,
  design summary) to MC-LAG-first / SONiC-first wording.
- **Verity on EVERY quote, tuned to THIS BOM:**
  - **Default ON everywhere** (expert form, edge mode — new checkbox; guided/discovery/refresh
    already defaulted yes).
  - **New BOM-aware Verity value card** on the BOM tab, computed from the actual design:
    'one console, not N' (real switch count across M fabrics), day-1 ZTP for those N switches,
    day-2 hitless updates across the design's actual MC-LAG pair count, always-on drift
    detection ('it stays as sold'), a migration bullet on refresh designs, and an automatic
    scope bullet when NVIDIA/Cumulus switches are present. Closes with the one-liner:
    'the hardware fixes speed — Verity fixes operations.'
  - **Standing nudge** when Verity is left off a Dell SONiC BOM.
  - Verity added to the glossary tooltips.

## 0.35.0 — Dell AI fabric reconciled to FDC's own AI design (2026-07-10)
- **FDC AI export ingested** (128× XE9680 / 1,024× 400G rails): Dell's tool builds the GPU
  scale-out on **Z9864F-ON leaves (16×) + Z9864F spines with 800G interlinks, NO VLT** —
  rail-optimized, matching our no-peer-link AI model.
- **Adopted:** Dell-stack AI at 400G rails now uses **Z9864F leaves** (128×400G via breakout —
  4× denser than the old Z9432F pick) and Z9864F spines. The AI folded-Clos radix and the
  physical port-budget check are now **breakout/speed-adjusted** (64×800G = 128×400G rails) —
  the engine reproduces FDC's 16 leaves exactly.
- **200G host class added** (FDC AI front-end: XE9680 2×200G + PowerScale F710 2×200G) —
  200G hosts land on Z9432F (64×200G breakout).
- **>2-spine oracle gap CLOSED:** FDC's AI front-end uses **4 spines** — multi-spine designs
  are now Dell-tool-validated (ground truth 39 checks).

## 0.34.1 — Legacy 40G handling (FDC export #10) (2026-07-10)
- **40GbE legacy NICs now land on a QSFP28-class leaf (S5232F)** — connector physics: QSFP+
  plugs into QSFP28, never SFP28. 40GbE added as a legacy option in every NIC-speed question.
  Note: FDC's own '40G NIC' export silently normalized the hosts to 25G — we follow the
  physical connector rule instead (divergence documented; ground-truth check FDC-F9).

## 0.34.0 — Network-refresh journey + 4 new FDC exports reconciled (2026-07-10)
- **New guided journey: 🔄 Network refresh** — for deals where the network itself is the sale.
  Captures the existing estate (vendor, topology today, switch count, ports, speed) and a target
  speed, then produces a **like-for-like(+) replacement BOM**: same access count as SONiC
  **MC-LAG pairs** at the target speed (10G-T copper / 25G / 100G ladders), optional new
  distribution pair (collapsing 3-tier to leaf-spine), ICLs, OOB, and **migration guidance**
  (parallel build → pre-stage VLANs/MTU/LACP → rack-by-rack cutover → decommission; hitless
  MC-LAG updates after day 1). Existing client cabling is correctly treated as reused.
- **4 new FDC exports ingested (9 total; ground truth now 34 checks):**
  - **Converged (PowerEdge + large PowerStore):** FDC uses **S5448F-ON as the dense 100G leaf**
    (8×, with 400G VLTi) under **Z9664F-ON spines** — ADOPTED: 100G host fabrics that outgrow
    one S5232F now get S5448F leaves (whose 400G uplinks pull a Z-series spine). Verified match.
  - **Dedicated SAN (100G servers):** small 100G attach stays S5232F ✓ (matches engine). FDC has
    no air-gap/no-VLT mode — our independent-A/B option remains grounded on h16346/SAN practice.
  - **PowerFlex HCI:** 16 nodes → 2× S5248F + 2× 100G VLT — matches the engine exactly ✓.
  - **Back-end F910 variant:** FDC templates VLT into the PowerScale back-end — **kept our
    int-a/int-b independence instead** (h16346/OneFS RBM outranks the generic FDC template).

## 0.33.0 — PowerScale back-end flat ladder (S5232 → Z9664 flat → leaf-spine) (2026-07-10)

- **Back-end sizing now "stays flat as long as possible"** per the OneFS Supportability Guide:
  **S5232 (32×100G)** up to 32 nodes per fabric → **Z9664 as a bigger FLAT switch** (its
  back-end SKU 210-BCJH is published as *"100/200GbE flat topology only"*) up to 64 → only
  beyond that go leaf-spine. 100G QSFP28 cables plug natively into the Z9664's QSFP-DD ports,
  so the ≤64 window is physically exact. Fewer boxes, no spine tier, doc-sanctioned.

## 0.32.1 — PowerScale back-end int-a/int-b independence (fix) (2026-07-10)

- **PowerScale back-end is now modelled as TWO INDEPENDENT networks (int-a / int-b)** per
  h16346: separate subnets, each node attaches once to each, **OneFS provides the failover
  (RBM)** — no bonding, **no ICL between the back-end switches** (removed from the BOM at
  ToR-pair scale). Checks explain the int-a/int-b pattern.

## 0.32.0 — Plain-English glossary tooltips (2026-07-10)

- **~60-term glossary** (`js/catalog/glossary.js`) with business-first, one-to-two-sentence
  explanations — MC-LAG ("two switches teamed to act like one… the modern replacement for
  stacking"), oversubscription ("how much the network is overbooked, like airline seats"),
  MPIO, LACP, RoCE, lossless, breakout, OOB, rail-optimized, incast, ZTP, and more.
- **Hover tooltips everywhere**: technical terms get a dotted underline + plain-English hover
  in the Checks tab, BOM notes, wizard questions/help, guidance, and the topology legend.
  First occurrence per panel is glossed (keeps text clean); links/buttons/SVG are skipped.

## 0.31.0 — Bonding architecture drives the BOM (fabric style) (2026-07-09)

- **New capture: ToR-pair fabric style** (guided + expert): **MC-LAG pair + ICL** (default —
  supports switch-dependent/LACP bonds like a system bond or file services) vs **independent
  A/B fabrics** (classic block-SAN air gap — **no ICL in the BOM**, ports freed; valid only for
  block + MPIO with every bond switch-independent).
- **Platform guardrail:** PowerStore / PowerFlex / ObjectScale carry `systemBond: true` (their
  published designs mandate LACP bonds) — requesting independent A/B on them keeps the MC-LAG
  pair and explains why. PowerMax / PowerScale / servers are eligible.
- **Bond-mode guidance in Checks:** system/file bonds → Switch Dependent **LACP** (with the
  matching MC-LAG port-channel called out); block paths → **switch-independent + MPIO**;
  **never Static** ("mode on" blackholes silently on mismatch). Independent-A/B designs warn
  that introducing ANY LACP bond later requires converting the pair to MC-LAG (BOM change).

## 0.30.0 — Reconciled against Dell Fabric Design Center exports (2026-07-10)
- **Five FDC design exports ingested as ground truth** (Dell's own validated-design tool):
  1-rack ToR, mid-size 4-rack fabric (512 downlinks), PowerScale front-end, PowerScale
  back-end, NVMe/TCP front-end. **7 new ground-truth checks read the actual FDC JSONs** and
  compare the engine's output switch-for-switch (29 total, all matching).
- **Adopted from FDC — leaf right-sizing ladder (25G, non-AI):** the engine previously always
  used S5248F; Dell's tool right-sizes per rack demand. Now: **S5212F ≤12 links, S5224F ≤24,
  S5248F ≤48, S5296F for dense server racks** (FDC's mid-size design: 8× S5296F at 64/leaf).
  Storage/back-end stay on S5248F per the published PowerFlex/PowerStore deployment guides.
- **Independently confirmed by FDC:** the h04504 peer-link rule (FDC wires **4× 25G VLT** on its
  S5212F pair and **2× 100G** elsewhere — exactly our encoded rule); **S5232F-ON as spine** at
  these scales (all four FDC leaf-spine designs); S5232F for PowerScale FE + BE leaves.
- **Divergence kept (ours is the doc-correct one):** FDC's default leaf→spine wiring is
  1 link per leaf per spine (its mid-size design runs ~8:1) — a minimum-wiring baseline.
  This tool sizes uplinks to the oversubscription target per H18364 (≤2:1), which stands.

## 0.29.0 — NVIDIA NOS accuracy (Cumulus) + full ConnectX line (2026-07-10)
- **NVIDIA fabrics now surface their real NOS: Cumulus Linux.** SN-series switches are absent
  from the Dell Enterprise SONiC compatibility matrix — they run **NVIDIA Cumulus Linux** (the
  NOS the validated designs qualify, e.g. Cumulus 5.9.1 for SN5600 w/ PowerScale). Checks now
  state this and point at Cumulus/NVUE automation for the NVIDIA side.
- **Verity scoping fixed (was wrong for full-NVIDIA):** Verity manages **Dell Enterprise SONiC**
  — with NVIDIA switches in the design, the check now warns to scope Verity to the Dell portion
  instead of claiming "all listed models support it".
- **Full NVIDIA ConnectX line in every NIC question:** ConnectX-6 Lx (25G) / CX-6 Dx (100G) /
  CX-6 (200G) / CX-7 (400G) / CX-8 (800G) / BlueField-2 (100–200G) / BlueField-3 (400G), with a
  NIC↔speed map hint in the expert form.

## 0.28.0 — draw.io topology export (Visio path) (2026-07-10)
- **New export: ⬇ Topology (draw.io)** — generates a `.drawio` file **deterministically from the
  engine data** (not hand-drawn): **every switch is an editable object** (all leaves incl. pair
  tags A1/B1…, all spines, hosts with the exact link math, OOB) and **every connection is an
  edge** (full leaf→spine mesh with uplink labels, ICLs with counts, host and OOB links).
  Open in draw.io / diagrams.net (free; VS Code extension works) to polish for a customer, then
  **File → Export → VSDX** for Visio — closing the original "Visio topology" milestone.
  Structurally verified in the DOM suite (well-formed XML, uncapped switch count, full mesh).

## 0.27.0 — Full folder ingestion: OneFS PNs, PowerStore DG worked design, ICL rule (2026-07-10)
- **Folder-wide ingestion sweep** — every PDF in the project folder is now read, identified, and
  reconciled. Two files had been missed: the **OneFS Supportability & Compatibility Guide**
  (arrived after the previous sweep) and the new **PowerStore SFM for SONiC Deployment Guide
  (h04504)**; `document.pdf` identified as the Enterprise SONiC Distribution spec sheet.
- **First VERIFIED Dell part numbers in the tool** — OneFS Table 33 publishes the PowerScale
  back-end switch SKUs: **S5232 = 210-BCVB**, **Z9664 = 210-BCJH** (2025; 100G or 200G FLAT
  topologies only), Z9264 = 210-AWOW. Encoded + surfaced in the back-end check.
- **PowerStore published design applied (h04504):** leaf = S5248F-ON, **spine = S5232F-ON** for
  small (≤8-leaf) 100G fabrics — the engine previously jumped straight to a Z9432F spine.
  Larger fabrics still move to Z-series.
- **Peer-link/ICL sizing corrected per published rule (h04504):** ≥2 links at 100GbE+, but
  **≥4 links when using sub-100G ports** — DC ToR pairs keep 2× 100G; edge MC-LAG pairs now get
  **4×** 25G/10G ICLs.
- **Ground truth grew to 22 checks** (PowerStore leaf+spine design point, ICL sizing both
  classes, OneFS PNs encoded + surfaced) — all match the published documents.
- **AI compute fabric minimum = a 2-switch pair** on redundant designs (rails striped across
  both) — matches every validated ERA (2× SN5610). A lone switch (Dell's published small-cluster
  "single switch AI GPU fabric", h04600) is now only produced on `redundancy: single` and is
  flagged as a cluster-wide SPOF.

## 0.26.0 — Ground-truth verification: tool output vs PUBLISHED documents (2026-07-09)
- **New ground-truth audit** — the anti-circularity layer: 16 checks that compare the tool's
  output against **published worked examples from the Dell/NVIDIA docs themselves** (each check
  cites its figure). Reproduced: H18364's 32×25G→4×100G@2:1 uplink math; PowerFlex DG's
  **"22 nodes per leaf pair"** and 352-node/32-leaf/6-spine maximums; both ERA design points
  (2× SN5610); the NVL72 RA's per-SU counts; PowerScale back-end Table 4; the SONiC compat
  matrix E-series MC-LAG facts; MTU 9216. **All 16 match.**
- **GB300 NVL72 RA re-encoded to the PUBLISHED design (fix)** — the real RA is **dual-plane
  400G on SN5600 (128-port)**: each GPU gets 2× 400G paths (ConnectX-8 twin-port split),
  4 leaves per plane, **12× SN5600 GPU network per 1–2-SU block + 2× SN5600 converged per rack**,
  144× 400G GPU + 36× 400G CPU uplinks per SU. Replaces my generic 800G folded-Clos guess.
  SN5600 added to the catalog (from the RA doc). RAs can now carry `published` scaling functions
  whose counts **outrank the generic sizing math**.
- **Hard physical port-budget checks (error, not warn)** — a switch can no longer be
  over-committed: host + ICL vs access ports (port-class-aware — e.g. E3248PXE's ICL rides its
  SFP28 ports, not its 100G uplinks), uplinks + ICL vs uplink ports, and leaf-uplinks vs
  spine-port capacity (breakout-aware).
- **Large-AI spine sizing bug found & fixed by the new checks:** a 400-GPU design produced
  416 leaf uplinks into 8×32 = 256 spine ports (physically impossible). AI folded-Clos now uses
  the correct rule — **k spines for k uplinks per leaf** (the ≤8 cap only applies to general
  fabrics, where it derives from the leaf's uplink radix) — plus a spine-radix feasibility check
  that flags 3-tier/super-spine when leaves exceed the spine port count.

## 0.25.0 — Every-switch topology + render-level audit (2026-07-09)
- **Topology draws every switch** — redundant fabrics show each MC-LAG **pair individually**
  (A1/B1, A2/B2 with an ICL between each pair's members); single fabrics show up to 4 switches
  (L1…L4); spines show up to 2 boxes; anything capped gets an explicit **"+N more"** label with
  the full count. **Uplinks are drawn from every drawn leaf to every drawn spine** (thick,
  fabric-coloured) with the per-leaf uplink count/ratio label.
- **New render-level audit** (root-cause fix for "passes but wrong"): every SVG element now
  carries a `data-role` (leaf/spine/uplink/icl/strand/oob/host), and a new harness parses the
  **actual drawn SVG** and verifies the picture matches the engine data — switch boxes, uplink
  lines, ICLs, strands, OOB drops, "+N more" — across 7 design shapes. Previously only the
  engine data was audited; the rendering itself was untested.

## 0.24.0 — TRUE full-NVIDIA stack, storage protocol, edge "stack" verified (2026-07-09)
- **Full NVIDIA stack is now genuinely all-NVIDIA (bug fix).** Picking the NVIDIA stack
  previously made only the compute rails NVIDIA — storage/front-end fabrics, the shared spine,
  and cabling stayed Dell. Now **every fabric of an AI target** (compute + storage + front-end),
  its spine, the OOB (SN2201), and **all cabling (NVIDIA LinkX at 25/100/400/800G incl.
  breakout)** are NVIDIA end-to-end. Stacks never share a spine (per-stack spine groups).
  Non-AI targets in a combined design stay a Dell pod (no mixing within a fabric).
- **Block-storage protocol question in every guide** (guided / discovery / expert):
  **NVMe/TCP** (modern default, standard fabric + jumbo 9216 + SFSS), **iSCSI** (standard), or
  **NVMe over RoCE** — which **forces a lossless (PFC/ECN/DCQCN) + non-blocking 1:1 storage
  fabric** and errors if the design can't reach 1:1. The protocol now drives the uplink math.
- **Edge "stacking" story verified against the SONiC Compatibility Matrix (harvested):**
  **MC-LAG (L2, graceful shutdown, fallback, LACP-individual) confirmed for E3248P-ON /
  E3248PXE-ON** (Enterprise SONiC Lite bundle). New Checks copy positions the MC-LAG pair as
  the stack replacement: one logical switch, active/active, **hitless firmware upgrades**,
  but with independent control planes. Edge validation now enforces even pair counts + ICL.
- **E3224F-ON accuracy correction:** it is **NOT on the Enterprise SONiC matrix (OS10-only)** —
  a fiber + MC-LAG design on E3224F is flagged as an error with alternatives (E3248P/PXE SFP
  ports). Catalog OS fields corrected for all three E-series models.

## 0.23.0 — RA scaling fix, principle-conformance audit, DC fundamentals (2026-07-09)
- **Reference architectures now SCALE correctly (bug fix).** The compute fabric was hard-coded
  to 2 leaves / no spine / no interconnect. It's now a **rail-optimized folded Clos sized from
  the node count** using the RA's prescribed switch (e.g. SN5610): **2× SN5610 at the ERA design
  point** (matches the brief), and **leaf-spine that grows** for GB300 NVL72 (288 GPUs → 9 leaves +
  spine; 576 → 18 + spine), with super-spine flagged past ~2,000 GPUs. Also fixed: the **collapsed
  2-switch pair now includes its inter-switch (non-blocking) cabling** (was missing).
- **MTU-9216 guidance gap closed** — jumbo-frame guidance now fires for **server (frontend)** data
  fabrics too (iSCSI / NVMe-TCP / vMotion / AI RoCE), not only storage/back-end; notes the
  **≥1600 VXLAN-underlay** minimum.
- **Data-center fundamentals added** (validated vs general best practice + Dell): **never
  leaf-leaf / spine-spine (breaks ECMP)**; **ECMP keeps all uplinks active — use adaptive routing /
  DLB to avoid hash polarization**; **spine N+1 resilience** (≈4 spines = 75% under a failure);
  **BGP private ASNs + anycast gateway**; **VXLAN underlay MTU**.
- **Two new audit harnesses** (beyond the BOM audit): a **scaling audit** (switch/leaf counts grow
  monotonically, non-blocking holds, oversub within target across 2→64 units) and a
  **principle-conformance audit** (**69 outcomes × 16 principles** — every guide outcome matched
  to Dell docs + general DC best practice). **All pass.**
- **Manifest +3 server/storage-attach docs:** SONiC SmartFabric Manager for PowerStore, Enterprise
  SONiC for PowerFlex, and the BGP-EVPN Virtualization Overlay guide.

## 0.22.0 — Campus rework (SONiC MC-LAG pairs), rack cabling, OOB for switches (2026-07-09)
- **Edge is now accurate SONiC campus:** E-series access switches deploy as **MC-LAG pairs**
  (ICL peer-link between the two), each switch uplinking to **both** distribution switches
  (active/active, no STP). **OS10 removed** from the edge flow — the E-series runs **Dell
  Enterprise SONiC** only (SmartFabric OS10 is **end-of-sale** for E-series); scale by adding
  MC-LAG pairs, not stacking (there is no stacking).
- **Campus topology renderer** — the edge diagram now uses **CLIENTS → ACCESS (MC-LAG) →
  DISTRIBUTION** labels (no "servers / storage / spine"), draws **every E3200** as MC-LAG pairs
  with the **ICL peer-links** visible, uplinks to the distribution pair, and clients below.
- **E-series catalog corrected (spec sheet):** all three E3200-ON have **2×100G QSFP28** uplinks;
  PoE class (802.3at 30W / 802.3bt 90W) + power budgets added.
- **OOB now manages the network switches too** — every leaf / spine / access / distribution
  switch gets a management port to the OOB (not just host iDRAC/BMC). Counts + cabling updated.
- **Rack elevation now shows cabling** — a **data** channel from the hosts to the ToR/leaf and an
  **OOB** channel reaching every unit (including the switches).

## 0.21.0 — Edge/access flow + inter-network connectivity (2026-07-09)
- **New Edge / access (campus) flow** — client endpoints (APs / phones / cameras / PCs) →
  **E-series PoE access switches** → **dual-homed (LAG) to a VLT (OS10) / MC-LAG (SONiC)
  distribution pair**. Sizes access switches by endpoint count + PoE/speed (E3248PXE 90W mGig /
  E3248P 30W 1G / E3224F fiber), the 100G uplinks, the VLTi/ICL peer-link, and OOB. New mode
  button; guided "edge" routes here too. **Accuracy correction:** OS10 has *no traditional
  stacking* — VLT is the resilient "stack" (2 switches = 1 logical), and the tool now says so.
- **E-series catalog corrected from the spec sheet (harvested):** all three E3200-ON models have
  **2×100G QSFP28 uplinks** (were missing), plus PoE class (802.3at 30W / 802.3bt 90W) and power
  budgets. *(Dell PowerSwitch E3200-ON Spec Sheet)*
- **Inter-network connectivity** — the core-uplink is now a proper inter-switch capture:
  **connect to** existing core / another fabric / **DCI**, **L2 (EVPN-VXLAN) or L3 (BGP/OSPF/
  static)**, with **config guidance** (eBGP+BFD peering, LACP/ECMP, anycast gateway for L2, and
  DCI distance/optics + MACsec reminders). Exposed in the expert form.
- **Accuracy audit extended to 111 scenarios** (added every edge PoE/speed/redundancy/
  distribution combo + every inter-network type × L2/L3) — all pass, with edge-appropriate
  invariants (client cabling is by others; access→distribution, not leaf-spine).

## 0.20.0 — Non-blocking fabrics + full guide-accuracy audit (2026-07-09)
- **Non-blocking, done right:**
  - **AI fabrics are now modelled as a rail-optimized folded Clos** — a leaf that needs a spine
    splits its radix half-down (GPU rails) / half-up (spine), so AI designs are **genuinely
    non-blocking (1:1)** instead of showing a false ~5:1 (the old model under-counted AI uplinks).
  - **Non-blocking is reported clearly** — topology shows *"non-blocking 1:1"*, the BOM summary
    shows *"non-blocking ✓"*, and Checks confirm it. When a required non-blocking fabric can't
    reach 1:1 (leaf out of uplink ports), it's flagged with the **concrete remedy** (higher-uplink
    leaf like S5448F 8×400G, higher-radix spine, breakout). Grounded in H18364 (32×25G → 8×100G = 1:1).
- **BOM accuracy audit across every guide path** — a harness now exercises **69 scenarios**
  (every platform × redundancy × scale, every model drill-down, both AI stacks × placements,
  traffic profiles, combined designs, all RAs) and asserts invariants (per-fabric leaf + host
  cable, uplinks when spine, peer-link on dual ToR pairs, mgmt, optic vendor per stack,
  non-blocking for AI, Σ host cables = Σ links). **All pass.** Two real fixes it surfaced:
  - **Cables no longer over-merge** — host vs uplink vs breakout, and per-fabric (frontend vs
    back-end), stay **distinct BOM lines** (were collapsing into one when the optic matched),
    so the BOM shows each connection class separately with correct per-line counts.
  - **Reference architectures now include cabling** — NVIDIA LinkX for the GPU rails + OOB
    copper (the prescriptive RAs previously listed switches/servers but no cables).

## 0.19.1 — Model drill-down in the Discovery flow (2026-07-09)
- **Discovery** now asks *"which GPU servers?"* and *"which PowerScale model?"* when AI or NAS is
  in play — so the starting BOM keys to the real model (e.g. XE9780 → 800G) instead of the family
  default. (Same drill-down guided/expert already had; the single-platform `modelId` path is wired.)

## 0.19.0 — 800G, NVIDIA LinkX optics, model-level drill-down (2026-07-09)
- **Model-level drill-down** — every platform now carries specific `models[]`, and picking one
  sets the exact speed/GPUs instead of a family default. Expert form gets a **model dropdown**
  (per target); guided adds **"which GPU server?"** and **"which PowerScale model?"** steps.
  Examples: *XE9780 (Blackwell B200) → 8× 800GbE rails on SN5610*; *XE9680 (H200) → 400GbE on
  SN4700*; *PowerScale F210 → 25GbE front-end* vs *F710 → 100GbE*.
- **800G everywhere it matters:**
  - **ConnectX-8 (800G SuperNIC)** as a NIC choice + **800GbE** in the NIC-speed options across
    all guides; the engine sizes 800G host links to OSFP.
  - **Blackwell AI servers** XE9780 / XE9785 (8× B200 SXM6) alongside XE9680/XE9685/XE7745.
- **NVIDIA LinkX cables & optics** — a Spectrum-X (NVIDIA-stack) AI fabric is now cabled with
  **NVIDIA LinkX** (800G twin-port OSFP DAC / ACC / SR8 / DR8, 2×400G breakout, 400G SR4/DAC),
  not Dell optics; Dell fabrics still use Dell optics. Engine picks the vendor per fabric stack.
- **New rack-scale RA: NVIDIA GB300 NVL72** — 72-GPU NVLink domain per rack, 800G Spectrum-X
  scale-out via ConnectX-8, sized in Scalable Units (4 SU ≈ 288 GPUs / 8 SU ≈ 576).
- **Corpus grew to 60 sources** (harvested: ConnectX-8, LinkX 800G datasheets, GB300 NVL72 +
  GB200 SuperPOD RAs, XE9780/XE9785 technical guides, XE-AI spec sheet).

## 0.18.0 — Corpus reconcile: Blackwell 2-8-9-400 RA + spec-sheet audit (2026-07-09)
- **New validated reference architecture — NVIDIA 2-8-9-400** (Dell AI Factory): up to
  **12× PowerEdge XE9680 (8× H200 SXM)**, **2× Spectrum-4 SN5610** converged + **1× SN2201**
  OOB, **PowerScale F710**, 4× R670 management — 400GbE Spectrum-X, RDMA/RoCEv2 + PFC + ECN +
  adaptive routing. Selectable in the Reference-Architecture mode alongside the 2-8-5-200.
  *(NVIDIA 2-8-9-400 ERA brief, Aug 2025 — harvested)*
- **S5448F-ON optics caveat** (from spec sheet): its 100G ports are **SFP56-DD PAM4 (2×50G)** —
  **QSFP28 optics & breakout won't work** on them. Recorded in the catalog.
- **Switch capacity reconciled to Dell spec sheets (full-duplex).** Harvested the Dell switch
  spec sheets and corrected the **Z-series** switchingCapacity to the published full-duplex
  figures: **Z9432F 12.8→25.6, Z9664F 25.6→51.2, Z9864F 51.2→102.4, Z9964F 102.4→204.8 Tbps**
  (Z9432F/Z9664F/Z9864F confirmed from PDFs; Z9964F by the exact 2× pattern). S-series were
  already full-duplex (S5232F 6.4 / S5248F 4.0 / S5448F 16 — confirmed). NVIDIA Spectrum values
  kept at the vendor's single-direction figure (SN4700 12.8 / SN5610 51.2). Convention now
  documented in `switches.js`. Display-only — no sizing impact (the engine sizes on ports).
- **Reconcile audit against the harvested corpus:** PowerStore (100GbE), PowerScale (dual-port
  25/100G FE), PowerEdge (OCP 3.0), optics, and the PFC/EVPN standards all **matched** the
  catalog — no change.

## 0.17.0 — Topology rework, running "solution" overview, ObjectScale + Azure Local (2026-07-09)
- **Topology fixes (all four reported issues):**
  - **Leaf→spine uplinks now unmistakable** — drawn thick in the fabric colour with an
    **uplink-band label** ("↑ 6×100GbE → 4 spines · ~2:1").
  - **Peer-link is drawn switch-to-switch** (between Leaf A and Leaf B at box mid-height),
    not as a line underneath them.
  - **Connection counts moved to a clean band below the hosts** (no longer overlapping the
    strands) — one line per fabric: "storage: 80 links = 10×8/unit".
  - **OOB now drops into every unit** — the mgmt bus runs below the hosts with a dashed
    drop per node into each target ("iDRAC/BMC → every unit · N links").
  - Host↔leaf strands thinned/lightened so uplinks read clearly; more vertical spacing.
- **Running "Solution so far" overview** in the guided/discovery wizard — every answer is
  listed live and **each item is clickable to jump back and change it**; downstream answers
  are preserved. Makes it easy to review or revisit the overall build mid-intake.
- **Two new attach targets (wired into every guide — category, discovery, expert form):**
  - **Dell ObjectScale** (object/S3) — public front-end + **dedicated private back-end**,
    both dual-port **LACP**; EX500/EX5000 use **S5248F** for both pairs (25GbE; 100GbE XF960).
    *(ObjectScale Best Practices H16016)*
  - **Dell APEX Cloud Platform / Azure Local (Azure Stack HCI)** — **RDMA storage (RoCEv2/
    iWARP)** with SET teaming; ToR must be on **Microsoft's approved switch list** (or
    switchless for small clusters); converged vs non-converged NIC layouts. *(APEX/Azure
    Local Scalable Deployment Guide, Jun 2026)*
- **Docs reviewed:** H16016 (ObjectScale), APEX/Azure Local deploy guide, h04724 (Dell AI +
  NVIDIA GPUs on OpenShift/Spectrum — reinforces the existing Spectrum-X AI fabric), AI FAQ.

## 0.16.0 — Optics & cabling in every guide, oversubscription-driven sizing, every-connection topology (2026-07-09)
- **Optics & cabling captured in every guide (not a concern check):**
  - **Switch placement** (in-rack ToR / adjacent-EoR / structured) now sets the cable
    class & reach — **passive DAC** in-rack, **AOC/AEC** across a row, **pluggable optics
    over structured fiber** for cross-room. Replaces the old copper/fiber toggle.
  - **Structured cabling** — already in place vs include fiber + patch panels.
  - **Breakout** (one 400G → 4×100G, 100G → 4×25G) — engine now emits **breakout
    assemblies** on leaf→spine uplinks where the spine port is a 2×/4× multiple, and
    surfaces the port-math impact (a 32-port switch can present up to 128 logical ports).
  - **Connector / form factor per speed** (SFP+/SFP28/QSFP28/QSFP-DD/OSFP) shown per
    fabric in the topology + Checks.
- **Oversubscription is now traffic-driven ("sized right"):** a **traffic-pattern** question
  (north-south 3:1 / balanced 2:1 / east-west non-blocking 1:1) sets the target ratio, and
  the engine **derives uplinks-per-leaf** from access bandwidth ÷ (uplink speed × target).
  Storage/back-end capped at 2:1, AI at 1:1. Checks state uplinks/leaf and spine-facing ports.
- **Speed-migration roadmap** (25→100, 100→400) question → multi-rate optics/switch guidance.
- **Buffer / latency by workload** — storage/AI incast fan-in surfaces deep-buffer guidance.
- **Contextual "adding to an existing fabric"** (guided): new-build vs add; reuse existing
  spine → **incremental BOM** (no net-new spine line).
- **Topology maps every physical connection** — host↔leaf now draws individual strands
  = **units × ports/unit** (capped for readability) with the **exact link count labelled**
  per fabric, plus uplink count/breakout/connector per fabric. NIC/port answers visibly
  change the diagram.
- **Spine COUNT now follows the oversubscription math (gap fixed)** — H18364.2 p.10:
  a leaf connects to **2–8 spines** (8 for 1:1, 4 for 2:1, 2 for 4:1), not a fixed pair.
  The engine derives spine count from uplinks-per-leaf (floor 2, ceiling 8).
- **Docs ingested/reconciled + gap audit:**
  - *PowerScale Ethernet Back-End Network Overview (H16346.8, Table 4 p.14):* the sized
    back-end leaf **S5232F-ON is on the Dell-supported list** (with Z9664F-ON, Z9264-ON;
    Arista 7308X3; NVIDIA SN5600 via ETC) — earlier "conflict" was a false alarm; the
    Checks now **affirm** support and list the set. Mixed node speeds share a 100G switch
    via breakout.
  - *PowerFlex + SONiC Design Guide (h19678.3):* independently confirms **leaf oversub ≤ 2:1**
    and **MTU 9216** — matches the rules (no change).
  - *Known gap flagged (not yet built):* **PowerEdge MX7000 Scalable Fabric** (MX9116n FSE /
    MX7116n FEM / MX5108n) is a modular attach model not yet in the catalog.

## 0.15.0 — Host NIC config questions in every guide (2026-07-09)
- **NIC questions added to all three modes** (guided intake, discovery, quick form):
  **vendor/model** (Broadcom / Intel / NVIDIA-Mellanox / other), **port speed**,
  **ports per NIC** (single / dual / quad), and **NICs per server/node**.
- The engine now **derives the per-unit host port count** from the NIC config
  (`nicsPerUnit × portsPerNic`) — overriding the platform default on the primary
  non-AI data group — so the first BOM's counts reflect the real config. The NIC
  summary appears in the design summary + a Checks callout to confirm.

## 0.14.0 — Colour-coded topology, fiber/copper, OOB fully mapped (2026-07-09)
- **Topology colour-coded per fabric** — each fabric is one colour end-to-end
  (leaf boxes, leaf↔spine mesh, leaf↔host), with a matching colour key in the legend.
- **Labels moved off the crossing lines** into per-fabric headers (speed, redundancy,
  uplink, oversubscription) and below the leaf pair — no more overlapping text; links
  now render **under** the boxes.
- **Every OOB/mgmt connection mapped** — the OOB switch now draws a management link to
  **every** attach target (every iDRAC/BMC). (Verified the engine already wires all of
  them: mgmt links = every unit; one OOB Cat6 per host.)
- **Fiber vs copper** host connectivity — new guided question + expert selector; fiber
  selects optical transceivers (structured/longer runs), copper uses in-rack DAC.
- **PowerFlex 4.5 / PFxM 4.6 Technical Overview** ingested (audit): certified NIC configs
  (2×25G rec / 4×25G / 2×100G / 4×100G), LACP bonding, consistent MTU 9216, 4–8 data
  networks, dedicated MDM cluster — enrichment, no conflicts.

## 0.13.0 — Every-connection topology + config-confirmation reminders (2026-07-09)
- **Topology rebuilt to show every connection**: both spines of each redundant pair
  drawn, leaf **A/B** pair per fabric, **full mesh** leaf↔spine, leaf↔host, peer-link,
  OOB, and core — with **left tier labels** (Spine / Leaf / Servers-Storage) and much
  larger, clearer element + link labels.
- **Config-confirmation reminders** in the guided flow: the units step now flags
  "NIC speed/count varies by order — confirm actual config" and "confirm I/O module
  (25G vs 100G) & port count per appliance model."

## 0.12.0 — Audit decisions: dedicated back-end, small-AI, forced stack, separate fabrics
- **PowerScale back-end kept dedicated** — excluded from the shared spine (its own group).
- **Small AI clusters** that fit in a single switch / pair **skip the spine** (leaf-spine
  only past a threshold).
- **AI fabric stack must be chosen** (no default) — Dell **or** NVIDIA, forced in the
  expert form + guided wizard.
- **Shared vs separate fabrics** is now an option (expert checkbox + guided step);
  default remains a shared spine.

## 0.11.0 — Versioning + automatic conflict-audit (2026-07-09)
- Introduced this changelog and an in-app version badge (`js/version.js`).
- **Standing process:** on every logic change or newly added document, automatically
  audit the build against known Dell/NVIDIA best practices, **call out conflicts**, and
  present them for a human decision (contested logic is never changed silently).

## 0.10.1 — OOB vendor follows the design
- OOB switch is NVIDIA (SN2201) only when **every** data-fabric switch is NVIDIA;
  otherwise Dell S3248T-ON. Prevents an odd NVIDIA OOB alongside Dell fabrics.

## 0.10.0 — Multi-target, no-mix stacks, GPU sizing, design-wide leaf-spine, unified topology
- **Combine storage + servers** in one BOM/topology (`targets[]`).
- **Design-wide leaf-spine**: a shared Dell spine is added when the combined leaf count
  exceeds a single pair; small single-rack designs stay a ToR pair.
- **No mixing Dell/NVIDIA**: core/general = Dell; an AI fabric is all-Dell **or** all-NVIDIA
  (stack selector). OOB + leaf + spine stay one vendor within a fabric.
- **GPU count drives AI fabric size** (one 400GbE rail per GPU).
- **Topology rebuilt** as a unified leaf-spine: spine row on top, one leaf column per
  fabric, servers + storage side-by-side at the bottom, OOB on the right, core on top,
  all connections drawn.
- UI: 2nd attach target, GPU field, AI-stack selector; guided GPU/stack/second-target steps.

## 0.9.0 — Best-practices audit & principle reconciliation
- MTU corrected **9000 → 9216**; leaf oversubscription tightened **3:1 → 2:1**.
- RoCE set extended: **+ DCQCN + Adaptive Routing (ARS) + DLB + enhanced hashing**.
- LACP node-bond best-practice check; leaf-spine considerations (ECMP/DLB, superspine,
  BGP EVPN VXLAN, single-tenant compute can be pure L3).
- Added **`docs/best-practices.md`** (sourced principle reference) + the ingest-and-reconcile loop.

## 0.8.1 — Peer-link on 100G leaves
- MC-LAG / VLT peer-link now sizes from access ports when the leaf has no dedicated
  uplink ports (e.g. S5232F).

## 0.8.0 — OS-aware redundancy, core uplinks, leaf-spine gate
- Redundancy is **OS/design-aware**: SONiC leaf-spine = **EVPN-MH** (no peer-link);
  SONiC ToR pair = **MC-LAG ICL**; OS10 = **VLT/VLTi**. (Corrected the earlier
  VLTi-for-everything assumption — VLT is OS10-only.)
- **Uplinks to an existing core network** (fabric-side optics; core-side by others).
- Larger-deployment gate surfaces leaf-spine considerations; **Network OS** toggle.
- Topology: core node + peer-link shown only when the design actually uses one.

## 0.7.0 — Answer hints, air-tight validation, self-test
- Per-question **"you might hear / ask about"** answer hints in the wizard.
- Validation grown to 16+ checks (catalog integrity, min-nodes, OOB-for-AI, spine
  capacity, host-speed vs leaf-speed, sanity scans).
- **`selftest.html`** "run accuracy checks" page; plain-language design summary;
  topology speed labels + OOB. Full **jsdom** DOM-verification harness.

## 0.6.0 — Guided journey, Discovery, Verity, tone
- Four start modes: **Guided intake**, **Discovery** (customer meeting), **Reference
  architecture**, **Expert quick form**.
- Discovery outputs value-add **Guidance** (competitive positioning + best-fit portfolio
  + management story) plus a starting BOM.
- **BE Networks Verity** solution add-on (intent-based networking for Dell Enterprise SONiC).
- Business-first tone; engineer-deep detail moved to the Checks tab.

## 0.5.0 — AI fabric rules + reference architecture
- AI-fabric design rules + validation (rail-optimized, RoCEv2, ~2,000-GPU two-tier gate).
- Prescriptive **NVIDIA-endorsed Reference Architecture** mode (Dell AI Factory 2-8-5-200).

## 0.4.1 — PowerMax
- PowerMax 2500/8500 spec sheet ingested (front-end I/O module Ethernet options).

## 0.4.0 — Optics + platform data sheets
- Real Dell **optic model names** (DAC/AOC/transceivers + lengths) from the optics spec sheet.
- Platform **NIC options** confirmed from PowerStore/PowerScale/PowerFlex/PowerEdge data sheets.

## 0.3.0 — Port map + throughput accuracy
- Full multi-rate **port map + switching capacity** per switch; switch capability reference panel.

## 0.2.1 — Engine model references
- Fixed engine picks after the catalog overhaul (SN5610, Z-series spines, S3248T OOB).

## 0.2.0 — June 2026 Quick Reference Guide alignment
- Switch catalog aligned to the current portfolio; **two-stage accuracy**
  (specs-confirmed vs orderable-SKU-verify).

## 0.1.0 — Initial release
- Zero-install local web app: product catalog (switches / optics / platforms / rules),
  sizing engine, standards-check validation, BOM + topology + rack + checks tabs,
  CSV / SVG / print exports.
