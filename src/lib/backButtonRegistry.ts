import { useEffect, useRef } from 'react';

export type BackHandler = () => boolean | void;

interface HandlerEntry {
  id: string;
  seq: number;
  priority: number;
  handler: BackHandler;
}

const handlers: HandlerEntry[] = [];
let nextId = 0;
let globalSeq = 0;

/**
 * Register a handler to intercept Android hardware back button.
 * Higher priority handlers are executed first.
 * Handlers with equal priority are executed in LIFO order (newest first).
 * Return `true` or undefined from the handler to mark the event as handled.
 * Return `false` to yield to the next handler in the stack.
 */
export function registerBackHandler(handler: BackHandler, priority = 50): () => void {
  const id = `handler_${++nextId}`;
  const seq = ++globalSeq;
  handlers.push({ id, seq, priority, handler });
  // Keep sorted descending by priority, then descending by seq (newest first)
  handlers.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.seq - a.seq;
  });

  return () => {
    const idx = handlers.findIndex((h) => h.id === id);
    if (idx !== -1) {
      handlers.splice(idx, 1);
    }
  };
}

/**
 * Executes registered back handlers from highest to lowest priority.
 * Returns `true` if any handler consumed the event.
 */
export function executeBackHandlers(): boolean {
  for (const entry of handlers) {
    try {
      const result = entry.handler();
      if (result !== false) {
        return true;
      }
    } catch (err) {
      console.error('Error executing back button handler:', err);
    }
  }
  return false;
}

/**
 * React hook to register a back button handler for an active component/modal/state.
 * @param handler Callback to execute on back press. Return false to yield to next handler.
 * @param enabled Whether this handler is currently active.
 * @param priority Priority (higher executes first; e.g. 100 for fullscreen viewers, 80 for subviews, 50 for local state).
 */
export function useBackHandler(handler: BackHandler, enabled = true, priority = 50) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;

    const unregister = registerBackHandler(() => {
      return handlerRef.current();
    }, priority);

    return unregister;
  }, [enabled, priority]);
}
