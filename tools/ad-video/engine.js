// A tiny timeline for the ad videos: each video page fills #root with scenes,
// then calls play(scenes, total). render(t) places everything at second t, so
// the build script can capture frame by frame.
(function () {
  const clamp = (x) => Math.max(0, Math.min(1, x));
  const ease = (x) => 1 - Math.pow(1 - clamp(x), 4);
  const inOut = (x) => { x = clamp(x); return x < 0.5 ? 8 * x ** 4 : 1 - Math.pow(-2 * x + 2, 4) / 2; };
  const $ = (id) => document.getElementById(id);
  const k = () => innerWidth / 1080;
  function enter(id, t, at, { y = 60, dur = 0.7, scale = 0.96, blur = 8 } = {}) {
    const el = typeof id === 'string' ? $(id) : id;
    if (!el) return 0;
    const p = ease((t - at) / dur);
    el.style.opacity = p;
    el.style.transform = `translateY(${(1 - p) * y * k()}px) scale(${scale + (1 - scale) * p})`;
    el.style.filter = p < 1 ? `blur(${(1 - p) * blur}px)` : 'none';
    return p;
  }
  function type(id, text, t, at, cps = 26) {
    const n = Math.max(0, Math.min(text.length, Math.floor((t - at) * cps)));
    $(id).textContent = text.slice(0, n);
    return n === text.length;
  }
  function count(id, to, t, at, dur = 1.1, fmt = (n) => n.toLocaleString('he-IL')) {
    $(id).textContent = fmt(Math.round(to * ease((t - at) / dur)));
  }
  function scenes(t, list) {
    for (const [id, a, b] of list) {
      const s = $(id);
      const out = clamp((t - (b - 0.35)) / 0.35);
      s.style.display = t >= a - 0.01 && t < b ? 'flex' : 'none';
      s.style.opacity = 1 - out;
      s.style.transform = `scale(${1 - out * 0.04})`;
      s.style.filter = out ? `blur(${out * 10}px)` : 'none';
    }
  }
  // The closing call, the same in every video.
  const cta = () => `<section class="scene" id="cta">
    <div class="logo a" id="ctal"><img src="../../public/brand/gofive-mark.svg" alt=""><b>GoFive</b></div>
    <h1 class="a" id="ctah"><em>7 ימים חינם</em><br>על העסק שלכם</h1>
    <p class="sub a" id="ctas">בלי כרטיס אשראי · בלי התחייבות · בעברית</p>
    <div class="cta a" id="ctab">gofive.co.il</div>
    <span class="gline a" id="ctag">${window.G}בנויה על Google Business Profile</span>
  </section>`;
  function ctaRender(t, at) {
    enter('ctal', t, at + 0.1, { y: 30 });
    enter('ctah', t, at + 0.4);
    enter('ctas', t, at + 0.8, { y: 30 });
    enter('ctab', t, at + 1.1, { y: 30, scale: 0.9 });
    enter('ctag', t, at + 1.4, { y: 20 });
    if (t > at + 1.8) $('ctab').style.transform = `scale(${1 + 0.03 * Math.sin((t - at - 1.8) * 5)})`;
  }
  const gauge = (id) => { const len = Math.PI * 80; return `<svg viewBox="0 0 200 112"><path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#ece8fb" stroke-width="18" stroke-linecap="round"/><path id="${id}a" d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#6d4bff" stroke-width="18" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len}"/><g id="${id}n"><path d="M100 36 L106 100 L94 100 Z" fill="#17123a"/></g><circle cx="100" cy="100" r="9" fill="#17123a"/></svg>`; };
  function gaugeTo(id, score) { const len = Math.PI * 80; $(id + 'a').setAttribute('stroke-dashoffset', len * (1 - score / 100)); $(id + 'n').setAttribute('transform', `rotate(${-90 + (score / 100) * 180} 100 100)`); }
  window.AdKit = { clamp, ease, inOut, $, enter, type, count, scenes, cta, ctaRender, gauge, gaugeTo };
  window.G = '<svg viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  window.ICON = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L2.9 9.4l6.3-.9z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
    qr: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M18 19h3v2"/></svg>',
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/></svg>',
    rivals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 19c.8-3.5 3-5 5.5-5s4.7 1.5 5.5 5M14 19c.5-2.5 1.8-3.8 3.5-3.8S20.6 16.5 21.5 19"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5zm5.3 13.4c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.6c-.2.2-.3.4-.1.7.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.7-.1l.9-1.1c.2-.3.4-.2.7-.1l2 .9c.3.1.5.2.5.4.1.1.1.7-.1 1.3z"/></svg>',
  };
})();
