// ============================================================
// Brands page — scroll choreography.
//
// One continuous motion sequence instead of section-by-section jumps:
//   Lenis smooth scroll  ->  GSAP ScrollTrigger drives every section.
//
//   Hero ........ pinned; wall zooms + tilts, headline recedes while
//                 What We Do slides up OVER it on a rounded card that
//                 opens to full-bleed
//   What We Do .. pinned; scroll steps through the six services, the
//                 giant background word travels sideways
//   Creators .... oversized headline compresses into place, a ghost
//                 line of type drifts across, phones rise in 3D
//   How it works  pinned; headline makes room as the four steps deal in
//   Activations . orange panel opens from a card to full-bleed
//   The Work .... screen irises open, footage settles from 1.35x
//   About ....... white expands over black as a circle, words rise
//   FAQ / Contact type scales into place, footer lifts
//
// Only transform / opacity / clip-path are animated. Desktop gets the full
// sequence; phones get a lighter version (no pins, no smooth scroll);
// prefers-reduced-motion gets none of it.
// ============================================================
(function brandsMotion() {
  const root = document.documentElement;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!document.body.classList.contains('brands-body')) return;

  gsap.registerPlugin(ScrollTrigger);
  root.classList.add('cc-choreo');

  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const vh = () => window.innerHeight;

  // ---------- helpers ----------
  // wraps each word of an element in a masked span so words can rise
  // individually (keeps inline images like the brand star intact)
  function splitWords(el) {
    if (!el || el.dataset.split) return [];
    el.dataset.split = '1';
    const out = [];
    Array.from(el.childNodes).forEach((node) => {
      if (node.nodeType !== 3) return;
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
        const mask = document.createElement('span');
        mask.className = 'cc-word';
        const inner = document.createElement('span');
        inner.textContent = part;
        mask.appendChild(inner);
        frag.appendChild(mask);
        out.push(inner);
      });
      node.replaceWith(frag);
    });
    return out;
  }

  // a giant outlined line of type that drifts across a section
  function ghostLine(section, text) {
    if (!section) return null;
    const g = document.createElement('div');
    g.className = 'cc-ghost';
    g.setAttribute('aria-hidden', 'true');
    g.textContent = text;
    section.prepend(g);
    return g;
  }

  const mm = gsap.matchMedia();

  // ============================================================
  // DESKTOP — full choreography
  // ============================================================
  mm.add('(min-width: 901px)', () => {
    root.classList.add('cc-choreo-desktop');

    // ---------- Lenis smooth scroll, driven by GSAP's ticker ----------
    let lenis = null;
    if (typeof Lenis !== 'undefined') {
      lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
      lenis.on('scroll', ScrollTrigger.update);
      const raf = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(raf);
      gsap.ticker.lagSmoothing(0);
      window.ccLenis = lenis;

      // freeze the page behind any open modal
      const mo = new MutationObserver(() => {
        if (root.classList.contains('modal-open')) lenis.stop(); else lenis.start();
      });
      mo.observe(root, { attributes: true, attributeFilter: ['class'] });

      // in-page links glide instead of jumping
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

      // cleanup when crossing to the phone layout
      var cleanupLenis = () => {
        document.removeEventListener('click', onClick);
        mo.disconnect();
        gsap.ticker.remove(raf);
        lenis.destroy();
        window.ccLenis = null;
      };
    }

    // ---------- HERO -> WHAT WE DO: overlap ----------
    const hero = $('#hero');
    const services = $('#services');
    if (hero && services) {
      // pin + scrub on ONE trigger: a second trigger on an element that's
      // being pinned would measure itself after the pin and never fire
      gsap.timeline({ scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', pin: true, pinSpacing: false, scrub: true } })
        .to('#hero .hero-inner', { scale: 0.86, yPercent: -18, opacity: 0, ease: 'none' }, 0)
        .to('#hero .feed-wall', { scale: 1.22, rotate: -3, ease: 'none' }, 0)
        .to('#hero .feed-wall', { opacity: 0.45, ease: 'none' }, 0);

      gsap.fromTo(services,
        { clipPath: 'inset(9% 5% 0% 5% round 42px)' },
        { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
          scrollTrigger: { trigger: services, start: 'top bottom', end: 'top top', scrub: true } });
    }

    // ---------- WHAT WE DO: pinned, scroll steps through services ----------
    if (services && window.CCServices) {
      const n = window.CCServices.count;
      window.CCServices.setScrollDriven(true);

      // entrance while it slides up over the hero
      gsap.timeline({ scrollTrigger: { trigger: services, start: 'top bottom', end: 'top top', scrub: true } })
        .from('#services .svc-title', { scale: 1.45, yPercent: 40, transformOrigin: 'left bottom', ease: 'none' }, 0)
        .from('#services .svc-item', { yPercent: 120, opacity: 0, stagger: 0.06, ease: 'none' }, 0.1)
        .from('#services .svc-stage', { yPercent: 22, rotate: 5, scale: 0.9, ease: 'none' }, 0);

      const svcPin = ScrollTrigger.create({
        trigger: services,
        start: 'top top',
        end: () => '+=' + vh() * (n * 0.55),
        pin: true,
        onUpdate: (self) => {
          const pos = self.progress * n;
          const i = Math.min(n - 1, Math.floor(pos));
          window.CCServices.setActive(i);
          window.CCServices.setBar(i === n - 1 && self.progress >= 1 ? 1 : pos - i);
        },
      });

      gsap.fromTo('#services .svc-bgword',
        { xPercent: 12 },
        { xPercent: -28, ease: 'none', scrollTrigger: { trigger: services, start: 'top top', end: () => '+=' + vh() * (n * 0.55), scrub: true } });

      // clicking a service glides to its point in the pinned timeline
      const onSelect = (e) => {
        if (!lenis) return;
        const i = e.detail.index;
        const y = svcPin.start + ((i + 0.5) / n) * (svcPin.end - svcPin.start);
        lenis.scrollTo(y, { duration: 1 });
      };
      document.addEventListener('cc:svc-select', onSelect);
      var cleanupSvc = () => {
        document.removeEventListener('cc:svc-select', onSelect);
        window.CCServices.setScrollDriven(false);
      };
    }

    // ---------- CREATORS IN ACTION: type compresses in, phones rise ----------
    const clients = $('#clientsSection');
    if (clients) {
      const ghost = ghostLine(clients, 'Creators in action \u2726 Creators in action \u2726');
      gsap.fromTo(ghost, { xPercent: 5 }, { xPercent: -45, ease: 'none',
        scrollTrigger: { trigger: clients, start: 'top bottom', end: 'bottom top', scrub: true } });

      gsap.timeline({ scrollTrigger: { trigger: clients, start: 'top 95%', end: 'top 30%', scrub: true } })
        .from('.clients-head h2', { scale: 2.1, opacity: 0.15, transformOrigin: '50% 50%', ease: 'none' }, 0)
        .from('.client-tab', { y: 50, opacity: 0, stagger: 0.03, ease: 'none' }, 0.25)
        .from('.showcase-carousel', { yPercent: 28, rotateX: 22, scale: 0.86, opacity: 0, transformPerspective: 1200, ease: 'none' }, 0.2);
    }

    // ---------- HOW IT WORKS: pinned, steps deal in ----------
    const process = $('#process');
    if (process) {
      const steps = $$('#howSteps .how-step');
      const tl = gsap.timeline({
        scrollTrigger: { trigger: process, start: 'top top', end: () => '+=' + vh() * 1.6, pin: true, scrub: 0.6 },
      });
      tl.from('#process .sec-head h2', { yPercent: 70, scale: 1.25, ease: 'power2.out', duration: 1 }, 0)
        .from('#process .sec-head p', { opacity: 0, y: 30, duration: 0.5 }, 0.5);
      steps.forEach((s, i) => {
        tl.fromTo(s, {
          xPercent: 60 + i * 15, yPercent: 30, rotate: 8 + i * 2, opacity: 0,
          clipPath: 'inset(-10% -10% -25% 100% round 18px)',
        }, {
          xPercent: 0, yPercent: 0, rotate: 0, opacity: 1,
          clipPath: 'inset(-10% -10% -25% -10% round 18px)',
          duration: 1, ease: 'power3.out',
        }, 0.6 + i * 0.45);
      });
      if ($('#process .how-cta')) tl.from('#process .how-cta', { opacity: 0, y: 20, duration: 0.5 }, '>-0.3');
    }

    // ---------- CAMPUS ACTIVATIONS: orange panel opens ----------
    const band = $('.band');
    if (band) {
      const words = splitWords($('.band h2'));
      gsap.timeline({ scrollTrigger: { trigger: band, start: 'top bottom', end: 'top 15%', scrub: true } })
        .fromTo(band, { clipPath: 'inset(16% 14% 16% 14% round 48px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none' }, 0)
        .from(words, { yPercent: 110, stagger: 0.05, ease: 'none' }, 0.2)
        .from('.band-side', { opacity: 0, x: 60, ease: 'none' }, 0.45);
    }

    // ---------- THE WORK: the screen irises open ----------
    const work = $('#work');
    if (work) {
      gsap.timeline({ scrollTrigger: { trigger: work, start: 'top 95%', end: 'top 30%', scrub: true } })
        .fromTo('.wk-screen', { clipPath: 'inset(16% 24% 16% 24% round 44px)' }, { clipPath: 'inset(0% 0% 0% 0% round 26px)', ease: 'none' }, 0)
        .fromTo('.wk-slides', { scale: 1.35 }, { scale: 1, ease: 'none' }, 0)
        .from('.wk-head h2', { xPercent: -30, opacity: 0, ease: 'none' }, 0)
        .from('.wk-nav', { xPercent: 40, opacity: 0, ease: 'none' }, 0.1)
        .from('.wk-tab', { y: 24, opacity: 0, stagger: 0.08, ease: 'none' }, 0.35);
    }

    // ---------- ABOUT: white opens over black, words rise ----------
    const about = $('#about');
    if (about) {
      const words = splitWords($('#about .about h2'));
      gsap.timeline({ scrollTrigger: { trigger: about, start: 'top bottom', end: 'top top', scrub: true } })
        .fromTo(about, { clipPath: 'circle(0% at 50% 100%)' }, { clipPath: 'circle(150% at 50% 100%)', ease: 'none' }, 0)
        .from(words, { yPercent: 115, rotate: 4, stagger: 0.025, ease: 'none' }, 0.25)
        .from('#about .about > div:first-child p, #about .about .btn', { opacity: 0, y: 30, ease: 'none' }, 0.55)
        .from('#about .about-pull', { xPercent: 25, opacity: 0, ease: 'none' }, 0.4);
    }

    // ---------- FAQ ----------
    const faq = $('#faq');
    if (faq) {
      gsap.timeline({ scrollTrigger: { trigger: faq, start: 'top 95%', end: 'top 30%', scrub: true } })
        .from('#faq h2', { scale: 1.5, transformOrigin: 'left bottom', opacity: 0.2, ease: 'none' }, 0)
        .from('#faq .faq-item', { x: 80, opacity: 0, stagger: 0.07, ease: 'none' }, 0.15);
    }

    // ---------- CONTACT ----------
    const contact = $('#contact');
    if (contact) {
      gsap.timeline({ scrollTrigger: { trigger: contact, start: 'top bottom', end: 'top 30%', scrub: true } })
        .from('.contact-cta-link', { scale: 0.55, yPercent: 40, opacity: 0.1, ease: 'none' }, 0)
        .from('.student-note', { y: 40, opacity: 0, ease: 'none' }, 0.35)
        .from('#contact .site-footer', { yPercent: 25, opacity: 0, ease: 'none' }, 0.45);
    }

    return () => {
      root.classList.remove('cc-choreo-desktop');
      $$('.cc-ghost').forEach((g) => g.remove());
      if (typeof cleanupSvc === 'function') cleanupSvc();
      if (typeof cleanupLenis === 'function') cleanupLenis();
    };
  });

  // ============================================================
  // PHONES — lighter: no pins, native scroll, a few scrubbed moments
  // ============================================================
  mm.add('(max-width: 900px)', () => {
    const band = $('.band');
    if (band) {
      gsap.fromTo(band, { clipPath: 'inset(8% 6% 8% 6% round 28px)' }, { clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
        scrollTrigger: { trigger: band, start: 'top bottom', end: 'top 30%', scrub: true } });
    }
    if ($('.wk-screen')) {
      gsap.timeline({ scrollTrigger: { trigger: '#work', start: 'top 90%', end: 'top 20%', scrub: true } })
        .fromTo('.wk-screen', { clipPath: 'inset(10% 12% 10% 12% round 26px)' }, { clipPath: 'inset(0% 0% 0% 0% round 18px)', ease: 'none' }, 0)
        .fromTo('.wk-slides', { scale: 1.25 }, { scale: 1, ease: 'none' }, 0);
    }
    const about = $('#about');
    if (about) {
      gsap.fromTo(about, { clipPath: 'circle(0% at 50% 100%)' }, { clipPath: 'circle(150% at 50% 100%)', ease: 'none',
        scrollTrigger: { trigger: about, start: 'top bottom', end: 'top 25%', scrub: true } });
    }
    ['.svc-title', '.clients-head h2', '#process .sec-head h2', '.wk-head h2', '#faq h2'].forEach((sel) => {
      const el = $(sel);
      if (!el) return;
      gsap.from(el, { scale: 1.3, opacity: 0.2, ease: 'none', transformOrigin: '50% 100%',
        scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 55%', scrub: true } });
    });
  });

  // keep measurements right once fonts / late media settle
  window.addEventListener('load', () => ScrollTrigger.refresh());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  document.addEventListener('mediaDataReady', () => setTimeout(() => ScrollTrigger.refresh(), 300));
})();