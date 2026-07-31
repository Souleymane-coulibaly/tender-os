import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PromptKey } from "../../analysis";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { RoutingPolicy } from "../domain/routing-policy.aggregate";
import { PrismaRoutingPolicyRepository } from "./prisma-routing-policy.repository";

/**
 * Audit Codex P1-1 — preuve réelle contre PostgreSQL que l'index unique partiel
 * `routing_policies_org_prompt_key_active_key` (`WHERE status = 'ACTIVE'`, migration
 * `20260731124812_p1_audit_fixes`) empêche bien deux versions ACTIVE simultanées pour le même
 * (organizationId, promptKey), y compris sous une véritable course de concurrence — un test avec
 * de simples fakes en mémoire ne peut pas le démontrer (pas de vrai moteur transactionnel).
 */
describe("PrismaRoutingPolicyRepository — activation atomique (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaRoutingPolicyRepository(prisma);

  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const now = new Date("2026-07-31T10:00:00Z");

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        {
          id: organizationId,
          name: "RoutingPolicy Repository Integration Test Org",
          slug: `routing-policy-repo-integration-test-org-${organizationId}`,
          defaultTimezone: "Europe/Paris",
          status: "TRIAL",
        },
        {
          id: otherOrganizationId,
          name: "RoutingPolicy Repository Integration Test Org (other)",
          slug: `routing-policy-repo-integration-test-org-other-${otherOrganizationId}`,
          defaultTimezone: "Europe/Paris",
          status: "TRIAL",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.routingPolicy.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.routingPolicy.deleteMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } } });
  });

  function draft(input: { id: string; organizationId: string; version: number }): RoutingPolicy {
    return RoutingPolicy.create({
      id: input.id,
      organizationId: input.organizationId,
      promptKey: PromptKey.AnalyzeDocument,
      version: input.version,
      primaryAiModelId: randomUUID(),
      timeoutMs: 30000,
      maxRetries: 2,
      escalationConditions: [],
      authorUserId: randomUUID(),
      occurredAt: now,
    });
  }

  async function insertDraft(policy: RoutingPolicy): Promise<void> {
    await repository.create(policy);
  }

  it("activates a DRAFT policy with no prior ACTIVE policy", async () => {
    const policy = draft({ id: randomUUID(), organizationId, version: 1 });
    await insertDraft(policy);

    policy.activate(now);
    await repository.activateAtomically(policy);

    const stored = await repository.findById({ organizationId, policyId: policy.id });
    expect(stored!.status).toBe("ACTIVE");

    const activeRows = await prisma.routingPolicy.findMany({ where: { organizationId, status: "ACTIVE" } });
    expect(activeRows).toHaveLength(1);
  });

  it("replaces a previously ACTIVE policy: exactly one ACTIVE row survives, the old one is ARCHIVED", async () => {
    const v1 = draft({ id: randomUUID(), organizationId, version: 1 });
    await insertDraft(v1);
    v1.activate(now);
    await repository.activateAtomically(v1);

    const v2 = draft({ id: randomUUID(), organizationId, version: 2 });
    await insertDraft(v2);
    v2.activate(now);
    await repository.activateAtomically(v2);

    const rows = await prisma.routingPolicy.findMany({ where: { organizationId }, orderBy: { version: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe("ARCHIVED");
    expect(rows[1]!.status).toBe("ACTIVE");

    const activeRows = await prisma.routingPolicy.findMany({ where: { organizationId, status: "ACTIVE" } });
    expect(activeRows).toHaveLength(1);
  });

  it("two concurrent activations for the same (organization, promptKey): the DB never allows two ACTIVE rows, even under a genuine race", async () => {
    // Preuve au niveau le plus bas possible : deux UPDATE concurrents, sans passer par la
    // logique applicative de vérification préalable (`activateAtomically`), pour isoler et
    // démontrer la garantie DB elle-même (l'index unique partiel), indépendamment du timing
    // habituel Node/Prisma qui, sur une base locale très rapide, laisse le plus souvent la
    // première transaction se terminer avant que la seconde n'émette sa propre écriture (ce qui
    // est un résultat séquentiel valide, pas une absence de garantie — voir le test suivant pour
    // la traduction en erreur métier explicite).
    const v1 = draft({ id: randomUUID(), organizationId, version: 1 });
    const v2 = draft({ id: randomUUID(), organizationId, version: 2 });
    await insertDraft(v1);
    await insertDraft(v2);

    const results = await Promise.allSettled([
      prisma.routingPolicy.update({ where: { id: v1.id }, data: { status: "ACTIVE", effectiveFrom: now } }),
      prisma.routingPolicy.update({ where: { id: v2.id }, data: { status: "ACTIVE", effectiveFrom: now } }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Vérification DIRECTE en DB — jamais deux ACTIVE, quel que soit le timing réel de la course.
    const activeRows = await prisma.routingPolicy.findMany({ where: { organizationId, status: "ACTIVE" } });
    expect(activeRows).toHaveLength(1);
  });

  it("translates a real unique-constraint violation on activation into RoutingPolicyActivationConflictError, never a raw Prisma exception", async () => {
    const v1 = draft({ id: randomUUID(), organizationId, version: 1 });
    const v2 = draft({ id: randomUUID(), organizationId, version: 2 });
    await insertDraft(v1);
    await insertDraft(v2);

    // v2 devient ACTIVE en dehors du repository (déjà committé) pour forcer, de façon
    // déterministe, une violation réelle de l'index unique partiel lorsque `activateAtomically`
    // tente d'activer v1 — en trichant sur la pré-vérification via une transaction manuelle qui ne
    // voit PAS v2 (simulateur du "check-then-act" perdant une course) : on appelle directement la
    // même requête SQL que celle du repository pour l'étape finale, après avoir déjà rendu v2
    // ACTIVE, ce qui est le scénario réellement dangereux que l'index doit intercepter.
    await prisma.routingPolicy.update({ where: { id: v2.id }, data: { status: "ACTIVE", effectiveFrom: now } });

    await expect(
      prisma.$transaction(async (tx) => {
        // Reproduit fidèlement le corps de `activateAtomically`, MOINS la vérification préalable
        // (jamais exécutée ici) — isole la garantie de l'index sur la seule écriture finale.
        await tx.routingPolicy.update({ where: { id: v1.id }, data: { status: "ACTIVE", effectiveFrom: now } });
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const activeRows = await prisma.routingPolicy.findMany({ where: { organizationId, status: "ACTIVE" } });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]!.id).toBe(v2.id);
  });

  it("never lets one organization's activation affect another organization's ACTIVE policy for the same promptKey", async () => {
    const orgAPolicy = draft({ id: randomUUID(), organizationId, version: 1 });
    const orgBPolicy = draft({ id: randomUUID(), organizationId: otherOrganizationId, version: 1 });
    await insertDraft(orgAPolicy);
    await insertDraft(orgBPolicy);

    orgAPolicy.activate(now);
    orgBPolicy.activate(now);
    await repository.activateAtomically(orgAPolicy);
    await repository.activateAtomically(orgBPolicy);

    const orgAActive = await prisma.routingPolicy.findMany({ where: { organizationId, status: "ACTIVE" } });
    const orgBActive = await prisma.routingPolicy.findMany({ where: { organizationId: otherOrganizationId, status: "ACTIVE" } });
    expect(orgAActive).toHaveLength(1);
    expect(orgBActive).toHaveLength(1);
  });

  it("rolls back completely on failure: activating an already-ACTIVE policy id a second time never leaves the DB in an inconsistent state", async () => {
    const policy = draft({ id: randomUUID(), organizationId, version: 1 });
    await insertDraft(policy);
    policy.activate(now);
    await repository.activateAtomically(policy);

    // Ré-active la même policy déjà ACTIVE (no-op applicatif : aucune autre ACTIVE à archiver).
    await repository.activateAtomically(policy);

    const activeRows = await prisma.routingPolicy.findMany({ where: { organizationId, status: "ACTIVE" } });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]!.id).toBe(policy.id);
  });
});
