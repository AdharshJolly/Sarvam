import type { ClaimEvidence } from "@contracts/types";
import { useEffect, useState } from "react";
import { runApi } from "../api";
import { errorText } from "./useRunSession";

export type EvidenceLoad =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; data: ClaimEvidence };

const cache = new Map<string, ClaimEvidence>();

/** Fetches a claim's stored evidence through the API client, cached per run and claim id. */
export function useClaimEvidence(runId: string | null, claimId: string | null): { load: EvidenceLoad; retry: () => void } {
  const key = `${runId}:${claimId}`;
  const [tick, setTick] = useState(0);
  const [load, setLoad] = useState<EvidenceLoad>(() => {
    const hit = cache.get(key);
    return hit ? { status: "ok", data: hit } : { status: "loading" };
  });

  useEffect(() => {
    if (!runId || !claimId) return;
    const hit = cache.get(key);
    if (hit) {
      setLoad({ status: "ok", data: hit });
      return;
    }
    let cancelled = false;
    setLoad({ status: "loading" });
    runApi
      .getClaim(runId, claimId)
      .then((data) => {
        cache.set(key, data);
        if (!cancelled) setLoad({ status: "ok", data });
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: "error", message: errorText(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, runId, claimId, tick]);

  return { load, retry: () => setTick((n) => n + 1) };
}
