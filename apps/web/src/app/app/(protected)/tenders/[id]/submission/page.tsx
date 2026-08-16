import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { TenderSubmissionCapabilities, TenderSubmissionReadinessResult, TenderSubmissionSummary } from "../../../../../../lib/submission-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { SubmissionSection } from "./submission-section";

export const metadata: Metadata = { title: "Dépôt — TenderOS" };

export default async function TenderSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let readiness: TenderSubmissionReadinessResult;
  let capabilities: TenderSubmissionCapabilities;
  let submissions: TenderSubmissionSummary[];
  try {
    [readiness, capabilities, submissions] = await Promise.all([
      appApiFetch<TenderSubmissionReadinessResult>(`/api/v1/tenders/${tenderId}/submission-readiness`),
      appApiFetch<TenderSubmissionCapabilities>(`/api/v1/tenders/${tenderId}/submission-capabilities`),
      appApiFetch<TenderSubmissionSummary[]>(`/api/v1/tenders/${tenderId}/submissions`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Dépôt" }]}
        title="Dépôt"
        description="TenderOS prépare et trace votre dépôt. Le dépôt sur la plateforme acheteur reste une action manuelle."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/submission`} />
      <SubmissionSection tenderId={tenderId} initialReadiness={readiness} initialCapabilities={capabilities} initialSubmissions={submissions} />
    </div>
  );
}
