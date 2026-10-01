import { ThemeToggle } from "../layout/ThemeToggle";
import { useAuth } from "../../state/useAuth";

export function PricingPage() {
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
            Pricing
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-text-muted">
          <a href="#/methodology" className="hover:text-text transition-colors">
            Methodology
          </a>
          <a href="#/architecture" className="hover:text-text transition-colors">
            Architecture
          </a>
          <a href="#/benchmarks" className="hover:text-text transition-colors">
            Benchmarks
          </a>
          <a href="#/pricing" className="text-brand font-semibold">
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
            Costs and limits
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            What a Sarvam run uses
          </h1>
          <p className="text-base sm:text-lg text-text-muted mt-3 leading-relaxed">
            Sarvam is a hackathon project with no paid plans. You run it yourself with your own search and model keys, and every run is capped by a budget you can see.
          </p>
        </div>

        <section className="p-6 rounded-xl border border-border-hairline bg-surface mb-8">
          <h2 className="text-lg font-bold text-text mb-2">Hard limits on every run</h2>
          <p className="text-sm text-text-muted leading-relaxed">
            The controller stops a run when a limit is reached, and the stop card says what was left undone. The default limits are 24 searches, 40 page fetches, 150 model calls, 8 minutes of wall time (soft) and 2 follow-up rounds.
          </p>
        </section>

        <section className="p-6 rounded-xl border border-border-hairline bg-surface-2/60 mb-12">
          <h2 className="text-lg font-bold text-text mb-2">Measured on the recorded run</h2>
          <p className="text-sm text-text-muted leading-relaxed mb-4">
            One live run of the canonical question (docs/benchmarks/canon-b3-o3.json). A single run is not an average; claim counts and call counts vary between runs.
          </p>
          <div className="grid gap-4 sm:grid-cols-3 text-center">
            <div className="p-4 rounded-lg bg-surface border border-border-hairline">
              <p className="text-sm text-text-muted">Searches</p>
              <p className="font-mono text-xl font-bold text-text mt-1">22 of 24</p>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border-hairline">
              <p className="text-sm text-text-muted">Page fetches</p>
              <p className="font-mono text-xl font-bold text-text mt-1">40 of 40</p>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border-hairline">
              <p className="text-sm text-text-muted">Model calls and tokens</p>
              <p className="font-mono text-xl font-bold text-text mt-1">53 / 155k</p>
            </div>
          </div>
          <p className="text-sm text-text-muted leading-relaxed mt-4">
            Money cost is not shown because the model provider did not report one and no price is configured. Replay mode costs nothing.
          </p>
        </section>
      </main>

      {/* Compact Footer */}
      <footer className="border-t border-border-hairline py-6 px-4 sm:px-6 lg:px-8 mt-12 bg-surface/30">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
          <p>&copy; 2026 Sarvam. Decision-grade autonomous research.</p>
          <div className="flex items-center gap-4">
            <a href="#/" className="hover:text-text transition-colors">Overview</a>
            <a href="#/methodology" className="hover:text-text transition-colors">Methodology</a>
            <a href="#/privacy" className="hover:text-text transition-colors">Privacy</a>
            <a href="#/terms" className="hover:text-text transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
