import { countNumber } from "../../lib/layout";
import { Icon, type IconName } from "../ui/Icon";
import { TABS, type TabId } from "./CenterTabs";

const TAB_ICON: Record<TabId, IconName> = {
  matrix: "Grid",
  evidence: "Search",
  conflicts: "Zap",
  challenge: "Swords",
  report: "FileText",
};

/**
 * Phone navigation (below md): the five research views as a bottom bar, the thumb-reach pattern for
 * five or fewer destinations. It controls the same tab state as the top tab list, which is hidden at
 * this width. Touch targets are at least 56px tall and the bar respects the device safe area.
 */
export function BottomTabBar({
  active,
  onChange,
  counts,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  counts: Partial<Record<TabId, string>>;
}) {
  return (
    <nav
      aria-label="Research views"
      className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-border-strong bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {TABS.map((tab) => {
          const selected = active === tab.id;
          const count = countNumber(counts[tab.id]);
          const alert = tab.id === "conflicts" && (count ?? 0) > 0;
          return (
            <li key={tab.id}>
              <button
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => onChange(tab.id)}
                className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-sm ${
                  selected ? "font-semibold text-brand-secondary" : "text-text-muted"
                }`}
              >
                <span className="relative">
                  <Icon name={TAB_ICON[tab.id]} size={20} aria-hidden />
                  {count ? (
                    <span
                      className={`absolute -right-4 -top-2 rounded-full border px-1.5 text-sm leading-5 ${
                        alert
                          ? "border-bad-border bg-bad-bg text-bad-fg"
                          : "border-border-strong bg-surface-2 text-text"
                      }`}
                    >
                      {count}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
