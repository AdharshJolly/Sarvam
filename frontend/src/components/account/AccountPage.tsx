import { useState } from "react";
import { useAuth } from "../../state/useAuth";
import { AppHeader } from "../layout/AppHeader";
import { Banner } from "../ui/Banner";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Dialog } from "../ui/Dialog";

export function AccountPage() {
  const { user, logout, updateProfile, deleteAccount, loading } = useAuth();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(null);
    setErrorMsg(null);

    if (!displayName.trim()) {
      setErrorMsg("Display name cannot be empty.");
      return;
    }

    if (password && password.length < 6) {
      setErrorMsg("New password must be at least 6 characters.");
      return;
    }

    if (password && password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        display_name: displayName.trim(),
        password: password ? password : undefined,
      });
      setSuccessMsg("Account details updated successfully.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== "DELETE") {
      setErrorMsg("Please type DELETE to confirm data purge.");
      return;
    }
    setDeleting(true);
    try {
      await deleteAccount();
      // deleteAccount redirects to #/
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete account.");
      setDeleting(false);
      setDeleteModalOpen(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-text selection:bg-brand selection:text-white">
      <AppHeader
        runId={null}
        question={undefined}
        mode={null}
        running={false}
        showMode={false}
        metrics={[]}
        onNewRun={() => {
          window.location.hash = "#/workspace";
        }}
        onOpenStatus={() => {}}
        onOpenActivity={() => {}}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header Breadcrumb */}
        <div className="flex items-center justify-between gap-4 mb-8 pb-4 border-b border-border-hairline">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
              User Account
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Manage your personal credentials, session controls, and data deletion rights.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#/workspace"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text px-3 py-2 rounded-lg border border-border-hairline hover:bg-surface transition-colors"
            >
              <Icon name="ArrowLeft" size={16} aria-hidden />
              <span>Workspace</span>
            </a>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleLogout}
              className="text-bad-fg hover:bg-bad-bg border-bad-border"
              icon={<Icon name="LogOut" size={15} aria-hidden />}
            >
              Sign Out
            </Button>
          </div>
        </div>

        {successMsg ? (
          <div className="mb-6">
            <Banner tone="ok">{successMsg}</Banner>
          </div>
        ) : null}

        {errorMsg ? (
          <div className="mb-6">
            <Banner tone="bad">{errorMsg}</Banner>
          </div>
        ) : null}

        {!user && !loading ? (
          <div className="p-8 text-center bg-surface border border-border-hairline rounded-xl">
            <p className="text-base text-text font-medium mb-4">
              You are currently signed out.
            </p>
            <a
              href="#/signin"
              className="inline-flex items-center justify-center text-sm font-medium text-white bg-brand px-4 py-2 rounded-lg hover:opacity-95 transition-opacity"
            >
              Sign In to Your Account
            </a>
          </div>
        ) : null}

        {user ? (
          <div className="space-y-8">
            {/* Account Overview Card */}
            <section className="bg-surface border border-border-hairline rounded-xl p-6">
              <h2 className="text-base font-semibold text-text uppercase tracking-wider mb-4 flex items-center gap-2">
                <Icon name="User" size={18} className="text-brand" aria-hidden />
                Identity & Access Summary
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 bg-background border border-border-hairline rounded-lg">
                  <span className="text-sm font-medium text-text-muted uppercase tracking-wider block mb-1">
                    Email Address
                  </span>
                  <span className="text-sm font-semibold text-text font-mono truncate block" title={user.email}>
                    {user.email}
                  </span>
                </div>

                <div className="p-4 bg-background border border-border-hairline rounded-lg">
                  <span className="text-sm font-medium text-text-muted uppercase tracking-wider block mb-1">
                    User Identifier
                  </span>
                  <span className="text-sm font-mono text-text truncate block" title={user.id}>
                    {user.id}
                  </span>
                </div>

                <div className="p-4 bg-background border border-border-hairline rounded-lg">
                  <span className="text-sm font-medium text-text-muted uppercase tracking-wider block mb-1">
                    System Role
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-2 py-0.5 rounded bg-brand/10 text-brand border border-brand/20">
                    <Icon name="Shield" size={13} aria-hidden />
                    Research Analyst / Auditor
                  </span>
                </div>

                <div className="p-4 bg-background border border-border-hairline rounded-lg">
                  <span className="text-sm font-medium text-text-muted uppercase tracking-wider block mb-1">
                    Member Since
                  </span>
                  <span className="text-sm text-text font-mono">
                    {new Date(user.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <div className="p-4 bg-background border border-border-hairline rounded-lg">
                  <span className="text-sm font-medium text-text-muted uppercase tracking-wider block mb-1">
                    Active Session Expiry
                  </span>
                  <span className="text-sm text-text font-mono">7 Days (PBKDF2/SHA-256)</span>
                </div>

                <div className="p-4 bg-background border border-border-hairline rounded-lg">
                  <span className="text-sm font-medium text-text-muted uppercase tracking-wider block mb-1">
                    Telemetry & Ads
                  </span>
                  <span className="text-sm text-ok-fg font-medium flex items-center gap-1">
                    <Icon name="CheckCircle" size={14} aria-hidden />
                    Zero Data Tracking
                  </span>
                </div>
              </div>
            </section>

            {/* Profile Edit Form */}
            <section className="bg-surface border border-border-hairline rounded-xl p-6">
              <h2 className="text-base font-semibold text-text uppercase tracking-wider mb-2 flex items-center gap-2">
                <Icon name="SlidersHorizontal" size={18} className="text-brand" aria-hidden />
                Change Personal Details
              </h2>
              <p className="text-sm text-text-muted mb-6">
                Update your visible display name or set a new account password.
              </p>

              <form onSubmit={handleUpdate} className="space-y-5 max-w-xl">
                <div>
                  <label htmlFor="displayNameInput" className="block text-sm font-medium text-text mb-1.5">
                    Display Name
                  </label>
                  <input
                    id="displayNameInput"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-background border border-border-hairline rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
                    placeholder="e.g. Arrin Paul"
                  />
                </div>

                <div className="pt-2 border-t border-border-hairline">
                  <span className="block text-sm font-semibold text-text mb-1">
                    Change Password (Optional)
                  </span>
                  <span className="block text-sm text-text-muted mb-3">
                    Leave blank if you do not want to alter your current password.
                  </span>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="newPasswordInput" className="block text-sm font-medium text-text mb-1">
                        New Password
                      </label>
                      <input
                        id="newPasswordInput"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-background border border-border-hairline rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
                        placeholder="At least 6 characters"
                      />
                    </div>

                    <div>
                      <label htmlFor="confirmPasswordInput" className="block text-sm font-medium text-text mb-1">
                        Confirm New Password
                      </label>
                      <input
                        id="confirmPasswordInput"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-background border border-border-hairline rounded-lg text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
                        placeholder="Repeat new password"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="bg-brand text-white font-medium px-5 py-2 rounded-lg hover:opacity-95"
                  >
                    {saving ? "Saving Changes..." : "Save Profile Details"}
                  </Button>
                </div>
              </form>
            </section>

            {/* Session Management & Sign Out Card */}
            <section className="bg-surface border border-border-hairline rounded-xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-text uppercase tracking-wider mb-1 flex items-center gap-2">
                    <Icon name="LogOut" size={18} className="text-brand" aria-hidden />
                    Current Session &amp; Sign Out
                  </h2>
                  <p className="text-sm text-text-muted">
                    Sign out of your active account session on this device and return to the research portal.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleLogout}
                  className="shrink-0 text-bad-fg hover:bg-bad-bg border-bad-border font-medium px-4 py-2"
                  icon={<Icon name="LogOut" size={16} aria-hidden />}
                >
                  Sign Out of Account
                </Button>
              </div>
            </section>

            {/* Data Deletion & Privacy Rights Card */}
            <section className="bg-surface border border-bad-border/40 rounded-xl p-6">

              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="max-w-xl">
                  <h2 className="text-base font-semibold text-bad-fg flex items-center gap-2 mb-1.5">
                    <Icon name="Trash2" size={18} aria-hidden />
                    Data Deletion Request (GDPR / DPDP Compliance)
                  </h2>
                  <p className="text-sm text-text-muted leading-relaxed">
                    You have the permanent right to erase your user profile and all personal research data. 
                    Executing this request deletes your user account row, revokes all active session tokens, 
                    and strips user identifiers from all saved research runs.
                  </p>
                </div>
                <Button
                  variant="danger"
                  onClick={() => setDeleteModalOpen(true)}
                  className="shrink-0 text-bad-fg border-bad-border hover:bg-bad-bg"
                >
                  Request Data Deletion
                </Button>
              </div>
            </section>
          </div>
        ) : null}
      </main>

      {/* Confirmation Dialog for Data Deletion */}
      <Dialog
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirm Permanent Data Deletion"
      >
        <div className="p-6 space-y-4">
          <p className="text-sm text-text leading-relaxed">
            This action is irreversible. It will delete your user record, invalidate all active auth sessions, 
            and dissociate your identity from all past investigations.
          </p>
          <div>
            <label htmlFor="confirmDeleteField" className="block text-sm font-semibold text-text uppercase tracking-wider mb-1.5">
              Type <span className="text-bad-fg">DELETE</span> to confirm:
            </label>
            <input
              id="confirmDeleteField"
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border-hairline rounded text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-bad-fg"
              placeholder="DELETE"
            />
          </div>
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-hairline">
            <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteConfirmText !== "DELETE" || deleting}
              onClick={handleDeleteAccount}
              className="bg-bad-fg text-white hover:opacity-90 border-transparent"
            >
              {deleting ? "Purging Data..." : "Permanently Delete My Data"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
