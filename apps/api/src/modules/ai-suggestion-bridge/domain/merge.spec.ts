import { describe, expect, it } from "vitest";
import { canMergeByShape, mergeValues } from "./merge";

describe("canMergeByShape", () => {
  it("allows two arrays", () => {
    expect(canMergeByShape(["a"], ["b"])).toBe(true);
  });

  it("allows two strings", () => {
    expect(canMergeByShape("a", "b")).toBe(true);
  });

  it("refuses mismatched shapes", () => {
    expect(canMergeByShape(["a"], "b")).toBe(false);
    expect(canMergeByShape("a", ["b"])).toBe(false);
  });

  it("refuses numbers, booleans, dates and null", () => {
    expect(canMergeByShape(1, 2)).toBe(false);
    expect(canMergeByShape(true, false)).toBe(false);
    expect(canMergeByShape(new Date(), new Date())).toBe(false);
    expect(canMergeByShape(null, "b")).toBe(false);
  });
});

describe("mergeValues", () => {
  it("unions two arrays without duplicates", () => {
    expect(mergeValues(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("concatenates two distinct strings", () => {
    expect(mergeValues("Existing note.", "New note.")).toBe("Existing note.\n\nNew note.");
  });

  it("keeps the current string when the proposed one is empty or already a substring", () => {
    expect(mergeValues("Existing note.", "")).toBe("Existing note.");
    expect(mergeValues("Existing note with detail.", "note with detail")).toBe("Existing note with detail.");
  });

  it("returns the proposed string when the current one is empty", () => {
    expect(mergeValues("", "New note.")).toBe("New note.");
  });

  it("throws when called on shapes that were never validated by canMergeByShape", () => {
    expect(() => mergeValues(1, 2)).toThrow();
  });
});
