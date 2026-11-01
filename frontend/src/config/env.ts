/** Build-time constant (Vite inlines it), so a production build drops the mock code entirely. */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "1";

export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://127.0.0.1:8000",
} as const;
