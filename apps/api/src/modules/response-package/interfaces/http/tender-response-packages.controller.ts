import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import type { RequestWithId } from "../../../../shared-kernel/request-id.middleware";
import { ZodValidationPipe } from "../../../../shared-kernel/zod-validation.pipe";
import { AuthenticatedGuard, CurrentActor, type AuthenticatedActor } from "../../../identity";
import { CurrentMembershipContext, OrganizationMembershipGuard, type MembershipContext } from "../../../memberships";
import { toResponsePackageSummary } from "../../application/dtos";
import { CreateResponsePackageUseCase } from "../../application/use-cases/create-response-package.use-case";
import { ListResponsePackagesUseCase } from "../../application/use-cases/list-response-packages.use-case";
import { ResponsePackageErrorFilter } from "./response-package-error.filter";
import { CreateResponsePackageBodySchema, IdParamSchema, type CreateResponsePackageBody } from "./schemas";

/** Mission route conceptuelle `POST /tenders/:tenderId/response-packages` — même convention de
 *  préfixe que `TenderPricingSchedulesController`/`TenderTechnicalMemosController`. */
@Controller("tenders")
@UseFilters(ResponsePackageErrorFilter)
@UseGuards(AuthenticatedGuard, OrganizationMembershipGuard)
export class TenderResponsePackagesController {
  constructor(
    private readonly createResponsePackageUseCase: CreateResponsePackageUseCase,
    private readonly listResponsePackagesUseCase: ListResponsePackagesUseCase,
  ) {}

  @Get(":tenderId/response-packages")
  @HttpCode(HttpStatus.OK)
  async list(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Query("lotId") lotId?: string,
  ) {
    const packages = await this.listResponsePackagesUseCase.execute({
      organizationId: membership.organizationId,
      tenderId,
      actorId: actor.userId,
      actorRole: membership.role,
      lotId: lotId && IdParamSchema.safeParse(lotId).success ? lotId : undefined,
    });
    return packages.map(toResponsePackageSummary);
  }

  @Post(":tenderId/response-packages")
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentActor() actor: AuthenticatedActor,
    @CurrentMembershipContext() membership: MembershipContext,
    @Param("tenderId", new ZodValidationPipe(IdParamSchema)) tenderId: string,
    @Body(new ZodValidationPipe(CreateResponsePackageBodySchema)) body: CreateResponsePackageBody,
    @Req() request: RequestWithId,
  ) {
    const pkg = await this.createResponsePackageUseCase.execute({
      organizationId: membership.organizationId,
      actorId: actor.userId,
      actorRole: membership.role,
      tenderId,
      lotId: body.lotId,
      requestId: request.id,
    });
    return toResponsePackageSummary(pkg);
  }
}
