/** Always states what is missing and why. */
export function EmptyState({ title, why, icon = "○" }: { title: string; why?: string; icon?: string }) {
  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-dashed p-4"
      style={{ borderColor: "var(--border-strong)", color: "var(--text-muted)" }}
    >
      <span aria-hidden="true" className="text-2xl leading-none">
        {icon}
      </span>
      <div>
        <p className="font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </p>
        {why ? <p className="text-base">{why}</p> : null}
      </div>
    </div>
  );
}
