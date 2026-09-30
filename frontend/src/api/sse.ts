import type { Event } from "@contracts/types";
import { env } from "../config/env";
import { apiUrl, routes } from "./url";

export type ConnectionState = "connecting" | "open" | "closed";

export interface RunEventStream {
  close: () => void;
}

/**
 * Subscribe to a run's event stream (SSOT section 11). Native EventSource reconnects and sends
 * Last-Event-ID automatically, so the server can resume from the last seen event id.
 * The stream carries the canonical Event envelope from the generated contracts.
 */
export function openRunEvents(
  runId: string,
  handlers: {
    onEvent: (event: Event) => void;
    onState?: (state: ConnectionState) => void;
  },
): RunEventStream {
  const es = new EventSource(apiUrl(env.apiBaseUrl, routes.events(runId)));
  handlers.onState?.("connecting");
  es.onopen = () => handlers.onState?.("open");
  es.onerror = () => handlers.onState?.(es.readyState === EventSource.CLOSED ? "closed" : "connecting");
  // Server sends each event with `event: <type>`; a generic message handler covers unnamed ones.
  const parse = (m: MessageEvent<string>) => handlers.onEvent(JSON.parse(m.data) as Event);
  es.onmessage = parse;
  return {
    close: () => {
      es.close();
      handlers.onState?.("closed");
    },
  };
}
