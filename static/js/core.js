// ── Core: routing, API, formatting, shared helpers ────────────
const App = (() => {
  const routes = [];
  let leaveGuard = null;      // () => true when the current page has unsaved changes
  let lastHash = location.hash;

  const $view = () => document.getElementById('view');

  function route(pattern, nav, render) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ re, keys, nav, render });
  }

  async function resolve() {
    const path = (location.hash || '#/').slice(1) || '/';
    if (leaveGuard && leaveGuard() && !confirm('You have unsaved changes. Leave this page without saving?')) {
      history.replaceState(null, '', lastHash || '#/');
      return;
    }
    leaveGuard = null;
    lastHash = location.hash;
    closeMenu();
    for (const r of routes) {
      const m = path.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === r.nav));
      // Fresh container per page, so event listeners never leak between pages
      const root = document.createElement('div');
      $view().replaceChildren(root);
      window.scrollTo(0, 0);
      try { await r.render(root, params); }
      catch (err) { console.error(err); root.innerHTML = errorState('This page could not load. Check that the app is still running in your terminal, then try again.'); }
      return;
    }
    location.hash = '#/';
  }

  async function api(path, opts = {}) {
    const init = { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } };
    if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      let msg = data.detail;
      if (Array.isArray(msg)) msg = msg.map(d => d.msg).join('; ');
      throw new Error(msg || `Request failed (${res.status})`);
    }
    return data;
  }

  // ── UI helpers ──
  let toastTimer;
  function toast(msg, kind = 'ok') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast show ${kind}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, d = 2) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money0 = n => money(n, 0);
  const num = (n, d = 0) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: d });
  const pct = (n, d = 1) => (Number(n || 0) * 100).toFixed(d).replace(/\.0$/, '') + '%';
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

  function parseDate(iso) {
    if (!iso) return null;
    return new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : iso + 'Z');
  }
  const date = iso => parseDate(iso)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) ?? '';
  function timeAgo(iso) {
    const d = parseDate(iso); if (!d) return '';
    const m = Math.floor((Date.now() - d) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    if (m < 1440) return `${Math.floor(m / 60)}h ago`;
    return date(iso);
  }

  const PROJECT_TYPES = {
    replacement: 'Full replacement',
    repair: 'Roof repair',
    new_construction: 'New construction',
    inspection: 'Inspection',
  };
  const STATUSES = { draft: 'Draft', sent: 'Sent', won: 'Won', lost: 'Lost' };
  const statusPill = s => `<span class="pill pill-${esc(s || 'draft')}">${STATUSES[s] || 'Draft'}</span>`;

  const quoteNumber = q => `RQ-${(parseDate(q.created_at) || new Date()).toISOString().slice(2, 10).replace(/-/g, '')}-${String(q.id).toUpperCase().slice(0, 4)}`;

  /** Line items at customer prices: overhead and markup spread proportionally,
   *  so the rows add up exactly to the quoted total. Sales tax stays separate. */
  function customerLines(b) {
    const tax = b.material_tax || 0;
    const base = (b.direct_cost || 0) - tax;
    const f = base > 0 ? ((b.final_quote || 0) - tax) / base : 1;
    const lines = (b.line_items || []).map(i => ({
      ...i, unit_price: i.unit_price * f, total: i.total * f,
    }));
    const subtotal = (b.final_quote || 0) - tax;
    return { lines, subtotal, tax, total: b.final_quote || 0 };
  }

  function errorState(msg) {
    return `<div class="page"><div class="empty"><h2>Something went wrong</h2><p>${esc(msg)}</p><a class="btn" href="#/">Go to dashboard</a></div></div>`;
  }

  // ── Mobile menu ──
  function openMenu() { document.getElementById('side').classList.add('open'); document.getElementById('sideScrim').classList.add('show'); }
  function closeMenu() { document.getElementById('side')?.classList.remove('open'); document.getElementById('sideScrim')?.classList.remove('show'); }

  async function refreshChrome() {
    try {
      const o = await api('/api/quote-options');
      const name = o.company?.name && o.company.name !== 'Your Roofing Co.' ? o.company.name : 'Quote Bot';
      document.getElementById('brandName').textContent = name;
      document.querySelector('.topbar-title').textContent = name;
      document.getElementById('sideFoot').innerHTML = o.is_default
        ? `<a class="side-setup" href="#/pricing"><strong>Finish setup</strong><span>Enter your prices so quotes match what you pay.</span></a>`
        : '';
    } catch { /* non-critical */ }
  }

  function start() {
    document.getElementById('menuBtn').addEventListener('click', openMenu);
    document.getElementById('sideScrim').addEventListener('click', closeMenu);
    window.addEventListener('hashchange', resolve);
    window.addEventListener('beforeunload', e => { if (leaveGuard && leaveGuard()) { e.preventDefault(); e.returnValue = ''; } });
    refreshChrome();
    resolve();
  }

  return {
    route, start, api, toast, esc, money, money0, num, pct, cap, date, timeAgo,
    PROJECT_TYPES, STATUSES, statusPill, quoteNumber, customerLines, errorState, refreshChrome,
    setLeaveGuard: fn => (leaveGuard = fn),
    go: hash => (location.hash = hash),
  };
})();
