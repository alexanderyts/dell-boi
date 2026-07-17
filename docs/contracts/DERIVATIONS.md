# Contract (c) — Derivation Contracts

**Status: APPROVED 2026-07-16** (maintainer, with amendments — landed: §1 cross-fabric
grouping decision with per-fabric note breakdown; §2 mandatory fabric grouping in
renderers as its attached condition).

Three consumers read the canonical design (contract b): the BOM, the renderers, and the
validators. (The draw.io export is a fourth, but it reads the exact same node/link list
as the on-screen renderers, so it's covered by §2.) This document says — one page each —
exactly how each derives its output from devices/links/cables, so that no consumer ever
hand-assembles a fact that another consumer assembles differently. Each section ends
with the current-code seam it retires.

The governing rule for all three: **read structured fields, never re-encode or
re-parse.** If a fact exists as a field on a device/link/cable, a consumer reads that
field. It does not recompute it from other fields, and it does not parse it back out of
a string it (or another consumer) wrote.

---

## §1 — BOM derivation

**Switch lines.** Group `device` records by `(model, role)`. Emit one line per group.
`qty = count of devices in the group`.

- Grouping is by model **and role together**. A spine and a leaf that happen to share a
  model are two lines, never one. (This is the B3 kill: cross-role merge is not
  expressible — the group key includes role.)
- **Across fabrics (maintainer decision, 2026-07-16):** same-model, same-role switches
  in *separate fabrics* DO group into ONE line with the full count — the group key is
  `(model, role)`, deliberately NOT `(model, role, network)`. The generated note
  enumerates the per-fabric breakdown, e.g. "4 total — 2× frontend, 2× storage".
  Condition attached to this decision: fabric separation lives in the DIAGRAM (§2's
  mandatory `device.network` grouping), not in BOM line splitting.
- The `'; +more'` note-merge path is **retired**. There is nothing to merge: each
  `(model, role)` group is already the complete set of that switch type. No line ever
  has "qty 8, note describes 4."

**Cable lines.** Group `cable` records by `(opticId, link role)`. Emit one line per
group. `qty = Σ over the group of (link count × cable.unitsPerLink)`.

- `unitsPerLink` comes off the `cable` record (contract b §1.4). RJ45 = 1, DAC/AOC = 1,
  transceiver = 2, breakout-assembly = 1 per assembly. The qty is arithmetic over
  **structured fields**, never a number typed into a note. (This is the B1/B5 kill.)
- A breakout cable line's assembly count is `count(links) ÷ ratio`, with `ratio` read
  from the link's `breakout` field — not parsed back out of a note like
  `checkBreakoutAssemblies` does today.

**Notes are GENERATED, never authored.** A line's note is a function of its structured
fields (models, counts, speeds, roles, breakout ratio). Because the note is generated
from the same records that set the qty, the note can never describe a different count
than the qty shows. And because a note mentioning a switch model is generated from a
device group that exists, **every model named in any note has its own switch line** —
backtest invariant 2 becomes structurally true, not a thing to test-and-hope. (This is
the B2 kill, from the BOM side.)

**Context lines** (Compute/Storage/Software) are emitted from the host groups and
`opts` (e.g. the DFM software line from `opts.verity`), unchanged from today.

Seams this retires: the `addLine` merge-by-`category|model` with `'; +more'` note
corruption (engine.js:229–240); breakout arithmetic living only in note text
(engine.js:864/1020/1394) and being regex-recovered by feasibility.js:295; model roles
being recoverable only from `item`-string suffixes like `" — Super-spine"`.

---

## §2 — Renderer derivation (all three renderers + draw.io)

**Node list = the `device` records.** Every renderer's set of switch boxes is the
device list, filtered to the fabrics/roles it draws. No renderer computes its own node
set from `totalLeaves`/`spineCount`/counts.

**Fabric grouping in renderers is MANDATORY, not stylistic.** Devices are grouped
visually by `device.network` in every topology view. This is the condition attached to
§1's cross-fabric BOM grouping decision: because the BOM merges same-model/same-role
switches across fabrics into one line, the DIAGRAM is the only place fabric separation
is visible — so a renderer that stopped grouping by network would silently erase the
distinction everywhere. (`network: 'backend'` isolation — contract b §1.1 — is the
strictest case of the same rule.)

- **Logical view**: group devices by `(role, model, network)`, draw one box per group
  with a count badge ("Spine ×4"), capped with "+N more" for readability. The count is
  `group size` — a real number of real records.
- **Expanded view**: draw one box per `device` record. This is a 1:1 rendering of the
  device list — no capping, no invented grouping. (Contract b §1.1 sized this: ~514
  boxes worst case.)

**Links drawn = the `link` records**, with their real `media` and `breakout` fields
driving the visual style (dashed for breakout, cable-class label from `media`). No
renderer recomputes a breakout ratio; it reads `link.breakout.ratio`.

**The renderer-parity guard becomes a tautology.** Today `audit-renderer-parity.js`
asks "does every BOM switch model appear in every renderer?" and needs a KNOWN_GAPS
allowlist. Once both the BOM switch lines (§1) and the renderer node list (§2) are
derived from the **same device list**, the answer is yes by construction. The guard
stays in the suite as a **regression tripwire** — if it ever fails again, it means a
consumer stopped reading the canonical list and started reinventing one, which is
exactly the regression the whole restructure exists to prevent.

Seams this retires: three renderers + draw.io each independently walking
`fabrics[].{totalLeaves,spineCount,...}` to build node lists (ui.js renderTopology /
renderRack / renderRackMulti / buildDrawioXml); buildDrawioXml parsing `_mk` merge-key
strings (ui.js:1480) and oooText deriving switch role from `item`/`note` regexes
(ui.js:1317–1322).

---

## §3 — Validator derivation

**Port-budget checks read counts, not arithmetic.** For each device, "links landing on
it" = `count(links where an endpoint is this device, by role)`. Compare against the
device's `portGroup.count` (times breakout ratio where the link carries one). This
replaces every `totalLeaves × uplinksPerLeaf` recomputation.

- The G-011 class of bug — the validator recomputing an uplink count that diverges from
  the actual cabled quantity — **has nothing left to diverge from**. There is one
  `link` list; the validator counts it, the BOM counts it, they are the same list. The
  `f.uplinkCableQty || (totalLeaves × uplinksPerLeaf)` fallback (validate.js:191/410)
  disappears because there is no second way to get the number.

**Redundancy / ICL checks read link roles, not item text.** "Does this redundant pair
have an interconnect?" = "is there an `icl`-role link between the pair members?" — read
directly. The current `/MC-LAG ICL/` regex over BOM item strings (validate.js:460) is
retired. Per J1, the ICL line's *terminology* (VLT vs MC-LAG) still follows the OS, but
the *existence* check is structural.

**Referential integrity is free.** "Every model named in a note appears as a line"
(backtest invariant 2) and "no optic cites a nonexistent switch" (B2) are guaranteed by
the derivation in §1 — the validator can assert them as cheap tripwires, but they
cannot actually fail unless a consumer bypasses the canonical design.

**Physical-compatibility checks stay.** The optic-speed-match / media-compatibility
check (feasibility.js `checkOpticSpeedMatch`) carries forward, but reads the link's
`media`/`speed`/`breakout` and the cable's `opticId` **as fields** instead of
reconstructing hops by parsing `_mk` prefixes (`host|targetId|network|opticId`,
`superspine|spineGroupKey`, etc.). Same check, structured inputs.

Seams this retires: `uplinkCableQty` vs `totalLeaves × uplinksPerLeaf` dual
representation (three sites); `totalPodSpines || spineCount` fallbacks (six sites);
`targetUid ?? targetId` identity duality; the `_mk` string-format coupling between
engine.js, feasibility.js, and buildDrawioXml; ICL-presence-by-item-regex.

---

## Summary — the seam inventory this contract set eliminates

From the Phase 0 exploration, the eight duplicated representations and the note-text
facts, each mapped to the derivation rule that removes it:

| # | Seam (current code) | Retired by |
|---|---|---|
| 1 | `uplinkCableQty` vs `totalLeaves × uplinksPerLeaf` | §3 (one link list, counted) |
| 2 | `totalPodSpines` vs `spineCount` vs `numPods × spineCount` | §2/§3 (count device records by role) |
| 3 | `targetUid` vs `targetId` | canonical `device.network` + host-group ids (b §1) |
| 4 | `_mk` merge-key string parsing | §1/§2/§3 (structured link fields) |
| 5 | `oversub` / `nonBlocking` recomputed independently | one link list → one oversub calc |
| 6 | breakout facts stored as object + string + note text | §1 (note generated from `link.breakout`) |
| 7 | `borderLeafInfo` at three addresses + item regex | one `border-leaf` device + its links |
| 8 | switch role derived 3 ways (structure / regex / category) | `device.role` (single source) |
| 9 | breakout assembly arithmetic only in note text | §1 (generated from `link.breakout.ratio`) |
| 10 | model tier-role only in `item` string suffixes | `device.role` field |

## Phase 2 implementation status (2026-07-16)

The §1 BOM derivation is LIVE for the main-path Switch + `host|`/`uplink|` lines
(`js/design.js` `applyCanonicalBom`, wrapping `recommend`): B1/B3/B5 are killed
and are now hard guards (`tests/invariants.js`). Seams #4/#8/#10 are **not yet
fully retired** — the derivation still REPRODUCES the `_mk` keys, the
`item`-suffix roles, and the note enumerations as a **temporary compatibility
shim** because five consumers still scrape them. That shim, its per-consumer
substring register, and its scheduled teardown are tracked in
**docs/GAPS.md G-020**. Seams #4/#8/#10 close when G-020 tears down (after the
renderers + validators consumer slices migrate to the structured fields above).
