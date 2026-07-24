/* =============================================================================
 * GUIDED JOURNEY  --  the wizard (guided intake + customer discovery)
 * -----------------------------------------------------------------------------
 * Speaks business-first. Unknowns get a sensible Dell-standard default, clearly
 * flagged as an assumption. Guided => BOM + topology. Discovery => value-add
 * guidance + a starting BOM + topology.
 * ========================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const C = () => window.CATALOG;
  let state = {}, flow = [], pos = 0, mode = null, assumptions = [];

  const assume = t => { if (!assumptions.includes(t)) assumptions.push(t); };

  /* ---------------- step flows ---------------- */
  // Shared NIC questions — added to every flow to confirm the real host config.
  // In an AI flow these describe the FRONT-END / STORAGE NIC (e.g. Broadcom OCP) —
  // the GPU rails are captured separately — and only appear when the user opts in.
  const aiNicGate = s => s.category !== 'ai' || s.aiDataSpec === 'custom';
  const NIC_STEPS = [
    { id: 'nicVendor', type: 'choice', q: 'What NIC is in the hosts?', showIf: aiNicGate,
      help: 'Confirming the actual NIC helps get the port count right',
      listenFor: ['Broadcom 57508 / 57414', 'Intel E810 / X710', 'NVIDIA ConnectX-6 Lx (25G) / Dx (100G) / CX-6 (200G)', 'ConnectX-7 (400G) / ConnectX-8 (800G)', 'BlueField-2 / BlueField-3 DPU', 'Marvell / QLogic'],
      options: [
      { v: 'broadcom', label: 'Broadcom', desc: 'e.g. 57508, 57414' },
      { v: 'intel', label: 'Intel', desc: 'e.g. E810, X710' },
      { v: 'nvidia', label: 'NVIDIA / Mellanox', desc: 'ConnectX-6 Lx 25G / Dx 100G / CX-6 200G / CX-7 400G / CX-8 800G / BlueField-2·3' },
      { v: 'other', label: 'Other / not sure', desc: 'Marvell / QLogic, etc.' }
    ], default: 'broadcom' },
    { id: 'nicSpeed', type: 'choice', q: 'NIC port speed?', showIf: aiNicGate, help: 'Leave on platform default if unsure',
      listenFor: ['1G copper', '1G fiber', '10G copper', '10G', '25G', '100G', '200G', '400G (ConnectX-7)', '800G (ConnectX-8)'],
      options: [
      { v: '', label: 'Use platform default', desc: 'Keep the platform’s standard speed' },
      { v: '1GBase-T', label: '1GbE — RJ45 copper', desc: 'Native RJ45 leaf (S4348T-ON), Cat6A patch cable' }, { v: '1GbE', label: '1GbE — SFP fiber', desc: '' },
      { v: '10GBase-T', label: '10GbE — RJ45 copper', desc: 'Native RJ45 leaf (S4348T-ON), Cat6A patch cable' }, { v: '10GbE', label: '10GbE — SFP+ fiber/DAC', desc: '' },
      { v: '25GbE', label: '25GbE', desc: '' },
      { v: '40GbE', label: '40GbE (legacy)', desc: 'QSFP+ — lands on a QSFP28 leaf' }, { v: '100GbE', label: '100GbE', desc: '' }, { v: '200GbE', label: '200GbE', desc: '' },
      { v: '400GbE', label: '400GbE', desc: 'ConnectX-7' }, { v: '800GbE', label: '800GbE', desc: 'ConnectX-8 SuperNIC' }
    ], default: '' },
    { id: 'nicPorts', type: 'choice', q: 'Ports per NIC?', showIf: aiNicGate, listenFor: ['single-port', 'dual-port', 'quad-port'],
      options: [
      { v: '2', label: 'Dual-port (2)', desc: 'Most common' },
      { v: '1', label: 'Single-port (1)', desc: '' },
      { v: '4', label: 'Quad-port (4)', desc: '' }
    ], default: '2' },
    { id: 'nicCount', type: 'number', q: 'How many data NICs per server / node?', showIf: aiNicGate,
      help: 'Total data NICs per unit — drives the port count',
      listenFor: ['1', '2 (redundancy)', 'more for storage / AI'], default: 2, unknownAssume: 'NICs/unit assumed = 2' },
    // SECOND NIC TYPE in the same hosts (e.g. LAN on Broadcom + a dedicated storage NIC)
    { id: 'nic2Spec', type: 'choice', q: 'Is there a SECOND, different NIC type in the same hosts?',
      help: 'Mixed NICs are common — e.g. Broadcom OCP for LAN plus a second NIC for storage, a legacy network, or management. The second NIC gets its own fabric sizing.',
      listenFor: ['"also has a …"', 'dedicated storage NIC', 'backup / replication NIC', 'legacy 1G network'],
      options: [
      { v: 'none', label: 'No — one NIC type', desc: '' },
      { v: 'custom', label: 'Yes — spec the second NIC', desc: 'Speed, ports, count, and what it connects to' }
    ], default: 'none' },
    { id: 'nic2Network', type: 'choice', q: 'What does the second NIC connect to?', showIf: s => s.nic2Spec === 'custom',
      help: 'A real difference, not just a label — it decides what the second NIC is sized/grouped as, and whether it can share leaf switches with the primary NIC under a converged network architecture.',
      listenFor: ['iSCSI / storage array', 'a second LAN', 'legacy 1G network', 'management network', 'not storage'],
      options: [
      { v: 'storage', label: 'Storage (iSCSI / NVMe-TCP / dedicated storage NIC)', desc: 'Sized and labeled as storage-class traffic' },
      { v: 'frontend', label: 'A second front-end / data network', desc: 'e.g. legacy 1G LAN, a separate application network — NOT storage' }
    ], default: 'storage' },
    { id: 'nic2Speed', type: 'choice', q: 'Second NIC — port speed?', showIf: s => s.nic2Spec === 'custom',
      listenFor: ['1G copper', '10G copper', '10G', '25G', '100G', '200G'],
      options: [
      { v: '1GBase-T', label: '1GbE — RJ45 copper', desc: '' }, { v: '1GbE', label: '1GbE — SFP fiber', desc: '' },
      { v: '10GBase-T', label: '10GbE — RJ45 copper', desc: '' }, { v: '10GbE', label: '10GbE — SFP+ fiber/DAC', desc: '' },
      { v: '25GbE', label: '25GbE', desc: '' },
      { v: '100GbE', label: '100GbE', desc: '' }, { v: '200GbE', label: '200GbE', desc: '' }, { v: '400GbE', label: '400GbE', desc: '' }
    ], default: '25GbE' },
    { id: 'nic2Ports', type: 'choice', q: 'Second NIC — ports per NIC?', showIf: s => s.nic2Spec === 'custom',
      options: [
      { v: '2', label: 'Dual-port (2)', desc: 'Most common' },
      { v: '1', label: 'Single-port (1)', desc: '' },
      { v: '4', label: 'Quad-port (4)', desc: '' }
    ], default: '2' },
    { id: 'nic2Count', type: 'number', q: 'Second NIC — how many per server / node?', showIf: s => s.nic2Spec === 'custom',
      default: 1, unknownAssume: 'Second-NIC count assumed = 1' }
  ];

  // Optics & cabling — captured in EVERY guide (not a concern check). Placement sets
  // the cable class/reach; breakout changes the port math.
  const CABLING_STEPS = [
    { id: 'placement', type: 'choice', q: 'Where do the switches sit relative to the hosts?',
      help: 'Sets the cable class & reach: DAC in-rack, AOC across a row, optics for structured runs.',
      listenFor: ['top-of-rack (same rack)', 'end-of-row', 'switch-to-rack distance', 'structured fiber / patch panels', 'MMF (OM4) vs SMF', 'short vs long range'],
      confirm: ['Confirm the switch-to-rack distance per link class — it decides DAC vs AOC vs optics (and the cable lengths).'],
      options: [
      { v: 'in-rack', label: 'In-rack (ToR — same rack)', desc: 'Passive DAC copper, ≤3–5m — cheapest, lowest power' },
      { v: 'adjacent', label: 'Adjacent rack / end-of-row', desc: 'AOC / AEC, ≤~30m' },
      { v: 'structured', label: 'Across row / room / building', desc: 'Optical transceivers over structured fiber' }
    ], default: 'in-rack' },
    { id: 'racks', type: 'number', q: 'How many racks will this deployment span?',
      showIf: s => s.category !== 'edge',
      help: 'Multi-rack changes the BOM (FDC pattern): each node rack gets its own ToR MC-LAG pair + its own OOB switch, spines sit in a dedicated rack, and anything centralized reaches far racks over AOC/fiber instead of DAC. Typical density ≈16× 1U hosts per rack.',
      listenFor: ['“one rack” / “a pod”', '# of racks', '“a row”', 'contiguous vs split racks'],
      default: 1, unknownAssume: 'Rack count assumed = 1 (single rack)' },
    { id: 'structured', type: 'choice', q: 'Structured cabling — already in place, or include it?', showIf: s => s.placement === 'structured',
      help: 'Optical runs need fiber + patch panels — either already installed or added to scope.',
      listenFor: ['existing fiber plant', 'patch panels', 'MMF (OM4) vs SMF', 'new build — none yet'],
      options: [
      { v: 'inplace', label: 'Already in place', desc: 'Reuse existing fiber & patching' },
      { v: 'include', label: 'Include structured cabling', desc: 'Add fiber + patch panels to scope' }
    ], default: 'include' },
    { id: 'breakout', type: 'choice', q: 'Use breakout cabling (one high-speed port → several links)?',
      help: 'e.g. one 400G → 4×100G, or 100G → 4×25G. Multiplies logical ports & changes optic counts.',
      listenFor: ['400G→4×100G', '100G→4×25G', '“fan-out”', 'higher port density per switch'],
      confirm: ['Breakout changes port math significantly — a 32-port switch can present up to 128 logical ports. Confirm the OS supports the mode.'],
      options: [
      { v: 'auto', label: 'Auto (recommended)', desc: 'Use breakout where it saves ports/optics' },
      { v: 'none', label: 'No breakout', desc: 'One switch port per link' },
      { v: 'on', label: 'Yes — plan for breakout', desc: 'Fan high-speed ports into multiple links' }
    ], default: 'auto' }
  ];

  // Block-storage protocol — decides lossless (PFC/ECN) + non-blocking for the storage fabric.
  const STORAGE_PROTO_STEP = {
    id: 'storageProto', type: 'choice', q: 'Which block-storage protocol will ride this fabric?',
    showIf: s => ['block', 'nas', 'object', 'hci'].includes(s.category) || (s.second && s.second !== 'none') || (s.extraTargets && s.extraTargets.length > 0) ||
      (s.workloads && s.workloads.some(w => ['block', 'nas', 'object', 'hci'].includes(w))) || (s.dellPlat && s.dellPlat.some(d => ['powerstore', 'powerflex', 'powermax', 'powerscale', 'objectscale', 'apex-hci'].includes(d))),
    help: 'iSCSI / NVMe-TCP ride a standard fabric with jumbo frames; NVMe over RoCE needs a lossless (PFC/ECN), non-blocking fabric — it changes the switch config and uplink math.',
    listenFor: ['iSCSI', 'NVMe/TCP (modern default)', 'NVMe over RoCE / RDMA', '“lossless”', 'SFSS / discovery automation'],
    options: [
      { v: 'nvme-tcp', label: 'NVMe/TCP (recommended modern)', desc: 'Standard fabric + jumbo 9216; SFSS automates discovery' },
      { v: 'iscsi', label: 'iSCSI', desc: 'Standard fabric + jumbo 9216 + storage VLANs' },
      { v: 'nvme-roce', label: 'NVMe over RoCE (RDMA)', desc: 'LOSSLESS fabric required — PFC/ECN + non-blocking 1:1' },
      { v: '', label: 'Not sure yet', desc: 'Guidance stays generic' }
    ], default: 'nvme-tcp'
  };

  // ToR-pair fabric style — bonding architecture decides whether the ICL exists (BOM impact).
  const FABRIC_STYLE_STEP = {
    id: 'fabStyle', type: 'choice', q: 'ToR-pair fabric style — MC-LAG pair, or independent A/B fabrics?',
    showIf: s => STORAGE_PROTO_STEP.showIf(s) && s.storageProto !== '' && s.category !== 'ai',
    help: 'Bonding decides this: any switch-dependent (LACP) bond needs an MC-LAG pair + ICL. Pure block + MPIO can run two air-gapped fabrics with NO inter-switch link — fewer cables/ports.',
    listenFor: ['"system bond is LACP" -> MC-LAG', 'file/unified services -> MC-LAG', 'pure iSCSI/NVMe-TCP + MPIO -> independent A/B', '"switch independent" teaming'],
    options: [
      { v: 'mclag', label: 'MC-LAG pair + ICL (default)', desc: 'Supports LACP bonds (system bond / file); ICL in the BOM' },
      { v: 'independent', label: 'Independent A/B fabrics — no ICL', desc: 'Block-only + MPIO; air-gapped; saves ICL cables/ports' }
    ], default: 'mclag'
  };

  // Sizing intent — oversubscription (traffic pattern) + speed-migration roadmap.
  const SIZING_STEPS = [
    { id: 'traffic', type: 'choice', q: 'Traffic pattern — east-west vs north-south?',
      help: 'Sets the oversubscription target, which decides how many uplinks each leaf needs.',
      listenFor: ['server-to-server / distributed storage (east-west)', 'in/out of the DC (north-south)', 'AI training', 'non-blocking / lossless', 'rebuild / replication incast'],
      options: [
      { v: 'balanced', label: 'Balanced (recommended)', desc: '~2:1 — general virtualization / mixed' },
      { v: 'ns', label: 'Mostly north-south', desc: '~3:1 — client-server / web tiers (economical)' },
      { v: 'ew', label: 'Heavy east-west', desc: 'Non-blocking 1:1 — AI / distributed storage / HPC' }
    ], default: 'balanced' },
    { id: 'leaf100', type: 'choice', q: 'If this design needs 100G leaf switches — any preference?',
      help: 'Only applies when a 100G-class leaf is required. Auto right-sizes (S5232F small → S5448F dense/1:1); override if the customer prefers standard QSFP28 optics or an existing standard.',
      listenFor: ['“we standardized on …”', 'QSFP28 vs SFP56-DD optics', 'S5448F PAM4 caveat', 'Z9264F density'],
      options: [
      { v: 'auto', label: 'Auto (recommended)', desc: 'Right-size: S5232F small/flat → S5448F when dense or non-blocking is required' },
      { v: 's5448f', label: 'S5448F-ON', desc: '48×100G SFP56-DD + 8×400G uplinks — note: PAM4 ports, QSFP28 optics do NOT fit' },
      { v: 'z9264f', label: 'Z9264F-ON', desc: '64×100G standard QSFP28 (2U) — dense leaf, plain QSFP28 optics/DACs' },
      { v: 's5232f', label: 'S5232F-ON', desc: '32×100G QSFP28 (1U) — smallest; more leaves + 100G uplinks at scale' }
    ], default: 'auto' },
    { id: 'leaf25', type: 'choice', q: 'If this design needs 25G leaf switches — any preference?',
      help: 'Only applies when a 25G-class leaf is required. Auto right-sizes off the FDC ladder (S5212F small → S5224F → S5296F dense racks); override if the customer prefers a specific model.',
      listenFor: ['“we standardized on …”', 'S5296F density', 'S5248F for storage/back-end'],
      options: [
      { v: 'auto', label: 'Auto (recommended)', desc: 'Right-size: S5212F ≤12 links → S5224F ≤24 → S5296F when dense (frontend) → S5248F otherwise' },
      { v: 's5212f', label: 'S5212F-ON', desc: '12×25G — smallest, small racks only' },
      { v: 's5224f', label: 'S5224F-ON', desc: '24×25G — small/mid racks' },
      { v: 's5248f', label: 'S5248F-ON', desc: '48×25G + 6×100G uplinks — standard leaf, storage/back-end default' },
      { v: 's5296f', label: 'S5296F-ON', desc: '96×25G + 8×100G uplinks — dense server racks, fewer switches' }
    ], default: 'auto' },
    { id: 'roadmap', type: 'choice', q: 'Any speed migration on the 24–36 month roadmap?',
      help: 'Multi-rate optics/switches let you upgrade optics, not the chassis.',
      listenFor: ['25→100', '100→400', '“future-proof”', 'refresh cycle'],
      options: [
      { v: 'none', label: 'No planned change', desc: 'Size for today + growth headroom' },
      { v: '25-100', label: '25G → 100G', desc: 'Choose 100G-capable leaves now' },
      { v: '100-400', label: '100G → 400G', desc: 'Choose 400G-capable spines/leaves now' },
      { v: 'unsure', label: 'Not sure', desc: 'Lean multi-rate to keep options open' }
    ], default: 'none' }
  ];

  // Contextual: new build vs adding into an existing fabric (brownfield → incremental BOM).
  const EXISTING_STEPS = [
    { id: 'deployType', type: 'choice', q: 'New build, or adding into an existing fabric?',
      help: 'Adding? The BOM will reflect only the incremental additions.',
      listenFor: ['greenfield / new build', 'expansion / add nodes', '“adding servers to our existing storage”', 'brownfield'],
      options: [
      { v: 'new', label: 'New build (greenfield)', desc: 'Full fabric in the BOM' },
      { v: 'add', label: 'Adding to an existing fabric', desc: 'Only the incremental adds' }
    ], default: 'new' },
    { id: 'existingReuse', type: 'choice', q: 'Reuse the existing spine / switches?', showIf: s => s.deployType === 'add',
      help: 'If the existing spine has capacity, we won’t re-add it — just new leaves + cabling.',
      listenFor: ['spare ports on existing leaves', 'spine has capacity', 'new dedicated fabric', 'existing switch models & free ports'],
      confirm: ['Confirm existing switch models, free port counts & speeds so the incremental BOM is accurate.'],
      options: [
      { v: 'reuse', label: 'Reuse existing spine (recommended)', desc: 'Add only new leaves + host cabling' },
      { v: 'newfabric', label: 'Stand up a new fabric', desc: 'New spine + leaves for the addition' }
    ], default: 'reuse' }
  ];

  // Model drill-down steps for the ADDED target — one per platform, generated from the
  // catalog (models decide port speeds → switches & optics). Catalog loads before wizard.js.
  const SECOND_MODEL_STEPS = ((window.CATALOG && window.CATALOG.platforms) || [])
    .filter(p => p.models && p.models.length)
    .map(p => ({
      id: 'secondModel_' + p.id, type: 'choice', q: `Which ${p.family} model is being added?`,
      showIf: s => s.second === p.id,
      help: 'The exact model decides its port speeds — that changes the switches and optics it gets',
      listenFor: p.models.map(m => m.label.split(' (')[0]),
      options: p.models.map(m => ({ v: m.id, label: m.label, desc: m.note || '' })),
      default: p.models[0].id
    }));

  const GUIDED = [
    { id: 'category', type: 'choice', q: 'What are you connecting to the network?',
      listenFor: ['PowerStore', 'PowerFlex', 'PowerMax', 'PowerScale', 'PowerEdge R660/R760', 'XE9680 / XE7745 (GPU)', 'ObjectScale'],
      options: [
      { v: 'block', label: 'Dell block storage', desc: 'PowerStore, PowerFlex, PowerMax' },
      { v: 'nas', label: 'Scale-out NAS / AI data', desc: 'PowerScale (F210 / F710 / F900)' },
      { v: 'object', label: 'Object storage (S3)', desc: 'Dell ObjectScale (EX500 / XF960)' },
      { v: 'hci', label: 'Hyperconverged (VxRail / Azure Local)', desc: 'VxRail (VMware VCF) or APEX / AX nodes' },
      { v: 'ai', label: 'AI / GPU servers', desc: 'PowerEdge XE9680 / XE9685 / XE7745' },
      { v: 'server', label: 'General servers', desc: 'PowerEdge R660 / R670 / R760' },
      { v: 'edge', label: 'Edge / access', desc: 'E3224F / E3248P / E3248PXE' },
      { v: 'unsure', label: 'Not sure yet', desc: 'Use a sensible default' }
    ], default: 'server' },
    { id: 'blockModel', type: 'choice', q: 'Which block platform?', showIf: s => s.category === 'block',
      listenFor: ['PowerStore 500T–9200T', 'PowerFlex rack / appliance / custom', 'PowerMax 2500 / 8500', 'PowerVault ME5 (entry SAN)'],
      options: [
      { v: 'powerstore', label: 'PowerStore', desc: 'Unified block/file, NVMe/TCP' },
      { v: 'powerflex', label: 'PowerFlex', desc: 'Software-defined, heavy east-west' },
      { v: 'powermax', label: 'PowerMax', desc: 'High-end mission-critical' },
      { v: 'powervault-me5', label: 'PowerVault ME5', desc: 'Entry/mid-range iSCSI SAN — small business, MPIO not LACP' },
      { v: 'unsure', label: 'Not sure', desc: 'Default to PowerStore' }
    ], default: 'powerstore' },
    { id: 'hciFlavor', type: 'choice', q: 'Which hyperconverged platform?', showIf: s => s.category === 'hci',
      help: 'VxRail runs VMware VCF and bonds its node NICs with LACP → an MC-LAG ToR pair on a BGP EVPN-VXLAN fabric. Azure Local (APEX / AX) uses Switch-Embedded Teaming and a Microsoft-approved switch list.',
      listenFor: ['VxRail / VMware / vSAN', 'Azure Local / Azure Stack HCI', 'APEX Cloud Platform'],
      options: [
      { v: 'vxrail', label: 'VxRail (VMware VCF)', desc: 'LACP node bonding → MC-LAG; EVPN-VXLAN fabric' },
      { v: 'apex-hci', label: 'APEX / Azure Local', desc: 'AX nodes, Switch-Embedded Teaming (SET)' }
    ], default: 'vxrail' },
    { id: 'vxrailModel', type: 'choice', q: 'Which VxRail series?', showIf: s => s.category === 'hci' && s.hciFlavor === 'vxrail',
      help: 'The series sets the node speed — VP (performance) favors 100GbE; VE/VS/VD are 25GbE typical.',
      options: [
      { v: 'vxrail-ve', label: 'VE-series (25GbE, general)', desc: 'General VCF compute' },
      { v: 'vxrail-vp', label: 'VP-series (100GbE, performance)', desc: 'Dense vSAN / performance' },
      { v: 'vxrail-vs', label: 'VS-series (storage-dense)', desc: '25GbE typical' },
      { v: 'vxrail-vd', label: 'VD-series (edge/rugged)', desc: '25GbE' }
    ], default: 'vxrail-ve' },
    { id: 'aiModel', type: 'choice', q: 'Which GPU server?', showIf: s => s.category === 'ai',
      help: 'The GPU generation sets the rail speed — Hopper/H200 = 400G (ConnectX-7); Blackwell B200 = 800G (ConnectX-8).',
      listenFor: ['XE9680 (H100/H200)', 'XE9780 / XE9785 (Blackwell B200)', 'XE9685 (MI300X)', 'XE7745 (RTX PRO)'],
      options: [
      { v: 'xe9680', label: 'XE9680 (8× H100/H200)', desc: '400GbE rails · ConnectX-7' },
      { v: 'xe9780', label: 'XE9780 (8× B200, Blackwell)', desc: '800GbE rails · ConnectX-8' },
      { v: 'xe9785', label: 'XE9785 (8× B200, AMD EPYC)', desc: '800GbE rails · ConnectX-8' },
      { v: 'xe9685', label: 'XE9685 (8× AMD MI300X)', desc: '400GbE rails' },
      { v: 'xe7745', label: 'XE7745 (PCIe GPU node)', desc: '400GbE' }
    ], default: 'xe9680' },
    { id: 'nasModel', type: 'choice', q: 'Which PowerScale model?', showIf: s => s.category === 'nas',
      help: 'Front-end speed varies by model — F210 = 25G, F710 / F910 / F900 = 100G.',
      listenFor: ['F210 (25G FE)', 'F710 (100G FE)', 'F900 / F910 (100G)'],
      options: [
      { v: 'f710', label: 'F710 (100G FE)', desc: 'Performance all-flash' },
      { v: 'f210', label: 'F210 (25G FE)', desc: 'Entry all-flash' },
      { v: 'f910', label: 'F910 (100G FE)', desc: 'High-capacity' },
      { v: 'f900', label: 'F900 (100G FE)', desc: 'Prev-gen performance' }
    ], default: 'f710' },
    { id: 'gpus', type: 'number', q: 'How many GPUs per AI server?', showIf: s => s.category === 'ai',
      help: 'One rail (NIC) per GPU drives the AI fabric size', listenFor: ['8 (XE9680 / XE9685)', '4', 'H100 / H200 / Blackwell'], default: 8,
      unknownAssume: 'GPUs/server assumed = 8 (XE9680)' },
    { id: 'stack', type: 'choice', q: 'AI fabric stack? (pick one — never mix vendors within an AI fabric)', showIf: s => s.category === 'ai', required: true,
      listenFor: ['NVIDIA Spectrum-X', 'Dell PowerSwitch / SONiC', '“all one vendor”'],
      options: [
      { v: 'nvidia', label: 'NVIDIA Spectrum (SN-series)', desc: 'Spectrum-X — the validated AI Factory fabric' },
      { v: 'dell', label: 'Dell PowerSwitch (Z/S-series)', desc: 'All-Dell SONiC AI stack' }
    ] },
    { id: 'aiTransport', type: 'choice', q: 'RDMA transport for the GPU fabric — RoCEv2 or Ultra Ethernet (UEC)?',
      showIf: s => s.category === 'ai',
      help: 'Both are non-blocking 1:1 fabrics on the same Dell Z-series switches. RoCEv2 is proven; Ultra Ethernet (UEC 1.0, the open multi-vendor standard) sprays traffic across ALL paths — better for GPU collectives — but needs UEC-capable NICs.',
      listenFor: ['"RoCE" / "RDMA"', 'Ultra Ethernet / UEC', 'ConnectX-8 / BlueField-3 SuperNIC', '"open standard vs Spectrum-X"'],
      options: [
      { v: 'roce', label: 'RoCEv2 (proven / default)', desc: 'The established RDMA-over-Ethernet transport (PFC + ECN + DCQCN)' },
      { v: 'uec', label: 'Ultra Ethernet (UEC 1.0)', desc: 'Open multi-vendor; multipath packet spraying — confirm UEC-capable NICs' }
    ], default: 'roce' },
    { id: 'railSpeed', type: 'choice', q: 'Which NIC drives the GPU rails?', showIf: s => s.category === 'ai',
      help: 'The rail NIC sets the compute-fabric speed. A chassis can be configured either way — e.g. an XE9780 ordered with ConnectX-7 runs 400G rails, not the 800G ConnectX-8 default.',
      listenFor: ['ConnectX-7 → 400G', 'ConnectX-8 SuperNIC → 800G', 'BlueField-3'],
      options: [
      { v: '', label: 'Model default', desc: 'XE9680/9685/7745 → CX-7 400G · XE9780/9785 → CX-8 800G' },
      { v: '400GbE', label: 'ConnectX-7 — 400GbE rails', desc: 'Overrides the model default if different' },
      { v: '800GbE', label: 'ConnectX-8 SuperNIC — 800GbE rails', desc: 'Overrides the model default if different' }
    ], default: '' },
    // R12 ruling 2026-07-16d(a): the 1:2 rail splitter differs by the NIC's CONNECTOR, not its
    // speed — MCP7Y00 (2× OSFP) vs MCP7Y10 (2× QSFP112). They are not interchangeable, so this is
    // ASKED rather than guessed. Conditional reveal (J2/J3 pattern): only NVIDIA-stack 400G rails
    // land on a twin-port-OSFP switch port that needs the splitter — 800G rails take a direct OSFP
    // DAC, and the Dell stack's 800G→2×400G breakout has fixed QSFP56-DD far ends. Asking outside
    // that case would be a question with no effect on the BOM.
    // "Not sure" is a real answer: it quotes the MCP7Y00 variant VERIFY-flagged rather than
    // blocking — the swap is like-for-like (same price class, no design or quantity impact).
    { id: 'railNicCage', type: 'choice', q: 'What connector do the GPU rail NICs use?',
      showIf: s => s.category === 'ai' && s.stack === 'nvidia' && s.railSpeed === '400GbE',
      help: 'At 400G the switch port is a twin-port OSFP cage, so each port feeds TWO rails through a 1:2 splitter — and the splitter is built for a specific connector at the NIC end. Same price class either way; picking wrong means the cable will not plug in.',
      listenFor: ['“OSFP ConnectX-7”', '“QSFP112”', 'BlueField-3 DPU', '“which NIC card exactly?”'],
      options: [
      { v: 'osfp', label: 'OSFP', desc: 'OSFP ConnectX-7 / ConnectX-8 → MCP7Y00 splitter' },
      { v: 'qsfp112', label: 'QSFP112', desc: 'QSFP112 ConnectX-7, or a BlueField-3 DPU → MCP7Y10 splitter' },
      { v: 'unsure', label: 'Not sure', desc: 'Quotes the OSFP splitter and flags the line to verify — like-for-like swap if it turns out QSFP112' }
    ], default: 'unsure' },
    { id: 'aiDataSpec', type: 'choice', q: 'The GPU servers also carry front-end / storage NICs — spec them?',
      showIf: s => s.category === 'ai',
      help: 'Separate from the rails: e.g. Broadcom OCP for LAN plus 100G ports to storage. Spec them to size that fabric exactly.',
      listenFor: ['Broadcom / Intel OCP', '"and a Broadcom NIC"', 'storage connectivity of the AI nodes'],
      options: [
      { v: 'default', label: 'Platform default', desc: '2× 100GbE storage + 2× 25GbE front-end per server' },
      { v: 'custom', label: 'Spec the front-end / storage NIC', desc: 'Answer the NIC questions (vendor, speed, ports, count)' }
    ], default: 'default' },
    { id: 'units', type: 'number', q: 'How many units are we connecting?', help: 'appliances / nodes / servers',
      listenFor: ['# of appliances', '# of storage nodes', '# of servers', '“a couple racks”'], default: 4,
      confirm: ['NIC speed & count vary by order — confirm the actual server/storage config',
        'I/O module (25G vs 100G) & port count vary by appliance model — confirm per config'],
      unknownAssume: 'Unit count assumed = 4 (update when known)' },
    ...EXISTING_STEPS,
    ...NIC_STEPS,
    STORAGE_PROTO_STEP,
    FABRIC_STYLE_STEP,
    ...CABLING_STEPS,
    { id: 'second', type: 'choice', q: 'Also connecting servers or storage in this same design?',
      help: 'Combine as many storage + server targets as this build needs — each gets its own full build-out (model, count, speed, NICs), and you can add another after this one.',
      listenFor: ['PowerEdge servers', 'GPU servers', 'PowerStore / PowerMax / PowerFlex', 'PowerScale / ObjectScale', '“and our servers too”'],
      options: [
      { v: 'none', label: 'No — just the above', desc: '' },
      { v: 'poweredge-general', label: 'Yes — add PowerEdge servers', desc: 'General-purpose servers' },
      { v: 'poweredge-ai', label: 'Yes — add AI / GPU servers', desc: 'XE9680 / XE9780 — adds a rail-optimized AI fabric' },
      { v: 'powerstore', label: 'Yes — add PowerStore', desc: 'Block / unified storage' },
      { v: 'powerscale', label: 'Yes — add PowerScale', desc: 'Scale-out NAS / AI data' },
      { v: 'powermax', label: 'Yes — add PowerMax', desc: 'High-end block storage' },
      { v: 'powerflex', label: 'Yes — add PowerFlex', desc: 'Software-defined block' },
      { v: 'objectscale', label: 'Yes — add ObjectScale', desc: 'Object storage (S3)' },
      { v: 'apex-hci', label: 'Yes — add APEX HCI (Azure Local)', desc: 'AX nodes' },
      { v: 'vxrail', label: 'Yes — add VxRail', desc: 'Hyperconverged (VMware VCF)' },
      { v: 'mx7000', label: 'Yes — add PowerEdge MX7000', desc: 'Modular chassis (Scalable Fabric)' },
      { v: 'powervault-me5', label: 'Yes — add PowerVault ME5', desc: 'Entry/mid-range iSCSI SAN' }
    ], default: 'none' },
    { id: 'secondUnits', type: 'number', q: 'How many of the second target?', showIf: s => s.second && s.second !== 'none',
      listenFor: ['# of servers', '# of appliances', '# of nodes'], default: 8, unknownAssume: 'Second-target count assumed = 8' },
    // model drill-down for the ADDED target — generated from the catalog for every platform
    ...SECOND_MODEL_STEPS,
    { id: 'secondGpus', type: 'number', q: 'GPUs per added AI server?', showIf: s => s.second === 'poweredge-ai',
      help: 'One rail (NIC) per GPU drives the added AI fabric size', listenFor: ['8 (XE9680 / XE9780)', '4'], default: 8,
      unknownAssume: 'Added AI target: GPUs/server assumed = 8' },
    { id: 'secondRailSpeed', type: 'choice', q: 'Added AI servers — which NIC drives the GPU rails?', showIf: s => s.second === 'poweredge-ai',
      help: 'ConnectX-7 = 400G rails, ConnectX-8 = 800G rails — overrides the model default if configured differently',
      options: [
      { v: '', label: 'Model default', desc: '' },
      { v: '400GbE', label: 'ConnectX-7 — 400GbE rails', desc: '' },
      { v: '800GbE', label: 'ConnectX-8 — 800GbE rails', desc: '' }
    ], default: '' },
    { id: 'stack', type: 'choice', q: 'AI fabric stack for the added GPU servers? (never mix vendors within an AI fabric)',
      showIf: s => s.second === 'poweredge-ai' && s.category !== 'ai', required: true,
      listenFor: ['NVIDIA Spectrum-X', 'Dell PowerSwitch / SONiC'],
      options: [
      { v: 'nvidia', label: 'NVIDIA Spectrum (SN-series)', desc: 'Spectrum-X — the validated AI Factory fabric' },
      { v: 'dell', label: 'Dell PowerSwitch (Z/S-series)', desc: 'All-Dell SONiC AI stack' }
    ] },
    { id: 'secondSpec', type: 'choice', q: 'Spec the added target’s connectivity exactly, or use its published default?',
      showIf: s => s.second && s.second !== 'none' && s.second !== 'poweredge-ai',
      help: 'Its NICs / I/O modules decide the port count and speed — spec them if you know the config',
      listenFor: ['“it has 2× dual-port 25G”', 'I/O module config', '“standard config”'],
      options: [
      { v: 'default', label: 'Published default config', desc: 'Use the platform / model’s standard port layout' },
      { v: 'custom', label: 'Spec it exactly (NICs, ports, speed)', desc: 'Answer three quick questions about its connectivity' }
    ], default: 'default' },
    { id: 'secondNicSpeed', type: 'choice', q: 'Added target — port speed?', showIf: s => s.secondSpec === 'custom',
      listenFor: ['1G copper', '10G copper', '10G', '25G', '100G', '200G', '400G'],
      options: [
      { v: '', label: 'Keep the model default', desc: '' },
      { v: '1GBase-T', label: '1GbE — RJ45 copper', desc: '' }, { v: '1GbE', label: '1GbE — SFP fiber', desc: '' },
      { v: '10GBase-T', label: '10GbE — RJ45 copper', desc: '' }, { v: '10GbE', label: '10GbE — SFP+ fiber/DAC', desc: '' },
      { v: '25GbE', label: '25GbE', desc: '' },
      { v: '40GbE', label: '40GbE (legacy)', desc: 'QSFP+ — lands on a QSFP28 leaf' }, { v: '100GbE', label: '100GbE', desc: '' },
      { v: '200GbE', label: '200GbE', desc: '' }, { v: '400GbE', label: '400GbE', desc: '' }
    ], default: '' },
    { id: 'secondNicPorts', type: 'choice', q: 'Added target — ports per NIC / I/O module?', showIf: s => s.secondSpec === 'custom',
      listenFor: ['single-port', 'dual-port', 'quad-port'],
      options: [
      { v: '2', label: 'Dual-port (2)', desc: 'Most common' },
      { v: '1', label: 'Single-port (1)', desc: '' },
      { v: '4', label: 'Quad-port (4)', desc: '' }
    ], default: '2' },
    { id: 'secondNicCount', type: 'number', q: 'Added target — how many data NICs / I/O modules per unit?',
      showIf: s => s.secondSpec === 'custom', help: 'Total per unit — drives its port count',
      listenFor: ['1', '2 (redundancy)', 'more for storage'], default: 2, unknownAssume: 'Added target: NICs/unit assumed = 2' },
    { id: 'secondMore', type: 'choice', q: 'Add another attach target to this same design?',
      showIf: s => s.second && s.second !== 'none',
      help: 'Build out as big a solution as this design actually needs — a large server pool, several smaller server pools, and multiple storage platforms can all live in one BOM & topology.',
      listenFor: ['“and also add…”', 'several server pools', 'multiple storage arrays', '“that’s everything”'],
      options: [
      { v: 'no', label: 'No — that’s everything', desc: 'Move on to sizing' },
      { v: 'yes', label: 'Yes — add another target', desc: 'Spec platform, model, count & NICs for one more' }
    ], default: 'no' },
    { id: 'fabricArch', type: 'choice', q: 'Does storage traffic share the same switches as compute, or stay on its own network?',
      showIf: s => s.extraTargets && s.extraTargets.length > 0,
      help: 'This decides whether compute and storage NICs land on the SAME leaf switches (VLAN-segmented, fewer switches) or get their own — a real architectural choice, not just a cost/isolation dial. NVMe over RoCE storage always stays on its own dedicated fabric regardless of this answer — that’s a technical requirement (a lossless fabric), not a preference.',
      listenFor: ['"one flat/converged network"', '"keep storage isolated"', 'VLAN-segmented vs. physically separate', 'simpler/cheaper vs. isolation'],
      options: [
      { v: 'sharedSpine', label: 'Separate leaf, shared spine (recommended default)', desc: 'Each network keeps its own switches; one shared spine tier ties them together' },
      { v: 'converged', label: 'Converged — one fabric for everything', desc: 'Compute + storage NICs share the SAME leaf switches (VLAN-segmented) — fewer switches, no physical separation' },
      { v: 'separate', label: 'Fully separate fabrics', desc: 'Dedicated leaf AND dedicated spine per network — maximum isolation' }
    ], default: 'sharedSpine' },
    ...SIZING_STEPS,
    { id: 'redundancy', type: 'choice', q: 'How important is resilience?',
      listenFor: ['“production” → dual', '“mission-critical” → dual', '“lab / PoC” → single'],
      options: [
      { v: 'dual', label: 'Fully redundant (recommended)', desc: 'Dual switch pair — no single point of failure' },
      { v: 'single', label: 'Single fabric', desc: 'Lab / proof-of-concept only' }
    ], default: 'dual' },
    { id: 'growth', type: 'choice', q: 'How much room to grow should we leave?',
      listenFor: ['3–5 yr refresh → 25%+', 'fast-growing → 50%', 'fixed project → exact'],
      options: [
      { v: '0.25', label: '25% headroom (recommended)', desc: 'Comfortable room to add nodes' },
      { v: '0', label: 'Exact fit', desc: 'Size to today only' },
      { v: '0.5', label: '50% headroom', desc: 'Aggressive growth' }
    ], default: '0.25' },
    { id: 'oob', type: 'choice', q: 'Include an out-of-band management network?',
      listenFor: ['iDRAC', 'BMC / console access', 'dedicated mgmt VLAN'],
      options: [
      { v: 'yes', label: 'Yes (recommended)', desc: 'Dedicated switch for iDRAC / BMC access' },
      { v: 'no', label: 'No', desc: 'Skip OOB' }
    ], default: 'yes' },
    // 'nos' wizard question REMOVED (R14, 2026-07-23, maintainer ruling: "OS10 shouldn't be
    // quoted, it's end of sale"). New Dell switches are Enterprise SONiC — no rep-facing choice.
    // VLT/OS10 wording survives only on paths describing a customer's EXISTING gear (refresh).
    { id: 'uplinkTarget', type: 'choice', q: 'How should the new leaves reach the rest of the network?',
      help: 'New spine = a self-contained pod we quote end-to-end. Existing core = the leaves plug straight into your current aggregation — no new spine.',
      listenFor: ['“we already have a core / aggregation”', 'spine has capacity', 'collapsed core', 'greenfield pod', '“just need the leaves”'],
      confirm: ['Existing core: confirm free port count & speed on your core for the leaf uplinks — the BOM states the total ports needed.'],
      options: [
      { v: 'new-spine', label: 'New spine (self-contained pod)', desc: 'We quote spine switches + leaf→spine cabling' },
      { v: 'existing-core', label: 'Uplink to your existing core', desc: 'No new spine — leaves connect straight to your current core' }
    ], default: s => (s.deployType === 'add' ? 'existing-core' : 'new-spine') },
    { id: 'core', type: 'choice', q: 'Uplink to an existing core network?',
      listenFor: ['core / backbone', 'aggregation layer', 'DCI', '“connects to our existing core”'],
      options: [
      { v: 'none', label: 'Not now', desc: 'Fabric only' },
      { v: '100GbE', label: 'Yes — 100GbE to core', desc: '2× redundant uplinks' },
      { v: '400GbE', label: 'Yes — 400GbE to core', desc: '2× redundant uplinks' }
    ], default: 'none' },
    { id: 'coreVendor', type: 'choice', q: 'What does your existing core run?',
      showIf: s => s.core && s.core !== 'none',
      help: 'This decides whether we can quote the far-side optics too. Dell-into-Dell is fully quotable; another vendor means you supply the matching far-side optic.',
      listenFor: ['“our core is Dell / Cisco / Arista / Juniper”', 'existing backbone', '“hand off to the WAN team”'],
      options: [
      { v: 'dell', label: 'Dell PowerSwitch', desc: 'We quote the far-side optics too (Dell into Dell)' },
      { v: 'other', label: 'Another vendor', desc: 'You supply the far-side optics — we quote our side, matched to the same link type' },
      { v: 'unsure', label: 'Not sure yet', desc: 'We quote our side only and flag the far side to verify' }
    ], default: 'unsure' },
    // R14 Slice 4 (2026-07-23, work-order M4/D4) — MERGED from two near-duplicate questions
    // (coreReach + coreType, both "how far is the core?"). The R16 sweep (2026-07-17d) added
    // coreType alongside the pre-existing coreReach and flagged the wording collision rather
    // than fixing it, because at the time engine.js's coreType==='dci' branch had a LATENT bug
    // (Slice 1, v0.65.5 — 'dci' never actually forced long reach). Merging first would have
    // risked masking that bug behind a single answer; safe now that it's fixed. One question,
    // one answer, sets BOTH coreType and coreReach consistently — the impossible combination
    // (dci + short-reach) can no longer be produced from the wizard.
    { id: 'coreDistance', type: 'choice', q: 'How far is the core you\'re uplinking to?',
      showIf: s => s.core && s.core !== 'none',
      help: 'Distance sets both the optic (short-reach vs 10km long-reach single-mode) and the uplink class (ordinary core/aggregation hop vs a DCI-class second-site link).',
      listenFor: ['“it’s in another building”', 'metro / dark fiber', 'single-mode', 'same rack row', '“second site”', 'DCI', 'campus interconnect', '“another data center”'],
      options: [
      { v: 'room', label: 'Same room / rack / row', desc: 'Short-reach optics' },
      { v: 'building', label: 'Elsewhere in the same building (long cable run)', desc: '10km LR single-mode' },
      { v: 'offsite', label: 'Different building / campus / metro', desc: 'DCI-class uplink' }
    ], default: 'room' },
    { id: 'coreFarModel', type: 'choice', q: 'Do you know which Dell switch your core is?',
      showIf: s => s.core && s.core !== 'none' && s.coreVendor === 'dell',
      help: 'If you can name it, we match the far-side port from the catalog and skip the next question.',
      options: (((window.CATALOG && window.CATALOG.switches) || []).filter(sw => sw.roles && (sw.roles.indexOf('spine') >= 0 || sw.roles.indexOf('leaf') >= 0) && /^(z9|s5)/.test(sw.id)).slice(0, 6)
        .map(sw => ({ v: sw.id, label: sw.model, desc: (sw.access && sw.access.speed) ? sw.access.speed + ' class' : '' }))
        .concat([{ v: 'unknown', label: 'Not sure', desc: 'We’ll ask the port type next' }])), default: 'unknown' },
    { id: 'coreFarPort', type: 'choice', q: 'What port will the far (core) side use?',
      showIf: s => s.core && s.core !== 'none' && s.coreVendor === 'dell' && s.coreFarModel === 'unknown',
      help: 'The speed is already your core speed — this is just the media/connector so we match the optic.',
      options: [
      { v: 'mmf', label: 'MPO / multimode (SR)', desc: 'Short-reach parallel optics' },
      { v: 'smf', label: 'LC / single-mode (LR)', desc: 'Long-reach duplex' },
      { v: 'dac', label: 'Direct-attach (DAC)', desc: 'In-rack copper' },
      { v: 'unknown', label: 'Not sure — match ours & flag', desc: 'Quotes matched optics with a verify flag' }
    ], default: 'unknown' },
    { id: 'borderLeaf', type: 'choice', q: 'How should the fabric reach the core / other sites?',
      showIf: s => s.core && s.core !== 'none',
      help: 'Dell\'s EVPN-VXLAN multisite design uses a dedicated BORDER-LEAF pair as the north-south exit — it keeps external traffic off the spine ports and is the clean place for DCI, firewalls and route leaking. Needs a leaf-spine fabric (a spine to attach to).',
      listenFor: ['“border leaf”', 'DCI / multisite', 'dedicated egress', 'firewall / services insertion'],
      options: [
      { v: 'no', label: 'From the spine (simplest)', desc: 'Core uplinks ride spare spine ports — fine for a single exit' },
      { v: 'yes', label: 'Dedicated border-leaf pair', desc: 'Adds a 2-switch MC-LAG border pair — matches Dell multisite/DCI designs' }
    ], default: 'no' },
    { id: 'verity', type: 'choice', q: 'Add Dell Fabric Manager (DFM) — Automation, Observability, AIOps?',
      help: 'Single pane of glass + zero-touch provisioning for Dell SONiC',
      listenFor: ['“hard to manage”', '“too much CLI”', '“migrating off Cisco / OS10”', 'multi-site'],
      options: [
      { v: 'yes', label: 'Yes — include DFM', desc: 'Deploy & run the fabric from one console' },
      { v: 'no', label: 'Not now', desc: 'Hardware only' }
    ], default: 'yes' }
  ];

  function DISCOVERY() {
    const D = C().discovery;
    const opts = obj => Object.keys(obj).map(k => ({ v: k, label: obj[k].label }));
    return [
      { id: 'vendor', type: 'choice', q: 'What network do they run today?',
        listenFor: ['Cisco Nexus / ACI', 'Arista EOS', 'Juniper Apstra / Junos', 'HPE / Aruba CX', 'Dell OS10', 'Big Switch / Pluribus (sunsetting)'],
        options: opts(D.competitors), default: 'mixed' },
      { id: 'currentSpeed', type: 'choice', q: 'What speeds are in their data center today?',
        listenFor: ['1G/10G access (legacy)', '25G to servers', '100G spine/core', '400G (AI-ready)'],
        options: [
        { v: 'legacy', label: 'Mostly 1/10G (legacy)', desc: 'Ripe for modernization' },
        { v: '25g', label: '25G to servers', desc: 'Current-gen access' },
        { v: '100g', label: '100G core / spine', desc: 'Modern' },
        { v: '400g', label: '400G+', desc: 'Leading edge / AI-ready' },
        { v: 'mixed', label: 'Mixed / not sure', desc: '' }
      ], default: 'mixed' },
      { id: 'workloads', type: 'multi', q: 'Which workloads are growing for them?',
        listenFor: ['VMware / Kubernetes', 'databases', 'backup / archive', 'GenAI / LLM training', 'VDI', 'IoT / edge'],
        options: opts(D.workloads), multiDefault: ['virtualization'] },
      { id: 'pains', type: 'multi', q: 'What are their biggest pain points?',
        listenFor: ['outages / downtime', 'licensing cost', 'staffing / skills gap', '“locked in”', '“not AI-ready”', 'slow deployments'],
        options: opts(D.painPoints) },
      { id: 'dellPlat', type: 'multi', q: 'Any Dell storage or servers in play (or planned)?',
        listenFor: ['PowerStore', 'PowerScale', 'PowerFlex', 'PowerMax', 'PowerEdge', 'XE9680 / XE7745 (GPU)'],
        options: [
        { v: 'powerstore', label: 'PowerStore' }, { v: 'powerscale', label: 'PowerScale' },
        { v: 'powerflex', label: 'PowerFlex' }, { v: 'powermax', label: 'PowerMax' },
        { v: 'objectscale', label: 'ObjectScale (S3)' }, { v: 'apex-hci', label: 'APEX / Azure Local' },
        { v: 'poweredge-general', label: 'PowerEdge servers' }, { v: 'poweredge-ai', label: 'AI / GPU (XE9680)' },
        { v: 'none', label: 'None yet' }
      ] },
      { id: 'aiModelD', type: 'choice', q: 'Which GPU servers are they looking at?',
        showIf: s => (s.workloads && s.workloads.includes('ai')) || (s.dellPlat && s.dellPlat.includes('poweredge-ai')),
        help: 'GPU generation sets the rail speed — Hopper/H200 = 400G; Blackwell B200 = 800G (ConnectX-8).',
        listenFor: ['XE9680 (H100/H200)', 'XE9780 / XE9785 (Blackwell B200)', 'XE9685 (MI300X)', '“future-proofing for Blackwell”'],
        options: [
        { v: 'xe9680', label: 'XE9680 (8× H100/H200)', desc: '400GbE rails · ConnectX-7' },
        { v: 'xe9780', label: 'XE9780 (8× B200, Blackwell)', desc: '800GbE rails · ConnectX-8' },
        { v: 'xe9785', label: 'XE9785 (8× B200, AMD)', desc: '800GbE rails · ConnectX-8' },
        { v: 'xe9685', label: 'XE9685 (8× MI300X)', desc: '400GbE rails' },
        { v: '', label: 'Not sure yet', desc: 'Use the family default (400G)' }
      ], default: 'xe9680' },
      { id: 'railSpeedD', type: 'choice', q: 'Do they know which NIC drives the GPU rails?',
        showIf: s => (s.workloads && s.workloads.includes('ai')) || (s.dellPlat && s.dellPlat.includes('poweredge-ai')),
        help: 'ConnectX-7 = 400G rails · ConnectX-8 = 800G rails — a chassis can be ordered either way',
        listenFor: ['ConnectX-7', 'ConnectX-8 SuperNIC', '“whatever comes standard”'],
        options: [
        { v: '', label: 'Model default / unknown', desc: '' },
        { v: '400GbE', label: 'ConnectX-7 — 400GbE rails', desc: '' },
        { v: '800GbE', label: 'ConnectX-8 — 800GbE rails', desc: '' }
      ], default: '' },
      { id: 'nasModelD', type: 'choice', q: 'Which PowerScale model?',
        showIf: s => (s.workloads && s.workloads.includes('nas')) || (s.dellPlat && s.dellPlat.includes('powerscale')),
        help: 'Front-end speed varies — F210 = 25G, F710 / F910 / F900 = 100G.',
        listenFor: ['F210 (25G)', 'F710 (100G)', 'F900 / F910 (100G)'],
        options: [
        { v: 'f710', label: 'F710 (100G FE)', desc: 'Performance all-flash' },
        { v: 'f210', label: 'F210 (25G FE)', desc: 'Entry all-flash' },
        { v: 'f900', label: 'F900 / F910 (100G FE)', desc: 'High-capacity / performance' },
        { v: '', label: 'Not sure yet', desc: 'Use the family default (100G)' }
      ], default: 'f710' },
      { id: 'scale', type: 'number', q: 'Roughly how many servers or nodes?', help: 'a ballpark is fine — refine later',
        listenFor: ['# of racks', '# of servers / nodes', '# of GPUs (÷8 ≈ nodes)'], default: 16,
        unknownAssume: 'Scale assumed = 16 units (update when known)' },
      ...NIC_STEPS,
      STORAGE_PROTO_STEP,
      ...CABLING_STEPS,
      ...SIZING_STEPS,
      { id: 'verity', type: 'choice', q: 'Bring the management story (Dell Fabric Manager)?',
        listenFor: ['ops complexity', 'multi-site sprawl', 'migration off legacy', 'skills gap'],
        options: [
        { v: 'yes', label: 'Yes — lead with DFM', desc: 'Single pane of glass for Dell SONiC' },
        { v: 'no', label: 'Not this time', desc: '' }
      ], default: 'yes' },
      { id: 'timeline', type: 'choice', q: 'What’s their timeframe?',
        listenFor: ['budget cycle / fiscal year-end', 'active RFP', 'refresh due', 'data-center build'],
        options: [
        { v: 'now', label: 'Now / active project' }, { v: 'quarter', label: 'This quarter' },
        { v: 'year', label: 'This year' }, { v: 'explore', label: 'Just exploring' }
      ], default: 'quarter' }
    ];
  }

  // NETWORK REFRESH — the network itself is the deal: replace an ageing fabric.
  function REFRESH() {
    const D = C().discovery;
    return [
      { id: 'vendor', type: 'choice', q: 'Whose network are we refreshing?',
        listenFor: ['Cisco Catalyst/Nexus end-of-support', 'maintenance renewal shock', 'Arista / Juniper / HPE', 'old Dell N-series / OS9'],
        options: Object.keys(D.competitors).map(k => ({ v: k, label: D.competitors[k].label })), default: 'cisco' },
      { id: 'topologyNow', type: 'choice', q: 'What does the network look like today?',
        listenFor: ['a couple of top-of-rack switches', 'access + aggregation + core (3-tier)', 'already leaf-spine'],
        options: [
        { v: 'tor', label: 'A few ToR / access switches', desc: 'Small — switch pairs, no aggregation tier' },
        { v: '3tier', label: 'Classic 3-tier (access / agg / core)', desc: 'Refresh collapses this to leaf-spine' },
        { v: 'leafspine', label: 'Already leaf-spine', desc: 'Like-for-like modern refresh' }
      ], default: '3tier' },
      { id: 'swCount', type: 'number', q: 'How many access/leaf switches are being replaced?',
        help: 'Like-for-like count (rounded to pairs). Consolidation can come later.',
        listenFor: ['count the closets/racks', 'stacks count as their member switches'], default: 8, unknownAssume: 'Existing switch count assumed = 8' },
      { id: 'portsPer', type: 'choice', q: 'Ports per existing switch?',
        options: [ { v: '48', label: '48-port', desc: 'Most common' }, { v: '24', label: '24-port', desc: '' } ], default: '48' },
      { id: 'speedNow', type: 'choice', q: 'What speed runs today?',
        listenFor: ['1G copper everywhere', '10G to servers', '25G already'],
        options: [ { v: '1G', label: '1GbE (copper)' }, { v: '10G', label: '10GbE' }, { v: '25G', label: '25GbE' } ], default: '10G' },
      { id: 'targetSpeed', type: 'choice', q: 'Refresh target speed?',
        help: 'The refresh is the moment to jump a speed class — same cable plant where media matches.',
        listenFor: ['copper clients stay BASE-T', 'servers -> 25G SFP28', 'storage/virtualization -> 100G'],
        options: [
        { v: '25g', label: '25GbE (SFP28) — servers', desc: 'The modern server access standard' },
        { v: '10g-t', label: '10GbE BASE-T — copper clients', desc: 'Reuse existing copper cabling' },
        { v: '100g', label: '100GbE — storage / dense virtualization', desc: 'High-end refresh' }
      ], default: '25g' },
      { id: 'distribution', type: 'choice', q: 'Refresh the aggregation/core tier too?',
        options: [
        { v: 'new', label: 'Yes — include a new MC-LAG distribution pair', desc: 'Full refresh (recommended)' },
        { v: 'existing', label: 'No — keep the existing core for now', desc: 'Access-only refresh, uplink to what is there' }
      ], default: 'new' },
      // R16 (B7 UI): keeping the existing core promised "uplink to what is there" but nothing
      // ever primed recommendRefresh's includeCoreUplink — the uplink was quoted as if it didn't
      // exist. Reuses the main-path J2/J3 core-uplink machinery (same ids so SUM_LABELS and the
      // go()-translation pattern line up, same coreVendor behaviors) — only asked when it's
      // reachable (existing-core path; a new distribution pair is refresh's own uplink target).
      { id: 'core', type: 'choice', q: 'Does this refresh connect into an existing core — should we quote that uplink?',
        showIf: s => s.distribution === 'existing',
        help: 'Access-only keeps this refresh scoped to the switches being replaced; quoting the uplink prices the cabling into your existing core too.',
        listenFor: ['core / backbone', 'aggregation layer', '“uplinks to our existing core”'],
        options: [
        { v: 'none', label: 'Not now', desc: 'Access-only — the uplink is not priced here' },
        { v: '100GbE', label: 'Yes — 100GbE to the existing core', desc: '2× redundant uplinks' },
        { v: '400GbE', label: 'Yes — 400GbE to the existing core', desc: '2× redundant uplinks' }
      ], default: 'none' },
      { id: 'coreVendor', type: 'choice', q: 'What does your existing core run?',
        showIf: s => s.distribution === 'existing' && s.core && s.core !== 'none',
        help: 'This decides whether we can quote the far-side optics too. Dell-into-Dell is fully quotable; another vendor means you supply the matching far-side optic.',
        listenFor: ['“our core is Dell / Cisco / Arista / Juniper”', 'existing backbone'],
        options: [
        { v: 'dell', label: 'Dell PowerSwitch', desc: 'We quote the far-side optics too (Dell into Dell)' },
        { v: 'other', label: 'Another vendor', desc: 'You supply the far-side optics — we quote our side, matched to the same link type' },
        { v: 'unsure', label: 'Not sure yet', desc: 'We quote our side only and flag the far side to verify' }
      ], default: 'unsure' },
      { id: 'coreReach', type: 'choice', q: 'Same room / campus, or a long run to another building?',
        showIf: s => s.distribution === 'existing' && s.core && s.core !== 'none',
        help: 'Distance sets the optic: short-reach vs 10km long-reach single-mode.',
        listenFor: ['“it’s in another building”', 'metro / dark fiber', 'same rack row'],
        options: [
        { v: 'short', label: 'Same room / campus', desc: 'Short-reach optics (default)' },
        { v: 'long', label: 'Long run — another building / metro', desc: '10km LR single-mode' }
      ], default: 'short' },
      { id: 'oob', type: 'choice', q: 'Include out-of-band management?',
        options: [ { v: 'yes', label: 'Yes (recommended)' }, { v: 'no', label: 'No' } ], default: 'yes' },
      { id: 'verity', type: 'choice', q: 'Lead with the management story (DFM)?',
        help: 'A refresh is the best moment to fix operations, not just hardware',
        options: [ { v: 'yes', label: 'Yes — single pane + ZTP from day one' }, { v: 'no', label: 'Not now' } ], default: 'yes' }
    ];
  }

  /* ---------------- navigation ---------------- */
  /* EXPRESS — the 5-question fast path for non-technical users. Everything else is
   * inferred with clearly-flagged smart defaults; the Checks tab explains each. */
  const EXPRESS = [
    { id: 'xConnect', type: 'choice', q: 'What are you connecting to the network?',
      help: 'Pick the closest fit — you can refine later in the full guide.',
      options: [
      { v: 'servers', label: 'Servers', desc: 'PowerEdge (general compute)' },
      { v: 'block', label: 'Block storage', desc: 'PowerStore' },
      { v: 'nas', label: 'File / NAS storage', desc: 'PowerScale' },
      { v: 'ai', label: 'AI / GPU servers', desc: 'PowerEdge XE (GPU)' },
      { v: 'mixed', label: 'Servers + storage together', desc: 'PowerEdge + PowerStore' }
    ], default: 'servers' },
    { id: 'xStack', type: 'choice', q: 'AI fabric — which switches?', showIf: s => s.xConnect === 'ai',
      help: 'Both are valid; pick the vendor the customer wants.',
      options: [
      { v: 'nvidia', label: 'NVIDIA Spectrum', desc: 'Spectrum-X validated AI fabric' },
      { v: 'dell', label: 'Dell PowerSwitch', desc: 'All-Dell SONiC AI stack' }
    ], default: 'nvidia' },
    { id: 'xCount', type: 'number', q: 'How many are you connecting?', help: 'Servers, appliances, or nodes — a ballpark is fine.',
      default: 12, unknownAssume: 'Count assumed = 12' },
    { id: 'xRacks', type: 'choice', q: 'One rack, or spread across several?',
      help: 'If they span racks, each rack gets its own top-of-rack switch pair (we size that for you).',
      options: [
      { v: 'one', label: 'One rack', desc: 'Everything in a single rack' },
      { v: 'several', label: 'Several racks', desc: 'We spread ~16 units per rack (Dell pattern)' }
    ], default: 'one' },
    { id: 'xResilient', type: 'choice', q: 'How important is staying up?',
      options: [
      { v: 'dual', label: 'Production — fully redundant', desc: 'Dual switches, no single point of failure (recommended)' },
      { v: 'single', label: 'Lab / proof-of-concept', desc: 'Single switch — cheaper, not resilient' }
    ], default: 'dual' },
    { id: 'xDfm', type: 'choice', q: 'Manage the whole fabric from one console?',
      help: 'Dell Fabric Manager (DFM) deploys and runs every switch from one place — most quotes include it.',
      options: [
      { v: 'yes', label: 'Yes — include DFM', desc: 'One console, zero-touch provisioning, drift detection' },
      { v: 'no', label: 'Not now', desc: 'Hardware only' }
    ], default: 'yes' }
  ];

  function start(m) {
    mode = m; state = { extraTargets: [] }; assumptions = []; pos = 0;
    flow = (m === 'discovery') ? DISCOVERY() : (m === 'refresh' ? REFRESH() : (m === 'express' ? EXPRESS : GUIDED));
    $('#wizard').hidden = false;
    renderStep(+1);
  }
  function visible(p, dir) {
    while (p >= 0 && p < flow.length && flow[p].showIf && !flow[p].showIf(state)) p += dir;
    return p;
  }
  // recomputed on step change AND on every in-place selection — an answer can change how
  // many steps remain visible (e.g. picking a core uplink reveals the coreFar/borderLeaf
  // steps), so the bar must track selections, not just navigation
  function updateProgress() {
    const vis = flow.filter(s => !s.showIf || s.showIf(state));
    const done = vis.filter(s => flow.indexOf(s) <= pos).length;
    $('#wiz-bar').style.width = Math.round(done / Math.max(1, vis.length) * 100) + '%';
  }
  function renderStep(dir) {
    pos = visible(pos, dir >= 0 ? +1 : -1);
    if (pos >= flow.length) return finish();
    if (pos < 0) { pos = 0; }
    const st = flow[pos];
    if (state[st.id] === undefined) state[st.id] = (st.type === 'multi') ? (st.multiDefault || []).slice() : (typeof st.default === 'function' ? st.default(state) : st.default);

    // progress
    updateProgress();

    const host = $('#wiz-step');
    host.innerHTML = `<div class="wiz-q">${st.q}</div>` + (st.help ? `<p class="wiz-help">${st.help}</p>` : '');
    if (st.listenFor && st.listenFor.length) {
      host.innerHTML += `<div class="wiz-listen"><span class="wiz-listen-lbl">💡 You might hear / ask about:</span>` +
        st.listenFor.map(x => `<span class="chip">${x}</span>`).join('') + `</div>`;
    }
    if (st.confirm && st.confirm.length) {
      host.innerHTML += `<div class="wiz-confirm"><span class="wiz-confirm-lbl">⚠ Confirm the actual config (varies by order):</span>` +
        st.confirm.map(x => `<div>• ${x}</div>`).join('') + `</div>`;
    }
    if (st.type === 'choice' || st.type === 'multi') {
      const box = document.createElement('div'); box.className = 'wiz-options';
      st.options.forEach(o => {
        const sel = st.type === 'multi' ? (state[st.id] || []).includes(o.v) : state[st.id] === o.v;
        const c = document.createElement('button');
        c.className = 'wiz-opt' + (sel ? ' sel' : '');
        c.innerHTML = `<b>${o.label}</b>${o.desc ? `<span>${o.desc}</span>` : ''}`;
        c.onclick = () => {
          if (st.type === 'multi') {
            const arr = state[st.id] || [];
            state[st.id] = arr.includes(o.v) ? arr.filter(x => x !== o.v) : arr.concat(o.v);
          } else { state[st.id] = o.v; }
          // Update IN PLACE — never rebuild the step's DOM on a selection. A full re-render
          // destroys the button under the user's finger, which on a phone makes the page
          // visibly jump (focus loss + layout rebuild). Only the sel highlights, the Next
          // label (a selection can change which steps follow) and the summary can change.
          [...box.children].forEach((btn, bi) => {
            const ov = st.options[bi].v;
            const on = st.type === 'multi' ? (state[st.id] || []).includes(ov) : state[st.id] === ov;
            btn.classList.toggle('sel', on);
          });
          $('#wiz-next').textContent = (visible(pos + 1, +1) >= flow.length) ? 'See recommendation →' : 'Next →';
          updateProgress();
          renderSummary();
        };
        box.appendChild(c);
      });
      host.appendChild(box);
    } else if (st.type === 'number') {
      const wrap = document.createElement('div'); wrap.className = 'wiz-number';
      wrap.innerHTML = `<input id="wiz-num" type="number" min="1" value="${state[st.id] || st.default}" />` +
        `<button class="ghost" id="wiz-unknown">I don’t know yet</button>`;
      host.appendChild(wrap);
      wrap.querySelector('#wiz-num').oninput = e => { state[st.id] = parseInt(e.target.value, 10) || st.default; };
      wrap.querySelector('#wiz-unknown').onclick = () => { state[st.id] = st.default; if (st.unknownAssume) assume(st.unknownAssume); renderStep(+1); };
    }
    $('#wiz-next').textContent = (visible(pos + 1, +1) >= flow.length) ? 'See recommendation →' : 'Next →';
    if (window.Glossary) Glossary.apply(host);
    renderSummary();
    // On a REAL step change (Next/Back — not an in-step update), make sure the new question
    // is on screen. On a phone the user just tapped a button at the bottom of the previous
    // step, so the fresh question can start above the viewport. Only scrolls when needed.
    if (dir !== 0) {
      const wz = $('#wizard');
      if (wz && wz.getBoundingClientRect().top < 0) wz.scrollIntoView({ block: 'start' });
    }
  }

  /* ---------------- running "solution so far" overview ---------------- */
  const SUM_LABELS = {
    xConnect: 'Connecting', xStack: 'AI switches', xCount: 'How many', xRacks: 'Racks', xResilient: 'Resilience', xDfm: 'DFM',
    category: 'Connecting', blockModel: 'Platform', hciFlavor: 'HCI platform', vxrailModel: 'VxRail series', aiModel: 'GPU server', nasModel: 'PowerScale model', gpus: 'GPUs / server', stack: 'AI fabric stack',
    units: 'How many', deployType: 'Deployment', existingReuse: 'Existing fabric',
    nicVendor: 'NIC vendor', nicSpeed: 'NIC speed', nicPorts: 'Ports / NIC', nicCount: 'NICs / unit',
    storageProto: 'Storage protocol', fabStyle: 'Fabric style', placement: 'Cabling / distance', structured: 'Structured cabling', breakout: 'Breakout',
    second: 'Add target', secondUnits: 'Its count', secondGpus: 'Its GPUs/server', secondSpec: 'Its connectivity', secondMore: 'Add another?',
    secondNicSpeed: '2nd NIC speed', secondNicPorts: '2nd ports/NIC', secondNicCount: '2nd NICs/unit', fabricArch: 'Network architecture',
    railSpeed: 'GPU rail NIC', aiDataSpec: 'FE/storage NIC', secondRailSpeed: '2nd target rails',
    nic2Spec: '2nd NIC type', nic2Network: '2nd NIC connects to', nic2Speed: '2nd NIC speed', nic2Ports: '2nd NIC ports', nic2Count: '2nd NICs/unit',
    racks: 'Racks', leaf100: '100G leaf', leaf25: '25G leaf', aiTransport: 'RDMA transport', traffic: 'Traffic pattern', roadmap: 'Speed roadmap', redundancy: 'Resilience', growth: 'Growth headroom',
    oob: 'OOB mgmt', uplinkTarget: 'Uplink target', core: 'Core uplink', coreVendor: 'Core vendor', coreReach: 'Core reach', coreDistance: 'Core distance', coreFarModel: 'Core model', coreFarPort: 'Core far port', borderLeaf: 'Core egress', verity: 'DFM', railNicCage: 'Rail NIC connector',
    vendor: 'Incumbent network', currentSpeed: 'Current speeds', workloads: 'Growing workloads',
    aiModelD: 'GPU server', railSpeedD: 'GPU rail NIC', nasModelD: 'PowerScale model', topologyNow: 'Current topology', swCount: 'Switches to replace', portsPer: 'Ports/switch', speedNow: 'Speed today', targetSpeed: 'Target speed', distribution: 'Agg/core refresh',
    pains: 'Pain points', dellPlat: 'Dell in play', scale: 'Scale', timeline: 'Timeframe'
  };
  SECOND_MODEL_STEPS.forEach(st => { SUM_LABELS[st.id] = '2nd model'; });
  function stepValue(st) {
    const v = state[st.id];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) return null;
    if (st.type === 'multi') return (st.options || []).filter(o => v.includes(o.v)).map(o => o.label).join(', ') || v.join(', ');
    if (st.type === 'choice') { const o = (st.options || []).find(x => x.v === v); return o ? o.label : String(v); }
    return String(v);
  }
  function renderSummary() {
    const host = $('#wiz-summary'); if (!host) return;
    const rows = [];
    flow.forEach((st, idx) => {
      if (st.showIf && !st.showIf(state)) return;
      const val = stepValue(st); if (val == null) return;
      const lbl = SUM_LABELS[st.id] || st.id;
      rows.push(`<button type="button" class="wiz-sum-row${idx === pos ? ' cur' : ''}" data-jump="${idx}"><span class="wiz-sum-k">${lbl}</span><span class="wiz-sum-v">${val}</span></button>`);
    });
    const addedRows = (state.extraTargets || []).map((et, i) =>
      `<div class="wiz-sum-row added-target"><span class="wiz-sum-k">Added target ${i + 1}</span><span class="wiz-sum-v">${et._label}</span><button type="button" class="wiz-sum-remove" data-remove-extra="${i}" title="Remove this target">✕</button></div>`);
    if (!rows.length && !addedRows.length) { host.hidden = true; host.innerHTML = ''; return; }
    host.hidden = false;
    host.innerHTML = `<div class="wiz-sum-h">🧩 Solution so far <span class="muted">— click any item to jump back &amp; change</span></div>` + rows.join('') + addedRows.join('');
    host.querySelectorAll('[data-jump]').forEach(b => { b.onclick = () => { pos = parseInt(b.dataset.jump, 10); renderStep(0); }; });
    host.querySelectorAll('[data-remove-extra]').forEach(b => { b.onclick = e => { e.stopPropagation(); state.extraTargets.splice(parseInt(b.dataset.removeExtra, 10), 1); renderSummary(); }; });
  }

  /* ---------------- unlimited added targets (server/storage) ----------------
   * The "second" mini-flow (platform -> model -> units -> GPUs/rail -> NIC spec)
   * is reused for EVERY added target. Reaching 'secondMore' commits whatever was
   * just answered into state.extraTargets and clears the fields; answering "yes"
   * jumps back to the 'second' step to spec another one — answering "no" just
   * continues forward. This lets a design carry as many targets as it needs. */
  function commitCurrentExtraTarget() {
    if (!state.second || state.second === 'none') return;
    const railNic = state.second === 'poweredge-ai' && state.secondRailSpeed
      ? { speed: state.secondRailSpeed, model: state.secondRailSpeed === '800GbE' ? 'ConnectX-8' : 'ConnectX-7' } : null;
    const nic = state.secondSpec === 'custom'
      ? { vendor: '', speed: state.secondNicSpeed || '', portsPerNic: state.secondNicPorts, nicsPerUnit: state.secondNicCount } : null;
    state.extraTargets = state.extraTargets || [];
    state.extraTargets.push({
      platformId: state.second, units: state.secondUnits,
      gpusPerServer: state.second === 'poweredge-ai' ? (state.secondGpus || 8) : undefined,
      modelId: state['secondModel_' + state.second] || null,
      railNic, nic,
      _label: `${state.secondUnits || 1}× ${platLabel(state.second)}`
    });
  }
  function resetExtraTargetFields() {
    ['second', 'secondUnits', 'secondGpus', 'secondRailSpeed', 'secondSpec', 'secondNicSpeed', 'secondNicPorts', 'secondNicCount', 'secondMore']
      .forEach(k => { delete state[k]; });
    Object.keys(state).filter(k => k.indexOf('secondModel_') === 0).forEach(k => { delete state[k]; });
  }

  /* wire nav (idempotent) */
  function wire() {
    $('#wiz-next').onclick = () => {
      const cur = flow[pos];
      if (cur && cur.required && (state[cur.id] === undefined || state[cur.id] === '')) {
        const b = $('#wiz-next'), t = b.textContent; b.textContent = '⚠ Pick one to continue'; setTimeout(() => { b.textContent = t; }, 1400); return;
      }
      if (cur && cur.id === 'secondMore') {
        const loopAgain = state.secondMore === 'yes';
        commitCurrentExtraTarget();
        resetExtraTargetFields();
        if (loopAgain) { pos = flow.findIndex(s => s.id === 'second'); renderStep(0); return; }
      }
      pos = visible(pos + 1, +1); renderStep(0);
    };
    $('#wiz-back').onclick = () => { const p = visible(pos - 1, -1); if (p < 0) exit(); else { pos = p; renderStep(0); } };
    $('#wiz-exit').onclick = exit;
  }
  function exit() { $('#wizard').hidden = true; $('#mode-chooser').hidden = false; }

  /* ---------------- mapping + finish ---------------- */
  function guidedPlatformId() {
    const s = state;
    if (s.category === 'block') { if (s.blockModel === 'unsure' || !s.blockModel) { assume('Block platform assumed = PowerStore'); return 'powerstore'; } return s.blockModel; }
    if (s.category === 'nas') return 'powerscale';
    if (s.category === 'object') return 'objectscale';
    if (s.category === 'hci') return s.hciFlavor === 'apex-hci' ? 'apex-hci' : 'vxrail';
    if (s.category === 'ai') return 'poweredge-ai';
    if (s.category === 'server') return 'poweredge-general';
    if (s.category === 'edge') { assume('Edge attach sized with a general access profile'); return 'poweredge-general'; }
    assume('Attach target assumed = general servers'); return 'poweredge-general';
  }
  // Architecture refactor (2026-07-23, GAPS G-030): the actual DFM-attach body now lives in
  // engine.js as attachDfm(res) (app.js's Expert Form calls it directly, the same body it used
  // to paste separately) — this stays as a thin delegate so the name and window.Wizard._test
  // exposure below are unchanged, and selftest.js's existing DFM-gate tests need no edits.
  function addVerity(res) { return window.attachDfm(res); }
  function decorate(res) {
    assumptions.forEach(a => res.warnings.unshift({ severity: 'warn', message: 'Assumption: ' + a, source: 'Guided journey default' }));
  }

  function platLabel(id) { const p = (C().platforms || []).find(x => x.id === id); return p ? `${p.family} — ${p.model}` : id; }
  // Which workload key wins under the SAME priority order primaryPlatform() uses — an existing
  // Dell platform answer (state.dellPlat) always overrides workload-based inference, matching
  // primaryPlatform()'s own precedence. Needed separately from primaryPlatform() because 'edge'
  // doesn't map to a `recommend()`-shaped platform at all — it needs recommendEdge() (access
  // switches, PoE, MC-LAG), a completely different input/engine, the same way the guided wizard's
  // `state.category === 'edge'` branch special-cases it.
  function primaryWorkload() {
    // 'virtualization' is the STICKY DEFAULT (multiDefault: ['virtualization']) — pre-checked
    // before the rep answers anything, so it stays in state.workloads unless explicitly
    // unclicked. It must rank LAST: it's a generic catch-all, not a real signal, and every OTHER
    // entry here (including 'edge', a genuinely specific one) is only present because the rep
    // deliberately clicked it. Ranking it above 'edge' meant clicking "Edge / campus / IoT"
    // without ALSO remembering to uncheck the untouched default silently produced a general
    // PowerEdge leaf-spine BOM instead of an edge/access one — the routing fix above is useless
    // if the priority order itself buries the one explicit signal under an unclicked default.
    const order = ['ai', 'nas', 'object', 'hci', 'block', 'edge', 'virtualization'];
    const dp = (state.dellPlat || []).filter(x => x !== 'none');
    if (dp.includes('poweredge-ai') || dp.includes('powerscale') || (dp.length && (C().platforms || []).find(p => p.id === dp[0]))) return null;
    const wl = state.workloads && state.workloads.length ? state.workloads : ['virtualization'];
    for (const w of order) if (wl.includes(w)) return w;
    return null;
  }
  function primaryPlatform() {
    const D = C().discovery;
    const dp = (state.dellPlat || []).filter(x => x !== 'none');
    if (dp.includes('poweredge-ai')) return 'poweredge-ai';
    if (dp.includes('powerscale')) return 'powerscale';
    if (dp.length && (C().platforms || []).find(p => p.id === dp[0])) return dp[0];
    const w = primaryWorkload();
    if (w) return D.workloads[w].platformSeed;
    return 'poweredge-general';
  }
  function composeGuidance() {
    const D = C().discovery, S = C().solutions || [];
    const vendor = D.competitors[state.vendor] || D.competitors.mixed;
    const workloads = (state.workloads && state.workloads.length) ? state.workloads : ['virtualization'];
    const pains = state.pains || [];
    const dellPlat = (state.dellPlat || []).filter(x => x !== 'none');
    const verity = S.find(x => x.id === 'verity');
    const verityOn = state.verity !== 'no';
    const tl = { now: 'Now / active project', quarter: 'This quarter', year: 'This year', explore: 'Just exploring' };
    return {
      headline: `Best-fit Dell value-add for a ${vendor.label} environment`,
      positioning: { vendorLabel: vendor.label, points: vendor.points },
      portfolio: workloads.map(w => ({ title: D.workloads[w].label, detail: D.workloads[w].recommendation })),
      messaging: pains.map(p => ({ pain: D.painPoints[p].label, point: D.painPoints[p].message })),
      management: (verityOn && verity) ? { title: `${verity.vendor} ${verity.name} — ${verity.tagline}`, oneLiner: verity.oneLiner, points: verity.talkingPoints } : null,
      attach: dellPlat.map(id => ({ platform: platLabel(id) })),
      openItems: assumptions.slice().concat([
        'Confirm exact NIC speeds & port counts per platform config',
        'Confirm orderable Dell SKUs' + (verityOn ? ' + Verity subscription sizing (BE Networks)' : '')
      ]),
      timeline: tl[state.timeline] || 'TBD'
    };
  }

  function finish() {
    try {
      const rec = (engine, input, opts) => { if (window.DesignIO) window.DesignIO.record(engine, input, opts || {}); };
      if (mode === 'express') {
        // Map the 5 answers → a full input with clearly-flagged smart defaults.
        const count = Math.max(1, parseInt(state.xCount, 10) || 12);
        const racks = state.xRacks === 'several' ? Math.max(2, Math.ceil(count / 16)) : 1;
        const primary = { servers: 'poweredge-general', block: 'powerstore', nas: 'powerscale', ai: 'poweredge-ai', mixed: 'poweredge-general' }[state.xConnect] || 'poweredge-general';
        const targets = [{ platformId: primary, units: count, gpusPerServer: state.xConnect === 'ai' ? 8 : undefined, modelId: state.xConnect === 'nas' ? 'f710' : null }];
        if (state.xConnect === 'mixed') targets.push({ platformId: 'powerstore', units: Math.max(1, Math.round(count / 4)) });
        assume('Express mode filled the rest with Dell-standard defaults: 25% growth headroom, in-rack DAC cabling, balanced (2:1) traffic, jumbo frames, and out-of-band management — open the full guide to fine-tune.');
        if (racks > 1) assume(`Spread across ${racks} racks (~16 units/rack) — each rack gets its own ToR pair + OOB switch.`);
        if (state.xConnect === 'mixed') assume('Storage kept on its own leaf switches, sharing one spine tier with compute (not converged onto the same switches) — the Dell-standard default for a mixed design. Open the full guide to choose a converged fabric instead.');
        const xInput = { targets, redundancy: state.xResilient, growthHeadroom: 0.25, includeMgmt: true,
          nos: 'sonic', stack: state.xConnect === 'ai' ? state.xStack : undefined,
          placement: 'in-rack', breakout: 'auto', trafficProfile: 'balanced', racks, leaf100: 'auto', leaf25: 'auto', aiTransport: 'roce' };
        rec('recommend', xInput, { verity: state.xDfm === 'yes' });
        const res = window.recommend(xInput);
        if (state.xDfm === 'yes') addVerity(res);
        decorate(res); window.UI.render(res, null);
        $('#wizard').hidden = true; $('#mode-chooser').hidden = false; return;
      }
      if (mode === 'refresh') {
        // R16: same translation shape as the main path's core question (state.core doubles as
        // whether+speed) — coreFarModel/coreFarPort are deliberately NOT collected here because
        // recommendRefresh's coreVendor machinery (unlike the main path's) doesn't read them; it
        // always uses pickCoreOptic's matched-both-ends pattern for a 'dell' far side.
        const rInput = { swCount: state.swCount, portsPer: state.portsPer, speedNow: state.speedNow,
          targetSpeed: state.targetSpeed, topologyNow: state.topologyNow, distribution: state.distribution, includeMgmt: state.oob !== 'no',
          includeCoreUplink: state.core && state.core !== 'none', coreSpeed: state.core,
          coreVendor: state.coreVendor || 'unsure', coreReach: state.coreReach === 'long' ? 'longreach' : 'auto' };
        rec('recommendRefresh', rInput, { verity: state.verity !== 'no' });
        const res = window.recommendRefresh(rInput);
        if (state.verity !== 'no') addVerity(res);
        decorate(res); window.UI.render(res, null);
        $('#wizard').hidden = true; $('#mode-chooser').hidden = false; return;
      }
      if (mode === 'discovery') {
        const guidance = composeGuidance();
        if (primaryWorkload() === 'edge') {
          // Edge/campus/IoT is NOT a `recommend()`-shaped target (no PowerEdge/PowerStore
          // platform involved) — it needs recommendEdge()'s own access-switch/PoE/MC-LAG BOM,
          // the same way the guided wizard's `state.category === 'edge'` branch below does.
          // Without this, the guidance text correctly talks up E3248PXE-ON/E3224F-ON but the
          // generated BOM silently fell through to a general PowerEdge leaf-spine build instead.
          const eInput = { endpoints: state.scale, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true };
          // Sweep finding #3 (2026-07-17, maintainer ruling): disclose, don't ask — Discovery is
          // a guidance/pitch tool, not a precision BOM builder, so this stays hardcoded, but the
          // rep must be told what was assumed rather than finding out only by comparing against
          // the Edge Form. Same assume() disclosure pattern Express mode already uses.
          assume('Edge sized with defaults: 1G PoE+ access, 100G uplinks, new redundant distribution pair — use the Edge Form for full control.');
          rec('recommendEdge', eInput, { verity: state.verity !== 'no', guidance });
          const res = window.recommendEdge(eInput);
          if (state.verity !== 'no') addVerity(res);
          decorate(res); window.UI.render(res, guidance);
          $('#wizard').hidden = true; $('#mode-chooser').hidden = false; return;
        }
        const pp = primaryPlatform();
        const modelId = pp === 'poweredge-ai' ? state.aiModelD : (pp === 'powerscale' ? state.nasModelD : null);
        const dInput = { platformId: pp, units: state.scale, redundancy: 'dual', growthHeadroom: 0.25, includeMgmt: true, stack: 'nvidia', gpusPerServer: 8, modelId: modelId || null,
          railNic: state.railSpeedD ? { speed: state.railSpeedD, model: state.railSpeedD === '800GbE' ? 'ConnectX-8' : 'ConnectX-7' } : null,
          nic2: state.nic2Spec === 'custom' ? { vendor: '', speed: state.nic2Speed || '', portsPerNic: state.nic2Ports, nicsPerUnit: state.nic2Count, network: state.nic2Network || 'storage' } : null,
          nic: { vendor: state.nicVendor, speed: state.nicSpeed, portsPerNic: state.nicPorts, nicsPerUnit: state.nicCount },
          placement: state.placement, structuredInPlace: state.structured === 'inplace', breakout: state.breakout,
          racks: state.racks, leaf100: state.leaf100, leaf25: state.leaf25,
          trafficProfile: state.traffic, speedRoadmap: state.roadmap, storageProtocol: state.storageProto || null };
        rec('recommend', dInput, { verity: state.verity !== 'no', guidance });
        const res = window.recommend(dInput);
        if (state.verity !== 'no') addVerity(res);
        decorate(res);
        window.UI.render(res, guidance);
      } else if (state.category === 'edge') {
        const eInput = { endpoints: state.units, poe: 'poe+', accessSpeed: '1g',
          edgeRedundancy: state.redundancy === 'single' ? 'single' : 'vlt-pair', distribution: 'new',
          nos: 'sonic', includeMgmt: state.oob !== 'no' };
        // Sweep finding #2 (2026-07-17, maintainer ruling): disclose, don't ask — the dedicated
        // Edge Form already gives full control over PoE class, access speed, uplink class, and
        // distribution reuse; the guided wizard's edge branch stays a fast/simplified path but
        // must SAY so, same as guidedPlatformId()'s 'Edge attach sized with a general access
        // profile' assumption already does for the platform choice. Same pattern Express uses.
        assume('Edge sized with defaults: 1G PoE+ access, 100G uplinks, new redundant distribution pair — use the Edge Form for full control.');
        rec('recommendEdge', eInput, {});
        const res = window.recommendEdge(eInput);
        decorate(res); window.UI.render(res, null);
        $('#wizard').hidden = true; $('#mode-chooser').hidden = false; return;
      } else {
        const t0model = state.category === 'ai' ? state.aiModel : (state.category === 'nas' ? state.nasModel : (state.category === 'hci' && state.hciFlavor === 'vxrail' ? state.vxrailModel : null));
        const nicObj = { vendor: state.nicVendor, speed: state.nicSpeed, portsPerNic: state.nicPorts, nicsPerUnit: state.nicCount };
        const targets = [{ platformId: guidedPlatformId(), units: state.units, gpusPerServer: state.gpus, modelId: t0model,
          // AI: rails NIC (CX-7 400G vs CX-8 800G) + explicit front-end/storage NIC opt-in;
          // second NIC type (mixed NICs in one host) gets its own fabric.
          // `cage` (R12): the NIC CONNECTOR, which picks MCP7Y00 vs MCP7Y10 — asked, never guessed.
          railNic: state.category === 'ai' && state.railSpeed ? { speed: state.railSpeed, model: state.railSpeed === '800GbE' ? 'ConnectX-8' : 'ConnectX-7', cage: state.railNicCage || null } : null,
          railNicCage: state.category === 'ai' ? (state.railNicCage || null) : null,
          nic: state.category === 'ai' ? (state.aiDataSpec === 'custom' ? nicObj : null) : null,
          nic2: state.nic2Spec === 'custom' ? { vendor: '', speed: state.nic2Speed || '', portsPerNic: state.nic2Ports, nicsPerUnit: state.nic2Count, network: state.nic2Network || 'storage' } : null }];
        // any target still mid-flow (user never reached / answered 'secondMore') is committed here too
        commitCurrentExtraTarget();
        (state.extraTargets || []).forEach(et => targets.push({
          platformId: et.platformId, units: et.units, gpusPerServer: et.gpusPerServer, modelId: et.modelId, railNic: et.railNic, nic: et.nic
        }));
        const gInput = {
          targets,
          redundancy: state.redundancy, growthHeadroom: parseFloat(state.growth), includeMgmt: state.oob !== 'no',
          nos: 'sonic', stack: state.stack, fabricArchitecture: state.fabricArch || 'sharedSpine',
          placement: state.placement, structuredInPlace: state.structured === 'inplace', breakout: state.breakout,
          racks: state.racks, leaf100: state.leaf100, leaf25: state.leaf25, aiTransport: state.aiTransport || 'roce',
          trafficProfile: state.traffic, speedRoadmap: state.roadmap, storageProtocol: state.storageProto || null, fabricInterconnect: state.fabStyle || 'mclag',
          deployType: state.deployType, reuseExistingSpine: state.existingReuse === 'reuse',
          nic: { vendor: state.nicVendor, speed: state.nicSpeed, portsPerNic: state.nicPorts, nicsPerUnit: state.nicCount },
          includeCoreUplink: state.core && state.core !== 'none', coreSpeed: state.core, coreCount: 2, borderLeaf: state.borderLeaf === 'yes',
          uplinkTarget: state.uplinkTarget,
          // R14 Slice 4: coreDistance is the single merged wizard question; map its one answer
          // onto BOTH engine fields consistently (mapping per docs/R14-WORKORDER.md M4).
          coreType: state.coreDistance === 'offsite' ? 'dci' : 'core',
          coreVendor: state.coreVendor || 'unsure',
          coreReach: (state.coreDistance === 'building' || state.coreDistance === 'offsite') ? 'longreach' : 'auto',
          coreFarModel: (state.coreFarModel && state.coreFarModel !== 'unknown') ? state.coreFarModel : null,
          coreFarPort: (state.coreVendor === 'dell' && state.coreFarModel === 'unknown')
            ? (state.coreFarPort === 'smf' ? { media: 'SMF', connector: 'LC' } : state.coreFarPort === 'mmf' ? { media: 'MMF', connector: 'MPO' } : state.coreFarPort === 'dac' ? { media: 'DAC', connector: 'DAC' } : 'unknown')
            : undefined
        };
        rec('recommend', gInput, { verity: state.verity === 'yes' });
        const res = window.recommend(gInput);
        if (state.verity === 'yes') addVerity(res);
        decorate(res);
        window.UI.render(res, null);
      }
      $('#wizard').hidden = true; $('#mode-chooser').hidden = false;
    } catch (e) { alert('Could not build recommendation: ' + e.message); console.error(e); }
  }

  window.Wizard = { start, wire, _test: { setState: (s, a) => { state = s; assumptions = a || []; }, compose: composeGuidance, guidedPlatformId, primaryPlatform, primaryWorkload, addVerity } };
})();
