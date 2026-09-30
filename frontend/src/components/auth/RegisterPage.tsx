import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../state/useAuth";
import { Icon } from "../ui/Icon";

export function RegisterPage() {
  const { user, register, error, clearError } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      const dest = sessionStorage.getItem("sarvam_auth_redirect") || "#/workspace";
      sessionStorage.removeItem("sarvam_auth_redirect");
      window.location.hash = dest;
    }
  }, [user]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email || !password || !displayName || submitting) return;
    if (password.length < 6) {
      setLocalError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      await register(email, password, displayName);
      const dest = sessionStorage.getItem("sarvam_auth_redirect") || "#/workspace";
      sessionStorage.removeItem("sarvam_auth_redirect");
      window.location.hash = dest;
    } catch {
      // error is set in auth context
    } finally {
      setSubmitting(false);
    }
  }

  const activeError = localError || error;

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background ambient mesh */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-accent/40 rounded-full blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      <div className="w-full max-w-md relative z-10">
        {/* Brand header */}
        <div className="text-center mb-8">
          <a
            href="#/"
            className="inline-block mb-4 transition-transform hover:scale-105"
          >
            <span className="font-bold text-3xl tracking-tight text-text">
              SARVAM
            </span>
          </a>
          <h1 className="text-2xl font-bold text-text tracking-tight">
            Create Research Account
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Join the autonomous evidence-first research workspace
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-border-hairline rounded-[1.3rem] p-7 shadow-sm">
          {activeError && (
            <div className="mb-5 p-3.5 bg-bad-bg border border-bad-border rounded-xl text-sm text-bad-fg flex items-start gap-2.5">
              <Icon name="AlertTriangle" size={16} className="mt-0.5 shrink-0 text-bad-fg" />
              <div className="flex-1 leading-relaxed">{activeError}</div>
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  clearError();
                }}
                className="text-bad-fg/70 hover:text-bad-fg"
                aria-label="Dismiss"
              >
                <Icon name="Minus" size={14} />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="register-name"
                className="block text-sm font-semibold text-text mb-1.5 uppercase tracking-wider"
              >
                Full Name / Title
              </label>
              <input
                id="register-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Dr. Eleanor Vance"
                className="w-full h-11 px-3.5 bg-surface-2 border border-border-hairline rounded-xl text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="register-email"
                className="block text-sm font-semibold text-text mb-1.5 uppercase tracking-wider"
              >
                Institutional Email
              </label>
              <input
                id="register-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="eleanor@laboratory.org"
                className="w-full h-11 px-3.5 bg-surface-2 border border-border-hairline rounded-xl text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="register-password"
                className="block text-sm font-semibold text-text mb-1.5 uppercase tracking-wider"
              >
                Password (min 6 characters)
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            <div>
              <label
                htmlFor="register-confirm"
                className="block text-sm font-semibold text-text mb-1.5 uppercase tracking-wider"
              >
                Confirm Password
              </label>
              <input
                id="register-confirm"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-11 px-3.5 bg-surface-2 border border-border-hairline rounded-xl text-sm text-text placeholder:text-text-muted/60 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-11 mt-2 bg-brand hover:opacity-90 text-white font-medium text-sm rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Icon name="RefreshCw" size={16} className="animate-spin" />
                  <span>Provisioning Account...</span>
                </>
              ) : (
                <>
                  <span>Create Research Account</span>
                  <Icon name="ArrowRight" size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-border-hairline text-center">
            <p className="text-sm text-text-muted">
              Already have an account?{" "}
              <a
                href="#/signin"
                className="font-medium text-brand hover:underline"
              >
                Sign in
              </a>
            </p>
          </div>
        </div>

        <div className="mt-6 text-center">
          <a
            href="#/"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
          >
            <Icon name="CornerDownLeft" size={14} />
            <span>Back to Public Workspace</span>
          </a>
        </div>
      </div>
    </div>
  );
}
