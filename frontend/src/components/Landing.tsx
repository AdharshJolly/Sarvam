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
      {/* 1. HERO SECTION: TWO-COLUMN WIDE DESKTOP LAYOUT */}
      <section className="pt-16 pb-24 sm:pt-24 sm:pb-32 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start lg:items-center">
          {/* Hero Left Column */}
          <div className="lg:col-span-5 xl:col-span-5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded border border-border-hairline bg-surface text-text-muted font-mono text-sm mb-6">
              <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
              <span>Autonomous Research Engine</span>
            </div>

            {/* Master H1 */}
            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-normal tracking-tight text-text leading-[1.05]">
              Research you can audit.
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-text-muted leading-relaxed font-normal">
              Sarvam turns difficult business and technical questions into evidence-backed briefs, preserving the chain from conclusion to source — and stopping when the evidence isn&apos;t sufficient.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              {user ? (
                <a
                  href="#/workspace"
                  className="px-6 py-3.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm inline-flex items-center gap-2"
                >
                  <span>Enter Research Workspace</span>
                  <Icon name="ArrowRight" size={16} aria-hidden />
                </a>
              ) : (
                <>
                  <a
                    href="#/signin"
                    onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
                    className="px-6 py-3.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm inline-flex items-center gap-2"
                  >
                    <span>Start a research inquiry</span>
                    <Icon name="ArrowRight" size={16} aria-hidden />
                  </a>
                  <a
                    href="#/register"
                    onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
                    className="px-5 py-3.5 border border-border-hairline bg-surface hover:bg-surface-2 text-text font-medium text-sm rounded-lg transition-colors"
                  >
                    Create account
                  </a>
                </>
              )}
            </div>

            <div className="mt-8 pt-6 border-t border-border-hairline">
              <BackendStatus />
            </div>
          </div>

          {/* Hero Right Column: Realistic Research Brief */}
          <div className="lg:col-span-7 xl:col-span-7">
            <div className="border border-border-hairline bg-surface rounded-xl overflow-hidden shadow-sm">
              {/* Brief Folio Bar */}
              <div className="px-6 py-3.5 bg-surface-2/70 border-b border-border-hairline flex flex-wrap items-center justify-between gap-3 font-mono text-sm text-text-muted">
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold text-text">SARVAM AUDIT FOLIO</span>
                  <span className="text-border-hairline">/</span>
                  <span>REF: 2026-BLR-EV</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-warn-fg" aria-hidden />
                  <span className="text-warn-fg font-medium">STOPPED AT THRESHOLD</span>
                </div>
              </div>

              {/* Brief Content */}
              <div className="p-6 sm:p-8 space-y-6">
                <div>
                  <span className="font-mono text-sm uppercase tracking-wider text-text-muted block mb-1.5">
                    Research Inquiry
                  </span>
                  <h2 className="font-display text-xl sm:text-2xl font-normal text-text leading-snug">
                    Should Indian commercial delivery fleets switch to electric two-wheelers?
                  </h2>
                </div>

                {/* Verdict Callout */}
                <div className="p-4 rounded-lg bg-bg border border-border-hairline">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="font-mono text-sm uppercase font-semibold text-text-muted">
                      Verdict
                    </span>
                    <span className="px-2 py-0.5 rounded text-sm font-mono font-bold bg-warn-bg text-warn-fg border border-warn-border">
                      INSUFFICIENT
                    </span>
                  </div>
                  <p className="text-sm text-text leading-relaxed font-normal">
                    Evidence supports lower operating costs, but does not establish whether charging constraints can be generalized across fleet sizes.
                  </p>
                </div>

                {/* Evidence Summary Counters */}
                <div>
                  <span className="font-mono text-sm uppercase tracking-wider text-text-muted block mb-2">
                    Evidence
                  </span>
                  <div className="flex flex-wrap items-center gap-3 text-sm font-mono text-text-muted">
                    <span className="px-2.5 py-1 rounded bg-bg border border-border-hairline">
                      <strong className="text-text font-semibold">12</strong> primary sources
                    </span>
                    <span className="px-2.5 py-1 rounded bg-bg border border-border-hairline">
                      <strong className="text-text font-semibold">4</strong> independent clusters
                    </span>
                    <span className="px-2.5 py-1 rounded bg-warn-bg/50 border border-warn-border text-warn-fg">
                      <strong className="font-semibold">3</strong> unresolved conflicts
                    </span>
                  </div>
                </div>

                {/* Subtle Recurring Concept: Evidence Trail */}
                <div className="space-y-2.5 pt-2 border-t border-border-hairline">
                  <span className="font-mono text-sm uppercase tracking-wider text-text-muted block mb-1">
                    Evidence Trail
                  </span>

                  <div className="p-3 rounded-lg bg-bg border border-border-hairline text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text">Fleet OPEX reduces 38% under tariff LT-6</span>
                      <span className="text-ok-fg font-mono font-medium">CONFIRMED</span>
                    </div>
                    <p className="text-text-muted text-sm flex items-center gap-1.5">
                      <span className="text-brand font-mono">↓</span>
                      <span>Audited commercial electricity tariff schedules</span>
                    </p>
                    <p className="text-text-muted/80 font-mono text-sm pl-4">
                      Source: BESCOM
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-bg border border-border-hairline text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text">Substation feeder capacity for depot fast charging</span>
                      <span className="text-warn-fg font-mono font-medium">INSUFFICIENT</span>
                    </div>
                    <p className="text-text-muted text-sm flex items-center gap-1.5">
                      <span className="text-warn-fg font-mono">↓</span>
                      <span>Queue for commercial substation feeder line exceeds 9 months</span>
                    </p>
                    <p className="text-text-muted/80 font-mono text-sm pl-4">
                      Source: Karnataka EV policy
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-bg border border-border-hairline text-sm space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text">Battery swapping turnaround SLA under 15 minutes</span>
                      <span className="text-bad-fg font-mono font-medium">CONFLICT</span>
                    </div>
                    <p className="text-text-muted text-sm flex items-center gap-1.5">
                      <span className="text-bad-fg font-mono">↓</span>
                      <span>14 min operator SLA conflicts with 42 min audited peak rotation</span>
                    </p>
                    <p className="text-text-muted/80 font-mono text-sm pl-4">
                      Source: Fleet operator filing
                    </p>
                  </div>
                </div>

                {/* Sources Row */}
                <div className="pt-2 border-t border-border-hairline flex flex-wrap items-center gap-2 text-sm font-mono text-text-muted">
                  <span className="font-semibold text-text uppercase">Sources:</span>
                  <span className="px-2 py-0.5 rounded bg-bg border border-border-hairline">BESCOM</span>
                  <span className="px-2 py-0.5 rounded bg-bg border border-border-hairline">Karnataka EV policy</span>
                  <span className="px-2 py-0.5 rounded bg-bg border border-border-hairline">Fleet operator filing</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. SECTION: THE PROBLEM (EDITORIAL MEASURE, NO BULKY CARDS) */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto border-t border-border-hairline">
        <div>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-text leading-tight">
            AI can produce an answer.
          </h2>
          <p className="font-display text-2xl sm:text-3xl lg:text-4xl text-brand font-normal mt-2 leading-tight">
            Research needs to know when the evidence isn&apos;t enough.
          </p>
        </div>

        <p className="mt-8 text-base sm:text-lg text-text-muted leading-relaxed font-normal">
          Standard language models are designed to generate fluent prose that mimics certainty. When confronted with missing records, divergent numerical estimates, or conflicting commercial filings, they smooth discrepancies into a plausible average. Decision-grade enterprise intelligence requires the opposite discipline: testing claims against raw text, grouping syndicated citations to their root source, and knowing precisely when available data fails to meet evidentiary thresholds.
        </p>

        {/* Three Lightweight Concepts */}
        <div className="mt-14 pt-8 border-t border-border-hairline grid sm:grid-cols-3 gap-8">
          <div>
            <span className="font-mono text-sm font-semibold tracking-wider uppercase text-brand block mb-2">
              CLAIMS
            </span>
            <p className="text-base text-text font-medium mb-1">
              What exactly are we asserting?
            </p>
            <p className="text-sm text-text-muted leading-relaxed font-normal">
              Every material proposition is isolated into falsifiable statements rather than buried in paragraphs.
            </p>
          </div>

          <div>
            <span className="font-mono text-sm font-semibold tracking-wider uppercase text-brand block mb-2">
              EVIDENCE
            </span>
            <p className="text-base text-text font-medium mb-1">
              What supports the claim?
            </p>
            <p className="text-sm text-text-muted leading-relaxed font-normal">
              Passage grounding binds claims to character-exact quotations from stored primary sources.
            </p>
          </div>

          <div>
            <span className="font-mono text-sm font-semibold tracking-wider uppercase text-brand block mb-2">
              CONFLICTS
            </span>
            <p className="text-base text-text font-medium mb-1">
              What disagrees?
            </p>
            <p className="text-sm text-text-muted leading-relaxed font-normal">
              Discrepancies between primary sources remain visible and audited, rather than averaged away.
            </p>
          </div>
        </div>
      </section>

      {/* 3. SECTION: PRODUCT OUTPUT (VISUAL CENTERPIECE) */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-[1140px] mx-auto border-t border-border-hairline">
        <div className="mb-12">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-text">
            What a Sarvam brief looks like.
          </h2>
          <p className="text-lg text-text-muted mt-3 max-w-2xl font-normal">
            An auditable research brief that preserves the connection between claims, evidence and sources.
          </p>
        </div>

        {/* Central Product Artifact: Large Wide Research Document */}
        <div className="border border-border-hairline bg-surface rounded-xl overflow-hidden shadow-sm">
          {/* Document Header Folio */}
          <div className="px-6 py-4 bg-surface-2/70 border-b border-border-hairline flex flex-wrap items-center justify-between gap-4 font-mono text-sm text-text-muted">
            <div className="flex items-center gap-3">
              <span className="font-bold text-text">SARVAM AUDITED BRIEF</span>
              <span className="text-border-hairline">/</span>
              <span>DOC REF: BRF-884-BLR</span>
            </div>
            <div className="flex items-center gap-3">
              <span>JURISDICTION: KARNATAKA, INDIA</span>
              <span className="text-border-hairline">/</span>
              <span>HORIZON: 2025–2027</span>
            </div>
          </div>

          <div className="p-6 sm:p-10 space-y-8">
            {/* Inquiry */}
            <div>
              <span className="font-mono text-sm uppercase tracking-wider text-text-muted block mb-2">
                Executive Inquiry
              </span>
              <h3 className="font-display text-2xl sm:text-3xl lg:text-4xl font-normal text-text leading-snug">
                Should Indian commercial delivery fleets switch to electric two-wheelers?
              </h3>
            </div>

            {/* Verdict Callout */}
            <div className="p-5 rounded-lg bg-bg border border-border-hairline">
              <div className="flex items-center gap-3 mb-2.5">
                <span className="font-mono text-sm uppercase font-semibold text-text-muted">
                  Official Verdict:
                </span>
                <span className="px-2.5 py-0.5 rounded text-sm font-mono font-bold bg-warn-bg text-warn-fg border border-warn-border">
                  INSUFFICIENT
                </span>
              </div>
              <p className="text-base text-text leading-relaxed font-normal">
                Evidence supports lower operating costs under commercial tariff LT-6, but does not establish whether distribution substation capacity and battery swapping SLAs can support continuous multi-shift operations across varied fleet sizes.
              </p>
            </div>

            {/* Evidence Counts */}
            <div className="pt-2">
              <span className="font-mono text-sm uppercase tracking-wider text-text-muted block mb-3">
                Evidence Ledger
              </span>
              <div className="grid sm:grid-cols-3 gap-4 text-sm font-mono">
                <div className="p-3.5 rounded-lg bg-bg border border-border-hairline">
                  <span className="text-text-muted block text-sm">Primary Sources</span>
                  <span className="text-xl font-semibold text-text">12 primary sources</span>
                </div>
                <div className="p-3.5 rounded-lg bg-bg border border-border-hairline">
                  <span className="text-text-muted block text-sm">Origin Clusters</span>
                  <span className="text-xl font-semibold text-text">4 independent clusters</span>
                </div>
                <div className="p-3.5 rounded-lg bg-bg border border-border-hairline">
                  <span className="text-warn-fg block text-sm">Documented Discrepancies</span>
                  <span className="text-xl font-semibold text-warn-fg">3 unresolved conflicts</span>
                </div>
              </div>
            </div>

            {/* Evidence Trail Breakdown */}
            <div className="pt-4 border-t border-border-hairline">
              <span className="font-mono text-sm uppercase tracking-wider text-text-muted block mb-4">
                Evidence Trail (Claim → Evidence / Conflict → Source)
              </span>

              <div className="space-y-3">
                <div className="p-4 rounded-lg bg-bg border border-border-hairline text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-semibold text-text">Claim 01: Fleet OPEX reduction of 38% under tariff LT-6</span>
                    <span className="px-2 py-0.5 rounded text-sm font-mono font-medium bg-ok-bg text-ok-fg border border-ok-border">
                      CONFIRMED
                    </span>
                  </div>
                  <div className="pl-4 border-l-2 border-brand/50 space-y-1 text-sm">
                    <p className="text-text flex items-center gap-1.5">
                      <span className="text-brand font-mono">↓ Evidence:</span>
                      <span>Audited tariff rates confirmed at ₹4.50/kWh off-peak commercial EV schedule</span>
                    </p>
                    <p className="text-text-muted font-mono flex items-center gap-1.5">
                      <span className="text-brand font-mono">↓ Source:</span>
                      <span>BESCOM Utility Tariff Filing, Schedule LT-6</span>
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-bg border border-border-hairline text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-semibold text-text">Claim 02: Distribution substation capacity for depot fast charging</span>
                    <span className="px-2 py-0.5 rounded text-sm font-mono font-medium bg-warn-bg text-warn-fg border border-warn-border">
                      INSUFFICIENT
                    </span>
                  </div>
                  <div className="pl-4 border-l-2 border-warn-fg/50 space-y-1 text-sm">
                    <p className="text-text flex items-center gap-1.5">
                      <span className="text-warn-fg font-mono">↓ Evidence:</span>
                      <span>Commercial feeder allocation lead time averages 9–14 months in dense logistics zones</span>
                    </p>
                    <p className="text-text-muted font-mono flex items-center gap-1.5">
                      <span className="text-warn-fg font-mono">↓ Source:</span>
                      <span>Karnataka EV policy</span>
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-bg border border-border-hairline text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <span className="font-semibold text-text">Claim 03: Battery swapping SLA turnaround maintains under 15 minutes</span>
                    <span className="px-2 py-0.5 rounded text-sm font-mono font-medium bg-bad-bg text-bad-fg border border-bad-border">
                      CONFLICT
                    </span>
                  </div>
                  <div className="pl-4 border-l-2 border-bad-fg/50 space-y-1 text-sm">
                    <p className="text-text flex items-center gap-1.5">
                      <span className="text-bad-fg font-mono">↓ Conflict:</span>
                      <span>14 min operator SLA marketing claim conflicts with 42 min audited peak rotation downtime</span>
                    </p>
                    <p className="text-text-muted font-mono flex items-center gap-1.5">
                      <span className="text-bad-fg font-mono">↓ Source:</span>
                      <span>Fleet operator filing</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Primary Sources Cited List */}
            <div className="pt-4 border-t border-border-hairline">
              <span className="font-mono text-sm uppercase tracking-wider text-text-muted block mb-3">
                Primary Sources Cited
              </span>
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div className="p-3.5 rounded-lg bg-bg border border-border-hairline">
                  <p className="font-mono text-brand font-semibold mb-1">01 · BESCOM</p>
                  <p className="text-text-muted">Commercial EV charging tariff schedule LT-6 and substation capacity allocation records.</p>
                </div>
                <div className="p-3.5 rounded-lg bg-bg border border-border-hairline">
                  <p className="font-mono text-brand font-semibold mb-1">02 · Karnataka EV policy</p>
                  <p className="text-text-muted">Electric Mobility Policy framework and capital subsidy disbursement schedule.</p>
                </div>
                <div className="p-3.5 rounded-lg bg-bg border border-border-hairline">
                  <p className="font-mono text-brand font-semibold mb-1">03 · Fleet operator filing</p>
                  <p className="text-text-muted">Audited fleet downtime logs, replacement cycles, and battery degradation curves.</p>
                </div>
              </div>
            </div>

            {/* Document Footer */}
            <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-sm border-t border-border-hairline">
              <span className="text-text-muted">
                Audit provenance: Append-only SQLite WAL verified
              </span>
              <a
                href="#/workspace"
                className="font-semibold text-brand hover:underline inline-flex items-center gap-1.5"
              >
                <span>Enter Research Workspace to inspect</span>
                <Icon name="ArrowRight" size={14} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 4. SECTION: METHODOLOGY (EDITORIAL PROCESS, NO CARDS) */}
      <section id="methodology" className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto border-t border-border-hairline scroll-mt-20">
        <div className="max-w-3xl mb-16">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tight text-text">
            How Sarvam researches
          </h2>
          <p className="text-lg text-text-muted mt-3 font-normal">
            Five disciplined stages designed to prevent unsupported claims and hallucinated consensus.
          </p>
        </div>

        <div className="divide-y divide-border-hairline border-y border-border-hairline">
          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-brand">
              01 &nbsp; DECOMPOSE
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-xl font-medium text-text mb-2">
                Turn the question into verifiable claims
              </h3>
              <p className="text-base text-text-muted leading-relaxed font-normal">
                Sarvam establishes a deterministic <strong className="text-text font-semibold">Coverage matrix</strong>, dividing broad inquiries into orthogonal slots across dimensions such as unit economics, supply dependencies, and regulatory mandates.
              </p>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-brand">
              02 &nbsp; RETRIEVE
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-xl font-medium text-text mb-2">
                Find authoritative sources and preserve passages
              </h3>
              <p className="text-base text-text-muted leading-relaxed font-normal">
                Documents are fetched from primary sources and immutable text chunks are cached. Through rigorous <strong className="text-text font-semibold">Claim to passage</strong> verification, any quotation that does not match character offsets is discarded.
              </p>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-brand">
              03 &nbsp; CROSS-CHECK
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-xl font-medium text-text mb-2">
                Separate independent evidence
              </h3>
              <p className="text-base text-text-muted leading-relaxed font-normal">
                Syndicated reporting is clustered. Automated <strong className="text-text font-semibold">Independence collapse</strong> ensures multiple media articles echoing a shared corporate announcement collapse into one single origin.
              </p>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-brand">
              04 &nbsp; CHALLENGE
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-xl font-medium text-text mb-2">
                Search for contradictions
              </h3>
              <p className="text-base text-text-muted leading-relaxed font-normal">
                The engine actively launches counter-queries to falsify candidate conclusions. If data points diverge on financial or technical variables, conflict records remain open and exposed.
              </p>
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-brand">
              05 &nbsp; STOP
            </div>
            <div className="sm:col-span-9">
              <h3 className="text-xl font-medium text-text mb-2">
                Stop when the evidence is insufficient
              </h3>
              <p className="text-base text-text-muted leading-relaxed font-normal">
                An honest <strong className="text-text font-semibold">Stop decision</strong> is delivered when evidence falls short. Rather than guessing, the system returns INSUFFICIENT with explicit reasons and bounds.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. SECTION: DIFFERENTIATION (EDITORIAL COMPARISONS, NO CARDS) */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto border-t border-border-hairline">
        <div className="max-w-3xl mb-16">
          <p className="text-xl sm:text-2xl text-text-muted font-normal">
            Most AI research tools optimize for an answer.
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-normal text-brand tracking-tight mt-1">
            Sarvam optimizes for evidence.
          </h2>
        </div>

        <div className="divide-y divide-border-hairline border-y border-border-hairline">
          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-text">
              01 — CLAIMS
            </div>
            <div className="sm:col-span-4 text-base text-text-muted leading-relaxed">
              <span className="font-mono text-sm block text-text-muted/70 mb-1">Conventional AI</span>
              Produces a conclusion.
            </div>
            <div className="sm:col-span-5 text-base text-text leading-relaxed">
              <span className="font-mono text-sm block text-brand mb-1">Sarvam</span>
              Connects material claims to supporting evidence.
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-text">
              02 — CONFLICTS
            </div>
            <div className="sm:col-span-4 text-base text-text-muted leading-relaxed">
              <span className="font-mono text-sm block text-text-muted/70 mb-1">Conventional AI</span>
              Smooths conflicting information.
            </div>
            <div className="sm:col-span-5 text-base text-text leading-relaxed">
              <span className="font-mono text-sm block text-brand mb-1">Sarvam</span>
              Keeps conflicts visible.
            </div>
          </div>

          <div className="py-8 grid sm:grid-cols-12 gap-6 items-start">
            <div className="sm:col-span-3 font-mono text-base font-semibold text-text">
              03 — MISSING EVIDENCE
            </div>
            <div className="sm:col-span-4 text-base text-text-muted leading-relaxed">
              <span className="font-mono text-sm block text-text-muted/70 mb-1">Conventional AI</span>
              Fills gaps with plausible language.
            </div>
            <div className="sm:col-span-5 text-base text-text leading-relaxed">
              <span className="font-mono text-sm block text-brand mb-1">Sarvam</span>
              Returns INSUFFICIENT when the evidence does not support a conclusion.
            </div>
          </div>
        </div>
      </section>

      {/* 6. SECTION: ARCHITECTURE (REDUCED VISUAL PROMINENCE) */}
      <section id="architecture" className="py-20 sm:py-28 px-4 sm:px-6 lg:px-8 max-w-[1140px] mx-auto border-t border-border-hairline scroll-mt-20">
        <div className="max-w-3xl mb-8">
          <h2 className="font-display text-2xl sm:text-3xl font-normal text-text">
            Under the hood
          </h2>
          <p className="text-base text-text-muted mt-2 font-normal">
            Deterministic execution preserving the chain of reasoning from raw document fetches to final verdict.
          </p>
        </div>

        <div className="p-6 rounded-lg bg-surface border border-border-hairline mb-6">
          <div className="flex flex-wrap items-center gap-3 text-sm sm:text-base font-mono text-text">
            <span>Decomposition</span>
            <span className="text-brand">→</span>
            <span>Retrieval</span>
            <span className="text-brand">→</span>
            <span>Verification</span>
            <span className="text-brand">→</span>
            <span>Synthesis</span>
            <span className="text-brand">→</span>
            <span className="font-semibold text-brand">Verdict</span>
          </div>
        </div>

        <div>
          <a
            href="#/architecture"
            className="text-sm font-semibold text-brand hover:underline inline-flex items-center gap-1.5"
          >
            <span>Explore the methodology</span>
            <Icon name="ArrowRight" size={14} aria-hidden />
          </a>
        </div>
      </section>

      {/* 7. SECTION: FINAL CTA */}
      <section className="py-24 sm:py-32 px-4 sm:px-6 lg:px-8 max-w-[1240px] mx-auto border-t border-border-hairline text-center">
        <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-normal text-text tracking-tight">
          Research you can audit.
        </h2>
        <p className="text-lg sm:text-xl text-text-muted mt-4 max-w-xl mx-auto font-normal">
          Start a research run with verified sources, explicit falsification, and verifiable audit trails.
        </p>
        <div className="mt-8 flex justify-center">
          {user ? (
            <a
              href="#/workspace"
              className="px-7 py-3.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm inline-flex items-center gap-2"
            >
              <span>Enter Research Workspace</span>
              <Icon name="ArrowRight" size={16} aria-hidden />
            </a>
          ) : (
            <a
              href="#/signin"
              onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
              className="px-7 py-3.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm inline-flex items-center gap-2"
            >
              <span>Start a research inquiry</span>
              <Icon name="ArrowRight" size={16} aria-hidden />
            </a>
          )}
        </div>
      </section>

      {/* 8. MINIMAL FOOTER */}
      <footer className="border-t border-border-hairline py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
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
