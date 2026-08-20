import type { PricingSchedule } from "../../domain/pricing-schedule.aggregate";

export interface PricingScheduleRepository {
  create(schedule: PricingSchedule): Promise<void>;
  save(schedule: PricingSchedule): Promise<void>;
  findById(input: { organizationId: string; pricingScheduleId: string }): Promise<PricingSchedule | null>;
  /** Détection de doublon (mission §9 "pas de réimport obligatoire" — un chiffrage par
   *  Tender/lot/candidate/fichier source). `lotId: null` cible le périmètre "tous lots"/global,
   *  une valeur cible un lot précis — jamais confondus (index partiel unique, même motif que
   *  `TechnicalMemoRepository.findByScope`). TENDEROS-2.1-P2.2-E1 — la dimension "candidate" du
   *  scope est désormais `candidateCompanyId` (jamais `clientAccountId`, toujours identique pour
   *  tous les chiffrages d'un même Tender et donc jamais réellement discriminant) : deux candidates
   *  différentes peuvent avoir chacune leur propre chiffrage pour le même (Tender, lot, fichier
   *  source) sans collision, mission §12 "leurs PricingSchedule doivent rester distincts". */
  findByScope(input: {
    organizationId: string;
    tenderId: string;
    lotId: string | null;
    candidateCompanyId: string | undefined;
    sourceDocumentId: string;
  }): Promise<PricingSchedule | null>;
  /** Mission §"un lot peut avoir plusieurs fichiers financiers simultanément" — liste TOUS les
   *  chiffrages d'un Tender (optionnellement filtrés par lot), jamais un seul par lot.
   *  TENDEROS-2.1-P2.2-E1 — `candidateCompanyId` additif : `ListFinalFilesForPackageUseCase` filtre
   *  désormais par candidate réelle, jamais par `clientAccountId` (voir son propre commentaire). */
  list(input: {
    organizationId: string;
    tenderId: string;
    lotId?: string | undefined;
    clientAccountId?: string | undefined;
    candidateCompanyId?: string | undefined;
  }): Promise<readonly PricingSchedule[]>;
}

export const PRICING_SCHEDULE_REPOSITORY = Symbol("PRICING_SCHEDULE_REPOSITORY");
