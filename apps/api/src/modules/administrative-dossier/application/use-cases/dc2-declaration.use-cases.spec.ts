import { describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../../billing";
import { CreateDc2DeclarationVersionUseCase, EnsureDc2DeclarationUseCase, GetDc2DeclarationUseCase } from "./dc2-declaration.use-cases";
import type { Dc2DeclarationRepository, Dc2DeclarationVersionRepository } from "../ports/dc2-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { Dc2Declaration } from "../../domain/dc2-declaration.aggregate";
import { Dc2DeclarationVersion } from "../../domain/dc2-declaration-version.entity";
import { Dc2DeclarationNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  return { generate: () => "dc2v-1" };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}
function fakeEntitlementService(): EntitlementService {
  return {
    canOperateOnTender: vi.fn(async () => true),
    runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => operation()),
  } as unknown as EntitlementService;
}

function inMemoryDeclarationRepository(seed: readonly Dc2Declaration[] = []): Dc2DeclarationRepository {
  const rows = new Map<string, Dc2Declaration>(seed.map((d) => [d.id, d]));
  return {
    create: async (declaration) => void rows.set(declaration.id, declaration),
    findById: async ({ dc2DeclarationId }) => rows.get(dc2DeclarationId) ?? null,
    findByTenderId: async ({ tenderId }) => [...rows.values()].find((d) => d.tenderId === tenderId) ?? null,
    save: async (declaration) => void rows.set(declaration.id, declaration),
  };
}

function inMemoryVersionRepository(): Dc2DeclarationVersionRepository {
  const rows: Dc2DeclarationVersion[] = [];
  return {
    create: async (version) => void rows.push(version),
    findById: async ({ versionId }) => rows.find((v) => v.id === versionId) ?? null,
    listByDeclaration: async ({ dc2DeclarationId }) => rows.filter((v) => v.dc2DeclarationId === dc2DeclarationId),
  };
}

describe("EnsureDc2DeclarationUseCase — mission §11 'une déclaration DC2 par Tender'", () => {
  it("creates a declaration starting at version 0", async () => {
    const useCase = new EnsureDc2DeclarationUseCase(fakeAccessService(), inMemoryDeclarationRepository(), fakeClock(), fakeIdGenerator(), fakeEntitlementService());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(summary.currentVersionNumber).toBe(0);
  });
});

describe("CreateDc2DeclarationVersionUseCase — mission §11 'reproductibilité'", () => {
  it("creates a new immutable version and advances the parent's pointer", async () => {
    const dc2 = Dc2Declaration.create({ id: "dc2-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const declarationRepository = inMemoryDeclarationRepository([dc2]);
    const versionRepository = inMemoryVersionRepository();
    const useCase = new CreateDc2DeclarationVersionUseCase(fakeAccessService(), declarationRepository, versionRepository, fakeClock(), fakeIdGenerator());

    const version = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", dc2DeclarationId: "dc2-1", data: { legalIdentity: "SIRET 1" } });

    expect(version.version).toBe(1);
    const updated = await declarationRepository.findById({ organizationId: ORGANIZATION_ID, dc2DeclarationId: "dc2-1" });
    expect(updated?.currentVersionNumber).toBe(1);
  });

  it("throws Dc2DeclarationNotFoundError for an unknown declaration", async () => {
    const useCase = new CreateDc2DeclarationVersionUseCase(fakeAccessService(), inMemoryDeclarationRepository(), inMemoryVersionRepository(), fakeClock(), fakeIdGenerator());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", dc2DeclarationId: "missing", data: {} })).rejects.toBeInstanceOf(Dc2DeclarationNotFoundError);
  });
});

describe("GetDc2DeclarationUseCase", () => {
  it("returns null when no declaration exists for the tender", async () => {
    const useCase = new GetDc2DeclarationUseCase(fakeAccessService(), inMemoryDeclarationRepository(), inMemoryVersionRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result).toBeNull();
  });
});
