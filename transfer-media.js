// ============================================================
// Copies every brand + placeholder and all their photos/videos from your
// local admin (localhost:3000) to the live admin, through the normal admin
// API. Safe to run more than once: files already on the live site (same
// name and size) are skipped.
//
// Run from the project folder, with your local server running:
//
//   $env:LOCAL_PASSCODE="admincc"
//   $env:LIVE_URL="https://campuscreators.ca"
//   $env:LIVE_PASSCODE="your-live-passcode"
//   node transfer-media.js
//
// Needs Node 18 or newer.
// ============================================================
const LOCAL_URL = (process.env.LOCAL_URL || 'http://localhost:3000').replace(/\/$/, '');
const LIVE_URL = (process.env.LIVE_URL || '').replace(/\/$/, '');
const LOCAL_PASSCODE = process.env.LOCAL_PASSCODE || '';
const LIVE_PASSCODE = process.env.LIVE_PASSCODE || '';

function fail(msg) { console.error('\n✖ ' + msg + '\n'); process.exit(1); }

if (!LIVE_URL) fail('Set LIVE_URL, e.g.  $env:LIVE_URL="https://campuscreators.ca"');
if (!LOCAL_PASSCODE || !LIVE_PASSCODE) fail('Set both LOCAL_PASSCODE and LIVE_PASSCODE.');
if (typeof fetch !== 'function' || typeof FormData !== 'function') fail('Node 18 or newer is required (run: node -v).');

async function login(base, passcode) {
  let res;
  try {
    res = await fetch(base + '/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
  } catch (e) {
    fail(`Could not reach ${base}. Is it running / is the address right?`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    fail(`Sign-in failed at ${base}: ${data.error || res.status}`);
  }
  const raw = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [res.headers.get('set-cookie') || ''];
  const cookie = raw.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
  if (!cookie) fail(`${base} did not return a session cookie.`);
  return cookie;
}

async function api(base, cookie, path, options = {}) {
  const res = await fetch(base + path, Object.assign({}, options, {
    headers: Object.assign({ Cookie: cookie }, options.headers || {}),
  }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${path} failed (${res.status})`);
  return data;
}

(async () => {
  console.log(`\nFrom: ${LOCAL_URL}\nTo:   ${LIVE_URL}\n`);
  const localCookie = await login(LOCAL_URL, LOCAL_PASSCODE);
  const liveCookie = await login(LIVE_URL, LIVE_PASSCODE);

  const { brands: localBrands } = await api(LOCAL_URL, localCookie, '/api/admin/brands');
  let { brands: liveBrands } = await api(LIVE_URL, liveCookie, '/api/admin/brands');

  let copied = 0, skipped = 0, failed = 0;

  for (const brand of localBrands) {
    if (!brand.media.length) continue;

    let target = liveBrands.find((b) => b.name === brand.name);
    if (!target) {
      await api(LIVE_URL, liveCookie, '/api/admin/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: brand.name }),
      });
      ({ brands: liveBrands } = await api(LIVE_URL, liveCookie, '/api/admin/brands'));
      target = liveBrands.find((b) => b.name === brand.name);
      if (!target) { console.log(`  ✖ could not create "${brand.name}" on live`); failed += brand.media.length; continue; }
    }

    const label = brand.name.indexOf('slot-') === 0 ? `placeholder ${brand.name.slice(5)}` : brand.name;
    console.log(`${label}`);

    for (const m of brand.media) {
      const name = m.original || m.filename;
      const already = target.media.some((x) =>
        (x.original || x.filename) === name && (!m.bytes || !x.bytes || x.bytes === m.bytes));
      if (already) { console.log(`  • skip ${name} (already on live)`); skipped++; continue; }

      try {
        const fileRes = await fetch(LOCAL_URL + '/media/' + encodeURIComponent(m.filename));
        if (!fileRes.ok) throw new Error('local file missing');
        const blob = await fileRes.blob();
        const form = new FormData();
        form.append('brandId', String(target.id));
        form.append('files', blob, name);
        const res = await fetch(LIVE_URL + '/api/admin/upload', {
          method: 'POST', headers: { Cookie: liveCookie }, body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `upload failed (${res.status})`);
        console.log(`  ✔ ${name}`);
        copied++;
      } catch (e) {
        console.log(`  ✖ ${name}: ${e.message}`);
        failed++;
      }
    }
  }

  console.log(`\nDone. Copied ${copied}, skipped ${skipped}, failed ${failed}.\n`);
  if (failed) process.exitCode = 1;
})().catch((e) => fail(e.message));
