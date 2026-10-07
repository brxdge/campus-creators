// dotenv only reads a local .env file. On Railway the variables are set for us, so
// if the package is missing the site must still start.
try { require('dotenv').config(); } catch (e) { /* not installed: fine */ }

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const store = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
// Public address of the site (used for sitemap, canonical host redirect).
const SITE_URL = (process.env.SITE_URL || 'https://campuscreators.ca').replace(/\/+$/, '');
const SITE_HOST = new URL(SITE_URL).host;

// ---- config ----------------------------------------------------------------
// Set these in Railway (Variables tab). Never commit real values.
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Where uploaded files are written. On Railway point this at a mounted volume
// (e.g. /data/uploads) or uploads vanish on every redeploy.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);

if (!ADMIN_PASSCODE) console.warn('[warn] ADMIN_PASSCODE is not set — the admin portal is disabled.');
else if (ADMIN_PASSCODE.length < 12) console.warn('[warn] ADMIN_PASSCODE is short. Use 12+ characters.');
if (!process.env.SESSION_SECRET) console.warn('[warn] SESSION_SECRET is not set — admin sessions reset on every restart.');

// ---- baseline hardening ----------------------------------------------------
app.disable('x-powered-by');
app.set('trust proxy', 1);             // Railway sits behind one proxy: real client IP + https

// Security headers on every response.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' mailto:",
  "frame-ancestors 'none'",
].concat(PROD ? ['upgrade-insecure-requests'] : []).join('; ');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  // force https + one canonical host (www -> apex) in production
  if (PROD && (req.method === 'GET' || req.method === 'HEAD')) {
    const host = req.get('host') || '';
    const alt = SITE_HOST.startsWith('www.') ? SITE_HOST.slice(4) : 'www.' + SITE_HOST;
    if (host === alt) return res.redirect(301, SITE_URL + req.originalUrl);
    if (!req.secure) return res.redirect(301, 'https://' + host + req.originalUrl);
  }
  next();
});

// gzip compression when the package is installed (faster pages rank better)
try { app.use(require('compression')()); } catch (e) { /* optional: npm i compression */ }

// ---- Creator Search -> website (receiver) -----------------------------------
// The separate Creator Search app POSTs saved creators here. It is a
// server-to-server call (no browser Origin header), so it has to sit BEFORE the
// same-site guard below; it protects itself with CREATOR_SEARCH_SECRET and reads
// its own body, so it also sits before the JSON parser. Admin side: see
// app.use(discovered.admin) further down.
const DATA_DIR = process.env.DATA_DIR || path.dirname(UPLOAD_DIR);
// If creator-inbox.js is missing or fails to load, the rest of the site must
// still start: this feature switches itself off and says why in the logs.
let discovered = null;
try {
  discovered = require('./creator-inbox')({ requireAdmin, dataDir: DATA_DIR });
  app.use(discovered.receiver);
} catch (e) {
  console.error('[warn] Discovered creators is switched off:', e.message);
}

// Cross-site request guard: any state-changing API call must come from this
// site. Browsers always send Origin on POST/PATCH/DELETE fetches, so a
// forged form or script on another domain is rejected here.
function sameOrigin(req) {
  const host = req.get('host');
  const src = req.get('origin') || req.get('referer');
  if (!src) return !PROD;              // allow curl/local testing outside production
  try { return new URL(src).host === host; } catch (e) { return false; }
}
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Request blocked.' });
  next();
});

// ---- TikTok OAuth Routes ---------------------------------------------------
app.get('/api/tiktok/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }

  try {
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TIKTOK_REDIRECT_URI,
      }),
    });

    const data = await tokenResponse.json();

    if (data.access_token) {
      process.env.TIKTOK_ACCESS_TOKEN = data.access_token;
      if (data.refresh_token) {
        process.env.TIKTOK_REFRESH_TOKEN = data.refresh_token;
      }

      return res.json({
        success: true,
        message: 'TikTok connected! Access token saved.',
        access_token: data.access_token.substring(0, 20) + '...',
        expires_in: data.expires_in,
      });
    } else {
      return res.status(400).json({
        error: data.error || 'Token exchange failed',
        message: data.error_description
      });
    }
  } catch (error) {
    console.error('[tiktok-oauth] Error:', error);
    return res.status(500).json({ error: 'Token exchange failed', details: error.message });
  }
});

app.get('/api/tiktok/login', (req, res) => {
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3000/api/tiktok/callback';
  const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
  authUrl.searchParams.append('client_key', process.env.TIKTOK_CLIENT_KEY);
  authUrl.searchParams.append('scope', 'user.info.basic');
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('state', 'cc-' + Date.now());

  res.json({ authUrl: authUrl.toString() });
});

app.get('/api/tiktok/status', async (req, res) => {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!token) return res.json({ connected: false, reason: 'No access token yet. Log in with TikTok first.' });
  try {
    const r = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await r.json();
    const user = data && data.data && data.data.user;
    if (user) return res.json({ connected: true, displayName: user.display_name, openId: user.open_id });
    return res.json({ connected: false, reason: (data.error && data.error.message) || 'Token was rejected by TikTok.' });
  } catch (e) {
    return res.json({ connected: false, reason: e.message });
  }
});

// TikTok Business API (TikTok One) sends the browser back here after an
// authorization. For now this page only makes the redirect URL resolve: it does
// not read, show, or store the authorization code. The token exchange gets added
// once the TikTok app is approved and the exact exchange is confirmed.
app.get('/api/tiktok/business-callback', (req, res) => {
  res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' });
  res.status(200).type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Campus Creators</title>'
    + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1A1A1C;color:#F2EFE6;'
    + 'font-family:system-ui,sans-serif;text-align:center;padding:24px}a{color:#EB3F22}</style></head><body><main>'
    + '<h1>You have been sent back from TikTok</h1>'
    + '<p>Nothing else is needed on this page. You can close this tab or return to the admin dashboard.</p>'
    + '<p><a href="/admin">Go to admin</a></p></main></body></html>');
});

app.use(express.json({ limit: '50kb' }));
app.use(cookieParser(SESSION_SECRET));

// admin API responses are private and never cached
app.use('/api/admin', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

// ---- auth ------------------------------------------------------------------
const COOKIE = 'cc_admin';
const SESSION_MS = 1000 * 60 * 60 * 8;          // 8 hour session
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

// The signing key includes the passcode, so changing ADMIN_PASSCODE in
// Railway instantly signs everyone out.
const SIGN_KEY = crypto.createHmac('sha256', SESSION_SECRET).update('cc-admin:' + ADMIN_PASSCODE).digest();
const revoked = new Map();                       // nonce -> expiry (logged-out sessions)

function sign(payload) {
  return crypto.createHmac('sha256', SIGN_KEY).update(payload).digest('hex');
}

function makeToken() {
  const payload = `${Date.now()}.${crypto.randomBytes(12).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}

function parseToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [issued, nonce, sig] = parts;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(`${issued}.${nonce}`));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Date.now() - Number(issued);
  if (!(age >= 0 && age < SESSION_MS)) return null;
  if (revoked.has(nonce)) return null;
  return { issued: Number(issued), nonce };
}
const validToken = (t) => !!parseToken(t);

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSCODE) return res.status(503).json({ error: 'Admin portal not configured.' });
  if (!validToken(req.signedCookies[COOKIE])) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

const cookieOpts = {
  httpOnly: true,
  signed: true,
  sameSite: 'strict',
  secure: PROD,
  path: '/',
};

// Brute-force protection: 5 wrong passcodes per IP in 15 min locks that IP
// for 15 min; 30 wrong across all IPs in 15 min locks login for everyone
// briefly (slows distributed guessing).
const WINDOW = 15 * 60 * 1000;
const fails = new Map();                          // ip -> [timestamps]
let globalFails = [];
function recentFails(ip) {
  const now = Date.now();
  const list = (fails.get(ip) || []).filter((t) => now - t < WINDOW);
  if (list.length) fails.set(ip, list); else fails.delete(ip);
  globalFails = globalFails.filter((t) => now - t < WINDOW);
  return list.length;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip] of fails) recentFails(ip);
  for (const [n, exp] of revoked) if (exp < now) revoked.delete(n);
}, 60 * 1000).unref();

app.post('/api/admin/login', async (req, res) => {
  if (!ADMIN_PASSCODE) return res.status(503).json({ error: 'Admin portal not configured.' });
  const ip = req.ip || 'unknown';
  if (recentFails(ip) >= 5 || globalFails.length >= 30) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  const supplied = String((req.body || {}).passcode || '').slice(0, 256);
  const ok = crypto.timingSafeEqual(sha(supplied), sha(ADMIN_PASSCODE));
  if (!ok) {
    const now = Date.now();
    fails.set(ip, (fails.get(ip) || []).concat(now));
    globalFails.push(now);
    await new Promise((r) => setTimeout(r, 600));  // slow down guessing
    return res.status(401).json({ error: 'Incorrect passcode.' });
  }
  fails.delete(ip);
  res.cookie(COOKIE, makeToken(), Object.assign({ maxAge: SESSION_MS }, cookieOpts));
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const t = parseToken(req.signedCookies[COOKIE]);
  if (t) revoked.set(t.nonce, t.issued + SESSION_MS);
  res.clearCookie(COOKIE, cookieOpts);
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ signedIn: !!ADMIN_PASSCODE && validToken(req.signedCookies[COOKIE]) });
});

// ---- uploads ---------------------------------------------------------------
const ALLOWED = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'];
const VIDEO_EXT = ['mp4', 'mov', 'webm'];
const MEDIA_NAME = /^[a-f0-9]{20}\.(jpg|png|webp|mp4|mov|webm)$/;

function extOf(name) {
  return String(name || '').split('.').pop().toLowerCase();
}

// Some browsers (notably on Windows) send application/octet-stream instead of a
// real mimetype, so fall back to the file extension before rejecting.
function typeFor(file) {
  if (ALLOWED[file.mimetype]) return ALLOWED[file.mimetype];
  const ext = extOf(file.originalname);
  return ALLOWED_EXT.includes(ext) ? (ext === 'jpeg' ? 'jpg' : ext) : null;
}

// Check the file's real contents (magic bytes), not just its name/mimetype,
// so a renamed script or HTML file can never be stored as "media".
function sniff(fullPath) {
  let buf = Buffer.alloc(16);
  let fd;
  try {
    fd = fs.openSync(fullPath, 'r');
    fs.readSync(fd, buf, 0, 16, 0);
  } catch (e) { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', kind: 'photo' };
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', kind: 'photo' };
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return { ext: 'webp', kind: 'photo' };
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { ext: 'webm', kind: 'video' };
  const box = buf.toString('latin1', 4, 8);
  if (box === 'ftyp') {
    const brand = buf.toString('latin1', 8, 12);
    return { ext: brand === 'qt  ' ? 'mov' : 'mp4', kind: 'video' };
  }
  if (['moov', 'mdat', 'wide', 'free', 'skip'].includes(box)) return { ext: 'mov', kind: 'video' };
  return null;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = typeFor(file) || 'bin';
      // random name — never trust the uploaded filename on disk
      cb(null, `${crypto.randomBytes(10).toString('hex')}.${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 20, fields: 10, fieldSize: 1024 },
  fileFilter: (req, file, cb) => {
    if (!typeFor(file)) {
      return cb(new Error('Only JPG, PNG, WEBP, MP4, MOV and WEBM are allowed.'));
    }
    cb(null, true);
  },
});

function uploadError(err) {
  if (err && err.code === 'LIMIT_FILE_SIZE') return `Each file must be under ${MAX_UPLOAD_MB} MB.`;
  if (err && err.code === 'LIMIT_FILE_COUNT') return 'Up to 20 files at a time.';
  if (err && /Only JPG/.test(err.message)) return err.message;
  return 'Upload failed.';
}

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.array('files', 20)(req, res, (err) => {
    const files = req.files || [];
    const discard = () => files.forEach((f) => fs.unlink(f.path, () => {}));
    if (err) { discard(); return res.status(400).json({ error: uploadError(err) }); }

    const brandId = Number(req.body.brandId);
    const brand = store.listBrands().find((b) => b.id === brandId);
    if (!brand) { discard(); return res.status(400).json({ error: 'Unknown brand.' }); }

    // verify every file's real contents before saving any of them
    const checked = files.map((f) => ({ f, real: sniff(f.path) }));
    if (checked.some((c) => !c.real)) {
      discard();
      return res.status(400).json({ error: "One of those files isn't a real image or video." });
    }

    const added = checked.map(({ f, real }) => {
      let filename = f.filename;
      const want = filename.replace(/\.[a-z0-9]+$/, '.' + real.ext);
      if (want !== filename) {                // extension didn't match contents: fix it
        fs.renameSync(f.path, path.join(UPLOAD_DIR, want));
        filename = want;
      }
      return store.addMedia({
        brandId,
        kind: real.kind,
        filename,
        original: String(f.originalname || '').slice(0, 120),
        bytes: f.size,
      });
    });

    res.json({ ok: true, added });
  });
});

// ---- admin data ------------------------------------------------------------
app.get('/api/admin/brands', requireAdmin, (req, res) => {
  const brands = store.listBrands().map((b) => ({
    ...b,
    media: store.listMedia(b.id),
  }));
  res.json({ brands });
});

app.post('/api/admin/brands', requireAdmin, (req, res) => {
  const name = String((req.body || {}).name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (name.length > 60) return res.status(400).json({ error: 'That name is too long.' });
  try {
    store.addBrand(name);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.code === 'DUPLICATE' ? e.message : 'Could not add that brand.' });
  }
});

function unlinkMedia(filename) {
  if (MEDIA_NAME.test(filename)) fs.unlink(path.join(UPLOAD_DIR, filename), () => {});
}

app.delete('/api/admin/brands/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  store.listMedia(id).forEach((m) => unlinkMedia(m.filename));
  store.deleteBrand(id);
  res.json({ ok: true });
});

app.delete('/api/admin/media/:id', requireAdmin, (req, res) => {
  const item = store.getMedia(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found.' });
  unlinkMedia(item.filename);
  store.deleteMedia(item.id);
  res.json({ ok: true });
});

// ---- public ----------------------------------------------------------------
// What the live site reads to render brand photos and videos
app.get('/api/media', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ media: store.publicMediaMap(), path: '/media/' });
});

// serve uploaded files (read-only, strict names only, no directory listing)
app.get('/media/:file', (req, res) => {
  const file = String(req.params.file || '');
  if (!MEDIA_NAME.test(file)) return res.status(404).end();
  const full = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.sendFile(full);
});

// ---- contact ---------------------------------------------------------------
// TODO: wire to Resend. Needs RESEND_API_KEY.
app.post('/api/contact', (req, res) => {
  res.status(501).json({ error: 'Contact endpoint not wired up yet.' });
});

// ---- form submissions (Brands contact + Talents apply) ---------------------
const submissions = require('./submissions');       // DATA_DIR is defined near the top
app.use(submissions({ requireAdmin, dataDir: DATA_DIR }));

// ---- Campus Ambassadors (Talents page) -------------------------------------
const roster = require('./roster');
app.use(roster({ requireAdmin, dataDir: DATA_DIR }));

// ---- The Work case studies (Brands page) -----------------------------------
const cases = require('./cases');
app.use(cases({ requireAdmin, dataDir: DATA_DIR }));

// ---- Creator database + AI Creator Search (admin only) ----------------------
const creators = require('./creators');
const creatorsRouter = creators({
  requireAdmin, dataDir: DATA_DIR,
  onDelete: (c) => { if (c.profile_image) unlinkMedia(c.profile_image); },
});
app.use(creatorsRouter);

// ---- Discovered creators: what Creator Search sent (admin only) -------------
if (discovered) app.use(discovered.admin);

// creator profile photo: one image, checked the same way as other uploads
app.post('/api/admin/creators/:id/photo', requireAdmin, (req, res) => {
  upload.single('file')(req, res, (err) => {
    const f = req.file;
    const discard = () => { if (f) fs.unlink(f.path, () => {}); };
    if (err) { discard(); return res.status(400).json({ error: uploadError(err) }); }
    if (!f) return res.status(400).json({ error: 'Choose a photo.' });
    const real = sniff(f.path);
    if (!real || real.kind !== 'photo') { discard(); return res.status(400).json({ error: 'Use a JPG, PNG or WEBP photo.' }); }
    let filename = f.filename;
    const want = filename.replace(/\.[a-z0-9]+$/, '.' + real.ext);
    if (want !== filename) { fs.renameSync(f.path, path.join(UPLOAD_DIR, want)); filename = want; }
    const r = creatorsRouter.setPhoto(req.params.id, filename);
    if (!r) { unlinkMedia(filename); return res.status(404).json({ error: 'Not found.' }); }
    if (r.old) unlinkMedia(r.old);
    res.json({ ok: true, creator: r.creator });
  });
});

// ---- static ----------------------------------------------------------------
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

// sitemap: the two public pages, dated by when their HTML last changed
const PAGES = [['/', 'index.html', '1.0'], ['/talents', 'talents.html', '0.8']];
app.get('/sitemap.xml', (req, res) => {
  const urls = PAGES.map(([loc, file, pri]) => {
    let mod = '';
    try { mod = fs.statSync(path.join(__dirname, 'public', file)).mtime.toISOString().slice(0, 10); } catch (e) {}
    return `  <url><loc>${SITE_URL}${loc}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}<priority>${pri}</priority></url>`;
  }).join('\n');
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600')
    .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
});

// clean URLs: /talents is the real address; old .html addresses redirect to it
app.get('/talents.html', (req, res) => res.redirect(301, '/talents' + (req._parsedUrl.search || '')));
app.get(['/creators', '/creators/'], (req, res) => res.redirect(301, '/talents'));   // old Wix page
app.get('/index.html', (req, res) => res.redirect(301, '/' + (req._parsedUrl.search || '')));
app.get(['/talents', '/talents/'], (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'talents.html'));
});

// Legal pages (needed for TikTok app review)
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));

// Server code must never be downloadable, even if it's copied into public/ by mistake.
const SERVER_FILES = /\/(server|db|submissions|roster|cases|transfer-media|backup-live-media)\.js$|\/package(-lock)?\.json$|\.(env|map|log|bak)$/i;
app.use((req, res, next) => {
  if (SERVER_FILES.test(req.path)) return res.status(404).end();
  next();
});

// Favicons: served from public/ or public/favicon/, whichever has them.
// A missing icon answers a plain 404 (never the HTML page).
const ICONS = ['favicon.ico', 'favicon-32.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest'];
app.get(ICONS.map((f) => '/' + f), (req, res) => {
  const name = path.basename(req.path);
  const found = [path.join(__dirname, 'public', name), path.join(__dirname, 'public', 'favicon', name)]
    .find((p) => fs.existsSync(p));
  if (!found) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(found);
});

function sendAdmin(req, res) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
}
app.get(['/admin', '/admin.html'], sendAdmin);

// TikTok OAuth Test Page
app.get('/tiktok-oauth-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'tiktok-oauth-test.html'));
});

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',
  index: 'index.html',
  extensions: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
  },
}));

// any unmatched /api/* request should answer in JSON, not the HTML page
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Unknown pages: show the home page but with a real 404 status, so search
// engines don't index junk URLs as duplicates of the home page.
app.get('*', (req, res) => {
  res.status(404).set('X-Robots-Tag', 'noindex');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// never leak internals: log the real error, send a generic message
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That was too large.' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
  console.error('[error]', err);
  res.status(500).json({ error: 'Server error.' });
});

app.listen(PORT, () => {
  console.log(`Campus Creators running on port ${PORT}`);
  console.log(`Uploads: ${UPLOAD_DIR}`);
});
