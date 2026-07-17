# Backtest 2026-07-16c — four mode BOMs (PowerScale, refresh, edge, AI)

Run on v0.64.1 BEFORE the 16b fixes landed. Where a 16b fix already resolves a
finding, it's verified and noted rather than re-fixed.

## EVPN-MH consistency ruling — RESOLVED (Option b, spare-port scope) + Fixture #5 re-ruled & added

### First attempt (Option 1, universal MC-LAG) — reverted
Option 1 (MC-LAG whenever the ICL fits, EVPN-MH fallback-only, forced everywhere)
hard-failed 9 suites: physical over-commit ("8 uplinks + 2 ICL = 10 > 8 ports" —
forcing an ICL where uplinks already fill the port is unbuildable), FDC
ground-truth (FDC-F1b/F12b VLT structure), LACP system-bond drift. Root cause: ICL
ports must come from somewhere; on a leaf whose uplinks fill its ports you can't add
a peer-link without cutting uplinks. Reverted.

### Ruling (maintainer 2026-07-16c): Option (b), spare-port scope — CORRECT design, not compromise
MC-LAG's peer-link costs 2 leaf ports. Where the leaf has HEADROOM, pay it
(customer-standard). Where uplinks FILL the leaf, EVPN-MH is the purpose-built
answer — cutting uplinks to force a peer-link would degrade the fabric for mechanism
uniformity. R2's "never silent" holds: **port-driven EVPN-MH always announces itself**.

**Implemented (tree green 19/19, xfail 0):**
- `wantsPeerPair = !spine || fs.iclFits` — any redundant A/B fabric with spare ICL
  ports is MC-LAG/VLT (a bare ToR pair, a per-rack FDC pair, AND a spined single-/
  multi-leaf pair alike); where uplinks fill the leaf → port-driven EVPN-MH + WARN.
- **`iclFits` is RECOMPUTED** just before the decision, against the FINAL
  `uplinksPerLeaf` — the shared-spine harmonize step grows uplinks after the sizing
  pass froze `iclFits`, so a stale-true value was picking MC-LAG on a full leaf and
  tripping the validate.js over-commit hard-error. perRack pairs reserved 2 ports up
  front, so they still fit → FDC ground-truth unchanged.
- **PowerScale back-end independence is now SCALE-INDEPENDENT** — the `!spine` gate on
  `beIndependent` silently dropped h16346 independence once the back-end grew a spine
  (240/64), letting the spare-port scope hand it an MC-LAG ICL. Fixed: independence is
  a platform property, not a size threshold. (Was a real latent bug the ruling exposed.)
- **P6 reframed**: an ICL is legitimate iff it's an MC-LAG/VLT peer-link (AI rail ISL
  exempt) — was "no ICL on any spined fabric", the exact old policy Option (b) overturns.
- Port-driven EVPN-MH WARN reworded: EVPN-MH here is the CORRECT mechanism, not a
  shortfall; higher-uplink leaf offered only for a site that MANDATES a peer-link pair.

### Fixture #5 RE-RULED and ADDED (both conflicts resolved by the maintainer)
The reused-spine deal (12× R660 + 6× PowerStore 5200T, dual) came out INVERTED from the
16b hand-verified BOM (**frontend MC-LAG; storage no-ICL**) once Option (b) landed —
frontend fell to EVPN-MH, storage gained an ICL. Both were surfaced and ruled:

**Ruling 1 (frontend leaf ladder) — redundancy is an input to leaf selection.** A
redundant, MC-LAG-eligible design's leaf must afford uplinks + ICL. The density-only
ladder under-picked the economy **S5224F-ON** (4 uplink ports; 3 spine uplinks leave 1
free, ICL needs 2 → EVPN-MH). We do NOT shrink uplinks to free ICL ports (the rejected
fabric-degrading trade); we STEP UP the leaf. Implemented as a post-harmonize pass
(`engine.js` step 3b): for a **spined** redundant MC-LAG-eligible 25G fabric whose final
`uplinksPerLeaf + ICL` exceeds its leaf's uplink ports, step the leaf up the ladder to
the **standard S5248F-ON** (capped there — never S5296F-ON, which would contradict the
published PowerStore leaf, GT8a). No-spine ToR pairs are exempt (their `uplinksPerLeaf`
floor is spurious and the FDC exports pin them to economy leaves — FDC-F1/F12).
**Fixture #5 frontend re-pins to S5248F-ON, MC-LAG + ICL, 3 uplinks/leaf.** S5224F-ON
stays for non-redundant / economy designs; an explicit `leaf25` override still wins.

**Ruling 2 (PowerStore storage) — FINAL 2026-07-16: engine CONFIRMED correct.** PowerStore's
system bond is an LACP aggregate across BOTH ToRs, which mandates MC-LAG/VLT (this is why
`systemBond: true` exists). **Fixture #5 storage pins to MC-LAG + ICL** — the reversal of the
16b hand-verified "storage A/B without ICL" reading is now confirmed, not provisional.

Verified against the CURRENT source, **H18157.11 "Dell PowerStore: Clustering and High
Availability" (April 2026)** — which supersedes the Networking-Guide lead this item originally
chased. Three corroborating points: multi-appliance cluster ICM/ICD traffic rides an LACP bond
through the ToRs; cross-switch bonds require VLTi ("must be configured" for stacked switches);
and Dell's own HA block reference diagram (Fig. 43) shows the ToR pair with an interconnect,
labelled LACP/vPC. 6× 5200T is a multi-appliance cluster — the strongest form of the case.
CITATION-LOG → "PowerStore storage fabric (system bond → MC-LAG)" is now **CURRENT**
(maintainer-verified against the live doc; H18157.11 is not in corpus).

Forward-looking, no impact today: the 2026 revision adds **FSN (Fail-Safe Networking)** as an
active/passive alternative to LAG for **NAS interfaces**. It does not relax the ToR-pair
requirement for the system bond — flagged on the citation row to re-check if/when
file-deployment (NAS) variants get modeled.

**Point (2) also landed** — explicit ToR-MC-LAG mode keeps its feasibility gate: a
no-spine ToR pair is the explicit MC-LAG topology (`!spine` forces the peer-link, never a
silent EVPN-MH swap; its gate is validate.js's hard port-budget error, and Ruling 1 sizes
the leaf up front). The EVPN-MH auto-substitution is scoped to spined AUTO-mode selection.

`tests/fixtures/fixture-5-reused-spine-mclag.json` added; suite green 19/19, xfail 0.

## Findings (from the four mode BOMs) — QUEUED in priority order

- **R12 (critical):** no optic↔port form-factor validation — 400G-Q56DD-SR4.2
  quoted from S5232F-ON (QSFP28-only) and SN5600 (OSFP). Needs per-switch port
  form-factor data + a HARD check (impossible = error). QUEUED (top).
- **R11 (critical):** cross-NETWORK merged switch lines enumerate one network,
  masking backend isolation (PowerScale) / stranding frontend (AI). Extend the
  merged-note per-network enumeration ("4 total — 2× frontend, 2× backend
  (dedicated, isolated per h16346)"). QUEUED.
- **R16:** B7 refresh `includeCoreUplink` has NO UI (unreachable). Add the
  refresh-mode question + close the invariant gap (every SIZING field REACHABLE
  from every mode whose engine reads it; sweep express/discovery/edge/refresh).
  QUEUED.
- **R14:** NVIDIA-stack BOMs must state NOS per switch (SONiC vs Cumulus; Dell AI
  = SONiC); DFM auto-attach needs an applicability rule (DFM manages Dell
  Enterprise SONiC, not NVIDIA/Cumulus). QUEUED.
- **R15 (pending maintainer check):** PowerScale F710 carried 2× dual-port FE NICs
  the maintainer doesn't think they selected — R5 header reported it honestly.
  Determine seed-default vs wizard; if seed, fix + make NIC defaults visible +
  platform-seed invariant + F710 CITATION-LOG row; re-check non-blocking. QUEUED.
- **R13:** NVIDIA leaf ladder has no 25G rung — 8× 25G on SN4700 (32× 400G).
  Evaluate SN2410-class 25G leaf; at least an R9-style low-util note. QUEUED.
- **PowerScale severity:** "non-blocking not met" as a header WARN — for a
  PowerScale BACKEND that's a requirement (h16346) → ERROR. Verify which fabric
  tripped (may clear with R15's link correction). QUEUED.
- **Refresh (beyond R16):** (a) "like-for-like at 25GbE" assumes existing cabling
  supports 25G — add a cabling-compat question/note; (b) new OOB into existing env
  → apply the R3 pattern (ask, don't assume). QUEUED.
- **Edge (BOM correct — candidate fixture after fixes):** (a) 96/96 access = 100%
  util → headroom note; (b) access-ICL note self-contradicts ("2× 100GbE per pair"
  + a sub-100G ≥4-link parenthetical that doesn't apply at 100G — condition it);
  (c) BUSINESS-RULE: prefer S5200-series distribution (25G+10G downlinks) over
  S4348F in the edge ladder — future-proofs IDF uplinks (log with VENDOR-FACT vs
  BUSINESS-RULE distinction). QUEUED.

## Positives (logged)

AI mode: 32 rails correct, SN2201 as NVIDIA-stack OOB correct, OOB arithmetic
exact, non-blocking met — the sizing is right; the defects are R11–R14. Edge mode:
BOM verifies correct overall (candidate fixture after the small fixes above).
