import { Controller, Get, Param, UseFilters, UseGuards } from "@nestjs/common";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { GetTenderCockpitUseCase } from "../../application/use-cases/get-tender-cockpit.use-case";
import { CockpitErrorFilter } from "./cockpit-error.filter";
import { IdParamSchema } from "./schemas";

/** Mission Sprint 8A.2 — Cockpit Bid Manager : vue d'ensemble backend-driven de l'écran Tender,
 *  jamais recalculée côté frontend. */
@Controller("tenders/:tenderId/cockpit")
@UseFilters(CockpitErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class CockpitController {
  constructor(private readonly getTenderCockpitUseCase: GetTenderCockpitUseCase) {}

  @Get()
  async get(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
  ) {
    return this.getTenderCockpitUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
    });
  }
}
