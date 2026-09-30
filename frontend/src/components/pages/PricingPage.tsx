import { ThemeToggle } from "../layout/ThemeToggle";
import { Icon } from "../ui/Icon";
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
        <div className="border-b border-border-hairline pb-8 mb-10 text-center">
          <p className="font-mono text-sm uppercase tracking-wider text-brand font-semibold mb-2">
            Transparent Economics
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Simple, Pass-Through Pricing
          </h1>
          <p className="text-base sm:text-lg text-text-muted mt-3 leading-relaxed max-w-2xl mx-auto">
            Zero per-seat markups. You pay pure model token and web search pass-through costs with full budget bounding controls.
          </p>
        </div>

        {/* Pricing Cards */}
        <section className="grid gap-6 md:grid-cols-2 mb-12">
          {/* Card 1: Self-Hosted / Local Engine */}
          <div className="p-7 rounded-[1.3rem] border border-border-hairline bg-surface flex flex-col justify-between">
            <div>
              <span className="font-mono text-sm font-semibold uppercase tracking-wider text-brand">
                Open Engine
              </span>
              <h2 className="text-2xl font-bold text-text mt-1">
                Developer &amp; Local
              </h2>
              <p className="text-sm text-text-muted mt-2 leading-relaxed">
                Run the full FastAPI and React pipeline locally on your infrastructure with your own API keys.
              </p>

              <div className="my-6">
                <span className="text-4xl font-bold text-text">$0</span>
                <span className="text-sm text-text-muted ml-1.5">/ software license</span>
              </div>

              <ul className="space-y-3 text-sm text-text-muted mb-6">
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Bring your own LLM keys (OpenAI, Anthropic, Gemini, Ollama)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Local SQLite provenance with cryptographic audit logs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Offline deterministic benchmark REPLAY mode</span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Complete REST API with Swagger documentation</span>
                </li>
              </ul>
            </div>

            <a
              href="#/workspace"
              className="w-full py-2.5 px-4 rounded-lg border border-border-hairline bg-surface-2 hover:bg-surface text-text font-medium text-sm text-center transition-colors block"
            >
              Start Local Investigation
            </a>
          </div>

          {/* Card 2: Enterprise Cloud */}
          <div className="p-7 rounded-[1.3rem] border-2 border-brand/40 bg-surface flex flex-col justify-between relative shadow-sm">
            <div>
              <span className="font-mono text-sm font-semibold uppercase tracking-wider text-brand">
                Managed Enterprise
              </span>
              <h2 className="text-2xl font-bold text-text mt-1">
                Institutional Research
              </h2>
              <p className="text-sm text-text-muted mt-2 leading-relaxed">
                Dedicated cloud clusters with enterprise rate limits, managed web proxies, and team isolation.
              </p>

              <div className="my-6">
                <span className="text-4xl font-bold text-text">Pass-Through</span>
                <span className="text-sm text-text-muted ml-1.5">+ SLA compute</span>
              </div>

              <ul className="space-y-3 text-sm text-text-muted mb-6">
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Average run cost: $0.05 to $0.35 per deep inquiry</span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Hard budget caps (searches, fetches, cost ceilings)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Multi-tenant isolation and user ID audit logs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Icon name="Check" size={16} className="text-brand shrink-0" />
                  <span>Priority support and custom connector pipelines</span>
                </li>
              </ul>
            </div>

            <a
              href="#/register"
              className="w-full py-2.5 px-4 rounded-lg bg-brand hover:opacity-90 text-white font-medium text-sm text-center transition-all shadow-sm block"
            >
              Create Institutional Account
            </a>
          </div>
        </section>

        {/* Typical Run Unit Economics Breakdown */}
        <section className="p-6 rounded-xl border border-border-hairline bg-surface-2/60 mb-12">
          <h2 className="text-lg font-bold text-text mb-2">
            Unit Economics of an Autonomous Investigation
          </h2>
          <p className="text-sm text-text-muted leading-relaxed mb-4">
            Unlike opaque subscription platforms, Sarvam exposes the exact resource meter for every run:
          </p>
          <div className="grid gap-4 sm:grid-cols-3 text-center">
            <div className="p-4 rounded-lg bg-surface border border-border-hairline">
              <p className="text-sm text-text-muted">Searches</p>
              <p className="font-mono text-xl font-bold text-text mt-1">10–15</p>
              <p className="text-sm text-text-muted mt-0.5">&lt; $0.03 total</p>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border-hairline">
              <p className="text-sm text-text-muted">Passage Fetches</p>
              <p className="font-mono text-xl font-bold text-text mt-1">20–30</p>
              <p className="text-sm text-text-muted mt-0.5">Cached in SQLite</p>
            </div>
            <div className="p-4 rounded-lg bg-surface border border-border-hairline">
              <p className="text-sm text-text-muted">LLM Synthesis</p>
              <p className="font-mono text-xl font-bold text-text mt-1">~120k Tokens</p>
              <p className="text-sm text-text-muted mt-0.5">~$0.18 on avg</p>
            </div>
          </div>
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
