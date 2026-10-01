import type { Mode } from "@contracts/types";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { clearDraft, peekDraft } from "../lib/digDeeper";
import { CANONICAL_QUESTION } from "../mocks/scenarios";
import { errorText, useSession } from "../state/useRunSession";
import { Banner } from "./ui/Banner";
import { Button } from "./ui/Button";
import { Icon, type IconName } from "./ui/Icon";
import { Input } from "./ui/input";

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

export function RunForm() {
  const { start } = useSession();
  // A "Dig deeper" click leaves a draft here; it is read without consuming so a double render keeps it.
  const [draft, setDraft] = useState(peekDraft);
  const [question, setQuestion] = useState(draft?.question ?? "");
  const [geography, setGeography] = useState(draft?.scope.geography ?? "");
  const [horizon, setHorizon] = useState(draft?.scope.time_horizon ?? "");
  const [constraints, setConstraints] = useState(draft?.scope.constraints ?? "");
  const [mode, setMode] = useState<Mode>("LIVE");
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const questionRef = useRef<HTMLInputElement>(null);

  // The recording matches the canonical question with an empty scope; anything else is a replay miss.
  const chooseMode = (next: Mode) => {
    setMode(next);
    if (next === "REPLAY") {
      setQuestion(CANONICAL_QUESTION);
      setGeography("");
      setHorizon("");
      setConstraints("");
      setFieldError(null);
    }
  };
  const replayMiss = mode === "REPLAY" && (question.trim() !== CANONICAL_QUESTION || !!(geography || horizon || constraints).trim());

  // Debounced search animation while typing
  useEffect(() => {
    if (question.trim()) {
      setIsLoading(true);
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    }
    setIsLoading(false);
  }, [question]);

  const submit = async (e?: FormEvent) => {
    if (e) e.preventDefault();
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
      clearDraft();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-label="Start a research run">
      <div className="flex items-center justify-between pb-3 border-b border-border-hairline">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text">Start a research run</h2>
          <p className="text-sm text-text-muted mt-0.5">Formulate a question for autonomous evidence synthesis</p>
        </div>
      </div>

      {draft ? (
        <Banner tone="info">
          <span>
            Prefilled from a gap in run <span className="mono">{draft.fromRunId}</span>. Review the question, then press
            Start run. This starts a new run, and a live run uses search and model credits.{" "}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => {
                clearDraft();
                setDraft(null);
                setQuestion("");
              }}
            >
              Discard
            </button>
          </span>
        </Banner>
      ) : null}

      {/* Main Question Animated Search Bar */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="question" className="label text-text-muted">
            Research question <span className="text-bad-fg">*</span>
          </label>
          <span id="question-count" className="mono text-sm text-text-muted">
            {question.length}/{MAX_QUESTION}
          </span>
        </div>

        <div className="relative flex items-center">
          <Input
            id="question"
            ref={questionRef}
            type="search"
            maxLength={MAX_QUESTION}
            value={question}
            placeholder="What do you need to know, and what decision does it feed?"
            onKeyDown={handleKeyDown}
            onChange={(e) => {
              setQuestion(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            className={`peer pe-4 ps-10 h-11 text-sm bg-surface transition-all ${
              fieldError ? "border-bad-fg ring-2 ring-bad-fg/20" : ""
            }`}
            aria-required="true"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "question-error question-count" : "question-count"}
          />
          <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center justify-center ps-3 text-text-muted peer-disabled:opacity-50">
            {isLoading ? (
              <Icon
                name="LoaderCircle"
                size={18}
                className="animate-spin text-brand-secondary"
                aria-hidden
              />
            ) : (
              <Icon name="Search" size={18} aria-hidden />
            )}
          </div>
        </div>

        {fieldError ? (
          <p id="question-error" role="alert" className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-bad-fg">
            <Icon name="XOctagon" size={14} aria-hidden /> {fieldError}
          </p>
        ) : null}
      </div>

      {/* Suggested Templates */}
      <div className="flex flex-col gap-2">
        <span className="label text-text-muted">
          Try example questions:
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {EXAMPLES.map((x) => (
            <button
              key={x.label}
              type="button"
              className="inline-flex items-center rounded-lg border border-border-hairline bg-surface px-3 py-1.5 text-sm font-medium text-text-muted transition-all hover:border-brand-secondary hover:text-brand-secondary hover:bg-surface-2 active:scale-98 pointer-coarse:min-h-11"
              onClick={() => {
                setQuestion(x.q);
                setFieldError(null);
              }}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scope Parameters */}
      <div className="rounded-xl border border-border-hairline bg-surface-2/40 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="label text-text-muted">
            Scope &amp; Constraints
          </span>
          <span className="text-sm text-text-muted">Optional search steer</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="geography" className="label">
              Geography
            </label>
            <Input
              id="geography"
              value={geography}
              placeholder="e.g. Bengaluru"
              onChange={(e) => setGeography(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="horizon" className="label">
              Time horizon
            </label>
            <Input
              id="horizon"
              value={horizon}
              placeholder="e.g. 2027"
              onChange={(e) => setHorizon(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="constraints" className="label">
              Constraints
            </label>
            <Input
              id="constraints"
              value={constraints}
              placeholder="e.g. under 50 lakh"
              onChange={(e) => setConstraints(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Mode Selector */}
      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-1">
          Execution Mode
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const selected = mode === m.mode;
            return (
              <label
                key={m.mode}
                className={`relative flex cursor-pointer flex-col rounded-xl border p-4 transition-all select-none ${
                  selected
                    ? "border-brand-secondary bg-brand-secondary/10 shadow-elevation ring-1 ring-brand-secondary"
                    : "border-border-hairline bg-surface hover:border-border-strong hover:bg-surface-2"
                }`}
              >
                <input type="radio" name="mode" className="sr-only" checked={selected} onChange={() => chooseMode(m.mode)} />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-text">
                    {m.mode}
                  </span>
                  {selected ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-secondary text-on-brand">
                      <Icon name="Check" size={13} aria-hidden />
                    </span>
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-border-strong" />
                  )}
                </div>
                <span className="mt-2 text-sm leading-relaxed text-text-muted">{m.text}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {replayMiss ? (
        <Banner tone="warn">
          REPLAY only has the recorded canonical question with an empty scope. This question or scope was never recorded,
          so the run will stop with an error. Use the canonical example, or switch to LIVE.
        </Banner>
      ) : null}

      {error ? <Banner tone="bad">{error}</Banner> : null}

      <div className="pt-1">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={busy}
          className="w-full sm:w-auto min-w-[180px] shadow-elevation transition-all font-semibold"
          icon={<Icon name={busy ? "Activity" : "ArrowRight"} size={18} className={busy ? "blink" : undefined} aria-hidden />}
        >
          {busy ? "Starting run..." : "Start run"}
        </Button>
      </div>
    </form>
  );
}
