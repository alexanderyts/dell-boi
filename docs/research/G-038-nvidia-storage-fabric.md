# G-038 research — what an all-NVIDIA storage / frontend fabric should look like

**Date:** 2026-09-18 · **Status:** researched AND RULED (see DECISIONS below) — engine not yet changed. Feeds GAPS G-038
(and R13). Produced by a read-only research pass over `corpus/` plus NVIDIA's public docs.

**How to read this:** facts marked **CORPUS** cite a file + line in `corpus/txt/` and can be
re-verified from a clone. Facts marked **WEB-ONLY** came from NVIDIA's public documentation through
a summarising fetch — two fetches disagreed on some numbers — so they are **unverified** and must
not be hard-coded until the document is in the corpus.

## The short answer

The tool currently puts an NVIDIA-stack AI server's storage and frontend networks on **SN4700**
leaves with uplink counts borrowed from a Dell S5232F-ON, which yields a **7:1 oversubscribed
storage fabric**. No published design does that:

1. **Every reference design found uses SN5600-class switches** (128× 400G) — SN5610 (64× 800G) in
   Dell's own XE9680 brief — for storage/frontend. **None uses the SN4700.**
2. **Storage is not a separate fabric.** It shares ONE "converged" (storage + in-band/frontend)
   fabric, separated by VLAN/VXLAN — and that fabric is physically separate from the GPU fabric.
3. **Published blocking is about 5:3 on the server side and 1:1 on the storage-array side** —
   nowhere near 7:1.
4. **Dell sells no 25G/100G-native Spectrum leaf.** Every Spectrum model in Dell's guide reaches
   25G only by breakout, which is why 25G hosts end up needing unquoted QSA28 adapters.

## Findings

### 1. Switch models; separate vs converged
- **CORPUS — NVIDIA DGX SuperPOD (GB200):** one shared storage + in-band Ethernet fabric on SN5600,
  SN2201 for out-of-band (`NV-GB200-RA.txt:440-446`, `:804`, `:462`). Storage is a dedicated VXLAN
  on it, not separate switches (`:898-900`); independent of the compute fabric (`:570`).
- **CORPUS — NVIDIA Enterprise RA, GB300 NVL72 (Mar 2026):** "a converged network for both storage
  and in-band management" (`NV-NVL72-RA.txt:848`). Converged (north/south) fabric = SN5600, OOB =
  SN2201 (`:1136-1140`); 2× SN5600 per rack (`:1172`); small builds merge compute into it
  (`:940-944`); logical fabrics isolated by VLAN (`:1345`).
- **CORPUS — Dell brief for XE9680 (NVIDIA 2-8-9-400):** 2× SN5610 converged, 1× SN2201 OOB,
  PowerScale F710, up to 12 nodes (`AI-ERA.txt:187-193`).
- **CORPUS — Dell Spectrum AI-fabric guide (H04658):** frontend = converged fabric carrying
  storage, application and in-band management, 400G down to 25G (`AI-SPECTRUM.txt:268`); names
  exactly SN5600, SN5610, SN2201 (`:109`).
- **WEB-ONLY:** NVIDIA HGX AI Factory Enterprise RA (the XE9680's server class) — SN5600 for both
  compute and converged fabrics, SN2201 OOB. DGX B200 SuperPOD — SN5600 storage fabric.

### 2. Per-server NIC and storage attach
- **CORPUS:** GB300 NVL72 — one BlueField-3 B3240, 2× 400G QSFP112, one port to each of two
  switches (`NV-NVL72-RA.txt:686-694`, `:862`, `:1694`). GB200 SuperPOD — 4× 200GbE BlueField-3
  per tray, two ports for storage (`NV-GB200-RA.txt:818-820`, `:894`, `:574`).
- **CORPUS — XE9680 (Dell docs disagree with each other):** two frontend NICs in the outer PCIe
  slots; one guide runs them at 400GbE (`AI-SPECTRUM.txt:265`), another at 2× 200GbE
  (`AI-NETGUIDE.txt:109`) and recommends 200GbE or 100GbE for the frontend (`:193`). Neither names
  a BlueField-3 model.
- **CORPUS — storage arrays:** SuperPOD gives storage appliances their own SN5600 leaf pair per
  scalable unit, RoCE required (`NV-GB200-RA.txt:820`, `:900-902`). The Enterprise RA attaches
  storage at 100G/200G, 18 links per 72 GPUs, floor 12.5 Gb per GPU (`NV-NVL72-RA.txt:1207`).

### 3. Oversubscription and uplinks
- **CORPUS:** SuperPOD storage — non-blocking on the storage side (16× 800G per SU), blocking
  factor 5:3 on the compute-node side (`NV-GB200-RA.txt:910-914`); spines keep 28× 800G up
  (`:834`). Enterprise RA — non-blocking fat-tree (`NV-NVL72-RA.txt:1051-1053`), 36× 400G uplinks
  per SU for the CPU fabric (`:1198`).
- **WEB-ONLY:** DGX B200 storage ≈ 4:3 node side, 1:1 storage side; HGX RA 8× 400G N-S uplinks per
  4-node SU.
- No document states a general frontend ratio. All are far from 7:1.

### 4. Scalable-unit sizing
- **CORPUS:** GB200 SuperPOD — 2 SN5600 spines per SU + 1 SN5600 storage leaf pair + 1 SN2201
  pair; super-spine to 16 SUs (`NV-GB200-RA.txt:814-826`, `:853-867`). GB300 — 18 nodes per SU, 2
  SN5600 per rack (`NV-NVL72-RA.txt:1166-1172`).
- **WEB-ONLY (unverified counts), HGX Enterprise RA converged fabric:** 32 nodes → 2× SN5600, no
  spine; 64 → 4 leaf + 2 spine; 128 → 8 leaf + 4 spine.

### 5. Cabling
- Not stated in extractable corpus text (the GB300 RA's cable tables did not extract —
  `NV-NVL72-RA.txt:1721-1726`).
- **CORPUS — part families available** (`NV-LINKX-GUIDE.txt:101`): MCP7Y60 (twin-port OSFP → 2×
  200G QSFP56), MCP7Y70 (→ 4× 100G QSFP56), MCP7H60 (QSFP-DD → 2× QSFP56), MCP7F60 (QSFP-DD → 4×
  QSFP56); QSA28 adapter (`:67`); MCP7F00 100G → 4× SFP28 (`:109`). No OSFP→SFP28 or
  QSFP-DD→SFP28 splitter was found.

### 6. Is there a 25G/100G Spectrum leaf Dell sells? — No
- **CORPUS:** the June 2026 Dell guide lists SN6800-LD, SN6810-LD, SN6600-LD, SN6600, SN5610,
  SN5600D, SN5400, SN4700 (`QRG-DC.txt:11`) and SN2201 (`:294`); all reach 25G only by breakout
  (`:31`). The plain SN5600 is not in that guide but IS named in Dell's H04658 (`AI-SPECTRUM.txt:109`).
  NVIDIA's own 25G/100G-native models (SN3420, SN4600C — `NV-SN4700.txt:689-690`, `:723-724`) are
  not in Dell's list.
- **Catalog defect found in passing → GAPS G-044:** SN2201 uplinks are catalogued as 4× 10/25G
  SFP28; Dell's guide and NVIDIA's sheet both say 4× 100G QSFP28.

### 7. Switch OS
Not stated by any NVIDIA RA. Matches the existing R14 ruling (Cumulus / Pure SONiC; Dell SONiC only
on SN5600 / SN5610 / SN2201). No change.

## DECISIONS — ruled 2026-09-18 (maintainer delegated: "make the decisions")

Each follows a rule this repo already ratified; none invents a principle. Two facts checked
after the research pass reshaped the answers: (a) the LinkX splitters the research proposed for
200G/100G hosts — **MCP7Y60 / MCP7Y70** — are "400Gb/s Twin-port **2x200G** OSFP" parts
(`NV-LINKX-GUIDE.txt:101`), i.e. a different cage class from the SN5600's 2×400G twin-port OSFP,
with QSFP56 (50G-PAM4) far ends; nothing in the corpus verifies them on an SN5600. (b) In the
engine a storage ARRAY is never NVIDIA-stack: `fs.stack` is 'nvidia' only for an AI platform's own
fabrics (`engine.js` step 2), so PowerScale/PowerStore already ride their Dell-documented leaves.

1. **Switch = SN5600, leaf and spine, for the NVIDIA-stack north-south fabric.** Same model the AI
   fabric already quotes (one Spectrum model across the design), named by Dell's H04658 and both
   NVIDIA RAs. SN5610 only if a host NIC is 800G. The line carries a verify note: Dell's June 2026
   QRG lists SN5610 / SN5600D, not the plain SN5600 — confirm orderability. **The SN4700 leaves
   NVIDIA-stack non-AI sizing entirely** (no published design uses it) → this also closes **R13**:
   no 25G Spectrum rung is needed because no 25G host lands on Spectrum (decision 3).
2. **NVIDIA-stack default NIC = ONE converged north-south network, 2× 400G per GPU server**,
   dual-homed to an SN5600 pair, cabled with the already-catalogued, already-verified 1:2 assembly
   (MCP7Y10 for a QSFP112 BlueField-3 B3240; MCP7Y00 for an OSFP NIC) — asked, never guessed, and
   verify-flagged "confirm the NIC", exactly like the GPU rails (ruling #6). Evidence: NVIDIA
   Enterprise RA B3240 2× 400G (`NV-NVL72-RA.txt:686-694`); Dell's H04658 runs the XE9680 frontend
   NICs at 400GbE (`AI-SPECTRUM.txt:265`). It is the ONLY host attach to an SN5600 with part
   evidence (ruling #4: no part, no credit). Storage + frontend share it (VLAN-separated), separate
   from the GPU fabric — the published shape. **Dell-stack seed is unchanged** (2× 100G storage +
   2× 25G frontend on Dell leaves).
3. **A sub-400G NIC (25/100/200G) entered on an NVIDIA-stack design is quoted on the DELL ladder**
   (S5248F-ON / S5232F-ON / Z9432F-ON — fixture-backed), with a visible info line calling it a
   PARTS decision: no verified Spectrum attach exists at that speed. Never silent QSA28 adapters,
   never an SN4700. SPEC §1 already permits this ("a Dell core + a separate NVIDIA AI pod … are
   separate fabrics"); the no-mix rule binds WITHIN a fabric, and this network is wholly Dell.
4. **PowerScale does NOT attach through 1:4 splitters.** MCP7Y70's 100G ends are QSFP56
   (2× 50G-PAM4); a PowerScale 100G NIC is QSFP28 (4× 25G-NRZ) — a passive cable cannot convert
   encoding (ruling #8, the held S56DD DAC, same physics). Arrays keep their Dell-published fabric
   (ruling #3; h16346 backend isolation) — which the engine already does — and that Dell leaf pair
   uplinks switch-to-switch into the converged fabric.
5. **The HGX RA PDF is NOT a blocker.** The tool sizes by port math, not by RA tables, so no
   per-SU switch counts are coded. Intake it later (Sonnet work) as a ground-truth fixture.

**Sizing policy for the converged fabric:** uplink count derived from the leaf's OWN ports (never
the borrowed S5232F constant of 4); oversubscription held to the existing ≤ 2:1 general/storage
cap (NVIDIA's published 5:3 sits inside it); collapsed SN5600 pair with no spine while the hosts
fit one pair; port credit only through the quoted 1:2 assembly (G-037).

**Implementation slices (next session):** (1) platform seed: `poweredge-ai` gains an NVIDIA-stack
north-south port group (2× 400G, network `frontend`, carries storage) selected when stack =
nvidia; (2) `pickLeaf`/`pickSpine` nvidia non-AI branch → SN5600 at ≥400G, Dell ladder below it
with the info line; (3) per-switch uplink policy for leaves without dedicated uplink ports;
(4) wizard/Expert: the north-south NIC cage question reuses the rail-cage pattern; (5) tests +
a golden fixture for 56× XE9680 NVIDIA; SPEC §6, DESIGN-LOG, CHANGELOG.

## Research pass's original proposal (superseded where DECISIONS above differ)

- **Model:** NVIDIA-stack storage + frontend ride an **SN5600 pair** (SN5610 where Dell's XE9680
  brief applies); SN5600/SN5610 as spine; never SN4700. 400G hosts native; 200G via MCP7Y60-class
  1:2; 100G via MCP7Y70-class 1:4 (both need cataloguing with verification — and after G-037 a
  splitter only earns port credit if it is the part actually quoted).
- **Uplinks:** derive from the leaf's own 400G ports; target ≤ 5:3 node-side, 1:1 on the storage
  leaf pair; warn above 2:1; collapsed two-switch fabric below ~32 nodes; dual-home every node.
- **Default topology:** storage **converged** with frontend on the same pair (VLAN/VXLAN
  separated), physically separate from the GPU fabric; "separate storage fabric" as an opt-in.

## The five questions as originally posed (all answered in DECISIONS above)
1. **SN5600 or SN5610 as the quoted default?** (Dell's June guide lists SN5610 and SN5600D, not the
   plain SN5600; Dell's H04658 names SN5600.)
2. **Default frontend NIC for an XE9680:** 2× 200G, 2× 400G, or BlueField-3 B3240? (Dell's two
   guides disagree.)
3. **25G devices on an NVIDIA stack:** block with an error, quote QSA28 adapters with a flag, or
   allow a Dell S5248F-ON as a mixed-vendor storage/frontend leaf?
4. **PowerScale at 100G:** attach through 1:4 splitters on the storage leaf pair?
5. **Get the HGX Enterprise RA PDF into the corpus** before any per-SU switch counts are coded?

## Sources (web)
- NVIDIA HGX AI Factory — Network Logical Architecture:
  https://docs.nvidia.com/enterprise-reference-architectures/hgx-ai-factory/latest/network-logical-architecture.html
- DGX SuperPOD B200 — Network Fabrics:
  https://docs.nvidia.com/dgx-superpod/reference-architecture-scalable-infrastructure-b200/latest/network-fabrics.html
- NVIDIA NVL72 AI Factory — Network Logical Architecture:
  https://docs.nvidia.com/enterprise-reference-architectures/nvl72-ai-factory/latest/network-logical-architecture.html
