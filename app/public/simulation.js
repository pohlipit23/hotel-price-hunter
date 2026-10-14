/* Presents persisted server stages. This module never infers execution authority. */
const $ = id => document.getElementById(id);
const journeys = {
  'equivalent-saving': 'Equivalent stay · saving',
  'material-change': 'Changed offer · safety stop',
  'uncertain-cancellation': 'Uncertain cancellation · recovery'
};
const stages = {
  ready: ['Ready to check', 'Your original booking remains active. Next, the demo checks the current offer and your permission again.'],
  revalidated: ['Offer checked again', 'The equivalent offer is unchanged. A replacement still needs to be secured and its fulfilment verified.'],
  'replacement-secured': ['Replacement secured · simulated', 'A fictional replacement is reserved. Your original stays active until fulfilment and cancellation are verified.'],
  'fulfilment-verified': ['Replacement fulfilment verified · simulated', 'The fictional replacement has separate fulfilment proof. Next comes the original cancellation request.'],
  'cancellation-requested': ['Original cancellation requested · simulated', 'The request is recorded. Your original booking remains active until a known cancellation result is verified.'],
  'cancellation-verified': ['Saving secured · simulated', 'Cancellation is verified. The replacement is now your active demo booking; its refund is still pending.'],
  'refund-completed': ['Refund completed · simulated', 'A fictional refund receipt is saved. No real money has been sent or received.'],
  'agency-exception': ['Cancellation uncertain · agency review', 'The cancellation outcome is unknown. Your original remains active, no saving is secured and no refund has started.']
};
const pendingKey = 'hph-simulated-command-v1';
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function loadPending() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(pendingKey));
    if (saved?.kind === 'start' && Object.hasOwn(journeys, saved.body?.scenarioId) && typeof saved.key === 'string') return saved;
    if (saved?.kind === 'advance' && typeof saved.operationId === 'string' && Number.isSafeInteger(saved.body?.expectedOperationRevision)) return saved;
  } catch { /* The server's deterministic intents also protect retries when browser storage is unavailable. */ }
  return null;
}
export function setupSimulation({ getState, request, renderState, money, instant, getBusy, setBusy, openPreferences }) {
  let pending = loadPending();
  let message = '';
  let messageError = false;
  let renderedOperation;
  let refreshRequired = false;
  function remember(command) {
    pending = command;
    try {
      if (command) sessionStorage.setItem(pendingKey, JSON.stringify(command));
      else sessionStorage.removeItem(pendingKey);
    } catch { /* Retain the same command in memory for this page. */ }
  }
  function render() {
    const state = getState();
    if (!state) return;
    const simulation = state.simulation;
    const operation = simulation?.operation;
    if (pending?.kind === 'start') {
      const currentIntent = simulation?.scenarios?.find(item => item.id === pending.body.scenarioId)?.intent;
      if (operation && operation.operationId !== `sim-${pending.key}`) {
        remember(null);
        message = 'Latest saved journey restored. The previous retry belongs to a different journey; review the saved progress.';
        messageError = false;
      } else if (currentIntent?.idempotencyKey && currentIntent.idempotencyKey !== pending.key) {
        remember(null);
        $('switch-scenario').value = simulation.scenarioId;
        message = 'A new demo session is shown. Review and save its price watch permission before starting.';
        messageError = false;
      }
    } else if (pending?.kind === 'advance' && (!operation || operation.operationId !== pending.operationId)) {
      remember(null);
      message = 'Latest demo state restored. The previous retry does not match this journey; review the current permission and progress.';
      messageError = false;
    }
    if (pending && operation) {
      const resolvedStart = pending.kind === 'start' && operation.scenarioId === pending.body.scenarioId && operation.bookingVersion === pending.body.bookingVersion && operation.offerId === pending.body.offerId && operation.preferenceVersion === pending.body.preferenceVersion;
      const resolvedAdvance = pending.kind === 'advance' && operation.operationId === pending.operationId && operation.revision > pending.body.expectedOperationRevision;
      if (resolvedStart || resolvedAdvance) { remember(null); message = 'Latest saved progress restored.'; messageError = false; }
    }
    const scenario = $('switch-scenario');
    if (operation) scenario.value = operation.scenarioId;
    if (pending?.kind === 'start') scenario.value = pending.body.scenarioId;
    scenario.disabled = getBusy() || Boolean(operation) || Boolean(pending);
    const intent = simulation?.scenarios?.find(item => item.id === scenario.value)?.intent;
    const candidate = state.offers.find(offer => offer.offerId === intent?.offerId);
    const canStart = Boolean(intent) && state.enrolled && candidate?.decision?.action === 'automatic' && candidate.decision.authority === 'standing';
    $('switch-guidance').textContent = operation
      ? 'This journey is saved. Refreshing restores the latest stage; each advance records only one step.'
      : 'Every journey starts with the same equivalent refundable offer. Save explicit equivalent-only permission in your price watch first.';
    $('switch-progress').hidden = !operation;
    $('switch-permission').hidden = Boolean(operation) || canStart || Boolean(pending);
    $('switch-permission').disabled = getBusy();
    if (operation) {
      const stopped = operation.status === 'awaits-renewed-approval';
      const exception = operation.status === 'agency-exception';
      const failed = operation.status === 'failed';
      const copy = stopped
        ? ['Offer changed · approval needed', 'The final check found a different price and room condition. The demo stops for renewed approval. No replacement or cancellation has been made.']
        : failed ? ['Switch stopped safely', 'The latest checks no longer support this switch. No automatic next step is available; review your saved price watch and the stage history.']
          : exception ? (operation.scenarioId === 'uncertain-cancellation' && operation.cancellation?.status === 'unknown'
            ? stages['agency-exception'] : ['Agency review needed', 'The switch has stopped with a proof or permission gap. Review the saved history; no further automatic action is available.'])
            : stages[operation.stage] || ['Saved switch progress', 'The latest server stage is shown in the saved history.'];
      $('switch-stage').textContent = copy[0];
      $('switch-explanation').textContent = copy[1];
      $('switch-stage').classList.toggle('needs-review', stopped || exception || failed);
      const replacement = operation.replacementBooking || operation.revalidatedOffer;
      const snapshots = [[operation.originalBooking, 'Original booked stay'], [replacement, operation.replacementBooking ? 'Replacement · simulated' : 'Checked offer']];
      $('switch-snapshots').replaceChildren(...snapshots.filter(([record]) => record).map(([record, label]) => {
        const box = node('div');
        box.append(node('p', label, 'eyebrow'), node('p', `${record.hotel.name} · ${record.room.name}`, 'small'), node('strong', money(record.retail.totalMinor, record.retail.currency)));
        return box;
      }));
      if (stopped && operation.revalidatedOffer) {
        const fieldNames = { boardBasis: 'Meals', bedType: 'Bed type', nonSmoking: 'Non-smoking', accessible: 'Accessible room', view: 'View', roomSizeSqm: 'Room size (m²)' };
        const readable = value => value === null || value === undefined ? 'Not verified' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, character => character.toUpperCase());
        const changes = Object.entries(operation.revalidatedOffer.room.conditions).filter(([key, value]) => operation.originalBooking.room.conditions[key] !== value).map(([key, value]) => `${fieldNames[key] || 'Room condition'}: ${readable(operation.originalBooking.room.conditions[key])} → ${readable(value)}`);
        if (changes.length) $('switch-explanation').append(node('span', changes.join(' · '), 'switch-term-change'));
      }
      const refund = operation.refund;
      const amount = money(refund?.amountMinor, refund?.currency);
      const refundCopy = refund?.status === 'completed' ? `${amount} · completed (simulated)` : refund?.status === 'pending' ? `${amount} · pending` : 'Not started';
      $('switch-money').replaceChildren(node('dt', operation.savingSecured ? 'Saving secured · simulated' : 'Proposed refund after fees'), node('dd', amount), node('dt', 'Refund'), node('dd', refundCopy));
      const history = simulation.history || operation.history || [];
      $('switch-history').replaceChildren(...history.map(item => {
        const row = node('li');
        row.append(node('strong', item.status === 'awaits-renewed-approval' ? 'Offer changed · approval needed' : item.status === 'agency-exception' ? 'Agency review · outcome uncertain' : item.status === 'failed' ? 'Switch stopped safely' : stages[item.stage]?.[0] || 'Saved safety check'), node('p', item.message, 'small'), node('time', instant(item.demoAt, 'UTC'), 'small muted'));
        return row;
      }));
      if (renderedOperation !== operation.operationId) $('switch-history-details').open = true;
      renderedOperation = operation.operationId;
    }
    const canRecover = operation?.scenarioId === 'uncertain-cancellation' && operation.status === 'agency-exception' && operation.cancellation?.status === 'unknown';
    const canAdvance = operation?.status === 'running' || canRecover;
    const button = $('advance-demo');
    button.disabled = getBusy() || refreshRequired || (!pending && (operation ? !canAdvance : !canStart));
    button.textContent = getBusy() ? 'Saving demo progress…' : refreshRequired ? 'Refresh page before advancing' : pending ? 'Retry the same demo step' : canRecover ? 'Advance demo · check cancellation result' : operation?.status === 'complete' ? 'Demo complete · refund simulated' : operation && !canAdvance ? 'Demo paused · review needed' : operation ? 'Advance demo · next step' : 'Advance demo · start switch';
    $('simulated-switch').setAttribute('aria-busy', String(getBusy()));
    $('switch-message').textContent = message;
    $('switch-message').classList.toggle('error', messageError);
  }
  async function advance() {
    if (getBusy() || refreshRequired) return;
    const state = getState();
    const operation = state.simulation?.operation;
    let command = pending;
    if (!command && operation) command = { kind: 'advance', operationId: operation.operationId, body: { expectedOperationRevision: operation.revision } };
    if (!command) {
      const intent = state.simulation?.scenarios?.find(item => item.id === $('switch-scenario').value)?.intent;
      if (!intent) return;
      const { idempotencyKey, ...body } = intent;
      command = { kind: 'start', body, key: idempotencyKey };
    }
    remember(command);
    message = ''; messageError = false;
    setBusy(true);
    try {
      const path = command.kind === 'start' ? '/api/switches' : `/api/switches/${encodeURIComponent(command.operationId)}/advances`;
      const result = await request(path, command.body, command.kind === 'start' ? { 'Idempotency-Key': command.key } : undefined);
      remember(null);
      message = result.replayed ? 'This step was already saved. The latest progress is shown.' : 'Demo progress saved.';
      renderState(result);
    } catch (error) {
      messageError = true;
      if (error.status === 409) {
        remember(null);
        try {
          renderState(await request('/api/bootstrap?scenario=jury-booking'));
          message = 'The booking, permission or saved stage changed. Latest values are shown. Review them before advancing again.';
        } catch { refreshRequired = true; message = 'Could not refresh the latest saved state. Refresh this page before advancing again.'; }
      } else if (error.status && error.status < 500) {
        remember(null);
        message = 'This demo step was not accepted. Refresh and review your saved permission and progress before trying again.';
      } else {
        message = 'The result could not be confirmed. Retry the same demo step or refresh to see saved progress. No new step will be sent by a retry.';
      }
    } finally { setBusy(false); render(); }
  }
  $('switch-scenario').addEventListener('change', () => { message = ''; messageError = false; render(); });
  $('advance-demo').addEventListener('click', advance);
  $('switch-permission').addEventListener('click', openPreferences);
  return { render };
}
