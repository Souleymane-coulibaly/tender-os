import { describe, expect, it, vi } from "vitest";
import { EnsureEngagementActUseCase, FreezeEngagementActPricingUseCase, GetEngagementActUseCase, UnfreezeEngagementActPricingUseCase, UpdateEngagementActUseCase } from "./engagement-act.use-cases";
import type { EngagementActRepository } from "../ports/engagement-act.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { GetPricingEstimateUseCase } from "../../../pricing";
import { EngagementAct } from "../../domain/engagement-act.aggregate";
import { EngagementActNotFoundError, EngagementActPricingAlreadyFrozenError, PricingEstimateNotForThisTenderError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeIdGenerator() {
  return { generate: () => "act-1" };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}

function inMemoryRepository(seed: readonly EngagementAct[] = []): EngagementActRepository {
  const rows = new Map<string, EngagementAct>(seed.map((a) => [a.id, a]));
  return {
    create: async (act) => void rows.set(act.id, act),
    findById: async ({ engagementActId }) => rows.get(engagementActId) ?? null,
    findByTenderId: async ({ tenderId }) => [...rows.values()].find((a) => a.tenderId === tenderId) ?? null,
    save: async (act) => void rows.set(act.id, act),
  };
}

describe("EnsureEngagementActUseCase — mission §14 'un Acte d'engagement par Tender'", () => {
  it("creates an engagement act with no frozen pricing yet", async () => {
    const useCase = new EnsureEngagementActUseCase(fakeAccessService(), inMemoryRepository(), fakeClock(), fakeIdGenerator());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(summary.frozenAmountValue).toBeUndefined();
  });
});

describe("UpdateEngagementActUseCase", () => {
  it("throws EngagementActNotFoundError for an unknown act", async () => {
    const useCase = new UpdateEngagementActUseCase(fakeAccessService(), inMemoryRepository(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", engagementActId: "missing" })).rejects.toBeInstanceOf(EngagementActNotFoundError);
  });
});

describe("FreezeEngagementActPricingUseCase — correctif audit Codex P1-002 'jamais un montant implicite'", () => {
  it("freezes the amount/currency from the explicitly selected pricing estimate version", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([act]);
    const getPricingEstimateUseCase = { execute: vi.fn(async () => ({ id: "estimate-1", tenderId: TENDER_ID, currentVersion: { version: 1, amount: "100000.00", currency: "EUR" } })) } as unknown as GetPricingEstimateUseCase;
    const useCase = new FreezeEngagementActPricingUseCase(fakeAccessService(), repository, getPricingEstimateUseCase, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", engagementActId: "act-1", pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1 });

    expect(summary.frozenAmountValue).toBe(100000);
    expect(summary.frozenAmountCurrency).toBe("EUR");
  });

  it("refuses a pricing estimate that does not belong to the same tender", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([act]);
    const getPricingEstimateUseCase = { execute: vi.fn(async () => ({ id: "estimate-1", tenderId: "other-tender", currentVersion: { version: 1, amount: "100000.00", currency: "EUR" } })) } as unknown as GetPricingEstimateUseCase;
    const useCase = new FreezeEngagementActPricingUseCase(fakeAccessService(), repository, getPricingEstimateUseCase, fakeClock());

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", engagementActId: "act-1", pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1 }),
    ).rejects.toBeInstanceOf(PricingEstimateNotForThisTenderError);
  });

  it("refuses re-freezing with a DIFFERENT pair without an explicit unfreeze first", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 100000, amountCurrency: "EUR", frozenBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([act]);
    const getPricingEstimateUseCase = { execute: vi.fn(async () => ({ id: "estimate-1", tenderId: TENDER_ID, currentVersion: { version: 2, amount: "200000.00", currency: "EUR" } })) } as unknown as GetPricingEstimateUseCase;
    const useCase = new FreezeEngagementActPricingUseCase(fakeAccessService(), repository, getPricingEstimateUseCase, fakeClock());

    await expect(
      useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", engagementActId: "act-1", pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 2 }),
    ).rejects.toBeInstanceOf(EngagementActPricingAlreadyFrozenError);
  });
});

describe("UnfreezeEngagementActPricingUseCase", () => {
  it("clears the frozen pricing reference explicitly", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 100000, amountCurrency: "EUR", frozenBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([act]);
    const useCase = new UnfreezeEngagementActPricingUseCase(fakeAccessService(), repository, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", engagementActId: "act-1" });

    expect(summary.frozenAmountValue).toBeUndefined();
    expect(summary.pricingEstimateId).toBeUndefined();
  });
});

describe("GetEngagementActUseCase", () => {
  it("returns null when no act exists for the tender", async () => {
    const useCase = new GetEngagementActUseCase(fakeAccessService(), inMemoryRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result).toBeNull();
  });
});
