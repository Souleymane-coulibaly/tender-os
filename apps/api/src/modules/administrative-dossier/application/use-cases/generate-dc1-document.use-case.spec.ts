import { describe, expect, it, vi } from "vitest";
import { GenerateDc1DocumentUseCase } from "./generate-dc1-document.use-case";
import type { ConsortiumRepository } from "../ports/consortium.repository";
import type { Dc1DeclarationRepository } from "../ports/dc1-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import type { GetTenderUseCase } from "../../../tenders";
import type { PdfRendererPort } from "../../../export";
import { Dc1CandidateType, Dc1Declaration } from "../../domain/dc1-declaration.aggregate";
import { Dc1DeclarationNotFoundError } from "../../domain/errors";

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
function fakeConsortiumRepository(): ConsortiumRepository {
  return { create: async () => {}, findById: async () => null, findByTenderId: async () => null, save: async () => {} };
}
function inMemoryDc1Repository(seed: readonly Dc1Declaration[] = []): Dc1DeclarationRepository {
  const rows = new Map(seed.map((d) => [d.id, d]));
  return {
    create: async (d) => void rows.set(d.id, d),
    findById: async ({ dc1DeclarationId }) => rows.get(dc1DeclarationId) ?? null,
    findByTenderId: async ({ tenderId }) => [...rows.values()].find((d) => d.tenderId === tenderId) ?? null,
    save: async (d) => void rows.set(d.id, d),
  };
}

describe("GenerateDc1DocumentUseCase", () => {
  it("throws Dc1DeclarationNotFoundError when no declaration exists for the tender", async () => {
    const useCase = new GenerateDc1DocumentUseCase(fakeAccessService(), inMemoryDc1Repository(), fakeConsortiumRepository(), {} as AdministrativeGeneratedDocumentService, fakeGetTenderUseCase(), fakePdfRenderer(), fakeClock());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(Dc1DeclarationNotFoundError);
  });

  it("renders a PDF, attaches it, and links the administrativeDocumentId back onto the declaration on first generation", async () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, candidateType: Dc1CandidateType.Individual, createdBy: "user-1", occurredAt: NOW });
    const repository = inMemoryDc1Repository([dc1]);
    const pdfRenderer = fakePdfRenderer();
    const generatedDocumentService = { attachGeneratedPdf: vi.fn(async () => ({ id: "admindoc-1" })) } as unknown as AdministrativeGeneratedDocumentService;
    const useCase = new GenerateDc1DocumentUseCase(fakeAccessService(), repository, fakeConsortiumRepository(), generatedDocumentService, fakeGetTenderUseCase(), pdfRenderer, fakeClock());

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(pdfRenderer.render).toHaveBeenCalledOnce();
    expect(generatedDocumentService.attachGeneratedPdf).toHaveBeenCalledWith(expect.objectContaining({ documentType: "DC1", existingAdministrativeDocumentId: undefined }));
    expect((summary as { id: string }).id).toBe("admindoc-1");

    const updated = await repository.findByTenderId({ organizationId: ORGANIZATION_ID, tenderId: TENDER_ID });
    expect(updated?.administrativeDocumentId).toBe("admindoc-1");
  });

  it("reuses the existing administrativeDocumentId on a second generation, never linking twice", async () => {
    const dc1 = Dc1Declaration.create({ id: "dc1-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, candidateType: Dc1CandidateType.Individual, createdBy: "user-1", occurredAt: NOW });
    dc1.linkDocument({ administrativeDocumentId: "admindoc-1", occurredAt: NOW });
    const repository = inMemoryDc1Repository([dc1]);
    const generatedDocumentService = { attachGeneratedPdf: vi.fn(async () => ({ id: "admindoc-1" })) } as unknown as AdministrativeGeneratedDocumentService;
    const useCase = new GenerateDc1DocumentUseCase(fakeAccessService(), repository, fakeConsortiumRepository(), generatedDocumentService, fakeGetTenderUseCase(), fakePdfRenderer(), fakeClock());

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(generatedDocumentService.attachGeneratedPdf).toHaveBeenCalledWith(expect.objectContaining({ existingAdministrativeDocumentId: "admindoc-1" }));
  });
});
