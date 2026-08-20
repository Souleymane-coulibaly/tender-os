import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { ListDceDocumentsUseCase } from "../../../dce";
import { assertLotBelongsToTender, TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../../../tenders";
import { classifyFinancialDocumentType } from "../../infrastructure/financial-document-type-classifier";
import { DuplicatePricingScheduleError, SourceDocumentNotInDceError } from "../../domain/errors";
import type { FinancialDocumentType } from "../../domain/enums";
import { PricingSchedule } from "../../domain/pricing-schedule.aggregate";
import { assertPricingScheduleTenderAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";

export type CreatePricingScheduleCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  lotId?: string | undefined;
  /** Doit référencer un document DÉJÀ présent dans le DCE de ce Tender (mission §9 "pas de réimport
   *  obligatoire") — jamais un upload direct depuis ce use case, jamais un `documentId` arbitraire
   *  non vérifié (anti-IDOR : la présence dans `ListDceDocumentsUseCase` fait foi). */
  sourceDocumentId: string;
  /** Proposition de classification déterministe (mission §5), corrigeable explicitement par
   *  l'utilisateur — jamais imposée si l'utilisateur fournit sa propre valeur. */
  financialDocumentTypeOverride?: FinancialDocumentType | undefined;
  requestId?: string | undefined;
}>;

/**
 * Enregistre le PÉRIMÈTRE d'un chiffrage (Tender/lot/candidate/fichier source DCE) — mission §9 :
 * cette étape ne lit ni n'extrait rien du classeur, elle se contente de rattacher un document DCE
 * déjà existant à un nouveau `PricingSchedule` DRAFT sans version. L'extraction réelle des lignes
 * (lecture XLSX, détection du mapping colonnes, création de `PricingScheduleVersion`/
 * `PricingScheduleLine`) est un second temps séparé — voir `ExtractPricingScheduleVersionUseCase`,
 * même découpage en deux étapes que `CreateTechnicalMemoUseCase`/`PrepareTechnicalMemoTemplateUseCase`
 * (Sprint 12).
 */
@Injectable()
export class CreatePricingScheduleUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly pricingScheduleRepository: PricingScheduleRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: PricingScheduleAccessService,
    private readonly listDceDocumentsUseCase: ListDceDocumentsUseCase,
  ) {}

  async execute(command: CreatePricingScheduleCommand): Promise<PricingSchedule> {
    const { clientAccountId, candidateCompanyId } = await assertPricingScheduleTenderAccess(this.accessService, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManagePricingSchedule,
      requireUseOrgPermission: true,
    });

    // Anti-IDOR (même motif que `CreateTechnicalMemoUseCase`) — un `lotId` fourni doit réellement
    // appartenir à CE Tender.
    await assertLotBelongsToTender(this.tenderLotRepository, { organizationId: command.organizationId, tenderId: command.tenderId, lotId: command.lotId });

    // Anti-IDOR (mission §9) — `sourceDocumentId` doit réellement être un document DÉJÀ listé dans
    // le DCE de ce Tender, jamais un identifiant accepté tel quel. `ListDceDocumentsUseCase`
    // applique déjà sa propre vérification RBAC/ClientAccess (DcePermission.Read).
    const dceDocuments = await this.listDceDocumentsUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    const sourceDocument = dceDocuments.find((doc) => doc.documentId === command.sourceDocumentId);
    if (!sourceDocument) {
      throw new SourceDocumentNotInDceError();
    }

    const existing = await this.pricingScheduleRepository.findByScope({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId ?? null,
      candidateCompanyId,
      sourceDocumentId: command.sourceDocumentId,
    });
    if (existing) {
      throw new DuplicatePricingScheduleError();
    }

    const financialDocumentType = command.financialDocumentTypeOverride ?? classifyFinancialDocumentType({ filename: sourceDocument.originalFilename });

    const occurredAt = this.clock.now();
    const schedule = PricingSchedule.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
      clientAccountId,
      candidateCompanyId,
      financialDocumentType,
      sourceDocumentId: command.sourceDocumentId,
      sourceDocumentVersionId: sourceDocument.currentVersionId,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.atomicTransactionRunner.run(async () => {
      await this.pricingScheduleRepository.create(schedule);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "pricing_schedule.created",
        resourceType: "pricing_schedule",
        resourceId: schedule.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, lotId: command.lotId ?? null, financialDocumentType, sourceDocumentId: command.sourceDocumentId },
      });
    });

    return schedule;
  }
}
