import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDrops, CONTRAST_KINDS, CONTRAST_MIN_SAVING_PERCENT, dropMatch, OTHER_ROOM_MAX_SAVING_PERCENT, sameMealPlan, sameRoomType, topDrops,
  withinSavingCap } from '../app/public/room-match.js';

// Booked names and the supplier spellings they meet in real Gateway inventory.
const ROOMS = [
  ['Executive Suite', ['EXECUTIVE SUITE', 'Executive, Suite', 'Executive, Suite, King Bed, Lounge Access'], ['Garden Suite', 'Executive Room', 'Deluxe Suite']],
  ['Executive Marina Bay Room', ['Executive Marina Bay King', 'Marina Bay, Executive', 'Marina Bay, Executive, Double Or Twin Bed'], ['Deluxe']],
  ['Lifestyle Premier King - Family Room With Sofa Bed For 1 Child',
    ['Lifestyle Premier King \u2013 Family Room With Sofa Bed For 1 Child', 'Lifestyle, Premier, Family, King Bed, Sofa'],
    ['Lifestyle Premier Room', 'Premier', 'Signature Executive King - Family Room With Sofa Bed']],
  ['Premium Panoramic View (New Renovated)', ['Premium, King Bed, Panoramic View', 'Guest Room, Premium, Twin Beds, Panoramic View'],
    ['Premium, King Bed, City View', 'Panoramic, King Bed', 'Suite, King Bed, Panoramic View, Executive Lounge Access']],
  ['Signature Banyan Retreat King', ['Signature, Banyan, Retreat, King Bed', 'Signature, Banyan, Retreat'],
    ['Banyan Retreat King', 'Signature Sky Retreat King', 'Signature Banyan Retreat Twin']],
];

test('room types match across supplier spellings but never across a category or bed change', () => {
  for (const [booked, same, other] of ROOMS) {
    for (const offered of same) assert.equal(sameRoomType(booked, offered), true, `${booked} = ${offered}`);
    for (const offered of other) assert.equal(sameRoomType(booked, offered), false, `${booked} != ${offered}`);
  }
  // A booking with no meaningful words matches nothing, not everything.
  for (const booked of ['Room', '', null, undefined]) assert.equal(sameRoomType(booked, 'Room'), false);
});

test('meal plans compare case, punctuation and whitespace insensitively', () => {
  assert.equal(sameMealPlan('Breakfast', 'Breakfast '), true);
  assert.equal(sameMealPlan('Bed & Breakfast', 'bed  breakfast'), true);
  assert.equal(sameMealPlan('Room Only', 'Breakfast'), false);
});

const baseline = { room: { name: 'Executive Suite', board: 'Breakfast' }, freeCancellation: true, quotedRetail: { totalMinor: 100000, currency: 'MYR' } };
const drop = (roomName, totalMinor, { board = 'Breakfast', freeCancellation = true } = {}) =>
  ({ roomName, board, freeCancellation, estimate: { totalMinor, currency: 'MYR' }, indicativeDifferenceMinor: baseline.quotedRetail.totalMinor - totalMinor });

test('a Drop matches on room, meals and the cancellation flag', () => {
  assert.deepEqual(dropMatch(baseline, drop('Executive, Suite, King Bed', 90000)), { room: true, meals: true, cancellation: true });
  assert.deepEqual(dropMatch(baseline, drop('Deluxe Room', 90000, { board: 'Room only', freeCancellation: false })), { room: false, meals: false, cancellation: false });
  // Unknown is its own flag: neither the same as refundable nor as non-refundable.
  assert.equal(dropMatch(baseline, drop('Executive Suite', 90000, { freeCancellation: null })).cancellation, false);
  assert.equal(dropMatch({ ...baseline, freeCancellation: false }, drop('Executive Suite', 90000, { freeCancellation: false })).cancellation, true);
});

test('Drops rank same room, then same meals, then refundable, then cheapest', () => {
  const options = [drop('Deluxe Room', 85000), drop('Executive Suite', 95000, { freeCancellation: false }), drop('Deluxe Room', 92000, { board: 'Room only' }),
    drop('Deluxe Room', 88000, { freeCancellation: false }), drop('Executive Suite', 97000), drop('Executive Suite', 96000)];
  assert.deepEqual(options.toSorted(compareDrops(baseline)).map(option => [option.roomName, option.board, option.freeCancellation, option.estimate.totalMinor]), [
    ['Executive Suite', 'Breakfast', true, 96000], ['Executive Suite', 'Breakfast', true, 97000], ['Executive Suite', 'Breakfast', false, 95000],
    ['Deluxe Room', 'Breakfast', true, 85000], ['Deluxe Room', 'Breakfast', false, 88000], ['Deluxe Room', 'Room only', true, 92000]]);
});

test('another room type may save at most 20% of the booking; the same room type is uncapped', () => {
  assert.equal(OTHER_ROOM_MAX_SAVING_PERCENT, 20);
  assert.equal(withinSavingCap(baseline, drop('Deluxe Room', 80000)), true);
  assert.equal(withinSavingCap(baseline, drop('Deluxe Room', 79999)), false);
  assert.equal(withinSavingCap(baseline, drop('Executive Suite', 50000)), true);
});

test('the top three are best matched first and one per trimmed room name, meal plan and flag', () => {
  const options = [drop('Deluxe Room', 85000), drop(' deluxe room ', 84000, { board: 'Breakfast ' }), drop('Deluxe Room', 86000, { freeCancellation: false }),
    drop('Garden Room', 90000), drop('Executive Suite', 99000)];
  assert.deepEqual(topDrops(baseline, options).map(option => [option.roomName, option.estimate.totalMinor]),
    [['Executive Suite', 99000], [' deluxe room ', 84000], ['Garden Room', 90000]]);
  // Wrapped candidates rank by their option.
  assert.deepEqual(topDrops(baseline, options.map(option => ({ option })), item => item.option).map(item => item.option.estimate.totalMinor), [99000, 84000, 90000]);
});

// Two perfect matches, then near-matches that each differ in one way, at several savings (the booking is MYR 1000.00).
const PERFECT = [drop('Executive Suite', 90000), drop('Executive, Suite', 92000)];
const MEALS = [drop('Executive Suite', 95000, { board: 'Room only' }), drop('EXECUTIVE SUITE', 93000, { board: 'Room only' })];
const ROOM = [drop('Deluxe Room', 96000), drop('Garden Room', 90000)];
const CANCELLATION = [drop('Executive Suite', 96500, { freeCancellation: false }), drop('Executive Suite', 97500, { freeCancellation: false })];
const TWO_WAYS = [drop('Deluxe Room', 97000, { board: 'Room only' }), drop('Garden Room', 94000, { freeCancellation: null })];
const third = (candidates, contrast) => {
  const chosen = topDrops(baseline, candidates, undefined, contrast);
  return [chosen.length, chosen[2] && [chosen[2].roomName, chosen[2].board, chosen[2].freeCancellation, chosen[2].estimate.totalMinor]];
};

test('the third Drop differs in exactly the asked way, at the nearest price saving at least 3%', () => {
  assert.deepEqual([CONTRAST_KINDS, CONTRAST_MIN_SAVING_PERCENT], [['meals', 'room', 'cancellation'], 3]);
  const all = [...TWO_WAYS, ...CANCELLATION, ...ROOM, ...MEALS, ...PERFECT];
  assert.deepEqual(topDrops(baseline, all, undefined, 'meals').slice(0, 2), PERFECT, 'the first two stay the best matched');
  assert.deepEqual(third(all, 'meals'), [3, ['Executive Suite', 'Room only', true, 95000]]);
  assert.deepEqual(third(all, 'room'), [3, ['Deluxe Room', 'Breakfast', true, 96000]]);
  // 97500 saves only 2.5%: a token difference, so the 3.5% one is the nearest.
  assert.deepEqual(third(all, 'cancellation'), [3, ['Executive Suite', 'Breakfast', false, 96500]]);
  // Unasked, meals come first.
  assert.deepEqual(third(all), third(all, 'meals'));
  // Wrapped candidates pick the same contrast.
  assert.equal(topDrops(baseline, all.map(option => ({ option })), item => item.option, 'room')[2].option, ROOM[0]);
  assert.throws(() => topDrops(baseline, all, undefined, 'view'), RangeError);
});

test('the 3% floor is inclusive and a missing kind falls back to meals, then room, then cancellation', () => {
  assert.deepEqual(third([...PERFECT, drop('Executive Suite', 97000, { freeCancellation: false })], 'cancellation'), [3, ['Executive Suite', 'Breakfast', false, 97000]]);
  assert.deepEqual(third([...PERFECT, drop('Executive Suite', 97001, { freeCancellation: false }), drop('Executive Suite King', 99500)], 'cancellation'),
    [3, ['Executive Suite King', 'Breakfast', true, 99500]], 'just under 3% is no contrast: the third best matched instead');
  assert.deepEqual(third([...PERFECT, ...ROOM, ...CANCELLATION], 'meals'), [3, ['Deluxe Room', 'Breakfast', true, 96000]]);
  assert.deepEqual(third([...PERFECT, ...MEALS, ...CANCELLATION], 'room'), [3, ['Executive Suite', 'Room only', true, 95000]]);
  assert.deepEqual(third([...PERFECT, ...CANCELLATION], 'room'), [3, ['Executive Suite', 'Breakfast', false, 96500]]);
  assert.deepEqual(third([...PERFECT, ...ROOM], 'cancellation'), [3, ['Deluxe Room', 'Breakfast', true, 96000]]);
});

test('with no one-way contrast the third Drop is the next best matched, and fewer candidates give fewer Drops', () => {
  assert.deepEqual(third([...TWO_WAYS, ...PERFECT, drop('Executive Suite King', 99000)]), [3, ['Executive Suite King', 'Breakfast', true, 99000]]);
  assert.deepEqual(third([...TWO_WAYS, ...PERFECT]), [3, ['Garden Room', 'Breakfast', null, 94000]]);
  assert.deepEqual(third(PERFECT, 'meals'), [2, undefined]);
  assert.deepEqual(topDrops(baseline, [], undefined, 'room'), []);
});

test('the contrast never repeats a room, meal plan and flag already shown, and another room type stays within the cap', () => {
  // One perfect match, so the cheapest Room only Suite is the second Drop; its dearer twin cannot be the third.
  assert.deepEqual(topDrops(baseline, [PERFECT[0], ...MEALS, ...ROOM], undefined, 'meals').map(option => [option.roomName, option.board, option.estimate.totalMinor]),
    [['Executive Suite', 'Breakfast', 90000], ['EXECUTIVE SUITE', 'Room only', 93000], ['Deluxe Room', 'Breakfast', 96000]]);
  // A 21% cheaper other room type is past the cap; at exactly 20% it may be the contrast.
  assert.deepEqual(third([...PERFECT, drop('Superior Room', 79000), ...CANCELLATION], 'room'), [3, ['Executive Suite', 'Breakfast', false, 96500]]);
  assert.deepEqual(third([...PERFECT, drop('Superior Room', 80000), ...CANCELLATION], 'room'), [3, ['Superior Room', 'Breakfast', true, 80000]]);
});
