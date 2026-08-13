import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard } from "../../../identity";
import { CurrentPlatformContext, PlatformAccessGuard, type PlatformContext } from "../../../platform-administration";
import type { EntitlementFeature } from "../../domain/entitlement-feature";
import type { QuotaType } from "../../domain/quota-type";
import { CreateEntitlementOverrideUseCase } from "../../application/use-cases/create-entitlement-override.use-case";
import { ListEntitlementOverridesUseCase } from "../../application/use-cases/list-entitlement-overrides.use-case";
import { RevokeEntitlementOverrideUseCase } from "../../application/use-cases/revoke-entitlement-override.use-case";
import { BillingErrorFilter } from "./billing-error.filter";
import {
  CreateEntitlementOverrideBodySchema,
  ListEntitlementOverridesQuerySchema,
  OrganizationIdParamSchema,
  OverrideIdParamSchema,
  type CreateEntitlementOverrideBody,
  type ListEntitlementOverridesQuery,
} from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

function presentOverride(override: { toProps(): Record<string, unknown> }) {
  const props = override.toProps();
  return {
    id: props.id,
    organizationId: props.organizationId,
    feature: props.feature ?? null,
    featureEnabled: props.featureEnabled ?? null,
    quota: props.quota ?? null,
    quotaLimit: props.quotaLimit ?? null,
    reason: props.reason,
    expiresAt: props.expiresAt ?? null,
    revokedAt: props.revokedAt ?? null,
    createdAt: props.createdAt,
  };
}

/**
 * V2 Sprint 22 (billing, étape 22A, correctif audit Codex P1-02) — mission §32 "POINT BLOQUANT" :
 * Platform Admin only. `PlatformAccessGuard` refuse déjà tout acteur sans enregistrement
 * `PlatformAdministrator` (Organization Admin/Owner/Contributor n'en ont jamais un) ; la capacité
 * fine (MANAGE vs READ, SUPPORT en lecture seule) est vérifiée DANS chaque use case
 * (`assertHasCapability`), jamais seulement au niveau du guard.
 */
@Controller("admin/organizations/:organizationId/entitlement-overrides")
@UseFilters(BillingErrorFilter)
@UseGuards(AuthenticatedGuard, PlatformAccessGuard)
export class EntitlementOverridesController {
  constructor(
    private readonly createEntitlementOverrideUseCase: CreateEntitlementOverrideUseCase,
    private readonly revokeEntitlementOverrideUseCase: RevokeEntitlementOverrideUseCase,
    private readonly listEntitlementOverridesUseCase: ListEntitlementOverridesUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Query(new ZodValidationPipe(ListEntitlementOverridesQuerySchema)) query: ListEntitlementOverridesQuery,
  ) {
    const page = await this.listEntitlementOverridesUseCase.execute({
      organizationId,
      cursor: query.cursor,
      limit: query.limit,
      actorPlatformRole: platformContext.role,
    });
    return { items: page.items.map(presentOverride), nextCursor: page.nextCursor };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Body(new ZodValidationPipe(CreateEntitlementOverrideBodySchema)) body: CreateEntitlementOverrideBody,
  ) {
    const override = await this.createEntitlementOverrideUseCase.execute({
      organizationId,
      feature: body.feature as EntitlementFeature | undefined,
      featureEnabled: body.featureEnabled,
      quota: body.quota as QuotaType | undefined,
      quotaLimit: body.quotaLimit,
      reason: body.reason,
      expiresAt: body.expiresAt,
      actorPlatformAdministratorId: platformContext.administratorId,
      actorPlatformRole: platformContext.role,
      occurredAt: new Date(),
    });
    return presentOverride(override);
  }

  @Post(":overrideId/revoke")
  @HttpCode(HttpStatus.OK)
  async revoke(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Param("overrideId", new ZodValidationPipe(OverrideIdParamSchema)) overrideId: string,
  ) {
    await this.revokeEntitlementOverrideUseCase.execute({
      organizationId,
      overrideId,
      actorPlatformAdministratorId: platformContext.administratorId,
      actorPlatformRole: platformContext.role,
      occurredAt: new Date(),
    });
    return { revoked: true };
  }
}
