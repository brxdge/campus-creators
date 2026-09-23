// ============================================================
// "What we do" — editorial list + cinematic stage.
//
// Left: the six services as a big outlined index. The active one fills in,
// shows its line, and a red progress bar counts down to the next.
// Right: a framed "stage" that wipes each service's footage up into view,
// with the next two services fanned behind it.
//
// Each service opens on its photo for ~2s while its video buffers, then the
// video fades in and plays, then it moves to the next service. Autoplay
// runs while the section is on screen and pauses while you hover the list
// or stage; hover (desktop) or tap (touch) jumps straight to a service.
// Only the active video ever plays.
//
// Media: admin placeholder for the service (slot-svc-<name>) first, else a
// clip from the shared brand library (MEDIA_DATA, loaded by main.js).
// ============================================================
(function () {
  const section = document.getElementById('services');
  const items = Array.from(document.querySelectorAll('#svcList .svc-item'));
  const slides = Array.from(document.querySelectorAll('#svcStage .svc-slide'));
  if (!section || !items.length || items.length !== slides.length) return;

  const frame = section.querySelector('.svc-frame');
  const curEl = document.getElementById('svcCur');
  const chipEl = document.getElementById('svcChip');
  const wordEl = document.getElementById('svcBgWord');
  const deck = Array.from(section.querySelectorAll('.svc-deck-card'));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let idx = 0;
  let inView = false;
  let hovering = false;

  // ---------- media ----------
  function collectVideoPool() {
    const pool = [];
    const data = typeof MEDIA_DATA !== 'undefined' ? MEDIA_DATA : {};
    Object.keys(data).forEach((brand) => {
      ((data[brand] && data[brand].videos) || []).forEach((v) => {
        if (v && v.src) pool.push({ brand, src: v.src, poster: v.poster || '' });
      });
    });
    return pool;
  }
  function collectPhotoPool() {
    const byBrand = {};
    const all = [];
    const data = typeof MEDIA_DATA !== 'undefined' ? MEDIA_DATA : {};
    Object.keys(data).forEach((brand) => {
      const photos = (data[brand] && data[brand].photos) || [];
      if (photos.length) byBrand[brand] = photos[0];
      photos.forEach((p) => { if (p) all.push(p); });
    });
    return { byBrand, all };
  }
  function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function assignMedia() {
    if (typeof resolveMedia !== 'function') return;
    const pool = collectVideoPool();
    const photos = collectPhotoPool();

    slides.forEach((slide, i) => {
      const poster = slide.querySelector('.svc-poster');
      const video = slide.querySelector('.svc-video');
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;

      const own = typeof slotPick === 'function' ? slotPick('slot-svc-' + slug(slide.dataset.title)) : null;
      let posterSrc = '';
      let videoSrc = '';
      if (own && (own.video || own.poster)) {
        posterSrc = own.poster;
        videoSrc = own.video;
      } else if (pool.length) {
        const clip = pool[i % pool.length];
        const p = clip.poster || photos.byBrand[clip.brand] || photos.all[0] || '';
        posterSrc = p ? resolveMedia(p) : '';
        videoSrc = resolveMedia(clip.src);
      } else if (photos.all.length) {
        posterSrc = resolveMedia(photos.all[i % photos.all.length]);
      }

      if (posterSrc) { poster.src = posterSrc; slide.classList.add('has-media'); }
      if (videoSrc) {
        video.style.display = '';
        if (video.getAttribute('src') !== videoSrc) video.src = videoSrc;
        slide.classList.add('has-media');
      } else {
        video.pause();
        video.removeAttribute('src');
        video.style.display = 'none';
      }
    });
    paintDeck();
    enterSlide(idx);
    syncPlayback();
  }

  function paintDeck() {
    deck.forEach((card, k) => {
      const s = slides[(idx + k + 1) % slides.length];
      const img = s.querySelector('.svc-poster');
      card.style.backgroundImage = img && img.getAttribute('src') ? `url("${img.getAttribute('src')}")` : '';
    });
  }

  // ---------- per-service timeline: photo first, then the video ----------
  // Each service opens on its photo while its video buffers in the
  // background. After PHOTO_MS the video fades in over the photo. If the
  // video isn't ready yet, the photo simply stays up (the progress bar
  // holds and pulses) until it can play, so there's never a black frame.
  // A service with no video just shows its photo for PHOTO_ONLY_MS.
  const PHOTO_MS = 2000;
  const VIDEO_MS = 6000;
  const PHOTO_ONLY_MS = 5500;
  const LOAD_GIVE_UP_MS = 8000;

  let elapsed = 0;
  let videoShown = false;
  let waiting = false;
  let giveUpTimer = null;
  let raf = null;
  let last = 0;

  function parts(i) {
    const slide = slides[i];
    const video = slide.querySelector('.svc-video');
    const poster = slide.querySelector('.svc-poster');
    return {
      slide, video, bar: items[i].querySelector('.svc-bar i'),
      hasVideo: !!(video && video.getAttribute('src')),
      hasPhoto: !!(poster && poster.getAttribute('src')),
    };
  }
  function photoMs(p) { return p.hasPhoto ? PHOTO_MS : 0; }
  function totalMs(p) { return p.hasVideo ? photoMs(p) + VIDEO_MS : PHOTO_ONLY_MS; }

  function enterSlide(i) {
    clearTimeout(giveUpTimer);
    waiting = false;
    videoShown = false;
    elapsed = 0;
    section.classList.remove('svc-loading');

    slides.forEach((s, k) => {
      if (k === i) return;
      s.classList.remove('show-video');
      const b = items[k].querySelector('.svc-bar i');
      if (b) b.style.transform = '';
    });

    const p = parts(i);
    p.slide.classList.remove('show-video');
    if (p.bar) p.bar.style.transform = 'scaleX(0)';
    if (p.hasVideo) {
      // start buffering right away, while the photo is on screen
      p.video.preload = 'auto';
      try { p.video.currentTime = 0; } catch (e) { /* not loaded yet */ }
      if (p.video.readyState === 0) p.video.load();
      if (!photoMs(p) || reduceMotion) tryShowVideo();
    }
    // warm up the next service's video too
    const n = parts((i + 1) % slides.length);
    if (n.hasVideo && n.video.preload !== 'auto') n.video.preload = 'metadata';
  }

  function showVideo(p) {
    clearTimeout(giveUpTimer);
    waiting = false;
    videoShown = true;
    section.classList.remove('svc-loading');
    p.slide.classList.add('show-video');
    if (inView && !reduceMotion) p.video.play().catch(() => {});
  }

  function tryShowVideo() {
    const p = parts(idx);
    if (!p.hasVideo || videoShown) return;
    if (p.video.readyState >= 3) { showVideo(p); return; }
    waiting = true;
    section.classList.add('svc-loading');
    const mine = idx;
    p.video.addEventListener('canplay', () => { if (idx === mine && !videoShown) showVideo(parts(mine)); }, { once: true });
    // a video that never loads shouldn't stall the whole section
    giveUpTimer = setTimeout(() => {
      if (idx !== mine || videoShown) return;
      waiting = false;
      videoShown = true;        // keep the photo, carry on to the next service
      section.classList.remove('svc-loading');
    }, LOAD_GIVE_UP_MS);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(100, now - last) : 0;
    last = now;
    if (!inView || hovering || waiting || reduceMotion) return;

    const p = parts(idx);
    elapsed += dt;
    if (p.hasVideo && !videoShown && elapsed >= photoMs(p)) {
      elapsed = photoMs(p);
      tryShowVideo();
    }
    const total = totalMs(p);
    if (p.bar) p.bar.style.transform = `scaleX(${Math.min(1, elapsed / total)})`;
    if (elapsed >= total) setActive((idx + 1) % items.length);
  }

  function startClock() { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } }
  function stopClock() { if (raf) cancelAnimationFrame(raf); raf = null; }

  function syncPlayback() {
    slides.forEach((s, k) => {
      const v = s.querySelector('.svc-video');
      if (!v || !v.getAttribute('src')) return;
      if (k === idx && videoShown && inView && !reduceMotion) v.play().catch(() => {});
      else if (!s.classList.contains('is-prev')) v.pause();
    });
  }

  // ---------- activation ----------
  function pad(n) { return String(n).padStart(2, '0'); }

  function setActive(i) {
    const prev = idx;
    idx = i;

    if (prev !== i) {
      slides.forEach((s, k) => {
        s.classList.toggle('is-active', k === i);
        s.classList.toggle('is-prev', k === prev);
      });
      // once the wipe has covered it, retire the previous slide
      setTimeout(() => {
        if (idx === prev) return;
        slides[prev].classList.remove('is-prev', 'show-video');
        const v = slides[prev].querySelector('.svc-video');
        if (v) v.pause();
      }, 1050);

      items.forEach((b, k) => {
        b.classList.toggle('active', k === i);
        b.setAttribute('aria-pressed', k === i ? 'true' : 'false');
      });

      const title = items[i].dataset.title;
      if (curEl) curEl.textContent = pad(i + 1);
      if (chipEl) chipEl.textContent = title;
      if (wordEl) {
        wordEl.textContent = title;
        wordEl.classList.remove('swap');
        void wordEl.offsetWidth;
        wordEl.classList.add('swap');
      }
      paintDeck();
    }
    enterSlide(i);
    syncPlayback();
  }

  // ---------- input ----------
  items.forEach((b, k) => {
    b.addEventListener('click', () => setActive(k));
    if (finePointer) {
      let dwell = null;
      b.addEventListener('mouseenter', () => { clearTimeout(dwell); dwell = setTimeout(() => setActive(k), 90); });
      b.addEventListener('mouseleave', () => clearTimeout(dwell));
    }
  });

  const hoverZones = [section.querySelector('.svc-list'), section.querySelector('.svc-stage')].filter(Boolean);
  hoverZones.forEach((z) => {
    z.addEventListener('mouseenter', () => { hovering = true; });
    z.addEventListener('mouseleave', () => { hovering = false; });
  });

  // stage: soft 3D tilt + light that follows the cursor
  if (frame && finePointer && !reduceMotion) {
    const stage = section.querySelector('.svc-stage');
    stage.addEventListener('pointermove', (e) => {
      const r = frame.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      frame.style.setProperty('--mx', (x * 100).toFixed(1) + '%');
      frame.style.setProperty('--my', (y * 100).toFixed(1) + '%');
      frame.style.setProperty('--ry', ((x - 0.5) * 7).toFixed(2) + 'deg');
      frame.style.setProperty('--rx', ((0.5 - y) * 7).toFixed(2) + 'deg');
    });
    stage.addEventListener('pointerleave', () => {
      frame.style.setProperty('--ry', '0deg');
      frame.style.setProperty('--rx', '0deg');
    });
  }

  // only run (and only play video) while the section is on screen
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      inView = entries[0].isIntersecting;
      if (inView) startClock(); else stopClock();
      syncPlayback();
    }, { threshold: 0.35 }).observe(section);
  } else {
    inView = true;
    startClock();
  }

  assignMedia();
  document.addEventListener('mediaDataReady', assignMedia);
})();
