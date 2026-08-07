import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { AiSuggestionStatus } from "../../domain/ai-suggestion-status";
import { DEFAULT_TARGET_ACCESS_POLICY } from "../../domain/default-target-access-policy";
import { AiSuggestionAlreadyProcessedError, AiSuggestionNotFoundError, AiSuggestionPermissionDeniedError } from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";

export type RejectAiSuggestionCommand = Readonly<{
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  reason?: string | undefined;
  /** V2 Sprint 4 — renseigné lorsque le rejet résulte d'un conflit tranché par KEEP_CURRENT ou
   *  REJECT explicite (bridge), distingué d'un rejet simple sans conflit. */
  conflictResolution?: string | undefined;
  requestId?: string | undefined;
}>;

/** Mission Sprint 1 §3 — "conserver les suggestions rejetées pour l'audit" : la ligne n'est
 *  jamais supprimée, seul son statut transite vers REJECTED. */
@Injectable()
export class RejectAiSuggestionUseCase {
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

  async execute(command: RejectAiSuggestionCommand): Promise<AiSuggestionSummary> {
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
    // Audit Codex P1-001 (round 3) — voir AcceptAiSuggestionUseCase : transition + audit + Outbox
    // dans une seule transaction Postgres, payload calculé depuis `existing`/`command`.
    const updated = await this.repository.transitionFromPending(
      {
        id: command.id,
        organizationId: command.organizationId,
        newStatus: AiSuggestionStatus.Rejected,
        validatedByUserId: command.actorUserId,
        rejectedAt: now,
        decisionReason: command.reason,
        conflictResolution: command.conflictResolution,
        updatedAt: now,
      },
      async (tx) => {
        await this.auditLogWriter.record(
          {
            organizationId: command.organizationId,
            actorId: command.actorUserId,
            action: "ai_suggestion.rejected",
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
                eventType: "AiSuggestionRejected",
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
