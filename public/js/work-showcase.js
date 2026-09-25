// ============================================================
// "The Work" — a featured case on a big cinematic screen, with the other
// cases lined up underneath as selectable tabs.
//
// Copy is the same real placeholder text as before (all three cases are
// "In progress"; nothing is invented). Media per case comes from the admin
// placeholder (slot-work-1..3); if a case has none yet, a photo/clip from
// the brand library stands in so the screen is never empty.
//
// Autoplays through the cases while the section is on screen (a progress
// line runs under the active tab), pauses while you hover the screen or
// the tabs, and arrows / tabs / swipe all jump directly.
// ============================================================
(function workShowcase() {
  const section = document.getElementById('work');
  const slidesEl = document.getElementById('wkSlides');
  const copyEl = document.getElementById('wkCopy');
  const tabsEl = document.getElementById('wkTabs');
  const screen = document.getElementById('wkScreen');
  if (!section || !slidesEl || !copyEl || !tabsEl || !screen) return;

  const CASES = [
    { flag: 'In progress', title: 'Beverage launch', desc: 'Write-up and results coming soon.' },
    { flag: 'In progress', title: 'Ambassador program', desc: 'Write-up and results coming soon.' },
    { flag: 'In progress', title: 'Campus activation', desc: 'Write-up and results coming soon.' },
  ];
  const TONES = [1, 3, 5];
  const GLOW = { 1: '#2E2E33', 3: '#223140', 5: '#4A1D14' };
  const DURATION = 7000;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad = (n) => String(n).padStart(2, '0');
  const curEl = document.getElementById('wkCur');
  const totalEl = document.getElementById('wkTotal');
  if (totalEl) totalEl.textContent = pad(CASES.length);

  // ---------- build ----------
  const slides = CASES.map((c, i) => {
    const s = document.createElement('div');
    s.className = 'wk-slide t' + TONES[i % TONES.length] + (i === 0 ? ' is-active' : '');
    s.innerHTML = `<span class="wk-bignum" aria-hidden="true">${pad(i + 1)}</span>`;
    slidesEl.appendChild(s);
    return s;
  });

  const tabs = CASES.map((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wk-tab' + (i === 0 ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    b.innerHTML = `
      <span class="wk-thumb t${TONES[i % TONES.length]}"></span>
      <span class="wk-tab-text">
        <span class="wk-tab-num">${pad(i + 1)}</span>
        <span class="wk-tab-title"></span>
        <span class="wk-tab-flag"></span>
      </span>
      <span class="wk-tab-bar" aria-hidden="true"><i></i></span>`;
    b.querySelector('.wk-tab-title').textContent = c.title;
    b.querySelector('.wk-tab-flag').textContent = c.flag;
    tabsEl.appendChild(b);
    return b;
  });

  let idx = 0;

  function renderCopy(i) {
    const c = CASES[i];
    copyEl.innerHTML = `
      <span class="wk-flag"></span>
      <h3 class="wk-title"><span></span></h3>
      <p class="wk-desc"></p>`;
    copyEl.querySelector('.wk-flag').textContent = c.flag;
    copyEl.querySelector('.wk-title span').textContent = c.title;
    copyEl.querySelector('.wk-desc').textContent = c.desc;
    copyEl.classList.remove('enter');
    void copyEl.offsetWidth;
    copyEl.classList.add('enter');
  }

  // ---------- media ----------
  function pickMedia(i) {
    const own = typeof slotPick === 'function' ? slotPick('slot-work-' + (i + 1)) : { video: '', poster: '' };
    if (own.video || own.poster) return own;
    // stand-in from the brand library, offset so each case looks different
    if (typeof MEDIA_DATA === 'undefined' || typeof resolveMedia !== 'function') return { video: '', poster: '' };
    const vids = [];
    const photos = [];
    Object.keys(MEDIA_DATA).forEach((k) => {
      const b = MEDIA_DATA[k] || {};
      (b.videos || []).forEach((v) => { if (v && v.src) vids.push(v); });
      (b.photos || []).forEach((p) => { if (p) photos.push(p); });
    });
    const photo = photos.length ? resolveMedia(photos[(i * 3 + 1) % photos.length]) : '';
    if (vids.length) {
      const v = vids[(i * 2 + 1) % vids.length];
      return { video: resolveMedia(v.src), poster: v.poster ? resolveMedia(v.poster) : photo };
    }
    return { video: '', poster: photo };
  }

  function applyMedia() {
    slides.forEach((slide, i) => {
      slide.querySelectorAll('.wk-media').forEach((n) => n.remove());
      slide.classList.remove('has-media', 'video-ready');
      const m = pickMedia(i);
      const thumb = tabs[i].querySelector('.wk-thumb');
      thumb.style.backgroundImage = m.poster ? `url("${m.poster}")` : '';
      if (!m.video && !m.poster) return;

      if (m.poster) {
        const img = document.createElement('img');
        img.className = 'wk-media wk-photo';
        img.src = m.poster; img.alt = ''; img.loading = i === 0 ? 'eager' : 'lazy';
        slide.prepend(img);
      }
      if (m.video) {
        const v = document.createElement('video');
        v.className = 'wk-media wk-video';
        v.muted = true; v.loop = true; v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.preload = i === idx ? 'auto' : 'metadata';
        v.disablePictureInPicture = true; v.disableRemotePlayback = true;
        v.src = m.video;
        // the photo holds the frame until the clip can actually play
        v.addEventListener('canplay', () => slide.classList.add('video-ready'), { once: true });
        slide.appendChild(v);
      }
      slide.classList.add('has-media');
    });
    syncVideo();
  }

  let inView = false;
  let hovering = false;

  function syncVideo() {
    slides.forEach((s, i) => {
      const v = s.querySelector('video');
      if (!v) return;
      if (i === idx && inView && !reduceMotion) { v.preload = 'auto'; v.play().catch(() => {}); }
      else v.pause();
    });
  }

  // ---------- activation ----------
  let elapsed = 0;

  function setActive(i) {
    i = (i + CASES.length) % CASES.length;
    if (i !== idx) {
      const prev = idx;
      idx = i;
      slides.forEach((s, k) => {
        s.classList.toggle('is-active', k === i);
        s.classList.toggle('is-prev', k === prev);
      });
      setTimeout(() => { if (idx !== prev) slides[prev].classList.remove('is-prev'); }, 1100);
      tabs.forEach((t, k) => {
        t.classList.toggle('active', k === i);
        t.setAttribute('aria-selected', k === i ? 'true' : 'false');
        const bar = t.querySelector('.wk-tab-bar i');
        if (bar) bar.style.transform = '';
      });
      if (curEl) curEl.textContent = pad(i + 1);
      renderCopy(i);
      section.style.setProperty('--work-glow', GLOW[TONES[i % TONES.length]]);
    }
    elapsed = 0;
    syncVideo();
  }

  // ---------- autoplay clock ----------
  let raf = null;
  let last = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (!inView || hovering || reduceMotion) return;
    elapsed += dt;
    const bar = tabs[idx].querySelector('.wk-tab-bar i');
    if (bar) bar.style.transform = `scaleX(${Math.min(1, elapsed / DURATION)})`;
    if (elapsed >= DURATION) setActive(idx + 1);
  }
  function startClock() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
  function stopClock() { if (raf) cancelAnimationFrame(raf); raf = null; }

  // ---------- input ----------
  tabs.forEach((t, i) => t.addEventListener('click', () => setActive(i)));
  const prevBtn = document.getElementById('wkPrev');
  const nextBtn = document.getElementById('wkNext');
  if (prevBtn) prevBtn.addEventListener('click', () => setActive(idx - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => setActive(idx + 1));

  [screen, tabsEl].forEach((z) => {
    z.addEventListener('mouseenter', () => { hovering = true; section.classList.add('wk-paused'); });
    z.addEventListener('mouseleave', () => { hovering = false; section.classList.remove('wk-paused'); });
  });

  // swipe the screen on touch
  let sx = null;
  screen.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  screen.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx;
    sx = null;
    if (Math.abs(dx) > 40) setActive(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });

  // light that follows the cursor across the screen
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    screen.addEventListener('pointermove', (e) => {
      const r = screen.getBoundingClientRect();
      screen.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      screen.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) startClock(); else stopClock();
      syncVideo();
    }, { threshold: 0.35 }).observe(section);
  } else {
    inView = true;
    startClock();
  }

  renderCopy(0);
  section.style.setProperty('--work-glow', GLOW[TONES[0]]);
  applyMedia();
  document.addEventListener('mediaDataReady', applyMedia);
})();