import type { ReactNode } from "react";

export function Panel({ title, children, id, aside }: { title?: ReactNode; children: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <section id={id} className="card p-4">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="label">{title}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </section>
  );
}
