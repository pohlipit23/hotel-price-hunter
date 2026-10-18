import { bookingView } from './booking-live-data.js';
import { createStayAdviser } from './stay-advice.js';

/** Use the existing booking screens and shared cards; confirmation is selection-only. */
export async function startBookingDemo(ui) {
  const { $, node, money, savingLabel, addStamp, setActionContent, factTile, stayText, guestText, stayPhoto, offerPhotoIndex } = ui;
  let data, view, selected, busy = false, lastTrigger;
  const adviser = createStayAdviser({ parent: $('comparison'), before: $('price-details'), getData: () => data });
  const barObserver = new ResizeObserver(entries => {
    const height = entries[0].target.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--review-bar-height', height + 'px');
  });
  barObserver.observe(document.querySelector('.review-actions'));
  const explanation = 'Estimated savings before final pricing and fees. Full cancellation terms and room matching still need verification.';
  const steps = screen => {
    $('booking-summary').hidden = screen === 'review'; $('comparison').hidden = screen !== 'review';
    $('simulated-switch').hidden = screen !== 'confirmed'; $('current-ticket').hidden = screen === 'confirmed';
    $('deal-list').hidden = screen === 'confirmed'; $('price-watch').hidden = screen === 'confirmed';
    $('content').classList.toggle('has-review', screen === 'review'); $('content').classList.toggle('has-switch', screen === 'confirmed');
    const current = screen === 'review' ? 1 : screen === 'confirmed' ? 2 : 0;
    document.querySelectorAll('#customer-steps li').forEach((step, index) => {
      if (index === current) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
      step.classList.toggle('passed', index < current);
    });
    const dropLabel = view?.highlights.find(highlight => highlight.offer.offerId === selected?.offerId)?.label;
    adviser.setContext({ pageContext: screen === 'review' ? 'drop-detail' : 'drops-overview', optionId: screen === 'review' ? selected?.offerId : null,
      label: screen === 'review' ? (dropLabel || 'This drop') + ' · ' + selected.room.name : 'Compare your drops', enabled: Boolean(data) && screen !== 'confirmed' });
  };
  const navigate = (screen, push = true) => {
    if (push) history.pushState({ bookingScreen: screen, optionId: selected?.offerId }, '', screen === 'review' ? '#comparison' : screen === 'confirmed' ? '#confirmed' : '#booking-summary');
    steps(screen); window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const termText = offer => offer.option.freeCancellation === true ? 'Free cancellation flag · full terms to check'
    : offer.option.freeCancellation === false ? 'Non-refundable' : 'Cancellation terms to check';
  function review(offer, trigger, push = true) {
    if (busy) return;
    selected = offer; lastTrigger = trigger || lastTrigger;
    $('accept-reduced-flexibility').checked = false;
    $('flexibility-warning').hidden = offer.option.freeCancellation === true;
    $('flexibility-title').textContent = offer.option.freeCancellation === false ? 'Final drop · Non-refundable' : 'Review cancellation flexibility';
    $('flexibility-warning').querySelector('.small').textContent = offer.option.freeCancellation === false
      ? 'No free cancellation. If your plans change, you may not get your money back.' : 'Free cancellation has not been verified for this room.';
    $('accept-reduced-flexibility').nextElementSibling.textContent = 'I understand and accept the cancellation flexibility shown for this room.';
    $('flexibility-watch-note').hidden = true;
    $('comparison-title').textContent = offer.hotel.name; $('after-room').textContent = offer.room.name;
    $('comparison-stay').textContent = stayText(offer); $('comparison-guests').textContent = guestText(offer);
    $('comparison-photo').replaceChildren(stayPhoto(offerPhotoIndex(offer), true));
    $('comparison-category').textContent = 'Same hotel · room details to review';
    $('comparison-pills').replaceChildren(node('span', offer.option.board, 'pill'), node('span', termText(offer), 'pill'));
    $('before-price').textContent = money(view.booking.retail.totalMinor); $('after-price').textContent = money(offer.retail.totalMinor);
    $('switch-fees').textContent = 'To be checked'; $('comparison-saving').textContent = savingLabel(offer.displaySaving.minor);
    $('review-saving').textContent = savingLabel(offer.displaySaving.minor);
    addStamp($('comparison-saving-stamp'), offer.displaySaving.minor, view.currency.code, 'Estimated drop', 'review-stamp');
    $('saving-caption').textContent = explanation;
    $('change-facts-grid').replaceChildren(factTile('Hotel', offer.hotel.name, 'hotel', 'Same hotel', 'fact-same fact-hotel'),
      factTile('Room', offer.room.name, 'room', 'Review details', 'fact-change fact-room'),
      factTile('Meals', offer.option.board, 'meals', 'Review details', 'fact-change fact-meals'),
      factTile('Cancellation', termText(offer), 'cancellation', 'Check full terms', 'fact-warning fact-cancellation'));
    $('cancellation-summary').textContent = 'A source cancellation flag does not verify the full penalty schedule or its timezone.';
    const details = [['Current room', view.booking.room.name], ['Selected room', offer.room.name],
      ['Meals', offer.option.board], ['Exchange rate', `1 ${data.baseline.fx.from} = ${data.baseline.fx.rate} ${data.baseline.fx.to}`],
      ['Pricing', explanation], ['Cancellation', termText(offer)]];
    $('differences').replaceChildren(...details.flatMap(([label, value]) => [node('dt', label), node('dd', value)]));
    $('selected-checked').textContent = 'Rates captured ' + new Date(data.checkedAt).toLocaleString() + '. Availability can change.';
    $('review-message').textContent = ''; $('review-message').classList.remove('error'); $('approve-help').hidden = true;
    $('review-consent-link').hidden = true; $('content').classList.remove('needs-review-consent');
    setActionContent($('approve-offer'), 'Choose this drop');
    $('approve-offer').disabled = false; $('price-details').open = false;
    navigate('review', push); $('comparison-title').focus({ preventScroll: true });
  }
  function confirmed(receipt, push = true) {
    selected = view.offers.find(offer => offer.offerId === receipt.optionId);
    if (!selected) return;
    $('switch-progress-label').textContent = 'Room choice confirmed'; $('switch-stage').textContent = 'Your new room choice is confirmed';
    $('switch-state').textContent = 'Demo complete';
    $('switch-explanation').textContent = 'Your selected room is shown below. The demo stops here before rebooking.';
    for (const [prefix, record] of [['switch-from', view.booking], ['switch-to', selected]]) {
      $(prefix + '-hotel').textContent = record.hotel.name; $(prefix + '-room').textContent = record.room.name;
      $(prefix + '-price').textContent = money(record.retail.totalMinor); $(prefix + '-photo').replaceChildren(stayPhoto(1, true));
    }
    $('switch-from-status').textContent = 'current booking'; $('switch-to-status').textContent = 'selected room';
    addStamp($('switch-stamp'), selected.displaySaving.minor, view.currency.code, 'Estimated drop', 'switch-stamp');
    $('switch-trail').replaceChildren(node('li', 'You reviewed the room and confirmed your choice.'));
    $('switch-reassurance').textContent = 'Your original booking is unchanged. No reservation, cancellation, payment or refund was made.';
    $('switch-money').replaceChildren(node('dt', 'Estimated savings'), node('dd', savingLabel(selected.displaySaving.minor)));
    $('switch-message').textContent = explanation; $('switch-history-details').hidden = true;
    $('advance-demo').closest('details').hidden = true;
    $('done-button').hidden = false; $('done-button').textContent = 'Review other drops';
    navigate('confirmed', push); $('switch-stage').focus({ preventScroll: true });
  }
  function overview(push = true) {
    if (busy) return;
    navigate('options', push);
    const target = lastTrigger?.isConnected ? lastTrigger : $('hotel');
    target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  $('close-comparison').addEventListener('click', event => { event.preventDefault(); overview(); });
  $('keep-booking').addEventListener('click', () => overview()); $('done-button').addEventListener('click', () => overview());
  $('accept-reduced-flexibility').addEventListener('change', () => { $('review-message').textContent = ''; $('review-message').classList.remove('error'); });
  $('approve-offer').addEventListener('click', async () => {
    if (busy || !selected) return;
    const reduced = selected.option.freeCancellation !== true;
    if (reduced && !$('accept-reduced-flexibility').checked) {
      $('review-message').textContent = 'Please confirm the cancellation flexibility before choosing this room.';
      $('review-message').classList.add('error'); $('accept-reduced-flexibility').focus(); return;
    }
    busy = true; $('approve-offer').disabled = true; $('keep-booking').disabled = true;
    $('approve-offer').setAttribute('aria-busy', 'true');
    try {
      const response = await fetch('/api/booking-demo/confirm', { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: JSON.stringify({ optionId: selected.offerId, snapshotVersion: data.snapshotVersion, acceptedDemoOnly: true,
          ...(reduced ? { acceptReducedFlexibility: true } : {}) }) });
      if (!response.ok) throw Error();
      const result = await response.json(); data.confirmation = result.confirmation; confirmed(result.confirmation);
    } catch { $('review-message').textContent = 'Your choice could not be confirmed. Reload and review the latest room options.'; $('review-message').classList.add('error'); }
    finally { busy = false; $('approve-offer').disabled = false; $('keep-booking').disabled = false; $('approve-offer').removeAttribute('aria-busy'); }
  });
  addEventListener('popstate', event => {
    if (busy || !data) return;
    const screen = event.state?.bookingScreen;
    const offer = view.offers.find(item => item.offerId === event.state?.optionId);
    if (screen === 'confirmed' && data.confirmation) confirmed(data.confirmation, false);
    else if (screen === 'review' && offer) review(offer, null, false); else overview(false);
  });
  try {
    const response = await fetch('/api/booking-demo', { credentials: 'same-origin' }); if (!response.ok) throw Error();
    data = await response.json(); view = bookingView(data); ui.setState(view); ui.setSelect(review); ui.renderBooking();
    $('booking-label').textContent = 'Your booking · ' + view.booking.reference;
    $('room').textContent = view.booking.room.name + ' · ' + data.baseline.room.board;
    $('offers').replaceChildren(...view.highlights.map(highlight => ui.offerCard(highlight.offer, highlight)));
    $('changes-title').textContent = 'Find your next drop'; $('offer-empty').hidden = view.highlights.length > 0;
    $('offer-empty').textContent = 'No lower rates in the latest check. Your current booking stays unchanged.';
    document.querySelector('.savings-explanation').textContent = 'Estimated savings for the whole stay · before final pricing and fees';
    document.querySelector('.demo-tag').textContent = 'Booking demo';
    document.querySelector('footer p').textContent = 'Demo ends at room confirmation · no rebooking or payment';
    $('customer-steps').lastElementChild.innerHTML = '<span>3</span> Confirmed';
    $('receipt-lines').querySelector('dt').textContent = 'Current booking';
    document.querySelector('.review-total span').textContent = 'Estimated drop';
    document.querySelector('.approval-explainer h2').textContent = 'Confirm your room choice';
    document.querySelector('.approval-explainer ol').replaceChildren(node('li', 'Review the room and its cancellation terms'), node('li', 'Confirm your choice'));
    document.querySelector('.approval-explainer p').textContent = 'This demo stops at confirmation. Your current booking remains unchanged.';
    $('watch-title').textContent = 'Price watch'; $('watch-status').textContent = 'Automatic checks are not running for this demo.';
    $('watch-consent').hidden = true; $('watch-details').hidden = true; $('watch-button').disabled = true;
    $('watch-button').textContent = 'Automatic checks coming next'; $('notification-previews-details').hidden = true;
    $('content').hidden = false; $('page-status').textContent = '';
    history.replaceState({ bookingScreen: 'options' }, '', '#booking-summary');
    if (data.confirmation) confirmed(data.confirmation, false); else steps('options');
  } catch { $('page-status').textContent = 'Your booking could not be loaded. Please reload to try again.'; $('page-status').classList.add('error'); }
}
