import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Res, StreamableFile, UseFilters, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import {
  AttachCandidateDocumentUseCase,
  DetachCandidateDocumentUseCase,
  DownloadCandidateDocumentUseCase,
  GetCandidateDocumentUseCase,
  ListCandidateDocumentsUseCase,
  ListCandidateDocumentVersionsUseCase,
  UpdateCandidateDocumentUseCase,
} from "../../application/use-cases/candidate-document.use-cases";
import { CandidateCapabilityErrorFilter } from "./candidate-capability-error.filter";
import { presentCandidateDocument } from "./candidate-document.presenters";
import { AttachCandidateDocumentBodySchema, IdParamSchema, UpdateCandidateDocumentBodySchema } from "./schemas";

/**
 * Checkpoint TENDEROS-2.1-CCV2-D — bibliothèque documentaire de l'entreprise candidate.
 *
 * PAS DE MULTIPART ICI, volontairement. Le téléversement d'un fichier et l'ajout d'une version
 * restent `POST /documents` et `POST /documents/:id/versions` : les redupliquer signifierait
 * réécrire la validation MIME, la sanitisation de nom, le checksum SHA-256, la clé de stockage et
 * la numérotation de version — c'est-à-dire le second moteur documentaire que la mission interdit.
 * Le parcours réel est donc « téléverser dans le moteur, puis rattacher à l'entreprise candidate »,
 * exactement le contrat déjà en place pour `/clients/:clientId/documents`.
 *
 * `DELETE` DISSOCIE : le fichier n'est jamais détruit depuis ici, car il peut rester rattaché à un
 * Tender ou à un dossier de réponse déjà déposé.
 *
 * Le téléchargement passe par cette route lorsqu'on veut le contexte candidate ; la route générique
 * `/documents/:id/download` reste disponible et applique désormais la MÊME garde bancaire, via le
 * port de rétrécissement (`CandidateDocumentAccessNarrowingService`).
 */
@Controller("candidate-companies/:candidateCompanyId/documents")
@UseFilters(CandidateCapabilityErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CandidateDocumentsController {
  constructor(
    private readonly listUseCase: ListCandidateDocumentsUseCase,
    private readonly attachUseCase: AttachCandidateDocumentUseCase,
    private readonly getUseCase: GetCandidateDocumentUseCase,
    private readonly downloadUseCase: DownloadCandidateDocumentUseCase,
    private readonly updateUseCase: UpdateCandidateDocumentUseCase,
    private readonly detachUseCase: DetachCandidateDocumentUseCase,
    private readonly listVersionsUseCase: ListCandidateDocumentVersionsUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
  ) {
    const items = await this.listUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorRole: membership.role,
    });
    return { items: items.map(presentCandidateDocument) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async attach(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Body(new ZodValidationPipe(AttachCandidateDocumentBodySchema)) body: Record<string, unknown>,
  ) {
    const created = await this.attachUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...(body as { documentId: string; category: string }),
    });
    return presentCandidateDocument({ association: created, temporalStatus: "NO_EXPIRY" });
  }

  @Get(":documentId")
  @HttpCode(HttpStatus.OK)
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    const view = await this.getUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
    return { ...presentCandidateDocument(view), document: view.document };
  }

  @Get(":documentId/download")
  @HttpCode(HttpStatus.OK)
  async download(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | void> {
    const result = await this.downloadUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
    });

    if (result.kind === "redirect") {
      res.redirect(result.url);
      return;
    }
    res.set({
      "Content-Type": result.contentType,
      "Content-Length": result.sizeBytes.toString(),
      "Content-Disposition": `attachment; filename="${result.filename.replace(/"/g, "")}"`,
    });
    return new StreamableFile(result.stream);
  }

  /**
   * Checkpoint CCV2-F.1 — historique des versions d'une pièce candidate. Façade : la liste vient du
   * moteur documentaire, jamais recalculée ; cette route ajoute la vérification que le Document est
   * réellement rattaché à CETTE entreprise candidate, et applique le palier de lecture de sa
   * catégorie (bancaire ou non). Un document non associé est traité comme inexistant.
   */
  @Get(":documentId/versions")
  @HttpCode(HttpStatus.OK)
  async listVersions(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    return this.listVersionsUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
  }

  @Patch(":documentId")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Body(new ZodValidationPipe(UpdateCandidateDocumentBodySchema)) body: Record<string, unknown>,
  ) {
    const updated = await this.updateUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      patch: body,
    });
    return presentCandidateDocument({ association: updated, temporalStatus: "NO_EXPIRY" });
  }

  @Delete(":documentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("candidateCompanyId", new ZodValidationPipe(IdParamSchema)) candidateCompanyId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ): Promise<void> {
    await this.detachUseCase.execute({
      organizationId: membership.organizationId,
      candidateCompanyId,
      documentId,
      actorId: actor.userId,
      actorRole: membership.role,
    });
  }
}
