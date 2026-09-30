import type { ReactNode } from "react";

export function Badge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex w-fit items-center rounded px-2 py-0.5 text-sm"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      {children}
    </span>
  );
}
