import type { RunCreate } from "@contracts/types";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import { ApiError } from "../api/client";
import { openStream, runApi } from "../api";
import { parseRoute } from "../lib/route";
import { type RunView, initialView, reduce } from "./runStore";

export function runIdFromHash(hash: string): string | null {
  return parseRoute(hash).runId;
}

export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.detail ?? err.message;
  return err instanceof Error ? err.message : String(err);
}

export interface Session {
  view: RunView;
  runId: string | null;
  error: string | null;
  stopping: boolean;
  hydrating: boolean;
  start: (body: RunCreate) => Promise<void>;
  stop: () => Promise<void>;
  reattach: () => void;
  newRun: () => void;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession must be used inside SessionProvider");
  return s;
}

function useRunSessionState(): Session {
  const [view, dispatch] = useReducer(reduce, initialView);
  const [runId, setRunId] = useState<string | null>(() => runIdFromHash(window.location.hash));
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [hydrating, setHydrating] = useState(false);

  useEffect(() => {
    const onHash = () => setRunId(runIdFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Hydrate from /state, then stream from the last event id (F2). The flag guards StrictMode double effects.
  useEffect(() => {
    dispatch({ type: "reset" });
    setError(null);
    setStopping(false);
    if (!runId) {
      setHydrating(false);
      return;
    }
    setHydrating(true);
    let cancelled = false;
    let stream: { close: () => void } | null = null;
    runApi
      .getState(runId)
      .then((state) => {
        if (cancelled) return;
        setHydrating(false);
        dispatch({ type: "hydrate", state });
        stream = openStream(
          runId,
          {
            onEvent: (event) => dispatch({ type: "event", event }),
            onState: (s) => dispatch({ type: "connection", state: s }),
          },
          0,
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHydrating(false);
          setError(errorText(err));
        }
      });
    return () => {
      cancelled = true;
      stream?.close();
    };
  }, [runId, attempt]);

  // Budget meters: poll RunSummary every 2 s while running, and once per phase change / status change (F6).
  const status = view.run?.status;
  const running = status === "queued" || status === "running";
  const phase = view.phase;
  useEffect(() => {
    if (!runId || !status) return;
    let cancelled = false;
    const poll = () => {
      runApi
        .getRun(runId)
        .then((summary) => {
          if (!cancelled) dispatch({ type: "summary", summary });
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(errorText(err));
        });
    };
    poll();
    if (!running) return () => void (cancelled = true);
    const t = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [runId, status, running, phase]);

  const start = useCallback(async (body: RunCreate) => {
    const run = await runApi.createRun(body); // errors surface in the form
    try {
      const history = JSON.parse(localStorage.getItem("sarvam-runs") || "[]");
      history.unshift({ id: run.id, question: run.question, startedAt: run.started_at, mode: run.mode });
      localStorage.setItem("sarvam-runs", JSON.stringify(history.slice(0, 20)));
    } catch {
      // ignore
    }
    window.location.hash = `#/run/${encodeURIComponent(run.id)}`;
    setRunId(run.id);
  }, []);

  const stop = useCallback(async () => {
    if (!runId) return;
    setStopping(true);
    try {
      const summary = await runApi.stopRun(runId);
      dispatch({ type: "summary", summary });
    } catch (err) {
      setStopping(false);
      setError(errorText(err));
    }
  }, [runId]);

  const reattach = useCallback(() => setAttempt((n) => n + 1), []);
  const newRun = useCallback(() => {
    window.location.hash = "";
    setRunId(null);
  }, []);

  return useMemo(
    () => ({ view, runId, error, stopping, hydrating, start, stop, reattach, newRun }),
    [view, runId, error, stopping, hydrating, start, stop, reattach, newRun],
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useRunSessionState();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
