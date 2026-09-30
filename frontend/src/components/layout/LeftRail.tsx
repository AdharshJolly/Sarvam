import { BudgetMeters } from "../BudgetMeters";
import { ModeBadge } from "../ModeBadge";
import { PhaseStepper } from "../PhaseStepper";

/** Left rail: question, phase stepper, budget meters, LIVE/REPLAY badge (SSOT section 12). */
export function LeftRail() {
  return (
    <aside
      aria-label="Research status"
      className="flex flex-col gap-6 border-b p-4 lg:border-r lg:border-b-0"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <ModeBadge mode={null} />
      <section aria-labelledby="question-h">
        <h2 id="question-h" className="mb-1 text-sm font-semibold uppercase tracking-wide">
          Question
        </h2>
        <p style={{ color: "var(--text-muted)" }}>No run started.</p>
      </section>
      <PhaseStepper current={null} />
      <BudgetMeters />
    </aside>
  );
}
