import { describe, expect, it } from "vitest";
import { resolveResponsePackageRequirements } from "./resolve-response-package-requirements";

function pkg(id: string, lotId: string | undefined) {
  return { id, lotId, currentVersionId: undefined, status: "DRAFT" };
}

describe("resolveResponsePackageRequirements", () => {
  it("mission §5/§18 — GLOBAL mode when no lot-scoped package exists for any required lot", () => {
    const result = resolveResponsePackageRequirements({
      requiredLotIds: ["lot-a", "lot-b"],
      packages: [pkg("pkg-1", undefined)],
    });
    expect(result).toEqual([{ lotId: undefined, matchingPackages: [pkg("pkg-1", undefined)] }]);
  });

  it("mission §5 — GLOBAL mode for a Tender with zero lots at all (requiredLotIds empty)", () => {
    const result = resolveResponsePackageRequirements({ requiredLotIds: [], packages: [pkg("pkg-1", undefined)] });
    expect(result).toEqual([{ lotId: undefined, matchingPackages: [pkg("pkg-1", undefined)] }]);
  });

  it("mission §12/§13 — LOT mode, one requirement per required lot, when a lot-scoped package exists for a required lot", () => {
    const result = resolveResponsePackageRequirements({
      requiredLotIds: ["lot-a", "lot-b"],
      packages: [pkg("pkg-a", "lot-a"), pkg("pkg-b", "lot-b")],
    });
    expect(result).toEqual([
      { lotId: "lot-a", matchingPackages: [pkg("pkg-a", "lot-a")] },
      { lotId: "lot-b", matchingPackages: [pkg("pkg-b", "lot-b")] },
    ]);
  });

  it("mission §14/§16 — a lot-scoped package for a NON-required lot never triggers LOT mode and never appears in any requirement", () => {
    const result = resolveResponsePackageRequirements({
      requiredLotIds: ["lot-a"],
      packages: [pkg("pkg-global", undefined), pkg("pkg-c-abandoned", "lot-c")],
    });
    // lot-c is not required, so its package is invisible to mode detection — falls back to GLOBAL.
    expect(result).toEqual([{ lotId: undefined, matchingPackages: [pkg("pkg-global", undefined)] }]);
  });

  it("mission §13 — a required lot with zero matching packages still gets its own (empty) requirement entry in LOT mode", () => {
    const result = resolveResponsePackageRequirements({
      requiredLotIds: ["lot-a", "lot-b"],
      packages: [pkg("pkg-a", "lot-a")],
    });
    expect(result).toEqual([
      { lotId: "lot-a", matchingPackages: [pkg("pkg-a", "lot-a")] },
      { lotId: "lot-b", matchingPackages: [] },
    ]);
  });

  it("mission §6 — mixed state: a global package coexisting with the real per-lot packages is ignored once LOT mode is detected", () => {
    const result = resolveResponsePackageRequirements({
      requiredLotIds: ["lot-a"],
      packages: [pkg("pkg-global-leftover", undefined), pkg("pkg-a", "lot-a")],
    });
    expect(result).toEqual([{ lotId: "lot-a", matchingPackages: [pkg("pkg-a", "lot-a")] }]);
  });
});
