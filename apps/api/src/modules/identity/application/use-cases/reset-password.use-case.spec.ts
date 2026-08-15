import { beforeEach, describe, expect, it } from "vitest";
import { PasswordResetTokenInvalidError } from "../../domain/errors";
import { PasswordResetToken } from "../../domain/password-reset-token.entity";
import { generatePasswordResetToken } from "../../domain/services/password-reset-token-secret";
import { EmailAddress } from "../../domain/email-address.value-object";
import { Session } from "../../domain/session.entity";
import { UserId } from "../../domain/user-id.value-object";
import { User } from "../../domain/user.aggregate";
import { InMemorySessionRepository } from "../../test-support/in-memory-session.repository";
import { InMemoryPasswordResetTokenRepository } from "../../test-support/in-memory-password-reset-token.repository";
import { InMemoryUserRepository } from "../../test-support/in-memory-user.repository";
import { FakePasswordHasher, FixedClock, FIXED_NOW } from "../../test-support/fakes";
import { ResetPasswordUseCase } from "./reset-password.use-case";

function activeUser(): User {
  return User.register({
    id: UserId.from("user-1"),
    email: EmailAddress.create("ada@example.com"),
    displayName: "Ada Lovelace",
    passwordHash: "hashed:old-password",
    termsVersion: "2026-08-15",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("ResetPasswordUseCase", () => {
  let userRepository: InMemoryUserRepository;
  let sessionRepository: InMemorySessionRepository;
  let passwordResetTokenRepository: InMemoryPasswordResetTokenRepository;
  let useCase: ResetPasswordUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    sessionRepository = new InMemorySessionRepository();
    passwordResetTokenRepository = new InMemoryPasswordResetTokenRepository();
    useCase = new ResetPasswordUseCase(
      userRepository,
      sessionRepository,
      passwordResetTokenRepository,
      new FakePasswordHasher(),
      new FixedClock(),
    );
  });

  async function seedValidToken(): Promise<string> {
    const user = activeUser();
    await userRepository.seed(user);

    const { token, tokenHash } = generatePasswordResetToken();
    const resetToken = PasswordResetToken.issue({
      id: "reset-token-1",
      userId: "user-1",
      tokenHash,
      issuedAt: FIXED_NOW,
    });
    await passwordResetTokenRepository.save(resetToken);

    return token;
  }

  it("resets the password, consumes the token, and revokes existing sessions", async () => {
    const token = await seedValidToken();
    const session = Session.issue({ id: "session-1", userId: "user-1", issuedAt: FIXED_NOW, ttlSeconds: 3600 });
    await sessionRepository.save(session);

    await useCase.execute({ token, newPassword: "new-correct-horse-battery" });

    const user = await userRepository.findById(UserId.from("user-1"));
    expect(user?.passwordHash).toBe("hashed:new-correct-horse-battery");

    const storedSession = await sessionRepository.findById("session-1");
    expect(storedSession?.revokedAt).toEqual(FIXED_NOW);
  });

  it("marks the token as used so it cannot be replayed", async () => {
    const token = await seedValidToken();

    await useCase.execute({ token, newPassword: "new-correct-horse-battery" });

    await expect(useCase.execute({ token, newPassword: "another-password" })).rejects.toThrow(
      PasswordResetTokenInvalidError,
    );
  });

  it("rejects an unknown token — anti-enumeration", async () => {
    await expect(
      useCase.execute({ token: "never-issued-token", newPassword: "new-correct-horse-battery" }),
    ).rejects.toThrow(PasswordResetTokenInvalidError);
  });

  it("rejects an expired token", async () => {
    const user = activeUser();
    await userRepository.seed(user);
    const { token, tokenHash } = generatePasswordResetToken();
    const expiredIssuedAt = new Date(FIXED_NOW.getTime() - 31 * 60 * 1000);
    const resetToken = PasswordResetToken.issue({ id: "reset-token-1", userId: "user-1", tokenHash, issuedAt: expiredIssuedAt });
    await passwordResetTokenRepository.save(resetToken);

    await expect(useCase.execute({ token, newPassword: "new-correct-horse-battery" })).rejects.toThrow(
      PasswordResetTokenInvalidError,
    );
  });
});
