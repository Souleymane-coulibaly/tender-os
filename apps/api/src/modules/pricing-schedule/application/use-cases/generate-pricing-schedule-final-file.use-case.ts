import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";
import { ClientPermission } from "../../../client-portfolio";
import {
  AttachDocumentToTenderUseCase,
  CreateDocumentWithFirstVersionUseCase,
  DOCUMENT_VERSION_REPOSITORY,
  DocumentDomain,
  DocumentOrigin,
  STORAGE_PROVIDER,
  type DocumentVersionRepository,
  type StorageProvider,
} from "../../../documents";
import { injectNumericCellValues, type XlsxCellInjectionTarget } from "../../infrastructure/ooxml/xlsx-cell-writer";
import { FinancialFileNotReadyError, PricingScheduleVersionNotFoundError, UnsupportedXlsxStructureError } from "../../domain/errors";
import { PricingScheduleLineKind } from "../../domain/enums";
import { PricingScheduleFinalFile } from "../../domain/pricing-schedule-final-file.value-object";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_SCHEDULE_FINAL_FILE_REPOSITORY, type PricingScheduleFinalFileRepository } from "../ports/pricing-schedule-final-file.repository";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

export type GeneratePricingScheduleFinalFileCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  pricingScheduleVersionId: string;
  requestId?: string | undefined;
}>;

export type GeneratePricingScheduleFinalFileResult = Readonly<{ finalFile: PricingScheduleFinalFile }>;

const MAX_FINAL_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Point CENTRAL "ORIGINAL → FINAL" (mission) — action EXPLICITE et SÉPARÉE de la validation
 * (mission, décision utilisateur explicite : "Validate → puis → Generate", jamais automatique).
 * Prend une COPIE du classeur source déjà validé, injecte UNIQUEMENT les cellules de prix
 * autorisées via l'écriture chirurgicale OOXML (mission "jamais reconstruire le classeur"), stocke
 * le résultat comme un NOUVEAU `Document`/`DocumentVersion` (mission "réutiliser Document/
 * DocumentVersion, jamais un système parallèle") — le fichier ORIGINAL n'est jamais rouvert en
 * écriture, seule une copie mémoire est produite puis uploadée séparément.
 */
@Injectable()
export class GeneratePricingScheduleFinalFileUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly scheduleRepository: PricingScheduleRepository,
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    @Inject(PRICING_SCHEDULE_FINAL_FILE_REPOSITORY) private readonly finalFileRepository: PricingScheduleFinalFileRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: PricingScheduleAccessService,
    private readonly createDocumentWithFirstVersionUseCase: CreateDocumentWithFirstVersionUseCase,
    private readonly attachDocumentToTenderUseCase: AttachDocumentToTenderUseCase,
  ) {}

  async execute(command: GeneratePricingScheduleFinalFileCommand): Promise<GeneratePricingScheduleFinalFileResult> {
    const schedule = await assertPricingScheduleAccess(this.accessService, {
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.GeneratePricingScheduleFiles,
      requireUseOrgPermission: true,
    });

    const version = await this.versionRepository.findById({ organizationId: command.organizationId, pricingScheduleVersionId: command.pricingScheduleVersionId });
    if (!version || version.pricingScheduleId !== schedule.id) {
      throw new PricingScheduleVersionNotFoundError();
    }
    if (!version.isValidated) {
      throw new FinancialFileNotReadyError();
    }

    try {
      const lines = await this.lineRepository.listByVersion({ organizationId: command.organizationId, pricingScheduleVersionId: version.id });
      const targets: XlsxCellInjectionTarget[] = lines
        .filter((line) => line.kind === PricingScheduleLineKind.PriceItem && line.proposedUnitPrice !== undefined && line.buyerUnitPriceCellRef !== undefined)
        .map((line) => ({ sheetName: line.sheetName, cellReference: line.buyerUnitPriceCellRef!, numericValue: Number(line.proposedUnitPrice) }));

      const sourceDocumentVersion = await this.documentVersionRepository.findById({
        organizationId: command.organizationId,
        documentId: schedule.sourceDocumentId,
        versionId: version.sourceDocumentVersionId,
      });
      if (!sourceDocumentVersion) {
        throw new UnsupportedXlsxStructureError("the source document version referenced by this pricing schedule version could no longer be found.");
      }

      const originalBuffer = await readStreamToBuffer(await this.storageProvider.openReadStream(sourceDocumentVersion.storageKey));
      // Jamais une mutation du buffer/fichier original (prouvé par `xlsx-cell-writer.spec.ts` —
      // "never mutates the original buffer passed in") — `patchedBuffer` est un NOUVEAU classeur.
      const patchedBuffer = injectNumericCellValues(originalBuffer, targets);

      const stored = await this.createDocumentWithFirstVersionUseCase.execute({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        title: `${schedule.financialDocumentType}_FINAL_V${version.versionNumber}`,
        origin: DocumentOrigin.Generated,
        domain: DocumentDomain.Generated,
        file: { buffer: patchedBuffer, originalFilename: `${schedule.financialDocumentType}_FINAL_V${version.versionNumber}.xlsx`, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        maxFileSizeBytes: MAX_FINAL_FILE_SIZE_BYTES,
        requestId: command.requestId,
      });

      await this.attachDocumentToTenderUseCase.execute({
        organizationId: command.organizationId,
        documentId: stored.id,
        tenderId: schedule.tenderId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        requestId: command.requestId,
      });

      const occurredAt = this.clock.now();
      const finalFile = PricingScheduleFinalFile.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        pricingScheduleVersionId: version.id,
        documentId: stored.id,
        documentVersionId: stored.currentVersion!.id,
        injectedCellCount: targets.length,
        generatedBy: command.actorId,
        occurredAt,
      });

      schedule.markExported(occurredAt);

      await this.atomicTransactionRunner.run(async () => {
        await this.finalFileRepository.create(finalFile);
        await this.scheduleRepository.save(schedule);
        await this.auditLogWriter.record({
          organizationId: command.organizationId,
          actorType: "USER",
          actorId: command.actorId,
          action: "pricing_schedule.financial_file_generated",
          resourceType: "pricing_schedule_final_file",
          resourceId: finalFile.id,
          requestId: command.requestId,
          metadata: { pricingScheduleId: schedule.id, pricingScheduleVersionId: version.id, documentId: stored.id, injectedCellCount: targets.length },
        });
      });

      return { finalFile };
    } catch (error) {
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "pricing_schedule.financial_file_generation_failed",
        resourceType: "pricing_schedule_version",
        resourceId: version.id,
        requestId: command.requestId,
        metadata: { pricingScheduleId: schedule.id, reason: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}
