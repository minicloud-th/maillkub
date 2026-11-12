(() => {
  'use strict';
  const header = document.querySelector('.reference-topbar');
  const language = document.getElementById('topbar-language');
  const startSlot = header?.querySelector('.topbar-start-slot');
  if (!header || !language || !startSlot) return;

  let frame = 0;

  function update() {
    const y = Math.max(0, window.scrollY);
    const isOrders = window.location.hash === '#orders';
    const startVisible = true;
    header.dataset.scrolled = String(y > 12);
    header.dataset.startVisible = String(startVisible);
    startSlot.inert = !startVisible;
  }

  window.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {frame = 0; update();});
  }, {passive: true});
  window.addEventListener('hashchange', () => {
    language.open = false;
    requestAnimationFrame(update);
  });
  document.addEventListener('click', event => {
    if (!language.contains(event.target)) language.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && language.open) {
      language.open = false;
      language.querySelector('summary').focus();
    }
  });
  document.getElementById('topbar-thai').addEventListener('click', () => {
    language.open = false;
    language.querySelector('summary').focus();
  });
  update();
})();
