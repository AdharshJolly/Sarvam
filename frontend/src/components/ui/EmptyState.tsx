import { Icon } from "./Icon";
import type { IconName } from "./Icon";

/** Always states what is missing and why. */
export function EmptyState({ title, why, icon = "Circle" }: { title: string; why?: string; icon?: IconName }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-dashed border-border-strong p-4 text-text-muted"
    >
      <Icon name={icon} size={24} className="mt-0.5 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold text-text">
          {title}
        </p>
        {why ? <p className="text-base">{why}</p> : null}
      </div>
    </div>
  );
}
