// ---- mobile nav toggle ----
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', isOpen);
  });
}

// ---- nav: shadow once scrolled, and hide when scrolling down ----
const siteHeader = document.getElementById('siteHeader');
if (siteHeader) {
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    siteHeader.classList.toggle('scrolled', y > 12);

    // don't hide while the mobile menu is open, or near the very top
    const menuOpen = navLinks && navLinks.classList.contains('open');
    if (!menuOpen && y > 140) {
      if (y > lastY + 6) {
        siteHeader.classList.add('nav-hidden');       // scrolling down
      } else if (y < lastY - 6) {
        siteHeader.classList.remove('nav-hidden');    // scrolling up
      }
    } else {
      siteHeader.classList.remove('nav-hidden');
    }
    lastY = y;
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ---- footer year ----
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---- scroll reveal ----
const revealEls = document.querySelectorAll('.reveal, .enter-fade');
if ('IntersectionObserver' in window && revealEls.length) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add('in-view'));
}

// ---- performance: freeze every CSS animation in sections that are off
// screen (feed wall columns, pulses, floats, glows…). They resume exactly
// where they left off when the section scrolls back into view.
(function pauseOffscreenAnimations() {
  const secs = document.querySelectorAll('#sections > section, #sections > .band');
  if (!secs.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting));
  }, { rootMargin: '100px 0px' });
  secs.forEach((s) => io.observe(s));
})();

// ---- "The Work" lives in work-showcase.js ----

// ---- media source: loaded from the admin portal API ----
let MEDIA_DATA = {};
let MEDIA_BASE = '/media/';
// Placeholder-specific uploads from the admin dashboard (What We Do, How it
// works, The Work, Talent roster). Stored server-side as "brands" whose
// names start with "slot-", and split out of MEDIA_DATA on load so they
// never leak into the brand feed wall / carousels.
let SLOT_MEDIA = {};

// Returns resolved URLs for one placeholder slot: its first video (with a
// photo from the same slot as poster), or its first photo on its own.
function slotPick(key) {
  const e = SLOT_MEDIA[key] || {};
  const v = (e.videos || []).find((x) => x && x.src);
  const p = (e.photos || []).find(Boolean);
  return {
    video: v ? resolveMedia(v.src) : '',
    poster: v && v.poster ? resolveMedia(v.poster) : (p ? resolveMedia(p) : ''),
  };
}

function resolveMedia(entry) {
  if (!entry) return '';
  return /^https?:\/\//i.test(entry) ? entry : MEDIA_BASE + entry;
}

function mediaFor(brand) {
  const entry = MEDIA_DATA[brand] || {};
  return { photos: entry.photos || [], videos: entry.videos || [] };
}

// ---- swap real media into the hero feed wall where it exists ----

// Up to 10 videos could all be on-screen AT ONCE with zero scrolling, since
// most columns fit across the viewport simultaneously on a wide screen —
// that's 10 concurrent video decodes running continuously just from sitting
// on the homepage, which is the main thing making the page feel heavy.
const MAX_HERO_VIDEOS = window.matchMedia('(max-width: 900px)').matches ? 2 : 8;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection && navigator.connection.saveData;
const smallScreen = window.matchMedia('(max-width: 900px)').matches;
// hero video is a priority: on everywhere except data-saver / reduced motion
// (phones get a smaller budget via MAX_HERO_VIDEOS)
const allowHeroVideo = !prefersReducedMotion && !saveData;

// pause anything scrolled out of view
const heroVideoObserver = ('IntersectionObserver' in window)
  ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const v = entry.target;
        if (entry.isIntersecting) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.1 })
  : null;

function hydrateHeroMedia() {
  // Videos are the priority. The wall's cards are labelled with 8 starter
  // brands, but uploads live under whatever brands exist in the admin — so
  // media is pooled from EVERY brand rather than matched to a card's label.
  // Each column gets one video (up to MAX_HERO_VIDEOS), every other card a
  // photo, and each photo/video is spread out so neighbours differ.
  const videoPool = [];
  const photoPool = [];
  Object.keys(MEDIA_DATA).forEach((brand) => {
    const { photos, videos } = mediaFor(brand);
    videos.forEach((v) => { if (v && v.src) videoPool.push({ clip: v, poster: photos[0] || '' }); });
    photos.forEach((p) => { if (p) photoPool.push(p); });
  });
  if (!videoPool.length && !photoPool.length) return;

  const columns = Array.from(document.querySelectorAll('.feed-col'));
  let videosPlaced = 0;
  let photoN = 0;

  columns.forEach((col, colIndex) => {
    const reels = Array.from(col.querySelectorAll('.reel'));
    if (!reels.length) return;
    // each column holds its cards twice so translateY(-50%) loops
    // seamlessly — media is mirrored into the second half
    const half = Math.floor(reels.length / 2) || reels.length;
    const videoSlot = (colIndex * 2) % half;          // staggered heights

    for (let j = 0; j < half; j++) {
      const reel = reels[j];
      const twin = reels[j + half];
      if (reel.querySelector('.reel-media')) continue;

      const useVideo = allowHeroVideo && videoPool.length && j === videoSlot && videosPlaced < MAX_HERO_VIDEOS;
      let node;
      if (useVideo) {
        const v = videoPool[videosPlaced % videoPool.length];
        node = makeVideo(v.clip, v.poster || photoPool[videosPlaced % Math.max(1, photoPool.length)]);
        videosPlaced++;
      } else if (photoPool.length) {
        node = makePhoto(photoPool[(photoN * 7 + colIndex) % photoPool.length]);
        photoN++;
      } else if (videoPool.length && allowHeroVideo && videosPlaced < MAX_HERO_VIDEOS) {
        const v = videoPool[videosPlaced % videoPool.length];
        node = makeVideo(v.clip, v.poster);
        videosPlaced++;
      } else {
        continue;
      }
      attachMedia(reel, node);
      if (twin) attachMedia(twin, node.cloneNode(true));
    }
  });
}

function makePhoto(src) {
  const img = document.createElement('img');
  img.src = resolveMedia(src);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  return img;
}

function makeVideo(clip, fallbackPoster) {
  const v = document.createElement('video');
  v.src = resolveMedia(clip.src);
  // a poster frame shows instantly, so the card is never blank while the
  // clip loads (brand photo if the clip has no poster of its own)
  const poster = clip.poster || fallbackPoster;
  if (poster) v.poster = resolveMedia(poster);
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.setAttribute('muted', '');
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.preload = 'metadata';                 // first frame ready fast; full clip streams once playing
  v.autoplay = true;
  v.setAttribute('aria-hidden', 'true');
  return v;
}

function attachMedia(reel, node, isVideo) {
  node.className = 'reel-media';
  node.referrerPolicy = 'no-referrer';
  node.addEventListener('error', () => {
    node.remove();
    reel.classList.remove('has-media');
  });
  if (node.tagName === 'VIDEO') {
    node.muted = true;                    // cloneNode drops the muted property
    node.play && node.readyState >= 0 && heroVideoObserver == null && node.play().catch(() => {});
    if (heroVideoObserver) heroVideoObserver.observe(node);
    else node.autoplay = true;
  }
  reel.insertBefore(node, reel.firstChild);
  reel.classList.add('has-media');
}

// load media from the admin portal
fetch('/api/media', { headers: { Accept: 'application/json' } })
  .then((r) => (r.ok ? r.json() : Promise.reject()))
  .then((data) => {
    if (data && data.media) {
      MEDIA_DATA = {};
      SLOT_MEDIA = {};
      Object.keys(data.media).forEach((k) => {
        (k.indexOf('slot-') === 0 ? SLOT_MEDIA : MEDIA_DATA)[k] = data.media[k];
      });
      MEDIA_BASE = data.path || '/media/';
      hydrateHeroMedia();
      // hand the full clip list to the spotlight, including videos that
      // never made it into the wall
      if (typeof spotlight !== 'undefined') spotlight.rebuild();
      document.dispatchEvent(new CustomEvent('mediaDataReady'));
    }
  })
  .catch(() => { /* backend unreachable — gradient placeholders stand */ });

// ---- spotlight: cycles through EVERY uploaded video, alternating sides ----
// Draws from the media list rather than from rendered cards, so clips in
// columns hidden by a media query — and clips that never made it into the
// wall at all — still get their turn.
const spotlight = (function () {
  // ".hero-pin" is always ~viewport height (the tall ".hero" only exists to
  // give the zoom effect scroll room), so geometry below stays correct
  // whether or not the zoom effect is active.
  const hero = document.querySelector('.hero-pin') || document.querySelector('.hero');

  const INTERVAL = 5200;      // gap between spotlights
  const GROW_MS = 620;        // lift + expand
  const HOLD_MS = 3000;       // time held large
  const SHRINK_MS = 460;      // fade back out
  const MARGIN = 44;          // distance from the screen edge
  const ALLOWED_OVERLAP = 60; // how far it may sit behind the headline column

  let clips = [];             // every uploaded video, across all brands
  let queue = [];             // shuffled play order for the current round
  let onLeft = true;
  let busy = false;
  let busySince = 0;
  let timer = null;
  let heroVisible = true;     // only run while the hero is actually on screen
  let activePanel = null;     // the panel currently on screen, if any
  let closeTimers = [];       // its pending timeouts, so they can be cancelled

  // The spotlight is a fixed-position panel, so it has to be told explicitly
  // when the hero has scrolled out of view — geometry doesn't stop it on its
  // own. Watches the hero directly and closes the panel the moment it's
  // mostly scrolled away, instead of waiting for its hold timer to run out;
  // it comes back once the hero is mostly back on screen.
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        heroVisible = entries[0].isIntersecting;
        if (!heroVisible) closeActivePanel();
      },
      { threshold: 0.6 }
    ).observe(hero);
  }

  // The feed-wall videos fade out via opacity during the zoom, but opacity
  // doesn't pause decoding — up to 3 videos kept playing fully invisible for
  // the entire zoom, burning CPU/GPU exactly when the 240x scale needs every
  // bit of frame budget it can get. Pausing them here removes that cost
  // completely while the zoom is active, and picks back up where it left
  // off (loop:true videos resume seamlessly) once it returns to rest.
  document.addEventListener('heroZoomDone', () => {
    document.querySelectorAll('.feed-wall video.reel-media').forEach((v) => v.pause());
  });
  document.addEventListener('heroZoomReturn', () => {
    document.querySelectorAll('.feed-wall video.reel-media').forEach((v) => {
      v.play().catch(() => {});
    });
  });

  function closeActivePanel() {
    closeTimers.forEach(clearTimeout);
    closeTimers = [];
    if (activePanel) {
      activePanel.remove();
      activePanel = null;
    }
    busy = false;
  }

  const roomForSpotlight = () => window.matchMedia('(min-width: 1101px)').matches;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // rebuild the clip list from the media the admin portal returned
  function rebuild() {
    clips = [];
    Object.keys(MEDIA_DATA || {}).forEach((brand) => {
      const vids = (MEDIA_DATA[brand] && MEDIA_DATA[brand].videos) || [];
      vids.forEach((v) => {
        if (!v || !v.src) return;
        clips.push({
          brand,
          src: resolveMedia(v.src),
          poster: v.poster ? resolveMedia(v.poster) : '',
        });
      });
    });
    queue = shuffle(clips);
    start();
  }

  function nextClip() {
    if (!clips.length) return null;
    if (!queue.length) queue = shuffle(clips);   // round finished — reshuffle
    return queue.shift();
  }

  // width that fits in the gutter beside the centred headline, or null
  function panelWidth() {
    const contentW = Math.min(1240, window.innerWidth - 60);
    const gutter = (window.innerWidth - contentW) / 2;
    const maxW = gutter - MARGIN + ALLOWED_OVERLAP;
    return maxW < 190 ? null : Math.min(maxW, 300);
  }

  // if this clip happens to be on screen in the wall, lift it from there
  function visibleCardFor(src) {
    if (!hero) return null;
    const heroRect = hero.getBoundingClientRect();
    const headerH = (document.getElementById('siteHeader') || {}).offsetHeight || 0;
    const file = src.split('/').pop();
    const cards = document.querySelectorAll('.reel.has-media');
    for (const c of cards) {
      const m = c.querySelector('.reel-media');
      if (!m || m.tagName !== 'VIDEO') continue;
      const s = m.getAttribute('src') || m.src || '';
      if (!s.endsWith(file)) continue;
      const r = c.getBoundingClientRect();
      if (r.width > 0
        && r.top > Math.max(heroRect.top, headerH) + 40
        && r.bottom < heroRect.bottom - 40) return c;
    }
    return null;
  }

  function run() {
    // watchdog: recover if a previous cycle never released
    if (busy && Date.now() - busySince > GROW_MS + HOLD_MS + SHRINK_MS + 2000) {
      closeActivePanel();
    }
    if (busy || document.hidden || !heroVisible || !roomForSpotlight()) return;

    // The hero-zoom sequence (js/hero-zoom.js) fades the feed wall toward
    // opacity:0 while scrolling through the zoom track — but doesn't change
    // its layout size, so a pure geometry check here would still consider it
    // "visible" and pop an enlarged panel over an almost-invisible wall.
    // Bail out while that fade is happening.
    const feedWallEl = document.querySelector('.feed-wall');
    if (feedWallEl && parseFloat(getComputedStyle(feedWallEl).opacity) < 0.5) return;

    const targetW = panelWidth();
    if (!targetW) return;

    const clip = nextClip();
    if (!clip) return;

    busy = true;
    busySince = Date.now();

    const targetH = targetW * (16 / 9);
    const targetLeft = onLeft ? MARGIN : window.innerWidth - MARGIN - targetW;
    const headerH = (document.getElementById('siteHeader') || {}).offsetHeight || 0;
    let targetTop = (window.innerHeight - targetH) / 2;
    targetTop = Math.max(headerH + 28,
      Math.min(targetTop, window.innerHeight - 28 - targetH));
    onLeft = !onLeft;

    // start from the matching card if it's on screen, otherwise grow in place
    const card = visibleCardFor(clip.src);
    let from;
    if (card) {
      from = card.getBoundingClientRect();
      card.classList.add('picking');
      setTimeout(() => card.classList.remove('picking'), 520);
    } else {
      const w = targetW * 0.55;
      const h = targetH * 0.55;
      from = {
        left: targetLeft + (targetW - w) / 2,
        top: targetTop + (targetH - h) / 2,
        width: w,
        height: h,
      };
    }

    const panel = document.createElement('div');
    panel.className = 'spotlight';
    panel.style.left = from.left + 'px';
    panel.style.top = from.top + 'px';
    panel.style.width = from.width + 'px';
    panel.style.height = from.height + 'px';

    const video = document.createElement('video');
    video.src = clip.src;
    if (clip.poster) video.poster = clip.poster;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;
    panel.appendChild(video);

    const label = document.createElement('span');
    label.className = 'spotlight-name';
    label.textContent = clip.brand || '';
    panel.appendChild(label);

    document.body.appendChild(panel);
    activePanel = panel;
    video.play().catch(() => {});

    panel.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 0.5 },
      {
        transform:
          `translate(${targetLeft - from.left}px, ${targetTop - from.top}px) ` +
          `scale(${targetW / from.width}, ${targetH / from.height})`,
        opacity: 1,
      },
    ], { duration: GROW_MS, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });

    // explicit timers rather than chained finish events, so a missed event
    // can't leave the panel on screen forever
    closeTimers.push(setTimeout(() => {
      panel.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration: SHRINK_MS, easing: 'ease-in', fill: 'forwards' });
    }, GROW_MS + HOLD_MS));

    closeTimers.push(setTimeout(() => {
      panel.remove();
      if (activePanel === panel) activePanel = null;
      busy = false;
    }, GROW_MS + HOLD_MS + SHRINK_MS + 60));
  }

  function start() {
    clearInterval(timer);
    if (!hero || !clips.length) return;
    if (prefersReducedMotion || saveData) return;
    timer = setInterval(run, INTERVAL);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInterval(timer);
    else start();
  });

  return { rebuild };
})();

// ---- Hero: "brands" / "campuses" rolling word-swap ----
(function swapWords() {
  const slots = document.querySelectorAll('#hero .swap');
  if (!slots.length) return;

  // The two words are different lengths ("brands" vs "campuses") — lock
  // each slot's width to whichever face is wider, measured once, so the
  // surrounding sentence never reflows when the swap happens.
  // Measures a word's true rendered width via a temporary, invisible,
  // normal-flow clone — NOT by measuring the real .swap-face element
  // directly. The real faces are position:absolute with inset:0, which
  // makes them stretch to match their container's current size rather
  // than their own content width — so measuring them directly reads back
  // whatever (wrong) size the container already has, not the word's
  // actual width. A detached clone has no such constraint.
  function measureWordWidth(face) {
    const clone = document.createElement('span');
    clone.textContent = face.textContent;
    const cs = getComputedStyle(face);
    clone.style.cssText =
      'position:absolute;visibility:hidden;white-space:nowrap;' +
      'font:' + cs.font + ';text-transform:' + cs.textTransform + ';' +
      'letter-spacing:' + cs.letterSpacing + ';';
    document.body.appendChild(clone);
    const width = clone.getBoundingClientRect().width;
    clone.remove();
    return width;
  }

  // Each slot is sized to the word it's currently showing (not the longer
  // of the two), and the width animates between them in CSS, so the
  // sentence closes up smoothly instead of leaving a gap after "to".
  function fitWidths() {
    slots.forEach((slot) => {
      const faces = slot.querySelectorAll('.swap-face');
      const face = faces[slot.classList.contains('flipped') ? 1 : 0] || faces[0];
      slot.style.width = Math.ceil(measureWordWidth(face)) + 'px';
    });
  }
  fitWidths();
  window.addEventListener('resize', fitWidths);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWidths);

  if (prefersReducedMotion) return;   // static text, no continuous motion

  let timer = null;
  function start() {
    if (timer) return;
    timer = setInterval(() => {
      slots.forEach((slot) => slot.classList.toggle('flipped'));
      fitWidths();
    }, 3000);
  }
  function stop() {
    clearInterval(timer);
    timer = null;
  }

  // only run the loop while the section is actually visible — no point
  // animating something nobody can see
  const section = document.getElementById('hero');
  if (section && 'IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => { entries[0].isIntersecting ? start() : stop(); },
      { threshold: 0.2 }
    ).observe(section);
  } else {
    start();
  }
})();

// ---- Brands ("The work"): text intro ----
// Same idea as the Talents page's own scroll reveal (talents.js) — the
// class is toggled on the section itself every time it crosses into or
// out of view, never just added once, so the heading, the intro line, and
// each case's text fade back in on every pass, scrolling down into the
// section or back up into it.
(function workTextIntro() {
  const section = document.getElementById('work');
  if (!section || !('IntersectionObserver' in window) || prefersReducedMotion) return;

  const io = new IntersectionObserver(
    (entries) => { section.classList.toggle('in-view', entries[0].isIntersecting); },
    { threshold: 0.35 }
  );
  io.observe(section);
})();

// ---- Campus Activations: expands once, permanently, when centred ----
// A real height change (not a transform illusion) so it correctly reserves
// space for itself — that's what keeps Work from getting buried. Fires
// once via rootMargin trimming the observer's root to a single line at the
// viewport's vertical centre, then unobserves — it never reverts.
(function bandExpand() {
  const bandEl = document.querySelector('.band');
  if (!bandEl || !('IntersectionObserver' in window) || prefersReducedMotion) return;

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          bandEl.classList.add('expand');
          io.unobserve(bandEl);
        }
      });
    },
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
  );
  io.observe(bandEl);
})();

// ---- Campus Activations: white fill that crawls out from the button ----
(function bandButtonReveal() {
  const bandEl = document.querySelector('.band');
  const btnEl = bandEl && bandEl.querySelector('.btn');
  if (!bandEl || !btnEl || prefersReducedMotion) return;
  // Tells the stylesheet this hover effect is live, so the paragraph (hidden
  // until the button is hovered) is only ever hidden when it can be revealed.
  bandEl.classList.add('has-reveal');

  // Position the reveal's origin exactly at the button, as a % of the
  // band's own box — the button isn't centred in the layout, so this has
  // to be measured, not guessed.
  function updateOrigin() {
    const bandRect = bandEl.getBoundingClientRect();
    const btnRect = btnEl.getBoundingClientRect();
    if (!bandRect.width || !bandRect.height) return;
    const x = ((btnRect.left + btnRect.width / 2) - bandRect.left) / bandRect.width * 100;
    const y = ((btnRect.top + btnRect.height / 2) - bandRect.top) / bandRect.height * 100;
    bandEl.style.setProperty('--btn-x', x.toFixed(2) + '%');
    bandEl.style.setProperty('--btn-y', y.toFixed(2) + '%');
  }

  updateOrigin();
  window.addEventListener('resize', updateOrigin);
  // the band's own expand animation (above) changes its size, which moves
  // the button's position relative to it — recalculate once that settles
  bandEl.addEventListener('transitionend', (e) => {
    if (e.propertyName === 'min-height') updateOrigin();
  });

  // pointerenter/leave rather than mouseenter/mouseleave, gated to real
  // mice specifically. This is a link that navigates on tap — on touch,
  // a tap fires a synthetic mouseenter (for :hover compatibility) but the
  // page navigates before a mouseleave ever fires, which would leave the
  // white fill permanently stuck open. Checking pointerType per-event is
  // also more reliable than a device-level media query, which can
  // misclassify hybrid touchscreen+mouse laptops.
  btnEl.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse') return;
    updateOrigin();   // covers the rare case of hovering mid-expand
    bandEl.classList.add('btn-hover');
  });
  btnEl.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    bandEl.classList.remove('btn-hover');
  });
  // keyboard focus gets the same treatment, for parity with mouse hover
  btnEl.addEventListener('focus', () => {
    updateOrigin();
    bandEl.classList.add('btn-hover');
  });
  btnEl.addEventListener('blur', () => {
    bandEl.classList.remove('btn-hover');
  });
})();

const clientsSection = document.getElementById('clientsSection');
const brandPanel = document.getElementById('brandPanel');
const brandPanelName = document.getElementById('brandPanelName');
const brandPanelNote = document.getElementById('brandPanelNote');
const showcaseTrack = document.getElementById('showcaseTrack');
const showcaseCarousel = document.getElementById('showcaseCarousel');
const showcasePrev = document.getElementById('showcasePrev');
const showcaseNext = document.getElementById('showcaseNext');
const showcaseDots = document.getElementById('showcaseDots');
const clientTabsEl = document.getElementById('clientTabs');

if (clientsSection && brandPanel && showcaseTrack && clientTabsEl) {
  const TONES = [1, 3, 4, 2, 5];
  const AUTO_MS = 4200;
  // The tabs printed in index.html are only the starting set. Once the admin's
  // brand list arrives (see syncTabs below) the strip is rebuilt from it, so
  // brands added or removed in the admin show up here without touching the page.
  let clientTabs = Array.from(document.querySelectorAll('.client-tab'));
  let pickedByVisitor = false;
  const canHover = window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  let currentBrand = null;   // whatever the showcase is currently built from
  let lockedBrand = null;    // the last brand actually clicked/activated
  let previewTimer = null;
  let pool = [];             // this brand's real media, normalized
  let activeIndex = 0;       // which pool item sits centre-stage
  let autoTimer = null;

  function toneFor(i) { return TONES[i % TONES.length]; }

  // Videos → photos, each normalized to {type, src, poster?}. Side slides
  // in the carousel never decode video themselves (only the centre slide
  // does), so every video entry also carries a still to show when it's
  // sitting in a side position — its own poster if it has one, else the
  // brand's first photo, so a side slide is never left blank.
  function getPool(media) {
    const fallbackPhoto = media.photos[0] || '';
    const pool = [];
    media.videos.forEach((v) => {
      if (v && v.src) pool.push({ type: 'video', src: v.src, poster: v.poster || fallbackPhoto });
    });
    media.photos.forEach((p) => {
      if (p) pool.push({ type: 'photo', src: p });
    });
    return pool.slice(0, 8); // sane cap — plenty for a rotation, no runaway DOM/memory cost
  }

  // The note under the brand name used to say the same fixed placeholder
  // line for every brand, even ones that already had real content. Now it
  // reflects a real, counted total, and only falls back to "being added"
  // when there's truly nothing yet.
  function updateNote(total) {
    if (!brandPanelNote) return;
    if (total > 0) {
      brandPanelNote.textContent = total === 1
        ? '1 piece of campaign content'
        : total + ' pieces of campaign content';
      brandPanelNote.classList.remove('empty');
    } else {
      brandPanelNote.textContent = 'Campaign content for this brand is being added.';
      brandPanelNote.classList.add('empty');
    }
  }

  // Small status dot per tab — filled once that brand actually has
  // uploaded media, so the picker itself hints at what's worth clicking
  // before anything is clicked. Safe pre-fetch; re-run on mediaDataReady.
  function updateStatusDots() {
    clientTabs.forEach((tab) => {
      const dot = tab.querySelector('.client-tab-status');
      if (!dot) return;
      const media = mediaFor(tab.dataset.brand);
      dot.classList.toggle('has-media', (media.photos.length + media.videos.length) > 0);
    });
  }

  function buildPhoneEl(item, positionClass, tone) {
    const phone = document.createElement('div');
    phone.className = 'phone ' + positionClass;

    const screen = document.createElement('div');
    screen.className = 'phone-screen t' + tone;
    const isCenter = positionClass === 'is-center';

    if (item && item.type === 'video' && isCenter) {
      const video = document.createElement('video');
      video.className = 'phone-media';
      video.src = resolveMedia(item.src);
      if (item.poster) video.poster = resolveMedia(item.poster);
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      // only start decoding when the section is actually on screen
      video.autoplay = !!(clientsSection && clientsSection.dataset.visible === '1');
      video.preload = 'auto';
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
      video.addEventListener('error', () => {
        video.remove();
        screen.classList.remove('has-media');
      });
      screen.appendChild(video);
      screen.classList.add('has-media');
    } else if (item && item.type === 'video') {
      // side slide: show its still, never decode the clip itself
      const posterSrc = item.poster || '';
      if (posterSrc) {
        const img = document.createElement('img');
        img.className = 'phone-media';
        img.src = resolveMedia(posterSrc);
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.addEventListener('error', () => {
          img.remove();
          screen.classList.remove('has-media');
        });
        screen.appendChild(img);
        screen.classList.add('has-media');
      }
    } else if (item && item.type === 'photo') {
      const img = document.createElement('img');
      img.className = 'phone-media';
      img.src = resolveMedia(item.src);
      img.alt = '';
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        img.remove();
        screen.classList.remove('has-media');
      });
      screen.appendChild(img);
      screen.classList.add('has-media');
    }

    screen.insertAdjacentHTML('beforeend',
      '<span class="phone-notch"></span>' +
      '<span class="phone-status" aria-hidden="true"><span class="ps-time">9:41</span><span class="ps-icons">' +
        '<svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8"/><rect x="10" y="3" width="3" height="9" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8"/></svg>' +
        '<svg viewBox="0 0 16 12"><path d="M8 2.2c2.4 0 4.6.9 6.2 2.5l1.4-1.5C13.6 1.2 10.9 0 8 0S2.4 1.2.4 3.2l1.4 1.5C3.4 3.1 5.6 2.2 8 2.2zm0 4c1.3 0 2.5.5 3.4 1.3l1.4-1.5C11.5 4.8 9.8 4 8 4s-3.5.8-4.8 2l1.4 1.5C5.5 6.7 6.7 6.2 8 6.2zM8 12l2.2-2.3C9.6 9.2 8.8 9 8 9s-1.6.2-2.2.7z"/></svg>' +
        '<svg class="ps-batt" viewBox="0 0 27 12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="#fff" stroke-opacity=".45"/><rect x="2" y="2" width="16" height="8" rx="1.8"/><rect x="24" y="4" width="2" height="4" rx=".8" fill-opacity=".45"/></svg>' +
      '</span></span>' +
      '<span class="phone-home" aria-hidden="true"></span>' +
      (screen.classList.contains('has-media') ? '' : '<span class="phone-play"></span>'));

    phone.appendChild(screen);
    phone.insertAdjacentHTML('beforeend', '<span class="phone-cam-control"></span>');
    return phone;
  }

  function renderDots(len) {
    showcaseDots.innerHTML = '';
    if (len < 2) return;
    for (let i = 0; i < len; i++) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'showcase-dot' + (i === activeIndex ? ' active' : '');
      dot.setAttribute('aria-label', 'Show clip ' + (i + 1) + ' of ' + len);
      dot.addEventListener('click', () => goTo(i, true));
      showcaseDots.appendChild(dot);
    }
  }

  // Five slots when there's enough real content to fill them without
  // repeating the same clip twice (needs at least 5 distinct items);
  // three when there's less than that but more than one; just the centre
  // otherwise. Keeps the carousel from ever showing a duplicate in view.
  function renderCarousel() {
    showcaseTrack.innerHTML = '';
    const len = pool.length;

    if (len < 2) {
      showcaseCarousel.classList.add('single');
      showcaseDots.innerHTML = '';
      showcaseTrack.appendChild(buildPhoneEl(pool[0] || null, 'is-center', toneFor(0)));
      return;
    }

    showcaseCarousel.classList.remove('single');
    const nearPrevIdx = (activeIndex - 1 + len) % len;
    const nearNextIdx = (activeIndex + 1) % len;
    const useFar = len >= 5;

    const slides = [];
    if (useFar) slides.push({ idx: (activeIndex - 2 + len) % len, cls: 'is-far', label: 'Show earlier clip' });
    slides.push({ idx: nearPrevIdx, cls: 'is-near', label: 'Show previous clip' });
    slides.push({ idx: activeIndex, cls: 'is-center', label: null });
    slides.push({ idx: nearNextIdx, cls: 'is-near', label: 'Show next clip' });
    if (useFar) slides.push({ idx: (activeIndex + 2) % len, cls: 'is-far', label: 'Show later clip' });

    slides.forEach((s) => {
      const el = buildPhoneEl(pool[s.idx], s.cls, toneFor(s.idx));
      if (s.label) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', s.label);
        const jump = () => goTo(s.idx, true);
        el.addEventListener('click', jump);
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(); }
        });
      }
      showcaseTrack.appendChild(el);
    });

    renderDots(len);
  }

  function goTo(index, manual) {
    const len = pool.length;
    if (!len) return;
    activeIndex = ((index % len) + len) % len;
    renderCarousel();
    if (manual) restartAuto();
  }
  function next() { goTo(activeIndex + 1, true); }
  function prev() { goTo(activeIndex - 1, true); }

  let clientsVisible = false;
  if (clientsSection && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      clientsVisible = entries[0].isIntersecting;
      clientsSection.dataset.visible = clientsVisible ? '1' : '0';
      clientsSection.querySelectorAll('video').forEach((v) => {
        if (clientsVisible) v.play().catch(() => {}); else v.pause();
      });
      if (clientsVisible) startAuto(); else stopAuto();
    }, { threshold: 0.2 }).observe(clientsSection);
  } else {
    clientsVisible = true;
  }

  function stopAuto() {
    clearInterval(autoTimer);
    autoTimer = null;
  }
  // Auto-advance is the whole point of the "slider" — but it steps aside
  // the moment anyone actually engages with it: hovering, focusing a
  // control, or the tab going into the background all pause it, and nothing
  // auto-advances at all under reduced motion.
  function startAuto() {
    stopAuto();
    if (prefersReducedMotion || pool.length < 2 || document.hidden || !clientsVisible) return;
    autoTimer = setInterval(() => {
      activeIndex = (activeIndex + 1) % pool.length;
      renderCarousel();
    }, AUTO_MS);
  }
  function restartAuto() { startAuto(); }

  function selectBrand(brand) {
    if (brand === currentBrand) return;
    currentBrand = brand;
    const media = mediaFor(brand);
    pool = getPool(media);
    activeIndex = 0;
    brandPanelName.textContent = brand;
    updateNote(media.photos.length + media.videos.length);
    clientTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.brand === brand));
    renderCarousel();
    startAuto();
  }

  function bindTab(tab) {
    tab.addEventListener('click', () => {
      clearTimeout(previewTimer);
      pickedByVisitor = true;
      lockedBrand = tab.dataset.brand;
      selectBrand(lockedBrand);
    });

    // Desktop-only preview: resting on a tab shows it without committing;
    // moving off reverts to whatever was actually clicked. Gated to real
    // hover+fine-pointer devices so it never fires from a touch tap.
    if (canHover) {
      tab.addEventListener('mouseenter', () => {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => selectBrand(tab.dataset.brand), 150);
      });
    }

    // Roving arrow-key navigation between tabs.
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const at = clientTabs.indexOf(tab);
      clientTabs[(at + dir + clientTabs.length) % clientTabs.length].focus();
    });
  }
  clientTabs.forEach(bindTab);

  // Rebuild the tab strip from the brands the admin actually has, in the
  // admin's order. Existing tabs are reused (they keep their listeners);
  // brands that are new get a fresh tab; brands that were deleted lose theirs.
  // If the list can't be loaded, or comes back empty, the printed tabs stay.
  function syncTabs() {
    const names = Object.keys(MEDIA_DATA || {});
    if (!names.length) return;
    const unchanged = names.length === clientTabs.length &&
      names.every((n, i) => clientTabs[i].dataset.brand === n);
    if (!unchanged) {
      const have = new Map(clientTabs.map((t) => [t.dataset.brand, t]));
      const next = names.map((name) => {
        let tab = have.get(name);
        if (!tab) {
          tab = document.createElement('button');
          tab.type = 'button';
          tab.className = 'client-tab';
          tab.dataset.brand = name;
          tab.appendChild(document.createTextNode(name));
          const dot = document.createElement('span');
          dot.className = 'client-tab-status';
          dot.setAttribute('aria-hidden', 'true');
          tab.appendChild(dot);
          bindTab(tab);
        }
        return tab;
      });
      clientTabsEl.replaceChildren(...next);
      clientTabs = next;
    }
    // keep the selection sensible: if nobody has picked a brand yet, start on
    // the first one in the admin's order; if the shown brand was deleted, move on
    if (!names.includes(currentBrand) || !pickedByVisitor) {
      lockedBrand = names[0];
      currentBrand = null;
      selectBrand(lockedBrand);
    } else {
      clientTabs.forEach((t) => t.classList.toggle('active', t.dataset.brand === currentBrand));
    }
  }

  if (canHover) {
    clientTabsEl.addEventListener('mouseleave', () => {
      clearTimeout(previewTimer);
      if (lockedBrand) selectBrand(lockedBrand);
    });
  }

  if (showcasePrev) showcasePrev.addEventListener('click', prev);
  if (showcaseNext) showcaseNext.addEventListener('click', next);
  if (showcaseCarousel) {
    showcaseCarousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    });
    // pause the auto-advance for as long as someone's actually engaging
    // with the carousel, by mouse or by keyboard
    showcaseCarousel.addEventListener('mouseenter', stopAuto);
    showcaseCarousel.addEventListener('mouseleave', startAuto);
    showcaseCarousel.addEventListener('focusin', stopAuto);
    showcaseCarousel.addEventListener('focusout', startAuto);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAuto(); else startAuto();
  });

  // show content immediately — first brand in the picker, no interaction needed
  const firstTab = clientTabs[0];
  if (firstTab) {
    lockedBrand = firstTab.dataset.brand;
    selectBrand(lockedBrand);
  }
  updateStatusDots();

  // MEDIA_DATA loads asynchronously from the admin API, and typically
  // hasn't arrived yet by the time the block above runs — without this,
  // the very first showcase on page load would be stuck on a placeholder
  // even when that brand already has real uploaded content, until someone
  // happened to switch brands and back. This rebuilds the pool once the
  // real data is in, whether or not the brand selection has changed.
  document.addEventListener('mediaDataReady', () => {
    syncTabs();
    updateStatusDots();
    const media = mediaFor(currentBrand);
    pool = getPool(media);
    activeIndex = 0;
    updateNote(media.photos.length + media.videos.length);
    renderCarousel();
    if (clientsSection && clientsSection.dataset.visible === '1') startAuto();
  });
}


// ---- sticky mobile CTA: show after the hero, hide over the contact form ----
const stickyCta = document.getElementById('stickyCta');
const contactSection = document.getElementById('contact');
if (stickyCta && contactSection) {
  const heroEl = document.querySelector('.hero');
  const update = () => {
    const pastHero = heroEl ? window.scrollY > heroEl.offsetHeight * 0.7 : window.scrollY > 500;
    const contactTop = contactSection.getBoundingClientRect().top;
    const atContact = contactTop < window.innerHeight * 0.9;
    stickyCta.classList.toggle('show', pastHero && !atContact);
  };
  let queued = false;
  const onScrollCta = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; update(); });
  };
  window.addEventListener('scroll', onScrollCta, { passive: true });
  window.addEventListener('resize', onScrollCta);
  update();
}

// ---- FAQ: only one answer open at a time ----
const faqItems = document.querySelectorAll('.faq-item');
faqItems.forEach((item) => {
  item.addEventListener('toggle', () => {
    if (!item.open) return;
    faqItems.forEach((other) => {
      if (other !== item) other.open = false;
    });
  });
});

// ---- close the mobile menu after tapping a link ----
if (navLinks) {
  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}


// ---- contact section: blurred background video ----
// There's no dedicated "contact" footage, so this reuses a video already
// uploaded in the admin, purely for ambient motion/colour behind the CTA.
// It plays the video uploaded for "How it works" step 2 (admin slot
// slot-how-2). To use a different one, change CONTACT_VIDEO_SLOT.
(function contactBackgroundVideo() {
  const CONTACT_VIDEO_SLOT = 'slot-how-2';       // <- admin upload slot whose video plays behind "Get in touch"
  const CONTACT_VIDEO_BRAND = 'Little Buddha';   // fallback brand if that slot has no video yet
  const video = document.getElementById('contactVideo');
  const section = document.getElementById('contact');
  if (!video || !section) return;
  let contactVisible = false;

  // Performance: a CSS blur on a full-screen playing video is re-computed
  // every frame and was the heaviest thing on the page. Instead the clip is
  // shrunk step by step to a tiny 24x14 picture (that IS the blur: every
  // pixel averages a big patch of the video), then smoothly enlarged step by
  // step to 384x216 before the browser stretches it to full size. Enlarging
  // in small, smoothed steps is what keeps it soft: stretching the tiny
  // picture in one go looks blocky in some browsers (Safari). All of this
  // is a few thousand pixels per frame, so it stays cheap. For a stronger or
  // lighter blur, change the 24x14 core below (bigger = sharper).
  const canvas = document.createElement('canvas');   // the visible one (largest)
  canvas.className = 'contact-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  video.after(canvas);
  function smoothCtx(c, w, h) {
    c.width = w;
    c.height = h;
    const x = c.getContext('2d', { alpha: false });
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    return x;
  }
  const c192 = document.createElement('canvas');
  const c96 = document.createElement('canvas');
  const c48 = document.createElement('canvas');
  const c24 = document.createElement('canvas');
  const x192 = smoothCtx(c192, 192, 108);
  const x96 = smoothCtx(c96, 96, 54);
  const x48 = smoothCtx(c48, 48, 27);
  const x24 = smoothCtx(c24, 24, 14);
  const ctx = smoothCtx(canvas, 384, 216);
  let raf = null;
  let lastDraw = 0;

  function paint() {
    x192.drawImage(video, 0, 0, 192, 108);   // shrink...
    x96.drawImage(c192, 0, 0, 96, 54);
    x48.drawImage(c96, 0, 0, 48, 27);
    x24.drawImage(c48, 0, 0, 24, 14);        // ...to the blurred core
    x48.drawImage(c24, 0, 0, 48, 27);        // enlarge, smoothing each step
    x96.drawImage(c48, 0, 0, 96, 54);
    x192.drawImage(c96, 0, 0, 192, 108);
    ctx.drawImage(c192, 0, 0, 384, 216);
  }

  function draw(now) {
    raf = requestAnimationFrame(draw);
    if (now - lastDraw < 50) return;           // ~20fps is plenty for a blurred backdrop
    lastDraw = now;
    if (video.readyState >= 2) {
      try { paint(); canvas.classList.add('ready'); } catch (e) { /* not ready */ }
    }
  }
  function start() {
    if (!video.getAttribute('src')) return;
    video.play().catch(() => {});
    if (!raf) raf = requestAnimationFrame(draw);
  }
  function stop() {
    video.pause();
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function assignVideo() {
    // 1) the video uploaded for the CONTACT_VIDEO_SLOT (How it works step 2)
    const own = typeof slotPick === 'function' ? slotPick(CONTACT_VIDEO_SLOT).video : '';
    if (own) {
      if (video.getAttribute('src') !== own) video.src = own;
      if (contactVisible) start();
      return;
    }
    // 2) otherwise the first uploaded video of CONTACT_VIDEO_BRAND (matched
    // loosely, so "Little Buddha" also matches "Little Buddha Cocktail Co."),
    // then any other brand's video, except Lavelle (the clip this replaced).
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const all = Object.keys(typeof MEDIA_DATA !== 'undefined' ? MEDIA_DATA : {});
    const want = norm(CONTACT_VIDEO_BRAND);
    const isWanted = (b) => norm(b).includes(want);
    const brands = all.filter(isWanted).concat(all.filter((b) => !isWanted(b) && !norm(b).includes('lavelle')));
    for (const brand of brands) {
      const vids = (MEDIA_DATA[brand] && MEDIA_DATA[brand].videos) || [];
      if (vids.length && vids[0].src && typeof resolveMedia === 'function') {
        const src = resolveMedia(vids[0].src);
        if (video.getAttribute('src') !== src) video.src = src;
        if (contactVisible) start();
        return;
      }
    }
  }

  assignVideo();
  document.addEventListener('mediaDataReady', assignVideo);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      contactVisible = entries[0].isIntersecting;
      if (contactVisible) start(); else stop();
    }, { threshold: 0.1 }).observe(section);
  }
})();

// ---- contact form modal ----
(function contactModal() {
  const modal = document.getElementById('contactModal');
  const backdrop = document.getElementById('contactModalBackdrop');
  const closeBtn = document.getElementById('contactModalClose');
  const openers = [
    document.getElementById('openContactModal'),
    document.getElementById('openContactModalFooter'),
    document.getElementById('openContactModalHero'),
    document.getElementById('openContactModalNav'),
  ].filter(Boolean);
  if (!modal || !openers.length) return;

  function open(e) {
    if (e) e.preventDefault();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
  }
  function close() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
  }

  openers.forEach((el) => el.addEventListener('click', open));
  if (backdrop) backdrop.addEventListener('click', close);
  if (closeBtn) closeBtn.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) close();
  });
})();

// ---- contact form: handled in js/forms.js ----


// ---- performance: pause every CSS animation inside sections that are off
// screen (feed wall, glows, pulses, shimmers). They resume the moment the
// section scrolls back into view, so nothing looks different — the browser
// just stops compositing/painting motion nobody can see.
(function pauseOffscreenAnimations() {
  if (!('IntersectionObserver' in window)) return;
  const secs = document.querySelectorAll('#sections > section, #sections > .band');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting));
  }, { rootMargin: '120px 0px' });
  secs.forEach((s) => io.observe(s));
})();
