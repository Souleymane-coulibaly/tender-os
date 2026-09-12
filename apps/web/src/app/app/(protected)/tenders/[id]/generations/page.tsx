import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import { fetchGenerationCapabilities } from "../../../../generation-actions";
import { GENERATION_TASK_TYPE_LABELS, type GenerationCapability, type GenerationSummary } from "../../../../../../lib/generation-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { GenerationSection } from "./generation-section";

export const metadata: Metadata = { title: "Générations — TenderOS" };

export default async function TenderGenerationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let generations: { items: GenerationSummary[]; total: number };
  let capabilities: GenerationCapability[];
  let actorRole: string | undefined;
  try {
    [generations, capabilities, actorRole] = await Promise.all([
      appApiFetch<{ items: GenerationSummary[]; total: number }>(`/api/v1/tenders/${tenderId}/generations?limit=50&offset=0`),
      fetchGenerationCapabilities(tenderId),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        guideKey="tender-generations"
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Générations" }]}
        title="Générations de contenu"
        description="Contenus générés par IA pour ce Tender, à partir des analyses, de la Base de connaissances et de prompts versionnés. Toute génération doit être relue et validée par un humain avant utilisation."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/generations`} />
      <GenerationSection
        tenderId={tenderId}
        initialGenerations={generations.items}
        actorRole={actorRole}
        taskTypeLabels={GENERATION_TASK_TYPE_LABELS}
        capabilities={capabilities}
      />
    </div>
  );
}
