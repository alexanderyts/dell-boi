/* =============================================================================
 * APP BOOTSTRAP  --  modes (guided / discovery / reference arch / expert),
 * form wiring, tabs, exports.
 * ========================================================================== */
(function () {
  const $ = s => document.querySelector(s);
  const show = (sel, on) => { const e = $(sel); if (e) e.hidden = !on; };
  if ($('#app-version') && window.APP_VERSION) $('#app-version').textContent = 'v' + window.APP_VERSION;

  /* ---- theme: stored choice > OS preference; diagrams repaint via UI.setTheme ---- */
  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    if (window.UI && window.UI.setTheme) window.UI.setTheme(mode);
    const tb = $('#theme-toggle');
    if (tb) { tb.textContent = mode === 'dark' ? '◑ Light' : '◐ Dark'; tb.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false'); tb.setAttribute('aria-label', mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'); }
  }
  let themePref;
  try { themePref = localStorage.getItem('dellboi-theme'); } catch (e) { themePref = null; }
  const osDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(themePref || (osDark ? 'dark' : 'light'));
  if ($('#theme-toggle')) $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('dellboi-theme', next); } catch (e) { /* file:// may block */ }
    applyTheme(next);
  });

  /* ---- populate expert-form attach targets ---- */
  const sel = $('#f-platform');
  function populatePlatformOptions(selectEl) {
    window.CATALOG.platforms.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = `${p.family} — ${p.model}`;
      selectEl.appendChild(o);
    });
  }
  populatePlatformOptions(sel);
  // populate a model dropdown from a platform's models[] (drill-down) — wrapEl is the label to show/hide
  function fillModels(selectEl, wrapEl, platformId) {
    const p = window.CATALOG.platforms.find(x => x.id === platformId);
    selectEl.innerHTML = '<option value="">— family default —</option>';
    if (p && p.models && p.models.length) {
      p.models.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; selectEl.appendChild(o); });
      wrapEl.style.display = 'block';
    } else { wrapEl.style.display = 'none'; }
  }
  function syncHint() {
    const p = window.CATALOG.platforms.find(x => x.id === sel.value);
    $('#platform-hint').textContent = p ? 'Ports/unit: ' + p.portGroups.map(g => `${g.count}×${g.speed} ${g.role}`).join(', ') : '';
    $('#unit-label').textContent = p ? p.unitLabel + (parseInt($('#f-units').value, 10) === 1 ? '' : 's') : '';
    fillModels($('#f-model'), $('#f-model-wrap'), sel.value);
  }
  sel.addEventListener('change', syncHint);
  $('#f-units').addEventListener('input', syncHint);

  /* ---- additional attach targets — unlimited, each with its own full build-out
   * (platform, model, units, GPUs/rail for AI, NIC speed/ports/count). This is what
   * lets one design carry a large heterogeneous build: a big server pool, several
   * smaller server pools, and multiple storage platforms, all in one BOM/topology. */
  let extraTargetSeq = 0;
  function addTargetRow() {
    const n = ++extraTargetSeq;
    const row = document.createElement('div');
    row.className = 'target-row'; row.dataset.idx = n;
    row.innerHTML = `
      <div class="target-row-h">Additional target <button type="button" class="target-row-remove" title="Remove this target">✕ remove</button></div>
      <label>Platform <select class="t-platform"></select></label>
      <label class="t-model-wrap" style="display:none">Specific model <select class="t-model"><option value="">— family default —</option></select></label>
      <label>How many units <input class="t-units" type="number" min="1" value="4" /></label>
      <label class="t-gpus-wrap" style="display:none">GPUs per server <input class="t-gpus" type="number" min="1" value="8" /></label>
      <label class="t-rail-wrap" style="display:none">GPU rail NIC
        <select class="t-rail">
          <option value="" selected>— model default —</option>
          <option value="400GbE">ConnectX-7 — 400GbE rails</option>
          <option value="800GbE">ConnectX-8 — 800GbE rails</option>
        </select>
      </label>
      <label>Port speed <span class="unit-label">(blank = model default)</span>
        <select class="t-nic-speed">
          <option value="" selected>— model default —</option>
          <option value="10GbE">10GbE</option><option value="25GbE">25GbE</option>
          <option value="40GbE">40GbE (legacy)</option><option value="100GbE">100GbE</option>
          <option value="200GbE">200GbE</option><option value="400GbE">400GbE</option>
        </select>
      </label>
      <label>Ports per NIC <span class="unit-label">(blank = model default)</span>
        <select class="t-nic-ports">
          <option value="" selected>— model default —</option>
          <option value="1">Single-port (1)</option><option value="2">Dual-port (2)</option><option value="4">Quad-port (4)</option>
        </select>
      </label>
      <label>NICs per unit <span class="unit-label">(blank = 1)</span>
        <input class="t-nic-count" type="number" min="1" placeholder="e.g. 2" />
      </label>`;
    $('#extra-targets').appendChild(row);
    const platSel = row.querySelector('.t-platform');
    populatePlatformOptions(platSel);
    const sync = () => {
      const p = window.CATALOG.platforms.find(x => x.id === platSel.value);
      fillModels(row.querySelector('.t-model'), row.querySelector('.t-model-wrap'), platSel.value);
      const ai = p && p.workload === 'ai';
      row.querySelector('.t-gpus-wrap').style.display = ai ? 'block' : 'none';
      row.querySelector('.t-rail-wrap').style.display = ai ? 'block' : 'none';
    };
    platSel.addEventListener('change', sync);
    row.querySelector('.target-row-remove').addEventListener('click', () => row.remove());
    sync();
    return row;
  }
  $('#btn-add-target').addEventListener('click', () => addTargetRow());
  // read one added-target row into an engine target spec (nulls = platform default, no override)
  function readTargetRow(row) {
    const platformId = row.querySelector('.t-platform').value;
    const spd = row.querySelector('.t-nic-speed').value;
    const ppn = parseInt(row.querySelector('.t-nic-ports').value, 10);
    const npu = parseInt(row.querySelector('.t-nic-count').value, 10);
    let nic = null;
    if (ppn) nic = { speed: spd || '', portsPerNic: ppn, nicsPerUnit: npu || 1 };
    else if (spd) {
      const p = window.CATALOG.platforms.find(x => x.id === platformId);
      const g = p && p.portGroups.find(x => x.role !== 'mgmt' && x.network !== 'backend' && x.network !== 'aifabric');
      nic = { speed: spd, portsPerNic: (g && g.count) || 2, nicsPerUnit: npu || 1 };
    }
    const railSpd = row.querySelector('.t-rail').value;
    return {
      platformId, units: row.querySelector('.t-units').value,
      modelId: row.querySelector('.t-model').value || null,
      gpusPerServer: row.querySelector('.t-gpus').value,
      railNic: railSpd ? { speed: railSpd, model: railSpd === '800GbE' ? 'ConnectX-8' : 'ConnectX-7' } : null,
      nic
    };
  }

  /* ---- populate reference architectures ---- */
  const raSel = $('#f-ra');
  (window.CATALOG.referenceArchitectures || []).forEach(ra => {
    const o = document.createElement('option'); o.value = ra.id; o.textContent = '⭐ ' + ra.name; raSel.appendChild(o);
  });
  function syncRaHint() {
    const ra = (window.CATALOG.referenceArchitectures || []).find(x => x.id === raSel.value);
    $('#ra-hint').textContent = ra ? `${ra.summary} (endorsed up to ${ra.maxGpuNodes} GPU nodes)` : '';
    if (ra) $('#f-ra-units').value = ra.maxGpuNodes;
  }
  raSel.addEventListener('change', syncRaHint);

  function addVerity(res) {
    const v = (window.CATALOG.solutions || []).find(x => x.id === 'verity');
    if (v) res.bom.push(Object.assign({}, v.bomLine));
  }

  /* ---- Design save / load / share ------------------------------------------
   * A "design" is a portable, JSON-serializable recipe: which engine entry point
   * to call and the exact input. run() replays it deterministically. This powers
   * Save-to-file, Load-from-file, and shareable links (design in the URL hash).
   * Security: inputs are DATA only (never code) — parsed with JSON.parse in a
   * try/catch, and the engine clamps/validates every field. No eval, ever. */
  const DESIGN_V = 1;
  let lastDesign = null;
  const DesignIO = {
    record(engine, input, opts) { lastDesign = { app: 'dellboi-design', v: DESIGN_V, engine, input, verity: !!(opts && opts.verity), guidance: (opts && opts.guidance) || null }; return lastDesign; },
    run(d) {
      if (!d || d.app !== 'dellboi-design' || !d.engine) throw new Error('Not a Dell Boi design file.');
      const fnName = ({ recommend: 'recommend', recommendEdge: 'recommendEdge', recommendRA: 'recommendRA', recommendRefresh: 'recommendRefresh' })[d.engine];
      if (!fnName || typeof window[fnName] !== 'function') throw new Error('Unknown design type: ' + d.engine);
      let res;
      if (d.engine === 'recommendRA') res = window.recommendRA(d.input.ra, d.input.units);
      else if (d.engine === 'recommendRefresh') res = window.recommendRefresh(d.input);
      else if (d.engine === 'recommendEdge') res = window.recommendEdge(d.input);
      else res = window.recommend(d.input);
      if (d.verity) addVerity(res);
      window.UI.render(res, d.guidance || null);
      lastDesign = d;
      return res;
    },
    save() {
      if (!lastDesign) { alert('Generate a BOM first, then save the design.'); return; }
      const data = JSON.stringify(lastDesign, null, 2);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = 'dell-networking-design.json'; document.body.appendChild(a); a.click(); a.remove();
    },
    loadFile(file) {
      const r = new FileReader();
      r.onload = () => { try { DesignIO.run(JSON.parse(r.result)); } catch (e) { alert('Could not load design: ' + e.message); } };
      r.onerror = () => alert('Could not read the file.');
      r.readAsText(file);
    },
    toLink() {
      if (!lastDesign) { alert('Generate a BOM first, then copy a link.'); return; }
      try {
        const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(lastDesign))));
        const url = location.origin + location.pathname + '#design=' + b64;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => toast('Link copied — anyone who opens it rebuilds this exact design.'), () => prompt('Copy this link:', url));
        else prompt('Copy this link:', url);
      } catch (e) { alert('Could not build a link: ' + e.message); }
    },
    fromHash() {
      const m = /[#&]design=([^&]+)/.exec(location.hash || '');
      if (!m) return false;
      try { const d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); DesignIO.run(d); return true; }
      catch (e) { console.warn('bad design in URL', e); return false; }
    }
  };
  window.DesignIO = DesignIO;   // so the wizard can record its flows too
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, 3200);
  }
  window.toast = toast;   // so ui.js's copy/export actions can confirm without duplicating the toast element logic

  /* ---- mode chooser ---- */
  const SECTIONS = ['#mode-chooser', '#wizard', '#ra-mode', '#edge-mode', '#expert-form'];
  function toChooser() { SECTIONS.forEach(s => show(s, s === '#mode-chooser')); }
  function toMode(m) {
    show('#mode-chooser', false);
    if (m === 'express' || m === 'guided' || m === 'discovery' || m === 'refresh') { window.Wizard.start(m); }
    else if (m === 'ra') { show('#ra-mode', true); syncRaHint(); }
    else if (m === 'edge') { show('#edge-mode', true); }
    else if (m === 'expert') { show('#expert-form', true); syncHint(); }
  }
  document.querySelectorAll('.mode-btn').forEach(b => b.addEventListener('click', () => toMode(b.dataset.mode)));
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', toChooser));

  /* ---- example designs — a complete BOM a novice can open and learn from ---- */
  const EXAMPLES = {
    'storage-servers': { app: 'dellboi-design', v: DESIGN_V, engine: 'recommend', verity: true, guidance: null,
      input: { targets: [{ platformId: 'poweredge-general', units: 12 }, { platformId: 'powerstore', units: 3 }], redundancy: 'dual', growthHeadroom: 0.25, includeMgmt: true, placement: 'in-rack', trafficProfile: 'balanced', racks: 1 } },
    'ai': { app: 'dellboi-design', v: DESIGN_V, engine: 'recommend', verity: true, guidance: null,
      input: { platformId: 'poweredge-ai', units: 16, gpusPerServer: 8, modelId: 'xe9680', stack: 'nvidia', redundancy: 'dual', includeMgmt: true, placement: 'in-rack', racks: 2 } },
    'edge': { app: 'dellboi-design', v: DESIGN_V, engine: 'recommendEdge', verity: false, guidance: null,
      input: { endpoints: 192, poe: 'poe+', accessSpeed: '1g', edgeRedundancy: 'vlt-pair', distribution: 'new', includeMgmt: true } }
  };
  document.querySelectorAll('.example-btn').forEach(b => b.addEventListener('click', () => {
    const ex = EXAMPLES[b.dataset.example]; if (!ex) return;
    // The chooser stays visible: an example renders on the right, and the user can
    // immediately pick a mode or another example. (It used to be hidden here with nothing
    // shown in its place, leaving the whole left panel empty with no way back.)
    try { DesignIO.run(JSON.parse(JSON.stringify(ex))); } catch (e) { alert('Could not open example: ' + e.message); toChooser(); }
  }));
  window.Wizard.wire();

  /* ---- expert generate ---- */
  $('#f-core').addEventListener('change', () => { $('#f-core-speed-wrap').style.display = $('#f-core').checked ? 'block' : 'none'; });
  // coreVendor reveals: Dell core → offer the known-model picker; model "Not sure" → ask the far port.
  const syncCoreVendor = () => {
    const dell = $('#f-core-vendor').value === 'dell';
    $('#f-core-farmodel-wrap').style.display = dell ? 'block' : 'none';
    $('#f-core-farport-wrap').style.display = (dell && $('#f-core-farmodel').value === 'unknown') ? 'block' : 'none';
  };
  $('#f-core-vendor').addEventListener('change', syncCoreVendor);
  $('#f-core-farmodel').addEventListener('change', syncCoreVendor);
  $('#btn-generate').addEventListener('click', () => {
    try {
      const gpus = $('#f-gpus').value;
      const railSpd = $('#f-rail-speed').value;
      const railNic = railSpd ? { speed: railSpd, model: railSpd === '800GbE' ? 'ConnectX-8' : 'ConnectX-7' } : null;
      const nicbSpd = $('#f-nicb-speed').value, nicbPorts = parseInt($('#f-nicb-ports').value, 10);
      const nic2 = (nicbSpd || nicbPorts) ? { speed: nicbSpd || '', portsPerNic: nicbPorts || 2, nicsPerUnit: 1, network: $('#f-nicb-network').value || 'storage' } : null;
      const p0 = window.CATALOG.platforms.find(x => x.id === sel.value);
      const nicFields = { vendor: $('#f-nic-vendor').value, speed: $('#f-nic-speed').value, portsPerNic: $('#f-nic-ports').value, nicsPerUnit: $('#f-nic-count').value };
      const targets = [{ platformId: sel.value, units: $('#f-units').value, gpusPerServer: gpus, modelId: $('#f-model').value,
        railNic, nic2,
        // AI target: NIC fields describe its front-end/storage group only when opted in
        nic: (p0 && p0.workload === 'ai' && $('#f-ai-datanic').checked) ? nicFields : null }];
      document.querySelectorAll('#extra-targets .target-row').forEach(row => {
        if (row.querySelector('.t-platform').value) targets.push(readTargetRow(row));
      });
      const anyAi = targets.some(t => { const p = window.CATALOG.platforms.find(x => x.id === t.platformId); return p && p.workload === 'ai'; });
      if (anyAi && !$('#f-stack').value) { alert('This design includes an AI target — choose the AI fabric stack (Dell or NVIDIA).'); return; }
      const input = {
        targets,
        redundancy: $('#f-redundancy').value, growthHeadroom: parseFloat($('#f-growth').value),
        includeMgmt: $('#f-mgmt').checked, nos: $('#f-nos').value, stack: $('#f-stack').value,
        fabricArchitecture: $('#f-fabricarch').value,
        placement: $('#f-placement').value, structuredInPlace: $('#f-structured').checked, breakout: $('#f-breakout').value,
        racks: $('#f-racks').value, leaf100: $('#f-leaf100').value, leaf25: $('#f-leaf25').value, aiTransport: $('#f-ai-transport').value,
        trafficProfile: $('#f-traffic').value, speedRoadmap: $('#f-roadmap').value, storageProtocol: $('#f-storage-proto').value || null, fabricInterconnect: $('#f-fabstyle').value,
        deployType: $('#f-deploy').value, reuseExistingSpine: $('#f-reuse').checked,
        nic: nicFields,
        uplinkTarget: $('#f-uplink-target').value || undefined,
        includeCoreUplink: $('#f-core').checked, coreSpeed: $('#f-core-speed').value, coreCount: 2,
        coreType: $('#f-core-type').value, coreLayer: $('#f-core-layer').value, coreProtocol: $('#f-core-proto').value,
        coreReach: $('#f-core-reach').value, coreVendor: $('#f-core-vendor').value,
        coreFarModel: ($('#f-core-vendor').value === 'dell' && $('#f-core-farmodel').value !== 'unknown') ? $('#f-core-farmodel').value : null,
        coreFarPort: ($('#f-core-vendor').value === 'dell' && $('#f-core-farmodel').value === 'unknown')
          ? ({ mmf: { media: 'MMF', connector: 'MPO' }, smf: { media: 'SMF', connector: 'LC' }, dac: { media: 'DAC', connector: 'DAC' } }[$('#f-core-farport').value] || 'unknown')
          : undefined,
        borderLeaf: $('#f-border-leaf').checked
      };
      DesignIO.run(DesignIO.record('recommend', input, { verity: $('#f-verity').checked }));
    } catch (e) { alert('Could not generate BOM: ' + e.message); console.error(e); }
  });

  /* ---- edge / access generate ---- */
  $('#btn-edge-generate').addEventListener('click', () => {
    try {
      const input = {
        endpoints: $('#e-endpoints').value, poe: $('#e-poe').value, accessSpeed: $('#e-speed').value,
        edgeRedundancy: $('#e-redundancy').value, distribution: $('#e-dist').value,
        edgeUplink: $('#e-uplink').value,
        includeMgmt: $('#e-mgmt').checked
      };
      DesignIO.run(DesignIO.record('recommendEdge', input, { verity: $('#e-verity').checked }));
    } catch (e) { alert('Could not generate edge BOM: ' + e.message); console.error(e); }
  });

  /* ---- reference-architecture generate ---- */
  $('#btn-ra-generate').addEventListener('click', () => {
    try {
      if (!raSel.value) { alert('Pick a reference architecture first.'); return; }
      DesignIO.run(DesignIO.record('recommendRA', { ra: raSel.value, units: $('#f-ra-units').value }, {}));
    } catch (e) { alert('Could not generate RA BOM: ' + e.message); console.error(e); }
  });

  /* ---- tabs ---- */
  const TABS = ['guidance', 'bom', 'topology', 'rack', 'checks', 'pitch'];
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => { x.classList.remove('active'); x.setAttribute('aria-selected', 'false'); });
    t.classList.add('active'); t.setAttribute('aria-selected', 'true');
    TABS.forEach(name => { const b = $('#tab-' + name); if (b) b.hidden = (name !== t.dataset.tab); });
  }));

  /* ---- exports ---- */
  $('#btn-print').addEventListener('click', () => window.UI.printPDF(window.UI.last));
  $('#btn-csv').addEventListener('click', () => window.UI.exportCSV(window.UI.last));
  $('#btn-copy-bom').addEventListener('click', () => window.UI.copyBOM(window.UI.last, 'full'));
  $('#btn-copy-ooo').addEventListener('click', () => window.UI.copyBOM(window.UI.last, 'ooo'));
  $('#btn-svg').addEventListener('click', () => window.UI.exportSVG());
  $('#btn-drawio').addEventListener('click', () => window.UI.exportDrawio(window.UI.last));

  /* ---- save / load / share a design ---- */
  $('#btn-save-design').addEventListener('click', () => DesignIO.save());
  $('#btn-share-design').addEventListener('click', () => DesignIO.toLink());
  $('#btn-load-design').addEventListener('click', () => $('#design-file').click());
  $('#design-file').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) DesignIO.loadFile(f); e.target.value = ''; });

  // deep-link: if the page was opened with a shared design in the URL, rebuild it now
  try { DesignIO.fromHash(); } catch (e) { /* ignore malformed */ }

  syncHint();
})();
