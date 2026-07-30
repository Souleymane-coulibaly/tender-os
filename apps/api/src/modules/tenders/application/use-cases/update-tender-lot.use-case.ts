import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { TenderLotNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";
import { assertTenderNotArchivedForLotMutation } from "../policies/tender-lot-mutation.policy";

export type UpdateTenderLotCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  lotId: string;
  actorId: string;
  actorRole: string;
  title?: string | undefined;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  requestId?: string | undefined;
}>;

/** `lotNumber` et `displayOrder` ne sont jamais modifiables ici (conception §E) : le numéro est
 *  figé après création, la position ne se modifie que via ReorderTenderLots. AUDIT-001 : aucune
 *  modification n'est permise sur un Tender archivé. */
@Injectable()
export class UpdateTenderLotUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: UpdateTenderLotCommand): Promise<TenderLotSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    assertTenderNotArchivedForLotMutation(tender);

    const lot = await this.lotRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
    });
    if (!lot) {
      throw new TenderLotNotFoundError();
    }

    lot.update(
      {
        title: command.title,
        description: command.description,
        estimatedAmount: command.estimatedAmount,
        currency: command.currency,
      },
      this.clock.now(),
    );

    await this.lotRepository.save(lot);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender_lot.updated",
      resourceType: "tender_lot",
      resourceId: lot.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    return toTenderLotSummary(lot);
  }
}

export type DeleteTenderLotCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  lotId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/** Suppression logique uniquement (conception §D, décision validée) : `deletedAt` renseigné,
 *  jamais de suppression physique. Idempotence volontairement refusée : supprimer un lot déjà
 *  supprimé lève TenderLotNotFoundError plutôt qu'un succès silencieux (cohérent avec Update).
 *  AUDIT-001 : aucune suppression n'est permise sur un Tender archivé. */
@Injectable()
export class DeleteTenderLotUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: DeleteTenderLotCommand): Promise<void> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    assertTenderNotArchivedForLotMutation(tender);

    const lot = await this.lotRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
    });
    if (!lot) {
      throw new TenderLotNotFoundError();
    }

    lot.softDelete(this.clock.now());

    await this.lotRepository.save(lot);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender_lot.deleted",
      resourceType: "tender_lot",
      resourceId: lot.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });
  }
}
