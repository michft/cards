export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type Rank =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13;

export type CardColor = 'red' | 'black';

export type PlayingCard = {
  id: string;
  suit: Suit;
  rank: Rank;
  color: CardColor;
};

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

export function getCardColor(suit: Suit): CardColor {
  return suit === 'diamonds' || suit === 'hearts' ? 'red' : 'black';
}

export function createDeck(prefix = 'card'): PlayingCard[] {
  const deck: PlayingCard[] = [];

  for (const suit of SUITS) {
    for (let rank = 1 as Rank; rank <= 13; rank += 1) {
      deck.push({
        id: `${prefix}-${suit}-${rank}`,
        suit,
        rank: rank as Rank,
        color: getCardColor(suit),
      });
    }
  }

  return deck;
}

export function rankLabel(rank: Rank): string {
  if (rank === 1) {
    return 'A';
  }

  if (rank === 11) {
    return 'J';
  }

  if (rank === 12) {
    return 'Q';
  }

  if (rank === 13) {
    return 'K';
  }

  return String(rank);
}
