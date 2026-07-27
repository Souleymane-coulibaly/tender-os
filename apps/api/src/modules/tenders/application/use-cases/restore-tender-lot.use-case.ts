import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { TenderLotNotFoundError, TenderNotFoundError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderNotArchivedForLotMutation } from "../policies/tender-lot-mutation.policy";

export type RestoreTenderLotCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  lotId: string;
  actorId: string;
  actorRole: string;
  requestId?: string | undefined;
}>;

/**
 * Le numéro de lot reste réservé même supprimé (conception §D) : restaurer ne peut jamais entrer
 * en collision avec un lot créé entretemps — aucune vérification d'unicité nécessaire ici.
 * AUDIT-002 : la position de fin de liste et l'état "non supprimé" sont recalculés et persistés
 * de façon atomique par le repository (restoreAppendedAtEnd), verrouillée par tenderId.
 * AUDIT-001 : aucune restauration n'est permise sur un Tender archivé.
 * Un lotId inexistant lève TenderLotNotFoundError ; un lot qui existe mais n'est pas supprimé
 * lève TenderLotNotDeletedError (via TenderLot#restore, appelé à l'intérieur du verrou).
 */
@Injectable()
export class RestoreTenderLotUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RestoreTenderLotCommand): Promise<TenderLotSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await this.tenderRepository.findById({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (!tender) {
      throw new TenderNotFoundError();
    }
    assertTenderNotArchivedForLotMutation(tender);

    const lot = await this.lotRepository.findByIdIncludingDeleted({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotId: command.lotId,
    });
    if (!lot) {
      throw new TenderLotNotFoundError();
    }

    const restored = await this.lotRepository.restoreAppendedAtEnd({ lot, occurredAt: this.clock.now() });

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender_lot.restored",
      resourceType: "tender_lot",
      resourceId: restored.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId },
    });

    return toTenderLotSummary(restored);
  }
}
