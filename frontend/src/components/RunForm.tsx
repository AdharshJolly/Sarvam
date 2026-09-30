import type { Mode } from "@contracts/types";
import { type FormEvent, useState } from "react";
import { CANONICAL_QUESTION } from "../mocks/scenarios";
import { errorText, useSession } from "../state/useRunSession";

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

  const field = "w-full rounded border p-2 text-base";
  const fs = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
  return (
    <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-3" aria-label="Start a research run">
      <h2 className="text-xl font-semibold">Start a research run</h2>
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Research question</span>
        <textarea
          className={field}
          style={fs}
          rows={4}
          maxLength={2000}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          aria-required="true"
        />
      </label>
      <button
        type="button"
        className="w-fit rounded border px-3 py-1 text-base"
        style={{ borderColor: "var(--border)" }}
        onClick={() => setQuestion(CANONICAL_QUESTION)}
      >
        Use canonical question
      </button>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span>Geography (optional)</span>
          <input className={field} style={fs} value={geography} onChange={(e) => setGeography(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span>Time horizon (optional)</span>
          <input className={field} style={fs} value={horizon} onChange={(e) => setHorizon(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span>Constraints (optional)</span>
          <input className={field} style={fs} value={constraints} onChange={(e) => setConstraints(e.target.value)} />
        </label>
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="font-semibold">Mode</legend>
        <label>
          <input type="radio" name="mode" checked={mode === "LIVE"} onChange={() => setMode("LIVE")} /> LIVE: searches
          and reads the web now
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === "REPLAY"} onChange={() => setMode("REPLAY")} /> REPLAY: uses
          recorded results, works offline
        </label>
      </fieldset>
      {error ? (
        <p role="alert" style={{ color: "var(--bad)" }}>
          {"✕"} {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded px-4 py-2 text-base font-semibold"
        style={{ background: "var(--accent)", color: "var(--bg)", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? "Starting run..." : "Start run"}
      </button>
    </form>
  );
}
