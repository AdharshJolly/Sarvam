import type { Source } from "@contracts/types";
import { useMemo, useState } from "react";
import { ageBucket, domainOf, safeHref } from "../lib/format";
import { Badge } from "./ui/Badge";
import { EmptyState } from "./ui/EmptyState";
import { Icon } from "./ui/Icon";
import { StateChip } from "./ui/StateChip";
import { sourceStatusChip } from "./ui/chips";

export type SortKey = "id" | "domain" | "type" | "tier" | "status" | "freshness" | "origin" | "passages";
export type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "id", label: "ID" },
  { key: "domain", label: "Domain" },
  { key: "type", label: "Type" },
  { key: "tier", label: "Tier" },
  { key: "status", label: "Status" },
  { key: "freshness", label: "Freshness" },
  { key: "origin", label: "Origin" },
  { key: "passages", label: "Passages" },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function sortValue(s: Source, key: SortKey, passageCounts: Record<string, number>): string | number {
  switch (key) {
    case "id":
      return s.id;
    case "domain":
      return s.domain || domainOf(s.url);
    case "type":
      return s.source_type ?? "unknown";
    case "tier":
      return s.authority_tier ?? 3;
    case "status":
      return s.status ?? "found";
    case "freshness":
      // Newest first when ascending; a missing date sorts as oldest.
      return s.published_at ? -Date.parse(s.published_at) || 0 : Number.POSITIVE_INFINITY;
    case "origin":
      return s.origin_id ?? "";
    case "passages":
      return passageCounts[s.id] ?? 0;
  }
}

/** Sources ordered by one column. Stable: equal rows keep their incoming order, in either direction. */
export function sortSources(sources: Source[], key: SortKey, dir: SortDir, passageCounts: Record<string, number>): Source[] {
  const sign = dir === "asc" ? 1 : -1;
  return sources
    .map((s, i) => ({ s, i, v: sortValue(s, key, passageCounts) }))
    .sort((a, b) => {
      const c = typeof a.v === "number" && typeof b.v === "number" ? (a.v === b.v ? 0 : a.v < b.v ? -1 : 1) : collator.compare(String(a.v), String(b.v));
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.s);
}

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
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const rows = useMemo(() => (sort ? sortSources(sources, sort.key, sort.dir, passageCounts) : sources), [sources, sort, passageCounts]);

  if (sources.length === 0) {
    return <EmptyState title="No sources yet" why="Sources appear as discovery finds them." />;
  }

  const toggle = (key: SortKey) => setSort((cur) => (cur?.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className="max-h-[70vh] overflow-auto rounded-md border border-border-hairline">
      <table className="w-full text-left text-base">
        <caption className="sr-only">Sources found by the run. Column headings sort the table.</caption>
        <thead className="sticky top-0 z-10 bg-surface-2">
          <tr>
            {COLUMNS.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="p-0 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggle(c.key)}
                    className="flex w-full items-center gap-1 whitespace-nowrap p-2 text-left transition-colors hover:text-brand-secondary pointer-coarse:min-h-11"
                  >
                    {c.label}
                    <Icon name={active ? (sort.dir === "asc" ? "ChevronUp" : "ChevronDown") : "ChevronDown"} size={14} className={active ? "" : "opacity-30"} aria-hidden />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} id={`source-${s.id}`} className="scroll-mt-16 border-t border-border-hairline">
              <td className="mono p-2">{s.id}</td>
              <td className="p-2">
                <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer" className="underline transition-colors hover:text-brand">
                  {s.domain || domainOf(s.url)}
                </a>
                {slotBySource?.[s.id] ? <span className="text-sm text-text-muted"> ({slotBySource[s.id]})</span> : null}
              </td>
              <td className="p-2">
                <Badge>{s.source_type ?? "unknown"}</Badge>
              </td>
              <td className="p-2">
                <Badge>{`Tier ${s.authority_tier ?? 3}`}</Badge>
              </td>
              <td className="p-2">
                <StateChip spec={sourceStatusChip(s.status ?? "found")} />
                {s.fail_reason ? <div className="text-sm text-bad-fg">{s.fail_reason}</div> : null}
              </td>
              <td className="p-2">
                <Badge>{ageBucket(s.published_at, now)}</Badge>
              </td>
              <td className="mono p-2">{s.origin_id ?? "-"}</td>
              <td className="mono p-2">{passageCounts[s.id] ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
