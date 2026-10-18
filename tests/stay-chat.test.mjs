import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotationAdvisor } from '../app/quotation-advisor.mjs';

const input = () => ({ baseline: { sourceType: 'quotation', quotationCode: 'PRIVATE-QUOTE', hotel: { id: 'PRIVATE-HOTEL', name: 'Demo Hotel' },
  stay: { checkin: '2026-11-10', checkout: '2026-11-12' }, occupancy: { adults: 2, childAges: [8], infantAges: [] },
  room: { name: 'King room', board: 'Breakfast' }, quotedRetail: { totalMinor: 60000, currency: 'USD' }, freeCancellation: true, guestEmail: 'PRIVATE-EMAIL' },
  options: [1, 2, 3].map(id => ({ optionId: `option-${id}`, roomName: `Room ${id}`, board: 'Breakfast', freeCancellation: id === 1,
    estimate: { totalMinor: 40000 + id * 1000, currency: 'USD', isEstimate: true }, privateReferences: `PRIVATE-TOKEN-${id}` })),
  checkedAt: '2026-10-18T00:00:00Z', snapshotVersion: 'a'.repeat(64), pageContext: 'drops-overview', optionId: null,
  intent: 'question', message: 'Which trade-offs should I consider?', history: [] });
const approvedPhrase = 'The best choice depends on whether price or flexibility matters more to you.';
const protocol = (patch = {}) => ({ replyKind: 'answer', segments: [{ kind: 'text', value: approvedPhrase }],
  referencedDropIds: [], recommendation: 'no-recommendation', reasonCodes: [], followUpQuestion: '', ...patch });
const provider = value => async () => ({ text: JSON.stringify(value) });

test('support chat uses the fixed Gemini model and sends only allowlisted overview comparison facts', async () => {
  let request;
  const advisor = await createQuotationAdvisor({ environment: {}, generateContent: async value => { request = value; return provider(protocol())(); } });
  const result = await advisor.chat(input());
  assert.equal(result.replyKind, 'answer'); assert.equal(result.model, 'gemini-3.8-flash'); assert.equal(result.reply, approvedPhrase);
  assert.ok(result.reply.trim().split(/\s+/).length <= 100);
  const context = JSON.parse(request.contents);
  assert.equal(context.pageContext, 'drops-overview'); assert.equal(context.options.length, 3);
  assert.deepEqual(context.options.map(value => value.optionId), ['option-1', 'option-2', 'option-3']);
  assert.ok(context.startingOption); assert.ok(context.availableFacts); assert.ok(context.availableReasons);
  assert.deepEqual(context.previousExchanges, []); assert.equal(context.travellerQuestion, input().message);
  assert.doesNotMatch(request.contents, /PRIVATE-|quotationCode|privateReferences|guestEmail|childAges|hotelId/);
  assert.equal(request.model, 'gemini-3.8-flash'); assert.equal(request.config.tools, undefined);
  assert.equal(request.config.responseMimeType, 'application/json'); assert.equal(request.config.responseJsonSchema.additionalProperties, false);
});
test('detail generation receives only its selected drop and cannot recommend another drop', async () => {
  let request; const detail = input(); detail.pageContext = 'drop-detail'; detail.optionId = 'option-2'; detail.options = [detail.options[1]];
  const advisor = await createQuotationAdvisor({ generateContent: async value => { request = value; return provider(protocol({ referencedDropIds: ['option-2'], recommendation: 'option-2', reasonCodes: ['option-2:lower-estimate'] }))(); } });
  const result = await advisor.chat(detail); assert.equal(result.recommendation, 'option-2');
  const context = JSON.parse(request.contents); assert.equal(context.pageContext, 'drop-detail');
  assert.deepEqual(context.options.map(value => value.optionId), ['option-2']); assert.doesNotMatch(request.contents, /option-1|option-3/);
  const forged = await createQuotationAdvisor({ generateContent: provider(protocol({ recommendation: 'option-1', referencedDropIds: ['option-1'] })) });
  await assert.rejects(forged.chat(detail), { code: 'ADVICE_UNAVAILABLE' });
});
test('chat rejects unknown fact, drop and reason references and unsupported provider fields', async () => {
  for (const value of [protocol({ segments: [{ kind: 'fact', value: 'invented-fact' }] }), protocol({ referencedDropIds: ['option-999'] }),
    protocol({ recommendation: 'option-999' }), protocol({ reasonCodes: ['verified-upgrade'] }), protocol({ replyKind: 'booked' }),
    protocol({ recommendation: 'option-1', referencedDropIds: ['option-1'] }),
    protocol({ referencedDropIds: ['option-1', 'option-1'] }), protocol({ reasonCodes: ['option-1:lower-estimate', 'option-1:lower-estimate'] }),
    protocol({ price: 'USD 1.00' }), protocol({ segments: [] }), null, []]) {
    const advisor = await createQuotationAdvisor({ generateContent: provider(value) });
    await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' });
  }
});

test('chat renders monetary comparisons only from supplied facts', async () => {
  const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [
    { kind: 'text', value: approvedPhrase }, { kind: 'fact', value: 'starting-price' },
    { kind: 'fact', value: 'option-2:estimate' }, { kind: 'fact', value: 'option-2:difference' },
  ], referencedDropIds: ['option-2'] })) });
  const result = await advisor.chat(input());
  assert.match(result.reply, /USD 600\.00/); assert.match(result.reply, /USD 420\.00/); assert.match(result.reply, /USD 180\.00 below/);
  assert.match(result.reply, /before final pricing and fees/); assert.match(result.reply, /not a verified saving or refund/);
  assert.ok(result.reply.split(/\s+/).length <= 100);
  const detail = input(); detail.pageContext = 'drop-detail'; detail.optionId = 'option-2'; detail.options = [detail.options[1]];
  const crossScope = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [{ kind: 'fact', value: 'option-1:estimate' }] })) });
  await assert.rejects(crossScope.chat(detail), { code: 'ADVICE_UNAVAILABLE' });
});
test('chat history keeps at most four questions and excludes replies from another page, drop or snapshot', async () => {
  let request; const value = input();
  const turn = patch => ({ pageContext: 'drops-overview', optionId: null, snapshotVersion: value.snapshotVersion,
    question: 'Earlier question', reply: 'CURRENT-SAFE-REPLY', ...patch });
  value.history = [turn({ question: 'DISCARDED-OLDEST' }), turn({ pageContext: 'drop-detail', optionId: 'option-1', reply: 'OTHER-DROP-REPLY' }),
    turn({ snapshotVersion: 'b'.repeat(64), reply: 'STALE-SNAPSHOT-REPLY' }), turn({ question: 'Same scope' }),
    turn({ pageContext: 'drop-detail', optionId: 'option-3', reply: 'OTHER-PAGE-REPLY' })];
  const advisor = await createQuotationAdvisor({ generateContent: async next => { request = next; return provider(protocol())(); } });
  await advisor.chat(value);
  const history = JSON.parse(request.contents).previousExchanges;
  assert.equal(history.length, 4); assert.equal(history[2].reply, 'CURRENT-SAFE-REPLY');
  assert.equal(history[0].reply, undefined); assert.equal(history[1].reply, undefined); assert.equal(history[3].reply, undefined);
  assert.doesNotMatch(request.contents, /DISCARDED-OLDEST|OTHER-DROP-REPLY|STALE-SNAPSHOT-REPLY|OTHER-PAGE-REPLY/);
});
test('opening uses the approved server template and overview also works with no captured drops', async () => {
  let request; const value = input(); value.intent = 'opening'; delete value.message; value.options = [];
  const advisor = await createQuotationAdvisor({ generateContent: async next => {
    request = next; const context = JSON.parse(next.contents);
    return provider(protocol({ replyKind: 'clarification', segments: [{ kind: 'text', value: context.availablePhrases[0] }],
      followUpQuestion: context.availableQuestions[1] }))();
  } });
  const result = await advisor.chat(value); assert.equal(result.replyKind, 'clarification');
  const context = JSON.parse(request.contents); assert.deepEqual(context.options, []); assert.ok(context.travellerQuestion.trim());
  assert.ok(context.startingOption); assert.doesNotMatch(request.contents, /PRIVATE-/);
});
test('chat does not display model-generated amounts, HTML, links or oversize prose', async () => {
  for (const text of ['Your final price is USD 500.00.', 'You save $50.', 'The refund is 25%.',
    '<img src=x onerror=alert(1)>', 'Read https://evil.invalid/payment', 'word '.repeat(101), 'x'.repeat(800)]) {
    const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [{ kind: 'text', value: text }] })) });
    await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' }, text);
  }
  const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({ followUpQuestion: 'Can you pay USD 200?' })) });
  await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' });
});
test('supplied decision phrases and follow-up questions render unchanged', async () => {
  for (const index of [0, 1, 2, 3]) {
    let chosen; let question;
    const advisor = await createQuotationAdvisor({ generateContent: async request => {
      const context = JSON.parse(request.contents);
      chosen = context.availablePhrases.find(phrase => phrase.startsWith('For firm dates,'));
      question = context.availableQuestions[index];
      assert.ok(chosen); assert.equal(typeof question, 'string');
      assert.ok(request.config.responseJsonSchema.properties.segments.items.properties.value.enum.includes(chosen));
      assert.deepEqual(request.config.responseJsonSchema.properties.followUpQuestion.enum, context.availableQuestions);
      return provider(protocol({ segments: [{ kind: 'text', value: chosen }], followUpQuestion: question }))();
    } });
    const result = await advisor.chat(input());
    assert.equal(result.reply, [chosen, question].filter(Boolean).join(' '));
    assert.equal(result.followUpQuestion, question);
    if (index === 2) assert.equal(question, 'Are lower costs or cancellation flexibility more important to you?');
  }
});
test('chat rejects unsupported confirmations and financial or cancellation promises without numeric amounts', async () => {
  for (const text of ['Your room choice is confirmed.', 'This drop costs half the starting price, with final fees included.',
    'You can cancel without penalty and receive a full refund.', 'Your room choice is accepted.', 'Your booking is complete.',
    'You owe nothing.', 'booking is complete', 'room choice accepted', 'owe nothing',
    'Try checking the cancellation policy before choosing.', 'Compare all the options before choosing.']) {
    const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [{ kind: 'text', value: text }] })) });
    await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' }, text);
  }
});
test('text and question fields reject values outside their supplied choices', async () => {
  for (const value of [protocol({ segments: [{ kind: 'text', value: 'selection-only' }] }),
    protocol({ segments: [{ kind: 'fact', value: approvedPhrase }] }),
    protocol({ followUpQuestion: 'What matters most for your stay?' }), protocol({ followUpQuestion: 'Your booking is complete.' })]) {
    const advisor = await createQuotationAdvisor({ generateContent: provider(value) });
    await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' });
  }
});
test('chat renders cancellation advice from a grounded reason fact', async () => {
  const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({
    segments: [{ kind: 'fact', value: 'option-2:reduced-flexibility' }], referencedDropIds: ['option-2'], reasonCodes: ['option-2:reduced-flexibility'],
  })) });
  const result = await advisor.chat(input());
  assert.match(result.reply, /marked non-refundable/); assert.match(result.reply, /retaining flexibility is safer/);
  assert.deepEqual(result.reasonCodes, ['option-2:reduced-flexibility']);
});
test('chat validates money and selected context before calling the provider', async () => {
  let calls = 0; const advisor = await createQuotationAdvisor({ generateContent: async () => { calls++; return provider(protocol())(); } });
  const invalid = [];
  for (const estimate of [{ totalMinor: -1, currency: 'USD', isEstimate: true }, { totalMinor: 40000, currency: 'EUR', isEstimate: true },
    { totalMinor: 40000, currency: 'USD', isEstimate: false }]) { const value = input(); value.options[0].estimate = estimate; invalid.push(value); }
  const missing = input(); missing.pageContext = 'drop-detail'; missing.optionId = 'absent'; invalid.push(missing);
  for (const value of invalid) await assert.rejects(advisor.chat(value), { code: 'ADVICE_UNAVAILABLE' });
  assert.equal(calls, 0);
});
test('unconfigured chat, malformed provider output, provider failure and timeout fail without retry', async () => {
  const disabled = await createQuotationAdvisor({ environment: {} }); await assert.rejects(disabled.chat(input()), { code: 'ADVICE_UNAVAILABLE' });
  for (const generate of [async () => { throw Error('PRIVATE-ERROR'); }, async () => ({ text: 'not JSON' }), async () => ({ text: 'x'.repeat(20000) }), () => new Promise(() => {})]) {
    let calls = 0; const advisor = await createQuotationAdvisor({ environment: {}, timeoutMs: 15, generateContent: (...args) => { calls++; return generate(...args); } });
    await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' }); assert.equal(calls, 1);
  }
});
