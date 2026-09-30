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
  /** Where the bubble appears. Use "right" for triggers near the left edge, such as the collapsed rail. */
  side?: "top" | "right";
  /** Extra classes for the wrapper, for example `min-w-0` when the child is truncated text. */
  className?: string;
}

/**
 * Hover and focus tooltip (WCAG 1.4.13): it appears on hover or keyboard focus, stays open while the
 * pointer moves onto it, and Escape dismisses it. The text stays in the DOM so `aria-describedby`
 * always points at a real element; it is only hidden visually while closed.
 *
 * Positioned above the trigger with no collision handling, so keep the text short.
 */
export function Tooltip({ text, children, focusable = false, side = "top", className = "" }: TooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`relative inline-flex ${className}`.trim()}
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
      {/* The wrapper's padding bridges the gap so the pointer can travel onto the bubble. */}
      <span
        role="tooltip"
        id={id}
        hidden={!open}
        className={`absolute z-40 ${
          side === "right" ? "left-full top-1/2 -translate-y-1/2 pl-1" : "bottom-full left-1/2 -translate-x-1/2 pb-1"
        }`}
      >
        <span className="block w-max max-w-64 rounded-md bg-text px-2 py-1 text-sm font-normal text-bg shadow-elevation">
          {text}
        </span>
      </span>
    </span>
  );
}
