/* =============================================================================
 * OPTICS & CABLE CATALOG  --  Dell-branded transceivers, DACs, AOCs, breakouts
 * -----------------------------------------------------------------------------
 * ALIGNED TO: Dell Networking Transceivers and Cables Spec Sheet (2026)
 *   (Dell_EMC_Networking_Optics_Spec_Sheet.pdf, in this folder)
 * Ethernet only (no Fibre Channel, per scope).
 *
 * Two-stage accuracy (same as switches):
 *   specConfirmed:true = Dell model name + connector family + lengths CONFIRMED
 *                        from the spec sheet.
 *   verify:true        = orderable Dell SKU (e.g. 407-xxxxx) still needs lookup.
 * Dell model naming (the "-xM" suffix = length in metres, chosen per rack run).
 *
 * The engine selects by {speed, media, reach}. DAC in-rack (<=3-5m); AOC cross-
 * rack short; optical transceivers for structured/long runs.
 * ========================================================================== */
window.CATALOG = window.CATALOG || {};

const OPTICS_SRC = 'Dell Networking Transceivers & Cables Spec Sheet 2026 (model confirmed; SKU pending)';
/* SKUs below marked APD_SRC were verified against LIVE dell.com product pages on
 * 2026-07-10 (title + "Dell part" parsed per SKU; cache: corpus/dellcom-apd-verified.json).
 * Still confirm KIT TYPE when quoting — Customer Kit (CusKit) vs factory-install SKUs differ. */
const APD_SRC = 'Spec sheet 2026 + SKUs verified vs dell.com product pages 2026-07-10 — confirm kit type (CusKit vs factory) when quoting';

/* S5448F-ON's 100G access bank is SFP56-DD (2x50G-PAM4), NOT QSFP28 — these three optics are the
 * ones that physically fit it. Table "100-Gigabit Ethernet SFP56-DD transceivers" + the "Dual
 * 100GbE / 40GbE transceivers" ordering row, both in the 2026 spec sheet (corpus/txt/OPTICS.txt). */
const SFP56DD_SRC = 'Dell Networking Transceivers & Cables Spec Sheet 2026, "100-Gigabit Ethernet SFP56-DD transceivers" table (corpus/txt/OPTICS.txt) — model + connector + reach confirmed 2026-07-16; SKU pending. Required by S5448F-ON: its spec sheet states QSFP28 optics will NOT work on the SFP56-DD ports';

const STRUCT_SRC = 'Structured cabling plant — vendor-neutral estimate; confirm fiber type (OM4/OS2), polarity (Type A/B) & polish (UPC/APC) with the cabling vendor (corpus/NET-BESTPRACTICE-RESEARCH.txt)';

window.CATALOG.optics = [
  /* ============================================================================
   * STRUCTURED-CABLING PASSIVE PLANT — the channel a real fiber run needs BEYOND
   * the transceivers: MPO trunk (backbone) → MPO cassette (MPO↔LC) → patch panel
   * (houses cassettes) → LC/MPO patch cords (device↔panel). Itemized when the
   * placement is "structured" and the plant is being included (not already in place).
   * Vendor-neutral; quantities are model-based estimates to confirm with the installer.
   * ========================================================================== */
  { id: 'struct-trunk-mpo', category: 'structured', speed: 'any', media: 'MPO/MTP', reach: 'backbone',
    model: 'MPO/MTP trunk cable (12/24f)', lengths: 'per run',
    desc: 'MPO/MTP trunk cable — multi-fiber backbone between patch panels (fiber type & length per site: OM4 in-building / OS2 for SMF)', dellPN: 'verify', verify: true, specConfirmed: false, source: STRUCT_SRC },
  { id: 'struct-cassette', category: 'structured', speed: 'any', media: 'MPO↔LC', reach: '-',
    model: 'MPO cassette (MPO rear ↔ LC front)', lengths: '12f / 24f',
    desc: 'MPO cassette — breaks a trunk MPO into LC duplex ports at the panel (UPC for MMF, APC for SMF — never mixed)', dellPN: 'verify', verify: true, specConfirmed: false, source: STRUCT_SRC },
  { id: 'struct-panel', category: 'structured', speed: 'any', media: '19" 1U', reach: '-',
    model: 'Fiber patch panel (1U, holds ~4 cassettes)', lengths: '1U',
    desc: 'Rack-mount fiber patch panel — high-density crossconnect housing the MPO cassettes', dellPN: 'verify', verify: true, specConfirmed: false, source: STRUCT_SRC },
  { id: 'struct-patch-lc', category: 'structured', speed: 'any', media: 'LC duplex', reach: '≤5m',
    model: 'LC-LC patch cord (duplex)', lengths: '1/2/3/5m',
    desc: 'LC duplex patch cord — device ↔ panel (2 per link: one each end); polish matches the fiber (UPC MMF / APC SMF)', dellPN: 'verify', verify: true, specConfirmed: false, source: STRUCT_SRC },
  { id: 'struct-patch-mpo', category: 'structured', speed: 'any', media: 'MPO-12/16', reach: '≤10m',
    model: 'MPO-MPO patch cord / jumper', lengths: '1/2/3/5/10m',
    desc: 'MPO patch cord (jumper) — for PARALLEL optics (SR4/SR4.2/SR8/DR8: MPO-12 for 4-lane, MPO-16 for 8-lane); polarity Type B typical, confirm facility method', dellPN: 'verify', verify: true, specConfirmed: false, source: STRUCT_SRC },

  /* ---- 1G copper (OOB management) — generic structured cabling ---- */
  { id: 'cat6-1g', category: 'copper', speed: '1GbE', media: 'RJ45', reach: 'up to 100m',
    model: 'Cat6/6A patch (or SFP-1G-T)', lengths: 'per rack layout',
    desc: 'Cat6/6A patch cable, RJ45 (OOB / iDRAC / BMC)', dellPN: 'verify', verify: true, specConfirmed: false,
    source: 'Structured cabling — length per rack layout (Dell SFP-1G-T if SFP port)' },

  /* ---- 1G (legacy/mgmt-adjacent copper & fiber host NICs) ----
   * Real Dell SFP-form-factor modules — an "electrical" SFP plugs into a STANDARD SFP/SFP+
   * cage, no different port-count-wise from a DAC or fiber transceiver; no separate switch
   * needed. Per the spec sheet: "The 10GbE SFP+ receptacle will also recognize 1GbE SFP
   * transceivers" — SFP-1G-T runs fine in any of this catalog's existing SFP+ leaf ports. */
  { id: 'sfp-1g-t', category: 'transceiver', speed: '1GbE', media: 'RJ45 (SFP electrical)', reach: 'CAT5, up to 100m',
    model: 'SFP-1G-T', lengths: '-',
    desc: 'SFP-1G-T · 1000BASE-T copper SFP module (RJ-45, up to 100m CAT5) — plugs into any SFP/SFP+ port', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },
  { id: 'sfp-1g-sx', category: 'transceiver', speed: '1GbE', media: 'SFP', reach: 'SX up to 550m MMF',
    model: 'SFP-1G-SX', lengths: '-',
    desc: 'SFP-1G-SX · 1000BASE-SX SFP optical transceiver, short-reach (LC, MMF)', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },

  /* ---- 10G ---- */
  { id: 'dac-10g-sfpp', category: 'dac', speed: '10GbE', media: 'SFP+', reach: 'DAC 0.5–7m',
    model: 'DAC-SFP-10G-xM', lengths: '0.5/1/2/3/5/7m',
    desc: 'DAC-SFP-10G-xM · 10GbE SFP+ passive Direct Attach Copper (in-rack)', dellPN: '470-AAVH (1m) · 470-ABPS (2m) · 470-AAVJ (3m) · 470-AAVG (5m)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'sr-10g-sfpp', category: 'transceiver', speed: '10GbE', media: 'SFP+', reach: 'SR up to 400m OM4',
    model: 'SFP-10G-SR', lengths: '-',
    desc: 'SFP-10G-SR · 10GBASE-SR SFP+ optical transceiver (LC, MMF)', dellPN: '407-BBOU (SR 300m) · 407-BBZM (85C)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'lr-10g-sfpp', category: 'transceiver', speed: '10GbE', media: 'SFP+', reach: 'LR 10km SMF',
    model: 'SFP-10G-LR', lengths: '-',
    desc: 'SFP-10G-LR · 10GBASE-LR SFP+ optical transceiver, 10km single-mode (LC, 1310nm) — long reach / inter-building (ER 40km, ZR 80km also on the spec sheet)', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },
  // electrical (copper) SFP+ module — RJ-45, runs 10GBASE-T over CAT6A but reach is much
  // shorter than a native 10GBASE-T port (30m, not the usual 100m) because of power/signal
  // constraints inside the SFP+ form factor; also notably higher power draw per port than a
  // DAC/optic (~2.4-2.5W) — the spec sheet flags dense population may be power-limited on
  // some switches. Rate-adaptive: negotiates down to 5G/2.5G/1G on CAT5e/CAT5 if needed.
  { id: 'sfp-10g-t', category: 'transceiver', speed: '10GbE', media: 'RJ45 (SFP+ electrical)', reach: 'CAT6A 30m (rate-adaptive to 1G over CAT5e/CAT5, 100m)',
    model: 'SFP-10G-T', lengths: '-',
    desc: 'SFP-10G-T · 10GBASE-T copper SFP+ module (RJ-45, up to 30m CAT6A) — plugs into any SFP+ port; verify per-switch power budget before dense population', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },

  // NATIVE RJ45 host cabling — for a leaf with real copper access ports (S4348T-ON), not an
  // SFP+ cage taking an electrical module. A single Cat6A patch cable is rate-adaptive
  // (1/2.5/5/10GBase-T auto-negotiate on the same wire/port) — one real-world SKU covers a
  // 1GBase-T and a 10GBase-T host alike, unlike the SFP-1G-T/SFP-10G-T modules above (distinct
  // Dell PNs despite similar rate-adaptive behavior, because they're discrete optical parts).
  { id: 'cat6a-host', category: 'copper', speed: '10GbE', media: 'RJ45', reach: 'CAT6A up to 55m (10G) / 100m (1G, CAT5e+)', rateAdaptive: true,
    model: 'Cat6A patch cable (RJ45, native copper port)', lengths: 'per rack layout',
    desc: 'Cat6A patch cable — 1/10GBASE-T host-to-leaf on a native RJ45 leaf port (no SFP module needed)', dellPN: 'verify', verify: true, specConfirmed: true,
    source: 'Dell S4348T-ON spec sheet — native 1/10GBase-T RJ45 access ports' },

  /* ---- 25G (primary storage/server access speed) ---- */
  { id: 'dac-25g-sfp28', category: 'dac', speed: '25GbE', media: 'SFP28', reach: 'DAC 1–5m',
    model: 'DAC-SFP-25G-xM', lengths: '1/2/2.5/3/5m',
    desc: 'DAC-SFP-25G-xM · 25GbE SFP28 passive DAC (in-rack host-to-leaf)', dellPN: '470-ACFB (2m) · 470-ACEU (3m) · 470-ACEY (5m)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'aoc-25g-sfp28', category: 'aoc', speed: '25GbE', media: 'SFP28', reach: 'AOC 2–20m',
    model: 'AOC-SFP-25G-xM', lengths: '2/7/10/20m',
    desc: 'AOC-SFP-25G-xM · 25GbE SFP28 Active Optical Cable (cross-rack short)', dellPN: '470-AECX (2m) · 470-ACIK (10m) · 470-ACHZ (20m)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'sr-25g-sfp28', category: 'transceiver', speed: '25GbE', media: 'SFP28', reach: 'SR up to 100m',
    model: 'SFP28-25G-SR', lengths: '-',
    desc: 'SFP28-25G-SR · 25GBASE-SR SFP28 optical transceiver (LC, MMF)', dellPN: '407-BCHI (85C universal) · 407-BBXU (no-FEC)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'lr-25g-sfp28', category: 'transceiver', speed: '25GbE', media: 'SFP28', reach: 'LR 10km SMF',
    model: 'SFP28-25G-LR', lengths: '-',
    desc: 'SFP28-25G-LR · 25GBASE-LR SFP28 optical transceiver, 10km single-mode (LC, 1310nm) — long reach / inter-building', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },

  /* ---- 100G (uplinks / spine / 100G hosts) ---- */
  { id: 'dac-100g-qsfp28', category: 'dac', speed: '100GbE', media: 'QSFP28', reach: 'DAC 0.5–5m',
    model: 'DAC-QSFP-100G-xM', lengths: '0.5/1/2/3/5m',
    desc: 'DAC-QSFP-100G-xM · 100GbE QSFP28 passive DAC (in-rack)', dellPN: '470-ABPW (0.5m) · 470-ABPY (1m) · 470-ABQE (3m) · 470-ABPU (5m)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'aoc-100g-qsfp28', category: 'aoc', speed: '100GbE', media: 'QSFP28', reach: 'AOC 3–30m',
    model: 'AOC-QSFP-100G-xM', lengths: '3/7/10/30m',
    desc: 'AOC-QSFP-100G-xM · 100GbE QSFP28 Active Optical Cable (leaf-to-spine short)', dellPN: '470-ACLU (3m) · 470-ABPM (10m) · 470-ABPJ (30m)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'sr4-100g-qsfp28', category: 'transceiver', speed: '100GbE', media: 'QSFP28', reach: 'SR4 up to 100m',
    model: 'Q28-100G-SR4', lengths: '-',
    desc: 'Q28-100G-SR4 · 100GBASE-SR4 QSFP28 optical transceiver (MPO-12, MMF)', dellPN: '407-BBWV (SR4 MPO-12 MMF)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'dr-100g-qsfp28', category: 'transceiver', speed: '100GbE', media: 'QSFP28', reach: 'FR up to 2km SMF',
    model: 'Q28-100G-FR', lengths: '-',
    desc: 'Q28-100G-FR · 100GbE QSFP28 optical transceiver, 2km SMF (LR4 for 10km)', dellPN: '407-BBVO (CWDM4 2km) · 407-BCWC (LR4 10km)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'lr4-100g-qsfp28', category: 'transceiver', speed: '100GbE', media: 'QSFP28', reach: 'LR4 10km SMF',
    model: 'Q28-100G-LR4', lengths: '-',
    desc: 'Q28-100G-LR4 · 100GBASE-LR4 QSFP28 optical transceiver, 10km single-mode (duplex LC, 1300nm) — long reach / inter-building / metro', dellPN: '407-BCWC (LR4 10km)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'brk-100g-4x25', category: 'breakout', speed: '100GbE→4x25GbE', media: 'QSFP28→4xSFP28', reach: 'DAC 2–5m',
    model: 'DAC-QSFP-4SFP28-25G-xM', lengths: '2/3/5m (AOC 10m)',
    desc: 'DAC-QSFP-4SFP28-25G-xM · 100G QSFP28 → 4x25G SFP28 breakout DAC', dellPN: '470-ABQF (2m DAC) · 470-ABQB (3m DAC) · 470-ACIJ (10m AOC)', verify: true, specConfirmed: true, source: APD_SRC },

  /* ---- 100G SFP56-DD (S5448F-ON access bank) ----
   * The S5448F-ON's 48× 100GbE access ports are SFP56-DD, NOT QSFP28. Its own spec sheet is
   * explicit (corpus/txt/SW-S5448F.txt): "SFP56-DD 100GbE ports on S5448F-ON use PAM4 technology
   * (i.e. 2x50G SerDes), and not the NRZ technology (i.e. 4x25G SerDes). QSFP28 optics and
   * break-out will not work on the SFP56-DD (or S56DD) ports." The engine quoted QSFP28 parts into
   * them anyway until R12 (backtest 2026-07-16c follow-on) — an unbuildable line on every
   * 100G-host design that landed on this leaf. These are the parts that DO fit.
   * All three are duplex LC (2×50G-PAM4 lanes over one fiber pair), not MPO.
   * NO SFP56-DD DAC is cataloged HERE ON PURPOSE (ruling 2026-07-16d(b)): the spec sheet's only
   * S56DD copper part is DAC-S56DD-Q56-100G-xM, whose FAR end is QSFP56 ("Q56 end is compliant to
   * SFF-8636 coding"). A passive DAC cannot convert line encoding — 50G-PAM4 at the switch cannot
   * downshift to a 25G-NRZ QSFP28 NIC (the same rule NVIDIA states for its own cables: "100G-PAM4
   * cables and transceivers cannot downshift to 50G-PAM4 or 25G-NRZ"). So that DAC is only valid
   * into a 50G-PAM4/QSFP56-capable NIC, which we do not yet model per-NIC. Until that's verified
   * (CITATION-LOG task), S5448F in-rack hosts quote the SR1.2 optic: pricier, but known-buildable.
   */
  { id: 's56dd-100g-sr', category: 'transceiver', speed: '100GbE', media: 'SFP56-DD', reach: 'SR1.2 up to 100m OM4',
    model: 'S56DD-100G-SR1.2', lengths: '-',
    desc: 'S56DD-100G-SR1.2 · 100GbE SFP56-DD optical transceiver, 2x50G-PAM4 (duplex LC, MMF — 70m OM3 / 100m OM4 / 100m OM5)', dellPN: 'verify', verify: true, specConfirmed: true, source: SFP56DD_SRC },
  { id: 's56dd-100g-fr', category: 'transceiver', speed: '100GbE', media: 'SFP56-DD', reach: 'FR 2km SMF',
    model: 'S56DD-100G-FR', lengths: '-',
    desc: 'S56DD-100G-FR · 100GbE SFP56-DD optical transceiver, 2km single-mode (duplex LC, 1311nm)', dellPN: 'verify', verify: true, specConfirmed: true, source: SFP56DD_SRC },
  { id: 's56dd-100g-lr', category: 'transceiver', speed: '100GbE', media: 'SFP56-DD', reach: 'LR 10km SMF',
    model: 'S56DD-100G-LR', lengths: '-',
    desc: 'S56DD-100G-LR · 100GbE SFP56-DD optical transceiver, 10km single-mode (duplex LC, 1311nm) — long reach / inter-building', dellPN: 'verify', verify: true, specConfirmed: true, source: SFP56DD_SRC },

  /* ---- 200G ---- */
  { id: 'dac-200g-qsfp56', category: 'dac', speed: '200GbE', media: 'QSFP56 (Q28DD)', reach: 'DAC 0.5–3m',
    model: 'DAC-Q28DD-200G-xM', lengths: '0.5/1/2/3m',
    desc: 'DAC-Q28DD-200G-xM · 200GbE passive DAC', dellPN: '470-ACUL (1m) · 470-ACUN (2m)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'brk-200g-2x100', category: 'breakout', speed: '200GbE→2x100GbE', media: 'Q28DD→2xQSFP28', reach: 'DAC 2–3m',
    model: 'DAC-Q28DD-2Q28-100G-xM', lengths: '2/3m',
    desc: 'DAC-Q28DD-2Q28-100G-xM · 200G → 2x100G breakout DAC', dellPN: '470-ACWC (2m DAC) · 470-ACUE (5m AOC)', verify: true, specConfirmed: true, source: APD_SRC },

  /* ---- 400G (AI spine / high-speed) ---- */
  { id: 'dac-400g-qsfpdd', category: 'dac', speed: '400GbE', media: 'QSFP56-DD', reach: 'DAC 0.5–2m',
    model: 'DAC-Q56DD-400G-xM', lengths: '0.5/1/2m',
    desc: 'DAC-Q56DD-400G-xM · 400GbE QSFP56-DD passive DAC', dellPN: '470-ADYS (0.5m) · 470-ADYU (1m) · 470-ADYT (2m)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'dr4-400g-qsfpdd', category: 'transceiver', speed: '400GbE', media: 'QSFP56-DD', reach: 'SR4.2 150m / FR4 2km',
    model: '400G-Q56DD-SR4.2-ON', lengths: '-',
    desc: '400G-Q56DD-SR4.2-ON · 400GbE QSFP56-DD optical, 150m MMF (FR4 for 2km SMF)', dellPN: '407-BCID (SR4.2 100m OM4)', verify: true, specConfirmed: true, source: APD_SRC },
  { id: 'lr4-400g-qsfpdd', category: 'transceiver', speed: '400GbE', media: 'QSFP56-DD', reach: 'LR4 10km SMF',
    model: '400G-Q56DD-LR4', lengths: '-',
    desc: '400G-Q56DD-LR4 · 400GbE QSFP56-DD optical transceiver, 10km single-mode (duplex LC) — long reach / inter-building / metro (spec sheet also lists FR4/EDR4/LDR4 SMF variants)', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },
  { id: 'brk-400g-4x100', category: 'breakout', speed: '400GbE→4x100GbE', media: 'Q56DD→4xQSFP28', reach: 'AOC 3–30m / AEC 3m',
    model: 'AOC-Q56DD-4Q28-100G-xM', lengths: '3/7/15/30m (AEC 3/5m)',
    desc: 'AOC-Q56DD-4Q28-100G-xM · 400G → 4x100G breakout (leaf uplink fan-out)', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC + ' — ACC SKUs 470-AEDF/AEDL/AEDN (3/5/7m) were search-indexed but their US store pages are delisted; confirm via sales channel' },

  /* ---- 800G (NVIDIA Spectrum-4 / SN5610 AI fabric) ---- */
  { id: 'dac-800g-osfp', category: 'dac', speed: '800GbE', media: 'OSFP112', reach: 'DAC 1–4m',
    model: 'DAC-O112-800G-xM', lengths: '1/2/3/4m',
    desc: 'DAC-O112-800G-xM · 800GbE OSFP112 passive DAC (Spectrum-X in-rack)', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },
  // 800G OSFP112 switch port -> 2x 400G QSFP56-DD ends. `railsPerAssembly` is what makes the
  // quantity honest: ONE assembly carries TWO 400G links, so qty = links ÷ 2, never one-per-link
  // (R12 ruling 2026-07-16d(b)). The far ends are QSFP56-DD — this part reaches a QSFP56-DD NIC,
  // NOT another OSFP switch port, which is why a Dell 400G folded AI Clos (OSFP<->OSFP both ends)
  // has no cataloged part here and returns null rather than substituting this one.
  { id: 'brk-800g-2x400', category: 'breakout', speed: '800GbE→2x400GbE', media: 'OSFP112→2xQSFP56-DD', reach: 'DAC 1–4m',
    railsPerAssembly: 2, farCage: 'qsfp-dd',
    model: 'DAC-O112-800G2x400G-xM', lengths: '1–4m',
    desc: 'DAC-O112-800G2x400G-xM · 800G OSFP112 → 2x400G QSFP56-DD breakout DAC (800G switch port → two 400G hosts/rails)', dellPN: 'verify', verify: true, specConfirmed: true, source: OPTICS_SRC },

  /* ============================================================================
   * NVIDIA LinkX cables & optics — for NVIDIA Spectrum-X (AI) fabrics.
   * The engine selects these (not Dell optics) when an AI fabric is the NVIDIA
   * stack. Twin-port OSFP = 800G electrical to the switch presented as 2x400G
   * optics (2x MPO-12/APC). DAC ≤3m, ACC 3–5m, MM ≤50m, SM 100m/500m/2km.
   * Source: NVIDIA LinkX (docs.nvidia.com/networking CABLEOVpub).
   * ========================================================================== */
  { id: 'nv-dac-800g-osfp', vendor: 'NVIDIA', category: 'dac', speed: '800GbE', media: 'OSFP (twin-port)', reach: 'DAC ≤3m',
    model: 'MCP4Y10-Nxxx', lengths: '0.5/1/1.5/2/3m',
    desc: 'MCP4Y10-Nxxx · NVIDIA LinkX 800G twin-port OSFP passive DAC (in-rack)', dellPN: 'MCP4Y10-N00A (0.5m) · -N001 (1m) · -N002 (2m) · -N003 (3m)', verify: true, specConfirmed: false, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  { id: 'nv-acc-800g-osfp', vendor: 'NVIDIA', category: 'aoc', speed: '800GbE', media: 'OSFP (twin-port)', reach: 'ACC 3–5m',
    model: 'MCA7J60-Nxxx', lengths: '3/4/5m',
    desc: 'MCA7J60-Nxxx · NVIDIA LinkX 800G twin-port OSFP Active Copper Cable (adjacent/EoR)', dellPN: 'MCA7J60-Nxxx (3/4/5m)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  { id: 'nv-sr8-800g-osfp', vendor: 'NVIDIA', category: 'transceiver', speed: '800GbE', media: 'OSFP (twin-port)', reach: 'SR8 ≤50m MMF',
    model: 'MMA4Z00-NS', lengths: '-',
    desc: 'MMA4Z00-NS · NVIDIA LinkX 800G twin-port OSFP 2x400G SR8 multimode (2x MPO-12/APC, 50m)', dellPN: 'MMA4Z00-NS', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  { id: 'nv-dr8-800g-osfp', vendor: 'NVIDIA', category: 'transceiver', speed: '800GbE', media: 'OSFP (twin-port)', reach: 'DR8 ≤500m SMF',
    model: 'MMS4X00-NM', lengths: '-',
    desc: 'MMS4X00-NM · NVIDIA LinkX 800G twin-port OSFP 2x400G DR8 single-mode (structured, 500m)', dellPN: 'MMS4X00-NM', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  { id: 'nv-brk-400g-4x100', vendor: 'NVIDIA', category: 'breakout', speed: '400GbE→4x100GbE', media: 'QSFP-DD→4xQSFP28', reach: 'DAC 1–3m',
    model: 'MCP7F60-Wxxx', lengths: '1–3m',
    desc: 'MCP7F60-Wxxx · NVIDIA LinkX 400G QSFP-DD → 4x100G breakout DAC', dellPN: 'MCP7F60-W0xx (1–3m)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  /* ---- Twin-port-OSFP switch → 2× 400G rail splitters (SN5600 / SN5610 / SN5600D / SN6810).
   * R12 ruling 2026-07-16d(a): these two parts are NOT interchangeable and the choice is NEVER
   * defaulted — it is set by the SERVER NIC's cage, because that's the far end of the cable.
   * NVIDIA LinkX (corpus/txt/NV-LINKX-400G-COMBO.txt) splits them exactly that way:
   *   "Switch-to-400G ConnectX-7/OSFP 1:2 Splitter Cables"            -> MCP7Y00 (2× OSFP)
   *   "Switch-to-400G/QSFP112 ConnectX-7+ BlueField3 DPUs 1:2 Splitter" -> MCP7Y10 (2× QSFP112)
   * `farCage` is what the engine matches against the platform's rail-NIC cage.
   * ONE splitter carries TWO rails — quantity is ceil(rails / 2), never one-per-rail. */
  // `farCageVariant` marks a part whose SELECTION is a genuine either/or against a sibling — i.e.
  // where "not sure" is a real ambiguity worth flagging on the BOM. Distinct from `farCage`, which
  // merely records a part's fixed far end (the Dell brk-800g-2x400 has one, but no sibling to be
  // confused with, so an unconfirmed NIC cage must NOT flag it).
  { id: 'nv-brk-800g-2x400-osfp', vendor: 'NVIDIA', category: 'breakout', speed: '800GbE→2x400GbE', media: 'OSFP→2xOSFP', reach: 'DAC 1–3m',
    farCage: 'osfp', farCageVariant: 'MCP7Y00 (2× OSFP) / MCP7Y10 (2× QSFP112)', railsPerAssembly: 2,
    model: 'MCP7Y00-Nxxx', lengths: '1/1.5/2/2.5/3m',
    desc: 'MCP7Y00-Nxxx · NVIDIA LinkX 800G OSFP → 2x400G splitter DAC (twin-port-OSFP switch → 2× OSFP ConnectX-7/-8 rails)', dellPN: 'MCP7Y00-N001 (1m) · -N01A (1.5m) · -N002 (2m) · -N003 (3m)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX "Switch-to-400G ConnectX-7/OSFP 1:2 Splitter Cables" (corpus NV-LINKX-400G-COMBO, verified 2026-07-16); Dell resell SKU per quote' },
  { id: 'nv-brk-800g-2x400-q112', vendor: 'NVIDIA', category: 'breakout', speed: '800GbE→2x400GbE', media: 'OSFP→2xQSFP112', reach: 'DAC 0.5–3m',
    farCage: 'qsfp112', farCageVariant: 'MCP7Y00 (2× OSFP) / MCP7Y10 (2× QSFP112)', railsPerAssembly: 2,
    model: 'MCP7Y10-Nxxx', lengths: '0.5/1/1.5/2/3m',
    desc: 'MCP7Y10-Nxxx · NVIDIA LinkX 800G OSFP → 2x400G splitter DAC (twin-port-OSFP switch → 2× QSFP112 ConnectX-7 / BlueField-3 rails)', dellPN: 'MCP7Y10-N001 (1m) · -N01A (1.5m) · -N002 (2m) · -N003 (3m)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX "Switch-to-400G/QSFP112 ConnectX-7+ BlueField3 DPUs 1:2 Splitter Cables" (corpus NV-LINKX-400G-COMBO, verified 2026-07-16); Dell resell SKU per quote' },
  { id: 'nv-dac-25g-sfp28', vendor: 'NVIDIA', category: 'dac', speed: '25GbE', media: 'SFP28', reach: 'DAC ≤3m',
    model: 'MCP2M00-Axxx', lengths: '0.5–3m',
    desc: 'MCP2M00-Axxx · NVIDIA LinkX 25GbE SFP28 passive DAC (in-rack)', dellPN: 'MCP2M00-A0xx (0.5–3m)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  { id: 'nv-sr-25g-sfp28', vendor: 'NVIDIA', category: 'transceiver', speed: '25GbE', media: 'SFP28', reach: 'SR ≤100m MMF',
    model: 'MMA2P00-AS', lengths: '-',
    desc: 'MMA2P00-AS · NVIDIA LinkX 25GbE SFP28 SR optic (structured MMF)', dellPN: 'MMA2P00-AS', verify: true, specConfirmed: false, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  { id: 'nv-dac-100g-qsfp28', vendor: 'NVIDIA', category: 'dac', speed: '100GbE', media: 'QSFP28', reach: 'DAC ≤3m',
    model: 'MCP1600-C0xx', lengths: '0.5–3m',
    desc: 'MCP1600-C0xx · NVIDIA LinkX 100GbE QSFP28 passive DAC (in-rack)', dellPN: 'MCP1600-C0xx (0.5–3m)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  { id: 'nv-sr4-100g-qsfp28', vendor: 'NVIDIA', category: 'transceiver', speed: '100GbE', media: 'QSFP28', reach: 'SR4 ≤100m MMF',
    model: 'MMA1B00-C100D', lengths: '-',
    desc: 'MMA1B00-C100D · NVIDIA LinkX 100GbE QSFP28 SR4 optic (MPO-12, MMF)', dellPN: 'MMA1B00-C100D', verify: true, specConfirmed: false, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' },
  /* id was 'nv-dac-400g-osfp' until 2026-07-16d — a misnomer that read as an OSFP part while its
   * media is QSFP-DD, and the engine duly quoted it into SN5600/SN5610 OSFP cages where it cannot
   * seat (R12). Renamed to match its actual cage. Per NVIDIA LinkX: "Only QSFP-DD offering is
   * 400G DR4 for SN5400/SN4700 switches" — this part belongs to those two switches ONLY; a
   * twin-port-OSFP switch (SN5600/SN5610/SN5600D/SN6810) uses the MCP7Y00/Y10 splitters above. */
  { id: 'nv-dac-400g-qsfpdd', vendor: 'NVIDIA', category: 'dac', speed: '400GbE', media: 'QSFP-DD', reach: 'DAC ≤3m',
    switchCage: 'qsfp-dd',
    model: 'MCP1660-W0xx', lengths: '0.5/1/2/3m',
    desc: 'MCP1660-W0xx · NVIDIA LinkX 400G QSFP-DD passive DAC (SN5400 / SN4700 QSFP-DD ports ONLY — twin-port-OSFP switches use the MCP7Y00/Y10 2x400G splitters)', dellPN: 'MCP1660-W0xx (0.5–3m)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); "Only QSFP-DD offering is 400G DR4 for SN5400/SN4700 switches" re-verified 2026-07-16; Dell resell SKU per quote' },
  { id: 'nv-sr4-400g-osfp', vendor: 'NVIDIA', category: 'transceiver', speed: '400GbE', media: 'OSFP/QSFP112', reach: 'SR4 ≤50m / DR 500m',
    model: 'MMA4Z00-NS400 / MMA1Z00-NS400', lengths: '-',
    desc: 'MMA4Z00-NS400 (OSFP) / MMA1Z00-NS400 (QSFP112) · NVIDIA LinkX 400G SR4 multimode (structured/optical)', dellPN: 'MMA4Z00-NS400 (OSFP) · MMA1Z00-NS400 (QSFP112)', verify: true, specConfirmed: true, source: 'NVIDIA LinkX docs — MPN verified vs docs.nvidia.com 2026-07-10 (corpus NV-LINKX-400G-COMBO); Dell resell SKU per quote' }
];

/* =============================================================================
 * PORT FORM-FACTOR (CAGE) COMPATIBILITY  --  R12
 * -----------------------------------------------------------------------------
 * A transceiver only goes in a port whose CAGE physically accepts it. Speed match
 * is NOT enough and neither is "same vendor": a 400G QSFP56-DD module does not fit
 * a QSFP28 cage (it's physically longer/double-density), and it does not fit an OSFP
 * cage either (a different MSA entirely). Both were being quoted (backtest 16c, R12):
 * a 400G-Q56DD-SR4.2 off an S5232F-ON (QSFP28-only) and an MCP1660-W0xx (QSFP-DD)
 * into SN5600/SN5610 OSFP ports.
 *
 * WHY THIS LIVES IN THE CATALOG: it's a VENDOR FACT (MSA mechanical compatibility),
 * not a business rule — so it sits next to the parts it describes and is cited, and
 * both the engine (pick time) and validate.js (final-BOM sweep) read the SAME table.
 *
 * SOURCED (Dell Networking Transceivers & Cables Spec Sheet 2026, corpus/txt/OPTICS.txt):
 *  - "The 10GbE SFP+ receptacle will also recognize 1GbE SFP transceivers."
 *    -> one SFP family: SFP / SFP+ / SFP28 share a cage.
 *  - "Standard 10GbE SFP+ and 25GbE SFP28 optics can be readily inserted, recognized,
 *     and utilized in the 100GbE QSFP28 receptacle using a (QSA28) pluggable adapter."
 *    -> SFP-into-QSFP is possible ONLY with a QSA28 adapter — a real orderable part
 *       (QSA-Q28-S28, "100GbE QSFP28 to 25GbE SFP28 adapter"), never a bare fit.
 *  - "Optical interoperability of SFP, SFP+, SFP28 with selected QSFP and QSFP-DD
 *     modules" + "You can utilize 25GbE optics in 100GbE and 400GbE ports using a
 *     (QSA28) pluggable adapter."
 * DD backward-compatibility (QSFP-DD accepts QSFP28/QSFP+; SFP-DD accepts SFP28/SFP+)
 * is the defining property of the -DD MSAs: the extra lane row sits BEHIND the legacy
 * contact row, so the shorter legacy module seats in the front row. The reverse never
 * fits — this asymmetry is the whole point of the check.
 * NOT MODELED (deliberate): OSFP<->QSFP-DD mechanical adapters. They exist in the wider
 * market but are not Dell-cataloged parts here, so an OSFP/QSFP-DD crossing is reported
 * as impossible rather than silently "adaptable" — fail loud, per this codebase's rule.
 * ========================================================================== */
(function () {
  // Cage FAMILIES. Within a family every module seats; across families only the
  // explicitly-listed rules below apply.
  //   SFP     — SFP / SFP+ / SFP28 / SFP56      (1 lane)
  //   SFP-DD  — SFP56-DD                        (2 lanes; accepts SFP)
  //   QSFP    — QSFP+ / QSFP28 / QSFP56         (4 lanes, ≤50G-PAM4 per lane)
  //   QSFP112 — QSFP112                         (4 lanes @ 100G-PAM4 — CX7/BF3 NIC cages)
  //   QSFP-DD — QSFP28-DD (Q28DD) / QSFP56-DD   (8 lanes; accepts QSFP, NOT QSFP112)
  //   OSFP    — OSFP / OSFP112 / OSFP224        (8 lanes; its own MSA — accepts nothing else)
  //   RJ45    — twisted-pair jack               (no pluggable module)
  //
  // QSFP112 is deliberately its OWN family, not folded into QSFP. Per NVIDIA LinkX
  // (corpus/txt/NV-LINKX-400G-COMBO.txt): "QSFP-DD cages on SN5400/SN4700 switches are
  // backwards compatible with QSFP56 and QSFP28 devices (but don't support QSFP112)" and
  // "QSFP112 cages on CX7 and BF3 support backwards compatibility with QSFP56 and QSFP28
  // devices". The asymmetry is signalling, not just mechanics — same doc: "100G-PAM4 cables
  // and transceivers cannot downshift to 50G-PAM4 or 25G-NRZ." Folding QSFP112 into QSFP would
  // have let a 400G QSFP112 optic pass the check into an SN5400/SN4700 QSFP-DD port.
  //
  // Order matters: OSFP and the -DD forms must be tested BEFORE the bare SFP/QSFP patterns,
  // QSFP112 before bare QSFP, and the SFP family before RJ45 (an "RJ45 (SFP+ electrical)"
  // module is an SFP-CAGE part with an RJ-45 face — it plugs into an SFP port, not a copper jack).
  function cageOfToken(tok) {
    const s = String(tok || '').trim();
    if (!s || s === '-') return null;
    if (/OSFP/i.test(s)) return 'OSFP';
    if (/Q(SFP)?\d*\s*-?\s*DD|Q28DD|Q56DD/i.test(s)) return 'QSFP-DD';
    if (/QSFP112/i.test(s)) return 'QSFP112';
    if (/QSFP/i.test(s)) return 'QSFP';
    if (/SFP\d*\s*-\s*DD/i.test(s)) return 'SFP-DD';
    if (/SFP/i.test(s)) return 'SFP';
    if (/RJ ?-?45|Base-?T/i.test(s)) return 'RJ45';
    return null;   // MPO/LC/panel/structured text etc. — not a pluggable cage
  }
  // A media string may name SEVERAL cages:
  //   'SFP+ / QSFP28'      — S3248T-ON's uplink bank is genuinely two port classes
  //   'OSFP/QSFP112'       — the module is orderable in either variant
  //   'Q56DD→4xQSFP28'     — a breakout ASSEMBLY: the switch-side cage is the HIGH end
  //                          (before the arrow); the low end lands on the far device.
  function cagesOf(media) {
    const s = String(media || '');
    if (!s) return [];
    const high = s.split(/→|->/)[0];                     // breakout: keep the switch-side end
    const out = high.split(/[\/,]|\bor\b/i).map(cageOfToken).filter(Boolean);
    return [...new Set(out)];
  }
  // Physical seating rules, keyed cage(port) -> cages(module) that fit.
  const ACCEPTS = {
    'SFP':     { 'SFP': 'native' },
    'SFP-DD':  { 'SFP-DD': 'native', 'SFP': 'native' },
    'QSFP':    { 'QSFP': 'native', 'SFP': 'qsa' },
    // QSFP-DD takes legacy QSFP+/28/56 but NOT QSFP112 (100G-PAM4 won't downshift) — LinkX
    'QSFP-DD': { 'QSFP-DD': 'native', 'QSFP': 'native', 'SFP': 'qsa' },
    // QSFP112 (NIC-side cage on CX7/BF3) is backwards-compatible with QSFP56/QSFP28
    'QSFP112': { 'QSFP112': 'native', 'QSFP': 'native' },
    'OSFP':    { 'OSFP': 'native' },
    'RJ45':    { 'RJ45': 'native' }
  };
  // Does `opticMedia` physically seat in `portMedia`?
  //   -> { ok:true,  adapter:null }        native fit
  //   -> { ok:true,  adapter:'QSA28' }     fits, but ONLY with a QSA28 pluggable adapter
  //   -> { ok:false, portCages, opticCages }  physically impossible
  //   -> { ok:true,  unknown:true }        one side isn't a pluggable cage we model
  //                                        (structured plant, panel, bare fiber) — not our call
  function fits(portMedia, opticMedia) {
    const pc = cagesOf(portMedia), oc = cagesOf(opticMedia);
    if (!pc.length || !oc.length) return { ok: true, unknown: true, portCages: pc, opticCages: oc };
    let best = null;
    pc.forEach(p => oc.forEach(o => {
      const how = (ACCEPTS[p] || {})[o];
      if (how === 'native') best = best || 'native';
      else if (how === 'qsa' && best !== 'native') best = 'qsa';
    }));
    if (!best) return { ok: false, portCages: pc, opticCages: oc };
    return { ok: true, adapter: best === 'qsa' ? 'QSA28' : null, portCages: pc, opticCages: oc };
  }
  // The LOW (fan-out) end of a breakout assembly — 'Q56DD→4xQSFP28' -> 'QSFP28'. The two ends of
  // a breakout land on DIFFERENT switches (high end in the spine, the N low ends in the leaves),
  // so each end needs its own fit check. Returns null for a non-breakout media string.
  function lowMediaOf(media) {
    const parts = String(media || '').split(/→|->/);
    if (parts.length < 2) return null;
    return parts[1].replace(/^\s*\d+\s*x\s*/i, '').trim() || null;
  }
  /* GPU-rail NIC model → cage, for the MCP7Y00-vs-MCP7Y10 choice (R12 ruling 2026-07-16d(a):
   * derive-then-ask). Reading a cage the vendor DECLARES is not defaulting; guessing one is.
   * This table therefore contains ONLY what the sources state deterministically:
   *   - BlueField-3 → QSFP112. NVIDIA LinkX names the part by it: "Switch-to-400G/QSFP112
   *     ConnectX-7+ BlueField3 DPUs 1:2 Splitter Cables" (corpus NV-LINKX-400G-COMBO).
   * ConnectX-7 and ConnectX-8 are DELIBERATELY ABSENT — each ships in BOTH cages, so the
   * generation does not determine the connector. ConnectX-8 UM (corpus NV-CX8-UM): "The C8180
   * ConnectX-8 SuperNIC, featuring a single-port OSFP module" AND "Networking Port: Dual-port
   * QSFP112". LinkX likewise lists CX-7 on the OSFP splitter AND the QSFP112 splitter. A
   * generation→cage map for these would be a fabricated vendor fact — they return null and the
   * caller asks (wizard/expert question; "not sure" quotes the OSFP variant VERIFY-flagged).
   * A specific DESIGN may still pin it (the GB300 NVL72 RA says "the ConnectX-8 OSFP port") —
   * that belongs in the RA's own data, not in this generation map. */
  const NIC_CAGE = { 'bluefield-3': 'qsfp112', 'bluefield3': 'qsfp112', 'bf-3': 'qsfp112', 'bf3': 'qsfp112' };
  function railNicCageOf(model) {
    const s = String(model || '').toLowerCase().replace(/\s+/g, '');
    const hit = Object.keys(NIC_CAGE).find(k => s.indexOf(k.replace(/\s+/g, '')) >= 0);
    return hit ? NIC_CAGE[hit] : null;
  }
  window.CATALOG.formFactor = {
    cagesOf, fits, lowMediaOf, railNicCageOf,
    adapterPN: 'QSA-Q28-S28 (100GbE QSFP28 → 25GbE SFP28 adapter)',
    source: 'Dell Networking Transceivers & Cables Spec Sheet 2026 (corpus/txt/OPTICS.txt) — SFP+/SFP28-into-QSFP28 requires a QSA28 adapter; SFP+ receptacle recognizes 1GbE SFP; -DD cages are backward-compatible with their legacy single-row module'
  };
})();
