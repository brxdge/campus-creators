// ============================================================
// Admin dashboard.
//
// Placeholder media (What We Do, How it works, The Work, Talent roster)
// reuses the existing brand/upload API: each placeholder is stored as a
// "brand" whose name starts with "slot-" (e.g. slot-how-2). The public
// site splits those out of the brand library (main.js) so they never
// appear in the feed wall or Creators in Action carousel. Slot brands are
// created automatically the first time something is uploaded to them.
// ============================================================
(function () {
  const gate = document.getElementById('gate');
  const app = document.getElementById('app');
  const loginForm = document.getElementById('loginForm');
  const passcode = document.getElementById('passcode');
  const gateError = document.getElementById('gateError');
  const view = document.getElementById('view');
  const viewTitle = document.getElementById('viewTitle');
  const viewDesc = document.getElementById('viewDesc');
  const crumb = document.getElementById('crumb');
  const toastEl = document.getElementById('toast');
  const side = document.getElementById('side');

  const SLOT_PREFIX = 'slot-';
  const ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm';

  // ---------- placeholder definitions (must match the public site) ----------
  const GROUPS = {
    services: {
      title: 'What We Do', crumb: 'Brands page',
      desc: 'One photo or video per service card. A video plays when the card is opened; a photo in the same slot is used as its cover.',
      ratio: '3/4',
      slots: [
        ['slot-svc-content', 'Content'],
        ['slot-svc-ambassadors', 'Ambassadors'],
        ['slot-svc-digital-promotions', 'Digital promotions'],
        ['slot-svc-peer-to-peer', 'Peer-to-peer'],
        ['slot-svc-events', 'Events'],
        ['slot-svc-kits', 'Kits'],
      ],
    },
    how: {
      title: 'How It Works', crumb: 'Brands page',
      desc: 'One photo or video per step. Videos play on hover; a photo in the same slot is used as the cover.',
      ratio: '4/5',
      slots: [
        ['slot-how-1', 'Step 1: Tell us what you\u2019re launching'],
        ['slot-how-2', 'Step 2: We match the creators'],
        ['slot-how-3', 'Step 3: Content gets made on campus'],
        ['slot-how-4', 'Step 4: You get the results'],
      ],
    },
    work: {
      title: 'The Work', crumb: 'Brands page',
      desc: 'Cover media for each case study card. Videos autoplay muted on the card.',
      ratio: '16/10',
      slots: [
        ['slot-work-1', 'Case 01: Beverage launch'],
        ['slot-work-2', 'Case 02: Ambassador program'],
        ['slot-work-3', 'Case 03: Campus activation'],
      ],
    },
    roster: {
      title: 'Campus Ambassadors', crumb: 'Talents page',
      desc: 'One photo or video per creator card. Videos play on hover; a photo in the same slot is used as the cover.',
      ratio: '4/5',
      slots: [
        ['slot-roster-1', 'Maya R.'], ['slot-roster-2', 'Devon K.'], ['slot-roster-3', 'Priya S.'],
        ['slot-roster-4', 'Liam O.'], ['slot-roster-5', 'Chloe M.'], ['slot-roster-6', 'Andre P.'],
        ['slot-roster-7', 'Sofia L.'], ['slot-roster-8', 'Noah T.'], ['slot-roster-9', 'Aisha B.'],
        ['slot-roster-10', 'Ethan W.'], ['slot-roster-11', 'Zara H.'], ['slot-roster-12', 'Marcus D.'],
      ],
    },
  };
  const VIEWS = {
    dashboard: { title: 'Dashboard', crumb: 'Overview', desc: 'Everything you can update on the site, at a glance.' },
    brands: { title: 'Creators in Action', crumb: 'Brands page', desc: 'Brand campaign photos and videos. These fill the homepage feed wall, the brand carousel and any section without its own media.' },
  };
  Object.keys(GROUPS).forEach((k) => { VIEWS[k] = GROUPS[k]; });
  VIEWS['inbox-brand'] = { title: 'Brand enquiries', crumb: 'Inbox', desc: 'Messages sent through the contact form on the Brands page.', inbox: 'brand' };
  VIEWS['inbox-talent'] = { title: 'Talent applications', crumb: 'Inbox', desc: 'Applications sent through the Apply form on the Talents page.', inbox: 'talent' };

  // readable labels + the order fields are shown in
  const FIELD_LABELS = {
    brand: [['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'],
      ['company', 'Company'], ['social', 'Website or social'], ['budget', 'Budget'], ['timeline', 'Timeline'], ['message', 'What they\u2019re launching']],
    talent: [['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'],
      ['birthday', 'Birthday'], ['hometown', 'Hometown'], ['university', 'University'], ['universityOther', 'Other school'],
      ['year', 'Year'], ['organizations', 'Organizations'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'],
      ['interests', 'Interests'], ['referredBy', 'Referred by']],
  };

  let submissions = null;       // null = inbox not available on the server
  let unread = { brand: 0, talent: 0 };
  let inboxFilter = 'all';
  let inboxQuery = '';

  let brands = [];
  let current = 'dashboard';

  // ---------- helpers ----------
  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  async function api(url, options) {
    let res;
    try {
      res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options));
    } catch (netErr) {
      throw new Error('Could not reach the server. Is it still running?');
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      throw new Error(`Server returned ${res.status} (not JSON). Open the site at http://localhost:3000/admin, not as a file.`);
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body is fine */ }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    return data;
  }

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  const isSlot = (b) => b.name.indexOf(SLOT_PREFIX) === 0;
  const brandByName = (name) => brands.find((b) => b.name === name);
  const mediaUrl = (m) => '/media/' + m.filename;

  // the file the public site actually shows for a slot
  function activeFor(media) {
    const v = media.find((m) => m.kind === 'video');
    const p = media.find((m) => m.kind === 'photo');
    return { video: v || null, photo: p || null };
  }

  // ---------- session ----------
  async function checkSession() {
    try {
      const { signedIn } = await api('/api/admin/session');
      if (signedIn) showApp();
    } catch (e) { /* stay on the gate */ }
  }

  function showApp() {
    gate.hidden = true;
    app.hidden = false;
    route();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.textContent = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.value }),
      });
      passcode.value = '';
      showApp();
    } catch (err) { gateError.textContent = err.message; }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  });

  // ---------- sidebar / routing ----------
  const toggle = document.getElementById('sideToggle');
  const scrim = document.getElementById('sideScrim');
  toggle.addEventListener('click', () => app.classList.toggle('side-open'));
  scrim.addEventListener('click', () => app.classList.remove('side-open'));

  function route() {
    const key = (location.hash || '#dashboard').slice(1);
    current = VIEWS[key] ? key : 'dashboard';
    document.querySelectorAll('#sideNav a').forEach((a) => a.classList.toggle('active', a.dataset.view === current));
    const v = VIEWS[current];
    viewTitle.textContent = v.title;
    crumb.textContent = v.crumb;
    viewDesc.textContent = v.desc;
    app.classList.remove('side-open');
    load();
  }
  window.addEventListener('hashchange', route);

  async function loadSubmissions() {
    try {
      const data = await api('/api/admin/submissions');
      submissions = data.submissions || [];
      unread = data.unread || { brand: 0, talent: 0 };
    } catch (e) {
      submissions = null;
      unread = { brand: 0, talent: 0 };
    }
    document.querySelectorAll('[data-badge]').forEach((b) => {
      const n = unread[b.dataset.badge] || 0;
      b.textContent = n;
      b.hidden = !n;
    });
  }

  async function load() {
    view.innerHTML = '<p class="loading">Loading…</p>';
    try {
      const [data] = await Promise.all([api('/api/admin/brands'), loadSubmissions()]);
      brands = data.brands || [];
      render();
    } catch (err) {
      view.innerHTML = '<p class="loading"></p>';
      view.firstChild.textContent = err.message;
    }
  }

  function render() {
    view.innerHTML = '';
    if (current === 'dashboard') renderDashboard();
    else if (current === 'brands') renderBrands();
    else if (VIEWS[current].inbox) renderInbox(VIEWS[current].inbox);
    else renderSlots(GROUPS[current]);
  }

  // ---------- dashboard ----------
  function renderDashboard() {
    const realBrands = brands.filter((b) => !isSlot(b));
    const brandFiles = realBrands.reduce((n, b) => n + b.media.length, 0);
    const brandVideos = realBrands.reduce((n, b) => n + b.media.filter((m) => m.kind === 'video').length, 0);
    let slotsTotal = 0, slotsFilled = 0;
    Object.values(GROUPS).forEach((g) => g.slots.forEach(([key]) => {
      slotsTotal++;
      const b = brandByName(key);
      if (b && b.media.length) slotsFilled++;
    }));

    const stats = el('div', 'stats');
    [
      [realBrands.length, 'Brands'],
      [brandFiles, 'Brand files'],
      [submissions ? (unread.brand + unread.talent) : '\u2013', 'Unread messages'],
      [slotsFilled + ' / ' + slotsTotal, 'Placeholders filled'],
    ].forEach(([num, label]) => {
      const s = el('div', 'stat');
      s.append(el('strong', null, String(num)), el('span', null, label));
      stats.appendChild(s);
    });
    view.appendChild(stats);

    const list = el('div', 'overview');
    const rows = [];
    if (submissions) {
      ['brand', 'talent'].forEach((t) => {
        const total = submissions.filter((s) => s.type === t).length;
        rows.push(['inbox-' + t, t === 'brand' ? 'Brand enquiries' : 'Talent applications', 'Inbox', total - unread[t], total, 'read']);
      });
    }
    rows.push(['brands', 'Creators in Action', 'Brands page', realBrands.filter((b) => b.media.length).length, realBrands.length || 0, 'brands with media']);
    Object.keys(GROUPS).forEach((k) => {
      const g = GROUPS[k];
      const filled = g.slots.filter(([key]) => { const b = brandByName(key); return b && b.media.length; }).length;
      rows.push([k, g.title, g.crumb, filled, g.slots.length, 'filled']);
    });
    rows.forEach(([key, title, page, done, total, word]) => {
      const pct = total ? Math.round((done / total) * 100) : 0;
      const row = el('a', 'ov-row');
      row.href = '#' + key;
      row.innerHTML = `
        <div class="ov-main"><span class="ov-page"></span><h3></h3></div>
        <div class="ov-bar"><span style="width:${pct}%"></span></div>
        <span class="ov-count">${done} / ${total} ${word}</span>
        <span class="ov-go">Manage &#8594;</span>`;
      row.querySelector('.ov-page').textContent = page;
      row.querySelector('h3').textContent = title;
      list.appendChild(row);
    });
    view.appendChild(list);
  }

  // ---------- inbox ----------
  function fmtDate(iso) {
    const d = new Date(iso);
    const today = new Date();
    const same = d.toDateString() === today.toDateString();
    return same ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  function renderInbox(type) {
    if (!submissions) {
      view.innerHTML = `<div class="notice"><h3>Inbox isn't connected yet</h3>
        <p>The server needs the <code>submissions.js</code> module mounted before form responses can be stored and shown here.</p></div>`;
      return;
    }
    const all = submissions.filter((s) => s.type === type);

    const bar = el('div', 'inbox-bar');
    bar.innerHTML = `
      <div class="seg">
        <button type="button" data-f="all">All <span>${all.length}</span></button>
        <button type="button" data-f="unread">Unread <span>${all.filter((s) => !s.read).length}</span></button>
      </div>
      <input type="text" class="inbox-search" placeholder="Search name, email, school…">
      <button class="btn small bulk-del" type="button" hidden>Delete selected</button>
      <a class="btn ghost small" href="/api/admin/submissions.csv?type=${type}">Export CSV</a>`;
    const selected = new Set();
    const bulkBtn = bar.querySelector('.bulk-del');
    function syncBulk() {
      bulkBtn.hidden = !selected.size;
      bulkBtn.textContent = `Delete selected (${selected.size})`;
    }
    bulkBtn.addEventListener('click', () => removeSubmissions(Array.from(selected), type));
    bar.querySelectorAll('.seg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.f === inboxFilter);
      b.addEventListener('click', () => { inboxFilter = b.dataset.f; render(); });
    });
    const search = bar.querySelector('.inbox-search');
    search.value = inboxQuery;
    search.addEventListener('input', () => { inboxQuery = search.value; drawList(); });
    view.appendChild(bar);

    const list = el('div', 'inbox-list');
    view.appendChild(list);

    function drawList() {
      const q = inboxQuery.trim().toLowerCase();
      const rows = all.filter((s) => (inboxFilter === 'all' || !s.read) &&
        (!q || JSON.stringify(s.data).toLowerCase().indexOf(q) !== -1));
      list.innerHTML = '';
      if (!rows.length) {
        list.innerHTML = `<p class="empty inbox-empty">${all.length ? 'Nothing matches.' : 'No ' + (type === 'brand' ? 'enquiries' : 'applications') + ' yet.'}</p>`;
        return;
      }
      rows.forEach((s) => list.appendChild(inboxRow(s, type, selected, syncBulk)));
    }
    drawList();
  }

  async function removeSubmissions(ids, type) {
    if (!ids.length) return;
    const label = ids.length === 1
      ? `this ${type === 'brand' ? 'enquiry' : 'application'}`
      : `${ids.length} ${type === 'brand' ? 'enquiries' : 'applications'}`;
    if (!confirm(`Delete ${label}? This cannot be undone.`)) return;
    let failed = 0;
    for (const id of ids) {
      try { await api('/api/admin/submissions/' + id, { method: 'DELETE' }); }
      catch (e) { failed++; }
    }
    toast(failed ? `${failed} could not be deleted.` : 'Deleted.', !!failed);
    load();
  }

  function inboxRow(s, type, selected, onSelect) {
    const d = s.data || {};
    const name = [d.firstName, d.lastName].filter(Boolean).join(' ') || '(no name)';
    const sub = type === 'brand'
      ? [d.company, d.budget].filter(Boolean).join(' \u00b7 ')
      : [d.university === 'Other' && d.universityOther ? d.universityOther : d.university, d.year].filter(Boolean).join(' \u00b7 ');
    const preview = type === 'brand' ? (d.message || '') : (Array.isArray(d.interests) ? d.interests.join(', ') : '');

    const row = el('div', 'msg' + (s.read ? '' : ' unread'));
    row.innerHTML = `
      <div class="msg-head">
        <label class="msg-check" title="Select"><input type="checkbox"></label>
        <span class="dot"></span>
        <div class="msg-who"><strong></strong><span class="msg-sub"></span></div>
        <p class="msg-preview"></p>
        <span class="msg-date">${fmtDate(s.createdAt)}</span>
        <button class="msg-trash" type="button" title="Delete" aria-label="Delete">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>
        </button>
      </div>
      <div class="msg-body"></div>`;
    row.querySelector('strong').textContent = name;
    row.querySelector('.msg-sub').textContent = [d.email, sub].filter(Boolean).join(' \u00b7 ');
    row.querySelector('.msg-preview').textContent = preview;

    const body = row.querySelector('.msg-body');
    const shown = Object.assign({}, d);
    if (type === 'talent' && (d.birthMonth || d.birthDay || d.birthYear)) {
      shown.birthday = [d.birthMonth, d.birthDay, d.birthYear].filter(Boolean).join(' ');
    }
    const dl = el('dl', 'msg-fields');
    FIELD_LABELS[type].forEach(([k, label]) => {
      let v = shown[k];
      if (!v || (Array.isArray(v) && !v.length)) return;
      const dt = el('dt'); dt.textContent = label;
      const dd = el('dd');
      if (Array.isArray(v)) {
        v.forEach((x) => { const t = el('span', 'tag'); t.textContent = x; dd.appendChild(t); });
      } else if (k === 'email') {
        const a = el('a'); a.href = 'mailto:' + v; a.textContent = v; dd.appendChild(a);
      } else if (/^https?:\/\//i.test(v)) {
        const a = el('a'); a.href = v; a.target = '_blank'; a.rel = 'noopener'; a.textContent = v; dd.appendChild(a);
      } else {
        dd.textContent = v;
      }
      if (k === 'message') dl.classList.add('has-message');
      dl.append(dt, dd);
    });
    body.appendChild(dl);

    const actions = el('div', 'msg-actions');
    const replySubject = type === 'brand' ? 'Re: your enquiry to Campus Creators' : 'Your Campus Creators application';
    actions.innerHTML = `
      <a class="btn small" href="mailto:${encodeURIComponent(d.email || '')}?subject=${encodeURIComponent(replySubject)}">Reply by email</a>
      <button class="btn ghost small" type="button" data-act="toggle">Mark as unread</button>
      <button class="msg-del" type="button" data-act="delete">Delete</button>
      <span class="msg-stamp">Received ${new Date(s.createdAt).toLocaleString()}</span>`;
    body.appendChild(actions);

    async function setRead(val) {
      try {
        await api('/api/admin/submissions/' + s.id, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ read: val }),
        });
        s.read = val;
        row.classList.toggle('unread', !val);
        actions.querySelector('[data-act=toggle]').textContent = val ? 'Mark as unread' : 'Mark as read';
        unread[s.type] = Math.max(0, unread[s.type] + (val ? -1 : 1));
        document.querySelectorAll(`[data-badge="${s.type}"]`).forEach((b) => { b.textContent = unread[s.type]; b.hidden = !unread[s.type]; });
      } catch (err) { toast(err.message, true); }
    }

    const check = row.querySelector('.msg-check input');
    check.checked = selected.has(s.id);
    row.classList.toggle('selected', check.checked);
    row.querySelector('.msg-check').addEventListener('click', (e) => e.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) selected.add(s.id); else selected.delete(s.id);
      row.classList.toggle('selected', check.checked);
      onSelect();
    });
    row.querySelector('.msg-trash').addEventListener('click', (e) => {
      e.stopPropagation();
      removeSubmissions([s.id], type);
    });

    row.querySelector('.msg-head').addEventListener('click', () => {
      const open = row.classList.toggle('open');
      if (open && !s.read) setRead(true);
    });
    actions.querySelector('[data-act=toggle]').addEventListener('click', () => setRead(!s.read));
    actions.querySelector('[data-act=delete]').addEventListener('click', () => removeSubmissions([s.id], type));
    return row;
  }

  // ---------- uploads ----------
  function wireDrop(drop, input, onFiles) {
    drop.addEventListener('click', () => input.click());
    // copy the FileList first: clearing input.value empties it, and the
    // upload may start only after an async slot-creation step
    input.addEventListener('change', () => {
      const list = Array.from(input.files);
      input.value = '';
      if (list.length) onFiles(list);
    });
    ['dragenter', 'dragover'].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const list = Array.from(e.dataTransfer.files); if (list.length) onFiles(list); });
  }

  function upload(brandId, files, progress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('brandId', brandId);
      Array.from(files).forEach((f) => form.append('files', f));
      const bar = progress.querySelector('span');
      progress.classList.add('show');
      bar.style.width = '0%';
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/upload');
      xhr.withCredentials = true;
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
      });
      xhr.addEventListener('load', () => {
        progress.classList.remove('show');
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'Upload failed.'));
      });
      xhr.addEventListener('error', () => { progress.classList.remove('show'); reject(new Error('Upload failed.')); });
      xhr.send(form);
    });
  }

  async function ensureBrand(name) {
    let b = brandByName(name);
    if (b) return b;
    await api('/api/admin/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await api('/api/admin/brands');
    brands = data.brands || [];
    b = brandByName(name);
    if (!b) throw new Error('Could not create a storage slot for this placeholder.');
    return b;
  }

  async function deleteMedia(m) {
    if (!confirm('Delete this file?')) return;
    try {
      await api('/api/admin/media/' + m.id, { method: 'DELETE' });
      toast('Deleted.');
      load();
    } catch (err) { toast(err.message, true); }
  }

  function mediaThumb(m, badge) {
    const item = el('div', 'media-item');
    const src = mediaUrl(m);
    item.innerHTML = m.kind === 'video'
      ? `<video src="${src}" muted loop playsinline preload="metadata"></video>`
      : `<img src="${src}" alt="" loading="lazy">`;
    item.insertAdjacentHTML('beforeend',
      `<span class="media-kind">${badge || m.kind}</span>` +
      '<button class="media-del" type="button" title="Delete">&times;</button>');
    const vid = item.querySelector('video');
    if (vid) {
      item.addEventListener('mouseenter', () => vid.play().catch(() => {}));
      item.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });
    }
    item.querySelector('.media-del').addEventListener('click', (e) => { e.stopPropagation(); deleteMedia(m); });
    if (badge === 'in use' || badge === 'cover') item.classList.add('in-use');
    item.title = badge === 'cover' ? 'Used as the video cover' : badge === 'in use' ? 'Shown on the site' : 'Not currently shown';
    return item;
  }

  // ---------- placeholder slots ----------
  function renderSlots(group) {
    const grid = el('div', 'slot-grid');
    group.slots.forEach(([key, label], i) => grid.appendChild(slotCard(key, label, i, group.ratio)));
    view.appendChild(grid);
  }

  function slotCard(key, label, index, ratio) {
    const b = brandByName(key);
    const media = b ? b.media : [];
    const act = activeFor(media);
    const status = act.video ? 'Video' : act.photo ? 'Photo' : 'Empty';

    const card = el('div', 'slot' + (media.length ? ' filled' : ''));
    card.innerHTML = `
      <div class="slot-preview" style="aspect-ratio:${ratio}">
        <span class="slot-num">${String(index + 1).padStart(2, '0')}</span>
        <div class="slot-empty">
          <span class="slot-plus">+</span>
          <p>Drop a photo or video</p>
        </div>
        <input type="file" multiple accept="${ACCEPT}">
      </div>
      <div class="progress"><span></span></div>
      <div class="slot-meta">
        <h3></h3>
        <span class="pill ${status.toLowerCase()}">${status}</span>
      </div>
      <div class="slot-files"></div>`;
    card.querySelector('h3').textContent = label;

    const preview = card.querySelector('.slot-preview');
    const input = card.querySelector('input');
    const progress = card.querySelector('.progress');

    if (act.video || act.photo) {
      const shown = act.video || act.photo;
      const node = shown.kind === 'video'
        ? Object.assign(document.createElement('video'), { src: mediaUrl(shown), muted: true, loop: true, playsInline: true, autoplay: true })
        : Object.assign(document.createElement('img'), { src: mediaUrl(shown), alt: '' });
      if (shown.kind === 'video' && act.photo) node.poster = mediaUrl(act.photo);
      node.className = 'slot-media';
      preview.prepend(node);
      preview.insertAdjacentHTML('beforeend', '<span class="slot-replace">Add / replace</span>');
    }

    wireDrop(preview, input, async (files) => {
      try {
        const brand = await ensureBrand(key);
        const res = await upload(brand.id, files, progress);
        toast(`Uploaded ${res.added ? res.added.length : ''} file(s) to ${label}.`);
        load();
      } catch (err) { toast(err.message, true); }
    });

    const filesEl = card.querySelector('.slot-files');
    if (media.length) {
      media.forEach((m) => {
        let badge = m.kind;
        if (act.video && m.id === act.video.id) badge = 'in use';
        else if (m.kind === 'photo' && act.photo && m.id === act.photo.id) badge = act.video ? 'cover' : 'in use';
        filesEl.appendChild(mediaThumb(m, badge));
      });
    }
    return card;
  }

  // ---------- Creators in Action (brands) ----------
  function renderBrands() {
    const add = el('div', 'add-brand');
    add.innerHTML = '<input type="text" placeholder="Add a new brand…"><button class="btn small" type="button">Add brand</button>';
    const addInput = add.querySelector('input');
    const addBtn = add.querySelector('button');
    async function addBrand() {
      const name = addInput.value.trim();
      if (!name) return;
      if (name.toLowerCase().indexOf(SLOT_PREFIX) === 0) { toast('That name is reserved.', true); return; }
      try {
        await api('/api/admin/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        toast('Brand added.');
        load();
      } catch (err) { toast(err.message, true); }
    }
    addBtn.addEventListener('click', addBrand);
    addInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBrand(); });
    view.appendChild(add);

    const list = el('div', 'brand-list');
    const real = brands.filter((b) => !isSlot(b));
    if (!real.length) list.innerHTML = '<p class="loading">No brands yet. Add one above.</p>';
    real.forEach((brand) => list.appendChild(brandCard(brand)));
    view.appendChild(list);
  }

  function brandCard(brand) {
    const photos = brand.media.filter((m) => m.kind === 'photo').length;
    const videos = brand.media.filter((m) => m.kind === 'video').length;
    const card = el('div', 'brand');
    card.innerHTML = `
      <div class="brand-head">
        <div class="brand-title">
          <h3></h3>
          <span class="brand-count">${photos} photo${photos === 1 ? '' : 's'} · ${videos} video${videos === 1 ? '' : 's'}</span>
        </div>
        <div class="brand-actions">
          <button class="brand-del" type="button">Remove</button>
          <span class="brand-chevron">&#9660;</span>
        </div>
      </div>
      <div class="brand-body">
        <div class="drop">
          <input type="file" multiple accept="${ACCEPT}">
          <p>Drop files here, or click to choose</p>
          <small>JPG, PNG, WEBP, MP4, MOV, WEBM. Vertical crops work best.</small>
        </div>
        <div class="progress"><span></span></div>
        <div class="media-grid"></div>
      </div>`;
    card.querySelector('h3').textContent = brand.name;

    card.querySelector('.brand-head').addEventListener('click', (e) => {
      if (e.target.closest('.brand-del')) return;
      card.classList.toggle('open');
    });
    card.querySelector('.brand-del').addEventListener('click', async () => {
      if (!confirm(`Remove "${brand.name}" and all its uploaded files? This cannot be undone.`)) return;
      try {
        await api('/api/admin/brands/' + brand.id, { method: 'DELETE' });
        toast('Brand removed.');
        load();
      } catch (err) { toast(err.message, true); }
    });

    const grid = card.querySelector('.media-grid');
    if (!brand.media.length) grid.innerHTML = '<p class="empty">Nothing uploaded yet.</p>';
    brand.media.forEach((m) => grid.appendChild(mediaThumb(m)));

    const progress = card.querySelector('.progress');
    wireDrop(card.querySelector('.drop'), card.querySelector('.drop input'), async (files) => {
      try {
        const res = await upload(brand.id, files, progress);
        toast(`Uploaded ${res.added ? res.added.length : ''} file(s).`);
        load();
      } catch (err) { toast(err.message, true); }
    });
    return card;
  }

  checkSession();
})();
