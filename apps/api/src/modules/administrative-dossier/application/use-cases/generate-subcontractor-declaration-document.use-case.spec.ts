import { describe, expect, it, vi } from "vitest";
import { GenerateSubcontractorDeclarationDocumentUseCase } from "./generate-subcontractor-declaration-document.use-case";
import type { SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import type { GetTenderUseCase } from "../../../tenders";
import type { PdfRendererPort } from "../../../export";
import { SubcontractorDeclaration } from "../../domain/subcontractor-declaration.aggregate";
import { SubcontractorDeclarationNotFoundError } from "../../domain/errors";

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
function inMemoryRepository(seed: readonly SubcontractorDeclaration[] = []): SubcontractorDeclarationRepository {
  const rows = new Map(seed.map((d) => [d.id, d]));
  return {
    create: async (d) => void rows.set(d.id, d),
    findById: async ({ subcontractorDeclarationId }) => rows.get(subcontractorDeclarationId) ?? null,
    listByTenderId: async ({ tenderId }) => [...rows.values()].filter((d) => d.tenderId === tenderId),
    save: async (d) => void rows.set(d.id, d),
  };
}

describe("GenerateSubcontractorDeclarationDocumentUseCase", () => {
  it("throws SubcontractorDeclarationNotFoundError for an unknown declaration", async () => {
    const useCase = new GenerateSubcontractorDeclarationDocumentUseCase(fakeAccessService(), inMemoryRepository(), {} as AdministrativeGeneratedDocumentService, fakeGetTenderUseCase(), fakePdfRenderer(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: "missing" })).rejects.toBeInstanceOf(SubcontractorDeclarationNotFoundError);
  });

  it("generates and attaches the PDF, linking administrativeDocumentId on first generation", async () => {
    const declaration = SubcontractorDeclaration.create({ id: "sub-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, subcontractorName: "Sous-traitant A", servicesDescription: "x", amountValue: 100, amountCurrency: "EUR", createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryRepository([declaration]);
    const generatedDocumentService = { attachGeneratedPdf: vi.fn(async () => ({ id: "admindoc-1" })) } as unknown as AdministrativeGeneratedDocumentService;
    const useCase = new GenerateSubcontractorDeclarationDocumentUseCase(fakeAccessService(), repository, generatedDocumentService, fakeGetTenderUseCase(), fakePdfRenderer(), fakeClock());

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", subcontractorDeclarationId: "sub-1" });

    expect(generatedDocumentService.attachGeneratedPdf).toHaveBeenCalledWith(expect.objectContaining({ documentType: "DC4", tenderId: TENDER_ID }));
    const updated = await repository.findById({ organizationId: ORGANIZATION_ID, subcontractorDeclarationId: "sub-1" });
    expect(updated?.administrativeDocumentId).toBe("admindoc-1");
  });
});
