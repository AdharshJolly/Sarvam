import { ThemeToggle } from "../layout/ThemeToggle";
import { Icon } from "../ui/Icon";
import { useAuth } from "../../state/useAuth";

export function MethodologyPage() {
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
            Methodology
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-text-muted">
          <a href="#/methodology" className="text-brand font-semibold">
            Methodology
          </a>
          <a href="#/architecture" className="hover:text-text transition-colors">
            Architecture
          </a>
          <a href="#/benchmarks" className="hover:text-text transition-colors">
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
            Epistemic Rigor &amp; Proof
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            The Evidence-First Research Methodology
          </h1>
          <p className="text-base sm:text-lg text-text-muted mt-3 leading-relaxed">
            Why probabilistic language models fail in business intelligence, and how Sarvam enforces deterministic boundaries, verbatim passage anchoring, and adversarial consensus collapse.
          </p>
        </div>

        {/* Section 1: The Core Failure Mode */}
        <section className="mb-12">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text mb-3">
            The Illusion of Consensus in Modern AI
          </h2>
          <p className="text-sm sm:text-base text-text-muted leading-relaxed mb-4">
            Standard conversational chatbots and retrieval-augmented systems optimize for conversational fluidity. When asked a high-stakes market or investment question, they synthesize whatever text ranks highest on search engines, hallucinate plausible citations, and present speculative PR announcements as established fact.
          </p>
          <p className="text-sm sm:text-base text-text-muted leading-relaxed">
            Sarvam was engineered from the ground up on a counter-principle: <strong className="text-text font-semibold">a research report is only as valid as its most fragile claim.</strong> If evidence does not exist or competing primary sources diverge on numerical claims, the system must expose the conflict rather than smoothing it over with prose.
          </p>
        </section>

        {/* Section 2: Four Deterministic Pillars */}
        <section className="mb-12">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text mb-6">
            Four Deterministic Pillars
          </h2>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="p-6 rounded-xl border border-border-hairline bg-surface flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-accent text-brand flex items-center justify-center mb-4">
                  <Icon name="Grid" size={20} aria-hidden />
                </div>
                <h3 className="text-lg font-bold text-text">
                  Coverage Matrix
                </h3>
                <p className="text-sm text-text-muted mt-2 leading-relaxed">
                  Every inquiry is decomposed into a multi-dimensional matrix of slots. Each slot tracks state (UNANSWERED, CANDIDATE, VERIFIED, CONFLICT, REJECTED) and requires independent proof before synthesis can proceed.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-border-hairline bg-surface flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-accent text-brand flex items-center justify-center mb-4">
                  <Icon name="Globe" size={20} aria-hidden />
                </div>
                <h3 className="text-lg font-bold text-text">
                  Independence Collapse
                </h3>
                <p className="text-sm text-text-muted mt-2 leading-relaxed">
                  Syndicated news and wire releases duplicate corporate PR across dozens of outlets. Sarvam clusters shared canonical origins. Nine articles citing one shared press statement collapse into a single origin.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-border-hairline bg-surface flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-accent text-brand flex items-center justify-center mb-4">
                  <Icon name="Quote" size={20} aria-hidden />
                </div>
                <h3 className="text-lg font-bold text-text">
                  Verbatim Passage Anchoring
                </h3>
                <p className="text-sm text-text-muted mt-2 leading-relaxed">
                  Claims cannot cite an entire 40-page document broadly. Every citation requires character-precise span offsets from stored, immutable HTML passages cached during extraction.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-border-hairline bg-surface flex flex-col justify-between">
              <div>
                <div className="w-10 h-10 rounded-lg bg-accent text-brand flex items-center justify-center mb-4">
                  <Icon name="Square" size={20} aria-hidden />
                </div>
                <h3 className="text-lg font-bold text-text">
                  Honest Stop Decisions
                </h3>
                <p className="text-sm text-text-muted mt-2 leading-relaxed">
                  When primary sources do not exist or critical slots remain unsubstantiated, Sarvam terminates with an explicit INSUFFICIENT verdict, detailing the missing variables and what would be required to falsify the result.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Call to Action */}
        <div className="p-8 rounded-[1.3rem] border border-border-hairline bg-surface-2 text-center">
          <h2 className="text-xl font-bold text-text">
            Test the Methodology in Action
          </h2>
          <p className="text-sm text-text-muted mt-2 max-w-lg mx-auto">
            Run an autonomous investigation or replay benchmark scenarios in our interactive workspace.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="#/workspace"
              className="px-5 py-2.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm flex items-center gap-2"
            >
              <span>Launch Research Workspace</span>
              <Icon name="ArrowRight" size={16} aria-hidden />
            </a>
            <a
              href="#/benchmarks"
              className="px-5 py-2.5 border border-border-hairline bg-surface hover:bg-surface-2 text-text font-medium text-sm rounded-lg transition-colors"
            >
              View Deterministic Replays
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
