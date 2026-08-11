import { describe, expect, it } from "vitest";
import { SavedSearchNotFoundError } from "./errors";
import { SavedSearch } from "./saved-search.entity";

const NOW = new Date("2026-06-01T00:00:00.000Z");

function buildSearch() {
  return SavedSearch.create({ id: "ss-1", organizationId: "org-1", ownerUserId: "user-1", name: "Nettoyage IDF", createdBy: "user-1", occurredAt: NOW });
}

describe("SavedSearch — mission §15/§16/§17/§115", () => {
  it("BLOQUANT — mission §17/§101/§102: assertOwnedBy throws SavedSearchNotFoundError (anti-enumeration, never a 403) for any user other than the owner", () => {
    const search = buildSearch();
    expect(() => search.assertOwnedBy("user-2")).toThrow(SavedSearchNotFoundError);
    expect(() => search.assertOwnedBy("user-1")).not.toThrow();
  });

  it("is active by default", () => {
    expect(buildSearch().isActive).toBe(true);
  });

  it("mission §115: setActive(false) deactivates without deleting", () => {
    const search = buildSearch();
    search.setActive(false, NOW);
    expect(search.isActive).toBe(false);
    expect(search.deletedAt).toBeUndefined();
  });

  it("mission §114: softDelete sets deletedAt and deactivates", () => {
    const search = buildSearch();
    search.softDelete(NOW);
    expect(search.isActive).toBe(false);
    expect(search.deletedAt).toEqual(NOW);
  });

  it("update() merges criteria field-by-field, preserving unspecified fields", () => {
    const search = buildSearch();
    search.update({ criteria: { includeKeywords: ["nettoyage"] }, occurredAt: NOW });
    expect(search.criteria.includeKeywords).toEqual(["nettoyage"]);
    search.update({ criteria: { cpvCodes: ["90000000"] }, occurredAt: NOW });
    // Mission §116 — modifier un critère ne doit jamais effacer les autres déjà renseignés.
    expect(search.criteria.includeKeywords).toEqual(["nettoyage"]);
    expect(search.criteria.cpvCodes).toEqual(["90000000"]);
  });

  it("defaults to DAILY_DIGEST email frequency (mission §43 recommendation)", () => {
    expect(buildSearch().emailFrequency).toBe("DAILY_DIGEST");
  });
});
