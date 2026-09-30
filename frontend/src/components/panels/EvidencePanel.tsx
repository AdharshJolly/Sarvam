import type { ComponentProps } from "react";
import { ClaimList } from "../ClaimList";
import { PlanTree } from "../PlanTree";
import { SourcesTable } from "../SourcesTable";
import { Panel } from "../ui/Panel";

/** Evidence tab: plan, sources and claims (F4 decision). Props-only; data comes from the run store. */
export function EvidencePanel({
  plan,
  sources,
  claims,
}: {
  plan: ComponentProps<typeof PlanTree>;
  sources: ComponentProps<typeof SourcesTable>;
  claims: ComponentProps<typeof ClaimList>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Plan">
        <PlanTree {...plan} />
      </Panel>
      <Panel title="Sources" id="sources">
        <SourcesTable {...sources} />
      </Panel>
      <Panel title="Claims" id="claims">
        <ClaimList {...claims} />
      </Panel>
    </div>
  );
}
