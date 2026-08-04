import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../../lib/app-api-client";
import { DELIVERABLE_TYPE_LABELS, OVERLAY_DELIVERABLE_TYPES, READ_ONLY_DELIVERABLE_TYPES, STRUCTURED_DELIVERABLE_TYPES, type DeliverableSummary } from "../../../../../../../lib/deliverable-types";
import type { DocumentSummary, PageResponse } from "../../../../../../../lib/documents-types";
import { ApiErrorState } from "../../../../api-error-state";
import { MemoEditor } from "./memo-editor";
import { OverlayDeliverable } from "./overlay-deliverable";
import { ReadOnlyDeliverable } from "./read-only-deliverable";

export const metadata: Metadata = { title: "Livrable — TenderOS" };

export default async function DeliverableDetailPage({ params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const { id: tenderId, deliverableId } = await params;

  let deliverable: DeliverableSummary;
  let actorRole: string | undefined;
  try {
    [deliverable, actorRole] = await Promise.all([appApiFetch<DeliverableSummary>(`/api/v1/deliverables/${deliverableId}`), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  // Mission — correctif "aucun moyen de faire avancer le statut d'une annexe/pièce déjà créée" :
  // liste des documents de l'organisation disponibles pour rattachement (sélecteur ci-dessous sur
  // Checklist/Annexes) — jamais bloquant pour la liste des entrées elle-même si cet appel échoue.
  const fetchAvailableDocuments = () =>
    appApiFetch<PageResponse<DocumentSummary>>("/api/v1/documents?limit=100")
      .then((page) => page.items)
      .catch(() => []);

  let complianceEntries: { id: string; source: string; mandatory: boolean; criticality: string; coverageStatus: string; response?: string }[] | undefined;
  let checklistEntries: { id: string; name: string; mandatory: boolean; status: string }[] | undefined;
  let annexEntries: { id: string; label: string; status: string }[] | undefined;
  let availableDocuments: DocumentSummary[] | undefined;
  if (deliverable.type === "COMPLIANCE_MATRIX") {
    complianceEntries = await appApiFetch(`/api/v1/deliverables/${deliverableId}/compliance-matrix`);
  } else if (deliverable.type === "CHECKLIST") {
    [checklistEntries, availableDocuments] = await Promise.all([
      appApiFetch<{ id: string; name: string; mandatory: boolean; status: string }[]>(`/api/v1/deliverables/${deliverableId}/checklist`),
      fetchAvailableDocuments(),
    ]);
  } else if (deliverable.type === "ANNEXES") {
    [annexEntries, availableDocuments] = await Promise.all([
      appApiFetch<{ id: string; label: string; status: string }[]>(`/api/v1/deliverables/${deliverableId}/annexes`),
      fetchAvailableDocuments(),
    ]);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{DELIVERABLE_TYPE_LABELS[deliverable.type] ?? deliverable.type}</h1>
      </div>
      {STRUCTURED_DELIVERABLE_TYPES.has(deliverable.type) ? <MemoEditor tenderId={tenderId} deliverable={deliverable} actorRole={actorRole} /> : null}
      {OVERLAY_DELIVERABLE_TYPES.has(deliverable.type) ? (
        <OverlayDeliverable
          tenderId={tenderId}
          deliverable={deliverable}
          actorRole={actorRole}
          complianceEntries={complianceEntries}
          checklistEntries={checklistEntries}
          annexEntries={annexEntries}
          availableDocuments={availableDocuments}
        />
      ) : null}
      {READ_ONLY_DELIVERABLE_TYPES.has(deliverable.type) ? <ReadOnlyDeliverable tenderId={tenderId} deliverable={deliverable} /> : null}
    </div>
  );
}
