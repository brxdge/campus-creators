// ============================================================
// Campus Ambassadors (Talents page): add / edit / delete from the admin.
//
// Stored as roster.json in the same data folder as submissions.json (on
// Railway: the /data volume). Each ambassador's photo/video lives in the
// existing media store under the placeholder name "slot-roster-<id>", so
// the ids 1–12 seeded below keep any media already uploaded for them.
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const SEED = [
  ['Maya R.', 'Lifestyle', 'UofT'], ['Devon K.', 'Fitness', 'TMU'], ['Priya S.', 'Food', 'Waterloo'],
  ['Liam O.', 'Tech', 'UBC'], ['Chloe M.', 'Fashion', 'McGill'], ['Andre P.', 'Sports', 'Western'],
  ['Sofia L.', 'Beauty', 'Queen\u2019s'], ['Noah T.', 'Film', 'Concordia'], ['Aisha B.', 'Wellness', 'York'],
  ['Ethan W.', 'Gaming', 'McMaster'], ['Zara H.', 'Art', 'SFU'], ['Marcus D.', 'Music', 'UCalgary'],
].map(([name, focus, school], i) => ({ id: i + 1, name, focus, school }));

module.exports = function roster(opts = {}) {
  const router = express.Router();
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const file = path.join(dataDir, 'roster.json');
  const requireAdmin = opts.requireAdmin;
  if (typeof requireAdmin !== 'function') throw new Error('roster: requireAdmin middleware is required');

  fs.mkdirSync(dataDir, { recursive: true });

  // Stored as { nextId, ambassadors }. nextId only ever goes up, so a
  // deleted ambassador's id (and its media slot) is never handed to someone
  // new. Older files that were a plain array are upgraded on read.
  function readStore() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(raw) ? raw : (raw.ambassadors || []);
      const maxId = list.reduce((m, a) => Math.max(m, a.id), 0);
      const nextId = Math.max(Array.isArray(raw) ? 0 : (raw.nextId || 0), maxId + 1, SEED.length + 1);
      return { nextId, ambassadors: list };
    } catch (e) {
      const store = { nextId: SEED.length + 1, ambassadors: SEED.slice() };
      writeStore(store);
      return store;
    }
  }
  function writeStore(store) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, file);
  }
  const readAll = () => readStore().ambassadors;
  function writeAll(list) {
    const store = readStore();
    store.ambassadors = list;
    writeStore(store);
  }
  function clean(body) {
    const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    return { name: s(body.name, 60), focus: s(body.focus, 40), school: s(body.school, 60) };
  }

  const json = express.json({ limit: '10kb' });

  // public — what the Talents page renders
  router.get('/api/roster', (req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ ambassadors: readAll() });
  });

  router.get('/api/admin/roster', requireAdmin, (req, res) => {
    res.json({ ambassadors: readAll() });
  });

  router.post('/api/admin/roster', requireAdmin, json, (req, res) => {
    const data = clean(req.body || {});
    if (!data.name) return res.status(400).json({ error: 'Name is required.' });
    const store = readStore();
    const entry = Object.assign({ id: store.nextId }, data);
    store.nextId += 1;
    store.ambassadors.push(entry);
    writeStore(store);
    res.json({ ok: true, ambassador: entry });
  });

  router.patch('/api/admin/roster/:id', requireAdmin, json, (req, res) => {
    const list = readAll();
    const a = list.find((x) => x.id === Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Not found.' });
    const data = clean(Object.assign({}, a, req.body || {}));
    if (!data.name) return res.status(400).json({ error: 'Name is required.' });
    Object.assign(a, data);
    writeAll(list);
    res.json({ ok: true, ambassador: a });
  });

  router.delete('/api/admin/roster/:id', requireAdmin, (req, res) => {
    const list = readAll();
    const next = list.filter((x) => x.id !== Number(req.params.id));
    if (next.length === list.length) return res.status(404).json({ error: 'Not found.' });
    writeAll(next);
    res.json({ ok: true });
  });

  return router;
};
