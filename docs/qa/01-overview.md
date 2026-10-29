# GoFive: אפיון פונקציונלי ותרחישי בדיקה

**גרסה:** 1.0 · **תאריך:** 29.10.2026 · **מבוסס על:** המימוש בענף `main` (commit `3f6eb41`)

**מטרת המסמך:** Source of Truth ראשוני למערכת GoFive, לצורך QA פונקציונלי ידני. המסמך מתאר את ההתנהגות של המערכת כפי שהיא ממומשת היום, לא כפי שתוכננה.

## איך לקרוא את המסמך

| סימון | משמעות |
|---|---|
| **Implemented** | קיים בפועל ונבדק בקוד |
| **Partially Implemented** | קיים בחלקו (מפורט מה חסר) |
| **Planned / Not Implemented** | דובר או תוכנן, אבל לא קיים |
| **Needs Verification** | אי אפשר לקבוע מהקוד לבד (למשל תלוי בהגדרות השרת) |
| `FLOW-xxx` | מזהה תהליך, קבוע לאורך כל המסמך |
| `BR-xxx` | Business Rule (חוק עסקי) |
| `SCR-xxx` | מזהה מסך |
| `TS-xxx` / `DS-xxx` | תרחיש בדיקה / תרחיש Discovery |
| `OQ-xxx` | שאלה פתוחה |

**עובדה, הנחה, שאלה:** כל מה שכתוב בלי סימון הוא עובדה מהמימוש. הנחה מסומנת "הנחה:". דבר שלא ברור מסומן Needs Verification ומופיע גם בסעיף 16 (Open Questions).

**הגדרות שרת (Environment):** חלק מהיכולות פעילות רק כשהוגדר להן מפתח בשרת (Railway Variables). כשיכולת תלויה בזה, כתוב "**תלוי הגדרה**". בסביבת הייצור ידוע שמוגדרים: Google OAuth, SerpApi, Anthropic (AI), iCount. כל השאר Needs Verification (ראו OQ-001).

---

# חלק ראשון: אפיון פונקציונלי

## 1. System Overview

**מה GoFive עושה:** מערכת SaaS לעסקים קטנים ובינוניים בישראל, לניהול הנוכחות שלהם בגוגל וב-AI:
- **ביקורות:** מרכזת את ביקורות הגוגל של העסק, ומאפשרת לענות להן (ידנית, מתבנית, או בטיוטת AI) ולפרסם את התשובה ישירות בגוגל.
- **איסוף ביקורות:** סקר קצר ללקוחות (QR, קישור, וואטסאפ, מייל). לקוח מרוצה מופנה לכתוב ביקורת בגוגל. לקוח לא מרוצה משאיר משוב פרטי לעסק.
- **קידום:** בודקת את פרופיל הגוגל, את המיקום בגוגל מפות, את המתחרים ואת האזכורים בתשובות של עוזרי AI, ונותנת רשימת פעולות אחת ("מה לעשות") עם ציון התקדמות ו-AI שכותב תוכן.
- **דיווח:** דשבורד, דוח חודשי, תובנות AI, התראות.

**המשתמשים (Actors) שקיימים בפועל:**

| Actor | מי זה במערכת | הערה |
|---|---|---|
| VISITOR | מבקר באתר שלא מחובר | דף נחיתה, מדריכים, הרשמה, כניסה, דמו |
| BUSINESS OWNER | משתמש עם תפקיד **בעלים** (owner) בעסק | כל ההרשאות בעסק, כולל תשלום וצוות |
| MANAGER | משתמש עם תפקיד **מנהל** (manager) | עובד שוטף: עונה, יוצר קמפיינים, מריץ בדיקות. בלי תשלום, צוות והגדרות עסק |
| VIEWER | משתמש עם תפקיד **צפייה בלבד** (viewer) | צופה בלבד |
| BRANCH MANAGER | מנהל או צופה שהוגבל ל**סניף אחד** | לא תפקיד נפרד: שיוך של משתמש לסניף. רואה רק את הסניף שלו |
| NETWORK MANAGER | **לא קיים כתפקיד נפרד** | עסק עם 2+ סניפים מקבל עמוד "רשת הסניפים". מי שמנהל אותו הוא BUSINESS OWNER או MANAGER |
| AGENCY USER | איש צוות של סוכנות (משווק) | מנהל כמה עסקי-לקוח, עם מיתוג לבן (White Label) |
| GOFIVE ADMIN | מנהל מערכת (superadmin) | פאנל ניהול מערכת |
| CUSTOMER | הלקוח של העסק | ממלא סקר, מקבל בקשת דירוג, עונה "האם טיפלנו?" |
| SYSTEM | GoFive עצמה | תהליכי רקע, חישובים, התראות |
| GOOGLE | Google Business Profile, Google Sign-In | ביקורות, נתוני פרופיל, פרסום תשובות ופוסטים |
| AI SERVICE | Anthropic (Claude) | טיוטות, תובנות, תוכן, תיוג |
| EXTERNAL SERVICE | SerpApi, iCount, Cardcom, WhatsApp Cloud API, שירות מייל, OpenAI/Gemini/Perplexity, Web Push | ראו סעיף 10 |

**מה נעשה ידנית ומה אוטומטית:**

| מי | מה |
|---|---|
| משתמש (בעלים/מנהל) | מחבר את גוגל, עונה לביקורות, יוצר קמפיינים ושולח בקשות דירוג, מטפל במשוב, מסמן פעולות שבוצעו, מבקש טיוטות AI, מגדיר חיפושים, מתחרים ושאלות AI |
| מנהל מערכת | מפעיל מסלולים ידנית, יוצר קישורי התנסות, מנהל סוכנויות, מאפס נתונים, מפעיל תוספות, עוקב אחרי מצב השירותים |
| SYSTEM (אוטומטי) | סנכרון ביקורות (כל 30 דק'), נתוני פרופיל (יומי), בדיקת פרופיל ומיקום במפות (שבועי), נראות AI (שבועי), מתחרים (כל 72 שעות), התראות ירידה (יומי), תזכורות, דוחות במייל, חידושי מנוי, מיילי ניסיון, גיבוי יומי |

## 2. System Map

```
Public Website (אתר ציבורי)
├── Landing (he / en) → צפייה, טופס "דברו איתנו", בקשת הצעת מחיר
├── Guides → מדריך חיבור, מדריך לכל פיצ'ר
├── Legal → פרטיות, תנאי שימוש, עוגיות, נגישות
└── Demo → כניסה לחשבון דמו לצפייה בלבד

Account & Access (חשבון וגישה)
├── Registration → הרשמה במייל / בגוגל / דרך קישור התנסות
├── Login → סיסמה, גוגל, אימות דו-שלבי (2FA)
├── Password Reset → בקשה, קישור, סיסמה חדשה
├── My Account → פרטים, סיסמה, 2FA, שפה, דיוור, התראות לטלפון, עסקים
└── Team → הזמנה, תפקיד, שיוך לסניף, הסרה

Google Connection (חיבור לגוגל)
├── Full Connection (OAuth) → חיבור, בחירת סניפים, סנכרון, ניתוק
├── Follow by Link (SerpApi) → חיפוש עסק, הוספה, סנכרון
├── Branches → הפעלה/כיבוי, סניף בתשלום, מחיקה
└── Data Arrival → מה הגיע ומה בדרך

Dashboard (דשבורד)
├── Cover → תקופה, קמפיין, שליחה בוואטסאפ
├── 5 Stats → דירוג, ביקורות חדשות, מחכים לתשובה, פניות מגוגל, טופ 3 במפות
├── What To Do Now → דחוף + הצעד הבא + יעדי שלב 2
├── Getting Started (Onboarding) → 6 צעדים
└── All Data (מקופל) → נתוני פרופיל, גרפים, כוכבים, נושאים, סקרים

What To Do (מה לעשות / תוכנית קידום)
├── Urgent → לקוח לא מרוצה, ביקורות שמחכות, חיבור, קמפיין
├── Growth Plan → 4 מסלולים, 18 פעולות, ציון, סימון "בוצע"
├── AI Writer → 8 סוגי תוכן
├── Website Check → בדיקה אוטומטית של האתר
└── Stage 2 → יעדים מול האזור, שגרה שבועית, הרחבה

Customers & Reviews (לקוחות וביקורות)
├── Google Reviews → רשימה, סינון, תשובה, תבנית, טיוטת AI, פרסום
├── Survey Feedback → רשימה, טיפול, סטטוס, הערות, טיוטת AI, מעקב "טיפלנו?", CSV
├── Getting Reviews → קמפיינים, שלט QR, ווידג'ט (לשוניות)
│   ├── Campaign → יצירה, עריכה, שאלות, סף, קישורים, שפה
│   ├── Share → קישור, QR, בקשה במייל/וואטסאפ
│   └── Poster → תבנית, צבע, גודל, הדפסה
└── Google Posts → כתיבה, טיוטת AI, תמונה, כפתור, פרסום

Where You Stand (איפה אתם עומדים)
├── Maps → בריאות פרופיל, מיקום במפות (חיפושים), היסטוריה
├── AI Visibility → שאלות, הצעות AI, בדיקה, תוצאות, תוכנית
├── Competitors → חיפוש, הוספה, השוואה
└── Reports & Insights → דוח חודשי, תובנות AI (לשוניות)

Customer Journey (מסע הלקוח, ללא התחברות)
├── Survey → דירוג, שאלות, תודה, מעבר לגוגל
└── Close the Loop → "האם טיפלנו?"

Network & Agency
├── Network → השוואת סניפים, עמוד סניף, תבניות תשובה
└── Agency Panel → לקוחות, כניסה לחשבון לקוח, מיתוג

Billing (תשלום)
├── My Plan → מסלולים, מחזור, שימוש, תשלומים
├── Plan Change → הצעת מחיר, אישור
├── Payment → iCount (עמוד תשלום + IPN) / Cardcom (כרטיס)
├── Cancellation → סיבה, אישור, החזר
└── Trial / Pilot → ניסיון, קישור התנסות, צ'קליסט פיילוט

Settings (הגדרות עסק)
├── Branding → שם, לוגו, צבע
├── Notifications → התראות, דוחות, SLA, Webhook
├── Invite Message → נוסח בקשת הדירוג
├── Integrations (API) → מפתחות
└── Staff Ranking → עובדים, דירוג

GoFive Admin
├── Admin Panel → עסקים, מסלולים, איפוס, תוספות, קישורי התנסות, סוכנויות, פניות, משתמשים, תשלומי iCount
└── System Status → בדיקת שירותים, שימוש ועלויות
```

## 3. רשימת כל ה-Flows

| Flow ID | Flow Name | Main Actors | Module | סטטוס |
|---|---|---|---|---|
| FLOW-001 | הרשמה במייל | VISITOR, SYSTEM | Account | Implemented |
| FLOW-002 | הרשמה וכניסה עם גוגל | VISITOR, GOOGLE, SYSTEM | Account | Implemented |
| FLOW-003 | כניסה, אימות דו-שלבי ויציאה | USER, SYSTEM | Account | Implemented |
| FLOW-004 | איפוס סיסמה | USER, SYSTEM, EMAIL | Account | Implemented |
| FLOW-005 | ניהול החשבון האישי | USER | Account | Implemented |
| FLOW-006 | הזמנת צוות, הצטרפות ושיוך לסניף | BUSINESS OWNER, USER | Team | Implemented |
| FLOW-007 | ריבוי עסקים ומעבר בין עסקים | USER | Account | Implemented |
| FLOW-008 | חיבור מלא לגוגל (OAuth) ובחירת סניפים | OWNER/MANAGER, GOOGLE, SYSTEM | Google | Implemented |
| FLOW-009 | מעקב אחרי עסק לפי קישור (בלי חיבור) | OWNER/MANAGER, SerpApi, SYSTEM | Google | Implemented |
| FLOW-010 | הוספת סניף בתשלום | OWNER/MANAGER, GOFIVE ADMIN, iCount | Google / Billing | Implemented |
| FLOW-011 | סנכרון ידני, ניתוק ומחיקת סניף | OWNER/MANAGER, GOOGLE | Google | Implemented |
| FLOW-012 | דשבורד | USER, SYSTEM | Dashboard | Implemented |
| FLOW-013 | ביקורות גוגל ותשובה לביקורת | OWNER/MANAGER/BRANCH MANAGER, AI, GOOGLE | Reviews | Implemented |
| FLOW-014 | תבניות תשובה | OWNER/MANAGER | Reviews | Implemented |
| FLOW-015 | ביקורת חדשה: סנכרון והתראה | GOOGLE, SYSTEM | Reviews | Implemented |
| FLOW-016 | יצירה ועריכה של קמפיין | OWNER/MANAGER | Review Collection | Implemented |
| FLOW-017 | סקר הלקוח (דירוג → שאלות → תודה → גוגל) | CUSTOMER, SYSTEM | Review Collection | Implemented |
| FLOW-018 | בקשות דירוג: מייל, וואטסאפ ותזכורות | OWNER/MANAGER, CUSTOMER, SYSTEM | Review Collection | Implemented |
| FLOW-019 | עיצוב שלט QR | OWNER/MANAGER | Review Collection | Implemented |
| FLOW-020 | טיפול במשוב מהסקר וסגירת מעגל | OWNER/MANAGER, CUSTOMER, SYSTEM | Feedback | Implemented |
| FLOW-021 | ווידג'ט המלצות לאתר | OWNER/MANAGER, VISITOR | Review Collection | Partially Implemented |
| FLOW-022 | עובדים ודירוג עובדים | OWNER/MANAGER, CUSTOMER | Staff | Implemented |
| FLOW-023 | מה לעשות: פעולות, ציון ובדיקת אתר | OWNER/MANAGER, SYSTEM | Growth | Implemented |
| FLOW-024 | כתיבת תוכן עם AI | OWNER/MANAGER, AI | Growth | Implemented |
| FLOW-025 | שלב 2: להוביל באזור | OWNER/MANAGER, SYSTEM | Growth | Implemented |
| FLOW-026 | בדיקת בריאות פרופיל | OWNER/MANAGER, SerpApi, AI, SYSTEM | Maps | Implemented |
| FLOW-027 | מעקב מיקום במפות | OWNER/MANAGER, SerpApi, SYSTEM | Maps | Implemented |
| FLOW-028 | פוסטים בגוגל | OWNER/MANAGER, AI, GOOGLE | Google Content | Implemented |
| FLOW-029 | מתחרים | OWNER/MANAGER, SerpApi, SYSTEM | Where You Stand | Implemented |
| FLOW-030 | נראות ב-AI | OWNER/MANAGER, AI, SerpApi, SYSTEM | Where You Stand | Implemented |
| FLOW-031 | תובנות AI | OWNER/MANAGER, AI | Reports | Implemented |
| FLOW-032 | דוח חודשי ודוח שבועי | USER, SYSTEM, AI, EMAIL | Reports | Implemented |
| FLOW-033 | התראות על ירידה | SYSTEM, EMAIL, PUSH | Notifications | Implemented |
| FLOW-034 | התראות לטלפון והתקנה כאפליקציה | USER, SYSTEM | Notifications | Implemented |
| FLOW-035 | רשת סניפים ומשתמש מוגבל לסניף | OWNER, BRANCH MANAGER | Network | Implemented |
| FLOW-036 | פאנל סוכנות ומיתוג לבן | AGENCY USER, GOFIVE ADMIN | Agency | Implemented |
| FLOW-037 | בחירת מסלול ותשלום ב-iCount | OWNER, iCount, GOFIVE ADMIN, SYSTEM | Billing | Implemented |
| FLOW-038 | מנוי בכרטיס אשראי (Cardcom) | OWNER, Cardcom, SYSTEM | Billing | Implemented · **פעיל רק אם הוגדר** (OQ-002) |
| FLOW-039 | שינוי מסלול, ביטול וחידוש אוטומטי | OWNER, SYSTEM | Billing | Implemented |
| FLOW-040 | תקופת ניסיון ומיילי ניסיון | SYSTEM, EMAIL | Billing | Implemented |
| FLOW-041 | קישור התנסות חינם וצ'קליסט פיילוט | GOFIVE ADMIN, VISITOR, OWNER | Billing / Pilot | Implemented |
| FLOW-042 | הגדרות עסק | OWNER | Settings | Implemented |
| FLOW-043 | חיבורים (API ציבורי) | OWNER, EXTERNAL SYSTEM | Integrations | Implemented · תוספת בתשלום |
| FLOW-044 | פאנל מנהל מערכת | GOFIVE ADMIN | Admin | Implemented |
| FLOW-045 | עמוד מצב המערכת | GOFIVE ADMIN | Admin | Implemented |
| FLOW-046 | אתר ציבורי, פניות וחשבון דמו | VISITOR, GOFIVE ADMIN | Public Site | Implemented |
| FLOW-047 | שפות (ממשק וסקר) | USER, CUSTOMER | Localization | Implemented |
| FLOW-048 | תהליכי רקע (מרוכז) | SYSTEM | Background | Implemented |
