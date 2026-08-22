import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DefaultEntitlementService,
  ReleasePassForTenderUseCase,
  ReservePassForTenderUseCase,
} from "../../../billing";
import type { ListDceDocumentsUseCase } from "../../../dce";
import type { TenderLotRepository } from "../../../tenders";
import {
  FakeAtomicTransactionRunner,
  FixedClock,
  InMemoryAuditLogWriter,
  InMemoryPricingScheduleRepository,
} from "../../test-support/fakes";
import type { PricingScheduleAccessService } from "../services/pricing-schedule-access.service";
import { CreatePricingScheduleUseCase } from "./create-pricing-schedule.use-case";

// Fakes billing réels (même motif que `entitlement.service.spec.ts`, E1.3) — importés directement
// depuis `billing/test-support/fakes` pour prouver le VRAI mécanisme de réservation/compensation,
// jamais un mock qui ne ferait que simuler un `true`/`false`.
import {
  FIXED_NOW,
  FakeOutboxWriter,
  InMemoryAuditLogWriter as BillingInMemoryAuditLogWriter,
  InMemoryOrganizationSubscriptionRepository,
  InMemoryPassPurchaseRepository,
} from "../../../billing/test-support/fakes";
import { PassPurchase } from "../../../billing/domain/pass-purchase.aggregate";

const ORG_A = "org-a";
const TENDER_A = "tender-a";
const TENDER_B = "tender-b";
const CLIENT_A = "client-a";

function fakeAccessService(): PricingScheduleAccessService {
  return { assertTenderAccess: vi.fn(async () => ({ clientAccountId: CLIENT_A, candidateCompanyId: undefined })) } as unknown as PricingScheduleAccessService;
}
function fakeTenderLotRepository(): TenderLotRepository {
  return { findById: vi.fn(async () => null) } as unknown as TenderLotRepository;
}
function fakeListDceDocumentsUseCase(sourceDocumentId: string): ListDceDocumentsUseCase {
  return {
    execute: vi.fn(async () => [{ documentId: sourceDocumentId, originalFilename: "BPU.xlsx", currentVersionId: "doc-version-1" }]),
  } as unknown as ListDceDocumentsUseCase;
}

/** Checkpoint TENDEROS-2.1-P2.3-E1.4, mission §5/§6 — preuve DIRECTE (pas un mock simulé) que
 *  Pricing Schedule, désormais gaté via `runTenderOperationEntitled` (mission §3, autorité unique),
 *  respecte EXACTEMENT la politique Billing déjà validée : réservation au premier usage pour une
 *  organisation Pass-only, jamais de consommation, jamais de double réservation, et compensation
 *  correcte en cas d'échec métier (§6 — jamais de libération d'une réservation PRÉEXISTANTE). */
describe("CreatePricingScheduleUseCase — Checkpoint TENDEROS-2.1-P2.3-E1.4, entitlement Pass reservation", () => {
  let scheduleRepository: InMemoryPricingScheduleRepository;
  let passes: InMemoryPassPurchaseRepository;
  let subscriptions: InMemoryOrganizationSubscriptionRepository;
  let overrides: { findActiveFeatureOverride: () => Promise<null>; findActiveQuotaOverride: () => Promise<null> };
  let billingAuditLog: BillingInMemoryAuditLogWriter;
  let billingOutbox: FakeOutboxWriter;
  let entitlementService: DefaultEntitlementService;

  function buildUseCase(sourceDocumentId: string): CreatePricingScheduleUseCase {
    return new CreatePricingScheduleUseCase(
      scheduleRepository,
      fakeTenderLotRepository(),
      new InMemoryAuditLogWriter(),
      new FakeAtomicTransactionRunner(),
      new FixedClock(FIXED_NOW),
      { generate: () => `schedule-${Math.random()}` },
      fakeAccessService(),
      fakeListDceDocumentsUseCase(sourceDocumentId),
      entitlementService,
    );
  }

  beforeEach(() => {
    scheduleRepository = new InMemoryPricingScheduleRepository();
    passes = new InMemoryPassPurchaseRepository();
    subscriptions = new InMemoryOrganizationSubscriptionRepository();
    overrides = { findActiveFeatureOverride: async () => null, findActiveQuotaOverride: async () => null };
    billingAuditLog = new BillingInMemoryAuditLogWriter();
    billingOutbox = new FakeOutboxWriter();
    const reservePassForTenderUseCase = new ReservePassForTenderUseCase(subscriptions, passes, billingAuditLog, billingOutbox as never);
    const releasePassForTenderUseCase = new ReleasePassForTenderUseCase(passes, billingAuditLog, billingOutbox as never);
    entitlementService = new DefaultEntitlementService(
      subscriptions,
      passes,
      overrides as never,
      new FixedClock(FIXED_NOW),
      reservePassForTenderUseCase,
      releasePassForTenderUseCase,
    );
  });

  it("mission §5 — a Pass-only organization's FIRST pricing schedule mutation reserves the Pass for this Tender, never consumes it, never touches the AO ledger", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    await passes.create(pass);
    const useCase = buildUseCase("doc-1");

    const schedule = await useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "BID_MANAGER", tenderId: TENDER_A, sourceDocumentId: "doc-1" });

    expect(schedule.id).toBeDefined();
    const reserved = await passes.findById(ORG_A, "pass-1");
    expect(reserved?.status).toBe("RESERVED");
    expect(reserved?.reservedTenderId).toBe(TENDER_A);
    expect(reserved?.consumedTenderId).toBeUndefined(); // jamais consommé — la consommation reste au premier dépôt réussi
  });

  it("mission §5 — once RESERVED for Tender A, a SECOND pricing schedule mutation on the SAME Tender A never re-reserves (idempotent, recognizes the RESERVED Pass)", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.reserveForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);
    const useCase = buildUseCase("doc-1");

    const schedule = await useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "BID_MANAGER", tenderId: TENDER_A, sourceDocumentId: "doc-1" });

    expect(schedule.tenderId).toBe(TENDER_A);
    expect((await passes.findById(ORG_A, "pass-1"))?.status).toBe("RESERVED"); // jamais reconsommé/re-réservé
  });

  it("mission §5 — a Pass already RESERVED for Tender A refuses Tender B's pricing schedule mutation (never a double reservation)", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.reserveForTender(TENDER_A, FIXED_NOW);
    await passes.create(pass);
    const useCase = buildUseCase("doc-1");

    await expect(useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "BID_MANAGER", tenderId: TENDER_B, sourceDocumentId: "doc-1" })).rejects.toMatchObject({
      code: "TENDER_OPERATION_NOT_ENTITLED",
    });
  });

  it("mission §6 — a FRESH reservation (NEWLY_RESERVED) is released back to AVAILABLE when the pricing schedule mutation fails", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    await passes.create(pass);
    // `sourceDocumentId` demandé ("doc-missing") ne correspond à AUCUN document listé dans le DCE
    // fake (qui n'expose que "doc-1") -> `SourceDocumentNotInDceError`, un échec métier RÉEL après
    // la réservation, jamais un problème d'entitlement lui-même.
    const useCase = buildUseCase("doc-1");

    await expect(
      useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "BID_MANAGER", tenderId: TENDER_A, sourceDocumentId: "doc-missing" }),
    ).rejects.toThrow(); // SourceDocumentNotInDceError

    const released = await passes.findById(ORG_A, "pass-1");
    expect(released?.status).toBe("AVAILABLE");
    expect(released?.reservedTenderId).toBeUndefined();
  });

  it("mission §6 — a PRE-EXISTING reservation is NEVER released when a LATER, unrelated pricing schedule mutation on the SAME tender fails", async () => {
    const pass = PassPurchase.create({ id: "pass-1", organizationId: ORG_A, externalReference: "cs_1", priceCents: 9900, currency: "EUR", occurredAt: FIXED_NOW });
    pass.reserveForTender(TENDER_A, FIXED_NOW); // déjà réservé AVANT cet appel, par une opération antérieure légitime
    await passes.create(pass);
    const useCase = buildUseCase("doc-1");

    await expect(
      useCase.execute({ organizationId: ORG_A, actorId: "user-1", actorRole: "BID_MANAGER", tenderId: TENDER_A, sourceDocumentId: "doc-missing" }),
    ).rejects.toThrow();

    const stillReserved = await passes.findById(ORG_A, "pass-1");
    expect(stillReserved?.status).toBe("RESERVED");
    expect(stillReserved?.reservedTenderId).toBe(TENDER_A);
  });
});
