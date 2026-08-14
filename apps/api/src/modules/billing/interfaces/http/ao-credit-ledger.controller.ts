import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard } from "../../../identity";
import { assertHasCapability, CurrentPlatformContext, PlatformAccessGuard, PlatformCapability, type PlatformContext } from "../../../platform-administration";
import { AdjustAoCreditsUseCase } from "../../application/use-cases/adjust-ao-credits.use-case";
import { GetAoCreditBalanceUseCase } from "../../application/use-cases/get-ao-credit-balance.use-case";
import { ListAoCreditLedgerUseCase } from "../../application/use-cases/list-ao-credit-ledger.use-case";
import { ReverseAoCreditConsumptionUseCase } from "../../application/use-cases/reverse-ao-credit-consumption.use-case";
import { BillingErrorFilter } from "./billing-error.filter";
import {
  AdjustAoCreditsBodySchema,
  ListAoCreditLedgerQuerySchema,
  OrganizationIdParamSchema,
  ReverseAoCreditConsumptionBodySchema,
  type AdjustAoCreditsBody,
  type ListAoCreditLedgerQuery,
  type ReverseAoCreditConsumptionBody,
} from "./schemas";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";

/**
 * V2 Sprint 22 (billing, étape 22B) — mission §31/§48 "Organization Admin ne peut pas modifier son
 * propre solde" : Platform Admin only, même mécanisme que `EntitlementOverridesController` (22A).
 */
@Controller("admin/organizations/:organizationId/ao-credits")
@UseFilters(BillingErrorFilter)
@UseGuards(AuthenticatedGuard, PlatformAccessGuard)
export class AoCreditLedgerController {
  constructor(
    private readonly getAoCreditBalanceUseCase: GetAoCreditBalanceUseCase,
    private readonly listAoCreditLedgerUseCase: ListAoCreditLedgerUseCase,
    private readonly adjustAoCreditsUseCase: AdjustAoCreditsUseCase,
    private readonly reverseAoCreditConsumptionUseCase: ReverseAoCreditConsumptionUseCase,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getBalance(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
  ) {
    assertHasCapability(platformContext.role, PlatformCapability.AoCreditsRead);
    const balance = await this.getAoCreditBalanceUseCase.execute(organizationId);
    return { balance };
  }

  @Get("ledger")
  @HttpCode(HttpStatus.OK)
  async listLedger(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Query(new ZodValidationPipe(ListAoCreditLedgerQuerySchema)) query: ListAoCreditLedgerQuery,
  ) {
    const page = await this.listAoCreditLedgerUseCase.execute({ organizationId, cursor: query.cursor, limit: query.limit, actorPlatformRole: platformContext.role });
    return { items: page.items, nextCursor: page.nextCursor };
  }

  @Post("adjust")
  @HttpCode(HttpStatus.CREATED)
  async adjust(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Body(new ZodValidationPipe(AdjustAoCreditsBodySchema)) body: AdjustAoCreditsBody,
  ) {
    const entry = await this.adjustAoCreditsUseCase.execute({
      organizationId,
      amount: body.amount,
      reason: body.reason,
      actorPlatformAdministratorId: platformContext.administratorId,
      actorPlatformRole: platformContext.role,
      occurredAt: new Date(),
    });
    return entry;
  }

  @Post("reverse")
  @HttpCode(HttpStatus.CREATED)
  async reverse(
    @CurrentPlatformContext() platformContext: PlatformContext,
    @Param("organizationId", new ZodValidationPipe(OrganizationIdParamSchema)) organizationId: string,
    @Body(new ZodValidationPipe(ReverseAoCreditConsumptionBodySchema)) body: ReverseAoCreditConsumptionBody,
  ) {
    const entry = await this.reverseAoCreditConsumptionUseCase.execute({
      organizationId,
      tenderId: body.tenderId,
      reason: body.reason,
      actorPlatformAdministratorId: platformContext.administratorId,
      actorPlatformRole: platformContext.role,
      occurredAt: new Date(),
    });
    return entry;
  }
}
