/**
 * Notifies listeners about local writes, so the sync engine can schedule a debounced sync (9.3)
 * without the repositories depending on it.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyLocalChange(): void {
  listeners.forEach((listener) => listener());
}
