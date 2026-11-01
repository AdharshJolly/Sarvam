import { describe, expect, test } from "bun:test";
import { DEMO_QUESTION, initialMode, isReplayMiss } from "./runModes";

describe("initialMode", () => {
  test("follows the server default", () => {
    expect(initialMode({ liveAvailable: true, defaultMode: "LIVE" }, false)).toBe("LIVE");
    expect(initialMode({ liveAvailable: true, defaultMode: "REPLAY" }, false)).toBe("REPLAY");
  });

  test("never starts on LIVE when the server cannot run it", () => {
    expect(initialMode({ liveAvailable: false, defaultMode: "LIVE" }, false)).toBe("REPLAY");
    expect(initialMode({ liveAvailable: false, defaultMode: "LIVE" }, true)).toBe("REPLAY");
  });

  test("a Dig deeper draft starts on LIVE when it can (a new question cannot be replayed)", () => {
    expect(initialMode({ liveAvailable: true, defaultMode: "REPLAY" }, true)).toBe("LIVE");
  });

  test("an unknown server (health not loaded or failed) starts on REPLAY, which costs nothing", () => {
    expect(initialMode(null, false)).toBe("REPLAY");
  });
});

describe("isReplayMiss", () => {
  const empty = { geography: "", time_horizon: "", constraints: "" };

  test("the recorded question with an empty scope replays", () => {
    expect(isReplayMiss("REPLAY", DEMO_QUESTION, empty)).toBe(false);
    expect(isReplayMiss("REPLAY", `  ${DEMO_QUESTION} `, empty)).toBe(false);
  });

  test("another question or any scope is a miss", () => {
    expect(isReplayMiss("REPLAY", "Something else?", empty)).toBe(true);
    expect(isReplayMiss("REPLAY", DEMO_QUESTION, { ...empty, geography: "Pune" })).toBe(true);
  });

  test("an empty question is not flagged yet, and LIVE never misses", () => {
    expect(isReplayMiss("REPLAY", "   ", empty)).toBe(false);
    expect(isReplayMiss("LIVE", "Something else?", empty)).toBe(false);
  });
});
