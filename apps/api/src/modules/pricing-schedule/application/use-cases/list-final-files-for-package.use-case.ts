import { Inject, Injectable } from "@nestjs/common";
import { ClientPermission } from "../../../client-portfolio";
import { assertPricingScheduleTenderAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { PRICING_SCHEDULE_FINAL_FILE_REPOSITORY, type PricingScheduleFinalFileRepository } from "../ports/pricing-schedule-final-file.repository";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";

/** TENDEROS-2.1-P2.2-E1 (correctif audit baseline P1) — `candidateCompanyId`, jamais
 *  `clientAccountId` : le chiffrage soumis à l'acheteur appartient à l'entreprise CANDIDATE, pas au
 *  client commercial (voir `PricingSchedule.candidateCompanyId`). `undefined` (Tender sans candidate
 *  résolue) retourne toujours `[]` — jamais un fallback vers un autre candidat/vers le client. */
export type ListFinalFilesForPackageQuery = Readonly<{ organizationId: string; actorId: string; actorRole: string; tenderId: string; candidateCompanyId: string | undefined }>;

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
 * TENDEROS-2.1-P2.2-E1 (correctif audit baseline P1) — scopé au CANDIDATE réel (mission §69/§81
 * "jamais mélanger silencieusement deux candidats") : ne retourne jamais un chiffrage d'une autre
 * `candidateCompanyId`, jamais un fallback silencieux vers `clientAccountId` (le client commercial
 * n'est plus l'autorité de provenance candidate depuis ce checkpoint).
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

    // Mission §22 — aucune CandidateCompany résolue pour ce Tender : aucun chiffrage ne peut lui
    // être attribué, jamais une substitution silencieuse (ex. vers le client commercial ou un autre
    // candidat historique).
    if (query.candidateCompanyId === undefined) {
      return [];
    }

    const schedules = await this.scheduleRepository.list({ organizationId: query.organizationId, tenderId: query.tenderId, candidateCompanyId: query.candidateCompanyId });
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
