import type { Mode } from "@contracts/types";
import { type FormEvent, useState } from "react";
import { CANONICAL_QUESTION } from "../mocks/scenarios";
import { errorText, useSession } from "../state/useRunSession";
import { Icon } from "./ui/Icon";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";

const EXAMPLES = [
  { label: "Canonical (Bengaluru scooters)", q: CANONICAL_QUESTION },
  { label: "EV fleet market", q: "Should we enter the Indian EV fleet market in 2027?" },
  { label: "Solar rooftop pricing", q: "What do residential rooftop solar systems cost in Karnataka and is demand growing?" },
];

export function RunForm() {
  const { start } = useSession();
  const [question, setQuestion] = useState("");
  const [geography, setGeography] = useState("");
  const [horizon, setHorizon] = useState("");
  const [constraints, setConstraints] = useState("");
  const [mode, setMode] = useState<Mode>("LIVE");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      setError("Enter a research question.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await start({
        question: question.trim(),
        mode,
        scope: {
          geography: geography.trim() || null,
          time_horizon: horizon.trim() || null,
          constraints: constraints.trim() || null,
        },
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const fieldClasses = "w-full rounded-md border border-border-strong bg-surface p-2 text-base text-text focus-visible:outline-brand-secondary focus-visible:outline-2";
  
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Start a research run">
      <h2 className="text-xl font-semibold">Start a research run</h2>
      <label className="flex flex-col gap-1">
        <span className="label">Research question</span>
        <textarea
          className={fieldClasses}
          rows={4}
          maxLength={2000}
          value={question}
          placeholder="What do you need to know, and what decision does it feed?"
          onChange={(e) => setQuestion(e.target.value)}
          aria-required="true"
        />
        <span className="mono self-end text-text-muted text-sm">
          {question.length}/2000
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-muted">
          Try:
        </span>
        {EXAMPLES.map((x) => (
          <button key={x.label} type="button" className="rounded-full border border-border-strong px-3 py-0.5 text-sm hover:border-brand-secondary transition-colors" onClick={() => setQuestion(x.q)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="label">Geography</span>
          <input className={fieldClasses} value={geography} placeholder="optional" onChange={(e) => setGeography(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Time horizon</span>
          <input className={fieldClasses} value={horizon} placeholder="optional" onChange={(e) => setHorizon(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Constraints</span>
          <input className={fieldClasses} value={constraints} placeholder="optional" onChange={(e) => setConstraints(e.target.value)} />
        </label>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="label mb-1">Mode</legend>
        <label
          className={`cursor-pointer rounded-md border p-3 transition-colors ${mode === "LIVE" ? "border-brand-secondary border-2 bg-brand-secondary/10" : "border-border-hairline border"}`}
        >
          <input type="radio" name="mode" className="sr-only" checked={mode === "LIVE"} onChange={() => setMode("LIVE")} />
          <span className="block font-semibold flex items-center gap-1.5"><Icon name="Activity" size={16} aria-hidden /> LIVE</span>
          <span className="block text-sm text-text-muted mt-1">
            Searches and reads the web now.
          </span>
        </label>
        <label
          className={`cursor-pointer rounded-md border p-3 transition-colors ${mode === "REPLAY" ? "border-brand-secondary border-2 bg-brand-secondary/10" : "border-border-hairline border"}`}
        >
          <input type="radio" name="mode" className="sr-only" checked={mode === "REPLAY"} onChange={() => setMode("REPLAY")} />
          <span className="block font-semibold flex items-center gap-1.5"><Icon name="RotateCcw" size={16} aria-hidden /> REPLAY</span>
          <span className="block text-sm text-text-muted mt-1">
            Uses recorded results, works offline.
          </span>
        </label>
      </fieldset>
      {error ? (
        <Banner tone="bad">
          {error}
        </Banner>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy}
        className="w-fit"
        icon={<Icon name={busy ? "Activity" : "ArrowRight"} size={18} className={busy ? "blink" : undefined} aria-hidden />}
      >
        {busy ? "Starting run..." : "Start run"}
      </Button>
    </form>
  );
}
