import { useState } from "react";
import { ageBucket, safeHref } from "../../lib/format";
import { highlightRanges } from "../../lib/quote";
import { useEvidence } from "../../state/EvidenceContext";
import { useClaimEvidence } from "../../state/useClaimEvidence";
import { useSession } from "../../state/useRunSession";
import { useMediaQuery } from "../../lib/useMediaQuery";
import { methodText } from "../OriginGroupView";
import { Skeleton } from "../ui/Skeleton";
import { Badge } from "../ui/Badge";
import { StateChip } from "../ui/StateChip";
import { sourceStatusChip, verdictChip } from "../ui/chips";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Card } from "../ui/Card";

function ClaimEvidenceView({ runId, claimId }: { runId: string; claimId: string }) {
  const { load, retry } = useClaimEvidence(runId, claimId);
  const [now] = useState(() => new Date());

  if (load.status === "loading")
    return (
      <Card pad="sm" role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">Loading evidence for {claimId}...</span>
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </Card>
    );
  if (load.status === "error")
    return (
      <div role="alert" className="text-bad-fg font-semibold flex items-center gap-2 bg-bad-bg p-3 rounded-md border border-bad-border">
        <Icon name="XOctagon" size={16} aria-hidden />
        <p className="flex-1">
          Could not load evidence for {claimId}: {load.message}
        </p>
        <button type="button" className="underline hover:text-bad-fg/80" onClick={retry}>
          Retry
        </button>
      </div>
    );
  const { claim, passage, source, origin, verdict } = load.data;
  const hl = highlightRanges(passage.text, load.data.quote_start, load.data.quote_end, claim.quote);
  const unestablished = load.data.independence === "unestablished";
  const href = safeHref(source.url);
  return (
    <Card as="article" pad="md" className="flex flex-col gap-4">
      <header>
        <p className="label mb-1">Claim {claim.id}</p>
        <h3 className="font-display text-xl font-semibold leading-snug">{claim.text}</h3>
        {claim.value_num != null ? (
          <p className="text-base text-text-muted">
            {claim.entity ?? "?"} / {claim.attribute ?? "?"} = {claim.value_num} {claim.unit ?? ""}
            {claim.period ? ` per ${claim.period}` : ""}
          </p>
        ) : null}
      </header>
      <section aria-label="Verdict">
        {verdict ? (
          <div className="flex flex-wrap items-center gap-2">
            <StateChip spec={verdictChip(verdict)} />
            <span>{load.data.verdict_rationale}</span>
          </div>
        ) : (
          <Badge>Not yet verified</Badge>
        )}
      </section>
      <section aria-label="Stored passage">
        <h4 className="label mb-1">
          Passage <span className="mono">{passage.id}</span>{" "}
          <span className="text-sm font-normal text-text-muted">
            (source characters {passage.char_start} to {passage.char_end}
            {load.data.quote_start != null ? `; quote at ${load.data.quote_start} to ${load.data.quote_end}` : ""})
          </span>
        </h4>
        <p className="rounded-md p-3 leading-relaxed bg-surface-2 whitespace-pre-wrap">
          {hl.segments.map((s, i) =>
            s.mark ? (
              <mark key={i} className="bg-warn-bg text-text border-b-[3px] border-warn-border px-0.5 font-semibold">
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </p>
        {!hl.located ? (
          <p role="alert" className="text-bad-fg flex items-center gap-1.5 mt-2 font-semibold">
            <Icon name="XOctagon" size={16} aria-hidden /> Quote could not be located in the stored passage.
          </p>
        ) : null}
      </section>
      <section aria-label="Origin">
        <h4 className="label mb-1">Origin</h4>
        {origin ? (
          <p>
            {origin.label} <Badge>{methodText[origin.method ?? "none"]}</Badge>
          </p>
        ) : (
          <p className="text-text-muted">Origin not yet assigned.</p>
        )}
        {unestablished ? (
          <p className="mt-1">
            <Badge title="Counts as one origin for coverage.">{"? independence not established"}</Badge>
          </p>
        ) : null}
      </section>
      <section aria-label="Source">
        <h4 className="label mb-1">Source <span className="mono">{source.id}</span></h4>
        <ul className="text-base flex flex-col gap-1">
          <li>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand transition-colors">
                {source.url}
              </a>
            ) : (
              <span>{source.url} (not a web link)</span>
            )}
          </li>
          <li>
            {source.domain} <Badge>{source.source_type ?? "unknown"}</Badge> <Badge>{`Tier ${source.authority_tier ?? 3}`}</Badge>
          </li>
          <li>
            Published: {source.published_at ?? "unknown"} <Badge>{ageBucket(source.published_at, now)}</Badge>
          </li>
          <li>Retrieved: {source.retrieved_at ?? "unknown"}</li>
          <li>
            Status: <StateChip spec={sourceStatusChip(source.status ?? "found")} />
            {source.fail_reason ? <span className="text-bad-fg ml-1">{source.fail_reason}</span> : ""}
          </li>
        </ul>
      </section>
    </Card>
  );
}

/** Right drawer: claim, highlighted passage, verdict, origin, source (SSOT FR-24). Single instance via context. */
export function EvidenceDrawer() {
  const ev = useEvidence();
  const { runId } = useSession();
  const { close } = ev;
  const docked = useMediaQuery("(min-width: 1280px)");

  return (
    <Dialog
      isOpen={ev.isOpen}
      onClose={close}
      title="Evidence"
      placement="right"
      docked={docked}
    >
      {ev.isOpen && runId ? (
        <div className="flex flex-col gap-4 pb-8">
          {ev.openIds.map((id) => (
            <ClaimEvidenceView key={`${runId}:${id}`} runId={runId} claimId={id} />
          ))}
        </div>
      ) : (
        <p className="text-text-muted">Select a claim or citation to see its stored passage, verdict, origin and source.</p>
      )}
    </Dialog>
  );
}
