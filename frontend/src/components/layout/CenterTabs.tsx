export const TABS = [
  { id: "matrix", label: "Matrix" },
  { id: "evidence", label: "Evidence" },
  { id: "conflicts", label: "Conflicts" },
  { id: "challenge", label: "Challenge" },
  { id: "report", label: "Report" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

export function CenterTabs({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <section aria-label="Research views">
      <div role="tablist" aria-label="Research views" className="flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className="px-4 py-2 text-base"
            style={{
              borderBottom: active === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              fontWeight: active === t.id ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}
          className="pt-4"
        >
          <p style={{ color: "var(--text-muted)" }}>
            {t.label} panel: not implemented yet. No research run is active.
          </p>
        </div>
      ))}
    </section>
  );
}
