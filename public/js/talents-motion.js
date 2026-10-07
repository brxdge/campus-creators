// ============================================================
// Ambassadors page (talents.html) — scroll choreography.   build: 2026-10-07 v10
//
//   Hero ............ pinned; footage zooms, headline recedes while
//                     Why Join rises over it on a rounded card
//   Why Join ........ heading settles from oversized, cards wipe in
//   Ambassadors ..... wipes in, then the roster pans sideways on its own
//   From apply to paid  the line draws and the four steps light up on arrival
//   Questions ....... intro slides in, questions wipe in
//   Closer .......... giant headline settles, stars drift, footer lifts
//
// One scroll gesture = one glide to the next section. Nothing holds the page
// in place any more: the roster pan and the four steps play by themselves
// when you land on them, so there are no extra scrolls hiding inside a
// section. Only transform / opacity / clip-path / scroll position are
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

    // ---------- CAMPUS AMBASSADORS: wipes in, then pans sideways by itself ----------
    const rosterSec = $('#tal-roster');
    const roster = $('#talRoster');
    if (rosterSec && roster) {
      gsap.timeline({ scrollTrigger: { trigger: rosterSec, start: 'top bottom', end: 'top top', scrub: true } })
        .from('#tal-roster .tal-sec-head', { xPercent: -25, opacity: 0.2, ease: 'none' }, 0)
        .from(roster, { xPercent: 30, ease: 'none' }, 0);

      // Not pinned and not tied to scroll distance: once the section is in
      // view the row drifts across to show the rest of the wall, then it's
      // yours (drag it, or swipe it sideways). Touching it stops the drift.
      let pan = null;
      const stopPan = () => { if (pan) { pan.kill(); pan = null; } };
      const startPan = () => {
        stopPan();
        const dist = Math.max(0, roster.scrollWidth - roster.clientWidth) - roster.scrollLeft;
        if (dist < 40) return;
        pan = gsap.to(roster, {
          scrollLeft: roster.scrollLeft + dist,
          duration: Math.min(7, Math.max(2.4, dist / 520)),
          delay: 0.55, ease: 'power2.inOut', overwrite: true, onComplete: () => { pan = null; },
        });
      };
      ScrollTrigger.create({
        trigger: rosterSec, start: 'top 45%', end: 'bottom top',
        onEnter: startPan,
        onLeaveBack: () => { stopPan(); roster.scrollLeft = 0; },
      });
      ['pointerdown', 'touchstart'].forEach((ev) => roster.addEventListener(ev, stopPan, { passive: true }));
      roster.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) stopPan(); }, { passive: true });
    }

    // ---------- FROM APPLY TO PAID: the line draws and the steps light up on arrival ----------
    const how = $('#tal-how');
    if (how) {
      const steps = $$('#tal-how .ts-step');
      const tl = gsap.timeline({ paused: true });
      tl.from('#tal-how .ts-head', { yPercent: 40, opacity: 0, scale: 1.12, duration: 0.8, ease: 'power3.out' }, 0)
        .from('#tal-how .ts-line', { opacity: 0, duration: 0.3 }, 0.35)
        .fromTo('#tal-how .ts-line i', { scaleX: 0 }, { scaleX: 1, duration: 2, ease: 'none' }, 0.5);
      steps.forEach((s, i) => {
        tl.from(s.querySelector('.ts-dot'), { scale: 0, duration: 0.25, ease: 'back.out(3)' }, 0.5 + i * 0.5)
          .from(s.querySelector('.ts-num'), { yPercent: 60, opacity: 0, duration: 0.5, ease: 'power3.out' }, 0.55 + i * 0.5)
          .from([s.querySelector('h3'), s.querySelector('p')], { y: 24, opacity: 0, stagger: 0.08, duration: 0.45, ease: 'power3.out' }, 0.65 + i * 0.5);
      });
      tl.timeScale(1.25);
      ScrollTrigger.create({
        trigger: how, start: 'top 55%', end: 'bottom top',
        onEnter: () => tl.play(),
        onLeaveBack: () => tl.pause(0),
      });
    }

    // ---------- QUESTIONS: intro slides in, rows wipe in ----------
    const faq = $('#tal-faq');
    if (faq) {
      gsap.timeline({ scrollTrigger: { trigger: faq, start: 'top 95%', end: 'top 25%', scrub: true } })
        .from('#tal-faq .tq-intro', { xPercent: -10, opacity: 0.2, ease: 'none' }, 0)
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
      let idleAt = 0;           // when the last glide released input
      const release = () => { animating = false; idleAt = performance.now(); clearTimeout(failsafe); };
      // quick commit, soft landing: most of the distance is covered early,
      // then it eases gently into place. Shorter hops (steps inside a
      // pinned section) take less time than full-section moves.
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2) * 0.35 + (1 - Math.pow(1 - t, 3)) * 0.65;
      const durFor = (dist) => Math.min(1.15, Math.max(0.85, 0.75 + (dist / vh()) * 0.4));
      const glideTo = (y) => {
        animating = true;
        clearTimeout(failsafe);
        const dur = durFor(Math.abs(y - window.scrollY));
        // Failsafe: whatever happens to the animation, input is handed back
        // shortly after it should have finished, and the page is put exactly
        // on its target, so a glide can never leave the page stuck.
        failsafe = setTimeout(() => {
          if (!animating) return;
          if (typeof lenis.reset === 'function') lenis.reset();
          if (Math.abs(window.scrollY - y) > 2) lenis.scrollTo(y, { immediate: true, force: true });
          release();
        }, Math.round(dur * 1000) + 450);
        lenis.scrollTo(y, { duration: dur, easing: ease, lock: true, force: true, onComplete: release });
      };
      const step = (dir) => {
        if (!stops.length) buildStops();
        const y = window.scrollY;
        const target = dir > 0 ? stops.find((s) => s > y + 4) : [...stops].reverse().find((s) => s < y - 4);
        if (target !== undefined) glideTo(target);
      };

      // One deliberate gesture = one step. A gesture ends when the wheel goes
      // quiet, REVERSES direction, or visibly speeds up again (a fresh flick
      // riding on the previous one's momentum tail). Earlier versions treated
      // any unbroken stream of wheel events as ONE gesture and silently
      // dropped anything under 4px, so a trackpad / Magic Mouse tail, a
      // smooth-scrolling mouse utility or Firefox's line-based wheel could
      // swallow the next flick (worst at the bottom of the page, where people
      // keep flicking down and then try to go back up).
      const GAP_MS = 90;        // quiet time that separates two gestures
      const MIN_PX = 3;         // travel needed to count as intent (stray 1-2px twitches don't)
      let lastT = 0, lastSign = 0, lastAbs = 0, acc = 0, armed = 0;
      const wheelPx = (e) => (e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * vh() : e.deltaY);
      const onWheel = (e) => {
        if (root.classList.contains('modal-open') || e.ctrlKey) return;
        // sideways trackpad swipes over the roster stay native
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault();
        const d = wheelPx(e);
        if (!d) return;
        const now = performance.now();
        const sign = d > 0 ? 1 : -1, abs = Math.abs(d);
        const fresh = now - lastT > GAP_MS                         // went quiet, then started again
          || sign !== lastSign                                     // changed direction
          || abs > lastAbs * 1.6 + 6                               // sped up: a new flick on an old tail
          || (abs >= 80 && !animating && now - idleAt > 80);       // still spinning hard after the glide landed
        lastT = now; lastSign = sign; lastAbs = abs;
        if (fresh) { acc = 0; armed = sign; }
        if (animating || armed !== sign) return;
        acc += d;
        if (Math.abs(acc) < MIN_PX) return;
        armed = 0; acc = 0;
        step(sign);
      };
      const onKey = (e) => {
        if (root.classList.contains('modal-open')) return;
        const ae = document.activeElement;
        const tag = (ae && ae.tagName) || '';
        if (/INPUT|TEXTAREA|SELECT/.test(tag) || (ae && ae.isContentEditable)) return;
        // Space on a focused button / link / FAQ question must still activate it
        if (e.key === ' ' && /^(BUTTON|A|SUMMARY)$/.test(tag)) return;
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
