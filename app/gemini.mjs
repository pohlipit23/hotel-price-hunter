import { readFile } from 'node:fs/promises';

export class AdviceUnavailableError extends Error {
  constructor() {
    super('Live Gemini advice is unavailable. Your booking and preferences are preserved.');
    this.name = 'AdviceUnavailableError';
    this.code = 'ADVICE_UNAVAILABLE';
  }
}

const responseSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    recommendation: { type: 'string', enum: ['keep-booking', 'consider-offer'] },
    tradeoffs: { type: 'array', items: { type: 'string' } },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'recommendation', 'tradeoffs', 'uncertainties'],
};

function safeRefundQuote(quote) {
  if (!quote || typeof quote !== 'object' || Array.isArray(quote)) return undefined;
  const amount = key => Number.isSafeInteger(quote[key]) && quote[key] >= 0 ? quote[key] : null;
  return {
    status: ['verified', 'unknown'].includes(quote.status) ? quote.status : 'unknown',
    basis: quote.basis === 'retail-difference' ? quote.basis : 'unknown',
    originalRetailMinor: amount('originalRetailMinor'), replacementRetailMinor: amount('replacementRetailMinor'),
    originalCancellationMinor: amount('originalCancellationMinor'), switchFeesMinor: amount('switchFeesMinor'),
    refundProcessingMinor: amount('refundProcessingMinor'), netSavingMinor: amount('netSavingMinor'),
    currency: /^[A-Z]{3}$/.test(quote.currency || '') ? quote.currency : null,
    source: typeof quote.source === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(quote.source) ? quote.source : null,
  };
}

function parseAdvice(text) {
  if (typeof text !== 'string' || text.length > 8000) throw new AdviceUnavailableError();
  const value = JSON.parse(text);
  if (!value || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'recommendation,summary,tradeoffs,uncertainties') throw new AdviceUnavailableError();
  if (!['keep-booking', 'consider-offer'].includes(value.recommendation)) throw new AdviceUnavailableError();
  if (typeof value.summary !== 'string' || !value.summary.trim() || value.summary.length > 1200) throw new AdviceUnavailableError();
  for (const list of [value.tradeoffs, value.uncertainties]) {
    if (!Array.isArray(list) || list.length > 3 || list.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)) throw new AdviceUnavailableError();
  }
  const prose = [value.summary, ...value.tradeoffs, ...value.uncertainties].join(' ');
  // Reject obvious unsupported claims; model text remains advisory, never authority.
  if (/<[^>]+>|https?:\/\//i.test(prose)
    || /(?:prices?|rates?)\s+(?:will|are going to|definitely|guaranteed)[^.]{0,100}(?:fall|drop|rise|increase|decrease)/i.test(prose)
    || /(?:will|guaranteed)[^.]{0,80}(?:prices?|rates?)[^.]{0,80}(?:fall|drop|rise|increase|decrease)/i.test(prose)) throw new AdviceUnavailableError();
  return value;
}

/** Model calls carry no tools, credentials, customer identifiers or transaction access. */
export async function createGeminiAdvisor({ environment = process.env, generateContent, timeoutMs = 20000 } = {}) {
  const systemInstruction = await readFile(new URL('./prompts/advice.txt', import.meta.url), 'utf8');
  let generate = generateContent;
  const configured = Boolean(environment.GOOGLE_CLOUD_PROJECT && environment.GOOGLE_CLOUD_LOCATION && environment.GEMINI_MODEL);
  if (!generate && configured) {
    const { GoogleGenAI } = await import('@google/genai');
    const client = new GoogleGenAI({
      vertexai: true,
      project: environment.GOOGLE_CLOUD_PROJECT,
      location: environment.GOOGLE_CLOUD_LOCATION,
      apiVersion: 'v1',
      httpOptions: { timeout: timeoutMs, retryOptions: { attempts: 1 } },
    });
    generate = request => client.models.generateContent(request);
  }
  return {
    available: Boolean(generate),
    status: generateContent ? 'test-injected' : configured ? 'configured-unverified' : 'unconfigured',
    async advise({ booking, offer, preferences, decision, message }) {
      if (typeof message !== 'string' || !message.trim() || message.length > 1200) throw new Error('Question must contain 1–1200 characters.');
      if (!generate) throw new AdviceUnavailableError();
      // Only explicitly allowed comparison fields enter model context, never raw API payloads.
      const facts = item => ({
        version: item.version, hotel: item.hotel, room: item.room, stay: item.stay,
        occupancy: item.occupancy, retail: item.retail, cancellation: item.cancellation,
        category: item.category, equivalence: item.equivalence, checkedAt: item.checkedAt,
        expiresAt: item.expiresAt, refundQuote: safeRefundQuote(item.refundQuote),
      });
      const request = {
        model: environment.GEMINI_MODEL || 'test-injected-model',
        contents: JSON.stringify({ booking: facts(booking), selectedOffer: facts(offer), preferences, applicationDecision: decision, travellerQuestion: message.trim() }),
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseJsonSchema: responseSchema,
          maxOutputTokens: 800,
          temperature: 0.2,
        },
      };
      let timer;
      try {
        const result = await Promise.race([
          generate(request),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new AdviceUnavailableError()), timeoutMs); }),
        ]);
        return parseAdvice(result.text);
      } catch {
        // Provider messages may contain credential paths or account data: keep them server-side.
        throw new AdviceUnavailableError();
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
