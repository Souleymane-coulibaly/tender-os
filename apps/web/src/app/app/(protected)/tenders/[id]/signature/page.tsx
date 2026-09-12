import type { Metadata } from "next";
import { appApiFetch, getCurrentMembershipRole } from "../../../../../../lib/app-api-client";
import type { ExportJobSummary } from "../../../../../../lib/export-types";
import type { SignatorySummary, SignatureRequirementSummary, SignatureTransactionSummary } from "../../../../../../lib/signature-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
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
      <PageHeader
        guideKey="tender-signature"
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Signature" }]}
        title="Signature électronique"
        description="Exigences de signature, signataires et transactions. Une image de signature n'est jamais une preuve de signature électronique ; un statut « Signé » n'est jamais considéré comme vérifié tant qu'un contrôle d'intégrité réel n'a pas été exécuté."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/signature`} />
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
