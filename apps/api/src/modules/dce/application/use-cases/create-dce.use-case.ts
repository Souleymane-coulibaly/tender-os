import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { GetTenderUseCase } from "../../../tenders";
import { Dce } from "../../domain/dce.aggregate";
import { DceId } from "../../domain/dce-id.value-object";
import { DcePermission } from "../../domain/dce-permission";
import { assertHasDcePermission } from "../policies/dce-authorization.policy";
import { assertTenderNotArchivedForDceMutation } from "../policies/dce-tender-mutation.policy";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { DCE_REPOSITORY, type DceRepository } from "../ports/dce.repository";
import { toDceSummary, type DceSummary } from "../dtos";

export type CreateDceCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Créer/initialiser le DCE d'un Tender (mission Sprint 1) — idempotent : si un DCE existe déjà
 * pour ce Tender, le renvoie tel quel plutôt que d'échouer (évite un 409 superflu quand le
 * frontend "s'assure" simplement que le DCE existe avant d'afficher son onglet). Une course
 * concurrente entre deux créations simultanées reste possible ; la contrainte unique réelle
 * (tenderId) posée en base est le seul garde-fou nécessaire ici — contrairement à la création de
 * lots (AUDIT-002), aucune valeur calculée n'est en jeu qui justifierait un verrou applicatif.
 */
@Injectable()
export class CreateDceUseCase {
  constructor(
    @Inject(DCE_REPOSITORY) private readonly dceRepository: DceRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    private readonly getTenderUseCase: GetTenderUseCase,
  ) {}

  async execute(command: CreateDceCommand): Promise<DceSummary> {
    assertHasDcePermission(command.actorRole, DcePermission.Create);

    const tender = await this.getTenderUseCase.execute({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      actorRole: command.actorRole,
    });
    assertTenderNotArchivedForDceMutation(tender);

    const existing = await this.dceRepository.findByTenderId({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (existing) {
      return toDceSummary(existing);
    }

    const dce = Dce.create({
      id: DceId.from(this.idGenerator.generate()),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      createdByUserId: command.actorId,
      occurredAt: this.clock.now(),
    });

    const created = await this.dceRepository.create(dce);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "dce.created",
      resourceType: "dce",
      resourceId: created.id.value,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    return toDceSummary(created);
  }
}
