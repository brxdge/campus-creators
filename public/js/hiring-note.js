/* The "We're hiring" note on the Ambassadors page.
   The countdown ring and the fade-out are done in CSS (affiliates.css), so the note
   goes away on its own after about 10 seconds. This file only handles the X button
   and remembers, for this visit only, that the note has been dismissed or has timed out. */
(function () {
  var note = document.getElementById('affHiring');
  if (!note) return;

  var KEY = 'cc-hiring-note-dismissed';
  function wasDismissed() { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function remember() { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} }

  if (wasDismissed()) { note.remove(); return; }

  var gone = false;
  function finish() {
    if (gone) return;
    gone = true;
    remember();
    note.remove();
  }

  // the timer ran out (the CSS fade-out finished)
  note.addEventListener('animationend', function (e) {
    if (e.target === note && e.animationName === 'affHiringOut') finish();
  });

  // the X: fade it quickly, then take it out
  var x = note.querySelector('.aff-hiring-x');
  if (x) x.addEventListener('click', function () {
    note.classList.add('is-closing');
    setTimeout(finish, 350);
  });
})();
