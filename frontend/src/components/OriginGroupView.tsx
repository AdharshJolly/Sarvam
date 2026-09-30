import type { Origin, OriginMethod, Source } from "@contracts/types";
import { domainOf, safeHref } from "../lib/format";
import { Badge } from "./ui/Badge";

export const methodText: Record<OriginMethod, string> = {
  domain: "same publisher",
  near_duplicate: "near-identical text",
  shared_number: "same number and phrase",
  attribution: "cites the same source",
  none: "no signal",
};

export interface OriginGroup {
  key: string;
  origin: Origin | null;
  sources: Source[];
}

export function OriginGroupView({
  slotName,
  groups,
  onOpenSource,
}: {
  slotName: string;
  groups: OriginGroup[];
  onOpenSource?: (sourceId: string) => void;
}) {
  const total = groups.reduce((n, g) => n + g.sources.length, 0);
  return (
    <section
      aria-label={`Origin groups for ${slotName}`}
      className="rounded border p-3"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <h3 className="text-xl font-semibold">
        {total} {total === 1 ? "source" : "sources"}, {groups.length} independent{" "}
        {groups.length === 1 ? "origin" : "origins"}
      </h3>
      <p className="mb-3 text-base" style={{ color: "var(--text-muted)" }}>
        {slotName}: pages that repeat one origin count once.
      </p>
      <div className="flex flex-col gap-3">
        {groups.map((g) => {
          const unestablished = !g.origin || g.origin.method === "none";
          const collapsed = g.sources.length > 1;
          return (
            <div
              key={g.key}
              className="rounded border p-2"
              style={{ borderColor: collapsed ? "var(--accent)" : "var(--border)", borderLeftWidth: 4 }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <strong>{g.origin?.label ?? "Origin not yet assigned"}</strong>
                {collapsed ? <Badge>{`${g.sources.length} pages, 1 origin`}</Badge> : null}
                {g.origin ? <Badge>{methodText[g.origin.method ?? "none"]}</Badge> : null}
                {unestablished ? (
                  <Badge title="Counted as one origin for coverage, but its independence could not be established.">
                    {"? independence not established"}
                  </Badge>
                ) : null}
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {g.sources.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 text-base">
                    <button type="button" className="underline" onClick={() => onOpenSource?.(s.id)}>
                      {s.id}
                    </button>
                    <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer" className="underline">
                      {s.domain || domainOf(s.url)}
                    </a>
                    <Badge>{s.source_type ?? "unknown"}</Badge>
                    <Badge>{`Tier ${s.authority_tier ?? 3}`}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
