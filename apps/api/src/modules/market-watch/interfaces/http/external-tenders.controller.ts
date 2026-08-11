import { Controller, Get, HttpCode, HttpStatus, Param, UseFilters, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toExternalTenderSummary } from "../../application/dtos";
import { GetExternalTenderUseCase } from "../../application/use-cases/get-external-tender.use-case";
import { MarketWatchErrorFilter } from "./market-watch-error.filter";
import { IdParamSchema } from "./schemas";

/** Mission §93 — détail d'un marché externe (accessible depuis un match ou une notification). */
@Controller("market-watch/external-tenders")
@UseFilters(MarketWatchErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class ExternalTendersController {
  constructor(private readonly getExternalTenderUseCase: GetExternalTenderUseCase) {}

  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async get(@CurrentMembershipContext() membership: MembershipContext, @Param("id", new ZodValidationPipe(IdParamSchema)) externalTenderId: string) {
    const tender = await this.getExternalTenderUseCase.execute({ organizationId: membership.organizationId, actorRole: membership.role, externalTenderId });
    return toExternalTenderSummary(tender);
  }
}
