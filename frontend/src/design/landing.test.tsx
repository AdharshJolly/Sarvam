import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "../components/Landing";
import { RunForm } from "../components/RunForm";
import { SessionProvider } from "../state/useRunSession";

// The session reads the URL hash while rendering; there is no DOM under bun, so give it a minimal one.
function page(node: React.ReactNode): string {
  const g = globalThis as { window?: unknown };
  const before = g.window;
  g.window = { location: { hash: "" }, addEventListener() {}, removeEventListener() {} };
  try {
    return renderToStaticMarkup(<SessionProvider>{node}</SessionProvider>);
  } finally {
    g.window = before;
  }
}

describe("landing", () => {
  const html = page(<Landing />);

  test("has one h1 and the four demo moments", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    for (const m of ["Coverage matrix", "Independence collapse", "Claim to passage", "Stop decision"]) {
      expect(html).toContain(m);
    }
  });

  test("shows a backend status region", () => {
    expect(html).toContain('role="status"');
  });
});

describe("run form", () => {
  const html = page(<RunForm />);

  test("every field has a visible label", () => {
    for (const id of ["question", "geography", "horizon", "constraints"]) {
      expect(html).toContain(`for="${id}"`);
    }
  });

  test("explains both modes, including that replay only knows recorded questions", () => {
    expect(html).toContain("Only questions recorded earlier");
    expect(html).toContain("several minutes");
  });

  test("shows no validation error before the first submit", () => {
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("aria-invalid");
  });
});
