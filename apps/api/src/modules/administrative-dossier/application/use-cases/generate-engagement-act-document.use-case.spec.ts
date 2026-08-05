import { describe, expect, it, vi } from "vitest";
import { GenerateEngagementActDocumentUseCase } from "./generate-engagement-act-document.use-case";
import type { EngagementActRepository } from "../ports/engagement-act.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import type { GetTenderUseCase } from "../../../tenders";
import type { PdfRendererPort } from "../../../export";
import { EngagementAct } from "../../domain/engagement-act.aggregate";
import { EngagementActNotFoundError, EngagementActPricingNotFrozenError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}
function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ title: "Marché de test" })) } as unknown as GetTenderUseCase;
}
function fakePdfRenderer(): PdfRendererPort {
  return { render: vi.fn(async () => Buffer.from("%PDF-fake")) };
}
function inMemoryRepository(seed: readonly EngagementAct[] = []): EngagementActRepository {
  const rows = new Map(seed.map((a) => [a.id, a]));
  return {
    create: async (a) => void rows.set(a.id, a),
    findById: async ({ engagementActId }) => rows.get(engagementActId) ?? null,
    findByTenderId: async ({ tenderId }) => [...rows.values()].find((a) => a.tenderId === tenderId) ?? null,
    save: async (a) => void rows.set(a.id, a),
  };
}

describe("GenerateEngagementActDocumentUseCase", () => {
  it("throws EngagementActNotFoundError when no act exists", async () => {
    const useCase = new GenerateEngagementActDocumentUseCase(fakeAccessService(), inMemoryRepository(), {} as AdministrativeGeneratedDocumentService, fakeGetTenderUseCase(), fakePdfRenderer(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(EngagementActNotFoundError);
  });

  it("refuses to generate the document while no pricing amount is frozen — mission 'jamais un montant implicite'", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([act]);
    const useCase = new GenerateEngagementActDocumentUseCase(fakeAccessService(), repository, {} as AdministrativeGeneratedDocumentService, fakeGetTenderUseCase(), fakePdfRenderer(), fakeClock());

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(EngagementActPricingNotFrozenError);
  });

  it("generates the document once the pricing is frozen", async () => {
    const act = EngagementAct.create({ id: "act-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    act.freezePricing({ pricingEstimateId: "estimate-1", pricingEstimateVersionNumber: 1, amountValue: 100000, amountCurrency: "EUR", frozenBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([act]);
    const pdfRenderer = fakePdfRenderer();
    const generatedDocumentService = { attachGeneratedPdf: vi.fn(async () => ({ id: "admindoc-1" })) } as unknown as AdministrativeGeneratedDocumentService;
    const useCase = new GenerateEngagementActDocumentUseCase(fakeAccessService(), repository, generatedDocumentService, fakeGetTenderUseCase(), pdfRenderer, fakeClock());

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(pdfRenderer.render).toHaveBeenCalledOnce();
    expect(generatedDocumentService.attachGeneratedPdf).toHaveBeenCalledWith(expect.objectContaining({ documentType: "ACTE_ENGAGEMENT" }));
  });
});
