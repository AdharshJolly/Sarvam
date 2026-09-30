import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

/**
 * A small label. When `title` is given it becomes an explanation shown on hover, keyboard focus or
 * tap (a native title attribute is unreachable by keyboard and touch).
 */
export function Badge({ children, title, mono = false }: { children: ReactNode; title?: string; mono?: boolean }) {
  const badge = (
    <span
      className={`inline-flex w-fit items-center rounded-md border border-border-strong bg-surface-2 px-2 py-0.5 text-sm ${mono ? "mono font-mono" : ""}`}
    >
      {children}
    </span>
  );
  return title ? (
    <Tooltip text={title} focusable>
      {badge}
    </Tooltip>
  ) : (
    badge
  );
}
