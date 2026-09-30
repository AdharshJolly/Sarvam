import { useCallback, useEffect, useRef, useState } from "react";
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

function ClaimEvidenceView({ runId, claimId }: { runId: string; claimId: string }) {
  const { load, retry } = useClaimEvidence(runId, claimId);
  const [now] = useState(() => new Date());

  if (load.status === "loading")
    return (
      <div role="status" aria-live="polite" className="card flex flex-col gap-3 p-3">
        <span className="sr-only">Loading evidence for {claimId}...</span>
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  if (load.status === "error")
    return (
      <div role="alert" style={{ color: "var(--bad)" }}>
        <p>
          {"✕"} Could not load evidence for {claimId}: {load.message}
        </p>
        <button type="button" className="underline" onClick={retry}>
          Retry
        </button>
      </div>
    );
  const { claim, passage, source, origin, verdict } = load.data;
  const hl = highlightRanges(passage.text, load.data.quote_start, load.data.quote_end, claim.quote);
  const unestablished = load.data.independence === "unestablished";
  const href = safeHref(source.url);
  return (
    <article className="card anim-in flex flex-col gap-4 p-4">
      <header>
        <p className="label mb-1">Claim {claim.id}</p>
        <h3 className="text-lg font-semibold leading-snug">{claim.text}</h3>
        {claim.value_num != null ? (
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            {claim.entity ?? "?"} / {claim.attribute ?? "?"} = {claim.value_num} {claim.unit ?? ""}
            {claim.period ? ` per ${claim.period}` : ""}
          </p>
        ) : null}
      </header>
      <section aria-label="Stored passage">
        <h4 className="label mb-1">
          Passage <span className="mono">{passage.id}</span>{" "}
          <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>
            (source characters {passage.char_start} to {passage.char_end}
            {load.data.quote_start != null ? `; quote at ${load.data.quote_start} to ${load.data.quote_end}` : ""})
          </span>
        </h4>
        <p className="rounded-md p-3 leading-relaxed" style={{ background: "var(--surface-2)", whiteSpace: "pre-wrap" }}>
          {hl.segments.map((s, i) =>
            s.mark ? (
              <mark key={i} style={{ background: "var(--warn-bg)", color: "var(--text)", borderBottom: "3px solid var(--warn)", padding: "0 2px", fontWeight: 600 }}>
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </p>
        {!hl.located ? (
          <p role="alert" style={{ color: "var(--bad)" }}>
            {"✕"} Quote could not be located in the stored passage.
          </p>
        ) : null}
      </section>
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
      <section aria-label="Origin">
        <h4 className="label mb-1">Origin</h4>
        {origin ? (
          <p>
            {origin.label} <Badge>{methodText[origin.method ?? "none"]}</Badge>
          </p>
        ) : (
          <p>Origin not yet assigned.</p>
        )}
        {unestablished ? (
          <p>
            <Badge title="Counts as one origin for coverage.">{"? independence not established"}</Badge>
          </p>
        ) : null}
      </section>
      <section aria-label="Source">
        <h4 className="label mb-1">Source <span className="mono">{source.id}</span></h4>
        <ul className="text-base">
          <li>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
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
            {source.fail_reason ? ` ${source.fail_reason}` : ""}
          </li>
        </ul>
      </section>
    </article>
  );
}

/** Right drawer: claim, highlighted passage, verdict, origin, source (SSOT FR-24). Single instance via context. */
export function EvidenceDrawer() {
  const ev = useEvidence();
  const { runId } = useSession();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);
  const { close, opener } = ev;
  const docked = useMediaQuery("(min-width: 1280px)");

  const restoreFocus = useCallback(() => {
    opener.current?.focus();
  }, [opener]);

  useEffect(() => {
    if (ev.isOpen) {
      wasOpen.current = true;
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      restoreFocus();
    }
  }, [ev.isOpen, restoreFocus]);

  useEffect(() => {
    if (!ev.isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ev.isOpen, close]);

  return (
    <aside
      id="evidence-drawer"
      role="dialog"
      aria-modal={docked ? "false" : "true"}
      aria-label="Evidence drawer"
      hidden={!ev.isOpen}
      className="evidence-drawer anim-drawer fixed inset-y-0 right-0 z-30 w-full overflow-y-auto border-l p-4 xl:w-[30rem]"
      style={{ borderColor: "var(--border-strong)", background: "var(--bg)", boxShadow: "var(--shadow)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="label">Evidence</h2>
        <button ref={closeRef} type="button" className="btn" onClick={close}>
          Close (Esc)
        </button>
      </div>
      {ev.isOpen && runId ? (
        <div className="flex flex-col gap-4">
          {ev.openIds.map((id) => (
            <ClaimEvidenceView key={`${runId}:${id}`} runId={runId} claimId={id} />
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--text-muted)" }}>Select a claim or citation to see its stored passage, verdict, origin and source.</p>
      )}
    </aside>
  );
}
