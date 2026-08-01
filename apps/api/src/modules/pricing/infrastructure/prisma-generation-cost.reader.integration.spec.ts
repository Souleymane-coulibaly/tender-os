import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PrismaGenerationCostReader } from "./prisma-generation-cost.reader";

/**
 * Preuve PostgreSQL réelle que `PrismaGenerationCostReader` lit correctement la table `generations`
 * partagée (mission Sprint 7 §"Identification des sources de tokens... coûts") — jamais une donnée
 * Sprint 6 dupliquée, uniquement une lecture.
 */
describe("PrismaGenerationCostReader (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const reader = new PrismaGenerationCostReader(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const clientAccountId = randomUUID();
  const tenderId = randomUUID();
  const promptTemplateId = randomUUID();
  const promptVersionId = randomUUID();
  const now = new Date("2026-08-15T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "Generation Cost Reader Test Org", slug: `gcr-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "Generation Cost Reader Test Org (other)", slug: `gcr-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
    await prisma.clientAccount.create({
      data: { id: clientAccountId, organizationId, name: "Client", nameNormalized: "client", status: "ACTIVE", createdBy: randomUUID() },
    });
    await prisma.tender.create({
      data: { id: tenderId, organizationId, clientAccountId, title: "Marché de test", status: "DRAFT", tags: [], createdBy: randomUUID() },
    });
    await prisma.promptTemplate.create({
      data: { id: promptTemplateId, organizationId, taskType: "EXECUTIVE_SUMMARY", name: "Synthèse", outputMode: "FREE_TEXT", createdBy: randomUUID() },
    });
    await prisma.promptVersion.create({
      data: {
        id: promptVersionId,
        organizationId,
        promptTemplateId,
        version: 1,
        status: "ACTIVE",
        systemPrompt: "S",
        userPromptTemplate: "U",
        requiredVariables: [],
        authorUserId: randomUUID(),
        effectiveFrom: now,
      },
    });
  });

  afterAll(async () => {
    await prisma.generation.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.promptVersion.deleteMany({ where: { organizationId } });
    await prisma.promptTemplate.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.generation.deleteMany({ where: { organizationId } });
  });

  function seedGeneration(overrides: {
    taskType?: string;
    status?: string;
    inputTokenCount?: number | null;
    outputTokenCount?: number | null;
    totalTokenCount?: number | null;
    estimatedCostAmount?: string | null;
    currency?: string | null;
  } = {}) {
    const id = randomUUID();
    return prisma.generation.create({
      data: {
        id,
        organizationId,
        clientAccountId,
        tenderId,
        taskType: overrides.taskType ?? "EXECUTIVE_SUMMARY",
        rootGenerationId: id,
        version: 1,
        status: overrides.status ?? "GENERATED",
        promptTemplateId,
        promptVersionId,
        promptVersionNumber: 1,
        modelProvider: "OPENAI",
        modelKey: "gpt-4o-mini",
        fallbackLevel: 0,
        inputTokenCount: "inputTokenCount" in overrides ? overrides.inputTokenCount : 100,
        outputTokenCount: "outputTokenCount" in overrides ? overrides.outputTokenCount : 200,
        totalTokenCount: "totalTokenCount" in overrides ? overrides.totalTokenCount : 300,
        estimatedCostAmount: "estimatedCostAmount" in overrides ? overrides.estimatedCostAmount : "0.001500",
        currency: "currency" in overrides ? overrides.currency : "EUR",
        createdBy: randomUUID(),
      },
    });
  }

  it("reads real technical cost fields from a GENERATED generation, never modifying the row", async () => {
    await seedGeneration();
    const { items, total } = await reader.list({ organizationId, tenderId, limit: 10, offset: 0 });
    expect(total).toBe(1);
    expect(items[0]!.costAmount).toBe("0.0015");
    expect(items[0]!.currency).toBe("EUR");
    expect(items[0]!.totalTokenCount).toBe(300);
  });

  it("never leaks a generation across organizations", async () => {
    await seedGeneration();
    const { items } = await reader.list({ organizationId: otherOrganizationId, tenderId, limit: 10, offset: 0 });
    expect(items).toHaveLength(0);
  });

  it("filters by clientAccountId and taskType", async () => {
    await seedGeneration();
    await seedGeneration({ taskType: "METHODOLOGY" });

    const byTaskType = await reader.list({ organizationId, taskType: "METHODOLOGY", limit: 10, offset: 0 });
    expect(byTaskType.total).toBe(1);
    expect(byTaskType.items[0]!.taskType).toBe("METHODOLOGY");

    const byClient = await reader.list({ organizationId, clientAccountId, limit: 10, offset: 0 });
    expect(byClient.total).toBe(2);
  });

  it("averageTokensForTaskType returns null when there is no GENERATED history yet", async () => {
    const average = await reader.averageTokensForTaskType({ organizationId, taskType: "EXECUTIVE_SUMMARY" });
    expect(average).toBeNull();
  });

  it("averageTokensForTaskType computes a real average across GENERATED rows only", async () => {
    await seedGeneration({ inputTokenCount: 100, outputTokenCount: 200 });
    await seedGeneration({ inputTokenCount: 300, outputTokenCount: 400 });
    await seedGeneration({ status: "FAILED", inputTokenCount: null, outputTokenCount: null, totalTokenCount: null, estimatedCostAmount: null, currency: null });

    const average = await reader.averageTokensForTaskType({ organizationId, taskType: "EXECUTIVE_SUMMARY" });
    expect(average).not.toBeNull();
    expect(average!.averageInputTokens).toBe(200);
    expect(average!.averageOutputTokens).toBe(300);
    expect(average!.sampleSize).toBe(2);
  });
});
