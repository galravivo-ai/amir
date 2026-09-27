import { h } from '../util.js';
import { icon, starMark } from './icons.js';
import { publicPage } from './layout.js';

const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

export function ratingView({ campaign, business, t, src, invite }) {
  const tiles = [1, 2, 3, 4, 5]
    .map(
      (n) => `<button type="submit" name="rating" value="${n}" class="rate-btn" aria-label="${n} · ${h(t.rate_labels[n - 1])}">
        ${n}<small>${h(t.rate_labels[n - 1])}</small>
      </button>`,
    )
    .join('');
  return publicPage({
    title: t.title,
    heading: t.title,
    sub: t.subtitle,
    above: invite?.customer_name ? `<p class="greet">${h(invite.customer_name)},</p>` : '',
    lang: campaign.lang,
    dir: t.dir,
    business,
    body: `<form method="post" action="/r/${h(campaign.slug)}/rate" class="rating-form">
        <input type="hidden" name="src" value="${h(src)}">
        <input type="hidden" name="i" value="${h(invite?.token || '')}">
        ${tiles}
      </form>
      <div class="rate-scale"><span>${h(t.rate_labels[0])}</span><span>${h(t.rate_labels[4])}</span></div>
      <div class="rate-hint">${starMark(24)}<span>${h(t.rate_hint)}</span></div>`,
  });
}

function questionField(q, t, value, error) {
  const name = `q_${q.id}`;
  const req = q.required ? ' <span class="req">*</span>' : '';
  const err = error ? `<div class="field-error">${h(t.required)}</div>` : '';
  let input = '';
  if (q.type === 'choice' || q.type === 'multi') {
    const type = q.type === 'choice' ? 'radio' : 'checkbox';
    const selected = new Set([].concat(value ?? []));
    input = `<div class="chips">${q.options
      .map(
        (o) => `<label class="chip"><input type="${type}" name="${name}" value="${h(o)}" ${
          selected.has(o) ? 'checked' : ''
        }><span>${h(o)}</span></label>`,
      )
      .join('')}</div>`;
  } else if (q.type === 'nps') {
    input = `<div class="nps">${Array.from({ length: 11 }, (_, n) => {
      return `<label class="nps-cell"><input type="radio" name="${name}" value="${n}" ${
        String(value) === String(n) ? 'checked' : ''
      }><span>${n}</span></label>`;
    }).join('')}</div>
    <div class="nps-legend"><span>${h(t.nps_low)}</span><span>${h(t.nps_high)}</span></div>`;
  } else {
    input = `<textarea name="${name}" rows="3" maxlength="2000">${h(value ?? '')}</textarea>`;
  }
  return `<fieldset class="q ${error ? 'has-error' : ''}"><legend>${h(q.label)}${req}</legend>${input}${err}</fieldset>`;
}

export function questionsView({ campaign, business, t, response, questions, values = {}, errors = {}, prefill = {} }) {
  const negative = response.sentiment === 'negative';
  const contact = negative
    ? `<fieldset class="q contact">
        <legend>${h(t.contact_title)}</legend>
        <label>${h(t.name_label)}<input name="customer_name" maxlength="100" value="${h(values.customer_name ?? prefill.customer_name ?? '')}" autocomplete="name"></label>
        <label>${h(t.phone_label)}<input name="phone" type="tel" maxlength="30" value="${h(values.phone ?? prefill.phone ?? '')}" autocomplete="tel"></label>
        <label>${h(t.email_label)}<input name="email" type="email" maxlength="120" value="${h(values.email ?? '')}" autocomplete="email"></label>
        <label class="check"><input type="checkbox" name="wants_contact" value="1" ${
          values.wants_contact === undefined || values.wants_contact ? 'checked' : ''
        }> ${h(t.wants_contact)}</label>
      </fieldset>`
    : '';
  const consent =
    !negative && campaign.ask_consent
      ? `<fieldset class="q consent">
          <label>${h(t.first_name_label)}<input name="customer_name" maxlength="40" value="${h(values.customer_name ?? prefill.customer_name ?? '')}" autocomplete="given-name"></label>
          <label class="check"><input type="checkbox" name="publish_consent" value="1" ${values.publish_consent ? 'checked' : ''}> ${h(t.publish_consent)}</label>
        </fieldset>`
      : '';
  return publicPage({
    title: t.title,
    heading: negative ? t.q_negative : t.q_positive,
    above: `<div class="picked" aria-label="${response.rating} / 5">${stars(response.rating)}</div>`,
    lang: campaign.lang,
    dir: t.dir,
    business,
    body: `<form method="post" action="/f/${h(response.token)}" class="survey">
        ${questions.map((q) => questionField(q, t, values[`q_${q.id}`], errors[q.id])).join('')}
        <fieldset class="q"><legend>${h(t.comment_label)}</legend>
          <textarea name="comment" rows="3" maxlength="3000">${h(values.comment ?? '')}</textarea>
        </fieldset>
        ${contact}
        ${consent}
        <button class="btn big" type="submit">${h(negative ? t.send : t.next)}</button>
      </form>`,
  });
}

export function thanksView({ campaign, business, t, response }) {
  const links = [];
  if (campaign.google_review_url) links.push({ key: 'google', label: t.google_button, google: true });
  campaign.extraLinks.forEach((l, i) => links.push({ key: String(i), label: l.label }));
  const go = (key) => `/go/${h(response.token)}/${h(key)}`;

  let body;
  if (response.sentiment === 'positive') {
    body = `<div class="thanks">
      <div class="thanks-icon">${icon('heart', 34)}</div>
      <p>${h(t.thanks_positive_body)}</p>
      <div class="review-links">
        ${links
          .map((l) =>
            l.google
              ? `<a class="btn big google" href="${go(l.key)}" rel="noopener">
                  <span class="g">G</span> ${h(l.label)}</a>`
              : '',
          )
          .join('')}
        ${
          links.some((l) => !l.google)
            ? `<p class="muted">${h(t.other_platforms)}</p>
               <div class="alt-links">${links
                 .filter((l) => !l.google)
                 .map((l) => `<a class="btn" href="${go(l.key)}" rel="noopener">${h(l.label)}</a>`)
                 .join('')}</div>`
            : ''
        }
      </div>
    </div>`;
  } else {
    // Customers who were not satisfied still get access to the public review
    // links (Google policy forbids "review gating"); the private channel is
    // simply offered first.
    body = `<div class="thanks">
      <div class="thanks-icon">${icon('handshake', 34)}</div>
      <p>${h(t.thanks_negative_body)}</p>
      ${
        links.length
          ? `<div class="public-note">
              <p class="muted">${h(t.public_review_note)}</p>
              <div class="alt-links">${links
                .map((l) => `<a class="btn" href="${go(l.key)}" rel="noopener">${h(l.label)}</a>`)
                .join('')}</div>
            </div>`
          : ''
      }
    </div>`;
  }
  const heading = response.sentiment === 'positive' ? t.thanks_positive_title : t.thanks_negative_title;
  return publicPage({ title: heading, heading, lang: campaign.lang, dir: t.dir, business, body });
}

export function messageView({ t, business, campaign, message }) {
  return publicPage({
    title: message,
    lang: campaign?.lang || 'he',
    dir: t?.dir || 'rtl',
    business,
    heading: message,
    body: '',
  });
}
