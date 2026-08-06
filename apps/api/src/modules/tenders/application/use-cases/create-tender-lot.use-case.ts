import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import type { IdGenerator } from "../../../../shared-kernel/id-generator";
import { ID_GENERATOR } from "../../../../shared-kernel/id-generator";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { DuplicateTenderLotNumberError } from "../../domain/errors";
import { TenderLot } from "../../domain/tender-lot.entity";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderLotSummary, type TenderLotSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_LOT_REPOSITORY, type TenderLotRepository } from "../ports/tender-lot.repository";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";
import { assertTenderNotArchivedForLotMutation } from "../policies/tender-lot-mutation.policy";

export type CreateTenderLotCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  lotNumber: string;
  title: string;
  description?: string | undefined;
  estimatedAmount?: string | undefined;
  currency?: string | undefined;
  code?: string | undefined;
  cpvMain?: string | undefined;
  cpvSecondary?: string[] | undefined;
  executionLocation?: string | undefined;
  durationMonths?: number | undefined;
  estimatedStartDate?: string | undefined;
  minimumAmount?: string | undefined;
  maximumAmount?: string | undefined;
  selectedForResponse?: boolean | undefined;
  soloAllowed?: boolean | undefined;
  groupAllowed?: boolean | undefined;
  variantsAllowed?: boolean | undefined;
  pseAllowed?: boolean | undefined;
  specificVisitRequired?: boolean | undefined;
  specificVisitDate?: string | undefined;
  internalNotes?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * Vérifie que le Tender existe et appartient à l'organisation active avant toute création
 * (conception §A, §E) — correctif d'isolation multi-tenant : sans ce chargement, un tenderId
 * valide mais appartenant à une autre organisation permettait auparavant de créer un lot
 * orphelin (jamais détecté par le pré-check d'unicité, scopé lui aussi par organizationId).
 * AUDIT-001 : aucune création n'est permise sur un Tender archivé (règle centralisée).
 * AUDIT-002 : `displayOrder` n'est jamais accepté en entrée ni calculé ici — il est calculé et
 * persisté de façon atomique par le repository (createAppendedAtEnd), verrouillée par tenderId,
 * pour éliminer toute collision entre créations concurrentes.
 */
@Injectable()
export class CreateTenderLotUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(TENDER_LOT_REPOSITORY) private readonly lotRepository: TenderLotRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: CreateTenderLotCommand): Promise<TenderLotSummary> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);
    assertTenderNotArchivedForLotMutation(tender);

    // Pré-check applicatif non atomique — la contrainte unique réelle (tenderId, lotNumber)
    // reste le seul garde-fou fiable sous concurrence ; l'implémentation Prisma traduit une
    // violation P2002 en DuplicateTenderLotNumberError avant qu'elle ne remonte ici.
    const existing = await this.lotRepository.listByTender({
      organizationId: command.organizationId,
      tenderId: command.tenderId,
    });
    if (existing.some((lot) => lot.lotNumber === command.lotNumber)) {
      throw new DuplicateTenderLotNumberError();
    }

    const occurredAt = this.clock.now();
    const lot = TenderLot.create({
      id: this.idGenerator.generate(),
      organizationId: command.organizationId,
      tenderId: command.tenderId,
      lotNumber: command.lotNumber,
      title: command.title,
      description: command.description,
      estimatedAmount: command.estimatedAmount,
      currency: command.currency,
      code: command.code,
      cpvMain: command.cpvMain,
      cpvSecondary: command.cpvSecondary,
      executionLocation: command.executionLocation,
      durationMonths: command.durationMonths,
      estimatedStartDate: command.estimatedStartDate ? new Date(command.estimatedStartDate) : undefined,
      minimumAmount: command.minimumAmount,
      maximumAmount: command.maximumAmount,
      selectedForResponse: command.selectedForResponse,
      soloAllowed: command.soloAllowed,
      groupAllowed: command.groupAllowed,
      variantsAllowed: command.variantsAllowed,
      pseAllowed: command.pseAllowed,
      specificVisitRequired: command.specificVisitRequired,
      specificVisitDate: command.specificVisitDate ? new Date(command.specificVisitDate) : undefined,
      internalNotes: command.internalNotes,
      displayOrder: 0, // provisoire — écrasé de façon atomique par createAppendedAtEnd (AUDIT-002)
      occurredAt,
    });

    const created = await this.lotRepository.createAppendedAtEnd(lot);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender_lot.created",
      resourceType: "tender_lot",
      resourceId: created.id,
      requestId: command.requestId,
      metadata: { tenderId: command.tenderId, lotNumber: created.lotNumber },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "TenderLotCreated",
          aggregateType: "Tender",
          aggregateId: command.tenderId,
          payload: { tenderId: command.tenderId, lotId: created.id, lotNumber: created.lotNumber },
          occurredAt,
        },
      ],
    });

    return toTenderLotSummary(created);
  }
}
