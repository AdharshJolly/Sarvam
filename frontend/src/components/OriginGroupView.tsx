import type { Origin, OriginMethod, Source } from "@contracts/types";
import { useEffect, useState } from "react";
import { domainOf, safeHref } from "../lib/format";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import type { Tone } from "./ui/chips";

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

/** True shortly after mount, so a group can visibly settle from its spread-out to its grouped state. */
function useSettled(delayMs = 350): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return settled;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/**
 * The independence collapse (SSOT: "N sources -> M independent origins"). Each origin is one card:
 * its source pages are listed on the left, joined by a brace when several pages count as one origin,
 * and the origin itself, why the pages were grouped, and any doubt about its independence on the
 * right. Copies count once, which is the point of the picture.
 *
 * Motion: pages of a multi-page origin start spread apart and settle together once. The global
 * reduced-motion rule removes the transition, so the grouped state simply appears.
 */
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
  const settled = useSettled();
  return (
    <section aria-label={`Origin groups for ${slotName}`}>
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-3xl font-bold leading-none">{total}</p>
            <p className="label">{plural(total, "source")}</p>
          </div>
          <Icon name="ArrowRight" size={24} className="text-text-muted" aria-hidden />
          <div>
            <p className="text-3xl font-bold leading-none text-brand-secondary">{groups.length}</p>
            <p className="label">independent {plural(groups.length, "origin")}</p>
          </div>
        </div>
        <p className="sr-only">
          {total} sources, {groups.length} independent origins
        </p>
        {collapsedAway > 0 ? (
          <p className="text-base text-text-muted">
            {collapsedAway} {collapsedAway === 1 ? "page adds" : "pages add"} no independent confirmation: copies count once.
          </p>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {groups.map((g, gi) => {
          const unestablished = !g.origin || g.origin.method === "none";
          const collapsed = g.sources.length > 1;
          const accent: Tone = collapsed ? "brand" : unestablished ? "warn" : "muted";
          const letter = String.fromCharCode(65 + (gi % 26));
          return (
            <Card as="li" key={g.key} pad="sm" accent={accent} aria-label={`Origin ${letter}`}>
              <div className="grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,16rem)]">
                <ul
                  aria-label={`Source pages in origin ${letter}`}
                  className={`flex flex-col transition-[gap] duration-300 ${collapsed && !settled ? "gap-3" : "gap-1"} ${
                    collapsed ? "border-r-4 border-brand-secondary pr-3" : ""
                  }`}
                >
                  {g.sources.map((s) => {
                    const href = safeHref(s.url);
                    return (
                      <li
                        key={s.id}
                        className="flex flex-wrap items-center gap-2 rounded-md border border-border-hairline bg-surface-2 px-2 py-1 text-base"
                      >
                        <button
                          type="button"
                          className="mono underline text-brand-secondary transition-colors hover:text-brand"
                          onClick={() => onOpenSource?.(s.id)}
                        >
                          {s.id}
                        </button>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="underline transition-colors hover:text-brand">
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

                <Icon name="ArrowRight" size={20} className="hidden text-text-muted md:block" aria-hidden />

                <div className="flex flex-col gap-1.5">
                  <p className="label">Origin {letter}</p>
                  <p className="font-semibold">{g.origin?.label ?? "Origin not yet assigned"}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {collapsed ? <Badge>{`${g.sources.length} pages, 1 origin`}</Badge> : null}
                    {g.origin ? <Badge>{methodText[g.origin.method ?? "none"]}</Badge> : null}
                    {unestablished ? (
                      <Badge title="Counted as one origin for coverage, but its independence could not be established.">
                        {"? independence not established"}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </ul>
    </section>
  );
}
