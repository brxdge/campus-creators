// ============================================================
// The Work (Brands page): case studies, managed from the admin.
// Nothing is published by default, so the section stays hidden on the
// site until at least one case study is marked Published.
//
// Stored as cases.json in the same data folder as submissions.json (on
// Railway: the /data volume). Each case's thumbnail/video lives in the
// existing media store under the placeholder name "slot-work-<id>", so
// case 1-3 pick up anything already uploaded to the old Case 01-03 slots.
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const SEED = [];

module.exports = function cases(opts = {}) {
  const router = express.Router();
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const file = path.join(dataDir, 'cases.json');
  const requireAdmin = opts.requireAdmin;
  if (typeof requireAdmin !== 'function') throw new Error('cases: requireAdmin middleware is required');

  fs.mkdirSync(dataDir, { recursive: true });

  // Stored as { nextId, items }. nextId only ever goes up, so a
  // deleted case's id (and its media slot) is never handed to someone
  // new. Older files that were a plain array are upgraded on read.
  function readStore() {
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const list = Array.isArray(raw) ? raw : (raw.items || []);
      const maxId = list.reduce((m, a) => Math.max(m, a.id), 0);
      const nextId = Math.max(Array.isArray(raw) ? 0 : (raw.nextId || 0), maxId + 1, SEED.length + 1);
      return { nextId, items: list };
    } catch (e) {
      const store = { nextId: SEED.length + 1, items: SEED.slice() };
      writeStore(store);
      return store;
    }
  }
  function writeStore(store) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
    fs.renameSync(tmp, file);
  }
  const readAll = () => readStore().items;
  function writeAll(list) {
    const store = readStore();
    store.items = list;
    writeStore(store);
  }
  function clean(body) {
    const s = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
    return {
      title: s(body.title, 80),
      flag: s(body.flag, 40) || 'Case study',
      desc: s(body.desc, 400),
      published: body.published === true || body.published === 'true',
    };
  }

  const json = express.json({ limit: '10kb' });

  // public — only published cases, what the Brands page renders
  router.get('/api/cases', (req, res) => {
    res.set('Cache-Control', 'no-cache');   // publish / unpublish shows up on the next page load
    res.json({ cases: readAll().filter((c) => c.published) });
  });

  router.get('/api/admin/cases', requireAdmin, (req, res) => {
    res.json({ cases: readAll() });
  });

  router.post('/api/admin/cases', requireAdmin, json, (req, res) => {
    const data = clean(req.body || {});
    if (!data.title) return res.status(400).json({ error: 'Title is required.' });
    const store = readStore();
    const entry = Object.assign({ id: store.nextId }, data);
    store.nextId += 1;
    store.items.push(entry);
    writeStore(store);
    res.json({ ok: true, item: entry });
  });

  router.patch('/api/admin/cases/:id', requireAdmin, json, (req, res) => {
    const list = readAll();
    const a = list.find((x) => x.id === Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Not found.' });
    const data = clean(Object.assign({}, a, req.body || {}));
    if (!data.title) return res.status(400).json({ error: 'Title is required.' });
    Object.assign(a, data);
    writeAll(list);
    res.json({ ok: true, item: a });
  });

  router.delete('/api/admin/cases/:id', requireAdmin, (req, res) => {
    const list = readAll();
    const next = list.filter((x) => x.id !== Number(req.params.id));
    if (next.length === list.length) return res.status(404).json({ error: 'Not found.' });
    writeAll(next);
    res.json({ ok: true });
  });

  return router;
};
