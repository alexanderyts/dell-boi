/* =============================================================================
 * DESIGN RULES  --  Dell / NVIDIA networking standards encoded as constants
 * -----------------------------------------------------------------------------
 * These drive both sizing (engine.js) and the accuracy checks (validate.js).
 * Tune values here as you confirm official Dell guidance. Each carries a source.
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

window.CATALOG.rules = {
  redundancy: {
    defaultFabrics: 2,
    interconnectLinksPerPair: 2,     // peer-link links per pair at 100GbE+ ("at least two physical ports")
    interconnectLinksPerPairSub100: 4,   // PUBLISHED: "if 25 GbE ports are used... at least four connections on each leaf" (h04504)
    // Redundancy method is OS- and design-aware. SONiC != OS10.
    methods: {
      'evpn-mh': { label: 'EVPN Multihoming (all-active — no peer-link)', peerLink: false,
        note: 'Dell Enterprise SONiC leaf-spine: servers multihome via ESI-LAG across leaves through the spine — NO dedicated inter-switch peer link.' },
      'mclag':   { label: 'MC-LAG peer-link (ICL)', peerLink: true,
        note: 'Dell Enterprise SONiC L2 dual-homing for a stand-alone ToR pair — joined by an inter-chassis peer-link (ICL).' },
      'vlt':     { label: 'VLT interconnect (VLTi)', peerLink: true,
        note: 'Dell SmartFabric OS10 VLT — the ToR pair is joined by a VLT interconnect (VLTi). OS10 only, not SONiC.' },
      'independent-ab': { label: 'Independent A/B fabrics (air-gapped, no ICL)', peerLink: false,
        note: 'Classic block-SAN pattern: two fully independent fabrics, NO inter-switch link. Valid ONLY for block (iSCSI/NVMe-TCP) with host MPIO and NO switch-dependent (LACP) bonds anywhere — multipathing provides all load balancing and failover. Saves the ICL cables + ports and removes MC-LAG config.' }
    },
    note: 'Storage & server attach should be dual-homed. Method depends on OS/design: SONiC leaf-spine = EVPN Multihoming (no peer-link); SONiC L2 ToR pair = MC-LAG (ICL peer-link); OS10 = VLT (VLTi). Single-fabric only for lab/PoC.',
    source: 'Dell Enterprise SONiC EVPN-MH / MC-LAG guides; SmartFabric OS10 VLT guide'
  },
  mtu: {
    storageJumbo: 9216,              // Dell docs specify 9216 for best performance (NOT 9000)
    note: 'Set MTU to 9216 bytes end-to-end for best performance (iSCSI / NVMe-TCP / storage back-end / AI RoCE).',
    source: 'Dell PowerFlex+SONiC Design Guide (h19678.3) "9216 bytes for best performance"; AI SONiC guide (h04600)'
  },
  oversubscription: {
    generalAccessToUplinkMax: 2.0,   // Dell L3 fabric: leaf/access must not exceed 2:1
    storageTargetMax: 2.0,           // same 2:1 ceiling for storage leaf-spine
    aiTarget: 1.0,                   // AI compute ideally non-blocking (1:1); 2:1/4:1 acceptable for cost
    // Traffic pattern sets where the design lands. East-west heavy (AI, distributed
    // storage) pushes toward non-blocking; north-south heavy tolerates more oversub.
    // The target ratio DRIVES how many uplinks each leaf needs (uplinks = accessBW / (uplinkSpeed × target)).
    profiles: {
      'ns':       { label: 'Mostly north-south (in/out of the DC)', target: 3.0, note: 'Client-server / web tiers — 3:1 is economical.' },
      'balanced': { label: 'Balanced east-west / north-south', target: 2.0, note: 'General virtualization / mixed — the Dell 2:1 default.' },
      'ew':       { label: 'Heavy east-west (AI, distributed storage, HPC)', target: 1.0, note: 'Non-blocking (1:1) — incast-sensitive; no oversubscription to turn.' }
    },
    note: 'Oversubscription = total access bandwidth / total uplink bandwidth, and it is where "sized right" is really decided — the target ratio sets uplinks-per-leaf. Dell guidance: leaf/access must not exceed 2:1 (general/storage). AI compute ideal 1:1 non-blocking; 2:1 or 4:1 acceptable for cost. Heavy east-west / lossless storage paths are effectively non-negotiable at 1:1.',
    source: 'Dell SONiC L3 Fabric guide (H18364.2) "does not exceed 2:1"; AI Fabrics Overview (H20082)'
  },
  growth: {
    defaultHeadroom: 0.25,  // reserve 25% ports for growth by default
    // Speed-migration roadmap → prefer multi-rate optics/switches so you swap optics, not switches.
    migration: {
      'none':      { label: 'No planned speed change', note: '' },
      '25-100':    { label: '25G → 100G in 24–36 months', note: 'Choose leaves with 100G-capable ports (SFP56-DD / QSFP28) and multi-rate optics now.' },
      '100-400':   { label: '100G → 400G in 24–36 months', note: 'Choose 400G-capable spines/leaves (QSFP-DD / OSFP) so the uplift is optics + config, not a switch swap.' },
      'unsure':    { label: 'Not sure yet', note: 'Lean multi-rate (SFP56-DD / QSFP-DD) to keep the upgrade path open.' }
    },
    note: 'Reserve headroom so the fabric is not shipped at 100% port utilization. Pre-provision leaf/spine capacity for 24–36 month endpoint growth (20–30% port headroom is common). If a speed migration is on the roadmap, choose multi-rate optics/switches so you upgrade optics, not the chassis.',
    source: 'Dell leaf-spine reference architecture; growth-headroom best practice'
  },
  storageProtocol: {
    // The block-storage protocol decides whether the fabric must be LOSSLESS and non-blocking.
    protocols: {
      'iscsi':    { label: 'iSCSI', lossless: false, oversubMax: 2.0,
        note: 'TCP-based — standard fabric. Jumbo MTU 9216 + dedicated storage VLANs; DCB optional.' },
      'nvme-tcp': { label: 'NVMe/TCP', lossless: false, oversubMax: 2.0,
        note: 'TCP-based — standard fabric with jumbo MTU 9216; benefits from PFC/ECN tuning but does not REQUIRE lossless. Dell SmartFabric Storage Software (SFSS) automates discovery.' },
      'nvme-roce': { label: 'NVMe over RoCE (RDMA)', lossless: true, oversubMax: 1.0,
        note: 'RDMA — REQUIRES a lossless Ethernet fabric: PFC + ECN (DCQCN), no-drop queues, and a non-blocking (1:1) storage path. Same class as the AI fabric.' }
    },
    note: 'iSCSI / NVMe-TCP ride a standard (2:1-capped) fabric with jumbo frames; NVMe over RoCE requires lossless (PFC/ECN) AND non-blocking 1:1 — the protocol choice changes the switch config and the uplink math.',
    source: 'Dell PowerStore/PowerMax networking guides; SONiC AI fabrics guide (h04600); NVMe-oF best practice'
  },
  // POWER / COOLING / WEIGHT — planning ESTIMATES for the rack rollup (typical operating
  // draw, not max). Exact figures come from Dell EIPT (Enterprise Infrastructure Planning
  // Tool); these give the rep a defensible ballpark for per-rack power, heat and weight.
  power: {
    source: 'Planning estimates (typical operating draw) — confirm exact power/cooling/weight with Dell EIPT (Enterprise Infrastructure Planning Tool)',
    btuPerWatt: 3.412,
    // per-switch typical watts (used models); fallback by rack-U for anything unlisted.
    // z9964f-on, sn5600d added 2026-07-15 (GAPS.md G-004) — corpus/txt/QRG-DC.txt (Dell
    // Networking QRG, June 2026), "Power consumption (W)" row: Z9964F-ON 4987 (Max, no "normal"
    // figure given for this model in that table, unlike its neighbors — flagged, not silently
    // treated as typical); SN5600D 940 (normal).
    // NOT resolved (deliberately left out, not guessed): sn5600 and plain sn6810 — neither
    // appears under those exact model names anywhere in corpus/ (only sn5600d and sn6810-LD/
    // sn6600 variants are present, and it's not certain those are power-equivalent to the plain
    // SN5600/SN6810 SKUs this catalog carries — the SN6600 column is also a DIFFERENT form
    // factor, 3U EIA, from this catalog's sn6810 entry, 2U — a naming/spec question for the
    // citation pass, not resolved here). Also found in the same QRG-DC.txt pass: the EXISTING
    // z9664f-on (700) and z9432f-on (500) entries below do NOT match this same table's "normal"
    // column (500 and 900 respectively) — logged as a CITATION-LOG.md row for the citation-
    // verification pass, not changed here without reconciling which source they were built from.
    switchWatts: { 's5212f-on': 125, 's5224f-on': 135, 's5248f-on': 150, 's5296f-on': 240, 's5232f-on': 165, 'z9264f-on': 430, 's5448f-on': 360, 'z9432f-on': 500, 'z9664f-on': 700, 'z9864f-on': 1500, 'z9964f-on': 4987, 's3248t-on': 110, 's4348t-on': 130, 'e3248p-on': 480, 'e3248pxe-on': 720, 'e3224f-on': 150, 'sn2201': 100, 'sn4700': 760, 'sn5610': 1400, 'sn5600d': 940 },
    // [3] is a conservative FLOOR (mirrors the [1]/[2] entries' spirit — a minimum, not an
    // average) so any future 3U catalog addition doesn't silently repeat this gap; z9964f-on
    // above already has a confirmed named entry and doesn't rely on this fallback.
    switchWattsByU: { 1: 160, 2: 550, 3: 900 },
    switchWeightKg: { 1: 9, 2: 15, 3: 22 },
    // per-HOST-unit typical watts + weight, by platform kind (a GPU server is the outlier)
    hostWatts: { server: 650, storage: 1300, gpu: 8000, nas: 550, hci: 950, object: 900 },
    hostWeightKg: { server: 20, storage: 34, gpu: 55, nas: 22, hci: 26, object: 30 },
    note: 'Per-rack power/heat/weight are ESTIMATES (typical draw). GPU servers dominate — an 8-GPU node is ~7–10 kW, so 3–4 fill a rack on power/cooling long before U runs out. Confirm the real numbers and PDU/UPS sizing with Dell EIPT.'
  },

  buffer: {
    // Buffer depth & latency follow the workload character — surfaced, not sized here.
    note: 'Buffer/latency follow the workload: storage rebuild/replication and AI training create many-to-one INCAST bursts — prefer deep / dynamically-shared-buffer leaves and low latency. General VM/compute tolerates shallow buffers. The higher the incast fan-in (nodes hitting one target during rebuild/replication), the deeper the buffer requirement.',
    incastNote: 'Storage: confirm the incast fan-in (how many nodes hit one target at once during rebuild/replication) — deep-buffer requirement scales with it.',
    source: 'Dell AI Fabrics Overview (H20082); PowerScale / PowerFlex design guides'
  },
  leafSpine: {
    addSpineWhenLeafPairsExceed: 1,  // >1 leaf pair (multi-rack) => add spine layer
    spineCountForRedundancy: 2,      // floor — always ≥2 spines for redundancy
    maxSpines: 8,                    // ceiling — H18364.2: a leaf connects to 2–8 spines
    spineCountNote: 'Spine COUNT follows the oversubscription math (~1 leaf-uplink per spine): 8 spines for 1:1, 4 for 2:1, 2 for 4:1 (H18364.2 p.10). Floor 2 for redundancy; ceiling ~8 (leaf uplink radix) before a 3-tier super-spine.',
    largeLeafThreshold: 8,           // > this many leaves => "large deployment" considerations
    note: 'Single rack = VLT leaf pair. Multiple racks or AI => leaf-spine with 2+ spines.',
    considerations: [
      'Run the fabric as Layer 3 with ECMP + Dynamic Load Balancing (DLB) and enhanced hashing across leaf→spine links',
      'Use BGP EVPN VXLAN for L2 stretch / multitenancy (VRF); a single-tenant GPU compute fabric can run pure L3',
      'Keep leaf/access oversubscription ≤ 2:1 (Dell guidance; general enterprise tolerates 3:1); AI + NVMe-oF storage require 1:1 non-blocking',
      'Every leaf connects to EVERY spine (Clos) — NEVER leaf-to-leaf or spine-to-spine (it breaks ECMP and can create L2 loops); a ToR pair uses only an MC-LAG/VLT ICL',
      'ECMP keeps all spine uplinks active (BGP/OSPF equal-cost paths); use Adaptive Routing / DLB + enhanced hashing to avoid hash polarization',
      'Spine resilience: minimum 2 spines (a single spine is a SPOF); more spines = higher surviving bandwidth on a failure (~4 spines ≈ 75%)',
      'Confirm spine radix covers current leaves + 24–36 month growth; reserve spine ports (or a border-leaf pair) for the core / DCI uplinks',
      'BGP underlay: use private ASNs on a logical, growth-friendly numbering plan; anycast gateway for the overlay',
      'VXLAN underlay MTU ≥ 1600 for the encap overhead — set 9216 end-to-end for best performance',
      'Use structured single-mode fiber for leaf→spine and cross-rack runs (DAC is in-rack only)',
      'Beyond a two-tier fabric (~2,000 GPUs) move to a 3-tier Clos with superspines'
    ],
    source: 'Dell Data Center leaf-spine reference architecture'
  },
  coreUplink: {
    minLinks: 2,
    note: 'Uplinks to the existing core/backbone should be redundant (min 2) and typically ride from the spine (or a border-leaf pair). Dell supplies the fabric-side optics; the core switch and its matching optics are usually by others.',
    source: 'Dell Data Center interconnect / core uplink guidance'
  },
  roce: {
    required: [
      'PFC (Priority Flow Control) — mandatory for a lossless RoCEv2 fabric',
      'ECN (Explicit Congestion Notification)',
      'DCQCN — primary congestion-control feature (uses ECN)',
      'Adaptive Routing & Switching (ARS) + Dynamic Load Balancing (DLB) + enhanced hashing on ECMP',
      'Consistent DSCP/PCP marking + lossless queue config end-to-end'
    ],
    note: 'RoCEv2 (AI / NVMe-RoCE) requires a lossless Ethernet fabric: PFC to be lossless, DCQCN for congestion control, ARS/DLB for load balancing. Misconfiguration = silent performance collapse.',
    source: 'Dell Ent SONiC AI Fabrics Networking Guide (h04600) + Spectrum+SONiC (h04658)'
  },

  // AI/HPC RDMA TRANSPORT choice — RoCEv2 (proven) vs Ultra Ethernet (UEC 1.0, the open
  // multi-vendor standard ratified June 2025). UEC sprays each flow across ALL paths
  // (multipath), fixing RoCEv2's single-path/HOL-blocking limit for GPU collectives.
  // Both are non-blocking-1:1 fabrics; UEC runs on the SAME Broadcom Tomahawk-4/5 silicon
  // (Dell Z9664F/Z9864F) — the change is UEC-capable NICs + config, not new switches.
  aiTransport: {
    default: 'roce',
    options: {
      'roce': { label: 'RoCEv2 (proven / default)', losslessCentric: true,
        note: 'The established RDMA-over-Ethernet transport. Rigid per-flow path pinning (5-tuple hash) — GPU collectives can saturate one path while others idle; leans on PFC to stay lossless.' },
      'uec':  { label: 'Ultra Ethernet (UEC 1.0)', losslessCentric: false,
        config: [
          'UEC-capable NICs end-to-end (UEC-ready SuperNIC / ConnectX-8 / BlueField-3 class) — confirm the server NIC supports Ultra Ethernet Transport',
          'Per-packet ECMP (packet spraying) enabled on the fabric — flows use ALL paths, not one',
          'Packet-spray-friendly QoS + shared-buffer policy that does NOT penalize out-of-order delivery (UEC reorders at the endpoint)',
          'ECN for congestion signalling; UEC sender+receiver congestion control replaces DCQCN — less PFC-dependent than RoCEv2',
          'Runs on the existing Tomahawk-4/5 Z-series (Z9664F/Z9864F) — no new switch silicon; still a non-blocking 1:1 Clos'
        ],
        note: 'Open multi-vendor RDMA transport (Broadcom/AMD/Intel/Meta/Microsoft/Oracle). Multipath packet spraying + out-of-order delivery keeps every path busy for AI collectives; the trade-off is it needs UEC-capable NICs and packet-spray-tuned switch config.' }
    },
    source: 'Ultra Ethernet Consortium UE 1.0 (ratified 2025-06; corpus/UEC-RESEARCH.txt) + Dell Z-series Tomahawk-4/5 platform support'
  },

  aiFabric: {
    topologies: ['Single switch', 'TOR-wired Clos', 'Pure Rail', 'Rail-Optimized (preferred for GPU collectives)'],
    fabricLayer: 'Layer 3 leaf-spine, ECMP + Dynamic Load Balancing (DLB) + enhanced hashing. Front-end uses BGP EVPN VXLAN; a single-tenant GPU compute (back-end) fabric can run pure L3.',
    twoTierGpuScale: 2000,   // two-tier leaf-spine ≈ 2,000 GPUs; beyond => 3-tier Clos with superspines
    lossless: 'lossless RoCEv2 (PFC + ECN + DCQCN + ARS/DLB)',
    recommendedEthSpine: 'Z9664F-ON / Z9864F-ON (Z9864F-ON = 128 GPUs @ 400GbE) or NVIDIA Spectrum SN-series',
    oob: 'S3248T-ON (48x1GbE) OOB leaf; BGP EVPN OOB fabric at scale',
    os: 'Dell Enterprise SONiC on PowerSwitch / NVIDIA Spectrum',
    ethVsIb: 'Ethernet (NVIDIA Spectrum-X + Dell SONiC) is a fully capable AI fabric alternative to InfiniBand; both use RDMA / GPUDirect. This tool assumes Ethernet.',
    note: 'Compute (east-west) fabric must be non-blocking + lossless. Rail-Optimized topology gives the best collective-communication performance.',
    source: 'Dell AI Fabrics: Networking Guide (h04600), Spectrum+SONiC (h04658), Overview (H20082), Ethernet vs InfiniBand (H20084)'
  },
  cabling: {
    dacMaxReachM: 5,     // beyond ~3-5m prefer AOC/optical
    inRackPreferDAC: true,
    // WHERE the switches sit relative to the hosts decides the cable CLASS and reach.
    // This is captured in every guide (not a concern check) so host↔leaf cabling is right.
    // Reach classes refreshed to current (2026) 100G/lane SerDes reality: passive DAC has
    // SHRUNK to ~2m at 800G; AEC (active electrical) is now its own 3–7m class between
    // DAC and AOC. (corpus/NET-BESTPRACTICE-RESEARCH.txt)
    placements: {
      'in-rack':    { label: 'In-rack (ToR — hosts & switch in the same rack)', cableClass: 'Passive DAC (twinax copper)', media: 'copper', reach: '≤2–3m (≤2m at 800G)', note: 'Cheapest, lowest power, lowest latency. Copper only; passive-DAC reach shrinks with speed — ~3m at ≤100G, ~2m at 800G.' },
      'adjacent':   { label: 'Adjacent rack / end-of-row', cableClass: 'AEC (active copper, 3–7m) or AOC (active optical, ≤~30m)', media: 'aoc', reach: 'AEC ≤~7m · AOC ≤~30m', note: 'Beyond passive-DAC reach but within a row: AEC (thin active copper, lower power) to ~7m, AOC (active optical) to ~30m.' },
      'structured': { label: 'Across the row / room / building (structured cabling)', cableClass: 'Pluggable optical transceivers over structured fiber', media: 'fiber', reach: '≤100m MMF (OM4) / ≤2km+ SMF (OS2)', note: 'Switch-side + host-side optics + a structured fiber plant (MPO trunks, cassettes, patch panels, LC patch cords). MMF/OM4 in-building; OS2 single-mode for anything leaving the building.' }
    },
    // Connector / form factor + fiber & polish to EXPECT at each port speed. Parallel optics
    // (SR4/SR8/DR) use MPO; duplex (LR/FR) use LC. MMF=UPC polish, SMF=APC (never mixed).
    connectorsBySpeed: {
      '10GbE': 'SFP+ (LC duplex / DAC)', '25GbE': 'SFP28 (LC duplex / DAC)', '40GbE': 'QSFP+ (MPO-12, MMF)',
      '100GbE': 'QSFP28 (LC duplex for LR/FR, or MPO-12 for SR4)', '200GbE': 'QSFP56 / QSFP56-DD (MPO-12)',
      '400GbE': 'QSFP112-DD / OSFP (MPO-12 for DR4, MPO-16 for SR8)', '800GbE': 'OSFP112 / QSFP-DD800 (2× MPO-12 twin-port, or MPO-16 SR8)', '1.6TbE': 'OSFP224 (MPO-16)'
    },
    // Fiber & polish guidance (structured runs): the classic re-cabling gotcha.
    fiberPolish: {
      note: 'Fiber plant rules: multimode (OM4/OM5) uses UPC polish; single-mode (OS2, for DR/FR/LR/DCI) uses APC — UPC and APC must NEVER be mixed on a link (high loss). Parallel optics (SR4/SR8/DR) use MPO connectors (MPO-12 for 4-lane, MPO-16 for 8-lane); duplex optics (LR/FR) use LC. Pick ONE polarity method (Type A cassette / Type B direct) and document it facility-wide.',
      source: 'TIA-568 / MPO polarity & polish best practice (corpus/NET-BESTPRACTICE-RESEARCH.txt)'
    },
    // Emerging low-power optics — a roadmap consideration, not a today BOM change.
    emergingNote: 'For a 2027–28 refresh watch Linear Pluggable Optics (LPO — host-ASIC signal conditioning, ~40–50% less module power for short reach) and Co-Packaged Optics (CPO) for GPU clusters.',
    // Breakout: one high-speed switch port fanned into N lower-speed links. Multiplies
    // logical port count (a 32×400G switch → 128×100G) and changes optic counts.
    breakoutRatios: { '400→100': 4, '400→200': 2, '200→100': 2, '100→25': 4, '100→10': 4, '800→400': 2, '800→200': 4 },
    breakoutNote: 'Breakout (e.g. one 400G leaf/spine port → 4×100G, or 100G → 4×25G) multiplies the logical port count and changes the optic count significantly — a 32-port switch can present up to 128 logical ports. Confirm the OS supports the intended breakout mode.',
    structuredNote: 'Confirm whether structured cabling / patch panels are already in place or must be included. DAC/AOC are point-to-point (in the BOM); structured optical runs need fiber + patching either already installed or added.',
    note: 'Use passive DAC in-rack (cheapest, lowest power); AOC/AEC for adjacent/end-of-row (≤~30m); pluggable optics over structured fiber for cross-row/room/building. Leaf→spine and cross-rack runs are optical; DAC is in-rack only.',
    source: 'Dell Networking Transceivers & Cables Spec Sheet; Dell leaf-spine reference architecture'
  },
  backend: {
    // PowerScale Ethernet back-end (internal) network — dedicated, Dell-managed switches only.
    // Table 4 (H16346.8, p.14) — currently-supported Dell switches (non-EOL):
    powerScaleSupportedSwitches: ['Z9664F-ON', 'S5232F-ON', 'Z9264-ON'],
    // VERIFIED Dell PNs from the OneFS Supportability & Compatibility Guide (Table 33, harvested):
    powerScaleBackendPNs: { 'S5232F-ON': '210-BCVB (RTS 11-2021)', 'Z9664F-ON': '210-BCJH (RTS 2025 — 100G or 200G FLAT topology only)', 'Z9264-ON': '210-AWOW (RTS 02-2019)', 'Z9100-ON': '210-AWOV (2018, legacy)', 'S4148': '210-AWOT (2018, legacy)', 'S4112': '210-AWOS (2018, legacy)' },
    powerScaleSupportedOther: ['Arista 7308X3', 'NVIDIA Spectrum-4 SN5600 (via Dell ETC program, manual config, Cumulus 5.9.1)'],
    powerScaleEol: ['Z9100-ON (EOL 2023)', 'S4148F-ON (EOL 2023)', 'S4112F-ON'],
    powerScaleCardOptions: '40/100 GbE (QSFP56/QSFP28) or 10/25 GbE (SFP28), model-specific',
    note: 'PowerScale Ethernet back-end must use Dell-provided/managed switches (no other devices attach). Supported Dell models (Table 4): Z9664F-ON, S5232F-ON (=S5232-ON), Z9264-ON — all 100GbE native. Mixed node speeds (100G performance + 25/10G archive) share one 100G switch via breakout cables. Back-end is redundant, dedicated, and physically separate from the front-end. Always confirm against the OneFS Supportability & Compatibility Guide.',
    source: 'Dell PowerScale Ethernet Back-End Network Overview (H16346.8) — Table 4, p.14'
  },
  deployment: {
    // New build vs adding into an existing fabric — drives whether spine/leaf are net-new.
    note: 'When adding endpoints into an EXISTING fabric, the BOM should reflect only the incremental additions (host cables/optics, and leaves only if the existing access ports are exhausted). Confirm the existing switch models, free port counts, speeds, and whether the existing spine has capacity to reuse.',
    source: 'Brownfield / add-to-existing best practice'
  }
};
