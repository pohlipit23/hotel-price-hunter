const currencyCodes = new Set(Intl.supportedValuesOf('currency'));

function invalid(message) {
  const error = new Error(message);
  error.code = 'INVALID_MONEY';
  throw error;
}

export function assertMoney(money) {
  if (!money || !Number.isSafeInteger(money.totalMinor) || money.totalMinor < 0
      || !currencyCodes.has(money.currency)) invalid('Money requires a non-negative safe minor-unit integer and known currency.');
  return money;
}

function cost(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0) invalid('Every cost must be explicitly known in safe minor units.');
  return amount;
}

function retail(money) {
  assertMoney(money);
  cost(money.taxesMinor);
  cost(money.feesMinor);
  if (money.includedInTotal !== true || money.taxesMinor + money.feesMinor > money.totalMinor) {
    invalid('Retail total must include known taxes and fees.');
  }
}

export function calculateNetSaving(booking, offer, originalCancellationMinor) {
  retail(booking?.retail);
  retail(offer?.retail);
  const quote = offer?.refundQuote;
  if (!quote || quote.status !== 'verified' || quote.basis !== 'retail-difference' || !quote.source) {
    invalid('A verified agency retail refund quote is required.');
  }
  const currency = booking.retail.currency;
  if (offer.retail.currency !== currency || quote.currency !== currency) invalid('Refund arithmetic cannot mix currencies.');
  for (const key of ['originalRetailMinor', 'replacementRetailMinor', 'originalCancellationMinor', 'switchFeesMinor', 'refundProcessingMinor']) {
    cost(quote[key]);
  }
  cost(originalCancellationMinor);
  if (quote.originalRetailMinor !== booking.retail.totalMinor
      || quote.replacementRetailMinor !== offer.retail.totalMinor
      || quote.originalCancellationMinor !== originalCancellationMinor) {
    invalid('Refund quote must bind active retail prices and actual cancellation cost.');
  }
  const deductions = quote.replacementRetailMinor + quote.originalCancellationMinor + quote.switchFeesMinor + quote.refundProcessingMinor;
  const net = quote.originalRetailMinor - deductions;
  if (!Number.isSafeInteger(deductions) || !Number.isSafeInteger(net) || quote.netSavingMinor !== net) {
    invalid('Refund quote arithmetic is inconsistent or overflows.');
  }
  return net;
}
