import type { ReactNode } from "react";

export function Badge({ children, title, mono = false }: { children: ReactNode; title?: string; mono?: boolean }) {
  return (
    <span
      title={title}
      className={`inline-flex w-fit items-center rounded-md border border-border-strong bg-surface-2 px-2 py-0.5 text-sm ${mono ? "mono font-mono" : ""}`}
    >
      {children}
    </span>
  );
}
