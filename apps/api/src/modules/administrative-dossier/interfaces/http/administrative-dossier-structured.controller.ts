import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Res, StreamableFile, UseFilters, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AdministrativeFormType } from "../../domain/administrative-form-type";
import {
  GenerateOfficialFormUseCase,
  PrepareOfficialFormUseCase,
  PreviewOfficialFormUseCase,
  SaveOfficialFormDraftUseCase,
} from "../../application/use-cases/administrative-form.use-cases";
import { RecordAdministrativeDocumentSignatureUseCase, RejectAdministrativeDocumentSignatureUseCase, SetAdministrativeDocumentSignatureModeUseCase } from "../../application/use-cases/administrative-document-signature.use-cases";
import { EnsureConsortiumUseCase, GetConsortiumUseCase, UpdateConsortiumUseCase } from "../../application/use-cases/consortium.use-cases";
import { EnsureDc1DeclarationUseCase, GetDc1DeclarationUseCase, UpdateDc1DeclarationUseCase } from "../../application/use-cases/dc1-declaration.use-cases";
import { CreateDc2DeclarationVersionUseCase, EnsureDc2DeclarationUseCase, GetDc2DeclarationUseCase } from "../../application/use-cases/dc2-declaration.use-cases";
import { CreateDumeDeclarationVersionUseCase, EnsureDumeDeclarationUseCase, GetDumeDeclarationUseCase } from "../../application/use-cases/dume-declaration.use-cases";
import { EnsureEngagementActUseCase, FreezeEngagementActPricingUseCase, GetEngagementActUseCase, UnfreezeEngagementActPricingUseCase, UpdateEngagementActUseCase } from "../../application/use-cases/engagement-act.use-cases";
import { GenerateDc1DocumentUseCase } from "../../application/use-cases/generate-dc1-document.use-case";
import { GenerateDc2DocumentUseCase } from "../../application/use-cases/generate-dc2-document.use-case";
import { GenerateDumeDocumentUseCase } from "../../application/use-cases/generate-dume-document.use-case";
import { GenerateEngagementActDocumentUseCase } from "../../application/use-cases/generate-engagement-act-document.use-case";
import { GenerateSubcontractorDeclarationDocumentUseCase } from "../../application/use-cases/generate-subcontractor-declaration-document.use-case";
import { GetDumeXmlDraftUseCase } from "../../application/use-cases/get-dume-xml-draft.use-case";
import { CreateSigningPowerUseCase, ListSigningPowersUseCase, UpdateSigningPowerUseCase, VerifySigningPowerUseCase } from "../../application/use-cases/signing-power.use-cases";
import { CreateSubcontractorDeclarationUseCase, ListSubcontractorDeclarationsUseCase, UpdateSubcontractorDeclarationUseCase } from "../../application/use-cases/subcontractor-declaration.use-cases";
import { AdministrativeDossierErrorFilter } from "./administrative-dossier-error.filter";
import {
  CreateSigningPowerBodySchema,
  CreateStructuredDeclarationVersionBodySchema,
  CreateSubcontractorDeclarationBodySchema,
  EnsureConsortiumBodySchema,
  FreezeEngagementActPricingBodySchema,
  IdParamSchema,
  SaveDc4OfficialFormDraftBodySchema,
  SetAdministrativeDocumentSignatureModeBodySchema,
  UpdateConsortiumBodySchema,
  UpdateDc1DeclarationBodySchema,
  UpdateEngagementActBodySchema,
  UpdateSigningPowerBodySchema,
  UpdateSubcontractorDeclarationBodySchema,
  type CreateSigningPowerBody,
  type CreateStructuredDeclarationVersionBody,
  type CreateSubcontractorDeclarationBody,
  type EnsureConsortiumBody,
  type FreezeEngagementActPricingBody,
  type SaveDc4OfficialFormDraftBody,
  type SetAdministrativeDocumentSignatureModeBody,
  type UpdateConsortiumBody,
  type UpdateDc1DeclarationBody,
  type UpdateEngagementActBody,
  type UpdateSigningPowerBody,
  type UpdateSubcontractorDeclarationBody,
} from "./schemas";

/**
 * Sprint 8C Phase 2 — dossier administratif structuré : Groupement, DC1, DC2/DUME (+versions),
 * DC4 (sous-traitance), Acte d'engagement (+gel/dégel pricing), Pouvoirs, signature locale des
 * pièces. Même convention que `AdministrativeDossierController` (Phase 1) : les routes nichées sous
 * une ressource administrative (`/administrative-consortiums/:id`, etc.) n'ont pas de `tenderId`
 * dans l'URL, dérivé de la ressource chargée.
 */
@Controller()
@UseFilters(AdministrativeDossierErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class AdministrativeDossierStructuredController {
  constructor(
    private readonly ensureConsortiumUseCase: EnsureConsortiumUseCase,
    private readonly getConsortiumUseCase: GetConsortiumUseCase,
    private readonly updateConsortiumUseCase: UpdateConsortiumUseCase,

    private readonly ensureDc1UseCase: EnsureDc1DeclarationUseCase,
    private readonly getDc1UseCase: GetDc1DeclarationUseCase,
    private readonly updateDc1UseCase: UpdateDc1DeclarationUseCase,

    private readonly ensureDc2UseCase: EnsureDc2DeclarationUseCase,
    private readonly getDc2UseCase: GetDc2DeclarationUseCase,
    private readonly createDc2VersionUseCase: CreateDc2DeclarationVersionUseCase,

    private readonly ensureDumeUseCase: EnsureDumeDeclarationUseCase,
    private readonly getDumeUseCase: GetDumeDeclarationUseCase,
    private readonly createDumeVersionUseCase: CreateDumeDeclarationVersionUseCase,

    private readonly createSubcontractorUseCase: CreateSubcontractorDeclarationUseCase,
    private readonly updateSubcontractorUseCase: UpdateSubcontractorDeclarationUseCase,
    private readonly listSubcontractorsUseCase: ListSubcontractorDeclarationsUseCase,

    private readonly ensureEngagementActUseCase: EnsureEngagementActUseCase,
    private readonly getEngagementActUseCase: GetEngagementActUseCase,
    private readonly updateEngagementActUseCase: UpdateEngagementActUseCase,
    private readonly freezeEngagementActPricingUseCase: FreezeEngagementActPricingUseCase,
    private readonly unfreezeEngagementActPricingUseCase: UnfreezeEngagementActPricingUseCase,

    private readonly createSigningPowerUseCase: CreateSigningPowerUseCase,
    private readonly updateSigningPowerUseCase: UpdateSigningPowerUseCase,
    private readonly verifySigningPowerUseCase: VerifySigningPowerUseCase,
    private readonly listSigningPowersUseCase: ListSigningPowersUseCase,

    private readonly setSignatureModeUseCase: SetAdministrativeDocumentSignatureModeUseCase,
    private readonly recordSignatureUseCase: RecordAdministrativeDocumentSignatureUseCase,
    private readonly rejectSignatureUseCase: RejectAdministrativeDocumentSignatureUseCase,

    private readonly generateDc1DocumentUseCase: GenerateDc1DocumentUseCase,
    private readonly generateDc2DocumentUseCase: GenerateDc2DocumentUseCase,
    private readonly generateDumeDocumentUseCase: GenerateDumeDocumentUseCase,
    private readonly getDumeXmlDraftUseCase: GetDumeXmlDraftUseCase,
    private readonly generateSubcontractorDeclarationDocumentUseCase: GenerateSubcontractorDeclarationDocumentUseCase,
    private readonly generateEngagementActDocumentUseCase: GenerateEngagementActDocumentUseCase,

    private readonly prepareOfficialFormUseCase: PrepareOfficialFormUseCase,
    private readonly saveOfficialFormDraftUseCase: SaveOfficialFormDraftUseCase,
    private readonly previewOfficialFormUseCase: PreviewOfficialFormUseCase,
    private readonly generateOfficialFormUseCase: GenerateOfficialFormUseCase,
  ) {}

  // --- Consortium ---

  @Post("tenders/:tenderId/administrative-consortium")
  @HttpCode(HttpStatus.OK)
  async ensureConsortium(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(EnsureConsortiumBodySchema)) body: EnsureConsortiumBody,
  ) {
    return this.ensureConsortiumUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Get("tenders/:tenderId/administrative-consortium")
  async getConsortium(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getConsortiumUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Patch("administrative-consortiums/:id")
  async updateConsortium(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) consortiumId: string,
    @Body(new ZodValidationPipe(UpdateConsortiumBodySchema)) body: UpdateConsortiumBody,
  ) {
    return this.updateConsortiumUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, consortiumId, ...body });
  }

  // --- DC1 ---

  @Post("tenders/:tenderId/administrative-dc1")
  @HttpCode(HttpStatus.OK)
  async ensureDc1(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.ensureDc1UseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/administrative-dc1")
  async getDc1(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getDc1UseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Patch("administrative-dc1-declarations/:id")
  async updateDc1(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) dc1DeclarationId: string,
    @Body(new ZodValidationPipe(UpdateDc1DeclarationBodySchema)) body: UpdateDc1DeclarationBody,
  ) {
    return this.updateDc1UseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, dc1DeclarationId, ...body });
  }

  @Post("tenders/:tenderId/administrative-dc1/generate-pdf")
  @HttpCode(HttpStatus.OK)
  async generateDc1Document(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.generateDc1DocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  // --- DC2 ---

  @Post("tenders/:tenderId/administrative-dc2")
  @HttpCode(HttpStatus.OK)
  async ensureDc2(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.ensureDc2UseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/administrative-dc2")
  async getDc2(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getDc2UseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("administrative-dc2-declarations/:id/versions")
  @HttpCode(HttpStatus.CREATED)
  async createDc2Version(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) dc2DeclarationId: string,
    @Body(new ZodValidationPipe(CreateStructuredDeclarationVersionBodySchema)) body: CreateStructuredDeclarationVersionBody,
  ) {
    return this.createDc2VersionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, dc2DeclarationId, ...body });
  }

  @Post("tenders/:tenderId/administrative-dc2/generate-pdf")
  @HttpCode(HttpStatus.OK)
  async generateDc2Document(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.generateDc2DocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  // --- DUME ---

  @Post("tenders/:tenderId/administrative-dume")
  @HttpCode(HttpStatus.OK)
  async ensureDume(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.ensureDumeUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/administrative-dume")
  async getDume(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getDumeUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Post("administrative-dume-declarations/:id/versions")
  @HttpCode(HttpStatus.CREATED)
  async createDumeVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) dumeDeclarationId: string,
    @Body(new ZodValidationPipe(CreateStructuredDeclarationVersionBodySchema)) body: CreateStructuredDeclarationVersionBody,
  ) {
    return this.createDumeVersionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, dumeDeclarationId, ...body });
  }

  @Post("tenders/:tenderId/administrative-dume/generate-pdf")
  @HttpCode(HttpStatus.OK)
  async generateDumeDocument(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.generateDumeDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  /** Mission Phase 3 — brouillon XML NON officiel (ne respecte pas le schéma ESPD), jamais
   *  persisté, jamais visible dans `administrative-documents` ni dans un package de soumission. */
  @Get("tenders/:tenderId/administrative-dume/xml-draft")
  @HttpCode(HttpStatus.OK)
  async getDumeXmlDraft(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const draft = await this.getDumeXmlDraftUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
    res.set({
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${draft.fileName.replace(/"/g, "")}"`,
    });
    return new StreamableFile(Buffer.from(draft.xml, "utf-8"));
  }

  // --- Sous-traitance (DC4) ---

  @Post("tenders/:tenderId/administrative-subcontractors")
  @HttpCode(HttpStatus.CREATED)
  async createSubcontractor(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateSubcontractorDeclarationBodySchema)) body: CreateSubcontractorDeclarationBody,
  ) {
    return this.createSubcontractorUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Get("tenders/:tenderId/administrative-subcontractors")
  async listSubcontractors(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.listSubcontractorsUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Patch("administrative-subcontractors/:id")
  async updateSubcontractor(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string,
    @Body(new ZodValidationPipe(UpdateSubcontractorDeclarationBodySchema)) body: UpdateSubcontractorDeclarationBody,
  ) {
    return this.updateSubcontractorUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subcontractorDeclarationId, ...body });
  }

  @Post("administrative-subcontractors/:id/generate-pdf")
  @HttpCode(HttpStatus.OK)
  async generateSubcontractorDeclarationDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string,
  ) {
    return this.generateSubcontractorDeclarationDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subcontractorDeclarationId });
  }

  // --- Sprint 8C.1 — DC4, formulaire officiel + Annexe TenderOS ---
  // `documentType` est toujours DC4 sous cette ressource — le `tenderId` n'est jamais un paramètre
  // séparé, il est dérivé de `SubcontractorDeclaration` chargée en premier (même motif que
  // `generate-pdf` ci-dessus).

  @Get("administrative-subcontractors/:id/official-form")
  async prepareDc4OfficialForm(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string) {
    return this.prepareOfficialFormUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, documentType: AdministrativeFormType.Dc4, scopeId: subcontractorDeclarationId });
  }

  @Put("administrative-subcontractors/:id/official-form/draft")
  @HttpCode(HttpStatus.OK)
  async saveDc4OfficialFormDraft(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string,
    @Body(new ZodValidationPipe(SaveDc4OfficialFormDraftBodySchema)) body: SaveDc4OfficialFormDraftBody,
  ) {
    return this.saveOfficialFormDraftUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, documentType: AdministrativeFormType.Dc4, scopeId: subcontractorDeclarationId, data: body });
  }

  /** Mission §17 — toujours filigrané, jamais persisté. */
  @Get("administrative-subcontractors/:id/official-form/preview")
  @HttpCode(HttpStatus.OK)
  async previewDc4OfficialForm(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const rendered = await this.previewOfficialFormUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, documentType: AdministrativeFormType.Dc4, scopeId: subcontractorDeclarationId });
    res.set({
      "Content-Type": rendered.mimeType,
      "Content-Disposition": `attachment; filename="${rendered.fileNameBase}.docx"`,
    });
    return new StreamableFile(rendered.buffer);
  }

  @Post("administrative-subcontractors/:id/official-form/generate")
  @HttpCode(HttpStatus.OK)
  async generateDc4OfficialForm(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) subcontractorDeclarationId: string) {
    return this.generateOfficialFormUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, documentType: AdministrativeFormType.Dc4, scopeId: subcontractorDeclarationId });
  }

  // --- Acte d'engagement ---

  @Post("tenders/:tenderId/administrative-engagement-act")
  @HttpCode(HttpStatus.OK)
  async ensureEngagementAct(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.ensureEngagementActUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Get("tenders/:tenderId/administrative-engagement-act")
  async getEngagementAct(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.getEngagementActUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Patch("administrative-engagement-acts/:id")
  async updateEngagementAct(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) engagementActId: string,
    @Body(new ZodValidationPipe(UpdateEngagementActBodySchema)) body: UpdateEngagementActBody,
  ) {
    return this.updateEngagementActUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, engagementActId, ...body });
  }

  @Post("administrative-engagement-acts/:id/freeze-pricing")
  @HttpCode(HttpStatus.OK)
  async freezeEngagementActPricing(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) engagementActId: string,
    @Body(new ZodValidationPipe(FreezeEngagementActPricingBodySchema)) body: FreezeEngagementActPricingBody,
  ) {
    return this.freezeEngagementActPricingUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, engagementActId, ...body });
  }

  @Post("administrative-engagement-acts/:id/unfreeze-pricing")
  @HttpCode(HttpStatus.OK)
  async unfreezeEngagementActPricing(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) engagementActId: string) {
    return this.unfreezeEngagementActPricingUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, engagementActId });
  }

  @Post("tenders/:tenderId/administrative-engagement-act/generate-pdf")
  @HttpCode(HttpStatus.OK)
  async generateEngagementActDocument(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.generateEngagementActDocumentUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  // --- Pouvoirs ---

  @Post("tenders/:tenderId/administrative-signing-powers")
  @HttpCode(HttpStatus.CREATED)
  async createSigningPower(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateSigningPowerBodySchema)) body: CreateSigningPowerBody,
  ) {
    return this.createSigningPowerUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId, ...body });
  }

  @Get("tenders/:tenderId/administrative-signing-powers")
  async listSigningPowers(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string) {
    return this.listSigningPowersUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, tenderId });
  }

  @Patch("administrative-signing-powers/:id")
  async updateSigningPower(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) signingPowerId: string,
    @Body(new ZodValidationPipe(UpdateSigningPowerBodySchema)) body: UpdateSigningPowerBody,
  ) {
    return this.updateSigningPowerUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, signingPowerId, ...body });
  }

  @Post("administrative-signing-powers/:id/verify")
  @HttpCode(HttpStatus.OK)
  async verifySigningPower(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) signingPowerId: string) {
    return this.verifySigningPowerUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, signingPowerId });
  }

  // --- Signature locale des pièces administratives ---

  @Post("administrative-documents/:id/signature-mode")
  @HttpCode(HttpStatus.OK)
  async setSignatureMode(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(SetAdministrativeDocumentSignatureModeBodySchema)) body: SetAdministrativeDocumentSignatureModeBody,
  ) {
    return this.setSignatureModeUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, administrativeDocumentId: documentId, ...body });
  }

  @Post("administrative-documents/:id/signature/record")
  @HttpCode(HttpStatus.OK)
  async recordSignature(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) documentId: string) {
    return this.recordSignatureUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, administrativeDocumentId: documentId });
  }

  @Post("administrative-documents/:id/signature/reject")
  @HttpCode(HttpStatus.OK)
  async rejectSignature(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) documentId: string) {
    return this.rejectSignatureUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, administrativeDocumentId: documentId });
  }
}
