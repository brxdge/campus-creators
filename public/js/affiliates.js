// ============================================================
// The /affiliates page: just the menu, the header and the year.
// (The form itself is handled by forms.js.)
// ============================================================
(function ccAffiliates() {
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open);
    });
    links.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  // header gets a solid back once the page scrolls, and slides away on the way down
  const header = document.getElementById('siteHeader');
  if (header) {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      header.classList.toggle('scrolled', y > 12);
      const menuOpen = links && links.classList.contains('open');
      if (!menuOpen && y > 140) {
        if (y > lastY + 6) header.classList.add('nav-hidden');
        else if (y < lastY - 6) header.classList.remove('nav-hidden');
      } else header.classList.remove('nav-hidden');
      lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
