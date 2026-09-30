import { useEffect, useRef, type ReactNode } from "react";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  isDrawer?: boolean; // false = centered modal, true = side drawer
  docked?: boolean; // if true, it's not modal (no backdrop, no focus trap)
}

export function Dialog({ isOpen, onClose, title, children, isDrawer = false, docked = false }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (docked) {
        if (!dialog.open) dialog.show();
      } else {
        if (!dialog.open) dialog.showModal();
        document.body.style.overflow = "hidden"; // scroll lock
      }
    } else {
      if (dialog.open) dialog.close();
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, docked]);

  const handleCancel = (e: React.SyntheticEvent) => {
    e.preventDefault();
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (dialogRef.current && e.target === dialogRef.current && !docked) {
      onClose();
    }
  };

  // We use native <dialog> which provides Esc handling and focus trapping automatically when showModal() is used!
  return (
    <dialog
      ref={dialogRef}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      aria-label={title}
      className={`
        bg-bg text-text p-0 outline-none
        ${isDrawer 
          ? `fixed inset-y-0 right-0 z-30 m-0 h-full w-full max-w-[30rem] border-l border-border-strong shadow-elevation anim-drawer ${docked ? 'static xl:fixed' : ''}` 
          : "m-auto rounded-lg border border-border-strong p-6 shadow-elevation anim-in"}
        backdrop:bg-black/40 backdrop:backdrop-blur-sm
      `}
      style={isDrawer ? { maxHeight: '100dvh' } : {}}
    >
      <div className={`flex h-full flex-col ${isDrawer ? 'p-4' : ''}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label">{title}</h2>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </dialog>
  );
}
