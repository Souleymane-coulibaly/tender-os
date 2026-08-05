import { describe, expect, it, vi } from "vitest";
import {
  GenerateOfficialFormUseCase,
  PrepareOfficialFormUseCase,
  PreviewOfficialFormUseCase,
  SaveOfficialFormDraftUseCase,
} from "./administrative-form.use-cases";
import { AdministrativeFormDraft } from "../../domain/administrative-form-draft.aggregate";
import { AdministrativeFormType } from "../../domain/administrative-form-type";
import { AdministrativeFormNotReadyForGenerationError, UnsupportedAdministrativeFormTypeError } from "../../domain/errors";
import { BuyerProvidedFormTemplate } from "../../domain/buyer-provided-form-template.aggregate";
import { OfficialAdministrativeTemplate } from "../../domain/official-administrative-template.aggregate";
import { SubcontractorDeclaration } from "../../domain/subcontractor-declaration.aggregate";
import type { AdministrativeFormDraftRepository } from "../ports/administrative-form-draft.repository";
import type { BuyerProvidedFormTemplateRepository } from "../ports/buyer-provided-form-template.repository";
import type { OfficialAdministrativeTemplateRepository } from "../ports/official-administrative-template.repository";
import type { SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";
import type { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import type { AdministrativeFormDataAssembler } from "../services/administrative-form-data-assembler.service";
import type { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import type { DocumentRendererPort } from "../../../export";

const NOW = new Date("2026-09-10T10:00:00.000Z");
const ORGANIZATION_ID = "org-1";
const TENDER_ID = "tender-1";

function fakeClock() {
  return { now: () => NOW };
}
function fakeAccessService(): AdministrativeDossierAccessService {
  return { assertTenderAccess: vi.fn(async () => "client-1") } as unknown as AdministrativeDossierAccessService;
}
function makeDeclaration(overrides: Partial<{ administrativeDocumentId: string }> = {}) {
  const declaration = SubcontractorDeclaration.create({
    id: "sub-1",
    organizationId: ORGANIZATION_ID,
    tenderId: TENDER_ID,
    subcontractorName: "Sous-traitant A",
    servicesDescription: "Travaux",
    amountValue: 1000,
    amountCurrency: "EUR",
    createdBy: "user-1",
    occurredAt: NOW,
  });
  if (overrides.administrativeDocumentId) {
    declaration.linkDocument({ administrativeDocumentId: overrides.administrativeDocumentId, occurredAt: NOW });
  }
  return declaration;
}
function fakeAssembler(declaration: SubcontractorDeclaration): AdministrativeFormDataAssembler {
  return { assembleForDc4: vi.fn(async () => ({ declaration, tenderId: TENDER_ID, tenderTitle: "Marché de test" })) } as unknown as AdministrativeFormDataAssembler;
}
function emptyDraftRepository(): AdministrativeFormDraftRepository {
  return { create: vi.fn(async () => undefined), find: vi.fn(async () => null), save: vi.fn(async () => undefined) };
}
function emptyBuyerRepository(): BuyerProvidedFormTemplateRepository {
  return { create: vi.fn(async () => undefined), find: vi.fn(async () => null), save: vi.fn(async () => undefined) };
}
function emptyOfficialTemplateRepository(): OfficialAdministrativeTemplateRepository {
  return {
    create: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findActiveForOrganization: vi.fn(async () => null),
    findActiveSystemWide: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
  };
}
function officialTemplate() {
  return OfficialAdministrativeTemplate.create({
    id: "tpl-1",
    organizationId: ORGANIZATION_ID,
    documentType: AdministrativeFormType.Dc4,
    officialName: "DC4",
    version: 1,
    sourceAuthority: "DAJ",
    sourceReference: "https://example.test/dc4.docx",
    fileDocumentId: "doc-1",
    fileDocumentVersionId: "docver-1",
    hash: "abc123",
    createdBy: "user-1",
    occurredAt: NOW,
  });
}

describe("PrepareOfficialFormUseCase", () => {
  it("rejects an unsupported form type", async () => {
    const useCase = new PrepareOfficialFormUseCase(fakeAccessService(), fakeAssembler(makeDeclaration()), emptyDraftRepository(), emptyBuyerRepository(), emptyOfficialTemplateRepository());
    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc1, scopeId: "sub-1" })).rejects.toBeInstanceOf(UnsupportedAdministrativeFormTypeError);
  });

  it("canGenerate is false when no reference template is configured", async () => {
    const useCase = new PrepareOfficialFormUseCase(fakeAccessService(), fakeAssembler(makeDeclaration()), emptyDraftRepository(), emptyBuyerRepository(), emptyOfficialTemplateRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" });
    expect(result.canGenerate).toBe(false);
    expect(result.referenceTemplate).toBeUndefined();
  });

  it("canGenerate is true once an official template is resolved", async () => {
    const officialTemplateRepository = emptyOfficialTemplateRepository();
    officialTemplateRepository.findActiveForOrganization = vi.fn(async () => officialTemplate());
    const useCase = new PrepareOfficialFormUseCase(fakeAccessService(), fakeAssembler(makeDeclaration()), emptyDraftRepository(), emptyBuyerRepository(), officialTemplateRepository);
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" });
    expect(result.canGenerate).toBe(true);
    expect(result.referenceTemplate).toEqual(expect.objectContaining({ kind: "OFFICIAL", officialTemplateId: "tpl-1" }));
  });

  it("prioritizes a buyer-designated template over the TenderOS official template", async () => {
    const officialTemplateRepository = emptyOfficialTemplateRepository();
    officialTemplateRepository.findActiveForOrganization = vi.fn(async () => officialTemplate());
    const buyerRepository = emptyBuyerRepository();
    buyerRepository.find = vi.fn(async () => BuyerProvidedFormTemplate.create({ id: "buyer-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, documentType: AdministrativeFormType.Dc4, documentId: "buyer-doc-1", documentVersionId: "buyer-docver-1", designatedBy: "user-1", occurredAt: NOW }));
    const useCase = new PrepareOfficialFormUseCase(fakeAccessService(), fakeAssembler(makeDeclaration()), emptyDraftRepository(), buyerRepository, officialTemplateRepository);
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" });
    expect(result.referenceTemplate).toEqual({ kind: "BUYER", fileDocumentId: "buyer-doc-1", fileDocumentVersionId: "buyer-docver-1" });
  });

  it("applies an existing draft's overrides to the returned values", async () => {
    const draftRepository = emptyDraftRepository();
    draftRepository.find = vi.fn(async () => AdministrativeFormDraft.create({ id: "draft-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, documentType: AdministrativeFormType.Dc4, scopeId: "sub-1", data: { paymentTerms: "30 jours net" }, updatedBy: "user-1", occurredAt: NOW }));
    const useCase = new PrepareOfficialFormUseCase(fakeAccessService(), fakeAssembler(makeDeclaration()), draftRepository, emptyBuyerRepository(), emptyOfficialTemplateRepository());
    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" });
    expect(result.values.paymentTerms).toBe("30 jours net");
    expect(result.fieldSources.paymentTerms).toBe("USER_INPUT");
  });
});

describe("SaveOfficialFormDraftUseCase", () => {
  it("creates a new draft on first save and never mutates the SubcontractorDeclaration", async () => {
    const declaration = makeDeclaration();
    const draftRepository = emptyDraftRepository();
    const useCase = new SaveOfficialFormDraftUseCase(fakeAccessService(), fakeAssembler(declaration), draftRepository, fakeClock(), { generate: () => "draft-generated-1" });
    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1", data: { paymentTerms: "45 jours" } });

    expect(draftRepository.create).toHaveBeenCalledOnce();
    expect(declaration.paymentTerms).toBeUndefined();
  });

  it("updates the existing draft on a second save, preserving its id", async () => {
    const existing = AdministrativeFormDraft.create({ id: "draft-1", organizationId: ORGANIZATION_ID, tenderId: TENDER_ID, documentType: AdministrativeFormType.Dc4, scopeId: "sub-1", data: { paymentTerms: "30 jours" }, updatedBy: "user-1", occurredAt: NOW });
    const draftRepository = emptyDraftRepository();
    draftRepository.find = vi.fn(async () => existing);
    const useCase = new SaveOfficialFormDraftUseCase(fakeAccessService(), fakeAssembler(makeDeclaration()), draftRepository, fakeClock(), { generate: () => "unused" });

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1", data: { paymentTerms: "45 jours" } });

    expect(draftRepository.create).not.toHaveBeenCalled();
    expect(draftRepository.save).toHaveBeenCalledWith(existing);
    expect(existing.data.paymentTerms).toBe("45 jours");
  });
});

describe("PreviewOfficialFormUseCase", () => {
  it("always renders with a watermark and never attaches/persists anything", async () => {
    const documentRenderer: DocumentRendererPort = { render: vi.fn(async () => Buffer.from("PK-fake-docx")) };
    const useCase = new PreviewOfficialFormUseCase(fakeAccessService(), fakeAssembler(makeDeclaration()), emptyDraftRepository(), documentRenderer);

    const result = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" });

    expect(documentRenderer.render).toHaveBeenCalledWith(expect.objectContaining({ watermarkText: expect.stringContaining("APERÇU") }));
    expect(result.buffer.toString()).toBe("PK-fake-docx");
  });
});

describe("GenerateOfficialFormUseCase", () => {
  it("refuses to generate when no reference template is resolved", async () => {
    const documentRenderer: DocumentRendererPort = { render: vi.fn(async () => Buffer.from("PK-fake-docx")) };
    const useCase = new GenerateOfficialFormUseCase(
      fakeAccessService(),
      fakeAssembler(makeDeclaration()),
      emptyDraftRepository(),
      emptyBuyerRepository(),
      emptyOfficialTemplateRepository(),
      {} as SubcontractorDeclarationRepository,
      documentRenderer,
      {} as AdministrativeGeneratedDocumentService,
      fakeClock(),
    );

    await expect(useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" })).rejects.toBeInstanceOf(AdministrativeFormNotReadyForGenerationError);
    expect(documentRenderer.render).not.toHaveBeenCalled();
  });

  it("generates the Annexe TenderOS DOCX, attaches it with the resolved officialTemplateId/snapshot, and links the document on first generation", async () => {
    const declaration = makeDeclaration();
    const officialTemplateRepository = emptyOfficialTemplateRepository();
    officialTemplateRepository.findActiveForOrganization = vi.fn(async () => officialTemplate());
    const documentRenderer: DocumentRendererPort = { render: vi.fn(async () => Buffer.from("PK-fake-docx")) };
    const generatedDocumentService = { attachGeneratedDocument: vi.fn(async () => ({ id: "admindoc-1" })) } as unknown as AdministrativeGeneratedDocumentService;
    const subcontractorRepository = { save: vi.fn(async () => undefined) } as unknown as SubcontractorDeclarationRepository;

    const useCase = new GenerateOfficialFormUseCase(
      fakeAccessService(),
      fakeAssembler(declaration),
      emptyDraftRepository(),
      emptyBuyerRepository(),
      officialTemplateRepository,
      subcontractorRepository,
      documentRenderer,
      generatedDocumentService,
      fakeClock(),
    );

    const summary = await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" });

    expect(documentRenderer.render).toHaveBeenCalledWith(expect.not.objectContaining({ watermarkText: expect.anything() }));
    expect(generatedDocumentService.attachGeneratedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ format: "DOCX", documentType: AdministrativeFormType.Dc4, officialTemplateId: "tpl-1", formDataSnapshot: expect.objectContaining({ subcontractorName: "Sous-traitant A" }) }),
    );
    expect(subcontractorRepository.save).toHaveBeenCalledWith(declaration);
    expect(declaration.administrativeDocumentId).toBe("admindoc-1");
    expect(summary).toEqual({ id: "admindoc-1" });
  });

  it("does not re-link administrativeDocumentId when the declaration is already linked", async () => {
    const declaration = makeDeclaration({ administrativeDocumentId: "existing-admindoc" });
    const officialTemplateRepository = emptyOfficialTemplateRepository();
    officialTemplateRepository.findActiveForOrganization = vi.fn(async () => officialTemplate());
    const documentRenderer: DocumentRendererPort = { render: vi.fn(async () => Buffer.from("PK-fake-docx")) };
    const generatedDocumentService = { attachGeneratedDocument: vi.fn(async () => ({ id: "existing-admindoc" })) } as unknown as AdministrativeGeneratedDocumentService;
    const subcontractorRepository = { save: vi.fn(async () => undefined) } as unknown as SubcontractorDeclarationRepository;

    const useCase = new GenerateOfficialFormUseCase(
      fakeAccessService(),
      fakeAssembler(declaration),
      emptyDraftRepository(),
      emptyBuyerRepository(),
      officialTemplateRepository,
      subcontractorRepository,
      documentRenderer,
      generatedDocumentService,
      fakeClock(),
    );

    await useCase.execute({ organizationId: ORGANIZATION_ID, actorId: "user-1", actorRole: "OWNER", documentType: AdministrativeFormType.Dc4, scopeId: "sub-1" });

    expect(subcontractorRepository.save).not.toHaveBeenCalled();
    expect(generatedDocumentService.attachGeneratedDocument).toHaveBeenCalledWith(expect.objectContaining({ existingAdministrativeDocumentId: "existing-admindoc" }));
  });
});
