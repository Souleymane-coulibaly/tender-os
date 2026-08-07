import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { AiSuggestionStatus } from "../../domain/ai-suggestion-status";
import { DEFAULT_TARGET_ACCESS_POLICY } from "../../domain/default-target-access-policy";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { AiSuggestionAlreadyProcessedError, AiSuggestionNotFoundError, AiSuggestionPermissionDeniedError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";

export type AcceptAiSuggestionCommand = Readonly<{
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  /** V2 Sprint 4 — renseigné uniquement lorsque le bridge a détecté que la cible portait déjà
   *  une valeur et que l'utilisateur a choisi REPLACE (accepter malgré le conflit). */
  conflictResolution?: string | undefined;
  /** V2 Sprint 4 (audit Codex P1-001) — le bridge finalise depuis APPLYING (suggestion réservée
   *  avant l'écriture métier), jamais depuis PENDING directement. Absent = PENDING (comportement
   *  historique inchangé pour tout appelant qui n'utilise pas le verrou du bridge). */
  expectedCurrentStatus?: string | undefined;
  requestId?: string | undefined;
}>;

/** Mission Sprint 1 §3 — "l'acceptation doit passer par un use case explicite". La valeur
 *  retenue (`appliedValue`) est exactement la valeur proposée, sans édition humaine (voir
 *  `ModifyAiSuggestionUseCase` pour le cas d'une valeur éditée avant acceptation). */
@Injectable()
export class AcceptAiSuggestionUseCase {
  private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy;

  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Optional() @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) targetAccessPolicy: AiSuggestionTargetAccessPolicy | undefined,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {
    this.targetAccessPolicy = targetAccessPolicy ?? DEFAULT_TARGET_ACCESS_POLICY;
  }

  async execute(command: AcceptAiSuggestionCommand): Promise<AiSuggestionSummary> {
    if (!roleHasAiSuggestionPermission(command.actorRole, AiSuggestionPermission.Decide)) {
      throw new AiSuggestionPermissionDeniedError();
    }

    const existing = await this.repository.findById({ id: command.id, organizationId: command.organizationId });
    if (!existing) {
      throw new AiSuggestionNotFoundError();
    }

    // Correctif audit Codex P1-005.
    await this.targetAccessPolicy.assertCanAccessTarget({
      organizationId: command.organizationId,
      actorId: command.actorUserId,
      actorRole: command.actorRole,
      entityType: existing.entityType,
      entityId: existing.entityId ?? undefined,
      parentTenderId: existing.parentTenderId,
      parentLotId: existing.parentLotId ?? undefined,
    });

    const now = this.clock.now();
    // Audit Codex P1-001 (round 3) — la transition, l'audit et l'Outbox sont écrits dans UNE
    // SEULE transaction Postgres (voir `onSuccessTx`) : le payload est calculé à partir de
    // `existing`/`command`, jamais de la valeur post-transition (identique pour ces champs,
    // évite toute dépendance d'ordre entre l'écriture et son propre effet de bord).
    const updated = await this.repository.transitionFromPending(
      {
        id: command.id,
        organizationId: command.organizationId,
        fromStatus: command.expectedCurrentStatus,
        newStatus: AiSuggestionStatus.Accepted,
        validatedByUserId: command.actorUserId,
        validatedAt: now,
        conflictResolution: command.conflictResolution,
        appliedValue: existing.proposedValue,
        updatedAt: now,
      },
      async (tx) => {
        await this.auditLogWriter.record(
          {
            organizationId: command.organizationId,
            actorId: command.actorUserId,
            action: "ai_suggestion.accepted",
            resourceType: "ai_suggestion",
            resourceId: command.id,
            requestId: command.requestId,
            metadata: { entityType: existing.entityType, fieldName: existing.fieldName, parentTenderId: existing.parentTenderId },
          },
          tx,
        );

        await this.outboxWriter.write(
          {
            organizationId: command.organizationId,
            events: [
              {
                eventType: "AiSuggestionAccepted",
                aggregateType: "AiSuggestion",
                aggregateId: command.id,
                payload: { suggestionId: command.id, entityType: existing.entityType, fieldName: existing.fieldName, parentTenderId: existing.parentTenderId },
                occurredAt: now,
              },
            ],
          },
          tx,
        );
      },
    );

    if (!updated) {
      throw new AiSuggestionAlreadyProcessedError();
    }

    return toAiSuggestionSummary(updated);
  }
}
