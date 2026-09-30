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
import { useEvidence } from "../../state/EvidenceContext";
import { openConflictCount, worstCriticalSlots } from "../../state/selectors";
import { ApiError } from "../../api/client";
import { errorText, useSession } from "../../state/useRunSession";
import { StopCard } from "../StopCard";
import { EmptyState } from "../ui/EmptyState";
import { StateChip } from "../ui/StateChip";
import { certaintyChip } from "../ui/chips";

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
      {state === "loading" ? <p role="status">Loading report...</p> : null}
      {state === "missing" ? (
        <EmptyState
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
        <article className="report rounded border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Mode: {view.run?.mode ?? "unknown"} {"·"} Report version {report.version}
            {report.certainty_state ? ` · ${report.certainty_state}` : ""}
          </p>
          <div className="no-print my-2">
            <button type="button" className="rounded border px-3 py-1" style={{ borderColor: "var(--border)" }} onClick={download}>
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
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold">
                Removed by the report verifier ({(report.dropped_sentences ?? []).length})
              </summary>
              <ul className="list-disc pl-6 text-base">
                {(report.dropped_sentences ?? []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {openConflictCount(view)} open conflicts recorded for this run.
          </p>
        </article>
      ) : null}
    </div>
  );
}
