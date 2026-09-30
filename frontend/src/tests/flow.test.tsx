import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Landing } from "../components/Landing";
import { WorkspacePage } from "../components/workspace/WorkspacePage";
import { AdminPage } from "../components/admin/AdminPage";
import { AuthContext, type AuthContextValue } from "../state/useAuth";
import type { UserPublic } from "@contracts/types";
import { SessionProvider } from "../state/useRunSession";

function renderWithAuth(node: React.ReactNode, user: UserPublic | null = null): string {
  const g = globalThis as { window?: unknown };
  const before = g.window;
  g.window = { location: { hash: "" }, addEventListener() {}, removeEventListener() {} };
  const mockAuth: AuthContextValue = {
    user,
    token: user ? "mock-token" : null,
    loading: false,
    error: null,
    login: async () => {},
    register: async () => {},
    updateProfile: async () => {},
    deleteAccount: async () => {},
    logout: async () => {},
    clearError: () => {},
  };


  try {
    return renderToStaticMarkup(
      <AuthContext.Provider value={mockAuth}>
        <SessionProvider>{node}</SessionProvider>
      </AuthContext.Provider>
    );
  } finally {
    g.window = before;
  }
}

describe("user flow & access control", () => {
  test("landing page does not expose query input or start form directly", () => {
    const html = renderWithAuth(<Landing />);
    // No query input on landing
    expect(html).not.toContain('id="question"');
    // Call to action to start inquiry or create account
    expect(html).toContain("Start a research inquiry");
    expect(html).toContain("Create account");
    // No explicit 'Admin Panel' or 'Admin Portal'
    expect(html).not.toContain("Admin Panel");
    expect(html).not.toContain("Admin Portal");
  });

  test("workspace page requires authentication when logged out", () => {
    const html = renderWithAuth(<WorkspacePage />, null);
    // Shows authentication gate
    expect(html).toContain("Authentication Required");
    expect(html).toContain("Sign In to Workspace");
    // Query form is not rendered for unauthenticated visitors
    expect(html).not.toContain('id="question"');
  });

  test("workspace page renders Start a research run form when authenticated", () => {
    const mockUser: UserPublic = {
      id: "u1",
      email: "researcher@lab.org",
      display_name: "Dr. Eleanor Vance",
      created_at: new Date().toISOString(),
    };
    const html = renderWithAuth(<WorkspacePage />, mockUser);
    expect(html).toContain("Start a research run");
    expect(html).toContain('id="question"');
    expect(html).toContain("Dr. Eleanor Vance");
    expect(html).toContain("Investigation History");
  });

  test("landing page does not contain removed guarantee and audit tags", () => {
    const html = renderWithAuth(<Landing />);
    expect(html).not.toContain("Zero-Training Guarantee");
    expect(html).not.toContain("Verbatim Hash Audits");
    expect(html).toContain("Methodology");
    expect(html).toContain("Architecture");
    expect(html).not.toContain("Benchmarks");
    expect(html).not.toContain("Pricing");
  });

  test("investigation history page requires credentials when logged out", () => {
    const html = renderWithAuth(<AdminPage />, null);
    // Credentials prompt
    expect(html).toContain("Investigation History");
    expect(html).toContain("Sign In to Access History");
    expect(html).toContain('id="history-login-email"');
    expect(html).toContain('id="history-login-password"');
    // Does not say Admin Panel or Admin Portal
    expect(html).not.toContain("Admin Panel");
    expect(html).not.toContain("Admin Portal");
  });
});
