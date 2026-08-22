import { describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../../billing";
import { EnsureDc1DeclarationUseCase, GetDc1DeclarationUseCase, UpdateDc1DeclarationUseCase } from "./dc1-declaration.use-cases";
import type { Dc1DeclarationRepository } from "../ports/dc1-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { Dc1CandidateType, Dc1Declaration } from "../../domain/dc1-declaration.aggregate";
import { Dc1DeclarationNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  return { generate: () => "dc1-1" };
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

function inMemoryRepository(seed: readonly Dc1Declaration[] = []): Dc1DeclarationRepository {
  const rows = new Map<string, Dc1Declaration>(seed.map((d) => [d.id, d]));
  return {
    create: async (declaration) => void rows.set(declaration.id, declaration),
    findById: async ({ dc1DeclarationId }) => rows.get(dc1DeclarationId) ?? null,
    findByTenderId: async ({ tenderId }) => [...rows.values()].find((d) => d.tenderId === tenderId) ?? null,
    save: async (declaration) => void rows.set(declaration.id, declaration),
  };
}

describe("EnsureDc1DeclarationUseCase — mission §10 'une lettre de candidature par Tender'", () => {
  it("creates a DC1 declaration defaulting to INDIVIDUAL", async () => {
    const useCase = new EnsureDc1DeclarationUseCase(fakeAccessService(), inMemoryRepository(), fakeClock(), fakeIdGenerator(), fakeEntitlementService());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(summary.candidateType).toBe("INDIVIDUAL");
  });

  it("is idempotent", async () => {
    const repository = inMemoryRepository();
    const useCase = new EnsureDc1DeclarationUseCase(fakeAccessService(), repository, fakeClock(), fakeIdGenerator(), fakeEntitlementService());
    const first = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    const second = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(second.id).toBe(first.id);
  });
});

describe("UpdateDc1DeclarationUseCase", () => {
  it("throws Dc1DeclarationNotFoundError for an unknown declaration", async () => {
    const useCase = new UpdateDc1DeclarationUseCase(fakeAccessService(), inMemoryRepository(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", dc1DeclarationId: "missing" })).rejects.toBeInstanceOf(Dc1DeclarationNotFoundError);
  });

  it("switching candidateType back to INDIVIDUAL clears consortiumId — mission 'jamais un mandataire orphelin'", async () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, candidateType: Dc1CandidateType.Consortium, consortiumId: "consortium-1", createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([dc1]);
    const useCase = new UpdateDc1DeclarationUseCase(fakeAccessService(), repository, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", dc1DeclarationId: "dc1-1", candidateType: Dc1CandidateType.Individual });

    expect(summary.candidateType).toBe("INDIVIDUAL");
    expect(summary.consortiumId).toBeUndefined();
  });

  it("links an administrative document", async () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, candidateType: Dc1CandidateType.Individual, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([dc1]);
    const useCase = new UpdateDc1DeclarationUseCase(fakeAccessService(), repository, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", dc1DeclarationId: "dc1-1", administrativeDocumentId: "doc-1" });

    expect(summary.administrativeDocumentId).toBe("doc-1");
  });
});

describe("GetDc1DeclarationUseCase", () => {
  it("returns null when no declaration exists for the tender", async () => {
    const useCase = new GetDc1DeclarationUseCase(fakeAccessService(), inMemoryRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result).toBeNull();
  });
});
