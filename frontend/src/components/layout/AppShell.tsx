import { useState } from "react";
import { CenterTabs, type TabId } from "./CenterTabs";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { LeftRail } from "./LeftRail";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Application shell (SSOT section 12): left rail, tabbed center, right evidence drawer.
 * Panels are placeholders; later task cards (T16-T21) fill them without changing this layout.
 */
export function AppShell() {
  const [tab, setTab] = useState<TabId>("matrix");
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header
        className="flex items-center justify-between gap-4 border-b px-4 py-3"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sarvam</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Evidence-First Autonomous Research Agent
          </p>
        </div>
        <ThemeToggle />
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[18rem_1fr]">
        <LeftRail />
        <main className="min-w-0 p-4">
          <CenterTabs active={tab} onChange={setTab} />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded border px-3 py-1 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--surface)" }}
              aria-expanded={drawerOpen}
              aria-controls="evidence-drawer"
              onClick={() => setDrawerOpen((v) => !v)}
            >
              {drawerOpen ? "Close evidence drawer" : "Open evidence drawer"}
            </button>
          </div>
        </main>
      </div>

      <EvidenceDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
