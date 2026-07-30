import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { Risk } from "../domain/risk.entity";
import { PrismaRiskRepository } from "./prisma-risk.repository";

describe("PrismaRiskRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaRiskRepository(prisma);
  const organizationId = randomUUID();
  const tenderId = randomUUID();
  const createdRiskIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Risk Integration Test Org",
        slug: `risk-integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    const clientAccount = await prisma.clientAccount.create({
      data: {
        id: randomUUID(),
        organizationId,
        name: "Client de test",
        nameNormalized: "client de test",
        status: "ACTIVE",
        createdBy: randomUUID(),
      },
    });
    await prisma.tender.create({
      data: {
        id: tenderId,
        organizationId,
        clientAccountId: clientAccount.id,
        title: "Marche pour tests risques",
        status: "DRAFT",
        tags: [],
        createdBy: randomUUID(),
      },
    });
  });

  afterAll(async () => {
    if (createdRiskIds.length > 0) {
      await prisma.tenderRisk.deleteMany({ where: { id: { in: createdRiskIds } } });
    }
    await prisma.tender.delete({ where: { id: tenderId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  function createRisk(title: string, severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"): Risk {
    const id = randomUUID();
    createdRiskIds.push(id);

    return Risk.create({ id, organizationId, tenderId, title, severity, occurredAt: new Date() });
  }

  it("persists a risk in OPEN status and reads it back scoped to the tender", async () => {
    const risk = createRisk("Delai tres court", "CRITICAL");
    await repository.save(risk);

    const found = await repository.findById({ organizationId, tenderId, riskId: risk.id });
    expect(found?.status).toBe("OPEN");
    expect(found?.severity).toBe("CRITICAL");
  });

  it("stamps resolvedAt when moved to RESOLVED and clears it if reopened", async () => {
    const risk = createRisk("Sous-traitant indisponible", "HIGH");
    await repository.save(risk);

    risk.changeStatus("RESOLVED", new Date());
    await repository.save(risk);

    const resolved = await repository.findById({ organizationId, tenderId, riskId: risk.id });
    expect(resolved?.status).toBe("RESOLVED");
    expect(resolved?.resolvedAt).toBeInstanceOf(Date);

    resolved!.changeStatus("OPEN", new Date());
    await repository.save(resolved!);

    const reopened = await repository.findById({ organizationId, tenderId, riskId: risk.id });
    expect(reopened?.resolvedAt).toBeUndefined();
  });

  it("lists only risks for the given tender and organization", async () => {
    await repository.save(createRisk("Risque A", "LOW"));
    await repository.save(createRisk("Risque B", "MEDIUM"));

    const risks = await repository.listByTender({ organizationId, tenderId });
    expect(risks.length).toBeGreaterThanOrEqual(2);
    expect(risks.every((risk) => risk.tenderId === tenderId)).toBe(true);
  });

  it("returns null for a risk scoped to a different tender", async () => {
    const risk = createRisk("Risque isole", "LOW");
    await repository.save(risk);

    const found = await repository.findById({ organizationId, tenderId: randomUUID(), riskId: risk.id });
    expect(found).toBeNull();
  });
});
