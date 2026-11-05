// Builds the GoFive Facebook/Instagram ad videos, frame by frame.
//   node tools/ad-video/build.cjs [outDir] [video] [format]
// video: system | reviews | gbp (their own pages), or general | restaurant | salon | garage
//        (the first ad, ad.html); default: all
// MUSIC=path/to/track.mp3 adds the track under the video, faded in and out.
// format: story (1080x1920, 9:16) | square (1080x1080, 1:1) | feed (1080x1350, 4:5); default: story,square
// Needs Playwright's Chromium and ffmpeg. The sample businesses are illustrations.
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const VARIANTS = {
  general: { what: 'עסק כמו שלכם', query: 'בעל מקצוע מומלץ לידי', names: ['הסטודיו של נועה', 'העסק שלכם', 'מתחרה מהשכונה'], me: 1, stars: ['4.8', '4.6', '4.3'], waiting: 12, review: 'שירות מעולה, ממליץ בחום!', reviewer: 'דנה כ.', reply: 'תודה רבה, דנה! שמחים לשמוע שנהנית, ומחכים לראות אותך שוב.', sample: 'המחשה · עסק לדוגמה' },
  restaurant: { what: 'מסעדה', query: 'מסעדה איטלקית לידי', names: ['פסטה דה לוקה', 'ביסטרו הגפן', 'מסעדת הנמל'], me: 1, stars: ['4.7', '4.6', '4.3'], waiting: 14, review: 'הפסטה הכי טובה בעיר!', reviewer: 'רון א.', reply: 'תודה רבה, רון! שמחים שנהניתם מהפסטה, מחכים לכם בפעם הבאה.', sample: 'המחשה · ביסטרו הגפן הוא עסק לדוגמה' },
  salon: { what: 'מספרה', query: 'מספרה לידי', names: ['מספרת הדר', 'סטודיו שירן', 'Hair by Moran'], me: 1, stars: ['4.9', '4.7', '4.5'], waiting: 9, review: 'התספורת יצאה מושלמת!', reviewer: 'מיכל ש.', reply: 'תודה, מיכל! כיף לשמוע, נתראה בתור הבא.', sample: 'המחשה · סטודיו שירן הוא עסק לדוגמה' },
  garage: { what: 'מוסך', query: 'מוסך לידי', names: ['מוסך הצפון', 'מוסך אבי', 'טיפולי רכב כהן'], me: 1, stars: ['4.8', '4.6', '4.4'], waiting: 11, review: 'שירות מהיר והוגן, ממליץ!', reviewer: 'יוסי ל.', reply: 'תודה רבה, יוסי! סע בזהירות, ונשמח לראות אותך שוב.', sample: 'המחשה · מוסך אבי הוא עסק לדוגמה' },
};
const FORMATS = { story: [1080, 1920], feed: [1080, 1350], square: [1080, 1080] };
const FPS = 30;
const PAGES = ['system', 'reviews', 'gbp'];

(async () => {
  const out = path.resolve(process.argv[2] || 'ad-videos');
  const vs = process.argv[3] ? [process.argv[3]] : [...PAGES, ...Object.keys(VARIANTS)];
  const fs_ = process.argv[4] ? process.argv[4].split(',') : ['story', 'square'];
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const v of vs) for (const f of fs_) {
    const [w, h] = FORMATS[f];
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.addInitScript(([ad, w, h, feed]) => {
      window.AD = ad;
      document.addEventListener('DOMContentLoaded', () => {
        document.documentElement.style.setProperty('--w', w + 'px');
        document.documentElement.style.setProperty('--h', h + 'px');
        if (feed) document.body.classList.add('feed');
      });
    }, [VARIANTS[v] || {}, w, h, f !== 'story']);
    await page.goto('file://' + path.join(__dirname, PAGES.includes(v) ? `${v}.html` : 'ad.html'), { waitUntil: 'load' });
    // The GoFive logo at the top of every frame (inside the Stories safe area), hidden on the closing call.
    await page.evaluate(([feed]) => {
      const u = innerWidth / 1080;
      const el = document.createElement('div');
      el.id = 'toplogo';
      el.style.cssText = `position:fixed;z-index:50;left:0;right:0;top:${(feed ? 40 : 210) * u}px;display:flex;justify-content:center;align-items:center;gap:${16 * u}px;direction:ltr;pointer-events:none`;
      el.innerHTML = `<img src="${new URL('../../public/brand/gofive-mark.svg', location.href)}" style="width:${76 * u}px;height:${76 * u}px"><b style="font-family:Rubik,sans-serif;font-weight:700;font-size:${56 * u}px;color:#fff;letter-spacing:-.02em">GoFive</b>`;
      document.body.appendChild(el);
      // room for it: the scenes start below the logo
      const st = document.createElement('style');
      st.textContent = `.scene{padding-top:${(feed ? 130 : 320) * u}px !important}`;
      document.head.appendChild(st);
      const original = window.render;
      window.render = (t) => {
        original(t);
        const end = document.getElementById('cta') || document.getElementById('s5');
        el.style.opacity = end && end.style.display !== 'none' ? 0 : 1;
      };
    }, [f !== 'story']);
    if (f === 'square') await page.evaluate(() => document.body.classList.add('square'));
    await page.evaluate(() => document.fonts.ready);
    const frames = fs.mkdtempSync(path.join(out, `.frames-${v}-${f}-`));
    const total = await page.evaluate(() => window.TOTAL);
    for (let i = 0; i < total * FPS; i++) {
      await page.evaluate((t) => window.render(t), i / FPS);
      await page.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    }
    const file = path.join(out, `GoFive-ad-${v}-${{ story: '9x16', feed: '4x5', square: '1x1' }[f]}.mp4`);
    const music = process.env.MUSIC;
    const audio = music ? ['-i', music, '-filter_complex', `[1:a]atrim=0:${total},afade=t=in:d=0.4,afade=t=out:st=${total - 1.5}:d=1.5,volume=0.9[a]`, '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '192k'] : [];
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'), ...audio, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', '-t', String(total), file]);
    fs.rmSync(frames, { recursive: true, force: true });
    await page.close();
    console.log(file);
  }
  await browser.close();
})();
