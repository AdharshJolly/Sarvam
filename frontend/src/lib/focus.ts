export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((el) => {
    // Basic visibility check, DOM-dependent
    return (el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0) && el.getAttribute("aria-hidden") !== "true";
  });
}

/** Pure helper to calculate the next element to focus in a trap. */
export function nextFocusedElement(
  active: Element | null,
  focusable: HTMLElement[],
  isShift: boolean
): HTMLElement | null {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return null;

  if (isShift && active === first) return last;
  if (!isShift && active === last) return first;
  return null; // indicates native tab flow should continue
}

let savedOpener: HTMLElement | null = null;

export function saveFocus() {
  if (typeof document !== "undefined" && document.activeElement) {
    savedOpener = document.activeElement as HTMLElement;
  }
}

export function restoreFocus() {
  if (savedOpener && typeof document !== "undefined" && document.body.contains(savedOpener)) {
    savedOpener.focus();
  }
  savedOpener = null;
}
