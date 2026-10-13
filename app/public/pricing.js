/** Presentation only. Execution authority and refund amounts come from the server. */
export function refundPresentation(offer) {
  const decision = offer?.decision;
  const minor = decision?.netSavingMinor;
  const available = ['approval-required', 'automatic'].includes(decision?.action) && Number.isSafeInteger(minor) && minor > 0;
  return {
    available,
    minor: available ? minor : null,
    caption: available ? 'back after fees' : decision?.action === 'blocked' ? 'Switch blocked' : 'No verified refund',
  };
}

export function featuredOffer(offers) {
  return offers.find(offer => offer.category === 'equivalent' && offer.equivalence === 'verified'
    && offer.cancellation?.refundability === 'refundable' && refundPresentation(offer).available);
}

export function isPriceDrop(booking, offer) {
  const old = booking?.retail;
  const next = offer?.retail;
  return Number.isSafeInteger(old?.totalMinor) && Number.isSafeInteger(next?.totalMinor)
    && next.totalMinor >= 0 && old.currency === next.currency && next.totalMinor < old.totalMinor;
}
