import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AiRoutingModel } from "../domain/ai-routing-model";
import { PrismaAiModelPreferenceRepository } from "./prisma-ai-model-preference.repository";

/**
 * Checkpoint TENDEROS-2.1-P2.3-E4 — preuve réelle contre PostgreSQL : roundtrip CRUD + mission §38
 * (isolation tenant/utilisateur) + mission §10 (reset = suppression de ligne, jamais une valeur
 * "AUTO" stockée).
 */
describe("PrismaAiModelPreferenceRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaAiModelPreferenceRepository(prisma);
  const userA = randomUUID();
  const userB = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.aiModelPreference.deleteMany({ where: { userId: { in: [userA, userB] } } });
    await prisma.$disconnect();
  });

  it("BLOQUANT — set() then findOne() roundtrips the stored override", async () => {
    await repository.set({ id: randomUUID(), userId: userA, organizationId: orgA, taskType: "SECTION_SUMMARY", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    const found = await repository.findOne({ userId: userA, organizationId: orgA, taskType: "SECTION_SUMMARY" });

    expect(found?.modelOverride).toBe(AiRoutingModel.Gpt54Mini);
  });

  it("set() twice for the same (user, org, taskType) updates in place, never creates a second row", async () => {
    const taskType = "CHAT";
    await repository.set({ id: randomUUID(), userId: userA, organizationId: orgA, taskType, modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });
    await repository.set({ id: randomUUID(), userId: userA, organizationId: orgA, taskType, modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    const all = await repository.listByUser({ userId: userA, organizationId: orgA });
    expect(all.filter((p) => p.taskType === taskType)).toHaveLength(1);
  });

  it("BLOQUANT — mission §10: reset() deletes the row, findOne() returns null afterwards (never an 'AUTO' row)", async () => {
    await repository.set({ id: randomUUID(), userId: userA, organizationId: orgA, taskType: "TECHNICAL_MEMO_SECTION", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    await repository.reset({ userId: userA, organizationId: orgA, taskType: "TECHNICAL_MEMO_SECTION" });

    expect(await repository.findOne({ userId: userA, organizationId: orgA, taskType: "TECHNICAL_MEMO_SECTION" })).toBeNull();
  });

  it("reset() is idempotent — resetting a task with no stored preference never throws", async () => {
    await expect(repository.reset({ userId: userA, organizationId: orgA, taskType: "EXECUTIVE_SUMMARY" })).resolves.toBeUndefined();
  });

  it("BLOQUANT — mission §38: a preference for (userA, orgA) is invisible under (userA, orgB) and (userB, orgA)", async () => {
    await repository.set({ id: randomUUID(), userId: userA, organizationId: orgA, taskType: "METHODOLOGY", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    expect(await repository.findOne({ userId: userA, organizationId: orgB, taskType: "METHODOLOGY" })).toBeNull();
    expect(await repository.findOne({ userId: userB, organizationId: orgA, taskType: "METHODOLOGY" })).toBeNull();
  });

  it("the same user can hold distinct preferences per organization for the same task", async () => {
    await repository.set({ id: randomUUID(), userId: userA, organizationId: orgA, taskType: "PLANNING", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });
    await repository.set({ id: randomUUID(), userId: userA, organizationId: orgB, taskType: "PLANNING", modelOverride: AiRoutingModel.Gpt54Mini, occurredAt: new Date() });

    const inOrgA = await repository.findOne({ userId: userA, organizationId: orgA, taskType: "PLANNING" });
    const inOrgB = await repository.findOne({ userId: userA, organizationId: orgB, taskType: "PLANNING" });
    expect(inOrgA).not.toBeNull();
    expect(inOrgB).not.toBeNull();
    expect(inOrgA?.id).not.toBe(inOrgB?.id);
  });
});
