export interface MeterProps {
  label: string;
  used: number;
  max: number | undefined;
  fmt?: (n: number) => string;
  onClick?: () => void;
}

export function Meter({ label, used, max, fmt = (n) => String(n), onClick }: MeterProps) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  
  let colorClass = "bg-brand-secondary text-brand-secondary";
  let alertText = "";
  if (pct >= 100) {
    colorClass = "bg-bad-fg text-bad-fg";
    alertText = "LIMIT";
  } else if (pct >= 80) {
    colorClass = "bg-warn-fg text-warn-fg";
    alertText = "80%+";
  }

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        <div className="flex items-center gap-2">
          {onClick ? (
            <button type="button" className="mono text-sm underline hover:text-brand-secondary" onClick={onClick}>
              {fmt(used)} of {max !== undefined ? fmt(max) : "n/a"}
            </button>
          ) : (
            <span className="mono text-sm">
              {fmt(used)} of {max !== undefined ? fmt(max) : "n/a"}
            </span>
          )}
          {alertText && (
            <span className={`text-xs font-bold ${alertText === 'LIMIT' ? 'text-bad-fg' : 'text-warn-fg'}`}>
              {alertText}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 w-full bg-surface-2 rounded-full overflow-hidden">
        <div className={`progress-fill h-full ${colorClass.split(' ')[0]}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
