/* =============================================================================
 * SWITCH CATALOG  --  Dell PowerSwitch + NVIDIA Spectrum (through Dell)
 * -----------------------------------------------------------------------------
 * ALIGNED TO: Dell Networking Quick Reference Guide, June 2026, v2.1
 *   (dell-networking-quick-reference-guide.pdf, in this folder)
 *   Extracted with `pdftotext -table` and cross-checked against ASIC math.
 *
 * TWO-STAGE ACCURACY MODEL:
 *   specConfirmed:true  = port map + switching capacity CONFIRMED from the guide.
 *   verify:true         = orderable Dell SKU still pending lookup in Dell's
 *                         ordering tools (guide gives models, not SKUs).
 *
 * FIELDS:
 *   switchingCapacity   = published switching capacity. CONVENTION: Dell PowerSwitch
 *                         spec sheets publish FULL-DUPLEX (Tx+Rx) figures; NVIDIA Spectrum
 *                         spec sheets publish the single-direction/aggregate figure. Each
 *                         value here matches ITS OWN vendor's spec sheet (verified 0.18.x).
 *   portsBySpeed        = MAX HW-supportable ports at each speed (breakout modes;
 *                         SW support varies by OS). This is the multi-rate map.
 *   access / uplink     = the engine's default native config for sizing.
 *
 * OS: PowerSwitch = "Enterprise SONiC Distribution by Dell Technologies; Dell
 *     SmartFabric OS10". Spectrum = "NVIDIA Cumulus Linux / SONiC".
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

const GUIDE = 'Dell Networking Quick Reference Guide, June 2026 v2.1 (spec confirmed; SKU pending)';

window.CATALOG.switches = [
  /* ==================== S-SERIES — 25G ToR / compute & storage leaf ========= */
  {
    id: 's5212f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S5212F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident3-X5',
    formFactor: '1U compact', rackU: 1, roles: ['leaf', 'tor'], switchingCapacity: '2.16 Tbps',
    access: { count: 12, speed: '25GbE', media: 'SFP28' },
    uplink: { count: 3, speed: '100GbE', media: 'QSFP28' },
    portsBySpeed: { '25G': '12 + 12 (breakout)', '50G': '6 (breakout)', '40G': '3', '100G': '3' },
    breakout: '100G→4x25G/10G on QSFP28', useCase: 'Small 25GbE ToR / storage attach',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 's5224f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S5224F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident3-X5',
    formFactor: '1U', rackU: 1, roles: ['leaf', 'tor'], switchingCapacity: '2.16 Tbps',
    access: { count: 24, speed: '25GbE', media: 'SFP28' },
    uplink: { count: 4, speed: '100GbE', media: 'QSFP28' },
    portsBySpeed: { '25G': '24 + 16 (breakout)', '50G': '8 (breakout)', '40G': '4', '100G': '4' },
    breakout: '100G→4x25G/10G on QSFP28', useCase: 'Mid-density 25GbE ToR / storage attach',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 's5248f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S5248F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident3-X7',
    formFactor: '1U', rackU: 1, roles: ['leaf', 'tor'], switchingCapacity: '4.0 Tbps',
    access: { count: 48, speed: '25GbE', media: 'SFP28' },
    uplink: { count: 6, speed: '100GbE', media: 'QSFP28' }, // up to 8x100G via 2x QSFP28-DD breakout
    portsBySpeed: { '25G': '48 + 32 (breakout)', '100G': '4 + 4 (breakout) = up to 8' },
    breakout: '100G→4x25G/10G on QSFP28 uplinks',
    useCase: 'High-density 25GbE server/storage ToR with 100G uplinks (most common leaf)',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 's5296f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S5296F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident3-X7',
    formFactor: '2U', rackU: 2, roles: ['leaf', 'tor'], switchingCapacity: '6.4 Tbps',
    access: { count: 96, speed: '25GbE', media: 'SFP28' },
    uplink: { count: 8, speed: '100GbE', media: 'QSFP28' },
    portsBySpeed: { '25G': '96 + 32 (breakout)', '100G': '8' },
    breakout: '100G→4x25G/10G on QSFP28 uplinks',
    useCase: 'Very high-density 25GbE ToR (2U), consolidated racks',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 's5232f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S5232F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident3-X7',
    formFactor: '1U', rackU: 1, roles: ['leaf', 'spine'], switchingCapacity: '6.4 Tbps',
    access: { count: 32, speed: '100GbE', media: 'QSFP28' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '25G': '124 (breakout) + 2', '40G': '32', '100G': '32' },
    breakout: '100G→4x25G/10G (up to 128x25G) — flexible 100G leaf or small spine',
    useCase: '100GbE leaf/spine; breakout to 25G for high server density',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'z9264f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'Z9264F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Tomahawk-2',
    formFactor: '2U', rackU: 2, roles: ['leaf', 'spine'], switchingCapacity: '12.8 Tbps',
    access: { count: 64, speed: '100GbE', media: 'QSFP28' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '25G': '256 (breakout)', '40G': '64', '100G': '64' },
    breakout: '100G→4x25G/10G — high-density 100G QSFP28 leaf or mid-size spine',
    useCase: 'Dense 100GbE QSFP28 leaf (64 ports, standard QSFP28 optics/DACs — an alternative to the S5448F when SFP56-DD PAM4 access is not wanted) or 100G spine',
    dellPN: 'verify', verify: true, specConfirmed: true,
    source: 'Dell PowerSwitch Z9264F-ON spec sheet + BE Networks Dell SONiC page (64×100GbE QSFP28, 2026)'
  },
  {
    id: 's5448f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S5448F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident4-X9',
    formFactor: '1U', rackU: 1, roles: ['leaf', 'tor', 'spine'], switchingCapacity: '16 Tbps',
    access: { count: 48, speed: '25/50/100GbE', media: 'SFP56-DD' },
    uplink: { count: 8, speed: '400GbE', media: 'QSFP56-DD' },
    portsBySpeed: { '25G': '48 + 24 (breakout)', '50G': '48 + 24 (breakout)', '100G': '48 (SFP56-DD)', '400G': '8 (QSFP56-DD)' },
    breakout: 'High-radix Trident4: 48x100G (SFP56-DD, down to 25/50G) + 8x400G uplinks. NOTE (spec sheet): the 100G ports are SFP56-DD PAM4 (2x50G) — QSFP28 optics & breakout will NOT work on them',
    useCase: 'Newest high-density ToR — 100G access with 400G uplinks; strong AI-storage leaf',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },

  /* ==================== S-SERIES — 10G ToR ================================= */
  {
    id: 's4348f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S4348F-ON',
    os: 'Enterprise SONiC (Dell)', npu: 'Broadcom Trident3-X5',
    formFactor: '1U', rackU: 1, roles: ['leaf', 'tor'], switchingCapacity: '2.16 Tbps',
    access: { count: 48, speed: '10GbE', media: 'SFP+' },
    uplink: { count: 6, speed: '100GbE', media: 'QSFP28' },
    portsBySpeed: { '1G': '48 (SFP)', '10G': '48 + 12 (breakout)', '25G': '12 (breakout)', '40G': '6', '100G': '6 (QSFP28)' },
    breakout: '100G→4x25G / 40G→4x10G on QSFP28; the 48 SFP+ ports also take 1G SFP',
    useCase: '10GbE fiber server/storage ToR with 100G uplinks — the current-gen replacement for the end-of-sale S41xx series',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    // END OF SALE — kept for brownfield recognition only (a customer may still run these);
    // nothing in the engine selects it for a new BOM anymore. Replacement: S4348F-ON above.
    id: 's4148f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S4148F-ON', eol: true,
    os: 'SmartFabric OS10', npu: 'Broadcom Maverick',
    formFactor: '1U', rackU: 1, roles: ['leaf', 'tor'], switchingCapacity: '1.76 Tbps',
    access: { count: 48, speed: '10GbE', media: 'SFP+' },
    uplink: { count: 6, speed: '40/100GbE', media: 'QSFP28' },
    portsBySpeed: { '10G': '48 + 24 (breakout)', '25G': '16 (breakout)', '40G': '4 + 2 (QSFP+)', '100G': '4' },
    breakout: '100G→4x25G or 40G→4x10G on QSFP28',
    useCase: 'END OF SALE (S41xx series) — do not quote; replaced by S4348F-ON (Enterprise SONiC)',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 's4348t-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S4348T-ON',
    os: 'Enterprise SONiC (Dell)', npu: 'Broadcom Trident3-X5',
    formFactor: '1U', rackU: 1, roles: ['leaf', 'tor', 'access'], switchingCapacity: '2.16 Tbps',
    access: { count: 48, speed: '1/10GBase-T', media: 'RJ45' },
    uplink: { count: 6, speed: '100GbE', media: 'QSFP28' },
    portsBySpeed: { '1/10G-BaseT': '48', '25G': '12 (breakout)', '40G': '6', '100G': '6' },
    breakout: '100G→4x25G', useCase: 'Copper (RJ45) 1/10G ToR with 100G uplinks (25G via breakout)',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },

  /* ==================== Z-SERIES / AI-FABRIC ETHERNET (Broadcom) — SPINE ==== */
  {
    id: 'z9432f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'Z9432F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident4-X11',
    formFactor: '1U (EIA)', rackU: 1, roles: ['spine', 'leaf'], switchingCapacity: '25.6 Tbps',
    access: { count: 32, speed: '400GbE', media: 'QSFP-DD' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '10G': '144 (breakout) + 2', '25G': '144 (breakout)', '40G': '64 (breakout)', '50G': '128 (breakout) + 16 (QSA)', '100G': '128 (breakout)', '200G': '64 (breakout)', '400G': '32 (QSFP-DD)' },
    breakout: '400G→4x100G/2x200G; 128x100G — 12.8T, 1U',
    useCase: '1U 400GbE spine (also 100G aggregation via breakout); iSCSI opt + FSB',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'z9664f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'Z9664F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Tomahawk 4',
    formFactor: '2U (EIA)', rackU: 2, roles: ['spine'], switchingCapacity: '51.2 Tbps',
    access: { count: 64, speed: '400GbE', media: 'QSFP-DD' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '10G': '256 (breakout) + 2', '25G': '256 (breakout)', '40G': '128 (breakout)', '50G': '128 (breakout)', '100G': '256 (breakout)', '200G': '128 (breakout)', '400G': '64 (QSFP-DD)' },
    breakout: '400G→4x100G; up to 256x100G — 25.6T, 2U',
    useCase: 'High-radix 400GbE spine (iSCSI optimization + FSB)',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'z9864f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'Z9864F-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Tomahawk 5',
    formFactor: '2U (EIA)', rackU: 2, roles: ['spine'], switchingCapacity: '102.4 Tbps',
    access: { count: 64, speed: '800GbE', media: 'OSFP112' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '100G': '320 (breakout)', '200G': '256 (breakout)', '400G': '128 (breakout)', '800G': '64 (OSFP112)' },
    breakout: '800G→2x400G; 128x400G — 51.2T, 2U',
    useCase: '800GbE spine for large AI / high-bandwidth fabrics',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'z9964f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'Z9964F-ON',
    os: 'Enterprise SONiC (Dell)', npu: 'Broadcom Tomahawk 6',
    formFactor: '3U (EIA)', rackU: 3, roles: ['spine'], switchingCapacity: '204.8 Tbps',
    access: { count: 64, speed: '1.6TbE', media: 'OSFP224' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '100G': '512 (breakout)', '200G': '512 (breakout)', '400G': '256 (breakout)', '800G': '128 (breakout)', '1.6T': '64 (OSFP224)' },
    breakout: '1.6T→2x800G; 128x800G — 102.4T, 3U (Z9964FL-ON = 2U ORv3 variant, same capacity)',
    useCase: 'Flagship 102.4T spine for the largest AI fabrics',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },

  /* ==================== NVIDIA SPECTRUM ETHERNET (via Dell) — AI east-west == */
  {
    id: 'sn4700', vendor: 'NVIDIA (via Dell)', line: 'Spectrum', model: 'SN4700',
    os: 'NVIDIA Cumulus Linux / SONiC', npu: 'NVIDIA Spectrum-3',
    formFactor: '1U (EIA)', rackU: 1, roles: ['leaf', 'spine'], switchingCapacity: '12.8 Tbps',
    access: { count: 32, speed: '400GbE', media: 'QSFP-DD' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '10G': '128 (breakout)', '25G': '128 (breakout)', '50G': '128 (breakout)', '100G': '128 (breakout)', '200G': '64 (breakout)', '400G': '32 (QSFP-DD)' },
    breakout: '400G→4x100G/2x200G; 128x breakout — 12.8T',
    useCase: 'Spectrum-3 400GbE AI leaf/spine (RoCEv2)',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'sn5400', vendor: 'NVIDIA (via Dell)', line: 'Spectrum', model: 'SN5400',
    os: 'NVIDIA Cumulus Linux / SONiC', npu: 'NVIDIA Spectrum-4',
    formFactor: '2U (EIA)', rackU: 2, roles: ['leaf', 'spine'], switchingCapacity: '25.6 Tbps',
    access: { count: 64, speed: '400GbE', media: 'QSFP-DD' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '10G': '256 (breakout) + 2', '25G': '256 (breakout) + 2', '50G': '256 (breakout)', '100G': '256 (breakout)', '200G': '128 (breakout)', '400G': '64 (QSFP-DD)' },
    breakout: '400G→4x100G; 256x breakout — 25.6T, 2U',
    useCase: 'Spectrum-4 400GbE AI leaf/spine',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'sn5610', vendor: 'NVIDIA (via Dell)', line: 'Spectrum', model: 'SN5610',
    os: 'NVIDIA Cumulus Linux / SONiC', npu: 'NVIDIA Spectrum-4',
    formFactor: '2U (EIA)', rackU: 2, roles: ['leaf', 'spine'], switchingCapacity: '51.2 Tbps',
    access: { count: 64, speed: '800GbE', media: 'OSFP112' },
    // the 2x SFP28 are a mgmt/breakout-assist pair, NOT a fabric-uplink-capable tier — fabric
    // uplinks on this switch ride the SAME 800G OSFP112 access pool as everything else
    // (breakout-adjusted, same as any other AI leaf); notFabricUplink tells the sizing/
    // validation logic not to treat count:2 as a real dedicated uplink port class.
    uplink: { count: 2, speed: '25GbE', media: 'SFP28', notFabricUplink: true },
    portsBySpeed: { '10G': '256 (breakout) + 2', '25G': '256 (breakout)', '50G': '256 (breakout)', '100G': '256 (breakout)', '200G': '256 (breakout)', '400G': '128 (breakout)', '800G': '64 (OSFP112)' },
    breakout: '64x OSFP (800G) + 2x SFP28; 128x400G; 256x100G — 51.2T (Spectrum-X)',
    useCase: 'Spectrum-4 / Spectrum-X 800GbE flagship for large GPU AI fabrics (rail-optimized, RoCEv2)',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'sn5600', vendor: 'NVIDIA (via Dell)', line: 'Spectrum', model: 'SN5600',
    os: 'NVIDIA Cumulus Linux / SONiC', npu: 'NVIDIA Spectrum-4',
    formFactor: '2U (EIA)', rackU: 2, roles: ['leaf', 'spine'], switchingCapacity: '51.2 Tbps',
    access: { count: 128, speed: '400GbE', media: 'OSFP (twin-port)' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '100G': '256 (breakout)', '200G': '256 (breakout)', '400G': '128 (twin-port OSFP)', '800G': '64 (OSFP)' },
    breakout: '64x OSFP = 128x400G (twin-port) — 51.2T. The GB300 NVL72 RA switch ("128-port 400Gb/s")',
    useCase: 'Spectrum-4 800G/400G leaf/spine — NVL72 AI Factory compute + converged fabrics',
    dellPN: 'verify', verify: true, specConfirmed: true, source: 'NVIDIA NVL72 AI Factory Enterprise RA (Mar 2026) — 128-port 400G confirmed'
  },
  {
    id: 'sn5600d', vendor: 'NVIDIA (via Dell)', line: 'Spectrum', model: 'SN5600D',
    os: 'NVIDIA Cumulus Linux / SONiC', npu: 'NVIDIA Spectrum-4',
    formFactor: '2U (MGX1.x)', rackU: 2, roles: ['leaf', 'spine'], switchingCapacity: '51.2 Tbps',
    access: { count: 64, speed: '800GbE', media: 'OSFP112' },
    // see sn5610: the 1x SFP28 is a mgmt/breakout-assist port, not a fabric-uplink tier.
    uplink: { count: 1, speed: '25GbE', media: 'SFP28', notFabricUplink: true },
    portsBySpeed: { '10G': '256 (breakout) + 1', '25G': '256 (breakout) + 1', '50G': '256 (breakout)', '100G': '256 (breakout)', '200G': '256 (breakout)', '400G': '128 (breakout)', '800G': '64 (OSFP112)' },
    breakout: '64x OSFP (800G) + 1x SFP28 — 51.2T, 2U (MGX)',
    useCase: 'Spectrum-4 800GbE (MGX form factor) AI leaf/spine',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    // CORRECTED (2026-07-13, was id 'sn6600' @ 64x1.6TbE/OSFP224): the PORT SPEC was wrong — the
    // real Spectrum-6 flagship (base model SN6810; SN6600-LD is its liquid-cooled MGX SKU
    // variant, identical 102.4T/128-port spec) is natively 800GbE per port, not 1.6TbE — 128
    // ports of 800G, not 64 of 1.6T. This matters beyond naming: at 128 ports the flagship
    // genuinely OUT-RADIXES the SN5610 pod-spine (64 ports) — the previous 64-port spec meant
    // pickSuperSpine()'s "does the flagship's radix actually cover this pod-spine count" check
    // could never pass (flagship and pod-spine had the identical 64-port ceiling), so NVIDIA
    // 3-tier fabrics always fell through to the "beyond this tool's sizing" 4th-tier warning even
    // at scales a real SN6810 super-spine could serve. SN6800 (409.6T/512-port, 4-chip liquid-
    // cooled chassis) is a hyperscale-tier system beyond what a typical Dell channel engagement
    // specs — not modeled here.
    id: 'sn6810', vendor: 'NVIDIA (via Dell)', line: 'Spectrum', model: 'SN6810',
    os: 'NVIDIA Cumulus Linux / SONiC', npu: 'NVIDIA Spectrum-6',
    formFactor: '2U (EIA)', rackU: 2, roles: ['leaf', 'spine'], switchingCapacity: '102.4 Tbps',
    access: { count: 128, speed: '800GbE', media: 'OSFP112' },
    uplink: { count: 0, speed: '-', media: '-' },
    portsBySpeed: { '100G': '1024 (breakout)', '200G': '1024 (breakout)', '400G': '512 (breakout)', '800G': '128 (OSFP112)' },
    breakout: '800G→2x400G/4x200G; up to 512x400G — 102.4T, 2U, single-chip',
    useCase: 'Spectrum-6 flagship for the largest current GPU AI fabrics — co-packaged optics, 128x native 800G',
    dellPN: 'verify', verify: true, specConfirmed: true, source: 'NVIDIA Spectrum-6 SN6810 (announced CES 2026; naddod.com Spectrum-6 deep dive, verified 2026-07-13) — Dell resell SKU per quote'
  },

  /* ==================== OUT-OF-BAND MANAGEMENT ============================= */
  {
    id: 's3248t-on', vendor: 'Dell', line: 'PowerSwitch', model: 'S3248T-ON',
    os: 'Enterprise SONiC (Dell) / SmartFabric OS10', npu: 'Broadcom Trident3-X3',
    formFactor: '1U', rackU: 1, roles: ['management', 'oob'], switchingCapacity: '0.576 Tbps',
    access: { count: 48, speed: '1GBase-T', media: 'RJ45' },
    uplink: { count: 6, speed: '10/100GbE', media: 'SFP+ / QSFP28' },
    portsBySpeed: { '1G-BaseT': '48', '10G': '4 (SFP+)', '100G': '2 (QSFP28)' },
    breakout: 'n/a', useCase: 'Purpose-built Dell out-of-band (iDRAC/BMC) management switch',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'sn2201', vendor: 'NVIDIA (via Dell)', line: 'Spectrum', model: 'SN2201',
    os: 'NVIDIA Cumulus Linux / SONiC', npu: 'NVIDIA Spectrum',
    formFactor: '1U', rackU: 1, roles: ['management', 'oob'], switchingCapacity: '0.448 Tbps',
    access: { count: 48, speed: '1GBase-T', media: 'RJ45' },
    uplink: { count: 4, speed: '10/25GbE', media: 'SFP28' },
    portsBySpeed: { '1G-BaseT': '48', '10G/25G': '4 (SFP28 uplinks)' },
    breakout: 'n/a', useCase: 'OOB management switch for NVIDIA/AI cluster environments',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },

  /* ==================== EDGE (E-SERIES) — user\'s edge line ================= */
  {
    id: 'e3224f-on', vendor: 'Dell', line: 'PowerSwitch', model: 'E3224F-ON',
    os: 'SmartFabric OS10 ONLY — NOT on the Enterprise SONiC compatibility matrix (no SONiC MC-LAG)', npu: 'Broadcom Trident3-X3',
    formFactor: '1U', rackU: 1, roles: ['edge', 'access'], switchingCapacity: '0.528 Tbps',
    access: { count: 24, speed: '1/10GbE', media: 'SFP' },
    // TWO uplink classes — the situation picks which goes up: `uplink` = the 2×100G rear pair,
    // `uplinkAlt` = the 4×10G SFP+. Whichever class ISN'T uplinking carries the MC-LAG ICL.
    uplink: { count: 2, speed: '100GbE', media: 'QSFP28' },
    uplinkAlt: { count: 4, speed: '10GbE', media: 'SFP+' },
    poe: 'none', maxPowerW: 230,
    portsBySpeed: { '1/10G': '24 (SFP)', '10G': '4 (SFP+)', '100G': '2 (QSFP28, rear)' },
    breakout: 'n/a', useCase: 'Edge/access (fiber): 24x 1/10G SFP + 4x 10G SFP+ + 2x 100G — uplink at 10G or 100G per situation (no PoE). VLT/MLAG',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'e3248p-on', vendor: 'Dell', line: 'PowerSwitch', model: 'E3248P-ON',
    os: 'Enterprise SONiC (Lite bundle) — MC-LAG confirmed per compatibility matrix', npu: 'Broadcom Trident3-X3',
    formFactor: '1U', rackU: 1, roles: ['edge', 'access'], switchingCapacity: '0.576 Tbps',
    access: { count: 48, speed: '1GBase-T', media: 'RJ45 (PoE 802.3at 30W)' },
    // TWO uplink classes — uplink at 10G (4×SFP+) or 100G (2×QSFP28 rear) per situation;
    // whichever class isn't uplinking carries the MC-LAG ICL
    uplink: { count: 2, speed: '100GbE', media: 'QSFP28' },
    uplinkAlt: { count: 4, speed: '10GbE', media: 'SFP+' },
    poe: 'poe+', poeW: 30, maxPowerW: 1683,
    portsBySpeed: { '1G-BaseT': '48 (PoE+ 30W)', '10G': '4 (SFP+)', '100G': '2 (QSFP28, rear)' },
    breakout: 'n/a', useCase: 'Edge/access: 48x 1G BASE-T 802.3at PoE+ (30W) — uplink at 10G (4×SFP+) or 100G (2×QSFP28) per situation. VLT/MLAG',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  },
  {
    id: 'e3248pxe-on', vendor: 'Dell', line: 'PowerSwitch', model: 'E3248PXE-ON',
    os: 'Enterprise SONiC (Lite bundle) — MC-LAG confirmed per compatibility matrix', npu: 'Broadcom Trident3-X5',
    formFactor: '1U', rackU: 1, roles: ['edge', 'access'], switchingCapacity: '1.56 Tbps',
    access: { count: 48, speed: '1/2.5/5/10GBase-T (multigig)', media: 'RJ45 (802.3bt Type-4 90W PoE)' },
    // TWO uplink classes — uplink at 25G (4×SFP28) or 100G (2×QSFP28 rear) per situation;
    // whichever class isn't uplinking carries the MC-LAG ICL
    uplink: { count: 2, speed: '100GbE', media: 'QSFP28' },
    uplinkAlt: { count: 4, speed: '25GbE', media: 'SFP28' },
    poe: 'poe++', poeW: 90, maxPowerW: 4869,
    portsBySpeed: { 'mGig-BaseT': '48 (1/2.5/5/10G, 802.3bt 90W)', '25G': '4 (SFP28)', '100G': '2 (QSFP28, rear)' },
    breakout: 'n/a', useCase: 'Edge/access: 48x multigig 10GBase-T 802.3bt PoE++ (90W) — uplink at 25G (4×SFP28) or 100G (2×QSFP28) per situation. VLT/MLAG',
    dellPN: 'verify', verify: true, specConfirmed: true, source: GUIDE
  }
];

/* -----------------------------------------------------------------------------
 * REDUNDANCY-METHOD CAPABILITY (per switch) — an EXPLICIT capability claim, sourced
 * from the Enterprise SONiC Compatibility Matrix + OS10 support. NOT inferred from
 * the topology `roles` field: a role says WHERE a switch sits, never which protocols
 * it speaks. Values: 'mclag' (SONiC inter-chassis peer-link), 'vlt' (OS10 peer-link),
 * 'mlag' (NVIDIA), 'evpn-mh' (all-active VXLAN multi-homing, no peer-link).
 * The fact this pins so it can't be paved over: the E3248P/E3248PXE edge switches DO
 * run MC-LAG *and* EVPN-MH on Enterprise SONiC — only E3224F-ON specifically lacks them
 * (OS10-only, absent from the SONiC matrix). A missing id resolves to [] (fail-loud:
 * unknown capability is treated as none, never silently assumed).
 * ========================================================================== */
(function () {
  const DELL_LEAF_SPINE = ['mclag', 'vlt', 'evpn-mh'];   // SONiC + OS10 VXLAN leaf/spine
  const DELL_SONIC_ONLY = ['mclag', 'evpn-mh'];          // Enterprise SONiC (no OS10 VLT listed on the entry)
  const NVIDIA = ['mlag', 'evpn-mh'];                    // NVIDIA Spectrum (Cumulus / SONiC)
  const CAP = {
    's5212f-on': DELL_LEAF_SPINE, 's5224f-on': DELL_LEAF_SPINE, 's5248f-on': DELL_LEAF_SPINE,
    's5296f-on': DELL_LEAF_SPINE, 's5232f-on': DELL_LEAF_SPINE, 'z9264f-on': DELL_LEAF_SPINE,
    's5448f-on': DELL_LEAF_SPINE, 'z9432f-on': DELL_LEAF_SPINE, 'z9664f-on': DELL_LEAF_SPINE,
    'z9864f-on': DELL_LEAF_SPINE, 's3248t-on': DELL_LEAF_SPINE,
    's4348f-on': DELL_SONIC_ONLY, 's4148f-on': DELL_SONIC_ONLY, 's4348t-on': DELL_SONIC_ONLY,
    'z9964f-on': DELL_SONIC_ONLY,
    'sn4700': NVIDIA, 'sn5400': NVIDIA, 'sn5610': NVIDIA, 'sn5600': NVIDIA, 'sn5600d': NVIDIA,
    'sn6810': NVIDIA, 'sn2201': NVIDIA,
    // E-series edge: E3248P/E3248PXE run MC-LAG AND EVPN-MH on Enterprise SONiC (compat matrix).
    'e3248p-on': ['mclag', 'evpn-mh'], 'e3248pxe-on': ['mclag', 'evpn-mh'],
    // E3224F-ON: OS10-only, NOT on the SONiC compatibility matrix — no SONiC MC-LAG, no SONiC EVPN-MH.
    'e3224f-on': []
  };
  window.CATALOG.switches.forEach(sw => { sw.redundancyMethods = CAP[sw.id] || []; });
})();

/* NOTE: SN6810 (base, 102.4T/128x800G) is modeled above. Its liquid-cooled MGX SKU variant
 * (SN6600-LD, identical spec) and the larger 4-chip SN6800 (409.6T/512x800G, hyperscale-tier
 * chassis) are intentionally NOT separately modeled — same/beyond-scope for a typical Dell
 * channel engagement. AI Fabric *InfiniBand* switches (QM9700/9790, QM9701, Q3200/Q3400/Q3401 —
 * Quantum-2/-3) also intentionally omitted: enterprise/DC Ethernet scope. Add modules later if needed. */
