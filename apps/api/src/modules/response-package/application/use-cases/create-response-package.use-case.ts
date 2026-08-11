import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
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
 * Enregistre le PÉRIMÈTRE d'un dossier de réponse (mission §8 "Tender + Lot + Candidate") — cette
 * étape ne collecte encore aucune pièce, elle se contente de déclarer le périmètre DRAFT sans
 * version. La collecte réelle (Checklist + dossier administratif + mémoire technique + chiffrage)
 * est un second temps séparé — voir `BuildResponsePackageVersionUseCase`, même découpage en deux
 * étapes que `CreatePricingScheduleUseCase`/`ExtractPricingScheduleVersionUseCase` (Sprint 13).
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
