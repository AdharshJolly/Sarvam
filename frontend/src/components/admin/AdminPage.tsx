import { useEffect, useState, useMemo, type FormEvent } from "react";
import type { Run, RunStatus } from "@contracts/types";
import { api } from "../../api/client";
import { useAuth } from "../../state/useAuth";
import { Icon } from "../ui/Icon";
import { StateChip } from "../ui/StateChip";
import { runStatusChip } from "../ui/chips";
import { ThemeToggle } from "../layout/ThemeToggle";

export function AdminPage() {
  const { user, login, logout, error: authError, clearError } = useAuth();
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // In-page login state for unauthenticated access
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  async function fetchRuns(isRefresh = false) {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const list = await api.listRuns();
      setRuns(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (user) {
      fetchRuns();
    } else {
      setLoading(false);
    }
  }, [user]);

  async function handleStop(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setStoppingId(id);
    try {
      await api.stopRun(id);
      setRuns((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "stopped" as RunStatus } : r))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to stop run ${id}`);
    } finally {
      setStoppingId(null);
    }
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    if (!loginEmail || !loginPassword || loginSubmitting) return;
    setLoginSubmitting(true);
    try {
      await login(loginEmail, loginPassword);
    } catch {
      // error is set in auth context
    } finally {
      setLoginSubmitting(false);
    }
  }

  const filteredRuns = useMemo(() => {
    if (!search.trim()) return runs;
    const q = search.toLowerCase();
    return runs.filter(
      (r) => r.id.toLowerCase().includes(q) || r.question.toLowerCase().includes(q)
    );
  }, [runs, search]);

  // If user is not authenticated, prompt for User ID and password
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
          <div className="w-full max-w-md bg-surface border border-border-hairline rounded-[1.3rem] p-7 sm:p-8 shadow-sm">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-xl bg-accent text-brand flex items-center justify-center mx-auto mb-4">
                <Icon name="ShieldCheck" size={24} aria-hidden />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-text">
                Investigation History
              </h1>
              <p className="text-sm text-text-muted mt-1.5 leading-relaxed">
                Enter your researcher email and password to access investigation logs and historical verification records.
              </p>
            </div>

            {authError && (
              <div className="mb-5 p-3.5 bg-bad-bg border border-bad-border rounded-xl text-sm text-bad-fg flex items-start gap-2.5">
                <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0 text-bad-fg" />
                <div className="flex-1 leading-relaxed">{authError}</div>
                <button
                  type="button"
                  onClick={clearError}
                  className="text-bad-fg/70 hover:text-bad-fg"
                  aria-label="Dismiss error"
                >
                  <Icon name="Minus" size={14} />
                </button>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="history-login-email"
                  className="block text-sm font-semibold text-text mb-1.5 uppercase tracking-wider"
                >
                  Researcher ID / Email
                </label>
                <input
                  id="history-login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="analyst@institute.org"
                  className="w-full h-11 px-3.5 bg-surface-2 border border-border-hairline rounded-xl text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                />
              </div>

              <div>
                <label
                  htmlFor="history-login-password"
                  className="block text-sm font-semibold text-text mb-1.5 uppercase tracking-wider"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="history-login-password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full h-11 pl-3.5 pr-14 bg-surface-2 border border-border-hairline rounded-xl text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-muted hover:text-text font-medium transition-colors"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginSubmitting}
                className="w-full h-11 mt-2 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loginSubmitting ? (
                  <>
                    <Icon name="RefreshCw" size={16} className="animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Access History</span>
                    <Icon name="ArrowRight" size={16} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-border-hairline text-center">
              <p className="text-sm text-text-muted">
                Need an account?{" "}
                <a
                  href="#/register"
                  onClick={() => sessionStorage.setItem("sarvam_auth_redirect", "#/history")}
                  className="font-medium text-brand hover:underline"
                >
                  Create research account
                </a>
              </p>
            </div>

            <div className="mt-4 text-center">
              <a
                href="#/"
                className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
              >
                <Icon name="CornerDownLeft" size={14} />
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
            Investigation History
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fetchRuns(true)}
            disabled={refreshing || loading}
            className="h-8 px-3 border border-border-hairline hover:bg-surface text-text-muted text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            title="Refresh runs list"
          >
            <Icon name="RefreshCw" size={14} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <a
            href="#/workspace"
            className="h-8 px-3.5 bg-brand hover:opacity-90 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Icon name="Plus" size={14} />
            <span>New Run</span>
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
              <Icon name="Minus" size={14} />
            </button>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text">
              Investigation Audit History
            </h1>
            <p className="text-sm text-text-muted mt-0.5">
              Review all autonomous research pipelines, status verifications, and run records
            </p>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by question or ID..."
              className="w-full h-9 px-3.5 bg-surface-2 border border-border-hairline rounded-lg text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
            />
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-bad-bg border border-bad-border rounded-xl text-sm text-bad-fg flex items-center gap-2">
            <Icon name="AlertTriangle" size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="bg-surface border border-border-hairline rounded-[1.3rem] overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-sm text-text-muted flex flex-col items-center gap-3">
              <Icon name="RefreshCw" size={20} className="animate-spin text-brand" />
              <span>Loading investigation records...</span>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="p-12 text-center text-sm text-text-muted flex flex-col items-center gap-2">
              <Icon name="FileText" size={28} className="text-text-muted/40" />
              <p className="font-medium text-text">
                {runs.length === 0 ? "No investigations recorded yet" : "No matching investigations"}
              </p>
              <p>
                {runs.length === 0
                  ? "Start a new autonomous run from the research workspace"
                  : "Try clearing your search query"}
              </p>
              {runs.length === 0 ? (
                <a
                  href="#/workspace"
                  className="mt-3 px-4 py-2 bg-brand text-white rounded-lg font-medium text-sm hover:opacity-90 transition-colors"
                >
                  Start a Research Run
                </a>
              ) : null}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border-hairline bg-surface-2/60 text-text-muted font-semibold uppercase tracking-wider text-sm">
                    <th className="py-3 px-4">Run ID</th>
                    <th className="py-3 px-4">Research Question</th>
                    <th className="py-3 px-3">Mode</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-4">Started At</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-hairline">
                  {filteredRuns.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-surface-2/40 transition-colors group cursor-pointer"
                      onClick={() => {
                        window.location.hash = `#/run/${encodeURIComponent(r.id)}`;
                      }}
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-brand">
                        {r.id}
                      </td>
                      <td className="py-3.5 px-4 max-w-md font-medium text-text truncate">
                        {r.question}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-sm font-semibold bg-accent text-brand border border-border-hairline">
                          {r.mode}
                        </span>
                      </td>
                      <td className="py-3.5 px-3">
                        <StateChip spec={runStatusChip(r.status)} />
                      </td>
                      <td className="py-3.5 px-4 text-text-muted">
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.status === "running" && (
                            <button
                              type="button"
                              onClick={(e) => handleStop(e, r.id)}
                              disabled={stoppingId === r.id}
                              className="px-2.5 py-1 text-sm font-semibold rounded-md border border-bad-border text-bad-fg hover:bg-bad-bg transition-colors disabled:opacity-50"
                              title="Stop this run"
                            >
                              {stoppingId === r.id ? "Stopping..." : "Stop"}
                            </button>
                          )}
                          <a
                            href={`#/run/${encodeURIComponent(r.id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-brand hover:underline font-medium"
                          >
                            <span>Open</span>
                            <Icon name="ArrowRight" size={14} />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
