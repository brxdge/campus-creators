const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const store = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- config ----------------------------------------------------------------
// Set these in Railway (Variables tab). Never commit real values.
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Where uploaded files are written. On Railway point this at a mounted volume
// (e.g. /data/uploads) or uploads vanish on every redeploy.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'data', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 25);

if (!ADMIN_PASSCODE) {
  console.warn('[warn] ADMIN_PASSCODE is not set — the admin portal is disabled.');
}

app.use(express.json());
app.use(cookieParser(SESSION_SECRET));

// ---- auth ------------------------------------------------------------------
const COOKIE = 'cc_admin';

function makeToken() {
  const issued = Date.now().toString();
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(issued).digest('hex');
  return `${issued}.${sig}`;
}

function validToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [issued, sig] = token.split('.');
  if (!issued || !sig) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(issued).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const age = Date.now() - Number(issued);
  return age > 0 && age < 1000 * 60 * 60 * 12;   // 12 hour session
}

function requireAdmin(req, res, next) {
  if (!ADMIN_PASSCODE) return res.status(503).json({ error: 'Admin portal not configured.' });
  if (!validToken(req.signedCookies[COOKIE])) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSCODE) return res.status(503).json({ error: 'Admin portal not configured.' });
  const supplied = String(req.body.passcode || '');
  const a = Buffer.from(supplied.padEnd(64).slice(0, 64));
  const b = Buffer.from(ADMIN_PASSCODE.padEnd(64).slice(0, 64));
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Incorrect passcode.' });
  }
  res.cookie(COOKIE, makeToken(), {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12,
  });
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => {
  res.json({ signedIn: validToken(req.signedCookies[COOKIE]) });
});

// ---- uploads ---------------------------------------------------------------
const ALLOWED = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'];
const VIDEO_EXT = ['mp4', 'mov', 'webm'];

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

function isVideo(file) {
  if (file.mimetype && file.mimetype.startsWith('video/')) return true;
  return VIDEO_EXT.includes(extOf(file.originalname));
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
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (!typeFor(file)) {
      return cb(new Error('Only JPG, PNG, WEBP, MP4, MOV and WEBM are allowed.'));
    }
    cb(null, true);
  },
});

app.post('/api/admin/upload', requireAdmin, (req, res) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const brandId = Number(req.body.brandId);
    const brand = store.listBrands().find((b) => b.id === brandId);
    if (!brand) {
      (req.files || []).forEach((f) => fs.unlink(f.path, () => {}));
      return res.status(400).json({ error: 'Unknown brand.' });
    }

    const added = (req.files || []).map((f) => {
      return store.addMedia({
        brandId,
        kind: isVideo(f) ? 'video' : 'photo',
        filename: f.filename,
        original: f.originalname,
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
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (name.length > 60) return res.status(400).json({ error: 'That name is too long.' });
  try {
    store.addBrand(name);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not add that brand.' });
  }
});

app.delete('/api/admin/brands/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  store.listMedia(id).forEach((m) => {
    fs.unlink(path.join(UPLOAD_DIR, m.filename), () => {});
  });
  store.deleteBrand(id);
  res.json({ ok: true });
});

app.delete('/api/admin/media/:id', requireAdmin, (req, res) => {
  const item = store.getMedia(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Not found.' });
  fs.unlink(path.join(UPLOAD_DIR, item.filename), () => {});
  store.deleteMedia(item.id);
  res.json({ ok: true });
});

// ---- public ----------------------------------------------------------------
// What the live site reads to render brand photos and videos
app.get('/api/media', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ media: store.publicMediaMap(), path: '/media/' });
});

// serve uploaded files (read-only, no directory listing)
app.get('/media/:file', (req, res) => {
  const file = path.basename(req.params.file);          // strip any path traversal
  const full = path.join(UPLOAD_DIR, file);
  if (!fs.existsSync(full)) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(full);
});

// ---- contact ---------------------------------------------------------------
// TODO: wire to Resend, same pattern as brxdge. Needs RESEND_API_KEY.
app.post('/api/contact', (req, res) => {
  res.status(501).json({ error: 'Contact endpoint not wired up yet.' });
});

// ---- form submissions (Brands contact + Talents apply) ---------------------
// Stored as submissions.json next to the uploads folder, so on Railway it
// lives on the same persistent volume (e.g. /data/submissions.json).
// To also email each one via Resend later, add: onSubmit: (entry) => { ... }
const submissions = require('./submissions');
app.use(submissions({
  requireAdmin,
  dataDir: process.env.DATA_DIR || path.dirname(UPLOAD_DIR),
}));

// ---- static ----------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.set('Cache-Control', 'no-cache');
  },
}));

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// any unmatched /api/* request should answer in JSON, not the HTML page
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `No such endpoint: ${req.method} ${req.path}` });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// catch anything thrown in a route so the client gets JSON it can display
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Server error.' });
});

app.listen(PORT, () => {
  console.log(`Campus Creators running on port ${PORT}`);
  console.log(`Uploads: ${UPLOAD_DIR}`);
});