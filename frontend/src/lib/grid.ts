/**
 * Keyboard model for a grid of rows with different numbers of cells (the coverage matrix: one row
 * per dimension, one cell per slot). Arrow keys move one cell, Home/End jump within a row, and
 * Ctrl+Home/End jump to the first or last cell. Rows with no cells are skipped; moving past an edge
 * stays put (a grid does not wrap).
 */

export interface GridPos {
  row: number;
  col: number;
}

/** The position after a key press, or null when the key is not a grid key or nothing can move. */
export function gridMove(rowLengths: readonly number[], pos: GridPos, key: string, ctrl = false): GridPos | null {
  const lastRow = rowLengths.length - 1;
  const len = (r: number) => rowLengths[r] ?? 0;
  const firstFilled = rowLengths.findIndex((n) => n > 0);
  if (firstFilled === -1) return null;
  const lastFilled = rowLengths.map((n) => n > 0).lastIndexOf(true);

  const vertical = (step: 1 | -1): GridPos | null => {
    for (let r = pos.row + step; r >= 0 && r <= lastRow; r += step) {
      if (len(r) > 0) return { row: r, col: Math.min(pos.col, len(r) - 1) }; // same column, clamped
    }
    return null;
  };

  switch (key) {
    case "ArrowRight":
      return pos.col < len(pos.row) - 1 ? { row: pos.row, col: pos.col + 1 } : null;
    case "ArrowLeft":
      return pos.col > 0 ? { row: pos.row, col: pos.col - 1 } : null;
    case "ArrowDown":
      return vertical(1);
    case "ArrowUp":
      return vertical(-1);
    case "Home":
      return ctrl ? { row: firstFilled, col: 0 } : { row: pos.row, col: 0 };
    case "End":
      return ctrl ? { row: lastFilled, col: len(lastFilled) - 1 } : { row: pos.row, col: Math.max(0, len(pos.row) - 1) };
    default:
      return null;
  }
}

/** The position of the first cell, or null for an empty grid. */
export function firstCell(rowLengths: readonly number[]): GridPos | null {
  const row = rowLengths.findIndex((n) => n > 0);
  return row === -1 ? null : { row, col: 0 };
}
