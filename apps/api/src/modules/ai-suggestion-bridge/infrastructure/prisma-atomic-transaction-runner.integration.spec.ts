import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PrismaAtomicTransactionRunner } from "./prisma-atomic-transaction-runner";

/**
 * V2 Sprint 4 (audit Codex P1-001, round 4 — atomicité totale) — preuve PostgreSQL réelle du
 * mécanisme CŒUR (`PrismaAtomicTransactionRunner` + `TransactionalContext` + `PrismaService.
 * currentClient()`) que `ApplyAiSuggestionUseCase` utilise pour envelopper écriture métier cible +
 * finalisation de la suggestion dans une seule transaction. Ici testé directement contre deux
 * tables réelles (`tenders` et `ai_suggestions`) sans passer par les use cases complets — la
 * preuve de bout en bout via le vrai flux HTTP `/apply` (avec un échec de finalisation authentique,
 * jamais un hook de test) vit dans `ai-suggestion-bridge-http.integration.spec.ts`.
 */
describe("PrismaAtomicTransactionRunner (PostgreSQL réel)", () => {
  const prisma = new PrismaService();
  const runner = new PrismaAtomicTransactionRunner(prisma);

  const organizationId = randomUUID();
  const actorId = randomUUID();
  let tenderId: string;
  let suggestionId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "AtomicTransactionRunner Integration Test Org",
        slug: `atomic-transaction-runner-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
    const clientAccount = await prisma.clientAccount.create({
      data: { id: randomUUID(), organizationId, name: "Client de test", nameNormalized: "client de test", status: "ACTIVE", createdBy: actorId },
    });
    tenderId = randomUUID();
    await prisma.tender.create({
      data: {
        id: tenderId,
        organizationId,
        clientAccountId: clientAccount.id,
        title: "Tender pour test AtomicTransactionRunner",
        description: "Description initiale.",
        status: "DRAFT",
        tags: [],
        createdBy: actorId,
      },
    });
    suggestionId = randomUUID();
    await prisma.aiSuggestion.create({
      data: {
        id: suggestionId,
        organizationId,
        entityType: "TENDER_FIELD",
        fieldName: "description",
        parentTenderId: tenderId,
        proposedValue: "Description proposée." as never,
        confidence: 0.8,
        status: "PENDING",
        createdByProcess: "test.atomic-transaction-runner",
      },
    });
  });

  afterAll(async () => {
    await prisma.aiSuggestion.deleteMany({ where: { organizationId } });
    await prisma.tender.deleteMany({ where: { organizationId } });
    await prisma.clientAccount.deleteMany({ where: { organizationId } });
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("commits both writes together when fn succeeds — Tender.description AND AiSuggestion.status change atomically", async () => {
    await runner.run(async () => {
      const client = prisma.currentClient();
      await client.tender.update({ where: { id: tenderId }, data: { description: "Description écrite par le runner." } });
      await client.aiSuggestion.update({ where: { id: suggestionId }, data: { status: "APPLYING" } });
    });

    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    const suggestion = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    expect(tender.description).toBe("Description écrite par le runner.");
    expect(suggestion.status).toBe("APPLYING");
  });

  it("rolls back BOTH writes together when fn throws after both succeeded — never one committed without the other", async () => {
    class IntentionalFailure extends Error {}

    await expect(
      runner.run(async () => {
        const client = prisma.currentClient();
        // Les deux écritures réussissent bel et bien (aucune erreur Postgres) — c'est la levée
        // manuelle ci-dessous, APRÈS les deux, qui doit tout annuler.
        await client.tender.update({ where: { id: tenderId }, data: { description: "Description qui ne doit JAMAIS persister." } });
        await client.aiSuggestion.update({ where: { id: suggestionId }, data: { status: "ACCEPTED" } });
        throw new IntentionalFailure("échec simulé après les deux écritures");
      }),
    ).rejects.toThrow(IntentionalFailure);

    // Preuve du rollback : les DEUX écritures précédentes (celle du test précédent) restent seules
    // valides — rien de ce second `run()` n'a survécu.
    const tender = await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } });
    const suggestion = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
    expect(tender.description).toBe("Description écrite par le runner.");
    expect(suggestion.status).toBe("APPLYING");
  });

  it("PrismaService.currentClient() returns the plain client (not a stale transaction) once run() has completed", async () => {
    await runner.run(async () => Promise.resolve());
    expect(prisma.currentClient()).toBe(prisma);
  });
});
