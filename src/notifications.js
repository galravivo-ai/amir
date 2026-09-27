import { emailButton, emailLayout } from './mailer.js';
import { sendWebhook } from './notify.js';
import { emailList, h, safeColor } from './util.js';

const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

/**
 * Every outgoing message (email + webhook) is composed here so the texts
 * stay consistent. `publicUrl` is used when there is no request (jobs).
 */
export function createNotifier({ store, mailer, publicUrl = () => process.env.PUBLIC_URL || 'http://localhost:3000' }) {
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
          body: `<p>היי ${h(user.name)}, ביקשת לאפס את הסיסמה.</p>
            ${emailButton(link, 'בחירת סיסמה חדשה')}
            <p style="color:#6b7280;font-size:13px">הקישור בתוקף לשעה. אם לא ביקשת, אפשר להתעלם מההודעה.</p>`,
        }),
      });
    },
  };
}
