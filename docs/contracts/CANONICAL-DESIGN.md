# Contract (b) — Canonical Design Schema

**Status: APPROVED 2026-07-16** (maintainer, with amendments — all landed: §1.3
external endpoint type, §1.1 PowerScale back-end mapping, §1.4 explicit linkRef).
Per-instance device records approved, with the confirmation that the BOM still
displays grouped quantities (one line per model+role, qty = count — see DERIVATIONS §1).

**The one-sentence idea:** instead of the engine emitting BOM strings and a separate
snapshot of fields for each consumer (which can silently disagree — that's where every
backtest bug came from), the engine emits ONE description of the network — the actual
switches, their ports, the links between them, and the cables on those links. The BOM,
the diagrams, the validation checks, and the draw.io export are then all *read off*
that one description. They can't disagree because there's only one thing to read.

**The maintainer review test** (per RESTRUCTURE-3): read the four object types below
and ask *"is this how I'd describe this network to a customer?"* If a customer would
say "you've got two leaf switches and a spine, the servers plug into the leaves, the
leaves uplink to the spine" — then devices + links is the right shape, because that
sentence IS devices + links.

---

## 1. The four object types

Kept deliberately small — this is a description of a network, not a general-purpose
data model. Four types cover everything the tool needs.

### 1.1 `device` — one physical switch

```
device {
  id:       unique string (e.g. "leaf-frontend-r1-a")
  model:    catalog model id (e.g. "s4348t-on")
  role:     one of: leaf | spine | super-spine | border-leaf |
                    distribution | access | oob
  network:  which fabric it serves (e.g. "frontend", "storage",
            "aifabric", "mgmt", "access")
  rack?:    optional rack tag (integer or null) — see §3 note
}
```

**One entry per physical switch.** A design with four S4348T-ON leaf switches has four
`device` records, not one record with `qty: 4`. This is the single most important
decision in the schema and it is what kills three of the four backtest bugs (see §2):

- Quantities on the BOM become **counts of real device records**, not arithmetic
  assembled inside a string. You cannot have "qty 8" while the note describes 4 — the
  qty is `count(devices where model+role match)`, full stop.
- The renderers get their node list for free. The "Expanded" view draws one box per
  device record; the parity guard (does every BOM switch appear in every renderer?)
  becomes a tautology because they read the same list.
- Scale is a non-issue: the largest design the tool produces is ~514 switch instances
  (82-leaf 3-tier AI). That is trivial to hold in memory and iterate in plain JS.

**Hosts are NOT devices.** Servers and storage appliances stay grouped as context
(`{targetUid, platform, units}`), because they are not switching hardware being
itemized — they appear on the BOM as Compute/Storage context lines, and on the diagram
as a single grouped box with a unit count. Only switches get one-record-per-instance.

**PowerScale (and other dedicated back-end) switches — explicit mapping.** A PowerScale
back-end is a physically separate, isolated storage network (h15963/h16346 — it is never
converged, ever). Its switches are `device` records like any other, with:
- `role: 'leaf'` and (when the back-end has enough leaves to warrant one) `role: 'spine'`
  — they are ordinary leaf/spine switches, not a distinct role;
- `network: 'backend'` — this is the field that marks them as the isolated back-end, and
  it is what makes the "disconnected back-end" rendering rule unambiguous: the renderers
  group devices by `network` (DERIVATIONS §2), so a `network: 'backend'` device group is
  drawn as its own disconnected column with NO links to any other fabric's spine/core.
  There is exactly one structural signal — `device.network === 'backend'` — and both the
  BOM (it's a normal switch line) and the diagram (it's an isolated group) read it. No
  separate "dedicated" flag is needed; `network` carries it.

A back-end link never has an endpoint in another network's device — that isolation is a
property the link endpoints already enforce (a `backend` leaf's uplink lands on a
`backend` spine, never a shared one), so "PowerScale back-end wired to the main spine"
is unrepresentable the same way the ghost spine is.

### 1.2 `portGroup` — a device's port budget

```
portGroup {
  deviceId: which device
  class:    'access' | 'uplink' (the two port banks a switch presents)
  speed:    e.g. "100GbE"
  count:    how many ports of this class/speed the switch has
}
```

Port *budgets*, from the catalog — not 48 individual port objects. The validators check
"links landing on this device ≤ the device's port count," which is all the current
physical-port-budget check (validate.js #22) does, expressed against real counts
instead of `totalLeaves × uplinksPerLeaf` arithmetic. A switch typically has two
portGroups (an access bank and an uplink bank); breakout multiplies the effective count
and is recorded on the link, not here.

### 1.3 `link` — one connection between two devices (or a device and a host group)

```
link {
  id:        unique string
  endpointA: deviceId
  endpointB: deviceId  OR  hostGroupRef (a targetUid)
                       OR  externalRef (see below)
  role:      host | uplink | icl | superspine-uplink |
             core-handoff | oob
  speed:     e.g. "400GbE"
  media:     'rj45' | 'dac' | 'aoc' | 'transceiver-mmf' |
             'transceiver-smf'
  breakout?: { ratio, high, low, model }  (present only on a
             breakout hop; the engine already resolves this today
             via resolveUplinkBreakout — reuse it verbatim)
}

external {                       // the far side of a core-handoff link
  id:     unique string          // (the customer's existing core)
  label:  e.g. "existing core (by others)"
  farPort?: { media, speed, connector } | 'unknown'   // J3 only
}
```

A link's endpoints are **device ids**. This is the second bug-killer: an uplink or an
optic can only reference a device that exists in the device list, so the "ghost spine"
(an optic line citing an S5232F-ON that appears nowhere in the switch list — backtest
B2) becomes literally unrepresentable. There is no way to write it down.

**The `external` endpoint** covers exactly one case: a `core-handoff` link whose far
side is the customer's existing core — which is neither one of our `device` records nor
a host group. An `external` endpoint is a **terminal reference, not a device**: it
NEVER generates a switch BOM line and never appears as a node the port-budget check
sizes. It exists so that (a) a core-handoff link is well-formed (both endpoints
resolve) without inventing a phantom switch on our side, and (b) J3's far-side variant
has somewhere to hang the far-end cable units: when `coreHandoff = include-far-side`,
the far-end transceiver/cord units attach to the core-handoff link and are attributed
to the `external` endpoint (`external.farPort` supplies the matched-optic details, or
`'unknown'` → verify-flagged). When `coreHandoff = our-side` (default), the link still
terminates at the `external` endpoint but carries only our-side units, with "far side by
others" stated. This is what makes J2's spine-less variant expressible too: leaf uplinks
become `core-handoff` links to an `external` core instead of `uplink` links to a spine
`device`.

`role` distinguishes the hops the cost/validation rules already care about:
`host` (server↔leaf), `uplink` (leaf↔spine), `icl` (redundant-pair peer link),
`superspine-uplink` (pod-spine↔super-spine), `core-handoff` (leaf/spine/border↔core),
`oob` (management). The presence of an `icl`-role link is how the validator confirms a
redundant pair has its interconnect — read directly, not regex'd out of a BOM item
string (retires the `/MC-LAG ICL/` text-scrape in validate.js:460).

### 1.4 `cable` — the physical cabling on a link (or an explicit list of links)

```
cable {
  linkRef:      ONE link id, OR an explicit array of link ids.
                Never an implied "group of identical links" — if a
                cable covers many links, every covered link id is
                listed. qty = count(listed links) × unitsPerLink.
  opticId:      catalog optic/DAC/cable id
  mediaClass:   'rj45-copper' | 'dac' | 'aoc' |
                'transceiver' | 'breakout-assembly' | 'fiber-plant'
  unitsPerLink: integer — how many of this part each link consumes
}
```

`unitsPerLink` is an **explicit, declared field**, not an inherited template default.
This is the third bug-killer and the most quote-dangerous one (backtest B1):

- `rj45-copper` → `unitsPerLink: 1` (one patch cable per link)
- `dac`, `aoc` → `unitsPerLink: 1` (integrated, both ends attached)
- `transceiver` → `unitsPerLink: 2` (one optic per end)
- `breakout-assembly` → `unitsPerLink: 1` per assembly (assemblies = links ÷ ratio)
- J3 far-side variant → adds the far-end unit explicitly on the affected link

An RJ45 copper cable **cannot inherit** a transceiver's 2-per-link rule, because
`unitsPerLink` is a property the cable declares for itself based on its own mediaClass —
there is no shared "optic template" for a copper line to accidentally pick up. And an
`rj45-copper` cable carries **no** DAC/optic metadata fields at all (no reach class, no
"SFP28 · Passive DAC" string) — those fields exist only on the optic mediaClasses. The
backtest line "240 Cat6A for 120 links, tagged SFP28 · Passive DAC · ≤2–3 m" cannot be
produced: the count is `120 links × 1 unitPerLink = 120`, and the copper cable has no
field in which to store the DAC metadata.

---

## 2. Why each backtest bug dies of the architecture

This is the section the maintainer's review should focus on — does the structure
actually make the four known bugs impossible, or just fixed-for-now?

| Bug | What went wrong | Why it's now unrepresentable |
|---|---|---|
| **B1** — 240 Cat6A for 120 links + DAC metadata on an RJ45 line | The RJ45 host-cable line inherited an optic template's 2-per-link rule and its DAC reach metadata | `cable.unitsPerLink` is declared per mediaClass; `rj45-copper` = 1, and copper cables have no metadata fields to hold DAC text. The qty is `links × unitsPerLink` = 120 × 1. There is no code path that doubles it and no field to leak DAC text into. |
| **B2** — ghost S5232F-ON spine cited by an optic line, absent from switch list | The optic line's model text and the switch list were assembled independently and disagreed | A `link` names device **ids**; a `cable` sits on a `link`. An optic can only exist on a link whose endpoints are real devices. A spine cited by any cable is, by construction, a `device` record — so it appears on the switch BOM automatically. |
| **B3** — S4348T-ON qty 8, note accounts for 4; spine units merged into the leaf line | BOM lines merged across model keys, and note arithmetic was assembled by hand then corrupted by "+more" | BOM qty = `count(device records grouped by model + role)`. A spine and a leaf are different `role`s and never merge, even if they shared a model. Notes are generated from the grouped records, so the note count always equals the qty. |
| **B4** — dual vs single redundancy → byte-identical hardware | The redundancy input changed labels but not the emitted parts | Dual and single produce **different device and link sets**: dual = a leaf pair (2 device records) + an `icl`-role link; single = one leaf (1 record) + no ICL link. A diff of the two designs' device/link lists is non-empty by construction, so Fixtures A vs B differ in hardware, not just text. (The engine must actually build the two sets differently — Phase 2 — but the schema makes "identical hardware, different label" impossible to emit once it does.) |
| **B5** — AOC uplink qty ambiguous (16 for "2/leaf × 4") | Uplink count derived one way in the qty, described another way in the label | `cable.unitsPerLink` for `aoc` = 1, qty = `count(uplink links)`. "2 uplinks/leaf × 4 leaves = 8 links = 8 cables." The label is generated from the same count, so it can't disagree. (This is the same disease as B1/B3, listed separately in the backtest.) |

---

## 3. Non-goals and boundaries (restated so the schema stays small)

- **No multi-vendor modeling.** Devices carry a Dell/NVIDIA catalog `model`; the schema
  has no notion of Cisco/HPE equivalents. Out of scope permanently (RESTRUCTURE-3).
- **No rack-placement engine.** The `rack?` tag is an *optional label* a device may
  carry when the engine already knows a rack assignment (multi-rack ToR pattern). It is
  NOT a placement solver, and its absence is normal. This preserves G-014's finding —
  there is no per-instance rack ground truth for single-rack designs, and the schema
  does not invent one. The "Expanded" renderer groups by role/network, not by rack,
  exactly as today.
- **No new capabilities.** This schema describes the network the current engine already
  computes. It does not add features — it replaces string-assembly and per-consumer
  snapshots with one structured description. The sizing math, the catalog, SPEC.md, the
  citation log, and the test harness all carry forward unchanged.
- **Hosts stay grouped.** Repeated for emphasis: one-record-per-instance is for
  switches only. Host groups are context, keyed by `targetUid`.

---

## 4. Relationship to today's `result` object (migration note, not a Phase 0 task)

For the reviewer's orientation — the canonical design is derivable from what the engine
already knows. Today's `fabricRecord` already carries `leaf`, `spine`, `superSpine`,
`totalLeaves`, `spineCount`, `uplinksPerLeaf`, `uplinkBreakout`, `interconnectQty`,
`uplinkCableQty`, etc. The canonical design is those same facts **expanded into
records**: `totalLeaves: 4` becomes four `device` records; `interconnectQty` becomes
`icl`-role `link` records; `uplinkCableQty` becomes the count of `uplink`-role links (so
the G-011 divergence — recomputing `totalLeaves × uplinksPerLeaf` — has nothing left to
diverge from, because there is one link list and you count it). Phase 2 builds this
expansion one consumer at a time; Phase 0 only fixes the shape.
