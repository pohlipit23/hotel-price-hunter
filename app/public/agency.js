/* Read-only fixture review. Google-managed credentials never enter this script. */
'use strict';
const $ = id => document.getElementById(id);
let session = null, nextCursor = null, pageCursor = null, busy = false, selectedCase = null;
let expiryTimer, accessGeneration = 0;
const shellMode = document.querySelector('meta[name="agency-auth-mode"]')?.content;
let authMode = ['local-review', 'google-iap'].includes(shellMode) ? shellMode : null;
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function value(value) {
  if (value === null || value === undefined) return 'Not verified';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replaceAll('_', ' ').replaceAll('-', ' ').toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
}
function instant(input) {
  if (!input || Number.isNaN(Date.parse(input))) return 'Not verified';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(input)) + ' (UTC)';
}
function amount(refund) {
  if (!Number.isSafeInteger(refund?.amountMinor) || refund.currency !== 'USD') return 'Not verified';
  return 'USD ' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(refund.amountMinor / 100);
}
function status(text, error = false) { $('agency-message').textContent = text; $('agency-message').classList.toggle('error', error); }
function setBusy(value) {
  busy = value;
  for (const button of document.querySelectorAll('button')) button.disabled = value;
  $('agency-passphrase').disabled = value;
  $('main').setAttribute('aria-busy', String(value));
}
function updateAccessControls() {
  $('agency-managed-access').hidden = authMode !== 'google-iap';
  $('agency-check-access').hidden = authMode === 'local-review';
  $('agency-login').hidden = authMode !== 'local-review' || !!session;
  $('agency-logout').hidden = authMode !== 'local-review';
}
function clearAccess() {
  clearTimeout(expiryTimer);
  accessGeneration++;
  session = null; selectedCase = null; nextCursor = null; pageCursor = null;
  $('agency-session').hidden = true; $('agency-overview').hidden = true;
  $('agency-case-detail').hidden = true; $('agency-case-detail').replaceChildren(); $('agency-cases').replaceChildren();
  $('agency-first-page').hidden = true; $('agency-next-page').hidden = true;
  $('agency-passphrase').value = '';
  updateAccessControls();
}
function expiredMessage() {
  return authMode === 'google-iap' ? 'Your access check expired. Check access again to continue agency review.' : 'Your session expired. Sign in to continue agency review.';
}
async function request(path, options = {}) {
  let response, data;
  try {
    response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options });
    data = await response.json();
  } catch {
    clearAccess(); throw new Error('The review service could not be read. Check access again or reload this page.');
  }
  if (!response.ok) {
    if (!authMode && ['google-iap', 'local-review'].includes(data.authMode)) authMode = data.authMode;
    clearAccess();
    const denied = response.status === 401 || response.status === 403;
    const error = new Error(denied && authMode === 'google-iap' ? 'Google-managed access is unavailable. Check access again or contact your administrator.'
      : response.status === 503 ? 'Agency review is unavailable. Check access again or reload this page.'
      : denied && authMode === 'local-review' ? 'Sign in to continue agency review.' : data.error?.message || 'The review could not be loaded. Check access again.');
    error.status = response.status; throw error;
  }
  return data;
}
function showSession(data) {
  clearTimeout(expiryTimer);
  const mode = data.mode === 'local-fixture-review' ? 'local-review' : data.mode;
  if (data.authenticated !== true || !['local-review', 'google-iap'].includes(mode) || (authMode && authMode !== mode) || !(Date.parse(data.expiresAt) > Date.now())) {
    clearAccess(); throw new Error('Agency access could not be confirmed. Check access again or reload this page.');
  }
  authMode = mode;
  accessGeneration++;
  session = data;
  updateAccessControls();
  $('agency-login').hidden = true; $('agency-session').hidden = false; $('agency-overview').hidden = false;
  $('agency-session-title').textContent = authMode === 'google-iap' ? 'Google-managed agency access' : 'Local fixture review';
  $('agency-session-expiry').textContent = (authMode === 'google-iap' ? 'Current access check expires ' : 'Session expires ') + instant(data.expiresAt);
  expiryTimer = setTimeout(() => { clearAccess(); status(expiredMessage()); }, Math.max(0, Date.parse(data.expiresAt) - Date.now()));
}
function requireSession(generation = accessGeneration) {
  if (generation !== accessGeneration) { const error = new Error('Access changed. Check access again or reload this page.'); error.status = 401; throw error; }
  if (session && Date.parse(session.expiresAt) > Date.now()) return;
  clearAccess(); const error = new Error(expiredMessage()); error.status = 401; throw error;
}
function factSection(title, rows) {
  const section = node('section'), list = node('dl', undefined, 'agency-facts');
  section.append(node('h3', title), list);
  list.append(...rows.flatMap(([label, text]) => [node('dt', label), node('dd', text)]));
  return section;
}
function caseButton(item) {
  const button = node('button', undefined, 'agency-case-button'); button.type = 'button';
  button.dataset.caseId = item.caseId;
  button.setAttribute('aria-current', String(item.caseId === selectedCase));
  const pills = node('div', undefined, 'pills');
  pills.append(node('span', value(item.status), 'pill'), node('span', value(item.stage), 'pill'), node('span', 'Simulated', 'pill'));
  button.append(node('h3', item.hotelName), pills,
    node('p', 'Cancellation: ' + value(item.cancellationStatus) + ' · Saving secured: ' + value(item.savingSecured)),
    node('p', 'Refund: ' + value(item.refundStatus) + ' · Monitoring: ' + value(item.monitoringStatus)),
    node('p', 'Updated ' + instant(item.updatedAt)));
  if (item.reasonCodes?.length) button.append(node('p', 'Stopped checks: ' + item.reasonCodes.map(value).join(' · ')));
  button.append(node('span', 'Review case', 'small'));
  button.addEventListener('click', () => loadDetail(item.caseId)); return button;
}
async function loadCases(cursor = null) {
  const generation = accessGeneration;
  const data = await request('/api/agency/cases?limit=20' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
  requireSession(generation);
  pageCursor = cursor; nextCursor = data.nextCursor;
  $('agency-cases').replaceChildren(...data.cases.map(caseButton));
  if (!data.cases.length) $('agency-cases').append(node('p', 'No saved simulated switches to review.', 'empty-offers'));
  $('agency-next-page').hidden = !nextCursor; $('agency-first-page').hidden = !pageCursor;
}
function renderDetail(record) {
  const detail = $('agency-case-detail'); selectedCase = record.caseId;
  const title = node('h2', record.sourceBooking?.hotelName || 'Saved case'); title.id = 'agency-detail-title'; title.tabIndex = -1;
  detail.replaceChildren(title, node('p', 'Simulated case · ' + value(record.status) + ' · ' + value(record.stage), 'muted small'));
  if (record.cancellation?.status === 'unknown') detail.append(node('p', 'Cancellation outcome is unknown. The original remains active; no saving is secured and no refund has started.', 'agency-alert'));
  else if (record.reasonCodes?.length) detail.append(node('p', 'Stopped checks: ' + record.reasonCodes.map(value).join(' · '), 'agency-alert'));
  detail.append(factSection('Saving and refund', [
    ['Saving secured', value(record.savingSecured)], [record.savingSecured ? 'Secured net saving · simulated' : 'Potential net refund after fees', amount(record.refund)],
    ['Refund status', value(record.refund?.status)], ['Normal monitoring', value(record.monitoring?.status)], ['Monitoring reason', value(record.monitoring?.reason)]
  ]));
  const source = record.sourceBooking, replacement = record.replacement;
  detail.append(factSection('Booking and replacement', [
    ['Original room', source?.roomName || 'Not verified'], ['Original cancellation terms', value(source?.refundability)],
    ['Replacement hotel', replacement?.hotelName || 'Not secured'], ['Replacement room', replacement?.roomName || 'Not secured'],
    ['Replacement cancellation terms', replacement ? value(replacement.refundability) : 'Not secured'],
    ['Fulfilment status', replacement ? value(replacement.fulfilmentStatus) : 'Not started'], ['Fulfilment verified', replacement ? value(replacement.fulfilmentVerified) : 'No']
  ]));
  const cancellation = record.cancellation;
  detail.append(factSection('Cancellation proof', [
    ['Outcome', value(cancellation?.status)], ['Original remains active', value(cancellation?.originalActive)], ['Proof present', value(cancellation?.proofPresent)]
  ]));
  if (cancellation?.observations?.length) {
    const section = node('section'), list = node('ol', undefined, 'agency-history');
    section.append(node('h3', 'Cancellation observations'), list);
    list.append(...cancellation.observations.map(item => {
      const row = node('li'); row.append(node('strong', value(item.status) + ' · Proof present: ' + value(item.proofPresent)), node('time', 'Demo: ' + instant(item.demoAt) + ' · Recorded: ' + instant(item.recordedAt))); return row;
    })); detail.append(section);
  }
  const authority = record.authority;
  detail.append(factSection('Recorded authority', [
    ['Type', value(authority?.type)], ['Scope', value(authority?.scope)], ['Confirmed', value(authority?.confirmed)],
    ['Current binding valid', value(authority?.valid)], ['Booking version', value(authority?.bookingVersion)],
    ['Offer version', value(authority?.offerVersion)], ['Stay requirements version', value(authority?.preferenceVersion)],
    ['Reduced flexibility accepted', authority?.acceptReducedFlexibility === true ? 'Yes' : 'Not recorded'],
    ['Expires', instant(authority?.expiresAt)], ['Revoked', authority?.revokedAt ? instant(authority.revokedAt) : 'No'],
    ['Authority checks', authority?.reasonCodes?.length ? authority.reasonCodes.map(value).join(' · ') : 'No failed checks recorded']
  ]));
  if (record.savingSecured && authority?.valid === false) detail.append(node('p', 'The original approval binding may no longer be current after the replacement becomes the booking. The saved refund status is shown separately above.', 'muted small'));
  const history = node('details'), list = node('ol', undefined, 'agency-history'); history.append(node('summary', 'Saved history'), list);
  list.append(...(record.history || []).map(item => {
    const row = node('li'); row.append(node('strong', value(item.stage) + ' · ' + value(item.status)), node('p', item.message), node('time', 'Demo: ' + instant(item.demoAt) + ' · Recorded: ' + instant(item.recordedAt))); return row;
  })); detail.append(history); detail.hidden = false;
  for (const button of $('agency-cases').querySelectorAll('button')) button.setAttribute('aria-current', String(button.dataset.caseId === selectedCase));
  title.focus(); detail.scrollIntoView({ block: 'start', behavior: 'instant' });
}
async function loadDetail(caseId) {
  if (busy || !session) return;
  setBusy(true); status('Loading case…');
  const generation = accessGeneration;
  try { const data = await request('/api/agency/cases/' + encodeURIComponent(caseId)); requireSession(generation); renderDetail(data.case); status(''); }
  catch (error) { status(error.message, true); }
  finally { setBusy(false); }
}
async function changePage(cursor) {
  if (busy || !session) return;
  setBusy(true); status('Loading cases…');
  try { await loadCases(cursor); status(''); }
  catch (error) { status(error.message, true); }
  finally { setBusy(false); }
}
$('agency-login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || authMode !== 'local-review') return;
  const passphrase = $('agency-passphrase').value;
  $('agency-passphrase').value = ''; setBusy(true); status('Signing in…');
  try {
    showSession(await request('/api/agency/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passphrase }) }));
    await loadCases(); status(''); $('agency-cases-title').tabIndex = -1; $('agency-cases-title').focus();
  } catch (error) { status(error.message, true); }
  finally { setBusy(false); }
});
$('agency-logout').addEventListener('click', async () => {
  if (busy || !session || authMode !== 'local-review') return;
  setBusy(true); status('Signing out…');
  try { await request('/api/agency/session', { method: 'DELETE', headers: { 'X-CSRF-Token': session.csrfToken } }); clearAccess(); status('Signed out.'); }
  catch (error) { status(error.message, true); }
  finally { setBusy(false); if (!session) $('agency-passphrase').focus(); }
});
$('agency-next-page').addEventListener('click', () => changePage(nextCursor));
$('agency-first-page').addEventListener('click', () => changePage(null));
async function bootstrap() {
  setBusy(true);
  try { showSession(await request('/api/agency/session')); await loadCases(); status(''); }
  catch (error) { clearAccess(); status(error.message, error.status !== 401); }
  finally { setBusy(false); }
}
$('agency-check-access').addEventListener('click', () => { if (!busy) { clearAccess(); status('Checking access…'); bootstrap(); } });
updateAccessControls();
bootstrap();
