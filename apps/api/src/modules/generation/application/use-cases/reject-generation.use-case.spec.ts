import { beforeEach, describe, expect, it } from "vitest";
import { RejectGenerationUseCase } from "./reject-generation.use-case";
import { ValidateGenerationUseCase } from "./validate-generation.use-case";
import { ClientAssignment } from "../../../client-portfolio/domain/client-assignment.entity";
import { ClientRole } from "../../../client-portfolio/domain/client-role";
import { GenerationStatus } from "../../domain/generation-status";
import { Generation } from "../../domain/generation.aggregate";
import { GenerationTaskType } from "../../domain/generation-task-type";
import { FixedClock, InMemoryGenerationRepository, buildAssertClientAccessUseCase } from "../../test-support/fakes";

const ORG = "org-1";
const OTHER_ORG = "org-2";
const CLIENT_A = "client-a";
const CLIENT_B = "client-b";
const NOW = new Date("2026-08-01T10:00:00.000Z");

/**
 * Réaudit Codex P1 — "le rejet d'une génération est absent". Couvre la matrice de rôles complète
 * exigée par le prompt de correction : OWNER/ADMIN/MEMBER affecté/MEMBER non affecté/VIEWER, autre
 * tenant, autre client, statuts FAILED/GENERATED/VALIDATED, et le caractère non destructif du rejet
 * (jamais de réécriture du contenu IA ni des autres versions).
 */
function buildHarness() {
  const clock = new FixedClock(NOW);
  const generationRepository = new InMemoryGenerationRepository();
  const { assertClientAccessUseCase, clientAssignmentRepository } = buildAssertClientAccessUseCase();

  const reject = new RejectGenerationUseCase(generationRepository, assertClientAccessUseCase, clock);
  const validate = new ValidateGenerationUseCase(generationRepository, assertClientAccessUseCase, clock);

  return { reject, validate, generationRepository, clientAssignmentRepository };
}

async function assign(
  h: ReturnType<typeof buildHarness>,
  input: { organizationId?: string; clientAccountId: string; userId: string; role: string },
): Promise<void> {
  await h.clientAssignmentRepository.create(
    ClientAssignment.create({
      id: `assignment-${input.userId}-${input.clientAccountId}`,
      organizationId: input.organizationId ?? ORG,
      clientAccountId: input.clientAccountId,
      userId: input.userId,
      role: input.role as never,
      createdBy: "user-owner",
      occurredAt: NOW,
    }),
  );
}

async function seedGeneratedGeneration(
  h: ReturnType<typeof buildHarness>,
  input: { id: string; rootGenerationId?: string; clientAccountId?: string; createdBy: string },
): Promise<Generation> {
  const generation = Generation.create({
    id: input.id,
    organizationId: ORG,
    clientAccountId: input.clientAccountId ?? CLIENT_A,
    tenderId: "tender-1",
    taskType: GenerationTaskType.ExecutiveSummary,
    rootGenerationId: input.rootGenerationId ?? input.id,
    version: 1,
    promptTemplateId: "template-1",
    promptVersionId: "version-1",
    promptVersionNumber: 1,
    createdBy: input.createdBy,
    occurredAt: NOW,
  });
  generation.reserve();
  generation.markGenerated(
    { modelProvider: "OPENAI", modelKey: "gpt-4o-mini", fallbackLevel: 0, generatedContent: "Contenu IA", latencyMs: 1 },
    NOW,
  );
  await h.generationRepository.create(generation);
  return generation;
}

describe("RejectGenerationUseCase", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
  });

  it("OWNER can reject any generation for the client, recording author/date/reason", async () => {
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-contrib" });

    const result = await h.reject.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      generationId: generation.id,
      reason: "Ton trop informel",
    });

    expect(result.status).toBe(GenerationStatus.Generated);
    expect(result.rejectedBy).toBe("user-owner");
    expect(result.rejectedAt).toBeDefined();
    expect(result.rejectionReason).toBe("Ton trop informel");
  });

  it("ORGANIZATION_ADMIN can reject any generation for the client, without needing a client assignment", async () => {
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-contrib" });

    const result = await h.reject.execute({
      organizationId: ORG,
      actorId: "user-admin",
      actorRole: "ORGANIZATION_ADMIN",
      generationId: generation.id,
    });

    expect(result.rejectedBy).toBe("user-admin");
  });

  it("a MEMBER affecté (client-assigned CONTRIBUTOR) can reject their OWN generation", async () => {
    await assign(h, { clientAccountId: CLIENT_A, userId: "user-contrib", role: ClientRole.Contributor });
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-contrib" });

    const result = await h.reject.execute({
      organizationId: ORG,
      actorId: "user-contrib",
      actorRole: "CONTRIBUTOR",
      generationId: generation.id,
    });

    expect(result.rejectedBy).toBe("user-contrib");
  });

  it("a MEMBER affecté (client-assigned CONTRIBUTOR) CANNOT reject a colleague's generation", async () => {
    await assign(h, { clientAccountId: CLIENT_A, userId: "user-contrib", role: ClientRole.Contributor });
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-owner" });

    await expect(
      h.reject.execute({ organizationId: ORG, actorId: "user-contrib", actorRole: "CONTRIBUTOR", generationId: generation.id }),
    ).rejects.toMatchObject({ code: "GENERATION_NOT_OWNED_BY_ACTOR" });
  });

  it("a MEMBER non affecté (no client assignment at all) CANNOT reject, even their own generation (404-never-403)", async () => {
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-unassigned" });

    await expect(
      h.reject.execute({ organizationId: ORG, actorId: "user-unassigned", actorRole: "CONTRIBUTOR", generationId: generation.id }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });

  it("a VIEWER-tier client assignment CANNOT reject (read-only)", async () => {
    await assign(h, { clientAccountId: CLIENT_A, userId: "user-viewer", role: ClientRole.Viewer });
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-viewer" });

    await expect(
      h.reject.execute({ organizationId: ORG, actorId: "user-viewer", actorRole: "CONTRIBUTOR", generationId: generation.id }),
    ).rejects.toMatchObject({ code: "CLIENT_PERMISSION_MISSING" });
  });

  it("un autre TENANT ne peut jamais rejeter une génération (introuvable, jamais un 403 qui révélerait son existence)", async () => {
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-owner" });

    await expect(
      h.reject.execute({ organizationId: OTHER_ORG, actorId: "user-owner-other-org", actorRole: "OWNER", generationId: generation.id }),
    ).rejects.toMatchObject({ code: "GENERATION_NOT_FOUND" });
  });

  it("un autre CLIENT (même organisation, affecté à un client différent) ne peut pas rejeter", async () => {
    await assign(h, { clientAccountId: CLIENT_B, userId: "user-other-client", role: ClientRole.ClientManager });
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", clientAccountId: CLIENT_A, createdBy: "user-other-client" });

    await expect(
      h.reject.execute({ organizationId: ORG, actorId: "user-other-client", actorRole: "CONTRIBUTOR", generationId: generation.id }),
    ).rejects.toMatchObject({ code: "CLIENT_ACCOUNT_NOT_FOUND" });
  });

  it("statuts incompatibles — une génération FAILED ne peut pas être rejetée", async () => {
    const generation = Generation.create({
      id: "gen-failed",
      organizationId: ORG,
      clientAccountId: CLIENT_A,
      tenderId: "tender-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      rootGenerationId: "gen-failed",
      version: 1,
      promptTemplateId: "template-1",
      promptVersionId: "version-1",
      promptVersionNumber: 1,
      createdBy: "user-owner",
      occurredAt: NOW,
    });
    generation.reserve();
    generation.markFailed({ errorCode: "X", errorMessage: "boom" }, NOW);
    await h.generationRepository.create(generation);

    await expect(
      h.reject.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: generation.id }),
    ).rejects.toMatchObject({ code: "GENERATION_NOT_REJECTABLE" });
  });

  it("statuts incompatibles — une génération déjà VALIDÉE ne peut plus être rejetée, et vice versa", async () => {
    const validated = await seedGeneratedGeneration(h, { id: "gen-validated", createdBy: "user-owner" });
    await h.validate.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: validated.id });
    await expect(
      h.reject.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: validated.id }),
    ).rejects.toMatchObject({ code: "GENERATION_ALREADY_VALIDATED" });

    const rejected = await seedGeneratedGeneration(h, { id: "gen-rejected", createdBy: "user-owner" });
    await h.reject.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: rejected.id });
    await expect(
      h.validate.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: rejected.id }),
    ).rejects.toMatchObject({ code: "GENERATION_ALREADY_REJECTED" });
  });

  it("historique non destructif — rejeter une version ne modifie jamais son contenu IA/édité, ni une autre version du même fil", async () => {
    const v1 = await seedGeneratedGeneration(h, { id: "gen-v1", createdBy: "user-owner" });
    const v2 = Generation.create({
      id: "gen-v2",
      organizationId: ORG,
      clientAccountId: CLIENT_A,
      tenderId: "tender-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      parentGenerationId: v1.id,
      rootGenerationId: v1.rootGenerationId,
      version: 2,
      promptTemplateId: "template-1",
      promptVersionId: "version-1",
      promptVersionNumber: 1,
      createdBy: "user-owner",
      occurredAt: NOW,
    });
    v2.reserve();
    v2.markGenerated({ modelProvider: "OPENAI", modelKey: "gpt-4o-mini", fallbackLevel: 0, generatedContent: "Contenu IA v2", latencyMs: 1 }, NOW);
    await h.generationRepository.create(v2);

    await h.reject.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: v1.id, reason: "v1 obsolète" });

    const rerereadV1 = await h.generationRepository.findById({ organizationId: ORG, generationId: v1.id });
    expect(rerereadV1!.generatedContent).toBe("Contenu IA");
    expect(rerereadV1!.rejectedBy).toBe("user-owner");

    const rereadV2 = await h.generationRepository.findById({ organizationId: ORG, generationId: v2.id });
    expect(rereadV2!.generatedContent).toBe("Contenu IA v2");
    expect(rereadV2!.rejectedBy).toBeUndefined();
    expect(rereadV2!.status).toBe(GenerationStatus.Generated);
  });

  it("le rejet est traçable : l'acteur, la date et la raison sont conservés", async () => {
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-owner" });

    const result = await h.reject.execute({
      organizationId: ORG,
      actorId: "user-owner",
      actorRole: "OWNER",
      generationId: generation.id,
      reason: "Ne répond pas au critère demandé",
    });

    expect(result.rejectedBy).toBe("user-owner");
    expect(new Date(result.rejectedAt!)).toEqual(NOW);
    expect(result.rejectionReason).toBe("Ne répond pas au critère demandé");
  });

  it("la raison de rejet est optionnelle", async () => {
    const generation = await seedGeneratedGeneration(h, { id: "gen-1", createdBy: "user-owner" });

    const result = await h.reject.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: generation.id });

    expect(result.rejectedBy).toBe("user-owner");
    expect(result.rejectionReason).toBeUndefined();
  });

  it("throws GENERATION_NOT_FOUND for an unknown generationId", async () => {
    await expect(
      h.reject.execute({ organizationId: ORG, actorId: "user-owner", actorRole: "OWNER", generationId: "does-not-exist" }),
    ).rejects.toMatchObject({ code: "GENERATION_NOT_FOUND" });
  });
});
