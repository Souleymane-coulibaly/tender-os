import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { MembershipId } from "../domain/membership-id.value-object";
import { OrganizationMembership } from "../domain/organization-membership.aggregate";
import { OrganizationRole } from "../domain/organization-role";
import { PrismaMembershipRepository } from "./prisma-membership.repository";

/**
 * Suppose que `pnpm db:seed` a déjà été exécuté (rôles système présents) — comme documenté
 * dans docs/04-architecture/DATABASE_DESIGN.md §31, les rôles/permissions système sont des
 * données de seed, pas des données créées par ce test.
 */
describe("PrismaMembershipRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaMembershipRepository(prisma);
  const organizationId = randomUUID();
  const createdUserIds: string[] = [];
  const createdMembershipIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Integration Test Org",
        slug: `integration-test-org-${organizationId}`,
        defaultTimezone: "Europe/Paris",
        status: "TRIAL",
      },
    });
  });

  afterAll(async () => {
    if (createdMembershipIds.length > 0) {
      await prisma.membershipRole.deleteMany({ where: { membershipId: { in: createdMembershipIds } } });
      await prisma.organizationMembership.deleteMany({ where: { id: { in: createdMembershipIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  async function seedUser(): Promise<string> {
    const userId = randomUUID();
    createdUserIds.push(userId);
    await prisma.user.create({
      data: {
        id: userId,
        email: `member-${userId}@example.com`,
        displayName: "Integration Test User",
        status: "ACTIVE",
        passwordHash: "hashed:whatever",
      },
    });
    return userId;
  }

  function createMembership(userId: string, role: OrganizationRole): OrganizationMembership {
    const id = MembershipId.from(randomUUID());
    createdMembershipIds.push(id.value);

    return OrganizationMembership.create({
      id,
      organizationId,
      userId,
      role,
      occurredAt: new Date(),
    });
  }

  it("persists a new membership with its role and reads it back by id", async () => {
    const userId = await seedUser();
    const membership = createMembership(userId, OrganizationRole.Contributor);

    await repository.save(membership);
    const found = await repository.findById({ organizationId, membershipId: membership.id.value });

    expect(found).not.toBeNull();
    expect(found?.role).toBe(OrganizationRole.Contributor);
    expect(found?.status).toBe("ACTIVE");
  });

  it("finds a membership by organization and user", async () => {
    const userId = await seedUser();
    const membership = createMembership(userId, OrganizationRole.Reviewer);
    await repository.save(membership);

    const found = await repository.findByOrganizationAndUser({ organizationId, userId });

    expect(found?.id.value).toBe(membership.id.value);
  });

  it("persists a role change by replacing the membership_roles row", async () => {
    const userId = await seedUser();
    const membership = createMembership(userId, OrganizationRole.Contributor);
    await repository.save(membership);

    membership.changeRole(OrganizationRole.BidManager, new Date());
    await repository.save(membership);

    const found = await repository.findById({ organizationId, membershipId: membership.id.value });
    expect(found?.role).toBe(OrganizationRole.BidManager);

    const roleRows = await prisma.membershipRole.findMany({ where: { membershipId: membership.id.value } });
    expect(roleRows).toHaveLength(1);
  });

  it("counts active memberships by organization and role", async () => {
    const adminUserId = await seedUser();
    const membership = createMembership(adminUserId, OrganizationRole.OrganizationAdmin);
    await repository.save(membership);

    const count = await repository.countActiveByOrganizationAndRole({
      organizationId,
      role: OrganizationRole.OrganizationAdmin,
    });

    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("returns null when no membership matches", async () => {
    const found = await repository.findById({ organizationId, membershipId: randomUUID() });

    expect(found).toBeNull();
  });

  it("correctif audit Codex 22E (P2) — listActiveByOrganizationAndRoles finds an OWNER/ORGANIZATION_ADMIN even when the organization has more members than any pagination limit could have covered", async () => {
    // 26 CONTRIBUTOR créés en premier (au-delà de l'ancien plafond bogué de 25), l'ORGANIZATION_ADMIN
    // seulement APRÈS — reproduit exactement le scénario où `listByOrganization` paginée (triée par
    // createdAt) l'aurait silencieusement exclu.
    for (let i = 0; i < 26; i += 1) {
      const userId = await seedUser();
      await repository.save(createMembership(userId, OrganizationRole.Contributor));
    }
    const adminUserId = await seedUser();
    const admin = createMembership(adminUserId, OrganizationRole.OrganizationAdmin);
    await repository.save(admin);

    const found = await repository.listActiveByOrganizationAndRoles({ organizationId, roles: [OrganizationRole.Owner, OrganizationRole.OrganizationAdmin] });

    expect(found.some((m) => m.id.value === admin.id.value)).toBe(true);
    // Jamais les CONTRIBUTOR — filtre par rôle réel, pas seulement "tous les membres".
    expect(found.every((m) => m.role === OrganizationRole.OrganizationAdmin || m.role === OrganizationRole.Owner)).toBe(true);
  });

  describe("Checkpoint TENDEROS-2.1-P2.3-E1.1, FINDING 3 — saveWithSeatLimit under REAL concurrency", () => {
    const seatLimitOrgId = randomUUID();
    const seatLimitUserIds: string[] = [];
    const seatLimitMembershipIds: string[] = [];

    beforeAll(async () => {
      await prisma.organization.create({
        data: { id: seatLimitOrgId, name: "Seat Limit Concurrency Org", slug: `seat-limit-concurrency-${seatLimitOrgId}`, defaultTimezone: "Europe/Paris", status: "TRIAL" },
      });
    });

    afterAll(async () => {
      if (seatLimitMembershipIds.length > 0) {
        await prisma.membershipRole.deleteMany({ where: { membershipId: { in: seatLimitMembershipIds } } });
        await prisma.organizationMembership.deleteMany({ where: { id: { in: seatLimitMembershipIds } } });
      }
      if (seatLimitUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: seatLimitUserIds } } });
      }
      await prisma.organization.delete({ where: { id: seatLimitOrgId } });
    });

    async function seedSeatLimitUser(): Promise<string> {
      const userId = randomUUID();
      seatLimitUserIds.push(userId);
      await prisma.user.create({ data: { id: userId, email: `seat-${userId}@example.com`, displayName: "Seat Limit Test User", status: "ACTIVE", passwordHash: "hashed:whatever" } });
      return userId;
    }

    function buildSeatLimitMembership(userId: string): OrganizationMembership {
      const id = MembershipId.from(randomUUID());
      seatLimitMembershipIds.push(id.value);
      return OrganizationMembership.create({ id, organizationId: seatLimitOrgId, userId, role: OrganizationRole.Contributor, occurredAt: new Date() });
    }

    it("mission TEST 12 — STARTER with exactly 1 seat remaining (limit=2, 1 already active): 2 truly concurrent creations yield exactly 1 success and 1 SEAT_LIMIT_EXCEEDED, final count exactly at the limit", async () => {
      const existingUserId = await seedSeatLimitUser();
      await repository.save(buildSeatLimitMembership(existingUserId));

      const userA = await seedSeatLimitUser();
      const userB = await seedSeatLimitUser();

      const [resultA, resultB] = await Promise.all([
        repository.saveWithSeatLimit({ organizationId: seatLimitOrgId, membership: buildSeatLimitMembership(userA), seatLimit: 2 }),
        repository.saveWithSeatLimit({ organizationId: seatLimitOrgId, membership: buildSeatLimitMembership(userB), seatLimit: 2 }),
      ]);

      const applied = [resultA.applied, resultB.applied];
      expect(applied.filter(Boolean)).toHaveLength(1);
      expect(applied.filter((a) => !a)).toHaveLength(1);

      const finalCount = await repository.countActiveByOrganization(seatLimitOrgId);
      expect(finalCount).toBe(2);
    });
  });
});
