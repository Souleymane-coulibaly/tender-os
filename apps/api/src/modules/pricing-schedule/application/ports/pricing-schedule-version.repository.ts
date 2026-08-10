import type { PricingScheduleVersion } from "../../domain/pricing-schedule-version.entity";

export interface PricingScheduleVersionRepository {
  create(version: PricingScheduleVersion): Promise<void>;
  /** Mission §45 — l'appelant reste responsable de vérifier `isValidated` avant d'appeler `save`
   *  pour toute autre raison qu'enregistrer la validation elle-même : ce port ne réimpose pas cette
   *  règle (déjà garantie par l'agrégat, qui lève si on tente une mutation après VALIDATED). */
  save(version: PricingScheduleVersion): Promise<void>;
  findById(input: { organizationId: string; pricingScheduleVersionId: string }): Promise<PricingScheduleVersion | null>;
  /** Historique APPEND-ONLY complet (mission §22), du plus récent au plus ancien. */
  list(input: { organizationId: string; pricingScheduleId: string }): Promise<readonly PricingScheduleVersion[]>;
}

export const PRICING_SCHEDULE_VERSION_REPOSITORY = Symbol("PRICING_SCHEDULE_VERSION_REPOSITORY");
