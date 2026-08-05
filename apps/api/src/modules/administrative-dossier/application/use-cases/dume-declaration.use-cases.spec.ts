import { describe, expect, it, vi } from "vitest";
import { CreateDumeDeclarationVersionUseCase, EnsureDumeDeclarationUseCase, GetDumeDeclarationUseCase } from "./dume-declaration.use-cases";
import type { DumeDeclarationRepository, DumeDeclarationVersionRepository } from "../ports/dume-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { DumeDeclaration } from "../../domain/dume-declaration.aggregate";
import { DumeDeclarationVersion } from "../../domain/dume-declaration-version.entity";
import { DumeDeclarationNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  return { generate: () => "dumev-1" };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}

function inMemoryDeclarationRepository(seed: readonly DumeDeclaration[] = []): DumeDeclarationRepository {
  const rows = new Map<string, DumeDeclaration>(seed.map((d) => [d.id, d]));
  return {
    create: async (declaration) => void rows.set(declaration.id, declaration),
    findById: async ({ dumeDeclarationId }) => rows.get(dumeDeclarationId) ?? null,
    findByTenderId: async ({ tenderId }) => [...rows.values()].find((d) => d.tenderId === tenderId) ?? null,
    save: async (declaration) => void rows.set(declaration.id, declaration),
  };
}

function inMemoryVersionRepository(): DumeDeclarationVersionRepository {
  const rows: DumeDeclarationVersion[] = [];
  return {
    create: async (version) => void rows.push(version),
    findById: async ({ versionId }) => rows.find((v) => v.id === versionId) ?? null,
    listByDeclaration: async ({ dumeDeclarationId }) => rows.filter((v) => v.dumeDeclarationId === dumeDeclarationId),
  };
}

describe("EnsureDumeDeclarationUseCase — mission §13", () => {
  it("creates a declaration starting at version 0", async () => {
    const useCase = new EnsureDumeDeclarationUseCase(fakeAccessService(), inMemoryDeclarationRepository(), fakeClock(), fakeIdGenerator());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(summary.currentVersionNumber).toBe(0);
  });
});

describe("CreateDumeDeclarationVersionUseCase", () => {
  it("creates a new immutable version and advances the parent's pointer", async () => {
    const dume = DumeDeclaration.create({ id: "dume-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const declarationRepository = inMemoryDeclarationRepository([dume]);
    const versionRepository = inMemoryVersionRepository();
    const useCase = new CreateDumeDeclarationVersionUseCase(fakeAccessService(), declarationRepository, versionRepository, fakeClock(), fakeIdGenerator());

    const version = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", dumeDeclarationId: "dume-1", data: { legalIdentity: "SIRET 2" } });

    expect(version.version).toBe(1);
    const updated = await declarationRepository.findById({ organizationId: ORGANIZATION_ID, dumeDeclarationId: "dume-1" });
    expect(updated?.currentVersionNumber).toBe(1);
  });

  it("throws DumeDeclarationNotFoundError for an unknown declaration", async () => {
    const useCase = new CreateDumeDeclarationVersionUseCase(fakeAccessService(), inMemoryDeclarationRepository(), inMemoryVersionRepository(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", dumeDeclarationId: "missing", data: {} })).rejects.toBeInstanceOf(DumeDeclarationNotFoundError);
  });
});

describe("GetDumeDeclarationUseCase", () => {
  it("returns null when no declaration exists for the tender", async () => {
    const useCase = new GetDumeDeclarationUseCase(fakeAccessService(), inMemoryDeclarationRepository(), inMemoryVersionRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result).toBeNull();
  });
});
