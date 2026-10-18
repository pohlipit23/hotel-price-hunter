import { readFile } from 'node:fs/promises';
import { AdviceUnavailableError } from './gemini.mjs';
import { createStayChat } from './stay-chat.mjs';

export const QUOTATION_MODEL = 'gemini-3.8-flash';

const priorities = ['price', 'flexibility', 'room-details', 'balanced'];
const recommendations = ['keep-quotation', 'consider-option'];
const currencies = new Set(Intl.supportedValuesOf('currency'));
const unavailable = () => { throw new AdviceUnavailableError(); };
const label = value => typeof value === 'string' && value.length <= 500 ? value : null;
function amount(value) {
  if (!value || !Number.isSafeInteger(value.totalMinor) || value.totalMinor < 0 || !currencies.has(value.currency)) return unavailable();
  try {
    const digits = new Intl.NumberFormat('en', { style: 'currency', currency: value.currency }).resolvedOptions().maximumFractionDigits;
    const raw = String(value.totalMinor).padStart(digits + 1, '0');
    return { currency: value.currency, totalMinor: value.totalMinor, formatted: `${value.currency} ${digits ? raw.slice(0, -digits) + '.' + raw.slice(-digits) : raw}` };
  } catch { return unavailable(); }
}
function context({ baseline, option, checkedAt }) {
  const retail = amount(baseline.quotedRetail); const estimate = amount(option.estimate);
  if (retail.currency !== estimate.currency || option.estimate.isEstimate !== true) return unavailable();
  const differentRoom = label(baseline.room?.name) && label(option.roomName) && baseline.room.name.trim().toLowerCase() !== option.roomName.trim().toLowerCase();
  const differentBoard = label(baseline.room?.board) && label(option.board) && baseline.room.board.trim().toLowerCase() !== option.board.trim().toLowerCase();
  const catalog = {
    'terms-unverified': 'Room equivalence, complete cancellation terms and final retail pricing still need verification.',
    'snapshot-only': 'These are captured source options. Availability and prices need to be checked again.',
  };
  if (estimate.totalMinor < retail.totalMinor) catalog['lower-estimate'] = 'The converted source estimate is below the original quotation, before final retail pricing and fees.';
  else catalog['no-lower-estimate'] = 'The converted source estimate does not show a lower price than the original quotation.';
  if (option.freeCancellation === false) catalog['reduced-flexibility'] = 'This source option is marked non-refundable. If your plans may change, retaining flexibility is safer.';
  else if (option.freeCancellation === true) catalog['cancellation-flag'] = 'The source flags free cancellation, but its complete conditions and deadline still need verification.';
  else catalog['unknown-cancellation'] = 'Free cancellation is not established for this option. Verify the policy before relying on flexibility.';
  if (baseline.freeCancellation === true) catalog['quotation-flexibility'] = 'The original quotation is flagged for free cancellation. It is a quotation, not an existing reservation.';
  if (differentRoom) catalog['different-room-label'] = 'The room label is different from the quotation. This does not establish equivalence or an upgrade.';
  if (differentBoard) catalog['different-board-label'] = 'The meal-plan label differs. Check which meals are included before choosing.';
  const count = values => Array.isArray(values) ? values.length : 0;
  const flags = value => value === true ? true : value === false ? false : null;
  return { catalog, retail, estimate, facts: {
    quotation: { hotel: label(baseline.hotel?.name), room: { name: label(baseline.room?.name), board: label(baseline.room?.board) },
      stay: { checkin: label(baseline.stay?.checkin), checkout: label(baseline.stay?.checkout) },
      occupancy: { adults: Number.isInteger(baseline.occupancy?.adults) ? baseline.occupancy.adults : null,
        children: count(baseline.occupancy?.childAges), infants: count(baseline.occupancy?.infantAges) },
      retail, freeCancellation: flags(baseline.freeCancellation), reservationCreated: false },
    selectedOption: { roomName: label(option.roomName), board: label(option.board), convertedSourceEstimate: estimate,
      freeCancellation: flags(option.freeCancellation), termsVerified: false },
    checkedAt: label(checkedAt), availableReasons: catalog,
    limitations: 'Captured source snapshot; converted estimate before final retail pricing and fees; no verified equivalence or customer refund; selection only.',
  } };
}
function parse(text, catalog) {
  if (typeof text !== 'string' || text.length > 2000) return unavailable();
  const value = JSON.parse(text);
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'priority,reasonCodes,recommendation'
    || !recommendations.includes(value.recommendation) || !priorities.includes(value.priority)
    || !Array.isArray(value.reasonCodes) || value.reasonCodes.length < 1 || value.reasonCodes.length > 3
    || new Set(value.reasonCodes).size !== value.reasonCodes.length
    || value.reasonCodes.some(code => typeof code !== 'string' || !Object.hasOwn(catalog, code))) return unavailable();
  return value;
}
export async function createQuotationAdvisor({ environment = process.env, generateContent, googleAuthOptions, timeoutMs = 20000 } = {}) {
  const systemInstruction = await readFile(new URL('./prompts/quotation-advice.txt', import.meta.url), 'utf8');
  const chatInstruction = await readFile(new URL('./prompts/stay-chat.txt', import.meta.url), 'utf8');
  const openingInstruction = await readFile(new URL('./prompts/stay-chat-opening.txt', import.meta.url), 'utf8');
  const configured = environment.QUOTATION_ADVICE_ENABLED === 'true' && environment.GOOGLE_CLOUD_PROJECT && environment.GOOGLE_CLOUD_LOCATION && environment.GEMINI_MODEL;
  if (configured && environment.GEMINI_MODEL !== QUOTATION_MODEL) throw new Error(`Quotation advice requires ${QUOTATION_MODEL}.`);
  let generate = generateContent;
  if (!generate && configured) {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({ vertexai: true, project: environment.GOOGLE_CLOUD_PROJECT, location: environment.GOOGLE_CLOUD_LOCATION,
      apiVersion: 'v1', googleAuthOptions, httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } } });
    generate = request => client.models.generateContent(request);
  }
  return { available: Boolean(generate), model: QUOTATION_MODEL, status: generateContent ? 'test-injected' : configured ? 'configured-unverified' : 'unconfigured',
    chat: createStayChat({ generate, buildComparison: context, systemInstruction: chatInstruction, openingInstruction, model: QUOTATION_MODEL, timeoutMs }),
    async advise(input) {
      if (!generate || typeof input.message !== 'string' || !input.message.trim() || input.message.length > 1200) return unavailable();
      const { catalog, facts, retail, estimate } = context(input);
      const history = (input.history || []).slice(-2).map(turn => ({ question: String(turn.question).slice(0, 1200), ...parse(JSON.stringify(turn.selection), catalog) }));
      const request = { model: environment.GEMINI_MODEL || QUOTATION_MODEL,
        contents: JSON.stringify({ ...facts, previousExchanges: history, travellerQuestion: input.message.trim() }),
        // Gemini 3.8 migration: https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.8
        config: { systemInstruction, responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'LOW' }, maxOutputTokens: 2048,
          responseJsonSchema: { type: 'object', additionalProperties: false,
            properties: { recommendation: { type: 'string', enum: recommendations }, priority: { type: 'string', enum: priorities },
              reasonCodes: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: Object.keys(catalog) } } },
            required: ['recommendation', 'priority', 'reasonCodes'] } } };
      let timer;
      try {
        const reply = await Promise.race([generate(request), new Promise((_, reject) => { timer = setTimeout(() => reject(new AdviceUnavailableError()), timeoutMs); })]);
        const selection = parse(reply.text, catalog);
        const difference = amount({ totalMinor: Math.abs(retail.totalMinor - estimate.totalMinor), currency: retail.currency });
        return { ...selection, model: QUOTATION_MODEL,
          providerModelVersion: typeof reply.modelVersion === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(reply.modelVersion) ? reply.modelVersion : null,
          summary: selection.recommendation === 'keep-quotation' ? 'Keep your quotation as the starting point while you check the trade-offs.' : 'This option is worth reviewing against your quotation, subject to verified price and terms.',
          tradeoffs: selection.reasonCodes.map(code => catalog[code]),
          priceContext: `${difference.formatted} ${retail.totalMinor >= estimate.totalMinor ? 'below' : 'above'} the quotation, before final retail pricing and fees. This is an indicative difference, not a verified saving or refund.`,
          limitations: 'Room equivalence and full terms remain unverified. Future prices are unknown. No reservation, cancellation, payment or refund is created by this advice.',
        };
      } catch { return unavailable(); } finally { clearTimeout(timer); }
    },
  };
}
