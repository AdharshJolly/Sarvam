import { useEffect, useState } from "react";
import { type Health, api } from "../api/client";
import { env } from "../config/env";
import { useAuth } from "../state/useAuth";
import { Icon } from "./ui/Icon";

function BackendStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .health()
      .then((h) => {
        if (active) {
          setHealth(h);
          setChecked(true);
        }
      })
      .catch(() => {
        if (active) {
          setHealth(null);
          setChecked(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const live = health?.status === "ok";

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 text-sm text-text-muted font-mono"
    >
      <span
        className={`h-2 w-2 rounded-full ${
          live ? "bg-ok-fg" : checked ? "bg-bad-fg" : "bg-text-muted animate-pulse"
        }`}
        aria-hidden
      />
      <span>
        {live
          ? `Engine core operational (${health.version})`
          : checked
          ? `Engine offline (${env.apiBaseUrl})`
          : "Checking engine status..."}
      </span>
    </div>
  );
}

export function Landing() {
  const { user } = useAuth();

  return (
    <div className="w-full bg-bg text-text selection:bg-brand/20">
      {/* 1. HERO SECTION */}
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-border-hairline bg-surface text-text-muted font-mono text-sm mb-6">
            <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
            <span>Autonomous Research Engine / Verification Protocol</span>
          </div>

          {/* Master H1 */}
          <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-normal tracking-tight text-text leading-[1.08]">
            Research you can audit.
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-text-muted leading-relaxed max-w-3xl font-normal">
            Sarvam turns difficult business and technical questions into evidence-backed briefs, preserving the verifiable chain from conclusion to source, and stopping explicitly when evidence is not sufficient.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            {user ? (
              <a
                href="#/workspace"
                className="px-6 py-3 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm inline-flex items-center gap-2"
              >
                <span>Enter Research Workspace</span>
                <Icon name="ArrowRight" size={16} aria-hidden />
              </a>
            ) : (
              <>
                <a
                  href="#/signin"
                  onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
                  className="px-6 py-3 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm inline-flex items-center gap-2"
                >
                  <span>Start a research inquiry</span>
                  <Icon name="ArrowRight" size={16} aria-hidden />
                </a>
                <a
                  href="#/register"
                  onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
                  className="px-5 py-3 border border-border-hairline bg-surface hover:bg-surface-2 text-text font-medium text-sm rounded-lg transition-colors"
                >
                  Create account
                </a>
              </>
            )}
          </div>
        </div>

        {/* HERO ARTIFACT: AUDIT MATRIX CONSOLE */}
        <div className="mt-14 sm:mt-18 border border-border-hairline bg-surface rounded-xl overflow-hidden shadow-sm">
          {/* Console Header Bar */}
          <div className="px-6 py-3.5 bg-surface-2/60 border-b border-border-hairline flex flex-wrap items-center justify-between gap-4 font-mono text-sm text-text-muted">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-text">INQUIRY AUDIT TRACE</span>
              <span className="text-border-hairline">|</span>
              <span>REF: 2026-BLR-EV</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-warn-fg" aria-hidden />
              <span className="text-warn-fg font-medium">STOPPED AT THRESHOLD</span>
            </div>
          </div>

          {/* Console Body */}
          <div className="p-6 sm:p-8">
            <p className="font-mono text-sm uppercase tracking-wider text-text-muted mb-1.5">
              Active Investigation
            </p>
            <h2 className="font-display text-xl sm:text-2xl font-normal text-text leading-snug">
              Should Indian fleet operators transition commercial delivery two-wheelers in Bengaluru to electric in 2026?
            </h2>

            {/* Dimension Slots Breakdown */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="p-4 rounded-lg border border-border-hairline bg-bg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm text-text-muted">Slot 01: Unit Economics</span>
                  <span className="px-2 py-0.5 rounded text-sm font-mono font-medium bg-ok-bg text-ok-fg border border-ok-border">
                    CONFIRMED
                  </span>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">
                  Operating expenditure reduces by 38% under commercial tariff schedules.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border-hairline bg-bg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm text-text-muted">Slot 02: Grid Feeder Capacity</span>
                  <span className="px-2 py-0.5 rounded text-sm font-mono font-medium bg-warn-bg text-warn-fg border border-warn-border">
                    INSUFFICIENT
                  </span>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">
                  Substation connection delays not quantified for high-density depot fast-charging.
                </p>
              </div>

              <div className="p-4 rounded-lg border border-border-hairline bg-bg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm text-text-muted">Slot 03: Battery Swapping SLA</span>
                  <span className="px-2 py-0.5 rounded text-sm font-mono font-medium bg-bad-bg text-bad-fg border border-bad-border">
                    CONFLICT
                  </span>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">
                  Downtime logs conflict: 14 min reported vs 42 min audited during peak shift rotations.
                </p>
              </div>
            </div>

            {/* Summary Bar */}
            <div className="mt-6 pt-5 border-t border-border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-sm font-mono text-text-muted">
                <span><strong className="text-text font-semibold">12</strong> verified sources</span>
                <span className="text-border-hairline">/</span>
                <span><strong className="text-text font-semibold">4</strong> independent clusters</span>
                <span className="text-border-hairline">/</span>
                <span className="text-warn-fg font-medium">3 open conflicts documented</span>
              </div>
              <a
                href="#/workspace"
                className="text-sm font-semibold text-brand hover:underline inline-flex items-center gap-1.5"
              >
                <span>Inspect full evidence trail</span>
                <Icon name="ArrowRight" size={14} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SECTION: THE PROBLEM */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-border-hairline">
        <div className="max-w-3xl mb-12">
          <p className="font-mono text-sm tracking-wider uppercase text-text-muted mb-3">
            The Fundamental Dilemma
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-text leading-tight">
            AI can produce an answer. Research needs to know when the evidence isn&apos;t enough.
          </h2>
        </div>

        <div className="grid gap-8 sm:grid-cols-2">
          <div className="border border-border-hairline bg-surface p-6 sm:p-8 rounded-xl">
            <span className="font-mono text-sm font-semibold text-text-muted uppercase tracking-wider block mb-2">
              The Probabilistic Trap
            </span>
            <h3 className="text-xl font-medium text-text mb-4">
              Plausible text over verifiable truth
            </h3>
            <p className="text-sm sm:text-base text-text-muted leading-relaxed mb-6 font-normal">
              Standard language models are designed to generate fluent text that sounds convincing. When asked unresolved commercial or technical questions, they synthesize whatever secondary web pages rank highest, hallucinate citations, and smooth over real-world contradictions into artificial consensus.
            </p>
            <ul className="space-y-2.5 text-sm text-text-muted font-normal">
              <li className="flex items-start gap-2.5">
                <span className="text-bad-fg font-bold font-mono mt-0.5">X</span>
                <span>Conceals factual gaps with fluent filler prose</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-bad-fg font-bold font-mono mt-0.5">X</span>
                <span>Treats syndicated press releases as independent confirmations</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-bad-fg font-bold font-mono mt-0.5">X</span>
                <span>Averages divergent numerical estimates without resolving discrepancies</span>
              </li>
            </ul>
          </div>

          <div className="border border-border-hairline bg-surface p-6 sm:p-8 rounded-xl">
            <span className="font-mono text-sm font-semibold text-brand uppercase tracking-wider block mb-2">
              The Verifiable Standard
            </span>
            <h3 className="text-xl font-medium text-text mb-4">
              Deterministic proof and falsifiable bounds
            </h3>
            <p className="text-sm sm:text-base text-text-muted leading-relaxed mb-6 font-normal">
              Decision-grade research operates under strict evidential discipline. Inquiries are decomposed into orthogonal slots across required dimensions, retrieving authoritative primary documents, validating exact character spans, and grouping mirrored statements into single origins.
            </p>
            <ul className="space-y-2.5 text-sm text-text font-normal">
              <li className="flex items-start gap-2.5">
                <Icon name="Check" size={16} className="text-ok-fg mt-0.5 flex-shrink-0" aria-hidden />
                <span>Binds every material assertion to immutable raw text spans</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Icon name="Check" size={16} className="text-ok-fg mt-0.5 flex-shrink-0" aria-hidden />
                <span>Collapses syndicated media reporting into single root origins</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Icon name="Check" size={16} className="text-ok-fg mt-0.5 flex-shrink-0" aria-hidden />
                <span>Explicitly halts with an auditable list of missing variables when proof is lacking</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. SECTION: REAL RESEARCH OUTPUT (EXECUTIVE INTELLIGENCE BRIEF) */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-border-hairline">
        <div className="mb-12">
          <p className="font-mono text-sm tracking-wider uppercase text-text-muted mb-2">
            Verifiable Briefs
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-normal tracking-tight text-text">
            What a Sarvam brief looks like
          </h2>
          <p className="text-base text-text-muted mt-2 max-w-2xl font-normal">
            An authentic, structured intelligence document where every assertion traces directly to primary evidence.
          </p>
        </div>

        <div className="border border-border-hairline bg-surface rounded-xl overflow-hidden shadow-sm">
          {/* Document Header Folio */}
          <div className="px-6 py-4 bg-surface-2/70 border-b border-border-hairline flex flex-wrap items-center justify-between gap-4 font-mono text-sm text-text-muted">
            <div>
              <span className="font-bold text-text">SARVAM RESEARCH BRIEF</span>
              <span className="mx-2 text-border-hairline">/</span>
              <span>DOC REF: BRF-884-BLR</span>
            </div>
            <div>
              <span>JURISDICTION: KARNATAKA, INDIA</span>
              <span className="mx-2 text-border-hairline">/</span>
              <span>HORIZON: 2025-2027</span>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            {/* Research Inquiry */}
            <div className="border-b border-border-hairline pb-6">
              <span className="font-mono text-sm uppercase tracking-wider text-text-muted">
                Executive Question
              </span>
              <h3 className="font-display text-2xl sm:text-3xl font-normal text-text mt-2 leading-tight">
                Should Bengaluru commercial delivery fleets switch to electric two-wheelers in 2026?
              </h3>
            </div>

            {/* Verdict Card */}
            <div className="py-6 border-b border-border-hairline">
              <div className="flex items-center gap-2 mb-3">
                <span className="font-mono text-sm uppercase font-semibold text-text-muted">
                  Official Audit Verdict:
                </span>
                <span className="px-2.5 py-0.5 rounded text-sm font-mono font-bold bg-warn-bg text-warn-fg border border-warn-border">
                  INSUFFICIENT EVIDENCE
                </span>
              </div>
              <p className="text-base text-text leading-relaxed font-normal">
                While operational expenditure per kilometre shows favourable parity under current state subsidies, utility filing records and fleet downtime logs fail to demonstrate adequate charging substation capacity and battery swapping availability at commercial density.
              </p>
            </div>

            {/* Evidence Breakdown Ledger */}
            <div className="py-6 border-b border-border-hairline grid gap-6 sm:grid-cols-2">
              <div>
                <span className="font-mono text-sm tracking-wider uppercase text-text-muted block mb-3">
                  Evidence Breakdown
                </span>
                <div className="space-y-2.5 text-sm text-text-muted">
                  <p className="flex items-center justify-between pr-4">
                    <span>Authoritative primary sources cited:</span>
                    <strong className="text-text font-mono font-semibold">12</strong>
                  </p>
                  <p className="flex items-center justify-between pr-4">
                    <span>Independent evidence clusters identified:</span>
                    <strong className="text-text font-mono font-semibold">4</strong>
                  </p>
                  <p className="flex items-center justify-between pr-4">
                    <span>Supporting verified dimensions:</span>
                    <strong className="text-ok-fg font-mono font-semibold">2</strong>
                  </p>
                  <p className="flex items-center justify-between pr-4">
                    <span>Conflicting data dimensions:</span>
                    <strong className="text-bad-fg font-mono font-semibold">1</strong>
                  </p>
                  <p className="flex items-center justify-between pr-4">
                    <span>Unresolved threshold variables:</span>
                    <strong className="text-warn-fg font-mono font-semibold">1</strong>
                  </p>
                </div>
              </div>

              <div>
                <span className="font-mono text-sm tracking-wider uppercase text-text-muted block mb-3">
                  Primary Sources Cited
                </span>
                <div className="space-y-3.5 text-sm">
                  <div className="border-l-2 border-brand pl-3">
                    <p className="font-mono text-brand font-semibold">01 · BESCOM Utility Tariff Filing</p>
                    <p className="text-text-muted mt-0.5">Commercial EV charging tariff schedule LT-6 and substation capacity allocation records.</p>
                  </div>
                  <div className="border-l-2 border-brand pl-3">
                    <p className="font-mono text-brand font-semibold">02 · Government of Karnataka</p>
                    <p className="text-text-muted mt-0.5">Electric Mobility Policy framework and capital subsidy disbursement schedule.</p>
                  </div>
                  <div className="border-l-2 border-brand pl-3">
                    <p className="font-mono text-brand font-semibold">03 · Fleet Operator Audited Financials</p>
                    <p className="text-text-muted mt-0.5">Real-world battery degradation curves, replacement schedules, and fleet downtime logs.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Status Bar */}
            <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-sm">
              <span className="text-text-muted">
                Audit status: Provenance verified via SQLite WAL
              </span>
              <a
                href="#/workspace"
                className="font-semibold text-brand hover:underline inline-flex items-center gap-1.5"
              >
                <span>View evidence trail</span>
                <Icon name="ArrowRight" size={14} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECTION: METHODOLOGY */}
      <section id="methodology" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-border-hairline scroll-mt-20">
        <div className="max-w-3xl mb-12">
          <p className="font-mono text-sm tracking-wider uppercase text-text-muted mb-2">
            Verification Workflow
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-normal tracking-tight text-text">
            How Sarvam researches
          </h2>
          <p className="text-base text-text-muted mt-2 font-normal">
            Five disciplined stages designed to prevent unsupported claims and hallucinated consensus.
          </p>
        </div>

        <div className="divide-y divide-border-hairline border-y border-border-hairline">
          <div className="py-8 grid sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-3 font-mono text-sm font-semibold text-brand">
              01 / Decompose
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-lg font-semibold text-text mb-2">
                Turn the question into independently verifiable claims
              </h3>
              <p className="text-sm sm:text-base text-text-muted leading-relaxed font-normal mb-3">
                Sarvam establishes a deterministic <strong className="text-text font-semibold">Coverage matrix</strong>, dividing broad inquiries into orthogonal slots across dimensions such as unit economics, supply dependencies, and regulatory mandates.
              </p>
              <div className="inline-block px-2.5 py-1 rounded bg-surface-2 border border-border-hairline font-mono text-sm text-text-muted">
                Dimension slots: Unit Economics / Supply Chain / Grid Capacity / Policy
              </div>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-3 font-mono text-sm font-semibold text-brand">
              02 / Retrieve
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-lg font-semibold text-text mb-2">
                Find authoritative sources and preserve relevant passages
              </h3>
              <p className="text-sm sm:text-base text-text-muted leading-relaxed font-normal mb-3">
                Documents are fetched from primary sources and immutable text chunks are cached. Through rigorous <strong className="text-text font-semibold">Claim to passage</strong> verification, any quotation that does not match character offsets is discarded.
              </p>
              <div className="inline-block px-2.5 py-1 rounded bg-surface-2 border border-border-hairline font-mono text-sm text-text-muted">
                Grounding spec: Exact character spans / Immutable hash storage / Zero interpolation
              </div>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-3 font-mono text-sm font-semibold text-brand">
              03 / Cross-check
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-lg font-semibold text-text mb-2">
                Identify independent evidence and group related reporting
              </h3>
              <p className="text-sm sm:text-base text-text-muted leading-relaxed font-normal mb-3">
                Syndicated press statements are clustered. Through automated <strong className="text-text font-semibold">Independence collapse</strong>, multiple media articles echoing a shared corporate announcement collapse into one single origin.
              </p>
              <div className="inline-block px-2.5 py-1 rounded bg-surface-2 border border-border-hairline font-mono text-sm text-text-muted">
                Cluster rule: Syndicated PR reposts collapse to single origin root
              </div>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-3 font-mono text-sm font-semibold text-brand">
              04 / Challenge
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-lg font-semibold text-text mb-2">
                Look for contradictions before forming a conclusion
              </h3>
              <p className="text-sm sm:text-base text-text-muted leading-relaxed font-normal mb-3">
                The engine actively launches counter-queries to falsify candidate conclusions. If data points diverge on financial or technical variables, conflict records remain open and exposed.
              </p>
              <div className="inline-block px-2.5 py-1 rounded bg-surface-2 border border-border-hairline font-mono text-sm text-text-muted">
                Falsification: Adversarial counter-queries / Explicit conflict preservation
              </div>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-4 items-start">
            <div className="sm:col-span-3 font-mono text-sm font-semibold text-brand">
              05 / Stop
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-lg font-semibold text-text mb-2">
                If the evidence does not support an answer, say so
              </h3>
              <p className="text-sm sm:text-base text-text-muted leading-relaxed font-normal mb-3">
                An honest <strong className="text-text font-semibold">Stop decision</strong> is delivered when evidence falls short. Rather than guessing, the system returns INSUFFICIENT with explicit reasons and bounds.
              </p>
              <div className="inline-block px-2.5 py-1 rounded bg-surface-2 border border-border-hairline font-mono text-sm text-text-muted">
                Audit bounds: Explicit missing variables / Falsifiable criteria required to flip
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECTION: DIFFERENTIATION */}
      <section className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-border-hairline">
        <div className="max-w-3xl mb-12">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-text leading-tight">
            Most AI research tools optimize for an answer.
          </h2>
          <p className="font-display text-2xl sm:text-3xl text-brand font-normal mt-2">
            Sarvam optimizes for evidence.
          </p>
        </div>

        <div className="divide-y divide-border-hairline border-y border-border-hairline">
          <div className="py-8 grid sm:grid-cols-12 gap-4">
            <div className="sm:col-span-3 font-mono text-sm tracking-wider uppercase text-text-muted">
              Citations
            </div>
            <div className="sm:col-span-4 text-sm text-text-muted leading-relaxed">
              <span className="font-mono text-sm block text-text-muted/70 mb-1">Conventional AI</span>
              &ldquo;Here are some sources.&rdquo; General links to websites that often fail to support the specific claim.
            </div>
            <div className="sm:col-span-5 text-sm text-text leading-relaxed">
              <span className="font-mono text-sm block text-brand mb-1">Sarvam Engine</span>
              &ldquo;Every material claim points to supporting evidence.&rdquo; Character-exact quotes bound to stored raw primary text.
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-4">
            <div className="sm:col-span-3 font-mono text-sm tracking-wider uppercase text-text-muted">
              Conflicts
            </div>
            <div className="sm:col-span-4 text-sm text-text-muted leading-relaxed">
              <span className="font-mono text-sm block text-text-muted/70 mb-1">Conventional AI</span>
              &ldquo;Conflicting information is blended.&rdquo; Disagreements are hidden or averaged into a smooth approximation.
            </div>
            <div className="sm:col-span-5 text-sm text-text leading-relaxed">
              <span className="font-mono text-sm block text-brand mb-1">Sarvam Engine</span>
              &ldquo;Conflicts remain visible.&rdquo; Discrepancies between primary sources are isolated and presented for researcher review.
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-4">
            <div className="sm:col-span-3 font-mono text-sm tracking-wider uppercase text-text-muted">
              Missing Evidence
            </div>
            <div className="sm:col-span-4 text-sm text-text-muted leading-relaxed">
              <span className="font-mono text-sm block text-text-muted/70 mb-1">Conventional AI</span>
              &ldquo;Produces the most plausible answer.&rdquo; Generates fluent filler when factual proof is nonexistent.
            </div>
            <div className="sm:col-span-5 text-sm text-text leading-relaxed">
              <span className="font-mono text-sm block text-brand mb-1">Sarvam Engine</span>
              &ldquo;Returns INSUFFICIENT when evidence does not support a conclusion.&rdquo; Stops gracefully with an audit of missing variables.
            </div>
          </div>
        </div>
      </section>

      {/* 6. SECTION: TECHNICAL ARCHITECTURE */}
      <section id="architecture" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-border-hairline scroll-mt-20">
        <div className="max-w-3xl mb-12">
          <p className="font-mono text-sm tracking-wider uppercase text-text-muted mb-2">
            Engineering Infrastructure
          </p>
          <h2 className="font-display text-3xl sm:text-4xl font-normal tracking-tight text-text">
            Pipeline Architecture
          </h2>
          <p className="text-base text-text-muted mt-2 font-normal">
            Deterministic state machines, append-only SQLite WAL provenance storage, and real-time Server-Sent Events.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          <div className="border border-border-hairline bg-surface p-5 rounded-lg">
            <span className="font-mono text-sm text-brand font-semibold block mb-1">01 / Planning</span>
            <p className="font-semibold text-text text-base mb-1">Evidence Decomposition</p>
            <p className="text-sm text-text-muted leading-relaxed font-normal">
              Translates the inquiry into a deterministic matrix of required dimensions and falsifiable slots.
            </p>
          </div>

          <div className="border border-border-hairline bg-surface p-5 rounded-lg">
            <span className="font-mono text-sm text-brand font-semibold block mb-1">02 / Extraction</span>
            <p className="font-semibold text-text text-base mb-1">Verbatim Passage Grounding</p>
            <p className="text-sm text-text-muted leading-relaxed font-normal">
              Retrieves authoritative primary documents, caching immutable text with cryptographic spans.
            </p>
          </div>

          <div className="border border-border-hairline bg-surface p-5 rounded-lg">
            <span className="font-mono text-sm text-brand font-semibold block mb-1">03 / Synthesis</span>
            <p className="font-semibold text-text text-base mb-1">Origin Graph &amp; Consensus</p>
            <p className="text-sm text-text-muted leading-relaxed font-normal">
              Clusters mirrored reporting and exposes numeric conflicts across competing sources without hand-waving.
            </p>
          </div>

          <div className="border border-border-hairline bg-surface p-5 rounded-lg">
            <span className="font-mono text-sm text-brand font-semibold block mb-1">04 / Verdict</span>
            <p className="font-semibold text-text text-base mb-1">Adversarial Falsification</p>
            <p className="text-sm text-text-muted leading-relaxed font-normal">
              Challenges preliminary findings with targeted counter-queries before delivering an auditable executive brief.
            </p>
          </div>
        </div>

        <div className="border border-border-hairline bg-surface-2/60 p-6 rounded-lg grid gap-4 sm:grid-cols-3">
          <div>
            <p className="font-mono text-sm font-semibold text-text">FastAPI Backend</p>
            <p className="text-sm text-text-muted mt-1 font-normal">
              Strict Pydantic v2 schemas and deterministic type contracts.
            </p>
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-text">SQLite Provenance</p>
            <p className="text-sm text-text-muted mt-1 font-normal">
              Append-only WAL event store preserving raw tokens, citations, and prompts.
            </p>
          </div>
          <div>
            <p className="font-mono text-sm font-semibold text-text">Pure React Interface</p>
            <p className="text-sm text-text-muted mt-1 font-normal">
              State reducers, virtualized event logs, and keyboard-first accessibility.
            </p>
          </div>
        </div>
      </section>

      {/* 7. COMPACT FOOTER */}
      <footer className="border-t border-border-hairline py-8 px-4 sm:px-6 lg:px-8 mt-12">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="font-bold text-base tracking-tight text-text">SARVAM</span>
            <span className="text-border-hairline">|</span>
            <BackendStatus />
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-text-muted">
            <a href="#methodology" className="hover:text-text transition-colors">
              Methodology
            </a>
            <a href="#architecture" className="hover:text-text transition-colors">
              Architecture
            </a>
            <a href="#/privacy" className="hover:text-text transition-colors">
              Privacy Policy
            </a>
            <a href="#/terms" className="hover:text-text transition-colors">
              Terms of Service
            </a>
            <a href="#/cookies" className="hover:text-text transition-colors">
              Cookie Policy
            </a>
          </nav>


          <p className="text-sm text-text-muted">
            &copy; 2026 Sarvam.
          </p>
        </div>
      </footer>
    </div>
  );
}
