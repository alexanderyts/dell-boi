# Dell Networking BOM Advisor

A zero-install desktop tool that turns **minimal input about an attach target** (Dell
storage or server platform) into a **sized, standards-checked networking BOM** — with
PowerSwitch and NVIDIA Spectrum (through Dell) recommendations, cabling/optics, a
topology diagram, a rack elevation, and a design-standards check report.

Built for a Dell Networking technical sales advisor. Ethernet-only (no Fibre Channel).

---

## Run it

**Double-click `index.html`.** It opens in your browser and runs fully offline — no
Node, no install, no internet, no admin rights. Everything stays on your machine.

*(Optional: to serve on localhost instead, run any static server in this folder, e.g.
`python -m http.server` and open http://localhost:8000.)*

---

## ⚠ The one rule: seed-and-verify

This tool is **seeded from public spec-level knowledge, not a live Dell feed.** Every
switch, optic, and part number ships as a **placeholder flagged `⚠ verify`** until a
human confirms it. **Never hand a customer a BOM without confirming each flagged line
against Dell Info Hub / the current spec sheet.** The Checks tab counts how many lines
still need verification.

Do **not** put internal Dell pricing, discounts, or unreleased-roadmap data in this tool
— keep it to public product facts and verify the rest in your Dell work environment.

---

## Four ways to start (pick on the left)

1. **🧭 Guided intake** — a step-by-step wizard that *is* your question checklist.
   Don't know an answer? It picks a safe Dell-standard default and flags it as an
   assumption. Ends in a BOM + topology. (`js/wizard.js`)
2. **🤝 Discovery (with a customer)** — probe their current environment (incumbent
   vendor, speeds, growing workloads, pain points, timeline). Outputs **value-add
   guidance** (competitive positioning + best-fit Dell portfolio + the BE Networks
   Verity management story) **and** a starting BOM + topology. (`js/catalog/discovery.js`)
3. **⭐ Reference architecture** — pick an NVIDIA-endorsed design and get the
   **prescriptive** validated stack as-is (Dell AI Factory with NVIDIA 2-8-5-200:
   2× SN5610 + 1× SN2201 + PowerScale F710 for up to 16× XE7740/XE7745).
4. **⚙ Expert quick form** — the one-screen form for when you already have specs.

**Tone:** business-first. The Guidance tab talks value; the deep technical detail
(RoCE/PFC/ECN, EVPN, oversubscription) lives in the **Checks** tab for when an
engineer wants it.

**BE Networks Verity** (`js/catalog/solutions.js`) is the management-conversation
add-on: intent-based networking for Dell Enterprise SONiC (single pane of glass,
zero-touch provisioning, continuous validation, graceful migration off legacy).
Toggle it into any BOM; it leads the Discovery "Management & operations" story.

## Best-practices principles

`docs/SPEC.md` is the **codified, sourced principle reference** — every design rule
(MTU, oversubscription, RoCE, redundancy method, leaf-spine, core uplinks) traces to
a Dell/NVIDIA document and states what's true today, no dates. When a new document
is added, reconcile it here first (resolve conflicts — newer/more-specific wins),
then update the code (`rules.js` / `validate.js` / `engine.js`) to match. The
reasoning behind a rule — what was wrong before, why it changed — lives in
`docs/DESIGN-LOG.md`, not mixed into `SPEC.md` itself. Open items live in
`docs/GAPS.md`; citation re-verification tracking lives in `docs/CITATION-LOG.md`.

## Accuracy checks (self-test)

Click **✓ Accuracy checks** in the header (or open `selftest.html`) to run the
built-in self-validation: it sweeps **every** platform × redundancy × unit count,
every reference architecture, and representative discovery scenarios, asserting
catalog integrity and design invariants (no crashes, no bad lines, every switch
model exists, dual fabrics stay even, single-fabric always flags the redundancy
error, etc.). **Run it after any catalog edit** — green means the app is
internally consistent. (It does *not* confirm orderable SKUs — that's your lookup.)

Every wizard question also shows a **💡 "You might hear / ask about"** hint list
(e.g. *PowerStore, PowerFlex, PowerMax*) so you're primed for the answer instead
of staring at a blank field — and can steer the customer toward it.

## How it works — three layers

| Layer | Files | What it is |
|---|---|---|
| **1. Catalog (source of truth)** | `js/catalog/*.js` | Switches, optics/cables, platform attach profiles, design rules. **This is the thing you maintain.** |
| **2. Engine** | `js/engine.js` | Sizes leaf/spine/mgmt switches + cabling from your input. |
| **3. Validation + UI** | `js/validate.js`, `js/ui.js` | Runs standards checks; renders BOM, topology, rack, checks, and exports. |

## Maintaining the catalog

- **Add / fix a switch:** edit `js/catalog/switches.js`. When you've confirmed a model,
  set `verify:false` and put the real Dell part number in `dellPN`.
- **Add an attach target:** add an entry to `js/catalog/platforms.js` with its
  `portGroups` (count/speed/media/network per unit).
- **Change a design standard:** edit `js/catalog/rules.js` (MTU, oversubscription
  targets, redundancy, RoCE, growth headroom).

## Exports

- **Print / Save PDF** — browser print (all tabs, with a draft header).
- **BOM (CSV)** — opens in Excel; importable to Visio.
- **Topology (SVG)** — Visio imports SVG directly.
- Native `.vsdx` generation is a planned later milestone.

## Catalog sources & two-stage accuracy

The catalog is aligned to the Dell source documents in this folder (all 2026),
extracted with `pdftotext -table` and cross-checked:

| Catalog file | Source document |
|---|---|
| `switches.js` | Dell Networking Quick Reference Guide, **June 2026 v2.1** |
| `optics.js` | Dell Networking **Transceivers & Cables** Spec Sheet |
| `platforms.js` (PowerStore) | PowerStore Data Sheet **h18234** |
| `platforms.js` (PowerScale) | PowerScale All-Flash Nodes **h15963** |
| `platforms.js` (PowerFlex) | PowerFlex 5.0 Specification Sheet |
| `platforms.js` (PowerEdge/XE9680) | PowerEdge Rack Series Spec Sheet |
| `platforms.js` (PowerMax) | PowerMax 2500/8500 Spec Sheet |
| `rules.js` (AI fabric design) | Dell AI Fabrics guides (h04600, h04658, H20082, H20084) |
| `reference-architectures.js` | Dell AI Factory with NVIDIA — 2-8-5-200 Enterprise RA brief |
| `solutions.js` (Verity) | BE Networks Verity for Cloud Data Sheet + Verity Documentation |
| OS references | Enterprise SONiC Distribution by Dell (`document.pdf`) |

Each line carries **two independent accuracy flags**:

- **`specConfirmed: true`** — the model + specs (switch port map/throughput,
  optic model/lengths, platform NIC options) are **confirmed** from the source
  doc. Shown as an amber **`SKU verify`** badge.
- **`verify: true`** — orderable Dell SKU (e.g. `407-xxxxx`) still needs lookup
  in Dell ordering tools (the docs give models, not SKUs). Anything not yet
  doc-confirmed (e.g. OOB Cat6 patch, PowerMax) shows the purple **`⚠ verify`**.

When newer docs are published, drop them in, re-extract with `pdftotext -table`,
and update the relevant catalog file.

## Known limits

- **Orderable Dell SKUs** are not in any of the docs — every line stays flagged
  until you look them up. Models + specs are doc-confirmed.
- **Per-unit platform port counts are a config choice.** The data sheets confirm
  the NIC *options* (speeds, dual-port); portGroups encode a documented default —
  always confirm the actual NIC/port config per order (each platform says so).
- **PowerMax** has no data sheet supplied yet — its ports are an estimate (drop a
  PowerMax connectivity sheet in to confirm).
- Spine/oversubscription sizing is a first-pass estimate; review the Checks tab.
- Rack elevation is a single-rack schematic; multi-rack layouts are summarized.
- InfiniBand (QM/Q3xxx Quantum) and Spectrum-6 MGX (SN66/68xx-LD) are excluded
  (enterprise/DC Ethernet scope).
