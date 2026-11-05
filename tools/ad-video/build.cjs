// Builds the GoFive Facebook/Instagram ad videos from ad.html, frame by frame.
//   node tools/ad-video/build.cjs [outDir] [variant] [format]
// variant: general | restaurant | salon | garage (default: all)
// format: story (1080x1920, 9:16) | feed (1080x1350, 4:5) (default: both)
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
const FORMATS = { story: [1080, 1920], feed: [1080, 1350] };
const FPS = 30;

(async () => {
  const out = path.resolve(process.argv[2] || 'ad-videos');
  const vs = process.argv[3] ? [process.argv[3]] : Object.keys(VARIANTS);
  const fs_ = process.argv[4] ? [process.argv[4]] : Object.keys(FORMATS);
  fs.mkdirSync(out, { recursive: true });
  const html = 'file://' + path.join(__dirname, 'ad.html');
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
    }, [VARIANTS[v], w, h, f === 'feed']);
    await page.goto(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const frames = fs.mkdtempSync(path.join(out, `.frames-${v}-${f}-`));
    const total = await page.evaluate(() => window.TOTAL);
    for (let i = 0; i < total * FPS; i++) {
      await page.evaluate((t) => window.render(t), i / FPS);
      await page.screenshot({ path: path.join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
    }
    const file = path.join(out, `GoFive-ad-${v}-${f === 'story' ? '9x16' : '4x5'}.mp4`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', file]);
    fs.rmSync(frames, { recursive: true, force: true });
    await page.close();
    console.log(file);
  }
  await browser.close();
})();
