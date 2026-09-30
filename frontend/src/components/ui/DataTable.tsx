import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Makes the column sortable. Numbers sort numerically, strings with locale compare. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right";
}

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}

/** Stable sort by a column's `sortValue`; returns the input order when the column is not sortable. */
export function sortRows<T>(rows: readonly T[], col: Column<T> | undefined, dir: SortDir): T[] {
  const get = col?.sortValue;
  if (!get) return [...rows];
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const c =
        typeof a.v === "number" && typeof b.v === "number"
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v));
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.row);
}

export interface DataTableProps<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  initialSort?: SortState;
  empty?: ReactNode;
}

/** A plain, keyboard-reachable table: sortable headers carry aria-sort, clickable rows a button. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  onRowClick,
  initialSort,
  empty,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState | undefined>(initialSort);
  const active = columns.find((c) => c.key === sort?.key);
  const sorted = sortRows(rows, active, sort?.dir ?? "asc");

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key && s.dir === "asc" ? { key, dir: "desc" } : { key, dir: "asc" }));

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="overflow-x-auto rounded-md border border-border-hairline">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-2">
          <tr>
            {columns.map((c) => {
              const isActive = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={isActive ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`label whitespace-nowrap px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      className="inline-flex items-center gap-1 font-semibold hover:text-text"
                    >
                      {c.header}
                      <Icon
                        name={isActive && sort.dir === "desc" ? "ChevronDown" : "ChevronUp"}
                        size={12}
                        className={isActive ? "" : "opacity-30"}
                        aria-hidden
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className={`border-t border-border-hairline ${onRowClick ? "cursor-pointer hover:bg-surface-2" : ""}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c, i) => (
                <td key={c.key} className={`px-3 py-2 align-top ${c.align === "right" ? "mono text-right" : ""}`}>
                  {i === 0 && onRowClick ? (
                    <button
                      type="button"
                      className="text-left font-medium text-brand hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowClick(row);
                      }}
                    >
                      {c.render(row)}
                    </button>
                  ) : (
                    c.render(row)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
