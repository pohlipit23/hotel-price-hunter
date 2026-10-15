/* THROWAWAY PROTOTYPE: three savings/category treatments on the existing booking
   page, selected with ?variant=ribbon|band|comparison. Preview server injection
   only; no production import, new API, permission or automatic stage transition. */
const variants = [
  { key: 'ribbon', label: 'A · Corner ribbon' },
  { key: 'band', label: 'B · Category band' },
  { key: 'comparison', label: 'C · Hotel / room comparison' },
];
const categories = {
  DEMO_EQUIVALENT: { kind: 'match', ribbon: 'Matching room', full: 'Same hotel · Matches your room', hotel: 'Same as your booking', room: 'Matches your booked room' },
  DEMO_DIFFERENT_ROOM: { kind: 'room', ribbon: 'New room', full: 'Same hotel · Different room', hotel: 'Same as your booking', room: 'Different room type' },
  DEMO_DIFFERENT_HOTEL: { kind: 'hotel', ribbon: 'New hotel', full: 'Different hotel', hotel: 'Different hotel', room: 'Review this hotel’s room' },
  DEMO_NON_REFUNDABLE: { kind: 'match', ribbon: 'Matching room', full: 'Same hotel · Matches your room', hotel: 'Same as your booking', room: 'Matches your booked room' },
};
const make = (tag, text, className) => {
  const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el;
};
let current = variants.findIndex(v => v.key === new URL(location.href).searchParams.get('variant'));
if (current < 0) current = 0;
const switcher = make('nav', null, 'prototype-switcher');
switcher.setAttribute('aria-label', 'Compare offer label designs');
const previous = make('button', '‹'), next = make('button', '›');
previous.type = next.type = 'button';
previous.setAttribute('aria-label', 'Previous label design'); next.setAttribute('aria-label', 'Next label design');
const caption = make('div'), description = make('p', 'Design preview · 3 options'), label = make('strong');
label.id = 'prototype-variant-label'; label.setAttribute('role', 'status');
caption.append(description, label); switcher.append(previous, caption, next); document.body.append(switcher);
function select(index) {
  current = (index + variants.length) % variants.length;
  const variant = variants[current]; document.body.dataset.offerVariant = variant.key;
  label.textContent = variant.label; const url = new URL(location.href); url.searchParams.set('variant', variant.key); history.replaceState(null, '', url);
}
previous.addEventListener('click', () => select(current - 1)); next.addEventListener('click', () => select(current + 1));
document.addEventListener('keydown', event => {
  if (event.target.closest('input,textarea,select,[contenteditable]') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault(); select(current + (event.key === 'ArrowLeft' ? -1 : 1));
});
function enhance() {
  for (const article of document.querySelectorAll('.offer[data-offer]')) {
    if (article.dataset.prototypeEnhanced) continue;
    const category = categories[article.dataset.offer], body = article.querySelector('.offer-body'), photo = article.querySelector('.stay-photo');
    if (!category || !body || !photo) continue;
    article.dataset.prototypeEnhanced = 'true'; article.dataset.categoryKind = category.kind;
    const wrapper = make('span', null, 'prototype-photo'); photo.replaceWith(wrapper); wrapper.append(photo, make('span', category.ribbon, 'prototype-ribbon'));
    const categoryLine = make('p', category.full, 'prototype-category');
    body.prepend(categoryLine);
    const band = make('div', category.full, 'prototype-band'); article.prepend(band);
    const facts = make('dl', null, 'prototype-facts');
    facts.append(make('dt', 'Hotel'), make('dd', category.hotel), make('dt', 'Room'), make('dd', category.room));
    body.querySelector('.room-subline').after(facts);
    const saving = body.querySelector('.offer-saving');
    if (!saving.classList.contains('unavailable')) saving.textContent = 'Save ' + saving.textContent;
    article.querySelector('[data-offer-id]')?.setAttribute('aria-label', 'Review saving: ' + saving.textContent + '. ' + category.full + '. ' + body.querySelector('h3').textContent);
  }
  const title = document.querySelector('#changes-title');
  if (title && title.textContent !== 'Compare your savings') title.textContent = 'Compare your savings';
  const heading = document.querySelector('.changehead');
  if (heading && !heading.querySelector('.prototype-savings-note')) heading.append(make('p', 'Potential refunds after fees, for the whole stay.', 'prototype-savings-note'));
}
select(current);
for (const id of ['offers', 'lower-rate-offer']) new MutationObserver(enhance).observe(document.getElementById(id), { childList: true, subtree: true });
enhance();
