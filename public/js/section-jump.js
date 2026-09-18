// ============================================================
// Hard section-jump scrolling — What We Do onward.
//
// Chosen explicitly after reviewing a reference video: one scroll gesture
// commits fully to the next section, animated smoothly (not an abrupt cut).
//
// This is NOT a retry of anything that's already failed on this page:
//   - Not GSAP ScrollTrigger pin. Three separate attempts at pinning a
//     section here crashed after repeated scroll cycles. Pin is never
//     used anywhere in this file.
//   - Not fullPage.js. That was removed entirely because it locked
//     body overflow and moved content via transforms instead of real
//     scroll — which broke the hero's zoom, since that depends on
//     genuine scroll position. This never touches overflow or body
//     scroll locking, and never runs inside the hero-zoom zone at all —
//     that zone keeps using real, uninterrupted native scroll,
//     completely untouched by anything in this file.
//   - Not the earlier native CSS scroll-snap either (that only adjusted
//     where scrolling settled after you stopped — it was removed because
//     it felt abrupt, not because it broke anything). This is a
//     different mechanism: JS computes the target and animates the
//     scroll itself, so the easing is fully controllable.
//
// Specific safety measures, given this project's history of scroll
// mechanisms getting users stuck:
//   1. The "animating" lock ALWAYS releases — via the 'scrollend' event
//      when the browser confirms the scroll genuinely finished, AND via
//      a timeout fallback in case 'scrollend' never fires for any reason.
//      There is no path where the lock can remain set forever.
//   2. Every wheel event is preventDefault'd while inside the jump zone,
//      but only the FIRST one (while unlocked) actually triggers a jump.
//      This matters because a single trackpad swipe fires many rapid
//      wheel events, not one — without an immediate, synchronous lock,
//      one swipe would trigger multiple jumps and skip sections. Locking
//      is set synchronously on the very first qualifying event.
//   3. Sections taller than one viewport (FAQ, Contact) are NOT jumped
//      into from the middle — a jump would skip straight past whatever
//      content hadn't been seen yet. Wheel/touch input passes through
//      natively while inside a tall section's body, and a jump only
//      triggers once you've already reached that section's top or
//      bottom edge.
// ============================================================
(function sectionJumpScroll() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  const sections = Array.from(document.querySelectorAll('#sections > section, #sections > .band, footer'));
  if (sections.length < 2) return;

  const heroZoom = document.getElementById('heroZoom');

  // 'connect' and 'services' each have their own scrub-linked entrance
  // animation (attachExpandEntrance in hero-zoom.js). Because
  // currentIndex() reports "arrived" as soon as the viewport's midpoint
  // crosses into a section — which happens quickly for a one-viewport
  // section — a plain hard-jump would fire on the very next wheel tick
  // and skip straight past it before its animation ever gets to settle.
  // settledScrubIdx tracks which one of these we've already "claimed" the
  // pause for; arriving at a new one consumes exactly one scroll gesture
  // to settle precisely at its own position, and only the next, separate
  // gesture is allowed to advance further.
  const scrubSectionIds = new Set(['connect', 'services']);
  let settledScrubIdx = -1;

  let isAnimating = false;
  let unlockTimer = null;

  function unlock() {
    isAnimating = false;
    clearTimeout(unlockTimer);
    window.removeEventListener('scrollend', unlock);
  }

  function currentIndex() {
    const y = window.scrollY + window.innerHeight / 2;
    let idx = 0;
    sections.forEach((sec, i) => { if (sec.offsetTop <= y) idx = i; });
    return idx;
  }

  function goTo(index) {
    if (index < 0 || index >= sections.length || isAnimating) return;
    isAnimating = true;

    // Special case: About -> FAQ gets the star-wipe transition instead of
    // a plain smooth scroll. Every other jump on the page is completely
    // unaffected — this only fires for this exact pair, and only if
    // about-wipe.js actually loaded and exposed the function.
    const fromIdx = currentIndex();
    const fromId = sections[fromIdx] && sections[fromIdx].id;
    const toId = sections[index] && sections[index].id;
    if (fromId === 'about' && toId === 'faq' && typeof window.playAboutWipeTransition === 'function') {
      window.playAboutWipeTransition(
        () => { window.scrollTo({ top: sections[index].offsetTop, behavior: 'auto' }); },
        unlock
      );
      return;
    }

    window.scrollTo({ top: sections[index].offsetTop, behavior: 'smooth' });

    // Primary release: the browser's own confirmation the scroll finished.
    window.addEventListener('scrollend', unlock, { once: true });
    // Fallback release: guarantees the lock can never stay stuck even if
    // 'scrollend' doesn't fire (older browsers, or an interrupted scroll).
    clearTimeout(unlockTimer);
    unlockTimer = setTimeout(unlock, 1000);
  }

  function insideHeroZoom() {
    if (!heroZoom) return false;
    return heroZoom.getBoundingClientRect().bottom > 60;
  }

  // The contact form modal sits on top of the page — while it's open, the
  // background page shouldn't hard-jump sections underneath it. Coordinated
  // via a shared class on <html>, toggled by the modal's own open/close
  // logic in main.js.
  function modalIsOpen() {
    return document.documentElement.classList.contains('modal-open');
  }

  // Returns true if this event was consumed settling into a scrub section
  // (caller should stop processing this event) — false if normal
  // advance/edge logic should proceed.
  function claimScrubSettleIfNeeded(idx) {
    const id = sections[idx] && sections[idx].id;
    if (scrubSectionIds.has(id) && settledScrubIdx !== idx) {
      settledScrubIdx = idx;
      goTo(idx); // settles precisely at this section's own offsetTop
      return true;
    }
    return false;
  }

  // How much of the current section has already scrolled past — used to
  // decide whether wheel/touch input should pass through natively (still
  // inside a tall section's own content) or trigger a jump (at its edge).
  function edgeState(idx) {
    const sec = sections[idx];
    const top = sec.offsetTop;
    const height = sec.offsetHeight;
    const viewportH = window.innerHeight;
    const isTall = height > viewportH + 4;
    if (!isTall) return { isTall: false, atTop: true, atBottom: true };
    const atTop = window.scrollY <= top + 4;
    const atBottom = window.scrollY + viewportH >= top + height - 4;
    return { isTall: true, atTop, atBottom };
  }

  window.addEventListener('wheel', (e) => {
    if (insideHeroZoom() || modalIsOpen()) return;
    if (isAnimating) { e.preventDefault(); return; }

    const idx = currentIndex();
    if (claimScrubSettleIfNeeded(idx)) { e.preventDefault(); return; }

    const edge = edgeState(idx);
    const goingDown = e.deltaY > 0;

    // At the very first section scrolling up, or the very last scrolling
    // down, there's no valid target to jump to — don't intercept at all,
    // so native scroll can carry the user back into the hero (or simply
    // reach the true bottom of the page) instead of silently doing
    // nothing while still having blocked the scroll.
    if (!goingDown && idx === 0) return;
    if (goingDown && idx === sections.length - 1) return;

    if (edge.isTall) {
      if (goingDown && !edge.atBottom) return;
      if (!goingDown && !edge.atTop) return;
    }

    e.preventDefault();
    if (Math.abs(e.deltaY) < 2) return;
    goTo(idx + (goingDown ? 1 : -1));
  }, { passive: false });

  let touchStartY = null;
  window.addEventListener('touchstart', (e) => {
    touchStartY = insideHeroZoom() || isAnimating || modalIsOpen() ? null : e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchend', (e) => {
    if (touchStartY === null || isAnimating) return;
    const delta = touchStartY - e.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(delta) < 50) return;   // not a deliberate swipe

    const idx = currentIndex();
    if (claimScrubSettleIfNeeded(idx)) return;

    const edge = edgeState(idx);
    const goingDown = delta > 0;

    if (!goingDown && idx === 0) return;
    if (goingDown && idx === sections.length - 1) return;

    if (edge.isTall) {
      if (goingDown && !edge.atBottom) return;
      if (!goingDown && !edge.atTop) return;
    }
    goTo(idx + (goingDown ? 1 : -1));
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (insideHeroZoom() || isAnimating || modalIsOpen()) return;
    const isDown = e.key === 'ArrowDown' || e.key === 'PageDown';
    const isUp = e.key === 'ArrowUp' || e.key === 'PageUp';
    if (!isDown && !isUp) return;

    const idx = currentIndex();
    if (claimScrubSettleIfNeeded(idx)) { e.preventDefault(); return; }

    const edge = edgeState(idx);

    if (isUp && idx === 0) return;
    if (isDown && idx === sections.length - 1) return;

    if (edge.isTall) {
      if (isDown && !edge.atBottom) return;
      if (isUp && !edge.atTop) return;
    }
    e.preventDefault();
    goTo(idx + (isDown ? 1 : -1));
  });
})();