/**
 * Manages document body scroll locking with reference counting
 * to support multiple or nested modal overlays seamlessly.
 */

let activeLocks = 0;

export function lockBodyScroll(): void {
  activeLocks++;
  if (activeLocks === 1 && typeof document !== 'undefined') {
    document.documentElement?.classList.add('modal-open');
    document.body?.classList.add('modal-open');
  }
}

export function unlockBodyScroll(): void {
  if (activeLocks > 0) {
    activeLocks--;
  }

  if (activeLocks === 0 && typeof document !== 'undefined') {
    document.documentElement?.classList.remove('modal-open');
    document.body?.classList.remove('modal-open');
  }
}
