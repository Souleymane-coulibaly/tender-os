import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { CreateWebhookSubscriptionUseCase } from "../../application/use-cases/create-webhook-subscription.use-case";
import { DeleteWebhookSubscriptionUseCase } from "../../application/use-cases/delete-webhook-subscription.use-case";
import { GetWebhookSubscriptionUseCase } from "../../application/use-cases/get-webhook-subscription.use-case";
import { ListWebhookDeliveriesUseCase } from "../../application/use-cases/list-webhook-deliveries.use-case";
import { ListWebhookSubscriptionsUseCase } from "../../application/use-cases/list-webhook-subscriptions.use-case";
import { RetryWebhookDeliveryUseCase } from "../../application/use-cases/retry-webhook-delivery.use-case";
import { SendTestWebhookEventUseCase } from "../../application/use-cases/send-test-webhook-event.use-case";
import { SetWebhookSubscriptionStatusUseCase } from "../../application/use-cases/set-webhook-subscription-status.use-case";
import { UpdateWebhookSubscriptionUseCase } from "../../application/use-cases/update-webhook-subscription.use-case";
import { IntegrationsErrorFilter } from "./integrations-error.filter";
import {
  CreateWebhookSubscriptionBodySchema,
  IdParamSchema,
  ListDeliveriesQuerySchema,
  SetWebhookStatusBodySchema,
  UpdateWebhookSubscriptionBodySchema,
  type CreateWebhookSubscriptionBody,
  type ListDeliveriesQuery,
  type SetWebhookStatusBody,
  type UpdateWebhookSubscriptionBody,
} from "./schemas";

/** Mission §53-58 — écran "Webhooks" : create/update/status/delete/list/detail/deliveries/retry/
 *  test. Le secret n'est renvoyé QU'À LA CRÉATION (mission §30), jamais ensuite. */
@Controller("integrations/webhooks")
@UseFilters(IntegrationsErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class WebhooksController {
  constructor(
    private readonly createWebhookSubscriptionUseCase: CreateWebhookSubscriptionUseCase,
    private readonly updateWebhookSubscriptionUseCase: UpdateWebhookSubscriptionUseCase,
    private readonly setWebhookSubscriptionStatusUseCase: SetWebhookSubscriptionStatusUseCase,
    private readonly deleteWebhookSubscriptionUseCase: DeleteWebhookSubscriptionUseCase,
    private readonly listWebhookSubscriptionsUseCase: ListWebhookSubscriptionsUseCase,
    private readonly getWebhookSubscriptionUseCase: GetWebhookSubscriptionUseCase,
    private readonly listWebhookDeliveriesUseCase: ListWebhookDeliveriesUseCase,
    private readonly retryWebhookDeliveryUseCase: RetryWebhookDeliveryUseCase,
    private readonly sendTestWebhookEventUseCase: SendTestWebhookEventUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(@CurrentMembershipContext() membership: MembershipContext) {
    return this.listWebhookSubscriptionsUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Body(new ZodValidationPipe(CreateWebhookSubscriptionBodySchema)) body: CreateWebhookSubscriptionBody,
    @Req() request: RequestWithId,
  ) {
    const result = await this.createWebhookSubscriptionUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      endpointUrl: body.endpointUrl,
      description: body.description,
      events: body.events,
      allowedClientAccountIds: body.allowedClientAccountIds,
      requestId: request.id,
    });

    return {
      secret: result.secret,
      subscription: { id: result.subscription.id, endpointUrl: result.subscription.endpointUrl, events: result.subscription.events, status: result.subscription.status },
    };
  }

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async get(@CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) subscriptionId: string) {
    return this.getWebhookSubscriptionUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, subscriptionId });
  }

  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async update(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subscriptionId: string,
    @Body(new ZodValidationPipe(UpdateWebhookSubscriptionBodySchema)) body: UpdateWebhookSubscriptionBody,
    @Req() request: RequestWithId,
  ) {
    return this.updateWebhookSubscriptionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subscriptionId, ...body, requestId: request.id });
  }

  @Post(":id/status")
  @HttpCode(HttpStatus.OK)
  async setStatus(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subscriptionId: string,
    @Body(new ZodValidationPipe(SetWebhookStatusBodySchema)) body: SetWebhookStatusBody,
    @Req() request: RequestWithId,
  ) {
    await this.setWebhookSubscriptionStatusUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subscriptionId, enabled: body.enabled, requestId: request.id });
    return { enabled: body.enabled };
  }

  @Post(":id/delete")
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subscriptionId: string,
    @Req() request: RequestWithId,
  ) {
    await this.deleteWebhookSubscriptionUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subscriptionId, requestId: request.id });
    return { deleted: true };
  }

  @Get(":id/deliveries")
  @HttpCode(HttpStatus.OK)
  async listDeliveries(
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subscriptionId: string,
    @Query(new ZodValidationPipe(ListDeliveriesQuerySchema)) query: ListDeliveriesQuery,
  ) {
    return this.listWebhookDeliveriesUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, subscriptionId, limit: query.limit, cursor: query.cursor });
  }

  @Post("deliveries/:deliveryId/retry")
  @HttpCode(HttpStatus.OK)
  async retryDelivery(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("deliveryId", new ZodValidationPipe(IdParamSchema)) deliveryId: string,
    @Req() request: RequestWithId,
  ) {
    return this.retryWebhookDeliveryUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, deliveryId, requestId: request.id });
  }

  @Post(":id/test")
  @HttpCode(HttpStatus.CREATED)
  async sendTest(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("id", new ZodValidationPipe(IdParamSchema)) subscriptionId: string,
    @Req() request: RequestWithId,
  ) {
    return this.sendTestWebhookEventUseCase.execute({ organizationId: membership.organizationId, actorId: actor.userId, actorRole: membership.role, subscriptionId, requestId: request.id });
  }
}
