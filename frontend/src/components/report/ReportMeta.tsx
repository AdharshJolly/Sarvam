import type { ReportView } from "@contracts/types";
import { safeHref } from "../../lib/format";
import { Card } from "../ui/Card";

type Citation = NonNullable<ReportView["citations"]>[number];

export function SourcesCited({ cited, onOpenClaim }: { cited: Citation[]; onOpenClaim: (claimId: string) => void }) {
  return (
    <Card as="section" pad="md" id="sources-cited" className="scroll-mt-20" aria-labelledby="sources-cited-h">
      <h3 id="sources-cited-h" className="label mb-2">
        Sources cited ({cited.length})
      </h3>
      <ul className="flex flex-col gap-1.5 text-base">
        {cited.map((c) => {
          const href = safeHref(c.url);
          return (
            <li key={c.claim_id} className="flex flex-wrap items-baseline gap-x-2">
              <button
                type="button"
                className="mono text-brand-secondary underline transition-colors hover:text-brand"
                aria-label={`Open evidence for claim ${c.claim_id}`}
                onClick={() => onOpenClaim(c.claim_id)}
              >
                {c.claim_id}
              </button>
              <span className="mono text-text-muted">
                {c.passage_id} · {c.source_id}
              </span>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="break-all underline transition-colors hover:text-brand">
                  {c.url}
                </a>
              ) : (
                <span className="break-all">{c.url}</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function RunMetadata({ rows }: { rows: [string, string][] }) {
  return (
    <Card as="section" pad="md" id="method-metadata" className="scroll-mt-20" aria-labelledby="method-metadata-h">
      <h3 id="method-metadata-h" className="label mb-2">
        Method and run metadata
      </h3>
      <dl className="grid gap-x-6 sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-border-hairline py-1.5">
            <dt className="text-text-muted">{k}</dt>
            <dd className="mono text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
