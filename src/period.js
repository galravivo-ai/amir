// The dashboard's time range: a preset ("this month") or custom dates, with
// day boundaries in Israel time. `to` is null when the range runs up to now,
// so nothing that arrived a moment ago is cut off.

const TZ = 'Asia/Jerusalem';
const DAY = 864e5;
/** The longest custom range, to keep the daily chart readable. */
export const MAX_DAYS = 731;

export const PRESETS = {
  today: 'היום',
  yesterday: 'אתמול',
  '7d': '7 ימים אחרונים',
  '30d': '30 ימים אחרונים',
  this_month: 'החודש',
  last_month: 'החודש הקודם',
  '90d': '3 חודשים אחרונים',
  this_year: 'השנה',
  '365d': 'שנה אחרונה',
  custom: 'טווח תאריכים…',
};

const PHRASES = {
  today: 'היום',
  yesterday: 'אתמול',
  '7d': 'ב-7 הימים האחרונים',
  '30d': 'ב-30 הימים האחרונים',
  this_month: 'החודש',
  last_month: 'בחודש הקודם',
  '90d': 'ב-3 החודשים האחרונים',
  this_year: 'השנה',
  '365d': 'בשנה האחרונה',
};

/** Israel's calendar date of a moment: { y, m (0-11), d }. */
function localDate(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return { y: Number(parts.year), m: Number(parts.month) - 1, d: Number(parts.day) };
}

/** How far Israel is ahead of UTC at a moment, in ms. */
function offset(ms) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The moment a calendar day starts in Israel (month and day may overflow, like Date.UTC). */
export function midnight(y, m, d) {
  const utc = Date.UTC(y, m, d);
  // Two passes settle the offset even on daylight-saving days.
  let t = utc - offset(utc);
  t = utc - offset(t);
  return t;
}

const isoDay = ({ y, m, d }) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
const parseDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? s.split('-').map(Number) : null);
const fmt = (ms) => new Date(ms).toLocaleDateString('he-IL', { timeZone: TZ });

/**
 * Turns the query string into a range. Accepts `range` (a preset or
 * "custom" with `from` / `to` as YYYY-MM-DD), and the older `days`.
 */
export function resolvePeriod(query = {}, now = Date.now()) {
  let key = String(query.range ?? '');
  if (!PRESETS[key]) key = { 7: '7d', 30: '30d', 90: '90d', 365: '365d' }[Number(query.days)] || '30d';
  const today = localDate(now);
  const startOfToday = midnight(today.y, today.m, today.d);
  let from;
  let to = null;
  let label = PHRASES[key];

  switch (key) {
    case 'today':
      from = startOfToday;
      break;
    case 'yesterday':
      from = midnight(today.y, today.m, today.d - 1);
      to = startOfToday;
      break;
    case 'this_month':
      from = midnight(today.y, today.m, 1);
      break;
    case 'last_month':
      from = midnight(today.y, today.m - 1, 1);
      to = midnight(today.y, today.m, 1);
      break;
    case 'this_year':
      from = midnight(today.y, 0, 1);
      break;
    case 'custom': {
      const a = parseDay(query.from);
      const b = parseDay(query.to) || [today.y, today.m + 1, today.d];
      if (!a) return resolvePeriod({ range: '30d' }, now);
      let start = midnight(a[0], a[1] - 1, a[2]);
      let end = midnight(b[0], b[1] - 1, b[2] + 1);
      if (end <= start) [start, end] = [midnight(b[0], b[1] - 1, b[2]), midnight(a[0], a[1] - 1, a[2] + 1)];
      start = Math.max(start, end - MAX_DAYS * DAY);
      from = start;
      to = end >= now ? null : end;
      const lastDay = (to ?? now) - 1;
      label = from >= startOfToday ? 'היום' : `בין ${fmt(from)} ל-${fmt(Math.min(lastDay, now))}`;
      break;
    }
    default:
      from = now - { '7d': 7, '30d': 30, '90d': 90, '365d': 365 }[key] * DAY;
  }

  const end = to ?? now;
  return {
    key,
    from,
    to,
    label,
    days: Math.max(1, Math.round((end - from) / DAY)),
    // For the date inputs: the first and last day shown.
    fromDay: isoDay(localDate(from)),
    toDay: isoDay(localDate(end - 1)),
    todayDay: isoDay(today),
  };
}
