import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Tracks "Saving…" / "Saved" feedback for inline edits across a listing page.
 * Wrap any async save call with `track(promise)` (or `track(() => updateFn(...))`).
 *
 * Multiple in-flight saves are coalesced — the indicator stays in `saving`
 * until *all* tracked promises settle, then flips to `saved` for ~2s.
 */
export function useAutosaveStatus(savedHoldMs = 2000) {
  const [state, setState] = useState<SaveState>('idle');
  const pendingRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const track = useCallback(<T,>(input: Promise<T> | (() => Promise<T>)): Promise<T> => {
    pendingRef.current += 1;
    setState('saving');
    clearTimer();
    const p = typeof input === 'function' ? (input as () => Promise<T>)() : input;
    return Promise.resolve(p).finally(() => {
      pendingRef.current = Math.max(0, pendingRef.current - 1);
      if (pendingRef.current === 0) {
        setState('saved');
        timerRef.current = setTimeout(() => setState('idle'), savedHoldMs);
      }
    }) as Promise<T>;
  }, [savedHoldMs]);

  // Cleanup on unmount.
  useEffect(() => () => clearTimer(), []);

  return { state, track };
}
