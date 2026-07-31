import { beforeEach, describe, expect, it } from "vitest";
import { AiBenchmarkPermissionMissingError, DuplicateAiModelError, ModelKeyNotAllowedError } from "../../domain/errors";
import { FixedClock, InMemoryAiModelRepository, InMemoryAuditLogWriter, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateAiModelUseCase } from "./create-ai-model.use-case";

describe("CreateAiModelUseCase", () => {
  let aiModelRepository: InMemoryAiModelRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let useCase: CreateAiModelUseCase;

  beforeEach(() => {
    aiModelRepository = new InMemoryAiModelRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    useCase = new CreateAiModelUseCase(aiModelRepository, auditLogWriter, new FixedClock(), new SequentialIdGenerator());
  });

  it("registers a model for OWNER and records an audit entry", async () => {
    const result = await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "GPT-4o mini",
    });

    expect(result.provider).toBe("OPENAI");
    expect(result.status).toBe("ENABLED");
    expect(auditLogWriter.entries[0]?.action).toBe("ai_model.created");
  });

  it("refuses a modelKey outside the allowed catalog", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        provider: "OPENAI",
        modelKey: "not-real",
        displayName: "x",
      }),
    ).rejects.toBeInstanceOf(ModelKeyNotAllowedError);
  });

  it("refuses a duplicate (provider, modelKey) pair", async () => {
    await useCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "GPT-4o mini",
    });

    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        provider: "OPENAI",
        modelKey: "gpt-4o-mini",
        displayName: "Duplicate",
      }),
    ).rejects.toBeInstanceOf(DuplicateAiModelError);
  });

  it("refuses a non-admin actor, even one with elevated Analysis rights", async () => {
    await expect(
      useCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "BID_MANAGER",
        provider: "OPENAI",
        modelKey: "gpt-4o-mini",
        displayName: "x",
      }),
    ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
  });
});
