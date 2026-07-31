import { beforeEach, describe, expect, it } from "vitest";
import { AiBenchmarkPermissionMissingError, AiModelNotFoundError } from "../../domain/errors";
import {
  FixedClock,
  InMemoryAiModelRepository,
  InMemoryAuditLogWriter,
  InMemoryPricingSnapshotRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { AddPricingSnapshotUseCase } from "./add-pricing-snapshot.use-case";
import { CreateAiModelUseCase } from "./create-ai-model.use-case";
import { ListPricingSnapshotsUseCase } from "./list-pricing-snapshots.use-case";

describe("AddPricingSnapshotUseCase / ListPricingSnapshotsUseCase", () => {
  let aiModelRepository: InMemoryAiModelRepository;
  let pricingSnapshotRepository: InMemoryPricingSnapshotRepository;
  let clock: FixedClock;
  let createModelUseCase: CreateAiModelUseCase;
  let addPricingUseCase: AddPricingSnapshotUseCase;
  let listPricingUseCase: ListPricingSnapshotsUseCase;
  let modelId: string;

  beforeEach(async () => {
    aiModelRepository = new InMemoryAiModelRepository();
    pricingSnapshotRepository = new InMemoryPricingSnapshotRepository();
    clock = new FixedClock();
    createModelUseCase = new CreateAiModelUseCase(aiModelRepository, new InMemoryAuditLogWriter(), clock, new SequentialIdGenerator());
    addPricingUseCase = new AddPricingSnapshotUseCase(
      aiModelRepository,
      pricingSnapshotRepository,
      new InMemoryAuditLogWriter(),
      clock,
      new SequentialIdGenerator(),
    );
    listPricingUseCase = new ListPricingSnapshotsUseCase(aiModelRepository, pricingSnapshotRepository);

    const model = await createModelUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      provider: "OPENAI",
      modelKey: "gpt-4o-mini",
      displayName: "GPT-4o mini",
    });
    modelId = model.id;
  });

  it("adds a first pricing snapshot, current by default", async () => {
    const snapshot = await addPricingUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      modelId,
      inputPricePerMillionTokens: "5",
      outputPricePerMillionTokens: "15",
      currency: "USD",
    });

    expect(snapshot.effectiveTo).toBeUndefined();
  });

  it("a second snapshot closes the first, never rewriting its historical price (mission — pas de réécriture rétroactive)", async () => {
    await addPricingUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      modelId,
      inputPricePerMillionTokens: "5",
      outputPricePerMillionTokens: "15",
      currency: "USD",
    });

    clock.advance(60_000);

    await addPricingUseCase.execute({
      organizationId: "org-1",
      actorId: "user-1",
      actorRole: "OWNER",
      modelId,
      inputPricePerMillionTokens: "4",
      outputPricePerMillionTokens: "12",
      currency: "USD",
    });

    const history = await listPricingUseCase.execute({ actorRole: "OWNER", modelId });
    expect(history).toHaveLength(2);

    const closed = history.find((s) => s.inputPricePerMillionTokens === "5")!;
    const current = history.find((s) => s.inputPricePerMillionTokens === "4")!;
    expect(closed.effectiveTo).toBeDefined();
    expect(current.effectiveTo).toBeUndefined();
  });

  it("throws AiModelNotFoundError for an unknown model id", async () => {
    await expect(
      addPricingUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "OWNER",
        modelId: "unknown",
        inputPricePerMillionTokens: "5",
        outputPricePerMillionTokens: "15",
        currency: "USD",
      }),
    ).rejects.toBeInstanceOf(AiModelNotFoundError);
  });

  it("refuses a non-admin actor", async () => {
    await expect(
      addPricingUseCase.execute({
        organizationId: "org-1",
        actorId: "user-1",
        actorRole: "CONTRIBUTOR",
        modelId,
        inputPricePerMillionTokens: "5",
        outputPricePerMillionTokens: "15",
        currency: "USD",
      }),
    ).rejects.toBeInstanceOf(AiBenchmarkPermissionMissingError);
  });
});
