import { emailButton, emailLayout } from './mailer.js';
import { sendWebhook } from './notify.js';
import { emailList, h, safeColor } from './util.js';

const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

/**
 * Every outgoing message (email + webhook) is composed here so the texts
 * stay consistent. `publicUrl` is used when there is no request (jobs).
 */
export function createNotifier({ store, mailer, pusher = null, publicUrl = () => process.env.PUBLIC_URL || 'http://localhost:3000' }) {
  const url = (path) => `${publicUrl().replace(/\/$/, '')}${path}`;

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
      });
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
      await mailer.send({
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
            ${emailButton(adminUrl, 'לטיפול בפנייה', color)}`,
          footer: `${h(business.name)} · אפשר לשנות את ההתראות בהגדרות העסק`,
        }),
      });
    },

    async slaOverdue(business, response) {
      const color = safeColor(business.brand_color);
      pusher
        ?.sendToBusiness(business.id, {
          title: `פנייה ממתינה יותר מ-${business.sla_hours} שעות`,
          body: `${response.customer_name || 'לקוח'}: ${response.comment || response.campaign_name}`.slice(0, 140),
          url: `/admin/responses/${response.id}`,
          tag: `sla-${response.id}`,
        })
        .catch((err) => console.warn('[push]', err.message));
      await mailer.send({
        kind: 'sla_alert',
        businessId: business.id,
        to: recipients(business),
        subject: `פנייה ממתינה יותר מ-${business.sla_hours} שעות · ${response.campaign_name}`,
        html: emailLayout({
          color,
          title: 'פנייה של לקוח לא מרוצה עדיין לא טופלה',
          body: `<p>${stars(response.rating)} · ${h(response.customer_name || 'לקוח')} · ${h(response.campaign_name)}</p>
            ${response.comment ? `<blockquote style="border-right:3px solid #ddd;margin:0;padding:4px 12px">${h(response.comment)}</blockquote>` : ''}
            ${emailButton(url(`/admin/responses/${response.id}`), 'לטיפול בפנייה', color)}`,
          footer: h(business.name),
        }),
      });
    },

    /** "Did we solve it?" email to the customer after a ticket is resolved. */
    async followUp({ business, response, link }) {
      const color = safeColor(business.brand_color);
      return mailer.send({
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
      });
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
        })
        .catch((err) => console.warn('[push]', err.message));
      if (review.rating > 3) return false;
      const color = safeColor(business.brand_color);
      return mailer.send({
        kind: 'google_review',
        businessId: business.id,
        to: recipients(business),
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

    async recoveryFailed(business, response) {
      const color = safeColor(business.brand_color);
      pusher
        ?.sendToBusiness(business.id, {
          title: 'הלקוח ענה שהטיפול לא עזר',
          body: `${response.customer_name || 'לקוח'} · הפנייה נפתחה מחדש`,
          url: `/admin/responses/${response.id}`,
          tag: `resp-${response.id}`,
        })
        .catch((err) => console.warn('[push]', err.message));
      await mailer.send({
        kind: 'followup_no',
        businessId: business.id,
        to: recipients(business),
        subject: `הלקוח ענה שהטיפול לא עזר · הפנייה נפתחה מחדש`,
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

    async trialEnding(business) {
      return mailer.send({
        kind: 'trial_ending',
        businessId: business.id,
        to: recipients(business),
        subject: `תקופת הניסיון של ${business.name} מסתיימת מחר`,
        html: emailLayout({
          title: 'תקופת הניסיון מסתיימת מחר',
          brand: true,
          body: `<p>מחר מסתיימים 7 ימי הניסיון של <b>${h(business.name)}</b>.</p>
            <p>כדי שהסקרים ימשיכו לעבוד בלי הפסקה, בחרו מסלול. הנתונים וההגדרות נשמרים כמו שהם.</p>
            ${emailButton(url('/admin/plan'), 'בחירת מסלול')}`,
        }),
      });
    },

    async trialEnded(business) {
      return mailer.send({
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

    /** Someone asked for a quote on the website. */
    async leadReceived({ lead, kindLabel, admins }) {
      if (!admins.length) return false;
      return mailer.send({
        kind: 'lead',
        to: admins,
        subject: `פנייה חדשה מהאתר: ${kindLabel} · ${lead.company || lead.name}`,
        html: emailLayout({
          title: 'בקשה להצעת מחיר',
          brand: true,
          body: `<p><b>${h(kindLabel)}</b>${lead.size ? ` · ${h(lead.size)} סניפים / לקוחות` : ''}</p>
            <p>${h(lead.name)}${lead.company ? ` · ${h(lead.company)}` : ''}<br>
            <span dir="ltr">${h(lead.phone)}</span> ${h(lead.email)}</p>
            ${lead.message ? `<blockquote style="border-right:3px solid #ddd;margin:0;padding:4px 12px">${h(lead.message)}</blockquote>` : ''}
            ${emailButton(url('/superadmin#leads'), 'לכל הפניות')}`,
        }),
      });
    },

    /** A business asked for a plan: tell the people who activate plans. */
    async planRequested({ business, plan, cycle, user, admins }) {
      if (!admins.length) return false;
      return mailer.send({
        kind: 'plan_request',
        businessId: business.id,
        to: admins,
        subject: `בקשה למסלול ${plan.label} (${cycle}) · ${business.name}`,
        html: emailLayout({
          title: 'עסק ביקש מסלול',
          brand: true,
          body: `<p><b>${h(business.name)}</b> ביקש את מסלול <b>${h(plan.label)}</b>, תשלום ${h(cycle)}.</p>
            <p>מבקש: ${h(user.name)} · <span dir="ltr">${h(user.email)}</span></p>
            ${emailButton(url('/superadmin#businesses'), 'להפעלה בניהול המערכת')}`,
        }),
      });
    },

    async weeklyReport(business, stats) {
      const color = safeColor(business.brand_color);
      const row = (label, value) =>
        `<tr><td style="padding:6px 0;color:#6b7280">${h(label)}</td><td style="padding:6px 0;font-weight:bold">${value}</td></tr>`;
      await mailer.send({
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
              ${row('פניות פתוחות', stats.openIssues)}
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
      return mailer.send({
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
      });
    },

    async teamInvite({ business, inviter, email, role, link }) {
      return mailer.send({
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

    async passwordReset({ user, link }) {
      return mailer.send({
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
