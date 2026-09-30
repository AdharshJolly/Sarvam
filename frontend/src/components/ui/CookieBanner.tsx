import { useState, useEffect } from "react";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

const STORAGE_KEY = "sarvam_cookie_consent";

export interface CookieConsentState {
  essential: boolean;
  diagnostics: boolean;
  timestamp: string;
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [diagnosticsChecked, setDiagnosticsChecked] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // Smooth slide-in after mounting
        const timer = setTimeout(() => setVisible(true), 300);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const saveConsent = (diagnostics: boolean) => {
    const payload: CookieConsentState = {
      essential: true,
      diagnostics,
      timestamp: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore
    }
    setVisible(false);
    setModalOpen(false);
  };

  if (!visible) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Cookie and data storage preferences"
        className="fixed bottom-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-md border-t border-border-hairline py-3 px-4 sm:px-6 shadow-lg animate-enter"
      >
        <div className="max-w-[1240px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="text-brand flex-shrink-0" aria-hidden>
              <Icon name="Shield" size={18} />
            </span>
            <p className="text-text-muted">
              Sarvam uses strictly essential local storage for authentication and research sessions. Zero third-party trackers, zero marketing cookies.
              <a
                href="#/cookies"
                className="ml-2 text-brand hover:underline underline-offset-4 font-medium"
              >
                Cookie Policy
              </a>
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-end sm:self-auto flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(true)}
              className="text-text hover:bg-surface-2"
            >
              Customize
            </Button>
            <Button
              size="sm"
              onClick={() => saveConsent(false)}
              className="bg-brand text-white font-medium hover:opacity-95 px-4"
            >
              Accept Essential
            </Button>
          </div>
        </div>
      </div>

      {/* Consent Configuration Modal */}
      <Dialog
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Consent & Storage Preferences"
      >
        <div className="p-6 space-y-6">
          <p className="text-sm text-text-muted">
            Configure your storage preferences below. Under GDPR and privacy best practices, non-essential storage requires your explicit opt-in.
          </p>

          <div className="space-y-4">
            {/* Essential Category */}
            <div className="p-4 bg-surface border border-border-hairline rounded-lg flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">Strictly Essential Storage</span>
                  <span className="text-sm px-2 py-0.5 rounded bg-brand/10 text-brand font-medium">
                    Required
                  </span>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">
                  Required for user authentication sessions (token), light/dark mode persistence, and sidebar layout settings. Cannot be disabled.
                </p>
              </div>
              <input
                type="checkbox"
                checked={true}
                disabled
                className="mt-1 h-4 w-4 rounded accent-brand cursor-not-allowed"
                aria-label="Strictly essential storage (always active)"
              />
            </div>

            {/* Optional Diagnostics Category */}
            <div className="p-4 bg-surface border border-border-hairline rounded-lg flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text">Local Client Diagnostics</span>
                  <span className="text-sm px-2 py-0.5 rounded bg-surface-2 text-text-muted font-medium">
                    Optional
                  </span>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">
                  Permits purely local in-browser performance tracing to detect slow rendering runs. No personal identifiers or data are transmitted to third parties.
                </p>
              </div>
              <input
                type="checkbox"
                id="diagnosticsCheckbox"
                checked={diagnosticsChecked}
                onChange={(e) => setDiagnosticsChecked(e.target.checked)}
                className="mt-1 h-4 w-4 rounded accent-brand cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-border-hairline">
            <a href="#/cookies" className="text-sm text-brand hover:underline">
              Read Complete Policy
            </a>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => saveConsent(diagnosticsChecked)}
                className="bg-brand text-white hover:opacity-95"
              >
                Save Preferences
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}
