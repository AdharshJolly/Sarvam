import type { ReportView } from "@contracts/types";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { runApi } from "../../api";
import {
  type Inline,
  type ReportNode,
  collectCitationIds,
  parseReport,
  unresolvedCitations,
} from "../../lib/reportMarkdown";
import { formatUsd, safeHref } from "../../lib/format";
import { useEvidence } from "../../state/EvidenceContext";
import { openConflictCount, worstCriticalSlots } from "../../state/selectors";
import { ApiError } from "../../api/client";
import { errorText, useSession } from "../../state/useRunSession";
import { StopCard } from "../StopCard";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { StateChip } from "../ui/StateChip";
import { certaintyChip, finalStateChip } from "../ui/chips";
import { Icon } from "../ui/Icon";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";

const warned = new Set<string>();

function Inlines({ nodes, resolvable, onCite }: { nodes: Inline[]; resolvable: Set<string>; onCite: (id: string) => void }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <span key={i}>{n.text}</span>;
      case "bold":
        return (
          <strong key={i}>
            <Inlines nodes={n.children} resolvable={resolvable} onCite={onCite} />
          </strong>
        );
      case "certainty":
        return (
          <span key={i} className="mx-1 align-middle">
            <StateChip spec={certaintyChip(n.value)} />
          </span>
        );
      case "cite":
        if (!resolvable.has(n.id)) {
          if (!warned.has(n.id)) {
            warned.add(n.id);
            console.error(`Sarvam: report cites ${n.id} which is missing from citations (contract violation)`);
          }
          return (
            <span key={i} title="This citation id is not in the report's citation list" className="text-warn-fg">
              [{n.id}] <Icon name="AlertTriangle" size={14} className="inline" aria-hidden /> unresolved citation
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            className="mx-0.5 rounded border px-1 text-sm font-semibold border-brand-secondary text-brand-secondary hover:bg-brand-secondary/10 transition-colors"
            aria-label={`Open evidence for claim ${n.id}`}
            onClick={() => onCite(n.id)}
          >
            {n.id}
          </button>
        );
    }
  });
}

function Nodes({ nodes, resolvable, onCite }: { nodes: ReportNode[]; resolvable: Set<string>; onCite: (id: string) => void }) {
  return (
    <>
      {nodes.map((n, i) => {
        const inl = (x: Inline[]) => <Inlines nodes={x} resolvable={resolvable} onCite={onCite} />;
        switch (n.type) {
          case "heading": {
            const cls = n.level === 1 ? "text-2xl" : n.level === 2 ? "text-xl" : "text-lg";
            return (
              <h3 key={i} id={`heading-${i}`} className={`${cls} mt-4 font-semibold scroll-mt-20`}>
                {inl(n.inline)}
              </h3>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="my-2">
                {inl(n.inline)}
              </p>
            );
          case "list":
            return (
              <ul key={i} className="my-2 list-disc pl-6">
                {n.items.map((it, j) => (
                  <li key={j}>{inl(it)}</li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="my-2 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      {n.header.map((h, j) => (
                        <th key={j} className="border-b border-border p-1">
                          {inl(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {n.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} className="border-b border-border p-1">
                            {inl(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

export function ReportPanel({ onOpenSlot, onOpenConflicts }: { onOpenSlot: (slotId: string) => void; onOpenConflicts: () => void }) {
  const { view, runId } = useSession();
  const ev = useEvidence();
  const [report, setReport] = useState<ReportView | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const [err, setErr] = useState("");
  const version = view.reportVersion;

  useEffect(() => {
    setReport(null);
    if (!runId || version === null) {
      setState(runId ? "missing" : "idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    runApi
      .getReport(runId)
      .then((r) => {
        if (!cancelled) {
          setReport(r);
          setState("idle");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 404) setState("missing");
        else {
          setErr(errorText(e));
          setState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runId, version]);

  const nodes = useMemo(() => (report ? parseReport(report.markdown) : []), [report]);
  const resolvable = useMemo(() => new Set((report?.citations ?? []).map((c) => c.claim_id)), [report]);
  const unresolved = report ? unresolvedCitations(collectCitationIds(nodes), resolvable) : [];

  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sarvam-report-${report.run_id}-v${report.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const headings = nodes
    .map((n, i) => ({ n, i }))
    .filter((x) => x.n.type === "heading" && x.n.level > 1) as { n: Extract<ReportNode, { type: "heading" }>; i: number }[];
    
  const cited = report?.citations ?? [];
  const metaRows: [string, string][] = report
    ? [
        ["Mode", view.run?.mode ?? "unknown"],
        ["Run", report.run_id],
        ["Report version", String(report.version)],
        ["Started", view.run?.started_at ?? "unknown"],
        ["Sources", String(Object.keys(view.sources).length)],
        ["Independent origins", String(Object.keys(view.origins).length)],
        ["Verified claims", String(Object.keys(view.claims).length)],
        ["Rejected by quote guard", String(view.rejectedClaims.length)],
        ["Conflicts (open / total)", `${openConflictCount(view)} / ${Object.keys(view.conflicts).length}`],
        ["Challenges", String(Object.keys(view.challenges).length)],
        ["Cost / LLM calls", `${formatUsd(view.usage.cost_usd ?? 0)} / ${view.usage.llm_calls ?? 0}`],
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {view.stop ? (
        <StopCard
          stop={view.stop}
          gaps={worstCriticalSlots(view)}
          challenges={Object.values(view.challenges)}
          onOpenSlot={onOpenSlot}
          onOpenConflicts={onOpenConflicts}
        />
      ) : null}
      {state === "loading" ? (
        <div role="status" aria-live="polite" className="card flex flex-col gap-3 p-6">
          <span className="sr-only">Loading report...</span>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="mt-3 h-5 w-1/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : null}
      {state === "missing" ? (
        <EmptyState
          icon="AlignLeft"
          title="The report is written after the stop decision"
          why={`Current phase: ${view.phase ? view.phase.replace("_", " ") : "not started"}.`}
        />
      ) : null}
      {state === "error" ? (
        <Banner tone="bad">
          Could not load the report: {err}
        </Banner>
      ) : null}
      {report ? (
        <div className="grid gap-4 xl:grid-cols-[13rem_1fr]">
          <nav aria-label="Report contents" className="no-print hidden xl:block">
            <div className="sticky top-20">
              <p className="label mb-2">Contents</p>
              <ul className="flex flex-col gap-1.5 text-base">
                {headings.map((h, i) => (
                  <li key={i} className={h.n.level === 3 ? "pl-3" : ""}>
                    <a href={`#heading-${h.i}`} className={`block hover:text-brand transition-colors ${h.n.level === 3 ? "text-text-muted" : "text-text"}`}>
                      <Inlines nodes={h.n.inline} resolvable={resolvable} onCite={() => undefined} />
                    </a>
                  </li>
                ))}
                <li className="pt-2 mt-2 border-t border-border">
                  <a href="#sources-cited" className="block text-text-muted hover:text-brand transition-colors">Sources cited</a>
                </li>
                <li>
                  <a href="#method-metadata" className="block text-text-muted hover:text-brand transition-colors">Method and run metadata</a>
                </li>
              </ul>
            </div>
          </nav>
          <div className="flex min-w-0 flex-col gap-4">
            <article className="report card p-6">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className="label">Report</p>
                {report.certainty_state ? <StateChip spec={finalStateChip(report.certainty_state)} large /> : null}
              </div>
              <div className="no-print mb-2">
                <Button onClick={download}>Download Markdown</Button>
              </div>
              {unresolved.length > 0 ? (
                <div className="mb-4">
                  <Banner tone="warn">
                    {unresolved.length} unresolved citation(s): {unresolved.join(", ")}
                  </Banner>
                </div>
              ) : null}
              <Nodes nodes={nodes} resolvable={resolvable} onCite={(id) => ev.open([id])} />
              {(report.dropped_sentences ?? []).length > 0 ? (
                <details className="mt-4 rounded-md p-3 bg-surface-2">
                  <summary className="cursor-pointer font-semibold">
                    Removed by the report verifier ({(report.dropped_sentences ?? []).length})
                  </summary>
                  <p className="mt-1 text-sm text-text-muted">
                    These sentences had no stored claim behind them, so they were left out of the report.
                  </p>
                  <ul className="list-disc pl-6 text-base mt-2">
                    {(report.dropped_sentences ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>

            <section id="sources-cited" className="card p-4 scroll-mt-20" aria-label="Sources cited">
              <h3 className="label mb-2">Sources cited ({cited.length})</h3>
              <ul className="flex flex-col gap-1 text-base">
                {cited.map((c) => {
                  const href = safeHref(c.url);
                  return (
                    <li key={c.claim_id} className="flex flex-wrap items-baseline gap-2">
                      <button type="button" className="mono underline text-brand-secondary hover:text-brand transition-colors" aria-label={`Open evidence for claim ${c.claim_id}`} onClick={() => ev.open([c.claim_id])}>
                        {c.claim_id}
                      </button>
                      <span className="mono text-text-muted">
                        {c.passage_id} · {c.source_id}
                      </span>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:text-brand transition-colors">
                          {c.url}
                        </a>
                      ) : (
                        <span>{c.url}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            <section id="method-metadata" className="card p-4 scroll-mt-20" aria-label="Method and run metadata">
              <h3 className="label mb-2">Method and run metadata</h3>
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {metaRows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-border py-1">
                    <dt className="text-text-muted">{k}</dt>
                    <dd className="mono text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
