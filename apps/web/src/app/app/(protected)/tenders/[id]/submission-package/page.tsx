import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { SubmissionPackageSummary } from "../../../../../../lib/submission-package-types";
import { ApiErrorState } from "../../../api-error-state";
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
      <div>
        <h1 className="text-xl font-semibold">Dossier de soumission</h1>
        <p className="text-sm text-neutral-600">
          Package final (document exporté, pièces de signature vérifiées et manifest) — nécessite une approbation finale active et, si une signature est requise, une transaction vérifiée.
        </p>
      </div>
      <SubmissionPackageSection tenderId={tenderId} initialPackages={packages} actorRole={actorRole} />
    </div>
  );
}
