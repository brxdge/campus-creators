// Admin sidebar: the Inbox / Creators / Brands page / Talents page groups fold
// up and open again. What's open is remembered in this browser. Until you've
// chosen, every group starts folded except the one holding the page you're on,
// and moving to a page inside a folded group opens that group. A folded group
// still shows the unread count of the links inside it, and a red dot when the
// page you're on is in there.
(function () {
  'use strict';
  var nav = document.getElementById('sideNav');
  if (!nav) return;
  var KEY = 'ccAdminSidebar';
  var sections = Array.prototype.slice.call(nav.querySelectorAll('.side-section'));
  if (!sections.length) return;

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save() {
    try {
      var o = {};
      sections.forEach(function (s) { o[s.dataset.group] = s.classList.contains('is-collapsed') ? 0 : 1; });
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* private window or blocked storage: it just won't be remembered */ }
  }

  function setOpen(section, open) {
    section.classList.toggle('is-collapsed', !open);
    var btn = section.querySelector('.side-group');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    countFor(section);
  }

  // the unread total of the links inside a group, shown on its header while it's folded
  function countFor(section) {
    var pill = section.querySelector('.side-group-count');
    var folded = section.classList.contains('is-collapsed');
    var total = 0, plus = false;
    section.querySelectorAll('.badge').forEach(function (b) {
      if (b.hidden) return;
      var t = (b.textContent || '').trim();
      var n = parseInt(t, 10);
      if (n > 0) total += n;
      if (/\+/.test(t)) plus = true;
    });
    if (folded && total > 0) {
      pill.textContent = plus || total > 99 ? '99+' : String(total);
      pill.hidden = false;
    } else {
      pill.hidden = true;
    }
  }

  function markActive() {
    sections.forEach(function (s) {
      var has = !!s.querySelector('a.active');
      s.querySelector('.side-group').classList.toggle('has-active', has);
    });
  }

  // open the group that holds the page you're on
  function revealActive() {
    sections.forEach(function (s) {
      if (s.querySelector('a.active') && s.classList.contains('is-collapsed')) setOpen(s, true);
    });
  }

  // first paint without animating, so nothing visibly folds on load
  nav.classList.add('no-anim');
  var saved = load();
  sections.forEach(function (s) {
    var v = saved ? saved[s.dataset.group] : undefined;
    setOpen(s, v === 1);                        // nothing chosen yet: folded
  });
  markActive();
  revealActive();
  window.requestAnimationFrame(function () {
    window.requestAnimationFrame(function () { nav.classList.remove('no-anim'); });
  });

  sections.forEach(function (s) {
    s.querySelector('.side-group').addEventListener('click', function () {
      setOpen(s, s.classList.contains('is-collapsed'));
      save();
    });
  });

  if ('MutationObserver' in window) {
    // admin.js marks the current link with .active; follow it
    var activeObs = new MutationObserver(function () { markActive(); revealActive(); });
    nav.querySelectorAll('a[data-view]').forEach(function (a) {
      activeObs.observe(a, { attributes: true, attributeFilter: ['class'] });
    });
    // the unread badges are filled in later by admin.js / admin-discovered.js
    var badgeObs = new MutationObserver(function () { sections.forEach(countFor); });
    nav.querySelectorAll('.badge').forEach(function (b) {
      badgeObs.observe(b, { attributes: true, attributeFilter: ['hidden'], childList: true, characterData: true, subtree: true });
    });
  }
  window.addEventListener('hashchange', function () { window.setTimeout(function () { markActive(); revealActive(); }, 0); });
  sections.forEach(countFor);
})();

// The whole sidebar can be tucked away too, to give the page the full width.
// A button next to the logo hides it; the menu button at the top of the page
// brings it back. The choice is remembered in this browser. On a phone the
// sidebar already slides in and out from the menu button, so none of this
// applies there.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var hideBtn = document.getElementById('sideHide');
  var menuBtn = document.getElementById('sideToggle');
  if (!app || !hideBtn || !menuBtn) return;
  var KEY = 'ccAdminSideHidden';
  var wide = window.matchMedia ? window.matchMedia('(min-width: 861px)') : { matches: true };

  function remembered() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* private window: not remembered */ } }

  function paint(hidden) {
    app.classList.toggle('side-collapsed', hidden);
    menuBtn.setAttribute('aria-label', hidden ? 'Show menu' : 'Menu');
    menuBtn.title = hidden ? 'Show menu' : '';
  }
  paint(remembered());

  hideBtn.addEventListener('click', function () {
    paint(true);
    remember(true);
    menuBtn.focus();                      // the sidebar is gone; keep the keyboard somewhere visible
  });

  // admin.js uses the same button to slide the menu in on a phone. On a wide screen,
  // while the sidebar is hidden, it brings the sidebar back instead.
  document.addEventListener('click', function (e) {
    if (!wide.matches || !app.classList.contains('side-collapsed')) return;
    if (!e.target.closest || !e.target.closest('#sideToggle')) return;
    e.stopPropagation();
    paint(false);
    remember(false);
    hideBtn.focus();
  }, true);
})();
