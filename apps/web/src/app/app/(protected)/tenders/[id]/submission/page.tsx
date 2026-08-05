import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { TenderSubmissionCapabilities, TenderSubmissionReadinessResult, TenderSubmissionSummary } from "../../../../../../lib/submission-types";
import { ApiErrorState } from "../../../api-error-state";
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
      <div>
        <h1 className="text-xl font-semibold">Dépôt</h1>
        <p className="text-sm text-neutral-600">
          TenderOS prépare et trace votre dépôt. Le dépôt sur la plateforme acheteur reste une action manuelle.
        </p>
      </div>
      <SubmissionSection tenderId={tenderId} initialReadiness={readiness} initialCapabilities={capabilities} initialSubmissions={submissions} />
    </div>
  );
}
