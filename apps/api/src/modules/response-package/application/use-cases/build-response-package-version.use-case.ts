import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { GetCandidateContextForPackageUseCase, ListValidatedAdministrativeDocumentsForPackageUseCase } from "../../../administrative-dossier";
import { ClientPermission } from "../../../client-portfolio";
import { ListFinalFilesForPackageUseCase } from "../../../pricing-schedule";
import { ListValidatedTechnicalMemosForPackageUseCase } from "../../../technical-memo";
import { CHECKLIST_ITEM_REPOSITORY, GetTenderUseCase, type ChecklistItemRepository } from "../../../tenders";
import { computeExpectedPackageItems } from "../../domain/services/compute-expected-package-items";
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

/**
 * Construit une NOUVELLE version APPEND-ONLY (mission §11) en collectant — jamais en recréant
 * (mission §2) — les pièces depuis : Checklist (mission §31, source de vérité des pièces
 * ATTENDUES/obligation/conditionnalité), dossier administratif validé, mémoire technique exporté,
 * fichiers financiers finaux (Sprint 13). Chaque pièce figée avec sa `documentVersionId` au moment
 * de la construction (mission §16 POINT CRITIQUE). Le calcul des pièces ATTENDUES est délégué à
 * `computeExpectedPackageItems` (Checkpoint 2.1-P2.1-FIX-E), pure et partagée avec
 * `GetResponsePackageFreshnessUseCase` — jamais un second calcul divergent.
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
    private readonly getTenderUseCase: GetTenderUseCase,
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

    // Correctif audit (Checkpoint 2.1-P2.1-FIX-E, gap confirmé — aucun verrou n'existait ici) —
    // TOUT le bloc critique (verrou, lecture de `nextVersionNumber`, écritures) tient dans UNE
    // SEULE transaction courte : un `pg_advisory_xact_lock` pris HORS transaction se libère
    // immédiatement (verrou de portée TRANSACTION, jamais session), ce qui n'offrirait AUCUNE
    // protection réelle — même piège que documenté pour `lockSection` (technical-memo). Sérialise
    // deux constructions concurrentes de la MÊME `ResponsePackage` : sans ce verrou, deux appels
    // lisant `existingVersions[0]?.versionNumber` avant que l'un des deux n'ait committé calculent
    // le MÊME `nextVersionNumber`, et le second échoue sur la contrainte unique
    // `(responsePackageId, versionNumber)` au lieu d'obtenir proprement N+2.
    return this.atomicTransactionRunner.run(async () => {
      await this.versionRepository.lockPackage({ organizationId: command.organizationId, responsePackageId: pkg.id });

      const existingVersions = await this.versionRepository.list({ organizationId: command.organizationId, responsePackageId: pkg.id });
      const nextVersionNumber = (existingVersions[0]?.versionNumber ?? 0) + 1;

      // TENDEROS-2.1-P2.2-E1 — `tender` doit être résolu AVANT `listFinalFilesForPackageUseCase`
      // (qui a désormais besoin de `tender.candidateCompanyId`, jamais de `pkg.clientAccountId`) :
      // ne peut plus faire partie du même `Promise.all` que les appels qui en dépendent.
      const tender = await this.getTenderUseCase.execute({ organizationId: command.organizationId, tenderId: pkg.tenderId, actorId: command.actorId, actorRole: command.actorRole });

      const [candidateContext, adminDocs, technicalMemos, finalFiles, checklistItems] = await Promise.all([
        this.getCandidateContextForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId }),
        this.listValidatedAdministrativeDocumentsForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId, candidateCompanyId: tender.candidateCompanyId }),
        this.listValidatedTechnicalMemosForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId }),
        this.listFinalFilesForPackageUseCase.execute({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: pkg.tenderId, candidateCompanyId: tender.candidateCompanyId }),
        this.checklistItemRepository.listByTender({ organizationId: command.organizationId, tenderId: pkg.tenderId }),
      ]);

      const expectedItems = computeExpectedPackageItems({ packageLotId: pkg.lotId, checklistItems, candidateContext, adminDocs, technicalMemos, finalFiles });
      const items: PackageItem[] = expectedItems.map((expected) =>
        PackageItem.create({
          id: this.idGenerator.generate(),
          organizationId: command.organizationId,
          responsePackageVersionId: versionId,
          category: expected.category,
          label: expected.label,
          sourceType: expected.sourceType,
          sourceId: expected.sourceId,
          documentId: expected.documentId,
          documentVersionId: expected.documentVersionId,
          requirementType: expected.requirementType,
          applicabilityStatus: expected.applicabilityStatus,
          conditionText: expected.conditionText,
          lotId: expected.lotId,
          expiresAt: expected.expiresAt,
          occurredAt,
        }),
      );

      // Checkpoint 2.1-P2.1-FIX-E — `Tender.candidateCompanyId` figé au moment de LA CONSTRUCTION
      // de cette version (mission §33/§73), jamais recalculé après coup.
      const version = ResponsePackageVersion.create({
        id: versionId,
        organizationId: command.organizationId,
        responsePackageId: pkg.id,
        versionNumber: nextVersionNumber,
        createdBy: command.actorId,
        occurredAt,
        candidateCompanyId: tender.candidateCompanyId,
      });
      pkg.advanceToVersion({ versionId, versionNumber: nextVersionNumber, occurredAt });

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

      return { version, items };
    });
  }
}
