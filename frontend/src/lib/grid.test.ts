import { describe, expect, test } from "bun:test";
import { firstCell, gridMove } from "./grid";

// Rows of 2, 2, 0 (a dimension with no slots) and 3 cells.
const ROWS = [2, 2, 0, 3];

describe("gridMove: within a row", () => {
  test("ArrowRight and ArrowLeft move one cell and stop at the edges", () => {
    expect(gridMove(ROWS, { row: 0, col: 0 }, "ArrowRight")).toEqual({ row: 0, col: 1 });
    expect(gridMove(ROWS, { row: 0, col: 1 }, "ArrowRight")).toBeNull();
    expect(gridMove(ROWS, { row: 0, col: 1 }, "ArrowLeft")).toEqual({ row: 0, col: 0 });
    expect(gridMove(ROWS, { row: 0, col: 0 }, "ArrowLeft")).toBeNull();
  });

  test("Home and End jump to the ends of the current row", () => {
    expect(gridMove(ROWS, { row: 3, col: 1 }, "Home")).toEqual({ row: 3, col: 0 });
    expect(gridMove(ROWS, { row: 3, col: 0 }, "End")).toEqual({ row: 3, col: 2 });
  });
});

describe("gridMove: between rows", () => {
  test("ArrowDown and ArrowUp keep the column", () => {
    expect(gridMove(ROWS, { row: 0, col: 1 }, "ArrowDown")).toEqual({ row: 1, col: 1 });
    expect(gridMove(ROWS, { row: 1, col: 1 }, "ArrowUp")).toEqual({ row: 0, col: 1 });
  });

  test("a row with no cells is skipped in both directions", () => {
    expect(gridMove(ROWS, { row: 1, col: 0 }, "ArrowDown")).toEqual({ row: 3, col: 0 });
    expect(gridMove(ROWS, { row: 3, col: 2 }, "ArrowUp")).toEqual({ row: 1, col: 1 }); // clamped to the shorter row
  });

  test("the column is clamped when the next row is shorter", () => {
    expect(gridMove(ROWS, { row: 3, col: 2 }, "ArrowUp")).toEqual({ row: 1, col: 1 });
  });

  test("moving past the first or last row stays put", () => {
    expect(gridMove(ROWS, { row: 0, col: 0 }, "ArrowUp")).toBeNull();
    expect(gridMove(ROWS, { row: 3, col: 0 }, "ArrowDown")).toBeNull();
  });
});

describe("gridMove: corners and other keys", () => {
  test("Ctrl+Home and Ctrl+End go to the first and last cell of the grid", () => {
    expect(gridMove(ROWS, { row: 1, col: 1 }, "Home", true)).toEqual({ row: 0, col: 0 });
    expect(gridMove(ROWS, { row: 0, col: 0 }, "End", true)).toEqual({ row: 3, col: 2 });
  });

  test("Ctrl+Home skips leading empty rows", () => {
    expect(gridMove([0, 2, 2], { row: 2, col: 1 }, "Home", true)).toEqual({ row: 1, col: 0 });
  });

  test("keys that are not grid keys are not handled", () => {
    for (const key of ["Tab", "Enter", " ", "a", "PageDown", "Escape"]) {
      expect(gridMove(ROWS, { row: 0, col: 0 }, key)).toBeNull();
    }
  });

  test("an empty grid handles nothing", () => {
    expect(gridMove([], { row: 0, col: 0 }, "ArrowRight")).toBeNull();
    expect(gridMove([0, 0], { row: 0, col: 0 }, "ArrowDown")).toBeNull();
    expect(firstCell([0, 0])).toBeNull();
  });
});

describe("firstCell", () => {
  test("is the first cell of the first non-empty row", () => {
    expect(firstCell(ROWS)).toEqual({ row: 0, col: 0 });
    expect(firstCell([0, 0, 4])).toEqual({ row: 2, col: 0 });
  });
});
