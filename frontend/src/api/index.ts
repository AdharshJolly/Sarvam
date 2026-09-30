import { env } from "../config/env";
import { mockApi, openMockStream } from "../mocks/mockRuntime";
import { type RunApi, realApi } from "./client";
import { type OpenStream, openRealStream } from "./sse";

/** One switch (VITE_USE_MOCK=1) swaps the whole transport; components never know which one they use. */
export const runApi: RunApi = env.useMock ? mockApi : realApi;
export const openStream: OpenStream = env.useMock ? openMockStream : openRealStream;
