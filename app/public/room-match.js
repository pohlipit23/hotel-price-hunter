/** How a Drop matches the booking, shared by the captures, the Drops page and the Drop Watch so a Drop ranks one way everywhere. */
const STOPWORDS = new Set(['room', 'rooms', 'the', 'with', 'for', 'and', 'a', 'an', 'of', 'guest']);
// Category words: an offer that adds or drops one is another room type, however many other words it shares.
const TIER = new Set(['suite', 'villa', 'club', 'executive', 'premier', 'premium', 'deluxe', 'superior', 'standard', 'family', 'signature', 'sky',
  'penthouse', 'presidential', 'garden', 'junior', 'studio', 'apartment', 'loft', 'collection', 'urban', 'lifestyle', 'panoramic', 'terrace', 'balcony']);
const BED = new Set(['king', 'queen', 'twin', 'double', 'single', 'triple']);
// Suppliers spell one room many ways ("Executive, Suite, King Bed"), so names compare as word sets; bracketed notes are dropped.
const words = name => new Set(String(name ?? '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z0-9]+/).filter(word => word && !STOPWORDS.has(word)));
const tiers = set => [...set].filter(word => TIER.has(word)).sort().join();

export function sameRoomType(bookedName, offeredName) {
  const booked = words(bookedName), offered = words(offeredName);
  const shared = [...booked].filter(word => offered.has(word)).length;
  // Most of the booked words, the same category words, and no other bed type when the booking names one.
  return booked.size > 0 && shared * 4 >= booked.size * 3 && tiers(booked) === tiers(offered)
    && (![...booked].some(word => BED.has(word)) || [...offered].every(word => !BED.has(word) || booked.has(word)));
}
const plan = value => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(' ');
export function sameMealPlan(a, b) { return plan(a) === plan(b); }

const flag = value => value === true ? true : value === false ? false : null;
// Which booking facts a Drop keeps. Cancellation compares the flags, so a refundable booking keeps it only with a refundable Drop.
export function dropMatch(baseline, option) {
  return { room: sameRoomType(baseline.room?.name, option.roomName), meals: sameMealPlan(baseline.room?.board, option.board),
    cancellation: flag(baseline.freeCancellation) === flag(option.freeCancellation) };
}
// The one Drop order: same room type, then same meals, then refundable, then the cheapest (the biggest saving).
export function compareDrops(baseline) {
  return (a, b) => {
    const x = dropMatch(baseline, a), y = dropMatch(baseline, b);
    return Number(y.room) - Number(x.room) || Number(y.meals) - Number(x.meals)
      || Number(b.freeCancellation === true) - Number(a.freeCancellation === true) || a.estimate.totalMinor - b.estimate.totalMinor;
  };
}

// A different room type far below the booking is usually a lower category, not the same stay for less.
export const OTHER_ROOM_MAX_SAVING_PERCENT = 20;
export function withinSavingCap(baseline, option) {
  return sameRoomType(baseline.room?.name, option.roomName)
    || option.indicativeDifferenceMinor * 100 <= baseline.quotedRetail.totalMinor * OTHER_ROOM_MAX_SAVING_PERCENT;
}
// At most three, best matched first and one per room name, meal plan and cancellation flag.
export function topDrops(baseline, candidates, optionOf = candidate => candidate) {
  const order = compareDrops(baseline); const seen = new Set();
  return candidates.toSorted((a, b) => order(optionOf(a), optionOf(b))).filter(candidate => {
    const option = optionOf(candidate);
    const key = JSON.stringify([option.roomName.trim().toLowerCase(), option.board.trim().toLowerCase(), option.freeCancellation]);
    if (seen.has(key)) return false; seen.add(key); return true;
  }).slice(0, 3);
}
