import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { GetCandidateContextForPackageUseCase, ListValidatedAdministrativeDocumentsForPackageUseCase } from "../../../administrative-dossier";
import { ClientPermission } from "../../../client-portfolio";
import { ListFinalFilesForPackageUseCase } from "../../../pricing-schedule";
import { ListValidatedTechnicalMemosForPackageUseCase } from "../../../technical-memo";
import { CHECKLIST_ITEM_REPOSITORY, type ChecklistItemRepository } from "../../../tenders";
import { evaluateChecklistItemQualification } from "../../domain/services/evaluate-checklist-item-qualification";
import { mapChecklistItemTypeToCategory } from "../../domain/services/map-checklist-item-type-to-category";
import { PackageItemApplicabilityStatus, PackageItemCategory, PackageItemRequirementType, PackageItemSourceType } from "../../domain/enums";
import { PackageItem } from "../../domain/package-item.entity";
import { ResponsePackageVersion } from "../../domain/response-package-version.entity";
import { assertResponsePackageAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { PACKAGE_ITEM_REPOSITORY, type PackageItemRepository } from "../ports/package-item.repository";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";
import { RESPONSE_PACKAGE_VERSION_REPOSITORY, type ResponsePackageVersionRepository } from "../ports/response-package-version.repository";

export type BuildResponsePackageVersionCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  responsePackageId: string;
  requestId?: string | undefined;
}>;

export type BuildResponsePackageVersionResult = Readonly<{ version: ResponsePackageVersion; items: readonly PackageItem[] }>;

/** Item d'une source "déjà produite ailleurs" (mission §15) — toujours REQUIRED+APPLICABLE+READY
 *  au moment de l'ajout (le document EXISTE déjà, c'est justement pourquoi on l'inclut). Limite
 *  honnête (mission "ne jamais prétendre supporter plus que ce qui est fait") : cette voie ne
 *  détecte jamais qu'une pièce de ce type est ATTENDUE mais absente — cette responsabilité reste
 *  entièrement portée par les `ChecklistItem` (mission §31 "Checklist : ce qu'il faut fournir"). */
type ProducedElsewhereSource = Readonly<{ sourceId: string; lotId?: string | undefined; label: string; documentId: string; documentVersionId: string }>;

function isRelevantToLot(itemLotId: string | undefined, packageLotId: string | undefined): boolean {
  return itemLotId === undefined || itemLotId === packageLotId;
}

/**
 * Construit une NOUVELLE version APPEND-ONLY (mission §11) en collectant — jamais en recréant
 * (mission §2) — les pièces depuis : Checklist (mission §31, source de vérité des pièces
 * ATTENDUES/obligation/conditionnalité), dossier administratif validé, mémoire technique exporté,
 * fichiers financiers finaux (Sprint 13). Chaque pièce figée avec sa `documentVersionId` au moment
 * de la construction (mission §16 POINT CRITIQUE).
 */
@Injectable()
export class BuildResponsePackageVersionUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly responsePackageRepository: ResponsePackageRepository,
    @Inject(RESPONSE_PACKAGE_VERSION_REPOSITORY) private readonly versionRepository: ResponsePackageVersionRepository,
    @Inject(PACKAGE_ITEM_REPOSITORY) private readonly itemRepository: PackageItemRepository,
    @Inject(CHECKLIST_ITEM_REPOSITORY) private readonly checklistItemRepository: ChecklistItemRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: ResponsePackageAccessService,
    private readonly getCandidateContextForPackageUseCase: GetCandidateContextForPackageUseCase,
    private readonly listValidatedAdministrativeDocumentsForPackageUseCase: ListValidatedAdministrativeDocumentsForPackageUseCase,
    private readonly listValidatedTechnicalMemosForPackageUseCase: ListValidatedTechnicalMemosForPackageUseCase,
    private readonly listFinalFilesForPackageUseCase: ListFinalFilesForPackageUseCase,
  ) {}

  async execute(command: BuildResponsePackageVersionCommand): Promise<BuildResponsePackageVersionResult> {
    const pkg = await assertResponsePackageAccess(this.accessService, {
      organizationId: command.organizationId,
      responsePackageId: command.responsePackageId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageResponsePackage,
      requireUseOrgPermission: true,
    });

    const occurredAt = this.clock.now();
    const versionId = this.idGenerator.generate();
    const existingVersions = await this.versionRepository.list({ organizationId: command.organizationId, responsePackageId: pkg.id });
    const nextVersionNumber = (existingVersions[0]?.versionNumber ?? 0) + 1;

    const [candidateContext, adminDocs, technicalMemos, finalFiles] = await Promise.all([
      this.getCandidateContextForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId }),
      this.listValidatedAdministrativeDocumentsForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId }),
      this.listValidatedTechnicalMemosForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId }),
      this.listFinalFilesForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId, clientAccountId: pkg.clientAccountId }),
    ]);

    const checklistItems = await this.checklistItemRepository.listByTender({ organizationId: command.organizationId, tenderId: pkg.tenderId });

    const items: PackageItem[] = [];

    for (const checklistItem of checklistItems) {
      if (!isRelevantToLot(checklistItem.lotId, pkg.lotId)) continue;
      const qualification = evaluateChecklistItemQualification({
        requirementLevel: checklistItem.requirementLevel,
        complianceStatus: checklistItem.complianceStatus,
        subjectType: checklistItem.subjectType,
        hasDeclaredSubcontractors: candidateContext.hasDeclaredSubcontractors,
        isConsortiumBid: candidateContext.isConsortiumBid,
      });
      items.push(
        PackageItem.create({
          id: this.idGenerator.generate(),
          organizationId: command.organizationId,
          responsePackageVersionId: versionId,
          category: mapChecklistItemTypeToCategory(checklistItem.type),
          label: checklistItem.title,
          sourceType: PackageItemSourceType.ChecklistItem,
          sourceId: checklistItem.id,
          documentId: checklistItem.matchedDocumentId,
          documentVersionId: checklistItem.matchedDocumentVersionId,
          requirementType: qualification.requirementType,
          applicabilityStatus: qualification.applicabilityStatus,
          conditionText: checklistItem.conditionText,
          lotId: pkg.lotId,
          expiresAt: checklistItem.documentExpiresAt,
          occurredAt,
        }),
      );
    }

    const addProducedElsewhere = (sources: readonly ProducedElsewhereSource[], category: PackageItemCategory, sourceType: PackageItemSourceType) => {
      for (const source of sources) {
        if (!isRelevantToLot(source.lotId, pkg.lotId)) continue;
        items.push(
          PackageItem.create({
            id: this.idGenerator.generate(),
            organizationId: command.organizationId,
            responsePackageVersionId: versionId,
            category,
            label: source.label,
            sourceType,
            sourceId: source.sourceId,
            documentId: source.documentId,
            documentVersionId: source.documentVersionId,
            requirementType: PackageItemRequirementType.Required,
            applicabilityStatus: PackageItemApplicabilityStatus.Applicable,
            lotId: pkg.lotId,
            occurredAt,
          }),
        );
      }
    };

    addProducedElsewhere(
      adminDocs.map((d) => ({ sourceId: d.administrativeDocumentId, label: d.label, documentId: d.documentId, documentVersionId: d.documentVersionId })),
      PackageItemCategory.Administrative,
      PackageItemSourceType.AdministrativeDocument,
    );
    addProducedElsewhere(
      technicalMemos.map((m) => ({ sourceId: m.technicalMemoId, lotId: m.lotId, label: m.label, documentId: m.documentId, documentVersionId: m.documentVersionId })),
      PackageItemCategory.Technical,
      PackageItemSourceType.TechnicalMemo,
    );
    addProducedElsewhere(
      finalFiles.map((f) => ({ sourceId: f.pricingScheduleId, lotId: f.lotId, label: f.label, documentId: f.documentId, documentVersionId: f.documentVersionId })),
      PackageItemCategory.Financial,
      PackageItemSourceType.PricingScheduleFinalFile,
    );

    const version = ResponsePackageVersion.create({ id: versionId, organizationId: command.organizationId, responsePackageId: pkg.id, versionNumber: nextVersionNumber, createdBy: command.actorId, occurredAt });
    pkg.advanceToVersion({ versionId, versionNumber: nextVersionNumber, occurredAt });

    await this.atomicTransactionRunner.run(async () => {
      await this.versionRepository.create(version);
      await this.itemRepository.createMany(items);
      await this.responsePackageRepository.save(pkg);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "response_package.version_built",
        resourceType: "response_package_version",
        resourceId: version.id,
        requestId: command.requestId,
        metadata: { responsePackageId: pkg.id, versionNumber: nextVersionNumber, itemCount: items.length },
      });
    });

    return { version, items };
  }
}
