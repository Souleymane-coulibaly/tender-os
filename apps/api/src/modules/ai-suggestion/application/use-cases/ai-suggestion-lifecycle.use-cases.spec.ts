import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Clock } from "../../../../shared-kernel/clock";
import { AiSuggestionEntityType } from "../../domain/ai-suggestion-entity-type";
import { AiSuggestionAlreadyProcessedError, AiSuggestionNotFoundError, AiSuggestionPermissionDeniedError } from "../../domain/errors";
import type { AiSuggestionTargetAccessPolicy } from "../ports/ai-suggestion-target-access-policy";
import type { AiSuggestionRecord, AiSuggestionRepository } from "../ports/ai-suggestion.repository";
import { AiSuggestionFieldSchemaRegistry } from "../services/ai-suggestion-field-schema-registry";
import { AcceptAiSuggestionUseCase } from "./accept-ai-suggestion.use-case";
import { ModifyAiSuggestionUseCase } from "./modify-ai-suggestion.use-case";
import { RejectAiSuggestionUseCase } from "./reject-ai-suggestion.use-case";

class FakeClock implements Clock {
  now(): Date {
    return new Date("2026-08-05T09:00:00.000Z");
  }
}

/** Même comportement par défaut que `NoopAiSuggestionTargetAccessPolicy` (infrastructure) —
 *  aucune restriction au-delà d'organisation+rôle, cohérent avec le câblage Sprint 1 réel. */
class AllowAllTargetAccessPolicy implements AiSuggestionTargetAccessPolicy {
  async assertCanAccessTarget(): Promise<void> {
    return Promise.resolve();
  }
}

/** Reproduit fidèlement la garde atomique `status = PENDING` du repository Prisma réel — un
 *  deuxième appel concurrent sur une suggestion déjà traitée doit retourner `null`, jamais lever
 *  une exception au niveau repository (c'est le use case qui traduit en erreur métier). */
class FakeAiSuggestionRepository implements AiSuggestionRepository {
  private store = new Map<string, AiSuggestionRecord>();

  seed(record: AiSuggestionRecord): void {
    this.store.set(record.id, record);
  }

  async create(): Promise<AiSuggestionRecord> {
    throw new Error("not used in this spec");
  }

  async findById(input: { id: string; organizationId: string }): Promise<AiSuggestionRecord | null> {
    const record = this.store.get(input.id);
    return record && record.organizationId === input.organizationId ? record : null;
  }

  async list(): Promise<AiSuggestionRecord[]> {
    return [...this.store.values()];
  }

  async transitionFromPending(input: {
    id: string;
    organizationId: string;
    newStatus: string;
    validatedByUserId?: string | undefined;
    validatedAt?: Date | undefined;
    rejectedAt?: Date | undefined;
    decisionReason?: string | undefined;
    appliedValue?: unknown;
    updatedAt: Date;
  }): Promise<AiSuggestionRecord | null> {
    const record = this.store.get(input.id);
    if (!record || record.organizationId !== input.organizationId || record.status !== "PENDING") {
      return null;
    }
    const updated: AiSuggestionRecord = {
      ...record,
      status: input.newStatus,
      validatedByUserId: input.validatedByUserId ?? null,
      validatedAt: input.validatedAt ?? null,
      rejectedAt: input.rejectedAt ?? null,
      decisionReason: input.decisionReason ?? null,
      appliedValue: input.appliedValue !== undefined ? input.appliedValue : record.appliedValue,
      updatedAt: input.updatedAt,
    };
    this.store.set(input.id, updated);
    return updated;
  }
}

function pendingSuggestion(overrides: Partial<AiSuggestionRecord> = {}): AiSuggestionRecord {
  return {
    id: randomUUID(),
    organizationId: randomUUID(),
    entityType: AiSuggestionEntityType.TenderLot,
    entityId: randomUUID(),
    fieldName: "title",
    proposedValue: "Lot 1",
    confidence: 0.9,
    sourceDocumentId: null,
    sourceDocumentVersionId: null,
    sourcePage: null,
    sourceChunkReference: null,
    sourceAnalysisAttemptId: null,
    aiProvider: null,
    aiModel: null,
    status: "PENDING",
    createdByProcess: "test.suggest",
    validatedByUserId: null,
    validatedAt: null,
    rejectedAt: null,
    decisionReason: null,
    appliedValue: null,
    createdAt: new Date("2026-08-05T08:00:00.000Z"),
    updatedAt: new Date("2026-08-05T08:00:00.000Z"),
    ...overrides,
  };
}

describe("AiSuggestion lifecycle use cases", () => {
  let repository: FakeAiSuggestionRepository;
  const clock = new FakeClock();
  const targetAccessPolicy = new AllowAllTargetAccessPolicy();
  const schemaRegistry = new AiSuggestionFieldSchemaRegistry();
  schemaRegistry.register(AiSuggestionEntityType.TenderLot, "title", z.string().min(1).max(300));

  beforeEach(() => {
    repository = new FakeAiSuggestionRepository();
  });

  describe("AcceptAiSuggestionUseCase", () => {
    it("accepts a pending suggestion and applies the proposed value verbatim", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new AcceptAiSuggestionUseCase(repository, targetAccessPolicy, clock);

      const result = await useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorUserId: randomUUID(), actorRole: "BID_MANAGER" });

      expect(result.status).toBe("ACCEPTED");
      expect(result.appliedValue).toBe("Lot 1");
      expect(result.validatedAt).toBeDefined();
    });

    it("refuses to accept a suggestion already processed by someone else (race-safe)", async () => {
      const suggestion = pendingSuggestion({ status: "REJECTED" });
      repository.seed(suggestion);
      const useCase = new AcceptAiSuggestionUseCase(repository, targetAccessPolicy, clock);

      await expect(useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorUserId: randomUUID(), actorRole: "BID_MANAGER" })).rejects.toThrow(
        AiSuggestionAlreadyProcessedError,
      );
    });

    it("denies a READ_ONLY role", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new AcceptAiSuggestionUseCase(repository, targetAccessPolicy, clock);

      await expect(useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorUserId: randomUUID(), actorRole: "READ_ONLY" })).rejects.toThrow(
        AiSuggestionPermissionDeniedError,
      );
    });

    it("returns not-found for a suggestion belonging to another organization (anti-IDOR)", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new AcceptAiSuggestionUseCase(repository, targetAccessPolicy, clock);

      await expect(useCase.execute({ id: suggestion.id, organizationId: randomUUID(), actorUserId: randomUUID(), actorRole: "BID_MANAGER" })).rejects.toThrow(AiSuggestionNotFoundError);
    });
  });

  describe("ModifyAiSuggestionUseCase", () => {
    it("modifies a pending suggestion, keeping the original proposedValue but recording a different appliedValue", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new ModifyAiSuggestionUseCase(repository, targetAccessPolicy, schemaRegistry, clock);

      const result = await useCase.execute({
        id: suggestion.id,
        organizationId: suggestion.organizationId,
        actorUserId: randomUUID(),
        actorRole: "CONTRIBUTOR",
        editedValue: "Lot 1 — libellé corrigé",
        reason: "Nom réel du lot dans le règlement de consultation",
      });

      expect(result.status).toBe("MODIFIED");
      expect(result.appliedValue).toBe("Lot 1 — libellé corrigé");
      expect(result.proposedValue).toBe("Lot 1");
      expect(result.decisionReason).toBe("Nom réel du lot dans le règlement de consultation");
    });

    it("mission Sprint 1 correctif audit Codex P1-004 — refuses an editedValue that fails the centrally-registered schema", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new ModifyAiSuggestionUseCase(repository, targetAccessPolicy, schemaRegistry, clock);

      await expect(
        useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorUserId: randomUUID(), actorRole: "CONTRIBUTOR", editedValue: "" }),
      ).rejects.toThrow();

      const stillPending = await repository.findById({ id: suggestion.id, organizationId: suggestion.organizationId });
      expect(stillPending?.status).toBe("PENDING");
    });
  });

  describe("correctif audit Codex P1-005 — vérification d'accès à l'entité cible", () => {
    class DenyAllTargetAccessPolicy implements AiSuggestionTargetAccessPolicy {
      async assertCanAccessTarget(): Promise<void> {
        throw new Error("target not accessible to this actor");
      }
    }

    it("AcceptAiSuggestionUseCase refuses when the target access policy denies access", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new AcceptAiSuggestionUseCase(repository, new DenyAllTargetAccessPolicy(), clock);

      await expect(useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorUserId: randomUUID(), actorRole: "BID_MANAGER" })).rejects.toThrow();
    });

    it("GetAiSuggestionUseCase refuses when the target access policy denies access", async () => {
      const { GetAiSuggestionUseCase } = await import("./get-ai-suggestion.use-case");
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new GetAiSuggestionUseCase(repository, new DenyAllTargetAccessPolicy());

      await expect(useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorId: randomUUID(), actorRole: "BID_MANAGER" })).rejects.toThrow();
    });

    it("ListAiSuggestionsUseCase silently excludes a suggestion whose target is denied, rather than failing the whole list", async () => {
      const { ListAiSuggestionsUseCase } = await import("./list-ai-suggestions.use-case");
      const accessible = pendingSuggestion();
      const denied = pendingSuggestion();
      repository.seed(accessible);
      repository.seed(denied);

      class SelectiveTargetAccessPolicy implements AiSuggestionTargetAccessPolicy {
        async assertCanAccessTarget(input: { entityId: string }): Promise<void> {
          if (input.entityId === denied.entityId) {
            throw new Error("target not accessible to this actor");
          }
        }
      }

      const useCase = new ListAiSuggestionsUseCase(repository, new SelectiveTargetAccessPolicy());
      const result = await useCase.execute({ organizationId: accessible.organizationId, actorId: randomUUID(), actorRole: "BID_MANAGER" });

      expect(result.map((r) => r.id)).toEqual([accessible.id]);
    });
  });

  describe("RejectAiSuggestionUseCase", () => {
    it("rejects a pending suggestion and keeps the row for audit (no deletion)", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new RejectAiSuggestionUseCase(repository, targetAccessPolicy, clock);

      const result = await useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorUserId: randomUUID(), actorRole: "OWNER", reason: "Hors périmètre du lot" });

      expect(result.status).toBe("REJECTED");
      expect(result.rejectedAt).toBeDefined();
      expect(result.decisionReason).toBe("Hors périmètre du lot");
      expect(await repository.findById({ id: suggestion.id, organizationId: suggestion.organizationId })).not.toBeNull();
    });

    it("denies an EXTERNAL_CONSULTANT role", async () => {
      const suggestion = pendingSuggestion();
      repository.seed(suggestion);
      const useCase = new RejectAiSuggestionUseCase(repository, targetAccessPolicy, clock);

      await expect(
        useCase.execute({ id: suggestion.id, organizationId: suggestion.organizationId, actorUserId: randomUUID(), actorRole: "EXTERNAL_CONSULTANT" }),
      ).rejects.toThrow(AiSuggestionPermissionDeniedError);
    });
  });
});
