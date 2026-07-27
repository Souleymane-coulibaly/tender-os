import { describe, expect, it } from "vitest";
import { InvalidDceStatusError } from "./errors";
import { DceStatus, isDceStatus, parseDceStatus } from "./dce-status";

describe("DceStatus", () => {
  it("recognizes DRAFT and IMPORTED as valid", () => {
    expect(isDceStatus(DceStatus.Draft)).toBe(true);
    expect(isDceStatus(DceStatus.Imported)).toBe(true);
  });

  it("rejects statuses reserved for future sprints", () => {
    for (const value of ["IMPORTING", "PROCESSING", "READY_FOR_REVIEW", "VALIDATED", "ARCHIVED", "FAILED"]) {
      expect(isDceStatus(value)).toBe(false);
    }
  });

  it("parses a valid status", () => {
    expect(parseDceStatus("DRAFT")).toBe(DceStatus.Draft);
  });

  it("throws InvalidDceStatusError on an unknown status", () => {
    expect(() => parseDceStatus("BOGUS")).toThrow(InvalidDceStatusError);
  });
});
