/** Pages the user adds to a live run (CL-20). The server checks again; this gives early, plain feedback. */

export const MAX_PINNED = 5; // RunCreate.pinned_urls max_length

export type PinnedParse = { urls: string[]; error: string | null };

/** One web address per line (blank lines ignored, repeats dropped). */
export function parsePinned(text: string): PinnedParse {
  const urls = [...new Set(text.split(/\s+/).map((u) => u.trim()).filter(Boolean))];
  for (const u of urls) {
    let ok = false;
    try {
      const parsed = new URL(u);
      ok = (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.hostname !== "";
    } catch {
      ok = false;
    }
    if (!ok) return { urls, error: `Not a web address: ${u.slice(0, 80)}. Start each line with https://` };
  }
  if (urls.length > MAX_PINNED) return { urls, error: `Add at most ${MAX_PINNED} pages (you have ${urls.length}).` };
  return { urls, error: null };
}
