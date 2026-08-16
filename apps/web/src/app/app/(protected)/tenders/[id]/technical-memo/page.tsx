import type { Metadata } from "next";
import { fetchTechnicalMemos } from "../../../../technical-memo-actions";
import type { TechnicalMemo } from "../../../../../../lib/technical-memo-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { TechnicalMemoSection } from "./technical-memo-section";

export const metadata: Metadata = { title: "Rédaction IA du mémoire — TenderOS" };

export default async function TenderTechnicalMemoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let memos: TechnicalMemo[];
  try {
    memos = await fetchTechnicalMemos(tenderId);
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Rédaction IA du mémoire" }]}
        title="Rédaction IA du mémoire technique"
        description="Générez votre mémoire technique à partir de votre propre modèle DOCX, de la trame imposée par le DCE, ou du modèle standard TenderOS. Chaque section est rédigée séparément, avec ses sources, et reste soumise à votre validation avant export."
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/technical-memo`} />
      <TechnicalMemoSection tenderId={tenderId} initialMemos={memos} />
    </div>
  );
}
