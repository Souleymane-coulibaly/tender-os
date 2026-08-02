import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { ExportJobSummary } from "../../../../../../lib/export-types";
import type { SignatorySummary, SignatureRequirementSummary, SignatureTransactionSummary } from "../../../../../../lib/signature-types";
import { ApiErrorState } from "../../../api-error-state";
import { SignatureSection } from "./signature-section";

export const metadata: Metadata = { title: "Signature — TenderOS" };

export default async function TenderSignaturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let requirements: SignatureRequirementSummary[];
  let signatories: SignatorySummary[];
  let transactions: SignatureTransactionSummary[];
  let finalExports: { items: ExportJobSummary[]; total: number };
  let actorRole: string | undefined;
  try {
    [requirements, signatories, transactions, finalExports, actorRole] = await Promise.all([
      appApiFetch<SignatureRequirementSummary[]>(`/api/v1/tenders/${tenderId}/signature-requirements`),
      appApiFetch<SignatorySummary[]>(`/api/v1/tenders/${tenderId}/signatories`),
      appApiFetch<SignatureTransactionSummary[]>(`/api/v1/tenders/${tenderId}/signature-transactions`),
      appApiFetch<{ items: ExportJobSummary[]; total: number }>(`/api/v1/tenders/${tenderId}/exports?mode=FINAL&limit=20&offset=0`),
      getCurrentMembershipRole(),
    ]);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Signature électronique</h1>
        <p className="text-sm text-neutral-600">
          Exigences de signature, signataires et transactions. Une image de signature n&apos;est jamais une preuve de signature électronique ; un statut « Signé » n&apos;est jamais considéré
          comme vérifié tant qu&apos;un contrôle d&apos;intégrité réel n&apos;a pas été exécuté.
        </p>
      </div>
      <SignatureSection
        tenderId={tenderId}
        initialRequirements={requirements}
        initialSignatories={signatories}
        initialTransactions={transactions}
        finalExports={finalExports.items.filter((j) => j.status === "COMPLETED")}
        actorRole={actorRole}
      />
    </div>
  );
}
