export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000",
  useMock: (import.meta.env.VITE_USE_MOCK as string | undefined) === "1",
} as const;
