import { Inject, Injectable } from "@nestjs/common";
import { CLOCK, type Clock } from "../../../../shared-kernel/clock";
import { ID_GENERATOR, type IdGenerator } from "../../../../shared-kernel/id-generator";
import { ClientPermission } from "../../../client-portfolio";
import { DOCUMENT_RENDERER, type DocumentRendererPort } from "../../../export";
import { AdministrativeFormDraft } from "../../domain/administrative-form-draft.aggregate";
import { AdministrativeFormType } from "../../domain/administrative-form-type";
import { AdministrativeFormNotReadyForGenerationError, UnsupportedAdministrativeFormTypeError } from "../../domain/errors";
import type { FormFieldIssue } from "../../domain/form-field-issue";
import { AdministrativeGeneratedDocumentService } from "../services/administrative-generated-document.service";
import { AdministrativeDossierAccessService } from "../services/administrative-dossier-access.service";
import { AdministrativeFormDataAssembler } from "../services/administrative-form-data-assembler.service";
import { mapDc4Form } from "../services/form-mappers/dc4-form-mapper";
import type { AdministrativeDocumentSummary } from "../dtos";
import { ADMINISTRATIVE_FORM_DRAFT_REPOSITORY, type AdministrativeFormDraftRepository } from "../ports/administrative-form-draft.repository";
import { BUYER_PROVIDED_FORM_TEMPLATE_REPOSITORY, type BuyerProvidedFormTemplateRepository } from "../ports/buyer-provided-form-template.repository";
import { OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY, type OfficialAdministrativeTemplateRepository } from "../ports/official-administrative-template.repository";
import { SUBCONTRACTOR_DECLARATION_REPOSITORY, type SubcontractorDeclarationRepository } from "../ports/subcontractor-declaration.repository";

export type ReferenceTemplateInfo = Readonly<
  | { kind: "OFFICIAL"; officialTemplateId: string; officialName: string; version: number; fileDocumentId: string; fileDocumentVersionId: string }
  | { kind: "BUYER"; fileDocumentId: string; fileDocumentVersionId: string }
>;

export type OfficialFormPreparationResult = Readonly<{
  documentType: AdministrativeFormType;
  scopeId: string;
  values: Record<string, string>;
  fieldSources: Record<string, string>;
  missingFields: readonly FormFieldIssue[];
  warnings: readonly FormFieldIssue[];
  canGenerate: boolean;
  referenceTemplate?: ReferenceTemplateInfo | undefined;
  administrativeDocumentId?: string | undefined;
}>;

/** Sprint 8C.1 — priorité de résolution mission §6/§7 : modèle acheteur désigné manuellement en
 *  premier, sinon le gabarit officiel actif de l'organisation, sinon le gabarit système par défaut.
 *  Aucune valeur retournée si rien n'est configuré — jamais un gabarit inventé. */
async function resolveReferenceTemplate(input: {
  organizationId: string;
  tenderId: string;
  documentType: AdministrativeFormType;
  buyerRepository: BuyerProvidedFormTemplateRepository;
  officialTemplateRepository: OfficialAdministrativeTemplateRepository;
}): Promise<ReferenceTemplateInfo | undefined> {
  const buyerTemplate = await input.buyerRepository.find({ organizationId: input.organizationId, tenderId: input.tenderId, documentType: input.documentType });
  if (buyerTemplate) {
    return { kind: "BUYER", fileDocumentId: buyerTemplate.documentId, fileDocumentVersionId: buyerTemplate.documentVersionId };
  }
  const orgTemplate = await input.officialTemplateRepository.findActiveForOrganization({ organizationId: input.organizationId, documentType: input.documentType });
  const officialTemplate = orgTemplate ?? (await input.officialTemplateRepository.findActiveSystemWide({ documentType: input.documentType }));
  if (!officialTemplate) return undefined;
  return {
    kind: "OFFICIAL",
    officialTemplateId: officialTemplate.id,
    officialName: officialTemplate.officialName,
    version: officialTemplate.version,
    fileDocumentId: officialTemplate.fileDocumentId,
    fileDocumentVersionId: officialTemplate.fileDocumentVersionId,
  };
}

function assertSupportedFormType(documentType: AdministrativeFormType): void {
  if (documentType !== AdministrativeFormType.Dc4) {
    throw new UnsupportedAdministrativeFormTypeError();
  }
}

export type OfficialFormCommand = Readonly<{
  organizationId: string;
  actorId: string;
  actorRole: string;
  documentType: AdministrativeFormType;
  /** DC4 : id de la `SubcontractorDeclaration` concernée (mission §12, plusieurs DC4 par Tender).
   *  Le `tenderId` n'est jamais un paramètre séparé non vérifié — il est TOUJOURS dérivé de cette
   *  ressource, chargée en premier via un repository déjà filtré par organisation. */
  scopeId: string;
}>;

export type PrepareOfficialFormCommand = OfficialFormCommand;

/** Sprint 8C.1 — assemble les données source + le brouillon existant + résout le gabarit de
 *  référence, sans jamais écrire (mission "Prévisualisation/Préparation ne génèrent jamais de
 *  fichier"). Réutilisé tel quel par Preview/Generate pour ne jamais dupliquer cette lecture. */
@Injectable()
export class PrepareOfficialFormUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly assembler: AdministrativeFormDataAssembler,
    @Inject(ADMINISTRATIVE_FORM_DRAFT_REPOSITORY) private readonly draftRepository: AdministrativeFormDraftRepository,
    @Inject(BUYER_PROVIDED_FORM_TEMPLATE_REPOSITORY) private readonly buyerRepository: BuyerProvidedFormTemplateRepository,
    @Inject(OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY) private readonly officialTemplateRepository: OfficialAdministrativeTemplateRepository,
  ) {}

  async execute(command: PrepareOfficialFormCommand): Promise<OfficialFormPreparationResult> {
    assertSupportedFormType(command.documentType);

    const source = await this.assembler.assembleForDc4({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, subcontractorDeclarationId: command.scopeId });
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: source.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const draft = await this.draftRepository.find({ organizationId: command.organizationId, tenderId: source.tenderId, documentType: command.documentType, scopeId: command.scopeId });
    const overrides = draft ? (draft.data as Record<string, string>) : undefined;

    const mapped = mapDc4Form({ declaration: source.declaration, tenderTitle: source.tenderTitle, overrides });
    const referenceTemplate = await resolveReferenceTemplate({ organizationId: command.organizationId, tenderId: source.tenderId, documentType: command.documentType, buyerRepository: this.buyerRepository, officialTemplateRepository: this.officialTemplateRepository });

    return {
      documentType: command.documentType,
      scopeId: command.scopeId,
      values: mapped.values,
      fieldSources: mapped.fieldSources,
      missingFields: mapped.missingFields,
      warnings: mapped.warnings,
      canGenerate: mapped.missingFields.every((issue) => !issue.blocking) && referenceTemplate !== undefined,
      referenceTemplate,
      administrativeDocumentId: source.declaration.administrativeDocumentId,
    };
  }
}

export type SaveOfficialFormDraftCommand = OfficialFormCommand & Readonly<{ data: Readonly<Record<string, string | undefined>> }>;

/** Sprint 8C.1 — la surcharge reste LOCALE au brouillon (mission §6) : ne modifie jamais
 *  `SubcontractorDeclaration` ni aucune autre fiche maîtresse. */
@Injectable()
export class SaveOfficialFormDraftUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly assembler: AdministrativeFormDataAssembler,
    @Inject(ADMINISTRATIVE_FORM_DRAFT_REPOSITORY) private readonly draftRepository: AdministrativeFormDraftRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async execute(command: SaveOfficialFormDraftCommand): Promise<OfficialFormPreparationResult> {
    assertSupportedFormType(command.documentType);

    const source = await this.assembler.assembleForDc4({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, subcontractorDeclarationId: command.scopeId });
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: source.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const occurredAt = this.clock.now();
    const existing = await this.draftRepository.find({ organizationId: command.organizationId, tenderId: source.tenderId, documentType: command.documentType, scopeId: command.scopeId });
    if (existing) {
      existing.updateData({ data: command.data, updatedBy: command.actorId, occurredAt });
      await this.draftRepository.save(existing);
    } else {
      const draft = AdministrativeFormDraft.create({
        id: this.idGenerator.generate(),
        organizationId: command.organizationId,
        tenderId: source.tenderId,
        documentType: command.documentType,
        scopeId: command.scopeId,
        data: command.data,
        updatedBy: command.actorId,
        occurredAt,
      });
      await this.draftRepository.create(draft);
    }

    const mapped = mapDc4Form({ declaration: source.declaration, tenderTitle: source.tenderTitle, overrides: command.data });
    return {
      documentType: command.documentType,
      scopeId: command.scopeId,
      values: mapped.values,
      fieldSources: mapped.fieldSources,
      missingFields: mapped.missingFields,
      warnings: mapped.warnings,
      canGenerate: mapped.missingFields.every((issue) => !issue.blocking),
      administrativeDocumentId: source.declaration.administrativeDocumentId,
    };
  }
}

export type PreviewOfficialFormCommand = OfficialFormCommand;
export type OfficialFormRenderedFile = Readonly<{ buffer: Buffer; fileNameBase: string; mimeType: string }>;

/** Sprint 8C.1 — mission §17 : un aperçu est TOUJOURS filigrané, jamais persisté, jamais compté
 *  comme validé ni auto-inclus dans le dossier de soumission. Même pipeline de rendu que
 *  `GenerateOfficialFormUseCase`, jamais un second moteur de rendu "aperçu". */
@Injectable()
export class PreviewOfficialFormUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly assembler: AdministrativeFormDataAssembler,
    @Inject(ADMINISTRATIVE_FORM_DRAFT_REPOSITORY) private readonly draftRepository: AdministrativeFormDraftRepository,
    @Inject(DOCUMENT_RENDERER) private readonly documentRenderer: DocumentRendererPort,
  ) {}

  async execute(command: PreviewOfficialFormCommand): Promise<OfficialFormRenderedFile> {
    assertSupportedFormType(command.documentType);

    const source = await this.assembler.assembleForDc4({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, subcontractorDeclarationId: command.scopeId });
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: source.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const draft = await this.draftRepository.find({ organizationId: command.organizationId, tenderId: source.tenderId, documentType: command.documentType, scopeId: command.scopeId });
    const overrides = draft ? (draft.data as Record<string, string>) : undefined;
    const mapped = mapDc4Form({ declaration: source.declaration, tenderTitle: source.tenderTitle, overrides });

    const buffer = await this.documentRenderer.render({ ...mapped.renderable, watermarkText: "APERÇU — NON VALIDÉ" });
    return { buffer, fileNameBase: "annexe-tenderos-dc4-apercu", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
}

export type GenerateOfficialFormCommand = OfficialFormCommand;

/** Sprint 8C.1 — génère l'Annexe TenderOS (DOCX) et l'attache comme nouvelle révision de la pièce
 *  administrative DC4, snapshot figé (mission §9 "reproductible même si les données changent
 *  ensuite") — le formulaire officiel intact n'est JAMAIS régénéré ni modifié ici, seule l'Annexe
 *  l'est. */
@Injectable()
export class GenerateOfficialFormUseCase {
  constructor(
    private readonly accessService: AdministrativeDossierAccessService,
    private readonly assembler: AdministrativeFormDataAssembler,
    @Inject(ADMINISTRATIVE_FORM_DRAFT_REPOSITORY) private readonly draftRepository: AdministrativeFormDraftRepository,
    @Inject(BUYER_PROVIDED_FORM_TEMPLATE_REPOSITORY) private readonly buyerRepository: BuyerProvidedFormTemplateRepository,
    @Inject(OFFICIAL_ADMINISTRATIVE_TEMPLATE_REPOSITORY) private readonly officialTemplateRepository: OfficialAdministrativeTemplateRepository,
    @Inject(SUBCONTRACTOR_DECLARATION_REPOSITORY) private readonly subcontractorRepository: SubcontractorDeclarationRepository,
    @Inject(DOCUMENT_RENDERER) private readonly documentRenderer: DocumentRendererPort,
    private readonly generatedDocumentService: AdministrativeGeneratedDocumentService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GenerateOfficialFormCommand): Promise<AdministrativeDocumentSummary> {
    assertSupportedFormType(command.documentType);

    const source = await this.assembler.assembleForDc4({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, subcontractorDeclarationId: command.scopeId });
    await this.accessService.assertTenderAccess({ organizationId: command.organizationId, actorId: command.actorId, actorRole: command.actorRole, tenderId: source.tenderId, permission: ClientPermission.ManageAdministrativeDocuments });

    const draft = await this.draftRepository.find({ organizationId: command.organizationId, tenderId: source.tenderId, documentType: command.documentType, scopeId: command.scopeId });
    const overrides = draft ? (draft.data as Record<string, string>) : undefined;
    const mapped = mapDc4Form({ declaration: source.declaration, tenderTitle: source.tenderTitle, overrides });

    if (mapped.missingFields.some((issue) => issue.blocking)) {
      throw new AdministrativeFormNotReadyForGenerationError(mapped.missingFields.filter((issue) => issue.blocking).map((issue) => issue.code));
    }

    const referenceTemplate = await resolveReferenceTemplate({ organizationId: command.organizationId, tenderId: source.tenderId, documentType: command.documentType, buyerRepository: this.buyerRepository, officialTemplateRepository: this.officialTemplateRepository });
    if (!referenceTemplate) {
      throw new AdministrativeFormNotReadyForGenerationError(["OFFICIAL_TEMPLATE_NOT_CONFIGURED"]);
    }

    const buffer = await this.documentRenderer.render(mapped.renderable);

    const summary = await this.generatedDocumentService.attachGeneratedDocument({
      organizationId: command.organizationId,
      actorId: command.actorId,
      actorRole: command.actorRole,
      tenderId: source.tenderId,
      documentType: command.documentType,
      label: `Annexe TenderOS — DC4 (${source.declaration.subcontractorName})`,
      existingAdministrativeDocumentId: source.declaration.administrativeDocumentId,
      format: "DOCX",
      fileBuffer: buffer,
      fileNameBase: "annexe-tenderos-dc4",
      officialTemplateId: referenceTemplate.kind === "OFFICIAL" ? referenceTemplate.officialTemplateId : undefined,
      formDataSnapshot: mapped.values,
    });

    if (source.declaration.administrativeDocumentId === undefined) {
      source.declaration.linkDocument({ administrativeDocumentId: summary.id, occurredAt: this.clock.now() });
      await this.subcontractorRepository.save(source.declaration);
    }

    return summary;
  }
}
