import { describe, expect, it, vi } from "vitest";
import { CreateDocumentThemeUseCase } from "./create-document-theme.use-case";
import type { DocumentThemeRepository } from "../ports/document-theme.repository";
import { SystemScopeNotTenantCreatableError } from "../../domain/errors";
import { ScopeLevel } from "../../domain/scope-level";

const NOW = new Date("2026-09-06T10:00:00.000Z");

function fakeRepository(): DocumentThemeRepository {
  return {
    createWithFirstVersion: vi.fn(async () => undefined),
    findById: async () => null,
    list: async () => [],
    createVersion: async () => undefined,
    findVersionById: async () => null,
    listVersions: async () => [],
    activateAtomically: async () => {
      throw new Error("not used");
    },
    findActiveVersionForScope: async () => null,
  };
}

const baseCommand = { organizationId: "org-1", actorRole: "OWNER", createdBy: "user-1", name: "Thème", config: {} };

/** Correctif audit Codex P1-004 — même garde que pour les templates. */
describe("CreateDocumentThemeUseCase (mission P1-004 — garde contre le palier système)", () => {
  it("refuse la création d'un thème TENDEROS, même pour un OWNER", async () => {
    const repository = fakeRepository();
    const useCase = new CreateDocumentThemeUseCase(repository, { now: () => NOW }, { generate: () => "id-1" });

    await expect(useCase.execute({ ...baseCommand, scopeLevel: ScopeLevel.TenderOS })).rejects.toBeInstanceOf(SystemScopeNotTenantCreatableError);
    expect(repository.createWithFirstVersion).not.toHaveBeenCalled();
  });

  it("accepte toujours ORGANIZATION (comportement inchangé)", async () => {
    const repository = fakeRepository();
    const useCase = new CreateDocumentThemeUseCase(repository, { now: () => NOW }, { generate: () => "id-1" });

    await expect(useCase.execute({ ...baseCommand, scopeLevel: ScopeLevel.Organization })).resolves.toBeDefined();
    expect(repository.createWithFirstVersion).toHaveBeenCalled();
  });
});
