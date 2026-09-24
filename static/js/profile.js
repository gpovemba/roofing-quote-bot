// ── Pricing & Profile ─────────────────────────────────────────
(() => {
  const { esc, cap } = App;
  const ROOF_TYPES = ['asphalt', 'metal', 'tile', 'flat', 'other'];
  const GRADES = ['economy', 'standard', 'premium'];
  const PITCHES = ['low', 'medium', 'steep', 'complex'];
  const BASIS = [
    ['per_square', 'Roof squares', 'sq per unit'], ['eave_rake_ft', 'Eaves + rakes', 'ft per unit'],
    ['eave_valley_ft', 'Eaves + valleys', 'ft per unit'], ['eave_ft', 'Eaves', 'ft per unit'],
    ['rake_ft', 'Rakes', 'ft per unit'], ['ridge_ft', 'Ridge', 'ft per unit'],
    ['valley_ft', 'Valleys', 'ft per unit'], ['per_job', 'Fixed per job', 'per job'],
  ];

  let P, dirty, tab, root;

  const get = path => path.split('.').reduce((o, k) => o?.[k], P);
  const set = (path, v) => { const k = path.split('.'); const last = k.pop(); k.reduce((o, x) => o[x], P)[last] = v; };

  function input(path, kind = 'text', label = '', extra = '') {
    let v = get(path);
    if (kind === 'pct') v = v == null ? '' : +(v * 100).toFixed(2);
    const el = `<input class="input ${extra}" ${kind === 'text' ? 'type="text"' : 'type="number" step="any" min="0" inputmode="decimal"'}
      data-path="${path}" data-kind="${kind}" value="${esc(v)}" ${label ? `aria-label="${esc(label)}" placeholder="${esc(label)}"` : ''} />`;
    if (kind === 'money') return `<span class="affix" data-prefix="$">${el}</span>`;
    if (kind === 'pct') return `<span class="affix suffix" data-suffix="%">${el}</span>`;
    return el;
  }
  const field = (label, path, kind = 'text', hint = '') =>
    `<label class="field"><span class="label">${label}</span>${input(path, kind)}${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;

  function render() {
    const marginHint = m => `${Math.round(m * 100)}% markup is a ${(m / (1 + m) * 100).toFixed(1)}% profit margin`;
    root.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>Pricing & Profile</h1><p>Your suppliers, costs, and rates. Every quote is priced from these numbers.</p></div></div>
      ${P.is_default ? '<div class="banner">These are sample prices. Replace them with what you actually pay, then save, so quotes are accurate.</div>' : ''}
      <div class="card">
        <section class="settings-section"><div class="h2">Company</div><p class="sub">Shown at the top of every quote you send.</p>
          <div class="grid g3">${field('Company name', 'company.name')}${field('Phone', 'company.phone')}${field('Email', 'company.email')}
            ${field('License number', 'company.license_number')}${field('Service area', 'company.service_area', 'text', 'For example: Westchester County, NY')}</div></section>

        <section class="settings-section"><div class="spread"><div><div class="h2">Roofing materials</div>
          <p class="sub">The main product at each grade, your supplier cost, and how many units cover one square (100 sq ft).</p></div></div>
          <div class="seg" role="tablist" style="margin-bottom:14px">${ROOF_TYPES.map(t => `<button role="tab" aria-selected="${tab === t}" class="${tab === t ? 'on' : ''}" data-tab="${t}">${cap(t)}</button>`).join('')}</div>
          <div class="grid g4" style="margin-bottom:14px">${field('Waste factor', `roof_systems.${tab}.waste_factor`, 'pct', 'When measurements don\'t include one')}${field('Base labor', `roof_systems.${tab}.labor_per_square`, 'money', 'Per square')}</div>
          <div class="table-wrap"><table class="table pf-table"><thead><tr><th>Grade</th><th style="min-width:230px">Product</th><th>Supplier</th><th style="width:100px">Unit</th><th style="width:120px">Your cost per unit</th><th style="width:110px">Units per square</th></tr></thead>
            <tbody>${GRADES.map(g => { const b = `roof_systems.${tab}.tiers.${g}`; return `<tr><td class="strong" style="padding-top:14px">${cap(g)}</td>
              <td>${input(`${b}.product`, 'text', `${g} product`)}</td><td>${input(`${b}.supplier`, 'text', 'Supplier')}</td><td>${input(`${b}.unit`, 'text', 'Unit')}</td>
              <td>${input(`${b}.unit_price`, 'money', 'Cost per unit')}</td><td>${input(`${b}.units_per_square`, 'num', 'Units per square')}</td></tr>`; }).join('')}</tbody></table></div>
        </section>

        <section class="settings-section"><div class="h2">Included materials</div>
          <p class="sub">Added to every quote for the roof types you pick. Quantities come from the roof measurements; for example, a 10 ft piece of drip edge covers 10 ft of eaves and rakes.</p>
          ${accessoryTable(false)}<button class="btn btn-sm" data-add="included" style="margin-top:12px">+ Add material</button></section>

        <section class="settings-section"><div class="h2">Optional add-ons</div>
          <p class="sub">Shown as checkboxes in the quote builder, so you can add them job by job: gutters, skylights, decking, and so on.</p>
          ${accessoryTable(true)}<button class="btn btn-sm" data-add="extra" style="margin-top:12px">+ Add add-on</button></section>

        <section class="settings-section"><div class="h2">Labor</div><p class="sub">Base labor per square is set per roof type above. These are added on top.</p>
          <div class="grid g4">${PITCHES.map(p => field(`${cap(p)} pitch extra`, `labor.pitch_adder_per_square.${p}`, 'money', 'Per square')).join('')}
            ${field('Tear-off', 'labor.tearoff_per_square_per_layer', 'money', 'Per square, per layer')}</div></section>

        <section class="settings-section"><div class="h2">Local costs</div><p class="sub">Added to every job. You can still change them on a single quote.</p>
          <div class="grid g3">${field('Dumpster', 'local_costs.dumpster_price', 'money', 'Per load')}${field('Dumpster holds', 'local_costs.squares_per_dumpster', 'num', 'Squares of tear-off per load')}
            ${field('Permit fee', 'local_costs.permit_fee', 'money')}${field('Material delivery', 'local_costs.delivery_fee', 'money')}
            ${field('Equipment', 'local_costs.equipment_fee', 'money', 'Lift, trailer, etc.')}${field('Inspection visit', 'local_costs.inspection_fee', 'money', 'Your cost for an inspection')}</div></section>

        <section class="settings-section"><div class="h2">Pricing</div>
          <div class="grid g4">${field('Overhead', 'pricing.overhead_pct', 'pct', 'Insurance, office, vehicles')}
            ${field('Markup', 'pricing.markup_pct', 'pct', `<span id="marginHint">${marginHint(P.pricing.markup_pct)}</span>`)}
            ${field('Sales tax on materials', 'pricing.material_tax_pct', 'pct')}${field('Minimum job price', 'pricing.minimum_job_price', 'money', '0 for no minimum')}</div></section>

        <div class="savebar"><span class="dirty">${dirty ? 'Unsaved changes' : ''}</span>
          <button class="btn btn-ghost btn-sm" data-act="reset">Reset to sample prices</button>
          <button class="btn btn-primary" data-act="save" ${dirty ? '' : 'disabled'}>Save changes</button></div>
      </div></div>`;
  }

  function accessoryTable(extras) {
    const rows = P.accessories.map((a, i) => [a, i]).filter(([a]) => (a.group === 'extra') === extras);
    if (!rows.length) return '<p class="hint">None yet.</p>';
    return `<div class="table-wrap"><table class="table pf-table" style="min-width:880px"><thead><tr>
      <th>On</th><th style="min-width:210px">${extras ? 'Add-on and description' : 'Item and supplier'}</th><th style="width:90px">Unit</th><th style="width:110px">Your cost</th>
      <th style="width:160px">${extras ? 'Measured by' : 'Measured by / group'}</th><th style="width:100px">${extras ? 'Default qty' : 'Coverage'}</th><th style="width:200px">Used on</th><th style="width:44px"></th></tr></thead>
      <tbody>${rows.map(([a, i]) => {
        const b = `accessories.${i}`, basis = BASIS.find(x => x[0] === a.basis) || BASIS[0];
        return `<tr class="${a.enabled ? '' : 'off'}">
          <td><input type="checkbox" data-enabled="${i}" ${a.enabled ? 'checked' : ''} aria-label="Use ${esc(a.name)}" /></td>
          <td>${input(`${b}.name`, 'text', 'Name')}${extras ? input(`${b}.description`, 'text', 'Description shown in the quote builder', 'small') : input(`${b}.supplier`, 'text', 'Supplier', 'small')}</td>
          <td>${input(`${b}.unit`, 'text', 'Unit')}</td><td>${input(`${b}.unit_price`, 'money', 'Cost')}</td>
          <td><select class="select" data-basis="${i}" aria-label="Measured by">${BASIS.map(([v, l]) => `<option value="${v}" ${v === a.basis ? 'selected' : ''}>${l}</option>`).join('')}</select>
            ${extras ? '' : `<select class="select input small" data-group="${i}" aria-label="Scope group" style="margin-top:4px;height:30px;font-size:12px"><option value="underlayment" ${a.group === 'underlayment' ? 'selected' : ''}>Underlayment</option><option value="accessories" ${a.group === 'accessories' ? 'selected' : ''}>Flashing & accessories</option></select>`}</td>
          <td>${extras && a.basis !== 'per_job' ? '<span class="hint" style="display:block;padding-top:10px">From measurements</span>' : `${input(`${b}.coverage`, 'num', 'Coverage')}${extras ? '' : `<span class="hint">${basis[2]}</span>`}`}</td>
          <td><div class="roof-chips">${ROOF_TYPES.map(rt => `<button type="button" class="${a.applies_to.includes(rt) ? 'on' : ''}" data-roof="${i}" data-rt="${rt}" aria-pressed="${a.applies_to.includes(rt)}">${cap(rt)}</button>`).join('')}</div></td>
          <td><button class="icon-btn danger" data-remove="${i}" aria-label="Remove ${esc(a.name)}"><svg viewBox="0 0 20 20"><path d="M4 6h12 M8 6V4h4v2 M6 6l.7 10h6.6L14 6"/></svg></button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  function markDirty() {
    dirty = true;
    const d = root.querySelector('.dirty'); if (d) d.textContent = 'Unsaved changes';
    const s = root.querySelector('[data-act=save]'); if (s) s.disabled = false;
  }

  function bind() {
    root.addEventListener('input', e => {
      const t = e.target;
      if (!t.dataset.path) return;
      let v = t.value;
      if (t.dataset.kind !== 'text') { v = v === '' ? 0 : parseFloat(v); if (Number.isNaN(v)) return; if (t.dataset.kind === 'pct') v /= 100; }
      set(t.dataset.path, v);
      if (t.dataset.path === 'pricing.markup_pct') root.querySelector('#marginHint').textContent = `${Math.round(v * 100)}% markup is a ${(v / (1 + v) * 100).toFixed(1)}% profit margin`;
      markDirty();
    });
    root.addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.enabled != null) { P.accessories[+t.dataset.enabled].enabled = t.checked; t.closest('tr').classList.toggle('off', !t.checked); markDirty(); }
      if (t.dataset.basis != null) { const a = P.accessories[+t.dataset.basis]; a.basis = t.value; if (!a.coverage) a.coverage = 1; markDirty(); render(); }
      if (t.dataset.group != null) { P.accessories[+t.dataset.group].group = t.value; markDirty(); }
    });
    root.addEventListener('click', async e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
      if (t.dataset.roof != null) {
        const a = P.accessories[+t.dataset.roof], rt = t.dataset.rt;
        a.applies_to = a.applies_to.includes(rt) ? a.applies_to.filter(x => x !== rt) : [...a.applies_to, rt];
        t.classList.toggle('on'); t.setAttribute('aria-pressed', a.applies_to.includes(rt)); markDirty(); return;
      }
      if (t.dataset.remove != null) { P.accessories.splice(+t.dataset.remove, 1); markDirty(); render(); return; }
      if (t.dataset.add) {
        const extra = t.dataset.add === 'extra';
        P.accessories.push({ id: 'custom_' + Date.now().toString(36), name: extra ? 'New add-on' : 'New material', group: extra ? 'extra' : 'accessories',
          description: '', supplier: '', unit: 'each', unit_price: 0, basis: 'per_job', coverage: 1, applies_to: [...ROOF_TYPES], enabled: true });
        markDirty(); render(); return;
      }
      if (t.dataset.act === 'save') {
        t.disabled = true; t.innerHTML = '<span class="spinner"></span> Saving…';
        try {
          P = await App.api('/api/profile', { method: 'PUT', body: P });
          dirty = false; render(); App.toast('Saved. New quotes will use these prices.'); App.refreshChrome();
        } catch (err) { App.toast(`Not saved. ${err.message}`, 'error'); t.disabled = false; t.textContent = 'Save changes'; }
      }
      if (t.dataset.act === 'reset' && confirm('Replace your profile with the sample prices? Your saved suppliers and rates will be lost.')) {
        P = await App.api('/api/profile/reset', { method: 'POST' }); dirty = false; render(); App.toast('Reset to sample prices'); App.refreshChrome();
      }
    });
  }

  App.route('/pricing', 'pricing', async el => {
    root = el; dirty = false; tab = 'asphalt';
    P = await App.api('/api/profile');
    App.setLeaveGuard(() => dirty);
    render(); bind();
  });
})();
