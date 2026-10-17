/* Read-only presentation of saved watch facts and simulated update previews. */
const $ = id => document.getElementById(id);
const reasons = {
  NOT_OPTED_IN: 'No price watch is on.',
  WATCH_STOPPED: 'Future simulated checks are stopped.',
  SWITCH_IN_PROGRESS: 'Price watch is paused while the switch is in progress.',
  NON_REFUNDABLE_BOOKING: 'Price watch is unavailable for this non-refundable booking.',
  NON_REFUNDABLE_BASELINE: 'Price watch is unavailable for this non-refundable booking.',
  CANCELLATION_WINDOW_EXPIRED: 'The free-cancellation deadline has passed.',
  CANCELLATION_WINDOW_ENDED: 'The free-cancellation deadline has passed.',
  UNKNOWN_CANCELLATION_POLICY: 'The cancellation terms need verification.',
  UNKNOWN_CANCELLATION: 'The cancellation terms need verification.',
  SOURCE_UNAVAILABLE: 'Demo rates are unavailable for these dates.',
  SESSION_EXPIRED: 'This demo session has expired. Reload to start again.',
  BOOKING_VERSION_CHANGED: 'The booking changed.',
  WATCH_VERSION_CHANGED: 'The price watch changed.',
  PREFERENCES_VERSION_CHANGED: 'Saved stay requirements changed.',
  PROVIDER_UNAVAILABLE: 'The simulated rate provider was unavailable.',
  PROVIDER_FAILED: 'The simulated rate check failed.',
  REFUNDABLE_BASELINE: 'Daily simulated checks are available.',
  UNKNOWN_CANCELLATION_FACTS: 'The cancellation terms need verification.'
};
const previewNames = { weekly: 'Weekly update previews', daily: 'Daily update previews', 'offers-only': 'Offer-only update previews', off: 'No update previews' };
function reasonText(codes) { return [...new Set((codes || []).map(code => reasons[code] || 'A saved safety check could not be verified.'))].join(' '); }
function cadence(value) { return previewNames[value] || 'Weekly update previews'; }
function element(tag, text, className) {
  const item = document.createElement(tag);
  item.textContent = text;
  if (className) item.className = className;
  return item;
}
export function renderWatch(state, { busy, pending, refreshRequired, message, messageError, money, instant }) {
  const watch = state.priceWatch;
  $('price-watch').hidden = !watch;
  if (!watch) return;
  const button = $('watch-button');
  const checkbox = $('watch-consent-check');
  const consent = $('watch-consent');
  const command = pending?.kind === 'watch' ? pending : null;
  const finalDrop = state.booking?.cancellation?.refundability === 'non-refundable';
  const consentIntent = !finalDrop && !watch.enabled && watch.status !== 'ended';
  consent.hidden = !consentIntent;
  if (!consentIntent) checkbox.checked = false;
  const minimum = state.preferences?.minimumSavingMinor;
  $('watch-consent-threshold').textContent = Number.isSafeInteger(minimum) && minimum > 0
    ? 'Current minimum: ' + money(minimum, state.currency?.code) + ' after fees.'
      : 'Current minimum: ' + (Number.isSafeInteger(minimum) ? money(minimum, state.currency?.code) : 'not verified') + '.';
  $('watch-consent-frequency').textContent = cadence(state.preferences?.notificationFrequency) + ' in this demo';
  $('price-watch').setAttribute('aria-busy', String(busy));

  const ordinaryReason = ['NOT_OPTED_IN', 'REFUNDABLE_BASELINE', 'WATCH_STOPPED', 'SWITCH_IN_PROGRESS'].includes(watch.reason);
  const latestFailed = watch.status === 'active' && watch.lastCheck?.status === 'failed';
  const baseStatus = latestFailed ? 'The latest simulated price check failed.'
    : watch.reason === 'SWITCH_IN_PROGRESS' ? 'Price watch paused while your switch is in progress.'
    : watch.reason === 'NOT_OPTED_IN' ? 'No price watch yet. Daily simulated checks are available.'
      : watch.status === 'active' ? 'Price watch on. Daily simulated checks are active.'
        : watch.status === 'paused' ? 'Price watch paused.'
          : watch.status === 'stopped' ? 'Price watch stopped.'
            : watch.status === 'ended' ? 'Price watch ended.' : 'Price watch status unavailable.';
  const reason = latestFailed ? reasonText(watch.lastCheck.reasonCodes)
    : watch.reason && !ordinaryReason ? reasonText([watch.reason]) : '';
  const status = finalDrop ? 'Final drop. Price watch has ended for this non-refundable stay.'
    : baseStatus + (reason ? ' ' + reason : '') + ' ' + cadence(state.preferences?.notificationFrequency) + '. Nothing switches without separate approval.';
  $('watch-status').textContent = status + (message ? ' ' + message : '');
  $('watch-status').classList.toggle('error', messageError);

  const check = watch.lastCheck;
  let checkText = 'No recorded simulated check yet.';
  if (check) {
    const outcome = { 'offers-found': 'Offers found', 'no-saving': 'No better offer found', failed: 'Check failed', skipped: 'Check skipped' }[check.status] || 'Result unavailable';
    checkText = 'Latest simulated check: ' + outcome + ' · recorded ' + instant(check.recordedAt, check.timeZone || watch.timeZone) + '.';
    if (check.status === 'offers-found' && check.searched === true && check.isSimulated === true) {
      const quoted = (check.checkOffers || []).filter(offer => offer.bookingVersion === check.bookingVersion
        && offer.currency === offer.retail?.currency && offer.actionable === false
        && Number.isSafeInteger(offer.netSavingMinor) && offer.netSavingMinor > 0);
      const best = quoted.toSorted((a, b) => b.netSavingMinor - a.netSavingMinor)[0];
      if (best) checkText += ' ' + quoted.length + (quoted.length === 1 ? ' offer' : ' offers')
        + ' · up to ' + money(best.netSavingMinor, best.currency) + ' potential saving after fees for the '
        + (check.bookingVersion === state.booking.version ? 'current' : 'previous') + ' booking.';
    } else if (check.reasonCodes?.length) checkText += ' ' + reasonText(check.reasonCodes);
  }
  $('watch-last-check').textContent = checkText;
  $('watch-next-check').textContent = watch.status === 'active' && watch.nextCheckAt
    ? 'Next daily check due ' + instant(watch.nextCheckAt, watch.timeZone) + '.' : '';
  $('watch-frequency').textContent = 'Daily simulated price checks · ' + cadence(state.preferences?.notificationFrequency)
    + ' · update previews only · no email is sent. Every switch needs separate approval.';

  const intent = watch.consentIntents?.[watch.enabled ? 'disable' : 'enable'];
  const hasCommand = Boolean(command);
  button.setAttribute('aria-pressed', String(watch.enabled));
  button.disabled = busy || refreshRequired || Boolean(pending && !command)
    || (!hasCommand && (!intent || (!watch.enabled && (finalDrop || watch.status === 'ended')) || (!watch.enabled && !checkbox.checked)));
  button.classList.toggle('stopping', watch.enabled && !command);
  button.textContent = busy && command ? 'Saving price watch…' : command ? 'Retry the same watch action'
    : watch.enabled ? 'Stop price watch' : finalDrop || watch.status === 'ended' ? 'Price watch ended' : 'Turn on price watch';
}
export function renderNotificationPreviews(data, { instant, error = '' }) {
  const records = (data?.notifications || []).filter(record => record.deliveryMode === 'preview-only' && record.isSimulated === true);
  $('notification-count').textContent = records.length ? '(' + records.length + ')' : '';
  const rows = records.map(record => {
    const row = document.createElement('li');
    row.dataset.notificationId = record.notificationId;
    const copy = {
      'watch-confirmed': 'Daily simulated checks are on. No switch was approved or started.',
      'offers-found': 'Simulated offers were found. Review their current prices before deciding.',
      'approval-request': 'Possible savings need your review. No switch has started.',
      'no-saving': 'A completed simulated check found no offer meeting your saved minimum.',
      failed: 'The simulated rate check failed. This does not show that no lower price exists.',
      skipped: 'The simulated check was skipped because a saved safety condition changed.',
      'refund-pending': record.message,
      'refund-completed': 'The refund is marked complete in this demo.',
      'agency-attention': record.title === 'Cancellation needs attention'
        ? 'The cancellation result is unknown. No refund or saving is confirmed.'
        : 'The simulated switch is paused for review. No cancellation result is recorded.',
      'weekly-digest': 'Weekly update previews are available. This preview was not sent.'
    };
    row.append(element('h3', record.title), element('p', copy[record.kind] || 'A simulated booking update is available.'));
    const policy = record.status === 'pending-digest' ? 'Queued for ' + cadence(record.frequency).toLowerCase()
      : record.status === 'suppressed' ? 'Not included due to saved update settings' : 'Preview prepared';
    row.append(element('p', policy + ' · No email sent.', 'preview-policy'));
    const time = element('time', 'Recorded ' + instant(record.createdAt, 'Asia/Kuala_Lumpur'));
    time.dateTime = record.createdAt;
    row.append(time);
    return row;
  });
  if (error) rows.unshift(element('li', error, 'error small'));
  else if (!rows.length) rows.push(element('li', 'No saved update previews yet.', 'small muted'));
  $('notification-previews').replaceChildren(...rows);
}
