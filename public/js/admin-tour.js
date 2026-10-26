// ============================================================
// Admin tours: a short walkthrough of a page that spotlights each part in turn and
// says what it is for. There is one for
//   - Inbox > Brand enquiries
//   - Inbox > Talent applications
//   - Creators > Discovered creators
//
// How it appears
//   - A "Take a tour" button in the page header, on pages that have a tour.
//   - The first time someone opens such a page, a small card offers the tour.
//     "Not now" and finishing both stop it from being offered again (remembered
//     in this browser only).
//
// A tour never changes real data. Rows are opened for show without being marked
// as read or seen, and anything a step ticks or opens is put back afterwards.
//
// admin.js calls CCTour.viewChanged(viewKey) whenever the page changes.
// admin-discovered.js provides CCDiscovered.tour (the show-only helpers).
// To add a tour: add an entry to TOURS below.
// ============================================================
(function () {
  'use strict';

  const SEEN_KEY = 'cc-admin-tour-';
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const small = () => window.innerWidth <= 560;
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function remembered(id) { try { return !!localStorage.getItem(SEEN_KEY + id); } catch (e) { return false; } }
  function remember(id) { try { localStorage.setItem(SEEN_KEY + id, '1'); } catch (e) { /* private window: it may be offered again */ } }

  // on screen, from left to right (the menu is off to the left on a phone until it is opened)
  function onScreen(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    return r.right > 0 && r.left < window.innerWidth;
  }
  const visibleEl = (sel) => { const e = $(sel); return onScreen(e) ? e : null; };

  // ============================================================
  //  The tours
  // ============================================================
  const KEYS = '<p class="tour-hint">About a minute. Use the buttons or the <kbd>←</kbd> <kbd>→</kbd> keys. <kbd>Esc</kbd> ends the tour.</p>';
  const REPLAY = '<p class="tour-hint">Replay this tour any time with the <b>Take a tour</b> button at the top of the page.</p>';

  // ---------- Inbox (brand enquiries and talent applications) ----------
  let openedByTour = null;
  const inboxStates = {
    // shows the first message open without marking it as read
    open: {
      settle: 40,
      on() {
        const row = $('.msg');
        if (!row) return false;
        openedByTour = row.classList.contains('open') ? null : row;
        row.classList.add('open');
        return true;
      },
      off() { if (openedByTour) openedByTour.classList.remove('open'); openedByTour = null; },
    },
  };

  function inboxSteps(type) {
    const brand = type === 'brand';
    const hasRows = () => !!$('.msg');
    const steps = [];

    steps.push({
      title: brand ? 'Brand enquiries' : 'Talent applications',
      body: brand
        ? '<p>Every message from the contact form on the Brands page lands here. It is how brands first reach you, so it is worth checking every day.</p>' + KEYS
        : '<p>Everyone who fills in the Apply form on the Talents page lands here. It is your pipeline of future campus creators.</p>' + KEYS,
    });

    steps.push({
      target: () => visibleEl('#sideNav a[data-view="inbox-' + type + '"]'),
      place: 'right',
      title: 'The red number',
      body: '<p>The number next to ' + (brand ? 'Brand enquiries' : 'Talent applications') + ' in the menu counts the ones nobody has opened yet. The Dashboard adds both inboxes together as <b>Unread messages</b>.</p>' +
        '<p>When email alerts are switched on, each new ' + (brand ? 'message' : 'application') + ' is also emailed to the team address, so you do not have to keep this page open.</p>',
    });

    steps.push({
      target: '.inbox-bar .seg',
      title: 'Everything, or only what is new',
      body: '<p><b>All</b> lists every ' + (brand ? 'message' : 'application') + '. <b>Unread</b> lists only the ones nobody has opened.</p>' +
        '<p>Treat Unread as your to-do list. When it says 0, you are caught up.</p>',
    });

    steps.push({
      target: '.inbox-search',
      title: 'Find anything',
      body: brand
        ? '<p>Search looks through the whole message: name, email, company, budget and what they wrote.</p><p>Try a company name to see whether that brand has written before.</p>'
        : '<p>Search looks through the whole application: name, school, hometown, Instagram, TikTok and interests.</p><p>Type a school to see who could cover that campus.</p>',
    });

    steps.push({
      when: () => !hasRows(),
      title: 'When the first one arrives',
      body: '<p>It shows up as a bold row with a red dot, and the number in the menu turns red. Click the row to read everything ' + (brand ? 'they sent' : 'they filled in') + ', then reply from the button inside.</p>' +
        '<p>Replay this tour then to see the rows up close.</p>',
    });

    steps.push({
      target: '.msg',
      title: 'One row per ' + (brand ? 'enquiry' : 'application'),
      body: brand
        ? '<p>Bold text with a red dot means it has not been opened. Each row shows the name, email, company and budget, then the start of the message.</p><p>Click a row to open it.</p>'
        : '<p>Bold text with a red dot means it has not been opened. Each row shows the name, email, school and year, then their interests.</p><p>Click a row to open it.</p>',
    });

    steps.push({
      state: 'open',
      when: hasRows,
      target: '.msg.open .msg-body',
      title: brand ? 'Everything they sent' : 'Everything they filled in',
      body: brand
        ? '<p>Contact details, website or social links, budget, timeline and what they are launching.</p><p>Opening a message marks it as read. In this tour it stays as it is.</p>'
        : '<p>Contact details, school and year, hometown, organizations, Instagram, TikTok, interests and who referred them.</p><p>Look at their Instagram and TikTok before you reply. Their birthday is only kept here: it is left out of the alert email.</p>',
    });

    steps.push({
      state: 'open',
      when: hasRows,
      target: '.msg.open .msg-actions',
      title: 'Reply, remind yourself, delete',
      body: '<ul><li><b>Reply by email</b> opens your email app with their address and a subject already filled in.</li>' +
        '<li><b>Mark as unread</b> puts the red dot back. The inbox does not track replies, so use it as a reminder to follow up.</li>' +
        '<li><b>Delete</b> removes it for good.</li></ul>',
    });

    steps.push({
      when: hasRows,
      target: '.msg-check',
      title: 'Select several',
      body: '<p>Tick the box on the left of a row. A <b>Delete selected</b> button then appears in the bar above. Deleting cannot be undone.</p>' +
        (brand ? '<p>Handy for clearing spam.</p>' : '<p>Applications hold personal details, so delete the ones you will not follow up on.</p>'),
    });

    steps.push({
      target: '.inbox-bar a.btn',
      title: 'Export to a spreadsheet',
      body: '<p>Downloads every ' + (brand ? 'enquiry' : 'application') + ' as a CSV file, including ones the filter or search is hiding. Open it in Excel or Google Sheets.</p>' +
        '<p>Export now and then. It doubles as a backup.</p>',
    });

    steps.push({
      title: 'You are ready',
      body: brand
        ? '<p>A simple routine:</p><ol><li>Open <b>Unread</b> and answer each message.</li><li>Use <b>Mark as unread</b> for the ones you need to come back to.</li><li>Export now and then, and delete spam.</li></ol>' + REPLAY
        : '<p>A simple routine:</p><ol><li>Open <b>Unread</b> and read each application.</li><li>Check their Instagram and TikTok, then reply from the row.</li><li>Use <b>Mark as unread</b> for the ones to revisit. Export now and then, and clear out the rest.</li></ol>' + REPLAY,
    });
    return steps;
  }

  // ---------- Creators > Discovered creators ----------
  const CCD = () => (window.CCDiscovered && window.CCDiscovered.tour) || null;
  const discoveredStates = {
    panel:    { settle: 380, on: () => { const t = CCD(); return t ? t.openPanel() : false; }, off: () => { const t = CCD(); if (t) t.closePanel(); } },
    composer: { settle: 140, on: () => { const t = CCD(); return t ? t.openComposer() : false; }, off: () => { const t = CCD(); if (t) t.closeComposer(); } },
    bulk:     { settle: 80,  on: () => { const t = CCD(); return t ? t.pick(2) : false; }, off: () => { const t = CCD(); if (t) t.unpick(); } },
  };

  function discoveredSteps() {
    const hasRows = () => !!$('.dc-list .dc-row, .dc-list .dc-card');
    const setup = () => !!$('.dc-setup');
    const hasMail = () => { const t = CCD(); return !!(t && t.hasEmail()); };
    const steps = [];

    steps.push({
      title: 'Discovered creators',
      body: '<p>This is your private shortlist. Creators you save in <b>Creator Search</b> are sent here automatically, so you can see who has an email, write to them, and keep track of who you have contacted.</p>' +
        '<p>Only signed-in admins can see it. It never appears on the public site.</p>' + KEYS,
    });

    steps.push({
      target: '.dc-setup',
      title: 'Connect Creator Search first',
      body: '<p>Nothing can arrive until the website and Creator Search share a secret. Follow the steps in this box, then reload the page.</p>',
    });

    steps.push({
      target: '.dc-last',
      title: 'Connection and Refresh',
      body: '<p>This line says Creator Search is connected and when it last sent creators.</p>' +
        '<p>The list loads when you open the page. Press <b>Refresh</b> to pull in anything that arrived since.</p>' +
        '<p>Nothing here yet? In Creator Search, open <b>Automations</b> and choose <b>Run now</b>.</p>',
    });

    steps.push({
      target: '.dc-note',
      title: 'Why there are no photos',
      body: '<p>Photos only appear when Creator Search sends them. Until then you see initials.</p>' +
        '<p>In Creator Search, open <b>Choose details</b> and turn on <b>Profile picture</b>. To add photos for creators already here, run it once with <b>Skip creators this flow already sent</b> switched off.</p>',
    });

    steps.push({
      when: () => !hasRows() && !setup(),
      title: 'No creators yet',
      body: '<p>Save creators in Creator Search, then open <b>Automations</b> and choose <b>Run now</b>. They show up here within moments.</p><p>Replay this tour then to see each part with real creators.</p>',
    });

    steps.push({
      target: '.dc-head',
      title: 'Filter, mark, switch view',
      body: '<ul><li><b>New</b>: creators nobody has opened yet. The red number in the menu counts them.</li>' +
        '<li><b>Has email</b>: the ones you can write to right now. A good place to start.</li>' +
        '<li><b>Emailed</b>: the ones you have already contacted.</li>' +
        '<li><b>Mark all as seen</b> clears every New tag at once.</li>' +
        '<li>The two icons switch between a list and cards. Cards show the bio.</li></ul>',
    });

    steps.push({
      target: '.dc-bar',
      title: 'Search, collections, sorting',
      body: '<p>Search finds names, @handles, emails, bios and collections. Paste a TikTok link to jump to that creator. Several words narrow it down.</p>' +
        '<p><b>Collections</b> are the saved lists in Creator Search. <b>Sort</b> by newest, most followers or name.</p>',
    });

    steps.push({
      when: hasRows,
      target: '.dc-list .dc-row, .dc-list .dc-card',
      title: 'One creator per row',
      body: '<p>Photo (or initials), name, @handle, followers, email, and whether you have emailed them. A bold name with a red <b>New</b> tag has not been opened yet.</p>' +
        '<p>Click anywhere on a row to open the full details. The circle selects the creator.</p>',
    });

    steps.push({
      when: hasRows,
      target: () => $('.dc-list .dc-emailbtn') || $('.dc-list .dc-addmail'),
      title: 'Email, or add an email',
      body: '<p><b>Email</b> opens a ready-made message you can edit. Nothing is sent until you press Send.</p>' +
        '<p><b>Add email</b> shows when no address was found. Open the creator to type one in.</p>',
    });

    steps.push({
      state: 'panel',
      when: hasRows,
      target: '.dc-panel-head',
      title: 'Review them quickly',
      body: '<p>Clicking a row opens this panel. In the tour it is only a preview, so nothing is marked as seen.</p>' +
        '<p>The arrows (or <kbd>←</kbd> <kbd>→</kbd>) move to the previous or next creator in your list, so you can review a batch without closing the panel. The <b>TikTok</b> or <b>YouTube</b> button opens their profile so you can check their content first.</p>',
    });

    steps.push({
      state: 'panel',
      when: hasRows,
      target: () => $$('.dc-panel .dc-sec')[0] || null,
      title: 'Their email',
      body: '<p>It shows where the address came from: found in their bio, sent by Creator Search, or added by your team. <b>Change</b> fixes a wrong one.</p>' +
        '<p>No address? Look on their TikTok or YouTube profile or their bio link and type it in.</p>',
    });

    steps.push({
      state: 'panel',
      when: hasRows,
      target: () => $$('.dc-panel .dc-sec')[1] || null,
      title: 'Who has been contacted',
      body: '<p>Shows when you emailed them, and how many times. Sending from the website records it for you.</p>' +
        '<p>Wrote to them from your own email? Press <b>I already emailed them</b>, so nobody on the team writes twice.</p>',
    });

    steps.push({
      state: 'composer',
      when: () => hasRows() && hasMail(),
      target: '#dcMailBody',
      title: 'Make it personal',
      body: '<p>The message starts from your team’s default, with their first name and @handle filled in. Edit it freely: mention a video you liked.</p>' +
        '<p>If a <b>{placeholder}</b> is left in the text, the message will not send until you replace it.</p>',
    });

    steps.push({
      state: 'composer',
      when: () => hasRows() && hasMail(),
      target: '.dc-dlg-actions',
      title: 'Send, or copy',
      body: '<p><b>Send</b> emails them from the website and records them as Emailed. Replies go to the address shown under the message. A daily limit protects your sender reputation.</p>' +
        '<p>Prefer your own inbox? <b>Copy message</b>, paste it there, then mark them as emailed.</p>',
    });

    steps.push({
      state: 'composer',
      when: () => hasRows() && hasMail(),
      target: '.dc-dlg-foot',
      title: 'Share your best wording',
      body: '<p><b>Save as the default message</b> makes everyone on the team start from your version. Their name and @handle turn into placeholders automatically.</p>' +
        '<p>If you have emailed someone before, this window says so and the button changes to <b>Send again</b>.</p>',
    });

    steps.push({
      when: hasRows,
      target: () => visibleEl('.dc-thead .dc-check') || visibleEl('.dc-list .dc-check'),
      title: 'Select several',
      body: '<p>Tick the circle on a creator’s row. On wide screens, the circle in the list heading selects everyone in the list.</p>',
    });

    steps.push({
      state: 'bulk',
      when: hasRows,
      target: '.dc-bulk-in',
      title: 'Work through many at once',
      body: '<ul><li><b>Email</b> walks you through the email window one creator at a time. You still press Send on each, and <b>Skip</b> moves on.</li>' +
        '<li><b>Mark seen</b> clears their New tags.</li>' +
        '<li><b>Select all</b> takes everyone in the current list, even those you have not scrolled to.</li>' +
        '<li><b>Delete</b> removes them from this website. If Creator Search sends them again, they come back as new.</li></ul>' +
        '<p>Tip: open <b>Has email</b> first, then select all.</p>',
    });

    steps.push({
      when: () => !setup(),
      title: 'A routine that works',
      body: '<ol><li>In Creator Search, save creators and press <b>Run now</b>.</li>' +
        '<li>Here, press <b>Refresh</b> and open <b>New</b> or <b>Has email</b>.</li>' +
        '<li>Review each creator with the arrows, then email the good fits.</li>' +
        '<li>Come back to <b>Emailed</b> to follow up.</li></ol>' + REPLAY,
    });
    return steps;
  }

  const TOURS = {
    'inbox-brand':  { ready: '.inbox-bar', states: inboxStates, steps: () => inboxSteps('brand') },
    'inbox-talent': { ready: '.inbox-bar', states: inboxStates, steps: () => inboxSteps('talent') },
    'discovered':   { ready: '.dc-head, .dc-setup', states: discoveredStates, steps: discoveredSteps },
  };

  // ============================================================
  //  The player
  // ============================================================
  let current = '';          // the tour this page has, if any
  let active = null;         // the tour now playing
  let offerTimer = 0;
  let frame = 0;

  const X_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  function make(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function build() {
    const layer = make('div', 'tour-layer');
    const shield = make('div', 'tour-shield');
    const spot = make('div', 'tour-spot is-none');
    const pop = make('div', 'tour-pop');
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'true');
    pop.setAttribute('aria-labelledby', 'tourTitle');
    pop.setAttribute('aria-describedby', 'tourBody');
    pop.tabIndex = -1;
    pop.innerHTML =
      '<div class="tour-top"><span class="tour-count"></span><button type="button" class="tour-x" aria-label="End the tour">' + X_ICON + '</button></div>' +
      '<div class="tour-bar"><span></span></div>' +
      '<div class="tour-text" aria-live="polite"><h3 id="tourTitle"></h3><div class="tour-body" id="tourBody"></div></div>' +
      '<div class="tour-foot"><button type="button" class="tour-back">Back</button><button type="button" class="btn small tour-next">Next</button></div>';
    layer.append(shield, spot, pop);
    document.body.appendChild(layer);
    pop.querySelector('.tour-x').addEventListener('click', () => end());
    pop.querySelector('.tour-back').addEventListener('click', () => step(-1));
    pop.querySelector('.tour-next').addEventListener('click', () => step(1));
    return { layer, spot, pop };
  }

  // which steps will be shown. A step is left out when its condition fails or, for a step with
  // no page state of its own, when the part of the page it points at is not there.
  function planOrder(steps) {
    const order = [];
    steps.forEach((st, i) => {
      if (st.when && !st.when()) return;
      if (st.target && !st.state) {
        const el = typeof st.target === 'function' ? st.target() : $(st.target);
        if (!onScreen(el)) return;
      }
      order.push(i);
    });
    return order;
  }

  async function start(id) {
    const def = TOURS[id];
    if (!def) return;
    if (active) end(true);
    removeOffer();
    remember(id);
    const steps = def.steps();
    const t = active = { id, def, steps, order: planOrder(steps), p: -1, state: null, el: null, step: null, busy: false, from: document.activeElement };
    Object.assign(t, build());
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    await go(0, 1);
  }

  async function setState(t, name) {
    if (t.state === name) return true;
    if (t.state) { try { t.def.states[t.state].off(); } catch (e) { /* page changed under us */ } t.state = null; }
    if (!name) return true;
    const def = t.def.states[name];
    let ok = true;
    try { ok = def.on(); } catch (e) { ok = false; }
    if (ok === false) return false;
    t.state = name;
    await sleep(calm() ? 30 : def.settle);
    return true;
  }

  // show the step at position p of the plan; if its page state can't be set up, move on in the same direction
  async function go(p, dir) {
    const t = active;
    if (!t || t.busy) return;
    t.busy = true;
    try {
      while (p >= 0 && p < t.order.length) {
        const st = t.steps[t.order[p]];
        const ok = await setState(t, st.state || null);
        if (active !== t) return;
        let el = null;
        if (st.target) {
          el = typeof st.target === 'function' ? st.target() : $(st.target);
          if (!ok || !onScreen(el)) { p += dir; continue; }
        } else if (!ok) { p += dir; continue; }
        t.p = p; t.step = st; t.el = el;
        paint();
        reveal();
        t.pop.classList.add('in');
        t.pop.querySelector('.tour-next').focus({ preventScroll: true });
        return;
      }
      if (p >= t.order.length) end(false);
    } finally { if (active === t) t.busy = false; }
  }

  function step(dir) {
    if (!active || active.busy) return;
    if (dir > 0 && active.p >= active.order.length - 1) { end(); return; }
    if (dir < 0 && active.p <= 0) return;
    go(active.p + dir, dir);
  }

  function paint() {
    const t = active, pop = t.pop, last = t.p >= t.order.length - 1;
    pop.querySelector('.tour-count').textContent = 'Step ' + (t.p + 1) + ' of ' + t.order.length;
    pop.querySelector('.tour-bar span').style.width = Math.round(((t.p + 1) / t.order.length) * 100) + '%';
    pop.querySelector('#tourTitle').textContent = t.step.title;
    pop.querySelector('#tourBody').innerHTML = t.step.body;
    pop.querySelector('.tour-back').disabled = t.p <= 0;
    pop.querySelector('.tour-next').textContent = last ? 'Done' : 'Next';
    pop.scrollTop = 0;
  }

  // ---- bring the target into view, then place the spotlight and the card ----
  function scroller(el) {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const canScroll = /(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1;
      if (p !== el && canScroll) return p;
      if (cs.position === 'fixed') return null;          // fixed and not scrolling: nothing to scroll
    }
    return document.scrollingElement || document.documentElement;
  }
  function ensureVisible(el, cardHeight) {
    const sc = scroller(el);
    if (!sc) return;
    const win = sc === document.scrollingElement || sc === document.documentElement;
    const box = win ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
    const top = box.top + 16;
    const bottom = box.bottom - (small() ? cardHeight + 28 : 16);
    const r = el.getBoundingClientRect();
    let delta = 0;
    const big = !small() && r.height > (box.bottom - box.top) * 0.4;                   // a big block: top-align it so the card fits underneath
    if (big || r.height > bottom - top) delta = r.top - top;                           // taller than the room: line up the top
    else if (r.top < top || r.bottom > bottom) delta = (r.top + r.bottom) / 2 - (top + bottom) / 2;   // otherwise centre it
    if (delta) { if (win) window.scrollBy(0, delta); else sc.scrollTop += delta; }
  }

  function reveal() {
    const t = active;
    if (t.el) {
      t.pop.style.left = '0px'; t.pop.style.top = '0px';           // measure the card at its real width
      if (small()) { t.pop.style.left = '12px'; t.pop.style.right = '12px'; }
      ensureVisible(t.el, t.pop.offsetHeight);
    }
    place();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; place(); });
  }

  function place() {
    const t = active;
    if (!t || !t.pop) return;
    const pop = t.pop, spot = t.spot;
    const vw = window.innerWidth, vh = window.innerHeight, m = 12, gap = 14;
    const phone = small();

    pop.style.right = ''; pop.style.bottom = ''; pop.style.maxHeight = '';
    if (phone) {
      pop.style.left = m + 'px'; pop.style.right = m + 'px'; pop.style.top = 'auto';
      pop.style.bottom = 'calc(' + m + 'px + env(safe-area-inset-bottom, 0px))';
      pop.style.maxHeight = Math.round(vh * 0.62) + 'px';
    }

    let rect = null;
    if (t.el && t.el.isConnected) { const r = t.el.getBoundingClientRect(); if (r.width || r.height) rect = r; }

    if (!rect) {                                   // a step about the page as a whole: dim it all, card in the middle
      spot.className = 'tour-spot is-none';
      spot.style.cssText = '';
      if (!phone) {
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        pop.style.left = Math.round((vw - pw) / 2) + 'px';
        pop.style.top = Math.round(Math.max(m, (vh - ph) / 2)) + 'px';
      }
      return;
    }

    const pad = t.step.pad == null ? 8 : t.step.pad;
    const x = Math.max(4, rect.left - pad), y = Math.max(4, rect.top - pad);
    const w = Math.min(vw - 4, rect.right + pad) - x, h = Math.min(vh - 4, rect.bottom + pad) - y;
    let radius = parseFloat(getComputedStyle(t.el).borderRadius) || 0;
    spot.className = 'tour-spot';
    spot.style.left = x + 'px'; spot.style.top = y + 'px'; spot.style.width = w + 'px'; spot.style.height = h + 'px';
    spot.style.borderRadius = clamp(radius + pad, 10, 28) + 'px';
    if (phone) {
      // the card normally sits at the bottom; if that would hide the target, move it to the top instead,
      // and if the target is simply huge, end the spotlight where the card begins
      const cardH = pop.offsetHeight, edge = vh - cardH - m;
      if (y + h > edge - 6) {
        if (y >= cardH + m * 2) {
          pop.style.bottom = 'auto';
          pop.style.top = 'calc(' + m + 'px + env(safe-area-inset-top, 0px))';
        } else if (edge - 6 - y >= 40) {
          spot.style.height = Math.round(edge - 6 - y) + 'px';
        }
      }
      return;
    }

    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const room = { bottom: vh - (y + h) - m, top: y - m, right: vw - (x + w) - m, left: x - m };
    const at = {
      bottom: { l: x + w / 2 - pw / 2, t: y + h + gap, fits: room.bottom >= ph + gap },
      top:    { l: x + w / 2 - pw / 2, t: y - ph - gap, fits: room.top >= ph + gap },
      right:  { l: x + w + gap, t: y + h / 2 - ph / 2, fits: room.right >= pw + gap },
      left:   { l: x - pw - gap, t: y + h / 2 - ph / 2, fits: room.left >= pw + gap },
    };
    const order = [t.step.place, 'bottom', 'top', 'right', 'left'].filter(Boolean);
    let pick = order.find((k) => at[k].fits);
    if (!pick) {                                   // the target is huge: keep the card on screen, low and centred
      pop.style.left = Math.round((vw - pw) / 2) + 'px';
      pop.style.top = Math.round(vh - ph - 8) + 'px';
      return;
    }
    pop.style.left = Math.round(clamp(at[pick].l, m, vw - pw - m)) + 'px';
    pop.style.top = Math.round(clamp(at[pick].t, m, vh - ph - m)) + 'px';
  }

  // ---- keyboard: the tour owns the keys while it is playing ----
  function onKey(e) {
    const t = active;
    if (!t) return;
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === 'Escape') { eat(); end(); return; }
    if (e.key === 'ArrowRight') { eat(); step(1); return; }
    if (e.key === 'ArrowLeft') { eat(); step(-1); return; }
    if (e.key === 'Tab') {
      const f = $$('button:not([disabled])', t.pop);
      if (!f.length) { eat(); return; }
      const first = f[0], last = f[f.length - 1];
      if (!t.pop.contains(document.activeElement)) { eat(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { eat(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { eat(); first.focus(); }
    }
  }

  function end(silent) {
    const t = active;
    if (!t) return;
    active = null;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    if (t.state) { try { t.def.states[t.state].off(); } catch (e) { /* the page changed */ } }
    t.layer.remove();
    if (!silent) {
      const back = t.from && t.from.isConnected ? t.from : $('#tourBtn');
      if (back && back.focus) back.focus({ preventScroll: true });
    }
  }

  // ============================================================
  //  The button in the page header and the first-visit card
  // ============================================================
  function removeOffer() {
    $$('.tour-offer').forEach((n) => n.remove());
  }

  function showOffer(id) {
    removeOffer();
    const card = make('div', 'tour-offer');
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Page tour');
    card.innerHTML = '<p class="tour-offer-t">New to this page?</p><p class="tour-offer-p">Take a one-minute tour of what each part does.</p>' +
      '<div class="tour-offer-b"><button type="button" class="btn small" data-a="go">Start the tour</button><button type="button" class="btn ghost small" data-a="no">Not now</button></div>';
    card.querySelector('[data-a=go]').addEventListener('click', () => start(id));
    card.querySelector('[data-a=no]').addEventListener('click', () => { remember(id); removeOffer(); });
    document.body.appendChild(card);
  }

  // offer the tour once the page has finished loading, and only if this page's tour has not been seen
  function offerWhenReady(id) {
    let tries = 0;
    const tick = () => {
      if (current !== id || active) return;
      if ($(TOURS[id].ready, document.getElementById('view'))) {
        offerTimer = setTimeout(() => { if (current === id && !active && !remembered(id)) showOffer(id); }, 900);
        return;
      }
      if (++tries < 50) offerTimer = setTimeout(tick, 120);
    };
    offerTimer = setTimeout(tick, 200);
  }

  // called by admin.js each time the page changes ('' or an unknown name = no tour here)
  function viewChanged(key) {
    if (active) end(true);
    removeOffer();
    clearTimeout(offerTimer);
    current = TOURS[key] ? key : '';
    const b = document.getElementById('tourBtn');
    if (b) b.hidden = !current;
    if (current && !remembered(current)) offerWhenReady(current);
  }

  const btn = document.getElementById('tourBtn');
  if (btn) btn.addEventListener('click', () => { if (current) start(current); });

  window.CCTour = { viewChanged, start, end: () => end(true), has: (id) => !!TOURS[id] };

  // admin.js can finish signing in and routing before this file has loaded; if so, catch up now
  const appEl = document.getElementById('app');
  if (appEl && !appEl.hidden) {
    const first = (location.hash || '#dashboard').slice(1);
    if (TOURS[first]) viewChanged(first);
  }
})();
