import { describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../../billing";
import { CreateSubcontractorDeclarationUseCase, ListSubcontractorDeclarationsUseCase, UpdateSubcontractorDeclarationUseCase } from "./subcontractor-declaration.use-cases";
import type { EngagementActRepository } from "../ports/engagement-act.repository";
import type { SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { EngagementAct } from "../../domain/engagement-act.aggregate";
import { SubcontractorDeclaration } from "../../domain/subcontractor-declaration.aggregate";
import { SubcontractorAmountInconsistentWithPricingError, SubcontractorDeclarationNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  let n = 0;
  return { generate: () => `sub-${(n += 1)}` };
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

function inMemorySubcontractorRepository(seed: readonly SubcontractorDeclaration[] = []): SubcontractorDeclarationRepository {
  const rows = new Map<string, SubcontractorDeclaration>(seed.map((d) => [d.id, d]));
  return {
    create: async (declaration) => void rows.set(declaration.id, declaration),
    findById: async ({ subcontractorDeclarationId }) => rows.get(subcontractorDeclarationId) ?? null,
    listByTenderId: async ({ tenderId }) => [...rows.values()].filter((d) => d.tenderId === tenderId),
    save: async (declaration) => void rows.set(declaration.id, declaration),
  };
}

function fakeEngagementActRepository(act: EngagementAct | null): EngagementActRepository {
  return {
    create: async () => {},
    findById: async () => act,
    findByTenderId: async () => act,
    save: async () => {},
  };
}

describe("CreateSubcontractorDeclarationUseCase — mission §12 'plusieurs DC4 possibles'", () => {
  it("creates a declaration when no engagement act pricing is frozen yet", async () => {
    const repository = inMemorySubcontractorRepository();
    const useCase = new CreateSubcontractorDeclarationUseCase(fakeAccessService(), repository, fakeEngagementActRepository(null), fakeClock(), fakeIdGenerator(), fakeEntitlementService());

    const summary = await useCase.execute({
      organizationId: ORGANIZATION_ID,
      actorId: "user-1",
      actorRole: "OWNER",
      tenderId: TENDER_ID,
      subcontractorName: "Sous-traitant A",
      servicesDescription: "Travaux",
      amountValue: 10000,
      amountCurrency: "EUR",
      percentageOfTotal: 50,
    });

    expect(summary.subcontractorName).toBe("Sous-traitant A");
  });

  it("allows several DC4 declarations for the same tender", async () => {
    const repository = inMemorySubcontractorRepository();
    const useCase = new CreateSubcontractorDeclarationUseCase(fakeAccessService(), repository, fakeEngagementActRepository(null), fakeClock(), fakeIdGenerator(), fakeEntitlementService());
    const list = new ListSubcontractorDeclarationsUseCase(fakeAccessService(), repository);

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, subcontractorName: "A", servicesDescription: "x", amountValue: 100, amountCurrency: "EUR" });
    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, subcontractorName: "B", servicesDescription: "y", amountValue: 200, amountCurrency: "EUR" });

    const declarations = await list.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(declarations).toHaveLength(2);
  });

  it("mission §12 — refuses an amount/percentage inconsistent with the engagement act's frozen pricing", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 100000, amountCurrency: "EUR", frozenBy: "user-1", occurredAt: NOW });
    const repository = inMemorySubcontractorRepository();
    const useCase = new CreateSubcontractorDeclarationUseCase(fakeAccessService(), repository, fakeEngagementActRepository(act), fakeClock(), fakeIdGenerator(), fakeEntitlementService());

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, subcontractorName: "A", servicesDescription: "x", amountValue: 5000, amountCurrency: "EUR", percentageOfTotal: 50 }),
    ).rejects.toBeInstanceOf(SubcontractorAmountInconsistentWithPricingError);
  });

  it("accepts an amount/percentage consistent (within tolerance) with the frozen pricing", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 100000, amountCurrency: "EUR", frozenBy: "user-1", occurredAt: NOW });
    const repository = inMemorySubcontractorRepository();
    const useCase = new CreateSubcontractorDeclarationUseCase(fakeAccessService(), repository, fakeEngagementActRepository(act), fakeClock(), fakeIdGenerator(), fakeEntitlementService());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID, subcontractorName: "A", servicesDescription: "x", amountValue: 50000, amountCurrency: "EUR", percentageOfTotal: 50 });
    expect(summary.amountValue).toBe(50000);
  });
});

describe("UpdateSubcontractorDeclarationUseCase", () => {
  it("throws SubcontractorDeclarationNotFoundError for an unknown declaration", async () => {
    const useCase = new UpdateSubcontractorDeclarationUseCase(fakeAccessService(), inMemorySubcontractorRepository(), fakeEngagementActRepository(null), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: "missing" })).rejects.toBeInstanceOf(SubcontractorDeclarationNotFoundError);
  });
});
