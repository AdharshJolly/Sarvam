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

/** "9 sources -> 3 independent origins": the independence collapse, with derivative pages visibly grouped. */
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
  const collapsedAway = total - groups.length;
  return (
    <section aria-label={`Origin groups for ${slotName}`} className="anim-in">
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-3xl font-bold leading-none">{total}</p>
          <p className="label">{total === 1 ? "source" : "sources"}</p>
        </div>
        <span aria-hidden="true" className="text-2xl" style={{ color: "var(--text-muted)" }}>
          {"→"}
        </span>
        <div>
          <p className="text-3xl font-bold leading-none" style={{ color: "var(--accent)" }}>
            {groups.length}
          </p>
          <p className="label">independent {groups.length === 1 ? "origin" : "origins"}</p>
        </div>
        <p className="sr-only">
          {total} sources, {groups.length} independent origins
        </p>
        {collapsedAway > 0 ? (
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            {collapsedAway} {collapsedAway === 1 ? "page adds" : "pages add"} no independent confirmation: copies count once.
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        {groups.map((g, gi) => {
          const unestablished = !g.origin || g.origin.method === "none";
          const collapsed = g.sources.length > 1;
          return (
            <div
              key={g.key}
              className="card anim-in p-3"
              style={{
                animationDelay: `${gi * 60}ms`,
                borderLeft: `4px solid ${collapsed ? "var(--accent)" : unestablished ? "var(--warn)" : "var(--border-strong)"}`,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="label">Origin {String.fromCharCode(65 + (gi % 26))}</span>
                <strong>{g.origin?.label ?? "Origin not yet assigned"}</strong>
                {collapsed ? <Badge>{`${g.sources.length} pages, 1 origin`}</Badge> : null}
                {g.origin ? <Badge>{methodText[g.origin.method ?? "none"]}</Badge> : null}
                {unestablished ? (
                  <Badge title="Counted as one origin for coverage, but its independence could not be established.">
                    {"? independence not established"}
                  </Badge>
                ) : null}
              </div>
              <ul className="mt-2 flex flex-col text-base">
                {g.sources.map((s, si) => {
                  const href = safeHref(s.url);
                  const last = si === g.sources.length - 1;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 py-0.5">
                      <span aria-hidden="true" className="mono" style={{ color: "var(--text-muted)" }}>
                        {last ? "└─" : "├─"}
                      </span>
                      <button type="button" className="mono underline" onClick={() => onOpenSource?.(s.id)}>
                        {s.id}
                      </button>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                          {s.domain || domainOf(s.url)}
                        </a>
                      ) : (
                        <span>{s.domain || domainOf(s.url)}</span>
                      )}
                      <Badge>{s.source_type ?? "unknown"}</Badge>
                      <Badge>{`Tier ${s.authority_tier ?? 3}`}</Badge>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
