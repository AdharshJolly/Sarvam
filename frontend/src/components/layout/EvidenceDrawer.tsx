/** Right drawer: claim, highlighted passage, verdict, origin, source (SSOT FR-24). Task T19. */
export function EvidenceDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <aside
      id="evidence-drawer"
      aria-label="Evidence drawer"
      hidden={!open}
      className="fixed inset-y-0 right-0 z-10 w-full max-w-md overflow-y-auto border-l p-4 shadow-lg"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Evidence</h2>
        <button type="button" className="rounded border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border)" }} onClick={onClose}>
          Close
        </button>
      </div>
      <p style={{ color: "var(--text-muted)" }}>
        Select a claim or citation to see its stored passage, verdict, origin and source.
      </p>
    </aside>
  );
}
