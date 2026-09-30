import type { Inline } from "../../lib/reportMarkdown";
import { onAnchorClick } from "../../lib/anchor";
import { Inlines, headingId } from "./ReportBody";

export interface ContentsEntry {
  index: number;
  level: number;
  inline: Inline[];
}

const LINK = "block transition-colors hover:text-brand";

/** Contents for the report: real links, but in-page jumps that leave the router's hash alone. */
export function ReportContents({ headings }: { headings: ContentsEntry[] }) {
  return (
    <nav aria-label="Report contents" className="no-print hidden xl:block">
      <div className="sticky top-20">
        <p className="label mb-2">Contents</p>
        <ul className="flex flex-col gap-1.5 text-base">
          {headings.map((h) => (
            <li key={h.index} className={h.level === 3 ? "pl-3" : ""}>
              <a
                href={`#${headingId(h.index)}`}
                onClick={onAnchorClick(headingId(h.index))}
                className={`${LINK} ${h.level === 3 ? "text-text-muted" : "text-text"}`}
              >
                <Inlines nodes={h.inline} resolvable={new Set()} onCite={() => undefined} />
              </a>
            </li>
          ))}
          <li className="mt-2 border-t border-border-hairline pt-2">
            <a href="#sources-cited" onClick={onAnchorClick("sources-cited")} className={`${LINK} text-text-muted`}>
              Sources cited
            </a>
          </li>
          <li>
            <a href="#method-metadata" onClick={onAnchorClick("method-metadata")} className={`${LINK} text-text-muted`}>
              Method and run metadata
            </a>
          </li>
        </ul>
      </div>
    </nav>
  );
}
