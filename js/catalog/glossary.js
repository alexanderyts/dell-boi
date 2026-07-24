/* =============================================================================
 * GLOSSARY  --  plain-English tooltips for technical terms, everywhere they
 * appear (Checks, BOM notes, wizard questions, guidance). Business-first: one
 * or two sentences, no jargon-defining-jargon. Hover any dotted-underline term.
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

window.CATALOG.glossary = {
  'MC-LAG': 'Two switches teamed to act like ONE switch — if either fails, traffic keeps flowing. The modern replacement for "stacking", but each switch keeps its own brain (a software fault can\'t take down both).',
  'ICL': 'Inter-Chassis Link — the short cables joining the two switches of a pair so they can act as one. Think of it as the handshake cable.',
  'peer-link': 'The short cables joining the two switches of a redundant pair so they can act as one logical switch.',
  'VLT': 'Dell\'s older (OS10) version of switch pairing — two switches acting as one. Same idea as MC-LAG. New quotes don\'t use this — OS10 is end of sale; VLT only shows up describing a customer\'s EXISTING switches.',
  'VLTi': 'The connecting cables for a VLT switch pair (same job as an ICL).',
  'Dell Enterprise SONiC': 'The network operating system every new Dell switch in this tool runs. Open, Dell-supported, and what Dell Fabric Manager (DFM) manages.',
  'SmartFabric OS10': 'Dell\'s older switch operating system. End of sale — no longer quoted on new switches; it only appears here describing a customer\'s existing gear.',
  'NVIDIA Cumulus Linux': 'NVIDIA\'s own operating system for its Spectrum switches. Different company, different software than Dell\'s SONiC — Dell Fabric Manager doesn\'t manage it.',
  'NVIDIA Pure SONiC': 'A free, community-built version of SONiC that NVIDIA also offers for its switches. Despite the shared name "SONiC," this is NOT Dell\'s SONiC and isn\'t managed by Dell Fabric Manager.',
  'Dell SONiC on Spectrum': 'A small number of NVIDIA switch models (SN5600, SN5610, SN2201) can also run Dell\'s own SONiC instead of NVIDIA\'s software — meaning Dell Fabric Manager can manage them too. Marked "verify" because Dell hasn\'t yet added these models to its official compatibility list, even though Dell\'s own documentation describes the setup.',
  'LACP': 'An industry standard that bundles several cables into one bigger, self-healing pipe. Both ends actively check the bundle, so a bad link is detected and dropped automatically.',
  'MPIO': 'Multipathing — the storage driver\'s own load balancing. It spreads traffic across all available paths and fails over by itself; the switches don\'t need to be teamed.',
  'multipathing': 'The storage driver\'s own load balancing — it spreads traffic across all available paths and fails over automatically.',
  'leaf-spine': 'The standard modern data-center layout: "leaf" switches connect the servers, "spine" switches connect the leaves. Need more ports? Add leaves. Need more bandwidth? Add spines.',
  'spine': 'The upper switch layer that ties all the leaf switches together. Every leaf connects to every spine.',
  'leaf': 'A switch that servers and storage plug into directly (usually top of the rack).',
  'ToR': 'Top-of-Rack — a switch that lives in the same rack as the gear it connects.',
  'uplink': 'A connection going "up" from a switch toward the next layer (leaf to spine, or fabric to core).',
  'oversubscription': 'How much the network is overbooked, like airline seats. 2:1 means servers could push twice what the uplinks can carry at once. Lower ratio = faster under load, higher cost.',
  'non-blocking': 'Zero overbooking (1:1) — every device can run at full speed at the same time. Mandatory for AI clusters and RDMA storage.',
  'breakout': 'Splitting one high-speed port into several slower ones using a fan-out cable — e.g. one 400G port becomes four 100G links. Stretches expensive ports further.',
  'DAC': 'Direct Attach Copper — a short, cheap copper cable with the plugs built in. The go-to for connections inside one rack (up to ~3–5 m).',
  'AOC': 'Active Optical Cable — a fiber cable with the plugs permanently attached. For runs between nearby racks (up to ~30 m).',
  'transceiver': 'A small plug-in module that converts a switch port to fiber. Used with structured cabling for longer runs.',
  'optic': 'A plug-in fiber module for a switch port (used for longer distances than copper cables allow).',
  'EVPN-MH': 'EVPN Multihoming — lets a server connect to two switches at once WITHOUT those switches needing a peer-link. The fabric itself coordinates the redundancy.',
  'EVPN': 'The control system of a modern fabric — it teaches every switch where every device lives, so traffic takes the best path.',
  'VXLAN': 'A tunneling technique that lets networks stretch anywhere across the fabric — like giving VLANs a passport.',
  'BGP': 'The routing protocol that runs the internet — also the backbone protocol inside modern data-center fabrics. Extremely proven and scalable.',
  'ECMP': 'Equal-Cost Multi-Path — traffic automatically spreads across all available paths instead of piling onto one.',
  'RoCE': 'RDMA over Ethernet — servers move data directly between each other\'s memory across the network. Extremely fast, but the network must be configured "lossless" or performance collapses.',
  'RoCEv2': 'RDMA over Ethernet (v2) — direct memory-to-memory transfers between servers. Needs a lossless-configured network.',
  'Ultra Ethernet': 'The open, multi-vendor standard (UEC 1.0, 2025) for AI/HPC networks. Unlike RoCEv2, it sprays each flow across ALL paths at once, so GPU traffic never bottlenecks on one link. Runs on the same Dell Z-series switches; needs UEC-capable NICs.',
  'UEC': 'Ultra Ethernet Consortium — the group (Broadcom, AMD, Intel, Meta, Microsoft, Oracle…) behind the open Ultra Ethernet transport for AI fabrics; an alternative to NVIDIA\'s Spectrum-X.',
  'RDMA': 'Remote Direct Memory Access — one server reads/writes another\'s memory directly, skipping most of the software stack. The speed behind AI and high-end storage.',
  'PFC': 'Priority Flow Control — a pause signal that stops packet loss for chosen traffic types. A key ingredient of a "lossless" network.',
  'ECN': 'Explicit Congestion Notification — an early-warning tag that tells senders to slow down BEFORE packets get dropped.',
  'DCQCN': 'The congestion-control recipe for RDMA traffic (built on PFC + ECN). Keeps the fast lane fast.',
  'lossless': 'A network tuned so the important traffic never gets dropped, using pause/slow-down signals (PFC/ECN). Required for RDMA and AI.',
  'jumbo frames': 'Bigger envelopes per packet (9216 bytes instead of 1500) — fewer envelopes to process means better storage performance.',
  'MTU': 'The maximum packet size. 9216 ("jumbo") is Dell\'s recommendation for storage and AI traffic.',
  'iSCSI': 'Block storage over ordinary Ethernet using TCP — the long-standing standard.',
  'NVMe/TCP': 'The modern block-storage protocol — NVMe speed over ordinary Ethernet. The recommended default for new deployments.',
  'NVMe-oF': 'NVMe over Fabrics — running flash-storage commands across a network instead of inside one server.',
  'OOB': 'Out-Of-Band management — a small, separate network just for controlling devices. Like a building\'s service entrance: always reachable even when the main doors jam.',
  'iDRAC': 'Dell\'s built-in remote-control chip in every server — reachable even when the server is off.',
  'BMC': 'The remote-control chip in a server (Dell\'s is called iDRAC) — used for out-of-band management.',
  'SONiC': 'The open-source network operating system born at Microsoft, hardened and supported by Dell (Enterprise SONiC). Runs Dell PowerSwitch fabrics.',
  'Cumulus': 'NVIDIA\'s network operating system — what NVIDIA Spectrum switches run.',
  'NOS': 'Network Operating System — the software a switch runs (like Windows for a PC).',
  'rail-optimized': 'The AI wiring pattern: each GPU\'s network port ("rail") gets its own path through the fabric, so GPUs talk to each other with zero contention.',
  'rail': 'One GPU\'s dedicated network connection in an AI cluster (one rail per GPU).',
  'SPOF': 'Single Point Of Failure — one component whose failure takes everything down. The thing redundant designs eliminate.',
  'folded Clos': 'A space-saving version of leaf-spine where a switch splits its ports half-down (to servers) and half-up (to spines) so nothing is overbooked.',
  'super-spine': 'A third switch layer added when a fabric outgrows two layers (roughly beyond ~2,000 GPUs).',
  'MPO': 'A multi-fiber connector used by high-speed optics (the wide, flat fiber plug). MPO-12 carries 12 fibers (100G SR4); MPO-16 carries 16 (400/800G SR8).',
  'MTP': 'A premium, higher-performance version of the MPO multi-fiber connector (same idea, tighter tolerances).',
  'AEC': 'Active Electrical Cable — copper with a tiny chip that boosts the signal, reaching ~3–7m: further than passive DAC, thinner, and lower-power than optical.',
  'trunk': 'The multi-fiber "backbone" cable that runs between patch panels in a structured fiber plant — it never plugs straight into a switch.',
  'cassette': 'A small module in a patch panel that splits a multi-fiber trunk (MPO) out into the individual LC connectors that plug into switches and servers.',
  'patch panel': 'A rack-mounted frame that holds the fiber cassettes — the tidy meeting point between the building\'s fiber and your switches.',
  'patch cord': 'A short fiber cable from a device to the patch panel (the last hop at each end).',
  'UPC': 'A fiber connector polish (flat, blue) used on multimode fiber. Do NOT mix with APC on the same link.',
  'APC': 'A fiber connector polish (angled, green) used on single-mode fiber for longer runs. Do NOT mix with UPC on the same link.',
  'OM4': 'A common multimode fiber grade for in-building runs up to ~100m (aqua-jacketed).',
  'OS2': 'Single-mode fiber for long runs — across a campus or between sites (yellow-jacketed).',
  'LPO': 'Linear Pluggable Optics — a newer, lower-power optic that offloads signal processing to the switch chip. Emerging for short AI links (2027–28).',
  'SFSS': 'Dell SmartFabric Storage Software — automates the "phone book" for NVMe/TCP so hosts find storage automatically.',
  'SET': 'Switch-Embedded Teaming — Microsoft\'s NIC teaming for Azure Local/Hyper-V. Switch-independent: the switches don\'t need to be paired for it.',
  'DPU': 'Data Processing Unit — a smart NIC with its own processor that offloads networking/storage/security work from the server CPU (Dell sells NVIDIA BlueField).',
  'SuperNIC': 'NVIDIA\'s AI-optimized network card (ConnectX-8, 800G) — purpose-built for GPU-to-GPU traffic.',
  'anycast gateway': 'The same gateway address exists on every leaf switch, so virtual machines can move anywhere without reconfiguration.',
  'MC-LAG ICL': 'The cables joining a switch pair so they act as one logical switch (Inter-Chassis Link).',
  'air-gapped': 'Physically separate with no connecting link — two independent networks that share no failure point.',
  'switch-dependent': 'A teaming mode where the SWITCHES must cooperate (be paired as MC-LAG) — used with LACP bonds.',
  'switch-independent': 'A teaming mode the server handles alone — the switches need no special pairing. Used with storage multipathing.',
  'port-channel': 'Several physical links configured to act as one logical link on the switch side (the switch half of an LACP bond).',
  'incast': 'Many devices sending to one target at once — like everyone merging into one lane. Storage rebuilds cause it; deep-buffer switches absorb it.',
  'Verity': 'BE Networks' + String.fromCharCode(39) + 's management software for Dell Enterprise SONiC — one console to deploy, monitor and update every switch, with zero-touch provisioning and drift detection.',
  'ZTP': 'Zero-Touch Provisioning — a switch configures itself from the network when first powered on. No console cable, no truck roll.'
};

/* Apply tooltips: walks text nodes in a container, wraps the FIRST occurrence of
 * each known term (longest-first, word-boundary, case-insensitive) in a dotted
 * hover span. Skips links/buttons/inputs/SVG and already-glossed text. */
(function () {
  const terms = Object.keys(window.CATALOG.glossary).sort((a, b) => b.length - a.length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const rx = new RegExp('\\b(' + terms.map(esc).join('|') + ')\\b', 'i');
  const SKIP = { A: 1, BUTTON: 1, SELECT: 1, OPTION: 1, INPUT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1, svg: 1, SVG: 1 };

  function apply(container) {
    if (!container) return;
    const seen = {};
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        let p = n.parentNode;
        while (p && p !== container) { if (SKIP[p.nodeName] || (p.classList && p.classList.contains('gloss')) || p.namespaceURI === 'http://www.w3.org/2000/svg') return NodeFilter.FILTER_REJECT; p = p.parentNode; }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      let text = node.nodeValue, m, idx = 0, frag = null;
      while ((m = rx.exec(text.slice(idx)))) {
        const key = terms.find(t => t.toLowerCase() === m[1].toLowerCase());
        if (seen[key]) { idx += m.index + m[1].length; continue; }
        seen[key] = true;
        frag = frag || document.createDocumentFragment();
        const at = idx + m.index;
        frag.appendChild(document.createTextNode(text.slice(0, at)));
        const span = document.createElement('span');
        span.className = 'gloss'; span.title = window.CATALOG.glossary[key];
        span.textContent = text.slice(at, at + m[1].length);
        frag.appendChild(span);
        text = text.slice(at + m[1].length); idx = 0;
      }
      if (frag) { frag.appendChild(document.createTextNode(text)); node.parentNode.replaceChild(frag, node); }
    });
  }
  window.Glossary = { apply };
})();
