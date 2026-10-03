// ============================================================
// Talents page — hero video, roster wall, apply modal, counters.
//
// Media: styled placeholders now, with a hook to wire the admin media
// library later. If main.js has already populated MEDIA_DATA (same
// /api/media source the brands page uses) and exposed resolveMedia(),
// this pulls real photos/videos into the roster; otherwise
// it falls back to tinted placeholder cards so nothing looks broken
// before real talent media exists. Swap in a dedicated /api/talents feed
// here when it's ready — only collectMedia() needs to change.
// ============================================================
(function talentsPage() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- shared: gather whatever real media is available ----------
  // Returns { photos:[src...], videos:[{src,poster}...] } from MEDIA_DATA
  // if it's loaded, else empty arrays. Never fabricates URLs.
  function collectMedia() {
    const photos = [];
    const videos = [];
    const data = (typeof MEDIA_DATA !== 'undefined' && MEDIA_DATA) ? MEDIA_DATA : {};
    const resolve = (typeof resolveMedia === 'function') ? resolveMedia : (x) => x;
    Object.keys(data).forEach((brand) => {
      const b = data[brand] || {};
      (b.photos || []).forEach((p) => { if (p) photos.push(resolve(p)); });
      (b.videos || []).forEach((v) => {
        if (v && v.src) videos.push({ src: resolve(v.src), poster: v.poster ? resolve(v.poster) : '' });
      });
    });
    return { photos, videos };
  }

  // ---------- full-screen hero video cycle ----------
  // One video fills the whole hero, plays, then crossfades to the next,
  // cycling through every available clip. On-screen time per clip
  // alternates 5s, 3s, 5s, 3s… as requested. Two stacked <video>
  // elements swap the "front" role so the next clip is already loaded and
  // playing before it fades in — no black flash between clips.
  //
  // Media source: the same MEDIA_DATA the brands page uses (collectMedia
  // gathers every uploaded video). If no videos are available yet the hero
  // falls back to its flat dark background — nothing else sits behind it.
  const HERO_DURATIONS = [5000, 3000]; // ms on screen, alternating
  let heroCycle = { timer: null, step: 0, front: null, back: null, clips: [] };

  function startHeroVideoCycle() {
    const stage = document.getElementById('talHeroVideo');
    const vidA = document.getElementById('talHeroVidA');
    const vidB = document.getElementById('talHeroVidB');
    if (!stage || !vidA || !vidB) return;

    // tear down any previous run (e.g. media arrived after first boot)
    clearTimeout(heroCycle.timer);
    heroCycle.timer = null;

    const { videos } = collectMedia();
    const clips = videos.filter((v) => v && v.src).map((v) => v.src);

    // no real videos yet → nothing to play, hero keeps its dark background
    if (!clips.length) {
      stage.classList.remove('has-clips');
      return;
    }
    stage.classList.add('has-clips');
    heroCycle.clips = clips;
    heroCycle.step = 0;
    heroCycle.front = vidA;
    heroCycle.back = vidB;

    // reduced motion: show one still frame, no cycling
    if (reduceMotion) {
      vidA.src = clips[0];
      vidA.classList.add('show');
      vidA.load();
      return;
    }

    let clipIndex = 0;

    function playOn(videoEl, src) {
      return new Promise((resolve) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        videoEl.src = src;
        videoEl.currentTime = 0;
        // resolve as soon as it can play, but never hang the cycle
        videoEl.addEventListener('canplay', done, { once: true });
        videoEl.addEventListener('error', done, { once: true });
        setTimeout(done, 1200);
        videoEl.load();
        videoEl.play().catch(() => {});
      });
    }

    function advance() {
      const front = heroCycle.front;
      const back = heroCycle.back;
      const nextSrc = clips[clipIndex % clips.length];
      clipIndex += 1;

      // load the next clip into the back layer, then crossfade it forward
      playOn(back, nextSrc).then(() => {
        back.classList.add('show');
        front.classList.remove('show');
        // after the crossfade, pause the now-hidden layer to save decode
        setTimeout(() => { try { front.pause(); } catch (e) {} }, 900);
        // swap roles
        heroCycle.front = back;
        heroCycle.back = front;
        // schedule the next swap using the alternating 5s / 3s cadence
        const dwell = HERO_DURATIONS[heroCycle.step % HERO_DURATIONS.length];
        heroCycle.step += 1;
        heroCycle.timer = setTimeout(advance, dwell);
      });
    }

    // kick off: show the first clip immediately, then start the cadence
    playOn(vidA, clips[clipIndex % clips.length]).then(() => {
      clipIndex += 1;
      vidA.classList.add('show');
      const dwell = HERO_DURATIONS[heroCycle.step % HERO_DURATIONS.length];
      heroCycle.step += 1;
      heroCycle.timer = setTimeout(advance, dwell);
    });

    // pause the whole cycle while the tab is backgrounded
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(heroCycle.timer);
      } else if (heroCycle.clips.length && !reduceMotion) {
        const dwell = HERO_DURATIONS[heroCycle.step % HERO_DURATIONS.length];
        heroCycle.timer = setTimeout(advance, dwell);
      }
    });
  }

  // ---------- roster grid ----------
  // Fallback list, used only if /api/roster can't be reached. The live list
  // is managed in the admin (Campus Ambassadors) and loaded below.
  let ROSTER = [
    ['Maya R.', 'Lifestyle', 'UofT'], ['Devon K.', 'Fitness', 'TMU'], ['Priya S.', 'Food', 'Waterloo'],
    ['Liam O.', 'Tech', 'UBC'], ['Chloe M.', 'Fashion', 'McGill'], ['Andre P.', 'Sports', 'Western'],
    ['Sofia L.', 'Beauty', 'Queen\u2019s'], ['Noah T.', 'Film', 'Concordia'], ['Aisha B.', 'Wellness', 'York'],
    ['Ethan W.', 'Gaming', 'McMaster'], ['Zara H.', 'Art', 'SFU'], ['Marcus D.', 'Music', 'UCalgary'],
  ].map(([name, focus, school], i) => ({ id: i + 1, name, focus, school }));

  function loadRoster() {
    fetch('/api/roster', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (data && Array.isArray(data.ambassadors)) { ROSTER = data.ambassadors; buildRoster(); }
      })
      .catch(() => { /* keep the fallback list */ });
  }

  function buildRoster() {
    const grid = document.getElementById('talRoster');
    if (!grid) return;
    const { photos, videos } = collectMedia();
    grid.innerHTML = '';

    grid.style.setProperty('--rows', Math.max(1, Math.ceil(ROSTER.length / 3)));
    ROSTER.forEach((person, i) => {
      person = Object.assign({}, person, {
        tone: (i % 5) + 1,
        tag: [person.focus, person.school].filter(Boolean).join(' \u00b7 '),
      });
      const card = document.createElement('article');
      card.className = 'tal-card';

      const media = document.createElement('div');
      media.className = 'tal-card-media t' + person.tone;

      // prefer a real video (hover-to-play), else a real photo, else the
      // tinted gradient placeholder the CSS already draws
      // admin-assigned media for this roster card wins over the shared pool
      const own = typeof slotPick === 'function' ? slotPick('slot-roster-' + person.id) : null;
      const hasOwn = own && (own.video || own.poster);
      const clip = hasOwn ? (own.video ? { src: own.video, poster: own.poster } : null)
        : (videos.length ? videos[i % videos.length] : null);
      const photo = hasOwn ? (own.video ? null : own.poster)
        : (photos.length ? photos[i % photos.length] : null);

      if (clip) {
        const video = document.createElement('video');
        video.className = 'tal-card-vid';
        video.src = clip.src;
        if (clip.poster) video.poster = clip.poster;
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.disablePictureInPicture = true;
        video.disableRemotePlayback = true;
        video.addEventListener('error', () => { video.remove(); media.classList.remove('has-media'); });
        media.appendChild(video);
        media.classList.add('has-media', 'has-video');
        let hoverTimer = null;
        card.addEventListener('mouseenter', () => { clearTimeout(hoverTimer); video.play().catch(() => {}); });
        card.addEventListener('mouseleave', () => { hoverTimer = setTimeout(() => video.pause(), 150); });
      } else if (photo) {
        const img = document.createElement('img');
        img.className = 'tal-card-img';
        img.src = photo;
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => { img.remove(); media.classList.remove('has-media'); });
        media.appendChild(img);
        media.classList.add('has-media');
      } else {
        // placeholder gets a soft monogram so it reads as a person card
        const mono = document.createElement('span');
        mono.className = 'tal-card-mono';
        mono.textContent = person.name.charAt(0);
        media.appendChild(mono);
      }

      const meta = document.createElement('div');
      meta.className = 'tal-card-meta';
      const name = document.createElement('h3');
      name.textContent = person.name;
      const tag = document.createElement('span');
      tag.textContent = person.tag;
      meta.append(name, tag);

      card.append(media, meta);
      grid.appendChild(card);
    });
  }

  // ---------- scroll reveal (self-contained, doesn't depend on main.js) ----------
  // Toggles .in-view both ways — added on entry, removed on exit — so
  // each section's entrance genuinely replays every time you scroll back
  // to it, whichever direction you came from. Reduced motion skips the
  // observer entirely and just leaves everything visible.
  function setupReveal() {
    const els = document.querySelectorAll('.tal-reveal');
    if (!els.length) return;
    // talents-motion.js drives the entrances with scroll — show everything
    // in its final state and let the choreography animate the wrappers
    if (reduceMotion || !('IntersectionObserver' in window) || document.documentElement.classList.contains('cc-choreo')) {
      els.forEach((el) => el.classList.add('in-view'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        e.target.classList.toggle('in-view', e.isIntersecting);
      });
    }, { threshold: 0.15 });
    els.forEach((el) => io.observe(el));
  }

  // ---------- apply modal ----------
  // Same open/close contract as the brands contact modal (toggles
  // modal-open on <html>/<body>, closes on backdrop, X, or Escape).
  function setupApplyModal() {
    const modal = document.getElementById('applyModal');
    const backdrop = document.getElementById('applyModalBackdrop');
    const closeBtn = document.getElementById('applyModalClose');
    if (!modal) return;

    const openers = [
      'openApplyNav', 'openApplyHero', 'openApplyRoster',
      'openApplyFaq', 'openApplyCloser', 'openApplyFooter',
    ].map((id) => document.getElementById(id)).filter(Boolean);

    let lastFocus = null;
    function open(e) {
      if (e) e.preventDefault();
      lastFocus = document.activeElement;
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('modal-open');
      document.body.classList.add('modal-open');
      const first = modal.querySelector('input, select, button');
      if (first) setTimeout(() => first.focus(), 40);
    }
    function close() {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      document.documentElement.classList.remove('modal-open');
      document.body.classList.remove('modal-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    openers.forEach((el) => el.addEventListener('click', open));
    if (backdrop) backdrop.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('open')) close();
    });
  }

  // ---------- apply form: saved on the server, viewable in the admin inbox ----------
  function setupApplyForm() {
    const form = document.getElementById('applyForm');
    const msg = document.getElementById('applyFormMsg');
    if (!form || !msg) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // native validation first
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      // at least one interest required (checkbox groups aren't covered by required)
      const interests = Array.from(form.querySelectorAll('input[name="interests"]:checked')).map((c) => c.value);
      if (!interests.length) {
        msg.textContent = 'Please pick at least one interest so we can match you well.';
        msg.className = 'tal-form-msg show err';
        return;
      }

      const fields = {};
      new FormData(form).forEach((v, k) => { if (k !== 'interests' && k !== 'website') fields[k] = v; });
      fields.interests = interests;
      const honeypot = form.querySelector('[name=website]');
      const btn = form.querySelector('[type=submit]');
      if (btn) btn.disabled = true;

      try {
        const res = await fetch('/api/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'talent', website: honeypot ? honeypot.value : '', fields }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
        form.reset();
        msg.textContent = "Application received! We'll reach out when there's a campaign that fits you.";
        msg.className = 'tal-form-msg show';
      } catch (err) {
        msg.textContent = err.message && err.message.indexOf('fetch') === -1 ? err.message : 'Could not send right now. Please try again.';
        msg.className = 'tal-form-msg show err';
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  // ---------- card FX: cursor spotlight (+ 3D tilt on why cards) ----------
  function setupCardFx() {
    if (reduceMotion || !window.matchMedia('(hover: hover)').matches) return;
    document.querySelectorAll('.tal-why-card, .tal-step, .tal-faq-item').forEach((el) => {
      const tilt = el.classList.contains('tal-why-card');
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        el.style.setProperty('--mx', x + 'px');
        el.style.setProperty('--my', y + 'px');
        if (tilt) {
          el.style.setProperty('--ry', ((x / r.width - 0.5) * 10).toFixed(2) + 'deg');
          el.style.setProperty('--rx', ((0.5 - y / r.height) * 10).toFixed(2) + 'deg');
        }
      });
      el.addEventListener('pointerleave', () => {
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
      });
    });
  }

  // ---------- roster: click-and-drag to scroll (mouse only) ----------
  function setupRosterDrag() {
    const el = document.getElementById('talRoster');
    if (!el) return;
    let down = false, startX = 0, startLeft = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; startX = e.clientX; startLeft = el.scrollLeft;
      el.classList.add('dragging');
    });
    window.addEventListener('pointermove', (e) => {
      if (down) el.scrollLeft = startLeft - (e.clientX - startX);
    });
    window.addEventListener('pointerup', () => {
      if (!down) return;
      down = false;
      el.classList.remove('dragging');
    });
  }

  // ---------- FAQ: smooth height animation, one open at a time ----------
  // One-at-a-time also keeps the section within a single screen, so the
  // section-jump behaviour stays intact.
  function setupFaqAccordion() {
    const items = Array.from(document.querySelectorAll('.tal-faq-item, .tq-item'));
    const EASE = 'cubic-bezier(.22,1,.36,1)';
    function close(d) {
      const body = d.querySelector('p');
      if (!d.open || !body) return;
      if (reduceMotion) { d.open = false; return; }
      const h = body.offsetHeight;
      body.style.overflow = 'hidden';
      body.animate(
        [{ height: h + 'px', opacity: 1, marginBottom: getComputedStyle(body).marginBottom }, { height: '0px', opacity: 0, marginBottom: '0px' }],
        { duration: 320, easing: EASE }
      ).onfinish = () => { d.open = false; body.style.overflow = ''; };
    }
    function open(d) {
      const body = d.querySelector('p');
      d.open = true;
      if (reduceMotion || !body) return;
      const h = body.offsetHeight;
      body.style.overflow = 'hidden';
      body.animate(
        [{ height: '0px', opacity: 0, marginBottom: '0px' }, { height: h + 'px', opacity: 1, marginBottom: getComputedStyle(body).marginBottom }],
        { duration: 420, easing: EASE }
      ).onfinish = () => { body.style.overflow = ''; };
    }
    items.forEach((d) => {
      const s = d.querySelector('summary');
      if (!s) return;
      s.addEventListener('click', (e) => {
        e.preventDefault();
        if (d.open) { close(d); return; }
        items.forEach((o) => { if (o !== d) close(o); });
        open(d);
      });
    });
  }

  // ---------- closer/footer: blurred ambient video (same as Brands contact) ----------
  function setupCloserVideo() {
    const video = document.getElementById('talCloserVideo');
    const section = document.getElementById('tal-closer');
    if (!video || !section) return;
    function assign() {
      // footer backdrop: the Twisted Tea campaign clip (matched loosely, so
      // "Twisted Tea", "TwistedTea" or "Twisted Tea Canada" all work);
      // falls back to any other brand video if Twisted Tea has none yet
      const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
      const data = (typeof MEDIA_DATA !== 'undefined' && MEDIA_DATA) ? MEDIA_DATA : {};
      const resolve = (typeof resolveMedia === 'function') ? resolveMedia : (x) => x;
      const key = Object.keys(data).find((k) => norm(k).includes('twistedtea'));
      const tt = key ? ((data[key].videos || []).find((v) => v && v.src)) : null;
      let pick = tt ? { src: resolve(tt.src) } : null;
      if (!pick) {
        const { videos } = collectMedia();
        if (!videos.length) return;
        pick = videos[videos.length > 1 ? 1 : 0];
      }
      if (video.getAttribute('src') === pick.src) return;
      video.src = pick.src;
      if (section.dataset.visible === '1' && !reduceMotion) video.play().catch(() => {});
    }
    assign();
    document.addEventListener('mediaDataReady', assign);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        const vis = entries[0].isIntersecting;
        section.dataset.visible = vis ? '1' : '0';
        if (vis && video.src && !reduceMotion) video.play().catch(() => {});
        else video.pause();
      }, { threshold: 0.1 }).observe(section);
    }
  }

  // ---------- boot ----------
  function boot() {
    startHeroVideoCycle();
    buildRoster();
    loadRoster();
    setupReveal();
    setupApplyModal();
    setupApplyForm();
    setupCardFx();
    setupRosterDrag();
    setupFaqAccordion();
    setupCloserVideo();
    // if main.js loads real media after us, rebuild the media-driven parts
    document.addEventListener('mediaDataReady', () => {
      startHeroVideoCycle();
      buildRoster();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
