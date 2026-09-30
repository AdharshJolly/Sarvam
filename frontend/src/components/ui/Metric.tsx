import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type * as LucideIcons from "lucide-react";

export interface MetricProps {
  label: string;
  value: ReactNode;
  icon?: keyof typeof LucideIcons;
  onClick?: () => void;
  title?: string;
  trend?: "up" | "down" | "neutral";
}

export function Metric({ label, value, icon, onClick, title, trend }: MetricProps) {
  const content = (
    <div className={`flex flex-col gap-0.5 ${onClick ? "group cursor-pointer hover:opacity-80 transition-opacity" : ""}`} title={title}>
      <div className="flex items-center gap-1.5 text-text-muted">
        {icon && <Icon name={icon} size={14} />}
        <span className="label text-xs tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="mono text-base font-semibold">{value}</span>
        {trend === "up" && <Icon name="TrendingUp" size={12} className="text-bad-fg" aria-hidden />}
        {trend === "down" && <Icon name="TrendingDown" size={12} className="text-ok-fg" aria-hidden />}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left bg-transparent p-0 m-0 border-0 focus-visible:outline-brand-secondary rounded">
        {content}
      </button>
    );
  }
  return content;
}
