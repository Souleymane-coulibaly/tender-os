import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toNotificationSummary } from "../../application/dtos";
import { CountUnreadNotificationsUseCase } from "../../application/use-cases/count-unread-notifications.use-case";
import { ListNotificationsUseCase } from "../../application/use-cases/list-notifications.use-case";
import { MarkAllNotificationsReadUseCase } from "../../application/use-cases/mark-all-notifications-read.use-case";
import { MarkNotificationReadUseCase } from "../../application/use-cases/mark-notification-read.use-case";
import { NotificationsErrorFilter } from "./notifications-error.filter";
import { IdParamSchema, ListNotificationsQuerySchema, type ListNotificationsQuery } from "./schemas";

/** Mission §37/§38/§99/§100 — centre de notifications minimal : jamais un filtre RBAC, l'identité
 *  de l'acteur EST le périmètre (chacun ne voit que ses propres notifications). */
@Controller("notifications")
@UseFilters(NotificationsErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class NotificationsController {
  constructor(
    private readonly listNotificationsUseCase: ListNotificationsUseCase,
    private readonly countUnreadNotificationsUseCase: CountUnreadNotificationsUseCase,
    private readonly markNotificationReadUseCase: MarkNotificationReadUseCase,
    private readonly markAllNotificationsReadUseCase: MarkAllNotificationsReadUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Query(new ZodValidationPipe(ListNotificationsQuerySchema)) query: ListNotificationsQuery,
  ) {
    const page = await this.listNotificationsUseCase.execute({ organizationId: membership.organizationId, userId: actor.userId, unreadOnly: query.unreadOnly, cursor: query.cursor, limit: query.limit });
    return { items: page.items.map(toNotificationSummary), nextCursor: page.nextCursor };
  }

  @Get("unread-count")
  @HttpCode(HttpStatus.OK)
  async unreadCount(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext) {
    const count = await this.countUnreadNotificationsUseCase.execute({ organizationId: membership.organizationId, userId: actor.userId });
    return { count };
  }

  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) notificationId: string) {
    await this.markNotificationReadUseCase.execute({ organizationId: membership.organizationId, userId: actor.userId, notificationId });
    return { read: true };
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentActor() actor: AuthenticatedActor, @CurrentMembershipContext() membership: MembershipContext) {
    await this.markAllNotificationsReadUseCase.execute({ organizationId: membership.organizationId, userId: actor.userId });
    return { read: true };
  }
}
