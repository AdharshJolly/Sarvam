import { RunForm } from "./RunForm";

const MOMENTS = [
  { icon: "▦", title: "Coverage matrix", text: "See exactly where Sarvam is confident and where it is not, cell by cell." },
  { icon: "→", title: "Independence collapse", text: "Nine sources that copy one press release count as one origin." },
  { icon: "❝", title: "Claim to passage", text: "Every claim links to the stored passage and the exact quote." },
  { icon: "■", title: "Stop decision", text: "Sarvam explains why it stopped, what is missing and what could change the answer." },
];

/** First screen: what Sarvam does differently, and the intake form. */
export function Landing() {
  return (
    <div className="mx-auto grid max-w-6xl gap-8 py-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="anim-in">
        <p className="label mb-2">Sarvam</p>
        <h2 className="text-4xl font-bold leading-tight tracking-tight">Research that knows when it isn&apos;t done.</h2>
        <p className="mt-3 max-w-xl text-lg" style={{ color: "var(--text-muted)" }}>
          Ask a question. Watch the plan, the evidence, the contradictions and the challenges unfold, then read a report where
          every sentence traces back to a stored passage.
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {MOMENTS.map((m, i) => (
            <li key={m.title} className="card anim-in p-3" style={{ animationDelay: `${120 + i * 70}ms` }}>
              <p className="flex items-center gap-2 font-semibold">
                <span aria-hidden="true" className="mono flex h-7 w-7 items-center justify-center rounded" style={{ background: "var(--accent-bg)", color: "var(--accent)" }}>
                  {m.icon}
                </span>
                {m.title}
              </p>
              <p className="mt-1 text-base" style={{ color: "var(--text-muted)" }}>
                {m.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div className="card anim-in p-5" style={{ animationDelay: "80ms", boxShadow: "var(--shadow)" }}>
        <RunForm />
      </div>
    </div>
  );
}
