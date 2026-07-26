import { describe, expect, it } from "vitest";
import { Session } from "./session.entity";

const ISSUED_AT = new Date("2026-07-25T14:00:00Z");

describe("Session.issue", () => {
  it("computes expiresAt from the issuance time and the TTL", () => {
    const session = Session.issue({
      id: "session-1",
      userId: "user-1",
      issuedAt: ISSUED_AT,
      ttlSeconds: 3_600,
    });

    expect(session.expiresAt).toEqual(new Date("2026-07-25T15:00:00Z"));
  });
});

describe("Session.isValid", () => {
  it("is valid before expiration", () => {
    const session = Session.issue({
      id: "session-1",
      userId: "user-1",
      issuedAt: ISSUED_AT,
      ttlSeconds: 3_600,
    });

    expect(session.isValid(new Date("2026-07-25T14:30:00Z"))).toBe(true);
  });

  it("is invalid after expiration", () => {
    const session = Session.issue({
      id: "session-1",
      userId: "user-1",
      issuedAt: ISSUED_AT,
      ttlSeconds: 3_600,
    });

    expect(session.isValid(new Date("2026-07-25T16:00:00Z"))).toBe(false);
  });

  it("is invalid once revoked, even before expiration", () => {
    const session = Session.issue({
      id: "session-1",
      userId: "user-1",
      issuedAt: ISSUED_AT,
      ttlSeconds: 3_600,
    });

    session.revoke(new Date("2026-07-25T14:15:00Z"));

    expect(session.isValid(new Date("2026-07-25T14:20:00Z"))).toBe(false);
  });
});
