import { beforeEach, describe, expect, it } from "vitest";
import { EmailAddress } from "../../domain/email-address.value-object";
import { InvalidCredentialsError, UserNotActiveError } from "../../domain/errors";
import { UserId } from "../../domain/user-id.value-object";
import { User } from "../../domain/user.aggregate";
import { UserStatus } from "../../domain/user-status";
import { InMemorySessionRepository } from "../../test-support/in-memory-session.repository";
import { InMemoryUserRepository } from "../../test-support/in-memory-user.repository";
import {
  FakeAccessTokenService,
  FakePasswordHasher,
  FixedClock,
  SequentialIdGenerator,
} from "../../test-support/fakes";
import { AuthenticateUserUseCase } from "./authenticate-user.use-case";

const PASSWORD = "correct-horse-battery-staple";

async function seedActiveUser(userRepository: InMemoryUserRepository): Promise<void> {
  const hasher = new FakePasswordHasher();
  const user = User.register({
    id: UserId.from("user-1"),
    email: EmailAddress.create("ada@example.com"),
    displayName: "Ada Lovelace",
    passwordHash: await hasher.hash(PASSWORD),
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
  await userRepository.seed(user);
}

async function seedSuspendedUser(userRepository: InMemoryUserRepository): Promise<void> {
  const hasher = new FakePasswordHasher();
  const user = User.rehydrate({
    id: UserId.from("user-2"),
    email: EmailAddress.create("suspended@example.com"),
    displayName: "Suspended User",
    status: UserStatus.Suspended,
    passwordHash: await hasher.hash(PASSWORD),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  });
  await userRepository.seed(user);
}

function createUseCase(
  userRepository: InMemoryUserRepository,
  sessionRepository: InMemorySessionRepository,
): AuthenticateUserUseCase {
  return new AuthenticateUserUseCase(
    userRepository,
    sessionRepository,
    new FakePasswordHasher(),
    new FakeAccessTokenService(),
    new FixedClock(),
    new SequentialIdGenerator(),
  );
}

describe("AuthenticateUserUseCase", () => {
  let userRepository: InMemoryUserRepository;
  let sessionRepository: InMemorySessionRepository;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    sessionRepository = new InMemorySessionRepository();
  });

  it("authenticates a user with valid credentials and issues a session", async () => {
    await seedActiveUser(userRepository);
    const useCase = createUseCase(userRepository, sessionRepository);

    const result = await useCase.execute({ email: "ada@example.com", password: PASSWORD });

    expect(result.accessToken).toBeTruthy();
    expect(result.user.email).toBe("ada@example.com");
    expect(sessionRepository.savedIds).toHaveLength(1);
  });

  it("records the login timestamp on the user", async () => {
    await seedActiveUser(userRepository);
    const useCase = createUseCase(userRepository, sessionRepository);

    await useCase.execute({ email: "ada@example.com", password: PASSWORD });

    const stored = await userRepository.findById(UserId.from("user-1"));
    expect(stored?.lastLoginAt).toBeDefined();
  });

  it("refuses an unknown email without revealing whether the account exists", async () => {
    const useCase = createUseCase(userRepository, sessionRepository);

    await expect(
      useCase.execute({ email: "unknown@example.com", password: PASSWORD }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("refuses an incorrect password", async () => {
    await seedActiveUser(userRepository);
    const useCase = createUseCase(userRepository, sessionRepository);

    await expect(
      useCase.execute({ email: "ada@example.com", password: "wrong-password" }),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it("refuses a suspended account even with correct credentials", async () => {
    await seedSuspendedUser(userRepository);
    const useCase = createUseCase(userRepository, sessionRepository);

    await expect(
      useCase.execute({ email: "suspended@example.com", password: PASSWORD }),
    ).rejects.toThrow(UserNotActiveError);

    expect(sessionRepository.savedIds).toHaveLength(0);
  });
});
