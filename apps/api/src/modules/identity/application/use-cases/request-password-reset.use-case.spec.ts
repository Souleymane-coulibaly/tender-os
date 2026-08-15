import { beforeEach, describe, expect, it } from "vitest";
import type { EmailMessage, EmailProvider } from "../../../../shared-kernel/email-provider";
import { EmailAddress } from "../../domain/email-address.value-object";
import { UserId } from "../../domain/user-id.value-object";
import { User } from "../../domain/user.aggregate";
import { UserStatus } from "../../domain/user-status";
import { InMemoryPasswordResetTokenRepository } from "../../test-support/in-memory-password-reset-token.repository";
import { InMemoryUserRepository } from "../../test-support/in-memory-user.repository";
import { FixedClock, SequentialIdGenerator } from "../../test-support/fakes";
import { RequestPasswordResetUseCase } from "./request-password-reset.use-case";

class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

function activeUser(): User {
  return User.register({
    id: UserId.from("user-1"),
    email: EmailAddress.create("ada@example.com"),
    displayName: "Ada Lovelace",
    passwordHash: "hashed:whatever",
    termsVersion: "2026-08-15",
    occurredAt: new Date("2026-01-01T00:00:00Z"),
  });
}

describe("RequestPasswordResetUseCase", () => {
  let userRepository: InMemoryUserRepository;
  let passwordResetTokenRepository: InMemoryPasswordResetTokenRepository;
  let emailProvider: FakeEmailProvider;
  let useCase: RequestPasswordResetUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    passwordResetTokenRepository = new InMemoryPasswordResetTokenRepository();
    emailProvider = new FakeEmailProvider();
    useCase = new RequestPasswordResetUseCase(
      userRepository,
      passwordResetTokenRepository,
      emailProvider,
      new FixedClock(),
      new SequentialIdGenerator(),
    );
  });

  it("issues a token and emails a reset link for a known active user", async () => {
    await userRepository.seed(activeUser());

    await useCase.execute({ email: "Ada@Example.com" });

    expect(passwordResetTokenRepository.savedIds).toHaveLength(1);
    expect(emailProvider.sent).toHaveLength(1);
    expect(emailProvider.sent[0]?.to).toBe("ada@example.com");
    expect(emailProvider.sent[0]?.html).toContain("/app/reset-password?token=");
  });

  it("resolves silently for an unknown email — anti-enumeration", async () => {
    await expect(useCase.execute({ email: "unknown@example.com" })).resolves.toBeUndefined();

    expect(emailProvider.sent).toHaveLength(0);
    expect(passwordResetTokenRepository.savedIds).toHaveLength(0);
  });

  it("resolves silently for a syntactically invalid email — anti-enumeration", async () => {
    await expect(useCase.execute({ email: "not-an-email" })).resolves.toBeUndefined();

    expect(emailProvider.sent).toHaveLength(0);
  });

  it("resolves silently for a non-ACTIVE user (e.g. SUSPENDED) — anti-enumeration", async () => {
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

    await useCase.execute({ email: "suspended@example.com" });

    expect(emailProvider.sent).toHaveLength(0);
  });

  it("invalidates a previous outstanding token when a new one is requested (single valid link at a time)", async () => {
    await userRepository.seed(activeUser());

    await useCase.execute({ email: "ada@example.com" });
    await useCase.execute({ email: "ada@example.com" });

    const tokens = passwordResetTokenRepository.allTokens;
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.usedAt === undefined)).toHaveLength(1);
  });
});
