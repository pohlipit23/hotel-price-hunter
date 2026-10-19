import { bookingView, comparisonLabels, replayResult, currentConfirmation } from './booking-live-data.js';
import { createStayAdviser } from './stay-advice.js';
import { cardPhoto, closeoutCopy, CLOSEOUT_VIDEO } from './booking-judge.js';

/** Use the existing booking screens and shared cards; confirmation is selection-only.
 * Catalogue mode adds the judge flow in front: Original Booking, Drop Watch setup and a replayed first check. */
export async function startBookingDemo(ui) {
  const { $, node, money, savingLabel, addStamp, setActionContent, factTile, stayText, guestText, stayPhoto, offerPhotoIndex } = ui;
  const catalogueMode = document.body.dataset.bookingMode === 'catalogue';
  let data, view, selected, busy = false, lastTrigger, code = null, judge, entries = [], navigation = 0;
  let pendingRoute = false, routingLocation = null;
  const api = action => catalogueMode ? `/api/booking-demo/q/${code}${action ? '/' + action : ''}` : '/api/booking-demo' + (action ? '/' + action : '');
  const instantLabel = value => new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';
  const adviser = createStayAdviser({ parent: $('comparison'), before: $('price-details'),
    overviewParent: $('deal-list').querySelector('.section-heading'), getData: () => data, chatUrl: () => api('chat') });
  const explanation = 'Estimated savings before final pricing and fees.';
  const judgeScreens = { start: 'catalogue-screen', booked: 'booked-screen', launch: 'launch-screen', closeout: 'closeout-screen' };
  // Setup and the replayed check play in RoomDrop's modal over the agency's confirmation page.
  const modalViews = ['setup', 'checking'], pageOf = screen => modalViews.includes(screen) ? 'booked' : screen;
  const modal = $('drop-modal');
  let dropTrigger = null, returnFocus = null;
  const syncModal = screen => {
    if (!modalViews.includes(screen)) { if (modal.open) modal.close('route'); return; }
    $('setup-screen').hidden = screen !== 'setup'; $('checking-screen').hidden = screen !== 'checking';
    modal.setAttribute('aria-labelledby', screen + '-title');
    if (!modal.open) { modal.returnValue = ''; modal.showModal(); }
  };
  const stepIndex = catalogueMode ? { booked: 0, setup: 1, checking: 1, options: 2, review: 3, confirmed: 4 } : { options: 0, review: 1, confirmed: 2 };
  const routes = { start: 'start', booked: 'booked', setup: 'setup', options: 'drops', review: 'review', confirmed: 'confirmed', closeout: 'done' };
  const steps = screen => {
    const existing = ['options', 'review', 'confirmed'].includes(screen);
    for (const [name, id] of Object.entries(judgeScreens)) $(id).hidden = pageOf(screen) !== name;
    $('booking-summary').hidden = !existing || screen === 'review'; $('comparison').hidden = screen !== 'review';
    $('simulated-switch').hidden = screen !== 'confirmed'; $('current-ticket').hidden = screen === 'confirmed';
    $('deal-list').hidden = ['confirmed', 'launch', 'closeout'].includes(screen); $('price-watch').hidden = catalogueMode || screen === 'confirmed';
    // From the Drops page on, the RoomDrop app has no demo strip or footer; only the judge header stays.
    $('armed-strip').hidden = true;
    document.querySelector('footer').hidden = catalogueMode && (existing || screen === 'launch');
    // Inside the app frame: the agency's site for the booking pages, RoomDrop from the Drops page on.
    if (catalogueMode) {
      // The start page and the closeout sit outside both sites: the judge is before or after the app.
      const site = ['start', 'closeout'].includes(screen) ? null : existing || screen === 'launch' ? 'roomdrop' : 'agency';
      $('app-frame').dataset.site = site ?? 'none'; shownSite = site; shownScreen = screen; shownCode = code;
      syncModal(screen);
      // While the splash plays, the frame and the judge bar both flag that the actual app is starting.
      $('app-frame').classList.toggle('launching', screen === 'launch'); $('judge-bar').classList.toggle('judge-bar-entering', screen === 'launch');
      // The launch splash carries its own logo, so the header waits until the Drops page.
      document.querySelector('.site-header').hidden = !site || screen === 'launch';
      $('judge-bar-text').textContent = screen === 'launch' ? 'Now starting the RoomDrop app · the hackathon submission'
        : screen === 'closeout' ? 'The RoomDrop app ends here · thanks for judging'
        : site === 'roomdrop' ? 'Hackathon submission starts here'
        : site === 'agency' ? "This is your travel agency's confirmation page. The framed box is the RoomDrop widget." : 'How this demo works';
      document.querySelector('.brand').hidden = site !== 'roomdrop'; $('agency-brand').hidden = $('agency-nav').hidden = site !== 'agency';
    }
    $('customer-steps').hidden = catalogueMode || screen === 'start';
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
  // Entering RoomDrop from anywhere else (the agency pages, the start page or a fresh load) plays a short launch
  // splash first; moving between RoomDrop pages does not. Focus requested meanwhile lands once the page shows.
  let shownSite = null, shownScreen = null, shownCode = null, launchTimer = null, pendingFocus = null;
  const launchMs = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 2000 : 5000;
  const navigate = (screen, push = true) => {
    const state = { bookingScreen: screen, optionId: screen === 'review' ? selected?.offerId : null, code: screen === 'start' ? null : code };
    if (push) history.pushState(state, '', hashFor(screen));
    show(screen);
  };
  const show = screen => {
    clearTimeout(launchTimer); launchTimer = null; pendingFocus = null;
    // Opening or closing the modal keeps the agency page where it was.
    const samePage = shownCode === code && pageOf(shownScreen) === 'booked' && pageOf(screen) === 'booked';
    const reveal = () => { steps(screen); if (!samePage) window.scrollTo({ top: 0, behavior: 'instant' }); };
    // Back from the closeout returns to the confirmation directly; the app is not starting again.
    if (!catalogueMode || !['options', 'review', 'confirmed'].includes(screen) || shownSite === 'roomdrop' || shownScreen === 'closeout') return reveal();
    steps('launch'); window.scrollTo({ top: 0, behavior: 'instant' }); $('launch-title').focus({ preventScroll: true });
    launchTimer = setTimeout(() => {
      launchTimer = null; reveal();
      const target = pendingFocus; pendingFocus = null; target?.focus({ preventScroll: true });
    }, launchMs());
  };
  const focusHeading = id => { if (launchTimer) pendingFocus = $(id); else $(id).focus({ preventScroll: true }); };
  const termText = offer => offer.option.freeCancellation === true ? 'Free cancellation*'
    : offer.option.freeCancellation === false ? 'Non-refundable' : 'Cancellation terms to check';
  function photoContent(photo, onFallback = () => {}) {
    const frame = node('span', undefined, 'stay-photo');
    const fallback = () => { frame.replaceChildren(node('span', 'No photo yet', 'photo-unavailable')); onFallback(); };
    const reviewed = cardPhoto({ photo });
    if (reviewed.kind === 'fallback') fallback();
    else {
      const image = node('img', undefined, 'card-photo'); image.src = reviewed.src; image.alt = reviewed.alt; image.decoding = 'async';
      image.addEventListener('error', fallback, { once: true }); frame.append(image);
    }
    return frame;
  }
  // Catalogue photos are real and need no "Hotel photo" label, so the shared markup's tag goes.
  function setPhoto(target, photo) {
    target.parentElement.querySelector(':scope > .photo-tag')?.remove();
    target.replaceChildren(photoContent(photo));
  }
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
    if (catalogueMode) setPhoto($('comparison-photo'), offer.option.photo);
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
    $('cancellation-summary').textContent = offer.option.freeCancellation === true ? "*Subject to the hotel's full cancellation terms." : '';
    const details = [['Current room', view.booking.room.name], ['Selected room', offer.room.name],
      ['Meals', offer.option.board],
      ...(data.baseline.quotedSource ? [['Original source amount', data.baseline.quotedSource.currency + ' ' +
        (data.baseline.quotedSource.totalMinor / 10 ** new Intl.NumberFormat('en', { style: 'currency', currency: data.baseline.quotedSource.currency }).resolvedOptions().maximumFractionDigits)]] : []),
      ...(offer.option.sourcePrice ? [['Captured source amount', offer.option.sourcePrice.currency + ' ' + offer.option.sourcePrice.amount]] : []),
      ['Exchange rate', data.baseline.fx ? `1 ${data.baseline.fx.from} = ${data.baseline.fx.rate} ${data.baseline.fx.to}` : 'Not supplied'],
      ['Pricing', explanation], ['Cancellation', termText(offer)]];
    $('differences').replaceChildren(...details.flatMap(([label, value]) => [node('dt', label), node('dd', value)]));
    $('selected-checked').textContent = 'Price checked ' + (catalogueMode ? replayResult(data).capturedAt : [data.checkedAt]).map(instantLabel).join(', ')
      + '. Availability can change.';
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
    $('switch-state').hidden = catalogueMode; $('switch-state').textContent = 'Demo complete';
    $('switch-explanation').textContent = catalogueMode ? 'Your selected room is shown below.' : 'Your selected room is shown below. The demo stops here before rebooking.';
    const card = entries.find(entry => entry.code === code)?.card;
    for (const [prefix, record] of [['switch-from', view.booking], ['switch-to', selected]]) {
      $(prefix + '-hotel').textContent = record.hotel.name; $(prefix + '-room').textContent = record.room.name;
      $(prefix + '-price').textContent = money(record.retail.totalMinor); $(prefix + '-photo').replaceChildren(stayPhoto(1, true));
      if (catalogueMode) setPhoto($(prefix + '-photo'), prefix === 'switch-to' ? selected.option.photo : card?.roomPhoto ?? card?.photo);
    }
    $('switch-from-status').textContent = 'current booking'; $('switch-to-status').textContent = 'selected room';
    addStamp($('switch-stamp'), selected.displaySaving.minor, view.currency.code, 'Estimated drop', 'switch-stamp');
    $('switch-trail').replaceChildren(node('li', 'You reviewed the room and confirmed your choice.'),
      node('li', 'Selection receipt ' + receipt.selectionId + ' - ' + instantLabel(receipt.confirmedAt)));
    $('switch-reassurance').textContent = catalogueMode ? 'Your original booking stays active.'
      : 'Your original booking is unchanged. No reservation, cancellation, payment or refund was made.';
    $('switch-money').replaceChildren(node('dt', 'Estimated savings'), node('dd', savingLabel(selected.displaySaving.minor)));
    $('switch-message').textContent = explanation; $('switch-history-details').hidden = true;
    $('advance-demo').closest('details').hidden = true;
    $('done-button').hidden = catalogueMode; $('done-button').textContent = 'Review other drops';
    // The RoomDrop app ends here: only the next-step choice shows, and neither choice is built yet.
    for (const id of ['switch-trail', 'switch-reassurance', 'switch-money', 'switch-message']) $(id).hidden = catalogueMode;
    $('switch-next').hidden = !catalogueMode; nextChoice(null);
    navigate('confirmed', push); focusHeading('switch-stage');
    return true;
  }
  function overview(push = true) {
    if (busy) return;
    navigate('options', push);
    if (launchTimer) { pendingFocus = $('changes-title'); return; }
    const target = lastTrigger?.isConnected && !lastTrigger.closest('[hidden]') ? lastTrigger : catalogueMode ? $('changes-title') : $('hotel');
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
    if (catalogueMode) for (const [index, highlight] of view.highlights.entries()) {
      const card = $('offers').children[index]; card.querySelector('.photo-tag')?.remove();
      card.querySelector('.offer-photo > .stay-photo').replaceWith(photoContent(highlight.offer.option.photo));
    }
    $('offer-empty').hidden = view.highlights.length > 0;
    $('lower-minimum').hidden = !catalogueMode || replay.status !== 'empty';
    $('offer-empty').textContent = replay?.status === 'unavailable' ? 'Drops are unavailable right now. Reload to try again.'
      : catalogueMode ? 'No drops above your minimum yet. Your original booking stays active.' :'No lower rates in the latest check. Your current booking stays unchanged.';
    if (catalogueMode && data.watch) {
      $('armed-title').textContent = replay.status === 'unavailable' ? 'Replayed check unavailable' : 'Drop Watch armed';
      $('armed-detail').textContent = replay.status === 'unavailable' ? 'Captured data could not be verified. No live search was run.'
        : judge.armedDetail(data) + ' - Replayed ' + instantLabel(replay.replayedAt)
          + ' - Captured ' + replay.capturedAt.map(instantLabel).join(', ') + ' - not live';
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
      busy = false; if (!pendingRoute) confirmed(result.confirmation);
    } catch { $('review-message').textContent = 'Your choice could not be confirmed. Reload and review the latest room options.'; $('review-message').classList.add('error'); }
    finally { busy = false; $('approve-offer').disabled = false; $('keep-booking').disabled = false; $('approve-offer').removeAttribute('aria-busy'); if (pendingRoute) followLocation(); }
  });
  const chrome = () => {
    $('changes-title').textContent = 'Find your next drop';
    const heading = $('deal-list').querySelector('.section-heading');
    // The judge's Drops page opens on the cards: only the heading stays, for screen readers and as the focus target.
    if (catalogueMode) { heading.replaceChildren($('changes-title')); heading.classList.add('sr-only'); }
    else heading.querySelector('.savings-explanation').textContent = 'Estimated savings for the whole stay · before final pricing and fees';
    document.querySelector('.demo-tag').textContent = catalogueMode ? 'Judge demo' : 'Booking demo';
    // The judge bar carries the demo label in catalogue mode, outside the app frame.
    document.querySelector('.demo-tag').hidden = catalogueMode; $('judge-bar').hidden = !catalogueMode;
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
    // A new route cancels a running splash at once, so its timer cannot reveal the old screen while this one loads.
    clearTimeout(launchTimer); launchTimer = null; pendingFocus = null;
    if (screen !== 'start') {
      try {
        const payload = await load(target);
        if (token !== navigation) return;
        if (!payload) { status('That booking is not in this demo. Pick one below.', true); screen = 'start'; }
        else {
          code = target; data = payload; selected = null; lastTrigger = trigger || null; applyData();
          $('booked-back').href = '#start';
        }
      }
      catch { status('That booking could not be loaded. Please try again.', true); screen = 'start'; }
      if (token !== navigation) return;
    }
    if (screen === 'start') { navigate('start', push); focusHeading('catalogue-title'); return; }
    status('');
    if (screen === 'setup' && data.blocker) screen = 'booked';
    if (['options', 'review', 'confirmed', 'closeout'].includes(screen) && !data.watch) screen = data.blocker ? 'booked' : 'setup';
    if (screen === 'closeout') {
      if (data.confirmation) { closeout(push); return; }
      screen = 'options';
    }
    // Leaving the modal (Back, or a close that went back) returns focus to what opened it.
    if (screen === 'booked') { const closing = modal.open || returnFocus; judge.renderBooked(data); navigate('booked', push); if (closing) focusTrigger(); else focusHeading('booked-title'); return; }
    if (screen === 'setup') { judge.renderBooked(data); judge.renderSetup(data); navigate('setup', push); focusHeading('setup-title'); return; }
    // Once a drop is chosen the app is finished: Drops and review routes land on the confirmation.
    if (catalogueMode && data.confirmation && ['options', 'review'].includes(screen)) screen = 'confirmed';
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
    const token = ++navigation;
    try {
      const response = await fetch(api('watch'), { method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrfToken },
        body: JSON.stringify(judge.armRequestBody(data, minimum)) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (result.error?.code === 'WATCH_CANNOT_START') { data.blocker = result.error.reason; busy = false; return go('booked', code, { push: false }); }
        if (result.error?.code === 'WATCH_REVISION_STALE') throw Object.assign(Error(), { userMessage: 'Your Drop Watch changed. Reload to review its latest setup.' });
        if (['CATALOGUE_UNAVAILABLE', 'DEMO_UNAVAILABLE'].includes(result.error?.code)) throw Object.assign(Error(), { userMessage: 'RoomDrop is unavailable right now. Please try again.' });
        throw Error();
      }
      data.watch = result.watch; data.confirmation = null; selected = null; applyData(); judge.renderOffer(data);
      // A route change, or the modal closed meanwhile: the armed card already shows on the agency page.
      if (pendingRoute || token !== navigation) { busy = false; return; }
      if (replayResult(data).status === 'unavailable') { busy = false; overview(); return; }
      history.pushState({ bookingScreen: 'options', code }, '', hashFor('options'));
      steps('checking'); focusHeading('checking-title');
      busy = false;
      if (await judge.playCheck(data, () => token === navigation)) { show('options'); focusHeading('changes-title'); }
    } catch (error) {
      $('setup-message').textContent = error.userMessage || 'Your Drop Watch could not be armed. Please try again.'; $('setup-message').classList.add('error');
    } finally { busy = false; $('arm-watch').disabled = false; $('arm-watch').removeAttribute('aria-busy'); if (pendingRoute) followLocation(); }
  }
  const link = (id, handler) => $(id).addEventListener('click', event => { event.preventDefault(); handler(); });
  link('booked-back', () => go('start'));
  // The add-on opens the modal at once over the loaded page; a direct #setup- link loads first (go).
  $('setup-drop').addEventListener('click', event => {
    if (busy || !data || data.blocker) return;
    dropTrigger = event.currentTarget; ++navigation; judge.renderSetup(data);
    history.pushState({ bookingScreen: 'setup', code, optionId: null, overPage: true }, '', hashFor('setup'));
    show('setup'); focusHeading('setup-title');
  });
  $('drop-open').addEventListener('click', () => go('options', code));
  const focusTrigger = () => {
    const target = [returnFocus, dropTrigger, $('setup-drop')].find(item => item?.isConnected && !item.closest('[hidden]')) ?? $('booked-title');
    returnFocus = null; target.focus();
  };
  // The judge closes the modal (X, Esc or the backdrop): back to the confirmation page. Route changes close it
  // themselves ('route'). Not while the arm request is out; a close that slips through is caught in arm().
  function dismissed() {
    ++navigation;
    if (location.hash === hashFor('setup') && history.state?.overPage) { returnFocus = dropTrigger; history.back(); return; }
    history.replaceState({ bookingScreen: 'booked', code, optionId: null }, '', hashFor('booked'));
    judge.renderBooked(data); steps('booked'); focusTrigger();
  }
  modal.addEventListener('close', () => { if (modal.returnValue !== 'route' && !modal.open) dismissed(); });
  modal.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  $('drop-close').addEventListener('click', () => { if (!busy) modal.close('dismiss'); });
  // A modal dialog still lets Tab leave for the browser's own toolbar; keep it cycling inside the modal instead.
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const items = [...modal.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')].filter(item => !item.disabled && item.getClientRects().length);
    const at = document.activeElement, follows = item => at.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (!items.length) return;
    if (!event.shiftKey && !items.some(follows)) { event.preventDefault(); items[0].focus(); }
    if (event.shiftKey && !items.some(item => item !== at && !follows(item))) { event.preventDefault(); items.at(-1).focus(); }
  });
  modal.addEventListener('click', event => {
    const box = modal.getBoundingClientRect();
    if (!busy && event.target === modal && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) modal.close('dismiss');
  });
  $('arm-watch').addEventListener('click', arm);
  $('judge-consent').addEventListener('change', () => { $('setup-message').textContent = ''; $('setup-message').classList.remove('error'); });
  $('change-minimum').addEventListener('click', () => go('setup', code)); $('lower-minimum').addEventListener('click', () => go('setup', code));
  // The "What next?" pick ends the app: it is not stored server side, only remembered in this tab for the closeout.
  const choiceKey = () => 'roomdrop-closeout-' + code;
  const savedChoice = () => { try { return sessionStorage.getItem(choiceKey()); } catch { return null; } };
  function nextChoice(choice) {
    $('keep-watching').setAttribute('aria-pressed', String(choice === 'watch'));
    $('keep-for-good').setAttribute('aria-pressed', String(choice === 'keep'));
    if (!choice) return;
    try { sessionStorage.setItem(choiceKey(), choice); } catch {}
    closeout();
  }
  function closeout(push = true) {
    const copy = closeoutCopy(savedChoice());
    $('closeout-choice').textContent = copy.choice; $('closeout-choice').hidden = !copy.choice;
    $('closeout-steps').replaceChildren(...copy.steps.map(text => node('li', text)));
    // The video player is only created here, so no other page contacts YouTube.
    if (!$('closeout-video-frame').firstElementChild) {
      const frame = document.createElement('iframe');
      Object.assign(frame, { src: CLOSEOUT_VIDEO, title: 'RoomDrop demo video', allowFullscreen: true, referrerPolicy: 'strict-origin-when-cross-origin' });
      frame.allow = 'accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share';
      $('closeout-video-frame').append(frame);
    }
    navigate('closeout', push); focusHeading('closeout-title');
  }
  $('keep-watching').addEventListener('click', () => nextChoice('watch'));
  $('keep-for-good').addEventListener('click', () => nextChoice('keep'));
  $('closeout-restart').addEventListener('click', () => go('start'));
  document.querySelector('.brand').addEventListener('click', event => { event.preventDefault(); go('start'); });
  function followLocation() {
    if (busy) { pendingRoute = true; return; }
    pendingRoute = false;
    const parsed = /^#(start|booked|setup|drops|review|confirmed|done)(?:-([A-Z0-9]{4,20}))?$/.exec(location.hash);
    const route = Object.keys(routes).find(key => routes[key] === parsed?.[1]) ?? 'start';
    const state = history.state, target = parsed?.[2];
    const optionId = state?.code === target && state?.bookingScreen === route ? state.optionId : undefined;
    const key = location.hash + ':' + (optionId ?? '');
    // Native fragment navigation can emit both events. Fetch once while that route is loading.
    if (routingLocation === key) return;
    routingLocation = key;
    void go(route, target, { push: false, optionId }).finally(() => { if (routingLocation === key) routingLocation = null; });
  }
  addEventListener('popstate', followLocation);
  addEventListener('hashchange', followLocation);
  try {
    const response = await fetch('/api/booking-demo/catalogue', { credentials: 'same-origin' }); if (!response.ok) throw Error();
    entries = (await response.json()).entries;
    // Judges only pick bookings a Drop Watch can start on; non-refundable ones stay in the data, off the picker.
    judge.renderCatalogue(entries.filter(entry => entry.blocker !== 'NON_REFUNDABLE'), (next, trigger) => { lastTrigger = trigger; go('booked', next); });
    chrome(); $('content').hidden = false; status('');
    const parsed = /^#(booked|setup|drops|review|confirmed|done)-([A-Z0-9]{4,20})$/.exec(location.hash);
    const screen = parsed ? Object.keys(routes).find(key => routes[key] === parsed[1]) : 'start';
    const optionId = history.state?.code === parsed?.[2] ? history.state?.optionId : undefined;
    history.replaceState({ bookingScreen: screen, code: parsed?.[2] ?? null, optionId }, '', screen === 'start' ? '#start' : location.hash);
    await go(screen, parsed?.[2], { push: false, optionId });
  } catch { status('The demo bookings could not be loaded. Please reload to try again.', true); }
}
