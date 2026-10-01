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
    <div className="flex flex-col gap-8">
      {dimensions.map((d) => (
        <section key={d.id} className="flex flex-col gap-4">
          <header>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h4 className="text-lg font-bold">{d.name}</h4>
              {d.critical ? <Badge>critical</Badge> : null}
            </div>
            {d.description ? (
              <p className="text-[15px] leading-relaxed text-text-muted">
                {d.description}
              </p>
            ) : null}
          </header>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {slots
              .filter((s) => s.dimension_id === d.id)
              .map((s) => (
                <div key={s.id} id={`slot-${s.id}`} className="flex flex-col rounded-[1.3rem] border border-border-hairline bg-surface p-4 transition-colors hover:border-border-strong">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <strong className="text-brand">{s.name}</strong>
                    {s.critical ? <Badge>critical</Badge> : null}
                    <Badge>{`needs ${counted("origin", s.min_independent ?? 2)}`}</Badge>
                    {s.primary_ok ? <Badge title="One primary source is enough">one official source is enough</Badge> : null}
                    {(s.attributes ?? []).map((a) => (
                      <Badge key={a}>{a}</Badge>
                    ))}
                  </div>
                  <p className="text-sm text-text-muted mb-4 leading-relaxed">
                    {s.description}
                  </p>
                  
                  {tasks.filter((t) => t.slot_id === s.id).length > 0 && (
                    <div className="mt-auto pt-3 border-t border-border-hairline">
                      <h5 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2.5">Queries</h5>
                      <ul className="flex flex-col gap-2">
                        {tasks
                          .filter((t) => t.slot_id === s.id)
                          .map((t) => (
                            <li key={t.id} className="flex items-start gap-2">
                              <Icon name="Search" size={14} className="mt-1 shrink-0 text-brand" aria-hidden />
                              <span className="flex-1 text-[13px] leading-tight">
                                {t.query_text}
                              </span>
                              <Badge>{t.status ?? "pending"}</Badge>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
