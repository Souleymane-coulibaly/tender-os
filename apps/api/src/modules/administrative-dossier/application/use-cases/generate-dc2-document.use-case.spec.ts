import { describe, expect, it, vi } from "vitest";
import { GenerateDc2DocumentUseCase } from "./generate-dc2-document.use-case";
import type { AdministrativeDocumentRepository } from "../ports/administrative-document.repository";
import type { AdministrativeDossierRepository } from "../ports/administrative-dossier.repository";
import type { Dc2DeclarationRepository, Dc2DeclarationVersionRepository } from "../ports/dc2-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import type { GetTenderUseCase } from "../../../tenders";
import type { PdfRendererPort } from "../../../export";
import { AdministrativeDossier } from "../../domain/administrative-dossier.aggregate";
import { AdministrativeDocument } from "../../domain/administrative-document.aggregate";
import { AdministrativeDocumentType } from "../../domain/administrative-document-type";
import { Dc2Declaration } from "../../domain/dc2-declaration.aggregate";
import { Dc2DeclarationVersion } from "../../domain/dc2-declaration-version.entity";
import { Dc2DeclarationHasNoVersionError, Dc2DeclarationNotFoundError } from "../../domain/errors";

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
function fakeDossierRepository(dossier: AdministrativeDossier | null): AdministrativeDossierRepository {
  return { create: async () => {}, findById: async () => dossier, findByTenderId: async () => dossier, save: async () => {} };
}
function fakeDocumentRepository(documents: readonly AdministrativeDocument[]): AdministrativeDocumentRepository {
  return { create: async () => {}, findById: async () => null, listByDossier: async () => documents, findByRequirementId: async () => null, save: async () => {} };
}
function fakeDeclarationRepository(declaration: Dc2Declaration | null): Dc2DeclarationRepository {
  return { create: async () => {}, findById: async () => declaration, findByTenderId: async () => declaration, save: async () => {} };
}
function fakeVersionRepository(versions: readonly Dc2DeclarationVersion[]): Dc2DeclarationVersionRepository {
  return { create: async () => {}, findById: async () => null, listByDeclaration: async () => versions };
}

describe("GenerateDc2DocumentUseCase", () => {
  it("throws Dc2DeclarationNotFoundError when no declaration exists", async () => {
    const useCase = new GenerateDc2DocumentUseCase(
      fakeAccessService(),
      fakeDeclarationRepository(null),
      fakeVersionRepository([]),
      fakeDossierRepository(null),
      fakeDocumentRepository([]),
      {} as AdministrativeGeneratedDocumentService,
      fakeGetTenderUseCase(),
      fakePdfRenderer(),
    );
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(Dc2DeclarationNotFoundError);
  });

  it("throws Dc2DeclarationHasNoVersionError when the declaration has no version yet", async () => {
    const declaration = Dc2Declaration.create({ id: "dc2-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    const useCase = new GenerateDc2DocumentUseCase(
      fakeAccessService(),
      fakeDeclarationRepository(declaration),
      fakeVersionRepository([]),
      fakeDossierRepository(null),
      fakeDocumentRepository([]),
      {} as AdministrativeGeneratedDocumentService,
      fakeGetTenderUseCase(),
      fakePdfRenderer(),
    );
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID })).rejects.toBeInstanceOf(Dc2DeclarationHasNoVersionError);
  });

  it("uses the latest version and reuses an existing DC2 shell found by type in the dossier", async () => {
    const declaration = Dc2Declaration.create({ id: "dc2-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, createdBy: "user-1", occurredAt: NOW });
    declaration.recordNewVersion({ versionNumber: 1, occurredAt: NOW });
    const v1 = Dc2DeclarationVersion.create({ id: "v1", organizationId: ORGANIZATION_ID, dc2DeclarationId: "dc2-1", version: 1, data: { legalIdentity: "old" }, createdBy: "user-1", occurredAt: NOW });
    const v2 = Dc2DeclarationVersion.create({ id: "v2", organizationId: ORGANIZATION_ID, dc2DeclarationId: "dc2-1", version: 2, data: { legalIdentity: "new" }, createdBy: "user-1", occurredAt: NOW });

    const dossier = AdministrativeDossier.create({ id: "dossier-1", organizationId: ORGANIZATION_ID, clientAccountId: "client-1", tenderId: TENDER_ID, occurredAt: NOW });
    const existingShell = AdministrativeDocument.create({ id: "admindoc-existing", organizationId: ORGANIZATION_ID, administrativeDossierId: "dossier-1", tenderId: TENDER_ID, documentType: AdministrativeDocumentType.Dc2, label: "DC2", createdBy: "user-1", occurredAt: NOW });

    const generatedDocumentService = { attachGeneratedPdf: vi.fn(async () => ({ id: "admindoc-existing" })) } as unknown as AdministrativeGeneratedDocumentService;
    const useCase = new GenerateDc2DocumentUseCase(
      fakeAccessService(),
      fakeDeclarationRepository(declaration),
      fakeVersionRepository([v1, v2]),
      fakeDossierRepository(dossier),
      fakeDocumentRepository([existingShell]),
      generatedDocumentService,
      fakeGetTenderUseCase(),
      fakePdfRenderer(),
    );

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", tenderId: TENDER_ID });

    expect(generatedDocumentService.attachGeneratedPdf).toHaveBeenCalledWith(expect.objectContaining({ existingAdministrativeDocumentId: "admindoc-existing", label: expect.stringContaining("v2") }));
  });
});
