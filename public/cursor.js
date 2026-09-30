// ============================================================
// Custom cursor (desktop / mouse only).
//   - resting: the normal arrow (nothing custom)
//   - over clickable text/buttons: ring swells, inverts what's under it
//     (blend "difference"), dot vanishes, slight magnetic pull to centre
//   - over a photo that turns into video: morphs into a red disc with a
//     spinning "PLAY • PLAY •" ring; a play icon becomes live equaliser
//     bars once the video is actually playing
//   - click: ring squeezes + a ripple pulses out
// Touch devices and reduced-motion users keep the normal cursor everywhere.
// ============================================================
(function ccCursor() {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce) return;

  const CLICKABLE = 'a[href], button, [role="button"], [role="tab"], summary, label[for], .svc-item, .wk-tab, .showcase-tab, input[type="submit"], input[type="checkbox"], input[type="radio"]';
  const TEXT_INPUT = 'input:not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]), textarea, select, [contenteditable="true"]';

  // Elements whose photo turns into a video on hover
  function videoHost(t) {
    const how = t.closest('#howSteps .how-step');
    if (how && how.querySelector('video')) return how;
    const tal = t.closest('.tal-card');
    if (tal && tal.querySelector('video')) return tal;
    return null;
  }

  const root = document.createElement('div');
  root.className = 'ccc';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="ccc-ring">' +
      '<svg class="ccc-spin" viewBox="0 0 100 100"><defs><path id="cccCirc" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0"/></defs>' +
      '<text><textPath href="#cccCirc" textLength="230" lengthAdjust="spacing">PLAY • PLAY • PLAY • PLAY • PLAY • </textPath></text></svg>' +
      '<span class="ccc-play"></span>' +
      '<span class="ccc-eq"><i></i><i></i><i></i><i></i></span>' +
      '<span class="ccc-label">LET\u2019S TALK</span>' +
    '</div>' +
    '<div class="ccc-dot"></div>';
  document.body.appendChild(root);
  const ring = root.querySelector('.ccc-ring');
  const dot = root.querySelector('.ccc-dot');

  let mx = -100, my = -100;       // real mouse
  let rx = -100, ry = -100;       // eased ring
  let target = null;              // current clickable (for magnetic pull)
  let host = null;                // current video host
  let seen = false;

  function setState(name) {
    const prev = root.dataset.state;
    if (prev === name) return;
    const on = name === 'link' || name === 'video' || name === 'cta';
    const wasOn = prev === 'link' || prev === 'video' || prev === 'cta';
    if (on && !wasOn) { rx = mx; ry = my; }      // grow out of the arrow's tip
    root.dataset.state = name;
    document.documentElement.classList.toggle('ccc-active', on);
  }

  function evaluate(t) {
    if (!t || !t.closest) return;
    if (t.closest(TEXT_INPUT)) { setState('text'); target = null; host = null; return; }
    host = videoHost(t);
    if (host) { setState('video'); target = null; return; }
    if (t.closest('.contact-cta-link')) { target = null; setState('cta'); return; }
    target = t.closest(CLICKABLE);
    setState(target ? 'link' : 'idle');
  }

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY;
    if (!seen) { seen = true; rx = mx; ry = my; root.classList.add('ccc-show'); }
    evaluate(e.target);
  }, { passive: true });

  // content that appears/moves under a still mouse (scroll, carousels)
  window.addEventListener('scroll', () => {
    if (seen) evaluate(document.elementFromPoint(mx, my));
  }, { passive: true });

  // re-check what's under a still mouse when a modal opens/closes or after a click
  const recheck = () => { if (seen) requestAnimationFrame(() => evaluate(document.elementFromPoint(mx, my))); };
  new MutationObserver(recheck).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('click', () => setTimeout(recheck, 60), true);

  document.addEventListener('mouseleave', () => { root.classList.remove('ccc-show'); setState('idle'); });
  document.addEventListener('mouseenter', () => { if (seen) root.classList.add('ccc-show'); });

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;
    const st = root.dataset.state;
    if (st !== 'link' && st !== 'video' && st !== 'cta') return;
    root.classList.add('ccc-down');
    const r = document.createElement('span');
    r.className = 'ccc-ripple';
    r.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    root.appendChild(r);
    setTimeout(() => r.remove(), 650);
  }, { passive: true });
  window.addEventListener('pointerup', () => root.classList.remove('ccc-down'), { passive: true });

  function frame() {
    let tx = mx, ty = my;
    // magnetic: over a small clickable, the ring leans toward its centre
    if (target && root.dataset.state === 'link') {
      const b = target.getBoundingClientRect();
      if (b.width < 420 && b.height < 160) {
        tx = mx + ((b.left + b.width / 2) - mx) * 0.35;
        ty = my + ((b.top + b.height / 2) - my) * 0.35;
      }
    }
    rx += (tx - rx) * 0.2;
    ry += (ty - ry) * 0.2;
    ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;

    if (host) {
      const v = host.querySelector('video');
      root.classList.toggle('ccc-playing', !!(v && !v.paused && v.readyState > 2));
    } else {
      root.classList.remove('ccc-playing');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
