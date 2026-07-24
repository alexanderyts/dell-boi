/* =============================================================================
 * UI RENDERING  --  BOM table, topology SVG, rack elevation, checks, exports
 * ========================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const el = (t, a, h) => { const e = document.createElement(t); if (a) Object.assign(e, a); if (h != null) e.innerHTML = h; return e; };
  let LAST = null;
  // Logical (default) shows up to 2 pairs/4 singles per fabric + 2 spines/super-spines, "+N
  // more" past that. Expanded draws EVERY switch instance — grouped by fabric/role, no rack
  // placement implied (the engine has no per-instance rack assignment to draw one from; see
  // GAPS.md G-014). Persists across re-renders (theme repaint, new BOM) as a user preference.
  let TOPO_MODE = 'logical';

  // SECURITY: neutralize HTML metacharacters before ANY user-derived string (NIC vendor /
  // model / labels, and every engine `note`/`item` that can carry them) reaches innerHTML.
  // Escaping lives at the render boundary, not in the engine (which stays pure data).
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  // interactive-diagram attribute helpers (tooltip text + fabric-focus + click-to-BOM)
  const tip = t => t ? ` data-tip="${esc(t)}"` : '';
  const fab = i => (i != null) ? ` data-fabric="${i}"` : '';

  /* ---------- Fixed-size pan/zoom viewport for the topology diagram ----------
   * The diagram sits in a CONSTANT-height window whatever the BOM size: it opens fitted
   * (whole topology visible), then pinch/wheel zooms and drag pans — instead of the old
   * behavior where a big design scaled down to unreadable, or a phone showed one zoomed
   * corner. Print bypasses the viewport entirely (full diagram, untransformed). */
  const topoViewport = svg =>
    `<div class="diagram-wrap topo-viewport" id="topo-svg"><div class="zoom-stage">${svg}</div>` +
    `<div class="zoom-ctl" role="group" aria-label="Zoom controls">` +
    `<button type="button" data-z="out" title="Zoom out" aria-label="Zoom out">−</button>` +
    `<button type="button" data-z="in" title="Zoom in" aria-label="Zoom in">+</button>` +
    `<button type="button" data-z="fit" title="Fit the whole diagram" aria-label="Fit diagram">Fit</button>` +
    `<button type="button" data-z="full" title="Actual size (100%)" aria-label="Actual size">1:1</button>` +
    `</div></div>`;
  function wireZoom() {
    const vp = $('#topo-svg'); if (!vp || !vp.classList.contains('topo-viewport')) return;
    const stage = vp.querySelector('.zoom-stage'), svg = stage && stage.querySelector('svg');
    if (!stage || !svg) return;
    const svgW = parseFloat(svg.getAttribute('width')) || 1000, svgH = parseFloat(svg.getAttribute('height')) || 600;
    let k = 1, tx = 0, ty = 0;
    const apply = () => { stage.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${k.toFixed(4)})`; };
    const vw = () => vp.clientWidth || svgW, vh = () => vp.clientHeight || svgH;
    const clampK = v => Math.min(4, Math.max(0.1, v));
    let autoFit = true;   // keep auto-fitting until the user takes over (zoom/pan/pinch)
    const fit = () => {
      k = clampK(Math.min(vw() / svgW, vh() / svgH));
      tx = (vw() - svgW * k) / 2; ty = Math.max((vh() - svgH * k) / 2, 0);
      apply();
    };
    const zoomAt = (f, cx, cy) => {   // zoom by factor f keeping viewport point (cx,cy) fixed
      const k2 = clampK(k * f); f = k2 / k; if (f === 1) return;
      tx = cx - (cx - tx) * f; ty = cy - (cy - ty) * f; k = k2; apply();
    };
    fit();
    // The topology tab is HIDDEN when a BOM first renders (the BOM tab is active), so the
    // fit above ran against a display:none box (clientWidth 0 → 1:1 fallback = a cropped
    // corner on a phone). Re-fit whenever the viewport gets its real size — first tab open,
    // window resize, phone rotation — until the user has taken over the zoom themselves.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => { if (autoFit && vp.clientWidth > 0) fit(); });
      ro.observe(vp);
    }
    vp.addEventListener('wheel', ev => { ev.preventDefault(); autoFit = false; const r = vp.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.15 : 1 / 1.15, ev.clientX - r.left, ev.clientY - r.top); }, { passive: false });
    // pointer events unify mouse + touch: 1 pointer = pan, 2 = pinch. A real drag suppresses
    // the click that follows so click-a-switch → BOM (wireTopology) doesn't fire after panning.
    const pts = new Map(); let moved = false, pinchD = 0;
    vp.addEventListener('pointerdown', ev => { if (ev.target.closest('.zoom-ctl')) { moved = false; return; } vp.setPointerCapture(ev.pointerId); pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); moved = false; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); } vp.classList.add('dragging'); });
    vp.addEventListener('pointermove', ev => {
      const p = pts.get(ev.pointerId); if (!p) return;
      if (pts.size === 1) {
        const dx = ev.clientX - p.x, dy = ev.clientY - p.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; autoFit = false; }
        tx += dx; ty += dy; p.x = ev.clientX; p.y = ev.clientY; apply();
      } else if (pts.size === 2) {
        p.x = ev.clientX; p.y = ev.clientY; moved = true; autoFit = false;
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0 && d > 0) { const r = vp.getBoundingClientRect(); zoomAt(d / pinchD, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); }
        pinchD = d;
      }
    });
    const lift = ev => { pts.delete(ev.pointerId); pinchD = 0; if (!pts.size) vp.classList.remove('dragging'); };
    vp.addEventListener('pointerup', lift); vp.addEventListener('pointercancel', lift);
    // suppress ONLY the post-drag click on the diagram itself — never a zoom-control tap
    vp.addEventListener('click', ev => { if (moved && !ev.target.closest('.zoom-ctl')) { ev.stopPropagation(); ev.preventDefault(); } moved = false; }, true);
    vp.addEventListener('dblclick', ev => { autoFit = false; const r = vp.getBoundingClientRect(); zoomAt(1.5, ev.clientX - r.left, ev.clientY - r.top); });
    vp.querySelector('.zoom-ctl').addEventListener('click', ev => {
      const b = ev.target.closest('[data-z]'); if (!b) return;
      if (b.dataset.z === 'in') { autoFit = false; zoomAt(1.3, vw() / 2, vh() / 2); }
      else if (b.dataset.z === 'out') { autoFit = false; zoomAt(1 / 1.3, vw() / 2, vh() / 2); }
      else if (b.dataset.z === 'fit') { autoFit = true; fit(); }
      else if (b.dataset.z === 'full') { autoFit = false; k = 1; tx = 8; ty = 8; apply(); }
    });
  }

  /* Wire hover tooltips, legend fabric-focus, and click-a-switch → jump to its BOM row.
   * Re-run after every topology render (incl. theme repaint). */
  function wireTopology() {
    const svgWrap = $('#topo-svg'); if (!svgWrap) return;
    let tipEl = $('#topo-tip');
    if (!tipEl) { tipEl = el('div', { id: 'topo-tip' }); document.body.appendChild(tipEl); }
    const hostRect = () => svgWrap.getBoundingClientRect();
    svgWrap.onmousemove = ev => {
      const g = ev.target.closest && ev.target.closest('[data-tip]');
      if (!g) { tipEl.style.opacity = '0'; return; }
      tipEl.textContent = g.getAttribute('data-tip');
      tipEl.style.opacity = '1';
      const r = hostRect();
      let x = ev.clientX + 14, y = ev.clientY + 14;
      if (x + 260 > window.innerWidth) x = ev.clientX - 14 - Math.min(250, tipEl.offsetWidth);
      tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
    };
    svgWrap.onmouseleave = () => { tipEl.style.opacity = '0'; };
    // click a switch box → go to its BOM row and flash it
    svgWrap.onclick = ev => {
      const g = ev.target.closest && ev.target.closest('[data-bom-model]');
      if (!g) return;
      const model = g.getAttribute('data-bom-model');
      const tabBtn = document.querySelector('.tab[data-tab="bom"]'); if (tabBtn) tabBtn.click();
      const row = document.querySelector(`#tab-bom tr[data-bom-model="${(window.CSS && CSS.escape) ? CSS.escape(model) : model}"]`);
      if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('bom-flash'); setTimeout(() => row.classList.remove('bom-flash'), 1400); }
    };
    // legend fabric chips → focus (dim the others); click again to clear
    let focused = null;
    svgWrap.parentNode.querySelectorAll('.legend [data-fabric]').forEach(chip => {
      chip.style.cursor = 'pointer';
      chip.onclick = () => {
        const idx = chip.getAttribute('data-fabric');
        focused = (focused === idx) ? null : idx;
        svgWrap.querySelectorAll('[data-fabric]').forEach(elm => {
          elm.style.opacity = (focused == null || elm.getAttribute('data-fabric') === focused) ? '' : '0.15';
        });
        svgWrap.parentNode.querySelectorAll('.legend [data-fabric]').forEach(c => c.classList.toggle('lg-active', focused != null && c.getAttribute('data-fabric') === focused));
      };
    });
  }

  /* ---------- SVG primitives — clean light drawing sheet ---------- */
  const svgNS = 'http://www.w3.org/2000/svg';
  // Diagram palettes — light "drawing sheet" + clean dark counterpart (no glow either way).
  // T is mutated in place by setTheme() so every renderer picks the active theme up.
  const THEMES = {
    light: {
      bg: '#ffffff', ink: '#1b1f23', dim: '#6a747e', muted: '#6a747e', faint: '#98a2ab',
      boxFill: '#ffffff', spineFill: '#f2f7f8', hostFill: '#fbfcfc', shellFill: '#f3f5f6',
      cyan: '#0e7c86', server: '#1d8a5a', storage: '#a8760f', gpu: '#7b5cc4',
      oob: '#8a949c', core: '#8a6d3b', icl: '#c98a1e',
      dedFill: '#f4f1fb', dedStroke: '#7b5cc4', coreFill: '#fbf6ea', clientStroke: '#9aa5ad',
      pal: ['#0e7c86', '#3568c4', '#7b5cc4', '#c25a52', '#2b8a5e', '#b0821f']
    },
    dark: {
      bg: '#14181c', ink: '#e6eaed', dim: '#9aa4ac', muted: '#8b959d', faint: '#5b656d',
      boxFill: '#1a1f24', spineFill: '#1d272b', hostFill: '#181d21', shellFill: '#1d2226',
      cyan: '#4cc3cd', server: '#4ecb96', storage: '#d9a94f', gpu: '#a795ec',
      oob: '#7d878f', core: '#b08d51', icl: '#d99a3e',
      dedFill: '#241f33', dedStroke: '#a795ec', coreFill: '#262015', clientStroke: '#5e6a72',
      pal: ['#4cc3cd', '#7da7f0', '#a795ec', '#ef9d94', '#5fd3a0', '#d9c56a']
    }
  };
  const T = Object.assign({}, THEMES.light);
  function setTheme(mode) {
    Object.assign(T, THEMES[mode === 'dark' ? 'dark' : 'light']);
    if (LAST) {   // repaint the diagrams in the new palette (tables/checks are CSS-themed)
      renderTopology(LAST); renderRack(LAST);
      if (window.Glossary) { Glossary.apply($('#tab-rack')); Glossary.apply(document.querySelector('.legend')); }
    }
  }
  // one SVG frame for every diagram: theme sheet + whisper-faint grid (no effects).
  // `desc` = an accessible name so screen readers announce what the diagram shows
  // (a picture with no text alternative is invisible to assistive tech).
  let _svgSeq = 0;
  function frame(W, H, inner, desc) {
    const id = 'svg-t' + (++_svgSeq);
    const label = desc || 'Network diagram';
    return `<svg xmlns="${svgNS}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="${id}">` +
      `<title id="${id}">${esc(label)}</title>` +
      `<defs><pattern id="lum-grid" width="26" height="26" patternUnits="userSpaceOnUse">` +
      `<path d="M 26 0 L 0 0 0 26" fill="none" stroke="${T.ink}" stroke-opacity="0.03" stroke-width="1"/></pattern></defs>` +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="${T.bg}"/>` +
      `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#lum-grid)"/>` + inner + `</svg>`;
  }
  function box(x, y, w, h, label, sub, fill, border, attr) {
    // attr (data-role / data-tip / data-fabric / data-bom-model) goes on the <g> so a
    // hover/click on the label text resolves too; the box gets a pointer cursor when clickable.
    const clickable = /data-bom-model/.test(attr || '') ? ' style="cursor:pointer"' : '';
    return `<g ${attr || ''}${clickable}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill || T.boxFill}" stroke="${border || T.cyan}" stroke-width="${border ? 1.4 : 1.1}"/>` +
      `<text x="${x + w / 2}" y="${y + h / 2 - (sub ? 5 : -4)}" text-anchor="middle" font-size="${w < 70 ? 10 : 12}" font-weight="600" fill="${T.ink}" letter-spacing="0.3">${esc(label)}</text>` +
      (sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 12}" text-anchor="middle" font-size="9.5" fill="${T.dim}">${esc(sub)}</text>` : '') + `</g>`;
  }
  // SERVER / STORAGE / GPU read as different devices at a glance:
  // servers = chassis seam + status LEDs · storage = drive-slot shelf · GPU = accelerator blocks
  function deviceKindFor(targetId, ai) {
    if (ai) return 'gpu';
    return /powerstore|powerscale|powermax|powerflex|objectscale|powervault/.test(targetId || '') ? 'storage' : 'server';
  }
  const deviceColor = k => k === 'storage' ? T.storage : (k === 'gpu' ? T.gpu : T.server);
  // DAC/AOC/breakout/copper/transceiver -> a short label tag; empty string when unknown.
  // Shared by renderTopology and buildDrawioXml so a link's cable-class text can't drift
  // between the two — both just consume the engine's already-selected optic .category.
  const classAbbr = c => ({ dac: 'DAC', aoc: 'AOC', copper: 'Cat6A', breakout: 'breakout', transceiver: 'optic' }[c] || '');

  /* Per-rack power / cooling / weight — planning ESTIMATES (rules.power). Takes the counts
   * for ONE rack (switches by model, hosts by kind) and returns kW / BTU-hr / kg / U. */
  function powerRollup(switchModels, hostKinds, hostU) {
    const PW = (window.CATALOG.rules && window.CATALOG.rules.power) || {};
    const sW = PW.switchWatts || {}, sWU = PW.switchWattsByU || { 1: 160, 2: 550 }, sKg = PW.switchWeightKg || { 1: 9, 2: 15, 3: 22 };
    const hW = PW.hostWatts || {}, hKg = PW.hostWeightKg || {};
    let watts = 0, kg = 0, u = 0;
    (switchModels || []).forEach(m => {
      const sw = window.CATALOG.switches.find(x => x.model === m) || { rackU: 1 };
      const id = sw.id || '';
      watts += sW[id] != null ? sW[id] : (sWU[sw.rackU] || 160);
      kg += sKg[sw.rackU] || 9; u += sw.rackU || 1;
    });
    (hostKinds || []).forEach(k => {
      const kk = k === 'gpu' ? 'gpu' : (k === 'storage' ? 'storage' : (k === 'nas' ? 'nas' : (k === 'object' ? 'object' : (k === 'hci' ? 'hci' : 'server'))));
      watts += hW[kk] != null ? hW[kk] : 650; kg += hKg[kk] != null ? hKg[kk] : 20; u += hostU || 2;
    });
    const btu = Math.round(watts * (PW.btuPerWatt || 3.412));
    return { kw: watts / 1000, btu, kg: Math.round(kg), u };
  }
  // a compact "≈ X.X kW · Y BTU/hr · Z kg · U used A/42" line + EIPT caveat
  function powerLine(roll, uCap) {
    const overU = uCap && roll.u > uCap;
    return `⚡ Rack power ≈ <b>${roll.kw.toFixed(1)} kW</b> · cooling ≈ ${roll.btu.toLocaleString()} BTU/hr · weight ≈ ${roll.kg} kg` +
      (uCap ? ` · U used ${roll.u}/${uCap}${overU ? ' ⚠ over one rack' : ''}` : '') +
      ` <span class="muted">— planning estimate; confirm with Dell EIPT</span>`;
  }
  function deviceBox(x, y, w, h, label, sub, kind, attr) {
    const col = deviceColor(kind);
    let deco = '';
    if (kind === 'storage') {
      const n = Math.max(6, Math.floor(w / 24)), pad = 12, span = w - pad * 2;
      for (let i = 0; i < n; i++) { const dx = x + pad + span * i / (n - 1); deco += `<rect x="${(dx - 1.6).toFixed(1)}" y="${(y + h - 11).toFixed(1)}" width="3.2" height="7" rx="1" fill="${col}" fill-opacity="0.75"/>`; }
    } else if (kind === 'gpu') {
      const n = 8, pad = 14, span = w - pad * 2;
      for (let i = 0; i < n; i++) { const dx = x + pad + span * i / (n - 1); deco += `<rect x="${(dx - 3).toFixed(1)}" y="${(y + h - 11).toFixed(1)}" width="6" height="6" rx="1" fill="${col}" fill-opacity="0.8"/>`; }
    } else {
      deco += `<line x1="${x + 10}" y1="${(y + h - 11).toFixed(1)}" x2="${x + w - 10}" y2="${(y + h - 11).toFixed(1)}" stroke="${col}" stroke-opacity="0.35" stroke-width="1"/>` +
        `<rect x="${x + 10}" y="${(y + h - 8).toFixed(1)}" width="16" height="3.6" rx="1" fill="${col}" fill-opacity="0.5"/>`;
      for (let i = 0; i < 3; i++) deco += `<circle cx="${(x + w - 13 - i * 9).toFixed(1)}" cy="${(y + h - 6).toFixed(1)}" r="1.8" fill="${col}" fill-opacity="0.9"/>`;
    }
    return `<g ${attr || ''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${T.hostFill}" stroke="${col}" stroke-width="1.4"/>` +
      `<text x="${x + w / 2}" y="${y + h / 2 - 5}" text-anchor="middle" font-size="12" font-weight="600" fill="${T.ink}" letter-spacing="0.3">${esc(label)}</text>` +
      (sub ? `<text x="${x + w / 2}" y="${y + h / 2 + 9}" text-anchor="middle" font-size="9.5" fill="${T.dim}">${esc(sub)}</text>` : '') + deco + `</g>`;
  }
  const link = (x1, y1, x2, y2, color, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color || T.oob}" stroke-width="1.4"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

  /* ---------- BOM ---------- */
  function designSummary(res) {
    if (res.isRA) return res.ra.summary;
    const data = res.fabrics.filter(f => f.network !== 'mgmt');
    const topo = data.some(f => f.spine) ? 'leaf-spine fabric' : 'top-of-rack (MC-LAG pair)';
    const red = res.context.redundancy === 'dual' ? 'fully redundant (dual)' : 'single fabric — no redundancy';
    const speeds = [...new Set(data.map(f => f.speed))].join(' / ') || '—';
    const tl = res.context.targetsLabel || (res.context.units + '× ' + res.platform.model);
    // R5: show EVERY NIC + the true total ports/unit (a single-NIC header on a multi-NIC design
    // under-reports the input and makes correct hardware look wrong).
    const nic = (res.context.nics && res.context.nics.length)
      ? ` · NIC ${res.context.nicSummary}${res.context.nics.length > 1 ? ` → ${res.context.nicPortsPerUnit} ports/unit` : ''}`
      : (res.context.nic ? ` · NIC ${res.context.nic.label}` : '');
    const cab = res.context.placementLabel ? ` · ${res.context.placementLabel.split(' (')[0]}` : '';
    const dep = res.context.deploy === 'add' ? ' · adding to existing (incremental)' : '';
    const nb = data.some(f => f.nonBlockingReq) ? (data.filter(f => f.nonBlockingReq).every(f => f.nonBlocking) ? ' · non-blocking ✓' : ' · ⚠ non-blocking not met') : '';
    return `${tl} · ${topo} · ${red} · ${speeds}${nic}${cab}${dep}${nb}`;
  }
  // Plain-English narrative + a confidence signal — written for a non-technical reader.
  function plainSummary(res) {
    if (res.isEdge) {
      const e = res.context.edge || {};
      return { text: `This connects about <b>${esc(String(e.endpoints || ''))} devices</b> (like PCs, phones and access points) through <b>${esc(String(e.accessSwitches || ''))} access switches</b> up to the network. The switches are paired so if one fails, everything keeps working.`, conf: confidence(res) };
    }
    if (res.isRefresh) {
      return { text: `This is a like-for-like <b>refresh</b> of the existing network at modern speeds — same shape, faster and manageable. The Checks tab has the migration steps.`, conf: confidence(res) };
    }
    const data = res.fabrics.filter(f => f.network !== 'mgmt');
    if (!data.length) return { text: '', conf: confidence(res) };
    const swN = res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && typeof b.qty === 'number').reduce((s, b) => s + b.qty, 0);
    const tl = res.context.targetsLabel || (res.context.units + '× ' + (res.platform ? res.platform.family : 'hosts'));
    const spined = data.some(f => f.spine);
    const shape = spined ? 'a leaf-and-spine fabric (add switches to grow — nothing becomes a bottleneck)' : 'a top-of-rack switch pair (simple and cost-effective at this size)';
    const red = res.context.redundancy === 'dual' ? 'It is <b>fully redundant</b> — no single switch failure takes it down.' : 'This is a <b>single-fabric</b> (lab / proof-of-concept) design — not resilient.';
    const nbReq = data.filter(f => f.nonBlockingReq);
    const nb = nbReq.length ? (nbReq.every(f => f.nonBlocking) ? ' The performance-critical fabric is <b>non-blocking</b> (every device can run full speed at once).' : ' ⚠ A performance-critical fabric did not reach non-blocking — see Checks.') : '';
    const racks = (res.context.racks || 1) > 1 ? ` It spans <b>${res.context.racks} racks</b>, each with its own top-of-rack switches.` : '';
    const ai = data.some(f => f.workload === 'ai') ? ' The GPU servers get a dedicated high-speed AI fabric.' : '';
    return { text: `This design connects <b>${esc(tl)}</b> using <b>${swN} switches</b> in ${shape}. ${red}${nb}${ai}${racks}`, conf: confidence(res) };
  }
  function confidence(res) {
    const errs = res.warnings.filter(w => w.severity === 'error').length;
    const verify = res.bom.filter(b => b.verify).length;
    const assume = res.warnings.filter(w => /^Assumption:|Express mode filled/.test(w.message)).length;
    if (errs) return { level: 'attention', label: `${errs} issue${errs > 1 ? 's' : ''} to resolve`, detail: 'Open the Checks tab — something needs fixing before this is sound.' };
    const toConfirm = verify + assume;
    return { level: 'draft', label: `Draft — ${toConfirm} item${toConfirm === 1 ? '' : 's'} to confirm`, detail: 'Technically sound. Before quoting, confirm the flagged part numbers, kit types, cable lengths, and any assumptions (Checks tab).' };
  }
  function renderBOM(res) {
    const wrap = $('#tab-bom'); wrap.innerHTML = '';
    if (res.isRA) {
      wrap.appendChild(el('div', { className: 'ra-banner' },
        `<b>✓ ${res.ra.endorsement}</b><div>${res.ra.summary}</div>` +
        `<div class="ra-meta">GPU network: ${res.ra.gpuNetSpeeds} &bull; ${res.ra.gpuOptions} &bull; ${res.ra.scaleNote}</div>`));
    }
    // Plain-English narrative + confidence signal FIRST (for the non-technical reader),
    // then the technical one-liner underneath.
    const ps = plainSummary(res);
    if (ps.text) wrap.appendChild(el('div', { className: 'design-plain' },
      `<div class="dp-narr">${ps.text}</div>` +
      `<div class="dp-conf dp-${ps.conf.level}"><b>${esc(ps.conf.label)}</b> — ${esc(ps.conf.detail)}</div>`));
    wrap.appendChild(el('div', { className: 'design-summary' }, '📐 ' + esc(designSummary(res))));
    const switches = res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && typeof b.qty === 'number').reduce((s, b) => s + b.qty, 0);
    const cables = res.bom.filter(b => b.category === 'Cable/Optic').reduce((s, b) => s + b.qty, 0);
    const specConfirmed = res.bom.filter(b => b.specConfirmed).length;

    const cards = el('div', { className: 'summary-cards' });
    cards.innerHTML =
      card(switches, 'switches') + card(cables, 'cables / optics') +
      card(res.fabrics.filter(f => f.network !== 'mgmt').length, 'data fabrics') +
      card(specConfirmed, 'specs ✓ (SKU pending)');
    wrap.appendChild(cards);

    const cats = ['Switch', 'Management', 'Cable/Optic', 'Software', 'Compute', 'Storage'];
    const catLabel = { 'Switch': 'Networking — Switches', 'Management': 'Out-of-Band Management', 'Cable/Optic': 'Cables &amp; Optics', 'Software': 'Management &amp; Automation', 'Compute': 'Compute (context)', 'Storage': 'Storage (context)' };
    const table = el('table');
    table.innerHTML = '<thead><tr><th>Item / Model</th><th>Qty</th><th>Dell P/N</th><th>Notes &amp; source</th></tr></thead>';
    const tb = el('tbody');
    cats.forEach(cat => {
      const rows = res.bom.filter(b => b.category === cat);
      if (!rows.length) return;
      tb.appendChild(el('tr', { className: 'cat-row' }, `<td colspan="4">${catLabel[cat] || cat}</td>`));
      rows.forEach(r => {
        const pn = r.verify ? `<span class="pn-verify">${esc(r.dellPN)}</span>` : esc(r.dellPN);
        const flag = r.specConfirmed
          ? '<span class="flag sku" title="Port map &amp; throughput confirmed vs June 2026 guide — look up orderable Dell SKU">SKU verify</span>'
          : (r.verify ? '<span class="flag verify">⚠ verify</span>' : '');
        const row = el('tr', null,
          `<td><b>${esc(r.vendor)}</b> ${esc(r.item)}${flag}</td>` +
          `<td class="qty">${esc(r.qty)}</td>` +
          `<td>${pn}</td>` +
          `<td><div class="note">${esc(r.note)}</div><div class="src">↳ ${esc(r.source)}</div></td>`);
        if (r.model && (cat === 'Switch' || cat === 'Management')) row.setAttribute('data-bom-model', r.model);   // topology click-to-BOM anchor
        tb.appendChild(row);
      });
    });
    table.appendChild(tb);
    wrap.appendChild(table);
    renderVerityCard(res, wrap);
    renderSwitchRef(res, wrap);
    renderNextSteps(res, wrap);
  }
  const card = (n, l) => `<div class="card"><b>${n}</b><span>${l}</span></div>`;

  /* "Turn this into a quote" — the concrete steps a rep takes AFTER the tool, in plain
   * language. Tailored to what THIS design actually contains. */
  function renderNextSteps(res, wrap) {
    if (res.isRA) return;
    const steps = [];
    const swN = res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && typeof b.qty === 'number').reduce((s, b) => s + b.qty, 0);
    steps.push(`Confirm the <b>orderable Dell SKUs</b> for the ${swN} switches — they are configure-to-order (airflow direction, PSU count, OS/support bundle decide the exact part number).`);
    if (res.bom.some(b => b.category === 'Cable/Optic' && b.verify && /\d{3}-[A-Z]{4}/.test(b.dellPN || '')))
      steps.push(`Pick each cable/optic <b>length</b> for your rack runs and confirm <b>kit type</b> (Customer Kit vs factory-install) — the tool shows verified SKUs per length.`);
    if ((res.context.racks || 1) > 1 || res.fabrics.some(f => f.cablePlacement === 'adjacent' || f.cablePlacement === 'structured'))
      steps.push(`Measure the actual <b>cable distances</b> on site — they decide DAC vs AEC vs AOC vs optical and the exact lengths.`);
    if (res.context.placement === 'structured' && !res.context.structuredInPlace)
      steps.push(`Send the <b>structured-fiber plant</b> lines (trunks, cassettes, panels, patch cords) to your cabling vendor to confirm fiber type, polarity and polish.`);
    if (res.bom.some(b => b.model === 'Dell Fabric Manager (DFM)'))
      steps.push(`Get <b>DFM subscription sizing</b> for the fabric (Automation + Observability + AIOps).`);
    else steps.push(`Consider adding <b>Dell Fabric Manager (DFM)</b> — it belongs on every Dell SONiC quote (see the DFM pitch tab).`);
    steps.push(`Use <b>Save design</b> or <b>Copy link</b> (buttons above) to keep this exact config or send it to a colleague.`);
    const sec = el('div', { className: 'next-steps' },
      `<h3>✅ Turn this into a quote</h3><ol>${steps.map(s => `<li>${s}</li>`).join('')}</ol>`);
    wrap.appendChild(sec);
  }

  /* ---------- DFM value card — computed from THIS BOM (business-first) ----------
   * Dell Fabric Manager (Automation·Observability·AIOps, formerly Verity/Satori/SensAI)
   * belongs on every Dell SONiC quote. The card translates the design into per-BOM value. */
  function dfmStats(res) {
    const swLines = res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && typeof b.qty === 'number');
    // R14 (2026-07-23): counted by DFM-MANAGEABILITY (nosSupported includes 'dell-sonic'), not
    // raw vendor string — SN5600/SN5610/SN2201 are NVIDIA-vendor but DFM-manageable (verify-
    // flagged, AI-SPECTRUM H04658). A vendor-only count would tell a rep "DFM doesn't cover
    // these" for switches it actually does (verify-flagged), directly contradicting the BOM
    // line's own NOS statement and validate.js's scope warning.
    const swCat = (window.CATALOG && window.CATALOG.switches) || [];
    const capOf = model => swCat.find(s => s.model === model);
    const isDellSonic = b => { const c = capOf(b.model); return !!(c && Array.isArray(c.nosSupported) && c.nosSupported.indexOf('dell-sonic') >= 0); };
    const dellSw = swLines.filter(isDellSonic).reduce((s, b) => s + b.qty, 0);
    const nvSw = swLines.filter(b => !isDellSonic(b) && /NVIDIA/i.test(b.vendor || '')).reduce((s, b) => s + b.qty, 0);
    const data = res.fabrics.filter(f => f.network !== 'mgmt');
    const pairs = data.filter(f => f.redundancyMethod === 'mclag').reduce((s, f) => s + (f.leavesPerFabric || 0), 0);
    const hasAi = data.some(f => f.workload === 'ai');
    const speeds = [...new Set(data.map(f => f.speed))].join(' / ');
    const units = res.context ? res.context.units : 0;
    const tl = (res.context && res.context.targetsLabel) || (units + '× ' + (res.platform ? res.platform.family : 'hosts'));
    return { dellSw, nvSw, data, fabricsN: data.length, pairs, hasAi, speeds, units, targetsLabel: tl,
      hasDfm: res.bom.some(b => b.model === 'Dell Fabric Manager (DFM)') };
  }
  function renderVerityCard(res, wrap) {
    const S = dfmStats(res);
    if (!S.dellSw && !S.hasDfm) return;
    if (!S.hasDfm) {   // gentle, standing nudge — DFM goes on every quote
      wrap.appendChild(el('div', { className: 'verity-nudge' },
        `💡 <b>DFM belongs on this quote</b> — ${S.dellSw} Dell SONiC switch${S.dellSw > 1 ? 'es' : ''} = ${S.dellSw} CLI session${S.dellSw > 1 ? 's' : ''} without it, one platform with it. Toggle it in the form / guided step.`));
      return;
    }
    const bullets = [];
    bullets.push(`<b>Automation — one platform, not ${S.dellSw} consoles.</b> Every Dell SONiC switch in this BOM (${S.dellSw} across ${S.fabricsN} fabric${S.fabricsN > 1 ? 's' : ''}) is built from the design: ZTP on day 0 (hours, not weeks), orchestrated SONiC upgrades on day 2${S.pairs ? ` rolling through your ${S.pairs} MC-LAG pair${S.pairs > 1 ? 's' : ''} with no maintenance window` : ''}, Time Traveler rollback, and continuous drift detection — the network you quoted stays the network they run.`);
    bullets.push(`<b>Observability — one view, not ${S.dellSw}.</b> Streaming telemetry from every switch${S.hasAi ? ' (including RoCE health on the AI fabric)' : ''} into automated dashboards, with ML-learned thresholds that alarm on real deviation instead of noise.`);
    bullets.push(`<b>AIOps — ask the network.</b> Plain-language Q&amp;A against live fabric state, proactive insights with likely root cause, and guided remediation workflows — the warning before the outage, with the fix attached.`);
    if (res.isRefresh) bullets.push(`<b>For this refresh:</b> DFM stands the new fabric up in parallel (ZTP) and validates it before each rack cutover — the migration safety net.`);
    if (S.nvSw) bullets.push(`<b>Scope:</b> DFM manages the ${S.dellSw} Dell SONiC switches; the ${S.nvSw} NVIDIA switch${S.nvSw > 1 ? 'es' : ''} run Cumulus Linux with NVIDIA tooling.`);
    const vCard = el('div', { className: 'verity-card' },
      `<div class="verity-head">🟣 <b>Dell Fabric Manager (DFM)</b> — build it, see it, stay ahead of it <span class="muted">(Automation · Observability · AIOps — formerly Verity / Satori / SensAI)</span></div>` +
      `<ul>${bullets.map(b => `<li>${b}</li>`).join('')}</ul>` +
      `<div class="verity-close">The one-liner: <b>the hardware fixes speed — DFM fixes operations.</b> It's the difference between selling ${S.dellSw} switches and selling a network that runs itself.</div>`);
    wrap.appendChild(vCard);
  }

  /* ---------- DFM pitch generator — the manager-ready pitch, scaled to THIS BOM ----------
   * Two dials: format (Script = word-for-word ~8 min · Outline = bones only) and depth
   * (EASY = fully plain language · TECH = the real terms, each glossed inline with
   * "= what it means → why it matters"). A 💎 value-add block is ALWAYS included.
   * Every number (switches, fabrics, pairs, speeds, hosts) comes from the design. */
  function buildPitch(res, depth) {
    const S = dfmStats(res);
    const tech = depth === 'tech';
    const n = S.dellSw || 32;
    const hostsBit = S.targetsLabel ? ` behind ${esc(S.targetsLabel)}` : '';
    const speeds = esc(S.speeds);
    const pairsBit = S.pairs ? `${S.pairs} MC-LAG pair${S.pairs > 1 ? 's' : ''}` : '';
    // tech-mode gloss: the real term + plain meaning + impact, in one breath
    const g = (term, means, impact) => `<b>${term}</b> <span class="muted">— in plain terms: ${means}; why it matters: ${impact}</span>`;

    /* ---- shared value-add block (ALWAYS in the pitch, both depths/formats) ---- */
    const valueScript = `
<h3>💎 The value add <span class="muted">(weave in on slide 4 — never skip)</span></h3>
<ul>
<li><b>Time:</b> hand-configuring ${S.dellSw} switches is real engineer-weeks; with DFM the fabric configures itself in hours — the project timeline moves on day one, not after the network team catches up.</li>
<li><b>Uptime:</b> most outages trace back to human configuration error, not hardware. DFM generates the configs, sequences the upgrades, and flags drift — it removes the step where that error gets typed in.</li>
<li><b>People:</b> the team runs ${S.dellSw} switches${S.fabricsN > 1 ? ` across ${S.fabricsN} fabrics` : ''} from one place instead of ${S.dellSw} separate sessions — a smaller team can carry it, and problems get found by the platform before a user files a ticket.</li>
<li><b>Proof:</b> "is the network configured the way it's documented?" gets answered with a diff, not a guess — that's what an audit actually wants to see.</li>
<li><b>For Dell:</b> hardware gets compared line by line on price; an operating model is what the team actually lives with every day after we leave. That's harder to knock two points off.</li>
</ul>`;
    const valueOutline = `
<div class="g-card"><b>💎 VALUE ADD (always include)</b><ul>
<li>Time: ${S.dellSw} switches hand-configured = real engineer-weeks → DFM = hours</li>
<li>Uptime: removes the step where the human-error typo gets typed in</li>
<li>People: one platform not ${S.dellSw} sessions · platform finds problems before tickets</li>
<li>Proof: "as documented?" answered with a diff, not a guess</li>
<li>Dell: hardware = price-compared · operating model = what the team lives with daily</li>
</ul></div>`;

    /* ---- slide 1 + 2 (same in both depths — already plain) ---- */
    const s12 = `
<h3>Slide 1 — what's actually in this quote <span class="muted">(~1:15 · on screen: just the number "${n}")</span></h3>
<p>Most of the accounts we're in are somewhere in the same journey right now — modernizing compute, refreshing storage, and increasingly standing up AI. Every one of those projects eventually lands on the same team: whoever's actually running the network underneath it.</p>
<p>This design is <b>${n} switches</b>${hostsBit}. Someone on that team has to bring each one up: log in, type the config, make sure everything matches across the fabric, check it, move to the next box. Do that ${n} times and it's not really a switch count anymore — it's ${n} logins, ${n} places a typo can hide, ${n} boxes somebody has to remember how to get into when one acts up.</p>
<p>We sell the hardware well — ${speeds || 'faster ports'}, a good price. But the real work starts the day it arrives, and for most teams that work hasn't changed in twenty years: one person, one login, one box at a time. That's what changes what this quote should include.</p>
<h3>Slide 2 — what that actually costs, in practice <span class="muted">(~1:15)</span></h3>
<p><b>Bring-up:</b> every switch gets hand-configured — the routing, the network segments, every setting that has to match exactly — box by box across this design's ${S.fabricsN} data fabric${S.fabricsN > 1 ? 's' : ''} and ${S.dellSw} switches. Get one setting wrong and it usually doesn't surface until traffic testing, and then it's "which of the ${S.dellSw} is it" troubleshooting.</p>
<p><b>Change:</b> updating software on a redundant pair by hand means taking one down, confirming its partner can carry the full load, updating it, checking it, then doing the other — in the right order, every time. Skip a step and it's a real outage, so teams put it off instead and quietly fall behind on patches.</p>
<p><b>Drift:</b> six months in, someone made a change under time pressure that never made it back into the documentation — and that person may not even be on the team anymore. Nobody notices until an audit, or until it causes an outage. None of this shows up on the BOM. All of it shows up in the customer's operating budget.</p>`;

    /* ---- slide 3 — the three functions, per depth ---- */
    const aiEasy = S.hasAi ? ' — including the health of the RoCE/AI traffic on this fabric' : '';
    const refreshEasy = res.isRefresh ? ' In a refresh like this one, DFM builds the new fabric alongside the old one and checks it before each cutover, instead of that verification happening by hand, port by port, during the maintenance window.' : '';
    const s3easy = `
<h3>Slide 3 — Dell Fabric Manager <span class="muted">(~3:15 · the three-function slide)</span></h3>
<p>This is Dell Fabric Manager — one platform, three jobs: <b>build it</b>, <b>see it</b>, <b>stay ahead of it</b>.</p>
<p><b>Automation.</b> This is what's called intent-based networking — the team describes what they want the network to do, and DFM writes and pushes the actual configuration itself. All ${S.dellSw} switches configure themselves the moment they're powered on — not one person typing the same config ${S.dellSw} times with small variations. This fabric is up in <b>hours, not weeks</b>. Later, software updates get sequenced and pushed from one place instead of by hand, pair by pair — <b>no more getting the order right manually</b>. If a change goes wrong, there's an undo button. And DFM is always comparing what's actually running against what was designed, so the drift problem from slide 2 gets caught, not discovered later.${refreshEasy}</p>
<p>Here's where that gets concrete: a lot of customers are starting to plan moving off OS10 onto SONiC. Normally that's someone rebuilding every config from scratch by hand. DFM pulls in what's already running, converts it, and lets the team test the whole new fabric in a digital twin — a safe copy of the network — before touching production. Every switch that gets swapped in then configures itself, the same way it would on day one.</p>
<p><b>Observability.</b> One set of screens for all ${S.dellSw} switches instead of ${S.dellSw} separate logins${aiEasy}. Instead of checking in every five minutes — which isn't really watching a network, it's sampling one — DFM learns what normal looks like for <i>this</i> network, so an alert usually means something. "The network feels slow" stops being a manual sweep through every switch's counters.</p>
<p><b>AIOps.</b> The team can ask the network questions in plain English — "which links are running hot?", "what changed since Tuesday?" — and get answers instead of digging through logs themselves. It points at the likely cause instead of a wall of alarms, and can walk someone less experienced through the fix step by step.</p>
<p><b>Build it. See it. Stay ahead of it.</b></p>`;
    const pairsTech = S.pairs ? ` (this design runs ${pairsBit}, so the sequencing matters)` : '';
    const aiTech = S.hasAi ? ` — including ${g('RoCE health', 'the loss-sensitive traffic GPUs use to talk to each other', 'that traffic fails ugly if the network drops packets, so it is worth watching directly')}` : '';
    const refreshTech = res.isRefresh ? ` In this refresh, DFM stands the new fabric up in parallel and validates it before each rack cutover, instead of that check happening by hand during the window.` : '';
    const s3tech = `
<h3>Slide 3 — Dell Fabric Manager <span class="muted">(~3:15 · the three-function slide)</span></h3>
<p>This is Dell Fabric Manager — one platform, three jobs: <b>build it</b>, <b>see it</b>, <b>stay ahead of it</b>.</p>
<p><b>Automation.</b> ${g('Intent-based networking', 'the team describes the network they want, and DFM writes and pushes every switch config from that design', 'the config typo that causes a slide-2 outage doesn’t get typed in the first place')}. Day 0, all ${S.dellSw} switches come up with ${g('zero-touch provisioning (ZTP)', 'power them on and they find DFM and configure themselves', 'the fabric is live in hours, not weeks of manual bring-up')}. Day 2, ${g('orchestrated NOS upgrades', 'the drain/verify/upgrade sequence across a pair is handled by the platform instead of by hand' + (S.pairs ? ', pair-aware' : ''), 'the sequencing mistake that turns an upgrade into an outage is off the table')}${pairsTech}. ${g('Time Traveler', 'every config change is versioned with rollback', 'a bad change is a rollback, not an incident review')}. ${g('Drift detection', 'the live network is continuously diffed against the design', 'the six-month-later undocumented-change problem gets caught, not discovered')}.${refreshTech}</p>
<p>Concrete example: a lot of customers are starting to plan moving OS10 fabrics onto SONiC. ${g('Config conversion', 'DFM pulls in the existing OS10 configuration and converts it rather than someone rebuilding it by hand', 'removes the highest-risk, most tedious part of a migration')}, tested first in a ${g('digital twin', 'a safe, modeled copy of the new fabric the team can validate against before touching production', 'migration risk gets found in the twin, not on the live network')}, then every switch that gets swapped in comes up via the same ZTP as day one.</p>
<p><b>Observability.</b> ${g('Streaming telemetry', 'switches push live stats continuously instead of being polled every five minutes', 'you see problems forming instead of reconstructing them after the fact')} from every one of the ${S.dellSw} switches — interfaces, buffers, queue health${aiTech} — into one set of dashboards instead of ${S.dellSw} separate logins. ${g('ML-learned thresholds', 'DFM learns what normal looks like for this specific fabric and alarms on real deviation', 'fewer alarms that mean nothing, fewer real problems that stay silent')}.</p>
<p><b>AIOps.</b> ${g('Agentic network Q&A', 'ask questions in plain language — "which links are hot?", "what changed since Tuesday?" — against live fabric data', 'an answer in minutes instead of a log-diving session')}. ${g('Proactive insights + root-cause analysis', 'it correlates related alarms into a likely cause instead of surfacing all of them separately', 'the team spends time on the fix, not on figuring out which alarm is the real one')}. ${g('Guided remediation', 'it queues the fix and walks the operator through it step by step', 'someone less experienced isn’t working from a blank CLI alone')}.</p>
<p><b>Build it. See it. Stay ahead of it.</b></p>`;

    /* ---- slide 4 + close (shared, plain) ---- */
    const s4 = `
<h3>Slide 4 — proof + what actually changes <span class="muted">(~1:30)</span></h3>
<p>This isn't a concept: <b>EXEO Group</b> — a Japanese telecom — ran a six-month proof of concept and placed a <b>production order</b> to run their SONiC fabric on it; <b>IREN</b> is deploying it with NVIDIA for a large-scale AI factory build. It's running real fabrics at both ends of the size range today.</p>
${valueScript}
<h3>Close <span class="muted">(~0:45)</span></h3>
<p><b>The hardware fixes speed. Dell Fabric Manager fixes operations.</b> This customer already has both problems whether we price a fix for either — I'd rather put DFM on the quote and offer their network team fifteen minutes to see what they won't have to do by hand anymore.</p>
<p>Before opening it up: I'd genuinely like to hear from this group too — what pain points are you running into with customers that you think this actually solves?</p>`;

    /* ---- outlines, per depth ---- */
    const o3easy = `
<div class="g-card"><b>3 · DFM — THREE JOBS (3:15)</b><ul>
<li><b>Automation:</b> intent-based — describe what you want, DFM builds the config · switches configure themselves day 1 (${S.dellSw} in hours, not ${S.dellSw}x manual typing) · updates sequenced and pushed from one place, not manual${S.pairs ? ` (${pairsBit})` : ''} · bad change = undo button · drift caught, not discovered later${res.isRefresh ? ' · refresh: build alongside + validate before cutover' : ''}</li>
<li><b>Concrete example:</b> OS10 → SONiC moves — DFM converts existing configs, tests in a digital twin (safe copy of the network) before production, swapped-in switches configure themselves</li>
<li><b>Observability:</b> one set of screens, not ${S.dellSw} logins${S.hasAi ? ' · watches RoCE/AI traffic health' : ''} · learns "normal" so alerts usually mean something</li>
<li><b>AIOps:</b> ask the network in plain English · points at likely cause, not an alarm wall · walks the team through the fix</li>
<li><i>Refrain: "Build it. See it. Stay ahead of it."</i></li></ul></div>`;
    const o3tech = `
<div class="g-card"><b>3 · DFM — THREE JOBS (3:15)</b><ul>
<li><b>Automation:</b> intent-based networking (design → configs; the typo never gets typed) · ZTP day 0 = ${S.dellSw} switches in hours · orchestrated NOS upgrades${S.pairs ? ` via ${pairsBit}` : ''} = sequencing handled, not manual · Time Traveler (versioned rollback) · drift detection (live vs design, caught not discovered)${res.isRefresh ? ' · refresh: parallel build + validated cutover' : ''}</li>
<li><b>Concrete example:</b> OS10 → SONiC moves — config conversion (pulled in + converted, not rebuilt by hand) → validated in a digital twin (modeled copy of the fabric) → swapped-in switches via the same ZTP</li>
<li><b>Observability:</b> streaming telemetry (pushed live, not polled = see problems form)${S.hasAi ? ' incl. RoCE/AI health' : ''} · dashboards: 1 view not ${S.dellSw} sessions · ML thresholds (learned normal = fewer meaningless alarms)</li>
<li><b>AIOps:</b> agentic Q&A (plain-language answers from live state) · correlated root cause (not an alarm wall) · guided remediation (less-experienced engineer isn't working alone)</li>
<li><i>Refrain: "Build it. See it. Stay ahead of it."</i></li></ul></div>`;
    const outline = `
<div class="g-card"><b>1 · WHAT'S IN THIS QUOTE — "${n}" (1:15)</b><ul>
<li>Most customers are mid-journey: modernizing compute, storage, now AI — it always lands on the network team</li>
<li>${n} switches${hostsBit} = ${n} logins, ${n} hand-typed configs, ${n} places to check when something's wrong</li>
<li>We sell hardware well; bring-up hasn't changed much in 20 years</li>
<li><i>Bridge: "That changes what this quote should include."</i></li></ul></div>
<div class="g-card"><b>2 · WHAT THAT COSTS IN PRACTICE (1:15)</b><ul>
<li>Bring-up: box-by-box config of ${S.dellSw} switches → one wrong setting doesn't surface until traffic testing</li>
<li>Change: manual pair upgrades need exact sequencing → skip a step, real outage → so upgrades get deferred instead</li>
<li>Drift: undocumented changes made under pressure → nobody notices until an audit or an outage</li>
<li><i>"None of this is on the BOM; all of it is in their operating budget."</i></li></ul></div>
${tech ? o3tech : o3easy}
<div class="g-card"><b>4 · PROOF (0:45)</b><ul>
<li>EXEO Group: 6-month trial → production order (SONiC, telecom) · IREN + NVIDIA AI factory</li></ul></div>
${valueOutline}
<div class="g-card"><b>5 · CLOSE (0:45)</b><ul>
<li><i>"The hardware fixes speed. DFM fixes operations."</i></li>
<li>Offer: DFM on this quote + 15 min with the network team</li>
<li>Open the floor: what pain points is the group seeing that this solves?</li></ul></div>`;

    return { script: s12 + (tech ? s3tech : s3easy) + s4, outline };
  }
  function renderPitch(res) {
    const wrap = $('#tab-pitch'); if (!wrap) return;
    const S = dfmStats(res);
    if (!S.dellSw) { wrap.innerHTML = '<p class="muted">No Dell SONiC switches in this design — the DFM pitch applies to Dell fabrics.</p>'; return; }
    let depth = 'easy', fmt = 'script';
    wrap.innerHTML =
      `<div class="export-bar">` +
      `<button class="ghost pitch-tgl" id="pitch-mode-script">📜 Script</button>` +
      `<button class="ghost pitch-tgl" id="pitch-mode-outline">🗂 Outline</button>` +
      `<span class="export-note">·</span>` +
      `<button class="ghost pitch-tgl" id="pitch-depth-easy">🙂 Easy mode</button>` +
      `<button class="ghost pitch-tgl" id="pitch-depth-tech">🔬 Tech mode</button>` +
      `<span class="export-note">~8 min · scaled to this BOM (${S.dellSw} switches · ${S.fabricsN} fabric${S.fabricsN > 1 ? 's' : ''}${S.pairs ? ` · ${S.pairs} pair${S.pairs > 1 ? 's' : ''}` : ''}) · tech mode glosses every term in plain language · prep doc: docs/dfm-pitch.md</span></div>` +
      `<div id="pitch-script"></div><div id="pitch-outline" hidden></div>`;
    const paint = () => {
      const p = buildPitch(res, depth);
      $('#pitch-script').innerHTML = p.script; $('#pitch-outline').innerHTML = p.outline;
      $('#pitch-script').hidden = fmt !== 'script'; $('#pitch-outline').hidden = fmt !== 'outline';
      [['pitch-mode-script', fmt === 'script'], ['pitch-mode-outline', fmt === 'outline'],
       ['pitch-depth-easy', depth === 'easy'], ['pitch-depth-tech', depth === 'tech']]
        .forEach(([id, on]) => { const b = $('#' + id); if (b) b.classList.toggle('on', on); });
    };
    $('#pitch-mode-script').onclick = () => { fmt = 'script'; paint(); };
    $('#pitch-mode-outline').onclick = () => { fmt = 'outline'; paint(); };
    $('#pitch-depth-easy').onclick = () => { depth = 'easy'; paint(); };
    $('#pitch-depth-tech').onclick = () => { depth = 'tech'; paint(); };
    paint();
  }

  /* switch capability reference — shows the guide-confirmed port map & throughput */
  function renderSwitchRef(res, wrap) {
    const models = [...new Set(res.bom.filter(b => b.category === 'Switch' || b.category === 'Management').map(b => b.model))];
    const entries = models.map(m => window.CATALOG.switches.find(s => s.model === m)).filter(Boolean);
    if (!entries.length) return;
    const sec = el('div', { className: 'switch-ref' });
    sec.innerHTML = '<h3>Switch capability reference <span class="muted">(port map &amp; throughput confirmed vs June 2026 guide)</span></h3>';
    entries.forEach(s => {
      const ports = s.portsBySpeed
        ? Object.entries(s.portsBySpeed).map(([k, v]) => `<span class="chip"><b>${k}</b> ${v}</span>`).join('')
        : '';
      sec.innerHTML += `<div class="ref-card">` +
        `<div class="ref-head"><b>${esc(s.vendor)} ${esc(s.model)}</b> <span class="muted">${esc(s.npu || '')} · ${esc(s.formFactor || s.rackU + 'U')} · ${esc(s.os)}</span>` +
        `<span class="cap">${s.switchingCapacity || ''}</span></div>` +
        `<div class="chips">${ports}</div></div>`;
    });
    wrap.appendChild(sec);
  }

  /* ---------- Campus / edge topology (CLIENTS → ACCESS MC-LAG pairs → DISTRIBUTION) --- */
  function renderEdgeTopology(res) {
    const wrap = $('#tab-topology'); wrap.innerHTML = '';
    const e = res.context.edge, mg = res.fabrics.find(f => f.network === 'mgmt');
    const acc = res.fabrics.find(f => f.network === 'access').leaf;
    const redundant = e.method === 'mclag', pairsTotal = e.pairs || 0;
    const units = redundant ? pairsTotal : e.accessSwitches;          // columns = pairs (or single switches)
    const CAP = redundant ? 4 : 6, shown = Math.max(1, Math.min(units, CAP));
    const ACC = T.cyan, DIST = T.server, ICLC = T.icl, MGC = T.oob, UP = T.cyan;
    const colW = redundant ? 250 : 160, marginL = 116, marginR = 30, oobW = mg ? 150 : 0;
    const W = Math.max(940, marginL + marginR + shown * colW + oobW);
    const colX = i => marginL + i * colW + colW / 2;
    const distY = 26, distH = 40, distBot = distY + distH;
    const accY = distBot + 92, accH = 44, accBot = accY + accH;
    const cliY = accBot + 92, cliH = 42, cliBot = cliY + cliH;
    const busY = cliBot + 26, H = busY + 30;
    let L = '', B = '';
    const halo = (x, y, t, c, s, w, a) => { a = a || 'middle'; w = w || 400; s = Math.max(s, 9); const wd = String(t).length * s * (w >= 700 ? 0.62 : 0.56) + 8; const rx = a === 'middle' ? x - wd / 2 : x - 4; return `<rect x="${rx.toFixed(1)}" y="${(y - s).toFixed(1)}" width="${wd.toFixed(1)}" height="${s + 5}" rx="3" fill="${T.bg}" fill-opacity="0.88"/><text x="${x}" y="${y}" text-anchor="${a}" font-size="${s}" font-weight="${w}" fill="${c}">${esc(t)}</text>`; };
    const tier = (ly, a, b) => `<text x="10" y="${ly}" font-size="10.5" font-weight="700" fill="${T.faint}" letter-spacing="2">${a}</text>` + (b ? `<text x="10" y="${ly + 14}" font-size="10.5" font-weight="700" fill="${T.faint}" letter-spacing="2">${b}</text>` : '');
    B += tier(distY + 24, e.distribution === 'existing' ? 'CORE' : 'DISTRIB.'); B += tier(accY + 22, 'ACCESS', '(MC-LAG)'); B += tier(cliY + 24, 'CLIENTS');

    // distribution / core
    const cx0 = W / 2 - oobW / 2, distXs = [];
    if (e.distribution === 'existing') { B += box(cx0 - 150, distY, 300, distH, 'Existing distribution / core', 'uplink by others', T.shellFill, DIST); distXs.push(cx0); }
    else {
      const n = e.distCount || 1, bw = 150, gap = 22, tot = n * bw + (n - 1) * gap, sx0 = cx0 - tot / 2;
      const distAttr = `data-role="spine"${tip(`${e.distribution} · campus distribution · ${n} switch(es) · click for BOM`)} data-bom-model="${esc(e.distribution)}"`;
      for (let k = 0; k < n; k++) { const x = sx0 + k * (bw + gap) + bw / 2; distXs.push(x); B += box(x - bw / 2, distY, bw, distH, e.distribution, n > 1 ? 'Distribution ' + (k + 1) : 'Distribution', T.boxFill, DIST, distAttr); }
      if (n === 2) { B += `<line x1="${distXs[0] + 75}" y1="${distY + distH / 2}" x2="${distXs[1] - 75}" y2="${distY + distH / 2}" stroke="${ICLC}" stroke-width="2.5" stroke-dasharray="4 3"/>`; B += halo((distXs[0] + distXs[1]) / 2, distY + distH / 2 - 6, `⇄ MC-LAG ICL 2×${e.distIclSpeed || '100G'}`, ICLC, 9.5); }
      B += halo(cx0, distY - 8, `${e.distribution} · ${n} switch${n > 1 ? 'es' : ''}`, T.ink, 10, 700);
    }
    // access MC-LAG pairs + clients
    const clientsPerCol = Math.round(e.endpoints / units), leafBW = redundant ? 108 : 132, OFF = 62;
    const accAttr = `data-role="leaf"${tip(`${acc.model} · campus access · ${e.accessSwitches || ''} switch(es) · click for BOM`)} data-bom-model="${esc(acc.model)}"`;
    for (let i = 0; i < shown; i++) {
      const xc = colX(i), sw = [];
      if (redundant) {
        const lx1 = xc - OFF, lx2 = xc + OFF; sw.push(lx1, lx2);
        B += box(lx1 - leafBW / 2, accY, leafBW, accH, acc.model, 'A', T.boxFill, ACC, accAttr);
        B += box(lx2 - leafBW / 2, accY, leafBW, accH, acc.model, 'B', T.boxFill, ACC, accAttr);
        B += `<line x1="${lx1 + leafBW / 2}" y1="${accY + accH / 2}" x2="${lx2 - leafBW / 2}" y2="${accY + accH / 2}" stroke="${ICLC}" stroke-width="2.5" stroke-dasharray="4 3"/>`;
        B += halo(xc, accBot + 14, `⇄ ICL ${e.iclSpeed} · MC-LAG pair`, ICLC, 9.5);
      } else { sw.push(xc); B += box(xc - leafBW / 2, accY, leafBW, accH, acc.model, '', T.boxFill, ACC, accAttr); B += halo(xc, accBot + 14, 'single', T.muted, 9.5); }
      // uplinks: each access switch -> every distribution switch
      sw.forEach(sx => distXs.forEach(dx => { L += `<line x1="${sx}" y1="${accY}" x2="${dx}" y2="${distBot}" stroke="${UP}" stroke-width="1.7" stroke-opacity="0.85"/>`; }));
      B += halo(xc, distBot + 30, `↑ ${e.upPerSw}×${(e.upSpeed || '100GbE').replace('bE', '')}`, UP, 9.5, 700);
      // clients below this column
      B += box(xc - (colW - 60) / 2, cliY, colW - 60, cliH, `~${clientsPerCol} clients`, 'APs / phones / cameras / PCs', T.hostFill, T.clientStroke);
      const strands = Math.min(clientsPerCol, 18), spanW = colW - 80;
      for (let j = 0; j < strands; j++) { const hx = xc - spanW / 2 + (strands > 1 ? spanW * j / (strands - 1) : spanW / 2); L += `<line x1="${sw[j % sw.length]}" y1="${accBot}" x2="${hx}" y2="${cliY}" stroke="${ACC}" stroke-width="1" stroke-opacity="0.4"/>`; }
    }
    if (units > shown) B += halo(colX(shown - 1) + colW / 2 - 30, accY + accH / 2, `+${units - shown} more ${redundant ? 'pair' : 'switch'}${units - shown > 1 ? 's' : ''}`, ACC, 10, 700, 'start');

    // OOB to every switch
    if (mg) {
      const ox = W - marginR - oobW / 2;
      B += box(ox - 70, accY, 140, accH, mg.leaf.model, '×' + mg.totalLeaves, T.shellFill, MGC,
        `data-role="oob-switch"${tip(`${mg.leaf.model} · out-of-band management · ${mg.totalLinks} mgmt links · click for BOM`)} data-bom-model="${esc(mg.leaf.model)}"`);
      L += `<line x1="${ox}" y1="${accBot}" x2="${ox}" y2="${busY}" stroke="${MGC}" stroke-width="1.4" stroke-dasharray="5 3"/>`;
      L += `<line x1="${marginL + 20}" y1="${busY}" x2="${ox}" y2="${busY}" stroke="${MGC}" stroke-width="1.4" stroke-dasharray="5 3"/>`;
      for (let i = 0; i < shown; i++) L += `<line x1="${colX(i)}" y1="${busY}" x2="${colX(i)}" y2="${accBot}" stroke="${MGC}" stroke-width="1" stroke-opacity="0.6" stroke-dasharray="3 2"/>`;
      distXs.forEach(dx => { if (e.distribution !== 'existing') L += `<line x1="${dx}" y1="${busY}" x2="${dx}" y2="${distBot}" stroke="${MGC}" stroke-width="1" stroke-opacity="0.5" stroke-dasharray="3 2"/>`; });
      B += halo((marginL + ox) / 2, busY - 5, `OOB → every switch mgmt port · ${mg.totalLinks} links`, MGC, 9.5, 700);
    }
    const svg = frame(W, H, L + B, `Campus edge topology: ${e.accessSwitches || ''} E-series access switches in MC-LAG pairs uplinking to ${e.distribution || 'distribution'}, serving ${e.endpoints} client endpoints.`);
    wrap.innerHTML = topoViewport(svg) +
      `<div class="legend"><span><i style="background:${ACC}"></i>access (E-series SONiC)</span><span><i style="background:${DIST}"></i>distribution</span><span><i style="background:${ICLC}"></i>MC-LAG ICL</span>${mg ? `<span><i style="background:${MGC}"></i>OOB mgmt</span>` : ''}<span class="muted">campus: clients → E-series MC-LAG pairs → distribution · hover a switch for details · click one to jump to its BOM line · orange ⇄ = ICL peer-link · thin = client access (by others) · drag to pan, pinch/scroll to zoom</span></div>`;
    wireZoom();
    wireTopology();
  }

  /* ---------- Topology (color-coded per fabric, every connection drawn) --- */
  function renderTopology(res) {
    if (res.isEdge) return renderEdgeTopology(res);
    const wrap = $('#tab-topology'); wrap.innerHTML = '';
    const fabrics = res.fabrics.filter(f => f.network !== 'mgmt');
    const mg = res.fabrics.find(f => f.network === 'mgmt');
    const core = res.coreUplink;
    const PAL = T.pal;
    const fcolor = i => PAL[i % PAL.length];
    const MGC = T.oob, CORE_C = T.core;
    const multiTarget = new Set(fabrics.map(f => f.targetId)).size > 1;

    const expanded = TOPO_MODE === 'expanded';
    const EBW = 58, EGAP = 8;   // small uniform box/gap used only in expanded mode
    // spine/super-spine group COUNTS only (no drawing yet) — needed up front because expanded
    // mode's column pitch must be wide enough to fit the biggest tier in any given column
    const groupCounts = [];
    fabrics.forEach((f, i) => { if (!f.spine) return; const k = f.spineGroupKey || f.spine.model; let g = groupCounts.find(x => x.key === k); if (!g) { g = { key: k, count: f.totalPodSpines || f.spineCount || 2, superSpineCount: f.superSpineCount || 0, cols: [] }; groupCounts.push(g); } g.cols.push(i); });
    let colW = 280;
    if (expanded) {
      fabrics.forEach(f => { const cnt = f.fabricsN === 2 ? f.leavesPerFabric * 2 : f.totalLeaves; colW = Math.max(colW, cnt * (EBW + EGAP) + 60); });
      groupCounts.forEach(g => {
        colW = Math.max(colW, Math.ceil(g.count / g.cols.length) * (EBW + EGAP) + 60);
        if (g.superSpineCount) colW = Math.max(colW, Math.ceil(g.superSpineCount / g.cols.length) * (EBW + EGAP) + 60);
      });
    }
    const marginL = 120, marginR = 30, oobW = mg ? 208 : 0;
    const nCols = Math.max(1, fabrics.length);
    const W = Math.max(1000, marginL + marginR + nCols * colW + oobW);
    const colX = i => marginL + i * colW + colW / 2;
    const OFF = 76, leafBW = 120;

    // vertical tiers — every label band is ≥22px from its neighbour so nothing crowds
    const hasCore = !!core;
    const hasSuperSpine = fabrics.some(f => f.superSpine);
    const coreY = 14, coreH = 34;
    // border-leaf pair (when the BOM prices one) sits BETWEEN core and the top switch tier —
    // it terminates the core/DCI links, so drawing core straight into the spines would lie
    const hasBorder = !!(core && core.borderLeaf);
    const borderY = coreY + coreH + 24, borderH = 32;
    const borderBand = hasBorder ? borderH + 46 : 0;
    const superSpineY = hasCore ? (coreY + coreH + 26 + borderBand) : 22, superSpineH = 40, superSpineBot = superSpineY + superSpineH;
    const spineY = hasSuperSpine ? (superSpineBot + 46) : (hasCore ? (coreY + coreH + 26 + borderBand) : 22), spineH = 40, spineBot = spineY + spineH;
    const band = 100;                                                   // spine→leaf band (uplinks + 3 labels)
    const leafY = spineBot + band, leafH = 44, leafBot = leafY + leafH;
    const yIdent = spineBot + 26, yUp = spineBot + 52, yMeta = spineBot + 78;   // 3 labels, 26px apart
    const strandBand = 96;
    const hostY = leafBot + strandBand, hostH = 46, hostBot = hostY + hostH;
    const yPeer = leafBot + 18;                                         // peer-link / switch count (below leaf)
    const countY = hostBot + 20;                                        // connection-count band
    const busY = countY + 22;                                           // OOB mgmt bus
    const H = busY + 30;
    const spineHdrY = spineY - 9;
    const superSpineHdrY = superSpineY - 9;
    let L = '', B = '';   // L = links (under), B = boxes/text+halos (over)

    // breakout uplinks get a dashed stroke — visually distinct from a native same-speed link,
    // consuming the engine's already-catalog-validated uplinkBreakout/superSpineBreakout fields
    // (never recomputed here).
    const upLink = (x1, y1, x2, y2, c, fi, brk) => `<line data-role="uplink"${fab(fi)} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1.9" stroke-opacity="0.9"${brk ? ' stroke-dasharray="7 3"' : ''}/>`;
    const strand = (x1, y1, x2, y2, c, fi) => `<line data-role="strand"${fab(fi)} x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="1" stroke-opacity="0.4"/>`;
    // text label with a dark halo behind it, so it stays readable over crossing lines.
    // Width is measured on the RAW visible string; the OUTPUT is escaped (uses the outer esc).
    function tl(x, y, txt, color, size, weight, anchor) {
      anchor = anchor || 'middle'; weight = weight || 400; size = Math.max(size, 9);
      const w = String(txt).length * size * (weight >= 700 ? 0.63 : 0.57) + 8;
      const rx = anchor === 'middle' ? x - w / 2 : (anchor === 'end' ? x - w : x - 4);
      return `<rect x="${rx.toFixed(1)}" y="${(y - size).toFixed(1)}" width="${w.toFixed(1)}" height="${size + 5}" rx="3" fill="${T.bg}" fill-opacity="0.88"/>` +
        `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(txt)}</text>`;
    }

    const tier = (ly, a, b) => `<text x="10" y="${ly}" font-size="10.5" font-weight="700" fill="${T.faint}" letter-spacing="2">${a}</text>` + (b ? `<text x="10" y="${ly + 14}" font-size="10.5" font-weight="700" fill="${T.faint}" letter-spacing="2">${b}</text>` : '');
    if (core) B += tier(coreY + 21, 'CORE');
    if (hasSuperSpine) B += tier(superSpineY + 24, 'SUPER-', 'SPINE');
    B += tier(spineY + 24, hasSuperSpine ? 'POD-' : 'SPINE', hasSuperSpine ? 'SPINE' : null);
    B += tier(leafY + 20, 'LEAF /', 'ToR');
    B += tier(hostY + 24, 'SERVERS', '/ STORAGE');

    if (core) B += box(W / 2 - 172, coreY, 344, coreH, 'Core network (existing)', `${core.count}× ${core.speed} redundant · ${core.includeFar ? 'both sides quoted (Dell core)' : core.coreVendor === 'other' ? 'far side by customer vendor' : 'far side by others'}${core.longReach ? ' · 10km LR SMF' : ''}`, T.coreFill, CORE_C);
    // border-leaf pair — the dedicated core/DCI egress (EVPN-VXLAN border VTEP); ALL core
    // links land here, the pair then uplinks into the top switch tier like any leaf
    const borderXs = hasBorder ? [W / 2 - 110, W / 2 + 110] : null;
    if (hasBorder) {
      const bl = core.borderLeaf;
      const battr = `data-role="border"${tip(`${bl.model} · border-leaf pair — dedicated core/DCI egress (EVPN-VXLAN border VTEP), MC-LAG pair · click for BOM`)} data-bom-model="${esc(bl.model)}"`;
      borderXs.forEach((bx, bi) => {
        B += box(bx - 70, borderY, 140, borderH, bl.model, 'Border ' + (bi + 1), T.dedFill, CORE_C, battr);
        L += `<line x1="${bx}" y1="${borderY}" x2="${W / 2}" y2="${coreY + coreH}" stroke="${CORE_C}" stroke-width="1.6" stroke-opacity="0.85"/>`;
      });
      L += `<line x1="${borderXs[0] + 70}" y1="${borderY + borderH / 2}" x2="${borderXs[1] - 70}" y2="${borderY + borderH / 2}" stroke="${T.icl}" stroke-width="2.2" stroke-dasharray="4 3"/>`;
      B += tl(W / 2, borderY + borderH + 16, `border-leaf pair — core/DCI egress · ⇄ ICL`, CORE_C, 9.5, 700);
    }

    // spine groups (the POD-spine tier when a super-spine is present — 3-tier Clos)
    const groups = [];
    fabrics.forEach((f, i) => { if (!f.spine) return; const k = f.spineGroupKey || f.spine.model; let g = groups.find(x => x.key === k); if (!g) { g = { key: k, model: f.spine.model, count: f.totalPodSpines || f.spineCount || 2, dedicated: f.dedicated, superSpine: f.superSpine, superSpineCount: f.superSpineCount, cols: [] }; groups.push(g); } g.cols.push(i); });
    // ONLY the group that actually sources the core uplink gets drawn wired to it — the same
    // pick the engine makes (first non-dedicated spined fabric, else any spined fabric). A
    // DEDICATED spine (e.g. PowerScale back-end) never touches the core; drawing it wired
    // there would contradict both the BOM and the isolation the dedication exists for.
    const coreSrcFab = core ? (fabrics.find(f => f.spine && !f.dedicated) || fabrics.find(f => f.spine)) : null;
    const coreGroupKey = coreSrcFab ? (coreSrcFab.spineGroupKey || coreSrcFab.spine.model) : null;
    groups.forEach(g => {
      const cx = g.cols.map(colX).reduce((a, b) => a + b, 0) / g.cols.length;
      const n = expanded ? g.count : Math.min(g.count, 2), bw = expanded ? EBW : 140, gap = expanded ? EGAP : 20, tot = n * bw + (n - 1) * gap, sx0 = cx - tot / 2;
      g.spineXs = [];
      const podLabel = g.superSpine ? ` (pod-spine, ${g.count} total across pods)` : '';
      B += tl(cx, spineHdrY, `${g.dedicated ? 'DEDICATED · ' : ''}${g.model} · ${g.count} spines${podLabel}`, T.ink, 10.5, 700);
      const spineTip = `${g.model} · ${g.dedicated ? 'dedicated ' : ''}${g.superSpine ? 'pod-spine (3-tier Clos)' : 'spine'} · ${g.count} switch(es) · click for BOM`;
      const spineAttr = `data-role="spine"${tip(spineTip)} data-bom-model="${esc(g.model)}"`;
      for (let k = 0; k < n; k++) { const x = sx0 + k * (bw + gap) + bw / 2; g.spineXs.push(x); B += box(x - bw / 2, spineY, bw, spineH, g.model, g.count > 2 ? 'Spine ' + (k + 1) + ' /' + g.count : 'Spine ' + (k + 1), g.dedicated ? T.dedFill : T.spineFill, g.dedicated ? T.dedStroke : T.cyan, spineAttr); }
      if (!expanded && g.count > n) B += tl(cx + tot / 2 + 34, spineY + spineH / 2 + 3, `+${g.count - n} more`, T.ink, 10, 700);
      // core attaches to whatever TOPS the group that SOURCES the uplink — the super-spine
      // tier if 3-tier, else the spine itself; with a border-leaf pair, the pair (not the
      // core) is what the tier reaches. Dedicated groups never wire to core.
      if (core && !g.superSpine && g.key === coreGroupKey) g.spineXs.forEach(sx => {
        if (hasBorder) borderXs.forEach(bx => { L += `<line x1="${sx}" y1="${spineY}" x2="${bx}" y2="${borderY + borderH}" stroke="${CORE_C}" stroke-width="1.4" stroke-opacity="0.8"/>`; });
        else L += `<line x1="${sx}" y1="${spineY}" x2="${W / 2}" y2="${coreY + coreH}" stroke="${CORE_C}" stroke-width="1.6" stroke-opacity="0.85"/>`;
      });
    });

    // super-spine tier (3-tier Clos top tier) — one box row above the pod-spine groups it feeds,
    // full-mesh uplinks down to every drawn pod-spine box, and (if present) up to core.
    groups.filter(g => g.superSpine).forEach(g => {
      const cx = g.cols.map(colX).reduce((a, b) => a + b, 0) / g.cols.length;
      const n = expanded ? g.superSpineCount : Math.min(g.superSpineCount, 2), bw = expanded ? EBW : 140, gap = expanded ? EGAP : 20, tot = n * bw + (n - 1) * gap, sx0 = cx - tot / 2;
      const superXs = [];
      B += tl(cx, superSpineHdrY, `${g.superSpine.model} · ${g.superSpineCount} super-spines`, T.ink, 10.5, 700);
      const superTip = `${g.superSpine.model} · super-spine (3-tier Clos top tier) · ${g.superSpineCount} switch(es) · click for BOM`;
      const superAttr = `data-role="superspine"${tip(superTip)} data-bom-model="${esc(g.superSpine.model)}"`;
      for (let k = 0; k < n; k++) { const x = sx0 + k * (bw + gap) + bw / 2; superXs.push(x); B += box(x - bw / 2, superSpineY, bw, superSpineH, g.superSpine.model, g.superSpineCount > 2 ? 'Super ' + (k + 1) + ' /' + g.superSpineCount : 'Super ' + (k + 1), T.dedFill, T.dedStroke, superAttr); }
      if (!expanded && g.superSpineCount > n) B += tl(cx + tot / 2 + 34, superSpineY + superSpineH / 2 + 3, `+${g.superSpineCount - n} more`, T.ink, 10, 700);
      // pod-spine ↔ super-spine hop: consume the fields the engine already resolved (never
      // recompute the ratio here) — dashed when it's a breakout hop, plus an aggregate label.
      const gFab = fabrics[g.cols[0]];
      const gSuperBrk = gFab && gFab.superSpineBreakout;
      const gSuperCls = classAbbr(gSuperBrk ? gSuperBrk.class : (gFab && gFab.superSpineCableClass));
      g.spineXs.forEach(px => superXs.forEach(sx => { L += `<line x1="${px}" y1="${spineY}" x2="${sx}" y2="${superSpineBot}" stroke="${T.dedStroke}" stroke-width="1.4" stroke-opacity="0.75"${gSuperBrk ? ' stroke-dasharray="7 3"' : ''}/>`; }));
      const gSuperTxt = `${g.podUplinksToSuper || ''}× uplink(s)/pod-spine${gSuperCls ? ' ' + gSuperCls : ''}${gSuperBrk ? ` · ${gSuperBrk.ratio}×${gSuperBrk.low} breakout (${gSuperBrk.high} super-spine ports)` : ''}`;
      B += tl(cx, superSpineBot + 16, gSuperTxt, T.dedStroke, 9.5, 700);
      if (core && g.key === coreGroupKey) superXs.forEach(sx => {
        if (hasBorder) borderXs.forEach(bx => { L += `<line x1="${sx}" y1="${superSpineY}" x2="${bx}" y2="${borderY + borderH}" stroke="${CORE_C}" stroke-width="1.4" stroke-opacity="0.8"/>`; });
        else L += `<line x1="${sx}" y1="${superSpineY}" x2="${W / 2}" y2="${coreY + coreH}" stroke="${CORE_C}" stroke-width="1.6" stroke-opacity="0.85"/>`;
      });
    });

    // targets
    const tgts = [];
    // group columns by target INSTANCE (targetUid), not by platform — a design can carry
    // several targets on the same platform (e.g. five separate server pools) and each must
    // keep its own host box/label/unit-count instead of collapsing into one.
    fabrics.forEach((f, i) => { const key = f.targetUid != null ? f.targetUid : f.targetId; let t = tgts.find(x => x.key === key); if (!t) { t = { key, id: f.targetId, label: f.targetLabel || f.targetFamily, ai: f.workload === 'ai', units: f.unitsN || 0, cols: [] }; tgts.push(t); } t.cols.push(i); });

    // per fabric: THICK uplinks (under) then leaf pair + peer-link + halo'd labels (over)
    fabrics.forEach((f, i) => {
      const xc = colX(i), col = fcolor(i);
      const redTxt = f.interconnectQty ? (f.redundancyMethod === 'vlt' ? 'VLTi' : 'MC-LAG ICL') : (f.redundancyMethod === 'evpn-mh' ? 'EVPN-MH' : (f.redundancyMethod === 'independent-ab' ? 'A/B air-gap (no ICL)' : ''));
      const connShort = (f.connector || '').split(' ')[0];
      // tooltip + focus + click-to-BOM attrs for this fabric's leaf switches
      const leafTipTxt = `${f.leaf.model} · ${f.network} leaf/ToR · ${f.speed}` +
        (f.spine ? ` · ${f.uplinksPerLeaf || ''}×${f.uplinkSpeed || ''} uplinks → ${f.spineCount} spines · ${f.nonBlocking ? 'non-blocking 1:1' : '~' + (f.oversub || '?') + ':1'}` : ' · ToR pair (no spine)') +
        ` · ${f.totalLeaves} switch(es) · click for BOM`;
      const leafAttr = `data-role="leaf"${fab(i)}${tip(leafTipTxt)} data-bom-model="${esc(f.leaf.model)}"`;
      // EVERY switch drawn (up to 2 pairs / 4 singles per fabric; "+N more" when capped)
      const leafXs = [];
      if (f.fabricsN === 2) {
        const pairsN = f.leavesPerFabric, showPairs = expanded ? pairsN : Math.min(pairsN, 2);
        const bw = expanded ? EBW : (showPairs > 1 ? 56 : 104), gapIn = expanded ? EGAP : 6, gapOut = expanded ? EGAP * 2 : 26;
        const tot = showPairs * (2 * bw + gapIn) + (showPairs - 1) * gapOut;
        let x0 = xc - tot / 2, iclSegs = '';
        for (let pi = 0; pi < showPairs; pi++) {
          const lx1 = x0 + bw / 2, lx2 = x0 + bw + gapIn + bw / 2;
          leafXs.push(lx1, lx2);
          B += box(lx1 - bw / 2, leafY, bw, leafH, showPairs > 1 ? 'A' + (pi + 1) : f.leaf.model, showPairs > 1 ? '' : 'Leaf A', T.boxFill, col, leafAttr);
          B += box(lx2 - bw / 2, leafY, bw, leafH, showPairs > 1 ? 'B' + (pi + 1) : f.leaf.model, showPairs > 1 ? '' : 'Leaf B', T.boxFill, col, leafAttr);
          if (f.interconnectQty) iclSegs += `<line data-role="icl"${fab(i)} x1="${lx1 + bw / 2}" y1="${leafY + leafH / 2}" x2="${lx2 - bw / 2}" y2="${leafY + leafH / 2}" stroke="${T.icl}" stroke-width="2.5" stroke-dasharray="4 3"/>`;
          x0 += 2 * bw + gapIn + gapOut;
        }
        B += iclSegs;
        const more = (!expanded && pairsN > showPairs) ? ` · +${pairsN - showPairs} more pair(s)` : '';
        B += tl(xc, yPeer, (f.interconnectQty ? `⇄ ICL ${f.interconnectQty}× ${f.interconnectSpeed} · ` : '') + `${f.leaf.model} — ${f.totalLeaves} switches (${pairsN} pair${pairsN > 1 ? 's' : ''})${more}`, f.interconnectQty ? T.icl : T.dim, 9.5);
      } else {
        const showN = expanded ? f.totalLeaves : Math.min(f.totalLeaves, 4), bw = expanded ? EBW : (showN > 2 ? 56 : 104), gap = expanded ? EGAP : 14;
        const tot = showN * bw + (showN - 1) * gap;
        let x0 = xc - tot / 2;
        for (let k = 0; k < showN; k++) { const lx = x0 + bw / 2; leafXs.push(lx); B += box(lx - bw / 2, leafY, bw, leafH, showN > 2 ? 'L' + (k + 1) : f.leaf.model, showN > 2 ? '' : `×${f.totalLeaves}`, T.boxFill, col, leafAttr); x0 += bw + gap; }
        const more = (!expanded && f.totalLeaves > showN) ? ` · +${f.totalLeaves - showN} more` : '';
        B += tl(xc, yPeer, `${f.leaf.model} — ${f.totalLeaves} switch(es)${more}`, T.dim, 9.5);
      }
      // UPLINKS: every drawn leaf → every drawn spine (thick, fabric colour; dashed = breakout)
      if (f.spine) { const g = groups.find(x => x.key === (f.spineGroupKey || f.spine.model)); if (g) leafXs.forEach(lx => g.spineXs.forEach(sx => { L += upLink(lx, leafY, sx, spineBot, col, i, !!f.uplinkBreakout); })); }
      // three well-spaced, halo'd labels in the spine→leaf band
      B += tl(xc, yIdent, `${f.converged ? 'CONVERGED' : f.network.toUpperCase()} · ${f.speed}${f.workload === 'ai' ? ' RoCEv2' : ''}`, col, 10.5, 700);
      if (f.spine) {
        const upSpd = f.uplinkSpeed || (f.leaf.uplink && f.leaf.uplink.speed) || (f.workload === 'ai' ? f.speed : '100GbE');
        const ratioTxt = f.oversub ? ' · ' + (f.nonBlocking ? 'non-blocking 1:1' : '~' + f.oversub + ':1') : '';
        // aggregate, one line per fabric (not one per physical cable): base uplink count/speed,
        // the ITS cable class, then — only when the engine actually resolved a breakout for this
        // hop — its ratio/composition, e.g. "41×100GbE DAC → 41 spines · 4×100G breakout (400GbE spine ports)"
        const brk = f.uplinkBreakout;
        const cls = classAbbr(brk ? brk.class : f.uplinkCableClass);
        const brkTxt = brk ? ` · ${brk.ratio}×${brk.low} breakout (${brk.high} spine ports)` : '';
        B += tl(xc, yUp, `↑ ${f.uplinksPerLeaf || ''}×${upSpd}${cls ? ' ' + cls : ''} → ${f.spineCount} spines${ratioTxt}${brkTxt}`, col, 9.5, 700);
      }
      const meta = [redTxt, connShort].filter(Boolean).join(' · ');
      if (meta) B += tl(xc, yMeta, meta, T.dim, 9.5);
      f._leafXs = leafXs; f._col = col; f._xc = xc;
    });

    // ToR-only design with a core uplink: the BOM sources the core optics from the ToR pair
    // itself (it acts as the border) — draw that connection (it used to be silently missing,
    // leaving a floating core box that contradicted the BOM's inter-network line).
    if (core && !groups.length) {
      const f0 = fabrics.find(f => f._leafXs && f._leafXs.length);
      if (f0) f0._leafXs.slice(0, 2).forEach(lx => {
        L += `<line x1="${lx}" y1="${leafY}" x2="${W / 2}" y2="${coreY + coreH}" stroke="${CORE_C}" stroke-width="1.6" stroke-opacity="0.85"/>`;
      });
    }

    // host boxes + EVERY physical leaf↔host link (units × ports/unit); counts in a clean band below
    const STRAND_CAP = 24;
    tgts.forEach(t => {
      const xs = t.cols.map(colX), x1 = Math.min.apply(null, xs), x2 = Math.max.apply(null, xs), hcx = (x1 + x2) / 2, bw = (x2 - x1) + 200;
      const hx0 = hcx - bw / 2;
      t.cols.forEach(i => {
        const f = fabrics[i], colCx = colX(i), links = f.totalLinks || 0;
        const shown = Math.max(1, Math.min(links, STRAND_CAP)), spanW = colW - 84;
        for (let j = 0; j < shown; j++) {
          const hx = colCx - spanW / 2 + (shown > 1 ? spanW * j / (shown - 1) : spanW / 2);
          const lx = f._leafXs[j % f._leafXs.length];
          L += strand(lx, leafBot, hx, hostY, f._col, i);
        }
      });
      const kind = deviceKindFor(t.id, t.ai);
      const hostTip = `${t.label} · ${t.cols.map(i => `${fabrics[i].network} ${fabrics[i].totalLinks} links @ ${fabrics[i].speed}`).join(' · ')}`;
      B += deviceBox(hx0, hostY, bw, hostH, t.label, t.ai ? 'GPU / AI servers · 1 rail/GPU' : (kind === 'storage' ? 'storage appliance' : 'servers'), kind, `data-role="host"${fab(t.cols[0])}${tip(hostTip)}`);
      t.cols.forEach(i => {
        const f = fabrics[i], colCx = colX(i), links = f.totalLinks || 0, perUnit = f.linksPerUnit || 0, un = f.unitsN || 0;
        B += tl(colCx, countY, `${f.network}: ${links} links = ${un}×${perUnit}/unit${links > STRAND_CAP ? ' *' : ''}`, f._col, 9.5, 700);
      });
      t._hcx = hcx; t._hx0 = hx0; t._bw = bw;
    });

    // OOB — switch on the right, mgmt bus below the hosts, a drop into EVERY unit of every target
    if (mg) {
      const ox = W - marginR - oobW / 2;
      B += box(ox - 90, leafY, 180, leafH, mg.leaf.model, '×' + mg.totalLeaves, T.shellFill, MGC, `data-role="oob-switch"${tip(`${mg.leaf.model} · out-of-band management · ${mg.totalLinks} mgmt links · click for BOM`)} data-bom-model="${esc(mg.leaf.model)}"`);
      B += tl(ox, yIdent, `OOB · 1GbE · ${mg.leaf.model}`, MGC, 10.5, 700);
      const busX0 = (tgts.length ? Math.min.apply(null, tgts.map(t => t._hx0)) : marginL) + 6;
      L += `<line x1="${ox}" y1="${leafBot}" x2="${ox}" y2="${busY}" stroke="${MGC}" stroke-width="1.5" stroke-dasharray="5 3"/>`;
      L += `<line x1="${busX0}" y1="${busY}" x2="${ox}" y2="${busY}" stroke="${MGC}" stroke-width="1.5" stroke-dasharray="5 3"/>`;
      tgts.forEach(t => {
        const ticks = Math.max(1, Math.min(t.units || 1, 14)), span = t._bw - 44;
        for (let j = 0; j < ticks; j++) {
          const dx = t._hx0 + 22 + (ticks > 1 ? span * j / (ticks - 1) : span / 2);
          L += `<line data-role="oob" x1="${dx}" y1="${busY}" x2="${dx}" y2="${hostBot}" stroke="${MGC}" stroke-width="1" stroke-opacity="0.55" stroke-dasharray="3 2"/>`;
        }
      });
      B += tl((busX0 + ox) / 2, busY - 6, `iDRAC / BMC → every unit · ${mg.totalLinks} links`, MGC, 9.5, 700);
    }

    const topoDesc = (() => {
      const groups2 = fabrics.filter(f => f.spine).length;
      const leafTotal = fabrics.reduce((s, f) => s + (f.totalLeaves || 0), 0);
      const spineBits = groups.map(g => `${g.count}× ${g.model}`).join(', ');
      const fabBits = fabrics.map(f => `${f.network} at ${f.speed}`).join('; ');
      return `Network topology: ${leafTotal} leaf/ToR switch(es)${spineBits ? ' and spine tier ' + spineBits : ' (top-of-rack, no spine)'}. Fabrics: ${fabBits}. ${mg ? 'Out-of-band management to every unit.' : ''}`;
    })();
    const svg = frame(W, H, L + B, topoDesc);
    const ctx = res.context || {};
    const capBits = [];
    if (ctx.placementLabel) capBits.push(ctx.placementLabel);
    if (ctx.breakout && ctx.breakout !== 'none') capBits.push('breakout: ' + ctx.breakout);
    const cap = capBits.length ? ' · ' + capBits.join(' · ') : '';
    // fabric chips are clickable (data-fabric) to focus; a ✓ marks a non-blocking fabric
    let legend = fabrics.map((f, i) => `<span data-fabric="${i}" title="Click to focus this fabric"><i style="background:${fcolor(i)}"></i>${esc(f.converged ? 'converged' : f.network)}${multiTarget ? ' · ' + esc(f.targetFamily.split(' ')[0]) : ''}${f.nonBlockingReq && f.nonBlocking ? ' <b style="color:' + T.server + '">1:1 ✓</b>' : ''}</span>`).join('');
    const kindsPresent = [...new Set(tgts.map(t => deviceKindFor(t.id, t.ai)))];
    const kindLbl = { server: 'servers', storage: 'storage (drive-slot shape)', gpu: 'GPU servers' };
    legend += kindsPresent.map(k => `<span><i style="background:${deviceColor(k)}"></i>${kindLbl[k]}</span>`).join('');
    legend += (mg ? `<span><i style="background:${MGC}"></i>OOB mgmt</span>` : '') + (core ? `<span><i style="background:${CORE_C}"></i>core</span>` : '');
    // Logical/Expanded — NOT "Physical": the engine has no per-instance rack assignment to
    // draw a real placement from (GAPS.md G-014), so expanded only uncaps the SAME node set,
    // grouped by fabric/role, never inventing rack membership.
    const viewToggle = `<div class="view-toggle" role="group" aria-label="Diagram detail level">` +
      `<button type="button" data-view="logical" class="${!expanded ? 'active' : ''}" aria-pressed="${!expanded}">Logical</button>` +
      `<button type="button" data-view="expanded" class="${expanded ? 'active' : ''}" aria-pressed="${expanded}" title="Every switch instance drawn individually, grouped by fabric/role — no rack placement implied">Expanded</button>` +
      `</div>`;
    wrap.innerHTML = viewToggle + topoViewport(svg) +
      `<div class="legend">${legend}<span class="muted">💡 hover a switch for details · click one to jump to its BOM line · click a fabric chip to focus it · drag to pan, pinch/scroll to zoom · thick = uplinks (dashed = breakout) · thin = host↔leaf · amber ⇄ = peer-link · grey dashed = OOB${cap}</span></div>`;
    wireZoom();
    wireTopology();
    wireViewToggle();
  }
  function wireViewToggle() {
    const grp = $('#tab-topology .view-toggle'); if (!grp) return;
    grp.onclick = ev => {
      const b = ev.target.closest('[data-view]'); if (!b) return;
      const m = b.dataset.view === 'expanded' ? 'expanded' : 'logical';
      if (m === TOPO_MODE) return;
      TOPO_MODE = m;
      if (LAST) renderTopology(LAST);
    };
  }

  /* ---------- Rack elevation (real cabling: every host → ITS leaf, leaf → spine
   * uplink trunks, ICL between pair members, OOB bus → every unit) ---------- */
  function renderRack(res) {
    if (((res.context && res.context.racks) || 1) > 1 && !res.isEdge) return renderRackMulti(res);
    const wrap = $('#tab-rack'); wrap.innerHTML = '';
    const fabrics = res.fabrics.filter(f => f.network !== 'mgmt');
    const PAL = T.pal;
    const fcolor = i => PAL[i % PAL.length];
    const U = 42, uH = 12, top = 34, rx = 64, rw = 230;
    const chGap = 11, ch0 = rx + rw + 18;                       // one cable channel per fabric
    const nCh = Math.max(1, Math.min(fabrics.length, PAL.length));
    const xMgmt = ch0 + nCh * chGap + 14, W = xMgmt + 46, H = top + U * uH + 30;
    const MGC = T.oob;
    let items = [];
    res.bom.filter(b => b.category === 'Switch' || b.category === 'Management').forEach(b => {
      const sw = window.CATALOG.switches.find(x => x.model === b.model) || { rackU: 1 };
      const type = b.category === 'Management' ? 'mgmt' : 'net';
      for (let i = 0; i < b.qty; i++) items.push({ label: b.model, model: b.model, u: sw.rackU || 1, type });
    });
    const targets = res.targets || [{ platform: res.platform, units: res.context.units }];
    const hostU = res.isEdge ? 1 : 2, hostLabel = res.isEdge ? 'client / endpoint' : null;
    let budget = U - items.reduce((s, i) => s + i.u, 0);
    let totalHosts = 0, shownHosts = 0;
    targets.forEach(t => {
      totalHosts += t.units;
      const kind = res.isEdge ? 'server' : deviceKindFor(t.platform.id, t.platform.workload === 'ai');
      const show = Math.min(t.units, Math.max(0, Math.floor(budget / hostU)));
      const tKey = t.uid != null ? t.uid : t.platform.id;
      for (let i = 0; i < show; i++) { items.push({ label: hostLabel || t.platform.family, u: hostU, type: 'host', kind, targetUid: tKey }); budget -= hostU; shownHosts++; }
    });

    // Network switches ALWAYS consume the 42U budget before host units. Push order already put
    // switches first, but that's incidental (a future edit to either loop could interleave them
    // silently) — an explicit stable sort makes the priority structural, not accidental. Stays
    // stable within each group (BOM order for switches, target order for hosts).
    const typeOrder = { net: 0, mgmt: 0, host: 1 };
    items.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);

    // rack shell
    let s = `<rect x="${rx - 8}" y="${top - 8}" width="${rw + 16}" height="${U * uH + 16}" rx="5" fill="${T.shellFill}" stroke="${T.faint}" stroke-width="1.4"/>`;
    for (let u = 0; u <= U; u += 1) { const y = top + u * uH; if (u % 2 === 0) s += `<text x="${rx - 14}" y="${y + 4}" text-anchor="end" font-size="8" fill="${T.faint}">${U - u}</text>`; }
    // place items: device-aware unit faces (switch ports / server LEDs / drive slots / GPU blocks)
    let cursor = 0; const placed = [];
    items.forEach(it => {
      if (cursor + it.u > U) return;
      const y = top + cursor * uH, hh = it.u * uH - 1, yc = y + hh / 2;
      const col = it.type === 'mgmt' ? MGC : (it.type === 'net' ? T.cyan : deviceColor(it.kind));
      s += `<rect x="${rx}" y="${y}" width="${rw}" height="${hh}" rx="2" fill="${it.type === 'host' ? T.hostFill : T.boxFill}" stroke="${col}" stroke-width="1"/>`;
      let deco = '';
      if (it.type === 'net' || it.type === 'mgmt') {          // switch face: a row of ports
        for (let p = 0; p < 12; p++) deco += `<rect x="${rx + 8 + p * 6}" y="${(y + hh - 5.5).toFixed(1)}" width="4" height="3" fill="${col}" fill-opacity="0.55"/>`;
      } else if (it.kind === 'storage') {                     // drive shelf
        for (let p = 0; p < 10; p++) deco += `<rect x="${rx + 8 + p * 7}" y="${(y + hh - 7).toFixed(1)}" width="2.6" height="5" rx="0.8" fill="${col}" fill-opacity="0.7"/>`;
      } else if (it.kind === 'gpu') {                         // GPU sled blocks
        for (let p = 0; p < 8; p++) deco += `<rect x="${rx + 8 + p * 9}" y="${(y + hh - 7.5).toFixed(1)}" width="5.5" height="5.5" rx="1" fill="${col}" fill-opacity="0.75"/>`;
      } else {                                                // server LEDs
        for (let p = 0; p < 3; p++) deco += `<circle cx="${rx + 10 + p * 7}" cy="${(y + hh - 5).toFixed(1)}" r="1.6" fill="${col}" fill-opacity="0.9"/>`;
      }
      s += deco + `<text x="${rx + rw / 2}" y="${yc + (it.u > 1 ? 0 : 3)}" text-anchor="middle" font-size="10" font-weight="600" fill="${T.ink}">${it.label}</text>`;
      placed.push(Object.assign({ yc, y }, it)); cursor += it.u;
    });

    /* cabling — rounded elbow: out of the unit, along the channel, into the far unit */
    const elbow = (y0, y1, x) => {
      if (Math.abs(y1 - y0) < 2) return `M ${rx + rw} ${y0} H ${x}`;
      const r = Math.min(5, Math.abs(y1 - y0) / 2), d = y1 > y0 ? 1 : -1;
      return `M ${rx + rw} ${y0} H ${x - r} Q ${x} ${y0} ${x} ${y0 + d * r} V ${y1 - d * r} Q ${x} ${y1} ${x - r} ${y1} H ${rx + rw}`;
    };
    const port = (x, y, c) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${c}"/>`;
    const nets = placed.filter(p => p.type === 'net'), hosts = placed.filter(p => p.type === 'host'), oob = placed.find(p => p.type === 'mgmt');
    let cab = '';
    fabrics.slice(0, nCh).forEach((f, fi) => {
      const x = ch0 + fi * chGap, col = fcolor(fi);
      const leaves = nets.filter(p => p.model === f.leaf.model);
      if (!leaves.length) return;
      // every shown host of this fabric's target → its leaf (per target INSTANCE, not platform).
      // A converged fabric's OWN targetUid is synthetic (spans several real targets) — host
      // boxes still carry each contributor's REAL target uid, so match against the whole
      // membership instead of the single synthetic key (review-confirmed: without this, a
      // converged fabric drew its switches and hosts but ZERO cabling between them).
      const memberKeys = f.converged ? new Set(f._convergedFrom.map(m => m.target.uid)) : new Set([f.targetUid != null ? f.targetUid : f.targetId]);
      hosts.filter(h => memberKeys.has(h.targetUid)).forEach((h, hi) => {
        const leaf = leaves[hi % leaves.length];
        cab += `<path d="${elbow(h.yc, leaf.yc, x)}" fill="none" stroke="${col}" stroke-width="1.1" stroke-opacity="0.75"/>` +
          port(rx + rw + 1.5, h.yc, col) + port(rx + rw + 1.5, leaf.yc, col);
      });
      // leaf → spine uplink trunk (when the spine lives in this rack)
      const spines = f.spine ? nets.filter(p => p.model === f.spine.model) : [];
      if (spines.length) leaves.forEach(lf => spines.forEach(sp => {
        cab += `<path d="${elbow(lf.yc, sp.yc, x + 4)}" fill="none" stroke="${col}" stroke-width="1.6" stroke-dasharray="6 3" stroke-opacity="0.85"/>`;
      }));
      // ICL between the pair members (short switch-to-switch cables, left side)
      if (f.interconnectQty && leaves.length >= 2) {
        const xL = rx - 12, r = 4, a = leaves[0].yc, b = leaves[1].yc, d = b > a ? 1 : -1;
        cab += `<path d="M ${rx} ${a} H ${xL + r} Q ${xL} ${a} ${xL} ${a + d * r} V ${b - d * r} Q ${xL} ${b} ${xL + r} ${b} H ${rx}" fill="none" stroke="${T.icl}" stroke-width="1.8" stroke-dasharray="4 3"/>` +
          port(rx - 1.5, a, T.icl) + port(rx - 1.5, b, T.icl);
      }
    });
    // OOB bus: dashed slate → EVERY unit (hosts + every switch)
    if (oob) {
      const ys = placed.map(p => p.yc);
      cab += `<line x1="${xMgmt}" y1="${Math.min.apply(null, ys)}" x2="${xMgmt}" y2="${Math.max.apply(null, ys)}" stroke="${MGC}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
      placed.forEach(p => { cab += `<line x1="${rx + rw}" y1="${p.yc}" x2="${xMgmt}" y2="${p.yc}" stroke="${MGC}" stroke-width="${p === oob ? 1.4 : 1}" stroke-opacity="${p === oob ? 1 : 0.6}" stroke-dasharray="3 2"/>` + port(xMgmt, p.yc, MGC); });
    }
    s += cab;
    s += `<text x="${ch0 + (nCh - 1) * chGap / 2}" y="${top - 16}" text-anchor="middle" font-size="9" font-weight="700" fill="${T.cyan}" letter-spacing="1.5">DATA</text>`;
    if (oob) s += `<text x="${xMgmt}" y="${top - 16}" text-anchor="middle" font-size="9" font-weight="700" fill="${MGC}" letter-spacing="1.5">OOB</text>`;
    if (totalHosts > shownHosts) s += `<text x="${rx + rw / 2}" y="${top + U * uH + 20}" text-anchor="middle" font-size="10" fill="${T.muted}">+${totalHosts - shownHosts} more ${res.isEdge ? 'clients' : 'host units'} (additional racks)</text>`;
    const svg = frame(W, H, s, `Rack elevation: network switches on top, ${totalHosts} ${res.isEdge ? 'client devices' : 'host units'} below, with data cabling to the top-of-rack switches and out-of-band management to every unit.`);
    let legend = fabrics.slice(0, nCh).map((f, i) => `<span><i style="background:${fcolor(i)}"></i>${f.network} cabling</span>`).join('');
    if (fabrics.some(f => f.interconnectQty)) legend += `<span><i style="background:${T.icl}"></i>ICL (pair, left side)</span>`;
    if (oob) legend += `<span><i style="background:${MGC}"></i>OOB → every unit</span>`;
    const racksN = (res.context && res.context.racks) || 1;
    const rackTitle = racksN > 1
      ? `Rack 1 of ${racksN} (representative) — FDC pattern: each node rack repeats its ToR pair + OOB switch, spines sit in a dedicated rack; ≈${Math.ceil(totalHosts / racksN)} host units/rack`
      : 'Single-rack schematic';
    // per-rack power / cooling / weight rollup (this rack's placed items)
    const rackSwitches = placed.filter(p => p.type === 'net' || p.type === 'mgmt').map(p => p.model || p.label);
    const rackHosts = placed.filter(p => p.type === 'host').map(p => p.kind || 'server');
    const roll = powerRollup(rackSwitches, rackHosts, hostU);
    wrap.innerHTML = `<div class="diagram-wrap">${svg}</div>` +
      `<div class="rack-power">${powerLine(roll, U)}</div>` +
      `<div class="legend">${legend}<span class="muted">solid = host→leaf · dashed colour = leaf→spine uplinks · amber = peer-link · dots = patched ports</span></div>` +
      `<p class="muted">${rackTitle} — network on top, ${res.isEdge ? 'clients' : 'host units'} below, cable channels on the right (one per fabric), OOB reaches every unit including the switches. ${racksN > 1 ? 'Cross-rack runs (leaf→spine, centralized fabrics) are AOC/fiber.' : 'Multi-rack designs span additional racks —'} Verify U budget, power &amp; cooling.</p>`;
  }

  /* ---------- Multi-rack elevation (FDC pattern): spine rack + node racks,
   * with the inter-rack cabling drawn — uplink trunks (AOC/fiber) and OOB aggregation. */
  function renderRackMulti(res) {
    const wrap = $('#tab-rack'); wrap.innerHTML = '';
    const racksN = res.context.racks;
    const fabrics = res.fabrics.filter(f => f.network !== 'mgmt');
    const mg = res.fabrics.find(f => f.network === 'mgmt');
    const PAL = T.pal, fcolor = i => PAL[i % PAL.length];

    /* ---- compose frames ---- */
    const frames = [];
    // spine rack: every spine group + leaves of CENTRALIZED fabrics of rack-spanning targets
    const spineGroups = [], superSpineGroups = [];
    fabrics.forEach(f => {
      if (!f.spine) return;
      if (!spineGroups.some(g => g.key === f.spineGroupKey)) spineGroups.push({ key: f.spineGroupKey, model: f.spine.model, qty: f.totalPodSpines || f.spineCount });
      if (f.superSpine && !superSpineGroups.some(g => g.key === f.spineGroupKey)) superSpineGroups.push({ key: f.spineGroupKey, model: f.superSpine.model, qty: f.superSpineCount });
    });
    const tgtSpan = {}; (res.targets || []).forEach(t => { tgtSpan[t.uid != null ? t.uid : t.id] = t.racksSpanned || 1; });
    const central = fabrics.filter(f => !f.perRack && (tgtSpan[f.targetUid != null ? f.targetUid : f.targetId] || 1) > 1 && f.workload !== 'ai');
    const items0 = [];
    superSpineGroups.forEach(g => { for (let i = 0; i < Math.min(g.qty, 4); i++) items0.push({ label: g.model + ' (super-spine)', u: 1, type: 'net', model: g.model }); if (g.qty > 4) items0.push({ label: '+' + (g.qty - 4) + ' more ' + g.model + ' (super-spine)', u: 1, type: 'note' }); });
    spineGroups.forEach(g => { for (let i = 0; i < Math.min(g.qty, 4); i++) items0.push({ label: g.model, u: 1, type: 'net', model: g.model }); if (g.qty > 4) items0.push({ label: '+' + (g.qty - 4) + ' more ' + g.model, u: 1, type: 'note' }); });
    central.forEach((f, i) => { for (let k = 0; k < Math.min(f.totalLeaves, 2); k++) items0.push({ label: f.leaf.model + ' (' + f.network + ')', u: 1, type: 'net', model: f.leaf.model }); if (f.totalLeaves > 2) items0.push({ label: '+' + (f.totalLeaves - 2) + ' more', u: 1, type: 'note' }); });
    // border-leaf pair (core/DCI egress) lives in the spine rack — it's BOM-priced hardware,
    // so the elevation places it like every other switch (single-rack view already did)
    if (res.coreUplink && res.coreUplink.borderLeaf) {
      const bl = res.coreUplink.borderLeaf;
      for (let i = 0; i < (bl.qty || 2); i++) items0.push({ label: bl.model + ' (border-leaf)', u: 1, type: 'net', model: bl.model });
    }
    if (mg) items0.push({ label: mg.leaf.model + ' (OOB agg)', u: 1, type: 'mgmt', model: mg.leaf.model });
    if (items0.length) frames.push({ title: 'Spine rack', sub: 'spines · centralized fabrics · OOB aggregation', items: items0, isSpine: true });

    // A converged fabric spans several real targets sharing ONE physical switch pair — pick a
    // single "hosting" target (the first contributor in the customer's stated order) to draw
    // the switch boxes; every OTHER contributor gets a cross-reference note instead, so the
    // elevation never implies twice the physical hardware.
    const convergedHostKey = new Map();
    fabrics.filter(f => f.converged).forEach(f => {
      const host = (res.targets || []).find(t => f._convergedFrom.some(m => m.target.uid === (t.uid != null ? t.uid : t.id)));
      if (host) convergedHostKey.set(f, host.uid != null ? host.uid : host.id);
    });

    // per-target frames
    (res.targets || []).forEach(t => {
      const span = t.racksSpanned || 1;
      const tKey = t.uid != null ? t.uid : t.id;
      const isConvergedMember = f => f.converged && f._convergedFrom.some(m => m.target.uid === tKey);
      const tf = fabrics.filter(f => (f.targetUid != null ? f.targetUid : f.targetId) === tKey ||
        (isConvergedMember(f) && convergedHostKey.get(f) === tKey));
      const sharedElsewhere = fabrics.filter(f => isConvergedMember(f) && convergedHostKey.get(f) !== tKey);
      const kind = deviceKindFor(t.id, t.platform && t.platform.workload === 'ai');
      if (span > 1) {
        const prim = tf.find(f => f.perRack) || tf[0];
        const perRackLeaves = prim ? Math.max(1, Math.round(prim.totalLeaves / span)) : 2;
        const hostsPerRack = Math.ceil(t.units / span);
        const items = [];
        if (prim) {
          for (let i = 0; i < perRackLeaves; i++) items.push({ label: prim.leaf.model + ' (' + (prim.converged ? 'converged' : 'ToR') + ' ' + String.fromCharCode(65 + i) + ')', u: 1, type: 'net', model: prim.leaf.model });
        } else if (sharedElsewhere.length) {
          // this target's own fabric got merged and is HOSTED (drawn) in another rack's frame —
          // reference it instead of a nameless 'ToR' placeholder (review-confirmed: the
          // placeholder overstated the hardware, implying dedicated switches per rack that
          // don't exist in the BOM)
          sharedElsewhere.forEach(f => items.push({ label: `Shares ${f.leaf.model} (converged) — see another rack's frame`, u: 1, type: 'note' }));
        } else {
          for (let i = 0; i < perRackLeaves; i++) items.push({ label: 'ToR (ToR ' + String.fromCharCode(65 + i) + ')', u: 1, type: 'net' });
        }
        items.push({ label: (mg ? mg.leaf.model : 'OOB') + ' (OOB)', u: 1, type: 'mgmt', model: mg && mg.leaf.model });
        const showH = Math.min(hostsPerRack, 9);
        for (let i = 0; i < showH; i++) items.push({ label: t.platform.family, u: 2, type: 'host', kind });
        if (hostsPerRack > showH) items.push({ label: '+' + (hostsPerRack - showH) + ' more hosts', u: 1, type: 'note' });
        frames.push({ title: 'Node rack ×' + span, sub: hostsPerRack + '× ' + t.platform.family + ' each · ToR pair + OOB per rack', items, repeat: span, tgt: tKey });
      } else {
        const items = [];
        tf.forEach(f => { const tag = f.converged ? 'converged' : (tf.length > 1 ? f.network : 'ToR'); for (let k = 0; k < Math.min(f.totalLeaves, 2); k++) items.push({ label: f.leaf.model + ' (' + tag + ')', u: 1, type: 'net', model: f.leaf.model }); });
        sharedElsewhere.forEach(f => items.push({ label: `Shares ${f.leaf.model} (converged) with another rack — see that frame`, u: 1, type: 'note' }));
        items.push({ label: (mg ? mg.leaf.model : 'OOB') + ' (OOB)', u: 1, type: 'mgmt' });
        const showH = Math.min(t.units, 8);
        for (let i = 0; i < showH; i++) items.push({ label: t.platform.family, u: 2, type: 'host', kind });
        if (t.units > showH) items.push({ label: '+' + (t.units - showH) + ' more', u: 1, type: 'note' });
        frames.push({ title: t.platform.family + ' rack', sub: t.units + ' unit(s) · own ToR pair', items, tgt: tKey });
      }
    });
    const shown = frames.slice(0, 4), extra = frames.length - shown.length;

    /* ---- draw ---- */
    const fw = 200, gap = 56, mL = 18, top = 64, uH = 11, maxU = 24;
    const W = mL * 2 + shown.length * (fw + gap) - gap, fh = maxU * uH + 34, H = top + fh + 74;
    let s2 = '';
    const frameX = i => mL + i * (fw + gap);
    shown.forEach((fr, i) => {
      const x = frameX(i);
      s2 += `<rect data-role="rack-frame" x="${x}" y="${top}" width="${fw}" height="${fh}" rx="5" fill="${T.shellFill}" stroke="${T.faint}" stroke-width="1.4"/>`;
      s2 += `<text x="${x + fw / 2}" y="${top - 22}" text-anchor="middle" font-size="11" font-weight="700" fill="${T.ink}" letter-spacing="1">${fr.title.toUpperCase()}${fr.repeat ? '  (×' + fr.repeat + ')' : ''}</text>`;
      s2 += `<text x="${x + fw / 2}" y="${top - 8}" text-anchor="middle" font-size="8.5" fill="${T.muted}">${fr.sub}</text>`;
      let cu = 0;
      fr.items.forEach(it => {
        if (cu + it.u > maxU) return;
        const y = top + 8 + cu * uH, hh = it.u * uH - 2;
        if (it.type === 'note') { s2 += `<text x="${x + fw / 2}" y="${y + 8}" text-anchor="middle" font-size="8.5" fill="${T.muted}">${it.label}</text>`; cu += it.u; return; }
        const col = it.type === 'mgmt' ? T.oob : (it.type === 'net' ? T.cyan : deviceColor(it.kind));
        s2 += `<rect x="${x + 8}" y="${y}" width="${fw - 16}" height="${hh}" rx="2" fill="${it.type === 'host' ? T.hostFill : T.boxFill}" stroke="${col}" stroke-width="1"/>` +
          `<text x="${x + fw / 2}" y="${y + hh / 2 + 3}" text-anchor="middle" font-size="9" font-weight="600" fill="${T.ink}">${it.label}</text>`;
        cu += it.u;
      });
      // per-rack power / cooling estimate for THIS rack type
      const rswitch = fr.items.filter(it => it.type === 'net' || it.type === 'mgmt').map(it => it.model).filter(Boolean);
      const rhost = fr.items.filter(it => it.type === 'host').map(it => it.kind || 'server');
      const rr = powerRollup(rswitch, rhost, 2);
      s2 += `<text x="${x + fw / 2}" y="${top + fh - 6}" text-anchor="middle" font-size="8" font-weight="700" fill="${T.storage}">⚡ ≈ ${rr.kw.toFixed(1)} kW · ${(rr.btu / 1000).toFixed(1)}k BTU/hr${fr.repeat ? ' /rack' : ''}</text>`;
      fr._x = x; fr._roll = rr; fr._repeat = fr.repeat || 1;
    });
    // inter-rack cabling → spine rack
    const spineIdx = shown.findIndex(f => f.isSpine);
    if (spineIdx >= 0) {
      const sx = frameX(spineIdx) + fw / 2;
      shown.forEach((fr, i) => {
        if (i === spineIdx) return;
        const x = frameX(i) + fw / 2;
        const yTrunk = top + fh + 20, yOob = top + fh + 40;
        s2 += `<path data-role="interrack" d="M ${x} ${top + fh} V ${yTrunk} H ${sx} V ${top + fh}" fill="none" stroke="${T.cyan}" stroke-width="1.8"/>`;
        s2 += `<path data-role="interrack-oob" d="M ${x - 14} ${top + fh} V ${yOob} H ${sx - 14} V ${top + fh}" fill="none" stroke="${T.oob}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
      });
      s2 += `<text x="${W / 2}" y="${top + fh + 16}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${T.cyan}">↑ leaf→spine uplinks — CROSS-RACK: AOC 7–30 m / structured fiber (never in-rack DAC)</text>`;
      s2 += `<text x="${W / 2}" y="${top + fh + 54}" text-anchor="middle" font-size="8.5" fill="${T.oob}">OOB aggregation — each rack's OOB switch uplinks to the spine rack (1/rack)</text>`;
    }
    if (extra > 0) s2 += `<text x="${W - 6}" y="${top - 22}" text-anchor="end" font-size="9" fill="${T.muted}">+${extra} more rack type(s)</text>`;

    const svg = frame(W, H, s2, `Multi-rack elevation for a ${racksN}-rack deployment: a dedicated spine rack beside node racks (each with a top-of-rack switch pair and its own out-of-band switch), with inter-rack uplink trunks and OOB aggregation drawn.`);
    // deployment-wide power/heat total (each frame × how many racks of that type)
    const totalKw = shown.reduce((s, fr) => s + (fr._roll ? fr._roll.kw * (fr._repeat || 1) : 0), 0);
    const totalBtu = shown.reduce((s, fr) => s + (fr._roll ? fr._roll.btu * (fr._repeat || 1) : 0), 0);
    wrap.innerHTML = `<div class="diagram-wrap">${svg}</div>` +
      `<div class="rack-power">⚡ Whole deployment ≈ <b>${totalKw.toFixed(1)} kW</b> · cooling ≈ ${totalBtu.toLocaleString()} BTU/hr across ${racksN} racks <span class="muted">— planning estimate; confirm with Dell EIPT</span></div>` +
      `<div class="legend"><span><i style="background:${T.cyan}"></i>network / uplink trunk</span><span><i style="background:${T.oob}"></i>OOB (per rack + aggregation)</span><span><i style="background:${T.server}"></i>servers</span><span><i style="background:${T.storage}"></i>storage</span><span><i style="background:${T.gpu}"></i>GPU</span></div>` +
      `<p class="muted">${racksN}-rack deployment (FDC pattern): each node rack repeats its ToR pair + OOB switch (in-rack host runs stay DAC); spines and centralized fabrics live in the spine rack. Everything BETWEEN racks — leaf→spine uplinks, hosts reaching centralized fabrics, OOB aggregation — is cross-rack cabling: AOC 7–30 m in-row or structured fiber, sized per actual rack distances. Verify per-rack U budget, power &amp; cooling.</p>`;
  }

  /* ---------- Checks ---------- */
  function renderChecks(res) {
    const wrap = $('#tab-checks'); wrap.innerHTML = '';
    res.warnings.forEach(w => {
      wrap.appendChild(el('div', { className: 'check ' + esc(w.severity) },
        `<div class="sev">${esc(w.severity)}</div><div class="msg">${esc(w.message)}${w.source ? `<span class="src">↳ ${esc(w.source)}</span>` : ''}</div>`));
    });
    const flagged = res.warnings.filter(w => w.severity !== 'info').length;
    $('#checks-badge').textContent = flagged || '';
  }

  /* ---------- Exports ---------- */
  // A sandboxed embedding context (e.g. this page loaded inside a restricted iframe — no
  // `allow-downloads`/`allow-popups`) silently swallows an <a download> click: no error, no
  // event, the file just never appears. There is no reliable way to detect that failure after
  // the fact, so when we're inside ANY iframe we skip straight to a fallback that's guaranteed
  // to work under every permission set — an on-page panel with the raw content, selectable and
  // copyable, no browser download/popup permission required at all.
  function inIframe() { try { return window.self !== window.top; } catch (e) { return true; } }
  function showExportFallback(name, data) {
    const back = document.createElement('div'); back.className = 'export-fallback-backdrop';
    back.innerHTML = `<div class="export-fallback" role="dialog" aria-label="Export ${esc(name)}">
      <h3>Couldn't auto-download "${esc(name)}"</h3>
      <p>This page is running inside an embedded/restricted view that blocks direct file downloads. Copy the content below and save it yourself (as <b>${esc(name)}</b>), or open this tool outside the embed and try again — nothing here left your browser.</p>
      <textarea readonly spellcheck="false"></textarea>
      <div class="ef-actions">
        <button type="button" class="ghost" data-act="close">Close</button>
        <button type="button" class="ghost" data-act="copy">📋 Copy to clipboard</button>
      </div>
    </div>`;
    const ta = back.querySelector('textarea'); ta.value = data;
    back.querySelector('[data-act="close"]').addEventListener('click', () => back.remove());
    back.addEventListener('click', e => { if (e.target === back) back.remove(); });
    back.querySelector('[data-act="copy"]').addEventListener('click', () => {
      const done = () => { const btn = back.querySelector('[data-act="copy"]'); btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = '📋 Copy to clipboard', 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data).then(done, () => { ta.select(); document.execCommand('copy'); done(); });
      else { ta.select(); document.execCommand('copy'); done(); }
    });
    document.body.appendChild(back);
    ta.focus(); ta.select();
  }
  function download(name, type, data) {
    if (inIframe()) { showExportFallback(name, data); return; }
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { showExportFallback(name, data); }
  }
  function exportCSV(res) {
    const rows = [['Category', 'Vendor', 'Item', 'Qty', 'Dell P/N', 'Verify', 'Note', 'Source']];
    res.bom.forEach(b => rows.push([b.category, b.vendor, b.item, b.qty, b.dellPN, b.verify ? 'YES' : '', b.note || '', b.source || '']));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    download('dell-networking-bom.csv', 'text/csv', csv);
  }

  /* ---------- Copy BOM as plain text — two very different moments ----------
   * 'full' — every category (incl. Software/Compute/Storage context), with Dell P/N +
   *          notes/source. Paste into an email, Teams/Slack, or a doc.
   * 'ooo'  — a Teams-ready quick message: SWITCH COUNTS ONLY (no cables, no optics, no
   *          part numbers, no server/storage lines) — for firing a rough build to a
   *          colleague from a phone; everything else waits until back at the laptop. */
  const CAT_LABEL_TXT = { 'Switch': 'SWITCHES', 'Management': 'OUT-OF-BAND MANAGEMENT', 'Cable/Optic': 'CABLES & OPTICS',
    'Software': 'MANAGEMENT & AUTOMATION', 'Compute': 'COMPUTE (CONTEXT)', 'Storage': 'STORAGE (CONTEXT)' };
  function bomText(res, mode) {
    if (mode === 'ooo') return oooText(res);
    const lines = ['DELL NETWORKING BOM'];
    lines.push(designSummary(res));
    lines.push(`Dell Boi v${window.APP_VERSION || '?'} · ${new Date().toLocaleDateString()} · DRAFT, not yet quote-ready`);
    lines.push('');
    ['Switch', 'Management', 'Cable/Optic', 'Software', 'Compute', 'Storage'].forEach(cat => {
      const rows = res.bom.filter(b => b.category === cat);
      if (!rows.length) return;
      lines.push(CAT_LABEL_TXT[cat] + ':');
      rows.forEach(r => {
        // qty isn't always a count (RA rows can carry 'per ERA' etc.) — only append the
        // "x" multiplier when it's actually a number, same guard used elsewhere for BOM sums
        const q = typeof r.qty === 'number' ? `${r.qty}x` : String(r.qty);
        const flag = r.specConfirmed ? ' [SKU verify]' : (r.verify ? ' [verify]' : '');
        lines.push(`  ${q} ${r.vendor} ${r.item}${flag}`);
        lines.push(`      PN: ${r.dellPN || 'TBD'}${r.note ? ' — ' + r.note : ''}`);
      });
      lines.push('');
    });
    lines.push('⚠ Draft — verify part numbers, SKUs, and sizing before quoting.');
    return lines.join('\n');
  }
  function oooText(res) {
    // MAIN recommend path: read the CANONICAL device layer (js/design.js) — roles are first-class
    // there, so a model serving as BOTH leaf and spine shows as TWO honest bullets, and the counts
    // are the same records the BOM derives from (renderers/BOM can't disagree). Edge / RA / refresh
    // carry a reduced fabric shape (buildDeviceList → partial) — they keep the fabric-scrape path
    // below until their own migration slice.
    const dl = (window.Design && res && !res.isEdge && !res.isRA && !res.isRefresh) ? window.Design.buildDeviceList(res) : null;
    if (dl && !dl.partial) {
      const groups = window.Design.groupDevicesForBom(dl.devices);
      const hasSpine = groups.some(g => g.role === 'spine' || g.role === 'super-spine');
      const hasSuper = groups.some(g => g.role === 'super-spine');
      const allAi = (res.fabrics || []).filter(f => f.network !== 'mgmt').every(f => f.workload === 'ai') && (res.fabrics || []).some(f => f.network !== 'mgmt');
      const label = g => g.role === 'leaf' ? (hasSpine ? 'leaf/ToR' : (allAi ? 'AI switch pair' : 'ToR pair'))
        : g.role === 'spine' ? (hasSuper ? 'pod-spine' : 'spine')
        : g.role === 'super-spine' ? 'super-spine'
        : g.role === 'border-leaf' ? 'border leaf'
        : g.role === 'oob' ? 'OOB management' : g.role;
      // stable display order: leaf → spine → super-spine → border-leaf → oob
      const order = { leaf: 0, spine: 1, 'super-spine': 2, 'border-leaf': 3, oob: 4 };
      const sorted = groups.slice().sort((a, b) => (order[a.role] != null ? order[a.role] : 9) - (order[b.role] != null ? order[b.role] : 9));
      const lines = ['Quick network build (draft):'];
      let total = 0;
      sorted.forEach(g => { total += g.qty; lines.push(`• ${g.qty}× ${g.model} — ${label(g)}`); });
      lines.push(`${total} switches total. Optics, cabling & part numbers to follow when I'm back at my desk.`);
      return lines.join('\n');
    }
    // ---- edge / RA / refresh fallback (fabric + note scrape; not yet migrated to the device layer) ----
    // Role per switch MODEL, derived from the fabric structure (not the verbose BOM notes).
    // A model can serve TWO tiers in one design (leaf in fabric A, spine in fabric B — the
    // BOM merges them into one line), so roles combine instead of the last one clobbering.
    const role = {};
    const addRole = (m, r) => { if (!m || !r) return; if (!role[m]) role[m] = r; else if (role[m].indexOf(r) < 0) role[m] += ' + ' + r; };
    (res.fabrics || []).forEach(f => {
      if (f.network === 'mgmt') { if (f.leaf) addRole(f.leaf.model, 'OOB management'); return; }
      if (f.leaf) addRole(f.leaf.model, res.isEdge ? 'access' : (f.spine && f.spine.model !== f.leaf.model ? 'leaf/ToR' : (f.workload === 'ai' && !f.spine ? 'AI switch pair' : (f.spine ? 'leaf/ToR' : 'ToR pair'))));
      if (f.spine && (!f.leaf || f.spine.model !== f.leaf.model)) addRole(f.spine.model, (f.numPods > 1) ? 'pod-spine' : 'spine');
      if (f.superSpine) addRole(f.superSpine.model, 'super-spine');
    });
    if (res.isEdge && res.context && res.context.edge && res.context.edge.distCount) role[res.context.edge.distribution] = 'distribution (MC-LAG pair)';
    // Aggregate by model — one bullet per model regardless of how many BOM lines carry it
    const agg = new Map(); let total = 0;
    res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && typeof b.qty === 'number').forEach(b => {
      total += b.qty;
      // published-RA lines don't map cleanly onto fabric tiers (one model can be leaf AND
      // spine in a validated design) — for RA results, the line's own note names the role
      const noteRole = res.isRA ? (/rail|leaf/i.test(b.note || '') ? 'GPU leaf/rail' : /spine/i.test(b.note || '') ? 'spine' : /management|OOB/i.test(b.note || '') ? 'OOB management' : 'AI fabric') : null;
      const r = noteRole
        || (/border-leaf/i.test(b.item || '') ? 'border leaf'
        : /super-spine/i.test(b.item || '') ? 'super-spine'
        : /pod-spine/i.test(b.item || '') ? 'pod-spine'
        : (b.category === 'Management' ? 'OOB management' : (role[b.model] || 'switch')));
      const key = b.model + '|' + r;
      agg.set(key, { model: b.model, role: r, qty: (agg.get(key) ? agg.get(key).qty : 0) + b.qty });
    });
    const lines = ['Quick network build (draft):'];
    agg.forEach(a => lines.push(`• ${a.qty}× ${a.model} — ${a.role}`));
    lines.push(`${total} switches total. Optics, cabling & part numbers to follow when I'm back at my desk.`);
    return lines.join('\n');
  }
  function copyBOM(res, mode) {
    if (!res) { alert('Generate a BOM first, then copy it.'); return; }
    const text = bomText(res, mode);
    const label = mode === 'ooo' ? 'Quick BOM (OOO)' : 'Full BOM';
    const fileName = mode === 'ooo' ? 'dell-networking-quick-bom.txt' : 'dell-networking-full-bom.txt';
    if (inIframe()) { showExportFallback(fileName, text); return; }
    const done = () => { if (window.toast) window.toast(`${label} copied — paste it anywhere.`); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => showExportFallback(fileName, text));
    else showExportFallback(fileName, text);
  }
  function exportSVG() {
    const svg = document.querySelector('#topo-svg svg');
    if (svg) download('dell-networking-topology.svg', 'image/svg+xml', svg.outerHTML);
  }

  /* ---------- draw.io / Visio export (editable; open in draw.io / diagrams.net → File →
   * Export → VSDX for Visio). Emits EVERY switch and connection deterministically, and —
   * unlike the on-screen SVG — as a PRO-GRADE diagram:
   *   • LAYERS (Spines / Leaves / Hosts / OOB / Cabling / Title) you can toggle;
   *   • SHAPE DATA on every switch (Model, Role, Ports, Speed, Part #) → tooltips + a
   *     Visio "Shape Data" pane an engineer can filter on;
   *   • ORTHOGONAL routing so links stay tidy; palette matched to the app; a title block. */
  function buildDrawioXml(res) {
    const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const P = { spineFill: '#eef4f5', spineStroke: '#0e7c86', leafFill: '#f4fafb', host: '#1d8a5a', storage: '#a8760f', gpu: '#7b5cc4', oobFill: '#f1f3f5', oobStroke: '#8a949c', icl: '#c98a1e', title: '#1b1f23' };
    const PAL = ['#0e7c86', '#3568c4', '#7b5cc4', '#c25a52', '#2b8a5e', '#b0821f'];
    let cells = '', idn = 1;
    const nid = () => 'n' + (idn++);
    // a switch/host as a draw.io OBJECT (carries shape data) wrapping an mxCell (carries geometry)
    const node = (label, x, y, w, h, fill, stroke, layer, data) => {
      const id = nid();
      const attrs = Object.keys(data || {}).map(k => `${k}="${e(data[k])}"`).join(' ');
      cells += `<object id="${id}" label="${e(label)}" ${attrs}>` +
        `<mxCell style="rounded=1;whiteSpace=wrap;html=1;fontSize=11;fillColor=${fill};strokeColor=${stroke};verticalAlign=middle;spacingLeft=2;spacingRight=2;" vertex="1" parent="${layer}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>` +
        `</object>`;
      return id;
    };
    const edge = (a, b, color, label, dashed, width, layer, anchors) => {
      // anchors (optional) pins the edge's exit/entry POINTS on each node (fractions 0..1) so
      // parallel physical links fan out across the switch face instead of overlapping as one line
      const anchorStyle = anchors ? `exitX=${anchors.exitX};exitY=${anchors.exitY};exitDx=0;exitDy=0;entryX=${anchors.entryX};entryY=${anchors.entryY};entryDx=0;entryDy=0;` : 'jettySize=auto;';
      cells += `<mxCell id="${nid()}" value="${e(label || '')}" style="edgeStyle=orthogonalEdgeStyle;rounded=1;endArrow=none;html=1;fontSize=9;labelBackgroundColor=#ffffff;strokeColor=${color};strokeWidth=${width || 1};${dashed ? 'dashed=1;' : ''}${anchorStyle}" edge="1" parent="${layer || 'lyr-cabling'}" source="${a}" target="${b}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
    };
    // Switch-to-switch cabling is drawn as EVERY individual physical link (each edge = one
    // cable), fanned across both switch faces via exit/entry anchors so parallel links stay
    // visually distinct. Beyond LINK_CAP links in a tier the export falls back to the old
    // one-aggregated-edge-per-pair form (draw.io stays usable at data-center scale).
    const LINK_CAP = 300;
    const txt = (label, x, y, w, h, size, weight, color, layer) =>
      { cells += `<mxCell id="${nid()}" value="${e(label)}" style="text;html=1;whiteSpace=wrap;align=left;verticalAlign=top;fontSize=${size};fontStyle=${weight >= 600 ? 1 : 0};fontColor=${color};" vertex="1" parent="${layer}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`; };

    const catSwitch = m => window.CATALOG.switches.find(s => s.model === m) || {};
    const ports = m => { const s = catSwitch(m); return s.access ? `${s.access.count}× ${s.access.speed}` : ''; };
    const kindOf = f => f.workload === 'ai' ? 'gpu' : (/powerstore|powerscale|powermax|powerflex|objectscale|powervault/.test(f.targetId || '') ? 'storage' : 'host');
    const hostFill = k => k === 'storage' ? '#fbf3e6' : (k === 'gpu' ? '#f4f0fb' : '#eef7f1');
    const hostStroke = k => k === 'storage' ? P.storage : (k === 'gpu' ? P.gpu : P.host);

    const fabrics = res.fabrics.filter(f => f.network !== 'mgmt');
    const mg = res.fabrics.find(f => f.network === 'mgmt');
    const SW = 140, SH = 46, GX = 160;

    // spines — EVERY pod-spine switch, per group  (layer: Spines). For a 3-tier Clos,
    // totalPodSpines covers every pod (not just one), so spineIds[k] is chunked into `numPods`
    // groups of `spineCount` each — leaves below connect ONLY to their own pod's chunk, exactly
    // like the real fabric (a leaf never reaches a pod-spine outside its own pod).
    const spineIds = {}; let sx = 40;
    const groups = [];
    fabrics.forEach(f => { if (!f.spine) return; const k = f.spineGroupKey || f.spine.model; if (!groups.find(g => g.k === k)) groups.push({ k, model: f.spine.model, count: f.totalPodSpines || f.spineCount || 2, perPod: f.spineCount || 2, numPods: f.numPods || 1, dedicated: f.dedicated, superSpine: f.superSpine, superSpineCount: f.superSpineCount, podUplinksToSuper: f.podUplinksToSuper }); });
    groups.forEach(g => {
      spineIds[g.k] = [];
      const is3Tier = g.numPods > 1;
      for (let i = 0; i < g.count; i++) {
        const podN = is3Tier ? Math.floor(i / g.perPod) + 1 : null;
        const label = is3Tier ? `${g.model}\nPod ${podN} · Spine ${(i % g.perPod) + 1}/${g.perPod}` : `${g.model}\nSpine ${i + 1}${g.dedicated ? ' (dedicated)' : ''}`;
        spineIds[g.k].push(node(label, sx, 60, SW, SH, P.spineFill, P.spineStroke, 'lyr-spine',
          { Model: g.model, Role: is3Tier ? `Pod-spine (pod ${podN})` : (g.dedicated ? 'Spine (dedicated)' : 'Spine'), Ports: ports(g.model), Vendor: (catSwitch(g.model).vendor || 'Dell') }));
        sx += GX;
      }
      sx += 40;
    });

    // Entry-slot pre-pass: total up how many individual links will LAND on each spine (from
    // every fabric sharing that spine group) so each arriving link gets its own entry anchor
    // across the spine's bottom face instead of stacking at one point.
    const entryTotals = {}, entrySlots = {};   // key: `${groupKey}|${flatSpineIdx}`
    fabrics.forEach(f => {
      if (!f.spine) return;
      const kk = f.spineGroupKey || f.spine.model;
      const g2 = groups.find(x => x.k === kk); if (!g2) return;
      const upl = f.uplinksPerLeaf || 0;
      if (!(upl > 0 && f.totalLeaves * upl <= LINK_CAP)) return;
      const is3T = g2.numPods > 1, len = is3T ? g2.perPod : g2.count;
      const base = Math.floor(upl / len), rem = upl % len;
      const lpp = is3T ? Math.max(1, Math.ceil(f.totalLeaves / g2.numPods)) : f.totalLeaves;
      for (let i = 0; i < f.totalLeaves; i++) {
        const podIdx = is3T ? Math.min(g2.numPods - 1, Math.floor(i / lpp)) : 0;
        for (let si = 0; si < len; si++) {
          const key = kk + '|' + ((is3T ? podIdx * g2.perPod : 0) + si);
          entryTotals[key] = (entryTotals[key] || 0) + base + (si < rem ? 1 : 0);
        }
      }
    });

    // super-spines — 3-tier Clos top tier (layer: Super-Spines): EVERY pod-spine uplinks to
    // EVERY super-spine (full mesh), matching the real fabric. Sits above the spine row; the
    // title block below shifts up further to make room (only when a super-spine is present).
    const hasSS = groups.some(g => g.superSpine), ssY = -40;
    let ssx = 40;
    groups.filter(g => g.superSpine).forEach(g => {
      const ssIds = [];
      for (let i = 0; i < g.superSpineCount; i++) {
        ssIds.push(node(`${g.superSpine.model}\nSuper-spine ${i + 1}/${g.superSpineCount}`, ssx, ssY, SW, SH, P.spineFill, P.spineStroke, 'lyr-superspine',
          { Model: g.superSpine.model, Role: 'Super-spine (3-tier Clos)', Ports: ports(g.superSpine.model), Vendor: (catSwitch(g.superSpine.model).vendor || 'Dell') }));
        ssx += GX;
      }
      ssx += 40;
      // individual pod-spine → super-spine links (each pod-spine spreads its uplinks across
      // every super-spine); falls back to one aggregated edge per pair past the cap
      const perPod = g.podUplinksToSuper || 0, pods = spineIds[g.k];
      // this hop's breakout/cable-class info — consume what the engine already resolved
      // (via the fabric that sourced this spine group), never recompute the ratio here
      const gFab0 = fabrics.find(f => (f.spineGroupKey || (f.spine && f.spine.model)) === g.k);
      const gBrk = gFab0 && gFab0.superSpineBreakout;
      const gCls = classAbbr(gBrk ? gBrk.class : (gFab0 && gFab0.superSpineCableClass));
      if (perPod > 0 && pods.length * perPod <= LINK_CAP) {
        const len = ssIds.length, base = Math.floor(perPod / len), rem = perPod % len;
        const enter = ssIds.map((_, si) => ({ next: 0, total: Math.max(1, pods.length * (base + (si < rem ? 1 : 0))) }));
        const spd = (catSwitch(g.model).access || {}).speed || '';
        const ssLbl = `${perPod}×/pod-spine @ ${spd}${gCls ? ' ' + gCls : ''}${gBrk ? ` (${gBrk.ratio}×${gBrk.low} breakout, ${gBrk.high} super-spine ports)` : ''}`;
        pods.forEach((pid, pi) => {
          const slot = { next: 0, total: perPod };
          ssIds.forEach((sid, si) => {
            const n = base + (si < rem ? 1 : 0);
            for (let j = 0; j < n; j++) {
              const ex = (slot.next + 1) / (slot.total + 1); slot.next++;
              const en = (enter[si].next + 1) / (enter[si].total + 1); enter[si].next++;
              edge(pid, sid, P.spineStroke, (pi === 0 && si === 0 && j === 0) ? ssLbl : '', !!gBrk, 1.2, 'lyr-superspine', { exitX: ex.toFixed(3), exitY: 0, entryX: en.toFixed(3), entryY: 1 });
            }
          });
        });
      } else {
        const ssLblAgg = `${g.podUplinksToSuper || ''}×${gCls ? ' ' + gCls : ''}${gBrk ? ` (${gBrk.ratio}×${gBrk.low} breakout)` : ''}`;
        spineIds[g.k].forEach(pid => ssIds.forEach(sid => edge(pid, sid, P.spineStroke, ssLblAgg, !!gBrk, 1.6, 'lyr-superspine')));
      }
      g._ssIds = ssIds;   // retained for the border-leaf hookup below
    });

    // distribution-pair ICL (edge/refresh MC-LAG distribution) — the BOM prices it, so the
    // "every physical link" export draws it (2 dashed links between the pair members)
    const distIcl = (res.bom || []).find(b => b._mk === 'edge-dist-icl' || b._mk === 'rf-dist-icl');
    if (distIcl && groups.length === 1 && spineIds[groups[0].k] && spineIds[groups[0].k].length === 2) {
      const [d1, d2] = spineIds[groups[0].k];
      const n = typeof distIcl.qty === 'number' ? Math.min(distIcl.qty, 8) : 2;
      for (let j = 0; j < n; j++) { const fr = ((j + 1) / (n + 1)).toFixed(3); edge(d1, d2, P.icl, j === 0 ? `ICL ${n}×` : '', true, 1.6, 'lyr-spine', { exitX: 1, exitY: fr, entryX: 0, entryY: fr }); }
    }

    // border-leaf pair + core (when the BOM prices a border pair — same "every switch drawn"
    // rule as the rest of the export; the pair terminates ALL core/DCI links, then uplinks
    // into whatever tops the fabric: the super-spine tier if 3-tier, else the spines).
    if (res.coreUplink && res.coreUplink.borderLeaf) {
      const bl = res.coreUplink.borderLeaf, cu = res.coreUplink;
      const bf = fabrics.find(f => f.spine && !f.dedicated) || fabrics.find(f => f.spine);
      const bg = bf && groups.find(x => x.k === (bf.spineGroupKey || bf.spine.model));
      const topIds = bg ? (bg._ssIds && bg._ssIds.length ? bg._ssIds : spineIds[bg.k]) : [];
      // x starts past BOTH the switch rows and the title block (x 40–740) so nothing overlaps
      const bx0 = Math.max(sx, ssx, 780) + 40, byd = hasSS ? -140 : -40;
      const coreId = node(`Core network (existing)\n${cu.count}× ${cu.speed}${cu.coreVendor === 'other' ? ' · other vendor' : cu.includeFar ? ' · Dell (both sides)' : ''}${cu.longReach ? ' · 10km LR' : ''}${cu.includeFar ? '' : ' · far by others'}`, bx0 + GX / 2, byd - 100, 200, SH, P.oobFill, P.oobStroke, 'lyr-spine', { Role: 'Core (existing)', Speed: cu.speed });
      const bIds = [];
      for (let i = 0; i < 2; i++) {
        bIds.push(node(`${bl.model}\nBorder-leaf ${i + 1}/2`, bx0 + i * GX, byd, SW, SH, P.spineFill, P.spineStroke, 'lyr-spine',
          { Model: bl.model, Role: 'Border-leaf (core/DCI egress)', Ports: ports(bl.model), Vendor: (catSwitch(bl.model).vendor || 'Dell') }));
      }
      // core links split across the pair: first border takes the ceil half (odd counts stay exact)
      const perBorder = [Math.ceil(cu.count / 2), Math.floor(cu.count / 2)];
      let entIdx = 0;
      bIds.forEach((bid, bi) => { for (let j = 0; j < perBorder[bi]; j++) { edge(bid, coreId, P.oobStroke, j === 0 ? `${perBorder[bi]}× ${cu.speed}` : '', false, 1.4, 'lyr-spine', { exitX: ((j + 1) / (perBorder[bi] + 1)).toFixed(3), exitY: 0, entryX: ((entIdx + 1) / (cu.count + 1)).toFixed(3), entryY: 1 }); entIdx++; } });
      edge(bIds[0], bIds[1], P.icl, 'ICL 2×', true, 1.6, 'lyr-spine', { exitX: 1, exitY: 0.5, entryX: 0, entryY: 0.5 });
      bIds.forEach(bid => topIds.forEach((tid, ti) => edge(bid, tid, P.spineStroke, ti === 0 ? `1× ${bl.uplinkSpeed || ''}` : '', false, 1.2, 'lyr-spine')));
    }

    // leaves — EVERY leaf switch; ICL between pair members; uplink edge per leaf→(pod-)spine.
    // 3-tier: leaves are partitioned across `numPods` pods, connecting ONLY to their own pod's
    // spine chunk (spineIds[k] is already laid out in pod order, `perPod` switches at a time).
    let lx = 40; const hostAnchors = [];
    fabrics.forEach((f, fi) => {
      const col = PAL[fi % PAL.length], ids = [], kind = kindOf(f);
      const fBrk = f.uplinkBreakout, fCls = classAbbr(fBrk ? fBrk.class : f.uplinkCableClass);
      const upLbl = f.spine ? `${f.uplinksPerLeaf || ''}× ${f.uplinkSpeed || ''}${fCls ? ' ' + fCls : ''}${fBrk ? ` (${fBrk.ratio}×${fBrk.low} breakout, ${fBrk.high} spine ports)` : ''}` : '';
      const g = f.spine && groups.find(x => x.k === (f.spineGroupKey || f.spine.model));
      const is3Tier = g && g.numPods > 1;
      const leavesPerPod = is3Tier ? Math.max(1, Math.ceil(f.totalLeaves / g.numPods)) : f.totalLeaves;
      // paired = MC-LAG/VLT pair members sit side-by-side and carry an ICL. Data-center dual
      // fabrics signal it via fabricsN===2; edge/refresh access carries fabricsN===1 but a real
      // interconnectQty across totalLeaves/2 pairs (found inert by the 2026-07-13 review —
      // edge/refresh ICLs were priced in the BOM but never drawn here).
      const paired = f.fabricsN === 2 || (f.interconnectQty > 0 && f.totalLeaves % 2 === 0);
      const pairsN = paired ? (f.fabricsN === 2 ? f.leavesPerFabric : f.totalLeaves / 2) : 0;
      for (let i = 0; i < f.totalLeaves; i++) {
        const tag = paired ? ((i % 2 === 0 ? 'A' : 'B') + (Math.floor(i / 2) + 1)) : ('L' + (i + 1));
        const podTag = is3Tier ? ` · pod ${Math.min(g.numPods, Math.floor(i / leavesPerPod) + 1)}` : '';
        ids.push(node(`${f.leaf.model}\n${f.converged ? 'CONVERGED' : f.network.toUpperCase()} ${tag}${podTag}`, lx, 260, SW, SH, P.leafFill, col, 'lyr-leaf',
          { Model: f.leaf.model, Role: 'Leaf/ToR', Fabric: f.converged ? 'converged (' + f.network + ')' : f.network, Ports: ports(f.leaf.model), Speed: f.speed, PartNumber: (f.leaf.dellPN || 'verify'), Vendor: (f.leaf.vendor || 'Dell') }));
        if (paired && i % 2 === 1 && f.interconnectQty) {
          // ICL peer-link: every physical link drawn (right face of A → left face of B)
          const iclN = Math.max(1, Math.round(f.interconnectQty / pairsN));
          if (iclN <= 8) for (let j = 0; j < iclN; j++) {
            const fr = ((j + 1) / (iclN + 1)).toFixed(3);
            edge(ids[i - 1], ids[i], P.icl, j === 0 ? `ICL ${iclN}× ${f.interconnectSpeed}` : '', true, 1.6, undefined, { exitX: 1, exitY: fr, entryX: 0, entryY: fr });
          }
          else edge(ids[i - 1], ids[i], P.icl, `ICL ${iclN}× ${f.interconnectSpeed}`, true, 2);
        }
        if (f.spine && spineIds[f.spineGroupKey || f.spine.model]) {
          const kk = f.spineGroupKey || f.spine.model;
          const allSpines = spineIds[kk];
          // this leaf's OWN pod's spine chunk (flat 2-tier: the whole group, numPods===1)
          const podIdx = is3Tier ? Math.min(g.numPods - 1, Math.floor(i / leavesPerPod)) : 0;
          const podSpines = is3Tier ? allSpines.slice(podIdx * g.perPod, (podIdx + 1) * g.perPod) : allSpines;
          const upl = f.uplinksPerLeaf || 0;
          if (upl > 0 && f.totalLeaves * upl <= LINK_CAP) {
            // EVERY individual uplink: this leaf's uplinks spread across its pod's spines,
            // remainder to the first spines — exactly how the fabric is physically wired
            const len = podSpines.length, base = Math.floor(upl / len), rem = upl % len;
            const slot = { next: 0, total: upl };
            podSpines.forEach((sid, si) => {
              const n = base + (si < rem ? 1 : 0); if (!n) return;
              const ekey = kk + '|' + ((is3Tier ? podIdx * g.perPod : 0) + si);
              if (!entrySlots[ekey]) entrySlots[ekey] = { next: 0, total: Math.max(1, entryTotals[ekey] || n) };
              for (let j = 0; j < n; j++) {
                const ex = (slot.next + 1) / (slot.total + 1); slot.next++;
                const en = (entrySlots[ekey].next + 1) / (entrySlots[ekey].total + 1); entrySlots[ekey].next++;
                edge(ids[i], sid, col, (si === 0 && j === 0) ? upLbl : '', false, 1.2, undefined, { exitX: ex.toFixed(3), exitY: 0, entryX: en.toFixed(3), entryY: 1 });
              }
            });
          } else {
            podSpines.forEach(sid => edge(ids[i], sid, col, upLbl, false, 2));
          }
        }
        lx += GX;
      }
      const hid = node(`${f.targetLabel || f.targetFamily}\n${f.network}: ${f.totalLinks} links = ${f.unitsN || '?'} × ${f.linksPerUnit || '?'}/unit @ ${f.speed}`,
        lx - GX * Math.min(f.totalLeaves, 3), 460, 230, 56, hostFill(kind), hostStroke(kind), 'lyr-host',
        { Target: (f.targetFamily || ''), Fabric: f.network, Links: String(f.totalLinks), Speed: f.speed, LinksPerUnit: String(f.linksPerUnit || '') });
      ids.forEach(id => edge(id, hid, col, '', false, 1));
      hostAnchors.push(hid);
      lx += 70;
    });

    // OOB — dashed to every host anchor  (layer: OOB)
    if (mg) {
      const oid = node(`${mg.leaf.model}\nOOB ×${mg.totalLeaves} — ${mg.totalLinks} mgmt links`, lx, 260, 180, SH, P.oobFill, P.oobStroke, 'lyr-oob',
        { Model: mg.leaf.model, Role: 'Out-of-band management', Links: String(mg.totalLinks) });
      hostAnchors.forEach(h => edge(oid, h, P.oobStroke, '', true, 1, 'lyr-oob'));
    }

    // Title block + legend  (layer: Title) — shifted further up when a super-spine tier exists
    // (it sits above the spine row) so it never overlaps the diagram.
    const titleY0 = hasSS ? -110 : -40, titleY1 = hasSS ? -86 : -16;
    const tl = (res.context && res.context.targetsLabel) || (res.context ? res.context.units + '× ' + (res.platform ? res.platform.family : '') : '');
    txt(`Dell Networking Topology`, 40, titleY0, 700, 22, 16, 700, P.title, 'lyr-title');
    txt(`${tl}  ·  generated ${new Date().toLocaleDateString()}  ·  DRAFT — verify part numbers before quoting`, 40, titleY1, 900, 18, 10, 400, '#6a747e', 'lyr-title');
    const legend = ['Spine =' + P.spineStroke, 'Leaf/ToR = fabric colour', 'ICL = amber dashed', 'OOB = grey dashed', 'each switch↔switch line = ONE physical link (aggregated ×N past ' + LINK_CAP + '/tier)'].join('    ') + (hasSS ? '    Super-spine = 3-tier Clos top tier (same colour as Spine)' : '');
    txt(`Legend:  ${legend}    ·    Layers panel (Edit ▸ Layers) toggles ${hasSS ? 'Super-Spines / ' : ''}Spines / Leaves / Hosts / OOB / Cabling`, 40, Math.max(560, 460 + 90), 1100, 18, 9, 400, '#6a747e', 'lyr-title');

    // Layers (z-order: first listed = bottom). Cabling under the boxes; title on top.
    const layers =
      `<mxCell id="lyr-cabling" value="Cabling" parent="0"/>` +
      `<mxCell id="lyr-oob" value="OOB management" parent="0"/>` +
      `<mxCell id="lyr-host" value="Hosts" parent="0"/>` +
      `<mxCell id="lyr-leaf" value="Leaves / ToR" parent="0"/>` +
      `<mxCell id="lyr-spine" value="Spines" parent="0"/>` +
      `<mxCell id="lyr-superspine" value="Super-Spines (3-tier Clos)" parent="0"/>` +
      `<mxCell id="lyr-title" value="Title &amp; legend" parent="0"/>`;

    return `<mxfile host="app.diagrams.net"><diagram name="Dell Networking Topology" id="dellboi-topo"><mxGraphModel dx="1400" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="0" fold="1" page="1" pageScale="1" pageWidth="1600" pageHeight="1000" math="0" shadow="0"><root><mxCell id="0"/>${layers}${cells}</root></mxGraphModel></diagram></mxfile>`;
  }
  function exportDrawio(res) { if (!res) return; download('dell-networking-topology.drawio', 'application/xml', buildDrawioXml(res)); }
  function printPDF(res) {
    $('#print-header').innerHTML =
      `<h1 style="color:#00468b;margin:0">Dell Networking BOM — ${res.platform.family}</h1>` +
      `<p style="margin:4px 0;color:#333">${res.context.units}× ${res.platform.model} · ${res.context.redundancy} fabric · generated ${new Date().toLocaleDateString()}</p>` +
      `<p style="margin:0;color:#b3730a;font-size:12px">DRAFT — all part numbers require verification against Dell Info Hub before customer use.</p>`;
    window.print();
  }

  /* ---------- guidance (Discovery value-add) ---------- */
  function renderGuidance(g) {
    const wrap = $('#tab-guidance'); wrap.innerHTML = '';
    let h = `<div class="g-headline"><h3>${g.headline}</h3><span class="g-time">Timeframe: ${g.timeline}</span></div>`;

    h += section('Competitive positioning', 'vs. ' + g.positioning.vendorLabel,
      '<ul>' + g.positioning.points.map(p => `<li>${p}</li>`).join('') + '</ul>');

    if (g.portfolio.length) h += section('Recommended Dell networking', 'for their growing workloads',
      g.portfolio.map(p => `<div class="g-item"><b>${p.title}</b><div>${p.detail}</div></div>`).join(''));

    if (g.management) h += section('Management &amp; operations story', g.management.title,
      `<p class="g-lead">${g.management.oneLiner}</p><ul>` + g.management.points.map(p => `<li>${p}</li>`).join('') + '</ul>', 'g-verity');

    if (g.messaging.length) h += section('Value messaging', 'to their pain points',
      g.messaging.map(m => `<div class="g-item"><b>${m.pain}</b><div>${m.point}</div></div>`).join(''));

    if (g.attach.length) h += section('Attach opportunities', 'Dell platforms in play',
      '<ul>' + g.attach.map(a => `<li>${a.platform}</li>`).join('') + '</ul>');

    h += section('Open items to confirm', 'chase these down', '<ul>' + g.openItems.map(o => `<li>${o}</li>`).join('') + '</ul>', 'g-open');
    wrap.innerHTML = h;
  }
  function section(title, sub, body, cls) {
    return `<div class="g-card ${cls || ''}"><div class="g-card-h">${title} <span>${sub}</span></div>${body}</div>`;
  }

  function activateTab(name) {
    document.querySelectorAll('.tab').forEach(x => { const on = x.dataset.tab === name; x.classList.toggle('active', on); x.setAttribute('aria-selected', on ? 'true' : 'false'); });
    ['guidance', 'bom', 'topology', 'rack', 'checks', 'pitch'].forEach(n => { const b = $('#tab-' + n); if (b) b.hidden = (n !== name); });
  }

  /* ---------- render all ---------- */
  function render(res, guidance) {
    LAST = res;
    renderBOM(res); renderTopology(res); renderRack(res); renderChecks(res); renderPitch(res);
    if (window.Glossary) { Glossary.apply($('#tab-bom')); Glossary.apply($('#tab-checks')); Glossary.apply($('#tab-rack')); Glossary.apply(document.querySelector('.legend')); }
    const gBtn = $('#tab-btn-guidance');
    if (guidance) { renderGuidance(guidance); if (window.Glossary) Glossary.apply($('#tab-guidance')); gBtn.hidden = false; activateTab('guidance'); }
    else { gBtn.hidden = true; activateTab('bom'); }
    $('#empty-state').hidden = true; $('#results').hidden = false;
    // On a single-column (phone) layout the results panel sits BELOW the input panel, and the
    // input side often changes height at this exact moment (the wizard closes, the mode chooser
    // returns) — so without an explicit anchor the viewport lands somewhere arbitrary and the
    // page appears to "scroll around". Take the user straight to the results, deterministically.
    // Desktop two-column never scrolls (results render beside the inputs, already in view).
    // Theme toggles don't pass through here (setTheme repaints diagrams directly), so this
    // only fires when a NEW result actually appears.
    try {
      if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) {
        // one frame later: callers keep mutating the layout right after render() returns
        // (the wizard hides itself, the chooser reappears) — anchoring now would measure a
        // position that's about to shift. rAF runs after this tick's DOM settles.
        (window.requestAnimationFrame || (cb => cb()))(() => {
          const out = document.getElementById('output');
          if (out && out.scrollIntoView) out.scrollIntoView({ block: 'start' });
        });
      }
    } catch (e) { /* headless/test contexts without layout */ }
    // announce to assistive tech that a result appeared, with the headline numbers
    const status = $('#results-status');
    if (status) {
      const sw = res.bom.filter(b => (b.category === 'Switch' || b.category === 'Management') && typeof b.qty === 'number').reduce((s, b) => s + b.qty, 0);
      const cab = res.bom.filter(b => b.category === 'Cable/Optic').reduce((s, b) => s + b.qty, 0);
      const flags = res.warnings.filter(w => w.severity === 'error' || w.severity === 'warn').length;
      status.textContent = `BOM generated: ${sw} switches, ${cab} cables and optics, ${dataFabricsCount(res)} data fabric${dataFabricsCount(res) === 1 ? '' : 's'}${flags ? `, ${flags} item${flags === 1 ? '' : 's'} to review in Checks` : ''}. Results are in the tabs below.`;
    }
  }
  const dataFabricsCount = res => res.fabrics.filter(f => f.network !== 'mgmt').length;

  window.UI = { render, renderGuidance, exportCSV, exportSVG, exportDrawio, buildDrawioXml, printPDF, buildBOMText: bomText, copyBOM, setTheme,
    setTopoMode(m) { TOPO_MODE = m === 'expanded' ? 'expanded' : 'logical'; if (LAST) renderTopology(LAST); },
    get topoMode() { return TOPO_MODE; }, get last() { return LAST; } };
})();
