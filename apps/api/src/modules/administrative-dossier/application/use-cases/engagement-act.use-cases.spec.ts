import { describe, expect, it, vi } from "vitest";
import type { EntitlementService } from "../../../billing";
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
function fakeEntitlementService(): EntitlementService {
  return {
    canOperateOnTender: vi.fn(async () => true),
    runTenderOperationEntitled: vi.fn(async (_input: unknown, operation: () => Promise<unknown>) => operation()),
  } as unknown as EntitlementService;
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

/** Checkpoint CCV2-E.2 — Tender courant, source du candidat servant à l'instantané et au calcul
 *  d'applicabilité. `candidateCompanyId` paramétrable pour prouver le contraste A/B. */
function fakeGetTenderUseCase(candidateCompanyId?: string) {
  return { execute: async () => ({ id: TENDER_ID, candidateCompanyId }) } as never;
}

describe("EnsureEngagementActUseCase — mission §14 'un Acte d'engagement par Tender'", () => {
  it("creates an engagement act with no frozen pricing yet", async () => {
    const useCase = new EnsureEngagementActUseCase(fakeAccessService(), inMemoryRepository(), fakeClock(), fakeIdGenerator(), fakeEntitlementService());
    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(summary.frozenAmountValue).toBeUndefined();
  });
});

describe("UpdateEngagementActUseCase", () => {
  it("throws EngagementActNotFoundError for an unknown act", async () => {
    const useCase = new UpdateEngagementActUseCase(fakeAccessService(), inMemoryRepository(), fakeClock(), fakeGetTenderUseCase());
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
    const useCase = new GetEngagementActUseCase(fakeAccessService(), inMemoryRepository(), fakeGetTenderUseCase());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(result).toBeNull();
  });
});

describe("Checkpoint CCV2-E.2 — Acte d'engagement : instantané immuable + applicabilité calculée", () => {
  const CANDIDATE_A = "candidate-a";
  const CANDIDATE_B = "candidate-b";

  it("pose l'instantané du candidat A, refuse de le réattribuer à B, et signale la péremption sans jamais modifier la révision", async () => {
    const repository = inMemoryRepository();
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: new Date("2026-01-01T00:00:00.000Z") });
    await repository.create(act);

    // --- Renseigné alors que le Tender porte le candidat A : l'instantané devient A.
    const updateForA = new UpdateEngagementActUseCase(fakeAccessService(), repository, fakeClock(), fakeGetTenderUseCase(CANDIDATE_A));
    const forA = await updateForA.execute({
      organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", engagementActId: "act-1",
      signatoryName: "Signataire A", signatoryCapacity: "Gérant",
    });
    expect(forA.candidateCompanyId).toBe(CANDIDATE_A);
    expect(forA.candidateStale).toBe(false);

    // --- Le Tender bascule sur B. La lecture signale la péremption…
    const readAfterSwitch = new GetEngagementActUseCase(fakeAccessService(), repository, fakeGetTenderUseCase(CANDIDATE_B));
    const stale = await readAfterSwitch.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(stale?.candidateStale).toBe(true);
    // …sans jamais réécrire l'instantané : l'acte reste un document de A.
    expect(stale?.candidateCompanyId).toBe(CANDIDATE_A);
    expect(stale?.signatoryName).toBe("Signataire A");

    // --- Une mise à jour sous le candidat B ne réattribue PAS l'acte : HISTORICAL_REVISION_MUTATION
    //     est interdit. L'instantané reste A, et l'acte reste signalé périmé.
    const updateUnderB = new UpdateEngagementActUseCase(fakeAccessService(), repository, fakeClock(), fakeGetTenderUseCase(CANDIDATE_B));
    const stillA = await updateUnderB.execute({
      organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", engagementActId: "act-1", signatoryCapacity: "Directeur",
    });
    expect(stillA.candidateCompanyId).toBe(CANDIDATE_A);
    expect(stillA.candidateStale).toBe(true);
  });

  it("un acte ANTÉRIEUR au checkpoint (sans instantané) n'est jamais déclaré périmé rétroactivement", async () => {
    const repository = inMemoryRepository();
    await repository.create(EngagementAct.create({ id: "act-legacy", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: new Date("2025-01-01T00:00:00.000Z") }));

    const read = new GetEngagementActUseCase(fakeAccessService(), repository, fakeGetTenderUseCase(CANDIDATE_B));
    const legacy = await read.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });
    expect(legacy?.candidateCompanyId).toBeUndefined();
    expect(legacy?.candidateStale).toBe(false);
  });
});
