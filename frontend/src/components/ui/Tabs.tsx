import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { nextTabIndex } from "../../lib/tabs";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Short count shown after the label, for example "3" or "2 open". */
  count?: string;
}

interface TabsProps<T extends string> {
  /** Accessible name of the tab list and its region. */
  label: string;
  items: ReadonlyArray<TabItem<T>>;
  active: T;
  onChange: (id: T) => void;
  /** Panels are rendered lazily: only the active tab's content is mounted. */
  renderPanel: (id: T) => ReactNode;
}

/**
 * Accessible tabs (WAI-ARIA pattern): roving tabindex, Left/Right/Home/End, each tab controls its
 * panel. On narrow screens the tab list scrolls sideways instead of wrapping onto several rows.
 */
export function Tabs<T extends string>({ label, items, active, onChange, renderPanel }: TabsProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const next = nextTabIndex(e.key, index, items.length);
    if (next === null) return;
    e.preventDefault();
    const target = items[next];
    if (target) {
      onChange(target.id);
      refs.current[target.id]?.focus();
    }
  };

  return (
    <section aria-label={label}>
      <div
        role="tablist"
        aria-label={label}
        className="tab-bar flex gap-1 overflow-x-auto border-b border-border-hairline"
      >
        {items.map((item, index) => {
          const selected = active === item.id;
          return (
            <button
              key={item.id}
              ref={(el) => {
                refs.current[item.id] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${item.id}`}
              aria-selected={selected}
              aria-controls={`panel-${item.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap border-b-2 px-4 py-2 text-base transition-colors focus-visible:-outline-offset-2 ${
                selected
                  ? "border-brand-secondary font-semibold text-text"
                  : "border-transparent text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {item.label}
              {item.count ? <span className="text-sm font-normal text-text-muted">({item.count})</span> : null}
            </button>
          );
        })}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`panel-${item.id}`}
          aria-labelledby={`tab-${item.id}`}
          hidden={active !== item.id}
          className="pt-4"
        >
          {active === item.id ? renderPanel(item.id) : null}
        </div>
      ))}
    </section>
  );
}
