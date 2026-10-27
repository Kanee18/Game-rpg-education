// Ikon garis (SVG) pengganti emoji. Pakai: Icon.play -> string <svg>.
// Di HTML statis: <i data-icon="play"></i> diganti otomatis saat halaman dimuat.
(function () {
  const P = {
    play: '<path d="M7 4l13 8-13 8z"/>',
    skip: '<path d="M5 4l10 8-10 8z"/><path d="M19 5v14"/>',
    loop: '<path d="M4 11a7 7 0 0 1 12-5l3 3"/><path d="M19 4v5h-5"/><path d="M20 13a7 7 0 0 1-12 5l-3-3"/><path d="M5 20v-5h5"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    up: '<path d="M6 15l6-6 6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    paste: '<path d="M9 4h6v3H9z"/><path d="M8 5H5v15h14V5h-3"/><path d="M8 12h8M8 16h5"/>',
    import: '<path d="M12 3v11M7 9l5 5 5-5"/><path d="M4 15v5h16v-5"/>',
    export: '<path d="M12 14V3M7 8l5-5 5 5"/><path d="M4 15v5h16v-5"/>',
    reset: '<path d="M4 4v6h6"/><path d="M5 14a8 8 0 1 0 2-7l-3 3"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    sword: '<path d="M14.5 3H21v6.5L10 20.5 3.5 14z"/><path d="M6 17l-3 3M8.5 13.5l2 2"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    flame: '<path d="M12 21c-4 0-7-2.6-7-6.5 0-3.4 2.6-5.3 3.5-8.5 1.5 1.5 2 3 2 4.5C12 9 13 6.5 12.5 3c4 2.5 6.5 6.6 6.5 11.5 0 3.9-3 6.5-7 6.5z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    bolt: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
    shield: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/>',
    skull: '<path d="M5 11a7 7 0 0 1 14 0v4h-2v3H7v-3H5z"/><circle cx="9.5" cy="11.5" r="1.6"/><circle cx="14.5" cy="11.5" r="1.6"/>',
    exit: '<path d="M14 4h5v16h-5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const Icon = {};
  for (const [k, d] of Object.entries(P)) Icon[k] = `<svg class="i i-${k}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  window.Icon = Icon;
  const fill = () => document.querySelectorAll('i[data-icon]').forEach((el) => { el.outerHTML = Icon[el.dataset.icon] || ''; });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
