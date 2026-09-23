// ============================================================
// "How It Works" — hover-to-play video cards, a scroll-triggered staggered
// entrance for the four steps, and a low-opacity background video.
//
// Video content: there's no dedicated "process" footage uploaded, so this
// pulls real clips from the existing brand campaign library (MEDIA_DATA,
// already fetched by main.js) rather than showing nothing. It's real
// footage, just not staged to each specific step's meaning.
//
// Entrance animation: deliberately does NOT use GSAP's pin — three
// straight attempts at pinning a section on this exact page caused
// repeated crashes after a few scroll cycles (see the What We Do section's
// history in hero-zoom.js). This uses the same safe pattern that actually
// held up: hide the content on load, reveal it via a plain unpinned
// ScrollTrigger the instant it's reached.
// ============================================================
(function () {
  // ---------- hover-to-play video ----------
  function setupHoverVideo() {
    const steps = document.querySelectorAll('#howSteps .how-step');
    if (!steps.length) return;

    // Flatten every uploaded video across all brands into one pool, so
    // this doesn't depend on any single brand having footage.
    function collectVideoPool() {
      const pool = [];
      Object.keys(typeof MEDIA_DATA !== 'undefined' ? MEDIA_DATA : {}).forEach((brand) => {
        const vids = (MEDIA_DATA[brand] && MEDIA_DATA[brand].videos) || [];
        vids.forEach((v) => {
          if (v && v.src) pool.push({ brand, src: v.src, poster: v.poster || '' });
        });
      });
      return pool;
    }

    // Fallback photo pool — used when a clip has no poster of its own, so
    // the card never falls back to a flat background colour. Same-brand
    // photo preferred; any brand's photo if that brand has none.
    function collectPhotoPool() {
      const byBrand = {};
      const all = [];
      Object.keys(typeof MEDIA_DATA !== 'undefined' ? MEDIA_DATA : {}).forEach((brand) => {
        const photos = (MEDIA_DATA[brand] && MEDIA_DATA[brand].photos) || [];
        if (photos.length) byBrand[brand] = photos[0];
        photos.forEach((p) => { if (p) all.push(p); });
      });
      return { byBrand, all };
    }

    function fallbackPoster(brand, photoPool) {
      if (photoPool.byBrand[brand]) return photoPool.byBrand[brand];
      if (photoPool.all.length) return photoPool.all[0];
      return '';
    }

    function assignClips() {
      if (typeof resolveMedia !== 'function') return;
      const pool = collectVideoPool();
      const photoPool = collectPhotoPool();

      steps.forEach((step, i) => {
        const media = step.querySelector('.how-media');
        const poster = step.querySelector('.how-poster');
        const video = step.querySelector('.how-video');
        if (!media || !poster || !video) return;

        // admin-assigned media for this step wins over the shared pool
        const own = typeof slotPick === 'function' ? slotPick('slot-how-' + (i + 1)) : null;
        if (own && (own.video || own.poster)) {
          if (own.poster) poster.src = own.poster;
          if (own.video) { video.style.display = ''; video.src = own.video; }
          else { video.pause(); video.removeAttribute('src'); video.style.display = 'none'; }
        } else {
          if (!pool.length) return;   // nothing uploaded yet — card stays static
          const clip = pool[i % pool.length];   // cycle if fewer than 4 real clips exist
          const posterSrc = clip.poster || fallbackPoster(clip.brand, photoPool);
          if (posterSrc) poster.src = resolveMedia(posterSrc);
          video.style.display = '';
          video.src = resolveMedia(clip.src);
        }
        // same hardening as every other video on the site — no native
        // Picture-in-Picture or remote-playback hover icons
        video.disablePictureInPicture = true;
        video.disableRemotePlayback = true;

        if (step.dataset.hoverBound) return;
        step.dataset.hoverBound = '1';
        let hoverTimer = null;
        step.addEventListener('mouseenter', () => {
          clearTimeout(hoverTimer);
          media.classList.add('playing');
          video.play().catch(() => {});
        });
        step.addEventListener('mouseleave', () => {
          media.classList.remove('playing');
          // small delay before actually pausing, so a quick mouse pass
          // doesn't restart decode immediately on re-entry
          hoverTimer = setTimeout(() => video.pause(), 200);
        });
        // touch devices: tap toggles, since there's no hover
        step.addEventListener('touchstart', () => {
          const playing = media.classList.toggle('playing');
          if (playing) video.play().catch(() => {}); else video.pause();
        }, { passive: true });
      });
    }

    // MEDIA_DATA is populated by main.js's own fetch to /api/media, which
    // resolves asynchronously. Try immediately in case it's already ready
    // (fast connection, cached response), then again precisely when
    // main.js signals it's actually done — not a guessed delay.
    assignClips();
    document.addEventListener('mediaDataReady', assignClips);
  }

  // ---------- entrance: connecting line + sequential reveal ----------
  function setupEntrance() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const section = document.getElementById('process');
    const steps = document.querySelectorAll('#howSteps .how-step');
    if (!section || !steps.length || reduceMotion) return;

    // Hidden from page load until reached — same reasoning as What We Do:
    // without a pin, the section still arrives via ordinary scroll, so
    // hiding it for that approach is what prevents seeing it "arrive"
    // before the reveal plays.
    gsap.set(steps, { opacity: 0, y: 22 });

    const tl = gsap.timeline({ paused: true })
      .to(steps, {
        opacity: 1, y: 0, duration: 0.5, ease: 'power2.out',
        stagger: 0.12,
      });

    ScrollTrigger.create({
      trigger: section,
      start: 'top 70%',
      onEnter: () => tl.play(),
      onEnterBack: () => tl.play(),
      onLeaveBack: () => tl.reverse(),
    });
  }

  // ---------- low-opacity background video ----------
  function setupBackgroundVideo() {
    const video = document.getElementById('processVideo');
    const section = document.getElementById('process');
    if (!video || !section) return;

    // Source is a static, hardcoded file (see the video tag's src
    // attribute in index.html) — not pulled from the admin portal's
    // dynamic media library the way other background videos on this site
    // are. Only play while the section is actually visible, matching the
    // same performance-conscious pattern used everywhere else.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) video.play().catch(() => {});
          else video.pause();
        },
        { threshold: 0.1 }
      ).observe(section);
    }
  }

  function boot() {
    setupHoverVideo();
    setupEntrance();
    setupBackgroundVideo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();