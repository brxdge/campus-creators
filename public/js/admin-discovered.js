// ============================================================
// Admin > Creators > Discovered creators
// What the separate Creator Search app sent to this website, as a clean list
// (or cards) you can scan, open and act on:
//   - a row per creator: photo, name, @handle, followers, email, status
//   - click a creator for the full picture in a side panel: bio, stats, links,
//     email (found in the bio, sent by Creator Search, or typed in), outreach
//   - "Email" opens a ready-made, editable draft in your own mail (Gmail or
//     the Mail app); the website never sends anything by itself, it only
//     remembers who has been emailed
// Private: only shown here, never on the public site.
// Loaded after admin.js, which calls render() and badge() through
// window.CCDiscovered.
// ============================================================
(function () {
  'use strict';
  const PAGE = 30;
  const VIEW_KEY = 'cc-dc-view';
  const MAILER_KEY = 'cc-dc-mailer';
  let data = null;                 // last response from /api/admin/discovered
  let filter = 'all';              // all | new | email | emailed
  let collection = '';             // '' = every collection
  let sort = 'newest';             // newest | followers | name
  let query = '';
  let shown = PAGE;
  let mode = 'list';               // list | cards
  let H = null;
  let ui = {};                     // the elements of the current screen
  let openId = null;               // creator shown in the side panel
  let composer = null;             // state of the email window while it is open
  let panelReturn = null;          // where focus goes when the side panel closes
  const selected = new Set();

  try { if (localStorage.getItem(VIEW_KEY) === 'cards') mode = 'cards'; } catch (e) { /* private mode: default view */ }

  function api(url, body, method) {
    const opt = { method: method || (body ? 'POST' : 'GET'), credentials: 'same-origin' };
    if (body) { opt.headers = { 'Content-Type': 'application/json' }; opt.body = JSON.stringify(body); }
    return H.api(url, opt);
  }

  // ---------- small helpers ----------
  const svg = (inner, w, extra) => '<svg viewBox="0 0 24 24" width="' + (w || 16) + '" height="' + (w || 16) + '" fill="none" stroke="currentColor" stroke-width="' + (extra || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + '</svg>';
  const ICON = {
    mail: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6.5L20.5 7"/>', 15),
    out: svg('<path d="M7 17 17 7M8 7h9v9"/>', 14, 2.2),
    link: svg('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>', 15),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>', 16),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 14, 3),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>', 18, 2.2),
    cards: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'),
    list: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    tiktok: svg('<path d="M14 4v10.2a3.2 3.2 0 1 1-3.2-3.2"/><path d="M14 4c.4 2.3 1.9 3.8 4.2 4"/>', 16),
    copy: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>', 15),
    spark: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.7 5.5-4.7s4.9 1.7 5.5 4.7"/><path d="M17 8.5v5M14.5 11h5"/>', 26, 1.8),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', 16),
  };
  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
  function short(n) {
    if (!isNum(n)) return '–';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  }
  const full = (n) => (isNum(n) ? n.toLocaleString() : '');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayOnly(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const y = d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear();
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + y;
  }
  const whenLong = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  function ago(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    const d = Math.round(s / 86400);
    return d === 1 ? 'yesterday' : d + ' days ago';
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
  function btn(cls, html, label) {
    const b = node('button', cls);
    b.type = 'button';
    if (html != null) b.innerHTML = html;
    if (label) b.setAttribute('aria-label', label);
    return b;
  }
  function link(href, html, cls) {
    const a = node('a', cls);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer nofollow';
    if (html != null) a.innerHTML = html;
    return a;
  }
  const barePath = (href) => String(href).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '');
  const byId = (id) => (data ? data.items.find((c) => c.id === id) : null);
  const displayName = (c) => c.nickname || c.handle;
  async function copyText(text, done) {
    try { await navigator.clipboard.writeText(text); H.toast(done); }
    catch (e) { H.toast('Could not copy. Select the text by hand.', true); }
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

  // ---------- the first name to greet someone with ----------
  // Display names are messy ("sasha | ugc creator 📍toronto", "TFA", "fashiondesignertoronto"),
  // so only a short, normal-looking first word is used; anything else becomes "there".
  const NOT_A_NAME = new Set(['the', 'official', 'ugc', 'creator', 'creators', 'toronto', 'canada', 'canadian', 'ontario', 'fashion', 'beauty',
    'fitness', 'food', 'travel', 'lifestyle', 'content', 'studio', 'shop', 'store', 'academy', 'school', 'club', 'team', 'media', 'agency', 'blog', 'daily',
    'vlogs', 'vlog', 'life', 'by', 'and', 'for', 'with', 'my', 'new', 'best']);
  function firstName(c) {
    const parts = String(c.nickname || '').normalize('NFKC').split(/[\s|·•,/\\\-–—:;()[\]{}@_.&+~*#"“”]+/u).filter(Boolean);
    for (const raw of parts) {
      const w = raw.replace(/[^\p{L}'’]/gu, '');
      if (w.length < 2 || w.length > 14) continue;
      if (/^\p{Lu}+$/u.test(w)) continue;                      // SHOUTING: a brand or an acronym
      if (NOT_A_NAME.has(w.toLowerCase())) continue;
      return /^\p{Ll}/u.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    }
    return 'there';
  }
  function fill(text, c) {
    return String(text || '').replace(/\{name\}/gi, firstName(c)).replace(/\{handle\}/gi, c.handle).replace(/\{nickname\}/gi, displayName(c));
  }

  // ---------- picture ----------
  function avatar(c, size) {
    const a = node('div', 'dc-ava dc-ava-' + (size || 'm'));
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

  // ---------- actions ----------
  async function remove(ids) {
    if (!ids.length) return;
    const label = ids.length === 1 ? 'this creator' : ids.length + ' creators';
    if (!confirm('Delete ' + label + '? If Creator Search sends them again they will come back as new.')) return;
    try {
      if (ids.length === 1) await api('/api/admin/discovered/' + ids[0], null, 'DELETE');
      else await api('/api/admin/discovered/delete', { ids });
      ids.forEach((id) => selected.delete(id));
      if (ids.includes(openId)) closePanel(true);
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
      refreshRow(c);
      if (ui.seenBtn && ui.seenBtn.isConnected && openId === c.id) ui.seenBtn.firstChild.textContent = c.seen ? 'Mark as new' : 'Mark as seen';
      return true;
    } catch (e) { H.toast(e.message, true); return false; }
  }
  async function setContacted(list, on) {
    try {
      const r = await api('/api/admin/discovered/contacted', { ids: list.map((c) => c.id), contacted: on });
      list.forEach((c) => {
        if (on) { c.contactedAt = r.contactedAt; c.contactedCount = (c.contactedCount || 0) + 1; c.seen = true; }
        else { c.contactedAt = ''; c.contactedCount = 0; }
        refreshRow(c);
      });
      setBadge(r.unseen);
      syncCounts();
      if (openId && list.some((c) => c.id === openId)) renderPanel();
      return true;
    } catch (e) { H.toast(e.message, true); return false; }
  }
  async function saveEmail(c, value) {
    try {
      const r = await api('/api/admin/discovered/' + c.id + '/email', { email: value });
      Object.assign(c, r.item);
      refreshRow(c);
      syncCounts();
      return true;
    } catch (e) { H.toast(e.message, true); return false; }
  }
  function pick(c, on) {
    if (on) selected.add(c.id); else selected.delete(c.id);
    syncBulk();
  }

  // ---------- pieces shared by rows, cards and the side panel ----------
  function checkbox(c, el) {
    const lab = node('label', 'dc-check');
    lab.title = 'Select';
    const box = node('input');
    box.type = 'checkbox';
    box.setAttribute('aria-label', 'Select ' + displayName(c));
    box.checked = selected.has(c.id);
    box.addEventListener('change', () => { el.classList.toggle('is-picked', box.checked); pick(c, box.checked); });
    lab.appendChild(box);
    return lab;
  }
  function emailChip(c) {
    if (!c.email) return node('span', 'dc-mail dc-mail-none', 'No email');
    const s = node('span', 'dc-mail');
    s.innerHTML = ICON.mail + '<span></span>';
    s.lastChild.textContent = c.email;
    s.title = c.email + (c.emailSource === 'bio' ? '\nFound in their bio' : c.emailSource === 'added' ? '\nAdded by your team' : '\nSent by Creator Search');
    return s;
  }
  function statusChip(c) {
    if (!c.contactedAt) return null;
    const s = node('span', 'dc-st', 'Emailed ' + dayOnly(c.contactedAt));
    s.title = 'Emailed ' + whenLong(c.contactedAt) + (c.contactedCount > 1 ? ' (' + c.contactedCount + ' times)' : '');
    return s;
  }
  function emailButton(c, small) {
    if (c.email) {
      const b = btn('btn dc-emailbtn' + (small ? ' small' : ''), ICON.mail + '<span>Email</span>');
      b.title = 'Write to ' + c.email;
      b.setAttribute('aria-label', 'Email ' + displayName(c));
      b.addEventListener('click', (e) => { e.stopPropagation(); openComposer([c], 0); });
      return b;
    }
    const b = btn('dc-addmail', '<span>Add email</span>');
    b.title = 'No email found. Add one if you have it.';
    b.addEventListener('click', (e) => { e.stopPropagation(); openPanel(c.id, { focusEmail: true }); });
    return b;
  }
  function tiktokButton(c) {
    const a = link(c.url, ICON.tiktok, 'dc-iconbtn');
    a.setAttribute('aria-label', 'Open ' + displayName(c) + ' on TikTok');
    a.title = 'Open on TikTok';
    a.addEventListener('click', (e) => { e.stopPropagation(); setSeen(c, true); });
    return a;
  }
  function openArea(c) {
    // the name is the one real button on a row, so the keyboard can open it
    const b = node('button', 'dc-open');
    b.type = 'button';
    const n = node('span', 'dc-name', displayName(c));
    n.dir = 'auto';
    b.appendChild(n);
    b.appendChild(node('span', 'dc-newpill', 'New'));
    b.addEventListener('click', (e) => { e.stopPropagation(); openPanel(c.id); });
    return b;
  }
  const interactive = (t) => !!(t.closest && t.closest('a,button,label,input,select,textarea'));

  // ---------- one creator, as a row ----------
  function row(c) {
    const el = node('article', 'dc-row' + (c.seen ? '' : ' is-new') + (selected.has(c.id) ? ' is-picked' : '') + (c.id === openId ? ' is-open' : ''));
    el.dataset.id = c.id;
    el.appendChild(checkbox(c, el));
    const av = avatar(c, 'm');
    av.classList.add('dc-ava-cell');
    el.appendChild(av);

    const who = node('div', 'dc-who');
    who.appendChild(openArea(c));
    who.appendChild(node('span', 'dc-handle', '@' + c.handle));
    el.appendChild(who);

    const sub = node('div', 'dc-sub');
    const fol = node('span', 'dc-fol');
    fol.innerHTML = '<b></b><span> followers</span>';
    fol.firstChild.textContent = short(c.followers);
    if (isNum(c.followers)) fol.title = full(c.followers) + ' followers';
    sub.appendChild(fol);
    sub.appendChild(emailChip(c));
    const st = statusChip(c);
    sub.appendChild(st || node('span', 'dc-st dc-st-empty'));
    el.appendChild(sub);

    const acts = node('div', 'dc-acts');
    acts.append(emailButton(c, true), tiktokButton(c));
    el.appendChild(acts);

    el.addEventListener('click', (e) => { if (!interactive(e.target)) openPanel(c.id); });
    return el;
  }

  // ---------- one creator, as a card ----------
  function card(c) {
    const el = node('article', 'dc-card' + (c.seen ? '' : ' is-new') + (selected.has(c.id) ? ' is-picked' : '') + (c.id === openId ? ' is-open' : ''));
    el.dataset.id = c.id;
    const top = node('div', 'dc-card-top');
    top.appendChild(avatar(c, 'l'));
    const who = node('div', 'dc-who');
    who.appendChild(openArea(c));
    who.appendChild(node('span', 'dc-handle', '@' + c.handle));
    const meta = node('span', 'dc-cardmeta', [isNum(c.followers) ? short(c.followers) + ' followers' : '', isNum(c.videos) ? short(c.videos) + ' videos' : ''].filter(Boolean).join(' · '));
    who.appendChild(meta);
    top.appendChild(who);
    top.appendChild(checkbox(c, el));
    el.appendChild(top);

    const bio = node('p', c.bio ? 'dc-bio' : 'dc-bio dc-bio-empty', c.bio || 'No bio');
    bio.dir = 'auto';
    el.appendChild(bio);

    const mailRow = node('div', 'dc-cardmail');
    mailRow.appendChild(emailChip(c));
    const st = statusChip(c);
    if (st) mailRow.appendChild(st);
    el.appendChild(mailRow);

    const acts = node('div', 'dc-acts');
    acts.append(emailButton(c, true), tiktokButton(c));
    el.appendChild(acts);

    el.addEventListener('click', (e) => { if (!interactive(e.target)) openPanel(c.id); });
    return el;
  }

  const build = (c) => (mode === 'cards' ? card(c) : row(c));
  function refreshRow(c) {
    if (!ui.list) return;
    const old = ui.list.querySelector('[data-id="' + c.id + '"]');
    if (!old) return;
    const fresh = build(c);
    const hadFocus = old.contains(document.activeElement);
    old.replaceWith(fresh);
    if (hadFocus) { const o = fresh.querySelector('.dc-open'); if (o) o.focus(); }
  }

  // ---------- the side panel ----------
  function ensurePanel() {
    if (ui.panel && ui.panel.isConnected) return;
    ui.scrim = node('div', 'dc-scrim');
    ui.scrim.addEventListener('click', () => closePanel());
    ui.panel = node('aside', 'dc-panel');
    ui.panel.setAttribute('role', 'dialog');
    ui.panel.setAttribute('aria-label', 'Creator details');
    ui.panel.tabIndex = -1;
    H.view.append(ui.scrim, ui.panel);
  }
  function openPanel(id, opts) {
    const c = byId(id);
    if (!c) return;
    ensurePanel();
    const same = openId === id && ui.panel.classList.contains('open');
    if (!same && !ui.panel.classList.contains('open')) {
      // remember where to come back to; the row itself gets rebuilt, so note which creator and which control
      const a = document.activeElement;
      const holder = a && a.closest ? a.closest('[data-id]') : null;
      panelReturn = holder ? { id: holder.dataset.id, cls: String(a.className || '').split(' ')[0] || 'dc-open' } : { el: a };
    }
    const prev = openId;
    openId = id;
    renderPanel(opts);
    ui.panel.classList.add('open');
    ui.scrim.classList.add('open');
    if (prev && prev !== id) { const p = byId(prev); if (p) refreshRow(p); }
    refreshRow(c);
    if (!c.seen) setSeen(c, true);
    if (!same && !(opts && opts.focusEmail)) { const x = ui.panel.querySelector('.dc-panel-x'); if (x) x.focus({ preventScroll: true }); }
  }
  function closePanel(silent) {
    if (!ui.panel) return;
    const id = openId;
    openId = null;
    ui.panel.classList.remove('open');
    ui.scrim.classList.remove('open');
    const c = id ? byId(id) : null;
    if (c) refreshRow(c);
    if (!silent && panelReturn) {
      let t = panelReturn.el || null;
      if (panelReturn.id && ui.list) t = ui.list.querySelector('[data-id="' + panelReturn.id + '"] .' + panelReturn.cls) || ui.list.querySelector('[data-id="' + panelReturn.id + '"] .dc-open');
      if (t && t.isConnected) { try { t.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
    }
    panelReturn = null;
  }

  function panelEmailBlock(c, opts) {
    const box = node('section', 'dc-sec');
    box.appendChild(node('h4', null, 'Email'));
    const editor = (initial) => {
      const f = node('form', 'dc-emailform');
      const inp = node('input', 'dc-input');
      inp.type = 'email';
      inp.placeholder = 'name@example.com';
      inp.value = initial || '';
      inp.autocomplete = 'off';
      inp.setAttribute('aria-label', 'Email address');
      const save = node('button', 'btn small', 'Save');
      save.type = 'submit';
      f.append(inp, save);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = inp.value.trim();
        if (!v && !c.email) return;
        save.disabled = true;
        const ok = await saveEmail(c, v);
        save.disabled = false;
        if (ok) { H.toast(v ? 'Email saved.' : 'Email removed.'); renderPanel(); }
      });
      return { f, inp };
    };
    if (c.email) {
      const line = node('div', 'dc-emailline');
      const addr = node('strong', 'dc-addr', c.email);
      line.appendChild(addr);
      line.appendChild(node('span', 'dc-src', c.emailSource === 'bio' ? 'found in their bio' : c.emailSource === 'added' ? 'added by your team' : 'sent by Creator Search'));
      box.appendChild(line);
      const row = node('div', 'dc-btnrow');
      const send = emailButton(c, true);
      const copy = btn('btn ghost small', ICON.copy + '<span>Copy</span>');
      copy.addEventListener('click', () => copyText(c.email, 'Copied ' + c.email));
      const change = btn('dc-textbtn', '<span>Change</span>');
      row.append(send, copy, change);
      box.appendChild(row);
      const { f, inp } = editor(c.email);
      f.hidden = true;
      box.appendChild(f);
      change.addEventListener('click', () => { f.hidden = !f.hidden; if (!f.hidden) { inp.focus(); inp.select(); } });
    } else {
      box.appendChild(node('p', 'dc-muted', 'No email address was found in their bio, and Creator Search didn’t send one. If you find one on their TikTok or bio link, add it here.'));
      const { f, inp } = editor('');
      box.appendChild(f);
      if (opts && opts.focusEmail) setTimeout(() => inp.focus(), 60);
    }
    return box;
  }

  function renderPanel(opts) {
    const c = byId(openId);
    const p = ui.panel;
    if (!c) { closePanel(true); return; }
    const keep = p.scrollTop;
    const was = document.activeElement && p.contains(document.activeElement) ? document.activeElement : null;
    const wasKey = was ? was.tagName + '|' + was.className + '|' + (was.type || '') + '|' + was.textContent.trim() : '';
    p.innerHTML = '';

    const head = node('header', 'dc-panel-head');
    const x = btn('dc-panel-x', ICON.close, 'Close');
    x.addEventListener('click', () => closePanel());
    head.appendChild(x);
    const id = node('div', 'dc-panel-id');
    id.appendChild(avatar(c, 'xl'));
    const nm = node('div', 'dc-panel-nm');
    const h = node('h3', null, displayName(c));
    h.dir = 'auto';
    nm.appendChild(h);
    const hb = btn('dc-handle dc-handle-btn', '@' + c.handle + ' ' + ICON.copy);
    hb.title = 'Copy @' + c.handle;
    hb.addEventListener('click', () => copyText('@' + c.handle, 'Copied @' + c.handle));
    nm.appendChild(hb);
    const chips = [];
    if (c.verified) chips.push(['Verified', 'accent']);
    if (c.business) chips.push([c.businessCategory ? 'Business · ' + c.businessCategory : 'Business account', '']);
    if (c.seller) chips.push(['TikTok Shop', '']);
    if (c.private) chips.push(['Private account', '']);
    if (chips.length) {
      const cr = node('div', 'dc-chips');
      chips.forEach(([t, k]) => cr.appendChild(node('span', 'dc-chip' + (k ? ' dc-chip-' + k : ''), t)));
      nm.appendChild(cr);
    }
    id.appendChild(nm);
    head.appendChild(id);

    const quick = node('div', 'dc-btnrow');
    const tt = link(c.url, ICON.tiktok + '<span>TikTok</span>' + ICON.out, 'btn ghost small');
    quick.appendChild(tt);
    if (c.bioLink && c.bioLink.href) {
      const b = link(c.bioLink.href, ICON.link + '<span></span>' + ICON.out, 'btn ghost small dc-biolink');
      b.querySelector('span').textContent = barePath(c.bioLink.text || c.bioLink.href);
      b.title = c.bioLink.href;
      quick.appendChild(b);
    }
    head.appendChild(quick);
    p.appendChild(head);

    const body = node('div', 'dc-panel-body');
    const stats = node('div', 'dc-stats');
    [['Followers', c.followers], ['Videos', c.videos], ['Likes', c.likes], ['Following', c.following]].forEach(([label, n]) => {
      const s = node('div', 'dc-stat');
      const num = node('strong', null, short(n));
      if (isNum(n)) num.title = full(n);
      s.append(num, node('span', null, label));
      stats.appendChild(s);
    });
    body.appendChild(stats);

    body.appendChild(panelEmailBlock(c, opts));

    const out = node('section', 'dc-sec');
    out.appendChild(node('h4', null, 'Outreach'));
    if (c.contactedAt) {
      out.appendChild(node('p', 'dc-sentline', 'Emailed ' + whenLong(c.contactedAt) + (c.contactedCount > 1 ? ' · ' + c.contactedCount + ' times' : '')));
      const undo = btn('dc-textbtn', '<span>Not emailed after all</span>');
      undo.addEventListener('click', async () => { if (await setContacted([c], false)) H.toast('Back to not emailed.'); });
      out.appendChild(undo);
    } else {
      out.appendChild(node('p', 'dc-muted', 'Not emailed yet.'));
      const mark = btn('dc-textbtn', '<span>I already emailed them</span>');
      mark.title = 'Use this if you wrote to them outside the website';
      mark.addEventListener('click', async () => { if (await setContacted([c], true)) H.toast('Marked as emailed.'); });
      out.appendChild(mark);
    }
    body.appendChild(out);

    const bioSec = node('section', 'dc-sec');
    bioSec.appendChild(node('h4', null, 'Bio'));
    const bio = node('p', c.bio ? 'dc-bio-full' : 'dc-muted', c.bio || 'No bio.');
    bio.dir = 'auto';
    bioSec.appendChild(bio);
    body.appendChild(bioSec);

    const info = node('section', 'dc-sec');
    info.appendChild(node('h4', null, 'Details'));
    const dl = node('dl', 'dc-facts');
    const add = (k, v) => { if (v == null || v === '') return; dl.append(node('dt', null, k), node('dd', null, v)); };
    if (c.collections && c.collections.length) add('Saved in', c.collections.join(', '));
    add('On TikTok since', c.tiktokSince ? dayOnly(c.tiktokSince) : '');
    add('Arrived', whenLong(c.receivedAt));
    if (c.updatedAt && c.updatedAt !== c.receivedAt) add('Last updated', whenLong(c.updatedAt) + (c.deliveries > 1 ? ' (sent ' + c.deliveries + ' times)' : ''));
    if (!c.avatar) add('Picture', c.photoError ? 'Not saved: ' + c.photoError : 'No picture link came with this creator.');
    info.appendChild(dl);
    body.appendChild(info);

    const foot = node('div', 'dc-panel-foot');
    const seen = btn('dc-textbtn', '<span>' + (c.seen ? 'Mark as new' : 'Mark as seen') + '</span>');
    ui.seenBtn = seen;
    seen.addEventListener('click', () => setSeen(c, !c.seen));
    const del = btn('dc-textbtn dc-danger', ICON.trash + '<span>Delete</span>');
    del.addEventListener('click', () => remove([c.id]));
    foot.append(seen, del);
    body.appendChild(foot);
    p.appendChild(body);
    p.scrollTop = keep;
    if (was) {
      const same = Array.from(p.querySelectorAll('button,a,input')).find((e) => e.tagName + '|' + e.className + '|' + (e.type || '') + '|' + e.textContent.trim() === wasKey);
      (same || p).focus({ preventScroll: true });
    }
  }

  // ---------- the email window ----------
  function mailLinks(to, subject, body) {
    const enc = encodeURIComponent;
    const crlf = body.replace(/\r?\n/g, '\r\n');
    return {
      gmail: 'https://mail.google.com/mail/?view=cm&fs=1&to=' + enc(to) + '&su=' + enc(subject) + '&body=' + enc(body),
      mail: 'mailto:' + to + '?subject=' + enc(subject) + '&body=' + enc(crlf),
    };
  }
  function preferredMailer() { try { return localStorage.getItem(MAILER_KEY) === 'mail' ? 'mail' : 'gmail'; } catch (e) { return 'gmail'; } }

  function openComposer(list, start) {
    const queue = list.filter((c) => c.email);
    if (!queue.length) { H.toast('None of these creators has an email address yet.', true); return; }
    closeComposer(true);
    composer = { queue, i: Math.min(start || 0, queue.length - 1), opened: false, back: document.activeElement };
    const modal = node('div', 'dc-modal');
    const dlg = node('div', 'dc-dialog');
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
    dlg.setAttribute('aria-labelledby', 'dcMailTitle');
    dlg.tabIndex = -1;
    modal.appendChild(dlg);
    composer.modal = modal;
    composer.dlg = dlg;
    let pressedOnBackdrop = false;      // a drag that starts inside the message and ends outside must not close it
    modal.addEventListener('mousedown', (e) => { pressedOnBackdrop = e.target === modal; });
    modal.addEventListener('click', (e) => { const was = pressedOnBackdrop; pressedOnBackdrop = false; if (e.target === modal && was) closeComposer(); });
    H.view.appendChild(modal);
    paintComposer(true);
  }
  function closeComposer(silent) {
    if (!composer) return;
    const back = composer.back;
    composer.modal.remove();
    composer = null;
    if (!silent && back && back.isConnected) { try { back.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  }

  // put the starting message into the boxes for the creator now showing
  function paintComposer(first) {
    const cm = composer;
    const c = cm.queue[cm.i];
    const tpl = data.emailTemplate || { subject: '', body: '' };
    cm.opened = false;
    const d = cm.dlg;
    d.innerHTML = '';

    const head = node('header', 'dc-dlg-head');
    const t = node('div');
    const h = node('h3', null, 'Email ' + displayName(c));
    h.id = 'dcMailTitle';
    h.dir = 'auto';
    t.appendChild(h);
    t.appendChild(node('p', 'dc-muted', cm.queue.length > 1 ? 'Creator ' + (cm.i + 1) + ' of ' + cm.queue.length + ' · @' + c.handle : '@' + c.handle));
    head.appendChild(t);
    const x = btn('dc-panel-x', ICON.close, 'Close');
    x.addEventListener('click', () => closeComposer());
    head.appendChild(x);
    d.appendChild(head);

    const to = node('div', 'dc-field');
    to.appendChild(node('label', null, 'To'));
    const toRow = node('div', 'dc-to');
    toRow.appendChild(node('strong', null, c.email));
    const edit = btn('dc-textbtn', '<span>Wrong address?</span>');
    edit.addEventListener('click', () => { closeComposer(true); openPanel(c.id, { focusEmail: true }); });
    toRow.appendChild(edit);
    to.appendChild(toRow);
    d.appendChild(to);

    const fs = node('div', 'dc-field');
    const sl = node('label', null, 'Subject');
    sl.htmlFor = 'dcMailSubject';
    const subject = node('input', 'dc-input');
    subject.id = 'dcMailSubject';
    subject.type = 'text';
    subject.maxLength = 200;
    subject.value = fill(tpl.subject, c);
    fs.append(sl, subject);
    d.appendChild(fs);

    const fb = node('div', 'dc-field');
    const bl = node('label', null, 'Message');
    bl.htmlFor = 'dcMailBody';
    const body = node('textarea', 'dc-input dc-textarea');
    body.id = 'dcMailBody';
    body.rows = 12;
    body.value = fill(tpl.body, c);
    fb.append(bl, body);
    d.appendChild(fb);

    const hint = node('p', 'dc-hint');
    d.appendChild(hint);
    const checkHint = () => {
      const msgs = [];
      if (/\{[a-z ]{1,20}\}/i.test(subject.value + body.value)) msgs.push('There’s still a {placeholder} in the message. Replace it before you send.');
      if (body.value.length > 1700) msgs.push('This is long. If your mail app cuts it off, use “Copy message” and paste it in.');
      if (!subject.value.trim()) msgs.push('The subject is empty.');
      hint.textContent = msgs.join(' ');
      hint.hidden = !msgs.length;
    };
    subject.addEventListener('input', checkHint);
    body.addEventListener('input', checkHint);
    checkHint();

    const links = () => mailLinks(c.email, subject.value, body.value);
    const afterOpen = () => {
      cm.opened = true;
      paintOpened();
    };
    const mk = (which, label, primary) => {
      const a = node('a', 'btn ' + (primary ? '' : 'ghost ') + 'small dc-open-mail');
      a.textContent = label;
      if (which === 'gmail') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }   // the Mail app link opens the app itself, no tab
      const refresh = () => { a.href = links()[which]; };
      refresh();
      subject.addEventListener('input', refresh);
      body.addEventListener('input', refresh);
      a.addEventListener('click', () => {
        refresh();
        try { localStorage.setItem(MAILER_KEY, which); } catch (e) { /* not remembered: fine */ }
        setTimeout(afterOpen, 50);
      });
      return a;
    };
    const pref = preferredMailer();
    const actions = node('div', 'dc-btnrow dc-dlg-actions');
    const gm = mk('gmail', 'Open in Gmail', pref === 'gmail');
    const ml = mk('mail', 'Open in Mail app', pref === 'mail');
    actions.append(pref === 'gmail' ? gm : ml, pref === 'gmail' ? ml : gm);
    const copy = btn('dc-textbtn', ICON.copy + '<span>Copy message</span>');
    copy.addEventListener('click', () => copyText('Subject: ' + subject.value + '\n\n' + body.value, 'Copied the message.'));
    actions.appendChild(copy);
    d.appendChild(actions);

    cm.paintOpened = () => {};
    const status = node('div', 'dc-sentbar');
    status.hidden = true;
    d.appendChild(status);
    function paintOpened() {
      status.hidden = false;
      status.innerHTML = '';
      status.appendChild(node('p', null, 'Your draft should be open now (in a new tab for Gmail, or in your Mail app). Once you’ve sent it, mark this creator as emailed so nobody writes to them twice.'));
      const row = node('div', 'dc-btnrow');
      const yes = btn('btn small', ICON.check + '<span>I sent it</span>');
      yes.addEventListener('click', async () => {
        yes.disabled = true;
        if (await setContacted([c], true)) { H.toast('Marked as emailed.'); next(true); } else yes.disabled = false;
      });
      const no = btn('dc-textbtn', '<span>Not yet</span>');
      no.addEventListener('click', () => { status.hidden = true; });
      row.append(yes, no);
      status.appendChild(row);
      try { status.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* old browser: the bar is just further down */ }
    }
    const next = (afterMark) => {
      if (cm.i < cm.queue.length - 1) { cm.i += 1; paintComposer(); } else { closeComposer(); if (afterMark) H.toast('That was the last one.'); }
    };

    const foot = node('footer', 'dc-dlg-foot');
    const tools = node('div', 'dc-tplbtns');
    const save = btn('dc-textbtn', '<span>Save as the default message</span>');
    save.title = 'Everyone who uses this admin will start from this message. The first name and @handle are filled in automatically.';
    save.addEventListener('click', async () => {
      const tp = toTemplate(subject.value, body.value, c);
      try {
        const r = await api('/api/admin/discovered/template', tp);
        data.emailTemplate = r.emailTemplate;
        H.toast('Saved. New drafts start from this message.');
      } catch (e) { H.toast(e.message, true); }
    });
    tools.appendChild(save);
    if (tpl.custom) {
      const reset = btn('dc-textbtn', '<span>Use the built-in message</span>');
      reset.addEventListener('click', async () => {
        try {
          const r = await api('/api/admin/discovered/template', { subject: '', body: '' });
          data.emailTemplate = r.emailTemplate;
          H.toast('Back to the built-in message.');
          paintComposer();
        } catch (e) { H.toast(e.message, true); }
      });
      tools.appendChild(reset);
    }
    foot.appendChild(tools);
    if (cm.queue.length > 1) {
      const nav = node('div', 'dc-btnrow');
      const back = btn('dc-textbtn', '<span>Back</span>');
      back.disabled = cm.i === 0;
      back.addEventListener('click', () => { cm.i -= 1; paintComposer(); });
      const skip = btn('dc-textbtn', '<span>' + (cm.i < cm.queue.length - 1 ? 'Skip' : 'Finish') + '</span>');
      skip.addEventListener('click', () => next(false));
      nav.append(back, skip);
      foot.appendChild(nav);
    }
    d.appendChild(foot);
    if (first) setTimeout(() => { if (composer === cm) body.focus({ preventScroll: true }); body.setSelectionRange(0, 0); }, 30);
  }

  // turn a finished message back into a template: this creator's first name and handle become placeholders
  function toTemplate(subject, body, c) {
    const handle = c.handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sub = (t) => String(t).replace(new RegExp('@' + handle + '\\b', 'gi'), '@{handle}').replace(new RegExp('\\b' + handle + '\\b', 'gi'), '{handle}');
    let b = sub(body);
    const fn = firstName(c);
    b = b.replace(/^(\s*(?:Hi|Hey|Hello|Hiya|Dear)\s+)([^\n,!]+?)([,!]?\s*)(\n|$)/i, (m, a, nm, z, nl) => (nm.trim() === fn ? a + '{name}' + z + nl : m));
    return { subject: sub(subject), body: b };
  }

  // ---------- the page ----------
  function visible() {
    const q = query.trim().toLowerCase();
    let rows = data.items.filter((c) =>
      (filter === 'all' || (filter === 'new' && !c.seen) || (filter === 'email' && c.email) || (filter === 'emailed' && c.contactedAt)) &&
      (!collection || (c.collections || []).includes(collection)) &&
      (!q || (c.handle + ' ' + (c.nickname || '') + ' ' + (c.bio || '') + ' ' + (c.email || '') + ' ' + (c.collections || []).join(' ') + ' ' + (c.businessCategory || '')).toLowerCase().includes(q)));
    if (sort === 'followers') rows = rows.slice().sort((a, b) => (b.followers || 0) - (a.followers || 0));
    else if (sort === 'name') rows = rows.slice().sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' }));
    return rows;
  }
  function counts() {
    const it = data.items;
    return { all: it.length, new: it.filter((c) => !c.seen).length, email: it.filter((c) => c.email).length, emailed: it.filter((c) => c.contactedAt).length };
  }
  function syncCounts() {
    if (!ui.tabs) return;
    const n = counts();
    data.unseen = n.new;
    ui.tabs.querySelectorAll('[data-f]').forEach((b) => { b.querySelector('span').textContent = n[b.dataset.f]; });
    ui.seenAll.hidden = !n.new;
    setBadge(n.new);
    syncBulk();
  }
  function syncBulk() {
    if (!ui.bulk) return;
    const n = selected.size;
    ui.bulk.hidden = !n;
    ui.bulkCount.textContent = n + (n === 1 ? ' selected' : ' selected');
    const withMail = data.items.filter((c) => selected.has(c.id) && c.email);
    ui.bulkMail.hidden = !n;
    ui.bulkMail.disabled = !withMail.length;
    ui.bulkMail.innerHTML = ICON.mail + '<span>' + (withMail.length ? 'Email ' + withMail.length + (withMail.length === 1 ? ' creator' : ' creators') : 'No email addresses') + '</span>';
    ui.bulkMail.title = withMail.length < n ? (n - withMail.length) + ' of the selected creators have no email address and will be skipped.' : '';
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
    const last = (data.deliveries || []).find((d) => !d.test) || (data.deliveries || [])[0];
    const p = node('p', 'dc-last');
    if (!last) {
      p.textContent = 'Connected. Nothing has arrived yet. In Creator Search, open Automations and choose Run now.';
    } else if (last.test) {
      p.textContent = 'Connected. Last message from Creator Search was a test, ' + ago(last.at) + '.';
    } else if (!last.received) {
      p.textContent = 'Connected. Creator Search last checked in ' + ago(last.at) + ' and had nothing new to send.';
    } else {
      const bits = [last.received + (last.received === 1 ? ' creator' : ' creators')];
      if (last.added) bits.push(last.added + ' new');
      if (last.updated) bits.push(last.updated + ' updated');
      p.textContent = 'Connected. Last delivery ' + ago(last.at) + ': ' + bits.join(', ') + (last.collection ? ' from “' + last.collection + '”' : '') + '.';
    }
    ui.status.appendChild(p);
  }

  // when most creators have no picture, say why and what to do
  function pictureNote() {
    ui.note.innerHTML = '';
    ui.note.hidden = true;
    const total = data.items.length;
    if (!total) return;
    const withPic = data.items.filter((c) => c.avatar).length;
    if (withPic >= total / 2) return;
    const ds = (data.deliveries || []).filter((d) => !d.test && d.received > 0);
    const last = ds[0];
    let why = 'Pictures haven’t come through from Creator Search yet, so initials are shown instead.';
    if (last && typeof last.photoLinks === 'number') {
      if (last.photoLinks === 0) why = 'The last delivery had no picture links in it, so initials are shown instead.';
      else if (!last.photosSaved && last.photosFailed) why = 'Picture links did arrive, but the website couldn’t save them' + (last.photoError ? ': ' + last.photoError + '.' : '.');
      else if (last.photosSaved < last.photoLinks && !last.photosFailed) why = 'Pictures are still being saved. Refresh in a moment.';
    }
    ui.note.hidden = false;
    const top = node('div', 'dc-note-top');
    top.innerHTML = ICON.info;
    const msg = node('p', null, why);
    top.appendChild(msg);
    const more = btn('dc-textbtn', '<span>What to do</span>');
    more.setAttribute('aria-expanded', 'false');
    top.appendChild(more);
    ui.note.appendChild(top);
    const det = node('div', 'dc-note-more');
    det.hidden = true;
    det.innerHTML = '<p>The website saves its own copy of each creator’s picture when they arrive, but only if Creator Search includes the picture link with them, in a field called <code>avatar</code>.</p>' +
      '<p>TikTok picture links stop working after a day or so, so Creator Search has to send the link at the moment it sends the creator. A link it saved earlier will no longer work.</p>' +
      '<p>Creators already here get their pictures the next time Creator Search sends them again.</p>';
    ui.note.appendChild(det);
    more.addEventListener('click', () => {
      det.hidden = !det.hidden;
      more.setAttribute('aria-expanded', det.hidden ? 'false' : 'true');
    });
  }

  function draw() {
    const rows = visible();
    ui.list.innerHTML = '';
    ui.list.className = 'dc-list dc-list-' + mode;
    ui.list.removeAttribute('role');
    ui.listWrap.classList.toggle('dc-panelbox', mode === 'list' && rows.length > 0);
    if (!rows.length) {
      const empty = node('div', 'dc-empty');
      const none = !data.items.length;
      const noFilter = !query && !collection;
      let h = 'Nothing matches', p = 'Try a different word, or clear the filters.';
      if (none) { h = 'No creators yet'; p = 'Save creators in Creator Search, then open Automations and choose Run now. They will show up here.'; }
      else if (filter === 'new' && noFilter) { h = 'Nothing new'; p = 'Every creator has been looked at.'; }
      else if (filter === 'email' && noFilter) { h = 'No emails yet'; p = 'No creator has an email address yet. Many put one in their bio, and you can add one by hand from a creator’s details.'; }
      else if (filter === 'emailed' && noFilter) { h = 'Nobody emailed yet'; p = 'Creators show up here once you’ve marked them as emailed.'; }
      empty.innerHTML = `<span class="dc-empty-ico">${ICON.spark}</span><h3></h3><p></p>`;
      empty.querySelector('h3').textContent = h;
      empty.querySelector('p').textContent = p;
      ui.list.className = 'dc-list dc-list-empty';
      ui.list.appendChild(empty);
      ui.more.innerHTML = '';
      return;
    }
    if (mode === 'list') {
      const th = node('div', 'dc-thead');
      th.setAttribute('aria-hidden', 'true');
      th.innerHTML = '<span></span><span></span><span>Creator</span><span>Followers</span><span>Email</span><span>Status</span><span></span>';
      ui.list.appendChild(th);
    }
    rows.slice(0, shown).forEach((c) => ui.list.appendChild(build(c)));
    ui.more.innerHTML = '';
    const left = rows.length - shown;
    ui.more.appendChild(node('span', 'dc-count', 'Showing ' + Math.min(shown, rows.length) + ' of ' + rows.length));
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
    openId = null; composer = null;
    ui = { status: node('div', 'dc-status') };
    view.appendChild(ui.status);
    statusLine();
    if (!data.items.length && !(data.receiver || {}).ready) return;   // setup notice only

    ui.note = node('div', 'dc-note');
    ui.note.hidden = true;
    view.appendChild(ui.note);
    pictureNote();

    const n = counts();
    const head = node('div', 'dc-head');
    const tabs = node('div', 'seg dc-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Show');
    [['all', 'All'], ['new', 'New'], ['email', 'Has email'], ['emailed', 'Emailed']].forEach(([k, label]) => {
      const b = node('button');
      b.type = 'button';
      b.dataset.f = k;
      b.innerHTML = label + ' <span>' + n[k] + '</span>';
      b.classList.toggle('on', filter === k);
      b.setAttribute('aria-pressed', filter === k ? 'true' : 'false');
      b.addEventListener('click', () => {
        filter = k; shown = PAGE;
        tabs.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x.dataset.f === filter); x.setAttribute('aria-pressed', x.dataset.f === filter ? 'true' : 'false'); });
        draw();
      });
      tabs.appendChild(b);
    });
    ui.tabs = tabs;
    head.appendChild(tabs);

    ui.seenAll = node('button', 'dc-textbtn dc-seenall', 'Mark all as seen');
    ui.seenAll.type = 'button';
    ui.seenAll.hidden = !n.new;
    ui.seenAll.addEventListener('click', async () => {
      try {
        const r = await api('/api/admin/discovered/seen', { all: true });
        data.items.forEach((c) => { c.seen = true; });
        setBadge(r.unseen);
        syncCounts();
        draw();
      } catch (e) { H.toast(e.message, true); }
    });
    head.appendChild(ui.seenAll);

    const modes = node('div', 'seg dc-modes');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', 'View');
    [['list', 'List', ICON.list], ['cards', 'Cards', ICON.cards]].forEach(([m, label, icon]) => {
      const b = btn('', icon, label);
      b.title = label;
      b.dataset.m = m;
      b.classList.toggle('on', mode === m);
      b.setAttribute('aria-pressed', mode === m ? 'true' : 'false');
      b.addEventListener('click', () => {
        mode = m; shown = PAGE;
        try { localStorage.setItem(VIEW_KEY, mode); } catch (e) { /* not saved: fine */ }
        modes.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x.dataset.m === mode); x.setAttribute('aria-pressed', x.dataset.m === mode ? 'true' : 'false'); });
        draw();
      });
      modes.appendChild(b);
    });
    head.appendChild(modes);
    view.appendChild(head);

    const bar = node('div', 'dc-bar');
    const search = node('input', 'inbox-search dc-search');
    search.type = 'text';
    search.placeholder = 'Search name, @handle, email or bio…';
    search.setAttribute('aria-label', 'Search creators');
    search.value = query;
    search.addEventListener('input', () => { query = search.value; shown = PAGE; draw(); });
    bar.appendChild(search);

    const colSel = node('select', 'dc-select');
    colSel.setAttribute('aria-label', 'Collection');
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
    bar.appendChild(colSel);

    const sortSel = node('select', 'dc-select');
    sortSel.setAttribute('aria-label', 'Sort');
    sortSel.innerHTML = '<option value="newest">Newest first</option><option value="followers">Most followers</option><option value="name">Name A to Z</option>';
    sortSel.value = sort;
    sortSel.addEventListener('change', () => { sort = sortSel.value; draw(); });
    bar.appendChild(sortSel);
    view.appendChild(bar);

    ui.listWrap = node('div', 'dc-listwrap');
    ui.list = node('div', 'dc-list');
    ui.listWrap.appendChild(ui.list);
    view.appendChild(ui.listWrap);
    ui.more = node('div', 'dc-morebar');
    view.appendChild(ui.more);

    // floating bar that appears when something is selected
    ui.bulk = node('div', 'dc-bulk');
    ui.bulk.hidden = true;
    ui.bulk.innerHTML = '<div class="dc-bulk-in" role="region" aria-label="Selected creators"><span class="dc-bulk-count"></span>' +
      '<button type="button" class="btn small dc-bulk-mail"></button>' +
      '<button type="button" class="dc-bulk-link" data-a="seen">Mark seen</button>' +
      '<button type="button" class="dc-bulk-link" data-a="all">Select all shown</button>' +
      '<button type="button" class="dc-bulk-link" data-a="none">Clear</button>' +
      '<button type="button" class="dc-bulk-link dc-bulk-del">Delete</button></div>';
    ui.bulkCount = ui.bulk.querySelector('.dc-bulk-count');
    ui.bulkMail = ui.bulk.querySelector('.dc-bulk-mail');
    ui.bulkMail.addEventListener('click', () => openComposer(data.items.filter((c) => selected.has(c.id)), 0));
    ui.bulk.querySelector('[data-a=none]').addEventListener('click', () => { selected.clear(); draw(); syncBulk(); });
    ui.bulk.querySelector('[data-a=all]').addEventListener('click', () => { visible().slice(0, shown).forEach((c) => selected.add(c.id)); draw(); syncBulk(); });
    ui.bulk.querySelector('[data-a=seen]').addEventListener('click', async () => {
      const ids = Array.from(selected);
      try {
        const r = await api('/api/admin/discovered/seen', { ids, seen: true });
        data.items.forEach((c) => { if (selected.has(c.id)) c.seen = true; });
        setBadge(r.unseen); selected.clear(); syncCounts(); draw();
      } catch (e) { H.toast(e.message, true); }
    });
    ui.bulk.querySelector('.dc-bulk-del').addEventListener('click', () => remove(Array.from(selected)));
    view.appendChild(ui.bulk);
    syncBulk();
    draw();
  }

  // Esc closes the email window first, then the side panel
  function onKey(e) {
    if (!H || !H.view || !H.view.isConnected) return;
    if (composer && !composer.modal.isConnected) composer = null;      // the page was left with the window open
    if (composer) {
      if (e.key === 'Escape') { e.preventDefault(); closeComposer(); return; }
      if (e.key === 'Tab') {
        const f = Array.from(composer.dlg.querySelectorAll('a[href],button:not([disabled]),input,textarea,select')).filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || !composer.dlg.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.key === 'Escape' && openId && ui.panel && ui.panel.classList.contains('open')) closePanel();
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

  document.addEventListener('keydown', onKey);
  window.CCDiscovered = {
    render(helpers) { H = helpers; shown = PAGE; load(); },
    badge,
  };
})();
