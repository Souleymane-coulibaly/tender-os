import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../../shared-kernel/prisma.service";
import { MembershipId } from "../../domain/membership-id.value-object";
import { OrganizationMembership } from "../../domain/organization-membership.aggregate";
import { OrganizationRole } from "../../domain/organization-role";
import { PrismaMembershipRepository } from "../../infrastructure/prisma-membership.repository";
import { FixedClock, InMemoryAuditLogWriter } from "../../test-support/fakes";
import { TransferOrganizationOwnershipUseCase } from "./transfer-organization-ownership.use-case";

/**
 * Preuve réelle contre PostgreSQL (mission P0-2) — les mocks unitaires
 * (transfer-organization-ownership.use-case.spec.ts) ne suffisent pas à démontrer l'absence de
 * race condition : seul un vrai moteur transactionnel avec verrouillage peut le faire. Suppose
 * que `pnpm db:seed` a déjà été exécuté (rôles système présents, y compris OWNER).
 */
describe("TransferOrganizationOwnershipUseCase — concurrency (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaMembershipRepository(prisma);
  const createdUserIds: string[] = [];
  const createdOrganizationIds: string[] = [];
  const createdMembershipIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdMembershipIds.length > 0) {
      await prisma.membershipRole.deleteMany({ where: { membershipId: { in: createdMembershipIds } } });
      await prisma.organizationMembership.deleteMany({ where: { id: { in: createdMembershipIds } } });
    }
    if (createdOrganizationIds.length > 0) {
      await prisma.organization.deleteMany({ where: { id: { in: createdOrganizationIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedUser(): Promise<string> {
    const userId = randomUUID();
    createdUserIds.push(userId);
    await prisma.user.create({
      data: {
        id: userId,
        email: `owner-transfer-${userId}@example.com`,
        displayName: "Ownership Transfer Test User",
        status: "ACTIVE",
        passwordHash: "hashed:whatever",
      },
    });
    return userId;
  }

  async function seedOrganizationWithOwnerAndMembers(memberCount: number): Promise<{
    organizationId: string;
    ownerUserId: string;
    ownerMembershipId: string;
    memberMembershipIds: string[];
  }> {
    const organizationId = randomUUID();
    createdOrganizationIds.push(organizationId);
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Ownership Transfer Concurrency Test Org",
        slug: `ownership-transfer-concurrency-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });

    const ownerUserId = await seedUser();
    const ownerMembershipId = MembershipId.from(randomUUID());
    createdMembershipIds.push(ownerMembershipId.value);
    await repository.save(
      OrganizationMembership.create({
        id: ownerMembershipId,
        organizationId,
        userId: ownerUserId,
        role: OrganizationRole.Owner,
        occurredAt: new Date(),
      }),
    );

    const memberMembershipIds: string[] = [];
    for (let index = 0; index < memberCount; index += 1) {
      const memberUserId = await seedUser();
      const membershipId = MembershipId.from(randomUUID());
      createdMembershipIds.push(membershipId.value);
      await repository.save(
        OrganizationMembership.create({
          id: membershipId,
          organizationId,
          userId: memberUserId,
          role: OrganizationRole.Contributor,
          occurredAt: new Date(),
        }),
      );
      memberMembershipIds.push(membershipId.value);
    }

    return { organizationId, ownerUserId, ownerMembershipId: ownerMembershipId.value, memberMembershipIds };
  }

  function buildUseCase(): TransferOrganizationOwnershipUseCase {
    return new TransferOrganizationOwnershipUseCase(repository, new InMemoryAuditLogWriter(), new FixedClock());
  }

  async function countActiveOwners(organizationId: string): Promise<number> {
    return repository.countActiveByOrganizationAndRole({ organizationId, role: OrganizationRole.Owner });
  }

  it("lets exactly one of two concurrent transfers to different targets succeed, and leaves exactly one active OWNER", async () => {
    const { organizationId, ownerUserId, memberMembershipIds } = await seedOrganizationWithOwnerAndMembers(2);
    const [targetA, targetB] = memberMembershipIds;
    const useCase = buildUseCase();

    const results = await Promise.allSettled([
      useCase.execute({ organizationId, actorId: ownerUserId, newOwnerMembershipId: targetA! }),
      useCase.execute({ organizationId, actorId: ownerUserId, newOwnerMembershipId: targetB! }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "NOT_ORGANIZATION_OWNER" });

    expect(await countActiveOwners(organizationId)).toBe(1);

    // Le membre visé par le transfert qui a échoué doit rester exactement dans son état d'avant
    // (aucun état intermédiaire persisté) : toujours CONTRIBUTOR, jamais OWNER ni ADMIN.
    const rejectedTargetId = fulfilled.length === 1 ? (results[0].status === "fulfilled" ? targetB : targetA) : null;
    if (rejectedTargetId) {
      const untouched = await repository.findById({ organizationId, membershipId: rejectedTargetId });
      expect(untouched?.role).toBe(OrganizationRole.Contributor);
    }
  });

  it("lets exactly one of two concurrent transfers to the same target succeed", async () => {
    const { organizationId, ownerUserId, memberMembershipIds } = await seedOrganizationWithOwnerAndMembers(1);
    const target = memberMembershipIds[0]!;
    const useCase = buildUseCase();

    const results = await Promise.allSettled([
      useCase.execute({ organizationId, actorId: ownerUserId, newOwnerMembershipId: target }),
      useCase.execute({ organizationId, actorId: ownerUserId, newOwnerMembershipId: target }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await countActiveOwners(organizationId)).toBe(1);

    const newOwner = await repository.findById({ organizationId, membershipId: target });
    expect(newOwner?.role).toBe(OrganizationRole.Owner);
  });

  it("a transfer based on a state that became stale (the actor is no longer OWNER by the time it runs) fails cleanly", async () => {
    const { organizationId, ownerUserId, memberMembershipIds } = await seedOrganizationWithOwnerAndMembers(2);
    const [targetA, targetB] = memberMembershipIds;

    // Premier transfert réel, non concurrent : l'ancien OWNER devient ADMIN.
    await buildUseCase().execute({ organizationId, actorId: ownerUserId, newOwnerMembershipId: targetA! });

    // Un second transfert initié par l'ancien acteur (désormais ADMIN, plus OWNER) doit échouer
    // proprement, sans jamais toucher l'état actuel (basé sur une lecture devenue obsolète).
    await expect(
      buildUseCase().execute({ organizationId, actorId: ownerUserId, newOwnerMembershipId: targetB! }),
    ).rejects.toMatchObject({ code: "NOT_ORGANIZATION_OWNER" });

    expect(await countActiveOwners(organizationId)).toBe(1);
    const untouchedTargetB = await repository.findById({ organizationId, membershipId: targetB! });
    expect(untouchedTargetB?.role).toBe(OrganizationRole.Contributor);
  });

  it("does not serialize transfers belonging to different organizations (lock is scoped per organization)", async () => {
    const orgA = await seedOrganizationWithOwnerAndMembers(1);
    const orgB = await seedOrganizationWithOwnerAndMembers(1);
    const useCase = buildUseCase();

    const results = await Promise.allSettled([
      useCase.execute({
        organizationId: orgA.organizationId,
        actorId: orgA.ownerUserId,
        newOwnerMembershipId: orgA.memberMembershipIds[0]!,
      }),
      useCase.execute({
        organizationId: orgB.organizationId,
        actorId: orgB.ownerUserId,
        newOwnerMembershipId: orgB.memberMembershipIds[0]!,
      }),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await countActiveOwners(orgA.organizationId)).toBe(1);
    expect(await countActiveOwners(orgB.organizationId)).toBe(1);
  });
});
