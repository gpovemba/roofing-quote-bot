// ── DOM refs ─────────────────────────────────────────────────
const messagesEl       = document.getElementById('messages');
const inputEl          = document.getElementById('userInput');
const sendBtn          = document.getElementById('sendBtn');
const newChatBtn       = document.getElementById('newChatBtn');
const newChatMobileBtn = document.getElementById('newChatMobileBtn');
const quoteListEl      = document.getElementById('quoteList');
const inProgressLabel  = document.getElementById('inProgressLabel');
const inProgressList   = document.getElementById('inProgressList');
const chatView         = document.getElementById('chatView');
const quoteDetailView  = document.getElementById('quoteDetailView');
const detailTitle      = document.getElementById('detailTitle');
const detailMeta       = document.getElementById('detailMeta');
const detailBody       = document.getElementById('detailBody');
const backToChatBtn    = document.getElementById('backToChatBtn');
const deleteDetailBtn  = document.getElementById('deleteDetailBtn');
const deleteModal      = document.getElementById('deleteModal');
const modalCancelBtn   = document.getElementById('modalCancelBtn');
const modalConfirmBtn  = document.getElementById('modalConfirmBtn');
const folderBtn        = document.getElementById('folderBtn');
const quotesFolderView = document.getElementById('quotesFolderView');
const backFromFolderBtn= document.getElementById('backFromFolderBtn');
const folderGrid       = document.getElementById('folderGrid');
const folderCount      = document.getElementById('folderCount');
const folderSearch     = document.getElementById('folderSearch');
const toastEl          = document.getElementById('toast');
const welcomeState     = document.getElementById('welcomeState');
const statCount        = document.getElementById('statCount');
const statValue        = document.getElementById('statValue');
const sidebar          = document.getElementById('sidebar');
const mobileOverlay    = document.getElementById('mobileOverlay');
const hamburgerBtn     = document.getElementById('hamburgerBtn');
const sidebarCloseBtn  = document.getElementById('sidebarCloseBtn');

// ── State ─────────────────────────────────────────────────────
let history            = [];
let pendingMeasurement = null;
let activeDetailQuoteId= null;
let pendingDeleteId    = null;
let afterDeleteCb      = null;
let allFolderQuotes    = [];
let toastTimer         = null;

// ── Session persistence ───────────────────────────────────────
const LS_INDEX   = 'rqb_index';
const LS_CURRENT = 'rqb_current';
const LS_PREFIX  = 'rqb_sess_';
const MAX_SESS   = 25;

let currentSessionId = null;
let sessionStartedAt = null;

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function sessionLabel() {
  const first = history.find(m => m.role === 'user');
  if (!first) return 'New conversation';
  const t = first.content.trim();
  return t.length > 52 ? t.slice(0, 49) + '…' : t;
}

function getIndex() {
  try { return JSON.parse(localStorage.getItem(LS_INDEX) || '[]'); } catch { return []; }
}
function setIndex(arr) {
  localStorage.setItem(LS_INDEX, JSON.stringify(arr));
}

function saveSession() {
  if (!currentSessionId || history.length === 0) return;
  const sess = {
    id: currentSessionId,
    label: sessionLabel(),
    history,
    pendingMeasurement,
    completedQuoteId: null,
    startedAt: sessionStartedAt,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(LS_PREFIX + currentSessionId, JSON.stringify(sess));
  const index = getIndex();
  const i = index.findIndex(e => e.id === currentSessionId);
  const entry = { id: currentSessionId, label: sess.label, updatedAt: sess.updatedAt, completedQuoteId: null };
  if (i >= 0) Object.assign(index[i], entry);
  else index.unshift(entry);
  setIndex(index.slice(0, MAX_SESS));
  localStorage.setItem(LS_CURRENT, currentSessionId);
}

function markSessionComplete(quoteId) {
  if (!currentSessionId) return;
  const raw = localStorage.getItem(LS_PREFIX + currentSessionId);
  if (raw) {
    try {
      const sess = JSON.parse(raw);
      sess.completedQuoteId = quoteId;
      localStorage.setItem(LS_PREFIX + currentSessionId, JSON.stringify(sess));
    } catch { /* corrupt */ }
  }
  const index = getIndex();
  const entry = index.find(e => e.id === currentSessionId);
  if (entry) { entry.completedQuoteId = quoteId; setIndex(index); }
}

function startNewSessionId() {
  currentSessionId = genId();
  sessionStartedAt = new Date().toISOString();
  localStorage.setItem(LS_CURRENT, currentSessionId);
}

function tryRestoreLastSession() {
  const lastId = localStorage.getItem(LS_CURRENT);
  if (!lastId) return false;
  const raw = localStorage.getItem(LS_PREFIX + lastId);
  if (!raw) return false;
  try {
    const sess = JSON.parse(raw);
    if (sess.completedQuoteId || !sess.history || sess.history.length === 0) return false;
    applyRestoredSession(sess);
    return true;
  } catch { return false; }
}

function applyRestoredSession(sess) {
  currentSessionId   = sess.id;
  sessionStartedAt   = sess.startedAt;
  history            = sess.history || [];
  pendingMeasurement = sess.pendingMeasurement || null;
  localStorage.setItem(LS_CURRENT, currentSessionId);

  messagesEl.innerHTML = '';
  messagesEl.appendChild(welcomeState);
  hideWelcome();

  history.forEach(msg => addMessageStatic(msg.role, msg.content));

  const note = document.createElement('div');
  note.className = 'session-restore-note';
  note.textContent = '↑ Previous conversation restored — continue below';
  messagesEl.appendChild(note);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function loadInProgressSessions() {
  if (!inProgressLabel || !inProgressList) return;
  const index = getIndex();
  const incomplete = index.filter(e => !e.completedQuoteId && e.id !== currentSessionId);

  inProgressLabel.style.display = incomplete.length > 0 ? 'block' : 'none';
  inProgressList.innerHTML = '';

  incomplete.slice(0, 6).forEach(entry => {
    const li = document.createElement('li');
    li.className = 'quote-item';
    li.innerHTML = `
      <div class="quote-item-name" style="color:var(--text2);padding-right:8px;font-weight:500">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--muted)" style="vertical-align:middle;margin-right:4px;flex-shrink:0">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
        </svg>${entry.label || 'Untitled conversation'}
      </div>
      <div class="quote-item-meta">${entry.updatedAt ? timeAgo(entry.updatedAt) : ''}</div>
    `;
    li.addEventListener('click', () => {
      const raw = localStorage.getItem(LS_PREFIX + entry.id);
      if (!raw) return;
      try {
        applyRestoredSession(JSON.parse(raw));
        showChat();
        showToast('Conversation restored', '↩️');
        loadInProgressSessions();
      } catch { /* corrupt */ }
    });
    inProgressList.appendChild(li);
  });
}

// ── Format helpers ────────────────────────────────────────────
const fmt     = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtFull = n => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum  = (n, d=1) => n == null ? '-' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct     = n => (n * 100).toFixed(1) + '%';
const cap     = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

function timeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr + (isoStr.endsWith('Z') ? '' : 'Z')).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, icon = '✓') {
  toastEl.innerHTML = `<span>${icon}</span> ${msg}`;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800);
}

// ── Sidebar stats ─────────────────────────────────────────────
async function updateSidebarStats() {
  try {
    const res = await fetch('/api/quotes');
    const quotes = await res.json();
    statCount.textContent = quotes.length;
    const total = quotes.reduce((sum, q) => sum + (q.final_quote || 0), 0);
    statValue.textContent = fmt(total);
  } catch { /* non-critical */ }
}

// ── Welcome state ─────────────────────────────────────────────
function showWelcome() { if (welcomeState) welcomeState.style.display = 'flex'; }
function hideWelcome() { if (welcomeState) welcomeState.style.display = 'none'; }

// ── Animated counter ──────────────────────────────────────────
function animateCounter(el, target, duration = 900) {
  const start = performance.now();
  const final = fmtFull(target);
  const tick = now => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = '$' + (eased * target).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  requestAnimationFrame(tick);
}

// ── Margin bar ────────────────────────────────────────────────
function renderMarginBar(marginPct) {
  const display = (marginPct * 100).toFixed(1) + '%';
  const fillW   = Math.min(marginPct * 250, 100);
  const color   = marginPct < 0.15 ? '#ff5555' : marginPct < 0.25 ? '#f5a623' : '#3ecf8e';
  const div = document.createElement('div');
  div.className = 'margin-bar-wrap';
  div.innerHTML = `
    <div class="margin-bar-track"><div class="margin-bar-fill" style="width:0%;background:${color};"></div></div>
    <span class="margin-bar-label" style="color:${color}">${display} margin</span>
  `;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fill = div.querySelector('.margin-bar-fill');
    if (fill) fill.style.width = fillW + '%';
  }));
  return div;
}

// ── Print quote ───────────────────────────────────────────────
function printQuote(q, address, customer) {
  const name = customer || address || 'Customer';
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>
  <title>Quote — ${name}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Helvetica Neue',Arial,sans-serif;color:#111;background:#fff;padding:40px;font-size:14px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #e8621a;padding-bottom:20px;margin-bottom:28px}
    .brand{font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#e8621a}
    .brand small{display:block;font-size:11px;font-weight:500;color:#666;letter-spacing:0;margin-top:2px}
    .total-block{text-align:right}
    .total-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#999}
    .total-val{font-size:36px;font-weight:800;color:#e8621a;letter-spacing:-0.02em}
    .section{margin-bottom:24px}
    .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#999;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:6px}
    .row{display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid #f5f5f5}
    .row .label{color:#555} .row .val{font-weight:600;color:#111}
    .row-total{display:flex;justify-content:space-between;font-size:14px;font-weight:700;padding:8px 0;margin-top:4px;border-top:2px solid #eee}
    .footer{margin-top:40px;font-size:11px;color:#bbb;text-align:center;border-top:1px solid #eee;padding-top:16px}
    @media print{body{padding:20px}}
  </style></head><body>
  <div class="header">
    <div class="brand">Roofing Quote Bot<small>Professional Estimate</small></div>
    <div class="total-block"><div class="total-label">Total Estimate</div><div class="total-val">${fmtFull(q.final_quote)}</div></div>
  </div>
  <div class="section"><div class="section-title">Job Details</div>
    ${customer ? `<div class="row"><span class="label">Customer</span><span class="val">${customer}</span></div>` : ''}
    ${address  ? `<div class="row"><span class="label">Property</span><span class="val">${address}</span></div>` : ''}
    <div class="row"><span class="label">Roof Type</span><span class="val">${cap(q.roof_type)}</span></div>
    <div class="row"><span class="label">Material Grade</span><span class="val">${cap(q.material_grade)}</span></div>
    <div class="row"><span class="label">Roof Area</span><span class="val">${fmtNum(q.roof_area_sqft,0)} sqft (${fmtNum(q.roof_area_squares,2)} sq)</span></div>
  </div>
  <div class="section"><div class="section-title">Cost Breakdown</div>
    <div class="row"><span class="label">Materials (${cap(q.roof_type)} / ${cap(q.material_grade)} @ ${fmt(q.material_rate_per_square)}/sq)</span><span class="val">${fmtFull(q.material_cost)}</span></div>
    <div class="row"><span class="label">Labor (${fmt(q.labor_rate_per_square)}/sq)</span><span class="val">${fmtFull(q.labor_cost)}</span></div>
    <div class="row"><span class="label">Tear-off (${q.layers_to_remove} layer${q.layers_to_remove!==1?'s':''})</span><span class="val">${fmtFull(q.tearoff_cost)}</span></div>
    ${q.disposal_cost > 0 ? `<div class="row"><span class="label">Disposal</span><span class="val">${fmtFull(q.disposal_cost)}</span></div>` : ''}
    ${q.transport_cost > 0 ? `<div class="row"><span class="label">Transport</span><span class="val">${fmtFull(q.transport_cost)}</span></div>` : ''}
    ${q.misc_cost > 0 ? `<div class="row"><span class="label">Permit / Misc</span><span class="val">${fmtFull(q.misc_cost)}</span></div>` : ''}
    <div class="row-total"><span>Overhead (${Math.round(q.overhead_pct*100)}%)</span><span>${fmtFull(q.overhead_cost)}</span></div>
    <div class="row-total" style="font-size:16px"><span>Total Estimate</span><span style="color:#e8621a">${fmtFull(q.final_quote)}</span></div>
  </div>
  <div class="footer">This estimate is valid for 30 days. Generated by Roofing Quote Bot.</div>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

// ── Measurement card ──────────────────────────────────────────
function renderMeasurementCard(m) {
  const card = document.createElement('div');
  card.className = 'measurement-card';
  card.dataset.measurementId = m.id;

  const statusClass = m.status === 'complete' ? 'status-complete'
                    : m.status === 'failed'   ? 'status-failed' : 'status-pending';

  const rows = [
    ['Total Roof Area', `${fmtNum(m.total_roof_area_sqft, 0)} sqft (${fmtNum(m.roof_squares, 1)} sq)`, true],
    ['Pitch', `${m.predominant_pitch} (${m.pitch_normalized})`],
    m.facets_count          != null ? ['Facets', m.facets_count] : null,
    m.roof_material         ? ['Material', cap(m.roof_material)] : null,
    m.roof_condition_rating ? ['Condition', cap(m.roof_condition_rating)] : null,
    m.roof_age_years        != null ? ['Est. Age', `${m.roof_age_years} yrs`] : null,
    m.ridge_length_ft       != null ? ['Ridge', `${fmtNum(m.ridge_length_ft)} ft`] : null,
    m.valley_length_ft      != null ? ['Valley', `${fmtNum(m.valley_length_ft)} ft`] : null,
    m.eave_length_ft        != null ? ['Eave', `${fmtNum(m.eave_length_ft)} ft`] : null,
    m.rake_length_ft        != null ? ['Rake', `${fmtNum(m.rake_length_ft)} ft`] : null,
    ['Waste Factor', pct(m.waste_factor)],
  ].filter(Boolean);

  const rowsHtml = rows.map(([label, val, full]) =>
    `<div class="m-row${full ? ' m-row--full' : ''}"><span>${label}</span><span>${val}</span></div>`
  ).join('');

  const pdfLink   = m.report_pdf_url ? `<a class="btn-pdf" href="${m.report_pdf_url}" target="_blank">View Report PDF</a>` : '';
  const firstToken= (m.image_tokens || [])[0];
  const imgHtml   = firstToken ? `<img class="m-thumb" src="/api/images/${firstToken}" alt="Property ortho" />` : '';
  const provLabel = m.provider === 'eagleview_mock' ? 'EagleView (sandbox)' : 'EagleView';

  card.innerHTML = `
    <div class="m-header">
      <div class="m-header-left">
        <span class="m-provider">${provLabel}</span>
        <span class="m-address">${m.address}</span>
      </div>
      <span class="m-status ${statusClass}">${m.status}</span>
    </div>
    <div class="m-body">${rowsHtml}</div>
    ${(imgHtml || pdfLink) ? `<div class="m-footer">${imgHtml}${pdfLink}</div>` : ''}
  `;
  return card;
}

// ── Quote card ────────────────────────────────────────────────
function renderQuoteCard(q, quoteId, { animate = false, address = '', customer = '' } = {}) {
  const card = document.createElement('div');
  card.className = 'quote-card';
  if (quoteId) card.dataset.quoteId = quoteId;

  const wastePct   = q.waste_factor != null ? `+${Math.round(q.waste_factor*100)}% waste` : '';
  const areaDetail = q.roof_area_sqft ? `${fmtNum(q.roof_area_sqft,0)} sqft (${fmtNum(q.roof_area_squares,2)} sq) ${wastePct} → ${fmtNum(q.adjusted_squares,2)} sq billed` : '';
  const matDetail  = q.material_rate_per_square ? `${cap(q.roof_type)} / ${cap(q.material_grade)} @ ${fmt(q.material_rate_per_square)}/sq × ${fmtNum(q.adjusted_squares,2)} sq` : '';
  const pitchMult  = q.pitch_multiplier && q.pitch_multiplier !== 1 ? ` × ${q.pitch_multiplier} ${cap(q.pitch)} pitch` : '';
  const laborDetail= q.labor_rate_per_square ? `${fmt(q.labor_rate_per_square)}/sq × ${fmtNum(q.roof_area_squares,2)} sq${pitchMult}` : '';
  const tearDetail = q.tearoff_rate_per_square ? `${fmt(q.tearoff_rate_per_square)}/sq × ${fmtNum(q.roof_area_squares,2)} sq × ${q.layers_to_remove} layer${q.layers_to_remove!==1?'s':''}` : '';

  card.innerHTML = `
    <div class="quote-card-header">
      <div class="quote-header-left">
        <span class="quote-label">Estimate</span>
        <span class="quote-total">${animate ? '$0.00' : fmtFull(q.final_quote)}</span>
      </div>
      <div class="quote-header-right">
        <span class="saved-badge">Saved</span>
        <button class="btn-print" title="Send to Customer">
          <svg viewBox="0 0 24 24"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
          Send to Customer
        </button>
        <button class="btn-expand" aria-expanded="false" title="Show breakdown">
          <svg class="expand-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="quote-card-body" hidden>
      ${areaDetail ? `<div class="quote-section-label">Roof Area</div><div class="quote-row detail"><span>${areaDetail}</span></div>` : ''}
      <div class="quote-section-label">Costs</div>
      <div class="quote-row"><span>Materials${matDetail?`<div class="quote-detail">${matDetail}</div>`:''}</span><span>${fmtFull(q.material_cost)}</span></div>
      <div class="quote-row"><span>Labor${laborDetail?`<div class="quote-detail">${laborDetail}</div>`:''}</span><span>${fmtFull(q.labor_cost)}</span></div>
      <div class="quote-row"><span>Tear-off${tearDetail?`<div class="quote-detail">${tearDetail}</div>`:''}</span><span>${fmtFull(q.tearoff_cost)}</span></div>
      ${q.disposal_cost>0?`<div class="quote-row"><span>Disposal</span><span>${fmtFull(q.disposal_cost)}</span></div>`:''}
      ${q.transport_cost>0?`<div class="quote-row"><span>Transport</span><span>${fmtFull(q.transport_cost)}</span></div>`:''}
      ${q.misc_cost>0?`<div class="quote-row"><span>Misc / Permit</span><span>${fmtFull(q.misc_cost)}</span></div>`:''}
      <div class="quote-section-label">Totals</div>
      <div class="quote-row subtotal"><span>Direct Cost</span><span>${fmtFull(q.direct_cost)}</span></div>
      <div class="quote-row"><span>Overhead${q.overhead_pct!=null?`<div class="quote-detail">${Math.round(q.overhead_pct*100)}% of direct cost</div>`:''}</span><span>${fmtFull(q.overhead_cost)}</span></div>
      <div class="quote-row subtotal"><span>Total Cost</span><span>${fmtFull(q.total_cost)}</span></div>
      <div class="quote-row profit"><span>Profit${q.markup_pct!=null?`<div class="quote-detail">${Math.round(q.markup_pct*100)}% markup · ${pct(q.profit_margin)} margin</div>`:''}</span><span>${fmtFull(q.profit)}</span></div>
    </div>
  `;

  if (q.profit_margin != null) {
    card.querySelector('.quote-card-body').appendChild(renderMarginBar(q.profit_margin));
  }

  if (animate) {
    const totalEl = card.querySelector('.quote-total');
    requestAnimationFrame(() => animateCounter(totalEl, q.final_quote));
  }

  card.querySelector('.btn-print').addEventListener('click', e => {
    e.stopPropagation();
    printQuote(q, address, customer);
  });

  const expandBtn = card.querySelector('.btn-expand');
  const bodyEl    = card.querySelector('.quote-card-body');
  expandBtn.addEventListener('click', () => {
    const open = bodyEl.hidden;
    bodyEl.hidden = !open;
    expandBtn.setAttribute('aria-expanded', open);
    expandBtn.classList.toggle('expanded', open);
  });

  return card;
}

// ── Follow-up chips ───────────────────────────────────────────
function renderFollowUpChips() {
  const suggestions = [
    'Adjust markup to 25%',
    'Switch to premium grade',
    'Add $500 permit cost',
    "What if it's steep pitch?",
    'Start a new quote',
  ];
  const wrap = document.createElement('div');
  wrap.className = 'followup-wrap';
  wrap.innerHTML = `<div class="followup-label">What's next?</div><div class="followup-chips"></div>`;
  const chipsEl = wrap.querySelector('.followup-chips');
  suggestions.forEach(text => {
    const btn = document.createElement('button');
    btn.className = 'followup-chip';
    btn.textContent = text;
    btn.addEventListener('click', () => {
      if (text === 'Start a new quote') { newChat(); return; }
      inputEl.value = text;
      inputEl.focus();
      wrap.remove();
    });
    chipsEl.appendChild(btn);
  });
  return wrap;
}

// ── Message rendering ─────────────────────────────────────────
function addMessageStatic(role, text) {
  const wrap   = document.createElement('div');
  wrap.className = `msg ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🏠';
  const content= document.createElement('div');
  content.className = 'msg-content';
  const label  = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = role === 'user' ? 'You' : 'Quote Bot';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  content.appendChild(label);
  content.appendChild(bubble);
  wrap.appendChild(avatar);
  wrap.appendChild(content);
  messagesEl.appendChild(wrap);
}

function addMessage(role, text, quoteData, quoteId, measurement) {
  hideWelcome();
  const wrap   = document.createElement('div');
  wrap.className = `msg ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'user' ? '👤' : '🏠';
  const content= document.createElement('div');
  content.className = 'msg-content';
  const label  = document.createElement('div');
  label.className = 'msg-label';
  label.textContent = role === 'user' ? 'You' : 'Quote Bot';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  content.appendChild(label);
  content.appendChild(bubble);

  if (measurement && measurement.status !== 'failed') content.appendChild(renderMeasurementCard(measurement));
  if (quoteData) {
    content.appendChild(renderQuoteCard(quoteData, quoteId, { animate: true }));
    content.appendChild(renderFollowUpChips());
    showToast('Quote saved ✓');
  }

  wrap.appendChild(avatar);
  wrap.appendChild(content);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

function addTyping() {
  const wrap = document.createElement('div');
  wrap.className = 'msg assistant typing';
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = '🏠';
  const content = document.createElement('div');
  content.className = 'msg-content';
  content.innerHTML = `
    <div class="msg-label">Quote Bot</div>
    <div class="bubble"><span>Thinking</span><div class="typing-dots"><span></span><span></span><span></span></div></div>
  `;
  wrap.appendChild(avatar);
  wrap.appendChild(content);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return wrap;
}

// ── Send ──────────────────────────────────────────────────────
async function send() {
  const text = inputEl.value.trim();
  if (!text) return;

  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendBtn.disabled = true;

  history.push({ role: 'user', content: text });
  addMessage('user', text);
  const typing = addTyping();

  let messagesForRequest = history;
  if (pendingMeasurement) {
    messagesForRequest = history.slice(0, -1).concat([{
      role: 'user',
      content: `[Pending EagleView measurement_id: ${pendingMeasurement.id} for "${pendingMeasurement.address}" — call get_measurement_status with this id instead of requesting again]\n${text}`,
    }]);
  }

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagesForRequest }),
    });
    typing.remove();

    if (!res.ok) {
      addMessage('assistant', 'Sorry, something went wrong. Please try again.');
      history.pop();
      return;
    }

    const data = await res.json();
    history.push({ role: 'assistant', content: data.message });
    addMessage('assistant', data.message, data.quote || null, data.quote_id || null, data.measurement || null);

    // Always save the conversation after each exchange
    saveSession();

    if (data.measurement) {
      pendingMeasurement = data.measurement.status === 'pending'
        ? { id: data.measurement.id, address: data.measurement.address }
        : null;
    }
    if (data.quote_id) {
      markSessionComplete(data.quote_id);
      pendingMeasurement = null;
      loadSidebarQuotes();
      updateSidebarStats();
      loadInProgressSessions();
    }
  } catch {
    typing.remove();
    addMessage('assistant', 'Network error. Please check your connection.');
    history.pop();
  } finally {
    sendBtn.disabled = false;
    inputEl.focus();
  }
}

// ── Sidebar quotes ────────────────────────────────────────────
async function loadSidebarQuotes() {
  try {
    const res = await fetch('/api/quotes');
    const quotes = await res.json();
    quoteListEl.innerHTML = '';

    if (quotes.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'quote-item-empty';
      empty.textContent = 'No saved quotes yet';
      quoteListEl.appendChild(empty);
      return;
    }

    quotes.forEach(q => {
      const li = document.createElement('li');
      li.className = 'quote-item';
      li.dataset.id = q.id;
      const name = q.customer_name || q.property_address || 'Unnamed job';
      const roofLabel = q.roof_type ? cap(q.roof_type) : '';
      const sqft = q.roof_area_sqft ? `${Math.round(q.roof_area_sqft).toLocaleString()} sqft` : '';
      const when = q.created_at ? timeAgo(q.created_at) : '';
      li.innerHTML = `
        <div class="quote-item-name">
          ${q.measurement_id ? '<span class="ev-dot" title="EagleView">&#9679;</span> ' : ''}${name}
        </div>
        <div class="quote-item-meta">${roofLabel}${sqft ? ' · ' + sqft : ''}</div>
        <div class="quote-item-footer">
          <span class="quote-item-total">${fmt(q.final_quote)}</span>
          <span class="quote-item-time">${when}</span>
        </div>
        <button class="btn-delete-quote" title="Delete" data-id="${q.id}">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.7 7h5.6l.7-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      `;
      li.addEventListener('click', e => { if (!e.target.closest('.btn-delete-quote')) openQuoteDetail(q.id); });
      li.querySelector('.btn-delete-quote').addEventListener('click', e => { e.stopPropagation(); confirmDelete(q.id); });
      quoteListEl.appendChild(li);
    });
  } catch { /* non-critical */ }
}

// ── Folder view ───────────────────────────────────────────────
function renderFolderCard(q) {
  const card = document.createElement('div');
  card.className = 'folder-card';
  const name  = q.customer_name || q.property_address || 'Unnamed job';
  const type  = q.roof_type ? cap(q.roof_type) : '—';
  const when  = q.created_at ? timeAgo(q.created_at) : '';
  const margin = q.profit_margin != null ? q.profit_margin : null;
  const mc    = margin==null?'#52526a':margin<0.15?'#ff5555':margin<0.25?'#f5a623':'#3ecf8e';
  const mw    = margin!=null?Math.min(margin*250,100):0;

  card.innerHTML = `
    <div class="folder-card-top">
      <div class="folder-card-name">${q.measurement_id?'<span class="ev-dot">&#9679;</span> ':''}${name}</div>
      <span class="folder-card-badge">${type}</span>
    </div>
    <div class="folder-card-meta">${q.property_address && q.customer_name ? q.property_address : ''}</div>
    <div class="folder-card-total">${fmtFull(q.final_quote)}</div>
    ${margin!=null?`<div class="margin-bar-wrap" style="margin-top:0">
      <div class="margin-bar-track"><div class="margin-bar-fill" data-w="${mw}" style="width:0%;background:${mc};"></div></div>
      <span class="margin-bar-label" style="color:${mc}">${(margin*100).toFixed(1)}% margin</span>
    </div>`:''}
    <div class="folder-card-footer">
      <span class="folder-card-time">${when}</span>
      <div class="folder-card-actions">
        <button class="btn-fc-print">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/></svg>
          Print
        </button>
        <button class="btn-fc-delete">
          <svg width="11" height="11" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4M3 3.5l.7 7h5.6l.7-7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
  `;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fill = card.querySelector('.margin-bar-fill[data-w]');
    if (fill) fill.style.width = fill.dataset.w + '%';
  }));

  card.addEventListener('click', e => {
    if (e.target.closest('.btn-fc-print') || e.target.closest('.btn-fc-delete')) return;
    openQuoteDetail(q.id);
  });

  card.querySelector('.btn-fc-print').addEventListener('click', async e => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/quotes/${q.id}`);
      const full = await res.json();
      printQuote(JSON.parse(full.breakdown_json || '{}'), full.property_address, full.customer_name);
    } catch { showToast('Could not load quote', '⚠️'); }
  });

  card.querySelector('.btn-fc-delete').addEventListener('click', e => {
    e.stopPropagation();
    confirmDelete(q.id, () => {
      card.style.transition = 'opacity 0.2s,transform 0.2s';
      card.style.opacity = '0'; card.style.transform = 'scale(0.96)';
      setTimeout(() => { card.remove(); updateFolderCount(); }, 200);
    });
  });

  return card;
}

function updateFolderCount() {
  folderCount.textContent = `(${folderGrid.querySelectorAll('.folder-card').length})`;
}

async function loadFolderQuotes(filter = '') {
  folderGrid.innerHTML = '';
  try {
    const res = await fetch('/api/quotes');
    allFolderQuotes = await res.json();
  } catch {
    folderGrid.innerHTML = '<div class="folder-empty"><div class="folder-empty-icon">📂</div><p>Could not load quotes.</p></div>';
    return;
  }
  const filtered = filter
    ? allFolderQuotes.filter(q => `${q.customer_name||''} ${q.property_address||''} ${q.roof_type||''}`.toLowerCase().includes(filter.toLowerCase()))
    : allFolderQuotes;

  folderCount.textContent = `(${filtered.length})`;

  if (filtered.length === 0) {
    folderGrid.innerHTML = `<div class="folder-empty"><div class="folder-empty-icon">📂</div>
      <p>${filter ? 'No quotes match your search.' : 'No quotes yet. Start a new quote to see it here.'}</p></div>`;
    return;
  }
  filtered.forEach(q => folderGrid.appendChild(renderFolderCard(q)));
}

function showQuotesFolder() {
  chatView.style.display = 'none';
  quoteDetailView.style.display = 'none';
  quotesFolderView.style.display = 'flex';
  folderSearch.value = '';
  loadFolderQuotes();
  document.querySelectorAll('.quote-item').forEach(el => el.classList.remove('active'));
}

// ── View switching ─────────────────────────────────────────────
function showChat() {
  chatView.style.display = 'flex';
  quoteDetailView.style.display = 'none';
  quotesFolderView.style.display = 'none';
  document.querySelectorAll('.quote-item').forEach(el => el.classList.remove('active'));
  inputEl.focus();
}

async function openQuoteDetail(quoteId) {
  try {
    const res = await fetch(`/api/quotes/${quoteId}`);
    if (!res.ok) return;
    const q = await res.json();
    const breakdown = JSON.parse(q.breakdown_json || '{}');
    detailTitle.textContent = q.customer_name || q.property_address || 'Unnamed job';
    detailMeta.textContent  = [q.roof_type ? cap(q.roof_type) : '', q.property_address, q.created_at ? timeAgo(q.created_at) : ''].filter(Boolean).join(' · ');
    detailBody.innerHTML = '';
    const qCard = renderQuoteCard(breakdown, quoteId, { address: q.property_address||'', customer: q.customer_name||'' });
    const qBody = qCard.querySelector('.quote-card-body');
    const qBtn  = qCard.querySelector('.btn-expand');
    if (qBody && qBtn) { qBody.hidden = false; qBtn.classList.add('expanded'); qBtn.setAttribute('aria-expanded','true'); }
    detailBody.appendChild(qCard);

    if (q.measurement_id) {
      try {
        const mres = await fetch(`/api/measurements/${q.measurement_id}`);
        if (mres.ok) {
          const m = await mres.json();
          if (m.status === 'complete') detailBody.insertBefore(renderMeasurementCard(m), detailBody.firstChild);
        }
      } catch { /* non-critical */ }
    }

    activeDetailQuoteId = quoteId;
    chatView.style.display = 'none';
    quoteDetailView.style.display = 'flex';
    quotesFolderView.style.display = 'none';
    document.querySelectorAll('.quote-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.quote-item[data-id="${quoteId}"]`)?.classList.add('active');
  } catch { /* ignore */ }
}

// ── New chat ───────────────────────────────────────────────────
function newChat(saveFirst = true) {
  if (saveFirst && history.length > 0) {
    saveSession();
    showToast('Conversation saved', '💾');
  }

  history = [];
  pendingMeasurement = null;
  startNewSessionId();

  messagesEl.innerHTML = '';
  messagesEl.appendChild(welcomeState);
  showWelcome();
  showChat();

  loadInProgressSessions();

  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  })
    .then(r => r.json())
    .then(d => addMessage('assistant', d.message));
}

// ── Delete ─────────────────────────────────────────────────────
function confirmDelete(quoteId, cb) {
  pendingDeleteId = quoteId;
  afterDeleteCb   = cb || null;
  deleteModal.hidden = false;
}

async function executeDelete() {
  const quoteId = pendingDeleteId;
  pendingDeleteId = null;
  deleteModal.hidden = true;
  if (!quoteId) return;
  try {
    const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' });
    if (!res.ok) return;
    showToast('Quote deleted', '🗑');
    if (afterDeleteCb) { afterDeleteCb(); afterDeleteCb = null; }
    if (activeDetailQuoteId === quoteId) { activeDetailQuoteId = null; showChat(); }
    document.querySelector(`.quote-card[data-quote-id="${quoteId}"]`)?.closest('.msg')?.remove();
    loadSidebarQuotes();
    updateSidebarStats();
  } catch { /* ignore */ }
}

// ── Mobile sidebar ─────────────────────────────────────────────
const openSidebar  = () => { sidebar.classList.add('open'); mobileOverlay.classList.add('visible'); };
const closeSidebar = () => { sidebar.classList.remove('open'); mobileOverlay.classList.remove('visible'); };

// ── Event listeners ────────────────────────────────────────────
modalConfirmBtn.addEventListener('click', executeDelete);
modalCancelBtn.addEventListener('click', () => { pendingDeleteId = null; deleteModal.hidden = true; });
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) { pendingDeleteId = null; deleteModal.hidden = true; } });

sendBtn.addEventListener('click', send);
newChatBtn.addEventListener('click', () => newChat());
newChatMobileBtn?.addEventListener('click', () => { newChat(); closeSidebar(); });
backToChatBtn.addEventListener('click', showChat);
backFromFolderBtn.addEventListener('click', showChat);
deleteDetailBtn.addEventListener('click', () => { if (activeDetailQuoteId) confirmDelete(activeDetailQuoteId); });
folderBtn.addEventListener('click', showQuotesFolder);

hamburgerBtn?.addEventListener('click', openSidebar);
sidebarCloseBtn?.addEventListener('click', closeSidebar);
mobileOverlay?.addEventListener('click', closeSidebar);

folderSearch.addEventListener('input', () => loadFolderQuotes(folderSearch.value));

document.querySelectorAll('.welcome-chip').forEach(btn => {
  btn.addEventListener('click', () => { inputEl.value = btn.textContent; inputEl.focus(); });
});

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + 'px';
});
inputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

// ── Init ───────────────────────────────────────────────────────
const restored = tryRestoreLastSession();
if (!restored) {
  startNewSessionId();
  // Show welcome message from bot without clearing anything
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [] }),
  })
    .then(r => r.json())
    .then(d => addMessage('assistant', d.message));
}

loadSidebarQuotes();
updateSidebarStats();
loadInProgressSessions();
