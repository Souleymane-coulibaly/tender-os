import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { AssertClientAccessUseCase, ClientAccountArchivedError, ClientPermission, GetClientAccountUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderNotFoundError } from "../../domain/errors";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";

export type ChangeTenderClientAccountCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  clientAccountId: string;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

export type ChangeTenderClientAccountResult = TenderSummary;

/**
 * V2 Sprint 3 §4 — changement CONTRÔLÉ de l'entreprise candidate : jamais via `UpdateTenderUseCase`
 * (le champ est volontairement absent de `TenderDetailsUpdate`/`UpdateTenderBodySchema`). Vérifie
 * la permission `ChangeTenderCandidate` (palier distinct et plus restreint qu'`UpdateTender`,
 * réservé au CLIENT_MANAGER/palier organisation) sur l'ANCIEN ET le NOUVEAU ClientAccount — un
 * acteur ne peut jamais rattacher un Tender à une entreprise candidate à laquelle il n'a lui-même
 * pas accès (mission §16 "aucun utilisateur ne peut rattacher un Tender à une entreprise candidate
 * inaccessible"). La règle de statut (DRAFT/IN_ANALYSIS uniquement) est appliquée par le Domain
 * (`Tender.changeClientAccount`), jamais dupliquée ici.
 */
@Injectable()
export class ChangeTenderClientAccountUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly getClientAccountUseCase: GetClientAccountUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ChangeTenderClientAccountCommand): Promise<ChangeTenderClientAccountResult> {
    const tender = await this.tenderRepository.findById({ organizationId: command.organizationId, tenderId: command.tenderId });
    if (!tender) {
      throw new TenderNotFoundError();
    }

    const previousClientAccountId = tender.clientAccountId;

    // Accès requis sur L'ANCIEN client (quitter) ET le NOUVEAU (rejoindre) — jamais l'un sans
    // l'autre, sinon un acteur pourrait "voler" un Tender vers un client qu'il ne gère pas, ou en
    // détacher un qu'il ne gère plus.
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: previousClientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ChangeTenderCandidate,
    });

    const newClient = await this.getClientAccountUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });
    if (newClient.status === "ARCHIVED") {
      throw new ClientAccountArchivedError();
    }
    await this.assertClientAccessUseCase.execute({
      organizationId: command.organizationId,
      clientAccountId: command.clientAccountId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      permission: ClientPermission.ChangeTenderCandidate,
    });

    const occurredAt = this.clock.now();
    tender.changeClientAccount(command.clientAccountId, occurredAt);

    await this.tenderRepository.save(tender);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.candidate_changed",
      resourceType: "tender",
      resourceId: tender.id.value,
      requestId: command.requestId,
      metadata: { previousClientAccountId, newClientAccountId: command.clientAccountId, reason: command.reason },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "TenderCandidateChanged",
          aggregateType: "Tender",
          aggregateId: tender.id.value,
          payload: { tenderId: tender.id.value, previousClientAccountId, newClientAccountId: command.clientAccountId },
          occurredAt,
        },
      ],
    });

    return toTenderSummary(tender);
  }
}
