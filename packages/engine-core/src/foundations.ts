import { getCardColor, SUITS, type PlayingCard, type Suit } from './cards';

export type FoundationBuildPolicy =
  | 'alternate-red-black'
  | 'red-black'
  | 'any'
  | 'suit-matching';

export function isSafeFoundationMove(
  card: PlayingCard,
  foundations: readonly (readonly PlayingCard[])[],
  policy: FoundationBuildPolicy = 'alternate-red-black',
): boolean {
  const ranks: Record<Suit, number> = { clubs: 0, diamonds: 0, hearts: 0, spades: 0 };
  for (const pile of foundations) {
    const top = pile[pile.length - 1];
    if (top) {
      ranks[top.suit] = Math.max(ranks[top.suit], top.rank);
    }
  }

  if (
    card.rank !== ranks[card.suit] + 1
    || (card.rank === 1 && !foundations.some((pile) => pile.length === 0))
  ) {
    return false;
  }

  if (policy === 'suit-matching') {
    return true;
  }
  if (policy !== 'any' && card.rank <= 2) {
    return true;
  }

  return SUITS.every((suit) => {
    if (suit === card.suit) {
      return true;
    }
    const requiredRank = policy === 'any' || getCardColor(suit) !== card.color
      ? card.rank - 1
      : card.rank - 2;
    return ranks[suit] >= requiredRank;
  });
}
