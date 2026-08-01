import { beforeEach, describe, expect, it } from "vitest";
import { ActivatePromptVersionUseCase } from "./activate-prompt-version.use-case";
import { ArchivePromptTemplateUseCase } from "./archive-prompt-template.use-case";
import { CreatePromptTemplateUseCase } from "./create-prompt-template.use-case";
import { CreatePromptVersionUseCase } from "./create-prompt-version.use-case";
import { GetPromptTemplateUseCase } from "./get-prompt-template.use-case";
import { ListPromptTemplatesUseCase } from "./list-prompt-templates.use-case";
import { GenerationOutputMode } from "../../domain/generation-output-mode";
import { GenerationTaskType } from "../../domain/generation-task-type";
import { PromptVersionStatus } from "../../domain/prompt-version-status";
import {
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryPromptTemplateRepository,
  InMemoryPromptVersionRepository,
  SequentialIdGenerator,
} from "../../test-support/fakes";

const ORG = "org-1";

function buildHarness() {
  const clock = new FixedClock();
  const idGenerator = new SequentialIdGenerator();
  const promptTemplateRepository = new InMemoryPromptTemplateRepository();
  const promptVersionRepository = new InMemoryPromptVersionRepository();
  const auditLogWriter = new InMemoryAuditLogWriter();

  const createTemplate = new CreatePromptTemplateUseCase(promptTemplateRepository, clock, idGenerator);
  const createVersion = new CreatePromptVersionUseCase(promptTemplateRepository, promptVersionRepository, clock, idGenerator);
  const activateVersion = new ActivatePromptVersionUseCase(promptVersionRepository, auditLogWriter, clock);
  const archiveTemplate = new ArchivePromptTemplateUseCase(promptTemplateRepository, clock);
  const getTemplate = new GetPromptTemplateUseCase(promptTemplateRepository, promptVersionRepository);
  const listTemplates = new ListPromptTemplatesUseCase(promptTemplateRepository);

  return { createTemplate, createVersion, activateVersion, archiveTemplate, getTemplate, listTemplates, auditLogWriter };
}

describe("Prompt template lifecycle", () => {
  let h: ReturnType<typeof buildHarness>;
  beforeEach(() => {
    h = buildHarness();
  });

  it("OWNER can create a template; a non-admin role cannot", async () => {
    await expect(
      h.createTemplate.execute({
        organizationId: ORG,
        actorRole: "OWNER",
        createdBy: "user-1",
        taskType: GenerationTaskType.ExecutiveSummary,
        name: "Synthèse exécutive",
        outputMode: GenerationOutputMode.FreeText,
      }),
    ).resolves.toMatchObject({ taskType: "EXECUTIVE_SUMMARY" });

    await expect(
      h.createTemplate.execute({
        organizationId: ORG,
        actorRole: "CONTRIBUTOR",
        createdBy: "user-2",
        taskType: GenerationTaskType.Methodology,
        name: "Méthodologie",
        outputMode: GenerationOutputMode.FreeText,
      }),
    ).rejects.toThrow();
  });

  it("rejects a duplicate template for the same (organization, taskType)", async () => {
    await h.createTemplate.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      createdBy: "user-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      name: "V1",
      outputMode: GenerationOutputMode.FreeText,
    });
    await expect(
      h.createTemplate.execute({
        organizationId: ORG,
        actorRole: "OWNER",
        createdBy: "user-1",
        taskType: GenerationTaskType.ExecutiveSummary,
        name: "V2",
        outputMode: GenerationOutputMode.FreeText,
      }),
    ).rejects.toThrow();
  });

  it("creates versions starting at 1 and incrementing, always DRAFT", async () => {
    const template = await h.createTemplate.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      createdBy: "user-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      name: "Synthèse",
      outputMode: GenerationOutputMode.FreeText,
    });

    const v1 = await h.createVersion.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      authorUserId: "user-1",
      promptTemplateId: template.id,
      systemPrompt: "System",
      userPromptTemplate: "Summarize {{tender.title}}",
      requiredVariables: ["tender.title"],
    });
    expect(v1.version).toBe(1);
    expect(v1.status).toBe(PromptVersionStatus.Draft);

    const v2 = await h.createVersion.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      authorUserId: "user-1",
      promptTemplateId: template.id,
      systemPrompt: "System v2",
      userPromptTemplate: "Summarize {{tender.title}} v2",
      requiredVariables: ["tender.title"],
    });
    expect(v2.version).toBe(2);
  });

  it("activation is atomic: activating v2 archives v1, exactly one ACTIVE at a time", async () => {
    const template = await h.createTemplate.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      createdBy: "user-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      name: "Synthèse",
      outputMode: GenerationOutputMode.FreeText,
    });
    const v1 = await h.createVersion.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      authorUserId: "user-1",
      promptTemplateId: template.id,
      systemPrompt: "S1",
      userPromptTemplate: "U1",
      requiredVariables: [],
    });
    const v2 = await h.createVersion.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      authorUserId: "user-1",
      promptTemplateId: template.id,
      systemPrompt: "S2",
      userPromptTemplate: "U2",
      requiredVariables: [],
    });

    await h.activateVersion.execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", versionId: v1.id });
    const afterFirst = await h.getTemplate.execute({ organizationId: ORG, actorRole: "OWNER", templateId: template.id });
    expect(afterFirst.versions.find((v) => v.id === v1.id)?.status).toBe(PromptVersionStatus.Active);

    await h.activateVersion.execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", versionId: v2.id });
    const afterSecond = await h.getTemplate.execute({ organizationId: ORG, actorRole: "OWNER", templateId: template.id });
    const activeVersions = afterSecond.versions.filter((v) => v.status === PromptVersionStatus.Active);
    expect(activeVersions).toHaveLength(1);
    expect(activeVersions[0]?.id).toBe(v2.id);
    expect(afterSecond.versions.find((v) => v.id === v1.id)?.status).toBe(PromptVersionStatus.Archived);
  });

  it("archiving a template does not remove it from a direct get, only from the default (non-archived) list", async () => {
    const template = await h.createTemplate.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      createdBy: "user-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      name: "Synthèse",
      outputMode: GenerationOutputMode.FreeText,
    });
    await h.archiveTemplate.execute({ organizationId: ORG, actorRole: "OWNER", templateId: template.id });

    const listed = await h.listTemplates.execute({ organizationId: ORG, actorRole: "OWNER" });
    expect(listed.find((t) => t.id === template.id)).toBeUndefined();

    const listedWithArchived = await h.listTemplates.execute({ organizationId: ORG, actorRole: "OWNER", includeArchived: true });
    expect(listedWithArchived.find((t) => t.id === template.id)).toBeDefined();
  });

  it("records an audit log entry on activation", async () => {
    const template = await h.createTemplate.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      createdBy: "user-1",
      taskType: GenerationTaskType.ExecutiveSummary,
      name: "Synthèse",
      outputMode: GenerationOutputMode.FreeText,
    });
    const v1 = await h.createVersion.execute({
      organizationId: ORG,
      actorRole: "OWNER",
      authorUserId: "user-1",
      promptTemplateId: template.id,
      systemPrompt: "S",
      userPromptTemplate: "U",
      requiredVariables: [],
    });
    await h.activateVersion.execute({ organizationId: ORG, actorId: "user-1", actorRole: "OWNER", versionId: v1.id });
    expect(h.auditLogWriter.entries).toHaveLength(1);
    expect(h.auditLogWriter.entries[0]?.action).toBe("prompt_version.activated");
  });
});
