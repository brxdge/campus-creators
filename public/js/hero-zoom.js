// ============================================================
// Section entrance animations (What We Do) — built on GSAP
// ScrollTrigger. The hero scroll-zoom that previously lived in this
// file has been removed; hero is now a plain jump section.
// ============================================================

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
// The "expand from centre" entrance built for What We Do — kept general
// (sectionId + opts) rather than hard-coded, so another section can reuse
// it later without duplicating the mechanism.
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