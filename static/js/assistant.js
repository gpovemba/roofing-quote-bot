// ── AI Assistant (chat) ───────────────────────────────────────
(() => {
  const KEY = 'rqb.chat';
  const BOT = '<svg viewBox="0 0 16 16"><path d="M2 8 8 2.5 14 8 M4 7v6.5h8V7"/></svg>';
  const SUGGESTIONS = ['Quote 42 Maple Ave, Austin TX', 'Is our warranty transferable?', 'What do we charge for rotted decking?', '2,000 sq ft metal roof, steep pitch'];

  let state = { history: [], pending: null, cards: {} };
  const save = () => localStorage.setItem(KEY, JSON.stringify(state));
  const load = () => { try { state = { history: [], pending: null, cards: {}, ...JSON.parse(localStorage.getItem(KEY)) }; } catch { /* fresh */ } };

  App.route('/assistant', 'assistant', async root => {
    const { esc, money } = App;
    load();
    root.innerHTML = `<div class="page">
      <div class="page-head"><div><h1>AI Assistant</h1><p>Ask questions about your warranty and policies, or build a quote by chatting.</p></div>
        <div class="actions"><button class="btn btn-ghost btn-sm" id="chatClear">Clear conversation</button></div></div>
      <div class="card chat">
        <div class="chat-log" id="log"></div>
        <div class="chat-input">
          <textarea class="textarea" id="chatIn" rows="1" placeholder="Ask a question or describe a job…" aria-label="Message"></textarea>
          <button class="btn btn-primary" id="chatSend" style="height:44px">Send</button>
        </div>
      </div></div>`;
    const log = root.querySelector('#log'), input = root.querySelector('#chatIn'), sendBtn = root.querySelector('#chatSend');

    const attach = i => {
      const c = state.cards[i];
      if (!c) return '';
      if (c.quote_id) return `<div class="msg-attach"><a class="chat-quote" href="#/quote/${esc(c.quote_id)}"><span><span class="hint">Quote saved</span><br><strong>${money(c.total)}</strong></span><span class="btn btn-sm" style="margin-left:auto">Open quote</span></a></div>`;
      if (c.measurement) return `<div class="msg-attach"><div class="measure-chip"><span><strong>${App.num(c.measurement.total_roof_area_sqft)} sq ft</strong></span><span>Pitch <strong>${esc(c.measurement.predominant_pitch || '')}</strong></span><span class="src">EagleView</span></div></div>`;
      return '';
    };
    const bubble = (m, i) => `<div class="msg ${m.role}">${m.role === 'assistant' ? `<span class="msg-avatar">${BOT}</span>` : ''}
      <div><div class="msg-bubble">${esc(m.content)}</div>${attach(i)}</div></div>`;

    const draw = (typing = false) => {
      log.innerHTML = state.history.length
        ? state.history.map(bubble).join('') + (typing ? `<div class="msg assistant"><span class="msg-avatar">${BOT}</span><div class="msg-bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>` : '')
        : `<div class="empty" style="margin:auto"><h2>How can I help?</h2><p>I can answer from your uploaded documents or build a quote from an address.</p>
            <div class="chips" style="justify-content:center">${SUGGESTIONS.map(s => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
      log.scrollTop = log.scrollHeight;
    };
    draw();

    async function send(text) {
      text = text.trim();
      if (!text) return;
      input.value = ''; input.style.height = '';
      state.history.push({ role: 'user', content: text });
      draw(true);
      sendBtn.disabled = true;
      let messages = state.history;
      if (state.pending) {
        messages = state.history.slice(0, -1).concat([{ role: 'user',
          content: `[Pending EagleView measurement_id: ${state.pending.id} for "${state.pending.address}" — call get_measurement_status with this id instead of requesting again]\n${text}` }]);
      }
      try {
        const d = await App.api('/api/chat', { method: 'POST', body: { messages } });
        state.history.push({ role: 'assistant', content: d.message });
        const i = state.history.length - 1;
        if (d.quote_id) { state.cards[i] = { quote_id: d.quote_id, total: d.quote?.final_quote }; state.pending = null; }
        else if (d.measurement?.status === 'complete') state.cards[i] = { measurement: d.measurement };
        if (d.measurement) state.pending = d.measurement.status === 'pending' ? { id: d.measurement.id, address: d.measurement.address } : null;
      } catch (e) {
        state.history.pop();
        App.toast(`The assistant couldn't respond. ${e.message}`, 'error');
        input.value = text;
      }
      save(); draw();
      sendBtn.disabled = false; input.focus();
    }

    sendBtn.addEventListener('click', () => send(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
    input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px'; });
    log.addEventListener('click', e => { const c = e.target.closest('[data-s]'); if (c) send(c.dataset.s); });
    root.querySelector('#chatClear').addEventListener('click', () => {
      if (!state.history.length || confirm('Clear this conversation?')) { state = { history: [], pending: null, cards: {} }; save(); draw(); }
    });
    input.focus();
  });
})();
