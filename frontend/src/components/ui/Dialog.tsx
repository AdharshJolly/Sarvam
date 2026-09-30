import { type KeyboardEvent, type MouseEvent, type ReactNode, type SyntheticEvent, useEffect, useRef } from "react";
import { Button } from "./Button";

export type DialogPlacement = "center" | "right" | "left" | "bottom";

const PLACEMENT: Record<DialogPlacement, string> = {
  center: "anim-in m-auto rounded-lg border border-border-strong",
  right:
    "anim-drawer fixed inset-y-0 right-0 z-30 m-0 h-full max-h-dvh w-full max-w-[30rem] border-l border-border-strong",
  left: "anim-in fixed inset-y-0 left-0 z-30 m-0 h-full max-h-dvh w-full max-w-[22rem] border-r border-border-strong",
  bottom:
    "anim-in fixed inset-x-0 bottom-0 z-30 m-0 max-h-[85dvh] w-full max-w-none rounded-t-lg border-t border-border-strong",
};

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Where it appears: a centred modal, or a sheet from the right, left or bottom edge. */
  placement?: DialogPlacement;
  /** Non-modal: the page behind stays usable (no backdrop, no focus trap, no scroll lock). */
  docked?: boolean;
}

/**
 * Built on the native <dialog>. In modal mode (showModal) the browser provides the focus trap, an
 * inert background, Escape handling and focus return to the opener. Docked mode uses show(), which
 * has none of those, so Escape is handled here on the element itself.
 */
export function Dialog({ isOpen, onClose, title, children, placement = "center", docked = false }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Always start from closed, so a change of `docked` while open (a window resize) reopens the
    // dialog in the right mode instead of leaving it stuck in the old one.
    if (dialog.open) dialog.close();
    if (isOpen) {
      if (docked) {
        dialog.show();
      } else {
        dialog.showModal();
        document.body.style.overflow = "hidden"; // scroll lock while modal
      }
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, docked]);

  // Modal: the native cancel event (Escape). We close through props so React state stays the truth.
  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  // Docked dialogs get no native Escape handling; listen on the element (works while focus is inside).
  const onKeyDown = (e: KeyboardEvent) => {
    if (docked && e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  // The dialog has no padding of its own, so a click whose target is the <dialog> itself can only
  // be on the backdrop.
  const onBackdropClick = (e: MouseEvent) => {
    if (!docked && e.target === dialogRef.current) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      onClick={onBackdropClick}
      className={`bg-bg p-0 text-text shadow-elevation outline-none backdrop:bg-black/40 backdrop:backdrop-blur-sm ${PLACEMENT[placement]}`}
    >
      <div className={`flex h-full flex-col ${placement === "center" ? "p-6" : "p-4"}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label">{title}</h2>
          <Button onClick={onClose}>Close</Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
