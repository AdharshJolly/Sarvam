import { type KeyboardEvent, type ReactNode, useRef } from "react";

export const TABS = [
  { id: "matrix", label: "Matrix" },
  { id: "evidence", label: "Evidence" },
  { id: "conflicts", label: "Conflicts" },
  { id: "challenge", label: "Challenge" },
  { id: "report", label: "Report" },
] as const;

export type TabId = (typeof TABS)[number]["id"];

/** Accessible tab list (roving tabindex, arrow/Home/End keys). Panels are supplied by the caller. */
export function CenterTabs({
  active,
  onChange,
  counts,
  renderPanel,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  counts: Partial<Record<TabId, string>>;
  renderPanel: (id: TabId) => ReactNode;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    const t = TABS[next];
    if (t) {
      onChange(t.id);
      refs.current[t.id]?.focus();
    }
  };
  return (
    <section aria-label="Research views">
      <div
        role="tablist"
        aria-label="Research views"
        className="tab-bar flex flex-wrap gap-1 border-b border-border-strong"
      >
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={active === t.id ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`px-4 py-2 text-base border-b-2 transition-colors focus-visible:outline-brand-secondary focus-visible:-outline-offset-2 ${
              active === t.id 
                ? "border-brand-secondary font-semibold text-text" 
                : "border-transparent font-normal text-text-muted hover:text-text hover:border-border-strong"
            }`}
          >
            {t.label}
            {counts[t.id] ? <span className="ml-1 text-sm text-text-muted">({counts[t.id]})</span> : null}
          </button>
        ))}
      </div>
      {TABS.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={active !== t.id} className="pt-4 focus-visible:outline-brand-secondary">
          {active === t.id ? renderPanel(t.id) : null}
        </div>
      ))}
    </section>
  );
}
