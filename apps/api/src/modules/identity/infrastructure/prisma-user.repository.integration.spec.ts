import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../../../shared-kernel/prisma.service";
import { EmailAddress } from "../domain/email-address.value-object";
import { User } from "../domain/user.aggregate";
import { UserId } from "../domain/user-id.value-object";
import { PrismaUserRepository } from "./prisma-user.repository";

describe("PrismaUserRepository (PostgreSQL)", () => {
  const prisma = new PrismaService();
  const repository = new PrismaUserRepository(prisma);
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  function registerUser(email: string): User {
    const id = UserId.from(randomUUID());
    createdUserIds.push(id.value);

    return User.register({
      id,
      email: EmailAddress.create(email),
      displayName: "Ada Lovelace",
      passwordHash: "hashed:whatever",
      termsVersion: "2026-08-15",
      occurredAt: new Date(),
    });
  }

  it("persists a new user and reads it back by id", async () => {
    const user = registerUser(`ada-${randomUUID()}@example.com`);

    await repository.save(user);
    const found = await repository.findById(user.id);

    expect(found).not.toBeNull();
    expect(found?.email.value).toBe(user.email.value);
    expect(found?.status).toBe("ACTIVE");
  });

  it("finds a user by email", async () => {
    const email = `ada-${randomUUID()}@example.com`;
    const user = registerUser(email);
    await repository.save(user);

    const found = await repository.findByEmail(EmailAddress.create(email));

    expect(found?.id.value).toBe(user.id.value);
  });

  it("returns null when no user matches", async () => {
    const found = await repository.findById(UserId.from(randomUUID()));

    expect(found).toBeNull();
  });

  it("persists updates made to an already-saved user", async () => {
    const user = registerUser(`ada-${randomUUID()}@example.com`);
    await repository.save(user);

    user.recordLogin(new Date());
    await repository.save(user);

    const found = await repository.findById(user.id);
    expect(found?.lastLoginAt).toBeInstanceOf(Date);
  });
});
