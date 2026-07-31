import { beforeEach, describe, expect, it } from "vitest";
import { AiBenchmarkPermissionMissingError, AiModelNotFoundError } from "../../domain/errors";
import { FixedClock, InMemoryAiModelRepository, InMemoryAuditLogWriter, SequentialIdGenerator } from "../../test-support/fakes";
import { CreateAiModelUseCase } from "./create-ai-model.use-case";
import { GetAiModelUseCase } from "./get-ai-model.use-case";
import { ListAiModelsUseCase } from "./list-ai-models.use-case";

describe("ListAiModelsUseCase / GetAiModelUseCase", () => {
  let aiModelRepository: InMemoryAiModelRepository;
  let createUseCase: CreateAiModelUseCase;
  let listUseCase: ListAiModelsUseCase;
  let getUseCase: GetAiModelUseCase;

  beforeEach(async () => {
    aiModelRepository = new InMemoryAiModelRepository();
    createUseCase = new CreateAiModelUseCase(aiModelRepository, new InMemoryAuditLogWriter(), new FixedClock(), new SequentialIdGenerator());
    listUseCase = new ListAiModelsUseCase(aiModelRepository);
    getUseCase = new GetAiModelUseCase(aiModelRepository);

    await createUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "GPT-4o mini",
      enabledForBenchmark: true,
    });
    await createUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      provider: "OPENAI",
      modelKey: "gpt-4o",
      displayName: "GPT-4o",
      enabledForBenchmark: false,
      enabledForProduction: true,
    });
  });

  it("lists every registered model for a read-only role, filterable by enabledForBenchmark", async () => {
    const all = await listUseCase.execute({ actorRole: "READ_ONLY" });
    expect(all).toHaveLength(2);

    const benchmarkOnly = await listUseCase.execute({ actorRole: "READ_ONLY", enabledForBenchmark: true });
    expect(benchmarkOnly).toHaveLength(1);
    expect(benchmarkOnly[0]?.modelKey).toBe("gpt-4o-mini");
  });

  it("gets a single model by id", async () => {
    const [model] = await listUseCase.execute({ actorRole: "READ_ONLY" });
    const result = await getUseCase.execute({ actorRole: "READ_ONLY", modelId: model!.id });
    expect(result.id).toBe(model!.id);
  });

  it("throws AiModelNotFoundError for an unknown id", async () => {
    await expect(getUseCase.execute({ actorRole: "READ_ONLY", modelId: "unknown" })).rejects.toBeInstanceOf(AiModelNotFoundError);
  });

  it("read access requires at least ReadModels — an unknown role has none", async () => {
    await expect(listUseCase.execute({ actorRole: "SOME_UNKNOWN_ROLE" })).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
  });
});
