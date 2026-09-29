# העלאה לאוויר

שתי דרכים. שתיהן נותנות HTTPS, גיבוי יומי אוטומטי והפעלה מחדש אוטומטית אם משהו נופל.

| | Railway | שרת משלכם (VPS) |
|---|---|---|
| קושי | הכי קל, הכול דרך האתר | צריך להתחבר לשרת בטרמינל פעם אחת |
| עלות משוערת | בערך 5$ לחודש | בערך 4-6$ לחודש (Hetzner, DigitalOcean) |
| עדכון גרסה | אוטומטי בכל push ל-GitHub | פקודה אחת |
| מתאים ל | להתחיל מהר | שליטה מלאה ועלות נמוכה לאורך זמן |

**ההמלצה: להתחיל ב-Railway.** תמיד אפשר לעבור לשרת משלכם אחר כך. הנתונים עוברים עם קובץ גיבוי אחד.

---

## אפשרות א: Railway

1. נכנסים ל-[railway.com](https://railway.com) ונרשמים עם חשבון ה-GitHub.
2. **New Project → Deploy from GitHub repo** ובוחרים את `amir`.
   Railway מזהה את ה-Dockerfile ואת `railway.json` לבד.
3. **חשוב: דיסק לנתונים.** בשירות שנוצר: **Settings → Volumes → Add Volume**, ובשדה Mount path כותבים `/app/data`.
   בלי זה, כל הנתונים נמחקים בכל עדכון.
4. **Variables**: מוסיפים את המשתנים (טבלה בהמשך). את `PUBLIC_URL` ממלאים אחרי השלב הבא.
5. **Settings → Networking → Generate Domain** נותן כתובת זמנית כמו `xxx.up.railway.app`.
   לדומיין משלכם: **Custom Domain**, ומוסיפים אצל ספק הדומיין את רשומת ה-CNAME ש-Railway מציג.
6. מעדכנים את `PUBLIC_URL` לכתובת הסופית (עם `https://`), ו-Railway מפעיל מחדש.
7. נכנסים לכתובת, נרשמים. **החשבון הראשון הוא מנהל המערכת.**

## אפשרות ב: שרת משלכם (VPS)

1. פותחים שרת Ubuntu (למשל Hetzner CX22 או DigitalOcean Basic, 1GB זיכרון מספיק).
2. אצל ספק הדומיין מוסיפים רשומת **A** שמצביעה לכתובת ה-IP של השרת (וגם ל-`www` אם רוצים).
3. מתחברים לשרת ומריצים:

   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/galravivo-ai/amir.git && cd amir   # ריפו פרטי? GitHub יבקש שם משתמש וטוקן (Settings → Developer settings → Personal access tokens)
   cp .env.example .env
   nano .env        # ממלאים DOMAIN ושאר המשתנים, שומרים עם Ctrl+O ו-Ctrl+X
   docker compose up -d --build
   ```

4. אחרי דקה-שתיים האתר עולה ב-`https://הדומיין-שלכם`. Caddy מוציא ומחדש את תעודת ה-HTTPS לבד.
5. נכנסים ונרשמים. **החשבון הראשון הוא מנהל המערכת.**

**דומיין פרטי לסוכנות:** הסוכנות מוסיפה אצל ספק הדומיין שלה רשומת **CNAME** (למשל `reviews.agency.co.il`) שמצביעה לדומיין שלכם. אתם רושמים את הדומיין בניהול המערכת ← סוכנויות. זהו: בכניסה הראשונה Caddy מוציא לדומיין תעודת HTTPS לבד. תעודה יוצאת רק לדומיין שרשום לסוכנות, כך שאי אפשר לנצל את השרת לדומיינים זרים.

**עדכון לגרסה חדשה:**
```bash
cd amir && git pull && docker compose up -d --build
```

**לוגים:** `docker compose logs -f app`

---

## משתני סביבה

| משתנה | חובה? | מה לשים |
|---|---|---|
| `PUBLIC_URL` | כן (ב-Railway) | הכתובת המלאה, למשל `https://reviews.co.il`. בשרת משלכם נקבע לבד מ-`DOMAIN` |
| `DOMAIN` | כן (בשרת משלכם) | הדומיין בלי `https://`, למשל `reviews.co.il` |
| `TRUST_PROXY` | כן (ב-Railway) | `1` |
| `SECURE_COOKIES` | כן (ב-Railway) | `true` |
| `OPERATOR_NAME` | מומלץ | השם שלכם או של החברה, מופיע בתנאי השימוש ובמדיניות הפרטיות |
| `CONTACT_EMAIL` | מומלץ | מייל ליצירת קשר ולבקשות פרטיות |
| `CONTACT_PHONE` | מומלץ | טלפון לפניות נגישות, מופיע בהצהרת הנגישות |
| `ACCESSIBILITY_COORDINATOR` | לא חובה | שם רכז הנגישות (ברירת מחדל: `OPERATOR_NAME`) |
| `BRAND_NAME` | לא | שם המוצר בדף הנחיתה |
| `SMTP_URL` | מומלץ מאוד | שרת מייל (ראו בהמשך). בלעדיו לא יוצאים מיילים |
| `MAIL_FROM` | עם SMTP | למשל `ביקורות <no-reply@reviews.co.il>` |
| `ANTHROPIC_API_KEY` | לא | מפעיל את עוזר ה-AI |
| `ALLOW_SIGNUP` | לא | `false` אם רוצים שרק אתם תפתחו חשבונות |

דומיין פרטי לסוכנות ב-Railway: מוסיפים אותו גם ב-Settings ← Networking ← Custom Domain, ו-Railway מוציא את התעודה.

ב-Railway לא צריך להגדיר `PORT`, `DB_FILE` או `BACKUP_DIR`. הם כבר מוגדרים נכון.

## מיילים (SMTP)

צריך ספק שליחה. **ב-Railway (וגם בחלק מהאחסונים האחרים) יציאה ב-SMTP חסומה**, ולכן שם משתמשים ב-Resend, שעובד ב-HTTPS:

- **Resend** (מומלץ): מוסיפים את הדומיין ב-resend.com, מאמתים אותו (כפתור Auto configure מול Cloudflare), יוצרים API Key עם הרשאת Sending, וכותבים:
  `RESEND_API_KEY=re_...`
  `MAIL_FROM=GoFive <no-reply@gofive.co.il>`
  (גם `SMTP_URL=smtps://resend:re_...@smtp.resend.com:465` עובד: המערכת מזהה את Resend ושולחת ב-HTTPS.)

אפשרויות נוספות, באחסון שמתיר SMTP:

- **Gmail** (הכי מהיר להתחלה, עד כ-500 מיילים ביום): מפעילים אימות דו-שלבי, יוצרים "סיסמת אפליקציה" בהגדרות החשבון של גוגל, וכותבים:
  `SMTP_URL=smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465`
  (ה-`@` בכתובת נכתב `%40`)
- **Brevo**: מתאים יותר כשיש הרבה עסקים. יש חבילה חינמית, והמיילים נשלחים מהדומיין שלכם ופחות נופלים לספאם. הם נותנים שם משתמש וסיסמת SMTP, בפורמט:
  `SMTP_URL=smtps://USER:PASSWORD@smtp-relay.brevo.com:465`

אחרי ההגדרה: בפאנל **ניהול מערכת** יש יומן מיילים עם סטטוס "נשלח" או "נכשל" לכל מייל. דרך קלה לבדוק: "שכחתי סיסמה" עם המייל שלכם.

## חיבור לגוגל (ביקורות מ-Google Business Profile)

פעם אחת, בחשבון גוגל של מפעיל המערכת:

1. **פרויקט:** ב-[console.cloud.google.com](https://console.cloud.google.com) יוצרים פרויקט חדש (למשל `GoFive`).
2. **הפעלת ה-APIs:** ב-APIs & Services, בוחרים Library ומפעילים שלושה:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API
3. **מסך הסכמה:** ב-OAuth consent screen בוחרים External, ממלאים שם (GoFive), מייל ולוגו, ומוסיפים את ה-scope `https://www.googleapis.com/auth/business.manage`. כל עוד האפליקציה במצב Testing, רק משתמשים שמוסיפים תחת Test users יכולים להתחבר (עד 100).
4. **OAuth Client:** ב-Credentials, בוחרים Create credentials ואז OAuth client ID מסוג Web application. ב-Authorized redirect URIs מוסיפים:
   `https://gofive.co.il/admin/google/callback`
5. **Railway:** מעתיקים את Client ID ו-Client Secret ל-Variables, בשמות `GOOGLE_CLIENT_ID` ו-`GOOGLE_CLIENT_SECRET`.
6. **בקשת גישה ל-API:** גוגל פותחת את ה-API של פרופיל העסק רק אחרי בקשה בטופס "GBP API access request", עם מספר הפרויקט. עד שהבקשה מאושרת, המכסה היא 0 והחיבור יחזיר שגיאה. האישור לוקח בדרך כלל כמה ימים.
7. **לפני שעסקים חיצוניים מתחברים:** שולחים את האפליקציה לאימות של גוגל (Publish app, ואחריו Verification). זה הכרחי כי ההרשאה לניהול ביקורות נחשבת רגישה.

בכל עסק: בתפריט בוחרים **ביקורות גוגל**, לוחצים "התחברות עם חשבון גוגל של העסק", ובוחרים אילו סניפים לעקוב אחריהם. הביקורות מתעדכנות כל חצי שעה. על כל ביקורת חדשה נשלחת התראה לטלפון, ועל ביקורת של 3 כוכבים ומטה גם מייל. עונים מתוך המערכת, עם טיוטה מה-AI.

## AI

נרשמים ב-[console.anthropic.com](https://console.anthropic.com), טוענים קרדיט, יוצרים API Key ומדביקים ב-`ANTHROPIC_API_KEY`.
העלות היא לפי שימוש: ניסוח תשובה אחת עולה בערך סנטים בודדים, וסיכום תובנות של כמה מאות משובים עולה יותר.
כדאי להגדיר תקרת הוצאה חודשית בקונסול של Anthropic.

## גיבויים

- השרת שומר **גיבוי אוטומטי פעם ביום**, 14 האחרונים, בתיקייה `backups` שליד מסד הנתונים.
- הגיבוי נמצא על אותו דיסק, כך שהוא מגן מטעויות אבל לא מקריסה של הדיסק עצמו. **פעם בשבוע כדאי להוריד עותק החוצה**:
  - בשרת משלכם: `scp root@IP:~/amir/data/backups/*.db .` מהמחשב שלכם, או להפעיל את הגיבוי האוטומטי של ספק השרת (ב-Hetzner זו תוספת של 20% למחיר).
  - ב-Railway: להפעיל את ה-Backups של ה-Volume בהגדרות.

**שחזור מגיבוי:** עוצרים את השרת, מחליפים את `data/reviews.db` בקובץ הגיבוי (ומוחקים את `reviews.db-wal` ו-`reviews.db-shm` אם קיימים), ומפעילים מחדש.

## בדיקה אחרי ההעלאה

- [ ] האתר נפתח ב-HTTPS, ודף הנחיתה מופיע
- [ ] נרשמתם, ובתפריט מופיע "ניהול מערכת"
- [ ] יצרתם קמפיין, וה-QR מוביל לכתובת האמיתית (לא localhost)
- [ ] סרקתם את ה-QR מהטלפון ודירגתם 1 כוכב. הגיע מייל התראה
- [ ] "שכחתי סיסמה" שולח מייל
- [ ] בדף הגדרות העסק העליתם לוגו, והוא מופיע בסקר
- [ ] בעוד יום יש קובץ ב-`data/backups`
