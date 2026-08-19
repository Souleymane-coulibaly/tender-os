import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { CandidateCompanyArchivedError, GetCandidateCompanyUseCase } from "../../../candidate-company";
import { AssertClientAccessUseCase } from "../../../client-portfolio";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { TenderPermission } from "../../domain/tender-permission";
import { toTenderSummary, type TenderSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { TENDER_REPOSITORY, type TenderRepository } from "../ports/tender.repository";
import { assertHasTenderPermission } from "../policies/tender-authorization.policy";
import { assertTenderMutationAllowed } from "../policies/tender-mutation-client-access.helper";

export type ChangeTenderCandidateCompanyCommand = Readonly<{
  organizationId: string;
  tenderId: string;
  actorId: string;
  actorRole: string;
  candidateCompanyId: string;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

export type ChangeTenderCandidateCompanyResult = TenderSummary;

/**
 * V2 Sprint 26 (Checkpoint 2.1-A3, correctif audit round 3 — anomalie P1 "changement de
 * candidateCompanyId non client-aware") — changement CONTRÔLÉ de l'entreprise candidate (SOT
 * `CandidateCompany`), distinct de `ChangeTenderClientAccountUseCase` (qui gouverne `clientAccountId`,
 * le contexte client/portefeuille legacy — mission §21, les deux champs coexistent). Jamais via
 * `UpdateTenderUseCase` (le champ est volontairement absent de `TenderDetailsUpdate`/
 * `UpdateTenderBodySchema`).
 *
 * Autorisation à DEUX paliers, jamais un seul (même discipline que `UpdateTenderUseCase`/
 * `ChangeTenderStatusUseCase`, voir `tender-mutation-client-access.helper.ts` — correction d'une
 * anomalie P0 antérieure "Mutations Tenders non client-aware") :
 *  1. `TenderPermission.Update` au palier organisation (rôle) ;
 *  2. `assertTenderMutationAllowed` au palier CLIENT — l'acteur doit avoir accès à `ClientPermission.
 *     UpdateTender` sur le `clientAccountId` COURANT du Tender (pas la CandidateCompany, qui n'a pas
 *     de système de permission par affectation en A1). Un rôle organisation (ex. BID_MANAGER) sans
 *     affectation sur le client de CE Tender précis ne peut donc jamais changer sa CandidateCompany —
 *     exactement la même garantie que pour toute autre mutation de contenu du Tender.
 *
 * La règle de statut (DRAFT/IN_ANALYSIS uniquement) est appliquée par le Domain
 * (`Tender.changeCandidateCompany`), jamais dupliquée ici.
 */
@Injectable()
export class ChangeTenderCandidateCompanyUseCase {
  constructor(
    @Inject(TENDER_REPOSITORY) private readonly tenderRepository: TenderRepository,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
    private readonly getCandidateCompanyUseCase: GetCandidateCompanyUseCase,
    private readonly assertClientAccessUseCase: AssertClientAccessUseCase,
  ) {}

  async execute(command: ChangeTenderCandidateCompanyCommand): Promise<ChangeTenderCandidateCompanyResult> {
    assertHasTenderPermission(command.actorRole, TenderPermission.Update);

    const tender = await assertTenderMutationAllowed(this.tenderRepository, this.assertClientAccessUseCase, command);

    const previousCandidateCompanyId = tender.candidateCompanyId;

    const candidateCompany = await this.getCandidateCompanyUseCase.execute({
      organizationId: command.organizationId,
      candidateCompanyId: command.candidateCompanyId,
    });
    if (candidateCompany.status === "ARCHIVED") {
      throw new CandidateCompanyArchivedError();
    }

    const occurredAt = this.clock.now();
    tender.changeCandidateCompany(command.candidateCompanyId, occurredAt);

    await this.tenderRepository.save(tender);

    await this.auditLogWriter.record({
      organizationId: command.organizationId,
      actorId: command.actorId,
      action: "tender.candidate_company_changed",
      resourceType: "tender",
      resourceId: tender.id.value,
      requestId: command.requestId,
      metadata: { previousCandidateCompanyId, newCandidateCompanyId: command.candidateCompanyId, reason: command.reason },
    });

    await this.outboxWriter.write({
      organizationId: command.organizationId,
      events: [
        {
          eventType: "TenderCandidateCompanyChanged",
          aggregateType: "Tender",
          aggregateId: tender.id.value,
          payload: { tenderId: tender.id.value, previousCandidateCompanyId, newCandidateCompanyId: command.candidateCompanyId },
          occurredAt,
        },
      ],
    });

    return toTenderSummary(tender);
  }
}
