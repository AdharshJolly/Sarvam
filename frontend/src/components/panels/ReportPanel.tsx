import { termTitle } from "../../lib/terms";
import type { ReportView } from "@contracts/types";
import { useEffect, useMemo, useState } from "react";
import { runApi } from "../../api";
import { ApiError } from "../../api/client";
import { formatUsd } from "../../lib/format";
import { buildHash } from "../../lib/route";
import { collectCitationIds, parseReport, unresolvedCitations } from "../../lib/reportMarkdown";
import type { ReportNode } from "../../lib/reportMarkdown";
import { useEvidence } from "../../state/EvidenceContext";
import { openConflictCount } from "../../state/selectors";
import { errorText, useSession } from "../../state/useRunSession";
import { ReportBody } from "../report/ReportBody";
import { type ContentsEntry, ReportContents } from "../report/ReportContents";
import { RunMetadata, SourcesCited } from "../report/ReportMeta";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";

/** The h2 and h3 headings of the report, with their position so each can be jumped to. */
export function contentsEntries(nodes: ReportNode[]): ContentsEntry[] {
  const out: ContentsEntry[] = [];
  nodes.forEach((n, index) => {
    if (n.type === "heading" && n.level > 1) out.push({ index, level: n.level, inline: n.inline });
  });
  return out;
}

/** The report tab: loads the stored report, then reads as a document with contents, sources and method. */
export function ReportPanel() {
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

  const nodes = useMemo(() => (report ? parseReport(report.markdown.replace(/^\*\*Assurance state:.*$/m, "").replace(/^## Method and run metadata[\s\S]*$/m, "")) : []), [report]);
  const resolvable = useMemo(() => new Set((report?.citations ?? []).map((c) => c.claim_id)), [report]);
  const unresolved = report ? unresolvedCitations(collectCitationIds(nodes), resolvable) : [];
  const headings = useMemo(() => contentsEntries(nodes), [nodes]);
  const dropped = report?.dropped_sentences ?? [];

  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.markdown], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `sarvam-report-${report.run_id}-v${report.version}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const metaRows: [string, React.ReactNode][] = report
    ? [
        ["Mode", view.run?.mode ?? "unknown"],
        ["Run", report.run_id],
        ["Report version", String(report.version)],
        ["Started", view.run?.started_at ?? "unknown"],
        ["Sources", <a href={buildHash(report.run_id, "evidence")} className="underline hover:text-brand transition-colors">{Object.keys(view.sources).length}</a>],
        [termTitle("origin", 2), Object.keys(view.origins).length], // no list exists
        ["Verified statements", <a href={buildHash(report.run_id, "evidence")} className="underline hover:text-brand transition-colors">{Object.keys(view.claims).length}</a>],
        ["Rejected by quote guard", <a href={buildHash(report.run_id, "evidence")} className="underline hover:text-brand transition-colors">{view.rejectedClaims.length}</a>],
        ["Conflicts (open / total)", <a href={buildHash(report.run_id, "conflicts")} className="underline hover:text-brand transition-colors">{openConflictCount(view)} / {Object.keys(view.conflicts).length}</a>],
        ["Challenges", <a href={buildHash(report.run_id, "challenge")} className="underline hover:text-brand transition-colors">{Object.keys(view.challenges).length}</a>],
        // Cost/LLM timeline requires an AppShell callback which isn't currently passed.
        ["Cost / LLM calls", `${formatUsd(view.usage.cost_usd ?? 0)} / ${view.usage.llm_calls ?? 0}`],
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      {state === "loading" ? (
        <Card pad="lg" role="status" aria-live="polite" className="flex flex-col gap-3">
          <span className="sr-only">Loading report...</span>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="mt-3 h-5 w-1/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </Card>
      ) : null}
      {state === "missing" ? (
        <EmptyState
          icon="AlignLeft"
          title="The report is written after the stop decision"
          why={`Current phase: ${view.phase ? view.phase.replace("_", " ") : "not started"}.`}
        />
      ) : null}
      {state === "error" ? <Banner tone="bad">Could not load the report: {err}</Banner> : null}
      {report ? (
        <div className="grid gap-6 xl:grid-cols-[13rem_1fr]">
          <ReportContents headings={headings} />
          <div className="print-area flex min-w-0 flex-col gap-4">
            <Card as="article" pad="lg" className="report">
              <div className="no-print mb-5 flex flex-wrap items-center gap-2 border-b border-border-hairline pb-4">
                <p className="label mr-auto">Report v{report.version}</p>
                <Button icon={<Icon name="FileText" size={16} aria-hidden />} onClick={download}>
                  Download Markdown
                </Button>
                <Button variant="ghost" icon={<Icon name="Download" size={16} aria-hidden />} onClick={() => window.print()}>
                  Save as PDF
                </Button>
              </div>
              {unresolved.length > 0 ? (
                <div className="mb-4">
                  <Banner tone="warn">
                    {unresolved.length} unresolved citation(s): {unresolved.join(", ")}
                  </Banner>
                </div>
              ) : null}
              <ReportBody nodes={nodes} resolvable={resolvable} onCite={(id) => ev.open([id])} />
              {dropped.length > 0 ? (
                <details className="no-print mt-6 rounded-md bg-surface-2 p-3">
                  <summary className="cursor-pointer font-semibold">Removed by the report verifier ({dropped.length})</summary>
                  <p className="mt-1 text-sm text-text-muted">These sentences had no stored statement behind them, so they were left out of the report.</p>
                  <ul className="mt-2 list-disc pl-6 text-base">
                    {dropped.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </Card>
            <SourcesCited cited={report.citations ?? []} onOpenClaim={(id) => ev.open([id])} />
            <div className="no-print">
              <RunMetadata rows={metaRows} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
