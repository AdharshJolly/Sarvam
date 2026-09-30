import { cn } from "@/lib/utils";
import * as React from "react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-lg border border-border-hairline bg-surface px-3 py-2 text-sm text-text transition-colors placeholder:text-text-muted focus-visible:border-brand-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary/20 disabled:cursor-not-allowed disabled:opacity-50",
          type === "search" &&
            "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
          type === "file" &&
            "p-0 pr-3 italic text-text-muted file:me-3 file:h-full file:border-0 file:border-r file:border-solid file:border-border-hairline file:bg-transparent file:px-3 file:text-sm file:font-medium file:not-italic file:text-text",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
