import type { Mode } from "@contracts/types";
import { type FormEvent, useRef, useState } from "react";
import { CANONICAL_QUESTION } from "../mocks/scenarios";
import { errorText, useSession } from "../state/useRunSession";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Icon, type IconName } from "./ui/Icon";

const EXAMPLES = [
  { label: "Canonical (Bengaluru scooters)", q: CANONICAL_QUESTION },
  { label: "EV fleet market", q: "Should we enter the Indian EV fleet market in 2027?" },
  { label: "Solar rooftop pricing", q: "What do residential rooftop solar systems cost in Karnataka and is demand growing?" },
];

const MODES: Array<{ mode: Mode; icon: IconName; text: string }> = [
  {
    mode: "LIVE",
    icon: "Activity",
    text: "Runs the real pipeline now: searches the web and calls the model. Usually takes several minutes.",
  },
  {
    mode: "REPLAY",
    icon: "RotateCcw",
    text: "Replays a recorded run: no network, no cost, works offline. Only questions recorded earlier can be replayed; anything else stops with a clear error.",
  },
];

const MAX_QUESTION = 2000;
const FIELD =
  "w-full rounded-md border border-border-strong bg-surface p-2 text-base text-text placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-brand-secondary";

export function RunForm() {
  const { start } = useSession();
  const [question, setQuestion] = useState("");
  const [geography, setGeography] = useState("");
  const [horizon, setHorizon] = useState("");
  const [constraints, setConstraints] = useState("");
  const [mode, setMode] = useState<Mode>("LIVE");
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const questionRef = useRef<HTMLTextAreaElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) {
      // The error belongs to the field: say it there and put the cursor in it.
      setFieldError("Enter a research question before starting a run.");
      questionRef.current?.focus();
      return;
    }
    setBusy(true);
    setFieldError(null);
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

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Start a research run">
      <h2 className="text-xl font-semibold">Start a research run</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="question" className="label">
          Research question
        </label>
        <textarea
          id="question"
          ref={questionRef}
          className={`${FIELD} ${fieldError ? "border-bad-fg" : ""}`}
          rows={4}
          maxLength={MAX_QUESTION}
          value={question}
          placeholder="What do you need to know, and what decision does it feed?"
          onChange={(e) => {
            setQuestion(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          aria-required="true"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "question-error question-count" : "question-count"}
        />
        <div className="flex items-start justify-between gap-3">
          {fieldError ? (
            <p id="question-error" role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-bad-fg">
              <Icon name="XOctagon" size={14} aria-hidden /> {fieldError}
            </p>
          ) : (
            <span />
          )}
          <span id="question-count" className="mono shrink-0 text-sm text-text-muted">
            {question.length}/{MAX_QUESTION}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-text-muted">Try:</span>
        {EXAMPLES.map((x) => (
          <button
            key={x.label}
            type="button"
            className="rounded-full border border-border-strong px-3 py-0.5 text-sm transition-colors hover:border-brand-secondary pointer-coarse:min-h-11"
            onClick={() => {
              setQuestion(x.q);
              setFieldError(null);
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="geography" className="label">
            Geography
          </label>
          <input id="geography" className={FIELD} value={geography} placeholder="e.g. Bengaluru" onChange={(e) => setGeography(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="horizon" className="label">
            Time horizon
          </label>
          <input id="horizon" className={FIELD} value={horizon} placeholder="e.g. 2027" onChange={(e) => setHorizon(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="constraints" className="label">
            Constraints
          </label>
          <input
            id="constraints"
            className={FIELD}
            value={constraints}
            placeholder="e.g. under 50 lakh"
            onChange={(e) => setConstraints(e.target.value)}
          />
        </div>
      </div>
      <p className="-mt-2 text-sm text-text-muted">Geography, horizon and constraints are optional and steer the search.</p>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="label mb-1">Mode</legend>
        {MODES.map((m) => {
          const selected = mode === m.mode;
          return (
            <label
              key={m.mode}
              className={`cursor-pointer rounded-md border p-3 transition-colors ${
                selected
                  ? "border-brand-secondary bg-brand-secondary/10 ring-1 ring-brand-secondary"
                  : "border-border-strong hover:bg-surface-2"
              }`}
            >
              <input type="radio" name="mode" className="sr-only" checked={selected} onChange={() => setMode(m.mode)} />
              <span className="flex items-center gap-1.5 font-semibold">
                <Icon name={m.icon} size={16} aria-hidden /> {m.mode}
                {selected ? <Icon name="Check" size={16} className="ml-auto text-brand-secondary" aria-hidden /> : null}
              </span>
              <span className="mt-1 block text-sm text-text-muted">{m.text}</span>
            </label>
          );
        })}
      </fieldset>

      {error ? <Banner tone="bad">{error}</Banner> : null}

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
