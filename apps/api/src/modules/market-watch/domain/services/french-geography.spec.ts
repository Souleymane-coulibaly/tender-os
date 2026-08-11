import { describe, expect, it } from "vitest";
import { resolveFrenchRegionFromDepartment } from "./french-geography";

describe("french-geography", () => {
  it("resolves Paris (75) to Île-de-France", () => {
    expect(resolveFrenchRegionFromDepartment("75")).toBe("Île-de-France");
  });

  it("resolves an overseas department", () => {
    expect(resolveFrenchRegionFromDepartment("974")).toBe("La Réunion");
  });

  it("returns undefined for an unknown code (never a guessed region)", () => {
    expect(resolveFrenchRegionFromDepartment("999")).toBeUndefined();
  });

  it("returns undefined for an undefined input", () => {
    expect(resolveFrenchRegionFromDepartment(undefined)).toBeUndefined();
  });
});
