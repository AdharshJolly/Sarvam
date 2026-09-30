import type { ClaimEvidence } from "@contracts/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { runApi } from "../../api";
import { ageBucket, safeHref } from "../../lib/format";
import { highlightRanges } from "../../lib/quote";
import { useEvidence } from "../../state/EvidenceContext";
import { errorText, useSession } from "../../state/useRunSession";
import { methodText } from "../OriginGroupView";
import { Badge } from "../ui/Badge";
import { StateChip } from "../ui/StateChip";
import { sourceStatusChip, verdictChip } from "../ui/chips";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: ClaimEvidence };

const cache = new Map<string, ClaimEvidence>();

function ClaimEvidenceView({ runId, claimId }: { runId: string; claimId: string }) {
  const key = `${runId}:${claimId}`;
  const [load, setLoad] = useState<Load>(() => {
    const hit = cache.get(key);
    return hit ? { status: "ok", data: hit } : { status: "loading" };
  });
  const [tick, setTick] = useState(0);
  const [now] = useState(() => new Date());

  useEffect(() => {
    const hit = cache.get(key);
    if (hit) {
      setLoad({ status: "ok", data: hit });
      return;
    }
    let cancelled = false;
    setLoad({ status: "loading" });
    runApi
      .getClaim(runId, claimId)
      .then((data) => {
        cache.set(key, data);
        if (!cancelled) setLoad({ status: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: "error", message: errorText(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, runId, claimId, tick]);

  if (load.status === "loading") return <p role="status">Loading evidence for {claimId}...</p>;
  if (load.status === "error")
    return (
      <div role="alert" style={{ color: "var(--bad)" }}>
        <p>
          {"✕"} Could not load evidence for {claimId}: {load.message}
        </p>
        <button type="button" className="underline" onClick={() => setTick((n) => n + 1)}>
          Retry
        </button>
      </div>
    );
  const { claim, passage, source, origin, verdict } = load.data;
  const hl = highlightRanges(passage.text, load.data.quote_start, load.data.quote_end, claim.quote);
  const unestablished = load.data.independence === "unestablished";
  const href = safeHref(source.url);
  return (
    <article className="flex flex-col gap-3 rounded border p-3" style={{ borderColor: "var(--border)" }}>
      <header>
        <h3 className="text-lg font-semibold">
          {claim.id}: {claim.text}
        </h3>
        {claim.value_num != null ? (
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            {claim.entity ?? "?"} / {claim.attribute ?? "?"} = {claim.value_num} {claim.unit ?? ""}
            {claim.period ? ` per ${claim.period}` : ""}
          </p>
        ) : null}
      </header>
      <section aria-label="Stored passage">
        <h4 className="font-semibold">
          Passage {passage.id}{" "}
          <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>
            (source characters {passage.char_start} to {passage.char_end}
            {load.data.quote_start != null ? `; quote at ${load.data.quote_start} to ${load.data.quote_end}` : ""})
          </span>
        </h4>
        <p className="rounded p-2" style={{ background: "var(--surface-2)", whiteSpace: "pre-wrap" }}>
          {hl.segments.map((s, i) =>
            s.mark ? (
              <mark key={i} style={{ background: "var(--warn)", color: "var(--bg)", padding: "0 2px" }}>
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
        <h4 className="font-semibold">Origin</h4>
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
        <h4 className="font-semibold">Source {source.id}</h4>
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
      aria-modal="true"
      aria-label="Evidence drawer"
      hidden={!ev.isOpen}
      className="evidence-drawer fixed inset-y-0 right-0 z-20 w-full max-w-xl overflow-y-auto border-l p-4 shadow-lg"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Evidence</h2>
        <button ref={closeRef} type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--border)" }} onClick={close}>
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
