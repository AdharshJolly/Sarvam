/**
 * Keyboard model for a horizontal tab list (WAI-ARIA tabs pattern): Left/Right move and wrap,
 * Home/End jump to the ends. Returns the index to move to, or null when the key is not handled.
 */
export function nextTabIndex(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
      return (index + 1) % count;
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
