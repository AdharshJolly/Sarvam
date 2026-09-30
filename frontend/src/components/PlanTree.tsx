import type { Dimension, EvidenceSlot, Task } from "@contracts/types";
import { counted } from "../lib/terms";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { Icon } from "./ui/Icon";

export function PlanTree({
  dimensions,
  slots,
  tasks,
}: {
  dimensions: Dimension[];
  slots: EvidenceSlot[];
  tasks: Task[];
}) {
  if (dimensions.length === 0) {
    return <EmptyState title="No plan yet" why="The plan appears when the planner finishes." />;
  }
  return (
    <ul className="flex flex-col gap-3">
      {dimensions.map((d) => (
        <li key={d.id}>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{d.name}</h4>
            {d.critical ? <Badge>critical</Badge> : null}
          </div>
          {d.description ? (
            <p className="text-base text-text-muted">
              {d.description}
            </p>
          ) : null}
          <ul className="ml-4 mt-1 flex flex-col gap-2">
            {slots
              .filter((s) => s.dimension_id === d.id)
              .map((s) => (
                <li key={s.id} id={`slot-${s.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{s.name}</strong>
                    {s.critical ? <Badge>critical</Badge> : null}
                    <Badge>{`needs ${counted("origin", s.min_independent ?? 2)}`}</Badge>
                    {s.primary_ok ? <Badge title="One primary source is enough">one official source is enough</Badge> : null}
                    {(s.attributes ?? []).map((a) => (
                      <Badge key={a}>{a}</Badge>
                    ))}
                  </div>
                  <p className="text-base text-text-muted">
                    {s.description}
                  </p>
                  <ul className="ml-4 text-base">
                    {tasks
                      .filter((t) => t.slot_id === s.id)
                      .map((t) => (
                        <li key={t.id} className="flex items-start gap-1.5 mt-0.5">
                          <Icon name="ArrowRight" size={14} className="mt-1 shrink-0 text-text-muted" aria-hidden />
                          <span>
                            {t.query_text} <Badge>{t.status ?? "pending"}</Badge>
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
