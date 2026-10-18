import type { PlayingCard } from '@mumscards/engine-core';
import { useEffect, useRef, useState } from 'react';
import type { View } from 'react-native';

import type { DragPayload } from './card-stack';

type Rectangle = { x: number; y: number; width: number; height: number };
type Target<Destination> = {
  destination: Destination;
  node: View | null;
  rectangle?: Rectangle;
  ref: (node: View | null) => void;
};
type Drag<Source, Destination> = {
  source: Source;
  cards: PlayingCard[];
  destinations: Destination[];
  x: number;
  y: number;
  touchOffsetX: number;
  touchOffsetY: number;
  activeDestination: Destination | null;
};

/** Shared gesture state; game engines remain responsible for legal moves. */
export function useCardDrag<Source, Destination>({
  getCards,
  getDestinations,
  onDrop,
  onStart,
  onCancel,
}: {
  getCards(source: Source): PlayingCard[];
  getDestinations(source: Source): Destination[];
  onDrop(source: Source, destination: Destination): void;
  onStart?(source: Source): void;
  onCancel?(): void;
}) {
  const rootRef = useRef<View | null>(null);
  const targets = useRef(new Map<string, Target<Destination>>());
  const currentDrag = useRef<Drag<Source, Destination> | null>(null);
  const [drag, setDrag] = useState<Drag<Source, Destination> | null>(null);
  const [rootOffset, setRootOffset] = useState({ x: 0, y: 0 });

  useEffect(() => () => { currentDrag.current = null; }, []);

  function registerTarget(key: string, destination: Destination): (node: View | null) => void {
    let target = targets.current.get(key);
    if (!target) {
      target = {
        destination,
        node: null,
        ref: (node) => {
          const registered = targets.current.get(key);
          if (registered) {
            registered.node = node;
            registered.rectangle = undefined;
          }
        },
      };
      targets.current.set(key, target);
    }
    target.destination = destination;
    return target.ref;
  }

  function measure(done?: () => void) {
    rootRef.current?.measureInWindow((x, y) => setRootOffset((current) =>
      current.x === x && current.y === y ? current : { x, y }));
    const mounted = [...targets.current.values()].filter((target) => target.node);
    if (!mounted.length) {
      done?.();
      return;
    }
    let pending = mounted.length;
    for (const target of mounted) {
      target.node?.measureInWindow((x, y, width, height) => {
        target.rectangle = { x, y, width, height };
        pending -= 1;
        if (!pending) done?.();
      });
    }
  }

  function destinationAtPoint(active: Drag<Source, Destination>, payload: DragPayload) {
    for (const target of targets.current.values()) {
      const rectangle = target.rectangle;
      if (!target.node || !rectangle || !active.destinations.some((destination) =>
        JSON.stringify(destination) === JSON.stringify(target.destination))) continue;
      if (payload.pageX >= rectangle.x && payload.pageX <= rectangle.x + rectangle.width &&
        payload.pageY >= rectangle.y && payload.pageY <= rectangle.y + rectangle.height) {
        return target.destination;
      }
    }
    return null;
  }

  function start(source: Source, payload: DragPayload) {
    const cards = getCards(source);
    const destinations = getDestinations(source);
    if (!cards.length || !destinations.length) return;
    const active: Drag<Source, Destination> = {
      source, cards, destinations,
      x: payload.layout.x, y: payload.layout.y,
      touchOffsetX: payload.pageX - payload.layout.x,
      touchOffsetY: payload.pageY - payload.layout.y,
      activeDestination: null,
    };
    currentDrag.current = active;
    setDrag(active);
    onStart?.(source);
    measure();
  }

  function move(payload: DragPayload) {
    const active = currentDrag.current;
    if (!active) return;
    const next = {
      ...active,
      x: payload.pageX - active.touchOffsetX,
      y: payload.pageY - active.touchOffsetY,
      activeDestination: destinationAtPoint(active, payload),
    };
    currentDrag.current = next;
    setDrag(next);
  }

  function cancel() {
    currentDrag.current = null;
    setDrag(null);
    onCancel?.();
  }

  function end(payload: DragPayload) {
    const active = currentDrag.current;
    if (!active) return;
    // Re-measure at release: scrolling or a fast final movement may change the target.
    measure(() => {
      if (currentDrag.current !== active) return;
      const destination = destinationAtPoint(active, payload);
      cancel();
      if (destination !== null) onDrop(active.source, destination);
    });
  }

  return { drag, rootRef, rootOffset, registerTarget, measureTargets: () => measure(), start, move, end, cancel };
}
