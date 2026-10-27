# אימות האפליקציה בגוגל (OAuth verification)

כל עוד גוגל לא אימתה את GoFive, מי שמתחבר רואה את המסך "Google לא אימתה את האפליקציה". הקובץ הזה מרכז את מה שצריך כדי להגיש את האימות: הטקסטים להדבקה ב-Google Cloud Console ותסריט לסרטון ההדגמה.

ההגשה עצמה: Google Cloud Console → **Google Auth Platform** (או APIs & Services → OAuth consent screen) → **Verification Center** → Submit for verification.

## לפני ההגשה (רשימת בדיקה)

- [ ] **Branding:** שם האפליקציה `GoFive`, לוגו 120×120: להוריד מ-`https://gofive.co.il/static/brand/gofive-logo-120.png`, מייל תמיכה.
- [ ] **App domain:**
  - Homepage `https://gofive.co.il`
  - Privacy `https://gofive.co.il/privacy`
  - Terms `https://gofive.co.il/terms`
- [ ] **Authorized domains:** `gofive.co.il`.
- [ ] **אימות הדומיין ב-Search Console:** לאמת את `gofive.co.il` עם אותו חשבון גוגל שמנהל את הפרויקט ב-Cloud. בלי זה ההגשה נתקעת.
- [ ] **Data Access (Scopes):** רק אלה:
  - `openid`
  - `.../auth/userinfo.email`
  - `.../auth/userinfo.profile`
  - `https://www.googleapis.com/auth/business.manage`
- [ ] **מדיניות הפרטיות:** כבר כוללת את סעיף ה-Limited Use של Google API Services User Data Policy, ואת ההסבר איך מנתקים ומבטלים הרשאה. אין צורך לשנות.
- [ ] **סרטון הדגמה:** ב-YouTube כ-Unlisted, לפי התסריט למטה.
- [ ] **גישה ל-Business Profile APIs:** אם עוד לא אושרה, מגישים בנפרד את טופס ה-GBP API access. זה תהליך נפרד מאימות ה-OAuth.

## טקסטים להדבקה (באנגלית, כמו שגוגל מבקשת)

### App description

> GoFive is a web app for small and medium businesses to manage their Google Business Profile in one place. After the owner connects their Google account, GoFive shows the profile's reviews and lets the owner reply to them, displays performance insights (views, calls, direction requests, search keywords), publishes posts to the profile, and gives a weekly plan for improving the profile's visibility on Google Maps. Businesses with several locations see all of them in one dashboard.

### Why the app needs `business.manage`

> GoFive uses the business.manage scope to call the Google Business Profile APIs on behalf of the business owner who connected their account:
>
> - My Business Account Management API and Business Information API: to list the accounts and locations the user manages, so they can choose which locations to connect.
> - Reviews (My Business API v4): to read the location's reviews and to post or update the owner's reply to a review. Replies are only published when the user clicks "Publish" in GoFive.
> - Business Profile Performance API: to show the owner their profile's views, calls, website clicks, direction requests and search keywords.
> - Local Posts: to publish a post to the profile when the user writes one in GoFive and clicks "Publish".
>
> There is no narrower scope that allows reading reviews, replying to reviews, reading performance metrics and publishing posts, so business.manage is the minimum scope for these features.

### How the data is used

> Data from Google APIs is used only to show the business owner their own profile and to perform the actions they request in the app. It is stored in our database so the dashboard and alerts work, and is deleted when the user disconnects Google in the app (which also revokes the token at Google) or deletes their account. We do not sell the data, do not use it for advertising, and do not use it to train AI models. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.

### `openid`, `email`, `profile`

> Used for "Sign in with Google" and to show which Google account is connected to the business.

## תסריט לסרטון ההדגמה (2–3 דקות)

גוגל בודקת בסרטון שלושה דברים:
1. מסך ההסכמה מציג את שם האפליקציה.
2. ב-URL של מסך ההסכמה רואים את ה-Client ID.
3. כל הרשאה שביקשנו מופיעה בשימוש בתוך המערכת.

**איך מצלמים:**
- מקליטים את כל המסך (OBS או ההקלטה המובנית ב-Mac/Windows), באנגלית: `https://gofive.co.il/en`.
- אפשר בלי קול. מוסיפים כיתוב קצר על המסך או בתיאור הסרטון.

**התסריט:**
1. **דף הבית.** פותחים את `gofive.co.il/en`, מראים את הדומיין בשורת הכתובת ונכנסים לחשבון.
2. **התחברות לגוגל.** בתפריט: Connect Google, ולוחצים "Sign in with the business's Google account".
3. **מסך ההסכמה.** כאן עוצרים:
   - לוחצים על שורת הכתובת ומגדילים אותה כך שרואים את `client_id=...` (אותו Client ID שמופיע בהגשה).
   - מראים את שם האפליקציה GoFive ואת ההרשאה "See, edit, create and delete your Google business listings".
   - ממשיכים ומאשרים.
4. **בחירת סניף.** מסמנים סניף ומחכים שהנתונים ייטענו.
5. **ביקורות (`business.manage`, קריאה).** נכנסים ל-Google reviews ומראים את הביקורות שנמשכו מהפרופיל.
6. **תשובה לביקורת (`business.manage`, כתיבה).** פותחים ביקורת, כותבים תשובה ולוחצים פרסום. אחר כך פותחים את הפרופיל ב-Google Maps ומראים שהתשובה עלתה.
7. **ביצועים.** בדשבורד: צפיות, שיחות, בקשות הגעה, ובדוח מילות החיפוש.
8. **פוסט.** Google posts → כותבים פוסט קצר → מפרסמים, ומראים אותו בפרופיל.
9. **ניתוק.** חוזרים ל-Connect Google ולוחצים Disconnect. אחר כך פותחים את `myaccount.google.com/permissions` ומראים ש-GoFive כבר לא ברשימה (ההרשאה מבוטלת אוטומטית).

**טיפים:**
- כדאי לצלם עם עסק אמיתי שאתה מנהל ולא עם הדמו, כי גוגל רוצה לראות קריאות אמיתיות ל-API.
- אם גוגל חוזרת עם שאלות, עונים באותו שרשור מייל. זה תהליך רגיל, ולוקח בדרך כלל כמה ימים עד כמה שבועות.
