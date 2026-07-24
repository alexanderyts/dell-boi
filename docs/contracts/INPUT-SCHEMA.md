# Contract (a) — Input Schema

**Status: APPROVED 2026-07-16** (maintainer, with dispositions D2/D3/D4 decided —
see the defect register §4).

The rule this contract enforces: **every field a user can set is listed here, with
exactly what it changes.** A field that changes nothing — and isn't declared
display-only or guidance-only below — is a defect by definition (the "label-only
redundancy toggle", defect B4 in docs/backtests/BACKTEST-2026-07-15.md, is the
canonical example of why).

How to read the classification column:

| Class | Meaning |
|---|---|
| **SIZING** | Changes the hardware or quantities on the BOM. Phase 1's input-effect test asserts each of these actually does. |
| **DISPLAY** | Changes only labels, notes, or warnings — declared and allowed, but a SIZING claim on these would be false. |
| **GUIDANCE** | Feeds the Discovery guidance/pitch content only; never reaches the sizing engine. |
| **DEFECT** | Claims to be SIZING but the backtest/code shows it isn't. Tracked for Phase 2/3. |
| **LEGACY** | Old field kept for back-compat with saved designs; no current UI sets it. Frozen — do not extend. |
| **NO-UI** | The engine reads it but no UI can set it. Either expose it or document why not. |

---

## 1. The engine input object — `recommend(input)`

This is the single object every entry mode (expert form, guided wizard, express,
discovery) ultimately builds. Types, defaults, and clamps are as the engine actually
enforces them today (js/engine.js).

### 1.1 Top-level fields

| Field | Type / values | Default & clamp | Class | What it changes |
|---|---|---|---|---|
| `targets[]` | array of Target (see 1.2) | required (or legacy singletons below) | SIZING | The list of things being attached — drives everything |
| `platformId` | string | — | LEGACY | Single-target back-compat; wrapped into `targets[0]` |
| `units` | int | clamp 1–100000 | LEGACY | Single-target back-compat |
| `modelId`, `gpusPerServer`, `railNic`, `nic`, `nic2` | (as Target fields) | — | LEGACY | Single-target back-compat aliases |
| `redundancy` | `'dual'` \| `'single'` | anything ≠ `'single'` → dual | **DEFECT (B4)** | SHOULD size pairs+ICL vs single switches. Backtest runs 2 vs 3 produced byte-identical hardware — labels changed, hardware didn't. Phase 2/3 must make this SIZING; Phase 1 invariant 4 pins it. |
| `nos` | `'sonic'` (only) | any value → sonic | **PINNED** | New-build redundancy is ALWAYS MC-LAG / Enterprise SONiC. **DECIDED (R14, 2026-07-23, maintainer ruling): "OS10 shouldn't be quoted, it's end of sale" — dropped portfolio-wide as a quotable NEW-BUILD choice.** No UI control (removed from both the guided wizard and the Expert Form). The input key is still accepted rather than thrown on — `'os10'` is silently ignored, never producing VLT/VLTi terminology — for input back-compat. VLT/OS10 wording survives only in `recommendRefresh()`, which describes a customer's EXISTING switches, not a new quote. |
| `growthHeadroom` | number | default from rules; clamp 0–2 | SIZING | Reserves access ports; can add leaves |
| `fabricArchitecture` | `'converged'` \| `'sharedSpine'` \| `'separate'` | invalid → sharedSpine | SIZING | Whether targets share leaves, share only the spine, or get fully separate fabrics |
| `separateFabrics` | bool | — | LEGACY | Old boolean; maps true→separate, else sharedSpine |
| `placement` | `'in-rack'` \| `'adjacent'` \| `'structured'` | invalid → in-rack | SIZING | Host cable class: DAC vs AOC vs transceivers+fiber |
| `media` | `'fiber'` | — | LEGACY | Old alias; 'fiber' → structured |
| `structuredInPlace` | bool | false | SIZING | Skips pricing the fiber plant (panels/trunks/cassettes) when plant already exists |
| `breakout` | `'on'` \| `'none'` \| `'auto'` | invalid → auto | SIZING | Whether spine ports may fan out (4×/2×) — changes spine count, optics, and 3-tier trigger |
| `racks` | int | clamp 1–200 | SIZING | Multi-rack pattern: per-rack ToR pairs, per-rack OOB, cross-rack cable classes |
| `leaf100` | model key \| `'auto'` | invalid → auto | SIZING | Forces the 100G leaf model |
| `leaf25` | model key \| `'auto'` | invalid → auto | SIZING | Forces the 25G leaf model |
| `trafficProfile` | `'ew'` \| `'balanced'` \| `'ns'` … | invalid → null | SIZING | Oversubscription target → uplinks per leaf |
| `oversubTarget` | number | clamp 1–4 | **NO-UI** | Explicit oversub override; no UI control exists (only trafficProfile is settable). **DECIDED (D3): stays a documented programmatic override — no UI.** |
| `speedRoadmap` | key \| `'none'` | invalid → none | DISPLAY | Informational optics guidance in notes; changes no part picks |
| `storageProtocol` | `'nvme-roce'` \| `'nvme-tcp'` \| `'iscsi'` … | invalid → null | SIZING | Lossless/non-blocking storage fabric requirements; RoCE excluded from convergence |
| `deployType` | `'new'` \| `'add'` | ≠ 'add' → new | SIZING | Brownfield incremental BOM |
| `reuseExistingSpine` | bool | only if deployType='add' | SIZING | Skips spine hardware lines |
| `aiTransport` | `'roce'` \| `'uec'` | invalid → roce | DISPLAY | Labels the AI fabric transport; no part changes |
| `stack` | `'dell'` \| `'nvidia'` | **throws** if AI target and unset | SIZING | AI fabric vendor stack (no-mix rule) |
| `fabricInterconnect` | `'mclag'` \| `'independent'` | ≠ independent → mclag | SIZING | ICL peer-link present vs air-gapped A/B fabrics |
| `includeMgmt` | bool | ≠ false → true | SIZING | OOB management switch + cabling |
| `includeCoreUplink` | bool | falsy → off | SIZING | Core/DCI uplink optics + (optionally) border-leaf |
| `coreSpeed` | speed string | `'100GbE'` | SIZING | Core optic speed |
| `coreCount` | int | max(2, parsed) | **NO-UI** | Number of core uplinks — every UI hardcodes 2. **DECIDED (D4): stays hardcoded 2, documented — no UI.** |
| `coreType` | `'core'` \| `'fabric'` \| `'dci'` | invalid → core | SIZING (partial) | 'dci' forces long-reach optics; otherwise label |
| `coreLayer` | `'l3'` \| `'l2'` | ≠ l2 → l3 | DISPLAY | Routed-vs-stretched note text |
| `coreProtocol` | `'bgp'` \| `'ospf'` \| `'static'` | invalid → bgp | DISPLAY | Label only |
| `coreReach` | `'auto'` \| `'longreach'` | dci → long | SIZING | SR vs 10 km LR optic |
| `coreFarEnd` | `'dell'` \| `'other'` | ≠ other → dell | DISPLAY | Third-party interop note |
| `borderLeaf` | bool | false (needs spine) | SIZING | Dedicated border-leaf pair terminating core/DCI |

### 1.2 Target shape — `targets[i]`

| Field | Type | Default & clamp | Class | What it changes |
|---|---|---|---|---|
| `platformId` | catalog platform id | required | SIZING | The attach platform (ports, workload, requirements) |
| `modelId` | catalog model id | null | SIZING | Model drill-down (speed/GPU overrides) |
| `units` | int | clamp 1–100000 | SIZING | Unit count |
| `gpusPerServer` | int | model default or null | SIZING | AI rails per server (1 rail/GPU) |
| `railNic` | `{speed, model}` | kept only if speed parses | SIZING | Overrides the GPU rail speed |
| `nic` | NIC (1.3) | platform default ports | SIZING | Primary host NIC |
| `nic2` | NIC (1.3) | null | SIZING | Second NIC → its own fabric |

### 1.3 NIC shape — via `normNic`

| Field | Type | Default | Class | What it changes |
|---|---|---|---|---|
| `speed` | speed string | `''` (nic2: `'25GbE'`) | SIZING | Host link speed → leaf selection, BaseT routing |
| `portsPerNic` | int | 2, min 1 | SIZING | Links per NIC |
| `nicsPerUnit` | int | 2, min 1 (nic2: 1) | SIZING | NICs per unit |
| `network` | `'storage'` \| `'frontend'` | nic2: `'storage'` | SIZING (**nic2 ONLY**) | Which fabric the 2nd NIC lands on. **DECIDED (D2, 2026-07-16): this field exists on nic2 only — it is removed from the primary NIC shape** (it was read by normNic but consumed by nothing and settable by no UI). Phase 2's canonical build must not carry it on the primary NIC. |
| `vendor` | string | `''` | DISPLAY | Appears in the NIC label only. **Explicitly does NOT pick optic vendor** (that follows the fabric's `stack`) — a rep choosing "NVIDIA" here gets no LinkX parts from this field alone. |
| `model` | string | `''` | DISPLAY | Label only; no UI collects it |

### 1.4 NEW REQUIRED INPUTS — from backtest judgment calls J2 and J3

These do not exist in the code today. They are contracted here (Phase 0) and built in
Phase 2. Both must pass the Phase 1 input-effect invariant — they are SIZING by
definition, and backtest invariants 6–7 are their acceptance tests.

| Field | Type / values | Default | Class | What it changes |
|---|---|---|---|---|
| `uplinkTarget` | `'new-spine'` \| `'existing-core'` | asked; wizard pre-selects **existing-core** for deployType add/refresh, **new-spine** for greenfield (J2). Engine honors whatever's passed; ABSENT = current auto behaviour (>2 leaves → spine) so legacy callers/tests are unchanged. | SIZING | **new-spine**: spine switch lines + leaf→spine cables (self-contained pod) — forced even for ≤2 leaves. **existing-core**: NO spine lines, NO leaf→spine cables; leaf uplinks terminate at the core handoff (leaves are the border). Fixture A pins new-spine; Fixture A2 (spine-less) pins existing-core. |
| `coreVendor` | `'dell'` \| `'other'` \| `'unsure'` | asked when `includeCoreUplink` (J3 — REPLACES the earlier `coreHandoff` our-side/far-side binary; the decision variable is what the EXISTING CORE RUNS, not rep preference). | SIZING | Encodes the sales rule "we quote what we can support". **dell** → far-side optics are quotable (Dell parts into a Dell switch) → include them by default. **other** → far side is automatically by-others; the line states "far-side optics by the customer's core vendor — same IEEE PMD; Dell side quoted." No both-sides option. **unsure** → our-side only + verify flag. |
| `coreFarModel` | a Dell switch id \| absent | optional; only meaningful when `coreVendor = 'dell'` | SIZING / GUIDANCE | If the rep can name the customer's Dell core switch, the catalog matches the far-side port type/speed directly — and `coreFarPort` is not asked. |
| `coreFarPort` | `{media, speed, connector}` \| `'unknown'` | asked ONLY when `coreVendor = 'dell'` AND `coreFarModel` is unknown | SIZING | The far-side port details for the far-side optic. `'unknown'` quotes matched optics (same IEEE PMD as ours) with a **verify** flag. |
| `railNicCage` | `'osfp'` \| `'qsfp112'` \| `'unsure'` | **DERIVE-THEN-ASK** (R12 ruling 2026-07-16d(a)). Never blind-defaulted. Resolution order: (1) explicit answer; (2) an RA that CITES its NIC cage (the GB300 NVL72 RA states "the ConnectX-8 OSFP port"); (3) derived from a NIC model the vendor pins to one cage (`formFactor.railNicCageOf` — BlueField-3 → QSFP112; ConnectX-7/-8 are deliberately NOT in that map, they ship in both cages); (4) `'unsure'`. Asked ONLY when the rails land on a twin-port-OSFP leaf (conditional reveal, J2/J3 pattern) — no other design branches on it. | SIZING | Picks the 1:2 GPU-rail splitter, whose **far-end connector differs**: **osfp** → MCP7Y00 (2× OSFP); **qsfp112** → MCP7Y10 (2× QSFP112). Not interchangeable — a wrong pick ships a cable that cannot plug into the customer's NIC, which is why it is never guessed silently. **unsure** → quotes the MCP7Y00 variant **verify-flagged**, with a line note + `verify` warning naming MCP7Y10 as the alternative; it does NOT block the BOM (a like-for-like swap: no design or quantity impact). Quantity is unaffected: 1 splitter = 2 rails either way. |

---

## 2. The other engine entry points

### 2.1 `recommendEdge(input)` — campus/edge

| Field | Values | Default & clamp | Class | What it changes |
|---|---|---|---|---|
| `endpoints` | int | clamp 1–100000, def 48 | SIZING | Access switch count |
| `poe` | `'none'` \| `'poe+'` \| `'poe++'` | invalid → poe+ | SIZING | Access model (PoE class) + budget warning |
| `accessSpeed` | `'mgig'` \| `'1g'` \| `'fiber'` | derived from poe | SIZING | Access model; fiber+redundant = documented hard error (E3224F-ON) |
| `edgeRedundancy` | `'single'` \| other | ≠ single → redundant | SIZING | MC-LAG pairs + ICL vs singles |
| `edgeUplink` | `'sfp'` \| other | ≠ sfp → 100G | SIZING | Which uplink class uplinks (the other carries the ICL) |
| `distribution` | `'existing'` \| other | ≠ existing → new | SIZING | New distribution pair vs uplink-to-existing |
| `includeMgmt` | bool | ≠ false → true | SIZING | OOB |

### 2.2 `recommendRefresh(input)` — like-for-like refresh

| Field | Values | Default & clamp | Class |
|---|---|---|---|
| `swCount` | int | clamp 2–512, forced even | SIZING |
| `portsPer` | 24 \| 48 | ≠24 → 48 | SIZING |
| `targetSpeed` | `'10g-t'` \| `'25g'` \| `'100g'` | invalid → 25g | SIZING |
| `topologyNow` | `'tor'` \| other | ≠tor → had-core | SIZING |
| `distribution` | `'existing'` \| other | — | SIZING |
| `includeCoreUplink` | bool | — | SIZING |
| `includeMgmt` | bool | ≠ false → true | SIZING |
| `speedNow` | string | — | DISPLAY (migration warning text only) |

### 2.3 `recommendRA(raId, nodes)` — reference architectures

Two positional scalars, not an input object: `raId` (catalog RA id, SIZING) and
`nodes` (int, clamped 1..maxGpuNodes with a truncation warning, SIZING). No other
inputs exist on this path.

---

## 3. Per-mode mapping — every UI field, accounted for

The completeness rule: every settable control in every mode appears in exactly one
row below. A control missing from these tables is a contract bug.

### 3.1 Expert form (`index.html` → `js/app.js`)

Every `#f-*` element maps to an engine field — the full list, in form order:
`#f-platform`→targets[0].platformId · `#f-model`→modelId · `#f-units`→units ·
`#f-nic-vendor`→nic.vendor (DISPLAY) · `#f-nic-speed`→nic.speed ·
`#f-nic-ports`→nic.portsPerNic · `#f-nic-count`→nic.nicsPerUnit ·
`#f-ai-datanic`→gate: apply NIC to AI target · `#f-nicb-speed`→nic2.speed ·
`#f-nicb-ports`→nic2.portsPerNic · `#f-nicb-network`→nic2.network ·
`#f-racks`→racks · `#f-leaf100`→leaf100 · `#f-leaf25`→leaf25 ·
`#f-gpus`→gpusPerServer · `#f-rail-speed`→railNic.speed · `#f-stack`→stack ·
`#f-ai-transport`→aiTransport (DISPLAY) · `#f-redundancy`→redundancy (DEFECT B4) ·
`#f-growth`→growthHeadroom · `#f-placement`→placement ·
`#f-structured`→structuredInPlace · `#f-breakout`→breakout ·
`#f-fabstyle`→fabricInterconnect · `#f-storage-proto`→storageProtocol ·
`#f-traffic`→trafficProfile · `#f-roadmap`→speedRoadmap (DISPLAY) ·
`#f-deploy`→deployType · `#f-reuse`→reuseExistingSpine ·
`#f-mgmt`→includeMgmt · `#f-fabricarch`→fabricArchitecture ·
`#f-core`→includeCoreUplink · `#f-core-type`→coreType ·
`#f-core-speed`→coreSpeed · `#f-core-layer`→coreLayer (DISPLAY) ·
`#f-core-proto`→coreProtocol (DISPLAY) · `#f-core-reach`→coreReach ·
`#f-core-farend`→coreFarEnd (DISPLAY) · `#f-border-leaf`→borderLeaf ·
`#f-verity`→opts.verity (NOT an engine input — adds the DFM software line).

Added-target rows (`.t-platform`, `.t-model`, `.t-units`, `.t-gpus`, `.t-rail`,
`.t-nic-speed`, `.t-nic-ports`, `.t-nic-count`) → the same Target fields per row.

No expert-form control is unread. Gap: `coreCount` is hardcoded to 2 (no control).

### 3.2 Edge form

`#e-endpoints`→endpoints · `#e-poe`→poe · `#e-speed`→accessSpeed ·
`#e-redundancy`→edgeRedundancy · `#e-uplink`→edgeUplink · `#e-dist`→distribution ·
`#e-mgmt`→includeMgmt · `#e-verity`→opts.verity.

### 3.3 RA form

`#f-ra`→raId · `#f-ra-units`→nodes.

### 3.4 Guided wizard (`js/wizard.js`)

Step id → engine field (steps that only route or gate are marked):
`category`/`blockModel`/`hciFlavor` → resolve platformId (routing) ·
`vxrailModel`/`aiModel`/`nasModel` → modelId · `gpus`→gpusPerServer · `stack`→stack ·
`aiTransport`→aiTransport · `railSpeed`→railNic · `aiDataSpec`→gate for nic ·
`units`→units · `deployType`→deployType · `existingReuse`→reuseExistingSpine ·
`nicVendor`/`nicSpeed`/`nicPorts`/`nicCount` → nic.* ·
`nic2Spec` (gate) / `nic2Network`/`nic2Speed`/`nic2Ports`/`nic2Count` → nic2.* ·
`storageProto`→storageProtocol · `fabStyle`→fabricInterconnect ·
`placement`→placement · `racks`→racks · `structured`→structuredInPlace ·
`breakout`→breakout · `second`/`secondUnits`/`secondModel_*`/`secondGpus`/
`secondRailSpeed`/`secondSpec`/`secondNic*` → extra Target fields ·
`secondMore` → loop control only (never an input) · `fabricArch`→fabricArchitecture
(only asked when 2+ targets; single-target guided silently defaults to sharedSpine) ·
`traffic`→trafficProfile · `leaf100`/`leaf25`→leaf overrides · `roadmap`→speedRoadmap ·
`redundancy`→redundancy (DEFECT B4) · `growth`→growthHeadroom · `oob`→includeMgmt ·
(no `nos` question — R14, 2026-07-23: OS10 dropped portfolio-wide; hardcoded `nos:'sonic'`) ·
`core`→includeCoreUplink+coreSpeed · `coreFar`→coreReach+coreFarEnd ·
**R14 Slice 4 (2026-07-23):** `coreReach`+`coreType` MERGED into one wizard question,
`coreDistance` (`'room'`\|`'building'`\|`'offsite'`) → `coreType` (`'offsite'`→`'dci'`, else
`'core'`) AND `coreReach` (`'building'`/`'offsite'`→`'longreach'`, else `'auto'`) — both engine
fields set consistently from one answer; the impossible dci+short-reach combination can no
longer be produced from the guided wizard. Refresh path (§3.7) is unaffected — it never had a
`coreType` question, only `coreReach`.
`borderLeaf`→borderLeaf · `verity`→opts.verity.

### 3.5 Express

`xConnect`→platformId (mixed adds a powerstore target) · `xStack`→stack ·
`xCount`→units · `xRacks`→racks ('several'→ceil(count/16)) ·
`xResilient`→redundancy (DEFECT B4) · `xDfm`→opts.verity.
Hardcoded (declared assumptions): growthHeadroom 0.25, includeMgmt, nos sonic,
placement in-rack, breakout auto, trafficProfile balanced, leaf auto, aiTransport roce.

### 3.6 Discovery

Collected and passed to the engine: `dellPlat`/`workloads`→platformId (routing;
edge workload → recommendEdge with hardcoded poe+/1g/vlt-pair/new) · `scale`→units ·
`aiModelD`/`nasModelD`→modelId · `railSpeedD`→railNic · NIC steps → nic/nic2 ·
cabling/sizing steps → placement/structuredInPlace/breakout/racks/leaf100/leaf25/
trafficProfile/speedRoadmap/storageProtocol.
Hardcoded: redundancy dual, growthHeadroom 0.25, includeMgmt, stack nvidia, gpus 8.
GUIDANCE-only (never reach the engine): `vendor`, `currentSpeed`, `workloads` (as
pain/pitch input), `pains`, `timeline`.

### 3.7 Refresh

`swCount`/`portsPer`/`speedNow`(DISPLAY)/`targetSpeed`/`topologyNow`/`distribution`/
`oob`→includeMgmt · `vendor` → GUIDANCE only (never read by recommendRefresh) ·
`verity`→opts.verity.
**R16 (2026-07-17):** `core`→includeCoreUplink+coreSpeed (same combined shape as GUIDED's
`core`; `showIf: distribution === 'existing'`, matching the engine's own `!needSpine` gate) ·
`coreVendor`→coreVendor · `coreReach`→coreReach (mapped `'long'→'longreach'`, else `'auto'`,
identical to the main path). Deliberately does NOT collect `coreFarModel`/`coreFarPort` —
`recommendRefresh`'s coreVendor handling never reads them (always resolves the Dell far side
through `pickCoreOptic`'s matched-both-ends pattern, unlike the main path's per-model matching);
adding those questions would build UI for values the engine discards.

---

## 4. Defect & gap register (inputs that fail this contract today)

| # | Field | Problem | Disposition |
|---|---|---|---|
| D1 | `redundancy` (dual/single) | **Backtest defect B4**: byte-identical hardware between runs 2 and 3. The single most quote-dangerous input defect. | Phase 2 makes it SIZING per J1 (dual = redundant leaf PAIR on one fabric, VLT/MC-LAG term per OS, ICL priced). Phase 1 invariant 4 + Fixtures A/B pin it. |
| D2 | primary `nic.network` | Read by normNic, set by no UI, consumed by nothing. | **DECIDED 2026-07-16: removed from the primary NIC shape** (nic2 keeps it). Phase 2 implements the removal. |
| D3 | `oversubTarget` | Engine honors it; no UI can set it. | **DECIDED 2026-07-16: stays a documented programmatic override — no UI.** Classified NO-UI permanently; exempt from the input-effect UI sweep, still honored by the engine. |
| D4 | `coreCount` | Engine honors it; every UI hardcodes 2. | **DECIDED 2026-07-16: stays hardcoded 2, documented — no UI.** Same standing as D3. |
| D5 | `uplinkTarget` | ~~Doesn't exist; J2 requires it.~~ **BUILT 2026-07-16** — engine (spine trigger override) + wizard + expert form + Fixtures A/A2 + input-effect. | RESOLVED. |
| D6 | `coreVendor` (+ `coreFarModel` / `coreFarPort`) | ~~`coreHandoff` doesn't exist; J3 requires it.~~ **BUILT 2026-07-16** — replaced the our-side/far-side binary with the core-VENDOR question (failure-direction default `unsure`); engine + wizard + expert form + Fixtures A/A3 + input-effect. | RESOLVED. |
| D7 | `separateFabrics`, `media` | Legacy aliases, no UI. | Freeze (documented); never extend. |
| D8 | Low-utilization silence | Backtest B6: rack-driven sizing at ~20% port fill warns nothing. Not an input, but an input-adjacent gap (racks drives qty silently). | Phase 2/3 warning; noted here because `racks` is the trigger input. |
