import type { ReactNode } from "react";
import { Card } from "./Card";

export function Panel({ title, children, id, aside }: { title?: ReactNode; children: ReactNode; id?: string; aside?: ReactNode }) {
  return (
    <Card as="section" pad="md" id={id}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="label">{title}</h3>
          {aside}
        </div>
      ) : null}
      {children}
    </Card>
  );
}
