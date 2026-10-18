const $ = id => document.getElementById(id);
let state; let selected; let busy = false;
let adviceGeneration = 0; let adviceController;
const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
const money = amount => new Intl.NumberFormat('en-GB', { style: 'currency', currency: amount.currency, currencyDisplay: 'code' })
  .format(amount.totalMinor / 10 ** new Intl.NumberFormat('en', { style: 'currency', currency: amount.currency }).resolvedOptions().maximumFractionDigits);
const sourceMoney = price => `${price.currency} ${price.amount}`;
const day = date => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));
const terms = option => option.freeCancellation === true ? 'Free cancellation flag · verify full terms' : option.freeCancellation === false ? 'Non-refundable option' : 'Cancellation terms unverified';
function show(screen, push = true) {
  if (screen !== 'review') resetAdvice();
  for (const key of ['options', 'review', 'confirmed']) $(`quote-${key}-screen`).hidden = key !== screen;
  const step = ['options', 'review', 'confirmed'].indexOf(screen);
  [...$('quote-steps').children].forEach((item, index) => { item.removeAttribute('aria-current'); item.classList.toggle('passed', index < step); if (index === step) item.setAttribute('aria-current', 'step'); });
  if (push) history.pushState({ screen, optionId: selected?.optionId }, '', '/');
  $(screen === 'options' ? 'options-heading' : `${screen}-heading`).focus();
}
function facts(option, target) {
  const heading = node('h3', option.roomName, 'quote-selected-name'); const list = node('dl', undefined, 'quote-facts');
  for (const [label, value] of [['Hotel', state.baseline.hotel.name], ['Dates', `${day(state.baseline.stay.checkin)} – ${day(state.baseline.stay.checkout)}`],
    ['Meals', option.board], ['Source rate', sourceMoney(option.sourcePrice)], ['Converted estimate', money(option.estimate)], ['Cancellation', terms(option)]]) {
    list.append(node('dt', label), node('dd', value));
  }
  target.replaceChildren(heading, list);
}
function review(option, push = true) {
  resetAdvice();
  selected = option; $('quote-demo-consent').checked = false; $('quote-flexibility-consent').checked = false;
  $('quote-review-error').textContent = ''; $('quote-flexibility-label').hidden = option.freeCancellation === true;
  facts(option, $('quote-review-facts')); show('review', push);
}
function resetAdvice() {
  adviceGeneration++; adviceController?.abort(); adviceController = undefined;
  $('quote-advice-answer').replaceChildren(); $('quote-advice-answer').hidden = true;
  $('quote-advice-question').value = '';
  $('quote-ask-gemini').disabled = !state?.model?.available;
  $('quote-ask-gemini').removeAttribute('aria-busy');
  $('quote-advice-status').textContent = state?.model?.available
    ? 'Ask a question to get advice for this selected room.' : 'Gemini advice is unavailable. You can still review and select a room.';
}
for (const button of document.querySelectorAll('[data-advice-question]')) button.addEventListener('click', () => {
  $('quote-advice-question').value = button.dataset.adviceQuestion; $('quote-advice-question').focus();
});
$('quote-advice-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selected || adviceController || !state.model?.available) return;
  const message = $('quote-advice-question').value.trim();
  if (!message) return;
  const generation = ++adviceGeneration; const optionId = selected.optionId; const snapshotVersion = state.snapshotVersion;
  const controller = new AbortController(); adviceController = controller;
  const timeout = setTimeout(() => controller.abort(), 25000);
  $('quote-ask-gemini').disabled = true; $('quote-ask-gemini').setAttribute('aria-busy', 'true');
  $('quote-advice-answer').hidden = true; $('quote-advice-status').textContent = 'Gemini is comparing this room with your quotation…';
  try {
    const response = await fetch('/api/quotation-demo/advice', { method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify({ optionId, snapshotVersion, message }) });
    if (generation !== adviceGeneration) return;
    if (!response.ok) {
      $('quote-advice-status').textContent = response.status === 429 ? 'Please wait a minute before asking again. Your room choice is unchanged.'
        : response.status === 401 || response.status === 409 ? 'Reload the options before asking about this comparison again.'
          : 'Gemini could not answer. Your room choice is unchanged; you can try again.';
      return;
    }
    const result = await response.json();
    if (generation !== adviceGeneration || selected?.optionId !== result.optionId || result.snapshotVersion !== state.snapshotVersion) return;
    const advice = result.advice; const list = node('ul');
    for (const tradeoff of advice.tradeoffs) list.append(node('li', tradeoff));
    const priorities = { price: 'Price', flexibility: 'Flexibility', 'room-details': 'Room details', balanced: 'Balanced comparison' };
    $('quote-advice-answer').replaceChildren(node('p', advice.summary, 'quote-advice-summary'), node('p', `Your priority: ${priorities[advice.priority]}`, 'small muted'), list,
      node('p', advice.priceContext, 'small'), node('p', advice.limitations, 'small muted'));
    $('quote-advice-answer').hidden = false;
    $('quote-advice-status').textContent = result.source === 'test-injected' ? 'Test response · no live Gemini call' : 'Advice from Gemini · Google Vertex AI';
  } catch {
    if (generation === adviceGeneration) $('quote-advice-status').textContent = 'Gemini could not answer. Your room choice is unchanged; you can try again.';
  } finally {
    clearTimeout(timeout);
    if (generation === adviceGeneration) { adviceController = undefined; $('quote-ask-gemini').disabled = false; $('quote-ask-gemini').removeAttribute('aria-busy'); }
  }
});
function confirmed(confirmation, push = true) {
  selected = state.options.find(option => option.optionId === confirmation.optionId);
  if (!selected) return;
  facts(selected, $('quote-confirmed-facts')); show('confirmed', push);
}
function render() {
  const b = state.baseline;
  $('quote-reference').textContent = `Starting quotation · ${b.quotationCode}`;
  $('quote-hotel').textContent = b.hotel.name;
  $('quote-stay').textContent = `${day(b.stay.checkin)} – ${day(b.stay.checkout)} · ${b.occupancy.adults} adults${b.occupancy.childAges.length ? ` · ${b.occupancy.childAges.length} children` : ''}`;
  $('quote-room').textContent = `${b.room.name} · ${b.room.board}`; $('quote-price').textContent = money(b.quotedRetail);
  $('quote-fx').textContent = `Estimates use the quotation's saved exchange rate: 1 ${b.fx.from} = ${b.fx.rate} ${b.fx.to}. Final retail pricing, discounts and fees have not been applied.`;
  $('quote-capture').textContent = `Source snapshot captured ${new Date(state.checkedAt).toLocaleString()}. These are observed options, not proof of all available rates.`;
  $('quote-options').replaceChildren(...state.options.map((option, index) => {
    const article = node('article', undefined, 'quote-option'); const photo = node('div', undefined, 'quote-photo');
    const image = node('img'); image.src = '/assets/illustrative-stays.jpg'; image.alt = ''; photo.append(image, node('span', 'Illustrative photo'));
    const body = node('div', undefined, 'quote-option-body'); const badge = node('span', terms(option), `quote-terms${option.freeCancellation === true ? ' refundable' : ''}`);
    const price = node('div', undefined, 'quote-option-price'); price.append(node('strong', money(option.estimate)), node('span', 'Converted source estimate · whole stay'), node('span', `Gateway rate ${sourceMoney(option.sourcePrice)}`));
    body.append(node('p', `Option ${index + 1}`, 'eyebrow'), node('h3', option.roomName), node('p', option.board, 'quote-board'), badge, price);
    const difference = option.indicativeDifferenceMinor;
    body.append(node('p', `${money({ currency: b.quotedRetail.currency, totalMinor: Math.abs(difference) })} ${difference >= 0 ? 'below' : 'above'} the quotation · before final pricing`, 'quote-difference'));
    const button = node('button', 'Review this room'); button.type = 'button'; button.setAttribute('aria-label', `Review ${option.roomName}`); button.addEventListener('click', () => review(option));
    body.append(button); article.append(photo, body); return article;
  }));
  $('quote-empty').hidden = state.options.length > 0;
  $('quote-content').hidden = false; $('quote-status').textContent = '';
  if (state.confirmation) confirmed(state.confirmation, false);
}
$('quote-back').addEventListener('click', () => show('options'));
$('quote-restart').addEventListener('click', () => show('options'));
$('quote-confirm').addEventListener('click', async () => {
  if (busy || !selected) return;
  const acknowledged = $('quote-demo-consent').checked;
  const reduced = selected.freeCancellation !== true;
  if (!acknowledged || (reduced && !$('quote-flexibility-consent').checked)) { $('quote-review-error').textContent = 'Please review and confirm the acknowledgements above.'; return; }
  busy = true; $('quote-confirm').disabled = true; $('quote-confirm').setAttribute('aria-busy', 'true'); $('quote-review-error').textContent = '';
  try {
    const response = await fetch('/api/quotation-demo/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken },
      body: JSON.stringify({ optionId: selected.optionId, snapshotVersion: state.snapshotVersion, acceptedDemoOnly: true, ...(reduced ? { acceptReducedFlexibility: true } : {}) }) });
    if (!response.ok) throw Error();
    const result = await response.json(); state.confirmation = result.confirmation; confirmed(result.confirmation);
  } catch { $('quote-review-error').textContent = 'The demo selection could not be confirmed. Reload and review the current options, then try again.'; }
  finally { busy = false; $('quote-confirm').disabled = false; $('quote-confirm').removeAttribute('aria-busy'); }
});
addEventListener('popstate', event => {
  const target = event.state?.screen ?? 'options';
  if (target === 'confirmed' && state.confirmation) return confirmed(state.confirmation, false);
  if (target === 'review') { selected = state.options.find(option => option.optionId === event.state.optionId); if (selected) return review(selected, false); }
  show('options', false);
});
try { const response = await fetch('/api/quotation-demo'); if (!response.ok) throw Error(); state = await response.json(); render(); }
catch { $('quote-status').textContent = 'The private quotation demo is unavailable. Start it with a prepared quotation snapshot.'; $('quote-status').classList.add('error'); }
