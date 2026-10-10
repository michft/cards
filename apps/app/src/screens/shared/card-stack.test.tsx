import type { PlayingCard } from '@mumscards/engine-core';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CardStack } from './card-stack';

const cards: PlayingCard[] = [
  { id: 'nine-clubs', rank: 9, suit: 'clubs', color: 'black' },
  { id: 'eight-hearts', rank: 8, suit: 'hearts', color: 'red' },
  { id: 'seven-spades', rank: 7, suit: 'spades', color: 'black' },
];

describe('CardStack dragging', () => {
  it.each([
    { label: 'tableau', layoutMode: 'stack' as const, stack: cards, cardIndex: 1 },
    { label: 'waste', layoutMode: 'waste' as const, stack: cards, cardIndex: 2 },
    { label: 'single card', layoutMode: 'stack' as const, stack: cards.slice(0, 1), cardIndex: 0 },
  ])('keeps $label responder mounted until the drag finishes', async ({ layoutMode, stack, cardIndex }) => {
    const started = vi.fn();
    const moved = vi.fn();
    const ended = vi.fn();

    function DraggingStack() {
      const [hiddenFromIndex, setHiddenFromIndex] = useState<number>();

      return (
        <CardStack
          cardWidth={64}
          cards={stack}
          hiddenFromIndex={hiddenFromIndex}
          layoutMode={layoutMode}
          onCardDragStart={(index, payload) => {
            started(index, payload);
            setHiddenFromIndex(index);
          }}
          onCardDragMove={moved}
          onCardDragEnd={ended}
          placeholderLabel="Empty"
        />
      );
    }

    const { getAllByRole } = render(<DraggingStack />);
    const layers = getAllByRole('button');
    const source = layers[cardIndex];
    const stackElement = source.parentElement;
    const stackHeight = stackElement?.style.minHeight;
    const stackWidth = stackElement?.style.width;

    fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(source, { clientX: 30, clientY: 30, buttons: 1 });
    await waitFor(() => expect(started).toHaveBeenCalledOnce());

    expect(source.isConnected).toBe(true);
    expect(window.getComputedStyle(source).opacity).toBe('0');
    expect(stackElement?.style.minHeight).toBe(stackHeight);
    expect(stackElement?.style.width).toBe(stackWidth);

    fireEvent.mouseMove(document, { clientX: 70, clientY: 70, buttons: 1 });
    await waitFor(() => expect(moved).toHaveBeenCalledOnce());
    fireEvent.mouseUp(document, { clientX: 80, clientY: 80, button: 0 });
    await waitFor(() => expect(ended).toHaveBeenCalledOnce());

    expect(started.mock.calls[0][0]).toBe(cardIndex);
    expect(moved.mock.calls[0][0]).toBe(cardIndex);
    expect(ended.mock.calls[0][0]).toBe(cardIndex);
    expect(ended.mock.calls[0][1]).toMatchObject({ pageX: 80, pageY: 80 });
  });
});
