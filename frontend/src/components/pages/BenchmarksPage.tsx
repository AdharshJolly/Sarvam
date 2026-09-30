import { ThemeToggle } from "../layout/ThemeToggle";
import { Icon } from "../ui/Icon";
import { useAuth } from "../../state/useAuth";

const BENCHMARK_SCENARIOS = [
  {
    id: "canonical",
    title: "Commercial EV Two-Wheelers in Bengaluru",
    question: "Should a fleet logistics operator transition 500 delivery scooters in Bengaluru from petrol to electric in 2026?",
    dimensions: ["Battery Degradation Curves", "FAME-II Subsidy Expiration", "Swapping vs Fixed Charging CapEx", "Monsoon Waterlogging Resilience"],
    claimsVerified: 38,
    conflictsResolved: 2,
    originsDetected: 14,
  },
  {
    id: "fleet",
    title: "Indian Commercial EV Fleet Market 2027",
    question: "What are the structural unit economics, battery leasing trends, and financing bottlenecks in India's electric three-wheeler cargo market?",
    dimensions: ["LCOE Comparisons", "Priority Sector Lending Limits", "Residual Asset Valuation", "Battery Chemistry Longevity"],
    claimsVerified: 45,
    conflictsResolved: 3,
    originsDetected: 19,
  },
  {
    id: "solar",
    title: "Residential Rooftop Solar in Karnataka",
    question: "What are verified residential solar system costs, net-metering grid curtailments, and payback periods in Karnataka?",
    dimensions: ["BESCOM Tariff Schedules", "Inverter Failure Rates", "Discom Grid Interconnect Delays", "Subsidy Disbursement Timelines"],
    claimsVerified: 29,
    conflictsResolved: 1,
    originsDetected: 11,
  },
];

export function BenchmarksPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col justify-between selection:bg-brand/20">
      {/* Top Navbar */}
      <header className="h-16 border-b border-border-hairline bg-surface/90 backdrop-blur px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <a href="#/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <span className="font-bold text-xl tracking-tight text-text">SARVAM</span>
          </a>
          <span className="text-border-hairline">/</span>
          <span className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Benchmarks
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-text-muted">
          <a href="#/methodology" className="hover:text-text transition-colors">
            Methodology
          </a>
          <a href="#/architecture" className="hover:text-text transition-colors">
            Architecture
          </a>
          <a href="#/benchmarks" className="text-brand font-semibold">
            Benchmarks
          </a>
          <a href="#/pricing" className="hover:text-text transition-colors">
            Pricing
          </a>
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <a
              href="#/workspace"
              className="px-3.5 py-1.5 bg-brand hover:opacity-90 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              Workspace
            </a>
          ) : (
            <a
              href="#/signin"
              onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
              className="px-3.5 py-1.5 bg-brand hover:opacity-90 text-white text-sm font-medium rounded-lg transition-all shadow-sm"
            >
              Sign In
            </a>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="border-b border-border-hairline pb-8 mb-10">
          <p className="font-mono text-sm uppercase tracking-wider text-brand font-semibold mb-2">
            Deterministic Evaluation
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Deterministic Benchmark Library
          </h1>
          <p className="text-base sm:text-lg text-text-muted mt-3 leading-relaxed">
            Record once, replay indefinitely. Test your prompts, pipelines, and evaluation harnesses offline with zero model drift and zero token costs.
          </p>
        </div>

        {/* Overview */}
        <section className="mb-12">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text mb-3">
            Why Deterministic Replays Matter
          </h2>
          <p className="text-sm sm:text-base text-text-muted leading-relaxed mb-4">
            In traditional generative AI systems, evaluating changes across releases is nearly impossible because live web queries return changing results and LLM outputs fluctuate.
          </p>
          <p className="text-sm sm:text-base text-text-muted leading-relaxed">
            Sarvam provides a built-in <strong className="text-text font-semibold">REPLAY execution mode</strong>. Recorded investigations capture all HTTP payloads, search rankings, passage extractions, and model completions down to exact byte timestamps. Replaying a scenario runs completely offline in milliseconds, proving regression correctness without external dependencies.
          </p>
        </section>

        {/* Benchmark Scenarios */}
        <section className="mb-12">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text mb-6">
            Standard Reference Scenarios
          </h2>

          <div className="space-y-6">
            {BENCHMARK_SCENARIOS.map((s) => (
              <div
                key={s.id}
                className="p-6 rounded-xl border border-border-hairline bg-surface flex flex-col justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h3 className="text-lg font-bold text-text">{s.title}</h3>
                    <span className="font-mono text-sm px-2.5 py-0.5 rounded bg-surface-2 border border-border-hairline text-brand">
                      Scenario ID: {s.id}
                    </span>
                  </div>
                  <p className="text-sm text-text-muted italic mb-4">
                    &ldquo;{s.question}&rdquo;
                  </p>

                  <div className="grid grid-cols-3 gap-3 p-3.5 rounded-lg bg-surface-2/60 border border-border-hairline text-center mb-4">
                    <div>
                      <p className="font-mono text-base font-bold text-text">{s.claimsVerified}</p>
                      <p className="text-sm text-text-muted">Verified Claims</p>
                    </div>
                    <div>
                      <p className="font-mono text-base font-bold text-brand">{s.conflictsResolved}</p>
                      <p className="text-sm text-text-muted">Resolved Conflicts</p>
                    </div>
                    <div>
                      <p className="font-mono text-base font-bold text-text">{s.originsDetected}</p>
                      <p className="text-sm text-text-muted">Independent Origins</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {s.dimensions.map((d) => (
                      <span
                        key={d}
                        className="px-2.5 py-1 rounded-md text-sm bg-surface-2 border border-border-hairline text-text-muted font-medium"
                      >
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-border-hairline flex items-center justify-between">
                  <span className="text-sm text-text-muted">Includes raw primary documents and passage offsets</span>
                  <a
                    href="#/workspace"
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                  >
                    <span>Run in Replay Mode</span>
                    <Icon name="ArrowRight" size={14} aria-hidden />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="p-8 rounded-[1.3rem] border border-border-hairline bg-surface-2 text-center">
          <h2 className="text-xl font-bold text-text">
            Test a Deterministic Replay Now
          </h2>
          <p className="text-sm text-text-muted mt-2 max-w-lg mx-auto">
            Select REPLAY mode inside the research console to observe the full event stream instantly.
          </p>
          <div className="mt-6 flex items-center justify-center">
            <a
              href="#/workspace"
              className="px-5 py-2.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm flex items-center gap-2"
            >
              <span>Launch Console in Replay Mode</span>
              <Icon name="ArrowRight" size={16} aria-hidden />
            </a>
          </div>
        </div>
      </main>

      {/* Compact Footer */}
      <footer className="border-t border-border-hairline py-6 px-4 sm:px-6 lg:px-8 mt-12 bg-surface/30">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
          <p>&copy; 2026 Sarvam. Decision-grade autonomous research.</p>
          <div className="flex items-center gap-4">
            <a href="#/" className="hover:text-text transition-colors">Overview</a>
            <a href="#/architecture" className="hover:text-text transition-colors">Architecture</a>
            <a href="#/privacy" className="hover:text-text transition-colors">Privacy</a>
            <a href="#/terms" className="hover:text-text transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
