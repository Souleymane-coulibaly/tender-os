import { Inject, Injectable, Optional } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import { OUTBOX_WRITER, type OutboxWriter } from "../../../outbox";
import { AiSuggestionPermission, roleHasAiSuggestionPermission } from "../../domain/ai-suggestion-permission";
import { AiSuggestionStatus } from "../../domain/ai-suggestion-status";
import { DEFAULT_TARGET_ACCESS_POLICY } from "../../domain/default-target-access-policy";
import {
  AiSuggestionAlreadyProcessedError,
  AiSuggestionInvalidProposedValueError,
  AiSuggestionNotFoundError,
  AiSuggestionPermissionDeniedError,
  AiSuggestionSchemaNotRegisteredError,
} from "../../domain/errors";
import { toAiSuggestionSummary, type AiSuggestionSummary } from "../dtos";
import { AUDIT_LOG_WRITER, type AuditLogWriter } from "../ports/audit-log-writer";
import { AI_SUGGESTION_TARGET_ACCESS_POLICY, type AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import { AI_SUGGESTION_REPOSITORY, type AiSuggestionRepository } from "../ports/ai-suggestion.repository";
import { AiSuggestionFieldSchemaRegistry } from "../services/ai-suggestion-field-schema-registry";

export type ModifyAiSuggestionCommand = Readonly<{
  id: string;
  organizationId: string;
  actorUserId: string;
  actorRole: string;
  editedValue: unknown;
  reason?: string | undefined;
  /** V2 Sprint 4 — renseigné uniquement lorsque le bridge a détecté un conflit (cible déjà
   *  renseignée) résolu par REPLACE ou MERGE avec une valeur finale différente de la proposition. */
  conflictResolution?: string | undefined;
  /** V2 Sprint 4 (audit Codex P1-001) — le bridge finalise depuis APPLYING (suggestion réservée
   *  avant l'écriture métier), jamais depuis PENDING directement. Absent = PENDING (comportement
   *  historique inchangé pour tout appelant qui n'utilise pas le verrou du bridge). */
  expectedCurrentStatus?: string | undefined;
  requestId?: string | undefined;
}>;

/** Un humain édite la valeur proposée avant de l'accepter — `appliedValue` diffère alors de
 *  `proposedValue` (mission Sprint 1 §3 statuts "MODIFIED"), la proposition IA d'origine reste
 *  conservée intacte pour l'audit.
 *
 *  Correctif audit Codex P1-004 — `editedValue` est validé par le MÊME schéma central que la
 *  proposition d'origine (résolu par `AiSuggestionFieldSchemaRegistry` sur le couple
 *  entityType/fieldName de la suggestion) avant de devenir `appliedValue` — jamais une valeur
 *  humaine libre persistée sans validation. */
@Injectable()
export class ModifyAiSuggestionUseCase {
  private readonly targetAccessPolicy: AiSuggestionTargetAccessPolicy;

  constructor(
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Optional() @Inject(AI_SUGGESTION_TARGET_ACCESS_POLICY) targetAccessPolicy: AiSuggestionTargetAccessPolicy | undefined,
    private readonly schemaRegistry: AiSuggestionFieldSchemaRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AUDIT_LOG_WRITER) private readonly auditLogWriter: AuditLogWriter,
    @Inject(OUTBOX_WRITER) private readonly outboxWriter: OutboxWriter,
  ) {
    this.targetAccessPolicy = targetAccessPolicy ?? DEFAULT_TARGET_ACCESS_POLICY;
  }

  async execute(command: ModifyAiSuggestionCommand): Promise<AiSuggestionSummary> {
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

    const schema = this.schemaRegistry.resolve(existing.entityType, existing.fieldName);
    if (!schema) {
      throw new AiSuggestionSchemaNotRegisteredError(existing.entityType, existing.fieldName);
    }
    const parsedEditedValue = schema.safeParse(command.editedValue);
    if (!parsedEditedValue.success) {
      throw new AiSuggestionInvalidProposedValueError(parsedEditedValue.error.message);
    }

    const now = this.clock.now();
    // Audit Codex P1-001 (round 3) — voir AcceptAiSuggestionUseCase : transition + audit + Outbox
    // dans une seule transaction Postgres, payload calculé depuis `existing`/`command`.
    const updated = await this.repository.transitionFromPending(
      {
        id: command.id,
        organizationId: command.organizationId,
        fromStatus: command.expectedCurrentStatus,
        newStatus: AiSuggestionStatus.Modified,
        validatedByUserId: command.actorUserId,
        validatedAt: now,
        decisionReason: command.reason,
        conflictResolution: command.conflictResolution,
        appliedValue: parsedEditedValue.data,
        updatedAt: now,
      },
      async (tx) => {
        await this.auditLogWriter.record(
          {
            organizationId: command.organizationId,
            actorId: command.actorUserId,
            action: "ai_suggestion.modified",
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
                eventType: "AiSuggestionModified",
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
