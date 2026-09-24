// ── Dashboard ─────────────────────────────────────────────────
App.route('/', 'dashboard', async root => {
  const { esc, money0, date, statusPill, PROJECT_TYPES } = App;
  const [quotes, options, docs] = await Promise.all([
    App.api('/api/quotes'),
    App.api('/api/quote-options'),
    App.api('/api/documents').catch(() => ({ documents: [] })),
  ]);

  const now = new Date();
  const thisMonth = quotes.filter(q => {
    const d = new Date(q.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const sum = list => list.reduce((s, q) => s + (q.final_quote || 0), 0);
  const open = quotes.filter(q => q.status === 'draft' || q.status === 'sent');
  const won = quotes.filter(q => q.status === 'won');
  const decided = quotes.filter(q => q.status === 'won' || q.status === 'lost');

  const setup = [];
  if (options.is_default) setup.push({
    href: '#/pricing', title: 'Enter your prices',
    text: 'Quotes use sample prices until you add your suppliers and rates.',
    icon: '<path d="M10 2.5v15 M13.5 5.5H8.3a2.3 2.3 0 0 0 0 4.6h3.4a2.3 2.3 0 0 1 0 4.6H6"/>',
  });
  if (!docs.documents?.length) setup.push({
    href: '#/documents', title: 'Upload your warranty and policies',
    text: 'The AI uses them to write accurate notes on every quote.',
    icon: '<path d="M5 2.5h7l3.5 3.5v11.5H5z M12 2.5V6h3.5 M10 9v6 M7.5 11.5 10 9l2.5 2.5"/>',
  });

  root.innerHTML = `
  <div class="page">
    <section class="hero">
      <div class="hero-copy">
        <h1>Quote roofing jobs in <em>minutes</em>, not evenings.</h1>
        <p>Enter an address, pick the materials, and get a priced estimate with your rates and your warranty terms, ready to send.</p>
        <div><a class="btn btn-primary btn-lg" href="#/new">Create a new quote
          <svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4"/></svg></a></div>
      </div>
      <div class="hero-art-wrap">${Art.hero()}</div>
    </section>

    <div class="stats">
      <div class="card stat"><div class="stat-label">Quotes this month</div><div class="stat-value">${thisMonth.length}</div><div class="stat-note">${money0(sum(thisMonth))} quoted</div></div>
      <div class="card stat"><div class="stat-label">Open pipeline</div><div class="stat-value">${money0(sum(open))}</div><div class="stat-note">${open.length} draft or sent</div></div>
      <div class="card stat"><div class="stat-label">Won</div><div class="stat-value">${money0(sum(won))}</div><div class="stat-note">${won.length} job${won.length !== 1 ? 's' : ''}</div></div>
      <div class="card stat"><div class="stat-label">Win rate</div><div class="stat-value">${decided.length ? Math.round(won.length / decided.length * 100) + '%' : '—'}</div><div class="stat-note">${decided.length ? `of ${decided.length} decided` : 'Mark quotes won or lost to track this'}</div></div>
    </div>

    ${setup.length ? `<div class="setup-list">${setup.map(s => `
      <a class="card setup-item" href="${s.href}">
        <span class="setup-icon"><svg viewBox="0 0 20 20">${s.icon}</svg></span>
        <span><strong>${s.title}</strong><span>${s.text}</span></span>
      </a>`).join('')}</div>` : ''}

    <section class="card">
      <div class="card-head"><h2>Recent quotes</h2>${quotes.length ? '<a class="btn btn-ghost btn-sm" href="#/quotes">View all</a>' : ''}</div>
      ${quotes.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Customer</th><th>Project address</th><th>Type</th><th class="num">Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${quotes.slice(0, 6).map(q => `
          <tr class="clickable" data-open="${esc(q.id)}">
            <td class="strong">${esc(q.customer_name || 'Unnamed customer')}</td>
            <td>${esc(q.property_address || '—')}</td>
            <td>${PROJECT_TYPES[q.project_type] || 'Full replacement'}</td>
            <td class="num strong">${money0(q.final_quote)}</td>
            <td>${statusPill(q.status)}</td>
            <td class="muted">${date(q.created_at)}</td>
          </tr>`).join('')}</tbody>
      </table></div>` : `
      <div class="empty"><h2>No quotes yet</h2><p>Your first quote takes about two minutes. Enter an address and the roof gets measured for you.</p>
        <a class="btn btn-primary" href="#/new">Create a quote</a></div>`}
    </section>
  </div>`;

  root.querySelectorAll('[data-open]').forEach(tr => tr.addEventListener('click', () => App.go(`#/quote/${tr.dataset.open}`)));
});
