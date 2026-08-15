import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { EmailAddress } from "../domain/email-address.value-object";
import { Session } from "../domain/session.entity";
import { User } from "../domain/user.aggregate";
import { UserId } from "../domain/user-id.value-object";
import { PrismaSessionRepository } from "./prisma-session.repository";
import { PrismaUserRepository } from "./prisma-user.repository";

describe("PrismaSessionRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const sessionRepository = new PrismaSessionRepository(prisma);
  const userRepository = new PrismaUserRepository(prisma);
  const createdUserIds: string[] = [];
  const createdSessionIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdSessionIds.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: createdSessionIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedUser(): Promise<UserId> {
    const id = UserId.from(randomUUID());
    createdUserIds.push(id.value);

    const user = User.register({
      id,
      email: EmailAddress.create(`ada-${randomUUID()}@example.com`),
      displayName: "Ada Lovelace",
      passwordHash: "hashed:whatever",
      termsVersion: "2026-08-15",
      occurredAt: new Date(),
    });
    await userRepository.save(user);

    return id;
  }

  it("persists a new session and reads it back by id", async () => {
    const userId = await seedUser();
    const sessionId = randomUUID();
    createdSessionIds.push(sessionId);

    const session = Session.issue({
      id: sessionId,
      userId: userId.value,
      issuedAt: new Date(),
      ttlSeconds: 3_600,
    });

    await sessionRepository.save(session);
    const found = await sessionRepository.findById(sessionId);

    expect(found).not.toBeNull();
    expect(found?.userId).toBe(userId.value);
    expect(found?.isValid(new Date())).toBe(true);
  });

  it("persists a session revocation", async () => {
    const userId = await seedUser();
    const sessionId = randomUUID();
    createdSessionIds.push(sessionId);

    const session = Session.issue({
      id: sessionId,
      userId: userId.value,
      issuedAt: new Date(),
      ttlSeconds: 3_600,
    });
    await sessionRepository.save(session);

    session.revoke(new Date());
    await sessionRepository.save(session);

    const found = await sessionRepository.findById(sessionId);
    expect(found?.revokedAt).toBeInstanceOf(Date);
    expect(found?.isValid(new Date())).toBe(false);
  });

  it("returns null when no session matches", async () => {
    const found = await sessionRepository.findById(randomUUID());

    expect(found).toBeNull();
  });
});
