import type { UserUsage } from "@contracts/types";
import { formatUsd } from "../../lib/format";
import { Banner } from "../ui/Banner";
import { Icon } from "../ui/Icon";

export function roleLabel(role: "user" | "admin" | undefined): string {
  return role === "admin" ? "Administrator" : "Researcher";
}

/** Share of the quota already spent, clamped to 0..100; null when there is no quota. */
export function quotaPercent(usage: UserUsage): number | null {
  if (usage.quota_usd == null) return null;
  if (usage.quota_usd <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((usage.cost_usd / usage.quota_usd) * 100)));
}

export function AccountUsage({
  usage,
  error,
}: {
  usage: UserUsage | null;
  error: string | null;
}) {
  const pct = usage ? quotaPercent(usage) : null;
  const exhausted = usage?.quota_usd != null && (usage.remaining_usd ?? 0) <= 0;
  return (
    <section className="rounded-xl border border-border-hairline bg-surface p-6" aria-labelledby="usage-h">
      <h2
        id="usage-h"
        className="mb-4 flex items-center gap-2 text-base font-semibold uppercase tracking-wider text-text"
      >
        <Icon name="Coins" size={18} className="text-brand" aria-hidden />
        Usage &amp; quota
      </h2>
      {error ? (
        <Banner tone="warn">Usage could not be loaded: {error}</Banner>
      ) : !usage ? (
        <p className="text-sm text-text-muted" role="status">
          Loading usage…
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Tile label="Research runs" value={String(usage.run_count)} />
            <Tile label="Metered cost" value={formatUsd(usage.cost_usd)} />
            <Tile
              label="Quota"
              value={usage.quota_usd == null ? "Unlimited" : formatUsd(usage.quota_usd)}
            />
          </div>
          {pct != null ? (
            <div>
              <div
                role="progressbar"
                aria-label="Quota used"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
                className="h-2 rounded bg-surface-2"
              >
                <div
                  className={`h-2 rounded ${exhausted ? "bg-bad-fg" : "bg-brand"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-1 text-sm text-text-muted">
                {pct}% used · {formatUsd(usage.remaining_usd ?? 0)} remaining
              </p>
            </div>
          ) : null}
          {exhausted ? (
            <Banner tone="bad">
              Your cost quota is used up, so new runs are refused. Ask an administrator to raise it.
            </Banner>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-hairline bg-bg p-4">
      <span className="mb-1 block text-sm font-medium uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <span className="mono text-lg font-semibold">{value}</span>
    </div>
  );
}
