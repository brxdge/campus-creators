// ============================================================
// About -> FAQ transition wipe.
//
// Reuses the exact same clip-path-circle-reveal technique already proven
// on the Campus Activations button (main.js) — just retargeted: origin is
// the spinning star's actual screen position instead of a button, and the
// trigger is section-jump.js calling this specifically for the about->faq
// pair, not a hover event.
//
// This does NOT replace section-jump.js's own scroll mechanism — it wraps
// it. The actual window.scrollTo still happens exactly as it always did;
// it's just deferred until the screen is fully covered by the overlay, so
// the jump itself is invisible, then the overlay fades away to reveal the
// destination already in place.
// ============================================================
(function () {
  const overlay = document.getElementById('aboutWipe');
  const star = document.querySelector('#about .about-star');
  if (!overlay) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Exposed globally so section-jump.js can call it without this file
  // needing to know anything about how jumps are triggered.
  window.playAboutWipeTransition = function (performJump, onDone) {
    // No GSAP, or reduced motion: skip the wipe entirely, jump normally.
    // The jump itself (performJump) is section-jump's own smooth scroll,
    // completely unaffected by whether the wipe plays.
    if (typeof gsap === 'undefined' || reduceMotion) {
      performJump();
      if (onDone) onDone();
      return;
    }

    // Origin point: the star's actual current on-screen position, as a
    // percentage of the viewport — measured fresh every time, so it's
    // correct regardless of scroll position or screen size at the moment
    // this specific transition happens to fire.
    let originX = '50%';
    let originY = '50%';
    if (star) {
      const r = star.getBoundingClientRect();
      originX = ((r.left + r.width / 2) / window.innerWidth * 100).toFixed(2) + '%';
      originY = ((r.top + r.height / 2) / window.innerHeight * 100).toFixed(2) + '%';
    }

    // Lock scroll input for the entire transition. The gesture that
    // triggers this (often a large trackpad swipe) commonly has residual
    // momentum that keeps nudging window.scrollY for a while after the
    // gesture itself ends — section-jump.js's own isAnimating flag only
    // stops ITS OWN logic from firing again, it does nothing to stop that
    // native momentum from moving the page directly. Without this, the
    // page can drift past FAQ's correct position while still covered,
    // which is exactly the "still scrolls, needs a correction" symptom.
    const block = (e) => e.preventDefault();
    const blockKeys = (e) => {
      if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' '].includes(e.key)) e.preventDefault();
    };
    window.addEventListener('wheel', block, { passive: false });
    window.addEventListener('touchmove', block, { passive: false });
    window.addEventListener('keydown', blockKeys);

    let targetTop = null;
    // Secondary safeguard: if scrollY ever drifts from the intended target
    // while locked (e.g. momentum that isn't driven by a blockable wheel/
    // touchmove event at all), snap it straight back.
    const holdPosition = () => {
      if (targetTop !== null && window.scrollY !== targetTop) {
        window.scrollTo(0, targetTop);
      }
    };
    window.addEventListener('scroll', holdPosition, { passive: true });

    function unlockScroll() {
      window.removeEventListener('wheel', block);
      window.removeEventListener('touchmove', block);
      window.removeEventListener('keydown', blockKeys);
      window.removeEventListener('scroll', holdPosition);
    }

    gsap.set(overlay, {
      opacity: 1,
      backgroundColor: '#EB3F22',
      clipPath: `circle(0% at ${originX} ${originY})`,
    });

    gsap.timeline()
      // Phase 1: expand from the star's position to cover the whole
      // screen, orange fading to white as it grows.
      .to(overlay, {
        clipPath: `circle(150% at ${originX} ${originY})`,
        backgroundColor: '#ffffff',
        duration: 0.7,
        ease: 'power2.inOut',
      })
      // Phase 2: fully covered now — perform the actual scroll jump.
      // Instant, not smooth, since it's invisible behind the overlay.
      // targetTop is set right after so holdPosition knows what to
      // enforce for the rest of the transition.
      //
      // Critical detail: this site sets html{scroll-behavior:smooth}
      // globally. window.scrollTo's behavior:'auto' does NOT mean
      // "instant" — per spec it means "defer to the element's CSS
      // scroll-behavior", which here is smooth. So performJump()'s own
      // "instant" scrollTo was silently animating instead, meaning
      // targetTop below was being captured mid-animation rather than at
      // the true destination — and holdPosition would then keep fighting
      // the still-ongoing scroll back toward that wrong, stale value.
      // Forcing scroll-behavior to auto here for the instant is what
      // actually makes it instant.
      .call(() => {
        const prevBehavior = document.documentElement.style.scrollBehavior;
        document.documentElement.style.scrollBehavior = 'auto';
        performJump();
        targetTop = window.scrollY;
        document.documentElement.style.scrollBehavior = prevBehavior;
      })
      // Phase 3: fade the white away, revealing FAQ underneath — already
      // exactly settled, with no further scroll needed in either direction.
      .to(overlay, {
        opacity: 0,
        duration: 0.5,
        ease: 'power1.out',
      }, '+=0.05')
      .call(() => {
        gsap.set(overlay, { clipPath: 'circle(0% at 50% 50%)' });
      })
      // Phase 4: hold the lock a bit longer than the visible animation.
      // The gesture that triggered this often still has residual trackpad
      // momentum actively queued up even after the fade finishes —
      // releasing the lock the instant the animation ends hands control
      // back while that momentum is still live, which is what caused the
      // drift. Waiting it out here means it's already spent by the time
      // scroll is actually released.
      .call(() => {
        setTimeout(() => {
          unlockScroll();
          if (onDone) onDone();
        }, 400);
      });
  };
})();