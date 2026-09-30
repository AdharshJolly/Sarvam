import { type KeyboardEvent, type MouseEvent, type ReactNode, type SyntheticEvent, useEffect, useRef } from "react";
import { Button } from "./Button";
import { getFocusableElements, nextFocusedElement, saveFocus, restoreFocus } from "../../lib/focus";

export type DialogPlacement = "center" | "right" | "left" | "bottom";

const PLACEMENT: Record<DialogPlacement, string> = {
  center: "anim-in m-auto rounded-[1.3rem] border border-border-hairline shadow-elevation bg-surface p-0",
  right:
    "anim-drawer fixed inset-y-0 right-0 z-30 m-0 h-full max-h-dvh w-full max-w-[32rem] border-l border-border-hairline bg-surface/95 backdrop-blur-md shadow-elevation",
  left: "anim-in fixed inset-y-0 left-0 z-30 m-0 h-full max-h-dvh w-full max-w-[22rem] border-r border-border-hairline bg-surface",
  bottom:
    "anim-in fixed inset-x-0 bottom-0 z-30 m-0 max-h-[85dvh] w-full max-w-none rounded-t-[1.3rem] border-t border-border-hairline bg-surface",
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
 * We supplement this with manual focus return to cover React unmount races.
 */
export function Dialog({ isOpen, onClose, title, children, placement = "center", docked = false }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (dialog.open) dialog.close();
    if (isOpen) {
      if (!docked) saveFocus(); // save focus before modal opens
      
      if (docked) {
        dialog.show();
      } else {
        dialog.showModal();
        document.body.style.overflow = "hidden"; // scroll lock while modal
      }
    } else {
      if (!docked) restoreFocus();
    }
    
    return () => {
      document.body.style.overflow = "";
      if (isOpen && !docked) restoreFocus(); // cleanup if unmounted while open
    };
  }, [isOpen, docked]);

  // Modal: the native cancel event (Escape). We close through props so React state stays the truth.
  const onCancel = (e: SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  // Docked dialogs get no native Escape handling; listen on the element (works while focus is inside).
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (docked) {
        e.stopPropagation();
        onClose();
      }
      return;
    }
    
    // Manual focus trap fallback for modal, just to be sure it wraps correctly
    if (!docked && e.key === "Tab" && dialogRef.current) {
      const focusable = getFocusableElements(dialogRef.current);
      const next = nextFocusedElement(document.activeElement, focusable, e.shiftKey);
      if (next) {
        e.preventDefault();
        next.focus();
      }
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
        <div className="mb-4 flex items-center justify-between pb-3 border-b border-border-hairline">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand" />
            <h2 className="text-base font-semibold text-text uppercase tracking-wider">{title}</h2>
          </div>
          <Button onClick={onClose} className="rounded-lg px-3 py-1 text-sm font-semibold">Close</Button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
