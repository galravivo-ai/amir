import { parseJson } from './db.js';
import { safeColor } from './util.js';

// The QR poster a business prints: sizes, looks, and the design saved per campaign.

export const POSTER_SIZES = {
  a3: { label: 'A3 · שלט גדול לחלון או לקיר', w: 297, h: 420 },
  a4: { label: 'A4 · שלט לקיר או לחלון', w: 210, h: 297 },
  a5: { label: 'A5 · שלט לדלפק', w: 148, h: 210 },
  a6: { label: 'A6 · כרטיס לשולחן', w: 105, h: 148 },
  sticker: { label: 'מדבקה מרובעת 10×10 ס״מ', w: 100, h: 100 },
  story: { label: 'סטורי לוואטסאפ ולאינסטגרם (תמונה)', w: 108, h: 192, digital: true },
};

/** Sizes small enough to print four on one A4 sheet. */
export const SHEET4_SIZES = ['a6', 'sticker'];

export const POSTER_STYLES = {
  classic: 'קלאסי',
  bold: 'צבעוני',
  modern: 'מודרני',
  google: 'גוגל',
  minimal: 'נקי',
  elegant: 'יוקרתי',
  split: 'חצוי',
  dark: 'כהה',
};

export const POSTER_FONTS = {
  display: 'בולט (Secular One)',
  rubik: 'מודרני (Rubik)',
  light: 'עדין (Assistant)',
};

/** Ready color pairs (main, accent) for one tap. */
export const POSTER_PALETTES = [
  ['#4b2bd6', '#ffd23f'],
  ['#111827', '#f5c542'],
  ['#0f766e', '#fde68a'],
  ['#be123c', '#fecdd3'],
  ['#1d4ed8', '#bfdbfe'],
  ['#c2410c', '#fed7aa'],
  ['#3f6212', '#ecfccb'],
  ['#7c2d12', '#e7c9a9'],
];

const clip = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A saved or submitted design, completed with the business's defaults. */
export function posterDesign(raw, { business, t, staff = null }) {
  const d = typeof raw === 'string' ? parseJson(raw, {}) : raw || {};
  const flag = (k, fallback) => (d[k] === undefined ? fallback : d[k] === true || d[k] === '1' || d[k] === 'on');
  const size = POSTER_SIZES[d.size] ? d.size : 'a4';
  return {
    size,
    style: POSTER_STYLES[d.style] ? d.style : 'classic',
    font: POSTER_FONTS[d.font] ? d.font : 'display',
    color: safeColor(d.color, safeColor(business.brand_color, '#4b2bd6')),
    accent: safeColor(d.accent, '#ffd23f'),
    title: clip(d.title, 80) || (staff ? t.poster_staff.replace('{name}', staff.name) : t.title),
    subtitle: clip(d.subtitle, 120) || t.subtitle,
    badge: clip(d.badge, 30) || t.poster_badge,
    footer: clip(d.footer, 80),
    showLogo: flag('showLogo', true),
    showName: flag('showName', true),
    showSteps: flag('showSteps', size !== 'sticker'),
    showStars: flag('showStars', true),
    showRating: flag('showRating', false),
    showGoogle: flag('showGoogle', false),
    qrBrand: flag('qrBrand', false),
    qrLogo: flag('qrLogo', false),
    sheet4: SHEET4_SIZES.includes(size) && flag('sheet4', false),
  };
}

/** The on/off choices of the designer. */
export const POSTER_FLAGS = ['showLogo', 'showName', 'showSteps', 'showStars', 'showRating', 'showGoogle', 'qrBrand', 'qrLogo', 'sheet4'];

/** The fields a business can save (texts equal to the defaults are not stored, so a language change still applies). */
export function designToSave(body, { business, t, staff }) {
  const flags = Object.fromEntries(POSTER_FLAGS.map((k) => [k, body[k] === '1']));
  const d = posterDesign({ ...body, ...flags }, { business, t, staff });
  const defaults = posterDesign({}, { business, t, staff });
  for (const k of ['title', 'subtitle', 'badge']) if (d[k] === defaults[k]) delete d[k];
  return d;
}

/** Dark or light text, whichever reads on the given background. */
export function inkOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '#17123a' : '#ffffff';
}
