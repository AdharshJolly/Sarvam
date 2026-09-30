import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Tailwind emits no CSS for a colour utility whose token does not exist, so a typo or a leftover
 * old name (border-border, bg-good ...) silently loses its styling. This guard fails the build on
 * any colour utility in the UI that is not defined in tokens.css.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url)); // decodes spaces in the folder name
const tokensCss = readFileSync(join(SRC, "styles", "tokens.css"), "utf-8");

const TOKENS = new Set(
  [...tokensCss.matchAll(/--color-([\w-]+):/g)].map((m) => m[1] as string),
);
const BUILT_IN = new Set(["white", "black", "transparent", "current", "inherit"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "mocks") out.push(...sourceFiles(path));
    } else if (/\.tsx$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

// Utility prefixes that take a colour. Sizes, widths and styles share the prefix and are skipped.
const UTILITY =
  /(?<![\w-])(?:[a-z-]+:)*(bg|text|border(?:-[tblrxyse])?|ring|outline|fill|stroke|divide|from|to|via|decoration|accent|caret)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![\w-])/g;

const NOT_A_COLOUR =
  /^(?:xs|sm|md|lg|xl|[2-9]xl|base|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|none|auto|full|px|solid|dashed|dotted|double|hidden|cover|contain|fixed|local|scroll|repeat|no-repeat|opacity|offset|inset|origin|collapse|separate|spacing|visible|invisible|both|top|bottom|[trblxyse]-?)$/;

describe("colour utilities reference real tokens", () => {
  test("tokens.css defines the palette this guard checks against", () => {
    expect(TOKENS.size).toBeGreaterThan(20);
    expect(TOKENS.has("border-hairline")).toBe(true);
    expect(TOKENS.has("border")).toBe(false); // the old name that caused silent failures
  });

  test("every colour utility used in components is a defined token", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, index) => {
          for (const m of line.matchAll(UTILITY)) {
            const prefix = m[1] as string;
            let name = (m[2] as string).replace(/-$/, "");
            // ring-offset-2 (a width) and ring-offset-surface (a colour) carry their value after "offset-".
            if (prefix === "ring" && name.startsWith("offset-")) name = name.slice("offset-".length);
            if (NOT_A_COLOUR.test(name) || /^[trblxyse]-\d/.test(name) || /^\d/.test(name)) continue;
            if (prefix === "text" && /^(?:xs|sm|base|lg|xl)/.test(name)) continue;
            if (!TOKENS.has(name) && !BUILT_IN.has(name)) {
              offenders.push(`${file.slice(SRC.length)}:${index + 1}  ${prefix}-${name}`);
            }
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});

describe("floor violations", () => {
  test("text-xs is banned in favour of 14px floor sizes (text-sm)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const content = readFileSync(file, "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (line.includes("text-xs")) {
          offenders.push(`${file.slice(SRC.length)}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
