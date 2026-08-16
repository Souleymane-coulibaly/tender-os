import { describe, expect, it, vi } from "vitest";
import { GenerateDumeDocumentUseCase } from "./generate-dume-document.use-case";
import type { AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import type { AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import type { DumeDeclarationRepository, DumeDeclarationVersionRepository } from "../ports/dume-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import type { GetTenderUseCase } from "../../../tenders";
import type { PdfRendererPort } from "../../../export";
import { DumeDeclaration } from "../../domain/dume-declaration.aggregate";
import { DumeDeclarationVersion } from "../../domain/dume-declaration-version.entity";
import { DumeDeclarationHasNoVersionError, DumeDeclarationNotFoundError } from "../../domain/errors";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}
function fakeGetTenderUseCase(): GetTenderUseCase {
  return { execute: vi.fn(async () => ({ title: "Marché de test" })) } as unknown as GetTenderUseCase;
}
function fakePdfRenderer(): PdfRendererPort {
  return { render: vi.fn(async () => Buffer.from("%PDF-fake")) };
}
function fakeDossierRepository(): AdministrativeDossierRepository {
  return { create: async () => {}, findById: async () => null, findByTenderId: async () => null, save: async () => {} };
}
function fakeDocumentRepository(): AdministrativeDocumentRepository {
  return { create: async () => {}, findById: async () => null, listByDossier: async () => [], findByRequirementId: async () => null, save: async () => {}, existsForOrganization: async () => false };
}
function fakeDeclarationRepository(declaration: DumeDeclaration | null): DumeDeclarationRepository {
  return { create: async () => {}, findById: async () => declaration, findByTenderId: async () => declaration, save: async () => {} };
}
function fakeVersionRepository(versions: readonly DumeDeclarationVersion[]): DumeDeclarationVersionRepository {
  return { create: async () => {}, findById: async () => null, listByDeclaration: async () => versions };
}

describe("GenerateDumeDocumentUseCase", () => {
  it("throws DumeDeclarationNotFoundError when no declaration exists", async () => {
    const useCase = new GenerateDumeDocumentUseCase(
      fakeAccessService(),
      fakeDeclarationRepository(null),
      fakeVersionRepository([]),
      fakeDossierRepository(),
      fakeDocumentRepository(),
      {} as AdministrativeGeneratedDocumentService,
      fakeGetTenderUseCase(),
      fakePdfRenderer(),
    );
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(DumeDeclarationNotFoundError);
  });

  it("throws DumeDeclarationHasNoVersionError when the declaration has no version yet", async () => {
    const declaration = DumeDeclaration.create({ id: "dume-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const useCase = new GenerateDumeDocumentUseCase(
      fakeAccessService(),
      fakeDeclarationRepository(declaration),
      fakeVersionRepository([]),
      fakeDossierRepository(),
      fakeDocumentRepository(),
      {} as AdministrativeGeneratedDocumentService,
      fakeGetTenderUseCase(),
      fakePdfRenderer(),
    );
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(DumeDeclarationHasNoVersionError);
  });

  it("renders the latest version's data as a PDF", async () => {
    const declaration = DumeDeclaration.create({ id: "dume-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    declaration.recordNewVersion({ versionNumber: 1, occurredAt: NOW });
    const version = DumeDeclarationVersion.create({ id: "v1", organizationId: ORGANIZATION_ID, dumeDeclarationId: "dume-1", version: 1, data: { legalIdentity: "SIRET 789" }, createdBy: "user-1", occurredAt: NOW });
    const pdfRenderer = fakePdfRenderer();
    const generatedDocumentService = { attachGeneratedPdf: vi.fn(async () => ({ id: "admindoc-1" })) } as unknown as AdministrativeGeneratedDocumentService;
    const useCase = new GenerateDumeDocumentUseCase(
      fakeAccessService(),
      fakeDeclarationRepository(declaration),
      fakeVersionRepository([version]),
      fakeDossierRepository(),
      fakeDocumentRepository(),
      generatedDocumentService,
      fakeGetTenderUseCase(),
      pdfRenderer,
    );

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(pdfRenderer.render).toHaveBeenCalledOnce();
    expect(generatedDocumentService.attachGeneratedPdf).toHaveBeenCalledWith(expect.objectContaining({ documentType: "DUME" }));
  });
});
