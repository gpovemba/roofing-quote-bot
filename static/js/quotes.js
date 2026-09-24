// ── All quotes ────────────────────────────────────────────────
App.route('/quotes', 'quotes', async root => {
  const { esc, money0, date, statusPill, STATUSES, PROJECT_TYPES } = App;
  const quotes = await App.api('/api/quotes');
  let filter = 'all', search = '';

  root.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Quotes</h1><p>Every quote you've built. Click one to view, edit, or send it.</p></div>
      <div class="actions"><a class="btn btn-primary" href="#/new">New quote</a></div></div>
    <div class="card">
      <div class="filters">
        <input class="input" type="search" id="qSearch" placeholder="Search by customer or address" aria-label="Search quotes" />
        <div class="seg" role="tablist">${[['all', 'All'], ...Object.entries(STATUSES)].map(([k, v]) =>
          `<button role="tab" data-f="${k}" class="${k === 'all' ? 'on' : ''}">${v}</button>`).join('')}</div>
      </div>
      <div id="qTable"></div>
    </div></div>`;

  const draw = () => {
    const s = search.toLowerCase();
    const rows = quotes.filter(q => (filter === 'all' || (q.status || 'draft') === filter) &&
      (!s || `${q.customer_name} ${q.property_address}`.toLowerCase().includes(s)));
    root.querySelector('#qTable').innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Customer</th><th>Project address</th><th>Type</th><th>Roof</th><th class="num">Amount</th><th>Status</th><th>Date</th></tr></thead>
      <tbody>${rows.map(q => `<tr class="clickable" data-open="${esc(q.id)}" tabindex="0">
        <td class="strong">${esc(q.customer_name || 'Unnamed customer')}${q.customer_email ? `<span class="cell-sub">${esc(q.customer_email)}</span>` : ''}</td>
        <td>${esc(q.property_address || '—')}</td>
        <td>${PROJECT_TYPES[q.project_type] || 'Full replacement'}</td>
        <td class="muted">${App.cap(q.roof_type || '')}${q.roof_area_sqft ? ` · ${App.num(q.roof_area_sqft)} sq ft` : ''}</td>
        <td class="num strong">${money0(q.final_quote)}</td>
        <td>${statusPill(q.status)}</td>
        <td class="muted">${date(q.created_at)}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">${quotes.length
        ? '<h2>No matching quotes</h2><p>Try a different search or status.</p>'
        : '<h2>No quotes yet</h2><p>Build your first quote in about two minutes.</p><a class="btn btn-primary" href="#/new">Create a quote</a>'}</div>`;
  };
  draw();

  root.querySelector('#qSearch').addEventListener('input', e => { search = e.target.value; draw(); });
  root.addEventListener('click', e => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; root.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b === f)); draw(); return; }
    const row = e.target.closest('[data-open]');
    if (row) App.go(`#/quote/${row.dataset.open}`);
  });
  root.addEventListener('keydown', e => { const row = e.target.closest('[data-open]'); if (row && e.key === 'Enter') App.go(`#/quote/${row.dataset.open}`); });
});
