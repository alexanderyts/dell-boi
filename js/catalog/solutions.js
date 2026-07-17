/* =============================================================================
 * SOLUTION ADD-ONS  --  value-add layers that ride on top of the hardware BOM
 * -----------------------------------------------------------------------------
 * These are the "management conversation" pieces — business-level value, not
 * packet engineering. Currently: BE Networks Verity (IBN for Dell Ent SONiC).
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

window.CATALOG.solutions = [
  {
    id: 'verity',   // internal id kept for compatibility — the offering is now DFM
    vendor: 'Dell (powered by BE Networks)',
    name: 'Dell Fabric Manager (DFM)',
    tagline: 'Automation · Observability · AIOps for Dell Enterprise SONiC (formerly Verity / Satori / SensAI)',
    category: 'Management & Automation',
    // Plain-language, management-level talking points (say these out loud in a meeting):
    oneLiner: 'One platform to build, see, and stay ahead of the whole Dell SONiC fabric — Automation, Observability, and AIOps in a single console.',
    talkingPoints: [
      'AUTOMATION (was Verity): intent-based — ZTP day 0, orchestrated SONiC upgrades day 2 (no maintenance window), Time Traveler config rollback, continuous drift detection vs the design',
      'Network as code: REST OpenAPI, Terraform, Ansible, NetBox source-of-truth sync — the fabric stops being tribal knowledge',
      'OBSERVABILITY (was Satori): streaming telemetry into automated dashboards — one view, not one per switch; ML-learned thresholds alarm on real deviation, not noise',
      'AIOPS (was SensAI): ask the network questions in plain language, get proactive insights + likely root cause, and guided remediation workflows',
      'Graceful, low-risk migration off legacy/proprietary gear onto open Dell SONiC — proven in production (EXEO Group telecom fabric; IREN AI factory with NVIDIA)',
      'Covers the full PowerSwitch SONiC portfolio — 1G edge PoE through Z9864F 800G AI fabrics (RoCEv2-aware)'
    ],
    // When to lead with it in discovery (maps to pain-point ids):
    fitsPains: ['complexity', 'lockin', 'support', 'cost'],
    // Optional BOM line when the rep chooses to attach it:
    bomLine: {
      category: 'Software', vendor: 'Dell (BE Networks)',
      item: 'Dell Fabric Manager (DFM) — Automation + Observability + AIOps (subscription)',
      model: 'Dell Fabric Manager (DFM)', qty: 1,
      dellPN: 'per DFM quote', verify: true, specConfirmed: false,
      note: 'Fabric lifecycle platform for Dell Enterprise SONiC (formerly Verity/Satori/SensAI) — size/subscribe per quote',
      source: 'BE Networks Dell SONiC page (be-net.com/dell, 2026) — corpus/MG-DFM-BENET.txt'
    },
    source: 'BE Networks Dell SONiC page + Verity 6.6 documentation (be-net.com, 2026)'
  }
];
