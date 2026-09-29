import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Linear-style "peek" focus hook.
 *
 * - Tracks the currently focused row id.
 * - Toggles a peek panel via `Space`. Holding `Space` keeps it open until release.
 * - Arrow / J / K move focus through the supplied items. If peek is open, it
 *   follows the focus.
 * - Esc closes peek and clears focus.
 * - Disabled while typing in inputs/textareas/contenteditable, or when any
 *   open Radix dialog is detected.
 */
export function usePeekFocus(items: { id: string }[]) {
  const [focusedId, setFocusedIdState] = useState<string | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const peekHeldRef = useRef(false);
  const itemsRef = useRef(items);

  // Keep latest items available inside the keyboard handler without rebinding.
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // If the focused id no longer exists in the list, clear it.
  useEffect(() => {
    if (focusedId && !items.some((i) => i.id === focusedId)) {
      setFocusedIdState(null);
      setPeekOpen(false);
    }
  }, [items, focusedId]);

  const setFocusedId = useCallback((id: string | null) => {
    setFocusedIdState(id);
  }, []);

  const togglePeek = useCallback(() => {
    setPeekOpen((v) => !v);
  }, []);

  const closePeek = useCallback(() => {
    setPeekOpen(false);
  }, []);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      return false;
    };

    const isModalOpen = () => {
      // Radix dialogs use [data-state="open"] on the content / overlay.
      return !!document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
      );
    };

    // Track latest values without rebinding the listener every render.
    const focusedIdRef = { current: focusedId } as { current: string | null };
    const peekOpenRef = { current: peekOpen } as { current: boolean };
    focusedIdRef.current = focusedId;
    peekOpenRef.current = peekOpen;

    const moveFocus = (delta: number) => {
      const list = itemsRef.current;
      if (list.length === 0) return;
      setFocusedIdState((current) => {
        if (!current) return list[delta > 0 ? 0 : list.length - 1].id;
        const idx = list.findIndex((i) => i.id === current);
        if (idx === -1) return list[0].id;
        const next = Math.min(Math.max(idx + delta, 0), list.length - 1);
        return list[next].id;
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || isModalOpen()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Space: toggle peek; if held, treat as temporary peek-on.
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) {
          // Holding the key — ensure peek is on, mark as held.
          if (!peekHeldRef.current) {
            peekHeldRef.current = true;
            setPeekOpen(true);
          }
          return;
        }
        // Initial press: toggle.
        setPeekOpen((v) => !v);
        return;
      }

      if (e.key === "Escape") {
        if (peekHeldRef.current || focusedIdRef.current || peekOpenRef.current) {
          setPeekOpen(false);
          setFocusedIdState(null);
        }
        return;
      }

      if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        moveFocus(1);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        moveFocus(-1);
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && peekHeldRef.current) {
        peekHeldRef.current = false;
        setPeekOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [focusedId, peekOpen]);

  return { focusedId, setFocusedId, peekOpen, togglePeek, closePeek };
}