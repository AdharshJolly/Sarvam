/** Always states what is missing and why. */
export function EmptyState({ title, why }: { title: string; why?: string }) {
  return (
    <div
      className="rounded border border-dashed p-4"
      style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
    >
      <p className="font-semibold">{title}</p>
      {why ? <p className="text-base">{why}</p> : null}
    </div>
  );
}
