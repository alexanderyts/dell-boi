# Citation Log — verification tracking

Every specific factual claim sourced from a Dell/NVIDIA document (a PN, a
table number, a page reference, a port/speed spec, an EOL status) goes here
with a `verified` date. This is separate from `SPEC.md`, which
states the *rule*; this file tracks *when we last confirmed the rule is
still true against the live source*.

Re-check cadence: quarterly at minimum, or immediately when touching the
code path that consumes the citation. Anything unverified for >2 quarters
should be flagged for re-check before the next release, not silently trusted.

Columns:
- **Claim** — the specific fact (PN, table ref, spec number)
- **Source doc** — document code + section/page/table
- **Enforced in** — file/rule that consumes this fact
- **Verified** — last date someone actually re-checked it against a current doc
- **Status** — `CURRENT` | `NEEDS RECHECK` | `STALE — action needed`

---

## PowerScale back-end

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| S5232 back-end PN = 210-BCVB | `corpus/txt/PS-SUPPORTABILITY.txt` (PowerScale OneFS Supportability and Compatibility Guide, Apr 2026), Table 33: "32-port 100 GbE S5232  210-BCVB  11-09-2021" | `rules.backend.powerScaleBackendPNs`, validate #21i | 2026-07-15 | CURRENT |
| Z9664 back-end PN = 210-BCJH (100G/200G FLAT only) | same doc, Table 33: two rows "64-port 400GbE Z9664  210-BCJH," one "Only supports 200GbE flat topology," other "Only supports 100GbE flat topology" — matches exactly | same | 2026-07-15 | CURRENT |
| Z9264 back-end PN = 210-AWOW | same doc, Table 33: "64-port 100 GbE Z9264  210-AWOW  02-28-2019" | same | 2026-07-15 | CURRENT |
| PowerScale cluster hard max = 252 nodes | `corpus/txt/ST-POWERSCALE.txt` (PowerScale spec sheet — NOT the same doc as the PN table above, correcting the prior citation): "A cluster can scale up to 252 nodes." | cluster-size validation | 2026-07-15 | CURRENT (source doc corrected — was cited as H16346.8, actually in the spec sheet) |
| Back-end supported switches: S5232F-ON, Z9664F-ON, Z9264-ON (Dell); Arista 7308X3; NVIDIA SN5600 via ETC | `corpus/txt/PS-SUPPORTABILITY.txt` — **checked 2026-07-15, does NOT corroborate as written.** The doc's actual Table 4 is "InsightIQ Supportability" (unrelated); switch data lives in Tables 32/33/35. Table 35 (Arista) lists only PNs 851-0283/851-0282/851-0261/851-0260/851-0422/851-0423 — no "7308X3" anywhere. Table 32 (Mellanox/NVIDIA) lists only legacy QDR/EDR/HDR **InfiniBand** switches — no SN5600 anywhere in this document. Model names in the doc also lack the "-ON" suffix this catalog uses. | `rules.backend`, validate #21i | 2026-07-15 (checked, not confirmed) | STALE — action needed (the specific model numbers "7308X3" and "SN5600 via ETC" are not found in the cited document; either a different doc actually supports this or it needs re-sourcing) |
| Back-end EOL: Z9100-ON, S4148F-ON, S4112F-ON | `corpus/txt/PS-SUPPORTABILITY.txt` — checked 2026-07-15, doc exists and lists these three switches in Table 33 but with only an RTS (release-to-sale) date (all 11-17-2018), never an EOL date — this document doesn't actually state EOL status for any row | `rules.backend` | 2026-07-15 (checked, inconclusive) | NEEDS RECHECK (not confirmed OR contradicted — EOL status likely lives in a different, EOL-specific Dell doc not yet in corpus) |

## PowerStore storage fabric (system bond → MC-LAG)

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| PowerStore requires a switch-dependent LACP system bond across BOTH ToRs, which mandates an MC-LAG/VLT peer-link (ICL) on the storage ToR pair — i.e. the storage fabric is NOT pure independent A/B MPIO | **`corpus/txt/ST-PSTORE-HA.txt` — H18157.11, "Dell PowerStore: Clustering and High Availability", April 2026** (`corpus/raw/ST-PSTORE-HA.pdf`, manifest row `ST-PSTORE-HA` in `docs/sources.csv`). CORPUS-BACKED and re-verified by text extraction 2026-07-16 — all three points confirmed **verbatim**, not on trust: (1) *"In multi-appliance PowerStore clusters, the ICM and ICD networks communicate through a link aggregation, also known as a bond. These bonded ports connect to the top-of-rack switch network…"* + *"Link aggregations are discussed further in the section named Link Aggregation Control Protocol (LACP)"*; (2) *"For switches that are stacked, VLT, or equivalent technology for a different switch vendor **must be configured**"*; (3) *"Figure 43. Highly available block configuration"*. Also confirms PowerStoreOS 4.4+: *"When adding a second appliance to the cluster, a link aggregation must be specified for the ICM and ICD clustering networks"* — i.e. the bond appears exactly when the cluster becomes multi-appliance. | `platform.powerstore.systemBond === true`; engine redundancy block (a redundant PowerStore storage fabric takes MC-LAG under the spare-port scope, not independent-ab); Fixture #5 storage ICL | 2026-07-16 | **CURRENT** — ruling FINAL (2026-07-16, maintainer), now corpus-backed. The engine was already correct; this CONFIRMS the reversal of the 16b hand-verified "storage A/B without ICL" reading, and Fixture #5 storage is pinned MC-LAG + ICL unconditionally. 6× 5200T is a multi-appliance cluster — the strongest form of the requirement. A real PowerStore quote therefore carries 2× 100G ICL DAC per storage pair. **Forward-looking (no impact today):** FSN (Fail-Safe Networking) is an active/passive alternative to LAG — the doc scopes it to **file interfaces** (*"PowerStoreOS 3.5 adds Fail-Safe Networking (FSN) support for file interfaces"*), so it does NOT relax the ToR-pair requirement for the ICM/ICD system bond. Re-check if/when file-deployment (NAS) variants are modeled. |

## Optic ↔ port form factor (R12, ruling 2026-07-16d)

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| Cage compatibility: one SFP family (SFP/SFP+/SFP28); -DD cages accept their legacy single-row module; SFP-into-QSFP requires a **QSA28** adapter, never a bare fit | `corpus/txt/OPTICS.txt` (Dell Transceivers & Cables Spec Sheet 2026): *"The 10GbE SFP+ receptacle will also recognize 1GbE SFP transceivers"*; *"Standard 10GbE SFP+ and 25GbE SFP28 optics can be readily inserted, recognized, and utilized in the 100GbE QSFP28 receptacle using a (QSA28) pluggable adapter"*; adapter part `QSA-Q28-S28` listed as "100GbE QSFP28 to 25GbE SFP28 adapter" | `CATALOG.formFactor` (cage table); validate #23 | 2026-07-16 | CURRENT |
| **QSFP-DD cages do NOT accept QSFP112** (so QSFP112 is its own cage, not folded into QSFP) | `corpus/txt/NV-LINKX-400G-COMBO.txt`: *"QSFP-DD cages on SN5400/SN4700 switches are backwards compatible with QSFP56 and QSFP28 devices (but don't support QSFP112)"*; *"QSFP112 cages on CX7 and BF3 support backwards compatibility with QSFP56 and QSFP28 devices"*; root cause stated same doc: *"100G-PAM4 cables and transceivers cannot downshift to 50G-PAM4 or 25G-NRZ"* | `CATALOG.formFactor` cage table + ACCEPTS map | 2026-07-16 | CURRENT |
| MCP1660-W0xx (400G QSFP-DD DAC) is for **SN5400 / SN4700 only** — not twin-port-OSFP switches | `corpus/txt/NV-LINKX-400G-COMBO.txt`: *"Only QSFP-DD offering is 400G DR4 for SN5400/SN4700 switches"* | optic `nv-dac-400g-qsfpdd` (`switchCage: 'qsfp-dd'`); `pickHostCable` cage branch | 2026-07-16 | CURRENT |
| The 1:2 rail splitter is selected by the **NIC's far-end cage**: MCP7Y00 → 2× OSFP; MCP7Y10 → 2× QSFP112 | `corpus/txt/NV-LINKX-400G-COMBO.txt` names them by far end: *"Switch-to-400G ConnectX-7/OSFP 1:2 Splitter Cables"* vs *"Switch-to-400G/QSFP112 ConnectX-7+ BlueField3 DPUs 1:2 Splitter Cables"* | optics `nv-brk-800g-2x400-osfp` / `-q112`; `railNicCage` (INPUT-SCHEMA) | 2026-07-16 | CURRENT |
| ConnectX-7 / ConnectX-8 ship in **BOTH** OSFP and QSFP112 — so the generation does NOT determine the cage (this is why `railNicCage` is asked, not derived) | `corpus/txt/NV-CX8-UM.txt`: *"The C8180 ConnectX-8 SuperNIC, featuring a single-port OSFP module"* AND *"Networking Port: Dual-port QSFP112"*; LinkX lists CX-7 on both splitter lines | `formFactor.railNicCageOf` (deliberately contains ONLY BlueField-3 → QSFP112) | 2026-07-16 | CURRENT |
| S5448F-ON's 100G access ports are SFP56-DD and **QSFP28 optics will not work in them** | `corpus/txt/SW-S5448F.txt`: *"SFP56-DD 100GbE ports on S5448F-ON use PAM4 technology (i.e. 2x50G SerDes), and not the NRZ technology (i.e. 4x25G SerDes). QSFP28 optics and break-out will not work on the SFP56-DD (or S56DD) ports."* | `pickHostCable` SFP-DD branch → S56DD family | 2026-07-16 | CURRENT |
| S56DD-100G-SR1.2 / -FR / -LR exist as Dell parts (duplex LC; OM4 100m / 2km / 10km) | `corpus/txt/OPTICS.txt`, table *"100-Gigabit Ethernet SFP56-DD transceivers"* + the "Dual 100GbE / 40GbE transceivers" ordering row | optics `s56dd-100g-sr` / `-fr` / `-lr` | 2026-07-16 | CURRENT (model + connector + reach confirmed; orderable SKU still pending) |
| **TASK — DAC-S56DD-Q56 far-end compatibility per NIC.** The spec sheet lists `DAC-S56DD-Q56-100G-xM` (1/2/3m, *"S56DD to Q56"*, *"Q56 end is compliant to SFF-8636 coding"*). A passive DAC cannot convert line encoding, so this is only valid into a **50G-PAM4 / QSFP56-capable** NIC — NOT a 25G-NRZ QSFP28 NIC. Verify against the optics spec sheet + NIC datasheets before enabling it per-NIC. | `corpus/txt/OPTICS.txt` (part exists); NIC-side evidence NOT yet gathered | Intentionally NOT cataloged — S5448F in-rack hosts quote the SR1.2 optic instead (ruling 2026-07-16d(b)) | — | **OPEN TASK** — non-blocking (the optic path is known-buildable, just pricier). Enable the DAC only per-NIC after verification. |
| **TASK — 800G-native inter-switch rule.** "400G is the host/rail speed; inter-switch hops between same-cage switches run native port speed" is a DESIGN ruling (2026-07-16d), corroborated by part evidence (no cataloged OSFP→OSFP 400G assembly) but not yet by a Dell design doc. Checked against H20082 (now in corpus) 2026-07-17: H20082 describes Rail Optimized topology with Z9864F as leaf/rail switch but **does NOT state the speed of switch-to-switch (spine) links** — it shows the topology and GPU reachability counts but has no explicit spine link-speed text. No contradiction found; no confirmation either. Need a deeper RA (DVDs or DRDs mentioned in H20082 as the detailed reference). | `corpus/txt/AI-OVERVIEW.txt` (H20082, July 2024) — checked 2026-07-17; inter-switch speed not stated | `engine.js` step 2 (`fs.uplinkSpeed` for AI); SPEC | 2026-07-17 (checked, not addressed) | **OPEN TASK** — **contradiction = re-rule trigger.** H20082 does not contradict or confirm. Hunt the Dell Validated Designs (DVDs) or Dell Reference Designs (DRDs) referenced in H20082 Ch.1 Disclaimer as the next target. |
| **TASK — super-spine 800G termination.** The Z9964F-ON (64× 1.6T OSFP224) is currently GATED out as a super-spine for 800G Z9864F-ON pod-spines: it reaches 800G only via breakout (`'800G': '128 (breakout)'`) and no 1.6T→2×800G part with **OSFP112 far-ends** is cataloged. Hunt for a real part in the Dell optics spec sheet + H20082/AI Factory RA. Checked H20082 (now in corpus) 2026-07-17: H20082 does not mention the Z9964F-ON at all; it only references Z9864F, Z9664F-ON, and Z9432F-ON as the AI switch family. No 1.6T part found. | `corpus/txt/OPTICS.txt` (not found, 2026-07-16); `corpus/txt/AI-OVERVIEW.txt` (H20082, Z9964F not mentioned, 2026-07-17) | `superSpineTerminates` / `pickSuperSpine` (part-evidence gate) | 2026-07-17 (checked H20082, still absent) | **OPEN TASK** — the flagship is GATED, not banned: catalog a qualifying part and the Z9964F-ON re-enters the ladder automatically and the tier narrows. If the RA sizes this differently → re-rule trigger. |

## Switch capacity / spec sheet numbers

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| Z9432F 25.6 Tbps full-duplex | `corpus/txt/SW-Z9432F.txt`: "25.6Tbps non-blocking (full duplex)" | catalog (display only) | 2026-07-15 | CURRENT |
| Z9664F 51.2 Tbps full-duplex | `corpus/txt/SW-Z9664F.txt`: "51.2Tbps non-blocking (full duplex)" | catalog (display only) | 2026-07-15 | CURRENT |
| Z9864F 102.4 Tbps full-duplex | `corpus/txt/SW-Z9864F.txt`: "102.4Tbps switching capacity (full duplex)" | catalog (display only) | 2026-07-15 | CURRENT |
| Z9964F 204.8 Tbps full-duplex | Dell Z-series spec sheet | catalog (display only) | 2026-07-13 | STALE — action needed |
| SN4700 12.8 Tbps (single-direction, NVIDIA convention) | `corpus/txt/NV-SN4700.txt`: "SN4700 ... 1U ... 12.8Tb/s"; cross-confirmed in `QRG-DC.txt`'s NVIDIA table | catalog (display only) | 2026-07-15 | CURRENT |
| SN5610 51.2 Tbps (single-direction) | `corpus/txt/NV-SN4700.txt`: "SN5610 ... 2U ... 51.2Tb/s"; cross-confirmed in `QRG-DC.txt` | catalog (display only) | 2026-07-15 | CURRENT |

**2026-07-15 (G-004 power-table pass) — Z9964F capacity CONFLICT found:** `corpus/txt/QRG-DC.txt`
(Dell Networking QRG, June 2026), "Switching capacity (Tbps)" row, Z9964F-ON column: **102.4**,
not 204.8. Both figures are plausible under different accounting conventions (single-direction
port aggregate vs full-duplex bidirectional — this catalog's OTHER entries, e.g. Z9864F at 102.4
listed here vs 102.4 in this same QRG table, are internally consistent either way since they
match), but 204.8 vs 102.4 for the SAME switch under the SAME "full-duplex" label is a real
either/or, not a convention difference — needs a second source to break the tie, not assumed
correct because it shipped first. Upgraded to STALE pending that check.

## Power / wattage (added 2026-07-15, GAPS.md G-004)

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| Z9964F-ON power = 4987 W (Max, no "normal" figure given in this table) | QRG-DC.txt (June 2026), "Power consumption (W)" row | `rules.power.switchWatts['z9964f-on']` | 2026-07-15 | NEEDS RECHECK (Max, not the typical/normal figure this table's own note promises — flag to a rep as conservative-high, not confirm as typical) |
| SN5600D power = 940 W (normal) | QRG-DC.txt (June 2026), "Power consumption (W)" row | `rules.power.switchWatts['sn5600d']` | 2026-07-15 | CURRENT |
| Z9664F-ON power = 700 W (existing entry) vs QRG-DC.txt's own "normal" column = 500 W | QRG-DC.txt (June 2026) vs whatever sourced the existing 700 entry (untraced) | `rules.power.switchWatts['z9664f-on']` | — | STALE — action needed (two Dell docs disagree; existing entry NOT changed without knowing which is current) |
| Z9432F-ON power = 500 W (existing entry) vs QRG-DC.txt's own "normal" column = 900 W | QRG-DC.txt (June 2026) vs whatever sourced the existing 500 entry (untraced) | `rules.power.switchWatts['z9432f-on']` | — | STALE — action needed (same as above, opposite direction — existing entry is LOWER than the newer doc, not higher, so this isn't just "old doc understated it") |
| SN5600 (plain, not -D) and SN6810 (plain, not -LD) — NO power figure found under either exact model name anywhere in corpus/ | — | `rules.power.switchWatts` (neither key present; falls back to the by-rack-U estimate) | 2026-07-15 (searched, not found) | NEEDS RECHECK |
| SN6810 catalog entry (128×800GbE, 2U, Spectrum-6) vs QRG-DC.txt's SN6600 column (64×1.6TbE, 3U EIA, also Spectrum-6/102.4Tbps) — possible form-factor/naming mismatch, not reconciled | QRG-DC.txt (June 2026) vs NVIDIA Spectrum-6 SN6810 announcement (cited in switches.js's own sn6810 entry, CES 2026) | `js/catalog/switches.js` sn6810 entry | — | NEEDS RECHECK (two different NVIDIA naming/spec sources for what may or may not be the same silicon in different form factors — a genuine research question, not assumed resolved) |

## End-of-sale / lifecycle status

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| S41xx series (S4148F-ON, S4128F-ON, S4112F-ON) end of sale | `corpus/txt/QRG-DC.txt` — checked 2026-07-15: doc exists but does NOT state "end of sale"/EOL for S4112/S4128/S4148 anywhere | catalog `eol:true` flag | 2026-07-15 (checked, inconclusive) | NEEDS RECHECK (not confirmed OR contradicted by the corpus doc — EOL status likely needs a dedicated Dell lifecycle/EOL notice, not a QRG) |
| S4348F-ON replacement specs (2.16 Tbps, 48×10G SFP+, +12 breakout, 6×100G uplinks) | `corpus/txt/QRG-DC.txt`, S-series table: "Switching capacity (Gbps) ... 2160" (S4348F-ON col), "10GbE (SFP+) ... 48+12 (breakout)", "100GbE (QSFP28) ... 6" — all match exactly | leaf ladder | 2026-07-15 | CURRENT |
| S4348T-ON specs (native RJ45, multi-rate 1/10GBase-T, 2.16 Tbps, 6×100G uplinks) | `corpus/txt/QRG-DC.txt`, S-series table: "Switching capacity (Gbps) ... 2160" (S4348T-ON col), "1/10GBase-T ... 48" (native RJ45 access, matches exactly), "40GbE (QSFP28) ... 6" (uplink port count) | copper leaf ladder | 2026-07-15 | CURRENT (was: user-directed correction, unconfirmed against a spec sheet — now directly confirmed) |

## AI / NVIDIA platform anchors

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| XE9680 = 8 GPUs | `corpus/txt/CO-XE-AI.txt`: "8 NVIDIA HGX H100 80 GB 700 W SXM5 GPUs" | platform models | 2026-07-15 | CURRENT |
| XE9680 = 1×400GbE rail/GPU | **`corpus/txt/AI-OVERVIEW.txt` (H20082, July 2024) — VERIFIED 2026-07-17**: *"Each GPU in the Dell PowerEdge XE9680 is coupled through PCIe with a respective NIC that interfaces with the fabric at 400GbE speed"*; *"Eight of the NICs/DPUs are coupled through PCIe with the eight GPUs and are used to exchange parameters among GPUs belonging to different chassis through a Scale Out Fabric."* Verbatim match. | platform models | 2026-07-17 | **CURRENT** — source found and confirmed. (Note: `CO-XE-AI.txt` describes a Gaudi3 server variant with a different NIC — H20082 is the authoritative source for XE9680+H100 GPU rail config.) |
| Z9864F-ON TH5, 64×800G native | `corpus/txt/SW-Z9864F.txt`: "64x 800GbE OSFP112"; `corpus/txt/SONIC-COMPAT.txt`: "Tomahawk5" | platform + engine | 2026-07-15 | CURRENT |
| Z9864F-ON "128 GPUs @ 400GbE rail-optimized" | **`corpus/txt/AI-OVERVIEW.txt` (H20082, July 2024) — VERIFIED 2026-07-17**: *"Single Dell PowerSwitch Z9864 (or Z9664F-ON) switch ... 8 to 128 (or 8 to 64) GPU cluster"* (single-switch topology). The 128 figure is explicit in the doc, not only derived. Mechanism confirmed same doc: 400GbE GPU NICs connect to Z9864F; with 64×800G ports broken out at 2×400G = 128 connections. | platform + engine | 2026-07-17 | **CURRENT** — now directly sourced, not just derived. |
| GB300 NVL72: 18 trays/72 GPU per SU, 2×SN5600 per rack, 144×400G GPU + 36×400G CPU per SU | NVL72 AI Factory RA, Mar 2026 | `reference-architectures.js` `published()` | 2026-07-13 | NEEDS RECHECK (not covered by this pass — not searched) |
| SN5600 = leaf AND spine for 400G AI rails | GB200/GB300 NVL72 RAs | NVIDIA switch selection | 2026-07-13 | NEEDS RECHECK (not covered by this pass — not searched) |
| ConnectX generation → speed map (CX-6 Lx=25G, Dx=100G, CX-6=200G, CX-7=400G, CX-8=800G) | Corroborated across multiple corpus docs (no single "ConnectX datasheet"): `corpus/txt/ST-PFLEX-SPEC.txt` ("25Gb: ConnectX-6 Lx" / "100Gb: ConnectX-6 Dx"), `corpus/txt/NV-LINKX-400G-COMBO.txt` ("ConnectX-6 200GbE", "ConnectX-7 ... 400G"), `corpus/txt/NV-CX8-UM.txt` + `corpus/txt/NV-GB300.txt` ("ConnectX-8 ... 800Gbs") | NIC questions | 2026-07-15 | CURRENT |

## Edge / campus

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| E3248P/E3248PXE support SONiC MC-LAG; E3224F-ON does not (OS10-only) | `corpus/txt/SONIC-COMPAT.txt`, Table 7: "MCLAG L2" row = Yes for both E3248P-ON and E3248PXE-ON columns. E3224F-ON never appears in any SONiC table in this document — consistent with OS10-only, though not an explicit "no" statement | `recommendEdge`, validate #21m | 2026-07-15 | CURRENT (E3248P/PXE half directly confirmed; E3224F-ON absence is consistent-by-omission, not an explicit statement) |
| E3200 uplink port counts/classes (4×10G+2×100G, 4×25G+2×100G, etc.) | `corpus/txt/SW-E3200.txt`: "E3248P-ON ... 4x 10G SFP+ ports, 2x 100G QSFP28 ports"; "E3248PXE-ON ... 4x 25G SFP28 ports, 2x 100G QSFP28 ports"; "E3224F-ON ... 4x 10G SFP+ ports, 2x 100G QSFP28 ports" — all match exactly | edge distribution ladder | 2026-07-15 | CURRENT |

## Added during code review (2026-07-15) — rep-spoken or BOM-affecting claims found in catalog files

| Claim | Source doc | Enforced in | Verified | Status |
|---|---|---|---|---|
| MX7000: external FSE uplink count — is the intended total 4 (2/FSE) or 8 (4/FSE × 2 FSEs)? `portGroups[0].count: 4` conflicts with its own note "4× per FSE (2 FSEs/chassis)". **Partially answered 2026-07-17** by `corpus/txt/CO-MX-VCF.txt` (H19120, "Dell PowerEdge MX Deployment with VMware Cloud Foundation DG", March 2022): MX9116n FSE external ports = **2× QSFP28 (dedicated Ethernet uplink)** + **2× QSFP28 unified (Ethernet uplink OR 8×32Gb FC)** + 12× QSFP28-DD (FEM expansion, or extra uplinks/VLTi via breakout). In Ethernet-only mode: up to **4 uplinks/FSE** (the 2 dedicated + 2 unified) = **8/chassis** (2 FSEs). The current `count:4` likely represents 2/FSE × 2 FSEs (dedicated only, conservative). **The MX9116n SPEC SHEET itself is still not in corpus** — H19120 is a deployment guide, not the spec sheet. This evidence strongly suggests count should be 8 (4/FSE Ethernet-only), but a code change needs the spec sheet to confirm. | `corpus/txt/CO-MX-VCF.txt` (H19120, March 2022) — MX9116n port layout described; checked 2026-07-17 | `platforms.js` mx7000 entry (G-006) | 2026-07-17 (partial — deployment guide; spec sheet still absent) | NEEDS RECHECK — MX9116n spec sheet still not in corpus. Evidence from H19120 supports 4/FSE (8/chassis) for Ethernet-only. Code fix awaits spec sheet confirmation. |
| DFM covers "full PowerSwitch SONiC portfolio — 1G edge PoE through Z9864F 800G" — catalog now tops out at Z9964F-ON (1.6T); does DFM cover it? | be-net.com/dell | `solutions.js` talkingPoints | — | NEEDS RECHECK (talking point already lags own catalog) |
| DFM "orchestrated SONiC upgrades day 2 (no maintenance window)" | be-net.com marketing only | `solutions.js` talkingPoints | — | NEEDS RECHECK (strong claim, vendor-marketing-sourced, rep-spoken) |
| DFM "proven in production: EXEO Group telecom fabric; IREN AI factory with NVIDIA" | be-net.com marketing only | `solutions.js` talkingPoints | — | NEEDS RECHECK (named customer references, rep-spoken) |
| HCI workload: quoted ToR switches are on the "Microsoft-approved switch list" for Azure Local | Microsoft Azure Local validated-switch list (changes over time) | `discovery.js` workloads.hci | — | NEEDS RECHECK |
| AI workload discovery pitch recommends "SN5610 / SN4700" — does SN4700 still match what the engine's AI ladder actually picks for current designs? | internal consistency check vs `engine.js`/`SPEC.md` | `discovery.js` workloads.ai | 2026-07-15 (confirmed stale) | STALE — action needed. `SPEC.md § AI switch selection` (this round's own work, 2026-07-13 fix): 400G AI rails now use **SN5600** for BOTH leaf and spine; SN4700 is only the economical ToR for lower-speed host fabrics. The discovery pitch text never mentions SN5600 at all — a rep reading this pitch would recommend a switch model the engine no longer picks for the primary case. Not fixed here (content edit, out of this citation pass's scope) — flagged for a follow-up content round. |
| Optic id `dr4-400g-qsfpdd` resolves to an SR4.2/FR4 part (400G-Q56DD-SR4.2-ON), not a DR4 part — id naming is misleading but functionally correct; do NOT "fix" the id without updating every `byId('dr4-400g-qsfpdd')` call site in engine.js | — (internal naming note) | `optics.js` + `pickCoreOptic()` | 2026-07-15 | CURRENT (documented so nobody breaks the lookup) |

---

## Process notes
- When a citation is re-checked and confirmed unchanged, update `Verified`
  to the new date — don't leave the old date implying it's stale.
- When a citation is found to have changed (like the S41xx EOL), open a
  `GAPS.md` entry (or close one) AND update this table's row in the same
  commit — the two files should never silently disagree about current status.
- New citations added to `SPEC.md` must get a row here in the same PR. Treat
  "no citation log entry" as equivalent to "unverified."
