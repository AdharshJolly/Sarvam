import type { ReactNode } from "react";
import type { Inline, ReportNode } from "../../lib/reportMarkdown";
import { Icon } from "../ui/Icon";
import { StateChip } from "../ui/StateChip";
import { certaintyChip } from "../ui/chips";

const warned = new Set<string>();

export function headingId(index: number): string {
  return `heading-${index}`;
}

export function Inlines({ nodes, resolvable, onCite }: { nodes: Inline[]; resolvable: Set<string>; onCite: (id: string) => void }): ReactNode {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return <span key={i}>{n.text}</span>;
      case "bold":
        return (
          <strong key={i}>
            <Inlines nodes={n.children} resolvable={resolvable} onCite={onCite} />
          </strong>
        );
      case "certainty":
        return (
          <span key={i} className="mx-1 align-middle">
            <StateChip spec={certaintyChip(n.value)} />
          </span>
        );
      case "cite":
        if (!resolvable.has(n.id)) {
          if (!warned.has(n.id)) {
            warned.add(n.id);
            console.error(`Sarvam: report cites ${n.id} which is missing from citations (contract violation)`);
          }
          return (
            <span key={i} title="This citation id is not in the report's citation list" className="text-warn-fg">
              [{n.id}] <Icon name="AlertTriangle" size={14} className="inline" aria-hidden /> unresolved citation
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            className="mono mx-0.5 rounded-full border border-brand/30 bg-accent/60 px-2 py-0.5 text-sm font-semibold text-brand transition-all hover:bg-brand hover:text-white"
            aria-label={`Open evidence for claim ${n.id}`}
            onClick={() => onCite(n.id)}
          >
            {n.id}
          </button>
        );
    }
  });
}

const HEADING = { 1: "text-3xl", 2: "text-2xl", 3: "text-xl" } as const;

/** The report as a reading column: Newsreader at about 70 characters, headings that can be jumped to. */
export function ReportBody({ nodes, resolvable, onCite }: { nodes: ReportNode[]; resolvable: Set<string>; onCite: (id: string) => void }) {
  const inl = (x: Inline[]) => <Inlines nodes={x} resolvable={resolvable} onCite={onCite} />;
  return (
    <div className="font-display max-w-[70ch] text-lg leading-relaxed">
      {nodes.map((n, i) => {
        switch (n.type) {
          case "heading": {
            const cls = n.level === 1 ? HEADING[1] : n.level === 2 ? HEADING[2] : HEADING[3];
            return (
              <h3 key={i} id={headingId(i)} className={`${cls} mt-8 scroll-mt-20 font-semibold leading-snug first:mt-0`}>
                {inl(n.inline)}
              </h3>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="my-3">
                {inl(n.inline)}
              </p>
            );
          case "list":
            return (
              <ul key={i} className="my-3 list-disc pl-6">
                {n.items.map((it, j) => (
                  <li key={j} className="my-1">
                    {inl(it)}
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="my-4 overflow-x-auto font-sans text-base">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      {n.header.map((h, j) => (
                        <th key={j} className="border-b border-border-strong p-2 font-semibold">
                          {inl(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {n.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} className="border-b border-border-hairline p-2 align-top">
                            {inl(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
