// Accessibility menu and cookie notice, on every page.
// Settings live in localStorage, per browser; nothing is sent to the server.
(function () {
  var KEY = 'gofive-a11y';
  var COOKIE_KEY = 'gofive-cookies-ok';
  var root = document.documentElement;
  var lang = (root.getAttribute('lang') || 'he').slice(0, 2);

  var TEXT = {
    he: {
      open: 'תפריט נגישות', title: 'נגישות', close: 'סגירה', size: 'גודל טקסט', smaller: 'הקטנת טקסט', bigger: 'הגדלת טקסט',
      contrast: 'ניגודיות גבוהה', gray: 'גווני אפור', links: 'הדגשת קישורים', font: 'גופן קריא', spacing: 'ריווח שורות',
      still: 'עצירת אנימציות', cursor: 'סמן גדול', focus: 'הדגשת מיקוד מקלדת', reset: 'איפוס הגדרות', statement: 'הצהרת נגישות',
      cookies: 'האתר משתמש רק בעוגיות הכרחיות שמאפשרות לו לפעול, בלי עוגיות פרסום או מעקב.', cookiesMore: 'מדיניות עוגיות', ok: 'הבנתי',
    },
    en: {
      open: 'Accessibility menu', title: 'Accessibility', close: 'Close', size: 'Text size', smaller: 'Smaller text', bigger: 'Larger text',
      contrast: 'High contrast', gray: 'Grayscale', links: 'Highlight links', font: 'Readable font', spacing: 'Line spacing',
      still: 'Stop animations', cursor: 'Large cursor', focus: 'Keyboard focus', reset: 'Reset', statement: 'Accessibility statement',
      cookies: 'This site only uses cookies it needs to work. No advertising or tracking cookies.', cookiesMore: 'Cookie policy', ok: 'Got it',
    },
    ar: {
      open: 'قائمة إمكانية الوصول', title: 'إمكانية الوصول', close: 'إغلاق', size: 'حجم النص', smaller: 'تصغير النص', bigger: 'تكبير النص',
      contrast: 'تباين عالٍ', gray: 'تدرج رمادي', links: 'إبراز الروابط', font: 'خط مقروء', spacing: 'تباعد الأسطر',
      still: 'إيقاف الحركة', cursor: 'مؤشر كبير', focus: 'إبراز تركيز لوحة المفاتيح', reset: 'إعادة الضبط', statement: 'بيان إمكانية الوصول',
      cookies: 'يستخدم الموقع ملفات تعريف الارتباط الضرورية فقط لتشغيله، دون إعلانات أو تتبع.', cookiesMore: 'سياسة ملفات تعريف الارتباط', ok: 'فهمت',
    },
    ru: {
      open: 'Меню доступности', title: 'Доступность', close: 'Закрыть', size: 'Размер текста', smaller: 'Уменьшить текст', bigger: 'Увеличить текст',
      contrast: 'Высокий контраст', gray: 'Оттенки серого', links: 'Выделить ссылки', font: 'Читаемый шрифт', spacing: 'Межстрочный интервал',
      still: 'Остановить анимацию', cursor: 'Крупный курсор', focus: 'Фокус клавиатуры', reset: 'Сбросить', statement: 'Заявление о доступности',
      cookies: 'Сайт использует только необходимые для работы cookie, без рекламы и отслеживания.', cookiesMore: 'Политика cookie', ok: 'Понятно',
    },
  };
  var t = TEXT[lang] || TEXT.he;
  var TOGGLES = ['contrast', 'gray', 'links', 'font', 'spacing', 'still', 'cursor', 'focus'];
  var MAX_SIZE = 4;

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function save(s) {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch (e) {
      /* private mode: settings last for this page only */
    }
  }
  var state = load();

  function apply() {
    for (var i = 0; i < TOGGLES.length; i++) root.classList.toggle('a11y-' + TOGGLES[i], Boolean(state[TOGGLES[i]]));
    for (var n = 1; n <= MAX_SIZE; n++) root.classList.toggle('a11y-text-' + n, state.size === n);
  }
  // Applied before the page paints, so there is no flash of the default look.
  apply();

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text) e.textContent = text;
    return e;
  }

  var ICON =
    '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="currentColor"><circle cx="12" cy="4" r="2"/>' +
    '<path d="M19.5 7.5c-2.3.6-4.9.9-7.5.9s-5.2-.3-7.5-.9L4 9.4c1.9.5 3.9.8 6 .9V14l-2 7.2 1.9.5L12 15.2l2.1 6.5 1.9-.5L14 14v-3.7c2.1-.1 4.1-.4 6-.9l-.5-1.9z"/></svg>';

  function buildMenu() {
    var wrap = el('div', { class: 'a11y-root' });
    var btn = el('button', { type: 'button', class: 'a11y-fab', 'aria-label': t.open, 'aria-expanded': 'false', 'aria-controls': 'a11y-panel', title: t.open });
    btn.innerHTML = ICON;
    var panel = el('div', { id: 'a11y-panel', class: 'a11y-panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'a11y-title', hidden: '' });

    var head = el('div', { class: 'a11y-head' });
    head.appendChild(el('h2', { id: 'a11y-title' }, t.title));
    var close = el('button', { type: 'button', class: 'a11y-close', 'aria-label': t.close }, '×');
    head.appendChild(close);
    panel.appendChild(head);

    var size = el('div', { class: 'a11y-size', role: 'group', 'aria-label': t.size });
    var letter = lang === 'he' ? 'א' : 'A';
    var minus = el('button', { type: 'button', 'aria-label': t.smaller }, letter + '−');
    var label = el('span', {}, t.size);
    var plus = el('button', { type: 'button', 'aria-label': t.bigger }, letter + '+');
    size.appendChild(minus);
    size.appendChild(label);
    size.appendChild(plus);
    panel.appendChild(size);

    var grid = el('div', { class: 'a11y-grid' });
    var buttons = {};
    TOGGLES.forEach(function (name) {
      var b = el('button', { type: 'button', 'aria-pressed': state[name] ? 'true' : 'false' }, t[name]);
      b.addEventListener('click', function () {
        state[name] = !state[name];
        b.setAttribute('aria-pressed', state[name] ? 'true' : 'false');
        save(state);
        apply();
      });
      buttons[name] = b;
      grid.appendChild(b);
    });
    panel.appendChild(grid);

    var foot = el('div', { class: 'a11y-foot' });
    var reset = el('button', { type: 'button' }, t.reset);
    foot.appendChild(reset);
    foot.appendChild(el('a', { href: '/accessibility' }, t.statement));
    panel.appendChild(foot);

    function setSize(n) {
      state.size = Math.max(0, Math.min(MAX_SIZE, n)) || undefined;
      save(state);
      apply();
    }
    minus.addEventListener('click', function () {
      setSize((state.size || 0) - 1);
    });
    plus.addEventListener('click', function () {
      setSize((state.size || 0) + 1);
    });
    reset.addEventListener('click', function () {
      state = {};
      save(state);
      apply();
      for (var k in buttons) buttons[k].setAttribute('aria-pressed', 'false');
    });

    function toggle(open) {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) close.focus();
      else btn.focus();
    }
    btn.addEventListener('click', function () {
      toggle(panel.hidden);
    });
    close.addEventListener('click', function () {
      toggle(false);
    });
    panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') toggle(false);
    });

    wrap.appendChild(panel);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
  }

  function buildCookieNotice() {
    var seen = false;
    try {
      seen = localStorage.getItem(COOKIE_KEY) === '1';
    } catch (e) {
      /* show it */
    }
    if (seen || document.body.hasAttribute('data-no-cookie-notice')) return;
    var bar = el('div', { class: 'cookie-bar', role: 'region', 'aria-label': t.cookiesMore });
    bar.appendChild(el('p', {}, t.cookies + ' '));
    bar.firstChild.appendChild(el('a', { href: '/cookies' }, t.cookiesMore));
    var ok = el('button', { type: 'button', class: 'btn primary' }, t.ok);
    ok.addEventListener('click', function () {
      try {
        localStorage.setItem(COOKIE_KEY, '1');
      } catch (e) {
        /* private mode */
      }
      bar.remove();
    });
    bar.appendChild(ok);
    document.body.appendChild(bar);
  }

  function init() {
    buildMenu();
    buildCookieNotice();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
