import { useCallback, useEffect, useState } from "react";
import { type Health, api } from "../api/client";
import { env } from "../config/env";
import { type HistoryEntry, readHistory } from "../lib/history";
import { RunForm } from "./RunForm";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { Icon } from "./ui/Icon";
import type { IconName } from "./ui/Icon";

const MOMENTS: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "Grid", title: "Coverage matrix", text: "See exactly where Sarvam is confident and where it is not, cell by cell." },
  { icon: "ArrowRight", title: "Independence collapse", text: "Nine sources that copy one press release count as one origin." },
  { icon: "Quote", title: "Claim to passage", text: "Every claim links to the stored passage and the exact quote." },
  { icon: "Square", title: "Stop decision", text: "Sarvam explains why it stopped, what is missing and what could change the answer." },
];

type BackendState = { kind: "mock" } | { kind: "checking" } | { kind: "ok"; health: Health } | { kind: "down" };

/** Whether the API answers, so a dead backend is explained before someone submits a question. */
function BackendStatus() {
  const [state, setState] = useState<BackendState>(env.useMock ? { kind: "mock" } : { kind: "checking" });

  const check = useCallback(() => {
    if (env.useMock) return;
    setState({ kind: "checking" });
    api
      .health()
      .then((health) => setState({ kind: "ok", health }))
      .catch(() => setState({ kind: "down" }));
  }, []);

  useEffect(check, [check]);

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
      {state.kind === "mock" ? (
        <span className="flex items-center gap-1.5 text-warn-fg">
          <Icon name="AlertTriangle" size={14} aria-hidden /> Mock mode: scripted fictional data, no backend needed
        </span>
      ) : state.kind === "checking" ? (
        <span className="flex items-center gap-1.5 text-text-muted">
          <Icon name="Activity" size={14} className="blink" aria-hidden /> Checking the backend...
        </span>
      ) : state.kind === "ok" ? (
        <span className="flex items-center gap-1.5 text-ok-fg">
          <Icon name="Server" size={14} aria-hidden /> Backend available (v{state.health.version})
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1.5 text-bad-fg">
            <Icon name="ServerOff" size={14} aria-hidden /> Backend not reachable
          </span>
          <span className="font-normal text-text-muted">
            Tried <code className="mono">{env.apiBaseUrl}</code>. Start it with <code className="mono">make backend</code>, then check again.
          </span>
          <Button size="sm" onClick={check}>
            Check again
          </Button>
        </>
      )}
    </div>
  );
}

/** First screen: what Sarvam does differently, and the intake form. */
export function Landing() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  useEffect(() => setHistory(readHistory()), []);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 py-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col">
        <div>
          <p className="label mb-2">Evidence-first research agent</p>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight">Research that knows when it isn&apos;t done.</h1>
          <p className="mt-3 max-w-xl text-lg text-text-muted">
            Ask a question. Watch the plan, the evidence, the contradictions and the challenges unfold, then read a report where
            every sentence traces back to a stored passage.
          </p>
          <section aria-labelledby="moments-h" className="mt-8">
            <h2 id="moments-h" className="label mb-3">
              What you will see
            </h2>
            <ol className="grid gap-3 sm:grid-cols-2">
              {MOMENTS.map((m) => (
                <Card as="li" pad="sm" key={m.title}>
                  <p className="flex items-center gap-2 font-semibold">
                    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded bg-brand/10 text-brand">
                      <Icon name={m.icon} size={16} aria-hidden />
                    </span>
                    {m.title}
                  </p>
                  <p className="mt-1 text-base text-text-muted">{m.text}</p>
                </Card>
              ))}
            </ol>
          </section>
        </div>
        <div className="mt-auto pt-8">
          <BackendStatus />
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Card pad="md" className="shadow-sm">
          <RunForm />
        </Card>

        {history.length > 0 ? (
          <Card as="section" pad="md" aria-labelledby="recent-h">
            <h2 id="recent-h" className="label mb-3">
              Recent runs (this browser)
            </h2>
            <ul className="flex flex-col gap-3">
              {history.map((h) => (
                <li key={h.id} className="group">
                  <a href={`#/run/${encodeURIComponent(h.id)}`} className="block transition-colors">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge>{h.mode}</Badge>
                      <span className="text-sm text-text-muted">{h.startedAt.split("T")[0]}</span>
                    </div>
                    <p className="line-clamp-2 font-medium transition-colors group-hover:text-brand">{h.question}</p>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
