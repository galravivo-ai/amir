import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';

// The interface in English. Pages are written in Hebrew; for a visitor who
// chose English, the finished HTML goes through translate(), which swaps each
// piece of interface text for its English version from src/lang/en.json. Keys
// are the Hebrew as it appears in the HTML; {n} stands for any number, other
// {names} for any text. Text with no translation (the business's own data,
// reviews) stays as it is.
//
// The language comes from the user's setting, else the "lang" cookie, and
// lives for the whole request (lang()), so formatters can follow it too.

const EN = JSON.parse(fs.readFileSync(new URL('./lang/en.json', import.meta.url), 'utf8'));
export const LANGS = ['he', 'en'];
export const LANG_COOKIE = 'lang';
const als = new AsyncLocalStorage();

export const lang = () => als.getStore()?.lang || 'he';
export const isEn = () => lang() === 'en';
export const runWithLang = (value, fn) => als.run({ lang: LANGS.includes(value) ? value : 'he' }, fn);
export function setLang(value) {
  const store = als.getStore();
  if (store && LANGS.includes(value)) store.lang = value;
}

const HEB = /[֐-׿]/;
// Numbers as they appear in the text: 1,234 · 4.6 · 16.10.2026 · 16:38 · 74%
const NUM = /\d[\d,.:/]*%?/g;

// Exact entries, entries with {n} for numbers, and patterns with named slots.
const exact = new Map();
const numeric = new Map();
const patterns = [];
for (const [he, en] of Object.entries(EN)) {
  const slots = he.match(/\{(\w+)\}/g) || [];
  if (!slots.length) exact.set(he, en);
  else if (slots.every((s) => s === '{n}')) numeric.set(he, en);
  else {
    const parts = he.split(/(\{\w+\})/);
    const names = [];
    const re = parts.map((p) => (/^\{\w+\}$/.test(p) ? (names.push(p.slice(1, -1)), '(.+?)') : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
    patterns.push({ re: new RegExp(`^${re}$`, 's'), names, en, weight: he.replace(/\{\w+\}/g, '').length });
  }
}
patterns.sort((a, b) => b.weight - a.weight);

/** One piece of text (already HTML-escaped, without surrounding spaces). */
export function translateText(text) {
  if (!HEB.test(text)) return text;
  const hit = exact.get(text);
  if (hit != null) return hit;
  const nums = text.match(NUM);
  if (nums) {
    const en = numeric.get(text.replace(NUM, '{n}'));
    if (en != null) {
      let i = 0;
      return en.replace(/\{n\}/g, () => nums[i++] ?? '');
    }
  }
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const vals = Object.fromEntries(p.names.map((n, i) => [n, translateText(m[i + 1])]));
    return p.en.replace(/\{(\w+)\}/g, (s, k) => vals[k] ?? s);
  }
  return text;
}

const keepSpace = (s, fn) => {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  return m[2] ? m[1] + fn(m[2]) + m[3] : s;
};

// Strings inside inline scripts and on* handlers: confirm('…'), textContent='…'.
const quoted = (code) => code.replace(/(['"])((?:(?!\1)[^\\\n]|\\.)*?[֐-׿](?:(?!\1)[^\\\n]|\\.)*?)\1/g, (s, q, body) => {
  const en = translateText(body);
  return en === body ? s : q + en.replace(new RegExp(q, 'g'), `\\${q}`) + q;
});

const ATTRS = /\s(title|placeholder|aria-label|alt|content|data-l|label|value|onclick|onsubmit|onchange)="([^"]*)"/g;
const tagAttrs = (tag) =>
  tag.replace(ATTRS, (s, name, val) => {
    if (!HEB.test(val)) return s;
    const en = name.startsWith('on') ? quoted(val) : keepSpace(val, translateText);
    return ` ${name}="${en}"`;
  });

/** A whole page: text between tags, a few attributes, and strings in scripts. */
export function translate(html) {
  let out = '';
  let i = 0;
  const re = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<[^>]+>/gi;
  for (let m; (m = re.exec(html)); ) {
    out += keepSpace(html.slice(i, m.index), translateText);
    const tag = m[0];
    if (/^<script/i.test(tag)) {
      const open = tag.indexOf('>') + 1;
      out += tagAttrs(tag.slice(0, open)) + quoted(tag.slice(open));
    } else if (tag.startsWith('<!--') || /^<style/i.test(tag)) out += tag;
    else out += tagAttrs(tag);
    i = re.lastIndex;
  }
  out += keepSpace(html.slice(i), translateText);
  return out.replace(/<html lang="he" dir="rtl">/, '<html lang="en" dir="ltr">');
}

/** Every piece of Hebrew interface text on a page, for finding what still needs a translation. */
export function untranslated(html) {
  const found = new Set();
  const seen = (t) => HEB.test(t) && translateText(t) === t && found.add(t.replace(NUM, '{n}'));
  const re = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<[^>]+>/gi;
  let i = 0;
  const text = (s) => seen(s.trim());
  for (let m; (m = re.exec(html)); ) {
    text(html.slice(i, m.index));
    for (const a of m[0].matchAll(/\s(?:title|placeholder|aria-label|alt|content|data-l|label)="([^"]*)"/g)) text(a[1]);
    for (const q of m[0].matchAll(/(['"])((?:(?!\1)[^\\\n<>])*?[֐-׿](?:(?!\1)[^\\\n<>])*?)\1/g)) if (/^<script|on\w+=/.test(m[0]) || /^<script/i.test(m[0])) text(q[2]);
    i = re.lastIndex;
  }
  text(html.slice(i));
  return [...found];
}
