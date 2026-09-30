import { useState } from "react";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/Button";
import { Banner } from "../ui/Banner";

export function CookiePolicyPage() {
  const [cleared, setCleared] = useState(false);

  const handleClearCookies = () => {
    try {
      localStorage.removeItem("sarvam_cookie_consent");
      localStorage.removeItem("sarvam-theme");
      localStorage.removeItem("sarvam-rail");
      setCleared(true);
      setTimeout(() => setCleared(false), 4000);
    } catch {
      // ignore
    }
  };

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
          <a href="#/terms" className="hover:text-text transition-colors">
            Terms
          </a>
          <a href="#/account" className="hover:text-text transition-colors">
            Account
          </a>
        </div>
      </header>

      {/* Main Document Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="border-b border-border-hairline pb-8 mb-10">
          <span className="font-mono text-sm uppercase tracking-wider text-brand font-semibold">
            Transparency &amp; Storage
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text mt-2">
            Cookie &amp; Local Storage Policy
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Effective Date: October 1, 2026. Version 1.0.0
          </p>
        </div>

        {cleared ? (
          <div className="mb-8">
            <Banner tone="ok">Local storage preferences cleared. Reload page to re-prompt consent.</Banner>
          </div>
        ) : null}


        <div className="flex flex-col gap-10 text-base leading-relaxed text-text">
          {/* Section 1 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">1. Purpose and Philosophy</h2>
            <p className="text-text-muted">
              Sarvam follows a strict data minimization doctrine. We do not use marketing trackers, ad networks, cross-site profiling cookies, or third-party behavioral pixels.
            </p>
            <p className="text-text-muted">
              We only utilize strictly essential client storage mechanisms (HTTP headers and HTML5 local storage) necessary to authenticate your research session, retain your selected dark/light theme, and remember your evidence panel layout.
            </p>
          </section>

          {/* Section 2 */}
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-bold text-text">2. Complete Inventory of Client Storage Items</h2>
            <p className="text-text-muted">
              The following table discloses every storage item accessed by Sarvam:
            </p>

            <div className="overflow-x-auto border border-border-hairline rounded-xl">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-surface border-b border-border-hairline">
                    <th className="py-3 px-4 font-semibold text-text">Storage Key</th>
                    <th className="py-3 px-4 font-semibold text-text">Category</th>
                    <th className="py-3 px-4 font-semibold text-text">Lifespan</th>
                    <th className="py-3 px-4 font-semibold text-text">Technical Purpose</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline bg-background">
                  <tr>
                    <td className="py-3 px-4 font-mono font-medium text-brand">sarvam_token</td>
                    <td className="py-3 px-4 font-semibold text-ok-fg">Strictly Essential</td>
                    <td className="py-3 px-4 text-text-muted">7 days</td>
                    <td className="py-3 px-4 text-text-muted">
                      Cryptographic session token for authenticated API requests. Cleared on sign out.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono font-medium text-brand">sarvam-theme</td>
                    <td className="py-3 px-4 font-semibold text-ok-fg">Strictly Essential</td>
                    <td className="py-3 px-4 text-text-muted">Persistent</td>
                    <td className="py-3 px-4 text-text-muted">
                      Stores user preference for dark or light theme to prevent screen flashing on load.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono font-medium text-brand">sarvam-rail</td>
                    <td className="py-3 px-4 font-semibold text-ok-fg">Strictly Essential</td>
                    <td className="py-3 px-4 text-text-muted">Persistent</td>
                    <td className="py-3 px-4 text-text-muted">
                      Remembers whether the left navigation rail is expanded or collapsed in the research workspace.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4 font-mono font-medium text-brand">sarvam_cookie_consent</td>
                    <td className="py-3 px-4 font-semibold text-ok-fg">Strictly Essential</td>
                    <td className="py-3 px-4 text-text-muted">1 year</td>
                    <td className="py-3 px-4 text-text-muted">
                      Records your consent preferences and timestamp to avoid repeated prompt banners.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 3 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">3. Zero Third-Party Tracking Guarantee</h2>
            <div className="p-4 rounded-xl border border-ok-border/40 bg-ok-bg/30 text-sm">
              <p className="font-semibold text-ok-fg flex items-center gap-1.5 mb-1">
                <Icon name="CheckCircle" size={16} aria-hidden />
                Strict No-Ad Policy
              </p>
              <p className="text-text leading-relaxed">
                Sarvam does not embed Google Analytics, Facebook Pixel, Hotjar, or any ad networks. 
                Your research prompts, evidence queries, and browsing sessions are never monitored by external advertisers or data brokers.
              </p>
            </div>
          </section>

          {/* Section 4 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">4. Managing and Clearing Your Preferences</h2>
            <p className="text-text-muted">
              You can revoke consent and clear non-auth local storage at any time using the control below, or via your browser settings:
            </p>
            <div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearCookies}
                icon={<Icon name="Trash2" size={15} aria-hidden />}
              >
                Clear Cookie Consent &amp; UI Preferences
              </Button>
            </div>

          </section>

          {/* Section 5 */}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold text-text">5. Data Deletion Rights</h2>
            <p className="text-text-muted">
              Under GDPR, CCPA, and India's DPDP Act, you have the right to request full erasure of all account and research records. 
              To execute a complete data deletion, visit your{" "}
              <a href="#/account" className="text-brand underline font-medium hover:opacity-90">
                User Account page
              </a>{" "}
              and select &ldquo;Request Data Deletion&rdquo;.
            </p>
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
            <a href="#/terms" className="hover:text-text transition-colors">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
