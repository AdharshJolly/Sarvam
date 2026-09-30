import type { Source } from "@contracts/types";
import { ageBucket, domainOf, safeHref } from "../lib/format";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { StateChip } from "./ui/StateChip";
import { sourceStatusChip } from "./ui/chips";

export function SourcesTable({
  sources,
  passageCounts,
  slotBySource,
  now,
}: {
  sources: Source[];
  passageCounts: Record<string, number>;
  slotBySource?: Record<string, string>;
  now: Date;
}) {
  if (sources.length === 0) {
    return <EmptyState title="No sources yet" why="Sources appear as discovery finds them." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-base">
        <thead>
          <tr style={{ color: "var(--text-muted)" }}>
            <th className="p-1">ID</th>
            <th className="p-1">Domain</th>
            <th className="p-1">Type</th>
            <th className="p-1">Tier</th>
            <th className="p-1">Status</th>
            <th className="p-1">Freshness</th>
            <th className="p-1">Origin</th>
            <th className="p-1">Passages</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id} id={`source-${s.id}`} className="border-t" style={{ borderColor: "var(--border)" }}>
              <td className="p-1">{s.id}</td>
              <td className="p-1">
                <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer" className="underline">
                  {s.domain || domainOf(s.url)}
                </a>
                {slotBySource?.[s.id] ? <span className="text-sm"> ({slotBySource[s.id]})</span> : null}
              </td>
              <td className="p-1">
                <Badge>{s.source_type ?? "unknown"}</Badge>
              </td>
              <td className="p-1">
                <Badge>{`Tier ${s.authority_tier ?? 3}`}</Badge>
              </td>
              <td className="p-1">
                <StateChip spec={sourceStatusChip(s.status ?? "found")} />
                {s.fail_reason ? <div className="text-sm">{s.fail_reason}</div> : null}
              </td>
              <td className="p-1">
                <Badge>{ageBucket(s.published_at, now)}</Badge>
              </td>
              <td className="p-1">{s.origin_id ?? "—"}</td>
              <td className="p-1">{passageCounts[s.id] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
