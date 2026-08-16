import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { DeliverableSummary } from "../../../../../../lib/deliverable-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
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
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Livrables" }]}
        title="Livrables"
        description="Mémoire technique, synthèse exécutive, matrice de conformité, checklist, rapports et documents de soumission — structurés, générés par IA, édités et validés depuis un seul espace."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/deliverables`} />
      <DeliverablesSection tenderId={tenderId} deliverables={deliverables} actorRole={actorRole} />
    </div>
  );
}
