/** Frontend runtime configuration. Only VITE_-prefixed variables are exposed to the client. */
export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000",
  useMock: (import.meta.env.VITE_USE_MOCK as string | undefined) === "1",
} as const;
