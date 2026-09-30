import type { HTMLAttributes } from "react";
import type { Tone } from "./chips";

export type CardPad = "none" | "xs" | "sm" | "md" | "lg";

const PAD: Record<CardPad, string> = {
  none: "",
  xs: "p-2",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

// A 4px edge in the status colour. Pair it with an icon and a word elsewhere in the card:
// colour alone never carries state (SSOT NFR-10).
const ACCENT: Record<Tone, string> = {
  ok: "border-l-4 border-l-ok-fg",
  warn: "border-l-4 border-l-warn-fg",
  bad: "border-l-4 border-l-bad-fg",
  info: "border-l-4 border-l-info-fg",
  brand: "border-l-4 border-l-brand-secondary",
  muted: "border-l-4 border-l-border-strong",
};

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** The element to render. A "button" card is a whole-card click target. */
  as?: "div" | "section" | "article" | "li" | "button";
  pad?: CardPad;
  accent?: Tone;
  /** Adds a hover border and shadow; use for clickable cards. */
  interactive?: boolean;
}

/** The single surface used for grouped content: hairline border, 8px radius, surface fill. */
export function Card({
  as = "div",
  pad = "none",
  accent,
  interactive = false,
  className = "",
  children,
  ...props
}: CardProps) {
  const classes = [
    "rounded-lg border border-border-hairline bg-surface",
    interactive ? "transition-colors hover:border-border-strong hover:shadow-elevation" : "",
    PAD[pad],
    accent ? ACCENT[accent] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (as === "button") {
    return (
      <button type="button" className={classes} {...props}>
        {children}
      </button>
    );
  }
  const Tag = as;
  return (
    <Tag className={classes} {...props}>
      {children}
    </Tag>
  );
}
