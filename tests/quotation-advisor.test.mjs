import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotationAdvisor } from '../app/quotation-advisor.mjs';

export const comparison = () => ({
  baseline: { quotationCode: 'PRIVATE-QUOTE', hotel: { id: 'PRIVATE-HOTEL', name: 'Demo Hotel' },
    stay: { checkin: '2026-11-10', checkout: '2026-11-12' }, occupancy: { adults: 2, childAges: [8], infantAges: [] },
    room: { name: 'King room', board: 'Breakfast' }, quotedRetail: { totalMinor: 60000, currency: 'USD' },
    freeCancellation: true, guestEmail: 'PRIVATE-EMAIL' },
  option: { optionId: 'option-1', roomName: 'Twin room', board: 'Room only', freeCancellation: false,
    estimate: { totalMinor: 48000, currency: 'USD', isEstimate: true }, privateReferences: 'PRIVATE-TOKEN' },
  checkedAt: '2026-10-17T00:00:00Z', message: 'My dates might change. Is this worth considering?', history: [],
});
const selection = (patch = {}) => ({ recommendation: 'keep-quotation', priority: 'flexibility', reasonCodes: ['reduced-flexibility', 'terms-unverified'], ...patch });
const provider = value => async () => ({ text: JSON.stringify(value) });

test('quotation adviser is off by default and makes no startup request', async () => {
  const advisor = await createQuotationAdvisor({ environment: {} });
  assert.equal(advisor.available, false); assert.equal(advisor.status, 'unconfigured');
  await assert.rejects(advisor.advise(comparison()), { code: 'ADVICE_UNAVAILABLE' });
});
test('Gemini receives only anonymised quotation facts and selects a grounded flexibility recommendation', async () => {
  let request;
  const advisor = await createQuotationAdvisor({ generateContent: async value => { request = value; return provider(selection())(); } });
  const reply = await advisor.advise(comparison());
  assert.equal(advisor.status, 'test-injected');
  assert.equal(reply.recommendation, 'keep-quotation'); assert.equal(reply.priority, 'flexibility');
  assert.match(reply.summary, /Keep your quotation/);
  assert.match(reply.tradeoffs.join(' '), /free cancellation|flexibility/);
  assert.match(reply.priceContext, /USD\s*120\.00.*before final retail pricing and fees/);
  assert.match(reply.limitations, /No reservation|no reservation/);
  assert.doesNotMatch(request.contents, /PRIVATE-|childAges|quotationCode|privateReferences|optionId/);
  assert.equal(JSON.parse(request.contents).quotation.occupancy.children, 1);
  assert.equal(request.config.responseMimeType, 'application/json');
  assert.equal(request.config.responseJsonSchema.additionalProperties, false);
  assert.equal(request.config.tools, undefined);
});

test('Gemini 3.8 Flash uses low thinking without deprecated sampling settings', async () => {
  let request;
  const advisor = await createQuotationAdvisor({ environment: { GEMINI_MODEL: 'gemini-3.8-flash' },
    generateContent: async value => { request = value; return provider(selection())(); } });
  await advisor.advise(comparison());
  assert.equal(request.model, 'gemini-3.8-flash');
  assert.equal(request.config.thinkingConfig.thinkingLevel, 'LOW');
  for (const key of ['temperature', 'topP', 'topK', 'candidateCount']) assert.equal(request.config[key], undefined);
  assert.equal(request.config.maxOutputTokens, 2048);
});
test('price and room questions use only their applicable grounded reasons', async () => {
  const advisor = await createQuotationAdvisor({ generateContent: provider(selection({ recommendation: 'consider-option', priority: 'price', reasonCodes: ['lower-estimate', 'different-room-label'] })) });
  const result = await advisor.advise(comparison());
  assert.match(result.summary, /worth reviewing/);
  assert.match(result.tradeoffs.join(' '), /different.*room|room.*different/i);
  const unknown = comparison(); unknown.option.freeCancellation = null;
  const caution = await createQuotationAdvisor({ generateContent: provider(selection({ reasonCodes: ['unknown-cancellation'] })) });
  assert.match((await caution.advise(unknown)).tradeoffs.join(' '), /not established/);
});
test('a supplier spelling of the booked room type and meal plan is not grounded as a different room or meals', async () => {
  const same = comparison(); same.option.roomName = 'KING ROOM, City View'; same.option.board = 'breakfast.';
  for (const code of ['different-room-label', 'different-board-label']) {
    const advisor = await createQuotationAdvisor({ generateContent: provider(selection({ reasonCodes: [code] })) });
    await assert.rejects(advisor.advise(same), { code: 'ADVICE_UNAVAILABLE' }, code);
  }
});
test('untrusted model prose, money, extra fields and unsupported facts never reach the customer', async () => {
  for (const result of [selection({ summary: 'USD 9500 refunded' }), selection({ reasonCodes: ['verified-equivalent'] }),
    selection({ reasonCodes: ['lower-estimate', 'lower-estimate'] }), selection({ recommendation: 'book-now' }),
    selection({ priority: 'unknown' }), selection({ reasonCodes: [] }), null, []]) {
    const advisor = await createQuotationAdvisor({ generateContent: provider(result) });
    await assert.rejects(advisor.advise(comparison()), { code: 'ADVICE_UNAVAILABLE' });
  }
});
test('unverified or mixed-currency input is rejected before generation', async () => {
  let calls = 0; const advisor = await createQuotationAdvisor({ generateContent: async () => { calls++; return provider(selection())(); } });
  for (const patch of [{ currency: 'EUR', totalMinor: 48000, isEstimate: true }, { currency: 'USD', totalMinor: NaN, isEstimate: true },
    { currency: 'USD', totalMinor: 48000, isEstimate: false }, { currency: 'ZZZ', totalMinor: 48000, isEstimate: true }]) {
    const input = comparison(); input.option.estimate = patch;
    await assert.rejects(advisor.advise(input), { code: 'ADVICE_UNAVAILABLE' });
  }
  assert.equal(calls, 0);
});
test('provider failure, malformed output and timeout fail without a fake AI response or retry', async () => {
  for (const generateContent of [async () => { throw Error('SECRET'); }, async () => ({ text: 'not JSON' }), () => new Promise(() => {})]) {
    let calls = 0; const advisor = await createQuotationAdvisor({ generateContent: (...args) => { calls++; return generateContent(...args); }, timeoutMs: 15 });
    await assert.rejects(advisor.advise(comparison()), { code: 'ADVICE_UNAVAILABLE' }); assert.equal(calls, 1);
  }
});
