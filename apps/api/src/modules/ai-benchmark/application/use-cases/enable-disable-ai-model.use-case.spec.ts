import { beforeEach, describe, expect, it } from "vitest";
import { AiBenchmarkPermissionMissingError, AiModelNotFoundError } from "../../domain/errors";
import { FixedClock, InMemoryAiModelRepository, InMemoryAuditLogWriter, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateAiModelUseCase } from "./create-ai-model.use-case";
import { DisableAiModelUseCase } from "./disable-ai-model.use-case";
import { EnableAiModelUseCase } from "./enable-ai-model.use-case";

describe("EnableAiModelUseCase / DisableAiModelUseCase", () => {
  let aiModelRepository: InMemoryAiModelRepository;
  let auditLogWriter: InMemoryAuditLogWriter;
  let createUseCase: CreateAiModelUseCase;
  let enableUseCase: EnableAiModelUseCase;
  let disableUseCase: DisableAiModelUseCase;
  let modelId: string;

  beforeEach(async () => {
    aiModelRepository = new InMemoryAiModelRepository();
    auditLogWriter = new InMemoryAuditLogWriter();
    createUseCase = new CreateAiModelUseCase(aiModelRepository, auditLogWriter, new FixedClock(), new SequentialIdGenerator());
    enableUseCase = new EnableAiModelUseCase(aiModelRepository, auditLogWriter, new FixedClock());
    disableUseCase = new DisableAiModelUseCase(aiModelRepository, auditLogWriter, new FixedClock());

    const created = await createUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "GPT-4o mini",
    });
    modelId = created.id;
  });

  it("disables then re-enables a model", async () => {
    const disabled = await disableUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", modelId });
    expect(disabled.status).toBe("DISABLED");

    const enabled = await enableUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", modelId });
    expect(enabled.status).toBe("ENABLED");
  });

  it("throws AiModelNotFoundError for an unknown model id", async () => {
    await expect(
      disableUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "OWNER", modelId: "unknown" }),
    ).rejects.toBeInstanceOf(AiModelNotFoundError);
  });

  it("refuses a non-admin actor", async () => {
    await expect(
      disableUseCase.execute({ organizationId: "org-1", actorId: "user-1", actorRole: "READ_ONLY", modelId }),
    ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
  });
});
