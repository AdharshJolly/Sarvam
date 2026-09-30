import type { Mode } from "@contracts/types";
import { type FormEvent, useState } from "react";
import { CANONICAL_QUESTION } from "../mocks/scenarios";
import { errorText, useSession } from "../state/useRunSession";

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

  const field = "w-full rounded-md border p-2 text-base";
  const fs = { borderColor: "var(--border-strong)", background: "var(--bg)", color: "var(--text)" };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="Start a research run">
      <h2 className="text-xl font-semibold">Start a research run</h2>
      <label className="flex flex-col gap-1">
        <span className="label">Research question</span>
        <textarea
          className={field}
          style={fs}
          rows={4}
          maxLength={2000}
          value={question}
          placeholder="What do you need to know, and what decision does it feed?"
          onChange={(e) => setQuestion(e.target.value)}
          aria-required="true"
        />
        <span className="mono self-end" style={{ color: "var(--text-muted)" }}>
          {question.length}/2000
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm" style={{ color: "var(--text-muted)" }}>
          Try:
        </span>
        {EXAMPLES.map((x) => (
          <button key={x.label} type="button" className="rounded-full border px-3 py-0.5 text-sm" style={{ borderColor: "var(--border-strong)" }} onClick={() => setQuestion(x.q)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="label">Geography</span>
          <input className={field} style={fs} value={geography} placeholder="optional" onChange={(e) => setGeography(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Time horizon</span>
          <input className={field} style={fs} value={horizon} placeholder="optional" onChange={(e) => setHorizon(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Constraints</span>
          <input className={field} style={fs} value={constraints} placeholder="optional" onChange={(e) => setConstraints(e.target.value)} />
        </label>
      </div>
      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="label mb-1">Mode</legend>
        {(
          [
            ["LIVE", "● LIVE", "Searches and reads the web now."],
            ["REPLAY", "↻ REPLAY", "Uses recorded results, works offline."],
          ] as const
        ).map(([m, title, text]) => (
          <label
            key={m}
            className="cursor-pointer rounded-md border p-3"
            style={{ borderColor: mode === m ? "var(--accent)" : "var(--border)", background: mode === m ? "var(--accent-bg)" : "transparent", borderWidth: mode === m ? 2 : 1 }}
          >
            <input type="radio" name="mode" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
            <span className="block font-semibold">{title}</span>
            <span className="block text-sm" style={{ color: "var(--text-muted)" }}>
              {text}
            </span>
          </label>
        ))}
      </fieldset>
      {error ? (
        <p role="alert" style={{ color: "var(--bad)" }}>
          {"✕"} {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="btn btn-primary w-fit px-5 py-2 text-base" style={{ opacity: busy ? 0.7 : 1 }}>
        {busy ? (
          <>
            <span className="blink">{"●"}</span> Starting run...
          </>
        ) : (
          "Start run →"
        )}
      </button>
    </form>
  );
}
