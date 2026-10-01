import { ThemeToggle } from "../layout/ThemeToggle";
import { Icon } from "../ui/Icon";
import { useAuth } from "../../state/useAuth";

export function ArchitecturePage() {
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
            Architecture
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-text-muted">
          <a href="#/methodology" className="hover:text-text transition-colors">
            Methodology
          </a>
          <a href="#/architecture" className="text-brand font-semibold">
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
            System Design &amp; Engine Internals
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text">
            Pipeline Architecture
          </h1>
          <p className="text-base sm:text-lg text-text-muted mt-3 leading-relaxed">
            Deterministic state machines, append-only SQLite event logs, and real-time Server-Sent Events (SSE) streaming.
          </p>
        </div>

        {/* 4 Pipeline Phases */}
        <section className="mb-12">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text mb-6">
            Four verifiably sequenced phases
          </h2>

          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-border-hairline bg-surface">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-bold text-brand">Phase 01</span>
                <span className="font-mono text-sm text-text-muted uppercase">Planning</span>
              </div>
              <h3 className="text-lg font-bold text-text">Dimension &amp; Slot Decomposition</h3>
              <p className="text-sm text-text-muted mt-2 leading-relaxed">
                The user inquiry is parsed into discrete, falsifiable slots across orthogonal research dimensions (e.g. Unit Economics, Regulatory Compliance, Competitor Dynamics). Each slot receives a unique identifier and acceptance criteria.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border-hairline bg-surface">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-bold text-brand">Phase 02</span>
                <span className="font-mono text-sm text-text-muted uppercase">Extraction</span>
              </div>
              <h3 className="text-lg font-bold text-text">Passage Retrieval &amp; Character Offsets</h3>
              <p className="text-sm text-text-muted mt-2 leading-relaxed">
                Primary sources are fetched through authoritative web endpoints or local corpora. Text is segmented into immutable passages. Quotations must match character spans precisely; any hallucinated or drifting quote triggers automatic validation rejection.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border-hairline bg-surface">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-bold text-brand">Phase 03</span>
                <span className="font-mono text-sm text-text-muted uppercase">Synthesis</span>
              </div>
              <h3 className="text-lg font-bold text-text">Origin Clustering &amp; Conflict Detection</h3>
              <p className="text-sm text-text-muted mt-2 leading-relaxed">
                Sources are evaluated for shared lineage. Outlets repeating the same press release collapse into a single origin. If conflicting numbers or opposing conclusions emerge across sources, the engine creates an open conflict record requiring resolution.
              </p>
            </div>

            <div className="p-6 rounded-xl border border-border-hairline bg-surface">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm font-bold text-brand">Phase 04</span>
                <span className="font-mono text-sm text-text-muted uppercase">Verdict</span>
              </div>
              <h3 className="text-lg font-bold text-text">Adversarial Counter-Analysis &amp; Report Generation</h3>
              <p className="text-sm text-text-muted mt-2 leading-relaxed">
                The engine formulates targeted falsification queries to challenge its own findings. If the hypothesis holds up to adversarial review, an executive brief is compiled where every sentence links back to an inspected evidence ID.
              </p>
            </div>
          </div>
        </section>

        {/* Engine Tech Specs */}
        <section className="mb-12">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text mb-4">
            Technical Stack &amp; Protocols
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="p-5 rounded-xl border border-border-hairline bg-surface-2/60">
              <p className="font-mono text-sm text-brand font-bold mb-1">FastAPI Backend</p>
              <p className="text-sm text-text-muted leading-relaxed">
                Async Python engine with strict Pydantic v2 schemas and deterministic type contracts.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border-hairline bg-surface-2/60">
              <p className="font-mono text-sm text-brand font-bold mb-1">SQLite Provenance</p>
              <p className="text-sm text-text-muted leading-relaxed">
                Zero-latency append-only WAL mode event store preserving every raw token, HTTP call, and prompt.
              </p>
            </div>

            <div className="p-5 rounded-xl border border-border-hairline bg-surface-2/60">
              <p className="font-mono text-sm text-brand font-bold mb-1">Pure React Frontend</p>
              <p className="text-sm text-text-muted leading-relaxed">
                High-performance state reducers, zero-lag timeline virtualizers, and keyboard-first accessibility.
              </p>
            </div>
          </div>
        </section>

        {/* Call to action */}
        <div className="p-8 rounded-[1.3rem] border border-border-hairline bg-surface-2 text-center">
          <h2 className="text-xl font-bold text-text">
            Explore the API Documentation
          </h2>
          <p className="text-sm text-text-muted mt-2 max-w-lg mx-auto">
            Inspect our OpenAPI schemas and execute test runs through our interactive Swagger console.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <a
              href="http://localhost:8000/docs"
              target="_blank"
              rel="noreferrer"
              className="px-5 py-2.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm flex items-center gap-2"
            >
              <span>Open OpenAPI Docs</span>
              <Icon name="ArrowRight" size={16} aria-hidden />
            </a>
            <a
              href="#/workspace"
              className="px-5 py-2.5 border border-border-hairline bg-surface hover:bg-surface-2 text-text font-medium text-sm rounded-lg transition-colors"
            >
              Open Research Workspace
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
            <a href="#/methodology" className="hover:text-text transition-colors">Methodology</a>
            <a href="#/privacy" className="hover:text-text transition-colors">Privacy</a>
            <a href="#/terms" className="hover:text-text transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
