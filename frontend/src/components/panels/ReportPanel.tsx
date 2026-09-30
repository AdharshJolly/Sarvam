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
            <span key={i} title="This citation id is not in the report's citation list">
              [{n.id}] {"⚠"} unresolved citation
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            className="mx-0.5 rounded border px-1 text-sm font-semibold"
            style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
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
              <h3 key={i} className={`${cls} mt-4 font-semibold`}>
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
                        <th key={j} className="border-b p-1" style={{ borderColor: "var(--border)" }}>
                          {inl(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {n.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} className="border-b p-1" style={{ borderColor: "var(--border)" }}>
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

  const headings = nodes.flatMap((n) => (n.type === "heading" && n.level > 1 ? [n] : []));
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
          icon={"☰"}
          title="The report is written after the stop decision"
          why={`Current phase: ${view.phase ? view.phase.replace("_", " ") : "not started"}.`}
        />
      ) : null}
      {state === "error" ? (
        <p role="alert" style={{ color: "var(--bad)" }}>
          {"✕"} Could not load the report: {err}
        </p>
      ) : null}
      {report ? (
        <div className="grid gap-4 xl:grid-cols-[13rem_1fr]">
          <nav aria-label="Report contents" className="no-print hidden xl:block">
            <div className="sticky top-20">
              <p className="label mb-2">Contents</p>
              <ul className="flex flex-col gap-1 text-base">
                {headings.map((h, i) => (
                  <li key={i} style={{ paddingLeft: h.level === 3 ? "0.75rem" : 0 }}>
                    <span style={{ color: h.level === 3 ? "var(--text-muted)" : "var(--text)" }}>
                      <Inlines nodes={h.inline} resolvable={resolvable} onCite={() => undefined} />
                    </span>
                  </li>
                ))}
                <li>Sources cited</li>
                <li>Method and run metadata</li>
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
                <button type="button" className="btn" onClick={download}>
                  Download Markdown
                </button>
              </div>
              {unresolved.length > 0 ? (
                <p role="alert" style={{ color: "var(--bad)" }}>
                  {"⚠"} {unresolved.length} unresolved citation(s): {unresolved.join(", ")}
                </p>
              ) : null}
              <Nodes nodes={nodes} resolvable={resolvable} onCite={(id) => ev.open([id])} />
              {(report.dropped_sentences ?? []).length > 0 ? (
                <details className="mt-4 rounded-md p-3" style={{ background: "var(--surface-2)" }}>
                  <summary className="cursor-pointer font-semibold">
                    Removed by the report verifier ({(report.dropped_sentences ?? []).length})
                  </summary>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    These sentences had no stored claim behind them, so they were left out of the report.
                  </p>
                  <ul className="list-disc pl-6 text-base">
                    {(report.dropped_sentences ?? []).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>

            <section className="card p-4" aria-label="Sources cited">
              <h3 className="label mb-2">Sources cited ({cited.length})</h3>
              <ul className="flex flex-col gap-1 text-base">
                {cited.map((c) => {
                  const href = safeHref(c.url);
                  return (
                    <li key={c.claim_id} className="flex flex-wrap items-baseline gap-2">
                      <button type="button" className="mono underline" aria-label={`Open evidence for claim ${c.claim_id}`} onClick={() => ev.open([c.claim_id])}>
                        {c.claim_id}
                      </button>
                      <span className="mono" style={{ color: "var(--text-muted)" }}>
                        {c.passage_id} · {c.source_id}
                      </span>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
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

            <section className="card p-4" aria-label="Method and run metadata">
              <h3 className="label mb-2">Method and run metadata</h3>
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {metaRows.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b py-1" style={{ borderColor: "var(--border)" }}>
                    <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
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
