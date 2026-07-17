/* =============================================================================
 * ATTACH-TARGET PROFILES  --  Dell storage & server platforms (Ethernet only)
 * -----------------------------------------------------------------------------
 * ALIGNED TO the platform data sheets in this folder (2026):
 *   PowerStore  h18234-dell-powerstore-data-sheet.pdf
 *   PowerScale  h15963-ss-powerscale-all-flash-nodes.pdf
 *   PowerFlex   powerflex-5-0-specification-sheet.pdf
 *   PowerEdge   poweredge-rack-series-spec-sheet.pdf
 * Fibre Channel intentionally excluded.
 *
 * IMPORTANT — per-unit port counts are a CONFIGURATION CHOICE (which NIC / how
 * many). The data sheets confirm the NIC *options* (speeds, dual-port), not a
 * fixed count. So portGroups encode a sensible documented DEFAULT; `portOptions`
 * records the confirmed choices, and every platform keeps a "confirm per config"
 * concern. specConfirmed:true = NIC options confirmed from the data sheet.
 *
 * portGroups[].network: storage | frontend | backend | aifabric | mgmt
 * redundant:true => split links across fabric A/B (2 switches).
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

window.CATALOG.platforms = [
  {
    /* systemBond: the cluster/mgmt system bond is a switch-DEPENDENT LACP aggregate across BOTH
     * ToRs, so the storage ToR pair MUST be MC-LAG/VLT with a peer-link — this is NOT a pure
     * independent-A/B MPIO fabric. Source: H18157.11 "Dell PowerStore: Clustering and High
     * Availability" (Apr 2026) — multi-appliance ICM/ICD traffic rides an LACP bond through the
     * ToRs; cross-switch bonds require VLTi ("must be configured"); HA reference diagram Fig. 43
     * shows the ToR pair interconnected, labelled LACP/vPC. Ruling FINAL 2026-07-16 (this reverses
     * an earlier hand-read of "storage A/B without ICL" — see CITATION-LOG + BACKTEST-2026-07-16c).
     * FSN (Fail-Safe Networking, added in the 2026 revision) is an active/passive alternative to
     * LAG for NAS interfaces only — it does not relax this requirement; revisit if NAS/file
     * deployment variants get modeled. */
    id: 'powerstore', systemBond: true, family: 'Block / Unified Storage', model: 'PowerStore T (1200T–9200T)',
    workload: 'general', unitLabel: 'appliance (2 nodes)', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 8, speed: '25GbE', media: 'SFP28', network: 'storage', redundant: true,
        note: 'DEFAULT 4x 25GbE per node (iSCSI / NVMe-TCP). Confirmed options: 25GbE and 100GbE Ethernet I/O modules.',
        portOptions: '25GbE or 100GbE (end-to-end NVMe; NVMe/TCP)' },
      { role: 'mgmt', count: 2, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false }
    ],
    requires: ['Dual-fabric (A/B) for HA', 'Jumbo frames MTU 9216 end-to-end', 'No storage traffic across oversubscribed uplinks'],
    concerns: ['CONFIRM I/O module (25G vs 100G) & port count per appliance model/config', 'NVMe/TCP benefits from PFC/ECN tuning', 'Keep replication traffic on separate VLAN/ports'],
    models: [
      { id: 'ps1200', label: 'PowerStore 1200T', note: '25/100GbE I/O modules' },
      { id: 'ps3200', label: 'PowerStore 3200T', note: '25/100GbE I/O modules' },
      { id: 'ps5200', label: 'PowerStore 5200T', note: '25/100GbE I/O modules' },
      { id: 'ps9200', label: 'PowerStore 9200T (100G recommended)', dataSpeed: '100GbE', note: '100GbE for the top model' }
    ],
    source: 'Dell PowerStore Data Sheet h18234 (2026) — 100GbE + end-to-end NVMe/TCP confirmed; port count per config', verify: true
  },
  {
    id: 'powerflex', systemBond: true, /* published DG: LACP-bonded node NICs */ family: 'Software-Defined Block', model: 'PowerFlex 5.0 (rack / appliance / custom nodes)',
    workload: 'general', unitLabel: 'storage node', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 4, speed: '25GbE', media: 'SFP28', network: 'storage', redundant: true,
        note: 'SDS/SDC east-west + NVMe/TCP, LACP-bonded. Certified: 4×25G, 2×100G, 4×100G; recommended 2×25G.',
        portOptions: '2×25G (recommended) / 4×25G / 2×100G / 4×100G — LACP bonded' },
      { role: 'mgmt', count: 1, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false }
    ],
    requires: ['Leaf-spine strongly recommended (heavy SDC/SDS east-west)', 'Low-oversubscription / non-blocking fabric', 'LACP bonding on node NICs', 'Consistent MTU 9216 across all servers & switches'],
    concerns: ['Bandwidth-hungry east-west — validate spine capacity (up to 128 storage nodes/system)', 'CONFIRM node NIC config (2×25G / 4×25G / 2×100G / 4×100G)', 'Up to 4–8 data networks for redundancy; dedicated MDM management cluster (3+ nodes)'],
    source: 'Dell PowerFlex 4.5 / PFxM 4.6 Technical Overview (Feb 2026) + PowerFlex 5.0 Spec Sheet', verify: true
  },
  {
    id: 'powermax', family: 'High-End Block Storage', model: 'PowerMax 2500 / 8500',
    workload: 'general', unitLabel: 'array (node pair)', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 8, speed: '25GbE', media: 'SFP28', network: 'storage', redundant: true,
        note: 'Front-end Ethernet (iSCSI / NVMe-TCP / SRDF). Confirmed options per FE I/O module: 2x100Gb/s or 4x25Gb/s or 4x10Gb/s; up to 8 FE I/O modules per node pair. FC/FICON excluded per scope.',
        portOptions: '2x100G or 4x25G or 4x10G per module (up to 8 FE modules / node pair)' },
      { role: 'mgmt', count: 2, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false }
    ],
    requires: ['Dual-fabric (A/B) for HA', 'Jumbo frames MTU 9216', 'Dedicated storage VLANs'],
    concerns: ['CONFIRM FE I/O module mix (100G vs 25G) & count per array config', 'Scales up to 16 nodes; port count grows with node pairs', 'Internal "Dynamic Fabric" is InfiniBand 100Gb/s (director-to-director) — NOT the customer network', 'NVMe/TCP tuning (PFC/ECN)'],
    models: [
      { id: 'pmax2500', label: 'PowerMax 2500', note: 'FE: 2x100G / 4x25G / 4x10G modules' },
      { id: 'pmax8500', label: 'PowerMax 8500 (100G recommended)', dataSpeed: '100GbE', note: 'High-end; 100G FE modules' }
    ],
    source: 'Dell PowerMax 2500/8500 Spec Sheet (2026) — FE I/O module Ethernet options confirmed; count per config', verify: true
  },
  {
    id: 'powerscale', backendIndependent: true, /* h16346: int-a + int-b are SEPARATE networks; OneFS handles failover — no ICL, no bonding */ family: 'Scale-Out NAS (AI data lake)', model: 'PowerScale F210 / F710 / F900',
    workload: 'general', unitLabel: 'node', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 2, speed: '100GbE', media: 'QSFP28', network: 'frontend', redundant: true,
        note: 'Front-end per node = dual-port NIC. Confirmed options: 25G(10/25), 100G(40/100), 200G, 400G Ethernet.',
        portOptions: '2x 25/100/200/400GbE (dual-port NIC)' },
      { role: 'backend', count: 2, speed: '100GbE', media: 'QSFP28', network: 'backend', redundant: true,
        note: 'Infrastructure (back-end) per node = dual-port NIC. Confirmed options: 100G(40/100), 200G, 400G Ethernet (or 200G IB — out of scope).',
        portOptions: '2x 100/200/400GbE Ethernet (dual-port NIC)' },
      { role: 'mgmt', count: 1, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false }
    ],
    requires: ['Back-end network MUST be dedicated (own switches)', 'Front-end and back-end physically separate', 'Jumbo frames on both', 'Minimum 3 nodes per cluster'],
    concerns: ['CONFIRM back-end supported switch list (model-specific)', 'Do not mix front-end and back-end on same fabric', 'First Ethernet storage certified with NVIDIA DGX SuperPOD — align to that ref for AI'],
    models: [
      { id: 'f210', label: 'PowerScale F210 (dual-port 25G FE)', dataSpeed: '25GbE', note: '10/25GbE front-end (SFP28)' },
      { id: 'f710', label: 'PowerScale F710 (dual-port 100G FE)', dataSpeed: '100GbE', note: '40/100GbE front-end (QSFP)' },
      { id: 'f910', label: 'PowerScale F910 (dual-port 100G FE)', dataSpeed: '100GbE', note: '40/100GbE front-end (QSFP)' },
      { id: 'f900', label: 'PowerScale F900 (dual-port 100G FE)', dataSpeed: '100GbE', note: '40/100GbE front-end (QSFP)' }
    ],
    source: 'Dell PowerScale All-Flash Nodes Spec Sheet h15963 (2026) — dual-port front-end + back-end NIC options confirmed', verify: true
  },
  {
    id: 'poweredge-general', family: 'Server (general-purpose)', model: 'PowerEdge R660 / R760 (typical)',
    workload: 'general', unitLabel: 'server', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 2, speed: '25GbE', media: 'SFP28', network: 'frontend', redundant: true,
        note: 'OCP 3.0 NIC (dual-port). Confirmed options: 10GbE, 25GbE, 100GbE, 400GbE; + PCIe NICs; + BlueField-3 DPU.',
        portOptions: '2x 10/25/100/400GbE (OCP 3.0) + optional PCIe/DPU' },
      { role: 'mgmt', count: 1, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false, note: 'iDRAC OOB' }
    ],
    requires: ['Dual-homed to VLT leaf pair for HA', 'Confirm NIC (OCP 3.0 / PCIe) & speed per config'],
    concerns: ['NIC speed/count varies by order — confirm actual config (OCP 3.0 slots)', 'LACP vs active/standby per OS/hypervisor'],
    models: [
      { id: 'r660', label: 'PowerEdge R660 (1U)', note: 'OCP 3.0 10/25/100G' },
      { id: 'r670', label: 'PowerEdge R670 (1U, Gen5)', note: 'OCP 3.0 up to 400G' },
      { id: 'r760', label: 'PowerEdge R760 (2U)', note: 'OCP 3.0 10/25/100G' },
      { id: 'r770', label: 'PowerEdge R770 (2U, Gen5)', note: 'OCP 3.0 up to 400G' }
    ],
    source: 'Dell PowerEdge Rack Series Spec Sheet (2026) — OCP 3.0 10/25/100/400GbE + BlueField-3 confirmed', verify: true
  },
  {
    id: 'poweredge-ai', family: 'AI / GPU Server', model: 'PowerEdge XE9680 (8x GPU)',
    workload: 'ai', unitLabel: 'GPU server', specConfirmed: true,
    portGroups: [
      { role: 'aifabric', count: 8, speed: '400GbE', media: 'QSFP-DD/OSFP', network: 'aifabric', redundant: false,
        note: 'GPU east-west compute fabric — 1 rail per GPU (ConnectX-7 400G / BlueField-3), RoCEv2. BlueField-3: 2x200G or 1x400G confirmed.',
        portOptions: '8x 400GbE (ConnectX-7 / BlueField-3)' },
      { role: 'data', count: 2, speed: '100GbE', media: 'QSFP28', network: 'storage', redundant: true,
        note: 'Storage / data access (to PowerScale/PowerFlex)' },
      { role: 'frontend', count: 2, speed: '25GbE', media: 'SFP28', network: 'frontend', redundant: true,
        note: 'In-band management / front-end (OCP 3.0)' },
      { role: 'mgmt', count: 1, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false, note: 'iDRAC OOB' }
    ],
    requires: ['Rail-optimized east-west fabric (NVIDIA Spectrum-X)', 'RoCEv2 lossless: PFC + ECN', 'Separate compute / storage / frontend / OOB fabrics', 'Non-blocking spine'],
    concerns: ['CONFIRM GPU NIC (ConnectX-7 vs BlueField-3) & rail count per config', 'Spectrum-X (Ethernet) vs InfiniBand decision — this tool assumes Ethernet/Spectrum-X', 'Cable reach/type at 400/800G is design-critical', 'Power & cooling per rack limits GPU nodes/rack'],
    // Specific GPU-server models — the GPU generation sets the rail speed (400G ConnectX-7 vs 800G ConnectX-8).
    models: [
      { id: 'xe9680', label: 'PowerEdge XE9680 (8x H100/H200 SXM)', gpusPerServer: 8, aiSpeed: '400GbE', note: 'Hopper / H200 — 400GbE rails (ConnectX-7)' },
      { id: 'xe9685', label: 'PowerEdge XE9685 (8x AMD Instinct MI300X)', gpusPerServer: 8, aiSpeed: '400GbE', note: 'AMD MI300X — 400GbE rails' },
      { id: 'xe7745', label: 'PowerEdge XE7745 (up to 8x GPU, RTX PRO / H200 NVL)', gpusPerServer: 8, aiSpeed: '400GbE', note: 'PCIe GPU node — 400GbE' },
      { id: 'xe9780', label: 'PowerEdge XE9780 (8x B200 SXM6, Blackwell)', gpusPerServer: 8, aiSpeed: '800GbE', note: 'Blackwell B200 — 800GbE rails (ConnectX-8 SuperNIC)' },
      { id: 'xe9785', label: 'PowerEdge XE9785 (8x B200 SXM6, AMD EPYC)', gpusPerServer: 8, aiSpeed: '800GbE', note: 'Blackwell B200 (AMD) — 800GbE rails (ConnectX-8)' }
    ],
    source: 'Dell PowerEdge XE AI Spec Sheet + XE9780/XE9785 Technical Guides + Dell Gen-AI Validated Design / NVIDIA Spectrum-X (harvested)', verify: true
  },
  {
    id: 'objectscale', systemBond: true, /* published: LACP on both networks */ family: 'Object Storage (S3 / cloud-scale)', model: 'Dell ObjectScale (EX500 / EX5000 / XF960)',
    workload: 'general', unitLabel: 'node', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 2, speed: '25GbE', media: 'SFP28', network: 'frontend', redundant: true,
        note: 'Public (front-end) network — two NICs bonded LACP to the front-end ToR pair. 25GbE (EX500/EX5000); 100GbE for XF960.',
        portOptions: '2× 25GbE (100GbE on XF960), LACP-bonded' },
      { role: 'backend', count: 2, speed: '25GbE', media: 'SFP28', network: 'backend', redundant: true,
        note: 'Private back-end network — two connections per node bonded LACP to a dedicated back-end switch pair.',
        portOptions: '2× 25GbE, LACP-bonded (dedicated private back-end)' },
      { role: 'mgmt', count: 1, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false }
    ],
    requires: ['Front-end (public) + dedicated private back-end switch pair', 'LACP-bond node NICs on both networks', 'Rack = 5+ nodes', 'Jumbo frames MTU 9216 end-to-end'],
    concerns: ['CONFIRM node NIC speed (25GbE EX500/EX5000 vs 100GbE XF960)', 'EX500/EX5000 use Dell S5248F for BOTH front-end and back-end pairs (customer front-end switches optional)', 'Back-end is private/dedicated — attach no other devices'],
    models: [
      { id: 'ex500', label: 'ObjectScale EX500 (25G, S5248F FE/BE)', dataSpeed: '25GbE', note: '25GbE public + private' },
      { id: 'ex5000', label: 'ObjectScale EX5000 (25G, S5248F FE/BE)', dataSpeed: '25GbE', note: '25GbE public + private' },
      { id: 'xf960', label: 'ObjectScale XF960 (100G)', dataSpeed: '100GbE', note: '100GbE public front-end' }
    ],
    source: 'Dell ObjectScale Best Practices (H16016, 2026) — dual-network LACP; S5248F FE/BE; 25/100GbE confirmed', verify: true
  },
  {
    id: 'apex-hci', family: 'Hyperconverged (Azure Local)', model: 'Dell APEX Cloud Platform / AX nodes (Azure Stack HCI)',
    workload: 'general', unitLabel: 'node', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 2, speed: '25GbE', media: 'SFP28', network: 'storage', redundant: true,
        note: 'RDMA storage network (RoCEv2 or iWARP) with Switch-Embedded Teaming (SET). 25GbE typical; 100GbE for high-performance. Converged (shared) or non-converged (dedicated storage adapters).',
        portOptions: '2× 25/100GbE RDMA (RoCE/iWARP), SET teaming' },
      { role: 'mgmt', count: 1, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false, note: 'iDRAC OOB' }
    ],
    requires: ['ToR pair on the Microsoft-approved Azure Local switch list (or use switchless storage networking)', 'RDMA lossless: PFC + ECN for RoCEv2', 'Jumbo frames MTU 9216', 'Switch-Embedded Teaming (SET) across the storage adapters'],
    concerns: ['CONFIRM RDMA type (RoCEv2 vs iWARP) — RoCE requires a lossless fabric (PFC/ECN)', 'Small (2–3 node) clusters can use switchless storage networking (no storage ToR)', 'ToR must be on Microsoft’s Azure Local supported switch list', 'Converged vs non-converged NIC layout changes the port count'],
    source: 'Dell APEX Cloud Platform for Microsoft Azure / Azure Local Scalable Deployment Guide (Jun 2026)', verify: true
  },
  {
    id: 'vxrail', systemBond: true, /* Dell VxRail on SONiC: LACP-bonded node uplinks (switch-dependent) → MC-LAG ToR pair */
    family: 'Hyperconverged (VMware VCF)', model: 'Dell VxRail (VD / VE / VP / VS series)',
    workload: 'general', unitLabel: 'node', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 2, speed: '25GbE', media: 'SFP28', network: 'frontend', redundant: true,
        note: 'vSphere/VCF traffic (mgmt, vMotion, vSAN, VM) on LACP-bonded NICs (NIC redundancy across the node). 25GbE typical; 100GbE for dense vSAN. VxRail on Dell Enterprise SONiC runs a BGP EVPN-VXLAN leaf-spine (single or multi-rack).',
        portOptions: '2× or 4× 25/100GbE (LACP)' },
      { role: 'mgmt', count: 1, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false, note: 'iDRAC OOB' }
    ],
    models: [
      { id: 'vxrail-ve', label: 'VxRail VE-series (25GbE, general VCF)', dataSpeed: '25GbE', note: 'Compute/general — 25GbE nodes' },
      { id: 'vxrail-vp', label: 'VxRail VP-series (performance, 100GbE)', dataSpeed: '100GbE', note: 'Performance — 100GbE vSAN nodes' },
      { id: 'vxrail-vs', label: 'VxRail VS-series (storage-dense)', dataSpeed: '25GbE', note: 'Storage-dense — 25GbE typical' },
      { id: 'vxrail-vd', label: 'VxRail VD-series (ruggedized/edge)', dataSpeed: '25GbE', note: 'Rugged/edge — 25GbE' }
    ],
    requires: ['MC-LAG ToR pair (LACP node bonding is switch-dependent)', 'BGP EVPN-VXLAN leaf-spine per the Dell VxRail-on-SONiC deployment guide', 'Jumbo frames MTU 9216 for vSAN', 'A dedicated or shared vSAN network on the fabric'],
    concerns: ['CONFIRM node NIC layout (2× vs 4×; 25G vs 100G) — VP-series vSAN dense favors 100GbE', 'vSAN traffic is east-west heavy — keep the fabric ≤2:1 (1:1 for dense clusters)', 'VCF/NSX overlay rides EVPN-VXLAN — confirm the underlay MTU and ASN plan', 'Multi-rack VxRail uses the FDC pattern (ToR pair + OOB per rack, dedicated spine rack)'],
    source: 'Dell Enterprise SONiC Deployment for VxRail (with LACP) Deployment Guide — infohub.delltechnologies.com (2026)', verify: true
  },
  {
    id: 'mx7000', family: 'Modular Server Chassis (Scalable Fabric)', model: 'PowerEdge MX7000',
    workload: 'general', unitLabel: 'chassis', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 8, speed: '100GbE', media: 'QSFP28', network: 'frontend', redundant: true,
        note: 'External data-center uplinks from the MX9116n Fabric Switching Engine (FSE) pair — one FSE per fabric slot (A1/A2) for HA. 4× 100GbE uplinks per FSE × 2 FSEs = 8/chassis. Includes the 2 UNIFIED ports per FSE (ports 43-44) in Ethernet mode — reduce this count if those are used for Fibre Channel instead. Sled-to-FSE fabric (16× internal 25GbE lanes/FSE, pre-wired mid-plane) is CHASSIS-INTERNAL — not part of this external-attach BOM.',
        portOptions: '4× 100GbE QSFP28 Ethernet uplinks per FSE = 2 dedicated (ports 41-42) + 2 unified (ports 43-44, Ethernet OR native FC); × 2 FSEs = 8/chassis. + 12× QSFP28-DD per FSE (ports 17-40 — additional uplinks/VLTi, breakout to 10/25/40/100G, or Scalable Fabric expansion to more chassis via MX7116n)' },
      { role: 'mgmt', count: 2, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false, note: 'OME-Modular chassis management controller (redundant pair)' }
    ],
    requires: ['MX9116n Fabric Switching Engines deployed as a redundant pair (one per fabric slot) for chassis HA', 'Dual-homed FSE uplinks to the leaf/spine', 'Sled-to-FSE/FEM fabric is chassis-internal (pre-wired) — confirm sled mezzanine/NIC speed separately, it is not in this external BOM'],
    concerns: ['CONFIRM whether this chassis carries its OWN FSE pair (external uplinks needed, modeled here) or is an EXPANSION chassis joining an existing Scalable Fabric domain via MX7116n Fabric Expander Modules only (NO external uplinks — up to 10 chassis / 80 sleds can share one FSE pair)', 'CONFIRM the 2 unified ports per FSE (43-44) are running Ethernet, not Fibre Channel — an FC-attached MX chassis drops this uplink count from 8 to 4', 'CONFIRM sled NIC/mezzanine speed (25GbE typical per lane; higher via OCP/PCIe mezzanine) — chassis-internal, confirm separately', 'MX5108n (a simpler 1U-in-chassis Ethernet switch, non-fabric) is an alternative I/O module for smaller/non-scalable-fabric deployments — confirm which I/O module the config actually uses'],
    /* G-006 CLOSED 2026-07-17. Uplink count corroborated VERBATIM by TWO independent Dell docs
     * (no standalone MX9116n spec sheet is known to exist — do not reopen the hunt):
     *   H18548.9.2 "PowerEdge MX Networking Deployment Guide", June 2026 (corpus/txt/CO-MX-NET.txt):
     *     "Two 100 GbE QSFP28 ports, used for Ethernet uplinks, ports 41 and 42 ● Two 100 GbE QSFP28
     *      unified ports, used for Ethernet and Fibre Channel connections, ports 43 and 44."
     *   H19120 "PowerEdge MX Deployment with VMware Cloud Foundation", March 2022 (corpus/txt/CO-MX-VCF.txt):
     *     "Two 100 GbE QSFP28 ports ● Two 100 GbE QSFP28 unified ports ● Twelve 2x100 GbE QSFP28-DD ports"
     * => 4 Ethernet uplinks/FSE × 2 FSEs (A1/A2 HA pair) = 8/chassis. Prior count:4 was a 2× undercount
     * that contradicted this entry's own portOptions text. */
    source: 'H18548.9.2 PowerEdge MX Networking Deployment Guide (June 2026, corpus CO-MX-NET) + H19120 MX-with-VCF Deployment Guide (March 2022, corpus CO-MX-VCF) — both state the MX9116n FSE port layout verbatim: 16×25G internal + 2×100G QSFP28 Ethernet uplink (41-42) + 2×100G QSFP28 unified Ethernet/FC (43-44) + 12×QSFP28-DD (17-40). MX7116n FEM (16×25G internal + 2×QSFP28-DD to FSE), up to 10 chassis / 80 compute sleds per Scalable Fabric domain', verify: false
  },
  {
    id: 'powervault-me5', family: 'Entry Block Storage (SAN/DAS)', model: 'PowerVault ME5012 / ME5024 / ME5084',
    workload: 'general', unitLabel: 'array', specConfirmed: true,
    portGroups: [
      { role: 'data', count: 4, speed: '25GbE', media: 'SFP28', network: 'storage', redundant: true,
        note: 'iSCSI host ports — dual-active controller pair, DEFAULT 2× 25GbE SFP28 per controller. Confirmed max: up to 8× 25GbE per array (4/controller); 10GbE BaseT also available; 32Gb FC and 12Gb SAS host options exist but are out of Ethernet-only scope.',
        portOptions: '2–4× 25GbE SFP28 per controller (up to 8 total/array); or up to 8× 10GbE BaseT/array; FC/SAS excluded' },
      { role: 'mgmt', count: 2, speed: '1GbE', media: 'RJ45', network: 'mgmt', redundant: false }
    ],
    requires: ['Dual-active controller pair — dual-fabric (A/B) for HA (host MPIO, not LACP-bonded)', 'iSCSI: jumbo frames MTU 9216 + dedicated storage VLAN', 'Entry/mid-range SAN — no NVMe end-to-end (SAS/NL-SAS/SSD backend, 12Gb SAS)'],
    concerns: ['CONFIRM host port count/speed per config (2 vs 4 per controller; 25G vs 10G BaseT)', 'FC and direct SAS are also available on ME5 — confirm the customer is actually using iSCSI before sizing Ethernet', 'Entry-level array (~8PB max raw, dual-controller only) — for NVMe/TCP or higher IOPS density, PowerStore is the better fit'],
    models: [
      { id: 'me5012', label: 'PowerVault ME5012 (12-bay, 2U)', note: '25GbE iSCSI, dual-active controllers' },
      { id: 'me5024', label: 'PowerVault ME5024 (24-bay, 2U)', note: '25GbE iSCSI, dual-active controllers' },
      { id: 'me5084', label: 'PowerVault ME5084 (84-bay, 5U, dense)', note: '25GbE iSCSI, dual-active controllers only (no single-controller option)' }
    ],
    source: 'Dell PowerVault ME5000 Series Specification Sheet (harvested 2026-07-12) — dual-active controllers, max 8× 25GbE SFP28 iSCSI ports/array (4/controller), max 8× 10GbE BaseT, 2× 1GbE mgmt ports/array, 12Gb SAS backend', verify: true
  }
];
