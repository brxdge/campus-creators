// ============================================================
// Admin > Creators > Discovered creators
// What the separate Creator Search app sent to this website. Same layout as
// the Inbox pages: a row per creator, click to open, select several to delete.
// Private: only shown here, never on the public site.
// Loaded after admin.js, which calls render() and badge() through
// window.CCDiscovered.
// ============================================================
(function () {
  const PAGE = 50;
  let data = null;                 // last response from /api/admin/discovered
  let filter = 'all';              // all | new
  let collection = '';             // '' = every collection
  let sort = 'newest';             // newest | followers
  let query = '';
  let shown = PAGE;
  let H = null;
  const selected = new Set();

  function api(url, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin' };
    if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return H.api(url, opt);
  }

  function short(n) {
    if (!Number.isFinite(n)) return '';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  const full = (n) => (Number.isFinite(n) ? n.toLocaleString() : '');
  function when(iso) {
    const d = new Date(iso);
    const today = new Date();
    return d.toDateString() === today.toDateString()
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }
  const whenLong = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }

  // sidebar badge: how many have not been opened yet
  function setBadge(n) {
    document.querySelectorAll('[data-dc-badge]').forEach((b) => { b.textContent = n > 99 ? '99+' : n; b.hidden = !n; });
  }
  async function badge(adminApi) {
    try {
      const r = await adminApi('/api/admin/discovered/count');
      setBadge(r.unseen || 0);
    } catch (e) { /* server without the module, or signed out: no badge */ }
  }

  function trashIcon() {
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';
  }

  function link(href, text) {
    const a = H.el('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
    a.textContent = text;
    return a;
  }

  async function remove(ids) {
    if (!ids.length) return;
    const label = ids.length === 1 ? 'this creator' : ids.length + ' creators';
    if (!confirm('Delete ' + label + '? If Creator Search sends them again they will come back as new.')) return;
    try {
      if (ids.length === 1) await api('/api/admin/discovered/' + ids[0], null, 'DELETE');
      else await api('/api/admin/discovered/delete', { ids });
      ids.forEach((id) => selected.delete(id));
      H.toast(ids.length === 1 ? 'Deleted.' : ids.length + ' deleted.');
      await load();
    } catch (e) { H.toast(e.message, true); }
  }

  async function markSeen(body) {
    try {
      const r = await api('/api/admin/discovered/seen', body);
      setBadge(r.unseen);
      return r;
    } catch (e) { H.toast(e.message, true); return null; }
  }

  // ---------- one creator ----------
  function row(c) {
    const el = H.el;
    const r = el('div', 'msg' + (c.seen ? '' : ' unread'));
    r.innerHTML = `
      <div class="msg-head">
        <label class="msg-check" title="Select"><input type="checkbox"></label>
        <span class="dot"></span>
        <div class="msg-who"><strong></strong><span class="msg-sub"></span></div>
        <p class="msg-preview"></p>
        <span class="msg-date"></span>
        <button class="msg-trash" type="button" title="Delete" aria-label="Delete">${trashIcon()}</button>
      </div>
      <div class="msg-body"></div>`;
    r.querySelector('strong').textContent = c.nickname || c.handle;
    r.querySelector('.msg-sub').textContent = ['@' + c.handle, Number.isFinite(c.followers) ? short(c.followers) + ' followers' : ''].filter(Boolean).join(' · ');
    r.querySelector('.msg-preview').textContent = (c.bio || '').replace(/\s+/g, ' ');
    r.querySelector('.msg-date').textContent = when(c.receivedAt);
    r.querySelector('.msg-date').title = 'Arrived ' + whenLong(c.receivedAt);

    const box = r.querySelector('.msg-check input');
    box.checked = selected.has(c.id);
    r.classList.toggle('selected', box.checked);
    r.querySelector('.msg-check').addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => {
      if (box.checked) selected.add(c.id); else selected.delete(c.id);
      r.classList.toggle('selected', box.checked);
      syncBulk();
    });
    r.querySelector('.msg-trash').addEventListener('click', (e) => { e.stopPropagation(); remove([c.id]); });

    let built = false;
    function build() {
      built = true;
      const body = r.querySelector('.msg-body');
      const dl = el('dl', 'msg-fields');
      const add = (label, node) => {
        if (node == null || node === '') return;
        const dt = el('dt'); dt.textContent = label;
        const dd = el('dd');
        if (typeof node === 'string') dd.textContent = node; else dd.appendChild(node);
        dl.append(dt, dd);
      };
      add('TikTok', link(c.url, '@' + c.handle));
      add('Followers', Number.isFinite(c.followers) ? full(c.followers) : '');
      add('Following', Number.isFinite(c.following) ? full(c.following) : '');
      add('Videos', Number.isFinite(c.videos) ? full(c.videos) : '');
      add('Likes', Number.isFinite(c.likes) ? full(c.likes) : '');
      add('Bio', c.bio);
      if (c.bioLink && c.bioLink.href) add('Bio link', link(c.bioLink.href, c.bioLink.text || c.bioLink.href));
      if (c.collections && c.collections.length) {
        const w = el('span');
        c.collections.forEach((n) => { const t = el('span', 'tag'); t.textContent = n; w.appendChild(t); });
        add('Collection', w);
      }
      const flags = [];
      if (c.verified) flags.push('Verified');
      if (c.business) flags.push(c.businessCategory ? 'Business: ' + c.businessCategory : 'Business account');
      if (c.seller) flags.push('TikTok Shop seller');
      if (c.private) flags.push('Private account');
      if (flags.length) {
        const w = el('span');
        flags.forEach((n) => { const t = el('span', 'tag'); t.textContent = n; w.appendChild(t); });
        add('Account', w);
      }
      add('On TikTok since', c.tiktokSince);
      add('Arrived', whenLong(c.receivedAt));
      if (c.updatedAt && c.updatedAt !== c.receivedAt) {
        add('Last updated', whenLong(c.updatedAt) + (c.deliveries > 1 ? ' (sent ' + c.deliveries + ' times)' : ''));
      }
      body.appendChild(dl);

      const actions = el('div', 'msg-actions');
      actions.innerHTML = `
        <a class="btn small" target="_blank" rel="noopener noreferrer nofollow">Open on TikTok</a>
        <button class="btn ghost small" type="button" data-act="copy">Copy @handle</button>
        <button class="btn ghost small" type="button" data-act="toggle"></button>
        <button class="msg-del" type="button" data-act="delete">Delete</button>
        <span class="msg-stamp"></span>`;
      actions.querySelector('a').href = c.url;
      actions.querySelector('.msg-stamp').textContent = 'Arrived ' + whenLong(c.receivedAt);
      const tgl = actions.querySelector('[data-act=toggle]');
      const paint = () => { tgl.textContent = c.seen ? 'Mark as new' : 'Mark as seen'; r.classList.toggle('unread', !c.seen); };
      paint();
      tgl.addEventListener('click', async () => {
        const res = await markSeen({ ids: [c.id], seen: !c.seen });
        if (res) { c.seen = !c.seen; paint(); syncCounts(); }
      });
      actions.querySelector('[data-act=copy]').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText('@' + c.handle); H.toast('Copied @' + c.handle); }
        catch (e) { H.toast('Could not copy. Select the handle by hand.', true); }
      });
      actions.querySelector('[data-act=delete]').addEventListener('click', () => remove([c.id]));
      body.appendChild(actions);
    }

    r.querySelector('.msg-head').addEventListener('click', async () => {
      const open = r.classList.toggle('open');
      if (open && !built) build();
      if (open && !c.seen) {
        const res = await markSeen({ ids: [c.id] });
        if (res) { c.seen = true; r.classList.remove('unread'); const t = r.querySelector('[data-act=toggle]'); if (t) t.textContent = 'Mark as new'; syncCounts(); }
      }
    });
    return r;
  }

  // ---------- the page ----------
  let barEl = null, listEl = null, bulkBtn = null, seenBtn = null, statusEl = null;

  function visible() {
    const q = query.trim().toLowerCase();
    let rows = data.items.filter((c) =>
      (filter === 'all' || !c.seen) &&
      (!collection || (c.collections || []).includes(collection)) &&
      (!q || (c.handle + ' ' + (c.nickname || '') + ' ' + (c.bio || '') + ' ' + (c.collections || []).join(' ') + ' ' + (c.businessCategory || '')).toLowerCase().includes(q)));
    if (sort === 'followers') rows = rows.slice().sort((a, b) => (b.followers || 0) - (a.followers || 0));
    return rows;
  }

  function syncBulk() {
    bulkBtn.hidden = !selected.size;
    bulkBtn.textContent = 'Delete selected (' + selected.size + ')';
  }
  function syncCounts() {
    const n = data.items.filter((c) => !c.seen).length;
    data.unseen = n;
    const segs = barEl.querySelectorAll('.seg button span');
    segs[0].textContent = data.items.length;
    segs[1].textContent = n;
    seenBtn.hidden = !n;
    setBadge(n);
  }

  function statusLine() {
    const rc = data.receiver || {};
    statusEl.innerHTML = '';
    if (!rc.ready) {
      const n = H.el('div', 'notice dc-setup');
      n.innerHTML = `<h3>Creator Search can’t send here yet</h3>
        <p>${rc.shortSecret ? 'The secret on the website is too short.' : 'The website has no secret yet.'}
        In Railway → Variables, add <code>CREATOR_SEARCH_SECRET</code> with 32 or more random characters and redeploy.
        Then put the same value in Creator Search, and set its website address to this site followed by <code>${rc.path}</code>.</p>`;
      statusEl.appendChild(n);
      return;
    }
    const last = (data.deliveries || [])[0];
    const p = H.el('p', 'dc-last');
    if (!last) {
      p.textContent = 'Ready. Nothing has arrived yet. In Creator Search, open Automations and choose Run now.';
    } else {
      const bits = [last.test ? 'Test message' : last.received + (last.received === 1 ? ' creator' : ' creators')];
      if (!last.test) bits.push(last.added + ' new', last.updated + ' updated');
      if (last.skipped) bits.push(last.skipped + ' skipped');
      if (last.collection) bits.push(last.collection);
      p.textContent = 'Last delivery ' + ago(last.at) + ' · ' + bits.join(' · ');
    }
    statusEl.appendChild(p);
  }

  function draw() {
    const rows = visible();
    listEl.innerHTML = '';
    if (!rows.length) {
      const empty = H.el('p', 'empty inbox-empty');
      empty.textContent = data.items.length
        ? (filter === 'new' && !query && !collection ? 'Nothing new. Everything has been opened.' : 'Nothing matches.')
        : 'No creators yet. Save creators in Creator Search, then use Automations → Run now.';
      listEl.appendChild(empty);
      return;
    }
    rows.slice(0, shown).forEach((c) => listEl.appendChild(row(c)));
    if (rows.length > shown) {
      const more = H.el('div', 'dc-more');
      const b = H.el('button', 'btn ghost small');
      b.type = 'button';
      b.textContent = 'Show ' + Math.min(PAGE, rows.length - shown) + ' more (' + (rows.length - shown) + ' left)';
      b.addEventListener('click', () => { shown += PAGE; draw(); });
      more.appendChild(b);
      listEl.appendChild(more);
    }
  }

  function page() {
    const view = H.view;
    view.innerHTML = '';
    statusEl = H.el('div', 'dc-status');
    view.appendChild(statusEl);
    statusLine();

    if (!data.items.length && !(data.receiver || {}).ready) return;   // setup notice only

    barEl = H.el('div', 'inbox-bar');
    barEl.innerHTML = `
      <div class="seg">
        <button type="button" data-f="all">All <span>${data.items.length}</span></button>
        <button type="button" data-f="new">New <span>${data.unseen}</span></button>
      </div>
      <input type="text" class="inbox-search" placeholder="Search handle, name, bio…">
      <select class="dc-select" aria-label="Collection"></select>
      <select class="dc-select" aria-label="Sort">
        <option value="newest">Newest first</option>
        <option value="followers">Most followers</option>
      </select>
      <button class="btn small bulk-del" type="button" hidden></button>
      <button class="btn ghost small dc-seen" type="button">Mark all as seen</button>`;
    bulkBtn = barEl.querySelector('.bulk-del');
    seenBtn = barEl.querySelector('.dc-seen');
    seenBtn.hidden = !data.unseen;

    barEl.querySelectorAll('.seg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.f === filter);
      b.addEventListener('click', () => {
        filter = b.dataset.f; shown = PAGE;
        barEl.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x.dataset.f === filter));
        draw();
      });
    });
    const search = barEl.querySelector('.inbox-search');
    search.value = query;
    search.addEventListener('input', () => { query = search.value; shown = PAGE; draw(); });

    const [colSel, sortSel] = barEl.querySelectorAll('.dc-select');
    colSel.innerHTML = '<option value="">All collections</option>';
    (data.collections || []).forEach((c) => {
      const o = document.createElement('option');
      o.value = c.name; o.textContent = c.name + ' (' + c.count + ')';
      colSel.appendChild(o);
    });
    if (collection && !(data.collections || []).some((c) => c.name === collection)) collection = '';
    colSel.value = collection;
    colSel.hidden = !(data.collections || []).length;
    colSel.addEventListener('change', () => { collection = colSel.value; shown = PAGE; draw(); });
    sortSel.value = sort;
    sortSel.addEventListener('change', () => { sort = sortSel.value; draw(); });

    bulkBtn.addEventListener('click', () => remove(Array.from(selected)));
    seenBtn.addEventListener('click', async () => {
      const res = await markSeen({ all: true });
      if (!res) return;
      data.items.forEach((c) => { c.seen = true; });
      syncCounts();
      draw();
    });
    syncBulk();
    view.appendChild(barEl);

    listEl = H.el('div', 'inbox-list');
    view.appendChild(listEl);
    draw();
  }

  async function load() {
    try {
      data = await api('/api/admin/discovered');
      setBadge(data.unseen || 0);
      for (const id of Array.from(selected)) if (!data.items.some((c) => c.id === id)) selected.delete(id);
      page();
    } catch (e) {
      H.view.innerHTML = '';
      const n = H.el('div', 'notice');
      n.innerHTML = '<h3>Discovered creators isn’t available</h3><p></p>';
      n.querySelector('p').textContent = /404|not json/i.test(e.message)
        ? 'The server hasn’t loaded creator-inbox.js yet. Put creator-inbox.js and the new server.js in the main project folder, then restart or push to GitHub.'
        : e.message;
      H.view.appendChild(n);
    }
  }

  window.CCDiscovered = {
    render(helpers) { H = helpers; shown = PAGE; load(); },
    badge,
  };
})();
