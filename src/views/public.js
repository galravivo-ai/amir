import { h } from '../util.js';
import { icon, starMark } from './icons.js';
import { publicPage } from './layout.js';

const stars = (n) => `${'★'.repeat(n)}${'☆'.repeat(5 - n)}`;

export function ratingView({ campaign, business, t, src, invite, staffCode = '' }) {
  const stars = [1, 2, 3, 4, 5]
    .map(
      (n) => `<button type="submit" name="rating" value="${n}" class="star-btn" data-label="${h(t.rate_labels[n - 1])}" aria-label="${n} · ${h(t.rate_labels[n - 1])}">${starMark(46)}<small>${n}</small></button>`,
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
    step: 1,
    body: `<form method="post" action="/r/${h(campaign.slug)}/rate" class="rating-form star-form">
        <input type="hidden" name="src" value="${h(src)}">
        <input type="hidden" name="i" value="${h(invite?.token || '')}">
        ${staffCode ? `<input type="hidden" name="e" value="${h(staffCode)}">` : ''}
        <div class="star-row">${stars}</div>
        <p class="star-label" aria-live="polite" data-hint="${h(t.rate_hint)}">${h(t.rate_hint)}</p>
      </form>
      <div class="trust-row">
        <span>${icon('clock', 16)} ${h(t.trust_time)}</span>
        <span>${icon('shield', 16)} ${h(t.trust_private.replace('{business}', business.name))}</span>
      </div>
      <script>
      (function(){var f=document.querySelector('.star-form'),l=f.querySelector('.star-label'),bs=f.querySelectorAll('.star-btn');
      function show(b){l.textContent=b?b.dataset.label:l.dataset.hint;l.classList.toggle('on',!!b)}
      bs.forEach(function(b){b.addEventListener('mouseenter',function(){show(b)});b.addEventListener('focus',function(){show(b)});
      b.addEventListener('click',function(e){if(f.dataset.sent)return e.preventDefault();e.preventDefault();f.dataset.sent=1;show(b);
      bs.forEach(function(x){x.classList.toggle('lit',+x.value<=+b.value)});f.classList.add('picked');
      setTimeout(function(){f.requestSubmit?f.requestSubmit(b):(function(){var i=document.createElement('input');i.type='hidden';i.name='rating';i.value=b.value;f.appendChild(i);f.submit()})()},380)})});
      f.querySelector('.star-row').addEventListener('mouseleave',function(){if(!f.dataset.sent)show(null)});})();
      </script>`,
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
        }><span>${icon('check', 14)}${h(o)}</span></label>`,
      )
      .join('')}</div>`;
  } else if (q.type === 'nps') {
    input = `<div class="nps">${Array.from({ length: 11 }, (_, n) => {
      return `<label class="nps-cell nps-${n <= 6 ? 'lo' : n <= 8 ? 'mid' : 'hi'}"><input type="radio" name="${name}" value="${n}" ${
        String(value) === String(n) ? 'checked' : ''
      }><span>${n}</span></label>`;
    }).join('')}</div>
    <div class="nps-legend"><span>${h(t.nps_low)}</span><span>${h(t.nps_high)}</span></div>`;
  } else {
    input = `<textarea name="${name}" rows="3" maxlength="2000">${h(value ?? '')}</textarea>`;
  }
  return `<fieldset class="q ${error ? 'has-error' : ''}"><legend>${h(q.label)}${req}</legend>${input}${err}</fieldset>`;
}

function staffField(staff, t, value) {
  if (!staff?.length) return '';
  return `<fieldset class="q"><legend>${h(t.staff_label)}</legend>
    <div class="chips">${staff
      .map(
        (s) => `<label class="chip"><input type="radio" name="staff" value="${s.id}" ${
          String(value) === String(s.id) ? 'checked' : ''
        }><span>${h(s.name)}</span></label>`,
      )
      .join('')}<label class="chip"><input type="radio" name="staff" value=""><span>${h(t.staff_unknown)}</span></label></div>
  </fieldset>`;
}

export function questionsView({ campaign, business, t, response, questions, values = {}, errors = {}, prefill = {}, staff = [] }) {
  const negative = response.sentiment === 'negative';
  const contact = negative
    ? `<fieldset class="q contact">
        <legend>${h(t.contact_title)}</legend>
        <p class="q-note">${icon('user', 16)} ${h(t.contact_note)}</p>
        <label>${h(t.name_label)}<input name="customer_name" maxlength="100" value="${h(values.customer_name ?? prefill.customer_name ?? '')}" autocomplete="name"></label>
        <div class="q-pair">
          <label>${h(t.phone_label)}<input name="phone" type="tel" maxlength="30" value="${h(values.phone ?? prefill.phone ?? '')}" autocomplete="tel" dir="ltr"></label>
          <label>${h(t.email_label)}<input name="email" type="email" maxlength="120" value="${h(values.email ?? '')}" autocomplete="email" dir="ltr"></label>
        </div>
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
    above: `<div class="picked" aria-label="${response.rating} / 5">${stars(response.rating)}<span>${h(t.rate_labels[response.rating - 1])}</span></div>`,
    lang: campaign.lang,
    dir: t.dir,
    business,
    step: 2,
    tone: negative ? 'calm' : '',
    body: `<form method="post" action="/f/${h(response.token)}" class="survey">
        ${staffField(staff, t, values.staff)}
        ${questions.map((q) => questionField(q, t, values[`q_${q.id}`], errors[q.id])).join('')}
        <fieldset class="q"><legend>${h(t.comment_label)}</legend>
          <textarea name="comment" rows="3" maxlength="3000" placeholder="${h(t.comment_placeholder)}">${h(values.comment ?? '')}</textarea>
        </fieldset>
        ${contact}
        ${consent}
        <div class="survey-submit"><button class="btn big" type="submit">${h(negative ? t.send : t.next)} <span aria-hidden="true">${t.dir === 'rtl' ? '←' : '→'}</span></button></div>
      </form>`,
  });
}

/** The public review links of a campaign: Google first, then the extra platforms. */
function reviewLinks(campaign, t) {
  const links = [];
  if (campaign.google_review_url) links.push({ key: 'google', label: t.google_button, google: true });
  campaign.extraLinks.forEach((l, i) => links.push({ key: String(i), label: l.label }));
  return links;
}

const GOOGLE_G = '<img src="/static/brands/google.svg" alt="" width="22" height="22">';

export function thanksView({ campaign, business, t, response }) {
  const links = reviewLinks(campaign, t);
  const go = (key) => `/go/${h(response.token)}/${h(key)}`;
  const positive = response.sentiment === 'positive';
  const google = links.find((l) => l.google);
  const others = links.filter((l) => !l.google);
  const comment = String(response.comment || '').trim();

  let body;
  if (positive) {
    const card = google
      ? `<div class="g-card">
          <div class="g-card-head">${GOOGLE_G}<span><b>Google</b><small>${h(t.g_review_on.replace('{business}', business.name))}</small></span></div>
          ${
            comment
              ? `<div class="g-quote"><small>${h(t.g_your_words)}</small><p>${h(comment)}</p>
                  <button type="button" class="g-copy" data-copy>${h(t.g_copy)}</button></div>`
              : ''
          }
          <a class="btn big g-btn" href="${go(google.key)}" rel="noopener"${comment ? ' data-copy' : ''}>${GOOGLE_G} ${h(google.label)}</a>
          <ol class="g-steps"><li>${h(t.g_step1)}</li><li>${h(t.g_step2)}</li><li>${h(comment ? t.g_step3_paste : t.g_step3)}</li></ol>
          <p class="g-toast" role="status" hidden>${icon('check', 16)} ${h(t.g_copied)}</p>
        </div>`
      : '';
    body = `<div class="thanks">
      <div class="thanks-icon">${icon('heart', 34)}</div>
      ${google ? `<p>${h(t.thanks_positive_body)}</p>` : ''}
      ${card}
      ${
        others.length
          ? `<div class="alt-wrap"><p class="muted">${h(google ? t.other_platforms : t.public_short)}</p>
              <div class="alt-links">${others.map((l) => `<a class="btn" href="${go(l.key)}" rel="noopener">${h(l.label)}</a>`).join('')}</div></div>`
          : ''
      }
    </div>
    ${
      comment
        ? `<script>
      (function(){var text=${JSON.stringify(comment).replace(/</g, '\\u003c')},toast=document.querySelector('.g-toast');
      function copy(){try{navigator.clipboard.writeText(text).then(function(){toast.hidden=false}).catch(function(){})}catch(e){}}
      document.querySelectorAll('[data-copy]').forEach(function(el){el.addEventListener('click',copy)});})();
      </script>`
        : ''
    }`;
  } else {
    const reachable = Boolean(response.wants_contact && (response.phone || response.email));
    // Unhappy customers can still reach the public review pages (Google's
    // policy forbids "review gating"); the private channel comes first.
    body = `<div class="thanks">
      <div class="thanks-icon">${icon('handshake', 34)}</div>
      <p>${h(t.thanks_negative_body)}</p>
      <div class="next-box">
        <b>${h(t.next_title)}</b>
        <ol class="next-steps">
          <li class="done">${icon('check', 14)}<span>${h(t.next_received)}</span></li>
          <li>${icon('user', 14)}<span>${h(t.next_read)}</span></li>
          ${reachable ? `<li>${icon('phone', 14)}<span>${h(t.next_contact)}</span></li>` : ''}
        </ol>
      </div>
      ${
        links.length
          ? `<p class="public-quiet">${h(t.public_short)} ${links
              .map((l) => `<a href="${go(l.key)}" rel="noopener">${h(l.google ? 'Google' : l.label)}</a>`)
              .join(' · ')}</p>`
          : ''
      }
    </div>`;
  }
  const heading = positive ? t.thanks_positive_title : t.thanks_negative_title;
  return publicPage({ title: heading, heading, lang: campaign.lang, dir: t.dir, business, body, step: 3, tone: positive ? 'happy' : 'calm' });
}

export function followupView({ campaign, business, t, response }) {
  return publicPage({
    title: t.followup_title,
    heading: t.followup_title,
    sub: t.followup_sub,
    lang: campaign.lang,
    dir: t.dir,
    business,
    body: `<form method="post" action="/c/${h(response.followup_token)}" class="followup">
        <button class="btn big dark" name="answer" value="yes">${icon('check', 22)} ${h(t.followup_yes)}</button>
        <button class="btn big" name="answer" value="no">${h(t.followup_no)}</button>
      </form>`,
  });
}

export function followupResultView({ campaign, business, t, response, yes, already = false }) {
  const links = [];
  if (campaign.google_review_url) links.push({ key: 'google', label: t.google_button });
  campaign.extraLinks.forEach((l, i) => links.push({ key: String(i), label: l.label }));
  const heading = already ? t.followup_done : yes ? t.followup_yes_title : t.followup_no_title;
  // Every customer can reach the public review links; nothing is gated on the answer.
  const reviewLinks = links.length
    ? `<div class="public-note"><p class="muted">${h(t.public_review_note)}</p>
        <div class="alt-links">${links
          .map((l) => `<a class="btn" href="/go/${h(response.token)}/${h(l.key)}" rel="noopener">${h(l.label)}</a>`)
          .join('')}</div></div>`
    : '';
  return publicPage({
    title: heading,
    heading,
    lang: campaign.lang,
    dir: t.dir,
    business,
    body: `<div class="thanks">
        <div class="thanks-icon">${icon(yes ? 'heart' : 'handshake', 34)}</div>
        ${already ? '' : `<p>${h(yes ? t.followup_yes_body : t.followup_no_body)}</p>`}
        ${reviewLinks}
      </div>`,
  });
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
