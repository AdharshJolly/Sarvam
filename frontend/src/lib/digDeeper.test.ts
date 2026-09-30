import { afterEach, expect, test } from "bun:test";
import { clearDraft, digDeeperQuestion, peekDraft, saveDraft } from "./digDeeper";

const store = new Map<string, string>();
const fake = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as { sessionStorage?: unknown }).sessionStorage = fake;

afterEach(() => store.clear());

test("the question names the key point, the gap and the original question", () => {
  const q = digDeeperQuestion("Should we enter Bengaluru scooters?", "Competitor pricing", "only one independent source, so it is partly supported");
  expect(q).toContain("Competitor pricing");
  expect(q).toContain("only one independent source");
  expect(q).toContain("Should we enter Bengaluru scooters?");
});

test("the question never exceeds the API limit of 2000 characters", () => {
  const q = digDeeperQuestion("x".repeat(5000), "Pricing", "no usable evidence was found, so there is not enough evidence");
  expect(q.length).toBeLessThanOrEqual(2000);
  expect(q).toContain("Pricing");
});

test("a saved draft is readable until it is cleared", () => {
  saveDraft({ question: "Q", scope: { geography: "Bengaluru" }, fromRunId: "R1" });
  expect(peekDraft()?.question).toBe("Q");
  expect(peekDraft()?.scope.geography).toBe("Bengaluru");
  clearDraft();
  expect(peekDraft()).toBeNull();
});

test("a corrupt or missing draft reads as null, never throws", () => {
  expect(peekDraft()).toBeNull();
  store.set("sarvam.digDeeperDraft", "{not json");
  expect(peekDraft()).toBeNull();
  store.set("sarvam.digDeeperDraft", JSON.stringify({ question: 5 }));
  expect(peekDraft()).toBeNull();
});
