// Line icons (24×24, stroked with currentColor) used across the UI.
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z',
  inbox: 'M4 13l2.5-8h11L20 13v6a1 1 0 01-1 1H5a1 1 0 01-1-1zM4 13h5l1 2h4l1-2h5',
  alert: 'M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  web: 'M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18M12 3a9 9 0 110 18 9 9 0 010-18z',
  team: 'M16 19v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M9.5 10a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM21 19v-1a4 4 0 00-3-3.9M16 3.1a3.5 3.5 0 010 6.8',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 000 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
  user: 'M20 21v-1a5 5 0 00-5-5H9a5 5 0 00-5 5v1M12 11a4 4 0 100-8 4 4 0 000 8z',
  logout: 'M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 16l-4-4 4-4M6 12h10',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-3.5-3.5',
  chevron: 'M6 9l6 6 6-6',
  phone: 'M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2',
  bell: 'M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 20a2 2 0 004 0',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  chart: 'M4 20h16M7 16v-5M12 16V7M17 16v-8',
  chat: 'M5 5h14a1 1 0 011 1v10a1 1 0 01-1 1H10l-4 3v-3H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  handshake: 'M3 11l4-4 5 3 5-3 4 4M7 7v5l5 4 5-4V7M9 14l-2 2M15 14l2 2',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plug: 'M9 3v4M15 3v4M7 7h10v4a5 5 0 01-10 0zM12 16v5',
  trophy: 'M8 4h8v5a4 4 0 01-8 0zM8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M12 13v4M9 20h6M10 17h4',
  star: 'M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.4L12 17.4l-5.7 3 1.1-6.4L2.8 9.5l6.4-.9z',
};

const STAR = PATHS.star;

export function icon(name, size = 20, extra = '') {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" ${extra}><path d="${PATHS[name]}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// The GoFive mark (public/brand/gofive-mark.svg): a star whose right arm is
// a forward arrow, on a rounded purple tile.
const MARK_GLYPH = `<g stroke-linejoin="round" stroke-width="34"><path d="M446 146 L537 332 L372 330 Z" fill="#fff" stroke="#fff"/><path d="M386 350 L756 404 L420 676 L546 458 Z" fill="#FFCF3A" stroke="#FFCF3A"/><path d="M132 410 L282 382 L460 478 L246 740 L272 548 Z" fill="#fff" stroke="#fff"/></g>`;

export function logoMark(size = 34) {
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="25 22 850 850" aria-hidden="true"><rect x="25" y="22" width="850" height="850" rx="150" fill="#4E2EF6"/>${MARK_GLYPH}</svg>`;
}

/** The product name as a wordmark: "Go" in ink, "Five" in purple. Other names stay plain. */
export function wordmark(name) {
  const safe = String(name).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return name === 'GoFive' ? '<span class="wordmark"><span class="wm-go">Go</span><span class="wm-five">Five</span></span>' : safe;
}

/** Filled star in the brand mark (square) style. */
export function starMark(size = 20, fill = 'currentColor') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="${fill}"/></svg>`;
}
