import { bookingView, comparisonLabels, replayResult, currentConfirmation } from './booking-live-data.js';
import { createStayAdviser } from './stay-advice.js';

/** Use the existing booking screens and shared cards; confirmation is selection-only.
 * Catalogue mode adds the judge flow in front: Original Booking, Drop Watch setup and a replayed first check. */
export async function startBookingDemo(ui) {
  const { $, node, money, savingLabel, addStamp, setActionContent, factTile, stayText, guestText, stayPhoto, offerPhotoIndex } = ui;
  const catalogueMode = document.body.dataset.bookingMode === 'catalogue';
  let data, view, selected, busy = false, lastTrigger, code = null, judge, entries = [], navigation = 0;
  const api = action => catalogueMode ? `/api/booking-demo/q/${code}${action ? '/' + action : ''}` : '/api/booking-demo' + (action ? '/' + action : '');
  const adviser = createStayAdviser({ parent: $('comparison'), before: $('price-details'), getData: () => data, chatUrl: () => api('chat') });
  const explanation = 'Estimated savings before final pricing and fees. Full cancellation terms and room matching still need verification.';
  const judgeScreens = { start: 'catalogue-screen', booked: 'booked-screen', setup: 'setup-screen', checking: 'checking-screen' };
  const stepIndex = catalogueMode ? { booked: 0, setup: 1, checking: 1, options: 2, review: 3, confirmed: 4 } : { options: 0, review: 1, confirmed: 2 };
  const routes = { start: 'start', booked: 'booked', setup: 'setup', options: 'drops', review: 'review', confirmed: 'confirmed' };
  const steps = screen => {
    const existing = ['options', 'review', 'confirmed'].includes(screen);
    for (const [name, id] of Object.entries(judgeScreens)) $(id).hidden = screen !== name;
    $('booking-summary').hidden = !existing || screen === 'review'; $('comparison').hidden = screen !== 'review';
    $('simulated-switch').hidden = screen !== 'confirmed'; $('current-ticket').hidden = screen === 'confirmed';
    $('deal-list').hidden = screen === 'confirmed'; $('price-watch').hidden = catalogueMode || screen === 'confirmed';
    $('armed-strip').hidden = !catalogueMode || screen !== 'options';
    $('customer-steps').hidden = screen === 'start';
    $('content').classList.toggle('has-review', screen === 'review'); $('content').classList.toggle('has-switch', screen === 'confirmed');
    const current = stepIndex[screen] ?? -1;
    document.querySelectorAll('#customer-steps li').forEach((step, index) => {
      if (index === current) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
      step.classList.toggle('passed', index < current);
    });
    const dropLabel = view?.highlights.find(highlight => highlight.offer.offerId === selected?.offerId)?.label;
    adviser.setContext({ pageContext: screen === 'review' ? 'drop-detail' : 'drops-overview', optionId: screen === 'review' ? selected?.offerId : null,
      label: screen === 'review' ? (dropLabel || 'This drop') + ' · ' + selected.room.name : 'Compare your drops',
      enabled: Boolean(data) && (screen === 'review' || (screen === 'options' && (!catalogueMode || view?.highlights.length > 0))) });
  };
  const hashFor = screen => catalogueMode ? '#' + routes[screen] + (screen !== 'start' && code ? '-' + code : '')
    : screen === 'review' ? '#comparison' : screen === 'confirmed' ? '#confirmed' : '#booking-summary';
  const navigate = (screen, push = true) => {
    const state = { bookingScreen: screen, optionId: screen === 'review' ? selected?.offerId : null, code: screen === 'start' ? null : code };
    if (push) history.pushState(state, '', hashFor(screen));
    steps(screen); window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const focusHeading = id => $(id).focus({ preventScroll: true });
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
    const labels = comparisonLabels(data.baseline, offer.option);
    const changeTile = (label, value, kind, cue) => factTile(label, value, kind, cue,
      (cue === 'Same' ? 'fact-same' : kind === 'cancellation' ? 'fact-warning' : 'fact-change') + ' fact-' + kind);
    $('change-facts-grid').replaceChildren(changeTile('Hotel', offer.hotel.name, 'hotel', 'Same'),
      changeTile('Room', offer.room.name, 'room', labels.room),
      changeTile('Meals', offer.option.board, 'meals', labels.meals),
      changeTile('Cancellation', termText(offer), 'cancellation', labels.cancellation));
    $('cancellation-summary').textContent = 'Room matching and full cancellation terms still need checking.';
    const details = [['Current room', view.booking.room.name], ['Selected room', offer.room.name],
      ['Meals', offer.option.board], ['Exchange rate', `1 ${data.baseline.fx.from} = ${data.baseline.fx.rate} ${data.baseline.fx.to}`],
      ['Pricing', explanation], ['Cancellation', termText(offer)]];
    $('differences').replaceChildren(...details.flatMap(([label, value]) => [node('dt', label), node('dd', value)]));
    $('selected-checked').textContent = 'Rates captured ' + new Date(data.checkedAt).toLocaleString() + '. Availability can change.';
    $('review-message').textContent = ''; $('review-message').classList.remove('error'); $('approve-help').hidden = true;
    $('review-consent-link').hidden = true; $('content').classList.remove('needs-review-consent');
    setActionContent($('approve-offer'), 'Choose this drop');
    $('approve-offer').disabled = false; $('price-details').open = false;
    navigate('review', push); focusHeading('comparison-title');
  }
  function confirmed(receipt, push = true) {
    if (!currentConfirmation({ ...data, confirmation: receipt })) return false;
    selected = view.offers.find(offer => offer.offerId === receipt.optionId);
    if (!selected) return false;
    $('switch-progress-label').textContent = 'Room choice confirmed'; $('switch-stage').textContent = 'Your new room choice is confirmed';
    $('switch-state').textContent = 'Demo complete';
    $('switch-explanation').textContent = 'Your selected room is shown below. The demo stops here before rebooking.';
    for (const [prefix, record] of [['switch-from', view.booking], ['switch-to', selected]]) {
      $(prefix + '-hotel').textContent = record.hotel.name; $(prefix + '-room').textContent = record.room.name;
      $(prefix + '-price').textContent = money(record.retail.totalMinor); $(prefix + '-photo').replaceChildren(stayPhoto(1, true));
    }
    $('switch-from-status').textContent = 'current booking'; $('switch-to-status').textContent = 'selected room';
    addStamp($('switch-stamp'), selected.displaySaving.minor, view.currency.code, 'Estimated drop', 'switch-stamp');
    $('switch-trail').replaceChildren(node('li', 'You reviewed the room and confirmed your choice.'),
      node('li', 'Selection receipt ' + receipt.selectionId + ' - ' + new Date(receipt.confirmedAt).toLocaleString()));
    $('switch-reassurance').textContent = 'Your original booking is unchanged. No reservation, cancellation, payment or refund was made.';
    $('switch-money').replaceChildren(node('dt', 'Estimated savings'), node('dd', savingLabel(selected.displaySaving.minor)));
    $('switch-message').textContent = explanation; $('switch-history-details').hidden = true;
    $('advance-demo').closest('details').hidden = true;
    $('done-button').hidden = false; $('done-button').textContent = 'Review other drops';
    navigate('confirmed', push); focusHeading('switch-stage');
    return true;
  }
  function overview(push = true) {
    if (busy) return;
    navigate('options', push);
    const target = lastTrigger?.isConnected && !lastTrigger.closest('[hidden]') ? lastTrigger : catalogueMode ? $('armed-title') : $('hotel');
    target.focus({ preventScroll: true }); target.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  // Renders the booking ticket and the Drops. In catalogue mode only the Drops the armed watch found are shown.
  function applyData() {
    const replay = catalogueMode ? replayResult(data) : null;
    data.confirmation = currentConfirmation(data);
    view = bookingView(catalogueMode ? { ...data, options: replay.options } : data);
    ui.setState(view); ui.setSelect(review); ui.renderBooking();
    $('booking-label').textContent = (catalogueMode ? 'Original Booking · ' : 'Your booking · ') + view.booking.reference;
    $('room').textContent = view.booking.room.name + ' · ' + data.baseline.room.board;
    $('offers').replaceChildren(...view.highlights.map(highlight => ui.offerCard(highlight.offer, highlight)));
    $('offer-empty').hidden = view.highlights.length > 0;
    $('lower-minimum').hidden = !catalogueMode || replay.status !== 'empty';
    $('offer-empty').textContent = replay?.status === 'unavailable' ? 'The replayed check is unavailable. Reload to try again. Your Original Booking is unchanged.'
      : catalogueMode ? 'No captured Drops meet your minimum. Your Original Booking is unchanged.' : 'No lower rates in the latest check. Your current booking stays unchanged.';
    if (catalogueMode && data.watch) {
      $('armed-title').textContent = replay.status === 'unavailable' ? 'Replayed check unavailable' : 'Drop Watch armed';
      $('armed-detail').textContent = replay.status === 'unavailable' ? 'Captured data could not be verified. No live search was run.'
        : judge.armedDetail(data) + ' - Replayed ' + new Date(replay.replayedAt).toLocaleString()
          + ' - Captured ' + replay.capturedAt.map(at => new Date(at).toLocaleString()).join(', ') + ' - not live';
    }
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
      const response = await fetch(api('confirm'), { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: JSON.stringify({ optionId: selected.offerId, snapshotVersion: data.snapshotVersion, acceptedDemoOnly: true,
          ...(data.watch ? { watchBinding: JSON.stringify(data.watch) } : {}),
          ...(reduced ? { acceptReducedFlexibility: true } : {}) }) });
      if (!response.ok) throw Error();
      const result = await response.json(); data.confirmation = result.confirmation;
      busy = false; confirmed(result.confirmation);
    } catch { $('review-message').textContent = 'Your choice could not be confirmed. Reload and review the latest room options.'; $('review-message').classList.add('error'); }
    finally { busy = false; $('approve-offer').disabled = false; $('keep-booking').disabled = false; $('approve-offer').removeAttribute('aria-busy'); }
  });
  const chrome = () => {
    $('changes-title').textContent = 'Find your next drop';
    document.querySelector('.savings-explanation').textContent = 'Estimated savings for the whole stay · before final pricing and fees';
    document.querySelector('.demo-tag').textContent = catalogueMode ? 'Judge demo' : 'Booking demo';
    document.querySelector('footer p').textContent = 'Demo ends at room confirmation · no rebooking or payment';
    if (catalogueMode) {
      $('customer-steps').classList.add('five-steps');
      $('customer-steps').replaceChildren(...['Booked', 'Set up', 'Drops', 'Review', 'Confirmed'].map((label, index) => {
        const item = node('li'); item.append(node('span', String(index + 1)), node('em', label, 'step-label')); return item;
      }));
    } else $('customer-steps').lastElementChild.innerHTML = '<span>3</span> Confirmed';
    $('receipt-lines').querySelector('dt').textContent = 'Current booking';
    document.querySelector('.review-total span').textContent = 'Estimated drop';
    document.querySelector('.approval-explainer').remove();
    $('watch-title').textContent = 'Price watch'; $('watch-status').textContent = 'Automatic checks are not running for this demo.';
    $('watch-consent').hidden = true; $('watch-details').hidden = true; $('watch-button').disabled = true;
    $('watch-button').textContent = 'Automatic checks coming next'; $('notification-previews-details').hidden = true;
  };

  if (!catalogueMode) {
    addEventListener('popstate', event => {
      if (busy || !data) return;
      const screen = event.state?.bookingScreen;
      const offer = view.offers.find(item => item.offerId === event.state?.optionId);
      if (screen === 'confirmed' && data.confirmation) confirmed(data.confirmation, false);
      else if (screen === 'review' && offer) review(offer, null, false); else overview(false);
    });
    try {
      const response = await fetch('/api/booking-demo', { credentials: 'same-origin' }); if (!response.ok) throw Error();
      data = await response.json(); applyData(); chrome();
      $('content').hidden = false; $('page-status').textContent = '';
      history.replaceState({ bookingScreen: 'options' }, '', '#booking-summary');
      if (data.confirmation) confirmed(data.confirmation, false); else steps('options');
    } catch { $('page-status').textContent = 'Your booking could not be loaded. Please reload to try again.'; $('page-status').classList.add('error'); }
    return;
  }

  // Catalogue mode: hash routes #start, #booked-CODE, #setup-CODE, #drops-CODE, #review-CODE, #confirmed-CODE.
  const { createJudgeScreens } = await import('./booking-judge.js');
  judge = createJudgeScreens(ui);
  const status = (text, error = false) => { $('page-status').textContent = text; $('page-status').classList.toggle('error', error); };
  async function load(next) {
    const response = await fetch('/api/booking-demo/q/' + next, { credentials: 'same-origin' });
    if (!response.ok) return false;
    const payload = await response.json(); return payload;
  }
  async function go(screen, target, { push = true, optionId, trigger } = {}) {
    const token = ++navigation;
    if (screen !== 'start') {
      try {
        const payload = await load(target);
        if (token !== navigation) return;
        if (!payload) { status('That booking is not in this demo. Pick one below.', true); screen = 'start'; }
        else {
          code = target; data = payload; selected = null; lastTrigger = trigger || null; applyData();
          $('booked-back').href = '#start'; $('setup-back').href = '#booked-' + code;
        }
      }
      catch { status('That booking could not be loaded. Please try again.', true); screen = 'start'; }
      if (token !== navigation) return;
    }
    if (screen === 'start') { navigate('start', push); focusHeading('catalogue-title'); return; }
    status('');
    if (screen === 'setup' && data.blocker) screen = 'booked';
    if (['options', 'review', 'confirmed'].includes(screen) && !data.watch) screen = data.blocker ? 'booked' : 'setup';
    if (screen === 'booked') { judge.renderBooked(data); navigate('booked', push); focusHeading('booked-title'); return; }
    if (screen === 'setup') { judge.renderSetup(data); navigate('setup', push); focusHeading('setup-title'); return; }
    if (screen === 'confirmed' && data.confirmation && confirmed(data.confirmation, push)) return;
    const offer = view.offers.find(item => item.offerId === optionId);
    if (screen === 'review' && offer) return review(offer, trigger, push);
    overview(push);
  }
  async function arm() {
    if (busy) return;
    const minimum = judge.chosenMinimum();
    if (!$('judge-consent').checked) {
      $('setup-message').textContent = 'Tick the box so RoomDrop may check this booking for you.'; $('setup-message').classList.add('error');
      $('judge-consent').focus(); return;
    }
    busy = true; $('arm-watch').disabled = true; $('arm-watch').setAttribute('aria-busy', 'true');
    try {
      const response = await fetch(api('watch'), { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: JSON.stringify({ snapshotVersion: data.snapshotVersion, consent: true, minimumSavingMinor: minimum }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (result.error?.code === 'WATCH_CANNOT_START') { data.blocker = result.error.reason; busy = false; return go('booked', code, { push: false }); }
        throw Error();
      }
      data.watch = result.watch; data.confirmation = null; selected = null; applyData();
      if (replayResult(data).status === 'unavailable') { busy = false; overview(); return; }
      const token = ++navigation;
      history.pushState({ bookingScreen: 'options', code }, '', hashFor('options'));
      steps('checking'); window.scrollTo({ top: 0, behavior: 'instant' }); focusHeading('checking-title');
      busy = false;
      if (await judge.playCheck(data, () => token === navigation)) { steps('options'); window.scrollTo({ top: 0, behavior: 'instant' }); focusHeading('armed-title'); }
    } catch {
      $('setup-message').textContent = 'Your Drop Watch could not be armed. Please try again.'; $('setup-message').classList.add('error');
    } finally { busy = false; $('arm-watch').disabled = false; $('arm-watch').removeAttribute('aria-busy'); }
  }
  const link = (id, handler) => $(id).addEventListener('click', event => { event.preventDefault(); handler(); });
  link('booked-back', () => go('start')); link('setup-back', () => go('booked', code));
  $('pick-another').addEventListener('click', () => go('start'));
  $('setup-drop').addEventListener('click', () => go('setup', code));
  $('arm-watch').addEventListener('click', arm);
  $('judge-consent').addEventListener('change', () => { $('setup-message').textContent = ''; $('setup-message').classList.remove('error'); });
  $('change-minimum').addEventListener('click', () => go('setup', code)); $('lower-minimum').addEventListener('click', () => go('setup', code));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); go('start'); });
  addEventListener('popstate', event => {
    if (busy) return;
    const parsed = /^#(start|booked|setup|drops|review|confirmed)(?:-([A-Z0-9]{4,20}))?$/.exec(location.hash);
    const route = Object.keys(routes).find(key => routes[key] === parsed?.[1]) ?? 'start';
    go(event.state?.bookingScreen && event.state.bookingScreen !== 'checking' ? event.state.bookingScreen : route,
      event.state?.code ?? parsed?.[2], { push: false, optionId: event.state?.optionId });
  });
  try {
    const response = await fetch('/api/booking-demo/catalogue', { credentials: 'same-origin' }); if (!response.ok) throw Error();
    entries = (await response.json()).entries;
    judge.renderCatalogue(entries, (next, trigger) => { lastTrigger = trigger; go('booked', next); });
    chrome(); $('content').hidden = false; status('');
    const parsed = /^#(booked|setup|drops|review|confirmed)-([A-Z0-9]{4,20})$/.exec(location.hash);
    const screen = parsed ? Object.keys(routes).find(key => routes[key] === parsed[1]) : 'start';
    history.replaceState({ bookingScreen: screen, code: parsed?.[2] ?? null }, '', screen === 'start' ? '#start' : location.hash);
    await go(screen, parsed?.[2], { push: false });
  } catch { status('The demo bookings could not be loaded. Please reload to try again.', true); }
}
