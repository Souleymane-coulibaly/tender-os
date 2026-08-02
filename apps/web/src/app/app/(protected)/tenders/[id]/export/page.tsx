import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { ExportJobSummary, ExportTemplateSummary } from "../../../../../../lib/export-types";
import { ApiErrorState } from "../../../api-error-state";
import { ExportSection } from "./export-section";

export const metadata: Metadata = { title: "Export — TenderOS" };

export default async function TenderExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let templates: ExportTemplateSummary[];
  let history: { items: ExportJobSummary[]; total: number };
  let actorRole: string | undefined;
  try {
    [templates, history, actorRole] = await Promise.all([
      appApiFetch<ExportTemplateSummary[]>("/api/v1/exports/templates"),
      appApiFetch<{ items: ExportJobSummary[]; total: number }>(`/api/v1/tenders/${tenderId}/exports?limit=50&offset=0`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Export documentaire</h1>
        <p className="text-sm text-neutral-600">
          Génère un aperçu du document à partir d&apos;un template et du contenu déjà produit (générations IA, estimations de coût, contenu manuel). L&apos;export FINAL figé n&apos;est produit
          qu&apos;après approbation dans l&apos;onglet Validation.
        </p>
      </div>
      <ExportSection tenderId={tenderId} templates={templates} history={history.items} actorRole={actorRole} />
    </div>
  );
}
