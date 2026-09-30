export interface QuoteSegment {
  text: string;
  mark: boolean;
}

export interface QuoteHighlight {
  segments: QuoteSegment[];
  located: boolean;
}

/** Lowercase, curly quotes to ASCII, collapse whitespace; returns text plus map back to original offsets. */
function normalise(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = s.charAt(i);
    if (ch === "‘" || ch === "’") ch = "'";
    else if (ch === "“" || ch === "”") ch = '"';
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      norm += " ";
      map.push(i);
      lastSpace = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      lastSpace = false;
    }
  }
  return { norm, map };
}

function split(text: string, start: number, end: number): QuoteSegment[] {
  const out: QuoteSegment[] = [];
  if (start > 0) out.push({ text: text.slice(0, start), mark: false });
  out.push({ text: text.slice(start, end), mark: true });
  if (end < text.length) out.push({ text: text.slice(end), mark: false });
  return out;
}

/** Server offsets first; normalised client-side search second; otherwise unmarked with located=false. */
export function highlightRanges(
  passageText: string,
  quoteStart: number | null | undefined,
  quoteEnd: number | null | undefined,
  quote: string,
): QuoteHighlight {
  if (
    quoteStart != null &&
    quoteEnd != null &&
    quoteStart >= 0 &&
    quoteEnd > quoteStart &&
    quoteEnd <= passageText.length
  ) {
    return { segments: split(passageText, quoteStart, quoteEnd), located: true };
  }
  const q = normalise(quote).norm.trim();
  if (q.length > 0) {
    const { norm, map } = normalise(passageText);
    const at = norm.indexOf(q);
    if (at >= 0) {
      const start = map[at];
      const lastIdx = map[at + q.length - 1];
      if (start !== undefined && lastIdx !== undefined) {
        return { segments: split(passageText, start, lastIdx + 1), located: true };
      }
    }
  }
  return { segments: [{ text: passageText, mark: false }], located: false };
}
