import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

/** Parse the quota field: empty = unlimited (null); otherwise a non-negative number. */
export function parseQuota(text: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const raw = text.trim();
  if (raw === "") return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Enter an amount of 0 or more, or leave empty for unlimited" };
  return { ok: true, value: n };
}

interface ShellProps {
  isOpen: boolean;
  title: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

function DialogShell({ isOpen, title, busy, error, onClose, children, footer }: ShellProps) {
  return (
    <Dialog isOpen={isOpen} onClose={busy ? () => {} : onClose} title={title}>
      <div className="flex w-[min(28rem,92vw)] flex-col gap-3 p-5">
        {children}
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <div className="flex justify-end gap-2">{footer}</div>
      </div>
    </Dialog>
  );
}

export function ConfirmDialog({
  isOpen,
  title,
  body,
  confirmLabel,
  danger = false,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <DialogShell
      isOpen={isOpen}
      title={title}
      busy={busy}
      error={error}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-text-muted">{body}</div>
    </DialogShell>
  );
}

export function QuotaDialog({
  isOpen,
  email,
  current,
  busy,
  error,
  onSave,
  onClose,
}: {
  isOpen: boolean;
  email: string;
  current: number | null;
  busy: boolean;
  error: string | null;
  onSave: (quota: number | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    if (isOpen) {
      setText(current == null ? "" : String(current));
      setLocal(null);
    }
  }, [isOpen, current]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseQuota(text);
    if (!parsed.ok) return setLocal(parsed.error);
    setLocal(null);
    onSave(parsed.value);
  };

  return (
    <DialogShell
      isOpen={isOpen}
      title="Set cost quota"
      busy={busy}
      error={local ?? error}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="quota-form" disabled={busy}>
            {busy ? "Saving…" : "Save quota"}
          </Button>
        </>
      }
    >
      <form id="quota-form" onSubmit={submit} className="flex flex-col gap-2">
        <p className="text-sm text-text-muted">
          New runs by {email} are refused once their metered cost reaches this amount. Leave empty for
          no limit.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="label">Quota (USD)</span>
          <input
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Unlimited"
            className="rounded-md border border-border-strong bg-surface px-2 py-1.5"
          />
        </label>
      </form>
    </DialogShell>
  );
}
