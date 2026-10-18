/** Drop Watch rules shared by the booking server and the judge screens. Display and arming only. */
import { isDisplayedDrop } from './drop-eligibility.js';

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
export function qualifyingDrops(baseline, options, minimumSavingMinor) {
  return options.filter(option => isDisplayedDrop(baseline, option) && dropSavingMinor(baseline, option) >= minimumSavingMinor);
}
// What a catalogue card demonstrates, derived from the blocker and the free-cancellation deadline.
export function watchTag(blocker, freeUntil, at = new Date()) {
  if (blocker) return 'cannot-start';
  return Date.parse(freeUntil) - at.getTime() > CLOSING_SOON_DAYS * day ? 'ready' : 'closing-soon';
}
