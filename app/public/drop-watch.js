/** Drop Watch rules shared by the booking server and the judge screens. Display and arming only. */
import { isDisplayedDrop } from './drop-eligibility.js';
import { compareDrops } from './room-match.js';

export const CLOSING_SOON_DAYS = 14;
const day = 86400000;

export function minorDigits(currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
}
// The agency never sends a Drop smaller than 10.00 in the booking currency.
export function agencyMinimumSavingMinor(currency) { return 10 * 10 ** minorDigits(currency); }
export function minimumSavingChoices(currency) {
  const unit = 10 ** minorDigits(currency);
  return [agencyMinimumSavingMinor(currency), 50 * unit, 100 * unit, 250 * unit];
}
export function dropSavingMinor(baseline, option) { return baseline.quotedRetail.totalMinor - option.estimate.totalMinor; }
// Best matched first (room-match.js), so the watch receipt, its chat and any later email list Drops in one order.
export function qualifyingDrops(baseline, options, minimumSavingMinor) {
  return options.filter(option => isDisplayedDrop(baseline, option) && dropSavingMinor(baseline, option) >= minimumSavingMinor).toSorted(compareDrops(baseline));
}
// The optional address a drop may later be sent to: a basic check only (one @, no spaces, a dotted
// domain, at most 64 characters before the @ and 254 in all). The server applies the same rule.
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;
export function deliveryEmailValid(value) { return typeof value === 'string' && value.length <= 254 && EMAIL.test(value); }
// What a catalogue card demonstrates, derived from the blocker and the free-cancellation deadline.
export function watchTag(blocker, freeUntil, at = new Date()) {
  if (blocker) return 'cannot-start';
  return Date.parse(freeUntil) - at.getTime() > CLOSING_SOON_DAYS * day ? 'ready' : 'closing-soon';
}
