/* =============================================================================
 * DISCOVERY KNOWLEDGE  --  powers the customer-meeting "Discovery" journey
 * -----------------------------------------------------------------------------
 * Plain-language, value-first. Enough to sound like you know the space — NOT an
 * engineering deep-dive (that lives in the Checks tab). Edit freely as your
 * positioning evolves.
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

window.CATALOG.discovery = {

  /* Incumbent network vendor -> honest, value-based displacement angle */
  competitors: {
    cisco:   { label: 'Cisco (Nexus / ACI)', points: [
      'Open alternative to proprietary ACI licensing — Dell PowerSwitch + Enterprise SONiC avoids lock-in',
      'Strong price/performance and a simpler operating model with Dell Fabric Manager (DFM, formerly Verity)',
      'One vendor for compute, storage, and network — plus a validated NVIDIA AI Factory story' ] },
    arista:  { label: 'Arista (EOS)', points: [
      'Competitive price/performance with the choice of open SONiC (not a single proprietary OS)',
      'Full-stack Dell: network + PowerStore/PowerScale/PowerEdge from one partner',
      'Dell Fabric Manager (DFM) gives cloud-style automation without building it yourself' ] },
    juniper: { label: 'Juniper (Apstra / Junos)', points: [
      'Open networking with Dell Enterprise SONiC; Dell Fabric Manager (DFM) delivers intent-based automation',
      'Single-vendor full stack and a clear AI-fabric path with NVIDIA Spectrum-X' ] },
    aruba:   { label: 'HPE / Aruba', points: [
      'Dell full-stack alternative — network, storage, and servers aligned',
      'Open SONiC + Dell Fabric Manager (DFM) for cloud-scale operations; strong AI Factory positioning' ] },
    dell:    { label: 'Dell (existing install base)', points: [
      'Natural refresh/expansion to 25/100/400G and a move to open Enterprise SONiC',
      'Add Dell Fabric Manager (DFM) to modernize day-to-day operations',
      'Layer in an AI-ready Spectrum-X fabric as GPU workloads arrive' ] },
    greenfield: { label: 'Greenfield / net-new', points: [
      'Design clean and open from day 0 — Dell SONiC + Dell Fabric Manager (DFM) zero-touch provisioning',
      'AI-ready from the start with the Dell AI Factory reference architectures' ] },
    mixed:   { label: 'Mixed / multi-vendor', points: [
      'Consolidate onto one operating model — Dell Fabric Manager (DFM) is vendor-agnostic and gives a single pane of glass',
      'Graceful, low-risk migration path onto open Dell SONiC over time' ] }
  },

  /* Growing workload -> plain recommendation + which platform seeds a starting BOM */
  workloads: {
    virtualization: { label: 'Virtualization / general compute',
      recommendation: '25G top-of-rack (S5248F-ON) with a 100G spine (Z9432F-ON) — the modern standard for VMs and mixed workloads.',
      platformSeed: 'poweredge-general' },
    block: { label: 'Block storage',
      recommendation: 'A redundant 25G leaf pair (S5248F-ON) tuned for storage — resilient and low-latency (PowerStore / PowerFlex / PowerMax).',
      platformSeed: 'powerstore' },
    nas: { label: 'Unstructured data / NAS / AI data lake',
      recommendation: '100G front-end plus a dedicated back-end (S5232F-ON) — scales for PowerScale and AI data pipelines.',
      platformSeed: 'powerscale' },
    object: { label: 'Object / S3 storage',
      recommendation: 'A dual-network design — public front-end + a dedicated private back-end (S5248F-ON) — for Dell ObjectScale at cloud scale.',
      platformSeed: 'objectscale' },
    hci: { label: 'Hyperconverged / Azure Local',
      recommendation: 'A redundant 25/100G RDMA (RoCEv2) ToR pair from the Microsoft-approved switch list for Dell APEX Cloud Platform / Azure Local.',
      platformSeed: 'apex-hci' },
    ai: { label: 'AI / GPU',
      recommendation: 'A rail-optimized NVIDIA Spectrum-X fabric (SN5600 / SN5610) — the Dell AI Factory networking, purpose-built for GPU clusters.',
      platformSeed: 'poweredge-ai' },
    edge: { label: 'Edge / campus / IoT',
      recommendation: 'Edge and access switches (E3248PXE-ON with 90W PoE, E3224F-ON for non-redundant deployments) for modern edge and IoT.',
      platformSeed: 'poweredge-general' }
  },

  /* Pain point -> the value message to lead with (business language) */
  painPoints: {
    performance: { label: 'Performance / bandwidth bottlenecks',
      message: 'Move to 25/100/400G to clear bottlenecks and be ready for AI traffic.' },
    cost:        { label: 'Cost / TCO',
      message: 'Open networking (Dell Enterprise SONiC) plus Dell Fabric Manager (DFM, formerly Verity) delivers cloud-scale economics vs. proprietary licensing.' },
    complexity:  { label: 'Operational complexity',
      message: 'Dell Fabric Manager (DFM)’s single pane of glass and zero-touch provisioning cut deployment time and day-to-day effort.' },
    lockin:      { label: 'Vendor lock-in',
      message: 'Open SONiC plus vendor-agnostic Dell Fabric Manager (DFM) means a graceful path off proprietary gear — no lock-in.' },
    aiReady:     { label: 'AI readiness',
      message: 'The Dell AI Factory with NVIDIA gives a validated, rail-optimized Spectrum-X fabric for GenAI.' },
    support:     { label: 'Support / skills gap',
      message: 'One partner (Dell) for compute, storage, and network — with Dell Fabric Manager (DFM) reducing the skills burden.' }
  }
};
