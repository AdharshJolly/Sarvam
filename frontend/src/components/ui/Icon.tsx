import { forwardRef } from "react";
import {
  Activity,
  AlertTriangle,
  AlignLeft,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  FileText,
  Grid,
  HelpCircle,
  Info,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Quote,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ServerOff,
  ShieldCheck,
  Square,
  Sun,
  Swords,
  TrendingDown,
  TrendingUp,
  XOctagon,
  Zap,
} from "lucide-react";
import type { LucideIcon, LucideProps } from "lucide-react";

/**
 * Only the icons the UI uses are imported by name, so the bundler can drop the rest of the library.
 * To add an icon, import it here; `IconName` is derived from this registry, so an unknown name is a
 * compile error rather than a silently missing icon.
 */
const ICONS = {
  Activity,
  AlertTriangle,
  AlignLeft,
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  FileText,
  Grid,
  HelpCircle,
  Info,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Quote,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ServerOff,
  ShieldCheck,
  Square,
  Sun,
  Swords,
  TrendingDown,
  TrendingUp,
  XOctagon,
  Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps extends Omit<LucideProps, "ref"> {
  name: IconName;
  /** Accessible name. Give one when the icon stands alone; omit it for decorative icons. */
  label?: string;
  "aria-hidden"?: boolean;
}

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  ({ name, label, "aria-hidden": ariaHidden, ...props }, ref) => {
    const Glyph = ICONS[name];
    return (
      <>
        <Glyph ref={ref} aria-hidden={ariaHidden !== false ? true : undefined} {...props} />
        {label && !ariaHidden && <span className="sr-only">{label}</span>}
      </>
    );
  },
);

Icon.displayName = "Icon";

export const StatusIconMap = {
  GREEN: "CheckCircle",
  AMBER: "AlertTriangle",
  RED: "XOctagon",
  INFO: "Info",
} as const satisfies Record<string, IconName>;
