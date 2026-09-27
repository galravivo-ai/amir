import { h } from '../util.js';
import { publicPage } from './layout.js';

const FACES = ['😡', '😕', '😐', '🙂', '😍'];

export function ratingView({ campaign, business, t, src, invite }) {
  const buttons = [5, 4, 3, 2, 1]
    .map(
      (n) => `<button type="submit" name="rating" value="${n}" class="rate-btn">
        <span class="face" aria-hidden="true">${FACES[n - 1]}</span>
        <span class="stars" aria-hidden="true">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>
        <span class="rate-label">${h(t.rate_labels[n - 1])}</span>
      </button>`,
    )
    .join('');
  const greeting = invite?.customer_name ? `<p class="greet">${h(invite.customer_name)},</p>` : '';
  return publicPage({
    title: t.title,
    lang: campaign.lang,
    dir: t.dir,
    business,
    body: `${greeting}
      <h1>${h(t.title)}</h1>
      <p class="muted">${h(t.subtitle)}</p>
      <form method="post" action="/r/${h(campaign.slug)}/rate" class="rating-form">
        <input type="hidden" name="src" value="${h(src)}">
        <input type="hidden" name="i" value="${h(invite?.token || '')}">
        ${buttons}
      </form>`,
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
    lang: campaign.lang,
    dir: t.dir,
    business,
    body: `<div class="picked">${'★'.repeat(response.rating)}${'☆'.repeat(5 - response.rating)}</div>
      <h1>${h(negative ? t.q_negative : t.q_positive)}</h1>
      <form method="post" action="/f/${h(response.token)}" class="survey">
        ${questions.map((q) => questionField(q, t, values[`q_${q.id}`], errors[q.id])).join('')}
        <fieldset class="q"><legend>${h(t.comment_label)}</legend>
          <textarea name="comment" rows="3" maxlength="3000">${h(values.comment ?? '')}</textarea>
        </fieldset>
        ${contact}
        ${consent}
        <button class="btn primary big" type="submit">${h(negative ? t.send : t.next)}</button>
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
    body = `<div class="big-icon">🎉</div>
      <h1>${h(t.thanks_positive_title)}</h1>
      <p>${h(t.thanks_positive_body)}</p>
      <div class="review-links">
        ${links
          .map((l) =>
            l.google
              ? `<a class="btn primary big google" href="${go(l.key)}" rel="noopener">
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
      </div>`;
  } else {
    // Customers who were not satisfied still get access to the public review
    // links (Google policy forbids "review gating"); the private channel is
    // simply offered first.
    body = `<div class="big-icon">🤝</div>
      <h1>${h(t.thanks_negative_title)}</h1>
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
      }`;
  }
  return publicPage({ title: t.title, lang: campaign.lang, dir: t.dir, business, body });
}

export function messageView({ t, business, campaign, message }) {
  return publicPage({
    title: message,
    lang: campaign?.lang || 'he',
    dir: t?.dir || 'rtl',
    business,
    body: `<h1>${h(message)}</h1>`,
  });
}
