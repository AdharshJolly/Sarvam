import { useEffect, useState } from "react";
import { type HistoryEntry, readHistory } from "../../lib/history";
import { useAuth } from "../../state/useAuth";
import { RunForm } from "../RunForm";
import { Icon } from "../ui/Icon";
import { ThemeToggle } from "../layout/ThemeToggle";

export function WorkspacePage() {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen bg-bg text-text flex flex-col justify-between">
        <header className="h-16 border-b border-border-hairline bg-surface/90 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
          <a href="#/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <span className="font-bold text-xl tracking-tight text-text">SARVAM</span>
          </a>
          <ThemeToggle />
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-surface border border-border-hairline rounded-[1.3rem] p-8 shadow-sm text-center">
            <div className="w-12 h-12 rounded-xl bg-accent text-brand flex items-center justify-center mx-auto mb-5">
              <Icon name="ShieldCheck" size={24} aria-hidden />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-text">
              Authentication Required
            </h1>
            <p className="text-sm text-text-muted mt-2 leading-relaxed max-w-md mx-auto">
              Sarvam research pipelines, verbatim citation verifications, and audit trails require an authenticated researcher session. Please sign in or register to formulate queries and launch investigations.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="#/signin"
                onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
                className="w-full sm:w-auto px-5 py-2.5 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg transition-all shadow-sm flex items-center justify-center gap-2"
              >
                <span>Sign In to Workspace</span>
                <Icon name="ArrowRight" size={16} aria-hidden />
              </a>
              <a
                href="#/register"
                onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/workspace")}
                className="w-full sm:w-auto px-5 py-2.5 border border-border-hairline bg-surface-2 hover:bg-surface text-text font-medium text-sm rounded-lg transition-colors flex items-center justify-center"
              >
                Create Account
              </a>
            </div>

            <div className="mt-6 pt-6 border-t border-border-hairline">
              <a
                href="#/"
                className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
              >
                <Icon name="CornerDownLeft" size={14} aria-hidden />
                <span>Return to Overview</span>
              </a>
            </div>
          </div>
        </main>

        <footer className="py-6 border-t border-border-hairline text-center text-sm text-text-muted">
          &copy; 2026 Sarvam. Decision-grade autonomous research.
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text flex flex-col">
      {/* Top Bar */}
      <header className="h-16 border-b border-border-hairline bg-surface/90 backdrop-blur px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <a href="#/" className="flex items-center gap-2 hover:opacity-90 transition-opacity">
            <span className="font-bold text-xl tracking-tight text-text">SARVAM</span>
          </a>
          <span className="text-border-hairline">/</span>
          <span className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Workspace
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#/history"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border-hairline hover:bg-surface text-text-muted hover:text-text text-sm font-medium rounded-lg transition-colors"
          >
            <Icon name="Clock" size={15} aria-hidden />
            <span className="hidden sm:inline">Investigation History</span>
          </a>

          <div className="flex items-center gap-2 border-l border-border-hairline pl-3">
            <div
              className="w-7 h-7 rounded-full bg-accent text-brand font-semibold text-sm flex items-center justify-center cursor-default"
              title={user.email}
            >
              {user.display_name.charAt(0).toUpperCase()}
            </div>
            <span className="hidden md:inline text-sm font-medium text-text max-w-[130px] truncate">
              {user.display_name}
            </span>
            <button
              type="button"
              onClick={() => logout()}
              className="text-sm text-text-muted hover:text-bad-fg transition-colors p-1"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <Icon name="Minus" size={14} aria-hidden />
            </button>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
            Start a research run
          </h1>
          <p className="text-sm sm:text-base text-text-muted mt-1 leading-relaxed">
            Formulate a strategic inquiry. Sarvam decomposes required dimensions, queries live sources, extracts character-accurate citations, and challenges preliminary findings.
          </p>
        </div>

        <div className="bg-surface border border-border-hairline rounded-[1.3rem] p-6 sm:p-8 shadow-sm">
          <RunForm />
        </div>

        {/* Recent Investigations Strip */}
        {history.length > 0 && (
          <div className="mt-6 p-4 rounded-xl bg-surface/50 border border-border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-text-muted">
              <Icon name="Clock" size={16} aria-hidden />
              <span>Recent local investigations:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {history.slice(0, 3).map((h) => (
                <a
                  key={h.id}
                  href={`#/run/${encodeURIComponent(h.id)}`}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-surface-2 border border-border-hairline text-sm font-medium text-text hover:border-brand transition-colors truncate max-w-xs"
                >
                  <span className="font-mono text-brand text-sm">{h.id}</span>
                  <span className="truncate text-text-muted text-sm">{h.question}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 border-t border-border-hairline text-center text-sm text-text-muted">
        &copy; 2026 Sarvam. Built for decision-grade autonomous research.
      </footer>
    </div>
  );
}
