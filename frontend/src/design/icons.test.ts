import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Icon.tsx keeps an explicit registry, and an icon name outside it renders nothing (or crashes
 * the component that uses it). TypeScript catches this only while every name is typed as IconName,
 * so this guard also fails the build on a cast that bypasses the type and on any literal name that
 * is not registered.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "mocks") out.push(...files(path));
    } else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) {
      out.push(path);
    }
  }
  return out;
}

const iconSource = readFileSync(join(SRC, "components", "ui", "Icon.tsx"), "utf-8");
const registryBlock = iconSource.split("const ICONS = {")[1]?.split("} satisfies")[0] ?? "";
const REGISTERED = new Set([...registryBlock.matchAll(/^\s+([A-Z][A-Za-z0-9]+),$/gm)].map((m) => m[1] as string));

describe("icon registry", () => {
  test("the registry was parsed", () => {
    expect(REGISTERED.size).toBeGreaterThan(20);
    expect(REGISTERED.has("CheckCircle")).toBe(true);
    expect(REGISTERED.has("CheckCircle2")).toBe(false); // the unregistered name that crashed the rail
  });

  test("every literal icon name in the UI is registered", () => {
    const missing: string[] = [];
    for (const file of files(SRC)) {
      if (file.endsWith("Icon.tsx")) continue;
      readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, index) => {
          for (const m of line.matchAll(/(?:\bname|\bicon)(?:=\{?|:\s*)["']([A-Z][A-Za-z0-9]+)["']/g)) {
            if (!REGISTERED.has(m[1] as string)) missing.push(`${file.slice(SRC.length)}:${index + 1}  ${m[1]}`);
          }
        });
    }
    expect(missing).toEqual([]);
  });

  test("no cast bypasses the IconName type", () => {
    const casts: string[] = [];
    for (const file of files(SRC)) {
      readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, index) => {
          if (/<Icon\b[^>]*\bas (any|string)\b/.test(line) || /\bicon\b[^;]*\bas any\b/.test(line)) {
            casts.push(`${file.slice(SRC.length)}:${index + 1}`);
          }
        });
    }
    expect(casts).toEqual([]);
  });
});
