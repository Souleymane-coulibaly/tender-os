import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { EmailAddress } from "../domain/email-address.value-object";
import { User } from "../domain/user.aggregate";
import { UserId } from "../domain/user-id.value-object";
import { PrismaPageGuideStateRepository } from "./prisma-page-guide-state.repository";
import { PrismaUserRepository } from "./prisma-user.repository";

describe("PrismaPageGuideStateRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaPageGuideStateRepository(prisma);
  const userRepository = new PrismaUserRepository(prisma);
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      // ON DELETE CASCADE : les états de guide disparaissent avec leur utilisateur.
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedUser(): Promise<string> {
    const id = UserId.from(randomUUID());
    createdUserIds.push(id.value);
    await userRepository.save(
      User.register({
        id,
        email: EmailAddress.create(`page-guides-${randomUUID()}@example.com`),
        displayName: "Ada Lovelace",
        passwordHash: "hashed:whatever",
        termsVersion: "2026-08-15",
        occurredAt: new Date(),
      }),
    );

    return id.value;
  }

  const T1 = new Date("2026-07-25T14:00:00.000Z");
  const T2 = new Date("2026-07-25T15:30:00.000Z");

  it("creates on first action, then only writes the action's own column", async () => {
    const userId = await seedUser();

    const created = await repository.apply({ id: randomUUID(), userId, guideKey: "tenders", changes: { dismissedAt: T1 }, occurredAt: T1 });
    expect(created.dismissedAt).toEqual(T1);
    expect(created.completedAt).toBeUndefined();

    const updated = await repository.apply({ id: randomUUID(), userId, guideKey: "tenders", changes: { completedAt: T2 }, occurredAt: T2 });
    expect(updated.id).toBe(created.id);
    expect(updated.dismissedAt).toEqual(T1);
    expect(updated.completedAt).toEqual(T2);
    expect(updated.updatedAt).toEqual(T2);
    expect(await prisma.userPageGuideState.count({ where: { userId } })).toBe(1);
  });

  it("lists only the given user's rows, ordered by guide key", async () => {
    const userA = await seedUser();
    const userB = await seedUser();
    await repository.apply({ id: randomUUID(), userId: userA, guideKey: "tenders", changes: { completedAt: T1 }, occurredAt: T1 });
    await repository.apply({ id: randomUUID(), userId: userA, guideKey: "dashboard", changes: { completedAt: T1 }, occurredAt: T1 });
    await repository.apply({ id: randomUUID(), userId: userB, guideKey: "documents", changes: { dismissedAt: T1 }, occurredAt: T1 });

    expect((await repository.listByUser(userA)).map((state) => state.guideKey)).toEqual(["dashboard", "tenders"]);
    expect((await repository.listByUser(userB)).map((state) => state.guideKey)).toEqual(["documents"]);
  });

  it("concurrent first actions on the same key converge on a single row with both dates", async () => {
    const userId = await seedUser();

    await Promise.all([
      repository.apply({ id: randomUUID(), userId, guideKey: "race", changes: { completedAt: T1 }, occurredAt: T1 }),
      repository.apply({ id: randomUUID(), userId, guideKey: "race", changes: { dismissedAt: T2 }, occurredAt: T2 }),
      repository.apply({ id: randomUUID(), userId, guideKey: "race", changes: { completedAt: T1 }, occurredAt: T1 }),
      repository.apply({ id: randomUUID(), userId, guideKey: "race", changes: { dismissedAt: T2 }, occurredAt: T2 }),
    ]);

    const [state, ...rest] = await repository.listByUser(userId);
    expect(rest).toEqual([]);
    expect(state?.completedAt).toEqual(T1);
    expect(state?.dismissedAt).toEqual(T2);
  });

  it("deleting the user cascades to their page guide states", async () => {
    const userId = await seedUser();
    await repository.apply({ id: randomUUID(), userId, guideKey: "tenders", changes: { completedAt: T1 }, occurredAt: T1 });

    await prisma.user.delete({ where: { id: userId } });

    expect(await prisma.userPageGuideState.count({ where: { userId } })).toBe(0);
  });
});
