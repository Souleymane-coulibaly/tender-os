import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ArchiveConversationUseCase } from "../../application/use-cases/archive-conversation.use-case";
import { CreateConversationUseCase } from "../../application/use-cases/create-conversation.use-case";
import { GetConversationUseCase } from "../../application/use-cases/get-conversation.use-case";
import { ListConversationsUseCase } from "../../application/use-cases/list-conversations.use-case";
import { ListMessagesUseCase } from "../../application/use-cases/list-messages.use-case";
import { SendMessageUseCase } from "../../application/use-cases/send-message.use-case";
import { ChatErrorFilter } from "./chat-error.filter";
import {
  CreateConversationBodySchema,
  IdParamSchema,
  ListConversationsQuerySchema,
  SendMessageBodySchema,
  type CreateConversationBody,
  type ListConversationsQuery,
  type SendMessageBody,
} from "./schemas";

/** V2 Sprint 9 (Chat IA conversationnel) — même préfixe `tenders` et même convention de sous-
 *  ressource que `WorkspaceController`/`ChecklistIntelligenceController` : `/tenders/:id/...`,
 *  jamais de ressource top-level bare. */
@Controller("tenders")
@UseFilters(ChatErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ChatController {
  constructor(
    private readonly createConversationUseCase: CreateConversationUseCase,
    private readonly getConversationUseCase: GetConversationUseCase,
    private readonly listConversationsUseCase: ListConversationsUseCase,
    private readonly archiveConversationUseCase: ArchiveConversationUseCase,
    private readonly listMessagesUseCase: ListMessagesUseCase,
    private readonly sendMessageUseCase: SendMessageUseCase,
  ) {}

  @Get(":tenderId/conversations")
  @HttpCode(HttpStatus.OK)
  async listConversations(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query(new ZodValidationPipe(ListConversationsQuerySchema)) query: ListConversationsQuery,
  ) {
    return this.listConversationsUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...query });
  }

  @Post(":tenderId/conversations")
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateConversationBodySchema)) body: CreateConversationBody,
    @Req() request: RequestWithId,
  ) {
    return this.createConversationUseCase.execute({ organizationId: membership.organizationId, tenderId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }

  @Get(":tenderId/conversations/:conversationId")
  @HttpCode(HttpStatus.OK)
  async getConversation(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("conversationId", new ZodValidationPipe(IdParamSchema)) conversationId: string,
  ) {
    return this.getConversationUseCase.execute({ organizationId: membership.organizationId, tenderId, conversationId, actorId: actor.userId, actorRole: membership.role });
  }

  @Post(":tenderId/conversations/:conversationId/archive")
  @HttpCode(HttpStatus.OK)
  async archiveConversation(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("conversationId", new ZodValidationPipe(IdParamSchema)) conversationId: string,
    @Req() request: RequestWithId,
  ) {
    return this.archiveConversationUseCase.execute({ organizationId: membership.organizationId, tenderId, conversationId, actorId: actor.userId, actorRole: membership.role, requestId: request.id });
  }

  @Get(":tenderId/conversations/:conversationId/messages")
  @HttpCode(HttpStatus.OK)
  async listMessages(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("conversationId", new ZodValidationPipe(IdParamSchema)) conversationId: string,
  ) {
    return this.listMessagesUseCase.execute({ organizationId: membership.organizationId, tenderId, conversationId, actorId: actor.userId, actorRole: membership.role });
  }

  /** Synchrone (mission décision §1) — répond seulement une fois la génération terminée
   *  (COMPLETED ou FAILED), jamais un accusé de réception suivi d'un streaming. */
  @Post(":tenderId/conversations/:conversationId/messages")
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Param("conversationId", new ZodValidationPipe(IdParamSchema)) conversationId: string,
    @Body(new ZodValidationPipe(SendMessageBodySchema)) body: SendMessageBody,
    @Req() request: RequestWithId,
  ) {
    return this.sendMessageUseCase.execute({ organizationId: membership.organizationId, tenderId, conversationId, actorId: actor.userId, actorRole: membership.role, ...body, requestId: request.id });
  }
}
