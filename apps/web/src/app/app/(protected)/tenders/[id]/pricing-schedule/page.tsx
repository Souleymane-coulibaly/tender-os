import type { Metadata } from "next";
import { fetchDceSectionData } from "../../../../dce-actions";
import { fetchPricingSchedules } from "../../../../pricing-schedule-actions";
import type { PricingSchedule } from "../../../../../../lib/pricing-schedule-types";
import type { DceDocumentSummary } from "../../../../../../lib/dce-types";
import { PageHeader } from "../../../../../../components/ui/page-header";
import { TabsNav } from "../../../../../../components/ui/tabs-nav";
import { ApiErrorState } from "../../../api-error-state";
import { buildTenderNavTabs } from "../tender-nav-tabs";
import { PricingScheduleSection } from "./pricing-schedule-section";

export const metadata: Metadata = { title: "Chiffrage — TenderOS" };

export default async function TenderPricingSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tenderId } = await params;

  let schedules: PricingSchedule[];
  let detectedFinancialDocuments: DceDocumentSummary[];
  try {
    const [scheduleList, dceData] = await Promise.all([fetchPricingSchedules(tenderId), fetchDceSectionData(tenderId)]);
    schedules = scheduleList;
    detectedFinancialDocuments = dceData.documents.filter((doc) => doc.category === "FINANCIAL");
  } catch (error) {
    return <ApiErrorState error={error} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={[{ label: "Appels d'offres", href: "/app/tenders" }, { label: "Dossier", href: `/app/tenders/${tenderId}` }, { label: "Chiffrage" }]}
        title="Chiffrage"
        description="Détectez les fichiers BPU/DPGF/DQE du DCE, saisissez vos prix sur les cellules autorisées, validez le chiffrage puis générez le fichier financier final — une copie du classeur acheteur avec uniquement vos prix injectés, jamais un fichier reconstruit."
        guideKey="tender-pricing-schedule"
      />
      <TabsNav items={buildTenderNavTabs(tenderId)} activeHref={`/app/tenders/${tenderId}/pricing-schedule`} />
      <div data-tour="guide-tender-pricing-schedule-section">
        <PricingScheduleSection tenderId={tenderId} initialSchedules={schedules} detectedFinancialDocuments={detectedFinancialDocuments} />
      </div>
    </div>
  );
}
