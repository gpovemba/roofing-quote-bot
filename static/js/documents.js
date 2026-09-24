// ── Documents (knowledge base the AI searches) ────────────────
App.route('/documents', 'documents', async root => {
  const { esc } = App;
  let D = await App.api('/api/documents');
  let category = 'warranty';

  const ext = name => (name || '').split('.').pop().toUpperCase().slice(0, 4);

  function render() {
    const docs = D.documents;
    const needsIndex = D.search_mode === 'hybrid' && docs.some(d => d.unembedded > 0);
    root.innerHTML = `<div class="page page-narrow">
      <div class="page-head"><div><h1>Documents</h1><p>Your warranty, policies, and supplier sheets. The AI reads these to answer questions and write the notes on every quote.</p></div></div>
      <div class="card">
        <section class="settings-section"><div class="h2">Add documents</div><p class="sub">PDF, Word (.docx), .txt, .md, or .csv, up to 25 MB each. Scanned PDFs without selectable text can't be read.</p>
          <div class="grid" style="grid-template-columns:200px minmax(0,1fr);align-items:stretch">
            <label class="field"><span class="label">Type</span><select class="select" id="docCat">${Object.entries(D.categories).map(([k, v]) => `<option value="${k}" ${k === category ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
            <label class="drop" id="drop" tabindex="0"><input type="file" id="docFile" accept=".pdf,.docx,.txt,.md,.csv" multiple hidden />
              <svg viewBox="0 0 24 24"><path d="M12 16V4 M7 9l5-5 5 5 M4 16v4h16v-4"/></svg>
              <span>Drop files here or <u>choose files</u></span><span class="drop-status" id="dropStatus"></span></label>
          </div></section>

        <section class="settings-section"><div class="spread"><div class="h2">Your documents <span class="muted">${docs.length || ''}</span></div>
          <span class="hint">${D.search_mode === 'hybrid' ? 'Searching by keywords and meaning' : 'Searching by keywords'}</span></div>
          ${D.search_mode !== 'hybrid' ? '<p class="sub">To also search by meaning, add VOYAGE_API_KEY to your .env file and restart the app.</p>' : '<p class="sub"></p>'}
          ${needsIndex ? '<div class="banner spread">Some documents were added before meaning search was turned on.<button class="btn btn-sm" data-act="reindex">Index them now</button></div>' : ''}
          ${docs.length ? docs.map(d => `<div class="doc-row"><span class="doc-icon">${esc(ext(d.filename))}</span>
              <span class="grow"><strong>${esc(d.title)}</strong><span class="hint">${esc(D.categories[d.category] || 'Other')}${d.pages ? ` · ${d.pages} page${d.pages !== 1 ? 's' : ''}` : ''} · ${d.chunk_count} passage${d.chunk_count !== 1 ? 's' : ''} · added ${App.timeAgo(d.created_at)}</span></span>
              <button class="icon-btn danger" data-del="${esc(d.id)}" aria-label="Delete ${esc(d.title)}"><svg viewBox="0 0 20 20"><path d="M4 6h12 M8 6V4h4v2 M6 6l.7 10h6.6L14 6"/></svg></button></div>`).join('')
            : `<div class="empty" style="padding:28px 10px"><h2>No documents yet</h2><p>Upload your warranty and price policies, or load three sample documents to see how it works.</p>
                <button class="btn btn-primary" data-act="samples">Load sample documents</button></div>`}
        </section>

        <section class="settings-section"><div class="h2">Test a question</div><p class="sub">See exactly which passages the AI would read before answering.</p>
          <div class="input-group" style="max-width:640px"><input class="input" id="q" placeholder="For example: is rotted decking extra?" ${docs.length ? '' : 'disabled'} />
            <button class="btn btn-dark" data-act="search" ${docs.length ? '' : 'disabled'}>Search</button></div>
          <div id="results"></div></section>
      </div></div>`;
  }

  const reload = async () => { D = await App.api('/api/documents'); render(); };
  const b64 = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(new Error('Could not read the file')); r.readAsDataURL(file); });

  async function upload(files) {
    const list = [...files], problems = [];
    let ok = 0;
    for (const [i, f] of list.entries()) {
      root.querySelector('#dropStatus').textContent = `Adding ${f.name} (${i + 1} of ${list.length})…`;
      try {
        const r = await App.api('/api/documents', { method: 'POST', body: { filename: f.name, category, content_base64: await b64(f) } });
        if (r.warning) problems.push(`${f.name}: ${r.warning}`);
        ok++;
      } catch (e) { problems.push(`${f.name}: ${e.message}`); }
    }
    await reload();
    if (ok) App.toast(`Added ${ok} document${ok !== 1 ? 's' : ''}`);
    if (problems.length) root.querySelector('#dropStatus').textContent = problems.join(' ');
  }

  async function search() {
    const q = root.querySelector('#q').value.trim();
    if (!q) return;
    const out = root.querySelector('#results');
    out.innerHTML = '<p class="hint" style="margin-top:12px">Searching…</p>';
    const { results = [] } = await App.api('/api/documents/search', { method: 'POST', body: { query: q } });
    out.innerHTML = results.length ? results.map(r => `<div class="result"><div class="result-src">${esc(r.document)}${r.section ? ` › ${esc(r.section)}` : ''}${r.page ? ` · page ${r.page}` : ''}</div>
      <div class="result-text">${esc(r.text)}</div></div>`).join('') : '<p class="hint" style="margin-top:12px">No matching passages. Try other words, or upload a document that covers this.</p>';
  }

  render();
  root.addEventListener('change', e => {
    if (e.target.id === 'docCat') category = e.target.value;
    if (e.target.id === 'docFile' && e.target.files.length) upload(e.target.files);
  });
  root.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.del) {
      const d = D.documents.find(x => x.id === t.dataset.del);
      if (!confirm(`Delete "${d?.title}"? The AI will stop using it.`)) return;
      await App.api(`/api/documents/${t.dataset.del}`, { method: 'DELETE' }); App.toast('Document deleted'); reload();
    }
    if (t.dataset.act === 'samples') { t.disabled = true; t.textContent = 'Loading…'; await App.api('/api/documents/samples', { method: 'POST' }); App.toast('Sample documents added'); reload(); }
    if (t.dataset.act === 'search') search();
    if (t.dataset.act === 'reindex') {
      t.disabled = true; t.textContent = 'Indexing…';
      try { const r = await App.api('/api/documents/reindex', { method: 'POST' }); App.toast(`Indexed ${r.embedded} passages`); } catch (err) { App.toast(err.message, 'error'); }
      reload();
    }
  });
  root.addEventListener('keydown', e => {
    if (e.target.id === 'q' && e.key === 'Enter') search();
    if (e.target.id === 'drop' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); root.querySelector('#docFile').click(); }
  });
  root.addEventListener('dragover', e => { const d = e.target.closest?.('#drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  root.addEventListener('dragleave', e => e.target.closest?.('#drop')?.classList.remove('over'));
  root.addEventListener('drop', e => { const d = e.target.closest?.('#drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });
});
