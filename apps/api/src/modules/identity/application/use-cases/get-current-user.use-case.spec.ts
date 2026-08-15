import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../domain/email-address.value-object";
import { UserNotFoundError } from "../../domain/errors";
import { UserId } from "../../domain/user-id.value-object";
import { User } from "../../domain/user.aggregate";
import { InMemoryUserRepository } from "../../test-support/in-memory-user.repository";
import { GetCurrentUserUseCase } from "./get-current-user.use-case";

describe("GetCurrentUserUseCase", () => {
  let userRepository: InMemoryUserRepository;
  let useCase: GetCurrentUserUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    useCase = new GetCurrentUserUseCase(userRepository);
  });

  it("returns the current user's profile", async () => {
    const user = User.register({
      id: UserId.from("user-1"),
      email: EmailAddress.create("ada@example.com"),
      displayName: "Ada Lovelace",
      passwordHash: "hashed:whatever",
      termsVersion: "2026-08-15",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });
    await userRepository.seed(user);

    const result = await useCase.execute({ userId: "user-1" });

    expect(result.email).toBe("ada@example.com");
    expect(result).not.toHaveProperty("passwordHash");
  });

  it("throws when the user cannot be found", async () => {
    await expect(useCase.execute({ userId: "missing-user" })).rejects.toThrow(UserNotFoundError);
  });
});
