import { useCallback, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';

interface RowProps {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

interface PillProps {
  'data-pill-value': string;
  onClick: (e: ReactMouseEvent<HTMLButtonElement>) => void;
}

interface PillDragToggle<T extends string | number> {
  dragging: boolean;
  rowProps: RowProps;
  pillProps: (value: T) => PillProps;
}

export function usePillDragToggle<T extends string | number>(
  selected: Set<T>,
  setSelected: (next: Set<T>) => void,
  parseValue: (raw: string) => T | null,
): PillDragToggle<T> {
  const [dragging, setDragging] = useState(false);
  const targetStateRef = useRef<boolean>(false);
  const touchedRef = useRef<Set<T>>(new Set());
  const draftRef = useRef<Set<T>>(new Set());
  const suppressClickRef = useRef(false);

  const pillValueFromPoint = (x: number, y: number): T | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const pill = (el as HTMLElement).closest<HTMLElement>('[data-pill-value]');
    if (!pill) return null;
    const raw = pill.dataset.pillValue;
    if (raw == null) return null;
    return parseValue(raw);
  };

  const paint = (value: T) => {
    if (touchedRef.current.has(value)) return;
    touchedRef.current.add(value);
    if (targetStateRef.current) draftRef.current.add(value);
    else draftRef.current.delete(value);
    setSelected(new Set(draftRef.current));
  };

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== undefined && e.button !== 0) return;
      const value = pillValueFromPoint(e.clientX, e.clientY);
      if (value == null) return;
      draftRef.current = new Set(selected);
      targetStateRef.current = !draftRef.current.has(value);
      touchedRef.current = new Set();
      suppressClickRef.current = true;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      paint(value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const value = pillValueFromPoint(e.clientX, e.clientY);
    if (value == null) return;
    paint(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    // The synthetic click (if any) fires after pointerup in the same task.
    // Clear the suppress flag on the next macrotask so a stale flag from a
    // drag that never produced a click can't eat a later real tap.
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    endDrag(e);
  }, [dragging]);

  const onPointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    endDrag(e);
    suppressClickRef.current = false;
  }, [dragging]);

  const pillProps = useCallback(
    (value: T): PillProps => ({
      'data-pill-value': String(value),
      onClick: () => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        const next = new Set(selected);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        setSelected(next);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected],
  );

  return {
    dragging,
    rowProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    pillProps,
  };
}
