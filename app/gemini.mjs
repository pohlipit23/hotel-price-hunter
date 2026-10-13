import { readFile } from 'node:fs/promises';

export class AdviceUnavailableError extends Error {
  constructor() {
    super('Live Gemini advice is unavailable. Your booking and preferences are preserved.');
    this.name = 'AdviceUnavailableError';
    this.code = 'ADVICE_UNAVAILABLE';
  }
}

const responseSchema = allowedReasonCodes => ({
  type: 'object',
  properties: {
    recommendation: { type: 'string', enum: ['keep-booking', 'consider-offer'] },
    reasonCodes: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: allowedReasonCodes } },
  },
  required: ['recommendation', 'reasonCodes'],
});
const currencies = new Set(Intl.supportedValuesOf('currency'));
const safeInteger = value => Number.isSafeInteger(value);

function safeRefundQuote(quote) {
  if (!quote || typeof quote !== 'object' || Array.isArray(quote)) return undefined;
  const amount = key => safeInteger(quote[key]) && quote[key] >= 0 ? quote[key] : null;
  return {
    status: ['verified', 'unknown'].includes(quote.status) ? quote.status : 'unknown',
    basis: quote.basis === 'retail-difference' ? quote.basis : 'unknown',
    originalRetailMinor: amount('originalRetailMinor'), replacementRetailMinor: amount('replacementRetailMinor'),
    originalCancellationMinor: amount('originalCancellationMinor'), switchFeesMinor: amount('switchFeesMinor'),
    refundProcessingMinor: amount('refundProcessingMinor'), netSavingMinor: safeInteger(quote.netSavingMinor) ? quote.netSavingMinor : null,
    currency: /^[A-Z]{3}$/.test(quote.currency || '') ? quote.currency : null,
    source: typeof quote.source === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(quote.source) ? quote.source : null,
  };
}

function moneyFacts({ booking, offer, decision, currency }) {
  if (!currency || !currencies.has(currency.code) || !Number.isInteger(currency.minorUnit) || currency.minorUnit < 0 || currency.minorUnit > 4
    || new Intl.NumberFormat('en', { style: 'currency', currency: currency.code }).resolvedOptions().maximumFractionDigits !== currency.minorUnit
    || booking.retail?.currency !== currency.code || offer.retail?.currency !== currency.code) throw new AdviceUnavailableError();
  const canonicalCurrency = { code: currency.code, minorUnit: currency.minorUnit, provenance: 'server-provided canonical currency metadata, verified against currency precision' };
  const format = (value, role, provenance) => {
    if (!safeInteger(value)) return null;
    const negative = value < 0;
    const absolute = BigInt(negative ? -value : value);
    const scale = 10n ** BigInt(currency.minorUnit);
    const major = `${negative ? '-' : ''}${absolute / scale}${currency.minorUnit ? '.' + (absolute % scale).toString().padStart(currency.minorUnit, '0') : ''}`;
    return { role, amountMinor: value, amountMajor: major, formatted: `${currency.code} ${major}`, provenance };
  };
  const quote = safeRefundQuote(offer.refundQuote);
  const costKeys = ['originalCancellationMinor', 'switchFeesMinor', 'refundProcessingMinor'];
  const bound = quote?.status === 'verified' && quote.basis === 'retail-difference' && quote.source && quote.currency === currency.code
    && quote.originalRetailMinor === booking.retail.totalMinor && quote.replacementRetailMinor === offer.retail.totalMinor
    && costKeys.every(key => safeInteger(quote[key]) && quote[key] >= 0) && safeInteger(decision.netSavingMinor) && quote.netSavingMinor === decision.netSavingMinor
    && BigInt(quote.originalRetailMinor) - BigInt(quote.replacementRetailMinor) - costKeys.reduce((sum, key) => sum + BigInt(quote[key]), 0n) === BigInt(decision.netSavingMinor);
  const facts = {
    currency: canonicalCurrency,
    bookingRetail: format(booking.retail.totalMinor, 'original-retail-total', 'booking.retail'),
    replacementRetail: format(offer.retail.totalMinor, 'replacement-retail-total', 'selectedOffer.retail'),
    priceDifference: format(booking.retail.totalMinor - offer.retail.totalMinor, 'retail-price-difference', 'application integer subtraction'),
    originalCancellation: bound ? format(quote.originalCancellationMinor, 'original-cancellation-cost', quote.source) : null,
    switchFee: bound ? format(quote.switchFeesMinor, 'switch-fee', quote.source) : null,
    refundProcessing: bound ? format(quote.refundProcessingMinor, 'refund-processing-cost', quote.source) : null,
    netCustomerRefund: bound ? format(decision.netSavingMinor, 'net-customer-refund', 'applicationDecision with bound verified refund quote') : null,
    status: decision.action === 'blocked' ? 'blocked-hypothetical-only' : 'potential-only-not-secured',
  };
  if (!facts.bookingRetail || !facts.replacementRetail || !facts.priceDifference) throw new AdviceUnavailableError();
  return facts;
}

function monitoringFacts({ offer, preferences, decision }) {
  const condition = 'only after separately approved successful execution makes the replacement the active booking';
  if (offer.cancellation?.refundability === 'non-refundable') return {
    afterApprovedReplacement: 'end-non-refundable', condition, preferenceCannotOverride: true, deadline: null,
    explanation: 'If an approved non-refundable replacement becomes your active booking after successful execution, normal price monitoring ends regardless of your continued-monitoring preference. Required recovery work still continues. Comparing or approving this offer alone changes nothing.',
  };
  if (decision.reasons?.includes('CANCELLATION_WINDOW_EXPIRED')) return {
    afterApprovedReplacement: 'blocked-expired-window', condition, deadline: null,
    explanation: 'The existing free-cancellation window is closed, so this blocked offer cannot start a replacement monitoring cycle. This comparison changes nothing.',
  };
  if (offer.cancellation?.refundability === 'refundable' && !decision.reasons?.includes('UNKNOWN_CANCELLATION_POLICY')) {
    if (!preferences.continueMonitoring) return {
      afterApprovedReplacement: 'end-by-preference', condition, deadline: null,
      explanation: 'After an approved refundable replacement becomes active, normal monitoring ends because continued monitoring is turned off. Required recovery work still continues. This comparison does not change your booking.',
    };
    if (typeof offer.cancellation.freeUntil === 'string' && Number.isFinite(Date.parse(offer.cancellation.freeUntil))) return {
      afterApprovedReplacement: 'continue-until-deadline', condition, deadline: offer.cancellation.freeUntil,
      explanation: `After an approved refundable replacement becomes active, monitoring continues until its verified free-cancellation deadline ${offer.cancellation.freeUntil}. This comparison does not change your booking.`,
    };
  }
  return {
    afterApprovedReplacement: 'unverified', condition, deadline: null,
    explanation: 'The replacement cancellation policy and monitoring deadline must be verified before deciding what monitoring can continue. This comparison does not change your booking.',
  };
}

function reasonCatalog({ booking, offer, decision }, money) {
  const reasons = new Set(decision.reasons || []);
  const sameHotel = Boolean(booking.hotel?.id && booking.hotel.id === offer.hotel?.id);
  const equivalentConditions = booking.room?.conditions && offer.room?.conditions
    && Object.entries(booking.room.conditions).every(([key, value]) => value != null && offer.room.conditions[key] === value);
  const catalog = {};
  const add = (code, grounded, phrase) => { if (grounded) catalog[code] = phrase; };
  add('refund-costs', Boolean(money.netCustomerRefund), 'The refund estimate includes the verified switching and cancellation costs.');
  add('retain-flexibility', booking.cancellation?.refundability === 'refundable' && !reasons.has('CANCELLATION_WINDOW_EXPIRED') && !reasons.has('UNKNOWN_CANCELLATION_POLICY'), 'Keeping the current refundable booking preserves cancellation flexibility.');
  add('different-room', sameHotel && offer.category === 'different-room' && offer.equivalence === 'different', 'This is a different room at the same hotel and requires separate offer approval.');
  add('different-hotel', Boolean(booking.hotel?.id && offer.hotel?.id && !sameHotel) && offer.category === 'different-hotel', 'This offer changes the hotel and requires separate offer approval.');
  add('verified-equivalent', sameHotel && offer.category === 'equivalent' && offer.equivalence === 'verified' && equivalentConditions && !reasons.has('UNKNOWN_ESSENTIAL_CONDITION') && !reasons.has('ESSENTIAL_REQUIREMENT_MISMATCH'), 'The checked fixture identifies the same hotel and a verified equivalent room.');
  add('unknown-essential', reasons.has('UNKNOWN_ESSENTIAL_CONDITION'), 'Required room conditions remain unknown and prevent a switch.');
  add('below-minimum', reasons.has('SAVING_BELOW_MINIMUM'), 'This offer does not meet the configured minimum net-saving requirement.');
  add('expired-cancellation', reasons.has('CANCELLATION_WINDOW_EXPIRED'), 'The existing free-cancellation window is closed.');
  add('essential-mismatch', reasons.has('ESSENTIAL_REQUIREMENT_MISMATCH'), 'Known offer conditions do not meet the saved essential requirements.');
  add('checked-snapshot', offer.checkKind === 'simulated-rate-check' && typeof offer.checkedAt === 'string', 'These are fictional checked snapshot facts, not a live supplier check.');
  return catalog;
}
function parseReasonSelection(text, catalog, decision) {
  if (typeof text !== 'string' || text.length > 2000) throw new AdviceUnavailableError();
  const value = JSON.parse(text);
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'reasonCodes,recommendation') throw new AdviceUnavailableError();
  if (!['keep-booking', 'consider-offer'].includes(value.recommendation)) throw new AdviceUnavailableError();
  if (!Array.isArray(value.reasonCodes) || value.reasonCodes.length < 1 || value.reasonCodes.length > 3
    || new Set(value.reasonCodes).size !== value.reasonCodes.length || value.reasonCodes.some(code => typeof code !== 'string' || !Object.hasOwn(catalog, code))) throw new AdviceUnavailableError();
  if (decision.action === 'blocked' && value.recommendation !== 'keep-booking') throw new AdviceUnavailableError();
  return value;
}
function blockedSummary({ offer, preferences, decision }) {
  const reasons = new Set(decision.reasons || []);
  if (reasons.has('CANCELLATION_WINDOW_EXPIRED')) return 'Keep your existing booking: the free-cancellation window is closed.';
  if (reasons.has('SAVING_BELOW_MINIMUM')) return 'Keep your existing booking: this offer does not meet your minimum net-saving requirement.';
  if (reasons.has('ESSENTIAL_REQUIREMENT_MISMATCH')) return 'Keep your existing booking: this offer does not meet your essential requirements.';
  if (reasons.has('UNKNOWN_ESSENTIAL_CONDITION') && offer.room?.conditions?.bedType == null && preferences.essentialRequirements?.bedType) return 'Keep your existing booking: the offer bed type is unknown and your essential bed requirement cannot be confirmed. The offer remains blocked.';
  return 'Keep your existing booking: this offer is blocked by the application switching requirements.';
}
function renderAdvice(selection, input, money, monitoring, catalog) {
  const { decision } = input;
  const net = money.netCustomerRefund;
  let explanation = 'Net customer refund is unverified. No saving is secured. No switch or refund has occurred.';
  if (net && net.amountMinor > 0) {
    explanation = `Potential net customer refund: ${net.formatted}. Price difference ${money.priceDifference.formatted}, minus original cancellation ${money.originalCancellation.formatted}, switch fee ${money.switchFee.formatted} and refund processing ${money.refundProcessing.formatted}. No switch or refund has occurred.`;
    if (decision.action === 'blocked') explanation = `Hypothetical arithmetic only: ${net.formatted}. This offer is blocked; no saving is secured. No switch or refund has occurred.`;
  } else if (net) explanation = 'This comparison does not show a positive net customer refund. No saving is secured. No switch or refund has occurred.';
  const rationale = selection.reasonCodes.map(code => catalog[code]).join(' ');
  return {
    summary: decision.action === 'blocked' ? blockedSummary(input) : selection.recommendation === 'keep-booking'
      ? 'Keeping your existing booking preserves the current arrangement. This comparison is advisory.'
      : 'This offer is worth comparing with your existing booking. This comparison makes no change.',
    recommendation: selection.recommendation,
    tradeoffs: [explanation, monitoring.explanation, rationale],
    uncertainties: ['Future prices are unknown. This comparison creates no approval or permission.'],
  };
}
/** Model calls carry no tools, credentials, customer identifiers or transaction access. */
export async function createGeminiAdvisor({ environment = process.env, generateContent, timeoutMs = 20000 } = {}) {
  const systemInstruction = await readFile(new URL('./prompts/advice.txt', import.meta.url), 'utf8');
  let generate = generateContent;
  const configured = Boolean(environment.GOOGLE_CLOUD_PROJECT && environment.GOOGLE_CLOUD_LOCATION && environment.GEMINI_MODEL);
  if (!generate && configured) {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ vertexai: true, project: environment.GOOGLE_CLOUD_PROJECT, location: environment.GOOGLE_CLOUD_LOCATION, apiVersion: 'v1', httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } } });
    generate = request => client.models.generateContent(request);
  }
  return {
    available: Boolean(generate),
    status: generateContent ? 'test-injected' : configured ? 'configured-unverified' : 'unconfigured',
    async advise({ booking, offer, preferences, decision, currency, message }) {
      if (typeof message !== 'string' || !message.trim() || message.length > 1200) throw new Error('Question must contain 1–1200 characters.');
      if (!generate) throw new AdviceUnavailableError();
      const input = { booking, offer, preferences, decision, currency };
      const authoritativeMoney = moneyFacts(input);
      const monitoringRule = monitoringFacts(input);
      const catalog = reasonCatalog(input, authoritativeMoney);
      const allowedReasonCodes = Object.keys(catalog);
      if (!allowedReasonCodes.length) throw new AdviceUnavailableError();
      const facts = item => ({ version: item.version, hotel: item.hotel, room: item.room, stay: item.stay, occupancy: item.occupancy, retail: item.retail, cancellation: item.cancellation, category: item.category, equivalence: item.equivalence, checkedAt: item.checkedAt, expiresAt: item.expiresAt, refundQuote: safeRefundQuote(item.refundQuote) });
      const request = {
        model: environment.GEMINI_MODEL || 'test-injected-model',
        contents: JSON.stringify({ booking: facts(booking), selectedOffer: facts(offer), preferences, applicationDecision: decision, authoritativeMoney, monitoringRule, allowedReasons: Object.entries(catalog).map(([code, phrase]) => ({ code, phrase })), transactionState: 'not-executed', travellerQuestion: message.trim() }),
        config: { systemInstruction, responseMimeType: 'application/json', responseJsonSchema: responseSchema(allowedReasonCodes), maxOutputTokens: 800, temperature: 0.2 },
      };
      let timer;
      try {
        const result = await Promise.race([generate(request), new Promise((_, reject) => { timer = setTimeout(() => reject(new AdviceUnavailableError()), timeoutMs); })]);
        return renderAdvice(parseReasonSelection(result.text, catalog, decision), input, authoritativeMoney, monitoringRule, catalog);
      } catch {
        throw new AdviceUnavailableError();
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
