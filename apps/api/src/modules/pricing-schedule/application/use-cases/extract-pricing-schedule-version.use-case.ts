import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { readStreamToBuffer } from "../../../../shared-kernel/read-stream-to-buffer";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import { DOCUMENT_VERSION_REPOSITORY, STORAGE_PROVIDER, type DocumentVersionRepository, type StorageProvider } from "../../../documents";
import { extractPricingLinesFromSheet } from "../../infrastructure/pricing-line-extractor";
import { detectPricingTableColumnMapping } from "../../infrastructure/pricing-table-column-mapper";
import { readXlsxWorkbook } from "../../infrastructure/ooxml/xlsx-workbook-reader";
import { UnsupportedXlsxStructureError } from "../../domain/errors";
import type { PricingSchedule } from "../../domain/pricing-schedule.aggregate";
import { PricingScheduleLine } from "../../domain/pricing-schedule-line.entity";
import { PricingScheduleVersion } from "../../domain/pricing-schedule-version.entity";
import { assertPricingScheduleAccess } from "../policies/pricing-schedule-access.policy";
import { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PRICING_SCHEDULE_LINE_REPOSITORY, type PricingScheduleLineRepository } from "../ports/pricing-schedule-line.repository";
import { PRICING_SCHEDULE_REPOSITORY, type PricingScheduleRepository } from "../ports/pricing-schedule.repository";
import { PRICING_SCHEDULE_VERSION_REPOSITORY, type PricingScheduleVersionRepository } from "../ports/pricing-schedule-version.repository";

export type ExtractPricingScheduleVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  pricingScheduleId: string;
  /** Explicite, jamais `document.currentVersion` implicite (mission §8/§23) — l'appelant fournit la
   *  version précise du classeur acheteur à lire (typiquement `PricingSchedule.
   *  sourceDocumentVersionId`, ou une version plus récente si le fichier a été remplacé dans le DCE
   *  et que l'utilisateur déclenche explicitement une nouvelle extraction). */
  sourceDocumentVersionId: string;
  requestId?: string | undefined;
}>;

export type ExtractPricingScheduleVersionResult = Readonly<{ version: PricingScheduleVersion; lines: readonly PricingScheduleLine[] }>;

/**
 * Deuxième étape du pipeline (mission §9-§18) — lit le classeur acheteur déjà stocké (jamais un
 * second upload), détecte le mapping colonnes de CHAQUE feuille indépendamment (mission "ne jamais
 * supposer des colonnes uniformes entre fichiers"), extrait les lignes avec provenance complète, et
 * fige une nouvelle `PricingScheduleVersion` APPEND-ONLY (mission §22) — jamais une mutation d'une
 * version existante. Une feuille sans mapping détecté est simplement IGNORÉE (jamais une erreur
 * bloquante à elle seule) ; c'est seulement si AUCUNE feuille du classeur n'expose de tableau de
 * prix reconnu que l'extraction échoue explicitement (`UNSUPPORTED_XLSX_STRUCTURE`) plutôt que de
 * créer une version vide inutile.
 */
@Injectable()
export class ExtractPricingScheduleVersionUseCase {
  constructor(
    @Inject(PRICING_SCHEDULE_REPOSITORY) private readonly pricingScheduleRepository: PricingScheduleRepository,
    @Inject(PRICING_SCHEDULE_VERSION_REPOSITORY) private readonly versionRepository: PricingScheduleVersionRepository,
    @Inject(PRICING_SCHEDULE_LINE_REPOSITORY) private readonly lineRepository: PricingScheduleLineRepository,
    @Inject(DOCUMENT_VERSION_REPOSITORY) private readonly documentVersionRepository: DocumentVersionRepository,
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: PricingScheduleAccessService,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: ExtractPricingScheduleVersionCommand): Promise<ExtractPricingScheduleVersionResult> {
    const schedule = await assertPricingScheduleAccess(this.accessService, {
      organizationId: command.organizationId,
      pricingScheduleId: command.pricingScheduleId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManagePricingSchedule,
      requireUseOrgPermission: true,
    });

    // Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §2/§3 (P1 Codex) — réévalué à CHAQUE mutation,
    // jamais présumé depuis un DCE historique.
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: schedule.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => this.executeEntitled(command, schedule),
    );
  }

  private async executeEntitled(command: ExtractPricingScheduleVersionCommand, schedule: PricingSchedule): Promise<ExtractPricingScheduleVersionResult> {
    const documentVersion = await this.documentVersionRepository.findById({
      organizationId: command.organizationId,
      documentId: schedule.sourceDocumentId,
      versionId: command.sourceDocumentVersionId,
    });
    if (!documentVersion) {
      throw new UnsupportedXlsxStructureError("sourceDocumentVersionId does not reference a version of this pricing schedule's source document.");
    }

    const buffer = await readStreamToBuffer(await this.storageProvider.openReadStream(documentVersion.storageKey));
    const workbook = readXlsxWorkbook(buffer);

    const occurredAt = this.clock.now();
    const versionId = this.idGenerator.generate();
    const existingVersions = await this.versionRepository.list({ organizationId: command.organizationId, pricingScheduleId: schedule.id });
    const nextVersionNumber = (existingVersions[0]?.versionNumber ?? 0) + 1;

    const lines: PricingScheduleLine[] = [];
    const sheetsWithMapping: string[] = [];
    for (const sheet of workbook.sheets) {
      const mapping = detectPricingTableColumnMapping(sheet);
      if (!mapping) continue;
      sheetsWithMapping.push(sheet.name);

      for (const extracted of extractPricingLinesFromSheet(sheet, mapping)) {
        lines.push(
          PricingScheduleLine.create({
            id: this.idGenerator.generate(),
            organizationId: command.organizationId,
            pricingScheduleVersionId: versionId,
            sheetName: extracted.sheetName,
            rowNumber: extracted.rowNumber,
            kind: extracted.kind,
            designation: extracted.designation,
            unit: extracted.unit,
            quantity: extracted.quantity,
            designationCellRef: extracted.designationCellRef,
            quantityCellRef: extracted.quantityCellRef,
            buyerUnitPriceCellRef: extracted.buyerUnitPriceCellRef,
            buyerTotalCellRef: extracted.buyerTotalCellRef,
            matchingKey: extracted.matchingKey,
            occurredAt,
          }),
        );
      }
    }

    if (lines.length === 0) {
      throw new UnsupportedXlsxStructureError("no recognizable pricing table (designation + unit price columns) was found in any sheet of this workbook.");
    }

    const version = PricingScheduleVersion.create({
      id: versionId,
      organizationId: command.organizationId,
      pricingScheduleId: schedule.id,
      versionNumber: nextVersionNumber,
      sourceDocumentVersionId: command.sourceDocumentVersionId,
      createdBy: command.actorId,
      occurredAt,
    });

    schedule.advanceToVersion({ versionId, versionNumber: nextVersionNumber, occurredAt });

    await this.atomicTransactionRunner.run(async () => {
      await this.versionRepository.create(version);
      await this.lineRepository.createMany(lines);
      await this.pricingScheduleRepository.save(schedule);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "pricing_schedule.version_extracted",
        resourceType: "pricing_schedule_version",
        resourceId: version.id,
        requestId: command.requestId,
        metadata: { pricingScheduleId: schedule.id, versionNumber: nextVersionNumber, lineCount: lines.length, sheetsWithMapping },
      });
    });

    return { version, lines };
  }
}
