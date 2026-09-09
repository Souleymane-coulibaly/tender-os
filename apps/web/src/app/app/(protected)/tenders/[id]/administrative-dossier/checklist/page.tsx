import type { Metadata } from "next";
import { appApiFetch } from "../../../../../../../lib/app-api-client";
import type {
  AdministrativeChecklist,
  AdministrativeDocumentTypeMetadata,
  AdministrativeDossierCapabilities,
  AdministrativeRequirementSummary,
} from "../../../../../../../lib/administrative-dossier-types";
import type { DocumentSummary } from "../../../../../../../lib/documents-types";
import { ApiErrorState } from "../../../../api-error-state";
import { AdministrativeChecklistSection } from "./administrative-checklist-section";

export const metadata: Metadata = { title: "Checklist administrative — TenderOS" };

export default async function AdministrativeChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tenderId } = await params;

  try {
    const [checklist, requirements, capabilities, tenderDocuments, documentTypes] =
      await Promise.all([
        appApiFetch<AdministrativeChecklist>(
          `/api/v1/tenders/${tenderId}/administrative-checklist`,
        ),
        appApiFetch<AdministrativeRequirementSummary[]>(
          `/api/v1/tenders/${tenderId}/administrative-requirements`,
        ),
        appApiFetch<AdministrativeDossierCapabilities>(
          `/api/v1/tenders/${tenderId}/administrative-dossier/capabilities`,
        ),
        appApiFetch<DocumentSummary[]>(`/api/v1/tenders/${tenderId}/documents`),
        appApiFetch<AdministrativeDocumentTypeMetadata[]>(`/api/v1/administrative-document-types`),
      ]);

    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Checklist administrative</h1>
          <p className="text-sm text-tenderos-slate">
            {checklist.completionPercentage}% des pièces obligatoires sont prêtes.
          </p>
        </div>
        <AdministrativeChecklistSection
          tenderId={tenderId}
          checklist={checklist}
          requirements={requirements}
          capabilities={capabilities}
          availableDocuments={tenderDocuments.map((d) => ({ id: d.id, title: d.title }))}
          documentTypes={documentTypes}
        />
      </div>
    );
  } catch (error) {
    return <ApiErrorState error={error} />;
  }
}
