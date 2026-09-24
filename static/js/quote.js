// ── Quote: preview, edit, send ────────────────────────────────
const QuoteDoc = (() => {
  const { esc, money, num, date, quoteNumber, customerLines, PROJECT_TYPES } = App;

  function html(q) {
    const b = q.breakdown;
    const s = { validity_days: 30, show_line_prices: true, include_notes: true, ...(b.quote_settings || {}) };
    const { lines, subtotal, tax, total } = customerLines(b);
    const company = b.company_name || 'Your Roofing Co.';
    const contact = [b.company_phone, b.company_email, b.company_license ? `License ${b.company_license}` : ''].filter(Boolean).map(esc).join(' · ');
    const notes = s.include_notes ? (b.customer_notes || []) : [];

    return `<article class="doc" id="quoteDoc">
      <header class="doc-top">
        <div><div class="doc-company">${esc(company)}</div>${contact ? `<div class="doc-contact">${contact}</div>` : ''}</div>
        <div class="doc-meta">Quote <strong>${quoteNumber(q)}</strong><br>Date <strong>${date(q.created_at)}</strong><br>Valid for <strong>${s.validity_days} days</strong></div>
      </header>
      <div class="doc-intro">
        ${Art.house(b.project_type || 'replacement')}
        <div class="doc-for">Prepared for<br><strong>${esc(q.customer_name || 'Customer')}</strong><br>
          ${esc(q.property_address || '')}${q.customer_email ? `<br>${esc(q.customer_email)}` : ''}${q.customer_phone ? `<br>${esc(q.customer_phone)}` : ''}</div>
      </div>
      <h2>${esc(PROJECT_TYPES[b.project_type] || 'Roofing')} quote</h2>
      ${b.overview ? `<p class="overview">${esc(b.overview)}</p>` : ''}
      <h3>Scope and pricing</h3>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Description</th><th class="num">Quantity</th>${s.show_line_prices ? '<th class="num">Unit price</th><th class="num">Total</th>' : ''}</tr></thead>
        <tbody>${lines.map(l => `<tr><td>${esc(l.name)}</td><td class="num">${num(l.quantity, 2)} ${esc(l.unit)}</td>
          ${s.show_line_prices ? `<td class="num">${money(l.unit_price)}</td><td class="num">${money(l.total)}</td>` : ''}</tr>`).join('')}</tbody>
      </table></div>
      <div class="doc-totals">
        ${tax > 0 ? `<div><span>Subtotal</span><span>${money(subtotal)}</span></div><div><span>Sales tax</span><span>${money(tax)}</span></div>` : ''}
        <div class="grand"><span>Total</span><span>${money(total)}</span></div>
      </div>
      ${notes.length ? `<h3>Notes</h3><ul class="doc-notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="doc-foot">This quote is valid for ${s.validity_days} days from the date above. Prepared by ${esc(company.replace(/\.$/, ''))}.</div>
    </article>`;
  }
  return { html };
})();

(() => {
  const { esc, money, money0, pct, num, cap, statusPill, STATUSES, quoteNumber } = App;
  const ICON = {
    edit: '<svg viewBox="0 0 16 16"><path d="M10.5 2.5l3 3L6 13H3v-3z"/></svg>',
    send: '<svg viewBox="0 0 16 16"><path d="M14 2 7 9 M14 2l-4.5 12-2.5-5-5-2.5z"/></svg>',
    pdf: '<svg viewBox="0 0 16 16"><path d="M8 2v8 M4.5 6.5 8 10l3.5-3.5 M3 13h10"/></svg>',
  };

  const load = id => App.api(`/api/quotes/${encodeURIComponent(id)}`);
  const marginColor = m => m < 0.12 ? 'var(--red)' : m < 0.2 ? 'var(--amber)' : 'var(--green)';

  // ── Preview ──
  App.route('/quote/:id', 'quotes', async (root, { id }) => {
    let q = await load(id);
    const fresh = App.justCreated === id;
    App.justCreated = null;

    const render = () => {
      const b = q.breakdown;
      root.innerHTML = `<div class="page">
        <a class="back-link no-print" href="#/quotes">← All quotes</a>
        ${fresh ? `<div class="ready-banner"><span class="dot"><svg viewBox="0 0 16 16"><path d="m3.5 8.5 3 3 6-7"/></svg></span>
          <span><strong>Your quote is ready</strong><span>Review it below, edit anything you want, then send it to ${esc(q.customer_name || 'the customer')}.</span></span></div>` : ''}
        <div class="page-head"><div><h1>${esc(q.customer_name || 'Unnamed customer')}</h1><p>${esc(q.property_address || '')} · ${quoteNumber(q)}</p></div>
          <div class="actions">
            <a class="btn" href="#/quote/${esc(id)}/edit">${ICON.edit} Edit quote</a>
            <button class="btn" data-act="print">${ICON.pdf} Download PDF</button>
            <a class="btn btn-primary" href="#/quote/${esc(id)}/send">${ICON.send} Send to customer</a>
          </div></div>
        <div class="quote-layout">
          <div>${QuoteDoc.html(q)}</div>
          <aside class="rail">
            <div class="card card-pad">
              <div class="h2" style="font-size:14px">Your numbers</div><p class="hint" style="margin-bottom:10px">Only you see this.</p>
              <div class="rail-row big"><span>Quote total</span><span>${money(b.final_quote)}</span></div>
              <div class="rail-row"><span>Your cost</span><span>${money(b.total_cost)}</span></div>
              <div class="rail-row"><span>Profit</span><span>${money(b.profit)}</span></div>
              <div class="margin-bar"><span style="width:${Math.min(b.profit_margin * 250, 100)}%;background:${marginColor(b.profit_margin)}"></span></div>
              <div class="hint">${pct(b.profit_margin)} margin · ${pct(b.markup_pct, 0)} markup · ${pct(b.overhead_pct, 0)} overhead</div>
              ${b.minimum_applied ? '<p class="hint" style="margin-top:8px">Raised to your minimum job price.</p>' : ''}
            </div>
            <div class="card card-pad">
              <label class="field"><span class="label">Status</span>
                <select class="select" data-act="status">${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${q.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            </div>
            ${b.edges_estimated ? `<div class="card card-pad"><span class="pill pill-est">Estimated</span>
              <p class="hint" style="margin-top:6px">Edge lengths for drip edge, starter, and ridge items were estimated from the roof area. Measuring the roof gives exact quantities.</p></div>` : ''}
            <div class="card card-pad">
              <div class="h2" style="font-size:14px">Notes from your documents</div>
              <p class="hint" style="margin:4px 0 10px">${(b.note_sources || []).length
                ? `Written from: ${b.note_sources.map(esc).join(', ')}`
                : (b.customer_notes || []).length ? 'Edited by you.' : 'No notes yet. Upload your warranty and policies on the Documents page, then rewrite.'}</p>
              <button class="btn btn-sm btn-block" data-act="rewrite">Rewrite overview & notes with AI</button>
            </div>
            <button class="btn btn-ghost btn-danger btn-sm" data-act="delete">Delete quote</button>
          </aside>
        </div></div>`;
    };
    render();

    root.addEventListener('change', async e => {
      if (e.target.dataset.act !== 'status') return;
      try { q = await App.api(`/api/quotes/${id}`, { method: 'PATCH', body: { status: e.target.value } }); App.toast(`Marked as ${STATUSES[q.status].toLowerCase()}`); }
      catch (err) { App.toast(err.message, 'error'); }
    });
    root.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'print') window.print();
      if (act === 'delete' && confirm('Delete this quote? This cannot be undone.')) {
        await App.api(`/api/quotes/${id}`, { method: 'DELETE' });
        App.toast('Quote deleted'); App.go('#/quotes');
      }
      if (act === 'rewrite') {
        const btn = e.target.closest('button');
        if ((q.breakdown.customer_notes || []).length && !confirm('Replace the current overview and notes with a new AI-written version?')) return;
        btn.disabled = true; btn.innerHTML = '<span class="spinner dark"></span> Writing…';
        try { q = await App.api(`/api/quotes/${id}/rewrite`, { method: 'POST' }); App.toast('Overview and notes updated'); }
        catch (err) { App.toast(err.message, 'error'); }
        render();
      }
    });
  });

  // ── Edit ──
  const CAT = {
    material: ['Material', '#3f4a52'], accessory: ['Material', '#6b7c85'], extra: ['Add-on', '#2f6fd6'],
    labor: ['Labor', '#22b35e'], tearoff: ['Tear-off', '#c27c0e'], disposal: ['Disposal', '#a8765a'],
    fees: ['Fee', '#86938f'], inspection: ['Inspection', '#22b35e'], custom: ['Custom', '#8b5cf6'],
  };

  function previewTotals(b) {                 // mirrors calculator.recalculate
    const items = b.line_items;
    items.forEach(i => (i.total = Math.round((+i.quantity || 0) * (+i.unit_price || 0) * 100) / 100));
    const mat = items.filter(i => i.category === 'material' || i.category === 'accessory').reduce((s, i) => s + i.total, 0);
    const tax = mat * (+b.material_tax_pct || 0);
    const direct = items.reduce((s, i) => s + i.total, 0) + tax;
    const cost = direct * (1 + (+b.overhead_pct || 0));
    let final = cost * (1 + (+b.markup_pct || 0));
    if (b.minimum_job_price && final < b.minimum_job_price) final = b.minimum_job_price;
    return { direct, cost, final, profit: final - cost, margin: final > 0 ? (final - cost) / final : 0 };
  }

  App.route('/quote/:id/edit', 'quotes', async (root, { id }) => {
    const q = await load(id);
    const b = JSON.parse(JSON.stringify(q.breakdown));
    b.quote_settings = { validity_days: 30, show_line_prices: true, include_notes: true, ...(b.quote_settings || {}) };
    b.customer_notes = b.customer_notes || [];
    let tab = 'items', dirty = false;
    App.setLeaveGuard(() => dirty);
    const touch = () => { dirty = true; updateSummary(); root.querySelector('[data-act=save]').disabled = false; root.querySelector('.dirty').textContent = 'Unsaved changes'; };

    const summary = () => {
      const t = previewTotals(b);
      return `<div class="rail-row"><span>Your cost</span><span>${money(t.cost)}</span></div>
        <div class="rail-row"><span>Profit</span><span>${money(t.profit)} (${pct(t.margin)})</span></div>
        <div class="rail-row big"><span>Customer price</span><span>${money(t.final)}</span></div>`;
    };
    const updateSummary = () => {
      root.querySelectorAll('[data-total]').forEach(el => { const it = b.line_items[+el.dataset.total]; el.textContent = money(it.total); });
      const s = root.querySelector('#editSummary'); if (s) s.innerHTML = summary();
    };

    const itemsTab = () => `
      <div class="card"><div class="table-wrap"><table class="table edit-table">
        <thead><tr><th style="min-width:260px">Description</th><th style="width:110px">Quantity</th><th style="width:100px">Unit</th><th style="width:130px">Your cost</th><th class="num" style="width:110px">Total</th><th style="width:44px"></th></tr></thead>
        <tbody>${b.line_items.map((it, i) => `<tr>
          <td><span class="row"><span class="cat-dot" style="background:${(CAT[it.category] || CAT.custom)[1]}" title="${(CAT[it.category] || CAT.custom)[0]}"></span>
            <input class="input" data-i="${i}" data-f="name" value="${esc(it.name)}" aria-label="Description" /></span>
            ${it.detail ? `<span class="cell-sub" style="margin:3px 0 0 16px">${esc(it.detail)}${it.estimated ? ' · <span class="pill pill-est">est.</span>' : ''}</span>` : ''}</td>
          <td><input class="input" type="number" step="any" min="0" data-i="${i}" data-f="quantity" value="${esc(it.quantity)}" aria-label="Quantity" /></td>
          <td><input class="input" data-i="${i}" data-f="unit" value="${esc(it.unit)}" aria-label="Unit" /></td>
          <td><span class="affix" data-prefix="$"><input class="input" type="number" step="any" min="0" data-i="${i}" data-f="unit_price" value="${esc(it.unit_price)}" aria-label="Your cost per unit" /></span></td>
          <td class="num strong" data-total="${i}">${money(it.total)}</td>
          <td><button class="icon-btn danger" data-del="${i}" aria-label="Remove ${esc(it.name)}"><svg viewBox="0 0 20 20"><path d="M4 6h12 M8 6V4h4v2 M6 6l.7 10h6.6L14 6"/></svg></button></td>
        </tr>`).join('')}</tbody></table></div>
        <div class="add-row">
          <label class="field"><span class="label">Add a custom line item</span><input class="input" id="newName" placeholder="For example: Replace 2 skylights" /></label>
          <label class="field"><span class="label">Quantity</span><input class="input" id="newQty" type="number" min="0" step="any" value="1" /></label>
          <label class="field"><span class="label">Unit</span><input class="input" id="newUnit" value="each" /></label>
          <label class="field"><span class="label">Your cost</span><span class="affix" data-prefix="$"><input class="input" id="newPrice" type="number" min="0" step="any" placeholder="0.00" /></span></label>
          <button class="btn btn-primary" data-act="add">Add item</button>
        </div></div>
      <p class="hint" style="margin-top:10px">Costs here are what you pay. Overhead and markup are added on top, so the customer sees higher unit prices that add up to the quote total.</p>`;

    const pricingTab = () => `<div class="card card-pad" style="max-width:560px">
      <div class="grid g3">
        ${[['overhead_pct', 'Overhead'], ['markup_pct', 'Markup'], ['material_tax_pct', 'Tax on materials']].map(([k, l]) => `
        <label class="field"><span class="label">${l}</span><span class="affix suffix" data-suffix="%">
          <input class="input" type="number" min="0" step="any" data-pct="${k}" value="${+(b[k] * 100).toFixed(2)}" /></span></label>`).join('')}
      </div><p class="hint" style="margin-top:12px">These apply to this quote only. Change your defaults on the Pricing & Profile page.</p></div>`;

    const termsTab = () => `<div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start">
      <div class="card card-pad stack">
        <label class="field"><span class="label">Project overview</span><textarea class="textarea" data-overview>${esc(b.overview || '')}</textarea></label>
        <div class="field"><span class="label">Notes for the customer</span>
          ${b.customer_notes.map((n, i) => `<div class="note-edit"><textarea class="textarea" data-note="${i}" aria-label="Note ${i + 1}">${esc(n)}</textarea>
            <button class="icon-btn danger" data-delnote="${i}" aria-label="Remove note"><svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15"/></svg></button></div>`).join('')}
          <div><button class="btn btn-sm" data-act="addnote">+ Add note</button></div></div>
      </div>
      <div class="card card-pad">
        <div class="h2" style="font-size:14px;margin-bottom:6px">Quote settings</div>
        <label class="field" style="margin:8px 0"><span class="label">Valid for</span><select class="select" data-set="validity_days">
          ${[14, 30, 45, 60, 90].map(d => `<option value="${d}" ${b.quote_settings.validity_days === d ? 'selected' : ''}>${d} days</option>`).join('')}</select></label>
        ${[['show_line_prices', 'Show prices for each line'], ['include_notes', 'Include notes']].map(([k, l]) => `
          <div class="setting-row"><span>${l}</span><label class="toggle"><input type="checkbox" data-set="${k}" ${b.quote_settings[k] ? 'checked' : ''} aria-label="${l}" /><span></span></label></div>`).join('')}
      </div></div>`;

    const render = () => {
      previewTotals(b);   // fills in each line's total before drawing
      root.innerHTML = `<div class="page">
        <a class="back-link" href="#/quote/${esc(id)}">← Back to quote</a>
        <div class="page-head"><div><h1>Edit quote</h1><p>${esc(q.customer_name || '')} · ${esc(q.property_address || '')}</p></div></div>
        <div class="tabs" role="tablist">${[['items', 'Line items'], ['pricing', 'Pricing & margins'], ['terms', 'Terms & notes']].map(([k, l]) =>
          `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="quote-layout">
          <div>${tab === 'items' ? itemsTab() : tab === 'pricing' ? pricingTab() : termsTab()}</div>
          <aside class="rail"><div class="card card-pad" id="editSummary">${summary()}</div></aside>
        </div>
        <div class="savebar card" style="margin-top:20px"><span class="dirty">${dirty ? 'Unsaved changes' : ''}</span>
          <a class="btn" href="#/quote/${esc(id)}">Cancel</a><button class="btn btn-primary" data-act="save" ${dirty ? '' : 'disabled'}>Save changes</button></div>
      </div>`;
    };
    render();

    root.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.f) {
        const it = b.line_items[+t.dataset.i];
        it[t.dataset.f] = ['quantity', 'unit_price'].includes(t.dataset.f) ? (t.value === '' ? 0 : +t.value) : t.value;
        touch();
      } else if (t.dataset.pct) { b[t.dataset.pct] = (+t.value || 0) / 100; touch(); }
      else if ('overview' in t.dataset) { b.overview = t.value; touch(); }
      else if (t.dataset.note != null) { b.customer_notes[+t.dataset.note] = t.value; touch(); }
    });
    root.addEventListener('change', e => {
      const k = e.target.dataset.set;
      if (!k) return;
      b.quote_settings[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
      touch();
    });
    root.addEventListener('click', async e => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.tab) { tab = t.dataset.tab; render(); return; }
      if (t.dataset.del != null) { b.line_items.splice(+t.dataset.del, 1); dirty = true; render(); return; }
      if (t.dataset.delnote != null) { b.customer_notes.splice(+t.dataset.delnote, 1); dirty = true; render(); return; }
      if (t.dataset.act === 'addnote') { b.customer_notes.push(''); dirty = true; render(); root.querySelector(`[data-note="${b.customer_notes.length - 1}"]`)?.focus(); return; }
      if (t.dataset.act === 'add') {
        const name = root.querySelector('#newName').value.trim();
        if (!name) { App.toast('Enter a description for the new item.', 'error'); root.querySelector('#newName').focus(); return; }
        b.line_items.push({ category: 'custom', name, quantity: +root.querySelector('#newQty').value || 1,
          unit: root.querySelector('#newUnit').value || 'each', unit_price: +root.querySelector('#newPrice').value || 0, detail: '' });
        dirty = true; render(); return;
      }
      if (t.dataset.act === 'save') {
        t.disabled = true; t.innerHTML = '<span class="spinner"></span> Saving…';
        try {
          await App.api(`/api/quotes/${id}`, { method: 'PATCH', body: {
            line_items: b.line_items, overhead_pct: b.overhead_pct, markup_pct: b.markup_pct, material_tax_pct: b.material_tax_pct,
            overview: b.overview, customer_notes: b.customer_notes.map(n => n.trim()).filter(Boolean), quote_settings: b.quote_settings,
          } });
          dirty = false; App.toast('Quote saved'); App.go(`#/quote/${id}`);
        } catch (err) { App.toast(err.message, 'error'); t.disabled = false; t.textContent = 'Save changes'; }
      }
    });
  });

  // ── Send ──
  App.route('/quote/:id/send', 'quotes', async (root, { id }) => {
    let q = await load(id);
    const b = q.breakdown;
    const company = b.company_name || 'Your Roofing Co.';
    const first = (q.customer_name || '').split(' ')[0] || 'there';
    const days = (b.quote_settings || {}).validity_days || 30;
    const subject = `Your roofing quote from ${company.replace(/\.$/, '')}`;
    const message = `Hi ${first},\n\nThanks for the opportunity to quote your roofing project at ${q.property_address || 'your home'}. The total for the ${(App.PROJECT_TYPES[b.project_type] || 'project').toLowerCase()} is ${money(b.final_quote)}.\n\nThe attached quote has the full scope of work and pricing. It's valid for ${days} days.\n\nLet me know if you have any questions.\n\nBest regards,\n${company}${b.company_phone ? '\n' + b.company_phone : ''}`;
    const summaryText = () => `${company} quote ${quoteNumber(q)}\n${q.customer_name || ''}, ${q.property_address || ''}\nTotal: ${money(b.final_quote)}\n${(b.overview || '').trim()}`;

    root.innerHTML = `<div class="page">
      <a class="back-link" href="#/quote/${esc(id)}">← Back to quote</a>
      <div class="page-head"><div><h1>Send quote</h1><p>${esc(q.customer_name || '')} · ${money(b.final_quote)} · ${statusPill(q.status)}</p></div></div>
      <div class="quote-layout">
        <div class="card card-pad stack">
          <div class="h2">Email the customer</div>
          <label class="field"><span class="label">Customer email</span><input class="input" type="email" id="sendTo" value="${esc(q.customer_email || '')}" placeholder="customer@email.com" /></label>
          <label class="field"><span class="label">Subject</span><input class="input" id="sendSubject" value="${esc(subject)}" /></label>
          <label class="field"><span class="label">Message</span><textarea class="textarea" id="sendBody" style="min-height:230px">${esc(message)}</textarea></label>
          <p class="hint">Opens your email app with this message ready. Download the PDF first and attach it before you send.</p>
          <div class="row"><button class="btn" data-act="print">${ICON.pdf} Download PDF</button><button class="btn btn-primary btn-lg" data-act="email" style="flex:1">${ICON.send} Open in email app</button></div>
        </div>
        <aside class="rail">
          <div class="card card-pad stack" style="gap:10px">
            <div class="h2" style="font-size:14px">Other options</div>
            <button class="option-card" data-act="copy"><span class="oi"><svg viewBox="0 0 20 20"><path d="M7 7h9v9H7z M4 13V4h9"/></svg></span><span><strong>Copy summary</strong><span>Paste into any message or CRM</span></span></button>
            <a class="option-card" id="smsLink" href="#"><span class="oi"><svg viewBox="0 0 20 20"><path d="M6 2.5h8v15H6z M9 15h2"/></svg></span><span><strong>Text the customer</strong><span>${q.customer_phone ? esc(q.customer_phone) : 'Opens your messaging app'}</span></span></a>
          </div>
          <div class="card card-pad"><div class="setting-row" style="padding:0"><span>Mark as sent when I open the email</span><label class="toggle"><input type="checkbox" id="markSent" checked aria-label="Mark as sent" /><span></span></label></div></div>
        </aside>
      </div>
      <div class="print-only">${QuoteDoc.html(q)}</div>
    </div>`;

    const smsBody = `Hi ${first}, here's your roofing quote from ${company.replace(/\.$/, '')}: ${money(b.final_quote)} total. I'll email the full details.`;
    root.querySelector('#smsLink').href = `sms:${encodeURIComponent(q.customer_phone || '')}?&body=${encodeURIComponent(smsBody)}`;

    root.addEventListener('click', async e => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'print') window.print();
      if (act === 'copy') {
        try { await navigator.clipboard.writeText(summaryText()); App.toast('Summary copied'); }
        catch { App.toast('Copying was blocked by the browser. Select the text and copy it instead.', 'error'); }
      }
      if (act === 'email') {
        const to = root.querySelector('#sendTo').value.trim();
        if (!to) { App.toast('Enter the customer email first.', 'error'); root.querySelector('#sendTo').focus(); return; }
        location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(root.querySelector('#sendSubject').value)}&body=${encodeURIComponent(root.querySelector('#sendBody').value)}`;
        const body = { customer_email: to };
        if (root.querySelector('#markSent').checked && q.status === 'draft') body.status = 'sent';
        try { q = await App.api(`/api/quotes/${id}`, { method: 'PATCH', body }); if (body.status) App.toast('Marked as sent'); } catch { /* email still opened */ }
      }
    });
  });
})();
