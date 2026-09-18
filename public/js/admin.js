(function () {
  const gate = document.getElementById('gate');
  const app = document.getElementById('app');
  const loginForm = document.getElementById('loginForm');
  const passcode = document.getElementById('passcode');
  const gateError = document.getElementById('gateError');
  const brandList = document.getElementById('brandList');
  const toastEl = document.getElementById('toast');

  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('err', !!isError);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  async function api(url, options) {
    let res;
    try {
      res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options));
    } catch (netErr) {
      throw new Error('Could not reach the server. Is it still running?');
    }

    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      // we got HTML back — almost always means the page isn't being served
      // by this Node server (e.g. opened as a file, or via Live Server)
      throw new Error(
        `Server returned ${res.status} (not JSON). Open the site at ` +
        `http://localhost:3000/admin — not as a file or via Live Server.`
      );
    }

    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body is fine */ }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
    return data;
  }

  // ---- session ----
  async function checkSession() {
    try {
      const { signedIn } = await api('/api/admin/session');
      if (signedIn) showApp();
    } catch (e) { /* stay on the gate */ }
  }

  function showApp() {
    gate.hidden = true;
    app.hidden = false;
    loadBrands();
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    gateError.textContent = '';
    try {
      await api('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.value }),
      });
      passcode.value = '';
      showApp();
    } catch (err) {
      gateError.textContent = err.message;
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
    location.reload();
  });

  // ---- brands ----
  async function loadBrands() {
    brandList.innerHTML = '<p class="loading">Loading…</p>';
    try {
      const { brands } = await api('/api/admin/brands');
      renderBrands(brands);
    } catch (err) {
      brandList.innerHTML = '<p class="loading">' + err.message + '</p>';
    }
  }

  function renderBrands(brands) {
    if (!brands.length) {
      brandList.innerHTML = '<p class="loading">No brands yet — add one above.</p>';
      return;
    }
    brandList.innerHTML = '';
    brands.forEach((brand) => brandList.appendChild(brandCard(brand)));
  }

  function brandCard(brand) {
    const photos = brand.media.filter((m) => m.kind === 'photo').length;
    const videos = brand.media.filter((m) => m.kind === 'video').length;

    const el = document.createElement('div');
    el.className = 'brand';
    el.innerHTML = `
      <div class="brand-head">
        <div class="brand-title">
          <h3></h3>
          <span class="brand-count">${photos} photo${photos === 1 ? '' : 's'} · ${videos} video${videos === 1 ? '' : 's'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="brand-del" type="button">Remove</button>
          <span class="brand-chevron">&#9660;</span>
        </div>
      </div>
      <div class="brand-body">
        <div class="drop">
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm">
          <p>Drop files here, or click to choose</p>
          <small>JPG, PNG, WEBP, MP4, MOV, WEBM — vertical crops work best</small>
        </div>
        <div class="progress"><span></span></div>
        <div class="media-grid"></div>
      </div>
    `;

    // set the name as text, never as HTML
    el.querySelector('h3').textContent = brand.name;

    const head = el.querySelector('.brand-head');
    const drop = el.querySelector('.drop');
    const input = el.querySelector('input[type=file]');
    const grid = el.querySelector('.media-grid');
    const progress = el.querySelector('.progress');
    const bar = progress.querySelector('span');

    head.addEventListener('click', (e) => {
      if (e.target.closest('.brand-del')) return;
      el.classList.toggle('open');
    });

    el.querySelector('.brand-del').addEventListener('click', async () => {
      if (!confirm(`Remove "${brand.name}" and all its uploaded files? This cannot be undone.`)) return;
      try {
        await api('/api/admin/brands/' + brand.id, { method: 'DELETE' });
        toast('Brand removed.');
        loadBrands();
      } catch (err) { toast(err.message, true); }
    });

    renderMedia(grid, brand.media);

    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      if (input.files.length) uploadFiles(input.files);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach((evt) =>
      drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((evt) =>
      drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => {
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });

    function uploadFiles(files) {
      const form = new FormData();
      form.append('brandId', brand.id);
      Array.from(files).forEach((f) => form.append('files', f));

      progress.classList.add('show');
      bar.style.width = '0%';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/upload');
      xhr.withCredentials = true;
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
      });
      xhr.addEventListener('load', () => {
        progress.classList.remove('show');
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) {
          toast(`Uploaded ${data.added ? data.added.length : ''} file(s).`);
          loadBrands();
        } else {
          toast(data.error || 'Upload failed.', true);
        }
      });
      xhr.addEventListener('error', () => {
        progress.classList.remove('show');
        toast('Upload failed.', true);
      });
      xhr.send(form);
    }

    return el;
  }

  function renderMedia(grid, media) {
    if (!media.length) {
      grid.innerHTML = '<p class="empty">Nothing uploaded yet.</p>';
      return;
    }
    grid.innerHTML = '';
    media.forEach((m) => {
      const item = document.createElement('div');
      item.className = 'media-item';
      const src = '/media/' + m.filename;
      item.innerHTML = m.kind === 'video'
        ? `<video src="${src}" muted loop playsinline preload="metadata"></video>`
        : `<img src="${src}" alt="" loading="lazy">`;
      item.insertAdjacentHTML('beforeend',
        `<span class="media-kind">${m.kind}</span>` +
        `<button class="media-del" type="button" title="Delete">&times;</button>`);

      const vid = item.querySelector('video');
      if (vid) {
        item.addEventListener('mouseenter', () => vid.play().catch(() => {}));
        item.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0; });
      }

      item.querySelector('.media-del').addEventListener('click', async () => {
        if (!confirm('Delete this file?')) return;
        try {
          await api('/api/admin/media/' + m.id, { method: 'DELETE' });
          toast('Deleted.');
          loadBrands();
        } catch (err) { toast(err.message, true); }
      });

      grid.appendChild(item);
    });
  }

  document.getElementById('addBrandBtn').addEventListener('click', async () => {
    const input = document.getElementById('newBrand');
    const name = input.value.trim();
    if (!name) return;
    try {
      await api('/api/admin/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      input.value = '';
      toast('Brand added.');
      loadBrands();
    } catch (err) { toast(err.message, true); }
  });

  checkSession();
})();