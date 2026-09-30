import { describe, expect, test } from "bun:test";
import { countChange } from "./MatrixPanel";
import { coverageChip } from "../ui/chips";

describe("MatrixPanel helpers", () => {
  test("legend lists every state with word, icon and tone", () => {
    // Tests that the legend lists every state (GREEN/AMBER/RED) as icon + word + colour
    const states = ["GREEN", "AMBER", "RED"] as const;
    const chips = states.map(coverageChip);
    
    expect(chips.map(c => c.label)).toEqual(["Well supported", "Partly supported", "Not enough evidence"]);
    expect(chips.map(c => c.icon)).toEqual(["CheckCircle", "AlertTriangle", "XOctagon"]);
    expect(chips.map(c => c.tone)).toEqual(["ok", "warn", "bad"]);
  });

  test("compare summary counts correct items", () => {
    const changes = {
      slot1: "improved",
      slot2: "worse",
      slot3: "same",
      slot4: "new",
      slot5: "improved",
    };
    
    expect(countChange(changes, "improved")).toBe(2);
    expect(countChange(changes, "worse")).toBe(1);
    expect(countChange(changes, "same")).toBe(1);
    expect(countChange(changes, "new")).toBe(1);
    expect(countChange(changes, "missing")).toBe(0);
  });
  
  test("scrubber logic selects the right round", () => {
    const rounds = [1, 2, 5];
    // Simulator of what the onChange handler does: e.target.value is the index string
    const pick = (value: string) => rounds[parseInt(value, 10)];
    
    expect(pick("0")).toBe(1);
    expect(pick("1")).toBe(2);
    expect(pick("2")).toBe(5);
  });
});
