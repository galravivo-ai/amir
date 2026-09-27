import { h, safeColor } from '../util.js';

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'לקוח/ה';

/** The framed page that lists approved testimonials. */
export function widgetPage({ business, testimonials }) {
  const color = safeColor(business.brand_color);
  const cards = testimonials
    .map(
      (t) => `<figure class="t">
        <div class="s" aria-label="${t.rating} מתוך 5">${'★'.repeat(t.rating)}${'☆'.repeat(5 - t.rating)}</div>
        <blockquote>${h(t.comment)}</blockquote>
        <figcaption>${h(firstName(t.customer_name))}</figcaption>
      </figure>`,
    )
    .join('');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${h(business.name)}</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#1f2330;background:transparent}
  .wrap{padding:4px}
  h2{font-size:1.05rem;margin:0 0 10px;color:${color}}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
  .t{margin:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px}
  .s{color:#f5a300;letter-spacing:2px}
  blockquote{margin:6px 0;line-height:1.5}
  figcaption{color:#6b7280;font-size:.85rem}
  .empty{color:#6b7280}
</style></head>
<body><div class="wrap">
  <h2>מה הלקוחות אומרים על ${h(business.name)}</h2>
  ${testimonials.length ? `<div class="grid">${cards}</div>` : '<p class="empty">עוד אין המלצות להצגה.</p>'}
</div>
<script>
  // Report the content height (not the viewport's), so resizing the frame can't feed back into itself.
  var wrap=document.querySelector('.wrap');
  function post(){parent.postMessage({type:'reviews-widget-height',height:Math.ceil(wrap.getBoundingClientRect().height)},'*')}
  if(window.ResizeObserver)new ResizeObserver(post).observe(wrap);else addEventListener('resize',post);
  addEventListener('load',post);
</script>
</body></html>`;
}

/** The loader businesses paste into their site: injects an auto-sizing iframe. */
export function widgetScript({ src, origin }) {
  return `(function(){
  var host=document.getElementById('reviews-widget');
  if(!host){host=document.createElement('div');var s=document.currentScript;s.parentNode.insertBefore(host,s);}
  var f=document.createElement('iframe');
  f.src=${JSON.stringify(src)};
  f.title='ביקורות לקוחות';
  f.loading='lazy';
  f.style.cssText='width:100%;border:0;height:320px;overflow:hidden';
  host.appendChild(f);
  window.addEventListener('message',function(e){
    if(e.origin!==${JSON.stringify(origin)}||e.source!==f.contentWindow)return;
    if(e.data&&e.data.type==='reviews-widget-height')f.style.height=e.data.height+'px';
  });
})();`;
}
