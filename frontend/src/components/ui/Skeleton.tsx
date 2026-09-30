/** Shimmer placeholder. Always pair a group of these with a labelled status so it is not a bare spinner. */
export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden="true" className={`skeleton ${className}`} style={style} />;
}

export function SkeletonLines({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}
