import { type ChipSpec, toneVar } from "./chips";

/** State = colour + icon + text, never colour alone. Chips are at least 14 px. */
export function StateChip({ spec, large = false }: { spec: ChipSpec; large?: boolean }) {
  const color = toneVar[spec.tone];
  return (
    <span
      className={`inline-flex w-fit items-center gap-1 rounded border font-semibold ${
        large ? "px-3 py-1 text-lg" : "px-2 py-0.5 text-sm"
      }`}
      style={{ borderColor: color, color }}
    >
      <span aria-hidden="true">{spec.icon}</span>
      {spec.label}
    </span>
  );
}
