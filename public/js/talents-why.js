// ============================================================
// "Why join" panels (ambassadors page).
// The reveal itself is CSS (hover / keyboard focus). This file adds two things:
//  1. where the red flood starts: the point the pointer (or finger) came in
//  2. tap-to-open for touch screens and the stacked phone layout, one panel at
//     a time, tap again to close
// ============================================================
(function whyJoinPanels() {
  const rows = Array.from(document.querySelectorAll('#tal-why .tw-row'));
  if (!rows.length) return;
  const canHover = window.matchMedia('(hover: hover)').matches;
  const stacked = window.matchMedia('(max-width: 900px)');
  // hovering opens panels only on a real mouse in the side-by-side layout;
  // everywhere else a tap does it
  const tapMode = () => stacked.matches || !canHover;

  function aim(row, e) {
    const r = row.getBoundingClientRect();
    row.style.setProperty('--mx', Math.round(e.clientX - r.left) + 'px');
    row.style.setProperty('--my', Math.round(e.clientY - r.top) + 'px');
  }
  function toggle(row) {
    const open = !row.classList.contains('is-open');
    rows.forEach((r) => r.classList.remove('is-open'));
    if (open) row.classList.add('is-open');
  }

  rows.forEach((row) => {
    row.addEventListener('pointerenter', (e) => aim(row, e));
    row.addEventListener('pointerleave', (e) => aim(row, e));   // closes toward where the pointer left
    row.addEventListener('pointerdown', (e) => aim(row, e));
    row.addEventListener('click', () => { if (tapMode()) toggle(row); });
    row.addEventListener('keydown', (e) => {
      if (!tapMode()) return;                                    // with a mouse, focus alone opens it
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(row); }
    });
  });

  // description heights: measured here so each description opens on a plain
  // pixel height (CSS reads --tw-dh) instead of nested grid tracks
  const paras = rows.map((r) => r.querySelector('.tw-desc p'));
  function measure() {
    paras.forEach((p) => {
      if (!p) return;
      let h = p.getBoundingClientRect().height;
      const oh = p.offsetHeight;
      if (Math.abs(h - oh) > 1.5) h = oh;                        // an ancestor is mid-transform: trust layout size
      const d = p.parentElement;
      if (h > 0) d.style.setProperty('--tw-dh', (Math.round(h * 100) / 100) + 'px');
      else d.style.removeProperty('--tw-dh');
    });
  }
  measure();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(measure);
    paras.forEach((p) => { if (p) ro.observe(p); });
  }
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  // switching between the two layouts (resize / rotate): start from a clean slate
  const reset = () => rows.forEach((r) => r.classList.remove('is-open'));
  if (stacked.addEventListener) stacked.addEventListener('change', reset);
  else if (stacked.addListener) stacked.addListener(reset);

  // ---------- optional hover video ----------
  // A panel can have a video, uploaded in the admin (Talents page > Why Join, one slot per
  // panel: slot-why-1 ... slot-why-4). It plays while the panel is open by hover or keyboard
  // focus, on a computer with a mouse. Phones, tablets and anyone with reduced motion or Data
  // Saver on never download or play it, and a panel with no video is left exactly as it was.
  const mouseLayout = window.matchMedia('(min-width: 901px) and (hover: hover)');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches || !!(navigator.connection && navigator.connection.saveData);
  const clips = new Map();                                       // row -> { video, wrap, timer }

  const wants = (row) => row.matches(':hover') || row.classList.contains('is-open') || row.matches(':focus-visible');
  function startClip(c) {
    clearTimeout(c.timer);
    c.row.classList.add('is-playing');
    const p = c.video.play();
    if (p && p.catch) p.catch(() => {});
  }
  function stopClip(c) {
    clearTimeout(c.timer);
    c.row.classList.remove('is-playing');
    c.timer = setTimeout(() => c.video.pause(), 700);            // after the fade-out, so it doesn't freeze while fading
  }
  function sync(row) {
    const c = clips.get(row);
    if (c) (wants(row) ? startClip : stopClip)(c);
  }
  function dropClip(row) {
    const c = clips.get(row);
    if (!c) return;
    clearTimeout(c.timer);
    c.video.pause();
    c.video.removeAttribute('src');
    c.video.load();                                              // lets go of the download
    c.wrap.remove();
    row.classList.remove('has-clip', 'is-playing');
    clips.delete(row);
  }
  function addClip(row, src, poster) {
    const old = clips.get(row);
    if (old && old.video.getAttribute('src') === src) return;
    dropClip(row);
    const wrap = document.createElement('span');
    wrap.className = 'tw-media';
    wrap.setAttribute('aria-hidden', 'true');
    const video = document.createElement('video');
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true;
    video.setAttribute('muted', ''); video.setAttribute('playsinline', ''); video.setAttribute('tabindex', '-1');
    video.disablePictureInPicture = true; video.disableRemotePlayback = true;
    video.preload = 'none';                                      // nothing is downloaded until the panel is near the screen
    if (poster) video.poster = poster;
    video.src = src;
    wrap.appendChild(video);
    row.insertBefore(wrap, row.firstChild);
    const c = { row, video, wrap, timer: 0 };
    clips.set(row, c);
    video.addEventListener('loadeddata', () => { row.classList.add('has-clip'); if (wants(row)) startClip(c); }, { once: true });
    video.addEventListener('error', () => dropClip(row));        // a broken file just leaves the panel as it was
    warm();
  }

  // Start downloading when the section is close to the screen, but never while the page itself
  // is still loading (the top of the page matters more), so wait for it to settle first.
  let warmObserver = null;
  function whenSettled(fn) {
    const run = () => setTimeout(() => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : fn()), 800);
    if (document.readyState === 'complete') run(); else window.addEventListener('load', run, { once: true });
  }
  function warm() {
    const section = document.getElementById('tal-why');
    if (!section || !clips.size) return;
    const go = () => whenSettled(() => clips.forEach((c) => { if (c.video.preload !== 'auto') { c.video.preload = 'auto'; c.video.load(); } }));
    if (!('IntersectionObserver' in window)) return go();
    if (warmObserver) return;
    warmObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { go(); }
    }, { rootMargin: '300px 0px' });
    warmObserver.observe(section);
  }

  function assignClips() {
    if (typeof slotPick !== 'function') return;
    if (calm || !mouseLayout.matches) { Array.from(clips.keys()).forEach(dropClip); return; }
    rows.forEach((row, i) => {
      const own = slotPick('slot-why-' + (i + 1));
      if (own && own.video) addClip(row, own.video, own.poster);
      else dropClip(row);
    });
  }

  rows.forEach((row) => {
    row.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') requestAnimationFrame(() => sync(row)); });
    row.addEventListener('pointerleave', () => requestAnimationFrame(() => sync(row)));
    row.addEventListener('focus', () => requestAnimationFrame(() => sync(row)));
    row.addEventListener('blur', () => requestAnimationFrame(() => sync(row)));
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clips.forEach((c) => c.video.pause()); });
  if (mouseLayout.addEventListener) mouseLayout.addEventListener('change', assignClips);
  else if (mouseLayout.addListener) mouseLayout.addListener(assignClips);

  // the uploads arrive from main.js a moment after the page loads
  assignClips();
  document.addEventListener('mediaDataReady', assignClips);
})();
