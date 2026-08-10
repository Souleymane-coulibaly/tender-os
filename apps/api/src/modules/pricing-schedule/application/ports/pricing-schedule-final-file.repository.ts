import type { PricingScheduleFinalFile } from "../../domain/pricing-schedule-final-file.value-object";

export interface PricingScheduleFinalFileRepository {
  create(finalFile: PricingScheduleFinalFile): Promise<void>;
  /** Historique complet (mission "chaîne d'historique complète"), du plus récent au plus ancien. */
  listByVersion(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<readonly PricingScheduleFinalFile[]>;
}

export const PRICING_SCHEDULE_FINAL_FILE_REPOSITORY = Symbol("PRICING_SCHEDULE_FINAL_FILE_REPOSITORY");
