import { describe, expect, test, afterEach } from "bun:test";
import { nextFocusedElement, saveFocus, restoreFocus } from "./focus";

describe("focus helpers", () => {
  test("nextFocusedElement wraps around forward and backward", () => {
    // We pass mock elements
    const first = {} as HTMLElement;
    const second = {} as HTMLElement;
    const last = {} as HTMLElement;
    const focusable = [first, second, last];

    // forward tab on last element -> wraps to first
    expect(nextFocusedElement(last, focusable, false)).toBe(first);
    
    // backward tab on first element -> wraps to last
    expect(nextFocusedElement(first, focusable, true)).toBe(last);
    
    // forward tab on first element -> let native handle it (returns null)
    expect(nextFocusedElement(first, focusable, false)).toBeNull();
    
    // empty list -> null
    expect(nextFocusedElement(first, [], false)).toBeNull();
  });

  // Note: DOM-dependent functions like getFocusableElements, saveFocus, and restoreFocus
  // cannot be fully tested here without a DOM environment (like jsdom).
});
