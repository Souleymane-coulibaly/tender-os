import { beforeEach, describe, expect, it } from "vitest";
import { CompareGenerationVersionsUseCase } from "./compare-generation-versions.use-case";
import { GetGenerationUseCase } from "./get-generation.use-case";
import { ListGenerationVersionsUseCase } from "./list-generation-versions.use-case";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { Generation } from "../../domain/generation.aggregate";
import { GenerationTaskType } from "../../domain/generation-task-type";
import { InMemoryGenerationRepository, buildAssertClientAccessUseCase } from "../../test-support/fakes";

const ORG = "org-1";
const CLIENT = "client-1";
const NOW = new Date("2026-08-01T10:00:00.000Z");

function buildHarness() {
  const generationRepository = new InMemoryGenerationRepository();
  const { assertClientAccessUseCase, clientAssignmentRepository } = buildAssertClientAccessUseCase();
  clientAssignmentRepository.create(
    ClientAssignment.create({
      id: "assignment-1",
      organizationId: ORG,
      clientAccountId: CLIENT,
      userId: "user-contrib",
      role: ClientRole.Contributor,
      createdBy: "user-owner",
      occurredAt: NOW,
    }),
  );
  return {
    generationRepository,
    getGeneration: new GetGenerationUseCase(generationRepository, assertClientAccessUseCase),
    listVersions: new ListGenerationVersionsUseCase(generationRepository, assertClientAccessUseCase),
    compare: new CompareGenerationVersionsUseCase(generationRepository, assertClientAccessUseCase),
  };
}

function makeGeneration(overrides: { id: string; rootGenerationId: string; version: number; parentGenerationId?: string }): Generation {
  return Generation.create({
    id: overrides.id,
    organizationId: ORG,
    clientAccountId: "client-1",
    tenderId: "tender-1",
    taskType: GenerationTaskType.ExecutiveSummary,
    parentGenerationId: overrides.parentGenerationId,
    rootGenerationId: overrides.rootGenerationId,
    version: overrides.version,
    promptTemplateId: "template-1",
    promptVersionId: "version-1",
    promptVersionNumber: 1,
    createdBy: "user-owner",
    occurredAt: NOW,
  });
}

describe("Generation queries (get/list-versions/compare)", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(async () => {
    h = buildHarness();
    await h.generationRepository.create(makeGeneration({ id: "gen-1", rootGenerationId: "gen-1", version: 1 }));
    await h.generationRepository.create(makeGeneration({ id: "gen-2", rootGenerationId: "gen-1", version: 2, parentGenerationId: "gen-1" }));
  });

  it("hides cost/token fields from a non-org-tier actor, shows them to OWNER", async () => {
    const generation = await h.generationRepository.findById({ organizationId: ORG, generationId: "gen-1" });
    generation!.reserve();
    generation!.markGenerated(
      {
        modelProvider: "OPENAI",
        modelKey: "gpt-4o-mini",
        fallbackLevel: 0,
        generatedContent: "x",
        inputTokenCount: 42,
        estimatedCostAmount: "0.001234",
        currency: "USD",
        latencyMs: 1,
      },
      NOW,
    );
    await h.generationRepository.save(generation!);

    const asOwner = await h.getGeneration.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: "gen-1" });
    const asContributor = await h.getGeneration.execute({
      organizationId: ORG,
      actorId: "user-contrib",
      actorRole: "CONTRIBUTOR",
      generationId: "gen-1",
    });
    expect(asOwner.estimatedCostAmount).toBe("0.001234");
    expect(asOwner.inputTokenCount).toBe(42);
    expect(asContributor.estimatedCostAmount).toBeUndefined();
    expect(asContributor.inputTokenCount).toBeUndefined();
  });

  it("lists all versions of a thread regardless of which version id was queried", async () => {
    const versions = await h.listVersions.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: "gen-2" });
    expect(versions.map((v) => v.id).sort()).toEqual(["gen-1", "gen-2"]);
  });

  it("compares two versions of the same thread", async () => {
    const result = await h.compare.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      fromGenerationId: "gen-1",
      toGenerationId: "gen-2",
    });
    expect(result.from.id).toBe("gen-1");
    expect(result.to.id).toBe("gen-2");
  });

  it("refuses to compare two generations from different threads", async () => {
    await h.generationRepository.create(makeGeneration({ id: "gen-other", rootGenerationId: "gen-other", version: 1 }));
    await expect(
      h.compare.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", fromGenerationId: "gen-1", toGenerationId: "gen-other" }),
    ).rejects.toThrow();
  });
});
