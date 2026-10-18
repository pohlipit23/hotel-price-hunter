// Part 2 additions only. Session allocation, capacity, expiry ownership and arming belong to Part 1.
import { randomBytes } from 'node:crypto';
import { replayResult, watchBinding, currentConfirmation } from './public/booking-live-data.js';
import { watchBlocker } from './domain/altovo-quotation.mjs';
import { publicWatch } from './domain/booking-drop-watch.mjs';

export function actionError(code, status = 409, extra = {}) {
  return Object.assign(new Error('Reload RoomDrop and review the current Drops.'), { code, status, ...extra });
}
// Part 1's per-code GET can spread this read projection without changing the watch seam.
export function publicPostWatchState({ scope, bundle }) {
  // GET callers already supply a public watch; transaction callers may hold the stored address.
  const watch = scope?.watch?.delivery?.email ? publicWatch(scope.watch) : scope?.watch;
  const snapshot = { ...bundle, code: bundle.baseline.quotationCode, watch, confirmation: scope?.confirmation };
  const binding = watchBinding(watch);
  const current = ['completed', 'empty'].includes(replayResult(snapshot).status)
    && (scope?.contentVersion === undefined || scope.contentVersion === (bundle.contentVersion ?? bundle.snapshotVersion))
    && (scope?.dropSetVersion === undefined || bundle.dropSetVersion === undefined || scope.dropSetVersion === bundle.dropSetVersion);
  const history = current && scope.contextBinding === binding ? (scope.chatHistory ?? []).slice(-4) : [];
  return { confirmation: current ? currentConfirmation(snapshot) : null, conversation: { watchBinding: current ? binding : null,
    chatHistory: history.map(({ pageContext, optionId, snapshotVersion, question, reply }) => ({ pageContext, optionId, snapshotVersion, question, reply })) } };
}
export function requireCurrentWatch({ scope, bundle, body, at }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw actionError('INVALID_SELECTION', 400);
  if (body.snapshotVersion !== bundle.snapshotVersion) throw actionError('DROPS_CHANGED');
  if ((scope?.contentVersion !== undefined && scope.contentVersion !== (bundle.contentVersion ?? bundle.snapshotVersion))
    || (scope?.dropSetVersion !== undefined && bundle.dropSetVersion !== undefined && scope.dropSetVersion !== bundle.dropSetVersion)) throw actionError('DROPS_CHANGED');
  if (!scope?.watch) throw actionError('WATCH_NOT_ARMED');
  const watch = publicWatch(scope.watch);
  if ((watch.contentVersion !== undefined && watch.contentVersion !== (bundle.contentVersion ?? bundle.snapshotVersion))
    || (bundle.dropSetVersion !== undefined && watch.dropSetVersion !== bundle.dropSetVersion)) throw actionError('DROPS_CHANGED');
  const binding = watchBinding(watch);
  if ((watch.revision !== undefined && body.watchBinding === undefined)
    || (body.watchBinding !== undefined && watchBinding(body.watchBinding) !== binding)) throw actionError('DROPS_CHANGED');
  const replay = replayResult({ ...bundle, code: bundle.baseline.quotationCode, watch });
  if (!['completed', 'empty'].includes(replay.status)) throw actionError('CAPTURE_UNAVAILABLE', 503);
  const reason = watchBlocker(bundle.baseline, at);
  if (reason) throw actionError('WATCH_CANNOT_START', 409, { reason });
  if (scope.contextBinding !== binding) {
    scope.chatHistory = []; scope.adviceHistory = {}; scope.contextBinding = binding;
  }
  if (scope.confirmation && scope.confirmation.watchBinding !== binding) scope.confirmation = null;
  return { binding, options: replay.options };
}
export function selectDrop({ scope, bundle, body, at, selectionId, confirmedAt = at.toISOString() }) {
  const { binding, options } = requireCurrentWatch({ scope, bundle, body, at });
  const allowed = ['optionId', 'snapshotVersion', 'acceptedDemoOnly', 'acceptReducedFlexibility', 'watchBinding'];
  if (!body || Array.isArray(body) || Object.keys(body).some(key => !allowed.includes(key)) || body.acceptedDemoOnly !== true)
    throw actionError('INVALID_SELECTION', 400);
  const option = options.find(option => option.optionId === body.optionId);
  if (!option) throw actionError('OPTION_UNAVAILABLE', 404);
  if (option.freeCancellation !== true && body.acceptReducedFlexibility !== true) throw actionError('FLEXIBILITY_ACKNOWLEDGEMENT_REQUIRED', 400);
  if (option.freeCancellation === true && Object.hasOwn(body, 'acceptReducedFlexibility')) throw actionError('INVALID_SELECTION', 400);
  if (scope.confirmation?.optionId !== option.optionId) scope.confirmation = {
    status: 'demo-selection-confirmed', selectionId, optionId: option.optionId, snapshotVersion: bundle.snapshotVersion,
    watchBinding: binding, ...(scope.watch.revision !== undefined ? { watchRevision: scope.watch.revision } : {}),
    confirmedAt, reservationCreated: false, quoteModified: false, customerRefund: null,
  };
  return scope.confirmation;
}
export function reserveAdvice({ session, scope, bundle, body, at }) {
  const current = requireCurrentWatch({ scope, bundle, body, at });
  const option = current.options.find(option => option.optionId === body.optionId);
  if ((body.pageContext === 'drop-detail' || !body.pageContext) && !option) throw actionError('OPTION_UNAVAILABLE', 404);
  const time = at.getTime();
  if (time - (session.adviceWindow ?? 0) >= 60000) { session.adviceWindow = time; session.adviceCount = 0; }
  if ((session.adviceCount ?? 0) >= 4) throw actionError('ADVICE_RATE_LIMIT', 429);
  session.adviceCount = (session.adviceCount ?? 0) + 1;
  scope.adviceSequence = (scope.adviceSequence ?? 0) + 1;
  return { binding: current.binding, sequence: scope.adviceSequence, confirmationId: scope.confirmation?.selectionId ?? null,
    optionId: option?.optionId ?? null, options: option ? [option] : current.options,
    chatHistory: structuredClone(scope.chatHistory), adviceHistory: structuredClone(scope.adviceHistory[option?.optionId] ?? []) };
}
export function mergeAdvice({ scope, bundle, body, at, ticket, advice, chat }) {
  const { binding } = requireCurrentWatch({ scope, bundle, body, at });
  if (binding !== ticket.binding || scope.adviceSequence !== ticket.sequence
    || (scope.confirmation?.selectionId ?? null) !== ticket.confirmationId) throw actionError('DROPS_CHANGED');
  if (chat) {
    if (typeof advice?.reply !== 'string' || !advice.reply.trim() || advice.reply.length > 6000) throw actionError('ADVICE_UNAVAILABLE', 503);
    scope.chatHistory = [...scope.chatHistory, { pageContext: body.pageContext, optionId: ticket.optionId,
      snapshotVersion: bundle.snapshotVersion, question: body.intent === 'opening' ? 'Opening guidance' : body.message, reply: advice.reply }].slice(-4);
  } else {
    const { recommendation, priority, reasonCodes } = advice;
    scope.adviceHistory[ticket.optionId] = [...ticket.adviceHistory,
      { question: body.message, selection: { recommendation, priority, reasonCodes } }].slice(-2);
  }
}
// Adapts Part 1's synchronous transactional update helper without allocating sessions or writing watches.
// Contract v1: transact(cookieValue, fn) persists in-place changes and returns fn's result after commit.
export function createSessionActions({ sessionStorage, now = () => new Date() }) {
  if (typeof sessionStorage?.transact !== 'function') throw actionError('SESSION_STORAGE_REQUIRED', 503);
  const change = (id, code, csrfToken, operation) => sessionStorage.transact(id, session => {
    if (!session || !Number.isFinite(session.expiresAt) || session.expiresAt <= now().getTime()
      || session.csrfToken !== csrfToken) throw actionError('DEMO_SESSION_REQUIRED', 403);
    const scope = session.byCode?.[code];
    if (!scope) throw actionError('WATCH_NOT_ARMED');
    return operation(session, scope);
  });
  return {
    confirm: ({ id, code, csrfToken, bundle, body }) => {
      const confirmedAt = now().toISOString(), selectionId = `demo-${randomBytes(12).toString('hex')}`;
      return change(id, code, csrfToken, (session, scope) => selectDrop({ scope, bundle, body, at: now(), confirmedAt, selectionId }));
    },
    reserve: ({ id, code, csrfToken, bundle, body }) => change(id, code, csrfToken,
      (session, scope) => reserveAdvice({ session, scope, bundle, body, at: now() })),
    merge: ({ id, code, csrfToken, bundle, body, ticket, advice, chat }) => change(id, code, csrfToken,
      (session, scope) => { mergeAdvice({ scope, bundle, body, at: now(), ticket, advice, chat }); return true; }),
  };
}
