import { beforeEach, describe, expect, it } from "vitest";
import { Session } from "../../domain/session.entity";
import { InMemorySessionRepository } from "../../test-support/in-memory-session.repository";
import { FixedClock } from "../../test-support/fakes";
import { LogoutUserUseCase } from "./logout-user.use-case";

describe("LogoutUserUseCase", () => {
  let sessionRepository: InMemorySessionRepository;
  let useCase: LogoutUserUseCase;

  beforeEach(() => {
    sessionRepository = new InMemorySessionRepository();
    useCase = new LogoutUserUseCase(sessionRepository, new FixedClock());
  });

  it("revokes an existing session", async () => {
    const session = Session.issue({
      id: "session-1",
      userId: "user-1",
      issuedAt: new Date("2026-07-25T13:00:00Z"),
      ttlSeconds: 3_600,
    });
    await sessionRepository.save(session);

    await useCase.execute({ sessionId: "session-1" });

    const stored = await sessionRepository.findById("session-1");
    expect(stored?.revokedAt).toBeDefined();
    expect(stored?.isValid(new Date("2026-07-25T13:30:00Z"))).toBe(false);
  });

  it("is idempotent when the session does not exist", async () => {
    await expect(useCase.execute({ sessionId: "unknown-session" })).resolves.toBeUndefined();
  });
});
