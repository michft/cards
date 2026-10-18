import type { PlayingCard } from '@mumscards/engine-core';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CardStack } from './card-stack';

const cards: PlayingCard[] = [
  { id: 'nine-clubs', rank: 9, suit: 'clubs', color: 'black' },
  { id: 'eight-hearts', rank: 8, suit: 'hearts', color: 'red' },
  { id: 'seven-spades', rank: 7, suit: 'spades', color: 'black' },
];

describe('CardStack bounds', () => {
  const mixedPile = Array.from({ length: 24 }, (_, index) => ({
    ...cards[index % cards.length],
    id: `pile-${index}`,
    faceUp: index >= 8,
  }));

  it.each([false, true])('fits a long mixed pile without shrinking or removing cards, expanded: %s', (expanded) => {
    const selected = vi.fn();
    const { getAllByRole } = render(<CardStack cardWidth={64} cards={mixedPile}
      expanded={expanded} maxHeight={250} onFaceUpCardPress={selected} placeholderLabel="" />);
    const layers = getAllByRole('button');
    expect(layers).toHaveLength(mixedPile.length);
    expect(layers[0].parentElement?.style.minHeight).toBe('250px');
    expect(layers[0].style.top).toBe('0px');
    for (let index = 0; index < layers.length; index += 1) {
      expect(layers[index].style.height).toBe('91px');
      expect(layers[index].style.width).toBe('64px');
      expect(Number.parseFloat(layers[index].style.top) + 91).toBeLessThanOrEqual(250);
      if (index > 0) {
        expect(Number.parseFloat(layers[index].style.top)).toBeGreaterThan(Number.parseFloat(layers[index - 1].style.top));
      }
    }
    expect(layers[23].style.top).toBe('159px');
    fireEvent.mouseDown(layers[15], { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseUp(document, { clientX: 10, clientY: 10, button: 0 });
    expect(selected).toHaveBeenCalledWith(15);
    expect(layers[15].textContent).toContain('9');
  });

  it('keeps normal spacing when uncapped and uses the final card bottom for mixed pile height', () => {
    const pile = mixedPile.slice(6, 10);
    const { getAllByRole, rerender } = render(<CardStack cardWidth={64} cards={pile} placeholderLabel="" />);
    const layers = getAllByRole('button');
    expect(layers.map((layer) => layer.style.top)).toEqual(['0px', '16px', '32px', '57px']);
    expect(layers[0].parentElement?.style.minHeight).toBe('148px');
    rerender(<CardStack cardWidth={64} cards={pile} maxHeight={400} expanded placeholderLabel="" />);
    expect(layers.map((layer) => layer.style.top)).toEqual(['0px', '22px', '44px', '88px']);
    expect(layers[0].parentElement?.style.minHeight).toBe('179px');
  });

  it('fits covered ranks within compressed strips while keeping the bottom card face unchanged', () => {
    const pile = mixedPile.slice(0, 19).map((card) => ({ ...card, faceUp: true }));
    const { getAllByRole } = render(<CardStack cardWidth={64} cards={pile}
      maxHeight={370} placeholderLabel="" />);
    const layers = getAllByRole('button');
    for (let index = 0; index < layers.length - 1; index += 1) {
      const face = layers[index].children[0];
      const rank = face.querySelector('[dir="auto"]');
      if (!rank) throw new Error('Card rank missing');
      const exposed = Number.parseFloat(layers[index + 1].style.top) - Number.parseFloat(layers[index].style.top);
      const padding = Number.parseFloat(window.getComputedStyle(face).paddingTop);
      const lineHeight = Number.parseFloat(window.getComputedStyle(rank).lineHeight);
      expect(padding + lineHeight + 1).toBeLessThanOrEqual(exposed);
      expect(Number.parseFloat(window.getComputedStyle(rank).fontSize)).toBeGreaterThanOrEqual(12);
    }
    const bottomFace = layers[18].children[0];
    const bottomRank = bottomFace.querySelector('[dir="auto"]');
    if (!bottomRank) throw new Error('Bottom card rank missing');
    expect(window.getComputedStyle(bottomFace).paddingTop).toBe('10px');
    expect(window.getComputedStyle(bottomRank).fontSize).toBe('18px');
    expect(layers[18].style.height).toBe('91px');
  });

  it('keeps one full card and leaves horizontal waste fanning unchanged', () => {
    const { getAllByRole, rerender } = render(<CardStack cardWidth={64} cards={cards.slice(0, 1)}
      maxHeight={91} placeholderLabel="" />);
    expect(getAllByRole('button')[0].parentElement?.style.minHeight).toBe('91px');
    rerender(<CardStack cardWidth={64} cards={cards} layoutMode="waste" maxHeight={10} placeholderLabel="" />);
    const layers = getAllByRole('button');
    expect(layers.map((layer) => layer.style.top)).toEqual(['0px', '0px', '0px']);
    expect(layers.map((layer) => layer.style.left)).toEqual(['0px', '27px', '54px']);
    expect(layers[0].parentElement?.style.minHeight).toBe('91px');
    expect(layers[0].parentElement?.style.width).toBe('118px');
  });

  it('fits a narrow waste fan and keeps card ranks and suits readable within smaller faces', () => {
    const { getAllByRole } = render(<CardStack cardWidth={24} cards={cards}
      layoutMode="waste" placeholderLabel="" />);
    const layers = getAllByRole('button');
    expect(layers.map((layer) => layer.style.left)).toEqual(['0px', '10px', '20px']);
    expect(layers[0].parentElement?.style.width).toBe('44px');
    const face = layers[0].firstElementChild as HTMLElement;
    expect(face.style.padding).toBe('2px');
    expect(face.textContent).toBe('9♣♣');
    expect(window.getComputedStyle(face.children[0]).flexDirection).toBe('row');
    const texts = face.querySelectorAll('[dir="auto"]');
    expect(texts[0]).toHaveProperty('style.fontSize', '9px');
    expect(texts[1]).toHaveProperty('style.fontSize', '7px');
    expect(texts[2]).toHaveProperty('style.fontSize', '11px');
  });

  it.each([24, 44, 47, 56, 61, 64, 72, 86])('fits all face text inside a %spx card without clipping', (cardWidth) => {
    const { getByRole } = render(<CardStack cardWidth={cardWidth} cards={cards.slice(0, 1)} placeholderLabel="" />);
    const layer = getByRole('button', { name: '9 ♣ ♣ ♣' });
    const face = layer.children[0];
    const faceStyle = window.getComputedStyle(face);
    const leading = face.children[0];
    const lineHeight = (element: Element) => Number.parseFloat(window.getComputedStyle(element).lineHeight);
    const leadingHeight = cardWidth < 44
      ? Math.max(...Array.from(leading.children, lineHeight))
      : Array.from(leading.children, lineHeight).reduce((sum, height) => sum + height, 2);
    const otherTextHeight = Array.from(face.children).slice(1).reduce((sum, text) => sum + lineHeight(text), 0);
    const contentHeight = Math.round(cardWidth * 1.42) - Number.parseFloat(faceStyle.paddingTop)
      - Number.parseFloat(faceStyle.paddingBottom) - 2;
    expect(leadingHeight + otherTextHeight).toBeLessThanOrEqual(contentHeight);
    expect(face.querySelectorAll('[dir="auto"]').length).toBeGreaterThanOrEqual(3);
  });
});

describe('CardStack dragging', () => {
  it.each([false, true])('only enables a face-down press with an explanation handler: %s', (enabled) => {
    const selected = vi.fn();
    const hidden = vi.fn();
    const started = vi.fn();
    const ended = vi.fn();
    const { getByRole } = render(<CardStack cardWidth={64} cards={[{ ...cards[0], faceUp: false }]}
      onFaceUpCardPress={selected} onFaceDownCardPress={enabled ? hidden : undefined}
      onCardDragStart={started} onCardDragEnd={ended} placeholderLabel="" />);
    const source = getByRole('button');
    fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(source, { clientX: 30, clientY: 30, buttons: 1 });
    fireEvent.mouseUp(document, { clientX: 30, clientY: 30, button: 0 });
    expect(hidden).toHaveBeenCalledTimes(enabled ? 1 : 0);
    if (enabled) {
      expect(hidden).toHaveBeenCalledWith(0);
      expect(source.getAttribute('aria-label')).toBe('Face-down card');
    }
    expect(source.textContent).not.toContain('9');
    expect(selected).not.toHaveBeenCalled();
    expect(started).not.toHaveBeenCalled();
    expect(ended).not.toHaveBeenCalled();
  });

  it('cancels an interrupted drag without committing a drop', async () => {
    const started = vi.fn();
    const ended = vi.fn();
    const cancelled = vi.fn();
    const { getAllByRole } = render(<CardStack cardWidth={64} cards={cards}
      onCardDragStart={started} onCardDragEnd={ended} onCardDragCancel={cancelled} placeholderLabel="" />);
    const source = getAllByRole('button')[0];
    fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseMove(source, { clientX: 30, clientY: 30, buttons: 1 });
    await waitFor(() => expect(started).toHaveBeenCalledOnce());
    fireEvent.touchCancel(source, { touches: [], changedTouches: [{ identifier: 0, pageX: 30, pageY: 30 }] });
    await waitFor(() => expect(cancelled).toHaveBeenCalledOnce());
    expect(ended).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'unmount', 'unmount-release'] as const)('ignores queued drag measurements after %s', (interruption) => {
    vi.useFakeTimers();
    try {
      const started = vi.fn();
      const ended = vi.fn();
      const cancelled = vi.fn();
      const { getAllByRole, unmount } = render(<CardStack cardWidth={64} cards={cards}
        onCardDragStart={started} onCardDragEnd={ended} onCardDragCancel={cancelled} placeholderLabel="" />);
      const source = getAllByRole('button')[0];
      fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0 });
      fireEvent.mouseMove(source, { clientX: 30, clientY: 30, buttons: 1 });
      expect(started).not.toHaveBeenCalled();
      if (interruption === 'cancel') {
        fireEvent.touchCancel(source, { touches: [], changedTouches: [{ identifier: 0, pageX: 30, pageY: 30 }] });
        expect(cancelled).toHaveBeenCalledOnce();
      } else {
        if (interruption === 'unmount-release') {
          fireEvent.mouseUp(document, { clientX: 80, clientY: 80, button: 0 });
        }
        unmount();
      }
      act(() => { vi.runAllTimers(); });
      expect(started).not.toHaveBeenCalled();
      expect(ended).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it('delivers a fast release once when the first drag measurement is still queued', () => {
    vi.useFakeTimers();
    try {
      const started = vi.fn();
      const ended = vi.fn();
      const { getAllByRole } = render(<CardStack cardWidth={64} cards={cards}
        onCardDragStart={started} onCardDragEnd={ended} placeholderLabel="" />);
      const source = getAllByRole('button')[0];
      fireEvent.mouseDown(source, { clientX: 10, clientY: 10, button: 0 });
      fireEvent.mouseMove(source, { clientX: 30, clientY: 30, buttons: 1 });
      fireEvent.mouseUp(document, { clientX: 80, clientY: 80, button: 0 });
      act(() => { vi.runAllTimers(); });
      expect(started).toHaveBeenCalledOnce();
      expect(ended).toHaveBeenCalledOnce();
      expect(ended.mock.calls[0][1]).toMatchObject({ pageX: 80, pageY: 80 });
    } finally { vi.useRealTimers(); }
  });

  it.each([
    { label: 'tableau', layoutMode: 'stack' as const, stack: cards, cardIndex: 1, maxHeight: undefined },
    { label: 'bounded tableau', layoutMode: 'stack' as const, stack: cards, cardIndex: 1, maxHeight: 110 },
    { label: 'waste', layoutMode: 'waste' as const, stack: cards, cardIndex: 2, maxHeight: undefined },
    { label: 'single card', layoutMode: 'stack' as const, stack: cards.slice(0, 1), cardIndex: 0, maxHeight: undefined },
  ])('keeps $label responder mounted until the drag finishes', async ({ layoutMode, stack, cardIndex, maxHeight }) => {
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
          maxHeight={maxHeight}
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
