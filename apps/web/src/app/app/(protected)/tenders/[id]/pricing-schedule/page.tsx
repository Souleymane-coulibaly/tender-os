import type { Metadata } from "next";
import { fetchDceSectionData } from "../../../../dce-actions";
import { fetchPricingSchedules } from "../../../../pricing-schedule-actions";
import type { PricingSchedule } from "../../../../../../lib/pricing-schedule-types";
import type { DceDocumentSummary } from "../../../../../../lib/dce-types";
import { ApiErrorState } from "../../../api-error-state";
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
      <div>
        <h1 className="text-xl font-semibold">Chiffrage</h1>
        <p className="text-sm text-neutral-600">
          Détectez les fichiers BPU/DPGF/DQE du DCE, saisissez vos prix sur les cellules autorisées, validez le
          chiffrage puis générez le fichier financier final — une copie du classeur acheteur avec uniquement vos prix
          injectés, jamais un fichier reconstruit.
        </p>
      </div>
      <PricingScheduleSection tenderId={tenderId} initialSchedules={schedules} detectedFinancialDocuments={detectedFinancialDocuments} />
    </div>
  );
}
