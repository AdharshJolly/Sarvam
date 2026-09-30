export function Reason({ children }: { children: string }) {
  return (
    <p className="text-base" style={{ color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}
