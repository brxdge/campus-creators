// ============================================================
// Admin > Creators > Discovered creators
// What the separate Creator Search app sent to this website, shown as creator
// cards: photo, handle, TikTok button, bio link, followers / videos / likes,
// bio, tags and the collection each one was saved in. A compact list view is
// one click away. Private: only shown here, never on the public site.
// Loaded after admin.js, which calls render() and badge() through
// window.CCDiscovered.
// ============================================================
(function () {
  const PAGE = 24;
  const VIEW_KEY = 'cc-dc-view';
  let data = null;                 // last response from /api/admin/discovered
  let filter = 'all';              // all | new
  let collection = '';             // '' = every collection
  let sort = 'newest';             // newest | followers
  let query = '';
  let shown = PAGE;
  let mode = 'cards';              // cards | list
  let H = null;
  const selected = new Set();
  let ui = {};                     // the toolbar / list / bulk bar elements of the current screen

  try { if (localStorage.getItem(VIEW_KEY) === 'list') mode = 'list'; } catch (e) { /* private mode: default view */ }

  function api(url, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin' };
    if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return H.api(url, opt);
  }

  // ---------- small helpers ----------
  const ICON = {
    play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    out: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    cards: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><path d="M17 8.5v5M14.5 11h5"/></svg>',
  };
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
  function short(n) {
    if (!isNum(n)) return '–';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  const full = (n) => (isNum(n) ? n.toLocaleString() : '');
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
  function initials(c) {
    const first = (w) => (Array.from(w).find((ch) => /[\p{L}\p{N}]/u.test(ch)) || '');
    const fromName = String(c.nickname || '').split(/\s+/).map(first).filter(Boolean).slice(0, 2).join('');
    if (fromName) return fromName.toUpperCase();
    return String(c.handle).replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  }
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function link(href, html, cls) {
    const a = node('a', cls);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
    if (html != null) a.innerHTML = html;
    return a;
  }
  function textLink(href, text) {
    const a = link(href, null);
    a.textContent = text;
    return a;
  }
  function barePath(href) { return String(href).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''); }
  async function copyHandle(c) {
    try { await navigator.clipboard.writeText('@' + c.handle); H.toast('Copied @' + c.handle); }
    catch (e) { H.toast('Could not copy. Select the handle by hand.', true); }
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

  // ---------- actions ----------
  async function remove(ids) {
    if (!ids.length) return;
    const label = ids.length === 1 ? 'this creator' : ids.length + ' creators';
    if (!confirm('Delete ' + label + '? If Creator Search sends them again they will come back as new.')) return;
    try {
      if (ids.length === 1) await api('/api/admin/discovered/' + ids[0], null, 'DELETE');
      else await api('/api/admin/discovered/delete', { ids });
      ids.forEach((id) => selected.delete(id));
      H.toast(ids.length === 1 ? 'Deleted.' : ids.length + ' deleted.');
      await load(true);
    } catch (e) { H.toast(e.message, true); }
  }
  async function setSeen(c, val) {
    if (!!c.seen === val) return true;
    try {
      const r = await api('/api/admin/discovered/seen', { ids: [c.id], seen: val });
      c.seen = val;
      setBadge(r.unseen);
      syncCounts();
      return true;
    } catch (e) { H.toast(e.message, true); return false; }
  }
  function pick(c, on) {
    if (on) selected.add(c.id); else selected.delete(c.id);
    syncBulk();
  }

  // ---------- one creator, as a card ----------
  function avatar(c) {
    const a = node('div', 'dc-ava');
    const fallback = () => {
      let h = 0;
      for (const ch of String(c.handle)) h = (h * 31 + ch.charCodeAt(0)) % 360;
      a.style.setProperty('--h', h);
      a.textContent = initials(c);
      a.classList.add('dc-ava-none');
    };
    if (c.avatar) {
      const img = node('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = '/api/admin/discovered/' + c.id + '/avatar?v=' + (c.avatarAt || 0);
      img.addEventListener('error', () => { img.remove(); fallback(); });
      a.appendChild(img);
    } else fallback();
    return a;
  }

  function card(c) {
    const el = node('article', 'dc-card' + (c.seen ? '' : ' is-new') + (selected.has(c.id) ? ' is-picked' : ''));

    const top = node('div', 'dc-top');
    top.appendChild(avatar(c));
    const who = node('div', 'dc-who');
    const nameRow = node('div', 'dc-namerow');
    const name = node('h3', 'dc-name', c.nickname || c.handle);
    name.dir = 'auto';
    name.title = c.nickname || c.handle;
    nameRow.appendChild(name);
    const newPill = node('span', 'dc-newpill', 'New');
    nameRow.appendChild(newPill);
    who.appendChild(nameRow);
    const handle = node('button', 'dc-handle', '@' + c.handle);
    handle.type = 'button';
    handle.title = 'Copy @' + c.handle;
    handle.addEventListener('click', () => copyHandle(c));
    who.appendChild(handle);
    top.appendChild(who);
    const pickLabel = node('label', 'dc-pick');
    pickLabel.title = 'Select';
    const box = node('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', 'Select ' + (c.nickname || c.handle));
    box.checked = selected.has(c.id);
    pickLabel.appendChild(box);
    top.appendChild(pickLabel);
    el.appendChild(top);

    const links = node('div', 'dc-links');
    const tt = link(c.url, ICON.play + '<span>TikTok</span>' + ICON.out, 'dc-tt');
    links.appendChild(tt);
    if (c.bioLink && c.bioLink.href) {
      const b = link(c.bioLink.href, ICON.link + '<span></span>' + ICON.out, 'dc-biolink');
      b.querySelector('span').textContent = barePath(c.bioLink.text || c.bioLink.href);
      b.title = c.bioLink.href;
      links.appendChild(b);
    } else links.appendChild(node('span', 'dc-nolink', 'No link in bio'));
    el.appendChild(links);

    const stats = node('div', 'dc-stats');
    [['followers', c.followers], ['videos', c.videos], ['likes', c.likes]].forEach(([label, n]) => {
      const s = node('div', 'dc-stat');
      const num = node('strong', null, short(n));
      if (isNum(n)) num.title = full(n);
      s.append(num, node('span', null, label));
      stats.appendChild(s);
    });
    el.appendChild(stats);

    if (c.bio) {
      const bio = node('p', 'dc-bio', c.bio);
      bio.dir = 'auto';
      el.appendChild(bio);
      if (c.bio.length > 150 || (c.bio.match(/\n/g) || []).length > 2) {
        const more = node('button', 'dc-more-bio', 'Show more');
        more.type = 'button';
        more.addEventListener('click', () => {
          const open = bio.classList.toggle('open');
          more.textContent = open ? 'Show less' : 'Show more';
        });
        el.appendChild(more);
      }
    } else el.appendChild(node('p', 'dc-bio dc-bio-empty', 'No bio'));

    const chips = [];
    if (c.verified) chips.push(['Verified', 'accent']);
    if (c.business) chips.push([c.businessCategory ? 'Business · ' + c.businessCategory : 'Business account', '']);
    if (c.seller) chips.push(['TikTok Shop', '']);
    if (c.private) chips.push(['Private account', '']);
    if (c.tiktokSince) chips.push(['Joined ' + String(c.tiktokSince).slice(0, 4), '']);
    if (chips.length) {
      const row = node('div', 'dc-chips');
      chips.forEach(([t, k]) => row.appendChild(node('span', 'dc-chip' + (k ? ' dc-chip-' + k : ''), t)));
      el.appendChild(row);
    }

    if (c.collections && c.collections.length) {
      const saved = node('div', 'dc-saved');
      saved.appendChild(node('span', 'dc-saved-label', 'Saved in'));
      const names = node('div', 'dc-saved-names');
      c.collections.forEach((n) => names.appendChild(node('b', null, n)));
      saved.appendChild(names);
      el.appendChild(saved);
    }

    const foot = node('footer', 'dc-foot');
    const stamp = node('span', 'dc-when', 'Arrived ' + when(c.receivedAt) + (c.deliveries > 1 ? ' · sent ' + c.deliveries + '×' : ''));
    stamp.title = 'Arrived ' + whenLong(c.receivedAt) + (c.updatedAt && c.updatedAt !== c.receivedAt ? '\nUpdated ' + whenLong(c.updatedAt) : '');
    const seenBtn = node('button', 'dc-textbtn');
    seenBtn.type = 'button';
    const paint = () => {
      el.classList.toggle('is-new', !c.seen);
      seenBtn.innerHTML = c.seen ? ICON.check + '<span>Seen</span>' : '<span>Mark as seen</span>';
      seenBtn.title = c.seen ? 'Put back as new' : 'Mark as seen';
    };
    paint();
    const del = node('button', 'dc-trash');
    del.type = 'button';
    del.title = 'Delete';
    del.setAttribute('aria-label', 'Delete ' + (c.nickname || c.handle));
    del.innerHTML = ICON.trash;
    foot.append(stamp, seenBtn, del);
    el.appendChild(foot);

    box.addEventListener('change', () => { el.classList.toggle('is-picked', box.checked); pick(c, box.checked); });
    seenBtn.addEventListener('click', async () => { if (await setSeen(c, !c.seen)) paint(); });
    del.addEventListener('click', () => remove([c.id]));
    // looking at a creator counts as seeing them
    [tt, links.querySelector('.dc-biolink')].forEach((a) => { if (a) a.addEventListener('click', async () => { if (await setSeen(c, true)) paint(); }); });
    return el;
  }

  // ---------- one creator, as a compact row ----------
  function row(c) {
    const r = node('div', 'msg' + (c.seen ? '' : ' unread'));
    r.innerHTML = `
      <div class="msg-head">
        <label class="msg-check" title="Select"><input type="checkbox"></label>
        <span class="dc-rowava"></span>
        <div class="msg-who"><strong></strong><span class="msg-sub"></span></div>
        <p class="msg-preview"></p>
        <span class="msg-date"></span>
        <button class="msg-trash" type="button" title="Delete" aria-label="Delete">${ICON.trash}</button>
      </div>
      <div class="msg-body"></div>`;
    r.querySelector('.dc-rowava').appendChild(avatar(c));
    r.querySelector('strong').textContent = c.nickname || c.handle;
    r.querySelector('.msg-sub').textContent = ['@' + c.handle, isNum(c.followers) ? short(c.followers) + ' followers' : ''].filter(Boolean).join(' · ');
    r.querySelector('.msg-preview').textContent = (c.bio || '').replace(/\s+/g, ' ');
    r.querySelector('.msg-date').textContent = when(c.receivedAt);
    r.querySelector('.msg-date').title = 'Arrived ' + whenLong(c.receivedAt);

    const box = r.querySelector('.msg-check input');
    box.checked = selected.has(c.id);
    r.classList.toggle('selected', box.checked);
    r.querySelector('.msg-check').addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('change', () => { r.classList.toggle('selected', box.checked); pick(c, box.checked); });
    r.querySelector('.msg-trash').addEventListener('click', (e) => { e.stopPropagation(); remove([c.id]); });

    let built = false;
    let tglBtn = null;
    function build() {
      built = true;
      const body = r.querySelector('.msg-body');
      const dl = node('dl', 'msg-fields');
      const add = (label, content) => {
        if (content == null || content === '') return;
        const dt = node('dt', null, label);
        const dd = node('dd');
        if (typeof content === 'string') dd.textContent = content; else dd.appendChild(content);
        dl.append(dt, dd);
      };
      const tags = (list) => {
        const w = node('span');
        list.forEach((n) => w.appendChild(node('span', 'tag', n)));
        return w;
      };
      add('TikTok', textLink(c.url, '@' + c.handle));
      add('Followers', isNum(c.followers) ? full(c.followers) : '');
      add('Following', isNum(c.following) ? full(c.following) : '');
      add('Videos', isNum(c.videos) ? full(c.videos) : '');
      add('Likes', isNum(c.likes) ? full(c.likes) : '');
      add('Bio', c.bio);
      if (c.bioLink && c.bioLink.href) add('Bio link', textLink(c.bioLink.href, c.bioLink.text || c.bioLink.href));
      if (c.collections && c.collections.length) add('Collection', tags(c.collections));
      const flags = [];
      if (c.verified) flags.push('Verified');
      if (c.business) flags.push(c.businessCategory ? 'Business: ' + c.businessCategory : 'Business account');
      if (c.seller) flags.push('TikTok Shop seller');
      if (c.private) flags.push('Private account');
      if (flags.length) add('Account', tags(flags));
      add('On TikTok since', c.tiktokSince);
      add('Arrived', whenLong(c.receivedAt));
      if (c.updatedAt && c.updatedAt !== c.receivedAt) {
        add('Last updated', whenLong(c.updatedAt) + (c.deliveries > 1 ? ' (sent ' + c.deliveries + ' times)' : ''));
      }
      body.appendChild(dl);

      const actions = node('div', 'msg-actions');
      const open = textLink(c.url, 'Open on TikTok');
      open.className = 'btn small';
      const copy = node('button', 'btn ghost small', 'Copy @handle');
      copy.type = 'button';
      const tgl = node('button', 'btn ghost small');
      tgl.type = 'button';
      tglBtn = tgl;
      const del = node('button', 'msg-del', 'Delete');
      del.type = 'button';
      actions.append(open, copy, tgl, del);
      const paint = () => { tgl.textContent = c.seen ? 'Mark as new' : 'Mark as seen'; r.classList.toggle('unread', !c.seen); };
      paint();
      tgl.addEventListener('click', async () => { if (await setSeen(c, !c.seen)) paint(); });
      copy.addEventListener('click', () => copyHandle(c));
      del.addEventListener('click', () => remove([c.id]));
      body.appendChild(actions);
    }
    r.querySelector('.msg-head').addEventListener('click', async () => {
      const open = r.classList.toggle('open');
      if (open && !built) build();
      if (open && !c.seen && await setSeen(c, true)) {
        r.classList.remove('unread');
        if (tglBtn) tglBtn.textContent = 'Mark as new';
      }
    });
    return r;
  }

  // ---------- the page ----------
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
    if (!ui.bulk) return;
    const n = selected.size;
    ui.bulk.hidden = !n;
    ui.bulkCount.textContent = n + (n === 1 ? ' creator selected' : ' creators selected');
  }
  function syncCounts() {
    const n = data.items.filter((c) => !c.seen).length;
    data.unseen = n;
    const counts = ui.bar.querySelectorAll('[data-f] span');
    counts[0].textContent = data.items.length;
    counts[1].textContent = n;
    ui.seenAll.hidden = !n;
    setBadge(n);
  }

  function statusLine() {
    const rc = data.receiver || {};
    ui.status.innerHTML = '';
    if (!rc.ready) {
      const n = node('div', 'notice dc-setup');
      n.innerHTML = `<h3>Creator Search can’t send here yet</h3>
        <p>${rc.shortSecret ? 'The secret on the website is too short.' : 'The website has no secret yet.'}
        In Railway → Variables, add <code>CREATOR_SEARCH_SECRET</code> with 32 or more random characters and redeploy.
        Then put the same value in Creator Search, and set its website address to this site followed by <code>${rc.path}</code>.</p>`;
      ui.status.appendChild(n);
      return;
    }
    const last = (data.deliveries || [])[0];
    const p = node('p', 'dc-last');
    if (!last) {
      p.textContent = 'Ready. Nothing has arrived yet. In Creator Search, open Automations and choose Run now.';
    } else {
      const bits = [last.test ? 'Test message' : last.received + (last.received === 1 ? ' creator' : ' creators')];
      if (!last.test) bits.push(last.added + ' new', last.updated + ' updated');
      if (last.skipped) bits.push(last.skipped + ' skipped');
      if (last.collection) bits.push(last.collection);
      p.textContent = 'Last delivery ' + ago(last.at) + ' · ' + bits.join(' · ');
    }
    ui.status.appendChild(p);
  }

  function draw() {
    const rows = visible();
    ui.list.innerHTML = '';
    ui.list.className = mode === 'cards' ? 'dc-grid' : 'inbox-list';
    if (!rows.length) {
      const empty = node('div', 'dc-empty');
      const none = !data.items.length;
      empty.innerHTML = `<span class="dc-empty-ico">${ICON.spark}</span><h3></h3><p></p>`;
      empty.querySelector('h3').textContent = none ? 'No creators yet' : (filter === 'new' && !query && !collection ? 'Nothing new' : 'Nothing matches');
      empty.querySelector('p').textContent = none
        ? 'Save creators in Creator Search, then open Automations and choose Run now. They will show up here.'
        : (filter === 'new' && !query && !collection ? 'Every creator has been looked at.' : 'Try a different word, or clear the collection filter.');
      ui.list.className = 'dc-grid dc-grid-empty';
      ui.list.appendChild(empty);
      ui.more.innerHTML = '';
      return;
    }
    rows.slice(0, shown).forEach((c) => ui.list.appendChild(mode === 'cards' ? card(c) : row(c)));
    ui.more.innerHTML = '';
    const left = rows.length - shown;
    const note = node('span', 'dc-count', 'Showing ' + Math.min(shown, rows.length) + ' of ' + rows.length);
    ui.more.appendChild(note);
    if (left > 0) {
      const b = node('button', 'btn ghost small', 'Show ' + Math.min(PAGE, left) + ' more');
      b.type = 'button';
      b.addEventListener('click', () => { shown += PAGE; draw(); });
      ui.more.appendChild(b);
    }
  }

  function page() {
    const view = H.view;
    view.innerHTML = '';
    view.classList.add('dc-view');
    ui = { status: node('div', 'dc-status') };
    view.appendChild(ui.status);
    statusLine();
    if (!data.items.length && !(data.receiver || {}).ready) return;   // setup notice only

    const bar = node('div', 'dc-bar');
    bar.innerHTML = `
      <div class="seg">
        <button type="button" data-f="all">All <span>${data.items.length}</span></button>
        <button type="button" data-f="new">New <span>${data.unseen}</span></button>
      </div>
      <input type="text" class="inbox-search dc-search" placeholder="Search handle, name, bio…" aria-label="Search creators">
      <select class="dc-select" aria-label="Collection"></select>
      <select class="dc-select" aria-label="Sort">
        <option value="newest">Newest first</option>
        <option value="followers">Most followers</option>
      </select>
      <div class="seg dc-modes" role="group" aria-label="View">
        <button type="button" data-m="cards" aria-label="Cards" title="Cards">${ICON.cards}</button>
        <button type="button" data-m="list" aria-label="List" title="List">${ICON.list}</button>
      </div>
      <button class="btn ghost small dc-seen" type="button">Mark all as seen</button>`;
    ui.bar = bar;
    ui.seenAll = bar.querySelector('.dc-seen');
    ui.seenAll.hidden = !data.unseen;

    bar.querySelectorAll('.seg button[data-f]').forEach((b) => {
      b.classList.toggle('on', b.dataset.f === filter);
      b.addEventListener('click', () => {
        filter = b.dataset.f; shown = PAGE;
        bar.querySelectorAll('.seg button[data-f]').forEach((x) => x.classList.toggle('on', x.dataset.f === filter));
        draw();
      });
    });
    bar.querySelectorAll('.dc-modes button').forEach((b) => {
      b.classList.toggle('on', b.dataset.m === mode);
      b.setAttribute('aria-pressed', b.dataset.m === mode ? 'true' : 'false');
      b.addEventListener('click', () => {
        mode = b.dataset.m; shown = PAGE;
        try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* not saved: fine */ }
        bar.querySelectorAll('.dc-modes button').forEach((x) => { x.classList.toggle('on', x.dataset.m === mode); x.setAttribute('aria-pressed', x.dataset.m === mode ? 'true' : 'false'); });
        draw();
      });
    });
    const search = bar.querySelector('.dc-search');
    search.value = query;
    search.addEventListener('input', () => { query = search.value; shown = PAGE; draw(); });

    const [colSel, sortSel] = bar.querySelectorAll('.dc-select');
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

    ui.seenAll.addEventListener('click', async () => {
      try {
        const r = await api('/api/admin/discovered/seen', { all: true });
        data.items.forEach((c) => { c.seen = true; });
        setBadge(r.unseen);
        syncCounts();
        draw();
      } catch (e) { H.toast(e.message, true); }
    });
    view.appendChild(bar);

    ui.list = node('div', 'dc-grid');
    view.appendChild(ui.list);
    ui.more = node('div', 'dc-morebar');
    view.appendChild(ui.more);

    // floating bar that appears when something is selected
    ui.bulk = node('div', 'dc-bulk');
    ui.bulk.hidden = true;
    ui.bulk.innerHTML = '<div class="dc-bulk-in" role="region" aria-label="Selected creators"><span class="dc-bulk-count"></span>' +
      '<button type="button" class="dc-bulk-link" data-a="all">Select all shown</button>' +
      '<button type="button" class="dc-bulk-link" data-a="none">Clear</button>' +
      '<button type="button" class="btn small dc-bulk-del">Delete</button></div>';
    ui.bulkCount = ui.bulk.querySelector('.dc-bulk-count');
    ui.bulk.querySelector('[data-a=none]').addEventListener('click', () => { selected.clear(); draw(); syncBulk(); });
    ui.bulk.querySelector('[data-a=all]').addEventListener('click', () => { visible().slice(0, shown).forEach((c) => selected.add(c.id)); draw(); syncBulk(); });
    ui.bulk.querySelector('.dc-bulk-del').addEventListener('click', () => remove(Array.from(selected)));
    view.appendChild(ui.bulk);
    syncBulk();
    draw();
  }

  async function load(keepScroll) {
    const y = window.scrollY;
    try {
      data = await api('/api/admin/discovered');
      setBadge(data.unseen || 0);
      for (const id of Array.from(selected)) if (!data.items.some((c) => c.id === id)) selected.delete(id);
      page();
      if (keepScroll) window.scrollTo(0, y);
    } catch (e) {
      H.view.innerHTML = '';
      const n = node('div', 'notice');
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
