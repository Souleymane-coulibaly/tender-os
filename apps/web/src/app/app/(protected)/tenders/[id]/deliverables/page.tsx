import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { DeliverableSummary } from "../../../../../../lib/deliverable-types";
import { ApiErrorState } from "../../../api-error-state";
import { DeliverablesSection } from "./deliverables-section";

export const metadata: Metadata = { title: "Livrables — TenderOS" };

export default async function TenderDeliverablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let deliverables: DeliverableSummary[];
  let actorRole: string | undefined;
  try {
    [deliverables, actorRole] = await Promise.all([appApiFetch<DeliverableSummary[]>(`/api/v1/tenders/${tenderId}/deliverables`), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Livrables</h1>
        <p className="text-sm text-neutral-600">
          Mémoire technique, synthèse exécutive, matrice de conformité, checklist, rapports et documents de soumission — structurés, générés par IA, édités et validés depuis un seul espace.
        </p>
      </div>
      <DeliverablesSection tenderId={tenderId} deliverables={deliverables} actorRole={actorRole} />
    </div>
  );
}
