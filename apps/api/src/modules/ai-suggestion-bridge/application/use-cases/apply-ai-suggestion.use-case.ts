import { Inject, Injectable } from "@nestjs/common";
import type { Clock } from "../../../../shared-kernel/clock";
import { CLOCK } from "../../../../shared-kernel/clock";
import {
  AcceptAiSuggestionUseCase,
  AiSuggestionAlreadyProcessedError,
  AiSuggestionStatus,
  AI_SUGGESTION_REPOSITORY,
  GetAiSuggestionUseCase,
  ModifyAiSuggestionUseCase,
  RejectAiSuggestionUseCase,
  type AiSuggestionRepository,
  type AiSuggestionSummary,
} from "../../../ai-suggestion";
import { canMergeByShape, mergeValues } from "../../domain/merge";
import { CONFLICT_RESOLUTIONS, ConflictResolution } from "../../domain/conflict-resolution";
import { AiSuggestionMergeNotAllowedError, AiSuggestionTargetConflictError, UnsupportedAiSuggestionEntityTypeError } from "../../domain/errors";
import { AI_SUGGESTION_ENTITY_TARGET_ADAPTER_REGISTRY, type AiSuggestionEntityTargetAdapterRegistry } from "../ports/entity-target-adapter";
import { ATOMIC_TRANSACTION_RUNNER, type AtomicTransactionRunner } from "../ports/atomic-transaction-runner";

export type ApplyAiSuggestionCommand = Readonly<{
  id: string;
  organizationId: string;
  actorId: string;
  actorRole: string;
  /** Valeur éditée par l'utilisateur avant application — absente = accepter la proposition telle
   *  quelle (ou telle que fusionnée, si conflictResolution = MERGE). */
  editedValue?: unknown;
  /** Exigée dès que la cible porte déjà une valeur (§12) — voir `AiSuggestionTargetConflictError`. */
  conflictResolution?: ConflictResolution | undefined;
  reason?: string | undefined;
  requestId?: string | undefined;
}>;

/**
 * V2 Sprint 4 — orchestrateur central : Analysis → AiSuggestion → AiSuggestionBridge → use case
 * public du module cible → donnée métier validée. N'écrit JAMAIS directement avec Prisma ; ne
 * contourne jamais un use case existant ; ne devient jamais une seconde source de vérité (la
 * donnée métier réelle, une fois écrite par le use case du module cible, fait seule foi).
 *
 * Étapes (mission) : charger la suggestion, vérifier son statut (délégué aux use cases
 * accept/modify/reject eux-mêmes — jamais dupliqué ici), vérifier l'organisation et les
 * permissions sur la cible (délégué à `GetAiSuggestionUseCase`, qui invoque déjà
 * `AiSuggestionTargetAccessPolicy`), charger l'état courant de la cible, détecter les conflits,
 * appliquer la décision utilisateur, appeler le use case public du module cible, mettre à jour la
 * suggestion (via Accept/Modify/Reject — jamais une seconde logique de transition dupliquée ici),
 * l'audit et l'Outbox restant portés par `ai-suggestion` lui-même (générique, réutilisé tel quel).
 *
 * Correctif audit Codex P1-001 (round 1) — première mitigation : la suggestion est RÉSERVÉE
 * (PENDING -> APPLYING, compare-and-set atomique) AVANT l'écriture métier, ce qui rend impossible
 * qu'un double-clic ou un retry déclenche une seconde écriture métier.
 *
 * Correctif audit Codex P1-001 (round 3) — la FINALISATION elle-même (transition de statut + audit
 * + Outbox, dans Accept/Modify) devient une seule transaction Postgres courte.
 *
 * Correctif audit Codex P1-001 (round 4 — atomicité totale) — Codex a maintenu un NO-GO sur les
 * rounds 1/3 : une fenêtre résiduelle subsistait entre l'écriture métier cible (Tenders/Buyer) et
 * la finalisation de la suggestion. Fermée ici via `AtomicTransactionRunner` (voir ce port) : la
 * réservation, `adapter.applyValue` (donc TOUTE la chaîne d'appels Tenders/Buyer qu'il déclenche),
 * ET la finalisation (statut + audit + Outbox) s'exécutent maintenant DANS UNE SEULE TRANSACTION
 * POSTGRES — un seul COMMIT, rollback total si n'importe quelle étape échoue. Concrètement :
 *   - si l'écriture métier échoue -> toute la transaction (y compris la réservation) est annulée,
 *     la suggestion redevient PENDING automatiquement (rollback Postgres, plus de "revert" manuel) ;
 *   - si la finalisation échoue APRÈS une écriture métier réussie -> cette écriture métier est
 *     elle-même annulée (rollback), jamais une donnée Tenders/Buyer persistée orpheline d'une
 *     suggestion non finalisée ;
 *   - jamais de suggestion ACCEPTED/MODIFIED sans que la donnée métier corresponde à ce qui a été
 *     réellement écrit dans la même transaction.
 * Réalisé SANS changer la signature d'aucun des ~13 use cases d'écriture de Tenders/Buyer ni
 * d'aucun port : un contexte transactionnel ambiant (`TransactionalContext`, AsyncLocalStorage,
 * shared-kernel) est établi par `PrismaAtomicTransactionRunner` pour toute la durée de cette
 * transaction — seuls les repositories Prisma qui consultent explicitement
 * `PrismaService.currentClient()` (au lieu de `this.prisma`) y participent : les 7 repositories
 * Tenders/Buyer réellement traversés par `adapter.applyValue` (Tender, TenderLot, AwardCriterion,
 * RequestedDocument, Milestone, Risk, Buyer), leur `AuditLogWriter`, le repository Outbox, et
 * `AiSuggestionRepository` lui-même. Aucun autre repository du dépôt n'est concerné.
 */
@Injectable()
export class ApplyAiSuggestionUseCase {
  constructor(
    private readonly getAiSuggestionUseCase: GetAiSuggestionUseCase,
    private readonly acceptAiSuggestionUseCase: AcceptAiSuggestionUseCase,
    private readonly modifyAiSuggestionUseCase: ModifyAiSuggestionUseCase,
    private readonly rejectAiSuggestionUseCase: RejectAiSuggestionUseCase,
    @Inject(AI_SUGGESTION_ENTITY_TARGET_ADAPTER_REGISTRY) private readonly adapters: AiSuggestionEntityTargetAdapterRegistry,
    @Inject(AI_SUGGESTION_REPOSITORY) private readonly repository: AiSuggestionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ATOMIC_TRANSACTION_RUNNER) private readonly atomicTransactionRunner: AtomicTransactionRunner,
  ) {}

  async execute(command: ApplyAiSuggestionCommand): Promise<AiSuggestionSummary> {
    if (command.conflictResolution !== undefined && !CONFLICT_RESOLUTIONS.includes(command.conflictResolution)) {
      throw new Error(`conflictResolution "${command.conflictResolution}" invalide.`);
    }

    const suggestion = await this.getAiSuggestionUseCase.execute({
      id: command.id,
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
    });

    const adapter = this.adapters.get(suggestion.entityType);
    if (!adapter) {
      // Question/Clause findings (et tout entityType non mappé) restent purement informatifs —
      // mission §9 : jamais transformés en donnée métier.
      throw new UnsupportedAiSuggestionEntityTypeError(suggestion.entityType);
    }

    const current = await adapter.readCurrentValue({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      parentTenderId: suggestion.parentTenderId,
      parentLotId: suggestion.parentLotId,
      entityId: suggestion.entityId,
      fieldName: suggestion.fieldName,
    });

    const effectiveProposedValue = command.editedValue !== undefined ? command.editedValue : suggestion.proposedValue;

    let finalValue = effectiveProposedValue;

    if (current.exists) {
      // §12 — une décision explicite est TOUJOURS exigée lorsque la cible porte déjà une valeur,
      // jamais un remplacement silencieux.
      if (command.conflictResolution === undefined) {
        throw new AiSuggestionTargetConflictError();
      }

      if (command.conflictResolution === ConflictResolution.KeepCurrent || command.conflictResolution === ConflictResolution.Reject) {
        // Aucune écriture métier n'a lieu sur ce chemin : jamais besoin de réserver la suggestion.
        return this.rejectAiSuggestionUseCase.execute({
          id: command.id,
          organizationId: command.organizationId,
          actorUserId: command.actorId,
          actorRole: command.actorRole,
          reason: command.reason,
          conflictResolution: command.conflictResolution,
        });
      }

      if (command.conflictResolution === ConflictResolution.Merge) {
        if (!adapter.isFieldMergeable(suggestion.fieldName) || !canMergeByShape(current.currentValue, effectiveProposedValue)) {
          throw new AiSuggestionMergeNotAllowedError();
        }
        finalValue = mergeValues(current.currentValue, effectiveProposedValue);
      }
      // REPLACE : finalValue reste effectiveProposedValue, appliqué ci-dessous.
    }

    const wasEdited = JSON.stringify(finalValue) !== JSON.stringify(suggestion.proposedValue);

    // Correctif audit Codex P1-001 (round 4) — réservation, écriture métier ET finalisation dans
    // UNE SEULE transaction Postgres (voir AtomicTransactionRunner) : si quoi que ce soit échoue
    // en cours de route, TOUT est annulé, y compris la réservation elle-même (rollback Postgres —
    // plus besoin d'un "revert" applicatif manuel).
    return this.atomicTransactionRunner.run(async () => {
      // Réservation atomique AVANT l'écriture métier : une suggestion qui n'est plus PENDING (déjà
      // appliquée, déjà rejetée, ou déjà en cours d'application par une requête concurrente)
      // refuse la réservation, jamais une seconde écriture métier dupliquée. Le verrou de ligne
      // Postgres pris par cette écriture est tenu pour toute la durée de la transaction : une
      // tentative concurrente sur la même suggestion bloque puis échoue proprement une fois
      // celle-ci validée ou annulée.
      const reserved = await this.repository.transitionFromPending({
        id: command.id,
        organizationId: command.organizationId,
        fromStatus: AiSuggestionStatus.Pending,
        newStatus: AiSuggestionStatus.Applying,
        updatedAt: this.clock.now(),
      });
      if (!reserved) {
        throw new AiSuggestionAlreadyProcessedError();
      }

      await adapter.applyValue({
        organizationId: command.organizationId,
        actorId: command.actorId,
        actorRole: command.actorRole,
        parentTenderId: suggestion.parentTenderId,
        parentLotId: suggestion.parentLotId,
        entityId: suggestion.entityId,
        fieldName: suggestion.fieldName,
        value: finalValue,
        requestId: command.requestId,
      });

      if (wasEdited) {
        return this.modifyAiSuggestionUseCase.execute({
          id: command.id,
          organizationId: command.organizationId,
          actorUserId: command.actorId,
          actorRole: command.actorRole,
          editedValue: finalValue,
          reason: command.reason,
          conflictResolution: command.conflictResolution,
          expectedCurrentStatus: AiSuggestionStatus.Applying,
        });
      }

      return this.acceptAiSuggestionUseCase.execute({
        id: command.id,
        organizationId: command.organizationId,
        actorUserId: command.actorId,
        actorRole: command.actorRole,
        conflictResolution: command.conflictResolution,
        expectedCurrentStatus: AiSuggestionStatus.Applying,
      });
    });
  }
}
