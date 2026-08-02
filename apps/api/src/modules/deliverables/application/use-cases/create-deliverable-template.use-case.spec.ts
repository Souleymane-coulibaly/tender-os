import { describe, expect, it, vi } from "vitest";
import { CreateDeliverableTemplateUseCase } from "./create-deliverable-template.use-case";
import type { DeliverableTemplateRepository } from "../ports/deliverable-template.repository";
import { DeliverableType } from "../../domain/deliverable-type";
import { SystemScopeNotTenantCreatableError } from "../../domain/errors";
import { ScopeLevel } from "../../domain/scope-level";

const NOW = new Date("2026-09-06T10:00:00.000Z");

function fakeRepository(): DeliverableTemplateRepository {
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

const baseCommand = {
  organizationId: "org-1",
  actorRole: "OWNER",
  createdBy: "user-1",
  documentType: DeliverableType.TechnicalMemo,
  name: "Modèle",
  sections: [{ code: "INTRO", title: "Introduction", order: 0, headingLevel: 1 }],
};

/** Correctif audit Codex P1-004 — TENDEROS est une ressource système : même un OWNER/
 *  ORGANIZATION_ADMIN ne peut jamais en créer une via l'API tenant. */
describe("CreateDeliverableTemplateUseCase (mission P1-004 — garde contre le palier système)", () => {
  it("refuse la création d'un template TENDEROS, même pour un OWNER", async () => {
    const repository = fakeRepository();
    const useCase = new CreateDeliverableTemplateUseCase(repository, { now: () => NOW }, { generate: () => "id-1" });

    await expect(useCase.execute({ ...baseCommand, scopeLevel: ScopeLevel.TenderOS })).rejects.toBeInstanceOf(SystemScopeNotTenantCreatableError);
    expect(repository.createWithFirstVersion).not.toHaveBeenCalled();
  });

  it("accepte toujours ORGANIZATION (comportement inchangé)", async () => {
    const repository = fakeRepository();
    const useCase = new CreateDeliverableTemplateUseCase(repository, { now: () => NOW }, { generate: () => "id-1" });

    await expect(useCase.execute({ ...baseCommand, scopeLevel: ScopeLevel.Organization })).resolves.toBeDefined();
    expect(repository.createWithFirstVersion).toHaveBeenCalled();
  });
});
