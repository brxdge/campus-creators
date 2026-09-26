// ============================================================
// Campus Activations: intro for the student cut-outs.
// When the band scrolls into view the backdrop disc and ring bloom, the
// three girls (back row) slide in from the right, the group (front row)
// overtakes them a beat later, and two brand stars pop in and twinkle. After that, on desktop, the two layers
// drift apart slightly with the mouse for a bit of depth.
// ============================================================
(function bandPeople() {
  const wrap = document.getElementById('bandPeople');
  if (!wrap) return;
  const band = wrap.closest('.band');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- sizing: largest composition that stays clear of all the text ----
  // (A) beside the headline, or (B) under the headline and right of the
  // paragraph/button — whichever allows the bigger picture.
  const ASPECT = 0.97;
  function textRight(el) {
    try {
      const r = document.createRange(); r.selectNodeContents(el);
      return Math.max(...Array.from(r.getClientRects()).map((x) => x.right));
    } catch (e) { return el.getBoundingClientRect().right; }
  }
  function fit() {
    if (!band) return;
    if (window.matchMedia('(max-width: 900px)').matches) { wrap.style.removeProperty('--h'); return; }
    const h2 = band.querySelector('.band-inner h2');
    const side = band.querySelector('.band-side');
    if (!h2 || !side) return;
    const b = band.getBoundingClientRect();
    const t = h2.getBoundingClientRect();
    const sd = side.getBoundingClientRect();
    const cs = getComputedStyle(wrap);
    const right = b.right - parseFloat(cs.right || 0);
    const gap = Math.max(32, b.width * 0.03);
    const maxH = Math.min(b.height * 0.9, 900);
    const aH = Math.min(maxH, (right - (textRight(h2) + gap)) / ASPECT);
    const bH = Math.min(maxH, b.bottom - (t.bottom + gap * 0.6), (right - (sd.right + gap)) / ASPECT);
    const h = Math.max(aH, bH, 0);
    wrap.style.setProperty('--h', Math.round(h) + 'px');
    wrap.style.visibility = h < 220 ? 'hidden' : '';
  }
  fit();
  window.addEventListener('resize', () => requestAnimationFrame(fit));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.addEventListener('load', fit);
  if ('ResizeObserver' in window && band) new ResizeObserver(() => requestAnimationFrame(fit)).observe(band);
  if (reduce || !('IntersectionObserver' in window)) return;   // shown as-is

  wrap.classList.add('bp-ready');

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      // wait a frame so the hidden starting pose is painted first
      requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('bp-in')));
      setTimeout(() => wrap.classList.add('bp-live'), 1700);
    });
  }, { threshold: 0.35 });
  io.observe(band || wrap);

  // mouse parallax (desktop only), after the intro has finished
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || !band) return;
  let raf = 0;
  band.addEventListener('mousemove', (e) => {
    if (!wrap.classList.contains('bp-live') || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = band.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;       // -0.5 .. 0.5
      wrap.style.setProperty('--px1', (x * 18).toFixed(1) + 'px');
      wrap.style.setProperty('--px2', (x * -10).toFixed(1) + 'px');
    });
  });
  band.addEventListener('mouseleave', () => {
    wrap.style.setProperty('--px1', '0px');
    wrap.style.setProperty('--px2', '0px');
  });
})();
