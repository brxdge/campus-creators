// ============================================================
// "What we do" — expand-on-select showcase.
//
// Clicking any card makes it active (CSS flex-grow handles the expand
// animation) and plays its video; the previously active card pauses.
// Only one video ever plays at once, matching the performance-conscious
// pattern already established elsewhere on this site (the hero feed wall
// and How It Works both cap simultaneous video decode for the same reason).
//
// Video content: same honest situation as How It Works — there's no
// dedicated footage per service, so this pulls real clips from the
// existing brand campaign library (MEDIA_DATA, populated by main.js).
// ============================================================
(function () {
  const cards = document.querySelectorAll('#svcShowcase .svc-card');
  if (!cards.length) return;

  function collectVideoPool() {
    const pool = [];
    Object.keys(typeof MEDIA_DATA !== 'undefined' ? MEDIA_DATA : {}).forEach((brand) => {
      const vids = (MEDIA_DATA[brand] && MEDIA_DATA[brand].videos) || [];
      vids.forEach((v) => {
        if (v && v.src) pool.push({ brand, src: v.src, poster: v.poster || '' });
      });
    });
    return pool;
  }

  function collectPhotoPool() {
    const byBrand = {};
    const all = [];
    Object.keys(typeof MEDIA_DATA !== 'undefined' ? MEDIA_DATA : {}).forEach((brand) => {
      const photos = (MEDIA_DATA[brand] && MEDIA_DATA[brand].photos) || [];
      if (photos.length) byBrand[brand] = photos[0];
      photos.forEach((p) => { if (p) all.push(p); });
    });
    return { byBrand, all };
  }

  function fallbackPoster(brand, photoPool) {
    if (photoPool.byBrand[brand]) return photoPool.byBrand[brand];
    if (photoPool.all.length) return photoPool.all[0];
    return '';
  }

  function slug(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  function assignMedia() {
    if (typeof resolveMedia !== 'function') return;
    const pool = collectVideoPool();
    const photoPool = collectPhotoPool();

    cards.forEach((card, i) => {
      const poster = card.querySelector('.svc-poster');
      const video = card.querySelector('.svc-video');
      if (!poster || !video) return;

      // admin-assigned media for this service wins over the shared pool
      const own = typeof slotPick === 'function' ? slotPick('slot-svc-' + slug(card.dataset.title)) : null;
      if (own && (own.video || own.poster)) {
        if (own.poster) poster.src = own.poster;
        if (own.video) {
          video.style.display = '';
          video.src = own.video;
        } else {
          video.pause();
          video.removeAttribute('src');
          video.style.display = 'none';
        }
        video.disablePictureInPicture = true;
        video.disableRemotePlayback = true;
        return;
      }

      if (!pool.length) return;
      const clip = pool[i % pool.length];   // cycle if fewer real clips than cards
      video.style.display = '';
      const posterSrc = clip.poster || fallbackPoster(clip.brand, photoPool);
      if (posterSrc) poster.src = resolveMedia(posterSrc);
      video.src = resolveMedia(clip.src);
      video.disablePictureInPicture = true;
      video.disableRemotePlayback = true;
    });
  }

  assignMedia();
  document.addEventListener('mediaDataReady', assignMedia);

  function setActive(target) {
    cards.forEach((card) => {
      const video = card.querySelector('.svc-video');
      if (card === target) {
        card.classList.add('active');
        if (video) video.play().catch(() => {});
      } else {
        card.classList.remove('active');
        if (video && !video.paused) video.pause();
      }
    });
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => setActive(card));
  });

  // the first card starts active in the HTML — start its video too
  const initiallyActive = document.querySelector('#svcShowcase .svc-card.active');
  if (initiallyActive) {
    const v = initiallyActive.querySelector('.svc-video');
    if (v) v.play().catch(() => {});
  }
})();