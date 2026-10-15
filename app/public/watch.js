/* Read-only presentation of saved watch facts and simulated notification previews. */
const $ = id => document.getElementById(id);
const reasons = {
  NOT_OPTED_IN: 'Daily simulated checks and alerts only.', WATCH_STOPPED: 'Future checks and alerts are stopped.',
  SWITCH_IN_PROGRESS: 'A simulated switch is in progress.', NON_REFUNDABLE_BOOKING: 'Your current booking is non-refundable.',
  NON_REFUNDABLE_BASELINE: 'Your current booking is non-refundable.', CANCELLATION_WINDOW_EXPIRED: 'The free-cancellation deadline has passed.',
  CANCELLATION_WINDOW_ENDED: 'The free-cancellation deadline has passed.', UNKNOWN_CANCELLATION_POLICY: 'Cancellation terms need verification.',
  UNKNOWN_CANCELLATION: 'Cancellation terms need verification.', SOURCE_UNAVAILABLE: 'Demo rates are unavailable for this stay.',
  SESSION_EXPIRED: 'The saved demo session has expired.', BOOKING_VERSION_CHANGED: 'The booking changed.',
  WATCH_VERSION_CHANGED: 'Watch consent changed.', PREFERENCES_VERSION_CHANGED: 'Stay requirements changed.',
  PROVIDER_UNAVAILABLE: 'The simulated provider was unavailable.', PROVIDER_FAILED: 'The simulated provider check failed.',
  REFUNDABLE_BASELINE: 'Daily simulated checks and alerts only.', UNKNOWN_CANCELLATION_FACTS: 'Cancellation terms need verification.'
};
function reasonText(codes) { return [...new Set((codes || []).map(code => reasons[code] || 'A saved safety check could not be verified.'))].join(' '); }
function element(tag, text, className) {
  const item = document.createElement(tag); item.textContent = text;
  if (className) item.className = className;
  return item;
}
export function renderWatch(state, { busy, pending, refreshRequired, message, messageError, money, instant }) {
  const watch = state.priceWatch;
  $('price-watch').hidden = !watch;
  if (!watch) return;
  $('price-watch').setAttribute('aria-busy', String(busy));
  const status = { active: 'Watching · You approve every switch.', stopped: 'Watch stopped', paused: 'Watch paused', ended: 'Watch ended' }[watch.status] || 'Watch status unavailable';
  const ordinaryReason = ['NOT_OPTED_IN', 'REFUNDABLE_BASELINE', 'WATCH_STOPPED', 'SWITCH_IN_PROGRESS'].includes(watch.reason);
  $('watch-status').textContent = (watch.reason === 'NOT_OPTED_IN' ? 'Daily checks. You approve every switch.' : watch.reason === 'SWITCH_IN_PROGRESS' ? 'Paused during your switch.' : status)
    + (watch.reason && !ordinaryReason ? ' · ' + reasonText([watch.reason]) : '') + (message ? ' ' + message : '');
  if (watch.status === 'active' && watch.lastCheck?.status === 'failed' && !message) {
    $('watch-status').textContent = watch.lastCheck.reasonCodes?.includes('SOURCE_UNAVAILABLE')
      ? 'Latest check failed · Demo rates unavailable for this stay.' : 'Latest check failed. See watch details.';
  }
  $('watch-status').classList.toggle('error', messageError);
  const check = watch.lastCheck;
  let checkText = 'No recorded simulated check yet.';
  if (check) {
    const outcome = { 'offers-found': 'Offers found', 'no-saving': 'No eligible saving found', failed: 'Check failed', skipped: 'Check skipped' }[check.status] || 'Result unavailable';
    checkText = 'Latest simulated check: ' + outcome + ' · Recorded ' + instant(check.recordedAt, check.timeZone || watch.timeZone) + '.';
    if (check.status === 'offers-found' && check.searched === true && check.isSimulated === true) {
      const quoted = (check.checkOffers || []).filter(offer => offer.bookingVersion === check.bookingVersion
        && offer.currency === offer.retail?.currency && offer.actionable === false
        && Number.isSafeInteger(offer.netSavingMinor) && offer.netSavingMinor > 0);
      const best = quoted.toSorted((a, b) => b.netSavingMinor - a.netSavingMinor)[0];
      if (best) checkText += ' ' + quoted.length + (quoted.length === 1 ? ' offer' : ' offers') + ' · Up to ' + money(best.netSavingMinor, best.currency) + ' potential saving after fees for your ' + (check.bookingVersion === state.booking.version ? 'current' : 'previous') + ' booking.';
    } else if (check.reasonCodes?.length) checkText += ' ' + reasonText(check.reasonCodes);
  }
  $('watch-last-check').textContent = checkText;
  $('watch-next-check').textContent = watch.status === 'active' && watch.nextCheckAt ? 'Next daily check due ' + instant(watch.nextCheckAt, watch.timeZone) + '.' : '';
  const frequency = { weekly: 'Weekly update previews', daily: 'Daily update previews', 'offers-only': 'Offer previews only' }[state.preferences?.notificationFrequency] || 'Weekly update previews';
  $('watch-frequency').textContent = frequency + ' · Simulated checks and alerts only; each switch needs your approval.';
  const button = $('watch-button');
  const command = pending?.kind === 'watch' ? pending : null;
  const intent = watch.consentIntents?.[watch.enabled ? 'disable' : 'enable'];
  button.disabled = busy || refreshRequired || Boolean(pending && !command) || (!command && (!intent || (!watch.enabled && watch.status === 'ended')));
  button.classList.toggle('stopping', watch.enabled && !command);
  button.textContent = busy && command ? 'Saving watch…' : command ? 'Retry the same watch action' : watch.enabled ? 'Stop watching' : 'Watch for better rates';
}
export function renderNotificationPreviews(data, { instant, error = '' }) {
  const records = (data?.notifications || []).filter(record => record.deliveryMode === 'preview-only' && record.isSimulated === true);
  $('notification-count').textContent = records.length ? '(' + records.length + ')' : '';
  const rows = records.map(record => {
    const row = document.createElement('li'); row.dataset.notificationId = record.notificationId;
    row.append(element('h3', record.title), element('p', record.message));
    const policy = record.status === 'pending-digest' ? 'Queued for ' + record.frequency + ' preview digest' + (record.dueAt ? ' · Due ' + instant(record.dueAt, 'Asia/Kuala_Lumpur') : '')
      : record.status === 'suppressed' ? 'Preview suppressed by saved update preference' : 'Prepared preview';
    row.append(element('p', policy + (record.reason ? ' · ' + record.reason.replaceAll('_', ' ').toLowerCase() : '') + ' · No email sent.', 'preview-policy'));
    const time = element('time', 'Recorded ' + instant(record.createdAt, 'Asia/Kuala_Lumpur'));
    time.dateTime = record.createdAt; row.append(time);
    return row;
  });
  if (error) rows.unshift(element('li', error, 'error small'));
  else if (!rows.length) rows.push(element('li', 'No saved update previews yet.', 'small muted'));
  $('notification-previews').replaceChildren(...rows);
}
