import { beforeEach, describe, expect, it } from "vitest";
import { EmailAlreadyRegisteredError, InvalidEmailAddressError } from "../../domain/errors";
import { EmailAddress } from "../../domain/email-address.value-object";
import { UserId } from "../../domain/user-id.value-object";
import { User } from "../../domain/user.aggregate";
import { InMemoryUserRepository } from "../../test-support/in-memory-user.repository";
import { FakePasswordHasher, FixedClock, SequentialIdGenerator } from "../../test-support/fakes";
import { RegisterUserUseCase } from "./register-user.use-case";

function createUseCase(userRepository: InMemoryUserRepository): RegisterUserUseCase {
  return new RegisterUserUseCase(
    userRepository,
    new FakePasswordHasher(),
    new FixedClock(),
    new SequentialIdGenerator(),
  );
}

describe("RegisterUserUseCase", () => {
  let userRepository: InMemoryUserRepository;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
  });

  it("registers a new active user", async () => {
    const useCase = createUseCase(userRepository);

    const result = await useCase.execute({
      email: "Ada@Example.com",
      password: "correct-horse-battery-staple",
      displayName: "Ada Lovelace",
    });

    expect(result.email).toBe("ada@example.com");
    expect(result.status).toBe("ACTIVE");
    expect(userRepository.savedIds).toHaveLength(1);
  });

  it("refuses to register the same email address twice", async () => {
    const useCase = createUseCase(userRepository);
    const existing = User.register({
      id: UserId.from("existing-user"),
      email: EmailAddress.create("ada@example.com"),
      displayName: "Ada Lovelace",
      passwordHash: "hashed:whatever",
      occurredAt: new Date(),
    });
    await userRepository.seed(existing);

    await expect(
      useCase.execute({
        email: "ADA@EXAMPLE.COM",
        password: "another-password",
        displayName: "Someone else",
      }),
    ).rejects.toThrow(EmailAlreadyRegisteredError);
  });

  it("refuses an invalid email address before touching the repository", async () => {
    const useCase = createUseCase(userRepository);

    await expect(
      useCase.execute({
        email: "not-an-email",
        password: "correct-horse-battery-staple",
        displayName: "Ada Lovelace",
      }),
    ).rejects.toThrow(InvalidEmailAddressError);

    expect(userRepository.savedIds).toHaveLength(0);
  });
});
