/**
 * A one-slot registry connecting a "Take the tour" button to the <Tour> that
 * happens to be mounted on the same page.
 *
 * The alternative was prop-drilling a launcher from wherever <Tour> lives down
 * to wherever the button lives, which on the draft sheet is a different branch
 * of the tree entirely. A module-level slot is the smaller thing: the tour
 * registers on mount, the button reads whether one exists, and neither has to
 * know the other's position.
 *
 * `getServerSnapshot` returns false so a button renders nothing on the server
 * and appears once the tour has registered, which keeps the markup identical
 * across hydration.
 */

let launch: (() => void) | null = null;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const fn of subscribers) fn();
}

export function registerTour(fn: () => void): () => void {
  launch = fn;
  emit();
  return () => {
    // Guarded: a remount can register the replacement before the old effect
    // cleans up, and an unguarded clear would drop the live one.
    if (launch === fn) {
      launch = null;
      emit();
    }
  };
}

export function startTour(): void {
  launch?.();
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getSnapshot(): boolean {
  return launch !== null;
}

export function getServerSnapshot(): boolean {
  return false;
}
