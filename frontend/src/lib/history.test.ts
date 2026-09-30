import { describe, expect, test } from "bun:test";
import { HISTORY_MAX, type HistoryEntry, parseHistory, withEntry } from "./history";

const entry = (id: string, question = `q ${id}`): HistoryEntry => ({
  id,
  question,
  startedAt: "2026-09-30T10:00:00+00:00",
  mode: "LIVE",
});

describe("parseHistory", () => {
  test("reads a well-formed list", () => {
    const list = [entry("R1"), entry("R2")];
    expect(parseHistory(JSON.stringify(list))).toEqual(list);
  });

  test("missing, empty or corrupted values give an empty list and never throw", () => {
    for (const raw of [null, undefined, "", "not json", "{", "null", "42", '"text"', '{"id":"R1"}']) {
      expect(parseHistory(raw)).toEqual([]);
    }
  });

  test("malformed entries are dropped and good ones kept", () => {
    const raw = JSON.stringify([entry("R1"), { id: "R2" }, null, 7, { ...entry("R3"), mode: 5 }, { ...entry(""), id: "" }]);
    expect(parseHistory(raw).map((e) => e.id)).toEqual(["R1"]);
  });

  test("an over-long stored list is capped", () => {
    const many = Array.from({ length: HISTORY_MAX + 5 }, (_, i) => entry(`R${i}`));
    expect(parseHistory(JSON.stringify(many))).toHaveLength(HISTORY_MAX);
  });
});

describe("withEntry", () => {
  test("puts the newest run first", () => {
    expect(withEntry([entry("R1")], entry("R2")).map((e) => e.id)).toEqual(["R2", "R1"]);
  });

  test("a run that is already listed moves to the front instead of repeating", () => {
    const out = withEntry([entry("R1"), entry("R2"), entry("R3")], entry("R3", "updated"));
    expect(out.map((e) => e.id)).toEqual(["R3", "R1", "R2"]);
    expect(out[0]?.question).toBe("updated");
  });

  test("the list never grows past the cap, dropping the oldest", () => {
    const full = Array.from({ length: HISTORY_MAX }, (_, i) => entry(`R${i}`));
    const out = withEntry(full, entry("NEW"));
    expect(out).toHaveLength(HISTORY_MAX);
    expect(out[0]?.id).toBe("NEW");
    expect(out.some((e) => e.id === `R${HISTORY_MAX - 1}`)).toBe(false);
  });
});
