import { type ReactNode, useId, useState } from "react";

interface TooltipProps {
  /** Short explanatory text. Tooltips never hold interactive content or the only copy of a fact. */
  text: string;
  children: ReactNode;
  /**
   * Make the wrapper a keyboard tab stop. Use it when the child is not itself focusable (a badge or
   * abbreviation); leave it off for buttons and links, which are already focusable.
   */
  focusable?: boolean;
}

/**
 * Hover and focus tooltip (WCAG 1.4.13): it appears on hover or keyboard focus, stays open while the
 * pointer moves onto it, and Escape dismisses it. The text stays in the DOM so `aria-describedby`
 * always points at a real element; it is only hidden visually while closed.
 *
 * Positioned above the trigger with no collision handling, so keep the text short.
 */
export function Tooltip({ text, children, focusable = false }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={id}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation(); // dismiss the tooltip without also closing a dialog behind it
          setOpen(false);
        }
      }}
    >
      {children}
      {/* The wrapper's bottom padding bridges the gap so the pointer can travel onto the bubble. */}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className="absolute bottom-full left-1/2 z-40 -translate-x-1/2 pb-1"
      >
        <span className="block w-max max-w-64 rounded-md bg-text px-2 py-1 text-sm font-normal text-bg shadow-elevation">
          {text}
        </span>
      </span>
    </span>
  );
}
