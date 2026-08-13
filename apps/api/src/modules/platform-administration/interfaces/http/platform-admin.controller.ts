import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { GetPlatformMetricsUseCase } from "../../application/use-cases/get-platform-metrics.use-case";
import { GetPlatformOrganizationUseCase } from "../../application/use-cases/get-platform-organization.use-case";
import { ListPlatformAuditLogsUseCase } from "../../application/use-cases/list-platform-audit-logs.use-case";
import { ListPlatformDeadLetterEventsUseCase } from "../../application/use-cases/list-platform-dead-letter-events.use-case";
import { ListPlatformOrganizationsUseCase } from "../../application/use-cases/list-platform-organizations.use-case";
import { ListPlatformUsersUseCase } from "../../application/use-cases/list-platform-users.use-case";
import { ReactivatePlatformOrganizationUseCase } from "../../application/use-cases/reactivate-platform-organization.use-case";
import { SuspendPlatformOrganizationUseCase } from "../../application/use-cases/suspend-platform-organization.use-case";
import { CurrentPlatformContext } from "./current-platform-context.decorator";
import { PlatformAccessGuard } from "./platform-access.guard";
import type { PlatformContext } from "./platform-access.guard";
import { PlatformAdministrationErrorFilter } from "./platform-administration-error.filter";
import {
  presentPage,
  presentPlatformAuditLog,
  presentPlatformDeadLetterEvent,
  presentPlatformMetrics,
  presentPlatformOrganization,
  presentPlatformUser,
  type PageResponse,
  type PlatformAuditLogResponse,
  type PlatformDeadLetterEventResponse,
  type PlatformMetricsResponse,
  type PlatformOrganizationResponse,
  type PlatformUserResponse,
} from "./presenters";
import {
  ListAuditLogsQuerySchema,
  ListDeadLetterEventsQuerySchema,
  ListOrganizationsQuerySchema,
  ListUsersQuerySchema,
  OrganizationIdParamSchema,
  SuspendOrganizationBodySchema,
  type ListAuditLogsQuery,
  type ListDeadLetterEventsQuery,
  type ListOrganizationsQuery,
  type ListUsersQuery,
  type SuspendOrganizationBody,
} from "./schemas";

@Controller("admin")
@UseFilters(PlatformAdministrationErrorFilter)
@UseGuards(AuthenticatedGuard, PlatformAccessGuard)
export class PlatformAdminController {
  constructor(
    private readonly listPlatformOrganizationsUseCase: ListPlatformOrganizationsUseCase,
    private readonly getPlatformOrganizationUseCase: GetPlatformOrganizationUseCase,
    private readonly suspendPlatformOrganizationUseCase: SuspendPlatformOrganizationUseCase,
    private readonly reactivatePlatformOrganizationUseCase: ReactivatePlatformOrganizationUseCase,
    private readonly listPlatformUsersUseCase: ListPlatformUsersUseCase,
    private readonly listPlatformAuditLogsUseCase: ListPlatformAuditLogsUseCase,
    private readonly getPlatformMetricsUseCase: GetPlatformMetricsUseCase,
    private readonly listPlatformDeadLetterEventsUseCase: ListPlatformDeadLetterEventsUseCase,
  ) {}

  @Get("organizations")
  @HttpCode(HttpStatus.OK)
  async listOrganizations(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Query(new ZodValidationPipe(ListOrganizationsQuerySchema)) query: ListOrganizationsQuery,
  ): Promise<PageResponse<PlatformOrganizationResponse>> {
    const result = await this.listPlatformOrganizationsUseCase.execute({
      actorRole: platformContext.role,
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
    });

    return presentPage(result.items.map(presentPlatformOrganization), result.nextCursor);
  }

  @Get("organizations/:id")
  @HttpCode(HttpStatus.OK)
  async getOrganization(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("id", new ZodValidationPipe(OrganizationIdParamSchema)) id: string,
  ): Promise<PlatformOrganizationResponse> {
    const result = await this.getPlatformOrganizationUseCase.execute({
      actorRole: platformContext.role,
      organizationId: id,
    });

    return presentPlatformOrganization(result);
  }

  @Post("organizations/:id/suspend")
  @HttpCode(HttpStatus.OK)
  async suspendOrganization(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("id", new ZodValidationPipe(OrganizationIdParamSchema)) id: string,
    @Body(new ZodValidationPipe(SuspendOrganizationBodySchema)) body: SuspendOrganizationBody,
    @Req() request: RequestWithId,
  ): Promise<PlatformOrganizationResponse> {
    const result = await this.suspendPlatformOrganizationUseCase.execute({
      actorId: actor.userId,
      actorRole: platformContext.role,
      organizationId: id,
      reason: body.reason,
      requestId: request.id,
    });

    return presentPlatformOrganization(result);
  }

  @Post("organizations/:id/reactivate")
  @HttpCode(HttpStatus.OK)
  async reactivateOrganization(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("id", new ZodValidationPipe(OrganizationIdParamSchema)) id: string,
    @Req() request: RequestWithId,
  ): Promise<PlatformOrganizationResponse> {
    const result = await this.reactivatePlatformOrganizationUseCase.execute({
      actorId: actor.userId,
      actorRole: platformContext.role,
      organizationId: id,
      requestId: request.id,
    });

    return presentPlatformOrganization(result);
  }

  @Get("users")
  @HttpCode(HttpStatus.OK)
  async listUsers(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Query(new ZodValidationPipe(ListUsersQuerySchema)) query: ListUsersQuery,
  ): Promise<PageResponse<PlatformUserResponse>> {
    const result = await this.listPlatformUsersUseCase.execute({
      actorRole: platformContext.role,
      cursor: query.cursor,
      limit: query.limit,
      status: query.status,
    });

    return presentPage(result.items.map(presentPlatformUser), result.nextCursor);
  }

  @Get("audit-logs")
  @HttpCode(HttpStatus.OK)
  async listAuditLogs(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Query(new ZodValidationPipe(ListAuditLogsQuerySchema)) query: ListAuditLogsQuery,
  ): Promise<PageResponse<PlatformAuditLogResponse>> {
    const result = await this.listPlatformAuditLogsUseCase.execute({
      actorRole: platformContext.role,
      cursor: query.cursor,
      limit: query.limit,
    });

    return presentPage(result.items.map(presentPlatformAuditLog), result.nextCursor);
  }

  @Get("metrics")
  @HttpCode(HttpStatus.OK)
  async getMetrics(@CurrentPlatformContext() platformContext: PlatformContext): Promise<PlatformMetricsResponse> {
    const result = await this.getPlatformMetricsUseCase.execute({ actorRole: platformContext.role });

    return presentPlatformMetrics(result);
  }

  /** Sprint 21 (hardening) — mission PARTIE F/PARTIE Q : diagnostiquer un backlog Outbox
   *  (`GET admin/metrics` donne déjà le COMPTE via `/metrics` Prometheus, mission §57 —
   *  cet endpoint donne le DÉTAIL nécessaire à une investigation d'incident). */
  @Get("outbox/dead-letters")
  @HttpCode(HttpStatus.OK)
  async listDeadLetterEvents(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Query(new ZodValidationPipe(ListDeadLetterEventsQuerySchema)) query: ListDeadLetterEventsQuery,
  ): Promise<PageResponse<PlatformDeadLetterEventResponse>> {
    const result = await this.listPlatformDeadLetterEventsUseCase.execute({
      actorRole: platformContext.role,
      cursor: query.cursor,
      limit: query.limit,
      organizationId: query.organizationId,
    });

    return presentPage(result.items.map(presentPlatformDeadLetterEvent), result.nextCursor);
  }
}
