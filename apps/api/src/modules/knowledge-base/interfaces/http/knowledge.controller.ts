import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UploadedFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { getRequiredEnv } from "../../../../shared-kernel/env";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AddKnowledgeDocumentUseCase } from "../../application/use-cases/add-knowledge-document.use-case";
import { AddKnowledgeTagUseCase } from "../../application/use-cases/add-knowledge-tag.use-case";
import { ArchiveKnowledgeEntryUseCase } from "../../application/use-cases/archive-knowledge-entry.use-case";
import { CreateKnowledgeEntryUseCase } from "../../application/use-cases/create-knowledge-entry.use-case";
import { DeleteKnowledgeEntryUseCase } from "../../application/use-cases/delete-knowledge-entry.use-case";
import { DeleteKnowledgeTagUseCase } from "../../application/use-cases/delete-knowledge-tag.use-case";
import { GetKnowledgeDocumentUseCase } from "../../application/use-cases/get-knowledge-document.use-case";
import { GetKnowledgeEntryUseCase } from "../../application/use-cases/get-knowledge-entry.use-case";
import { GetKnowledgeVersionUseCase } from "../../application/use-cases/get-knowledge-version.use-case";
import { GetOrCreateDefaultKnowledgeSpaceUseCase } from "../../application/use-cases/get-or-create-default-knowledge-space.use-case";
import { ListKnowledgeDocumentsUseCase } from "../../application/use-cases/list-knowledge-documents.use-case";
import { ListKnowledgeEntriesUseCase } from "../../application/use-cases/list-knowledge-entries.use-case";
import { ListKnowledgeTagsUseCase } from "../../application/use-cases/list-knowledge-tags.use-case";
import { ListKnowledgeVersionsUseCase } from "../../application/use-cases/list-knowledge-versions.use-case";
import { RemoveKnowledgeTagUseCase } from "../../application/use-cases/remove-knowledge-tag.use-case";
import { ReprocessKnowledgeDocumentUseCase } from "../../application/use-cases/reprocess-knowledge-document.use-case";
import { RestoreKnowledgeEntryUseCase } from "../../application/use-cases/restore-knowledge-entry.use-case";
import { RestoreKnowledgeVersionUseCase } from "../../application/use-cases/restore-knowledge-version.use-case";
import { SearchKnowledgeBaseUseCase } from "../../application/use-cases/search-knowledge-base.use-case";
import { UpdateKnowledgeEntryUseCase } from "../../application/use-cases/update-knowledge-entry.use-case";
import { KnowledgeErrorFilter } from "./knowledge-error.filter";
import {
  presentKnowledgeDocument,
  presentKnowledgeDocumentDetail,
  presentKnowledgeEntry,
  presentKnowledgeEntryVersion,
  presentKnowledgeSearchResult,
  presentKnowledgeSpace,
  presentKnowledgeTag,
  presentPage,
} from "./presenters";
import {
  AddKnowledgeDocumentBodySchema,
  AddKnowledgeTagBodySchema,
  CreateKnowledgeEntryBodySchema,
  IdParamSchema,
  ListKnowledgeEntriesQuerySchema,
  SearchKnowledgeBaseQuerySchema,
  UpdateKnowledgeEntryBodySchema,
  VersionNumberParamSchema,
  type AddKnowledgeDocumentBody,
  type AddKnowledgeTagBody,
  type CreateKnowledgeEntryBody,
  type ListKnowledgeEntriesQuery,
  type SearchKnowledgeBaseQuery,
  type UpdateKnowledgeEntryBody,
} from "./schemas";

const MULTER_HARD_CEILING_BYTES = 100 * 1024 * 1024;

function maxKnowledgeDocumentFileSizeBytes(): number {
  return Number(getRequiredEnv("DOCUMENT_MAX_FILE_SIZE_MB")) * 1024 * 1024;
}

/** Parse le champ `metadata` (chaîne JSON, mission §6 "corps multipart") — jamais un JSON brut non
 *  contrôlé : la validation par catégorie a lieu dans le use case (mission §5). */
function parseMetadataField(raw: string | undefined): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined; // rejeté par validateKnowledgeMetadata (forme invalide) avec un message clair
  }
}

function parseTagsField(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Contrôleur Knowledge Base (mission Sprint 5) — un seul contrôleur pour toutes les sous-ressources
 * d'une entrée (documents/versions/tags), même motif que le contrôleur Tenders : les sous-ressources
 * sont trop couplées à leur entrée parente pour justifier des contrôleurs séparés. Reste mince :
 * aucune règle métier, aucun accès Prisma direct, toute la logique vit dans les use cases.
 */
@Controller("knowledge")
@UseFilters(KnowledgeErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class KnowledgeController {
  constructor(
    private readonly getOrCreateDefaultKnowledgeSpaceUseCase: GetOrCreateDefaultKnowledgeSpaceUseCase,
    private readonly createKnowledgeEntryUseCase: CreateKnowledgeEntryUseCase,
    private readonly getKnowledgeEntryUseCase: GetKnowledgeEntryUseCase,
    private readonly listKnowledgeEntriesUseCase: ListKnowledgeEntriesUseCase,
    private readonly updateKnowledgeEntryUseCase: UpdateKnowledgeEntryUseCase,
    private readonly archiveKnowledgeEntryUseCase: ArchiveKnowledgeEntryUseCase,
    private readonly restoreKnowledgeEntryUseCase: RestoreKnowledgeEntryUseCase,
    private readonly deleteKnowledgeEntryUseCase: DeleteKnowledgeEntryUseCase,
    private readonly addKnowledgeDocumentUseCase: AddKnowledgeDocumentUseCase,
    private readonly listKnowledgeDocumentsUseCase: ListKnowledgeDocumentsUseCase,
    private readonly getKnowledgeDocumentUseCase: GetKnowledgeDocumentUseCase,
    private readonly reprocessKnowledgeDocumentUseCase: ReprocessKnowledgeDocumentUseCase,
    private readonly searchKnowledgeBaseUseCase: SearchKnowledgeBaseUseCase,
    private readonly listKnowledgeVersionsUseCase: ListKnowledgeVersionsUseCase,
    private readonly getKnowledgeVersionUseCase: GetKnowledgeVersionUseCase,
    private readonly restoreKnowledgeVersionUseCase: RestoreKnowledgeVersionUseCase,
    private readonly listKnowledgeTagsUseCase: ListKnowledgeTagsUseCase,
    private readonly addKnowledgeTagUseCase: AddKnowledgeTagUseCase,
    private readonly removeKnowledgeTagUseCase: RemoveKnowledgeTagUseCase,
    private readonly deleteKnowledgeTagUseCase: DeleteKnowledgeTagUseCase,
  ) {}

  // ---- Espaces ----

  @Get("spaces/default")
  @HttpCode(HttpStatus.OK)
  async getDefaultSpace(@CurrentMembershipContext() membership: MembershipContext) {
    const result = await this.getOrCreateDefaultKnowledgeSpaceUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
    return presentKnowledgeSpace(result);
  }

  // ---- Entrées ----

  @Post("entries")
  @HttpCode(HttpStatus.CREATED)
  async createEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateKnowledgeEntryBodySchema)) body: CreateKnowledgeEntryBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createKnowledgeEntryUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      title: body.title,
      description: body.description,
      category: body.category,
      language: body.language,
      metadata: body.metadata,
      tags: body.tags,
      requestId: request.id,
    });
    return presentKnowledgeEntry(result);
  }

  @Get("entries")
  @HttpCode(HttpStatus.OK)
  async listEntries(
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListKnowledgeEntriesQuerySchema)) query: ListKnowledgeEntriesQuery,
  ) {
    const result = await this.listKnowledgeEntriesUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, ...query });
    return { ...presentPage(result.items.map(presentKnowledgeEntry), result.nextCursor), total: result.total };
  }

  @Get("entries/:entryId")
  @HttpCode(HttpStatus.OK)
  async getEntry(@CurrentMembershipContext() membership: MembershipContext, @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string) {
    const result = await this.getKnowledgeEntryUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, actorRole: membership.role });
    return presentKnowledgeEntry(result);
  }

  @Patch("entries/:entryId")
  @HttpCode(HttpStatus.OK)
  async updateEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Body(new ZodValidationPipe(UpdateKnowledgeEntryBodySchema)) body: UpdateKnowledgeEntryBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.updateKnowledgeEntryUseCase.execute({
      organizationId: membership.organizationId,
      knowledgeEntryId: entryId,
      actorId: actor.userId,
      actorRole: membership.role,
      ...body,
      requestId: request.id,
    });
    return presentKnowledgeEntry(result);
  }

  @Delete("entries/:entryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteKnowledgeEntryUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Post("entries/:entryId/archive")
  @HttpCode(HttpStatus.OK)
  async archiveEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.archiveKnowledgeEntryUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
    return presentKnowledgeEntry(result);
  }

  @Post("entries/:entryId/restore")
  @HttpCode(HttpStatus.OK)
  async restoreEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.restoreKnowledgeEntryUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
    return presentKnowledgeEntry(result);
  }

  // ---- Documents ----

  /** Crée une NOUVELLE entrée à partir d'un document importé (mission §"...ou création d'une
   *  nouvelle entrée selon le contrat choisi") — jamais `entries/:entryId/documents`, réservée à
   *  l'ajout d'un document à une entrée déjà EXISTANTE (voir ci-dessous). */
  @Post("documents")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async createEntryFromDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(AddKnowledgeDocumentBodySchema)) body: AddKnowledgeDocumentBody,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithId,
  ) {
    const result = await this.addKnowledgeDocumentUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      title: body.title,
      description: body.description,
      category: body.category,
      language: body.language,
      metadata: parseMetadataField(body.metadata),
      tags: parseTagsField(body.tags),
      file: { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype },
      maxFileSizeBytes: maxKnowledgeDocumentFileSizeBytes(),
      requestId: request.id,
    });
    return presentKnowledgeEntry(result);
  }

  @Post("entries/:entryId/documents")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async addDocumentToEntry(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Body(new ZodValidationPipe(AddKnowledgeDocumentBodySchema)) body: AddKnowledgeDocumentBody,
    @UploadedFile() file: Express.Multer.File,
    @Req() request: RequestWithId,
  ) {
    const result = await this.addKnowledgeDocumentUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      knowledgeEntryId: entryId,
      tags: parseTagsField(body.tags),
      file: { buffer: file.buffer, originalFilename: file.originalname, mimeType: file.mimetype },
      maxFileSizeBytes: maxKnowledgeDocumentFileSizeBytes(),
      requestId: request.id,
    });
    return presentKnowledgeEntry(result);
  }

  @Get("entries/:entryId/documents")
  @HttpCode(HttpStatus.OK)
  async listDocuments(@CurrentMembershipContext() membership: MembershipContext, @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string) {
    const results = await this.listKnowledgeDocumentsUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, actorRole: membership.role });
    return results.map(presentKnowledgeDocument);
  }

  @Get("entries/:entryId/documents/:documentId")
  @HttpCode(HttpStatus.OK)
  async getDocument(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
  ) {
    const result = await this.getKnowledgeDocumentUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, knowledgeDocumentId: documentId, actorRole: membership.role });
    return presentKnowledgeDocumentDetail(result);
  }

  @Post("entries/:entryId/documents/:documentId/reprocess")
  @HttpCode(HttpStatus.ACCEPTED)
  async reprocessDocument(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Param("documentId", new ZodValidationPipe(IdParamSchema)) documentId: string,
    @Req() request: RequestWithId,
  ) {
    const result = await this.reprocessKnowledgeDocumentUseCase.execute({
      organizationId: membership.organizationId,
      knowledgeEntryId: entryId,
      knowledgeDocumentId: documentId,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentKnowledgeDocument(result);
  }

  // ---- Recherche ----

  @Get("search")
  @HttpCode(HttpStatus.OK)
  async search(@CurrentMembershipContext() membership: MembershipContext, @Query(new ZodValidationPipe(SearchKnowledgeBaseQuerySchema)) query: SearchKnowledgeBaseQuery) {
    const result = await this.searchKnowledgeBaseUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, ...query });
    return { items: result.items.map(presentKnowledgeSearchResult), total: result.total };
  }

  // ---- Versions ----

  @Get("entries/:entryId/versions")
  @HttpCode(HttpStatus.OK)
  async listVersions(@CurrentMembershipContext() membership: MembershipContext, @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string) {
    const results = await this.listKnowledgeVersionsUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, actorRole: membership.role });
    return results.map(presentKnowledgeEntryVersion);
  }

  @Get("entries/:entryId/versions/:versionNumber")
  @HttpCode(HttpStatus.OK)
  async getVersion(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Param("versionNumber", new ZodValidationPipe(VersionNumberParamSchema)) versionNumber: number,
  ) {
    const result = await this.getKnowledgeVersionUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, versionNumber, actorRole: membership.role });
    return presentKnowledgeEntryVersion(result);
  }

  @Post("entries/:entryId/versions/:versionNumber/restore")
  @HttpCode(HttpStatus.OK)
  async restoreVersion(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Param("versionNumber", new ZodValidationPipe(VersionNumberParamSchema)) versionNumber: number,
    @Req() request: RequestWithId,
  ) {
    const result = await this.restoreKnowledgeVersionUseCase.execute({
      organizationId: membership.organizationId,
      knowledgeEntryId: entryId,
      versionNumber,
      actorId: actor.userId,
      actorRole: membership.role,
      requestId: request.id,
    });
    return presentKnowledgeEntry(result);
  }

  // ---- Tags ----

  @Get("tags")
  @HttpCode(HttpStatus.OK)
  async listTags(@CurrentMembershipContext() membership: MembershipContext) {
    const results = await this.listKnowledgeTagsUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
    return results.map(presentKnowledgeTag);
  }

  @Post("entries/:entryId/tags")
  @HttpCode(HttpStatus.CREATED)
  async addTag(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Body(new ZodValidationPipe(AddKnowledgeTagBodySchema)) body: AddKnowledgeTagBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.addKnowledgeTagUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, actorId: actor.userId, actorRole: membership.role, label: body.label, requestId: request.id });
    return presentKnowledgeTag(result);
  }

  @Delete("entries/:entryId/tags/:tagId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTag(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("entryId", new ZodValidationPipe(IdParamSchema)) entryId: string,
    @Param("tagId", new ZodValidationPipe(IdParamSchema)) tagId: string,
    @Req() request: RequestWithId,
  ) {
    await this.removeKnowledgeTagUseCase.execute({ organizationId: membership.organizationId, knowledgeEntryId: entryId, tagId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Delete("tags/:tagId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTag(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tagId", new ZodValidationPipe(IdParamSchema)) tagId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteKnowledgeTagUseCase.execute({ organizationId: membership.organizationId, tagId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }
}
