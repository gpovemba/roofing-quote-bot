// ── New Quote wizard ──────────────────────────────────────────
(() => {
  const { esc, money0, num, cap, PROJECT_TYPES } = App;
  const KEY = 'rqb.newQuote';
  const CHECK = '<svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg>';
  const PITCHES = { low: 'Low (flat to 4/12)', medium: 'Medium (5/12 to 7/12)', steep: 'Steep (8/12 and up)', complex: 'Complex (many facets)' };
  const PROJECT_SUB = {
    replacement: 'Tear off and replace', repair: 'Fix a section or leak',
    new_construction: 'Roof on a new build', inspection: 'Visit and report',
  };
  const GRADE_TAG = { economy: 'Budget-friendly', standard: 'Most popular', premium: 'Premium look' };

  const fresh = () => ({
    step: 1, customer_name: '', customer_email: '', customer_phone: '', property_address: '',
    project_type: 'replacement', roof_area_sqft: '', pitch: 'medium', layers_to_remove: 1, details: '',
    measurement: null, roof_type: 'asphalt', material_grade: 'standard',
    tear_off: true, include_underlayment: true, include_accessories: true, extras: {},
  });
  let S = fresh();
  let options = null;
  let root = null;
  let busy = false;

  const save = () => sessionStorage.setItem(KEY, JSON.stringify(S));
  const load = () => { try { S = { ...fresh(), ...JSON.parse(sessionStorage.getItem(KEY)) }; } catch { S = fresh(); } };

  // ── Rendering ──
  function stepper() {
    const labels = ['Project details', 'Materials & scope', 'Review & generate'];
    return `<div class="stepper">${labels.map((l, i) => {
      const n = i + 1, cls = n < S.step ? 'done' : n === S.step ? 'current' : '';
      return `<button class="step ${cls}" data-goto="${n}" ${n < S.step ? '' : 'tabindex="-1"'} aria-current="${n === S.step ? 'step' : 'false'}">
        <span class="step-top"><span class="step-num">${n < S.step ? CHECK : n}</span><span class="step-label">${l}</span></span>
        <span class="step-bar"></span></button>`;
    }).join('')}</div>`;
  }

  function render() {
    const body = S.step === 1 ? stepOne() : S.step === 2 ? stepTwo() : stepThree();
    root.innerHTML = `<div class="page page-narrow">
      <div class="page-head"><div><h1>New quote</h1></div>
        ${S.customer_name || S.property_address ? '<button class="btn btn-ghost btn-sm" data-act="reset">Start over</button>' : ''}</div>
      ${stepper()}
      <div class="card wiz-card">${body}</div>
    </div>`;
  }

  const field = (label, key, { type = 'text', req = false, placeholder = '', auto = '' } = {}) => `
    <label class="field"><span class="label">${label}${req ? ' <span class="req">*</span>' : ''}</span>
      <input class="input" type="${type}" data-k="${key}" value="${esc(S[key])}" placeholder="${esc(placeholder)}" ${auto ? `autocomplete="${auto}"` : ''} ${type === 'number' ? 'min="0" inputmode="numeric"' : ''} /></label>`;

  function measureChip() {
    const m = S.measurement;
    if (!m) return '';
    if (m.status !== 'complete') return `<div class="measure-chip pending"><span>Measurement ordered for <strong>${esc(m.address)}</strong>. It can take a while with the real EagleView service.</span>
      <button class="btn btn-sm" data-act="refresh">Check again</button></div>`;
    return `<div class="measure-chip">
      <span><strong>${num(m.total_roof_area_sqft)} sq ft</strong> roof area</span>
      <span>Pitch <strong>${esc(m.predominant_pitch || cap(m.pitch_normalized))}</strong></span>
      ${m.facets_count ? `<span><strong>${m.facets_count}</strong> facets</span>` : ''}
      ${m.roof_age_years != null ? `<span>About <strong>${Math.round(m.roof_age_years)}</strong> years old</span>` : ''}
      <span class="src">${m.provider === 'eagleview_mock' ? 'EagleView (sample data)' : 'EagleView'}</span></div>`;
  }

  function stepOne() {
    return `
      <h1>Project details</h1>
      <p class="sub">Who the quote is for and what kind of job it is.</p>
      <div class="grid g3">
        ${field('Customer name', 'customer_name', { req: true, placeholder: 'Sarah Thompson', auto: 'off' })}
        ${field('Email', 'customer_email', { type: 'email', placeholder: 'sarah@email.com', auto: 'off' })}
        ${field('Phone', 'customer_phone', { type: 'tel', placeholder: '(555) 123-4567', auto: 'off' })}
      </div>
      <div class="field" style="margin-top:16px">
        <span class="label">Project address <span class="req">*</span></span>
        <div class="input-group">
          <input class="input" data-k="property_address" value="${esc(S.property_address)}" placeholder="123 Maple Street, Denver, CO 80205" autocomplete="off" />
          <button class="btn btn-dark" data-act="measure">${busy === 'measure' ? '<span class="spinner"></span>' : '<svg viewBox="0 0 16 16"><path d="M2 12 12 2 M4 10l1.5 1.5 M6.5 7.5 8 9 M9 5l1.5 1.5"/></svg>'} Measure roof</button>
        </div>
        <span class="hint">Measuring fills in the roof size and pitch from aerial data.</span>
        ${measureChip()}
      </div>

      <div class="section-title">Project type <span class="req">*</span></div>
      <div class="choice-grid" role="radiogroup" aria-label="Project type">
        ${Object.entries(PROJECT_TYPES).map(([k, v]) => `
          <button class="choice ${S.project_type === k ? 'selected' : ''}" role="radio" aria-checked="${S.project_type === k}" data-pick="project_type" data-val="${k}">
            ${Art.house(k)}<span class="check">${CHECK}</span>
            <span class="choice-body"><span class="choice-title">${v}</span><span class="choice-sub">${PROJECT_SUB[k]}</span></span>
          </button>`).join('')}
      </div>

      ${S.project_type === 'inspection' ? '' : `
      <div class="grid g3" style="margin-top:22px">
        <label class="field"><span class="label">Roof size <span class="req">*</span></span>
          <span class="affix suffix" data-suffix="sq ft"><input class="input" type="number" min="0" inputmode="numeric" data-k="roof_area_sqft" value="${esc(S.roof_area_sqft)}" placeholder="2,400" /></span></label>
        <label class="field"><span class="label">Roof pitch</span>
          <select class="select" data-k="pitch">${Object.entries(PITCHES).map(([k, v]) => `<option value="${k}" ${S.pitch === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        ${S.project_type === 'new_construction' ? '' : `
        <label class="field"><span class="label">Layers to tear off</span>
          <select class="select" data-k="layers_to_remove">${[0, 1, 2, 3].map(n => `<option value="${n}" ${+S.layers_to_remove === n ? 'selected' : ''}>${n === 0 ? 'None' : n + ' layer' + (n > 1 ? 's' : '')}</option>`).join('')}</select></label>`}
      </div>`}

      <label class="field" style="margin-top:16px"><span class="label">Job notes <span class="muted">(optional)</span></span>
        <textarea class="textarea" data-k="details" placeholder="For example: customer wants architectural shingles, two skylights, some soft spots near the chimney.">${esc(S.details)}</textarea>
        <span class="hint">The AI reads these when it writes the project overview.</span></label>

      <div class="wiz-foot"><span></span><button class="btn btn-primary btn-lg" data-act="next">Continue to materials & scope <svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button></div>`;
  }

  function stepTwo() {
    if (S.project_type === 'inspection') {
      return `<h1>Materials & scope</h1>
        <p class="sub">Inspections are priced from the inspection fee in your profile, so there's nothing to choose here.</p>
        ${foot2()}`;
    }
    const systems = options.roof_systems;
    const sys = systems[S.roof_type] || systems.asphalt;
    const extras = options.extras.filter(e => e.applies_to.includes(S.roof_type));
    const layers = +S.layers_to_remove;

    return `
      <h1>Materials & scope</h1>
      <p class="sub">Choose the roofing system and what's included. Products and prices come from your Pricing & Profile page.</p>

      <div class="spread"><div class="section-title" style="margin-top:0">Roofing material</div>
        <div class="seg" role="tablist">${Object.keys(systems).filter(t => t !== 'other').map(t =>
          `<button role="tab" aria-selected="${S.roof_type === t}" class="${S.roof_type === t ? 'on' : ''}" data-pick="roof_type" data-val="${t}">${cap(t)}</button>`).join('')}</div></div>
      <div class="choice-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px" role="radiogroup" aria-label="Material grade">
        ${Object.entries(sys.tiers).map(([g, t]) => `
          <button class="choice ${S.material_grade === g ? 'selected' : ''}" role="radio" aria-checked="${S.material_grade === g}" data-pick="material_grade" data-val="${g}">
            ${Art.swatch(S.roof_type, g)}<span class="check">${CHECK}</span>
            <span class="choice-body"><span class="choice-title">${esc(t.product)}</span>
              <span class="choice-sub">${cap(g)} · your cost about ${money0(t.price_per_square)}/sq</span>
              <span class="choice-tag">${GRADE_TAG[g] || cap(g)}</span></span>
          </button>`).join('')}
      </div>

      <div class="section-title">Scope of work</div>
      <p class="sub">Uncheck anything this job doesn't need.</p>
      <div class="checks">
        ${S.project_type !== 'new_construction' && layers > 0 ? checkRow('tear_off', `Remove existing roofing (${layers} layer${layers > 1 ? 's' : ''})`, 'Tear off, dumpster, and haul-away') : ''}
        ${checkRow('include_underlayment', 'Underlayment & ice barrier', 'Synthetic underlayment, ice and water shield at eaves and valleys')}
        ${checkRow('include_accessories', 'Flashing, vents & accessories', 'Drip edge, starter, ridge cap and vents, valley metal, nails, pipe boots')}
      </div>

      ${extras.length ? `
      <div class="section-title">Optional add-ons</div>
      <p class="sub">Extra work the customer may want. Quantities fill in from the measurements when possible.</p>
      <div class="checks">${extras.map(e => {
        const x = S.extras[e.id] || {};
        const auto = e.basis !== 'per_job';
        return `<label class="check-row">
          <input type="checkbox" data-extra="${e.id}" ${x.on ? 'checked' : ''} />
          <span class="check-text"><strong>${esc(e.name)}</strong><span>${esc(e.description || '')}</span></span>
          ${x.on ? `<span class="check-qty"><span class="affix suffix" data-suffix="${esc(e.unit)}"><input class="input" type="number" min="0" step="any" data-extra-qty="${e.id}"
            value="${esc(x.qty ?? '')}" placeholder="${auto ? 'Auto' : esc(e.default_qty ?? 1)}" aria-label="${esc(e.name)} quantity" /></span></span>` : ''}
        </label>`;
      }).join('')}</div>` : ''}
      ${foot2()}`;
  }

  const checkRow = (key, title, text) => `<label class="check-row"><input type="checkbox" data-flag="${key}" ${S[key] ? 'checked' : ''} />
    <span class="check-text"><strong>${title}</strong><span>${text}</span></span></label>`;

  const foot2 = () => `<div class="wiz-foot"><button class="btn" data-act="back"><svg viewBox="0 0 16 16"><path d="M13 8H3M7 4 3 8l4 4"/></svg> Back</button>
    <button class="btn btn-primary btn-lg" data-act="next">Continue to review <svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg></button></div>`;

  function stepThree() {
    const insp = S.project_type === 'inspection';
    const sys = options.roof_systems[S.roof_type];
    const product = sys?.tiers[S.material_grade]?.product;
    const chosen = options.extras.filter(e => S.extras[e.id]?.on && e.applies_to.includes(S.roof_type));
    const scope = [
      S.project_type !== 'new_construction' && +S.layers_to_remove > 0 && S.tear_off ? `Tear-off (${S.layers_to_remove} layer${S.layers_to_remove > 1 ? 's' : ''})` : null,
      S.include_underlayment ? 'Underlayment & ice barrier' : null,
      S.include_accessories ? 'Flashing, vents & accessories' : null,
      ...chosen.map(e => e.name),
    ].filter(Boolean);
    const item = (k, v) => `<div class="review-item"><div class="k">${k}</div><div class="v">${v || '—'}</div></div>`;

    return `
      <h1>Review & generate</h1>
      <p class="sub">Check the details, then generate. You can edit every line afterward.</p>
      <div class="review-grid">
        ${item('Customer', esc(S.customer_name) + (S.customer_email ? `<span class="cell-sub">${esc(S.customer_email)}</span>` : ''))}
        ${item('Address', esc(S.property_address))}
        ${item('Project', PROJECT_TYPES[S.project_type])}
        ${insp ? '' : item('Roof', `${num(S.roof_area_sqft)} sq ft · ${cap(S.pitch)} pitch${S.measurement?.status === 'complete' ? ' · measured' : ''}`)}
        ${insp ? '' : item('Material', `${esc(product || '')}<span class="cell-sub">${cap(S.roof_type)}, ${S.material_grade}</span>`)}
        ${insp ? '' : item('Scope', scope.map(esc).join(', '))}
      </div>
      <div class="generate-box">
        <p><strong>Generate the quote</strong>Prices come from your profile. The AI writes the project overview and adds notes from your documents, such as warranty and payment terms.</p>
        <button class="btn btn-primary btn-lg" data-act="generate" ${busy ? 'disabled' : ''}>
          ${busy === 'generate' ? '<span class="spinner"></span> Building your quote…' : 'Generate quote'}</button>
      </div>
      <div class="wiz-foot"><button class="btn" data-act="back"><svg viewBox="0 0 16 16"><path d="M13 8H3M7 4 3 8l4 4"/></svg> Back</button><span></span></div>`;
  }

  // ── Actions ──
  function validate(step) {
    if (step === 1) {
      if (!S.customer_name.trim()) return ['customer_name', 'Enter the customer name.'];
      if (!S.property_address.trim()) return ['property_address', 'Enter the project address.'];
      if (S.project_type !== 'inspection' && !(+S.roof_area_sqft > 0)) return ['roof_area_sqft', 'Enter the roof size, or click Measure roof.'];
    }
    return null;
  }

  function useMeasurement(m) {
    S.measurement = m;
    if (m.status === 'complete') {
      S.roof_area_sqft = Math.round(m.total_roof_area_sqft);
      S.pitch = m.pitch_normalized || S.pitch;
    }
  }

  async function measure() {
    if (!S.property_address.trim()) { App.toast('Enter the project address first.', 'error'); root.querySelector('[data-k=property_address]').focus(); return; }
    busy = 'measure'; render();
    try {
      const m = await App.api('/api/measurements/request', { method: 'POST', body: { address: S.property_address, customer_name: S.customer_name } });
      useMeasurement(m);
      App.toast(m.status === 'complete' ? `Measured: ${num(m.total_roof_area_sqft)} sq ft` : 'Measurement ordered');
    } catch (e) { App.toast(`Couldn't measure this roof. ${e.message}`, 'error'); }
    busy = false; save(); render();
  }

  async function refresh() {
    try {
      const m = await App.api(`/api/measurements/${S.measurement.id}/refresh`, { method: 'POST' });
      if (m.error) throw new Error(m.error);
      useMeasurement({ ...S.measurement, ...m });
      App.toast(m.status === 'complete' ? 'Measurements are in' : 'Still processing. Check again in a few minutes.');
    } catch (e) { App.toast(e.message, 'error'); }
    save(); render();
  }

  async function generate() {
    busy = 'generate'; render();
    const extras = {};
    for (const e of options.extras) {
      const x = S.extras[e.id];
      if (x?.on && e.applies_to.includes(S.roof_type)) extras[e.id] = x.qty === '' || x.qty == null ? null : +x.qty;
    }
    try {
      const q = await App.api('/api/quotes/build', { method: 'POST', body: {
        customer_name: S.customer_name.trim(), customer_email: S.customer_email.trim() || null,
        customer_phone: S.customer_phone.trim() || null, property_address: S.property_address.trim(),
        project_type: S.project_type, details: S.details.trim() || null,
        roof_type: S.roof_type, material_grade: S.material_grade, pitch: S.pitch,
        roof_area_sqft: S.project_type === 'inspection' ? (+S.roof_area_sqft || 0) : +S.roof_area_sqft,
        layers_to_remove: S.tear_off && S.project_type !== 'new_construction' ? +S.layers_to_remove : 0,
        measurement_id: S.measurement?.status === 'complete' ? S.measurement.id : null,
        include_underlayment: S.include_underlayment, include_accessories: S.include_accessories, extras,
      } });
      sessionStorage.removeItem(KEY);
      S = fresh();
      busy = false;
      App.justCreated = q.id;
      App.go(`#/quote/${q.id}`);
    } catch (e) {
      busy = false; render();
      App.toast(`Couldn't build the quote. ${e.message}`, 'error');
    }
  }

  function bind() {
    root.addEventListener('input', e => {
      const k = e.target.dataset.k;
      if (k) { S[k] = e.target.value; save(); }
      const q = e.target.dataset.extraQty;
      if (q) { S.extras[q] = { ...S.extras[q], qty: e.target.value }; save(); }
    });
    root.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.k === 'layers_to_remove') { S.layers_to_remove = +t.value; save(); }
      if (t.dataset.flag) { S[t.dataset.flag] = t.checked; save(); }
      if (t.dataset.extra) { S.extras[t.dataset.extra] = { ...S.extras[t.dataset.extra], on: t.checked }; save(); render(); }
    });
    root.addEventListener('click', e => {
      const pick = e.target.closest('[data-pick]');
      if (pick) {
        S[pick.dataset.pick] = pick.dataset.val;
        if (pick.dataset.pick === 'roof_type' && !options.roof_systems[S.roof_type].tiers[S.material_grade]) S.material_grade = 'standard';
        save(); render();
        root.querySelector(`[data-pick="${pick.dataset.pick}"][data-val="${pick.dataset.val}"]`)?.focus();
        return;
      }
      const go = e.target.closest('[data-goto]');
      if (go && +go.dataset.goto < S.step) { S.step = +go.dataset.goto; save(); render(); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act || busy) return;
      if (act === 'next') {
        const err = validate(S.step);
        if (err) { App.toast(err[1], 'error'); root.querySelector(`[data-k=${err[0]}]`)?.focus(); return; }
        S.step++; save(); render(); window.scrollTo(0, 0);
      }
      if (act === 'back') { S.step--; save(); render(); window.scrollTo(0, 0); }
      if (act === 'measure') measure();
      if (act === 'refresh') refresh();
      if (act === 'generate') generate();
      if (act === 'reset' && confirm('Clear this quote and start over?')) { S = fresh(); sessionStorage.removeItem(KEY); render(); }
    });
    root.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.dataset.k === 'property_address') { e.preventDefault(); measure(); }
    });
  }

  App.route('/new', 'new', async el => {
    root = el;
    busy = false;
    load();
    options = await App.api('/api/quote-options');
    if (!options.roof_systems[S.roof_type]) S.roof_type = 'asphalt';
    render();
    bind();
  });
})();
