# Dell Networking Best Practices — SPEC

Current-state design rules for this tool, extracted and reconciled from the Dell/NVIDIA documents
in `corpus/`. Each rule cites its source and notes where it is **enforced in code**. This file
states what IS true today — no dates, no "why it changed" narrative. For the reasoning behind a
rule (what was wrong before, why it was fixed this way), see [DESIGN-LOG.md](DESIGN-LOG.md)
(renamed from CHANGELOG.md — that name collided with the project root's user-facing release
`CHANGELOG.md`). For open items, see [GAPS.md](GAPS.md). For citation re-verification tracking,
see [CITATION-LOG.md](CITATION-LOG.md).

Sources (in-repo): AI Fabrics — Networking Guide (h04600), Spectrum+SONiC (h04658), Overview
(H20082), Ethernet vs InfiniBand (H20084); SONiC L3 Fabric (H18364.2); PowerFlex + SONiC Design
Guide (h19678.3); SmartFabric OS10 WP (h19795); Quick Reference Guide (Jun 2026 v2.1); Optics Spec
Sheet; platform data sheets; AI Factory 2-8-5-200 brief; Dell Fabric Manager (DFM, formerly Verity)
docs.

When a rule changes, this file is edited in place (old text replaced, not appended to) — git
history is where "what changed" lives structurally; `DESIGN-LOG.md` is where it lives narratively.
**New fixes get a SPEC.md edit + a DESIGN-LOG.md entry, in the same commit.**

---

## 0. Foundation — vendor-neutral by design
The SIZING MATH (spine-add threshold, oversubscription-driven uplink counts, Clos pod/super-spine
partitioning, EVPN-MH/MC-LAG/VLT redundancy selection) is written as generic formulas over
catalog-supplied port-count/speed numbers (`js/engine.js`) — it is not hardcoded to specific Dell
models. It would be correct for any vendor's switches with the same radix/speed, because it
implements standard Clos-network leaf-spine theory (2:1/1:1 oversubscription targets, ECMP
fan-out, BGP EVPN-VXLAN as an open IETF-track standard) — the cited Dell/NVIDIA guides (H18364.2,
H20082, etc.) are themselves applications of that theory, not a Dell invention. What IS
deliberately Dell/NVIDIA-specific is a **business rule layered on top**, not the underlying math:
core/general always leads with Dell PowerSwitch, and an AI fabric is a single stack (all-Dell or
all-NVIDIA, never mixed) — because that reflects what this tool's user actually sells, not a
technical constraint of leaf-spine design. Only `js/catalog/*.js` (concrete switch/optic models)
is Dell/NVIDIA-specific data; swapping in a different vendor's port/speed numbers would not
require touching the sizing math itself.

## 0b. Network architecture intent
`input.fabricArchitecture` (`'converged'` | `'sharedSpine'` | `'separate'`) is an explicit
customer-intent question, not an inferred default:
- `sharedSpine` (default) — separate leaf per network, one shared spine tier.
- `converged` — compute and storage NICs of matching native speed/electrical class share the SAME
  leaf switches (VLAN-segmented, not physically separated). Implemented as a merge pass
  (`js/engine.js`, right after specs are built, before any leaf sizing) that combines eligible
  specs into one atomic fabric BEFORE the rest of the pipeline runs — so host-port budgets, spine
  radix, BOM, topology, rack elevation, OOO copy, and draw.io all treat it as one ordinary fabric
  with zero special-casing anywhere else. BaseT (RJ45 copper) specs of ANY speed ≤10G bucket
  together for this purpose (a native S4348T-ON's ports are multi-rate — 1G and 10G share one
  physical leaf tier); fiber/DAC fabrics still require an exact speed match (those genuinely are
  different switch chassis per speed).
- `separate` — dedicated leaf AND dedicated spine per network (max isolation).
- Legacy callers/saved designs that only set the old `separateFabrics` boolean map straight onto
  their exact prior meaning (`true`→`separate`, `false`/absent→`sharedSpine`) — no back-compat
  break.

**Never converged — technical requirements, not customer preferences:**
- PowerScale-class `backend` (h15963/h16346 — physically mandated separate network).
- AI fabrics (Dell/NVIDIA no-mix + rail-optimized topology; unrelated speed class).
- **NVMe over RoCE storage** — needs a dedicated lossless PFC/ECN, non-blocking fabric.
  Convergence is simply not OFFERED for it (excluded from the merge pass outright), not silently
  allowed with a warning — mirrors this codebase's standing rule (P16/GT6b) of never overriding a
  real technical constraint with a customer preference.

**The merged fabric keeps the MOST CONSTRAINED contributor's `network` label** (storage outranks
frontend) specifically so every EXISTING oversubscription-cap / redundancy / protocol check keeps
applying correctly with zero changes — a converged fabric carrying storage traffic is still held
to storage's tighter oversubscription cap, exactly as it should be. Only display/labeling needs
to know it's actually converged (`fs.converged` / `.convergedPlatforms` / `.convergedNetworks`).

**Where it's asked**: Guided wizard (`fabricArch` step) and the Expert form (`#f-fabricarch`) —
both only appear once a design actually has 2+ targets (nothing to converge otherwise). Express
mode keeps the `sharedSpine` default and flags it as an assumption in Checks, per Express's
standing "5 questions, defaults flagged" design. Discovery mode never asks — it only ever builds a
single-target design, so there is structurally nothing to converge.

## 1. Fabric architecture
- **Leaf-spine is Layer 3** with **ECMP + Dynamic Load Balancing (DLB)** and enhanced hashing
  across leaf→spine links. *(H20082, H18364.2)* — enforced: `rules.leafSpine.considerations`.
- **Oversubscription at the leaf/access must not exceed 2:1** for general/storage. AI compute is
  ideally **1:1 non-blocking**; **2:1 or 4:1** is acceptable for cost. *(H18364.2 "does not exceed
  2:1"; H20082 oversubscription ratios)* — enforced: `rules.oversubscription` (general/storage max
  2.0, AI target 1.0).
- **BGP EVPN VXLAN** stretches L2 across racks and enables multitenancy (VRF). *(H18364.2,
  h04600)* — enforced: considerations + `rules.aiFabric`.
- **EVPN Multihoming** provides all-active server redundancy **without MLAG/peer-link**. *(h04600,
  AI Factory brief)* — enforced: `rules.redundancy.methods.evpn-mh`.
- A **single-tenant GPU compute (back-end) fabric can run pure L3** (no EVPN/VXLAN); the
  **front-end** fabric uses BGP EVPN VXLAN. *(h04600)* — enforced: aiFabric note.
- **Do not mix Dell and NVIDIA switches within a fabric** (user principle, aligned to Dell/NVIDIA
  AI reference designs). Core data-center networking **leads with Dell** PowerSwitch; an **AI
  fabric is a single stack** — **all-Dell** (PowerSwitch/SONiC) **OR all-NVIDIA** (Spectrum). A
  Dell core + a separate NVIDIA AI pod in the same DC is fine (they are separate fabrics). —
  enforced: engine `pickLeaf/pickSpine(stack)`, OOB vendor follows the design, validate check #21.
- **Leaf-spine is chosen design-wide**: when the combined leaf count (across all attach targets,
  e.g. storage + servers) exceeds a single pair, add a **shared spine** and run leaf-spine; small
  single-rack designs stay a ToR pair. — enforced: engine shared-spine decision.
- **GPU count drives AI fabric size**: one rail (NIC) per GPU, at the GPU generation's native rail
  speed. — enforced: engine `gpusPerServer` override of the aifabric port group.
- Topologies: single-switch, **ToR-Wired Clos**, **Pure Rail**, **Rail-Optimized** (rail-optimized
  performs best for GPU collectives). *(H20082, h04600)*.
- **Scale:** two-tier leaf-spine reaches **~2,000 GPUs**; beyond that use a **3-tier Clos with
  superspines**. *(H20082)* — enforced: `rules.aiFabric.twoTierGpuScale`, validate check #17. The
  3-tier trigger and pod-fold math are breakout-adjusted (see § AI switch selection below), never
  compared against a switch's raw native port count.

## 2. MTU
- **Set MTU to 9216 bytes** end-to-end for best performance (storage and AI). *(h19678.3 "9216
  bytes for best performance"; h04600)* — enforced: `rules.mtu.storageJumbo = 9216`, validate
  check #3.

## 3. RoCE / lossless (AI and NVMe-RoCE)
- To be lossless for RoCEv2 the fabric **must use PFC**. *(h04658)*
- Congestion control = **RoCEv2 + PFC + ECN + DCQCN** (DCQCN is the primary congestion-control
  feature; uses ECN) plus telemetry. *(h04600, h04658)*
- Load balancing / congestion avoidance = **Adaptive Routing & Switching (ARS)** + **Dynamic Load
  Balancing (DLB)** + enhanced hashing. *(h04600, h04658)* — enforced: `rules.roce.required`,
  validate check #4.

## 4. Redundancy (OS-aware — SONiC ≠ OS10)
- **OS10 is dropped portfolio-wide as a NEW-BUILD choice** *(R14 ruling, 2026-07-23, maintainer:
  "OS10 shouldn't be quoted, it's end of sale")*. New Dell switches are always **Dell Enterprise
  SONiC**; the wizard's NOS question and the Expert Form's NOS select are both removed —
  `recommend()` pins `nos:'sonic'` unconditionally, so **MC-LAG is the single redundancy
  mechanism on new fabrics**. VLT/OS10 wording below survives ONLY where the tool describes a
  customer's **EXISTING** switches (`recommendRefresh()`) — never a new quote. See §NOS
  Terminology at the end of this section for the four distinct "SONiC"s this repo has to keep
  apart (the R14 grilling session found the ambiguity had already caused one bad design-review
  premise).
- **Mechanism selection is SPARE-PORT scoped** *(ruling 2026-07-16c, Option b — supersedes the
  old "SONiC leaf-spine always → EVPN-MH" rule)*: MC-LAG/VLT is the customer-standard pair
  mechanism, and its peer-link (ICL) costs 2 leaf ports. **Any redundant A/B fabric whose leaf has
  the spare ports for the ICL is MC-LAG/VLT** — a stand-alone ToR pair, a per-rack FDC pair, AND a
  spined single-/multi-leaf pair alike. **Where the leaf's uplinks fill its ports**, EVPN-MH is the
  purpose-built mechanism (all-active, no peer-link) — the CORRECT design, not a compromise;
  shrinking uplinks to carve out an ICL (degrading fabric throughput for mechanism uniformity) is
  rejected. Redundancy is **an input to leaf selection**: a redundant, MC-LAG-eligible design steps
  its leaf UP (economy S5224F-ON → standard S5248F-ON, capped there) so uplinks + ICL both fit,
  rather than dropping the peer-link (§4a). Port-driven EVPN-MH is **always announced** (never
  silent). — enforced: engine redundancy block (`wantsPeerPair = !spine || iclFits`, `iclFits`
  recomputed against final uplinks), step 3b leaf step-up, `tests/fixtures/fixture-5-*`.
- **SONiC stand-alone L2 ToR pair → MC-LAG** (inter-chassis peer-link / ICL). This is the ONLY
  mechanism a new-build quote produces (R14, above).
- **SmartFabric OS10 → VLT** (VLT interconnect / VLTi). VLT is OS10-only, not SONiC. *(h04600;
  OS10 WP h19795)* — **describes existing customer gear only** (R14, above); no new-build path
  produces it. — enforced: `rules.redundancy.methods`, `recommendRefresh()`.
- SONiC port channels use **LACP by default**; recommend LACP for node-to-leaf bonded NICs
  (LACP-individual as fallback). *(h19678.3)* — enforced: validate LACP info.
- **Redundant (dual) vs non-redundant (single) changes the HARDWARE, not just a label**
  *(ruling 2026-07-16, backtest B4)* — enforced: engine sizing + `tests/invariants.js`,
  `tests/fixtures/`:
  - **Dual** = dual-homed hosts (both NIC ports, one to each leaf of a pair) → a leaf **pair per
    rack** and a peer-link **ICL** (MC-LAG on new-build Enterprise SONiC; VLT only when describing
    existing OS10 gear, per §4 above).
  - **Single** = **single-homed** hosts: each host uses **one** NIC port to its single leaf, the
    other port **spare** → half the host links, **one leaf per rack**, **no ICL**, no "pair"
    language. The host-cable note states the spare port explicitly on the quote.
- **A per-rack ToR MC-LAG/VLT pair carries its peer-link (ICL) even under a spine** — the two
  leaves in a rack peer as one logical ToR and uplink to the spine via EVPN-VXLAN. But the ICL
  **only** builds when the leaf can physically spare the ports for it (2 uplink ports for ≥100G);
  a leaf that can't falls back to **pure EVPN-Multihoming** (ESI, no peer-link). The fallback is:
  1. **Never silent** — it raises a **WARN** on the quote naming the leaf, the port shortfall, and
     the leaves (S5248F-ON / S5296F-ON) that would restore an MC-LAG/VLT pair. A changed redundancy
     mechanism is a customer-conversation item. *(ruling 2026-07-16)*
  2. **Capability-verified** — EVPN-MH support is read from **explicit per-switch capability data**
     (catalog `redundancyMethods`, sourced from the Enterprise SONiC Compatibility Matrix — a
     protocol claim, *not* the topology role: E3248P/E3248PXE run EVPN-MH, only E3224F-ON doesn't);
     if the leaf can run **neither** an ICL nor EVPN-MH, that's a **hard error**, never a silent
     substitution.
  3. **Port-driven, not policy** *(revised 2026-07-16c)* — under the spare-port scope the auto
     ladder DOES select EVPN-MH, but only on a **genuinely dense** fabric whose uplinks fill the
     leaf even after the step-up to S5248F-ON (§4a); it is never a blanket "spined ⇒ EVPN-MH"
     policy substitution. An **explicit** ToR-MC-LAG topology (a no-spine pair) keeps its hard
     feasibility gate — never a silent EVPN-MH swap. — enforced: engine `supportsEvpnMh` +
     `fs.iclFits` (recomputed) + step 3b, `tests/unit-engine.js`, `tests/harness/audit-principles.js` (P6).

### 4z. NOS Terminology — four distinct "SONiC"s *(R14, 2026-07-23)*
The word "SONiC" names four different things in this codebase's sources; conflating them is what
produced R14's original (incorrect) work order — it read a catalog string mentioning "SONiC" on
an NVIDIA switch and concluded Dell Fabric Manager applied, when the SONiC named there is a
different, unrelated distro. Keep these apart:
- **Dell Enterprise SONiC** — Dell's commercial distro for PowerSwitch. Has the compatibility
  matrix (`SONIC-COMPAT.txt`), DFM support, and is the ONLY new-build choice (§4 above).
- **Dell SONiC on Spectrum** — `AI-SPECTRUM.txt` (H04658, Ch.4, Mar 2026) names EXACTLY THREE
  NVIDIA Spectrum models — **SN5600, SN5610, SN2201** — as "Dell PowerSwitch ... with Dell SONiC."
  DFM applies here too, but `verify:true`-flagged: the compatibility matrix doesn't list these
  models yet (silent, not contradicting). Catalog field: `nosSupported` includes `'dell-sonic'`
  AND `dfmVerify:true` on these three switches ONLY — no other Spectrum model.
- **NVIDIA Pure SONiC** — a COMMUNITY open-source distro NVIDIA also offers
  (`NV-SN4700.txt:777`: "community-developed, open source"). **NOT** Dell Enterprise SONiC, no
  DFM support, despite sharing the word "SONiC."
- **NVIDIA Cumulus Linux** — NVIDIA's own commercial NOS. No DFM support.

Every Spectrum switch in the catalog runs Cumulus or Pure SONiC; SN5600/SN5610/SN2201
additionally carry the verify-flagged Dell-SONiC path. Never infer DFM applicability from the
presence of the substring "SONiC" in a switch's `os` display string — read `nosSupported`.

### 4a. Redundancy is an input to leaf selection *(ruling 2026-07-16c, Ruling 1)*
A redundant, MC-LAG-eligible 25G fabric's leaf must afford **uplinks + the 2-port ICL**. The
density-only ladder can under-pick an economy leaf (S5212F/S5224F-ON) that seats the uplinks but
not uplinks+ICL, silently dropping the pair to EVPN-MH. The engine STEPS the leaf model UP to the
**standard S5248F-ON** (capped there — never S5296F-ON, which would contradict the published
PowerStore leaf) so the peer-link fits, rather than shrinking uplinks (the rejected fabric-degrading
trade). **Spined fabrics only** — a no-spine ToR pair's uplink floor is spurious and the FDC exports
pin those to economy leaves (S5212F/S5224F VLT pairs). Auto-mode only; an explicit `leaf25` override
wins, and S5224F-ON stays for non-redundant / economy designs. — enforced: engine step 3b,
`tests/fixtures/fixture-5-reused-spine-mclag.json`.

## 5. Storage attach
- **PowerScale back-end must be a dedicated network**, physically separate from front-end;
  **minimum 3 nodes**. *(h15963)* — enforced: platform + validate #6/#11.
- **PowerStore / PowerMax / PowerFlex**: iSCSI / NVMe-TCP, **MTU 9216**, dual-fabric. PowerFlex is
  heavy east-west → leaf-spine, LACP node bonds, separate data/mgmt VLANs. *(h18234, PowerMax SS,
  h19678.3)*.
- **ObjectScale (object/S3)**: **public front-end + dedicated private back-end** switch pairs,
  node NICs **LACP-bonded** on both; EX500/EX5000 use **S5248F** for both pairs (25GbE; 100GbE on
  XF960); racks of 5+ nodes; attach nothing else to the back-end. *(H16016)* — enforced: platform
  + validate #21l.
- **APEX Cloud Platform / Azure Local (Azure Stack HCI)**: storage network is **RDMA (RoCEv2 or
  iWARP)** with **SET teaming**; RoCE needs a **lossless** fabric (PFC/ECN); ToR must be on
  **Microsoft's Azure Local approved switch list**, or use **switchless storage networking** for
  small (2–3 node) clusters; converged vs non-converged NIC layouts. *(APEX/Azure Local Scalable
  Deployment Guide, Jun 2026)* — enforced: platform + validate #21k.
- **Block-storage protocol sets the fabric class:** **iSCSI / NVMe-TCP** = standard fabric, jumbo
  9216, storage VLANs (SFSS automates NVMe/TCP discovery); **NVMe over RoCE** = **lossless (PFC +
  ECN/DCQCN, no-drop queues) AND non-blocking 1:1** — same class as an AI fabric. *(PowerStore/
  PowerMax guides; h04600)* — enforced: `rules.storageProtocol` + engine oversub cap + validate
  #21n.
- **Second NIC ("nic2") purpose is a customer-stated answer, never assumed.** A host's second NIC
  is just as often a second/legacy LAN or a management-adjacent network as it is storage — the
  Guided wizard and Discovery ask explicitly ("What does the second NIC connect to?" — Storage vs.
  a second front-end/data network); the engine reads `nic2.network`, defaulting to `'storage'`
  only when genuinely unstated (back-compat for older saved designs). This also determines
  convergence eligibility (§0b) — a second NIC mislabeled storage couldn't converge with the
  primary NIC even when the customer wanted it to.
- **PowerScale cluster hard max = 252 nodes** (single-node increments; Dell H16346.8, Mar 2025).
  A 252-node back-end uses 64-port leaf/spine switches (Dell large-cluster design, H17682). Tool:
  PowerScale > 252 nodes → ERROR advising a split into `ceil(nodes/252)` clusters, each with its
  own dedicated back-end fabric; > 226 → an approaching-limit info note. Exactly 252 is allowed.

## 6. AI hardware anchors
- **XE9680 = 8 GPUs**, one rail (NIC) per GPU at the GPU generation's native speed. *(H20082,
  h04600)*
- **Z9864F-ON supports 128 GPUs @ 400GbE** rail-optimized in one switch (Broadcom TH5, 64×800G =
  128×400G). *(H20082)*
- AI Factory 2-8-5-200 (endorsed): up to 16× XE7740/XE7745, 2× SN5610 + 1× SN2201, PowerScale
  F710, Spectrum-X, EVPN-VXLAN + EVPN-MH. *(AI Factory brief)*.
- AI Factory **2-8-9-400** (endorsed): up to **12× XE9680 (8× H200 SXM)**, 2× SN5610 converged +
  1× SN2201 OOB, PowerScale F710, 4× R670 mgmt; 400GbE Spectrum-X, RDMA/RoCEv2 + PFC + ECN.
  *(NVIDIA 2-8-9-400 ERA brief, Aug 2025)* — enforced: `reference-architectures.js`.
- **GPU generation sets the rail speed:** Hopper/H200 (XE9680/XE9685/XE7745) → **400GbE** rails
  (ConnectX-7); **Blackwell B200** (XE9780/XE9785) → **800GbE** rails (**ConnectX-8 SuperNIC**,
  800G Gen5 Socket Direct). One rail/GPU either way. *(XE9780/XE9785 tech guides; ConnectX-8
  datasheet)* — enforced: platform `models[]` + engine drill-down.
- **GB300 NVL72 (rack-scale, PUBLISHED design):** each NVL72 rack (SU) = 18 trays / 72 GPUs in one
  NVLink domain. Scale-out = **dual-plane 400G on SN5600 (128-port)** — each GPU gets **2× 400G
  paths** (ConnectX-8 twin-port 800G OSFP split), 4 leaf switches per plane, plane 2 mirrors plane
  1. Per published RA: **12× SN5600 GPU network per 1–2-SU block**, **2× SN5600 converged per
  rack**, **144× 400G GPU + 36× 400G CPU uplinks per SU**, 36× customer + 18× storage connections
  per SU. Tested to 8 SU (576 GPUs). *(NVL72 AI Factory RA, Mar 2026 — per-SU counts published)* —
  enforced: RA `published()` scaling (outranks generic math). This path prices every cable
  (including cross-block leaf-to-spine links) as in-rack DAC; at n>1 SU it warns that some links
  genuinely need AOC/optical reach per the RA's own "leaves serve 2 racks" design — a stop-gap,
  not full rack-placement modeling (tracked as an open item in GAPS.md).
- **Spine-count rule:** general fabrics = 2–8 spines (derives from the leaf's uplink radix,
  H18364); **AI folded-Clos = k spines for k uplinks per leaf** (unbounded by 8); each spine
  terminates one link per leaf, so **leaves must fit the spine's breakout-adjusted radix** —
  beyond that it's a 3-tier super-spine design. **Published RA tables outrank the generic math.**
  — enforced: engine spine sizing + port-budget checks.
- **AI compute fabric minimum = 2 switches** (rails striped across the pair) on any redundant
  design — every validated ERA uses ≥2 (2× SN5610 at both design points). Dell's published
  "single switch AI GPU fabric" (h04600) is a small-cluster/PoC topology only — a lone switch is a
  cluster-wide SPOF and is flagged. — enforced: engine AI leaf floor + validate.
- **PowerStore SFM DG worked design (h04504):** S5248F-ON leaves + **S5232F-ON spines** for small
  (≤8-leaf) 100G fabrics; BGP EVPN VXLAN via SFM. **Peer-link sizing (published): ≥2 ports at
  100GbE+, ≥4 when sub-100G.** PowerStore cluster traffic prefers 100GbE+. — enforced: engine
  spine pick + speed-aware ICL.
- **A quoted link must be PHYSICALLY BUILDABLE, not merely speed-matched.** A transceiver only
  goes in a port whose CAGE accepts it: a 400G QSFP56-DD module fits neither a QSFP28 cage
  (double-density) nor an OSFP cage (different MSA). Impossible = **hard error**. The cage table is
  a VENDOR FACT in `CATALOG.formFactor`, read by BOTH the engine (at pick time) and validate #23
  (final-BOM sweep), so they cannot disagree. QSFP112 is its own cage — QSFP-DD cages do not accept
  it (100G-PAM4 won't downshift). SFP-into-QSFP is possible ONLY with a QSA28 adapter, which is a
  real orderable part and never a free assumption. — enforced: `CATALOG.formFactor`, validate #23.
- **NO PHANTOM CREDIT: capacity may only be credited to a link that has a cataloged part behind
  it.** Three rules follow, and they are one principle:
  1. **400G is the HOST/RAIL speed.** An inter-switch hop between SAME-CAGE switches runs at the
     **native port speed** (a Z9864F-ON pair links OSFP112↔OSFP112 at 800G). Sizing must not credit
     a spine with breakout-adjusted ports for a switch↔switch hop that has no part.
  2. **A breakout is legitimate ONLY when a cataloged part with the correct FAR END exists.** The
     far ends land on the *other* device — an assembly that fans out to QSFP56-DD hosts cannot
     reach another OSFP switch port, whatever the speeds say.
  3. **A super-spine candidate qualifies only if it can TERMINATE the pod-spine's uplink speed** —
     native match, or a cataloged breakout with far-ends that seat. Radix alone is not
     qualification. Failing that, step to the **same-speed** switch (the G-001 ladder principle,
     part-evidence-gated) and let the tier widen by port math. The flagship is GATED, not banned:
     catalog a qualifying part and it re-enters automatically. A passed-over flagship MUST be
     explained with an info line naming the reason, so a wide tier reads as a parts decision rather
     than an error. — enforced: `superSpineTerminates` / `pickSuperSpine`, `resolveUplinkBreakout`,
     engine step 2 (`fs.uplinkSpeed` for AI).
- **Published RAs cable per their OWN cited document; general cabling rulings bind the COMPUTED
  path only.** `published()` exists to reproduce an endorsed design's own counts and parts, so a
  general engine ruling never overrides a cited RA. **A conflict between the two is a
  stop-and-ask** — never a silent override in either direction. (Live case: the GB300 NVL72 RA
  states *"a dual-ported optic at the ConnectX-8 OSFP port"* → MMA4Z00-NS, 1 per 800G NIC port =
  2 plane links; the computed path uses the MCP7Y00/Y10 1:2 splitter instead.)
- **Where two parts differ only by the FAR-END connector, the connector is ASKED, never guessed**
  (derive-then-ask). Reading a cage a vendor DECLARES is not defaulting; inferring one from a NIC
  generation that ships in both cages is. Order: explicit answer → an RA that cites it → a NIC
  model the vendor pins → `'unsure'`, which quotes one variant **verify-flagged** rather than
  blocking (a like-for-like swap: no design or quantity impact). — enforced: `railNicCage`
  (INPUT-SCHEMA), `formFactor.railNicCageOf`, wizard conditional reveal.
- **A 1:2 assembly carries TWO links per ordered part.** Quantity = links ÷ `linksPerAssembly`,
  never one-per-link. The line carries `linksPerAssembly`/`coversLinks` so the ordered quantity, the
  printed note arithmetic, and every BOM-integrity invariant derive from the SAME number and cannot
  drift apart. — enforced: P13/P13b, invariants line-arithmetic, audit-boms/scaling/multitarget,
  `design.js` cable records.
- **PowerStore storage ToR pair is MC-LAG/VLT WITH a peer-link — never independent A/B**
  (H18157.11, *Clustering and High Availability*, Apr 2026). The cluster/mgmt **system bond is a
  switch-DEPENDENT LACP aggregate across BOTH ToRs**, so the pair must be peer-linked: multi-
  appliance ICM/ICD traffic rides that LACP bond through the ToRs, cross-switch bonds require VLTi
  ("must be configured"), and the HA reference diagram (Fig. 43) shows the interconnected pair
  labelled LACP/vPC. Requesting independent A/B on this platform is refused with a warning, not
  silently honored. A real PowerStore quote therefore carries **2× 100G ICL DAC per storage pair**.
  *(FSN — Fail-Safe Networking — is an active/passive LAG alternative for **NAS interfaces** only;
  it does not relax this. Revisit if file/NAS deployment variants get modeled.)* — enforced:
  `platform.powerstore.systemBond`, engine redundancy block, Fixture #5.
- **PowerScale back-end VERIFIED PNs (OneFS Supportability Guide Table 33):** S5232 = **210-BCVB**,
  Z9664 = **210-BCJH** (2025; 100G or 200G FLAT topology only), Z9264 = 210-AWOW. — enforced:
  `rules.backend.powerScaleBackendPNs` + validate #21i. Supported back-end switches (Table 4,
  p.14): S5232F-ON, Z9664F-ON, Z9264-ON (Dell), plus Arista 7308X3 and NVIDIA Spectrum-4 SN5600
  (via the Dell ETC program, manual config, Cumulus 5.9.1). EOL for back-end: Z9100-ON, S4148F-ON,
  S4112F-ON. Mixed 100G + 25/10G node speeds share one 100G switch via breakout. — enforced:
  `rules.backend`, validate #21i.
- **PowerScale back-end = int-a / int-b, and stays FLAT as long as possible:** two INDEPENDENT
  networks on separate subnets (one node port to each; **OneFS RBM failover — no bonding, no
  ICL**). Scale ladder: **S5232 flat ≤32/fabric → Z9664 flat ≤64** (its BE SKU is published "flat
  topology only"; QSFP28 plugs natively into QSFP-DD) **→ leaf-spine beyond**. *(h16346; OneFS
  Supportability Guide Table 33)* — enforced: engine BE ladder + independent-ab.
- **FDC-validated 100G converged leaf:** dense 100G host fabrics that outgrow one S5232F use
  **S5448F-ON leaves** (48×100G SFP56-DD + 8×400G uplinks, 400G-class VLTi) under **Z9664F
  spines** — per FDC's converged export (8× S5448F + 2× Z9664F). Small 100G attach stays S5232F.
  *(FDC converged + dedicated-SAN exports)* — enforced: engine 100G ladder.
- **Network refresh pattern:** like-for-like(+) replacement — same access count as **SONiC MC-LAG
  pairs** at the target speed; 3-tier collapses to leaf-spine; parallel build with **rack-by-rack
  cutover** (pre-stage VLANs/MTU 9216/LACP; decommission old tier last); client cabling reused
  where media matches. — enforced: `recommendRefresh` + refresh journey.
- **FDC-validated leaf right-sizing (25G, non-AI):** Dell's Fabric Design Center picks the
  smallest S52xx that fits the rack demand — **S5212F ≤12 / S5224F ≤24 / S5248F ≤48 links per
  fabric side; S5296F for dense server racks** (FDC mid-size: 8× S5296F at 64 downlinks/leaf).
  Storage/back-end remain S5248F per the published PowerFlex/PowerStore DGs. FDC also
  independently confirms: S5232F spines at these scales, and the **2× 100G / 4× sub-100G
  peer-link rule**. The tool keeps H18364's oversubscription-driven uplink sizing rather than
  FDC's own leaf→spine default (1 link/leaf/spine minimum wiring). *(FDC-*.json exports,
  ground-truth checks FDC-F1..F5)* — enforced: engine right-size ladder.
- **Physical port budgets are hard errors:** host + ICL ≤ access ports (port-class-aware), uplinks
  + ICL ≤ uplink ports, Σ leaf-uplinks ≤ spine ports (breakout-aware, credited only against a
  catalog-real breakout part — see § AI switch selection). A BOM that requires more ports than the
  switch has is rejected, not warned. — enforced: validate #22.
- **Switch capacity convention:** Dell PowerSwitch spec sheets publish **full-duplex** switching
  capacity; NVIDIA Spectrum publishes single-direction. Catalog matches each vendor's own spec
  sheet convention. Display-only; sizing uses ports, not Tbps. *(Dell switch spec sheets,
  harvested — see CITATION-LOG.md for current re-verification status)*

## 7. Inter-switch & core connectivity
- Each SONiC/OS10 ToR pair that uses MC-LAG/VLT needs its **peer-link** (2× links); EVPN-MH
  leaf-spine needs **none**. — enforced: engine interconnect logic.
- **Uplinks to the core/backbone must be redundant (min 2)**, typically from the spine or a
  **border-leaf pair**; Dell supplies the fabric-side optics, the core switch + matching optics
  are usually **by others**. *(H18364.2)* — enforced: `rules.coreUplink`, engine core-uplink,
  validate #19.
- At scale the **OOB management network itself can be a leaf-spine BGP-EVPN fabric**. *(h04600
  "Multi-switch OOB management fabric leaf and spine with BGP EVPN")*.
- **Border-leaf pair (external / DCI egress):** Dell's EVPN-VXLAN multisite/DCI design uses a
  DEDICATED border-leaf MC-LAG pair as the north-south exit (the border VTEP), keeping
  external/DCI traffic off the spine ports — the clean insertion point for DCI, firewalls, and
  route leaking. Tool: `borderLeaf:true` (with a core uplink) adds a 2-switch pair (Z9432F for
  400G-class, else S5232F), its spine uplinks (every border leaf to every spine) and ICL, and
  routes the core optic from it. Requires a leaf-spine fabric; on a ToR-only design it warns and
  does nothing.

## 7b. Edge / access (campus) & inter-network
- **Access layer:** client endpoints → **E-series PoE access switches** (E3248PXE 802.3bt 90W
  mGig / E3248P 802.3at 30W 1G; both with 2×100G QSFP28 uplinks) running **Dell Enterprise SONiC
  (Lite bundle)**. **MC-LAG is CONFIRMED on E3248P/E3248PXE per the Enterprise SONiC Compatibility
  Matrix** (L2 + graceful shutdown + fallback + LACP-individual). **E3224F-ON is OS10-only (absent
  from the SONiC matrix) — no SONiC MC-LAG on the fiber model**; requesting E3224F-ON with
  redundancy is a hard `error` (the requested switch count still shows, labeled "REQUESTED — NOT
  achievable", and the ICL cable is never priced) — this is a genuine Dell portfolio gap (no
  fiber-SFP E-series switch has a SONiC MC-LAG path), never silently resolved to VLT/OS10 (this
  edge line is deliberately SONiC-only, no VLT/stacking). Deploy access as **MC-LAG pairs** (ICL
  peer-link); each switch uplinks to **both** distribution switches (active/active, no STP). **The
  MC-LAG pair IS the "stack"**: one logical switch, hitless firmware upgrades (spec sheet), but
  independent control planes (a software fault can't take the whole pair down). No switch stacking
  exists — scale by adding pairs. Client cabling is structured & typically **by others**; size the
  **PoE budget** to the endpoint mix. *(E3200-ON Spec Sheet; Enterprise SONiC Compatibility Matrix
  Table 7)* — enforced: `recommendEdge` + validate #21m.
- **Every E3200 access switch has TWO uplink classes — the situation picks which goes up**:
  E3248P-ON = 4×10G SFP+ AND 2×100G QSFP28 (rear); E3248PXE-ON = 4×25G SFP28 AND 2×100G;
  E3224F-ON = 4×10G SFP+ AND 2×100G. Whichever class is NOT uplinking carries the MC-LAG ICL.
  - **100G mode (default)**: rear pair uplinks (1 to each distribution member); ICL on the 4× SFP
    ports (sub-100G ICL needs ≥4 links per h04504).
  - **SFP mode (10/25G)**: the 4× SFP ports uplink (2 to each member — existing 10/25G
    aggregation, budget sites); ICL moves to the 2×100G rear pair (≥100G ICL needs only 2).
- **Distribution radix ladder, per uplink class** (each member terminates its links per access
  switch + 4 reserved: 2 ICL + 2 core/future):
  - 100G mode: **S5232F-ON** (32×100G) ≤28 access → **Z9264F-ON** (64×100G native) ≤60 →
    **Z9432F-ON** ≤124 — its 128×100G exist via 400G→4×100G BREAKOUT, so the BOM prices breakout
    assemblies (uplinks ÷ 4) and a native-400G pair ICL, and the fabric carries the breakout
    marker so port-budget checks credit 128, not 32 cages.
  - SFP mode 25G: **S5248F-ON** (48×25G) → **S5296F-ON** (96×25G) dense. SFP mode 10G:
    **S4348F-ON** (48×10G SFP+).
- **Beyond the ladder: LOUD, never silent** — a multi-pair distribution / campus-core warning
  fires (split the access layer across distribution pairs or add a campus spine; engage a network
  SE). The refresh flow uses the same 100G ladder.
- Port-budget checks (validate.js AND the independent harness) budget each uplink class against
  its own consumer — uplinks vs the uplinking class, ICL vs the other — never lumped together.
- **10G fiber leaf = S4348F-ON** (Broadcom Trident3-X5, Enterprise SONiC, 2.16 Tbps, 48×10G SFP+
  (+12 breakout, also takes 1G SFP), 6×100G QSFP28 uplinks — QRG June 2026). The S41xx series
  (S4148F-ON, S4128F-ON, S4112F-ON — SmartFabric OS10, Broadcom Maverick) is end of sale and never
  quoted; S4148F-ON stays in the catalog flagged `eol:true` for brownfield recognition only.
- **1G/10G copper (Base-T) host NICs route to S4348T-ON** (same tier as S4348F-ON — Trident3-X5,
  Enterprise SONiC, 2.16 Tbps, 6×100G QSFP28 uplinks — but with 48× **native RJ45** 1/10GBase-T
  access ports) with a plain Cat6A patch cable, not a fiber leaf + electrical SFP-1G-T/SFP-10G-T
  module. **S4348T-ON's RJ45 ports are multi-rate** (1G and 10G auto-negotiate on the same
  port/switch) — a pool of 10GBase-T hosts and a pool of 1GBase-T hosts can share ONE S4348T-ON
  leaf tier (see §0b). The `sfp-10g-t`/`sfp-1g-t` electrical-module catalog entries are kept for
  reference (real Dell PNs — e.g. a brownfield refresh adding copper to an *existing* SFP+-only
  switch) but are not selected by the main sizing path.
- **Full-NVIDIA stack:** choosing the NVIDIA AI stack makes **every fabric of the AI target**
  NVIDIA — Spectrum leaves/spines for compute AND storage/front-end, SN2201 OOB, and **NVIDIA
  LinkX cabling at every speed** (25/100/400/800G + breakout). Stacks never share a spine. Non-AI
  targets in the same design remain a Dell pod. — enforced: engine per-target stack + per-stack
  spine groups.
- **NVIDIA NOS = Cumulus Linux.** SN-series switches are **absent from the Dell Enterprise SONiC
  compatibility matrix** — they run NVIDIA Cumulus Linux (validated designs qualify Cumulus, e.g.
  5.9.1 for SN5600 w/ PowerScale ETC). **Dell Fabric Manager (DFM) manages Dell Enterprise SONiC
  only** — scope it to the Dell portion of a mixed design. *(SONiC Compat Matrix; OneFS
  Supportability Guide)* — enforced: validate #14 + NVIDIA-NOS info.
- **NVIDIA NIC ↔ speed map:** ConnectX-6 Lx = 25G · CX-6 Dx = 100G · CX-6 = 200G · CX-7 = 400G ·
  **CX-8 = 800G** · BlueField-2 = 100/200G · BlueField-3 = 400G — captured in every NIC question.
- **OOB manages every switch:** the out-of-band network reaches **every leaf / spine / access /
  distribution switch's management port**, not just host iDRAC/BMC. — enforced: engine mgmt
  sizing.
- **Inter-network connectivity:** connect the border/spine to the **existing core / another
  fabric / a second site (DCI)**; **L3 routed** (eBGP + BFD / OSPF / static, LACP or ECMP) or **L2
  stretched over BGP EVPN-VXLAN** (anycast gateway, storm-control — never raw STP stretch);
  **DCI** = confirm distance/optics (LR/ER/ZR/coherent) + MACsec, route don't bridge. — enforced:
  engine core-uplink + validate #19. **Discovery omits core-uplink questions by design; resolved
  at quote time in guided/expert paths** (maintainer ruling, sweep finding #4, 2026-07-17).

## 8. Management & operations (business layer)
- **Dell Fabric Manager (DFM, formerly Verity)** = intent-based networking for Dell Enterprise
  SONiC: single pane of glass, zero-touch provisioning, continuous validation/auto-remediation,
  graceful brownfield migration. *(be-net.com/dell — corpus/MG-DFM-BENET.txt)*.
- **DFM applicability is a PER-MODEL CATALOG FACT, not a wizard question or a vendor-blanket
  check** *(R14 ruling 2, 2026-07-23 — supersedes the work order's proposed `nvidiaNos` input,
  which was never built; see §4z for the terminology this ruling depends on)*. `window.dfmStatus(res)`
  reads the ACTUAL switches on the finished BOM (ground truth, not `input.stack`) and returns
  whether DFM applies at all, and whether that applicability rests ENTIRELY on the three
  verify-flagged Spectrum models (SN5600/SN5610/SN2201) with no plain Dell PowerSwitch backing
  it. A design with no DFM-manageable switch at all (pure Cumulus/Pure-SONiC NVIDIA) gets an
  info line naming why and pointing at NetQ/NVUE instead of the software line. A mixed design
  (some DFM-manageable switches, some genuinely not) still attaches DFM but validate.js scopes
  it to the manageable portion — "Cumulus" alone is never the scoping test, since a genuinely
  DFM-manageable NVIDIA switch (dfmVerify) would be wrongly excluded by a raw vendor check.
  Shared by every attach site — wizard × 5, Expert Form × 1, plus the BOM-tab DFM value card
  (`js/ui.js`'s Dell/NVIDIA switch counts) — so no entry point can drift from another. — enforced:
  `js/engine.js` `dfmStatus()`, `js/wizard.js`/`js/app.js` `addVerity()`, `js/validate.js` check
  #14, `tests/unit-engine.js` "dfmStatus" block, `js/selftest.js`.

## 9. Optics & cabling
- **Cable class follows placement / distance:** **passive DAC** in-rack (≤2–3m, ~2m at 800G,
  cheapest, lowest power); **AEC** 3–7m (active copper, thin, low power); **AOC** adjacent-rack /
  end-of-row (≤~30m); **pluggable optical transceivers over structured fiber** for cross-row/room
  (100m+ OM4 MMF / km+ OS2 SMF). **Leaf→spine and cross-rack runs are optical; DAC is in-rack
  only** — `pickHostCable`'s adjacent-placement branch resolves ONLY to AOC or `null` (never a
  silent DAC fallback). *(Optics Spec Sheet; leaf-spine RA)* — enforced:
  `rules.cabling.placements`, engine `pickHostCable(placement)`.
- **Connector / form factor is deterministic per speed** — SFP+ (10G), SFP28 (25G), QSFP28 (100G),
  QSFP56-DD (200/400G), OSFP (400/800G), OSFP224 (1.6T). — enforced:
  `rules.cabling.connectorsBySpeed`, shown in topology + Checks.
- **Breakout multiplies logical ports and changes optic count** — one 400G port → 4×100G (or 100G
  → 4×25G); a 32-port switch can present up to **128 logical ports**. A breakout is only ever
  credited (for port-budget or radix purposes) when a catalog-real part exists for the exact
  (high-speed, low-speed) pair AND the customer hasn't disabled breakout — resolved through one
  shared function (`resolveUplinkBreakout()` in `js/engine.js`), never re-derived independently at
  each cabling decision point. Confirm the OS supports the mode. — enforced: engine breakout on
  leaf→spine and pod-spine→super-spine uplinks (`pickBreakout`/`resolveUplinkBreakout`), Checks
  port-math note.
- **Structured cabling**: confirm existing fiber + patch panels vs include them.
- **Cable the fabric with the fabric's own vendor's optics:** a **NVIDIA Spectrum-X** (AI) fabric
  uses **NVIDIA LinkX** (800G twin-port OSFP DAC/ACC/SR8/DR8, 2×400G breakout, 400G SR4/DAC); Dell
  fabrics use Dell optics. Twin-port OSFP = 800G electrical presented as 2×400G optics (2×
  MPO-12/APC). *(NVIDIA LinkX; Dell Optics Spec Sheet)* — enforced: engine per-fabric optic
  vendor.
- Reach zones (100G/lane SerDes): passive DAC ≤2–3m (~2m at 800G) · AEC 3–7m · AOC ≤~30m · optical
  transceiver 100m+ (OM4 MMF) / km+ (OS2 SMF).
- Connectors by lanes: MPO-12 for 4-lane (SR4), MPO-16 for 8-lane (400/800G SR8); duplex LR/FR =
  LC.
- Fiber & polish: OM4 MMF in-building (UPC polish); OS2 SMF leaving the building (APC polish). UPC
  and APC must NEVER be mixed on a link. Pick one polarity method (Type A/B) facility-wide.
- Structured-cabling BOM = the full channel: transceiver → MPO trunk → MPO cassette → patch panel
  → LC patch cord. The tool itemizes these (vendor-neutral estimate) when placement=structured and
  the plant is not already in place. Model: 12-fiber cassette = 6 duplex links; 2 cassettes + 2
  patch cords per link-group (both ends); ~4 cassettes per 1U panel; 1 trunk per 6 links.
- Roadmap: LPO (linear pluggable, ~40–50% less optic power) and CPO for GPU clusters — 2027–28.
- **Two optics per fiber link — when we own both ends.** A DAC/AOC/breakout is ONE integrated part
  with both ends attached; a standalone transceiver link needs a transceiver at EACH end plus the
  fiber between them. How the engine books the two ends depends on who owns them: switch↔switch
  hops we own both ends of (leaf↔spine, pod-spine↔super-spine, border-leaf uplinks, refresh
  access↔distribution) quantify ONE line at 2/link; structured host runs split into TWO 1/link
  lines (switch side + host/NIC side, since the NIC end needs its own compatibility check); the
  core/inter-network uplink stays 1/link deliberately — the far end is by others, who supply their
  own optic. Base-T copper runs get no host-side module at all (fixed RJ-45 jack).
- **Host/NIC-side optics are the NIC vendor's problem, but OUR quote's line item.** NIC vendors
  commonly require their own branded/coded optics (NVIDIA ConnectX → LinkX; Broadcom/Intel per
  their compatibility lists). The tool itemizes the host-side transceiver with a verify flag and a
  compatibility note — never silently assumes the Dell optic works in the NIC.
- **Patch cords are a real line item — and the connector follows the OPTIC.** Standalone optics
  ride fiber: 2 cords per link (one each end). PARALLEL optics (SR4/SR4.2/SR8/DR8) present an MPO
  connector → MPO jumpers (MPO-12 for 4-lane, MPO-16 for 8-lane); DUPLEX optics
  (SR/FR/LR/LR4/CWDM4) present LC → LC duplex cords, polish matching the fiber (UPC MMF / APC
  SMF). Never quote LC cords against an MPO port. Itemized for structured host runs, structured
  leaf↔spine runs, and core/inter-network uplinks on transceivers.
- **Reach ladder (what to pick when)**: SR/SR4 ≤100m OM4 MMF (in-building) → FR/CWDM4 2km OS2 SMF
  (campus/between buildings) → **LR/LR4 10km OS2 SMF** (metro/inter-site; SFP-10G-LR, SFP28-25G-LR,
  Q28-100G-LR4, 400G FR4/LR4 — all on the Dell optics sheet; ER 40km / ZR 80km exist at 10G) →
  coherent ZR/ZR+ for true DCI distances (engage Dell Advanced Engineering).
- **Uplinking to ANOTHER VENDOR's switching interoperates by IEEE standard, not by brand.** Both
  ends must run the SAME PMD (LR4↔LR4, SR4↔SR4, FR↔FR), same fiber type and wavelength. Quote the
  Dell-branded optic for the Dell port ONLY; the far side supplies its own vendor's optic (many
  third-party switches reject or warn on unbranded optics). The tool's core-uplink flow asks reach
  (short/campus vs 10km long-reach) + far-end vendor (Dell vs other) and notes the interop rule.
- **DCI defaults to long reach** unless explicitly overridden — a second site is by definition not
  in the same room. Confirm actual distance/loss budget; MACsec for links leaving the building.

## 10. Sizing intent — oversubscription is where "sized right" is decided
- **Traffic pattern sets the oversubscription target, which sets uplinks-per-leaf:**
  `uplinks = ceil(accessBW / (uplinkSpeed × target))`. North-south heavy tolerates ~3:1; balanced
  ~2:1; **heavy east-west (AI, distributed storage, HPC) is effectively non-blocking 1:1**.
  Storage/back-end still capped at 2:1. *(H18364.2, H20082)* — enforced:
  `rules.oversubscription.profiles`, engine oversub-driven uplinks.
- **Spine count ≥ 2** for redundancy; **two-tier → three-tier (super-spine)** past a switch tier's
  breakout-adjusted radix (~2,000 GPUs / high leaf counts as a rule of thumb). *(H20082)* —
  enforced: engine + validate.
- **Non-blocking (1:1) = uplink BW ≥ access BW.** H18364 p.10: 32×25GbE (800G) → **8×100GbE
  uplinks** for 1:1. For **AI same-speed fabrics** it's a **folded Clos** — a leaf split half-down
  (GPU rails) / half-up (spine), so max rails/leaf = radix ÷ 2 and #uplinks = #rails. AI and heavy
  east-west REQUIRE non-blocking; storage/back-end cap at 2:1. When a leaf can't reach 1:1 (out of
  uplink ports), pick a higher-uplink leaf (S5448F 8×400G), higher-radix spine, or breakout. —
  enforced: engine folded-Clos sizing + `nonBlocking` flag + validate remedy.
- **Buffer / latency follow the workload** — storage rebuild/replication and AI training create
  many-to-one **incast** → prefer deep / dynamically-shared-buffer leaves + low latency; general
  compute tolerates shallow buffers. *(H20082)* — surfaced in Checks.
- **Speed-migration roadmap** (25→100, 100→400) → choose **multi-rate optics/switches** now
  (upgrade optics, not the chassis). — surfaced in Checks.
- **Brownfield / add-to-existing** → the BOM is **incremental**; reuse the existing spine when it
  has capacity — but a newly-required 3rd tier (pod-spine/super-spine) still ships in full even on
  a reuse-spine design; only a flat 2-tier addition that fits the existing spine's capacity skips
  new spine hardware. Confirm existing switch models, free ports, speeds.

## 11. Audit decisions
- **PowerScale back-end stays a dedicated fabric** — it is excluded from any shared spine (its own
  spine group). *(§5, h15963)* — enforced: engine spine-grouping.
- **Small AI clusters use a single switch / pair** (no spine) when the GPUs fit; go leaf-spine only
  past a threshold. *(H20082 single-switch topology)* — enforced: engine.
- **AI fabric stack must be explicitly chosen** (Dell or NVIDIA — no default). — enforced: engine
  throws without a stack; UI forces the pick.
- **Network architecture (converged / shared-spine / separate) is a user option** — see §0b for
  the full decision. — enforced: `input.fabricArchitecture`.

## Multi-rack deployments (FDC rack_topology pattern)
- **GOVERNING RULE — never quote hardware for a rack the user didn't declare.** `racks = N`
  means exactly N physical racks. The tool must not add an (N+1)th rack's worth of equipment on
  an assumption. Concretely:
  - **OOB/mgmt switch count = the `racks` input** — one OOB switch per declared rack, no more. Not
    `racks + 1`.
  - **Spine equipment is housed WITHIN the declared racks**, not in an assumed dedicated spine
    rack. A genuine dedicated network/spine rack is the user entering `racks = N+1` themselves — a
    stated input, never an inference.
  - This is the concrete, pinned form of the low-utilization concern (backtest B6): silently
    sizing to an undeclared rack is the same class of error as silently sizing to rack count
    rather than port demand.
- **Every node rack gets its own ToR MC-LAG pair (exactly 2 switches) + its own OOB/mgmt switch.**
- Hosts pack by cluster, ≈16× 1U hosts per node rack (mid-size export: 4 racks × 16 servers = 8×
  S5296F).
- A target that fits in one rack (e.g. a 4-appliance PowerStore) keeps a single pair in its own
  rack.
- Cross-rack runs (leaf→spine, and hosts reaching CENTRALIZED fabrics such as a dedicated SAN,
  back-end, or a second-NIC fabric) exceed passive-DAC reach — use AOC/fiber.
- AI rail fabrics are ROW-scale, not per-rack: GPU rail runs to other racks need ACC/AOC/optics
  (DAC ≤3 m), and GPU servers typically land 3–4 per rack on power.
- A target spanning multiple racks (or multiple targets merged into one converged fabric spanning
  racks) is sized against the WORST-CASE (max) rack span across every contributor, never an
  arbitrary one — this is a real, not theoretical, case once converged/multi-target designs are
  in play.
- Engine: `racks` input applies the pattern (pair-per-rack on each target's primary fabric via
  `racksSpanned`, **one OOB per declared rack**, cable class step-up for centralized fabrics).
  (Backtest F1/B6: current code quotes an extra spine-rack OOB — a Phase-2 defect pinned by the
  golden fixtures.)

## 100G general/storage spine selection
- **Auto ladder**: S5232F-ON (32×100G, ≤8 leaves) → **Z9264F-ON (64×100G native, ≤64 leaves)** →
  Z9432F-ON (32×400G native, needs breakout for 100G) beyond that. Explicit `breakout:'on'` routes
  straight to Z9432F-ON/beyond (respects the customer's stated preference for breakout-capable/
  future-proof gear). — enforced: engine spine-group sizing (`grp.spine` ternary chain).

## 100G leaf selection (choice, not mandate)
- **Auto ladder** (default): S5232F-ON (32×100G QSFP28) small/flat → S5448F-ON when >32 links/fabric
  or when non-blocking (RoCE 1:1) demands its 8×400G uplinks.
- **Overrides**: Z9264F-ON (64×100G standard QSFP28, 2U — dense leaf without the S5448F's SFP56-DD
  PAM4 caveat; can absorb mid-size fabrics as a flat ToR pair with no spine), or force
  S5232F/S5448F.
- Switches WITHOUT dedicated uplink ports (S5232F, Z9264F, Z-series as leaf) spend 4 ACCESS ports
  on uplinks once a spine exists — the engine reserves them so hosts are never overbooked.
- An override that cannot meet the stated oversubscription/1:1 target is allowed but LOUD
  (warnings surface the ratio and the remedy) — never silent.

## 25G leaf selection (choice, not mandate)
- **Auto ladder** (default, FDC-validated): S5212F-ON (12×25G) ≤12 links/fabric → S5224F-ON
  (24×25G) ≤24 → S5296F-ON (96×25G, dense server racks) when a frontend fabric is denser with
  48-groups than 96-groups → S5248F-ON (48×25G, storage/back-end default) otherwise.
- **Overrides**: force S5212F/S5224F/S5248F/S5296F directly (mirrors the 100G-tier override — a
  customer standard, price/availability preference, or existing rack fit can all be reasons to
  override the auto pick).
- Same physical-fit safety net as the 100G tier: an override that can't meet the stated target is
  allowed but LOUD, never silent — enforced by the same generic port-budget/oversubscription
  checks (leaf-model-agnostic by construction, not special-cased per switch).

## AI switch selection + AI spine count = port math
- **400G AI rails ride Spectrum-4 SN5600 — leaf AND spine.** Grounded in two published RAs: the
  GB200 NVL72 RA ("Each SU features two SN5600 switches as the aggregation layer or spine layer",
  "SN5600 Leaf switches") and the GB300 NVL72 RA (SN5600 = its 128×400G fabric switch). 800G rails
  → SN5610 (64×800G). SN4700 (Spectrum-3, 32×400G) is the economical ToR for the LOWER-speed host
  fabrics (25/100G via breakout) in an all-NVIDIA stack.
- **AI spine COUNT is port math, not one-spine-per-uplink**: `ceil(total uplinks ÷ breakout-
  adjusted spine radix)`, clamped to [2, uplinks/leaf] (every leaf still reaches every spine;
  parallel leaf→spine links are normal Clos). Breakout credit for this radix adjustment is
  resolved through the SAME `resolveUplinkBreakout()` function used for real cabling — never a raw
  speed-ratio guess (see § Optics & cabling breakout note).
- **The 3-tier trigger and pod-fold math are ALSO breakout-adjusted** the same way — a spine tier
  that genuinely serves more leaves via a catalog-real breakout (e.g. 128 effective ports on a
  64-native-port switch) must not spuriously trigger an unneeded 3-tier Clos.
- Small AI clusters collapse to the validated "2 switches per SU" shape (ERA 2-8-5-200: 2× SN5610
  for 16 nodes) — 64×400G rails fit a single non-blocking SN5600 pair, no spine tier.
- **`pickSuperSpine()` prefers a SAME-SPEED, higher-radix rung** (e.g. Z9432F-ON pod-spine,
  400GbE/32 native, steps to Z9664F-ON, 400GbE/64 native) before jumping to the flagship
  (Z9964F-ON @1.6TbE for Dell, SN6810 for NVIDIA) — keeps pod-spine↔super-spine cabling
  same-speed/cataloged instead of forcing an uncataloged cross-speed breakout. No equivalent rung
  exists for Z9864F-ON pod-spines (no second 800G-native Dell spine) or on the NVIDIA side
  (SN5610→SN6810 is already a same-speed jump straight to the flagship) — both correctly fall
  through to the flagship.
- KNOWN OPEN (documented, deliberate): inside a 3-tier Clos the POD-spine count still uses the
  strict k-per-uplink formula, so very large NVIDIA builds (820+ nodes) can exceed even the SN6810
  flagship's radix and fire the honest 4th-tier warning — that scale is dedicated-SE territory, far
  outside this tool's deal size.

## Best-practice challenge harness
- `tests/challenge-bestpractice.js` encodes authoritative topology best practices as assertions
  across all platforms, workflows, and every major feature (bonding, protocol, ICL sizing,
  EVPN-VXLAN underlay, breakout, border-leaf, multi-rack, brownfield, growth, cabling). Classifies
  each as PASS / GAP / CONFLICT; part of the full test suite and FAILS the build on any CONFLICT.
