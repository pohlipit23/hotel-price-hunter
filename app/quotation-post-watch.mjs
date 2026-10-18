import { createSessionActions, actionError } from './quotation-session-actions.mjs';

const failureCodes = new Map([
  ['BOOKING_UNAVAILABLE', 404],
  ['DEMO_SESSION_REQUIRED', 403], ['WATCH_NOT_ARMED', 409], ['DROPS_CHANGED', 409], ['DROP_SET_CHANGED', 409],
  ['CAPTURE_UNAVAILABLE', 503], ['WATCH_CANNOT_START', 409], ['OPTION_UNAVAILABLE', 404], ['INVALID_SELECTION', 400],
  ['INVALID_ADVICE', 400], ['FLEXIBILITY_ACKNOWLEDGEMENT_REQUIRED', 400], ['ADVICE_RATE_LIMIT', 429], ['ADVICE_UNAVAILABLE', 503],
]);
function validateAdvice(body, chat) {
  const allowed = ['optionId', 'snapshotVersion', 'watchBinding', 'message', ...(chat ? ['pageContext', 'intent'] : [])];
  if (Object.keys(body).some(key => !allowed.includes(key))
    || (!chat && (typeof body.optionId !== 'string' || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1200))
    || (chat && (!['drops-overview', 'drop-detail'].includes(body.pageContext) || !['opening', 'question'].includes(body.intent)
      || (body.intent === 'question' && (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1200))
      || (body.intent === 'opening' && Object.hasOwn(body, 'message'))
      || (body.pageContext === 'drops-overview' && Object.hasOwn(body, 'optionId'))
      || (body.pageContext === 'drop-detail' && typeof body.optionId !== 'string')))) throw actionError('INVALID_ADVICE', 400);
}
// Owns only confirm/advice/chat. GET and the atomic arm continue to belong to Part 1.
export function createPostWatchHandler({ sessionStorage, bookingStorage, bundles, now, advisor }) {
  const actions = createSessionActions({ sessionStorage, now });
  let adviceWindow = 0, adviceCount = 0, pending = 0;
  return async ({ req, res, code, action, cookie, origin, json, error }) => {
    try {
      if (!bundles.has(code)) return error(404, 'BOOKING_UNAVAILABLE');
      if (!cookie || req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return error(403, 'DEMO_SESSION_REQUIRED');
      const session = await sessionStorage.get(cookie);
      if (!session || session.expiresAt <= now().getTime() || req.headers['x-csrf-token'] !== session.csrfToken) return error(403, 'DEMO_SESSION_REQUIRED');
      if (!(req.headers['content-type'] ?? '').startsWith('application/json')) return error(400, 'INVALID_SELECTION');
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 4096) return error(413, 'SELECTION_TOO_LARGE'); chunks.push(chunk); }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return error(400, 'INVALID_SELECTION'); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return error(400, 'INVALID_SELECTION');
      const readBundle = async () => {
        const record = await bookingStorage.getBooking(code);
        const loaded = bundles.get(code);
        const expectedContent = loaded.contentVersion ?? loaded.snapshotVersion;
        if (!record || record.contentVersion !== expectedContent
          || (loaded.dropSetVersion !== undefined && record.dropSetVersion !== loaded.dropSetVersion)) throw actionError('DROPS_CHANGED');
        const captured = await bookingStorage.getDrops(code, { dropSetVersion: record.dropSetVersion });
        if (!['observed', 'observed-empty'].includes(captured.captureStatus) || !Array.isArray(captured.drops)) throw actionError('CAPTURE_UNAVAILABLE', 503);
        if (captured.dropSetVersion !== record.dropSetVersion) throw actionError('DROPS_CHANGED');
        return { ...record.bundle, options: captured.drops, contentVersion: record.contentVersion, dropSetVersion: record.dropSetVersion };
      };
      const bundle = await readBundle(), args = { id: cookie, code, csrfToken: session.csrfToken, bundle, body };
      if (action === 'confirm') return json(res, 200, { confirmation: await actions.confirm(args) });
      const chat = action === 'chat'; validateAdvice(body, chat);
      if (!advisor?.available || typeof advisor[chat ? 'chat' : 'advise'] !== 'function') return error(503, 'ADVICE_UNAVAILABLE');
      const time = now().getTime();
      if (time - adviceWindow >= 60000) { adviceWindow = time; adviceCount = 0; }
      if (adviceCount >= 20 || pending >= 2) return error(429, 'ADVICE_RATE_LIMIT');
      adviceCount++; pending++;
      try {
        const ticket = await actions.reserve(args), option = ticket.options.find(value => value.optionId === ticket.optionId);
        // This call is deliberately between, and outside, the two session transactions.
        const advice = chat ? await advisor.chat({ baseline: bundle.baseline, options: ticket.options,
          pageContext: body.pageContext, optionId: ticket.optionId, snapshotVersion: bundle.snapshotVersion,
          checkedAt: bundle.checkedAt, intent: body.intent, message: body.message, history: ticket.chatHistory })
          : await advisor.advise({ baseline: bundle.baseline, option, checkedAt: bundle.checkedAt, message: body.message, history: ticket.adviceHistory });
        const current = await readBundle();
        await actions.merge({ ...args, bundle: current, ticket, advice, chat });
        return json(res, 200, { advice, optionId: ticket.optionId, ...(chat ? { pageContext: body.pageContext } : {}),
          snapshotVersion: bundle.snapshotVersion, source: advisor.status === 'test-injected' ? 'test-injected' : 'vertex-gemini', selectionChanged: false });
      } finally { pending--; }
    } catch (failure) {
      const status = failureCodes.get(failure.code);
      const code = failure.code === 'DROP_SET_CHANGED' ? 'DROPS_CHANGED' : failure.code;
      return error(status ?? 503, status ? code : 'DEMO_UNAVAILABLE', code === 'WATCH_CANNOT_START' ? { reason: failure.reason } : {});
    }
  };
}
