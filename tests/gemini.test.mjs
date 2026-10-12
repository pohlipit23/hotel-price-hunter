import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiAdvisor, AdviceUnavailableError } from '../app/gemini.mjs';

const context = {
  booking: { bookingId: 'jury', version: 1, hotel: { name: 'Demo hotel' }, retail: { totalMinor: 60000, currency: 'USD' }, room: { conditions: {} }, cancellation: { refundability: 'refundable' } },
  offer: { offerId: 'demo-rate', version: 1, category: 'different-room', retail: { totalMinor: 51000, currency: 'USD' }, cancellation: { refundability: 'non-refundable' } },
  preferences: { automaticEquivalentSwitches: false, essentialRequirements: {}, continueMonitoring: true },
  decision: { action: 'approval-required', netSavingMinor: 9000, reasons: ['Reduced flexibility'] },
  message: 'My plans might change. Should I keep the flexibility?',
};
const response = { summary: 'Keep your refundable booking while your plans are uncertain.', recommendation: 'keep-booking', tradeoffs: ['This offer is non-refundable.'], uncertainties: ['Future prices are unknown.'] };

test('unconfigured live advisor is honest and never supplies simulated model success', async () => {
  const advisor = await createGeminiAdvisor({ environment: {} });
  assert.equal(advisor.status, 'unconfigured');
  await assert.rejects(advisor.advise(context), AdviceUnavailableError);
});

test('server model request contains only grounded facts and application decisions, with no tools', async () => {
  let request;
  const advisor = await createGeminiAdvisor({ environment: {}, generateContent: async value => { request = value; return { text: JSON.stringify(response) }; } });
  const before = structuredClone(context);
  const actual = await advisor.advise(context);
  assert.deepEqual(actual, response);
  assert.deepEqual(context, before);
  const supplied = JSON.parse(request.contents);
  assert.deepEqual(supplied.applicationDecision, context.decision);
  assert.equal(supplied.travellerQuestion, context.message);
  assert.equal(request.config.tools, undefined);
  assert.match(request.config.systemInstruction, /never predict future prices/i);
  assert.match(request.config.systemInstruction, /cannot change permissions/i);
  assert.equal(request.config.maxOutputTokens, 800);
});

test('grounded advice receives the verified refund breakdown without raw supplier details', async () => {
  let request;
  const refundQuote = {
    status: 'verified', basis: 'retail-difference', originalRetailMinor: 60000,
    replacementRetailMinor: 54000, originalCancellationMinor: 0, switchFeesMinor: 500,
    refundProcessingMinor: 0, netSavingMinor: 5500, currency: 'USD', source: 'fictional-agency-demo-policy-v1',
  };
  const advisor = await createGeminiAdvisor({ generateContent: async value => { request = value; return { text: JSON.stringify(response) }; } });
  await advisor.advise({
    ...context,
    offer: { ...context.offer, retail: { totalMinor: 54000, currency: 'USD' }, refundQuote: { ...refundQuote, supplierPayload: { token: 'must-not-leak' } }, supplierCost: { totalMinor: 41000, currency: 'USD' }, identity: { offerToken: 'must-not-leak' } },
    decision: { ...context.decision, netSavingMinor: 5500 },
    message: 'Why is the refund USD 55 when the price difference is USD 60?',
  });
  const supplied = JSON.parse(request.contents);
  assert.deepEqual(supplied.selectedOffer.refundQuote, refundQuote);
  assert.equal(supplied.applicationDecision.netSavingMinor, 5500);
  assert.equal(supplied.selectedOffer.supplierCost, undefined);
  assert.equal(supplied.selectedOffer.identity, undefined);
  assert.doesNotMatch(request.contents, /must-not-leak|supplierPayload/);
});

test('unknown fields cannot smuggle permission changes through model output', async () => {
  const advisor = await createGeminiAdvisor({ generateContent: async () => ({ text: JSON.stringify({ ...response, automaticEquivalentSwitches: true }) }) });
  await assert.rejects(advisor.advise(context), AdviceUnavailableError);
  assert.equal(context.preferences.automaticEquivalentSwitches, false);
});

test('provider errors, malformed output, unsafe HTML and unsupported forecasts yield unavailable', async () => {
  const outputs = [
    async () => { throw new Error('credential-secret-provider-error'); },
    async () => ({ text: 'not JSON' }),
    async () => ({ text: JSON.stringify({ ...response, summary: '<script>alert(1)</script>' }) }),
    async () => ({ text: JSON.stringify({ ...response, summary: 'Prices will definitely fall tomorrow.' }) }),
  ];
  for (const generateContent of outputs) {
    const advisor = await createGeminiAdvisor({ generateContent });
    await assert.rejects(advisor.advise(context), error => error instanceof AdviceUnavailableError && !error.message.includes('secret'));
  }
});

test('oversized traveller questions never reach model and timeouts remain honest', async () => {
  let calls = 0;
  const advisor = await createGeminiAdvisor({ timeoutMs: 20, generateContent: async () => { calls++; return new Promise(() => {}); } });
  await assert.rejects(advisor.advise({ ...context, message: 'x'.repeat(1201) }), /1200/);
  assert.equal(calls, 0);
  await assert.rejects(advisor.advise(context), AdviceUnavailableError);
});
