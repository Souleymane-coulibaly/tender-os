import { describe, expect, it } from "vitest";
import { SuspendOrganizationBodySchema } from "./schemas";

describe("SuspendOrganizationBodySchema", () => {
  it("accepts a completely missing body (reason is optional)", () => {
    const result = SuspendOrganizationBodySchema.safeParse(undefined);

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({});
  });

  it("accepts an explicit empty object", () => {
    const result = SuspendOrganizationBodySchema.safeParse({});

    expect(result.success).toBe(true);
  });

  it("accepts a reason", () => {
    const result = SuspendOrganizationBodySchema.safeParse({ reason: "Non-payment" });

    expect(result.success).toBe(true);
    expect(result.success && result.data.reason).toBe("Non-payment");
  });

  it("rejects unknown fields", () => {
    const result = SuspendOrganizationBodySchema.safeParse({ unexpected: "field" });

    expect(result.success).toBe(false);
  });
});
