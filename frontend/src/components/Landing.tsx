import { useEffect, useState } from "react";
import { RunForm } from "./RunForm";
import { Icon } from "./ui/Icon";
import type { IconName } from "./ui/Icon";

import { api, type Health } from "../api/client";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";

const MOMENTS: Array<{ icon: IconName; title: string; text: string }> = [
  { icon: "Grid", title: "Coverage matrix", text: "See exactly where Sarvam is confident and where it is not, cell by cell." },
  { icon: "ArrowRight", title: "Independence collapse", text: "Nine sources that copy one press release count as one origin." },
  { icon: "Quote", title: "Claim to passage", text: "Every claim links to the stored passage and the exact quote." },
  { icon: "Square", title: "Stop decision", text: "Sarvam explains why it stopped, what is missing and what could change the answer." },
];

export interface HistoryEntry {
  id: string;
  question: string;
  startedAt: string;
  mode: string;
}

/** First screen: what Sarvam does differently, and the intake form. */
export function Landing() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("sarvam-runs");
      if (stored) setHistory(JSON.parse(stored));
    } catch {
      // ignore
    }

    let mounted = true;
    api.health()
      .then(h => { if (mounted) setHealth(h); })
      .catch(() => { if (mounted) setHealth(null); });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="mx-auto grid max-w-6xl gap-8 py-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col">
        <div>
          <p className="label mb-2">Sarvam</p>
          <h2 className="font-display text-4xl font-bold leading-tight tracking-tight">Research that knows when it isn&apos;t done.</h2>
          <p className="mt-3 max-w-xl text-lg text-text-muted">
            Ask a question. Watch the plan, the evidence, the contradictions and the challenges unfold, then read a report where
            every sentence traces back to a stored passage.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {MOMENTS.map((m) => (
              <Card as="li" pad="sm" key={m.title}>
                <p className="flex items-center gap-2 font-semibold">
                  <span aria-hidden="true" className="mono flex h-7 w-7 items-center justify-center rounded bg-brand/10 text-brand">
                    <Icon name={m.icon} size={16} aria-hidden />
                  </span>
                  {m.title}
                </p>
                <p className="mt-1 text-base text-text-muted">
                  {m.text}
                </p>
              </Card>
            ))}
          </ul>
        </div>
        <div className="mt-auto pt-8">
          {health ? (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ok-fg">
              <Icon name="Server" size={14} /> Backend available ({health.version})
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-text-muted">
              <Icon name="ServerOff" size={14} /> Backend checking...
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-6 ">
        <Card pad="md" className="shadow-sm">
          <RunForm />
        </Card>
        
        {history.length > 0 ? (
          <Card pad="md">
            <h3 className="label mb-3">Recent runs (local)</h3>
            <ul className="flex flex-col gap-3">
              {history.map((h) => (
                <li key={h.id} className="group">
                  <a href={`#/run/${encodeURIComponent(h.id)}`} className="block transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge>{h.mode}</Badge>
                      <span className="text-xs text-text-muted">{h.startedAt.split('T')[0]}</span>
                    </div>
                    <p className="font-medium group-hover:text-brand transition-colors line-clamp-2">{h.question}</p>
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
