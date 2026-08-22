import { beforeEach, describe, expect, it } from "vitest";
import { AiRoutingModel } from "../../domain/ai-routing-model";
import { InMemoryAiModelPreferenceRepository } from "../../test-support/fakes";
import { ResetAiModelPreferenceUseCase } from "./reset-ai-model-preference.use-case";

const ORG_ID = "org-1";
const USER_ID = "user-1";

describe("ResetAiModelPreferenceUseCase — mission §10", () => {
  let repository: InMemoryAiModelPreferenceRepository;
  let useCase: ResetAiModelPreferenceUseCase;

  beforeEach(() => {
    repository = new InMemoryAiModelPreferenceRepository();
    useCase = new ResetAiModelPreferenceUseCase(repository);
  });

  it("BLOQUANT — mission §35: deletes the row, never writes an 'AUTO' value", async () => {
    await repository.set({ id: "p1", userId: USER_ID, organizationId: ORG_ID, taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "SECTION_SUMMARY" });

    expect(repository.preferences).toHaveLength(0);
  });

  it("is idempotent — resetting a task already in AUTOMATIC does nothing observable", async () => {
    await useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "SECTION_SUMMARY" });
    await expect(useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "SECTION_SUMMARY" })).resolves.toBeUndefined();
  });

  it("rejects an unknown task type", async () => {
    await expect(useCase.execute({ organizationId: ORG_ID, actorId: USER_ID, actorRole: "CONTRIBUTOR", taskType: "NOT_A_REAL_TASK" })).rejects.toThrow();
  });
});
