// ============================================================
// Hero scroll-scrubbed zoom into "SEE" — built on GSAP ScrollTrigger.
//
// Why ScrollTrigger rather than hand-rolled scroll math:
//   • scrub:true links the animation directly to scroll position, so it
//     runs backwards when you scroll up. Bidirectional by design.
//   • pin:true handles pinning the hero, including all the measurement
//     edge cases that previously produced a corrupted transform-origin.
//   • It recalculates automatically on resize and on refresh, which is
//     what the manual webfont/layout patches were working around.
//
// GSAP is free for commercial use (Webflow made the whole library,
// ScrollTrigger included, free as of April 2025).
// ============================================================
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = window.matchMedia('(max-width: 900px)').matches;

  const zoomZone = document.getElementById('heroZoom');
  const sticky = document.querySelector('.hero-zoom-sticky');
  const heroInner = document.querySelector('.hero-zoom-sticky .hero-inner');
  const seeWord = document.querySelector('.hero h1 .hl-see');
  const feedWall = document.querySelector('.feed-wall');
  const scrim = document.querySelector('.hero-scrim');

  // How much scrolling drives the zoom. Larger = slower, more scrolling.
  const SCROLL_DISTANCE = 2200;
  const MAX_SCALE = 240;

  if (reduceMotion || smallScreen) return;              // normal hero, no zoom
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
  if (!zoomZone || !sticky || !heroInner || !seeWord) return;

  gsap.registerPlugin(ScrollTrigger);

  // The zoom must originate from the centre of the word "SEE", not the
  // centre of the text block. Measure that as a percentage of the block so
  // it stays correct at any viewport size.
  function seeOrigin() {
    const hr = heroInner.getBoundingClientRect();
    const wr = seeWord.getBoundingClientRect();
    if (!hr.width || !hr.height) return '50% 50%';
    const ox = ((wr.left + wr.width / 2) - hr.left) / hr.width * 100;
    const oy = ((wr.top + wr.height / 2) - hr.top) / hr.height * 100;
    return `${ox.toFixed(2)}% ${oy.toFixed(2)}%`;
  }

  gsap.set(heroInner, { transformOrigin: seeOrigin() });

  let zoomEngaged = false;

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: sticky,
      start: 'top top',
      end: '+=' + SCROLL_DISTANCE,
      pin: true,
      pinSpacing: true,
      scrub: 1,              // slight smoothing; scroll position still drives it
      invalidateOnRefresh: true,
    },
  });

  // Pause the video spotlight for the whole time the zoom is engaged.
  //
  // This is driven by the TIMELINE's playhead, not the ScrollTrigger's
  // scroll progress. With scrub:1 the animation eases toward the scroll
  // position rather than snapping to it, so scroll progress can already be
  // back at 0 while the hero is still visually zoomed in — which let the
  // spotlight pop up over a still-black screen. The playhead is the honest
  // signal for "is the zoom actually visible right now".
  const hero = document.querySelector('.hero');

  tl.eventCallback('onUpdate', () => {
    const engaged = tl.progress() > 0.001;
    if (engaged !== zoomEngaged) {
      zoomEngaged = engaged;
      document.dispatchEvent(
        new CustomEvent(engaged ? 'heroZoomDone' : 'heroZoomReturn')
      );
      // The headline has a 40px-blur text-shadow and "SEE" has a 2px
      // text-stroke — both real rendering costs, and both recompute on
      // every scrub frame while the text is scaled up to 240x. At rest
      // they're cheap and worth keeping (they give the hero depth against
      // the busy photo wall); during the zoom they're pure overhead, since
      // you're looking at solid colour by the time it matters. Toggling
      // them off for the duration is one of the biggest wins available.
      hero && hero.classList.toggle('zoom-active', engaged);
    }
  });

  // The photo wall has to be gone before the text fills the screen — photos
  // turn to blurry mush at high zoom, unlike solid-colour type.
  tl.to([feedWall, scrim].filter(Boolean), {
    opacity: 0,
    ease: 'none',
    duration: 0.45,
  }, 0);

  // The whole hero text block scales up together, centred on "SEE".
  tl.to(heroInner, {
    scale: MAX_SCALE,
    ease: 'power2.in',      // starts gently, accelerates — reads as "flying in"
    duration: 1,
  }, 0);

  // The headline uses Anton (a webfont). Text metrics shift when it swaps in,
  // which moves the word "SEE" — so recompute the origin and let ScrollTrigger
  // remeasure once fonts are actually ready.
  function refresh() {
    gsap.set(heroInner, { transformOrigin: seeOrigin() });
    ScrollTrigger.refresh();
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  window.addEventListener('load', refresh);
})();

// ============================================================
// "What we do" section entrance.
//
// This section's background is the same colour the hero zoom resolves
// into, so the entrance is built to read as the content EMERGING from
// that darkness rather than sliding in from somewhere else:
//   1. the whole block settles down from slightly overscaled + blurred,
//      as if the camera is pulling focus after the zoom
//   2. the heading wipes in left-to-right
//   3. each service row's separator line draws across, then its title
//      wipes in and its description fades — staggered down the list
// ============================================================
// The "expand from centre" entrance built for What We Do — generalized
// here so it can be reused for the Connect section too, rather than
// duplicating the whole mechanism.
function attachExpandEntrance(sectionId, opts) {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const section = document.getElementById(sectionId);
  if (!section || reduceMotion) return;      // reduced motion: show as-is

  const wrap = section.querySelector('.wrap');
  if (!wrap) return;

  const o = Object.assign({
    scaleFrom: 0.35,
    blurFrom: 0,
    end: 'top 40%',
    scrub: 0.3,
  }, opts);

  const fromVars = { scale: o.scaleFrom, opacity: 0 };
  const toVars = { scale: 1, opacity: 1, ease: 'none' };
  if (o.blurFrom) {
    fromVars.filter = `blur(${o.blurFrom}px)`;
    toVars.filter = 'blur(0px)';
  }

  gsap.set(wrap, Object.assign({ transformOrigin: 'center center' }, fromVars));

  // Scroll-linked (scrub) rather than a fixed-time animation: the reveal's
  // progress is a direct function of scroll position, so scrolling a
  // little shows a little, scrolling more shows more — "something coming"
  // as you scroll, rather than a fixed duration that plays the same every
  // time regardless of how fast or slow you actually scroll.
  //
  // Still deliberately has NO pin. Three earlier attempts at pinning a
  // section on this page all crashed after repeated cycles — but every one
  // of those also used pin; scrub itself was never tested without it. Pin
  // specifically manipulates document flow (inserting spacers, freezing
  // scroll position), which is what's suspected to fight the hero's own
  // adjacent pin. Scrub alone just maps scroll position to animation
  // progress — it doesn't touch document flow at all, so it shouldn't have
  // the same failure mode.
  gsap.timeline({
    scrollTrigger: {
      trigger: section,
      start: 'top bottom',   // the moment it starts entering view from below
      end: o.end,
      scrub: o.scrub,
    },
  }).fromTo(wrap, fromVars, toVars);
}

// Services keeps its existing, already-accepted behaviour exactly as-is —
// this hasn't been flagged as a problem, so it isn't being changed.
attachExpandEntrance('services');

// Connect gets a slower, more deliberate version: a MUCH longer scroll
// distance (a full viewport's worth, not ~40% of one) so it genuinely
// reads as gradual rather than "technically scroll-linked but still
// quick"; a barely-there scale range (0.94->1) so the text's position and
// size stay essentially fixed the whole time, matching "already at the
// middle"; and a prominent blur-to-sharp as the primary reveal cue rather
// than size doing most of the work. scrub:true (no smoothing lag at all)
// so it tracks scroll input as directly as possible — the point is to
// feel mechanically tied to the scroll, not eased or delayed.
attachExpandEntrance('connect', {
  scaleFrom: 0.94,
  blurFrom: 22,
  end: 'top top',    // a full viewport-height of scroll distance
  scrub: true,
});