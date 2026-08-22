import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ENTITLEMENT_SERVICE, type EntitlementService } from "../../../billing";
import { ClientPermission } from "../../../client-portfolio";
import { assertLotBelongsToTender, TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../../../tenders";
import { DuplicateResponsePackageError } from "../../domain/errors";
import { ResponsePackage } from "../../domain/response-package.aggregate";
import { assertResponsePackageTenderAccess } from "../policies/response-package-access.policy";
import { ResponsePackageAccessService } from "../services/response-package-access.service";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { RESPONSE_PACKAGE_REPOSITORY, type ResponsePackageRepository } from "../ports/response-package.repository";

export type CreateResponsePackageCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  tenderId: string;
  lotId?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Enregistre le PÉRIMÈTRE d'un dossier de réponse (mission §8 "Tender + Lot") — cette étape ne
 * collecte encore aucune pièce, elle se contente de déclarer le périmètre DRAFT sans version. La
 * collecte réelle (Checklist + dossier administratif + mémoire technique + chiffrage) est un
 * second temps séparé — voir `BuildResponsePackageVersionUseCase`, même découpage en deux étapes
 * que `CreatePricingScheduleUseCase`/`ExtractPricingScheduleVersionUseCase` (Sprint 13).
 *
 * TENDEROS-2.1-P2.2-F1.1 (audit Codex F1, décision explicite — voir rapport final "CANDIDATE_SCOPE_DECISION")
 * — `ResponsePackage` (ce conteneur) est scopé Tender+Lot+ClientAccount, PAS CandidateCompany :
 * `clientAccountId` ici sert exclusivement le RBAC/scope commercial (`ClientPermission`), jamais
 * l'identité candidate. Un changement de CandidateCompany sur le Tender ne crée JAMAIS un nouveau
 * conteneur — il rend la version COURANTE STALE (`GetResponsePackageFreshnessUseCase`, FIX-E) et un
 * rebuild produit une NOUVELLE `ResponsePackageVersion` sur ce MÊME conteneur, dont
 * `candidateCompanyId` capture alors la candidate réellement courante (mission §10 "chaque version
 * fige au minimum la CandidateCompany utilisée au build"). C'est la version, jamais le conteneur,
 * qui porte la provenance candidate — même discipline que `PricingSchedule`/`ResponsePackageVersion`
 * (P2.2-E1/FIX-E) : jamais deux sources de vérité candidate concurrentes.
 */
@Injectable()
export class CreateResponsePackageUseCase {
  constructor(
    @Inject(RESPONSE_PACKAGE_REPOSITORY) private readonly responsePackageRepository: ResponsePackageRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly tenderLotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly accessService: ResponsePackageAccessService,
    @Inject(ENTITLEMENT_SERVICE) private readonly entitlementService: EntitlementService,
  ) {}

  async execute(command: CreateResponsePackageCommand): Promise<ResponsePackage> {
    const clientAccountId = await assertResponsePackageTenderAccess(this.accessService, {
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      clientPermission: ClientPermission.ManageResponsePackage,
      requireUseOrgPermission: true,
    });

    // Checkpoint TENDEROS-2.1-P2.3-E1.3, mission §20 (ENTITLEMENT COVERAGE) — correctif du bypass
    // Codex : `CreateResponsePackageUseCase` peut être la PREMIÈRE mutation "cœur AO" sur un Tender
    // fraîchement créé (aucune dépendance sur DCE/Analyse/Mémoire technique, contrairement au reste
    // du module qui hérite de cette protection en aval). Allocation du Pass (si nécessaire) avec
    // compensation automatique si l'opération échoue ensuite (mission §2/§3/§4) — même politique
    // centrale que DCE/Analyse/Mémoire technique/SubmissionPackage/Submission.
    return this.entitlementService.runTenderOperationEntitled(
      { organizationId: command.organizationId, tenderId: command.tenderId, actorId: command.actorId, occurredAt: this.clock.now() },
      async () => this.executeEntitled(command, clientAccountId),
    );
  }

  private async executeEntitled(command: CreateResponsePackageCommand, clientAccountId: string): Promise<ResponsePackage> {
    await assertLotBelongsToTender(this.tenderLotRepository, { organizationId: command.organizationId, tenderId: command.tenderId, lotId: command.lotId });

    const existing = await this.responsePackageRepository.findByScope({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId ?? null,
      clientAccountId,
    });
    if (existing) {
      throw new DuplicateResponsePackageError();
    }

    const occurredAt = this.clock.now();
    const pkg = ResponsePackage.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
      clientAccountId,
      createdBy: command.actorId,
      occurredAt,
    });

    await this.atomicTransactionRunner.run(async () => {
      await this.responsePackageRepository.create(pkg);
      await this.auditLogWriter.record({
        organizationId: command.organizationId,
        actorType: "USER",
        actorId: command.actorId,
        action: "response_package.created",
        resourceType: "response_package",
        resourceId: pkg.id,
        requestId: command.requestId,
        metadata: { tenderId: command.tenderId, lotId: command.lotId ?? null },
      });
    });

    return pkg;
  }
}
