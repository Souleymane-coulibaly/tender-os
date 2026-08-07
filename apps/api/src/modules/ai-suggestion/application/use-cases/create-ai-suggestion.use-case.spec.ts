import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Clock } from "../../../../shared-kernel/clock";
import type { OutboxEventInput, OutboxWriter } from "../../../outbox";
import { AiSuggestionEntityType } from "../../domain/ai-suggestion-entity-type";
import { AiSuggestionInvalidProposedValueError, AiSuggestionSchemaNotRegisteredError } from "../../domain/errors";
import type { AiSuggestionAuditLogEntry, AuditLogWriter } from "../ports/audit-log-writer";
import type { AiSuggestionRecord, AiSuggestionRepository, CreateAiSuggestionInput } from "../ports/ai-suggestion.repository";
import { AiSuggestionFieldSchemaRegistry } from "../services/ai-suggestion-field-schema-registry";
import { CreateAiSuggestionUseCase } from "./create-ai-suggestion.use-case";

class FakeClock implements Clock {
  now(): Date {
    return new Date("2026-08-05T09:00:00.000Z");
  }
}

class FakeAuditLogWriter implements AuditLogWriter {
  readonly entries: AiSuggestionAuditLogEntry[] = [];
  async record(entry: AiSuggestionAuditLogEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class FakeOutboxWriter implements OutboxWriter {
  readonly writes: { organizationId: string; events: OutboxEventInput[] }[] = [];
  async write(input: { organizationId: string; events: OutboxEventInput[] }): Promise<void> {
    this.writes.push(input);
  }
}

class FakeAiSuggestionRepository implements AiSuggestionRepository {
  created: CreateAiSuggestionInput[] = [];

  async create(input: CreateAiSuggestionInput): Promise<AiSuggestionRecord> {
    this.created.push(input);
    return {
      id: input.id,
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      fieldName: input.fieldName,
      parentTenderId: input.parentTenderId,
      parentLotId: input.parentLotId ?? null,
      proposedValue: input.proposedValue,
      confidence: input.confidence,
      sourceDocumentId: input.sourceDocumentId ?? null,
      sourceDocumentVersionId: input.sourceDocumentVersionId ?? null,
      sourcePage: input.sourcePage ?? null,
      sourceChunkReference: input.sourceChunkReference ?? null,
      sourceAnalysisAttemptId: input.sourceAnalysisAttemptId ?? null,
      aiProvider: input.aiProvider ?? null,
      aiModel: input.aiModel ?? null,
      status: "PENDING",
      createdByProcess: input.createdByProcess,
      validatedByUserId: null,
      validatedAt: null,
      rejectedAt: null,
      decisionReason: null,
      conflictResolution: null,
      appliedValue: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
  }

  async findById(): Promise<AiSuggestionRecord | null> {
    return null;
  }

  async list(): Promise<AiSuggestionRecord[]> {
    return [];
  }

  async existsForAnalysisAttempt(): Promise<boolean> {
    return false;
  }

  async transitionFromPending(): Promise<AiSuggestionRecord | null> {
    return null;
  }
}

function baseCommand(overrides: Partial<Parameters<CreateAiSuggestionUseCase["execute"]>[0]> = {}) {
  return {
    organizationId: randomUUID(),
    entityType: AiSuggestionEntityType.TenderLot,
    entityId: randomUUID(),
    fieldName: "title",
    parentTenderId: randomUUID(),
    proposedValue: "Lot 1 — Travaux de gros œuvre",
    confidence: 0.8,
    createdByProcess: "test.suggest-lot-title",
    ...overrides,
  };
}

describe("CreateAiSuggestionUseCase", () => {
  let registry: AiSuggestionFieldSchemaRegistry;
  let auditLogWriter: FakeAuditLogWriter;
  let outboxWriter: FakeOutboxWriter;

  beforeEach(() => {
    registry = new AiSuggestionFieldSchemaRegistry();
    registry.register(AiSuggestionEntityType.TenderLot, "title", z.string().min(1).max(300));
    auditLogWriter = new FakeAuditLogWriter();
    outboxWriter = new FakeOutboxWriter();
  });

  it("persists a suggestion whose proposed value passes the schema registered centrally for (entityType, fieldName)", async () => {
    const repository = new FakeAiSuggestionRepository();
    const useCase = new CreateAiSuggestionUseCase(repository, registry, new FakeClock(), auditLogWriter, outboxWriter);

    const result = await useCase.execute(baseCommand());

    expect(result.status).toBe("PENDING");
    expect(result.proposedValue).toBe("Lot 1 — Travaux de gros œuvre");
    expect(repository.created).toHaveLength(1);
    expect(auditLogWriter.entries[0]?.action).toBe("ai_suggestion.created");
    expect(outboxWriter.writes[0]?.events[0]).toMatchObject({ eventType: "AiSuggestionCreated" });
  });

  it("refuses a proposed value that fails the centrally-registered schema — never persists an unvalidated value", async () => {
    const repository = new FakeAiSuggestionRepository();
    const useCase = new CreateAiSuggestionUseCase(repository, registry, new FakeClock(), auditLogWriter, outboxWriter);

    await expect(useCase.execute(baseCommand({ proposedValue: "" }))).rejects.toThrow(AiSuggestionInvalidProposedValueError);
    expect(repository.created).toHaveLength(0);
  });

  it("mission Sprint 1 correctif audit Codex P1-003 — refuses creation when no schema is registered for (entityType, fieldName)", async () => {
    const repository = new FakeAiSuggestionRepository();
    const useCase = new CreateAiSuggestionUseCase(repository, registry, new FakeClock(), auditLogWriter, outboxWriter);

    await expect(useCase.execute(baseCommand({ fieldName: "never-registered-field" }))).rejects.toThrow(AiSuggestionSchemaNotRegisteredError);
    expect(repository.created).toHaveLength(0);
  });

  it("refuses an entityType outside the closed catalogue", async () => {
    const repository = new FakeAiSuggestionRepository();
    const useCase = new CreateAiSuggestionUseCase(repository, registry, new FakeClock(), auditLogWriter, outboxWriter);

    await expect(useCase.execute(baseCommand({ entityType: "NOT_IN_CATALOGUE" }))).rejects.toThrow(AiSuggestionInvalidProposedValueError);
    expect(repository.created).toHaveLength(0);
  });

  it("refuses a confidence outside [0, 1]", async () => {
    const repository = new FakeAiSuggestionRepository();
    const useCase = new CreateAiSuggestionUseCase(repository, registry, new FakeClock(), auditLogWriter, outboxWriter);

    await expect(useCase.execute(baseCommand({ confidence: 1.5 }))).rejects.toThrow(AiSuggestionInvalidProposedValueError);
    expect(repository.created).toHaveLength(0);
  });
});
