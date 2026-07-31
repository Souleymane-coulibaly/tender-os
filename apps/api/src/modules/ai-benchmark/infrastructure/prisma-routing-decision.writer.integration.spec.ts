import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PrismaRoutingDecisionWriter } from "./prisma-routing-decision.writer";

/**
 * Audit Codex P1-4 — preuve réelle contre PostgreSQL que la décision de routage est bien durable
 * (créée, complétée, et consultable après coup — jamais seulement un champ `metadata` best-effort
 * dans le journal d'audit), et que `clientAccountId` est correctement résolu depuis le Tender
 * associé quand il existe.
 */
describe("PrismaRoutingDecisionWriter (PostgreSQL) — audit Codex P1-4", () => {
  const prisma = new PrismaService();
  const writer = new PrismaRoutingDecisionWriter(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const actorId = randomUUID();
  const now = new Date("2026-07-31T10:00:00Z");
  let clientAccountId: string;
  let tenderId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        {
          id: organizationId,
          name: "RoutingDecisionWriter Integration Test Org",
          slug: `routing-decision-writer-integration-test-org-${organizationId}`,
          defaultTimezone: "Europe/Paris",
          status: "TRIAL",
        },
        {
          id: otherOrganizationId,
          name: "RoutingDecisionWriter Integration Test Org (other)",
          slug: `routing-decision-writer-integration-test-org-other-${otherOrganizationId}`,
          defaultTimezone: "Europe/Paris",
          status: "TRIAL",
        },
      ],
    });
    clientAccountId = (
      await prisma.clientAccount.create({
        data: {
          id: randomUUID(),
          organizationId,
          name: "Client de test",
          nameNormalized: "client de test",
          status: "ACTIVE",
          createdBy: actorId,
        },
      })
    ).id;
    tenderId = (
      await prisma.tender.create({
        data: {
          id: randomUUID(),
          organizationId,
          clientAccountId,
          title: "Marché pour tests RoutingDecisionWriter",
          status: "DRAFT",
          tags: [],
          createdBy: actorId,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.routingDecision.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.tender.deleteMany({ where: { id: tenderId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  it("creates a durable, consultable decision — resolving clientAccountId from the tender — then completes it exactly once", async () => {
    const decisionId = randomUUID();
    const analysisId = randomUUID();

    await writer.create({
      id: decisionId,
      organizationId,
      tenderId,
      analysisId,
      promptKey: "ANALYZE_DOCUMENT",
      routingPolicyId: randomUUID(),
      routingPolicyVersion: 2,
      primaryProvider: "OPENAI",
      primaryModel: "gpt-4o-mini",
      occurredAt: now,
    });

    const afterCreate = await prisma.routingDecision.findUnique({ where: { id: decisionId } });
    expect(afterCreate).not.toBeNull();
    expect(afterCreate!.status).toBe("IN_PROGRESS");
    expect(afterCreate!.clientAccountId).toBe(clientAccountId);
    expect(afterCreate!.primaryModel).toBe("gpt-4o-mini");

    await writer.complete({
      id: decisionId,
      selectedProvider: "OPENAI",
      selectedModel: "gpt-4o-mini",
      fallbackLevel: 0,
      fallbackAttempts: 0,
      inputTokenCount: 120,
      outputTokenCount: 45,
      actualCostAmount: "0.001234",
      currency: "USD",
      latencyMs: 850,
      status: "SUCCEEDED",
      occurredAt: new Date(now.getTime() + 900),
    });

    // Consultable APRÈS l'analyse, exactement comme après un vrai job (mission "toujours
    // consultable après l'analyse").
    const afterComplete = await prisma.routingDecision.findUnique({ where: { id: decisionId } });
    expect(afterComplete!.status).toBe("SUCCEEDED");
    expect(afterComplete!.actualCostAmount?.toString()).toBe("0.001234");
    expect(afterComplete!.latencyMs).toBe(850);
    expect(afterComplete!.completedAt).not.toBeNull();
  });

  it("stays consultable and unaffected even if the routing policy is later archived or the model disabled (no live JOIN)", async () => {
    const decisionId = randomUUID();
    await writer.create({
      id: decisionId,
      organizationId,
      tenderId,
      analysisId: randomUUID(),
      promptKey: "CONSOLIDATE_TENDER_ANALYSIS",
      routingPolicyId: randomUUID(),
      routingPolicyVersion: 1,
      primaryProvider: "OPENAI",
      primaryModel: "gpt-4o",
      occurredAt: now,
    });
    await writer.complete({
      id: decisionId,
      selectedModel: "gpt-4o",
      fallbackLevel: 0,
      fallbackAttempts: 0,
      status: "SUCCEEDED",
      occurredAt: now,
    });

    // Aucune RoutingPolicy ni AiModel réel n'a jamais été créé pour ce test (routingPolicyId est un
    // UUID orphelin) — la décision reste pourtant intégralement lisible : aucune colonne ici n'est
    // un JOIN vers un état "actuel".
    const decision = await prisma.routingDecision.findUnique({ where: { id: decisionId } });
    expect(decision!.status).toBe("SUCCEEDED");
    expect(decision!.primaryModel).toBe("gpt-4o");
  });

  it("never leaks a routing decision across organizations", async () => {
    const decisionId = randomUUID();
    await writer.create({
      id: decisionId,
      organizationId,
      analysisId: randomUUID(),
      promptKey: "ANALYZE_DOCUMENT",
      primaryProvider: "OPENAI",
      primaryModel: "gpt-4o-mini",
      occurredAt: now,
    });

    const scopedToOtherOrg = await prisma.routingDecision.findFirst({ where: { id: decisionId, organizationId: otherOrganizationId } });
    expect(scopedToOtherOrg).toBeNull();

    const scopedToOwnOrg = await prisma.routingDecision.findFirst({ where: { id: decisionId, organizationId } });
    expect(scopedToOwnOrg).not.toBeNull();
  });

  it("never stores a full prompt, document content, or API key — only execution metadata", async () => {
    const decisionId = randomUUID();
    await writer.create({
      id: decisionId,
      organizationId,
      analysisId: randomUUID(),
      promptKey: "ANALYZE_DOCUMENT",
      primaryProvider: "OPENAI",
      primaryModel: "gpt-4o-mini",
      occurredAt: now,
    });

    const decision = await prisma.routingDecision.findUnique({ where: { id: decisionId } });
    const columns = Object.keys(decision as object);
    // `promptKey` est un identifiant d'enum ("ANALYZE_DOCUMENT"), jamais le texte du prompt lui-même
    // — seul un contenu réel (document/prompt intégral/clé API) serait une violation.
    const forbidden = ["document", "apikey", "systemprompt", "userprompt", "rawcontent"];
    for (const column of columns) {
      expect(forbidden.some((f) => column.toLowerCase().includes(f))).toBe(false);
    }
  });
});
