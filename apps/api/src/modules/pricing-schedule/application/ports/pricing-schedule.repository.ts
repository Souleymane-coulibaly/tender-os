import type { PricingSchedule } from "../../domain/pricing-schedule.aggregate";

export interface PricingScheduleRepository {
  create(schedule: PricingSchedule): Promise<void>;
  save(schedule: PricingSchedule): Promise<void>;
  findById(input: { organizationId: string; pricingScheduleId: string }): Promise<PricingSchedule | null>;
  /** Détection de doublon (mission §9 "pas de réimport obligatoire" — un chiffrage par
   *  Tender/lot/candidate/fichier source). `lotId: null` cible le périmètre "tous lots"/global,
   *  une valeur cible un lot précis — jamais confondus (index partiel unique, même motif que
   *  `TechnicalMemoRepository.findByScope`). */
  findByScope(input: {
    organizationId: string;
    tenderId: string;
    lotId: string | null;
    clientAccountId: string;
    sourceDocumentId: string;
  }): Promise<PricingSchedule | null>;
  /** Mission §"un lot peut avoir plusieurs fichiers financiers simultanément" — liste TOUS les
   *  chiffrages d'un Tender (optionnellement filtrés par lot), jamais un seul par lot. */
  list(input: { organizationId: string; tenderId: string; lotId?: string | undefined; clientAccountId?: string | undefined }): Promise<readonly PricingSchedule[]>;
}

export const PRICING_SCHEDULE_REPOSITORY = Symbol("PRICING_SCHEDULE_REPOSITORY");
