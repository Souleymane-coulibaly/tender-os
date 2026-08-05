import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { AiSuggestionEntityType } from "../domain/ai-suggestion-entity-type";
import { AiSuggestionFieldSchemaRegistry } from "../application/services/ai-suggestion-field-schema-registry";
import { CreateAiSuggestionUseCase } from "../application/use-cases/create-ai-suggestion.use-case";
import { PrismaAiSuggestionRepository } from "./prisma-ai-suggestion.repository";

class SystemClock {
  now(): Date {
    return new Date();
  }
}

/**
 * Preuve PostgreSQL réelle — un fake en mémoire ne peut pas démontrer les CHECK constraints
 * hand-appended (status/entity_type/confidence) ni l'isolation inter-tenant au niveau requête SQL.
 */
describe("AiSuggestion repository (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaAiSuggestionRepository(prisma);
  const schemaRegistry = new AiSuggestionFieldSchemaRegistry();
  schemaRegistry.register(AiSuggestionEntityType.ChecklistItem, "label", z.string().min(1).max(300));
  schemaRegistry.register(AiSuggestionEntityType.TenderLot, "title", z.string());
  schemaRegistry.register(AiSuggestionEntityType.PricingLine, "amount", z.string());
  const createUseCase = new CreateAiSuggestionUseCase(repository, schemaRegistry, new SystemClock());

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        { id: organizationId, name: "AiSuggestion Repo Test Org", slug: `ai-suggestion-repo-test-org-${organizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
        { id: otherOrganizationId, name: "AiSuggestion Repo Test Org (other)", slug: `ai-suggestion-repo-test-org-other-${otherOrganizationId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.aiSuggestion.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  });

  it("creates a suggestion validated by the centrally-registered Zod schema and reads it back", async () => {
    const entityId = randomUUID();
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.ChecklistItem,
      entityId,
      fieldName: "label",
      proposedValue: "Attestation d'assurance décennale",
      confidence: 0.72,
      createdByProcess: "test.integration",
    });

    const stored = await repository.findById({ id: created.id, organizationId });
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe("PENDING");
    expect(stored?.proposedValue).toBe("Attestation d'assurance décennale");
  });

  it("mission Sprint 1 §4 — a suggestion is invisible to another organization (anti-IDOR)", async () => {
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.TenderLot,
      entityId: randomUUID(),
      fieldName: "title",
      proposedValue: "Lot 1",
      confidence: 0.5,
      createdByProcess: "test.integration",
    });

    expect(await repository.findById({ id: created.id, organizationId: otherOrganizationId })).toBeNull();
    expect(await repository.list({ organizationId: otherOrganizationId })).toHaveLength(0);
  });

  it("rejects an out-of-catalogue entity_type at the database level (CHECK constraint)", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'NOT_A_REAL_TYPE', ${randomUUID()}::uuid, 'x', '"x"'::jsonb, 0.5, 'PENDING', 'test', now())`,
    ).rejects.toThrow();
  });

  it("rejects a confidence outside [0, 1] at the database level (CHECK constraint)", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO ai_suggestions (id, organization_id, entity_type, entity_id, field_name, proposed_value, confidence, status, created_by_process, updated_at)
        VALUES (${randomUUID()}::uuid, ${organizationId}::uuid, 'TENDER_LOT', ${randomUUID()}::uuid, 'x', '"x"'::jsonb, 1.4, 'PENDING', 'test', now())`,
    ).rejects.toThrow();
  });

  it("transitionFromPending is atomic: a second concurrent transition on the same row is a no-op (returns null)", async () => {
    const created = await createUseCase.execute({
      organizationId,
      entityType: AiSuggestionEntityType.PricingLine,
      entityId: randomUUID(),
      fieldName: "amount",
      proposedValue: "1000",
      confidence: 0.6,
      createdByProcess: "test.integration",
    });

    const now = new Date();
    const [first, second] = await Promise.all([
      repository.transitionFromPending({ id: created.id, organizationId, newStatus: "ACCEPTED", validatedByUserId: randomUUID(), validatedAt: now, appliedValue: "1000", updatedAt: now }),
      repository.transitionFromPending({ id: created.id, organizationId, newStatus: "REJECTED", rejectedAt: now, updatedAt: now }),
    ]);

    const outcomes = [first, second];
    const successes = outcomes.filter((outcome) => outcome !== null);
    const noops = outcomes.filter((outcome) => outcome === null);
    expect(successes).toHaveLength(1);
    expect(noops).toHaveLength(1);
  });
});
