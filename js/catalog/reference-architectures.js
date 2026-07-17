/* =============================================================================
 * VALIDATED REFERENCE ARCHITECTURES (prescriptive)
 * -----------------------------------------------------------------------------
 * Unlike the sizing engine (which COMPUTES a BOM from ports), these are
 * PRESCRIPTIVE, jointly-validated designs. When one matches the customer's
 * need, the endorsed BOM *is* the answer — quote it as-is (SKU lookup aside).
 *
 * Each RA renders through recommendRA() into the same result shape the UI uses.
 * Add RAs here as Dell/NVIDIA publish them.
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

window.CATALOG.referenceArchitectures = [
  {
    id: 'nvidia-2-8-5-200',
    name: 'Dell AI Factory with NVIDIA — 2-8-5-200 (Enterprise RA)',
    endorsement: 'NVIDIA Enterprise Reference Architecture — endorsed / jointly validated',
    summary: 'Enterprise AI (training + inference) on NVIDIA-Certified PowerEdge XE7740/XE7745 with Spectrum-X, aligned to the NVIDIA 2-8-5-200 Enterprise RA.',
    maxGpuNodes: 16, gpusPerNode: 8, workload: 'ai',
    gpuOptions: 'up to 8x NVIDIA H200 NVL or RTX PRO 6000 Blackwell Server Edition per node',
    gpuNetSpeeds: '100 / 200 / 400 Gb (varies by cluster size)',
    // Prescriptive BOM (per the endorsed brief). qty scales with node count where noted.
    bom: [
      { category: 'Compute', vendor: 'Dell', item: 'PowerEdge XE7740 / XE7745 GPU node', model: 'XE7740/XE7745',
        qtyExpr: 'nodes', note: '2 CPU + up to 8x H200 NVL / RTX PRO 6000 Blackwell; NVIDIA-Certified',
        dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Compute', vendor: 'Dell', item: 'PowerEdge R670 (management / control plane)', model: 'R670',
        qty: 4, note: 'Dedicated orchestration control plane + system admin',
        dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Switch', vendor: 'NVIDIA (via Dell)', item: 'Spectrum-4 SN5610 (converged compute+storage network)', model: 'SN5610',
        qty: 2, note: 'Non-blocking, rail-optimized spine-leaf; Spectrum-X; RDMA/RoCEv2 + PFC + adaptive routing + congestion control',
        dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Management', vendor: 'NVIDIA (via Dell)', item: 'Spectrum SN2201 (out-of-band)', model: 'SN2201',
        qty: 1, note: 'OOB management fabric',
        dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Storage', vendor: 'Dell', item: 'PowerScale F710 (per ERA recommendation)', model: 'PowerScale F710',
        qtyExpr: 'perEra', note: 'High-throughput scale-out storage for AI; sized per ERA',
        dellPN: 'verify', verify: true, specConfirmed: true }
    ],
    designPoints: [
      'GPU network: Spectrum-X non-blocking, rail-optimized spine-leaf with deterministic GPU paths',
      'Transport: RDMA / RoCEv2 with PFC, adaptive routing, and congestion control (low-latency, lossless)',
      'Enterprise network: EVPN-VXLAN fabric, BGP control plane; EVPN-Multihoming = active/active server connectivity WITHOUT MLAG',
      'Cloud-native ops: NVIDIA GPU / Network / NIM Operators + Dell CSI Operator (declarative K8s / OpenShift)',
      'Validated stack: aligns to NVIDIA AI Enterprise support matrix + Spectrum-X validated solution stack'
    ],
    software: 'NVIDIA AI Enterprise; Base Command Manager or Dell Automation Platform; Upstream Kubernetes or Red Hat OpenShift',
    scaleNote: 'Endorsed up to 16 GPU nodes on 2x SN5610. Larger clusters are supported but REQUIRE additional network switching (spine expansion).',
    source: 'Dell AI Factory with NVIDIA — NVIDIA 2-8-5-200 Enterprise RA Solution Brief (2026)'
  },
  {
    id: 'nvidia-2-8-9-400',
    name: 'Dell AI Factory with NVIDIA — 2-8-9-400 (Enterprise RA)',
    endorsement: 'NVIDIA Enterprise Reference Architecture — endorsed / jointly validated',
    summary: 'Enterprise AI training/fine-tuning on PowerEdge XE9680 (8x H200 SXM) with a converged Spectrum-X 400GbE network, aligned to the NVIDIA 2-8-9-400 Enterprise RA (Upstream Kubernetes or Red Hat OpenShift AI).',
    maxGpuNodes: 12, gpusPerNode: 8, workload: 'ai',
    gpuOptions: 'up to 8x NVIDIA H200 SXM per node (PowerEdge XE9680)',
    gpuNetSpeeds: '400GbE converged compute+storage (Spectrum-X)',
    bom: [
      { category: 'Compute', vendor: 'Dell', item: 'PowerEdge XE9680 GPU node (8x H200 SXM)', model: 'XE9680',
        qtyExpr: 'nodes', note: '2 CPU + 8x NVIDIA H200 SXM; NVIDIA-Certified', dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Compute', vendor: 'Dell', item: 'PowerEdge R670 (management / control plane)', model: 'R670',
        qty: 4, note: 'Kubernetes/OpenShift management servers', dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Switch', vendor: 'NVIDIA (via Dell)', item: 'Spectrum-4 SN5610 (converged compute+storage network)', model: 'SN5610',
        qty: 2, note: 'Non-blocking, rail-optimized spine-leaf; Spectrum-X; RDMA/RoCEv2 + PFC + ECN + adaptive routing', dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Management', vendor: 'NVIDIA (via Dell)', item: 'Spectrum SN2201 (out-of-band)', model: 'SN2201',
        qty: 1, note: 'OOB management fabric', dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Storage', vendor: 'Dell', item: 'PowerScale F710 (per ERA recommendation)', model: 'PowerScale F710',
        qtyExpr: 'perEra', note: 'High-throughput scale-out storage for AI; sized per ERA', dellPN: 'verify', verify: true, specConfirmed: true }
    ],
    designPoints: [
      'GPU network: Spectrum-X non-blocking, rail-optimized spine-leaf — deterministic, low-diameter GPU paths',
      'Transport: RDMA / RoCEv2 with PFC + ECN + adaptive routing (low-latency, lossless)',
      'Converged compute+storage on 2x SN5610; OOB on SN2201',
      'Cloud-native ops: NVIDIA GPU/Network/NIM Operators (Upstream K8s) or OpenShift AI + Dell Automation Platform',
      'Validated stack: NVIDIA AI Enterprise support matrix + Spectrum-X validated solution stack'
    ],
    software: 'NVIDIA AI Enterprise (+ OpenShift AI on the Red Hat variant); Base Command Manager or Dell Automation Platform',
    scaleNote: 'Endorsed up to 12 GPU nodes on 2x SN5610 (converged). Larger clusters are supported but REQUIRE additional network switching.',
    source: 'Dell AI Factory with NVIDIA — NVIDIA 2-8-9-400 ERA Solution Brief (Aug 2025)'
  },
  {
    id: 'nvidia-gb300-nvl72',
    name: 'NVIDIA GB300 NVL72 — rack-scale AI Factory (Spectrum-X)',
    endorsement: 'NVIDIA Enterprise Reference Architecture — GB300 NVL72 dual-plane networking (Mar 2026)',
    summary: 'Rack-scale Blackwell Ultra: each NVL72 rack (SU) = 18 compute trays / 72 GPUs in one NVLink domain. Scale-out per the PUBLISHED RA: dual-plane rail-optimized SN5600 (128-port 400G) compute fabric — each GPU gets 2× 400G paths (ConnectX-8 twin-port split) — plus a separate SN5600 converged (N/S) fabric.',
    maxGpuNodes: 8, gpusPerNode: 72, workload: 'ai',
    gpuOptions: '72x Blackwell Ultra + 36x Grace per NVL72 rack; 18 trays × 4x ConnectX-8 dual-port 800G (runs as 2x400G/port) + BlueField-3 DPU',
    gpuNetSpeeds: 'Dual-plane 400GbE (2× 400G paths per GPU) on SN5600; 144× 400G GPU uplinks + 36× 400G CPU-fabric uplinks per SU',
    // PUBLISHED per-SU scaling (NVL72 RA, Mar 2026): each rack needs 2x SN5600 (converged) and
    // the dual-plane GPU network uses up to 12x SN5600 per 1–2-SU block (4 leaves per plane + spines).
    published: function (n) {
      const blocks = Math.ceil(n / 2);
      return {
        switches: [
          { model: 'SN5600', qty: 12 * blocks, note: `Dual-plane GPU compute network — up to 12× SN5600 per 1–2-SU block (4 leaf/plane × 2 planes + spines) × ${blocks} block(s). Published: "each plane uses 4 leaf switches"; leaves serve 2 racks (underpopulated by design).` },
          { model: 'SN5600', qty: 2 * n, note: `Converged (N/S) fabric — 2× SN5600 per rack (CPU + storage connectivity), ${n} rack(s)` }
        ],
        cables: [
          // R12 / ruling 2026-07-16d: this PUBLISHED path cables per its OWN endorsed document, which
          // overrides the general computed-path splitter ruling (see SPEC "published RAs defer to
          // their cited document"). The RA is explicit: "each ConnectX-8 800Gb port is broken out
          // into 2x 400Gb links so each GPU has a dedicated 400Gb connection to each plane" and
          // "NVIDIA recommends using a dual-ported optic at the ConnectX-8 OSFP port to simplify
          // breakout". So the breakout is at the NIC END, and the part is the twin-port MMA4Z00-NS
          // (1 optic = 2× 400G links), NOT the MCP1660-W0xx QSFP-DD DAC the engine used to quote
          // into these OSFP cages (physically impossible — R12).
          { speed: 400, qty: 144 * n, opticId: 'nv-sr8-800g-osfp', linksPerAssembly: 2, bothEnds: true,
            note: `GPU compute uplinks — ${144 * n}× 400G links (72 GPUs × 2 planes per SU). Each ConnectX-8 800G OSFP port breaks out to 2× 400G (one per plane); per the RA, a DUAL-PORTED optic sits at that port, so 1× MMA4Z00-NS carries 2 links: ${72 * n} at the NIC end + ${72 * n} at the switch end. Host-to-leaf aifabric` },
          { speed: 400, qty: 144 * n, opticId: 'nv-sr8-800g-osfp', linksPerAssembly: 2, bothEnds: true,
            note: `Leaf-to-spine intra-fabric links — non-blocking mirror of the 144 GPU links per SU (ESTIMATE — validate exact count against RA Tables 6/7). Twin-port OSFP both ends: 1× MMA4Z00-NS per 2 links per end; aifabric` },
          { speed: 400, qty: 36 * n, note: `CPU fabric uplinks — 36× 400G per SU (BlueField-3 DPU + Grace)` },
          { speed: 200, qty: 36 * n, note: `Customer network — 36× 100/200G per SU (min 25Gb per GPU)` },
          { speed: 200, qty: 18 * n, note: `Storage connections — 18× 100/200G per SU (min 12.5Gb per GPU)` }
        ],
        fabric: { leafModel: 'SN5600', totalLeaves: 8 * blocks, spineCount: 4 * blocks, railSpeed: '400GbE', totalLinks: 144 * n, linksPerUnit: 144, uplinksPerLeaf: Math.ceil(144 * n / (8 * blocks)), uplinkCableQty: 144 * n, mgmtNodes: 18 * n }
      };
    },
    bom: [
      { category: 'Compute', vendor: 'NVIDIA (via Dell)', item: 'GB300 NVL72 rack (72x Blackwell Ultra + 36x Grace)', model: 'GB300 NVL72',
        qtyExpr: 'nodes', note: 'Each rack = one 72-GPU NVLink domain (Scalable Unit); liquid-cooled', dellPN: 'verify', verify: true, specConfirmed: true },
      { category: 'Storage', vendor: 'Dell', item: 'PowerScale F910 (per ERA recommendation)', model: 'PowerScale F910',
        qtyExpr: 'perEra', note: 'High-throughput scale-out storage; sized per ERA', dellPN: 'verify', verify: true, specConfirmed: true }
    ],
    designPoints: [
      'Rack = 72-GPU NVLink domain; the Ethernet fabric is the SCALE-OUT between racks',
      'DUAL-PLANE compute fabric (published): each GPU has two 400G paths, one per plane; plane 2 mirrors plane 1; 4 leaf switches per plane',
      'ConnectX-8 twin-port 800G OSFP runs as 2× 400G (dual-ported optics recommended)',
      'Separate converged (N/S) SN5600 fabric — 2 per rack; 36× customer + 18× storage connections per SU',
      'Rail-optimized, non-blocking; RDMA/RoCEv2 + PFC + ECN + adaptive routing; port breakout preserves resiliency'
    ],
    software: 'NVIDIA AI Enterprise + Mission Control; Base Command Manager or Dell Automation Platform',
    scaleNote: 'Published scaling: 1 SU = 1 NVL72 rack = 72 GPUs; networking sized per 1–2-SU blocks; fully tested to 8 SU (576 GPUs). Validate counts against RA Tables 6/7.',
    source: 'NVIDIA NVL72 AI Factory — GB300 dual-plane networking RA (Mar 2026, harvested) — per-SU counts published'
  }
];
