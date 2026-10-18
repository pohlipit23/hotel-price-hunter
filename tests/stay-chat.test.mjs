import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuotationAdvisor } from '../app/quotation-advisor.mjs';
import { MAX_REPLY_WORDS, MAX_SEGMENTS, joinStatements } from '../app/stay-chat.mjs';

const input = () => ({ baseline: { sourceType: 'quotation', quotationCode: 'PRIVATE-QUOTE', hotel: { id: 'PRIVATE-HOTEL', name: 'Demo Hotel' },
  stay: { checkin: '2026-11-10', checkout: '2026-11-12' }, occupancy: { adults: 2, childAges: [8], infantAges: [] },
  room: { name: 'King room', board: 'Breakfast' }, quotedRetail: { totalMinor: 60000, currency: 'USD' }, freeCancellation: true, guestEmail: 'PRIVATE-EMAIL' },
  options: [1, 2, 3].map(id => ({ optionId: `option-${id}`, roomName: `Room ${id}`, board: 'Breakfast', freeCancellation: id === 1,
    estimate: { totalMinor: 40000 + id * 1000, currency: 'USD', isEstimate: true }, privateReferences: `PRIVATE-TOKEN-${id}` })),
  checkedAt: '2026-10-18T00:00:00Z', snapshotVersion: 'a'.repeat(64), pageContext: 'drops-overview', optionId: null,
  intent: 'question', message: 'Which trade-offs should I consider?', history: [] });
const approvedPhrase = 'It mostly comes down to whether price or flexibility matters more to you.';
const protocol = (patch = {}) => ({ replyKind: 'answer', segments: [{ id: 'support-1' }],
  referencedDropIds: [], recommendation: 'no-recommendation', reasonCodes: [], followUpQuestion: '', ...patch });
const provider = value => async () => ({ text: JSON.stringify(value) });

test('support chat uses the fixed Gemini model and sends only allowlisted overview comparison facts', async () => {
  let request;
  const advisor = await createQuotationAdvisor({ environment: {}, generateContent: async value => { request = value; return provider(protocol())(); } });
  const result = await advisor.chat(input());
  assert.equal(result.replyKind, 'answer'); assert.equal(result.model, 'gemini-3.8-flash'); assert.equal(result.reply, approvedPhrase);
  assert.ok(result.reply.trim().split(/\s+/).length <= MAX_REPLY_WORDS);
  const context = JSON.parse(request.contents);
  assert.equal(context.pageContext, 'drops-overview'); assert.equal(context.options.length, 3);
  assert.deepEqual(context.options.map(value => value.optionId), ['option-1', 'option-2', 'option-3']);
  assert.ok(context.startingOption); assert.ok(context.availableFacts); assert.ok(context.availableReasons);
  assert.deepEqual(context.previousExchanges, []); assert.equal(context.travellerQuestion, input().message);
  assert.doesNotMatch(request.contents, /PRIVATE-|quotationCode|privateReferences|guestEmail|childAges|hotelId/);
  assert.equal(request.model, 'gemini-3.8-flash'); assert.equal(request.config.tools, undefined);
  assert.equal(request.config.responseMimeType, 'application/json'); assert.equal(request.config.responseJsonSchema.additionalProperties, false);
  assert.equal(context.availableStatements['support-1'], approvedPhrase);
  const segmentSchema = request.config.responseJsonSchema.properties.segments.items;
  assert.deepEqual(segmentSchema.required, ['id']); assert.equal(segmentSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(segmentSchema.properties), ['id']);
  assert.deepEqual(segmentSchema.properties.id.enum, Object.keys(context.availableStatements));
  assert.deepEqual(request.config.responseJsonSchema.properties.referencedDropIds.items.enum, context.options.map(option => option.optionId));
  assert.deepEqual(request.config.responseJsonSchema.properties.reasonCodes.items.enum, Object.keys(context.availableReasons));
});
test('detail generation receives only its selected drop and cannot recommend another drop', async () => {
  let request; const detail = input(); detail.pageContext = 'drop-detail'; detail.optionId = 'option-2'; detail.options = [detail.options[1]];
  const advisor = await createQuotationAdvisor({ generateContent: async value => { request = value; return provider(protocol({ referencedDropIds: ['option-2'], recommendation: 'option-2', reasonCodes: ['option-2:lower-estimate'] }))(); } });
  const result = await advisor.chat(detail); assert.equal(result.recommendation, 'option-2');
  const context = JSON.parse(request.contents); assert.equal(context.pageContext, 'drop-detail');
  assert.deepEqual(context.options.map(value => value.optionId), ['option-2']); assert.doesNotMatch(request.contents, /option-1|option-3/);
  assert.deepEqual(request.config.responseJsonSchema.properties.referencedDropIds.items.enum, ['option-2']);
  assert.deepEqual(request.config.responseJsonSchema.properties.reasonCodes.items.enum, Object.keys(context.availableReasons));
  assert.deepEqual(request.config.responseJsonSchema.properties.segments.items.properties.id.enum, Object.keys(context.availableStatements));
  const forged = await createQuotationAdvisor({ generateContent: provider(protocol({ recommendation: 'option-1', referencedDropIds: ['option-1'] })) });
  await assert.rejects(forged.chat(detail), { code: 'ADVICE_UNAVAILABLE' });
});
test('chat rejects unknown fact, drop and reason references and unsupported provider fields', async () => {
  for (const value of [protocol({ segments: [{ id: 'invented-fact' }] }), protocol({ referencedDropIds: ['option-999'] }),
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
    { id: 'starting-price' }, { id: 'option-2:estimate' }, { id: 'option-2:difference' },
  ], referencedDropIds: ['option-2'] })) });
  const result = await advisor.chat(input());
  // Flowing sentences: the fees caveat is said once and the difference refers back to the estimate.
  assert.equal(result.reply, 'Your starting option is USD 600.00 for the whole stay. Room 2 is estimated at USD 420.00, before final pricing and fees. '
    + "That's USD 180.00 below your starting option, so treat it as an estimate, not a verified saving or refund.");
  assert.equal(result.reply.match(/before final pricing and fees/g).length, 1);
  assert.ok(result.reply.split(/\s+/).length <= MAX_REPLY_WORDS);
  const alone = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [{ id: 'option-2:difference' }], referencedDropIds: ['option-2'] })) });
  assert.equal((await alone.chat(input())).reply,
    'Room 2 is USD 180.00 below your starting option before final pricing and fees, so treat it as an estimate, not a verified saving or refund.');
  const detail = input(); detail.pageContext = 'drop-detail'; detail.optionId = 'option-2'; detail.options = [detail.options[1]];
  const crossScope = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [{ id: 'option-1:estimate' }] })) });
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
    const phraseId = Object.entries(context.availableStatements).find(([, text]) => text === context.availablePhrases[0])[0];
    return provider(protocol({ replyKind: 'clarification', segments: [{ id: phraseId }],
      followUpQuestion: context.availableQuestions[1] }))();
  } });
  const result = await advisor.chat(value); assert.equal(result.replyKind, 'clarification');
  const context = JSON.parse(request.contents); assert.deepEqual(context.options, []); assert.ok(context.travellerQuestion.trim());
  assert.ok(context.startingOption); assert.doesNotMatch(request.contents, /PRIVATE-/);
  assert.equal(request.config.responseJsonSchema.properties.referencedDropIds.maxItems, 0);
  assert.equal(request.config.responseJsonSchema.properties.reasonCodes.maxItems, 0);
  const noEmptyEnums = value => {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'enum')) assert.ok(value.enum.length > 0);
    Object.values(value).forEach(noEmptyEnums);
  };
  noEmptyEnums(request.config.responseJsonSchema);
});
test('chat does not display model-generated amounts, HTML, links or oversize prose', async () => {
  for (const text of ['Your final price is USD 500.00.', 'You save $50.', 'The refund is 25%.',
    '<img src=x onerror=alert(1)>', 'Read https://evil.invalid/payment', 'word '.repeat(101), 'x'.repeat(800)]) {
    for (const segment of [{ id: text }, { kind: 'text', value: text }]) {
      const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [segment] })) });
      await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' }, text);
    }
  }
  const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({ followUpQuestion: 'Can you pay USD 200?' })) });
  await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' });
});
test('supplied decision phrases and follow-up questions render unchanged', async () => {
  for (const index of [0, 1, 2, 3]) {
    let chosen; let question;
    const advisor = await createQuotationAdvisor({ generateContent: async request => {
      const context = JSON.parse(request.contents);
      const [chosenId, chosenText] = Object.entries(context.availableStatements).find(([, text]) => text.startsWith('If your dates are firm,'));
      chosen = chosenText;
      question = context.availableQuestions[index];
      assert.ok(chosen); assert.equal(typeof question, 'string');
      assert.ok(request.config.responseJsonSchema.properties.segments.items.properties.id.enum.includes(chosenId));
      assert.deepEqual(request.config.responseJsonSchema.properties.followUpQuestion.enum, context.availableQuestions);
      return provider(protocol({ segments: [{ id: chosenId }], followUpQuestion: question }))();
    } });
    const result = await advisor.chat(input());
    assert.equal(result.reply, [chosen, question].filter(Boolean).join(' '));
    assert.equal(result.followUpQuestion, question);
    if (index === 2) assert.equal(question, 'Is a lower price or cancellation flexibility more important to you?');
  }
});
test('chat rejects unsupported confirmations and financial or cancellation promises without numeric amounts', async () => {
  for (const text of ['Your room choice is confirmed.', 'This drop costs half the starting price, with final fees included.',
    'You can cancel without penalty and receive a full refund.', 'Your room choice is accepted.', 'Your booking is complete.',
    'You owe nothing.', 'booking is complete', 'room choice accepted', 'owe nothing',
    'Try checking the cancellation policy before choosing.', 'Compare all the options before choosing.']) {
    for (const segment of [{ id: text }, { kind: 'text', value: text }]) {
      const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [segment] })) });
      await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' }, text);
    }
  }
});
test('statement and question fields reject malformed segments and unsupported choices', async () => {
  for (const value of [protocol({ segments: [{ kind: 'text', value: 'selection-only' }] }),
    protocol({ segments: [{ kind: 'fact', value: approvedPhrase }] }),
    protocol({ segments: [{ kind: 'fact', value: 'selection-only' }] }),
    protocol({ segments: [{ id: approvedPhrase }] }), protocol({ segments: [{ id: 'support-1', value: approvedPhrase }] }),
    protocol({ segments: [{}] }), protocol({ segments: [{ id: null }] }),
    protocol({ followUpQuestion: 'What matters most for your stay?' }), protocol({ followUpQuestion: 'Your booking is complete.' })]) {
    const advisor = await createQuotationAdvisor({ generateContent: provider(value) });
    await assert.rejects(advisor.chat(input()), { code: 'ADVICE_UNAVAILABLE' });
  }
});
test('chat renders cancellation advice from a grounded reason fact', async () => {
  const advisor = await createQuotationAdvisor({ generateContent: provider(protocol({
    segments: [{ id: 'option-2:reduced-flexibility' }], referencedDropIds: ['option-2'], reasonCodes: ['option-2:reduced-flexibility'],
  })) });
  const result = await advisor.chat(input());
  assert.equal(result.reply, 'Room 2 is marked non-refundable, so a flexible option is safer if your plans might change.');
  assert.deepEqual(result.reasonCodes, ['option-2:reduced-flexibility']);
});
test('chat replies stay short: at most three statements, no repeats and a word cap', async () => {
  let request;
  const four = await createQuotationAdvisor({ generateContent: async value => { request = value; return provider(protocol({ segments: [
    { id: 'support-1' }, { id: 'starting-price' }, { id: 'option-2:estimate' }, { id: 'option-2:difference' }] }))(); } });
  await assert.rejects(four.chat(input()), { code: 'ADVICE_UNAVAILABLE' });
  assert.equal(MAX_SEGMENTS, 3); assert.equal(MAX_REPLY_WORDS, 70);
  assert.equal(request.config.responseJsonSchema.properties.segments.maxItems, MAX_SEGMENTS);
  assert.match(request.config.responseJsonSchema.properties.segments.description, /at most 70 words/);
  assert.match(request.config.systemInstruction, /at most 70 words/);
  const repeated = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [{ id: 'support-1' }, { id: 'support-1' }] })) });
  assert.equal((await repeated.chat(input())).reply, approvedPhrase);
  const long = input(); long.options = long.options.map(option => ({ ...option, roomName: 'Grand '.repeat(13).trim() }));
  const wordy = await createQuotationAdvisor({ generateContent: provider(protocol({ segments: [
    { id: 'option-1:cancellation-flag' }, { id: 'option-2:reduced-flexibility' }, { id: 'option-3:different-room-label' }],
    followUpQuestion: 'Which room features matter most to you?' })) });
  await assert.rejects(wordy.chat(long), { code: 'ADVICE_UNAVAILABLE' });
});
test('statement joining keeps every fact and only shortens repeated caveats', () => {
  const statements = { a: 'A is USD 1.00, before final pricing and fees.', b: 'B is USD 2.00, before final pricing and fees.', c: 'Plain.' };
  const variants = { b: { brief: 'B is USD 2.00.' }, c: { chained: { after: 'a', text: 'Chained.' } } };
  assert.equal(joinStatements(['a', 'b', 'c'], statements, variants), 'A is USD 1.00, before final pricing and fees. B is USD 2.00. Plain.');
  assert.equal(joinStatements(['b', 'a'], statements, variants), 'B is USD 2.00, before final pricing and fees. A is USD 1.00, before final pricing and fees.');
  assert.equal(joinStatements(['a', 'c', 'a'], statements, variants), 'A is USD 1.00, before final pricing and fees. Chained.');
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
