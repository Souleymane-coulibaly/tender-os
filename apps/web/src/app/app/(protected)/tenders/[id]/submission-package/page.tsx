import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { SubmissionPackageSummary } from "../../../../../../lib/submission-package-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { SubmissionPackageSection } from "./submission-package-section";

export const metadata: Metadata = { title: "Dossier de soumission — TenderOS" };

export default async function TenderSubmissionPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let packages: SubmissionPackageSummary[];
  let actorRole: string | undefined;
  try {
    [packages, actorRole] = await Promise.all([appApiFetch<SubmissionPackageSummary[]>(`/api/v1/tenders/${tenderId}/packages`), getCurrentMembershipRole()]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guideKey="tender-submission-package"
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Dossier de soumission" }]}
        title="Dossier de soumission"
        description="Package final (document exporté, pièces de signature vérifiées et manifest) — nécessite une approbation finale active et, si une signature est requise, une transaction vérifiée."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/submission-package`} />
      <SubmissionPackageSection tenderId={tenderId} initialPackages={packages} actorRole={actorRole} />
    </div>
  );
}
