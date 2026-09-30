import { type ChipSpec } from "./chips";
import { Icon } from "./Icon";
import type * as LucideIcons from "lucide-react";

/** State = colour + icon + text, never colour alone. Chips are at least 14 px. */
export function StateChip({ spec, large = false }: { spec: ChipSpec; large?: boolean }) {
  const isLucide = typeof spec.icon === 'string' && spec.icon.length > 2; // naive check

  // Generate tailwind classes based on tone
  let colorClasses = "";
  switch (spec.tone) {
    case "ok":
      colorClasses = "text-ok-fg bg-ok-bg border-ok-border";
      break;
    case "warn":
      colorClasses = "text-warn-fg bg-warn-bg border-warn-border";
      break;
    case "bad":
      colorClasses = "text-bad-fg bg-bad-bg border-bad-border";
      break;
    case "info":
      colorClasses = "text-info-fg bg-info-bg border-info-border";
      break;
    case "brand":
      colorClasses = "text-brand bg-surface border-brand";
      break;
    case "muted":
    default:
      colorClasses = "text-text-muted bg-surface-2 border-border-strong";
      break;
  }

  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-md border font-semibold ${
        large ? "px-3 py-1 text-base" : "px-2 py-0.5 text-sm"
      } ${colorClasses}`}
    >
      {isLucide ? (
        <Icon name={spec.icon as keyof typeof LucideIcons} size={large ? 18 : 14} aria-hidden />
      ) : (
        <span aria-hidden="true" className="font-mono font-bold leading-none">{spec.icon}</span>
      )}
      <span className="leading-none">{spec.label}</span>
    </span>
  );
}
