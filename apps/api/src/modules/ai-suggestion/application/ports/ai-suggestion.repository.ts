import type { Prisma } from "@prisma/client";

/** V2 Sprint 4 (audit Codex P1-001, round 3) — même motif que `OutboxTransaction` (module Outbox) :
 *  seule fuite volontaire de `Prisma.TransactionClient` dans ce port, pour permettre à
 *  `transitionFromPending` d'exécuter la transition de statut ET ses effets de bord (audit,
 *  Outbox) dans UNE SEULE transaction Postgres courte — jamais trois écritures indépendantes qui
 *  pourraient diverger si le processus s'interrompt entre elles. */
export type PrismaTx = Prisma.TransactionClient;

export type AiSuggestionRecord = Readonly<{
  id: string;
  organizationId: string;
  entityType: string;
  /** V2 Sprint 4 — absent pour une suggestion de CREATION (ex. proposer un nouveau lot). */
  entityId: string | null;
  fieldName: string;
  /** V2 Sprint 4 — contexte de cible explicite, jamais uniquement encodé dans proposedValue. */
  parentTenderId: string;
  parentLotId: string | null;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId: string | null;
  sourceDocumentVersionId: string | null;
  sourcePage: number | null;
  sourceChunkReference: string | null;
  sourceAnalysisAttemptId: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  status: string;
  createdByProcess: string;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  rejectedAt: Date | null;
  decisionReason: string | null;
  /** V2 Sprint 4 — décision explicite lorsque la cible portait déjà une valeur (bridge). */
  conflictResolution: string | null;
  appliedValue: unknown;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CreateAiSuggestionInput = Readonly<{
  id: string;
  organizationId: string;
  entityType: string;
  entityId?: string | undefined;
  fieldName: string;
  parentTenderId: string;
  parentLotId?: string | undefined;
  proposedValue: unknown;
  confidence: number;
  sourceDocumentId?: string | undefined;
  sourceDocumentVersionId?: string | undefined;
  sourcePage?: number | undefined;
  sourceChunkReference?: string | undefined;
  sourceAnalysisAttemptId?: string | undefined;
  aiProvider?: string | undefined;
  aiModel?: string | undefined;
  createdByProcess: string;
  createdAt: Date;
}>;

export interface AiSuggestionRepository {
  create(input: CreateAiSuggestionInput): Promise<AiSuggestionRecord>;

  findById(input: { id: string; organizationId: string }): Promise<AiSuggestionRecord | null>;

  list(input: {
    organizationId: string;
    entityType?: string | undefined;
    entityId?: string | undefined;
    parentTenderId?: string | undefined;
    status?: string | undefined;
  }): Promise<AiSuggestionRecord[]>;

  /** V2 Sprint 4 — utilisé par le mapper Finding → Suggestion pour son idempotence : si au moins
   *  une suggestion existe déjà pour cette tentative d'analyse, le mapping a déjà été exécuté. */
  existsForAnalysisAttempt(input: { organizationId: string; sourceAnalysisAttemptId: string }): Promise<boolean>;

  /** Transition atomique gardée par compare-and-set sur le statut courant (mission Sprint 1 §3) —
   *  retourne `null` si la suggestion n'était plus dans l'état attendu (déjà traitée par un autre
   *  acteur, race condition, ou double-clic). `fromStatus` vaut `PENDING` par défaut (comportement
   *  historique inchangé pour tous les appelants existants) ; V2 Sprint 4 (audit Codex P1-001)
   *  l'utilise aussi avec `fromStatus: APPLYING` pour finaliser une suggestion réservée par le
   *  bridge, et avec `newStatus: PENDING, fromStatus: APPLYING` pour annuler une réservation dont
   *  l'écriture métier a échoué.
   *
   *  V2 Sprint 4 (audit Codex P1-001, round 3) — `onSuccessTx`, si fourni, s'exécute DANS LA MÊME
   *  transaction Postgres que la transition de statut (même motif que
   *  `AnalysisJobRepository.finalizeAttempt`) : Accept/Modify/Reject l'utilisent pour y écrire
   *  l'audit log et l'événement Outbox — la transition de statut, l'audit et l'Outbox deviennent
   *  ainsi atomiques ENTRE EUX (un échec de l'un annule les trois, jamais un statut changé sans
   *  trace). N'appelé QUE si la transition réussit (jamais si `fromStatus` ne correspond plus).
   *  Omis par les réservations internes du bridge (PENDING<->APPLYING), qui ne portent aucun effet
   *  de bord et n'ont donc rien à transactionner. */
  transitionFromPending(
    input: {
      id: string;
      organizationId: string;
      fromStatus?: string | undefined;
      newStatus: string;
      validatedByUserId?: string | undefined;
      validatedAt?: Date | undefined;
      rejectedAt?: Date | undefined;
      decisionReason?: string | undefined;
      conflictResolution?: string | undefined;
      appliedValue?: unknown;
      updatedAt: Date;
    },
    onSuccessTx?: ((tx: PrismaTx) => Promise<void>) | undefined,
  ): Promise<AiSuggestionRecord | null>;
}

export const AI_SUGGESTION_REPOSITORY = Symbol("AI_SUGGESTION_REPOSITORY");
