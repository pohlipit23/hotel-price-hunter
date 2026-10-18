/** Shared by the booking cards and their chat context. */
export function isDisplayedDrop(baseline, option) {
  return option.estimate?.currency === baseline.quotedRetail?.currency
    && Number.isSafeInteger(option.estimate.totalMinor) && Number.isSafeInteger(baseline.quotedRetail.totalMinor)
    && baseline.quotedRetail.totalMinor > option.estimate.totalMinor;
}
