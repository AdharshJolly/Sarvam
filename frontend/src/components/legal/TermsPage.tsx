import { Icon } from "../ui/Icon";

export function TermsPage() {
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
          <a href="#/privacy" className="hover:text-text transition-colors">
            Privacy Policy
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
            Terms &amp; Conditions
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text mt-2">
            Terms of Service
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Effective Date: October 1, 2026. Version 1.0.0
          </p>
        </div>

        <div className="flex flex-col gap-10 text-base leading-relaxed text-text">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">1. Acceptance of Terms</h2>
            <p className="text-text-muted">
              By accessing, browsing, or executing research runs via the Sarvam autonomous research platform (including its web application, REST APIs, and command-line interfaces), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not initialize or execute runs on this platform.
            </p>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">2. Description of the Service</h2>
            <p className="text-text-muted">
              Sarvam provides an evidence-first autonomous research pipeline that decomposes user-submitted research inquiries into falsifiable dimension slots, retrieves primary web documents, verifies claim quotes against stored passages, clusters syndicated origins, and generates structured executive briefs with full provenance audit trails.
            </p>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">3. Deterministic Guardrails &amp; The INSUFFICIENT Stop Principle</h2>
            <p className="text-text-muted">
              Users acknowledge that Sarvam is deliberately designed not to behave as a conversational chatbot or speculative text generator. As an architectural guarantee:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-text-muted text-sm">
              <li>
                <strong className="text-text">Insufficient Evidence is a Valid Result:</strong> If the pipeline cannot establish verified primary evidence for critical research dimensions, the run will halt with an explicit INSUFFICIENT stop status. This is the intended behavior of the system, not an error.
              </li>
              <li>
                <strong className="text-text">Advisory Capacity:</strong> Synthesized reports reflect the verified public evidence gathered during the run window. Reports are intended to inform business analysis and strategic planning, and do not constitute legal, tax, medical, or investment advice.
              </li>
              <li>
                <strong className="text-text">Provenance Audit Responsibility:</strong> Users are advised to review cited character spans and origin independence graphs before committing decisions based on findings.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">4. Permitted Use and Restrictions</h2>
            <p className="text-text-muted">
              You agree to use Sarvam strictly for legitimate research, market intelligence, policy analysis, and technical due diligence. You must not:
            </p>
            <ul className="list-disc pl-6 flex flex-col gap-2 text-text-muted text-sm">
              <li>Deploy automated scripts to flood or execute denial-of-service attacks against our retrieval infrastructure or target publisher hosts.</li>
              <li>Input inquiries designed to harvest personally identifiable information (PII) of non-public figures or facilitate unlawful surveillance.</li>
              <li>Attempt to reverse-engineer, exploit, or bypass authentication session tokens or budget controls.</li>
              <li>Misrepresent automated evidence summaries as certified human-audited forensic reports without conducting the requisite review.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">5. Intellectual Property and Citation Rights</h2>
            <div className="flex flex-col gap-3 pl-4 border-l-2 border-border-hairline">
              <div>
                <h3 className="font-semibold text-text text-base">A. User Formulations and Reports</h3>
                <p className="text-sm text-text-muted mt-1">
                  You retain ownership of the questions you formulate and the final structured reports generated specifically for your runs.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-text text-base">B. Primary Source Passages</h3>
                <p className="text-sm text-text-muted mt-1">
                  Verbatim quotes and primary passages extracted from the web remain the intellectual property of their original publishers. Citations are stored solely for provenance verification and fair-use informational reference.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-text text-base">C. Engine Platform IP</h3>
                <p className="text-sm text-text-muted mt-1">
                  The Sarvam name, orchestration algorithms, matrix verification logic, and frontend components remain the proprietary property of Sarvam and its licensors.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">6. Limitation of Liability</h2>
            <p className="text-text-muted">
              To the maximum extent permitted by applicable law, Sarvam and its contributors shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of your reliance on research outputs, primary source outages, or third-party web content modifications.
            </p>
          </section>

          {/* Section 7 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">7. Termination</h2>
            <p className="text-text-muted">
              We reserve the right to suspend or terminate account access and API credentials immediately for any breach of these Terms or abuse of retrieval limits.
            </p>
          </section>

          {/* Section 8 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">8. Governing Law and Contact</h2>
            <p className="text-text-muted">
              These Terms are governed by and construed in accordance with the laws of India, with jurisdiction in Bengaluru, Karnataka.
            </p>
            <div className="p-4 rounded-xl border border-border-hairline bg-surface text-sm">
              <p className="font-semibold text-text">Legal Department: Sarvam Autonomous Systems</p>
              <p className="text-text-muted mt-0.5">Email: legal@sarvam.research</p>
              <p className="text-text-muted">Location: Bengaluru, Karnataka, India</p>
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
            <a href="#/privacy" className="hover:text-text transition-colors">Privacy Policy</a>
            <a href="#/admin" className="hover:text-text transition-colors">Audit Portal</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
