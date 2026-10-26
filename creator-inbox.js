// ============================================================
// Discovered creators: the receiving end of the separate "Creator Search"
// app's "Send to my website" automation.
//
//   POST /api/creator-search              (Creator Search -> this website)
//        Needs the shared secret. Bearer token, a secret header, or an
//        HMAC-SHA256 signature of the body all work. Saves the creators
//        privately and de-duplicates by TikTok handle.
//
//   GET    /api/admin/discovered          (admin only) list what arrived
//   GET    /api/admin/discovered/count    (admin only) totals, for the sidebar badge
//   GET    /api/admin/discovered/:id/avatar  (admin only) the creator's photo
//   POST   /api/admin/discovered/seen     (admin only) mark as seen (or back to new)
//   POST   /api/admin/discovered/:id/email  (admin only) add / change / clear a creator's email
//   POST   /api/admin/discovered/contacted  (admin only) note that creators were emailed (or undo)
//   POST   /api/admin/discovered/template   (admin only) save the email message the team starts from
//   POST   /api/admin/discovered/delete   (admin only) delete several
//   DELETE /api/admin/discovered/:id      (admin only) delete one
//
// These are prospects, not ambassadors: nothing here is ever shown on the
// public site. It is stored in discovered-creators.json next to
// submissions.json (on Railway: the /data volume).
//
// Photos: TikTok profile photo links expire after a while and the site's
// security rules block images from other websites, so when a creator arrives
// with a photo link the website downloads its own private copy (only from
// TikTok's image servers, small images only) and shows that in the admin. If
// the link has already expired, the card simply shows initials. Creator Search can also
// send the picture itself, inside the delivery, as text ("picture": "data:image/jpeg;base64,..."):
// its own saved copy, which never expires. The website checks the bytes really are a small
// jpg, png or webp, and keeps its own private copy the same way. Each delivery
// also records how many picture links came with it and how many were saved,
// so the admin can say why pictures are missing instead of leaving it a mystery.
//
// Emails: an address is taken from what Creator Search sends (email, contact
// email ...), else from the creator's bio text, else one the team types in.
// The admin shows a ready-made, editable message and its Send button emails the
// creator from the website (through Resend, see mailer.js and the OUTREACH_*
// variables). Only a person pressing Send ever sends anything: the website
// never emails a creator by itself. Each send is recorded on the creator, and
// there is a cap per 24 hours. Without RESEND_API_KEY the Send button is off.
//   POST   /api/admin/discovered/:id/send   (admin only) email one creator { subject, message }
//
// Setup: set CREATOR_SEARCH_SECRET in Railway Variables (32+ random
// characters) and put the same value in Creator Search. Until it is set the
// receiver answers 503 and stores nothing.
//
// The exact payload Creator Search sends is read tolerantly: a list of
// creators under creators / items / profiles / records / results / data (or
// a bare list, or one creator), with the usual field names (handle,
// nickname, bio, followers ...) or the CSV column names (Handle, TikTok link,
// Bio link, On TikTok since ...). Anything unrecognised is ignored.
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RECEIVE_PATH = '/api/creator-search';
const HANDLE_RE = /^[A-Za-z0-9._]{1,40}$/;
// a YouTube channel: its @name may also hold hyphens and be longer; its id is always UC + 22 characters
const YT_HANDLE_RE = /^[A-Za-z0-9._-]{1,100}$/;
const YT_CHANNEL_ID_RE = /^UC[\w-]{22}$/;
const YT_URL_RE = /^https:\/\/(?:www\.)?youtube\.com\/(?:channel\/UC[\w-]{22}|@[A-Za-z0-9._-]{1,100})\/?$/i;
const RESERVED = /^(__proto__|constructor|prototype|hasownproperty|tostring|valueof)$/i;
const MAX_BODY = '16mb';                              // a delivery can carry the creators' pictures as text, so this is larger than the list alone needs
const MAX_AVATAR = 1.5 * 1024 * 1024;                 // bytes
const AVATAR_TIMEOUT_MS = 7000;
const AVATAR_PARALLEL = 4;
// only TikTok's own image servers are ever fetched
const AVATAR_HOSTS = /(^|\.)(tiktokcdn(-us|-eu)?\.com|ibyteimg\.com|byteimg\.com|tiktokv\.(com|us|eu))$/i;
const MAX_PER_REQUEST = 500;
const MAX_STORED = 5000;
const MAX_COLLECTIONS = 20;
const MIN_SECRET = 16;
const FAIL_WINDOW = 15 * 60 * 1000;
const FAIL_LIMIT = 10;

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const isEmpty = (v) => v == null || v === '' || (typeof v === 'string' && !v.trim());

// ---------- email addresses ----------
const EMAIL_PART = '[A-Za-z0-9][A-Za-z0-9._%+\\-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9\\-]{0,62}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9\\-]{0,62}[A-Za-z0-9])?)*\\.[A-Za-z]{2,24}';
const EMAIL_FIND = new RegExp(EMAIL_PART, 'g');
const EMAIL_ONLY = new RegExp('^' + EMAIL_PART + '$');
const NOT_EMAIL_TLD = /\.(png|jpe?g|gif|webp|svg|mp4|mov|css|js)$/i;       // "icon@2x.png" and friends
function cleanEmail(v) {
  let s = String(v == null ? '' : v).trim().replace(/^mailto:/i, '').replace(/\?.*$/, '').trim().toLowerCase();
  if (!s || s.length > 120 || !EMAIL_ONLY.test(s) || NOT_EMAIL_TLD.test(s) || /\.\./.test(s)) return '';
  return s;
}
// the first address written in a piece of text (a bio), or ''
function findEmail(t) {
  const m = String(t || '').match(EMAIL_FIND) || [];
  for (const x of m) { const e = cleanEmail(x); if (e) return e; }
  return '';
}

// ---------- cleaning ----------
function text(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}
const oneLine = (v, max) => text(v, max * 2).replace(/\s+/g, ' ').slice(0, max);
function bioText(v) {
  return text(v, 600).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
function count(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined;
  if (typeof v !== 'string') return undefined;
  const m = /^([0-9][0-9,]*\.?[0-9]*|\.[0-9]+)\s*([kmb])?$/i.exec(v.trim());
  if (!m) return undefined;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  const n = Number(m[1].replace(/,/g, '')) * mult;
  return Number.isFinite(n) ? Math.round(n) : undefined;
}
function bool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(s)) return true;
    if (['false', 'no', 'n', '0'].includes(s)) return false;
  }
  return undefined;
}
function webLink(v) {
  let href = '', label = '';
  if (v && typeof v === 'object' && !Array.isArray(v)) { href = v.href || v.url || v.link || ''; label = v.text || v.label || ''; }
  else href = v;
  const s = oneLine(href, 300);
  if (!s || /\s/.test(s)) return undefined;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : 'https://' + s);
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.')) return undefined;
    return { href: u.href.slice(0, 400), text: oneLine(label || s, 120) };
  } catch (e) { return undefined; }
}
function dateOnly(v) {
  if (isEmpty(v)) return undefined;
  let ms;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v).trim())) {
    const n = Number(v);
    ms = n < 1e11 ? n * 1000 : n;                     // seconds or milliseconds
  } else ms = Date.parse(String(v));
  if (!Number.isFinite(ms) || ms < 1.2e12 || ms > Date.now() + 366 * 864e5) return undefined;
  return new Date(ms).toISOString().slice(0, 10);
}
function collectionNames(v) {
  const out = [];
  const add = (x) => {
    if (x && typeof x === 'object') x = x.name || x.title || x.label;
    const s = oneLine(x, 60);
    if (s && !out.includes(s)) out.push(s);
  };
  if (Array.isArray(v)) v.forEach(add); else add(v);
  return out;
}

function imageUrl(v) {
  if (v && typeof v === 'object') v = Array.isArray(v) ? v[0] : (v.url || v.href || (Array.isArray(v.urlList) && v.urlList[0]));
  const s = oneLine(v, 900);
  if (!/^https?:\/\//i.test(s) || /\s/.test(s)) return undefined;     // which hosts are fetched is decided later, and only https to TikTok by default
  try { return new URL(s).href; } catch (e) { return undefined; }
}
// host + path, without the changing signature, to tell "same photo" from "new photo"
function photoKey(href) { try { const u = new URL(href); return u.host + u.pathname; } catch (e) { return ''; } }
// A picture sent inside the delivery as text: "data:image/jpeg;base64,...". Returns the bytes, or undefined if it is anything else
// or too big. (The bytes are checked again, by sniffImage, when the copy is saved.)
function imageData(v) {
  if (typeof v !== 'string' || v.length > Math.ceil(MAX_AVATAR / 3) * 4 + 64) return undefined;
  const m = /^data:image\/(?:jpe?g|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(v.trim());
  if (!m) return undefined;
  const buf = Buffer.from(m[1], 'base64');
  return buf.length > 12 && buf.length <= MAX_AVATAR ? buf : undefined;
}
const dataKey = (buf) => 'sent:' + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);     // tells "same picture" from "new picture" without a link
function sniffImage(b) {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// ---------- reading what Creator Search sent ----------
const LIST_KEYS = ['creators', 'items', 'profiles', 'records', 'results', 'rows', 'data', 'saved', 'shortlist', 'list'];
const GROUP_KEYS = ['collections', 'lists'];
const COLLECTION_KEYS = ['collection', 'collectionname', 'listname', 'list', 'collections', 'lists', 'savedlist', 'group', 'campaign'];

function keyed(obj) {
  const m = new Map();
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return m;
  for (const k of Object.keys(obj)) { const nk = norm(k); if (!m.has(nk) || isEmpty(m.get(nk))) m.set(nk, obj[k]); }
  return m;
}
function pick(m, aliases) {
  for (const a of aliases) { const v = m.get(a); if (!isEmpty(v)) return v; }
  return undefined;
}

// -> [{ raw, collection: [names] }]
function extract(body, inherited, depth) {
  inherited = inherited || [];
  depth = depth || 0;
  if (depth > 3) return [];
  if (Array.isArray(body)) return body.filter((x) => x && typeof x === 'object' && !Array.isArray(x)).map((raw) => ({ raw, collection: inherited }));
  if (!body || typeof body !== 'object') return [];
  const m = keyed(body);
  const names = collectionNames(pick(m, COLLECTION_KEYS.filter((k) => !Array.isArray(m.get(k)) || m.get(k).every((x) => typeof x === 'string'))));
  const here = names.length ? names : inherited;
  // { collections: [ { name, creators: [...] }, ... ] }
  for (const g of GROUP_KEYS) {
    const v = m.get(g);
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      const nested = [];
      for (const grp of v) {
        const gm = keyed(grp);
        const inner = LIST_KEYS.map((k) => gm.get(k)).find(Array.isArray);
        if (!inner) continue;
        const gname = collectionNames(pick(gm, ['name', 'title', 'label', 'collection']));
        nested.push(...extract(inner, gname.length ? gname : here, depth + 1));
      }
      if (nested.length) return nested;
    }
  }
  for (const k of LIST_KEYS) {
    const v = m.get(k);
    if (Array.isArray(v) && v.every((x) => x && typeof x === 'object')) return extract(v, here, depth + 1);
  }
  for (const k of LIST_KEYS) {
    const v = m.get(k);
    if (v && typeof v === 'object' && !Array.isArray(v)) { const r = extract(v, here, depth + 1); if (r.length) return r; }
  }
  // a single creator
  return looksLikeCreator(m) ? [{ raw: body, collection: here }] : [];
}
function looksLikeCreator(m) {
  return ['handle', 'username', 'uniqueid', 'tiktoklink', 'tiktokurl', 'profileurl', 'channelid'].some((k) => !isEmpty(m.get(k)));
}

function normalise(raw, fallbackCollection) {
  const m = keyed(raw);
  for (const sub of ['profile', 'creator', 'user']) {
    const inner = keyed(m.get(sub));
    for (const [k, v] of inner) if (!m.has(k) || isEmpty(m.get(k))) m.set(k, v);
  }
  // a YouTube channel (Creator Search says platform "youtube" and sends the channel id); everything else is a TikTok creator, as before
  const channelId = oneLine(pick(m, ['channelid']), 40);
  const sentUrl = String(pick(m, ['url', 'link', 'profileurl']) || '').trim();
  const isYt = String(pick(m, ['platform', 'network']) || '').toLowerCase() === 'youtube' || YT_CHANNEL_ID_RE.test(channelId) || YT_URL_RE.test(sentUrl);
  if (isYt) return normaliseYt(m, { channelId, sentUrl }, fallbackCollection);
  let handle = oneLine(pick(m, ['handle', 'username', 'uniqueid', 'tiktokhandle', 'tiktokusername', 'user']), 60).replace(/^@/, '');
  if (!HANDLE_RE.test(handle)) {
    handle = '';
    const link = String(pick(m, ['tiktoklink', 'tiktokurl', 'profileurl', 'profilelink', 'url', 'link']) || '');
    const hit = /tiktok\.com\/@([A-Za-z0-9._]{1,40})/i.exec(link);
    if (hit) handle = hit[1];
  }
  if (!HANDLE_RE.test(handle)) {
    const nm = oneLine(pick(m, ['name']), 60).replace(/^@/, '');
    handle = HANDLE_RE.test(nm) ? nm : '';
  }
  if (!handle || RESERVED.test(handle)) return null;
  return details(m, { handle }, fallbackCollection);
}
// a YouTube channel in the same shape. handle is the channel's @name (without the @) or, when it has none or an unusual one, its id.
function normaliseYt(m, { channelId, sentUrl }, fallbackCollection) {
  let handle = oneLine(pick(m, ['handle', 'username', 'uniqueid', 'user']), 100).replace(/^@/, '');
  if (!YT_HANDLE_RE.test(handle)) handle = YT_CHANNEL_ID_RE.test(channelId) ? channelId : '';
  if (!handle || RESERVED.test(handle)) return null;
  const out = { handle, platform: 'youtube' };
  if (YT_CHANNEL_ID_RE.test(channelId)) out.channelId = channelId;
  out.url = YT_URL_RE.test(sentUrl) ? sentUrl : out.channelId ? 'https://www.youtube.com/channel/' + out.channelId : 'https://www.youtube.com/@' + handle;
  const country = String(pick(m, ['country', 'countrycode']) || '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(country)) out.country = country;
  return details(m, out, fallbackCollection);
}
// the details both kinds share (name, bio, numbers, picture, collections); `out` already holds who it is
function details(m, out, fallbackCollection) {
  const handle = out.handle;
  const nick = oneLine(pick(m, ['nickname', 'displayname', 'fullname', 'creatorname', 'name']), 80);
  out.nickname = nick || handle;
  const bio = pick(m, ['bio', 'signature', 'description', 'about', 'biography']);
  if (bio !== undefined) out.bio = bioText(bio);
  const link = webLink(pick(m, ['biolink', 'biourl', 'website', 'externallink']));
  if (link) out.bioLink = link;
  for (const [field, aliases] of [
    ['followers', ['followers', 'followercount', 'followerscount', 'fans', 'fancount', 'subscribers']],
    ['following', ['following', 'followingcount']],
    ['videos', ['videos', 'videocount', 'video', 'posts']],
    ['likes', ['likes', 'likecount', 'heart', 'hearts', 'totallikes']],
  ]) { const n = count(pick(m, aliases)); if (n !== undefined) out[field] = n; }
  for (const [field, aliases] of [
    ['verified', ['verified', 'isverified']],
    ['business', ['business', 'isbusiness', 'commerceuser']],
    ['private', ['private', 'isprivate', 'privateaccount']],
    ['seller', ['seller', 'ttseller', 'isseller']],
  ]) { const b = bool(pick(m, aliases)); if (b !== undefined) out[field] = b; }
  const cat = pick(m, ['businesscategory', 'category']);
  if (cat !== undefined) out.businessCategory = oneLine(cat, 60);
  const since = dateOnly(pick(m, ['ontiktoksince', 'since', 'createdat', 'createtime', 'joined']));
  if (since) out.tiktokSince = since;
  const mail = cleanEmail(pick(m, ['email', 'emailaddress', 'contactemail', 'businessemail', 'bioemail', 'publicemail', 'publicemailaddress']));
  if (mail) out.emailSent = mail;
  const rawPhoto = pick(m, ['avatar', 'avatarurl', 'avatarlarger', 'avatarmedium', 'avatarthumb', 'originalavatarurl',
    'profilepicture', 'profileimage', 'profilepic', 'picture', 'photo', 'image']);
  const photo = imageUrl(rawPhoto);
  if (photo) out.avatarSrc = photo;                    // used once to download a copy, never stored
  else { const data = imageData(rawPhoto); if (data) out.avatarData = data; }      // a picture sent inside the delivery: saved once, never stored in the list
  const own = collectionNames(pick(m, COLLECTION_KEYS));
  out.collections = own.length ? own : fallbackCollection;
  return out;
}

// ---------- the message the team starts from when emailing a creator ----------
// {name} becomes the creator's first name and {handle} their TikTok handle; the
// admin fills these in and the team edits the draft before anything is sent.
const DEFAULT_TEMPLATE = {
  subject: 'Collab with Campus Creators?',
  body: [
    'Hi {name},',
    '',
    'I came across your TikTok (@{handle}) and really like your content.',
    '',
    'I\u2019m with Campus Creators, a Toronto agency that connects brands with student and campus creators for content and campaigns. We\u2019re lining up new creators for upcoming brand work and I\u2019d love to tell you a bit more.',
    '',
    'Would you be open to a quick chat, or a reply here?',
    '',
    'Thanks,',
    'Campus Creators',
    'https://campuscreators.ca',
    '',
    'If you\u2019d rather not hear from us, just reply \u201cno thanks\u201d and we won\u2019t email you again.',
  ].join('\n'),
};
function templateText(v, max) {
  return String(v == null ? '' : v).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max).trim();
}

// ---------- the module ----------
module.exports = function creatorInbox(opts = {}) {
  const dataDir = opts.dataDir || process.env.DATA_DIR || path.join(__dirname, 'data');
  const requireAdmin = opts.requireAdmin;
  if (typeof requireAdmin !== 'function') throw new Error('creator-inbox: requireAdmin middleware is required');
  const getSecret = typeof opts.secret === 'function' ? opts.secret : () => opts.secret || process.env.CREATOR_SEARCH_SECRET || '';
  const file = path.join(dataDir, 'discovered-creators.json');
  const avatarDir = path.resolve(dataDir, 'discovered-avatars');
  fs.mkdirSync(dataDir, { recursive: true });
  // tests can swap these; in production only https links to TikTok's image servers are fetched
  const photoAllowed = typeof opts.photoAllowed === 'function' ? opts.photoAllowed : (u) => u.protocol === 'https:' && AVATAR_HOSTS.test(u.hostname);
  // sending email to creators: opts.mail is the object mailer.js makes; without it the Send button is off
  const mail = opts.mail && typeof opts.mail.sendOutreach === 'function' ? opts.mail : null;
  const canSend = !!(mail && mail.outreach && mail.outreach.enabled);
  const PER_DAY = Math.max(1, Number(opts.perDay || process.env.OUTREACH_PER_DAY) || 40);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const sendingNow = new Set();                          // creator ids being emailed right now (stops a double click sending twice)
  const sentRecently = (settings) => (Array.isArray(settings.sendLog) ? settings.sendLog : []).filter((t) => Date.now() - Date.parse(t) < DAY_MS);

  // { nextId, items: [...], deliveries: [last 20] }. nextId only goes up.
  function read() {
    try {
      const s = JSON.parse(fs.readFileSync(file, 'utf8'));
      const items = Array.isArray(s.items) ? s.items : [];
      const maxId = items.reduce((mx, i) => Math.max(mx, Number(i.id) || 0), 0);
      return { nextId: Math.max(s.nextId || 1, maxId + 1), items, deliveries: Array.isArray(s.deliveries) ? s.deliveries : [], settings: s.settings && typeof s.settings === 'object' ? s.settings : {} };
    } catch (e) { return { nextId: 1, items: [], deliveries: [], settings: {} }; }
  }
  function write(s) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, file);
  }

  // ---------- profile photos ----------
  const queue = [];
  const queued = new Set();
  let active = 0;
  const unlinkPhoto = (name) => { if (name && /^\d+\.(jpg|png|webp)$/.test(name)) fs.unlink(path.join(avatarDir, name), () => {}); };

  // what happened to one picture, recorded on its creator and on the delivery it came with
  function photoResult(job, savedName, reason) {
    const st = read();
    const it = st.items.find((i) => i.id === job.id);
    const d = st.deliveries.find((x) => x.at === job.at);
    if (d) {
      if (savedName) d.photosSaved = (d.photosSaved || 0) + 1;
      else { d.photosFailed = (d.photosFailed || 0) + 1; if (!d.photoError) d.photoError = reason; }
    }
    if (it) {
      if (savedName) {
        if (it.avatarFile && it.avatarFile !== savedName) unlinkPhoto(it.avatarFile);
        it.avatarFile = savedName; it.avatarKey = job.key || photoKey(job.src); it.avatarAt = Date.now(); delete it.photoError;
      } else it.photoError = reason;
    } else if (savedName) unlinkPhoto(savedName);                // the creator was deleted meanwhile
    if (it || d) write(st);
  }

  // a picture that came inside the delivery: nothing to download, only to check and keep
  function savePhotoData(job) {
    try {
      const ext = sniffImage(job.data);                           // the bytes decide, not what the text said
      if (!ext) return photoResult(job, null, 'what was sent as a picture was not a picture');
      fs.mkdirSync(avatarDir, { recursive: true });
      const name = job.id + '.' + ext;
      fs.writeFileSync(path.join(avatarDir, name + '.tmp'), job.data);
      fs.renameSync(path.join(avatarDir, name + '.tmp'), path.join(avatarDir, name));
      photoResult(job, name, '');
    } catch (e) { photoResult(job, null, 'the website could not save the picture'); }
  }

  async function fetchPhoto(job) {
    if (job.data) return savePhotoData(job);
    if (typeof fetch !== 'function') return photoResult(job, null, 'this server cannot download pictures');
    let u;
    try { u = new URL(job.src); } catch (e) { return photoResult(job, null, 'the picture link is not a web address'); }
    if (!photoAllowed(u)) return photoResult(job, null, 'picture links from ' + u.hostname + ' are not allowed');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.photoTimeoutMs || AVATAR_TIMEOUT_MS);
    let reason = 'the download failed';
    try {
      let r = null;
      for (let hop = 0; hop <= 3; hop++) {                       // follow a few redirects, but only to allowed image servers
        r = await fetch(u.href, { signal: ctrl.signal, redirect: 'manual', headers: { Accept: 'image/*', 'User-Agent': 'Mozilla/5.0 (compatible; CampusCreatorsAdmin)' } });
        const loc = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
        if (!loc) break;
        let next;
        try { next = new URL(loc, u); } catch (e) { r = null; break; }
        if (!photoAllowed(next)) { reason = 'the picture link redirected to ' + next.hostname + ', which is not allowed'; r = null; break; }
        u = next;
        r = null;
      }
      if (!r) return photoResult(job, null, reason);
      if (!r.ok || !r.body) return photoResult(job, null, r.status === 403 || r.status === 410 ? 'the picture link had expired (HTTP ' + r.status + ')' : 'HTTP ' + r.status);
      if (Number(r.headers.get('content-length')) > MAX_AVATAR) return photoResult(job, null, 'the picture was too large');
      const chunks = [];
      let size = 0;
      for await (const c of r.body) {
        size += c.length;
        if (size > MAX_AVATAR) { ctrl.abort(); return photoResult(job, null, 'the picture was too large'); }
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);
      const ext = sniffImage(buf);                              // the bytes decide, not the link or the headers
      if (!ext) return photoResult(job, null, 'the link was not a picture');
      fs.mkdirSync(avatarDir, { recursive: true });
      const name = job.id + '.' + ext;
      fs.writeFileSync(path.join(avatarDir, name + '.tmp'), buf);
      fs.renameSync(path.join(avatarDir, name + '.tmp'), path.join(avatarDir, name));
      photoResult(job, name, '');
    } catch (e) {
      photoResult(job, null, e && e.name === 'AbortError' ? 'the download timed out' : 'the download failed');
    } finally { clearTimeout(timer); }
  }
  function pump() {
    while (active < AVATAR_PARALLEL && queue.length) {
      const job = queue.shift();
      active += 1;
      fetchPhoto(job).catch(() => {}).then(() => { active -= 1; queued.delete(job.id); pump(); });
    }
  }
  function enqueuePhotos(jobs) {
    for (const j of jobs) if (!queued.has(j.id)) { queued.add(j.id); queue.push(j); }
    pump();
  }

  // one creator as the admin sees it: the private photo file name and the raw email
  // fields are folded into plain `avatar`, `email` and `emailSource`
  function view(i) {
    const o = Object.assign({}, i, { avatar: !!i.avatarFile, avatarAt: i.avatarAt || 0 });
    delete o.avatarFile; delete o.avatarKey;
    const fromBio = findEmail(i.bio);
    o.email = i.emailManual || i.emailSent || fromBio || '';
    o.emailSource = i.emailManual ? 'added' : i.emailSent ? 'sent' : fromBio ? 'bio' : '';
    delete o.emailManual; delete o.emailSent;
    o.contactedAt = i.contactedAt || '';
    o.contactedCount = i.contactedCount || 0;
    return o;
  }
  function currentTemplate(settings) {
    const t = settings && settings.emailTemplate;
    return t && (t.subject || t.body)
      ? { subject: t.subject || '', body: t.body || '', custom: true }
      : { subject: DEFAULT_TEMPLATE.subject, body: DEFAULT_TEMPLATE.body, custom: false };
  }

  // ===== receiver (public address, protected by the secret) =====
  const receiver = express.Router();
  const fails = new Map();                                // ip -> [timestamps]
  const recent = (ip) => {
    const now = Date.now();
    const list = (fails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW);
    if (list.length) fails.set(ip, list); else fails.delete(ip);
    return list;
  };
  const failed = (ip) => { const l = recent(ip); l.push(Date.now()); fails.set(ip, l); };
  const sweep = setInterval(() => { for (const ip of [...fails.keys()]) recent(ip); }, 60 * 1000);
  if (sweep.unref) sweep.unref();

  const AUTH_HEADERS = ['authorization', 'x-webhook-secret', 'x-api-key', 'x-creator-search-secret', 'x-secret',
    'x-signature', 'x-hub-signature-256', 'x-webhook-signature', 'x-creator-search-signature'];

  function authorised(req, raw, secret) {
    const auth = (req.get('authorization') || '').trim();
    const bearer = /^(?:Bearer|Token)\s+(.+)$/i.exec(auth);
    if (auth && safeEq(bearer ? bearer[1].trim() : auth, secret)) return true;
    for (const n of ['x-webhook-secret', 'x-api-key', 'x-creator-search-secret', 'x-secret']) {
      const v = req.get(n);
      if (v && safeEq(v.trim(), secret)) return true;
    }
    const hex = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const b64 = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    for (const n of ['x-signature', 'x-hub-signature-256', 'x-webhook-signature', 'x-creator-search-signature']) {
      const v = (req.get(n) || '').trim().replace(/^sha256=/i, '');
      if (!v) continue;
      if (safeEq(v.toLowerCase(), hex) || safeEq(v, b64)) return true;
    }
    return false;
  }

  receiver.all(RECEIVE_PATH, (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.set('Allow', 'POST'); return res.status(405).json({ error: 'Send creators with POST.' }); }
    const secret = getSecret();
    if (!secret) return res.status(503).json({ error: 'Not set up yet. Add CREATOR_SEARCH_SECRET in the website’s Variables.' });
    if (secret.length < MIN_SECRET) return res.status(503).json({ error: `CREATOR_SEARCH_SECRET is too short. Use at least ${MIN_SECRET} characters.` });
    if (recent(req.ip).length >= FAIL_LIMIT) { res.set('Retry-After', '900'); return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' }); }
    // no credentials at all: refuse before reading the body
    if (!AUTH_HEADERS.some((h) => req.get(h))) { failed(req.ip); return res.status(401).json({ error: 'Missing secret. Send it as a Bearer token.' }); }
    next();
  }, express.raw({ type: () => true, limit: MAX_BODY }), (req, res) => {
    const secret = getSecret();
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!authorised(req, raw, secret)) { failed(req.ip); return res.status(401).json({ error: 'Secret did not match.' }); }

    let body;
    try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch (e) { return res.status(400).json({ error: 'The body must be JSON.' }); }   // an empty body counts as a ping
    if (body === null || typeof body !== 'object') return res.status(400).json({ error: 'The body must be JSON with a list of creators.' });

    const bm = keyed(Array.isArray(body) ? null : body);
    const isTest = bool(bm.get('test')) === true || ['test', 'ping'].includes(String(bm.get('event') || bm.get('type') || '').toLowerCase());
    const found = extract(body);
    const topNames = collectionNames(pick(bm, COLLECTION_KEYS.filter((k) => typeof bm.get(k) === 'string')));
    const picked = found.slice(0, MAX_PER_REQUEST);
    const people = [];
    let skipped = Math.max(0, found.length - picked.length);
    for (const f of picked) {
      const n = normalise(f.raw, f.collection);
      if (n) people.push(n); else skipped += 1;
    }

    const now = new Date().toISOString();
    const store = read();
    let added = 0, updated = 0, full = 0;
    const photoJobs = [];
    if (!isTest) {
      const keyOf = (i) => (i.platform === 'youtube' ? 'yt:' + String(i.channelId || i.handle).toLowerCase() : String(i.handle).toLowerCase());     // a YouTube channel and a TikTok creator with the same name are two people
      const byHandle = new Map(store.items.map((i) => [keyOf(i), i]));
      for (const n of people) {
        const key = keyOf(n);
        const ex = byHandle.get(key);
        const photoNow = n.avatarSrc ? { src: n.avatarSrc, key: photoKey(n.avatarSrc) } : n.avatarData ? { data: n.avatarData, key: dataKey(n.avatarData) } : null;
        delete n.avatarSrc; delete n.avatarData;
        if (ex) {
          for (const k of ['nickname', 'bio', 'bioLink', 'followers', 'following', 'videos', 'likes', 'verified',
            'business', 'private', 'seller', 'businessCategory', 'tiktokSince', 'emailSent', 'country']) if (n[k] !== undefined) ex[k] = n[k];
          ex.collections = (ex.collections || []).concat(n.collections.filter((c) => !(ex.collections || []).includes(c))).slice(0, MAX_COLLECTIONS);
          ex.updatedAt = now;
          ex.deliveries = (ex.deliveries || 1) + 1;
          if (photoNow && (ex.avatarKey !== photoNow.key || !ex.avatarFile)) photoJobs.push(Object.assign({ id: ex.id, at: now }, photoNow));
          updated += 1;
        } else if (store.items.length >= MAX_STORED) {
          full += 1;
        } else {
          const item = Object.assign({
            id: store.nextId, url: n.platform === 'youtube' ? n.url : 'https://www.tiktok.com/@' + n.handle,
            bio: '', bioLink: null, followers: null, following: null, videos: null, likes: null,
            verified: false, business: false, private: false, seller: false, businessCategory: '', tiktokSince: '',
          }, n, { collections: n.collections.slice(0, MAX_COLLECTIONS), receivedAt: now, updatedAt: now, deliveries: 1, seen: false });
          store.nextId += 1;
          store.items.push(item);
          byHandle.set(key, item);
          if (photoNow) photoJobs.push(Object.assign({ id: item.id, at: now }, photoNow));
          added += 1;
        }
      }
    }
    const collection = topNames[0] || (people[0] && people[0].collections[0]) || '';
    store.deliveries.unshift({ at: now, test: isTest, received: people.length, added, updated, skipped: skipped + full, collection,
      photoLinks: photoJobs.length, photosSaved: 0, photosFailed: 0, withEmail: people.filter((n) => n.emailSent).length });
    store.deliveries = store.deliveries.slice(0, 20);
    try { write(store); } catch (e) { console.error('[creator-inbox] could not save:', e.message); return res.status(500).json({ error: 'The website could not save the creators.' }); }

    enqueuePhotos(photoJobs);                                     // after saving; never delays the reply

    if (full) return res.status(507).json({ ok: false, error: 'The inbox is full (' + MAX_STORED + '). Delete some creators in the admin, then send again.', received: people.length, added, updated });
    res.json({ ok: true, test: isTest || undefined, received: people.length, added, updated, skipped: skipped || undefined, collection: collection || undefined });
  }, (err, req, res, next) => {                                // eslint-disable-line no-unused-vars
    if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That is too much at once. Send fewer creators per request.' });
    if (err && err.status && err.status < 500) return res.status(err.status).json({ error: 'Request not understood.' });
    console.error('[creator-inbox]', err && err.message);
    res.status(500).json({ error: 'Something went wrong on the website.' });
  });

  // ===== admin (behind the admin login) =====
  const admin = express.Router();
  const json = express.json({ limit: '50kb' });
  const ids = (body) => (Array.isArray(body && body.ids) ? body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

  admin.get('/api/admin/discovered', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const s = read();
    const items = s.items.slice().sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : a.receivedAt > b.receivedAt ? -1 : b.id - a.id));
    const counts = new Map();
    for (const i of items) for (const c of (i.collections || [])) counts.set(c, (counts.get(c) || 0) + 1);
    const secret = getSecret();
    res.json({
      items: items.map(view),
      total: items.length,
      unseen: items.filter((i) => !i.seen).length,
      collections: [...counts].map(([name, n]) => ({ name, count: n })).sort((a, b) => a.name.localeCompare(b.name)),
      deliveries: s.deliveries,
      emailTemplate: currentTemplate(s.settings),
      receiver: { path: RECEIVE_PATH, ready: secret.length >= MIN_SECRET, shortSecret: !!secret && secret.length < MIN_SECRET },
      mail: {
        canSend,
        from: canSend ? mail.outreach.from : '',
        replyTo: canSend ? mail.outreach.replyTo : '',
        hasAddress: !!(canSend && mail.outreach.hasAddress),
        perDay: PER_DAY,
        sentToday: sentRecently(s.settings).length,
      },
    });
  });

  // small, for the sidebar badge
  admin.get('/api/admin/discovered/count', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const items = read().items;
    res.json({ total: items.length, unseen: items.filter((i) => !i.seen).length });
  });

  // the private copy of a creator's photo (signed-in admins only)
  admin.get('/api/admin/discovered/:id/avatar', requireAdmin, (req, res) => {
    const it = read().items.find((i) => i.id === Number(req.params.id));
    if (!it || !/^\d+\.(jpg|png|webp)$/.test(it.avatarFile || '')) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(path.join(avatarDir, it.avatarFile), (err) => { if (err && !res.headersSent) res.status(404).end(); });
  });

  admin.post('/api/admin/discovered/seen', requireAdmin, json, (req, res) => {
    const s = read();
    const all = req.body && req.body.all === true;
    const want = new Set(ids(req.body));
    const val = !(req.body && req.body.seen === false);          // { seen: false } puts them back as new
    let n = 0;
    for (const i of s.items) if ((all || want.has(i.id)) && !!i.seen !== val) { i.seen = val; n += 1; }
    if (n) write(s);
    res.json({ ok: true, changed: n, unseen: s.items.filter((i) => !i.seen).length });
  });

  admin.post('/api/admin/discovered/delete', requireAdmin, json, (req, res) => {
    const want = new Set(ids(req.body));
    if (!want.size) return res.status(400).json({ error: 'Choose at least one creator.' });
    const s = read();
    const keep = s.items.filter((i) => !want.has(i.id));
    const removed = s.items.length - keep.length;
    if (removed) { s.items.filter((i) => want.has(i.id)).forEach((i) => unlinkPhoto(i.avatarFile)); s.items = keep; write(s); }
    res.json({ ok: true, removed, unseen: keep.filter((i) => !i.seen).length });
  });

  // add, change or clear the address for one creator (typed in by the team)
  admin.post('/api/admin/discovered/:id/email', requireAdmin, json, (req, res) => {
    const id = Number(req.params.id);
    const s = read();
    const it = s.items.find((i) => i.id === id);
    if (!it) return res.status(404).json({ error: 'Not found.' });
    const raw = String((req.body && req.body.email) || '').trim();
    if (!raw) delete it.emailManual;
    else {
      const e = cleanEmail(raw);
      if (!e) return res.status(400).json({ error: 'That doesn’t look like an email address.' });
      it.emailManual = e;
    }
    write(s);
    res.json({ ok: true, item: view(it) });
  });

  // email one creator from the website. Recorded as emailed only after the email service accepted it.
  admin.post('/api/admin/discovered/:id/send', requireAdmin, json, async (req, res) => {
    const id = Number(req.params.id);
    if (!canSend) return res.status(503).json({ error: 'Sending isn’t set up yet. Add RESEND_API_KEY in Railway → Variables.' });
    const first = read();
    const found = first.items.find((i) => i.id === id);
    if (!found) return res.status(404).json({ error: 'Not found.' });
    const to = view(found).email;
    if (!to) return res.status(400).json({ error: 'This creator has no email address yet.' });
    const subject = templateText(req.body && req.body.subject, 200).replace(/\n+/g, ' ');
    const text = templateText(req.body && req.body.message, 5000);
    if (!subject) return res.status(400).json({ error: 'The subject is empty.' });
    if (!text) return res.status(400).json({ error: 'The message is empty.' });
    if (/\{[a-z ]{1,20}\}/i.test(subject + ' ' + text)) return res.status(400).json({ error: 'There’s still a {placeholder} in the message. Replace it before you send.' });
    if (sentRecently(first.settings).length >= PER_DAY) return res.status(429).json({ error: 'That’s the limit of ' + PER_DAY + ' emails to creators in 24 hours. Try again later.' });
    if (sendingNow.has(id)) return res.status(409).json({ error: 'That email is already being sent.' });
    sendingNow.add(id);
    try {
      await mail.sendOutreach({ to, subject, text });
    } catch (err) {
      console.error('[creators] email to creator ' + id + ' failed:', err && err.message ? err.message : err);
      const why = err && err.name === 'AbortError'
        ? 'The email service didn’t answer in time. It may still have gone out, so check Resend → Emails before trying again.'
        : err && err.status ? 'The email service refused it' + (err.detail ? ': ' + err.detail : ' (error ' + err.status + ').') + ' Nothing was marked as emailed.'
        : 'Couldn’t reach the email service. Nothing was sent. Try again in a moment.';
      return res.status(502).json({ error: why });
    } finally { sendingNow.delete(id); }
    const s = read();                                    // read again: the file may have changed while we waited
    const now = new Date().toISOString();
    const it = s.items.find((i) => i.id === id);
    if (it) { it.contactedAt = now; it.contactedCount = (it.contactedCount || 0) + 1; it.seen = true; }
    const log = sentRecently(s.settings);
    log.push(now);
    s.settings.sendLog = log;
    write(s);
    res.json({ ok: true, contactedAt: now, unseen: s.items.filter((i) => !i.seen).length, sentToday: log.length, perDay: PER_DAY });
  });

  // note that creators were emailed (or take it back). Emailing someone also counts as having seen them.
  admin.post('/api/admin/discovered/contacted', requireAdmin, json, (req, res) => {
    const want = new Set(ids(req.body));
    if (!want.size) return res.status(400).json({ error: 'Choose at least one creator.' });
    const on = !(req.body && req.body.contacted === false);
    const now = new Date().toISOString();
    const s = read();
    let n = 0;
    for (const i of s.items) {
      if (!want.has(i.id)) continue;
      if (on) { i.contactedAt = now; i.contactedCount = (i.contactedCount || 0) + 1; i.seen = true; }
      else { delete i.contactedAt; delete i.contactedCount; }
      n += 1;
    }
    if (n) write(s);
    res.json({ ok: true, changed: n, contactedAt: on ? now : '', unseen: s.items.filter((i) => !i.seen).length });
  });

  // the starting message for emails to creators, shared by everyone who uses the admin
  admin.post('/api/admin/discovered/template', requireAdmin, json, (req, res) => {
    const subject = templateText(req.body && req.body.subject, 200).replace(/\n+/g, ' ');
    const body = templateText(req.body && req.body.body, 4000);
    const s = read();
    if (!subject && !body) delete s.settings.emailTemplate;     // empty = back to the built-in message
    else s.settings.emailTemplate = { subject, body };
    write(s);
    res.json({ ok: true, emailTemplate: currentTemplate(s.settings) });
  });

  admin.delete('/api/admin/discovered/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const s = read();
    const keep = s.items.filter((i) => i.id !== id);
    if (keep.length === s.items.length) return res.status(404).json({ error: 'Not found.' });
    unlinkPhoto((s.items.find((i) => i.id === id) || {}).avatarFile);
    s.items = keep;
    write(s);
    res.json({ ok: true, unseen: keep.filter((i) => !i.seen).length });
  });

  return { receiver, admin, RECEIVE_PATH };
};

// exposed for tests
module.exports._internals = { normalise, extract, count, dateOnly, AVATAR_HOSTS, sniffImage, photoKey, cleanEmail, findEmail, DEFAULT_TEMPLATE };
