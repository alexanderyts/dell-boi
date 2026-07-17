# Backtest 2026-07-16b — existing-core / converged / reused-spine real deals

**Defect meter reopened: 0 → 4 → 0 (R6, R7, R8, R10), same day.** Three shipped
BOMs stranded fabrics (R6) before a connectivity guard existed; that guard now
hard-fails the class. Found-and-fixed-fast, recorded as movement.

## The critical one — R6 (existing-core strands leaves)

Three real BOMs, same root cause: the J2 build made `existing-core` force
spine-less at **any** scale (the `>2-leaf` rule was scoped to the 2-leaf Fixture
B case), then built a **fixed 2** core uplinks regardless of leaf count.

- 60× R660 @ 2×25G, 4 racks: 8 leaves (4 MC-LAG pairs), 2 core uplinks → **6
  switches with no uplink path.**
- Converged 32× R660 + 8× PowerStore, 2 racks: 1 of 2 pairs stranded (carrying
  half the PowerStore front-end).

**Ruling (maintainer):** spine-less existing-core = **every pair uplinks to the
core independently** (2 per pair). **Fix:** `coreCount` in existing-core mode
scales with the leaves (= totalLeaves; our-side, far-side, and patch cords all
scale). 8 leaves → 8 core uplinks, no stranding.

**Connectivity invariant (INVARIANT 6 + engine error):** every leaf must reach a
spine or the core — a stranded leaf is now (a) a hard-failing suite invariant and
(b) an `error`-severity warning in the product (`js/design.js checkConnectivity`).
This class of bug had shipped three times because nothing checked reachability.

## R7 (+extension) — surface the port cost

- The existing-core demand note now equals the actual uplink count (R6's
  `coreCount`, was computed differently — said 16 while 2 were built) and states
  "N leaf switches uplink to your existing core — N× ports needed (2 per pair)."
- **Extension:** a **reused-spine** design now states the demand on the existing
  spine: "the new leaves need 14× 100GbE FREE ports on the existing S5232F-ON (of
  32 total)."

## R8 — media-class metadata bleed (all classes, not just RJ45)

25G host **DAC** lines carried "≤2m at 800G" (a wrong speed's reach) and "LC
duplex" (a fiber connector). B1's scrub only handled copper. **Fix:** the
canonical host-note repair is now media-class-aware for **every** class — each
line carries only its own optic's class/media/reach (DAC → "SFP28 passive DAC
(twinax) · DAC 1–5m"), no cross-media or cross-speed junk.

## R10 — converged fractional average

The converged merged host line printed "3.2/unit × 40" (128/40). **Fix:** the
per-source breakdown now enumerates per platform: "128 links — 64× Server (2/unit
× 32), 64× Block/Unified Storage (8/unit × 8)". *(Root cause: a converged
`targetId` contains a pipe, which broke the cable layer's mergeKey match — fixed
by carrying the real `bomTargetId` on the fabric record.)*

## R9 — S5296F for ~15 ports/leaf (diagnosis + low-util note)

**Why:** the 25G leaf ladder's dense-rack rule picked S5296F from the CENTRALIZED
per-fabric adjusted-link count (60 links × 1.25 = 75 → 2× S5248F or 1× S5296F),
but per-rack distribution then spread the links to ~15/leaf. So the model is
picked from centralized density while the count is rack-driven — a ladder
mismatch. **Interim:** a **low-utilization note** now fires whenever a per-rack
leaf runs < 35% of its ports, stating the count is rack-driven and a smaller leaf
/ fewer racks would raise utilization. *(The deeper ladder fix — pick the leaf
model from the per-rack link count when perRack — is deferred; flagged here.)*

## Positive result — leaf-spine reused-spine (candidate Fixture #5)

12× R660 + 6× PowerStore 5200T, reused spine: storage A/B leaves correctly
without ICL, B2's external reused-spine rendering, OOB arithmetic exact.
**CONFLICT — pending ruling:** the maintainer's verified BOM has the **frontend
as MC-LAG pairs with ICLs**, but the current code gives the single-rack
leaf-spine frontend **EVPN-MH (no ICL) by policy**. This is the R2 ruling
("EVPN-MH fallback-only, never silent policy") not yet applied to single-rack
designs — applying it consistently makes every fittable redundant fabric MC-LAG,
which changes SPEC §4 and the faithful anchors. Fixture #5 is NOT added until this
is ruled (see the ruling request). AOC cross-rack note "spine rack" → "the spine's
declared rack" / "the existing spine location" (reused): DONE.
