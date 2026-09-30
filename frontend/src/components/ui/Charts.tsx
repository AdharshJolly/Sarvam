/** Hand-rolled SVG/CSS charts, no chart library. Colour comes from tokens only. */

export interface BarDatum {
  label: string;
  value: number;
}

/** Bar heights as fractions of the largest value; all-zero data yields all-zero heights. */
export function barFractions(values: readonly number[]): number[] {
  const max = Math.max(0, ...values);
  return values.map((v) => (max > 0 ? Math.max(0, v) / max : 0));
}

/** Vertical bars over time. Every bar has a <title> so values are available without colour or hover. */
export function BarSeries({
  data,
  label,
  format = String,
  height = 120,
}: {
  data: readonly BarDatum[];
  label: string;
  format?: (v: number) => string;
  height?: number;
}) {
  const fr = barFractions(data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} className="stroke-border-strong" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {data.map((d, i) => {
        const h = fr[i]! * (height - 4);
        return (
          <rect
            key={d.label}
            x={i * w + w * 0.12}
            width={w * 0.76}
            y={height - 1 - h}
            height={Math.max(h, d.value > 0 ? 1 : 0)}
            className="fill-brand"
          >
            <title>{`${d.label}: ${format(d.value)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Horizontal bars with the value printed beside each, so the number never depends on bar length. */
export function HBarList({
  data,
  format = String,
  empty = "No data",
}: {
  data: readonly BarDatum[];
  format?: (v: number) => string;
  empty?: string;
}) {
  if (data.length === 0) return <p className="text-sm text-text-muted">{empty}</p>;
  const fr = barFractions(data.map((d) => d.value));
  return (
    <ul className="flex flex-col gap-2">
      {data.map((d, i) => (
        <li key={d.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={d.label}>
            {d.label}
          </span>
          <span className="h-2 rounded bg-surface-2" aria-hidden>
            <span className="block h-2 rounded bg-brand" style={{ width: `${Math.round(fr[i]! * 100)}%` }} />
          </span>
          <span className="mono text-text-muted">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}
