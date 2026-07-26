import { describe, expect, it } from "vitest";
import { canChangeTenderStatus } from "./tenders-types";

describe("canChangeTenderStatus", () => {
  it("allows roles that hold tender:update on the backend", () => {
    expect(canChangeTenderStatus("ORGANIZATION_ADMIN")).toBe(true);
    expect(canChangeTenderStatus("BID_MANAGER")).toBe(true);
  });

  it("denies read-only and other roles that lack tender:update on the backend", () => {
    expect(canChangeTenderStatus("READ_ONLY")).toBe(false);
    expect(canChangeTenderStatus("REVIEWER")).toBe(false);
    expect(canChangeTenderStatus("CONTRIBUTOR")).toBe(false);
    expect(canChangeTenderStatus(undefined)).toBe(false);
  });
});
