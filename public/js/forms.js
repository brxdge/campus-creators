// ============================================================
// Brands contact form + Talents application form.
// - checks every field before sending and shows the problem right
//   under the field (no browser pop-ups hidden behind the modal)
// - accepts Instagram/TikTok as @handle, handle or full link
// - shows a clear "sent" screen on success
// Both post to /api/submissions (stored on the server, shown in the admin inbox).
// ============================================================
(function ccForms() {
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // "@name", "name", "instagram.com/name", "https://www.instagram.com/name/?hl=en" -> "name"
  function handleOf(v) {
    let s = String(v || '').trim();
    if (!s) return '';
    s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    s = s.replace(/^(instagram\.com|tiktok\.com)\//i, '');
    s = s.replace(/^@+/, '').split(/[/?#\s]/)[0];
    return s;
  }
  const validHandle = (h) => /^[A-Za-z0-9._]{1,30}$/.test(h);

  function fieldBox(input) {
    return input.closest('.tal-field, .field, .tal-consent, [data-group]') || input.parentElement;
  }
  function setError(input, text) {
    const box = fieldBox(input);
    if (!box) return;
    box.classList.add('is-invalid');
    let e = box.querySelector(':scope > .field-err');
    if (!e) { e = document.createElement('small'); e.className = 'field-err'; box.appendChild(e); }
    e.textContent = text;
    if (input.setAttribute) input.setAttribute('aria-invalid', 'true');
  }
  function clearErrors(form) {
    form.querySelectorAll('.is-invalid').forEach((b) => b.classList.remove('is-invalid'));
    form.querySelectorAll('.field-err').forEach((e) => e.remove());
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  }
  // clear a field's error as soon as it's fixed
  function liveClear(form) {
    const fix = (e) => {
      const box = fieldBox(e.target);
      if (box && box.classList.contains('is-invalid')) {
        box.classList.remove('is-invalid');
        const er = box.querySelector(':scope > .field-err'); if (er) er.remove();
        e.target.removeAttribute('aria-invalid');
      }
    };
    form.addEventListener('input', fix);
    form.addEventListener('change', fix);
  }

  function showFirstError(form) {
    const first = form.querySelector('.is-invalid');
    if (!first) return;
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const i = first.querySelector('input:not([type=checkbox]), select, textarea') || first.querySelector('input');
    if (i) setTimeout(() => i.focus({ preventScroll: true }), 350);
  }

  async function send(type, fields, hp) {
    let res;
    try {
      res = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, website: hp || '', fields }),
      });
    } catch (e) { throw new Error('Could not connect. Check your internet and try again.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  }

  function done(form, doneEl) {
    form.hidden = true;
    doneEl.hidden = false;
    const panel = form.closest('[data-lenis-prevent]');
    if (panel) { panel.classList.add('is-done'); panel.scrollTop = 0; }
  }
  function resetView(form, doneEl, msg) {
    form.reset();
    clearErrors(form);
    form.hidden = false;
    doneEl.hidden = true;
    const panel = form.closest('[data-lenis-prevent]');
    if (panel) panel.classList.remove('is-done');
    if (msg) { msg.textContent = ''; msg.className = msg.className.replace(/\b(show|err)\b/g, '').trim(); }
    form.dispatchEvent(new Event('cc:reset'));
  }

  // ---------------- Brands ----------------
  (function brandForm() {
    const form = document.getElementById('contactForm');
    const msg = document.getElementById('formMsg');
    const doneEl = document.getElementById('contactDone');
    if (!form || !msg || !doneEl) return;
    liveClear(form);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      msg.classList.remove('show');
      const f = form.elements;
      const req = [['firstName', 'Please enter your first name.'], ['email', 'Please enter your email.'],
        ['company', 'Please enter your company.'], ['message', 'Tell us a little about what you’re launching.']];
      req.forEach(([k, t]) => { if (!f[k].value.trim()) setError(f[k], t); });
      if (f.email.value.trim() && !EMAIL.test(f.email.value.trim())) setError(f.email, 'That email doesn’t look right.');
      if (form.querySelector('.is-invalid')) { showFirstError(form); return; }

      const fields = {};
      ['firstName', 'lastName', 'email', 'phone', 'company', 'social', 'budget', 'timeline', 'message']
        .forEach((k) => { if (f[k]) fields[k] = f[k].value.trim(); });
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('is-loading');
      try {
        await send('brand', fields, f.cc_hp ? f.cc_hp.value : '');
        done(form, doneEl);
      } catch (err) {
        msg.textContent = err.message;
        msg.style.color = '#C0321A';
        msg.classList.add('show');
      } finally { btn.disabled = false; btn.classList.remove('is-loading'); }
    });

    doneEl.querySelector('[data-close-contact]').addEventListener('click', () => {
      const x = document.getElementById('contactModalClose');
      if (x) x.click();
      setTimeout(() => resetView(form, doneEl, msg), 350);
    });
  })();

  // ---------------- Talents ----------------
  (function talentForm() {
    const form = document.getElementById('applyForm');
    const msg = document.getElementById('applyFormMsg');
    const doneEl = document.getElementById('applyDone');
    if (!form || !msg || !doneEl) return;
    liveClear(form);
    const f = form.elements;

    // "Other" school reveals the school-name field
    const other = form.querySelector('.tal-other');
    const syncOther = () => {
      const on = f.university.value === 'Other';
      other.hidden = !on;
      f.universityOther.required = on;
      if (!on) f.universityOther.value = '';
    };
    f.university.addEventListener('change', syncOther);
    form.addEventListener('cc:reset', syncOther);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      msg.className = 'tal-form-msg';
      const need = (k, t) => { if (!String(f[k].value || '').trim()) setError(f[k], t); };
      need('firstName', 'Please enter your first name.');
      need('lastName', 'Please enter your last name.');
      need('email', 'Please enter your email.');
      if (f.email.value.trim() && !EMAIL.test(f.email.value.trim())) setError(f.email, 'That email doesn’t look right.');
      need('phone', 'Please enter your phone number.');
      if (f.phone.value.trim() && f.phone.value.replace(/\D/g, '').length < 10) setError(f.phone, 'Please enter a 10-digit phone number.');
      if (!f.birthMonth.value || !f.birthDay.value || !f.birthYear.value) setError(f.birthMonth, 'Please pick your full birthday.');
      need('hometown', 'Please enter your hometown.');
      need('university', 'Please pick your school.');
      if (f.university.value === 'Other') need('universityOther', 'Please tell us where you go.');
      need('year', 'Please pick your year.');
      const ig = handleOf(f.instagram.value);
      if (!f.instagram.value.trim()) setError(f.instagram, 'Please add your Instagram.');
      else if (!validHandle(ig)) setError(f.instagram, 'Enter your Instagram handle, like @yourname.');
      const tt = handleOf(f.tiktok.value);
      if (f.tiktok.value.trim() && !validHandle(tt)) setError(f.tiktok, 'Enter your TikTok handle, like @yourname.');
      const interests = Array.from(form.querySelectorAll('input[name="interests"]:checked')).map((c) => c.value);
      if (!interests.length) setError(form.querySelector('[data-group=interests] input'), 'Pick at least one so we can match you with the right brands.');
      if (!f.consent.checked) setError(f.consent, 'Please tick this so we can contact you.');
      if (form.querySelector('.is-invalid')) {
        msg.textContent = 'A few things need fixing. They’re highlighted above.';
        msg.className = 'tal-form-msg show err';
        showFirstError(form);
        return;
      }

      const fields = {};
      ['firstName', 'lastName', 'email', 'phone', 'birthMonth', 'birthDay', 'birthYear', 'hometown',
        'university', 'universityOther', 'year', 'organizations', 'igFollowers', 'referredBy']
        .forEach((k) => { if (f[k] && f[k].value.trim()) fields[k] = f[k].value.trim(); });
      fields.instagram = 'https://instagram.com/' + ig;
      if (tt) fields.tiktok = 'https://www.tiktok.com/@' + tt;
      fields.interests = interests;
      fields.consent = 'Yes';

      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('is-loading');
      try {
        await send('talent', fields, f.cc_hp ? f.cc_hp.value : '');
        msg.textContent = ''; msg.className = 'tal-form-msg';
        done(form, doneEl);
      } catch (err) {
        msg.textContent = err.message;
        msg.className = 'tal-form-msg show err';
      } finally { btn.disabled = false; btn.classList.remove('is-loading'); }
    });

    doneEl.querySelector('[data-close-apply]').addEventListener('click', () => {
      const x = document.getElementById('applyModalClose');
      if (x) x.click();
      setTimeout(() => resetView(form, doneEl, msg), 350);
    });
  })();
})();
