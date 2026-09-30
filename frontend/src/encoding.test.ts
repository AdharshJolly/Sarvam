import { expect, test } from "bun:test";
import { Glob } from "bun";
import { join } from "node:path";

// Classic mojibake byte sequences (UTF-8 read as Latin-1/CP1252): "â€", "Ã", "Â".
const BAD = ["â€", "Ã", "Â"];

test("no src file contains mojibake, a BOM or CRLF", async () => {
  const root = join(import.meta.dir);
  const offenders: string[] = [];
  for await (const f of new Glob("**/*.{ts,tsx}").scan({ cwd: root })) {
    const text = await Bun.file(join(root, f)).text();
    if (f === "encoding.test.ts") continue;
    if (BAD.some((b) => text.includes(b))) offenders.push(`${f}: mojibake`);
    if (text.charCodeAt(0) === 0xfeff) offenders.push(`${f}: BOM`);
    if (text.includes("\r\n")) offenders.push(`${f}: CRLF`);
  }
  expect(offenders).toEqual([]);
});
