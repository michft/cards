import { describe, expect, it } from 'vitest';

import { createDeck, isSafeFoundationMove, SUITS } from '../src';

const deck = createDeck('safety');
const clubsAce = deck.find((card) => card.suit === 'clubs' && card.rank === 1)!;
const clubsTwo = deck.find((card) => card.suit === 'clubs' && card.rank === 2)!;
const clubsFive = deck.find((card) => card.suit === 'clubs' && card.rank === 5)!;

function foundations(ranks: [number, number, number, number]) {
  return SUITS.map((suit, index) => deck.filter(
    (card) => card.suit === suit && card.rank <= ranks[index],
  ));
}

describe('safe foundation moves', () => {
  it('allows legally playable Aces and Twos with alternating colors', () => {
    expect(isSafeFoundationMove(clubsAce, foundations([0, 0, 0, 0]))).toBe(true);
    expect(isSafeFoundationMove(clubsTwo, foundations([1, 0, 0, 0]))).toBe(true);
  });

  it('requires both opposite suits and the other same-color suit to catch up', () => {
    expect(isSafeFoundationMove(clubsFive, foundations([4, 4, 4, 3]))).toBe(true);
    expect(isSafeFoundationMove(clubsFive, foundations([4, 3, 4, 3]))).toBe(false);
    expect(isSafeFoundationMove(clubsFive, foundations([4, 4, 3, 3]))).toBe(false);
    expect(isSafeFoundationMove(clubsFive, foundations([4, 4, 4, 2]))).toBe(false);
    expect(isSafeFoundationMove(clubsFive, foundations([4, 4, 4, 3]), 'red-black')).toBe(true);
    expect(isSafeFoundationMove(clubsFive, foundations([4, 4, 4, 2]), 'red-black')).toBe(false);
  });

  it('requires every other suit at the preceding rank when tableau accepts any suit', () => {
    expect(isSafeFoundationMove(clubsFive, foundations([4, 4, 4, 3]), 'any')).toBe(false);
    expect(isSafeFoundationMove(clubsFive, foundations([4, 4, 4, 4]), 'any')).toBe(true);
    expect(isSafeFoundationMove(clubsTwo, foundations([1, 0, 0, 0]), 'any')).toBe(false);
    expect(isSafeFoundationMove(clubsAce, foundations([0, 0, 0, 0]), 'any')).toBe(true);
  });

  it('allows legal same-suit promotions without waiting for other suits', () => {
    expect(isSafeFoundationMove(clubsFive, foundations([4, 0, 0, 0]), 'suit-matching')).toBe(true);
  });

  it('rejects skipped ranks and duplicate promotions for every build policy', () => {
    for (const policy of ['alternate-red-black', 'red-black', 'any', 'suit-matching'] as const) {
      expect(isSafeFoundationMove(clubsFive, foundations([3, 4, 4, 4]), policy)).toBe(false);
      expect(isSafeFoundationMove(clubsFive, foundations([5, 4, 4, 4]), policy)).toBe(false);
      expect(isSafeFoundationMove(clubsTwo, foundations([0, 4, 4, 4]), policy)).toBe(false);
    }
  });
});
