import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { PlatformAdministratorId } from "../domain/platform-administrator-id.value-object";
import { PlatformAdministrator } from "../domain/platform-administrator.aggregate";
import { PlatformRole } from "../domain/platform-role";
import { PrismaPlatformAdministratorRepository } from "./prisma-platform-administrator.repository";

describe("PrismaPlatformAdministratorRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaPlatformAdministratorRepository(prisma);
  const createdUserIds: string[] = [];
  const createdAdministratorIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdAdministratorIds.length > 0) {
      await prisma.platformAdministrator.deleteMany({ where: { id: { in: createdAdministratorIds } } });
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
        email: `platform-admin-${userId}@example.com`,
        displayName: "Integration Test Admin",
        status: "ACTIVE",
        passwordHash: "hashed:whatever",
      },
    });
    return userId;
  }

  it("persists a new platform administrator and reads it back by userId", async () => {
    const userId = await seedUser();
    const id = PlatformAdministratorId.from(randomUUID());
    createdAdministratorIds.push(id.value);

    const administrator = PlatformAdministrator.create({ id, userId, role: PlatformRole.Admin, occurredAt: new Date() });
    await repository.save(administrator);

    const found = await repository.findByUserId(userId);

    expect(found?.role).toBe(PlatformRole.Admin);
  });

  it("returns null when the user has no platform administrator record", async () => {
    const userId = await seedUser();

    const found = await repository.findByUserId(userId);

    expect(found).toBeNull();
  });

  it("counts administrators by role", async () => {
    const userId = await seedUser();
    const id = PlatformAdministratorId.from(randomUUID());
    createdAdministratorIds.push(id.value);
    await repository.save(
      PlatformAdministrator.create({ id, userId, role: PlatformRole.Support, occurredAt: new Date() }),
    );

    const counts = await repository.countByRole();

    expect(counts[PlatformRole.Support]).toBeGreaterThanOrEqual(1);
  });
});
