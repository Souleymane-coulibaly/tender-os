import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { InvalidLotReorderPayloadError } from "../../domain/errors";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";
import { assertTenderNotArchivedForLotMutation } from "../policies/tender-lot-mutation.policy";

export type ReorderTenderLotsCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  orderedLotIds: readonly string[];
  requestId?: string | undefined;
}>;

/**
 * Seul point d'entrée qui modifie displayOrder pour plusieurs lots à la fois (conception §D,
 * §E) : réécrit la séquence dense 0..N-1 pour tous les lots actifs du Tender, dans l'ordre
 * fourni, en une seule transaction. `orderedLotIds` doit correspondre exactement à l'ensemble des
 * lots actifs — ni sous-ensemble, ni doublon, ni identifiant étranger — sinon rejet explicite
 * plutôt qu'un réordonnancement partiel silencieux. AUDIT-001 : aucun réordonnancement n'est
 * permis sur un Tender archivé.
 */
@Injectable()
export class ReorderTenderLotsUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ReorderTenderLotsCommand): Promise<TenderLotSummary[]> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    assertTenderNotArchivedForLotMutation(tender);

    const activeLots = await this.lotRepository.listByTender({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });

    if (new Set(command.orderedLotIds).size !== command.orderedLotIds.length) {
      throw new InvalidLotReorderPayloadError({ reason: "duplicate lot id in the payload" });
    }
    if (command.orderedLotIds.length !== activeLots.length) {
      throw new InvalidLotReorderPayloadError({
        reason: `expected ${activeLots.length} lot id(s), received ${command.orderedLotIds.length}`,
      });
    }

    const lotsById = new Map(activeLots.map((lot) => [lot.id, lot]));
    const orderedLots = command.orderedLotIds.map((lotId) => {
      const lot = lotsById.get(lotId);
      if (!lot) {
        throw new InvalidLotReorderPayloadError({ reason: `lot "${lotId}" does not belong to this tender` });
      }
      return lot;
    });

    const occurredAt = this.clock.now();
    orderedLots.forEach((lot, index) => lot.reorder(index, occurredAt));

    await this.lotRepository.saveReordered(orderedLots);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender_lot.reordered",
      resourceType: "tender_lot",
      resourceId: command.tenderId,
      requestId: command.requestId,
      metadata: { orderedLotIds: command.orderedLotIds },
    });

    return orderedLots.map(toTenderLotSummary);
  }
}
