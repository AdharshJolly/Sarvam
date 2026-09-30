import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type * as LucideIcons from "lucide-react";

export type BannerTone = "ok" | "warn" | "bad" | "info";

export function Banner({ tone, icon, children }: { tone: BannerTone; icon?: string; children: ReactNode }) {
  let colorClasses = "";
  let defaultIcon = "";
  switch (tone) {
    case "ok":
      colorClasses = "text-ok-fg bg-ok-bg border-ok-border";
      defaultIcon = "CheckCircle";
      break;
    case "warn":
      colorClasses = "text-warn-fg bg-warn-bg border-warn-border";
      defaultIcon = "AlertTriangle";
      break;
    case "bad":
      colorClasses = "text-bad-fg bg-bad-bg border-bad-border";
      defaultIcon = "XOctagon";
      break;
    case "info":
      colorClasses = "text-info-fg bg-info-bg border-info-border";
      defaultIcon = "Info";
      break;
  }

  const iconName = (icon || defaultIcon) as keyof typeof LucideIcons;

  return (
    <div role="alert" className={`flex items-start gap-2 rounded-md border p-3 font-medium ${colorClasses}`}>
      <Icon name={iconName} size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
