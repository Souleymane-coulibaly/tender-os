import { describe, expect, it } from "vitest";
import { InvalidEmailAddressError } from "./errors";
import { EmailAddress } from "./email-address.value-object";

describe("EmailAddress.create", () => {
  it("normalizes the value to lowercase and trims whitespace", () => {
    const email = EmailAddress.create("  Ada@Example.COM  ");

    expect(email.value).toBe("ada@example.com");
  });

  it("treats two addresses differing only by case as equal", () => {
    const a = EmailAddress.create("ada@example.com");
    const b = EmailAddress.create("ADA@EXAMPLE.COM");

    expect(a.equals(b)).toBe(true);
  });

  it("rejects a value without an @ sign", () => {
    expect(() => EmailAddress.create("not-an-email")).toThrow(InvalidEmailAddressError);
  });

  it("rejects an empty value", () => {
    expect(() => EmailAddress.create("   ")).toThrow(InvalidEmailAddressError);
  });
});
