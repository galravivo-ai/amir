// Texts shown to end customers on the public survey. Every key can be
// overridden per campaign from the admin panel (campaign.texts).
export const PUBLIC_TEXTS = {
  he: {
    dir: 'rtl',
    title: 'איך הייתה החוויה שלך?',
    subtitle: 'לוקח פחות מדקה, וזה עוזר לנו להשתפר',
    rate_labels: ['גרוע', 'לא טוב', 'בסדר', 'טוב', 'מצוין'],
    rate_hint: 'לחיצה על מספר, וזהו. 5 זה הכי טוב.',
    next: 'המשך',
    skip: 'דלג',
    send: 'שליחה',
    q_positive: 'שמחים לשמוע! עוד כמה שאלות קצרות',
    q_negative: 'מצטערים שזה לא היה מושלם. ספרו לנו מה קרה',
    comment_label: 'רוצים להוסיף משהו?',
    contact_title: 'נשמח לחזור אליכם ולתקן',
    name_label: 'שם',
    phone_label: 'טלפון',
    email_label: 'אימייל',
    wants_contact: 'אשמח שיחזרו אליי',
    thanks_positive_title: 'תודה רבה!',
    thanks_positive_body: 'אם יש לך רגע, ביקורת קצרה בגוגל עוזרת לנו מאוד ולעוד לקוחות למצוא אותנו.',
    google_button: 'כתיבת ביקורת בגוגל',
    other_platforms: 'או באחת מהפלטפורמות:',
    thanks_negative_title: 'תודה ששיתפת אותנו',
    thanks_negative_body: 'הפנייה הועברה ישירות להנהלה ונחזור אליך בהקדם.',
    public_review_note: 'תמיד אפשר גם לשתף את החוויה באופן פומבי:',
    inactive: 'הסקר הזה לא פעיל כרגע.',
    required: 'שדה חובה',
    nps_low: 'בכלל לא',
    nps_high: 'בהחלט',
    first_name_label: 'שם פרטי (לא חובה)',
    publish_consent: 'אפשר לפרסם את ההערה שלי באתר העסק, עם השם הפרטי בלבד',
  },
  en: {
    dir: 'ltr',
    title: 'How was your experience?',
    subtitle: 'It takes less than a minute and helps us improve',
    rate_labels: ['Terrible', 'Bad', 'OK', 'Good', 'Excellent'],
    rate_hint: 'Tap a number and you are done. 5 is the best.',
    next: 'Continue',
    skip: 'Skip',
    send: 'Send',
    q_positive: 'Glad to hear it! Just a few quick questions',
    q_negative: "Sorry it wasn't perfect. Tell us what happened",
    comment_label: 'Anything else to add?',
    contact_title: "We'd love to reach out and make it right",
    name_label: 'Name',
    phone_label: 'Phone',
    email_label: 'Email',
    wants_contact: 'Please contact me',
    thanks_positive_title: 'Thank you!',
    thanks_positive_body: 'If you have a moment, a short Google review helps us and helps other customers find us.',
    google_button: 'Write a Google review',
    other_platforms: 'Or on one of these platforms:',
    thanks_negative_title: 'Thanks for telling us',
    thanks_negative_body: 'Your feedback went straight to management and we will get back to you soon.',
    public_review_note: 'You are always welcome to share your experience publicly too:',
    inactive: 'This survey is not active right now.',
    required: 'Required',
    nps_low: 'Not at all',
    nps_high: 'Definitely',
    first_name_label: 'First name (optional)',
    publish_consent: 'You may publish my comment on the business website, with my first name only',
  },
};

export const EDITABLE_TEXT_KEYS = [
  'title',
  'subtitle',
  'q_positive',
  'q_negative',
  'thanks_positive_title',
  'thanks_positive_body',
  'thanks_negative_title',
  'thanks_negative_body',
];

export function textsFor(campaign) {
  const base = PUBLIC_TEXTS[campaign.lang] || PUBLIC_TEXTS.he;
  const overrides = campaign.textsObj || {};
  const out = { ...base };
  for (const key of EDITABLE_TEXT_KEYS) {
    if (typeof overrides[key] === 'string' && overrides[key].trim()) out[key] = overrides[key];
  }
  return out;
}
