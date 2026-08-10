import type { PricingScheduleLine } from "../../domain/pricing-schedule-line.entity";

export interface PricingScheduleLineRepository {
  /** Insertion en lot à l'extraction (mission §"performance" — jamais une écriture DB par cellule
   *  quand une stratégie de batch est possible pour un BPU/DQE de plusieurs milliers de lignes). */
  createMany(lines: readonly PricingScheduleLine[]): Promise<void>;
  save(line: PricingScheduleLine): Promise<void>;
  saveMany(lines: readonly PricingScheduleLine[]): Promise<void>;
  findById(input: { organizationId: string; pricingScheduleLineId: string }): Promise<PricingScheduleLine | null>;
  listByVersion(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<readonly PricingScheduleLine[]>;
}

export const PRICING_SCHEDULE_LINE_REPOSITORY = Symbol("PRICING_SCHEDULE_LINE_REPOSITORY");
