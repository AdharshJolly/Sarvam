/** Tiny restricted-Markdown parser for report views (S4). Output is a data tree; React renders it as text nodes. */

export type Certainty = "supported" | "contested" | "single-origin" | "assumed";
const CERTAINTIES: readonly string[] = ["supported", "contested", "single-origin", "assumed"];

export type Inline =
  | { t: "text"; text: string }
  | { t: "bold"; children: Inline[] }
  | { t: "cite"; id: string }
  | { t: "certainty"; value: Certainty };

export type ReportNode =
  | { type: "heading"; level: 1 | 2 | 3; inline: Inline[] }
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] };

const TOKEN = /\[(C\d+)\]|\{\{certainty:([^}]*)\}\}|\*\*([^*]+)\*\*/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const pushText = (s: string) => {
    if (s) out.push({ t: "text", text: s });
  };
  for (const m of src.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    pushText(src.slice(last, at));
    last = at + m[0].length;
    if (m[1]) out.push({ t: "cite", id: m[1] });
    else if (m[2] !== undefined) {
      const v = m[2].trim();
      // Unknown certainty values are dropped rather than shown as raw markers.
      if (CERTAINTIES.includes(v)) out.push({ t: "certainty", value: v as Certainty });
    } else if (m[3] !== undefined) out.push({ t: "bold", children: parseInline(m[3]) });
  }
  pushText(src.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const isTableRow = (line: string) => line.trim().startsWith("|");

export function parseReport(markdown: string): ReportNode[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReportNode[] = [];
  let para: string[] = [];
  let i = 0;
  const flush = () => {
    if (para.length) nodes.push({ type: "paragraph", inline: parseInline(para.join(" ")) });
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (line.trim() === "") {
      flush();
      i++;
    } else if (h) {
      flush();
      nodes.push({ type: "heading", level: (h[1]?.length ?? 1) as 1 | 2 | 3, inline: parseInline(h[2] ?? "") });
      i++;
    } else if (/^\s*-\s+/.test(line)) {
      flush();
      const items: Inline[][] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i] ?? "")) {
        items.push(parseInline((lines[i] ?? "").replace(/^\s*-\s+/, "")));
        i++;
      }
      nodes.push({ type: "list", items });
    } else if (isTableRow(line) && isTableSep(lines[i + 1] ?? "")) {
      flush();
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        rows.push(splitRow(lines[i] ?? "").map(parseInline));
        i++;
      }
      nodes.push({ type: "table", header, rows });
    } else {
      para.push(line.trim());
      i++;
    }
  }
  flush();
  return nodes;
}

/** All distinct citation ids referenced anywhere in the tree, in first-seen order. */
export function collectCitationIds(nodes: ReportNode[]): string[] {
  const seen = new Set<string>();
  const walk = (inl: Inline[]) => {
    for (const n of inl) {
      if (n.t === "cite") seen.add(n.id);
      else if (n.t === "bold") walk(n.children);
    }
  };
  for (const n of nodes) {
    if (n.type === "heading" || n.type === "paragraph") walk(n.inline);
    else if (n.type === "list") n.items.forEach(walk);
    else {
      n.header.forEach(walk);
      n.rows.forEach((r) => r.forEach(walk));
    }
  }
  return [...seen];
}

/** Ids cited in the text that have no entry in the citation list (contract-violation signal). */
export function unresolvedCitations(ids: string[], resolvable: Iterable<string>): string[] {
  const ok = new Set(resolvable);
  return ids.filter((id) => !ok.has(id));
}
