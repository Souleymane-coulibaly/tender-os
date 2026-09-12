import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type {
  ExportCapabilities,
  ExportJobSummary,
  ExportTemplateSummary,
} from "../../../../../../lib/export-types";
import type { GenerationSummary } from "../../../../../../lib/generation-types";
import type { PricingEstimateSummary } from "../../../../../../lib/pricing-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { fetchExportCapabilities } from "../../../../export-actions";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { ExportSection } from "./export-section";

export const metadata: Metadata = { title: "Export — TenderOS" };

export default async function TenderExportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let templates: ExportTemplateSummary[];
  let history: { items: ExportJobSummary[]; total: number };
  let actorRole: string | undefined;
  let capabilities: ExportCapabilities;
  let generations: { items: GenerationSummary[]; total: number };
  let estimates: { items: PricingEstimateSummary[]; total: number };
  try {
    [templates, history, actorRole, capabilities, generations, estimates] = await Promise.all([
      appApiFetch<ExportTemplateSummary[]>("/api/v1/exports/templates"),
      appApiFetch<{ items: ExportJobSummary[]; total: number }>(
        `/api/v1/tenders/${tenderId}/exports?limit=50&offset=0`,
      ),
      getCurrentMembershipRole(),
      fetchExportCapabilities(tenderId),
      // Sources proposées dans les sections : plus d'identifiant technique à recopier à la main.
      appApiFetch<{ items: GenerationSummary[]; total: number }>(
        "/api/v1/tenders/" + tenderId + "/generations?limit=100&offset=0",
      ),
      appApiFetch<{ items: PricingEstimateSummary[]; total: number }>(
        "/api/v1/tenders/" + tenderId + "/pricing/estimates?limit=100&offset=0",
      ),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guideKey="tender-export"
        breadcrumb={[
          { label: "Appels d'offres", href: "/app/tenders" },
          { label: "Dossier", href: `/app/tenders/${tenderId}` },
          { label: "Export" },
        ]}
        title="Export documentaire"
        description="Génère un aperçu du document à partir d'un template et du contenu déjà produit (générations IA, estimations de coût, contenu manuel). L'export FINAL figé n'est produit qu'après approbation dans l'onglet Validation."
      />
      <TabsNav
        items={buildTenderNavTabs(tenderId)}
        activeHref={`/app/tenders/${tenderId}/export`}
      />
      <ExportSection
        tenderId={tenderId}
        templates={templates}
        history={history.items}
        actorRole={actorRole}
        capabilities={capabilities}
        generations={generations.items}
        estimates={estimates.items}
      />
    </div>
  );
}
