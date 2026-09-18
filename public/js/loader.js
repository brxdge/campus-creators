(function () {
  const overlay = document.getElementById('loader-overlay');
  if (!overlay) return;

  const ALREADY_SEEN_KEY = 'ccLoaderSeen';
  const seenThisSession = sessionStorage.getItem(ALREADY_SEEN_KEY);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const logoWrap = document.getElementById('logoWrap');
  const wordmarkImg = document.getElementById('wordmarkImg');
  const agencyImg = document.getElementById('agencyImg');
  const star = document.getElementById('hero-star');
  const loaderBg = document.getElementById('loaderBg');
  const navLogo = document.querySelector('.nav-logo img');

  // Measured from the real logo file. NOTE: the star PNG is a padded crop
  // (185px wide around a 145px glyph), so the width fraction below is the
  // fraction of the PADDED IMAGE, not of the glyph — otherwise the star
  // renders ~22% too small and won't match the one baked into the wordmark.
  const STAR_CENTER_X_FRAC = 0.4601;
  const STAR_CENTER_Y_FRAC = 0.2876;
  const STAR_IMG_WIDTH_FRAC = 0.1210;
  // x-position of the star within the wordmark crop, used to make the
  // wordmark unfurl outward from exactly where the star sits
  const STAR_X_IN_WORDMARK_FRAC = 0.4622;

  function finish() {
    overlay.style.display = 'none';
    document.body.classList.remove('loader-running');
    document.dispatchEvent(new CustomEvent('campusCreatorsLoaderDone'));
  }

  if (seenThisSession) { finish(); return; }
  sessionStorage.setItem(ALREADY_SEEN_KEY, '1');

  // hide the real navbar logo while the loader owns it
  document.body.classList.add('loader-running');

  if (reduceMotion) {
    wordmarkImg.style.opacity = '1';
    agencyImg.style.opacity = '1';
    setTimeout(() => {
      overlay.style.transition = 'opacity .3s ease';
      overlay.style.opacity = '0';
      setTimeout(finish, 300);
    }, 350);
    return;
  }

  const wrapRect = logoWrap.getBoundingClientRect();
  const targetX = wrapRect.left + wrapRect.width * STAR_CENTER_X_FRAC;
  const targetY = wrapRect.top + wrapRect.height * STAR_CENTER_Y_FRAC;
  const targetSize = wrapRect.width * STAR_IMG_WIDTH_FRAC;
  const startSize = 110;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const at = (x, y, s, r) =>
    `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${s}) rotate(${r}deg)`;

  // Phase 1 — star pops in, centre screen
  star.animate([
    { transform: at(cx, cy, 0, -15), opacity: 0, offset: 0 },
    { transform: at(cx, cy, 1.12, 8), opacity: 1, offset: 0.75 },
    { transform: at(cx, cy, 1, 0), opacity: 1, offset: 1 },
  ], { duration: 320, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });

  // Phase 2 — two clean, constant-speed rotations as the loading beat
  star.animate([
    { transform: at(cx, cy, 1, 0), filter: 'drop-shadow(0 0 0 rgba(255,255,255,0))' },
    { transform: at(cx, cy, 1.05, 180), filter: 'drop-shadow(0 0 14px rgba(255,255,255,.6))', offset: 0.25 },
    { transform: at(cx, cy, 1, 360), filter: 'drop-shadow(0 0 0 rgba(255,255,255,0))', offset: 0.5 },
    { transform: at(cx, cy, 1.05, 540), filter: 'drop-shadow(0 0 14px rgba(255,255,255,.6))', offset: 0.75 },
    { transform: at(cx, cy, 1, 720), filter: 'drop-shadow(0 0 0 rgba(255,255,255,0))', offset: 1 },
  ], { duration: 900, delay: 320, easing: 'linear', fill: 'forwards' });

  // Phase 3 — travels and shrinks into its exact place in the logo
  star.animate([
    { transform: at(cx, cy, 1, 720) },
    { transform: at(targetX, targetY, targetSize / startSize, 720) },
  ], { duration: 650, delay: 1220, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });

  // Phase 3b — a "landed" beat where the star sits alone before any text
  star.animate([
    { transform: at(targetX, targetY, targetSize / startSize, 720) },
    { transform: at(targetX, targetY, (targetSize / startSize) * 1.16, 720), offset: 0.5 },
    { transform: at(targetX, targetY, targetSize / startSize, 720) },
  ], { duration: 220, delay: 1870, easing: 'ease-out', fill: 'forwards' });

  // Phase 4 — wordmark unfurls outward from the star's position
  const leftInset = (STAR_X_IN_WORDMARK_FRAC * 100).toFixed(2) + '%';
  const rightInset = ((1 - STAR_X_IN_WORDMARK_FRAC) * 100).toFixed(2) + '%';
  wordmarkImg.animate([
    { opacity: 0, transform: 'scale(.97)', clipPath: `inset(0% ${rightInset} 0% ${leftInset})` },
    { opacity: 1, transform: 'scale(1)', clipPath: 'inset(0% 0% 0% 0%)' },
  ], { duration: 850, delay: 2150, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });

  // hand the standalone star over to the one baked into the wordmark
  star.animate([{ opacity: 1 }, { opacity: 0 }],
    { duration: 180, delay: 2900, easing: 'linear', fill: 'forwards' });

  // Phase 5 — AGENCY lands as the closing beat
  agencyImg.animate([
    { opacity: 0, transform: 'scale(.85)' },
    { opacity: 1, transform: 'scale(1.06)', offset: 0.7 },
    { opacity: 1, transform: 'scale(1)' },
  ], { duration: 350, delay: 3150, easing: 'cubic-bezier(.34,1.56,.64,1)', fill: 'forwards' });

  // Phase 6 — the whole logo flies from centre screen up into the navbar
  const FLIGHT_DELAY = 3650;
  const FLIGHT_MS = 780;

  function flyToNavbar() {
    if (!navLogo) {                       // no navbar logo — just fade out
      overlay.style.transition = 'opacity .45s ease';
      overlay.style.opacity = '0';
      setTimeout(finish, 450);
      return;
    }

    // measure late: fonts and layout have settled by now
    const from = logoWrap.getBoundingClientRect();
    const to = navLogo.getBoundingClientRect();
    const scale = to.width / from.width;
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);

    logoWrap.animate([
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    ], { duration: FLIGHT_MS, easing: 'cubic-bezier(.65,0,.32,1)', fill: 'forwards' });

    // dissolve the backdrop as it travels, revealing the page underneath
    loaderBg.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: FLIGHT_MS - 120, delay: 120, easing: 'ease-in-out', fill: 'forwards' });

    overlay.style.pointerEvents = 'none';
    setTimeout(finish, FLIGHT_MS + 40);
  }

  setTimeout(flyToNavbar, FLIGHT_DELAY);
})();