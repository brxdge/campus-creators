// ============================================================
// Emails you when someone fills in a form on the site.
//
// Uses Resend (https://resend.com) over plain HTTPS, so there is nothing to
// install. Set these in Railway -> Variables:
//
//   RESEND_API_KEY   required. Without it, emails are simply off.
//   NOTIFY_TO        optional. Who gets the emails. Default: hello@campuscreators.ca
//                    (several addresses: separate with commas)
//   MAIL_FROM        optional. Default: Campus Creators <onboarding@resend.dev>
//                    That default sender only delivers to the address your
//                    Resend account was created with. To send from your own
//                    domain, verify it in Resend and set e.g.
//                    Campus Creators <notifications@mail.campuscreators.ca>
//
// An email problem never loses a message: the form is saved to the admin
// inbox first, this runs afterwards, and any failure is only logged.
//
// Emails to creators (Admin > Discovered creators > Send) go out through the
// same Resend account:
//   OUTREACH_FROM       optional. Default: the MAIL_FROM address with "hello@"
//                       as the name before the @ (the domain must be verified)
//   OUTREACH_REPLY_TO   optional. Where creators' replies land.
//                       Default: the first NOTIFY_TO address
//   MAIL_ADDRESS        optional but recommended: your business mailing address,
//                       added to the bottom of every email to a creator
//                       (Canadian anti-spam law asks for it)
//   OUTREACH_PER_DAY    optional. Most emails to creators per 24 hours. Default 40
// ============================================================
const API_URL = process.env.RESEND_API_URL || 'https://api.resend.com/emails';
const MAX_PER_HOUR = 60;            // flood guard: spam can't bury your inbox

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const oneLine = (s) => String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
const asText = (v) => (Array.isArray(v) ? v.join(', ') : String(v == null ? '' : v)).trim();

// What goes in each email, in order. Birth date is left out on purpose:
// it stays in the admin inbox rather than travelling by email.
const LAYOUT = {
  brand: {
    heading: 'New brand inquiry',
    rows: [['Name', ['firstName', 'lastName']], ['Email', ['email']], ['Phone', ['phone']], ['Company', ['company']],
      ['Social / website', ['social']], ['Budget', ['budget']], ['Timeline', ['timeline']]],
    long: ['Message', 'message'],
  },
  talent: {
    heading: 'New ambassador application',
    rows: [['Name', ['firstName', 'lastName']], ['Email', ['email']], ['Phone', ['phone']], ['Hometown', ['hometown']],
      ['University', ['university', 'universityOther']], ['Year', ['year']], ['Organizations', ['organizations']],
      ['Instagram', ['instagram']], ['TikTok', ['tiktok']], ['Interests', ['interests']], ['Referred by', ['referredBy']]],
    long: null,
  },
};

module.exports = function createMailer(opts = {}) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const to = (process.env.NOTIFY_TO || 'hello@campuscreators.ca').split(',').map((s) => s.trim()).filter(Boolean);
  const from = (process.env.MAIL_FROM || 'Campus Creators <onboarding@resend.dev>').trim();
  const siteUrl = String(opts.siteUrl || '').replace(/\/+$/, '');
  const enabled = !!key && to.length > 0;

  if (!enabled) console.warn('[mail] RESEND_API_KEY is not set: form emails are off. Submissions still save to the admin inbox.');
  else console.log('[mail] form emails are on, sending to ' + to.join(', ') + ' from ' + from);

  let windowStart = Date.now();
  let sentInWindow = 0;
  function allowed() {
    const now = Date.now();
    if (now - windowStart > 60 * 60 * 1000) { windowStart = now; sentInWindow = 0; }
    return ++sentInWindow <= MAX_PER_HOUR;
  }

  async function post(payload) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.RESEND_TIMEOUT_MS) || 10000);
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'User-Agent': 'campus-creators-site' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        const err = new Error('Resend answered ' + res.status + ': ' + body.slice(0, 300));
        err.status = res.status;
        try { const j = JSON.parse(body); if (j && typeof j.message === 'string') err.detail = j.message.slice(0, 300); } catch (e) { /* not JSON: no detail */ }
        throw err;
      }
      return body;
    } finally { clearTimeout(timer); }
  }

  // one retry, only for hiccups on their side or ours (network, 429, 5xx)
  async function send(payload) {
    try { return await post(payload); } catch (err) {
      if (err.status && err.status < 500 && err.status !== 429) throw err;
      await sleep(2000);
      return post(payload);
    }
  }

  // ---------- emails to creators ----------
  // From a name on the same verified domain as the notifications ("hello@"), unless OUTREACH_FROM says otherwise.
  // Resend's shared test sender (resend.dev) only works as it is, so it is kept.
  function outreachFrom() {
    if (process.env.OUTREACH_FROM && process.env.OUTREACH_FROM.trim()) return process.env.OUTREACH_FROM.trim();
    const m = from.match(/@([A-Za-z0-9.-]+)>?\s*$/);
    if (!m || /(^|\.)resend\.dev$/i.test(m[1])) return from;
    return 'Campus Creators <hello@' + m[1] + '>';
  }
  const outFrom = outreachFrom();
  const replyTo = (process.env.OUTREACH_REPLY_TO || to[0] || '').trim();
  const address = String(process.env.MAIL_ADDRESS || '').replace(/[\r\n]+/g, ', ').trim();
  const outreach = { enabled, from: outFrom, replyTo, hasAddress: !!address };

  // One plain-text email to one creator. Never retried: if it times out the email may still have
  // gone out, and a second copy to a stranger is worse than asking the team to look.
  async function sendOutreach(msg) {
    if (!enabled) throw new Error('Email is not set up (RESEND_API_KEY is missing).');
    let text = String(msg.text || '').trim();
    if (address && !text.includes(address)) text += '\n\nCampus Creators, ' + address;
    const payload = { from: outFrom, to: [String(msg.to)], subject: oneLine(msg.subject).slice(0, 200), text };
    if (/^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(replyTo)) {
      payload.reply_to = replyTo;
      payload.headers = { 'List-Unsubscribe': '<mailto:' + replyTo + '?subject=Unsubscribe>' };
    }
    return post(payload);
  }

  function build(entry) {
    const lay = LAYOUT[entry.type];
    if (!lay) return null;
    const d = entry.data || {};
    const rows = lay.rows
      .map(([label, keys]) => [label, keys.map((k) => asText(d[k])).filter(Boolean).join(' ')])
      .filter(([, v]) => v);
    const long = lay.long && d[lay.long[1]] ? [lay.long[0], asText(d[lay.long[1]])] : null;

    const when = new Date(entry.createdAt || Date.now()).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' });
    const who = [asText(d.firstName), asText(d.lastName)].filter(Boolean).join(' ');
    const subject = oneLine(entry.type === 'brand'
      ? 'New brand inquiry: ' + (asText(d.company) || who)
      : 'New ambassador application: ' + who + (d.university ? ' (' + asText(d.university) + ')' : '')).slice(0, 150);
    const adminUrl = siteUrl ? siteUrl + '/admin' : '';

    const text = [lay.heading + ' (' + when + ' Toronto time)', '']
      .concat(rows.map(([l, v]) => l + ': ' + v))
      .concat(long ? ['', long[0] + ':', long[1]] : [])
      .concat(['', 'Reply to this email to answer them directly.'])
      .concat(adminUrl ? ['Everything is also in your admin inbox: ' + adminUrl] : [])
      .join('\n');

    const cell = 'padding:6px 12px 6px 0;vertical-align:top;';
    const html =
      '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;max-width:620px">' +
      '<h2 style="margin:0 0 4px;font-size:18px">' + esc(lay.heading) + '</h2>' +
      '<div style="color:#666;margin:0 0 16px">' + esc(when) + ' (Toronto time)</div>' +
      '<table style="border-collapse:collapse">' +
      rows.map(([l, v]) => '<tr><td style="' + cell + 'color:#666;white-space:nowrap">' + esc(l) + '</td><td style="' + cell + '">' + esc(v) + '</td></tr>').join('') +
      '</table>' +
      (long ? '<div style="margin:16px 0 0;color:#666">' + esc(long[0]) + '</div><div style="white-space:pre-wrap;margin:4px 0 0;padding:12px;background:#f5f5f5;border-radius:8px">' + esc(long[1]) + '</div>' : '') +
      '<p style="margin:20px 0 0;color:#666">Reply to this email to answer them directly.' +
      (adminUrl ? ' Everything is also in your <a href="' + esc(adminUrl) + '">admin inbox</a>.' : '') + '</p></div>';

    const payload = { from, to, subject, text, html };
    // only set Reply-To for a plain address; anything odd would make Resend reject the whole email
    if (/^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(asText(d.email))) payload.reply_to = asText(d.email);
    return payload;
  }

  async function notifySubmission(entry) {
    if (!enabled) return;
    try {
      const payload = build(entry);
      if (!payload) return;
      if (!allowed()) { console.warn('[mail] hourly limit reached, skipped an email (the submission is saved in the admin inbox)'); return; }
      await send(payload);
      console.log('[mail] notification sent for ' + entry.type + ' submission ' + entry.id);
    } catch (err) {
      console.error('[mail] could not send the notification (the submission is saved in the admin inbox): ' + (err && err.message ? err.message : err));
    }
  }

  return { enabled, notifySubmission, sendOutreach, outreach };
};
