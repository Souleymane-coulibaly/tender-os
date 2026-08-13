import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import type { ConnectorProvider } from "../../domain/enums";
import { BrowseRemoteFolderUseCase } from "../../application/use-cases/browse-remote-folder.use-case";
import { CreateCalendarEventForTenderUseCase } from "../../application/use-cases/create-calendar-event-for-tender.use-case";
import { DisconnectExternalConnectionUseCase } from "../../application/use-cases/disconnect-external-connection.use-case";
import { ExportDocumentVersionUseCase } from "../../application/use-cases/export-document-version.use-case";
import { ImportRemoteFileUseCase } from "../../application/use-cases/import-remote-file.use-case";
import { InitiateOAuthConnectionUseCase } from "../../application/use-cases/initiate-oauth-connection.use-case";
import { InitiateReauthorizationUseCase } from "../../application/use-cases/initiate-reauthorization.use-case";
import { ListExternalConnectionsUseCase } from "../../application/use-cases/list-external-connections.use-case";
import { TestConnectionUseCase } from "../../application/use-cases/test-connection.use-case";
import { ConnectorsErrorFilter } from "./connectors-error.filter";
import {
  BrowseFolderQuerySchema,
  CreateCalendarEventBodySchema,
  ExportVersionBodySchema,
  IdParamSchema,
  ImportFileBodySchema,
  InitiateConnectionBodySchema,
  type BrowseFolderQuery,
  type CreateCalendarEventBody,
  type ExportVersionBody,
  type ImportFileBody,
  type InitiateConnectionBody,
} from "./schemas";

/**
 * Mission §65-75 — écran "Intégrations" : connecter/lister/déconnecter/réautoriser une connexion,
 * naviguer un dossier distant, importer/exporter un document, créer un événement calendrier. Le
 * callback OAuth lui-même vit dans `ConnectorsOAuthCallbackController`, SANS ces guards (mission
 * §54, voir son commentaire de sécurité dédié).
 */
@Controller("connectors")
@UseFilters(ConnectorsErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ConnectorsController {
  constructor(
    private readonly initiateOAuthConnectionUseCase: InitiateOAuthConnectionUseCase,
    private readonly initiateReauthorizationUseCase: InitiateReauthorizationUseCase,
    private readonly listExternalConnectionsUseCase: ListExternalConnectionsUseCase,
    private readonly disconnectExternalConnectionUseCase: DisconnectExternalConnectionUseCase,
    private readonly browseRemoteFolderUseCase: BrowseRemoteFolderUseCase,
    private readonly importRemoteFileUseCase: ImportRemoteFileUseCase,
    private readonly exportDocumentVersionUseCase: ExportDocumentVersionUseCase,
    private readonly createCalendarEventForTenderUseCase: CreateCalendarEventForTenderUseCase,
    private readonly testConnectionUseCase: TestConnectionUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    return this.listExternalConnectionsUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async initiate(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Body(new ZodValidationPipe(InitiateConnectionBodySchema)) body: InitiateConnectionBody) {
    return this.initiateOAuthConnectionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      provider: body.provider as ConnectorProvider,
      name: body.name,
      allowedClientAccountIds: body.allowedClientAccountIds,
    });
  }

  @Post(":id/reauthorize")
  @HttpCode(HttpStatus.OK)
  async reauthorize(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) connectionId: string) {
    return this.initiateReauthorizationUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, connectionId });
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) connectionId: string) {
    await this.disconnectExternalConnectionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, connectionId });
  }

  @Get(":id/browse")
  @HttpCode(HttpStatus.OK)
  async browse(@CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) connectionId: string, @Query(new ZodValidationPipe(BrowseFolderQuerySchema)) query: BrowseFolderQuery) {
    return this.browseRemoteFolderUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, connectionId, containerId: query.containerId, folderId: query.folderId, clientAccountId: query.clientAccountId });
  }

  @Post(":id/import")
  @HttpCode(HttpStatus.CREATED)
  async importFile(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) connectionId: string, @Body(new ZodValidationPipe(ImportFileBodySchema)) body: ImportFileBody) {
    return this.importRemoteFileUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      connectionId,
      containerId: body.containerId,
      fileId: body.fileId,
      mimeType: body.mimeType,
      clientAccountId: body.clientAccountId,
      tenderId: body.tenderId,
      targetDocumentId: body.targetDocumentId,
      title: body.title,
    });
  }

  @Post(":id/export")
  @HttpCode(HttpStatus.CREATED)
  async exportVersion(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) connectionId: string, @Body(new ZodValidationPipe(ExportVersionBodySchema)) body: ExportVersionBody) {
    return this.exportDocumentVersionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      connectionId,
      containerId: body.containerId,
      folderId: body.folderId,
      documentId: body.documentId,
      versionId: body.versionId,
      clientAccountId: body.clientAccountId,
      filename: body.filename,
    });
  }

  @Post(":id/test")
  @HttpCode(HttpStatus.OK)
  async testConnection(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) connectionId: string) {
    return this.testConnectionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, connectionId });
  }

  @Post(":id/calendar-events")
  @HttpCode(HttpStatus.CREATED)
  async createCalendarEvent(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) connectionId: string, @Body(new ZodValidationPipe(CreateCalendarEventBodySchema)) body: CreateCalendarEventBody) {
    return this.createCalendarEventForTenderUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, connectionId, tenderId: body.tenderId });
  }
}
