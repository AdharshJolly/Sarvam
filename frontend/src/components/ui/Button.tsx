import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon; decorative, so pass an <Icon aria-hidden />. */
  icon?: ReactNode;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium leading-none " +
  "transition-colors disabled:pointer-events-none disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand border border-brand hover:brightness-110",
  secondary: "bg-surface text-text border border-border-strong hover:bg-surface-2",
  ghost: "bg-transparent text-text border border-transparent hover:bg-surface-2",
  danger: "bg-bad-bg text-bad-fg border border-bad-border hover:brightness-95",
};

// pointer-coarse raises every size to a 44px touch target on touch devices.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm pointer-coarse:min-h-11",
  md: "h-10 px-4 text-base pointer-coarse:min-h-11",
  lg: "h-12 px-6 text-lg",
  icon: "h-10 w-10 pointer-coarse:h-11 pointer-coarse:w-11",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "secondary", size = "md", type = "button", icon, children, ...props }, ref) => {
    if (size === "icon" && !props["aria-label"] && import.meta.env.DEV) {
      console.warn("Icon-only Button needs an aria-label");
    }
    return (
      <button
        ref={ref}
        type={type}
        className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
