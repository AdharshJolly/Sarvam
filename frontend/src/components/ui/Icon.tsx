import { createElement, forwardRef } from 'react';
import * as LucideIcons from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export type IconName = keyof typeof LucideIcons;

export interface IconProps extends LucideProps {
  name: keyof typeof LucideIcons;
  label?: string; // required visually hidden label if aria-hidden is not true
  'aria-hidden'?: boolean;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ name, label, 'aria-hidden': ariaHidden, ...props }, ref) => {
    const IconComponent = LucideIcons[name] as React.FC<LucideProps>;

    if (!IconComponent) {
      console.warn(`Icon ${name} not found in lucide-react`);
      return null;
    }

    // Require label if not explicitly hidden (accessibility constraint)
    if (!ariaHidden && !label && process.env.NODE_ENV !== 'production') {
      console.warn(`Icon ${name} is missing a label or aria-hidden={true}`);
    }

    return (
      <>
        {createElement(IconComponent, {
          ref,
          'aria-hidden': ariaHidden !== false ? true : undefined,
          ...props,
        })}
        {label && !ariaHidden && <span className="sr-only">{label}</span>}
      </>
    );
  }
);

Icon.displayName = 'Icon';

export const StatusIconMap = {
  GREEN: 'CheckCircle',
  AMBER: 'AlertTriangle',
  RED: 'XOctagon',
  INFO: 'Info',
} as const;
