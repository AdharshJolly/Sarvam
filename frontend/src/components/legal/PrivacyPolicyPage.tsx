import { Icon } from "../ui/Icon";

export function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bg text-text selection:bg-brand/20">
      {/* Top Header */}
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-border-hairline bg-surface/85 backdrop-blur-md px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-4">
          <a
            href="#/"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-hairline bg-surface hover:bg-surface-2 text-sm font-medium text-text transition-colors"
          >
            <Icon name="ArrowDown" size={16} className="rotate-90 text-text-muted" aria-hidden />
            <span>Back to Research</span>
          </a>
          <span className="font-bold text-lg tracking-tight text-text">SARVAM</span>
        </div>

        <div className="flex items-center gap-4 text-sm text-text-muted">
          <a href="#/terms" className="hover:text-text transition-colors">
            Terms of Service
          </a>
          <a href="#/admin" className="hover:text-text transition-colors">
            Audit Portal
          </a>
        </div>
      </header>

      {/* Main Document Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="border-b border-border-hairline pb-8 mb-10">
          <span className="font-mono text-sm uppercase tracking-wider text-brand font-semibold">
            Legal &amp; Compliance
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text mt-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Effective Date: October 1, 2026. Version 1.0.0
          </p>
        </div>

        <div className="flex flex-col gap-10 text-base leading-relaxed text-text">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">1. Overview and Core Philosophy</h2>
            <p className="text-text-muted">
              Sarvam operates on an evidence-first principle: all synthesized findings trace back to stored, immutable source passages with cryptographic character offsets. We apply the same transparency and determinism to our data handling practices.
            </p>
            <p className="text-text-muted">
              This Privacy Policy explains how Sarvam collects, processes, stores, and protects data when you use the autonomous research agent, associated APIs, and audit portal.
            </p>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">2. Information We Collect</h2>
            <div className="flex flex-col gap-3 pl-4 border-l-2 border-border-hairline">
              <div>
                <h3 className="font-semibold text-text text-base">A. Research Queries and Formulation Inputs</h3>
                <p className="text-sm text-text-muted mt-1">
                  We process the research questions, geographic constraints, time horizons, and domain bounds you enter into the investigation intake form. These inputs steer autonomous query decomposition and slot planning.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-text text-base">B. Retrieved Web Passages and Primary Citations</h3>
                <p className="text-sm text-text-muted mt-1">
                  When a research run executes in LIVE mode, the pipeline fetches publicly accessible web documents, extracts text passages, and stores them verbatim alongside origin metadata (URL, publisher domain, publication timestamp).
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-text text-base">C. Account and Authentication Data</h3>
                <p className="text-sm text-text-muted mt-1">
                  If you register an account, we store your display name, email address, and a cryptographically salted password hash (PBKDF2/SHA-256). We issue signed session cookies to maintain your login state.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-text text-base">D. Local Client-Side History</h3>
                <p className="text-sm text-text-muted mt-1">
                  Your browser maintains a local history of recent research run IDs and timestamps in browser localStorage to enable quick resumption across sessions. This client history is stored solely on your machine.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">3. Third-Party Inference &amp; Zero-Training Guarantee</h2>
            <p className="text-text-muted">
              Sarvam leverages large language model APIs for task decomposition, passage verification, and counter-evidence challenge generation. We maintain strict enterprise data privacy covenants:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-text-muted text-sm">
              <li>
                <strong className="text-text">No Model Training:</strong> Your research inputs, intermediate evidence extractions, and compiled reports are never used to train, retrain, or fine-tune public or private foundation models.
              </li>
              <li>
                <strong className="text-text">Zero Data Retention on Inference:</strong> API requests to model endpoints are governed by business data agreements that disallow persistent caching or secondary analysis.
              </li>
              <li>
                <strong className="text-text">Verbatim Grounding Enforcement:</strong> Model outputs that cannot be verified character-for-character against retrieved primary text are automatically rejected by our verification engine.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">4. Storage, Retention, and Data Security</h2>
            <p className="text-text-muted">
              Investigation records, including the 10-phase activity timeline, coverage matrices, passage extractions, and report markdown, are stored in our secure database. Run records are linked to your user account when authenticated.
            </p>
            <p className="text-text-muted">
              We employ industry-standard encryption in transit (TLS 1.3) and secure database access protocols. Sensitive session identifiers are stored in HTTP-only, SameSite-protected cookies.
            </p>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">5. User Rights and Data Control</h2>
            <p className="text-text-muted">
              As a user of Sarvam, you retain full rights over your data:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-text-muted text-sm">
              <li>
                <strong className="text-text">Export:</strong> You may inspect, download, or copy any research report, evidence matrix, or full audit log directly from the UI or API endpoints.
              </li>
              <li>
                <strong className="text-text">Erasure:</strong> You may execute immediate, self-service deletion of your account, active sessions, and personal run records at any time from your{" "}
                <a href="#/account" className="text-brand underline font-medium hover:opacity-90">
                  User Account Settings
                </a>.
              </li>
              <li>
                <strong className="text-text">Local Storage Clearing:</strong> You can clear your local run history and preferences at any time in browser settings or via the{" "}
                <a href="#/cookies" className="text-brand underline font-medium hover:opacity-90">
                  Cookie Policy page
                </a>.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">6. Contact and Data Inquiries</h2>
            <p className="text-text-muted">
              For security disclosures, data subject access requests, or privacy inquiries regarding our evidence verification architecture, contact our compliance team:
            </p>
            <div className="p-4 rounded-xl border border-border-hairline bg-surface text-sm">
              <p className="font-semibold text-text">Sarvam Privacy &amp; Data Governance</p>
              <p className="text-text-muted mt-0.5">Email: compliance@sarvam.research</p>
              <p className="text-text-muted">Address: Bengaluru, Karnataka, India</p>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-hairline bg-surface/40 py-8 px-4 sm:px-6 lg:px-8 mt-16">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-text-muted">
          <span>&copy; 2026 Sarvam. Evidence-First Research Agent.</span>
          <div className="flex items-center gap-4">
            <a href="#/" className="hover:text-text transition-colors">Home</a>
            <a href="#/terms" className="hover:text-text transition-colors">Terms of Service</a>
            <a href="#/cookies" className="hover:text-text transition-colors">Cookie Policy</a>
            <a href="#/account" className="hover:text-text transition-colors">Account</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
