import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'secondary', size = 'md', icon, children, ...props }, ref) => {
    let base = 'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-secondary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
    
    let variants = '';
    switch (variant) {
      case 'primary':
        variants = 'bg-brand text-surface hover:brightness-115 border border-brand';
        break;
      case 'secondary':
        variants = 'bg-surface text-text border border-border-strong hover:bg-surface-2';
        break;
      case 'ghost':
        variants = 'bg-transparent text-text hover:bg-surface-2';
        break;
      case 'danger':
        variants = 'bg-bad-bg text-bad-fg border border-bad-border hover:bg-red-100 dark:hover:bg-red-900';
        break;
    }

    let sizes = '';
    switch (size) {
      case 'sm':
        sizes = 'h-8 px-3 text-sm';
        break;
      case 'md':
        sizes = 'h-10 px-4 py-2 text-base';
        break;
      case 'lg':
        sizes = 'h-12 px-8 text-lg';
        break;
      case 'icon':
        sizes = 'h-10 w-10'; // square for icons
        break;
    }

    // Required label check for icon-only buttons
    if (size === 'icon' && !props['aria-label'] && process.env.NODE_ENV !== 'production') {
      console.warn('Icon-only Button requires an aria-label');
    }

    return (
      <button ref={ref} className={`${base} ${variants} ${sizes} ${className}`} {...props}>
        {icon}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
