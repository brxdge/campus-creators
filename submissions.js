// ============================================================
// Contact form submissions: stored on the server, viewed in the admin.
//
// Drop-in Express router. Mount it in server.js (before any catch-all or
// 404 handler):
//
//   const submissions = require('./submissions');
//   app.use(submissions({ requireAdmin }));   // requireAdmin = your existing
//                                             // admin-session middleware
//
// Storage: a JSON file (submissions.json) in DATA_DIR, written atomically.
// On Railway, DATA_DIR must point at the same persistent volume as your
// uploads, or entries are wiped on redeploy.
//
// Optional: pass onSubmit(entry) to also send it on (e.g. via Resend). It
// runs after the entry is saved, and a failure there never loses the entry.
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TYPES = {
  brand: {
    required: ['firstName', 'email', 'company', 'message'],
    fields: ['firstName', 'lastName', 'email', 'phone', 'company', 'social', 'budget', 'timeline', 'message'],
  },
  talent: {
    required: ['firstName', 'lastName', 'email', 'phone', 'birthMonth', 'birthDay', 'birthYear', 'hometown', 'university', 'year', 'instagram'],
    fields: ['firstName', 'lastName', 'email', 'phone', 'birthMonth', 'birthDay', 'birthYear', 'hometown',
      'university', 'universityOther', 'year', 'organizations', 'instagram', 'tiktok', 'interests', 'referredBy'],
  },
};

module.exports = function submissions(opts = {}) {
  const router = express.Router();
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const file = path.join(dataDir, 'submissions.json');
  const onSubmit = typeof opts.onSubmit === 'function' ? opts.onSubmit : null;

  // Uses your admin middleware if given; otherwise falls back to the most
  // common session flags. Pass requireAdmin to be certain.
  const requireAdmin = typeof opts.requireAdmin === 'function' ? opts.requireAdmin : (req, res, next) => {
    const s = req.session || {};
    if (s.admin || s.isAdmin || s.signedIn || s.authenticated) return next();
    res.status(401).json({ error: 'Not signed in.' });
  };

  fs.mkdirSync(dataDir, { recursive: true });

  function readAll() {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return []; }
  }
  function writeAll(list) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2));
    fs.renameSync(tmp, file);
  }

  // small in-memory rate limit: 6 submissions per IP per 10 minutes
  const hits = new Map();
  function limited(ip) {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    list.push(now);
    hits.set(ip, list);
    return list.length > 6;
  }

  function clean(v) {
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').map((x) => x.trim().slice(0, 200)).slice(0, 30);
    if (typeof v === 'string' || typeof v === 'number') return String(v).trim().slice(0, 5000);
    return '';
  }

  const json = express.json({ limit: '50kb' });

  // ---------- public: receive a form ----------
  router.post('/api/submissions', json, async (req, res) => {
    const body = req.body || {};
    const def = TYPES[body.type];
    if (!def) return res.status(400).json({ error: 'Unknown form.' });

    // honeypot: real people never fill the hidden "website" field
    if (body.website) return res.json({ ok: true });
    if (limited(req.ip || 'unknown')) return res.status(429).json({ error: 'Too many submissions. Please try again later.' });

    const input = body.fields || {};
    const data = {};
    def.fields.forEach((k) => {
      const v = clean(input[k]);
      if (Array.isArray(v) ? v.length : v) data[k] = v;
    });
    const missing = def.required.filter((k) => !data[k]);
    if (missing.length) return res.status(400).json({ error: 'Please fill in all required fields.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return res.status(400).json({ error: 'Please enter a valid email.' });

    const entry = {
      id: crypto.randomUUID(),
      type: body.type,
      createdAt: new Date().toISOString(),
      read: false,
      data,
    };
    try {
      const list = readAll();
      list.unshift(entry);
      writeAll(list);
    } catch (err) {
      console.error('[submissions] save failed:', err);
      return res.status(500).json({ error: 'Could not save your message. Please try again.' });
    }

    if (onSubmit) Promise.resolve().then(() => onSubmit(entry)).catch((err) => console.error('[submissions] onSubmit failed:', err));
    res.json({ ok: true });
  });

  // ---------- admin ----------
  router.get('/api/admin/submissions', requireAdmin, (req, res) => {
    const list = readAll();
    const unread = { brand: 0, talent: 0 };
    list.forEach((s) => { if (!s.read && unread[s.type] !== undefined) unread[s.type]++; });
    res.json({ submissions: list, unread });
  });

  router.patch('/api/admin/submissions/:id', requireAdmin, json, (req, res) => {
    const list = readAll();
    const s = list.find((x) => x.id === req.params.id);
    if (!s) return res.status(404).json({ error: 'Not found.' });
    if (typeof (req.body || {}).read === 'boolean') s.read = req.body.read;
    writeAll(list);
    res.json({ ok: true });
  });

  router.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
    const list = readAll();
    const next = list.filter((x) => x.id !== req.params.id);
    if (next.length === list.length) return res.status(404).json({ error: 'Not found.' });
    writeAll(next);
    res.json({ ok: true });
  });

  router.get('/api/admin/submissions.csv', requireAdmin, (req, res) => {
    const type = TYPES[req.query.type] ? req.query.type : 'brand';
    const cols = ['createdAt'].concat(TYPES[type].fields);
    const esc = (v) => '"' + String(Array.isArray(v) ? v.join('; ') : (v == null ? '' : v)).replace(/"/g, '""') + '"';
    const rows = readAll().filter((s) => s.type === type)
      .map((s) => cols.map((c) => esc(c === 'createdAt' ? s.createdAt : s.data[c])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-submissions.csv"`);
    res.send([cols.join(',')].concat(rows).join('\n'));
  });

  return router;
};