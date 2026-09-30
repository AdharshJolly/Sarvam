import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { STORAGE_KEY, THEME_COLOR, THEMES, parseTheme, resolveTheme } from "./theme";

describe("parseTheme", () => {
  test("keeps explicit light and dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  test("anything else means system, so a corrupted value cannot break the UI", () => {
    for (const raw of [null, undefined, "", "system", "purple", "DARK", "{}", "1"]) {
      expect(parseTheme(raw)).toBe("system");
    }
  });
});

describe("resolveTheme", () => {
  test("system follows the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  test("an explicit choice ignores the OS preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  test("the toggle cycle covers every theme exactly once", () => {
    expect(new Set(THEMES).size).toBe(3);
    expect(THEMES[0]).toBe("system"); // the default is first
  });
});

describe("index.html pre-paint script stays in sync with theme.ts", () => {
  const html = readFileSync(new URL("../../index.html", import.meta.url), "utf-8");

  test("uses the same storage key", () => {
    expect(html).toContain(`localStorage.getItem('${STORAGE_KEY}')`);
  });

  test("uses the same theme-color values", () => {
    expect(html).toContain(THEME_COLOR.dark);
    expect(html).toContain(THEME_COLOR.light);
  });

  test("theme-color values equal the page background tokens", () => {
    const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf-8");
    const light = /:root\s*{[^}]*--color-bg:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    const dark = /:root\[data-theme="dark"\]\s*{[^}]*--color-bg:\s*(#[0-9a-fA-F]{6})/.exec(css)?.[1];
    expect(light?.toLowerCase()).toBe(THEME_COLOR.light.toLowerCase());
    expect(dark?.toLowerCase()).toBe(THEME_COLOR.dark.toLowerCase());
  });
});
