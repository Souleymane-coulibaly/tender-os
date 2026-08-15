import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../domain/email-address.value-object";
import { UserId } from "../../domain/user-id.value-object";
import { User } from "../../domain/user.aggregate";
import { UserStatus } from "../../domain/user-status";
import { InMemoryUserRepository } from "../../test-support/in-memory-user.repository";
import { ListUsersUseCase } from "./list-users.use-case";

describe("ListUsersUseCase", () => {
  let userRepository: InMemoryUserRepository;
  let useCase: ListUsersUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    useCase = new ListUsersUseCase(userRepository);
  });

  it("lists every user", async () => {
    await userRepository.seed(
      User.register({
        id: UserId.from("user-1"),
        email: EmailAddress.create("ada@example.com"),
        displayName: "Ada",
        passwordHash: "hashed:whatever",
        termsVersion: "2026-08-15",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );

    const result = await useCase.execute({ limit: 25 });

    expect(result.items).toHaveLength(1);
  });

  it("filters by status", async () => {
    const suspended = User.rehydrate({
      id: UserId.from("user-2"),
      email: EmailAddress.create("suspended@example.com"),
      displayName: "Suspended User",
      status: UserStatus.Suspended,
      passwordHash: "hashed:whatever",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    await userRepository.seed(suspended);
    await userRepository.seed(
      User.register({
        id: UserId.from("user-1"),
        email: EmailAddress.create("ada@example.com"),
        displayName: "Ada",
        passwordHash: "hashed:whatever",
        termsVersion: "2026-08-15",
        occurredAt: new Date("2026-01-01T00:00:00Z"),
      }),
    );

    const result = await useCase.execute({ limit: 25, status: UserStatus.Suspended });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.id).toBe("user-2");
  });
});
