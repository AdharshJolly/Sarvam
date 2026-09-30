import type { ReactNode } from "react";

export function Panel({ title, children, id }: { title?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section
      id={id}
      className="rounded border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      {title ? <h3 className="mb-2 text-base font-semibold">{title}</h3> : null}
      {children}
    </section>
  );
}
