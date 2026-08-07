import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AcceptAiSuggestionUseCase,
  AiSuggestionRepository,
  AiSuggestionSummary,
  GetAiSuggestionUseCase,
  ModifyAiSuggestionUseCase,
  RejectAiSuggestionUseCase,
} from "../../../ai-suggestion";
import { AiSuggestionAlreadyProcessedError } from "../../../ai-suggestion";
import type { Clock } from "../../../../shared-kernel/clock";
import { ConflictResolution } from "../../domain/conflict-resolution";
import { AiSuggestionMergeNotAllowedError, AiSuggestionTargetConflictError, UnsupportedAiSuggestionEntityTypeError } from "../../domain/errors";
import type { AiSuggestionEntityTargetAdapter, EntityTargetApplyInput, EntityTargetApplyResult, EntityTargetReadInput, EntityTargetReadResult } from "../ports/entity-target-adapter";
import type { AtomicTransactionRunner } from "../ports/atomic-transaction-runner";
import { ApplyAiSuggestionUseCase } from "./apply-ai-suggestion.use-case";

const ORG = "org-1";
const SUGGESTION_ID = "suggestion-1";
const TENDER_ID = "tender-1";

function baseSuggestion(overrides: Partial<AiSuggestionSummary> = {}): AiSuggestionSummary {
  return {
    id: SUGGESTION_ID,
    organizationId: ORG,
    entityType: "TENDER_FIELD",
    entityId: undefined,
    fieldName: "description",
    parentTenderId: TENDER_ID,
    parentLotId: undefined,
    proposedValue: "Nouvelle description proposée par l'IA.",
    confidence: 0.9,
    sourceDocumentId: undefined,
    sourceDocumentVersionId: undefined,
    sourcePage: undefined,
    sourceChunkReference: undefined,
    sourceAnalysisAttemptId: undefined,
    aiProvider: undefined,
    aiModel: undefined,
    status: "PENDING",
    createdByProcess: "test",
    validatedByUserId: undefined,
    validatedAt: undefined,
    rejectedAt: undefined,
    decisionReason: undefined,
    conflictResolution: undefined,
    appliedValue: undefined,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

class FakeAdapter implements AiSuggestionEntityTargetAdapter {
  currentValue: unknown = undefined;
  exists = false;
  mergeableFields = new Set<string>();
  applyThrows: Error | undefined;
  readonly applyCalls: EntityTargetApplyInput[] = [];

  isFieldMergeable(fieldName: string): boolean {
    return this.mergeableFields.has(fieldName);
  }

  async readCurrentValue(_input: EntityTargetReadInput): Promise<EntityTargetReadResult> {
    return { exists: this.exists, currentValue: this.currentValue };
  }

  async applyValue(input: EntityTargetApplyInput): Promise<EntityTargetApplyResult> {
    this.applyCalls.push(input);
    if (this.applyThrows) {
      throw this.applyThrows;
    }
    return { entityId: input.entityId ?? "created-entity-id" };
  }
}

/** Simule le compare-and-set réel de `PrismaAiSuggestionRepository.transitionFromPending` (audit
 *  Codex P1-001) — un seul champ `status` en mémoire, gardé par `fromStatus` (PENDING par défaut). */
class FakeAiSuggestionRepository implements Pick<AiSuggestionRepository, "transitionFromPending"> {
  status = "PENDING";
  readonly transitions: { fromStatus: string; newStatus: string }[] = [];

  async transitionFromPending(input: Parameters<AiSuggestionRepository["transitionFromPending"]>[0]): ReturnType<AiSuggestionRepository["transitionFromPending"]> {
    const expected = input.fromStatus ?? "PENDING";
    this.transitions.push({ fromStatus: expected, newStatus: input.newStatus });
    if (this.status !== expected) {
      return null;
    }
    this.status = input.newStatus;
    return {} as Awaited<ReturnType<AiSuggestionRepository["transitionFromPending"]>>;
  }
}

class FixedClock implements Clock {
  now(): Date {
    return new Date("2026-08-07T00:00:00.000Z");
  }
}

/** Simule le comportement transactionnel réel de `PrismaAtomicTransactionRunner` (audit Codex
 *  P1-001, round 4) pour un test unitaire sans Postgres : si `fn` lève, restaure l'état du fake
 *  repository tel qu'il était AVANT l'appel — exactement ce qu'un vrai ROLLBACK Postgres
 *  produirait (la preuve du rollback RÉEL, cross-table, vit dans le test d'intégration
 *  PostgreSQL dédié, pas ici). */
class FakeAtomicTransactionRunner implements AtomicTransactionRunner {
  constructor(private readonly repository: FakeAiSuggestionRepository) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const statusBeforeTransaction = this.repository.status;
    try {
      return await fn();
    } catch (error) {
      this.repository.status = statusBeforeTransaction;
      throw error;
    }
  }
}

describe("ApplyAiSuggestionUseCase", () => {
  let getAiSuggestionUseCase: { execute: ReturnType<typeof vi.fn> };
  let acceptAiSuggestionUseCase: { execute: ReturnType<typeof vi.fn> };
  let modifyAiSuggestionUseCase: { execute: ReturnType<typeof vi.fn> };
  let rejectAiSuggestionUseCase: { execute: ReturnType<typeof vi.fn> };
  let adapter: FakeAdapter;
  let repository: FakeAiSuggestionRepository;

  beforeEach(() => {
    adapter = new FakeAdapter();
    repository = new FakeAiSuggestionRepository();
    getAiSuggestionUseCase = { execute: vi.fn(async () => baseSuggestion()) };
    acceptAiSuggestionUseCase = { execute: vi.fn(async () => ({ status: "ACCEPTED" })) };
    modifyAiSuggestionUseCase = { execute: vi.fn(async () => ({ status: "MODIFIED" })) };
    rejectAiSuggestionUseCase = { execute: vi.fn(async () => ({ status: "REJECTED" })) };
  });

  function buildUseCase(): ApplyAiSuggestionUseCase {
    return new ApplyAiSuggestionUseCase(
      getAiSuggestionUseCase as unknown as GetAiSuggestionUseCase,
      acceptAiSuggestionUseCase as unknown as AcceptAiSuggestionUseCase,
      modifyAiSuggestionUseCase as unknown as ModifyAiSuggestionUseCase,
      rejectAiSuggestionUseCase as unknown as RejectAiSuggestionUseCase,
      new Map([["TENDER_FIELD", adapter]]),
      repository as unknown as AiSuggestionRepository,
      new FixedClock(),
      new FakeAtomicTransactionRunner(repository),
    );
  }

  it("throws UnsupportedAiSuggestionEntityTypeError when no adapter is registered for the entityType", async () => {
    getAiSuggestionUseCase.execute = vi.fn(async () => baseSuggestion({ entityType: "QUESTION_FINDING" }));
    const useCase = buildUseCase();

    await expect(useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toBeInstanceOf(
      UnsupportedAiSuggestionEntityTypeError,
    );
  });

  it("applies directly and accepts when the target has no current value", async () => {
    adapter.exists = false;
    const useCase = buildUseCase();

    const result = await useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER" });

    expect(adapter.applyCalls).toHaveLength(1);
    expect(adapter.applyCalls[0]?.value).toBe("Nouvelle description proposée par l'IA.");
    expect(acceptAiSuggestionUseCase.execute).toHaveBeenCalledTimes(1);
    expect(modifyAiSuggestionUseCase.execute).not.toHaveBeenCalled();
    expect(rejectAiSuggestionUseCase.execute).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "ACCEPTED" });
  });

  it("requires an explicit conflictResolution when the target already has a value", async () => {
    adapter.exists = true;
    adapter.currentValue = "Description déjà présente.";
    const useCase = buildUseCase();

    await expect(useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toBeInstanceOf(
      AiSuggestionTargetConflictError,
    );
    expect(adapter.applyCalls).toHaveLength(0);
  });

  it("KEEP_CURRENT rejects the suggestion and never touches the target", async () => {
    adapter.exists = true;
    adapter.currentValue = "Description déjà présente.";
    const useCase = buildUseCase();

    const result = await useCase.execute({
      id: SUGGESTION_ID,
      organizationId: ORG,
      actorId: "u",
      actorRole: "BID_MANAGER",
      conflictResolution: ConflictResolution.KeepCurrent,
    });

    expect(adapter.applyCalls).toHaveLength(0);
    expect(rejectAiSuggestionUseCase.execute).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "REJECTED" });
  });

  it("REPLACE overwrites the target with the proposed value and accepts", async () => {
    adapter.exists = true;
    adapter.currentValue = "Description déjà présente.";
    const useCase = buildUseCase();

    await useCase.execute({
      id: SUGGESTION_ID,
      organizationId: ORG,
      actorId: "u",
      actorRole: "BID_MANAGER",
      conflictResolution: ConflictResolution.Replace,
    });

    expect(adapter.applyCalls[0]?.value).toBe("Nouvelle description proposée par l'IA.");
    expect(acceptAiSuggestionUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it("MERGE refuses a field the adapter does not allow, even if the shapes are compatible", async () => {
    adapter.exists = true;
    adapter.currentValue = "Description déjà présente.";
    adapter.mergeableFields = new Set(); // "description" not declared mergeable by this adapter instance
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER", conflictResolution: ConflictResolution.Merge }),
    ).rejects.toBeInstanceOf(AiSuggestionMergeNotAllowedError);
    expect(adapter.applyCalls).toHaveLength(0);
  });

  it("MERGE refuses incompatible shapes even on an allow-listed field", async () => {
    adapter.exists = true;
    adapter.currentValue = 42; // a number can never be merged, regardless of the adapter's allow-list
    adapter.mergeableFields = new Set(["description"]);
    const useCase = buildUseCase();

    await expect(
      useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER", conflictResolution: ConflictResolution.Merge }),
    ).rejects.toBeInstanceOf(AiSuggestionMergeNotAllowedError);
  });

  it("MERGE combines current and proposed text, then reports the suggestion as modified", async () => {
    adapter.exists = true;
    adapter.currentValue = "Description déjà présente.";
    adapter.mergeableFields = new Set(["description"]);
    const useCase = buildUseCase();

    await useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER", conflictResolution: ConflictResolution.Merge });

    expect(adapter.applyCalls[0]?.value).toBe("Description déjà présente.\n\nNouvelle description proposée par l'IA.");
    expect(modifyAiSuggestionUseCase.execute).toHaveBeenCalledTimes(1);
    expect(acceptAiSuggestionUseCase.execute).not.toHaveBeenCalled();
  });

  it("calls ModifyAiSuggestionUseCase (not Accept) when the caller supplies an editedValue that differs from the proposal", async () => {
    adapter.exists = false;
    const useCase = buildUseCase();

    await useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER", editedValue: "Texte corrigé par l'utilisateur." });

    expect(adapter.applyCalls[0]?.value).toBe("Texte corrigé par l'utilisateur.");
    expect(modifyAiSuggestionUseCase.execute).toHaveBeenCalledTimes(1);
    expect(acceptAiSuggestionUseCase.execute).not.toHaveBeenCalled();
  });

  // Audit Codex P1-001 — verrou de statut (PENDING <-> APPLYING) autour de l'écriture métier.
  describe("atomicity lock (audit Codex P1-001)", () => {
    it("reserves the suggestion (PENDING -> APPLYING) before writing the target, then finalizes from APPLYING", async () => {
      adapter.exists = false;
      const useCase = buildUseCase();

      await useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER" });

      expect(repository.transitions).toContainEqual({ fromStatus: "PENDING", newStatus: "APPLYING" });
      expect(acceptAiSuggestionUseCase.execute).toHaveBeenCalledWith(expect.objectContaining({ expectedCurrentStatus: "APPLYING" }));
      expect(repository.status).toBe("APPLYING"); // la finalisation réelle passe par le fake Accept, pas par ce repository
    });

    it("refuses to apply (and never writes the target) when the suggestion is no longer PENDING at reservation time", async () => {
      adapter.exists = false;
      repository.status = "ACCEPTED"; // déjà traitée entre-temps (double-clic / requête concurrente)
      const useCase = buildUseCase();

      await expect(useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toBeInstanceOf(
        AiSuggestionAlreadyProcessedError,
      );

      expect(adapter.applyCalls).toHaveLength(0);
      expect(acceptAiSuggestionUseCase.execute).not.toHaveBeenCalled();
      expect(modifyAiSuggestionUseCase.execute).not.toHaveBeenCalled();
    });
  });

  // Audit Codex P1-001 (round 4 — atomicité totale) — réservation, écriture métier et finalisation
  // partagent maintenant UNE SEULE transaction Postgres (voir AtomicTransactionRunner) : plus de
  // "revert" applicatif manuel, le rollback Postgres réel s'en charge. Ici, FakeAtomicTransactionRunner
  // simule ce rollback pour le test unitaire ; la preuve du rollback RÉEL, cross-table (écriture
  // Tenders + statut AiSuggestion), vit dans le test d'intégration PostgreSQL dédié.
  describe("full transactional atomicity (audit Codex P1-001, round 4)", () => {
    it("adapter.applyValue failing after a successful reservation rolls back the whole transaction: no business data persisted, never finalized, suggestion back to PENDING", async () => {
      adapter.exists = false;
      adapter.applyThrows = new Error("Simulated Tenders write failure (test-only)");
      const useCase = buildUseCase();

      await expect(useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toThrow(
        "Simulated Tenders write failure (test-only)",
      );

      // La réservation a bien été tentée (l'adapter a été appelé), mais tout est annulé par le
      // rollback (simulé ici) : la suggestion redevient PENDING, jamais bloquée, jamais finalisée.
      expect(repository.transitions).toEqual([{ fromStatus: "PENDING", newStatus: "APPLYING" }]);
      expect(repository.status).toBe("PENDING");
      expect(acceptAiSuggestionUseCase.execute).not.toHaveBeenCalled();
      expect(modifyAiSuggestionUseCase.execute).not.toHaveBeenCalled();
    });

    it("Accept (finalize) failing AFTER a successful business write rolls back the reservation too: never a suggestion stuck in APPLYING", async () => {
      adapter.exists = false;
      acceptAiSuggestionUseCase.execute = vi.fn(async () => {
        throw new Error("Simulated finalize failure (test-only)");
      });
      const useCase = buildUseCase();

      await expect(useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER" })).rejects.toThrow(
        "Simulated finalize failure (test-only)",
      );

      // L'écriture métier A bien été tentée (contrairement au round 3, où ce scénario laissait la
      // suggestion bloquée en APPLYING) — mais le rollback (simulé ici) l'annule avec la
      // réservation : plus jamais de suggestion coincée en APPLYING après un échec de finalisation.
      expect(adapter.applyCalls).toHaveLength(1);
      expect(repository.status).toBe("PENDING");
    });

    it("Modify (finalize) failing AFTER a successful business write rolls back the reservation too", async () => {
      adapter.exists = false;
      modifyAiSuggestionUseCase.execute = vi.fn(async () => {
        throw new Error("Simulated finalize failure (test-only)");
      });
      const useCase = buildUseCase();

      await expect(
        useCase.execute({ id: SUGGESTION_ID, organizationId: ORG, actorId: "u", actorRole: "BID_MANAGER", editedValue: "Texte corrigé par l'utilisateur." }),
      ).rejects.toThrow("Simulated finalize failure (test-only)");

      expect(adapter.applyCalls).toHaveLength(1);
      expect(repository.status).toBe("PENDING");
    });
  });
});
