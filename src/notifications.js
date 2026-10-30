import { emailButton, emailLayout } from './mailer.js';
import { englishEmail, isEn, translateText } from './lang.js';
import { sendWebhook } from './notify.js';
import { CONNECT_COMPARE, CONNECT_GUIDE, FEATURE_GUIDES } from './guide.js';
import { emailList, h, safeColor } from './util.js';
import { PLANS } from './plans.js';

const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

/**
 * Every outgoing message (email + webhook) is composed here so the texts
 * stay consistent. `publicUrl` is used when there is no request (jobs).
 */
export function createNotifier({ store, mailer, pusher = null, publicUrl = () => process.env.PUBLIC_URL || 'http://localhost:3000', webhook = {} }) {
  const url = (path) => `${publicUrl().replace(/\/$/, '')}${path}`;

  // Email to someone who reads English goes out in English (the same message,
  // translated); everyone else, and mail to a business's customers, stays as written.
  async function send(msg) {
    const all = [].concat(msg.to).map((x) => String(x ?? '').trim()).filter(Boolean);
    const readsEnglish = (e) => {
      const user = store.userByEmail(e);
      return user ? user.lang === 'en' : isEn();
    };
    const en = all.filter(readsEnglish);
    if (!en.length) return mailer.send(msg);
    const he = all.filter((e) => !en.includes(e));
    const sent = he.length ? await mailer.send({ ...msg, to: he }) : true;
    const translated = await mailer.send({ ...english(msg), to: en });
    return sent && translated;
  }

  const english = (msg) => ({ ...msg, subject: translateText(h(msg.subject)).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'), html: msg.html && englishEmail(msg.html), text: msg.text && translateText(msg.text) });
  // Mail to a business's customers follows the campaign's language: English when the campaign is.
  const toCustomer = (msg, campaign) => mailer.send(campaign?.lang === 'en' ? english(msg) : msg);

  function recipients(business) {
    const custom = emailList(business.alert_emails);
    return custom.length ? custom : store.alertRecipients(business.id);
  }

  return {
    /** A customer finished the survey. */
    async feedbackCompleted({ business, campaign, response, data, questions }) {
      const negative = response.sentiment === 'negative';
      const adminUrl = url(`/admin/responses/${response.id}`);
      sendWebhook(business, negative ? 'feedback.negative' : 'feedback.positive', {
        campaign: { id: campaign.id, name: campaign.name },
        response: {
          id: response.id,
          rating: response.rating,
          sentiment: response.sentiment,
          source: response.source,
          question_labels: Object.fromEntries(questions.map((q) => [q.id, q.label])),
          ...data,
          admin_url: adminUrl,
        },
      }, webhook);
      if (!negative || !business.alert_negative) return;
      pusher
        ?.sendToBusiness(business.id, {
          title: `לקוח לא מרוצה (${response.rating}★) · ${campaign.name}`,
          body: data.comment ? data.comment.slice(0, 140) : 'לחצו לפרטים ולטיפול',
          url: `/admin/responses/${response.id}`,
          tag: `resp-${response.id}`,
        })
        .catch((err) => console.warn('[push]', err.message));

      const labels = Object.fromEntries(questions.map((q) => [q.id, q.label]));
      const answers = Object.entries(data.answers)
        .map(([k, v]) => `<li><b>${h(labels[k] || k)}:</b> ${h([].concat(v).join(', '))}</li>`)
        .join('');
      const color = safeColor(business.brand_color);
      await send({
        kind: 'negative_alert',
        businessId: business.id,
        to: recipients(business),
        subject: `לקוח לא מרוצה (${response.rating}★) · ${campaign.name}`,
        html: emailLayout({
          color,
          title: 'התקבל משוב מלקוח לא מרוצה',
          body: `<p style="font-size:20px;color:#f5a300">${stars(response.rating)}</p>
            <p><b>קמפיין:</b> ${h(campaign.name)}${response.source ? ` · ${h(response.source)}` : ''}</p>
            ${answers ? `<ul>${answers}</ul>` : ''}
            ${data.comment ? `<blockquote style="border-right:3px solid #ddd;margin:0;padding:4px 12px">${h(data.comment)}</blockquote>` : ''}
            <p><b>לקוח:</b> ${h(data.customer_name || '—')} · <span dir="ltr">${h(data.phone || '')}</span> ${h(data.email || '')}
            ${data.wants_contact ? '<br><b>ביקש שיחזרו אליו</b>' : ''}</p>
            ${emailButton(adminUrl, 'לטיפול בלקוח', color)}`,
          footer: `${h(business.name)} · אפשר לשנות את ההתראות בהגדרות העסק`,
        }),
      });
    },

    async slaOverdue(business, response) {
      const color = safeColor(business.brand_color);
      pusher
        ?.sendToBusiness(business.id, {
          title: `לקוח לא מרוצה מחכה יותר מ-${business.sla_hours} שעות`,
          body: `${response.customer_name || 'לקוח'}: ${response.comment || response.campaign_name}`.slice(0, 140),
          url: `/admin/responses/${response.id}`,
          tag: `sla-${response.id}`,
        })
        .catch((err) => console.warn('[push]', err.message));
      await send({
        kind: 'sla_alert',
        businessId: business.id,
        to: recipients(business),
        subject: `לקוח לא מרוצה מחכה יותר מ-${business.sla_hours} שעות · ${response.campaign_name}`,
        html: emailLayout({
          color,
          title: 'לקוח לא מרוצה עדיין מחכה שתחזרו אליו',
          body: `<p>${stars(response.rating)} · ${h(response.customer_name || 'לקוח')} · ${h(response.campaign_name)}</p>
            ${response.comment ? `<blockquote style="border-right:3px solid #ddd;margin:0;padding:4px 12px">${h(response.comment)}</blockquote>` : ''}
            ${emailButton(url(`/admin/responses/${response.id}`), 'לטיפול בלקוח', color)}`,
          footer: h(business.name),
        }),
      });
    },

    /** "Did we solve it?" email to the customer after a ticket is resolved. */
    async followUp({ business, response, link }) {
      const color = safeColor(business.brand_color);
      return toCustomer({
        kind: 'followup',
        businessId: business.id,
        to: response.email,
        subject: `${business.name}: האם הטיפול עזר?`,
        html: emailLayout({
          color,
          title: 'האם הטיפול בפנייה שלך עזר?',
          body: `<p>${response.customer_name ? `היי ${h(response.customer_name)},` : 'היי,'}</p>
            <p>פנית ל${h(business.name)} לאחרונה, וטיפלנו בזה. חשוב לנו לדעת אם הצלחנו.</p>
            ${emailButton(link, 'לתשובה בלחיצה אחת', color)}`,
          footer: h(business.name),
        }),
      }, store.campaignById(response.campaign_id));
    },

    /** The customer said the fix did not help: the ticket is open again. */
    /** A new Google review: a push for every one, an email when it is 3 stars or less. */
    async googleReview({ business, review }) {
      const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
      pusher
        ?.sendToBusiness(business.id, {
          title: `ביקורת חדשה בגוגל ${stars}`,
          body: `${review.reviewer || 'לקוח'}: ${review.comment || 'בלי טקסט'}`.slice(0, 140),
          url: `/admin/google/reviews/${review.id}`,
          tag: `g-${review.id}`,
        }, review.location_id)
        .catch((err) => console.warn('[push]', err.message));
      if (review.rating > 3) return false;
      const color = safeColor(business.brand_color);
      return send({
        kind: 'google_review',
        businessId: business.id,
        to: [...new Set([...recipients(business), ...store.branchRecipients(review.location_id)])],
        subject: `ביקורת ${review.rating}★ בגוגל · ${review.location_title || business.name}`,
        html: emailLayout({
          color,
          title: 'ביקורת חדשה בגוגל שכדאי לענות עליה',
          body: `<p style="font-size:20px;color:#f5a300">${stars}</p>
            <p><b>${h(review.reviewer || 'לקוח')}</b> · ${h(review.location_title || '')}</p>
            ${review.comment ? `<blockquote style="border-right:3px solid #ddd;margin:0;padding:4px 12px">${h(review.comment)}</blockquote>` : ''}
            <p>תשובה מהירה ומכבדת מראה לכל מי שקורא שאכפת לכם.</p>
            ${emailButton(url(`/admin/google/reviews/${review.id}`), 'לכתיבת תשובה', color)}`,
          footer: h(business.name),
        }),
      });
    },

    /** Something went down: the rating, the map rank or the AI visibility score. */
    async dropsAlert({ business, drops }) {
      const first = drops[0];
      pusher
        ?.sendToBusiness(business.id, { title: first.title, body: first.detail.slice(0, 140), url: first.href, tag: `drop-${first.kind}` })
        .catch((err) => console.warn('[push]', err.message));
      const color = safeColor(business.brand_color);
      return send({
        kind: 'drop_alert',
        businessId: business.id,
        to: recipients(business),
        subject: drops.length === 1 ? `${first.title} · ${business.name}` : `${drops.length} דברים ירדו השבוע · ${business.name}`,
        html: emailLayout({
          color,
          title: drops.length === 1 ? first.title : 'כמה דברים ירדו, כדאי להציץ',
          body: `${drops
            // With one drop, the title is already the heading above.
            .map((d) => `<p style="margin:0 0 14px">${drops.length > 1 ? `<b>${h(d.title)}</b><br>` : ''}${h(d.detail)}<br><a href="${h(url(d.href))}" style="color:${color}">לפרטים ←</a></p>`)
            .join('')}
            <p style="color:#6b7280;font-size:13px">ירידות קטנות קורות, ומה שחשוב הוא לתפוס אותן מוקדם. אפשר לכבות את ההתראות האלה בהגדרות העסק.</p>`,
          footer: h(business.name),
        }),
      });
    },

    async recoveryFailed(business, response) {
      const color = safeColor(business.brand_color);
      pusher
        ?.sendToBusiness(business.id, {
          title: 'הלקוח ענה שהטיפול לא עזר',
          body: `${response.customer_name || 'לקוח'} · הלקוח חזר לרשימת הלא מרוצים`,
          url: `/admin/responses/${response.id}`,
          tag: `resp-${response.id}`,
        })
        .catch((err) => console.warn('[push]', err.message));
      await send({
        kind: 'followup_no',
        businessId: business.id,
        to: recipients(business),
        subject: `הלקוח ענה שהטיפול לא עזר · הלקוח חזר לרשימת הלא מרוצים`,
        html: emailLayout({
          color,
          title: 'פנייה נפתחה מחדש',
          body: `<p>${h(response.customer_name || 'לקוח')} ענה שהטיפול בפנייה שלו לא עזר.</p>
            ${response.comment ? `<blockquote style="border-right:3px solid #ddd;margin:0;padding:4px 12px">${h(response.comment)}</blockquote>` : ''}
            ${emailButton(url(`/admin/responses/${response.id}`), 'לפנייה', color)}`,
          footer: h(business.name),
        }),
      });
    },

    async trialEnding(business, { amount = null } = {}) {
      // A trial with a saved card: say exactly what will be charged, and how to stop it.
      if (business.card_token) {
        return send({
          kind: 'trial_ending',
          businessId: business.id,
          to: recipients(business),
          subject: `תקופת הניסיון של ${business.name} מסתיימת מחר`,
          html: emailLayout({
            title: 'תקופת הניסיון מסתיימת מחר',
            brand: true,
            body: `<p>מחר מסתיימים ימי הניסיון של <b>${h(business.name)}</b>, והמנוי במסלול <b>${h(PLANS[business.plan]?.label || '')}</b> יתחיל.</p>
              <p>הכרטיס שמסתיים ב-<span dir="ltr">${h(business.card_last4 || '····')}</span> יחויב ב-<b>₪${amount?.toLocaleString('he-IL') ?? ''}</b> ${business.billing_cycle === 'annual' ? 'לשנה' : 'לחודש'} (כולל מע״מ), והחשבונית תישלח במייל.</p>
              <p>לא רוצים להמשיך? אפשר לבטל עד מחר בעמוד "התוכנית שלי", ולא תחויבו.</p>
              ${emailButton(url('/admin/plan'), 'לתוכנית שלי')}`,
          }),
        });
      }
      return send({
        kind: 'trial_ending',
        businessId: business.id,
        to: recipients(business),
        subject: `תקופת הניסיון של ${business.name} מסתיימת מחר`,
        html: emailLayout({
          title: 'תקופת הניסיון מסתיימת מחר',
          brand: true,
          body: `<p>מחר מסתיימת תקופת הניסיון של <b>${h(business.name)}</b>.</p>
            <p>כדי שהסקרים ימשיכו לעבוד בלי הפסקה, בחרו מסלול. הנתונים וההגדרות נשמרים כמו שהם.</p>
            ${emailButton(url('/admin/plan'), 'בחירת מסלול')}`,
        }),
      });
    },

    async trialEnded(business) {
      return send({
        kind: 'trial_ended',
        businessId: business.id,
        to: recipients(business),
        subject: `תקופת הניסיון של ${business.name} הסתיימה`,
        html: emailLayout({
          title: 'תקופת הניסיון הסתיימה',
          brand: true,
          body: `<p>הסקרים של <b>${h(business.name)}</b> מושהים עד שתבחרו מסלול. לקוח שסורק את ה-QR יראה שהסקר לא פעיל כרגע.</p>
            <p>כל הנתונים שמורים, ואפשר להמשיך להיכנס ולצפות בהם.</p>
            ${emailButton(url('/admin/plan'), 'בחירת מסלול')}`,
        }),
      });
    },

    /** Last month in numbers, with a link to the full (printable) report. */
    async monthlyReport({ business, range, report: r, summary = '' }) {
      const color = safeColor(business.brand_color);
      const row = (label, value) =>
        `<tr><td style="padding:6px 0;color:#6b7280">${h(label)}</td><td style="padding:6px 0;font-weight:bold">${value}</td></tr>`;
      const one = (v) => (v ? v.toFixed(1) : '—');
      return send({
        kind: 'monthly_report',
        businessId: business.id,
        to: recipients(business),
        subject: `הדוח החודשי של ${business.name} · ${range.label}`,
        html: emailLayout({
          color,
          title: `${range.label} ב${business.name}`,
          body: `${summary ? `<p style="background:#f5f3ff;padding:12px 14px;border-radius:10px;line-height:1.7">${h(summary).replace(/\n+/g, '<br>')}</p>` : ''}
            <table style="width:100%;border-collapse:collapse">
              ${row('הדירוג בגוגל', `${one(r.google.avg)} ★ (${r.google.total.toLocaleString('he-IL')} ביקורות)`)}
              ${row('ביקורות חדשות בגוגל', `${r.google.count} (בחודש הקודם ${r.googlePrev.count})`)}
              ${row('דירוגים בסקר', `${r.surveys.responses}${r.surveys.responses ? `, ממוצע ${one(r.surveys.avgRating)} ★` : ''}`)}
              ${row('לקוחות לא מרוצים', String(r.surveys.negative))}
              ${r.competitors.position ? row('מול המתחרים', `מקום ${r.competitors.position.rank} מתוך ${r.competitors.position.of}`) : ''}
              ${r.visibility ? row('נראות ב-AI', `הוזכרתם ב-${r.visibility.mentioned}% מהתשובות`) : ''}
            </table>
            ${
              r.branches?.length
                ? `<h3 style="margin:18px 0 6px">הסניפים</h3><table style="width:100%;border-collapse:collapse;font-size:14px">
                    <tr style="color:#6b7280"><td>סניף</td><td>דירוג</td><td>חדשות</td><td>ממתינות</td></tr>
                    ${r.branches
                      .map((b) => `<tr><td style="padding:5px 0;font-weight:bold">${h(b.title)}</td><td>${one(b.rating)} ★</td><td>${b.newReviews}</td><td>${b.unanswered}</td></tr>`)
                      .join('')}</table>`
                : ''
            }
            ${emailButton(url(`/admin/reports/monthly?month=${range.month}`), 'לדוח המלא (אפשר לשמור כ-PDF)', color)}`,
        }),
      });
    },

    /** A card renewal failed, the account was paused, or a cancelled plan ended. */
    async billingNotice({ business, kind, error = '' }) {
      const texts = {
        failed: ['החיוב החודשי לא עבר', `<p>ניסינו לחייב את הכרטיס של <b>${h(business.name)}</b> ולא הצלחנו${error ? ` (${h(error)})` : ''}. ננסה שוב מחר.</p>
          <p>כדי שהסקרים לא יושהו, אפשר לשלם עכשיו בכרטיס אחר.</p>`],
        paused: ['החשבון הושהה: החיוב לא עבר', `<p>אחרי כמה ניסיונות, לא הצלחנו לחייב את הכרטיס של <b>${h(business.name)}</b>, והסקרים הושהו. כל הנתונים שמורים.</p>
          <p>אחרי תשלום הכול חוזר לעבוד מיד.</p>`],
        trial_failed: ['תקופת הניסיון הסתיימה: החיוב לא עבר', `<p>תקופת הניסיון של <b>${h(business.name)}</b> הסתיימה, אבל החיוב הראשון בכרטיס לא עבר${error ? ` (${h(error)})` : ''}, והסקרים הושהו. כל הנתונים וההגדרות שמורים.</p>
          <p>אחרי תשלום בכרטיס אחר הכול חוזר לעבוד מיד.</p>`],
        ended: ['המנוי הסתיים', `<p>המנוי של <b>${h(business.name)}</b> הסתיים כמו שביקשתם, והסקרים הושהו. כל הנתונים שמורים, ואפשר לחדש בכל רגע.</p>`],
      };
      const [title, body] = texts[kind] || texts.failed;
      return send({
        kind: `billing_${kind}`,
        businessId: business.id,
        to: recipients(business),
        subject: `${title} · ${business.name}`,
        html: emailLayout({ title, brand: true, body: `${body}${emailButton(url('/admin/plan'), 'לעמוד התשלום')}` }),
      });
    },

    /** Someone asked for a quote on the website. */
    async leadReceived({ lead, kindLabel, admins }) {
      if (!admins.length) return false;
      return send({
        kind: 'lead',
        to: admins,
        subject: `פנייה חדשה מהאתר: ${kindLabel} · ${lead.company || lead.name}`,
        html: emailLayout({
          title: 'בקשה להצעת מחיר',
          brand: true,
          body: `<p><b>${h(kindLabel)}</b>${lead.size ? ` · ${h(lead.size)} סניפים / לקוחות` : ''}</p>
            <p>${h(lead.name)}${lead.company ? ` · ${h(lead.company)}` : ''}<br>
            <span dir="ltr">${h(lead.phone)}</span> ${h(lead.email)}</p>
            ${lead.marketing ? '<p style="color:#15803d">✓ אישר/ה קבלת דיוור פרסומי</p>' : ''}
            ${lead.message ? `<blockquote style="border-right:3px solid #ddd;margin:0;padding:4px 12px">${h(lead.message)}</blockquote>` : ''}
            ${emailButton(url('/superadmin#leads'), 'לכל הפניות')}`,
        }),
      });
    },

    /** A business asked for a plan: tell the people who activate plans. */
    async planRequested({ business, plan, cycle, user, admins, profiles = 1, amount = null }) {
      if (!admins.length) return false;
      return send({
        kind: 'plan_request',
        businessId: business.id,
        to: admins,
        subject: `בקשה למסלול ${plan.label} (${cycle}) · ${business.name}`,
        html: emailLayout({
          title: 'עסק ביקש מסלול',
          brand: true,
          body: `<p><b>${h(business.name)}</b> ביקש את מסלול <b>${h(plan.label)}</b>, תשלום ${h(cycle)}.</p>
            ${profiles > 1 && amount ? `<p><b>${profiles} פרופילים בגוגל</b>: הסכום לחיוב הוא <b>₪${amount.toLocaleString('he-IL')}</b> (הסניפים ב-20% הנחה), ולא המחיר של פרופיל אחד. כדאי לוודא שהוראת הקבע ב-iCount על הסכום הזה.</p>` : ''}
            <p>מבקש: ${h(user.name)} · <span dir="ltr">${h(user.email)}</span></p>
            ${emailButton(url('/superadmin#businesses'), 'להפעלה בניהול המערכת')}`,
        }),
      });
    },

    /** A business cancelled its subscription: the operator hears, with what to do (a refund on a yearly plan). */
    async subscriptionCancelled({ business, user, reason, until, cycle, refund = 0, admins, icount = false }) {
      if (!admins.length) return false;
      const annual = cycle === 'annual';
      return send({
        kind: 'subscription_cancelled',
        businessId: business.id,
        to: admins,
        subject: `ביטול מנוי${annual && refund ? ` שנתי (החזר ₪${refund})` : ''} · ${business.name}`,
        html: emailLayout({
          title: 'עסק ביטל את המנוי',
          brand: true,
          body: `<p><b>${h(business.name)}</b> ביטל את המנוי. הוא נשאר פעיל עד <b>${h(until || '—')}</b>, ולא יחויב יותר.</p>
            <p>מבטל: ${h(user.name)} · <span dir="ltr">${h(user.email)}</span></p>
            ${reason ? `<p>הסיבה: ${h(reason)}</p>` : ''}
            ${icount ? '<p><b>שולם בדף iCount: יש לבטל את הוראת הקבע ב-iCount.</b> החשבון ייסגר לבד בתאריך הזה.</p>' : ''}
            ${annual && refund ? `<p><b>מסלול שנתי: יש להחזיר ₪${refund.toLocaleString('he-IL')}</b> בקארדקום, בתוך 14 יום. החודשים שנוצלו חושבו לפי המחיר החודשי הרגיל, והגישה מסתיימת בסוף החודש הנוכחי.</p>` : ''}
            ${emailButton(url('/superadmin#businesses'), 'לניהול המערכת')}`,
        }),
      });
    },

    async weeklyReport(business, stats) {
      const color = safeColor(business.brand_color);
      const row = (label, value) =>
        `<tr><td style="padding:6px 0;color:#6b7280">${h(label)}</td><td style="padding:6px 0;font-weight:bold">${value}</td></tr>`;
      await send({
        kind: 'weekly_report',
        businessId: business.id,
        to: recipients(business),
        subject: `סיכום שבועי · ${business.name}`,
        html: emailLayout({
          color,
          title: `סיכום 7 הימים האחרונים`,
          body: `<table style="width:100%">
              ${row('סריקות', stats.scans)}
              ${row('דירוגים', stats.responses)}
              ${row('דירוג ממוצע', stats.avgRating ? stats.avgRating.toFixed(2) : '—')}
              ${row('לקוחות מרוצים', stats.positive)}
              ${row('לקוחות לא מרוצים', stats.negative)}
              ${row('קליקים לביקורת', stats.reviewClicks)}
              ${row('NPS', stats.nps ?? '—')}
              ${row('לקוחות לא מרוצים שמחכים', stats.openIssues)}
              ${row('פניות באיחור', stats.overdue)}
              ${stats.topStaff ? row('העובד/ת המוביל/ה', `${h(stats.topStaff.name)} (${stats.topStaff.avg_rating.toFixed(2)}★, ${stats.topStaff.responses} דירוגים)`) : ''}
            </table>
            ${emailButton(url('/admin?days=7'), 'ללוח הבקרה', color)}`,
          footer: `${h(business.name)} · אפשר לבטל את הדוח השבועי בהגדרות העסק`,
        }),
      });
    },

    /** Survey request sent to a customer by email. */
    async customerInvite({ business, campaign, invite, reminder = false }) {
      const color = safeColor(business.brand_color);
      const link = url(`/r/${campaign.slug}?i=${invite.token}`);
      const hello = invite.customer_name ? `היי ${h(invite.customer_name)},` : 'היי,';
      return toCustomer({
        kind: reminder ? 'customer_reminder' : 'customer_invite',
        businessId: business.id,
        to: invite.email,
        subject: reminder ? `תזכורת: איך היה ב${business.name}?` : `איך היה ב${business.name}?`,
        html: emailLayout({
          color,
          title: reminder ? 'עוד רגע אחד מזמנך?' : 'נשמח לשמוע ממך',
          body: `<p>${hello}</p>
            <p>תודה שבחרת ב${h(business.name)}. נשמח לדעת איך הייתה החוויה, זה לוקח פחות מדקה.</p>
            <p style="font-size:28px;letter-spacing:4px;color:#f5a300">★★★★★</p>
            ${emailButton(link, 'לדירוג', color)}`,
          footer: h(business.name),
        }),
      }, campaign);
    },

    /** A paying business went to pay for one more branch: the operator activates it once the payment arrives. */
    async branchRequested({ business, location, user, cycle, amount, total, admins }) {
      if (!admins.length) return false;
      const per = cycle === 'annual' ? 'לשנה' : 'לחודש';
      return send({
        kind: 'branch_request',
        businessId: business.id,
        to: admins,
        subject: `סניף נוסף ממתין לתשלום · ${business.name}`,
        html: emailLayout({
          title: 'סניף נוסף ממתין לתשלום',
          brand: true,
          body: `<p><b>${h(business.name)}</b> הוסיף סניף: <b>${h(location.title || location.address || 'סניף חדש')}</b>${location.address && location.title ? ` · ${h(location.address)}` : ''}.</p>
            <p>הסניף עלה לדף התשלום: <b>₪${amount.toLocaleString('he-IL')} ${per}</b> (20% הנחה). מעכשיו הסכום הכולל של העסק: <b>₪${total.toLocaleString('he-IL')} ${per}</b>, כולל מע״מ.</p>
            <p>כשהתשלום מגיע, מעדכנים את הוראת הקבע ב-iCount לסכום הכולל, ומפעילים את הסניף בלחיצה בניהול המערכת.</p>
            <p>מבקש: ${h(user.name)} · <span dir="ltr">${h(user.email)}</span></p>
            ${emailButton(url('/superadmin#branches'), 'להפעלת הסניף')}`,
        }),
      });
    },

    /** iCount reported a payment: opened on its own, or waiting for the operator. */
    async icountPayment({ admins, done, business = null, what = '', email = '', amount = null }) {
      if (!admins.length) return false;
      const sum = amount != null ? `₪${amount.toLocaleString('he-IL')}` : 'סכום לא ידוע';
      return send({
        kind: 'icount_payment',
        businessId: business?.id ?? null,
        to: admins,
        subject: done ? `תשלום התקבל והופעל · ${business.name}` : `תשלום ב-iCount שלא הופעל אוטומטית · ${sum}`,
        html: emailLayout({
          title: done ? 'תשלום התקבל, והמערכת הפעילה אותו' : 'תשלום התקבל, וצריך להפעיל ידנית',
          brand: true,
          body: done
            ? `<p><b>${h(business.name)}</b> שילם ${sum} ב-iCount, והמערכת הפעילה לבד: <b>${h(what)}</b>.</p>
              <p>אין צורך לעשות כלום.${what.includes('סניף') ? ' רק לוודא שהוראת הקבע ב-iCount על הסכום הכולל של העסק.' : ''}</p>`
            : `<p>iCount דיווח על תשלום של <b>${sum}</b>${email ? ` מ-<span dir="ltr">${h(email)}</span>` : ''}, אבל המערכת לא מצאה בקשה אחת שמתאימה בדיוק למייל ולסכום (למשל: שולם במייל אחר מזה של החשבון, או בסכום אחר).</p>
              <p>בודקים ב-iCount מי שילם, ומפעילים בניהול המערכת כמו קודם.</p>
              ${emailButton(url('/superadmin#icount'), 'לניהול המערכת')}`,
        }),
      });
    },

    /** A paid service the checks run on ran out (SerpApi's monthly searches): the operator hears, with what to do. */
    async serviceQuota({ admins, service, detail = '' }) {
      if (!admins.length) return false;
      return send({
        kind: 'service_quota',
        businessId: null,
        to: admins,
        subject: `${service}: נגמרו החיפושים החודשיים · הבדיקות עצרו`,
        html: emailLayout({
          title: `נגמרו החיפושים ב-${service}`,
          brand: true,
          body: `<p>שירות הבדיקות של המערכת הגיע למכסה החודשית שלו, ולכן עצרו עד שהמכסה תתחדש: בריאות הפרופיל, מיקום במפות, מתחרים, נראות ב-AI, ומעקב ביקורות לפי קישור.</p>
            <p>מה עושים: נכנסים ל-serpapi.com ← Dashboard, ומגדילים את החבילה או מחכים לחידוש החודשי. מיד אחרי זה הבדיקות חוזרות לרוץ לבד.</p>
            ${detail ? `<p class="muted" dir="ltr" style="text-align:left">${h(detail)}</p>` : ''}
            ${emailButton(url('/superadmin/status'), 'למצב המערכת')}`,
        }),
      });
    },

    /** The branch was paid for and opened. */
    async branchActivated({ business, location }) {
      const color = safeColor(business.brand_color);
      return send({
        kind: 'branch_active',
        businessId: business.id,
        to: recipients(business),
        subject: `הסניף ${location.title || ''} פעיל · ${business.name}`.replace(/\s+/g, ' '),
        html: emailLayout({
          color,
          title: 'הסניף החדש פעיל',
          body: `<p>התשלום התקבל, והסניף <b>${h(location.title || location.address)}</b> נפתח. הביקורות והנתונים שלו נטענים עכשיו, ותוך כמה דקות הם יופיעו בדשבורד ובעמוד רשת הסניפים.</p>
            ${emailButton(url('/admin/network'), 'לרשת הסניפים', color)}`,
          footer: h(business.name),
        }),
      });
    },

    async teamInvite({ business, inviter, email, role, link }) {
      return send({
        kind: 'team_invite',
        businessId: business.id,
        to: email,
        subject: `הוזמנת לנהל את ${business.name}`,
        html: emailLayout({
          title: 'הזמנה לצוות',
          body: `<p>${h(inviter.name)} הזמין/ה אותך להצטרף לניהול הביקורות של <b>${h(business.name)}</b> בתפקיד ${h(role)}.</p>
            ${emailButton(link, 'הצטרפות')}
            <p style="color:#6b7280;font-size:13px">הקישור בתוקף ל-7 ימים.</p>`,
        }),
      });
    },

    /**
     * The getting-started email: the connection to Google first (it brings all the data),
     * with the real screens, then a link to a short guide for each feature.
     * Sent on sign-up, and again from the system panel.
     */
    /**
     * During the trial, by the business's progress: a day in without Google
     * (connect), and on day 3 either what is already visible with the ways to
     * get reviews and climb in Maps, or a second, more helpful nudge to connect.
     * Replies go to the operator.
     */
    async trialNudge({ business, owner, kind, summary = null, daysLeft = null, replyTo = '' }) {
      const first = h(String(owner.name || '').split(' ')[0] || '');
      const hi = first ? `<p>היי ${first},</p>` : '';
      const help = '<p style="color:#6b7280;font-size:14px">נתקעתם? פשוט עונים למייל הזה, ונעזור לכם.</p>';
      const li = (title, text) => `<li style="margin:0 0 10px"><b>${title}</b><br><span style="color:#4b5563">${text}</span></li>`;
      const box = (value, label) => `<td style="padding:10px;border:1px solid #eee;text-align:center"><div style="font-size:22px;font-weight:bold">${value}</div><div style="color:#6b7280;font-size:13px">${label}</div></td>`;
      const mails = {
        connect: [
          `עוד צעד אחד ו-${business.name} מתחיל לעבוד`,
          'עוד צעד אחד: מחברים את פרופיל הגוגל',
          `${hi}<p>נרשמתם ל-GoFive, אבל פרופיל העסק בגוגל עוד לא מחובר. בלי החיבור המערכת לא רואה את הביקורות, הצפיות והשיחות של <b>${h(business.name)}</b>.</p>
            <p><b>זה לוקח דקה:</b></p>
            <ol style="padding-right:20px;line-height:1.8"><li>לוחצים על הכפתור למטה</li><li>בוחרים את חשבון הגוגל שמנהל את העסק ומאשרים</li><li>בוחרים את הסניף, וזהו. הנתונים נטענים לבד</li></ol>
            ${emailButton(url('/admin?connect=1'), 'לחיבור פרופיל הגוגל')}${help}`,
        ],
        connect_again: [
          `${business.name}: הנתונים מחכים לחיבור`,
          'עוד לא ראיתם את המערכת עובדת',
          `${hi}<p>עברו כמה ימים מתקופת הניסיון${daysLeft != null ? ` (נשארו ${daysLeft} ימים)` : ''}, והפרופיל של <b>${h(business.name)}</b> עדיין לא מחובר. חבל לבזבז את ימי הניסיון בלי לראות נתונים.</p>
            <p>אם אין לכם גישה לחשבון הגוגל של העסק, יש שתי דרכים:</p>
            <ul style="padding-right:20px;line-height:1.8"><li>מי שמנהל את הפרופיל מוסיף אתכם כמנהלים (בגוגל: "אנשים וגישה")</li><li>או מתחילים בינתיים במעקב לפי קישור: מדביקים את הקישור לעסק מגוגל מפות</li></ul>
            ${emailButton(url('/admin?connect=1'), 'לחיבור עכשיו')}
            <p style="color:#6b7280;font-size:14px">רוצים שנחבר יחד בטלפון? עונים למייל הזה עם מספר, ונתקשר.</p>`,
        ],
        progress: [
          `${business.name}: מה כבר רואים, ואיך מביאים עוד ביקורות`,
          'כמה ימים ב-GoFive',
          `${hi}${
            summary?.total
              ? `<p>ככה ${h(business.name)} נראה בגוגל כרגע:</p>
                <table style="width:100%;border-collapse:collapse;margin:8px 0 16px"><tr>${box(`${summary.avg.toFixed(1)}★`, 'דירוג בגוגל')}${box(summary.total.toLocaleString('he-IL'), 'ביקורות')}${box(summary.unanswered, 'מחכות לתשובה')}</tr></table>
                ${summary.unanswered ? `<p>יש <b>${summary.unanswered}</b> ביקורות בלי תשובה. עונים להן ישר מהמערכת, עם טיוטה מוכנה בלחיצה. <a href="${url('/admin/google/reviews?filter=unanswered')}">לביקורות</a></p>` : ''}`
              : `<p>הפרופיל של ${h(business.name)} מחובר, והנתונים כבר נאספים.</p>`
          }
            <h3 style="margin:22px 0 8px">איך מביאים עוד ביקורות? בוחרים מה שמתאים לעסק</h3>
            <ul style="padding-right:20px;margin:0">
              ${li('שלט QR בקופה או על השולחנות', 'מתאים לעסק שהלקוחות מגיעים אליו: מסעדה, חנות, מספרה. מעצבים ומדפיסים בדקה.')}
              ${li('קישור אישי בוואטסאפ, SMS או מייל', 'מתאים לשירות: קליניקה, משרד, בעל מקצוע. אחרי פגישה או עבודה שולחים ללקוח קישור קצר עם השם שלו.')}
              ${li('שליחה אוטומטית אחרי כל ביקור', 'בוואטסאפ או במייל, בלי לזכור לשלוח בכל פעם.')}
            </ul>
            <p style="color:#4b5563;font-size:14px">בכל הדרכים לקוח מרוצה מגיע לכתוב ביקורת בגוגל, ולקוח פחות מרוצה כותב ישירות אליכם.</p>
            ${emailButton(url('/admin/campaigns'), 'לבחירת דרך ושליחה')}
            <h3 style="margin:22px 0 8px">לעלות בגוגל מפות</h3>
            <p>כשמישהו באזור מחפש בגוגל מפות את מה שאתם עושים (למשל "מסעדה איטלקית" או "עורך דין"), באיזה מקום אתם מופיעים? ב<b>מיקום במפות</b> מגדירים חיפוש ורואים את המיקום בכל שכונה מול המתחרים, וב<b>בריאות הפרופיל</b> מקבלים רשימת תיקונים שעוזרים לעלות.</p>
            ${emailButton(url('/admin/maps#rank'), 'לבדיקת המיקום במפות')}
            ${daysLeft != null ? `<p style="color:#6b7280;font-size:14px">נשארו ${daysLeft} ימים לתקופת הניסיון. שאלות? עונים למייל הזה.</p>` : help}`,
        ],
      };
      const [subject, title, body] = mails[kind];
      return send({
        kind: `trial_${kind}`,
        businessId: business.id,
        to: owner.email,
        replyTo,
        subject,
        html: emailLayout({ title, brand: true, body }),
      });
    },

    async welcomeGuide({ user, business }) {
      const c = CONNECT_GUIDE;
      const cell = 'padding:8px 10px;border-bottom:1px solid #eee';
      const compare = `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0 4px">
        <tr><th style="${cell};text-align:right"></th><th style="${cell};color:#4b2bd6">חיבור מלא</th><th style="${cell};color:#6b7280">קישור בלבד</th></tr>
        ${CONNECT_COMPARE.map(([what, full, link]) => `<tr><td style="${cell}">${h(what)}</td><td style="${cell};text-align:center;color:${full ? '#15803d' : '#9ca3af'}">${full ? '✓' : '—'}</td><td style="${cell};text-align:center;color:${link ? '#15803d' : '#9ca3af'}">${link ? '✓' : '—'}</td></tr>`).join('')}
      </table>`;
      const steps = c.steps
        .map(
          (s, i) => `<div style="margin:24px 0 0;padding-top:18px;border-top:1px solid #eee">
          <p style="margin:0 0 6px;color:#4b2bd6;font-weight:700;font-size:13px">שלב ${i + 1}</p>
          <h3 style="margin:0 0 10px;font-size:18px;color:#17123a">${h(s.title)}</h3>
          <ul style="margin:0 0 14px;padding-inline-start:20px;color:#374151;line-height:1.7">${s.points.map((x) => `<li>${h(x)}</li>`).join('')}</ul>
          ${s.image ? `<img src="${h(url(`/static/media/guide/${s.image}`))}" alt="${h(s.alt)}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid #e5e7eb;border-radius:10px">` : ''}
          ${s.link ? emailButton(url(s.link), s.linkLabel) : ''}
        </div>`,
        )
        .join('');
      const features = FEATURE_GUIDES.map(
        (g) => `<li style="margin:0 0 6px"><a href="${h(url(`/guide/${g.slug}`))}" style="color:#4b2bd6;font-weight:600">${h(g.title)}</a> · <span style="color:#6b7280">${h(g.summary)}</span></li>`,
      ).join('');
      return send({
        kind: 'welcome_guide',
        businessId: business?.id,
        to: user.email,
        subject: 'ברוכים הבאים ל-GoFive: מתחילים בחיבור לגוגל',
        html: emailLayout({
          title: 'ברוכים הבאים ל-GoFive',
          brand: true,
          body: `<p>היי ${h(user.name)},</p>
            <p>שמחים שהצטרפת${business ? ` עם <b>${h(business.name)}</b>` : ''}. הצעד הראשון והחשוב ביותר: <b>חיבור מלא לחשבון הגוגל של העסק</b>. ${h(c.intro.split('. ').slice(1).join('. '))}</p>
            <h3 style="margin:22px 0 4px;font-size:17px;color:#17123a">למה חיבור מלא?</h3>
            ${compare}
            ${steps}
            <div style="margin:28px 0 0;padding:18px;background:#f5f3ff;border-radius:12px">
              <h3 style="margin:0 0 10px;font-size:17px;color:#17123a">מחוברים? מדריך קצר לכל פיצ׳ר</h3>
              <ul style="margin:0;padding-inline-start:18px;line-height:1.6">${features}</ul>
              ${emailButton(url('/guide'), 'לכל המדריכים')}
            </div>
            ${process.env.CONTACT_EMAIL ? `<p style="margin-top:24px;color:#6b7280;font-size:14px">שאלה? כתבו לנו ל-<a href="mailto:${h(process.env.CONTACT_EMAIL)}">${h(process.env.CONTACT_EMAIL)}</a> ונחזור אליכם.</p>` : ''}`,
        }),
      });
    },

    async passwordReset({ user, link }) {
      return send({
        kind: 'password_reset',
        to: user.email,
        subject: 'איפוס סיסמה',
        html: emailLayout({
          title: 'איפוס סיסמה',
          brand: true,
          body: `<p>היי ${h(user.name)}, ביקשת לאפס את הסיסמה.</p>
            ${emailButton(link, 'בחירת סיסמה חדשה')}
            <p style="color:#6b7280;font-size:13px">הקישור בתוקף לשעה. אם לא ביקשת, אפשר להתעלם מההודעה.</p>`,
        }),
      });
    },
  };
}
