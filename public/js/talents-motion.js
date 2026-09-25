// ============================================================
// Talents page — scroll choreography (same system as the Brands page).
//
//   Hero ............ pinned; footage zooms, headline recedes while
//                     Why Join rises over it on a rounded card
//   Why Join ........ heading settles from oversized, cards wipe in
//   Ambassadors ..... pinned; scroll pans the roster sideways
//   From apply to paid  pinned; the four steps wipe in one by one
//   Questions ....... intro holds, questions wipe in
//   Closer .......... giant headline settles, stars drift, footer lifts
//
// One scroll gesture glides to the next section (or next step inside a
// pinned one). Only transform / opacity / clip-path / scroll position are
// animated, and only on wrappers — the cards keep their own hover effects.
// Phones get a lighter version; prefers-reduced-motion gets none.
// ============================================================
(function talentsMotion() {
  const root = document.documentElement;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!document.body.classList.contains('tal-body')) return;

  gsap.registerPlugin(ScrollTrigger);
  root.classList.add('cc-choreo');   // talents.js sees this and leaves reveals to us

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const vh = () => window.innerHeight;
  const mm = gsap.matchMedia();

  // ============================================================
  // DESKTOP
  // ============================================================
  mm.add('(min-width: 901px)', () => {
    root.classList.add('cc-choreo-desktop');

    // ---------- Lenis (programmatic smooth scroll; wheel handled by glide) ----------
    let lenis = null;
    let cleanupLenis = null;
    if (typeof Lenis !== 'undefined') {
      lenis = new Lenis({ duration: 1.15, smoothWheel: false });
      lenis.on('scroll', ScrollTrigger.update);
      const raf = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      window.ccLenis = lenis;
      const mo = new MutationObserver(() => {
        if (root.classList.contains('modal-open')) lenis.stop(); else lenis.start();
      });
      mo.observe(root, { attributes: true, attributeFilter: ['class'] });
      const onClick = (e) => {
        if (e.defaultPrevented) return;
        const a = e.target.closest('a[href^="#"]');
        if (!a) return;
        const id = a.getAttribute('href');
        if (id.length < 2) return;
        const target = document.querySelector(id);
        if (!target) return;
        e.preventDefault();
        lenis.scrollTo(target, { offset: 0, duration: 1.4 });
      };
      document.addEventListener('click', onClick);
      cleanupLenis = () => {
        document.removeEventListener('click', onClick);
        mo.disconnect();
        gsap.ticker.remove(raf);
        lenis.destroy();
        window.ccLenis = null;
      };
    }

    // ---------- HERO -> WHY JOIN overlap ----------
    const hero = $('#talHero');
    const why = $('#tal-why');
    if (hero && why) {
      gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', pin: true, pinSpacing: false, scrub: true } })
        .to('#talHero .tal-hero-video', { scale: 1.18, opacity: 0.35, ease: 'none' }, 0)
        .to('#talHero .tal-hero-inner', { yPercent: -60, opacity: 0, ease: 'none' }, 0);
      gsap.fromTo(why,
        { clipPath: 'inset(9% 5% 0% 5% round 42px)' },
        { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
          scrollTrigger: { trigger: why, start: 'top bottom', end: 'top top', scrub: true } });
    }

    // ---------- WHY JOIN: heading settles, index rows wipe in ----------
    if (why) {
      gsap.timeline({ scrollTrigger: { trigger: why, start: 'top bottom', end: 'top top', scrub: true } })
        .from('#tal-why .tw-head', { scale: 1.35, xPercent: -8, transformOrigin: 'left center', opacity: 0.2, ease: 'none' }, 0)
        .fromTo('#tal-why .tw-row',
          { clipPath: 'inset(0% 100% 0% 0%)' },
          { clipPath: 'inset(-10% -10% -10% -10%)', stagger: 0.12, ease: 'none' }, 0.2)
        .from('#tal-why .tw-num', { yPercent: 60, opacity: 0, stagger: 0.12, ease: 'none' }, 0.25);
    }

    // ---------- CAMPUS AMBASSADORS: pinned sideways pan ----------
    const rosterSec = $('#tal-roster');
    const roster = $('#talRoster');
    if (rosterSec && roster) {
      gsap.timeline({ scrollTrigger: { trigger: rosterSec, start: 'top bottom', end: 'top top', scrub: true } })
        .from('#tal-roster .tal-sec-head', { xPercent: -25, opacity: 0.2, ease: 'none' }, 0)
        .from(roster, { xPercent: 30, ease: 'none' }, 0);
      gsap.to(roster, {
        scrollLeft: () => Math.max(0, roster.scrollWidth - roster.clientWidth),
        ease: 'none',
        scrollTrigger: {
          trigger: rosterSec, start: 'top top', end: () => '+=' + vh() * 1.3,
          pin: true, scrub: 0.25, invalidateOnRefresh: true,
        },
      });
    }

    // ---------- FROM APPLY TO PAID: pinned; the line draws, steps light up ----------
    const how = $('#tal-how');
    if (how) {
      const steps = $$('#tal-how .ts-step');
      const tl = gsap.timeline({ scrollTrigger: { trigger: how, start: 'top top', end: () => '+=' + vh() * 1.3, pin: true, scrub: 0.3 } });
      tl.from('#tal-how .ts-head', { yPercent: 70, scale: 1.3, duration: 1, ease: 'power2.out' }, 0)
        .from('#tal-how .ts-line', { opacity: 0, duration: 0.3 }, 0.35)
        .fromTo('#tal-how .ts-line i', { scaleX: 0 }, { scaleX: 1, duration: 2, ease: 'none' }, 0.5);
      steps.forEach((s, i) => {
        tl.from(s.querySelector('.ts-dot'), { scale: 0, duration: 0.25, ease: 'back.out(3)' }, 0.5 + i * 0.5)
          .from(s.querySelector('.ts-num'), { yPercent: 60, opacity: 0, duration: 0.5, ease: 'power3.out' }, 0.55 + i * 0.5)
          .from([s.querySelector('h3'), s.querySelector('p')], { y: 24, opacity: 0, stagger: 0.08, duration: 0.45, ease: 'power3.out' }, 0.65 + i * 0.5);
      });
    }

    // ---------- QUESTIONS: intro settles, rows wipe in ----------
    const faq = $('#tal-faq');
    if (faq) {
      gsap.timeline({ scrollTrigger: { trigger: faq, start: 'top 95%', end: 'top 25%', scrub: true } })
        .from('#tal-faq .tq-intro', { xPercent: -15, scale: 1.2, transformOrigin: 'left center', opacity: 0.2, ease: 'none' }, 0)
        .fromTo('#tal-faq .tq-item',
          { clipPath: 'inset(0% 0% 0% 100%)' },
          { clipPath: 'inset(-10% -10% -10% -10%)', stagger: 0.1, ease: 'none' }, 0.15);
    }

    // ---------- CLOSER ----------
    const closer = $('#tal-closer');
    if (closer) {
      gsap.timeline({ scrollTrigger: { trigger: closer, start: 'top bottom', end: 'top 25%', scrub: true } })
        .from('#tal-closer .tal-closer-main .wrap', { scale: 1.9, yPercent: 30, opacity: 0.15, ease: 'none' }, 0)
        .from('#tal-closer .tal-closer-stars', { yPercent: 40, ease: 'none' }, 0)
        .from('#tal-closer .site-footer', { yPercent: 30, opacity: 0, ease: 'none' }, 0.4);
    }

    // ---------- one gesture = one glide to the next section ----------
    let cleanupGlide = null;
    if (lenis) {
      const secs = $$('#talHero, #tal-why, #tal-roster, #tal-how, #tal-faq, #tal-closer');
      let stops = [];
      const buildStops = () => {
        const max = ScrollTrigger.maxScroll(window);
        const pins = ScrollTrigger.getAll().filter((t) => t.pin);
        const list = [];
        secs.forEach((sec) => {
          const pin = pins.find((t) => t.trigger === sec);
          if (pin && sec.id !== 'talHero') list.push(pin.start, pin.end);
          else if (pin) list.push(pin.start);
          else {
            const top = sec.getBoundingClientRect().top + window.scrollY;
            const h = sec.offsetHeight;
            if (h > vh() + 4) list.push(top, top + h - vh());
            else list.push(top + (h - vh()) / 2);
          }
        });
        stops = Array.from(new Set(list.map((y) => Math.round(Math.max(0, Math.min(max, y)))))).sort((a, b) => a - b);
      };
      ScrollTrigger.addEventListener('refresh', buildStops);
      requestAnimationFrame(buildStops);

      let animating = false;
      let failsafe = null;
      // quick commit, soft landing: most of the distance is covered early,
      // then it eases gently into place. Shorter hops (steps inside a
      // pinned section) take less time than full-section moves.
      const ease = (t) => 1 - Math.pow(1 - t, 4);
      const durFor = (dist) => Math.min(0.90, Math.max(1.0, 0.5 + (dist / vh()) * 0.35));
      const glideTo = (y) => {
        animating = true;
        clearTimeout(failsafe);
        failsafe = setTimeout(() => { animating = false; }, 1300);
        lenis.scrollTo(y, { duration: durFor(Math.abs(y - window.scrollY)), easing: ease, lock: true, force: true,
          onComplete: () => { animating = false; clearTimeout(failsafe); } });
      };
      const step = (dir) => {
        if (!stops.length) buildStops();
        const y = window.scrollY;
        const target = dir > 0 ? stops.find((s) => s > y + 4) : [...stops].reverse().find((s) => s < y - 4);
        if (target !== undefined) glideTo(target);
      };

      let gestureLocked = false;
      let releaseTimer = null;
      const onWheel = (e) => {
        if (root.classList.contains('modal-open') || e.ctrlKey) return;
        // sideways trackpad swipes over the roster stay native
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => { gestureLocked = false; }, 180);
        if (animating || gestureLocked || Math.abs(e.deltaY) < 4) return;
        gestureLocked = true;
        step(e.deltaY > 0 ? 1 : -1);
      };
      const onKey = (e) => {
        if (root.classList.contains('modal-open')) return;
        const tag = (document.activeElement && document.activeElement.tagName) || '';
        if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
        let dir = 0;
        if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) dir = 1;
        else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) dir = -1;
        else if (e.key === 'Home') { e.preventDefault(); glideTo(0); return; }
        else if (e.key === 'End') { e.preventDefault(); glideTo(ScrollTrigger.maxScroll(window)); return; }
        if (!dir) return;
        e.preventDefault();
        if (!animating) step(dir);
      };
      const onToggle = () => setTimeout(() => ScrollTrigger.refresh(), 450);   // after the FAQ open animation
      window.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('keydown', onKey);
      document.addEventListener('toggle', onToggle, true);
      cleanupGlide = () => {
        window.removeEventListener('wheel', onWheel);
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('toggle', onToggle, true);
        ScrollTrigger.removeEventListener('refresh', buildStops);
      };
    }

    return () => {
      if (cleanupGlide) cleanupGlide();
      if (cleanupLenis) cleanupLenis();
      root.classList.remove('cc-choreo-desktop');
    };
  });

  // ============================================================
  // PHONES — native scroll, a few scrubbed moments, no pins
  // ============================================================
  mm.add('(max-width: 900px)', () => {
    if ($('#talHero .tal-hero-video')) {
      gsap.to('#talHero .tal-hero-video', { scale: 1.15, ease: 'none',
        scrollTrigger: { trigger: '#talHero', start: 'top top', end: 'bottom top', scrub: true } });
    }
    ['#tal-why .tw-head', '#tal-roster .tal-sec-head', '#tal-how .ts-head', '#tal-faq .tq-intro', '#tal-closer .tal-closer-main .wrap'].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      gsap.from(el, { scale: 1.25, opacity: 0.2, ease: 'none', transformOrigin: '50% 100%',
        scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 55%', scrub: true } });
    });
    $$('#tal-why .tw-row, #tal-how .ts-step, #tal-faq .tq-item').forEach((el) => {
      gsap.fromTo(el, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(-20% -20% -20% -20%)', ease: 'none',
        scrollTrigger: { trigger: el, start: 'top 98%', end: 'top 70%', scrub: true } });
    });
  });

  // re-measure after fonts, media and any late layout change
  window.addEventListener('load', () => ScrollTrigger.refresh());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  document.addEventListener('mediaDataReady', () => setTimeout(() => ScrollTrigger.refresh(), 300));
  if ('ResizeObserver' in window) {
    const content = document.getElementById('sections');
    let lastH = 0, t = null;
    if (content) new ResizeObserver(() => {
      const h = content.offsetHeight;
      if (Math.abs(h - lastH) < 2) return;
      lastH = h;
      clearTimeout(t);
      t = setTimeout(() => ScrollTrigger.refresh(), 150);
    }).observe(content);
  }
})();