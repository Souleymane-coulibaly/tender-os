import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { assertPricingScheduleTenderAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PRICING_SCHEDULE_FINAL_FILE_REPOSITORY, type PricingScheduleFinalFileRepository } from "../ports/pricing-schedule-final-file.repository";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";

export type ListFinalFilesForPackageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string; clientAccountId: string }>;

/** Un fichier financier final déjà généré (BPU/DPGF/DQE), prêt à être inclus dans un dossier de
 *  réponse — jamais un chiffrage non encore généré (mission §38 "ne doivent être requis que
 *  lorsqu'ils sont réellement demandés/applicables"), jamais un second accès Documents ici. */
export type PricingScheduleFinalFileForPackage = Readonly<{
  pricingScheduleId: string;
  lotId?: string | undefined;
  financialDocumentType: string;
  label: string;
  documentId: string;
  documentVersionId: string;
}>;

/**
 * Sprint 14 — port en LECTURE SEULE réexporté pour `response-package` (même motif que
 * `ListValidatedAdministrativeDocumentsForPackageUseCase`/`ListValidatedTechnicalMemosForPackageUseCase`).
 * Scopé au CANDIDATE demandeur (mission §69/§81 "jamais mélanger silencieusement deux candidats") —
 * ne retourne jamais un chiffrage d'un autre `clientAccountId`.
 */
@Injectable()
export class ListFinalFilesForPackageUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly scheduleRepository: PricingScheduleRepository,
    @Inject(PRICING_SCHEDULE_FINAL_FILE_REPOSITORY) private readonly finalFileRepository: PricingScheduleFinalFileRepository,
    private readonly accessService: PricingScheduleAccessService,
  ) {}

  async execute(query: ListFinalFilesForPackageQuery): Promise<readonly PricingScheduleFinalFileForPackage[]> {
    await assertPricingScheduleTenderAccess(this.accessService, {
      organizationId: query.organizationId,
      tenderId: query.tenderId,
      actorId: query.actorId,
      actorRole: query.actorRole,
      clientPermission: ClientPermission.ReadPricingSchedule,
    });

    const schedules = await this.scheduleRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId, clientAccountId: query.clientAccountId });
    const result: PricingScheduleFinalFileForPackage[] = [];

    for (const schedule of schedules) {
      if (!schedule.currentVersionId) continue;
      const finalFiles = await this.finalFileRepository.listByVersion({ organizationId: query.organizationId, pricingScheduleVersionId: schedule.currentVersionId });
      const latest = finalFiles[0];
      if (!latest) continue;
      result.push({
        pricingScheduleId: schedule.id,
        lotId: schedule.lotId,
        financialDocumentType: schedule.financialDocumentType,
        label: `${schedule.financialDocumentType}_FINAL`,
        documentId: latest.documentId,
        documentVersionId: latest.documentVersionId,
      });
    }

    return result;
  }
}
