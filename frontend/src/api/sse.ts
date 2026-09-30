import type { Event } from "@contracts/types";
import { env } from "../config/env";
import { apiUrl, routes } from "./url";

export type ConnectionState = "connecting" | "open" | "closed";

export interface RunEventStream {
  close: () => void;
}

export interface StreamHandlers {
  onEvent: (event: Event) => void;
  onState?: (state: ConnectionState) => void;
}

/** Same signature for the real stream and the mock stream. */
export type OpenStream = (runId: string, handlers: StreamHandlers, after?: number) => RunEventStream;

/**
 * Subscribe to a run's event stream (SSOT section 11). The server sends unnamed `data:` messages with
 * `id:`, so `onmessage` receives everything. Native EventSource reconnects and sends Last-Event-ID;
 * `after` resumes the first connect after hydrating from /state (EventSource cannot set headers).
 */
export const openRealStream: OpenStream = (runId, handlers, after) => {
  const q = after !== undefined ? `?after=${after}` : "";
  const es = new EventSource(apiUrl(env.apiBaseUrl, routes.events(runId)) + q);
  handlers.onState?.("connecting");
  es.onopen = () => handlers.onState?.("open");
  es.onerror = () => handlers.onState?.(es.readyState === EventSource.CLOSED ? "closed" : "connecting");
  es.onmessage = (m: MessageEvent<string>) => {
    try {
      handlers.onEvent(JSON.parse(m.data) as Event);
    } catch (err) {
      console.error("Sarvam: unparseable event frame", err);
    }
  };
  return {
    close: () => {
      es.close();
      handlers.onState?.("closed");
    },
  };
};
