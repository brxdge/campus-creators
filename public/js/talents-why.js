// ============================================================
// "Why join" panels (ambassadors page).
// The reveal itself is CSS (hover / keyboard focus). This file adds two things:
//  1. where the red flood starts: the point the pointer (or finger) came in
//  2. tap-to-open for touch screens and the stacked phone layout, one panel at
//     a time, tap again to close
// ============================================================
(function whyJoinPanels() {
  const rows = Array.from(document.querySelectorAll('#tal-why .tw-row'));
  if (!rows.length) return;
  const canHover = window.matchMedia('(hover: hover)').matches;
  const stacked = window.matchMedia('(max-width: 900px)');
  // hovering opens panels only on a real mouse in the side-by-side layout;
  // everywhere else a tap does it
  const tapMode = () => stacked.matches || !canHover;

  function aim(row, e) {
    const r = row.getBoundingClientRect();
    row.style.setProperty('--mx', Math.round(e.clientX - r.left) + 'px');
    row.style.setProperty('--my', Math.round(e.clientY - r.top) + 'px');
  }
  function toggle(row) {
    const open = !row.classList.contains('is-open');
    rows.forEach((r) => r.classList.remove('is-open'));
    if (open) row.classList.add('is-open');
  }

  rows.forEach((row) => {
    row.addEventListener('pointerenter', (e) => aim(row, e));
    row.addEventListener('pointerleave', (e) => aim(row, e));   // closes toward where the pointer left
    row.addEventListener('pointerdown', (e) => aim(row, e));
    row.addEventListener('click', () => { if (tapMode()) toggle(row); });
    row.addEventListener('keydown', (e) => {
      if (!tapMode()) return;                                    // with a mouse, focus alone opens it
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(row); }
    });
  });

  // description heights: measured here so each description opens on a plain
  // pixel height (CSS reads --tw-dh) instead of nested grid tracks
  const paras = rows.map((r) => r.querySelector('.tw-desc p'));
  function measure() {
    paras.forEach((p) => {
      if (!p) return;
      let h = p.getBoundingClientRect().height;
      const oh = p.offsetHeight;
      if (Math.abs(h - oh) > 1.5) h = oh;                        // an ancestor is mid-transform: trust layout size
      const d = p.parentElement;
      if (h > 0) d.style.setProperty('--tw-dh', (Math.round(h * 100) / 100) + 'px');
      else d.style.removeProperty('--tw-dh');
    });
  }
  measure();
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(measure);
    paras.forEach((p) => { if (p) ro.observe(p); });
  }
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  // switching between the two layouts (resize / rotate): start from a clean slate
  const reset = () => rows.forEach((r) => r.classList.remove('is-open'));
  if (stacked.addEventListener) stacked.addEventListener('change', reset);
  else if (stacked.addListener) stacked.addListener(reset);
})();
