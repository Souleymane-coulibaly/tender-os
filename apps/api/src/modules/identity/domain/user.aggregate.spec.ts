import { describe, expect, it } from "vitest";
import { UserNotActiveError } from "./errors";
import { EmailAddress } from "./email-address.value-object";
import { UserId } from "./user-id.value-object";
import { User } from "./user.aggregate";
import { UserStatus } from "./user-status";

const FIXED_NOW = new Date("2026-07-25T14:00:00Z");

function registerUser(status: UserStatus = UserStatus.Active): User {
  const user = User.register({
    id: UserId.from("user-1"),
    email: EmailAddress.create("Ada@Example.com"),
    displayName: "Ada Lovelace",
    passwordHash: "hashed:password",
    occurredAt: FIXED_NOW,
  });

  if (status !== UserStatus.Active) {
    return User.rehydrate({
      id: UserId.from("user-1"),
      email: EmailAddress.create("ada@example.com"),
      displayName: "Ada Lovelace",
      status,
      passwordHash: "hashed:password",
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    });
  }

  return user;
}

describe("User.register", () => {
  it("creates an ACTIVE user with the normalized email", () => {
    const user = registerUser();

    expect(user.status).toBe(UserStatus.Active);
    expect(user.email.value).toBe("ada@example.com");
    expect(user.lastLoginAt).toBeUndefined();
  });
});

describe("User.recordLogin", () => {
  it("records the login timestamp for an active user", () => {
    const user = registerUser();
    const loginAt = new Date("2026-07-25T15:00:00Z");

    user.recordLogin(loginAt);

    expect(user.lastLoginAt).toEqual(loginAt);
    expect(user.updatedAt).toEqual(loginAt);
  });

  it("rejects a login attempt for a suspended user", () => {
    const user = registerUser(UserStatus.Suspended);

    expect(() => user.recordLogin(FIXED_NOW)).toThrow(UserNotActiveError);
  });

  it("rejects a login attempt for a deactivated user", () => {
    const user = registerUser(UserStatus.Deactivated);

    expect(() => user.recordLogin(FIXED_NOW)).toThrow(UserNotActiveError);
  });

  it("rejects a login attempt for a user who never activated their account", () => {
    const user = registerUser(UserStatus.Invited);

    expect(() => user.recordLogin(FIXED_NOW)).toThrow(UserNotActiveError);
  });
});
